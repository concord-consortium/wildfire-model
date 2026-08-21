import { ZoneOptions } from "./models/zone";
import presets from "./presets";
import { DroughtLevel, Vegetation, TerrainType } from "./types";

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
  // It will be calculated automatically using model dimensions and grid width.
  readonly gridHeight: number; // ft
  // It will be calculated automatically using model dimensions and grid width.
  readonly cellSize: number; // ft
  // If `elevation` height map is provided, it will be loaded during model initialization and terrain setup dialog
  // won't let users change terrain type. Otherwise, height map URL will be derived from zones `terrainType` properties.
  elevation?: number[][] | string;
  // `unburntIslands` data can provided using image url or 2D array.
  // Otherwise, unburnt islands map URL will be derived from zones `terrainType` properties.
  unburntIslands?: number[][] | string;
  // `zoneIndex` data can provided using image url or 2D array. If it's an array, it should include two or three
  // numbers, depending if model is using two or three zones (0 and 1, or 0, 1, and 2).
  zoneIndex?: number[][] | string;
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
  // Concentric-band outer radii (in cells, ascending) for the multi-scale
  // Topographic Position Index the Hazbot SparksAtTopAndBottom predicate uses to
  // localize whether a spark sits in a valley or on a ridge/peak. The array
  // length is N (the number of bands): band i covers cell distances in
  // (tpiBands[i-1], tpiBands[i]], band 0 covers (0, tpiBands[0]]. Larger radii
  // capture coarser landforms. See SimulationModel.tpiForSpark.
  tpiBands: number[];
  // Fraction of heightmapMaxElevation a spark's mean TPI must clear to be counted
  // as top/bottom by the Hazbot SparksAtTopAndBottom predicate (default 0.02 →
  // 400 ft at the default max). URL/preset-tunable; rides the SimulationStarted
  // config snapshot so the predicate can read it. See sim-props.ts.
  tpiMarginFraction: number;
  // Developer/researcher debug overlay: when true, tints each placed spark's TPI
  // bands onto the terrain (warm = ridge / positive TPI, cool = valley / negative,
  // white ~ flat). Enable via ?tpiDebug=true. No effect on logging or rule logic.
  tpiDebug: boolean;
  // Number of zones that the model is using. Zones are used to keep properties of some area of the model.
  zonesCount?: 2 | 3;
  zones: [ZoneOptions, ZoneOptions, ZoneOptions?];
  towns: TownOptions[];
  // Visually fills edges of the terrain by setting elevation to 0.
  fillTerrainEdges: boolean;
  riverData: string | null;
  windScaleFactor: number;
  showModelDimensions: boolean;
  // Time that needs to pass before next fire line can be added.
  fireLineDelay: number;
  // Helitack has a cooldown before it can be used again
  helitackDelay: number;
  maxFireLineLength: number; // ft
  helitackDropRadius: number; // ft
  // Renders burn index.
  showBurnIndex: boolean;
  // EXPLORATORY. Renders the terrain with vegetation/char textures instead of flat
  // per-cell colors. Off by default: when false the terrain renders through the
  // original vertex-color path, unchanged. Enable via ?texturedTerrain=true.
  // Tiles are the grayscale SVGs in src/public/terrain-textures/ — see
  // terrain-textures.ts for the authoring contract.
  texturedTerrain: boolean;
  // Ground distance one texture tile covers, in ft. Only used when
  // `texturedTerrain` is on.
  //
  // Counter-intuitively this must be LARGE. The default view shows ~120 ft per
  // screen pixel, so a tile set to a few thousand feet puts its detail below the
  // pixel grid, mipmapping averages it back to the tile's mean, and — since the
  // mean is the neutral 128 by contract — the texture disappears entirely. The
  // tiles are abstract map symbols, and a symbol needs ~15-30px on screen to be
  // recognizable, which is 1800-3600 ft of ground. That is what this value
  // controls. Smaller also means a shorter repeat period, so the tiling becomes
  // more noticeable, not less.
  terrainTextureTileFt: number;
  // Target contrast ratio between a glyph and the terrain color it sits on, using
  // the WCAG relative-luminance form. The glyph ink is derived per-fragment from
  // the terrain color — same hue and saturation, darkened until it hits this
  // ratio — so every drought level gets glyphs in its own color family that are
  // still guaranteed to read.
  //
  // IMPORTANT: this ratio is applied to the MATERIAL color, and is not what
  // reaches the eye. The hemisphere light scales the whole scene down by roughly
  // 0.19-0.35x depending on terrain slope, and contrast ratio is not preserved
  // under scaling — the +0.05 term means uniform dimming compresses the ratio. So
  // a material ratio of 6 lands nearer 2.5:1 on screen. WCAG 1.4.11 asks 3:1 for
  // graphical objects that carry meaning, which these glyphs do; on the darkest
  // (no-drought) zone that is not reachable by darkening at all, since even pure
  // black glyphs top out around 2.8:1 against that zone's lit color. Closing the
  // rest of the gap needs a lighter base color or more light in the scene.
  terrainGlyphContrast: [number, number, number, number];
  // Same, for burnt ground. Separate because burnt is not a drought level and its
  // ink lightens rather than darkens, so it lands on screen quite differently.
  terrainGlyphContrastBurnt: number;
  // How far tile values ABOVE neutral lift the terrain color toward white, 0..1.
  // Only affects highlights within a tile; glyph legibility is governed by
  // terrainGlyphContrast, not this.
  terrainTextureHighlight: number;
  // Frequency of the noise the burn edge is thresholded against. Higher values
  // give a finer, more crenulated fire perimeter.
  terrainBurnEdgeNoiseScale: number;
  // Half-width of the burn edge transition. Near 0 gives a hard, ragged edge;
  // larger values fade back toward the original soft gradient.
  terrainBurnEdgeSoftness: number;
  // Strength of the large-scale procedural luminance variation laid over the
  // tiles, 0..1. This exists to break up naturalistic texture; with the current
  // abstract map symbols it mostly just makes the field look blotchy, so it is
  // kept low. Raise it if the tiles are ever replaced with organic artwork.
  terrainTextureMacroAmount: number;
  // Range of "upness" (the surface normal's up component, 1 = flat, 0 = vertical)
  // over which the texture fades in: [fully faded, fully textured]. Exists because
  // the tile UV is a top-down planar projection, which smears badly on the near
  // vertical skirt fillTerrainEdges puts around the model. Raise the upper bound
  // to also strip texture off steep mountain faces, lower it to keep more.
  terrainTextureSlopeFade: [number, number];
  // Renders dashed lines along the boundaries between zones.
  showZoneLines: boolean;
  // Displays alert with current coordinates on mouse click. Useful for authoring.
  showCoordsOnClick: boolean;
  // Number between 0 and 1 which decides how likely is for unburnt island to form (as it's random).
  // 1 means that all the unburnt islands will be visible, 0 means that none of them will be visible.
  unburntIslandProbability: number;
  // Number between 0 and 1 which decides how likely is for a cells to survive fire. Note that there are other factors
  // too. The only vegetation that can survive fire low and medium intensity fire is `Forest`.
  fireSurvivalProbability: number;
  // Locks drought index slider in Terrain Setup dialog.
  droughtIndexLocked: boolean;
  // Makes severe drought option available in Terrain Setup dialog.
  severeDroughtAvailable: boolean;
  // River color, RGBA values (range: [0, 1]). Suggested colors:
  // [0.663,0.855,1,1], [0.337,0.69,0.957,1] or [0.067,0.529,0.882,1]
  riverColor: [number, number, number, number];
  // Authors may want to disable the fireline and helitack features completely
  fireLineAvailable: boolean;
  helitackAvailable: boolean;
  forestWithSuppressionAvailable: boolean;
  // If set to a number, the wind direction and strength will change during the model run.
  changeWindOnDay: number | undefined;
  // Works together with `changeWindOnDay`. Sets the new wind direction (0 to 360). If undefined, it'll be random.
  newWindDirection: number | undefined;
  // Works together with `changeWindOnDay`. Sets the new wind speed (mph). If undefined, it'll be random.
  newWindSpeed: number | undefined;
  // Developer/researcher tool: when true, renders a LogMonitor sidebar for real-time event inspection.
  logMonitor: boolean;
  // Hazbot analysis engine flags (per WM-10).
  // hazbotRules: selects the analysis-engine rule set (e.g. ?hazbotRules=23). Used in
  // the production app once the student-facing UI lands; undefined when the flag is unset.
  // Typed as `string | number` because the URL parser auto-converts numeric strings
  // (most current rule-set ids are integers); the bridge coerces to string.
  // hazbotSidebar: developer/researcher tool — mounts the substrate's debug sidebar.
  hazbotRules?: string | number;
  hazbotSidebar: boolean;
  // Developer/designer tool: when true, overlays a 1px red line across the
  // viewport at the bottom-bar icon-label baseline (Setup / Spark / etc.).
  // Useful for verifying alignment of new bottom-bar elements against the
  // label baseline. Enable via ?bottomBarBaseline=true.
  bottomBarBaseline: boolean;
  // Developer/designer tool: when true, overlays two 1px red lines across
  // the viewport at the top and bottom of the zone-button label block.
  // Useful for aligning the vegetation/drought icons against the
  // "Zone N" / terrain-name text. Enable via ?topLines=true.
  topLines: boolean;
  // Developer/designer tool: when true, renders a small readout in the top
  // bar showing live camera position, target, and FOV — plus a copy button
  // that yields ready-to-paste source lines for view-3d.tsx. Lets the
  // designer/PI orbit the model in-browser and report back the values they
  // want. Enable via ?cameraSettings=true.
  cameraSettings: boolean;
}

export interface IUrlConfig extends ISimulationConfig {
  preset: string;
}

export const getDefaultConfig: () => IUrlConfig = () => ({
  preset: "default",
  // Most of the presets will use heightmap images that work the best with 120000x80000ft dimensions.
  modelWidth: 120000,
  modelHeight: 80000,
  // 240 works well with presets based on heightmap images.
  gridWidth: 240,
  get cellSize() { return this.modelWidth / this.gridWidth; },
  get gridHeight() { return Math.ceil(this.modelHeight / this.cellSize); },
  elevation: undefined, // will be derived from zone properties
  unburntIslands: undefined, // will be derived from zone properties
  zoneIndex: undefined,
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
  // Three concentric bands (0-3, 3-8, 8-15 cells) for the multi-scale TPI used by
  // the Hazbot SparksAtTopAndBottom predicate. Configurable per preset / URL.
  tpiBands: [3, 8, 15],
  // TPI decision margin as a fraction of heightmapMaxElevation (0.02 → 400 ft at
  // the default max). Tuned empirically; ?tpiMarginFraction= to override.
  tpiMarginFraction: 0.02,
  // Off by default; ?tpiDebug=true paints the TPI bands onto the terrain.
  tpiDebug: false,
  // undefined zones count will make them configurable in Terrain Setup dialog.
  zonesCount: undefined,
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
      vegetation: Vegetation.Forest,
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
  helitackDelay: 240, // four hours
  maxFireLineLength: 15000, // ft
  helitackDropRadius: 2640, // ft (5280 ft = 1 mile)
  showBurnIndex: true,
  texturedTerrain: false,
  terrainTextureTileFt: 18000, // ft — 6.7 repeats across the default 120,000 ft model
  // Per drought level: [none, mild, medium, severe]. Severe is bumped because its
  // tan field measures ~2.27:1 on screen at 6, below the ~2.4-2.5:1 the others
  // reach. Keep severe under ~8.6: past that, darkening cannot reach the ratio at
  // all against that field (pure black tops out there) and wfInk clamps to black,
  // which throws away the same-color-family look for no extra contrast.
  terrainGlyphContrast: [6, 6, 6, 7],
  terrainGlyphContrastBurnt: 6,
  terrainTextureHighlight: 0.18, // [0, 1]
  terrainBurnEdgeNoiseScale: 260,
  terrainBurnEdgeSoftness: 0.06,
  terrainTextureMacroAmount: 0.07, // [0, 1]
  terrainTextureSlopeFade: [0.15, 0.5],
  showZoneLines: false,
  showCoordsOnClick: false,
  unburntIslandProbability: 0.5, // [0, 1]
  fireSurvivalProbability: 0.1, // [0, 1]
  droughtIndexLocked: false,
  severeDroughtAvailable: true,
  riverColor: [0.067, 0.529, 0.882, 1],
  fireLineAvailable: true,
  helitackAvailable: true,
  forestWithSuppressionAvailable: true,
  changeWindOnDay: undefined,
  newWindDirection: undefined,
  newWindSpeed: undefined,
  logMonitor: false,
  hazbotRules: undefined,
  hazbotSidebar: false,
  bottomBarBaseline: false,
  topLines: false,
  cameraSettings: false
});

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

export const getUrlConfig: () => IUrlConfig = () => {
  const urlConfig: any = {};
  // Populate `urlConfig` with values read from URL.
  Object.keys(getDefaultConfig()).forEach((key) => {
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
        urlConfig[key] = urlValue.substring(1, urlValue.length - 1).split(",");
      }
    } else if (urlValue !== null && !isNaN(urlValue)) {
      // !isNaN(string) means isNumber(string).
      urlConfig[key] = parseFloat(urlValue);
    } else if (urlValue !== null) {
      urlConfig[key] = urlValue;
    }
  });
  return urlConfig as IUrlConfig;
};

// Resolves the full simulation config the model actually loads: the shallow
// merge Object.assign(getDefaultConfig(), preset, getUrlConfig()) — base
// defaults, overlaid with the selected preset, overlaid with URL-param
// overrides. The preset is resolved from the URL as
// presets[getUrlConfig().preset || getDefaultConfig().preset].
//
// `explicitPreset`, when supplied, substitutes ONLY the preset slot of the
// merge (callers that inject a config — e.g. the SimulationModel constructions
// in simulation.test.ts). The base and URL layers are always applied; there is
// no "compose two arbitrary partials" mode. The merge is intentionally shallow:
// each top-level key (including the `zones` tuple) is taken wholesale from the
// highest-priority source that defines it.
export const getResolvedConfig: (explicitPreset?: Partial<ISimulationConfig>) => IUrlConfig =
  (explicitPreset) => {
    const base = getDefaultConfig();
    const urlConfig = getUrlConfig();
    const preset = explicitPreset
      ?? presets[urlConfig.preset || base.preset];
    return Object.assign(base, preset, urlConfig);
  };

