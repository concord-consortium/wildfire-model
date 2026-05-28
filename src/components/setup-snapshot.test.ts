import { ISetupSnapshot, setupSnapshotDiffers } from "./setup-snapshot";
import { Zone } from "../models/zone";
import { TerrainType, Vegetation, DroughtLevel } from "../types";

const baseSnapshot = (): ISetupSnapshot => ({
  zonesCount: 2,
  zones: [
    { terrainType: TerrainType.Mountains, vegetation: Vegetation.Forest, droughtLevel: DroughtLevel.MediumDrought },
    { terrainType: TerrainType.Plains, vegetation: Vegetation.Grass, droughtLevel: DroughtLevel.MildDrought },
  ],
  windSpeed: 5,
  windDirection: 0,
});

const baseCurrent = () => ({
  zonesCount: 2,
  zones: [
    new Zone({ terrainType: TerrainType.Mountains, vegetation: Vegetation.Forest, droughtLevel: DroughtLevel.MediumDrought }),
    new Zone({ terrainType: TerrainType.Plains, vegetation: Vegetation.Grass, droughtLevel: DroughtLevel.MildDrought }),
  ],
  windSpeed: 5,
  windDirection: 0,
});

describe("setupSnapshotDiffers", () => {
  it("returns false when snapshots are identical", () => {
    expect(setupSnapshotDiffers(baseSnapshot(), baseCurrent())).toBe(false);
  });

  it("returns true when zonesCount changes", () => {
    const current = baseCurrent();
    current.zonesCount = 3;
    expect(setupSnapshotDiffers(baseSnapshot(), current)).toBe(true);
  });

  it("returns true when windSpeed changes", () => {
    const current = baseCurrent();
    current.windSpeed = 10;
    expect(setupSnapshotDiffers(baseSnapshot(), current)).toBe(true);
  });

  it("returns true when windDirection changes", () => {
    const current = baseCurrent();
    current.windDirection = 45;
    expect(setupSnapshotDiffers(baseSnapshot(), current)).toBe(true);
  });

  it("returns true when zone count (array length) changes", () => {
    const current = baseCurrent();
    current.zones = current.zones.slice(0, 1);
    expect(setupSnapshotDiffers(baseSnapshot(), current)).toBe(true);
  });

  it("returns true when a zone's terrainType changes", () => {
    const current = baseCurrent();
    current.zones[0].terrainType = TerrainType.Foothills;
    expect(setupSnapshotDiffers(baseSnapshot(), current)).toBe(true);
  });

  it("returns true when a zone's vegetation changes", () => {
    const current = baseCurrent();
    current.zones[0].vegetation = Vegetation.Shrub;
    expect(setupSnapshotDiffers(baseSnapshot(), current)).toBe(true);
  });

  it("returns true when a zone's droughtLevel changes", () => {
    const current = baseCurrent();
    current.zones[1].droughtLevel = DroughtLevel.SevereDrought;
    expect(setupSnapshotDiffers(baseSnapshot(), current)).toBe(true);
  });
});
