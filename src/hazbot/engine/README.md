# Analysis engine substrate

Host-app-agnostic rule-matching engine. Today it lives in-tree under
`src/hazbot/engine/`; planned for extraction into its own npm package (see
[../TBD.md §8](../TBD.md#8-extracting-the-engine-into-its-own-library)).

## Where to look

- **Public API surface** — [index.ts](index.ts). Everything not re-exported
  here is substrate-internal.
- **Core types** — [types.ts](types.ts). `BaseReading`, `ConsumedEvent`,
  `RuleSet`, `Category`, `FactorVariableImpl`, `SimPropImpl`, `EngineError`.
- **Engine class** — [engine.ts](engine.ts). Construction, load-time
  validation, `consume()`, `subscribe` / `getSnapshot`.
- **DSL grammar** — [../dsl-grammar.md](../dsl-grammar.md). Auto-generated
  from the rule-set source sheet's README tab; the hand-written parser
  under [parser/](parser/) implements it.
- **Stability contract** — Req 20 in the spec covers semver policy. The
  "API baseline note" in
  [specs/WM-10-hazbot-analysis-engine/implementation.md](../../../specs/WM-10-hazbot-analysis-engine/implementation.md)
  covers field-by-field versioning rules for `FactorVariableImpl` /
  `SimPropImpl`.
- **Full requirements** —
  [specs/WM-10-hazbot-analysis-engine/requirements.md](../../../specs/WM-10-hazbot-analysis-engine/requirements.md).
- **Wildfire bridge** as a worked example —
  [../wildfire/](../wildfire/). Shows the `translate`, factor-variable, and
  sim-prop shapes a host app needs to provide.

## Boundary rules

[.eslintrc.js](.eslintrc.js) enforces that files in this directory cannot
import from anywhere outside it (no host-app coupling), cannot import
`mobx` / `mobx-react` (substrate is MobX-free), and cannot import
`react-dom` (substrate ships no DOM-mount code).

The optional debug sidebar lives at [sidebar/](sidebar/) and is exported
from its own entry path (`from "../engine/sidebar"`), not from this
barrel — see TBD §8 for the `package.json#exports` plan.

## Temporal Variables

A *temporal variable* is an engine-maintained projection that folds logged
state-change events into a value trail per reading. See
[WM-10 spec](../../../specs/WM-10-hazbot-temporal-variables/requirements.md)
for the full design.

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
   `chartTabOpen` in `src/hazbot/wildfire/temporal-variables.ts`). Pin V at
   the declaration site (e.g. `TemporalVariableImpl<boolean>`) so the
   reducer body gets narrow typing — the map type widens to `<unknown>` at
   storage by convention.
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

## Versioning

Substrate version: [version.ts](version.ts) (today `0.0.1`).

Host-app rules version: [../wildfire/rules-version.ts](../wildfire/rules-version.ts)
(today `1`). Bumped per the policy in
[docs/hazbot-update-workflow.md §7](../../../docs/hazbot-update-workflow.md#7-bump-app_rules_version).

---

When this directory is extracted into its own package, this file becomes
the package README — install instructions, minimal-usage example,
`ConsumedEvent` / `BaseReading` walkthrough, `useAnalysisEngine` hook,
sidebar subpath entry, and a `CHANGELOG.md` land then.
