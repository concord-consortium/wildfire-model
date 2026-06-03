import { SimulationModel } from "./simulation";
import { UIModel } from "./ui";
import { DroughtLevel, TerrainType, Vegetation } from "../types";
import { ChartStore } from "./chart-store";
import { log } from "../log";

export interface IStores {
  simulation: SimulationModel;
  ui: UIModel;
  chartStore: ChartStore;
}

export const createStores = (): IStores => {
  // Export some variables and types to window. This lets authors open browser console and load preset manually like:
  // sim.load({
  //   modelWidth: 120000,
  //   modelHeight: 80000,
  //   gridWidth: 240,
  //   heightmapMaxElevation: 20000,
  //   zones: [
  //     { terrainType: TerrainType.Foothills, vegetation: Vegetation.Shrub, droughtLevel: 1 },
  //     { terrainType: TerrainType.Foothills, vegetation: Vegetation.Shrub, droughtLevel: 1 },
  //   ],
  //   zoneIndex: [
  //     [ 0, 1 ]
  //   ]
  // })
  const simulation = new SimulationModel();
  (window as any).sim = simulation;
  (window as any).DroughtLevel = DroughtLevel;
  (window as any).Vegetation = Vegetation;
  (window as any).TerrainType = TerrainType;
  (window as any).test = createTestHelpers(simulation);
  return {
    simulation,
    ui: new UIModel(),
    chartStore: new ChartStore()
  };
};

// Test helpers exposed on window.test so Playwright / browser-console tests can place sparks,
// fire-line endpoints, and helitack drops by zone index without simulating canvas raycasts.
const createTestHelpers = (simulation: SimulationModel) => {
  const zoneBounds = (zoneIdx: number) => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, count = 0;
    for (const cell of simulation.cells) {
      if (cell.zoneIdx !== zoneIdx) continue;
      if (cell.x < minX) minX = cell.x;
      if (cell.x > maxX) maxX = cell.x;
      if (cell.y < minY) minY = cell.y;
      if (cell.y > maxY) maxY = cell.y;
      count++;
    }
    if (count === 0) return null;
    const cs = simulation.config.cellSize;
    return {
      minX: minX * cs, maxX: maxX * cs,
      minY: minY * cs, maxY: maxY * cs,
      centerX: ((minX + maxX) / 2) * cs,
      centerY: ((minY + maxY) / 2) * cs
    };
  };
  return {
    placeSparkInZone(zoneIdx: number) {
      const b = zoneBounds(zoneIdx);
      if (!b) throw new Error(`No cells found for zoneIdx=${zoneIdx}`);
      simulation.addSpark(b.centerX, b.centerY);
    },
    placeFireLineInZone(zoneIdx: number) {
      const b = zoneBounds(zoneIdx);
      if (!b) throw new Error(`No cells found for zoneIdx=${zoneIdx}`);
      const span = b.maxX - b.minX;
      simulation.addFireLineMarker(b.minX + span * 0.25, b.centerY);
      simulation.addFireLineMarker(b.minX + span * 0.75, b.centerY);
    },
    placeHelitackInZone(zoneIdx: number) {
      const b = zoneBounds(zoneIdx);
      if (!b) throw new Error(`No cells found for zoneIdx=${zoneIdx}`);
      simulation.setHelitackPoint(b.centerX, b.centerY);
      // Emit the production Helitack log payload (matching the pointer path in
      // use-helitack-interaction.ts) so the Hazbot engine sees the drop. Unlike
      // sparks / fire lines (captured from the SimulationStarted snapshot), helitack
      // detection is event-based, so mutating the sim alone is not engine-visible.
      const cell = simulation.cellAt(b.centerX, b.centerY);
      log("Helitack", {
        x: b.centerX / simulation.config.modelWidth,
        y: b.centerY / simulation.config.modelHeight,
        elevation: cell.elevation,
      });
    },
    zoneBounds
  };
};
