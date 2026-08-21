import { ruleSet42 } from "./42";
import { makeWildfireEngine, matchAgainst, mkReading } from "./test-helpers";
import { tab42, vars42 } from "./__fixtures__/tab-shapes";
import { WildfireReading } from "../wildfire/types";

// Tab 42 categories (regenerated from the 2026-05-22 sheet; Cat 100 dropped):
//   1: NOT ranSimulation
//   2: setAnyVar
//   3: ranSimulation AND NOT setAnyVar
// Categories 2 and 3 are mutually exclusive (setAnyVar vs NOT setAnyVar), so
// (c) verifies the highest single-true category. No stub-gated category: (e) N/A.

// SIMINIT defaults for tab 42: 2 zones (Foothills/Grass/Medium Drought,
// Foothills/Shrub/Mild Drought), wind magnitude 10 / direction 270.5.
const { defaults, changedWind } = vars42;

function startReading(opts: Partial<WildfireReading> = {}): WildfireReading {
  return mkReading("SimulationStarted", opts.at ?? 100, { ...tab42.base, ...opts });
}

describe("ruleSet 42 — per-rule-set behavior sweep", () => {
  it("(a) empty readings → cat 1 (NOT ranSimulation)", () => {
    const e = makeWildfireEngine(ruleSet42, defaults);
    expect(matchAgainst(ruleSet42, e, [])).toBe(1);
  });
  it("(b) ran sim with a changed wind → cat 2 (setAnyVar)", () => {
    const e = makeWildfireEngine(ruleSet42, defaults);
    expect(matchAgainst(ruleSet42, e, [startReading({ wind: changedWind })])).toBe(2);
  });
  it("(c) highest single-true — ran sim with no changes → cat 3", () => {
    const e = makeWildfireEngine(ruleSet42, defaults);
    expect(matchAgainst(ruleSet42, e, [startReading()])).toBe(3);
  });
  it("(d) a compliant run escapes cat 2, which the old expression made impossible", () => {
    // This pins the defect the run-scoped cat 3 exists to fix. `setAnyVar` is
    // session-scoped and stays true forever once any variable is touched, so
    // under the old `ranSimulation AND NOT setAnyVar` a student who did exactly
    // what cat 2 asks ("Let's run the model using the original settings!") was
    // held at cat 2 repeating that same instruction for the rest of the session.
    // `ranSimulation WITH DefaultVars` is existential over runs, so one compliant
    // run now reaches cat 3. Do not "restore" the old expectation of 2: it was
    // the soft-lock, not a stability guarantee.
    const e = makeWildfireEngine(ruleSet42, defaults);
    const r0 = startReading({ wind: changedWind });
    expect(matchAgainst(ruleSet42, e, [r0])).toBe(2);
    expect(matchAgainst(ruleSet42, e, [r0, startReading({ at: 200 })])).toBe(3);
  });
});

describe("ruleSet 42 — R9 per-category coverage", () => {
  const e = () => makeWildfireEngine(ruleSet42, defaults);
  it("cat 1 — no run", () => expect(matchAgainst(ruleSet42, e(), [])).toBe(1));
  it("cat 2 — ran with a changed variable", () =>
    expect(matchAgainst(ruleSet42, e(), [startReading({ wind: changedWind })])).toBe(2));
  it("cat 3 — ran with no changes", () =>
    expect(matchAgainst(ruleSet42, e(), [startReading()])).toBe(3));
});
