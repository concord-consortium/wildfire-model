import { BurnIndex, Cell } from "./cell";
import { Zone } from "./zone";

describe("Cell model", () => {
  describe("isNonburnable", () => {
    it("returns false for rivers and unburnt islands", () => {
      const zone = {} as Zone;
      const x = 0;
      const y = 0;
      let cell = new Cell({x, y, zone});
      expect(cell.isNonburnable).toEqual(false);
      expect(cell.isNonburnable).toEqual(false);
      expect(cell.isNonburnable).toEqual(false);

      cell = new Cell({x, y, zone, isRiver: true});
      expect(cell.isNonburnable).toEqual(true);
      expect(cell.isNonburnable).toEqual(true);
      expect(cell.isNonburnable).toEqual(true);

      cell = new Cell({x, y, zone, isUnburntIsland: true});
      expect(cell.isNonburnable).toEqual(true);
      expect(cell.isNonburnable).toEqual(true);
      expect(cell.isNonburnable).toEqual(true);

      // Fire lines can still burn when fire is intense enough.
      cell = new Cell({x, y, zone, isFireLine: true});
      expect(cell.isNonburnable).toEqual(false);
      expect(cell.isNonburnable).toEqual(false);
      expect(cell.isNonburnable).toEqual(false);
    });
  });

  describe("isBurnableForBI", () => {
    it("returns false for nonburnable cells (rivers, unburnt islands) and result based on BI for fire lines", () => {
      const zone = {} as Zone;
      const x = 0;
      const y = 0;
      let cell = new Cell({x, y, zone});
      expect(cell.isBurnableForBI(BurnIndex.Low)).toEqual(true);
      expect(cell.isBurnableForBI(BurnIndex.Medium)).toEqual(true);
      expect(cell.isBurnableForBI(BurnIndex.High)).toEqual(true);

      cell = new Cell({x, y, zone, isRiver: true});
      expect(cell.isBurnableForBI(BurnIndex.Low)).toEqual(false);
      expect(cell.isBurnableForBI(BurnIndex.Medium)).toEqual(false);
      expect(cell.isBurnableForBI(BurnIndex.High)).toEqual(false);

      cell = new Cell({x, y, zone, isUnburntIsland: true});
      expect(cell.isBurnableForBI(BurnIndex.Low)).toEqual(false);
      expect(cell.isBurnableForBI(BurnIndex.Medium)).toEqual(false);
      expect(cell.isBurnableForBI(BurnIndex.High)).toEqual(false);

      cell = new Cell({x, y, zone, isFireLine: true});
      expect(cell.isBurnableForBI(BurnIndex.Low)).toEqual(false);
      expect(cell.isBurnableForBI(BurnIndex.Medium)).toEqual(false);
      expect(cell.isBurnableForBI(BurnIndex.High)).toEqual(true); // !!!
    });
  });
});

