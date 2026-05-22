# Hazbot: Extract All Rule-Set Sheets and Add/Update Rule-Sets

**Jira**: https://concord-consortium.atlassian.net/browse/WM-18
**Repo**: https://github.com/concord-consortium/wildfire-model
**Implementation Spec**: [implementation.md](implementation.md)
**Status**: **In Development**

## Overview

The Hazbot analysis engine classifies how a student uses the wildfire
simulation; its classification rules are authored in a spreadsheet and
mechanically converted into code. That spreadsheet is now complete and revised
while the generated code has fallen behind — four activity pages have no
rule-set and seven others have drifted from what was authored. WM-18
regenerates all eleven rule-sets from the current spreadsheet, implements the
new behavior-checks the updated rules reference, and validates every page.

## Project Owner Overview

The Hazbot analysis engine classifies how a student uses the wildfire
simulation and decides what coaching feedback to surface. The rules that drive
that classification are not hand-written — curriculum staff author them in the
"Wildfire Hazbot Feedback Tables" workbook, and they are mechanically extracted
into the repo as code. That workbook's rule-set sheets are now all filled in
and revised, so the repo has fallen behind: four wildfire activity pages have
no rule-set at all, and seven more no longer match what curriculum staff
authored.

WM-18 brings the repo back in sync, so every wildfire activity page has a
current, validated rule-set, and implements the small set of new
behavior-checks the updated rules rely on. A few checks that need deeper engine
work are deferred to tracked follow-up tickets (WM-15, WM-28), and the
rule-sets that depend on them ship with the gap documented. The classification
result is currently consumed only by a developer-facing debug sidebar — not
shown to students and not recorded as research data — so WM-18 changes nothing
students experience today; it is foundational work that readies the rule-sets
for the eventual student-facing Hazbot feature.

## Background

The Hazbot analysis engine (delivered under WM-10) classifies student
simulation-use behavior into ordered pedagogical categories. Each wildfire
activity page has a numbered rule-set; rule-sets are **not hand-written** — they
are extracted from the "Wildfire Hazbot Feedback Tables" workbook by
`scripts/extract-hazbot-sheets.js`, which emits one TypeScript module per tab
plus an aggregate `index.ts` and `dsl-grammar.md`.

WM-18 was originally scoped as "re-extract and validate rule-sets 32–35 once
defaults land." That premise was wrong — engine defaults are sourced from the
simulation config, which was handled separately in **WM-27** (now landed). WM-18
is therefore re-scoped to the extraction and rule-set work itself.

**State at the start of WM-18:**

- The latest workbook is `~/Downloads/Wildfire-Hazbot-Feedback-Tables-2026-05-22.xlsx`.
  It has 13 sheets: `README`, `SIMINIT`, and 11 rule-set tabs —
  `23, 24, 25, 32, 33, 34, 35, 42, 45, 47, 54`.
- The repo has modules for **7** rule-sets only: `23, 24, 25, 32, 33, 34, 35`
  ([src/hazbot/rule-sets/](../../src/hazbot/rule-sets/)). Tabs `42, 45, 47, 54`
  have no module.
- `EXCLUDED_TABS` in [scripts/extract-impl.js](../../scripts/extract-impl.js)
  is `["43", "45", "47", "54"]` — note it lists `43`, but the workbook's tab is
  numbered `42` (the `SIMINIT` sheet labels it *"use existing 43 model with a
  fixed spark"*; the activity page was renumbered). There is no tab `43` in the
  current workbook.
- The existing modules have **drifted from the sheet**. For example, the repo's
  [23.ts](../../src/hazbot/rule-sets/23.ts) category 5 expression is
  `setDroughtLevel AND usedOneSparkPerZone`, but the 2026-05-22 tab-23 sheet has
  `ranSimulation WITH CorrectZoneSetup AND OneSparkPerZone` — a different
  factor-variable set, a new `CorrectZoneSetup` sim-prop, and `WITH`-prop
  syntax. Existing modules must be regenerated, not patched.
- Only `23, 24, 25` have per-rule-set Jest test files. `32, 33, 34, 35` and the
  four new tabs have none.
- Per WM-27, the current modules are *not* a clean regenerate — they were
  hand-edited to drop a per-rule-set `defaults` field. WM-18 owns reconciling
  the modules so a re-extract is once again clean
  ([docs/hazbot-update-workflow.md](../../docs/hazbot-update-workflow.md)).

The DSL, parser, engine, sidebar, and wildfire bridge are feature-complete for
what they need to do here. WM-18 is content-extraction plus a bounded set of
new factor-variable / sim-prop impls in the wildfire bridge.

## Requirements

### Extraction

- **R1.** `EXCLUDED_TABS` in `scripts/extract-impl.js` is emptied (`[]`) so all
  11 rule-set tabs are extracted. (`README` / `SIMINIT` are auto-skipped — the
  extractor returns `null` for non-rule-set tabs.)
- **R1a.** The extractor (`parseTab` in `scripts/extract-impl.js`) drops
  category rows with `id >= 100` so feedback-mechanism categories are not
  emitted into modules (per Q3). Without this, a re-extract emits an
  unparseable `expression` and the rule-set fails to load. The extractor also
  warns when a row's `id` and its `-- no pseudo code --` pseudo-code marker
  disagree — a feedback row misnumbered below 100, or a sim-use category
  misnumbered at/above 100 — so an authoring misnumbering surfaces at extraction
  rather than as a load crash or a silently dropped category.
- **R1b.** The extractor changes — R1's `EXCLUDED_TABS` emptying, R1a's
  `id >= 100` filter, and R2a's omission of the per-rule-set `defaults` field —
  are each covered by new/updated cases in
  [scripts/extract-impl.test.js](../../scripts/extract-impl.test.js).
- **R2.** Running `node scripts/extract-hazbot-sheets.js <workbook>` produces
  the rule-set modules, `index.ts`, and `dsl-grammar.md` with **no hand-edits
  required afterward** — a clean, deterministic regenerate: the same workbook in
  produces the same modules out. (The workbook is identified by filename in
  Background; it is deliberately not committed or checksummed.)
- **R2a.** The `defaults`-field drift introduced by WM-27 is reconciled so a
  re-extract is clean (R2): the extractor (`scripts/extract-impl.js`) emits
  modules with no per-rule-set `defaults` field, matching the current
  hand-edited module shape. If instead the module schema is intended to carry
  `defaults`, that is stated here and the engine/loader expectation is
  confirmed. Covered by `scripts/extract-impl.test.js` (per R1b).
- **R3.** New per-tab modules exist for `42, 45, 47, 54`; modules `23–35` are
  regenerated from the 2026-05-22 sheet content.
- **R4.** `src/hazbot/rule-sets/index.ts` exports all 11 rule-sets.

### Factor variables / sim-props

- **R5.** Every factor variable and sim-prop referenced by an extracted module
  either (a) has a working impl in the wildfire bridge, or (b) is a documented
  stub with a linked Jira sub-ticket. No category loads with a `missing-impl`
  failure.
- **R6.** The 8 in-scope new impls — `CorrectZoneSetup`, `UniformZoneSettings`,
  `triedAllVegetations`, `usedFireline`, `Fireline`, `DefaultVars`,
  `DefaultVegetations`, `SevereDroughts` (per Q1) — are implemented in the
  wildfire bridge with unit tests
  ([factor-variables.ts](../../src/hazbot/wildfire/factor-variables.ts),
  [sim-props.ts](../../src/hazbot/wildfire/sim-props.ts)). For impls that
  hard-code sheet constants (`CorrectZoneSetup`, `DefaultVars`), the unit tests
  cite the sheet definition as their fixture source of truth.
- **R6a.** The `SimulationStarted` payload's fire-line field is **verified** as
  `fireLineMarkers` — an array of `{ x, y, elevation }` built unconditionally at
  the emit site ([bottom-bar.tsx](../../src/components/bottom-bar.tsx),
  `log("SimulationStarted", …)`). `WildfireReading`
  ([types.ts](../../src/hazbot/wildfire/types.ts)) and `translate.ts`'s
  `SimulationStarted` case (which copies only `zones` / `sparks` / `wind` today)
  are extended to carry `fireLineMarkers` so `Fireline` / `usedFireline` can
  read it. Because the Fire Line tool is disabled until a run has started (see
  the `stop()`-timing note under "sheet ↔ engine notes"), the **first**
  `SimulationStarted` of a session always carries an empty `fireLineMarkers`.
  This shapes the unit tests by impl kind: `usedFireline` (a factor variable,
  computed over the whole readings array) is tested against a
  multi-`SimulationStarted` sequence — an early reading empty, a later reading
  populated; `Fireline` (a sim-prop, evaluated against one `WITH`-bound witness
  reading) is tested with single-reading `evaluate` cases — a sim-prop has no
  readings sequence to receive.
- **R7.** New impls deferred as non-trivial are stubbed in the bridge so the
  rule-sets still load (`stub-warning`, not `missing-impl`), and each is tracked
  by a Jira ticket linked to WM-18: `Helitack` / `usedHelitack` → **WM-28**;
  `SparksAtTopAndBottom` → **WM-15**. A stub evaluates to `false`, so beyond
  making a category unreachable (a stub name in a top-level `AND`) it can also
  *degrade* a reachable category whose expression references the stub inside an
  `OR` / `NOT` — see the Helitack Technical Notes and Q5 for the per-tab effect.
- **R7a.** The `sawIntenseFire` stub is removed from
  [factor-variable-stubs.ts](../../src/hazbot/wildfire/factor-variable-stubs.ts)
  — no rule-set references it after re-extraction (per Q2; WM-19 closed).

### Tests

- **R8.** Every rule-set `23, 24, 25, 32, 33, 34, 35, 42, 45, 47, 54` has a
  per-rule-set Jest test file, structurally modeled on
  [23.test.ts](../../src/hazbot/rule-sets/23.test.ts). Each file exercises
  engine behavior across these shapes: empty state, a single matching category,
  multiple-true → highest-wins, match stability (a matched category stays
  matched across a later reading), and — only where the rule-set has
  a stub-gated category — a stub-gated shape. New test files are added for
  `32, 33, 34, 35, 42, 45, 47, 54`; the existing `23/24/25` test files are
  **rewritten** against their regenerated modules (R3 changes their behavior —
  e.g. 23 cat 5's expression — so the current files, which encode pre-WM-18
  behavior, will not pass as-is).
- **R9.** In addition to the R8 behavior shapes, each test file has a
  per-category assertion block so that **every reachable category** is verified
  as the matched category for a representative readings sequence. (R8 tests
  engine behavior; R9 tests category coverage — the two are additive.)
  Categories unreachable *or* behaviorally degraded because of a stub (per the
  Helitack Technical Notes and Q5) are documented as such in the file.
  R9's coverage excludes only **stub-gated** categories — a `false` stub in a
  top-level `AND` makes them unmatchable in *any* environment, including a Jest
  test. A **config-gated** category (per Q5) is *not* excluded from R9: a Jest
  test constructs readings directly and never goes through a LARA config, so a
  config-gated category is still engine-reachable and is unit-tested under R9 —
  config-gating excludes a category only from the R11 playbook walk, not from
  R9. This per-category coverage applies equally to the rewritten `23/24/25`
  files and the new `32–54` files.

### Validation

- **R10.** Validation playbooks are regenerated for all 11 rule-sets via
  `node scripts/generate-hazbot-validation-playbook.js`.
- **R11.** Each rule-set's playbook is walked against a running dev server with
  the Hazbot sidebar; each reachable category is confirmed to become the active
  category. The walk uses each tab's URL from
  [docs/hazbot-validation/localhost-urls.md](../../docs/hazbot-validation/localhost-urls.md),
  which encodes that activity page's real LARA config — a category can be
  *config-gated* (unreachable because the page disables a tool it needs), so
  reachability is judged against the real per-tab config, not CLAUDE.md's single
  example URL. For tabs 45/47/54 the walk validates the *fire-line* progression
  path, which is fully functional; the helitack-dependent behavior is not
  walked. Stub-affected categories — stub-gated (tab 25 Cat 6, tab 45 Cat 4) and
  stub-degraded (tabs 47/54 Cat 3/4/5, tab 45 Cat 3; see the Helitack Technical
  Notes and Q5) — are recorded accordingly; per Q5 they do not block WM-18
  closure, and WM-28 owns re-validating tabs 45/47/54.
- **R11a.** Before WM-18 closes, each regenerated/new module is diffed **against
  its source sheet tab** by a reviewer — category **id and priority order**,
  category expressions, factor-variable definitions, and `logEvents` — to
  confirm the extraction is faithful, not merely self-consistent. (Priority
  order is correctness-critical: the engine activates the first true category in
  order, so two modules with identical expressions but a different category
  order classify students differently. The id / priority-order diff excludes the
  `id >= 100` feedback-mechanism rows the extractor drops per R1a / Q3 — the
  source sheet retains them, the module intentionally does not.) (R10/R11 validate engine behavior against playbooks
  *derived from the modules*, so they cannot catch a faithfully-wrong
  extraction.) `scripts/dump-xlsx.js` renders the sheet side for comparison.
  Discrepancies are either extractor bugs — fixed in `scripts/extract-impl.js`
  so the regenerate stays clean per R2, with a regression case added to
  `scripts/extract-impl.test.js` — or sheet-quality issues (flagged per Out of
  Scope).
- **R12.** [docs/hazbot-validation/localhost-urls.md](../../docs/hazbot-validation/localhost-urls.md)
  is updated: the validation-status tables are refreshed, and tabs
  `42, 45, 47, 54` move from the "Placeholder tabs" section to "Loadable
  rulesets". The Placeholder table currently lists a stale `43` row (mirroring
  the stale `EXCLUDED_TABS` `"43"`) — it is corrected to `42` as part of the
  move; there is no `42` row to move as-is.

### Housekeeping

- **R13.** `APP_RULES_VERSION` in
  [src/hazbot/wildfire/rules-version.ts](../../src/hazbot/wildfire/rules-version.ts)
  is bumped (`1 → 2`) — a semantic change (new categories, new factor variables,
  rewritten expressions). `APP_RULES_VERSION` is a debugging aid: it is
  displayed in the dev sidebar so a developer or the PI can see which rule-set
  version is loaded. It gates no persisted or cached state, so the bump is inert
  beyond updating that displayed value.
- **R14.** [src/hazbot/TBD.md](../../src/hazbot/TBD.md) is updated to the
  post-WM-18 state: §3 ("Missing rule-sets entirely") is resolved, §2 (stub
  status) reflects the new stub set, and the `sawIntenseFire` entry reflects the
  Q2 decision.
- **R15.** The regenerated modules and new code pass `npm run lint`,
  `npm test`, and `npm run build`.

## Technical Notes

### Extraction pipeline

- [scripts/extract-hazbot-sheets.js](../../scripts/extract-hazbot-sheets.js) —
  entry point; reads the `.xlsx` via the `read-excel-file` dependency, calls
  `extractFromSheets`, writes modules + `index.ts` + `dsl-grammar.md`.
- [scripts/extract-impl.js](../../scripts/extract-impl.js) — segmentation +
  parsing + TS emission; `EXCLUDED_TABS` lives here (line 6).
- A non-rule-set tab (`README`, `SIMINIT`) is detected by the absence of a
  category block and returns `null` — it does not need to be in `EXCLUDED_TABS`.
- Extracted expression strings are kept as raw DSL; the engine parses them at
  load time. A bad expression surfaces as a `parse-error` load failure.

### New factor variables / sim-props referenced by the 2026-05-22 sheets

Implemented today — factor variables: `ranSimulation`, `setDroughtLevel`,
`setVegetation`, `setTerrainType`, `setWind`, `setAnyZoneVar`, `setAnyVar`,
`usedOneSparkPerZone`, `uniqueWindValuesUsed`, `uniqueNonZeroWindValuesUsed`,
`simulationRuns`; sim-props: `OneSparkPerZone`, `UniqueVegetationPerZone`,
`UniformDroughtLevels`, `UniformTerrainTypes`, `ForestWAWOSuppression`,
`TwoSparks`, `GraphOpen`. Two stubs exist in the bridge at WM-18's start:
`SparksAtTopAndBottom` (sim-prop) — **kept**, still used by tab 25, deferred to
WM-15; and `sawIntenseFire` (factor var) — **removed by R7a**, as no 2026-05-22
sheet references it (per Q2).

The extracted sheets reference **10 names with no impl today**:

| Name | Kind | Used by tab(s) | Sheet definition | Difficulty |
|------|------|----------------|------------------|------------|
| `CorrectZoneSetup` | sim-prop | 23 | Zone 1 = Foothills/Grass/No Drought; zone 2 = Foothills/Grass/Mild-or-Medium Drought | Trivial (hard-coded per-zone check) |
| `UniformZoneSettings` | sim-prop | 25 | All zones share vegetation + droughtLevel (terrainType uniform by design) | Trivial |
| `triedAllVegetations` | factor var | 34 | Union of zone vegetation across all runs == {Grass, Shrub, Forest, Forest with Suppression} | Trivial (fold across runs) |
| `usedFireline` | factor var | 45 | Some run had fire-line markers | Small — adds `fireLineMarkers` to `WildfireReading` + `translate.ts` |
| `Fireline` | sim-prop | 45, 47, 54 | This run had fire-line markers (`fireLineMarkers` length ≥ 2) | Small — adds `fireLineMarkers` to `WildfireReading` + `translate.ts` |
| `DefaultVars` | sim-prop | 45, 47 | All adjustable vars (veg, drought, wind) at default; wind tolerance ±2 magnitude / ±20° angle | Small (continuous tolerance) |
| `DefaultVegetations` | sim-prop | 54 | All zone vegetation at default | Trivial |
| `SevereDroughts` | sim-prop | 54 | All zones droughtLevel == "Severe Drought" | Trivial |
| `usedHelitack` | factor var | 45 | Some run had a helitack used **during** it | **Non-trivial → WM-28** |
| `Helitack` | sim-prop | 45, 47, 54 | This run had a helitack used during it | **Non-trivial → WM-28** |

- **`Helitack` / `usedHelitack`** — deferred to **WM-28** ("Hazbot: Helitack
  run-window detection"). A `Helitack` event can occur inside or outside a
  simulation run; only an in-run helitack counts. The detail that makes this
  non-trivial: `Helitack` events are not translated today
  ([translate.ts](../../src/hazbot/wildfire/translate.ts) — no-op), and a
  sim-prop bound by `WITH` sees only its one `SimulationStarted` witness
  reading, so "a helitack happened during this run" must be attached to that
  reading via the temporal-variable → `temporalHistory` mechanism. A
  `helitackUsed` temporal variable accepting the `Helitack` event collides with
  the engine's `trigger-state-change-overlap` construction guard
  ([engine.ts](../../src/hazbot/engine/engine.ts)), because the sheet declares
  `Helitack` and the run-lifecycle events as `logEvents` of `usedHelitack` /
  `ranSimulation`. Resolving it needs an **engine-substrate change** (rework the
  overlap guard, or add a translate "modifier" result kind) — out of scope for
  WM-18, which touches no engine code. In WM-18, `Helitack` / `usedHelitack`
  are kept as stubs (`stub-warning`), so tabs 45/47/54 still load. A stub
  evaluates to `false` (verified — `sim-props.ts` / `factor-variable-stubs.ts`
  use `() => false`). The fire-line progression path is unaffected (`Fireline` /
  `usedFireline` are real R6 impls), but the helitack path degrades per tab:
    - **Tab 45 Cat 4** (`… AND Fireline AND … AND Helitack`) — unreachable for
      all students; the confetti category needs an in-run helitack.
    - **Tab 45 Cat 3** (`NOT (usedFireline AND usedHelitack)` → `NOT (… AND
      false)` = `TRUE`) — over-matches: a student who used both fireline and
      helitack stays at Cat 3.
    - **Tabs 47/54 Cat 4–5** (`(Fireline OR Helitack)` → `(Fireline)`) — the
      helitack-only progression path is dead; these stay reachable via fireline.
    - **Tabs 47/54 Cat 3** (`NOT (Fireline OR Helitack)` → `NOT Fireline`) —
      over-matches: a helitack-only student stays at Cat 3.

  WM-28's scope therefore includes **re-validating tabs 45/47/54** once helitack
  detection lands, not merely adding the impl.
- **`SparksAtTopAndBottom`** (already stubbed, used by tab 25 Cat 6) — deferred
  to **WM-15** ("Hazbot: Implement SparksAtTopAndBottom sim-prop"), which
  already exists and is now linked to WM-18. It needs the ridge/valley
  detection algorithm described in [TBD.md §2](../../src/hazbot/TBD.md). WM-18
  keeps it stubbed; tab 25 Cat 6 stays unreachable until WM-15 lands.
- `usedOneSparkPerZone` (factor var) is **unreferenced** by the 2026-05-22
  sheets — they use the `OneSparkPerZone` sim-prop instead. Per Q6 it (and any
  other unreferenced-but-working impl, e.g. possibly `GraphOpen`,
  `simulationRuns`) is kept as inert general-purpose library code, not removed.
- `CorrectZoneSetup` and `DefaultVars` encode sheet-authored constants the
  extractor does not regenerate — `CorrectZoneSetup` the per-zone
  terrain/vegetation/drought *choice* for tab 23 (zone 1 Foothills/Grass/No
  Drought; zone 2 Foothills/Grass/Mild-or-Medium Drought), `DefaultVars` the wind
  tolerance (±2 magnitude, ±20° angle) for tabs 45/47. The constant in
  `CorrectZoneSetup` is the *enum choice* per zone — the impl resolves those enum
  members through `terrainLabels` / `vegetationLabels` / `droughtLabels`
  ([types.ts](../../src/types.ts)) rather than baking label strings, so a future
  relabeling tracks automatically and only a sheet change to the per-zone
  *choice* must be hand-mirrored. `DefaultVars`'s tolerance numbers have no enum
  home and are baked directly. Unlike rule-set *expressions*, these two sim-prop
  impls are not regenerated on re-extraction. Their R6 unit tests cite the sheet
  definition as the source of truth so a sheet change forces a visible test diff.
- `triedAllVegetations`, `SevereDroughts`, and `DefaultVegetations` are *not*
  constant-baking impls and need no R6 sheet-citing test: `triedAllVegetations`
  folds the run-union against the full `Vegetation` enum
  ([types.ts](../../src/types.ts)), `SevereDroughts` compares each zone to the
  `DroughtLevel` "Severe" enum value, and `DefaultVegetations` compares each
  zone to its config-sourced default (per WM-27). The enums and config are the
  shared source of truth, so these impls carry no hard-coded sheet constant —
  implement them against the enum / config, not a literal set. If a future
  sheet narrows one (e.g. `triedAllVegetations` to a vegetation *subset*), that
  subset becomes a sheet constant and gets the R6 treatment.
- **Zone-array order is positional and stable.** `CorrectZoneSetup` reads
  `reading.zones[0]` / `[1]` as the sheet's "zone 1" / "zone 2", and `DefaultVars`
  / `DefaultVegetations` compare `reading.zones[i]` against `defaults.zones[i]`
  by index. This is sound because the zone arrays are positional by
  construction: `simulation.zones` is `config.zones.map(...)` in `config.zones`
  tuple order ([simulation.ts](../../src/models/simulation.ts)), the model
  treats that array index as the canonical zone identity throughout (`zoneIdx`,
  `totalCellCountByZone`, the run-outcome `zoneIndex`), and the order is fixed
  at config load — never reordered at runtime (Terrain Setup's `updateZones`
  rebuilds the array preserving order). The `SimulationStarted` payload
  ([bottom-bar.tsx](../../src/components/bottom-bar.tsx)) emits
  `simulation.zones.map(...)` preserving that order, and `deriveWildfireDefaults`
  (WM-27) emits the `config.zones` defaults in the same tuple order — so
  `reading.zones` and `defaults.zones` are index-aligned by construction. The
  sheet's "zone 1 / zone 2" wording maps to slots 0 / 1. (`WildfireZone` carries
  an optional `index` field, but the `SimulationStarted` payload does not
  populate it — comparing by `index` is therefore unavailable without a bridge
  change and would be redundant with the array position. The order invariant,
  not a per-zone id, is what makes the positional impls correct.)

### sheet ↔ engine notes

- Tab **34** in the 2026-05-22 sheet **no longer references `sawIntenseFire`** —
  its category 4 uses `triedAllVegetations`. The TBD.md §2 note about ruleset 34
  being gated on `sawIntenseFire` is stale; per Q2 the stub is removed and WM-19
  is closed. `triedAllVegetations` requires zone vegetation to cover
  `ForestWithSuppression`, which the engine permits only on `Mountains` terrain
  ([terrain-panel.tsx](../../src/components/terrain-panel.tsx)) and when
  `forestWithSuppressionAvailable` is set. Tab 34 has a `Mountains` zone and its
  `localhost-urls.md` URL leaves `forestWithSuppressionAvailable` at its `true`
  default, so the category is reachable — recorded so a future config change to
  that page is caught.
- Tab **24** expressions use member access and relational operators
  (`uniqueNonZeroWindValuesUsed.size == 0`, `uniqueWindValuesUsed.size > 1`).
  The current 24.ts already uses these, so the parser supports them — confirm
  on re-extract.
- Tabs **47 / 54** use parenthesized prop-expressions and multiple `WITH`
  clauses (`ranSimulation WITH DefaultVars AND NOT (Fireline OR Helitack)`).
  **Verified**: the DSL parser
  ([parser/parse.ts](../../src/hazbot/engine/parser/parse.ts)) handles all three
  constructs — `parsePropPrimary` accepts a parenthesized prop-expression,
  `parsePropNot` accepts `NOT` before it, and a top-level `parseAnd` / `parseOr`
  of two parenthesized `WITH` expressions parses cleanly. Each is covered by
  `parser/parser.test.ts` (incl. the README two-`WITH` worked example). No
  parser/engine change is needed for the new tabs.
- `Fireline` / `usedFireline` need a bridge type change, not just a new
  predicate: [types.ts](../../src/hazbot/wildfire/types.ts) `WildfireReading`
  carries only `zones` / `sparks` / `wind`, and
  [translate.ts](../../src/hazbot/wildfire/translate.ts)'s `SimulationStarted`
  case copies only those. A `fireLineMarkers` field must be added to
  `WildfireReading` and copied in `translate.ts` (a bridge change — translate
  is not engine code). The payload field is **`fireLineMarkers`** — verified at
  the [bottom-bar.tsx](../../src/components/bottom-bar.tsx) `SimulationStarted`
  emit site, where it is built unconditionally as an array of
  `{ x, y, elevation }`. (The sheet's events column had a `filreLineMarkers`
  typo, corrected in the source sheet before extraction.)
- **Fire-line timing — verified.** The Fire Line button is disabled until
  `simulationStarted` ([bottom-bar.tsx](../../src/components/bottom-bar.tsx)
  `fireLineBtnDisabled`), so a fire line can only be drawn *after* Start — the
  first `SimulationStarted` of a session always snapshots an empty
  `fireLineMarkers`. But `handleFireLine` calls `simulation.stop()`: drawing a
  fire line forces a run boundary, and the next `Start` re-emits
  `SimulationStarted` with the marker now in the snapshot. So a drawn fire line
  is always captured by a *subsequent* `SimulationStarted` reading.
  `handleHelitack` does **not** stop the sim, so a helitack drop lands mid-run
  with no run-boundary re-snapshot — this `stop()`-asymmetry, not "fire lines
  are placed pre-run," is the real reason `Fireline` / `usedFireline` are Small
  (R6) and `Helitack` / `usedHelitack` are non-trivial (WM-28). WM-18 changes no
  sim code here — this note only records existing `bottom-bar.tsx` behavior.
- Every sheet has a category `100` ("feedback mechanism" behavior) with
  `-- no pseudo code --` and no parseable expression. Per Q3 the extractor drops
  `id >= 100` rows so these never reach the modules.
- **Classification consumption — verified.** The engine's classified category
  (`matchedCategory`) is consumed by exactly one thing today: the dev sidebar
  ([sidebar.tsx](../../src/hazbot/engine/sidebar/sidebar.tsx) via
  `useAnalysisEngine()`). It is **not** logged as an analytics/research event,
  not persisted, and not surfaced to students (the student-facing Hazbot UI is
  TBD §5, unbuilt; engine persistence is TBD §6, unbuilt). Research logging
  *does* capture the raw `SimulationStarted` / `SimulationStopped` events — the
  substrate the engine classifies *from* — but not the engine's output category.
  Consequence for WM-18: the SE-5 stub-degraded misclassification (tabs 47/54
  Cat 3, tab 45 Cat 3) has **no student-facing and no research-data effect**
  within WM-18 — it is observable only in the dev sidebar and the R11 playbook
  walk. (`APP_RULES_VERSION` is the dev-sidebar version display; per R13 it
  gates no persisted/cached state.)

### Tooling

- `scripts/dump-xlsx.js` — a lightweight workbook-to-text inspector (reuses the
  `read-excel-file` dep) — supports working this story and the R11a module↔sheet
  diff. It is committed as a standalone dev-tooling change, separate from the
  rule-set deliverable; it is not itself a WM-18 rule-set artifact.

## Out of Scope

- The student-facing Hazbot UI (launcher, feedback panel, coach-mark overlays,
  confetti) — a separate feature on top of the engine substrate
  ([TBD.md §5](../../src/hazbot/TBD.md)).
- Extracting the analysis engine into its own npm package
  ([TBD.md §8](../../src/hazbot/TBD.md)).
- Writing the `SparksAtTopAndBottom` ridge/valley algorithm itself — WM-18 only
  keeps it stubbed and linked to a sub-ticket.
- Engine / DSL feature work (paired-reading primitive, `arrowText` rendering,
  persistence, engine-emitted log events) — [TBD.md §6](../../src/hazbot/TBD.md).
- An automated end-to-end Playwright/Cypress regression suite — validation
  remains a manual playbook walk for this story.
- Committing the source `.xlsx` workbook into the repo.
- Editing the source spreadsheet to fix *semantic* sheet-quality issues — those
  are flagged back to the sheet author, not fixed here.
- An author-facing catalog of which factor-variable / sim-prop names have a
  working impl vs. a stub. `dsl-grammar.md` (regenerated per R2) documents DSL
  *syntax*, not impl availability; the impl / stub status lives in
  [TBD.md §2](../../src/hazbot/TBD.md) (R14), which is developer-facing. A
  generated author-facing catalog is a reasonable future improvement but is out
  of scope for WM-18 — today an author learns of an unbacked name when a
  developer re-extracts (R5's `missing-impl` gate) or via the `TBD.md` stub list.

## Closeout actions

Spec-process actions performed during implementation and at finalization — not
numbered requirements (R1–R15 are repo deliverables), but tracked here so they
survive independently of the Self-Review section:

- **WM-18 comment** — post a summary comment on WM-18 recording the scope
  changes this spec made: the `sawIntenseFire` premise dropped (WM-19 closed),
  `Helitack` / `usedHelitack` → WM-28, `SparksAtTopAndBottom` → WM-15, and the
  category-100 extractor filter. (Origin: PM-1.)
- **WM-28 comment** — post a comment on WM-28, or extend its description,
  recording that its acceptance criteria include re-validating the
  helitack-dependent categories of tabs 45/47/54. (Origin: PM-3.)
- **Sheet-typo flag** — **done**: the `filreLineMarkers` typo in tab 45's
  events column was corrected in the source workbook before extraction.
  (Origin: PM-2.)

## Open Questions

### RESOLVED: Q1 — Which new factor-variable / sim-prop impls are in scope for WM-18 vs. spun into sub-tickets?

**Context**: The extracted sheets reference 10 names with no impl today (table
above). The ticket says to implement what the rule-sets reference and "spin
non-trivial ones out into their own linked sub-tickets (cf. NEW-5 for
`sawIntenseFire`)." Eight of the ten are trivial single-reading or fold-across-
runs checks. Two — `Helitack` and `usedHelitack` — need run-window event
correlation that requires an engine-substrate change. `SparksAtTopAndBottom` is
already a stub needing a new algorithm.

**Options considered**:
- A) **Implement the 8 trivial impls in WM-18** (`CorrectZoneSetup`,
  `UniformZoneSettings`, `triedAllVegetations`, `usedFireline`, `Fireline`,
  `DefaultVars`, `DefaultVegetations`, `SevereDroughts`); **sub-ticket
  `Helitack` + `usedHelitack`** (one ticket) and keep **`SparksAtTopAndBottom`**
  sub-ticketed as the algorithm work. Tabs 45/47/54 load with Helitack stubbed;
  their helitack-dependent categories are unreachable until the sub-ticket.
- B) Implement all 10 including `Helitack`/`usedHelitack` in WM-18 (do the
  run-window correlation work here); only `SparksAtTopAndBottom` is sub-ticketed.
- C) Implement only the impls needed by the *updated existing* tabs (23–35) in
  WM-18 and sub-ticket everything new tabs (42/45/47/54) need.

**Decision**: **A.** The 8 trivial impls (`CorrectZoneSetup`,
`UniformZoneSettings`, `triedAllVegetations`, `usedFireline`, `Fireline`,
`DefaultVars`, `DefaultVegetations`, `SevereDroughts`) are implemented in WM-18
in the wildfire bridge. `Helitack` / `usedHelitack` are deferred to **WM-28**
("Hazbot: Helitack run-window detection") — created and linked to WM-18 —
because they require an engine-substrate change that WM-18 otherwise does not
make. `SparksAtTopAndBottom` remains a stub; its ridge/valley algorithm is
deferred to its own sub-ticket **[see Q1a]**. In WM-18 the three deferred names
are kept as bridge stubs (`stub-warning`, not `missing-impl`) so all 11
rule-sets still load.

---

### RESOLVED: Q1a — Does `SparksAtTopAndBottom` need its own Jira sub-ticket?

**Context**: `SparksAtTopAndBottom` (tab 25 Cat 6) is already a stub in the
bridge ([sim-props.ts](../../src/hazbot/wildfire/sim-props.ts)). It needs a
ridge/valley detection algorithm. WM-18 keeps it stubbed regardless; the
question is whether the deferred algorithm work has a tracked ticket.

**Decision**: A ticket already exists — **WM-15** ("Hazbot: Implement
SparksAtTopAndBottom sim-prop", Story under epic AP-80, To Do). It has been
linked **Relates → WM-18**. No new ticket needed. WM-18 keeps the stub; WM-15
owns the algorithm.

---

### RESOLVED: Q2 — Disposition of `sawIntenseFire` / WM-19 now that tab 34 dropped it

**Context**: The 2026-05-22 tab-34 sheet no longer references `sawIntenseFire`;
category 4 now uses `triedAllVegetations`, and there is no longer a category 5.
The `sawIntenseFire` stub
([factor-variable-stubs.ts](../../src/hazbot/wildfire/factor-variable-stubs.ts))
and ticket **WM-19** ("Hazbot: Implement sawIntenseFire + SimulationEnded
intensity classification", Story, AP-80, To Do) were created specifically for
ruleset 34 Cat 4/5. After re-extraction `sawIntenseFire` is referenced by no
rule-set. WM-19 also carried real upstream design work (a simulation-side
intensity classifier on the `outcome` field) — that feature is now unused by
any rule-set, but is a product call to abandon.

**Options considered**:
- A) Remove the `sawIntenseFire` stub from the bridge and close WM-19 as
  obsolete — the sheet revision removed the need.
- B) Keep the stub as dead code and keep WM-19 open in case a future sheet
  revision reintroduces an intensity-comparison category.
- C) Remove the stub (it is unreferenced dead code either way), but leave WM-19
  open / re-scoped as a product decision — note in `TBD.md` that intensity
  comparison was descoped from tab 34 by the sheet author.

**Decision**: **A.** WM-18 removes the `sawIntenseFire` stub from
[factor-variable-stubs.ts](../../src/hazbot/wildfire/factor-variable-stubs.ts)
(it is referenced by no rule-set after re-extraction). **WM-19 has been closed
(Done) as obsolete** with a comment recording why — the tab-34 sheet revision
dropped the intensity-comparison category. Nothing is lost: the stub remains in
git history and WM-19 can be reopened if a future sheet revision reintroduces
an intensity category.

---

### RESOLVED: Q3 — How should category `100` ("feedback mechanism") rows be handled?

**Context**: Every one of the 11 rule-set sheets has a final category `100`
whose pseudo-code cell is `-- no pseudo code --` followed by prose. The README
tab says category ≥ 100 is *not* a simulation-use behavior — it is
feedback-mechanism behavior (e.g. re-clicking the Hazbot Analysis button) and
"may best be computed in a different module." There is no engine support for
the feedback mechanism today.

**This is not a no-op.** The current extractor
([extract-impl.js](../../scripts/extract-impl.js) `parseTab`, lines 59–77)
applies **no filter** on category id or expression content — it pushes every
row with a numeric id. The repo's current modules (23–35) have no category
`100` only because the *previous* workbook's sheets had no `100` rows. The
2026-05-22 workbook fills them in, so a re-extract with today's extractor would
emit a category `100` into every module with
`expression: "-- no pseudo code --\n…"`. That string is not a valid DSL
expression, so the engine would raise a **`parse-error`** at load — a
load-blocking failure that takes the **entire rule-set** offline. So WM-18
*must* do something here; "leave the extractor alone" is not viable.

**Options considered**:
- A) Add an extractor filter that **drops category rows with `id >= 100`**
  (the README's own boundary for feedback-mechanism categories). The modules
  carry only the sim-use categories, exactly as the modules do today. Smallest,
  well-defined extractor change; keeps the re-extract clean.
- B) Extract `100` as a category but rewrite its expression to a sentinel
  never-true expression so it is carried in the module for future use without
  breaking the load or affecting classification.
- C) Extract `100` and build minimal feedback-mechanism support so it can
  actually match — expands WM-18 scope significantly.

**Decision**: **A.** The extractor (`parseTab` in
[extract-impl.js](../../scripts/extract-impl.js)) gains a filter that drops
category rows with `id >= 100`. Confirmed across all 11 sheets that category
`100` carries no classification logic: its `studentAction` is byte-identical
everywhere, its `feedback` is one of two shared boilerplate strings, and its
pseudo-code cell is literally `-- no pseudo code --`. It is a feedback-mechanism
description, not a sim-use category, so it does not belong in the per-ruleset
classification modules. Dropping it also prevents the `parse-error` load
failure described above. If/when the feedback mechanism is built (TBD §5), it
sources those ~2 shared strings centrally, not from per-ruleset modules. The
~2 shared category-100 strings are intentionally **not** captured anywhere in
the repo by WM-18 — they remain in the source workbook until the feedback
mechanism (TBD §5) is built, at which point that feature extracts them. This
omission is deliberate, not an extraction gap.

---

### RESOLVED: Q4 (withdrawn) — Do tab 47's categories 4 / 5 need a range-2 / paired-reading factor variable?

**Context**: Raised on a first read of tab 47, on the suspicion that categories
4 and 5 require run *ordering* the range-1 DSL cannot express. Closer analysis
shows that is not the case.

Tab 47's relevant clauses are:
- clause A = `ranSimulation WITH DefaultVars AND NOT (Fireline OR Helitack)` — "a plain run exists"
- clause B = `ranSimulation WITH DefaultVars AND (Fireline OR Helitack)` — "a suppression run exists"

Cat 3 = `A`; Cat 4 = `NOT A AND B`; Cat 5 = `A AND B`. These are existence
predicates, not ordering predicates. Combined with the engine's monotonic,
highest-category-first evaluation, they faithfully capture the intent: a student
who has only done a suppression run sits at Cat 4; once a plain run also exists
they move to Cat 5 (the Cat 5 prose "after (or before)" confirms order is
irrelevant). "Without first running" in the Cat 4 prose means "without having
run" — i.e. clause A is false, which the expression states directly.

**Decision**: Withdrawn — no decision needed. The tab 47 (and 45/54) expressions
are sound range-1 expressions and are extracted literally. The README's note
about range-2 variables being "anticipated for 43–47" is forward-looking; the
2026-05-22 sheet as filled uses no range-2 construct.

---

### RESOLVED: Q5 — Is a full playbook walk a hard gate for closing WM-18?

**Context**: The acceptance criteria say "each reachable category has ... a
verified playbook walk-through." With `Helitack` and `SparksAtTopAndBottom`
sub-ticketed (per Q1), the categories that depend on them are unreachable in
production and cannot be walked.

**Options considered**:
- A) WM-18 closes when every *reachable* category (given the WM-18 stub set)
  validates via a playbook walk; stub-gated categories are documented as
  unreachable and deferred to their sub-tickets.
- B) WM-18 stays open until all categories of all 11 rule-sets validate —
  i.e. it cannot close before the Helitack and ridge/valley sub-tickets land.

**Decision**: **A.** WM-18 closes when every category that is *reachable* given
the WM-18 stub set validates via a playbook walk. Stub-affected categories fall
into two kinds, both documented in `docs/hazbot-validation/localhost-urls.md`
and deferred to their sub-tickets (whose acceptance criteria cover them):

- **Stub-gated** — a stub name sits in a top-level `AND`, so the category cannot
  match at all: tab 25 Cat 6 (`SparksAtTopAndBottom` → WM-15) and tab 45 Cat 4
  (`Helitack` → WM-28).
- **Stub-degraded** — a stub name sits inside an `OR` / `NOT`, so a *reachable*
  category classifies a sub-population wrongly: tabs 47/54 Cat 3 over-match
  helitack-only runs and their Cat 4/5 helitack arm is dead; tab 45 Cat 3
  over-matches fireline+helitack runs. The fire-line progression path on these
  tabs is functional and *is* walked; the helitack behavior is deferred to
  **WM-28**, whose scope includes re-validating tabs 45/47/54. See the Helitack
  Technical Notes for the per-tab effect.

The stub-degraded misclassification is acceptable to ship within WM-18 because
it has no live consumer: the classified category is read only by the dev sidebar
— not logged, persisted, or surfaced to students — so no student-facing and no
research-data harm occurs before WM-28 lands (see the "Classification
consumption — verified" note in the sheet ↔ engine notes).

A category can additionally be **config-gated** — unreachable because the
activity page's LARA config disables a tool it needs (e.g. a
`severeDroughtAvailable` / `forestWithSuppressionAvailable` flag). No tab among
the 11 is confirmed config-gated under its current `localhost-urls.md` URL, but
the walk (R11) uses those per-tab URLs so reachability is judged against each
page's real config.

This matches the WM-18 ticket's instruction that non-trivial impls be spun out
"so they do not block the rest."

---

### RESOLVED: Q6 — What happens to bridge impls left unreferenced after re-extraction?

**Context**: The 2026-05-22 sheets use the `OneSparkPerZone` sim-prop, not the
`usedOneSparkPerZone` factor variable. The repo's current
[23.ts](../../src/hazbot/rule-sets/23.ts) references `usedOneSparkPerZone` only
because the *previous* sheet did. After re-extraction, `usedOneSparkPerZone`
([factor-variables.ts](../../src/hazbot/wildfire/factor-variables.ts)) — a fully
implemented, unit-tested factor variable — is referenced by no rule-set.
`GraphOpen` and `simulationRuns` may be in the same situation (to be verified
during implementation — they are not referenced by any of the 11 tabs as far as
the sheet scan shows). This is distinct from the `sawIntenseFire` stub (Q2):
those are working, tested impls, not stubs.

**Options considered**:
- A) Remove any bridge impl (and its tests) left unreferenced by all 11
  rule-sets after re-extraction — keep the bridge free of dead code, consistent
  with R7a.
- B) Keep unreferenced impls as a general-purpose library for future rule-sets;
  an unreferenced impl is inert (the engine only evaluates referenced ones).
- C) Remove `usedOneSparkPerZone` specifically (clearly superseded by the
  `OneSparkPerZone` sim-prop), but leave `GraphOpen` / `simulationRuns` — decide
  those case-by-case once their referenced-ness is verified.

**Decision**: **B.** Unreferenced-but-working impls (`usedOneSparkPerZone`, and
any others such as `GraphOpen` / `simulationRuns`) are kept as inert
general-purpose library code. The engine only evaluates impls that a rule-set
references, so an unreferenced impl costs nothing at runtime and stays available
for a future rule-set. This does not conflict with Q2: a *stub*
(`sawIntenseFire`) is a non-functional placeholder and is still removed; a
working, tested impl is library code and is kept.

## Self-Review

<!-- Phase 1 requirements-only self-review. Issues processed one at a time with
     the spec author; OPEN → RESOLVED as each is addressed. -->
<!-- Round 2 re-run (2026-05-22): 5 new OPEN issues (SE-5, QA-7, QA-8, QA-9,
     CA-3) found against the post-round-1 spec. Product Manager and
     Build/Release Engineer re-reviewed — no new issues. -->
<!-- Round 3 re-run (2026-05-22): SE-5's resolution surfaced PM-3 — the WM-28
     re-validation scope is asserted in the spec but not recorded on WM-28. -->
<!-- Round 4 re-run (2026-05-22): 6 new OPEN issues (SE-6, QA-10, QA-11, CA-4,
     ER-1, PM-4) found against the post-round-3 spec; Education Researcher
     added as a new reviewer role. -->
<!-- Round 5 re-run (2026-05-22): 2 new OPEN issues (QA-12, PM-5) — both
     introduced by round-4 resolutions (QA-10's R11a id-diff, PM-4's Closeout
     section). No other new issues. -->
<!-- Round 6 re-run (2026-05-22): QA-12 / PM-5 resolutions were wording-only;
     no new issues. Self-review converged. -->
<!-- Post-implementation-review wording pass (2026-05-22): R6a, R8, and the R6
     "New factor variables / sim-props" Technical Note tightened to match
     implementation.md self-review rounds 3–4 — SE-2's `Fireline`/`usedFireline`
     "sequence" conflation (R6a now splits the test shape by impl kind), QA-4's
     "monotonicity" shape name (R8 → "match stability"), and CA-4's
     `CorrectZoneSetup` label-coupling (the Technical Note now states the enum
     *choice* is the constant, not the label strings). Wording only — no
     requirement scope change. -->

### Senior Engineer

#### RESOLVED: SE-1 — `Fireline` / `usedFireline` are rated "Trivial" but require a `WildfireReading` + `translate.ts` change

*Resolution*: Difficulty table updated to "Small"; Technical Notes bullet added
describing the `types.ts` + `translate.ts` change; new requirement **R6a** added
for verifying the payload field name and extending `WildfireReading` /
`translate.ts`.


The new-impl difficulty table rates `Fireline` and `usedFireline` "Trivial,"
but unlike the other six trivial impls they cannot be implemented purely as a
new predicate. `WildfireReading` ([types.ts](../../src/hazbot/wildfire/types.ts))
carries only `zones`, `sparks`, `wind` — there is no `fireLineMarkers` field —
and [translate.ts](../../src/hazbot/wildfire/translate.ts)'s `SimulationStarted`
case copies only those three. So `Fireline` work additionally requires: (a)
adding a `fireLineMarkers` field to `WildfireReading`, (b) copying it in
`translate.ts`, and (c) **confirming the actual `SimulationStarted` payload
field name** — the sheet writes both `filreLineMarkers` (typo) and
`fireLineMarkers`. If the name is wrong, `Fireline` / `usedFireline` silently
evaluate false with no error. Suggested resolution: keep them in scope, but
note the `translate.ts` + `types.ts` change in the table / Technical Notes, and
add a requirement that the payload field name is verified against a real
`SimulationStarted` event before the impl is written.

---

#### RESOLVED: SE-2 — No requirement operationalizes the WM-27 `defaults`-field reconciliation that Background assigns to WM-18

*Resolution*: New requirement **R2a** added under Extraction — the WM-27
`defaults`-field drift is reconciled so a re-extract is clean, with the
extractor-vs-schema mechanism left as a sub-decision and the change covered by
`extract-impl.test.js` per R1b.


Background (lines 62–65) states the current modules are *not* a clean
regenerate — WM-27 hand-edited them to drop a per-rule-set `defaults` field —
and that "WM-18 owns reconciling the modules so a re-extract is once again
clean." R2 states the *goal* (a clean, reproducible regenerate with no
hand-edits) but no requirement states the *mechanism*: does the extractor stop
emitting a `defaults` field, does the rule-set module schema / engine change to
no longer expect one, or something else? The most load-bearing premise of R2
has no owned, testable work item behind it. Suggested resolution: add a
requirement (e.g. R2a) specifying how the `defaults`-field drift is reconciled
so a re-extract is clean, naming whether it touches `extract-impl.js`'s emission
or the module schema.

---

#### RESOLVED: SE-3 — R6a verifies the fire-line field name but has no contingency if the `SimulationStarted` payload carries no fire-line data at all

*Resolution*: Verified in code — the `SimulationStarted` payload **does** carry
fire-line data: `bottom-bar.tsx` builds `configSnapshot.fireLineMarkers` (an
array of `{ x, y, elevation }`) unconditionally and passes it to
`log("SimulationStarted", …)`. The field name is `fireLineMarkers` (the sheet's
`filreLineMarkers` is a typo). The tail risk SE-3 raised — no fire-line data
under any name — does not materialize, so no stub / sub-ticket fallback is
needed. R6a and the Technical Notes Fireline bullet are updated to record the
verified field name and structure rather than leaving "verify against a real
event" as an open task.


R6a and the Technical Notes require verifying the `SimulationStarted` payload's
fire-line-markers field name against a real event before implementing
`Fireline` / `usedFireline`. That handles a *misnamed* field. It does not
handle the case where the payload carries no fire-line marker data under any
name — in which case `Fireline` / `usedFireline` cannot be bridge predicates at
all, and tabs 45/47/54's fire-line categories would need stubbing plus a
sub-ticket, exactly as Helitack was. The spec rates these "Small" and firmly
in-scope (R6, Q1 decision A) with no fallback path. Suggested resolution: add an
explicit contingency to R6a — if verification shows no fire-line data reaches
the reading, `Fireline` / `usedFireline` are stubbed and sub-ticketed
(mirroring R7) and Q1's scope split is revisited.

---

#### RESOLVED: SE-4 — Tab 47/54 parser support is assumed in a Technical Note, with no requirement and no contingency

*Resolution*: Verified in code — the DSL parser (`engine/parser/parse.ts`)
already handles every construct tabs 47/54 use: a parenthesized prop-expression
(`parsePropPrimary` LPAREN branch), `NOT` applied to it (`parsePropNot`), and a
top-level AND/OR of two parenthesized `WITH` expressions (`parseAnd` / `parseOr`
→ `parsePrimary` LPAREN branch). All three have existing coverage in
`engine/parser/parser.test.ts`, including the README two-`WITH` worked example,
and the grammar was explicitly designed for this (see the `parsePrimary` comment
on parens overriding the greedy `WITH` rule). No parser/engine change is needed,
so WM-18's "no engine code" scope holds and no contingency requirement is
required. The Technical Notes bullet is updated from "confirm the parser handles
them" to record the verified result.


The "sheet ↔ engine notes" say tabs 47/54 use parenthesized prop-expressions
and multiple `WITH` clauses (`ranSimulation WITH DefaultVars AND NOT (Fireline
OR Helitack)`) and instruct to "confirm the parser handles them." That is the
only place these constructs are addressed — there is no requirement that parser
capability is verified, and no contingency if it is not. Because WM-18 is
explicitly scoped to touch *no engine code*, an unsupported construct would
either stall WM-18 or silently expand it into out-of-scope parser work.
Suggested resolution: promote the parser-capability check to a requirement done
*early* (before the new tabs are extracted), and state the contingency if a
construct is unsupported — sub-ticket the parser work, stub the affected
categories.

---

#### RESOLVED: SE-5 — A stubbed `Helitack` does not merely gate categories; in tab 47/54's `OR` / `NOT` clauses it misclassifies *reachable* runs

*Resolution*: Confirmed via `dump-xlsx.js` against the 2026-05-22 workbook —
helitack *is* a student tool on tabs 45/47/54 (the sheets' Student-Action and
Coach-Mark columns say so), so the misclassification is live, not latent. The
Helitack Technical Notes bullet gains a per-tab breakdown of the `false`-stub
effect (tab 45 Cat 4 unreachable, tab 45 Cat 3 over-match, tabs 47/54 Cat 3
over-match + Cat 4/5 helitack arm dead — fire-line path unaffected). Q5 now
distinguishes **stub-gated** from **stub-degraded** categories; R7, R9, R11
reference the degraded set; WM-28's scope is recorded as including re-validation
of tabs 45/47/54. WM-18 ships these tabs with the helitack degradation
documented — the fire-line progression works end to end, and helitack detection
genuinely needs WM-28's engine-substrate change.

The spec's stub model (R7, Q1 decision A, Q5) treats a `stub-warning` stub as
something that only *caps reachability* — "the rule-sets still load," and the
affected categories become "unreachable" (Q5 names exactly tab 25 Cat 6 and tab
45 Cat 4). That model holds when the stubbed name sits in a top-level `AND`
position (`… AND SparksAtTopAndBottom` → the category simply never matches). It
does **not** hold for tabs 47 and 54.

A stub evaluates to `false` — verified in code:
[sim-props.ts](../../src/hazbot/wildfire/sim-props.ts) `SparksAtTopAndBottom` is
`evaluate: () => false`, and
[factor-variable-stubs.ts](../../src/hazbot/wildfire/factor-variable-stubs.ts)
`sawIntenseFire` is `compute: () => ({ value: false, witnesses: [] })`. Tab 47's
clauses (per Q4) are:
- clause A = `ranSimulation WITH DefaultVars AND NOT (Fireline OR Helitack)`
- clause B = `ranSimulation WITH DefaultVars AND (Fireline OR Helitack)`

With `Helitack` stubbed to `false`, clause A collapses to `… AND NOT Fireline`
and clause B to `… AND Fireline`. So a run that used a helitack but no fire line
satisfies clause A — and **Cat 3 (`A`) classifies a helitack-only suppression
run as a "plain run."** That is a *reachable, non-stub-gated* category producing
a wrong classification, not an unreachable one. The helitack arm of Cat 4 / Cat
5 is simultaneously dead (only the fire-line arm of clause B survives). The same
`(Fireline OR Helitack)` / `NOT (…)` construct is in tab 54 (Technical Notes,
"sheet ↔ engine notes").

Why it matters: Q5 closes WM-18 once every *reachable* category validates via a
playbook walk. Tab 47/54 Cat 3 *is* reachable and would "pass" the walk —
especially because the CLAUDE.md playbook URL template sets
`helitackAvailable=false`, so the walk never exercises a helitack run and never
sees the misclassification. WM-18 would ship a known-incorrect student
classification, while WM-28 is scoped ("Helitack run-window detection") as
*adding* helitack detection — not as *correcting* an already-shipping
misclassification. R11a does not catch this either: it diffs the *module*
against the sheet, and the module is faithful — the wrongness is in the stub
*impl*, which R11a does not check.

Suggested resolution: (a) state, in the Helitack Technical Notes and/or Q5, what
the `Helitack` stub returns and its effect on tabs 47/54 — Cat 3 over-matches
helitack-only runs, Cat 4/5's helitack arm is dead; (b) decide and record
whether WM-18 ships tabs 47/54 with that degradation documented (and WM-28's
scope is widened to *re-validate* tabs 47/54, not just add detection), or whether
the helitack-touching categories are held back the way tab 45 Cat 4 is; (c)
extend Q5's stub accounting beyond "stub-gated / unreachable" to also name
"stub-degraded / misclassifying" categories.

---

#### RESOLVED: SE-6 — `Fireline` / `usedFireline` read the `SimulationStarted` snapshot, which the spec never establishes captures fire lines drawn *during* a run

*Resolution*: Partially upheld — the original headline was disproven by code
verification, a real residual was applied. The Fire Line button is disabled
until `simulationStarted` ([bottom-bar.tsx](../../src/components/bottom-bar.tsx)
`fireLineBtnDisabled`), so a fire line can only be drawn *after* Start; the first
`SimulationStarted` of a session always snapshots an empty `fireLineMarkers`. But
`handleFireLine` calls `simulation.stop()` — drawing a fire line forces a run
boundary, and the next `Start` re-emits `SimulationStarted` with the marker now
in the snapshot. `handleHelitack` does *not* stop the sim. So `Fireline` /
`usedFireline` *are* observable via `SimulationStarted` readings — the "Small"
rating and WM-18 scope hold — but for the `stop()`-asymmetry reason, not the
"pre-run placement" reason the spec implied. Two spec changes, both spec-side
only (no sim code change): a new "sheet ↔ engine notes" bullet records the
verified `stop()` mechanism as the true Fireline-vs-Helitack difficulty split,
and **R6a** now requires the `Fireline` / `usedFireline` unit tests to exercise a
multi-`SimulationStarted` sequence (an early reading empty, a later reading
populated), since the first-run reading is always empty.


The Helitack Technical Notes establish the core run-window constraint: a
sim-prop bound by `WITH` "sees only its one `SimulationStarted` witness
reading," so anything that happens *after* that reading is emitted is invisible
to the prop. The spec uses exactly this to justify deferring `Helitack` to
WM-28.

R6a (and the SE-1 / SE-3 resolutions) settle the `Fireline` / `usedFireline`
plan as: extend `WildfireReading` + `translate.ts` with the `SimulationStarted`
payload's `fireLineMarkers` array, then read it. SE-1 / SE-3 / R6a verified the
field's *name* (`fireLineMarkers`) and *presence* (built unconditionally in
`bottom-bar.tsx`). None of them asked whether `SimulationStarted` is the right
*moment* to snapshot fire-line state.

It may not be. In [simulation.ts](../../src/models/simulation.ts),
`canAddFireLineMarker` (line 109) gates fire-line placement only on
`config.fireLineAvailable` and a `fireLineDelay` timer — **not** on
`simulationRunning`. `canUseHelitack` (line 119) has the identical shape. So
fire lines, like helitacks, can be placed *during* a running simulation. The
`SimulationStarted` payload snapshots `simulation.fireLineMarkers` at Start time
([bottom-bar.tsx:229](../../src/components/bottom-bar.tsx)); a fire line drawn
mid-run is **not** in that run's witness reading. `Fireline` / `usedFireline`
would then evaluate `false` for a student who genuinely used a fire line — the
exact run-window problem the spec calls "Non-trivial → WM-28" for helitack.

Why it matters: the spec rates `Fireline` / `usedFireline` "Small," puts them
firmly in WM-18 scope (R6, Q1 decision A), and asserts the fire-line progression
path "is fully functional" and "is walked" (R11, Q5). All of that rests on the
unstated assumption that fire lines exist only pre-Start. If the assumption
holds, the spec should *state* it (and cite the workflow / UI evidence — the way
the Helitack bullet cites its run-window evidence). If it does not hold,
`Fireline` / `usedFireline` need the same temporal mechanism as `Helitack`
(attach "a fire line was drawn during this run" to the `SimulationStarted`
reading via `temporalHistory`) — WM-28-class engine-substrate work — and Q1's
scope split must be revisited.

Suggested resolution: before implementing `Fireline` / `usedFireline`, verify
whether fire lines can be drawn after Start in the activity-page flow (is the
fire-line tool enabled while `simulationRunning`, and does the tabs-45/47/54
curriculum flow expect mid-run fire-line drawing). If pre-run only, add a
Technical Note stating it (mirroring the Helitack bullet's run-window reasoning)
so the "Small" rating is justified. If fire lines can be drawn mid-run, treat
`Fireline` / `usedFireline` like `Helitack` — stub + sub-ticket — and revisit Q1.

---

### QA Engineer

#### RESOLVED: QA-1 — R8 ("five-shape sweep") and R9 ("every reachable category") may conflict

*Resolution*: R8 and R9 reworded to be explicitly additive — R8 is the
five-shape sweep as the *structural* model (engine-behavior shapes), R9 is a
per-category assertion block on top so every reachable category is covered.


R8 says each test file is "modeled on the five-shape sweep" of
[23.test.ts](../../src/hazbot/rule-sets/23.test.ts); R9 says "every reachable
category has a Jest case asserting it is the matched category." The five-shape
sweep is a fixed 5-test pattern (empty state, single-category, multi-true →
highest, monotonicity, stub-gated) — it does not necessarily assert *every*
individual category id. For example 23.test.ts's sweep exercises categories 1,
2, 4, 5 but not 3 directly. A rule-set with 7 categories would have categories
with no dedicated assertion. Suggested resolution: clarify the relationship —
either R9 means the five-shape sweep is *extended* with a per-category
assertion block, or R8/R9 are reconciled into one precise statement of required
coverage.

#### RESOLVED: QA-2 — No requirement covers updating the extractor's own unit tests

*Resolution*: New requirement **R1b** added — the `EXCLUDED_TABS` and
`id >= 100` filter changes are covered by `scripts/extract-impl.test.js`.


R1 (empty `EXCLUDED_TABS`) and R1a (new `id >= 100` filter) change
`scripts/extract-impl.js`, which has a unit-test suite
(`scripts/extract-impl.test.js`). No requirement says that suite is updated to
cover the new filter behavior. Suggested resolution: add a requirement that the
extractor changes (the `id >= 100` filter, and `EXCLUDED_TABS` handling) are
covered by `scripts/extract-impl.test.js`.

---

#### RESOLVED: QA-3 — R8 names a "five-shape sweep" but the cited reference file `23.test.ts` implements four shapes

*Resolution*: R8 reworded to drop the cardinality from the name entirely — the
count "five" was itself the defect, since it drifts from the reference file (4
shapes) and from any future shape. R8 now simply enumerates the shapes (empty
state, single matching category, multiple-true → highest-wins, monotonicity, and
a stub-gated shape *only where* a stub-gated category exists) with no count or
"five-shape sweep" label. The historical QA-1 entry above is left as-is — it is
a record of a review done under the old terminology.


R8 requires each test file to use "the five-shape sweep of `23.test.ts` as its
structural model," listing five shapes (empty state, single matching category,
multiple-true → highest-wins, monotonicity, stub-gated). `23.test.ts` in fact
implements four test cases, labelled (a)–(d); the fifth — the stub-gated shape
— is explicitly marked "N/A — no stub-gated category in this rule set." R8's own
wording ("and any stub-gated category") makes shape (e) conditional, so R8 is
self-consistent — but the name "five-shape sweep" and the cited canonical file
disagree, and a test author opening `23.test.ts` finds four shapes. Suggested
resolution: reword R8 so the sweep is "four shapes always, plus a fifth
stub-gated shape only where a stub-gated category exists," and stop describing
`23.test.ts` as a five-shape file.

---

#### RESOLVED: QA-4 — Nothing independently checks the regenerated modules against the source sheet; the R10/R11 validation loop is self-referential

*Resolution*: New requirement **R11a** added — a one-time human diff of each
regenerated/new module against its source sheet tab (expressions,
factor-variable definitions, `logEvents`), using `dump-xlsx.js` to render the
sheet side. Scoped as a one-time acceptance gate (the extractor is
deterministic), not ongoing work, and kept proportionate — a reviewer diff
rather than a re-implementation of the extraction.


R10 regenerates the validation playbooks *from the modules*; R11 walks each
playbook and confirms the engine activates each category for the playbook's
readings sequence. Both the playbook and its expected outcome derive from the
same module, so the loop proves a module is internally self-consistent — not
that the extracted module faithfully matches the 2026-05-22 sheet. The only
thing checking module-against-sheet is the extractor itself; R1b tests the
extractor's two new filters but not the fidelity of every emitted expression. An
extraction bug producing a faithfully-wrong module (e.g. a mis-parsed `WITH`
clause) would pass R10/R11 unnoticed. The rule-sets *are* the deliverable, and
"the category becomes active" is not "the category matches what curriculum
staff authored." Suggested resolution: add a requirement for an independent
module↔sheet fidelity check — a reviewer diffs each regenerated module's
expressions against its sheet tab, or the extraction test asserts expected
expressions for representative tabs.

---

#### RESOLVED: QA-5 — R8/R9 never state that the existing 23/24/25 test files are rewritten to match the regenerated modules

*Resolution*: R8 now states that the existing `23/24/25` test files are
**rewritten** against their regenerated modules (not merely that new files are
added for `32–54`), and R9 states that its per-category coverage applies equally
to the rewritten `23/24/25` files. Verification confirmed `23/24/25` are the
only rule-sets with pre-existing test files, so the rewrite scope is exactly
those three.


R8 says "new test files are added for 32, 33, 34, 35, 42, 45, 47, 54" and that
every rule-set has a test file — but 23/24/25 already have test files, and R3
regenerates 23–35 from the new sheet, changing their behavior (Background's own
example: 23 cat 5 goes from `setDroughtLevel AND usedOneSparkPerZone` to
`ranSimulation WITH CorrectZoneSetup AND OneSparkPerZone`). The existing
`23.test.ts` / `24.test.ts` / `25.test.ts` encode the *old* behavior and will
fail after regeneration. Only R15 (`npm test` passes) forces them to be fixed,
implicitly. Suggested resolution: make R8/R9 explicit that the existing 23/24/25
test files are rewritten — not merely augmented — against the regenerated
modules.

---

#### RESOLVED: QA-6 — R11's manual playbook walk produces no durable evidence

*Resolution*: No spec change — reviewed and deliberately declined. The R11 walk
is a one-time closure gate performed during WM-18; R12's refreshed validation
status table in `localhost-urls.md` (plus the documented stub-gated exceptions,
per Q5) is accepted as sufficient record. A separate per-category validation log
was judged unnecessary overhead for this story.


Per Q5 the R11 playbook walk is a closure gate for WM-18, but R11 only says each
reachable category "is confirmed to become the active category" — it does not
require the walk's result to be recorded anywhere durable. R12 refreshes a
"Current validation status" *table* but not a per-category pass/fail record. A
manual, unrecorded validation leaves no artifact that the closure gate was met,
and no way to tell which categories were walked if the work is revisited.
Suggested resolution: add to R11 (or R12) that the per-rule-set, per-category
walk result is recorded — checked off in the playbook file or a validation log
under `docs/hazbot-validation/`.

---

#### RESOLVED: QA-7 — R2a delegates its test coverage to R1b, but R1b's enumeration does not include the `defaults`-field change

*Resolution*: R1b is widened to enumerate all three extractor changes —
`EXCLUDED_TABS` (R1), the `id >= 100` filter (R1a), and R2a's omission of the
per-rule-set `defaults` field — each covered by cases in
`scripts/extract-impl.test.js`. R2a's existing "(per R1b)" pointer is now
accurate; R2a itself is unchanged.

R2a (the WM-27 `defaults`-field reconciliation) ends with "Covered by
`scripts/extract-impl.test.js` (per R1b)." But R1b states its own scope
explicitly: "The extractor changes (**R1's `EXCLUDED_TABS` emptying and R1a's
`id >= 100` filter**) are covered by new/updated cases in
`scripts/extract-impl.test.js`." R1b enumerates only R1 and R1a — it does not
mention R2a's "extractor emits modules with no per-rule-set `defaults` field"
change.

Why it matters: R2a is, per the spec's own SE-2 history, the most load-bearing
premise of R2 (a clean re-extract). Its only stated test coverage is a pointer
to R1b, and R1b does not claim it. As written, no requirement clearly owns a
test that the regenerated modules carry no `defaults` field — it falls between
R1b (scoped to R1 + R1a) and R2a (which delegates outward).

Suggested resolution: either widen R1b's enumeration to include R2a's
`defaults`-omission change, or give R2a its own explicit clause — "covered by a
new case in `scripts/extract-impl.test.js` asserting no `defaults` field is
emitted" — instead of "per R1b."

---

#### RESOLVED: QA-8 — R11a attributes extractor-bug fixes to "R1/R1a", which are too narrowly scoped to own a general extraction-fidelity bug

*Resolution*: R11a's parenthetical is changed from "(fixed under R1/R1a)" to
direct the fix into `scripts/extract-impl.js` — preserving R2's clean-regenerate
property — with a regression case in `scripts/extract-impl.test.js`. R1/R1a are
no longer referenced as the owner of general extraction-fidelity bugs.

R11a adds a human module↔sheet diff and says: "Discrepancies are either
extractor bugs (**fixed under R1/R1a**) or sheet-quality issues (flagged per Out
of Scope)." But R1 is specifically "`EXCLUDED_TABS` … is emptied" and R1a is
specifically "drops category rows with `id >= 100`." A fidelity bug surfaced by
the R11a diff — a mis-emitted `WITH` clause, a dropped operator,
`uniqueWindValuesUsed.size > 1` emitted as `>= 1` — has nothing to do with
either R1 or R1a, so "fixed under R1/R1a" points at requirements that cannot own
it.

Why it matters: R11a is the spec's only independent check that the modules
faithfully match the sheet (QA-4's whole point — R10/R11 are self-referential).
If that check finds a genuine extractor bug, the spec must say where the fix
lands. R2's "no hand-edits required" forces the fix into `extract-impl.js` (a
hand-patched module would break R2), but no requirement owns "general extractor
fidelity bugs found via R11a are fixed in `extract-impl.js` and covered by
`extract-impl.test.js`."

Suggested resolution: change R11a's parenthetical from "(fixed under R1/R1a)" to
a correct owner — either a new clause for "extractor-fidelity discrepancies are
fixed in `extract-impl.js`, preserving R2's clean-regenerate property, and
covered by `extract-impl.test.js`," or have R11a reference R2 (the
clean-regenerate requirement) rather than the two narrow filter requirements.

---

#### RESOLVED: QA-9 — Config-gated reachability is not modeled; `localhost-urls.md` carries a stale `43` row

*Resolution*: Partially upheld — verification downgraded the original finding.
Per-tab config is already handled:
[docs/hazbot-validation/localhost-urls.md](../../docs/hazbot-validation/localhost-urls.md)
gives each tab its own URL derived from the real LARA activity sequence. Tab
34's URL leaves `forestWithSuppressionAvailable` at its `true` default and tab
34 has a `Mountains` zone, so `triedAllVegetations` is reachable; tab 54's URL
enables severe drought. No tab among the 11 is a confirmed
config-gated-unreachable case, so the originally-claimed "`triedAllVegetations`
is structurally unreachable" does not hold.

The genuine, narrower residual was applied: **R11** now states the walk uses
each tab's `localhost-urls.md` URL (not CLAUDE.md's single example); **Q5**
recognizes "config-gated" as a possible reachability state alongside
stub-gated / stub-degraded; and the Tab 34 Technical Note records the
`ForestWithSuppression` → Mountains-terrain + `forestWithSuppressionAvailable`
dependency so a future page-config change is caught. Separately, a concrete
defect found during verification was fixed: `localhost-urls.md`'s Placeholder
table lists a stale `43` row (mirroring the stale `EXCLUDED_TABS` `"43"`) —
**R12** now corrects it to `42` as part of the move to Loadable, since there is
no `42` row to move as-is.

---

#### RESOLVED: QA-10 — R11a's module↔sheet fidelity diff omits category id / priority order

*Resolution*: Upheld. **R11a**'s enumerated diff list now leads with "category
**id and priority order**" alongside expressions, factor-variable definitions,
and `logEvents`, with a parenthetical noting why order is correctness-critical
(the engine activates the first true category in priority order). No new
requirement and no added scope — one more item in a diff the R11a reviewer
already performs.


R11a is the spec's one independent check that the regenerated modules
faithfully match the source sheet (QA-4's point: R10/R11 are self-referential).
It enumerates exactly what the reviewer diffs: "category expressions,
factor-variable definitions, and `logEvents`."

The engine classifies by **priority order** — "the first category whose
expression evaluates true (in priority order) is the active one" (CLAUDE.md; Q4
relies on "highest-category-first evaluation"). Category *order* is therefore a
correctness-critical property of an extracted module, equal to the expressions
themselves: two modules with identical expressions but a different category
order classify students differently. R11a does not list order / priority among
the diffed properties.

Why it matters: the extractor reads sheet rows top-to-bottom, so order is
*probably* preserved by construction — but "probably preserved by construction"
is exactly the kind of assumption R11a exists to catch. A re-ordering bug (e.g.
R1a's `id >= 100` filter interacting with row segmentation, or a sort introduced
anywhere in `parseTab`) would pass R10/R11 — the playbook is derived from the
same mis-ordered module — and would slip past R11a as written.

Suggested resolution: add category **id and priority order** to R11a's
enumerated diff list, so the reviewer confirms the per-tab category sequence
matches the sheet, not only each category's expression in isolation.

---

#### RESOLVED: QA-11 — R9's "every reachable category" does not say how the stub-gated / config-gated exclusions apply to a *unit* test

*Resolution*: Upheld (latent — no tab among the 11 is currently config-gated,
but R9 is a standing instruction for 11 test files and future re-extractions).
**R9** now states that its per-category coverage excludes only **stub-gated**
categories (a `false` stub in a top-level `AND` — unmatchable in any
environment, Jest included); a **config-gated** category is *not* excluded from
R9, because a Jest test builds readings directly and bypasses LARA config, so it
stays engine-reachable and unit-tested — config-gating excludes a category only
from the R11 playbook walk. No new requirement.


R9 requires a per-category assertion block so "every reachable category" is
verified as the matched category, and says categories "unreachable *or*
behaviorally degraded because of a stub" are documented instead. QA-9's
resolution later introduced a *third* reachability state — **config-gated** (a
category unreachable because the activity page's LARA config disables a tool it
needs).

R9 governs Jest test files; R11 governs the playbook walk. The two run in
different environments, and the exclusions do not transfer cleanly:

- **Stub-gated** (a `false` stub in a top-level `AND`) — genuinely unmatchable
  *even in Jest*, because the stub returns `false` regardless of the readings.
  Correctly excluded from R9.
- **Config-gated** — unreachable only because of LARA config. A Jest test
  constructs readings directly and never goes through a LARA config, so a
  config-gated category *is* engine-reachable and *can* be asserted in a unit
  test. It should **not** be excluded from R9 — only from R11.

R9 says "reachable" without distinguishing these, and R11 uses the same word for
the config-aware walk. Today this is latent — the spec states no tab among the
11 is confirmed config-gated — but R9 is a standing instruction for 11 test
files and any future re-extraction.

Suggested resolution: clarify in R9 that its per-category coverage excludes only
**stub-gated** categories (unmatchable in any environment); config-gated
categories are still unit-tested under R9 and are excluded only from the R11
playbook walk.

---

#### RESOLVED: QA-12 — QA-10's addition of "category id" to R11a's diff list collides with R1a's dropped `id >= 100` rows

*Resolution*: Upheld (introduced by QA-10's own resolution). **R11a**'s order
parenthetical now states that the id / priority-order diff excludes the
`id >= 100` feedback-mechanism rows the extractor drops per R1a / Q3 — the
source sheet retains them, the module intentionally does not — so a reviewer
does not file the absent category 100 as a fidelity discrepancy. One-line
clarification, no scope change.


QA-10's resolution added "category **id and priority order**" to R11a's
module↔sheet diff list. But R1a drops category rows with `id >= 100` from the
emitted modules (per Q3), while the *source sheet tab* still contains its
`id 100` feedback-mechanism row. A reviewer mechanically diffing module category
ids against sheet category ids per R11a will find the module "missing" category
100 and could file it as a fidelity discrepancy — when it is the intended,
specified behavior.

Why it matters: R11a is a discrete acceptance gate, and the spec is precise
everywhere else. An id-level diff with no exclusion note invites a false-positive
discrepancy report on every one of the 11 tabs.

Suggested resolution: add a short parenthetical to R11a noting that the id /
priority-order diff excludes the `id >= 100` rows the extractor drops per
R1a / Q3.

---

### Product Manager

#### RESOLVED: PM-1 — The WM-18 Jira ticket's own "Notes" are now stale

*Resolution*: Handled as a spec-process action, not a numbered requirement
(R1–R15 are repo deliverables; commenting on a ticket is not). A summary comment
will be posted on WM-18 — recording that the `sawIntenseFire` premise changed
(WM-19 closed), and that `Helitack` → WM-28, `SparksAtTopAndBottom` → WM-15, and
a category-100 extractor filter were added — once the spec is finalized
(Phase 5), so the comment reflects the final scope. The WM-18 description is
left intact as the historical scoping record.


The WM-18 ticket's "Notes" section says *"Ruleset 34's `sawIntenseFire` stub
(NEW-5) gates its higher categories — document the gap, do not block"* and
*"See `src/hazbot/TBD.md` section 1."* Both are now contradicted by the spec's
findings: tab 34's 2026-05-22 sheet dropped `sawIntenseFire` entirely (Q2), and
TBD.md §1 was already resolved by WM-27. The spec updates `TBD.md` (R14) but
nothing updates the WM-18 ticket itself, so the ticket and the delivered work
will disagree. Suggested resolution: add a requirement (or a one-off action) to
post a comment on WM-18 — or edit its description — recording that the
`sawIntenseFire` premise changed and pointing at this spec.

#### RESOLVED: PM-2 — "Flag sheet typos back to the author" is asserted as a disposition but no action operationalizes it

*Resolution*: The single concrete instance — the `filreLineMarkers` typo in tab
45's events column — is corrected directly in the source sheet by the spec
author, as a one-off edit outside WM-18's requirement set (too small to warrant
a requirement). No spec machinery is added. The Out of Scope line keeps its
general stance for any *semantic* sheet-quality issues, which are raised with
the sheet author informally.


Out of Scope excludes editing the source spreadsheet to fix typos — "those are
flagged back to the sheet author, not fixed here." The concrete instance is the
`filreLineMarkers` typo in tab 45's events column (Technical Notes, R6a).
Declaring the disposition is not the same as doing it: nothing in the spec
assigns the action of actually flagging the typo (a WM-18 comment, a note to
the author, a tracked item). If it is not flagged, the next re-extraction hits
the same typo. Suggested resolution: add a spec-process action — like PM-1's
WM-18 comment — that records the sheet-quality issues (at minimum
`filreLineMarkers`) back to the author or in the ticket.

---

#### RESOLVED: PM-3 — The spec now assigns WM-28 a re-validation scope, but nothing updates WM-28's ticket to say so

*Resolution*: Handled as a Phase-5 spec-process action, mirroring PM-1 — when
the spec is finalized, a comment is posted on WM-28 (or its description
extended) recording that its acceptance criteria include re-validating the
helitack-dependent categories of tabs 45/47/54, so the WM-28 scope the spec
assigns is visible to WM-28's owner. No new numbered requirement (R1–R15 are
repo deliverables; a ticket comment is not).

The SE-5 resolution makes R11, Q5, and the Helitack Technical Notes all state
that **WM-28's scope includes re-validating tabs 45/47/54** once helitack
detection lands — not merely adding the `Helitack` / `usedHelitack` impl. But
WM-28's Jira ticket is titled and scoped as "Hazbot: Helitack run-window
detection (Helitack / usedHelitack)"; nothing in WM-18's spec process updates
WM-28 itself. PM-1 posts a Phase-5 comment on **WM-18** (recording that Helitack
went to WM-28) — it does not touch WM-28's own scope.

Why it matters: if WM-28 lands as "add helitack detection" without re-walking
tabs 45/47/54, the stub-degraded misclassification SE-5 identified (tabs 47/54
Cat 3 over-matching helitack-only runs; tab 45 Cat 3) silently persists past
WM-28 — exactly the gap SE-5's resolution intended to close. The spec asserts a
WM-28 scope that WM-28's owner has no way to know about.

Suggested resolution: add a Phase-5 spec-process action (companion to PM-1's
WM-18 comment) — post a comment on WM-28, or extend its description, recording
that its acceptance criteria include re-validating the helitack-dependent
categories of tabs 45/47/54.

---

#### RESOLVED: PM-4 — The three Phase-5 spec-process actions live only inside resolved Self-Review entries and have no home in the durable spec body

*Resolution*: Upheld. A new **Closeout actions** section was added to the spec
body (after Out of Scope, before Open Questions) listing all three Phase-5
actions — the WM-18 comment (PM-1), the WM-28 comment (PM-3), and the
`filreLineMarkers` sheet-typo flag (PM-2) — each tagged with its originating
self-review entry. They now survive independently of whatever is decided about
the Self-Review section at finalization. No new numbered requirement and no
engineering scope added — the actions were already decided; this only relocates
them to a durable home.


Three closeout actions are defined entirely within Self-Review resolutions:

- **PM-1** — post a summary comment on WM-18 at finalization.
- **PM-2** — flag / fix the `filreLineMarkers` sheet typo with the sheet author.
- **PM-3** — post a comment on WM-28 recording its re-validation scope for tabs
  45/47/54.

All three were deliberately *not* made numbered requirements (the resolutions
argue R1–R15 are repo deliverables and a ticket comment is not — a reasonable
call). But that leaves them recorded *only* as prose inside three RESOLVED
self-review entries.

The cc-create-spec finalization step (Phase 5) explicitly asks whether to
"remove / collapse / keep the Self-Review section." If it is removed or
collapsed at finalization — the very phase in which PM-1 and PM-3 are supposed
to *fire* — the only record of these three actions disappears, and no checklist
anywhere in the spec body (Requirements, Technical Notes, Out of Scope) carries
them.

Why it matters: PM-3 in particular guards a real failure mode — WM-28 landing
as "add helitack detection" without re-walking tabs 45/47/54, leaving the SE-5
misclassification in place. If the action that informs WM-28's owner is lost
with the Self-Review section, SE-5's whole resolution is quietly undone.

Suggested resolution: promote the three Phase-5 actions into a durable part of
the spec body — e.g. a short "Closeout actions" subsection (under Out of Scope,
or as its own section) listing the WM-18 comment, the WM-28 comment, and the
sheet-typo flag — so they survive whatever is decided about the Self-Review
section at finalization.

---

#### RESOLVED: PM-5 — The new "Closeout actions" section labels all three actions "Phase 5", but the sheet-typo correction happens before extraction

*Resolution*: Upheld (introduced by PM-4's own resolution). The **Closeout
actions** section header was softened from "performed at finalization (Phase 5)"
to "performed during implementation and at finalization", and the sheet-typo
item is now tagged *(before extraction)* with explicit "before the R2 extraction
is run" wording — so the typo fix is not mis-deferred to Phase 5. Wording-only.


PM-4's resolution added a "Closeout actions" section headed "Spec-process
actions performed at finalization (Phase 5)". Two of the three items — the
WM-18 and WM-28 comments — are indeed Phase-5 actions. The third, the
`filreLineMarkers` sheet-typo item, is different: per the PM-2 resolution and the
Technical Notes ("corrected in the source sheet before extraction"), the typo is
fixed *before* the extraction step — i.e. during implementation, not at
finalization. Listing it under a "performed at finalization (Phase 5)" header
mis-times it.

Why it matters: minor, but the Closeout section is the durable home PM-4
created precisely so these actions are not lost or mis-executed. A reader could
defer the typo correction to Phase 5 and run the R2 extraction against the
un-fixed sheet.

Suggested resolution: soften the section header so it does not pin all three
items to Phase 5 — e.g. "Spec-process actions performed during implementation
and at finalization" — or annotate the typo item with its own "before
extraction" timing.

---

### Build/Release Engineer

#### RESOLVED: BR-1 — R2 promises a "reproducible regenerate" but the source workbook is deliberately not archived anywhere durable

*Resolution*: No spec change — reviewed and deliberately declined. Adding
workbook-archival / checksum machinery was judged disproportionate (the thread
began as a one-typo fix). The workbook stays out of the repo; reproducing the
regenerate relies on the working copy of the `.xlsx`, accepted as sufficient for
WM-18.


R2 requires `node scripts/extract-hazbot-sheets.js <workbook>` to be "a clean,
reproducible regenerate." Out of Scope excludes "committing the source `.xlsx`
workbook into the repo," and the only recorded location is
`~/Downloads/Wildfire-Hazbot-Feedback-Tables-2026-05-22.xlsx` — one developer's
machine. With the input artifact neither committed nor archived nor checksummed,
the regenerate is reproducible only by whoever holds that file; a future
re-extraction, or an audit of what produced the current modules, cannot
reproduce the input. Suggested resolution: keep the workbook out of the repo if
desired, but add a requirement to durably archive the exact `.xlsx` (shared
drive, or attached to WM-18) and record its filename plus a checksum in the
repo — e.g. in a generation header or `dsl-grammar.md` — so the regenerate is
genuinely reproducible.

---

#### RESOLVED: BR-2 — R13 says "bump APP_RULES_VERSION" without a target value, a convention, or the bump's downstream effect

*Resolution*: R13 tightened in place — states the target value (`1 → 2`) and
adds a one-line implementation check of what consumes `APP_RULES_VERSION`, so
any invalidation side effect is either recorded or explicitly noted as inert. No
new requirement.


R13 requires `APP_RULES_VERSION` to be bumped. It is currently the integer `1`.
R13 does not state the new value or the versioning convention (monotonic
integer? semver?), nor what consumes the version — if it gates persisted user
state, cached analyses, or analytics event schemas, a bump may have side
effects (invalidation, schema mismatch) that themselves need handling. Suggested
resolution: state the target value (presumably `2`) and the convention, and
confirm in Technical Notes what reads `APP_RULES_VERSION` so the bump's side
effects, if any, are in scope or explicitly noted as none.

---

#### RESOLVED: BR-3 — The untracked `scripts/dump-xlsx.js` has a declared scope but no declared fate

*Resolution*: The Technical Notes "Tooling" bullet now states the file's fate —
committed as a standalone dev-tooling change, separate from the rule-set
deliverable. "Delete it" was rejected because R11a's module↔sheet diff now
relies on the tool.


Technical Notes says `scripts/dump-xlsx.js` "is not part of WM-18's deliverable
and is out of scope for this spec." It is currently an untracked file on the
`WM-18` branch. "Out of scope" describes what the spec covers, not what happens
to the file when WM-18 is committed or PR'd — it will otherwise sit untracked,
be swept into the WM-18 commit, or need manual exclusion. Suggested resolution:
state the file's fate explicitly — committed as a separate change, removed, or
added to `.gitignore` — so landing WM-18 leaves no loose end.

---

### Curriculum / Content Author

#### RESOLVED: CA-1 — Dropping category-100 rows discards author-written content that is then extracted nowhere

*Resolution*: Q3's Decision gains a sentence making the disposition explicit —
the ~2 shared, byte-identical category-100 strings are intentionally not
captured in the repo by WM-18; they stay in the source workbook until the
feedback mechanism (TBD §5) consumes them. No capture machinery is built
(speculative scaffolding for an unscoped feature); the omission is now recorded
as deliberate so a future reader does not read it as an extraction gap.


Q3 decision A drops `id >= 100` rows at extraction — correct, since they carry
no classification logic and would otherwise cause a `parse-error`. But those
rows are not empty: they carry curriculum-authored `studentAction` and
`feedback` prose. After the drop, that authored feedback-mechanism content lives
only in the source spreadsheet — extracted into no module, doc, or grammar file.
Q3 says a future feedback mechanism "sources those ~2 shared strings centrally,"
but no requirement captures or preserves them, so "centrally" has no source. The
extraction pipeline is meant to be the bridge from authored content to the repo;
this content silently falls outside it. Suggested resolution: have the extractor
capture the category-100 strings somewhere (a generated doc, or
`dsl-grammar.md`) even though they are dropped from the classification modules —
or add an explicit note that the feedback-mechanism content is intentionally
left in the spreadsheet until TBD §5.

---

#### RESOLVED: CA-2 — `CorrectZoneSetup` and `DefaultVars` bake sheet-authored constants into bridge code with no drift detection

*Resolution*: Both sheet definitions were verified verbatim via `dump-xlsx.js`
(tab 23 R16 for `CorrectZoneSetup`, tabs 45 R13 / 47 R12 for `DefaultVars`). A
Technical Notes bullet now flags that these two impls hard-code sheet constants
and are *not* regenerated on re-extraction, and R6 gains a clause requiring
their unit tests to cite the sheet definition as fixture source of truth — so a
deliberate sheet change forces a visible, reviewed test diff. No drift-detection
machinery (proportionate to a two-impl, ≤2-rule-set risk).


`CorrectZoneSetup` (zone 1 = Foothills/Grass/No Drought; zone 2 =
Foothills/Grass/Mild-or-Medium Drought) and `DefaultVars` (wind tolerance ±2
magnitude / ±20° angle) encode specific, curriculum-authored constants. R6
implements them as hand-written bridge predicates, so those values become
hard-coded in TypeScript, decoupled from the sheet. Unlike a rule-set
*expression* (which is re-extracted), a sim-prop *implementation* is not
regenerated — a future sheet edit to the intended zone setup or wind tolerance
silently desyncs from the impl, and no test catches it. The point of the
extraction pipeline is that authored content drives the repo; these sim-props
quietly opt out. Suggested resolution: note this coupling in Technical Notes and
require the R6 unit tests to cite the sheet definition as their source of truth,
so a deliberate sheet change forces a visible test update; consider flagging in
`TBD.md` that these constants are sheet-derived.

---

#### RESOLVED: CA-3 — Are `triedAllVegetations` / `SevereDroughts` / `DefaultVegetations` constant-baking impls outside R6's discipline?

*Resolution*: Partially upheld — the workbook definitions (verified via
`dump-xlsx.js`) show the three are *not* constant-baking impls, so R6's
two-impl scope (`CorrectZoneSetup`, `DefaultVars`) is correct as written.
`triedAllVegetations` (tab 34) wants the run-union to equal the full
`Vegetation` enum; `SevereDroughts` (tab 54) compares each zone to the
`DroughtLevel` "Severe" enum value; `DefaultVegetations` (tab 54) compares each
zone to its config-sourced default (per WM-27). Enums and config — not a
sheet-only constant — are the shared source of truth, unlike `CorrectZoneSetup`
(tab 23's specific per-zone setup) and `DefaultVars` (the ±2 / ±20° wind
tolerance), which encode constants with no other home. The residual real risk —
that an implementer hard-codes a literal set anyway — is addressed by a new
Technical Notes bullet stating these three are implemented against the enums /
config and carry no R6 sheet constant, with a contingency: if a future sheet
narrows one to a *subset*, that subset becomes a constant and gets R6 treatment.
R6 itself is unchanged.

---

#### RESOLVED: CA-4 — Nothing produces an author-facing record of which sheet-referenced names have a real impl vs. a stub

*Resolution*: Partially upheld — resolved as a deliberate scope decision, not new
tooling. Building an extractor-emitted author catalog is a new feature beyond
WM-18's content-extraction frame (the same "speculative scaffolding for an
unscoped feature" CA-1 declined), and the 11 in-scope tabs are already fully
accounted for by R5's `missing-impl` closure gate. A new **Out of Scope** line
now records the omission explicitly — a generated author-facing impl/stub
catalog is out of scope for WM-18, `dsl-grammar.md` documents DSL syntax (not
impl availability), and the impl/stub status lives in developer-facing
`TBD.md` §2 (R14) — so a future reader sees a recorded decision rather than a
silent extraction gap. A generated catalog is noted as a reasonable future
improvement.


The extraction pipeline is the bridge from curriculum-authored sheet content to
the repo. A curriculum author writes category expressions in the workbook using
factor-variable and sim-prop *names*; whether a name is backed by a working
bridge impl, a `stub-warning` stub, or nothing at all is decided on the code
side (R5 / R6 / R7).

After WM-18, the only record of that impl / stub status is
[TBD.md](../../src/hazbot/TBD.md) §2 (R14) — a developer-facing notes file. An
author filling in a future sheet revision has no catalog telling them, e.g.,
that `Helitack` is currently a stub (so a category gated on it never fires), or
that `usedOneSparkPerZone` exists but is now unreferenced. The author discovers
a bad name only downstream — when a developer re-extracts and a category fails
to load with `missing-impl` (R5), or, worse, loads against a stub and silently
never matches.

Why it matters: WM-18 is itself a re-sync triggered by exactly this class of
gap (the sheet drifted ahead of the modules). Without an author-facing catalog
of the available vocabulary, the same drift recurs, and an author has no way to
author *against* what the engine can actually evaluate.

Suggested resolution: either (a) have the extractor emit the available
factor-variable / sim-prop catalog, with impl / stub status, into a generated
author-readable doc — `dsl-grammar.md` is the natural home, since it is already
regenerated (R2) and already author-facing — or (b) if an author-facing catalog
is deemed out of WM-18's scope, add an explicit Out of Scope line saying so, so
the omission is a recorded decision rather than a silent gap.

---

### Education Researcher

#### RESOLVED: ER-1 — The spec accepts shipping known misclassifications and a rule-set version change without establishing whether any classification output is consumed or recorded

*Resolution*: Upheld; code verification landed it on the reassuring branch. The
engine's classified category (`matchedCategory`) is consumed by exactly one
thing — the dev sidebar; it is not logged as a research/analytics event, not
persisted, and not surfaced to students (student UI = TBD §5, persistence = TBD
§6, both unbuilt). Research logging captures the raw `SimulationStarted` /
`SimulationStopped` events the engine classifies *from*, not its output
category. So the SE-5 stub-degraded misclassification has **no student-facing
and no research-data effect** within WM-18 — it is observable only in the dev
sidebar and the R11 walk. Two spec changes: a "sheet ↔ engine notes" Technical
Note ("Classification consumption — verified") records the consumption picture,
and **Q5's Decision** now states explicitly that the stub-degraded
misclassification is shippable because it has no live consumer. The
`APP_RULES_VERSION` side is already owned by R13 (verification so far shows it
flows to the sidebar as a displayed value); no new requirement added.


Two WM-18 decisions change the *meaning* of the engine's classification output:

- SE-5 / Q5 accept shipping tabs 45/47/54 with **stub-degraded** categories that
  misclassify a sub-population — tabs 47/54 Cat 3 over-match helitack-only runs,
  tab 45 Cat 3 over-matches fireline+helitack runs.
- R13 bumps `APP_RULES_VERSION` `1 → 2` because categories, factor variables,
  and expressions changed — i.e. a pre-WM-18 "Category 4" and a post-WM-18
  "Category 4" are not the same pedagogical thing.

Neither decision is examined for its effect on **data validity**, because the
spec never establishes whether the active category is *consumed or recorded* by
anything during the WM-18 → WM-28 window: a student-facing coaching UI,
research / analytics event logging, or persisted per-student state.

The spec's own Out of Scope and TBD references suggest the answer is *currently
nothing student-facing*: the student-facing Hazbot UI is a separate unbuilt
feature (TBD §5) and engine persistence is unbuilt (TBD §6). If that is the full
picture, the misclassification is **inert today** — it surfaces only in the dev
sidebar and the R11 playbook walk — and stating that explicitly would materially
strengthen Q5's "ship it documented" decision, which currently reads as "ship a
known-wrong classification" with no note that the wrong classification has no
consumer yet.

But if anything *does* read the classified category — in particular research /
analytics logging of the `Readings` stream or the active category — then (a) the
SE-5 misclassification corrupts research data for helitack-using students for
the whole WM-18 → WM-28 window, not merely "degrades a category," and (b) R13's
version bump only protects longitudinal data validity if `APP_RULES_VERSION` is
actually *recorded alongside* the logged classification, which the spec does not
confirm.

Why it matters: the Hazbot exists to classify student behavior for pedagogical
purposes; "we ship a documented misclassification" and "we renumber the
categories" are research-data-validity events, not just engineering details. The
spec resolves both purely on engineering grounds.

Suggested resolution: add a short Technical Note (or a clause in Q5)
establishing what, if anything, consumes the engine's classification output
today. If nothing does, say so — it strengthens Q5 and Q1. If research /
analytics logging does, then (a) record that the SE-5 misclassification affects
logged research data over the WM-18 → WM-28 window, and (b) confirm
`APP_RULES_VERSION` is recorded with that logged data so v1 and v2
classifications are distinguishable.
