import { getFireSpreadRate, LandType, getDirectionFactor } from "./fire-model";
import { FireState } from "./cell";

const sourceCell = {
  x: 0,
  y: 1,
  landType: LandType.Shrub,
  elevation: 0,
  ignitionTime: 0,
  fireState: FireState.Unburnt
};

const targetCell = {
  x: 0,
  y: 0,
  landType: LandType.Shrub,
  elevation: 0,
  ignitionTime: 0,
  fireState: FireState.Unburnt
};

describe("getFireSpreadRate", () => {
  it("calculates the fireSpreadRate correctly", () => {
    // Note that result is taken from:
    // https://docs.google.com/spreadsheets/d/1ov3JUz6hXdnXChbXTz20Fo_9YoWmGukJgCaIMJeRUb4/edit#gid=1641357968
    // cells F13:
    // Wind speed in the spreadsheet uses feet/min, but we use mph here for better readability.
    // Also, note that target cell lies perfectly aligned with wind direction (northern).
    expect(getFireSpreadRate(sourceCell, targetCell, {speed: 1, direction: 0})).toBeCloseTo(8.1554);
    // cells F14:
    expect(getFireSpreadRate(sourceCell, targetCell, {speed: 2, direction: 0})).toBeCloseTo(13.979);
    // cells F32:
    expect(getFireSpreadRate(sourceCell, targetCell, {speed: 20, direction: 0})).toBeCloseTo(148.517);
  });

  it("takes into account wind direction", () => {
    expect(getFireSpreadRate(sourceCell, targetCell, {speed: 2, direction: 0})).toBeCloseTo(13.979);
    expect(getFireSpreadRate(sourceCell, targetCell, {speed: 2, direction: 90})).toBeCloseTo(3.55);
    expect(getFireSpreadRate(sourceCell, targetCell, {speed: 2, direction: -90})).toBeCloseTo(3.55);
    expect(getFireSpreadRate(sourceCell, targetCell, {speed: 2, direction: 180})).toBeCloseTo(2.035);
  });
});

describe("getDirectionFactor", () => {
  it("takes into account wind direction", () => {
    // Max factor should be 1 when wind is aligned with cell centers vector.
    expect(getDirectionFactor(sourceCell, targetCell, 100, 0)).toBeCloseTo(1);
    expect(getDirectionFactor(sourceCell, targetCell, 100, 90)).toBeCloseTo(0.37);
    expect(getDirectionFactor(sourceCell, targetCell, 100, -90)).toBeCloseTo(0.37);
    expect(getDirectionFactor(sourceCell, targetCell, 100, 180)).toBeCloseTo(0.23);
  });
});
