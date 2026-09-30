import React from "react";
import { act, render } from "@testing-library/react";
import { Provider } from "mobx-react";
import { Graph } from "./graph";
import { SimulationModel } from "../models/simulation";
import { ChartStore } from "../models/chart-store";
import { UIModel } from "../models/ui";
import { FireState } from "../models/cell";
import { Annotation } from "../charts/models/chart-annotation";
import { FIRE_LINE_EVENT, HELITACK_EVENT } from "../charts/components/annotation-icons";
import { applySavedState, buildSavedState, ISavedRunState } from "../models/saved-state";
import { DroughtLevel, TerrainType, Vegetation } from "../types";

jest.mock("../charts/components/chart", () => ({ Chart: () => null }));

const createSim = async () => {
  const sim = new SimulationModel({
    modelWidth: 120000,
    modelHeight: 80000,
    gridWidth: 60,
    sparks: [[30000, 40000], [90000, 40000]],
    zones: [
      { terrainType: TerrainType.Plains, vegetation: Vegetation.Grass, droughtLevel: DroughtLevel.MildDrought },
      { terrainType: TerrainType.Foothills, vegetation: Vegetation.Forest, droughtLevel: DroughtLevel.SevereDrought }
    ],
    elevation: [[0]],
    unburntIslands: [[0]],
    riverData: null
  });
  await sim.dataReadyPromise;
  return sim;
};

const createSavedState = async (): Promise<ISavedRunState> => {
  const sim = await createSim();
  const chartStore = new ChartStore();
  sim.simulationStarted = true;
  sim.time = 190;
  sim.cells[1000].fireState = FireState.Burnt;
  chartStore.rawBurnData = [
    [{ time: 0, acres: 0 }, { time: 1, acres: 1.2 }, { time: 2, acres: 3.5 }, { time: 3, acres: 4.1 }],
    [{ time: 0, acres: 0 }, { time: 1, acres: 0.4 }, { time: 2, acres: 7 }, { time: 3, acres: 9.9 }]
  ];
  chartStore.chart.addAnnotation(new Annotation({ type: "verticalLine", value: 2, eventKind: HELITACK_EVENT, actionOrder: 2 }));
  chartStore.chart.addAnnotation(new Annotation({ type: "verticalLine", value: 2, eventKind: FIRE_LINE_EVENT, actionOrder: 1 }));
  return JSON.parse(JSON.stringify(buildSavedState({ simulation: sim, chartStore, ui: new UIModel() }, "ByItself")));
};

const mountGraph = async () => {
  const stores = { simulation: await createSim(), chartStore: new ChartStore(), ui: new UIModel() };
  render(
    <Provider stores={stores}>
      <Graph />
    </Provider>
  );
  return stores;
};

describe("Graph", () => {
  describe("after a restore", () => {
    const restore = async () => {
      const state = await createSavedState();
      const stores = await mountGraph();
      await act(async () => {
        await applySavedState(stores, state);
      });
      return { ...stores, state };
    };

    const expectSavedGraph = (chartStore: ChartStore) => {
      const { dataSets, annotations } = chartStore.chart;
      expect(dataSets).toHaveLength(2);
      expect(dataSets[0].dataPoints.map(p => [p.a1, p.a2])).toEqual([[0, 0], [1, 2], [2, 4], [3, 5]]);
      expect(dataSets[1].dataPoints.map(p => [p.a1, p.a2])).toEqual([[0, 0], [1, 1], [2, 7], [3, 10]]);
      expect(annotations?.map(a => [a.eventKind, a.value, a.actionOrder, a.dashArray])).toEqual([
        [HELITACK_EVENT, 2, 2, [10, 5]],
        [FIRE_LINE_EVENT, 2, 1, [5, 5]]
      ]);
    };

    it("shows one dataset per zone with the saved points, and the saved markers", async () => {
      const { chartStore } = await restore();
      expectSavedGraph(chartStore);
      expect(chartStore.chart.dataSets.map(ds => ds.name)).toEqual(["Zone 1", "Zone 2"]);
      expect(chartStore.chart.dataSets[1].dashStyle).toEqual([5, 5]);
    });

    it("keeps the saved graph through later dataReady, hour and intervention changes", async () => {
      const { simulation, chartStore } = await restore();
      await act(async () => {
        simulation.dataReady = false;
      });
      await act(async () => {
        simulation.dataReady = true;
      });
      await act(async () => {
        simulation.time += 60;
      });
      await act(async () => {
        simulation.lastFireLineTimestamp = simulation.time;
        simulation.lastHelitackTimestamp = simulation.time;
      });
      expectSavedGraph(chartStore);
      expect(chartStore.rawBurnData[1][3]).toEqual({ time: 3, acres: 9.9 });
    });
  });

  it("shows all of a restored run's data when the student had switched to it", async () => {
    const state = await createSavedState();
    state.view = { vegetationKey: false, graphOpen: true, graphShowsAllData: true };
    const stores = await mountGraph();
    await act(async () => {
      await applySavedState(stores, state);
    });
    expect(stores.chartStore.chart.dataSets.map(ds => ds.maxPoints)).toEqual([-1, -1]);
    expect(stores.chartStore.chart.maxPoints).toBe(-1);
  });

  describe("during a live run", () => {
    it("draws the zone datasets and adds a marker at the current hour", async () => {
      const { simulation, chartStore } = await mountGraph();
      await act(async () => {
        simulation.time = 120;
      });
      await act(async () => {
        simulation.setHelitackPoint(60000, 40000);
      });
      expect(chartStore.chart.dataSets.map(ds => ds.name)).toEqual(["Zone 1", "Zone 2"]);
      expect(chartStore.chart.annotations?.map(a => [a.eventKind, a.value, a.dashArray, a.thickness])).toEqual([
        [HELITACK_EVENT, 2, [10, 5], 1]
      ]);
    });
  });
});
