import { ruleSet45 } from "./45";
import { makeWildfireEngine, matchAgainst, mkReading } from "./test-helpers";
import { WildfireDefaults, WildfireReading, WildfireZone } from "../wildfire/types";

// Tab 45 categories (regenerated from the 2026-05-22 sheet; Cat 100 dropped):
//   1: NOT ranSimulation
//   2: ranSimulation WITH NOT DefaultVars
//   3: NOT (usedFireline AND usedHelitack) AND ranSimulation WITH DefaultVars
//   4: ranSimulation WITH DefaultVars AND Fireline AND ranSimulation WITH DefaultVars AND Helitack
//
// Helitack / usedHelitack are stubs (evaluate false → WM-28):
//  - Cat 4 is STUB-GATED: its `ranSimulation WITH DefaultVars AND Helitack`
//    conjunct can never be true, so cat 4 is unreachable. Excluded from R9; the
//    (e) shape asserts a fully-satisfying state never matches it.
//  - Cat 3 is STUB-DEGRADED: `NOT (usedFireline AND usedHelitack)` collapses to
//    `NOT (... AND false)` = TRUE, so cat 3 over-matches — a student who used
//    both a fireline and a helitack also lands at cat 3. WM-28 owns correcting
//    this; it is documented here, not pinned by a test.
// The fire-line progression path is fully functional (Fireline / usedFireline
// are real impls).

// SIMINIT defaults for tab 45: 3 zones Shrub / No Drought (terrains
// Mountains / Foothills / Plains), wind magnitude 20 / direction 100.
const defaultZones: WildfireZone[] = [
  { terrainType: "Mountains", vegetation: "Shrub", droughtLevel: "No Drought" },
  { terrainType: "Foothills", vegetation: "Shrub", droughtLevel: "No Drought" },
  { terrainType: "Plains", vegetation: "Shrub", droughtLevel: "No Drought" },
];
const defaultWind = { speed: 20, direction: 100 };
const defaults: WildfireDefaults = { zones: defaultZones, wind: defaultWind };
// A zone changed from default → DefaultVars false.
const changedZones: WildfireZone[] = [
  { terrainType: "Mountains", vegetation: "Shrub", droughtLevel: "Severe Drought" },
  { terrainType: "Foothills", vegetation: "Shrub", droughtLevel: "No Drought" },
  { terrainType: "Plains", vegetation: "Shrub", droughtLevel: "No Drought" },
];
const fireLine = [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.2 }];

function startReading(opts: Partial<WildfireReading> = {}): WildfireReading {
  return mkReading("SimulationStarted", opts.at ?? 100, {
    zones: defaultZones, sparks: [], fireLineMarkers: [], wind: defaultWind, ...opts,
  });
}

describe("ruleSet 45 — per-rule-set behavior sweep", () => {
  it("(a) empty readings → cat 1 (NOT ranSimulation)", () => {
    const e = makeWildfireEngine(ruleSet45, defaults);
    expect(matchAgainst(ruleSet45, e, [])).toBe(1);
  });
  it("(b) single match — ran with a changed variable → cat 2 (NOT DefaultVars)", () => {
    const e = makeWildfireEngine(ruleSet45, defaults);
    expect(matchAgainst(ruleSet45, e, [startReading({ zones: changedZones })])).toBe(2);
  });
  it("(c) multiple-true → highest wins — a changed run and an all-default run → cat 3", () => {
    const e = makeWildfireEngine(ruleSet45, defaults);
    const changed = startReading({ zones: changedZones });
    const allDefault = startReading({ at: 200 });
    // cat 2 (a non-default run exists) and cat 3 (an all-default run exists) are
    // both true → highest, cat 3, wins.
    expect(matchAgainst(ruleSet45, e, [changed, allDefault])).toBe(3);
  });
  it("(d) stability — cat 3 holds across a later all-default run", () => {
    const e = makeWildfireEngine(ruleSet45, defaults);
    const r0 = startReading();
    expect(matchAgainst(ruleSet45, e, [r0])).toBe(3);
    expect(matchAgainst(ruleSet45, e, [r0, startReading({ at: 200 })])).toBe(3);
  });
  it("(e) stub-gated cat 4 — an all-default run with a fireline never matches cat 4", () => {
    const e = makeWildfireEngine(ruleSet45, defaults);
    // DefaultVars + Fireline satisfied; only the Helitack arm is missing.
    expect(matchAgainst(ruleSet45, e, [startReading({ fireLineMarkers: fireLine })])).not.toBe(4);
  });
});

describe("ruleSet 45 — R9 per-category coverage", () => {
  // Cat 4 is stub-gated (Helitack → WM-28) and excluded.
  const e = () => makeWildfireEngine(ruleSet45, defaults);
  it("cat 1 — no run", () => expect(matchAgainst(ruleSet45, e(), [])).toBe(1));
  it("cat 2 — ran with variables off default", () =>
    expect(matchAgainst(ruleSet45, e(), [startReading({ zones: changedZones })])).toBe(2));
  it("cat 3 — ran with all variables at default", () =>
    expect(matchAgainst(ruleSet45, e(), [startReading()])).toBe(3));
});
