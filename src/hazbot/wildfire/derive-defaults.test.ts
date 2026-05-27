import { getDefaultConfig } from "../../config";
import presets from "../../presets";
import { TerrainType, Vegetation, DroughtLevel } from "../../types";
import { deriveWildfireDefaults } from "./derive-defaults";

// Inputs are built directly as config objects (getDefaultConfig() + spread) —
// not routed through getResolvedConfig() — so deriveWildfireDefaults and
// getResolvedConfig stay independently covered (getResolvedConfig has its own
// coverage in src/config.test.ts).
const cfg = (over: Partial<ReturnType<typeof getDefaultConfig>>) =>
  ({ ...getDefaultConfig(), ...over });

describe("deriveWildfireDefaults", () => {
  it("derives one label-string default per populated zone — 2-zone config", () => {
    const d = deriveWildfireDefaults(cfg({
      zones: [
        { terrainType: TerrainType.Plains, vegetation: Vegetation.Shrub, droughtLevel: DroughtLevel.MildDrought },
        { terrainType: TerrainType.Plains, vegetation: Vegetation.Shrub, droughtLevel: DroughtLevel.MildDrought },
      ],
      windSpeed: 0,
      windDirection: 0,
    }));
    expect(d.zones).toEqual([
      { terrainType: "Plains", vegetation: "Shrub", droughtLevel: "Mild Drought" },
      { terrainType: "Plains", vegetation: "Shrub", droughtLevel: "Mild Drought" },
    ]);
    expect(d.wind).toEqual({ speed: 0, direction: 0 });
  });

  it("derives three zones for a 3-zone config, converting each enum to its label", () => {
    const d = deriveWildfireDefaults(cfg({
      zones: [
        { terrainType: TerrainType.Mountains, vegetation: Vegetation.Forest, droughtLevel: DroughtLevel.NoDrought },
        { terrainType: TerrainType.Foothills, vegetation: Vegetation.Shrub, droughtLevel: DroughtLevel.MediumDrought },
        { terrainType: TerrainType.Plains, vegetation: Vegetation.Grass, droughtLevel: DroughtLevel.SevereDrought },
      ],
    }));
    expect(d.zones).toEqual([
      { terrainType: "Mountains", vegetation: "Forest", droughtLevel: "No Drought" },
      { terrainType: "Foothills", vegetation: "Shrub", droughtLevel: "Medium Drought" },
      { terrainType: "Plains", vegetation: "Grass", droughtLevel: "Severe Drought" },
    ]);
  });

  it("emits one default per populated zones-tuple entry, skipping an undefined 3rd slot", () => {
    const d = deriveWildfireDefaults(cfg({
      zones: [
        { terrainType: TerrainType.Plains, vegetation: Vegetation.Grass, droughtLevel: DroughtLevel.MildDrought },
        { terrainType: TerrainType.Plains, vegetation: Vegetation.Grass, droughtLevel: DroughtLevel.MildDrought },
        undefined,
      ],
    }));
    expect(d.zones).toHaveLength(2);
  });

  it("derives wind defaults from config.windSpeed / config.windDirection", () => {
    const d = deriveWildfireDefaults(cfg({ windSpeed: 12, windDirection: 270 }));
    expect(d.wind).toEqual({ speed: 12, direction: 270 });
  });

  // Preset-data regression guard (QA5) — not a distinct derivation branch.
  // Derives straight from a real fixed-terrain preset; `cfg()` spreads the preset
  // partial onto the base config (no getResolvedConfig()). deriveWildfireDefaults
  // reads only zone/wind fields and never inspects `elevation`, so this pins that
  // the preset's zone tuple still derives the expected labels (the fixed-terrain
  // presets back rule-sets 25 / 32 / 34).
  it("derives the expected labels from the mountainTwoZoneFixedTerrain preset", () => {
    const d = deriveWildfireDefaults(cfg(presets.mountainTwoZoneFixedTerrain));
    expect(d.zones).toEqual([
      { terrainType: "Mountains", vegetation: "Shrub", droughtLevel: "Mild Drought" },
      { terrainType: "Mountains", vegetation: "Shrub", droughtLevel: "Mild Drought" },
    ]);
  });
});
