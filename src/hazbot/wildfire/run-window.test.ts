import { ruleSet24 } from "../rule-sets/24";
import { ruleSet47 } from "../rule-sets/47";
import {
  makeWildfireEngine, matchAgainst, matchCurrentAgainst, mkReading,
} from "../rule-sets/test-helpers";
import { canonicalRunReadings } from "./canonical-runs";
import { canonicalRunWindowStart, makeReadingsWindow } from "./run-window";
import { WildfireDefaults, WildfireReading, WildfireZone } from "./types";

// Tab 47's SIMINIT defaults, matching 47.test.ts. range_cc is 2 there, so the window is
// the last two canonical runs, which is what makes the folded-run cases visible.
const defaultZones: WildfireZone[] = [
  { terrainType: "Mountains", vegetation: "Forest", droughtLevel: "Mild Drought" },
  { terrainType: "Foothills", vegetation: "Shrub", droughtLevel: "Medium Drought" },
  { terrainType: "Plains", vegetation: "Shrub", droughtLevel: "Medium Drought" },
];
const defaultWind = { speed: 30, direction: 265 };
const defaults: WildfireDefaults = { zones: defaultZones, wind: defaultWind };
const fireLine = [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.2 }];

const start = (at: number, opts: Partial<WildfireReading> = {}) =>
  mkReading("SimulationStarted", at, {
    zones: defaultZones, sparks: [], fireLineMarkers: [], wind: defaultWind, ...opts,
  });
const stopped = (at: number) => mkReading("SimulationStopped", at);
const ended = (at: number) => mkReading("SimulationEnded", at);

const engine47 = () => makeWildfireEngine(ruleSet47, defaults, true);

// Clean run, then a paused run carrying a helitack on its first start, then a fire-line
// run. Three canonical runs, the middle one folded.
const cleanPausedFireline: WildfireReading[] = [
  start(100), ended(110),
  start(200, { helitack: true }), stopped(210), start(220), ended(230),
  start(300, { fireLineMarkers: fireLine }), ended(310),
];

// The mirror: a paused run, then a clean run. Two canonical runs at range_cc 2, so the
// window is the whole session.
const pausedThenClean: WildfireReading[] = [
  start(100, { helitack: true }), stopped(110), start(120), ended(130),
  start(200), ended(210),
];

// Index of the rangeCc-th-from-last RAW SimulationStarted, i.e. the trim that treats a
// resume as the start of a new run.
function rawStartTrim(readings: WildfireReading[], rangeCc: number): number {
  const starts: number[] = [];
  readings.forEach((r, i) => { if (r.triggeredBy === "SimulationStarted") starts.push(i); });
  return starts.length <= rangeCc ? 0 : starts[starts.length - rangeCc];
}

// The window's category, computed the way a trim that resolved runs by identity or by
// timestamp would compute it, so the naive answers can be compared against the real one.
function categoryFrom(readings: WildfireReading[], startIndex: number): number | null {
  return matchCurrentAgainst(
    makeWildfireEngine(ruleSet47, defaults, true),
    readings.slice(startIndex),
  );
}

describe("canonicalRunWindowStart", () => {
  it("resolves a folded run whose representative is a clone, not an element of readings", () => {
    const runs = canonicalRunReadings(cleanPausedFireline);
    const folded = runs[1];
    expect(cleanPausedFireline.indexOf(folded)).toBe(-1);
    expect(folded.at).toBe(200);
    expect(folded.helitack).toBe(true);
    expect(canonicalRunWindowStart(cleanPausedFireline, 2)).toBe(2);
  });

  it("gives a window that classifies tab 47 as 4 where a raw-start trim gives 5", () => {
    expect(matchAgainst(ruleSet47, engine47(), cleanPausedFireline)).toBe(5);
    expect(matchCurrentAgainst(engine47(), cleanPausedFireline)).toBe(4);
    expect(categoryFrom(cleanPausedFireline, rawStartTrim(cleanPausedFireline, 2))).toBe(5);
  });

  // A trim that matched the folded run's `at` would take the FIRST reading carrying that
  // timestamp, widening the window to the whole session. `at` carries no uniqueness
  // contract, and the shared reading builders default every `at` to 100, so a collision
  // is easy to produce by accident.
  it("is unmoved by an earlier reading sharing the folded run's timestamp", () => {
    const collided = [start(200), ended(205), ...cleanPausedFireline.slice(2)];
    const folded = canonicalRunReadings(collided)[1];
    expect(collided.findIndex((r) => r.at === folded.at)).toBe(0);
    expect(canonicalRunWindowStart(collided, 2)).toBe(2);
  });

  it("gives 5 on the paused-then-clean mirror where a raw-start trim gives 3", () => {
    expect(matchCurrentAgainst(engine47(), pausedThenClean)).toBe(5);
    expect(categoryFrom(pausedThenClean, rawStartTrim(pausedThenClean, 2))).toBe(3);
  });

  it("trims to 0 when the session holds no more runs than the window", () => {
    expect(canonicalRunWindowStart(pausedThenClean, 2)).toBe(0);
    expect(canonicalRunWindowStart([], 2)).toBe(0);
  });

  // A one-run session on a range_cc 2 tab is evaluated over the run it has rather than
  // being treated as insufficient data.
  it("evaluates a one-run session on a two-run window", () => {
    const oneRun = [start(100, { fireLineMarkers: fireLine }), ended(110)];
    expect(canonicalRunWindowStart(oneRun, 2)).toBe(0);
    expect(matchCurrentAgainst(engine47(), oneRun)).toBe(4);
  });

  it("keeps an unfinished newest run inside the window", () => {
    const unfinished = [
      start(100), ended(110),
      start(200, { fireLineMarkers: fireLine }),
    ];
    expect(unfinished.some((r) => r.triggeredBy === "SimulationEnded" && r.at > 110)).toBe(false);
    expect(canonicalRunReadings(unfinished.slice(canonicalRunWindowStart(unfinished, 2))))
      .toHaveLength(2);
    expect(matchCurrentAgainst(engine47(), unfinished)).toBe(5);
  });
});

describe("makeReadingsWindow", () => {
  const labelFor = (readings: WildfireReading[], rangeCc: number) =>
    makeReadingsWindow(() => rangeCc)(readings)?.label;

  // The covered count is always min(rangeCc, total), so `range_cc 2 · 1 of 2 runs` is
  // unreachable: a two-run session at rangeCc 2 covers both.
  it("reports the covered and total run counts", () => {
    const runs = (n: number) => {
      const readings: WildfireReading[] = [];
      for (let i = 0; i < n; i++) { readings.push(start(100 + i * 100), ended(150 + i * 100)); }
      return readings;
    };
    const labels: string[] = [];
    [1, 2].forEach((rangeCc) => {
      for (let n = 0; n <= 5; n++) labels.push(String(labelFor(runs(n), rangeCc)));
    });
    expect(labels).toEqual([
      "range_cc 1 · 0 of 0 runs", "range_cc 1 · 1 of 1 runs", "range_cc 1 · 1 of 2 runs",
      "range_cc 1 · 1 of 3 runs", "range_cc 1 · 1 of 4 runs", "range_cc 1 · 1 of 5 runs",
      "range_cc 2 · 0 of 0 runs", "range_cc 2 · 1 of 1 runs", "range_cc 2 · 2 of 2 runs",
      "range_cc 2 · 2 of 3 runs", "range_cc 2 · 2 of 4 runs", "range_cc 2 · 2 of 5 runs",
    ]);
  });

  it("returns null rather than an empty window when range_cc is 0", () => {
    expect(makeReadingsWindow(() => 0)(cleanPausedFireline)).toBeNull();
  });
});

// Tab 24 is the one activity whose range_cc is 0. An empty window there would evaluate
// the empty-prefix state and answer category 1, so `current ?? best` would tell a
// student who has run the model twice to go run it.
describe("a range_cc 0 activity", () => {
  const zone = { terrainType: "Plains", vegetation: "Shrub", droughtLevel: "Mild Drought" };
  const defaults24: WildfireDefaults = { zones: [zone, zone], wind: { speed: 0, direction: 0 } };
  const start24 = (at: number, wind: { speed: number; direction: number }) =>
    mkReading("SimulationStarted", at, { zones: [zone, zone], sparks: [], wind });
  const twoRuns = [
    start24(100, { speed: 5, direction: 0 }),
    start24(200, { speed: 10, direction: 90 }),
  ];

  it("reports no window, and falls back to `best` rather than to the empty-prefix state", () => {
    const engine = makeWildfireEngine(ruleSet24, defaults24, true);
    const best = matchAgainst(ruleSet24, engine, twoRuns);
    const current = matchCurrentAgainst(engine, twoRuns);
    expect(best).toBe(5);
    expect(current).toBeNull();
    expect(current ?? best).toBe(5);
  });
});
