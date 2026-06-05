# Hazbot: Implement SparksAtTopAndBottom sim-prop

**Jira**: https://concord-consortium.atlassian.net/browse/WM-15

**Status**: **Closed**

## Overview

Implement the Hazbot `SparksAtTopAndBottom` detection so the wildfire model can
recognize when a student placed one fire spark near the top of a mountain and one
near the bottom — the setup ruleset 25 coaches toward. Previously this detection
was a placeholder that always answered "no," so the activity's "Great job, you're
ready" success state (ruleset 25 Cat 6) could never appear and the activity
stalled one step short of completion. This story makes the detection real, clears
the developer-facing `stub-warning` the engine raised for it, and unblocks the full
coaching progression (Cat 4 → 5 → 6). The detection ships with sensible initial
thresholds; tuning them against real student data is intentionally left to a later,
separate change.

## Requirements

> **Superseded mechanism (see Addendum, 2026-06-04).** R2/R3 and OQ-1 below describe
> the original detection: each spark's elevation normalized against a single global
> `elevationRange` (top/bottom 25%) plus a minimum-span floor. The shipped
> implementation replaced this with a **localized multi-scale Topographic Position
> Index (TPI)** and removed the `elevation` / `elevationRange` / `baseElevationRange`
> fields. The requirements' *intent* (one spark near the top, one near the bottom;
> fail closed on flat/degenerate input) still holds; the elevation-normalization
> *details* do not. Read the [Addendum](#addendum-2026-06-04-branch-wm-28-add-helitack-run-window-detection-localized-multi-scale-tpi)
> for current behavior.

- **R1.** `SparksAtTopAndBottom` no longer sets `isStub: true`, and its `evaluate`
  implements real detection logic (no longer hard-returns `false`).
- **R2.** Returns `true` for ruleset 25 Cat 6's intent: one spark near the top
  (ridge / high elevation) and another near the bottom (valley / low elevation).
  Each spark's elevation is normalized against the topography's actual elevation
  extrema (`elevationRange = {min, max}` carried on the reading); the run qualifies
  when the higher spark's normalized elevation is in the top 25% (≥ 0.75) **and**
  the lower spark's is in the bottom 25% (≤ 0.25). The 25% tolerance is a single
  named, tunable constant (PI guidance: > 10%, ≪ 50%).
- **R3.** Returns `false` for all other configurations (both sparks similar, both
  near top, both near bottom, or no meaningful top/bottom). **Flat / plains
  topography never counts**: disqualified unless the elevation span exceeds a named,
  tunable **minimum-span floor** computed as a fraction of `heightmapMaxElevation`
  (`MIN_SPAN_FRACTION = 0.05` → 1000 ft at the default max). Carries
  `heightmapMaxElevation` on the reading (config is unreachable from a sim-prop).
  **Fails closed** on missing/degenerate data (non-finite elevations, missing
  `elevationRange` or `heightmapMaxElevation`, a spark count other than two) and on
  any spark elevation outside `[min, max]` (defense-in-depth). **Edge-cell sparks
  fail closed at the source**: the payload omits (sets `undefined`) the elevation of
  any spark on a `fillTerrainEdges` perimeter cell, whose artificial `baseElevation:
  0` is excluded from `elevationRange`. **Elevation basis** is the immutable
  `cell.baseElevation`, not the dynamic `cell.elevation` getter (which subtracts
  `FIRE_LINE_DEPTH`); the range scan excludes **only** the `fillTerrainEdges`
  perimeter cells (by border position) and **includes** rivers/unburnt islands.
- **R4.** A predicate-level unit-test sweep in
  [sim-props.test.ts](../src/hazbot/wildfire/sim-props.test.ts) covers the `true`
  class, each R3 `false` sub-case (similar / both-top / both-bottom / flat), the
  fail-closed guards (undefined spark elevation, undefined `elevationRange`,
  undefined `heightmapMaxElevation`, spark count ≠ two, non-finite, out-of-range),
  the 0.75 / 0.25 boundary values (inclusive), and the minimum-span-floor
  boundaries (just below / exactly at / just above).
- **R5.** Ruleset 25 Cat 6 is reachable in the regenerated validation playbook
  ([25.md](../docs/hazbot-validation/25.md)). **Verified by a driven Playwright
  walk** on `mountainTwoZoneFixedTerrain` reading the engine's **matched** category
  (`.hazbot-sidebar-category-matched`, not the `▸ ✓ N` truth icon): mid-slope sparks
  → Cat 4, then a **Reload** (clears sparks; `addSpark` no-ops once both zones hold
  a spark) and the documented top/bottom coordinates → Cat 6. (An automated Cypress
  e2e was considered and dropped — see Decisions / OQ-E.)
- **R6.** No new `stub-warning` for `SparksAtTopAndBottom` when ruleset 25 loads.
  **Verified by** a registry assertion checking all three: (1) no load-blocking
  error, (2) no `stub-warning` for the prop, (3) `isStub` is falsy — because the
  engine suppresses stub-warnings under a load-blocking error, so a bare
  "no stub-warning" check alone could pass for the wrong reason.
- **R7.** Works on `mountainTwoZoneFixedTerrain` and returns `false` on flat
  `plainsTwoZone`. **Verified by** the same Playwright walk capping `plainsTwoZone`
  at Cat 4 with ordinary `placeSparkInZone(0/1)`; the predicate's flat logic is
  unit-tested via the synthetic below-minimum-span fixture (R4).
- **R8.** Corrected the ruleset 25 validation entry in
  [localhost-urls.md](../docs/hazbot-validation/localhost-urls.md) from
  `mountainTwoZone` to `mountainTwoZoneFixedTerrain` (both the table and summary
  rows); the fixed preset pins the heightmap and disables terrain-type editing for a
  deterministic walk.
- **R9.** Bridge-plumbing coverage: `translate()` forwarding tests (both fields on
  `SimulationStarted`, neither on `SimulationEnded`/`SimulationStopped`); and the
  topography payload assembly extracted into a pure
  `SimulationModel.buildStartReadingData()`, unit-tested at the model level —
  `baseElevationRange` (min/max, edge-excluded, rivers/islands included, `null` on no
  finite elevation), a fire-line-cell fixture pinning the `cell.baseElevation` basis,
  and an excluded-edge spark yielding `elevation: undefined`.
  `heightmapMaxElevation` rides the generic config snapshot, so it is covered by the
  `translate()` tests.
- **R10.** Ruleset 25 category tests
  ([25.test.ts](../src/hazbot/rule-sets/25.test.ts)) gained automated Cat 4/5/6
  coverage with elevation-bearing readings; the stale stub-gated header/comment and
  the old "never matches cat 5/6" assertion were removed.
- **R11.** The mountain Cat 4 → 6 walk is made deterministic via **documented,
  validated spark coordinates** (no placement helper ships) recorded in
  [CLAUDE.md](../CLAUDE.md): top → zone 1 `(119000, 38000)` (normalized elevation
  ≈ 1.00), bottom → zone 0 `(59000, 3500)` (≈ 0.00), against a global
  `baseElevationRange ≈ {min 1096, max 19450}`. Recorded in CLAUDE.md (not the
  auto-generated 25.md).

## Technical Notes

- **Sim-prop contract**: `SimPropImpl<WildfireReading, WildfireDefaults>` with
  `defaultValue: false` and `evaluate(reading, defaults) => boolean`. The engine's
  `safely-evaluate-impl` wrapper falls back to `defaultValue` if `evaluate` throws,
  but the predicate still guards its own inputs.
- **Registration**: `SparksAtTopAndBottom` was already a key in the `simProps`
  export; only its body and the `isStub` flag changed.
- **Payload assembly** (asymmetric): `elevationRange` is **not** a config key — it is
  computed (min/max of `cell.baseElevation`, excluding only the `fillTerrainEdges`
  perimeter, including rivers/islands) at the payload site and attached explicitly.
  `heightmapMaxElevation` needs **no** new line at the payload site (the generic
  config-snapshot loop already emits it); the gating change for **both** is
  `translate()` forwarding + the `WildfireReading` type.
- **`isTerrainEdge` off-by-one**: the extracted predicate reproduces *exactly* the
  cells `fillTerrainEdges` zeros — the `y === gridHeight` clause is never true, so
  the bottom grid row is intentionally **not** zeroed and **not** excluded
  (bug-for-bug parity, not geometric edges). Verified byte-identical with/without the
  off-by-one on `mountainTwoZoneFixedTerrain`.
- **Existing-prop precedent**: follows `OneSparkPerZone` / `UniformZoneSettings` /
  `TwoSparks` defensive style (fail closed on undefined fields / count mismatch).
- **Heightmaps**: elevation comes from per-topography heightmap PNGs (white = high,
  black = low, scaled to `heightmapMaxElevation`). `mountainTwoZone(FixedTerrain)`
  and `shrubThreeZone`'s Mountains zone carry real relief; `plainsTwoZone` is flat.
- **No app-side a11y surface** is in scope (engine-bridge logic, not UI).

## Out of Scope

- The student-facing Hazbot UI (launcher, feedback panel, Cat 6 confetti).
- The `Helitack` stub (deferred to WM-28) and any other stubbed impl.
- Paired-run DSL or other engine-substrate changes.
- Re-extracting / editing ruleset 25's generated category content.
- Engine extraction into a standalone package.
- **Tuning** the 25% top/bottom tolerance and the 5% minimum-span floor against real
  student data — they ship as initial values; adjusting them once observed is a
  later, separate change.

## Not Yet Implemented

- **Threshold tuning** (25% tolerance, 5% minimum-span floor) — shipped as initial
  values; tuning against observed student runs is deferred to a later change (Out of
  Scope above). Implemented as single named, module-private constants so tuning is a
  one-line edit.
- **Misclassification-rate validation** (the OQ-1 detection-vs-visual-mental-model
  gap) — no telemetry/validation required for this story; the tunable tolerance plus
  coaching copy are expected to absorb it.

## Decisions

### OQ-1: Which detection approach defines "near the top" and "near the bottom"?
**Context**: The central decision; drives acceptance criteria, fixtures, and whether
the `SimulationStarted` payload must change. A sim-prop sees only the two sparks
(`x`, `y`, `zoneIdx`, `elevation`) plus defaults — not the elevation grid or preset.
**Options considered**:
- A) Relative elevation gap between the two sparks (no payload change; not anchored to
  the topography's actual extent — two mid-slope sparks with a large gap could pass).
- B) Normalize spark elevations against the topography's actual extrema, attached to
  the payload (topography-aware, unit-testable, fails closed on flat terrain).
- C) Per-preset pre-traced ridge/valley polylines (most faithful to literal
  "ridge/valley lines"; highest authoring + plumbing cost; per-preset re-authoring).

**Decision**: **B** (PI-confirmed). Normalize each spark's elevation against
`elevationRange = {min, max}` carried on `SimulationStarted`; "near the top" = top 25%
(≥ 0.75), "near the bottom" = bottom 25% (≤ 0.25), as a single tunable constant. Also
carry `heightmapMaxElevation` (for the R3 floor). Accepted tradeoff: detection is by
normalized elevation, not visual geometry, so a spark at the apparent ridge but below
the top quartile is classified "not at top"; the tunable tolerance + coaching copy
absorb this, and misclassification-rate validation is out of scope.

---

### OQ-2: What is the canonical topography/preset for ruleset 25?
**Context**: localhost-urls.md ran ruleset 25 against `mountainTwoZone`, whose derived
heightmap has a real ridge/valley but whose `TerrainTypeSelector` stays enabled — a
student could re-derive a different heightmap mid-walk, breaking determinism.
**Options considered**:
- A) A 2-zone mountain preset with fixed (non-editable) terrain
  (`mountainTwoZoneFixedTerrain`); correct the localhost-urls.md entry.
- B) `shrubThreeZone` (adds a zone-count mismatch against the 2-zone rule expressions).
- C) Topography-agnostic by design; preset only matters for the walk.

**Decision**: **A** (PI/dev-confirmed). Ruleset 25 is a 2-zone mountain activity and
validates against `mountainTwoZoneFixedTerrain` — real relief plus a literal
`config.elevation` that pins the heightmap and disables terrain-type editing. The
fail-closed/flat check is validated against `plainsTwoZone`.

---

### OQ-3: Should the predicate enforce its own spark-count / distinct-zone preconditions?
**Context**: Every ruleset-25 category using `SparksAtTopAndBottom` also ANDs
`OneSparkPerZone` (which already requires two sparks in distinct zones).
**Options considered**:
- A) Self-contained guards (require exactly two sparks with defined elevation; return
  `false` otherwise), matching existing props.
- B) Elevation-only; assume upstream filtering (couples the prop to ruleset 25's shape).

**Decision**: **A** (dev-confirmed). Self-contained fail-closed guards (two sparks,
defined elevations, defined `elevationRange` and `heightmapMaxElevation`). **Distinct-zone
validation is intentionally delegated to `OneSparkPerZone`**, not duplicated here: the
predicate is purely elevation-based and never inspects `zoneIdx`, keeping it reusable and
the unit sweep self-contained.

---

### OQ-A (impl): Where does the R9 "payload computation" assertion live?
**Context**: R9 requires verifying the `SimulationStarted` payload computes
`elevationRange` from `baseElevation` with correct edge exclusion, reads per-spark
`baseElevation`, and carries `heightmapMaxElevation`. The actual builder was the React
`handleStart` handler (reads `this.stores`, calls `log()`) — awkward to unit-test.
**Options considered**:
- A) Test `baseElevationRange` (+ the spark read) at the model level.
- B) Assert via the replay fixture (real `handleStart → log → translate` path).
- C) Both.

**Decision**: **A** (revised from C). The replay fixture does **not** exercise
`handleStart` (the generator hand-builds event data), so C left key items uncovered.
The topography payload assembly was extracted into a pure
`SimulationModel.buildStartReadingData()` and unit-tested at the model level —
crucially a fire-line-cell fixture pinning the `cell.elevation` → `cell.baseElevation`
switch (the regression nothing else could distinguish). The replay fixture is **not**
regenerated: its elevation-less `startData` makes the real predicate fail closed, so
its `matchedCategoryHistory` is invariant (still caps at Cat 4) and the existing
fixture stays green.

---

### OQ-B (impl): How is the `fillTerrainEdges` edge predicate shared?
**Context**: R3 requires excluding exactly the cells `fillTerrainEdges` zeroed,
identified "by the same edge predicate `simulation.ts` uses" — which has an apparent
off-by-one (`y === gridHeight`, never true; bottom row not zeroed).
**Options considered**:
- A) Extract `simulation.isTerrainEdge(x, y)`, call it from both `populateCellsData`
  and `baseElevationRange` (single source of truth; off-by-one stays consistent).
- B) Duplicate the inline condition at the payload site (risks silent divergence).
- C) Fix the off-by-one (changes bottom-edge rendering/fire-spread; out of scope).

**Decision**: **A**. Extracted `isTerrainEdge`, with a doc-comment stating it
reproduces exactly the cells `fillTerrainEdges` zeros (so the bottom row is
intentionally not excluded — bug-for-bug parity, not geometric edges) and a "do not
fix the off-by-one" warning. Empirically confirmed: the edge-excluded range is
byte-identical with/without the off-by-one on `mountainTwoZoneFixedTerrain` (parity is
preset-specific, which is exactly why bug-for-bug parity is the goal).

---

### OQ-C (impl): Where does the R6 no-stub-warning registry assertion live?
**Context**: R6 needs a test asserting clean load, no `stub-warning` for the prop, and
`isStub` falsy.
**Options considered**:
- A) In `25.test.ts` via `makeWildfireEngine` (if it surfaces `errors`).
- B) A dedicated engine/registry test using the real load path (pulls in URL mocking).
- C) Split across files.

**Decision**: **A** (code-verified). `Engine` exposes public `errors: EngineError[]`,
so `makeWildfireEngine(ruleSet25).errors` is directly readable, colocated with the
ruleset-25 coverage it protects; `isStub` is checked via `simProps.SparksAtTopAndBottom`
in the same file.

---

### OQ-D (impl): Should the minimum-span fraction (0.05) be a single shared constant?
**Context**: An earlier plan had the fraction in both the predicate and a
`placeSparkInElevationBand` helper, which could drift.
**Options considered**:
- A) Leave the predicate constant module-private (with a cross-reference if a second
  consumer existed).
- B) Hoist to a shared constants module imported by both.

**Decision**: **A** (re-revised after the Cypress/helper drop, OQ-E). With Cypress
dropped and the walk driven by documented coordinates (R11), the predicate is the
**single** consumer, so `MIN_SPAN_FRACTION` / `TOP_BOTTOM_TOLERANCE` /
`HIGH_THRESHOLD` / `LOW_THRESHOLD` stay module-private in `sim-props.ts` — no shared
module, no `stores.ts` import.

---

### OQ-E (impl): Is the wizard-driven Cypress walk worth its flakiness, or reach Cat 5 differently?
**Context**: The Cat 4 → 5 → 6 walk needs non-uniform zones for Cat 5 and uniform for
Cat 6; on the fixed-terrain preset the difference must come from drought/vegetation,
the most fragile interaction in the plan.
**Options considered**:
- A) Drive the wizard end to end.
- B) Reach Cat 5 via a smaller debug surface.
- C) Drop the automated Cat-5 step, keep Cat 4 + Cat 6 endpoints in Cypress.

**Decision**: **Drop the Cypress e2e entirely** (user-confirmed). Its only unique value
over the unit layers is thin, generic bottom-bar → `log` → `translate` → engine glue,
while it concentrated all the plan's risk (wizard selectors, Reload re-gating, an
engine-ingestion race, a placement-helper basis). **R5/R7 instead use a driven
Playwright walk** against the regenerated `25.md` with documented, validated spark
coordinates (R11). This deleted the placement-helper and Cypress steps and the
`stores.ts` / `constants.ts` changes they required. The walk must actually be run to
close R5/R7 (done during implementation, with screenshots under `tmp/playwright/`).

---

### Minimum-span floor definition (Self-Review, Senior Engineer)
**Context**: R3 originally said flat terrain "never counts" when the range is "≈ 0",
but never defined how flat is flat enough; real heightmaps carry quantization noise.
**Decision**: R3 specifies a named, tunable minimum-span floor computed as a fraction
of `heightmapMaxElevation` (carried on the reading, since `config` is unreachable from
a sim-prop); the predicate returns `false` when `max - min` is at or below the floor.
Initial fraction 5% (1000 ft at the default max).

---

### Artificial terrain-edge sparks could satisfy "bottom" (Phase 4 external review, HIGH)
**Context**: `baseElevationRange` excludes `fillTerrainEdges` perimeter cells
(artificial `baseElevation: 0`), but `addSpark()` does not reject edge cells, so a
spark on a zeroed perimeter cell normalized below the interior range and counted as
"bottom" — making Cat 5/6 reachable without a real valley placement.
**Decision**: Both-layers fix — (1) `buildStartReadingData()` emits `elevation:
undefined` for any spark on a cell the **same** `isTerrainEdge` predicate excludes,
failing closed at the source; (2) the predicate adds finite + in-`[min, max]` guards as
defense-in-depth; (3) model and predicate tests cover both.

---

## Addendum (2026-06-04, branch `WM-28-add-helitack-run-window-detection`): localized multi-scale TPI

**Why**: Feedback + further research found the global normalized-elevation check
(OQ-1 Option B above) too coarse. Normalizing each spark against the topography's
single global `elevationRange` mislabels sparks whose *local* setting differs from
the whole-map extremes — e.g. a spark on a local rise inside an overall low area,
or a mid-slope spark that happens to fall in the global top/bottom quartile. The
detection is now **localized** per spark.

**What changed**:
- **Detection basis**: replaced the global `elevationRange` normalization with a
  **multi-scale Topographic Position Index (TPI)**. For each spark, `SimulationModel.tpiForSpark`
  scans concentric cell bands (config `tpiBands`, default `[3, 8, 15]` cell radii)
  in a single neighborhood pass and returns one TPI per band, where
  `TPI = sparkElevation - meanBandElevation` (negative = valley at that scale,
  positive = ridge/peak). The elevation basis and `isTerrainEdge` exclusion are
  unchanged (immutable `cell.baseElevation`; perimeter cells excluded). Both sparks
  are evaluated independently.
- **Reading payload**: each spark now carries a `tpi: Array<number | null>` (one
  entry per band; `null` for a band with no usable cell). `SparksAtTopAndBottom`
  classifies a spark "top"/"bottom" when its **mean** TPI clears `±tpiMarginFraction
  × heightmapMaxElevation` and returns `true` when one spark is top and the other
  bottom. Flat terrain (TPI ≈ 0) naturally fails the margin, so the separate global
  minimum-span floor is gone.
- **Margin tuning (Playwright sweeps, 2026-06-05)**: the margin fraction was lowered
  from the initial `0.05` (1000 ft) to the shipped **`0.02`** (400 ft) after empirical
  sweeps on `mountainTwoZoneFixedTerrain`. Ground truth was each point's elevation
  percentile within a *local* (fire-relevant, 5–10 k ft) window — matching the
  pedagogy (a spark at the **base of a slope** climbs faster than it spreads on flat
  ground), not whole-mountain position.
  - First pass landed on `0.025`, but live testing showed obvious mountain-bases
    being missed. Root cause: **mean dilution** — at the foot of a slope the inner
    rings are locally flat (TPI ≈ 0) while the outer ring correctly sees the mountain
    above (e.g. −1,448), so the *mean* lands just short of the threshold. ~9% of
    "base with a ≥3,000 ft climb above" points were missed at `0.025`.
  - Lowering to `0.02` raises obvious-base detection from ~0.91 to ~0.97 while keeping
    crest detection ~0.99 and two-mid-slope false-pass < 1% — the latter holds because
    mid-slope overfire skews to "bottom" (≈13%) not "top" (≈3%), and the activity
    needs *one of each*. Cell-weighting the bands was tried and **rejected** (same
    tradeoff curve, no separation gain).
  - A **strict "all bands agree in sign"** classifier was also considered and
    **rejected**: it fails on mountains smaller than the outer band's reach (the outer
    band overshoots the summit into flat ground and flips sign), whereas the mean rule
    degrades gracefully. Mid-slope sparks on a uniform slope still read "neither" (the
    core TPI property: terrain above and below cancel).
- **Debug overlay verdict**: `tpiDebug` tints each spark's rings by the *verdict* the
  predicate computes (red/blue gradient when it counts as top/bottom, greyscale when
  "neither") and logs each spark's mean TPI + verdict to the console, so a base spark
  whose strong outer ring looks blue but whose mean fell short reads as grey rather
  than misleading blue.
- **Removed as now-unused** (this branch added them in the original WM-15 work; the
  localized approach made them dead): the per-spark `elevation` field, the
  `elevationRange` reading field, the `SimulationModel.baseElevationRange` getter,
  and their plumbing in `translate()` / `buildStartReadingData()` / `bottom-bar` /
  `LOGGED-EVENTS.md`. `heightmapMaxElevation` is **kept** (it now scales the TPI
  margin). R9's `baseElevationRange` / spark-`elevation` / `elevationRange`
  forwarding tests were removed accordingly and replaced with `tpiForSpark` /
  `tpi`-payload coverage.
- **Tuning params**: `tpiBands` and `tpiMarginFraction` (config; URL/preset-tunable
  via `?tpiBands=[..]` / `?tpiMarginFraction=..`) replace `TOP_BOTTOM_TOLERANCE` /
  `HIGH_THRESHOLD` / `LOW_THRESHOLD` / `MIN_SPAN_FRACTION`. Both ride the
  `SimulationStarted` config snapshot; `translate()` forwards `tpiMarginFraction` to
  the predicate (`tpiBands` is consumed model-side when building each spark's `tpi`).
  `DEFAULT_TPI_MARGIN_FRACTION` in `sim-props.ts` is only the fallback when a reading
  omits the field.
- **Debug overlay**: `?tpiDebug=true` paints each placed spark's TPI bands onto the
  terrain (warm = ridge / positive TPI, cool = valley / negative, white ≈ flat),
  normalized to the most extreme band on screen. Shares the single `tpiBandsForSpark`
  scan so the drawn bands match the predicate's averages. No effect on logging or
  rule logic.

**Unchanged**: OQ-2 (canonical preset `mountainTwoZoneFixedTerrain`), OQ-3
(self-contained fail-closed guards; distinct-zone delegated to `OneSparkPerZone`),
the no-stub-warning guarantee (R6), and that threshold tuning against real student
data remains out of scope.
