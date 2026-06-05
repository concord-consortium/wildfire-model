# Hazbot: Extract All Rule-Set Sheets and Add/Update Rule-Sets

**Jira**: https://concord-consortium.atlassian.net/browse/WM-18

**Status**: **Closed**

## Overview

The Hazbot analysis engine classifies how a student uses the wildfire
simulation; its classification rules are authored in a spreadsheet and
mechanically converted into code. That spreadsheet is now complete and revised
while the generated code has fallen behind — four activity pages have no
rule-set and seven others have drifted from what was authored. WM-18
regenerates all eleven rule-sets from the current spreadsheet, implements the
new behavior-checks the updated rules reference, and validates every page.

The classification result is currently consumed only by a developer-facing debug
sidebar — not shown to students and not recorded as research data — so WM-18
changes nothing students experience today; it is foundational work that readies
the rule-sets for the eventual student-facing Hazbot feature.

## Requirements

### Extraction

- **R1.** `EXCLUDED_TABS` in `scripts/extract-impl.js` is emptied (`[]`) so all
  11 rule-set tabs are extracted.
- **R1a.** The extractor drops category rows with `id >= 100` so
  feedback-mechanism categories are not emitted into modules. Warns when a
  row's `id` and its `-- no pseudo code --` marker disagree, surfacing
  misnumbering at extraction time.
- **R1b.** The extractor changes (R1's `EXCLUDED_TABS` emptying, R1a's
  `id >= 100` filter, and R2a's omission of the per-rule-set `defaults` field)
  are each covered by new/updated cases in `scripts/extract-impl.test.js`.
- **R2.** Running `node scripts/extract-hazbot-sheets.js <workbook>` produces
  the rule-set modules, `index.ts`, and `dsl-grammar.md` with no hand-edits
  required afterward — a clean, deterministic regenerate.
- **R2a.** The `defaults`-field drift introduced by WM-27 is reconciled so a
  re-extract is clean *(verify-only — already satisfied by WM-27 commit
  `6334af7`; see IQ2 decision)*.
- **R3.** New per-tab modules exist for `42, 45, 47, 54`; modules `23–35` are
  regenerated from the 2026-05-22 sheet content.
- **R4.** `src/hazbot/rule-sets/index.ts` exports all 11 rule-sets.

### Factor variables / sim-props

- **R5.** Every factor variable and sim-prop referenced by an extracted module
  either has a working impl in the wildfire bridge, or is a documented stub
  with a linked Jira sub-ticket. No category loads with a `missing-impl` failure.
- **R6.** The 8 in-scope new impls — `CorrectZoneSetup`, `UniformZoneSettings`,
  `triedAllVegetations`, `usedFireline`, `Fireline`, `DefaultVars`,
  `DefaultVegetations`, `SevereDroughts` — are implemented in the wildfire
  bridge with unit tests. Impls that hard-code sheet constants
  (`CorrectZoneSetup`, `DefaultVars`) cite the sheet definition in their unit
  tests as the fixture source of truth.
- **R6a.** The `SimulationStarted` payload's fire-line field is verified as
  `fireLineMarkers`. `WildfireReading` and `translate.ts` are extended to carry
  it. Unit-test shape splits by impl kind: `usedFireline` (factor variable)
  tested against a multi-`SimulationStarted` sequence; `Fireline` (sim-prop)
  tested with single-reading `evaluate` cases.
- **R7.** Non-trivial deferred impls are stubbed in the bridge so the rule-sets
  still load (`stub-warning`, not `missing-impl`): `Helitack` / `usedHelitack`
  → **WM-28**; `SparksAtTopAndBottom` → **WM-15**.
- **R7a.** The `sawIntenseFire` stub is removed from
  `factor-variable-stubs.ts` — no rule-set references it after re-extraction.

### Tests

- **R8.** Every rule-set (`23, 24, 25, 32, 33, 34, 35, 42, 45, 47, 54`) has a
  per-rule-set Jest test file exercising engine behavior across these shapes:
  empty state, single matching category, multiple-true → highest-wins, match
  stability, and (only where applicable) a stub-gated shape. New files added
  for `32–54`; existing `23/24/25` test files rewritten against their
  regenerated modules.
- **R9.** Each test file has a per-category assertion block so every reachable
  category is verified as the matched category for a representative readings
  sequence. R9's coverage excludes only **stub-gated** categories (unmatchable
  in any environment); **config-gated** categories are *not* excluded from R9
  (a Jest test bypasses LARA config) — config-gating excludes a category only
  from the R11 playbook walk.

### Validation

- **R10.** Validation playbooks regenerated for all 11 rule-sets via
  `node scripts/generate-hazbot-validation-playbook.js`.
- **R11.** Each rule-set's playbook is walked against a running dev server with
  the Hazbot sidebar; each reachable category is confirmed to become the
  active category. The walk uses each tab's URL from
  `docs/hazbot-validation/localhost-urls.md`. Stub-affected categories are
  recorded; per Q5 they do not block WM-18 closure, and WM-28 owns re-validating
  tabs 45/47/54 *(partial — full Playwright walk deferred at WM-18 close; see
  Not Yet Implemented)*.
- **R11a.** Before WM-18 closes, each regenerated/new module is diffed against
  its source sheet tab by a reviewer — category **id and priority order**,
  expressions, factor-variable definitions, and `logEvents`. Excludes the
  `id >= 100` rows the extractor drops.
- **R12.** `docs/hazbot-validation/localhost-urls.md` validation-status tables
  refreshed; tabs `42, 45, 47, 54` moved from "Placeholder tabs" to "Loadable
  rulesets"; the stale `43` row corrected to `42`.

### Housekeeping

- **R13.** `APP_RULES_VERSION` bumped `1 → 2`. `APP_RULES_VERSION` is a dev
  sidebar display value; it gates no persisted or cached state.
- **R14.** `src/hazbot/TBD.md` updated to the post-WM-18 state.
- **R15.** Regenerated modules and new code pass `npm run lint`, `npm test`,
  and `npm run build`.

## Technical Notes

### Stub effects (per WM-18)

A stub evaluates to `false`. Beyond making a category unreachable (a stub name
in a top-level `AND`), a stub also *degrades* a reachable category whose
expression references it inside an `OR` / `NOT`:

- **Stub-gated** categories: tab 25 Cat 5/6 (`SparksAtTopAndBottom` → WM-15),
  tab 45 Cat 4 (`Helitack` → WM-28). Unmatchable in any environment.
- **Stub-degraded** categories (helitack stub returns `false`):
  - Tab 45 Cat 3 (`NOT (usedFireline AND usedHelitack)` → `TRUE`) — over-matches
    fireline+helitack runs.
  - Tabs 47/54 Cat 3 (`NOT (Fireline OR Helitack)` → `NOT Fireline`) —
    over-matches helitack-only runs.
  - Tabs 47/54 Cat 4/5 — helitack arm dead; fireline arm reachable.

The stub-degraded misclassification is shippable within WM-18 because it has no
live consumer: the classified category is read only by the dev sidebar — not
logged, persisted, or surfaced to students — so no student-facing and no
research-data harm occurs before WM-28 lands.

### Sheet-derived constants

`CorrectZoneSetup` (tab 23 per-zone setup) and `DefaultVars` (wind tolerance
±2 magnitude / ±20° angle) hard-code sheet-authored constants. Unlike rule-set
*expressions*, these sim-prop impls are not regenerated on re-extraction. Their
R6 unit tests cite the sheet definition as the source of truth so a sheet
change forces a visible test diff. The enum *choice* (resolved through
`terrainLabels` / `vegetationLabels` / `droughtLabels`) is the constant, not the
label strings.

`triedAllVegetations`, `SevereDroughts`, `DefaultVegetations` are *not*
constant-baking impls — they fold against the `Vegetation` / `DroughtLevel` enums
or compare against the WM-27 config-derived defaults, so the enums / config are
the shared source of truth.

### Zone-array order is positional

`reading.zones` is `config.zones.map(...)` in tuple order, never reordered at
runtime. The sheet's "zone 1 / zone 2" wording maps to slots 0 / 1, so
positional impls (`CorrectZoneSetup`, `DefaultVars`, `DefaultVegetations`) are
correct by construction.

### Fire-line timing

The Fire Line button is disabled until `simulationStarted`, so a fire line can
only be drawn *after* Start — the first `SimulationStarted` of a session always
snapshots an empty `fireLineMarkers`. But `handleFireLine` calls
`simulation.stop()`: drawing a fire line forces a run boundary, and the next
`Start` re-emits `SimulationStarted` with the marker now in the snapshot.
`handleHelitack` does *not* stop the sim — this `stop()`-asymmetry is the real
reason `Fireline` / `usedFireline` are Small (R6) and `Helitack` /
`usedHelitack` are non-trivial (WM-28).

### Tooling

`scripts/dump-xlsx.js` is committed as a standalone dev-tooling change to
support sheet inspection and the R11a module↔sheet diff.

## Out of Scope

- The student-facing Hazbot UI (launcher, feedback panel, coach-marks, confetti).
- Extracting the analysis engine into its own npm package.
- Writing the `SparksAtTopAndBottom` ridge/valley algorithm itself (WM-15).
- Engine / DSL feature work (paired-reading primitive, `arrowText` rendering,
  persistence, engine-emitted log events).
- An automated end-to-end Playwright/Cypress regression suite.
- Committing the source `.xlsx` workbook into the repo.
- Editing the source spreadsheet to fix *semantic* sheet-quality issues.
- An author-facing catalog of which factor-variable / sim-prop names have a
  working impl vs. a stub. `dsl-grammar.md` documents DSL *syntax*, not impl
  availability; impl/stub status lives in developer-facing `TBD.md` §2.

## Not Yet Implemented

- **Helitack / usedHelitack impl** — ~~deferred to **WM-28**~~ **DONE (WM-28).**
  Implemented via a translate "modifier" result kind (the engine-substrate change
  out of scope for WM-18); tabs 45/47/54 were re-validated. See the WM-28 spec.
- **SparksAtTopAndBottom algorithm** — deferred to **WM-15** ("Hazbot: Implement
  SparksAtTopAndBottom sim-prop"). Requires ridge/valley detection. Tab 25
  Cats 5 and 6 remain unreachable until WM-15 lands.
- **Full Playwright playbook walk (R11)** — a representative Playwright walk
  against tab 23 confirmed the Cat 1 → Cat 2 transition; a full walk of all 11
  playbooks was deferred at WM-18 close, with the Jest R9 per-category coverage
  validating each reachable category end-to-end through the engine. WM-28 owns
  the helitack-dependent walk for tabs 45/47/54. *(Note: a full Playwright walk
  of all 11 rulesets was later completed independently — see
  `~/docs/hazbot-ruleset-check.md`; live results matched the R9 Jest coverage.)*
- **Tab 35 Cat 2** — sheet-quality shadowing issue (Cat 3's lack of a
  `setAnyVar AND` guard makes Cat 2 unreachable). Faithful extraction, flagged
  in `src/hazbot/TBD.md §4`; not a WM-18 fix.
- **Category-100 feedback-mechanism strings** — intentionally not captured in
  the repo. They remain in the source workbook until the feedback mechanism
  (TBD §5) is built and extracts them.
- **Author-facing impl/stub catalog** — out of scope (see Out of Scope above);
  noted as a reasonable future improvement.

## Decisions

### Q1 — Which new factor-variable / sim-prop impls are in scope for WM-18 vs. spun into sub-tickets?

**Context**: The extracted sheets reference 10 names with no impl today. Eight
are trivial single-reading or fold-across-runs checks. Two (`Helitack` /
`usedHelitack`) need run-window event correlation requiring an engine-substrate
change. `SparksAtTopAndBottom` is already a stub needing a new algorithm.

**Options considered**:
- A) Implement the 8 trivial impls in WM-18; sub-ticket `Helitack` +
  `usedHelitack` (one ticket); keep `SparksAtTopAndBottom` sub-ticketed.
- B) Implement all 10 including `Helitack`/`usedHelitack` in WM-18.
- C) Implement only the impls needed by the updated existing tabs (23–35);
  sub-ticket everything new tabs (42/45/47/54) need.

**Decision**: **A.** The 8 trivial impls are implemented in WM-18 in the
wildfire bridge. `Helitack` / `usedHelitack` deferred to **WM-28** because they
require an engine-substrate change WM-18 otherwise does not make.
`SparksAtTopAndBottom` remains a stub; ridge/valley algorithm deferred to its
own sub-ticket (WM-15). All three deferred names are kept as bridge stubs
(`stub-warning`, not `missing-impl`) so all 11 rule-sets still load.

---

### Q1a — Does `SparksAtTopAndBottom` need its own Jira sub-ticket?

**Decision**: A ticket already exists — **WM-15** ("Hazbot: Implement
SparksAtTopAndBottom sim-prop"). Linked Relates → WM-18. No new ticket needed.

---

### Q2 — Disposition of `sawIntenseFire` / WM-19 now that tab 34 dropped it

**Context**: The 2026-05-22 tab-34 sheet no longer references `sawIntenseFire`;
category 4 now uses `triedAllVegetations`. The `sawIntenseFire` stub and WM-19
were created specifically for ruleset 34 Cat 4/5.

**Options considered**:
- A) Remove the stub from the bridge and close WM-19 as obsolete.
- B) Keep the stub as dead code and keep WM-19 open.
- C) Remove the stub but leave WM-19 open / re-scoped as a product decision.

**Decision**: **A.** WM-18 removes the `sawIntenseFire` stub (referenced by no
rule-set after re-extraction). WM-19 has been closed (Done) as obsolete with a
comment recording why — the tab-34 sheet revision dropped the
intensity-comparison category. The stub remains in git history and WM-19 can be
reopened if a future sheet revision reintroduces an intensity category.

---

### Q3 — How should category `100` ("feedback mechanism") rows be handled?

**Context**: Every rule-set sheet has a final category `100` whose pseudo-code
cell is `-- no pseudo code --` followed by prose. The current extractor has no
filter on category id, so a re-extract with the new sheets would emit an
unparseable `expression` and the engine would raise a load-blocking `parse-error`.

**Options considered**:
- A) Add an extractor filter that drops category rows with `id >= 100`.
- B) Extract `100` as a category but rewrite its expression to a sentinel
  never-true expression.
- C) Extract `100` and build minimal feedback-mechanism support.

**Decision**: **A.** Extractor gains a filter that drops `id >= 100`. Confirmed
across all 11 sheets that category 100 carries no classification logic — it is
a feedback-mechanism description, not a sim-use category. The ~2 shared
category-100 strings are intentionally not captured in the repo by WM-18 —
they remain in the source workbook until the feedback mechanism (TBD §5) is
built. This omission is deliberate, not an extraction gap.

---

### Q4 — Do tab 47's categories 4 / 5 need a range-2 / paired-reading factor variable? *(withdrawn)*

**Decision**: Withdrawn. Closer analysis shows tab 47's clauses are existence
predicates, not ordering predicates; combined with the engine's
highest-category-first evaluation, they faithfully capture the intent without
needing a range-2 construct.

---

### Q5 — Is a full playbook walk a hard gate for closing WM-18?

**Context**: With `Helitack` and `SparksAtTopAndBottom` sub-ticketed (per Q1),
the categories that depend on them are unreachable in production and cannot be
walked.

**Options considered**:
- A) WM-18 closes when every *reachable* category (given the WM-18 stub set)
  validates via a playbook walk.
- B) WM-18 stays open until all categories of all 11 rule-sets validate.

**Decision**: **A.** Stub-affected categories fall into two kinds, both
documented and deferred to their sub-tickets:
- **Stub-gated** — a stub name sits in a top-level `AND`: tab 25 Cats 5–6
  (WM-15), tab 45 Cat 4 (WM-28).
- **Stub-degraded** — a stub name sits inside `OR` / `NOT`: tabs 47/54 Cat 3
  over-match helitack-only runs and their Cat 4/5 helitack arm is dead; tab 45
  Cat 3 over-matches fireline+helitack runs. Fire-line progression path is
  functional and *is* walked; helitack behavior deferred to WM-28, whose scope
  includes re-validating tabs 45/47/54.

The stub-degraded misclassification is acceptable to ship within WM-18 because
it has no live consumer (dev sidebar only — not logged, persisted, or surfaced
to students).

A category can also be **config-gated** — unreachable because the activity
page's LARA config disables a tool. No tab among the 11 is confirmed
config-gated under its `localhost-urls.md` URL; the walk uses those per-tab
URLs so reachability is judged against each page's real config.

---

### Q6 — What happens to bridge impls left unreferenced after re-extraction?

**Context**: After re-extraction, `usedOneSparkPerZone` (and possibly
`GraphOpen` / `simulationRuns`) — fully implemented, unit-tested factor
variables — are referenced by no rule-set. This is distinct from the
`sawIntenseFire` stub (Q2): those are working impls, not stubs.

**Options considered**:
- A) Remove any bridge impl left unreferenced.
- B) Keep unreferenced impls as a general-purpose library for future rule-sets.
- C) Remove `usedOneSparkPerZone` specifically; leave others case-by-case.

**Decision**: **B.** Unreferenced-but-working impls are kept as inert
general-purpose library code. The engine only evaluates impls a rule-set
references, so an unreferenced impl costs nothing at runtime and stays available
for a future rule-set. Distinct from Q2: a *stub* is a non-functional
placeholder (still removed); a working, tested impl is library code (kept).

---

### IQ1 — Commit granularity for the re-extract and the per-rule-set test files

**Context**: The re-extract regenerates 11 modules at once and changes the
behavior of `23/24/25`, whose existing test files would then fail `npm test`.
Per-rule-set test files (3 rewritten, 8 new) total ~1000–1400 lines.

**Options considered**:
- A) Re-extract step = regenerate + rewrite `23/24/25` tests (green); then a
  `32–35` test commit; then a `42–54` test commit.
- B) Re-extract step = regenerate only (leaves `npm test` red); single
  following commit rewrites/adds all 11 test files.
- C) One commit per rule-set (11 commits).

**Decision**: **A.** Three commits, each green and independently reviewable.
Every commit leaves `npm test` green; the 32–35 / 42–54 batches stay reviewable
as focused units.

---

### IQ2 — R2a is already satisfied by WM-27; confirm the verify-only treatment

**Context**: Codebase inspection shows the `defaults`-field drift R2a addresses
is already done — WM-27 commit `6334af7` removed the `defaults` emission and
`extract-impl.test.js` already asserts `not.toMatch(/defaults:/)`.

**Options considered**:
- A) Treat R2a as verify-only — no extractor change; re-extract diff is the
  confirmation.
- B) Something still drifts and R2a has real reconciliation work.

**Decision**: **A.** R2a is verify-only — no extractor code change. The
re-extract step's `git diff` of the regenerated `23–35` modules is the
empirical confirmation that the regenerate is structurally clean.

---

### Self-review decisions that meaningfully shaped scope

The multi-round Self-Review surfaced a number of issues whose resolutions
materially changed the spec. The highest-impact ones:

- **SE-1 / SE-3 / SE-6 (requirements)** — `Fireline` / `usedFireline` were
  initially rated "Trivial"; resolution added new requirement **R6a** for the
  bridge type change (`fireLineMarkers` on `WildfireReading` + `translate.ts`)
  and verified via code inspection that the `SimulationStarted` payload carries
  the field unconditionally. The "Fire-line timing" Technical Note records the
  verified `stop()`-asymmetry mechanic as the true Fireline-vs-Helitack
  difficulty split.
- **SE-2 (requirements)** — Background asserted WM-18 owns reconciling the
  WM-27 `defaults`-field drift. Resolution added new requirement **R2a**; later
  (IQ2) verified WM-27 had already done this work, making R2a verify-only.
- **SE-4 (requirements)** — Tab 47/54 parser support was assumed in a Technical
  Note. Code inspection of `parser/parse.ts` and `parser/parser.test.ts`
  verified the DSL parser already handles parenthesized prop-expressions,
  `NOT` before them, and top-level `AND`/`OR` of two parenthesized `WITH`
  expressions. No engine change needed.
- **SE-5 (requirements)** — Original stub model treated `stub-warning` as only
  capping reachability. Resolution distinguished **stub-gated** from
  **stub-degraded** categories: in tabs 47/54's `OR` / `NOT` clauses a `false`
  stub misclassifies *reachable* runs (Cat 3 over-matches helitack-only runs).
  Q5's accounting extended to name both kinds; WM-28's scope widened to include
  re-validating tabs 45/47/54.
- **QA-1 / QA-3 (requirements)** — R8 / R9 reworded as explicitly additive: R8
  is the structural behavior sweep, R9 is per-category coverage on top. The
  "five-shape sweep" label was dropped because `23.test.ts` actually implements
  four shapes (the fifth is conditional on a stub-gated category).
- **QA-4 (requirements)** — R10/R11 are self-referential (the playbook derives
  from the module). Resolution added new requirement **R11a** — a one-time
  reviewer diff of each regenerated/new module against its source sheet tab.
- **QA-10 / QA-12 (requirements)** — R11a's diff list extended to include
  **category id and priority order** (correctness-critical: two modules with
  identical expressions but different category order classify students
  differently), with a parenthetical excluding the `id >= 100` rows R1a drops.
- **PM-1 / PM-2 / PM-3 / PM-4 / PM-5 (requirements)** — Three spec-process
  closeout actions identified (WM-18 summary comment, WM-28 re-validation-scope
  comment, `filreLineMarkers` sheet-typo fix). PM-4 promoted them into a
  durable "Closeout actions" section so they survive any decision about the
  Self-Review section at finalization.
- **CA-2 (requirements)** — `CorrectZoneSetup` and `DefaultVars` bake
  sheet-authored constants. Resolution added the "Sheet-derived constants"
  Technical Note and required R6 unit tests to cite the sheet definition as
  fixture source of truth.
- **CA-4 (requirements)** — Resolved as a deliberate scope decision: an
  author-facing impl/stub catalog is out of WM-18 (new Out of Scope line);
  TBD.md §2 carries developer-facing impl/stub status.
- **ER-1 (requirements)** — Verified the classified category is consumed *only*
  by the dev sidebar — not logged as research/analytics, not persisted, not
  surfaced to students. This grounded Q5's "ship documented" stance: the
  stub-degraded misclassification has no live consumer until WM-28.
- **SE-3 / QA-3 (implementation)** — `DefaultVars` /
  `DefaultVegetations` gained a `zones.length !== defaultZones.length`
  fail-closed guard (zone-count mismatch between reading and defaults), and the
  `makeWildfireEngine` defaults-passing caution was extended to cover
  `defaults`-consuming sim-props (`DefaultVars`, `DefaultVegetations`) so tabs
  45/47/54 are not wrongly told they may omit `defaults`.
- **SE-4 (implementation)** — The R5 `index.test.ts` gate wraps each engine
  construction in `try/catch` because the engine's construction-error model is
  asymmetric: `missing-impl` / `parse-error` land in `engine.errors` while the
  temporal-error variants throw `EngineConstructionError`.
- **QA-8 (implementation)** — The R5 gate's expected `stub-warning` count is
  **five**, not three: `Helitack` is referenced by three rule-sets (45/47/54),
  `usedHelitack` by one (45), `SparksAtTopAndBottom` by one (25).
- **CA-3 / CA-4 / CA-5 (implementation)** — `SevereDroughts` rewritten to
  compare against `droughtLabels[DroughtLevel.SevereDrought]` (not a literal
  string); `CorrectZoneSetup` rewritten to resolve through `terrainLabels` /
  `vegetationLabels` / `droughtLabels`; CA-5 ensured the test fixture follows
  the same enum-map pattern so impl and fixture track one source of truth.
- **ER-1 (external review)** — `DefaultVars` / `DefaultVegetations`
  zone-count-mismatch guard surfaced via Gemini external review; folded back
  into the spec via SE-3.

### Post-implementation findings

Findings surfaced during implementation that updated the spec's pre-extraction
assumptions:

- **Tab 25 stub-gated set is `{Cat 5, Cat 6}`, not just `Cat 6`.** The
  2026-05-22 sheet places `SparksAtTopAndBottom` in a positive (top-level AND)
  position within the `WITH` prop-expression of **both** Cat 5 and Cat 6. With
  the stub returning `false`, both categories are unreachable.
  `25.test.ts` excludes both from R9 coverage. WM-15's re-validation must cover
  both categories, not just Cat 6.
- **Tab 35 Cat 2 is unreachable (shadowed by Cat 3).** Tab 35 Cat 3 is
  `ranSimulation WITH NOT ForestWAWOSuppression` — lacking the `setAnyVar AND`
  guard that tab 33's analogous Cat 3 carries — so any default run that
  satisfies Cat 2 (`ranSimulation AND NOT setAnyVar`) necessarily satisfies
  Cat 3 as well, and Cat 3 > Cat 2 wins. This is a **sheet-quality issue**
  (faithful extraction); flagged in `src/hazbot/TBD.md §4`.
- **Replay fixture regenerated.** `src/hazbot/wildfire/__fixtures__/expected.json`
  (the ruleset-25 replay-regression fixture) was regenerated after the
  re-extract because its `matchedCategoryHistory` was generated against the
  pre-WM-18 modules. The fixture is a downstream generated artifact
  (`node scripts/generate-replay-fixture.js`).
