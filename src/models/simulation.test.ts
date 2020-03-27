import { SimulationModel } from "./simulation";

describe("SimulationModel", () => {
  it("should let user add fire line after model reset", async () => {
    const sim = new SimulationModel({
      modelWidth: 100000,
      modelHeight: 100000,
      gridWidth: 5,
      gridHeight: 5,
      cellSize: 20000,
      sparks: [ [50000, 50000] ],
      zoneIndex: [[0]],
      elevation: [[0]],
      unburntIslands: [[1]],
      unburntIslandProbability: 1,
      riverData: null,
    });
    await sim.dataReadyPromise;
    expect(sim.canAddFireLineMarker).toEqual(true);
    expect(sim.buildFireLine({x: 0, y: 50000}, {x: 50000, y: 50000}));
    expect(sim.canAddFireLineMarker).toEqual(false);
    sim.restart();
    expect(sim.canAddFireLineMarker).toEqual(true);
  });

  it("should report constant totalCellCountByZone values after model reload", async () => {
    const sim = new SimulationModel({
      modelWidth: 100000,
      modelHeight: 100000,
      gridWidth: 5,
      gridHeight: 5,
      cellSize: 20000,
      sparks: [ [50000, 50000] ],
      zoneIndex: [[0]],
      elevation: [[0]],
      unburntIslands: [[1]],
      unburntIslandProbability: 1,
      riverData: null,
    });
    await sim.dataReadyPromise;
    expect(sim.totalCellCountByZone[0]).toEqual(25);
    sim.reload();
    await sim.dataReadyPromise;
    expect(sim.totalCellCountByZone[0]).toEqual(25);
  });
});
