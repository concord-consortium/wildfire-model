import { ruleSet42 } from "./42";
import { makeWildfireEngine, matchAgainst, mkReading } from "./test-helpers";
import { WildfireDefaults, WildfireReading, WildfireZone } from "../wildfire/types";

// Tab 42 categories (regenerated from the 2026-05-22 sheet; Cat 100 dropped):
//   1: NOT ranSimulation
//   2: setAnyVar
//   3: ranSimulation AND NOT setAnyVar
// Categories 2 and 3 are mutually exclusive (setAnyVar vs NOT setAnyVar), so
// (c) verifies the highest single-true category. No stub-gated category: (e) N/A.

// SIMINIT defaults for tab 42: 2 zones (Foothills/Grass/Medium Drought,
// Foothills/Shrub/Mild Drought), wind magnitude 10 / direction 270.5.
const defaultZones: WildfireZone[] = [
  { terrainType: "Foothills", vegetation: "Grass", droughtLevel: "Medium Drought" },
  { terrainType: "Foothills", vegetation: "Shrub", droughtLevel: "Mild Drought" },
];
const defaultWind = { speed: 10, direction: 270.5 };
const defaults: WildfireDefaults = { zones: defaultZones, wind: defaultWind };

function startReading(opts: Partial<WildfireReading> = {}): WildfireReading {
  return mkReading("SimulationStarted", opts.at ?? 100, {
    zones: defaultZones, sparks: [], wind: defaultWind, ...opts,
  });
}

describe("ruleSet 42 — per-rule-set behavior sweep", () => {
  it("(a) empty readings → cat 1 (NOT ranSimulation)", () => {
    const e = makeWildfireEngine(ruleSet42, defaults);
    expect(matchAgainst(ruleSet42, e, [])).toBe(1);
  });
  it("(b) ran sim with a changed wind → cat 2 (setAnyVar)", () => {
    const e = makeWildfireEngine(ruleSet42, defaults);
    expect(matchAgainst(ruleSet42, e, [startReading({ wind: { speed: 25, direction: 90 } })])).toBe(2);
  });
  it("(c) highest single-true — ran sim with no changes → cat 3", () => {
    const e = makeWildfireEngine(ruleSet42, defaults);
    expect(matchAgainst(ruleSet42, e, [startReading()])).toBe(3);
  });
  it("(d) stability — cat 2 holds across a later all-default run", () => {
    const e = makeWildfireEngine(ruleSet42, defaults);
    const r0 = startReading({ wind: { speed: 25, direction: 90 } });
    expect(matchAgainst(ruleSet42, e, [r0])).toBe(2);
    expect(matchAgainst(ruleSet42, e, [r0, startReading({ at: 200 })])).toBe(2);
  });
});

describe("ruleSet 42 — R9 per-category coverage", () => {
  const e = () => makeWildfireEngine(ruleSet42, defaults);
  it("cat 1 — no run", () => expect(matchAgainst(ruleSet42, e(), [])).toBe(1));
  it("cat 2 — ran with a changed variable", () =>
    expect(matchAgainst(ruleSet42, e(), [startReading({ wind: { speed: 25, direction: 90 } })])).toBe(2));
  it("cat 3 — ran with no changes", () =>
    expect(matchAgainst(ruleSet42, e(), [startReading()])).toBe(3));
});
