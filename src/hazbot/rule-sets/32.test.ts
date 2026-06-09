import { ruleSet32 } from "./32";
import { makeWildfireEngine, matchAgainst, mkReading } from "./test-helpers";
import { WildfireDefaults, WildfireReading, WildfireZone } from "../wildfire/types";

// Tab 32 categories (regenerated from the 2026-05-22 sheet; Cat 100 dropped):
//   1: NOT ranSimulation
//   2: ranSimulation AND NOT setAnyZoneVar
//   3: setDroughtLevel AND NOT ranSimulation WITH UniqueVegetationPerZone
//   4: ranSimulation WITH UniqueVegetationPerZone AND NOT UniformDroughtLevels
//   5: ranSimulation WITH UniqueVegetationPerZone AND NOT OneSparkPerZone
//   6: ranSimulation WITH UniqueVegetationPerZone AND UniformDroughtLevels AND OneSparkPerZone
// No stub-gated category — the (e) shape is N/A.

// SIMINIT defaults for tab 32: 3 zones Plains / Grass / Mild Drought, wind 0/0.
const defaultZone: WildfireZone = { terrainType: "Plains", vegetation: "Grass", droughtLevel: "Mild Drought" };
const defaultZones = [defaultZone, defaultZone, defaultZone];
const defaults: WildfireDefaults = { zones: defaultZones, wind: { speed: 0, direction: 0 } };

// Three distinct vegetations, one per zone → UniqueVegetationPerZone true.
const uniqueVegUniformDrought: WildfireZone[] = [
  { terrainType: "Plains", vegetation: "Grass", droughtLevel: "Mild Drought" },
  { terrainType: "Plains", vegetation: "Shrub", droughtLevel: "Mild Drought" },
  { terrainType: "Plains", vegetation: "Forest", droughtLevel: "Mild Drought" },
];
const uniqueVegNonUniformDrought: WildfireZone[] = [
  { terrainType: "Plains", vegetation: "Grass", droughtLevel: "Mild Drought" },
  { terrainType: "Plains", vegetation: "Shrub", droughtLevel: "Mild Drought" },
  { terrainType: "Plains", vegetation: "Forest", droughtLevel: "Severe Drought" },
];
// Drought changed but vegetation left at default (all Grass) → not unique veg.
const droughtChangedNotUniqueVeg: WildfireZone[] = [
  { terrainType: "Plains", vegetation: "Grass", droughtLevel: "Severe Drought" },
  { terrainType: "Plains", vegetation: "Grass", droughtLevel: "Mild Drought" },
  { terrainType: "Plains", vegetation: "Grass", droughtLevel: "Mild Drought" },
];
const sparksPerZone = [
  { x: 0, y: 0, zoneIdx: 0 }, { x: 1, y: 0, zoneIdx: 1 }, { x: 2, y: 0, zoneIdx: 2 },
];

function startReading(opts: Partial<WildfireReading> = {}): WildfireReading {
  return mkReading("SimulationStarted", opts.at ?? 100, {
    zones: defaultZones, sparks: [], wind: { speed: 0, direction: 0 }, ...opts,
  });
}

describe("ruleSet 32 — per-rule-set behavior sweep", () => {
  it("(a) empty readings → cat 1 (NOT ranSimulation)", () => {
    const e = makeWildfireEngine(ruleSet32, defaults);
    expect(matchAgainst(ruleSet32, e, [])).toBe(1);
  });
  it("(b) ran sim with all defaults → cat 2", () => {
    const e = makeWildfireEngine(ruleSet32, defaults);
    expect(matchAgainst(ruleSet32, e, [startReading()])).toBe(2);
  });
  it("(c) multiple-true → highest wins — unique veg, non-uniform drought, no sparks → cat 4 & 5 true → cat 5", () => {
    const e = makeWildfireEngine(ruleSet32, defaults);
    expect(matchAgainst(ruleSet32, e, [startReading({ zones: uniqueVegNonUniformDrought })])).toBe(5);
  });
  it("(d) stability — cat 6 holds across a later all-default run", () => {
    const e = makeWildfireEngine(ruleSet32, defaults);
    const r0 = startReading({ zones: uniqueVegUniformDrought, sparks: sparksPerZone });
    expect(matchAgainst(ruleSet32, e, [r0])).toBe(6);
    expect(matchAgainst(ruleSet32, e, [r0, startReading({ at: 200 })])).toBe(6);
  });
});

describe("ruleSet 32 — R9 per-category coverage", () => {
  const e = () => makeWildfireEngine(ruleSet32, defaults);
  it("cat 1 — no run", () => expect(matchAgainst(ruleSet32, e(), [])).toBe(1));
  it("cat 2 — ran with all defaults", () =>
    expect(matchAgainst(ruleSet32, e(), [startReading()])).toBe(2));
  it("cat 3 — drought changed but vegetation not unique per zone", () =>
    expect(matchAgainst(ruleSet32, e(), [startReading({ zones: droughtChangedNotUniqueVeg })])).toBe(3));
  it("cat 4 — unique veg, non-uniform drought, one spark per zone", () =>
    expect(matchAgainst(ruleSet32, e(),
      [startReading({ zones: uniqueVegNonUniformDrought, sparks: sparksPerZone })])).toBe(4));
  it("cat 5 — unique veg, uniform drought, no spark per zone", () =>
    expect(matchAgainst(ruleSet32, e(), [startReading({ zones: uniqueVegUniformDrought })])).toBe(5));
  it("cat 6 — unique veg, uniform drought, one spark per zone", () =>
    expect(matchAgainst(ruleSet32, e(),
      [startReading({ zones: uniqueVegUniformDrought, sparks: sparksPerZone })])).toBe(6));
});
