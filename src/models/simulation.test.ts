import { getGridCellNeighbors, nonburnableCellBetween, SimulationModel, withinDist } from "./simulation";
import { BurnIndex, Cell } from "./cell";

describe("nonburnableCellBetween", () => {
  it("returns true if there's any nonburnable cell between two points", () => {
    const burnable = (bi: BurnIndex) => true;
    const nonburnable = (bi: BurnIndex) => false;
    const cells = [
      {isBurnableForBI: burnable}, {isBurnableForBI: burnable}, {isBurnableForBI: burnable}, {isBurnableForBI: burnable},
      {isBurnableForBI: burnable}, {isBurnableForBI: burnable}, {isBurnableForBI: burnable}, {isBurnableForBI: burnable},
      {isBurnableForBI: burnable}, {isBurnableForBI: nonburnable}, {isBurnableForBI: nonburnable}, {isBurnableForBI: nonburnable},
      {isBurnableForBI: burnable}, {isBurnableForBI: burnable}, {isBurnableForBI: burnable}, {isBurnableForBI: burnable},
    ] as Cell[];
    expect(nonburnableCellBetween(cells, 4, 0, 0, 0, 3, BurnIndex.Low)).toEqual(false);
    expect(nonburnableCellBetween(cells, 4, 0, 0, 0, 3, BurnIndex.Low)).toEqual(false);

    expect(nonburnableCellBetween(cells, 4, 1, 0, 0, 3, BurnIndex.Low)).toEqual(false);
    expect(nonburnableCellBetween(cells, 4, 1, 1, 0, 2, BurnIndex.Low)).toEqual(false);
    expect(nonburnableCellBetween(cells, 4, 1, 1, 0, 3, BurnIndex.Low)).toEqual(true);

    expect(nonburnableCellBetween(cells, 4, 1, 0, 1, 2, BurnIndex.Low)).toEqual(true);
    expect(nonburnableCellBetween(cells, 4, 1, 0, 1, 3, BurnIndex.Low)).toEqual(true);

    expect(nonburnableCellBetween(cells, 4, 1, 0, 2, 2, BurnIndex.Low)).toEqual(true);
    expect(nonburnableCellBetween(cells, 4, 1, 0, 2, 3, BurnIndex.Low)).toEqual(true);
  });
});

describe("withinDist", () => {
  it("returns true if dist between point is less or equal than specified max", () => {
    expect(withinDist(0, 1, 0, 2, 1)).toEqual(true);
    expect(withinDist(0, 1, 0, 2, 0.9)).toEqual(false);
    expect(withinDist(0, 0, 1, 1, Math.sqrt(2))).toEqual(true);
    expect(withinDist(0, 0, 1, 1, Math.sqrt(1.99))).toEqual(false);
  });
});

describe("getGridCellNeighbors", () => {
  it("returns array of neighbours without cells that are nonburnable, or lay behind them", () => {
    const burnable = (bi: BurnIndex) => true;
    const nonburnable = (bi: BurnIndex) => false;
    const cells = [
      {isBurnableForBI: burnable}, {isBurnableForBI: burnable}, {isBurnableForBI: burnable}, {isBurnableForBI: burnable},
      {isBurnableForBI: burnable}, {isBurnableForBI: burnable}, {isBurnableForBI: burnable}, {isBurnableForBI: burnable},
      {isBurnableForBI: burnable}, {isBurnableForBI: nonburnable}, {isBurnableForBI: nonburnable}, {isBurnableForBI: nonburnable},
      {isBurnableForBI: burnable}, {isBurnableForBI: burnable}, {isBurnableForBI: burnable}, {isBurnableForBI: burnable},
    ] as Cell[];
    expect(getGridCellNeighbors(cells, 0, 4, 4, 1.5, BurnIndex.Low).sort()).toEqual([1, 4, 5]);
    expect(getGridCellNeighbors(cells, 5, 4, 4, 1.5, BurnIndex.Low).sort()).toEqual([0, 1, 2, 4, 6, 8]);
    expect(getGridCellNeighbors(cells, 5, 4, 4, 2.5, BurnIndex.Low).sort()).toEqual([0, 1, 12, 2, 3, 4, 6, 7, 8]);
    expect(getGridCellNeighbors(cells, 14, 4, 4, 2.5, BurnIndex.Low).sort()).toEqual([12, 13, 15]);
    expect(getGridCellNeighbors(cells, 15, 4, 4, 2.5, BurnIndex.Low).sort()).toEqual([13, 14]);
  });
});

describe("SimulationModel", () => {
  it("should stop low intensity fire after 5 days (or earlier but it's random)", async () => {
    const sim = new SimulationModel({
      modelWidth: 100000,
      modelHeight: 100000,
      gridWidth: 5,
      sparks: [ [50000, 50000] ],
      zoneIndex: [[0]],
      elevation: [[0]],
      unburntIslands: [[0]],
      riverData: null
    });
    await sim.dataReadyPromise;
    expect(sim.endOfLowIntensityFire).toBe(false);
    sim.tick(1440 * 5); // 5 days in minutes
    expect(sim.endOfLowIntensityFire).toBe(true);
  });

  it("should stop when nothing is burning anymore", async () => {
    const sim = new SimulationModel({
      modelWidth: 100000,
      modelHeight: 100000,
      gridWidth: 5,
      sparks: [ [50000, 50000] ],
      zoneIndex: [[0]],
      elevation: [[0]],
      unburntIslands: [[0]],
      riverData: null
    });
    await sim.dataReadyPromise;
    sim.simulationRunning = true;
    sim.tick(1440 * 5);
    expect(sim.cells.filter(c => c.isBurningOrWillBurn).length).toBeGreaterThan(0);
    sim.tick(1440);
    sim.tick(1440);
    expect(sim.cells.filter(c => c.isBurningOrWillBurn).length).toEqual(0);
    expect(sim.simulationRunning).toBe(false);
  });

  it("should mark unburnt islands cell and remove this flag from cells are directly under the spark", async () => {
    const sim = new SimulationModel({
      modelWidth: 100000,
      modelHeight: 100000,
      gridWidth: 5,
      sparks: [ [50000, 50000] ],
      zoneIndex: [[0]],
      elevation: [[0]],
      unburntIslands: [[1]],
      unburntIslandProbability: 1,
      riverData: null,
    });
    await sim.dataReadyPromise;
    sim.cells.forEach(c => expect(c.isUnburntIsland).toEqual(true));
    expect(sim.cells.filter(c => c.isBurningOrWillBurn).length).toEqual(0);
    sim.tick(1440);
    sim.cells.forEach(c => expect(c.isUnburntIsland).toEqual(false));
    expect(sim.cells.filter(c => c.isBurningOrWillBurn).length).toBeGreaterThan(0);
  });

  it("should let user add fire line after model reset", async () => {
    const sim = new SimulationModel({
      modelWidth: 100000,
      modelHeight: 100000,
      gridWidth: 5,
      sparks: [ [50000, 50000] ],
      zoneIndex: [[0]],
      elevation: [[0]],
      unburntIslands: [[1]],
      unburntIslandProbability: 1,
      riverData: null,
    });
    await sim.dataReadyPromise;
    expect(sim.canAddFireLineMarker()).toEqual(true);
    expect(sim.buildFireLine({x: 0, y: 50000}, {x: 50000, y: 50000}));
    expect(sim.canAddFireLineMarker()).toEqual(false);
    sim.restart();
    expect(sim.canAddFireLineMarker()).toEqual(true);
  });
});
