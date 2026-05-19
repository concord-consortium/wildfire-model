# Implementation Plan: Hazbot — Temporal Variables (Replace Ambient State)

**Jira**: https://concord-consortium.atlassian.net/browse/WM-10
**Requirements Spec**: [requirements.md](requirements.md)
**Status**: **In Development**

## Implementation Plan

The plan is ordered to keep `npm run lint`, `npm run build`, and `npm test` green at every step boundary (per the spec's "Commit greenness invariant" — Technical Notes → Engine plumbing constraints). The internal sequencing is **add-then-migrate-then-remove**: new substrate types and engine wiring land first as additive surface; consumers (`GraphOpen`, sidebar, host integration) migrate to the new path; finally the ambient-state and modifier-mechanism surface is deleted. This avoids any intermediate red-build state across the bundled additions and removals of R10/R10b.

A high-level dependency picture:

- Steps 1–3 introduce the temporal-variable construct in the substrate (types, engine wiring, helper, error rendering). Existing ambient-state and modifier-mechanism paths are left untouched.
- Steps 4–5 introduce the `chartTabOpen` temporal variable in the wildfire bridge and migrate `GraphOpen` onto it. Both old and new paths still exist; `GraphOpen` now reads only the new path.
- Steps 6–7 update the sidebar and simplify the wildfire bridge's `translate.ts` / engine-singleton.
- Steps 8–9 retire the host-side `log()` third-arg plumbing and then delete the entire ambient-state + modifier surface from the substrate.
- Steps 10–11 deliver the R18c fixture/regression test and documentation.

Each step lists files touched, an estimated diff size, and the inline tests it lands. Steps are described with enough detail that they can be carried out and reviewed independently.

---

### Step 1 — Substrate types: add temporal-variable surface

**Summary**: Add `TemporalVariableImpl<V>`, `TemporalVariableChange`, `EngineConstructionError`, and four new `EngineError` variants. Add optional `temporalReads?: string[]` to `FactorVariableImpl` and `SimPropImpl`. Add `temporalHistory: TemporalVariableChange[]` to `BaseReading`. Pure-additive — no behavior changes, no consumer migration.

**Files affected**:
- `src/hazbot/engine/types.ts` — new types, new EngineError variants, augmented impl interfaces, augmented BaseReading
- `src/hazbot/engine/index.ts` — re-export `TemporalVariableImpl`, `TemporalVariableChange`, `EngineConstructionError`

**Estimated diff size**: ~80 lines

**Details**:

In `types.ts`, add at module scope:

```ts
export interface TemporalVariableChange {
  at: number;
  name: string;
  value: unknown;
  eventName: string;
}

export interface TemporalVariableImpl<V = unknown> {
  name: string;
  initialValue: V;
  acceptedEvents: string[];
  reduce: (currentValue: V, event: ConsumedEvent) => V;
}

export class EngineConstructionError extends Error {
  constructor(
    public readonly errors: EngineError[],
    public readonly ruleSetId: string,
  ) {
    super(`Engine construction failed for rule set ${ruleSetId} (${errors.length} error(s))`);
    this.name = "EngineConstructionError";
  }
}
```

Add to `BaseReading`:

```ts
export interface BaseReading {
  triggeredBy: string;
  at: number;
  sessionId: string;
  updates: ReadingUpdate[];          // unchanged; removed in Step 9
  temporalHistory: TemporalVariableChange[];  // NEW
}
```

Add to `FactorVariableImpl` and `SimPropImpl`:

```ts
export interface FactorVariableImpl<...> {
  ambientStateKeys?: { ... };       // unchanged; removed in Step 9
  requiredDefaults?: string[];
  temporalReads?: string[];         // NEW
  defaultValue: V;
  isStub?: boolean;
  compute: (...) => { value: V; witnesses: TReading[] };
}
```

Append four new EngineError variants to the discriminated union (unchanged variants kept):

```ts
| {
    kind: "temporal-validation";
    ruleSetId: string;
    implName: string;
    implType: "factorVariable" | "simProp";
    missingVariableName: string;
    at: number;
  }
| {
    kind: "temporal-reducer-error";
    ruleSetId: string;
    variableName: string;
    event: ConsumedEvent;
    thrown: unknown;
    at: number;
  }
| {
    kind: "trigger-state-change-overlap";
    ruleSetId: string;
    variableName: string;
    eventName: string;
    factorVariableName: string;
    at: number;
  }
| {
    kind: "temporal-initial-values-mismatch";
    ruleSetId: string;
    missing: string[];
    unknown: string[];
    typeMismatches: Array<{ name: string; expectedType: string; actualType: string }>;
    at: number;
  }
```

In `index.ts`, add the three new type exports.

**Notes**:
- This step does not modify the engine or any consumer; existing tests must still pass unchanged. The `temporalHistory: TemporalVariableChange[]` field on `BaseReading` adds a structural property — every `WildfireReading` construction site in this step **does not yet need to set it**, because no engine code reads it yet. (Step 2 wires the engine to write it.)
- However, TS will require every existing `WildfireReading`-construction site that uses object literals strict-checked against the interface to include `temporalHistory: []`. **Audit run at planning time** (`grep -rn "triggeredBy:" src --include='*.ts' --include='*.tsx'`): 16 sites across 12 files — within the predicted 10-20 band. The enumerated sites:
  - `src/hazbot/wildfire/translate.ts` (2 sites: SimulationStarted, SimulationEnded/Stopped) — Step 6 will rewrite these literals further
  - `src/hazbot/wildfire/translate.test.ts` (2 sites)
  - `src/hazbot/wildfire/sim-props.test.ts` (1 site via `mkRead`)
  - `src/hazbot/wildfire/factor-variables.test.ts` (1 site)
  - `src/hazbot/rule-sets/test-helpers.ts` (1 site — the shared reading constructor used by 23/24/25 tests)
  - `src/hazbot/engine/safely-evaluate-impl.test.ts` (2 sites)
  - `src/hazbot/engine/consume.test.ts` (2 sites)
  - `src/hazbot/engine/sidebar/sidebar.test.tsx` (1 site)
  - `src/hazbot/engine/engine.test.ts` (1 site)
  - `src/hazbot/engine/evaluator.test.ts` (1 site)
  - `src/hazbot/engine/react/use-analysis-engine.test.tsx` (1 site)
  
  Each site gets a single `temporalHistory: []` line addition. The 80-line estimate covers this plus the type-definition edits.
- No new unit tests in this step; the additions are pure type-level.

---

### Step 1.5 — Extract `computeMatchedCategoryForEngine` helper (prep refactor)

**Summary**: Pure refactor. Move the matchedCategory wrapping currently inline at [use-analysis-engine.ts:62-69](src/hazbot/engine/react/use-analysis-engine.ts#L62-L69) into a new `computeMatchedCategoryForEngine(engine): number | null` exported from `evaluator.ts`. The hook calls the helper on one line. Behavior unchanged. Sets up Step 2's R18a two-engine determinism test and Step 10's R18c replay-fixture test + generator script to compute matchedCategory React-free.

**Files affected**:
- `src/hazbot/engine/evaluator.ts` — add `computeMatchedCategoryForEngine` (~12 lines)
- `src/hazbot/engine/index.ts` — re-export the helper (+1 line)
- `src/hazbot/engine/react/use-analysis-engine.ts` — replace lines 62-69 (8 lines) with a single call (-7 net lines)

**Estimated diff size**: ~20 lines.

**Details**:

The helper is added near the existing `computeMatchedCategoryFloor` export at [evaluator.ts:283](src/hazbot/engine/evaluator.ts#L283). It replicates the `isActive`/`ruleSet` gate and `makeRenderCtx` wrapping currently inline in the hook:

```ts
import { Engine } from "./engine";
import { BaseReading } from "./types";

export function computeMatchedCategoryForEngine<TR extends BaseReading, TD>(
  engine: Engine<TR, TD>,
): number | null {
  if (!engine.isActive || !engine.ruleSet) return null;
  const defaults = engine.ruleSet.defaults as TD | undefined;
  return computeMatchedCategoryFloor(
    engine.ruleSet, engine.parsedExpressions,
    (slice) => makeRenderCtx(slice, defaults, engine.factorVariables, engine.simProps, engine.implsWithIncompleteDefaults),
    engine.readings,
  );
}
```

Re-export from `engine/index.ts`:

```ts
export { computeMatchedCategoryForEngine } from "./evaluator";
```

Hook refactor at [use-analysis-engine.ts:62-69](src/hazbot/engine/react/use-analysis-engine.ts#L62-L69) — replace the 8-line inline block:

```ts
// Before (lines 62-69, inside `if (engine.isActive && engine.ruleSet) { ... }`):
//   matchedCategory = computeMatchedCategoryFloor(
//     engine.ruleSet, engine.parsedExpressions,
//     (slice) => makeRenderCtx(slice, defaults, engine.factorVariables, engine.simProps, engine.implsWithIncompleteDefaults),
//     engine.readings,
//   );
// After:
const matchedCategory = computeMatchedCategoryForEngine(engine);
```

The `perCategoryTruth` computation immediately below ([use-analysis-engine.ts:70-77](src/hazbot/engine/react/use-analysis-engine.ts#L70-L77)) stays in the hook — it's only used by the sidebar and depends on the same `makeRenderCtx` call, so extracting it too would inflate the helper's surface for no shared-test benefit. The `if (engine.isActive && engine.ruleSet)` guard around `perCategoryTruth` stays unchanged.

**Tests**: No new tests in this step. The existing hook tests at `src/hazbot/engine/react/use-analysis-engine.test.tsx` cover the refactor by virtue of unchanged behavior — if matchedCategory diverges for any test scenario, those tests fail. R18a's two-engine determinism test lands in Step 2; the R18c replay fixture lands in Step 10. Both reference the helper added here.

**Dependency note**: This step depends only on existing engine surface (`Engine`, `BaseReading`, `computeMatchedCategoryFloor`, `makeRenderCtx`) — none of the new temporal-variable types added in Step 1. The placement after Step 1 is for monotonic numbering only; the steps could land in either order without affecting each other.

---

### Step 2 — Substrate engine: temporal-variable dispatch + construction-time guards

**Summary**: Wire `EngineOpts.temporalVariables` and `EngineOpts.initialTemporalValues` into the `Engine` constructor. Implement the two-phase reducer dispatch in `consume()` (R1), `temporalValues`/`observed` live maps (R3), trigger-time seed (R5a), append-between-triggers (R5b), and the three construction-time validation variants (`temporal-validation`, `trigger-state-change-overlap`, `temporal-initial-values-mismatch`) plus the runtime `temporal-reducer-error`. The ambient-state and modifier-mechanism paths remain untouched in this step.

**Files affected**:
- `src/hazbot/engine/engine.ts` — wire new opts, add maps, extend `consume()`, add `validateTemporalVariables()`, add `runtimeType` helper
- `src/hazbot/engine/runtime-type.ts` (new) — small helper module
- `src/hazbot/engine/engine.test.ts` — new tests for temporal-variable construction wiring (R18 — multiple variables, reducer dispatch order, R18d — reducer-throw contract, R18e — overlap guard, R18f — `initialTemporalValues` exhaustiveness + type-shape)
- `src/hazbot/engine/consume.test.ts` — new tests for reducer dispatch in consume + seed/append behavior + same-event-multiple-variables ordering
- `src/hazbot/engine/replay-determinism.test.ts` (new) — R18a two-engine determinism test. Uses `computeMatchedCategoryForEngine` (extracted in Step 1.5) to compute matchedCategory React-free.

**Estimated diff size**: ~450 lines (engine.ts: ~150; runtime-type helper: ~20; tests: ~280)

**Details**:

**`runtime-type.ts`** — small helper, **substrate-private**; not re-exported from `engine/index.ts` in this PR (per Pass-3 Finding 7). The helper is scoped to the `temporal-initial-values-mismatch` runtime check (R7); broader runtime-type concerns should define their own helper rather than widen this one. Closing the export keeps the name from competing with any future runtime-type utility.

```ts
export function runtimeType(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}
```

**`computeMatchedCategoryForEngine`** is added in Step 1.5 (prep refactor) and re-exported from `engine/index.ts`. Step 2's R18a test imports it directly; no new helper work in this step.

**`EngineOpts` additions** (add to the existing interface in `engine.ts`):

```ts
export interface EngineOpts<TReading extends BaseReading, TDefaults = unknown> {
  ruleSet?: RuleSet<TDefaults>;
  requestedRuleSetId?: string;
  factorVariables: Record<string, FactorVariableImpl<unknown, TReading, TDefaults>>;
  simProps: Record<string, SimPropImpl<TReading, TDefaults>>;
  translate: (...) => ...;
  runStartTriggers?: string[];
  temporalVariables?: Record<string, TemporalVariableImpl<unknown>>;  // NEW; default {}; explicit `<unknown>` matches factorVariables idiom
  initialTemporalValues?: Record<string, unknown>;                    // NEW; optional
  // NEW; optional. Used by the bridge's EngineConstructionError catch path to
  // inject caught construction errors into a placeholder engine without
  // post-construction mutation. When provided AND non-empty, the synthetic
  // `load-failure: missing-rule-set` entry from the `ruleSet === undefined`
  // branch is suppressed — the caller-supplied errors are the authoritative
  // diagnostic. An empty `initialErrors` array falls back to the synthetic
  // entry so the load-blocking sentinel is never silently dropped (Copilot
  // review, Finding 1). Per Pass-4 Finding MU-1.
  initialErrors?: EngineError[];
}
```

**`Engine` class additions** (instance fields):

```ts
temporalVariables: Record<string, TemporalVariableImpl<unknown>> = {};
temporalValues: Record<string, unknown> = {};
observed: Record<string, boolean> = {};
// Hoisted from Object.keys(this.temporalVariables) at construction so the
// substrate's hot path (consume() + R5a seed loop) iterates a stable array
// without re-allocating per event. Per Pass-3 Finding 1. Public-readable so
// the sidebar (sidebar.tsx, hot path on every snapshot tick) can iterate the
// same memoized array without re-allocating Object.keys(...) per render —
// per Pass-4 Finding MR-3.
temporalVariableNames: string[] = [];
```

**Constructor changes** (in order, after the existing factor-variable / sim-prop assignment, before `runLoadTimeValidation`):

1. Assign `this.temporalVariables = opts.temporalVariables ?? {}`, then `this.temporalVariableNames = Object.keys(this.temporalVariables)`. The names array is read by `consume()` and the R5a seed loop; computing it once eliminates per-event allocation.
2. Initialize `this.observed` to `false` for every declared variable. (Always — independent of `initialTemporalValues`.)
3. Initialize `this.temporalValues`. Every value stored is `Object.freeze`'d for consistency with the consume-path freeze (Pass-4 Finding MU-2) — primitives pass through unchanged; complex-V values are sealed against later mutation through the live map or via the first trigger's seed entry (which aliases the same reference).
   - If `opts.initialTemporalValues` is provided, run the `temporal-initial-values-mismatch` check (see below) into a local `constructionErrors: EngineError[]` buffer; on pass, set `this.temporalValues[name] = Object.freeze(opts.initialTemporalValues[name])` for each declared variable.
   - Else, set `this.temporalValues[name] = Object.freeze(impl.initialValue)` for each declared variable.
4. Run `validateTemporalVariables()` (see below) into the same `constructionErrors` buffer.
5. After all construction-time validation (existing parse/load + new temporal), if `constructionErrors` is non-empty, throw `new EngineConstructionError(constructionErrors, this.ruleSet?.id ?? requestedRuleSetId ?? "(unknown)")`. **This is a new exit path** — existing behavior continues to push to `this.errors`; the new variants go to `constructionErrors` and abort construction.
6. **`initialErrors` injection** (per Pass-4 Finding MU-1). The existing `ruleSet === undefined` branch at engine.ts:80-89 currently pushes the synthetic `load-failure: missing-rule-set` entry unconditionally. Change to: if `opts.initialErrors !== undefined && opts.initialErrors.length > 0`, push every entry of `opts.initialErrors` into `this.errors` *instead of* the synthetic entry. The synthetic entry fires when `initialErrors` is absent **or empty** — the non-empty guard avoids silently dropping the only load-blocking sentinel if a caller passes `initialErrors: []` (per Copilot review). The bottom `tickAndNotify()` at engine.ts:98 covers both paths — no post-construction mutation needed by the caller. Keeps the substrate's "every state mutation ticks" invariant intact.

**Decision: which errors abort construction?** Per R7 and Q2's resolution, the three new construction-time variants (`temporal-validation`, `trigger-state-change-overlap`, `temporal-initial-values-mismatch`) throw via `EngineConstructionError`. The existing construction-time errors (parse-error, missing-impl, missing-defaults) **continue** to push to `this.errors` and rely on `isActive` to gate consume — they do not throw. This preserves partial-recovery semantics (a ruleset with one bad category among many still constructs an inert-but-readable engine) while making the new "fundamental misconfiguration" variants fail loud at construction. The bridge-side singleton handles both shapes — try/catch for the throw, `engine.errors` reads for the push (Step 4 wires this).

**Extend `hasLoadBlockingError()`** to include the three R7 construction-time variants. The existing predicate at [engine.ts:217-219](src/hazbot/engine/engine.ts#L217-L219) checks only `load-failure | parse-error`. The R7 variants normally throw via `EngineConstructionError` and never land in a successfully-constructed engine's `errors[]` — but the bridge's placeholder path injects them via `initialErrors` (constructor change #6 above). Without this extension, a placeholder carrying only R7 errors would report `isActive === true` (since none of those `kind`s match the predicate), defeating the placeholder's intent. The updated predicate:

```ts
private hasLoadBlockingError(): boolean {
  return this.errors.some((e) =>
    e.kind === "load-failure"
    || e.kind === "parse-error"
    || e.kind === "temporal-validation"
    || e.kind === "trigger-state-change-overlap"
    || e.kind === "temporal-initial-values-mismatch",
  );
}
```

`temporal-reducer-error` is intentionally **not** in the load-blocking set — it's a runtime error, not a construction-time misconfiguration, and runtime reducer failures must not retroactively gate `consume()` (per Copilot review, deeper-than-stated concern).

Add a comment near the construction-time error handling in `engine.ts` so the asymmetry is documented at the code site:

```ts
// Asymmetric construction-error model (deliberate — see implementation.md Q2):
// - The R7 variants (temporal-validation, trigger-state-change-overlap,
//   temporal-initial-values-mismatch) throw EngineConstructionError. These are
//   fundamental misconfigurations where returning an inert-but-live engine would
//   invite silent miswiring.
// - The existing variants (parse-error, missing-impl, missing-defaults) push to
//   this.errors and rely on isActive to gate consume(). These are partial
//   brokenness (e.g. one bad category among many) where partial recovery is
//   useful.
// The bridge handles both shapes cleanly.
```

Add a second comment near the existing `ruleSet === undefined` branch at engine.ts:80-94 — the maintenance gate the bridge's catch-and-placeholder relies on (per Pass-3 Finding 5):

```ts
// Maintenance gate: this branch must remain throw-free.
// engine-singleton.ts catches EngineConstructionError and constructs a
// placeholder Engine via this same `ruleSet === undefined` path so the sidebar
// can render the structured errors (R7). The placeholder passes
// `temporalVariables: {}` and omits `initialTemporalValues`, short-circuiting
// every R7 check; today no other branch can throw here. If you add validation
// here, audit engine-singleton.ts's EngineConstructionError catch handler — a
// throw on this path would re-introduce the failure mode the catch was added
// to prevent. The placeholder's bridge-side caller injects its caught errors
// via the `initialErrors` opt (Pass-4 Finding MU-1) — when provided and
// non-empty, the synthetic `missing-rule-set` entry below is suppressed in
// favor of the caller-supplied errors. (An empty `initialErrors` array falls
// back to the synthetic entry so the load-blocking sentinel is never silently
// dropped.) Adding more synthetic entries here would silently defeat that
// suppression for callers using `initialErrors`.
```

**`validateTemporalVariables()`** (new private method, called from constructor):

```ts
private validateTemporalVariables(constructionErrors: EngineError[]): void {
  const ruleSetId = this.ruleSet?.id ?? this.requestedRuleSetId ?? "(unknown)";

  // (1) temporal-validation: reference-driven. For every referenced impl (factor-var
  //     or sim-prop), check that every name in `temporalReads` matches a declared
  //     temporal variable.
  for (const implName of this.referencedImplNames) {
    const impl = this.factorVariables[implName] ?? this.simProps[implName];
    if (!impl?.temporalReads) continue;
    const implType = this.factorVariables[implName] ? "factorVariable" : "simProp";
    for (const varName of impl.temporalReads) {
      if (!(varName in this.temporalVariables)) {
        constructionErrors.push({
          kind: "temporal-validation",
          ruleSetId, implName, implType, missingVariableName: varName, at: Date.now(),
        });
      }
    }
  }

  // (2) trigger-state-change-overlap: not reference-driven. Scan every declared
  //     temporal variable's acceptedEvents against every factor variable's logEvents.
  if (this.ruleSet) {
    const logEventsByFactorVar = new Map<string, string>();  // eventName -> first factor-var declaring it
    for (const fvDef of this.ruleSet.factorVariables) {
      for (const eventName of fvDef.logEvents) {
        if (!logEventsByFactorVar.has(eventName)) logEventsByFactorVar.set(eventName, fvDef.name);
      }
    }
    for (const [varName, impl] of Object.entries(this.temporalVariables)) {
      for (const eventName of impl.acceptedEvents) {
        const factorVariableName = logEventsByFactorVar.get(eventName);
        if (factorVariableName) {
          constructionErrors.push({
            kind: "trigger-state-change-overlap",
            ruleSetId, variableName: varName, eventName, factorVariableName, at: Date.now(),
          });
        }
      }
    }
  }
}
```

**`temporal-initial-values-mismatch` check** (called before `validateTemporalVariables`, since it gates whether `temporalValues` initializes from the override or defaults):

```ts
private checkInitialTemporalValues(
  initialOverride: Record<string, unknown>,
  constructionErrors: EngineError[],
): void {
  const ruleSetId = this.ruleSet?.id ?? this.requestedRuleSetId ?? "(unknown)";
  const declared = new Set(Object.keys(this.temporalVariables));
  const provided = new Set(Object.keys(initialOverride));
  const missing = [...declared].filter((n) => !provided.has(n));
  const unknownKeys = [...provided].filter((n) => !declared.has(n));
  const typeMismatches: { name: string; expectedType: string; actualType: string }[] = [];
  for (const name of declared) {
    if (!provided.has(name)) continue;
    const expectedType = runtimeType(this.temporalVariables[name].initialValue);
    const actualType = runtimeType(initialOverride[name]);
    if (expectedType !== actualType) typeMismatches.push({ name, expectedType, actualType });
  }
  if (missing.length > 0 || unknownKeys.length > 0 || typeMismatches.length > 0) {
    constructionErrors.push({
      kind: "temporal-initial-values-mismatch",
      ruleSetId, missing, unknown: unknownKeys, typeMismatches, at: Date.now(),
    });
  }
}
```

Note: the override-map keys are scoped by the `declared` set when initializing `temporalValues` post-validation. If validation fails, construction throws before initialization completes — the engine instance never escapes.

**`consume()` extension** (in `engine.ts`):

Replace the existing `consume()` body's top portion. After the `if (!this.isActive) return;` guard, **before** the call to `this.translate(...)`, run the temporal-variable phase:

```ts
consume(event: ConsumedEvent): void {
  if (!this.isActive) return;

  // Single `mutated` flag spans the temporal phase and the translate pipeline so
  // the bottom tick fires exactly once per consume() iff any state mutated —
  // preserves engine.ts:233's "single notify at end of call iff state mutated"
  // contract verbatim (Pass-4 Finding MR-1).
  let mutated = false;

  // === Temporal-variable phase (R1: two-phase atomicity) ===
  // Phase 1: buffer reducer outputs. No live mutation.
  // `temporalVariableNames` is the declaration-order list hoisted at construction
  // (per Pass-3 Finding 1) — re-using the field avoids a per-event Object.keys() allocation.
  const variableNames = this.temporalVariableNames;  // declaration order per R2
  type BufferedCommit = { name: string; newValue: unknown; change: TemporalVariableChange };
  const buffer: BufferedCommit[] = [];
  let reducerThrew = false;
  for (const name of variableNames) {
    const impl = this.temporalVariables[name];
    if (!impl.acceptedEvents.includes(event.name)) continue;
    try {
      // Object.freeze is a runtime gate backing R1's immutability constraint
      // (Pass-4 Finding MU-2). Booleans (current scope) pass through unchanged
      // — primitives can't be frozen and no throw fires. For future complex-V
      // temporal variables, attempts to mutate the value after it lands in
      // `temporalValues` / `temporalHistory` throw `TypeError` in strict mode
      // (ESM is strict by default). Shallow only — deep mutation through a
      // nested object isn't caught, but the common one-level mutation case is.
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
      // errors.push is observable state — set mutated so the reducer-throw exit
      // ticks via the single bottom path (engine.ts:260/282 precedent).
      mutated = true;
      reducerThrew = true;
      break;  // fail-fast per R1
    }
  }
  if (reducerThrew) {
    // Phase 2 / translate / trigger evaluation all skipped per R1 fail-fast.
    // Gate the tick on `mutated` (true here because errors.push fired) so the
    // single-notify-iff-mutated contract is preserved verbatim — Pass-4 Finding MR-1.
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

  // === Existing translate / trigger evaluation pipeline ===
  const result = this.translate(event, this.sessionId);
  switch (result.kind) {
    case "trigger": {
      // [existing engine.ts:240-260: computes `requiredKeys` from
      //  `ambientKeysByTrigger.get(event.name)`, calls
      //  `checkAmbientForTrigger(event.name, ambient, missingPerImpl)`, then
      //  iterates missingPerImpl pushing `ambient-validation` errors. UNCHANGED
      //  in Step 2 — read engine.ts for the literal block. Removed wholesale in
      //  Step 9. The `missingPerImpl` variable below is the one populated by
      //  that block; Step 2 wraps the existing reading-push in a gating `if`
      //  to skip the seed loop on validation failure.]
      if (missingPerImpl.length === 0) {
        const reading = result.reading;
        // R5a seed: every newly-pushed reading carries one entry per declared
        // temporal variable, capturing the live value at trigger time. The
        // translate() callback constructs `reading.temporalHistory: []`
        // (Step 1's audit); the seed runs here, atomically, before the push.
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
        // Ambient validation failed: reading dropped, errors already pushed.
        // Still tick so the sidebar's ErrorsPanel re-renders (matches existing
        // engine.ts:253 behavior).
        mutated = true;
      }
      break;
    }
    // ... existing modifier and no-op cases
  }
  if (mutated) this.tickAndNotify();
}
```

**Important sequencing inside `consume()`**:
- Phase 1 + Phase 2 of the temporal-variable dispatch run **before** `translate()` (R4).
- R5a's seed runs **after** the `result.reading` is constructed but **before** `this.readings.push(reading)` — guaranteeing the seed sees the post-phase-2 `temporalValues`. This is what makes R4 ("trigger sees post-update values") concrete.
- The phase-2 buffer-empty check (`if (buffer.length > 0) mutated = true;`) ensures even a state-change event with no trigger ticks `snapshotVersion` once, since live `temporalValues` and `observed` mutate.

**Tests** (consolidated under engine.test.ts / consume.test.ts / replay-determinism.test.ts):

- **R18 — temporal-variable construction + dispatch** (engine.test.ts):
  - "engine accepts `temporalVariables` opt and initializes `temporalValues` from `initialValue`s"
  - "engine initializes `observed` to false for every declared variable"
  - "engine accepts `initialTemporalValues` override and `temporalValues` reflects override; `observed` is still false everywhere"
  - "consume invokes matching reducer; non-matching events leave `temporalValues` unchanged"
  - "single event matching multiple variables invokes reducers in declaration order"
- **R18d — reducer-throw contract** (consume.test.ts):
  - Install a `TemporalVariableImpl` with `reduce` that throws on event `"BadEvent"`.
  - Drive `consume({ name: "BadEvent", at: 100 })`.
  - Assert: `engine.errors` contains one `temporal-reducer-error` with `variableName`, `event`, `thrown`, `at` set; `temporalValues[name]` unchanged; `observed[name] === false`; no `TemporalVariableChange` appended to any reading; `translate()` was not called (use a spying translate mock); no new reading was created. When two variables match the same event and the first throws, the second's reducer must NOT run and its `observed` bit must remain `false`.
- **R18e — trigger/state-change overlap guard** (engine.test.ts):
  - Construct an engine with a temporal variable whose `acceptedEvents` overlaps a factor variable's `logEvents`.
  - Assert `new Engine(...)` throws an `EngineConstructionError` instance (not bare `Error`); `caught.errors[0].kind === "trigger-state-change-overlap"` with expected `variableName`, `eventName`, `factorVariableName`; `caught.ruleSetId` populated.
- **R18f — `initialTemporalValues` exhaustiveness + type-shape** (engine.test.ts):
  - Missing key → `EngineConstructionError` with `missing: ["foo"]`, `unknown: []`, `typeMismatches: []`.
  - Unknown key → `EngineConstructionError` with `missing: []`, `unknown: ["typo"]`, `typeMismatches: []`.
  - String override for boolean variable → `typeMismatches: [{ name, expectedType: "boolean", actualType: "string" }]`.
  - `{}` override for `null` initialValue → `typeMismatches: [{ name, expectedType: "null", actualType: "object" }]`. (Synthetic impl declaring `initialValue: null` since no current scope uses `null`.)
  - Happy path: exhaustive correctly-typed override → no throw, `temporalValues` reflects override, `observed` all false.
- **R18a — Replay determinism (two-engine)** (`replay-determinism.test.ts`, new file):
  - Construct engine A directly via `new Engine({ ... })` (bypass the wildfire singleton). Drive a representative event stream covering pre-trigger state changes and within-window state changes. After each `consume()`, call `computeMatchedCategoryForEngine(engineA)` (the helper extracted in Step 1.5) and push the result into a `matchedCategoryHistoryA: (number | null)[]` array. Capture `engineA.readings`, `engineA.temporalValues`, `engineA.observed`, and `matchedCategoryHistoryA`.
  - Construct engine B with **identical** opts. Drive the same `ConsumedEvent[]` through `engineB.consume(...)`, capturing `matchedCategoryHistoryB` the same way.
  - Assert deep equality via Jest `toEqual`:
    ```ts
    expect(engineA.readings).toEqual(engineB.readings);
    expect(engineA.temporalValues).toEqual(engineB.temporalValues);
    expect(engineA.observed).toEqual(engineB.observed);
    expect(matchedCategoryHistoryA).toEqual(matchedCategoryHistoryB);
    ```
  - The captured event stream uses a stub rule set + stub factor variables + a single temporal variable to keep the test focused on the determinism property.

---

### Step 3 — Substrate helper + error rendering

**Summary**: Add the standalone `currentTemporal<V>(reading, name): V | undefined` helper and export it from the substrate. Extend `error-rendering.ts` to render the four new EngineError variants.

**Files affected**:
- `src/hazbot/engine/temporal.ts` (new) — exports `currentTemporal<V>`
- `src/hazbot/engine/temporal.test.ts` (new) — unit tests for the helper
- `src/hazbot/engine/index.ts` — re-export `currentTemporal`
- `src/hazbot/engine/error-rendering.ts` — add four new `case` branches
- `src/hazbot/engine/error-rendering.test.ts` — new test cases for the four variants

**Estimated diff size**: ~150 lines

**Details**:

**`temporal.ts`**:

```ts
import { BaseReading } from "./types";

export function currentTemporal<V>(reading: BaseReading, name: string): V | undefined {
  for (let i = reading.temporalHistory.length - 1; i >= 0; i--) {
    if (reading.temporalHistory[i].name === name) {
      return reading.temporalHistory[i].value as V;
    }
  }
  return undefined;
}
```

**Tests** (`temporal.test.ts`):
- Returns last value for a name in the trail.
- Returns `undefined` when name not present.
- Returns the latest entry when multiple entries for the same name exist (seed + appends).
- Honors order: seed value first, append value last.

**`error-rendering.ts`** — extend the existing `switch (e.kind)`:

```ts
case "temporal-validation":
  return {
    severity: "error",
    message: `Temporal-variable read invalid: ${e.implType === "factorVariable" ? "factor variable" : "sim-prop"} ${e.implName} declares temporalReads "${e.missingVariableName}" but no such temporal variable is declared (ruleset ${e.ruleSetId})`,
  };
case "temporal-reducer-error":
  return {
    severity: "error",
    message: `Temporal-variable reducer threw: ${e.variableName} on event ${e.event.name}: ${String(e.thrown)}`,
  };
case "trigger-state-change-overlap":
  return {
    severity: "error",
    message: `Temporal-variable ${e.variableName} declares acceptedEvents "${e.eventName}" which is also a trigger event for factor variable ${e.factorVariableName} (ruleset ${e.ruleSetId})`,
  };
case "temporal-initial-values-mismatch": {
  const parts: string[] = [];
  if (e.missing.length > 0) parts.push(`missing: ${e.missing.join(", ")}`);
  if (e.unknown.length > 0) parts.push(`unknown: ${e.unknown.join(", ")}`);
  if (e.typeMismatches.length > 0) {
    parts.push(`type mismatches: ${e.typeMismatches.map((t) => `${t.name} expected ${t.expectedType}, got ${t.actualType}`).join("; ")}`);
  }
  return {
    severity: "error",
    message: `initialTemporalValues mismatch (ruleset ${e.ruleSetId}) — ${parts.join(" · ")}`,
  };
}
```

**Tests** (`error-rendering.test.ts`):
- One snapshot-style assertion per new variant verifying `severity` and `message` shape against a sample input.

---

### Step 4 — Wildfire: declare `chartTabOpen` temporal variable + shared constant

**Summary**: Create the bridge-side temporal-variable file and the shared constant for the chart-tab default. Wire `temporalVariables` into the `new Engine(...)` call in `engine-singleton.ts`. Update `right-panel.tsx` and `ui.ts` to import the shared constant (single source of truth per R14).

**Files affected**:
- `src/hazbot/wildfire/constants.ts` (new) — exports `CHART_TAB_INITIAL_OPEN`
- `src/hazbot/wildfire/temporal-variables.ts` (new) — exports `chartTabOpen` impl + `temporalVariables` map
- `src/hazbot/wildfire/index.ts` — re-export `temporalVariables` (if barrel exists; otherwise direct import)
- `src/hazbot/wildfire/engine-singleton.ts` — pass `temporalVariables` to `new Engine(...)`; catch `EngineConstructionError` and stash `caught.errors` in a fallback path
- `src/components/right-panel.tsx` — import `CHART_TAB_INITIAL_OPEN`; use in `useState(CHART_TAB_INITIAL_OPEN)`
- `src/models/ui.ts` — import `CHART_TAB_INITIAL_OPEN`; use in `@observable public showChart = CHART_TAB_INITIAL_OPEN`
- `src/hazbot/wildfire/temporal-variables.test.ts` (new) — R18 reducer unit tests

**Estimated diff size**: ~120 lines

**Details**:

**`constants.ts`**:

```ts
// Single source of truth for the chart-tab visibility at session start.
// Imported by:
// - the chart-tab UI (right-panel useState, ui.showChart MobX observable),
// - the Hazbot temporal variable chartTabOpen (R14).
// If the UI default ever flips, the temporal projection's initial value updates
// in lockstep — TypeScript tracks the dependency.
//
// Considered-and-rejected: a neutral shared location (e.g. `src/shared/`) that
// both UI and bridge import, neutralizing the new UI→bridge dependency edge
// (Pass-4 Finding SB-2). Rejected because creating a new top-level shared
// module for one constant is more architectural ceremony than the dependency
// warrants. Revisit if the bridge accumulates 3+ UI-imported constants.
export const CHART_TAB_INITIAL_OPEN = false;
```

**`temporal-variables.ts`**:

**Convention — pin V at the declaration site (Pass-3 Finding 3)**: every `TemporalVariableImpl` declaration explicitly types its `V` parameter (e.g. `TemporalVariableImpl<boolean>` below). The map type `Record<string, TemporalVariableImpl>` widens to `TemporalVariableImpl<unknown>` at storage, so the declaration site is where the reducer body benefits from narrow typing (`_prev: boolean`, return `boolean`). Substrate consumers (`engine.temporalValues[name]`, `currentTemporal<V>(reading, name)`) receive `unknown` and don't rely on V from the map — the per-key type contract lives at the declaration. Without this convention, a future declaration without explicit V would infer V from the map context (= `unknown`), giving the reducer an untyped `_prev` and quietly losing safety.

```ts
import { TemporalVariableImpl } from "../engine";
import { CHART_TAB_INITIAL_OPEN } from "./constants";

const chartTabOpen: TemporalVariableImpl<boolean> = {
  name: "chartTabOpen",
  initialValue: CHART_TAB_INITIAL_OPEN,
  acceptedEvents: ["ChartTabShown", "ChartTabHidden"],
  reduce: (_prev, event) => event.name === "ChartTabShown",
};

// Explicit `<unknown>` in the map type matches the existing project pattern at
// src/hazbot/wildfire/factor-variables.ts:173. The implicit-default form
// (Record<string, TemporalVariableImpl>) would be structurally equivalent under
// the project's tsconfig (strictFunctionTypes is off — see tsconfig.json), but
// pinning V=unknown explicitly at storage keeps consistency with the
// factorVariables / simProps idiom and signals "V is erased here on purpose."
export const temporalVariables: Record<string, TemporalVariableImpl<unknown>> = {
  chartTabOpen,
};
```

**`engine-singleton.ts`** changes:

Wrap `new Engine(...)` in a try/catch that catches `EngineConstructionError` specifically. On catch, construct a **placeholder engine** that injects the caught errors via the `initialErrors` opt (per Pass-4 Finding MU-1) so the sidebar's `ErrorsPanel` renders them via the existing `renderError` + `describeErrorContext` pipeline (per R7's "the bridge catches `EngineConstructionError` specifically and stashes `errors[]` for sidebar render" clause). The placeholder uses the `missing-rule-set` path (`ruleSet: undefined`) to produce an `isActive: false` engine that no-ops on `consume()` but carries the structured construction errors for sidebar render. Constructor-time injection preserves the engine's "every state mutation ticks" invariant — no post-construction mutation, no missing-tick hazard.

```ts
try {
  const engine: Engine<WildfireReading, WildfireDefaults> = new Engine({
    ruleSet,
    requestedRuleSetId,
    factorVariables,
    simProps,
    temporalVariables,
    translate: (event, sessionId) => {
      const readings = engine.readings;
      const last = readings.length > 0 ? readings[readings.length - 1] : undefined;
      return translate(event, sessionId, last);  // Step 6 will drop the third arg
    },
    runStartTriggers: ["SimulationStarted"],
  });
  cached = engine;
  return engine;
} catch (e) {
  if (e instanceof EngineConstructionError) {
    // Surface caught construction errors via a placeholder engine so the
    // sidebar's ErrorsPanel renders them (R7). The placeholder construction
    // is provably throw-free — see the matching maintenance-gate comment in
    // src/hazbot/engine/engine.ts on the `ruleSet === undefined` branch.
    // `initialErrors` suppresses the engine's synthetic `missing-rule-set`
    // entry (Pass-4 Finding MU-1); the caller-supplied errors are the
    // authoritative diagnostic. The constructor's bottom tickAndNotify()
    // covers them — no post-construction mutation needed.
    const placeholder = new Engine<WildfireReading, WildfireDefaults>({
      ruleSet: undefined,
      requestedRuleSetId,
      factorVariables,
      simProps,
      temporalVariables: {},
      translate,
      runStartTriggers: ["SimulationStarted"],
      initialErrors: e.errors,
    });
    cached = placeholder;
    return placeholder;
  }
  throw e;
}
```

The detailed invariant rationale (why the placeholder is throw-free, why `initialErrors` suppresses the synthetic entry) lives on the engine side rather than inline here — see Step 2's "Maintenance gate" addition to `engine.ts`. Per Pass-3 Finding 5: the audience for "don't break this" is the next person to touch the engine constructor, not the next reader of engine-singleton.ts.

**Test coverage for the placeholder path** — extend [src/hazbot/wildfire/engine-singleton.test.ts](src/hazbot/wildfire/engine-singleton.test.ts) (verified to exist at planning time) with these assertions:

*Bridge-integration tests* (using a ruleset whose construction throws `EngineConstructionError`):
- Construct a singleton with a ruleset configuration that triggers `temporal-validation` (or one of the other construction-time variants).
- Assert `getAnalysisEngine()` returns an `Engine` instance (not undefined, no throw).
- Assert `engine.isActive === false`.
- Assert `engine.errors` contains the expected R7 construction variant(s) with their fields populated.
- Assert `engine.errors` does **not** include any `load-failure: missing-rule-set` entry — confirms the bridge's non-empty `initialErrors` injection suppressed the synthetic entry (per Copilot review, Finding 2).

*Direct-engine suppression-invariant tests* — add to [src/hazbot/engine/engine.test.ts](src/hazbot/engine/engine.test.ts) so the suppression contract is anchored to the substrate, not just the bridge wiring (engine-singleton.test.ts could mask a substrate regression with bridge-side filtering).

**Assertion shape note**: the synthetic `load-failure: missing-rule-set` entry's `at` field is `Date.now()` (engine.ts:89 — pre-existing, matches every other engine-generated construction error). Tests that touch the synthetic entry must assert structurally (`expect.objectContaining({ kind: "load-failure", reason: "missing-rule-set", ruleSetId: ... })` + `toHaveLength(1)`), not via full-object `toEqual`, to keep the assertions deterministic. Per Copilot review.

- `ruleSet: undefined` + `initialErrors: [<one R7 entry>]` → `engine.errors` equals the supplied entries (caller-supplied `at` makes this `toEqual`-safe); `engine.isActive === false` via the extended `hasLoadBlockingError()` (the R7 variant alone is load-blocking now).
- `ruleSet: undefined` + `initialErrors: []` → `engine.errors` has length 1 and the entry matches `expect.objectContaining({ kind: "load-failure", reason: "missing-rule-set" })`; `engine.isActive === false`. Confirms the empty-array fallback (Copilot review, Finding 1).
- `ruleSet: undefined` + `initialErrors` absent → same assertion shape as the empty-array case (existing behavior, pinned explicitly).
- `ruleSet: undefined` + `initialErrors: [<temporal-validation>, <trigger-state-change-overlap>]` → `engine.errors` equals the supplied entries (`toEqual`-safe); no synthetic; `engine.isActive === false`. Confirms `hasLoadBlockingError()` recognizes both variants.

**`right-panel.tsx`** at line 11:

```ts
const [open, setOpen] = useState(CHART_TAB_INITIAL_OPEN);
```

**`ui.ts`** at line 11:

```ts
@observable public showChart = CHART_TAB_INITIAL_OPEN;
```

**Tests** (`temporal-variables.test.ts`):
- `chartTabOpen.reduce(false, { name: "ChartTabShown", at: 0 })` → `true`
- `chartTabOpen.reduce(true, { name: "ChartTabHidden", at: 0 })` → `false`
- `chartTabOpen.reduce(false, { name: "ChartTabHidden", at: 0 })` → `false` (no-op)
- `chartTabOpen.reduce(true, { name: "ChartTabShown", at: 0 })` → `true` (idempotent)
- `chartTabOpen.initialValue === CHART_TAB_INITIAL_OPEN === false`

**Note**: After this step, `GraphOpen` still reads `ambientState`/`updates` (unchanged in this step). The engine now seeds `chartTabOpen` into every reading's `temporalHistory` and tracks live `temporalValues`/`observed`, but no consumer reads these yet. Build/lint/test stays green.

---

### Step 5 — Wildfire: convert `GraphOpen` to read `temporalHistory` + sticky-OR tests

**Summary**: Migrate `GraphOpen` from `ambientState`/`updates` to `reading.temporalHistory`. Add `temporalReads: ["chartTabOpen"]`. Drop `ambientStateKeys` from `GraphOpen`. Convert existing `GraphOpen` and ruleset-25 integration tests per R17's "Convert" bucket.

**Files affected**:
- `src/hazbot/wildfire/sim-props.ts` — rewrite `GraphOpen.evaluate` + add `temporalReads` + drop `ambientStateKeys`
- `src/hazbot/wildfire/sim-props.test.ts` — convert existing `GraphOpen` test setups (ambient/updates → temporalHistory); add R18b's four sticky-OR corners
- `src/hazbot/rule-sets/25.test.ts` — convert ambient-based scenarios to temporal-history-based scenarios; behavior coverage preserved

**Estimated diff size**: ~150 lines

**Details**:

**`sim-props.ts`**:

```ts
const GraphOpen: SimPropImpl<WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  temporalReads: ["chartTabOpen"],
  evaluate: (reading) =>
    reading.temporalHistory.some((c) => c.name === "chartTabOpen" && c.value === true),
};
```

The sticky-OR semantics collapse the pre-refactor "ambient at start OR ChartTabShown modifier during run" into a single `.some(...)` over the trail (per R13). Both seed entries (capturing live `chartTabOpen` at trigger time) and append entries (from `ChartTabShown` during the window) match. R5d's `currentTemporal` would give "last value in window," which is **not** the right semantic for `GraphOpen` — sticky-OR is correct.

**`sim-props.test.ts`** — convert and add (R18b):

Test scenarios for `GraphOpen.evaluate(reading)`:
- Seed-only `true` (chart open at start, no toggles): `reading.temporalHistory = [{ name: "chartTabOpen", value: true, ... }]` → `true`
- Seed `false`, append `true` (closed at start, opened during run): `[{ value: false, eventName: "SimulationStarted" }, { value: true, eventName: "ChartTabShown" }]` → `true`
- Both seed and append `true`: → `true`
- Never open (seed `false`, no appends): `[{ value: false, eventName: "SimulationStarted" }]` → `false`
- Mixed multiple toggles: `[{ value: false, "SimulationStarted" }, { value: true, "ChartTabShown" }, { value: false, "ChartTabHidden" }]` → `true` (sticky-OR ignores the close).

**`25.test.ts`** — convert ambient-based integration scenarios to populate `temporalHistory` instead.

**Audit run at planning time** (`grep -nE "ambientState|chartTabOpenAtStart|ChartTabShown|ChartTabHidden|reading\.updates" src/hazbot/rule-sets/25.test.ts` — per Pass-3 Finding 9): two real conversion targets plus one comment update.

| Line | Test case | Current | Conversion |
|---|---|---|---|
| 43 | `(c) multi-true with highest selected — sparks per zone + graph NOT open → cat 4 AND cat 5` | `ambientState: { chartTabOpenAtStart: false }` | Drop the field; the reading's `temporalHistory: []` from the helper plus the engine's seed (post-Step-2) drives `chartTabOpen=false` automatically. Or — if the helper doesn't seed — explicitly pass `temporalHistory: [{ at: r.at, name: "chartTabOpen", value: false, eventName: "SimulationStarted" }]`. |
| 79 | `(e) AC: SparksAtTopAndBottom-stubbed cat 6 is unreachable` | `ambientState: { chartTabOpenAtStart: true }` | Same conversion — pass `temporalHistory: [{ at: r.at, name: "chartTabOpen", value: true, eventName: "SimulationStarted" }]` to drive `GraphOpen=true` via sticky-OR. |
| 49 | (comment in test "(c)") | references `chartTabOpenAtStart:false, no ChartTabShown` | Comment update — rewrite to `chartTabOpen=false (seed false, no ChartTabShown)` matching the new vocabulary. |

After conversion, `grep -nE "ambientState|chartTabOpenAtStart" src/hazbot/rule-sets/25.test.ts` should return zero matches. The two test cases preserve their original semantics (chart-closed → cat 5; chart-open → cat 6 still unreachable) — only the value-injection mechanism changes.

**Note on `mkReading` helper**: [src/hazbot/rule-sets/test-helpers.ts](src/hazbot/rule-sets/test-helpers.ts) is in Step 1's `temporalHistory: []` audit list. If `mkReading` defaults `temporalHistory` to `[]`, the (c) test's drop-the-field conversion works without any explicit seed; (e)'s conversion still needs an explicit seed (`temporalHistory: [...]` override on the helper call).

**Note**: After this step, the wildfire bridge no longer declares any `ambientStateKeys` (GraphOpen was the only declarer per Technical Notes audit). The engine's ambient-validation path is now dormant in the wildfire bridge (still type-level present, exercised only by synthetic test impls in `consume.test.ts` / `engine.test.ts`). Build/lint/test stays green.

---

### Step 6 — Sidebar: Temporal Variables panel, Readings summary, error rendering

**Summary**: Add the Temporal Variables panel above Sim Props. Update the Sim Props panel to render `· reads: <name>` hints. Update each Readings row's collapsed view to show `chartTabOpen: <value> (N updates)` (per R16's per-variable update-count formula). Sidebar reads `engine.temporalValues` and `engine.observed` directly off the `engine` reference exposed by the hook — matching the existing pattern for `engine.errors` / `engine.readings` (per Pass-4 Findings MR-2 / MU-3). Extend the sidebar's `describeErrorContext` for the four new variants. The legacy "N update(s)" label for `reading.updates` is removed in Step 7 (originally scheduled for Step 9 — see Self-Review decision below).

**Files affected**:
- `src/hazbot/engine/sidebar/sidebar.tsx` — new `TemporalVariablesPanel`, updated `SimPropsPanel`, updated `ReadingRow`'s collapsed view + expanded trail rendering, extended `describeErrorContext`
- `src/hazbot/engine/sidebar/sidebar.css` — new class for "muted/italicized unobserved" temporal-variable values
- `src/hazbot/engine/sidebar/sidebar.test.tsx` — new tests for the panel, summary string, error rendering

**Estimated diff size**: ~250 lines

**Details**:

**Hook surface unchanged.** `useAnalysisEngine`'s `HookReturn` does *not* gain `temporalValues` / `observed` fields. The sidebar reads `engine.temporalValues` and `engine.observed` directly off the `engine` reference already exposed by `HookReturn` — matching the existing pattern for `engine.errors` ([sidebar.tsx:39](src/hazbot/engine/sidebar/sidebar.tsx#L39)) and `engine.readings` ([sidebar.tsx:65](src/hazbot/engine/sidebar/sidebar.tsx#L65)). Per Pass-4 Findings MR-2 and MU-3. The previously-proposed shallow copies allocated per render without defensive value (booleans are immutable; R1 requires complex-V values to be immutable too, so shallow copies don't protect).

**`sidebar.tsx`** — new component:

```tsx
const TemporalVariablesPanel: React.FC<{
  temporalVariableNames: string[];   // declaration order
  values: Record<string, unknown>;
  observed: Record<string, boolean>;
}> = ({ temporalVariableNames, values, observed }) => {
  if (temporalVariableNames.length === 0) return null;
  return (
    <div className="hazbot-sidebar-section">
      <div className="hazbot-sidebar-section-title">Temporal Variables</div>
      {temporalVariableNames.map((name) => (
        <div key={name} className="hazbot-sidebar-entry">
          <strong>{name}</strong>: <span className={observed[name] ? "" : "hazbot-sidebar-temporal-unobserved"}>
            {formatValue(values[name])}
          </span>
        </div>
      ))}
    </div>
  );
};
```

The parent `Sidebar` passes `values={engine.temporalValues}` and `observed={engine.observed}` directly. The component reads live engine state — re-rendering is gated by `useSyncExternalStore`'s snapshot tick (R1's atomic phase-2 commit ensures the live map and `observed` map are consistent at every tick boundary).

Panel order (per R16, Round 4 Architectural Symmetry resolution): Factor Variables → **Temporal Variables** → Sim Props → Readings. Move the panel in the JSX accordingly.

Add CSS:
```css
.hazbot-sidebar-temporal-unobserved {
  font-style: italic;
  color: var(--hazbot-sidebar-muted-color, #888);
}
```

Pass the declaration-ordered name list from `engine.temporalVariableNames` (public-readable field hoisted at construction, per Pass-4 Finding MR-3) — not `Object.keys(engine.temporalVariables)`, which would re-allocate on every snapshot-tick render.

**`SimPropsPanel`** — render `temporalReads` hint:

```tsx
{entries.map(([name, value]) => {
  const impl = engine.simProps[name];
  const reads = impl?.temporalReads;
  return (
    <div key={name} className="hazbot-sidebar-entry">
      <strong>{name}</strong>: {value === null ? <span className="hazbot-sidebar-muted">n/a</span> : String(value)}
      {reads && reads.length > 0 && (
        <span className="hazbot-sidebar-muted"> · reads: {reads.join(", ")}</span>
      )}
    </div>
  );
})}
```

`SimPropsPanel` will need access to `engine.simProps` (the impls). Update its props.

**`ReadingRow`** — replace the collapsed summary string with the temporal-history label per R16. Keep the legacy `reading.updates.length` part for now (deleted in Step 7):

```tsx
function formatTemporalSummary(
  reading: BaseReading,
  variableNames: string[],
): string {
  const N = variableNames.length;
  return variableNames.map((name) => {
    const lastForName = findLast(reading.temporalHistory, (c) => c.name === name);
    const value = lastForName?.value;
    // Single-pass count over the append slice (entries after the seed block).
    // Equivalent to `temporalHistory.slice(N).filter(c => c.name === name).length`
    // but allocation-free — Pass-3 Finding 2. Sidebar re-renders on every engine
    // tick; the cumulative cost compounds with N and readings count.
    let updateCount = 0;
    for (let i = N; i < reading.temporalHistory.length; i++) {
      if (reading.temporalHistory[i].name === name) updateCount++;
    }
    return `${name}: ${formatValue(value)} (${updateCount} updates)`;
  }).join(", ");
}
```

`ReadingRow`'s button text becomes:

```tsx
<strong>{expanded ? "▾" : "▸"} {displayIndex}:</strong> {reading.triggeredBy} · {formatTemporalSummary(reading, temporalVariableNames)} · {reading.updates.length} update(s)
```

The trailing `· {reading.updates.length} update(s)` is the legacy hangover. Originally scheduled for removal in Step 9 (which drops `BaseReading.updates`), but moved forward to **Step 7** to avoid a transient "0 update(s)" reading shown to validators between the Step 7 merge (which stops emitting modifiers, so `reading.updates.length === 0` thereafter) and the Step 9 merge. See Step 7's `sidebar.tsx` edit.

Expanded view renders the full temporal trail in a table:

```tsx
{expanded && (
  <>
    <pre className="hazbot-sidebar-pre">{formatReadingForDisplay(reading)}</pre>
    {reading.temporalHistory.length > 0 && (
      <div className="hazbot-sidebar-temporal-trail">
        <div className="hazbot-sidebar-section-title">Temporal trail</div>
        {reading.temporalHistory.map((c, i) => (
          <div key={i} className="hazbot-sidebar-entry">
            <TimestampInline at={c.at} /> · {c.name}: {formatValue(c.value)} · from {c.eventName}
          </div>
        ))}
      </div>
    )}
  </>
)}
```

**`describeErrorContext`** — add four cases:

```ts
case "temporal-validation":
  return <>{e.implType === "factorVariable" ? "factor variable" : "sim-prop"} {e.implName} · missing temporal variable {e.missingVariableName}</>;
case "temporal-reducer-error":
  return <>variable {e.variableName} · event: {e.event.name} @ <TimestampInline at={e.event.at} /></>;
case "trigger-state-change-overlap":
  return <>variable {e.variableName} · event {e.eventName} · factor variable {e.factorVariableName}</>;
case "temporal-initial-values-mismatch": {
  const parts: React.ReactNode[] = [];
  if (e.missing.length > 0) parts.push(<>missing: {e.missing.join(", ")}</>);
  if (e.unknown.length > 0) parts.push(<>unknown: {e.unknown.join(", ")}</>);
  if (e.typeMismatches.length > 0) {
    parts.push(<>type mismatches: {e.typeMismatches.map((t) => `${t.name} (${t.expectedType} → ${t.actualType})`).join("; ")}</>);
  }
  return <>{parts.map((p, i) => <React.Fragment key={i}>{i > 0 && " · "}{p}</React.Fragment>)}</>;
}
```

**Tests** (`sidebar.test.tsx`):
- Renders the Temporal Variables panel in declaration order between Factor Variables and Sim Props.
- Observed variables render in normal style; unobserved render with the muted class.
- `ReadingRow` collapsed summary string matches the `name: value (N updates)` format for the worked-example trace (seed + 2 appends → "chartTabOpen: false (2 updates)"; seed only → "chartTabOpen: false (0 updates)").
- `ReadingRow` expanded view renders one trail-row per `TemporalVariableChange`.
- `SimPropsPanel` renders `· reads: chartTabOpen` hint for `GraphOpen`.
- Each of the four new EngineError variants renders with the expected error message and context line.

---

### Step 7 — Wildfire: simplify `translate.ts` ChartTab handling + drop engine-singleton's `latestReading` plumbing

**Summary**: `ChartTabShown` and `ChartTabHidden` translate uniformly to `no-op` regardless of run state (R15) — they're pure state-change events now, no longer producing modifiers. Drop the `latestReading` parameter and the engine-singleton's closure that forwards it. The `reading.updates` array no longer accumulates chart-tab modifiers (its only emission site is gone); the orphan-modifier path is dormant.

**Files affected**:
- `src/hazbot/wildfire/translate.ts` — collapse ChartTab cases to `no-op`; drop `latestReading` param; drop `ambient` capture from SimulationStarted (still present on `WildfireReading.ambientState` until Step 9, just no longer populated by translate)
- `src/hazbot/wildfire/engine-singleton.ts` — drop the closure; pass `translate` directly. Also update the comment at [engine-singleton.ts:33](src/hazbot/wildfire/engine-singleton.ts#L33) that mentions `ambientState.chartTabOpenAtStart` — the comment is now stale (the temporal-variable construct has replaced the ambient capture). Rewrite to reference `chartTabOpen` (the temporal variable from Step 4) or remove the comment entirely.
- `src/hazbot/engine/sidebar/sidebar.tsx` — drop the trailing `· {reading.updates.length} update(s)` from `ReadingRow`'s collapsed summary (originally scheduled for Step 9 alongside the `BaseReading.updates` removal, moved forward to this step). After this step lands, the modifier mechanism stops appending to `reading.updates` (it always reads `0`), so leaving the label until Step 9 would show validators a misleading "0 update(s)" badge on every reading row between merges. The label drop is a single-line JSX delete in `ReadingRow`; the surrounding `formatTemporalSummary(...)` segment added in Step 6 becomes the final trailing content.
- `src/hazbot/wildfire/translate.test.ts` — convert ambient pass-through cases; collapse ChartTab no-op-during-run cases to uniform no-op assertions (R17 Convert bucket)

**Estimated diff size**: ~85 lines (was ~80; +1 JSX delete + brief test update if `sidebar.test.tsx` asserted on the label)

**Details**:

**`translate.ts`** — final shape after this step (still has `ambientState`-typed reading field per types.ts; Step 9 cleans):

```ts
export function translate(
  event: ConsumedEvent,
  sessionId: string,
): TranslateResult {
  switch (event.name) {
    case "SimulationStarted": {
      const data = (event.data ?? {}) as Partial<WildfireReading>;
      const reading: WildfireReading = {
        triggeredBy: "SimulationStarted",
        sessionId,
        at: event.at,
        updates: [],
        temporalHistory: [],
        zones: data.zones,
        sparks: data.sparks,
        wind: data.wind,
      };
      return { kind: "trigger", reading };
    }
    case "SimulationEnded":
    case "SimulationStopped": {
      const data = (event.data ?? {}) as Partial<WildfireReading>;
      const reading: WildfireReading = {
        triggeredBy: event.name,
        sessionId,
        at: event.at,
        updates: [],
        temporalHistory: [],
        outcome: data.outcome,
      };
      return { kind: "trigger", reading };
    }
    case "ChartTabShown":
    case "ChartTabHidden":
    case "SimulationRestarted":
    case "SimulationReloaded":
    case "TopBarReloadButtonClicked":
    case "AnalysisEngineActivated":
    default:
      return { kind: "no-op" };
  }
}
```

`ambient` capture is dropped. `ChartTabShown`/`Hidden` are uniform no-ops because the engine's temporal-variable phase (Step 2) handles them via `chartTabOpen.reduce`. No need to gate by `latestReading`.

**`engine-singleton.ts`** changes:

```ts
const engine = new Engine<WildfireReading, WildfireDefaults>({
  ruleSet,
  requestedRuleSetId,
  factorVariables,
  simProps,
  temporalVariables,
  translate,  // direct ref — no closure needed
  runStartTriggers: ["SimulationStarted"],
});
```

The `EngineOpts.translate` signature in `engine.ts` was already `(event, sessionId) => ...` — no change needed there. The wildfire `translate.ts` now matches that exact arity.

**`translate.test.ts`** — convert per R17:
- "SimulationStarted with ambient pass-through" cases → drop ambient assertions, keep reading-shape assertions.
- "ChartTab no-op outside run" + "ChartTab modifier during run" cases → collapse to "ChartTab always no-op."

---

### Step 8 — Host integration: drop `log()`'s third arg + bottom-bar call site

**Summary**: Remove the third `ambientState` parameter from `src/log.ts:16` and the corresponding third arg at `src/components/bottom-bar.tsx:252` (R12). Drop the `ambientState` field from the `ConsumedEvent` passed to `engine.consume()`. Delete the host-side and routing-side tests that exercised this plumbing (R17 Delete bucket: `log.test.ts`, `log-events.test.tsx`).

**Files affected**:
- `src/log.ts` — drop third param + drop `ambientState` from `engine.consume({...})` call
- `src/components/bottom-bar.tsx` — drop third arg from `log("SimulationStarted", ...)` call at line 252
- `src/log.test.ts` — delete tests that asserted third-arg routing through to `engine.consume`
- `src/components/log-events.test.tsx` — delete `chartTabOpenAtStart` plumbing assertions

**Estimated diff size**: ~40 lines (mostly deletions)

**Details**:

**`log.ts`**:

```ts
export const log = (name: string, data?: object): void => {
  externalLog(name, data as Record<string, unknown> | undefined);
  const engine = getAnalysisEngine();
  engine?.consume({ name, data, at: Date.now() });
  if (engine?.isActive && !analysisEngineActivatedEmitted && engine.ruleSet) {
    analysisEngineActivatedEmitted = true;
    externalLog("AnalysisEngineActivated", buildAnalysisEngineActivatedPayload(engine.ruleSet.id));
  }
};
```

**`bottom-bar.tsx`** line 252:

```ts
log("SimulationStarted", configSnapshot);
```

(Drop the `, { chartTabOpenAtStart: ui.showChart }` third arg and the surrounding two-line comment that motivates it.)

**Tests**:

**Audit run at planning time** (`grep -rn "chartTabOpenAtStart\|ambientState" src`): the only host-side files matching are exactly those listed in this step's "Files affected" — [src/log.ts](src/log.ts), [src/components/bottom-bar.tsx](src/components/bottom-bar.tsx), [src/log.test.ts](src/log.test.ts), [src/components/log-events.test.tsx](src/components/log-events.test.tsx). No surprise host-side dependencies; the 40-line estimate holds. All other matches live in substrate/bridge files handled by Steps 5, 7, or 9.

**Note**: After this step, the engine still has the `ConsumedEvent.ambientState` field type-level and the ambient-validation path code-level. But no caller populates it, and no wildfire impl reads it. The wildfire-side `ambient-validation` error path is dormant. The substrate's `consume.test.ts` and `engine.test.ts` still exercise ambient-validation via synthetic test impls — those tests pass unchanged until Step 9 deletes them.

---

### Step 9 — Substrate cleanup: remove ambient-state + modifier surface

**Summary**: Delete the entire ambient-state and modifier-mechanism surface from the substrate (R10, R10b). This is the largest single-step deletion: types, engine internals, error variants, error rendering, sidebar context branches, and the tests that exercised the removed behavior. After this step, the substrate exposes only the temporal-variable construct.

**Files affected**:
- `src/hazbot/engine/types.ts` — remove `ConsumedEvent.ambientState`, `FactorVariableImpl.ambientStateKeys`, `SimPropImpl.ambientStateKeys`, `BaseReading.updates`, `ReadingUpdate`, `ambient-validation` EngineError variant, `orphan-modifier` EngineError variant
- `src/hazbot/engine/engine.ts` — remove `ambientKeysByTrigger` map, `collectFromImpl`'s ambient branch, the ambient-validation block in `consume()`, the modifier branch in the translate-result switch, `checkAmbientForTrigger`, `detectOrphan`, the `findLast` import for `lastFailedTrigger` if no longer needed
- `src/hazbot/engine/error-rendering.ts` — remove the `ambient-validation` and `orphan-modifier` cases
- `src/hazbot/engine/sidebar/sidebar.tsx` — remove `ambient-validation` and `orphan-modifier` cases from `describeErrorContext`; remove the trailing `· {reading.updates.length} update(s)` from `ReadingRow`'s collapsed summary
- `src/hazbot/wildfire/types.ts` — remove `WildfireReading.ambientState`
- `src/hazbot/wildfire/translate.ts` — `TranslateResult` union no longer includes `modifier`; drop the `ReadingUpdate` import; remove `updates: []` from reading literals (since `BaseReading.updates` is gone)
- `src/hazbot/engine/index.ts` — remove the `ReadingUpdate` re-export
- `src/hazbot/engine/find-last.ts` — update the docstring at [find-last.ts:5](src/hazbot/engine/find-last.ts#L5): the example type-guard references `"ambient-validation"` which is gone after this step. Pick a surviving variant (`"temporal-validation"` is the natural successor) or rewrite the example to use `"parse-error"`
- `src/hazbot/wildfire/sidebar.test.tsx` — fixture at [sidebar.test.tsx:57](src/hazbot/wildfire/sidebar.test.tsx#L57) builds a reading literal with `ambientState: {}`; drop the field (the literal already needs `temporalHistory: []` from Step 1; this step drops the dead key)
- `src/hazbot/engine/react/use-analysis-engine.test.tsx` — `consume(...)` call at [use-analysis-engine.test.tsx:77](src/hazbot/engine/react/use-analysis-engine.test.tsx#L77) passes `ambientState: {}`; drop the field
- `src/hazbot/engine/consume.test.ts` — DELETE the enumerated ambient-validation and orphan-modifier tests (per Pass-3 Finding 10 audit below; R17 Delete bucket)
- `src/hazbot/engine/engine.test.ts` — DELETE the `ambientKeysByTrigger` collection test at line 126 (R17 Delete bucket)
- `src/hazbot/engine/error-rendering.test.ts` — DELETE the ambient-validation `it(...)` (line 43) and the entire orphan-modifier `describe(...)` block (lines 54-90+) (R17 Delete bucket)
- `src/hazbot/engine/sidebar/sidebar.test.tsx` — DELETE tests for the removed describeErrorContext cases and the "N update(s)" label

**Test-deletion audit (per Pass-3 Finding 10)** — enumerated at planning time via `grep -nE "ambient-validation|chartTabOpenAtStart|ambientState:|ambientStateKeys|orphan-modifier|kind: \"modifier\"" src/hazbot/engine/{consume,engine,error-rendering}.test.ts`. The "~9 cases" in the original Step 9 estimate was approximate; actual counts split across two error families:

**ambient-validation tests to DELETE (5 total)**:
| File | Line | Test name |
|---|---|---|
| consume.test.ts | 71 | `it("ambient-validation cardinality: 2 impls × 2 missing keys = 4 errors, all sharing same event ref (Req 3b)", ...)` |
| consume.test.ts | 117 | `it("ambient-validation: missing required key produces ambient-validation error and no Reading", ...)` |
| consume.test.ts | 231 | `it("ambient-validation does not fire for unreferenced impls that declare ambient keys", ...)` |
| engine.test.ts | 126 | `it("collects ambient-state keys per trigger across factor-vars and sim-props", ...)` |
| error-rendering.test.ts | 43 | `it("renders ambient-validation", ...)` |

**orphan-modifier / modifier tests to DELETE (7 total)**:
| File | Line | Test name |
|---|---|---|
| consume.test.ts | 145 | `it("subsequent ChartTabShown after a failed SimulationStarted gets \`prior-trigger-failed\`", ...)` |
| consume.test.ts | 171 | `it("modifier with no prior trigger (bootstrap) gets \`no-prior-trigger\`", ...)` |
| consume.test.ts | 185 | `it("modifier between-runs (latest reading is SimulationEnded) gets \`between-runs\`", ...)` |
| consume.test.ts | 202 | `it("modifier appends to latest reading when run is in progress and ticks the snapshot", ...)` |
| error-rendering.test.ts | 54 | `describe("orphan-modifier", ...)` — three `it(...)` cases inside: `no-prior-trigger` (line 56), `prior-trigger-failed` (line 67), `between-runs` (line 78) |

Other audit hits in these files (lines 8, 18, 28, 32, 65, 78, 83, 101, 104, 107, 111, 120, 121, 137, 141, 148, 149, 166, 167, 180, 181, 193, 196, 198, 210, 235, 247, 261, 6) are either local helper-type fields (`ambientState?:` in TestReading), test-impl synthetic `ambientStateKeys` declarations, or call-site arguments inside the enumerated tests above — all delete naturally when the enclosing test or helper is removed. After deletion, `grep -nE "ambient-validation|chartTabOpenAtStart|ambientState:|ambientStateKeys|orphan-modifier|kind: \"modifier\"" src/hazbot/engine/*.test.ts` must return zero matches (phase-2 gate below).

**Estimated diff size**: ~400 lines (mostly deletions; new code <30 lines)

**Details**:

**Engine `consume()`** post-cleanup:

```ts
consume(event: ConsumedEvent): void {
  if (!this.isActive) return;

  // (temporal-variable phase from Step 2 — unchanged)
  // ...

  const result = this.translate(event, this.sessionId);
  // `mutated` was declared and seeded at the top of consume() during the temporal phase (Step 2).
  switch (result.kind) {
    case "trigger": {
      const reading = result.reading;
      for (const name of this.temporalVariableNames) {  // hoisted field — Pass-3 Finding 1
        reading.temporalHistory.push({
          at: reading.at,
          name,
          value: this.temporalValues[name],
          eventName: event.name,
        });
      }
      this.readings.push(reading);
      mutated = true;
      break;
    }
    case "no-op":
      break;
    default: {
      const _exhaustive: never = result;
      throw new Error(`consume: unhandled translate result ${(_exhaustive as { kind: string }).kind}`);
    }
  }
  if (mutated) this.tickAndNotify();
}
```

`TranslateResult` collapses to `{ kind: "trigger"; reading: TReading } | { kind: "no-op" }`.

**Other audit checks (two-phase, per Pass-3 Finding 11)**:

The audit pattern is `grep -rn "ambientState\|ambient-validation\|ambientStateKeys\|orphan-modifier\|ReadingUpdate\|reading\.updates\|lastReading\.updates\|updates:\s*\[" src`. The pattern uses `reading\.updates` / `lastReading\.updates` rather than the broader `\.updates\b` to avoid false-positive matches on unrelated identifiers (`state.updates`, `props.updates`, MobX `.updates`, etc.) that would swamp the audit gate.

Run in two phases — not a single check — to surface partial-deletion leaks:

- **Phase 1 (before any deletion/modification this step)**: the pattern returns matches *only* in files listed in "Files affected" above (substrate types, engine internals, error rendering, sidebar, wildfire bridge, the four test files scheduled for case-level deletion). Any match in an unlisted file is a missed touchpoint — add to "Files affected" before proceeding. The four touchpoints surfaced at planning time (engine-singleton.ts:33, find-last.ts:5, sidebar.test.tsx:57, use-analysis-engine.test.tsx:77) would have failed Phase 1 had they not been folded in.
- **Phase 2 (after deletion + modification, before commit)**: the pattern returns **zero matches** across the entire `src/` tree. A non-zero result means a deletion-targeted file retained a reference (the partial-deletion leak the two-phase audit is meant to catch).

Both phases are gates — Phase 1 catches "did we plan the deletion completely?", Phase 2 catches "did we execute the deletion completely?" Phase-1-only would accept a missed partial deletion as long as it landed in a file scheduled for change; Phase-2-only would conflate "right file, right targets" with "right file, wrong targets" (e.g., deleting one ambient test but leaving another).

Plus:
- `npm run build` must compile (TS will surface any stragglers).
- `npm run lint` must pass.
- `npm test` must pass.

**Planning-time audit run** with the sharpened pattern surfaced four files outside Step 9's original "Files affected" list — now folded in above ([engine-singleton.ts:33](src/hazbot/wildfire/engine-singleton.ts#L33) comment moved to Step 7; [find-last.ts:5](src/hazbot/engine/find-last.ts#L5) docstring, [sidebar.test.tsx:57](src/hazbot/wildfire/sidebar.test.tsx#L57) fixture, and [use-analysis-engine.test.tsx:77](src/hazbot/engine/react/use-analysis-engine.test.tsx#L77) consume-call added to this step). Estimate impact: ~5 additional lines across these four edits; the 400-line Step 9 estimate is unchanged at the rounding level. Without these four touchpoints, the audit gate above would have failed at implementation time.

**`ReadingRow`** collapsed summary final shape (the trailing `· {reading.updates.length} update(s)` was already dropped in Step 7; this step just removes the now-unused `reading.updates` reference path with the substrate type-level deletion):

```tsx
<strong>{expanded ? "▾" : "▸"} {displayIndex}:</strong> {reading.triggeredBy} · {formatTemporalSummary(reading, temporalVariableNames)}
```

**No new tests** in this step beyond audit-grep verification. The R17 Delete bucket is the test surface that goes away.

**Commit message convention** — this step lands as one ~400-line commit dominated by deletions across ~14 files. If a regression appears after this commit lands, `git bisect` will land here, and the developer needs a navigable deletion summary to identify which removed surface to investigate. The commit message body must enumerate the deletions by file (transcribe the "Files affected" list above verbatim into the body, one bullet per file with a one-line summary of what was removed). Example skeleton:

```
refactor(hazbot): retire ambient-state and modifier-mechanism surface

Final step of the WM-10 temporal-variables refactor. Removes the dead
ambient-state and modifier-mechanism surface now that `temporalHistory`
+ `temporalReads` (introduced in Steps 1-8) cover the use case.

Deletions by file:
- src/hazbot/engine/types.ts — ConsumedEvent.ambientState, ambientStateKeys
  on Factor/SimPropImpl, BaseReading.updates, ReadingUpdate,
  ambient-validation + orphan-modifier EngineError variants
- src/hazbot/engine/engine.ts — ambientKeysByTrigger map, collectFromImpl
  ambient branch, ambient-validation block in consume(), modifier branch
  in translate-result switch, checkAmbientForTrigger, detectOrphan
- src/hazbot/engine/error-rendering.ts — ambient-validation and
  orphan-modifier cases
- src/hazbot/engine/sidebar/sidebar.tsx — ambient-validation and
  orphan-modifier cases in describeErrorContext
- src/hazbot/wildfire/types.ts — WildfireReading.ambientState
- src/hazbot/wildfire/translate.ts — modifier from TranslateResult union,
  ReadingUpdate import, updates: [] from reading literals
- src/hazbot/engine/index.ts — ReadingUpdate re-export
- src/hazbot/engine/find-last.ts — stale ambient-validation example in
  docstring (rewritten to use temporal-validation)
- src/hazbot/wildfire/sidebar.test.tsx — ambientState: {} fixture
- src/hazbot/engine/react/use-analysis-engine.test.tsx — ambientState: {}
  in consume() call
- src/hazbot/engine/consume.test.ts — DELETE 9 ambient-validation cases
  + orphan-modifier dispatch tests
- src/hazbot/engine/engine.test.ts — DELETE ambientKeysByTrigger
  collection test
- src/hazbot/engine/error-rendering.test.ts — DELETE ambient + orphan-
  modifier rendering tests
- src/hazbot/engine/sidebar/sidebar.test.tsx — DELETE tests for removed
  describeErrorContext cases + "N update(s)" label

Audit (run before commit): `grep -rn
"ambientState\|ambient-validation\|ambientStateKeys\|orphan-modifier\|
ReadingUpdate\|reading\.updates\|lastReading\.updates\|updates:\s*\["
src` returns zero matches outside the test files listed above.
```

The body adds ~30 lines to the commit message but turns `git show <step9-sha>` into a navigable summary instead of a 400-line diff dump. Reviewers should enforce this at PR time — a commit landing this step without a deletion manifest body is incomplete.

---

### Step 10 — R18c replay fixture: generator script + fixtures + regression test

**Summary**: Add the checked-in fixture infrastructure for the headline replay regression test. A JS generator script captures a scenario (events + expected output) by running the wildfire bridge's full pipeline. Test loads the fixtures and asserts strict equality on all four pinned dimensions (`readings`, `matchedCategory`, `observed`, `temporalValues`).

**Files affected**:
- `scripts/generate-replay-fixture.js` (new) — JS generator, JSDoc-typed, no TS compile step
- `src/hazbot/wildfire/__fixtures__/events.json` (new, generated) — captured event stream + optional `initialTemporalValues`
- `src/hazbot/wildfire/__fixtures__/expected.json` (new, generated) — expected `readings` + `matchedCategory` history + final `observed` + final `temporalValues`
- `src/hazbot/wildfire/__fixtures__/README.md` (new) — regeneration command, what the fixture covers, what triggers regeneration
- `src/hazbot/wildfire/replay-fixture.test.ts` (new) — loads fixtures, runs replay, strict-equals

**Estimated diff size**: ~400 lines (generator ~150; fixtures ~150; test ~50; README ~50)

**Details**:

**Prerequisites** (verified at planning time, per Copilot review):
- `ts-node` is a dev dep at `^10.9.1` in `package.json` — no install step required.
- Repo is CommonJS-default — `package.json` has no `"type": "module"`, so the generator's `require(...)` calls work as written.
- If either prerequisite breaks in the future (ts-node removed, repo migrates to ESM-only), switch to the compiled-output fallback named in the audit note below.

**`ts-node` bootstrap audit** — Verified at planning time: the generator's `require()` set (`engine.ts`, `evaluator.ts`, `factor-variables.ts`, `sim-props.ts`, `temporal-variables.ts`, `translate.ts`, `rule-sets/index.ts`, and the seven `rule-sets/N.ts` files) transitively imports only substrate-internal modules (`parser`, `session-id`, `validate-defaults`, `walk-references`, `find-last`, plus the wildfire `types` and `factor-variable-stubs`). No React, MobX, three.js, SCSS, or decorator-using surface anywhere in the closure. `ts-node/register/transpile-only` handles this set without further configuration. If a future temporal variable or rule set adds an import that pulls in non-trivial-for-ts-node modules (React, MobX decorators, etc.), the generator must switch to a compiled-output approach (e.g., `tsc --outDir scripts/.fixture-build` + require the JS).

**`scripts/generate-replay-fixture.js`** — JS file (matching the playbook generator's pattern). Invoked via `node scripts/generate-replay-fixture.js`. Skeleton:

```js
// @ts-check
const fs = require("fs");
const path = require("path");

// Bootstrap a TS runtime for require()'ing TS modules. Use ts-node/register
// (already a dev dep based on jest config) or a similar pattern.
require("ts-node/register/transpile-only");

const { Engine } = require("../src/hazbot/engine/engine");
const { computeMatchedCategoryForEngine } = require("../src/hazbot/engine/evaluator");
const { factorVariables } = require("../src/hazbot/wildfire/factor-variables");
const { simProps } = require("../src/hazbot/wildfire/sim-props");
const { temporalVariables } = require("../src/hazbot/wildfire/temporal-variables");
const { translate } = require("../src/hazbot/wildfire/translate");
const { ruleSets } = require("../src/hazbot/rule-sets");

// Deterministic monotonic-integer timestamp (per R18c "Timestamp normalization")
let nextAt = 1000;
function tick() { return nextAt++; }

// Scenario: covers R18b's four sticky-OR corners via four explicit runs.
// Each run is preceded by a pre-trigger toggle that drives the seed value at
// the next SimulationStarted; within-window toggles drive the appends.
//
// Data-payload prototype (per Pass-3 Finding 8): use the SimulationStarted
// shape from test case "(c) multi-true with highest selected" in
// src/hazbot/rule-sets/25.test.ts as the corner-1 baseline:
//   {
//     zones: [{ index: 0 }, { index: 1 }],
//     sparks: [{ x: 0, y: 0, zoneIdx: 0 }, { x: 1, y: 0, zoneIdx: 1 }],
//     wind: { speed: 0, direction: 0 },
//   }
// This shape drives OneSparkPerZone=true, which lights the cat-5/cat-6 path
// and exercises the GraphOpen sim-prop's sticky-OR semantics directly.
//
// For SimulationEnded: `data.outcome` is opaque to current rule sets
// (WildfireReading.outcome: unknown — see src/hazbot/wildfire/types.ts:12).
// Pass `{ outcome: null }` or omit `data` entirely.
//
// Adjust spark counts / wind across corners 2-4 if needed to vary the
// classification, but the corner is fundamentally about chart-tab state
// (seed + appends), not about spark layout — keeping the data identical
// across all four corners isolates GraphOpen as the only varying input.
// Shared SimulationStarted data — see prototype reference in the comment block above.
const startData = {
  zones: [{ index: 0 }, { index: 1 }],
  sparks: [{ x: 0, y: 0, zoneIdx: 0 }, { x: 1, y: 0, zoneIdx: 1 }],
  wind: { speed: 0, direction: 0 },
};
const endData = { outcome: null };

const scenario = [
  // === Corner 1 (R18b): seed-only TRUE — chart open at start, never toggled during run ===
  { name: "ChartTabShown" },                              // pre-trigger: chartTabOpen=true; next start seeds true
  { name: "SimulationStarted", data: startData },
  { name: "SimulationEnded", data: endData },

  // === Corner 2 (R18b): seed FALSE + within-window append TRUE — closed at start, opened during run ===
  { name: "ChartTabHidden" },                             // pre-trigger: chartTabOpen=false; next start seeds false
  { name: "SimulationStarted", data: startData },
  { name: "ChartTabShown" },                              // within-window append: chartTabOpen=true mid-run
  { name: "SimulationEnded", data: endData },

  // === Corner 3 (R18b): seed TRUE + within-window appends — open at start AND additional toggles ===
  { name: "ChartTabShown" },                              // pre-trigger: ensure chart is shown for the seed
  { name: "SimulationStarted", data: startData },
  { name: "ChartTabHidden" },                             // within-window append: close mid-run
  { name: "ChartTabShown" },                              // within-window append: re-open mid-run
  { name: "SimulationEnded", data: endData },

  // === Corner 4 (R18b): NEVER open — seed FALSE, no within-window appends ===
  { name: "ChartTabHidden" },                             // pre-trigger: ensure chart closed
  { name: "SimulationStarted", data: startData },
  { name: "SimulationEnded", data: endData },
];

const events = scenario.map((e) => ({ ...e, at: tick() }));

// Build engine and feed events
const engine = new Engine({
  ruleSet: ruleSets["25"],
  requestedRuleSetId: "25",
  factorVariables,
  simProps,
  temporalVariables,
  translate,
  runStartTriggers: ["SimulationStarted"],
});
const matchedCategoryHistory = [];
for (const event of events) {
  engine.consume(event);
  matchedCategoryHistory.push(computeMatchedCategoryForEngine(engine));
}

// Sort keys for the two top-level maps that are vulnerable to insertion-order
// drift under future engine refactors. Scoped — `readings` keep natural engine-
// side order for human readability at PR time; `matchedCategoryHistory` is an
// array (order is semantic). Only the generator side needs this; Jest's
// `toEqual` is key-order-agnostic for objects, so the fixture test compares
// directly without symmetric sorting.
function sortKeys(obj) {
  const sorted = {};
  for (const k of Object.keys(obj).sort()) sorted[k] = obj[k];
  return sorted;
}

const expected = {
  readings: engine.readings,
  observed: sortKeys(engine.observed),
  temporalValues: sortKeys(engine.temporalValues),
  matchedCategoryHistory,
};

// JSON-safety gate (R1 constraint enforcement at the generator boundary, per
// Copilot review). The test-side roundTrip + undefined canary only catches
// `undefined`; Map/Set/Date/NaN/Infinity coerce *symmetrically* under
// JSON.stringify, so a broken temporal value passes toEqual against the
// stripped fixture. Catching at generation time fails loud at the moment the
// violation is introduced (fixture regen by a maintainer) rather than silently
// in CI.
function assertJsonSafe(value, descriptor) {
  if (value === null) return;
  const t = typeof value;
  if (t === "boolean" || t === "string") return;
  if (t === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`JSON-safety violation at ${descriptor}: non-finite number ${value} (NaN/Infinity not JSON-safe per R1)`);
    }
    return;
  }
  if (t === "undefined") {
    throw new Error(`JSON-safety violation at ${descriptor}: undefined (stripped by JSON.stringify per R1)`);
  }
  if (t !== "object") {
    throw new Error(`JSON-safety violation at ${descriptor}: ${t} (only primitives + plain objects/arrays are JSON-safe per R1)`);
  }
  if (value instanceof Map || value instanceof Set || value instanceof Date) {
    throw new Error(`JSON-safety violation at ${descriptor}: ${value.constructor.name} (coerces under JSON.stringify per R1)`);
  }
  if (Object.getPrototypeOf(value) !== Object.prototype && !Array.isArray(value)) {
    throw new Error(`JSON-safety violation at ${descriptor}: class instance ${value.constructor?.name ?? "(anonymous)"} (only plain objects per R1)`);
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertJsonSafe(v, `${descriptor}[${i}]`));
  } else {
    for (const [k, v] of Object.entries(value)) assertJsonSafe(v, `${descriptor}.${k}`);
  }
}
for (const [name, value] of Object.entries(engine.temporalValues)) {
  assertJsonSafe(value, `temporalValues.${name}`);
}
engine.readings.forEach((r, i) => {
  r.temporalHistory.forEach((c, j) => {
    assertJsonSafe(c.value, `readings[${i}].temporalHistory[${j}].value`);
  });
});

const fixturesDir = path.resolve(__dirname, "../src/hazbot/wildfire/__fixtures__");
fs.mkdirSync(fixturesDir, { recursive: true });
fs.writeFileSync(path.join(fixturesDir, "events.json"), JSON.stringify({ events }, null, 2));
fs.writeFileSync(path.join(fixturesDir, "expected.json"), JSON.stringify(expected, null, 2));
console.log("Replay fixture regenerated.");
```

**`__fixtures__/README.md`**:

```markdown
# Hazbot replay fixtures

These files pin the engine's classification output for ruleset 25 against a
representative event scenario. See [requirements.md R18c](../../../specs/WM-10-hazbot-temporal-variables/requirements.md) for the full contract.

## Regeneration

When `replay-fixture.test.ts` fails because behavior intentionally changed
(new category, refined factor variable, new temporal variable, expanded
scenario coverage), regenerate:

    node scripts/generate-replay-fixture.js

Then inspect the diff for both files. Only intended changes should appear.
Commit the regenerated fixture in the same PR. **Do not disable or skip the
test in lieu of regeneration** — the diff is the review surface for semantic
drift.

## Scenario coverage

The current scenario exercises:
- Pre-trigger state changes (R5b "no reading yet" — live update only)
- Within-window state changes (R5b appends)
- R18b's four sticky-OR corners across multiple `SimulationStarted` /
  `SimulationEnded` cycles

Future rule sets exercising novel substrate constructs should add their own
fixture pair under this directory (per R18c "Scope").
```

**`replay-fixture.test.ts`**:

```ts
import { readFileSync } from "fs";
import { resolve } from "path";
import { Engine, computeMatchedCategoryForEngine } from "../engine";
import { factorVariables } from "./factor-variables";
import { simProps } from "./sim-props";
import { temporalVariables } from "./temporal-variables";
import { translate } from "./translate";
import { ruleSets } from "../rule-sets";

describe("ruleset 25 — replay fixture regression", () => {
  it("matches expected readings, observed, temporalValues, matchedCategory history", () => {
    const fixturesDir = resolve(__dirname, "__fixtures__");
    const eventsFile = JSON.parse(readFileSync(resolve(fixturesDir, "events.json"), "utf8"));
    const expectedFile = JSON.parse(readFileSync(resolve(fixturesDir, "expected.json"), "utf8"));

    const opts = {
      ruleSet: ruleSets["25"],
      requestedRuleSetId: "25",
      factorVariables,
      simProps,
      temporalVariables,
      translate,
      runStartTriggers: ["SimulationStarted"],
      // Only pass the override if present (R18c — field present = pass to constructor)
      ...(eventsFile.initialTemporalValues !== undefined
        ? { initialTemporalValues: eventsFile.initialTemporalValues }
        : {}),
    };
    const engine = new Engine(opts);
    const matchedCategoryHistory: (number | null)[] = [];
    for (const event of eventsFile.events) {
      engine.consume(event);
      matchedCategoryHistory.push(computeMatchedCategoryForEngine(engine));
    }

    // Pre-round-trip the engine output before comparing. Symmetric with the
    // fixture's JSON.parse(...) path. Defensive layer behind the primary
    // enforcement: the generator script (see "JSON-safety gate" in the
    // generator's assertJsonSafe walker, per Copilot review) throws at fixture-
    // regen time on Map/Set/Date/NaN/class instances. Test-side roundTrip
    // catches the residual undefined-stripping hole only (Map/Set/Date/NaN
    // coerce symmetrically here and would pass silently — the generator gate
    // is the load-bearing R1 enforcement).
    const roundTrip = <T>(v: T): T => JSON.parse(JSON.stringify(v));

    expect(roundTrip(engine.readings)).toEqual(expectedFile.readings);
    expect(roundTrip(engine.observed)).toEqual(expectedFile.observed);
    expect(roundTrip(engine.temporalValues)).toEqual(expectedFile.temporalValues);
    expect(matchedCategoryHistory).toEqual(expectedFile.matchedCategoryHistory);

    // R1 JSON-safe canary — `undefined` survives toEqual against itself but is
    // stripped by JSON.stringify, so a buggy reducer producing `undefined` would:
    // (a) live-mutate temporalValues, (b) get stripped on both sides of the fixture
    // round-trip, (c) pass toEqual against the (also-stripped) fixture. Catch this
    // here so a reducer-output regression surfaces as a clear "received undefined"
    // failure naming the offending property, rather than silent semantic drift over
    // time. Not duplicated into R18a's two-engine determinism test — that test
    // compares two live engines symmetrically, so an `undefined` on both sides
    // would equal itself and the canary adds no value there.
    for (const value of Object.values(engine.temporalValues)) {
      expect(value).toBeDefined();
    }
    for (const observed of Object.values(engine.observed)) {
      expect(observed).toBeDefined();
    }
  });
});
```

**Note**: `computeMatchedCategoryForEngine` is added to the substrate in Step 1.5 (prep refactor — see Step 1.5 → "Files affected" → `evaluator.ts`). Both the R18c test above and the generator script use it directly, so the matchedCategory computation is shared with the React hook ([use-analysis-engine.ts](src/hazbot/engine/react/use-analysis-engine.ts)) without React being on the import path.

**Note on `roundTrip`**: `matchedCategoryHistory` is `(number | null)[]` — already JSON-safe by construction (numbers and `null` only), so it's compared directly without `roundTrip(...)`. If a future engine change makes `matchedCategory` non-numeric, add `roundTrip(matchedCategoryHistory)` symmetrically.

---

### Step 11 — Documentation: engine README + CLAUDE.md

**Summary**: Update `src/hazbot/engine/README.md` with the three required sections (R19) — concept, worked walkthrough, "Adding a temporal variable" checklist. Add a row to CLAUDE.md's "Common commands" table for the replay-fixture generator (R20a).

**Files affected**:
- `src/hazbot/engine/README.md` — add "Temporal Variables" section, worked example, and "Adding a temporal variable" checklist
- `CLAUDE.md` — add a row to the "Common commands" table

**Estimated diff size**: ~120 lines (README ~110; CLAUDE.md ~5)

**Details**:

**README.md** content (added as a new section, structured per R19):

```markdown
## Temporal Variables

A *temporal variable* is an engine-maintained projection that folds logged
state-change events into a value trail per reading. The construct replaces
the legacy ambient-state side channel and the generic modifier mechanism
(removed in this PR — see [WM-10 spec](../../../specs/WM-10-hazbot-temporal-variables/requirements.md) R10, R10b).

A temporal variable is declared bridge-side via `TemporalVariableImpl<V>`:

    interface TemporalVariableImpl<V> {
      name: string;
      initialValue: V;
      acceptedEvents: string[];
      reduce: (currentValue: V, event: ConsumedEvent) => V;
    }

The engine maintains a live `temporalValues: Record<string, unknown>` map
(current projected value per variable) and an `observed: Record<string, boolean>`
flag. The `observed` flag is sticky — it flips to `true` on the first matching
event for a variable and stays `true` for the engine's lifetime (not reset
across triggers, not reset between runs). The sidebar uses it to render
unobserved values in muted italics, so dev validators can tell at a glance
which variables have been exercised vs. which are still at their initial value.

On each `consume(event)`:

1. Phase 1: for every declared variable whose `acceptedEvents` matches the
   event, the reducer runs into a buffer. No live mutation.
2. Phase 2 (only if no reducer threw): `temporalValues` and `observed` commit
   atomically; if a reading exists, a `TemporalVariableChange` appends to its
   `temporalHistory`. If no reading exists yet, the live commit still fires
   but the append is a no-op.
3. The translate callback then runs. On `kind: "trigger"`, the new reading's
   `temporalHistory` is seeded with one entry per declared variable
   (current value at trigger time).

Read patterns:
- `currentTemporal<V>(reading, name)` — last value in the reading's window.
- `reading.temporalHistory.some(c => c.name === N && c.value === V)` —
  sticky-OR: "was the variable ever V during the window?"

### Worked example

For a rule set declaring one temporal variable `chartTabOpen: boolean`
(initial `false`, accepted events `["ChartTabShown", "ChartTabHidden"]`),
consuming `[A:trigger, ChartTabShown@t1, ChartTabHidden@t2, B:trigger]` produces:

    readings[0] (created at A)
      temporalHistory: [
        { at: A.at, name: "chartTabOpen", value: false, eventName: "A" },              // R5a seed
        { at: t1,   name: "chartTabOpen", value: true,  eventName: "ChartTabShown" },  // R5b append
        { at: t2,   name: "chartTabOpen", value: false, eventName: "ChartTabHidden" }, // R5b append
      ]

    readings[1] (created at B)
      temporalHistory: [
        { at: B.at, name: "chartTabOpen", value: false, eventName: "B" },              // R5a seed
      ]

The wildfire bridge's [chartTabOpen impl](../wildfire/temporal-variables.ts)
is the concrete in-tree example.

### Adding a temporal variable

1. Declare a `TemporalVariableImpl<V>` in the wildfire bridge (parallel to
   `chartTabOpen` in `src/hazbot/wildfire/temporal-variables.ts`).
2. Add it to the `temporalVariables` map exported from that file. The map
   is passed to `new Engine(...)` in `engine-singleton.ts` (no change needed
   there).
3. If a factor variable or sim-prop impl reads the new variable, add its
   name to the impl's `temporalReads: string[]` array. The engine validates
   this at construction time (`temporal-validation` EngineError variant).

   Note: `temporalReads` is advisory. The engine validates one direction
   (catches references to undeclared variables) but doesn't introspect impl
   bodies to verify the impl actually reads what it declares. A stale entry
   (refers to a variable the impl no longer reads) is harmless but
   misleading — keep the list in sync with the impl body manually.
4. Add unit tests for the reducer in
   `src/hazbot/wildfire/temporal-variables.test.ts` — one assertion per
   matching event, one per non-matching event.
5. If the variable affects classification in ruleset 25 (the fixture-pinned
   rule set), regenerate the R18c replay fixture:

       node scripts/generate-replay-fixture.js

   Review the diff for `__fixtures__/events.json` and `expected.json` —
   only intended changes should appear. Commit the regenerated fixture in
   the same PR.

6. If you need to pin initial values for tests or captured-log replay,
   pass `initialTemporalValues: { yourVarName: value, ... }` to
   `new Engine(...)`. The override is validated at construction time for
   exhaustiveness (every declared variable must have an entry) and runtime
   type-shape (override type must match the variable's `initialValue`
   type). Missing keys, unknown keys, or type mismatches throw
   `EngineConstructionError` with a `temporal-initial-values-mismatch`
   variant.
```

**CLAUDE.md** — append a row to the "Common commands" table:

```markdown
| Regenerate replay fixture | `node scripts/generate-replay-fixture.js` |
```

(Slot it next to the existing playbook-generator row.)

**Confirmation audits** (R20, R21) — both requirements are conditional/confirm-only and produce no code change in the expected case; this step records the confirmation so they aren't missed at PR time:

- **R20**: re-read [docs/hazbot-update-workflow.md](docs/hazbot-update-workflow.md) and confirm the per-ruleset workflow it describes (edit rule-set file → regenerate validation playbook → walk against dev server → update spec) is unaffected. Temporal variables are declared bridge-side, not in the auto-generated rule-set modules, so the workflow steps don't change. Expected result: no edit. If unexpectedly an edit *is* needed, capture it here.
- **R21**: re-read [scripts/extract-impl.js](scripts/extract-impl.js) and [scripts/extract-hazbot-sheets.js](scripts/extract-hazbot-sheets.js) and confirm neither references `ambientState`, `ambientStateKeys`, `updates`, `ReadingUpdate`, or any temporal-variable concept. The extraction scripts produce rule-set TS modules whose surface (categories + factor-variable definitions) is unchanged by this PR. Expected result: no edit.

Both audits land in the PR description as confirmation lines; no code or doc change is expected.

**No new tests** in this step — README and CLAUDE.md changes are inert documentation.

---

## Open Questions

<!-- Implementation-focused questions only. Requirements questions go in requirements.md. -->

### RESOLVED: How should the wildfire engine-singleton surface a caught `EngineConstructionError`?
**Decision**: B — placeholder engine with construction errors spliced into `errors`. Matches R7's literal guidance ("the bridge catches `EngineConstructionError` specifically and stashes `errors[]` for sidebar render via the same `renderError` + `describeErrorContext` pipeline"). The dev-only-today precondition justifies single-PR bundling and deferring captured-log migration, but doesn't justify weakening the dev-time diagnostic surface — dev is exactly when structured errors in the sidebar beat a stack trace in the console. Step 4's `engine-singleton.ts` snippet replaces the re-throw path with a placeholder construction (`ruleSet: undefined`, `temporalVariables: {}`) so the singleton always returns an `Engine` instance with `isActive: false` and the structured errors readable via `engine.errors`.

---

### RESOLVED: Should existing construction-time errors also throw via `EngineConstructionError`?
**Decision**: A — keep asymmetric. The new R7 variants (`temporal-validation`, `trigger-state-change-overlap`, `temporal-initial-values-mismatch`) throw via `EngineConstructionError`; the existing variants (`parse-error`, `load-failure`/`missing-impl`/`missing-defaults`) keep pushing to `engine.errors`. The asymmetry is a deliberate design choice grounded in different failure modes: the new variants are *fundamental misconfiguration* where returning an inert-but-live engine would invite silent miswiring (R7's "no engine instance is ever returned" clause makes this explicit); the existing variants are *partial brokenness* (one bad category among many) where the current always-succeed-then-gate-via-`isActive` model preserves useful partial recovery. The bridge handles both shapes cleanly after Q1's catch-and-stash path: try/catch for the throw, `engine.errors` reads for the push.

**Implementation note**: Step 2 should call out this asymmetry in a comment in `engine.ts` near the construction-time error handling, so a future maintainer understands the split was deliberate rather than accidental.

---

### RESOLVED: Should Step 9's substrate cleanup land as one commit or split?
**Decision**: A — single commit. The ~400-line cleanup is dominated by deletions, which carry a lower reviewer cost than the same line count of new logic (reviewers scan deletions for completeness — "did anything important survive?" — rather than correctness). The deletions are tightly coupled by TS's exhaustiveness machinery: removing `BaseReading.updates`, `ReadingUpdate`, `ambient-validation`, and `orphan-modifier` from substrate types forces co-located changes in `translate.ts`, `error-rendering.ts`, and the sidebar to keep the build green. Any split would either require intermediate red-build commits (violating the commit greenness invariant) or defensive `default: never` casts that get cleaned up in a follow-up — both worse than landing in one cohesive "retire ambient + modifier" commit whose intent is legible in a single diff.

---

## Self-Review

Multi-role pass focused on **implementation-level** concerns (step sequencing, snippet correctness, test placement, greenness, bisectability, audit closure). Requirements-level concerns were covered upstream in `requirements.md`'s four Self-Review rounds; this pass deliberately does not relitigate them.

Verified before raising findings: `referencedImplNames` exists on `Engine` ([engine.ts:47](../../src/hazbot/engine/engine.ts#L47)), `tickAndNotify` is a protected method ([engine.ts:343](../../src/hazbot/engine/engine.ts#L343)), construction-time variants already use `at: Date.now()` ([engine.ts:89,124,150,165,176,180,199](../../src/hazbot/engine/engine.ts#L89)), `computeMatchedCategoryFloor` is already exported from [evaluator.ts:283](../../src/hazbot/engine/evaluator.ts#L283), `src/hazbot/wildfire/engine-singleton.test.ts` exists, and `ts-node` is a dev dep (`^10.9.1`).

### Senior Engineer (Implementation)

#### RESOLVED: Step 2 / Step 10 — `computeMatchedCategoryFloor` is already exported; tests need to replicate the hook's wrapping, not extract a new helper
**Decision**: B — fold the extraction into Step 2. Added `computeMatchedCategoryForEngine(engine): number | null` to `evaluator.ts` (Step 2 "Files affected" + "Details" sections), re-exported from `engine/index.ts`. The React hook ([use-analysis-engine.ts:62-69](../../src/hazbot/engine/react/use-analysis-engine.ts#L62-L69)) refactors to a one-line call to the helper (behavior unchanged). Step 2's R18a test snippet and Step 10's R18c test + generator script now reference `computeMatchedCategoryForEngine` directly. Step 10's closing Note rewritten to point at Step 2's extraction rather than asking the implementer to extract. Estimate inflation for Step 2: ~20 lines (helper + index re-export + hook refactor). Step 10's TODO comments removed.

**Superseded by Pass 2 Finding 5 (Bisect)**: the extraction now lives in its own Step 1.5 prep commit rather than bundled into Step 2. The "extract a single helper" decision recorded here stands; only the commit boundary moved.

---

#### RESOLVED: Step 4 — placeholder construction can throw, and the catch block doesn't handle nested failure
**Decision**: A — document the engine-side invariant inline. Verified against [engine.ts:80-94](../../src/hazbot/engine/engine.ts#L80-L94): when `ruleSet === undefined`, the constructor pushes a single `load-failure` error and skips `runLoadTimeValidation()` entirely; the existing parse-error / missing-impl / missing-defaults checks never run. Step 2's new checks (temporal-validation, trigger-state-change-overlap, temporal-initial-values-mismatch) all gate on either a non-empty `temporalVariables` or a defined `initialTemporalValues`; passing `temporalVariables: {}` and omitting `initialTemporalValues` short-circuits every new check. The placeholder is provably throw-free under current invariants. Step 4's catch-site snippet now carries a multi-paragraph comment naming this invariant, citing the engine.ts lines, and flagging the maintenance hazard ("if a future engine refactor adds a throw on the `ruleSet === undefined` path, re-verify"). Option B (defensive nested try/catch with a static error-only shim) rejected as over-defensive for a verified invariant and as introducing a static-engine-shim concept that doesn't exist elsewhere in the codebase.

---

### Refactor Risk Auditor

#### RESOLVED: Steps 1, 8, 9 defer grep audits whose results affect the step's estimate and shape
**Decision**: Ran all three audits at planning time and folded results into the respective steps:
- **Step 1**: 16 sites across 12 files (within predicted 10-20 band); enumerated as a sub-list under Step 1 "Notes" so the implementer doesn't re-derive. 80-line estimate confirmed.
- **Step 8**: only the host-side files already listed in "Files affected" match; no surprises. 40-line estimate confirmed. Audit result recorded under Step 8 "Tests".
- **Step 9**: audit surfaced **four files** missing from the original "Files affected" list — folded in. [engine-singleton.ts:33](../../src/hazbot/wildfire/engine-singleton.ts#L33) comment moved into Step 7; [find-last.ts:5](../../src/hazbot/engine/find-last.ts#L5) docstring, [sidebar.test.tsx:57](../../src/hazbot/wildfire/sidebar.test.tsx#L57) fixture, and [use-analysis-engine.test.tsx:77](../../src/hazbot/engine/react/use-analysis-engine.test.tsx#L77) consume-call added to Step 9. Without these touchpoints, the Step 9 audit gate would have failed at implementation time.

---

#### RESOLVED: Step 9's grep pattern `\.updates\b` is too broad to serve as an audit gate
**Decision**: Sharpened pattern landed jointly with Finding 3's audit-incorporation work. Step 9's "Other audit checks" block now uses `reading\.updates\|lastReading\.updates\|updates:\s*\[` in place of the broader `\.updates\b`, plus a one-line note explaining why (avoiding false-positive matches on `state.updates`, `props.updates`, MobX `.updates`, etc.). The sharpened pattern was the exact one used to generate Finding 3's planning-time audit results, confirming it's narrow enough to be useful as a completion gate.

---

### Hazbot Validation Engineer

#### RESOLVED: Step 6→Step 7→Step 9 leaves a "0 update(s)" hangover visible in the sidebar
**Decision**: A — moved the `· {reading.updates.length} update(s)` JSX delete from Step 9 to Step 7. Step 7's "Files affected" now lists [sidebar.tsx](../../src/hazbot/engine/sidebar/sidebar.tsx) with the single-line drop; Step 6's `ReadingRow` snippet note rewritten to point at Step 7; Step 9's "ReadingRow collapsed summary final shape" rewritten to acknowledge the label is already gone. Estimate impact: Step 7 +5 lines (~80 → ~85), Step 9 unchanged. Net effect: no transient "0 update(s)" badge shown to validators between Step 7 and Step 9 merges. Option B (accept the transient signal) rejected for trivial extra cost vs real validation-workflow confusion; option C (reorder/merge Steps 7 and 9) rejected as disproportionate.

---

### QA / Test Engineer

#### RESOLVED: Step 10 — fixture scenario is hand-waved with `// ... etc.`; R18b's four sticky-OR corners aren't pinned
**Decision**: A — pinned all four R18b corners explicitly in the generator skeleton. The scenario array now has four labeled runs (one `SimulationStarted` / `SimulationEnded` pair per corner), each preceded by a pre-trigger toggle that drives the seed value and (for corners 2 and 3) within-window toggles that drive appends. Implementer fills in the ruleset-25-specific `data` payloads at implementation time. Cost: ~20 lines of structured comments + scenario sketches in Step 10's generator snippet. Net effect: regeneration produces a fixture that provably exercises all four corners; if a future engine change breaks any single corner, the R18c test surfaces it via the diff at PR time rather than passing silently.

---

#### RESOLVED: Step 10 — fixture comparison doesn't enforce R1's JSON-safe value constraint
**Decision**: A — wrap the engine output in `JSON.parse(JSON.stringify(...))` before comparing. Step 10's `replay-fixture.test.ts` snippet now defines a `roundTrip` helper and uses it on the three structural comparisons (`engine.readings`, `engine.observed`, `engine.temporalValues`). `matchedCategoryHistory` is `(number | null)[]` and JSON-safe by construction, so it's compared directly with a note. A comment block at the test site explains the rationale, naming R1's "Known constraint" and the diff-clarity benefit. Net effect: a future non-JSON-safe value (Set / Map / Date / class instance) surfaces as a clear "expected `{}` got `Set(...)`" diff rather than passing toEqual against itself while mismatching the deserialized fixture. Option B (separate canary assertion) rejected for noise without changing the failure-detection surface beyond A; option D (documentation only) rejected because the R1 constraint is already documented in requirements.md — a test-file comment would duplicate without enforcing.

---

#### RESOLVED: Step 4 — `engine-singleton.test.ts` exists; spec says "or equivalent — add if absent"
**Decision**: Tightened. Step 4's test-coverage bullet now reads "extend [engine-singleton.test.ts](../../src/hazbot/wildfire/engine-singleton.test.ts) (verified to exist at planning time)" — no hedge, no risk of the implementer creating a parallel file.

---

### Bisect / Incident Response Engineer

#### RESOLVED: Step 9 is a ~400-line single commit; a future bisect that lands on it lacks a roadmap
**Decision**: A — pinned commit-message convention as a new "Commit message convention" subsection at the end of Step 9's "Details" block. Body must enumerate deletions by file (transcribing the existing "Files affected" list with a one-line per-file summary). Includes a worked example skeleton showing the expected commit-message shape plus the planning-time audit pattern from Finding 3+4 so a developer reproducing the audit at commit time hits the same surface. Reviewers enforce at PR time. Adds zero implementation cost; turns `git show <step9-sha>` into a navigable summary instead of a 400-line diff dump. Options B (advisory only) and C (implicit) rejected because the bisect-mitigation value is real and the convention is cheap enough that prescribing it at planning time eliminates the soft-enforcement gap.

---

## Self-Review — Pass 2 (multi-role)

Second multi-role pass on the implementation spec. Pass 1 (the section above) closed seven findings around snippet correctness, audit closure, and bisectability. This pass widens the role list (DevOps / Build, API / Type Surface Designer, Documentation Reviewer added) and re-reads the spec end-to-end with fresh eyes against the verified surface in `engine.ts`, `engine-singleton.ts`, `evaluator.ts`, `types.ts`, `right-panel.tsx`, `ui.ts`, and `log.ts`.

Verified at pass start: `Engine` constructor at [engine.ts:73-95](../../src/hazbot/engine/engine.ts#L73-L95) pushes a `load-failure: missing-rule-set` error when `opts.ruleSet === undefined`; `isActive` gates on `hasLoadBlockingError()` which checks only `load-failure | parse-error`; `consume()` at [engine.ts:234-294](../../src/hazbot/engine/engine.ts#L234-L294) drops the reading when ambient-validation fails (does not push); `right-panel.tsx:11` currently uses `useState(false)` and `ui.ts:11` uses `@observable public showChart = false` (both match `CHART_TAB_INITIAL_OPEN = false`); `log.ts:16,24` and `bottom-bar.tsx:252` carry the `ambientState` plumbing exactly as Step 8 describes.

### Senior Engineer (Implementation)

#### RESOLVED: Step 4 placeholder construction accumulates a misleading `load-failure: missing-rule-set` error
**Decision**: Apply the array-replacement fix. Step 4's `engine-singleton.ts` snippet now reads `placeholder.errors = [...e.errors];` (overwrite) instead of `placeholder.errors.push(...e.errors);` (append). Added an inline comment naming the engine.ts line range (80-89) where the synthetic emission lives and explaining why overwriting is safe (the `runLoadTimeValidation()` gate at engine.ts:91 guarantees the synthetic `missing-rule-set` is the only entry the placeholder constructor produces). Cost: one-line code change + ~8 lines of comment. Net effect: the sidebar's ErrorsPanel renders only the real construction errors when a temporal-variable misconfiguration is caught, not a misleading "no rule set provided" alongside them.

**Superseded by Pass 4 Finding MU-1 (Mutation / Immutability)**: the post-construction `placeholder.errors = [...e.errors]` mutation was replaced with `initialErrors: e.errors` opt-injection through the constructor. The "synthetic-`missing-rule-set` is suppressed when caller-supplied errors are present" intent recorded here stands; only the injection mechanism moved (from post-construction array overwrite to constructor opt). Copilot's MEDIUM finding flagged the stale "now reads" wording in this entry against Step 4's current `initialErrors` snippet — this supersession marker resolves the contradiction.

---

#### RESOLVED: Step 2 seed-loop snippet placement vs. ambient-validation
**Decision**: Rewrote Step 2's `consume()` trigger-case snippet to literally gate the seed loop and `this.readings.push(reading)` inside `if (missingPerImpl.length === 0) { ... }`, with the failure branch explicitly noted as "reading dropped, errors already pushed, still tick so sidebar re-renders." Added inline anchors to engine.ts:240-256 (where ambient-validation lives today) and engine.ts:253 (the mutated-flag-on-failure behavior the new code preserves). Cost: ~5 added lines to the Step 2 snippet, zero runtime impact. Net effect: the snippet is self-describing for a literal-minded reader of Step 2's commit, and Step 9's deletion of the ambient block produces a clean before/after diff (the `if` collapses to its successful body) rather than an "implicit comment becomes literal truth" surprise.

---

### QA / Test Engineer

#### RESOLVED: Step 2 R18a determinism test snippet uses `===` where it means deep-equal
**Decision**: Replaced the contradictory `=== ... (structural)` phrasing with an explicit four-line `toEqual` block in Step 2's R18a bullet. Cost: copy-paste in one bullet. Net effect: implementer transcribing the snippet writes the right assertion shape on first try; no risk of shipping `expect(...).toBe(...)` that fails for reference-equality reasons instead of the determinism violation the test is meant to catch.

---

#### RESOLVED: Step 10 `roundTrip` doesn't catch `undefined`-valued bugs in `temporalValues` / `observed`
**Decision**: Added a canary block to Step 10's `replay-fixture.test.ts` snippet, immediately after the four `toEqual` comparisons. Two short loops walk `Object.values(engine.temporalValues)` and `Object.values(engine.observed)` asserting `toBeDefined()` on each entry. Comment block at the test site explains why this is needed (`JSON.stringify({ a: undefined })` strips the property symmetrically on both sides of the round-trip, so `toEqual` passes against the stripped fixture) and why it's not duplicated into R18a (the two-engine determinism test compares live engines, so an `undefined` on both sides would equal itself — no value added).

**Scope note**: `engine.readings[].temporalHistory[].value` lives inside an array, so `JSON.stringify` would coerce `undefined` → `null` rather than strip — a bug would surface as a `null`-vs-actual-value diff at PR review, not as silent equality. The canary is intentionally scoped to the two map fields where the stripping hole exists. Net effect: a future reducer producing `undefined` fails with a clear "received undefined" Jest message naming the offending property, rather than passing silently and drifting over time. Cost: ~10 lines added to Step 10's snippet.

---

### Bisect / Incident Response Engineer

#### RESOLVED: Step 2 bundles three independent concerns; pulling the matchedCategory helper into a prep commit would shrink it and isolate bisects
**Decision**: Inserted new Step 1.5 between Steps 1 and 2 covering the pure `computeMatchedCategoryForEngine` refactor (~20 lines: helper + re-export + hook one-line call). Step 2's "Files affected" loses `evaluator.ts`, `index.ts`, and `use-analysis-engine.ts`; its estimate drops from ~470 → ~450 and its Details section drops the helper definition and hook-refactor explanation. Step 10's closing Note retargets from "Step 2" → "Step 1.5". Pass-1's RESOLVED note that originally folded the extraction into Step 2 carries a supersession marker pointing at this finding. Cost: zero implementation cost (same code, different commit boundary); one extra PR-review boundary; cleaner bisect surface — Step 2 is now a focused "temporal-variable dispatch + construction validation" commit whose diff has no refactor noise.

---

### DevOps / Build Engineer

#### RESOLVED: Step 10's `ts-node/register/transpile-only` bootstrap may fail on the bridge's transitive imports
**Decision**: Partial withdrawal after grounding the concern. Ran the import-closure audit at planning time and confirmed `ts-node/register/transpile-only` handles the generator's `require()` set without further configuration. The audited modules (`engine.ts`, `evaluator.ts`, `factor-variables.ts`, `sim-props.ts`, `temporal-variables.ts`, `translate.ts`, `rule-sets/index.ts`, and the seven `rule-sets/N.ts` files) transitively import only substrate-internal modules — no React, MobX, three.js, SCSS, or decorator-using surface anywhere in the closure.

Added a 5-line "`ts-node` bootstrap audit" note to Step 10's Details immediately before the generator skeleton, recording the audit result and the fallback (switch to a `tsc --outDir scripts/.fixture-build`-based compile + require) for future maintainers if a temporal variable or rule set ever pulls in problematic imports. Net effect: the implementer doesn't have to re-derive the audit; the fallback is named in case the closure expands later. Cost: 5-line note in Step 10's Details, no script changes.

---

#### RESOLVED: Step 10 fixture `JSON.stringify` is non-deterministic on object key order
**Decision**: Applied scoped key-sorting, not whole-tree key-sorting. The generator skeleton now uses a `sortKeys(obj)` helper applied only to `engine.observed` and `engine.temporalValues` (the two top-level maps that are vulnerable to insertion-order drift under future engine refactors). `engine.readings` keep natural engine-side order so human reviewers reading `expected.json` at PR time see fields in the natural order they appear in the engine (`triggeredBy`, `sessionId`, `at`, etc.) rather than alphabetized. `matchedCategoryHistory` is an array (order is semantic; no sorting needed).

**Trade-off considered**: A whole-tree replacer would have stabilized nested objects inside readings too, but the readings' field order is structurally meaningful and the fixture is a human-read surface at PR-review time. Scoped sorting eliminates the false-positive vector exactly where it can fire (top-level maps with refactor-vulnerable insertion order) without re-shuffling the most-read content.

**Test side**: Unchanged. Jest's `toEqual` is key-order-agnostic for objects, so the fixture test compares against the sorted fixture without symmetric sorting on the engine side. Cost: ~6 lines in the generator script, zero test-side change.

---

### API / Type Surface Designer

#### RESOLVED: `temporalReads` is advisory at runtime — document this explicitly
**Decision**: Added a "Note:" paragraph to Step 11's README, integrated into checklist step 3 of "Adding a temporal variable." The note names the asymmetry (engine validates declared→exists, not impl-actually-reads-declared), the two misconceptions a maintainer might form (adding an entry doesn't surface anything to compute/evaluate; removing one doesn't break the read), and the manual-sync expectation. Cost: ~5 lines in the Step 11 README snippet, zero code change.

---

### Documentation Reviewer

#### RESOLVED: Step 11 README walkthrough omits `observed` semantics and the `initialTemporalValues` override path
**Decision**: Applied two additions to Step 11's README snippet:

1. **`observed` semantics paragraph expanded**: the existing brief "(sticky-once-set per variable)" parenthetical replaced with a four-sentence treatment naming the lifetime (sticky from first matching event, not reset across triggers or runs), the sidebar's muted-italic rendering, and the validator-facing purpose ("tell at a glance which variables have been exercised").

2. **Checklist step 6 added** to "Adding a temporal variable": describes the `initialTemporalValues` override path, names the construction-time validation (exhaustiveness + type-shape), and the `temporal-initial-values-mismatch` error variant a misconfiguration produces. Positioned as an "if you need this" step after the existing fixture-regeneration step rather than as a required step.

Cost: ~12 lines total in the Step 11 README snippet, zero code change.

---

## Self-Review — Pass 3 (multi-role)

Third multi-role pass on the implementation spec. Pass 1 and Pass 2 closed 15 findings across the snippet-correctness, audit-closure, bisectability, and documentation surfaces. This pass widens the role list further (Code Review Generalist / cold read, TypeScript / Type-System, Performance / Runtime, Naming / Consistency, Cypress / Integration, Test Fixture Curator, Step Sequencing / Greenness, Migration / Removal) and reads the spec end-to-end with fresh eyes plus light grounding in the actual source ([src/hazbot/engine/engine.ts](../../src/hazbot/engine/engine.ts), [src/hazbot/engine/types.ts](../../src/hazbot/engine/types.ts), [src/log.ts](../../src/log.ts), [src/hazbot/wildfire/engine-singleton.ts](../../src/hazbot/wildfire/engine-singleton.ts)).

Verified at pass start: `engine.ts:80-94` matches Step 4's "ruleSet === undefined" invariant claim; `consume()` at `engine.ts:234-298` carries the ambient/modifier blocks Step 9 deletes; `log.ts:16-34` carries the `ambientState?: unknown` parameter Step 8 removes; `engine-singleton.ts:36-47` carries the `latestReading` closure Step 7 retires.

### Performance / Runtime Engineer

#### RESOLVED: Step 2 — `Object.keys(this.temporalVariables)` is called inside `consume()`'s hot path
**Decision**: Hoisted to a constructor-time field. Step 2's "Engine class additions" snippet gains `private temporalVariableNames: string[] = []`; the constructor-changes list assigns `this.temporalVariableNames = Object.keys(this.temporalVariables)` immediately after `this.temporalVariables = opts.temporalVariables ?? {}`. Step 2's `consume()` snippet now reads `const variableNames = this.temporalVariableNames` (with a one-line comment naming Pass-3 Finding 1) instead of allocating per call. Step 9's post-cleanup `consume()` snippet's R5a seed loop similarly iterates `this.temporalVariableNames` directly. Same iteration semantics (declaration order per R2); zero behavior change; per-event allocation eliminated. Cost: 3 lines added, 1 line removed.

The values returned by `Object.keys` over a `Record<string, TemporalVariableImpl>` are stable from construction onward — temporal variables aren't added or removed at runtime. Hoisting matches the substrate's tight-loop discipline.

---

#### RESOLVED: Step 6 — `formatTemporalSummary` re-allocates `slice(N).filter(...)` per render per reading per variable
**Decision**: Replaced with a single-pass index-based loop in Step 6's `formatTemporalSummary` snippet. The `.slice(N).filter(...)` chain (two array allocations per variable per reading per render) becomes one walk over `reading.temporalHistory` from index N to end, incrementing a local counter for matching `name`. Inline comment names Pass-3 Finding 2 and the compounding-cost rationale. Cost: ~5 lines; same output; zero allocation. For current scope (N=1), the perf delta is invisible — the fix is preemptive substrate-discipline. Memoizing across renders (the other option considered) was rejected as over-engineering for a dev-only sidebar where the per-render cost is now O(temporalHistory.length) not O(allocations).

---

### TypeScript / Type-System Reviewer

#### RESOLVED: Step 1 — `Record<string, TemporalVariableImpl>` storage widens V to unknown; convention should be pinned
**Decision**: Pinned the convention at Step 4's `temporal-variables.ts` snippet — every `TemporalVariableImpl` declaration explicitly types its `V` parameter at the declaration site (e.g. `TemporalVariableImpl<boolean>`), even though the map type widens to `TemporalVariableImpl<unknown>` at storage. The declaration site is where the reducer body benefits from narrow typing; the map type is for substrate storage and never read by consumers expecting V. Without this convention, a future declaration that omits the explicit V would infer V from the map context (= `unknown`), giving the reducer an untyped `_prev` parameter and quietly losing safety.

Cost: 3-line convention note above the `chartTabOpen` snippet, naming Pass-3 Finding 3 and the substrate/declaration-site split. The R7 `temporal-initial-values-mismatch` runtime check still catches type drift between declared `initialValue` and override map; the convention covers the impl-declaration side. A typed-map helper (phantom-typed `initialTemporalValuesFor`) was considered and rejected as over-engineering for current scope — current scope has one variable; the convention handles it; revisit if a future bridge declares 5+ variables with type-shape risk.

**Follow-up (re-scan after Pass-3 edits)**: also pinned the map-storage type explicitly as `Record<string, TemporalVariableImpl<unknown>>` — matching the existing project pattern at [src/hazbot/wildfire/factor-variables.ts:173](../../src/hazbot/wildfire/factor-variables.ts#L173) (`Record<string, FactorVariableImpl<unknown, ...>>`). The implicit-default form (`Record<string, TemporalVariableImpl>`) would be structurally equivalent under the project's tsconfig (`strictFunctionTypes` is off — verified against `tsconfig.json`), but pinning V=unknown explicitly at storage keeps consistency with the `factorVariables`/`simProps` idiom and signals "V is erased here on purpose." Applied to Step 4's bridge declaration, Step 2's `EngineOpts.temporalVariables`, and the `Engine` class instance field. The requirements.md occurrence at line 616 is inside a historical-design-space description and left as-is.

---

### Code Review Generalist (cold read)

#### RESOLVED: Step 2 — `consume()` snippet refers to the existing ambient-validation block by line range instead of showing it inline
**Decision**: Option (b) from the finding — reframe the existing-block reference as an explicit elision marker. Step 2's `case "trigger":` comment block expanded to name (i) the literal contents of engine.ts:240-260 (`requiredKeys` lookup, `checkAmbientForTrigger` call, missingPerImpl push), (ii) that Step 2 leaves the block UNCHANGED and adds only the gating `if`, and (iii) that the in-scope `missingPerImpl` variable referenced below is the one the existing block populates. The transcriber sees an explicit elision anchor rather than a comment that reads as dispensable prose.

Option (a) from the finding (inline the full ~16 lines of existing code) rejected: those lines disappear in Step 9, so duplicating them into Step 2's snippet creates a churn surface for no durable readability gain. Option (b)'s comment carries the same diagnostic value (literal anchor + Step-2-adds-only-the-gating-if framing) without the duplication. Cost: ~7 lines of expanded comment in Step 2's `consume()` snippet, zero code change.

---

#### RESOLVED: Step 4 — placeholder catch-block snippet carries more comment than code
**Decision**: Relocated the invariant rationale to the engine side. Step 4's `engine-singleton.ts` catch-block comment shrinks from ~16 lines to ~4 lines naming *what* the placeholder does and pointing to engine.ts for *why*. Step 2 gains a new "Maintenance gate" comment block (added near the existing "Asymmetric construction-error model" comment) instructing future engine.ts editors that the `ruleSet === undefined` branch must remain throw-free and naming the bridge-side caller's overwrite-of-`errors` dependency.

Net effect: the audience-appropriate comment lives at each location — engine-singleton.ts reads as code (what), engine.ts carries the maintenance gate (why and what depends on it). engine-singleton.ts's future readers see the placeholder pattern without wading through invariant defense; engine.ts's future editors see the gate at the actual risk site. Cost: net-zero (comment relocation, not addition); ~12 lines moved from one snippet to the other. Per Pass-3 Finding 5.

---

### Naming / Consistency Reviewer

#### RESOLVED: `TemporalVariableImpl` vs `TemporalVarChange` — abbreviation drift in adjacent types
**Decision**: Option (a) from the finding — renamed the entry type `TemporalVarChange` → `TemporalVariableChange` for symmetry with `TemporalVariableImpl`. Both exported substrate types now write "Variable" in full; the substrate's user-facing type-name convention is uniform.

Applied via replace-all across both spec files: 12 occurrences in implementation.md, 28 occurrences in requirements.md. Net effect: future downstream references (test file names, sidebar prop types, error-rendering switch cases, README prose) pick the consistent form, preventing the cost compounding through downstream code. Option (b) (rename `TemporalVariableImpl` → `TemporalVarImpl` the other way) was rejected — abbreviating "Variable" makes user-facing types harder to pronounce in code review. Per Pass-3 Finding 6.

---

#### RESOLVED: `runtimeType` helper has a generic name; pin as substrate-private
**Decision**: Option (a) from the finding — closed the conditional escape. Step 2's `runtime-type.ts` snippet now states the helper is **substrate-private; not re-exported from `engine/index.ts` in this PR**, scoped to the `temporal-initial-values-mismatch` runtime check, and explicitly directs broader runtime-type concerns to define their own helper rather than widening this one.

Option (b) (rename to `temporalRuntimeType`) rejected — the rename adds verbosity at every call site for current scope (one call site, narrow purpose). Visibility enforcement at the export boundary is the cleaner gate. Cost: ~3-line comment expansion in Step 2's snippet; no code change. Per Pass-3 Finding 7.

---

### Test Fixture Curator

#### RESOLVED: Step 10 — generator scenario hand-waves ruleset-25 `data` payloads; implementer must derive from `25.test.ts`
**Decision**: Hybrid of options (a) and (b) from the finding. Step 10's generator skeleton now (i) names test case "(c) multi-true with highest selected" from `src/hazbot/rule-sets/25.test.ts` as the corner-1 baseline (option b), (ii) pre-fills the concrete data shape (`zones`, `sparks`, `wind`) above the `scenario` array as a `startData` const (option a), and (iii) defines `endData = { outcome: null }` after verifying via [src/hazbot/wildfire/types.ts:12](../../src/hazbot/wildfire/types.ts#L12) that `outcome` is `unknown` (opaque to current rule sets).

The pre-fill commits to one shape across all four corners — keeping the spark layout identical isolates `GraphOpen` (chart-tab state) as the only varying input across corners. An expanded comment block above the scenario explains the prototype choice and the corner-isolation rationale. The inline `// ruleset-25 fixture data` / `// outcome { /* ... */ }` placeholders are replaced with `data: startData` / `data: endData` literal references — zero implementer guesswork at the call sites.

Net effect: ~30 minutes of implementer scope-discovery eliminated; the generator script is ready to run as-written modulo the `ts-node/register` bootstrap. Cost: ~15 lines added (prototype comment + two `const` declarations) and ~6 lines simplified (placeholder → literal references). Per Pass-3 Finding 8.

---

### Step Sequencing / Greenness Auditor

#### RESOLVED: Step 5 — `25.test.ts` conversion lacks a per-test enumeration; missed conversions surface as red build
**Decision**: Ran the audit at planning time and folded the per-line result into Step 5's "Details" section. The audit (`grep -nE "ambientState|chartTabOpenAtStart|ChartTabShown|ChartTabHidden|reading\.updates" src/hazbot/rule-sets/25.test.ts`) surfaced three touchpoints: line 43 (test "(c)"), line 79 (test "(e)"), and line 49 (a comment in test "(c)" that uses the old vocabulary). Step 5's `25.test.ts` section now carries a per-line table naming each touchpoint, the test case context, the current source, and the conversion target. A note on the `mkReading` helper (in Step 1's `temporalHistory: []` audit list) explains when an explicit seed override is required vs. when the helper default suffices.

After conversion, a re-run of the same grep returns zero matches. Per Pass-3 Finding 9, the same audit-incorporation pattern Steps 1/8/9 already use. Cost: ~12 lines added to Step 5; turns "convert what you find" into "convert these three specific touchpoints."

---

### Migration / Removal Engineer

#### RESOLVED: Step 9 — "DELETE 9 ambient-validation cases" lacks specificity; partial deletion would build-green
**Decision**: Ran the audit at planning time across `consume.test.ts`, `engine.test.ts`, and `error-rendering.test.ts`. Original "~9 cases" was approximate — the actual split is 5 ambient-validation tests + 7 orphan-modifier/modifier tests (12 total), enumerated by file + line + name in a new "Test-deletion audit" table folded into Step 9's "Details" section. The table also disposes of the "other audit hits" (helper-type fields, test-impl synthetic declarations, call-site arguments) that delete naturally with their enclosing tests.

Step 9's "Files affected" lines for the three test files now cite the audit table instead of approximate counts. Per Pass-3 Finding 10. Cost: ~25 lines added (audit table + commentary); turns the deletion from approximate-count to enumerated-list. The implementer transcribes 12 specific test names rather than re-scanning the files.

---

#### RESOLVED: Step 9 — audit-grep ordering not pinned (run before deletion vs. after)
**Decision**: Replaced Step 9's single audit-check bullet with the two-phase version. Phase 1 (before deletion/modification): grep matches confined to "Files affected" — any match in an unlisted file is a missed touchpoint to fold in before proceeding. Phase 2 (after deletion + modification, before commit): grep returns **zero matches** across the entire `src/` tree.

Both phases are gates — Phase 1 catches "did we plan the deletion completely?", Phase 2 catches "did we execute the deletion completely?" Phase-1-only would accept a partial deletion as long as it landed in a file scheduled for change; Phase-2-only would conflate "right file, right targets" with "right file, wrong targets." Per Pass-3 Finding 11. The existing planning-time-audit narrative below the audit block notes that the four planning-surfaced touchpoints (engine-singleton.ts:33, find-last.ts:5, sidebar.test.tsx:57, use-analysis-engine.test.tsx:77) would have failed Phase 1 had they not been folded in — confirming the gate's value with a concrete prior incident. Cost: ~8 lines of expanded audit-block prose; zero code change.

---

## Self-Review — Pass 4 (multi-role)

Fourth multi-role pass on the implementation spec. Passes 1–3 closed 26+ findings across snippet correctness, audit closure, bisectability, naming, type surface, perf, and migration concerns. This pass widens the role list to three previously-uncovered angles: **MobX / React Integration**, **Substrate / Bridge Boundary**, and **Mutation / Immutability**. Spec is read against the verified surface in [engine.ts](../../src/hazbot/engine/engine.ts), [use-analysis-engine.ts](../../src/hazbot/engine/react/use-analysis-engine.ts), [sidebar.tsx](../../src/hazbot/engine/sidebar/sidebar.tsx), [right-panel.tsx](../../src/components/right-panel.tsx), [ui.ts](../../src/models/ui.ts), and [engine-singleton.ts](../../src/hazbot/wildfire/engine-singleton.ts).

Verified at pass start: [engine.ts:233](../../src/hazbot/engine/engine.ts#L233) carries the "single notify at the end of the call iff state mutated" atomicity comment; [engine.ts:98](../../src/hazbot/engine/engine.ts#L98) emits the constructor's load-bearing initial tick; [use-analysis-engine.ts:88-95](../../src/hazbot/engine/react/use-analysis-engine.ts#L88-L95) caches the view per `snapshotVersion` via `useSyncExternalStore`; [sidebar.tsx:39,65](../../src/hazbot/engine/sidebar/sidebar.tsx#L39) reads `engine.errors` and `engine.readings` directly off the engine (not via hook snapshot); [right-panel.tsx:11-30](../../src/components/right-panel.tsx#L11-L30) carries the existing `useState(false)` + `ui.showChart` dual-state pattern and emits `ChartTabShown` / `ChartTabHidden` from the single toggle handler.

### MobX / React Integration Reviewer

#### RESOLVED: Step 2 — reducer-throw path calls `tickAndNotify` mid-`consume()`, breaks single-notify atomicity contract
**Decision**: Option (a) — restructured the reducer-throw exit to flow through a single bottom tick. Step 2's `consume()` snippet now drops the in-catch `this.tickAndNotify()` call and replaces `if (reducerThrew) return;` with a block that ticks once before returning. Single-tick atomicity contract preserved verbatim; no observable behavior change vs. the prior snippet (today no listener re-entrant-mutates state). One-line comment added at the new tick site naming Pass-4 Finding MR-1 so a future reviewer sees the contract-preservation intent inline.

The existing `consume()` at [engine.ts:234-298](../../src/hazbot/engine/engine.ts#L234-L298) computes `let mutated = false` and calls `tickAndNotify()` exactly once at the bottom: `if (mutated) this.tickAndNotify()`. The class comment at [engine.ts:233](../../src/hazbot/engine/engine.ts#L233) names this explicitly — "Atomicity (Req 19): single notify at the end of the call iff state mutated."

Step 2's reducer-throw snippet violates the contract:
```js
} catch (thrown) {
  this.errors.push({...});
  reducerThrew = true;
  this.tickAndNotify();   // explicit mid-consume tick
  break;
}
// ...
if (reducerThrew) return; // short-circuits the bottom-tick path
```

The explicit tick is needed because the `return` skips the bottom-tick block. Today no listener re-entrant-mutates state, so the behavior is observationally identical to a single bottom-tick. But the pattern diverges from the substrate's stated atomicity contract — a future reviewer noticing the mid-consume tick will either (a) assume it's required (and copy-paste the pattern elsewhere) or (b) suspect a bug. Both outcomes degrade the contract's value as a signpost.

Options:
- (a) Restructure to flow through the bottom tick. Set `mutated = true` in the catch block, drop the explicit `tickAndNotify()`, replace `if (reducerThrew) return;` with `if (reducerThrew) { if (mutated) this.tickAndNotify(); return; }`. Single-tick contract preserved; one branch added.
- (b) Refactor to a top-level `try { ... } finally { if (mutated) this.tickAndNotify(); }` wrapping the whole consume body. Cleaner but a wider edit; affects existing ambient-validation tick path that Step 9 deletes anyway.
- (c) Accept the divergence; update the engine.ts:233 atomicity comment to acknowledge "single notify except on reducer throw where we tick eagerly to ensure the error surfaces before the early return."

Suggest (a). Smallest delta to Step 2; preserves the existing atomicity invariant verbatim.

---

#### RESOLVED: Step 6 — hook adds `temporalValues` / `observed` snapshot copies; existing hook pattern reads engine state directly without snapshotting
**Decision**: Option (a) — dropped the shallow copies. Step 6's `HookReturn` no longer gains `temporalValues` / `observed` fields, `computeView` no longer copies them, and the sidebar's `TemporalVariablesPanel` reads `engine.temporalValues` and `engine.observed` directly off the `engine` reference already exposed by `HookReturn`. Matches the existing pattern for `engine.errors` and `engine.readings`. Removes the asymmetry, the per-render allocation, and the implicit snapshot-vs-live consumer-decision surface. Converges with Pass-4 Finding MU-3 (the mutation-angle complement reached the same conclusion).

The existing `useAnalysisEngine` hook snapshots only *derived* values (`factorVariableValues`, `simPropValues`, `matchedCategory`, `perCategoryTruth`) — values that require computation. **Raw engine state** is exposed via the `engine` field, read directly: `<ErrorsPanel errors={engine.errors} ...>` ([sidebar.tsx:39](../../src/hazbot/engine/sidebar/sidebar.tsx#L39)), `<ReadingsPanel readings={engine.readings} />` ([sidebar.tsx:65](../../src/hazbot/engine/sidebar/sidebar.tsx#L65)).

Step 6 breaks this pattern by adding shallow copies of `temporalValues` and `observed` to `HookReturn`:
```ts
const temporalValues = { ...engine.temporalValues };
const observed = { ...engine.observed };
```

These are not derived — they're verbatim copies of engine state. Asymmetric with `engine.readings` and `engine.errors`, which are equally mutable and equally part of the sidebar's render path. The asymmetry has no documented rationale. The spec's "values are primitives or plain objects; spec's R1 immutability constraint covers deeper safety" parenthetical reads as defense, but per R1 the values are immutable by contract — the shallow copy is purely defensive against a constraint that already holds.

For current scope (one boolean variable), the cost is one shallow copy per cache-miss `computeView` call. Forward-cost: any future addition of a new engine state map ("temporalSomething2") faces a precedent — snapshot-copy at the hook boundary, vs. expose directly through `engine`. Two patterns, no rule.

Options:
- (a) Drop the snapshot copies. Sidebar reads `engine.temporalValues` and `engine.observed` directly, matching the existing pattern for `engine.readings` / `engine.errors`. Step 6's `HookReturn` addition removed; the sidebar accesses these fields off the `engine` reference already in HookReturn.
- (b) Keep the copies and add JSDoc to the new fields naming why they're snapshotted (e.g., "Snapshot of engine.temporalValues at the time the snapshot was taken — prefer over engine.temporalValues for stable references across renders"). Documents the asymmetry; doesn't resolve it.
- (c) Snapshot *all* engine state fields read by the sidebar uniformly — turn `engine.readings`, `engine.errors`, `engine.temporalValues`, `engine.observed` into hook-returned snapshots. Wider refactor; resolves asymmetry by widening the snapshot pattern.

Suggest (a). Removes the asymmetry, removes per-render allocation, eliminates the precedent. The "stable references" argument doesn't apply because the React re-render is gated by `useSyncExternalStore` returning a new snapshot integer anyway — the entire render tree is fresh per snapshot tick.

---

#### RESOLVED: Step 6 — sidebar reads `Object.keys(engine.temporalVariables)` per render; engine has a hoisted private field for the same data
**Decision**: Option (a) — promoted `temporalVariableNames` from `private` to public-readable on the engine. Step 2's "Engine class additions" snippet now declares `temporalVariableNames: string[] = []` (no `private` modifier — matching `temporalVariables`/`temporalValues`/`observed` siblings) with an inline comment naming both Pass-3 Finding 1 (hot-path discipline) and Pass-4 Finding MR-3 (sidebar reuse). Step 6's "Pass the declaration-ordered name list" instruction now reads `engine.temporalVariableNames` directly. Single allocation per engine lifetime; engine hot path and sidebar render path share the same memoized array; precedent for "hoisted ordered-name fields are part of the engine's public surface" lands cleanly. No new exposure beyond what already exists for `temporalVariables` / `temporalValues` / `observed`.

Pass-3 Finding 1 hoisted `private temporalVariableNames: string[]` on `Engine` at construction time to eliminate the per-`consume()` `Object.keys()` allocation. Step 6's `TemporalVariablesPanel` takes `temporalVariableNames: string[]` as a prop. The caller (sidebar parent) passes `Object.keys(engine.temporalVariables)` — re-allocating the array on every render.

The hoisted field is `private`, so the sidebar can't read it directly. This recreates the very allocation Pass-3 eliminated, on a different hot path (sidebar re-renders on every snapshot tick).

For current scope (one variable, dev sidebar), the cost is invisible. But the design is internally inconsistent: the engine hoists for hot-path discipline; the sidebar re-allocates the same data per render. Either the hoisting was unnecessary, or the sidebar should reuse it.

Options:
- (a) Change `private temporalVariableNames` → `public readonly temporalVariableNames` in Step 2's "Engine class additions" snippet. Sidebar reads it directly. Single allocation per engine lifetime; engine and sidebar use the same memoization.
- (b) Add `useMemo(() => Object.keys(engine.temporalVariables), [engine])` in the sidebar. Caller-side memo; relies on engine identity stability. Two memoization sites; no shared state.
- (c) Leave as-is. `Object.keys` over a one-key object is trivial; revisit if temporal-variable count grows.

Suggest (a). The field exists; making it readable doesn't compromise encapsulation (substrate consumers already access `engine.readings`, `engine.errors`, `engine.simProps`, etc. — the engine's public surface is already "everything the sidebar needs").

---

### Substrate / Bridge Boundary Architect

#### RESOLVED: Implicit invariant — host must emit `ChartTabShown` / `ChartTabHidden` whenever `ui.showChart` changes; unstated, unenforced
**Decision**: No spec change. `ui.showChart` has exactly one mutation site today ([right-panel.tsx:25-28](../../src/components/right-panel.tsx#L25-L28)) and no realistic forecast of additional ones — the chart-tab UI is a single component with a single toggle handler, and the broader wildfire UI surface doesn't suggest second-mutation-site growth. Documenting an invariant against a hypothetical future mutation site that the codebase shape argues against would be speculative defensive prose. If a second mutation site materializes (e.g. a "close all panels" feature, a saved-session restore flow), refactor to a single `ui.setShowChart(value)` setter that mutates and emits atomically at that point — but doing it now is premature.

The temporal-variable design assumes the host emits a state-change event whenever the projected state actually changes. Verified at planning time: [right-panel.tsx:25-28](../../src/components/right-panel.tsx#L25-L28) is the **only** mutation site for `ui.showChart` today, and it does emit the events. Spec Step 4 preserves this surface and adds the shared constant.

But the invariant — *"every `ui.showChart` mutation must be paired with a `log("ChartTabShown" | "ChartTabHidden")` call"* — is:
- Unstated anywhere in the spec or codebase.
- Unenforced by types, lint, or tests.
- A latent landmine: a future contributor adding a "close all panels" button or a URL-param-driven initial-`showChart=true` path will (a) mutate `ui.showChart` without emitting events, or (b) emit one event without the matching MobX update, and the engine's `chartTabOpen` projection silently desyncs.

The failure mode is silent. `GraphOpen`'s sticky-OR returns the wrong answer; no error is raised; the dev sidebar shows the engine's view of `chartTabOpen` but doesn't compare against `ui.showChart`. The only way a developer notices is by hand-validating a category that depends on `GraphOpen` — which is exactly the Hazbot-validation workflow this engine exists to support, but reaching that workflow requires the bug to have shipped.

R14's "lockstep" rationale only covers the *initial value* (`CHART_TAB_INITIAL_OPEN` is the shared constant). It does not cover *runtime sync*.

Options:
- (a) Document the invariant in [src/hazbot/wildfire/temporal-variables.ts](../../src/hazbot/wildfire/temporal-variables.ts) next to the `chartTabOpen` declaration, and in the engine README's "Adding a temporal variable" checklist (Step 11's R19 expansion). Convention only.
- (b) Use a MobX `autorun` or `reaction` in `UIModel` (or in a Provider) to emit `ChartTabShown` / `ChartTabHidden` whenever `ui.showChart` flips. Single source of emission removes the manual-sync hazard. Requires wiring the `log()` function into the model layer or a setup hook — small surface but new coupling.
- (c) Replace `ui.showChart` direct mutation with a method `ui.setShowChart(value: boolean)` that mutates the observable AND emits the appropriate event. Type system enforces the invariant by making the bare mutation unwriteable.
- (d) Add a *runtime divergence check* — a development-only `MobX reaction` that compares `ui.showChart` to `engine.temporalValues.chartTabOpen` (after a tick settle) and surfaces a warning if they differ. Catches the bug after the fact; doesn't prevent it.

Suggest (c) for the principled fix, or (a) as the cheapest defense for current scope (one variable, one mutation site). (b) and (d) feel disproportionate. The invariant should at minimum be named — silent invariants underwriting silent failure modes are a known anti-pattern.

---

#### RESOLVED: `CHART_TAB_INITIAL_OPEN` constant lives bridge-side but is consumed primarily by UI — directional dependency could be neutralized
**Decision**: Option (a) — keep the bridge-side ownership R14 chose, add a "considered-and-rejected" note inline at the constants.ts snippet. The neutral-shared-module alternative (option (b)) would create a new top-level module for one constant — architectural ceremony disproportionate to the issue. The constants.ts comment now records the alternative and the trigger condition for revisiting ("3+ UI-imported bridge constants"). Future maintainers see the considered alternative without having to re-derive the trade-off.

Step 4 places `CHART_TAB_INITIAL_OPEN` in [src/hazbot/wildfire/constants.ts](../../src/hazbot/wildfire/constants.ts). It's imported by:
- [src/hazbot/wildfire/temporal-variables.ts](../../src/hazbot/wildfire/temporal-variables.ts) — bridge-internal, expected
- [src/components/right-panel.tsx](../../src/components/right-panel.tsx) — UI imports bridge
- [src/models/ui.ts](../../src/models/ui.ts) — model imports bridge

R14's chosen direction (UI → bridge) is defensible: the temporal-variable owns the "what value does the engine seed?" question, and the UI defers. But:
- Today, no other UI module imports anything from `src/hazbot/wildfire/`. This change establishes a *new* dependency edge from UI to bridge.
- The bridge's existing module surface ([factor-variables.ts](../../src/hazbot/wildfire/factor-variables.ts), [sim-props.ts](../../src/hazbot/wildfire/sim-props.ts), [translate.ts](../../src/hazbot/wildfire/translate.ts), [types.ts](../../src/hazbot/wildfire/types.ts)) is private to the engine layer. A new `constants.ts` is the first bridge module the UI reaches into.
- The conceptual question is which layer "owns" the chart-tab initial state — UI (because the chart is a UI element) or bridge (because the temporal projection needs the seed). The spec's answer is bridge, but the UI is the *visual ground truth*; the bridge is the *engine projection*. A reader could plausibly argue the bridge should defer to the UI.

R14 rejected (UI owns the constant; bridge imports it) on the grounds "the wildfire bridge never reaches up into `src/components/`." That's a real architectural concern. But a third option (constant lives in a neutral shared module) preserves both layering rules: neither UI imports bridge, nor bridge imports UI.

Options:
- (a) Keep the spec's design. UI imports bridge constant. One precedent now; more later if more temporal variables emerge.
- (b) Move the constant to a neutral location (`src/shared/chart-tab.ts` or similar) that both UI and bridge import. Three imports converge on a no-layer location; no directional dependency. Out-of-tree change (creates a new top-level shared module).
- (c) Put the constant in `src/models/` (next to `ui.ts`) and have the bridge import from `src/models/`. Inverts the spec's chosen direction. Probably rejected for the same reason R14 rejected UI-side ownership.

Suggest (b). Preserves both layering rules; precedent for "shared module" is set cheaply for one constant rather than discovered later under pressure. Cost: one extra file (~5 lines) vs. the current single-line bridge constant.

---

#### RESOLVED: `temporalReads` accumulates a third impl-side reference declaration alongside `requiredDefaults`; future drift toward four+ fields needs forethought
**Decision**: No spec change. The substrate has shipped two reference-declaration fields (`requiredDefaults`, `temporalReads`) and shows no concrete pressure toward a third. Speculating about a four-field future is premature — closer to the kind of "design for hypothetical requirements" CLAUDE.md guidance discourages. If a third reference-declaration kind is concretely proposed, revisit unification then; the parallel-field shape today is honest about the distinct referents (defaults keys vs. temporal-variable names) and isn't structurally inviting growth so much as accommodating two genuinely different needs.

After Step 9, `SimPropImpl` and `FactorVariableImpl` carry these reference-declaration fields:
- `requiredDefaults?: string[]` — names of `defaults` keys the impl reads
- `temporalReads?: string[]` — names of temporal variables the impl reads

The substrate validates each at construction time, reference-driven. Each has the same shape (`string[]` of names), same validation pattern, same compile-time limitation (impl body not introspected). They're parallel fields with parallel semantics but different referents.

This is the right granularity for current scope. But the impl interface is now structurally inviting more entries — "this impl reads X3," "this impl reads X4." Each would land as another optional `string[]`, each with its own validation walk, each silently disjoint from the others. The substrate's reference-driven walk pattern compounds linearly with the number of declared-read kinds.

The requirements.md Pass 2 Architectural Symmetry reviewer considered renaming `temporalReads → requiredTemporals` for parity — chose not to, on the grounds that different referents warrant different names. That decision stands for the rename question. But it doesn't address the structural-growth question: at what point should the substrate adopt a unified `reads?: { defaults?: string[]; temporal?: string[]; ... }` field?

No spec change suggested for this PR. Flagging for the next maintainer adding a third reference-declaration kind: consider the unified shape before adding the third sibling field. Adding `reads.X3?: string[]` to a unified field is a smaller refactor than reconciling three parallel disjoint fields later.

Optionally: add a one-paragraph note to Step 11's engine README "Adding a temporal variable" recipe acknowledging the parallel between `temporalReads` and `requiredDefaults`, so the precedent is at least visible to future contributors. Out-of-line of the checklist itself; small surface.

---

### Mutation / Immutability Reviewer

#### RESOLVED: Step 4 — placeholder engine's post-construction `placeholder.errors = [...]` mutation skips the tick contract
**Decision**: Option (b2) — pass the errors via a new `initialErrors?: EngineError[]` opt; the constructor merges them into `this.errors` *and suppresses* the synthetic `load-failure: missing-rule-set` entry when `initialErrors` is provided. Step 2's `EngineOpts` gains the field, the constructor-changes list adds the injection step (numbered 6), and the maintenance-gate comment is updated to reflect the new semantics. Step 4's catch block drops the post-construction `placeholder.errors = [...e.errors]` assignment in favor of `initialErrors: e.errors` in the opts. The constructor's bottom `tickAndNotify()` covers both paths — no missing-tick hazard, no post-construction mutation, no lazy-singleton-no-subscribers assumption. The semantic intent ("rebuild from caught errors") becomes a constructor input rather than a post-construction overwrite.

Step 4's `engine-singleton.ts` snippet (as it stood before this finding — see Decision above for the replacement):
```ts
// SUPERSEDED by Pass 4 Finding MU-1 — the live snippet uses initialErrors: e.errors instead.
const placeholder = new Engine<WildfireReading, WildfireDefaults>({ ... });
placeholder.errors = [...e.errors];  // mutation after construction
cached = placeholder;
return placeholder;
```

The placeholder constructor runs `tickAndNotify()` at [engine.ts:98](../../src/hazbot/engine/engine.ts#L98) (`snapshotVersion` → 1) — that's the "load-bearing initial-snapshot effect." The errors-array replacement happens *after* the constructor returns, **with no additional tick**.

Today this is operationally fine:
- The lazy singleton init means no listener can have subscribed before `cached = placeholder; return placeholder;`.
- The first downstream `useSyncExternalStore(...)` call reads `snapshotVersion = 1` and the *current* (post-replacement) errors array.

But the pattern violates the engine's tick invariant: every state mutation should be followed by a notify (engine.ts:233). The substrate guarantees stay intact only because of an external, undocumented assumption — "the placeholder is returned to the singleton callsite before any listener registers."

That assumption is fragile. A future change that adds a synchronous subscriber inside `getAnalysisEngine()` (e.g., a debug telemetry hook), or moves the catch block into a non-lazy path (e.g., a Provider that constructs the engine eagerly and exposes a callback for error notification), silently loses the error-array update.

Options:
- (a) Replace the assignment with a method call. Add a protected `_setConstructionErrors(errors: EngineError[])` to `Engine` (or expose the existing `errors` field through a setter). The method does the assignment AND calls `tickAndNotify()`. Substrate invariants preserved.
- (b) Pass the errors via opts: add `initialErrors?: EngineError[]` to `EngineOpts`. The constructor merges into `this.errors` *before* the bottom `tickAndNotify()`, so the existing tick covers the error injection. No post-construction mutation. Cleaner because the placeholder is conceptually "rebuild from caught errors" — the errors are constructor input.
- (c) Accept the divergence. Add a code comment naming the invariant exception (the lazy-singleton-no-subscribers assumption).

Suggest (b). The errors are input to the placeholder's purpose (surface them via sidebar); injecting via opts matches that semantic and avoids the post-construction mutation altogether. Cost: one new optional opt, ~3 lines in the constructor to merge into `this.errors` before the existing tick.

---

#### RESOLVED: Step 2 — `TemporalVariableChange.value` is held by reference in `temporalValues` map AND every trail entry; R1 immutability is documented but unenforced
**Decision**: Option (a) — `Object.freeze(newValue)` before storing. Step 2's `consume()` snippet now wraps the reducer return value in `Object.freeze(...)`; constructor step 3 also freezes every `temporalValues` initialization (both the `initialValue` default and `initialTemporalValues` override path) for consistency with the consume-path freeze. Comment block at the consume-path freeze names R1's immutability constraint and Pass-4 Finding MU-2 inline. For current scope (boolean values), the freeze is a no-op — primitives can't be frozen and no throw fires. For any future complex-V temporal variable, attempts to mutate the value after it lands in `temporalValues` / `temporalHistory` throw `TypeError` in strict mode (ESM is strict by default). The constraint becomes self-enforcing rather than self-documenting. Shallow freeze only — deep mutation through nested objects isn't caught, but the common one-level mutation case is; deep-freeze would add real cost without proportional benefit for current scope. R1's "immutability is the impl author's responsibility" framing is preserved; the engine now *backs* the responsibility with a runtime gate rather than just naming it.

Step 2's `consume()` snippet stores the reducer's return value in two places simultaneously:
```js
this.temporalValues[name] = newValue;                                      // live map
lastReading.temporalHistory.push({ ..., value: newValue });                // trail append
```

Plus a third reference at trigger time (R5a seed):
```js
reading.temporalHistory.push({ ..., value: this.temporalValues[name] });   // seed entry
```

For primitive `V` (current scope: boolean), references aren't a thing — primitives are copied by value. But the substrate's `TemporalVariableImpl<V>` is generic in `V` precisely so future variables can be non-boolean. For any complex `V` (object, array, Map, custom class), all three locations alias the *same heap reference*.

R1 carries a "Known constraint (immutability)" clause: reducers must return immutable values; mutation of a value after it lands in `temporalValues` or `temporalHistory` retroactively corrupts the history trail and breaks replay determinism. But:
- The constraint is documented in R1 (the spec).
- The constraint is **not enforced** by the engine. No `Object.freeze()`. No structured-clone. No runtime assertion. No lint rule on `TemporalVariableImpl.reduce` bodies.
- The R18c fixture-comparison `roundTrip(JSON.parse(JSON.stringify(...)))` catches *JSON-incompatibility* but not *post-write mutation* of a JSON-safe object.

The failure mode is silent and retroactive: a future temporal variable holding an array (e.g. "zones the user has placed sparks in"), a reducer returning the same array reference after `array.push(newZone)`, and **every prior trail entry's `value` field silently updates to the new array contents** — because they all point to the same array.

R18a's two-engine determinism test would catch this *if* the test exercised the affected variable AND the symmetric replay had reached the same point. But the R18a fixture is constructed live and replayed live; both engines mutate symmetrically. The bug would silently pass.

Options:
- (a) `Object.freeze(newValue)` before storing in `temporalValues` and the trail. For booleans (current scope), `Object.freeze(true)` is a no-op (primitives can't be frozen, no throw). For objects, attempts to mutate throw `TypeError` in strict mode (ESM is strict by default). Cost: one freeze per matching reducer fire; near-zero for current scope; light-up on first complex-V temporal variable.
- (b) `JSON.parse(JSON.stringify(newValue))` deep-clone before storing. Catches more cases (deep mutations through nested refs); higher cost. Matches the R18c `roundTrip` shape but applied per-write rather than per-test-comparison.
- (c) Document the invariant in Step 2's `consume()` snippet as a multi-line comment. Status quo, more visible.
- (d) Dev-only mode: only freeze (or clone) in non-production builds. Useful if perf becomes a concern; speculative for dev-only-today engine.

Suggest (a). Cheap, semantic-preserving for current scope, escalates protection automatically for any complex-V future variable. The constraint becomes self-enforcing rather than self-documenting. Pairs naturally with R1's "immutability is the impl author's responsibility" framing — the engine now *backs* the responsibility with a runtime gate rather than just naming it.

---

#### RESOLVED: Step 6 — hook's `temporalValues` / `observed` shallow copies are defensive against an invariant that already holds
**Decision**: Resolved jointly with Pass-4 Finding MR-2 (the MobX/React-angle complement). MR-2's fix dropped the shallow copies from `HookReturn` and `computeView` entirely; the sidebar reads `engine.temporalValues` and `engine.observed` directly off the `engine` reference already exposed by the hook. This finding's mutation-angle argument (the copies don't actually defend against anything, given R1's immutability constraint and Pass-4 Finding MU-2's runtime `Object.freeze` enforcement) converges on the same fix from a different angle. No additional spec change beyond MR-2's edit.

Step 6's `computeView` adds:
```ts
const temporalValues = { ...engine.temporalValues };
const observed = { ...engine.observed };
```

This finding is the mutation-angle complement to the MobX/React finding above (which framed the same code as asymmetric pattern). From the mutation angle: **what do the shallow copies protect against?**

For current scope (one boolean variable):
- Booleans are immutable; copy or alias is observationally identical.
- Map keys are stable (no add/remove at runtime); the copy's keyset matches the engine's.
- No downstream consumer mutates the returned maps; the sidebar reads-and-renders.

The shallow copy serves no defensive purpose at all. If a future complex-V variable lands and the R1 immutability constraint is honored (per Mutation Finding 2 above), the values are immutable and copying offers no additional safety. If R1 is *violated* and a value is mutated through the live engine reference, the shallow copy shares the same nested reference — the copy's `temporalValues[name]` *is* the engine's `temporalValues[name]` for object values. The shallow copy doesn't protect; it just allocates.

This is dead weight even by defensive-programming standards. Either the copies should be deep clones (real protection, real cost) or they shouldn't exist (current cost, no protection).

Options:
- (a) Drop the copies. Sidebar reads `engine.temporalValues` and `engine.observed` directly via the `engine` field already in HookReturn. Mirrors the existing pattern for `engine.readings` / `engine.errors`. Zero allocation, zero defense, zero asymmetry.
- (b) Replace with deep clones (`JSON.parse(JSON.stringify(...))`). Real defense; higher cost; requires JSON-safe values (R1's existing constraint already covers this for fixture compat).
- (c) Keep the shallow copies. Document explicitly that they exist as "future-proofing" (i.e., a no-op today). Honest but ugly precedent.

Suggest (a). This is the same conclusion as the MobX/React finding (MR-2) reached from a different angle — both reviewers converge on the same suggestion. Two reviewers, one fix; the snippet is incompatible with both the React-pattern symmetry and the mutation-protection rationale, so dropping it is the consistent move.

---

