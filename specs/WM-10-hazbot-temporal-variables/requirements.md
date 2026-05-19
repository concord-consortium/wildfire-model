# Hazbot — Temporal Variables (Replace Ambient State)

**Jira**: https://concord-consortium.atlassian.net/browse/WM-10
**Repo**: https://github.com/concord-consortium/wildfire-model
**Implementation Spec**: [implementation.md](implementation.md)
**Status**: **In Development**

## Overview

Replace the Hazbot engine's `ambientState` channel with a "temporal variable" construct: engine-maintained projections that fold logged state-change events into a value trail per reading. Impls read this trail directly — either as the final value during the reading's window, or as a sticky-OR over the window's appends. This is rewritten during Finalization.

## Project Owner Overview

The Hazbot analysis engine classifies student behavior from a log of user-facing events. The current implementation lets the host app stamp side-channel "ambient" data onto specific events (e.g. "was the chart tab open when the simulation started?"). This works but couples the engine to the live app: an analyst can't replay a captured log file and get the same classifications, because the ambient fields aren't part of the public log. This spec replaces that side channel with a first-class construct — *temporal variables* — declared in the wildfire bridge, fed by ordinary logged events, and projected by the engine itself. Logs become self-describing, the host app stops doing engine-side bookkeeping, and the construct generalizes to any future "what was X when Y happened?" rule. Rewritten during Finalization.

## Background

PR review on the WM-10 analysis-engine work flagged the `ambientState` channel as architecturally problematic. Two concerns, both stemming from the same root:

1. **Replay loss.** Engine state can't be reconstructed from a logged event stream alone — the ambient values live outside the log. Validation runs against captured logs are blocked.
2. **Host coupling.** The host app has to know which impls need which ambient keys at which trigger events ([src/components/bottom-bar.tsx:252](src/components/bottom-bar.tsx#L252) stamps `chartTabOpenAtStart` precisely because `GraphOpen` declares it via `ambientStateKeys`). This places engine-side bookkeeping in the host.

The reviewer proposed two options. Option 1 (move ambient values into the event `data` payload) just relocates the coupling — the host still computes "the right value at the right time." Option 2 (temporal variables) inverts the dependency: the host emits raw state-change events, the engine derives projections, and rules read those projections.

Beyond ambient state, this work also retires the engine's general-purpose **modifier** mechanism (`BaseReading.updates`, `ReadingUpdate`, `kind: "modifier"`, `orphan-modifier` validation, sidebar "N update(s)" label). Chart-tab events were its only emission site; `GraphOpen` was its only consumer. Once a typed `temporalHistory` array (declared variables, validated `temporalReads`) handles that case with stronger semantics, the generic modifier channel becomes dead code. See R10b.

**On bundling the additions and removals into one PR**: temporal-variable introduction and ambient/modifier removal land together rather than as sequential PRs. The two-mechanism interim state a split-PR plan would temporarily ship is exactly the architectural problem this work solves; coexistence would prolong the state we're trying to retire. The blast radius is acceptable because the analysis engine isn't shipped to production — there's no captured-log migration concern (per Out of Scope).

### Preconditions

The following load-bearing assumption shapes several decisions in this spec. **If it flips (the analysis engine ships to production), those decisions must be re-evaluated before any new work proceeds in this surface area.**

- **The analysis engine is dev-only today.** No production-deployed surface depends on engine output; no captured production logs predate this PR. This assumption underwrites:
  - **Single-PR bundling** (this section) — coexistence of old + new mechanisms during a multi-PR rollout would be acceptable if the engine shipped; today the architectural cleanup outweighs the rollback granularity.
  - **No captured-log migration** (Out of Scope, ship-readiness bullet) — there are no field-captured logs containing `ambientState` keys that the new engine cannot parse.
  - **Sidebar-only error surfaces** (R7, R16) — `temporal-validation` and `temporal-reducer-error` render only in the dev sidebar. If the engine shipped, those errors would need an external telemetry surface (e.g. LARA, log-monitor) so production diagnostic loops can see them.
  - **R18c covers ruleset 25 only** (R18c Scope clause) — fixture coverage is intentionally narrow because today only ruleset 25 exercises a novel substrate construct. A shipped engine would warrant broader fixture coverage to defend production classifications.

When the engine ships, the follow-up work needed (captured-log migration, external error surfaces, broader fixture coverage, deprecation of the bridge-side singleton bypass in R18a) is deferred to a separate spec triggered by the ship decision.

The construct, in shape:
- The wildfire bridge declares one or more **temporal variables**, each with a name, an initial value, and a `reduce(currentValue, event) → newValue` reducer over a set of state-change event types.
- The engine maintains a live projected value for each temporal variable. Every consumed event runs through the relevant reducers in arrival order.
- Each reading carries a grow-only `temporalHistory` array: at trigger time, the engine seeds the array with the current value of every declared temporal variable (self-contained reading); between triggers, every reducer-produced change appends a new `TemporalVariableChange` entry to the most recent reading's array. Impls read this trail directly — `temporalHistory.findLast(...)` for "current/final value during the window," `temporalHistory.some(...)` for "ever was value V during the window" (sticky-OR), preserving the pre-refactor semantics of `GraphOpen`.
- Validation: an impl declares `temporalReads` listing the temporal variables it consumes; the engine validates references at construction time. Declared-but-unobserved temporal variables retain `initialValue` silently — this is a legitimate state, not a bug.

Concrete scope for this PR: the only existing ambient-state use is `GraphOpen` reading `chartTabOpenAtStart` on `SimulationStarted`. After this refactor:
- A temporal variable `chartTabOpen` (initial value `false`) is updated by `ChartTabShown` (→ `true`) and `ChartTabHidden` (→ `false`).
- `GraphOpen` becomes a sticky-OR over the reading's `temporalHistory` — true if any `chartTabOpen=true` entry exists in the window (seed or append), preserving the pre-refactor "open at start OR opened during run" semantics.
- The `ambientState` field, `ambientStateKeys` declarations, and `ambient-validation` error variant are removed.
- [src/components/bottom-bar.tsx:252](src/components/bottom-bar.tsx#L252) drops the third `log()` argument.
- [src/log.ts:16](src/log.ts#L16) drops the third `ambientState` parameter.
- [src/hazbot/wildfire/translate.ts:53](src/hazbot/wildfire/translate.ts#L53) no longer needs to suppress `ChartTab*` events outside an active run — they're now valid state changes the engine cares about.

## Requirements

### Engine-side construct

- **R1** — Define a `TemporalVariableImpl<V>` type with: `name`, `initialValue: V`, `acceptedEvents: string[]` (logged event types that drive updates), `reduce(currentValue: V, event: ConsumedEvent) → V`. **`reduce` must be a pure function of `(currentValue, event)`** — no reads of `Date.now()`, `Math.random()`, or any mutable external state. Impurity breaks replay determinism (R18a) silently; the engine has no way to detect it. **Event-level atomicity.** Reducer dispatch for a single event is two-phase: in phase 1, the engine iterates the matching reducers in declaration order, running each `reduce()` into a buffer of `{name → newValue}` pairs and a buffer of `TemporalVariableChange` entries. No live `temporalValues` mutation and no `temporalHistory` append occurs during phase 1. In phase 2 (only if phase 1 completed without any throw), the engine atomically commits the buffered `temporalValues` updates and `observed` flips, regardless of whether a current reading exists. The `temporalHistory` appends are applied to the current reading if one exists; if no reading exists yet (pre-trigger events), the appends are no-ops per R5b but the `temporalValues`/`observed` commits still fire. This split is load-bearing — pre-trigger reducer fires (e.g. user toggles the chart tab before `SimulationStarted`) must update live state for `GraphOpen` to see the correct seed value at the first trigger. Then `translate()` and trigger evaluation run. **On reducer throw.** If any `reduce()` call in phase 1 throws, the engine catches and pushes an `EngineError` variant `temporal-reducer-error` (fields: `ruleSetId`, `variableName`, `event`, `thrown`, `at`). Phase 2 is skipped entirely — no `temporalValues` update commits, no `TemporalVariableChange` append fires, `translate()` does not run, and trigger evaluation does not run. Live `temporalValues` is left in its exact pre-event state (no partial commit), preserving replay determinism (the same input produces the same abort point) and keeping the live map in a coherent pre-event snapshot rather than a half-updated state. Mirrors the existing `impl-eval-throw` pattern ([engine/types.ts:84-87](src/hazbot/engine/types.ts#L84-L87)) for factor-variable / sim-prop throws — reducer throws are the same class of impl bug. Catching is necessary because `consume()` is called from [src/log.ts:24](src/log.ts#L24) inside `log()`, which is called from many UI event handlers ([bottom-bar.tsx:252](src/components/bottom-bar.tsx#L252) and elsewhere); an uncaught throw would propagate out of `log()` and break UI handlers mid-render. Replay determinism is preserved — the same input produces the same error, the same dropped append, the same skipped trigger evaluation. Sidebar renders the error via the existing `renderError` / `describeErrorContext` pipeline. **Known tradeoff**: `acceptedEvents` is loose `string[]` — a typo (`"ChartTabShon"`) compiles, never matches, and the temporal variable silently retains `initialValue`. The engine has no event-name registry to constrain this. Same shape as the R1a tradeoff but with a worse failure mode (silent functional bug vs. silent dead declaration). Accepted for this pass; a typed event-name union in the bridge would eliminate the class but inverts the substrate→bridge dependency. **Known constraint**: temporal-variable value types `V` should be JSON-safe (booleans, numbers, strings, plain objects, arrays). The R18c fixture format is JSON; non-JSON-safe values (`Set`, `Map`, `Date`, class instances) silently flatten under `JSON.stringify`, breaking fixture parity with live engine state. Enforced by convention, not TypeScript types. Current scope (boolean `chartTabOpen`) is trivially compliant. **`undefined` is also forbidden** as `initialValue`, as any reducer-returned value, and as any override in `initialTemporalValues`. JSON cannot represent `undefined` (it elides keys whose values are `undefined`), so a temporal variable with `initialValue: undefined` would be un-fixturable: omitting the key from the fixture's `initialTemporalValues` map hits R7's `missing` arm (exhaustiveness), while setting the key to JSON `null` hits the `typeMismatches` arm (`runtimeType(null) === "null"` ≠ `"undefined"`). If a future use case needs nullable temporal state, use `null` (JSON-representable, `runtimeType` returns `"null"`) or a sentinel string (`"uninitialized"`); never `undefined`. R5d's `currentTemporal<V>(reading, name): V | undefined` signature still returns `undefined` for the "name not found in the reading's `temporalHistory`" case — that's a *helper return* signal, distinct from a *stored variable value*. **Known constraint (immutability)**: reducers must return immutable values. Either construct new objects/arrays each call, or use only primitive-typed values (booleans, numbers, strings — current scope). Mutation of a value after it lands in `temporalValues` or `temporalHistory` (whether by the reducer that produced it, by the consumer that read it, or by any third party holding the reference) retroactively corrupts the history trail and breaks replay determinism (R18a) and the worked-example debug timeline. The engine does not clone or freeze on write — purity is the impl author's responsibility, enforced by convention (and code review), not by types or runtime checks. Current scope (boolean `chartTabOpen`) is trivially compliant.
- **R1a** — `FactorVariableImpl` and `SimPropImpl` gain an optional `temporalReads?: string[]` field listing the names of temporal variables the impl reads. Parallel in spirit to `requiredDefaults`. The engine uses this list to validate references at construction time. **Known tradeoff (matches `requiredDefaults`)**: nothing checks that the impl body actually reads the names it declares. A stale `temporalReads` entry is silent dead code. Conversely, an omitted entry — the impl reads a variable it didn't declare — produces no construction-time error: the impl works today (the rule set declares the variable, so it's seeded into `temporalHistory`), but loses the safety net. If the rule set later drops that variable from its declarations, the impl's `currentTemporal(...)` call silently returns `undefined` rather than triggering a `temporal-validation` error linking impl → missing variable. The author keeps the declaration in sync manually.
- **R2** — Temporal-variable impls are declared bridge-side and passed to `new Engine(...)` alongside `factorVariables` and `simProps`. The same set applies to every rule set the bridge can construct (symmetric with sim-props; rule-set TypeScript modules do not declare temporal variables). The shape is parallel to existing impl maps (`{ [name: string]: TemporalVariableImpl }`). **Iteration semantics**: declaration order is defined as JavaScript object insertion order for string keys (ES2015+ standard). The engine reads the map via `Object.keys()` (or equivalent `for...in` / `Object.entries` traversal) and treats the resulting order as authoritative for R3 reducer dispatch, R5a seed emission, R5b multi-variable append ordering, and R18a/R18c fixture parity. Parallels the existing `factorVariables` and `simProps` impl maps, which rely on the same insertion-order semantics. If a future refactor needs explicit ordering control independent of declaration site (e.g. dependency-graph topological order), the map type would change to `Array<[string, TemporalVariableImpl]>` — out of scope for this pass. **Naming constraint**: temporal variable names must be non-numeric identifiers (i.e. not integer-like strings such as `"1"`, `"42"`, `"100"`). ES2015+ `Object.keys()` sorts integer-like string keys numerically *before* non-numeric keys in insertion order, which would break R2's "declaration order = iteration order" promise and corrupt R3 reducer dispatch, R5a seed emission, R5b multi-variable append ordering, and R18a/R18c fixture parity. Enforced by convention (and code review) for current scope; recommended name pattern is standard camelCase identifiers (`chartTabOpen`, `helitackUsed`). If a future bridge needs runtime enforcement, add a construction-time check that throws on integer-like names. **`new Engine(...)` also accepts an optional `initialTemporalValues?: Record<string, unknown>` constructor argument** for overriding the per-variable `initialValue` defaults at construction. Use case: replay tooling that loads a captured log and supplies the session-start state of every declared temporal variable so classifications match the original session. Live runtime omits this arg → every variable uses its declared `initialValue`. When provided, the map must be exhaustive — every declared temporal variable's name must be a key, and no unknown keys are permitted (enforced by R7's `temporal-initial-values-mismatch` variant).
- **R3** — The engine maintains, per session, a live `temporalValues: Record<string, unknown>` map. **Initialization**: if R2's optional `initialTemporalValues` constructor arg is provided, the engine first runs the exhaustiveness check (R7's `temporal-initial-values-mismatch`); on pass, `temporalValues` is initialized from the override map. If `initialTemporalValues` is omitted, `temporalValues` is initialized from each variable's declared `initialValue`. The `observed` map (described later in this requirement) is *always* initialized to `false` for every declared variable, regardless of whether `initialTemporalValues` was provided — the override represents "session-start state restored from a captured log," not "an event fired." On every `consume()`, for each declared temporal variable, if `event.name` is in its `acceptedEvents`, the engine calls `reduce()` and replaces the stored value (via R1's phase-2 commit). When a single event matches multiple temporal variables' `acceptedEvents`, reducers are invoked in the order the variables are declared in the `temporalVariables` map passed to `new Engine(...)`. (No current use case; this fixes the order to prevent future churn if reducers become interdependent.) The engine also maintains a parallel `observed: Record<string, boolean>` map initialized to `false` for every declared temporal variable. Whenever R1's phase 2 commits a buffered reducer output for a variable, `observed[name]` flips to `true`. The flag is sticky (never resets within a session) and is independent of value-equality — it flips on the *first* successful reducer fire for a variable, regardless of whether the new value equals the previous value or the `initialValue`. The flip happens only in phase 2, not during phase 1's buffered dispatch — a reducer that throws in phase 1 leaves `observed[name]` unchanged (per R1's no-partial-commit rule).
- **R4** — Temporal-variable updates apply *before* trigger evaluation for the same event. A trigger reading therefore reflects post-update temporal values for any state change carried by its own event.
- **R5** — Each reading carries a grow-only `temporalHistory: TemporalVariableChange[]` array where `TemporalVariableChange = { at: number; name: string; value: unknown; eventName: string }` (`name` is the temporal-variable name; `eventName` is the source event whose reducer fire produced this entry — see R5a for the seed-entry convention and R5b for the append-entry convention). The array is seeded at trigger time (R5a) and appended to between triggers (R5b). Consumers should iterate the array directly; `(at, name)` is not a unique key. Multiple entries for the same name at the same `at` are valid — e.g. the same-event scenario in Out of Scope where R4 (reducer-before-trigger) plus R5b (append to previous reading) plus R5a (seed of new reading) interact.
- **R5a — Seed at trigger time.** The engine seeds the new reading's `temporalHistory` with one entry per declared temporal variable, in declaration order from the `temporalVariables` map passed to `new Engine(...)` (matching R3's reducer-dispatch order), capturing each variable's current value from the live `temporalValues` map. Seed entries' `eventName` is the trigger event's `name` — the seed represents "what the variable's value was at the moment the trigger fired." Every reading is self-contained — its temporal history is fully derivable without walking prior readings.
- **R5b — Append between triggers.** Every consumed event whose `name` is in some temporal variable's `acceptedEvents` appends a `TemporalVariableChange` (carrying the reducer's output value, and the consumed event's `name` as `eventName`) to the current reading's `temporalHistory`. When the event matches multiple variables, appends fire in the same order as reducer dispatch (declaration order per R3), so the resulting `temporalHistory` slice for that event is deterministic. Same-value reducer outputs still append — the array is a complete trail of state-change events the engine observed. Once a new trigger arrives, the previous reading's `temporalHistory` stops growing. If no reading exists yet, the live `temporalValues` still updates (per R3); the append is a no-op.
- **R5c — Timestamp source.** Every `TemporalVariableChange.at` equals the `at` of the consuming event — so seed entries have `at === reading.at`, and append entries carry the state-change event's `at`. A reading's `temporalHistory` is directly readable as a timeline.
- **R5d — Read helpers.** A standalone helper `currentTemporal<V>(reading, name): V | undefined`, exported from the engine substrate (alongside the existing `findLast`), returns the last `TemporalVariableChange.value` for a given name in a reading's `temporalHistory` ("current/final value during this window"). The caller asserts the type parameter `V` matches the declared variable's value type — the helper does not validate this at runtime. For sticky-OR semantics ("ever was value V during this window"), impls scan the array directly: `reading.temporalHistory.some(c => c.name === "chartTabOpen" && c.value === true)`. This preserves the pre-refactor sticky-OR semantics of `GraphOpen` (which combined "open at start" OR "opened during run").
- **R6** — The live `temporalValues` map (separate from per-reading `temporalHistory` arrays) remains available for the sidebar's "Current Values" view, which may differ from any reading's final value if state has changed since the last trigger. The parallel `observed` map (R3) is exposed alongside it for the sidebar's observed/unobserved styling cue (R16).

### Validation

- **R7** — Four new `EngineError` variants:
  - **`temporal-validation`** — fires at engine construction time when a referenced impl's `temporalReads` lists a name not present in the bridge-supplied temporal-variable declarations (per R2). Fields: offending impl name, `implType: "factorVariable" | "simProp"` (which impl category declared the bad `temporalReads`), the missing temporal-variable name, and the *active* rule-set id (the rule set being constructed, not a per-rule-set declaration scope). No runtime/trigger-time validation: declared-but-unobserved temporal variables retain their `initialValue` silently (this is a feature, not a bug).
  - **`temporal-reducer-error`** — fires at runtime when a temporal-variable's `reduce()` throws (per R1's catch-and-surface clause). Fields: `ruleSetId`, `variableName`, `event` (the `ConsumedEvent` that triggered the reducer), `thrown` (the caught value), `at`. Mirrors the existing `impl-eval-throw` shape for evaluator throws.
  - **`trigger-state-change-overlap`** — fires at engine construction time when any event name appears in both a declared temporal variable's `acceptedEvents` and any factor variable's `logEvents` (trigger events). Fields: `variableName`, `eventName`, `factorVariableName` (the first factor variable, in declaration order from the `factorVariables` map passed to `new Engine(...)`, found declaring this event as a trigger). Rationale: the interaction between R4 (reducer-before-trigger), R5a (seed new reading), and R5b (append to previous reading) would produce two `TemporalVariableChange` entries at the same `at` — semantically defensible (the previous reading's trail must be complete; the new reading must be self-contained) but not pinned by any current use case. The guard fail-loud-on-declaration until a concrete use case arrives to pin the semantics. **Not reference-driven** (unlike `temporal-validation`): the projection is maintained for every declared variable regardless of reference, so the conflict exists at the declaration level. **Known limitation (substrate assumption)**: this guard scans `factorVariables[*].logEvents` and treats those as the exhaustive set of trigger-producing events. If `translate()` returns `kind: "trigger"` for an event whose name is not in any factor variable's `logEvents` (e.g. a bridge-side trigger not driving a factor variable, or a future system lifecycle hook), the overlap with a temporal variable's `acceptedEvents` is not caught at construction time. The current wildfire bridge's `translate.ts` happens to derive all triggers from declared `logEvents` events (`SimulationStarted` is in `logEvents` for the factor variables that depend on run-start), so the guard is complete for today's scope. A follow-up could add runtime-guard logic (at `consume()` time, emit a new variant if `event.name ∈ acceptedEvents` and `translate()` returned `kind: "trigger"`) to close the gap if a future bridge violates the substrate assumption.
  - **`temporal-initial-values-mismatch`** — fires at engine construction time when R2's optional `initialTemporalValues` constructor argument is provided and either its keys don't exactly match the declared temporal-variable names, *or* an override value's runtime type doesn't match its declared `initialValue`'s runtime type. Fields: `missing: string[]` (declared variables not present as keys in the override map), `unknown: string[]` (override-map keys not matching any declared variable), `typeMismatches: Array<{ name: string; expectedType: string; actualType: string }>` (override values whose runtime type differs from the declared `initialValue`'s type). The variant is recorded if any of the three lists is non-empty, which (being a construction-time variant) causes `new Engine(...)` to throw per the preamble. Runtime-type check: a `runtimeType(v)` helper returns `"null"` if `v === null`, `"array"` if `Array.isArray(v)`, and `typeof v` otherwise. A mismatch fires when `runtimeType(override) !== runtimeType(declared)`. The helper handles three corner cases that bare `typeof` misses: (i) `typeof null === "object"`, which would otherwise let `null` accept `{}` overrides silently; (ii) `typeof []` and `typeof {}` both `"object"`, which would let an array accept a plain-object override; (iii) the same array/object ambiguity in reverse. Catches the common loader mistake of serializing booleans as strings (`"true"` vs `true`) or numbers as strings without parsing, which would silently misclassify rules using strict equality. Does not validate nested shape — for current scope (boolean), the check is sufficient; for future complex `V`, a per-impl `validate(value)` predicate could be added if needed. **Not reference-driven**: the check fires regardless of whether any impl actually reads the affected variable, because misalignment between captured replay state and current declarations is a replay-correctness bug at the construction boundary. Rationale: strict exhaustiveness + type-shape is the right default for the replay-tooling use case (partial overrides silently fall back to declared defaults, or wrong-type overrides silently break strict-equality rules → exactly the misclassification traps this construct was designed to eliminate). Tests that want partial overrides must explicitly supply all declared keys with correctly-typed values.

  Runtime variants (`temporal-reducer-error`, the only runtime variant in this set) are recorded into the live engine's `errors: EngineError[]` array, readable as `engine.errors`. Construction-time variants (`temporal-validation`, `trigger-state-change-overlap`, `temporal-initial-values-mismatch`) are recorded into a local buffer during `new Engine(...)`; at end-of-construction, if the buffer is non-empty, the engine throws an `EngineConstructionError` carrying that buffer — no engine instance is ever returned. **There is no `engine.errors` readable on construction failure**; the buffer lives only on the thrown error's `errors` field. Callers that catch the throw must read `caught.errors`; reading `engine.errors` is impossible because there's no engine. The typed exception is `EngineConstructionError` with shape `{ message: string; errors: EngineError[]; ruleSetId: string }`. The `errors` array carries every construction-time variant recorded during this `new Engine(...)` call (multiple variants can fire if, for example, both `temporal-validation` and `trigger-state-change-overlap` are triggered by different declarations). The bridge catches `EngineConstructionError` specifically (not bare `Error`) and stashes `errors[]` for sidebar render via the same `renderError` + `describeErrorContext` pipeline used for live-engine errors. A bridge that catches bare `Error` and stringifies it would lose the structured payload — the typed-catch is load-bearing. The runtime variant (`temporal-reducer-error`) is caught-and-recorded only (per R1) — `consume()` does not throw out, since it's called from `log()` inside UI event handlers. All four variants render via the sidebar's `renderError` + `describeErrorContext` pipeline, matching the existing `ambient-validation` / `impl-eval-throw` rendering pattern.

  **Considered-and-rejected**: a unified `impl-throw` variant with a `kind: "compute" | "evaluate" | "reduce"` discriminant covering all three impl categories. Rejected because the contexts differ enough — factor/sim-prop throws happen during *reading* evaluation (context is reading + impl name), reducer throws happen during *event consumption* (context is event + variable name + `ruleSetId`) — that separate variants render more cleanly in the sidebar's `describeErrorContext` switch than a single variant with conditional field rendering. Kept as a note here so a future reviewer sees the asymmetry was deliberate.
- **R8** — `temporal-validation` is reference-driven: only `temporalReads` on impls actually referenced by the active rule set's category expressions participate, mirroring the existing reference-driven walk in [src/hazbot/engine/engine.ts:134](src/hazbot/engine/engine.ts#L134). `trigger-state-change-overlap` is *not* reference-driven (per R7) — it scans every declared temporal variable's `acceptedEvents` against every factor variable's `logEvents`, because the engine maintains the projection for every declared variable regardless of reference, so the same-event conflict exists at the declaration level. `temporal-initial-values-mismatch` is also *not* reference-driven (per R7) — the override map's keyset must match the full declared set regardless of impl reference, because misalignment is a replay-correctness bug at the construction boundary. `temporal-reducer-error` is a runtime variant, not a construction-time validation.

### DSL / referencing

- **R9** — Whether temporal variables are referenced *directly* in the rule-set expression DSL is out of scope for the first pass. Impls remain the only consumers; expressions still reference factor variables and sim-props as today. (See Out of Scope, and Q3.)

### Removing ambient state and the legacy modifier mechanism

- **R10** — Remove `ConsumedEvent.ambientState`, `FactorVariableImpl.ambientStateKeys`, `SimPropImpl.ambientStateKeys`, the `ambient-validation` EngineError variant, and the associated engine validation path.
- **R10b** — Remove the legacy modifier mechanism wholesale: the `BaseReading.updates: ReadingUpdate[]` field, the `ReadingUpdate` interface, the `kind: "modifier"` branch in `TranslateResult`, the engine's `lastReading.updates.push(...)` dispatch ([engine.ts:284](src/hazbot/engine/engine.ts#L284)), the `orphan-modifier` EngineError variant + its rendering, and the sidebar's "N update(s)" label. The new typed `temporalHistory` array (R5) replaces this mechanism with stronger semantics (declared temporal variables, validated `temporalReads`).
- **R11** — Remove `WildfireReading.ambientState`.
- **R12** — Remove the third `ambientState` parameter from [src/log.ts:16](src/log.ts#L16) and the corresponding host call in [src/components/bottom-bar.tsx:252](src/components/bottom-bar.tsx#L252).
- **R13** — Convert `GraphOpen` in [src/hazbot/wildfire/sim-props.ts:80-87](src/hazbot/wildfire/sim-props.ts#L80-L87) to scan `reading.temporalHistory` for any `chartTabOpen=true` entry (sticky-OR semantics) instead of reading `reading.ambientState.chartTabOpenAtStart` and `reading.updates`. The combined "ambient at start OR ChartTabShown modifier during run" logic collapses to a single `temporalHistory.some(...)` check.

### Wildfire-side temporal variable

- **R14** — Declare a temporal variable `chartTabOpen: boolean`:
  - `initialValue: CHART_TAB_INITIAL_OPEN` — imported from a new file [src/hazbot/wildfire/constants.ts](src/hazbot/wildfire/constants.ts) where the value is `false`. The same constant is imported by both UI initializers of chart-tab visibility: [src/components/right-panel.tsx:11](src/components/right-panel.tsx#L11) (`useState` initial value for the panel's local `open` state) and [src/models/ui.ts:11](src/models/ui.ts#L11) (`UIModel.showChart` initial value, the MobX observable the rest of the app reads). Both must use the constant so all three views of "is the chart visible at session start?" agree. The constant lives bridge-side (not UI-side) so the import direction is UI → engine; the wildfire bridge never reaches up into `src/components/`. **Constant is for fresh-session defaults only.** Replay tooling that restores a captured session in which the chart was already visible at log start overrides via R2's `initialTemporalValues` constructor arg (e.g. `new Engine({ ..., initialTemporalValues: { chartTabOpen: true } })`). Live runtime omits the override; the engine uses the constant. This lets pre-deployment logs replay correctly even when the captured session started with the chart open via a future URL-param path that didn't emit a boot-time `ChartTabShown` — the replay tool supplies the initial state instead. Single source of truth: if the UI default ever flips (URL-param default, preset addition, saved-session re-entry), the temporal projection's initial value updates in lockstep — TypeScript tracks the dependency. Prevents the silent-misclassification failure mode where the UI shows the chart visible from session-start but the engine projects `chartTabOpen=false` until the user manually toggles.
  - `acceptedEvents: ["ChartTabShown", "ChartTabHidden"]`
  - `reduce(_prev, event) → event.name === "ChartTabShown"`
- **R15** — [src/hazbot/wildfire/translate.ts:44-58](src/hazbot/wildfire/translate.ts#L44-L58) simplifies: `ChartTabShown`/`ChartTabHidden` translate uniformly as `no-op` results regardless of run state (they're pure state-change events that drive the engine's temporal projection; they no longer produce modifiers or readings). The dependency on `latestReading` in [engine-singleton.ts:42-44](src/hazbot/wildfire/engine-singleton.ts#L42-L44) goes away.

### Sidebar

- **R16** — The dev sidebar at [src/hazbot/engine/sidebar/sidebar.tsx](src/hazbot/engine/sidebar/sidebar.tsx) gains a "Temporal Variables" panel showing current (live) values, slotted **above Sim Props** so the dependency direction reads top-to-bottom (Factor Variables → Temporal Variables → Sim Props → Readings). Within the Temporal Variables panel, variables render in declaration order from the `temporalVariables` map (per R2's iteration semantics) — matching the per-reading summary order and the seed-emission order in R5a. Validators reading top-to-bottom see the same variable sequence in the live panel, in seed entries of any reading's expand view, and in the collapsed reading-row summary. The Sim Props panel as a whole sits *below* the Temporal Variables panel (cross-panel dependency direction). Within the Sim Props panel, sim-props render in declaration order from the bridge's `simProps` map — no resorting by `temporalReads`. The `· reads: <name>` inline hint (described below) is the trace affordance for cross-panel navigation; intra-panel order stays predictable across spec changes. Each row in the Readings panel shows, in its collapsed (default) state, a one-line summary of the reading's `temporalHistory` final values plus a count of *updates* during the window — defined as `temporalHistory` entries excluding the trigger-time seed (so the count reflects reducer fires within the window, not the initial snapshot). The count includes same-value reducer outputs per R5b's "complete trail" semantics — it counts reducer *fires*, not value transitions, because the array is a debug timeline of what the engine observed, not a deduplicated value-change log. For the Worked example's `readings[0]` (1 seed + 2 appends), the label is `chartTabOpen: false (2 updates)`. For `readings[1]` (1 seed, no appends), the label is `chartTabOpen: false (0 updates)`. Reuses today's "N update(s)" label phrasing (the legacy meaning is gone per R10b; the word is freed up). **Per-variable update count, formally**: per R5a, the first N entries of `temporalHistory` (where N = number of declared temporal variables) are the seed block, emitted in declaration order before any reducer-driven append. All subsequent entries are appends. The update count for variable V is `temporalHistory.slice(N).filter(c => c.name === V).length` — i.e. the count of append entries with that variable's name. Equivalently, `temporalHistory.filter(c => c.name === V).length - 1` (filter by name, subtract the guaranteed-single seed for that variable). Either formulation works; tests should pin one for consistency. When multiple temporal variables are declared, the summary lists `name: value (N updates)` segments in declaration order from the `temporalVariables` map (per R2's iteration semantics), separated by `, ` (comma-space). All declared variables appear in every reading's summary — observed and unobserved alike — so the column structure stays stable across readings. Example with two declared variables: `chartTabOpen: false (2 updates), helitackUsed: true (1 update)`. Sidebar UX is free to truncate or wrap when the row gets wide, but the underlying string follows this order. The existing expand toggle ([sidebar.tsx:201-217](src/hazbot/engine/sidebar/sidebar.tsx#L201-L217)) reveals the full trail with per-entry timestamps + variable name + value + source event name (per R5's `TemporalVariableChange.eventName` field). The Sim Props panel renders each prop's `temporalReads` (if declared) as a small inline hint (e.g. `GraphOpen: true · reads: chartTabOpen`), giving the validator a one-hop trace from sim-prop result to the relevant temporal-history entry. The Temporal Variables panel distinguishes "initial value, not yet observed" from "observed value" visually (e.g. muted/italicized for unobserved, normal for observed). "Observed" = the engine's `observed[name]` flag is `true` (R3). The flag flips on the first successful reducer fire for a variable (including pre-trigger fires that produced no append per R5b's no-reading-yet clause, and same-value reducer outputs whose append exists in `temporalHistory` but leaves the live `temporalValues` at `initialValue` — making them indistinguishable from "no event fired" to any sidebar logic that inspected only `temporalValues`) and never resets within a session. The sidebar reads this flag directly from the engine; no derivation from `readings[].temporalHistory` or live `temporalValues` is needed. Engine cost: one boolean per declared variable, flipped in R1's phase 2 commit. The bit also serves as a canary for R1's atomicity protocol — R18d asserts it stays unchanged across a reducer throw, pinning that the flip happens only in phase 2 (not during phase 1's buffered dispatch). The ErrorsPanel + `describeErrorContext` ([sidebar.tsx:288 area](src/hazbot/engine/sidebar/sidebar.tsx#L288)) gain cases for all four new variants per R7 — `temporal-validation` (rendering the new `implType` field alongside impl name + missing variable), `temporal-reducer-error`, `trigger-state-change-overlap` (rendering `variableName` + `eventName` + `factorVariableName`), and `temporal-initial-values-mismatch` (rendering the `missing`, `unknown`, and `typeMismatches` lists — for `typeMismatches`, each entry shows `name`, `expectedType`, and `actualType`) — formatting context fields per the pattern used by `ambient-validation` / `impl-eval-throw`. The error fields are split across two render targets per the existing pattern: `renderError` produces the full message text (which *includes* `ruleSetId` for the construction-time variants — `temporal-validation`, `trigger-state-change-overlap`, `temporal-initial-values-mismatch` — so the rule-set context lands in the rendered error), while `describeErrorContext` produces the terse sidebar context line that highlights the impl/variable specifics. Implementations should not duplicate `ruleSetId` into the context line; it belongs in the message.

### Tests

- **R17** — Existing tests in the ambient-state and modifier surface area fall into three buckets, treated explicitly:

  **Convert** (subject migrates ambient → temporal, behavior coverage preserved):
  - [src/hazbot/wildfire/sim-props.test.ts](src/hazbot/wildfire/sim-props.test.ts) `GraphOpen` cases — switch from `ambientState`/`updates` setup to `temporalHistory`
  - [src/hazbot/rule-sets/25.test.ts](src/hazbot/rule-sets/25.test.ts) integration cases — same
  - [src/hazbot/wildfire/translate.test.ts](src/hazbot/wildfire/translate.test.ts) — ambient pass-through cases become temporal-variable update cases; `ChartTab*` no-op-during-run cases become uniform-no-op cases

  **Delete** (subject removed, no replacement):
  - [src/hazbot/engine/consume.test.ts](src/hazbot/engine/consume.test.ts) — ambient-validation tests (R10); orphan-modifier dispatch tests (R10b)
  - [src/hazbot/engine/engine.test.ts](src/hazbot/engine/engine.test.ts) — `ambientKeysByTrigger` collection test (R10)
  - [src/hazbot/engine/error-rendering.test.ts](src/hazbot/engine/error-rendering.test.ts) — ambient and orphan-modifier error rendering (R10/R10b)
  - [src/log.test.ts](src/log.test.ts) — third-arg `ambientState` routing test (R12)
  - [src/components/log-events.test.tsx](src/components/log-events.test.tsx) — `chartTabOpenAtStart` plumbing (R12)

  **Add** (new behavior, no predecessor): see R18, R18a, R18b, R18c.

  Behavior coverage (the chart-tab semantics, sticky-OR, replayability) is preserved across this redistribution — no semantic test slips through unowned.
- **R18** — New unit tests exercise: temporal-variable construction, reducer invocation on matching events, ignored non-matching events, multiple variables in one rule set, reference-driven validation, and integration with `GraphOpen` / ruleset 25.
- **R18a — Replay determinism (two-engine).** Capture a representative event stream through a live engine (covering both pre-trigger state changes and within-window state changes), then feed the captured `ConsumedEvent` array into a *second* fresh engine constructed from the same rule set. Assert the two engines produce identical `readings[]` (including `temporalHistory` shape and `at` values), identical `matchedCategory` history, identical `observed` maps (R3), and identical `temporalValues` maps. Pinning `temporalValues` catches divergence in live state after the final trigger that would not surface in seeded reading entries — symmetric with R18c's fixture coverage. Catches engine state leaks (singletons, module-level mutable defaults) and confirms `consume()` is a pure function of `(initial state, event)`. **Construction protocol**: both engines are built by calling `new Engine(...)` directly with identical constructor arguments (rule set, factor variables, sim props, translate function, and `initialTemporalValues` if the scenario exercises it). The bridge-side singleton in [src/hazbot/wildfire/engine-singleton.ts](src/hazbot/wildfire/engine-singleton.ts) is bypassed — its `cached`/`init` module state (lines 12-13) would otherwise carry the first engine into the second. The substrate `Engine` class is verified to hold zero module-level mutable state (grep of [engine.ts](src/hazbot/engine/engine.ts) shows no module-scope bindings), so two `new Engine(...)` constructions are fully isolated. If a future refactor introduces module-level state in the substrate, this test will fail — that's the intended canary.
- **R18b** — **`GraphOpen` sticky-OR semantic regression.** [src/hazbot/wildfire/sim-props.test.ts](src/hazbot/wildfire/sim-props.test.ts) exercises all four corners of `GraphOpen` after the temporal-variable conversion:
  - Chart open at `SimulationStarted` (seed `chartTabOpen=true`), no further toggles → `GraphOpen` = true
  - Chart closed at start (seed `false`), `ChartTabShown` fires during the run → `GraphOpen` = true
  - Both: chart open at start AND additional toggles during the run → `GraphOpen` = true
  - Chart never open (seed `false`, no `ChartTabShown` events) → `GraphOpen` = false
- **R18c — Replay regression (fixture baseline).** Check in a fixture pair under [src/hazbot/wildfire/__fixtures__/](src/hazbot/wildfire/__fixtures__/): one `events.json` whose top-level shape is `{ events: ConsumedEvent[]; initialTemporalValues?: Record<string, unknown> }` — the `events` field carries the captured event stream (covering both pre-trigger state changes and within-window state changes); the `initialTemporalValues` field is optional and, when **present**, must be exhaustive per R7's `temporal-initial-values-mismatch` rule (every declared variable's name is a key); when **absent**, the engine uses each variable's declared `initialValue`. The loader pattern is the JSON-idiomatic "field present → pass to constructor; field absent → don't." `{}` is *not* a sentinel for "no override" — it would be interpreted as "exhaustive override over zero variables" and would throw `temporal-initial-values-mismatch` if any variables are declared. Paired with `expected.json` (the resulting `readings[]` + `matchedCategory` history + final `observed` map + final `temporalValues` map). The test loads both files, constructs a fresh engine (passing `events.initialTemporalValues` only when the field is present), runs `events.events` through `consume()`, and asserts strict equality with the expected output across all four pinned dimensions (`readings`, `matchedCategory`, `observed`, `temporalValues`). **This is the headline regression test for the work** — drift in classification semantics or `temporalHistory` shape fires here. The fixture is generated once via a checked-in script at `scripts/generate-replay-fixture.js` (JS, matching the existing [scripts/generate-hazbot-validation-playbook.js](scripts/generate-hazbot-validation-playbook.js) pattern — no TS compile step), invoked via `node scripts/generate-replay-fixture.js`, so it can be regenerated when the spec intentionally changes shape, with the diff reviewed at PR time. CLAUDE.md's "Common commands" table gains an entry pointing to this command alongside the existing playbook-generator entry (in-scope per R20a). **Timestamp normalization**: the capture script replaces real `Date.now()` values in `events.json` with deterministic monotonic integers (e.g. starting at 1000, incremented per event) before writing. The engine copies `at` directly from event to reading, so `expected.json` inherits these normalized values. Regeneration against the same input scenario is idempotent — fixtures only churn when classification semantics, `temporalHistory` shape, or scenario coverage intentionally changes. **Regeneration workflow**: when the test fails because intentional behavior changed (examples: a new category added to ruleset 25, a factor-variable predicate refined, a new declared temporal variable, new scenario coverage), the workflow is (a) re-run the capture script to regenerate both `events.json` and `expected.json`, (b) inspect the diff to confirm only the intended changes appear, (c) commit the regenerated fixture in the same PR. Disabling or skipping the test in lieu of regeneration is an anti-pattern — the diff *is* the review surface for semantic drift. **Scope**: ruleset 25 for this pass — it's the only rule set exercising a novel substrate construct (temporal variables / `GraphOpen`). Future rule sets exercising novel substrate constructs (or significant new category logic worth pinning) should add their own fixture pair under `__fixtures__/`. **Fixture documentation**: a sibling `__fixtures__/README.md` documents (i) the regeneration command (`node scripts/generate-replay-fixture.js`), (ii) what each fixture scenario exercises (e.g. "covers R18b's four sticky-OR corners"), (iii) which kinds of changes trigger regeneration. Keeps JSON fixture files annotation-free while preserving in-file diff readability.
- **R18d — Reducer-throw contract.** A unit test installs a `TemporalVariableImpl` whose `reduce()` deterministically throws on a designated event, drives that event through `consume()`, and asserts: (1) an `EngineError` of variant `temporal-reducer-error` is pushed with the expected `ruleSetId`, `variableName`, `event`, `thrown`, and `at` fields; (2) live `temporalValues[variableName]` retains its pre-event value; (3) no `TemporalVariableChange` is appended to any reading's `temporalHistory`; (4) `observed[variableName]` is unchanged across the event — specifically, if this was the first event for that variable, the bit remains `false`, pinning that the flip happens only in R1's phase 2 commit (not during phase 1's buffered reducer dispatch); (5) when other temporal variables also declare the same event in their `acceptedEvents`, their reducers do *not* run and their `observed` bits do *not* flip (fail-fast per R1); (6) `translate()` does not run and no new reading is created for this event. Pins R1's fail-fast contract; regression here surfaces immediately rather than via downstream replay drift.
- **R18e — Trigger/state-change overlap guard.** Unit test constructs an engine where a temporal variable's `acceptedEvents` overlaps with a factor variable's `logEvents`. Asserts `new Engine(...)` throws an `EngineConstructionError` instance (not a bare `Error`) per R7's construction-time preamble, with `caught.errors` containing the `trigger-state-change-overlap` variant carrying the expected `variableName`, `eventName`, and `factorVariableName` fields, and `caught.ruleSetId` populated. Pins R7's guard and the typed-catch contract.
- **R18f — `initialTemporalValues` exhaustiveness + type-shape guard.** Construction-time unit tests pin R7's `temporal-initial-values-mismatch` variant across three failure-mode arms and a happy path. For each failure-mode arm, the test asserts `new Engine(...)` throws an `EngineConstructionError` instance (not a bare `Error`) per R7's construction-time preamble, inspects `caught.errors[0]` for the recorded variant's fields, and confirms `caught.ruleSetId` is populated: (i) `initialTemporalValues` provided with a *missing* declared variable → variant thrown with that name in the `missing` array, `unknown` and `typeMismatches` empty; (ii) `initialTemporalValues` provided with an *unknown* key not matching any declared variable → variant thrown with the typo'd key in `unknown`, `missing` and `typeMismatches` empty; (iii) `initialTemporalValues: { chartTabOpen: "true" }` (string override for a boolean variable) → variant thrown with `typeMismatches: [{ name: "chartTabOpen", expectedType: "boolean", actualType: "string" }]`, `missing` and `unknown` empty. (iv) `initialTemporalValues: { someNullableVar: {} }` against a declared `initialValue: null` → variant thrown with `typeMismatches: [{ name: "someNullableVar", expectedType: "null", actualType: "object" }]`, `missing` and `unknown` empty. This arm only fires for rule sets that actually declare a `null`-valued temporal variable; current scope (boolean `chartTabOpen`) doesn't, so the test uses a synthetic test impl. A fourth test confirms the happy path: an exhaustive, correctly-typed `initialTemporalValues` constructs without error and the live `temporalValues` map reflects the override values (not the declared defaults). A fifth test confirms `observed` is initialized to `false` for every variable regardless of `initialTemporalValues` (per R3).

### Documentation

- **R19** — Update [src/hazbot/engine/README.md](src/hazbot/engine/README.md) with three sections:
  - **(i) Concept**: a "Temporal Variables" section explaining the construct (declared bridge-side via `TemporalVariableImpl<V>`, fed by logged events through `reduce()`, projected into per-reading `temporalHistory` arrays and a live `temporalValues` map). Briefly note that this construct replaces the legacy ambient-state side channel and the generic modifier mechanism (R10/R10b).
  - **(ii) Worked walkthrough**: lift the worked example from Technical Notes (the 4-event `[A:trigger, ChartTabShown@t1, ChartTabHidden@t2, B:trigger]` trace and resulting `temporalHistory` arrays). Reference R14's `chartTabOpen` declaration as the concrete in-tree implementation.
  - **(iii) "Adding a temporal variable" checklist**: a five-step recipe for the next contributor:
    1. Declare a `TemporalVariableImpl<V>` in the wildfire bridge (parallel to R14's `chartTabOpen`).
    2. Wire it into the `temporalVariables` map passed to `new Engine(...)` (R2).
    3. If consumed by a factor-variable or sim-prop impl, add the name to that impl's `temporalReads` field (R1a).
    4. Add unit tests covering the reducer's response to matching and non-matching events (R18 shape).
    5. If the new variable affects behavior in a fixture-pinned ruleset (today: ruleset 25), regenerate the R18c fixture via `node scripts/generate-replay-fixture.js` and review the diff.
- **R20** — Update [docs/hazbot-update-workflow.md](docs/hazbot-update-workflow.md) only if the per-ruleset workflow changes (likely not, since temporal vars are defined in the wildfire bridge, not generated rule-set modules).
- **R20a** — Add an entry to CLAUDE.md's "Common commands" table for the replay-fixture regeneration command: `node scripts/generate-replay-fixture.js`. Sits alongside the existing playbook-generator entry. One-line table row; preempts the next maintainer re-deriving the invocation from R18c.
- **R21** — The spreadsheet extraction script ([scripts/extract-impl.js](scripts/extract-impl.js) / [scripts/extract-hazbot-sheets.js](scripts/extract-hazbot-sheets.js)) needs no changes — temporal variables are bridge-side TS code, not spreadsheet content. (Confirm during implementation.)

## Technical Notes

### Affected files (current ambient-state + modifier-mechanism surface)

**Engine core (ambient state):**
- [src/hazbot/engine/types.ts:18-23](src/hazbot/engine/types.ts#L18-L23) — `ConsumedEvent.ambientState`
- [src/hazbot/engine/types.ts:52-67](src/hazbot/engine/types.ts#L52-L67) — `ambientStateKeys` on `FactorVariableImpl` and `SimPropImpl`
- [src/hazbot/engine/types.ts:75-78](src/hazbot/engine/types.ts#L75-L78) — `ambient-validation` EngineError variant
- [src/hazbot/engine/engine.ts:38-39](src/hazbot/engine/engine.ts#L38-L39) — `ambientKeysByTrigger` map
- [src/hazbot/engine/engine.ts:187-214](src/hazbot/engine/engine.ts#L187-L214) — `collectFromImpl` aggregating keys
- [src/hazbot/engine/engine.ts:240-264](src/hazbot/engine/engine.ts#L240-L264) — trigger-time ambient validation in `consume()`
- [src/hazbot/engine/engine.ts:303-319](src/hazbot/engine/engine.ts#L303-L319) — `checkAmbientForTrigger`
- [src/hazbot/engine/error-rendering.ts:41-45](src/hazbot/engine/error-rendering.ts#L41-L45) — error message

**Engine core (modifier mechanism — removed in R10b):**
- [src/hazbot/engine/types.ts:9](src/hazbot/engine/types.ts#L9) — `BaseReading.updates: ReadingUpdate[]`
- [src/hazbot/engine/types.ts:12-16](src/hazbot/engine/types.ts#L12-L16) — `ReadingUpdate` interface
- [src/hazbot/engine/types.ts:79-83](src/hazbot/engine/types.ts#L79-L83) — `orphan-modifier` EngineError variant
- [src/hazbot/engine/engine.ts:18](src/hazbot/engine/engine.ts#L18) — `kind: "modifier"` branch in TranslateResult
- [src/hazbot/engine/engine.ts:273-284](src/hazbot/engine/engine.ts#L273-L284) — orphan-modifier detection + `lastReading.updates.push(...)` dispatch
- [src/hazbot/engine/error-rendering.ts](src/hazbot/engine/error-rendering.ts) — orphan-modifier rendering
- [src/hazbot/engine/sidebar/sidebar.tsx:211](src/hazbot/engine/sidebar/sidebar.tsx#L211) — "N update(s)" label

**Wildfire bridge:**
- [src/hazbot/wildfire/types.ts:10](src/hazbot/wildfire/types.ts#L10) — `WildfireReading.ambientState`
- [src/hazbot/wildfire/translate.ts:19,28,44-58](src/hazbot/wildfire/translate.ts) — ambient pass-through, ChartTab no-op
- [src/hazbot/wildfire/sim-props.ts:78-87](src/hazbot/wildfire/sim-props.ts#L78-L87) — `GraphOpen`
- [src/hazbot/wildfire/engine-singleton.ts:30-35](src/hazbot/wildfire/engine-singleton.ts#L30-L35) — comment about ambient capture

**Host integration:**
- [src/log.ts:16,24](src/log.ts#L16) — third arg `ambientState`
- [src/components/bottom-bar.tsx:249-252](src/components/bottom-bar.tsx#L249-L252) — sole call site stamping ambient

**Sidebar:**
- [src/hazbot/engine/sidebar/sidebar.tsx:318-319](src/hazbot/engine/sidebar/sidebar.tsx#L318-L319) — error context for ambient validation

**Tests:**
- [src/hazbot/engine/consume.test.ts](src/hazbot/engine/consume.test.ts) — ~9 ambient-validation tests
- [src/hazbot/engine/engine.test.ts](src/hazbot/engine/engine.test.ts) — `ambientKeysByTrigger` collection test
- [src/hazbot/engine/error-rendering.test.ts](src/hazbot/engine/error-rendering.test.ts) — ambient error rendering
- [src/hazbot/wildfire/sim-props.test.ts](src/hazbot/wildfire/sim-props.test.ts) — `GraphOpen` tests
- [src/hazbot/wildfire/translate.test.ts](src/hazbot/wildfire/translate.test.ts) — ambient pass-through, ChartTab no-op
- [src/hazbot/rule-sets/25.test.ts](src/hazbot/rule-sets/25.test.ts) — integration with ambient
- [src/log.test.ts](src/log.test.ts) — third-arg routing
- [src/components/log-events.test.tsx](src/components/log-events.test.tsx) — host `chartTabOpenAtStart` plumbing

### Engine plumbing constraints

- The engine already runs `translate()` in `consume()`; temporal-variable reducer dispatch fits in `consume()` *before* `translate()` (so the reducer applies before the resulting reading is created — see R4).
- Per-reading `temporalHistory` arrays are written by the engine in two places: (a) at trigger time, seeded from live `temporalValues` (R5a), and (b) on every reducer fire, appended to the current reading's array (R5b). No replay or caching needed — the array IS the history.
- The existing reference-driven walk in [engine.ts:138](src/hazbot/engine/engine.ts#L138) is a model for temporal-variable validation (only referenced impls' `temporalReads` trigger validation errors).
- The legacy modifier mechanism (`BaseReading.updates`, `ReadingUpdate`, `kind: "modifier"`, `orphan-modifier`) is removed in this PR — see R10b. The new `temporalHistory` is structurally similar but typed (entries correspond to declared temporal variables, not generic event modifiers) and validated.
- **Audited: `ambientState` is the only host-stamped event channel.** A grep of `log(` call sites under [src/](src/) confirms [src/components/bottom-bar.tsx:252](src/components/bottom-bar.tsx#L252) is the sole caller passing a third argument; every other call site uses `log(name)` or `log(name, data)`. After R10/R11/R12 land, the captured event payload is fully self-describing — no other side channel exists for the engine to lose visibility into.
- **Audited: removing the third `log()` arg has no external-schema impact.** [src/log.ts:19](src/log.ts#L19) forwards only `(name, data)` to `externalLog` (LARA + log-monitor sidebar). The third `ambientState` arg is only passed to `engine.consume()` ([src/log.ts:24](src/log.ts#L24)), so it has been engine-internal all along. R12's parameter removal touches no downstream consumer.
- **Audited: LARA log payload is replay-compatible with `ConsumedEvent`.** Per the audit above, `externalLog` receives `(name, data)`. After R10 removes `ambientState`, `ConsumedEvent` becomes `{name, data?, at}` — `name` and `data` map 1:1 to the LARA log. The `at` field is set by `log()` itself (`Date.now()` in [src/log.ts:24](src/log.ts#L24)) and not explicitly forwarded to `externalLog`; the LARA wrapper stamps its own timestamps independently, preserving call ordering and per-event arrival closely enough for replay through a fresh `consume()`. Net effect: a captured LARA log (or log-monitor sidebar capture) supplies every field needed to reconstruct a `ConsumedEvent[]` for replay, modulo synthesizing `at` from the wrapper's timestamps. R18c's fixture format normalizes `at` to deterministic integers (per R18c's "Timestamp normalization" clause), so the controlled-fixture replay path is unaffected. The headline replay promise (Project Owner Overview) is structurally supported by the LARA log.
- **Commit greenness invariant.** Each PR-mergeable step (commit or commit cluster intended to merge to main) must leave `npm run lint`, `npm run build`, and `npm test` green. The R10/R10b removals span the substrate types, the engine implementation, the sidebar, the wildfire bridge, and tests — sequencing must avoid red-build intermediate merge states. This is primarily a Phase 2 `implementation.md` concern; recorded here so the implementer doesn't discover it mid-plan.
- **Audited: no `FactorVariableImpl` declares `ambientStateKeys`.** Grep of [src/](src/) shows every `ambientStateKeys:` declaration sits inside a `simProps:` block (production: [sim-props.ts:82](src/hazbot/wildfire/sim-props.ts#L82); tests: synthetic impls in [consume.test.ts](src/hazbot/engine/consume.test.ts) and [engine.test.ts:137](src/hazbot/engine/engine.test.ts#L137)). Removing the field from `FactorVariableImpl` is a no-op outside the engine substrate; R10 removes it from both interfaces for symmetry.
- **Audited: zero cypress impact.** Grep of `ChartTab|chartTab|analysis|hazbot|sidebar|logEvent|ambient` across [cypress/e2e/](cypress/e2e/) (`smoke.cy.ts`, `terrairn-setup.cy.ts`, `url-params.cy.ts`, `workspace.cy.ts`) returns zero matches. No e2e test exercises the chart-tab UI, the analysis engine, the dev sidebar, or any log payload assertion — R10/R10b/R12/R15 have zero cypress impact. Jest covers the entire affected surface.

### Worked example

For a rule set declaring one temporal variable `chartTabOpen: boolean` (initial `false`, sources `["ChartTabShown", "ChartTabHidden"]`), consuming this event stream:

```
[A:trigger, ChartTabShown@t1, ChartTabHidden@t2, B:trigger]
```

produces these readings:

```
readings[0]  // created at A
  at: A.at
  temporalHistory: [
    {at: A.at, name: "chartTabOpen", value: false, eventName: "A"},              // R5a seed (live value at trigger time)
    {at: t1,   name: "chartTabOpen", value: true,  eventName: "ChartTabShown"},  // R5b append (ChartTabShown reducer)
    {at: t2,   name: "chartTabOpen", value: false, eventName: "ChartTabHidden"}, // R5b append (ChartTabHidden reducer)
  ]

readings[1]  // created at B
  at: B.at
  temporalHistory: [
    {at: B.at, name: "chartTabOpen", value: false, eventName: "B"},              // R5a seed (live value at B)
  ]
```

- `currentTemporal<boolean>(readings[0], "chartTabOpen") → false` — final value in the window.
- `readings[0].temporalHistory.some(c => c.name === "chartTabOpen" && c.value === true) → true` — sticky-OR: chart was shown at some point during the window.

### DSL impact

The DSL (factor variables lowercase, sim-props uppercase, `WITH`) is unchanged by R9. Temporal variables are TypeScript-side constructs read inside impls; they don't get their own DSL leaf. If a future ruleset needs to reference a temporal variable directly in the expression language, that's a separate spec.

### Complexity

- **Per event**: O(N) where N = declared temporal variables, for the `acceptedEvents` scan + reducer dispatch.
- **Per reading**: O(N) seed entries at trigger time + O(K) appends where K = state-change events during the window.
- **Per session**: O(T × N + E) where T = triggers, E = total state-change events.

For the current scope (one temporal variable, < 100 events per session), these bounds are trivially small. The construct stays linear in the number of declared variables and total events; no quadratic walks. Tuning is deferred (see Out of Scope) until a concrete case warrants it.

## Out of Scope

- **Direct DSL access to temporal variables.** Expressions in rule sets continue to reference factor variables and sim-props only (R9). Adding a new leaf type would change the grammar, the parser, the validator, and `dsl-grammar.md`; not justified by current need.
- **Temporal variables defined in the auto-generated rule-set modules.** Temporal variables live in the wildfire bridge (TS) for now. If the spreadsheet ever encodes them, the extraction script will need updates — out of scope here.
- **Multi-domain temporal variables (across the engine substrate).** The construct is generic in `<V>` and lives at the engine layer, but the wildfire bridge is the only consumer. No other host integrations exist.
- **Replay loader tooling.** R2's `initialTemporalValues` constructor arg structurally supports replay of logs captured under a non-default initial chart state — the engine accepts an override map at construction. What's deferred is the *loader* that extracts a captured session's initial state from raw log data and produces an `initialTemporalValues` map. Today no production loader exists; the R18c fixture format uses hand-curated initial values. A follow-up spec adds the loader when a concrete replay-tooling workflow materializes (e.g. LARA log → `ConsumedEvent[]` + `initialTemporalValues` extraction).
- **Ship-readiness work.** This spec assumes the dev-only-today precondition (Background → Preconditions). When the engine ships, several deferred items need their own spec: (i) captured-log migration for any production logs predating this PR, (ii) external error surfaces for `temporal-validation` and `temporal-reducer-error` (today sidebar-only), (iii) broader R18c fixture coverage across rulesets, (iv) re-evaluation of the bridge-side singleton bypass in R18a's two-engine construction protocol. None of these block the current PR; all become real when the precondition flips.
- **Persisting temporal state across page reloads.** Each engine instance starts fresh from `initialValue`s. Session restoration is not a current requirement.
- **Performance tuning** of temporal-value snapshots beyond what's needed for correctness. If quadratic replay becomes a problem, optimize then.
- **Behavior for events that are both a state-change *and* a trigger.** No such event exists today (`ChartTabShown`/`ChartTabHidden` are not triggers; `SimulationStarted` is not in any temporal variable's `acceptedEvents`). The engine rejects such declarations at construction time via the `trigger-state-change-overlap` variant (R7) — the interaction between R4 (reducer-before-trigger), R5a (seed new reading), and R5b (append to previous reading) would produce two `TemporalVariableChange` entries at the same `at`, semantically defensible but not pinned. When a concrete use case arises to pin the semantics, that spec drops the construction-time guard and specifies the desired interaction between R4/R5a/R5b.

## Open Questions

### RESOLVED: When do temporal-variable updates apply relative to trigger evaluation?
**Context**: If the consumed event is itself a state-change event (e.g. `ChartTabShown`), and the engine also treats it as a trigger or modifier, the timing matters. Two cases:
  - The event is a pure state-change (no trigger reading, no modifier): update before/after doesn't matter — no evaluation runs.
  - The event is both a state-change *and* a trigger (theoretical — none today): does the trigger reading see the pre-update or post-update value?

**Options considered**:
- A) Always update temporal variables first, then run trigger evaluation. Triggers see the post-update value of any concurrent state change.
- B) Always run trigger evaluation first (against pre-update values), then update.
- C) Disallow events from being both a state-change and a trigger. Enforced by validation at engine construction.

**Decision**: A. The reading needs the post-update value to be useful — that's the entire point of snapshotting temporal values onto the reading at trigger time. Reflected in R4.

---

### RESOLVED: When and how does `temporal-validation` fire?
**Context**: Today's `ambient-validation` fires at trigger time when a referenced impl's required ambient key is missing from the event payload. Temporal variables don't have a direct analog — they always have a value (at least the `initialValue`). The genuine error modes are:
  - **Reference to undeclared variable**: impl reads `temporal.foo` but no rule set declares `foo`. Caught at engine construction (no runtime trigger).
  - **Declared but unobserved**: impl reads `temporal.foo`, and `foo` is declared, but no `eventSource` event has ever occurred. The value is `initialValue` — this may be exactly what the rule wants (default chart-tab state = closed) or a silent bug.
  - **Stale projection**: not really an error — the projection is always current as of the witness `at`.

**Options considered**:
- A) Only validate "undeclared reference" at construction time. Trust the `initialValue` for unobserved cases — no runtime error.
- B) Validate both at construction (undeclared) and at evaluation (declared-but-unobserved, surfaced as a warning, not an error).
- C) Both as errors. Rule sets must explicitly mark a temporal variable as "may be unobserved" to suppress the error.

**Decision**: A. Undeclared references are real programming errors and caught at engine boot. "Declared but unobserved" is a legitimate state (`chartTabOpen: false` for a student who never opened the chart) and shouldn't generate diagnostic noise. Reflected in R7/R8 and the new R1a impl declaration field.

---

### RESOLVED: First-pass DSL exposure?
**Context**: R9 leaves DSL access to temporal variables out of scope. Confirming this is the right call. Current single use (`GraphOpen`) needs only impl-level access. But if rule-set authors will frequently want "test whether the chart is currently open" directly in a category expression, having to wrap it in a sim-prop forever may be friction.

**Options considered**:
- A) No DSL access in this PR. Sim-props wrap any temporal-variable read. (Current plan.)
- B) Add a `@temporal.varName` leaf to the DSL in this PR. Parser, validator, evaluator, grammar doc all updated.
- C) Reserve syntactic space (e.g. document `@<name>` as future syntax) without implementing.

**Decision**: A. Keeps the DSL disciplined (factor variables = monotonic predicates; temporal vars = toggleable state, kept behind sim-props). Wrapping a temporal read in a sim-prop is a one-liner. The spreadsheet-driven extraction pipeline makes reserved-but-unimplemented syntax fragile, ruling out C. Reflected in R9.

---

### RESOLVED: After temporal-variable conversion, do `ChartTabShown`/`ChartTabHidden` still emit ReadingUpdate modifiers during runs?
**Context**: Today, [translate.ts:56-57](src/hazbot/wildfire/translate.ts#L56-L57) emits these as modifiers during runs so the current reading's `updates` array reflects the toggle. `GraphOpen` reads both `ambientState` AND `updates`. Once `GraphOpen` reads `chartTabOpen` instead, the modifier role is subsumed. But the `updates` array also surfaces in the sidebar Readings panel for debugging.

**Options considered**:
- A) Stop emitting modifiers for these events; they're pure state-change events. `updates` no longer reflects chart toggles. Simpler.
- B) Continue emitting modifiers for debugging visibility (sidebar Readings panel shows them). Redundant with temporal-variable history.
- C) Emit them, but include a flag like `kind: "state-change"` to mark that they don't affect evaluation, only debugging visibility.

**Decision**: A, *and* the entire modifier mechanism is removed in this PR (not just chart-tab modifier emission). Verified: chart-tab events are the only modifier emission site, and `GraphOpen` is the only modifier consumer — both go away. The modifier surface (`BaseReading.updates`, `ReadingUpdate`, `kind: "modifier"`, the engine dispatch, the `orphan-modifier` error variant, sidebar's "N update(s)" label) becomes dead weight. Temporal variables subsume the generic "value tied to a reading" use case. Reflected in new R10b.

---

### RESOLVED: Sidebar — show temporal variables as "current" only, or also "per-reading" history?
**Context**: The sidebar's value to validation walks comes from seeing what the engine sees. For factor variables, the panel shows "current value." For temporal variables, "current" is the simplest. But "what was `chartTabOpen` at reading 3" might be useful when validating a category that depends on chart state at a past trigger.

**Options considered**:
- A) Show current values only. One panel. Simplest.
- B) Show current values in a panel; additionally, expand each reading row in the Readings panel to include a snapshot of temporal-variable values at that reading.
- C) Defer the "per-reading" view until someone asks for it during validation walks.

**Decision**: B, made trivial by the `temporalHistory` array design (R5). Each reading is self-contained — its trail of temporal changes (with timestamps) is directly displayable. The current-values panel uses the live `temporalValues` map (R6). Reflected in R16.

---

### RESOLVED: Will any rule set beyond 25 need this construct in the near term?
**Context**: Scoping the work. If only rule set 25 (`GraphOpen`) needs temporal variables, the construct can stay narrow. If rule sets 26–35 will introduce more "what was X when Y" cases, the design should anticipate them.

**Options considered**:
- A) Design for the single current use. Extend later when concrete needs arise.
- B) Audit the unimplemented rule sets ([src/hazbot/rule-sets/](src/hazbot/rule-sets/) tabs 26–47) for similar patterns before designing.
- C) Defer the audit until after this lands; revisit if a second use case is awkward.

**Decision**: A. Design for the single current use (`GraphOpen` / `chartTabOpen`). The reducer-based `TemporalVariableImpl<V>` is already generic in value type, so extension to future cases doesn't require redesign — just adding more declared temporal variables.

## Self-Review

### Senior Engineer

#### RESOLVED: R5 — `TemporalVariableChange.at` semantics undefined for seed vs. append entries
**Decision**: R5 amended to state that every `TemporalVariableChange.at` equals the consuming event's `at` (seed = trigger event = reading.at; append = state-change event). Makes the trail readable as a timeline.
`TemporalVariableChange = { at: number; name: string; value: unknown }` is declared, but `at` is never tied to a source. For the trigger-time **seed** entries (one per declared temporal variable), is `at` the trigger event's `at`? For **append** entries (a reducer firing between triggers), is `at` the state-change event's `at`? Without specifying, the implementer will pick one and the sidebar/debug consumers may render inconsistent timelines. Suggest: state explicitly that both use the *consuming event's* `at`, so a seed entry's `at === reading.at` and an append entry's `at` matches the state-change event that produced it.

---

#### RESOLVED: R5 — state-change events before any reading exists
**Decision**: R5 amended — when no reading exists yet, the live `temporalValues` still updates but the append is a no-op (nothing to attach to). The next trigger's seed captures the post-update value. This is the common wildfire case of opening the chart tab before Start.
R5 says "Between triggers, when a temporal reducer produces a new value, the engine appends a `TemporalVariableChange` to the *current* (most recent) reading's `temporalHistory`." If a state-change event arrives **before** any trigger has fired (no `readings[]` yet), there is no "most recent reading." Implicitly: the live `temporalValues` map still updates (per R3), and the append is silently dropped because there's no reading to attach to. The next trigger reading will seed the now-updated value. This is the right behavior, but it's load-bearing for replay correctness and not stated. Suggest: explicit clause in R5 — "If no reading exists, the live projection still updates; the next trigger's seed captures the post-update value."

---

#### RESOLVED: R5 — does a same-value reducer output produce an append entry?
**Decision**: Always append on any matching event. The `temporalHistory` trail is a complete debug timeline; sticky-OR and "current value" consumers work identically either way; skip-on-equal would force `Object.is` semantics over unknown `V`.
"When a temporal reducer produces a new value, the engine appends…" — "new" implies same-value reducer outputs (e.g. `ChartTabShown` fired while `chartTabOpen` is already `true`) skip the append. That's the natural reading but it has implications: a debug timeline that scans `temporalHistory` for "every chart-show event" would lose duplicates. Alternative: always append on any matching event, and reduce on read. Suggest: explicitly choose one rule (recommend: append only on `!Object.is(prev, next)`) and state the rationale, since both impl and tests depend on it.

---

#### RESOLVED: R3/R4 — order of application when one event matches multiple temporal variables' `acceptedEvents`
**Decision**: R3 amended — reducers invoked in declaration order of the rule-set map. No current use case, but fixes the order before a future use case introduces silent behavioral coupling.
If a future event drives two temporal variables (not the case today, but the type already supports it), R3 doesn't fix the order. For a pure functional reducer over independent state, declaration order in the rule-set map is the obvious choice and the spec should say so — otherwise the implementer will pick `Object.entries` iteration order and call it done, which is brittle if future temporal variables have interdependencies (which Q3's "no DSL access" punt makes unlikely but not impossible).

---

#### RESOLVED: R10b — justification buried in resolved Q4
**Decision**: Background gains a third paragraph framing modifier-mechanism removal as a consequence of temporal variables subsuming the use case. Readers hitting R10b now see the rationale upfront.
The Background mentions "two concerns" (replay loss, host coupling) — both motivate R1–R9. But R10b removes the *entire* legacy modifier mechanism (`ReadingUpdate`, `kind: "modifier"`, `orphan-modifier` error variant, sidebar "N update(s)"), which is a large secondary refactor with no standalone justification in the Background. A reader hitting R10b first will think it's overreach. The actual justification ("chart-tab events are the only modifier emission site, `GraphOpen` is the only modifier consumer, both go away") lives in resolved Q4. Suggest: lift one sentence from Q4 into the Background as a third bullet, framing the modifier-removal as a *consequence* of temporal variables subsuming the mechanism — not a separate cleanup.

---

### QA Engineer

#### RESOLVED: R18 — missing "captured log replay produces same classifications" test
**Decision**: Added R18a — explicit log-replay regression test. Captures a live event stream, replays into a fresh engine, asserts identical readings and matched-category history. Proves the spec's headline promise.
The Project Owner Overview frames the whole work as: "an analyst can't replay a captured log file and get the same classifications." This is the headline promise. R18 enumerates unit tests for the construct, but does not call out a regression test demonstrating the promise — "feed a captured event stream of length N into a fresh engine; assert the resulting category classifications match a recorded baseline." This test is the difference between "the construct works" and "the construct delivers what the spec sells." Suggest: add to R18 explicitly.

---

#### RESOLVED: R18 — missing sticky-OR semantic coverage
**Decision**: Added R18b — explicit enumeration of `GraphOpen`'s four sticky-OR cases (seed-only true, append-only true, both, neither). Catches regressions in any single case.
R13 collapses `GraphOpen`'s pre-refactor "ambient OR modifier" logic into a single `temporalHistory.some(...)` check. R18 lists "integration with `GraphOpen` / ruleset 25" but doesn't enumerate the four semantic cases that must each be exercised:
- chart open at `SimulationStarted` (seed = `true`), never toggled — pass
- chart closed at start (seed = `false`), opened during run (append `true`) — pass
- both (seed = `true`, append also occurs) — pass
- chart never open (seed = `false`, no appends) — fail

Without these, a regression that breaks (e.g.) the seed-only case is invisible.

---

#### RESOLVED: R17 — be explicit about tests **deleted** vs. converted
**Decision**: R17 rewritten with three explicit buckets — Convert (subject migrates), Delete (subject removed), Add (new behavior). Each existing test file is assigned to a bucket. Prevents over-preservation of stale orphan-modifier and ambient-validation tests.
R17 says "all tests in the ambient-state surface area … are converted to test the temporal-variable construct. No test is silently lost; behavior coverage is preserved." But R10b also removes the orphan-modifier path and the third `ambientState` argument to `log()`. Some tests in [consume.test.ts](src/hazbot/engine/consume.test.ts) (orphan-modifier dispatch), [engine.test.ts](src/hazbot/engine/engine.test.ts) (`ambientKeysByTrigger` collection), and [log.test.ts](src/log.test.ts) (third-arg routing) test behaviors that are **going away**, not being preserved. The spec should distinguish: (a) tests whose *subject* moves from ambient → temporal (convert), (b) tests whose *subject* is removed (delete), and (c) new tests that have no predecessor (add). Otherwise the implementer may over-preserve, leaving stale tests that no longer reflect engine behavior.

---

### Performance Engineer

#### RESOLVED: Briefly state expected complexity bounds in Technical Notes
**Decision**: Added a "Complexity" subsection to Technical Notes — per-event, per-reading, per-session bounds. Linear in declared variables and total events; no quadratic walks.
Out-of-Scope already defers performance tuning, which is fine. But for an implementer evaluating "is this approach acceptable at all," a one-paragraph note in Technical Notes would help:
- Per event: O(declared temporal variables) reducer scan
- Per reading: O(declared temporal variables) seed entries + O(state-changes during window) appends
- Per session: O(triggers × declared + total state-changes)

For the current scope (one temporal variable, < 100 events per session), this is trivial. Stating it explicitly prevents the spec from being challenged later as "what about 50 temporal variables and an 8-hour session?" — which is genuinely fine (still bounded linear), but only obvious after working it out.

---

### API / Contract Reviewer

#### RESOLVED: R5 — split into discrete sub-requirements
**Decision**: R5 split into R5 (shape), R5a (seed), R5b (append), R5c (timestamp), R5d (helpers). The old R5a (helpers) is renamed to R5d. Easier to reference precisely in review and test naming.
R5 currently bundles three semantically distinct behaviors into one paragraph:
1. The shape (`TemporalVariableChange = { at, name, value }` array on each reading).
2. Trigger-time **seeding** (every reading is self-contained).
3. Between-trigger **appending** (state-change events grow the most-recent reading's array).

These have independent invariants, independent tests, and independent edge cases (covered above). Splitting them into R5a (shape), R5b (seed), R5c (append) — and renumbering the current R5a to R5d (helpers) — makes the spec easier to reference precisely in code review and test naming. Current R5 reads like one rule but is actually three.

---

#### RESOLVED: R5d — specify where the `currentTemporal` helper lives
**Decision**: R5d states the helper is a standalone exported function from the engine substrate, alongside the existing `findLast`. Stateless, easily unit-testable.
"A helper (e.g. `currentTemporal(reading, name)`) returns the last `TemporalVariableChange.value` for a given name." Is this:
- An exported function from the engine substrate (e.g. `src/hazbot/engine/temporal.ts`)?
- A method on `Engine`?
- Inlined in the wildfire bridge?

Each has different import surface and test ergonomics. The substrate is the natural home (it's a function over the substrate's `TemporalVariableChange` type), but the spec leaves it open. Suggest: state "exported helper from the engine substrate."

---

#### RESOLVED: R1a — call out the "no compile-time read-check" tradeoff explicitly
**Decision**: R1a gains an explicit tradeoff paragraph. Stale `temporalReads` entries are silent dead code; omitted entries work today but lose the construction-time safety net if the rule set later drops a variable. Matches `requiredDefaults`.
R1a says `temporalReads?: string[]` is "Parallel in spirit to `requiredDefaults`" and validated at construction. But `requiredDefaults` has the same property that's worth surfacing: nothing checks that the impl's `compute`/`evaluate` body actually *reads* the names it declares. The impl author must keep the declaration in sync manually; a stale `temporalReads` entry is silent dead code, and an omitted entry that the impl actually reads is silent runtime-only logic (no construction-time error). This is a known tradeoff and the right call (matches `requiredDefaults`), but flagging it in R1a or Technical Notes prevents a code reviewer later asking "why isn't this enforced?"

---

### Spec Editor / Tech Writer

#### RESOLVED: "Append-only" terminology conflicts with the distinct seed step
**Decision**: R5 reworded — "append-only" → "grow-only" and a half-sentence added pointing to R5a (seed) and R5b (append). The umbrella sentence no longer suggests a single growth mode.
R5 calls `temporalHistory` an "append-only" array, but the lifecycle has two phases: a one-shot **seed** at trigger time (R5a, multiple entries written in one go) and subsequent **appends** (R5b). "Append-only" usually implies a single growth mode. A reader internalizing the phrase may not register that the array starts with N pre-populated entries before any appends fire. Suggest: replace "append-only" in R5 with "grow-only" or "monotonically-growing" — or describe it as "seeded at trigger time, appended to between triggers" (already done in R5a/R5b prose, but the umbrella R5 still says "append-only").

---

### TypeScript / Type-System Reviewer

#### RESOLVED: Return type of `currentTemporal` helper is unspecified
**Decision**: R5d signature pinned to `currentTemporal<V>(reading, name): V | undefined`. Caller asserts `V` matches the declared variable's value type — helper does not validate at runtime. Conventional TS shape for typed reads from heterogeneous stores; pushes narrowing to the call site, where the impl author has the type knowledge.
R5d describes a `currentTemporal(reading, name)` helper but doesn't pin its signature. Since `TemporalVariableChange.value` is `unknown` (R5), the helper can return either:
- `(reading, name) → unknown | undefined` — caller narrows
- `<V>(reading, name): V | undefined` — caller specifies expected type at the call site

For `GraphOpen` this barely matters (`=== true` works on `unknown`). But the choice affects the import surface and how impls written in future rule sets read non-boolean temporals. Suggest: pick one and state it. Recommendation: `<V>(reading, name): V | undefined` with a note that the caller is asserting the type matches the declared variable's `V`.

---

#### RESOLVED: `acceptedEvents: string[]` has no compile-time check against real event names
**Decision**: R1 gains a "Known tradeoff" paragraph naming the hazard explicitly. Accepted for this pass: cost of typed event-name union is an architectural inversion (substrate→bridge), and runtime warnings are too late/dev-only. The hazard is now visible in R1 alongside R1a's softer tradeoff.
A temporal variable's `acceptedEvents` is a raw `string[]`. A typo like `"ChartTabShon"` will compile, the variable will silently never update, and the bug surfaces only via failed integration tests (or a missed classification in the wild). The engine has no event-name registry to constrain this. This is the same shape as `requiredDefaults` having no relationship to actually-read keys (R1a tradeoff) — but worse here, because the cost of `acceptedEvents` being wrong is a silent functional bug, not just dead declaration. Options:
- A) Accept the looseness; document the risk in Technical Notes alongside the R1a tradeoff.
- B) Introduce a typed event-name union in the wildfire bridge that `acceptedEvents` must be a subset of. Costlier but eliminates the class.
- C) Soft runtime warning at first `consume()` if an `acceptedEvents` entry doesn't match any translated event seen so far.

Likely (A) for this pass — but the spec should at least surface it.

---

### Future Maintainer

#### RESOLVED: No worked example of the seed/append lifecycle
**Decision**: Added a "Worked example" subsection to Technical Notes (between "Engine plumbing constraints" and "DSL impact") with a 4-event trace, the resulting `readings[0..1].temporalHistory` arrays, and `currentTemporal` / sticky-OR read examples. Concretizes R3+R4+R5a+R5b+R5c in one block.
The mental model — "seed at trigger, append between triggers, every reading is self-contained" — is the novel content of this spec, distributed across R3, R4, R5a, R5b, R5c. A reader assembling that picture from prose alone is doing more work than necessary. A 5-line worked example in Technical Notes would lock the model in for any future maintainer in 30 seconds. E.g.:

```
Events: [TriggerA, ChartTabShown, ChartTabHidden, TriggerB]
readings[0].temporalHistory (seeded at TriggerA, appended during window):
  [{at: A.at, name: "chartTabOpen", value: false},   // seed
   {at: shown.at, name: "chartTabOpen", value: true}, // append
   {at: hidden.at, name: "chartTabOpen", value: false}] // append
readings[1].temporalHistory (seeded at TriggerB):
  [{at: B.at, name: "chartTabOpen", value: false}]
```

Suggest: add a "Worked example" block under Technical Notes.

---

#### RESOLVED: Load-bearing rationale lives only in the Self-Review section
**Decision**: No spec change. Re-reading the R-notes shows the chosen-rationale is already adequately preserved as parentheticals (R3's "fixes the order to prevent future churn", R5b's "complete trail of state-change events", R5c's "directly readable as a timeline", R5d's "alongside the existing `findLast`"). The Self-Review section's distinct value is the *considered-and-rejected* alternatives, which the R-notes don't carry. Action: retain the Self-Review section as a decision log at Phase 5 finalization (Phase 5 explicitly offers this option — default to keep, not strip).
Several real semantic choices — reducers ordered by rule-set-map declaration order (R3), append-on-every-event vs. skip-on-equal (R5b), seed/append timestamp source (R5c), `currentTemporal` location (R5d) — were decided in the first-pass review and now show up as terse one-line clauses in the R-numbers. The *reasoning* for each (e.g. "skip-on-equal would force `Object.is` over unknown V") lives only in the resolved review notes. Phase 5 of `/cc-create-spec` offers to strip the Self-Review section at finalization; if accepted, that rationale vanishes. Suggest: either retain the Self-Review section as a decision log, or fold the load-bearing reasoning into the R-notes themselves as inline "(rationale: ...)" suffixes.

---

### Replay / Determinism Engineer

#### RESOLVED: Reducer purity contract is implicit
**Decision**: Added an explicit purity clause to R1: "`update` must be a pure function of `(currentValue, event)` — no reads of `Date.now()`, `Math.random()`, or any mutable external state. Impurity breaks replay determinism (R18a) silently; the engine has no way to detect it." Placed in R1 so reducer authors see it first, immediately under the type signature.
The replay promise (Project Owner Overview + R18a) assumes `reduce(currentValue, event)` is a pure function: same inputs → same output, no external state read. The spec never states this. A reducer that reads `Date.now()`, `Math.random()`, or any mutable module-level state breaks replay silently — and the engine has no way to detect it. Fix is one sentence in R1: "Reducers must be pure functions of `(currentValue, event)`; impurity breaks replay determinism." This is the foundational invariant for the entire replay story; leaving it implicit is a real hazard.

---

#### RESOLVED: R18a as written may not actually be a regression test
**Decision**: Split into two requirements. R18a is now framed as "Replay determinism (two-engine)" — still useful for catching engine state leaks but described accurately as a determinism check, not a regression test. New R18c adds the real regression test: a checked-in fixture pair (`events.json` + `expected.json`) under `src/hazbot/wildfire/__fixtures__/`, generated once by a checked-in script and reviewed at PR time when the spec intentionally changes shape. R18c is now the headline regression test.
"Capture a representative event stream through a live engine, then feed the captured `ConsumedEvent` array into a fresh engine. Assert the two engines produce identical readings[]." But if both engines run the same code on the same input, they trivially produce identical results — this is a soundness check for engine determinism, not a regression test against an expected baseline. A genuine regression test pins to a *recorded baseline* (a fixture file checked into the repo containing the expected `readings[]`). If the engine's behavior drifts in the future, that catches it; the "live capture and replay both at test time" approach catches no drift because both sides use whatever the engine does today. Suggest: clarify whether R18a's baseline is:
- A) Freshly captured each test run (a determinism check — useful, but not what the prose implies)
- B) A checked-in fixture (the real regression test — requires a one-time capture step the spec should describe)
- C) Both — a quick determinism check at the top of the suite, plus a fixture-pinned regression test for the headline promise.

---

#### RESOLVED: No audit that `ambientState` is the only host-stamped channel
**Decision**: Audit performed during this review — grep of `log(` call sites under [src/](src/) confirms [bottom-bar.tsx:252](src/components/bottom-bar.tsx#L252) is the only caller passing a third argument. Every other call site is `log(name)` or `log(name, data)`. Audit result recorded as a bullet under Technical Notes → "Engine plumbing constraints" so future readers don't have to re-derive it.
The spec removes `ConsumedEvent.ambientState` (R10) and `log()`'s third parameter (R12). The implicit claim — that after removal, the log is fully self-describing — depends on `ambientState` being the *only* host-stamped event channel. Technical Notes doesn't surface a verification of this. A grep of `log(` and `record(` call sites would confirm or refute. Worth stating explicitly: "Verified during exploration: `ambientState` is the only host-stamped event field; all other event data is derived from simulation state at emission time, which the captured event payload preserves."

---

## Self-Review — Round 2

A second pass with fresh roles to surface what the first pass missed. Each item is OPEN pending user assessment.

### Refactor Risk Auditor

#### RESOLVED: `log.ts` downstream-consumer audit is missing
**Decision**: Audit performed — [src/log.ts:19](src/log.ts#L19) forwards only `(name, data)` to `externalLog`; the third `ambientState` arg is only routed to `engine.consume()`. R12's removal has no external-schema impact. Recorded as a new bullet under Technical Notes → "Engine plumbing constraints."
R12 removes the third `ambientState` parameter from [src/log.ts:16](src/log.ts#L16). The Round 1 audit confirmed only one *caller* passes a third arg, but didn't confirm what `log()` itself *does* with its arguments. If `log()` writes to an external store (analytics service, IndexedDB, server endpoint, replay capture), removing the third arg silently changes the schema seen by downstream consumers — a different failure mode from a callsite breakage. Suggest a one-line audit result in Technical Notes: "`log()` destinations confirmed to be log-internal; no external telemetry schema depends on the third-arg payload."

---

#### RESOLVED: `FactorVariableImpl.ambientStateKeys` consumer audit
**Decision**: Audit performed — grep of [src/](src/) confirms every `ambientStateKeys:` declaration sits inside a `simProps:` block (production: [sim-props.ts:82](src/hazbot/wildfire/sim-props.ts#L82); tests: synthetic impls in `consume.test.ts` and `engine.test.ts`). Zero FactorVariableImpl consumers. Recorded as a new bullet under Technical Notes → "Engine plumbing constraints."
R10 removes `ambientStateKeys` from *both* `FactorVariableImpl` and `SimPropImpl`. The spec confirms `GraphOpen` (a `SimPropImpl`) is the sole consumer in the wildfire bridge but doesn't state that *no `FactorVariableImpl`* anywhere declares `ambientStateKeys`. If one does (in any current or in-flight rule-set file), the removal compiles cleanly via type-error fixes but the impl silently loses its bookkeeping. Suggest a one-sentence audit result: "Grep of `ambientStateKeys:` declarations under [src/](src/) confirms no `FactorVariableImpl` consumer exists; `GraphOpen` is the only declarant."

---

### Education Researcher

#### RESOLVED: `chartTabOpen` initialValue assumes chart is closed at session start
**Decision**: Compile-time enforcement via a shared constant. New file [src/components/right-panel-constants.ts](src/components/right-panel-constants.ts) exports `CHART_TAB_INITIAL_OPEN = false`. Both [right-panel.tsx:11](src/components/right-panel.tsx#L11)'s `useState` and R14's `initialValue` import from it. Stronger than a prose invariant — the UI default and the temporal projection cannot drift. R14 amended.
R14 sets `initialValue: false` for `chartTabOpen`. If the chart tab is ever visible at session start (URL-param defaults, future preset additions, a saved-session re-entry feature), the engine projects `chartTabOpen=false` until the first toggle event fires. The pre-refactor `chartTabOpenAtStart` was stamped from live state at `SimulationStarted` and would correctly observe "open." After the refactor, that classification would silently flip — `GraphOpen` returns `false` even though the chart was visible the entire run. Either (a) require the host to emit a `ChartTabShown` event on initial mount if the chart is visible at boot, or (b) state explicitly under Out of Scope or Background that "chart is always closed on initial mount" is a load-bearing prerequisite invariant.

---

#### RESOLVED: "Fresh engine" semantics for R18a determinism test
**Decision**: R18a amended with explicit construction protocol — both engines built by `new Engine(...)` directly, bypassing the bridge-side singleton ([engine-singleton.ts:12-13](src/hazbot/wildfire/engine-singleton.ts#L12-L13)). Substrate `Engine` class verified to hold zero module-level mutable state. The test's value as a state-leak canary is preserved by this construction rule.
R18a says "feed the captured `ConsumedEvent` array into a *second* fresh engine constructed from the same rule set" but doesn't define "fresh." If the engine module has any module-level state (memoized rule-set parse, a counter, an event-name registry cache), the second engine inherits it and the test can't distinguish "stateless determinism" from "shared-state determinism." This matters because the test's value rides on its ability to surface engine state leaks — exactly the kind of bug R18a was specified to catch. Suggest: "Construct via the public engine factory entry point; no manual state clearing or test-only resets. If a test-time module-reset shim is required to clear globals between constructions, the construct is leaking and the test should fail." Folds the determinism contract into the test definition.

---

### Test Fixture Curator

#### RESOLVED: R18c fixture timestamp stability
**Decision**: R18c amended with a "Timestamp normalization" clause — the capture script substitutes real `Date.now()` values with deterministic monotonic integers before writing `events.json`. Fixtures churn only when semantics change.
R18c asserts "strict equality with the expected output." `readings[]` includes `at` timestamps that originate in the captured `ConsumedEvent[]`. If the capture script runs against a live session, those `at` values are real `Date.now()` numbers — every regeneration produces a different `events.json` whose `at` values cascade into different `expected.json` `at` values, even though semantics are unchanged. The fixture pair becomes a permanent merge-conflict surface. Suggest: "The capture script normalizes `at` values to deterministic synthetic timestamps (e.g. monotonic integers starting at 1000) before writing `events.json`. Regeneration is idempotent given a fixed input scenario."

---

#### RESOLVED: R18c regeneration workflow not pinned down
**Decision**: R18c amended with an explicit "Regeneration workflow" clause naming the triggers (new category, refined predicate, new temporal variable, new scenario), the three-step process (regenerate → review diff → commit in same PR), and the anti-pattern to avoid (disabling the test). Makes "regenerate, don't disable" the obvious path for the next maintainer.
R18c states the fixture is "generated once via a checked-in script ... so it can be regenerated when the spec intentionally changes shape, with the diff reviewed at PR time" — but doesn't pin the *triggers* for regeneration. Cases where the test will start failing and the fix is regeneration (not engine debugging):
- A new category is added to ruleset 25 → `matchedCategory` array drifts
- A factor variable's predicate is refined → reading boundaries shift
- A new declared temporal variable is added → `temporalHistory` seed arrays gain an entry

Without a pinned workflow, the next maintainer is tempted to skip regeneration and silently disable the test. Suggest documenting the regeneration trigger list (or a heuristic) plus the command (e.g. `npm run regenerate-replay-fixture`) under R18c or in the testing section of the engine README (R19).

---

### Migration Engineer

#### RESOLVED: PR splitting — introduction vs. removal
**Decision**: Single PR is the right call. Background gains a fourth paragraph framing the choice: a split-PR plan would temporarily ship the two-coexisting-mechanisms state that is itself the architectural problem this work solves. The blast radius is acceptable because the analysis engine isn't in production — no captured-log migration concern.
This PR does two things in one commit-history: (1) add temporal-variable construct + migrate `GraphOpen`, (2) remove ambient state + the entire modifier mechanism (R10b). They're logically separable: PR1 could land with both mechanisms coexisting (new temporal vars seeded, `GraphOpen` reads the new path, old `ambientState`/modifier still in place but unused), PR2 then removes the dead code once the new path is verified in dev. The spec's single-PR shape is fine for atomicity but enlarges the blast radius for rollback. Worth one sentence in Background acknowledging the choice ("kept as a single PR because two coexisting state-tracking mechanisms is the architectural problem this work solves; landing them separately would prolong the state we're trying to retire") to preempt the "should this be two PRs?" review question.

---

### Code Review Generalist (cold read)

#### RESOLVED: Overview wording is misleading about *when* the temporal value is read
**Decision**: Overview's second sentence rewritten to name both read patterns explicitly ("either as the final value during the reading's window, or as a sticky-OR over the window's appends"). Will inform the Finalization rewrite rather than be discarded by it.
The Overview reads: "Impls read the temporal value at the witness reading's timestamp instead of relying on host-stamped ambient fields." But R5d's helper `currentTemporal` returns the *last* `TemporalVariableChange.value` in the reading's window — i.e. the value at the *end* of the window (last append, or the seed if no appends fired). It is not "at the witness timestamp." Sticky-OR (`temporalHistory.some(...)`) is even less "at the witness timestamp" — it's "ever during the window." The Overview phrasing risks misleading a reader into thinking they're reading a point-in-time projection. (Overview gets rewritten at Finalization — this is for the rewrite to absorb.) Suggest: "Impls read the temporal value's history within a reading's window, either as the final value or as a sticky-OR over the window's appends."

---

#### RESOLVED: R4 + R5 ambiguity when an event is both a state-change and a trigger
**Decision**: Defer behavior pinning until a concrete use case arises. Added to Out of Scope. No such event exists today, and pinning now would be design speculation; forbidding via construction-time validation would over-constrain for hypothetical future needs. The Out of Scope bullet records the open question so the next implementer revisits R4/R5a/R5b deliberately rather than absorbing an unstated default.
R4 says reducers apply *before* trigger evaluation for the same event. R5b says every state-change event appends to the *current* (most-recent) reading's `temporalHistory`. R5a says triggers seed a *new* reading from live `temporalValues`. If a single event is *both* a state-change and a trigger (no such event today; the types don't forbid one tomorrow), the engine does — in order — (1) run the reducer (R4), (2) append to the *previous* reading (R5b, current/most-recent reading at this instant), (3) create the new reading (trigger eval), (4) seed the new reading from post-update `temporalValues` (R5a). Net result: the same logical event produces *two* `TemporalVariableChange` entries at the same `at` — one in the previous reading's append trail, one in the new reading's seed array. Likely correct by design (the previous reading's trail must be complete; the new reading must be self-contained) but the spec should state it explicitly so an implementer doesn't "fix" it by short-circuiting. Suggest a clarifying sentence in R5b.

---

### Senior Engineer (second pass)

#### RESOLVED: Reducer exception handling unspecified
**Decision**: Propagate exceptions; engine does not catch. R1 amended with a "Reducer exceptions propagate" clause specifying: live `temporalValues` left pre-event, no append fires, trigger evaluation skipped. Rationale — for an in-development engine, fail-loud surfaces reducer bugs immediately and preserves replay determinism (same input → same crash). Revisit if/when the engine ships and a softer failure mode is needed.
R1 requires `update` be pure but doesn't say what happens if a reducer throws. Cases: a reducer with a buggy lookup throwing `TypeError`, a reducer asserting an invariant and throwing `Error`, a reducer accidentally returning `undefined` then a chained `.foo` blowing up downstream. Without a stated policy the implementer will pick (a) let it propagate and crash the consume cycle, (b) try/catch and skip the update, or (c) try/catch and surface an `EngineError`. Each has visibly different runtime behavior and replay-determinism implications: option (a) makes the engine fragile but determinism is preserved (same crash on replay); option (b) lets the live `temporalValues` drift silently; option (c) is the most legible. Suggest a clause in R1 or a new R1b: "If a reducer throws, the engine surfaces an `EngineError` of variant `temporal-reducer-error` and aborts further temporal updates for this event; `temporalValues` rolls back to the pre-event state. The trigger evaluation for this event does not run." Choose deterministically; don't leave to implementer.

---

## Self-Review — Round 3

A third pass with fresh roles (Bisect/Incident Response, Build/CI, Naming/Consistency, Hazbot Validation, Engine Substrate/Bridge, JSON/Data Model). Each item is OPEN pending user assessment.

### Engine Substrate / Bridge Reviewer

#### RESOLVED: R2 doesn't pin where temporal-variable *declarations* live
**Decision**: Bridge-side only (option a). R2 amended — "Temporal-variable impls are declared bridge-side and passed to `new Engine(...)` alongside `factorVariables` and `simProps`. The same set applies to every rule set the bridge can construct (symmetric with sim-props)." R7's "rule-set id" disambiguated as the *active* rule set's id, not a per-rule-set declaration scope. R21 stands — no spreadsheet impact. Cheapest shape for current scope (R9 puts DSL access out of scope, GraphOpen is the only consumer).
**Context**: R2 says "Rule sets declare temporal variables alongside factor variables and sim-props." But existing analogues split this responsibility: factor-variable *defs* (name, definition, logEvents, details) live on the rule set (`RuleSet.factorVariables` in [types.ts:32](src/hazbot/engine/types.ts#L32)), but factor-variable *impls* live on the bridge (`factorVariables` in [src/hazbot/wildfire/factor-variables.ts](src/hazbot/wildfire/factor-variables.ts), passed to `new Engine(...)` in [engine-singleton.ts:39](src/hazbot/wildfire/engine-singleton.ts#L39)). Sim-props don't even have rule-set-side defs — they're entirely bridge-side. Where do temporal variables go? Three plausible shapes:

- (a) **Engine-constructor-arg only.** Bridge declares `temporalVariables: Record<string, TemporalVariableImpl>` and passes to `new Engine(...)` alongside `factorVariables` and `simProps`. Same set applies to every rule set. Simplest; matches sim-prop pattern.
- (b) **Per-rule-set declaration.** `RuleSet` gains a `temporalVariables` field. Auto-generated rule-set modules from the spreadsheet extraction script would need to emit it. Spreadsheet impact (R21 says "no changes" — would need re-evaluation).
- (c) **Both: defs on rule set, impls on bridge.** Mirrors factor-variable shape exactly.

R7's `temporal-validation` includes "the rule-set id," which is compatible with all three. R9 puts DSL access out of scope, so rule-set authors don't reference temporal-variable names in expressions — weakening the case for (b)/(c). Without pinning, the implementer is forced into a load-bearing decision the spec author didn't make.

Suggest: state explicitly that temporal-variable impls are bridge-side only for this pass (shape (a)), pinned by a new note in R2 and a re-check of R21. If (b)/(c) is intended, the spreadsheet-extraction impact needs assessment.

---

#### RESOLVED: R5d's substrate location couples substrate to a wildfire-shaped concern
**Decision**: No spec change. The helper operates on `TemporalVariableChange` — a substrate type — and any future non-wildfire bridge reading temporal trails would need to re-implement the same one-liner if it lived bridge-side. The "substrate-resident with no in-substrate caller" pattern is fine; `findLast` is already that exact pattern. The considered-and-rejected alternative (move to bridge) is recorded here so a future maintainer doesn't re-litigate.
R5d places `currentTemporal<V>(reading, name)` in the engine substrate, "alongside the existing `findLast`." `findLast` is genuinely generic — it's an array operation. `currentTemporal` is specifically a temporal-variable read. If temporal-variable *impls* live bridge-side (per Finding 1), placing the helper in the substrate means the substrate exports a function with no in-substrate caller. That's not wrong, but it's a smell: substrate-resident helper for a bridge-resident concept.

Alternatives:
- (a) Keep R5d's choice. Substrate exports the helper; bridge consumes it. Substrate stays consistent in vocabulary (the helper operates on the `TemporalVariableChange` type which IS substrate-defined).
- (b) Move helper to the bridge alongside the temporal-variable declarations. Substrate stays minimal.
- (c) Make the helper a method on the engine substrate's reading-side types — but `BaseReading` is a structural interface, methods don't fit.

Substrate ownership of the *type* (`TemporalVariableChange`) is correct; substrate ownership of the *helper* is the question. Current choice (a) is defensible — the helper is a pure function over a substrate type — but the spec should acknowledge the alternative considered.

---

### Naming / Consistency Reviewer

#### RESOLVED: `temporalVars` (trail array) vs `temporalValues` (live map) are easily confused
**Decision**: Renamed the per-reading trail field from `temporalVars` → `temporalHistory`. Live map stays `temporalValues`. The disambiguating axis ("trail vs. current") is now in the name. Entry type `TemporalVariableChange` keeps its name — the entries are still about a variable's changes. Applied via replace-all across R-clauses, Background, worked example, and historical decision notes (which now read as if the rename was always present — fine, they describe the same concept under its current name).
**Context**: The spec introduces two distinct stores that differ in role but share a prefix:
- `reading.temporalHistory: TemporalVariableChange[]` — per-reading append-only trail (R5)
- `engine.temporalValues: Record<string, unknown>` — live projected map (R3, R6)

A reader skimming code or the spec will conflate them. Both are "temporal," both store values, both belong to the engine's bookkeeping. The distinguishing axis ("trail vs. current") isn't in either name.

Options:
- (a) Rename live map to `liveTemporalValues` or `currentTemporals` — keeps `temporalHistory` (the more frequently-referenced one) short.
- (b) Rename trail to `temporalHistory` or `temporalTrail` — keeps `temporalValues` natural for the map.
- (c) Keep names; document the distinction in the engine README + a comment block at each declaration.

Suggest: (b) `temporalHistory` for the per-reading trail. Reads accurately ("the temporal history of this reading's window") and pairs naturally with the live map. Touches R5/R5a-d, R13, R16, R17, R18, and several technical-notes references — but the renames are mechanical.

---

#### RESOLVED: `update` is generic; `eventSources` reads ambiguously
**Decision**: Renamed `update` → `reduce` (specific verb, accurately names "it's a reducer," parallels `compute`/`evaluate`). Renamed `eventSources` → `acceptedEvents` (direct meaning). Applied across R1, R3, R14, the worked example, and the historical Self-Review notes that reference these names. `eventSources` was replace-all-safe; `update` required targeted edits to avoid colliding with unrelated "updates" prose (especially the `BaseReading.updates` modifier mechanism being removed in R10b).
**Context**: Two naming nits in R1's `TemporalVariableImpl<V>` shape:

1. **`update(currentValue, event) → newValue`** — `update` is the most generic verb in JavaScript (`Object.update`, `Map.update`, framework `update()` methods). Sibling impls use specific verbs: `FactorVariableImpl.compute`, `SimPropImpl.evaluate`. A more specific verb fits the codebase rhythm: `reduce(state, event)` (it's literally a reducer) or `next(state, event)` (state-machine vocabulary).

2. **`acceptedEvents: string[]`** — reads as "where the events come from" (singular sources of events feeding the reducer). The actual meaning is "event names the reducer responds to." Alternatives: `acceptedEvents`, `eventTypes`, `subscribesTo`, `triggers` (but `triggers` is already an engine concept). `acceptedEvents` is the most direct.

These are small but compound across docs, tests, and the engine README (R19). Easier to fix before they land than after.

Suggest: rename `update` → `reduce`, `acceptedEvents` → `acceptedEvents`. R1 plus consequential edits in R3, R5b, R14, the worked example, and Technical Notes.

---

### Bisect / Incident Response Engineer

#### RESOLVED: R18c is ruleset-25-specific; engine-wide regressions can sneak past it
**Decision**: R18c amended with an explicit Scope clause — ruleset 25 for this pass; future rule sets exercising novel substrate constructs (or significant new category logic worth pinning) add their own fixture pair under `__fixtures__/`. Selective expansion via the forward rule keeps current-PR burden bounded while leaving the door open for engine-wide coverage as it earns its weight.
**Context**: R18c is "the headline regression test for the work." It pins a fixture pair (`events.json` + `expected.json`) under [src/hazbot/wildfire/__fixtures__/](src/hazbot/wildfire/__fixtures__/). The spec implies one fixture, covering "pre-trigger state changes and within-window state changes." But which rule set does the fixture exercise? Almost certainly ruleset 25 (the only one with `GraphOpen`).

If a future engine change breaks classification for rulesets 23, 24, or 26+ in a way ruleset 25 doesn't exercise (different category expressions, different factor-variable mixes), R18c misses it silently. The replay-determinism promise is engine-wide, not ruleset-25-only.

Options:
- (a) Keep R18c as ruleset-25-only. Other rule sets covered indirectly by their existing test suites. Acceptable if existing ruleset tests are fixture-pinned, but they're not (per [src/hazbot/rule-sets/25.test.ts](src/hazbot/rule-sets/25.test.ts) inspection from prior context — they're scenario-based).
- (b) One fixture per active ruleset. Pinned diff at PR time for any cross-cutting engine change. More fixtures to maintain, but the "regenerate and review diff" workflow already covers maintenance.
- (c) One scenario-rich fixture per ruleset for rulesets that exercise novel constructs (temporal variables today, future constructs later). Selectively expand.

Suggest: (c). Add a sentence to R18c: "Scope: ruleset 25 for this pass. Future rule sets exercising novel substrate constructs should add their own fixture pair under `__fixtures__/`."

---

#### RESOLVED: R1's reducer-throw propagation can crash the host's log() pipeline
**Decision**: Reverses Round 2's "propagate" decision. R1 amended — engine catches reducer throws and emits a new `temporal-reducer-error` `EngineError` variant (added to R7). Mirrors the existing `impl-eval-throw` pattern. Live `temporalValues` left pre-event, no append fires, trigger evaluation skipped. Replay determinism preserved (same input → same error → same dropped state). Rationale for reversal: Round 2 didn't account for `consume()` being called from `log()`, which is called from UI event handlers — uncaught throws would break UI mid-render. Sidebar renders the error via the existing `renderError` pipeline.
**Context**: R1 says a thrown reducer exception "propagates out of `consume()`; the engine does not catch." Today, `consume()` is called from [src/log.ts:24](src/log.ts#L24) inside `log()`. An uncaught throw inside `consume()` propagates out of `log()`, which is called from across the app (e.g. [bottom-bar.tsx:252](src/components/bottom-bar.tsx#L252) on chart-tab toggle). A bug in a reducer would not just break the engine — it would break every event call site, potentially crashing UI handlers mid-render.

The "fail loud" rationale is sound for an in-development engine where the developer wants to see the bug immediately. But "fail loud" inside `log()` means UI errors. Today, an `ambient-validation` error is captured into `engine.errors` and surfaced in the sidebar — it doesn't escape into the host.

Two failure modes worth distinguishing:
- (a) Bug in a reducer (impl author's mistake). Should fail loud at dev time. Fine.
- (b) Genuinely unexpected event shape feeding a reducer (e.g. a future event type with unexpected `data` shape). Same crash, harder to attribute.

Options:
- (a) Keep the propagate-out behavior. Document in R1 that `log()` callers are exposed to reducer throws.
- (b) Wrap reducer dispatch in `consume()` with a try/catch that pushes an `EngineError` variant (`temporal-reducer-error`) and continues. Live `temporalValues` left pre-event. Mirrors the `impl-eval-throw` pattern already in [types.ts:84-87](src/hazbot/engine/types.ts#L84-L87) for factor-variable / sim-prop throws.
- (c) Have `log()` catch in dev mode and surface to the sidebar; let it propagate in test environments (where R18a / R18c expect strict equality).

R1's resolved-in-round-2 decision was explicitly "propagate." But it didn't consider the call-site impact through `log()`. Worth re-examining now or noting that the impact is accepted.

Suggest: (b). Consistency with `impl-eval-throw` is the strongest argument — reducer throws are the same class of impl bug as evaluator throws, and the engine already has a "catch + surface as EngineError + sidebar render" pattern. R1 amended; new `temporal-reducer-error` variant in EngineError; sidebar renders it; substrate's existing error-rendering test surface extends.

---

#### RESOLVED: `temporal-validation` error needs sidebar rendering (R16/R7 mismatch)
**Decision**: Partially resolved by Finding 6 (which added a sidebar-rendering sentence to R7). Closing the loop from R16's side: R16 now also mentions explicitly that ErrorsPanel + `describeErrorContext` get cases for both `temporal-validation` and `temporal-reducer-error`. Belt-and-braces, but the sidebar implementer reading R16 won't have to chase the responsibility into R7.
**Context**: R7 introduces `temporal-validation` as a new `EngineError` variant. R16 describes sidebar additions (Temporal Variables panel, per-reading trail) but doesn't say `temporal-validation` errors render in the existing ErrorsPanel. The sidebar's existing `describeErrorContext` ([sidebar.tsx:288-300](src/hazbot/engine/sidebar/sidebar.tsx#L288-L300) area) is a discriminated-union switch — silently dropping a new variant compiles but the sidebar shows the error without context.

This is a small but real implementer trap: R7 lists the error fields (impl name, missing temporal-variable name, rule-set id), but doesn't pin that the sidebar renders these the way the existing `ambient-validation` renderer does.

Suggest: amend R16 — "Sidebar's ErrorsPanel + `describeErrorContext` handle `temporal-validation` with context formatting matching existing `ambient-validation`." Or amend R7 — "Engine error variant is rendered by sidebar via `renderError` + `describeErrorContext` per existing pattern for `ambient-validation`."

---

### Build / CI Reviewer

#### RESOLVED: R18a's "no module-level mutable state" invariant is audited once, not enforced
**Decision**: No spec change. R18a's behavioral two-engine equality check, the one-time grep audit, plus reviewer attention on `engine.ts` changes are sufficient. A lint rule scanning for `let`/`var` at module scope would over-flag legitimate module-level constants and force a maintenance burden disproportionate to the hypothetical risk (no-op cache that passes behavioral checks but violates the contract). Recorded here so future-maintainer doesn't add the lint rule reflexively.
**Context**: R18a says "The substrate `Engine` class is verified to hold zero module-level mutable state (grep of [engine.ts](src/hazbot/engine/engine.ts) shows no module-scope bindings), so two `new Engine(...)` constructions are fully isolated." The grep is a one-time audit. A future refactor that adds module-level state would only be caught by R18a *if the state changes the observable readings/category history*. A no-op cache (memoizing parsed expressions across instances) would pass R18a's equality check but violate the contract.

Options:
- (a) Trust the audit + R18a's behavioral check. Acceptable risk.
- (b) Add a CI lint rule (`no-restricted-syntax`) scanning [src/hazbot/engine/engine.ts](src/hazbot/engine/engine.ts) for `let`/`var` at module scope. Cheap structural canary.
- (c) Make the audit a runtime test: `expect(Object.keys(require.cache[engineModule]).filter(k => mutableModuleLevel(k))).toEqual([])` — overkill, fragile.

Suggest: (b). Add a note to Technical Notes / R18a recommending a lint rule, deferred as a follow-up if not immediate. Not blocking, but worth surfacing.

---

#### RESOLVED: R18c regeneration command not pinned to a script entry
**Decision**: Pinned to `scripts/generate-replay-fixture.js`, invoked via `node scripts/generate-replay-fixture.js`. Matches the existing playbook generator's JS-plus-`node`-invocation pattern (no TS compile step needed for a one-off script). R18c amended; CLAUDE.md's "Common commands" table to gain an entry alongside the existing playbook generator (out-of-scope for the main PR diff but called out).
**Context**: R18c references "a checked-in script (e.g. `scripts/generate-replay-fixture.ts`)" and a "Regeneration workflow." But the spec doesn't pin:

- The exact script path (TS vs. JS — the project's other generator script is JS: [scripts/generate-hazbot-validation-playbook.js](scripts/generate-hazbot-validation-playbook.js)).
- Whether the script is invoked via `node scripts/...` directly or via a `package.json` "scripts" entry (`npm run regenerate-replay-fixture`).
- Whether it runs in dev (Jest test environment? Standalone Node?).

Without pinning, "re-run the capture script" turns into a 10-minute archaeology session for the maintainer. The existing playbook generator pattern argues for a JS file + `node scripts/...` invocation, but the spec leaves it open.

Suggest: pin to `scripts/generate-replay-fixture.js` (matching the playbook generator's JS pattern), invoked via `node scripts/generate-replay-fixture.js`. Add an entry to the "Common commands" table in CLAUDE.md (separate change, but worth noting in R20).

---

#### RESOLVED: R1's purity contract has no CI enforcement
**Decision**: No spec change. For one current reducer (boolean update), the contract is trivially verifiable at PR time. R18a's two-engine determinism check catches most concrete impurity (a reducer reading `Date.now()` would produce non-identical readings, modulo lucky timing collisions). Adding a file-scoped lint rule pre-commits to a directory layout that doesn't yet exist and burdens maintenance disproportionately. Revisit if/when the engine ships or grows to 5+ temporal variables.
**Context**: R1 states reducers must be pure functions of `(currentValue, event)` — no `Date.now()`, `Math.random()`, no external mutable state. The contract is critical for replay determinism (R18a). The contract has zero enforcement: a reducer reading `Date.now()` compiles, runs, breaks replay silently. The audit happens at code-review time, manually.

Options:
- (a) Trust review. Acceptable for one current reducer.
- (b) Lint rule (`no-restricted-syntax`) flagging `Date.now()`, `Math.random()`, `performance.now()` inside any function literal whose enclosing assignment is to a `TemporalVariableImpl.update` (AST-pinned). Specific enough not to over-flag.
- (c) Convention: temporal-variable impls live in a dedicated file (`src/hazbot/wildfire/temporal-variables.ts`), and a lint rule covers that whole file rather than AST-matching the assignment.

Suggest: (c) for this pass. R14's implementation creates a dedicated file naturally; a file-scoped lint rule is the cheapest enforcement. Note as a future hardening rather than a blocker.

---

#### RESOLVED: Step-by-step commit greenness not pinned for R10/R10b removals
**Decision**: Added a "Commit greenness invariant" bullet to Technical Notes → "Engine plumbing constraints." Specifies that each PR-mergeable step (not every WIP push) must leave lint/build/test green, and acknowledges this is primarily a Phase 2 implementation-plan concern recorded here so the implementer doesn't discover it mid-plan.
**Context**: R10 and R10b remove substantial surface area. If the implementation is split across commits, an interim commit could leave the build red (e.g. removing `BaseReading.updates` while `sidebar.tsx` still references `reading.updates.length`). The implementation plan (Phase 2) isn't part of this spec yet, but the requirement's bundling implies multiple steps.

Suggest: add a one-line invariant to Technical Notes: "Each commit must leave `npm run lint`, `npm run build`, and `npm test` green — sequencing of additions and removals must avoid red-build intermediate states." Forces the implementation step ordering decision out of the implementer's head and into the spec.

---

### Hazbot Validation Engineer

#### RESOLVED: Sidebar's per-reading temporal-history view risks visual clutter
**Decision**: R16 amended — collapsed-by-default with informative summary (final values + change count, e.g. `chartTabOpen: false (3 changes)`), expand reveals full trail. Reuses the existing `ReadingRow` expand toggle. Final value is the validator-relevant signal; full trail is the debug deep-dive.
**Context**: R16 says each reading row "additionally shows the reading's `temporalHistory` trail (timestamps + name + value), replacing today's 'N update(s)' label with a first-class temporal-history view." Today's "N update(s)" is a count — visually compact, skim-able. A full trail (seed + every append) for a long-running session could be 5-20 lines per reading row, multiplied by N readings.

The validator's question is usually "what was `chartTabOpen` at this reading?" — answered by the *final* value, not the full trail. The trail matters only when debugging an unexpected sticky-OR result.

Options:
- (a) Always show full trail. Spec as-written.
- (b) Collapsed-by-default: show "chartTabOpen: false (3 changes)" by default; expand to full trail on click. The existing `ReadingRow` already has an expand mechanism ([sidebar.tsx:201-217](src/hazbot/engine/sidebar/sidebar.tsx#L201-L217)).
- (c) Show only the final value inline; trail visible only when the reading is expanded.

Suggest: (b) or (c). The expandable pattern is already in the sidebar — temporal history slots into the same affordance. Amend R16 to specify collapse behavior.

---

#### RESOLVED: Sidebar should trace `GraphOpen`'s evaluation back to a temporal trail entry
**Decision**: R16 amended — Sim Props panel shows each prop's `temporalReads` (if declared) as an inline hint (e.g. `GraphOpen: true · reads: chartTabOpen`). One-hop trace from sim-prop result to relevant trail entry. Cheap to implement (data already in `temporalReads`), affordance lands once and compounds as more sim-props gain `temporalReads`.
**Context**: Today, a validator looking at "why did category 5 fire?" can see `GraphOpen: true` in the Sim Props panel and infer "because the chart tab was open." After R13, `GraphOpen` evaluation is `reading.temporalHistory.some(c => c.name === "chartTabOpen" && c.value === true)`. The Sim Props panel still shows `GraphOpen: true`, but the *cause* (which entry in the trail) is invisible unless the validator manually expands the reading's trail and grep-spots the right entry.

For one variable and one sim-prop today, this is tolerable. For multiple temporal variables and multiple sim-props depending on them, the "why" gets diffuse.

Options:
- (a) Accept. Sim Props shows result; reading trail shows cause. Validator correlates manually.
- (b) Sim Props panel adds a "uses: chartTabOpen" hint per sim-prop with `temporalReads`. Tracing one hop without leaving the Sim Props panel.
- (c) Per-reading "category trace": shows which factor/sim-prop fired, which temporal variables they read, the values. Bigger UX project.

Suggest: (b). Cheap, leverages the existing `temporalReads` declaration. Amend R16 with one sentence: "Sim Props panel shows each prop's `temporalReads` (if any) as a small hint badge."

---

#### RESOLVED: "Temporal Variables" panel shows `initialValue` indistinguishably from observed value
**Decision**: R16 amended — panel visually distinguishes "initial, not yet observed" from "observed" (muted/italicized vs. normal). "Observed" derived in the sidebar from `readings[].temporalHistory` (any non-seed entry implies a real event fired) — no new engine state needed. Cheaper than tracking a per-variable "has-observed?" bit in engine state for a sidebar-only concern.
**Context**: R16 introduces a "Temporal Variables" panel showing "current (live) values." Before any `ChartTabShown`/`ChartTabHidden` event fires, `chartTabOpen: false` shows up identically whether (a) no event has ever fired (initial state), (b) the most recent event was `ChartTabHidden` (observed state). A validator looking at the panel can't distinguish these — yet the difference matters: (a) means the temporal projection hasn't been exercised; (b) means it has been and is in the "false" state.

The existing Sim Props panel has a precedent: it shows `n/a` until the first run-start reading ([sidebar.tsx:257-265](src/hazbot/engine/sidebar/sidebar.tsx#L257-L265)). Analogous treatment for temporal variables:
- (a) `n/a` (or italicized "false (initial)") until the first matching event has fired.
- (b) Show value as-is, with a small "(initial)" suffix when the live value still equals `initialValue` AND no matching event has been consumed yet.

Option (b) is more precise (a variable could be coincidentally back at `initialValue` after toggles), so the spec needs to distinguish "current value === initial" from "no event observed yet."

Suggest: amend R16. The engine already tracks observed events; expose a "has any matching event been consumed?" bit per temporal variable, render the suffix accordingly.

---

### JSON / Data Model Reviewer

#### RESOLVED: `TemporalVariableChange.value: unknown` allows non-JSON-safe values; R18c fixtures will silently flatten
**Decision**: R1 gains a "Known constraint" clause — temporal-variable value types `V` should be JSON-safe; non-JSON-safe values silently flatten under fixture serialization. Enforced by convention, not TS types (recursive `JsonValue` helper would pollute the substrate interface for a hypothetical future concern). Current scope (boolean) is trivially compliant; the warning lands for the next implementer at design time.
**Context**: R5 declares `TemporalVariableChange.value: unknown`. R18c's fixture format is JSON (`events.json` + `expected.json`). For `chartTabOpen: boolean`, JSON-safe — no issue. But future temporal variables could hold `Set<string>` (e.g. "which zones have been clicked?"), `Map`, `Date`, or class instances. JSON.stringify silently flattens all of these:
- `new Set(["a", "b"])` → `"{}"`
- `new Map([["k", "v"]])` → `"{}"`
- `new Date(...)` → `"\"2026-05-19T..."\"`

R18c's "strict equality with expected.json" then either (a) fixtures encode `"{}"` and live engine produces a real Set — the equality check fails post-JSON-round-trip; or (b) the fixture comparison is structural via `JSON.parse(JSON.stringify(actual))` — equality holds but the test no longer reflects live engine state.

For the current scope (one boolean temporal variable), this is hypothetical. But the engine substrate's `TemporalVariableImpl<V>` is generic in `V` precisely so future variables can be non-boolean. Without a constraint, the next implementer ships a `Set`-valued temporal variable and discovers the fixture infrastructure quietly broken.

Options:
- (a) Constrain `V` to JSON-safe types. Hard to express in TypeScript without a recursive helper type, but achievable.
- (b) Document the constraint in R1 / Technical Notes: "Temporal-variable value types must be JSON-serializable for R18c fixture compatibility." Enforced by convention, not types.
- (c) Have R18c's fixture comparison use a serializer that handles common non-JSON types (Set, Map, Date). Pushes complexity into the test harness.

Suggest: (b). Add a one-line note to R1 — value types should be JSON-safe (booleans, numbers, strings, plain objects, arrays). Future-proofs R18c without TypeScript gymnastics.

---

#### RESOLVED: `temporalHistory` array allows duplicate (at, name) entries; no primary-key assumption
**Decision**: R5 amended — "Consumers should iterate the array directly; `(at, name)` is not a unique key. Multiple entries for the same name at the same `at` are valid." Cites the same-event scenario from Out of Scope as a concrete case. Cheap documentation safety net; no current consumer indexes by `(at, name)` but a future maintainer building `{[at]: change}` would silently lose entries.
**Context**: `TemporalVariableChange = { at, name, value }`. Two appends can share `at` (same-event-timestamp scenario in Out of Scope; also possible with synthetic test timestamps). The array is ordered by arrival, so consumers that iterate (the sticky-OR pattern) work correctly. But a consumer that builds a map keyed by `at` (`Object.fromEntries(trail.map(c => [c.at, c]))`) loses entries. R5d's `currentTemporal` (uses last entry by name, not by `at`) is fine.

Spec doesn't pin "the array is the source of truth; do not index by `at` or `name` alone." A future maintainer writing a sidebar visualization could naively build `{[at]: change}` and lose data silently.

Suggest: one sentence in R5 — "Consumers should iterate the array directly; (at, name) is not a unique key. Multiple entries for the same name at the same `at` are valid (e.g. same-event dispatch from R4 + R5b)."

---

#### RESOLVED: Fixture format — JSON vs. JSON5 / commenting affordance
**Decision**: Stay with plain JSON. R18c amended — sibling `__fixtures__/README.md` documents regeneration command, what each scenario exercises, and regeneration triggers. JSON5/JSONC would add parser dependency for one file; TS fixture files would lose the "regenerated as plain data" property that makes diffs readable. README sidecar preserves both.
**Context**: R18c says `events.json` and `expected.json`. JSON has no comments. A future maintainer regenerating the fixture has no in-file place to annotate "this event sequence tests the all-four-corners GraphOpen case from R18b." Annotations go in a sibling README or in the test file itself.

Options:
- (a) Plain JSON. Annotations in `__fixtures__/README.md` or in the `*.test.ts` describing the scenario.
- (b) JSON5 or JSONC for the fixtures. Allows comments. Adds a parser dependency or custom loader.
- (c) TypeScript fixture files (`events.ts` exporting `as const`). Self-typed, comments allowed, no runtime parse cost. Loses the "regenerated as plain data" property.

Suggest: (a). Pair with a sibling `__fixtures__/README.md` documenting (i) regeneration command, (ii) what each fixture scenario exercises, (iii) what kinds of changes trigger regeneration. Reuses R18c's regeneration workflow content with a concrete location.

---

## Self-Review — Round 4

A fourth pass with fresh roles (Observability / Debug, DevOps / Rollout, Documentation / DX, Cypress E2E, Architectural Symmetry). Each item is OPEN pending user assessment.

### Observability / Debug Engineer

#### RESOLVED: Production-debugging replay path is implicit, not pinned
**Decision**: (a). Audit performed and recorded in Technical Notes → "Engine plumbing constraints" as a new bullet: "LARA log payload is replay-compatible with `ConsumedEvent`." The audit traces `name`/`data` 1:1 to the LARA log via [src/log.ts:19](src/log.ts#L19), notes that `at` is engine-set and the LARA wrapper stamps independently (sufficient for replay, R18c fixtures normalize `at` anyway), and pins the headline replay promise as structurally supported. A future loader script (option b) is a Phase 2 concern if shape mismatch turns out non-trivial.
**Context**: The Project Owner Overview frames replay as the headline benefit ("an analyst can't replay a captured log file and get the same classifications"). The audit in Technical Notes confirms `externalLog` only sees `(name, data)` — so the LARA-style captured log *is* the source for replay. But this load-bearing claim — "the LARA log payload is sufficient to reconstruct a `ConsumedEvent[]` for replay through a fresh engine" — is never stated. R18a/R18c exercise replay against a hand-curated fixture, not against a wild capture.

For the analyst's actual workflow ("I have last week's session log, classification was wrong, why?"), the path is implicit: load LARA log → reshape to `ConsumedEvent[]` → feed to fresh engine → step through readings. None of this is documented. If the LARA log has any timestamp format mismatch, missing fields, or shape drift from `ConsumedEvent`, the analyst hits friction the spec promises won't exist.

Options:
- (a) State in Technical Notes that the LARA log payload is replay-compatible with `ConsumedEvent` (one-line audit result + cite).
- (b) Add a small loader script under `scripts/` that converts a LARA log dump to `ConsumedEvent[]` for replay. Pins the integration in code.
- (c) Add a Background paragraph clarifying that the "captured log" referenced in the headline promise is specifically the LARA log, and that the replay path lives in R18a's two-engine pattern + this loader.

Suggest: (a) for this pass; consider (b) as a Phase 2 step if the implementer finds the shape mismatch non-trivial. The spec should at least pin the claim.

---

#### RESOLVED: `temporal-reducer-error` doesn't expose enough to localize a wild-capture bug
**Decision**: (a). Mirror `impl-eval-throw`'s field set; no `eventIndex` addition. Rationale: the engine isn't shipped, no analyst is doing wild-capture debugging today, and adding `eventIndex` for hypothetical future use breaks symmetry with `impl-eval-throw` (which doesn't carry it). The captured `event` field is grep-able against any wild capture. If wild-capture replay tooling materializes post-ship, `eventIndex` can be added then to both variants in lockstep. CLAUDE.md guidance ("Don't design for hypothetical future requirements") applies.
**Context**: R7's `temporal-reducer-error` fields are `ruleSetId`, `variableName`, `event`, `thrown`, `at`. For a sidebar reading the error in a live session, this is enough — the developer knows which rule set is loaded and can find the reducer. But for an analyst replaying a captured log and hitting the error, "ruleSetId" + "variableName" tells them WHERE the bug is (the reducer), but the captured `event` may not be enough to know WHY (the event payload's `data` shape might be the trigger).

The existing `impl-eval-throw` ([types.ts:84-87](src/hazbot/engine/types.ts#L84-L87)) for factor-var / sim-prop throws likely faces the same limitation. The new variant inheriting the same shape is consistent, but the limitation is worth flagging — a wild-capture replay surfacing this error doesn't trivially yield a minimal repro.

Options:
- (a) Accept. `temporal-reducer-error` mirrors `impl-eval-throw`'s field set; consistency is the win.
- (b) Add `eventIndex: number` (position in the consumed stream) so the analyst can slice the captured log up to that index and reproduce. Cheap addition, real diagnostic value.
- (c) Add the full `temporalValues` snapshot at the time of the throw. Heavier; arguably belongs in the sidebar render rather than the error payload.

Suggest: (b). One extra field on the variant, no downstream complexity, materially helps wild-capture debugging.

---

### DevOps / Rollout Engineer

#### RESOLVED: "Engine isn't shipped to production" is a load-bearing precondition, not framed as one
**Decision**: (c). Background gains a new "Preconditions" subsection that names the dev-only-today assumption and enumerates the four decisions it underwrites (single-PR bundling, no captured-log migration, sidebar-only error surfaces, ruleset-25-only fixture coverage). Out of Scope gains a "Ship-readiness work" bullet listing the deferred items (captured-log migration, external error surfaces, broader fixture coverage, R18a singleton-bypass re-evaluation) and stating they become real when the precondition flips. The two notes reinforce each other — a future maintainer hits the precondition in Background before reading R10/R10b/R18a/R18c, and the Out of Scope entry preempts the "what's the ship plan?" review question.
**Context**: Background's third paragraph justifies the single-PR bundling by saying "the blast radius is acceptable because the analysis engine isn't shipped to production." Out of Scope's fourth bullet repeats: "there are no pre-refactor production logs to replay." These are the same precondition — *the engine is dev-only today*. They appear as parenthetical justifications, not as a stated precondition with consequences.

When the engine *does* ship (next quarter? next year?), this entire migration story changes:
- Captured production logs predating this PR contain `ambientState` keys the new engine cannot read.
- An "ambient-validation" failure mode the new engine doesn't recognize would surface in replay.
- A migration script (lift `ambientState.chartTabOpenAtStart` into a synthesized `ChartTabShown` event at the right `at`) becomes necessary.

The spec is correct that none of this matters *today*. But a future maintainer reading the spec at ship-time will not automatically derive "the assumption that justified single-PR bundling no longer holds — re-evaluate." Spec should pin the precondition explicitly.

Options:
- (a) Add a "Preconditions" subsection to Background that names the dev-only-today assumption and lists what changes if/when the engine ships (the captured-log migration concern, the external surface for `temporal-reducer-error` etc.).
- (b) Add a "Ship readiness" bullet to Out of Scope that explicitly defers the production-replay migration work to a follow-up spec triggered by the ship decision.
- (c) Both — Background pins the precondition; Out of Scope captures the deferred work.

Suggest: (c). The dev-only assumption is doing real load-bearing work in Background, R10/R10b bundling, R18a/R18c fixture-only replay coverage, and `temporal-reducer-error` being sidebar-only. Naming it once and listing its consequences keeps the future maintainer honest.

---

#### RESOLVED: No rollback path documented for the bundled PR
**Decision**: No spec change. User confirmed rollback is not a planned scenario for this work — the engine is dev-only and forward progress is the only path. The Preconditions subsection (added by Finding 3) already covers the "if the engine ships, re-evaluate" angle, which is the only context where rollback granularity would matter. Documenting a rollback story for a scenario that won't occur is the kind of speculative defensive doc the project's CLAUDE.md guidance discourages.
**Context**: The single-PR bundling decision (Background, Migration Engineer Round 2 review) is justified architecturally. But rollback is unmentioned. If the PR lands and a regression surfaces (e.g., a `temporal-reducer-error` firing in dev that wasn't caught by R18a/R18c), the rollback is a full revert — `ambientState`, `BaseReading.updates`, the orphan-modifier error, and the sidebar's "N update(s)" label all come back.

For a dev-only engine, full revert is cheap. For a soon-to-ship engine, it's not — any consumers built on the new `temporalHistory` shape (future rule sets, ad-hoc analysis scripts) would also revert. Worth one sentence: "Rollback is a full git revert of the PR; the bundled removals come back as a single unit, intentional given the dev-only state."

Options:
- (a) Add a one-line "Rollback" note to Background (next to the single-PR justification).
- (b) Leave implicit — git revert is git revert.
- (c) Defer until Phase 2 implementation plan, where commit ordering can pin a safer revert granularity.

Suggest: (a). Cheap, prevents the "what's our rollback story?" review question.

---

### Documentation / DX Engineer

#### RESOLVED: R19 ("update README") is vague — no shape pinned
**Decision**: (a). R19 expanded inline to specify three sections — (i) concept, (ii) worked walkthrough lifting the Technical Notes example, (iii) five-step "Adding a temporal variable" checklist. The checklist enumerates the five touch-points (declare, wire, consumer `temporalReads`, tests, fixture regeneration). Phase 2 implementer no longer guesses at README scope.
**Context**: R19 says "Update [src/hazbot/engine/README.md](src/hazbot/engine/README.md) with the temporal-variable concept and how it replaces ambient state." This is a TODO, not a spec. "Update with the concept" can mean a paragraph, a section, a tutorial, a recipe — each has different scope.

The next contributor adding a temporal variable (say `zonesActivated` or `droughtChangeCount`) has to touch:
- A bridge-side declaration file (R14's pattern in [src/hazbot/wildfire/](src/hazbot/wildfire/))
- The Engine constructor wiring (R2)
- Any sim-prop's `temporalReads` if the new variable is consumed (R1a)
- Tests for the new variable's reducer (R18 shape)
- Optionally, the R18c fixture if behavior changes for the pinned scenario

This five-step recipe isn't documented anywhere; R19 just says "update README." The first-time contributor will reverse-engineer from `chartTabOpen`.

Options:
- (a) Tighten R19 to specify: README gains (i) a "Temporal Variables" concept section, (ii) a worked walkthrough referencing the R14 implementation, (iii) an "Adding a temporal variable" checklist with the five-step recipe.
- (b) Add a new R19a for the checklist specifically, leaving R19 for concept-level explanation.
- (c) Defer DX considerations to a follow-up — current contributors will manage by reading the code.

Suggest: (a). The spec already has the worked example (Technical Notes); pointing the README at it is cheap, and the five-step recipe is genuinely useful, not speculative.

---

#### RESOLVED: CLAUDE.md "Common commands" entry is mentioned but not specified
**Decision**: (a). Added R20a covering the CLAUDE.md entry. R18c's parenthetical updated from "out-of-scope for this PR's main diff" to "in-scope per R20a." One-line table addition, lands with the same PR, eliminates the doc inconsistency.
**Context**: R18c says "CLAUDE.md's 'Common commands' table gains an entry pointing to this command alongside the existing playbook-generator entry (out-of-scope for this PR's main diff but called out so the next maintainer doesn't have to re-derive the invocation)." But it's marked out-of-scope for the PR's main diff — meaning it might not happen in this PR. If it doesn't, the next maintainer DOES have to re-derive the invocation.

R20 covers `docs/hazbot-update-workflow.md`. R19 covers the engine README. Neither covers CLAUDE.md. The R18c parenthetical is the only place the CLAUDE.md update is mentioned, and it's labeled out-of-scope.

Options:
- (a) Pull the CLAUDE.md entry into-scope as a new R20a. Trivially small diff; lands with the same PR; satisfies R18c's stated intent.
- (b) Leave out-of-scope and add a checklist item somewhere ("after this PR lands, update CLAUDE.md").
- (c) Drop the CLAUDE.md mention entirely — the README is the canonical doc surface.

Suggest: (a). One-line addition to a table; saves the maintainer from running R18c-generator from memory.

---

### Cypress E2E Engineer

#### RESOLVED: Cypress impact audit missing (verified zero, but spec doesn't state it)
**Decision**: (a). Audit performed during this review and recorded in Technical Notes → "Engine plumbing constraints" as a new bullet: zero matches across `cypress/e2e/` for chart-tab / hazbot / sidebar / ambient surface; R10/R10b/R12/R15 have zero cypress impact; Jest covers the entire affected surface. Matches the existing audit-bullet pattern; preempts the "did you check cypress?" review question.
**Context**: The spec lists Jest unit and integration tests under R17/R18, but doesn't audit cypress. The project has a cypress suite ([cypress/e2e/](cypress/e2e/)) with four `*.cy.ts` files. Verified during this review: a grep of `ChartTab|chartTab|analysis|hazbot|sidebar|logEvent|ambient` across [cypress/e2e/](cypress/e2e/) returns zero matches — no cypress test exercises the chart-tab UI, the analysis engine, the sidebar, or the log payload.

This means R10/R10b/R12/R15 changes have zero cypress impact. But the *absence* of an audit invites the review question "did you check cypress?" — a question the spec elsewhere preempts via Technical Notes audit bullets (e.g., the `externalLog` audit, the `FactorVariableImpl.ambientStateKeys` audit). Consistency argues for stating the cypress audit result, even though it's a no-op.

Options:
- (a) Add a one-line audit bullet to Technical Notes → "Engine plumbing constraints": "Cypress audit: zero matches under [cypress/e2e/](cypress/e2e/) for chart-tab / hazbot / sidebar / ambient. No e2e test interacts with the affected surface — R10/R10b/R12/R15 have zero cypress impact."
- (b) Leave implicit — Jest coverage is what matters; cypress is orthogonal.
- (c) Defer until Phase 2 implementation, where running the cypress suite as a smoke check is part of the commit-greenness invariant.

Suggest: (a). Matches the spec's existing audit-bullet pattern; preempts the question; sets a precedent for future specs in this surface area.

---

### Architectural Symmetry Reviewer

#### RESOLVED: `impl-eval-throw` and `temporal-reducer-error` could be one variant
**Decision**: (c). Two variants kept (event-time context vs. reading-time context differ enough that separate variants render more cleanly than a single variant with conditional fields). R7 gains a "Considered-and-rejected" note describing the unified-`impl-throw`-with-discriminant alternative and the reason for rejection. A future reviewer seeing three impl categories and two error variants now has the rationale inline.
**Context**: The engine already has `impl-eval-throw` ([types.ts:84-87](src/hazbot/engine/types.ts#L84-L87)) covering throws from `FactorVariableImpl.compute` and `SimPropImpl.evaluate` — both impl-eval throws collapsed into one variant. R7 adds `temporal-reducer-error` as a *separate* variant for `TemporalVariableImpl.reduce` throws. The Bisect/Incident Response review (Round 3) justified the new variant by "consistency with `impl-eval-throw` is the strongest argument" — meaning the *catch-and-surface* behavior mirrors `impl-eval-throw`, but the *variant* is separate.

Three impl categories, two error variants for throws:
- Factor variables + sim-props: throws → `impl-eval-throw` (one variant, fields = impl name, reading context)
- Temporal variables: throws → `temporal-reducer-error` (new variant, fields = variable name, event context)

The asymmetry is justifiable — the *context* of a temporal reducer throw differs (event-time vs. reading-time). But "context differs" can also be solved by a discriminant inside one variant: `kind: "reducer" | "compute" | "evaluate"`. That would keep error variants symmetric with impl categories.

Options:
- (a) Keep two variants. Each has its own context fields; sidebar's `describeErrorContext` switches cleanly.
- (b) Collapse into one `impl-throw` variant with a `kind` discriminant. More uniform error model; slightly heavier discriminant in sidebar.
- (c) Note as a defensible asymmetry — accept it but flag in Technical Notes.

Suggest: (c). Two variants is the right call (separate sidebar render context is genuine value), but the spec should acknowledge the alternative considered. Otherwise a future reviewer sees three impl categories and two error variants and wonders why.

---

#### RESOLVED: `requiredDefaults` vs. `temporalReads` — parallel role, divergent naming
**Decision**: (c). No spec change. The two fields are parallel in role but reference different targets — `requiredDefaults` enumerates event-data keys (indexing `event.data`), `temporalReads` enumerates temporal-variable names (indexing `temporalValues`). Different referents argue for different names; synthetic uniformity would paper over the real distinction. R1a's existing "Parallel in spirit to `requiredDefaults`" clause already does the cross-reference work.
**Context**: The engine's reference-driven validation walk ([engine.ts:134](src/hazbot/engine/engine.ts#L134)) handles two kinds of impl-declared dependencies:
- `FactorVariableImpl.requiredDefaults` — event-data keys the impl reads from `event.data`
- (new) `FactorVariableImpl.temporalReads` and `SimPropImpl.temporalReads` — temporal-variable names the impl reads from `reading.temporalHistory`

These play parallel roles (declare what the impl reads, validate references at construction). But the names diverge:
- `requiredDefaults` — frames as "data with defaults this impl requires"
- `temporalReads` — frames as "temporal variables this impl reads"

A future contributor seeing both fields on the same impl ("why does one say `required` and the other say `reads`?") may wonder if they have different semantics. They don't — both are "declared reads for reference-driven validation."

Options:
- (a) Rename `temporalReads` → `requiredTemporals` for naming parity with `requiredDefaults`. Symmetry win; minor verb shift ("reads" → "requires").
- (b) Rename `requiredDefaults` → `eventDataReads` to match `temporalReads`. Larger blast radius (pre-existing field, more call sites).
- (c) Keep as-is and document the parallel in R1a's "matches `requiredDefaults`" clause (already done).

Suggest: (c) is the lowest-risk default — the spec already calls out the parallel. (a) is the cleanest naming but renames a new field rather than the established one — fine, but worth a deliberate choice. (b) is the cleanest naming but renames an established field, risking churn.

---

#### RESOLVED: Sidebar panel order — Temporal Variables below Sim Props, but Sim Props depend on temporals
**Decision**: (a). R16 amended — Temporal Variables panel sits *above* Sim Props, giving a dependency-direction top-to-bottom layout: Factor Variables → Temporal Variables → Sim Props → Readings. A validator's eye follows the chain (read the temporal value first, then the sim-prop consuming it via `temporalReads`). One-line JSX reorder; better matches the mental model the `· reads: <name>` hint already teaches.
**Context**: R16 says the Temporal Variables panel is "slotted between Sim Props and Readings." Visually: Factor Variables → Sim Props → Temporal Variables → Readings. But the dependency direction is the other way: a sim-prop with `temporalReads` *depends on* a temporal variable. A validator reading top-to-bottom sees the dependent (Sim Props with the `· reads: chartTabOpen` hint from R16) BEFORE seeing the dependency (Temporal Variables panel).

The existing order (Factor Variables → Sim Props) doesn't capture a similar dependency — factor variables and sim-props can independently reference event data, with no panel-to-panel dependency. Temporal Variables introduces the first cross-panel dependency.

Options:
- (a) Reorder: Factor Variables → Temporal Variables → Sim Props → Readings. Dependencies render top-down.
- (b) Keep R16's order. The `· reads: <name>` hint serves as the cross-reference; absolute panel order doesn't matter.
- (c) Add an explicit "Temporal Variables feed → Sim Props" visual indicator (an arrow, a dotted line). Heavy UX; probably overkill.

Suggest: (a). The reorder is one line of JSX in [sidebar.tsx](src/hazbot/engine/sidebar/sidebar.tsx), and the resulting layout better matches the mental model the spec is teaching. R16 should pin the order explicitly rather than implying "between Sim Props and Readings."

---
