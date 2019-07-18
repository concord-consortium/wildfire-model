import { getFireSpreadRate, LandType } from "./fire-model";
import { UNBURNT } from "./simulation";

describe("fire model", () => {

  it("calculates the fireSpreadTime correctly", () => {
    const sourceCell = {
      x: 0,
      y: 0,
      landType: LandType.Shrub,
      elevation: 0,
      timeOfIgnition: 0,
      fireState: UNBURNT
    };

    const targetCell = {
      x: 1,
      y: 0,
      landType: LandType.Shrub,
      elevation: 0,
      timeOfIgnition: 0,
      fireState: UNBURNT
    };

    const spreadTime = getFireSpreadRate(sourceCell, targetCell, 88);
    expect(spreadTime).toBeCloseTo(8.1554);
  });

});
