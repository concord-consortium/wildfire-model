import { TerrainType, terrainDisplayLabels, terrainLabels } from "./types";

describe("terrain labels", () => {
  // terrainLabels values are logged and compared against by the Hazbot matcher,
  // so they must not follow the rendered text. terrainDisplayLabels is what the
  // UI reads, and only Foothills differs between the two.
  it("logs and matches Foothills while rendering it as Hills", () => {
    expect(terrainLabels[TerrainType.Foothills]).toBe("Foothills");
    expect(terrainDisplayLabels[TerrainType.Foothills]).toBe("Hills");
  });

  it("leaves every other terrain type identical in both maps", () => {
    expect(terrainDisplayLabels[TerrainType.Plains]).toBe(terrainLabels[TerrainType.Plains]);
    expect(terrainDisplayLabels[TerrainType.Mountains]).toBe(terrainLabels[TerrainType.Mountains]);
  });
});
