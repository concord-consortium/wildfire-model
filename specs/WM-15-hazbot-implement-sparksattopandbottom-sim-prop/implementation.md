# Implementation Plan: Hazbot — Implement SparksAtTopAndBottom sim-prop

**Jira**: https://concord-consortium.atlassian.net/browse/WM-15
**Requirements Spec**: [requirements.md](requirements.md)
**Status**: **In Development**

## Implementation Plan

The work splits into a bottom-up bridge chain (type → forwarding → payload), the
predicate itself, then the test/automation/docs layers that prove it. Each step
is an independently reviewable commit and builds only on steps above it.

Source-of-truth references confirmed during exploration:
- Predicate stub: [sim-props.ts:93-97](../../src/hazbot/wildfire/sim-props.ts#L93-L97); registry [sim-props.ts:230-246](../../src/hazbot/wildfire/sim-props.ts#L230-L246).
- `translate()` forwards only `zones/sparks/fireLineMarkers/wind` on `SimulationStarted` [translate.ts:16-29](../../src/hazbot/wildfire/translate.ts#L16-L29).
- `WildfireReading` shape [types.ts:6-13](../../src/hazbot/wildfire/types.ts#L6-L13).
- Payload assembly + generic config snapshot [bottom-bar.tsx:217-260](../../src/components/bottom-bar.tsx#L217-L260); per-spark elevation read [bottom-bar.tsx:236](../../src/components/bottom-bar.tsx#L236).
- `cell.elevation` getter subtracts `FIRE_LINE_DEPTH`; `baseElevation` is immutable [cell.ts:59-64](../../src/models/cell.ts#L59-L64).
- `fillTerrainEdges` edge predicate that zeros `baseElevation` [simulation.ts:216-217,229](../../src/models/simulation.ts#L216-L229).
- Stub-warning suppressed under load-blocking errors [engine.ts:243-253](../../src/hazbot/engine/engine.ts#L243-L253).
- `placeSparkInZone` / `zoneBounds` test helpers [stores.ts:42-82](../../src/models/stores.ts#L42-L82).
- `addSpark(x,y)` (model-ft) and `cellAt(x,y)` (model-ft → grid lookup) for the documented-coordinate walk [stores.ts:42-82](../../src/models/stores.ts#L42-L82), [simulation.ts:161-165](../../src/models/simulation.ts#L161-L165).
- Validated topography + spark coordinates for `mountainTwoZoneFixedTerrain` (Playwright against the running app, 2026-06-03): recorded in the playbook/docs step below.

---

### Carry elevation data to the predicate (WildfireReading + translate forwarding)

**Summary**: Add the two fields the predicate needs — `elevationRange` and
`heightmapMaxElevation` — to `WildfireReading`, and forward them in `translate()`
on **`SimulationStarted` only** (the predicate binds via `WITH` to the run-start
reading; end/stop readings carry only `outcome`). No predicate or payload change
yet, so the reading simply gains two optional fields that are `undefined` until
the payload step lands. Satisfies R9's `translate()`-forwarding clause.

**Files affected**:
- `src/hazbot/wildfire/types.ts` — two new optional fields on `WildfireReading`.
- `src/hazbot/wildfire/translate.ts` — copy both fields in the `SimulationStarted` case.
- `src/hazbot/wildfire/translate.test.ts` — R9 forwarding assertions.

**Estimated diff size**: ~40 lines.

`types.ts` — extend the interface:

```ts
export interface WildfireReading extends BaseReading {
  zones?: WildfireZone[];
  sparks?: WildfireSpark[];
  fireLineMarkers?: WildfireFireLineMarker[];
  wind?: { speed: number; direction: number };
  // Immutable-topography elevation extrema of the grid (min/max of
  // cell.baseElevation), computed at the SimulationStarted payload site and
  // forwarded by translate(). Used by SparksAtTopAndBottom to normalize each
  // spark's elevation. Excludes only the fillTerrainEdges perimeter cells; see
  // requirements.md R3 "Exact exclusion rule".
  elevationRange?: { min: number; max: number };
  // Per-preset heightmap max (config.heightmapMaxElevation; default 20000, some
  // presets override to 3000/10000). Carried so the predicate can derive the
  // flat-terrain minimum-span floor (R3) — config is not reachable from a
  // sim-prop. Rides along in the config snapshot; translate() forwards it.
  heightmapMaxElevation?: number;
  // Outcome data from end-of-run triggers; opaque to current rule sets.
  outcome?: unknown;
}
```

`translate.ts` — forward both fields in the `SimulationStarted` case (the
`Partial<WildfireReading>` cast already covers them once they exist on the type):

```ts
    case "SimulationStarted": {
      const data = (event.data ?? {}) as Partial<WildfireReading>;
      const reading: WildfireReading = {
        triggeredBy: "SimulationStarted",
        sessionId,
        at: event.at,
        temporalHistory: [],
        zones: data.zones,
        sparks: data.sparks,
        fireLineMarkers: data.fireLineMarkers,
        wind: data.wind,
        elevationRange: data.elevationRange,
        heightmapMaxElevation: data.heightmapMaxElevation,
      };
      return { kind: "trigger", reading };
    }
```

The `SimulationEnded` / `SimulationStopped` case is left untouched, so those
readings carry neither field (R9).

`translate.test.ts` — add R9 forwarding coverage:

```ts
  it("forwards elevationRange and heightmapMaxElevation from the SimulationStarted payload (R9)", () => {
    const result = translate(
      ev("SimulationStarted", {
        data: { elevationRange: { min: 100, max: 9000 }, heightmapMaxElevation: 20000 },
      }),
      "s",
    );
    if (result.kind !== "trigger") throw new Error("expected trigger");
    expect(result.reading.elevationRange).toEqual({ min: 100, max: 9000 });
    expect(result.reading.heightmapMaxElevation).toBe(20000);
  });

  it("does not carry elevation fields on SimulationEnded / SimulationStopped (R9)", () => {
    const ended = translate(ev("SimulationEnded", { data: { outcome: {} } }), "s");
    const stopped = translate(ev("SimulationStopped"), "s");
    if (ended.kind !== "trigger" || stopped.kind !== "trigger") throw new Error("expected triggers");
    expect(ended.reading.elevationRange).toBeUndefined();
    expect(ended.reading.heightmapMaxElevation).toBeUndefined();
    expect(stopped.reading.elevationRange).toBeUndefined();
    expect(stopped.reading.heightmapMaxElevation).toBeUndefined();
  });
```

---

### Compute elevationRange and switch spark elevation to baseElevation (payload assembly)

**Summary**: At the `SimulationStarted` payload-build site, compute
`elevationRange = {min, max}` from `cell.baseElevation` excluding **only** the
`fillTerrainEdges` perimeter cells (by grid position, per R3), and switch the
**per-spark** elevation read from `cell.elevation` (dynamic, fire-line-skewed) to
`cell.baseElevation` (immutable). Fire-line markers keep reading `cell.elevation`:
only the spark basis is required (R3/R9, and the predicate never reads markers), so
switching markers would be an unrequired, untested change to logged data
(pass-2 Senior-Engineer finding). `heightmapMaxElevation`
needs **no** new line here — the generic config snapshot loop
([bottom-bar.tsx:219-225](../../src/components/bottom-bar.tsx#L219-L225)) already
emits it as `configSnapshot.heightmapMaxElevation`. Satisfies the
Payload-assembly Technical Note and the R3 elevation-basis / exclusion rule.

**Files affected**:
- `src/models/simulation.ts` — extract a shared `isTerrainEdge(x, y)` predicate (see OQ-B), a `baseElevationRange` computed accessor, and a pure `buildStartReadingData()` method (the topography-dependent payload assembly, extracted from `handleStart` so it is unit-testable — see Finding 3 / OQ-A).
- `src/components/bottom-bar.tsx` — `handleStart` spreads `simulation.buildStartReadingData()` into the config snapshot instead of building sparks/markers inline.
- `LOGGED-EVENTS.md` — add `elevationRange: { min, max }` to the documented `SimulationStarted` payload (Finding 3): the field is newly attached to the logged payload here, and the repo's payload reference already lists `heightmapMaxElevation` but not `elevationRange`. Documentation-only; no schema enforcement.
- `src/models/simulation.test.ts` (or the existing simulation/cell suite) — assert `baseElevationRange` excludes edge cells; assert `buildStartReadingData()` reads **spark** elevation from `baseElevation` (proven via a fire-line cell, where `baseElevation` ≠ the `FIRE_LINE_DEPTH`-reduced `elevation`) and attaches `elevationRange`; assert a spark on an excluded `isTerrainEdge` cell yields `elevation: undefined` (Finding 1 / R3 fail-closed).

**Estimated diff size**: ~90 lines.

Rather than duplicate the (subtly off-by-one) `isEdge` condition at the payload
site, extract it once on `SimulationModel` so the payload range and the
cell-zeroing logic can never diverge (OQ-B, Option A). In `simulation.ts`, replace
the inline `isEdge` at [simulation.ts:216-217](../../src/models/simulation.ts#L216-L217)
with a call to a new method, and add the range accessor:

```ts
  // Reproduces EXACTLY the cells fillTerrainEdges zeros to baseElevation: 0 in
  // populateCellsData — bug-for-bug, not true geometric edges. The `y ===
  // this.gridHeight` clause is a preserved off-by-one: the loop runs `y < gridHeight`,
  // so it is never true and the bottom grid row is intentionally NOT zeroed (and
  // therefore NOT excluded from the elevation range). Do NOT "fix" it to
  // `gridHeight - 1` — that would start zeroing the bottom row and silently shift the
  // SimulationStarted payload elevation range (see OQ-B). Extracted so the payload can
  // exclude precisely these cells when computing the range — a value-based or
  // flag-based filter cannot distinguish them from real 0-ft cells or real unburnt
  // islands (requirements.md R3).
  public isTerrainEdge(x: number, y: number) {
    return !!this.config.fillTerrainEdges &&
      (x === 0 || x === this.gridWidth - 1 || y === 0 || y === this.gridHeight);
  }

  // min/max of cell.baseElevation across interior cells (rivers and unburnt
  // islands included — they carry real topography; only the artificial
  // fillTerrainEdges perimeter is excluded). Returns null when no cell has a
  // finite baseElevation (e.g. a preset with no elevation source) so the
  // payload omits elevationRange and the predicate fails closed (R3).
  public get baseElevationRange(): { min: number; max: number } | null {
    let min = Infinity, max = -Infinity;
    for (const cell of this.cells) {
      if (this.isTerrainEdge(cell.x, cell.y)) continue;
      const e = cell.baseElevation;
      if (!Number.isFinite(e)) continue;
      if (e < min) min = e;
      if (e > max) max = e;
    }
    return min === Infinity ? null : { min, max };
  }
```

In `populateCellsData`, the edge check becomes:

```ts
          const isEdge = this.isTerrainEdge(x, y);
```

The per-spark / per-marker payload assembly (spark elevation now reads
`baseElevation`; markers keep `cell.elevation`) and the `elevationRange` attach are
extracted from `handleStart` into a pure
`SimulationModel.buildStartReadingData()` so they can be unit-tested without the
React/`log` harness (Finding 3 / OQ-A). On `simulation.ts`:

```ts
  // Topography-dependent SimulationStarted payload data, extracted from
  // bottom-bar.handleStart so it is unit-testable in isolation (Finding 3 / R9).
  // The per-SPARK elevation read uses baseElevation (immutable topography), NOT
  // cell.elevation — the latter subtracts FIRE_LINE_DEPTH for dug cells (cell.ts:59-64),
  // which would skew the topographic basis the Hazbot predicate normalizes against
  // (R3 / WM-15). Fire-line markers keep cell.elevation (unchanged from the original):
  // only the spark basis is required, and the predicate never reads markers.
  // Return type declares elevationRange OPTIONAL (rather than letting TS infer a
  // presence-discriminated union), so the bottom-bar consumer's
  // `if (startData.elevationRange)` access typechecks regardless of the range branch.
  public buildStartReadingData(): {
    sparks: Array<{ x: number; y: number; elevation?: number; zoneIdx?: number }>;
    fireLineMarkers: Array<{ x: number; y: number; elevation?: number }>;
    elevationRange?: { min: number; max: number };
  } {
    const { config } = this;
    const cellFor = (x: number, y: number) => this.cells.length > 0 ? this.cellAt(x, y) : null;
    const sparks = this.sparks.map((s) => {
      const cell = cellFor(s.x, s.y);
      // Fail closed on a spark that landed on a fillTerrainEdges perimeter cell:
      // those carry an artificial baseElevation 0 that is EXCLUDED from
      // baseElevationRange, so reporting it would normalize below the interior
      // range (negative → counts as "bottom") and let an edge spark stand in for a
      // real valley (requirements.md R3). addSpark() does not reject edge cells, so
      // exclude the elevation here; one undefined elevation trips the predicate's
      // fail-closed guard. Range exclusion and spark exclusion now use the SAME
      // isTerrainEdge predicate, so they cannot diverge.
      const onEdge = cell ? this.isTerrainEdge(cell.x, cell.y) : false;
      return {
        x: s.x / config.modelWidth,
        y: s.y / config.modelHeight,
        // spark basis: immutable topography (R3); undefined on an excluded edge cell.
        elevation: onEdge ? undefined : cell?.baseElevation,
        zoneIdx: cell?.zoneIdx,
      };
    });
    const fireLineMarkers = this.fireLineMarkers.map((fl) => {
      const cell = cellFor(fl.x, fl.y);
      // Unchanged from the original: markers keep the dynamic cell.elevation.
      return { x: fl.x / config.modelWidth, y: fl.y / config.modelHeight, elevation: cell?.elevation };
    });
    const range = this.baseElevationRange;
    // Spread the optional field so the result always has the {sparks, fireLineMarkers,
    // elevationRange?} shape — no inferred union for the consumer to narrow.
    return { sparks, fireLineMarkers, ...(range ? { elevationRange: range } : {}) };
  }
```

In `bottom-bar.tsx`, `handleStart` spreads the result instead of building sparks /
markers inline:

```ts
      // Runtime state not in config (sparks carry baseElevation; markers keep
      // cell.elevation; range attached when present). zones / wind / towns stay inline.
      const startData = simulation.buildStartReadingData();
      configSnapshot.sparks = startData.sparks;
      configSnapshot.fireLineMarkers = startData.fireLineMarkers;
      if (startData.elevationRange) configSnapshot.elevationRange = startData.elevationRange;
      // ...existing zones / wind / towns ...
```

`heightmapMaxElevation` is already in `configSnapshot` via the generic config loop,
so no line is added for it here — only the `translate()` forwarding from the prior
step is needed (R9 item iii / 3rd-pass Senior-Engineer note).

**Test (R9 payload computation — all model-level, per OQ-A → A)**: the payload
assembly now lives in the pure `buildStartReadingData()` / `baseElevationRange`
methods, so every R9 payload item is unit-testable directly on `SimulationModel`
without the React/`log` harness. Construct the model the **established jsdom-safe
way**, exactly as the existing `simulation.test.ts` does: `new SimulationModel({ ...,
elevation: <numeric 2D array>, ... })` then `await sim.dataReadyPromise`. A **numeric**
`config.elevation` array goes through `getInputData`'s array branch
([image-utils.ts:106](../../src/models/utils/image-utils.ts#L106)) → `populateGrid`,
which is pure arithmetic — it never touches the `canvas.getContext("2d")` decode path
that only a *string* (real heightmap PNG) triggers, so it runs cleanly under
Jest/jsdom (this is what `simulation.test.ts` already relies on; the 3rd-pass QA
jsdom limitation applies only to the string/PNG case). Note the array branch does
**not** apply the `× heightmapMaxElevation` scaling (that runs only in the string
branch's `mapColor`), so the array values **are** the per-cell `baseElevation`
directly — convenient for pinning an exact min/max. Provide the array at grid
resolution so interpolation is identity:
- **(i) `baseElevationRange`** — (a) range is min/max of `baseElevation`; (b) a
  perimeter cell zeroed via `fillTerrainEdges` is excluded (range min stays above 0).
  The numeric-array fixture covers (a)/(b) directly. The remaining two cases are
  **not** reachable from the numeric-array `populateCellsData` path — a numeric
  array fills every grid index with a finite `baseElevation` and produces no
  rivers/islands, and omitting `config.elevation` does **not** help (it derives a
  heightmap PNG *string* via `getElevationData` → the jsdom canvas-decode path this
  preamble avoids). So reach them by **post-construction mutation of the plain `Cell`
  fields** (after `dataReadyPromise`): (c) set `cell.isRiver = true` (or
  `isUnburntIsland`) on a chosen interior cell and assert its real `baseElevation`
  is still in range (the getter intentionally does **not** filter by
  `isNonburnable`, per R3); (d) force the no-finite-elevation case with
  `sim.cells = []` (or nulling every cell's `baseElevation`) and assert the getter
  returns `null`. Both `isRiver` and `baseElevation` are plain public `Cell` fields
  ([cell.ts:39,46](../../src/models/cell.ts#L39)), so this needs no loader.
- **(ii) `buildStartReadingData()` elevation basis** — place a spark on a cell that
  is **also a dug fire-line cell**, so `cell.elevation === baseElevation − FIRE_LINE_DEPTH`
  while `cell.baseElevation` is the raw value, and assert the returned spark
  `elevation` equals `baseElevation` (**not** the reduced `elevation`). Make the cell
  a fire-line cell by setting `sim.cellAt(x, y).isFireLine = true` directly after
  `dataReadyPromise` (`isFireLine` is a plain public field, [cell.ts:47](../../src/models/cell.ts#L47),
  and `cell.elevation` keys off it, [cell.ts:59-64](../../src/models/cell.ts#L59-L64));
  `buildFireLine` ([simulation.ts:549](../../src/models/simulation.ts#L549)) is the
  alternative. This is the
  assertion that actually pins the `cell.elevation` → `cell.baseElevation` switch —
  the regression R9 exists to catch, which neither the no-fire-line Playwright walk nor
  the replay fixture can distinguish. Also assert `elevationRange` is attached (and
  omitted when `baseElevationRange` is `null`).
- **(ii-edge) excluded-edge spark fails closed (Finding 1)** — place a spark on a
  `fillTerrainEdges` perimeter cell (a cell where `isTerrainEdge(x, y)` is true and
  `baseElevation === 0`) and assert the returned spark `elevation` is `undefined` (not
  `0`), so the artificial edge zero never normalizes to a spurious "bottom". On the
  numeric-array fixture, build the model with `config.fillTerrainEdges: true` so the
  perimeter is zeroed, then place the spark on column 0 / row 0; this is the same
  `isTerrainEdge` predicate `baseElevationRange` excludes, so the range and the spark
  read can never disagree about which cells are artificial.
- **(iii) `heightmapMaxElevation` snapshot + forwarding** — covered by the
  `translate.test.ts` forwarding tests in the prior step (the field rides through the
  generic config snapshot, so the only WM-15-specific work is `translate()` carrying
  it). No `handleStart` test needed for it.

The replay fixture (`replay-fixture.test.ts`) is **not** a vehicle for R9 items
(ii)/(iii): `generate-replay-fixture.js` hand-builds the `SimulationStarted` event
data and replays it through `translate → engine`, never running `handleStart` or the
bottom-bar payload assembly (verified during review — the generator imports no
`bottom-bar`/`stores`/`SimulationModel`). It also does **not** need regenerating for
this story: its ruleset-25 `startData` sparks are elevation-less
([generate-replay-fixture.js:32-36](../../scripts/generate-replay-fixture.js#L32-L36)),
so once the predicate is real it **fails closed** on them (no spark `elevation`,
`elevationRange`, or `heightmapMaxElevation`) and `SparksAtTopAndBottom` stays `false` —
the fixture's `matchedCategoryHistory` is **invariant** under this change (still caps at
Cat 4). The two new `translate` fields arrive `undefined` and are stripped by
`JSON.stringify` / the test's `roundTrip` (and `assertJsonSafe` walks only
`temporalValues` + `temporalHistory`, not top-level reading fields,
[generate-replay-fixture.js:124-131](../../scripts/generate-replay-fixture.js#L124-L131)),
so the existing fixture stays green with no regeneration. The Cat 4/5/6 matched-category
regression is owned by `25.test.ts` (R10) and the driven Playwright walk (R5); the
replay fixture is not part of WM-15's deliverable set. (Do **not** add top/bottom
elevations to the fixture's `startData` to "exercise" the new path — its zones carry
undefined vegetation, so `UniformZoneSettings` is `false` and a `true` predicate would
silently flip the fixture to Cat 5; that is a separate, unwanted change.) See OQ-A
(resolved to A) and Self-Review Finding (replay-fixture traceability).

---

### Implement the SparksAtTopAndBottom predicate

**Summary**: Replace the stub body with real, topography-aware,
fail-closed detection: normalize each of the two sparks' `baseElevation`-sourced
elevation against `reading.elevationRange`, qualify when the higher is in the top
25% and the lower in the bottom 25%, and disqualify flat terrain via a
minimum-span floor computed as `MIN_SPAN_FRACTION × reading.heightmapMaxElevation`.
Remove `isStub: true`. Satisfies R1, R2, R3, OQ-1(B), OQ-3(A). Replace the stub
unit test with the full R4 sweep.

**Files affected**:
- `src/hazbot/wildfire/sim-props.ts` — real predicate + named constants.
- `src/hazbot/wildfire/sim-props.test.ts` — replace the stub test with the R4 sweep.

**Estimated diff size**: ~120 lines (incl. tests).

`sim-props.ts` — replace [lines 92-97](../../src/hazbot/wildfire/sim-props.ts#L92-L97):

```ts
// SparksAtTopAndBottom (tab 25, WM-15): true when one spark sits near the top of
// the active topography and the other near the bottom. Topography-aware by
// normalized elevation (OQ-1 Option B), not visual ridge/valley geometry
// (OQ-1 Option C declined). The predicate sees only the two sparks plus the
// elevationRange / heightmapMaxElevation carried on the SimulationStarted
// reading (see the Payload-assembly Technical Note) — never config or the cell
// grid. Self-contained fail-closed guards, matching OneSparkPerZone / TwoSparks
// (OQ-3 Option A). Distinct-zone placement is intentionally NOT checked here; it
// is composed in via OneSparkPerZone in every ruleset-25 category that ANDs this.

// Tuning constants are module-private to sim-props.ts: the predicate is now their
// only consumer (the deterministic Playwright walk uses documented coordinates, not a
// placement helper — OQ-D reverted B → A; OQ-E), so there is no second consumer to keep
// in lockstep. They sit next to the predicate, matching the neighbor props' style.
// "Near the top" = normalized elevation in the top 25% of the range (>= 0.75); "near
// the bottom" = bottom 25% (<= 0.25). 25% is a deliberately generous default (PI
// guidance: > 10%, << 50%, may need tuning once seen in action); tuning against real
// student data is out of scope (requirements.md Out of Scope).
const TOP_BOTTOM_TOLERANCE = 0.25;
const HIGH_THRESHOLD = 1 - TOP_BOTTOM_TOLERANCE; // 0.75
const LOW_THRESHOLD = TOP_BOTTOM_TOLERANCE;      // 0.25
// Flat-terrain floor: a run is disqualified unless the elevation span exceeds
// MIN_SPAN_FRACTION of the per-preset heightmap max. At the default max (20000) this is
// a 1000 ft floor: above heightmap quantization noise, well below real mountain relief
// (requirements.md R3). Tunable; tuning is out of scope.
const MIN_SPAN_FRACTION = 0.05;

const SparksAtTopAndBottom: SimPropImpl<WildfireReading, WildfireDefaults> = {
  defaultValue: false,
  evaluate: (reading) => {
    const { sparks, elevationRange, heightmapMaxElevation } = reading;
    // Fail closed: exactly two sparks, both with defined elevation, plus the
    // two topography fields the normalization and floor need (OQ-3 A / R3).
    if (!sparks || sparks.length !== 2) return false;
    if (sparks.some((s) => !Number.isFinite(s.elevation))) return false;
    if (!elevationRange ||
        !Number.isFinite(elevationRange.min) || !Number.isFinite(elevationRange.max)) return false;
    if (!Number.isFinite(heightmapMaxElevation)) return false;

    const { min, max } = elevationRange;
    // Defense-in-depth (Finding 1): the payload already omits the elevation of a
    // spark on an excluded fillTerrainEdges cell (so its artificial 0 can't
    // normalize below the interior range), but reject any spark whose elevation
    // falls outside [min, max] here too — a below-range value would normalize < 0
    // (a spurious "bottom") and an above-range value > 1 (a spurious "top"). This
    // keeps the predicate self-consistent regardless of how the payload was built.
    if (sparks.some((s) => (s.elevation as number) < min || (s.elevation as number) > max)) return false;

    const span = max - min;
    // Flat / degenerate terrain never counts (R3). At or below the floor there
    // is no meaningful top/bottom; this also guards the divide-by-zero below.
    const minSpan = MIN_SPAN_FRACTION * heightmapMaxElevation;
    if (span <= minSpan) return false;

    const [a, b] = sparks.map((s) => ((s.elevation as number) - min) / span);
    const higher = Math.max(a, b);
    const lower = Math.min(a, b);
    return higher >= HIGH_THRESHOLD && lower <= LOW_THRESHOLD;
  },
};
```

Remove `SparksAtTopAndBottom` from the "Stub" grouping; its registry entry at
[sim-props.ts:238](../../src/hazbot/wildfire/sim-props.ts#L238) is unchanged
(R1 / Registration Technical Note — the key already exists).

`sim-props.test.ts` — replace the stub `describe` at
[lines 142-147](../../src/hazbot/wildfire/sim-props.test.ts#L142-L147) with the
R4 sweep. `mkRead()` already supports the new fields via `Partial<WildfireReading>`:

```ts
  describe("SparksAtTopAndBottom (R4)", () => {
    // Default fixture: a real mountain span at the default heightmap max, so the
    // minimum-span floor (5% × 20000 = 1000 ft) is comfortably cleared.
    const range = { min: 0, max: 10000 };
    const max = 20000;
    const sparksAt = (e1: number, e2: number) =>
      [{ x: 0, y: 0, elevation: e1 }, { x: 1, y: 0, elevation: e2 }];
    const read = (e1: number, e2: number, over: Partial<WildfireReading> = {}) =>
      mkRead({ sparks: sparksAt(e1, e2), elevationRange: range, heightmapMaxElevation: max, ...over });

    // true class: one spark top quartile, one bottom quartile (order-independent).
    it("true when one spark is near the top and the other near the bottom", () => {
      expect(simProps.SparksAtTopAndBottom.evaluate(read(9000, 500), {})).toBe(true);
      expect(simProps.SparksAtTopAndBottom.evaluate(read(500, 9000), {})).toBe(true); // reversed
    });

    // R3 false sub-cases.
    it("false when both sparks are at similar (mid) elevation", () => {
      expect(simProps.SparksAtTopAndBottom.evaluate(read(5000, 5200), {})).toBe(false);
    });
    it("false when both sparks are near the top", () => {
      expect(simProps.SparksAtTopAndBottom.evaluate(read(8000, 9500), {})).toBe(false);
    });
    it("false when both sparks are near the bottom", () => {
      expect(simProps.SparksAtTopAndBottom.evaluate(read(200, 1500), {})).toBe(false);
    });

    // Boundary values: exactly 0.75 / 0.25 are inclusive (>= / <=).
    it("true exactly at the 0.75 / 0.25 boundaries (inclusive)", () => {
      expect(simProps.SparksAtTopAndBottom.evaluate(read(7500, 2500), {})).toBe(true);
    });
    it("false just inside the boundaries (0.74 / 0.26)", () => {
      expect(simProps.SparksAtTopAndBottom.evaluate(read(7400, 2600), {})).toBe(false);
    });

    // Minimum-span floor: 5% × 20000 = 1000 ft.
    it("false on flat / below-minimum-span terrain", () => {
      const flat = { min: 4000, max: 4400 }; // span 400 < 1000
      expect(simProps.SparksAtTopAndBottom.evaluate(
        read(4400, 4000, { elevationRange: flat }), {})).toBe(false);
    });
    it("false exactly at the minimum-span floor (span == 1000)", () => {
      const atFloor = { min: 0, max: 1000 }; // span 1000, at-or-below → false
      expect(simProps.SparksAtTopAndBottom.evaluate(
        read(1000, 0, { elevationRange: atFloor }), {})).toBe(false);
    });
    it("true just above the minimum-span floor with a real top/bottom", () => {
      const aboveFloor = { min: 0, max: 1001 }; // span 1001 > 1000
      expect(simProps.SparksAtTopAndBottom.evaluate(
        read(1001, 0, { elevationRange: aboveFloor }), {})).toBe(true);
    });

    // Fail-closed guards (OQ-3 A / R3).
    it("false when a spark elevation is undefined", () => {
      expect(simProps.SparksAtTopAndBottom.evaluate(
        mkRead({ sparks: [{ x: 0, y: 0, elevation: undefined }, { x: 1, y: 0, elevation: 500 }],
          elevationRange: range, heightmapMaxElevation: max }), {})).toBe(false);
    });
    it("false when elevationRange is undefined", () => {
      expect(simProps.SparksAtTopAndBottom.evaluate(
        mkRead({ sparks: sparksAt(9000, 500), heightmapMaxElevation: max }), {})).toBe(false);
    });
    it("false when heightmapMaxElevation is undefined", () => {
      expect(simProps.SparksAtTopAndBottom.evaluate(
        mkRead({ sparks: sparksAt(9000, 500), elevationRange: range }), {})).toBe(false);
    });
    it("false when spark count is not two", () => {
      expect(simProps.SparksAtTopAndBottom.evaluate(
        mkRead({ sparks: [{ x: 0, y: 0, elevation: 9000 }], elevationRange: range, heightmapMaxElevation: max }), {})).toBe(false);
      expect(simProps.SparksAtTopAndBottom.evaluate(
        mkRead({ sparks: [...sparksAt(9000, 500), { x: 2, y: 0, elevation: 100 }], elevationRange: range, heightmapMaxElevation: max }), {})).toBe(false);
    });
    // Defense-in-depth (Finding 1): a spark elevation outside [min, max] — e.g. the
    // artificial 0 of an excluded fillTerrainEdges cell, below range.min=0 here — is
    // rejected rather than normalized to a spurious top/bottom.
    it("false when a spark elevation is below the range minimum (excluded-edge zero)", () => {
      expect(simProps.SparksAtTopAndBottom.evaluate(
        mkRead({ sparks: sparksAt(9000, -50), elevationRange: range, heightmapMaxElevation: max }), {})).toBe(false);
    });
    it("false when a spark elevation is above the range maximum", () => {
      expect(simProps.SparksAtTopAndBottom.evaluate(
        mkRead({ sparks: sparksAt(10500, 500), elevationRange: range, heightmapMaxElevation: max }), {})).toBe(false);
    });
    it("false when a spark elevation is non-finite (NaN / Infinity)", () => {
      expect(simProps.SparksAtTopAndBottom.evaluate(
        mkRead({ sparks: sparksAt(NaN, 500), elevationRange: range, heightmapMaxElevation: max }), {})).toBe(false);
      // Infinity must fail closed too — the title claims it and a NaN-only guard
      // (e.g. Number.isNaN instead of !Number.isFinite) would otherwise slip past (R3).
      expect(simProps.SparksAtTopAndBottom.evaluate(
        mkRead({ sparks: sparksAt(Infinity, 500), elevationRange: range, heightmapMaxElevation: max }), {})).toBe(false);
    });
  });
```

---

### Ruleset 25 category tests + no-stub-warning registry assertion (R10, R6)

**Summary**: Unstub the ruleset 25 tests — add Cat 5 & Cat 6 per-category
coverage with elevation-bearing readings, and remove the stale stub comments and
the test-(e) "never matches cat 5/6" assertion. Add the R6 registry assertion
(loads clean, no `stub-warning` for `SparksAtTopAndBottom`, `isStub` falsy).

**Files affected**:
- `src/hazbot/rule-sets/25.test.ts` — Cat 5/6 coverage; remove stale stub artifacts; **home of the R6 three-part assertion (OQ-C → A)**, which adds an `import { simProps } from "../wildfire/sim-props";` (the file currently imports only `ruleSet25`, `test-helpers`, and `WildfireReading`).

**Estimated diff size**: ~90 lines.

`25.test.ts` — readings must now carry `elevationRange` + `heightmapMaxElevation`
and per-spark `elevation` so `SparksAtTopAndBottom` can evaluate. Add fixtures
and replace the (e) test:

```ts
const ELEV_RANGE = { min: 0, max: 10000 };
const HEIGHTMAP_MAX = 20000;
// One spark per zone, placed top (zone 0) and bottom (zone 1) of the range.
const sparksTopBottom = [
  { x: 0, y: 0, zoneIdx: 0, elevation: 9000 },
  { x: 1, y: 0, zoneIdx: 1, elevation: 500 },
];
// One spark per zone, both mid-slope (NOT top/bottom).
const sparksPerZoneMid = [
  { x: 0, y: 0, zoneIdx: 0, elevation: 5000 },
  { x: 1, y: 0, zoneIdx: 1, elevation: 5200 },
];
const nonUniformZones = [
  { vegetation: "Shrub", droughtLevel: "Mild Drought" },
  { vegetation: "Forest", droughtLevel: "Mild Drought" },
];
function topoReading(opts: Partial<WildfireReading> = {}): WildfireReading {
  return startReading({ elevationRange: ELEV_RANGE, heightmapMaxElevation: HEIGHTMAP_MAX, ...opts });
}
```

(Ordering dependency: these `elevationRange` / `heightmapMaxElevation` fields only
reach the predicate because the first step adds them to `WildfireReading` and
`mkReading` spreads `Partial<WildfireReading>` — so this step must land after the
type change, not before.)

Replace test (e) (now false once implemented) and extend per-category coverage:

```ts
  it("(e) cat 5 — top/bottom sparks with non-uniform zone settings", () => {
    const e = makeWildfireEngine(ruleSet25);
    const r = topoReading({ sparks: sparksTopBottom, zones: nonUniformZones });
    expect(matchAgainst(ruleSet25, e, [r])).toBe(5);
  });
  it("(f) cat 6 — top/bottom sparks with uniform zone settings (success)", () => {
    const e = makeWildfireEngine(ruleSet25);
    const r = topoReading({ sparks: sparksTopBottom, zones: uniformZones });
    expect(matchAgainst(ruleSet25, e, [r])).toBe(6);
  });
  it("(g) cat 4 — one spark per zone but not top/bottom (mid-slope)", () => {
    const e = makeWildfireEngine(ruleSet25);
    const r = topoReading({ sparks: sparksPerZoneMid, zones: uniformZones });
    expect(matchAgainst(ruleSet25, e, [r])).toBe(4);
  });
```

Remove the stale header block at [25.test.ts:13-19](../../src/hazbot/rule-sets/25.test.ts#L13-L19)
and the "cats 5 and 6 are stub-gated and excluded" comment at
[25.test.ts:74](../../src/hazbot/rule-sets/25.test.ts#L74); the R9 per-category
block extends to cats 5 and 6 using the same fixtures.

R6 registry assertion — lives in `25.test.ts` (OQ-C → A). The third part reads
`simProps.SparksAtTopAndBottom.isStub`, so the file must add the `simProps` import
(it currently imports only `ruleSet25`, `test-helpers`, and `WildfireReading` — the
same path `test-helpers.ts` already uses):

```ts
import { simProps } from "../wildfire/sim-props";
```

Load ruleset 25 through the engine and assert all three conditions (the engine
suppresses stub-warnings under a load-blocking error, so a bare "no stub-warning"
check can pass for the wrong reason — engine.ts:243):

```ts
  it("ruleset 25 loads with no stub-warning for SparksAtTopAndBottom (R6)", () => {
    const e = makeWildfireEngine(ruleSet25);
    // 1) no load-blocking error
    expect(e.errors.some((err) => err.kind === "load-failure" || err.kind === "parse-error")).toBe(false);
    // 2) no stub-warning emitted for this prop
    expect(e.errors.some((err) => err.kind === "stub-warning" && err.stubName === "SparksAtTopAndBottom")).toBe(false);
    // 3) the flag was actually removed
    expect(simProps.SparksAtTopAndBottom.isStub).toBeFalsy();
  });
```

(Exact accessor for engine errors / construction confirmed against
`makeWildfireEngine` in [test-helpers.ts](../../src/hazbot/rule-sets/test-helpers.ts)
during implementation; if the helper does not surface `errors`, use the
engine-singleton load path instead — see OQ-C.)

---

### Regenerate playbook, document validated walk coordinates, fix the localhost-urls preset (R5, R7, R8, R11)

**Summary**: Regenerate the auto-generated ruleset 25 validation playbook, record
the **validated documented spark coordinates** that drive a deterministic Cat 4 →
6 Playwright walk (R11 Option b — there is no placement helper; OQ-E), and correct
the two `mountainTwoZone` → `mountainTwoZoneFixedTerrain` references in the
localhost URL index. R5/R7 are verified by a driven Playwright walk against the
regenerated `25.md`, reading the matched category from the dev sidebar (no
programmatic `matchedCategory()` hook ships — OQ-E).

**Files affected**:
- `docs/hazbot-validation/25.md` — regenerated (do not hand-edit).
- `docs/hazbot-validation/localhost-urls.md` — preset fix at [line 19](../../docs/hazbot-validation/localhost-urls.md#L19) and [line 166](../../docs/hazbot-validation/localhost-urls.md#L166); **plus** un-stub the `SparksAtTopAndBottom` references the index still carries (Finding 2): the stubbed-impls note at [line 140](../../docs/hazbot-validation/localhost-urls.md#L140) and the ruleset-25 status wording at [line 166](../../docs/hazbot-validation/localhost-urls.md#L166).
- `CLAUDE.md` — record the validated `mountainTwoZoneFixedTerrain` spark coordinates in the Playwright section (R11b).

**Estimated diff size**: ~25 lines hand-edited + regenerated playbook.

Steps:
1. `node scripts/generate-hazbot-validation-playbook.js` — regenerates `25.md`
   so Cat 6 is reachable in the playbook (R5).
2. Edit `localhost-urls.md`: change `preset=mountainTwoZone` to
   `preset=mountainTwoZoneFixedTerrain` in both the table row (line 19) and the
   summary row (line 166) (R8). Both presets resolve to the same heightmap; the
   fixed preset pins it and disables terrain-type editing for a deterministic walk.
   In the **same file**, remove the now-stale `SparksAtTopAndBottom` stub references
   (Finding 2), since they would contradict the shipped behavior and mislead testers:
   - **Line 140** (stubbed-impls note): drop `SparksAtTopAndBottom (sim-prop, → WM-15)`
     from the "Stubbed impls always return `false`" list and remove "ruleset 25 Cat 5/6"
     from its unreachable-categories example, leaving only `Helitack` / `usedHelitack`
     (→ WM-28) and ruleset 45 Cat 4 / tabs 45/47/54.
   - **Line 166** (ruleset-25 summary row): change `cats 1–4 ✓ | cats 5 & 6 stub-gated
     (SparksAtTopAndBottom → WM-15)` to reflect the validated post-WM-15 state —
     `cats 1–6 ✓ | none` (Cat 6 success now reachable; the over-match of Cat 4 is gone).
3. Record the validated spark coordinates (R11b) in the CLAUDE.md Playwright
   section **only** — not in `25.md`, which is auto-generated (its
   "AUTO-GENERATED — DO NOT EDIT" banner) and has no generator input for spark
   coordinates, so they would be clobbered by step 1's regeneration. Verified against the running app on
   `mountainTwoZoneFixedTerrain` (2026-06-03): global `baseElevationRange`
   ≈ `{ min: 1096, max: 19450 }` ft, span ≈ 18353 ft (clears the 1000 ft floor).
   The **robust** top/bottom-per-zone placement is **top → zone 1, bottom → zone
   0** (zone 1 is the high zone — 851 cells in the top band, reaching normalized
   1.0; zone 0 is the low zone — max normalized only 0.811 on ~40 cells, so the
   reverse direction is fragile):
   - **Top spark (zone 1)**: model `(119000, 38000)` → grid `(238, 76)`,
     normalized `(x≈0.99, y≈0.48)`, normalized elevation **1.00**.
   - **Bottom spark (zone 0)**: model `(59000, 3500)` → grid `(118, 7)`,
     normalized `(x≈0.49, y≈0.04)`, normalized elevation **0.00**.

   Both round-trip through `addSpark` → `cellAt` into the intended zones and bands
   (verified live). The Cat-4 (false-class) walk uses ordinary
   `window.test.placeSparkInZone(0)` / `placeSparkInZone(1)` (mid-slope zone
   centers). The flat-terrain R7 walk uses `plainsTwoZone` with the same
   `placeSparkInZone` calls and confirms the matched category caps at Cat 4.
4. Driven Playwright verification (R5/R7), to run after the predicate + plumbing
   land (the predicate is a stub today, so Cat 6 is unreachable until then). The
   mountain walk has **two endpoints that must each start from a clean spark
   state** — `addSpark()` no-ops once `remainingSparks === 0`
   ([simulation.ts:97-108,465-469](../../src/models/simulation.ts#L97-L108)), so a
   second pair cannot be placed on top of the first without a reset (Restart keeps
   sparks placed; only **Reload** clears them — CLAUDE.md):
   - **(a) Cat 4 (mid-slope)** — on `mountainTwoZoneFixedTerrain`, dismiss Terrain
     Setup, place mid-slope sparks via `window.test.placeSparkInZone(0)` /
     `placeSparkInZone(1)`, Start, and confirm the matched row reads **Cat 4**.
   - **Reset between endpoints** — click **Reload** (or `window.sim.reload()`) and
     wait for `sim.dataReady`; this clears the two Cat-4 sparks back to the empty
     preset default (`config.sparks` is `[]` — [config.ts:114](../../src/config.ts#L114),
     reset via `setInputParamsFromConfig` — [simulation.ts:179-182](../../src/models/simulation.ts#L179-L182)),
     re-enabling `addSpark`. Reload re-gates Terrain Setup, so dismiss the wizard
     again before Start.
   - **(b) Cat 6 (top/bottom)** — place the two documented coordinates via
     `window.sim.addSpark(...)` with uniform zone settings, Start, and confirm the
     matched row reaches **Cat 6**.
   - **(c) flat terrain** — on `plainsTwoZone`, place one spark per zone via
     `placeSparkInZone(0/1)` and confirm it caps at **Cat 4** (Cat 6 unreachable).
   Read the **matched** category from the sidebar's
   `.hazbot-sidebar-category-matched` row, not the `▸ ✓ N` truth icon (R5).

**Definition of Done** (the manual Playwright walk is the only end-to-end check left
after the Cypress drop, so it is called out explicitly here rather than left as an
implicit "fallback" — pass-2 Validation finding):
- [ ] Predicate + plumbing + test steps (all steps before this one) landed; `npm test` green, covering R4
  (predicate sweep), R6 (registry no-stub-warning), R9 (`translate` forwarding +
  `buildStartReadingData` model tests), R10 (ruleset-25 Cat 4/5/6).
- [ ] `node scripts/generate-hazbot-validation-playbook.js` run; `25.md` shows Cat 6
  reachable; `localhost-urls.md` preset fixed (R8).
- [ ] Playwright walk run on `mountainTwoZoneFixedTerrain`: mid-slope
  `placeSparkInZone(0/1)` → matched **Cat 4**; then **Reload** (or
  `window.sim.reload()`, wait for `dataReady`, re-dismiss Terrain Setup) to clear the
  two sparks — `addSpark` no-ops at `remainingSparks === 0`, so this reset is
  required, not optional; then documented top/bottom coordinates (zone 1
  `(119000,38000)` / zone 0 `(59000,3500)`) with uniform settings → matched **Cat 6**.
- [ ] Playwright walk run on `plainsTwoZone`: per-zone `placeSparkInZone(0/1)` →
  matched category **caps at Cat 4** (Cat 6 unreachable, R7).
- [ ] Screenshots of the matched-category sidebar state saved under
  `tmp/playwright/` for the Cat 6 and the plains-Cat 4 endpoints.

This walk is sequenced as the **final** validation activity (it depends on the
predicate being implemented; until then the stub keeps Cat 6 unreachable).

---

## Open Questions

<!-- Implementation-focused only. Requirements questions live in requirements.md. -->

### RESOLVED (OQ-A): Where does the R9 "payload computation" assertion live?
**Context**: R9 requires verifying that the `SimulationStarted` payload computes
`elevationRange` from `baseElevation` with the correct edge exclusion, reads
per-spark `baseElevation`, and carries `heightmapMaxElevation`. The actual builder
is the React `handleStart` handler
in [bottom-bar.tsx:206-263](../../src/components/bottom-bar.tsx#L206-L263), which
reads `this.stores` and calls `log()` — awkward to unit-test in isolation. The
plan above moves the computable part to a `simulation.baseElevationRange`
accessor and unit-tests *that*, leaving the handler as thin glue.
**Options considered**:
- A) **Test `simulation.baseElevationRange` (+ the `baseElevation` spark read) at the model level**. Pure, deterministic, no React/log harness — but a model-level test structurally cannot reach the handler's per-spark `baseElevation` read or the `heightmapMaxElevation` snapshot, so those two R9 items would stay unverified.
- B) **Assert via the replay fixture** (`node scripts/generate-replay-fixture.js`) so the real `handleStart` → `log` → `translate` path is exercised end to end.
- C) **Both**: model-level unit test for the computation, plus a replay-fixture assertion for the wiring.

**Decision**: ~~**C** (user-confirmed 2026-06-02)~~ → **A, revised 2026-06-03**
(self-review Finding 3). The original C rested on a false premise: the replay
fixture does **not** exercise `handleStart` — `generate-replay-fixture.js` hand-builds
the `SimulationStarted` event data and replays it through `translate → engine`,
never touching the bottom-bar payload assembly (verified: the generator imports no
`bottom-bar`/`stores`/`SimulationModel`). So C left R9 items (ii)/(iii) uncovered,
and item (ii) — the `cell.elevation` → `cell.baseElevation` switch — was verifiable
by *nothing* in the plan (the no-fire-line Playwright walk can't distinguish the two
getters, since they differ only on dug cells). **Revised resolution**: extract the payload
assembly into a pure `SimulationModel.buildStartReadingData()` and unit-test all
payload items at the model level — crucially, a fire-line-cell fixture that pins the
`baseElevation` basis (item ii). `heightmapMaxElevation` (iii) is covered by the
`translate.test.ts` forwarding tests, since it rides through the generic config
snapshot. The replay fixture is **not** regenerated for this story: its elevation-less
`startData` makes the real predicate fail closed, so its `matchedCategoryHistory` is
invariant and the existing fixture stays green (see the rewritten payload-step note and
Self-Review Finding (replay-fixture traceability)). The Cat 4/5/6 matched-category
regression is owned by `25.test.ts` (R10) and the Playwright walk (R5).

### RESOLVED (OQ-B): How is the `fillTerrainEdges` edge predicate shared between simulation.ts and the payload site?
**Context**: R3 requires excluding exactly the cells `fillTerrainEdges` zeroed,
identified "by the same edge predicate `simulation.ts` uses." That predicate
([simulation.ts:216-217](../../src/models/simulation.ts#L216-L217)) has an
apparent off-by-one (`y === this.gridHeight`, never true; bottom row not zeroed).
To exclude *exactly* the zeroed cells, the payload-side filter must match it
precisely.
**Options considered**:
- A) **Extract `simulation.isTerrainEdge(x, y)`** and call it from both `populateCellsData` and `baseElevationRange` (recommended — single source of truth, the off-by-one stays consistent by construction, no behavior change).
- B) **Duplicate the inline condition** at the payload site. Simplest diff but risks silent divergence if either copy changes.
- C) **Fix the off-by-one** (`y === gridHeight - 1`) as part of this story. Out of scope and changes rendering/fire-spread behavior at the bottom edge — not recommended here.

**Decision**: **A** (2026-06-03). Extract `simulation.isTerrainEdge(x, y)` and call
it from both `populateCellsData` and `baseElevationRange` — single source of truth,
the off-by-one stays consistent by construction, no behavior change. B reintroduces
the divergence risk R3 exists to prevent; C changes bottom-edge rendering/fire-spread
and is out of scope. Per self-review Finding 2, the `isTerrainEdge` doc-comment must
state explicitly that it reproduces exactly the cells `populateCellsData` currently
zeros via `fillTerrainEdges` — which, because of the `y === this.gridHeight`
off-by-one, means the bottom grid row is intentionally **not** zeroed and therefore
**not** excluded from the range (bug-for-bug parity, **not** true geometric edges) —
so a future reader does not "fix" the off-by-one and silently shift the payload
elevation range.
**Empirical confirmation (2026-06-03, pass-2 Senior-Engineer finding)**: on
`mountainTwoZoneFixedTerrain` the edge-excluded range is byte-identical with and
without the off-by-one (`{min 1096, max 19450}` either way), because the global
extrema do not sit on the bottom row — so "no behavior change" is a checked fact, not
just an assertion, on the validation preset. Note the parity is preset-specific: a
preset whose true min/max fell on the bottom row could differ, which is exactly why
bug-for-bug parity with `populateCellsData` (not geometric correctness) is the goal.

### RESOLVED (OQ-C): Where does the R6 no-stub-warning registry assertion live, and what surfaces engine load errors in a unit test?
**Context**: R6 needs a test asserting (1) ruleset 25 loads with no load-blocking
error, (2) no `stub-warning` for `SparksAtTopAndBottom`, (3) `isStub` falsy. The
plan sketches it in `25.test.ts` via `makeWildfireEngine`, but whether that helper
exposes `engine.errors` needs confirming.
**Options considered**:
- A) **In `25.test.ts` via `makeWildfireEngine`** if it surfaces `errors` (recommended — colocated with the ruleset-25 coverage it protects).
- B) **In a dedicated engine/registry test** using the real `getAnalysisEngine()` load path (closest to production, but pulls in URL-config mocking).
- C) **Split**: the `isStub` falsy check in `sim-props.test.ts` (pure), the load/error checks wherever engine errors are accessible.

**Decision**: **A** (2026-06-03, code-verified). The R6 three-part assertion lives in
`25.test.ts` via `makeWildfireEngine`, colocated with the ruleset-25 coverage it
protects. Confirmed during review: `Engine` exposes a public `errors: EngineError[]`
([engine.ts:40](../../src/hazbot/engine/engine.ts#L40)), so
`makeWildfireEngine(ruleSet25).errors` is directly readable with no URL-config
mocking (B's cost) and no cross-file fragmentation (C's cost). The error-kind strings
the drafted assertion uses (`load-failure`, `parse-error`, `stub-warning` with
`stubName`) all match the real `EngineError` union
([types.ts:72-95](../../src/hazbot/engine/types.ts#L72-L95)); the `isStub` falsy check
reads `simProps.SparksAtTopAndBottom.isStub` directly in the same file. The drafted
assertion at lines 456-464 below works as written — the parenthetical fallback to the
engine-singleton path is no longer needed.

### RESOLVED (OQ-D): Should the minimum-span fraction (0.05) be a single shared constant?
**Context**: The fraction appears in the predicate (`sim-props.ts`
`MIN_SPAN_FRACTION`) and again in the `placeSparkInElevationBand` helper
(`stores.ts`, as literal `0.05`) so the helper refuses to place on terrain the
predicate would call flat. Two copies can drift.
**Options considered**:
- A) **Leave duplicated** with a cross-referencing comment (recommended for now — the predicate constant is module-private; exporting it from `sim-props.ts` pulls engine code into `stores.ts` for one number, and the value is pinned in R3).
- B) **Hoist to a shared constants module** imported by both. Cleaner single-source but adds a module + import for one literal.

**Decision**: ~~**B** (2026-06-03)~~ → **A, re-revised 2026-06-03** after the
Cypress/placement-helper drop (OQ-E). B's entire rationale was that a *second*
consumer (the `placeSparkInElevationBand` helper in `stores.ts`) had to stay in
lockstep with the predicate. With Cypress dropped and the deterministic walk now
driven by **documented coordinates** (R11 Option b) rather than a placement helper,
`stores.ts` gains no detection constants and the predicate (`sim-props.ts`) is once
again the **single consumer**. There is nothing to keep in lockstep, so
`MIN_SPAN_FRACTION` / `TOP_BOTTOM_TOLERANCE` / `HIGH_THRESHOLD` / `LOW_THRESHOLD`
stay **module-private in `sim-props.ts`**, next to the predicate, matching the
neighbor props' style. No new export to `constants.ts`, no `stores.ts` import.

**Implementation impact**: the predicate step keeps the four constants module-private
in `sim-props.ts` (no `constants.ts` change, no `stores.ts` import). The documented
coordinates in the playbook step are validated *against* these values but do not
import them (the walk uses literal model coordinates), so there is no cross-consumer
drift risk to single-source away.

### RESOLVED (OQ-E): Is the wizard-driven non-uniform zone setup in the Cypress walk worth the flakiness risk, or should the Cat-5 step be reached differently?
**Context**: The Cat 4 → 5 → 6 walk needs a **non-uniform** zone setup for Cat 5
and a **uniform** one for Cat 6. Driving the Terrain Setup wizard to make zones
differ (and on the fixed-terrain preset, terrain-type editing is disabled, so the
difference must come from drought/vegetation) adds the most fragile interaction in
the spec.
**Options considered**:
- A) **Drive the wizard** (drought slider per zone) for the non-uniform step, mirroring `setDroughtSlider` (recommended — exercises the real path end to end).
- B) **Reach Cat 5 via a smaller surface** (e.g. a debug hook that sets a single zone's drought directly) to keep the e2e deterministic, accepting slightly less fidelity.
- C) **Drop the automated Cat-5 step**, assert only the Cat 4 and Cat 6 endpoints in Cypress, and cover the Cat-5 transition with the synthetic ruleset-25 unit test (R10) plus the manual Playwright fallback.

**Decision**: ~~**C** (2026-06-03)~~ → **Drop the Cypress e2e entirely (2026-06-03,
user-confirmed)**. The question started as "how to reach Cat 5 in the Cypress walk";
the answer that survived scrutiny is that the Cypress layer itself is not worth its
cost for this story. Its only unique value over the unit layers is the
bottom-bar → `log` → `translate` → engine glue, which is thin and generic; every
WM-15-specific behavior is already guarded automatically by R4 (predicate), R9
(`buildStartReadingData` + `translate.test.ts`), R10 (`25.test.ts` Cat 4/5/6
reachability), and R6 (registry). Against that thin marginal coverage, the Cypress
spec concentrated all of the plan's risk: unverified wizard selectors, the
Reload-re-gates-Setup dance, an engine-ingestion race on a `matchedCategory()` read,
and a placement helper whose basis had to be exactly right. **R5/R7 instead use a
driven Playwright walk** against the regenerated `25.md` (the project's established
per-ruleset validation workflow), with **documented, validated spark coordinates**
(R11 Option b) for deterministic top/bottom placement. This deletes two
implementation steps (the placement-helper/hook step and the Cypress step) and the
`stores.ts` + `constants.ts` changes they required.

**What dropping Cypress eliminates** (the prior self-review findings it moots):
- **Finding 1 (helper basis)** — no helper ships; the documented coordinates are
  validated directly against the global range (norm 1.00 / 0.00), so there is no
  per-zone-vs-global basis to get wrong.
- **TA-1 (Terrain Setup gating)** and **TA-2 (matched-category race)** — no Cypress
  spec, no wizard-selector dependence, no programmatic `matchedCategory()` timing.
  The Playwright walk reads the sidebar's matched row after Start, with normal
  Playwright waiting.

**Carried forward, not eliminated**:
- The **Playwright walk must actually be run** to close R5/R7 (a documented "manual
  fallback" that nobody runs would re-open the same no-automated-confirmation gap
  WM-15 fixes for the *glue*). It runs after the predicate + plumbing land.
- The **validated coordinates are preset-specific** to `mountainTwoZoneFixedTerrain`;
  if its heightmap or zone split changes, they must be re-derived. The literal
  `config.elevation` (which also disables terrain editing, R8) makes that stable.

**Implementation impact**: requirements R5/R7 reworded from "automated Cypress e2e"
to "driven Playwright walk against the regenerated playbook using documented
coordinates"; R11 settles on Option b (documented coordinates), dropping Option a
(the `placeSparkInElevationBand` helper). The playbook/docs step (above) records the
coordinates and the walk recipe.

## Self-Review

<!-- Phase 3 multi-role review (2026-06-03): Senior Engineer, QA Engineer,
     Test Automation Engineer. A11y / Security / DevOps excluded (no UI, auth,
     untrusted-input, or deployment surface in this change).

     SUPERSEDED NOTE (2026-06-03, later same day): after this pass, the Cypress e2e
     and the placeSparkInElevationBand helper were dropped (see OQ-E / OQ-D). The
     Senior-Engineer "placement helper basis" finding and both Test-Automation-Engineer
     findings (Terrain Setup gating, matched-category race) below described that
     now-removed approach and no longer apply; they are kept as a decision log. R5/R7
     are now a driven Playwright walk using documented coordinates. A fresh Phase 3
     pass against the revised plan follows in "### Phase 3 review (pass 2)". -->

### Senior Engineer

#### RESOLVED: The placement helper normalizes per-zone, but the predicate normalizes against the whole-grid range — they do not share a basis
**Resolution** (2026-06-03): `placeSparkInElevationBand` rewritten to normalize
against the **global** `simulation.baseElevationRange` (the predicate's exact basis)
and to **throw** when the chosen zone cell does not clear the predicate's band
threshold, instead of selecting against per-zone extrema. Thresholds and floor are
imported from `constants.ts` (OQ-D B) so helper and predicate agree by construction.
The helper comment is corrected. Narrowed by OQ-E (C): the helper now backs a single
Cat-6 placement, not a multi-step walk, and a throw is the documented signal to fall
back to the manual Playwright walk. See the rewritten step-4 helper above.
The `placeSparkInElevationBand` helper computes each zone's band from **that
zone's own** `baseElevation` extrema (`cells.filter(c => c.zoneIdx === zoneIdx)`
→ local min/max), and its comment claims it "mirrors the band logic the predicate
uses." But the predicate normalizes each spark against
`reading.elevationRange = simulation.baseElevationRange`, which is the **min/max
over the whole interior grid** (both zones). These bases only agree when each
zone individually spans the global extrema. On `mountainTwoZoneFixedTerrain`, if
the zones are split such that one zone sits mostly low on the slope, that zone's
local "top" cell can normalize to well under 0.75 against the *global* range — so
`placeSparkInElevationBand(0, "top")` would place a spark the predicate then
scores as "not at top," and the Cat 5/6 e2e fails despite "correct" placement (or,
worse, passes for a geometry-specific reason that breaks on a preset change).
**Why it matters**: this is the deterministic-walk guarantee R11 exists to
provide; a per-zone basis silently undercuts it. **Suggested resolution**: select
the band cell against the **global** `simulation.baseElevationRange` (the exact
value the predicate sees) rather than per-zone extrema — e.g. find the
zone-`zoneIdx` cell whose global-normalized `baseElevation` is highest/lowest and
assert it clears the 0.75 / 0.25 threshold, throwing if no cell in that zone does.
Correct the helper comment either way, and state the zone-geometry assumption in
R11 if any per-zone shortcut is kept.

#### RESOLVED: `isTerrainEdge` advertises geometry it doesn't implement (the preserved off-by-one)
**Resolution** (2026-06-03): folded into the OQ-B decision (Option A) — the
`isTerrainEdge` doc-comment must state it reproduces exactly the cells
`fillTerrainEdges` zeros, which (because the `y === this.gridHeight` clause is never
true) means the bottom grid row is intentionally **not** zeroed and **not** excluded
(bug-for-bug parity, not true geometric edges), so a future reader does not "fix" the
off-by-one and silently shift the payload range.

OQ-B Option A (extract `isTerrainEdge` with `y === this.gridHeight` preserved
verbatim) is the right call for single-source parity with `populateCellsData`.
But the consequence should be named in code and in R3: because `y === gridHeight`
is never true, the **bottom grid row is not zeroed and not excluded** — those
cells keep real `baseElevation` and therefore legitimately enter `elevationRange`.
That is internally consistent with "exclude exactly the cells `fillTerrainEdges`
zeroed," but a reader sees a `public isTerrainEdge` that misses the bottom edge and
reasonably suspects a bug. **Why it matters**: a future "cleanup" could silently
change the payload range by fixing the off-by-one. **Suggested resolution**: in
the `isTerrainEdge` doc-comment, state explicitly that it reproduces exactly the
cells `fillTerrainEdges` zeros (so the bottom grid row is intentionally **not**
zeroed and **not** excluded, given the `y === this.gridHeight` off-by-one), not true
geometric edges; cross-reference OQ-B.

---

### QA Engineer

#### RESOLVED: R9's replay-fixture clause (items ii + iii) has no named test home or assertion mechanism
**Resolution** (2026-06-03, Option A): the false "replay fixture exercises
`handleStart`" premise is corrected (the generator hand-builds event data and never
runs the payload assembly). The payload assembly is extracted into a pure
`SimulationModel.buildStartReadingData()` and unit-tested at the model level —
including a **fire-line-cell fixture** that pins the `cell.elevation` →
`cell.baseElevation` switch (item ii), the regression nothing else in the plan could
distinguish. `heightmapMaxElevation` (iii) is covered by the `translate.test.ts`
forwarding tests. OQ-A revised C → A; payload step (files-affected, code, test list)
and R9 in requirements.md updated to match.
The payload-step test list and OQ-A resolution route R9 items (ii) per-spark
`baseElevation` read and (iii) `heightmapMaxElevation` snapshot to "the replay
fixture (`node scripts/generate-replay-fixture.js`)." But that script **regenerates
a fixture artifact**; the plan never names the test that *reads* the regenerated
fixture and asserts those two facts, nor whether it runs under `npm test` / CI.
As written, R9's hardest-to-cover clause — the one R9 was added to guarantee —
has no runnable, regression-catching home; regenerating a fixture that nobody
asserts on proves nothing. **Why it matters**: a dropped `baseElevation` switch or
a `translate()` regression would pass R4 *and* slip through R9 exactly as the
pre-R9 state did. **Suggested resolution**: name the asserting vehicle and add it
to the payload step's files-affected — either (a) a fixture-snapshot/diff test that
loads the generated fixture and asserts spark `elevation` traces to `baseElevation`
and `heightmapMaxElevation` is present, or (b) an integration test that runs
`handleStart → log → translate` and inspects the resulting reading. State that it
runs in CI.

#### RESOLVED: The R6 registry assertion and Cat 5/6 tests depend on unverified harness affordances
**Resolution** (2026-06-03): both affordances verified. (1) `Engine` exposes public
`errors: EngineError[]` ([engine.ts:40](../../src/hazbot/engine/engine.ts#L40)), so
the R6 three-part assertion runs via `makeWildfireEngine(ruleSet25).errors` (OQ-C →
A). (2) `mkReading` spreads `Partial<WildfireReading>`
([test-helpers.ts:61-63](../../src/hazbot/rule-sets/test-helpers.ts#L61-L63)), so the
new `elevationRange` / `heightmapMaxElevation` fields reach the predicate once step 1
adds them to the type — an ordering dependency now noted in the ruleset-25-tests step.
Two `25.test.ts` assumptions are currently unconfirmed in the plan: (1) that
`makeWildfireEngine` surfaces `engine.errors` for the R6 three-part check (already
flagged as OQ-C — keep there), and (2) that the new `elevationRange` /
`heightmapMaxElevation` fields flow through `mkReading` → `matchAgainst` into the
predicate. (2) holds only because those become real `WildfireReading` fields in the
first step and `mkReading`'s opts is `Partial<WildfireReading>` — worth one explicit
line in the step so the ordering dependency (type change must land before the
`25.test.ts` step) is intentional, not incidental. **Suggested resolution**: add a
one-line note in the ruleset-25-tests step that the elevation fields reach the
predicate only because step 1 added them to the type; defer the `engine.errors`
accessor question to OQ-C.

---

### Test Automation Engineer

#### RESOLVED: The Cypress walk ignores the Terrain Setup gating documented in CLAUDE.md
**Resolution** (2026-06-03): added an explicit `dismissTerrainSetup()` helper
(Next → Create, then assert `start-button` is enabled) called after every `cy.visit`
and `reload-button` click in the rewritten e2e step, so sparks/Start act on enabled
controls. The `reload-button`/wizard-button testids are flagged for confirmation
against the running app during implementation (only `start-button` is established in
`bottom-bar-state-machine.cy.ts`). See the rewritten e2e step above.
`runWith` places sparks and clicks `start-button` immediately after each
`cy.visit` / `reload-button`, with terrain setup present only as a `// ...` comment.
But CLAUDE.md states the app opens in the **Terrain Setup dialog** (Spark/Start
disabled until you walk Next → Create), and that **Reload "forces user back through
Terrain Setup before Spark/Start re-enable."** So on first `visit` and after every
`reload-button` click, `placeSparkInZone` / `start-button` will act on a disabled
control and the spec stalls. **Why it matters**: this affects *every* `it` block,
not just the Cat-5 non-uniform step (OQ-E) — the flat-terrain Cat-4 test has the
same gating on its single `visit`. **Suggested resolution**: make the Terrain Setup
traversal explicit in `runWith` (or a `cy` command before it) — click through
Next → Create to dismiss the wizard before placing sparks — and assert Start is
enabled before clicking. Confirm the `reload-button` testid exists (only
`start-button` is established in `bottom-bar-state-machine.cy.ts`).

#### RESOLVED: The Cat 4 → 5 → 6 walk's correctness is contingent on the helper-vs-predicate basis (cross-ref Senior Engineer)
**Resolution** (2026-06-03): the helper basis is fixed (Finding 1 → global range +
throw-on-out-of-band), and OQ-E (C) drops the automated Cat-5 step so the e2e asserts
only the Cat 4 and Cat 6 endpoints. The remaining Cat-6 step still consumes
`placeSparkInElevationBand`, which now fails loudly (rather than mis-placing) if the
preset geometry can't reach the band — the OQ-E signal to use the manual Playwright
fallback. Net: the e2e can no longer pass or fail for a basis-mismatch reason.
If `placeSparkInElevationBand` selects against per-zone extrema (Senior Engineer
finding above), the `expect(matchedCategory()).to.eq(5/6)` assertions can fail on a
correctly-placed walk or pass only by `mountainTwoZoneFixedTerrain`'s specific zone
geometry. **Suggested resolution**: resolve the Senior Engineer basis finding
first; this e2e is its primary consumer. Also note OQ-E (wizard-driven non-uniform
setup) remains the most fragile single interaction and its fallback (OQ-E Option C:
drop the automated Cat-5 step, keep Cat 4 + Cat 6 endpoints) directly de-risks this.

---

### Phase 3 review (pass 2)

<!-- 2026-06-03, against the revised plan after the Cypress/helper drop (OQ-E) and
     the live Playwright topography validation. Roles: Senior Engineer, QA Engineer,
     Validation Engineer. A11y / Security / DevOps still N/A (no UI, auth,
     untrusted-input, or deployment surface). Findings grounded in the actual source
     (simulation.ts, cell.ts, bottom-bar.tsx) and the live app. -->

#### Senior Engineer — RESOLVED: the payload step switches fire-line-marker elevation to `baseElevation`, which no requirement asks for and no test covers
**Resolution** (2026-06-03, Option a): only the **spark** elevation read switches to
`baseElevation`; fire-line markers keep `cell?.elevation` (unchanged from the
original `bottom-bar.tsx`). The payload-step summary, `buildStartReadingData()` code +
comments, files-affected test line, and the bottom-bar snippet were all updated to
spark-only, keeping the change minimal and requirement-traceable.

The payload step changes **both** the per-spark and the per-fire-line-marker
elevation read from `cell?.elevation` to `cell?.baseElevation`
([bottom-bar.tsx:236,245](../../src/components/bottom-bar.tsx#L236) originals;
`buildStartReadingData()` code in this plan). But only the **spark** basis is
required: R3's "Elevation basis" and R9 (ii) speak exclusively about sparks (the
predicate never reads `fireLineMarkers`), and the R9 (ii) test pins only the spark
read. The marker switch is therefore an unrequired, untested behavior change to the
logged payload. It is also the *most* visible such change: a fire-line marker sits on
a dug cell (`isFireLine === true`), so `cell.elevation === baseElevation − FIRE_LINE_DEPTH`
([cell.ts:59-64](../../src/models/cell.ts#L59-L64)) for exactly those cells, meaning
the logged marker elevation shifts by 2000 ft for every marker. **Why it matters**:
it widens the diff beyond WM-15's requirement set and ships an untested change to data
other rule-sets or fixtures may read. **Suggested resolution**: either (a) leave fire-
line markers on `cell?.elevation` (minimal, requirement-traceable change — only the
spark read switches), or (b) keep the marker switch but add a requirement/rationale and
a test asserting the marker basis, same as the spark fire-line-cell fixture.

#### QA Engineer — RESOLVED: the R9 (i)/(ii) model tests must commit to a hand-built `Cell` fixture, or they hit the same jsdom heightmap-decode wall that killed R7's real-plains assertion
**Resolution** (2026-06-03): the deeper source check **disproved this finding's
premise**. `getInputData` ([image-utils.ts:106](../../src/models/utils/image-utils.ts#L106))
only hits the `canvas.getContext("2d")` decode path for a *string* elevation; a
**numeric** `config.elevation` array goes through the pure `populateGrid` branch, so
constructing a `SimulationModel` + `await dataReadyPromise` runs cleanly in jsdom — as
the existing `simulation.test.ts` already does. The plan's original "numeric 2D array
… sidesteps the jsdom limitation" wording was correct; no Cell-direct *construction*
route is needed for the happy-path cases (i)(a)/(b) and (ii). (Pass-3 QA refinement:
the `baseElevationRange` null case (i)(d) and the river/island-included case (i)(c)
are **not** producible from the numeric array — they are reached by post-construction
mutation of the plain `Cell` fields, e.g. `sim.cells = []` and `cell.isRiver = true`;
see the rewritten payload-step test list.)
Two small real clarifications were applied instead: the test preamble now commits to
the numeric-array construction (citing `simulation.test.ts` and the array-vs-string
branch, and noting the array values are unscaled `baseElevation`), and the (ii) bullet
specifies the fire-line cell is made by setting `cell.isFireLine = true` directly.

`baseElevationRange` and `buildStartReadingData()` iterate `this.cells`, which in
production are populated only by the **async** `populateCellsData()` path
([simulation.ts:195-244](../../src/models/simulation.ts#L195-L244)) via
`getElevationData()` and, for mountain presets, a heightmap PNG decode. The
requirements' own 3rd-pass QA finding established that PNG/canvas decode is generally
unavailable under Jest/jsdom (it is why R7's real-`plainsTwoZone` span assertion was
dropped). The plan offers "a literal `config.elevation` 2D array **or** constructing
`Cell`s directly" but does not commit. Only the **Cell-direct** route is safe: the
`Cell` constructor is a plain `Object.assign(this, props)`
([cell.ts:51-53](../../src/models/cell.ts#L51-L53)), so a test can set
`model.cells = [new Cell({ x, y, zoneIdx, baseElevation, isFireLine, ... }), ...]`
(and `model.sparks`) with no loader, no async, no PNG. **Why it matters**: a test
that constructs a `SimulationModel` and waits on `populateCellsData()` could silently
not run (or hang) in CI, leaving R9 (i)/(ii) — the hardest-won coverage — unexecuted.
**Suggested resolution**: state in the payload step's test list that the fixture sets
`cells`/`sparks` directly with hand-built `Cell`s (no `populateCellsData()`), and cite
the trivial `Cell` constructor as the enabling fact.

#### Senior Engineer — RESOLVED: OQ-B's "no behavior change" off-by-one claim is now empirically confirmed; record it so a future reader trusts the bug-for-bug parity
**Resolution** (2026-06-03): empirical-confirmation sentence added to the OQ-B
decision (range byte-identical with/without the off-by-one on
`mountainTwoZoneFixedTerrain`; parity is preset-specific and is the goal).
OQ-B keeps the `y === this.gridHeight` off-by-one (bottom row not excluded) for
bug-for-bug parity with `populateCellsData`. Live validation on
`mountainTwoZoneFixedTerrain` (2026-06-03) confirms the consequence is benign **on this
preset**: the edge-excluded range computed with the off-by-one is byte-identical to the
corrected version (`{min 1096, max 19450}` either way), because the global extrema are
not on the bottom row. **Why it matters**: this turns OQ-B's "no behavior change"
from an assertion into a checked fact, and warns that the parity is preset-specific
(a preset whose true min/max sat on the bottom row could differ). **Suggested
resolution**: add one line to the `isTerrainEdge` doc-comment / OQ-B noting the range
was verified identical with and without the off-by-one on the validation preset, and
that the parity is what matters (not geometric correctness).

#### Validation Engineer — RESOLVED: the driven Playwright walk is now the only end-to-end check and is manual, so it needs an explicit definition-of-done hook
**Resolution** (2026-06-03): added a checkable **Definition of Done** to the final
playbook/docs step (npm test green across R4/R6/R9/R10; playbook regenerated; the two
Playwright walks with explicit Cat-4/Cat-6 expectations and saved screenshots),
sequenced as the final validation activity.
With Cypress dropped, R5/R7's end-to-end confirmation is a manual Playwright walk.
The spec now says it "must actually be run," but nothing structurally enforces that
(unlike a CI job). The automated layers (R4, R6, R9, R10) carry regression protection,
so the walk's unique remaining job is a **one-time** confirmation that the real
bottom-bar → `log` → `translate` → engine glue wires up on the actual preset. **Why it
matters**: a "manual fallback" that is documented but skipped re-opens, for the glue,
the same no-automated-confirmation gap WM-15 closes for the predicate. **Suggested
resolution**: add the walk to the story's definition-of-done / PR checklist explicitly
(e.g. "Playwright walk run on `mountainTwoZoneFixedTerrain` → Cat 6 reached, and on
`plainsTwoZone` → capped at Cat 4, screenshots under `tmp/playwright/`"), and sequence
it as the final validation activity after the predicate + plumbing land.

---

### Phase 3 review (pass 3)

<!-- 2026-06-03, code-grounded pass: every candidate issue was verified against the
     actual source (data-loaders.ts, image-utils.ts, simulation.ts, cell.ts,
     engine.ts, presets.ts) before being written. Two candidates were discarded after
     verification disproved them: (a) "R6 checks only 2 of 5 load-blocking kinds" —
     false, the other three throw EngineConstructionError (engine.ts:138-147) and can
     never sit in e.errors; (b) the numeric-array jsdom claim — confirmed true. Roles:
     QA Engineer, Senior Engineer, Validation Engineer. A11y/Security/DevOps N/A. -->

#### QA Engineer — RESOLVED: the R9 payload test list cannot produce cases (i)(c)/(i)(d) from the committed numeric-array fixture
**Resolution** (2026-06-03): the payload-step (i) test list now splits the cases —
(a)/(b) use the numeric-array fixture; (c)/(d) are reached by post-construction
mutation of the plain `Cell` fields (`cell.isRiver = true`; `sim.cells = []`), since a
numeric `config.elevation` array fills every index with a finite `baseElevation` and
produces no rivers/islands, and omitting `config.elevation` derives a heightmap PNG
*string* (`getElevationData`, data-loaders.ts:33-39) that routes through the jsdom
canvas-decode path the preamble avoids. The pass-2 QA resolution's "no Cell-direct
route is needed" line is softened to scope it to (a)/(b)/(ii).

Verified: `getElevationData` never returns `undefined` (substitutes a derived PNG
string when `config.elevation` is falsy); `populateGrid` (image-utils.ts:118) fills
every grid index; the proposed `baseElevationRange` returns `null` only with no finite
`baseElevation`; `isRiver`/`baseElevation` are plain public `Cell` fields. So the only
jsdom-safe path to (c)/(d) is post-construction mutation, not the numeric-array build.

#### Senior Engineer — RESOLVED: `buildStartReadingData()` returned an inferred union that the bottom-bar consumer could not read `.elevationRange` from
**Resolution** (2026-06-03): the method now declares an explicit return type with
`elevationRange?` optional and builds the result with a spread
(`{ sparks, fireLineMarkers, ...(range ? { elevationRange: range } : {}) }`), so the
`bottom-bar` `if (startData.elevationRange)` access typechecks.

Verified: the original `return range ? {…, elevationRange} : {…}` infers the union
`{sparks; fireLineMarkers} | {sparks; fireLineMarkers; elevationRange}`; accessing
`.elevationRange` on that union is a `TS2339` (property absent from one member) and
would fail the project's typecheck/build. The fix removes the union; no behavior
change (the payload still omits `elevationRange` when `baseElevationRange` is `null`).

#### Validation Engineer — RESOLVED: recording the R11 walk coordinates in `25.md` contradicts its auto-generated nature
**Resolution** (2026-06-03): R11 (requirements.md) and this step now pin the validated
spark coordinates to **CLAUDE.md's Playwright section only**, with an explicit note
that `25.md` is auto-generated and cannot durably hold them.

Verified: `docs/hazbot-validation/25.md` opens with "AUTO-GENERATED — DO NOT EDIT";
the generator (`generate-hazbot-validation-playbook.js`) only `renderPlaybook(ruleSet,
parse)` → overwrites `${id}.md` and has no spark-coordinate input (grep for
`spark`/`coordinate`/`addSpark` returns nothing). So coordinates written into `25.md`
are clobbered by the R5/R8 regeneration the plan itself mandates; CLAUDE.md is the only
durable home.

---

### Phase 3 review (pass 4)

<!-- 2026-06-03, code-grounded pass driven by "verify every candidate against the
     actual source before writing it." Roles: Senior Engineer, QA Engineer, Validation
     Engineer. A11y/Security/DevOps N/A. Most candidates disproved on verification and
     are recorded in the chat transcript (R6 registry soundness, no spark-elevation
     ripple, no method-name collisions, isTerrainEdge byte-parity, numeric-array jsdom
     path, translate `ev` helper, R4 boundary arithmetic). One material finding stood. -->

#### Senior Engineer / QA — RESOLVED: the "regenerate the replay fixture (required by R5/R10)" instruction was both untraced and inaccurate
**Resolution** (2026-06-03, Option A): the payload-step note and OQ-A were corrected to
state the replay fixture is **not** regenerated for this story. Its ruleset-25 `startData`
sparks are elevation-less, so the real predicate fails closed on them and
`SparksAtTopAndBottom` stays `false` — the fixture's `matchedCategoryHistory` is invariant
(still caps at Cat 4), and the two new `translate` fields arrive `undefined` and are
stripped by `JSON.stringify` / `roundTrip` (with `assertJsonSafe` walking only
`temporalValues` + `temporalHistory`, not top-level reading fields). So the existing
fixture stays green with no regeneration; the Cat 4/5/6 matched-category regression is
owned by `25.test.ts` (R10) and the Playwright walk (R5). An explicit warning was added
**not** to add top/bottom elevations to `startData` (its undefined-vegetation zones make
`UniformZoneSettings` false, so a `true` predicate would silently flip the fixture to
Cat 5).

The payload step claimed regenerating the replay fixture "is still required by R5/R10
for the matched-category regression, and its event data should carry the two new fields."
Code verification (`generate-replay-fixture.js:32-36`, `replay-fixture.test.ts` strict
`toEqual` on `readings` + `matchedCategoryHistory`, `assertJsonSafe` scope at
`generate-replay-fixture.js:124-131`) showed the claim was self-contradictory: with the
existing elevation-less `startData` the matched history is invariant (so regeneration is
a byte-identical no-op, not "required"), while following the "carry the two new fields"
clause would edit `startData`, flip the predicate `true`, and silently change the
fixture's expected category to Cat 5 — an untraced change with no step, files-affected
entry, expected-outcome decision, or DoD checkbox. **Why it mattered**: the only mention
of the replay fixture in the plan steered a contributor toward either a puzzling no-op or
a silent regression-fixture change. **Suggested resolution applied**: drop the
"required" clause; document the fail-closed invariance and the do-not-edit warning.

---

### Phase 4 external review (2026-06-03)

<!-- External LLM review of implementation.md + referenced requirements/code. Three
     findings, all accepted and applied. Roles attributed by the external reviewer. -->

#### Senior Engineer — RESOLVED [HIGH]: artificial terrain-edge sparks could satisfy "bottom"
`baseElevationRange` excludes `fillTerrainEdges` perimeter cells (artificial
`baseElevation: 0`), but the per-spark read did not — and `addSpark()`
([simulation.ts:465-469](../../src/models/simulation.ts#L465-L469)) does not reject edge
cells. A spark on a zeroed perimeter cell normalized to `(0 − min)/span < 0` (≤ 0.25 →
"bottom"), so a high interior spark plus an edge spark made Cat 5/6 reachable without a
real valley placement. **Applied** (the reviewer's both-layers approach): (1)
`buildStartReadingData()` now emits `elevation: undefined` for any spark whose cell
satisfies the **same** `isTerrainEdge` predicate the range scan excludes by, failing
closed at the source; (2) the predicate adds finite + in-`[min, max]` guards as
defense-in-depth; (3) tests added — a model test (excluded-edge spark → `undefined`
elevation) and predicate tests (below-range, above-range, non-finite). R3 + R9 updated.

#### QA Engineer — RESOLVED [MEDIUM]: `localhost-urls.md` would still describe `SparksAtTopAndBottom` as stubbed
The docs step fixed only the preset; the index still calls the prop stubbed
([line 140](../../docs/hazbot-validation/localhost-urls.md#L140)) and ruleset 25 Cat 5/6
"stub-gated" ([line 166](../../docs/hazbot-validation/localhost-urls.md#L166)), which
would contradict the shipped behavior. **Applied**: the playbook/docs step now also
removes `SparksAtTopAndBottom` from the stubbed-impls note (leaving `Helitack` /
`usedHelitack` → WM-28) and updates the ruleset-25 summary row from `cats 1–4 ✓ | cats
5 & 6 stub-gated` to `cats 1–6 ✓ | none`.

#### QA Engineer — RESOLVED [LOW]: logged event schema docs omit the new `elevationRange` field
`LOGGED-EVENTS.md` ([line 12](../../LOGGED-EVENTS.md#L12)) lists the `SimulationStarted`
payload (incl. `heightmapMaxElevation`) but not `elevationRange`, and the plan didn't
list the file as affected. **Applied**: `LOGGED-EVENTS.md` added to the payload step's
files-affected, with `elevationRange: { min, max }` to be added to the documented
`SimulationStarted` parameter list (documentation-only).

---

### Phase 4 external review (2026-06-03, round 2)

<!-- Second external LLM review pass against the revised implementation.md + referenced
     code. Two MEDIUM findings, both accepted and applied. -->

#### Senior Engineer — RESOLVED [MEDIUM]: `isTerrainEdge` prose said the bottom row is "included," but the preserved predicate excludes it
The OQ-B decision and the self-review resolution both said the `isTerrainEdge`
doc-comment should state the "bottom row intentionally **included** for bug-for-bug
parity," but the loop runs `for (let y = 0; y < this.gridHeight; y++)`
([simulation.ts:210-217](../../src/models/simulation.ts#L210-L217)), so the
`y === this.gridHeight` clause is never true: the bottom grid row is **not** zeroed
and **not** excluded from the range. The "included" prose contradicted the body of the
same finding (which correctly says the bottom row is *not* excluded), and could lead an
implementer to write a false doc-comment or "fix" the off-by-one and silently shift the
payload elevation range. **Applied** (wording-only): corrected the three "bottom row
intentionally included / perimeter" references (OQ-B decision, the self-review finding
title + resolution, and the body's suggested-resolution line) to say the bottom row is
intentionally **not** zeroed / **not** excluded, framing parity as reproducing exactly
the cells `fillTerrainEdges` zeros (not a geometric perimeter). Also updated the
`isTerrainEdge` code-snippet doc-comment to spell out the preserved off-by-one and a
"do not fix it" warning, so the shipped comment matches the OQ-B requirement.

#### QA Engineer — RESOLVED [MEDIUM]: the Cat 4 → Cat 6 Playwright walk omitted the required reset between spark placements
The walk recipe (step 4) and the Definition of Done placed mid-slope sparks for Cat 4
and then the documented top/bottom coordinates for Cat 6 on the **same** 2-zone preset,
with no reset in between. Because `addSpark()` only pushes while `canAddSpark`
(`remainingSparks = zonesCount − sparks.length > 0`,
[simulation.ts:97-108,465-469](../../src/models/simulation.ts#L97-L108)), the Cat 6
`window.sim.addSpark(...)` calls would silently no-op once both zones already held a
Cat-4 spark, leaving the walk stuck at Cat 4 even with a correct implementation.
Restart keeps sparks placed; only **Reload** clears them (`setInputParamsFromConfig`
resets `sparks` to the empty `config.sparks` default —
[simulation.ts:179-182](../../src/models/simulation.ts#L179-L182),
[config.ts:114](../../src/config.ts#L114)). **Applied**: step 4 now spells out the walk
as discrete endpoints — (a) Cat 4 mid-slope, (b) **Reload + wait for `dataReady` +
re-dismiss Terrain Setup** as an explicit reset, (c) Cat 6 top/bottom, (d) flat-terrain
plains — and the DoD's mountain-walk item now includes the Reload step, noting it is
required (not optional). R5 (requirements.md) gained a matching note that the two
placements are separate endpoints each starting from a clean spark state.
