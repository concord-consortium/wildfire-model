import { ruleSet35 } from "./35";
import { makeWildfireEngine, matchAgainst, mkReading } from "./test-helpers";
import { WildfireDefaults, WildfireReading, WildfireZone } from "../wildfire/types";

// Tab 35 categories (regenerated from the 2026-08-20 sheet; Cat 100 dropped):
//   1: NOT ranSimulation
//   2: ranSimulation AND NOT setAnyVar
//   3: setAnyVar AND ranSimulation WITH NOT UniformTerrainTypes
//   4: setAnyVar AND ranSimulation WITH UniformTerrainTypes AND NOT ForestWAWOSuppression
//   5: ranSimulation WITH UniformTerrainTypes AND ForestWAWOSuppression AND NOT UniformDroughtLevels
//   6: ranSimulation WITH UniformTerrainTypes AND ForestWAWOSuppression AND UniformDroughtLevels AND NOT OneSparkPerZone
//   7: ranSimulation WITH UniformTerrainTypes AND ForestWAWOSuppression AND UniformDroughtLevels AND OneSparkPerZone
//
// CATEGORIES 3, 4 AND 5 WERE RESHUFFLED in the 2026-08-20 re-extract, so the old
// test names described inverted conditions and were rewritten rather than renumbered:
//   - cat 3 now keys on non-uniform TERRAIN. It says nothing about the forest pairing.
//   - cat 4 now keys on uniform terrain WITHOUT the forest pairing (the old cat 3's job).
//   - cat 5 now requires UNIFORM terrain with the forest pairing and non-uniform drought.
//     The old cat 5 required NON-uniform terrain, the reverse.
// Cat 2 stays reachable by the same mechanism as before: the `setAnyVar AND` guard,
// now carried by cats 3 and 4 alike. An all-default run fails setAnyVar, so neither
// can shadow cat 2. That guard is load-bearing on this tab and must not be removed;
// the preset's uniform default terrain would also exclude cat 3, but that is a second
// reason, not a replacement. See src/hazbot/TBD.md §4.
//
// Cats 3 and 4 carry the `setAnyVar AND` guard Sam added on 2026-08-20 to close a
// coverage hole: without it, a student on uniform terrain and uniform drought who had
// not set the forest pairing matched no category at all.
// No stub-gated category — the (e) shape is N/A.

// SIMINIT defaults for tab 35: 2 zones Mountains / Shrub / Mild Drought, wind 0/0.
const defaultZone: WildfireZone = { terrainType: "Mountains", vegetation: "Shrub", droughtLevel: "Mild Drought" };
const defaultZones = [defaultZone, defaultZone];
const defaults: WildfireDefaults = { zones: defaultZones, wind: { speed: 0, direction: 0 } };

// One zone Forest, the other Forest With Suppression → ForestWAWOSuppression true.
const forestWW: WildfireZone[] = [
  { terrainType: "Mountains", vegetation: "Forest", droughtLevel: "Mild Drought" },
  { terrainType: "Mountains", vegetation: "Forest With Suppression", droughtLevel: "Mild Drought" },
];
const forestWWNonUniformDrought: WildfireZone[] = [
  { terrainType: "Mountains", vegetation: "Forest", droughtLevel: "Mild Drought" },
  { terrainType: "Mountains", vegetation: "Forest With Suppression", droughtLevel: "Severe Drought" },
];
const forestWWNonUniformTerrain: WildfireZone[] = [
  { terrainType: "Mountains", vegetation: "Forest", droughtLevel: "Mild Drought" },
  { terrainType: "Foothills", vegetation: "Forest With Suppression", droughtLevel: "Mild Drought" },
];
// A var changed (drought), terrain left uniform, no forest-with/without-suppression
// pairing → cat 4 under the new table.
const changedNotForest: WildfireZone[] = [
  { terrainType: "Mountains", vegetation: "Shrub", droughtLevel: "Severe Drought" },
  { terrainType: "Mountains", vegetation: "Shrub", droughtLevel: "Mild Drought" },
];
// The state that used to match NO category: uniform terrain, UNIFORM drought, and no
// forest pairing, with a var still changed (vegetation off its Shrub default) so the
// setAnyVar guard is satisfied. Note the uniform drought — changedNotForest above has
// two different droughts and so was always covered, by the old cat 4 as well as the new.
const uniformDroughtNoForest: WildfireZone[] = [
  { terrainType: "Mountains", vegetation: "Forest", droughtLevel: "Mild Drought" },
  { terrainType: "Mountains", vegetation: "Forest", droughtLevel: "Mild Drought" },
];
const sparksPerZone = [{ x: 0, y: 0, zoneIdx: 0 }, { x: 1, y: 0, zoneIdx: 1 }];

function startReading(opts: Partial<WildfireReading> = {}): WildfireReading {
  return mkReading("SimulationStarted", opts.at ?? 100, {
    zones: defaultZones, sparks: [], wind: { speed: 0, direction: 0 }, ...opts,
  });
}

describe("ruleSet 35 — per-rule-set behavior sweep", () => {
  it("(a) empty readings → cat 1 (NOT ranSimulation)", () => {
    const e = makeWildfireEngine(ruleSet35, defaults);
    expect(matchAgainst(ruleSet35, e, [])).toBe(1);
  });
  it("(b) single match — uniform terrain, forest pairing, non-uniform drought → cat 5", () => {
    const e = makeWildfireEngine(ruleSet35, defaults);
    expect(matchAgainst(ruleSet35, e, [startReading({ zones: forestWWNonUniformDrought })])).toBe(5);
  });
  it("(c) multiple-true → highest wins — a no-forest run and a forest-pair spark-less run → cat 6", () => {
    const e = makeWildfireEngine(ruleSet35, defaults);
    const noForest = startReading({ zones: changedNotForest });
    const forestNoSparks = startReading({ at: 200, zones: forestWW });
    // cat 4 (a run with uniform terrain and no forest pairing exists) and cat 6 (a
    // forest-pair run with uniform terrain+drought and no spark per zone exists) → 6.
    expect(matchAgainst(ruleSet35, e, [noForest, forestNoSparks])).toBe(6);
  });
  it("(d) stability — cat 7 holds across a later no-forest run (which alone would be cat 4)", () => {
    const e = makeWildfireEngine(ruleSet35, defaults);
    const r0 = startReading({ zones: forestWW, sparks: sparksPerZone });
    expect(matchAgainst(ruleSet35, e, [r0])).toBe(7);
    expect(matchAgainst(ruleSet35, e, [r0, startReading({ at: 200, zones: changedNotForest })])).toBe(7);
  });
});

describe("ruleSet 35 — R9 per-category coverage", () => {
  // Cat 2 is reachable because cats 3 and 4 both carry a `setAnyVar AND` guard
  // (see the file header). All seven categories are covered below.
  const e = () => makeWildfireEngine(ruleSet35, defaults);
  it("cat 1 — no run", () => expect(matchAgainst(ruleSet35, e(), [])).toBe(1));
  it("cat 3 — ran with non-uniform terrain", () =>
    expect(matchAgainst(ruleSet35, e(), [startReading({ zones: forestWWNonUniformTerrain })])).toBe(3));
  it("cat 4 — uniform terrain, but without the forest-with/without-suppression pairing", () =>
    expect(matchAgainst(ruleSet35, e(), [startReading({ zones: changedNotForest })])).toBe(4));
  it("cat 5 — uniform terrain with the forest pairing, non-uniform drought", () =>
    expect(matchAgainst(ruleSet35, e(), [startReading({ zones: forestWWNonUniformDrought })])).toBe(5));
  it("cat 4 — closes the coverage hole: uniform terrain, uniform drought, no forest pairing", () => {
    // The regression guard for the defect Sam's 2026-08-20 sheet fixed. Before it, this
    // state matched no category at all, so the monotone floor kept its seed value and
    // told a student who had just run the model "You haven't run the model yet".
    // Measured against the pre-fix expressions this fixture returns 1 and the current
    // ones return 4, so the assertion genuinely fails if the setAnyVar guard on cat 4 is
    // dropped again. Do not swap in changedNotForest: its droughts differ, so it scored 4
    // under the old rules too and would keep this test green against the broken sheet.
    expect(matchAgainst(ruleSet35, e(), [startReading({ zones: uniformDroughtNoForest })])).toBe(4);
  });
  it("cat 6 — forest pairing, uniform terrain+drought, no spark per zone", () =>
    expect(matchAgainst(ruleSet35, e(), [startReading({ zones: forestWW })])).toBe(6));
  it("cat 7 — forest pairing, uniform terrain+drought, one spark per zone", () =>
    expect(matchAgainst(ruleSet35, e(), [startReading({ zones: forestWW, sparks: sparksPerZone })])).toBe(7));
  it("cat 2 — an all-default run (no vars set) is shadowed by neither cat 3 nor cat 4", () =>
    expect(matchAgainst(ruleSet35, e(), [startReading()])).toBe(2));
});
