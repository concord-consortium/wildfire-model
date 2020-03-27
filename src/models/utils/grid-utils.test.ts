import { withinDist } from "./grid-utils";

describe("withinDist", () => {
  it("returns true if dist between point is less or equal than specified max", () => {
    expect(withinDist(0, 1, 0, 2, 1)).toEqual(true);
    expect(withinDist(0, 1, 0, 2, 0.9)).toEqual(false);
    expect(withinDist(0, 0, 1, 1, Math.sqrt(2))).toEqual(true);
    expect(withinDist(0, 0, 1, 1, Math.sqrt(1.99))).toEqual(false);
  });
});
