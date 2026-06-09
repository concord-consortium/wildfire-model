import { ruleSet23 } from "./23";
import { makeWildfireEngine, matchAgainst, mkReading } from "./test-helpers";
import { WildfireDefaults, WildfireReading } from "../wildfire/types";
import {
  TerrainType, terrainLabels, Vegetation, vegetationLabels, DroughtLevel, droughtLabels,
} from "../../types";

// Tab 23 categories (regenerated from the 2026-05-22 sheet; the Cat 100
// feedback-mechanism row is dropped by the extractor):
//   1: NOT ranSimulation
//   2: NOT setAnyZoneVar AND ranSimulation
//   3: setAnyZoneVar AND ranSimulation WITH NOT CorrectZoneSetup
//   4: ranSimulation WITH CorrectZoneSetup AND NOT OneSparkPerZone
//   5: ranSimulation WITH CorrectZoneSetup AND OneSparkPerZone
// No stub-gated category — the (e) shape is N/A.

// SIMINIT defaults for tab 23: 2 zones Plains / Shrub / Mild Drought, wind 0/0.
const defaultZone = {
  terrainType: terrainLabels[TerrainType.Plains],
  vegetation: vegetationLabels[Vegetation.Shrub],
  droughtLevel: droughtLabels[DroughtLevel.MildDrought],
};
const defaultZones = [defaultZone, defaultZone];
const defaults: WildfireDefaults = { zones: defaultZones, wind: { speed: 0, direction: 0 } };

// The sheet-defined "correct zone setup" (CorrectZoneSetup, tab 23 R16):
//   zone 1 = Foothills / Grass / No Drought; zone 2 = Foothills / Grass / Mild Drought.
// Built through the label maps so a src/types.ts relabeling tracks automatically.
const correctZones = [
  {
    terrainType: terrainLabels[TerrainType.Foothills],
    vegetation: vegetationLabels[Vegetation.Grass],
    droughtLevel: droughtLabels[DroughtLevel.NoDrought],
  },
  {
    terrainType: terrainLabels[TerrainType.Foothills],
    vegetation: vegetationLabels[Vegetation.Grass],
    droughtLevel: droughtLabels[DroughtLevel.MildDrought],
  },
];
// Changed from default but NOT the correct setup (zone-1 drought bumped to Severe).
const changedIncorrectZones = [
  { ...defaultZone, droughtLevel: droughtLabels[DroughtLevel.SevereDrought] },
  defaultZone,
];
const sparksPerZone = [{ x: 0, y: 0, zoneIdx: 0 }, { x: 1, y: 0, zoneIdx: 1 }];

function startReading(opts: Partial<WildfireReading> = {}): WildfireReading {
  return mkReading("SimulationStarted", opts.at ?? 100, {
    zones: defaultZones, sparks: [], wind: { speed: 0, direction: 0 }, ...opts,
  });
}

describe("ruleSet 23 — per-rule-set behavior sweep", () => {
  it("(a) empty readings → cat 1 (NOT ranSimulation)", () => {
    const e = makeWildfireEngine(ruleSet23, defaults);
    expect(matchAgainst(ruleSet23, e, [])).toBe(1);
  });
  it("(b) ran sim with all defaults → cat 2 (NOT setAnyZoneVar AND ranSimulation)", () => {
    const e = makeWildfireEngine(ruleSet23, defaults);
    expect(matchAgainst(ruleSet23, e, [startReading()])).toBe(2);
  });
  it("(c) multiple-true → highest wins — an incorrect-setup run and a correct-setup spark-less run → cat 4", () => {
    const e = makeWildfireEngine(ruleSet23, defaults);
    const incorrect = startReading({ zones: changedIncorrectZones });
    const correctNoSparks = startReading({ at: 200, zones: correctZones });
    // cat 3 (an incorrect-setup run exists) and cat 4 (a correct-setup run with
    // no spark per zone exists) are both true → highest, cat 4, wins.
    expect(matchAgainst(ruleSet23, e, [incorrect, correctNoSparks])).toBe(4);
  });
  it("(d) stability — cat 4 holds across a later all-default run", () => {
    const e = makeWildfireEngine(ruleSet23, defaults);
    const r0 = startReading({ zones: correctZones });
    expect(matchAgainst(ruleSet23, e, [r0])).toBe(4);
    expect(matchAgainst(ruleSet23, e, [r0, startReading({ at: 200 })])).toBe(4);
  });
});

describe("ruleSet 23 — R9 per-category coverage", () => {
  const e = () => makeWildfireEngine(ruleSet23, defaults);
  it("cat 1 — no run", () => expect(matchAgainst(ruleSet23, e(), [])).toBe(1));
  it("cat 2 — ran with all defaults", () =>
    expect(matchAgainst(ruleSet23, e(), [startReading()])).toBe(2));
  it("cat 3 — ran with zones changed but not the correct setup", () =>
    expect(matchAgainst(ruleSet23, e(), [startReading({ zones: changedIncorrectZones })])).toBe(3));
  it("cat 4 — ran with the correct zone setup but not one spark per zone", () =>
    expect(matchAgainst(ruleSet23, e(), [startReading({ zones: correctZones })])).toBe(4));
  it("cat 5 — ran with the correct zone setup and one spark per zone", () =>
    expect(matchAgainst(ruleSet23, e(), [startReading({ zones: correctZones, sparks: sparksPerZone })])).toBe(5));
});
