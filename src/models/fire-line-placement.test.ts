import { SimulationModel } from "./simulation";
import { Interaction, UIModel } from "./ui";
import { cancelFireLinePlacement } from "./fire-line-placement";
import { log } from "../log";

jest.mock("../log", () => ({ log: jest.fn() }));

const mockLog = log as jest.Mock;

const MODEL_WIDTH = 120000;
const MODEL_HEIGHT = 80000;

const createSimulation = async () => {
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
  return simulation;
};

// Reproduces the state the first click of a two-click placement leaves behind.
const startPlacement = (simulation: SimulationModel, ui: UIModel, x: number, y: number) => {
  ui.interaction = Interaction.DrawFireLine;
  simulation.addFireLineMarker(x, y);
  simulation.addFireLineMarker(x, y);
  ui.fireLinePlacementInProgress = true;
  simulation.setFireLineMarker(1, x + 8000, y);
};

const underConstructionCount = (simulation: SimulationModel) =>
  simulation.cells.filter(c => c.isFireLineUnderConstruction).length;

describe("cancelFireLinePlacement", () => {
  beforeEach(() => mockLog.mockClear());

  it("clears the markers, the preview and the armed tool", async () => {
    const simulation = await createSimulation();
    const ui = new UIModel();
    startPlacement(simulation, ui, 20000, 40000);
    expect(underConstructionCount(simulation)).toBeGreaterThan(0);

    cancelFireLinePlacement(simulation, ui, "escape");

    expect(simulation.fireLineMarkers).toHaveLength(0);
    expect(underConstructionCount(simulation)).toBe(0);
    expect(ui.fireLinePlacementInProgress).toBe(false);
    expect(ui.interaction).toBeNull();
  });

  it("logs the discarded endpoint with normalized coordinates", async () => {
    const simulation = await createSimulation();
    const ui = new UIModel();
    startPlacement(simulation, ui, 20000, 40000);

    cancelFireLinePlacement(simulation, ui, "escape");

    expect(mockLog).toHaveBeenCalledWith("FireLineCanceled", expect.objectContaining({
      reason: "escape",
      x: 20000 / MODEL_WIDTH,
      y: 40000 / MODEL_HEIGHT
    }));
    expect(mockLog.mock.calls[0][1]).toHaveProperty("elevation");
  });

  it("still logs, without coordinates, when the tool was armed but nothing was placed", async () => {
    const simulation = await createSimulation();
    const ui = new UIModel();
    ui.interaction = Interaction.DrawFireLine;

    cancelFireLinePlacement(simulation, ui, "toggle");

    expect(ui.interaction).toBeNull();
    expect(mockLog).toHaveBeenCalledWith("FireLineCanceled", { reason: "toggle" });
  });

  it("does nothing when the tool is not armed and no placement is open", async () => {
    const simulation = await createSimulation();
    const ui = new UIModel();
    ui.interaction = Interaction.Helitack;

    cancelFireLinePlacement(simulation, ui, "toolSwitch");

    expect(ui.interaction).toBe(Interaction.Helitack);
    expect(mockLog).not.toHaveBeenCalled();
  });

  it("leaves an interaction another writer already switched to alone", async () => {
    const simulation = await createSimulation();
    const ui = new UIModel();
    startPlacement(simulation, ui, 20000, 40000);
    ui.interaction = Interaction.Helitack;

    cancelFireLinePlacement(simulation, ui, "other");

    expect(ui.interaction).toBe(Interaction.Helitack);
    expect(simulation.fireLineMarkers).toHaveLength(0);
    expect(underConstructionCount(simulation)).toBe(0);
  });

  it("recovers when the markers were cleared without the flag", async () => {
    const simulation = await createSimulation();
    const ui = new UIModel();
    startPlacement(simulation, ui, 20000, 40000);
    simulation.fireLineMarkers.length = 0;

    expect(() => cancelFireLinePlacement(simulation, ui, "other")).not.toThrow();
    expect(ui.fireLinePlacementInProgress).toBe(false);
    expect(mockLog).toHaveBeenCalledWith("FireLineCanceled", { reason: "other" });
  });
});
