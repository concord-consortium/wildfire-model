import { temporalVariables } from "./temporal-variables";
import { CHART_TAB_INITIAL_OPEN } from "./constants";

describe("wildfire temporal-variables", () => {
  describe("chartTabOpen", () => {
    const chartTabOpen = temporalVariables.chartTabOpen;

    it("declares the expected shape", () => {
      expect(chartTabOpen.name).toBe("chartTabOpen");
      expect(chartTabOpen.initialValue).toBe(CHART_TAB_INITIAL_OPEN);
      expect(CHART_TAB_INITIAL_OPEN).toBe(false);
      expect(chartTabOpen.acceptedEvents).toEqual(["ChartTabShown", "ChartTabHidden"]);
    });

    it("ChartTabShown → true", () => {
      expect(chartTabOpen.reduce(false, { name: "ChartTabShown", at: 0 })).toBe(true);
    });

    it("ChartTabHidden → false", () => {
      expect(chartTabOpen.reduce(true, { name: "ChartTabHidden", at: 0 })).toBe(false);
    });

    it("ChartTabHidden on already-false → false (no-op)", () => {
      expect(chartTabOpen.reduce(false, { name: "ChartTabHidden", at: 0 })).toBe(false);
    });

    it("ChartTabShown on already-true → true (idempotent)", () => {
      expect(chartTabOpen.reduce(true, { name: "ChartTabShown", at: 0 })).toBe(true);
    });
  });
});
