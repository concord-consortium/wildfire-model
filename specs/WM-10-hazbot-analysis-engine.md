# Hazbot: In-memory Analysis Engine + Debug Sidebar

**Jira**: [WM-10](https://concord-consortium.atlassian.net/browse/WM-10)

**Status**: **Closed**

## Overview

Build a future-extractable, MobX-free analysis-engine substrate under `src/hazbot/engine/` plus a thin wildfire-specific bridge that maps the existing simulation log stream onto the engine's input contract, and ship a developer-only debug sidebar that surfaces the engine's evaluation in real time. No student-facing UI and no persistence — this is the validation slice that proves the rubrics actually match student behavior before the next iteration commits to a Firebase/LARA persistence schema (AP-73) and the student-facing button + popover (WM-6).

The engine classifies student behavior in the wildfire simulation against authored rule sets (sourced from the *Wildfire Hazbot Feedback Tables* Google Sheet) and surfaces a matched category that a future host-app UI can use to drive pedagogical feedback (coach-marks, "Show me" walk-throughs, confetti). This story delivers the validation slice in three pieces: a self-contained analysis-engine substrate (positioned for future extraction into a standalone library), a wildfire-specific bridge, and a developer-only debug sidebar that lets Sam and the PM watch the engine evaluate live.

## Requirements

### Engine

- **Self-contained engine substrate under `src/hazbot/engine/`** bundling engine core (parser, evaluator, error types, generic `Engine<TReading, TDefaults>` class, listener API), React integration (`AnalysisEngineProvider` + `useAnalysisEngine` hook), debug sidebar UI (generic over `<TReading, TDefaults>`), and substrate-owned plain CSS. **No imports from wildfire-model state/store/UI, no imports from `src/log.ts`, no MobX dependency.** Only runtime peer dependency: `react` (`>= 18.0.0`). Wildfire-specific code lives in a separate bridge layer at `src/hazbot/wildfire/`.
- **In-memory only.** Engine state resets on page refresh. *(WM-10 scope decision; AP-73 adds persistence + cross-visit ratcheting.)*
- **Inputs.** Engine consumes `SimulationStarted`, `SimulationEnded`, `SimulationStopped`, `SimulationRestarted`, `SimulationReloaded`, `ChartTabShown`, `ChartTabHidden`. `TopBarReloadButtonClicked` is handled by the page reload itself.
- **Optional `ambientState` parameter on `log()`.** Public LARA payload (arg 2) goes to LARA unchanged; `ambientState` (arg 3) is forwarded only to the engine. Initial use case: `SimulationStarted` includes `ambientState: { chartTabOpenAtStart: boolean }`.
- **Ambient state validation at trigger time.** Both factor-variable impls and sim-prop impls declare `ambientStateKeys: { [trigger]: string[] }`. Engine validates at trigger time; missing keys raise `ambient-validation` errors. Failed triggers append no Reading; subsequent modifier events are dropped as `orphan-modifier` errors. One error per `(implName, missingKey)` pair.
- **Factor variables** are values *derived* from the readings substrate via `FactorVariableImpl.compute`. Value types: `boolean`, `Set` (with `.size`), `array` (with `.length`).
- **Simulation properties** (UpperCamelCase) are TypeScript predicates over a single run's payload, evaluated against a specific run held by a factor variable via `WITH`.
- **Stub factor variables / sim-props.** Two stubs return `false` and emit a `stub-warning` once per session per stub at engine construction: `SparksAtTopAndBottom` (needs ridge/valley detection on topography), `sawIntenseFire` (needs `outcome` flag on end-of-run events). *(Rule sets depending on these stubs evaluate non-success categories correctly; only the success category is unreachable.)*
- **Monotonicity.** Matched category may only stay the same or increase within a page-load session. *(Cross-visit one-way ratcheting deferred to AP-73 — see Not Yet Implemented.)*
- **Readings substrate.** Chronological array of `Reading` objects, one per trigger event. Modifier events (`ChartTabShown`/`Hidden`) append `ReadingUpdate` entries to the latest Reading's `updates` array — only when the latest Reading was triggered by a run-start trigger (per the bridge-supplied `runStartTriggers`). Orphan modifiers (no current run window) are dropped with `reason: "no-prior-trigger" | "prior-trigger-failed" | "between-runs"`.
- **Active rule set selection** via URL param `?hazbotRules=<id>`. Missing/invalid id raises a `load-failure` error and the engine stays inactive; `engine.consume()` becomes a no-op. The engine is always constructed when the bridge mounts the Provider — `ruleSet?: undefined` is the rejection mode, not skipping construction.

### Rule Sets as Data + DSL Parser

- **Rule sets as generated TypeScript modules** at `src/hazbot/rule-sets/<id>.ts`, produced from the Google Sheet by `scripts/extract-hazbot-sheets.js`. Each file exports a typed `RuleSet<WildfireDefaults>`; an `index.ts` exports the keyed map. Auto-generated header (`// AUTO-GENERATED — DO NOT EDIT — re-run scripts/extract-hazbot-sheets.js`) on the first line of every generated file; CI test asserts it survives. The extraction script also dumps the sheet's README tab to `src/hazbot/dsl-grammar.md` so DSL grammar drift surfaces in PR review.
- **Default-value validation at load.** Reference-driven walk: AST-walks every category's parsed expression to collect referenced factor-variable + sim-prop names, looks up each impl, unions `requiredDefaults` paths, asserts each path resolves on `defaults`. Walking only *referenced* names avoids over-strict failures from unused defs. Missing-defaults / missing-impl failures append `load-failure` errors and deactivate the engine — but `engine.ruleSet` is **retained for sidebar display** ("deactivated, not discarded"). Path syntax: `[*]` means every entry of an array must have the field.
- **DSL parser** handles `AND`, `OR`, `NOT`, `WITH`, comparison operators (`>`, `<`, `==`, `!=`, `>=`, `<=`), `.size`/`.length`, parentheses, and event-data paths. Comparison operators require numeric *operand forms* (`.size`/`.length`/non-negative decimal integer literal). Sim-props are valid only inside `WITH`. Each category's expression is parsed once at load and the AST is cached; runtime evaluation never re-parses. Parser errors carry source expression, offending token/span, and column/offset; surface via console, errors panel, and inline per-category highlighting.
- **Parser has its own unit-test suite** covering every construct, precedence, parenthesization, the `WITH` greedy-binding rule, comparison operator boundary cases, and parse-error reporting. Any parse failure rejects the rule set; engine becomes inactive but `engine.ruleSet` is retained so the sidebar can still render the rubric.
- **Factor-variable computations stay as TypeScript code** — the primitives the DSL parser references.

### Debug Sidebar

- **Sidebar component lives in the substrate at `src/hazbot/engine/sidebar/`** — generic over `<TReading, TDefaults>`, reads only through `useAnalysisEngine()` and the engine's typed accessors. Substrate-owned plain CSS, light-mode only.
- **Toggleable via URL flag `?hazbotSidebar=true`** in all builds (dev and production). Engine activation is independent of the sidebar flag.
- **Sidebar displays**: active rule set id (with fallback chain), factor variable state with click-expandable provenance, sim-prop state evaluated against the latest run-start reading, readings panel (newest-first display, chronological 1-based indexing), all categories with truth-colored leaves (green/underline for true, red/strikethrough for false — double-encoded for colorblind accessibility per WCAG-1), WITH binding detail showing matched-on reading, parsed AST inspection, live transitions, engine errors/warnings panel at the top, header with engine + app rules versions. When the engine is inactive, status icons and per-leaf coloring are suppressed; behavior splits by whether `ruleSet` is defined (rendered structurally if defined; only errors panel if undefined).
- **Generic payload rendering** — substrate has no compile-time knowledge of the app's `TReading` shape; renders unknown fields as `JSON.stringify(_, null, 2)` with `sessionId` stripped. *(Per-app render-prop slot deferred — see Not Yet Implemented.)*
- **Visual styling matches the `?logMonitor` sidebar's overall theme**: ~300px fixed-width column, monospace, similar header/affordances. **Light-mode only** (no theme switching, no `data-theme` attribute, no `theme` prop). Substrate uses plain CSS files (no SCSS, no CSS-in-JS).
- **Coexistence with `?logMonitor`**: both sidebars render side-by-side in flex order: simulation → logMonitor → Hazbot sidebar.

### React Integration

- **Substrate-owned React context + hook** at `src/hazbot/engine/react/`. `AnalysisEngineProvider<TReading, TDefaults>` (props: `engine`, `appRulesVersion: string | number`, both required — no fallback), `useAnalysisEngine<TReading, TDefaults>()` hook backed by `useSyncExternalStore`. **No MobX dependency.**
- **Engine listener API**: `subscribe(listener): unsubscribe`, `getSnapshot(): number` (monotonically-increasing version counter). Contracts: reentrancy-safe (snapshot listener set before iteration; recursive notifies buffered as one follow-up); single notify per `consume()` call regardless of mutation count; counter starts at `0` pre-construction and `1` post-construction (load-time errors visible on first hook render); counter ticks iff `readings` or `errors` actually mutated.
- **Browser-only** by design; no `getServerSnapshot` provided.
- **Hook outside Provider** throws `"useAnalysisEngine must be used inside <AnalysisEngineProvider>"` — standard React idiom.
- **Provider mount truth table**: bridge mounts the Provider iff `hazbotRules !== undefined || hazbotSidebar === true`. Engine construction precedes Provider mount; sidebar render is independently gated on `hazbotSidebar === true`; activation log fires iff `engine.isActive` post-construction. The "no flags" row is the zero-cost path.
- **Performance**: derived fields (`factorVariableValues`, `matchedCategory`, `perCategoryTruth`) computed once per snapshot via a module-level `WeakMap<Engine, ...>` cache and shared across consumer renders within that snapshot.

### Versioning and Activation Log

- **Engine version** (substrate, semver, initial `"0.0.1"`) exported from `src/hazbot/engine/version.ts`.
- **App rules version** (wildfire bridge, integer, initial `1`) exported from `src/hazbot/wildfire/rules-version.ts`.
- **`AnalysisEngineActivated` log event** fires exactly once per page load when `engine.isActive === true`, with payload `{ engineVersion, appRulesVersion, ruleSetId }` (no `sessionId`). The bridge owns the emission; substrate emits no log events itself. Bridge's `translate` callback maps the event to `no-op` so the engine doesn't consume its own activation.
- **Bump policy**: engine version follows semver (patch for fixes, minor for additive API, major for breaking changes); app rules version increments whenever rule-set content materially changes (new tab, edited categories/expressions/defaults). Editorial-only feedback-text changes don't require a bump.

### Done Definition

WM-10 was considered complete when:

1. Engine + sidebar worked end-to-end per the acceptance criteria.
2. Sam validated rule sets 23, 24, and categories 1–5 of 25.

Tabs 32–35 were explicitly *not* gating; they unblock as Sam fills in defaults at source (see Not Yet Implemented). Category 6 of 25 is unreachable due to the `SparksAtTopAndBottom` stub.

## Out of Scope

- Student-facing "Check my work!" button and feedback popover (deferred to **WM-6**).
- Firebase persistence + LARA API hooks (deferred to **AP-73**). AP-73 also implements cross-visit monotonicity (one-way ratcheting) by persisting the matched-category floor and seeding it on engine boot.
- Activating grayed-out questions (deferred to **AP-76**).
- Extracting the engine into a shared library — deferred until a second simulation needs it (procedure documented in [src/hazbot/TBD.md §8](../src/hazbot/TBD.md#8-extracting-the-engine-into-its-own-library)).
- Live fetching of rule sets from the Google Sheets API (use xlsx export workflow for this story).
- Authoring UI for editing rule sets — JSONs are regenerated from the sheet.
- Implementing `SparksAtTopAndBottom` ridge/valley detection — stubbed only.
- Implementing `sawIntenseFire` outcome detection — stubbed only.
- Tab 54 (no pseudo-code authored).
- Empty placeholder tabs 43, 45, 47 (marked "TBD (activity revision)").
- Log replay / import — deferred to a possible follow-up if live-validation surfaces gaps.
- Per-app reading-payload renderer slot in the substrate sidebar — substrate lands zero-config in WM-10 (JSON-rendering whatever the engine carries); a render-prop slot is a candidate WM-6-era extension if real-world use surfaces a need.

## Not Yet Implemented

Captured in [src/hazbot/TBD.md](../src/hazbot/TBD.md) as the canonical follow-on tracker:

- **Tabs 32, 33, 35** — blocked on missing zone/wind defaults in the source sheet (engine refuses to load with `defaults: {}`). Unblock when Sam fills in defaults at source and the extraction script re-runs. *(Per Done Definition, this does not gate WM-10's merge.)*
- **Tab 34** — same defaults blocker, **plus** the `sawIntenseFire` factor variable is stubbed; even with defaults filled the intensity-comparison categories (Cat 4, Cat 5) will be unreachable until the simulation emits an intensity classification on `SimulationEnded.outcome`.
- **Tab 25 Cat 6** — unreachable because the `SparksAtTopAndBottom` sim-prop is stubbed; needs ridge/valley detection algorithm based on the topography map (substantial new feature noted in the sheet's Details column as "Alert: new algorithm coding required here").
- **Tabs 43, 45, 47, 54** — placeholder rows in the source sheet with no categories or factor-variable defs; listed in `EXCLUDED_TABS` in `scripts/extract-impl.js` so the extractor skips them. Per-tab unblock procedure in [TBD.md §3](../src/hazbot/TBD.md#3-missing-rule-sets-entirely).
- **Student-facing pedagogical UI** — the engine surfaces `matchedCategory` via `useAnalysisEngine()`, but the only consumer today is the dev sidebar. The actual Hazbot feedback experience (launcher button, coach-marks rendering `Category.feedback`/`arrowText`, visual-feedback overlays, confetti, cooldown/re-trigger logic, matched-category transition events) is a follow-on feature (WM-6 scope decision).
- **Engine package extraction** — the substrate is extraction-ready (no upward imports, MobX-free, react-dom-free, ESLint-enforced boundary), but the actual extraction into an npm package is deferred. Full procedure with file-tree split, build config, and import-swap steps in [TBD.md §8](../src/hazbot/TBD.md#8-extracting-the-engine-into-its-own-library).
- **Paired-reading DSL primitive** — some sheet rubrics (e.g., ruleset 33's `ForestWAWOSuppression`) implicitly compare two runs ("ran with X, then ran with Y"). The DSL has `WITH` binding to a single witness reading but no primitive for "two readings exist such that …". The current bridge-side `ForestWAWOSuppression` cheats by checking both vegetation types in one witness reading's zones; works for two-zone presets but isn't literally "paired runs."

## Decisions

### Requirements-level

#### Rule-set on-disk format
**Context**: The original ticket said "TSV exported from each sheet tab"; scoping evaluated TSV vs JSON vs generated TypeScript.

**Options considered**:
- A) Raw 2D-array JSON — runtime parsing, no compile-time shape check.
- B) TSV per ticket — runtime parsing, escaping ambiguity for tab-containing cells.
- C) Pre-shaped JSON — runtime validation still required; no compile-time check.
- D) Generated TypeScript modules — compile-time shape checking; no runtime JSON parsing.

**Decision**: D — generated TypeScript. Rule sets are code-adjacent data, referenced by code identifiers, loaded by code; generated `.ts` modules give compile-time shape checking and IDE autocomplete, and shrink the runtime loader's job to "evaluate the DSL strings and walk readings." DSL identifier validation remains a runtime concern.

---

#### WITH operator — README is authoritative
**Context**: The original ticket flagged WITH as a blocker, but the sheet's README tab defined it: `<var-w-prop-expression>` takes the longest possible prop expression (greedy), where a "prop expression" is operators + UpperCamelCase identifiers only.

**Options considered**:
- A) Confirm with Sam that README's greedy-binding definition is authoritative.
- B) Treat README as authoritative without Sam confirmation.
- C) Ask Sam for additional examples covering corner cases.

**Decision**: B — README is authoritative. Background section documents the greedy-binding rule and contrasts it with the lowercase-identifier-terminates-prop-expression rule. Parser tests cover the worked examples plus corner cases (NOT inside WITH, parenthesized WITH, comparisons inside WITH).

---

#### AND/OR precedence
**Context**: The README tab leaves AND/OR precedence open. Current rule sets don't mix AND and OR in the same expression, but the parser needs defined behavior.

**Options considered**:
- A) Standard logic precedence: NOT > AND > OR.
- B) Strict left-to-right at equal precedence with parens required for mixed AND/OR.
- C) Defer until a sheet actually mixes AND and OR.

**Decision**: A — standard logic precedence. Full precedence (highest = tightest): WITH-construct → parentheses → `.size`/`.length` and comparison ops → NOT → AND → OR. WITH is at the *highest* level per README's PRECEDENCE rule i, not the lowest.

---

#### TBD default values for terrain / vegetation / drought / wind
**Context**: Tabs 32, 33, 34, 35 mark default values as "TBD (activity revision)." Without defaults, `setX` factor variables can return wrong results.

**Options considered**:
- A) Block engine load for those tabs until Sam supplies defaults.
- B) Source defaults from the wildfire-model preset config — couples engine to preset metadata.
- C) Allow per-rule-set defaults with preset fallback.

**Decision**: A — block at load time. Sam supplies defaults at source. The engine validates that any factor variable referencing a "default-comparing" computation has the necessary defaults, and raises a clear dev-time error if missing. Effectively gates tabs 32–35 from the engine until the sheet is updated.

---

#### Tab 35 vs tab 33 — ship both
**Context**: Both tabs implement forest-with-vs-without-suppression with overlapping factor variables; tab 35 adds `UniformTerrainTypes` and a 6th category.

**Options considered**:
- A) Mark one as canonical; the other as "draft / not for engine."
- B) Ship both; PM picks per activity-page.
- C) Treat 35 as canonical and remove 33.

**Decision**: B — ship both. Each is selectable via `?hazbotRules=33` or `?hazbotRules=35`. PM/curriculum author chooses which applies per activity page.

---

#### Sheet typos — fix at source
**Context**: Several typos in the source sheet (`setVegation`, `ForestWAWOSuppresion`, `setAntVar`, `setVegetatoin`).

**Options considered**:
- A) Fix at source in the sheet, re-export.
- B) Maintain a small alias table in the engine for known historical typos.
- C) Fail loudly on any unknown identifier and require a fix before the rule set loads.

**Decision**: A + C combined. Fix at source whenever an author can; the DSL parser fails loudly on unknown identifiers so any typo becomes an immediate, actionable error. No alias table.

---

#### Stub "not yet implemented" log — frequency
**Context**: Stubs always return `false` and log a warning. Logging on every call would spam the console.

**Options considered**:
- A) Log once per session per stub.
- B) Log once per rule-set load.
- C) Log on every evaluation.

**Decision**: A — once per session per stub, emitted at engine-construction time immediately after load + validation succeed. Construction runs once per page load, so emission is structurally bounded; no runtime dedup state needed. If load-time validation fails, no stub warnings emit (engine inactive, stubs unreachable).

---

#### Engine reset semantics on Restart / Reload / TopBarReload
**Context**: "In-memory only — state resets on page refresh." What happens on within-session Restart / Reload / TopBar-Reload?

**Findings**:
- `TopBarReloadButtonClicked` triggers `window.location.reload()` → full page reload, engine destroyed and re-booted.
- `SimulationRestarted`, `SimulationReloaded` — bottom-bar actions; do not reload the page. The preceding `SimulationEnded` already captured the reason.

**Decision**: A — no engine-driven resets within a session. `TopBarReloadButtonClicked` is handled by the page reload itself; `SimulationRestarted`/`SimulationReloaded` are no-ops; monotonicity preserved across the full page-load lifetime.

---

#### Debug sidebar URL flag name
**Options considered**:
- A) `?hazbotDebug=true`.
- B) `?hazbotSidebar=true`.
- C) Always-on whenever `?hazbotRules` is set in dev builds.

**Decision**: B — `?hazbotSidebar=true`. Distinct from `?hazbotRules` (which selects the rule set) and `?logMonitor` (existing log-monitor sidebar).

---

#### Layout when both `?logMonitor=true` and `?hazbotSidebar=true`

**Options considered**:
- A) Stack vertically in a single right column.
- B) Side-by-side (two right columns).
- C) Mutually exclusive — Hazbot suppresses logMonitor when both flags are set.

**Decision**: B — side-by-side in flex order: simulation → logMonitor → Hazbot sidebar.

---

#### Devdependency choice for xlsx parsing
**Context**: The extraction script originally used [`xlsx`](https://www.npmjs.com/package/xlsx) (SheetJS), which has known unpatched advisories. Tested all three options against the actual workbook on 2026-05-08.

| Criterion | xlsx | exceljs | **read-excel-file** |
|---|---:|---:|---:|
| npm advisories | 2 high | clean | clean |
| Unpacked size | 7.5 MB | 21.8 MB | **1.2 MB** |
| Direct deps | 7 | 9 | **3** |
| Preserves empty cells | ✅ | ❌ | ✅ |
| Output vs xlsx baseline | — | substantially different | identical except one trailing-space trim |

**Decision**: `read-excel-file`. `exceljs` was eliminated for collapsing empty cells (destroying column layout). `read-excel-file` produced byte-equivalent output at ~1/6 the install size with no advisories. Script and `package.json` updated 2026-05-08.

---

#### Direct Google Sheets fetch — not supported
**Context**: User asked whether direct Sheets API fetch makes sense.

**Decision**: Defer — extraction script supports xlsx files only; no Google Sheets API integration is planned. Author's workflow: edit the sheet, File → Download → .xlsx, run extraction.

---

#### Does monotonicity carry across student visits? (PI question)
**Context**: Within a single session, the engine never falls back to a lower category. The open question is what happens across visits.

**Options considered**:
- A) **One-way progression across visits** — once a student earns category N on a page, they never see lower-category feedback for that page again. The rubric is a one-way ratchet.
- B) **Per-visit reset** — each session starts fresh based on current behavior; high-level student potentially re-sees beginner nudges.

**Decision**: A — one-way progression across visits. PIs confirmed 2026-05-08. Pedagogical reasoning: a student who has progressed past early categories should not re-see beginner nudges; "have you tried setting drought?" reads as patronizing to a student who has already demonstrated mastery.

**WM-10 scope impact**: none. WM-10's in-memory implementation satisfies within-page-load monotonicity automatically. The cross-visit slice is implemented in **AP-73** via persistence (persist matched-category floor per `(student, activity-page)`, seed on engine boot, surface `max(persistedFloor, currentEvaluated)`).

### Implementation-level

#### IMPL-1 — Steps exceeding the ~500-line guideline
Two implementation steps (parser, rule-set generation) were larger than the ~500-line implementation-step guideline.

**Decision**: Keep them as single steps. Splitting would create artificial review boundaries through tightly-coupled logic (parser is a single conceptual unit; rule sets share extraction infrastructure). Trade-off accepted for cohesion over arbitrary size cap.

---

#### IMPL-2 — Bridge-side sidebar test placement
Where the wildfire-bridge sidebar test (using real `ruleSets["23"]`) should live.

**Decision**: Deferred from step 6 (substrate sidebar) to step 10 (rule-set generation) because `ruleSets["23"]` is a step-10 deliverable; running the test earlier would couple step 6 to step 10's outputs. Test file lands at `src/hazbot/wildfire/sidebar.test.tsx`.

---

#### IMPL-3 — Generated playbook docs commit timing
Whether to commit the generated `docs/hazbot-validation/*.md` files alongside the generator script or as a separate step.

**Decision**: Commit alongside generator step. Reviewer sees both the generator and its output in one PR; subsequent re-generations show as content-only diffs.

---

#### IMPL-4 — Stub-flag mechanism on factor-variable / sim-prop impls
How the substrate identifies which impls are stubs (to emit `stub-warning` errors).

**Options considered**:
- A) Static `isStub?: true` field on the impl object.
- B) Separate `stubs?: string[]` registry on `EngineOpts`.
- C) Convention-based via sentinel helper.

**Decision**: A — `isStub?: boolean` optional field on both `FactorVariableImpl` and `SimPropImpl`. Fits the existing optional-metadata pattern alongside `ambientStateKeys` and `requiredDefaults`; keeps the flag co-located with the impl that wears it; no drift risk between an impl and an out-of-band registry.

### Self-Review series

The spec went through 11 multi-pass self-review cycles covering Senior Engineer, QA Engineer, Product Manager, Education Researcher, DSL/Parser Specialist, React/Frontend Specialist, and Library Architect roles. Most resolutions were tactical refinements (test-shape enumerations, missing API accessors, edge cases). A few were load-bearing architectural decisions worth preserving:

- **Reading as a generic boundary (REF-1)** — The substrate defines `BaseReading`; the wildfire bridge declares `WildfireReading extends BaseReading`. The `Engine` is parameterized over `<TReading, TDefaults>` so future extraction is a directory move with no type changes. Same pattern applied to `WildfireDefaults` (R5-3).
- **Engine state as two append-only logs (SE-6)** — `readings: Reading[]` plus `errors: EngineError[]` are the only mutable domain state. Everything else (`matchedCategory`, stub-warning dedup, sidebar load-error banner) is a derived value. Simplifies replay-from-log for future AP-73 persistence work.
- **Non-throwing load-time error model (PS-1)** — Engine constructor never throws; on validation failure it appends to `errors`, sets the engine inactive, and `console.error`s in parallel. Bridge branches cleanly on `engine.isActive` rather than try/catch.
- **Orphan-modifier detection (SE-7 + R5-1)** — Modifier events that arrive without a current run window are dropped and recorded with `reason: "no-prior-trigger" | "prior-trigger-failed" | "between-runs"`. Detection uses a timestamp comparison restricted to `ambient-validation` errors so unrelated `stub-warning` / `impl-eval-throw` entries don't cause misclassification.
- **WCAG-1 accessibility concession** — Per-leaf truth coloring uses green/underline for true, red/strikethrough for false (double-encoded so colorblind developers can recover truth values without color).
- **Substrate boundary mechanically enforced (QA-8)** — ESLint `no-restricted-imports` rule scoped to `src/hazbot/engine/**` disallows any import path resolving outside the substrate; also bars `mobx`, `mobx-react`, and `react-dom`. Substrate is preprocessor-free (plain CSS, not SCSS — LA-1) and react-dom-free (LA-2).
- **Substrate public API surface explicit (LA-3)** — Tech Notes lists exactly the 13–14 names exported from `src/hazbot/engine/index.ts`; PRs touching `index.ts` are treated as architecture-level changes.
- **Reentrancy + atomicity contract on `subscribe`/`notify` (SE-13, SE-14, SE-18, QA-13)** — Single notify per `consume()` call; reentrancy-safe via snapshot + guard; counter starts at `0` pre-construction and `1` post-construction (load-time errors visible on first hook render); counter ticks iff `readings`/`errors` actually mutated.
- **Browser-only Provider (FE-1)** — Substrate is permanently browser-only; no `getServerSnapshot` provided. SSR consumers must gate behind `typeof window !== "undefined"`.
- **Reference-driven load-time validation (Finding 15)** — Only factor variables / sim-props *referenced* by at least one category expression are validated. An unused factor variable with a missing `requiredDefaults` path doesn't block load.
- **Sim-props get the same validation symmetry as factor variables (Finding 14)** — `ambientStateKeys` and `requiredDefaults` declarations on `SimPropImpl` are validated alongside `FactorVariableImpl` declarations, so a sim-prop like `GraphOpen` reading `ambientState.chartTabOpenAtStart` fails loudly if the call site forgets the key.
- **Run-window contract via `runStartTriggers` (Finding 11, Finding 22)** — Bridge passes `runStartTriggers: ["SimulationStarted"]`; substrate orphans modifiers whose latest reading isn't a run-start trigger (`between-runs` reason). No separate `runEndTriggers` opt — the single-opt design subsumes both end-trigger and other non-run-start cases.

The full passes lived in the source spec under `## Self-Review` and the 11 `### Re-review (Pass N)` subsections of `requirements.md`; the source folder was removed when this spec was closed. Git history retains the unedited record at the closing commit.
