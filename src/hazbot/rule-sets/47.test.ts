import { ruleSet47 } from "./47";
import { makeWildfireEngine, matchAgainst, mkReading } from "./test-helpers";
import { WildfireDefaults, WildfireReading, WildfireZone } from "../wildfire/types";

// Tab 47 categories (regenerated from the 2026-05-22 sheet; Cat 100 dropped):
//   1: NOT ranSimulation
//   2: ranSimulation WITH NOT DefaultVars
//   3: ranSimulation WITH DefaultVars AND NOT (Fireline OR Helitack)
//   4: NOT ranSimulation WITH DefaultVars AND NOT (Fireline OR Helitack) AND ranSimulation WITH DefaultVars AND (Fireline OR Helitack)
//   5: ranSimulation WITH DefaultVars AND NOT (Fireline OR Helitack) AND ranSimulation WITH DefaultVars AND (Fireline OR Helitack)
//
// Helitack is a stub (evaluates false → WM-28). It appears only inside
// `(Fireline OR Helitack)` / `NOT (...)`, never in a top-level AND, so NO
// category is stub-gated — cats 1-5 all stay reachable via the fire-line path.
// The helitack effects are STUB-DEGRADED, documented here, not pinned by a test:
//  - Cat 3 (`NOT (Fireline OR Helitack)` → `NOT Fireline`) over-matches a
//    helitack-only run as a plain run.
//  - The helitack arm of cats 4/5 (`Fireline OR Helitack` → `Fireline`) is
//    dead; cats 4/5 stay reachable via fireline. WM-28 owns re-validation.
// No stub-gated category — the (e) shape is N/A.

// SIMINIT defaults for tab 47: 3 zones (Mountains/Forest/Mild Drought,
// Foothills/Shrub/Medium Drought, Plains/Shrub/Medium Drought), wind 30 / 265.
const defaultZones: WildfireZone[] = [
  { terrainType: "Mountains", vegetation: "Forest", droughtLevel: "Mild Drought" },
  { terrainType: "Foothills", vegetation: "Shrub", droughtLevel: "Medium Drought" },
  { terrainType: "Plains", vegetation: "Shrub", droughtLevel: "Medium Drought" },
];
const defaultWind = { speed: 30, direction: 265 };
const defaults: WildfireDefaults = { zones: defaultZones, wind: defaultWind };
// A zone changed from default → DefaultVars false.
const changedZones: WildfireZone[] = [
  { terrainType: "Mountains", vegetation: "Forest", droughtLevel: "Severe Drought" },
  { terrainType: "Foothills", vegetation: "Shrub", droughtLevel: "Medium Drought" },
  { terrainType: "Plains", vegetation: "Shrub", droughtLevel: "Medium Drought" },
];
const fireLine = [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.2 }];

function startReading(opts: Partial<WildfireReading> = {}): WildfireReading {
  return mkReading("SimulationStarted", opts.at ?? 100, {
    zones: defaultZones, sparks: [], fireLineMarkers: [], wind: defaultWind, ...opts,
  });
}
const defaultNoFireline = () => startReading();
const defaultWithFireline = (at = 200) => startReading({ at, fireLineMarkers: fireLine });

describe("ruleSet 47 — per-rule-set behavior sweep", () => {
  it("(a) empty readings → cat 1 (NOT ranSimulation)", () => {
    const e = makeWildfireEngine(ruleSet47, defaults);
    expect(matchAgainst(ruleSet47, e, [])).toBe(1);
  });
  it("(b) single match — ran with a changed variable → cat 2 (NOT DefaultVars)", () => {
    const e = makeWildfireEngine(ruleSet47, defaults);
    expect(matchAgainst(ruleSet47, e, [startReading({ zones: changedZones })])).toBe(2);
  });
  it("(c) multiple-true → highest wins — a plain run and a fireline run → cat 3 & 5 true → cat 5", () => {
    const e = makeWildfireEngine(ruleSet47, defaults);
    expect(matchAgainst(ruleSet47, e, [defaultNoFireline(), defaultWithFireline()])).toBe(5);
  });
  it("(d) stability — cat 4 holds across a later fireline run (no plain run appears)", () => {
    const e = makeWildfireEngine(ruleSet47, defaults);
    const r0 = defaultWithFireline(100);
    expect(matchAgainst(ruleSet47, e, [r0])).toBe(4);
    expect(matchAgainst(ruleSet47, e, [r0, defaultWithFireline(200)])).toBe(4);
  });
});

describe("ruleSet 47 — R9 per-category coverage", () => {
  const e = () => makeWildfireEngine(ruleSet47, defaults);
  it("cat 1 — no run", () => expect(matchAgainst(ruleSet47, e(), [])).toBe(1));
  it("cat 2 — ran with variables off default", () =>
    expect(matchAgainst(ruleSet47, e(), [startReading({ zones: changedZones })])).toBe(2));
  it("cat 3 — a plain default run, no fireline", () =>
    expect(matchAgainst(ruleSet47, e(), [defaultNoFireline()])).toBe(3));
  it("cat 4 — a default fireline run with no prior plain run", () =>
    expect(matchAgainst(ruleSet47, e(), [defaultWithFireline()])).toBe(4));
  it("cat 5 — a plain default run and a default fireline run", () =>
    expect(matchAgainst(ruleSet47, e(), [defaultNoFireline(), defaultWithFireline()])).toBe(5));
});
