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
// SparksAtTopAndBottom is now localized via multi-scale TPI, so cats 5 and 6 are
// reachable when one spark sits on a ridge (TPI > margin above its surroundings)
// and the other in a valley (TPI < margin below). Readings driving cats 5/6 must
// carry per-spark `tpi` arrays plus `heightmapMaxElevation` (which scales the
// margin) so the predicate can evaluate (mkReading spreads Partial<WildfireReading>).
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

// Topography fixtures for the cats 4/5/6 readings. heightmapMaxElevation scales
// the predicate's margin (5% × 20000 = 1000 ft); the ridge / valley TPI arrays
// clear it, the mid-slope arrays do not.
const HEIGHTMAP_MAX = 20000;
// One spark per zone: zone 0 on a ridge (positive TPI at every scale), zone 1 in
// a valley (negative TPI at every scale).
const sparksTopBottom = [
  { x: 0, y: 0, zoneIdx: 0, tpi: [3000, 2000, 1500] },
  { x: 1, y: 0, zoneIdx: 1, tpi: [-3000, -2000, -1500] },
];
// One spark per zone, both mid-slope (TPI ~ 0 -> NOT top/bottom).
const sparksPerZoneMid = [
  { x: 0, y: 0, zoneIdx: 0, tpi: [200, -100, 50] },
  { x: 1, y: 0, zoneIdx: 1, tpi: [-150, 100, 0] },
];

function startReading(opts: Partial<WildfireReading> = {}): WildfireReading {
  return mkReading("SimulationStarted", opts.at ?? 100, {
    zones: uniformZones, sparks: [], wind: { speed: 0, direction: 0 }, ...opts,
  });
}

// startReading + the topography field the SparksAtTopAndBottom predicate needs.
function topoReading(opts: Partial<WildfireReading> = {}): WildfireReading {
  return startReading({ heightmapMaxElevation: HEIGHTMAP_MAX, ...opts });
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
