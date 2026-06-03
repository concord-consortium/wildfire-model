import { ruleSet25 } from "./25";
import { makeWildfireEngine, matchAgainst, mkReading } from "./test-helpers";
import { simProps } from "../wildfire/sim-props";
import { WildfireReading } from "../wildfire/types";

// Tab 25 categories (regenerated from the 2026-05-22 sheet; Cat 100 dropped):
//   1: NOT ranSimulation
//   2: ranSimulation WITH NOT TwoSparks
//   3: ranSimulation WITH NOT OneSparkPerZone AND TwoSparks
//   4: ranSimulation WITH OneSparkPerZone AND NOT SparksAtTopAndBottom
//   5: ranSimulation WITH OneSparkPerZone AND SparksAtTopAndBottom AND NOT UniformZoneSettings
//   6: ranSimulation WITH OneSparkPerZone AND SparksAtTopAndBottom AND UniformZoneSettings
//
// SparksAtTopAndBottom was implemented in WM-15, so cats 5 and 6 are now
// reachable: a run qualifies when one spark normalizes into the top 25% of the
// elevation range and the other into the bottom 25%. Readings driving cats 5/6
// must carry per-spark `elevation`, `elevationRange`, and `heightmapMaxElevation`
// so the predicate can evaluate (mkReading spreads Partial<WildfireReading>, and
// those fields became real WildfireReading fields in the same WM-15 change).
//
// Tab 25 references no `set*` factor variable and no defaults-consuming sim-prop
// (UniformZoneSettings compares zones to each other), so it omits `defaults`.

// SIMINIT defaults for tab 25: 2 zones Mountains / Shrub / Mild Drought.
const uniformZones = [
  { vegetation: "Shrub", droughtLevel: "Mild Drought" },
  { vegetation: "Shrub", droughtLevel: "Mild Drought" },
];
const nonUniformZones = [
  { vegetation: "Shrub", droughtLevel: "Mild Drought" },
  { vegetation: "Forest", droughtLevel: "Mild Drought" },
];
const oneSpark = [{ x: 0, y: 0, zoneIdx: 0 }];
const twoSparksSameZone = [{ x: 0, y: 0, zoneIdx: 0 }, { x: 1, y: 0, zoneIdx: 0 }];
const oneSparkPerZone = [{ x: 0, y: 0, zoneIdx: 0 }, { x: 1, y: 0, zoneIdx: 1 }];

// Topography fixtures for the cats 4/5/6 readings (WM-15). The range + max clear
// the predicate's 5% × 20000 = 1000 ft minimum-span floor.
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

function startReading(opts: Partial<WildfireReading> = {}): WildfireReading {
  return mkReading("SimulationStarted", opts.at ?? 100, {
    zones: uniformZones, sparks: [], wind: { speed: 0, direction: 0 }, ...opts,
  });
}

// startReading + the topography fields the SparksAtTopAndBottom predicate needs.
function topoReading(opts: Partial<WildfireReading> = {}): WildfireReading {
  return startReading({ elevationRange: ELEV_RANGE, heightmapMaxElevation: HEIGHTMAP_MAX, ...opts });
}

describe("ruleSet 25 — per-rule-set behavior sweep", () => {
  it("(a) empty readings → cat 1 (NOT ranSimulation)", () => {
    const e = makeWildfireEngine(ruleSet25);
    expect(matchAgainst(ruleSet25, e, [])).toBe(1);
  });
  it("(b) ran sim with one spark → cat 2 (NOT TwoSparks)", () => {
    const e = makeWildfireEngine(ruleSet25);
    expect(matchAgainst(ruleSet25, e, [startReading({ sparks: oneSpark })])).toBe(2);
  });
  it("(c) multiple-true → highest wins — a one-spark run and a spark-per-zone run → cat 4", () => {
    const e = makeWildfireEngine(ruleSet25);
    const r1 = startReading({ sparks: oneSpark });
    const r2 = startReading({ at: 200, sparks: oneSparkPerZone });
    // cat 2 (a NOT-TwoSparks run exists) and cat 4 (a OneSparkPerZone run
    // exists) are both true → highest, cat 4, wins.
    expect(matchAgainst(ruleSet25, e, [r1, r2])).toBe(4);
  });
  it("(d) stability — cat 4 holds across a later one-spark run", () => {
    const e = makeWildfireEngine(ruleSet25);
    const r0 = startReading({ sparks: oneSparkPerZone });
    expect(matchAgainst(ruleSet25, e, [r0])).toBe(4);
    expect(matchAgainst(ruleSet25, e, [r0, startReading({ at: 200, sparks: oneSpark })])).toBe(4);
  });
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
});

describe("ruleSet 25 — R9 per-category coverage", () => {
  const e = () => makeWildfireEngine(ruleSet25);
  it("cat 1 — no run", () => expect(matchAgainst(ruleSet25, e(), [])).toBe(1));
  it("cat 2 — ran with one spark (NOT TwoSparks)", () =>
    expect(matchAgainst(ruleSet25, e(), [startReading({ sparks: oneSpark })])).toBe(2));
  it("cat 3 — ran with two sparks in the same zone (NOT OneSparkPerZone AND TwoSparks)", () =>
    expect(matchAgainst(ruleSet25, e(), [startReading({ sparks: twoSparksSameZone })])).toBe(3));
  it("cat 4 — ran with one spark per zone, not top/bottom", () =>
    expect(matchAgainst(ruleSet25, e(), [topoReading({ sparks: sparksPerZoneMid })])).toBe(4));
  it("cat 5 — top/bottom sparks with non-uniform zone settings", () =>
    expect(matchAgainst(ruleSet25, e(), [topoReading({ sparks: sparksTopBottom, zones: nonUniformZones })])).toBe(5));
  it("cat 6 — top/bottom sparks with uniform zone settings (success)", () =>
    expect(matchAgainst(ruleSet25, e(), [topoReading({ sparks: sparksTopBottom, zones: uniformZones })])).toBe(6));
});

describe("ruleSet 25 — SparksAtTopAndBottom no longer stub-gated (R6)", () => {
  // The engine suppresses stub-warnings under a load-blocking error
  // (engine.ts:243), so a bare "no stub-warning" check can pass for the wrong
  // reason. Assert all three: clean load, no stub-warning for this prop, and the
  // flag actually removed.
  it("ruleset 25 loads with no stub-warning for SparksAtTopAndBottom", () => {
    const e = makeWildfireEngine(ruleSet25);
    // 1) no load-blocking error
    expect(e.errors.some((err) => err.kind === "load-failure" || err.kind === "parse-error")).toBe(false);
    // 2) no stub-warning emitted for this prop
    expect(e.errors.some((err) => err.kind === "stub-warning" && err.stubName === "SparksAtTopAndBottom")).toBe(false);
    // 3) the flag was actually removed
    expect(simProps.SparksAtTopAndBottom.isStub).toBeFalsy();
  });
});
