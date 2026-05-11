import { ruleSet25 } from "./25";
import { makeWildfireEngine, matchAgainst, mkReading } from "./test-helpers";
import { WildfireReading } from "../wildfire/types";

// Tab 25 categories (no zone defaults — just sparks/graph/sim props):
//   1: NOT ranSimulation
//   2: ranSimulation WITH NOT TwoSparks
//   3: ranSimulation WITH NOT OneSparkPerZone AND TwoSparks
//   4: ranSimulation WITH OneSparkPerZone AND NOT SparksAtTopAndBottom
//   5: ranSimulation WITH OneSparkPerZone AND NOT GraphOpen
//   6: ranSimulation WITH OneSparkPerZone AND SparksAtTopAndBottom AND GraphOpen
//
// (e) is the SparksAtTopAndBottom-stubbed cat 6 — even when an otherwise-fully-
// satisfying state arrives, cat 6 must NOT match because the stub returns false.

const twoZones = [{ index: 0 }, { index: 1 }];

function startReading(opts: Partial<WildfireReading> = {}): WildfireReading {
  return mkReading("SimulationStarted", opts.at ?? 100, {
    zones: twoZones,
    sparks: [],
    wind: { speed: 0, direction: 0 },
    ...opts,
  });
}

describe("ruleSet 25 — per-rule-set five-shape sweep", () => {
  it("(a) empty readings → cat 1", () => {
    const e = makeWildfireEngine(ruleSet25);
    expect(matchAgainst(ruleSet25, e, [])).toBe(1);
  });

  it("(b) state matching exactly one category — ran sim with one spark → cat 2", () => {
    const e = makeWildfireEngine(ruleSet25);
    const r = startReading({ sparks: [{ x: 0, y: 0, zoneIdx: 0 }] });
    expect(matchAgainst(ruleSet25, e, [r])).toBe(2);
  });

  it("(c) multi-true with highest selected — sparks per zone + graph NOT open → cat 4 AND cat 5 both true; highest (cat 5) wins", () => {
    const e = makeWildfireEngine(ruleSet25);
    const r = startReading({
      sparks: [{ x: 0, y: 0, zoneIdx: 0 }, { x: 1, y: 0, zoneIdx: 1 }],
      ambientState: { chartTabOpenAtStart: false },
    });
    // cat 4: ranSimulation WITH (OneSparkPerZone AND NOT SparksAtTopAndBottom)
    //        OneSparkPerZone=true (2 sparks, distinct zones); SparksAtTopAndBottom=false (stub)
    //        → true
    // cat 5: ranSimulation WITH (OneSparkPerZone AND NOT GraphOpen)
    //        OneSparkPerZone=true; GraphOpen=false (chartTabOpenAtStart:false, no ChartTabShown)
    //        → true
    // cat 6: ranSimulation WITH (OneSparkPerZone AND SparksAtTopAndBottom AND GraphOpen)
    //        SparksAtTopAndBottom=false (stub) → false
    // Cats 4 and 5 both fire; highest-first selection picks cat 5.
    expect(matchAgainst(ruleSet25, e, [r])).toBe(5);
  });

  it("(d) monotonicity — once cat 5 matches (sparks per zone, graph not open), a later state with one spark leaves floor at 5", () => {
    const e = makeWildfireEngine(ruleSet25);
    const r1 = startReading({ sparks: [{ x: 0, y: 0, zoneIdx: 0 }, { x: 1, y: 0, zoneIdx: 1 }] });
    // cat 4: OneSparkPerZone AND NOT SparksAtTopAndBottom → true (stub false)
    // cat 5: OneSparkPerZone AND NOT GraphOpen → true (graph not open)
    // Highest: cat 5.
    expect(matchAgainst(ruleSet25, e, [r1])).toBe(5);
    const r2 = startReading({ at: 200, sparks: [{ x: 0, y: 0, zoneIdx: 0 }] });
    // r2 alone matches cat 2; but the floor across [r1, r2] is still cat 5.
    expect(matchAgainst(ruleSet25, e, [r1, r2])).toBe(5);
  });

  it("(e) AC: SparksAtTopAndBottom-stubbed cat 6 is unreachable — fully-satisfying state never matches cat 6", () => {
    const e = makeWildfireEngine(ruleSet25);
    // Witness configured to satisfy every leaf in cat 6 except SparksAtTopAndBottom:
    // - 2 sparks (TwoSparks=true)
    // - one per zone (OneSparkPerZone=true)
    // - chart open at start (GraphOpen=true)
    // Cat 6 = OneSparkPerZone AND SparksAtTopAndBottom AND GraphOpen.
    // The stub keeps cat 6 from matching even when everything else lines up.
    const r = startReading({
      sparks: [{ x: 0, y: 0, zoneIdx: 0 }, { x: 1, y: 0, zoneIdx: 1 }],
      ambientState: { chartTabOpenAtStart: true },
    });
    const matched = matchAgainst(ruleSet25, e, [r]);
    expect(matched).not.toBe(6);
  });
});
