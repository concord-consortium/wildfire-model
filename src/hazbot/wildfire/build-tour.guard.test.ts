// Guard-path coverage for buildTour (WM-17): a NON-terminal viewport step has no
// target/advanceOn, so in a gated forward-only tour it is un-advanceable. buildTour
// must degrade to the intro popover (return null) rather than emit a stuck tour.
// The real authored map never produces this (asserted in tour-map.test.ts), so this
// test mocks synthetic map/data to exercise the defensive guard directly.

jest.mock("./tour-data.generated", () => ({
  tourData: {
    "99": {
      // Two well-formed steps so the count check passes and the guard is what fires.
      2: { stepCount: 2, doneLabel: "Got it!", steps: [{ text: "a" }, { text: "b" }] },
      3: { stepCount: 2, doneLabel: "Got it!", steps: [{ text: "a" }, { text: "b" }] },
    },
  },
}));

jest.mock("./tour-map", () => ({
  tourMap: {
    "99": {
      // Non-terminal viewport (invalid) → must return null.
      2: () => [
        { kind: "viewport", position: "top-center" },
        { kind: "anchor", testid: "restart-button" },
      ],
      // Terminal viewport (valid) → builds normally.
      3: () => [
        { kind: "anchor", testid: "restart-button" },
        { kind: "viewport", position: "top-center" },
      ],
    },
  },
}));

import { buildTour } from "./build-tour";

/* eslint-disable @typescript-eslint/no-explicit-any */
describe("buildTour viewport guard", () => {
  it("returns null when a viewport step is not the terminal step", () => {
    expect(buildTour("99", 2, { sparkZoneCount: 0 })).toBeNull();
  });

  it("builds normally when the viewport step is terminal", () => {
    const tour = buildTour("99", 3, { sparkZoneCount: 0 })!;
    expect(tour).not.toBeNull();
    expect(tour.length).toBe(2);
    expect((tour[0] as any).target).toBe('[data-testid="restart-button"]');
    expect((tour[1] as any).popover.position).toBe("top-center");
  });
});
/* eslint-enable @typescript-eslint/no-explicit-any */
