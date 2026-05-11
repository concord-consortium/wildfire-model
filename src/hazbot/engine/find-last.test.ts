import { findLast } from "./find-last";

describe("findLast", () => {
  it("returns the last matching element when matches exist", () => {
    const arr = [1, 2, 3, 4, 5];
    expect(findLast(arr, (n) => n % 2 === 0)).toBe(4);
  });

  it("returns undefined when no element matches", () => {
    const arr = [1, 3, 5];
    expect(findLast(arr, (n) => n % 2 === 0)).toBeUndefined();
  });

  it("returns undefined on an empty array", () => {
    expect(findLast([], () => true)).toBeUndefined();
  });
});
