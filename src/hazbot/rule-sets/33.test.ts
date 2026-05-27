import { ruleSet33 } from "./33";
import { makeWildfireEngine, matchAgainst, mkReading } from "./test-helpers";
import { WildfireDefaults, WildfireReading, WildfireZone } from "../wildfire/types";

// Tab 33 categories (regenerated from the 2026-05-22 sheet; Cat 100 dropped):
//   1: NOT ranSimulation
//   2: ranSimulation AND NOT setAnyVar
//   3: setAnyVar AND ranSimulation WITH NOT ForestWAWOSuppression
//   4: ranSimulation WITH ForestWAWOSuppression AND NOT OneSparkPerZone
//   5: ranSimulation WITH ForestWAWOSuppression AND OneSparkPerZone AND NOT UniformDroughtLevels
//   6: ranSimulation WITH ForestWAWOSuppression AND OneSparkPerZone AND UniformDroughtLevels
// No stub-gated category — the (e) shape is N/A.

// SIMINIT defaults for tab 33: 2 zones Mountains / Shrub / Mild Drought, wind 0/0.
const defaultZone: WildfireZone = { terrainType: "Mountains", vegetation: "Shrub", droughtLevel: "Mild Drought" };
const defaultZones = [defaultZone, defaultZone];
const defaults: WildfireDefaults = { zones: defaultZones, wind: { speed: 0, direction: 0 } };

// One zone Forest, the other Forest With Suppression → ForestWAWOSuppression true.
const forestWWUniformDrought: WildfireZone[] = [
  { terrainType: "Mountains", vegetation: "Forest", droughtLevel: "Mild Drought" },
  { terrainType: "Mountains", vegetation: "Forest With Suppression", droughtLevel: "Mild Drought" },
];
const forestWWNonUniformDrought: WildfireZone[] = [
  { terrainType: "Mountains", vegetation: "Forest", droughtLevel: "Mild Drought" },
  { terrainType: "Mountains", vegetation: "Forest With Suppression", droughtLevel: "Severe Drought" },
];
// A var changed (drought) but no forest-with/without-suppression pairing.
const changedNotForest: WildfireZone[] = [
  { terrainType: "Mountains", vegetation: "Shrub", droughtLevel: "Severe Drought" },
  { terrainType: "Mountains", vegetation: "Shrub", droughtLevel: "Mild Drought" },
];
const sparksPerZone = [{ x: 0, y: 0, zoneIdx: 0 }, { x: 1, y: 0, zoneIdx: 1 }];

function startReading(opts: Partial<WildfireReading> = {}): WildfireReading {
  return mkReading("SimulationStarted", opts.at ?? 100, {
    zones: defaultZones, sparks: [], wind: { speed: 0, direction: 0 }, ...opts,
  });
}

describe("ruleSet 33 — per-rule-set behavior sweep", () => {
  it("(a) empty readings → cat 1 (NOT ranSimulation)", () => {
    const e = makeWildfireEngine(ruleSet33, defaults);
    expect(matchAgainst(ruleSet33, e, [])).toBe(1);
  });
  it("(b) ran sim with all defaults → cat 2", () => {
    const e = makeWildfireEngine(ruleSet33, defaults);
    expect(matchAgainst(ruleSet33, e, [startReading()])).toBe(2);
  });
  it("(c) multiple-true → highest wins — a changed-not-forest run and a forest-pair spark-less run → cat 4", () => {
    const e = makeWildfireEngine(ruleSet33, defaults);
    const changed = startReading({ zones: changedNotForest });
    const forestNoSparks = startReading({ at: 200, zones: forestWWUniformDrought });
    // cat 3 (a changed run without the forest pairing exists) and cat 4 (a
    // forest-pairing run with no spark per zone exists) are both true → cat 4.
    expect(matchAgainst(ruleSet33, e, [changed, forestNoSparks])).toBe(4);
  });
  it("(d) stability — cat 6 holds across a later all-default run", () => {
    const e = makeWildfireEngine(ruleSet33, defaults);
    const r0 = startReading({ zones: forestWWUniformDrought, sparks: sparksPerZone });
    expect(matchAgainst(ruleSet33, e, [r0])).toBe(6);
    expect(matchAgainst(ruleSet33, e, [r0, startReading({ at: 200 })])).toBe(6);
  });
});

describe("ruleSet 33 — R9 per-category coverage", () => {
  const e = () => makeWildfireEngine(ruleSet33, defaults);
  it("cat 1 — no run", () => expect(matchAgainst(ruleSet33, e(), [])).toBe(1));
  it("cat 2 — ran with all defaults", () =>
    expect(matchAgainst(ruleSet33, e(), [startReading()])).toBe(2));
  it("cat 3 — a var changed but no forest-with/without-suppression pairing", () =>
    expect(matchAgainst(ruleSet33, e(), [startReading({ zones: changedNotForest })])).toBe(3));
  it("cat 4 — forest pairing but no spark per zone", () =>
    expect(matchAgainst(ruleSet33, e(), [startReading({ zones: forestWWUniformDrought })])).toBe(4));
  it("cat 5 — forest pairing, one spark per zone, non-uniform drought", () =>
    expect(matchAgainst(ruleSet33, e(),
      [startReading({ zones: forestWWNonUniformDrought, sparks: sparksPerZone })])).toBe(5));
  it("cat 6 — forest pairing, one spark per zone, uniform drought", () =>
    expect(matchAgainst(ruleSet33, e(),
      [startReading({ zones: forestWWUniformDrought, sparks: sparksPerZone })])).toBe(6));
});
