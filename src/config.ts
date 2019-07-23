export interface ISimulationConfig {
  modelWidth: number; // km
  modelHeight: number; // km
  // Note that modelWidth % cellSize and modelHeight % cellSize should always be 0!
  cellSize: number; // km
  // Spark position, in km.
  spark: number[];
  timeStep: number;
  windSpeed: number; // mph
  windDirection: number; // degrees, 0 is northern wind
  neighborsDist: number;
  // Used for mapping of the fireSpreadRate to (model) time.
  fireSpreadTimeRatio: number;
}

export interface IUrlConfig extends ISimulationConfig {
  preset: string;
  view: "land" | "ignitionTime";
}

export const defaultConfig: IUrlConfig = {
  preset: "test1",
  modelWidth: 100,
  modelHeight: 100,
  cellSize: 1,
  spark: [50, 50],
  timeStep: 16,
  windSpeed: 0, // mph
  windDirection: 0, // radians, northern wind
  neighborsDist: 3,
  fireSpreadTimeRatio: 500,
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
