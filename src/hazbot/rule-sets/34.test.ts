import { ruleSet34 } from "./34";
import { makeWildfireEngine, matchAgainst, mkReading } from "./test-helpers";
import { WildfireDefaults, WildfireReading, WildfireZone } from "../wildfire/types";

// Tab 34 categories (regenerated from the 2026-05-22 sheet; Cat 100 dropped):
//   1: NOT ranSimulation
//   2: ranSimulation AND NOT setAnyVar
//   3: setDroughtLevel AND setWind AND NOT setVegetation
//   4: setDroughtLevel AND setWind AND triedAllVegetations
// Categories are mutually exclusive (cat 3 needs NOT setVegetation, cat 4 needs
// triedAllVegetations which implies setVegetation), so (c) verifies the highest
// single-true category. No stub-gated category — the (e) shape is N/A.

// SIMINIT defaults for tab 34: 3 zones, fixed terrains Mountains / Foothills /
// Plains, all Shrub / Mild Drought, wind 0/0.
const defaultZones: WildfireZone[] = [
  { terrainType: "Mountains", vegetation: "Shrub", droughtLevel: "Mild Drought" },
  { terrainType: "Foothills", vegetation: "Shrub", droughtLevel: "Mild Drought" },
  { terrainType: "Plains", vegetation: "Shrub", droughtLevel: "Mild Drought" },
];
const defaults: WildfireDefaults = { zones: defaultZones, wind: { speed: 0, direction: 0 } };
const changedWind = { speed: 9, direction: 90 };

// Zones with drought changed (to Severe) and the given per-zone vegetation,
// keeping each zone's fixed terrain.
function zones(veg: [string, string, string]): WildfireZone[] {
  const terrains = ["Mountains", "Foothills", "Plains"];
  return [0, 1, 2].map((i) => ({
    terrainType: terrains[i], vegetation: veg[i], droughtLevel: "Severe Drought",
  }));
}

function startReading(opts: Partial<WildfireReading> = {}): WildfireReading {
  return mkReading("SimulationStarted", opts.at ?? 100, {
    zones: defaultZones, sparks: [], wind: { speed: 0, direction: 0 }, ...opts,
  });
}

// A pair of runs whose zone vegetation, across the two, covers all four
// Vegetation values → triedAllVegetations true.
const triedAllVegRuns = [
  startReading({ zones: zones(["Grass", "Shrub", "Forest"]), wind: changedWind }),
  startReading({ at: 200, zones: zones(["Forest With Suppression", "Shrub", "Shrub"]), wind: changedWind }),
];

describe("ruleSet 34 — per-rule-set behavior sweep", () => {
  it("(a) empty readings → cat 1 (NOT ranSimulation)", () => {
    const e = makeWildfireEngine(ruleSet34, defaults);
    expect(matchAgainst(ruleSet34, e, [])).toBe(1);
  });
  it("(b) ran sim with all defaults → cat 2", () => {
    const e = makeWildfireEngine(ruleSet34, defaults);
    expect(matchAgainst(ruleSet34, e, [startReading()])).toBe(2);
  });
  it("(c) highest single-true — drought + wind changed and all vegetations tried → cat 4", () => {
    const e = makeWildfireEngine(ruleSet34, defaults);
    expect(matchAgainst(ruleSet34, e, triedAllVegRuns)).toBe(4);
  });
  it("(d) stability — cat 4 holds across a later all-default run", () => {
    const e = makeWildfireEngine(ruleSet34, defaults);
    expect(matchAgainst(ruleSet34, e, triedAllVegRuns)).toBe(4);
    expect(matchAgainst(ruleSet34, e, [...triedAllVegRuns, startReading({ at: 300 })])).toBe(4);
  });
});

describe("ruleSet 34 — R9 per-category coverage", () => {
  const e = () => makeWildfireEngine(ruleSet34, defaults);
  it("cat 1 — no run", () => expect(matchAgainst(ruleSet34, e(), [])).toBe(1));
  it("cat 2 — ran with all defaults", () =>
    expect(matchAgainst(ruleSet34, e(), [startReading()])).toBe(2));
  it("cat 3 — drought and wind changed but vegetation unchanged", () => {
    // All zones still Shrub (default veg) → setVegetation false.
    const r = startReading({ zones: zones(["Shrub", "Shrub", "Shrub"]), wind: changedWind });
    expect(matchAgainst(ruleSet34, e(), [r])).toBe(3);
  });
  it("cat 4 — drought and wind changed and all four vegetations tried across runs", () =>
    expect(matchAgainst(ruleSet34, e(), triedAllVegRuns)).toBe(4));
});
