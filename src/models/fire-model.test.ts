import { getFireSpreadRate, LandType, getDirectionFactor } from "./fire-model";

const cellSize = 1;

const sourceCell = {
  x: 0,
  y: 1,
  landType: LandType.Shrub,
  moistureContent: 0.1,
  elevation: 0
};

const targetCell = {
  x: 0,
  y: 0,
  landType: LandType.Shrub,
  moistureContent: 0.1,
  // Why such elevation? Note that spreadsheet uses value for slope -1deg => Math.PI / 180.
  // Ensure that we use the same slope here (so calculate elevation accordingly).
  elevation: Math.tan(Math.PI / 180) * cellSize
};

describe("getFireSpreadRate", () => {
  it("calculates the fireSpreadRate correctly", () => {
    // Note that result is taken from:
    // https://docs.google.com/spreadsheets/d/1ov3JUz6hXdnXChbXTz20Fo_9YoWmGukJgCaIMJeRUb4/edit#gid=1641357968
    // cells F13:
    // Wind speed in the spreadsheet uses feet/min, but we use mph here for better readability.
    // Also, note that target cell lies perfectly aligned with wind direction (northern).
    expect(getFireSpreadRate(sourceCell, targetCell, {speed: 1, direction: 0}, cellSize)).toBeCloseTo(8.1554);
    // cells F14:
    expect(getFireSpreadRate(sourceCell, targetCell, {speed: 2, direction: 0}, cellSize)).toBeCloseTo(13.979);
    // cells F32:
    expect(getFireSpreadRate(sourceCell, targetCell, {speed: 20, direction: 0}, cellSize)).toBeCloseTo(148.517);
  });

  it("takes into account wind direction", () => {
    expect(getFireSpreadRate(sourceCell, targetCell, {speed: 2, direction: 0}, cellSize)).toBeCloseTo(13.979);
    expect(getFireSpreadRate(sourceCell, targetCell, {speed: 2, direction: 90}, cellSize)).toBeCloseTo(3.559);
    expect(getFireSpreadRate(sourceCell, targetCell, {speed: 2, direction: -90}, cellSize)).toBeCloseTo(3.559);
    expect(getFireSpreadRate(sourceCell, targetCell, {speed: 2, direction: 180}, cellSize)).toBeCloseTo(2.035);
  });
});

describe("getDirectionFactor", () => {
  it("takes into account direction of the max fire spread", () => {
    // Max factor should be 1 when max fire spread is aligned with center of the cells.
    // Note that max fire spread angle is an angle from positive X axis.
    expect(getDirectionFactor(sourceCell, targetCell, 100, -Math.PI / 2)).toBeCloseTo(1);
    expect(getDirectionFactor(sourceCell, targetCell, 100, 0)).toBeCloseTo(0.37);
    expect(getDirectionFactor(sourceCell, targetCell, 100, Math.PI)).toBeCloseTo(0.37);
    expect(getDirectionFactor(sourceCell, targetCell, 100, Math.PI / 2)).toBeCloseTo(0.23);
  });
});
