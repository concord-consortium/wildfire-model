import { simProps } from "./sim-props";
import { WildfireReading } from "./types";

function mkRead(opts: Partial<WildfireReading> = {}): WildfireReading {
  return { triggeredBy: "SimulationStarted", sessionId: "test", at: 0, updates: [], ...opts };
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
    it("declares ambientStateKeys for SimulationStarted (per AC: GraphOpen ambient validation)", () => {
      expect(simProps.GraphOpen.ambientStateKeys).toEqual({ SimulationStarted: ["chartTabOpenAtStart"] });
    });
    it("true when ambientState.chartTabOpenAtStart is true", () => {
      const r = mkRead({ ambientState: { chartTabOpenAtStart: true } });
      expect(simProps.GraphOpen.evaluate(r, {})).toBe(true);
    });
    it("true when reading.updates contains a ChartTabShown", () => {
      const r = mkRead({
        ambientState: { chartTabOpenAtStart: false },
        updates: [{ source: "ChartTabShown", value: true, at: 100 }],
      });
      expect(simProps.GraphOpen.evaluate(r, {})).toBe(true);
    });
    it("false when neither condition holds", () => {
      const r = mkRead({ ambientState: { chartTabOpenAtStart: false } });
      expect(simProps.GraphOpen.evaluate(r, {})).toBe(false);
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
