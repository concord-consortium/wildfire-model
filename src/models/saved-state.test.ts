import { flushStateUpdates, setInteractiveState } from "@concord-consortium/lara-interactive-api";
import { SimulationModel } from "./simulation";
import { ChartStore } from "./chart-store";
import { Cell, FireState } from "./cell";
import { Zone } from "./zone";
import { Annotation } from "../charts/models/chart-annotation";
import { FIRE_LINE_EVENT, HELITACK_EVENT } from "../charts/components/annotation-icons";
import { DroughtLevel, TerrainType, Vegetation } from "../types";
import { ISimulationConfig } from "../config";
import {
  ISavedRunState, SAVED_STATE_VERSION, applySavedState, buildSavedState, decodeBurnMap, encodeBurnMap,
  validateSavedState
} from "./saved-state";
import packageJson from "../../package.json";


const MODEL_WIDTH = 120000;
const MODEL_HEIGHT = 80000;
const CELL_SIZE = 1000;

const createSim = async (overrides: Partial<ISimulationConfig> = {}) => {
  const sim = new SimulationModel({
    modelWidth: MODEL_WIDTH,
    modelHeight: MODEL_HEIGHT,
    gridWidth: MODEL_WIDTH / CELL_SIZE,
    sparks: [[30000, 40000], [90000, 40000]],
    zones: [
      { terrainType: TerrainType.Plains, vegetation: Vegetation.Grass, droughtLevel: DroughtLevel.MildDrought },
      { terrainType: TerrainType.Foothills, vegetation: Vegetation.Forest, droughtLevel: DroughtLevel.SevereDrought }
    ],
    elevation: [[0]],
    unburntIslands: [[0]],
    riverData: null,
    ...overrides
  });
  await sim.dataReadyPromise;
  return sim;
};

const createEndedRun = async () => {
  const sim = await createSim();
  const chartStore = new ChartStore();
  sim.simulationStarted = true;
  sim.time = 125.5;
  sim.buildFireLine({ x: 20000, y: 40000 }, { x: 30000, y: 45000 });
  sim.setHelitackPoint(60000, 40000);
  sim.cells[1000].fireState = FireState.Burnt;
  sim.cells[1001].fireState = FireState.Burnt;
  sim.cells[1001].isFireSurvivor = true;
  sim.cells[1002].fireState = FireState.Burning;
  chartStore.rawBurnData = [
    [{ time: 0, acres: 0 }, { time: 1, acres: 0.123456 }, { time: 2, acres: 0.5 }],
    [{ time: 0, acres: 0 }, { time: 1, acres: 1.000049 }, { time: 2, acres: 2.25 }]
  ];
  chartStore.chart.addAnnotation(new Annotation({ type: "verticalLine", value: 1, eventKind: FIRE_LINE_EVENT, actionOrder: 1 }));
  chartStore.chart.addAnnotation(new Annotation({ type: "verticalLine", value: 2, eventKind: HELITACK_EVENT, actionOrder: 2 }));
  return { sim, chartStore };
};

const copy = (state: ISavedRunState): any => JSON.parse(JSON.stringify(state));

describe("burn map encoding", () => {
  const zone = new Zone();
  const cellWith = (fireState: FireState, isFireSurvivor = false) => {
    const cell = new Cell({ x: 0, y: 0, zone });
    cell.fireState = fireState;
    cell.isFireSurvivor = isFireSurvivor;
    return cell;
  };

  it("round-trips every code at a cell count that is not a multiple of four", () => {
    const cells = [
      cellWith(FireState.Unburnt), cellWith(FireState.Burning), cellWith(FireState.Burnt),
      cellWith(FireState.Burnt, true), cellWith(FireState.Burnt, true), cellWith(FireState.Burning),
      cellWith(FireState.Unburnt)
    ];
    const codes = decodeBurnMap(encodeBurnMap(cells), cells.length);
    expect(codes).toEqual([0, 1, 2, 3, 3, 1, 0]);
  });

  it("packs four cells per byte", () => {
    const cells = Array.from({ length: 9 }, () => cellWith(FireState.Burnt, true));
    expect(atob(encodeBurnMap(cells))).toHaveLength(3);
  });

  it("rejects a map with too few or too many cells, and invalid base64", () => {
    const encoded = encodeBurnMap(Array.from({ length: 8 }, () => cellWith(FireState.Burnt)));
    expect(decodeBurnMap(encoded, 8)).toHaveLength(8);
    expect(decodeBurnMap(encoded, 9)).toBeUndefined();
    expect(decodeBurnMap(encoded, 4)).toBeUndefined();
    expect(decodeBurnMap("not base64!", 8)).toBeUndefined();
  });
});

describe("buildSavedState", () => {
  it("carries the setup, fire lines, drops, outcome, samples, markers and burn map of the run", async () => {
    const { sim, chartStore } = await createEndedRun();
    const state = buildSavedState(sim, chartStore, "Restart");

    expect(state.version).toBe(SAVED_STATE_VERSION);
    expect(state.identity).toEqual({
      preset: "default", gridWidth: 120, gridHeight: 80, zonesCount: 2, appVersion: packageJson.version
    });
    expect(state.setup.zones).toEqual([
      { terrainType: TerrainType.Plains, vegetation: Vegetation.Grass, droughtLevel: DroughtLevel.MildDrought },
      { terrainType: TerrainType.Foothills, vegetation: Vegetation.Forest, droughtLevel: DroughtLevel.SevereDrought }
    ]);
    expect(state.setup.sparks).toEqual([[30000, 40000], [90000, 40000]]);
    expect(state.setup.fireLineSegments).toEqual([[20000, 40000, 30000, 45000]]);
    expect(state.setup.helitackDrops).toEqual([{ x: 60000, y: 40000, time: 125.5 }]);
    expect(state.time).toBe(125.5);
    expect(state.endReason).toBe("Restart");
    expect(state.outcome).toEqual(sim.getOutcomeData(chartStore));
    expect(state.burnSamples).toEqual([
      [[0, 0], [1, 0.1235], [2, 0.5]],
      [[0, 0], [1, 1], [2, 2.25]]
    ]);
    expect(state.annotations).toEqual([
      { hour: 1, kind: FIRE_LINE_EVENT, actionOrder: 1 },
      { hour: 2, kind: HELITACK_EVENT, actionOrder: 2 }
    ]);
    const codes = decodeBurnMap(state.burnMap, sim.cells.length)!;
    expect(codes.slice(999, 1004)).toEqual([0, 2, 3, 1, 0]);
  });

  it("saves the student's wind rather than a scheduled wind change", async () => {
    const { sim, chartStore } = await createEndedRun();
    sim.userDefinedWind = { speed: 10, direction: 90 };
    sim.wind = { speed: 3, direction: 270 };
    expect(buildSavedState(sim, chartStore, "ByItself").setup.wind).toEqual({ speed: 10, direction: 90 });
  });

  it("leaves the model's lists writable after a save through the interactive API", async () => {
    const { sim, chartStore } = await createEndedRun();
    const state = buildSavedState(sim, chartStore, "ByItself");
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    setInteractiveState(state);
    flushStateUpdates();
    expect(Object.isFrozen(state.setup.fireLineSegments)).toBe(true);

    sim.buildFireLine({ x: 50000, y: 20000 }, { x: 55000, y: 20000 });
    sim.setHelitackPoint(70000, 30000);
    expect(sim.fireLineSegments).toHaveLength(2);
    expect(sim.helitackDrops).toHaveLength(2);
    expect(state.setup.fireLineSegments).toHaveLength(1);
  });

  it("stays under 20 KB for a 50-hour, 3-zone run on the default grid", async () => {
    const sim = await createSim({
      gridWidth: 240,
      zones: [
        { terrainType: TerrainType.Plains, vegetation: Vegetation.Grass, droughtLevel: DroughtLevel.MildDrought },
        { terrainType: TerrainType.Plains, vegetation: Vegetation.Shrub, droughtLevel: DroughtLevel.MediumDrought },
        { terrainType: TerrainType.Plains, vegetation: Vegetation.Forest, droughtLevel: DroughtLevel.SevereDrought }
      ],
      sparks: [[20000, 40000], [60000, 40000], [100000, 40000]]
    });
    const chartStore = new ChartStore();
    sim.time = 50 * 60;
    sim.cells.forEach((cell, i) => { cell.fireState = i % 3; });
    chartStore.rawBurnData = [0, 1, 2].map(() =>
      Array.from({ length: 51 }, (_, hour) => ({ time: hour, acres: hour * 1.23456789 }))
    );
    const state = buildSavedState(sim, chartStore, "ByItself");
    expect(sim.gridWidth * sim.gridHeight).toBe(38400);
    expect(JSON.stringify(state).length).toBeLessThan(20000);
  });
});

describe("validateSavedState", () => {
  let sim: SimulationModel;
  let baseState: ISavedRunState;

  beforeAll(async () => {
    const run = await createEndedRun();
    sim = run.sim;
    baseState = buildSavedState(run.sim, run.chartStore, "ByItself");
  });

  const rejectionOf = (state: unknown, model: SimulationModel) => {
    const result = validateSavedState(state, model);
    return result.ok ? undefined : result.reason;
  };

  it("accepts a state built by the same model", () => {
    const state = copy(baseState);
    expect(validateSavedState(state, sim)).toEqual({ ok: true, state });
  });

  it("rejects a non-object and an unknown version", () => {
    expect(rejectionOf(null, sim)).toMatch(/not an object/);
    expect(rejectionOf([], sim)).toMatch(/not an object/);
    expect(rejectionOf({ ...copy(baseState), version: 2 }, sim)).toMatch(/version/);
  });

  it("rejects a state saved for another preset or grid", () => {
    const state = copy(baseState);
    expect(rejectionOf({ ...state, identity: { ...state.identity, preset: "hillThreeZone" } }, sim)).toMatch(/preset/);
    expect(rejectionOf({ ...state, identity: { ...state.identity, gridWidth: 240 } }, sim)).toMatch(/grid/);
    expect(rejectionOf({ ...state, identity: { ...state.identity, gridHeight: 160 } }, sim)).toMatch(/grid/);
    expect(rejectionOf({ ...state, identity: undefined }, sim)).toMatch(/identity/);
  });

  describe("zone count", () => {
    const withZones = (state: any, count: number) => {
      const zone = state.setup.zones[0];
      const samples = state.burnSamples[0];
      return {
        ...state,
        identity: { ...state.identity, zonesCount: count },
        setup: { ...state.setup, zones: Array.from({ length: count }, () => zone) },
        burnSamples: Array.from({ length: count }, () => samples)
      };
    };

    it("accepts 2 or 3 zones when nothing fixes the count", () => {
      const state = copy(baseState);
      expect(validateSavedState(withZones(state, 3), sim).ok).toBe(true);
      expect(rejectionOf(withZones(state, 4), sim)).toMatch(/4 zones/);
      expect(rejectionOf(withZones(state, 1), sim)).toMatch(/1 zones/);
    });

    it("requires the fixed count when zonesCount is configured", async () => {
      const fixedSim = await createSim({ zonesCount: 2 });
      const state = copy(buildSavedState(fixedSim, new ChartStore(), "ByItself"));
      expect(validateSavedState(state, fixedSim).ok).toBe(true);
      expect(rejectionOf(withZones(state, 3), fixedSim)).toMatch(/3 zones/);
    });

    it("rejects zones or samples that do not match the count", () => {
      const state = copy(baseState);
      expect(rejectionOf({ ...state, setup: { ...state.setup, zones: [state.setup.zones[0]] } }, sim)).toMatch(/zones/);
      expect(rejectionOf({ ...state, burnSamples: [state.burnSamples[0]] }, sim)).toMatch(/burn samples/);
    });
  });

  it.each([
    ["vegetation", { vegetation: 4 }],
    ["terrain type", { terrainType: -1 }],
    ["drought level", { droughtLevel: 1.5 }],
    ["label instead of a value", { vegetation: "Grass" }]
  ])("rejects a zone with an out-of-range %s", (_, change) => {
    const state = copy(baseState);
    state.setup.zones[1] = { ...state.setup.zones[1], ...change };
    expect(rejectionOf(state, sim)).toMatch(/zones/);
  });

  it("rejects invalid wind and speed index", () => {
    const state = copy(baseState);
    expect(rejectionOf({ ...state, setup: { ...state.setup, wind: { speed: -1, direction: 0 } } }, sim)).toMatch(/wind/);
    expect(rejectionOf({ ...state, setup: { ...state.setup, wind: { speed: 1, direction: "N" } } }, sim)).toMatch(/wind/);
    expect(rejectionOf({ ...state, setup: { ...state.setup, speedIndex: 3 } }, sim)).toMatch(/speed index/);
    expect(rejectionOf({ ...state, setup: { ...state.setup, speedIndex: 0.5 } }, sim)).toMatch(/speed index/);
  });

  describe("points outside the model", () => {
    const pastEdges: Array<[string, number, number]> = [
      ["left", -1, 40000],
      ["right", MODEL_WIDTH, 40000],
      ["top", 60000, -1],
      ["bottom", 60000, MODEL_HEIGHT],
      ["non-finite", Infinity, 40000]
    ];

    it("accepts points on the last cell of each edge", () => {
      const state = copy(baseState);
      state.setup.sparks = [[0, 0], [MODEL_WIDTH - CELL_SIZE / 2, MODEL_HEIGHT - CELL_SIZE / 2]];
      expect(validateSavedState(state, sim).ok).toBe(true);
    });

    it.each(pastEdges)("rejects a spark past the %s edge", (_, x, y) => {
      const state = copy(baseState);
      state.setup.sparks[0] = [x, y];
      expect(rejectionOf(state, sim)).toMatch(/sparks/);
    });

    it.each(pastEdges)("rejects a fire-line endpoint past the %s edge", (_, x, y) => {
      const state = copy(baseState);
      state.setup.fireLineSegments[0] = [20000, 40000, x, y];
      expect(rejectionOf(state, sim)).toMatch(/fire-line/);
    });

    it.each(pastEdges)("rejects a helitack drop past the %s edge", (_, x, y) => {
      const state = copy(baseState);
      state.setup.helitackDrops[0] = { x, y, time: 10 };
      expect(rejectionOf(state, sim)).toMatch(/helitack/);
    });
  });

  it("rejects malformed sparks, segments, drop times and run time", () => {
    const state = copy(baseState);
    expect(rejectionOf({ ...state, setup: { ...state.setup, sparks: [[1000]] } }, sim)).toMatch(/sparks/);
    expect(rejectionOf({ ...state, setup: { ...state.setup, fireLineSegments: [[1000, 1000]] } }, sim)).toMatch(/fire-line/);
    const badDrop = { x: 1000, y: 1000, time: -5 };
    expect(rejectionOf({ ...state, setup: { ...state.setup, helitackDrops: [badDrop] } }, sim)).toMatch(/helitack/);
    expect(rejectionOf({ ...state, time: -1 }, sim)).toMatch(/time/);
    expect(rejectionOf({ ...state, time: null }, sim)).toMatch(/time/);
    expect(rejectionOf({ ...state, endReason: 5 }, sim)).toMatch(/end reason/);
  });

  it("rejects malformed samples and an unknown marker kind", () => {
    const state = copy(baseState);
    expect(rejectionOf({ ...state, burnSamples: [[[0, "1"]], []] }, sim)).toMatch(/burn samples/);
    expect(rejectionOf({ ...state, annotations: [{ hour: 1, kind: "spark", actionOrder: 1 }] }, sim)).toMatch(/annotations/);
    expect(rejectionOf({ ...state, annotations: [{ hour: 1, kind: [FIRE_LINE_EVENT], actionOrder: 1 }] }, sim)).toMatch(/annotations/);
    expect(rejectionOf({ ...state, annotations: [{ hour: -1, kind: FIRE_LINE_EVENT, actionOrder: 1 }] }, sim)).toMatch(/annotations/);
  });

  it("rejects a burn map of the wrong length", () => {
    const state = copy(baseState);
    expect(rejectionOf({ ...state, burnMap: state.burnMap.slice(0, -8) }, sim)).toMatch(/burn map/);
    expect(rejectionOf({ ...state, burnMap: state.burnMap + "AAAA" }, sim)).toMatch(/burn map/);
    expect(rejectionOf({ ...state, burnMap: 42 }, sim)).toMatch(/burn map/);
  });
});

describe("applySavedState", () => {
  const DROP_CELL = 40 * 120 + 60;

  const createRunToRestore = async () => {
    const run = await createEndedRun();
    run.sim.setSpeedIndex(2);
    run.sim.setWindSpeed(12);
    run.sim.setWindDirection(135);
    // Reignited after the drop, so replaying the drop after the map would put it out.
    run.sim.cells[DROP_CELL].fireState = FireState.Burning;
    return run;
  };

  it("reproduces every cell's fire state, survivor flag, helitack count and fire-line flag", async () => {
    const { sim: source, chartStore: sourceChart } = await createRunToRestore();
    const state = copy(buildSavedState(source, sourceChart, "Restart"));
    const target = await createSim();

    await applySavedState(target, new ChartStore(), state);

    expect(source.cells[DROP_CELL].helitackDropCount).toBeGreaterThan(0);
    expect(source.cells.some(c => c.isFireLine)).toBe(true);
    const cellState = (c: Cell) => [c.fireState, c.isFireSurvivor, c.helitackDropCount, c.isFireLine];
    const differing = target.cells.filter((cell, i) =>
      JSON.stringify(cellState(cell)) !== JSON.stringify(cellState(source.cells[i]))
    );
    expect(target.cells).toHaveLength(source.cells.length);
    expect(differing).toHaveLength(0);
  });

  it("applies the setup and marks the run ended at its duration", async () => {
    const { sim: source, chartStore: sourceChart } = await createRunToRestore();
    const target = await createSim({ sparks: [] });

    await applySavedState(target, new ChartStore(), copy(buildSavedState(source, sourceChart, "Restart")));

    expect(target.zones.map(z => z.vegetation)).toEqual([Vegetation.Grass, Vegetation.Forest]);
    expect(target.zones.map(z => z.droughtLevel)).toEqual([DroughtLevel.MildDrought, DroughtLevel.SevereDrought]);
    expect(target.wind).toEqual({ speed: 12, direction: 135 });
    expect(target.speedIndex).toBe(2);
    expect(target.sparks.map(s => [s.x, s.y])).toEqual([[30000, 40000], [90000, 40000]]);
    expect(target.time).toBe(125.5);
    expect(target.simulationEnded).toBe(true);
    expect(target.startEnabled).toBe(false);
    expect(target.engine).toBeNull();

    target.restart();
    expect(target.simulationEnded).toBe(false);
    expect(target.startEnabled).toBe(true);
    expect(target.restoredRunEnded).toBe(false);
  });

  it("resizes a model whose zone count differs from the saved run", async () => {
    const { sim: source, chartStore: sourceChart } = await createRunToRestore();
    const target = await createSim({
      zones: [
        { terrainType: TerrainType.Plains, vegetation: Vegetation.Shrub, droughtLevel: DroughtLevel.NoDrought },
        { terrainType: TerrainType.Plains, vegetation: Vegetation.Shrub, droughtLevel: DroughtLevel.NoDrought },
        { terrainType: TerrainType.Plains, vegetation: Vegetation.Shrub, droughtLevel: DroughtLevel.NoDrought }
      ]
    });

    await applySavedState(target, new ChartStore(), copy(buildSavedState(source, sourceChart, "Restart")));

    expect(target.zonesCount).toBe(2);
    expect(new Set(target.cells.map(c => c.zoneIdx))).toEqual(new Set([0, 1]));
  });

  it("hands the graph the saved samples and markers", async () => {
    const { sim: source, chartStore: sourceChart } = await createRunToRestore();
    const state = copy(buildSavedState(source, sourceChart, "Restart"));
    const chartStore = new ChartStore();
    const versionBefore = chartStore.restoreVersion;

    await applySavedState(await createSim(), chartStore, state);

    expect(chartStore.rawBurnData).toEqual(
      state.burnSamples.map((zone: Array<[number, number]>) => zone.map(([time, acres]) => ({ time, acres })))
    );
    expect(chartStore.restoredAnnotations).toEqual(state.annotations);
    expect(chartStore.restoreVersion).toBe(versionBefore + 1);
  });

  it("restores from a frozen state and leaves the graph's samples writable", async () => {
    const { sim: source, chartStore: sourceChart } = await createRunToRestore();
    const state = buildSavedState(source, sourceChart, "Restart");
    const deepFreeze = (o: any): any => {
      Object.values(o).forEach(v => v && typeof v === "object" && deepFreeze(v));
      return Object.freeze(o);
    };
    const chartStore = new ChartStore();

    await applySavedState(await createSim(), chartStore, deepFreeze(state));

    chartStore.rawBurnData[0][0].acres = 5;
    chartStore.rawBurnData[0].push({ time: 3, acres: 1 });
    expect(chartStore.rawBurnData[0]).toHaveLength(4);
  });
});
