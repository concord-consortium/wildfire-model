function getURLParam(name: string) {
  const url = (self || window).location.href;
  name = name.replace(/[[]]/g, "\\$&");
  const regex = new RegExp(`[?&]${name}(=([^&#]*)|&|#|$)`);
  const results = regex.exec(url);
  if (!results) return null;
  if (!results[2]) return true;
  return decodeURIComponent(results[2].replace(/\+/g, " "));
}

const DEFAULT_CONFIG = {
  modelWidth: 100, // km
  modelHeight: 100, // km
  spark: [50, 50], // [km, km]
  gridCellSize: 1, // note that modelWidth % gridCellSize and modelHeight % gridCellSize should always be 0!
  wind: 88
};

const urlConfig: any = {};

function isArray(value: any) {
  return typeof value === "string" && value.match(/^\[.*\]$/);
}

Object.keys(DEFAULT_CONFIG).forEach((key) => {
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

const finalConfig = Object.assign({}, DEFAULT_CONFIG, urlConfig);
export default finalConfig;
