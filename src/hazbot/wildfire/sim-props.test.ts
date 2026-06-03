import { simProps } from "./sim-props";
import { WildfireDefaults, WildfireReading } from "./types";
import {
  TerrainType, terrainLabels, Vegetation, vegetationLabels, DroughtLevel, droughtLabels,
} from "../../types";

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

  describe("SparksAtTopAndBottom (R4)", () => {
    // Default fixture: a real mountain span at the default heightmap max, so the
    // minimum-span floor (5% × 20000 = 1000 ft) is comfortably cleared.
    const range = { min: 0, max: 10000 };
    const max = 20000;
    const sparksAt = (e1: number, e2: number) =>
      [{ x: 0, y: 0, elevation: e1 }, { x: 1, y: 0, elevation: e2 }];
    const read = (e1: number, e2: number, over: Partial<WildfireReading> = {}) =>
      mkRead({ sparks: sparksAt(e1, e2), elevationRange: range, heightmapMaxElevation: max, ...over });

    // true class: one spark top quartile, one bottom quartile (order-independent).
    it("true when one spark is near the top and the other near the bottom", () => {
      expect(simProps.SparksAtTopAndBottom.evaluate(read(9000, 500), {})).toBe(true);
      expect(simProps.SparksAtTopAndBottom.evaluate(read(500, 9000), {})).toBe(true); // reversed
    });

    // R3 false sub-cases.
    it("false when both sparks are at similar (mid) elevation", () => {
      expect(simProps.SparksAtTopAndBottom.evaluate(read(5000, 5200), {})).toBe(false);
    });
    it("false when both sparks are near the top", () => {
      expect(simProps.SparksAtTopAndBottom.evaluate(read(8000, 9500), {})).toBe(false);
    });
    it("false when both sparks are near the bottom", () => {
      expect(simProps.SparksAtTopAndBottom.evaluate(read(200, 1500), {})).toBe(false);
    });

    // Boundary values: exactly 0.75 / 0.25 are inclusive (>= / <=).
    it("true exactly at the 0.75 / 0.25 boundaries (inclusive)", () => {
      expect(simProps.SparksAtTopAndBottom.evaluate(read(7500, 2500), {})).toBe(true);
    });
    it("false just inside the boundaries (0.74 / 0.26)", () => {
      expect(simProps.SparksAtTopAndBottom.evaluate(read(7400, 2600), {})).toBe(false);
    });

    // Minimum-span floor: 5% × 20000 = 1000 ft.
    it("false on flat / below-minimum-span terrain", () => {
      const flat = { min: 4000, max: 4400 }; // span 400 < 1000
      expect(simProps.SparksAtTopAndBottom.evaluate(
        read(4400, 4000, { elevationRange: flat }), {})).toBe(false);
    });
    it("false exactly at the minimum-span floor (span == 1000)", () => {
      const atFloor = { min: 0, max: 1000 }; // span 1000, at-or-below → false
      expect(simProps.SparksAtTopAndBottom.evaluate(
        read(1000, 0, { elevationRange: atFloor }), {})).toBe(false);
    });
    it("true just above the minimum-span floor with a real top/bottom", () => {
      const aboveFloor = { min: 0, max: 1001 }; // span 1001 > 1000
      expect(simProps.SparksAtTopAndBottom.evaluate(
        read(1001, 0, { elevationRange: aboveFloor }), {})).toBe(true);
    });

    // Fail-closed guards (OQ-3 A / R3).
    it("false when a spark elevation is undefined", () => {
      expect(simProps.SparksAtTopAndBottom.evaluate(
        mkRead({ sparks: [{ x: 0, y: 0, elevation: undefined }, { x: 1, y: 0, elevation: 500 }],
          elevationRange: range, heightmapMaxElevation: max }), {})).toBe(false);
    });
    it("false when elevationRange is undefined", () => {
      expect(simProps.SparksAtTopAndBottom.evaluate(
        mkRead({ sparks: sparksAt(9000, 500), heightmapMaxElevation: max }), {})).toBe(false);
    });
    it("false when heightmapMaxElevation is undefined", () => {
      expect(simProps.SparksAtTopAndBottom.evaluate(
        mkRead({ sparks: sparksAt(9000, 500), elevationRange: range }), {})).toBe(false);
    });
    it("false when spark count is not two", () => {
      expect(simProps.SparksAtTopAndBottom.evaluate(
        mkRead({ sparks: [{ x: 0, y: 0, elevation: 9000 }], elevationRange: range, heightmapMaxElevation: max }), {})).toBe(false);
      expect(simProps.SparksAtTopAndBottom.evaluate(
        mkRead({ sparks: [...sparksAt(9000, 500), { x: 2, y: 0, elevation: 100 }], elevationRange: range, heightmapMaxElevation: max }), {})).toBe(false);
    });
    // Defense-in-depth (Finding 1): a spark elevation outside [min, max] — e.g. the
    // artificial 0 of an excluded fillTerrainEdges cell, below range.min=0 here — is
    // rejected rather than normalized to a spurious top/bottom.
    it("false when a spark elevation is below the range minimum (excluded-edge zero)", () => {
      expect(simProps.SparksAtTopAndBottom.evaluate(
        mkRead({ sparks: sparksAt(9000, -50), elevationRange: range, heightmapMaxElevation: max }), {})).toBe(false);
    });
    it("false when a spark elevation is above the range maximum", () => {
      expect(simProps.SparksAtTopAndBottom.evaluate(
        mkRead({ sparks: sparksAt(10500, 500), elevationRange: range, heightmapMaxElevation: max }), {})).toBe(false);
    });
    it("false when a spark elevation is non-finite (NaN / Infinity)", () => {
      expect(simProps.SparksAtTopAndBottom.evaluate(
        mkRead({ sparks: sparksAt(NaN, 500), elevationRange: range, heightmapMaxElevation: max }), {})).toBe(false);
      // Infinity must fail closed too — the title claims it and a NaN-only guard
      // (e.g. Number.isNaN instead of !Number.isFinite) would otherwise slip past (R3).
      expect(simProps.SparksAtTopAndBottom.evaluate(
        mkRead({ sparks: sparksAt(Infinity, 500), elevationRange: range, heightmapMaxElevation: max }), {})).toBe(false);
    });
  });

  describe("CorrectZoneSetup", () => {
    // Per tab 23's sheet row (CorrectZoneSetup, dump-xlsx.js tab 23, R16):
    //   zone 1 = Foothills / Grass / No Drought
    //   zone 2 = Foothills / Grass / Mild Drought OR Medium Drought
    // Fixtures resolve enum members through the label maps — the same source of
    // truth the impl uses — so a src/types.ts relabeling does not false-alarm (CA-5).
    const correctZone1 = {
      terrainType: terrainLabels[TerrainType.Foothills],
      vegetation: vegetationLabels[Vegetation.Grass],
      droughtLevel: droughtLabels[DroughtLevel.NoDrought],
    };
    const correctZone2Mild = {
      terrainType: terrainLabels[TerrainType.Foothills],
      vegetation: vegetationLabels[Vegetation.Grass],
      droughtLevel: droughtLabels[DroughtLevel.MildDrought],
    };
    const correctZone2Medium = {
      ...correctZone2Mild, droughtLevel: droughtLabels[DroughtLevel.MediumDrought],
    };

    it("true for the sheet-defined correct setup (zone 2 = Mild Drought)", () => {
      const r = mkRead({ zones: [correctZone1, correctZone2Mild] });
      expect(simProps.CorrectZoneSetup.evaluate(r, {})).toBe(true);
    });
    it("true with zone 2 at Medium Drought (sheet allows Mild or Medium)", () => {
      const r = mkRead({ zones: [correctZone1, correctZone2Medium] });
      expect(simProps.CorrectZoneSetup.evaluate(r, {})).toBe(true);
    });
    it("false when a zone's drought level is wrong", () => {
      const wrongZone1 = { ...correctZone1, droughtLevel: droughtLabels[DroughtLevel.SevereDrought] };
      expect(simProps.CorrectZoneSetup.evaluate(mkRead({ zones: [wrongZone1, correctZone2Mild] }), {})).toBe(false);
    });
    it("false when not exactly two zones", () => {
      expect(simProps.CorrectZoneSetup.evaluate(mkRead({ zones: [correctZone1] }), {})).toBe(false);
      expect(simProps.CorrectZoneSetup.evaluate(mkRead({}), {})).toBe(false);
    });
  });

  describe("UniformZoneSettings", () => {
    it("true when all zones share vegetation and droughtLevel", () => {
      const r = mkRead({ zones: [
        { vegetation: "Grass", droughtLevel: "Mild Drought" },
        { vegetation: "Grass", droughtLevel: "Mild Drought" },
      ] });
      expect(simProps.UniformZoneSettings.evaluate(r, {})).toBe(true);
    });
    it("false when vegetation differs across zones", () => {
      const r = mkRead({ zones: [
        { vegetation: "Grass", droughtLevel: "Mild Drought" },
        { vegetation: "Forest", droughtLevel: "Mild Drought" },
      ] });
      expect(simProps.UniformZoneSettings.evaluate(r, {})).toBe(false);
    });
    it("false when droughtLevel differs across zones", () => {
      const r = mkRead({ zones: [
        { vegetation: "Grass", droughtLevel: "Mild Drought" },
        { vegetation: "Grass", droughtLevel: "Severe Drought" },
      ] });
      expect(simProps.UniformZoneSettings.evaluate(r, {})).toBe(false);
    });
    it("false when any zone field is undefined (fails closed)", () => {
      const r = mkRead({ zones: [
        { vegetation: "Grass", droughtLevel: undefined },
        { vegetation: "Grass", droughtLevel: undefined },
      ] });
      expect(simProps.UniformZoneSettings.evaluate(r, {})).toBe(false);
    });
    it("false with no zones", () => {
      expect(simProps.UniformZoneSettings.evaluate(mkRead({ zones: [] }), {})).toBe(false);
    });
  });

  describe("Fireline", () => {
    // Tab 45/47/54 sim-prop: a drawn fire line carries >= 2 fireLineMarkers in
    // the SimulationStarted snapshot. A sim-prop is evaluated against one
    // witness reading, so the test pins both ends of the >= 2 threshold.
    it("false when fireLineMarkers is undefined or empty", () => {
      expect(simProps.Fireline.evaluate(mkRead({}), {})).toBe(false);
      expect(simProps.Fireline.evaluate(mkRead({ fireLineMarkers: [] }), {})).toBe(false);
    });
    it("false with one marker (a half-placed line)", () => {
      expect(simProps.Fireline.evaluate(mkRead({ fireLineMarkers: [{ x: 0.1, y: 0.2 }] }), {})).toBe(false);
    });
    it("true with two or more markers", () => {
      const r = mkRead({ fireLineMarkers: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.2 }] });
      expect(simProps.Fireline.evaluate(r, {})).toBe(true);
    });
  });

  describe("DefaultVars", () => {
    // Per tab 45/47 sheet (DefaultVars, R13/R12): all adjustable variables at
    // default; wind matched with tolerance +/-2 magnitude, +/-20 deg angle.
    const defaultZones = [
      { vegetation: "Shrub", droughtLevel: "Mild Drought" },
      { vegetation: "Shrub", droughtLevel: "Mild Drought" },
    ];
    const defaults: WildfireDefaults = { zones: defaultZones, wind: { speed: 10, direction: 90 } };

    it("true when zones and wind are all at default", () => {
      const r = mkRead({ zones: defaultZones, wind: { speed: 10, direction: 90 } });
      expect(simProps.DefaultVars.evaluate(r, defaults)).toBe(true);
    });
    it("true at the wind-tolerance boundary (+2 magnitude, +20 deg)", () => {
      const r = mkRead({ zones: defaultZones, wind: { speed: 12, direction: 110 } });
      expect(simProps.DefaultVars.evaluate(r, defaults)).toBe(true);
    });
    it("false just outside the wind-magnitude tolerance (+3)", () => {
      const r = mkRead({ zones: defaultZones, wind: { speed: 13, direction: 90 } });
      expect(simProps.DefaultVars.evaluate(r, defaults)).toBe(false);
    });
    it("false just outside the wind-angle tolerance (+21 deg)", () => {
      const r = mkRead({ zones: defaultZones, wind: { speed: 10, direction: 111 } });
      expect(simProps.DefaultVars.evaluate(r, defaults)).toBe(false);
    });
    it("treats the angle delta circularly (350 vs 10 is 20 deg apart)", () => {
      const r = mkRead({ zones: defaultZones, wind: { speed: 10, direction: 350 } });
      const wrapDefaults: WildfireDefaults = { zones: defaultZones, wind: { speed: 10, direction: 10 } };
      expect(simProps.DefaultVars.evaluate(r, wrapDefaults)).toBe(true);
    });
    it("false when a zone variable differs from default", () => {
      const r = mkRead({
        zones: [{ vegetation: "Forest", droughtLevel: "Mild Drought" }, defaultZones[1]],
        wind: { speed: 10, direction: 90 },
      });
      expect(simProps.DefaultVars.evaluate(r, defaults)).toBe(false);
    });
    it("false on a zone-count mismatch (reading shorter than defaults)", () => {
      const r = mkRead({ zones: [defaultZones[0]], wind: { speed: 10, direction: 90 } });
      expect(simProps.DefaultVars.evaluate(r, defaults)).toBe(false);
    });
    it("false when defaults is absent", () => {
      const r = mkRead({ zones: defaultZones, wind: { speed: 10, direction: 90 } });
      expect(simProps.DefaultVars.evaluate(r, {})).toBe(false);
    });
  });

  describe("DefaultVegetations", () => {
    const defaultZones = [{ vegetation: "Grass" }, { vegetation: "Grass" }, { vegetation: "Grass" }];
    const defaults: WildfireDefaults = { zones: defaultZones };

    it("true when every zone's vegetation is at default", () => {
      const r = mkRead({ zones: [{ vegetation: "Grass" }, { vegetation: "Grass" }, { vegetation: "Grass" }] });
      expect(simProps.DefaultVegetations.evaluate(r, defaults)).toBe(true);
    });
    it("false when a zone's vegetation differs from default", () => {
      const r = mkRead({ zones: [{ vegetation: "Grass" }, { vegetation: "Forest" }, { vegetation: "Grass" }] });
      expect(simProps.DefaultVegetations.evaluate(r, defaults)).toBe(false);
    });
    it("false on a zone-count mismatch (reading shorter than defaults)", () => {
      expect(simProps.DefaultVegetations.evaluate(mkRead({ zones: [{ vegetation: "Grass" }] }), defaults)).toBe(false);
    });
    it("false when defaults is absent", () => {
      expect(simProps.DefaultVegetations.evaluate(mkRead({ zones: defaultZones }), {})).toBe(false);
    });
    it("false with no zones", () => {
      expect(simProps.DefaultVegetations.evaluate(mkRead({ zones: [] }), defaults)).toBe(false);
    });
  });

  describe("SevereDroughts", () => {
    const severe = droughtLabels[DroughtLevel.SevereDrought];
    it("true when every zone is at Severe Drought", () => {
      const r = mkRead({ zones: [{ droughtLevel: severe }, { droughtLevel: severe }, { droughtLevel: severe }] });
      expect(simProps.SevereDroughts.evaluate(r, {})).toBe(true);
    });
    it("false when a zone is below Severe Drought", () => {
      const r = mkRead({ zones: [{ droughtLevel: severe }, { droughtLevel: droughtLabels[DroughtLevel.MildDrought] }] });
      expect(simProps.SevereDroughts.evaluate(r, {})).toBe(false);
    });
    it("false with no zones", () => {
      expect(simProps.SevereDroughts.evaluate(mkRead({ zones: [] }), {})).toBe(false);
    });
  });

  describe("Helitack (stub)", () => {
    it("is flagged isStub: true and returns false", () => {
      expect(simProps.Helitack.isStub).toBe(true);
      expect(simProps.Helitack.evaluate(mkRead(), {})).toBe(false);
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
