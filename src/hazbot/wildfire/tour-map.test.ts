import { tourMap, TourContext, StepAnchor } from "./tour-map";
import { tourData } from "./tour-data.generated";
import { ANCHOR_TESTIDS } from "./anchor-testids";

// Exercise both branches of every conditional factory.
const CTXS: TourContext[] = [{ sparkZoneCount: 1 }, { sparkZoneCount: 2 }];
const anchorSet = new Set<string>(ANCHOR_TESTIDS);

describe("tourMap invariants (WM-17 acceptance criteria)", () => {
  it("map coverage: every coaching category (has tourData) has exactly one map entry, no orphans", () => {
    const dataKeys = Object.keys(tourData).sort();
    const mapKeys = Object.keys(tourMap).sort();
    expect(mapKeys).toEqual(dataKeys);

    for (const rs of dataKeys) {
      const dataCats = Object.keys(tourData[rs]).map(Number).sort((a, b) => a - b);
      const mapCats = Object.keys(tourMap[rs]).map(Number).sort((a, b) => a - b);
      expect(mapCats).toEqual(dataCats);
    }
  });

  it("step-count agreement: each factory emits exactly the parsed arrowText step count (both branches)", () => {
    for (const rs of Object.keys(tourMap)) {
      for (const cat of Object.keys(tourMap[rs]).map(Number)) {
        const expected = tourData[rs][cat].stepCount;
        for (const ctx of CTXS) {
          const steps = tourMap[rs][cat](ctx);
          expect(steps.length).toBe(expected);
        }
      }
    }
  });

  it("anchor resolvability: every anchor testid a factory can emit is in the canonical list", () => {
    const emitted: string[] = [];
    for (const rs of Object.keys(tourMap)) {
      for (const cat of Object.keys(tourMap[rs]).map(Number)) {
        for (const ctx of CTXS) {
          for (const step of tourMap[rs][cat](ctx)) {
            if (step.kind === "anchor") emitted.push(step.testid);
          }
        }
      }
    }
    const unknown = emitted.filter(t => !anchorSet.has(t));
    expect(unknown).toEqual([]);
  });

  it("conditional factories vary anchor by spark coverage but keep the same step count", () => {
    // 23/4, 33/4, 35/6 are the documented conditional categories.
    for (const [rs, cat] of [["23", 4], ["33", 4], ["35", 6]] as const) {
      const oneSpark = tourMap[rs][cat]({ sparkZoneCount: 1 });
      const bothSparks = tourMap[rs][cat]({ sparkZoneCount: 2 });
      expect(oneSpark.length).toBe(bothSparks.length);
      // Missing-spark branch rings the Spark button; both-sparks branch is a viewport bubble.
      expect(oneSpark[1]).toEqual({ kind: "anchor", testid: "spark-button" });
      expect(bothSparks[1]).toEqual({ kind: "viewport", position: "top-center", image: undefined });
    }
  });

  it("25/4 carries a popover image on its centered-top step", () => {
    const step = tourMap["25"][4]({ sparkZoneCount: 2 })[1];
    expect(step).toMatchObject({ kind: "viewport", position: "top-center" });
    const viewport = step as Extract<StepAnchor, { kind: "viewport" }>;
    expect(viewport.image).toBeTruthy();
  });
});
