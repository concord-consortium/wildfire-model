import { buildTour } from "./build-tour";
import { tourData } from "./tour-data.generated";

// Helpers to read fields off the loosely-typed EngineStep union in tests.
/* eslint-disable @typescript-eslint/no-explicit-any */
const asAny = (step: any) => step as any;

describe("buildTour", () => {
  it("zips generated text with map anchors in order; intermediate steps advance on click, terminal does not", () => {
    const tour = buildTour("23", 2, { sparkZoneCount: 2 })!;
    expect(tour).not.toBeNull();
    expect(tour.length).toBe(3);

    // Step 0: Restart anchor, advance on click.
    expect(asAny(tour[0]).target).toBe('[data-testid="restart-button"]');
    expect(asAny(tour[0]).advanceOn).toEqual({ event: "click" });
    expect(asAny(tour[0]).popover.description).toBe(tourData["23"][2].steps[0].text);

    // Step 1: Setup anchor, advance on click.
    expect(asAny(tour[1]).target).toBe('[data-testid="terrain-button"]');
    expect(asAny(tour[1]).advanceOn).toEqual({ event: "click" });

    // Step 2 (terminal): Setup-panel anchor, NO advanceOn (Done-terminated).
    expect(asAny(tour[2]).target).toBe('[data-testid="terrain-panel-container"]');
    expect(asAny(tour[2]).advanceOn).toBeUndefined();
    expect(asAny(tour[2]).popover.description).toBe(tourData["23"][2].steps[2].text);
  });

  it("emits the spark-button anchor step when a zone is missing its spark (conditional, < 2)", () => {
    const tour = buildTour("23", 4, { sparkZoneCount: 1 })!;
    expect(tour.length).toBe(2);
    expect(asAny(tour[1]).target).toBe('[data-testid="spark-button"]');
    // It is the terminal step → no advanceOn.
    expect(asAny(tour[1]).advanceOn).toBeUndefined();
  });

  it("emits a centered-top viewport step when both zones already have a spark (conditional, >= 2)", () => {
    const tour = buildTour("23", 4, { sparkZoneCount: 2 })!;
    expect(tour.length).toBe(2);
    expect(asAny(tour[1]).target).toBeUndefined();
    expect(asAny(tour[1]).popover.position).toBe("top-center");
  });

  it("carries the popover image on the 25/4 mountain step", () => {
    const tour = buildTour("25", 4, { sparkZoneCount: 2 })!;
    expect(asAny(tour[1]).popover.position).toBe("top-center");
    expect(asAny(tour[1]).popover.image).toBeTruthy();
  });

  it("returns null for a non-coaching (ruleSetId, categoryId)", () => {
    expect(buildTour("23", 1, { sparkZoneCount: 0 })).toBeNull(); // Category 1
    expect(buildTour("23", 5, { sparkZoneCount: 2 })).toBeNull(); // success category
    expect(buildTour("999", 2, { sparkZoneCount: 0 })).toBeNull(); // unknown rule set
  });

  it("anchor steps target controls by data-testid selector", () => {
    const tour = buildTour("41", 2, { sparkZoneCount: 0 })!;
    expect(asAny(tour[0]).target).toBe('[data-testid="reload-button"]');
    expect(asAny(tour[1]).target).toBe('[data-testid="start-button"]');
  });
});
/* eslint-enable @typescript-eslint/no-explicit-any */
