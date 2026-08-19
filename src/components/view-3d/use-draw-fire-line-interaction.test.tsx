import { SimulationModel } from "../../models/simulation";
import { UIModel, Interaction } from "../../models/ui";
import { ChartStore } from "../../models/chart-store";
import { IStores } from "../../models/stores";
import { renderFireLineInteraction, terrainPointerEvent } from "./fire-line-interaction-test-helpers";

jest.mock("../../log", () => ({ log: jest.fn() }));

const MODEL_WIDTH = 120000;
const MODEL_HEIGHT = 80000;

const createTestStores = async (): Promise<IStores> => {
  const simulation = new SimulationModel({
    modelWidth: MODEL_WIDTH,
    modelHeight: MODEL_HEIGHT,
    gridWidth: 240,
    sparks: [[60000, 40000]],
    zoneIndex: [[0]],
    elevation: [[0]],
    unburntIslands: [[1]],
    unburntIslandProbability: 1,
    riverData: null
  });
  await simulation.dataReadyPromise;
  const ui = new UIModel();
  ui.interaction = Interaction.DrawFireLine;
  return { simulation, ui, chartStore: new ChartStore() };
};

const point = (x: number, y: number) => terrainPointerEvent(x, y, MODEL_WIDTH);

const markerDistance = (simulation: SimulationModel) => Math.hypot(
  simulation.fireLineMarkers[1].x - simulation.fireLineMarkers[0].x,
  simulation.fireLineMarkers[1].y - simulation.fireLineMarkers[0].y
);

const underConstructionCount = (simulation: SimulationModel) =>
  simulation.cells.filter(c => c.isFireLineUnderConstruction).length;

describe("useDrawFireLineInteraction", () => {
  it("is active only while the fire line tool is armed", async () => {
    const stores = await createTestStores();
    const { result, rerender } = renderFireLineInteraction(stores);
    expect(result.current.active).toBe(true);
    stores.ui.interaction = null;
    rerender();
    expect(result.current.active).toBe(false);
  });

  it("places one end on the first click and stays armed", async () => {
    const stores = await createTestStores();
    const { result } = renderFireLineInteraction(stores);
    result.current.onPointerDown?.(point(20000, 40000));
    expect(stores.ui.fireLinePlacementInProgress).toBe(true);
    expect(stores.ui.interaction).toBe(Interaction.DrawFireLine);
    expect(stores.simulation.fireLineMarkers).toHaveLength(2);
    expect(markerDistance(stores.simulation)).toBe(0);
  });

  it("places the other end on the second click and ends the interaction", async () => {
    const stores = await createTestStores();
    const { result } = renderFireLineInteraction(stores);
    result.current.onPointerDown?.(point(20000, 40000));
    result.current.onPointerDown?.(point(28000, 40000));
    expect(stores.ui.fireLinePlacementInProgress).toBe(false);
    expect(stores.ui.interaction).toBeNull();
    expect(stores.simulation.fireLineMarkers).toHaveLength(2);
    expect(markerDistance(stores.simulation)).toBeCloseTo(8000, 5);
  });

  it("clamps the second endpoint to maxFireLineLength", async () => {
    const stores = await createTestStores();
    const { result } = renderFireLineInteraction(stores);
    result.current.onPointerDown?.(point(1000, 40000));
    result.current.onPointerDown?.(point(100000, 40000));
    expect(markerDistance(stores.simulation)).toBeCloseTo(stores.simulation.config.maxFireLineLength, 5);
  });

  it("clamps the preview between the two clicks", async () => {
    const stores = await createTestStores();
    const { result, rerender } = renderFireLineInteraction(stores);
    result.current.onPointerDown?.(point(1000, 40000));
    rerender();
    result.current.onPointerMove?.(point(100000, 40000));
    expect(markerDistance(stores.simulation)).toBeCloseTo(stores.simulation.config.maxFireLineLength, 5);
    expect(underConstructionCount(stores.simulation)).toBeGreaterThan(0);
  });

  it("wires no pointer-move handler until the first end is placed", async () => {
    const stores = await createTestStores();
    const { result, rerender } = renderFireLineInteraction(stores);
    expect(result.current.onPointerMove).toBeUndefined();
    result.current.onPointerDown?.(point(20000, 40000));
    rerender();
    expect(result.current.onPointerMove).toBeDefined();
  });

  it("ignores a second click closer than the minimum distance and stays armed", async () => {
    const stores = await createTestStores();
    const { result } = renderFireLineInteraction(stores);
    result.current.onPointerDown?.(point(20000, 40000));
    result.current.onPointerDown?.(point(21400, 40000));
    expect(stores.ui.fireLinePlacementInProgress).toBe(true);
    expect(stores.ui.interaction).toBe(Interaction.DrawFireLine);
  });

  it("measures the minimum distance as a radius, not a square", async () => {
    const stores = await createTestStores();
    const { result } = renderFireLineInteraction(stores);
    result.current.onPointerDown?.(point(20000, 40000));
    // 1400 ft on each axis is 1980 ft apart: rejected by the old per-axis test, accepted here.
    result.current.onPointerDown?.(point(21400, 41400));
    expect(stores.ui.interaction).toBeNull();
    expect(markerDistance(stores.simulation)).toBeCloseTo(Math.hypot(1400, 1400), 5);
  });

  it("starts a new placement rather than throwing when the markers were cleared underneath it", async () => {
    const stores = await createTestStores();
    const { result } = renderFireLineInteraction(stores);
    result.current.onPointerDown?.(point(20000, 40000));
    stores.simulation.fireLineMarkers.length = 0;
    expect(() => result.current.onPointerDown?.(point(40000, 40000))).not.toThrow();
    expect(stores.simulation.fireLineMarkers).toHaveLength(2);
    expect(stores.ui.interaction).toBe(Interaction.DrawFireLine);
  });
});
