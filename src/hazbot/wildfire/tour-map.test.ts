import { ReactNode, isValidElement } from "react";
import { tourMap, TourContext } from "./tour-map";
import { tourData } from "./tour-data.generated";
import { ANCHOR_TESTIDS } from "./anchor-testids";

// Exercise both branches of every conditional factory.
const CTXS: TourContext[] = [{ sparkZoneCount: 1 }, { sparkZoneCount: 2 }];
const anchorSet = new Set<string>(ANCHOR_TESTIDS);

// How wide a popover figure may be declared. The coachmarks hazbot theme gives the popover a 280px
// box with 3px borders and 12px content padding, then floats a 52px Hazbot avatar (-5px/+12px side
// margins) at its top-left. A figure's <img> is a block-level replaced element, so it may not overlap
// that float's margin box: declare it wider and it silently drops onto its own line below the avatar.
const POPOVER_CONTENT_WIDTH = 280 - 2 * 3 - 2 * 12;
const AVATAR_MARGIN_BOX = -5 + 52 + 12;
const MAX_FIGURE_WIDTH = POPOVER_CONTENT_WIDTH - AVATAR_MARGIN_BOX;

/** Keyed `ruleSet/category` so a failure names the offending entry. */
const emittedFigures = () => {
  const figures: { key: string; image: ReactNode }[] = [];
  for (const rs of Object.keys(tourMap)) {
    for (const cat of Object.keys(tourMap[rs]).map(Number)) {
      for (const ctx of CTXS) {
        for (const step of tourMap[rs][cat](ctx)) {
          if (step.kind === "viewport" && step.image) {
            figures.push({ key: `${rs}/${cat}`, image: step.image });
          }
        }
      }
    }
  }
  return figures;
};

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

  it("viewport steps only ever appear as the terminal step (no un-advanceable gated step)", () => {
    // A viewport step has no anchor/advanceOn, so a non-terminal one would soft-lock a
    // gated tour. Assert the authored map never emits one mid-tour, on either branch.
    const nonTerminalViewports: string[] = [];
    for (const rs of Object.keys(tourMap)) {
      for (const cat of Object.keys(tourMap[rs]).map(Number)) {
        for (const ctx of CTXS) {
          const steps = tourMap[rs][cat](ctx);
          steps.forEach((step, i) => {
            if (step.kind === "viewport" && i !== steps.length - 1) {
              nonTerminalViewports.push(`${rs}/${cat} step ${i} (sparkZoneCount=${ctx.sparkZoneCount})`);
            }
          });
        }
      }
    }
    expect(nonTerminalViewports).toEqual([]);
  });

  it("25/4's terminal step is a centered-top viewport bubble", () => {
    const step = tourMap["25"][4]({ sparkZoneCount: 2 })[1];
    expect(step).toMatchObject({ kind: "viewport", position: "top-center" });
  });

  it("every popover figure is an <img> with declared dimensions that fit beside the avatar", () => {
    const figures = emittedFigures();
    expect(figures.map(f => f.key)).toContain("25/4");

    const problems: string[] = [];
    for (const { key, image } of figures) {
      if (!isValidElement(image) || image.type !== "img") {
        problems.push(`${key}: figure is not an <img>`);
        continue;
      }
      const { width, height } = image.props as { width?: number; height?: number };
      if (!width || width <= 0 || !height || height <= 0) {
        problems.push(`${key}: figure declares width=${width} height=${height}`);
      } else if (width > MAX_FIGURE_WIDTH) {
        problems.push(`${key}: figure declares ${width}px wide, max is ${MAX_FIGURE_WIDTH}px`);
      }
    }
    // Deduped: a factory that ignores its context emits the same figure on both branches.
    expect(Array.from(new Set(problems))).toEqual([]);
  });
});
