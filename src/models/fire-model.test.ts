import { getFireSpreadRate, LandType } from "./fire-model";
import { FireState } from "./cell";

describe("Fire model", () => {
  it("calculates the fireSpreadTime correctly", () => {
    const sourceCell = {
      x: 0,
      y: 0,
      landType: LandType.Shrub,
      elevation: 0,
      ignitionTime: 0,
      fireState: FireState.Unburnt
    };

    const targetCell = {
      x: 1,
      y: 0,
      landType: LandType.Shrub,
      elevation: 0,
      ignitionTime: 0,
      fireState: FireState.Unburnt
    };

    const spreadTime = getFireSpreadRate(sourceCell, targetCell, 88);
    expect(spreadTime).toBeCloseTo(8.1554);
  });
});
