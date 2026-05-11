import { ruleSet23 } from "./23";
import { makeWildfireEngine, matchAgainst, mkReading } from "./test-helpers";
import { WildfireReading } from "../wildfire/types";

// Per AC: per-rule-set five-shape sweep.
//
// Tab 23 categories (defaults: zones=Plains/Shrub/MildDrought × 2):
//   1: NOT ranSimulation
//   2: NOT setAnyZoneVar AND ranSimulation
//   3: NOT setDroughtLevel AND setAnyZoneVar
//   4: setDroughtLevel AND NOT usedOneSparkPerZone
//   5: setDroughtLevel AND usedOneSparkPerZone
//
// (e) is N/A — no stub-gated category in this rule set.

const defaultZones = [
  { terrainType: "Plains", vegetation: "Shrub", droughtLevel: "Mild Drought" },
  { terrainType: "Plains", vegetation: "Shrub", droughtLevel: "Mild Drought" },
];

function startReading(opts: Partial<WildfireReading> = {}): WildfireReading {
  return mkReading("SimulationStarted", opts.at ?? 100, {
    zones: defaultZones,
    sparks: [],
    wind: { speed: 0, direction: 0 },
    ...opts,
  });
}

describe("ruleSet 23 — per-rule-set five-shape sweep (AC: per-rule-set five-shape sweep)", () => {
  it("(a) state matching no category — no readings yet, but cat 1 = NOT ranSimulation matches → returns 1", () => {
    // With zero readings, ranSimulation is false → cat 1 matches.
    // True "no category matches" is hard for tab 23 because cat 1 catches the empty state.
    // The closest "matches no useful work category" is the bare empty-readings case.
    const e = makeWildfireEngine(ruleSet23);
    expect(matchAgainst(ruleSet23, e, [])).toBe(1);
  });

  it("(b) state matching exactly one category — ran sim with all defaults → cat 2", () => {
    const e = makeWildfireEngine(ruleSet23);
    const r = startReading();
    expect(matchAgainst(ruleSet23, e, [r])).toBe(2);
  });

  it("(c) multi-true with highest selected — drought changed + spark per zone → cat 5 wins (highest)", () => {
    const e = makeWildfireEngine(ruleSet23);
    const r = startReading({
      zones: [
        { terrainType: "Plains", vegetation: "Shrub", droughtLevel: "Severe Drought" },
        { terrainType: "Plains", vegetation: "Shrub", droughtLevel: "Mild Drought" },
      ],
      sparks: [{ x: 0, y: 0, zone: 0 }, { x: 1, y: 0, zone: 1 }],
    });
    expect(matchAgainst(ruleSet23, e, [r])).toBe(5);
  });

  it("(d) monotonicity sequence — once cat 4 matches, a later non-matching reading leaves the floor at 4", () => {
    const e = makeWildfireEngine(ruleSet23);
    // Reading 0: ran sim with drought changed + sparks NOT per-zone → cat 4 matches.
    const r0 = startReading({
      zones: [
        { terrainType: "Plains", vegetation: "Shrub", droughtLevel: "Severe Drought" },
        { terrainType: "Plains", vegetation: "Shrub", droughtLevel: "Mild Drought" },
      ],
      sparks: [{ x: 0, y: 0, zone: 0 }],  // only one spark
    });
    expect(matchAgainst(ruleSet23, e, [r0])).toBe(4);
    // Reading 1: revert zones to defaults — per-state highest drops to cat 2 ("ran sim, no zone vars set").
    // BUT setDroughtLevel is monotone (looking back at all readings), so cat 4 still matches at i=0.
    // The floor stays at 4.
    const r1 = startReading({ at: 200 });
    expect(matchAgainst(ruleSet23, e, [r0, r1])).toBe(4);
  });
});
