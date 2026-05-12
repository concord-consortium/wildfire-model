# Hazbot: In-memory Analysis Engine + Debug Sidebar

**Jira**: [WM-10](https://concord-consortium.atlassian.net/browse/WM-10)
**Repo**: https://github.com/concord-consortium/wildfire-model
**Implementation Spec**: [implementation.md](implementation.md)
**Status**: **In Development**

## Overview

Build a future-extractable, MobX-free analysis-engine substrate under `src/hazbot/engine/` plus a thin wildfire-specific bridge that maps the existing simulation log stream onto the engine's input contract, and ship a developer-only debug sidebar that surfaces the engine's evaluation in real time. No student-facing UI and no persistence — this is the validation slice that proves the rubrics actually match student behavior before the next iteration commits to a Firebase/LARA persistence schema (AP-73) and the student-facing button + popover (WM-6).

## Project Owner Overview

The Hazbot feature gives Wildfire students behavior-based feedback while they work — for example, gently nudging a student who has not yet placed a spark in each zone. Sam G has authored 8 active rule sets in a Google Sheet (one tab per activity-page combination), each with 5–6 categories that fire based on a small pseudo-code DSL evaluated against the existing simulation log stream. Before we wire those rubrics into a student-facing affordance or persist their state across sessions, we need to prove the rubrics actually match the behavior we see in production logs.

This story delivers the validation slice in three pieces: a self-contained analysis-engine substrate (positioned for future extraction into a standalone library so other Concord simulations can adopt the same DSL + matching pipeline), a wildfire-specific bridge that translates wildfire-model log events into the engine's input contract and supplies the factor-variable / sim-prop implementations the rule sets reference, and a developer-only debug sidebar that lets Sam and the PM watch the engine evaluate live — confirming "given what the student just did, the right category fires" before any student-facing UI commits to it. The substrate's design choices (load-time validation that fails loudly, append-only state for replay-friendliness, render-path purity for React contract correctness) are calibrated for the WM-10 validation pass while leaving a clean handoff to AP-73's persistence and WM-6's student-facing surface.

## Background

The Wildfire Model already emits a rich log stream (33 events documented in [LOGGED-EVENTS.md](../../LOGGED-EVENTS.md), shipped in WM-1). The Hazbot feedback rubric is a set of 5–6-row tables — one per activity page — authored by Sam G. in a Google Sheet ([source][sheet]). Each row defines a category number, a student-facing feedback message, and a pseudo-code expression like `setDroughtLevel AND NOT usedOneSparkPerZone` that decides whether that category fires.

The categories are evaluated highest-first; the first one whose expression evaluates to `true` is the matched category, and once a category matches, the engine should never regress to a lower one as new events arrive. **The on-disk `categories: Category[]` array is stored lowest-to-highest by `id` (matching sheet reading order); the matching evaluator iterates in reverse so the first true expression encountered is the highest-numbered match.** The acceptance-criteria test shape (c) — "a state where multiple categories' expressions are simultaneously true and the engine selects the highest" — directly verifies this contract.

The pseudo-code uses a small DSL defined in the sheet's `README` tab. Key concepts:

- **Factor variables** (lowercase camelCase, e.g. `ranSimulation`, `setDroughtLevel`) — booleans, Sets, or arrays computed by aggregating log events.
- **Simulation properties** (UpperCamelCase, e.g. `OneSparkPerZone`, `UniqueVegetationPerZone`, `UniformDroughtLevels`) — properties of a single simulation run, evaluated on demand against a particular run captured by `WITH`.
- **Operators**: `AND`, `OR`, `NOT`, `WITH`, plus comparison operators `>`, `<`, `==`, `!=`, `>=`, `<=`. `.size` (Set) and `.length` (array) accessors. **Precedence (highest → lowest)**: `WITH` (per README PRECEDENCE rule i — `<var-w-prop-expression>` parses as a unit before any logical operator applies) → parens `( ... )` → `.size` / `.length` and comparison operators → `NOT` → `AND` → `OR`. Authors can always override precedence with parens.
- **Event-data paths**: `SimulationStarted->zones.<i>.terrainType` denotes "for some index `i`, the value at `zones[i].terrainType` of a `SimulationStarted` event payload."
- **WITH semantics** (load-bearing — see the README tab): `WITH` is greedy. `varName WITH propExpr` parses `propExpr` as the longest possible expression made entirely of simulation properties and operators between them. So `ranSimulation WITH UniqueVegetationPerZone AND NOT UniformDroughtLevels` parses as `ranSimulation WITH (UniqueVegetationPerZone AND NOT UniformDroughtLevels)` — i.e., one simulation run satisfies both prop conditions simultaneously. By contrast, `ranSimulation WITH UniqueVegetationPerZone AND ranSimulation WITH NOT UniformDroughtLevels` parses as two separate `WITH`-bound expressions joined by `AND`, since `ranSimulation` (lowercase) breaks the prop-expression run.

The author's spreadsheet currently defines 8 active rule sets (tabs `23`, `24`, `25`, `32`, `33`, `34`, `35`, `54`) plus three placeholder tabs (`43`, `45`, `47`) marked "TBD (activity revision)." The tab name encodes activity number + page (e.g. `23` = Activity 2, Page 3). The URL parameter `?hazbotRules=<tab>` selects which rule set the engine loads.

[sheet]: https://docs.google.com/spreadsheets/d/1AUfg2Gg3J0eusldNMecmRtbAGvecTjLviTd19FA6bT0/edit

## Requirements

### Engine

1. **Self-contained engine substrate under `src/hazbot/engine/`.** The substrate ships as a future-extractable library that any simulation can consume; it bundles four concerns:
   - **Engine core** — parser, evaluator, error types, generic `Engine<TReading, TDefaults>` class, substrate-level interfaces, and the engine's `subscribe(listener)` API.
   - **React integration** — `AnalysisEngineProvider<TReading, TDefaults>` context, `useAnalysisEngine<TReading, TDefaults>()` hook.
   - **Debug sidebar UI** — generic React components that render `engine.readings`, `engine.errors`, factor-variable values, and per-category truth-coloring purely from the engine's typed accessors. The sidebar makes no assumption about the app's `TReading` payload shape (it pretty-prints unknown payload fields generically — see Req 17 / Tech Notes' "Generic payload rendering").
   - **Sidebar styling** — substrate-owned **plain CSS** file(s), imported directly from the substrate's React components (e.g. `import "./sidebar.css"`). No SCSS, no CSS-in-JS, no runtime `<style>` injection. Pure CSS keeps the substrate consumable by any bundler with no preprocessing requirement, simplifies eventual library publication, and matches log-monitor's "ship plain styles" posture without log-monitor's runtime-injection mechanism (see Req 17's styling note).

   The substrate has **no imports from wildfire-model state/store/UI, no imports from `src/log.ts`, and no MobX dependency** (neither `mobx` nor `mobx-react`). Reactivity comes from the engine's `subscribe(listener)` API consumed by the hook via React's `useSyncExternalStore`. The substrate's only runtime peer dependency is `react` (`>= 18.0.0` for `useSyncExternalStore`). No `react-dom` dep — the substrate uses standard React APIs only and ships no `createPortal` / DOM-specific functionality, matching log-monitor's peer-dep posture. Future extraction into a standalone npm package is a directory move with no type changes — the substrate is extraction-ready as it lands.

   Wildfire-specific code (the `WildfireReading` declaration, concrete factor-variable implementations, the trigger→Reading `translate` callback, the `APP_RULES_VERSION` constant, the engine-singleton factory that mounts the Provider into the app tree, the `AnalysisEngineActivated` log emitter) lives in a wildfire-bridge layer outside the substrate; that bridge imports freely from `src/log.ts` and from the substrate, and is wildfire-only — it stays in this repo when the substrate is extracted. See Tech Notes' "Library scope and the Reading boundary" for the type-level boundary.
2. **In-memory only.** No persistence; engine state resets on page refresh. This is a WM-10 scope decision, not a permanent design commitment — AP-73 adds persistence (Firebase + LARA) to support cross-visit one-way ratcheting per the resolved OQ "Does monotonicity carry across student visits?" (Option A).
3. **Inputs.** The engine consumes the following log events from `src/log.ts`:
   - `SimulationStarted` (with full config + zones + sparks + wind payload — already shipped in WM-1)
   - `SimulationEnded`, `SimulationStopped`, `SimulationRestarted`, `SimulationReloaded`
   - `ChartTabShown`, `ChartTabHidden`

   `TopBarReloadButtonClicked` triggers a full page reload (see [src/components/top-bar/top-bar.tsx:28](../../src/components/top-bar/top-bar.tsx#L28)) — the engine is destroyed and re-booted from scratch on the next page load, so the engine has no behavior wired to the event itself.

3a. **Optional `ambientState` parameter on `log()`.** The `log()` wrapper in [src/log.ts](../../src/log.ts) gains a third optional parameter for data the engine needs but the public LARA log payload should not carry. Public payload (arg 2) goes to LARA unchanged; `ambientState` (arg 3) is forwarded only to the Hazbot engine. This lets call sites pass ambient app state to the engine without polluting the LARA event payload.

   ```ts
   // existing usage continues to work
   log("SimulationEnded", { reason, outcome });

   // new usage with engine-only context
   log("SimulationStarted", configSnapshot, { chartTabOpenAtStart: chartStore.tabOpen });
   ```

   Initial use case: `SimulationStarted` includes `ambientState: { chartTabOpenAtStart: boolean }` so the engine knows the chart-tab state at run-start without having to track it itself.

3b. **Ambient state validation at trigger time.** Both factor-variable implementations and sim-prop implementations (hand-written TS, per Reqs 14 and 5) declare the `ambientState` keys they read via an `ambientStateKeys: { [triggerEventType: string]: string[] }` field on each impl's exported entry — see "Factor-variable implementation interface" and "Sim-prop implementation interface" in Tech Notes for the parallel shapes. Declarations are code-authored, not sheet-authored — ambient state is an engine mechanism, not a rubric concept; the sheet stays focused on behavioral specs (the factor variable / sim-prop's Details column). When the engine loads a rule set, the reference-driven validation walk (Req 11a) AST-walks category expressions to collect referenced factor-variable and sim-prop names, looks up each corresponding implementation, and unions the declared keys per trigger event type across both registries. **Sim-props' ambient declarations are validated alongside factor variables' (Finding 14)**: a sim-prop like `GraphOpen` that reads `r.ambientState?.chartTabOpenAtStart` declares `{ SimulationStarted: ["chartTabOpenAtStart"] }` and the substrate enforces the declaration at trigger time — without this, a forgotten call-site update would silently make the sim-prop evaluate false, undermining the "fail loudly" goal. At trigger time, the engine checks the incoming event's `ambientState` for those keys; if any are missing, it appends an `{ kind: "ambient-validation", ... }` entry to `errors` (and `console.error`s in parallel) naming the rule set, the trigger event, the factor variable, and the missing key. **No Reading is appended for the failed trigger.** Modifier events (`ChartTabShown`, `ChartTabHidden`) that arrive before the next successful trigger are dropped and recorded as `{ kind: "orphan-modifier", reason: "prior-trigger-failed", ... }` errors — they do **not** attach to a prior-run Reading and pollute its `updates` array. (The same `orphan-modifier` mechanism handles the bootstrap case: modifier events arriving before any trigger ever fires are dropped with `reason: "no-prior-trigger"`.) See Tech Notes' "Orphan modifiers" paragraph for the timestamp-based detection rule that distinguishes orphans from legitimate modifiers in the presence of unrelated `errors` entries (stub warnings, factor-eval throws, etc.). This guarantees that a forgotten call-site update fails loudly at the next trigger rather than silently miscategorizing, and that the loud-failure window cleanly contains its blast radius.

   **Error cardinality.** One `ambient-validation` error is emitted per (`implName`, `missingKey`) pair — the error variant's singular `implName: string` and `missingKey: string` fields encode this contract structurally. If 2 impls (factor variables or sim-props) each declare 3 missing keys, 6 entries are appended in a single `consume()` call (still one notify per the SE-14 atomicity rule, since they all happen within the same call). If `ambientState` is undefined entirely (call site forgot to pass it), the engine treats every declared key for the trigger event type as missing and emits one error per declared (implName, key) — same cardinality rule. All errors emitted for one rejected trigger share the same `ConsumedEvent` reference in their `event` field; the trigger fires zero readings (per the "No Reading is appended for the failed trigger" rule above). Tested directly: a fixture with 2 impls × 2 missing keys produces exactly 4 `ambient-validation` entries, all carrying the same `event` reference, and `readings.length` is unchanged.
4. **Factor variables.** Factor variables are values *derived* from the readings substrate (per Tech Notes' "Engine state: two append-only substrate logs" and the `FactorVariableImpl.compute` interface in "Factor-variable implementation interface") — there is no separate mutable factor-variable state object. Factor variable value types include:
   - `boolean` (e.g. `ranSimulation`, `setDroughtLevel`)
   - `Set` with `.size` accessor (e.g. `uniqueWindValuesUsed`)
   - `array` with `.length` accessor (e.g. `simulationRuns`)
5. **Simulation properties.** Simulation properties (UpperCamelCase, e.g. `OneSparkPerZone`, `UniqueVegetationPerZone`, `UniformDroughtLevels`, `UniformTerrainTypes`, `ForestWAWOSuppression`, `TwoSparks`, `GraphOpen`) are evaluated against a specific simulation run held by a factor variable through `WITH`. They are TypeScript predicates over the run's payload.
6. **Stub factor variables / sim props.** Two are stubbed in this story (return `false`):
   - `SparksAtTopAndBottom` — needs ridge/valley detection on the topography (out of scope; new algorithm).
   - `sawIntenseFire` — needs an `outcome` flag on `SimulationEnded`/`SimulationStopped` (out of scope; new logging).

   Each stub emits a "not yet implemented" `console.warn` **once per session** at engine-construction time, immediately after rule-set load + validation succeed. The engine appends a `{ kind: "stub-warning", stubName, at }` entry to `errors` per referenced stub. Stubs not referenced by the loaded rule set's expressions don't warn. The single emission point removes any need for runtime dedup state — load runs once, warnings emit once. If load-time validation fails (Reqs 10, 11a, 3b, 13), no stub warnings are emitted — the engine is inactive and stubs are unreachable. Rule sets that depend on these stubs evaluate categories `1..N-1` correctly; only the success category is unreachable.
7. **Monotonicity.** As new events arrive, the matched category may only stay the same or increase; it can never regress. Within WM-10 this means within-page-load monotonicity (automatic from Req 2's no-persistence stance). The broader pedagogical intent is one-way ratcheting *across visits* (Option A in the resolved OQ "Does monotonicity carry across student visits?") — once a student earns category N on an activity page, the engine never falls back below N even after a page reload or a later session. AP-73 picks this up by persisting the matched-category floor and seeding it on engine boot.
8. **Readings substrate.** The engine maintains a chronological array of `Reading` objects, one per trigger event the engine consumes. A `Reading` is the engine's view of the simulation state at the moment that trigger fired — extracted/derived attributes from the trigger payload, a timestamp `at`, and an `updates: ReadingUpdate[]` array. The latest reading (`readings.at(-1)`) represents the current state; aggregates (`uniqueWindValuesUsed`, `simulationRuns.length`, etc.) and N-successive-event comparisons are derived by walking back through the array. Non-trigger events that affect derived per-trigger sim-props (e.g. `ChartTabShown`/`ChartTabHidden`, which feed the derived `GraphOpen` predicate) **append a `ReadingUpdate` entry** of shape `{ at, source, value }` to the latest reading's `updates` array rather than overwriting a field. The substrate makes no claim about how `updates` collapse into a per-Reading value — that aggregation is defined per simulation property (see Tech Notes' "Reading shape"). For example, `GraphOpen` aggregates as monotone "was ever opened" — a subsequent `ChartTabHidden` does **not** undo it; future sim-props that want "latest update wins" semantics define their own aggregator. The full history of changes — and their timestamps — remains queryable for debugging, duration analysis, and rules with non-monotone semantics. This single substrate covers what the README tab calls "range 1," "range 2," and all-runs aggregates without needing separate machinery for each.
9. **Active rule set selection.** Selected via URL param `?hazbotRules=<id>`. The param is added to `ISimulationConfig` in [src/config.ts](../../src/config.ts) so `getUrlConfig()` picks it up, following the existing `?preset=foo` and `?logMonitor=true` patterns. Default value: `undefined` (engine inactive).
10. **Missing or invalid rule-set id.** Raises a dev-time error: appends a `{ kind: "load-failure", ... }` entry to `errors` and `console.error`s in parallel; the engine constructor never throws. Engine is set to inactive — `engine.isActive: boolean` is derived as "no `load-failure` and no `parse-error` in `errors`" — and `engine.consume()` becomes a no-op. The sidebar (if open) reads the load error directly from `errors`. The engine is "active" (consumes events, produces readings, drives the sidebar) iff `?hazbotRules` is set, the id resolves to a known rule set, and load-time validation (Reqs 11a, 3b) passes. Otherwise the engine is inactive: it consumes nothing, the wrapper's engine-fork is a no-op, and the sidebar (if open) shows the load error. When the wildfire-bridge mounts the Provider (per Req 19's mount truth table — at least one of `?hazbotRules` or `?hazbotSidebar` is set), the engine is constructed **unconditionally**: the bridge passes `ruleSet: undefined` to the constructor when `?hazbotRules` is unset or its id does not resolve, alongside `requestedRuleSetId` populated from the raw URL-param value (or undefined when the param itself is unset). The constructor records `{ kind: "load-failure", reason: "missing-rule-set", ruleSetId: requestedRuleSetId, ... }` (`ruleSetId` is omitted when the URL param is unset entirely; populated from `requestedRuleSetId` when the param was set but didn't resolve) and stays inactive. The bridge does not branch on "engine vs. no engine" within the mounted path — once the mount condition is met, it constructs unconditionally and branches on `engine.isActive`. When neither URL flag is set, the bridge skips construction entirely per FE-4's zero-cost path — no engine instance exists and `getAnalysisEngine()` returns undefined (see Tech Notes' "Hooking the engine into the existing log stream" for the log-wrapper interaction). The sidebar (Req 17) reads `engine.ruleSet?.id ?? engine.requestedRuleSetId ?? "(none)"` so the failed-id case still renders the attempted id.

### Rule Sets as Data + DSL Parser

11. **Rule sets as generated TypeScript modules.** Each rule set is a generated TypeScript file at `src/hazbot/rule-sets/<id>.ts` produced from the Google Sheet by `scripts/extract-hazbot-sheets.js`. Each file exports a typed `RuleSet<WildfireDefaults>` object — `RuleSet<TDefaults>` is a substrate-owned generic; `WildfireDefaults` is wildfire-bridge-owned (per Tech Notes' "Library scope and the Reading boundary"). An `index.ts` exports a `ruleSets: Record<string, RuleSet<WildfireDefaults>>` map keyed by tab id. Re-running the extraction script after a sheet edit regenerates the modules; no hand-editing of the on-disk files. Each generated file starts with an auto-generated header on its first line. For `.ts` files: `// AUTO-GENERATED — DO NOT EDIT — re-run scripts/extract-hazbot-sheets.js`. For `dsl-grammar.md`: a leading blockquote `> **AUTO-GENERATED — DO NOT EDIT — re-run \`scripts/extract-hazbot-sheets.js\`**` followed by a blank line. The blockquote renders prominently in GitHub's markdown preview (HTML comments would be invisible there, defeating the warning's human-facing purpose). A CI assertion (per Acceptance Criteria) verifies the header survives so accidental hand-edits surface in PR review. Compile-time type checking ensures the column-to-field mapping stays consistent — if the sheet format adds/renames a column and the extraction script or `RuleSet` interface aren't updated, `tsc` errors at build time. Note: DSL expression strings remain opaque to the compiler — the DSL parser must still validate identifier references at parse time and surface typos as errors. The extraction script also dumps the sheet's `README` tab to `src/hazbot/dsl-grammar.md` so the DSL grammar definition is versioned in-repo. Re-running the script updates both the rule-set modules and the grammar snapshot; PR diffs surface any grammar changes alongside rule-set changes.

11a. **Default-value validation at load.** Several factor variables (`setTerrainType`, `setVegetation`, `setDroughtLevel`, `setWind`, etc.) compare a run's value against a default to decide whether the student "set" that variable. The default values per zone (terrain, vegetation, drought) and globally (wind speed/direction) come from the rule-set author. Tabs 23 and 24 ship explicit defaults; tabs 32, 33, 34, 35 currently mark them "TBD (activity revision)." When the engine loads a rule set, it performs a **reference-driven load-time validation walk**: first it AST-walks every category's parsed expression to collect the set of *referenced* factor-variable names (lowercase identifiers) and sim-prop names (UpperCamelCase identifiers); then for each referenced name it looks up the corresponding implementation (factor variable in `factorVariables` opt, sim-prop in `simProps` opt — Finding 14), unions every referenced impl's `requiredDefaults` paths, and asserts each path resolves on the rule set's `defaults` (parsed from the Details column by the extraction script). Walking only referenced names — not all defs declared on the rule set — avoids over-strict failures from unused factor variables that declare ambient/defaults needs unrelated to any active category (Finding 15); a tab that declares `setWind` but never references it in any category expression does not block on missing wind defaults. Any missing path raises a dev-time error (appends a `{ kind: "load-failure", reason: "missing-defaults", ... }` to `errors` + `console.error`s naming the rule set, the impl name (factor variable or sim-prop), and the missing path; engine inactive) and the rule set is not evaluated. **The rule set's structural data is retained on `engine.ruleSet`** per the same "deactivated, not discarded" framing as parse-error rejection (Req 13 / Finding 5) — the sidebar can still render the rubric structurally so Sam sees categories + feedback text alongside the missing-defaults banner. Only `missing-rule-set` (Req 10) leaves `engine.ruleSet` undefined. **Tabs 32–35 are effectively gated from the engine until Sam fills in the defaults at source.** The substrate's `RuleSet<TDefaults>` carries `defaults: TDefaults` — the substrate is shape-erased and validates by string-path traversal (per Tech Notes' "`requiredDefaults` path syntax"); the wildfire-bridge layer concretizes `TDefaults` as `WildfireDefaults` for compile-time type checking at the rule-set-author boundary. The per-impl `requiredDefaults` declaration is the source of truth for which paths are required.

   **Missing-impl detection.** The same reference-driven walk asserts that every referenced factor-variable name resolves to a `FactorVariableImpl` and every referenced sim-prop name resolves to a `SimPropImpl`. If a referenced name has no matching impl in its corresponding registry, the engine appends a `{ kind: "load-failure", reason: "missing-impl", ruleSetId, detail: "<name> has no impl", at }` entry to `errors` (and `console.error`s in parallel; engine inactive) and the rule set is rejected — but `engine.ruleSet` is **retained for sidebar display** per the same "deactivated, not discarded" framing as parse-error and missing-defaults rejection (Req 13 / Finding 5). Mechanism is consolidated with `requiredDefaults` and `ambientStateKeys` validation (Req 3b) in a single load-time walk so all three failure modes surface together rather than serially — an implementer should not see "missing defaults" only to fix that and then discover "missing impl" on the next load. Detection is load-time, not evaluation-time, so a rule set with an authored-but-not-implemented factor variable or sim-prop fails loudly at startup rather than partway through a student's session.
12. **DSL parser** at runtime evaluates rule expressions against current factor-variable state plus the simulation runs captured for `WITH`. The parser handles every operator listed in the README tab:
    - Logical: `AND`, `OR`, `NOT`, `WITH`
    - Comparison: `>`, `<`, `==`, `!=`, `>=`, `<=`
    - Accessors: `.size` (Set), `.length` (array)
    - **Parentheses `( ... )` for grouping** — accepted anywhere a sub-expression is valid, including:
      - Required cases per the README tab's Note 2 (e.g. `NOT (uniqueWindValuesUsed.size > 1)` in tab 24, where `NOT` applied to a binary expression requires parens).
      - Optional cases for author clarity (e.g. authors may write `(ranSimulation WITH UniqueVegetationPerZone) AND (ranSimulation WITH NOT UniformDroughtLevels)` even though the second `WITH`'s `ranSimulation` already terminates the first prop expression per the greedy rule).
      - Parens override the WITH-greedy rule. Inside `WITH (...)`, the parenthesized expression delimits the prop-expression; tokens outside the closing paren are not consumed by `WITH`. Outside `WITH`, parens behave as standard grouping.
    - Event-data paths: `Event->prop.<i>.subprop` (handled inside factor-variable computations rather than the DSL parser; see Technical Notes)

    Comparison operators (`>`, `<`, `==`, `!=`, `>=`, `<=`) require numeric operand *forms* on both sides — `.size` (Set accessor), `.length` (array accessor), or numeric literal. Operand-form validation is syntactic, not type-based: the parser does not know factor-variable runtime types (the rule-set metadata has no type field — see `FactorVariableDef` in Tech Notes' "Rule-set TypeScript shape"). A bare identifier, parenthesized logical expression, or string literal on either side of a comparison is a parse error; the error names the offending *form* (e.g., "expected `.size` / `.length` / numeric literal; got bare identifier `ranSimulation` on LHS"). Runtime type errors (e.g., evaluating `someBoolean.size` because an impl returned a boolean where the rule set's author expected a Set) surface separately as `impl-eval-throw` errors at evaluation time. Widening to other operand forms is deferred until a rule set actually requires it.

    **Numeric literal grammar.** Numeric literals supported by the parser are non-negative decimal integers matching `/^\d+$/` — e.g., `0`, `1`, `42`. Floating-point (`1.5`), negative (`-1`), hex (`0xff`), and scientific (`1e3`) literals are not yet supported — they're parse errors with a form-mismatch message naming the offending literal (e.g., "expected non-negative decimal integer; got `1.5`"). Widening to additional numeric forms is deferred until a rule set requires it. Pragmatic basis for the choice: every comparison literal in the current rule sets (tabs 23–35) is a small non-negative integer (`0`, `1`, `2`, `3`); committing to a wider grammar today would design for needs the source data does not yet have.

    Sim-props (UpperCamelCase identifiers) are valid only inside a `WITH` prop-expression. A bare sim-prop appearing at the top level (e.g., `OneSparkPerZone AND ranSimulation`) is a parse error; the parser names the offending identifier and points to the missing `WITH` binding.

    Each category's expression is parsed once at rule-set load and the resulting AST is cached on the in-memory rule set; the matching evaluator (Req 7) and the non-short-circuiting leaf evaluator (Tech Notes' "Factor-variable implementation interface") both consume cached ASTs. Parser failures at load reject the rule set per Req 13; runtime evaluation never re-parses. This is the assumption the sidebar render-cost bound (Tech Notes' "Sidebar render cost," O(C × L × N)) rests on.
13. **Parser has its own unit-test suite.** Tests cover every construct: each operator, precedence rules from the README tab, parenthesization (required and optional), the `WITH` greedy-binding rule, parens overriding WITH-greedy, comparison operators against `.size` / `.length`, error cases (unknown identifier, malformed expression, unbalanced parens). Parser errors include the source expression, the offending token (or token span), and a column/offset indicator. They surface via `console.error`, in the engine errors panel (Req 17), and inline in the sidebar's per-category display with the offending portion highlighted in the rendered expression. If any category's expression in a loaded rule set fails to parse, the engine is **deactivated** (`engine.isActive` becomes false; evaluation never runs) per the "fail loudly" pattern (Reqs 10, 11a, 3b). The rule set's structural data (id, categories array, feedback text, expression strings, factor-variable defs, defaults) **is retained on `engine.ruleSet`** so the sidebar can render the rubric — "rejected" in the load-failure sense means rejected for evaluation, not discarded from memory. For each parse-erroring category, the AST cache slot is left unset (or filled with a `{ kind: "parse-error" }` sentinel — implementer's choice); the parse error itself is appended to `engine.errors` as a `parse-error` variant carrying `categoryId`, `expression`, `tokenSpan`, and `offendingToken` for inline highlighting in the sidebar's per-category display. The sidebar renders the static rule-set structure (categories, feedback text, expression strings) with the parse-erroring category prominently marked; leaves are not color-coded (no truth values without evaluation).
14. **Factor-variable computations stay as TypeScript code.** They are the primitives the DSL parser references. The parser/evaluator bridges data (rule expressions) and code (factor computations).

### Debug Sidebar

15. **Sidebar component lives in the substrate at `src/hazbot/engine/sidebar/`.** Substrate-owned per Req 1 — the sidebar ships with the future-extractable library so any simulation that adopts the engine inherits the same debug UI. It is generic over `<TReading, TDefaults>`: it reads only through `useAnalysisEngine()` (Req 19) and the engine's typed accessors (`engine.readings`, `engine.errors`, `engine.factorVariables`, `engine.ruleSet`, `engine.sessionId`, `engine.requestedRuleSetId`, `engine.isActive`); it makes no assumption about the app-specific payload shape on `TReading` (see Req 17's "Generic payload rendering" sub-bullet for how unknown fields are displayed). Separate from the existing `?logMonitor` sidebar — different audience (PM/researcher confirming rubric correctness, not raw log inspection), different content. **Separation of concerns**: raw event/log view is `?logMonitor`'s job; the Hazbot sidebar shows only engine-derived state (readings, factor variables, categories, errors). Users who need both views open both sidebars side-by-side (Req 18). The wildfire-bridge mounts the substrate sidebar — it does not implement its own.
16. **Toggleable via URL flag `?hazbotSidebar=true`.** The flag is honored in all builds (dev and production) so the sidebar remains available for debugging live student activities. Off by default; off-state adds no student-facing UI and does not render the sidebar. **Engine activation is governed independently by Reqs 9/10** — the engine runs when `?hazbotRules` resolves, regardless of the sidebar flag — so a developer can collect data via `console.error` / `console.warn` and devtools inspection of `engine.readings` / `engine.errors` even without rendering the sidebar. See SEC-2 in Self-Review for the deliberate-decision rationale.
17. **Sidebar displays:** All sidebar content reads off the engine's exposed accessors via the `useAnalysisEngine()` hook (Req 19). The sidebar is generic over `<TReading, TDefaults>` — see "Generic payload rendering" below.
    - **Active rule set id** — `engine.ruleSet?.id ?? engine.requestedRuleSetId ?? "(none)"`. Tries the loaded rule set's id first, falls back to the attempted-but-unresolved id (so the sidebar shows what was asked for in the missing/invalid-id failure mode), falls back to a placeholder when the URL param is unset.
    - **Factor variable state** — variable name, type, current value rendered generically per the value's runtime kind (boolean → `true` / `false`; `Set` → `{a, b, c}` formatted display; array → `[a, b, c]`; other types → JSON-pretty-print). Each entry is click-expandable to show provenance: the specific readings that contributed to its current value (e.g., for a Set-typed factor variable, the readings whose values make up the set; for a boolean, the readings that triggered the boolean true). Provenance comes from `FactorVariableImpl.compute(readings).witnesses`.
    - **Sim-prop state.** A separate panel listing each registered `SimPropImpl` alphabetically by name with its current evaluated value. Sim-props evaluate **per reading** (unlike factor variables which compute over all readings), so the panel evaluates each sim-prop against the latest run-start reading — `engine.latestRunStartReading`, exposed as a public getter that walks `engine.readings` backwards looking for the first entry whose `triggeredBy` matches a configured `runStartTrigger`. When no run-start reading exists yet, every sim-prop displays `n/a` with an explanatory tooltip ("Sim-props evaluate per-reading; no run-start reading has been recorded yet, so this value is undefined."). Values are rendered as plain text (`true` / `false`) without truth coloring — coloring is reserved for sim-prop *leaves inside a WITH category expression* (per the WITH binding detail sub-bullet below), where the leaf's truth contributes to a visible AND/OR/NOT structure. In the Sim Props panel each entry stands alone, so coloring would add visual noise without information.
    - **Readings panel** — list of readings produced by the engine, rendered **newest-first** for scan ergonomics (the underlying `engine.readings` array stays chronological / append-only; the reversal is presentation-only). Each row's collapsed display shows a triangle toggle (▸/▾), a **1-based chronological index prefix** (`N:`, where `1` is the oldest reading and the displayed number stays attached to the same reading regardless of newest-first ordering), the `triggeredBy` event name, and the `updates` array length (e.g. `▸ 1: SimulationStarted · 0 update(s)`); the per-reading `at` timestamp is omitted from the collapsed row to reduce visual noise. Click the row to expand it; the expanded form shows a JSON-pretty-print of the reading object with `sessionId` stripped (internal-only debug-tool noise; per Req 128's framing). The 1-based index is what a WITH leaf's `Matched on reading #N` line references — a developer can locate the bound reading directly by scrolling to the matching row.
    - **All categories' expressions, rendered with live truth signals.** For each category, the **always-visible header** shows: a triangle toggle (▸/▾), a status indicator (green ✓ if the expression currently evaluates to true, red ✗ if false), the category number followed by `:` (e.g. `▸ ✓ 1: Did not run the simulation`), and the category's `studentAction` text (a short description of the student behavior the category detects). Below the header — also always visible — the DSL expression renders with each leaf (factor variable, sim-prop bound by `WITH`, comparison operand) **double-encoded for truth value**: green color + underline for true, red color + strikethrough for false. Operators (`AND`, `OR`, `NOT`, `WITH`, comparisons) and parens stay neutral so the expression's structure remains readable. The double-encoding is a deliberate accessibility concession — a colorblind developer reading the sidebar would otherwise have no way to recover per-leaf truth values; the category-level ✓/✗ icon is shape-redundant only at the category level. **Click anywhere on the row** (the whole card is the click target — header line, expression line, and the row container itself) **to expand it**; the expanded form shows: `Feedback:` (the student-facing message), `Visual feedback:` (the visual cue description, or a bolded **None** when the rule set has no visual cue defined for this category), and `Parsed expression:` followed by a JSON-pretty-printed AST (per the AST-inspection requirement below). The same single click also expands any nested WITH binding detail (per the WITH binding detail sub-bullet below) — there is one open/closed state per row, not separate states for the row body and each WITH leaf. The currently-matched category is independently highlighted (bold border or background tint). **When the engine is inactive (load-failure or parse-error per Reqs 10/11a/13), per-category status icons and per-leaf coloring are suppressed. Behavior splits by whether `engine.ruleSet` is defined: (a) `ruleSet` present (parse-error, missing-defaults, missing-impl) — categories render with their `studentAction` and DSL expression strings unstyled (expanded detail still includes `feedback` / `visualFeedback` / `parsed expression` if the user expands a row), and the parse-erroring category, if any, gets the inline offending-token highlight from the `parse-error` errors-panel entry per Req 13. (b) `ruleSet` undefined (missing-rule-set per Req 10 — `?hazbotRules` is unset or its id does not resolve) — no categories panel renders; the sidebar shows only the engine errors panel (at top), the rule-set-id fallback in the header ("attempted: \<requestedRuleSetId\>" or "(none)"), and nothing else. Truth signals are restored when `engine.isActive === true`.**
    - **WITH binding detail.** Each WITH sub-expression in a rendered category expression renders **inline** as `varName WITH (innerExpr)` with per-leaf truth coloring on both the outer variable and every sim-prop leaf inside the inner expression — using the same green-underline / red-strikethrough double-encoding as the outer expression. Sim-prop leaves inside a WITH whose witness reading doesn't yet exist (no run-start reading recorded) render with a third "no value yet" treatment — muted gray + dashed underline — to distinguish "unknown" from "confidently false". The WITH does **not** have its own click control; its expanded detail is bound to the enclosing category row's open state (one click on the row toggles both the row's `Feedback` / `Visual feedback` / `Parsed expression` section *and* every nested WITH's witness-reading detail). The expanded form shows: when bound, `Matched on reading #N: { ... full reading JSON ... }` where `N` is the same 1-based chronological index used by the Readings panel (per the Readings panel sub-bullet); when unbound, one of `No readings yet` (no candidate readings the factor variable produced witnesses for) or `N reading(s) checked, no match` (witnesses exist but no inner clause evaluation came back true). The per-reading breakdown originally specced — "which prop sub-conditions failed on each" — is **not** implemented; the inline per-leaf coloring on the most recent candidate reading covers the same diagnostic need with less visual weight.
    - **Parsed AST inspection.** The expanded category detail (per the click-to-expand contract above) includes the category's parsed AST as JSON — for verifying the parser's interpretation of the DSL. When the expression failed to parse, the expanded form renders a `(parse-error sentinel — see Errors panel)` placeholder; the offending-token highlight on the unstyled DSL string handles the in-line surfacing per Req 13.
    - **Live transitions** — when a new event causes a category change, the change is visible (e.g., transient highlight or transition log).
    - **Engine errors / warnings panel** — chronological view over the engine's `errors: EngineError[]` substrate log (see Tech Notes). **Rendered at the top of the sidebar, immediately under the header**, so load failures and runtime errors are visible without scrolling past the categories / readings / factor-variables / sim-props panels. Includes load errors (missing rule set, missing defaults, missing factor-variable impl, parse errors), runtime errors (missing ambient-state key, factor-variable / sim-prop evaluation throw), and stub warnings (any factor variable / sim-prop the bridge has flagged as a stub — e.g., `SparksAtTopAndBottom` and `sawIntenseFire` for the wildfire bridge in WM-10). Each entry shows the message, severity (error/warning), timestamp, and the triggering context when applicable (event name + payload, category + expression, rule-set id). Severity and message come from the substrate's **Error rendering map** (Tech Notes — kept substrate-level so the engine's parallel `console.error`/`console.warn` output and the sidebar's panel always render the same string for the same error; R17-2). **There is no separate "Load error" banner** — load failures surface in this single panel uniformly with all other errors. Contextual hints elsewhere in the sidebar (parse-error highlight per category from Req 13) supplement it for in-context cases. The engine `console.error` / `console.warn`s in parallel with appending to `errors`, using the same render helper, so devtools and the sidebar are guaranteed consistent.
    - **Interactive controls use semantic `<button>` elements** for click-expandable sections (factor variables, readings, AST toggles, errors). This gives keyboard activation (Enter/Space) and focus indicators automatically without further ARIA work — sufficient for a dev-only tool. **Exception**: the category row in the Categories panel is a `<div>` with `role="button"`, `tabIndex={0}`, `aria-expanded`, and an explicit `onKeyDown` handler that activates on Enter/Space — because the row contains block-level content (the expanded `Feedback` / `Visual feedback` / `Parsed expression` detail block and the inline WITH witness-reading payload `<pre>`) that's invalid HTML inside a `<button>`. Keyboard activation parity is preserved through the explicit handler; focus indicators come from a CSS `:focus-visible` outline that matches the `<button>` treatment. No additional accessibility commitments (no `aria-live` region for category changes; the WITH binding detail no longer has its own control — it follows the row's open state per the WITH binding detail sub-bullet). The earlier WCAG-1 truth-coloring concession (green/underline + red/strikethrough + muted-gray/dashed-underline for "no value yet", per colorblind-developer accessibility) stands.
    - **Sidebar header.** Includes the active rule-set id (per the fallback chain above), the engine substrate version (Req 20), and the app rules version (Req 20). Header layout/typography matches the `?logMonitor` sidebar's treatment — `<strong>` title + muted version text — so the two sidebars feel like a family when open side-by-side. The engine `sessionId` is **not** in the header — it stays available via `useAnalysisEngine().engine.sessionId` for any consumer that needs it (and is included on every Reading) but is omitted from the visible header to reduce noise. The same omission extends to the Readings panel's expanded payload JSON and the WITH bound payload JSON — `sessionId` is stripped from both display sites for the same reason (internal-only debug-tool noise that adds no rule-set-validation signal).
    - **Generic payload rendering.** The substrate sidebar has no compile-time knowledge of the app's `TReading` payload shape. For each reading, it pretty-prints the reading object via `JSON.stringify(_, null, 2)`-style display, with the substrate-known `sessionId` field stripped (per Req 128). The rest — `triggeredBy`, `at`, `updates`, and every app-specific field on the `TReading` payload — renders as-is. Same for WITH-bound reading detail (`Matched on reading #N: { ... }`). This keeps the sidebar zero-config for any host app: no per-app render-prop, no strategy interface, no schema registration. Trade-off: the wildfire app's reading payload (`zones`, `sparks`, `wind`, `ambientState`) shows up as JSON rather than a tabular layout. Acceptable for a dev/PM-facing debug tool; richer per-app rendering can be added later (a render-prop slot is a candidate WM-6-era extension, not a WM-10 commitment).
    - **Visual styling matches the `?logMonitor` sidebar's overall theme — light mode only.** The Hazbot sidebar mirrors the log-monitor's *look* (~300px fixed-width right column, monospace font stack, similar header / entries / button affordances) but ships **a single light-mode theme** with no theme switching. No `theme` prop, no `data-theme` attribute, no `prefers-color-scheme` auto-detect — substrate CSS sets light-mode color variables directly under the `.hazbot-sidebar` root selector. **Deliberately diverges from log-monitor's dual-theme support** (log-monitor defaults to dark and accepts a `theme?: "light" | "dark"` prop): Hazbot's audience is Sam/PM doing rubric validation in well-lit working sessions; a single light theme keeps the substrate's API surface minimal and avoids the prop-plumbing for a feature no current consumer needs. Reference for the visual target — color values, spacing, and typography choices to mirror — is the **light** half of [log-monitor's `log-monitor-styles.ts`](https://github.com/concord-consortium/log-monitor/blob/main/src/log-monitor-styles.ts) (the `[data-theme="light"]` block); also available locally during development under the team's `~/projects/log-monitor/` workspace. Implementation **deliberately diverges** from log-monitor's runtime `<style>`-injection mechanism: Hazbot uses **plain CSS files** authored directly in the substrate (`src/hazbot/engine/sidebar/*.css`) and imported by the substrate's React components (`import "./sidebar.css"`). No SCSS, no preprocessor, no CSS-in-JS — substrate stays consumable by any bundler that handles plain CSS imports (which webpack, Vite, Rollup, esbuild, and Parcel all do out of the box). When the substrate is eventually published as a standalone npm package, the `.css` files ship as-is alongside the JS, with no build step. Hazbot's CSS variables live under a hazbot-scoped selector (`.hazbot-sidebar`) so the two sidebars coexist without selector collisions even when log-monitor is dark and Hazbot is light side by side.

    The status icon and the matched-highlight may disagree — for example, a category that was matched earlier and would not regress per monotonicity (Req 7) might currently evaluate to false. The icon shows current truth; the highlight shows engine match state.
18. **Coexistence with `?logMonitor`.** Both sidebars may be open simultaneously side-by-side. The simulation content area is unaffected; sidebars consume their own right columns in flex order: simulation → logMonitor (if `?logMonitor=true`) → Hazbot sidebar (if `?hazbotSidebar=true`). The existing flex layout in [src/components/app.tsx:109–114](../../src/components/app.tsx#L109-L114) is extended to handle a second optional right column.

### React integration

19. **Substrate-owned React context + hook + engine listener API.** The substrate provides a `AnalysisEngineProvider<TReading, TDefaults>` React context that holds the engine instance and a `useAnalysisEngine<TReading, TDefaults>()` hook that exposes engine state reactively. Both live in `src/hazbot/engine/react/`. **No MobX dependency** (Req 1) — reactivity uses React's built-in `useSyncExternalStore` against a substrate-owned subscribe API on the engine itself.

    The engine exposes `subscribe(listener: () => void): () => void` and `getSnapshot(): number` (a monotonically-increasing version counter incremented after every state change — `consume()` mutation, load-validation completion, error append). After each internal mutation the engine notifies its listeners; the hook's `useSyncExternalStore` re-renders consumers when the version ticks. The version-counter shape is the simplest snapshot that works with `useSyncExternalStore`'s Object.is-based comparison; readings/errors arrays are read directly off the engine after re-render, not threaded through the snapshot.

    **Browser-only**: the substrate is browser-only by design — it is never to be used server-side, in any host app. The hook calls `useSyncExternalStore(subscribe, getSnapshot)` with only the two client-side arguments; no `getServerSnapshot` is provided. SSR consumers would hit React's "Missing getServerSnapshot" error and must gate the Provider behind `typeof window !== "undefined"` (or its framework equivalent). This is a deliberate scope decision, not an oversight: the substrate's whole reason for existing is interactive simulation analysis — there is no meaningful server-rendered output for it to produce.

    **Reentrancy contract**: the notify implementation snapshots its listener set before iteration so a listener that subscribes or unsubscribes during the call does not affect the in-flight notify. A reentrancy guard prevents recursive notify: if a listener triggers a state-changing op (e.g., a debug listener that calls `consume()`), the inner mutation is buffered; the outer notify completes its iteration first, then a single follow-up notify fires for the buffered mutation. Tests assert: (a) a listener subscribed during a notify does not fire on that notify, (b) a listener unsubscribed during a notify does not fire on that notify if it has not already, (c) a listener that calls `consume()` causes exactly one outer + one follow-up notify per outer call (not a recursive cascade).

    **Notify atomicity**: each `consume()` call fires at most one notify, at the end of the call, regardless of how many internal state mutations occurred. Same for the engine constructor — it performs all load-time mutations (impl resolution, defaults validation, parse-time AST caching, ambient-key collection, stub-warning emission) and emits a single notify at the end of construction. The notify call **always fires**, regardless of whether any listeners are subscribed: the counter tick is the load-bearing effect, and the listener-iteration is a no-op (empty set) when no listeners exist yet — which is always true at construction time. **Implementers must not "optimize" away the constructor's notify call when the listener set is empty: doing so would skip the counter tick and break the initial-snapshot contract (SE-18).** Other public state-changing entry points (e.g., the `safelyEvaluateImpl` wrapper from Tech Notes' "Factor-variable implementation interface" / "Payload shape assumptions" that catches `impl-eval-throw` for both factor-variable `compute()` and sim-prop `evaluate()` throws) follow the same contract — single notify on entry-point completion, always fires. Tests assert: (a) a `consume()` that pushes one reading and emits one stub-warning (via a synthetic fixture) calls subscribers exactly once, not twice; (b) an engine with no `subscribe()` calls between construction and first `getSnapshot()` returns `1`, not `0` (the constructor's notify ticked the counter even with zero listeners).

    **Initial-snapshot semantics**: the version counter starts at `0` pre-construction and is incremented to `1` at the end of construction (per the atomicity rule above). Load-time errors (`load-failure`, `parse-error`, `stub-warning`) are therefore visible on the very first `useAnalysisEngine()` render — `useSyncExternalStore` reads `getSnapshot()` synchronously on first render and gets `1`, then reads the populated `errors` array directly off the engine. `subscribe()` does **not** fire a synthetic initial notify on first listener registration; consumers read the current snapshot via `getSnapshot()` and only receive callbacks for *subsequent* state changes. Tests assert: an engine constructed with a missing rule set has `errors.length >= 1` and `getSnapshot() === 1` immediately after construction, before any `subscribe()` call; subscribing afterwards does not retroactively fire the listener for the construction-time mutations.

    **Snapshot tick semantics**: outside construction, the version counter ticks **iff a state-changing operation actually mutated `readings` or `errors`**. Specifically:

    - **Construction always ticks the counter from `0` to `1`**, regardless of whether load-time validation produced any mutation. This exemption is what makes load-time errors visible on first hook render (SE-18) and applies even when the rule set loads cleanly with no stubs referenced and no errors appended. Other public state-changing entry points follow the strict "ticks iff mutated" rule below.
    - A `consume()` call where `translate()` returns `{ kind: "no-op" }` does **not** tick the counter (no `readings` or `errors` mutation occurred).
    - A `consume()` call on an inactive engine (`isActive === false`, early-return per Req 10) does **not** tick the counter.
    - A `consume()` call that successfully appends a reading, appends an error, or both, ticks the counter exactly once (per the atomicity rule above).

    Tests assert each rule directly: a no-op consume leaves `getSnapshot()` unchanged; an inactive-engine consume leaves `getSnapshot()` unchanged; a successful trigger consume increments `getSnapshot()` by exactly 1 even if it produced both a reading and an error in the same call.

    The hook returns a destructurable view computed from the engine's typed accessors. Derived fields are computed once per snapshot via the FE-3 WeakMap cache and shared across renders within that snapshot — see the "Performance" paragraph below for the full memoization contract.

    ```ts
    {
      engine,                    // the engine instance, for advanced consumers
      isActive,                  // engine.isActive
      ruleSet,                   // engine.ruleSet
      requestedRuleSetId,        // engine.requestedRuleSetId
      sessionId,                 // engine.sessionId
      readings,                  // engine.readings (same reference across non-mutating renders)
      errors,                    // engine.errors
      factorVariables,           // engine.factorVariables (the impl map)
      factorVariableValues,      // Map<name, { value, witnesses }> — computed from impls × readings, memoized per snapshot (FE-3)
      matchedCategory,           // null | number — computed from rule set × readings, memoized per snapshot (FE-3)
      perCategoryTruth,          // Map<categoryId, { value, perLeaf, withDetails }> — computed via leaf evaluator, memoized per snapshot (FE-3)
      engineVersion,             // ENGINE_VERSION (Req 20)
      appRulesVersion,           // wired in by the bridge via the Provider's `appRulesVersion` prop (Req 20)
    }
    ```

    The Provider is mounted near the app root (alongside the existing MobX `Provider` in [src/components/app.tsx](../../src/components/app.tsx)) by the wildfire-bridge so any descendent — the substrate's debug sidebar (Req 15), future student-facing UI (WM-6), and any later analytic surfaces — consumes engine state through the same hook. The Provider takes the engine instance and `appRulesVersion` as props; substrate-owned, no wildfire-model imports.

    **Provider prop contract**:

    ```ts
    interface AnalysisEngineProviderProps<TReading extends BaseReading, TDefaults> {
      engine: Engine<TReading, TDefaults>;   // required
      appRulesVersion: string | number;      // required — wildfire-bridge passes integer 1; future host apps may use semver "1.2.3" or git-sha "abc1234"
      children: React.ReactNode;
    }
    ```

    `appRulesVersion` is **required, not optional**. A host app that forgets to pass it gets a TypeScript compile error against the substrate's published types — surfaced on day one when adopting the engine, before any analytics or sidebar render misbehaves. The substrate has no fallback (no `"unknown"` placeholder, no runtime warning); the prop is always a real `string | number` once the host app's TS compiles. The type is `string | number` rather than `number` so future host apps can use semver, git SHAs, or content hashes without a substrate change — the wildfire bridge passes integer `1` (Req 20). Sidebar header consumes the value via `String(appRulesVersion)`; `AnalysisEngineActivated` log payload (Req 20) passes the value through as-is.

    **Hook outside Provider**: calling `useAnalysisEngine()` from a component tree that is not wrapped in `<AnalysisEngineProvider>` throws `"useAnalysisEngine must be used inside <AnalysisEngineProvider>"`. Standard React idiom — catches misuse loudly at the point of failure rather than via a defensive null-check downstream. **Implementation order**: the hook reads `useContext(AnalysisEngineContext)` first, throws immediately if the value is `undefined`, and only then calls `useSyncExternalStore(...)`. Reversing the order would crash with a TypeError on `undefined.subscribe` before reaching the throw. A unit test asserts the throw with the exact error message.

    The Provider is mounted whenever the engine should be reachable from React — i.e., whenever the app is running with `?hazbotRules` or `?hazbotSidebar` set; it is not gated to dev or sidebar-only contexts so future student-facing UI can read engine state through the same hook. When neither URL flag is set, the bridge skips Provider mounting entirely (the hook is never called from any rendered tree), keeping the no-flag path zero-cost.

    **Provider mount truth table**:

    | `?hazbotRules` | `?hazbotSidebar` | Provider mounted? | Engine constructed? | Sidebar rendered? | `AnalysisEngineActivated` fired? |
    |:---:|:---:|:---:|:---:|:---:|:---:|
    | unset | unset | no | no | no | no |
    | set & resolves | unset | yes | yes (active) | no | yes |
    | set & doesn't resolve | unset | yes | yes (inactive, load-failure) | no | no |
    | unset | true | yes | yes (inactive, missing-rule-set) | yes (Errors panel at top) | no |
    | set & resolves | true | yes | yes (active) | yes | yes |
    | set & doesn't resolve | true | yes | yes (inactive, load-failure) | yes (Errors panel at top) | no |

    The bridge mounts the Provider iff `hazbotRules !== undefined || hazbotSidebar === true`. **Engine construction precedes Provider mount**: the bridge's engine-singleton factory builds the engine once (regardless of which URL flag triggered the mount), then passes the constructed instance as the Provider's required `engine` prop. The Provider never sees a "no engine yet" state — SE-17's required-prop contract eliminates that path. Sidebar render is gated independently on `hazbotSidebar === true`. Activation log fires iff `engine.isActive` post-construction (Req 20). The "no flags" row is the zero-cost path: no engine constructed, no Provider mounted, no log emission, no listener allocation.

    **Performance**: derived fields (`factorVariableValues`, `matchedCategory`, `perCategoryTruth`) are computed inside the hook and **memoized per snapshot** to keep the cost bounded by consumer count rather than scaling with it. The hook holds a module-level `WeakMap<Engine, { snapshot: number; view: HookReturn }>` cache: a call recomputes the view iff `engine.getSnapshot()` differs from the cached snapshot, otherwise returns the cached reference. Multiple `useAnalysisEngine()` calls within the same render — typical in the substrate sidebar, which composes ~5–8 sub-components that each consume engine state — share one O(C × L × N) computation. Side benefit: the hook return shape gains referential stability, so consumer-side `useEffect` deps and `React.memo` comparisons work without callers having to memoize destructured fields themselves. The WeakMap keying ensures cache entries are garbage-collected when an engine is discarded (typical in tests). Tech Notes' "Sidebar render cost" subsection documents the O(C × L × N) bound and N-in-the-tens implicit budget. Tests assert: two consecutive `useAnalysisEngine()` calls without an intervening engine mutation return reference-equal derived fields.

### Versioning and activation log

20. **Engine version + app rules version + activation log event.** The substrate exports a semver `ENGINE_VERSION` constant (initial value `"0.0.1"`) from `src/hazbot/engine/version.ts`; the wildfire-bridge exports an integer `APP_RULES_VERSION` constant (initial value `1`) from `src/hazbot/wildfire/rules-version.ts`. The bridge passes `APP_RULES_VERSION` to the substrate `AnalysisEngineProvider` as a prop; the substrate has no compile-time knowledge of any specific app's rules version. Both versions are displayed in the sidebar header (per Req 17) and surfaced through the `useAnalysisEngine()` hook (per Req 19).

    When the engine successfully activates (load validation passes — `engine.isActive === true` after construction), the wildfire-bridge emits a `AnalysisEngineActivated` log event through the same `log()` wrapper updated in Req 3a, with payload `{ engineVersion, appRulesVersion, ruleSetId }`. The engine's `sessionId` is **not** included in the payload — `sessionId` stays engine-local (available via `useAnalysisEngine().engine.sessionId` and on every Reading, and persisted only by future AP-73 work where its scope is decided then) rather than being broadcast to LARA on activation. The substrate does not emit log events (substrate is log-stream-agnostic per Req 1) — the bridge owns this emission point, calling `log("AnalysisEngineActivated", { ... })` immediately after constructing the engine if `engine.isActive`. The event flows through the regular log destinations — LARA captures it for downstream analysis, the log-monitor sidebar shows it if open, and the engine itself does **not** consume it (the bridge's `translate` callback maps `AnalysisEngineActivated` to `no-op` so the engine doesn't accidentally log-amplify its own activation, and so a forgotten `translate` clause doesn't surface a confusing ambient-validation error against an event the engine wasn't designed to handle). The event fires exactly once per page load (the engine is constructed once); if load validation fails, no `AnalysisEngineActivated` is emitted (the engine is inactive). [LOGGED-EVENTS.md](../../LOGGED-EVENTS.md) gains an entry for the new event under a new "Hazbot" subsection.

    **Bump policy** (process, not enforced):
    - **Engine version** — semver semantics. Patch bump for substrate bug fixes; minor bump for additive substrate API surface (new error variants, new optional `Engine` opts, new exported helpers, new substrate sidebar features); major bump for breaking substrate API changes. Lives at `src/hazbot/engine/version.ts` and is updated by hand alongside the substrate code change.
    - **App rules version** — wildfire bridge uses an incrementing integer (`APP_RULES_VERSION: number`, starting at `1`). Bump whenever the on-disk rule-set content materially changes — a new tab is added, an existing tab's categories/expressions/factor-variable defs/defaults are edited and re-extracted. Editorial changes to feedback text alone do not require a bump (feedback wording is end-user-visible, not engine-behavioral). Lives at `src/hazbot/wildfire/rules-version.ts` and is updated by hand by whoever runs the extraction script after a structural rule-set change. The value is opaque to the engine — it exists for analytics correlation and sidebar surfacing only. The substrate's Provider prop accepts `string | number` (Req 19) so a future host app can use semver, git SHAs, or content hashes without a substrate change; wildfire's bridge stays on the integer form for WM-10.

### Done definition

WM-10 is considered complete when:

1. Engine + sidebar work end-to-end (per the acceptance criteria below), and
2. Sam has validated rule sets 23, 24, and categories 1–5 of 25 (category 6 of 25 is unreachable in this story due to the `SparksAtTopAndBottom` stub — see Out of Scope).

Tabs 32–35 unblock as Sam fills in default values at source in the sheet; that work is tracked separately and does not gate WM-10's merge. Whether WM-6 (the student-facing button) ships per-activity-page or waits for all rule sets to validate is a WM-6 scope decision, not a WM-10 one.

### Acceptance Criteria

- Engine module exists under `src/hazbot/` with unit tests covering each rule across **each currently loadable rule set** — for WM-10 that is `23`, `24`, and `25`. The test list grows alongside Reqs 11/11a as Sam fills in defaults for tabs 32–35 and the engine begins loading them; this AC is not a commitment to test pre-default rule sets with fixture defaults (the fixture choice would pre-empt Sam's authoring decision and the `[*]` validator could reject the real rule set later if the fixture defaults did not match what Sam ultimately supplies). For each loadable rule set, tests cover at minimum: (a) a state matching no category, (b) a state matching exactly one category, (c) a state where multiple categories' expressions are simultaneously true and the engine selects the highest, (d) monotonicity — after the engine has matched category N, feeding a sequence of inputs that *standalone* would match a lower category leaves the matched category at N, (e) **for any category whose expression depends on a stubbed factor variable / sim-prop** (e.g., `SparksAtTopAndBottom` → category 6 of rule set 25; `sawIntenseFire` → tab 34's success category once it loads), an explicit "unreachable while stubbed" test that constructs an otherwise-fully-satisfying state and asserts the matched category does **not** include the stub-gated one. This reconciles Done Definition's "categories 1–5 of 25" scope with the AC's "each rule" sweep — category 6 *is* tested, just for unreachability rather than firing — and catches the regression where a stub accidentally starts returning true (e.g., a refactor moving stubs to a default-true behavior).
- `?hazbotRules=<id>` selects the active rule set; missing/invalid id surfaces a clear dev-time error.
- Rule sets load from generated `src/hazbot/rule-sets/<id>.ts` modules; re-running the extraction script regenerates them and reloading reflects the change.
- The extraction script (`scripts/extract-hazbot-sheets.js`) has fixture-based tests: a small synthetic `.xlsx` lives under `scripts/__fixtures__/`, the script runs against it during CI, and the generated output is asserted against expectations (snapshot or per-field assertions, implementer's choice). Tests cover at minimum: categories parsed in order, factor-variable definitions extracted, defaults parsed from the Details column, TBD defaults left absent, and at least one fixture row whose feedback or details content covers TS-literal escape edge cases (backtick, `${`, newline, double-quote, single-quote) — test asserts the generated TS file compiles cleanly and the parsed-back string round-trips to the fixture value.
- The extraction script writes the sheet's README tab to `src/hazbot/dsl-grammar.md` on every run; this file is committed to the repo so DSL grammar drift surfaces in PR review.
- Every generated file under `src/hazbot/rule-sets/*.ts` and `src/hazbot/dsl-grammar.md` begins with an `AUTO-GENERATED — DO NOT EDIT — re-run scripts/extract-hazbot-sheets.js` header on its first line. Format is pinned: TS comment (`// AUTO-GENERATED — ...`) for `.ts` files; markdown blockquote with bolded text (`> **AUTO-GENERATED — DO NOT EDIT — re-run \`scripts/extract-hazbot-sheets.js\`**`) followed by a blank line for `dsl-grammar.md`. A CI check (or jest test) asserts the header is present in every file via a per-format regex. Catches accidental hand-edits that strip the header; not a defense against deliberate circumvention. Does not catch sheet-edit drift (see Tech Notes for that residual risk).
- The engine validates that any rule set's factor variables and sim-props that depend on default values (terrain, vegetation, drought, wind) have those defaults present on the rule set; missing defaults produce a clear dev-time error and the rule set is rejected at load. Error messages name the rule set, the impl name (factor variable or sim-prop), and the specific failing path — including the array index for `[*]` failures (e.g., `"zones[1].terrainType is undefined"`). Tested with at least one `[*]`-path failure (one entry missing the field), one missing-top-level-field failure, and one sim-prop-side `requiredDefaults` failure (asserts the walk covers both registries — Finding 14).
- The load-time validation walk is **reference-driven** (Finding 15): only factor variables and sim-props referenced by at least one category expression's parsed AST are validated. Tested directly with a fixture rule set that declares an unused factor variable with a `requiredDefaults` path that does not resolve on `defaults` — the rule set still loads successfully because the unused factor variable is not referenced. A second fixture variant moves the same factor variable into a category expression and confirms the rule set is now rejected at load with `missing-defaults`.
- Sim-props referenced by category expressions are subject to ambient-state validation (Req 3b) symmetrically with factor variables. A sim-prop like `GraphOpen` declares `ambientStateKeys: { SimulationStarted: ["chartTabOpenAtStart"] }` on its `SimPropImpl`; if a `SimulationStarted` event arrives without `chartTabOpenAtStart` in its `ambientState`, the engine appends an `{ kind: "ambient-validation", ..., implName: "GraphOpen", missingKey: "chartTabOpenAtStart" }` entry to `errors`. Tested directly. Confirms Finding-14 contamination defense: a forgotten call-site update for any sim-prop-required ambient key fails loudly at the next trigger rather than silently evaluating the sim-prop as false.
- The wildfire-bridge passes a `simProps: Record<string, SimPropImpl<WildfireReading, WildfireDefaults>>` registry to the substrate `Engine` constructor, including impls for `OneSparkPerZone`, `UniqueVegetationPerZone`, `UniformDroughtLevels`, `UniformTerrainTypes`, `ForestWAWOSuppression`, `TwoSparks`, `GraphOpen`, plus the stubbed `SparksAtTopAndBottom`. Tested directly: assert each name resolves to a function and `GraphOpen`'s impl declares `ambientStateKeys: { SimulationStarted: ["chartTabOpenAtStart"] }`.
- DSL parser handles `AND`, `OR`, `NOT`, `WITH`, `>`, `<`, `==`, `!=`, `>=`, `<=`, `.size`, `.length`, parentheses `( ... )`, and the precedence ordering documented in Background; parser has its own unit-test suite covering each construct. **Numeric literal boundary tests** cover at minimum: (a) accepted forms — `0`, `1`, `42`; (b) rejected forms with form-mismatch error message naming the offending literal — `1.5` (float), `-1` (negative), `0xff` (hex), `1e3` (scientific).
- Factor variables include `boolean`, `Set`, and `array` types (`.length` / `.size` queries supported).
- Stub implementations for `SparksAtTopAndBottom` and `sawIntenseFire` return `false` and emit a "not yet implemented" `console.warn` once per session per stub.
- Engine substrate (`src/hazbot/engine/**`) has zero imports from wildfire-model app state/store/UI, zero imports from `src/log.ts`, and zero imports from `mobx` / `mobx-react` (Req 1). **Mechanically enforced** via an ESLint `no-restricted-imports` rule (or equivalent — `eslint-plugin-import`'s `import/no-restricted-paths` is a natural fit since native `no-restricted-imports` does not do path resolution) scoped to `src/hazbot/engine/**` that **disallows any import path (relative or absolute) that resolves outside `src/hazbot/engine/**`** — within-substrate `../` imports between sibling subdirectories (e.g., `engine/react` importing from `engine/core` via `../core`) are permitted because they still resolve inside the substrate root, but `../../store` resolves to `src/store/` outside the substrate and is rejected. The rule additionally bars imports from any wildfire-model absolute path (`src/...`) and explicitly bars `mobx` and `mobx-react` packages by name; CI fails on rule violation. The substrate's permitted imports are paths that resolve inside `src/hazbot/engine/**` and the `react` package (the only peer dep per Req 1). The ESLint rule additionally bars `react-dom` to enforce LA-2's "no `react-dom` API" commitment — the substrate uses standard React APIs only and shipping a `createPortal` or `flushSync` import would silently expand the peer-dep contract. ESLint over an import-graph test is the smaller-investment option and gives an authoring-time signal in the IDE.
- The substrate's React surface lives at `src/hazbot/engine/react/` (`AnalysisEngineProvider`, `useAnalysisEngine`, barrel `index.ts`); the substrate sidebar lives at `src/hazbot/engine/sidebar/` (top-level `Sidebar` component plus per-panel sub-components and plain `.css` file(s) imported directly from the components). Both directories are inside the substrate boundary above and subject to the same ESLint constraints.
- `Engine` exposes `subscribe(listener: () => void): () => void` and `getSnapshot(): number`. After every state change (load-time error append, `consume()` mutation, `impl-eval-throw` error append) the engine increments the snapshot counter and notifies subscribed listeners exactly once. Tested directly: a subscriber's listener fires after each `consume()` that mutates state, does not fire on a no-op event, and unsubscription stops further notifications.
- `useAnalysisEngine()` returns the documented shape (Req 19) and re-renders consumers when the engine's snapshot ticks. Tested via RTL with a small consumer component asserting that mutating the engine causes a re-render.
- The engine listener API and `useAnalysisEngine()` hook have direct unit tests for the contracts pinned in Req 19's prose paragraphs. At minimum: reentrancy (subscribe-during-notify, unsubscribe-during-notify, listener-calls-`consume()` produces one outer + one follow-up notify), notify atomicity (single notify per `consume()` regardless of mutation count, zero-listener engine returns `getSnapshot() === 1` post-construction), initial-snapshot semantics (errors visible on first hook render, no retroactive listener fire on later subscribe), hook-outside-Provider exact-error-message throw, hook memoization (two consecutive calls within a snapshot return reference-equal derived fields), snapshot-tick edge cases (no-op consume / inactive-engine consume don't tick; successful consume increments by exactly 1 even with both reading and error mutations). See the corresponding Req 19 paragraphs for the full assertion text.
- The substrate sidebar (`src/hazbot/engine/sidebar/`) is generic over `<TReading, TDefaults>`. Test coverage spans the substrate/bridge boundary:
  - **Substrate-side tests** (`src/hazbot/engine/sidebar/sidebar.test.tsx`) — drive the sidebar against a synthetic `TReading` shape declared inline in the test file. No wildfire imports. Asserts the sidebar makes no wildfire-specific assumption and that generic payload rendering (Req 17) handles the synthetic payload's fields.
  - **Bridge-side tests** (`src/hazbot/wildfire/sidebar.test.tsx`) — drive the substrate sidebar wrapped in a `AnalysisEngineProvider` over a real wildfire `Engine<WildfireReading, WildfireDefaults>` (using a real generated rule set, e.g., `ruleSets["23"]`, with synthetic readings). Asserts the wildfire payload (`zones`, `sparks`, `wind`, `ambientState`) renders via the generic-payload path and that the matched category / feedback text from the real rule set show up in the rendered output.
- The substrate sidebar's visual treatment is consistent with the **light-mode** half of the `?logMonitor` sidebar's look (~300px fixed-width column, monospace, similar header `<strong>title</strong>` + muted version). **Single light theme; no theme switching, no `data-theme` attribute, no `theme` prop.** Substrate CSS sets light-mode color variables under the `.hazbot-sidebar` root selector. Manual-review acceptance (no automated visual-regression check); the AC is satisfied by side-by-side screenshot comparison documented in the PR description, paired against the `[data-theme="light"]` block in log-monitor's `log-monitor-styles.ts`.
- At least one integration-style test (along the lines of [src/components/log-events.test.tsx](../../src/components/log-events.test.tsx)) verifies the `ambientState` plumbing end-to-end: with `chartStore.tabOpen` set to both `true` and `false` (parameterized or two test cases), triggering `SimulationStarted` results in an engine Reading whose `chartTabOpenAtStart` reflects the set value. Asserts the wiring is present and not inverted.
- Debug sidebar opens via `?hazbotSidebar=true` and shows live engine state — active rule set, sessionId, readings, factor variable values, matched category, all categories with truth-colored expressions — while the user interacts with the simulation.
- The sidebar's per-category expression display: shows a per-category status icon (✓/✗), double-encodes each leaf's truth — green color + underline for true, red color + strikethrough for false (so a colorblind reader can recover per-leaf truth without color) — and visually highlights the matched category. Each WITH sub-expression is expandable to show the bound reading (when true) or per-reading evaluation (when false). Each category has an optional toggle for parsed-AST inspection.
- The sidebar shows a chronological readings panel — each reading's `triggeredBy`, `at`, `updates` array, and a generic JSON pretty-print of the rest of the reading's fields (the app-specific `TReading` payload, per Req 17's "Generic payload rendering"). Click-expandable for full detail.
- Each factor variable in the sidebar is click-expandable to show provenance — the specific readings that contributed to its current value.
- Tested with at least one rule set having a partially-true expression so leaf coloring is visibly differentiated, and a scenario where the matched-highlight and status icon disagree is captured.
- The sidebar's engine errors / warnings panel records every dev-time message the engine emits — load errors, runtime errors, and stub warnings — with timestamp, severity, and context. Tested with at least one error-emission per category (load, runtime, warning).
- When `SimulationStarted` is rejected by ambient validation (Req 3b), no Reading is appended; a subsequent `ChartTabShown` modifier is dropped and recorded as `{ kind: "orphan-modifier", reason: "prior-trigger-failed", ... }` in `errors`. No prior-run Reading's `updates` array is mutated. Tested directly. Additionally tested directly: at engine boot with empty `readings` and empty `errors`, a `ChartTabShown` is dropped and recorded with `reason: "no-prior-trigger"`, exercising the second branch of the timestamp-comparison detection rule.
- When the engine is constructed with `runStartTriggers: ["SimulationStarted"]`, a `SimulationStarted → SimulationEnded → ChartTabShown` sequence produces an `{ kind: "orphan-modifier", reason: "between-runs", ... }` error. The `SimulationEnded` Reading's `updates` array remains empty. Tested directly. Composes with the wildfire-bridge AC below (which asserts the bridge passes the right `runStartTriggers` value, with no `runEndTriggers` opt per Finding 22). Confirms Finding-11 contamination defense: a future factor variable whose witnesses include `SimulationEnded` readings cannot be polluted by between-run UI changes.
- The wildfire-bridge passes `runStartTriggers: ["SimulationStarted"]` to the substrate `Engine` constructor (no `runEndTriggers` opt — Finding 22 dropped it as substrate-unused; the orphan-modifier rule keys solely on `runStartTriggers`). Tested directly via the existing engine-construction tests — assert the constructor was called with `runStartTriggers: ["SimulationStarted"]` verbatim and was *not* passed a `runEndTriggers` opt.
- The WITH evaluator iterates over `compute(readings).witnesses` of the LHS factor variable as the candidate set (per Tech Notes' "Evaluator interface extensions"). Tested directly: (a) `ranSimulation WITH OneSparkPerZone` evaluates against each `SimulationStarted` reading's witnesses (ranSimulation is boolean, witnesses are the SimulationStarted readings); (b) empty witnesses (engine has no readings yet) yields a false WITH with empty `candidateEvaluations` and undefined `boundReading`.
- When both `?logMonitor=true` and `?hazbotSidebar=true` are set, the two sidebars render side-by-side without breaking the simulation layout.
- The Hazbot sidebar has smoke-level RTL tests covering: (1) renders without throwing given a populated engine wrapped in a `AnalysisEngineProvider`, (2) displays the matched category number and feedback text, (3) renders the load-error message when the engine is inactive due to a bad rule-set id, (4) re-renders when the engine's snapshot ticks (driving a `consume()` and asserting the readings count in the rendered output updates), (5) coexists with `?logMonitor=true` (both right columns render). Deeper interaction coverage is intentionally deferred — the sidebar's primary value is interactive validation by Sam/PM.
- The substrate exports `ENGINE_VERSION: string` from `src/hazbot/engine/version.ts`; initial value is `"0.0.1"` and the value matches the `^\d+\.\d+\.\d+$` semver pattern. A jest test asserts the export exists, is a string, and matches the pattern.
- The wildfire-bridge exports `APP_RULES_VERSION: number` from `src/hazbot/wildfire/rules-version.ts`; initial value is `1` and the value is a positive integer. A jest test asserts the export exists, is a number, and is `>= 1`.
- The sidebar header displays both versions visibly — engine version near the title (matching log-monitor's `<strong>title</strong>` + muted-version layout) and app rules version adjacent or directly below. RTL test asserts both version strings appear in the rendered header given a populated engine.
- When the engine is active (`engine.isActive === true` after construction), the wildfire-bridge emits exactly one `AnalysisEngineActivated` log event with payload `{ engineVersion, appRulesVersion, ruleSetId }` (no `sessionId` — that stays engine-local per Req 20). When the engine is inactive (load-failure, parse-error, or `?hazbotRules` unset), no `AnalysisEngineActivated` event is emitted. Tested directly via the existing `mockLog` pattern: assert the event is in the log calls when active, absent when inactive, payload `ruleSetId` matches `engine.ruleSet.id`, payload version fields match the source-of-truth `ENGINE_VERSION` and `APP_RULES_VERSION` constants, and payload does **not** include a `sessionId` field.
- The wildfire-bridge's `translate` callback maps `AnalysisEngineActivated` to `{ kind: "no-op" }` so the engine does not consume its own activation event. Tested directly.
- [LOGGED-EVENTS.md](../../LOGGED-EVENTS.md) gains an entry documenting `AnalysisEngineActivated` (event name, payload schema, when fired). Reviewer manually checks the entry is present and accurate; no automated assertion.
- Sam/PM can use the sidebar to walk through every active rule set and confirm the rubric matches the expected student behavior.
- A validation-playbook generator script (`scripts/generate-hazbot-validation-playbook.js`, or co-located with `extract-hazbot-sheets.js`) emits a markdown checklist for **each rule-set tab whose categories have authored expressions** into `docs/hazbot-validation/<id>.md`. For WM-10 that is `23`, `24`, `25`, `32`, `33`, `34`, `35` — all 4 blocked-on-defaults tabs are included; tab `54` is excluded because it has no pseudo-code; placeholder tabs `43`/`45`/`47` are excluded for the same reason. Generation depends only on the DSL parser, not on engine load-time validation, so the blocked tabs can be playbook-validated by Sam in parallel with her filling in defaults at source — a small departure from QA-6's loadable-only test scoping (different concerns: tests need a runnable engine, playbook generation needs only parseable expressions). Each per-category section lists: the DSL expression verbatim, the feedback text, and a per-leaf breakdown that **preserves the logical structure** of the expression (Finding 18 — flat leaf lists are wrong for `OR`/`NOT` because "required state" is alternative or inverted). The renderer walks the parsed AST and emits nested bullets with explicit logical markers: `AND` nodes render as "ALL of:" lists; `OR` nodes render as "ANY of:" lists; `NOT` nodes prefix their child with "NOT" (or render as "the following must be FALSE:" for compound negations). Leaf bullets state the required condition for that leaf to fire — boolean (`<varName>: true` or `<varName>: false` depending on whether the leaf is inside a `NOT`), the comparison condition for numeric leaves (e.g., `uniqueWindValuesUsed.size > 1`), and the bound-prop condition for `WITH` sub-expressions (e.g., "exists a SimulationStarted reading where UniqueVegetationPerZone holds"). Each factor variable's `details` string from the sheet is inlined alongside its leaf bullet. Generated files are committed to the repo so the playbook is browsable on GitHub. Sam reviews the generated output once and signs off that the structural scaffold is sufficient; UI-level step annotations are out of scope (the live sidebar provides the same confirmation interactively).
- The validation-playbook generator (`scripts/generate-hazbot-validation-playbook.js`) has fixture-based tests: a small synthetic rule-set TS module under `scripts/__fixtures__/` (or reuse the extraction-script fixture's output as input), the script runs against it during CI, and the generated markdown is asserted against expectations (snapshot or per-field assertions, implementer's choice). Tests cover at minimum: per-leaf breakdown for boolean factor variables, comparison-operator leaves (e.g., `uniqueWindValuesUsed.size > 1`), `WITH` sub-expressions (one fixture row per kind), and **at least one fixture row whose expression includes both `OR` and `NOT`** (e.g., `setDroughtLevel AND (NOT usedOneSparkPerZone OR uniqueWindValuesUsed.size > 1)`) — the test asserts the rendered markdown preserves the logical structure with "ALL of:" / "ANY of:" / "NOT" markers (Finding 18). A regression in the AST-walker surfaces at extraction time rather than during Sam's validation pass.

## Technical Notes

### Active rule sets (current state of the spreadsheet)

| Tab | Topic | Categories | Notable factor vars / props | Engine-loadable | Notes |
|-----|-------|-----------:|----------------------------|:----------------:|-------|
| 23 | Drought (2 zones) | 5 | `ranSimulation`, `setDroughtLevel`, `setAnyZoneVar`, `usedOneSparkPerZone` | ✅ | Simplest tab — booleans only, no `WITH`. Defaults: terrain Plains/Plains, vegetation Shrub/Shrub, drought Mild/Mild. |
| 24 | Wind | 5 | `uniqueWindValuesUsed` (Set), `uniqueNonZeroWindValuesUsed` (Set), `setAnyZoneVar` | ✅ | Uses `.size`, `==`, `>`, parenthesized `NOT (uniqueWindValuesUsed.size > 1)`. Defaults: wind 0/0. |
| 25 | Sparks at top/bottom + graph | 6 | `TwoSparks`, `OneSparkPerZone`, `SparksAtTopAndBottom` (stub), `GraphOpen` | ✅ (cat 6 unreachable due to `SparksAtTopAndBottom` stub) | Heavy `WITH` usage. `GraphOpen` from `chartTabOpenAtStart` (via `ambientState`) + `ChartTabShown` updates. |
| 32 | Vegetation (3 zones) | 6 | `UniqueVegetationPerZone`, `UniformDroughtLevels`, `OneSparkPerZone` | ❌ blocked: defaults TBD | Three-zone activity — `OneSparkPerZone` requires `sparks.length === 3`. Engine refuses to load until terrain/vegetation/drought defaults are filled in at source (per Requirement 11a). |
| 33 | Forest w/ vs w/o suppression | 5 | `ForestWAWOSuppression`, `setAnyVar`, `setWind` | ❌ blocked: defaults TBD | Engine refuses to load until terrain/vegetation/drought/wind defaults are filled in at source. |
| 34 | Intense fire | 5 | `simulationRuns` (array), `sawIntenseFire` (stub), `setVegetation` | ❌ blocked: defaults TBD | First tab using array `.length`. Depends on `sawIntenseFire` stub. Engine refuses to load until vegetation defaults are filled in at source. |
| 35 | Forest w/ vs w/o suppression (extended) | 6 | `ForestWAWOSuppression`, `UniformTerrainTypes`, `UniformDroughtLevels`, `OneSparkPerZone` | ❌ blocked: defaults TBD | Last-row note says factor variables are the same as 33's plus `UniformTerrainTypes`. Both 33 and 35 ship — PM picks per activity-page (OQ5). Defaults same status as 33. |
| 54 | (incomplete) | 5 (no pseudocode) | n/a | ❌ not loadable | No pseudo-code column. Treated as not-yet-authored. |

Empty / placeholder tabs: `43`, `45`, `47` (marked "TBD (activity revision)" in the ticket) — not loadable.

**Engine-loadable summary**: 3 of 11 rule-set tabs (`23`, `24`, `25`) are loadable today; `25`'s success category is unreachable due to the `SparksAtTopAndBottom` stub. Tabs `32`–`35` unblock as soon as Sam fills in defaults at source. Tab `54` and `43`/`45`/`47` remain non-loadable until authored. (The 11 rule-set tabs are the 8 active + 3 placeholder; the spreadsheet's README tab is a grammar reference, not a rule set, and is not counted here.)

### Lifecycle event log calls already in production

Every input event the engine needs is already logged (verified by `grep` against the wildfire-model source):

- [src/components/bottom-bar.tsx](../../src/components/bottom-bar.tsx) — `SimulationStarted`, `SimulationStopped`, `SimulationEnded`, `SimulationRestarted`, `SimulationReloaded`
- [src/components/top-bar/top-bar.tsx](../../src/components/top-bar/top-bar.tsx) — `SimulationEnded` (with `reason: "TopBarReloadButtonClicked"`), `TopBarReloadButtonClicked`
- [src/components/right-panel.tsx](../../src/components/right-panel.tsx) — `ChartTabShown`, `ChartTabHidden`
- [src/components/app.tsx](../../src/components/app.tsx) — `SimulationEnded` (`reason: "ByItself"` on natural burnout)

### Reading shape

A `Reading` represents engine state at a point in time, captured when a trigger event fires. The substrate defines a minimum `BaseReading` interface (fields the engine itself reads); the wildfire app extends it as `WildfireReading extends BaseReading` with simulation-specific fields. See "Library scope and the Reading boundary" below for the substrate/app split.

**Substrate-owned (`BaseReading`)**:

- `sessionId` — opaque, locally-generated id created once when the engine boots at page load (see "Session id" below). Every reading produced during this page load carries the same `sessionId`. Provides a stable handle for future features (persistence to Firebase / LARA via AP-73, cross-tab disambiguation, "did the engine restart unexpectedly" diagnostics). Not used by any current rule.
- `triggeredBy` — the trigger event type (e.g. `"SimulationStarted"`)
- `at` — timestamp the reading was created
- `updates: ReadingUpdate[]` — append-only audit trail of modifier events that mutated this reading after creation. Each entry: `{ at, source, value }` where `at` is the modifier event's timestamp, `source` is the modifier event type (e.g. `"ChartTabShown"`), and `value` is the value the update sets (e.g. `true` for `ChartTabShown`).

**App-owned (`WildfireReading extends BaseReading`)**:

- The reduced/derived attributes from that trigger's payload (e.g. for `SimulationStarted`: `zones`, `sparks`, `wind`).
- Ambient app state forwarded via the trigger event's `ambientState` (Requirement 3a). For `SimulationStarted` this includes `chartTabOpenAtStart: boolean` — the chart-tab state at the moment the run began, captured by the call site without the engine having to track it. Other future ambient flags are added to `ambientState` at the relevant call site without engine changes.

The wildfire-specific fields are populated by the app's `translate` callback (passed to the `Engine` constructor — see "Library scope and the Reading boundary" below). The substrate sees them only through the typed `TReading` parameter, never by name.

The exact `WildfireReading` field set is shaped by the rule sets the app must support. **The semantics of how `updates` collapse into a per-Reading value are defined per simulation property, not by a single rule.** Different sim-props need different aggregations:

- **Existence ("was it ever opened?")** — what `GraphOpen` actually wants. Defined by the sheet as *"whether or not graph was opened from the beginning of the simulation or during the simulation."* Does NOT depend on whether the graph is currently open at the moment we evaluate the predicate. Simply: was the graph in the open state at any point between this run starting and the rule being evaluated?
  ```ts
  GraphOpen(r: Reading) ≡ r.ambientState?.chartTabOpenAtStart
                       || r.updates.some(u => u.source === "ChartTabShown")
  ```
  - `chartTabOpenAtStart` covers "from the beginning of the simulation" (graph was already open when the run started — student opened it earlier).
  - `updates.some(u => u.source === "ChartTabShown")` covers "during the simulation" (a `ChartTabShown` event fired during the run).
  - A subsequent `ChartTabHidden` does NOT undo `GraphOpen` — the predicate is monotone within the run, since "was opened" can't become "was never opened."
- **Counts / durations / sequences** — fall out from walking the `updates` array directly when a future rule needs them (none in the current sheets).

Each simulation property defines its own aggregator. The `updates` array is a faithful audit trail; sim-props decide what the array means. No "current value" or "latest update wins" interpretation is implied by the substrate.

#### Inputs: triggers vs. modifiers

The ticket lists seven engine inputs. They split into two groups:

**Triggers** — each creates a new Reading appended to `readings`:

- `SimulationStarted` — start-of-run snapshot. Captures full run config (zones, sparks, wind) plus ambient `ambientState` (e.g. `chartTabOpenAtStart`) populated by the call site.
- `SimulationEnded` — end-of-run reading with `reason` (`"ByItself" | "SimulationRestarted" | "SimulationReloaded" | "TopBarReloadButtonClicked"`) and `outcome` payload.
- `SimulationStopped` — end-of-run reading for pause / fire-line-mode transitions, also carries `outcome`.

**Modifiers** — never create a new Reading. They append a `ReadingUpdate` to the latest Reading **only when the latest Reading was triggered by a run-start trigger** (per the bridge-supplied `runStartTriggers` set on the constructor opts):

- `ChartTabShown`, `ChartTabHidden` — append `{ source, value: true|false, at }` to the latest Reading's `updates`, *if* the latest Reading's `triggeredBy` is in `runStartTriggers` (for wildfire: `["SimulationStarted"]`). Otherwise the modifier is orphaned — see below.

**Orphan modifiers**: A modifier event that arrives when there is no current valid in-progress run is dropped rather than attaching to a prior-run Reading. The engine appends an `{ kind: "orphan-modifier", source, reason, event, at }` entry to `errors` — `reason` is one of `"no-prior-trigger"` (engine just booted, no trigger ever fired), `"prior-trigger-failed"` (the most recent trigger failed ambient validation per Req 3b), or `"between-runs"` (the latest Reading exists but its `triggeredBy` is not in `runStartTriggers` — typically because a `SimulationEnded` or `SimulationStopped` Reading is now latest and the run window has closed). `event` is the dropped `ConsumedEvent` itself, kept on the error so the panel can show its payload — see "Context derivation" above. Detected derivationally:

```ts
const lastReading = readings.at(-1);
const lastFailedTrigger = errors.findLast(e => e.kind === "ambient-validation");
const runStartTriggers = opts.runStartTriggers; // undefined → "all triggers are run-start"

if (!lastReading && !lastFailedTrigger) return "orphan: no-prior-trigger";
if (lastReading && lastFailedTrigger && lastFailedTrigger.at > lastReading.at) return "orphan: prior-trigger-failed";
if (!lastReading && lastFailedTrigger) return "orphan: prior-trigger-failed";
// lastReading exists and is more recent than any failed trigger; check run-window state.
if (runStartTriggers && !runStartTriggers.includes(lastReading.triggeredBy)) return "orphan: between-runs";
return "attach-to-lastReading";
```

Order matters: `prior-trigger-failed` is checked before `between-runs` because an ambient-validation failure on a SimulationStarted that arrived after the previous SimulationEnded should classify as `prior-trigger-failed` (the immediate cause), not `between-runs` (the run-window state). When `runStartTriggers` is undefined, the substrate falls back to the pre-Finding-11 behavior (modifiers attach to any latest reading); the `between-runs` branch is only reachable when the bridge opts in to the run-window contract.

Comparing only against `ambient-validation` errors (not the latest entry across `readings ∪ errors` overall) avoids misclassifying legitimate modifiers as orphans when an unrelated error — like a `stub-warning` emitted at load or an `impl-eval-throw` during evaluation — happens to be the most recent `errors` entry.

**No-ops** (events the engine receives but does nothing for):

- `SimulationRestarted`, `SimulationReloaded` — the preceding `SimulationEnded` already captured the reason. Listed in inputs because the ticket calls them out, but the engine has no behavior wired to them.
- `TopBarReloadButtonClicked` — triggers a full page reload (see [src/components/top-bar/top-bar.tsx:28](../../src/components/top-bar/top-bar.tsx#L28)). The engine is destroyed and re-booted on the next page load with a fresh `sessionId` and empty `readings`. The sheet's `GraphOpen` description note about "reset to hidden" is satisfied automatically by the page reload.

**Run-window semantics**: A sim-prop like `GraphOpen` that asks "during this run" looks at the `SimulationStarted` Reading's `chartTabOpenAtStart` (from `ambientState`) and walks the same Reading's `updates` for `ChartTabShown` events. Once the run ends and a `SimulationEnded` (or `SimulationStopped`) Reading is appended, the run window is closed — subsequent modifier events (e.g. the student opening the chart between runs) are **orphans** with `reason: "between-runs"` per the orphan-modifier rule above. They do **not** attach to the SimulationEnded Reading's `updates`, so a future factor variable that includes SimulationEnded readings in its witnesses cannot be polluted by between-run UI changes. When the next `SimulationStarted` arrives, a new run window opens and modifiers resume attaching to the new latest Reading. This contract relies solely on the bridge passing `runStartTriggers: ["SimulationStarted"]` to the engine constructor — without that opt, the substrate falls back to attach-to-any-latest behavior (which preserves backward compatibility for any host app that doesn't need the run-window contract but loses the between-runs-orphan defense).

**Why no `runEndTriggers` opt** (Finding 22): the substrate's run-window contract is fully expressible via `runStartTriggers` alone — the orphan-modifier rule classifies any modifier whose latest reading is not a run-start trigger as `between-runs`, which subsumes both "after a run-end trigger" and "after some other non-run-start trigger that a future host might define." A second `runEndTriggers` opt would only matter if a host needed to distinguish between "explicitly between runs" and "in a non-run state (e.g., session-level triggers that shouldn't count as in a run)" — WM-10 doesn't have that case, so the substrate omits the opt to keep the API surface minimal. Future expansion is a straightforward semver minor bump (per Req 20) if a host introduces non-binary trigger semantics.

#### Session id

The engine generates a `sessionId` once at boot (page load) and attaches it to every `Reading` it produces. The id is a short, URL-safe, random string in the nanoid style — generated locally in `src/hazbot/engine/` (substrate) without an external dependency:

```ts
// nanoid-style id, generated locally — no library dependency
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
function generateSessionId(length = 12): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] & 63];
  return out;
}
```

`crypto.getRandomValues` is a Web API; no npm dependency required. Length 12 gives roughly 2^72 possible ids — far more than enough to distinguish sessions for any plausible scale and avoid accidental collisions when readings are eventually persisted (AP-73). The id is opaque to current rules; it exists to keep optionality for future engine work.

The active `sessionId` is exposed on the engine instance (and on every Reading); host apps that need to surface it can read `useAnalysisEngine().engine.sessionId`. The substrate's debug sidebar deliberately omits it from the visible header — `sessionId` is a future-feature handle (AP-73 persistence, cross-tab disambiguation), not a value testers normally need.

#### Library scope and the Reading boundary

The engine has two layers, separated by a generic `Reading` boundary:

1. **Substrate (future shared library)** — `src/hazbot/engine/` directory. Includes:
   - **Core**: DSL parser, evaluator (matching + non-short-circuiting leaf), WITH binding, error types, factor-variable validation logic, the `Engine<TReading, TDefaults>` class with its `subscribe(listener)` + `getSnapshot()` listener API (Req 19), the `ENGINE_VERSION` constant (Req 20), and the substrate-level interfaces.
   - **React layer** (`src/hazbot/engine/react/`): `AnalysisEngineProvider<TReading, TDefaults>` context + `useAnalysisEngine<TReading, TDefaults>()` hook backed by `useSyncExternalStore` against the engine's listener API.
   - **Sidebar UI** (`src/hazbot/engine/sidebar/`): generic React components rendering `engine.readings`, `engine.errors`, factor-variable values, and per-category truth-coloring through the hook. Generic over `<TReading, TDefaults>` — JSON-pretty-prints the app's reading payload (Req 17 "Generic payload rendering"). Substrate-owned plain `.css` file(s); no SCSS, no MobX (Req 1).

   Substrate code is *not* parameterized by anything wildfire-specific — it operates on `BaseReading`-shaped values and resolves rule-set expressions through declarative interfaces.
2. **App layer (wildfire-specific, stays in this repo)** — declares `WildfireReading extends BaseReading` with simulation-specific fields (`zones`, `sparks`, `wind`, `ambientState: { chartTabOpenAtStart }`), implements concrete `FactorVariableImpl<V, WildfireReading>` instances, provides the `translate` callback that maps incoming events to triggers/modifiers/no-ops, exports `APP_RULES_VERSION` (Req 20), mounts the substrate `AnalysisEngineProvider` in [src/components/app.tsx](../../src/components/app.tsx), and emits `AnalysisEngineActivated` after engine construction.

Substrate-owned types:

```ts
// substrate (future library)
interface BaseReading {
  triggeredBy: string;
  at: number;
  sessionId: string;
  updates: ReadingUpdate[];
}

interface ConsumedEvent {
  name: string;            // e.g. "SimulationStarted"
  data?: unknown;          // public log payload (LARA-bound)
  ambientState?: unknown;  // engine-only ambient app state (Req 3a)
  at: number;              // timestamp the event was emitted
}

class Engine<TReading extends BaseReading, TDefaults = unknown> {
  constructor(opts: {
    ruleSet?: RuleSet<TDefaults>;  // optional — undefined yields a `missing-rule-set` load-failure (Req 10); the constructor always runs to completion and never throws (the bridge decides whether to invoke the constructor at all per FE-4)
    requestedRuleSetId?: string;   // raw URL-param value passed by the bridge (e.g. "23" or "foo"); populates the `ruleSetId` field on a `missing-rule-set` load-failure and surfaces via the matching accessor so the sidebar can show what was attempted even when nothing resolved
    factorVariables: Record<string, FactorVariableImpl<unknown, TReading>>;
    simProps: Record<string, SimPropImpl<TReading, TDefaults>>;  // host-supplied registry of sim-prop predicates referenced by DSL expressions; load-time validation walks both this and `factorVariables` for ambient-state keys + required defaults (Finding 14)
    translate: (event: ConsumedEvent, sessionId: string) =>
      | { kind: "trigger"; reading: TReading }
      | { kind: "modifier"; update: ReadingUpdate }
      | { kind: "no-op" };
    runStartTriggers?: string[];   // optional — trigger event types that open a run window (modifiers attach to a Reading whose triggeredBy is in this set; otherwise orphan with reason "between-runs"). Default: undefined → all triggers are run-start (current pre-Finding-11 behavior preserved). Wildfire passes `["SimulationStarted"]`. The substrate does not separately accept a `runEndTriggers` opt — see "Run-window semantics" in Tech Notes for why one opt is sufficient (Finding 22).
  });
  consume(event: ConsumedEvent): void;
  readings: TReading[];
  errors: EngineError[];
  isActive: boolean;  // false iff `errors` contains a `load-failure` or `parse-error`; `consume()` is a no-op when false
  sessionId: string;  // generated once at construction; exposed for the sidebar even before any reading exists
  ruleSet: RuleSet<TDefaults> | undefined;  // the loaded rule set, retained even on parse-error so the sidebar can render the rubric while the engine is inactive (Req 13). Undefined only when no rule set was provided to the constructor (missing-rule-set load-failure per Req 10).
  requestedRuleSetId: string | undefined;  // mirrors the constructor opt — sidebar fallback when `ruleSet` is undefined
  factorVariables: Record<string, FactorVariableImpl<unknown, TReading>>;  // sidebar reads impls to compute factor-variable values + witnesses
  simProps: Record<string, SimPropImpl<TReading, TDefaults>>;              // sidebar/evaluator reads impls to evaluate WITH-bound prop expressions; same registry the substrate dispatches against during expression evaluation

  // React listener API (Req 19) — backs `useSyncExternalStore` in the substrate hook.
  subscribe(listener: () => void): () => void;  // returns unsubscribe; listener fires after each state-changing operation
  getSnapshot(): number;  // monotonically-increasing version counter; ticks on every state change
}
```

App-owned types (WM-10):

```ts
// app layer (wildfire-specific)
interface WildfireReading extends BaseReading {
  zones?: Zone[];
  sparks?: Spark[];
  wind?: Wind;
  ambientState?: { chartTabOpenAtStart?: boolean };
  // ... extended as future rule sets need
}

type WildfireDefaults = {
  zones?: ZoneDefaults[];
  wind?: { speed: number; direction: number };
};
```

The wildfire app instantiates `new Engine<WildfireReading, WildfireDefaults>({ ... })`, passing its `translate` callback (which knows how to extract `zones`/`sparks`/`wind` from `SimulationStarted` payloads), its factor-variable implementations (typed against `WildfireReading`), and a `RuleSet<WildfireDefaults>` from the generated rule-set modules.

**Why this split**:
- Library extraction (Req 1) becomes a directory move with no type changes — the substrate has zero wildfire-specific types in its source.
- A second simulation that adopts the engine declares its own `Reading extends BaseReading` and its own `Defaults` type, plus its own factor-variable implementations; the substrate stays untouched.
- Reading-shape and defaults-shape evolution (adding a payload field or a default for a future rule set) is purely an app-side concern — the substrate doesn't know.
- The substrate/app boundary makes "what's wildfire-specific?" answerable by inspection: anything parameterized by `TReading` or `TDefaults`, anything inside the wildfire-bridge layer.

**Implementation location**: substrate code lives under `src/hazbot/engine/` — this is the future library directory. Substrate sub-folders include `src/hazbot/engine/react/` (Provider + hook) and `src/hazbot/engine/sidebar/` (debug sidebar UI + plain `.css` file(s)). Wildfire-bridge code lives at `src/hazbot/wildfire/` (the `WildfireReading` and `WildfireDefaults` declarations, factor-variable implementations typed against `WildfireReading`, the `translate` callback the bridge passes to the substrate's `Engine` constructor, `APP_RULES_VERSION`, the engine-singleton factory that mounts the Provider into the app tree, and the `AnalysisEngineActivated` log emission helper) and `src/hazbot/rule-sets/` (generated modules + `index.ts`); a top-level `src/hazbot/dsl-grammar.md` is also bridge-layer (it's the dumped sheet README, wildfire-data-derived). The substrate/bridge boundary is enforced by directory structure: nothing in `src/hazbot/engine/` may import from outside that directory (sibling files inside the directory and the React peer dep are allowed); everything outside it may import freely from inside it. When extracted to a shared library, `src/hazbot/engine/` becomes the library root with no source changes; wildfire-bridge code stays in this repo.

#### Substrate public API surface

The substrate's `src/hazbot/engine/index.ts` re-exports exactly the following names. Anything else inside the substrate is internal and not part of the published API. The list is the substrate's contract with host apps; PR review treats additions as architecture-level changes, not implementation details.

**Engine core**:
- `Engine` (class) — host apps construct an engine instance.
- `EngineOpts` (interface) — host apps spec the constructor opts in typed factory wrappers.
- `BaseReading`, `ReadingUpdate`, `ConsumedEvent` (interfaces) — host-side `TReading` shape and event-passing contract.
- `EngineError` (discriminated union) — host apps may inspect `engine.errors` programmatically (the sidebar already does so internally).
- `RuleSet`, `Category`, `FactorVariableDef`, `FactorVariableImpl`, `SimPropImpl` (interfaces) — host apps author rule sets, factor-variable impls, and sim-prop impls against these shapes; the wildfire bridge concretizes them as `RuleSet<WildfireDefaults>`, `FactorVariableImpl<V, WildfireReading>`, and `SimPropImpl<WildfireReading, WildfireDefaults>`.
- `Expression`, `ParseError` (AST + parser-error types) — exposed for the optional AST-inspection toggle in the sidebar (Req 17) and for advanced consumers building custom expression visualizers; the parser implementation itself stays internal.
- `ENGINE_VERSION` (const string) — semver substrate version, surfaced via the hook (Req 19) and activation log (Req 20).

**React layer**:
- `AnalysisEngineProvider` (component) — wraps the app subtree with the engine and `appRulesVersion`.
- `AnalysisEngineProviderProps` (interface) — host apps may spec props in typed wrappers (e.g., a wildfire-shaped Provider re-export).
- `useAnalysisEngine` (hook) — the access surface for engine state.
- `HookReturn` (type alias) — the named return shape of `useAnalysisEngine`. Surfaced so post-extraction host apps can write typed factory wrappers like `useWildfireAnalysisEngine = (): HookReturn<WildfireReading, WildfireDefaults> => useAnalysisEngine()` (per LIB-3 / PASS3-API-3); without this export the wrapper would have to use `ReturnType<typeof useAnalysisEngine>`, which doesn't propagate the hook's generics cleanly.

**Sidebar UI**:
- `Sidebar` (component) — the top-level debug sidebar. Single required prop `title: string` — the host app's name for the analysis engine instance (wildfire passes `"Hazbot"`; future host apps pass their own name). Light-mode only per Req 17 — no `theme` prop, no theme switching. Host apps mount it directly; sub-components are composed only by `Sidebar` itself.
- `SidebarProps` (interface) — host apps may spec props in typed wrappers.

**Internal (not exported)**: `parse()`, the tokenizer, the matching/leaf evaluator implementations, the defaults validator, the session-id generator, the listener/notify plumbing inside `Engine`, sidebar sub-components (categories panel, readings panel, factor-variables panel, errors panel, expression renderer, etc.). These are implementation details that the substrate is free to refactor without breaking consumers.

Adding to this list is a substrate API expansion (semver minor or major bump per Req 20); removing from it is a substrate API contraction (semver major bump). Future PRs that touch `index.ts` should explicitly call out the API delta in the PR description.

#### Engine state: two append-only substrate logs

The engine's **mutable, domain-visible state** is exactly two append-only substrate logs:

1. **`readings: Reading[]`** — successful trigger interpretations + modifier updates (per the Reading shape above).
2. **`errors: EngineError[]`** — every dev-time message the engine has emitted this session: load errors, parse errors, ambient-validation failures, factor-variable evaluation throws, stub warnings. Append-only audit log; the sidebar's errors panel (Req 17) is a direct view over this log.

The engine **also holds**:

- **Immutable post-construction**: `sessionId: string` (generated once at boot, above), `ruleSet: RuleSet<TDefaults> | undefined`, `requestedRuleSetId: string | undefined`, `factorVariables: Record<string, FactorVariableImpl<unknown, TReading>>`, `simProps: Record<string, SimPropImpl<TReading, TDefaults>>`. These are construction inputs (or generated once at construction) and never mutate afterward.
- **Implementation-internal**: a private listener set + monotonically-increasing snapshot counter, backing the React-layer subscribe/getSnapshot API (Req 19). These are not domain state — they are React-bridge plumbing — but they are mutable across the engine's lifetime.

Ambient app state needed at trigger time arrives via the call site through the log wrapper's `ambientState` parameter (Req 3a) and is captured on the resulting Reading. Modifier events append updates to the latest Reading. There is no other domain-side mutable state — no walk-back routine, no init reading, no separate `matchedCategory` or `warnedStubs` field. Derived domain values (matched category, factor-variable values, per-category truth) are pure functions of the substrate logs + immutable construction inputs (see "Derived values" below).

```ts
type EngineError =
  | { kind: "load-failure"; reason: "missing-rule-set" | "missing-defaults" | "missing-impl"; ruleSetId?: string; detail: string; at: number }
  | { kind: "parse-error"; ruleSetId: string; categoryId: number; expression: string; tokenSpan: { start: number; end: number }; offendingToken: string; detail: string; at: number }
  | { kind: "ambient-validation"; ruleSetId: string; trigger: string; implName: string; missingKey: string; event: ConsumedEvent; at: number }  // implName: factor-variable or sim-prop name (Finding 14 — both impl kinds can emit ambient-validation errors)
  | { kind: "orphan-modifier"; source: string; reason: "no-prior-trigger" | "prior-trigger-failed" | "between-runs"; event: ConsumedEvent; at: number }
  | { kind: "impl-eval-throw"; ruleSetId: string; implName: string; implKind: "factor-variable" | "sim-prop"; readingIndex?: number; thrown: unknown; at: number }  // R17-1: unified across factor-variable compute() throws and sim-prop evaluate() throws; `implKind` discriminates so the rendering map and any programmatic consumer can branch on it. `readingIndex` is optional per EXT-19 — populated for sim-prop throws (the WITH-bound witness reading) and omitted for factor-variable throws (compute operates over the full readings array, the substrate cannot attribute to a single reading without re-running compute incrementally).
  | { kind: "stub-warning"; stubName: string; at: number };
```

**Context derivation** (errors panel, Req 17): where context is derivable from existing engine state, the error carries an index/key rather than duplicating the data:

- `impl-eval-throw`'s `readingIndex` (when present) resolves to the full reading (including trigger event name and payload) via `engine.readings[readingIndex]`. For sim-prop throws (R17-1), `readingIndex` points to the WITH-bound witness reading whose payload triggered the throw inside `evaluate()` and the errors panel hydrates this at render time. For factor-variable throws, `readingIndex` is omitted (per EXT-19) because `compute(readings, defaults)` operates over the full readings array and the substrate cannot attribute the throw to a specific reading without re-running compute incrementally — rejected as too heavy for an error path. The errors panel renders the impl-level message for these (substituting the substrate-known readings count via `renderError`'s optional context) and the developer scrubs the readings panel to investigate.

Where context is *not* derivable — pre-reading failures have no Reading to point at — the error stores the full `ConsumedEvent` directly:

- `ambient-validation` carries the rejected trigger event in `event`. No Reading was appended (Req 3b), so the only place the payload + ambient state survives is on the error itself.
- `orphan-modifier` carries the dropped modifier event in `event`. The modifier never attached to a Reading (Tech Notes' "Orphan modifiers"), so the same logic applies.

`parse-error` carries inline structured context (`categoryId`, `expression`, `tokenSpan`, `offendingToken`) because Req 13 commits to inline highlighting of the offending portion in the per-category sidebar display, and that data is not derivable from any other engine state.

Memory cost of carrying full `ConsumedEvent` on the two pre-reading error variants is bounded by failure count, which is rare by design (errors are the loud-error path, not a normal-traffic path).

**Load-blocking variants**: both `load-failure` and `parse-error` make the engine inactive. `parse-error` was promoted out of `load-failure`'s `reason` union (it used to be `reason: "parse-error"`) because the parser produces a structurally distinct payload — categoryId + token span are required, not optional flavor on a generic load-failure. Keeping the two as siblings clarifies the schema while preserving the shared "engine inactive" consequence.

**Derived values (pure functions of substrate + loaded rule set):**

- **Factor variables / sim properties** ≡ functions over `readings`:
  - `ranSimulation` ≡ `readings.some(r => r.triggeredBy === "SimulationStarted")`
  - `simulationRuns` ≡ `readings.filter(r => r.triggeredBy === "SimulationStarted")`
  - `uniqueWindValuesUsed` ≡ `new Set(simulationRuns.map(windKey))`
  - `OneSparkPerZone` (sim prop, evaluated against a specific reading bound by `WITH`) ≡ `r => r.sparks.length === r.zones.length && distinct zones`
- **`matchedCategory`** ≡ pure function of `(ruleSet, readings)`. For each reading index `i`, evaluate `ruleSet.categories` highest-first against `compute(readings.slice(0, i+1))` and record `highestTrueAt(i)`; `matchedCategory = max over i of highestTrueAt(i)` (with `null` if no category ever matched). Monotonicity (Req 7) falls out for free. Memoizable for sidebar render cost; recomputed only when `readings` grows.
- **`warnedStubs` semantics** ≡ side-effect emission, not state. After the rule set loads and passes validation (defaults + ambient + impl resolution), the engine emits one `stub-warning` to `errors` (and `console.warn`s) for each stub the rule set's expressions reference. No transition machinery, no runtime dedup state — emission is part of the load lifecycle, which runs exactly once per engine instance, so each stub warns at most once per session.
- **Sidebar errors panel** ≡ `errors`, in order, formatted per entry. Rendered at the top of the sidebar (immediately under the header) so load-failures and runtime errors are visible without scrolling. Acts as the single surface for both load-time and runtime errors — there is no separate "Load error" banner. Per-category inline parse-error highlighting (Req 13) consumes the `parse-error` variant's `categoryId`, `expression`, `tokenSpan`, and `offendingToken` fields directly.

For `GraphOpen` specifically: `chartTabOpenAtStart` arrives on the `SimulationStarted` payload's `ambientState` (set by the call site as `chartStore.tabOpen`); during-run chart events append to the reading's `updates`. The combination is sufficient to evaluate the predicate without any engine-internal chart tracking.

#### Error rendering map

The substrate exposes a single source-of-truth mapping from `EngineError.kind` (and discriminating fields like `reason` or `implKind`) to `(severity, message)`. Both the engine itself (for parallel `console.error` / `console.warn` output) and the substrate sidebar's errors panel (Req 17) consume this mapping, so devtools and the sidebar always show the same string for the same error. Storing only the raw `EngineError` shape and deriving presentation centrally keeps the union machine-readable for any future programmatic consumer (analytics export, persistence, log replay) while pinning the canonical rendering in one place.

| `kind` | severity | message template |
|---|---|---|
| `load-failure` (`reason: missing-rule-set`) | error | `Rule set not found: ${ruleSetId ?? "(no ?hazbotRules param)"}` |
| `load-failure` (`reason: missing-defaults`) | error | `Missing defaults: ${ruleSetId} · ${detail}` |
| `load-failure` (`reason: missing-impl`) | error | `Missing impl: ${ruleSetId} · ${detail}` |
| `parse-error` | error | `Parse error in category ${categoryId}: ${detail} (offending: \`${offendingToken}\`)` |
| `ambient-validation` | error | `Missing ambient state for ${trigger}: ${implName} reads ${missingKey}` |
| `orphan-modifier` (`reason: no-prior-trigger`) | error | `Modifier ${source} dropped: no trigger has fired yet` |
| `orphan-modifier` (`reason: prior-trigger-failed`) | error | `Modifier ${source} dropped: prior trigger failed validation` |
| `orphan-modifier` (`reason: between-runs`) | error | `Modifier ${source} dropped: no run currently in progress` |
| `impl-eval-throw` (sim-prop) | error | `Sim-prop ${implName} threw at reading ${readingIndex}: ${String(thrown)}` |
| `impl-eval-throw` (factor-variable) | error | `Factor variable ${implName} threw during computation over ${ctx.readingsLength} readings: ${String(thrown)}` (per EXT-19; render call site supplies `ctx.readingsLength` from `engine.readings.length`) |
| `stub-warning` | warning | `Stub not yet implemented: ${stubName}` |

Templates use placeholder syntax for clarity; implementer chooses formatting (string concat / template literal / i18n hook). Substrate exports a small render helper consumed by the engine's `console.error`/`console.warn` path AND by the sidebar's errors panel — keeping a single function call site means future template edits land in one place. Tests assert each `kind` × `reason` row produces a non-empty message and the documented severity. Adding a new `EngineError` variant or `reason` value is a substrate API expansion (semver minor bump per Req 20) and must add a corresponding row to this table — the spec author and implementer should treat the table as the source of truth for both engine console output and sidebar presentation.

#### Sidebar render cost

Per render, the sidebar runs the non-short-circuiting evaluator over every category × leaf to drive truth-coloring (Req 17). Net cost is roughly **O(C × L × N)** where `C` is the number of categories in the loaded rule set (~5–6), `L` is the number of leaves per category (~10), and `N` is `readings.length`. WITH-bound leaves carry an additional inner factor (per-prop cost over candidate readings), but the candidates are themselves drawn from `readings`, so the net stays bounded by the same N.

`readings` is append-only, so per-category truth evaluation is cleanly memoizable keyed on `readings.length` (or equivalently, on `engine.getSnapshot()` which ticks per state change) — implementation choice, not requirement, but worth noting because `useAnalysisEngine()` re-renders consumers on every snapshot tick (Req 19), and the engine appends to `readings` on every trigger event.

**Implicit budget**: N in the tens, matching typical single-session activity. The current rule sets (3 loadable today, all ≤ 6 categories) sit well inside that. If a future use case approaches N in the hundreds (longer sessions, log replay, or rule sets with deeper WITH nesting), the implementation should re-measure rather than assume the linear factor stays imperceptible.

#### Factor-variable implementation interface

Factor-variable implementations are hand-written TS modules (per Req 14) that bridge the DSL (rule expressions) and the readings substrate. Each implementation entry has the following shape:

```ts
interface FactorVariableImpl<V = unknown, TReading extends BaseReading = BaseReading, TDefaults = unknown> {
  // Per-trigger-event ambient-state keys this impl reads. Validated by the engine
  // at trigger time (Req 3b). Declared by the code author, not the sheet author.
  ambientStateKeys?: { [triggerEventType: string]: string[] };

  // Defaults paths this impl reads to compute its value. The engine validates at
  // load time (Req 11a) that every path here resolves to a non-undefined value
  // on the rule set's `defaults`. Paths use dotted notation; `[*]` applies to
  // all entries of an array. Examples: "wind.speed", "zones[*].terrainType".
  // Declared by the code author, not the sheet author.
  requiredDefaults?: string[];

  // Substrate-required fallback returned by `safelyEvaluateImpl`/`evaluateForRender`
  // on impl throw (per ENG-1). Declare per the impl's value type:
  // `false` for boolean, `new Set()` for Set-typed, `[]` for array-typed, etc.
  defaultValue: V;

  // When true, the substrate emits a `stub-warning` for this impl at load
  // (per Req 6 / IMPL-4). Optional metadata, fits alongside the other optional fields.
  isStub?: boolean;

  // Computes the factor variable's current value plus provenance. `witnesses` is
  // the subset of readings that materially contributed to the value (e.g., the
  // readings whose wind keys make up `uniqueWindValuesUsed`). Empty array is valid.
  // `TReading` is the app's reading shape — for WM-10 this is `WildfireReading`
  // (see Tech Notes' "Library scope and the Reading boundary"). `defaults` is the
  // rule set's defaults — symmetric with `SimPropImpl.evaluate(reading, defaults)`,
  // letting comparison-against-default impls (e.g., `setDroughtLevel`) read the
  // baseline at compute time. Same load-time `requiredDefaults` validation applies.
  compute: (readings: TReading[], defaults: TDefaults) => { value: V; witnesses: TReading[] };
}
```

Factor-variable impls receive defaults at compute-time, with the same load-time `requiredDefaults` validation pattern as before — the substrate validates declared paths resolve before the engine becomes active, so impl authors can read defaults fields without null-guards inside the active path.

A factor-variable implementations module exports a `Record<string, FactorVariableImpl>` keyed by factor-variable name; the engine resolves a `FactorVariableDef` (sheet-extracted metadata) to its `FactorVariableImpl` (code) by name lookup at load time. If a `FactorVariableDef` has no matching implementation, the engine rejects the rule set per the "fail loudly" pattern.

#### Sim-prop implementation interface

Sim-props are bridge-side TS predicates evaluated against a single Reading bound by `WITH` (per Reqs 5, 12). The substrate dispatches sim-prop names from parsed expressions to implementations via a host-supplied registry. Each implementation entry mirrors `FactorVariableImpl`:

```ts
interface SimPropImpl<TReading extends BaseReading = BaseReading, TDefaults = unknown> {
  // Per-trigger-event ambient-state keys this sim-prop's evaluator reads off a Reading.
  // Validated by the engine at trigger time (Req 3b) — load-time validation walks
  // sim-props referenced by category expressions, not just factor variables, so a
  // sim-prop that reads `r.ambientState?.chartTabOpenAtStart` (e.g., `GraphOpen`)
  // declares it here. Without this declaration, a forgotten call-site update would
  // silently make the sim-prop evaluate false — undermining the "fail loudly" goal.
  ambientStateKeys?: { [triggerEventType: string]: string[] };

  // Defaults paths the evaluator reads. Same load-time validation as FactorVariableImpl.
  requiredDefaults?: string[];

  // Evaluates the sim-prop predicate against a single Reading, with access to the
  // rule set's defaults. Pure function — no side effects. Returns a boolean.
  evaluate: (reading: TReading, defaults: TDefaults) => boolean;
}
```

A sim-prop implementations module exports a `Record<string, SimPropImpl>` keyed by sim-prop name (the UpperCamelCase identifier in DSL expressions); the engine resolves sim-prop names referenced by parsed AST expressions to their `SimPropImpl` (code) by name lookup at load time. If a referenced sim-prop has no matching implementation, the engine rejects the rule set with `{ kind: "load-failure", reason: "missing-impl", ... }` per the same "fail loudly" pattern that covers factor variables. The wildfire bridge supplies a sim-prop registry for `OneSparkPerZone`, `UniqueVegetationPerZone`, `UniformDroughtLevels`, `UniformTerrainTypes`, `ForestWAWOSuppression`, `TwoSparks`, `GraphOpen`, plus the stubbed `SparksAtTopAndBottom` (per Req 6, returns false + emits a stub-warning at load).

**`requiredDefaults` path syntax**: dotted segments traverse object fields; `[*]` traverses every entry of an array. A path is satisfied iff (a) every intermediate segment resolves to a non-null/non-undefined value, and (b) for `[*]` segments, the array is defined and non-empty AND every entry has the remaining suffix path satisfied. So `"zones[*].terrainType"` requires `defaults.zones` to be an array of one or more entries, each with a defined `terrainType`. An empty `zones` array fails validation; an undefined `zones` fails validation. Validator failures append a `{ kind: "load-failure", reason: "missing-defaults", ... }` entry to `errors` (and `console.error` in parallel; engine inactive) naming the rule set, factor variable, and the specific path that failed — including the offending array index for `[*]` failures (e.g., `"zones[1].terrainType is undefined"`).

**Evaluator interface extensions:**

- **WITH evaluator** returns `{ value, boundReading?: Reading, candidateEvaluations?: Array<{ reading, propResult, perPropDetails }> }`. When `value === true`, `boundReading` is set to the witness reading. When `value === false`, `candidateEvaluations` records the per-reading evaluation for the false-case explanation in the sidebar. **Candidate set**: for `varName WITH propExpr`, the WITH evaluator iterates over `varName`'s `compute(readings).witnesses` array — those are the candidate readings. propExpr is evaluated against each witness; the WITH evaluates true iff at least one witness satisfies propExpr. Boolean factor variables supply witnesses by returning the readings that triggered the boolean true (e.g., `ranSimulation` returns the `SimulationStarted` readings; `setDroughtLevel` returns the `SimulationStarted` readings whose drought differs from the default). Set/array factor variables return the readings whose values populate the Set/array. **Empty witnesses** (e.g., `ranSimulation` is false because no `SimulationStarted` has fired yet) yields zero candidates and the WITH evaluates to `false` — `boundReading` is undefined, `candidateEvaluations` is empty. Tying WITH semantics to `witnesses` means WITH binding is uniform across factor-variable types and stays in sync with the per-factor compute function (no separate "WITH candidate filter" the rule-set author has to maintain).
- **Leaf evaluator** (for the sidebar's truth-coloring) does a non-short-circuiting pass that records the truth value of every leaf node in the AST. The matching evaluator (used to pick the matched category) can short-circuit normally; the sidebar uses the non-short-circuiting pass.

These are debug-mode-friendly extensions, not separate modes — the engine always produces the provenance data and runs the load-time ambient-key validation; the sidebar consumes the provenance. Memory cost is bounded by the readings array size, which is itself bounded by single-session activity (typically tens of readings per session).

#### Payload shape assumptions

The engine assumes log-event payloads conform to the TypeScript shapes declared on each trigger event. Payload shape divergence (e.g., a refactor that drops a field from `SimulationStarted`) surfaces as a TS error against the engine's input types or as an impl evaluation throw at runtime; the engine does not perform runtime payload validation. Both factor-variable `compute()` throws and sim-prop `evaluate()` throws (R17-1) are caught by a substrate-level `safelyEvaluateImpl` wrapper, appended to `errors` as `{ kind: "impl-eval-throw", implName, implKind: "factor-variable" | "sim-prop", readingIndex, thrown, ... }`, and logged via `console.error` per the rendering map (Req 17 / Finding 19) — a single bad reading does not poison subsequent readings, and the same error model covers both impl kinds with one variant.

### Hooking the engine into the existing log stream

The wildfire-model already wraps `lara-interactive-api`'s `log()` via [src/log.ts](../../src/log.ts):

```ts
export const log = logMonitor
  ? createLogWrapper(laraLog)
  : laraLog;
```

The Hazbot work updates this wrapper to:

1. Accept an optional third `ambientState` parameter (Requirement 3a). The first two args continue to the existing log destinations (LARA / logMonitor) unchanged; `ambientState` is engine-only and never sent to LARA.
2. Forward `{ name, data, ambientState, at }` to the Hazbot engine when `?hazbotRules` is set, in addition to the existing destinations.

Separately, the wildfire-bridge fires the `AnalysisEngineActivated` log event (Req 20) once at engine-construction time when `engine.isActive`. The activation event flows back through the same `log()` wrapper so LARA captures it, and the bridge's `translate` callback maps `AnalysisEngineActivated` to `{ kind: "no-op" }` so the engine doesn't consume its own activation.

Sketch:

```ts
type LogFn = (name: string, data?: unknown, ambientState?: unknown) => void;

// External destinations (LARA / logMonitor) — wrapper constructed once at module init,
// matching the existing src/log.ts pattern. Recreating the wrapper per call would leak
// log-monitor's wrapper state and break its filtering / dedup behavior.
const externalLog = logMonitor
  ? createLogWrapper(laraLog)
  : laraLog;

export const log: LogFn = (name, data, ambientState) => {
  externalLog(name, data);                      // unchanged destinations: ambientState is engine-only

  // Engine-only fork (no-op when no engine exists or the engine is inactive — Req 10).
  // getAnalysisEngine() is a memoized lazy accessor — returns the bridge-constructed
  // engine singleton when at least one URL flag (`?hazbotRules` or `?hazbotSidebar`)
  // is set, undefined otherwise (FE-4's zero-cost no-flags path). The flag check
  // happens once at module init; subsequent calls return the cached ref or undefined
  // without re-checking. Calling it per `log()` instead of capturing once at module
  // init avoids a permanent-undefined trap if `src/log.ts` runs before the bridge's
  // engine factory is reachable (import-order resilience).
  const engine = getAnalysisEngine();
  if (engine?.isActive) {
    engine.consume({ name, data, ambientState, at: Date.now() });
  }
};

// Bridge boot — runs once when the engine-singleton factory constructs the engine.
function bootAnalysisEngine(): Engine<WildfireReading, WildfireDefaults> {
  const engine = new Engine({
    /* ruleSet, factorVariables, simProps, translate, requestedRuleSetId, ... */
    simProps: wildfireSimProps,                                    // Finding-14 sim-prop registry — includes GraphOpen with ambientStateKeys: { SimulationStarted: ["chartTabOpenAtStart"] }
    runStartTriggers: ["SimulationStarted"],                       // Finding-11 run-window contract; substrate's only run-window opt (no runEndTriggers — Finding 22)
  });
  if (engine.isActive && engine.ruleSet) {
    log("AnalysisEngineActivated", {
      engineVersion: ENGINE_VERSION,
      appRulesVersion: APP_RULES_VERSION,
      ruleSetId: engine.ruleSet.id,
      // sessionId intentionally omitted — stays engine-local (Req 20 / R9-7)
    });
  }
  return engine;
}
```

**The engine substrate has no compile-time dependency on `src/log.ts`.** The wildfire-bridge layer (the `WildfireReading` declaration, factor-variable implementations, and the `translate` callback the bridge passes to the substrate's `Engine` constructor) imports types from `src/log.ts` freely — that's where wildfire-specific event payload types live. The wrapper in `src/log.ts` imports the wildfire-bridge module (not the substrate directly), and the wildfire-bridge module imports both the substrate and `src/log.ts`. Net direction: `src/log.ts` → wildfire-bridge → substrate. The substrate is the lowest layer and depends on nothing outside itself. See Tech Notes' "Library scope and the Reading boundary."

### Event-data path notation

The DSL's `Event->prop.<i>.x` notation lives inside the *factor-variable definition* (informational metadata in the JSON), not inside rule expressions. Rule expressions only reference factor-variable names and simulation-property names. Therefore the DSL parser does not need to parse `Event->prop.<i>.x` syntax — that notation exists to document how factor-variable TypeScript code consumes the event payload. The factor-variable computation is hand-written TypeScript that reads, e.g., `event.payload.zones[i].terrainType`. **On disk, the path notation is preserved as free-form text inside `FactorVariableDef.details` (sourced verbatim from the sheet's Details column); there is no structured `eventDataPaths` field on `FactorVariableDef`.** A reviewer reading the generated rule-set TypeScript module sees the notation as part of the `details` string; the playbook generator (Acceptance Criteria) inlines `details` per factor variable so the path notation reaches Sam's validation checklist alongside the prose definition.

### Rule-set TypeScript shape

The extraction script ([scripts/extract-hazbot-sheets.js](../../scripts/extract-hazbot-sheets.js)) generates one TypeScript module per sheet tab plus an `index.ts` aggregating them. Each per-tab module exports a typed `RuleSet<WildfireDefaults>` — `RuleSet` is a substrate-owned generic; `WildfireDefaults` is wildfire-bridge-owned (per "Library scope and the Reading boundary").

Substrate-owned types:

```ts
// substrate (future library)
export type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

export interface RuleSet<TDefaults = unknown> {
  id: string;                       // tab name, e.g. "23"
  categories: Category[];           // ordered lowest-to-highest by id; matching evaluator iterates in reverse (highest-first)
  factorVariables: FactorVariableDef[];
  defaults: DeepPartial<TDefaults>; // per Requirement 11a + EXT-8 — partial typing lets generated rule sets emit incomplete defaults
                                    // (e.g., tabs 32–35 with per-zone TBD fields) without TS-level escapes; substrate runtime
                                    // validation walks `requiredDefaults` paths and emits `missing-defaults` load failures for
                                    // unresolved paths; bridge-side impls receive `defaults: TDefaults` (cast internally by
                                    // `safelyEvaluateImpl` when `isActive`).
}

export interface Category {
  id: number;                       // 1, 2, 3, ...
  studentAction: string;
  feedback: string;                 // student-facing text
  visualFeedback: string;
  arrowText?: string;               // optional — only tab 23 has this column
  expression: string;               // DSL pseudo-code, parsed at runtime
}

export interface FactorVariableDef {
  name: string;                     // e.g. "ranSimulation"
  definition: string;               // human-readable
  logEvents: string[];              // event types this factor reads from
  details: string;                  // long-form notes from the sheet's Details column, including any `Event->prop.<i>.x` path notation (free-form, not parsed)
}
```

Wildfire-bridge-owned types (`WildfireDefaults` and `ZoneDefaults` live alongside `WildfireReading`, outside the substrate):

```ts
// app (wildfire-bridge)
export type WildfireDefaults = {
  // All fields optional at the type level so the loader can validate per
  // factor-variable need (e.g. tab 24 needs wind defaults but not vegetation).
  zones?: ZoneDefaults[];           // per-zone defaults; index 0 = zone 1, etc.
  wind?: { speed: number; direction: number };
};

export interface ZoneDefaults {
  terrainType?: string;             // e.g. "Plains"
  vegetation?: string;              // e.g. "Shrub"
  droughtLevel?: string;            // e.g. "Mild Drought"
}

// Generated rule-set modules: `export const ruleSet23: RuleSet<WildfireDefaults> = { ... }`.
```

The substrate's load-time defaults validator walks `requiredDefaults` paths against the runtime value of `ruleSet.defaults: TDefaults` via string traversal — no compile-time knowledge of the defaults shape needed (path-traversal semantics defined above under "`requiredDefaults` path syntax").

The extraction script handles:

- Identifying the boundary between rule-row block and factor-variable block (each tab varies — tab 23 has 5 categories then factor vars; tab 35 has 6 categories then a "see tab 33" note).
- Optional columns: tab 23 includes "Text to Go with Arrows" between visualFeedback and pseudocode; tabs 24, 25, 32–35 do not. Output shape is consistent (`arrowText?: string`).
- Parsing default values from the factor-variable Details column (e.g. `'Default values = "Plains" (zone 1), "Plains" (zone 2)'`) into the structured `defaults` field. When the Details column says "TBD" (tabs 32–35 today), those defaults stay absent — the engine's load-time validator (Requirement 11a) catches the gap.
- Empty / placeholder tabs (`43`, `45`, `47`, `54`): excluded from the generated index. Documented in a `_status` comment per tab if useful.
- Escaping strings safely for TS literal output (backticks, quotes, newlines in feedback text).

### Sheet typos and inconsistent naming

The ticket flags `setVegation`, `ForestWAWOSuppresion`, `setAntVar`, `setVegetatoin`. The one I confirmed in the downloaded sheet was `ForestsWAWOSuppression` (extra `s`) in tab 33's details column — fixed at source on 2026-05-08 and verified in the re-downloaded export. The rule-expression columns already used the correct spelling `ForestWAWOSuppression`. The DSL parser will reject any unknown identifier, so any remaining typos surface immediately as parse errors when the rule set loads. Preferred fix is at the source in the sheet (so authors can re-export); the engine must not silently accept typos.

### Test framework

Jest 29 + jsdom + React Testing Library + MobX react. Existing log-event tests live at [src/components/log-events.test.tsx](../../src/components/log-events.test.tsx); same pattern (mock `src/log.ts`, drive interactions via RTL) applies here, but engine unit tests can be plain Jest (no React) since the engine is pure.

### Extraction script

`scripts/extract-hazbot-sheets.js` reads an `.xlsx` workbook (e.g. exported from Google Sheets) and writes one TypeScript module per tab plus an aggregating `index.ts` to a target directory. Default output is `src/hazbot/rule-sets/`. Each generated module exports a typed `RuleSet<WildfireDefaults>` object (see "Rule-set TypeScript shape" above for the shape). Uses [`read-excel-file`][rxf] as a devDependency (small footprint, no advisories — see OQ11). Re-run on each sheet update; the auto-generated header (per Req 11) survives so accidental hand-edits surface in PR review.

**Residual drift risk**: because the source `.xlsx` is local-only (per the resolved Direct-Sheets-fetch question), CI cannot detect when committed rule-set modules go stale relative to a sheet edit that was never re-extracted. The auto-generated-header CI assertion (Acceptance Criteria) catches accidental *hand-edits* of generated files but not this drift case. The mitigation is process — sheet edits are paired with a re-extraction commit. If this fails in practice, escalation options to revisit later: (a) commit the `.xlsx` to the repo and run extraction in CI with `git diff --exit-code`; (b) move to a Sheets-API fetch in a follow-up so CI can pull the live source.

**Grammar/parser drift — implicit parser-update obligation**: a non-empty diff in `src/hazbot/dsl-grammar.md` (the dumped sheet README) is a signal that the DSL grammar definition has changed at source — added operator, modified WITH semantics, new identifier convention, etc. The parser is hand-written TS and does not auto-update from this file; the file is documentation. PR reviewers seeing a `dsl-grammar.md` change should treat it as a flag to verify the parser still implements the documented grammar — typically by adding parser tests that exercise the new construct, or by confirming the change is purely editorial (typo, formatting). Framed as a process expectation rather than a CI check because the sheet README is edited rarely and by one author; a CI fixture-capture test would be over-investment relative to the drift frequency.

[rxf]: https://www.npmjs.com/package/read-excel-file

#### Local artifacts (not canonical — user-local, dmartin@concord.org as of 2026-05-08)

Source spreadsheet (downloaded from the Google Sheet):

```
/home/doug/Downloads/Wildfire Hazbot Feedback Tables.xlsx
```

Inspect the extracted JSONs (one per tab) without committing anything to the repo:

```bash
node scripts/extract-hazbot-sheets.js \
  "/home/doug/Downloads/Wildfire Hazbot Feedback Tables.xlsx" \
  /tmp/hazbot-rule-sets
ls /tmp/hazbot-rule-sets   # README.json, 23.json, 24.json, …, _manifest.json
```

These are **scratch artifacts for spec-drafting and review**, not implementation deliverables. The implementation will:

1. Generate `.ts` modules under `src/hazbot/rule-sets/` (per Requirement 11), not raw JSON in `/tmp`.
2. Commit the generated `.ts` files; the source `.xlsx` stays local (per OQ12).

## Out of Scope

- Student-facing "Check my work!" button and feedback popover (see WM-6 rescoped).
- Firebase persistence + LARA API hooks (see AP-73). AP-73 also implements cross-visit monotonicity (one-way ratcheting per the resolved OQ "Does monotonicity carry across student visits?", Option A) by persisting the matched-category floor and seeding it on engine boot.
- Activating grayed-out questions (see AP-76).
- Extracting the engine into a shared library — deferred until a second simulation needs it.
- Live fetching of rule sets from the Google Sheets API (use the xlsx export workflow for this story).
- Authoring UI for editing rule sets — JSONs are regenerated from the sheet.
- Implementing `SparksAtTopAndBottom` ridge/valley detection — stubbed only.
- Implementing `sawIntenseFire` outcome detection — stubbed only.
- Tab `54` (no pseudo-code authored).
- Empty placeholder tabs `43`, `45`, `47` (marked "TBD (activity revision)" in the source sheet).
- Log replay / import — driving the engine from a captured log sequence rather than live interaction. Deferred to a possible follow-up if Sam's live-validation pass surfaces gaps that warrant deterministic replay.
- **Per-app reading-payload renderer slot in the substrate sidebar** — a render-prop or strategy interface that lets the host app substitute a richer per-`TReading` display in place of the substrate's generic JSON pretty-print (Req 17's "Generic payload rendering"). The substrate sidebar lands as zero-config in WM-10 — JSON-rendering whatever the engine carries — and a customization slot is a candidate WM-6-era extension if real-world use surfaces a need. Adding a render-prop preemptively risks designing the wrong shape; deferring keeps the substrate's public API minimal until a concrete second consumer demands it.

## Open Questions

### RESOLVED: Rule-set on-disk format
**Context**: The ticket said "TSV exported from each sheet tab" (e.g., `src/hazbot/rule-sets/23.tsv`). During scoping we evaluated TSV vs JSON vs generated TypeScript.
**Options considered**:
- A) Raw 2D-array JSON — runtime parsing, no compile-time shape check.
- B) TSV per ticket — runtime parsing, no compile-time shape check, escaping ambiguity for cells containing tabs.
- C) Pre-shaped JSON — runtime validation still required; no compile-time check.
- D) Generated TypeScript modules — extraction script emits `<id>.ts` exporting a typed `RuleSet`; `index.ts` exports the keyed map. Compile-time shape checking; no runtime JSON parsing; DSL expressions remain strings (parsed by the runtime DSL parser).

**Decision**: D — generated TypeScript. Rationale: rule sets are code-adjacent data, referenced by code identifiers, loaded by code; generated `.ts` modules give compile-time shape checking and IDE autocomplete, and shrink the runtime loader's job to "evaluate the DSL strings and walk readings." DSL identifier validation remains a runtime concern (the parser must surface unknown identifiers as errors).

---

### RESOLVED: WITH operator — README is authoritative
**Context**: The ticket flagged WITH as a blocker, but the sheet's README tab does in fact define it: rule 3 says `<var-w-prop-expression>` takes the longest possible prop expression (greedy), where a "prop expression" is operators + UpperCamelCase identifiers only. Four worked examples (`a`–`d`) confirm.
**Options considered**:
- A) Confirm with Sam that the README's greedy-binding definition + worked examples are authoritative.
- B) Treat the README as authoritative without Sam confirmation.
- C) Ask Sam for additional examples covering corner cases.

**Decision**: B — README is authoritative. Background section documents the greedy-binding rule and contrasts it with the lowercase-identifier-terminates-prop-expression rule. Parser tests cover the worked examples plus corner cases (NOT inside WITH, parenthesized WITH, comparisons inside WITH).

---

### RESOLVED: AND/OR precedence
**Context**: The README tab leaves AND/OR precedence open. Current rule sets don't mix AND and OR in the same expression, but the parser needs a defined behavior.
**Options considered**:
- A) Standard logic precedence: NOT > AND > OR.
- B) Strict left-to-right at equal precedence with parens required for mixed AND/OR.
- C) Defer until a sheet actually mixes AND and OR.

**Decision**: A — standard logic precedence. Full operator precedence (highest = tightest binding):

1. **`varName WITH propExpression`** — highest, per README PRECEDENCE rule i (`<var-w-prop-expression>` takes the highest precedence). The WITH-construct is parsed as a unit before any surrounding logical operators apply.
2. **`( ... )`** — parenthesized sub-expressions are evaluated as a unit.
3. **`.size` / `.length`** accessors and comparison operators (`>`, `<`, `==`, `!=`, `>=`, `<=`).
4. **`NOT`** (unary).
5. **`AND`**.
6. **`OR`** — lowest.

Note: I corrected a misstatement in option A's text. The original wrote "WITH at the lowest binding level," but the README's PRECEDENCE rule i puts `<var-w-prop-expression>` at the *highest* level. The corrected ordering above matches the README.

---

### RESOLVED: TBD default values for terrain / vegetation / drought / wind
**Context**: Tabs 32, 33, 34, 35 mark the default values for terrain / vegetation / drought / wind as "TBD (activity revision)." Without correct defaults, the `setX` factor variables can return wrong results.
**Options considered**:
- A) Block engine rollout for tabs 32–35 until Sam supplies defaults — engine rejects those rule sets at load time.
- B) Source defaults from the wildfire-model preset config — couples engine to preset metadata.
- C) Allow per-rule-set defaults in the rule-set JSON itself with preset fallback.

**Decision**: A — block at load time. Sam supplies defaults at source in the sheet (e.g., per-zone terrain/vegetation/drought defaults plus global wind defaults). The extraction script picks them up; the engine validates that any factor variable referencing a "default-comparing" computation (e.g. `setTerrainType`, `setDroughtLevel`, `setVegetation`, `setWind`) has the necessary defaults available, and throws a clear dev-time error if a rule set is missing required defaults. New requirement added (see Requirement 11a). This effectively gates tabs 32–35 from the engine until the sheet is updated.

---

### RESOLVED: Tab 35 vs tab 33 — ship both
**Context**: Both tabs implement forest-with-vs-without-suppression with overlapping factor variables; tab 35 adds `UniformTerrainTypes` and a 6th category.
**Options considered**:
- A) Confirm with Sam which is canonical; mark the other as "draft / not for engine."
- B) Ship both; engine loads whichever the URL param selects. PM picks per activity-page.
- C) Treat 35 as canonical and remove 33.

**Decision**: B — ship both. Each tab is independently selectable via `?hazbotRules=33` or `?hazbotRules=35`. The PM/curriculum author chooses which rule set applies to a given activity page.

---

### RESOLVED: Sheet typos — fix at source
**Context**: The ticket flags `setVegation`, `ForestWAWOSuppresion`, `setAntVar`, `setVegetatoin`. The one I confirmed in the downloaded copy (`ForestsWAWOSuppression`, extra `s`, tab 33 details column) was fixed at source in the Google Sheet on 2026-05-08.
**Options considered**:
- A) Fix at source in the sheet, then re-export.
- B) Maintain a small alias table in the engine for known historical typos.
- C) Fail loudly on any unknown identifier and require a fix before the rule set loads.

**Decision**: A + C combined. Fix at source whenever an author can; the DSL parser fails loudly on unknown identifiers so any typo (sheet-side or engine-side) becomes an immediate, actionable error rather than a silent miscategorization. No alias table.

---

### RESOLVED: Stub "not yet implemented" log — frequency
**Context**: `SparksAtTopAndBottom` and `sawIntenseFire` always return `false` and log a "not yet implemented" message. Logging on every call would spam the console.
**Options considered**:
- A) Log once per session per stub (module-level `Set` of warned ids).
- B) Log once per rule-set load.
- C) Log on every evaluation.

**Decision**: A — once per session per stub. The engine emits each stub's "not yet implemented" `console.warn` exactly once at engine-construction time, immediately after rule-set load + validation succeed (per Req 6, mechanism finalized by R5-4). Stubs not referenced by the loaded rule set's expressions don't warn. Construction runs once per page load, so emission is structurally bounded — no runtime dedup state (no module-level `Set`, no first-call check) is needed. If load-time validation fails, no stub warnings are emitted (engine is inactive, stubs are unreachable).

---

### RESOLVED: Engine reset semantics on `SimulationRestarted` / `SimulationReloaded` / `TopBarReloadButtonClicked`
**Context**: "In-memory only — state resets on page refresh." Within a session, what happens on Restart / Reload / TopBar-Reload?
**Findings**:
- `TopBarReloadButtonClicked` triggers `window.location.reload()` (see [top-bar.tsx:28](../../src/components/top-bar/top-bar.tsx#L28)) — full page reload, engine destroyed and re-booted with fresh `sessionId` and empty `readings`. The sheet's "chart reset to hidden" condition is satisfied automatically by the page reload.
- `SimulationRestarted`, `SimulationReloaded` — bottom-bar actions; do not reload the page. The preceding `SimulationEnded` already captured the reason. Engine no-ops on these events themselves.
- The `readings` array is never reset within a single page-load session. `SimulationStarted` appends new readings; aggregates (`uniqueWindValuesUsed`, `simulationRuns.length`, etc.) accumulate across Restart/Reload, and the matched category monotonically increases per the ticket's requirement.

**Decision**: A — no engine-driven resets within a session. `TopBarReloadButtonClicked` is handled by the page reload itself; `SimulationRestarted` / `SimulationReloaded` are no-ops; monotonicity is preserved across the full page-load lifetime.

---

### RESOLVED: Debug sidebar URL flag name
**Context**: Need a URL flag name for the Hazbot debug sidebar that doesn't collide with `?hazbotRules`.
**Options considered**:
- A) `?hazbotDebug=true`.
- B) `?hazbotSidebar=true`.
- C) Always-on whenever `?hazbotRules` is set in dev builds.

**Decision**: B — `?hazbotSidebar=true`. Distinct from `?hazbotRules` (which selects the rule set) and `?logMonitor` (which controls the existing log-monitor sidebar).

---

### RESOLVED: Layout when both `?logMonitor=true` and `?hazbotSidebar=true`
**Context**: The existing logMonitor sidebar uses a flex layout in [src/components/app.tsx:109–114](../../src/components/app.tsx#L109-L114). Two sidebars open simultaneously needs a layout decision.
**Options considered**:
- A) Stack vertically in a single right column.
- B) Side-by-side (logMonitor + Hazbot consume two right columns).
- C) Mutually exclusive — Hazbot sidebar suppresses logMonitor when both flags are set.

**Decision**: B — side-by-side. Both sidebars consume their own right column. The simulation content area stays the same; sidebars are added to the right in flex order: simulation → logMonitor (if `?logMonitor=true`) → Hazbot sidebar (if `?hazbotSidebar=true`).

---

### RESOLVED: Devdependency choice for xlsx parsing
**Context**: The extraction script originally used [`xlsx`][sheetjs] (SheetJS), which has known unpatched advisories on npm. Tested all three options against the actual workbook on 2026-05-08.

**Findings (run on the real spreadsheet):**

| Criterion | xlsx (SheetJS) | exceljs | **read-excel-file** |
|---|---:|---:|---:|
| npm advisories | 2 high | clean | clean |
| Unpacked size | 7.5 MB | 21.8 MB | **1.2 MB** |
| Direct deps | 7 | 9 | **3** |
| Preserves empty cells | ✅ | ❌ collapses | ✅ |
| Output diff vs xlsx baseline | — | substantially different (column layout collapsed) | identical except one trailing-space trim on tab 34 |
| Script line count | ~12 | ~25 | ~12 |

`exceljs` was eliminated because it collapses empty cells, destroying the spreadsheet's column layout. `read-excel-file` produced output byte-equivalent to `xlsx` (modulo a single trailing-space trim — actually a small improvement) at ~1/6 the install size with no advisories.

**Decision**: C — `read-excel-file`. The extraction script and `package.json` were updated 2026-05-08; `xlsx` and `exceljs` removed from devDependencies.

[sheetjs]: https://www.npmjs.com/package/xlsx

---

### RESOLVED: Direct Google Sheets fetch — not supported
**Context**: User has `gcloud` installed; asked whether direct Sheets API fetch makes sense.
**Options considered**:
- A) Defer — xlsx workflow ships with this story; add `--from-sheet <id>` mode in a follow-up.
- B) Add both modes now (`googleapis` + `google-auth-library`).
- C) Skip xlsx entirely; only support direct fetch.

**Decision**: A (effectively) — extraction script supports xlsx files only; no Google Sheets API integration is planned. Author's workflow: edit the sheet, File → Download → .xlsx, run the extraction script.

---

### RESOLVED: Does monotonicity carry across student visits? (PI question — pedagogical, not technical)

**Context**: Within a single working session, once the student earns a higher category, the engine never falls back to a lower one (lower-category feedback would feel patronizing). The open question is what happens when a student leaves the activity and comes back later — same day after a break, or a later session entirely. Assume persistence is available; the question is purely about pedagogical intent.

**Options considered**:
- A) **One-way progression across visits.** Once a student has earned, say, category 3 on a given activity page, they never see category 1 or 2 feedback for that page again — even if their later-visit behavior looks beginner-ish (exploring, testing, demoing to a partner). The rubric is a one-way ratchet that persists across all visits to that page.
- B) **Per-visit reset.** Each new working session starts the rubric fresh based on what the student is doing right now. A student who earned category 3 yesterday and comes back today doing something beginner-ish would see beginner feedback again. Feedback always reflects current behavior; the cost is a high-level student potentially re-seeing low-level nudges.

**Decision**: A — one-way progression across visits. PIs confirmed 2026-05-08. Pedagogical reasoning: a student who has clearly progressed past early categories should not re-see beginner nudges, even when their current behavior could trigger them; "have you tried setting drought?" reads as patronizing to a student who has already demonstrated mastery on this activity page.

**WM-10 scope impact**: none. WM-10's in-memory implementation already satisfies the within-page-load slice of one-way ratcheting (automatic from Req 2's no-persistence stance + Req 7 within-session monotonicity). The cross-visit slice is implemented in AP-73 via persistence: AP-73 persists the matched-category floor per (student, activity-page) and seeds it on engine boot; the engine surfaces the max of (persisted floor, current evaluated category) at the read site. Reqs 2, 7, the Out of Scope AP-73 line, and SE-4 in Self-Review are updated to point at this resolution.


---

## Self-Review

<!-- Phase 1, Step 4 multi-role self-review of requirements only. -->

### Senior Engineer

#### RESOLVED: SE-1 — `ambientState` contract is implicit
The engine relies on call sites to populate `ambientState` on `SimulationStarted` (chartTabOpenAtStart) and potentially future events. There is no requirement that the engine *validates* incoming `ambientState` against what its loaded rule set needs. If a future call site forgets to pass `chartTabOpenAtStart`, the engine silently treats `GraphOpen` as `false` until a `ChartTabShown` modifier arrives — a quiet miscategorization rather than a loud error.

**Resolution**: Added Requirement 3b — engine derives the set of expected `ambientState` keys per trigger event from its loaded rule set's factor-variable computations and throws a dev-time error at trigger time if any are missing. Lighter than declaring an explicit per-rule-set ambient contract; same loud-failure outcome. Mirrors Req 11a's load-time defaults validation.

---

#### RESOLVED: SE-2 — `analysisEngineActive` not formally defined
The log-wrapper sketch (line 251) gates engine forwarding on `analysisEngineActive`, but the spec never defines what flips that flag. Implied: rule set loaded successfully. Should be explicit: `analysisEngineActive === true` iff `?hazbotRules` is set AND the id resolves to a known rule set AND load-time validation (Req 11a) passed. If any check fails, `analysisEngineActive === false` — the engine consumes nothing, and the sidebar (if open) shows the load error.

**Resolution**: Appended a sentence to Requirement 10 spelling out the engine-active contract: the engine is active iff `?hazbotRules` is set, the id resolves, and load-time validation (Reqs 11a, 3b) passes. Otherwise inactive — wrapper's engine fork is a no-op and the sidebar shows the load error.

---

#### RESOLVED: SE-3 — Behavior on malformed event payloads is unspecified
No requirement covers what happens if `SimulationStarted` arrives without a `zones` array, or with an unexpected payload shape. Factor-variable computations would throw. Spec is silent on whether the engine catches and surfaces the error, or lets it bubble.

**Resolution**: Added a "Payload shape assumptions" subsection to Technical Notes. Engine relies on TypeScript shapes for compile-time safety; factor-variable evaluation errors are caught and `console.error`-logged so one bad reading doesn't poison subsequent readings. No runtime payload validation — payload divergence is a refactor hazard, not a runtime hazard, and is best caught by `tsc`.

---

#### RESOLVED: SE-4 — Monotonicity scoping is implicit
Requirement 7 says the matched category may only stay or increase. The OQ on engine reset clarifies that `TopBarReloadButtonClicked` triggers a full page reload (fresh engine, fresh sessionId, empty readings) — at which point the matched category resets to "no match." Initial framing assumed monotonicity = within-page-load only. User pushed back: monotonicity may be intended *across* page reloads (one-way pedagogical progression).

**Resolution**: PIs answered the OQ on 2026-05-08 — Option A (one-way progression across visits). Reqs 2 and 7 annotated to spell out the broader pedagogical intent: WM-10 implements within-page-load monotonicity (automatic from no-persistence); AP-73 picks up the cross-visit ratcheting by persisting the matched-category floor and seeding it on engine boot. Out of Scope's AP-73 line updated to call this out. The OQ itself is now RESOLVED in Open Questions with the PI rationale and the WM-10-scope-unaffected confirmation.

---

### QA Engineer

#### RESOLVED: QA-1 — "Edge cases between adjacent categories" is vague
The first AC said tests cover each rule plus "edge cases between adjacent categories" — too loose to drive test design.

**Resolution**: Replaced the first AC with an explicit enumeration of four required test shapes per rule set: (a) no-match, (b) single-match, (c) multi-match selects highest, (d) monotonicity — feeding inputs that would *standalone* match a lower category does not regress the matched category. The monotonicity wording is scope-neutral so it holds whether the PI picks one-way-across-visits (SE-4 option A) or per-visit-reset (SE-4 option B).

---

#### RESOLVED: QA-2 — No AC for the extraction script itself
Requirement 11 makes the extraction script load-bearing but with no testability requirement. Semantic regressions (dropped category, mis-parsed default) would only surface as student-visible feedback bugs.

**Resolution**: Added an AC requiring fixture-based tests (`scripts/__fixtures__/*.xlsx` plus assertions on parsed output). Implementer chooses between snapshot or per-field assertion style; minimum coverage covers categories, factor variables, parsed defaults, and TBD-default handling.

---

#### RESOLVED: QA-3 — No AC for `ambientState` plumbing in call sites
Engine-side and call-site unit tests together can't catch the wiring break ("call site stopped passing the ambient state" or "engine field was renamed"). Needs an integration-style test that crosses both.

**Resolution**: Added an AC requiring at least one log-events.test.tsx-style integration test that flips `chartStore.tabOpen`, triggers `SimulationStarted`, and asserts the resulting engine Reading carries the expected `chartTabOpenAtStart` value.

---

#### RESOLVED: QA-4 — Sidebar test strategy unspecified
Sidebar is a debug tool with a small audience; heavy automated coverage is over-investment, but some baseline matters so refactors don't silently break it.

**Resolution**: Added an AC requiring smoke-level RTL tests — renders without throwing on a populated mock engine state, shows the matched category number and feedback, renders the load-error path, and coexists with `?logMonitor=true`. Deeper interaction coverage explicitly deferred.

---

### Product Manager

#### RESOLVED: PM-1 — Sam/PM validation workflow is undefined
"Sam/PM can confirm the rubric matches" was unbacked by a defined process. Three loadable rule sets × 5–6 categories ≈ 15–18 manual walkthroughs would have been a lot to set up unguided.

**Resolution**: Added an AC for a validation-playbook *generator* script (rather than a manually-authored playbook). The generator renders a per-category markdown checklist (expression, feedback, required-true and required-false factor variables, factor-variable `details` from the sheet) into `docs/hazbot-validation/<id>.md`. Re-runs alongside the extraction script. UI-level step instructions are deferred — Sam pairs the generated checklist with the live sidebar to confirm rubric correctness.

---

#### RESOLVED: PM-2 — Tabs 32–35 ship blocked; impact on downstream not framed
Risk that "WM-10 done" gets disputed at sign-off because only 3 of 7 authored rule sets are validatable in this story.

**Resolution**: Added a "Done definition" subsection above Acceptance Criteria. WM-10 ships with engine + sidebar working and rule sets 23, 24, and categories 1–5 of 25 validated. Tabs 32–35 explicitly do not gate the merge — they unblock as Sam fills in defaults at source. WM-6's scoping is called out as a WM-6 decision, not WM-10's.

---

#### RESOLVED: PM-3 — Tab 25 success category unreachable framing
**Resolution**: Already addressed by PM-2's "Done definition" subsection, which explicitly states that Sam validates "rule sets 23, 24, and categories 1–5 of 25 (category 6 of 25 is unreachable in this story due to the `SparksAtTopAndBottom` stub — see Out of Scope)." No additional edit needed.

---

### Education Researcher (Sam)

#### RESOLVED: ED-1 — Sidebar should surface `ambientState` per event
**Resolution**: Updated Requirement 17 to include `ambientState` in the per-event display, and added a matching AC. Sam can now inspect the ambient context (e.g., `chartTabOpenAtStart`) directly without opening devtools.

---

#### RESOLVED: ED-2 — Log replay / import is out of scope but high-value
Real value, but it would have been substantial scope drift to add to WM-10. The validation-slice framing + the Done definition (PM-2) already commits to live-only validation.

**Resolution**: Added to Out of Scope: "Log replay / import — driving the engine from a captured log sequence rather than live interaction. Deferred to a possible follow-up if Sam's live-validation pass surfaces gaps that warrant deterministic replay." The option is preserved without inviting scope drift here.

---

#### RESOLVED: ED-3 — Sidebar shows matched expression but not the next-higher rule
Started as "show next-higher category's expression and which sub-conditions are missing" and grew into a full debugger spec after walking through realistic debug scenarios.

**Resolution**: Replaced Req 17's sidebar bullets with a comprehensive debug-view spec:

1. **All categories' expressions, rendered with live truth-coloring.** Each category shows a status icon (✓/✗ based on current truth), category number, feedback, and DSL expression with leaves color-coded green/red by current truth. Operators stay neutral so structure remains readable. The currently-matched category is independently highlighted; status icon and matched-highlight may disagree (monotonicity case) and that disagreement is debug information, not a bug.
2. **Readings panel.** Chronological readings list with each reading's `triggeredBy`, `at`, key payload fields, and `updates` array. Click-expandable for full detail.
3. **Factor variable provenance.** Each factor variable is click-expandable to show which readings contributed to its current value.
4. **WITH binding detail.** When a WITH evaluates true, expanding shows the bound reading. When false, expanding shows per-reading evaluation across candidates so Sam can see which prop sub-conditions failed on each.
5. **Parsed AST inspection.** Optional collapsible toggle per category for verifying parser interpretation.

Engine-level implication: factor variable computations and the WITH evaluator return `{ value, witnesses/boundReading/candidateEvaluations }` rather than bare values, and a non-short-circuiting evaluator pass is added for the sidebar's leaf-coloring. Documented in Technical Notes ("Sidebar provenance interface").

ACs updated to cover per-category expression display, readings panel, factor variable provenance, and a partially-true / matched-disagreement test scenario.

---

### DSL/Parser Specialist

#### RESOLVED: DSL-1 — README tab is authoritative but unversioned in repo
**Resolution**: Updated Req 11 to require the extraction script to also dump the sheet's README tab to `src/hazbot/dsl-grammar.md` on every run, with a matching AC. PR diffs now surface any DSL grammar changes alongside rule-set changes, preventing silent parser-vs-grammar drift.

---

#### RESOLVED: DSL-2 — Comparison operator operand types are unconstrained
**Resolution**: Added a constraint to Req 12: comparison operators currently support numeric operands only (`.size`, `.length`, and numeric literals). Non-numeric or mixed-type comparisons are a parse error in this story. Framed as "deferred until a rule set requires it" rather than a permanent ceiling, so future rule sets can extend the operand domain cleanly.

---

#### RESOLVED: DSL-3 — Bare sim-props outside `WITH` not addressed
**Resolution**: Added to Req 12: sim-props are valid only inside a `WITH` prop-expression; bare top-level sim-props are a parse error with a message naming the offending identifier and pointing to the missing `WITH` binding. The README's grammar already implies this; making it explicit catches sheet-author mistakes loudly.

---

#### RESOLVED: DSL-4 — Parser error message format unspecified
**Resolution**: Extended Req 13 with a parser error contract: errors include the source expression, the offending token/span, and a column/offset indicator; they surface via `console.error` and inline in the sidebar's per-category display with the offending portion highlighted in the rendered expression. Also clarified the "fail loudly" rule: any category-expression parse failure rejects the whole rule set at load time (consistent with Reqs 10, 11a, 3b).

---

### Re-review (Pass 2 — issues introduced by Pass 1 resolutions)

#### RESOLVED: R1 — How does the engine know which `ambientState` keys to validate?
Considered sheet-derived vs. code-authored. Settled on code-authored — ambient state is engine mechanism, not rubric concept; sheet stays focused on behavioral specs (Details column).

**Resolution**:
- Updated Req 3b to spell out the mechanism: each factor-variable *implementation* (hand-written TS, per Req 14) declares its `ambientStateKeys` per trigger event type. Engine unions declarations at load time and validates at trigger time.
- Renamed and expanded Tech Notes' "Sidebar provenance interface" subsection to "Factor-variable implementation interface" — a single `FactorVariableImpl<V>` shape that carries both `ambientStateKeys` and the `compute` function (which returns `{ value, witnesses }`). Implementations are resolved from `FactorVariableDef` (sheet) to `FactorVariableImpl` (code) by name lookup at load.
- Added explicit "rule set rejected if no impl matches a def" rule to maintain the "fail loudly" pattern.

---

#### RESOLVED: R2 — Req 13's parser errors and rule-set rejection are mildly contradictory
Picked option (a): sidebar renders the static rule-set structure even when the rule set is rejected, with the parse-erroring category prominently marked. Leaves aren't color-coded (no live truth values), but the whole rubric is visible so Sam sees exactly where the error is.

**Resolution**: Updated Req 13 to disambiguate — parse errors surface in three places (console, engine errors panel from R4, inline per-category with offending token highlighted). On parse failure, rule set is rejected and engine is inactive, but the sidebar still renders the rule set's categories structurally so the parse-erroring category is visible in context.

---

#### RESOLVED: R4 — Not all dev-time errors are surfaced in the sidebar
Inventory of dev-time error sources defined in the spec:

| # | Source | Surfaces in sidebar today |
|---|---|---|
| 1 | Missing/invalid rule-set id (Req 10) | ✓ Errors panel |
| 2 | Missing default values (Req 11a) | ✓ Errors panel via Req 10 |
| 3 | Missing ambient-state key at trigger time (Req 3b) | ✗ console only |
| 4 | Parser errors (Req 13) | ✓ partial — inline per-category, but contradicts rule-set rejection (see R2) |
| 5 | No matching factor-variable impl for a def (R1) | ✓ Errors panel |
| 6 | Factor-variable evaluation throw (Tech Notes — payload shape) | ✗ console only |
| 7 | Stub "not yet implemented" warnings (Req 6) | ✗ console only |

Sidebar is the engine's debug surface; console-only errors force Sam to open devtools. Routing every dev-time error through the sidebar is a strict debugging win.

**Resolution**: Added an "Engine errors / warnings panel" bullet to Req 17 — chronological log of every dev-time message (load errors, runtime errors, parse errors, evaluation throws, stub warnings) with severity, timestamp, and triggering context. Implementation note: small engine-side error bus that the sidebar observes; existing `console.error`/`console.warn` calls continue so devtools see them too. AC added covering load/runtime/warning emissions.

---

#### RESOLVED: R3 — Validation-playbook generator's "true/false" framing is too narrow
**Resolution**: Updated the AC to require per-leaf required state — boolean for boolean factor variables, comparison conditions for numeric leaves, and bound-prop conditions for `WITH` sub-expressions. Generator walks the AST to produce the breakdown rather than collapsing every leaf to a true/false.

---

### Re-review (Pass 3 — fresh roles + re-look at post-resolution spec)

#### RESOLVED: SE-5 — `FactorVariableImpl` interface lacks declaration of required defaults

Mirrored the `ambientStateKeys` pattern (R1 fix) for defaults: each `FactorVariableImpl` now declares `requiredDefaults?: string[]` — dotted paths (`"wind.speed"`, `"zones[*].terrainType"`) that the engine asserts resolve on the rule set's `defaults` at load time. Req 11a rewritten to call out the impl-level mechanism explicitly: walk defs → look up impls → union `requiredDefaults` → validate each path → throw with rule set + factor variable + missing path on failure. Picked the static-array form over a function-based selector because the current rule sets' needs are simple and a static array is introspectable for tests/tooling.

---

#### RESOLVED: SE-6 — Engine state contradiction: matched category vs. "no state outside readings"

User pushed back on the framing — challenged whether `matchedCategory`, `warnedStubs`, and the error bus could *all* be derived rather than acknowledging them as book-keeping. Re-derivation works: every one of them is a pure function of substrate plus the loaded rule set, *if* the substrate is exhaustive. Failed-trigger events are the only wrinkle — they leave no Reading, so deriving the error bus needs the substrate to record failures too.

**Resolution**: Extended engine state from `readings + sessionId` to two append-only substrate logs (`readings: Reading[]` + `errors: EngineError[]`) plus the immutable `sessionId`. Rewrote the Tech Notes "All engine state lives in the readings array" subsection as "Engine state: two append-only substrate logs," with an `EngineError` sketch and an explicit "Derived values" sub-list covering `matchedCategory` (pure function of `(ruleSet, readings)`, memoizable), `warnedStubs` (side-effect dedup via the `0 → 1` readings-length transition; no separate state), and the sidebar's load-error / errors panels (direct views over `errors`). Updated Req 17's errors-panel wording to read directly from `errors` rather than a separate ad-hoc bus. Sets up SE-7's resolution naturally — failed triggers append to `errors`, not `readings`.

Trade-off accepted: substrate is slightly larger (two logs instead of one), but architecture stays purely state-free at the derivation layer, replay-from-log becomes trivial (relevant for AP-73 Firebase persistence), and shared-library extraction (REF-1) gets cleaner.

---

#### RESOLVED: SE-7 — Behavior on ambient-key throw doesn't specify subsequent modifier handling

Picked option (i) — drop orphan modifiers and record them as errors. Cleanly composed with SE-6's substrate extension: failed triggers append to `errors`, subsequent modifiers detect the "no current valid run" condition derivationally (most recent entry across `readings` ∪ `errors` is not a successful trigger / same-run modifier) and append `{ kind: "orphan-modifier", reason: "prior-trigger-failed" | "no-prior-trigger", ... }`. No prior-run Reading is mutated.

**Resolution**: Added the `orphan-modifier` variant to `EngineError`. Rewrote Req 3b to spell out the consequence chain explicitly (no Reading appended → orphan modifiers dropped + recorded → loud-failure window cleanly contained). Added an "Orphan modifiers" paragraph to the "Inputs: triggers vs. modifiers" subsection covering both `prior-trigger-failed` and `no-prior-trigger` (engine-just-booted) cases. Added a matching AC. Did not pursue option (ii) (minimal-Reading) — would have diluted the loud-failure pattern and forced downstream code to special-case degenerate Readings.

---

#### RESOLVED: QA-5 — Ambient-state plumbing AC tests one polarity only

**Resolution**: Tightened the AC to require both polarities (`true` and `false`) — parameterized or two test cases. One extra assertion catches the `!flag` / inverted-boolean class of regression that Req 3b's whole machinery exists to prevent.

---

#### RESOLVED: DV-1 — No CI safeguard against generated-file drift or hand-editing

Picked option (a) plus an explicit residual-risk note. Auto-generated header on every generated file, CI assertion verifies the header survives — catches accidental hand-edits cheaply. Did not pursue option (b) (commit the `.xlsx`) — the binary-blob cost outweighs the bug-prevention value at this stage; sheet edits go through Sam reviewing in the Google Sheet UI and the extraction is a one-step run, so the risk profile is "engineer does it wrong on first try, gets surprised once, then has muscle memory" rather than a recurring footgun.

**Resolution**: Updated Req 11 to require the `AUTO-GENERATED — DO NOT EDIT — re-run scripts/extract-hazbot-sheets.js` header on every generated file. Added a matching AC for the CI/test header check. Added a "Residual drift risk" paragraph under Tech Notes' "Extraction script" subsection acknowledging that the header check does not catch sheet-edit drift, naming the mitigation (process: re-extract on every sheet edit) and the escalation options if process fails (commit the `.xlsx` + diff in CI, or move to Sheets-API fetch).

---

#### RESOLVED: WCAG-1 — Per-leaf truth coloring uses color as the sole signal

Picked option (b) — underline true / strikethrough false, paired with green/red as the redundant signal. Orthogonal to color (works under any color scheme), low visual noise (no extra glyphs competing with the category-level ✓/✗), one CSS rule per state, and the typographic semantics ("underline = affirmed, strikethrough = negated") roughly map to truth values. Did not pursue (a) unicode marks — visual noise at scale (~30 marks per render) competes with the category-level ✓/✗ for visual hierarchy.

**Resolution**: Updated Req 17's per-category-expression bullet to double-encode each leaf — green + underline for true, red + strikethrough for false — and explicitly framed it as "a deliberate accessibility concession" so a future change doesn't strip the secondary signal. Added a matching AC.

---

#### RESOLVED: REF-1 — Engine's type-isolation strategy is implicit

User pushed back on my framing twice. First correction: the wildfire-specific factor-variable implementations and trigger→Reading translation aren't "in the library" anyway — they're app-specific by nature, so payload-type duplication is a non-issue. Second correction (stronger): the `Reading` type itself should live in the app, not the substrate; the substrate defines a minimum `BaseReading` and the engine is parameterized over `TReading extends BaseReading`. The wildfire app declares its own `WildfireReading` and passes it to the engine constructor. This makes library extraction a directory move with no type changes at all.

**Resolution**: Adopted the parameterized-Reading architecture across five spec edits:

1. Added a Tech Notes subsection "Library scope and the Reading boundary" defining the substrate/app split — `BaseReading` + generic `Engine<TReading>` + generic `FactorVariableImpl<V, TReading>` in the substrate; `WildfireReading` + concrete factor-variable implementations + `translate` callback in the wildfire-bridge layer. Includes worked code sketches for both layers.
2. Updated `FactorVariableImpl` interface to be generic over `TReading extends BaseReading = BaseReading`, with `compute: (readings: TReading[]) => …`.
3. Rewrote the Reading-shape doc to split fields between substrate-owned (`BaseReading`: `sessionId`, `triggeredBy`, `at`, `updates`) and app-owned (`WildfireReading`: `zones`, `sparks`, `wind`, `ambientState`).
4. Softened the "no compile-time dependency on `src/log.ts`" claim — applies only to the substrate; the wildfire-bridge layer imports freely from `src/log.ts`. Net import direction: `src/log.ts` → wildfire-bridge → substrate.
5. Updated Req 1 to spell out the substrate vs. wildfire-bridge layering and point to the new Tech Notes subsection.

Net architectural strengthening: "wildfire-specific" is now exactly the substrate/app boundary, identifiable by what's parameterized over `TReading` and what isn't. Future extraction strips zero types.

---

### Re-review (Pass 4 — issues introduced by Pass 3 resolutions)

#### RESOLVED: R5-1 — Orphan-modifier detection rule is over-eager

**Resolution**: Rewrote the Tech Notes "Orphan modifiers" paragraph with the timestamp-comparison pseudocode (compare `readings.at(-1)?.at` against `errors.findLast(e => e.kind === "ambient-validation")?.at`) and added an explicit note that the comparison is against ambient-validation errors only — not against the latest entry across both logs — so unrelated `errors` entries (`stub-warning`, `factor-eval-throw`) don't cause misclassification. Updated Req 3b to reference the Tech Notes paragraph for the detection rule.

---

#### RESOLVED: R5-2 — `requiredDefaults` path syntax `[*]` semantics undefined

**Resolution**: Picked semantics (i) "every entry of the array must have this field" — that's what's actually useful for catching TBD-default rule sets where some zones have terrain set and others don't. Added a paragraph after the FactorVariableImpl code block in Tech Notes spelling out the path-satisfaction rules: every intermediate segment non-null, `[*]` requires defined non-empty array with every entry satisfying the suffix, validator throws with rule set + factor variable + specific path including array index. Tightened the matching AC to require error-message format and at least one `[*]`-path test case alongside the existing missing-top-level-field case.

---

#### RESOLVED: R5-3 — `RuleSetDefaults` shape is app-specific, but the substrate-level validator can't be

Same architectural smell REF-1 fixed for Reading, applied to Defaults. Resolved with the same mechanism.

**Resolution**: Parameterized `RuleSet` over `TDefaults` (`RuleSet<TDefaults = unknown>`) and `Engine` over `<TReading, TDefaults>`. Moved `RuleSetDefaults` (renamed to `WildfireDefaults`) and `ZoneDefaults` out of the substrate type block in Tech Notes' "Rule-set TypeScript shape" subsection and into the wildfire-bridge code block in "Library scope and the Reading boundary." Updated Req 11 to specify `RuleSet<WildfireDefaults>` for the generated wildfire rule-set modules. Updated Req 11a to clarify that the substrate validates by string-path traversal (shape-erased) while the wildfire-bridge concretizes `TDefaults` as `WildfireDefaults` for compile-time type checking at the rule-set-author boundary. Updated Req 1's `Engine<TReading>` mention to `Engine<TReading, TDefaults>`.

---

#### RESOLVED: R5-4 — Stub warnings tied to readings-length transition won't emit if engine never produces a Reading

**Resolution**: Moved stub-warning emission from the `readings.length: 0 → 1` transition to engine-construction time, immediately after rule-set load + validation succeed. The set of referenced stubs is knowable from rule-set parse output; no reason to delay emission. Eliminates the transition machinery entirely — emission is part of the load lifecycle, which runs exactly once per engine instance, so each stub warns at most once per session structurally (no runtime dedup state needed). Updated the SE-6 "Derived values" entry for `warnedStubs` and Req 6 to align. Functionally equivalent to the original Req 6 wording ("first time it's evaluated") for the dev experience — warning shows up early in the session — and structurally simpler. Bonus: dev sees stub warnings even if every trigger fails ambient validation.

---

### Re-review (Pass 5 — issues introduced by Pass 4 resolutions)

#### RESOLVED: PS-1 — Load-time error semantics: "throws" vs "appends to errors" is ambiguous

Reqs 10, 11a, and the R5-2 resolution all describe load-time validation as "throws a clear dev-time error." But SE-6's substrate defines `errors: EngineError[]` with a `load-failure` variant, and the sidebar's load-error banner derives as `errors.find(e => e.kind === "load-failure")` — so load failures must *also* populate `errors`. An implementer reading "throws" would write `throw new Error(...)` inside the engine constructor and force the wildfire-bridge to try/catch; an implementer reading the architecture as a whole would write "construct engine, set inactive state, populate errors." Different APIs.

**Resolution**: Standardized the load-time error model to "raise" (non-throwing) — the engine constructor never throws; on validation failure it appends a `{ kind: "load-failure", ... }` entry to `errors`, sets the engine to inactive (`engine.consume()` becomes a no-op), and `console.error`s in parallel. Updated wording in Req 10, Req 11a, and Tech Notes' "`requiredDefaults` path syntax" paragraph to use "raises a dev-time error (appends to `errors` + `console.error`s; engine inactive)" instead of "throws." Engine has an `engine.isActive: boolean` derived from "no `load-failure` in `errors`" so the wildfire-bridge can branch cleanly without try/catch.

---

#### RESOLVED: PS-3 — Substrate directory layout left as "implementer's call"

REF-1's "Implementation location" paragraph said substrate lives under "`src/hazbot/substrate/` (or similar — implementer's call)." User pushed back: commit to a concrete sub-folder so the substrate/bridge boundary is enforced by directory structure, not just type structure. Cleaner for PR review (substrate-only changes are visually obvious in the file tree), cleaner for library extraction (the directory move is literal — copy `src/hazbot/engine/` to the new library repo), and gives an unambiguous lint rule for "no imports from outside the substrate."

**Resolution**: Committed to `src/hazbot/engine/` as the substrate directory. Bridge code (WildfireReading, WildfireDefaults, factor-variable implementations, translate callback, generated rule sets, sidebar UI) lives at `src/hazbot/` top level or sibling subfolders. Updated Req 1's wording, the Tech Notes "Library scope and the Reading boundary" subsection bullet ("Substrate (future shared library) — `src/hazbot/engine/` directory: ..."), the "Implementation location" paragraph (which now spells out the directory enforcement rule), and the sessionId-generator paragraph that referenced `src/hazbot/`. Other `src/hazbot/`-prefixed paths (rule-sets, dsl-grammar.md, sidebar) stay as-is — they're bridge-layer artifacts and the bridge keeps the `src/hazbot/` top-level location.

---

#### RESOLVED: PS-2 — `ConsumedEvent` referenced in `translate` signature but never defined

The substrate code block in "Library scope and the Reading boundary" uses `(event: ConsumedEvent, sessionId: string) => …` in the `translate` callback signature without defining `ConsumedEvent`. Inferable from the log-wrapper sketch (`{ name, data, ambientState, at }`) but not in the substrate-types section.

**Resolution**: Added the `ConsumedEvent` definition to the substrate code block:

```ts
interface ConsumedEvent {
  name: string;            // e.g. "SimulationStarted"
  data?: unknown;          // public log payload (LARA-bound)
  ambientState?: unknown;  // engine-only ambient app state (Req 3a)
  at: number;              // timestamp the event was emitted
}
```

---

### Re-review (Pass 6 — fresh roles after Pass 5 closure)

#### RESOLVED: SE-8 — `engine.isActive` is referenced but not declared on the `Engine` class signature

PS-1's resolution introduced `engine.isActive: boolean` as a derived property the wildfire-bridge can branch on, but the substrate's `Engine` class sketch only exposed `consume`, `readings`, and `errors`. The log-wrapper sketch still used an external `analysisEngineActive` flag, leaving an implementer to either re-derive "is there a load-failure?" inline at every call site or re-introduce the try/catch PS-1 explicitly avoided.

**Resolution**: Added `isActive: boolean` to the `Engine` class signature in the substrate code block (with an inline comment tying it to the `load-failure` derivation rule and the no-op `consume()` contract). Updated the log-wrapper sketch in "Hooking the engine into the existing log stream" to use `analysisEngine.isActive` instead of an external `analysisEngineActive` flag.

---

#### RESOLVED: SE-9 — Stub-warning emission semantics on load-validation failure are implicit

Req 6's "immediately after rule-set load + validation succeed" implied stubs were not warned on validation failure, but didn't state it. Two implementations could differ — one suppressing on failure, one emitting "for completeness" because "once per session per stub" sounded like a session-level invariant.

**Resolution**: Appended a sentence to Req 6: "If load-time validation fails (Reqs 10, 11a, 3b), no stub warnings are emitted — the engine is inactive and stubs are unreachable." Tech Notes' "Derived values" entry for `warnedStubs` already follows from Req 6 (emission is part of the load lifecycle), so no further edit is needed there.

---

#### RESOLVED: SEC-1 — Extraction-script ACs don't require hostile-string fixtures for TS literal escaping

Req 11 called for safe TS-literal escaping but the matching AC didn't require a fixture row exercising the escape paths. A regression in escaping would silently produce a TS file that fails to compile or, worst case, executes injected content — not because Sam is an attacker but because escaping bugs in code generators are a frequent class of regression independent of intent.

**Resolution**: Tightened the extraction-script fixture-test AC to require at least one fixture row whose feedback or details content exercises TS-literal escape edge cases (backtick, `${`, newline, double-quote, single-quote), with the test asserting the generated TS compiles cleanly and the parsed-back string round-trips to the fixture value. One-row fixture addition; ongoing regression coverage.

---

#### RESOLVED: SEC-2 — `?hazbotSidebar=true` and `?hazbotRules=<id>` ship-gating mechanism unspecified

Original framing assumed a "not shipped to students" build/route gate was needed. User pushed back: the sidebar and engine are wanted in production specifically so the team can debug live student activities. Gating them by build would defeat the use case.

**Resolution**: Removed the "not shipped to students" qualifier from Req 16 and replaced it with an explicit statement that both flags are honored in all builds (dev and production). The off-state adds no student-facing UI and does not run the engine, so the production cost of a student typing the URL flag is bounded — they would see a developer debug sidebar rather than something that affects their activity. Trade-offs accepted:

- **Runtime cost in production**: only paid when a flag is set, which requires a deliberate URL change.
- **Console-error visibility**: ambient-state data may appear in `console.error` output when the engine is active in production. Not LARA-bound; bounded by what the engine actually logs (no PII per current rule sets).
- **URL obscurity is not security**: documented explicitly so a future security review doesn't re-litigate. If a future use case introduces sensitive data through `ambientState`, the gating decision can be revisited.

---

#### RESOLVED: EMD-1 — `dsl-grammar.md` is documentation-only — no enforcement that the parser stays in sync

DSL-1's resolution oversold what the README dump accomplishes — it surfaces the *fact* of a grammar change but doesn't impose an *obligation* to update the parser. A reviewer skimming a PR diff that touches only `dsl-grammar.md` could plausibly conclude "documentation update, LGTM."

**Resolution**: Picked option (a). Added a "Grammar/parser drift — implicit parser-update obligation" paragraph to Tech Notes' Extraction-script subsection, framing a non-empty `dsl-grammar.md` diff as a PR-review flag to verify the parser still implements the documented grammar (either by adding parser tests for the new construct or by confirming the change is editorial). Did not pursue option (b) (CI fixture-capture test) because the sheet README is edited rarely by one author; a CI gate would be over-investment relative to drift frequency.

---

#### RESOLVED: PERF-1 — Sidebar render cost has no specified bound

Tech Notes mentioned "tens of readings per session" as a description but didn't commit to it as a budget, and the sidebar re-renders on every MobX update with non-short-circuiting evaluation across every category × leaf. A future use case (longer sessions, log replay, deeper WITH nesting) could degrade render cost silently.

**Resolution**: Added a "Sidebar render cost" subsection to Tech Notes formalizing the O(C × L × N) bound, naming `readings.length` as the memoization key (cheap because `readings` is append-only), and stating the implicit budget — N in the tens, with an explicit cue to re-measure if a future use case approaches N in the hundreds. Frames the budget as a contract for future implementers rather than an unstated assumption.

---

### Re-review (Pass 7 — fresh roles after Pass 6 closure)

#### RESOLVED: SE-10 — `Engine` class is missing accessors the sidebar needs to render

The `Engine<TReading, TDefaults>` class signature in Tech Notes' "Library scope and the Reading boundary" exposes `consume`, `readings`, `errors`, `isActive`. The sidebar (Req 17) needs more:

- **`sessionId`** — surfaced in the sidebar (Req 17 first bullet group). Today only available via `readings[0]?.sessionId`, which is undefined before any reading is produced. Inactive engines (load-failure) would never expose a sessionId by this route.
- **`ruleSet`** — Req 13 requires the sidebar to render the rule set's categories *even when the engine is inactive due to a parse error*, so the user sees the offending category in context. The sidebar needs access to the loaded RuleSet (or whichever was attempted to load).
- **Factor-variable impls** — Req 17 displays factor-variable state with click-expandable provenance (witnesses). Computing values requires the impls map from the constructor; the sidebar can't reach it through the engine today.

Without these, the sidebar contract can't be fulfilled against the documented `Engine` API.

**Resolution**: Added `sessionId: string`, `ruleSet: RuleSet<TDefaults> | undefined`, and `factorVariables: Record<string, FactorVariableImpl<unknown, TReading>>` to the `Engine` class signature in the substrate code block, with inline comments tying each to its purpose. Updated Req 17's "Sidebar displays" lead-in to state explicitly that the sidebar reads off the engine's exposed accessors and the wildfire-bridge does not separately track constructor inputs for the sidebar's benefit.

---

#### RESOLVED: SE-11 — Engine constructor requires `ruleSet` but Req 10 expects the engine to handle "missing rule set"

Req 10: "Missing or invalid rule-set id. Raises a dev-time error: appends a `{ kind: 'load-failure', reason: 'missing-rule-set', ... }` entry to `errors` ... the engine constructor never throws. Engine is set to inactive ... `engine.consume()` becomes a no-op."

This implies the engine instance is always constructed and the constructor itself emits the `missing-rule-set` failure. But the substrate code block declared `constructor(opts: { ruleSet: RuleSet<TDefaults>; ... })` — `ruleSet` was required. With that signature, the wildfire-bridge had to detect "no rule set" before construction (skip construction entirely or fabricate a sentinel), which contradicted PS-1's intent ("wildfire-bridge can branch cleanly without try/catch") — the bridge would have branched on engine-vs-no-engine instead of on `engine.isActive`.

**Resolution**: Made `ruleSet` optional in the constructor signature (`ruleSet?: RuleSet<TDefaults>`) with an inline comment tying it to Req 10. Appended a sentence to Req 10 spelling out the always-constructed contract: the wildfire-bridge passes `ruleSet: undefined` when `?hazbotRules` is unset or its id does not resolve, the constructor records `{ kind: "load-failure", reason: "missing-rule-set" }`, and the bridge branches on `engine.isActive` rather than on engine existence.

---

#### RESOLVED: SE-12 — DSL parsing strategy (when, what's cached) is implicit

Req 12 said "DSL parser at runtime evaluates rule expressions" and Req 13 said parser errors surface at load time ("If any category's expression in a loaded rule set fails to parse, the rule set is rejected at load time"). Together these implied parsing happens at load time with cached ASTs, but the spec didn't say so explicitly. The sidebar render-cost analysis (O(C × L × N)) implicitly assumed ASTs are pre-parsed (otherwise C × L × N parse runs would dominate the bound). A literal reading of "DSL parser at runtime evaluates rule expressions" was consistent with parse-on-every-eval, which would still pass the load-time-rejection AC but blow the cost bound silently.

**Resolution**: Appended a paragraph to Req 12: each category's expression is parsed once at rule-set load and the resulting AST is cached on the in-memory rule set; the matching evaluator and non-short-circuiting leaf evaluator both consume cached ASTs; runtime evaluation never re-parses. The paragraph also calls out that this is the assumption the sidebar render-cost bound rests on, so the linkage is explicit for future implementers.

---

#### RESOLVED: QA-6 — AC "tests covering each rule across each rule set" — which rule sets?

The first AC required unit tests for "each rule across each rule set" with four required test shapes. Today only 3 of the 8 active tabs are loadable (23, 24, 25); tabs 32–35 are blocked on TBD defaults, and tab 54 has no expressions. The AC was ambiguous on whether the test list covered (a) only the 3 currently loadable rule sets, (b) all active tabs with fixture defaults for the blocked ones, or (c) rule sets that have any data. Each interpretation had a different test surface.

**Resolution**: Picked (a) explicitly. Updated the first AC to say "each currently loadable rule set — for WM-10 that is `23`, `24`, and `25`" and added a sentence framing the test list as growing alongside Reqs 11/11a as Sam fills in defaults; the AC is not a commitment to fixture-default the blocked tabs (which would pre-empt Sam's authoring decision and could mismatch the eventual real values). Existing test-shape sub-clauses (a)–(d) preserved verbatim.

---

#### RESOLVED: QA-7 — Orphan-modifier AC tests `prior-trigger-failed` only, not `no-prior-trigger`

The existing orphan-modifier AC covered exactly one of the two `reason` values (`prior-trigger-failed`). The `no-prior-trigger` case (engine has just booted with empty `readings` and empty `errors`, then a `ChartTabShown` arrives before any `SimulationStarted` — likely in production: student lands on activity, toggles chart panel before pressing play) has its own code path (Tech Notes' detection rule short-circuits when `!lastReading && !lastFailedTrigger`) and was untested.

**Resolution**: Appended a sentence to the orphan-modifier AC requiring direct test coverage of `reason: "no-prior-trigger"` at engine boot, exercising the second branch of the timestamp-comparison detection rule. Existing `prior-trigger-failed` test wording preserved.

---

#### RESOLVED: QA-8 — No AC enforces the substrate's "zero wildfire imports" invariant

Req 1's commitment ("substrate ... has no imports from wildfire-model state/store/UI and no imports from `src/log.ts`. ... Future extraction ... should be a near-zero refactor — a directory move with no type changes") is the foundational architecture claim of the spec; REF-1 + PS-3 spent significant earlier-pass effort getting the substrate/bridge boundary right. The matching AC said "Engine has zero imports from wildfire-model app state/store/UI" but specified no mechanism — manual review, lint rule, or import-graph test. Without a mechanical check, an unrelated PR adding `import { foo } from "../../store"` inside `src/hazbot/engine/` would slip through silently and undermine the extraction story.

**Resolution**: Tightened the AC to require an ESLint `no-restricted-imports` rule (or equivalent) scoped to `src/hazbot/engine/**` that bars relative imports escaping the directory and bars imports from any wildfire-model path; CI fails on rule violation. Picked ESLint over an import-graph jest test for two reasons: smaller upfront investment, and authoring-time signal in the IDE so the boundary is enforced at write time rather than only in CI. Also added the missing "and from `src/log.ts`" clause to match Req 1's wording exactly.

---

#### RESOLVED: WCAG-2 — Sidebar's interactive controls lack keyboard / focus / screen-reader specs

WCAG-1 covered per-leaf truth coloring. Req 17's other interactive elements specified only the trigger ("click-expandable", "hover/click-expandable", "optional collapsible toggle", "transient highlight"). Open questions: keyboard activation, focus, ARIA state, hover-only WITH binding detail, screen-reader announcement of category changes.

**Resolution**: Picked the lighter end of the spectrum — sidebar is a dev-only tool, no need to over-invest in accessibility. Added a single sub-bullet to Req 17 requiring semantic `<button>` elements for click-expandable sections (which gives keyboard activation and focus indicators automatically), with no further ARIA or keyboard-equivalent commitments: no `aria-live` region for category changes, no keyboard equivalent for the hover-revealed WITH binding detail. The earlier WCAG-1 truth-coloring concession remains in force as the one carve-out (colorblind developers reading the sidebar). No new AC — the existing sidebar smoke tests cover render correctness; keyboard support is a free consequence of using `<button>`.

---

#### RESOLVED: SED-1 — Tab-count arithmetic inconsistencies in Background and Tech Notes

Two count mismatches in load-bearing prose: Background said "9 active rule sets" but listed 8; Tech Notes said "3 of 12 tabs" but the table only has 8 active + 3 placeholder = 11 rule-set tabs (the 12th would be the README tab, which is a grammar reference, not a rule set).

**Resolution**: Fixed Background to "8 active rule sets" and Tech Notes to "3 of 11 rule-set tabs," with a parenthetical clarifying that the README tab is not counted because it is a grammar reference, not a rule set. Keeps the denominator consistent across the two locations.

---

### Re-review (Pass 8 — substrate-scope expansion + React layer + versioning)

Triggered by four large changes to the spec: substrate scope expanded to include React + sidebar + listener API (Req 1, 15, 17, 19), React peer-dep added (Req 1), engine + app-rules versioning added (Req 20), `AnalysisEngineActivated` log event added (Req 20). Reviewers: Senior Engineer, React/Frontend specialist, Library Architect, QA Engineer.

#### RESOLVED: SE-13 — `subscribe`/`notify` reentrancy and listener-set mutation

Picked B — snapshot + reentrancy guard. A handles the listener-set-mutation case but leaves recursive `consume` as a real footgun (a sidebar component calling `engine.consume()` from a click handler that also reads `useAnalysisEngine()` would hit it). C is architecturally cleanest but the microtask delay breaks the synchronous test pattern the spec uses elsewhere (every `consume` test in Reqs 4+ reads engine state immediately after the call) — non-trivial spec churn. B keeps `consume` synchronous, makes subscribe/unsubscribe-during-notify safe via the snapshot, and prevents recursive cascade via the guard. Composes cleanly with SE-14's single-notify-per-consume direction.

**Resolution**: Added a "Reentrancy contract" paragraph to Req 19 after the listener-API description. Spelled out: notify snapshots listener set pre-iteration; nested mutation is buffered and fires as a single follow-up notify after the outer iteration completes. Added three explicit test assertions covering (a) subscribe-during-notify, (b) unsubscribe-during-notify, (c) listener-calls-`consume()` produces one outer + one follow-up notify (not a cascade).

---

#### RESOLVED: SE-14 — Single notify per `consume()` call (atomicity contract)

Picked A — strict one-notify-per-entry-point contract. Composes naturally with SE-13's reentrancy guard (the guard already pushes toward "one notify per outer call"; A just makes that the spec'd contract). Functionally equivalent to B for React's user-visible render outcome (React coalesces `useSyncExternalStore` notifies within a microtask batch anyway), but A makes the contract testable as a strict equality (`expect(listener).toHaveBeenCalledTimes(1)`) instead of B's looser "called ≥ 1." Implementation cost is small now that SE-13's machinery exists. C leaves a testability gap a future implementer would have to re-resolve.

**Resolution**: Added a "Notify atomicity" paragraph to Req 19 spelling out the contract: each `consume()` call fires at most one notify, at the end of the call; the constructor emits a single notify at the end of construction (notify reaches no listeners but ticks the counter so the first hook read sees the post-construction snapshot — composes with SE-18); other public state-changing entry points follow the same rule. Added a test assertion: a `consume()` that pushes one reading and emits one stub-warning calls subscribers exactly once.

---

#### RESOLVED: SE-17 — `appRulesVersion` Provider prop: required vs. optional + fallback

Picked A — required prop, no fallback. Substrate is positioned as a future-extractable library with a minimal public API; a required prop is the strongest possible "you must declare your version" contract. Host app gets a TS compile error on day one if they forget, which is exactly when they want to learn the rule. B's `"v?"` fallback papers over a real misconfiguration — the whole point of the version display is to correlate sidebar observations with rule-set state, and "unknown" defeats that. C adds runtime defensiveness on top of A but the host has to pass *something* compile-time-valid anyway; passing `0` or `-1` is a separate problem and a runtime check is over-engineering for a value whose only consumers are sidebar header and activation log. A has a small secondary benefit: substrate never has to handle `undefined`.

**Resolution**: Added a "Provider prop contract" code block + paragraph to Req 19 spelling out the `AnalysisEngineProviderProps<TReading, TDefaults>` shape with `engine` and `appRulesVersion` both required, `appRulesVersion: number` (no `| undefined`), no substrate fallback. (FE-5 is orthogonal — that issue is about type width: should `number` widen to `string | number`? Will revisit.)

---

#### RESOLVED: SE-18 — Load-time errors are populated before any subscriber can exist

Picked A — explicit spec for initial-snapshot semantics. SE-14's resolution already implies the mechanism ("constructor emits a single notify at the end of construction; no listeners exist yet, so this notify reaches no one — but it ticks the version counter"); promoting it to explicit spec gives a future implementer the full picture without stitching SE-14 + SE-18 together. B fights React's `useSyncExternalStore` semantics — the hook reads `getSnapshot()` synchronously on first render, so a synthetic initial notify is redundant; it would also force `subscribe` to fire its listener once with the current snapshot then on every change, which is non-standard React-store pattern and confusing in tests. C leaves a re-implementation question that's cheap to answer now.

**Resolution**: Added an "Initial-snapshot semantics" paragraph to Req 19 spelling out: counter starts at `0` pre-construction and is `1` post-construction; load-time errors are visible on first hook render via `getSnapshot() === 1` reading the populated `errors` array directly; `subscribe()` does not fire a synthetic initial notify on first listener registration; consumers receive callbacks only for *subsequent* state changes. Added two test assertions: (a) construction with missing rule set produces `errors.length >= 1` and `getSnapshot() === 1` immediately, before any `subscribe()`; (b) subscribing afterwards does not retroactively fire the listener for construction-time mutations.

---

#### RESOLVED: FE-1 — SSR posture and `getServerSnapshot`

Picked A — browser-only commitment. The substrate is intentionally never going to be used server-side: its whole reason for existing is interactive simulation analysis, with no meaningful server-rendered output. Confirmed by user as a permanent scope decision, not a "defer until needed."

**Resolution**: Added a "Browser-only" paragraph to Req 19. Hook calls `useSyncExternalStore(subscribe, getSnapshot)` with only two args; no `getServerSnapshot` is provided. SSR consumers (none exist; none are planned) would hit React's "Missing getServerSnapshot" error and must gate the Provider behind `typeof window !== "undefined"`. Framed as a deliberate scope decision so a future review doesn't re-litigate.

---

#### RESOLVED: FE-2 — `useAnalysisEngine()` outside a Provider

Picked A — throw with clear message. Universally-accepted React idiom; every `useFoo()` hook bound to a `<FooProvider>` works this way. B's forgiving path is the classic source-of-bugs case (consumer forgets Provider, gets `undefined`, writes defensive null-check that silently does the wrong thing). One-line implementation cost. Composes with FE-4 — when neither URL flag is set the bridge doesn't mount the Provider, but Req 19 already commits to "the hook is never called from any rendered tree" in that case, so the error path is reserved for actual misuse.

**Resolution**: Added a "Hook outside Provider" paragraph to Req 19 specifying the throw and the exact error message. Added a unit-test commitment to assert the throw.

---

#### RESOLVED: FE-3 — Hook called multiple times in the same render: memoization or guidance?

Picked A — memoize inside the hook keyed off `engine.getSnapshot()`. Substrate is a future-extractable library; a future host app calling the hook in 20 sub-components shouldn't have to learn a "call once at the top" convention buried in docs — the hook should just be cheap to call. ~15–20 lines of substrate code (WeakMap + snapshot comparison + null guards). B's discipline is awkward for the substrate's *own* sidebar, which is internally composed of multiple sub-components that all consume the hook — either the top-level Sidebar prop-drills the derived view through ~5 layers, or sub-components each call the hook (incurring the multiplication B was trying to avoid). C is fair given the implicit budget but A is cheap enough that "wait until it bites" leaves an obvious lever on the table. Side benefit: hook return gains referential stability, so consumer-side `useEffect` deps and `React.memo` work without manual memoization.

**Resolution**: Replaced Req 19's "Performance" paragraph with a stronger commitment: per-snapshot memoization via `WeakMap<Engine, ...>`, multiple calls in the same render share one O(C × L × N) computation, WeakMap keying ensures GC of cache entries when an engine is discarded. Added a referential-equality test assertion.

---

#### RESOLVED: FE-4 — Provider mount condition: precise URL-flag gate

Picked A — spell out the truth table. B's "always mount" simplification has a real cost: it forces the bridge to construct an engine on every page load even when no flag is set, running the load pipeline (defaults validation, parser, ambient-key collection, stub-warning emission) and emitting `AnalysisEngineActivated` for users who never asked for it. That conflicts with Req 16's "off-state adds no student-facing UI and does not run the engine" commitment. C is fine but leaves the truth table as folklore. A is cheapest correctness fix: 4 lines of mounting condition + a 6-row table that doubles as a per-row test-scenario enumeration. Each row of the table is its own test scenario; the smoke tests already cover the "neither" and "both rules+sidebar" rows, and A makes the two single-flag rows explicit ACs.

**Resolution**: Added a "Provider mount truth table" subsection to Req 19 enumerating all six (`{rules unset, set & resolves, set & doesn't resolve} × {sidebar unset, true}`) cases with explicit columns for Provider mount, engine construction, sidebar render, and `AnalysisEngineActivated` firing. Mount condition is `hazbotRules !== undefined || hazbotSidebar === true`. Sidebar render is independently gated on `hazbotSidebar === true`. Activation log gated on `engine.isActive` per Req 20.

---

#### RESOLVED: FE-5 — `appRulesVersion` typed as `number` is too narrow

Picked A — widen to `string | number`. Substrate is positioned as a future-extractable library; constraining the version field to `number` makes a reasonable assumption today (wildfire's rules version is an integer) and an unreasonable one tomorrow (a future host wants semver, or a git SHA, or `"v3-alpha"`). A's runtime cost is zero — substrate's only consumers (sidebar header, activation-log payload) work for both types. A's TypeScript cost is one character. B locks in a constraint that would force a future host through a render-prop escape hatch we'd have to add later. C's third generic parameter adds API surface for a problem the union type already handles. Composes cleanly with SE-17's "required, no fallback" — type widens but stays required.

**Resolution**: Updated Req 19's Provider prop contract code block to `appRulesVersion: string | number`. Updated Req 20's bump-policy paragraph to clarify the wildfire bridge stays on the integer form (`APP_RULES_VERSION: number`, starting at `1`) but the substrate's Provider prop accepts `string | number` so future host apps can use semver, git SHAs, or content hashes without a substrate change. Sidebar header coerces via `String(value)`; activation-log payload passes through as-is.

---

#### RESOLVED: LA-1 — Substrate uses plain CSS, not SCSS

Picked write-your-own — substrate code uses **pure CSS** (`.css` files imported directly from React components), not SCSS. The whole "SCSS distribution at extraction" question becomes moot: any bundler that handles plain CSS imports (webpack, Vite, Rollup, esbuild, Parcel — i.e. all of them) consumes the substrate without preprocessing. When the substrate is eventually published as an npm package, the `.css` files ship as-is alongside the JS, no build step needed. Trade-off accepted: no nesting, no variables-via-SCSS-syntax, no `@mixin` / `@extend` — but the sidebar's styling needs (color variables, layout, theme switching) all map to plain CSS custom properties under a `data-theme` selector, which is the same pattern log-monitor uses.

**Resolution**: Replaced every "SCSS module(s)" / "SCSS-module pipeline" reference in the spec with "plain `.css` file(s)" wording — Req 1's substrate-scope sidebar-styling bullet, Req 17's visual-styling bullet, the new "substrate React surface" AC, the Tech Notes "Library scope" sidebar bullet, and the Tech Notes "Implementation location" paragraph. Substrate stays preprocessor-free; bundler-portability is a free side benefit.

---

#### RESOLVED: LA-2 — `react-dom` peer-dep necessity

Picked A — drop `react-dom`. The substrate uses no `react-dom` API (no `createPortal`, no `flushSync`, no DOM-specific imports); listing it as a peer dep would be wrong, not just redundant. Wrong peer-dep contracts are worse than no contract — a host on React 18 with a non-DOM renderer (React Native, Ink, RSC) would see misleading "you need react-dom" warnings. Log-monitor sets the precedent in this codebase with the same minimal posture.

**Resolution**: Updated Req 1's peer-dep line to "only runtime peer dependency is `react` (`>= 18.0.0` for `useSyncExternalStore`)" with an explicit "no `react-dom` dep — substrate uses standard React APIs only" clarifier and a forward-reference to log-monitor's posture for consistency.

---

#### RESOLVED: LA-3 — Substrate's public API surface is implicit

Picked A — explicit Tech Notes subsection. The substrate's public API is the boundary that defines what's "library" vs. "internal"; without an explicit list, the implementer guesses and reviewers either accept the guess (locking in incidental exports as API) or push back ad-hoc. An explicit allowlist makes the discussion happen at spec time, when the architecture is mutable. Forced thinking about under-exports too: `parse()` stays internal, `Expression`/`ParseError` AST types are exported (host apps building custom expression visualizers need them; the AST-inspection toggle in Req 17 already exposes the AST internally). B's "draft at implementation time" is fine but means the export list is set by whoever happens to write `index.ts` first, with no architectural guidance. C is the riskiest — "exports as architecture review" is exactly the kind of decision that gets rubber-stamped at PR time.

**Resolution**: Added a new "Substrate public API surface" subsection to Tech Notes, between "Library scope and the Reading boundary" and "Engine state: two append-only substrate logs." Lists 13 exported names organized by concern (Engine core / React layer / Sidebar UI), each with a one-line "why exported" justification, plus an explicit "Internal (not exported)" list naming the most-tempting-to-export internals. Closes with a versioning note: adding to the list is a substrate API expansion (semver bump per Req 20), removing is a contraction (major bump); PRs touching `index.ts` should call out the API delta.

---

#### RESOLVED: QA-9 — Generic-sidebar test fixtures and the substrate boundary

Picked B — split tests across the substrate/bridge boundary. B is the boundary-honoring answer: substrate's substrate tests verify it's generic against synthetic shapes (proof that no wildfire assumption snuck in); bridge's bridge tests verify the actual wildfire shape renders correctly via the substrate sidebar. Together they cover the AC's intent on the correct side of the architectural boundary. A's "inline mirror of `WildfireReading`" is a drift hazard — silent divergence from the real type with a "test passes against a fake that no longer matches reality" failure mode that's hard to detect. C undersells the AC's intent (genericity proof is weaker with a single shape). Secondary benefit of B: bridge-side test is the natural home for "matched category number and feedback text" smoke tests using real rule sets (`ruleSets["23"]`) — better signal than synthetic rule-set fixtures.

**Resolution**: Replaced the single AC bullet with two AC bullets — one for substrate-side tests at `src/hazbot/engine/sidebar/sidebar.test.tsx` (synthetic `TReading` declared inline, no wildfire imports), one for bridge-side tests at `src/hazbot/wildfire/sidebar.test.tsx` (substrate sidebar inside `AnalysisEngineProvider` over a real wildfire engine using a real generated rule set, asserts wildfire payload renders via the generic-payload path).

---

#### RESOLVED: QA-12 — Hook unmount cleanup test

Picked B — skip. `useSyncExternalStore` is part of the React 18 stable API; cleanup is part of its documented contract and the React team has unit tests for it. Re-testing it in the substrate is testing React, not the substrate. The substrate's own contract (that `unsubscribe()` returned by `subscribe()` stops listener invocations) is already an AC and tested directly — that's the substrate's responsibility. Composition correctness is implied by both being correct independently. Classic "test the framework" vs. "test our code" distinction; B is on the right side. If a real leak surfaces in production, the test gets added then as a regression test.

**Resolution**: No spec change. The existing substrate AC ("a subscriber's listener fires after each `consume()` that mutates state, does not fire on a no-op event, and unsubscription stops further notifications") covers the substrate side. React handles the React side.

---

#### RESOLVED: QA-13 — `getSnapshot()` tick semantics: what's tested?

Picked A — spec the full contract. SE-18 already pinned the initial value (`1` post-construction); A makes the `consume()` rules consistent with that. "Ticks iff actual mutation occurred" is the principled rule — counter ticks ↔ visible state changed ↔ React re-renders make sense. B's "tick every consume" causes spurious re-renders for no-ops and inactive-engine calls, which is noise the React layer doesn't need; B also muddies the contract for a future implementer optimizing on `getSnapshot()` value. C leaves a subtle question for the implementer to resolve in a vacuum. Composes cleanly with SE-13/SE-14/SE-18 — together they give a complete, testable counter contract.

**Resolution**: Added a "Snapshot tick semantics" paragraph to Req 19 spelling out: counter starts at `0` pre-construction and `1` post-construction; no-op `consume()` does not tick; inactive-engine `consume()` does not tick; successful `consume()` ticks exactly once regardless of internal mutation count. Three test assertions added: no-op leaves snapshot unchanged, inactive-engine consume leaves snapshot unchanged, single-trigger consume increments by exactly 1 even with both reading and error mutations.

---

### Re-review (Pass 9 — issues introduced by Pass 8 resolutions)

Pass 8 added ~9 substantive paragraphs to Req 19 (reentrancy, atomicity, initial-snapshot, snapshot tick, browser-only, Provider prop contract, hook outside Provider, mount truth table, performance memoization), changed substrate styling to pure CSS (LA-1), narrowed peer deps to `react`-only (LA-2), and added the new "Substrate public API surface" Tech Notes subsection (LA-3). Pass 9 reviews the consolidated text for new contradictions, gaps, or unnoticed implications.

#### RESOLVED: R9-1 — Constructor notify with empty listeners — "reaches no one" wording is misleading

Picked A — tighten wording with explicit always-fires contract. The bug A guards against is real and subtle: a future implementer optimizing "useless" empty-listener notify calls would cascade into SE-18's contract violation (no counter tick → first hook read returns `0` → load-time errors invisible until the next mutation). B's refactor (decouple counter tick from listener notify into separate ops) is architecturally cleaner but introduces new vocabulary for an internal implementation detail; spec churn for no spec-level benefit. C trusts implementers more than the spec's track record warrants — Pass 7/8 already added multiple "what about edge case X?" clarifications.

**Resolution**: Tightened SE-14's "Notify atomicity" paragraph in Req 19 with explicit "notify always fires regardless of listener count" wording and a bolded warning against the optimization that would break SE-18. Added a second test assertion: an engine with no `subscribe()` calls between construction and first `getSnapshot()` returns `1`, not `0` (the constructor's notify ticks the counter even with an empty listener set).

---

#### RESOLVED: R9-2 — Provider mount truth table reverses the actual construction sequence

Picked A — reword the truth-table paragraph. The current wording was just wrong: cause and effect reversed. SE-17's "required, no fallback" Provider prop contract requires the engine to exist before the Provider mounts. B re-introduces the "no engine yet" first-render state SE-17 specifically eliminated. C leaves a real source of implementer confusion in load-bearing wording.

**Resolution**: Updated the post-truth-table paragraph in Req 19 to explicitly say "Engine construction precedes Provider mount" and added a "Provider never sees a 'no engine yet' state" clarification tying it back to SE-17. Also tightened the "no flags" row description (no engine *constructed*, not just "no engine") for symmetry.

---

#### RESOLVED: R9-3 — `useAnalysisEngine()` ordering: `useContext` null-check vs `useSyncExternalStore` call

Picked A — spec the order explicitly. One-sentence edit prevents a TypeError on `undefined.subscribe` in the misuse path (replaces it with the intended throw with the exact error message). B is a distinction without a difference — same operational outcome, different phrasing. C trusts the implementer; the misuse path is unusual enough that the natural ordering subtlety could be missed. A also implicitly documents that `useContext` is the first hook call inside `useAnalysisEngine`, clarifying the call sequence for reviewers.

**Resolution**: Added an "Implementation order" sentence to FE-2's "Hook outside Provider" paragraph in Req 19: hook reads `useContext` first, throws immediately if undefined, only then calls `useSyncExternalStore`. Reversing the order would crash with TypeError before reaching the throw. Tightened the test commitment to assert the *exact* error message string, not just any throw.

---

#### RESOLVED: R9-4 — Pure CSS theming: light-mode only, no switching

Picked write-your-own — single **light** theme, no theme switching at all. Smaller scope than any of the listed options. Rationale: the substrate's audience for the sidebar is Sam/PM doing rubric validation in well-lit working sessions; a single light theme keeps the substrate's API surface minimal (no `theme` prop, no `data-theme` attribute, no `prefers-color-scheme` machinery) and avoids prop-plumbing for a feature no current consumer needs. Deliberate divergence from log-monitor's dual-theme support — log-monitor defaults to dark and accepts a `theme` prop; Hazbot ships light-only. The two sidebars will render different palettes when open side-by-side; that's accepted (each sidebar's audience and use case is different). Future host apps that need dark mode would be the trigger to add a `theme` prop in a substrate API expansion (semver minor bump per Req 20).

**Resolution**: Updated Req 17's visual-styling bullet to spell out "single light-mode theme, no switching, no `data-theme` attribute, no prop." Updated the styling AC to reference the **light** half of log-monitor's stylesheet as the visual target. Updated the Substrate Public API Surface entry for `Sidebar` to "No props (light-mode only per Req 17)." No new theme-prop AC needed.

---

#### RESOLVED: R9-5 — `react-dom` dropped from peer deps but still needed for tests

Picked B — skip. The peer-dep vs dev-dep distinction is package-management common knowledge; anyone writing the substrate's package.json (hypothetical for WM-10 since the substrate isn't published yet) will naturally pull `react-dom` as a transitive dev dep via `@testing-library/react`. A's parenthetical would clutter Req 1's load-bearing peer-dep statement with packaging-mechanic detail that isn't the point of the requirement. LA-2 was specifically about runtime deps for the published library; dev deps are an extraction-time concern that doesn't belong in WM-10's requirements. If a future implementer does get confused, the natural place for the fix is the substrate's package.json comments at extraction time.

**Resolution**: No spec change. Acknowledged that `react-dom` will appear in the substrate's dev deps (transitively via RTL) when extraction happens; current peer-dep wording stays accurate as a runtime-only statement.

---

#### RESOLVED: R9-6 — Hook return exposes `engine` directly: document the affordance and its risks

Picked C — skip. The "advanced consumers" use case is hypothetical; WM-10 has no consumer that needs direct engine access. A future host app *might*, but they'd read the substrate's exported `Engine` type and `useAnalysisEngine` return shape directly via TypeScript, where the existence of `engine` on the return is self-documenting. A documents risks for a non-existent use case; the "direct subscribe leaks" warning applies only to consumers who deliberately bypass the recommended path, and those consumers are sophisticated enough to read JSDoc on `engine.subscribe()`. B would remove a useful escape hatch (advanced consumers genuinely benefit from engine access for dev tooling and custom analytics) and would have to be re-added later as an API expansion. The hook return shape's existing `// the engine instance, for advanced consumers` comment is enough breadcrumb; real documentation belongs in the substrate's exported JSDoc, not the requirements spec.

**Resolution**: No spec change. Acknowledged that `engine` is exposed on the hook return as a deliberate escape hatch; risks of direct `subscribe()` use will be documented in JSDoc on `Engine.subscribe()` at implementation time, not in the requirements.

---

#### RESOLVED: R9-7 — `AnalysisEngineActivated` payload — drop `sessionId`

Picked B — drop `sessionId` from the activation payload. Keeps `sessionId` engine-local (visible via the sidebar header and `useAnalysisEngine()` return) rather than broadcasting it to LARA on the very first activation event. The cross-LARA-event correlation affordance A would have unlocked is genuinely useful for analytics, but committing to it now bakes a sessionId-in-LARA-payload posture into WM-10 that AP-73 may want to revisit with a different (persisted, cross-page-load) session-identity scheme. Better to defer the analytics-correlation decision to AP-73 when the persistence story shapes the right answer.

**Resolution**: Updated Req 20's activation-event paragraph to spell out the `sessionId`-omitted contract explicitly ("`sessionId` is **not** included in the payload — stays engine-local, visible via the sidebar header and `useAnalysisEngine()` return, persisted only by future AP-73 work where its scope is decided then"). Updated the activation AC to remove the `sessionId` payload-match assertion and add a positive assertion that the payload does **not** include a `sessionId` field. Updated the bridge-boot sketch in Tech Notes to drop the `sessionId: engine.sessionId` line and replace it with an inline comment marking the deliberate omission.

---

### Re-review (Pass 10 — fresh roles + post-Pass-9 consolidation review)

Triggered by user request. Pass 9 closed loops on the substantial Pass 8 additions to Req 19, but the consolidated text is now ~13 paragraphs long and warrants a fresh consistency check. Roles: Senior Engineer (fresh pass), Library Architect, QA Engineer (fresh pass), DevOps Engineer, WCAG Accessibility Expert (re-look), Education Researcher (Sam — fresh pass).

#### RESOLVED: R10-1 — Hook-return code-block comments still say "fresh per render," contradicting FE-3's per-snapshot memoization

Req 19's hook-return shape code block (lines 154-170) annotates three derived fields with inline `// ... fresh per render` comments:

```ts
factorVariableValues,      // Map<name, { value, witnesses }> — computed from impls × readings, fresh per render
matchedCategory,           // null | number — computed from rule set × readings, fresh per render
perCategoryTruth,          // Map<categoryId, { value, perLeaf, withDetails }> — computed via leaf evaluator, fresh per render
```

But FE-3's resolution (the "Performance" paragraph at line 203) commits to per-snapshot memoization: the hook holds a `WeakMap<Engine, { snapshot: number; view: HookReturn }>` cache, and a call recomputes the view iff `engine.getSnapshot()` differs from the cached snapshot — otherwise it returns the cached reference. So these fields are *not* fresh per render; they're fresh per snapshot, and stable across renders within the same snapshot.

**Why this matters**: A future implementer reading the code-block comments could write a "compute-fresh-on-each-call" implementation and pass the documented-shape AC, then quietly fail FE-3's referential-equality test (`useEffect` deps and `React.memo` comparisons depend on stable references). The two parts of Req 19 disagree on a load-bearing performance claim.

**Resolution**: Replaced each `// ... fresh per render` inline comment in the hook-return code block with `// ... memoized per snapshot (FE-3)`. Promoted a leading sentence above the code block: "Derived fields are computed once per snapshot via the FE-3 WeakMap cache and shared across renders within that snapshot — see the 'Performance' paragraph below for the full memoization contract." A future implementer reading the code block sees the memoization commitment up front rather than discovering the contradiction with FE-3 several paragraphs later.

---

#### RESOLVED: R10-2 — Snapshot-tick rule's "load-time mutations always count" wording is imprecise for clean-load construction

The "Snapshot tick semantics" paragraph in Req 19 says the counter ticks **iff a state-changing operation actually mutated `readings` or `errors`**, then immediately exempts construction:

> The counter starts at `0` pre-construction and is `1` after a successful or failed engine construction (per the initial-snapshot rule above) — load-time mutations always count.

But "load-time mutations always count" is doing more work than it says. Consider a clean construction: rule set resolves, defaults validate, ambient keys validate, no stubs are referenced, no parse errors. Nothing was appended to `readings` (no triggers consumed yet) or `errors` (no failures, no stubs). So per the strict "ticks iff mutated" rule, the counter would not tick — but the spec elsewhere (R9-1's bolded warning) commits the constructor to always tick the counter, even with empty listeners and no actual mutations.

The two paragraphs are reconcilable by reading "load-time mutations always count" as an exception meaning "the constructor's notify always ticks regardless of mutation status," but the wording is glide-by. An implementer reading just the snapshot-tick paragraph could reasonably implement "tick only on real mutation" and break the SE-18 first-render contract on a clean rule-set load.

**Why this matters**: SE-18's contract (load-time errors visible on first hook render via `getSnapshot() === 1`) only holds if the constructor always ticks the counter. The snapshot-tick rule should make this exception unmistakable, not euphemistic.

**Resolution**: Reframed the snapshot-tick rule's lead-in from an absolute "ticks iff mutated" to an "outside construction, ticks iff mutated" rule, and rewrote the construction bullet to be the explicit exception rather than a glossed-over "always count" justification. New construction bullet states the 0→1 tick is unconditional, ties it to SE-18, and calls out the clean-load case (no stubs referenced, no errors) so the exemption is unmistakable. The other three bullets (no-op consume, inactive consume, successful consume) keep the strict rule. Future implementer reading just this paragraph cannot reasonably implement "tick only on real mutation" without hitting the construction-exception bullet first.

---

#### RESOLVED: R10-3 — Substrate-permitted-imports AC still allows `react-dom`, contradicting LA-2's drop

The acceptance criterion at line 236 reads:

> Engine substrate ... **Mechanically enforced** via an ESLint `no-restricted-imports` rule ... The substrate's permitted imports are sibling files inside `src/hazbot/engine/**`, `react`, and `react-dom` (peer deps per Req 1).

But LA-2's resolution (Pass 8) dropped `react-dom` from the substrate's peer deps explicitly:

> Updated Req 1's peer-dep line to "only runtime peer dependency is `react` (`>= 18.0.0` for `useSyncExternalStore`)" with an explicit "no `react-dom` dep — substrate uses standard React APIs only" clarifier.

The AC text wasn't updated alongside Req 1. An implementer who copies the AC's permitted-imports list into the ESLint config would allow `react-dom` imports — which would silently violate LA-2's "no `react-dom` API" commitment if a substrate component ever imports something like `createPortal`. The whole point of LA-2 was to surface that misuse mechanically.

**Why this matters**: ACs drive CI configuration. The AC is the source of truth for what the lint rule allows; if it's stale, the lint rule will be permissive in exactly the way LA-2 was meant to prevent.

**Resolution**: Removed `react-dom` from the AC's permitted-imports list and added an explicit ESLint-bar clause: "The ESLint rule additionally bars `react-dom` to enforce LA-2's 'no `react-dom` API' commitment — the substrate uses standard React APIs only and shipping a `createPortal` or `flushSync` import would silently expand the peer-dep contract." Aligns the AC with Req 1's peer-dep wording (LA-2 closure) and keeps the substrate's `createPortal`/`flushSync` misuse path mechanically blocked.

---

#### RESOLVED: R10-4 — Pass-8/9 test commitments live in Req 19 prose but aren't reflected in the AC section

Pass 8/9 added many concrete test assertions inline in Req 19 paragraphs. They're spec-level commitments (the prose says "Tests assert: ...") but they don't appear in the Acceptance Criteria section. Inventory:

| Source paragraph | Test commitments | In AC? |
|---|---|:-:|
| SE-13 Reentrancy | (a) subscribe-during-notify doesn't fire, (b) unsubscribe-during-notify doesn't re-fire, (c) listener-calls-`consume()` produces one outer + one follow-up notify | ✗ |
| SE-14 / R9-1 Notify atomicity | (a) `consume()` pushing one reading + one stub-warning calls subscribers exactly once, (b) zero-`subscribe()` engine returns `getSnapshot() === 1` post-construction | ✗ |
| SE-18 Initial-snapshot | (a) construction with missing rule set: `errors.length >= 1` and `getSnapshot() === 1` immediately, (b) subscribing afterward doesn't retroactively fire | ✗ |
| FE-2 / R9-3 Hook outside Provider | exact-error-message throw assertion | ✗ |
| FE-3 Memoization | two-consecutive-`useAnalysisEngine()`-calls return reference-equal derived fields | ✗ |
| QA-13 Snapshot tick | (a) no-op leaves snapshot unchanged, (b) inactive-engine consume leaves snapshot unchanged, (c) single-trigger consume increments by exactly 1 even with reading + error | ✗ |

The existing AC at line 238 covers only the basic listener-API contract:

> a subscriber's listener fires after each `consume()` that mutates state, does not fire on a no-op event, and unsubscription stops further notifications.

A reviewer auditing PR coverage by walking the AC list would miss every test in the table above. The Req 19 prose drives implementation, but the AC list drives review — they're out of sync.

**Why this matters**: ACs are the spec's checkpoint surface for completeness. Embedding test commitments in dense Req-19 prose makes them easy to skim past. A future PR could land "all ACs satisfied" and still skip reentrancy, atomicity, initial-snapshot, hook-outside-Provider, memoization, and snapshot-tick tests.

**Resolution**: Picked option (a) — single new AC bullet hoisting the inline test commitments. Inserted after the existing `useAnalysisEngine()` AC so the React-layer test surface reads as a sequence (basic-shape AC → re-render AC → detailed-contracts AC). New bullet enumerates: reentrancy (3 cases), notify atomicity (2 cases), initial-snapshot semantics (2 cases), hook-outside-Provider exact-error-message throw, hook memoization referential equality, snapshot-tick edge cases (3 cases) — explicitly cross-references Req 19 paragraphs for full assertion text rather than duplicating it. Did not pursue option (b) (six separate AC bullets) — would have ballooned the AC section by ~10% for no net discoverability gain over option (a)'s explicit enumeration. Did not pursue option (c) (no change) — would have left the drift in place exactly as flagged.

---

#### RESOLVED: R10-5 — No AC requires fixture tests for the validation-playbook generator script

The validation-playbook generator (`scripts/generate-hazbot-validation-playbook.js`) is committed to in the AC at line 261 — emits per-tab markdown checklists into `docs/hazbot-validation/<id>.md`. But there's no AC requiring the script itself to be tested, while QA-2's resolution explicitly added fixture-based tests for the extraction script (`scripts/__fixtures__/*.xlsx`).

The two scripts are similarly load-bearing: extraction script generates `.ts` modules consumed at runtime; playbook generator emits markdown checklists Sam consumes for validation. The playbook generator depends on the DSL parser to walk each category's AST and produce the per-leaf required-state breakdown. A regression in the parser-walker (different from the parser itself) could silently produce wrong checklists — Sam would validate against an incorrect spec and miss real rubric mismatches.

**Why this matters**: WM-10's "Done definition" depends on Sam validating rule sets 23, 24, 25 with the help of the playbook. If the playbook is wrong, the validation is wrong, and the bug surfaces post-merge in WM-6's student-facing flow. Catching this at extraction time (where extraction-script-fixture tests live) keeps the same defense.

**Resolution**: Added an AC mirroring QA-2's extraction-script fixture-test commitment. New AC requires fixture-based tests for the playbook generator covering per-leaf breakdown for boolean factor variables, comparison-operator leaves, and `WITH` sub-expressions (one fixture row per kind). Inserted directly after the existing playbook-generator AC so the two read as a paired commitment (script does X / script's tests cover Y). Closes the symmetry gap with extraction-script tests; defends the AST-walker from silent regressions that would otherwise surface only during Sam's validation pass.

---

#### RESOLVED: R10-6 — Auto-generated header format for `dsl-grammar.md` is informally specified

Req 11 commits to an auto-generated header on every generated file:

> Each generated file starts with an auto-generated header comment (`// AUTO-GENERATED — DO NOT EDIT — re-run scripts/extract-hazbot-sheets.js`, or the markdown equivalent for `dsl-grammar.md`)

The matching AC at line 231:

> begins with an `AUTO-GENERATED — DO NOT EDIT — re-run scripts/extract-hazbot-sheets.js` header (TS comment for `.ts`, **markdown comment for `.md`**)

But "markdown comment" is informal — markdown has no native comment syntax. The conventional choice is `<!-- ... -->` (HTML comment, which markdown passes through verbatim), but the spec doesn't pin it. An implementer could plausibly write any of:

- `<!-- AUTO-GENERATED — DO NOT EDIT — re-run scripts/extract-hazbot-sheets.js -->`
- `> AUTO-GENERATED — DO NOT EDIT — re-run scripts/extract-hazbot-sheets.js` (blockquote)
- `**AUTO-GENERATED — DO NOT EDIT — re-run scripts/extract-hazbot-sheets.js**` (visible bold paragraph)
- A literal `<!-- ... -->` HTML comment (invisible) plus a visible text marker

The CI assertion needs a regex; without a pinned format, the regex can drift from the script's actual output.

**Why this matters**: The header is the only mechanical defense against accidental hand-edits of generated files (DV-1's resolution explicitly relies on this). If the format is implementer-discretion, the header check becomes implementer-defined too — which downgrades a "CI invariant" to a "best-effort convention."

**Resolution**: Picked the visible blockquote variant rather than the invisible HTML comment. Markdown header is pinned as `> **AUTO-GENERATED — DO NOT EDIT — re-run \`scripts/extract-hazbot-sheets.js\`**` followed by a blank line. Rationale: HTML comments are stripped by GitHub's markdown preview, which would defeat the human-facing warning purpose (DV-1 closure framed the warning as protection against hand-editing — invisible-in-preview means the warning only fires when someone opens the raw file in an editor, narrowing its reach). Blockquote renders prominently in both GitHub and any markdown editor, doubles as a visual signal, and gives the CI assertion a deterministic per-format regex (`/^> \*\*AUTO-GENERATED/m`). Updated both Req 11's auto-generated-header sentence and the matching AC at line 231 to pin the format.

---

### Re-review (Pass 11 — issues introduced by Pass 10 resolutions)

Walked the six Pass 10 resolutions for second-order gaps. Pass 10 was narrow-scope text edits to existing requirements and ACs — no new requirements, no new architectural commitments — so the second-order surface was minimal.

- **R10-1**: forward-references "the Performance paragraph below"; FE-3's paragraph is labeled `**Performance**:` (bolded inline) and the forward-reference resolves. Clean.
- **R10-2**: snapshot-tick rule reads as "outside construction, ticks iff mutated" with the construction exemption first. No new contradiction.
- **R10-3**: explicit `react-dom` bar lives as a follow-on sentence after the existing mobx/mobx-react bar. Slightly stylistic but no real ambiguity; the AC reads cleanly.
- **R10-4**: enumerated test commitments cross-reference Req 19 prose for full assertion text. Reviewer auditing the AC list now hits the specific contracts.
- **R10-5**: parenthetical "(or reuse the extraction-script fixture's output as input)" implies running extraction first to produce the TS module; implementer reading this naturally understands the chain. No further pinning needed.
- **R10-6**: AC commits to "per-format regex" without baking in the literal regex; resolution narrative provides one example (`/^> \*\*AUTO-GENERATED/m`). Implementer-discretion regex is fine given the format is pinned.

**No new OPEN issues.** Self-review stable at Pass 11.

---
