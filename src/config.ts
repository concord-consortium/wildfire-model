import { ZoneOptions } from "./models/zone";
import { DroughtLevel, Vegetation, TerrainType } from "./models/fire-model";

interface TownOptions {
  name: string;
  x: number; // [0, 1], position relative to model width
  y: number; // [0, 1], position relative to model height
  terrainType?: TerrainType; // limit town marker to given terrain type
}

export interface ISimulationConfig {
  modelWidth: number; // ft
  modelHeight: number; // ft
  // Note that modelHeight % gridWidth should always be 0!
  gridWidth: number; // ft
  // Spark positions, in ft.
  sparks: number[][];
  maxTimeStep: number; // minutes
  // One day in model should last X seconds in real world.
  modelDayInSeconds: number;
  windSpeed: number; // mph
  windDirection: number; // degrees, 0 is northern wind
  neighborsDist: number;
  // In min - note that larger cells will burn the same amount of time. Cell doesn't burn from edge to edge, but
  // its whole area is supposed to burn at the same time. We might consider whether it should be different for
  // different fuel types.
  minCellBurnTime: number;
  // Max elevation of 100% white points in heightmap (image used for elevation data).
  heightmapMaxElevation: number; // ft
  riverElevation: number; // ft
  // Number of zones that the model is using. Zones are used to keep properties of some area of the model.
  zonesCount: 2 | 3;
  zones: [ZoneOptions, ZoneOptions, ZoneOptions?];
  towns: TownOptions[];
  // Visually fills edges of the terrain by setting elevation to 0.
  fillTerrainEdges: boolean;
  riverData: string | null;
  windScaleFactor: number;
  showModelDimensions: boolean;
  // Time that needs to pass before next fire line can be added.
  fireLineDelay: number;
  maxFireLineLength: number; // ft
  // Renders burn index.
  showBurnIndex: boolean;
  // Displays alert with current coordinates on mouse click. Useful for authoring.
  showCoordsOnClick: boolean;
  // Number between 0 and 1 which decides how likely is for unburnt island to form (as it's random).
  // 1 means that all the unburnt islands will be visible, 0 means that none of them will be visible.
  unburntIslandProbability: number;
  // Locks drought index slider in Terrain Setup dialog.
  droughtIndexLocked: boolean;
  // Makes severe drought option available in Terrain Setup dialog.
  severeDroughtAvailable: boolean;
}

export interface IUrlConfig extends ISimulationConfig {
  preset: string;
}

export const defaultConfig: IUrlConfig = {
  preset: "defaultTwoZone",
  // Most of the presets will use heightmap images that work the best with 120000x80000ft dimensions.
  modelWidth: 120000,
  modelHeight: 80000,
  // 240 works well with presets based on heightmap images.
  gridWidth: 240,
  sparks: [],
  maxTimeStep: 180, // minutes
  modelDayInSeconds: 8, // one day in model should last X seconds in real world
  windSpeed: 0, // mph
  windDirection: 0, // degrees, northern wind
  // Note that 0.5 helps to create a nicer, more round shape of neighbours set for a given cell
  // on the rectangular grid when small radius values are used (like 2.5).
  // 2.5 seems to be first value that ensures that fire front looks pretty round.
  // Higher values will make this shape better, but performance will be affected.
  neighborsDist: 2.5,
  minCellBurnTime: 200, // minutes
  // This value works well with existing heightmap images.
  heightmapMaxElevation: 20000,
  riverElevation: 0,
  zonesCount: 2,
  zones: [
    {
      terrainType: TerrainType.Plains,
      vegetation: Vegetation.Grass,
      droughtLevel: DroughtLevel.MildDrought
    },
    {
      terrainType: TerrainType.Plains,
      vegetation: Vegetation.Shrub,
      droughtLevel: DroughtLevel.MediumDrought
    },
    {
      terrainType: TerrainType.Plains,
      vegetation: Vegetation.ForestSmallLitter,
      droughtLevel: DroughtLevel.SevereDrought
    }
  ],
  towns: [],
  fillTerrainEdges: true,
  riverData: "data/river-texmap.png",
  windScaleFactor: 0.2, // Note that model is very sensitive to wind.
  // Scale wind values down for now, so changes are less dramatic.
  showModelDimensions: false,
  fireLineDelay: 1440, // a day
  maxFireLineLength: 15000, // ft
  showBurnIndex: false,
  showCoordsOnClick: false,
  unburntIslandProbability: 0.5, // [0, 1]
  droughtIndexLocked: false,
  severeDroughtAvailable: false
};

export const urlConfig: any = {};

const getURLParam = (name: string) => {
  const url = (self || window).location.href;
  name = name.replace(/[[]]/g, "\\$&");
  const regex = new RegExp(`[?&]${name}(=([^&#]*)|&|#|$)`);
  const results = regex.exec(url);
  if (!results) return null;
  if (!results[2]) return true;
  return decodeURIComponent(results[2].replace(/\+/g, " "));
};

const isArray = (value: any) => {
  return typeof value === "string" && value.match(/^\[.*\]$/);
};

const isJSON = (value: any) => {
  if (typeof value !== "string") {
    return false;
  }
  try {
    JSON.parse(value);
    return true;
  } catch (e) {
    return false;
  }
};

// Populate `urlConfig` with values read from URL.
Object.keys(defaultConfig).forEach((key) => {
  const urlValue: any = getURLParam(key);
  if (urlValue === true || urlValue === "true") {
    urlConfig[key] = true;
  } else if (urlValue === "false") {
    urlConfig[key] = false;
  } else if (isJSON(urlValue)) {
    urlConfig[key] = JSON.parse(urlValue);
  } else if (isArray(urlValue)) {
    // Array can be provided in URL using following format:
    // &parameter=[value1,value2,value3]
    if (urlValue === "[]") {
      urlConfig[key] = [];
    } else {
      urlConfig[key] = urlValue!.substring(1, urlValue!.length - 1).split(",");
    }
  } else if (urlValue !== null && !isNaN(urlValue)) {
    // !isNaN(string) means isNumber(string).
    urlConfig[key] = parseFloat(urlValue);
  } else if (urlValue !== null) {
    urlConfig[key] = urlValue;
  }
});

export const urlConfigWithDefaultValues: IUrlConfig = Object.assign({}, defaultConfig, urlConfig);
