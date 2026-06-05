import { ruleSet47 } from "./47";
import { makeWildfireEngine, matchAgainst, mkReading } from "./test-helpers";
import { factorVariables } from "../wildfire/factor-variables";
import { WildfireDefaults, WildfireReading, WildfireZone } from "../wildfire/types";

// Tab 47 categories (regenerated from the 2026-05-22 sheet; Cat 100 dropped):
//   1: NOT ranSimulation
//   2: ranSimulation WITH NOT DefaultVars
//   3: ranSimulation WITH DefaultVars AND NOT (Fireline OR Helitack)
//   4: NOT ranSimulation WITH DefaultVars AND NOT (Fireline OR Helitack) AND ranSimulation WITH DefaultVars AND (Fireline OR Helitack)
//   5: ranSimulation WITH DefaultVars AND NOT (Fireline OR Helitack) AND ranSimulation WITH DefaultVars AND (Fireline OR Helitack)
//
// Helitack is a real impl (WM-28). It appears only inside `(Fireline OR
// Helitack)` / `NOT (...)`, never in a top-level AND, so no category is
// stub-gated. The existing sweep/coverage below reaches cats 4/5 via the
// fireline disjunct; the "helitack reachability" block drives the now-live
// helitack disjunct via a helitack-only run (`{ helitack: true }`, no
// fireLineMarkers):
//  - Cat 3 (`NOT (Fireline OR Helitack)`) no longer over-matches a helitack-only
//    run — it now lands at the cat 4/5 arm instead.
//  - The helitack arm of cats 4/5 (`Fireline OR Helitack`) is live: Cat 4
//    (`NOT X AND Y`, helitack-only run with no prior clean-baseline run) and
//    Cat 5 (`X AND Y`, helitack-only run plus a clean-baseline run) each via
//    their distinct histories.

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
// A helitack-only run (no fireline) — exercises the now-live Helitack disjunct.
const defaultWithHelitack = (at = 200) => startReading({ at, helitack: true });

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

describe("ruleSet 47 — helitack-arm reachability (WM-28)", () => {
  // Drives the `(Fireline OR Helitack)` arm via the Helitack disjunct — a
  // helitack-only run, distinct from the fireline coverage above. Cat 4 and Cat 5
  // are mutually exclusive and require different histories (clean-baseline absent
  // vs present).
  const e = () => makeWildfireEngine(ruleSet47, defaults);
  it("cat 4 — a helitack-only run with no prior clean-baseline run (NOT X AND Y)", () => {
    expect(matchAgainst(ruleSet47, e(), [defaultWithHelitack(100)])).toBe(4);
  });
  it("cat 5 — a clean-baseline run plus a helitack-only run (X AND Y)", () => {
    expect(matchAgainst(ruleSet47, e(), [defaultNoFireline(), defaultWithHelitack()])).toBe(5);
  });
  it("cat 3 no longer over-matches — a helitack-only run is not classified cat 3", () => {
    // Under the stub a helitack-only run satisfied NOT (Fireline OR Helitack) and
    // landed at cat 3; with the real Helitack impl it moves to the cat 4 arm.
    expect(matchAgainst(ruleSet47, e(), [defaultWithHelitack(100)])).not.toBe(3);
  });
});

describe("ruleSet 47 — a paused run is one canonical run, not two (WM-28)", () => {
  // Sam's "Validation and more thoughts" pt.1 / live report: start a clean
  // default run, pause almost immediately (the Fire Line button emits
  // SimulationStopped), draw a fire line while paused, then resume. The raw log
  // holds two SimulationStarted readings — the initial one (no fire line) and the
  // resume (the fire line rides in on its payload) — but they are ONE run.
  //
  // `ranSimulation` (the `WITH` temporal anchor every category binds against) now
  // reads through `runReadings`, so the pause/resume folds to a single merged
  // representative carrying the fire line. Before that, the pre-fire-line half
  // masqueraded as a "clean" run, so the single run satisfied BOTH of cat 5's arms
  // (`ran WITH DefaultVars AND NOT (Fireline OR Helitack)` AND `ran WITH
  // DefaultVars AND (Fireline OR Helitack)`) — arms that describe two distinct
  // runs and cannot both be true of one. It must land cat 4 (used a tool, no prior
  // clean run), the same as an unpaused first-run-with-a-tool.
  const e = () => makeWildfireEngine(ruleSet47, defaults);
  const stopped = (at: number) => mkReading("SimulationStopped", at);

  it("start → pause → draw fire line → resume = one run → cat 4, not cat 5", () => {
    const readings = [
      startReading({ at: 100 }),                             // initial start, no fire line
      stopped(150),                                          // Fire Line button pauses the run
      startReading({ at: 200, fireLineMarkers: fireLine }), // resume carries the fire line
    ];
    expect(matchAgainst(ruleSet47, e(), readings)).toBe(4);
  });

  it("the same paused run counts as a single run (simulationRuns folds)", () => {
    const readings = [
      startReading({ at: 100 }),
      stopped(150),
      startReading({ at: 200, fireLineMarkers: fireLine }),
    ];
    const runs = factorVariables.simulationRuns.compute(readings, defaults).value as WildfireReading[];
    expect(runs).toHaveLength(1);
  });
});
