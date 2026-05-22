import { ruleSet24 } from "./24";
import { makeWildfireEngine, matchAgainst, mkReading } from "./test-helpers";
import { WildfireDefaults, WildfireReading } from "../wildfire/types";
import {
  TerrainType, terrainLabels, Vegetation, vegetationLabels, DroughtLevel, droughtLabels,
} from "../../types";

// Tab 24 categories (regenerated from the 2026-05-22 sheet; Cat 100 dropped):
//   1: NOT ranSimulation
//   2: uniqueNonZeroWindValuesUsed.size == 0 AND NOT setAnyZoneVar AND ranSimulation
//   3: uniqueNonZeroWindValuesUsed.size == 0 AND setAnyZoneVar
//   4: NOT (uniqueWindValuesUsed.size > 1) AND uniqueNonZeroWindValuesUsed.size > 0
//   5: uniqueWindValuesUsed.size > 1
// Categories are mutually exclusive — no genuine multi-true state — so (c)
// verifies the highest single-true category. No stub-gated category: (e) N/A.

// SIMINIT defaults for tab 24: 2 zones Plains / Shrub / Mild Drought, wind 0/0.
const defaultZone = {
  terrainType: terrainLabels[TerrainType.Plains],
  vegetation: vegetationLabels[Vegetation.Shrub],
  droughtLevel: droughtLabels[DroughtLevel.MildDrought],
};
const defaultZones = [defaultZone, defaultZone];
const defaults: WildfireDefaults = { zones: defaultZones, wind: { speed: 0, direction: 0 } };
// A zone changed from default (zone-1 drought bumped to Severe).
const changedZones = [
  { ...defaultZone, droughtLevel: droughtLabels[DroughtLevel.SevereDrought] },
  defaultZone,
];

function startReading(opts: Partial<WildfireReading> = {}): WildfireReading {
  return mkReading("SimulationStarted", opts.at ?? 100, {
    zones: defaultZones, sparks: [], wind: { speed: 0, direction: 0 }, ...opts,
  });
}

describe("ruleSet 24 — per-rule-set behavior sweep", () => {
  it("(a) empty readings → cat 1 (NOT ranSimulation)", () => {
    const e = makeWildfireEngine(ruleSet24, defaults);
    expect(matchAgainst(ruleSet24, e, [])).toBe(1);
  });
  it("(b) ran sim with all defaults → cat 2", () => {
    const e = makeWildfireEngine(ruleSet24, defaults);
    expect(matchAgainst(ruleSet24, e, [startReading()])).toBe(2);
  });
  it("(c) highest single-true — two distinct non-zero wind runs → cat 5 wins", () => {
    const e = makeWildfireEngine(ruleSet24, defaults);
    const r1 = startReading({ wind: { speed: 5, direction: 0 } });
    const r2 = startReading({ at: 200, wind: { speed: 10, direction: 90 } });
    expect(matchAgainst(ruleSet24, e, [r1, r2])).toBe(5);
  });
  it("(d) stability — cat 4 holds across a later duplicate-wind run (size stays 1)", () => {
    const e = makeWildfireEngine(ruleSet24, defaults);
    const r1 = startReading({ wind: { speed: 5, direction: 0 } });
    expect(matchAgainst(ruleSet24, e, [r1])).toBe(4);
    const r2 = startReading({ at: 200, wind: { speed: 5, direction: 0 } });
    expect(matchAgainst(ruleSet24, e, [r1, r2])).toBe(4);
  });
});

describe("ruleSet 24 — R9 per-category coverage", () => {
  const e = () => makeWildfireEngine(ruleSet24, defaults);
  it("cat 1 — no run", () => expect(matchAgainst(ruleSet24, e(), [])).toBe(1));
  it("cat 2 — ran with all defaults, no wind", () =>
    expect(matchAgainst(ruleSet24, e(), [startReading()])).toBe(2));
  it("cat 3 — ran with a zone changed but no wind", () =>
    expect(matchAgainst(ruleSet24, e(), [startReading({ zones: changedZones })])).toBe(3));
  it("cat 4 — ran once with a non-zero wind", () =>
    expect(matchAgainst(ruleSet24, e(), [startReading({ wind: { speed: 5, direction: 0 } })])).toBe(4));
  it("cat 5 — ran with two distinct non-zero wind values", () => {
    const r1 = startReading({ wind: { speed: 5, direction: 0 } });
    const r2 = startReading({ at: 200, wind: { speed: 10, direction: 90 } });
    expect(matchAgainst(ruleSet24, e(), [r1, r2])).toBe(5);
  });
});
