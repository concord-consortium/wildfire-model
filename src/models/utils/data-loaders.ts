import { TerrainType } from "../../types";
import { ISimulationConfig } from "../../config";
import { getInputData } from "./image-utils";
import { Zone } from "../zone";

// Maps zones config to image data files (see data dir). E.g. it can generate file names like:
// - data/plains-plains
// - data/plains-mountains
// etc.
const zonesToImageDataFile = (zones: Zone[]) => {
  const zoneTypes: string[] = [];
  zones.forEach((z, i) => {
    zoneTypes.push(TerrainType[z.terrainType].toLowerCase());
  });
  return "data/" + zoneTypes.join("-");
};

export const getZoneIndex = (config: ISimulationConfig): Promise<number[] | undefined> => {
  return getInputData(config.zoneIndex, config.gridWidth, config.gridHeight, false,
    (rgba: [number, number, number, number]) => {
      // Red is zone 1, green is zone 2, and blue is zone 3.
      if (rgba[0] >= rgba[1] && rgba[0] >= rgba[2]) {
        return 0;
      }
      if (rgba[1] >= rgba[0] && rgba[1] >= rgba[2]) {
        return 1;
      }
      return 2;
    }
  );
};

export const getElevationData = (config: ISimulationConfig, zones: Zone[]): Promise<number[] | undefined> => {
  // If `elevation` height map is provided, it will be loaded during model initialization.
  // Otherwise, height map URL will be derived from zones `terrainType` properties.
  let elevation = config.elevation;
  if (!elevation) {
    elevation = zonesToImageDataFile(zones) + "-heightmap.png";
  }
  return getInputData(elevation, config.gridWidth, config.gridHeight, true,
    (rgba: [number, number, number, number]) => {
      // Elevation data is supposed to black & white image, where black is the lowest point and
      // white is the highest.
      return rgba[0] / 255 * config.heightmapMaxElevation;
    }
  );
};

export const getUnburntIslandsData = (config: ISimulationConfig, zones: Zone[]): Promise<number[] | undefined> => {
  // Unburnt islands can be specified directly using unburntIslands property or they'll be generated automatically
  // using zones terrain type.
  let unburntIslands: number[][] | string | undefined = config.unburntIslands;
  if (!unburntIslands) {
    unburntIslands = zonesToImageDataFile(zones) + "-islands.png";
  }
  const islandActive: { [key: number]: number } = {};
  return getInputData(unburntIslands, config.gridWidth, config.gridHeight, true,
    (rgba: [number, number, number, number]) => {
      // White areas are regular cells. Islands use gray scale colors, every island is supposed to have different
      // shade. It's enough to look just at R value, as G and B will be equal.
      const r = rgba[0];
      if (r < 255) {
        if (islandActive[r] === undefined) {
          if (Math.random() < config.unburntIslandProbability) {
            islandActive[r] = 1;
          } else {
            islandActive[r] = 0;
          }
        }
        return islandActive[r]; // island activity, 0 or 1
      } else {
        return 0; // white color means we're dealing with regular cell, return 0 (inactive island)
      }
    }
  );
};

export const getRiverData = (config: ISimulationConfig): Promise<number[] | undefined> => {
  if (!config.riverData) {
    return Promise.resolve(undefined);
  }
  return getInputData(config.riverData, config.gridWidth, config.gridHeight, true,
    (rgba: [number, number, number, number]) => {
      // River texture is mostly transparent, so look for non-transparent cells to define shape
      return rgba[3] > 0 ? 1 : 0;
    }
  );
};
