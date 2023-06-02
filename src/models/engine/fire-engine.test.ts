import { BurnIndex, Cell, FireState } from "../cell";
import { FireEngine, getGridCellNeighbors, nonburnableCellBetween } from "./fire-engine";
import { Vector2 } from "three";
import { Zone } from "../zone";
import { Vegetation } from "../../types";

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

describe("FireEngine", () => {
  const config = {
    cellSize: 20000,
    gridWidth: 5,
    gridHeight: 5,
    minCellBurnTime: 200,
    neighborsDist: 2.5,
    fireSurvivalProbability: 1 // so there's no randomness in the test
  };
  const wind = { speed: 0, direction: 0 };
  const sparks = [new Vector2(50000, 50000)];
  const defaultZone = new Zone({});
  const generateCells = (zone = defaultZone) => {
    const res = [];
    for (let x = 0; x < config.gridWidth; x += 1) {
      for (let y = 0; y < config.gridWidth; y += 1) {
        res.push(new Cell({ x, y, zone }));
      }
    }
    return res;
  };

  it("should stop low intensity fire after 5 days (or earlier but it's random)", () => {
    const engine = new FireEngine(generateCells(), wind, sparks, config);
    expect(engine.endOfLowIntensityFire).toBe(false);
    engine.updateFire(1440 * 5); // 5 days in minutes
    expect(engine.endOfLowIntensityFire).toBe(true);
  });

  it("should detect when nothing is burning anymore", () => {
    const engine = new FireEngine(generateCells(), wind, sparks, config);
    engine.updateFire(1440 * 5);
    expect(engine.fireDidStop).toBe(false);
    expect(engine.cells.filter(c => c.isBurningOrWillBurn).length).toBeGreaterThan(0);
    engine.updateFire(1440 * 6);
    engine.updateFire(1440 * 7);
    expect(engine.cells.filter(c => c.isBurningOrWillBurn).length).toEqual(0);
    expect(engine.fireDidStop).toBe(true);
  });

  it("should mark unburnt islands cell and remove this flag from cells are directly under the spark", () => {
    const generateCellsWithUnburntIsland = () => {
      const res = [];
      for (let x = 0; x < config.gridWidth; x += 1) {
        for (let y = 0; y < config.gridWidth; y += 1) {
          res.push(new Cell({ x, y, zone: defaultZone, isUnburntIsland: true }));
        }
      }
      return res;
    };
    const cells = generateCellsWithUnburntIsland();
    cells.forEach(c => expect(c.isUnburntIsland).toEqual(true));
    const engine = new FireEngine(cells, wind, sparks, config);
    engine.cells.forEach(c => expect(c.isUnburntIsland).toEqual(false));
    engine.updateFire(1440);
    expect(engine.cells.filter(c => c.isBurningOrWillBurn).length).toBeGreaterThan(0);
  });


  describe("fire survivors", () => {
    const testVegetationAndGetNumberOfFireSurvivors = (vegetation: Vegetation) => {
      const zone = new Zone({ vegetation });
      const engine = new FireEngine(generateCells(zone), wind, sparks, config);
      expect(engine.cells.filter(c => c.isFireSurvivor).length).toEqual(0);
      engine.updateFire(1440);
      engine.updateFire(1440);
      expect(engine.cells.filter(c => c.fireState === FireState.Burnt).length).toBeGreaterThan(0);
      return engine.cells.filter(c => c.isFireSurvivor).length;
    };

    it("should not mark any grass cells as fire survivors", () => {
      expect(testVegetationAndGetNumberOfFireSurvivors(Vegetation.Grass)).toEqual(0);
    });

    it("should not mark any shrub cells as fire survivors", () => {
      expect(testVegetationAndGetNumberOfFireSurvivors(Vegetation.Shrub)).toEqual(0);
    });

    it("should mark some forest cells as fire survivors", () => {
      expect(testVegetationAndGetNumberOfFireSurvivors(Vegetation.Forest)).toBeGreaterThan(0);
    });

    it("should not mark any forest with suppression cells as fire survivors", () => {
      expect(testVegetationAndGetNumberOfFireSurvivors(Vegetation.ForestWithSuppression)).toEqual(0);
    });
  });
});
