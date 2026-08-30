import { tourMap, TourContext, StepAnchor } from "./tour-map";
import { tourData } from "./tour-data.generated";
import { ANCHOR_TESTIDS } from "./anchor-testids";
import { SATISFIED_BY } from "../../components/hazbot-button";

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

  // Every tour opens on Restart or Clear All, both of which leave the run stopped, so a
  // control that only enables mid-run is dead for the whole tour. Anchoring a step to one
  // rings a button the student cannot click.
  const NEEDS_A_RUN_IN_PROGRESS = ["fireline-button", "helitack-button"];

  it("no step anchors a control that only enables while a run is in progress", () => {
    const offenders: string[] = [];
    for (const rs of Object.keys(tourMap)) {
      for (const cat of Object.keys(tourMap[rs]).map(Number)) {
        for (const ctx of CTXS) {
          tourMap[rs][cat](ctx).forEach((step, i) => {
            if (step.kind === "anchor" && NEEDS_A_RUN_IN_PROGRESS.includes(step.testid)) {
              offenders.push(`${rs}/${cat} step ${i + 1}: ${step.testid}`);
            }
          });
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  // Anchors that can open a tour but deliberately carry no SATISFIED_BY predicate:
  // `terrain-button` is only dead in a state where `restart-button` is still live, so a
  // tour never reaches it as a droppable opener, and `terrain-next` lives inside the
  // Setup panel, which is closed whenever a tour is built.
  const NO_SKIP_PREDICATE = ["terrain-button", "terrain-next"];

  it("every non-terminal anchor either has a skip predicate or is a declared omission", () => {
    const nonTerminal: string[] = [];
    for (const rs of Object.keys(tourMap)) {
      for (const cat of Object.keys(tourMap[rs]).map(Number)) {
        for (const ctx of CTXS) {
          const steps = tourMap[rs][cat](ctx);
          for (const step of steps.slice(0, -1)) {
            if (step.kind === "anchor" && !nonTerminal.includes(step.testid)) {
              nonTerminal.push(step.testid);
            }
          }
        }
      }
    }
    expect(nonTerminal.length).toBeGreaterThan(0);
    const undeclared = nonTerminal
      .filter((t) => !SATISFIED_BY[t as keyof typeof SATISFIED_BY])
      .filter((t) => !NO_SKIP_PREDICATE.includes(t));
    expect(undeclared).toEqual([]);
  });

  // The skip can promote any step to be the tour's opener, so a step that opens with a
  // connective would point back at one the student never saw. A hit means read the line,
  // not that the line is certainly wrong.
  it("no step after the first opens with a connective, so any of them reads as an opener", () => {
    const LEADING_CONNECTIVE = /^\s*(first|second|third|then|now|next|also|finally)\b/i;
    const offenders: string[] = [];
    for (const ruleSetId of Object.keys(tourData)) {
      for (const categoryId of Object.keys(tourData[ruleSetId]).map(Number)) {
        tourData[ruleSetId][categoryId].steps.forEach((step, i) => {
          if (i > 0 && LEADING_CONNECTIVE.test(step.text)) {
            offenders.push(`${ruleSetId}/${categoryId} step ${i + 1}: ${JSON.stringify(step.text)}`);
          }
        });
      }
    }
    expect(offenders).toEqual([]);
  });

  it("25/4 carries a popover image on its centered-top step", () => {
    const step = tourMap["25"][4]({ sparkZoneCount: 2 })[1];
    expect(step).toMatchObject({ kind: "viewport", position: "top-center" });
    const viewport = step as Extract<StepAnchor, { kind: "viewport" }>;
    expect(viewport.image).toBeTruthy();
  });
});
