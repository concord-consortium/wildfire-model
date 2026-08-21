import { ruleSet34 } from "./34";
import { makeWildfireEngine, matchAgainst, mkReading } from "./test-helpers";
import { tab34, vars34 } from "./__fixtures__/tab-shapes";
import { WildfireReading } from "../wildfire/types";

// Tab 34 categories (regenerated from the 2026-08-20 sheet; Cat 100 dropped):
//   1: NOT ranSimulation
//   2: ranSimulation WITH NOT VegetationSet AND NOT (WindSet OR DroughtLevelSet)
//   3: ranSimulation WITH NOT VegetationSet AND (WindSet OR DroughtLevelSet)
//   4: ranSimulation WITH VegetationSet AND NOT (WindSet OR DroughtLevelSet)
//   5: ranSimulation WITH VegetationSet AND (WindSet OR DroughtLevelSet)
//
// FULL REWRITE for the 2026-08-20 re-extract. The category table, the expressions
// and the evaluation mechanism all changed together, so nothing here is a renumber
// of the old file. Three things are different in kind:
//
//   1. It is now a two-by-two over VegetationSet x (WindSet OR DroughtLevelSet).
//      Every category is one cell of that grid, so on any single run exactly one
//      of 2-5 is true.
//   2. Everything is RUN-SCOPED via `WITH`, where the old table used the
//      session-scoped setVegetation / setDroughtLevel / setWind / triedAllVegetations
//      factor variables. Those four are now referenced by no expression on this tab.
//      The practical difference is pinned by the "one run, not two" test below.
//   3. The success endpoint moved from id 4 to id 5, and a new coaching category 4
//      was authored (vegetation changed, but neither wind nor drought).
//
// Reaching the endpoint is far easier than it was: the old cat 4 needed drought AND
// wind AND all four vegetations tried across the session; the new cat 5 needs one run
// with vegetation off-default and either wind or drought off-default.
// No stub-gated category — the (e) shape is N/A.

// SIMINIT defaults for tab 34: 3 zones, fixed terrains Mountains / Foothills /
// Plains, all Shrub / Mild Drought, wind 0/0. ("Foothills" is the terrainLabels
// value the reading carries; terrainDisplayLabels renders it as "Hills", and only
// that display map changed.)
const { defaults, changedWind, vegChanged, droughtChanged, vegAndDroughtChanged } = vars34;

function startReading(opts: Partial<WildfireReading> = {}): WildfireReading {
  return mkReading("SimulationStarted", opts.at ?? 100, { ...tab34.base, ...opts });
}

describe("ruleSet 34 — per-rule-set behavior sweep", () => {
  it("(a) empty readings → cat 1 (NOT ranSimulation)", () => {
    const e = makeWildfireEngine(ruleSet34, defaults);
    expect(matchAgainst(ruleSet34, e, [])).toBe(1);
  });
  it("(b) ran sim with all defaults → cat 2", () => {
    const e = makeWildfireEngine(ruleSet34, defaults);
    expect(matchAgainst(ruleSet34, e, [startReading()])).toBe(2);
  });
  it("(c) multiple-true → highest wins — a wind-only run and a vegetation-only run → cat 4", () => {
    const e = makeWildfireEngine(ruleSet34, defaults);
    const readings = [
      startReading({ wind: changedWind }),                 // cat 3
      startReading({ at: 200, zones: vegChanged }),        // cat 4
    ];
    expect(matchAgainst(ruleSet34, e, readings)).toBe(4);
  });
  it("(d) stability — cat 5 holds across a later all-default run", () => {
    const e = makeWildfireEngine(ruleSet34, defaults);
    const r0 = startReading({ zones: vegAndDroughtChanged });
    expect(matchAgainst(ruleSet34, e, [r0])).toBe(5);
    expect(matchAgainst(ruleSet34, e, [r0, startReading({ at: 200 })])).toBe(5);
  });
});

describe("ruleSet 34 — run scoping", () => {
  const e = () => makeWildfireEngine(ruleSet34, defaults);

  it("cat 5 needs ONE run carrying both changes, not two runs carrying one each", () => {
    // This is the whole point of the WITH scoping, and the sharpest difference from
    // the old session-scoped table, which would have counted these two runs together.
    const split = [
      startReading({ zones: vegChanged }),                 // vegetation only
      startReading({ at: 200, wind: changedWind }),        // wind only
    ];
    expect(matchAgainst(ruleSet34, e(), split)).toBe(4);

    const together = [startReading({ zones: vegChanged, wind: changedWind })];
    expect(matchAgainst(ruleSet34, e(), together)).toBe(5);
  });

  it("WindSet applies no tolerance: a 1 MPH nudge alone promotes cat 4 to cat 5", () => {
    // Per the sheet's Details cell, "Any small change should be accepted". DefaultVars
    // would treat this same run as still-at-default under its +/-2 MPH window; WindSet
    // deliberately does not, so the two overlap rather than complement each other.
    const nudged = [startReading({ zones: vegChanged, wind: { speed: 1, direction: 0 } })];
    expect(matchAgainst(ruleSet34, e(), nudged)).toBe(5);
  });

  it("a direction-only change at zero wind speed still counts as WindSet", () => {
    const turned = [startReading({ zones: vegChanged, wind: { speed: 0, direction: 90 } })];
    expect(matchAgainst(ruleSet34, e(), turned)).toBe(5);
  });
});

describe("ruleSet 34 — R9 per-category coverage", () => {
  const e = () => makeWildfireEngine(ruleSet34, defaults);
  it("cat 1 — no run", () => expect(matchAgainst(ruleSet34, e(), [])).toBe(1));
  it("cat 2 — ran with all defaults", () =>
    expect(matchAgainst(ruleSet34, e(), [startReading()])).toBe(2));
  it("cat 3 — drought changed, vegetation unchanged", () =>
    expect(matchAgainst(ruleSet34, e(), [startReading({ zones: droughtChanged })])).toBe(3));
  it("cat 3 — wind changed, vegetation unchanged (the OR's other arm)", () =>
    expect(matchAgainst(ruleSet34, e(), [startReading({ wind: changedWind })])).toBe(3));
  it("cat 4 — vegetation changed, neither wind nor drought", () =>
    expect(matchAgainst(ruleSet34, e(), [startReading({ zones: vegChanged })])).toBe(4));
  it("cat 5 — vegetation changed and drought changed in the same run", () =>
    expect(matchAgainst(ruleSet34, e(), [startReading({ zones: vegAndDroughtChanged })])).toBe(5));
});
