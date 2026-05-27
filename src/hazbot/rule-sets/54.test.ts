import { ruleSet54 } from "./54";
import { makeWildfireEngine, matchAgainst, mkReading } from "./test-helpers";
import { WildfireDefaults, WildfireReading, WildfireZone } from "../wildfire/types";

// Tab 54 categories (regenerated from the 2026-05-22 sheet; Cat 100 dropped):
//   1: NOT ranSimulation
//   2: ranSimulation WITH NOT DefaultVegetations AND NOT SevereDroughts
//   3: ranSimulation WITH DefaultVegetations AND SevereDroughts AND NOT (Fireline OR Helitack)
//   4: ranSimulation WITH DefaultVegetations AND SevereDroughts AND (Fireline OR Helitack)
//
// Helitack is a stub (evaluates false → WM-28). It appears only inside
// `(Fireline OR Helitack)` / `NOT (...)`, never in a top-level AND, so NO
// category is stub-gated — cats 1-4 all stay reachable via the fire-line path.
// The helitack effects are STUB-DEGRADED, documented here, not pinned by a test:
//  - Cat 3 (`NOT (Fireline OR Helitack)` → `NOT Fireline`) over-matches a
//    helitack-only run as a plain run.
//  - The helitack arm of cat 4 (`Fireline OR Helitack` → `Fireline`) is dead;
//    cat 4 stays reachable via fireline. WM-28 owns re-validation.
// No stub-gated category — the (e) shape is N/A.

// SIMINIT defaults for tab 54: 3 zones Shrub / No Drought (terrains
// Mountains / Foothills / Plains), wind magnitude 10 / direction 165.
const defaultZones: WildfireZone[] = [
  { terrainType: "Mountains", vegetation: "Shrub", droughtLevel: "No Drought" },
  { terrainType: "Foothills", vegetation: "Shrub", droughtLevel: "No Drought" },
  { terrainType: "Plains", vegetation: "Shrub", droughtLevel: "No Drought" },
];
const defaultWind = { speed: 10, direction: 165 };
const defaults: WildfireDefaults = { zones: defaultZones, wind: defaultWind };
const terrains = ["Mountains", "Foothills", "Plains"];

// Default vegetation (all Shrub) with every zone at Severe Drought.
const severeZones: WildfireZone[] = terrains.map((t) => ({
  terrainType: t, vegetation: "Shrub", droughtLevel: "Severe Drought",
}));
// Vegetation changed off default, drought left below severe → cat 2.
const vegChangedNotSevere: WildfireZone[] = [
  { terrainType: "Mountains", vegetation: "Forest", droughtLevel: "No Drought" },
  { terrainType: "Foothills", vegetation: "Shrub", droughtLevel: "No Drought" },
  { terrainType: "Plains", vegetation: "Shrub", droughtLevel: "No Drought" },
];
const fireLine = [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.2 }];

function startReading(opts: Partial<WildfireReading> = {}): WildfireReading {
  return mkReading("SimulationStarted", opts.at ?? 100, {
    zones: defaultZones, sparks: [], fireLineMarkers: [], wind: defaultWind, ...opts,
  });
}
const severeNoFireline = (at = 100) => startReading({ at, zones: severeZones });
const severeWithFireline = (at = 200) => startReading({ at, zones: severeZones, fireLineMarkers: fireLine });

describe("ruleSet 54 — per-rule-set behavior sweep", () => {
  it("(a) empty readings → cat 1 (NOT ranSimulation)", () => {
    const e = makeWildfireEngine(ruleSet54, defaults);
    expect(matchAgainst(ruleSet54, e, [])).toBe(1);
  });
  it("(b) single match — ran with vegetation changed and no severe drought → cat 2", () => {
    const e = makeWildfireEngine(ruleSet54, defaults);
    expect(matchAgainst(ruleSet54, e, [startReading({ zones: vegChangedNotSevere })])).toBe(2);
  });
  it("(c) multiple-true → highest wins — a severe-drought plain run and a fireline run → cat 4", () => {
    const e = makeWildfireEngine(ruleSet54, defaults);
    // cat 3 (a severe-drought run with no fireline exists) and cat 4 (a
    // severe-drought run with a fireline exists) are both true → cat 4.
    expect(matchAgainst(ruleSet54, e, [severeNoFireline(), severeWithFireline()])).toBe(4);
  });
  it("(d) stability — cat 4 holds across a later severe-drought fireline run", () => {
    const e = makeWildfireEngine(ruleSet54, defaults);
    const r0 = severeWithFireline(100);
    expect(matchAgainst(ruleSet54, e, [r0])).toBe(4);
    expect(matchAgainst(ruleSet54, e, [r0, severeWithFireline(200)])).toBe(4);
  });
});

describe("ruleSet 54 — R9 per-category coverage", () => {
  const e = () => makeWildfireEngine(ruleSet54, defaults);
  it("cat 1 — no run", () => expect(matchAgainst(ruleSet54, e(), [])).toBe(1));
  it("cat 2 — ran with vegetation off default and no severe drought", () =>
    expect(matchAgainst(ruleSet54, e(), [startReading({ zones: vegChangedNotSevere })])).toBe(2));
  it("cat 3 — default vegetation, severe drought, no fireline", () =>
    expect(matchAgainst(ruleSet54, e(), [severeNoFireline()])).toBe(3));
  it("cat 4 — default vegetation, severe drought, a fireline", () =>
    expect(matchAgainst(ruleSet54, e(), [severeWithFireline()])).toBe(4));
});
