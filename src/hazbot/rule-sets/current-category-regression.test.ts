import { WildfireReading } from "../wildfire/types";
import { ruleSet23 } from "./23";
import { ruleSet45 } from "./45";
import { tab23, tab45, vars23, vars45 } from "./__fixtures__/tab-shapes";
import { makeWildfireEngine, matchAgainst, matchCurrentAgainst, mkReading } from "./test-helpers";

// The narratives behind the sweep next door: named sequences a reader can follow, rather
// than an enumeration.

const run = (base: Partial<WildfireReading>, at: number, opts: Partial<WildfireReading> = {}) => ([
  mkReading("SimulationStarted", at, { ...base, ...opts }),
  mkReading("SimulationEnded", at + 50),
]);

describe("current-category regressions", () => {
  const perfectRun23 = run(tab23.base, 100,
    { zones: vars23.correctZones, sparks: vars23.sparksPerZone });

  it("tab 23: a perfect run then a weaker run resolves to 4, not 5", () => {
    // The reported bug. Run 2 gets the zone setup right but drops to a single spark, so
    // `best` keeps the 5 the student earned on run 1 while the feedback coaches them on
    // the run they actually made.
    const engine = makeWildfireEngine(ruleSet23, tab23.defaults, true);
    const readings = [...perfectRun23, ...run(tab23.base, 200, { zones: vars23.correctZones })];
    expect(matchAgainst(ruleSet23, engine, readings)).toBe(5);
    expect(matchCurrentAgainst(engine, readings)).toBe(4);
  });

  it("tab 23: a perfect run then an all-defaults run drops current to 2", () => {
    // The pair the sidebar's note and the browser walk both cite: the row highlighted as
    // used (2) carries a ✗ icon beside a setAnyZoneVar that is true over the full session.
    const engine = makeWildfireEngine(ruleSet23, tab23.defaults, true);
    const readings = [...perfectRun23, ...run(tab23.base, 200)];
    expect(matchAgainst(ruleSet23, engine, readings)).toBe(5);
    expect(matchCurrentAgainst(engine, readings)).toBe(2);
  });

  it("tab 45: a trailing window lifts current above best", () => {
    // Run 1 changed setup with a fire line, run 2 default with a helitack, run 3 default
    // with no tools. 35 of tab 45's 512 depth-3 states move this way, all of them 2 -> 3.
    //
    // This pins the two INPUTS and deliberately not the selection: `used` here would be
    // this file's own `current ?? best`, true by construction whatever the app does. The
    // revert-to-min guard is the best 2 / current 3 case in hazbot-button.test.tsx and
    // sidebar.test.tsx, which run the shipped computeCategorySelectionForEngine.
    const engine = makeWildfireEngine(ruleSet45, tab45.defaults, true);
    const readings = [
      ...run(tab45.base, 100, { zones: vars45.changedZones, fireLineMarkers: vars45.fireLine }),
      ...run(tab45.base, 200, { helitack: true }),
      ...run(tab45.base, 300),
    ];
    expect(matchAgainst(ruleSet45, engine, readings)).toBe(2);
    expect(matchCurrentAgainst(engine, readings)).toBe(3);
  });
});
