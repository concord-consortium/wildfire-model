import { factorVariables } from "./factor-variables";
import { WildfireDefaults, WildfireReading } from "./types";
import { vegetationLabels } from "../../types";

function mkRead(triggeredBy: string, opts: Partial<WildfireReading> = {}): WildfireReading {
  return { triggeredBy, sessionId: "test", at: 0, temporalHistory: [], ...opts };
}

describe("wildfire factor variables", () => {
  describe("ranSimulation", () => {
    it("true when at least one SimulationStarted reading exists", () => {
      const r = factorVariables.ranSimulation.compute([mkRead("SimulationStarted")], {});
      expect(r.value).toBe(true);
      expect(r.witnesses).toHaveLength(1);
    });
    it("false when readings are empty", () => {
      expect(factorVariables.ranSimulation.compute([], {}).value).toBe(false);
    });
    it("false when only non-SimulationStarted readings exist", () => {
      expect(factorVariables.ranSimulation.compute([mkRead("ChartTabShown")], {}).value).toBe(false);
    });
  });

  describe("setDroughtLevel", () => {
    const defaults: WildfireDefaults = { zones: [{ droughtLevel: "Mild" }, { droughtLevel: "Mild" }] };
    it("true when any zone's drought differs from defaults", () => {
      const reading = mkRead("SimulationStarted", { zones: [{ droughtLevel: "Mild" }, { droughtLevel: "Severe" }] });
      expect(factorVariables.setDroughtLevel.compute([reading], defaults).value).toBe(true);
    });
    it("false when all zones match defaults", () => {
      const reading = mkRead("SimulationStarted", { zones: [{ droughtLevel: "Mild" }, { droughtLevel: "Mild" }] });
      expect(factorVariables.setDroughtLevel.compute([reading], defaults).value).toBe(false);
    });
  });

  describe("usedOneSparkPerZone", () => {
    it("true when sparks count == zones count and zones are distinct", () => {
      const reading = mkRead("SimulationStarted", {
        zones: [{ index: 0 }, { index: 1 }],
        sparks: [{ x: 0, y: 0, zoneIdx: 0 }, { x: 1, y: 1, zoneIdx: 1 }],
      });
      expect(factorVariables.usedOneSparkPerZone.compute([reading], {}).value).toBe(true);
    });
    it("false when sparks all in one zone", () => {
      const reading = mkRead("SimulationStarted", {
        zones: [{ index: 0 }, { index: 1 }],
        sparks: [{ x: 0, y: 0, zoneIdx: 0 }, { x: 1, y: 1, zoneIdx: 0 }],
      });
      expect(factorVariables.usedOneSparkPerZone.compute([reading], {}).value).toBe(false);
    });
    it("false for a trivial 1-zone / 1-spark setup (sheet definition requires multi-zone)", () => {
      // Scenario: student ran the model with one zone and one spark earlier in
      // the session, then added a second zone but hasn't placed a second spark.
      // The 1+1 reading must not satisfy the multi-zone rubric, even though it
      // passes the generic length-and-distinct check.
      const reading = mkRead("SimulationStarted", {
        zones: [{ index: 0 }],
        sparks: [{ x: 0, y: 0, zoneIdx: 0 }],
      });
      expect(factorVariables.usedOneSparkPerZone.compute([reading], {}).value).toBe(false);
    });
    it("false when any spark has undefined zoneIdx (would falsely look distinct in Set)", () => {
      // Real-data hazard: bottom-bar.tsx captures `zoneIdx: cell?.zoneIdx`; if
      // cellAt returns null for a spark (cells not loaded, out-of-bounds), zoneIdx
      // is undefined. Without the guard, [0, undefined] would Set-dedupe to size 2
      // and falsely satisfy a 2-zone activity's "one-per-zone" check.
      const reading = mkRead("SimulationStarted", {
        zones: [{ index: 0 }, { index: 1 }],
        sparks: [{ x: 0, y: 0, zoneIdx: 0 }, { x: 1, y: 1, zoneIdx: undefined }],
      });
      expect(factorVariables.usedOneSparkPerZone.compute([reading], {}).value).toBe(false);
    });
  });

  describe("uniqueWindValuesUsed", () => {
    it("collects unique speed-direction keys from SimulationStarted readings", () => {
      const a = mkRead("SimulationStarted", { wind: { speed: 5, direction: 0 } });
      const b = mkRead("SimulationStarted", { wind: { speed: 5, direction: 0 } });
      const c = mkRead("SimulationStarted", { wind: { speed: 10, direction: 90 } });
      const r = factorVariables.uniqueWindValuesUsed.compute([a, b, c], {});
      expect(r.value).toBeInstanceOf(Set);
      expect((r.value as Set<string>).size).toBe(2);
      expect(r.witnesses).toHaveLength(2);
    });

    it("treats zero-speed readings with different directions as one entry (sheet rule: direction ignored when magnitude is 0)", () => {
      const a = mkRead("SimulationStarted", { wind: { speed: 0, direction: 0 } });
      const b = mkRead("SimulationStarted", { wind: { speed: 0, direction: 90 } });
      const r = factorVariables.uniqueWindValuesUsed.compute([a, b], {});
      expect((r.value as Set<string>).size).toBe(1);
      expect(r.witnesses).toHaveLength(1);
    });
  });

  describe("uniqueNonZeroWindValuesUsed", () => {
    it("excludes zero-speed wind readings", () => {
      const a = mkRead("SimulationStarted", { wind: { speed: 0, direction: 0 } });
      const b = mkRead("SimulationStarted", { wind: { speed: 5, direction: 0 } });
      const r = factorVariables.uniqueNonZeroWindValuesUsed.compute([a, b], {});
      expect((r.value as Set<string>).size).toBe(1);
      expect(r.witnesses).toHaveLength(1);
    });
  });

  describe("simulationRuns", () => {
    it("returns the array of SimulationStarted readings as both value and witnesses", () => {
      const a = mkRead("SimulationStarted");
      const b = mkRead("ChartTabShown");
      const c = mkRead("SimulationStarted");
      const r = factorVariables.simulationRuns.compute([a, b, c], {});
      expect((r.value as WildfireReading[]).length).toBe(2);
      expect(r.witnesses).toHaveLength(2);
    });
  });

  describe("triedAllVegetations", () => {
    // Per tab 34 sheet (R15): across all runs the union of zone vegetation must
    // cover every Vegetation enum value.
    const allVegs = Object.values(vegetationLabels);
    it("true when runs collectively cover every Vegetation value", () => {
      const r1 = mkRead("SimulationStarted", { zones: [{ vegetation: allVegs[0] }, { vegetation: allVegs[1] }] });
      const r2 = mkRead("SimulationStarted", { zones: [{ vegetation: allVegs[2] }, { vegetation: allVegs[3] }] });
      expect(factorVariables.triedAllVegetations.compute([r1, r2], {}).value).toBe(true);
    });
    it("false when some Vegetation value was never used", () => {
      const r1 = mkRead("SimulationStarted", { zones: [{ vegetation: allVegs[0] }, { vegetation: allVegs[1] }] });
      expect(factorVariables.triedAllVegetations.compute([r1], {}).value).toBe(false);
    });
    it("false with no readings", () => {
      expect(factorVariables.triedAllVegetations.compute([], {}).value).toBe(false);
    });
  });

  describe("usedFireline", () => {
    // Per tab 45 sheet (R9): some run drew a fire line (fireLineMarkers length
    // >= 2). The Fire Line tool is disabled until a run starts, so the first
    // run's snapshot is always empty and a drawn line shows up only in a later
    // SimulationStarted reading (R6a) — exercised here as a multi-run sequence.
    it("true when a later run carries >= 2 fire-line markers", () => {
      const early = mkRead("SimulationStarted", { fireLineMarkers: [] });
      const later = mkRead("SimulationStarted", {
        fireLineMarkers: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.2 }],
      });
      const r = factorVariables.usedFireline.compute([early, later], {});
      expect(r.value).toBe(true);
      expect(r.witnesses).toHaveLength(1);
    });
    it("false when no run drew a fire line", () => {
      const a = mkRead("SimulationStarted", { fireLineMarkers: [] });
      const b = mkRead("SimulationStarted", {});
      expect(factorVariables.usedFireline.compute([a, b], {}).value).toBe(false);
    });
    it("false for a half-placed line (one marker)", () => {
      const a = mkRead("SimulationStarted", { fireLineMarkers: [{ x: 0.1, y: 0.2 }] });
      expect(factorVariables.usedFireline.compute([a], {}).value).toBe(false);
    });
  });

  describe("usedHelitack (stub)", () => {
    it("is flagged isStub: true and computes to false", () => {
      expect(factorVariables.usedHelitack.isStub).toBe(true);
      expect(factorVariables.usedHelitack.compute([], {}).value).toBe(false);
    });
  });

  describe("default value semantics", () => {
    it("each impl declares a defaultValue suitable for its return shape", () => {
      expect(factorVariables.ranSimulation.defaultValue).toBe(false);
      expect(factorVariables.uniqueWindValuesUsed.defaultValue).toBeInstanceOf(Set);
      expect(factorVariables.simulationRuns.defaultValue).toEqual([]);
    });
  });
});
