import { SimulationModel, SPEEDS } from "./simulation";
import type { IStores } from "./stores";
import { Cell, FireState } from "./cell";
import { Zone } from "./zone";
import { DroughtLevel, TerrainType, Vegetation } from "../types";
import { AnnotationEventKind, isAnnotationEventKind } from "../charts/components/annotation-icons";
import { Annotation } from "../charts/models/chart-annotation";

export const SAVED_STATE_VERSION = 1;

// A member access on require() bundles only the version; a named import bundles all of package.json.
declare const require: (id: string) => { version: string };
const APP_VERSION = require("../../package.json").version;

const BURNT_SURVIVOR_CODE = 3;
const CODES_PER_CELL = 4;
const CELLS_PER_BYTE = 4;

export type FireLineSegment = [number, number, number, number];

export interface ISavedAnnotation {
  hour: number;
  kind: AnnotationEventKind;
  actionOrder: number;
}

export interface ISavedView {
  vegetationKey: boolean;
  graphOpen: boolean;
  graphShowsAllData: boolean;
}

const VIEW_KEYS: Array<keyof ISavedView> = ["vegetationKey", "graphOpen", "graphShowsAllData"];

export interface ISavedRunState {
  version: typeof SAVED_STATE_VERSION;
  identity: { preset: string; gridWidth: number; gridHeight: number; zonesCount: number; appVersion: string };
  setup: {
    zones: Array<{ vegetation: Vegetation; terrainType: TerrainType; droughtLevel: DroughtLevel }>;
    wind: { speed: number; direction: number };
    speedIndex: number;
    // Model feet.
    sparks: Array<[number, number]>;
    fireLineSegments: FireLineSegment[];
    helitackDrops: Array<{ x: number; y: number; time: number }>;
  };
  // Minutes.
  time: number;
  endReason: string;
  // simulation.getOutcomeData(), exactly as logged with SimulationEnded.
  outcome: unknown;
  // Per zone, [hour, thousands of acres].
  burnSamples: Array<Array<[number, number]>>;
  annotations: ISavedAnnotation[];
  // The view selectors as the student left them when the run ended.
  view?: ISavedView;
  // 2 bits per cell, four cells per byte, low bits first, base64.
  burnMap: string;
}

export type SavedStateValidation = { ok: true; state: ISavedRunState } | { ok: false; reason: string };

const round4 = (value: number) => Math.round(value * 10000) / 10000;

const burnCode = (cell: Cell) =>
  cell.fireState === FireState.Burnt && cell.isFireSurvivor ? BURNT_SURVIVOR_CODE : cell.fireState;

export const encodeBurnMap = (cells: Cell[]) => {
  const bytes = new Uint8Array(Math.ceil(cells.length / CELLS_PER_BYTE));
  cells.forEach((cell, i) => {
    bytes[Math.floor(i / CELLS_PER_BYTE)] += burnCode(cell) * CODES_PER_CELL ** (i % CELLS_PER_BYTE);
  });
  let binary = "";
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
};

// Returns undefined for invalid base64 or a map that does not hold exactly cellCount cells.
export const decodeBurnMap = (base64: string, cellCount: number): number[] | undefined => {
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    return undefined;
  }
  if (binary.length !== Math.ceil(cellCount / CELLS_PER_BYTE)) {
    return undefined;
  }
  const codes: number[] = new Array(cellCount);
  for (let i = 0; i < cellCount; i++) {
    const byte = binary.charCodeAt(Math.floor(i / CELLS_PER_BYTE));
    codes[i] = Math.floor(byte / CODES_PER_CELL ** (i % CELLS_PER_BYTE)) % CODES_PER_CELL;
  }
  return codes;
};

// Copies everything it reads: the interactive API deep-freezes the state it is given.
export const buildSavedState = ({ simulation, chartStore, ui }: IStores, endReason: string): ISavedRunState => {
  const wind = simulation.userDefinedWind ?? simulation.wind;
  return {
    version: SAVED_STATE_VERSION,
    identity: {
      preset: simulation.config.preset,
      gridWidth: simulation.gridWidth,
      gridHeight: simulation.gridHeight,
      zonesCount: simulation.zonesCount,
      appVersion: APP_VERSION
    },
    setup: {
      zones: simulation.zones.map(z => ({ vegetation: z.vegetation, terrainType: z.terrainType, droughtLevel: z.droughtLevel })),
      wind: { speed: wind.speed, direction: wind.direction },
      speedIndex: simulation.speedIndex,
      sparks: simulation.sparks.map(s => [s.x, s.y]),
      fireLineSegments: simulation.fireLineSegments.map(([x1, y1, x2, y2]): FireLineSegment => [x1, y1, x2, y2]),
      helitackDrops: simulation.helitackDrops.map(({ x, y, time }) => ({ x, y, time }))
    },
    time: simulation.time,
    endReason,
    outcome: simulation.getOutcomeData(chartStore),
    burnSamples: simulation.zones.map((_, zoneIdx) =>
      (chartStore.rawBurnData[zoneIdx] || []).map(({ time, acres }): [number, number] => [time, round4(acres)])
    ),
    annotations: (chartStore.chart.annotations || [])
      .filter((a): a is Annotation & { eventKind: AnnotationEventKind } => isAnnotationEventKind(a.eventKind))
      .map(a => ({ hour: a.value ?? 0, kind: a.eventKind, actionOrder: a.actionOrder ?? 0 })),
    view: {
      vegetationKey: ui.showVegetationKey,
      graphOpen: ui.showChart,
      graphShowsAllData: chartStore.chart.maxPoints === -1
    },
    burnMap: encodeBurnMap(simulation.cells)
  };
};

const isObject = (value: unknown): value is Record<string, any> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const isNonNegative = (value: unknown) => isFiniteNumber(value) && value >= 0;

const isEnumValue = (enumObject: object, value: unknown) =>
  typeof value === "number" && Object.values(enumObject).includes(value);

const isArrayOf = (value: unknown, check: (item: any) => boolean) => Array.isArray(value) && value.every(check);

// Validates a state from the parent window, which is untrusted, against the model it would be drawn in.
export const validateSavedState = (value: unknown, simulation: SimulationModel): SavedStateValidation => {
  const fail = (reason: string): SavedStateValidation => ({ ok: false, reason });
  const { config } = simulation;
  // buildFireLine and setHelitackPoint index cells without bounds checks.
  const inModel = (x: unknown, y: unknown) =>
    isFiniteNumber(x) && isFiniteNumber(y) && x >= 0 && x < config.modelWidth && y >= 0 && y < config.modelHeight;

  if (!isObject(value)) return fail("the state is not an object");
  if (value.version !== SAVED_STATE_VERSION) return fail(`unsupported version ${JSON.stringify(value.version)}`);

  const { identity, setup } = value;
  if (!isObject(identity)) return fail("identity is missing");
  if (identity.preset !== config.preset) {
    return fail(`saved for preset ${JSON.stringify(identity.preset)}, not ${JSON.stringify(config.preset)}`);
  }
  if (identity.gridWidth !== simulation.gridWidth || identity.gridHeight !== simulation.gridHeight) {
    return fail(`saved for a ${identity.gridWidth} x ${identity.gridHeight} grid, not ${simulation.gridWidth} x ${simulation.gridHeight}`);
  }
  const zonesCount = identity.zonesCount;
  if (config.zonesCount ? zonesCount !== config.zonesCount : zonesCount !== 2 && zonesCount !== 3) {
    return fail(`saved with ${zonesCount} zones, which this model does not allow`);
  }

  if (!isObject(setup)) return fail("setup is missing");
  const zoneFits = (z: unknown) => isObject(z) && isEnumValue(Vegetation, z.vegetation) &&
    isEnumValue(TerrainType, z.terrainType) && isEnumValue(DroughtLevel, z.droughtLevel);
  if (!isArrayOf(setup.zones, zoneFits) || setup.zones.length !== zonesCount) return fail("invalid zones");
  if (!isObject(setup.wind) || !isNonNegative(setup.wind.speed) || !isFiniteNumber(setup.wind.direction)) {
    return fail("invalid wind");
  }
  if (!Number.isInteger(setup.speedIndex) || setup.speedIndex < 0 || setup.speedIndex >= SPEEDS.length) {
    return fail("invalid speed index");
  }
  if (!isArrayOf(setup.sparks, s => Array.isArray(s) && s.length === 2 && inModel(s[0], s[1]))) {
    return fail("invalid sparks");
  }
  const segmentFits = (s: unknown) => Array.isArray(s) && s.length === 4 && inModel(s[0], s[1]) && inModel(s[2], s[3]);
  if (!isArrayOf(setup.fireLineSegments, segmentFits)) return fail("invalid fire-line segments");
  const dropFits = (d: unknown) => isObject(d) && inModel(d.x, d.y) && isNonNegative(d.time);
  if (!isArrayOf(setup.helitackDrops, dropFits)) return fail("invalid helitack drops");

  if (!isNonNegative(value.time)) return fail("invalid time");
  if (typeof value.endReason !== "string") return fail("invalid end reason");
  const sampleFits = (p: unknown) => Array.isArray(p) && p.length === 2 && isNonNegative(p[0]) && isNonNegative(p[1]);
  if (!isArrayOf(value.burnSamples, zone => isArrayOf(zone, sampleFits)) || value.burnSamples.length !== zonesCount) {
    return fail("invalid burn samples");
  }
  const annotationFits = (a: unknown) => isObject(a) && isNonNegative(a.hour) &&
    typeof a.kind === "string" && isAnnotationEventKind(a.kind) && isFiniteNumber(a.actionOrder);
  if (!isArrayOf(value.annotations, annotationFits)) return fail("invalid graph annotations");
  const viewFits = (v: unknown) => isObject(v) &&
    VIEW_KEYS.every(key => typeof v[key] === "boolean");
  if (value.view !== undefined && !viewFits(value.view)) return fail("invalid view");
  if (typeof value.burnMap !== "string" || !decodeBurnMap(value.burnMap, simulation.gridWidth * simulation.gridHeight)) {
    return fail("invalid burn map");
  }

  return { ok: true, state: value as ISavedRunState };
};

// Draws a validated run as it ended. The ended flag goes first so the graph's live effects skip
// every change below, and the burn map goes last because a helitack drop resets burning cells.
export const applySavedState = async ({ simulation, chartStore, ui }: IStores, state: ISavedRunState) => {
  const { setup, view } = state;
  simulation.restoredRunEnded = true;
  simulation.updateZones(setup.zones.map(z => new Zone(z)));
  await simulation.dataReadyPromise;

  simulation.setWindSpeed(setup.wind.speed);
  simulation.setWindDirection(setup.wind.direction);
  simulation.setSpeedIndex(setup.speedIndex);
  simulation.sparks.length = 0;
  setup.sparks.forEach(([x, y]) => simulation.addSpark(x, y));

  setup.fireLineSegments.forEach(([x1, y1, x2, y2]) => simulation.buildFireLine({ x: x1, y: y1 }, { x: x2, y: y2 }));
  setup.helitackDrops.forEach(({ x, y, time }) => {
    simulation.time = time;
    simulation.setHelitackPoint(x, y);
  });

  const codes = decodeBurnMap(state.burnMap, simulation.cells.length);
  if (!codes) {
    throw new Error("the burn map does not fit the grid");
  }
  simulation.cells.forEach((cell, i) => {
    cell.isFireSurvivor = codes[i] === BURNT_SURVIVOR_CODE;
    cell.fireState = cell.isFireSurvivor ? FireState.Burnt : codes[i];
  });

  simulation.time = state.time;
  simulation.simulationStarted = true;
  simulation.simulationRunning = false;
  simulation.updateCellsStateFlag();
  simulation.updateCellsElevationFlag();

  chartStore.restoreBurnData(state.burnSamples, state.annotations, view?.graphShowsAllData ?? false);
  if (view) {
    ui.showVegetationKey = view.vegetationKey;
    ui.setShowChart(view.graphOpen);
  }
};
