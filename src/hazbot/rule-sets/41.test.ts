import { ruleSet41 } from "./41";
import { makeWildfireEngine, matchAgainst, mkReading } from "./test-helpers";
import { tab41, vars41 } from "./__fixtures__/tab-shapes";
import { WildfireReading } from "../wildfire/types";

// Tab 41 categories (Cat 100 dropped):
//   1: NOT ranSimulation
//   2: ranSimulation WITH NOT DefaultVars
//   3: ranSimulation WITH DefaultVars
// 2 and 3 are each existential over runs rather than mutually exclusive, so a session
// holding both a changed run and a default run satisfies both; (c) and (d) pin that the
// highest true category wins. No stub-gated category: (e) N/A.

// SIMINIT defaults for tab 41: 2 zones (Foothills/Grass/Medium Drought,
// Foothills/Shrub/Mild Drought), wind magnitude 10 / direction 270.5.
const { defaults, changedWind } = vars41;

function startReading(opts: Partial<WildfireReading> = {}): WildfireReading {
  return mkReading("SimulationStarted", opts.at ?? 100, { ...tab41.base, ...opts });
}

describe("ruleSet 41 — per-rule-set behavior sweep", () => {
  it("(a) empty readings → cat 1 (NOT ranSimulation)", () => {
    const e = makeWildfireEngine(ruleSet41, defaults);
    expect(matchAgainst(ruleSet41, e, [])).toBe(1);
  });
  it("(b) ran sim with a changed wind → cat 2 (a run with non-default vars)", () => {
    const e = makeWildfireEngine(ruleSet41, defaults);
    expect(matchAgainst(ruleSet41, e, [startReading({ wind: changedWind })])).toBe(2);
  });
  it("(c) highest single-true — ran sim with no changes → cat 3", () => {
    const e = makeWildfireEngine(ruleSet41, defaults);
    expect(matchAgainst(ruleSet41, e, [startReading()])).toBe(3);
  });
  it("(d) a compliant run escapes cat 2", () => {
    // Expect 3, not 2: cat 2 stays true on the earlier changed run, and holding a
    // compliant student there would repeat cat 2's instruction for the rest of the session.
    const e = makeWildfireEngine(ruleSet41, defaults);
    const r0 = startReading({ wind: changedWind });
    expect(matchAgainst(ruleSet41, e, [r0])).toBe(2);
    expect(matchAgainst(ruleSet41, e, [r0, startReading({ at: 200 })])).toBe(3);
  });
});

describe("ruleSet 41 — R9 per-category coverage", () => {
  const e = () => makeWildfireEngine(ruleSet41, defaults);
  it("cat 1 — no run", () => expect(matchAgainst(ruleSet41, e(), [])).toBe(1));
  it("cat 2 — ran with a changed variable", () =>
    expect(matchAgainst(ruleSet41, e(), [startReading({ wind: changedWind })])).toBe(2));
  it("cat 3 — ran with no changes", () =>
    expect(matchAgainst(ruleSet41, e(), [startReading()])).toBe(3));
});
