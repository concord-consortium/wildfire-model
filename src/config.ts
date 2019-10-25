export interface ISimulationConfig {
  // Number of zones that the model is using. Zones are used to keep properties of some area of the model.
  zonesCount: 2 | 3;
  modelWidth: number; // ft
  modelHeight: number; // ft
  // Note that modelHeight % gridWidth should always be 0!
  gridWidth: number; // ft
  // Spark positions, in ft.
  sparks: number[][];
  timeStep: number; // minutes
  windSpeed: number; // mph
  windDirection: number; // degrees, 0 is northern wind
  moistureContent: number;
  neighborsDist: number;
  // In min - note that larger cells will burn the same amount of time. Cell doesn't burn from edge to edge, but
  // its whole area is supposed to burn at the same time. We might consider whether it should be different for
  // different fuel types.
  cellBurnTime: number;
  // Max elevation of 100% white points in heightmap (image used for elevation data).
  heightmapMaxElevation: number; // ft
}

export interface IUrlConfig extends ISimulationConfig {
  preset: string;
  view: "land" | "ignitionTime";
}

export const defaultConfig: IUrlConfig = {
  preset: "test1",
  zonesCount: 2,
  modelWidth: 100000,
  modelHeight: 100000,
  gridWidth: 100,
  sparks: [ [50000, 50000] ],
  timeStep: 60, // minutes
  windSpeed: 0, // mph
  windDirection: 0, // degrees, northern wind
  moistureContent: 0.1,
  neighborsDist: 3,
  cellBurnTime: 2000, // minutes
  heightmapMaxElevation: 3000,
  view: "land"
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

// Populate `urlConfig` with values read from URL.
Object.keys(defaultConfig).forEach((key) => {
  const urlValue: any = getURLParam(key);
  if (urlValue === true || urlValue === "true") {
    urlConfig[key] = true;
  } else if (urlValue === "false") {
    urlConfig[key] = false;
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
