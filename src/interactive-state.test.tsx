import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "mobx-react";
import { Vector2 } from "three";
import {
  flushStateUpdates, getInitInteractiveMessage, inIframe, setInteractiveState
} from "@concord-consortium/lara-interactive-api";
import { initInteractiveState, logSimulationEnded } from "./interactive-state";
import { SimulationModel } from "./models/simulation";
import { ChartStore } from "./models/chart-store";
import { Interaction, UIModel } from "./models/ui";
import { FireState } from "./models/cell";
import { IStores, createStores } from "./models/stores";
import { buildSavedState } from "./models/saved-state";
import { BottomBar } from "./components/bottom-bar";
import { TopBar } from "./components/top-bar/top-bar";
import { DroughtLevel, TerrainType, Vegetation } from "./types";

jest.mock("@concord-consortium/lara-interactive-api", () => ({
  log: jest.fn(),
  inIframe: jest.fn(),
  getInitInteractiveMessage: jest.fn(),
  setInteractiveState: jest.fn(),
  flushStateUpdates: jest.fn()
}));

const mockInIframe = inIframe as jest.Mock;
const mockGetInit = getInitInteractiveMessage as jest.Mock;
const mockSetState = setInteractiveState as jest.Mock;
const mockFlush = flushStateUpdates as jest.Mock;

const createTestStores = async (): Promise<IStores> => {
  const simulation = new SimulationModel({
    modelWidth: 120000,
    modelHeight: 80000,
    gridWidth: 60,
    sparks: [[30000, 40000], [90000, 40000]],
    zones: [
      { terrainType: TerrainType.Plains, vegetation: Vegetation.Grass, droughtLevel: DroughtLevel.MildDrought },
      { terrainType: TerrainType.Plains, vegetation: Vegetation.Shrub, droughtLevel: DroughtLevel.MediumDrought }
    ],
    elevation: [[0]],
    unburntIslands: [[0]],
    riverData: null
  });
  await simulation.dataReadyPromise;
  return { simulation, chartStore: new ChartStore(), ui: new UIModel() };
};

const createSavedState = async () => {
  const stores = await createTestStores();
  const { simulation } = stores;
  simulation.simulationStarted = true;
  simulation.time = 300;
  simulation.zones[0].vegetation = Vegetation.Forest;
  simulation.cells[100].fireState = FireState.Burnt;
  return JSON.parse(JSON.stringify(buildSavedState(stores, "ByItself")));
};

const savedReasons = () => mockSetState.mock.calls.map(([state]) => state.endReason);

const expectFlushedAfterEachSave = () => {
  expect(mockFlush).toHaveBeenCalledTimes(mockSetState.mock.calls.length);
  mockSetState.mock.invocationCallOrder.forEach((order, i) => {
    expect(mockFlush.mock.invocationCallOrder[i]).toBeGreaterThan(order);
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockInIframe.mockReturnValue(true);
  mockGetInit.mockReturnValue(new Promise(() => undefined));
});

describe("initInteractiveState", () => {
  it("does nothing standalone and never waits for an init message", async () => {
    mockInIframe.mockReturnValue(false);
    const stores = await createTestStores();
    await initInteractiveState(stores);
    expect(mockGetInit).not.toHaveBeenCalled();
    expect(stores.ui.readOnly).toBe(false);
  });

  it("leaves the model fresh in runtime mode and keeps saving", async () => {
    const stores = await createTestStores();
    mockGetInit.mockResolvedValue({ mode: "runtime", interactiveState: await createSavedState() });

    await initInteractiveState(stores);

    expect(stores.ui.readOnly).toBe(false);
    expect(stores.simulation.simulationStarted).toBe(false);
    expect(stores.simulation.time).toBe(0);
    expect(stores.simulation.zones[0].vegetation).toBe(Vegetation.Grass);

    stores.simulation.simulationStarted = true;
    logSimulationEnded(stores, "SimulationRestarted");
    expect(savedReasons()).toEqual(["SimulationRestarted"]);
  });

  it("draws a valid saved run read-only in report mode", async () => {
    const stores = await createTestStores();
    mockGetInit.mockResolvedValue({ mode: "report", interactiveState: await createSavedState() });

    await initInteractiveState(stores);

    expect(stores.ui.readOnly).toBe(true);
    expect(stores.simulation.simulationEnded).toBe(true);
    expect(stores.simulation.time).toBe(300);
    expect(stores.simulation.zones[0].vegetation).toBe(Vegetation.Forest);
    expect(stores.simulation.cells[100].fireState).toBe(FireState.Burnt);
  });

  it("ignores an invalid saved run in report mode, with the reason on the console", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const stores = await createTestStores();
    const state = await createSavedState();
    mockGetInit.mockResolvedValue({ mode: "report", interactiveState: { ...state, identity: { ...state.identity, preset: "other" } } });

    await initInteractiveState(stores);

    expect(stores.ui.readOnly).toBe(true);
    expect(stores.simulation.simulationStarted).toBe(false);
    expect(stores.simulation.zones[0].vegetation).toBe(Vegetation.Grass);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/preset "other"/));
    warn.mockRestore();
  });

  it("resets to a fresh model when a valid-looking run cannot be drawn", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const stores = await createTestStores();
    const state = await createSavedState();
    state.setup.helitackDrops = [{ x: 60000, y: 40000, time: 10 }];
    jest.spyOn(stores.simulation, "setHelitackPoint").mockImplementation(() => { throw new Error("replay failed"); });
    mockGetInit.mockResolvedValue({ mode: "report", interactiveState: state });

    await initInteractiveState(stores);

    expect(warn).toHaveBeenCalledWith("Wildfire could not draw the saved state", expect.anything());
    expect(stores.simulation.simulationStarted).toBe(false);
    expect(stores.simulation.restoredRunEnded).toBe(false);
    warn.mockRestore();
  });

  it("draws a run with a helitack drop on the front edge of the map", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const stores = await createTestStores();
    const state = await createSavedState();
    state.setup.helitackDrops = [{ x: 60000, y: 0, time: 10 }];
    mockGetInit.mockResolvedValue({ mode: "report", interactiveState: state });

    await initInteractiveState(stores);

    expect(warn).not.toHaveBeenCalled();
    expect(stores.simulation.restoredRunEnded).toBe(true);
    expect(stores.simulation.cells[100].fireState).toBe(FireState.Burnt);
    warn.mockRestore();
  });

  it("undoes anything opened or started before a report-mode init message arrives", async () => {
    const stores = await createTestStores();
    stores.ui.showTerrainUI = true;
    stores.ui.interaction = Interaction.PlaceSpark;
    stores.simulation.start();
    expect(stores.simulation.simulationStarted).toBe(true);
    mockGetInit.mockResolvedValue({ mode: "report", interactiveState: undefined });

    await initInteractiveState(stores);

    expect(stores.ui.readOnly).toBe(true);
    expect(stores.ui.showTerrainUI).toBe(false);
    expect(stores.ui.interaction).toBeNull();
    expect(stores.simulation.simulationStarted).toBe(false);
    expect(stores.simulation.simulationRunning).toBe(false);
  });

  it("never saves in report mode", async () => {
    const stores = await createTestStores();
    mockGetInit.mockResolvedValue({ mode: "report", interactiveState: await createSavedState() });
    await initInteractiveState(stores);

    stores.simulation.simulationEndedLogged = false;
    logSimulationEnded(stores, "SimulationRestarted");
    expect(mockSetState).not.toHaveBeenCalled();
    expect(stores.ui.lastSavedState).toBeUndefined();
  });
});

describe("logSimulationEnded", () => {
  it("saves a run's first end, sent at once", async () => {
    const stores = await createTestStores();
    stores.simulation.simulationStarted = true;
    logSimulationEnded(stores, "ByItself");
    expect(savedReasons()).toEqual(["ByItself"]);
    expectFlushedAfterEachSave();
  });

  it.each(["SimulationRestarted", "SimulationReloaded", "TopBarReloadButtonClicked"])(
    "saves a burned-out run once when %s follows", async (reason) => {
      const stores = await createTestStores();
      stores.simulation.simulationStarted = true;
      logSimulationEnded(stores, "ByItself");
      logSimulationEnded(stores, reason);
      expect(savedReasons()).toEqual(["ByItself"]);
    }
  );

  describe("the graph's last hourly sample", () => {
    const endedOnHour = async (samples: Array<Array<{ time: number; acres: number }>>) => {
      const stores = await createTestStores();
      const { simulation, chartStore } = stores;
      simulation.simulationStarted = true;
      simulation.time = 130;
      (simulation as any).engine = { fireDidStop: true, burnedCellsInZone: { 0: 12, 1: 0 } };
      chartStore.rawBurnData = samples;
      return stores;
    };
    const savedSamples = () => mockSetState.mock.calls[0][0].burnSamples;

    it("is recorded for an hour the run ended in before the graph sampled it", async () => {
      const stores = await endedOnHour([[{ time: 0, acres: 0 }, { time: 1, acres: 0.5 }], [{ time: 0, acres: 0 }, { time: 1, acres: 0 }]]);
      const acres = stores.simulation.getZoneBurnedThousandAcres(0);
      expect(acres).toBeGreaterThan(0.5);

      logSimulationEnded(stores, "ByItself");

      expect(savedSamples()[0]).toEqual([[0, 0], [1, 0.5], [2, Math.round(acres * 10000) / 10000]]);
      expect(savedSamples()[1]).toEqual([[0, 0], [1, 0], [2, 0]]);
      expect(mockSetState.mock.calls[0][0].outcome.zones[0].burnRates).toHaveLength(2);
    });

    it("is left alone when the graph already sampled the hour", async () => {
      const stores = await endedOnHour([[{ time: 0, acres: 0 }, { time: 2, acres: 0.25 }], [{ time: 0, acres: 0 }, { time: 2, acres: 0 }]]);
      logSimulationEnded(stores, "ByItself");
      expect(savedSamples()[0]).toEqual([[0, 0], [2, 0.25]]);
    });
  });

  it("saves nothing for a model that was never run", async () => {
    const stores = await createTestStores();
    logSimulationEnded(stores, "TopBarReloadButtonClicked");
    expect(mockSetState).not.toHaveBeenCalled();
  });

  it("saves nothing standalone", async () => {
    mockInIframe.mockReturnValue(false);
    const stores = await createTestStores();
    stores.simulation.simulationStarted = true;
    logSimulationEnded(stores, "ByItself");
    expect(mockSetState).not.toHaveBeenCalled();
    expect(stores.ui.lastSavedState).toBeUndefined();
  });

  it("keeps the state it sent", async () => {
    const stores = await createTestStores();
    stores.simulation.simulationStarted = true;
    logSimulationEnded(stores, "ByItself");
    expect(mockSetState).toHaveBeenCalledTimes(1);
    expect(stores.ui.lastSavedState).toBe(mockSetState.mock.calls[0][0]);
  });

  it("saves the next run again after a Restart", async () => {
    const stores = await createTestStores();
    stores.simulation.simulationStarted = true;
    logSimulationEnded(stores, "ByItself");
    logSimulationEnded(stores, "SimulationRestarted");
    stores.simulation.restart();
    stores.simulation.start();
    stores.simulation.stop();
    logSimulationEnded(stores, "SimulationRestarted");
    expect(savedReasons()).toEqual(["ByItself", "SimulationRestarted"]);
  });
});

describe("the run-end controls", () => {
  const mountWithStores = (ui: React.ReactElement) => {
    const stores = createStores();
    render(<Provider stores={stores}>{ui}</Provider>);
    return stores;
  };

  it("Restart saves the run it ends", async () => {
    const stores = mountWithStores(<BottomBar />);
    stores.simulation.simulationStarted = true;
    await userEvent.click(screen.getByTestId("restart-button"));
    expect(savedReasons()).toEqual(["SimulationRestarted"]);
    expectFlushedAfterEachSave();
  });

  it("Clear All saves the run it clears", async () => {
    const stores = mountWithStores(<BottomBar />);
    stores.simulation.sparks.push(new Vector2(50000, 50000));
    stores.simulation.simulationStarted = true;
    await userEvent.click(screen.getByTestId("clear-all-button"));
    expect(savedReasons()).toEqual(["SimulationReloaded"]);
    expectFlushedAfterEachSave();
  });

  it("the top bar's reload saves the run before the page reloads", async () => {
    const reload = jest.fn(() => {
      expect(savedReasons()).toEqual(["TopBarReloadButtonClicked"]);
      expectFlushedAfterEachSave();
    });
    Object.defineProperty(window, "location", { writable: true, value: { reload } });
    const stores = mountWithStores(<TopBar projectName="Test" />);
    stores.simulation.simulationStarted = true;
    await userEvent.click(screen.getByTestId("reload"));
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(reload).toHaveBeenCalled();
  });
});
