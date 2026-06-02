# Hazbot: Implement SparksAtTopAndBottom sim-prop

**Jira**: https://concord-consortium.atlassian.net/browse/WM-15
**Repo**: https://github.com/concord-consortium/wildfire-model
**Implementation Spec**: [implementation.md](implementation.md)
**Status**: **In Development**

## Overview

Implement the Hazbot `SparksAtTopAndBottom` detection so the wildfire model can
recognize when a student placed one fire spark near the top of a mountain and one
near the bottom — the setup ruleset 25 coaches toward. Today this detection is a
placeholder that always answers "no," so the activity's "Great job, you're ready"
success state can never appear; this story makes it real and unblocks the full
coaching progression.

## Project Owner Overview

The Hazbot analysis engine watches what a student does in the wildfire model and
gives them targeted coaching. Ruleset 25 is a mountain-fire activity that guides a
student to the correct setup: both zones configured the same way, with one spark
high on the mountain and one low. The final encouragement — "Great job, you're
ready to answer the questions" — is supposed to appear once the student gets that
high/low placement right.

Today the model can't yet tell whether the two sparks are at the top and bottom,
so that success message never fires and the activity quietly stalls one step short
of completion, leaving students who did everything correctly without the
confirmation they earned. This story adds that detection so ruleset 25's coaching
runs end to end, and clears a developer-facing warning the engine currently raises
for the unfinished piece. It was promised to stakeholders in the 2026-05-12
testing-announcement note. The detection ships with sensible initial thresholds;
fine-tuning them against real student data is intentionally left to a later,
separate change.

## Background

The Hazbot engine evaluates **factor variables** and **sim-props** (bridge-side
TypeScript predicates) against recorded `SimulationStarted` readings, then
classifies behavior into the first matching **category**. Sim-props live in
[src/hazbot/wildfire/sim-props.ts](../../src/hazbot/wildfire/sim-props.ts) and
each implements `evaluate(reading, defaults) => boolean`.

`SparksAtTopAndBottom` is currently a stub
([sim-props.ts:93](../../src/hazbot/wildfire/sim-props.ts#L93)):

```ts
const SparksAtTopAndBottom: SimPropImpl<WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  isStub: true,
  evaluate: () => false,
};
```

Because it is flagged `isStub: true`, the engine emits a `stub-warning` at load
time (surfaced in the sidebar Errors panel), and every category that ANDs it at
top level is unreachable.

Ruleset 25 ([src/hazbot/rule-sets/25.ts](../../src/hazbot/rule-sets/25.ts))
depends on it for its top two categories:

| Cat | Expression | Meaning |
|-----|-----------|---------|
| 4 | `ranSimulation WITH OneSparkPerZone AND NOT SparksAtTopAndBottom` | Two sparks, one per zone, but not at top & bottom |
| 5 | `ranSimulation WITH OneSparkPerZone AND SparksAtTopAndBottom AND NOT UniformZoneSettings` | Top & bottom, but zone setups differ |
| 6 | `ranSimulation WITH OneSparkPerZone AND SparksAtTopAndBottom AND UniformZoneSettings` | Top & bottom, same zone setups — **success** |

With the stub returning `false`, Cat 4 over-matches (it fires for any
one-spark-per-zone run regardless of placement) and Cats 5 & 6 are unreachable.
Ruleset 25 caps at Cat 4 instead of progressing through 5 to the Cat 6 success
state. This is documented in
[src/hazbot/TBD.md §2](../../src/hazbot/TBD.md) and
[docs/hazbot-validation/localhost-urls.md](../../docs/hazbot-validation/localhost-urls.md).

### What inputs are available

Each spark in a `SimulationStarted` reading carries `x`, `y`, `zoneIdx`, and
`elevation` ([src/hazbot/wildfire/types.ts:31](../../src/hazbot/wildfire/types.ts#L31)):

- `x`, `y` — normalized to `[0, 1]` (divided by `config.modelWidth` /
  `config.modelHeight` in
  [bottom-bar.tsx:234](../../src/components/bottom-bar.tsx#L234)).
- `elevation` — **absolute feet**, read from the cell under the spark (heightmap
  channel mapped linearly to `[0, config.heightmapMaxElevation]`, default max
  20000 ft). The payload currently reads `cell.elevation`
  ([bottom-bar.tsx:236](../../src/components/bottom-bar.tsx#L236)), but this story
  switches it to `cell.baseElevation` — the **immutable base topography** — to
  avoid the dynamic artifacts described below (see R3 and the Payload-assembly
  Technical Note).
- `zoneIdx` — zone index of the cell under the spark.

**Critical constraint on available data.** A sim-prop's
`evaluate(reading, defaults)` sees *only* the witness reading and the derived
defaults. It does **not** have the live simulation, the per-cell elevation grid,
the preset identity, or any ridge/valley geometry. The `SimulationStarted`
payload is assembled in
[bottom-bar.tsx:231](../../src/components/bottom-bar.tsx#L231) (where the live
simulation *is* available), but `translate()`
([src/hazbot/wildfire/translate.ts](../../src/hazbot/wildfire/translate.ts))
forwards only `zones`, `sparks`, `fireLineMarkers`, and `wind` into the reading.
Any topography reference the algorithm needs beyond the two sparks' own
`elevation` values must therefore be either (a) derived from the two sparks
alone, or (b) added to the payload at build time and threaded through
`translate()` and the `WildfireReading` type. This is the crux of the design and
is captured in the Open Questions.

### The ticket's framing

The source sheet's Details column says: *"needs to be written based on the
topography map used and the x, y, elevation values… One way would be to
pre-trace the ridge lines and the valley lines and determine if the spark
locations are close enough to them (this work never done before; Alert: new
algorithm coding required here)."* The ticket lists two design options
(per-preset pre-traced polylines vs. runtime ridge detection) and leans toward
pre-traced polylines. A third, simpler family — thresholding the sparks' own
`elevation` values against the topography's elevation range — is evaluated in
the Open Questions and is the current recommendation.

## Requirements

<!-- Updated as Open Questions are resolved. -->

- R1. `SparksAtTopAndBottom` no longer sets `isStub: true`, and its `evaluate`
  implements real detection logic (no longer hard-returns `false`).
- R2. Returns `true` for spark configurations matching ruleset 25 Cat 6's
  intent: one spark near the top (ridge / high elevation) of the active
  topography and another near the bottom (valley / low elevation). Concretely
  (per OQ-1 → Option B): each spark's elevation is normalized against the
  topography's actual elevation extrema (`elevationRange = {min, max}` carried on
  the reading); the run qualifies when the higher spark's normalized elevation is
  in the top 25% of the range (≥ 0.75) **and** the lower spark's is in the bottom
  25% (≤ 0.25). The 25% tolerance is a single named, tunable constant (PI
  guidance: > 10%, ≪ 50%).
- R3. Returns `false` for all other configurations, including: both sparks at
  similar elevation, both near the top, both near the bottom, and any run where
  a meaningful top/bottom cannot be determined. **Flat / plains topography never
  counts**: a run is disqualified unless the elevation span (`max - min` of
  `elevationRange`) exceeds a named, tunable **minimum-span floor**, computed in
  the predicate as a named, tunable **fraction** of `heightmapMaxElevation`. The
  initial fraction is **5%** (`MIN_SPAN_FRACTION = 0.05`) — at the default max that
  is a 1000 ft floor: above heightmap quantization noise, well below real mountain
  relief. Like the 25% tolerance it is a single named constant, shipped at this
  initial value with tuning out of scope (see Out of Scope). That
  max is a per-preset config scalar (default 20000 ft; some presets override to
  3000 / 10000), so it is carried on the `SimulationStarted` reading alongside
  `elevationRange` (see Technical Notes) rather than read from `config`, which the
  predicate cannot access. At or below that floor the terrain is treated as flat,
  the normalization yields no distinct top/bottom, and the predicate returns
  `false`. This floor absorbs heightmap quantization noise so a nominally-flat
  preset never produces a spurious top/bottom. The predicate **fails closed** on
  missing or degenerate data (non-finite elevations, `elevationRange`, or
  `heightmapMaxElevation`, or a spark count other than two), and on any spark whose
  elevation falls **outside** `[min, max]` (defense-in-depth: such a value would
  normalize below 0 or above 1 and fake a top/bottom).
  **Edge-cell sparks fail closed at the source**: because `addSpark()` does not
  reject edge or nonburnable cells, a spark may land on a `fillTerrainEdges`
  perimeter cell whose artificial `baseElevation: 0` is **excluded** from
  `elevationRange`. The payload omits (sets `undefined`) the elevation of any spark
  on such a cell — identified by the same edge predicate used for the range scan —
  so an artificial edge zero can never normalize below the interior range and count
  as the "bottom" spark. The in-`[min, max]` predicate guard above is the
  belt-and-suspenders second layer.
  **Elevation basis (immutable topography only)**: both `elevationRange` and the
  per-spark elevation it normalizes against are derived from `cell.baseElevation`,
  **not** the dynamic `cell.elevation` getter. This matters because `cell.elevation`
  subtracts `FIRE_LINE_DEPTH` for fire-line cells
  ([cell.ts:59-64](../../src/models/cell.ts#L59-L64)), letting a dug fire line skew
  the topographic range. **Exact exclusion rule for the `elevationRange` scan**:
  exclude **only** the `fillTerrainEdges` perimeter cells — those set to
  `baseElevation: 0` ([simulation.ts:229](../../src/models/simulation.ts#L229)),
  identified by border grid position (the same edge predicate `simulation.ts` uses
  to zero them) at the payload-build site — since the artificial 0 would otherwise
  drag the range minimum to 0 on real mountains. **Include** all interior cells,
  **rivers, and unburnt islands**: do **not** filter by `cell.isNonburnable`
  (`= isRiver || isUnburntIsland`, [cell.ts:66-68](../../src/models/cell.ts#L66-L68)),
  because rivers and islands carry real topographic `baseElevation` that legitimately
  belongs in the range — and the perimeter cells are themselves flagged
  `isUnburntIsland` ([simulation.ts:228](../../src/models/simulation.ts#L228)), so a
  flag-based filter cannot distinguish them from real islands; only border position
  can. (If `fillTerrainEdges` is off, no exclusion is needed.)
- R4. A unit-test sweep is added to
  [src/hazbot/wildfire/sim-props.test.ts](../../src/hazbot/wildfire/sim-props.test.ts)
  (matching the per-prop test style already in that file) with explicit coverage
  of:
  - the **`true` class**: one spark with normalized elevation ≥ 0.75 and the
    other ≤ 0.25;
  - each R3 **`false` sub-case**: both sparks at similar elevation, both near the
    top, both near the bottom, and flat / below-minimum-span terrain;
  - the **fail-closed guards** (R3 / OQ-3): undefined spark `elevation`, undefined
    `elevationRange`, undefined `heightmapMaxElevation`, and a spark count other
    than two;
  - **boundary values** at exactly 0.75 and 0.25 (inclusive per the ≥ / ≤
    definition in R2);
  - **minimum-span-floor boundaries**: a span just below the floor (returns
    `false`), exactly at the floor (returns `false`, per the at-or-below rule in
    R3), and just above it (a true top/bottom now qualifies).
- R5. Ruleset 25 Cat 6 is reachable in the validation playbook. Regenerate
  [docs/hazbot-validation/25.md](../../docs/hazbot-validation/25.md) via
  `node scripts/generate-hazbot-validation-playbook.js`. **Verified by a driven
  Playwright walk** against the regenerated playbook on `mountainTwoZoneFixedTerrain`
  (`?preset=mountainTwoZoneFixedTerrain&hazbotRules=25&hazbotSidebar=true`), the
  project's established per-ruleset validation workflow (CLAUDE.md). An automated
  Cypress e2e was considered and **dropped**: its only unique coverage over the unit
  layers is the thin, generic bottom-bar → `log` → `translate` → engine glue, and it
  concentrated disproportionate risk (wizard selectors, Reload re-gating, engine
  ingestion timing, a placement-helper basis); see implementation OQ-E. The walk
  waits for `sim.dataReady`, dismisses the Terrain Setup wizard, places the two
  **documented validated spark coordinates** (R11) via `window.sim.addSpark(...)`,
  clicks Start, and confirms the engine's matched category reaches **Cat 4**
  (mid-slope per-zone sparks via `window.test.placeSparkInZone`) and then the
  **Cat 6 success endpoint** (top/bottom sparks, uniform settings). The Cat 4 and
  Cat 6 placements are **separate endpoints that must each start from a clean spark
  state**: `addSpark` no-ops once both zones hold a spark, so the walk must **Reload**
  (clears sparks to the empty preset default) between them — Restart keeps sparks
  placed and would leave the Cat 6 `addSpark` calls inert (see implementation
  Definition of Done). The Cat 5
  transition (top/bottom + non-uniform zones) is covered by R10's synthetic unit
  layer, not walked in-app. The reader must check the engine's **matched category**,
  not the per-category truth icon: the sidebar's `✓`/`✗` status reflects whether a
  category's expression is currently true, which is **distinct from** the matched
  category (a monotonic floor) — [sidebar.test.tsx:189](../../src/hazbot/engine/sidebar/sidebar.test.tsx#L189)
  explicitly covers the two disagreeing. Read the matched row
  (`.hazbot-sidebar-category-matched`) in the sidebar; do **not** read the `▸ ✓ N`
  truth icon. This walk is the end-to-end counterpart to R10's fast rule-set unit
  tests, which stay as the deterministic synthetic-reading layer and carry the
  automated regression protection. **The walk must actually be run to close this
  requirement** (after the predicate + plumbing land — the predicate is a stub until
  then, so Cat 6 is unreachable).
- R6. No new `stub-warning` appears in the sidebar Errors panel when ruleset 25
  is loaded (the `SparksAtTopAndBottom` stub-warning is gone). **Verified by** a
  unit/registry assertion that asserts **all** of the following — because the
  engine suppresses stub-warnings when a load-blocking error exists
  ([engine.ts:243](../../src/hazbot/engine/engine.ts#L243)), so a "no stub-warning"
  check alone can pass for the wrong reason (a broken load):
  1. loading ruleset 25 produces **no load-blocking errors**;
  2. **no `stub-warning` EngineError** is emitted for `SparksAtTopAndBottom`; and
  3. `simProps.SparksAtTopAndBottom.isStub` is not truthy (the flag was actually
     removed, independent of the engine's emission logic).
- R7. The chosen detection must work for the topography ruleset 25 actually runs
  on during validation — **`mountainTwoZoneFixedTerrain`** (a 2-zone mountain
  preset with fixed elevation variation, per OQ-2) — and must return `false` on a
  flat topography (`plainsTwoZone`). **Verified by** the same driven Playwright walk
  as R5 that, on `plainsTwoZone`, places one spark per zone with **ordinary
  `window.test.placeSparkInZone(0)` / `placeSparkInZone(1)`** (no band placement on
  flat terrain — see R11) and the same zone settings, then confirms the matched
  category caps at Cat 4 and Cat 6 stays unreachable. Placement band is irrelevant
  here because the predicate returns `false` on flat terrain regardless of where the
  sparks land.
  The
  predicate's flat-terrain logic itself is unit-tested at the predicate level via
  the synthetic below-minimum-span fixture in R4; an assertion against the *real*
  `elevationRange` computed for `plainsTwoZone` is **not** required here, because
  that span depends on the cell-construction / heightmap-decode path, which the R4
  unit harness (hand-built `mkRead()` readings) does not exercise and the
  Jest/jsdom environment generally cannot run (see the 3rd-pass QA self-review item).
- R8. Correct the ruleset 25 validation entry in
  [docs/hazbot-validation/localhost-urls.md](../../docs/hazbot-validation/localhost-urls.md)
  from `preset=mountainTwoZone` to `preset=mountainTwoZoneFixedTerrain` (per
  OQ-2), updating **both** occurrences: the table row at
  [line 19](../../docs/hazbot-validation/localhost-urls.md#L19) and the summary
  row at [line 166](../../docs/hazbot-validation/localhost-urls.md#L166).
  Both presets resolve to the same `mountains-mountains-heightmap.png` (when
  `config.elevation` is absent, `getElevationData()` derives it from the zones'
  terrain types — [data-loaders.ts:33-47](../../src/models/utils/data-loaders.ts#L33-L47)),
  so this is **not** about `mountainTwoZone` lacking elevation. The reason to pin
  `mountainTwoZoneFixedTerrain` is that its literal `config.elevation`
  ([presets.ts:267-273](../../src/presets.ts#L267-L273)) both fixes the heightmap
  and **disables terrain-type editing** — the `TerrainTypeSelector` renders only
  when `!config.elevation && zones.length === 2`
  ([terrain-panel.tsx:277-280](../../src/components/terrain-panel.tsx#L277-L280)).
  On `mountainTwoZone` a student could change a zone's terrain type, re-derive a
  different heightmap, and break the walk; the fixed preset guarantees a
  deterministic Cat 4 → 5 → 6 progression.
- R9. The bridge plumbing that carries the two new fields to the predicate has
  automated coverage (R4 exercises only the predicate against hand-built readings,
  so a dropped field would pass R4 yet fail closed in production):
  - **`translate()` forwarding** — in
    [translate.test.ts](../../src/hazbot/wildfire/translate.test.ts): a
    `SimulationStarted` event whose `data` carries `elevationRange` and
    `heightmapMaxElevation` yields a reading with **both** fields populated; and
    `SimulationEnded` / `SimulationStopped` readings carry **neither** (matching
    the "only `SimulationStarted`" decision in the Payload-assembly Technical Note).
  - **Payload computation** — the `SimulationStarted` payload must (i) include
    `elevationRange = {min, max}` derived from `cell.baseElevation` with only the
    `fillTerrainEdges` border cells excluded (per the R3 "Exact exclusion rule");
    (ii) read each spark's elevation from `baseElevation`, not the dynamic
    `cell.elevation` getter; and (iii) carry `heightmapMaxElevation` via the generic
    config snapshot. To make these unit-testable, the topography-dependent payload
    assembly is **extracted from `handleStart` into a pure
    `SimulationModel.buildStartReadingData()` method** (`handleStart` becomes thin
    glue that spreads the result), and verified **at the model level**:
    - **(i)** a pure unit test of `simulation.baseElevationRange` (min/max of
      `baseElevation`, edge cells excluded, rivers/islands included, `null` on no
      finite elevation).
    - **(ii)** a unit test of `buildStartReadingData()` that places a spark on a
      **dug fire-line cell** (where `cell.elevation === baseElevation − FIRE_LINE_DEPTH`)
      and asserts the returned spark `elevation` equals `baseElevation`, not the
      reduced `elevation` — this is the assertion that actually pins the
      `cell.elevation` → `cell.baseElevation` switch. (The replay fixture does **not**
      exercise this: `generate-replay-fixture.js` hand-builds the event data and never
      runs `handleStart`; and the no-fire-line Playwright walk cannot distinguish the two
      getters, since they differ only on dug cells.) **Also** assert that a spark placed
      on an excluded `fillTerrainEdges` perimeter cell (artificial `baseElevation: 0`)
      is reported with `elevation: undefined`, so its edge zero can never normalize to a
      spurious "bottom" (Finding 1 / R3 edge-cell fail-closed). The predicate's R4 sweep
      additionally covers the out-of-`[min, max]` defense-in-depth guard.
    - **(iii)** covered by the `translate()` forwarding tests above, since
      `heightmapMaxElevation` rides through the generic config snapshot and the only
      WM-15-specific work is `translate()` carrying it.
    (See implementation OQ-A, resolved C → A after self-review Finding 3.)
- R10. The ruleset 25 category tests
  ([src/hazbot/rule-sets/25.test.ts](../../src/hazbot/rule-sets/25.test.ts)) are
  updated so Cat 5 and Cat 6 — currently excluded as stub-gated — get automated
  coverage. This is the fast, synthetic-reading unit layer beneath R5's full-app
  driven Playwright walk, and is the **automated** regression guard (the walk is
  run manually): both guard against a later predicate/ruleset regression silently
  making the success category unreachable again, at different cost/fidelity tiers:
  - per-category coverage exercises **Cat 4, Cat 5, and Cat 6** with readings that
    include spark `elevation` values, `elevationRange`, and `heightmapMaxElevation`
    (Cat 4 = one spark per zone but not top/bottom; Cat 5 = top/bottom with
    non-uniform zone settings; Cat 6 = top/bottom with uniform zone settings);
  - the stale header comment ("`SparksAtTopAndBottom` is a stub … cats 5 & 6
    excluded") and the test-(e) assertion that a fully-satisfying state never
    matches cat 5/6 are removed or replaced, since both are false once the
    predicate is implemented.
- R11. The **mountain** Cat 4 → 6 walk (R5) is made **deterministic** so it
  doesn't depend on tester judgment about where "top" and "bottom" fall, using
  **documented validated spark coordinates** (no placement helper ships — Option b
  below was chosen over a `window.test` helper; see implementation OQ-E / OQ-D). The
  existing `window.test.placeSparkInZone(zoneIdx)` helper places at the *zone center*,
  whose normalized elevation is not guaranteed to land in the top-25% / bottom-25%
  bands; the documented coordinates target the bands directly. (R7's flat-terrain walk
  uses ordinary `placeSparkInZone` — on flat terrain any per-zone placement is fine and
  the predicate returns `false` regardless.)
  - **Documented coordinates** for `mountainTwoZoneFixedTerrain`, validated against
    the running app (2026-06-03) and recorded in the Playwright section of
    [CLAUDE.md](../../CLAUDE.md). They are **not** recorded in
    [25.md](../../docs/hazbot-validation/25.md): that playbook is auto-generated
    (its banner reads "AUTO-GENERATED — DO NOT EDIT") and the generator has no
    spark-coordinate input, so any coordinates written there are clobbered by the
    R5/R8 regeneration step. Global `baseElevationRange` ≈ `{ min 1096, max 19450 }`
    ft (span ≈ 18353 ft, clears the 1000 ft floor). **Top spark → zone 1**: model
    `(119000, 38000)`, normalized `(x≈0.99, y≈0.48)`, normalized elevation **1.00**.
    **Bottom spark → zone 0**: model `(59000, 3500)`, normalized `(x≈0.49, y≈0.04)`,
    normalized elevation **0.00**. Both round-trip through `addSpark` → `cellAt` into
    the intended zones and bands (verified live). **Zone-geometry note**: zone 1 is the
    high zone (851 cells in the top band, reaching normalized 1.0); zone 0 is the low
    zone (max normalized only 0.811 on ~40 cells), so the robust direction is
    top→zone 1 / bottom→zone 0, **not** the reverse. These coordinates are specific to
    this preset's heightmap; if it changes they must be re-derived (the literal
    `config.elevation` that disables terrain editing per R8 keeps it stable).

## Technical Notes

- **Sim-prop contract**:
  `SimPropImpl<WildfireReading, WildfireDefaults>` with `defaultValue: false`
  and `evaluate(reading, defaults) => boolean`
  ([engine/types.ts:64](../../src/hazbot/engine/types.ts#L64)). The engine's
  `safely-evaluate-impl` wrapper falls back to `defaultValue` if `evaluate`
  throws, but the predicate should still guard its own inputs.
- **Registration**: add nothing new to the registry — `SparksAtTopAndBottom` is
  already a key in the `simProps` export
  ([sim-props.ts:230](../../src/hazbot/wildfire/sim-props.ts#L230)); only its
  body and the `isStub` flag change.
- **Payload assembly** (required by OQ-1 → Option B). The two fields the predicate
  needs require *asymmetric* work — do not treat them as a symmetric pair:
  - `elevationRange = {min, max}` is **not** a config key. Compute the grid's
    elevation extrema (`min`/`max` of `cell.baseElevation`, excluding **only** the
    `fillTerrainEdges` border cells by grid position and **including** rivers /
    unburnt islands — see the R3 "Exact exclusion rule") where the live simulation
    is available in
    [bottom-bar.tsx:231](../../src/components/bottom-bar.tsx#L231) and attach it
    explicitly to the `SimulationStarted` payload. In the same place, switch the
    per-spark elevation read from `cell?.elevation` to `cell?.baseElevation`
    ([bottom-bar.tsx:236](../../src/components/bottom-bar.tsx#L236)) so the spark
    values and the range share the immutable-topography basis.
  - `heightmapMaxElevation` (the per-preset max; `config` is in scope at this site
    but not in the predicate, per the Background constraint) needs **no** new line
    here: the payload-build site already snapshots every config scalar via the
    generic loop at
    [bottom-bar.tsx:219-225](../../src/components/bottom-bar.tsx#L219-L225)
    (`Object.entries(config)` → `configSnapshot[key] = value`), and
    `heightmapMaxElevation` is a plain config number
    ([config.ts:43](../../src/config.ts#L43)), so it is already in the logged
    payload as `configSnapshot.heightmapMaxElevation`.

  The gating change for **both** fields is therefore `translate()`, which today
  forwards only `zones`, `sparks`, `fireLineMarkers`, `wind` and drops every other
  `data` key — including the `heightmapMaxElevation` already sitting in `data`. Add
  both fields to the `WildfireReading` type and copy both in `translate()`'s
  `SimulationStarted` case to reach the predicate — and **only**
  `SimulationStarted`: the predicate binds (via
  `WITH`) to the run-start reading, and the `SimulationEnded`/`SimulationStopped`
  readings carry only `outcome` ([translate.ts:30](../../src/hazbot/wildfire/translate.ts#L30)),
  so elevation data on an end-event would be unreachable. The predicate normalizes
  each spark's `elevation` as `(elevation - min) / (max - min)` and compares
  against the top/bottom 25% thresholds; it derives the flat-terrain floor as a
  named, tunable fraction of `reading.heightmapMaxElevation` and treats the terrain
  as flat (returns `false`) when `max - min` is at or below that floor.
- **Existing-prop precedent**: props like `OneSparkPerZone`,
  `UniformZoneSettings`, and `DefaultVars` all fail closed on undefined fields
  and zone/spark-count mismatches; the new prop should follow the same defensive
  style and document its sheet-vs-config source of truth in a header comment, as
  the neighbors do.
- **Stub-warning mechanism**: removing `isStub: true` removes the
  `stub-warning` EngineError ([engine/types.ts:81](../../src/hazbot/engine/types.ts#L81)).
  The existing stub test in `sim-props.test.ts:142` must be replaced with real
  behavior tests.
- **Heightmaps**: elevation comes from per-topography heightmap PNGs
  ([data-loaders.ts](../../src/models/utils/data-loaders.ts)); white = high,
  black = low, scaled to `config.heightmapMaxElevation`. `mountainTwoZone`,
  `mountainTwoZoneFixedTerrain`, and `shrubThreeZone`'s Mountains zone carry real
  elevation variation; `plainsTwoZone` is flat.
- **No app-side a11y surface** is in scope here (this is engine-bridge logic,
  not UI).

## Out of Scope

- Building the student-facing Hazbot UI (launcher, feedback panel, confetti for
  Cat 6) — separate feature, see [TBD.md §5](../../src/hazbot/TBD.md).
- The `Helitack` stub (deferred to WM-28) and any other stubbed impl.
- Paired-run DSL or other engine-substrate changes
  ([TBD.md §6](../../src/hazbot/TBD.md)).
- Re-extracting or editing ruleset 25's generated category/expression content —
  the rule-set file is auto-generated and the expressions already reference
  `SparksAtTopAndBottom` correctly.
- Engine extraction into a standalone package ([TBD.md §8](../../src/hazbot/TBD.md)).
- Tuning the top/bottom tolerance and minimum-span constants against real student
  data: 25% (and the chosen minimum-span floor) ship as initial values; adjusting
  them once observed in action is a later, separate change.

## Open Questions

<!-- Requirements-focused only. This is a requirements-only spec (no implementation.md);
     the concrete initial thresholds live inline in R2 (25% tolerance) and R3 (5%
     minimum-span fraction). -->

### RESOLVED (OQ-1): Which detection approach defines "near the top" and "near the bottom"?
**Context**: This is the central decision and drives acceptance criteria, test
fixtures, and whether the `SimulationStarted` payload must change. A sim-prop
only sees the two sparks (`x`, `y`, `zoneIdx`, `elevation`) plus defaults — not
the elevation grid or preset identity (see Background → "Critical constraint on
available data").

**Options considered**:
- A) **Relative elevation gap between the two sparks** (no payload change). Require
  exactly two sparks with defined elevations and `|eHigh - eLow| ≥ T`, where `T`
  is an absolute foot threshold (or a fraction of `heightmapMaxElevation`, which
  is a scalar already in the snapshot). Simplest; zero bridge/payload changes.
  Risk: two mid-slope sparks with a large gap pass even if neither is truly at a
  ridge or valley; not anchored to the topography's actual extent.
- B) **Normalize spark elevations against the topography's actual elevation
  extrema, attached to the payload** (Recommended). At payload-build time compute
  the grid's min & max `cell.elevation`, attach as e.g. `elevationRange = {min,
  max}` to `SimulationStarted`; the predicate marks the higher spark "near ridge"
  when its normalized elevation `≥ HIGH` and the lower "near valley" when `≤ LOW`
  (thresholds TBD in implementation). Topography-aware, unit-testable in the
  sim-prop, and fails closed on flat terrain (range ≈ 0). Cost: add a field to
  the payload, `WildfireReading`, and `translate()`.
- C) **Per-preset pre-traced ridge/valley polylines** (ticket's lean). Author
  ridge & valley polylines per topography, thread topography identity into the
  payload, and test each spark's normalized `(x, y)` distance to the nearest
  line. Most faithful to literal "ridge/valley lines"; highest authoring +
  plumbing cost; must be re-authored per new mountain preset.

**Decision**: **B** (PI-confirmed, 2026-06-02). Normalize each spark's elevation
against the topography's actual elevation extrema, attached to the
`SimulationStarted` payload. The payload + `WildfireReading` + `translate()`
changes needed to carry **two** fields are confirmed in scope for this story:
`elevationRange = {min, max}` (computed at the payload site) **and**
`heightmapMaxElevation` (the per-preset max the R3 minimum-span floor is computed
against — it rides along via the generic config snapshot, so the work for it is
the `WildfireReading` + `translate()` plumbing; see the Payload-assembly Technical
Note). Omitting `heightmapMaxElevation` would trip the predicate's fail-closed
guard (R3) and break the flat-terrain floor. **Tolerance**: a spark counts as "near the top" when its normalized
elevation falls in the top 25% of the range (≥ 0.75) and "near the bottom" when
in the bottom 25% (≤ 0.25). 25% is a deliberately generous default; the PI
guidance is "greater than 10%, much less than 50%, may need tweaking once seen in
action", so it is implemented as a single named, tunable constant. Flat terrain
(range ≈ 0) must never count — this falls out of the normalization and satisfies
the fail-closed requirement (R3).

**Accepted tradeoff**: because detection is by normalized elevation rather than
visual ridge/valley geometry (Option C was declined), a spark placed at the
*apparent* ridge but below the top quartile is classified as "not at top" (and
likewise at the bottom). The tunable tolerance plus the Hazbot coaching copy are
expected to absorb this; validating the misclassification rate against real
student runs is out of scope (see the Out of Scope tuning bullet).

### RESOLVED (OQ-2): What is the canonical topography/preset for ruleset 25, and is it consistent?
**Context**: [localhost-urls.md](../../docs/hazbot-validation/localhost-urls.md)
currently runs ruleset 25 against `preset=mountainTwoZone` (table row
[line 19](../../docs/hazbot-validation/localhost-urls.md#L19) and summary
[line 166](../../docs/hazbot-validation/localhost-urls.md#L166)). That is a 2-zone
mountain preset — consistent with ruleset 25 reading as a **2-zone** activity
(Cats 2–3 reference "Zone 1 and Zone 2", `UniformZoneSettings` /
`OneSparkPerZone` assume two zones, the rule text says "top and bottom of the
**mountain**"). The problem is **determinism**, not elevation source or zone
count: `mountainTwoZone` declares no literal `elevation`
([presets.ts:260-266](../../src/presets.ts#L260-L266)), but `getElevationData()`
derives the same `mountains-mountains-heightmap.png` from its zone terrain types
([data-loaders.ts:33-47](../../src/models/utils/data-loaders.ts#L33-L47)) — so it
*does* have a real ridge/valley. The catch is that, with no literal
`config.elevation`, the `TerrainTypeSelector` stays enabled
([terrain-panel.tsx:277-280](../../src/components/terrain-panel.tsx#L277-L280)), so
a student can edit a zone's terrain type and re-derive a different heightmap
mid-walk. (An earlier revision of this doc used the 3-zone `shrubThreeZone`, which
added a zone-count mismatch on top; it has since been changed to `mountainTwoZone`.)
This affects which topography the predicate must return `true`/`false` on and how
Cat 6 is validated.

**Options considered**:
- A) **Ruleset 25 should validate against a 2-zone mountain preset with fixed
  (non-editable) terrain** (`mountainTwoZoneFixedTerrain`); the current
  `mountainTwoZone` entry in localhost-urls.md leaves terrain editable (the
  derived heightmap can change mid-walk) and should be corrected as part of this
  story.
- B) **`shrubThreeZone` is intentional**; the predicate must work on its
  Mountains→Foothills→Plains gradient and the 2-zone assumptions elsewhere are
  handled by a `zonesCount`/URL override. Clarify how the 3-zone preset reconciles
  with the 2-zone rule expressions.
- C) **Topography-agnostic by design**: the predicate must return `true` on any
  topography with a real ridge/valley and `false` on flat terrain, so the exact
  preset only matters for the playbook walk, not the algorithm. Pick whichever
  preset gives a clean Cat 4→5→6 walk and note it.

**Decision**: **A** (PI/dev-confirmed, 2026-06-02). Ruleset 25 is a **2-zone
mountain activity** and validates against **`mountainTwoZoneFixedTerrain`**. The
current `mountainTwoZone` entry in
[localhost-urls.md](../../docs/hazbot-validation/localhost-urls.md) derives the
same heightmap but leaves terrain editable, so the walk is not deterministic; it
is corrected to `mountainTwoZoneFixedTerrain` as part of this story (see R8).
`mountainTwoZoneFixedTerrain` carries real elevation variation (so a genuine
top/bottom exists) and pins it via a literal `config.elevation` that also disables
the `TerrainTypeSelector` (so the validation walk is deterministic). The
fail-closed/flat-terrain check (R3/R7) is validated against `plainsTwoZone`.

### RESOLVED (OQ-3): Should the predicate enforce its own spark-count / distinct-zone preconditions?
**Context**: In ruleset 25, every category that uses `SparksAtTopAndBottom` also
ANDs `OneSparkPerZone` (which already requires exactly two sparks in distinct
zones). The predicate could rely on that and check only elevation, or it could
fail closed independently (as `OneSparkPerZone`, `TwoSparks`, and `Fireline`
do). Independent guards make the prop safe to reuse in future rule-sets and make
unit tests self-contained, at the cost of a little redundancy with the rule
expression.

**Options considered**:
- A) **Self-contained guards** (Recommended, matches existing props): require
  exactly two sparks, both with defined `elevation`; return `false` otherwise,
  regardless of the surrounding expression.
- B) **Elevation-only**: assume upstream `OneSparkPerZone`/`TwoSparks` filtering
  and check elevation alone; lighter but couples the prop to ruleset 25's shape.

**Decision**: **A** (dev-confirmed, 2026-06-02). Self-contained guards, matching
the existing props (`OneSparkPerZone`, `TwoSparks`, `Fireline`): the predicate
requires exactly two sparks, all of defined `elevation`, defined `elevationRange`,
and defined `heightmapMaxElevation` (the last needed for the minimum-span floor,
per R3); it returns `false` otherwise, independent of the surrounding rule
expression. This keeps the prop safe to reuse in future rule-sets and the
unit-test sweep (R4) self-contained.

**Distinct-zone validation is intentionally delegated to `OneSparkPerZone`**, not
duplicated here. `SparksAtTopAndBottom` is purely elevation-based and never
inspects `zoneIdx`: two same-zone sparks placed at top & bottom would return
`true` from this predicate *in isolation*, with zone-distinctness enforced by the
surrounding expression (every ruleset-25 category that uses it ANDs
`OneSparkPerZone`, which already requires the two sparks in distinct zones). So
the predicate's reusable contract is "one spark near the top and one near the
bottom of the elevation range," and callers needing per-zone placement compose it
with `OneSparkPerZone` — keeping the two concerns orthogonal rather than coupling
zone logic into the elevation predicate.

## Self-Review

### Senior Engineer

#### RESOLVED: "Flat / degenerate" boundary is undefined at the requirements level
**Resolution**: R3 now requires a named, tunable minimum-span floor, derived in
the predicate as a fraction of `heightmapMaxElevation` (carried on the reading —
see the 2nd-pass Senior Engineer item below for why it is not read from `config`);
the predicate returns `false` when `max - min` is at or below that floor.
Technical Notes updated to match.

R3 says flat topography "never counts" when the elevation range is "≈ 0", and
the Technical Notes say to "guard `max - min ≈ 0`". But the requirements never
say how flat is flat enough to disqualify a run. Real heightmap PNGs carry
quantization noise (256 levels scaled to `heightmapMaxElevation`), so a nominally
"flat" plains preset may report a small but non-zero `max - min`, and a gently
rolling preset sits somewhere between plains and `mountainTwoZoneFixedTerrain`.
Without a stated minimum elevation span (an absolute foot floor, or a fraction of
`heightmapMaxElevation`), "≈ 0" is unspecified and two implementers could draw
the line differently. Suggested resolution: state a requirements-level
minimum-span rule (e.g. "the predicate returns `false` unless `max - min` exceeds
N ft / N% of `heightmapMaxElevation`") and make it the same tunable-constant
class as the 25% tolerance, OR explicitly state that only exact `max - min == 0`
disqualifies and rolling terrain is acceptable.

---

### QA Engineer

#### RESOLVED: R4 does not enumerate the required test scenarios
**Resolution**: R4 expanded to require explicit coverage of the `true` class,
each R3 `false` sub-case, the OQ-3 fail-closed guards, and the 0.75 / 0.25
boundary values.

R4 asks for "a unit-test sweep … covering both the `true` class and the `false`
class". R3 already names four distinct false sub-cases (similar elevation, both
top, both bottom, indeterminate top/bottom) plus the fail-closed cases (undefined
elevations, undefined `elevationRange`, fewer than two sparks). As written, a
sweep that tested one `true` and one `false` case would technically satisfy R4
while leaving most of R3's behavior unverified. Suggested resolution: expand R4
to require explicit coverage of (a) each R3 false sub-case, (b) the fail-closed
guards from OQ-3 Option A, and (c) boundary values at exactly the 0.75 / 0.25
thresholds (inclusive per the ≥ / ≤ definition).

#### RESOLVED: R5 and R6 state outcomes but no verification mechanism
**Resolution**: R6 now specifies an automated unit/registry assertion (no
`stub-warning` for `SparksAtTopAndBottom` when ruleset 25 loads); R5 now
specifies a manual Playwright playbook walk through Cat 4 → 5 → 6 on
`mountainTwoZoneFixedTerrain`. *(Later superseded: R5 was upgraded to an automated
Cypress e2e asserting the engine's `matchedCategory` walks 4 → 5 → 6, with the
manual Playwright walk kept as fallback — see current R5/R11. R6 was further
strengthened to also assert no load-blocking errors and `isStub` falsy.)*

R5 ("Cat 6 reachable in the validation playbook") and R6 ("no new stub-warning
… when ruleset 25 is loaded") are acceptance criteria with no stated way to
confirm them. R6 in particular is checkable two ways (a unit assertion that
`SparksAtTopAndBottom.isStub` is falsy, vs. a manual sidebar inspection) and the
spec should pick one so "done" is unambiguous. Suggested resolution: note for
each how it is verified (e.g. R6 → unit/registry assertion that no `stub-warning`
EngineError is produced for ruleset 25; R5 → manual Playwright playbook walk to
Cat 6, or a replay-fixture assertion).

---

### Product Manager

#### RESOLVED: Is the initial 25% tolerance shippable, or is PI tuning a release blocker?
**Resolution**: Out of Scope now states 25% (and the minimum-span floor) ship as
initial values; tuning against real student data is a later, separate change.

R2 fixes the tolerance at 25% as a "deliberately generous default" and a "tunable
constant", with PI guidance that it "may need tweaking once seen in action". It
is unclear whether shipping at 25% is acceptable as-is (tuning is a later,
separate adjustment) or whether a tuning pass against real student runs is part
of this story's definition of done. Suggested resolution: state explicitly that
25% ships as the initial value and tuning is out of scope for WM-15 (with a
pointer to where future tuning would happen), or add a requirement covering the
tuning pass.

---

### Education Researcher

#### RESOLVED: Elevation-quartile detection may diverge from the student's visual notion of "top/bottom of the mountain"
**Resolution**: Accepted-tradeoff note appended to the OQ-1 decision block;
misclassification-rate validation confirmed out of scope.

OQ-1 deliberately chose normalized-elevation thresholding (Option B) over
pre-traced ridge/valley polylines (Option C). A consequence is that the predicate
classifies on absolute height within the global elevation range, not on visual
ridge/valley geometry: a spark a student places at what *looks* like the ridge
but which sits at, say, 0.72 normalized elevation is classified as "not at the
top", and the student is coached (Cat 4) as if they missed the intent. Because
this predicate gates pedagogical feedback, systematic false negatives could
mis-coach students who actually understood the task. This tradeoff is implicit in
the OQ-1 decision but not surfaced as an accepted risk. Suggested resolution: add
a brief note (Background or Out of Scope) acknowledging the
detection-vs-mental-model gap and that the tunable tolerance plus coaching copy
are expected to absorb it; confirm no telemetry/validation of misclassification
rate is required for this story.

---

<!-- Second review pass (2026-06-02): findings against the updated requirements. -->

### Senior Engineer (2nd pass)

#### RESOLVED: The minimum-span floor is defined against `config.heightmapMaxElevation`, which the predicate cannot see — and which varies per preset
**Resolution** (Option C / C1, user-confirmed 2026-06-02): `heightmapMaxElevation`
is now carried on the `SimulationStarted` payload alongside `elevationRange`. Note
(per the 3rd-pass Senior-Engineer item below) it needs no new line at the
payload-build site — the generic config-snapshot loop
([bottom-bar.tsx:219-225](../../src/components/bottom-bar.tsx#L219-L225)) already
emits it; the gating change is forwarding it through `translate()` and adding it to
`WildfireReading`. The predicate keeps the tunable floor *fraction* as a
named constant next to the 25% tolerance and computes
`floor = fraction × reading.heightmapMaxElevation` — so the floor scales correctly
on presets that override the max (3000 / 10000 / 20000). R3, the Payload-assembly
Technical Note, and the `WildfireReading`/`translate()` change list updated to add
the `heightmapMaxElevation` field.

R3, the Technical Notes, and the prior Senior-Engineer resolution all define the
flat-terrain floor as "a small fraction of `config.heightmapMaxElevation`". But
the spec's own central constraint (Background → "Critical constraint on available
data") is that `evaluate(reading, defaults)` sees **only** the witness reading and
the derived defaults — **not** `config`, and not `heightmapMaxElevation`. So as
written the floor cannot be computed where R3 says it lives. Worse,
`heightmapMaxElevation` is **not** a global constant: it defaults to `20000`
([config.ts:126](../../src/config.ts#L126)) but individual presets override it to
`3000` and `10000` ([presets.ts:38](../../src/presets.ts#L38),
[presets.ts:55](../../src/presets.ts#L55)). So a floor hard-coded as
`fraction × 20000` at authoring time would be silently wrong on any preset that
overrides the max, defeating "a small fraction of heightmapMaxElevation". This
mirrors the OQ-1 decision, which deliberately added `elevationRange` to the
payload precisely because raw config was unreachable. Suggested resolution, pick
one and state it in R3 + Technical Notes:
- A) Define the floor as a fraction of the **span actually on the reading**
  (`max - min` of `elevationRange`) — but a fraction-of-span floor can never
  disqualify (the span is always 100% of itself), so this only works as an
  **absolute** foot floor, not a fraction of the same span.
- B) Define the floor as an **absolute foot constant** (e.g. `MIN_ELEVATION_SPAN_FT
  = 1000`), independent of `heightmapMaxElevation`. Simplest; no payload change.
- C) If the floor must scale with `heightmapMaxElevation`, thread
  `heightmapMaxElevation` (or the pre-multiplied floor) into the
  `SimulationStarted` payload alongside `elevationRange`, and add it to the
  Payload-assembly Technical Note and the `WildfireReading`/`translate()` change
  list (currently only `elevationRange` is listed).

---

### QA Engineer (2nd pass)

#### RESOLVED: R7's "must return `false` on `plainsTwoZone`" has no verification mechanism and rests on an unverified flat-span assumption
**Resolution** (Option B, user-confirmed 2026-06-02; **superseded** by the 3rd-pass
QA item below): this pass specified a test asserting the `elevationRange` span
produced for `plainsTwoZone` is at or below the minimum-span floor. The 3rd pass
found that assertion has no runnable home (the R4 unit harness never builds a cell
grid, and heightmap decode is unavailable under Jest/jsdom), so R7's flat-terrain
check was changed to a manual Playwright walk confirming Cat 6 stays unreachable on
`plainsTwoZone`, with the predicate's flat logic unit-tested via the synthetic
below-minimum-span fixture in R4.

The prior QA pass gave R5 and R6 explicit verification mechanisms, but R7 added a
second testable claim — the predicate "must return `false` on a flat topography
(`plainsTwoZone`)" — without one. R4's unit sweep covers a **synthetic**
"flat / below-minimum-span" reading, not the actual `plainsTwoZone` preset, so
nothing confirms that `plainsTwoZone`'s real elevation span lands at or below the
chosen floor. `plainsTwoZone` declares no `elevation` source
([presets.ts:275](../../src/presets.ts#L275)), so its `elevationRange` depends on
whatever default the cell grid produces; if that span is non-trivial, R7's flat
case could fail even though the unit tests pass. Suggested resolution: give R7 a
verification mechanism parallel to R5/R6 — either a manual Playwright check that
Cat 6 stays unreachable on `plainsTwoZone`, or (better) an assertion against the
computed `elevationRange` for `plainsTwoZone` that its span is at or below the
minimum-span floor — and state that explicitly so the flat-terrain guarantee is
checked end-to-end, not just on synthetic fixtures.

---

<!-- Third review pass (2026-06-02): findings against the twice-revised requirements,
     grounded in the referenced source (bottom-bar.tsx, translate.ts, types.ts,
     presets.ts, sim-props.test.ts). -->

### Senior Engineer (3rd pass)

#### RESOLVED: `heightmapMaxElevation` is already in the `SimulationStarted` payload — the spec's "attach it at the payload-build site" instruction is redundant and risks a misread of where the real work is
**Resolution** (Option A, user-confirmed 2026-06-02): the Payload-assembly
Technical Note now spells out the asymmetry — `elevationRange` is computed and
attached explicitly at the payload site, while `heightmapMaxElevation` is already
snapshotted by the generic config loop and needs no new line; the gating change for
both is `translate()` forwarding + the `WildfireReading` type. The 2nd-pass
Senior-Engineer resolution it referenced is annotated to match.

The Payload-assembly Technical Note and the 2nd-pass Senior-Engineer resolution
both instruct attaching `heightmapMaxElevation = config.heightmapMaxElevation` at
[bottom-bar.tsx:231](../../src/components/bottom-bar.tsx#L231), as if it were a new
field to add next to `elevationRange`. But the payload-build site already snapshots
**every** config scalar via the generic loop at
[bottom-bar.tsx:219-225](../../src/components/bottom-bar.tsx#L219-L225)
(`for (const [key, value] of Object.entries(config))` → `configSnapshot[key] = value`).
`heightmapMaxElevation` is a plain config number
([config.ts:43](../../src/config.ts#L43), default
[config.ts:126](../../src/config.ts#L126)), so it is **already present** in the
logged payload as `configSnapshot.heightmapMaxElevation`. The genuinely-new work
is asymmetric between the two fields:
- `elevationRange` is **not** a config key — it must be computed (min/max of
  `cell.elevation`) and explicitly added at the payload site.
- `heightmapMaxElevation` needs **no** new line at the payload site; what it needs
  is to be (a) added to the `WildfireReading` type and (b) **forwarded in
  `translate()`** — which today copies only `zones`, `sparks`, `fireLineMarkers`,
  `wind` ([translate.ts:18-27](../../src/hazbot/wildfire/translate.ts#L18-L27)) and
  drops every other `data` key, including the `heightmapMaxElevation` already
  sitting in `data`.

Why it matters: an implementer following the note literally would add a duplicate
line, and — more consequentially — the note frames the bottom-bar edit as the
crux while the actual gating change for *both* fields is the `translate()`
forwarding, which the note mentions only in passing. Suggested resolution: correct
the Payload-assembly Technical Note (and the 2nd-pass resolution it references) to
state that `heightmapMaxElevation` is already snapshotted generically and only
needs `WildfireReading` + `translate()` plumbing, while `elevationRange` needs all
three (compute at payload site + type + `translate()`).

---

### QA Engineer (3rd pass)

#### RESOLVED: R7's preferred verification (assert `plainsTwoZone`'s real `elevationRange` span ≤ floor) cannot run in the R4 unit-test harness as written
**Resolution** (Option C, user-confirmed 2026-06-02): R7's flat-terrain check is now
a manual Playwright walk confirming Cat 6 stays unreachable on `plainsTwoZone`
(parallel to R5's Cat 4 → 5 → 6 walk); the "checked at its source" claim is dropped.
The predicate's flat logic remains unit-tested at the predicate level via R4's
synthetic below-minimum-span fixture. The superseded 2nd-pass QA resolution is
annotated accordingly. *(Later superseded: R7's flat-terrain check was upgraded to
an automated Cypress e2e — using ordinary `placeSparkInZone`, since the band helper
does not apply on flat terrain — asserting the matched category caps at Cat 4, with
the manual Playwright check kept as fallback. See current R7/R11.)*

R7 and its 2nd-pass QA resolution settle on "a test that asserts the
`elevationRange` span produced for `plainsTwoZone` is at or below the minimum-span
floor." But the only test home the spec names is the per-prop sweep in
[sim-props.test.ts](../../src/hazbot/wildfire/sim-props.test.ts) (R4), which is a
pure predicate-level suite driven by hand-built `mkRead()` mock readings — it never
instantiates a `SimulationModel` or builds a cell grid. Producing the *actual*
`elevationRange` for `plainsTwoZone` requires running the cell-construction path
(and, for the mountain presets, decoding a heightmap PNG via the data-loaders),
which is not exercised — and PNG/canvas decoding is generally unavailable in the
Jest/jsdom environment this suite runs in. So the verification R7 prefers does not
fit the harness R4 establishes, and the spec doesn't say where it *does* live.

Note also: `plainsTwoZone` declares no `elevation` source
([presets.ts:275-281](../../src/presets.ts#L275-L281)), so its cells likely report a
uniform default elevation (span ≈ 0) — which is exactly why the flat guarantee
holds — but "likely" is the point: nothing in the named test harness pins it.
Suggested resolution: specify the test vehicle explicitly. Options:
- A) Move R7's `plainsTwoZone` span assertion to an integration/Cypress test (where
  a real simulation + heightmap load is available), keeping R4 as the synthetic
  predicate sweep.
- B) If a headless cell-grid build is feasible without PNG decoding for the
  no-`elevation` plains case, state that and cite the helper used.
- C) Downgrade R7's flat check to the manual Playwright "Cat 6 stays unreachable on
  `plainsTwoZone`" walk (parallel to R5) and drop the claim that it is checked "at
  its source," since the source-level assertion has no runnable home.
