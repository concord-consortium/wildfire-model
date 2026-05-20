# Hazbot — Temporal Variables (Replace Ambient State)

**Jira**: https://concord-consortium.atlassian.net/browse/WM-10

**Status**: **Closed**

## Overview

Replace the Hazbot engine's `ambientState` channel with a "temporal variable" construct: engine-maintained projections that fold logged state-change events into a value trail per reading. Impls read this trail directly — either as the final value during the reading's window, or as a sticky-OR over the window's appends.

The Hazbot analysis engine classifies student behavior from a log of user-facing events. The pre-refactor implementation let the host app stamp side-channel "ambient" data onto specific events (e.g. "was the chart tab open when the simulation started?"). This coupled the engine to the live app: an analyst couldn't replay a captured log file and get the same classifications, because the ambient fields weren't part of the public log. This work replaces that side channel with a first-class construct — *temporal variables* — declared in the wildfire bridge, fed by ordinary logged events, and projected by the engine itself. Logs become self-describing, the host app stops doing engine-side bookkeeping, and the construct generalizes to any future "what was X when Y happened?" rule.

The work also retired the engine's general-purpose **modifier** mechanism (`BaseReading.updates`, `ReadingUpdate`, `kind: "modifier"`, `orphan-modifier` validation, sidebar "N update(s)" label) — chart-tab events were its only emission site and `GraphOpen` its only consumer, so once a typed `temporalHistory` array handled that case the generic modifier channel was dead code.

The additions and removals landed in one bundled PR rather than sequential PRs; the two-mechanism interim state a split-PR plan would temporarily ship is exactly the architectural problem this work solved. Acceptable because the analysis engine is dev-only today — no production surface depends on engine output, and no captured production logs predate the change.

### The construct, in shape

- The wildfire bridge declares one or more **temporal variables**, each with a name, an initial value, `acceptedEvents`, and a `reduce(currentValue, event) → newValue` reducer.
- The engine maintains a live projected value per temporal variable. Every consumed event runs through the relevant reducers in declaration order.
- Each reading carries a grow-only `temporalHistory` array: at trigger time the engine seeds it with the current value of every declared variable (self-contained reading); between triggers each reducer-produced change appends a `TemporalVariableChange`. Impls read the trail directly — `currentTemporal(...)` for "final value during the window", `temporalHistory.some(...)` for "ever was value V" (sticky-OR).
- Validation: an impl declares `temporalReads` listing the variables it consumes; the engine validates references at construction time.

Concrete scope for this PR: the only existing ambient-state use was `GraphOpen` reading `chartTabOpenAtStart`. After the refactor, a temporal variable `chartTabOpen` (initial `false`) is driven by `ChartTabShown` (→ `true`) / `ChartTabHidden` (→ `false`), and `GraphOpen` became a sticky-OR over `temporalHistory`.

## Requirements

Each requirement is summarized here to its core contract.

### Engine-side construct

- **R1** — Define `TemporalVariableImpl<V>` (`name`, `initialValue: V`, `acceptedEvents: string[]`, `reduce(currentValue, event) → V`). `reduce` must be pure. Reducer dispatch for a single event is two-phase: phase 1 buffers all reducer outputs (no live mutation); phase 2 atomically commits `temporalValues` + `observed` flips + `temporalHistory` appends — only if phase 1 threw nothing. On reducer throw: catch, push a `temporal-reducer-error`, skip phase 2 entirely (no partial commit, no `translate()`, no trigger evaluation). Values must be JSON-safe; `undefined` is forbidden as initialValue/reducer-output/override; reducers must return immutable values.
- **R1a** — `FactorVariableImpl` and `SimPropImpl` gain optional `temporalReads?: string[]`. Validated at construction. Advisory only — nothing checks the impl body actually reads what it declares (matches `requiredDefaults`).
- **R2** — Temporal-variable impls are declared bridge-side and passed to `new Engine(...)` as a `Record<string, TemporalVariableImpl>`. Declaration = object insertion order, authoritative for dispatch/seed/append ordering. Names must be non-numeric identifiers. `new Engine(...)` also accepts an optional `initialTemporalValues?: Record<string, unknown>` override for replay tooling; when provided it must be exhaustive.
- **R3** — Engine maintains a live `temporalValues` map and a parallel sticky `observed` map (flips `true` on first successful reducer fire, in phase 2 only). `observed` is always initialized `false` regardless of `initialTemporalValues`.
- **R4** — Temporal-variable updates apply *before* trigger evaluation for the same event.
- **R5** — Each reading carries a grow-only `temporalHistory: TemporalVariableChange[]` where `TemporalVariableChange = { at, name, value, eventName }`.
- **R5a** — At trigger time the engine seeds the new reading's `temporalHistory` with one entry per declared variable (declaration order), capturing the live value; `eventName` = the trigger event.
- **R5b** — Between triggers, every event matching some variable's `acceptedEvents` appends a `TemporalVariableChange` to the current reading. Same-value outputs still append. If no reading exists, the live value still updates; the append is a no-op.
- **R5c** — Every `TemporalVariableChange.at` equals the consuming event's `at`.
- **R5d** — A standalone `currentTemporal<V>(reading, name): V | undefined` helper, exported from the substrate, returns the last value for a name. Sticky-OR is done by scanning the array directly.
- **R6** — The live `temporalValues` map and the `observed` map are exposed for the sidebar.

### Validation

- **R7** — Four new `EngineError` variants: `temporal-validation` (construction-time; impl's `temporalReads` names an undeclared variable), `temporal-reducer-error` (runtime; a `reduce()` threw), `trigger-state-change-overlap` (construction-time; an event appears in both a temporal variable's `acceptedEvents` and a factor variable's `logEvents`), `temporal-initial-values-mismatch` (construction-time; `initialTemporalValues` keys don't match declarations or a value's runtime type mismatches). Construction-time variants throw `EngineConstructionError` carrying `{ message, errors, ruleSetId }` — no engine instance is returned. The runtime variant is recorded into `engine.errors`.
- **R8** — `temporal-validation` is reference-driven; `trigger-state-change-overlap` and `temporal-initial-values-mismatch` are not.

### DSL / referencing

- **R9** — Direct DSL access to temporal variables is out of scope; impls remain the only consumers.

### Removing ambient state and the legacy modifier mechanism

- **R10** — Remove `ConsumedEvent.ambientState`, `ambientStateKeys` on both impl interfaces, the `ambient-validation` variant, and its validation path.
- **R10b** — Remove the legacy modifier mechanism wholesale: `BaseReading.updates`, `ReadingUpdate`, `kind: "modifier"`, the engine dispatch, `orphan-modifier`, the sidebar "N update(s)" label.
- **R11** — Remove `WildfireReading.ambientState`.
- **R12** — Remove the third `ambientState` parameter from `log.ts` and the corresponding host call in `bottom-bar.tsx`.
- **R13** — Convert `GraphOpen` to a sticky-OR scan of `reading.temporalHistory`.

### Wildfire-side temporal variable

- **R14** — Declare `chartTabOpen: boolean` — `initialValue: CHART_TAB_INITIAL_OPEN` (new `src/hazbot/wildfire/constants.ts`, value `false`, also imported by `right-panel.tsx` and `ui.ts`), `acceptedEvents: ["ChartTabShown", "ChartTabHidden"]`, `reduce` returns `event.name === "ChartTabShown"`.
- **R15** — `translate.ts` simplifies: `ChartTabShown`/`ChartTabHidden` translate uniformly as `no-op`; the `latestReading` dependency goes away.

### Sidebar

- **R16** — The dev sidebar gains a "Temporal Variables" panel above Sim Props, showing live values with observed/unobserved styling. Readings rows show a per-variable `name: value (N updates)` summary; the expanded view shows the full trail. Sim Props rows render a `· reads: <name>` hint. `describeErrorContext` + `renderError` gain cases for all four new variants.

### Tests

- **R17** — Existing ambient/modifier tests sorted into Convert / Delete / Add buckets.
- **R18** — New unit tests for construction, reducer invocation, validation, and `GraphOpen`/ruleset-25 integration.
- **R18a** — Replay-determinism two-engine test: identical opts + identical event stream → identical `readings`, `matchedCategory` history, `observed`, `temporalValues`.
- **R18b** — `GraphOpen` sticky-OR regression: all four corners (seed-only true, append-only true, both, neither).
- **R18c** — Replay regression fixture baseline: checked-in `events.json` + `expected.json` under `src/hazbot/wildfire/__fixtures__/`, generated by `scripts/generate-replay-fixture.js`, asserting strict equality on `readings`/`matchedCategory`/`observed`/`temporalValues`. The headline regression test.
- **R18d** — Reducer-throw contract test.
- **R18e** — Trigger/state-change overlap guard test.
- **R18f** — `initialTemporalValues` exhaustiveness + type-shape guard tests.

### Documentation

- **R19** — Engine README gains a "Temporal Variables" concept section, worked walkthrough, and "Adding a temporal variable" checklist.
- **R20** — `docs/hazbot-update-workflow.md` updated only if the per-ruleset workflow changes *(confirmed unaffected — temporal vars are bridge-side, not in generated rule-set modules)*.
- **R20a** — CLAUDE.md "Common commands" table gains a `node scripts/generate-replay-fixture.js` row.
- **R21** — The spreadsheet extraction scripts need no changes *(confirmed — temporal variables are bridge-side TS, not spreadsheet content)*.

## Technical Notes

### Worked example

For a rule set declaring `chartTabOpen: boolean` (initial `false`, sources `["ChartTabShown", "ChartTabHidden"]`), consuming `[A:trigger, ChartTabShown@t1, ChartTabHidden@t2, B:trigger]`:

```
readings[0]  // created at A
  temporalHistory: [
    {at: A.at, name: "chartTabOpen", value: false, eventName: "A"},              // R5a seed
    {at: t1,   name: "chartTabOpen", value: true,  eventName: "ChartTabShown"},  // R5b append
    {at: t2,   name: "chartTabOpen", value: false, eventName: "ChartTabHidden"}, // R5b append
  ]

readings[1]  // created at B
  temporalHistory: [
    {at: B.at, name: "chartTabOpen", value: false, eventName: "B"},              // R5a seed
  ]
```

- `currentTemporal<boolean>(readings[0], "chartTabOpen") → false` — final value in the window.
- `readings[0].temporalHistory.some(c => c.name === "chartTabOpen" && c.value === true) → true` — sticky-OR.

### Complexity

Per-event O(N declared variables); per-reading O(N seeds + K window state-changes); per-session O(triggers × N + total state-changes). Linear; no quadratic walks.

### Key audits (performed during spec authoring)

- `ambientState` was the only host-stamped event channel — `bottom-bar.tsx` was the sole `log()` call site passing a third argument.
- Removing the third `log()` arg has no external-schema impact — `log()` forwards only `(name, data)` to `externalLog`; the third arg was engine-internal.
- No `FactorVariableImpl` declared `ambientStateKeys` — all declarations were in `simProps` blocks.
- Zero Cypress impact — no e2e test exercises the chart-tab UI, the analysis engine, or the dev sidebar.

### Implementation sequencing

The work landed across 12 ordered steps (1, 1.5, 2–11) on branch `WM-10-add-analysis-engine`, each keeping `npm run lint` / `build` / `test` green at the step boundary. Internal sequencing was add-then-migrate-then-remove: new substrate types and engine wiring first, consumers migrated, then ambient-state + modifier surface deleted last (Step 9).

## Out of Scope

- **Direct DSL access to temporal variables** — expressions continue to reference factor variables and sim-props only.
- **Temporal variables in the auto-generated rule-set modules** — they live in the wildfire bridge.
- **Multi-domain temporal variables** — the wildfire bridge is the only consumer.
- **Replay loader tooling** — `initialTemporalValues` structurally supports replay, but the loader extracting captured-session initial state from raw log data is deferred to a follow-up spec.
- **Ship-readiness work** — when the engine ships, a separate spec handles captured-log migration, external error surfaces for `temporal-validation`/`temporal-reducer-error`, broader R18c fixture coverage, and re-evaluation of the bridge-side singleton bypass.
- **Persisting temporal state across page reloads** — each engine starts fresh from `initialValue`s.
- **Performance tuning** beyond what correctness needs.
- **Behavior for events that are both a state-change and a trigger** — rejected at construction via `trigger-state-change-overlap`; a future spec pinning the semantics would drop the guard.
