import { ruleSet35 } from "./35";
import { makeWildfireEngine, matchAgainst, mkReading } from "./test-helpers";
import { WildfireDefaults, WildfireReading, WildfireZone } from "../wildfire/types";

// Tab 35 categories (regenerated from the 2026-05-22 sheet; Cat 100 dropped):
//   1: NOT ranSimulation
//   2: ranSimulation AND NOT setAnyVar
//   3: ranSimulation WITH NOT ForestWAWOSuppression
//   4: ranSimulation WITH ForestWAWOSuppression AND NOT UniformDroughtLevels
//   5: ranSimulation WITH ForestWAWOSuppression AND NOT UniformTerrainTypes
//   6: ranSimulation WITH ForestWAWOSuppression AND UniformTerrainTypes AND UniformDroughtLevels AND NOT OneSparkPerZone
//   7: ranSimulation WITH ForestWAWOSuppression AND UniformTerrainTypes AND UniformDroughtLevels AND OneSparkPerZone
//
// Cat 2 is UNREACHABLE: cat 3 (`ranSimulation WITH NOT ForestWAWOSuppression`)
// has no setAnyVar guard, so any default run that satisfies cat 2 also lacks the
// forest pairing and thus satisfies cat 3 — cat 3 always shadows cat 2. (Tab 33's
// analogous cat 3 carries a `setAnyVar AND` guard; tab 35's does not.) This is a
// faithful extraction of a sheet-quality issue, flagged to the sheet author per
// the WM-18 spec's Out of Scope. Cat 2 is excluded from R9 per-category coverage.
// No stub-gated category — the (e) shape is N/A.

// SIMINIT defaults for tab 35: 2 zones Mountains / Shrub / Mild Drought, wind 0/0.
const defaultZone: WildfireZone = { terrainType: "Mountains", vegetation: "Shrub", droughtLevel: "Mild Drought" };
const defaultZones = [defaultZone, defaultZone];
const defaults: WildfireDefaults = { zones: defaultZones, wind: { speed: 0, direction: 0 } };

// One zone Forest, the other Forest With Suppression → ForestWAWOSuppression true.
const forestWW: WildfireZone[] = [
  { terrainType: "Mountains", vegetation: "Forest", droughtLevel: "Mild Drought" },
  { terrainType: "Mountains", vegetation: "Forest With Suppression", droughtLevel: "Mild Drought" },
];
const forestWWNonUniformDrought: WildfireZone[] = [
  { terrainType: "Mountains", vegetation: "Forest", droughtLevel: "Mild Drought" },
  { terrainType: "Mountains", vegetation: "Forest With Suppression", droughtLevel: "Severe Drought" },
];
const forestWWNonUniformTerrain: WildfireZone[] = [
  { terrainType: "Mountains", vegetation: "Forest", droughtLevel: "Mild Drought" },
  { terrainType: "Foothills", vegetation: "Forest With Suppression", droughtLevel: "Mild Drought" },
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

describe("ruleSet 35 — per-rule-set behavior sweep", () => {
  it("(a) empty readings → cat 1 (NOT ranSimulation)", () => {
    const e = makeWildfireEngine(ruleSet35, defaults);
    expect(matchAgainst(ruleSet35, e, [])).toBe(1);
  });
  it("(b) single match — forest pairing with non-uniform drought → cat 4", () => {
    const e = makeWildfireEngine(ruleSet35, defaults);
    expect(matchAgainst(ruleSet35, e, [startReading({ zones: forestWWNonUniformDrought })])).toBe(4);
  });
  it("(c) multiple-true → highest wins — a no-forest run and a forest-pair spark-less run → cat 6", () => {
    const e = makeWildfireEngine(ruleSet35, defaults);
    const noForest = startReading({ zones: changedNotForest });
    const forestNoSparks = startReading({ at: 200, zones: forestWW });
    // cat 3 (a run without the forest pairing exists) and cat 6 (a forest-pair
    // run with uniform terrain+drought and no spark per zone exists) → cat 6.
    expect(matchAgainst(ruleSet35, e, [noForest, forestNoSparks])).toBe(6);
  });
  it("(d) stability — cat 7 holds across a later no-forest run", () => {
    const e = makeWildfireEngine(ruleSet35, defaults);
    const r0 = startReading({ zones: forestWW, sparks: sparksPerZone });
    expect(matchAgainst(ruleSet35, e, [r0])).toBe(7);
    expect(matchAgainst(ruleSet35, e, [r0, startReading({ at: 200, zones: changedNotForest })])).toBe(7);
  });
});

describe("ruleSet 35 — R9 per-category coverage", () => {
  // Cat 2 is unreachable (shadowed by cat 3 — see the file header) and excluded.
  const e = () => makeWildfireEngine(ruleSet35, defaults);
  it("cat 1 — no run", () => expect(matchAgainst(ruleSet35, e(), [])).toBe(1));
  it("cat 3 — ran without the forest-with/without-suppression pairing", () =>
    expect(matchAgainst(ruleSet35, e(), [startReading({ zones: changedNotForest })])).toBe(3));
  it("cat 4 — forest pairing with non-uniform drought", () =>
    expect(matchAgainst(ruleSet35, e(), [startReading({ zones: forestWWNonUniformDrought })])).toBe(4));
  it("cat 5 — forest pairing with non-uniform terrain (uniform drought)", () =>
    expect(matchAgainst(ruleSet35, e(), [startReading({ zones: forestWWNonUniformTerrain })])).toBe(5));
  it("cat 6 — forest pairing, uniform terrain+drought, no spark per zone", () =>
    expect(matchAgainst(ruleSet35, e(), [startReading({ zones: forestWW })])).toBe(6));
  it("cat 7 — forest pairing, uniform terrain+drought, one spark per zone", () =>
    expect(matchAgainst(ruleSet35, e(), [startReading({ zones: forestWW, sparks: sparksPerZone })])).toBe(7));
  it("cat 2 is unreachable — an all-default run is shadowed by cat 3", () =>
    expect(matchAgainst(ruleSet35, e(), [startReading()])).toBe(3));
});
