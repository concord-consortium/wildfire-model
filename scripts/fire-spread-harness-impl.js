// @ts-check
// Headless driver for the real fire engine, written for WM-41.
//
// It builds the same Cell grid `SimulationModel.populateCellsData` builds, from the
// same terrain PNGs the app fetches, and steps the same `FireEngine`. Nothing here
// reimplements the model: the spread rates, burn indices and stopping rule all come
// from `src/models`. What it adds is a seeded `Math.random`, so a run is replayable
// by seed number, and enough throughput to sweep tens of runs, neither of which the
// browser gives you.
//
// See `specs/WM-41-fire-doesnt-cross-zones/requirements.md` for what was measured
// with it and why. The CLI is `scripts/fire-spread-harness.js`.

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const REPO_ROOT = path.join(__dirname, "..");
const PUBLIC_DIR = path.join(REPO_ROOT, "src", "public");

// ---------------------------------------------------------------------------
// PNG decoding
//
// The browser gets pixels from a canvas; node has no decoder and this repo has no
// image dependency, so decode the four terrain PNGs here. They are all 8-bit,
// non-interlaced, color type 2 (RGB) or 6 (RGBA), which is the subset supported.
// ---------------------------------------------------------------------------

const CHANNELS_FOR_COLOR_TYPE = { 0: 1, 2: 3, 4: 2, 6: 4 };

const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
};

// Undoes the per-scanline filter each PNG row carries in its leading byte.
const unfilter = (raw, width, height, bpp) => {
  const stride = width * bpp;
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    const prev = dst - stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i];
      const a = i >= bpp ? out[dst + i - bpp] : 0;
      const b = y > 0 ? out[prev + i] : 0;
      const c = y > 0 && i >= bpp ? out[prev + i - bpp] : 0;
      let value;
      switch (filter) {
        case 0: value = x; break;
        case 1: value = x + a; break;
        case 2: value = x + b; break;
        case 3: value = x + ((a + b) >> 1); break;
        case 4: value = x + paeth(a, b, c); break;
        default: throw new Error(`unsupported PNG filter ${filter} on row ${y}`);
      }
      out[dst + i] = value & 0xff;
    }
  }
  return out;
};

/** Decodes an 8-bit non-interlaced PNG to `{ width, height, channels, data }`. */
const decodePng = (filePath) => {
  const buf = fs.readFileSync(filePath);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`not a PNG: ${filePath}`);
  let offset = 8;
  let header = null;
  const idat = [];
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const body = buf.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      header = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        bitDepth: body[8],
        colorType: body[9],
        interlace: body[12],
      };
    } else if (type === "IDAT") {
      idat.push(body);
    } else if (type === "IEND") {
      break;
    }
    offset += length + 12; // length + type + data + CRC
  }
  if (!header) throw new Error(`no IHDR in ${filePath}`);
  const channels = CHANNELS_FOR_COLOR_TYPE[header.colorType];
  if (header.bitDepth !== 8 || header.interlace !== 0 || !channels) {
    throw new Error(
      `unsupported PNG in ${filePath}: bitDepth ${header.bitDepth}, ` +
      `colorType ${header.colorType}, interlace ${header.interlace}`
    );
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const data = unfilter(raw, header.width, header.height, channels);
  return { width: header.width, height: header.height, channels, data };
};

/**
 * One channel of a decoded PNG as rows, top row first, which is the order
 * `getImageData` hands to `populateGrid` in the browser.
 */
const channelRows = (png, channel) => {
  const rows = [];
  for (let y = 0; y < png.height; y++) {
    const row = new Array(png.width);
    const base = y * png.width * png.channels;
    for (let x = 0; x < png.width; x++) row[x] = png.data[base + x * png.channels + channel];
    rows.push(row);
  }
  return rows;
};

// ---------------------------------------------------------------------------
// Seeded randomness
// ---------------------------------------------------------------------------

/** mulberry32, so a run is identified by an integer rather than by luck. */
const mulberry32 = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Runs `fn` with `Math.random` replaced, restoring it even if `fn` throws. */
const withSeededRandom = (rand, fn) => {
  const real = Math.random;
  Math.random = rand;
  try {
    return fn();
  } finally {
    Math.random = real;
  }
};

// ---------------------------------------------------------------------------
// Terrain, built the way populateCellsData builds it
// ---------------------------------------------------------------------------

// Loaded lazily so that requiring this module does not pull in the TypeScript
// sources (and therefore ts-node/ts-jest) until something actually runs a model.
const src = () => {
  const { Cell, FireState, BurnIndex } = require("../src/models/cell");
  const { Zone } = require("../src/models/zone");
  const { FireEngine } = require("../src/models/engine/fire-engine");
  const { getFireSpreadRate } = require("../src/models/engine/get-fire-spread-rate");
  const { populateGrid } = require("../src/models/utils/image-utils");
  const { getGridIndexForLocation } = require("../src/models/utils/grid-utils");
  const { zonesToImageDataFile } = require("../src/models/utils/data-loaders");
  const { getDefaultConfig } = require("../src/config");
  return {
    Cell, FireState, BurnIndex, Zone, FireEngine, getFireSpreadRate,
    populateGrid, getGridIndexForLocation, zonesToImageDataFile, getDefaultConfig,
  };
};

// The config the app resolves from a URL is not reachable outside a browser, so take
// the defaults and let callers override the few fields a sweep varies.
const defaultGeometry = () => {
  const config = src().getDefaultConfig();
  return {
    gridWidth: config.gridWidth,
    gridHeight: config.gridHeight,
    cellSize: config.cellSize,
    heightmapMaxElevation: config.heightmapMaxElevation,
    minCellBurnTime: config.minCellBurnTime,
    neighborsDist: config.neighborsDist,
    fireSurvivalProbability: config.fireSurvivalProbability,
    unburntIslandProbability: config.unburntIslandProbability,
    maxTimeStep: config.maxTimeStep,
  };
};

const pngCache = new Map();
const readPng = (relativeUrl) => {
  if (!pngCache.has(relativeUrl)) {
    pngCache.set(relativeUrl, decodePng(path.join(PUBLIC_DIR, relativeUrl)));
  }
  return pngCache.get(relativeUrl);
};

/**
 * `data/foothills-plains` for the given zones, the same stem `getElevationData` and
 * `getUnburntIslandsData` derive, so the harness cannot drift from the app's naming.
 */
const terrainStem = (zones) => src().zonesToImageDataFile(zones);

const elevationGrid = (zones, geometry) => {
  const rows = channelRows(readPng(`${terrainStem(zones)}-heightmap.png`), 0);
  const mapped = rows.map((row) => row.map((v) => (v / 255) * geometry.heightmapMaxElevation));
  return src().populateGrid(geometry.gridWidth, geometry.gridHeight, mapped, true);
};

const riverGrid = (geometry) => {
  const rows = channelRows(readPng("data/river-texmap.png"), 3); // alpha
  const mapped = rows.map((row) => row.map((v) => (v > 0 ? 1 : 0)));
  return src().populateGrid(geometry.gridWidth, geometry.gridHeight, mapped, true);
};

/**
 * Islands are grayscale-coded, one shade per island, and each shade is switched on or
 * off once for the whole map, so the shade masks are cached and only the coin flips
 * are redrawn per seed.
 */
const islandMaskCache = new Map();
const islandMasks = (zones, geometry) => {
  const key = `${terrainStem(zones)}|${geometry.gridWidth}x${geometry.gridHeight}`;
  if (!islandMaskCache.has(key)) {
    const rows = channelRows(readPng(`${terrainStem(zones)}-islands.png`), 0);
    const shades = new Set();
    for (const row of rows) for (const v of row) if (v < 255) shades.add(v);
    const masks = [];
    for (const shade of shades) {
      const mapped = rows.map((row) => row.map((v) => (v === shade ? 1 : 0)));
      masks.push(src().populateGrid(geometry.gridWidth, geometry.gridHeight, mapped, true));
    }
    islandMaskCache.set(key, masks);
  }
  return islandMaskCache.get(key);
};

const islandGrid = (zones, geometry, probability, rand) => {
  const masks = islandMasks(zones, geometry);
  const out = new Array(geometry.gridWidth * geometry.gridHeight).fill(0);
  for (const mask of masks) {
    if (rand() < probability) {
      for (let i = 0; i < out.length; i++) if (mask[i] > 0) out[i] = 1;
    }
  }
  return out;
};

/** The two-zone split `DEFAULT_ZONE_DIVISION` applies, run through `populateGrid`. */
const zoneIndexGrid = (zoneCount, geometry) => {
  const division = zoneCount === 3 ? [[0, 1, 2]] : [[0, 1]];
  return src().populateGrid(geometry.gridWidth, geometry.gridHeight, division, false);
};

/** Mirrors populateCellsData, including the operator precedence in its isNonBurnable. */
const buildCells = ({ zones, geometry, elevation, islands, river, zoneIndex }) => {
  const { Cell, getGridIndexForLocation } = src();
  const { gridWidth, gridHeight } = geometry;
  const cells = [];
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const index = getGridIndexForLocation(x, y, gridWidth);
      const zoneIdx = zoneIndex[index];
      const isEdge = x === 0 || x === gridWidth - 1 || y === 0 || y === gridHeight;
      const isNonBurnable =
        x <= 1 || x >= gridWidth - 2 || y <= 1 || y >= gridHeight - 2;
      cells.push(new Cell({
        x, y,
        zone: zones[zoneIdx],
        zoneIdx,
        isRiver: !!(river && river[index] > 0),
        isUnburntIsland: (!!islands && islands[index] > 0) || isNonBurnable,
        baseElevation: isEdge ? 0 : elevation[index],
      }));
    }
  }
  return cells;
};

/**
 * Builds a grid for the given zones. `zoneSpecs` is one `{ terrainType, vegetation,
 * droughtLevel }` per zone, using the enums from `src/types`.
 */
const buildTerrain = ({ zoneSpecs, seed = 1, geometry = defaultGeometry(), useIslands = true, useRiver = true }) => {
  const { Zone } = src();
  const zones = zoneSpecs.map((z) => new Zone(z));
  const rand = mulberry32(seed);
  const elevation = elevationGrid(zones, geometry);
  const islands = useIslands
    ? islandGrid(zones, geometry, geometry.unburntIslandProbability, rand)
    : undefined;
  const river = useRiver ? riverGrid(geometry) : undefined;
  const zoneIndex = zoneIndexGrid(zones.length, geometry);
  return { zones, geometry, rand, cells: buildCells({ zones, geometry, elevation, islands, river, zoneIndex }) };
};

// ---------------------------------------------------------------------------
// Running a fire
// ---------------------------------------------------------------------------

/**
 * Steps a real FireEngine until the fire stops or `maxMinutes` elapses. `timeStep` is
 * the ~3 minutes per frame the app's rafCallback settles on at 60 FPS with the default
 * `modelDayInSeconds`. Returns the cells so callers can measure the burn.
 */
const runFire = ({
  zoneSpecs, sparks, seed = 1, geometry = defaultGeometry(),
  wind = { speed: 0, direction: 0 }, maxMinutes = 7200, timeStep = 3,
  useIslands = true, useRiver = true,
}) => {
  const { FireEngine } = src();
  const { Vector2 } = require("three");
  const terrain = buildTerrain({ zoneSpecs, seed, geometry, useIslands, useRiver });
  return withSeededRandom(terrain.rand, () => {
    const engine = new FireEngine(
      terrain.cells, wind, sparks.map(([x, y]) => new Vector2(x, y)),
      {
        gridWidth: geometry.gridWidth,
        gridHeight: geometry.gridHeight,
        cellSize: geometry.cellSize,
        minCellBurnTime: geometry.minCellBurnTime,
        neighborsDist: geometry.neighborsDist,
        fireSurvivalProbability: geometry.fireSurvivalProbability,
      }
    );
    let time = 0;
    let stoppedAtMinutes = null;
    let endOfLowIntensityFireDay = null;
    while (time < maxMinutes) {
      time += timeStep;
      const wasSet = engine.endOfLowIntensityFire;
      engine.updateFire(time);
      if (!wasSet && engine.endOfLowIntensityFire) endOfLowIntensityFireDay = engine.day;
      if (engine.fireDidStop) {
        stoppedAtMinutes = time;
        break;
      }
    }
    return { cells: terrain.cells, engine, geometry, timeMinutes: time, stoppedAtMinutes, endOfLowIntensityFireDay };
  });
};

// ---------------------------------------------------------------------------
// Measurements
// ---------------------------------------------------------------------------

/** Burnt cell count per zone index. */
const burntByZone = (result) => {
  const { FireState } = src();
  const counts = [];
  for (const cell of result.cells) {
    counts[cell.zoneIdx] = (counts[cell.zoneIdx] || 0) + (cell.fireState !== FireState.Unburnt ? 1 : 0);
  }
  return counts;
};

/**
 * First column belonging to zone 1. Read off the cells rather than computed from the
 * grid width: `populateGrid`'s rounding puts it at 121 of 240, not at the midpoint,
 * and a formula that assumed the midpoint would silently under-report every crossing
 * by one cell.
 */
const boundaryColumn = (cells) => {
  for (const cell of cells) if (cell.zoneIdx === 1) return cell.x;
  throw new Error("no zone 1 in this grid");
};

/**
 * How many cells past the two-zone boundary the fire reached in `intoZone`, ignoring
 * the nonburnable border band. Zone 0 is measured leftwards and zone 1 rightwards, so
 * reaching the single column nearest the boundary is a depth of 1 either way.
 */
const crossingDepth = (result, intoZone) => {
  const { FireState } = src();
  const { gridWidth } = result.geometry;
  const boundary = boundaryColumn(result.cells);
  let depth = 0;
  for (const cell of result.cells) {
    if (cell.zoneIdx !== intoZone || cell.fireState === FireState.Unburnt) continue;
    if (cell.x <= 1 || cell.x >= gridWidth - 2) continue;
    const d = intoZone === 1 ? cell.x - boundary + 1 : boundary - cell.x;
    if (d > depth) depth = d;
  }
  return depth;
};

/** Minutes for the front to advance one cell on flat ground, per vegetation and drought. */
const flatGroundSpreadTable = (geometry = defaultGeometry()) => {
  const { Zone, Cell, getFireSpreadRate } = src();
  const wind = { speed: 0, direction: 0 };
  const table = [];
  for (let vegetation = 0; vegetation < 4; vegetation++) {
    const row = [];
    for (let droughtLevel = 0; droughtLevel < 4; droughtLevel++) {
      const zone = new Zone({ vegetation, droughtLevel });
      const source = new Cell({ x: 0, y: 0, zone, baseElevation: 0 });
      const target = new Cell({ x: 1, y: 0, zone, baseElevation: 0 });
      const rate = getFireSpreadRate(source, target, wind, geometry.cellSize);
      row.push({ ftPerMin: rate, minutesPerCell: geometry.cellSize / rate, cellsPerDay: (1440 * rate) / geometry.cellSize });
    }
    table.push(row);
  }
  return table;
};

/**
 * For every cell of a terrain, the highest spread rate a neighbor could ignite it at
 * (which is what `Cell.spreadRate` ends up holding), bucketed by the resulting burn
 * index. This is what shows that Forest and Plains can never clear Low, and therefore
 * that `endOfLowIntensityFire` seals them.
 */
const burnIndexCensus = ({ zoneSpecs, vegetation, droughtLevel, columns, geometry = defaultGeometry() }) => {
  const { Zone, Cell, getFireSpreadRate } = src();
  const { gridWidth, gridHeight, cellSize } = geometry;
  const zones = zoneSpecs.map((z) => new Zone(z));
  const elevation = elevationGrid(zones, geometry);
  const zone = new Zone({ vegetation, droughtLevel });
  const wind = { speed: 0, direction: 0 };
  const [xLo, xHi] = columns || [2, gridWidth - 2];
  const counts = [0, 0, 0];
  let maxRate = 0;
  for (let y = 2; y < gridHeight - 2; y++) {
    for (let x = xLo; x < xHi; x++) {
      const target = new Cell({ x, y, zone, baseElevation: elevation[y * gridWidth + x] });
      let best = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const source = new Cell({
            x: x + dx, y: y + dy, zone,
            baseElevation: elevation[(y + dy) * gridWidth + (x + dx)],
          });
          const rate = getFireSpreadRate(source, target, wind, cellSize);
          if (rate > best) best = rate;
        }
      }
      target.spreadRate = best;
      counts[target.burnIndex]++;
      if (best > maxRate) maxRate = best;
    }
  }
  const total = counts[0] + counts[1] + counts[2];
  return { counts, total, share: counts.map((c) => (100 * c) / total), maxRate };
};

module.exports = {
  decodePng, channelRows, mulberry32, withSeededRandom,
  defaultGeometry, terrainStem, buildTerrain, runFire,
  burntByZone, boundaryColumn, crossingDepth, flatGroundSpreadTable, burnIndexCensus,
  PUBLIC_DIR,
};
