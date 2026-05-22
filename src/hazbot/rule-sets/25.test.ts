import { ruleSet25 } from "./25";
import { makeWildfireEngine, matchAgainst, mkReading } from "./test-helpers";
import { WildfireReading } from "../wildfire/types";

// Tab 25 categories (regenerated from the 2026-05-22 sheet; Cat 100 dropped):
//   1: NOT ranSimulation
//   2: ranSimulation WITH NOT TwoSparks
//   3: ranSimulation WITH NOT OneSparkPerZone AND TwoSparks
//   4: ranSimulation WITH OneSparkPerZone AND NOT SparksAtTopAndBottom
//   5: ranSimulation WITH OneSparkPerZone AND SparksAtTopAndBottom AND NOT UniformZoneSettings
//   6: ranSimulation WITH OneSparkPerZone AND SparksAtTopAndBottom AND UniformZoneSettings
//
// SparksAtTopAndBottom is a stub (evaluates false → WM-15). It sits in a
// top-level AND of the WITH prop-expression of BOTH cat 5 and cat 6, so BOTH
// are stub-gated — unreachable in any environment until WM-15 lands. R9
// per-category coverage therefore covers cats 1-4 only; the (e) shape asserts a
// fully-satisfying state still never matches cat 5 or cat 6.
// (The WM-18 spec named only tab 25 cat 6 as stub-gated; the 2026-05-22 sheet
// adds SparksAtTopAndBottom to cat 5 as well — see the spec cross-reference.)
//
// Tab 25 references no `set*` factor variable and no defaults-consuming sim-prop
// (UniformZoneSettings compares zones to each other), so it omits `defaults`.

// SIMINIT defaults for tab 25: 2 zones Mountains / Shrub / Mild Drought.
const uniformZones = [
  { vegetation: "Shrub", droughtLevel: "Mild Drought" },
  { vegetation: "Shrub", droughtLevel: "Mild Drought" },
];
const oneSpark = [{ x: 0, y: 0, zoneIdx: 0 }];
const twoSparksSameZone = [{ x: 0, y: 0, zoneIdx: 0 }, { x: 1, y: 0, zoneIdx: 0 }];
const oneSparkPerZone = [{ x: 0, y: 0, zoneIdx: 0 }, { x: 1, y: 0, zoneIdx: 1 }];

function startReading(opts: Partial<WildfireReading> = {}): WildfireReading {
  return mkReading("SimulationStarted", opts.at ?? 100, {
    zones: uniformZones, sparks: [], wind: { speed: 0, direction: 0 }, ...opts,
  });
}

describe("ruleSet 25 — per-rule-set behavior sweep", () => {
  it("(a) empty readings → cat 1 (NOT ranSimulation)", () => {
    const e = makeWildfireEngine(ruleSet25);
    expect(matchAgainst(ruleSet25, e, [])).toBe(1);
  });
  it("(b) ran sim with one spark → cat 2 (NOT TwoSparks)", () => {
    const e = makeWildfireEngine(ruleSet25);
    expect(matchAgainst(ruleSet25, e, [startReading({ sparks: oneSpark })])).toBe(2);
  });
  it("(c) multiple-true → highest wins — a one-spark run and a spark-per-zone run → cat 4", () => {
    const e = makeWildfireEngine(ruleSet25);
    const r1 = startReading({ sparks: oneSpark });
    const r2 = startReading({ at: 200, sparks: oneSparkPerZone });
    // cat 2 (a NOT-TwoSparks run exists) and cat 4 (a OneSparkPerZone run
    // exists) are both true → highest, cat 4, wins.
    expect(matchAgainst(ruleSet25, e, [r1, r2])).toBe(4);
  });
  it("(d) stability — cat 4 holds across a later one-spark run", () => {
    const e = makeWildfireEngine(ruleSet25);
    const r0 = startReading({ sparks: oneSparkPerZone });
    expect(matchAgainst(ruleSet25, e, [r0])).toBe(4);
    expect(matchAgainst(ruleSet25, e, [r0, startReading({ at: 200, sparks: oneSpark })])).toBe(4);
  });
  it("(e) stub-gated cats 5 & 6 — a fully-satisfying state never matches them", () => {
    const e = makeWildfireEngine(ruleSet25);
    // One spark per zone + uniform zone settings → satisfies every leaf of
    // cat 6 except SparksAtTopAndBottom (the stub). Cat 5/6 stay unmatched.
    const r = startReading({ sparks: oneSparkPerZone, zones: uniformZones });
    const matched = matchAgainst(ruleSet25, e, [r]);
    expect(matched).not.toBe(5);
    expect(matched).not.toBe(6);
  });
});

describe("ruleSet 25 — R9 per-category coverage", () => {
  // Cats 5 and 6 are stub-gated (SparksAtTopAndBottom → WM-15) and excluded.
  const e = () => makeWildfireEngine(ruleSet25);
  it("cat 1 — no run", () => expect(matchAgainst(ruleSet25, e(), [])).toBe(1));
  it("cat 2 — ran with one spark (NOT TwoSparks)", () =>
    expect(matchAgainst(ruleSet25, e(), [startReading({ sparks: oneSpark })])).toBe(2));
  it("cat 3 — ran with two sparks in the same zone (NOT OneSparkPerZone AND TwoSparks)", () =>
    expect(matchAgainst(ruleSet25, e(), [startReading({ sparks: twoSparksSameZone })])).toBe(3));
  it("cat 4 — ran with one spark per zone (OneSparkPerZone, SparksAtTopAndBottom stubbed false)", () =>
    expect(matchAgainst(ruleSet25, e(), [startReading({ sparks: oneSparkPerZone })])).toBe(4));
});
