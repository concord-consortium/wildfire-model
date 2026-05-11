import {
  BaseReading, ConsumedEvent, EngineError, FactorVariableImpl, ReadingUpdate,
  RuleSet, SimPropImpl,
} from "./types";
import { Expression, parse, ParseError } from "./parser";
import { generateSessionId } from "./session-id";
import { validateDefaultsPath } from "./validate-defaults";
import { walkReferences } from "./walk-references";

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

  // Step 4's consume pipeline reads these directly off opts.
  protected translate: EngineOpts<TReading, TDefaults>["translate"];
  protected runStartTriggers: string[] | undefined;
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
    } else {
      this.ruleSet = opts.ruleSet;
      this.runLoadTimeValidation();
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
    return this.errors.some((e) => e.kind === "load-failure" || e.kind === "parse-error");
  }

  get isActive(): boolean { return !this.hasLoadBlockingError(); }

  // Per PASS3-API-2: arrow-field declarations so `this` is captured at construction
  // and `useSyncExternalStore(engine.subscribe, engine.getSnapshot)` works without binding.
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  getSnapshot = (): number => this.snapshotVersion;

  // Public state-changing entry. Step 3 lands the `!isActive` early-return shell;
  // step 4 fills in the trigger / modifier / no-op pipeline.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  consume(event: ConsumedEvent): void {
    if (!this.isActive) return;
    // step 4 fills in the trigger / modifier / no-op pipeline below this guard.
    /* eslint-disable-next-line no-unused-expressions */
    void event;
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
