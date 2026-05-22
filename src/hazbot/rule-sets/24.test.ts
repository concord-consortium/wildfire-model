import { ruleSet24 } from "./24";
import { makeWildfireEngine, matchAgainst, mkReading } from "./test-helpers";
import { WildfireReading } from "../wildfire/types";

// Tab 24 categories (defaults: zones=Plains/Shrub/MildDrought × 2; wind=0/0):
//   1: NOT ranSimulation
//   2: uniqueNonZeroWindValuesUsed.size == 0 AND NOT setAnyZoneVar AND ranSimulation
//   3: uniqueNonZeroWindValuesUsed.size == 0 AND setAnyZoneVar
//   4: NOT (uniqueWindValuesUsed.size > 1) AND uniqueNonZeroWindValuesUsed.size > 0
//   5: uniqueWindValuesUsed.size > 1
// (e) is N/A — no stub-gated category.

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

describe("ruleSet 24 — per-rule-set five-shape sweep", () => {
  it("(a) state matching no category — empty readings → cat 1 matches", () => {
    const e = makeWildfireEngine(ruleSet24);
    expect(matchAgainst(ruleSet24, e, [])).toBe(1);
  });

  it("(b) state matching exactly one category — ran sim with all defaults → cat 2", () => {
    const e = makeWildfireEngine(ruleSet24);
    expect(matchAgainst(ruleSet24, e, [startReading()])).toBe(2);
  });

  it("(c) multi-true with highest selected — two distinct non-zero wind readings → cat 5 wins", () => {
    const e = makeWildfireEngine(ruleSet24);
    const r1 = startReading({ wind: { speed: 5, direction: 0 } });
    const r2 = startReading({ at: 200, wind: { speed: 10, direction: 90 } });
    expect(matchAgainst(ruleSet24, e, [r1, r2])).toBe(5);
  });

  it("(d) monotonicity — once cat 4 matches, a duplicate wind reading leaves the floor at 4 (size still 1)", () => {
    const e = makeWildfireEngine(ruleSet24);
    const r1 = startReading({ wind: { speed: 5, direction: 0 } });
    expect(matchAgainst(ruleSet24, e, [r1])).toBe(4);
    const r2 = startReading({ at: 200, wind: { speed: 5, direction: 0 } }); // same wind value
    // uniqueWindValuesUsed.size == 1 still → cat 5 doesn't match; cat 4 stays.
    expect(matchAgainst(ruleSet24, e, [r1, r2])).toBe(4);
  });
});
