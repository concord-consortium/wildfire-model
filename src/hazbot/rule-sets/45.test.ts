import { ruleSet45 } from "./45";
import { makeWildfireEngine, matchAgainst, mkReading } from "./test-helpers";
import { WildfireDefaults, WildfireReading, WildfireZone } from "../wildfire/types";

// Tab 45 categories (regenerated from the 2026-05-22 sheet; Cat 100 dropped):
//   1: NOT ranSimulation
//   2: ranSimulation WITH NOT DefaultVars
//   3: NOT (usedFireline AND usedHelitack) AND ranSimulation WITH DefaultVars
//   4: ranSimulation WITH DefaultVars AND Fireline AND ranSimulation WITH DefaultVars AND Helitack
//
// Helitack / usedHelitack are real impls (WM-28). An in-run helitack is a
// reading flagged `helitack: true`:
//  - Cat 4 is reachable. Its two WITH clauses (Fireline / Helitack) each bind
//    their own SimulationStarted witness, so it fires both same-run (fireline +
//    helitack on one run) and across-runs (fireline run 1, helitack run 2).
//  - Cat 3's `NOT (usedFireline AND usedHelitack)` now goes false on a
//    fireline+helitack history, so a fireline+helitack run lands at Cat 4, not
//    Cat 3 (no longer over-matches).

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
  it("(e) success cat 4 — an all-default run with both a fireline and a helitack → cat 4", () => {
    const e = makeWildfireEngine(ruleSet45, defaults);
    // DefaultVars + Fireline + Helitack all satisfied on one run.
    expect(matchAgainst(ruleSet45, e, [startReading({ fireLineMarkers: fireLine, helitack: true })])).toBe(4);
  });
});

describe("ruleSet 45 — R9 per-category coverage", () => {
  const e = () => makeWildfireEngine(ruleSet45, defaults);
  it("cat 1 — no run", () => expect(matchAgainst(ruleSet45, e(), [])).toBe(1));
  it("cat 2 — ran with variables off default", () =>
    expect(matchAgainst(ruleSet45, e(), [startReading({ zones: changedZones })])).toBe(2));
  it("cat 3 — ran with all variables at default", () =>
    expect(matchAgainst(ruleSet45, e(), [startReading()])).toBe(3));
  it("cat 4 — fireline + helitack in a single run", () =>
    expect(matchAgainst(ruleSet45, e(), [startReading({ fireLineMarkers: fireLine, helitack: true })])).toBe(4));
});

describe("ruleSet 45 — helitack reachability (WM-28)", () => {
  // Same-run Cat 4 (one run with both tools) is covered by the (e) sweep and R9
  // cat 4 above. This block covers the genuinely-new helitack behaviors: the
  // across-runs Cat 4 path and Cat 3 no longer over-matching.
  const e = () => makeWildfireEngine(ruleSet45, defaults);
  it("cat 4 across-runs — fireline in run 1, helitack in run 2 (each binds its own WITH witness)", () => {
    const firelineRun = startReading({ fireLineMarkers: fireLine });
    const helitackRun = startReading({ at: 200, helitack: true });
    expect(matchAgainst(ruleSet45, e(), [firelineRun, helitackRun])).toBe(4);
  });
  it("cat 3 no longer over-matches — a fireline+helitack run is not classified cat 3", () => {
    // Under the stub this run landed at cat 3 (NOT (usedFireline AND usedHelitack)
    // collapsed to true); with the real impls usedHelitack flips it off cat 3.
    const run = startReading({ fireLineMarkers: fireLine, helitack: true });
    expect(matchAgainst(ruleSet45, e(), [run])).not.toBe(3);
  });
});
