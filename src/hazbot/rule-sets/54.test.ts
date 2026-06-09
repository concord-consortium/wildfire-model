import { ruleSet54 } from "./54";
import { makeWildfireEngine, matchAgainst, mkReading } from "./test-helpers";
import { WildfireDefaults, WildfireReading, WildfireZone } from "../wildfire/types";

// Tab 54 categories (regenerated from the 2026-05-22 sheet; Cat 100 dropped):
//   1: NOT ranSimulation
//   2: ranSimulation WITH NOT DefaultVegetations OR NOT SevereDroughts
//   3: ranSimulation WITH DefaultVegetations AND SevereDroughts AND NOT (Fireline OR Helitack)
//   4: ranSimulation WITH DefaultVegetations AND SevereDroughts AND (Fireline OR Helitack)
//
// Helitack is a real impl (WM-28). It appears only inside `(Fireline OR
// Helitack)` / `NOT (...)`, never in a top-level AND, so no category is
// stub-gated. The existing sweep/coverage below reaches cat 4 via the fireline
// disjunct; the "helitack-arm reachability" block drives the now-live helitack
// disjunct via a helitack-only severe-drought run (`{ helitack: true }`, default
// vegetation + every zone at Severe Drought, no fireLineMarkers):
//  - Cat 3 (`NOT (Fireline OR Helitack)`) no longer over-matches a helitack-only
//    severe-drought run — it now lands at cat 4 instead.
//  - The helitack arm of cat 4 (`Fireline OR Helitack`, gated on
//    DefaultVegetations AND SevereDroughts) is live. Tab 54 has no Cat 5.

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
// A helitack-only severe-drought run (no fireline) — exercises the Helitack disjunct.
const severeWithHelitack = (at = 200) => startReading({ at, zones: severeZones, helitack: true });

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
  // Cat 2's `OR` (was `AND` pre-2026-06-04 sheet): a default-vegetation run with
  // non-severe drought satisfies NOT SevereDroughts alone, so it now lands at cat 2.
  // Under the old `AND` this matched no category.
  it("cat 2 — default vegetation, non-severe drought (OR arm via NOT SevereDroughts)", () =>
    expect(matchAgainst(ruleSet54, e(), [startReading()])).toBe(2));
  it("cat 3 — default vegetation, severe drought, no fireline", () =>
    expect(matchAgainst(ruleSet54, e(), [severeNoFireline()])).toBe(3));
  it("cat 4 — default vegetation, severe drought, a fireline", () =>
    expect(matchAgainst(ruleSet54, e(), [severeWithFireline()])).toBe(4));
});

describe("ruleSet 54 — helitack-arm reachability (WM-28)", () => {
  // Drives the `(Fireline OR Helitack)` arm via the Helitack disjunct — a
  // helitack-only severe-drought run, distinct from the fireline coverage above.
  // The arm is gated on DefaultVegetations AND SevereDroughts, so the run must
  // carry Severe Drought.
  const e = () => makeWildfireEngine(ruleSet54, defaults);
  it("cat 4 — default vegetation, severe drought, a helitack (no fireline)", () => {
    expect(matchAgainst(ruleSet54, e(), [severeWithHelitack(100)])).toBe(4);
  });
  it("cat 3 no longer over-matches — a helitack-only severe-drought run is not classified cat 3", () => {
    // Under the stub this run satisfied NOT (Fireline OR Helitack) and landed at
    // cat 3; with the real Helitack impl it moves to the cat 4 arm.
    expect(matchAgainst(ruleSet54, e(), [severeWithHelitack(100)])).not.toBe(3);
  });
});
