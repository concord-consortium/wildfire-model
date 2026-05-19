import {
  BaseReading, ConsumedEvent, EngineConstructionError, EngineError, FactorVariableImpl, ReadingUpdate,
  RuleSet, SimPropImpl, TemporalVariableChange, TemporalVariableImpl,
} from "./types";
import { Expression, parse, ParseError } from "./parser";
import { generateSessionId } from "./session-id";
import { validateDefaultsPath } from "./validate-defaults";
import { walkReferences } from "./walk-references";
import { findLast } from "./find-last";
import { runtimeType } from "./runtime-type";

export interface EngineOpts<TReading extends BaseReading, TDefaults = unknown> {
  ruleSet?: RuleSet<TDefaults>;
  requestedRuleSetId?: string;
  factorVariables: Record<string, FactorVariableImpl<unknown, TReading, TDefaults>>;
  simProps: Record<string, SimPropImpl<TReading, TDefaults>>;
  translate: (event: ConsumedEvent, sessionId: string) =>
    | { kind: "trigger"; reading: TReading }
    | { kind: "modifier"; update: ReadingUpdate }
    | { kind: "no-op" };
  runStartTriggers?: string[];
  temporalVariables?: Record<string, TemporalVariableImpl<unknown>>;
  initialTemporalValues?: Record<string, unknown>;
  // Used by the bridge's EngineConstructionError catch path to inject caught
  // construction errors into a placeholder engine without post-construction
  // mutation. When provided AND non-empty, the synthetic `load-failure:
  // missing-rule-set` entry from the `ruleSet === undefined` branch is
  // suppressed — the caller-supplied errors are the authoritative diagnostic.
  // An empty `initialErrors` array falls back to the synthetic entry so the
  // load-blocking sentinel is never silently dropped.
  initialErrors?: EngineError[];
}

// Sentinel for AST cache slots that failed to parse.
export const PARSE_ERROR_SENTINEL = Symbol("parse-error");
export type CachedAst = Expression | typeof PARSE_ERROR_SENTINEL;

export class Engine<TReading extends BaseReading, TDefaults = unknown> {
  readings: TReading[] = [];
  errors: EngineError[] = [];
  sessionId: string;
  ruleSet: RuleSet<TDefaults> | undefined = undefined;
  requestedRuleSetId: string | undefined;
  factorVariables: Record<string, FactorVariableImpl<unknown, TReading, TDefaults>>;
  simProps: Record<string, SimPropImpl<TReading, TDefaults>>;
  // Substrate-internal: cached parsed ASTs per category id. Per Req 12 the
  // matching evaluator never re-parses at runtime.
  parsedExpressions: Map<number, CachedAst> = new Map();
  // Per-trigger union of ambient state keys collected from referenced impls.
  ambientKeysByTrigger: Map<string, Set<string>> = new Map();
  // Impls whose declared `requiredDefaults` paths don't all resolve (per EXT-18).
  // Used by step-4's `evaluateForRender` to suppress nonsensical comparisons
  // against `undefined` defaults fields without throwing.
  implsWithIncompleteDefaults: Set<string> = new Set();
  // Names of impls that some category expression references. Step 4 uses this
  // to scope ambient-state validation to only referenced impls (Finding 15 /
  // Req 11a "referenced only" rule).
  protected referencedImplNames: Set<string> = new Set();

  temporalVariables: Record<string, TemporalVariableImpl<unknown>> = {};
  temporalValues: Record<string, unknown> = {};
  observed: Record<string, boolean> = {};
  // Hoisted at construction so the substrate's hot path (consume() + R5a seed
  // loop) iterates a stable array without re-allocating per event. Public-readable
  // so the sidebar can iterate the same memoized array on every snapshot tick
  // without re-allocating Object.keys(...) per render.
  temporalVariableNames: string[] = [];

  // Step 4's consume pipeline reads these directly off opts.
  protected translate: EngineOpts<TReading, TDefaults>["translate"];
  protected runStartTriggers: string[] | undefined;

  // Latest reading whose triggeredBy is in runStartTriggers (i.e., the most recent
  // "witness" reading for sim-props that bind via WITH). Returns undefined when no
  // run-start reading has been recorded yet. Walks backwards so we stop at the first
  // match instead of scanning the full readings array.
  get latestRunStartReading(): TReading | undefined {
    if (!this.runStartTriggers || this.runStartTriggers.length === 0) {
      return this.readings.length > 0 ? this.readings[this.readings.length - 1] : undefined;
    }
    const triggers = new Set(this.runStartTriggers);
    for (let i = this.readings.length - 1; i >= 0; i--) {
      if (triggers.has(this.readings[i].triggeredBy)) return this.readings[i];
    }
    return undefined;
  }
  private listeners: Set<() => void> = new Set();
  private snapshotVersion = 0;
  private notifying = false;
  private pendingNotify = false;

  constructor(opts: EngineOpts<TReading, TDefaults>) {
    this.sessionId = generateSessionId();
    this.requestedRuleSetId = opts.requestedRuleSetId;
    this.factorVariables = opts.factorVariables;
    this.simProps = opts.simProps;
    this.translate = opts.translate;
    this.runStartTriggers = opts.runStartTriggers;

    if (opts.ruleSet === undefined) {
      // Maintenance gate: this branch must remain throw-free.
      // engine-singleton.ts catches EngineConstructionError and constructs a
      // placeholder Engine via this same `ruleSet === undefined` path so the
      // sidebar can render structured errors. The placeholder passes
      // `temporalVariables: {}` and omits `initialTemporalValues`, short-circuiting
      // every temporal-variable check; today no other branch can throw here.
      // The placeholder's caller injects its caught errors via `initialErrors`
      // — when provided and non-empty, the synthetic `missing-rule-set` entry
      // below is suppressed in favor of the caller-supplied errors. An empty
      // `initialErrors` array falls back to the synthetic entry so the
      // load-blocking sentinel is never silently dropped.
      if (opts.initialErrors !== undefined && opts.initialErrors.length > 0) {
        for (const err of opts.initialErrors) this.errors.push(err);
      } else {
        // Per Req 11a: this is the only rejection mode where ruleSet stays undefined.
        this.errors.push({
          kind: "load-failure",
          reason: "missing-rule-set",
          ruleSetId: opts.requestedRuleSetId,
          detail: opts.requestedRuleSetId
            ? `requested rule set "${opts.requestedRuleSetId}" not found`
            : "no rule set provided",
          at: Date.now(),
        });
      }
    } else {
      this.ruleSet = opts.ruleSet;
      this.runLoadTimeValidation();
    }

    // Initialize temporal-variable state. These run for every Engine instance
    // (including placeholders): temporalVariables defaults to {} which makes
    // the hoisted name list empty and every R7 check short-circuit.
    this.temporalVariables = opts.temporalVariables ?? {};
    this.temporalVariableNames = Object.keys(this.temporalVariables);
    for (const name of this.temporalVariableNames) {
      this.observed[name] = false;
    }

    // Asymmetric construction-error model (deliberate):
    // - The temporal R7 variants (temporal-validation, trigger-state-change-overlap,
    //   temporal-initial-values-mismatch) throw EngineConstructionError. These are
    //   fundamental misconfigurations where returning an inert-but-live engine
    //   would invite silent miswiring.
    // - The existing variants (parse-error, missing-impl, missing-defaults) push to
    //   this.errors and rely on isActive to gate consume(). These are partial
    //   brokenness (e.g. one bad category among many) where partial recovery is
    //   useful.
    // The bridge handles both shapes cleanly.
    const constructionErrors: EngineError[] = [];
    if (opts.initialTemporalValues !== undefined) {
      this.checkInitialTemporalValues(opts.initialTemporalValues, constructionErrors);
    }
    // Initialize temporalValues. Object.freeze is a runtime backstop for R1's
    // immutability constraint — primitives pass through unchanged; complex-V
    // values are sealed against later mutation.
    if (opts.initialTemporalValues !== undefined && constructionErrors.length === 0) {
      for (const name of this.temporalVariableNames) {
        this.temporalValues[name] = Object.freeze(opts.initialTemporalValues[name]);
      }
    } else {
      for (const name of this.temporalVariableNames) {
        this.temporalValues[name] = Object.freeze(this.temporalVariables[name].initialValue);
      }
    }
    this.validateTemporalVariables(constructionErrors);

    if (constructionErrors.length > 0) {
      const ruleSetId = this.ruleSet?.id ?? opts.requestedRuleSetId ?? "(unknown)";
      throw new EngineConstructionError(constructionErrors, ruleSetId);
    }

    // Always emit the constructor's notify, even with zero listeners — the snapshot
    // tick is the load-bearing initial-snapshot effect (Req 19 / SE-18).
    this.tickAndNotify();
  }

  private runLoadTimeValidation(): void {
    if (!this.ruleSet) return;

    // Parse every category's expression. Cache success or sentinel + emit parse-error.
    const allReferencedFactorVars = new Set<string>();
    const allReferencedSimProps = new Set<string>();
    for (const category of this.ruleSet.categories) {
      try {
        const ast = parse(category.expression);
        this.parsedExpressions.set(category.id, ast);
        const refs = walkReferences(ast);
        refs.factorVars.forEach((n) => allReferencedFactorVars.add(n));
        refs.simProps.forEach((n) => allReferencedSimProps.add(n));
      } catch (err) {
        if (err instanceof ParseError) {
          this.errors.push({
            kind: "parse-error",
            ruleSetId: this.ruleSet.id,
            categoryId: category.id,
            expression: err.expression,
            tokenSpan: err.tokenSpan,
            offendingToken: err.offendingToken,
            detail: err.detail,
            at: Date.now(),
          });
          this.parsedExpressions.set(category.id, PARSE_ERROR_SENTINEL);
        } else {
          throw err;
        }
      }
    }

    // Snapshot the union of referenced impl names. Step 4 reads this to scope
    // ambient validation (Finding 15 / Req 11a — only referenced impls participate).
    allReferencedFactorVars.forEach((n) => this.referencedImplNames.add(n));
    allReferencedSimProps.forEach((n) => this.referencedImplNames.add(n));

    // Reference-driven walk: missing-impl + missing-defaults + ambient-key collection.
    // (Run even if some categories failed to parse — surface every load issue at once
    // so an implementer doesn't see "missing-impl" only after "parse-error" is fixed.)
    allReferencedFactorVars.forEach((name) => {
      if (!this.ruleSet) return;
      const impl = this.factorVariables[name];
      if (!impl) {
        this.errors.push({
          kind: "load-failure",
          reason: "missing-impl",
          ruleSetId: this.ruleSet.id,
          detail: `factor-variable \`${name}\` has no impl`,
          at: Date.now(),
        });
        return;
      }
      this.collectFromImpl(name, impl);
    });
    allReferencedSimProps.forEach((name) => {
      if (!this.ruleSet) return;
      const impl = this.simProps[name];
      if (!impl) {
        this.errors.push({
          kind: "load-failure",
          reason: "missing-impl",
          ruleSetId: this.ruleSet.id,
          detail: `sim-prop \`${name}\` has no impl`,
          at: Date.now(),
        });
        return;
      }
      this.collectFromImpl(name, impl);
    });

    // Stub-warning emission: only fire when no load-blocking issue exists.
    if (!this.hasLoadBlockingError()) {
      allReferencedFactorVars.forEach((name) => {
        const impl = this.factorVariables[name];
        if (impl?.isStub) this.errors.push({ kind: "stub-warning", stubName: name, at: Date.now() });
      });
      allReferencedSimProps.forEach((name) => {
        const impl = this.simProps[name];
        if (impl?.isStub) this.errors.push({ kind: "stub-warning", stubName: name, at: Date.now() });
      });
    }
  }

  private collectFromImpl(
    implName: string,
    impl: { requiredDefaults?: string[]; ambientStateKeys?: { [k: string]: string[] } },
  ): void {
    if (impl.requiredDefaults && this.ruleSet) {
      impl.requiredDefaults.forEach((path) => {
        if (!this.ruleSet) return;
        const r = validateDefaultsPath(this.ruleSet.defaults, path);
        if (!r.ok) {
          this.errors.push({
            kind: "load-failure",
            reason: "missing-defaults",
            ruleSetId: this.ruleSet.id,
            detail: `${implName} reads defaults path \`${path}\` — ${r.failingPath}`,
            at: Date.now(),
          });
          this.implsWithIncompleteDefaults.add(implName);
        }
      });
    }
    if (impl.ambientStateKeys) {
      Object.entries(impl.ambientStateKeys).forEach(([trigger, keys]) => {
        let bucket = this.ambientKeysByTrigger.get(trigger);
        if (!bucket) {
          bucket = new Set();
          this.ambientKeysByTrigger.set(trigger, bucket);
        }
        keys.forEach((k) => { bucket?.add(k); });
      });
    }
  }

  private hasLoadBlockingError(): boolean {
    return this.errors.some((e) =>
      e.kind === "load-failure"
      || e.kind === "parse-error"
      || e.kind === "temporal-validation"
      || e.kind === "trigger-state-change-overlap"
      || e.kind === "temporal-initial-values-mismatch",
    );
  }

  private checkInitialTemporalValues(
    initialOverride: Record<string, unknown>,
    constructionErrors: EngineError[],
  ): void {
    const ruleSetId = this.ruleSet?.id ?? this.requestedRuleSetId ?? "(unknown)";
    const declaredNames = Object.keys(this.temporalVariables);
    const providedNames = Object.keys(initialOverride);
    const providedSet = new Set(providedNames);
    const declaredSet = new Set(declaredNames);
    const missing = declaredNames.filter((n) => !providedSet.has(n));
    const unknownKeys = providedNames.filter((n) => !declaredSet.has(n));
    const typeMismatches: { name: string; expectedType: string; actualType: string }[] = [];
    for (const name of declaredNames) {
      if (!providedSet.has(name)) continue;
      const expectedType = runtimeType(this.temporalVariables[name].initialValue);
      const actualType = runtimeType(initialOverride[name]);
      if (expectedType !== actualType) typeMismatches.push({ name, expectedType, actualType });
    }
    if (missing.length > 0 || unknownKeys.length > 0 || typeMismatches.length > 0) {
      constructionErrors.push({
        kind: "temporal-initial-values-mismatch",
        ruleSetId,
        missing,
        unknown: unknownKeys,
        typeMismatches,
        at: Date.now(),
      });
    }
  }

  private validateTemporalVariables(constructionErrors: EngineError[]): void {
    const ruleSetId = this.ruleSet?.id ?? this.requestedRuleSetId ?? "(unknown)";

    // (1) temporal-validation: reference-driven. For every referenced impl,
    //     check that every name in `temporalReads` matches a declared temporal variable.
    for (const implName of Array.from(this.referencedImplNames)) {
      const fvImpl = this.factorVariables[implName];
      const spImpl = this.simProps[implName];
      const impl = fvImpl ?? spImpl;
      if (!impl?.temporalReads) continue;
      const implType: "factorVariable" | "simProp" = fvImpl ? "factorVariable" : "simProp";
      for (const varName of impl.temporalReads) {
        if (!(varName in this.temporalVariables)) {
          constructionErrors.push({
            kind: "temporal-validation",
            ruleSetId,
            implName,
            implType,
            missingVariableName: varName,
            at: Date.now(),
          });
        }
      }
    }

    // (2) trigger-state-change-overlap: scan declared temporal variables'
    //     acceptedEvents against factor variables' logEvents. Scoped to
    //     `ruleSet.factorVariables` entries that have a corresponding impl in
    //     `this.factorVariables` — entries without an impl are sim-prop-only
    //     names that some rule sets (e.g. 25) carry as legacy metadata; those
    //     are not factor variables in the operational sense and would
    //     false-positive the overlap check.
    if (this.ruleSet) {
      const logEventsByFactorVar = new Map<string, string>();
      for (const fvDef of this.ruleSet.factorVariables) {
        if (!(fvDef.name in this.factorVariables)) continue;
        for (const eventName of fvDef.logEvents) {
          if (!logEventsByFactorVar.has(eventName)) {
            logEventsByFactorVar.set(eventName, fvDef.name);
          }
        }
      }
      for (const [varName, impl] of Object.entries(this.temporalVariables)) {
        for (const eventName of impl.acceptedEvents) {
          const factorVariableName = logEventsByFactorVar.get(eventName);
          if (factorVariableName) {
            constructionErrors.push({
              kind: "trigger-state-change-overlap",
              ruleSetId,
              variableName: varName,
              eventName,
              factorVariableName,
              at: Date.now(),
            });
          }
        }
      }
    }
  }

  get isActive(): boolean { return !this.hasLoadBlockingError(); }

  // Per PASS3-API-2: arrow-field declarations so `this` is captured at construction
  // and `useSyncExternalStore(engine.subscribe, engine.getSnapshot)` works without binding.
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  getSnapshot = (): number => this.snapshotVersion;

  // Public state-changing entry. Per Req 10 a no-op when inactive.
  // Atomicity (Req 19): single notify at the end of the call iff state mutated.
  consume(event: ConsumedEvent): void {
    if (!this.isActive) return;

    // Single `mutated` flag spans the temporal phase and the translate pipeline so
    // the bottom tick fires exactly once per consume() iff any state mutated.
    let mutated = false;

    // === Temporal-variable phase (R1: two-phase atomicity) ===
    // Phase 1: buffer reducer outputs. No live mutation.
    const variableNames = this.temporalVariableNames;  // declaration order per R2
    type BufferedCommit = { name: string; newValue: unknown; change: TemporalVariableChange };
    const buffer: BufferedCommit[] = [];
    let reducerThrew = false;
    for (const name of variableNames) {
      const impl = this.temporalVariables[name];
      if (!impl.acceptedEvents.includes(event.name)) continue;
      try {
        // Object.freeze backs R1's immutability constraint at runtime. Primitives
        // pass through unchanged; complex-V values throw TypeError on mutation in
        // strict mode (ESM is strict by default). Shallow only.
        const newValue = Object.freeze(impl.reduce(this.temporalValues[name], event));
        buffer.push({
          name,
          newValue,
          change: { at: event.at, name, value: newValue, eventName: event.name },
        });
      } catch (thrown) {
        this.errors.push({
          kind: "temporal-reducer-error",
          ruleSetId: this.ruleSet?.id ?? this.requestedRuleSetId ?? "(unknown)",
          variableName: name,
          event,
          thrown,
          at: event.at,
        });
        mutated = true;
        reducerThrew = true;
        break;  // fail-fast per R1
      }
    }
    if (reducerThrew) {
      // Phase 2 / translate / trigger evaluation all skipped per R1 fail-fast.
      // Gate the tick on `mutated` so the single-notify-iff-mutated contract is preserved.
      if (mutated) this.tickAndNotify();
      return;
    }

    // Phase 2: commit. Atomic.
    const lastReading = this.readings.length > 0 ? this.readings[this.readings.length - 1] : undefined;
    for (const { name, newValue, change } of buffer) {
      this.temporalValues[name] = newValue;
      this.observed[name] = true;
      if (lastReading) lastReading.temporalHistory.push(change);
      // If no reading exists yet, the temporalValues/observed commits still happen
      // but the temporalHistory append is a no-op (R5b).
    }
    if (buffer.length > 0) mutated = true;

    const result = this.translate(event, this.sessionId);
    switch (result.kind) {
      case "trigger": {
        // Trigger-time ambient-state validation (Req 3b).
        const requiredKeys = this.ambientKeysByTrigger.get(event.name);
        const ambient = (event.ambientState ?? {}) as Record<string, unknown>;
        const missingPerImpl: { implName: string; key: string }[] = [];
        if (requiredKeys && requiredKeys.size > 0) {
          // Re-walk the impls to attribute missing keys per impl (cardinality per Req 3b).
          this.checkAmbientForTrigger(event.name, ambient, missingPerImpl);
        }
        if (missingPerImpl.length === 0) {
          const reading = result.reading;
          // R5a seed: every newly-pushed reading carries one entry per declared
          // temporal variable, capturing the live value at trigger time.
          for (const name of variableNames) {
            reading.temporalHistory.push({
              at: reading.at,
              name,
              value: this.temporalValues[name],
              eventName: event.name,
            });
          }
          this.readings.push(reading);
          mutated = true;
        } else {
          for (const { implName, key } of missingPerImpl) {
            this.errors.push({
              kind: "ambient-validation",
              ruleSetId: this.ruleSet?.id ?? "(unknown)",
              trigger: event.name,
              implName,
              missingKey: key,
              event,
              at: event.at,
            });
          }
          mutated = true;
        }
        break;
      }
      case "modifier": {
        const lastReadingForMod = this.readings.length > 0 ? this.readings[this.readings.length - 1] : undefined;
        const lastFailedTrigger = findLast(
          this.errors,
          (e): e is EngineError & { kind: "ambient-validation" } => e.kind === "ambient-validation",
        );
        const orphan = this.detectOrphan(lastReadingForMod, lastFailedTrigger);
        if (orphan) {
          this.errors.push({
            kind: "orphan-modifier",
            source: result.update.source,
            reason: orphan,
            event,
            at: event.at,
          });
          mutated = true;
        } else if (lastReadingForMod) {
          lastReadingForMod.updates.push(result.update);
          mutated = true;
        }
        break;
      }
      case "no-op":
        // Intentionally no mutation from translate, but the temporal phase may have ticked.
        break;
      default: {
        const _exhaustive: never = result;
        throw new Error(`consume: unhandled translate result ${(_exhaustive as { kind: string }).kind}`);
      }
    }
    if (mutated) this.tickAndNotify();
  }

  // Per-trigger ambient-key check. Attributes missing keys to the impl that declares them,
  // restricted to impls referenced by some category (Finding 15 / Req 11a — unused impls
  // declaring ambient keys must not produce spurious validation errors).
  private checkAmbientForTrigger(
    trigger: string, ambient: Record<string, unknown>, missing: { implName: string; key: string }[],
  ): void {
    const checkImpl = (
      implName: string,
      keysByTrigger: { [k: string]: string[] } | undefined,
    ): void => {
      if (!this.referencedImplNames.has(implName)) return;
      const keys = keysByTrigger?.[trigger];
      if (!keys) return;
      for (const k of keys) {
        if (!(k in ambient)) missing.push({ implName, key: k });
      }
    };
    Object.entries(this.factorVariables).forEach(([name, impl]) => checkImpl(name, impl.ambientStateKeys));
    Object.entries(this.simProps).forEach(([name, impl]) => checkImpl(name, impl.ambientStateKeys));
  }

  // Orphan-modifier detection per Tech Notes pseudocode.
  // - no-prior-trigger: never fired anything yet.
  // - prior-trigger-failed: latest event was a failed trigger (more recent than latest reading).
  // - between-runs: latest reading exists but its triggeredBy is not in runStartTriggers.
  // Returns null when the modifier should attach to lastReading.
  private detectOrphan(
    lastReading: TReading | undefined,
    lastFailedTrigger: (EngineError & { kind: "ambient-validation" }) | undefined,
  ): "no-prior-trigger" | "prior-trigger-failed" | "between-runs" | null {
    if (!lastReading && !lastFailedTrigger) return "no-prior-trigger";
    if (lastReading && lastFailedTrigger && lastFailedTrigger.at > lastReading.at) return "prior-trigger-failed";
    if (!lastReading && lastFailedTrigger) return "prior-trigger-failed";
    if (lastReading && this.runStartTriggers && !this.runStartTriggers.includes(lastReading.triggeredBy)) {
      return "between-runs";
    }
    return null;
  }

  // Substrate-internal: tick the snapshot counter and notify listeners.
  // Reentrancy: snapshot the listener set before iterating; if a listener
  // triggers another notify (re-entry), buffer it and drain after the outer
  // notify finishes (Req 19 reentrancy contract).
  protected tickAndNotify(): void {
    this.snapshotVersion += 1;
    if (this.notifying) {
      this.pendingNotify = true;
      return;
    }
    this.notifying = true;
    try {
      const snapshot = Array.from(this.listeners);
      for (const listener of snapshot) {
        // If a listener was unsubscribed by a prior listener in this iteration, skip it.
        if (!this.listeners.has(listener)) continue;
        try { listener(); } catch (e) { /* listeners must not throw; log to console */
          // eslint-disable-next-line no-console
          console.error("AnalysisEngine listener threw:", e);
        }
      }
    } finally {
      this.notifying = false;
    }
    if (this.pendingNotify) {
      this.pendingNotify = false;
      this.tickAndNotify();
    }
  }
}
