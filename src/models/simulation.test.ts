import { getGridCellNeighbors, riverOrFireLineBetween, withinDist } from "./simulation";
import { Cell } from "./cell";

describe("riverOrFileLineBetween", () => {
  it("returns true if there's any river or fire line between two points", () => {
    const cells = [
      {isRiverOrFireLine: false}, {isRiverOrFireLine: false}, {isRiverOrFireLine: false}, {isRiverOrFireLine: false},
      {isRiverOrFireLine: false}, {isRiverOrFireLine: false}, {isRiverOrFireLine: false}, {isRiverOrFireLine: false},
      {isRiverOrFireLine: false}, {isRiverOrFireLine: true}, {isRiverOrFireLine: true}, {isRiverOrFireLine: true},
      {isRiverOrFireLine: false}, {isRiverOrFireLine: false}, {isRiverOrFireLine: false}, {isRiverOrFireLine: false},
    ] as Cell[];
    expect(riverOrFireLineBetween(cells, 4, 0, 0, 0, 3)).toEqual(false);
    expect(riverOrFireLineBetween(cells, 4, 0, 0, 0, 3)).toEqual(false);

    expect(riverOrFireLineBetween(cells, 4, 1, 0, 0, 3)).toEqual(false);
    expect(riverOrFireLineBetween(cells, 4, 1, 1, 0, 2)).toEqual(false);
    expect(riverOrFireLineBetween(cells, 4, 1, 1, 0, 3)).toEqual(true);

    expect(riverOrFireLineBetween(cells, 4, 1, 0, 1, 2)).toEqual(true);
    expect(riverOrFireLineBetween(cells, 4, 1, 0, 1, 3)).toEqual(true);

    expect(riverOrFireLineBetween(cells, 4, 1, 0, 2, 2)).toEqual(true);
    expect(riverOrFireLineBetween(cells, 4, 1, 0, 2, 3)).toEqual(true);
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
  it("returns array of neighbours without cells that are rivers, fire lines, or lay behind them", () => {
    const cells = [
      {isRiverOrFireLine: false}, {isRiverOrFireLine: false}, {isRiverOrFireLine: false}, {isRiverOrFireLine: false},
      {isRiverOrFireLine: false}, {isRiverOrFireLine: false}, {isRiverOrFireLine: false}, {isRiverOrFireLine: false},
      {isRiverOrFireLine: false}, {isRiverOrFireLine: true}, {isRiverOrFireLine: true}, {isRiverOrFireLine: true},
      {isRiverOrFireLine: false}, {isRiverOrFireLine: false}, {isRiverOrFireLine: false}, {isRiverOrFireLine: false},
    ] as Cell[];
    expect(getGridCellNeighbors(cells, 0, 4, 4, 1.5).sort()).toEqual([1, 4, 5]);
    expect(getGridCellNeighbors(cells, 5, 4, 4, 1.5).sort()).toEqual([0, 1, 2, 4, 6, 8]);
    expect(getGridCellNeighbors(cells, 5, 4, 4, 2.5).sort()).toEqual([0, 1, 12, 2, 3, 4, 6, 7, 8]);
    expect(getGridCellNeighbors(cells, 14, 4, 4, 2.5).sort()).toEqual([12, 13, 15]);
    expect(getGridCellNeighbors(cells, 15, 4, 4, 2.5).sort()).toEqual([13, 14]);
  });
});
