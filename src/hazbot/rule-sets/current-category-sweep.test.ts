import { categoryExpressions } from "../engine";
import { deriveRangeCc } from "../wildfire/range-cc";
import { WildfireReading } from "../wildfire/types";
import { ruleSets } from "./index";
import { TAB_FIXTURES } from "./__fixtures__/tab-shapes";
import { makeWildfireEngine, matchAgainst, matchCurrentAgainst, mkReading } from "./test-helpers";

// `best` for every state of each tab's own axis set, one character per state and `-` for
// a null match, measured on the branch BEFORE `category.current` existed. Chunked one
// line per first-run shape and labeled with it, so a PR diff names the run-1 shape of
// whatever moved instead of handing the reviewer two long strings to compare character by
// character (and so no committed line passes the 160-character max-len warning).
//
// These are prior measurements to confirm, not values to regenerate. A series read off
// the current tree would pin a snapshot of the new behavior rather than a baseline of the
// old one. If a series does not reproduce, that is bar 1 doing its job, or the fixture
// disagreeing with the axis set it was measured against; check the second first.
//
// Tab 45 runs at depth 3 because it is the only tab that can move upward at all, and at
// depth 2 it cannot: 0 upward moves at depth 2, 35 at depth 3, 308 at depth 4. Running it
// at depth 2 would make bar 2 vacuous. Its rows are 64 characters rather than 8.
const BASELINES: Record<string, { depth: number; rangeCc: number; top: number; best: string }> = {
  "23": { depth: 2, rangeCc: 1, top: 5, best: [
    "222445333",  // run 1 = default/noSparks
    "222445333",  // run 1 = default/oneSpark
    "222445333",  // run 1 = default/perZone
    "444445444",  // run 1 = correct/noSparks
    "444445444",  // run 1 = correct/oneSpark
    "555555555",  // run 1 = correct/perZone
    "333445333",  // run 1 = changed/noSparks
    "333445333",  // run 1 = changed/oneSpark
    "333445333",  // run 1 = changed/perZone
  ].join("") },
  "25": { depth: 2, rangeCc: 1, top: 6, best: [
    "2234622345",  // run 1 = uniform/noSparks
    "2234622345",  // run 1 = uniform/oneSpark
    "3334633345",  // run 1 = uniform/twoSameZone
    "4444644445",  // run 1 = uniform/perZoneMid
    "6666666666",  // run 1 = uniform/topBottom
    "2234622345",  // run 1 = nonUniform/noSparks
    "2234622345",  // run 1 = nonUniform/oneSpark
    "3334633345",  // run 1 = nonUniform/twoSameZone
    "4444644445",  // run 1 = nonUniform/perZoneMid
    "5555655555",  // run 1 = nonUniform/topBottom
  ].join("") },
  "32": { depth: 2, rangeCc: 1, top: 6, best: [
    "22564433",  // run 1 = default/noSparks
    "22564433",  // run 1 = default/perZone
    "55565555",  // run 1 = uniqVegUniform/noSparks
    "66666666",  // run 1 = uniqVegUniform/perZone
    "44564444",  // run 1 = uniqVegNonUniform/noSparks
    "44564444",  // run 1 = uniqVegNonUniform/perZone
    "33564433",  // run 1 = droughtNotUniqVeg/noSparks
    "33564433",  // run 1 = droughtNotUniqVeg/perZone
  ].join("") },
  "33": { depth: 2, rangeCc: 1, top: 6, best: [
    "22464533",  // run 1 = default/noSparks
    "22464533",  // run 1 = default/perZone
    "44464544",  // run 1 = forestUniform/noSparks
    "66666666",  // run 1 = forestUniform/perZone
    "44464544",  // run 1 = forestNonUniform/noSparks
    "55565555",  // run 1 = forestNonUniform/perZone
    "33464533",  // run 1 = changedNotForest/noSparks
    "33464533",  // run 1 = changedNotForest/perZone
  ].join("") },
  "34": { depth: 2, rangeCc: 1, top: 5, best: [
    "23334555",  // run 1 = vegDefault/droughtDefault/windDefault
    "33334555",  // run 1 = vegDefault/droughtDefault/windChanged
    "33334555",  // run 1 = vegDefault/droughtSevere/windDefault
    "33334555",  // run 1 = vegDefault/droughtSevere/windChanged
    "44444555",  // run 1 = vegChanged/droughtDefault/windDefault
    "55555555",  // run 1 = vegChanged/droughtDefault/windChanged
    "55555555",  // run 1 = vegChanged/droughtSevere/windDefault
    "55555555",  // run 1 = vegChanged/droughtSevere/windChanged
  ].join("") },
  "35": { depth: 2, rangeCc: 1, top: 7, best: [
    "226755444444",  // run 1 = default/noSparks
    "226755444444",  // run 1 = default/perZone
    "666766666666",  // run 1 = forestWW/noSparks
    "777777777777",  // run 1 = forestWW/perZone
    "556755555555",  // run 1 = forestNonUniformDrought/noSparks
    "556755555555",  // run 1 = forestNonUniformDrought/perZone
    "446755334444",  // run 1 = forestNonUniformTerrain/noSparks
    "446755334444",  // run 1 = forestNonUniformTerrain/perZone
    "446755444444",  // run 1 = changedNotForest/noSparks
    "446755444444",  // run 1 = changedNotForest/perZone
    "446755444444",  // run 1 = uniformDroughtNoForest/noSparks
    "446755444444",  // run 1 = uniformDroughtNoForest/perZone
  ].join("") },
  "42": { depth: 2, rangeCc: 1, top: 3, best: [
    "33",  // run 1 = default
    "32",  // run 1 = changedWind
  ].join("") },
  "45": { depth: 3, rangeCc: 2, top: 4, best: [
    "3334333333443333343433334444444433343333333433333334333333343333",  // run 1 = default/noFireline/noHelitack
    "3344333333443333444444444444444433443333334433333344333333443333",  // run 1 = default/noFireline/helitack
    "3434333344444444343433334444444434343333343433333434333334343333",  // run 1 = default/fireline/noHelitack
    "4444444444444444444444444444444444444444444444444444444444444444",  // run 1 = default/fireline/helitack
    "3334333333443333343433334444444433342222332422223234222222242222",  // run 1 = changed/noFireline/noHelitack
    "3334333333443333242422224444444433242222332422222224222222242222",  // run 1 = changed/noFireline/helitack
    "3334333322442222343433334444444432342222222422223234222222242222",  // run 1 = changed/fireline/noHelitack
    "2224222222442222242422224444444422242222222422222224222222242222",  // run 1 = changed/fireline/helitack
  ].join("") },
  "47": { depth: 2, rangeCc: 2, top: 5, best: [
    "35553333",  // run 1 = default/noFireline/noHelitack
    "54444444",  // run 1 = default/noFireline/helitack
    "54444444",  // run 1 = default/fireline/noHelitack
    "54444444",  // run 1 = default/fireline/helitack
    "34442222",  // run 1 = changed/noFireline/noHelitack
    "34442222",  // run 1 = changed/noFireline/helitack
    "34442222",  // run 1 = changed/fireline/noHelitack
    "34442222",  // run 1 = changed/fireline/helitack
  ].join("") },
  // Tab 54 on its SEVERITY axis, not 45/47's default-vs-changed. See tab-shapes.ts.
  "54": { depth: 2, rangeCc: 1, top: 4, best: [
    "222234442222",  // run 1 = default/noFireline/noHelitack
    "222234442222",  // run 1 = default/noFireline/helitack
    "222234442222",  // run 1 = default/fireline/noHelitack
    "222234442222",  // run 1 = default/fireline/helitack
    "333334443333",  // run 1 = severe/noFireline/noHelitack
    "444444444444",  // run 1 = severe/noFireline/helitack
    "444444444444",  // run 1 = severe/fireline/noHelitack
    "444444444444",  // run 1 = severe/fireline/helitack
    "222234442222",  // run 1 = vegNotSevere/noFireline/noHelitack
    "222234442222",  // run 1 = vegNotSevere/noFireline/helitack
    "222234442222",  // run 1 = vegNotSevere/fireline/noHelitack
    "222234442222",  // run 1 = vegNotSevere/fireline/helitack
  ].join("") },
};

// Every ordered sequence of `depth` shapes, as shape indices. Plain loops rather than
// flatMap: this project's TS lib target predates ES2019.
function enumerateStates(shapeCount: number, depth: number): number[][] {
  let states: number[][] = [[]];
  for (let d = 0; d < depth; d++) {
    const next: number[][] = [];
    states.forEach((prefix) => {
      for (let i = 0; i < shapeCount; i++) next.push(prefix.concat(i));
    });
    states = next;
  }
  return states;
}

const glyph = (category: number | null) => (category === null ? "-" : String(category));

// An upward move onto the top category is `current === top` with `best` anything else.
// Comparing glyphs rather than Number()-coercing them matters: a null match glyphs as
// "-", and Number("-") is NaN, so every numeric comparison against it is false. No tab
// produces a null today, but a future rule set that did would silently skip the bar.
const movedOntoTop = (best: string, current: string, top: number) =>
  current === String(top) && best !== String(top);

describe.each(Object.keys(BASELINES))("windowed sweep — tab %s", (tabId) => {
  const { depth, rangeCc, top, best: baseline } = BASELINES[tabId];
  const fixture = TAB_FIXTURES.filter((f) => f.id === tabId)[0];
  const ruleSet = ruleSets[tabId];
  const engine = makeWildfireEngine(ruleSet, fixture.defaults, true);

  const states = enumerateStates(fixture.shapes.length, depth);
  const names: string[] = [];
  const bestSeries: string[] = [];
  const currentSeries: string[] = [];
  states.forEach((state) => {
    const readings: WildfireReading[] = [];
    state.forEach((shapeIdx, run) => {
      readings.push(mkReading("SimulationStarted", 100 + run * 100,
        { ...fixture.base, ...fixture.shapes[shapeIdx].reading }));
      readings.push(mkReading("SimulationEnded", 150 + run * 100));
    });
    names.push(state.map((i) => fixture.shapes[i].name).join(" -> "));
    bestSeries.push(glyph(matchAgainst(ruleSet, engine, readings)));
    currentSeries.push(glyph(matchCurrentAgainst(engine, readings)));
  });

  // Downward reclassification is expected and is the point of the story, so nothing below
  // asserts on the `current` column beyond bars 2 and 3. Logged instead, so a reviewer can
  // see the blast radius and the coverage without either being pinned.
  let movedCount = 0;
  let upwardCount = 0;
  bestSeries.forEach((b, i) => {
    if (b !== currentSeries[i]) movedCount++;
    if (b !== "-" && currentSeries[i] !== "-" && Number(currentSeries[i]) > Number(b)) upwardCount++;
  });
  // eslint-disable-next-line no-console
  console.log(`tab ${tabId}: ${movedCount} of ${states.length} moved, ${upwardCount} upward, `
    + `best covers {${Array.from(new Set(bestSeries)).sort().join(",")}}`);

  it("windows at the range_cc the derivation produces", () => {
    expect(deriveRangeCc(categoryExpressions(engine))).toBe(rangeCc);
    expect(Math.max(...ruleSet.categories.map((c) => c.id))).toBe(top);
  });

  // Bar 1: `best` may not move. This story does not touch it, so any change in the best
  // column is a regression, not a reclassification. Named-delta form rather than a direct
  // string comparison, so the failure identifies the states rather than two long strings
  // the reader has to diff by eye.
  it("does not move `best` on any state", () => {
    const moved: string[] = [];
    names.forEach((name, i) => {
      if (bestSeries[i] !== baseline[i]) {
        moved.push(`${name}: best ${baseline[i]} -> ${bestSeries[i]}`);
      }
    });
    expect(moved).toEqual([]);
    expect(bestSeries).toHaveLength(baseline.length);
  });

  // Bar 2: no upward move may land on this ruleset's highest category id, so no student
  // is congratulated on a window they did not earn. An upward move needs an anti-monotone
  // subterm (a history factor variable, or a WITH occurrence, under an odd number of
  // NOTs); tab 45 is the only tab with one in a position that can fire, and its top
  // category is unreachable that way. A sheet edit moving a NOT onto a history variable in
  // a high category is what breaks this, and is a change this repo has already seen once.
  it("never moves upward onto the highest category", () => {
    const offenders: string[] = [];
    names.forEach((name, i) => {
      if (movedOntoTop(bestSeries[i], currentSeries[i], top)) {
        offenders.push(`${name}: best ${bestSeries[i]} -> current ${currentSeries[i]}`);
      }
    });
    expect(offenders).toEqual([]);
  });

  // Bar 3: the fixture must actually reach this activity. A tab whose axes only ever
  // produce one category id is not being swept, it is being rubber-stamped: bar 1 passes
  // forever, bar 2 is vacuous, and nothing in the output says the tab is uncovered.
  it("reaches more than one category", () => {
    expect(new Set(bestSeries).size).toBeGreaterThan(1);
  });
});
