import { populateGrid } from "./utils";

describe("populateGrid", () => {
  it("returns grid array from image with any dimensions without any interpolation", () => {
    expect(populateGrid(2, 2, [ [ 1 ] ])).toEqual([ 1, 1, 1, 1 ]);
    expect(populateGrid(2, 2, [
      [ 0, 0 ],
      [ 1, 1 ]
    ])).toEqual([ 1, 1, 0, 0 ]);
    expect(populateGrid(2, 1, [
      [ 0, 0 ],
      [ 1, 1 ]
    ])).toEqual([ 1, 1 ]);
    expect(populateGrid(1, 2, [
      [ 0, 0 ],
      [ 1, 1 ]
    ])).toEqual([ 1, 0 ]);
    expect(populateGrid(2, 2, [
      [ 0, 0, 0 ],
      [ 1, 1, 1 ],
      [ 1, 1, 1 ]
    ])).toEqual([ 1, 1, 1, 1 ]);
    expect(populateGrid(2, 2, [
      [ 0, 0, 0, 0 ],
      [ 0, 0, 0, 0 ],
      [ 1, 1, 1, 1 ],
      [ 1, 1, 1, 1 ]
    ])).toEqual([ 1, 1, 0, 0 ]);
    expect(populateGrid(3, 3, [
      [ 0, 0 ],
      [ 1, 1 ]
    ])).toEqual([ 1, 1, 1, 1, 1, 1, 0, 0, 0 ]);
  });

  it("returns grid array from image with any dimensions with interpolation", () => {
    expect(populateGrid(2, 2, [ [ 1 ] ], true)).toEqual([ 1, 1, 1, 1 ]);
    expect(populateGrid(2, 2, [
      [ 0, 0 ],
      [ 1, 1 ]
    ], true)).toEqual([ 1, 1, 0, 0 ]);
    expect(populateGrid(2, 2, [
      [ 0, 0, 0 ],
      [ 1, 1, 1 ],
      [ 1, 1, 1 ]
    ], true)).toEqual([ 1, 1, 0, 0 ]);
    expect(populateGrid(2, 2, [
      [ 0, 0, 0, 0 ],
      [ 0, 0, 0, 0 ],
      [ 1, 1, 1, 1 ],
      [ 1, 1, 1, 1 ]
    ], true)).toEqual([ 1, 1, 0, 0 ]);
    expect(populateGrid(5, 5, [
      [ 0, 0 ],
      [ 1, 1 ]
    ], true)).toEqual([
      1, 1, 1, 1, 1,
      0.75, 0.75, 0.75, 0.75, 0.75,
      0.5, 0.5, 0.5, 0.5, 0.5,
      0.25, 0.25, 0.25, 0.25, 0.25,
      0, 0, 0, 0, 0
    ]);
    expect(populateGrid(1, 5, [
      [ 0 ],
      [ 1 ]
    ], true)).toEqual([
      1,
      0.75,
      0.5,
      0.25,
      0
    ]);
    expect(populateGrid(1, 5, [
      [ 0, 0 ],
      [ 1, 10 ]
    ], true)).toEqual([
      1,
      0.75,
      0.5,
      0.25,
      0
    ]);
    expect(populateGrid(5, 1, [
      [ 0, 100 ],
      [ 0, 10 ]
    ], true)).toEqual([
      0, 2.5, 5, 7.5, 10
    ]);
    expect(populateGrid(2, 5, [
      [ 0, 0 ],
      [ 1, 10 ]
    ], true)).toEqual([
      1, 10,
      0.75, 7.5,
      0.5, 5,
      0.25, 2.5,
      0, 0
    ]);
  });
});
