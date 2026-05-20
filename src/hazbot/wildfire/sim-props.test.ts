import { simProps } from "./sim-props";
import { WildfireReading } from "./types";

function mkRead(opts: Partial<WildfireReading> = {}): WildfireReading {
  return { triggeredBy: "SimulationStarted", sessionId: "test", at: 0, temporalHistory: [], ...opts };
}

describe("wildfire sim-props", () => {
  describe("OneSparkPerZone", () => {
    it("true when sparks.length === zones.length and zones distinct", () => {
      const r = mkRead({
        zones: [{ index: 0 }, { index: 1 }],
        sparks: [{ x: 0, y: 0, zoneIdx: 0 }, { x: 1, y: 0, zoneIdx: 1 }],
      });
      expect(simProps.OneSparkPerZone.evaluate(r, {})).toBe(true);
    });
    it("false when sparks count != zones count", () => {
      const r = mkRead({ zones: [{ index: 0 }, { index: 1 }], sparks: [{ x: 0, y: 0, zoneIdx: 0 }] });
      expect(simProps.OneSparkPerZone.evaluate(r, {})).toBe(false);
    });
    it("false for a trivial 1-zone / 1-spark setup (predicate is for multi-zone activities)", () => {
      const r = mkRead({
        zones: [{ index: 0 }],
        sparks: [{ x: 0, y: 0, zoneIdx: 0 }],
      });
      expect(simProps.OneSparkPerZone.evaluate(r, {})).toBe(false);
    });
    it("false when two sparks share a zone (legitimate-zoneIdx case)", () => {
      const r = mkRead({
        zones: [{ index: 0 }, { index: 1 }],
        sparks: [{ x: 0, y: 0, zoneIdx: 0 }, { x: 1, y: 0, zoneIdx: 0 }],
      });
      expect(simProps.OneSparkPerZone.evaluate(r, {})).toBe(false);
    });
    it("false when any spark has undefined zoneIdx (would falsely look distinct in Set)", () => {
      const r = mkRead({
        zones: [{ index: 0 }, { index: 1 }],
        sparks: [{ x: 0, y: 0, zoneIdx: 0 }, { x: 1, y: 0, zoneIdx: undefined }],
      });
      expect(simProps.OneSparkPerZone.evaluate(r, {})).toBe(false);
    });
  });

  describe("UniqueVegetationPerZone", () => {
    it("true when vegetations are distinct", () => {
      const r = mkRead({ zones: [{ vegetation: "Grass" }, { vegetation: "Forest" }] });
      expect(simProps.UniqueVegetationPerZone.evaluate(r, {})).toBe(true);
    });
    it("false when vegetations repeat", () => {
      const r = mkRead({ zones: [{ vegetation: "Grass" }, { vegetation: "Grass" }] });
      expect(simProps.UniqueVegetationPerZone.evaluate(r, {})).toBe(false);
    });
    it("false when any zone's vegetation is undefined (fails closed)", () => {
      const r = mkRead({ zones: [{ vegetation: "Grass" }, { vegetation: undefined }] });
      expect(simProps.UniqueVegetationPerZone.evaluate(r, {})).toBe(false);
    });
  });

  describe("UniformDroughtLevels / UniformTerrainTypes", () => {
    it("UniformDroughtLevels is true when all zones share droughtLevel", () => {
      const r = mkRead({ zones: [{ droughtLevel: "Mild" }, { droughtLevel: "Mild" }] });
      expect(simProps.UniformDroughtLevels.evaluate(r, {})).toBe(true);
    });
    it("UniformTerrainTypes is false when zones differ", () => {
      const r = mkRead({ zones: [{ terrainType: "Plains" }, { terrainType: "Mountains" }] });
      expect(simProps.UniformTerrainTypes.evaluate(r, {})).toBe(false);
    });
    it("UniformDroughtLevels is false when any zone's droughtLevel is undefined (fails closed)", () => {
      // Without the guard, Set([undefined, undefined]).size === 1 would falsely
      // report "uniform" before any zone's drought is set.
      const r = mkRead({ zones: [{ droughtLevel: undefined }, { droughtLevel: undefined }] });
      expect(simProps.UniformDroughtLevels.evaluate(r, {})).toBe(false);
    });
    it("UniformTerrainTypes is false when any zone's terrainType is undefined (fails closed)", () => {
      const r = mkRead({ zones: [{ terrainType: "Plains" }, { terrainType: undefined }] });
      expect(simProps.UniformTerrainTypes.evaluate(r, {})).toBe(false);
    });
  });

  describe("TwoSparks", () => {
    it("true with exactly two sparks", () => {
      const r = mkRead({ sparks: [{ x: 0, y: 0 }, { x: 1, y: 0 }] });
      expect(simProps.TwoSparks.evaluate(r, {})).toBe(true);
    });
    it("false with one or three sparks", () => {
      expect(simProps.TwoSparks.evaluate(mkRead({ sparks: [{ x: 0, y: 0 }] }), {})).toBe(false);
      expect(simProps.TwoSparks.evaluate(mkRead({ sparks: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }] }), {})).toBe(false);
    });
  });

  describe("GraphOpen", () => {
    it("declares temporalReads for chartTabOpen", () => {
      expect(simProps.GraphOpen.temporalReads).toEqual(["chartTabOpen"]);
    });
    // R18b corners — sticky-OR over reading.temporalHistory.
    it("(corner 1) seed-only true → true", () => {
      const r = mkRead({
        temporalHistory: [{ at: 0, name: "chartTabOpen", value: true, eventName: "SimulationStarted" }],
      });
      expect(simProps.GraphOpen.evaluate(r, {})).toBe(true);
    });
    it("(corner 2) seed false + appended true → true", () => {
      const r = mkRead({
        temporalHistory: [
          { at: 0, name: "chartTabOpen", value: false, eventName: "SimulationStarted" },
          { at: 50, name: "chartTabOpen", value: true, eventName: "ChartTabShown" },
        ],
      });
      expect(simProps.GraphOpen.evaluate(r, {})).toBe(true);
    });
    it("(corner 3) seed true + later appends → true", () => {
      const r = mkRead({
        temporalHistory: [
          { at: 0, name: "chartTabOpen", value: true, eventName: "SimulationStarted" },
          { at: 50, name: "chartTabOpen", value: false, eventName: "ChartTabHidden" },
          { at: 80, name: "chartTabOpen", value: true, eventName: "ChartTabShown" },
        ],
      });
      expect(simProps.GraphOpen.evaluate(r, {})).toBe(true);
    });
    it("(corner 4) never open → false", () => {
      const r = mkRead({
        temporalHistory: [{ at: 0, name: "chartTabOpen", value: false, eventName: "SimulationStarted" }],
      });
      expect(simProps.GraphOpen.evaluate(r, {})).toBe(false);
    });
    it("sticky-OR: close-after-open still resolves to true", () => {
      const r = mkRead({
        temporalHistory: [
          { at: 0, name: "chartTabOpen", value: false, eventName: "SimulationStarted" },
          { at: 50, name: "chartTabOpen", value: true, eventName: "ChartTabShown" },
          { at: 80, name: "chartTabOpen", value: false, eventName: "ChartTabHidden" },
        ],
      });
      expect(simProps.GraphOpen.evaluate(r, {})).toBe(true);
    });
  });

  describe("SparksAtTopAndBottom (stub)", () => {
    it("is flagged isStub: true and returns false", () => {
      expect(simProps.SparksAtTopAndBottom.isStub).toBe(true);
      expect(simProps.SparksAtTopAndBottom.evaluate(mkRead(), {})).toBe(false);
    });
  });

  describe("default values", () => {
    it("all sim-props declare defaultValue: false", () => {
      Object.values(simProps).forEach((impl) => {
        expect(impl.defaultValue).toBe(false);
      });
    });
  });
});
