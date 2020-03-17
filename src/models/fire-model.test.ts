import { getDirectionFactor, getFireSpreadRate, Vegetation } from "./fire-model";

const cellSize = 1;

const sourceCell = {
  x: 10,
  y: 11,
  vegetation: Vegetation.Shrub,
  moistureContent: 0.06,
  elevation: 0
};

const targetCell = {
  x: 10,
  y: 10,
  vegetation: Vegetation.Shrub,
  moistureContent: 0.06,
  // Why such elevation? Note that spreadsheet uses value for slope 0.1.
  // Ensure that we use the same slope here (so calculate elevation accordingly).
  elevation: Math.tan(0.1) * cellSize
};

const gridWidth = 100;
const gridHeight = 100;

describe("getFireSpreadRate", () => {
  beforeEach(() => {
    sourceCell.vegetation = Vegetation.Shrub;
    targetCell.vegetation = Vegetation.Shrub;
  });

  it("calculates the fireSpreadRate correctly for grass fuel type", () => {
    sourceCell.vegetation = Vegetation.Grass;
    targetCell.vegetation = Vegetation.Grass;
    // Note that result is taken from:
    // https://drive.google.com/file/d/1ck0nwlawOtK-GjCV4qJ6ztMcxh3utbv-/view?usp=sharing
    // cells F13:
    // Wind speed in the spreadsheet uses feet/min, but we use mph here for better readability.
    // Also, note that target cell lies perfectly aligned with wind direction (northern).
    expect(getFireSpreadRate(sourceCell, targetCell, { speed: 1, direction: 0 }, cellSize,
      gridWidth, gridHeight)).toBeCloseTo(19.40563588);
    // cells F14:
    expect(getFireSpreadRate(sourceCell, targetCell, { speed: 2, direction: 0 }, cellSize,
      gridWidth, gridHeight)).toBeCloseTo(33.46252017);
    // cells F32:
    expect(getFireSpreadRate(sourceCell, targetCell, { speed: 20, direction: 0 }, cellSize,
      gridWidth, gridHeight)).toBeCloseTo(802.7428356);
  });

  it("calculates the fireSpreadRate correctly for shrub fuel type", () => {
    sourceCell.vegetation = Vegetation.Shrub;
    targetCell.vegetation = Vegetation.Shrub;
    // Note that result is taken from:
    // https://drive.google.com/file/d/1ck0nwlawOtK-GjCV4qJ6ztMcxh3utbv-/view?usp=sharing
    // cells F13:
    // Wind speed in the spreadsheet uses feet/min, but we use mph here for better readability.
    // Also, note that target cell lies perfectly aligned with wind direction (northern).
    expect(getFireSpreadRate(sourceCell, targetCell, { speed: 1, direction: 0 }, cellSize,
      gridWidth, gridHeight)).toBeCloseTo(14.1437344760995);
    // cells F14:
    expect(getFireSpreadRate(sourceCell, targetCell, { speed: 2, direction: 0 }, cellSize,
      gridWidth, gridHeight)).toBeCloseTo(27.6472608800662);
    // cells F32:
    expect(getFireSpreadRate(sourceCell, targetCell, { speed: 20, direction: 0 }, cellSize,
      gridWidth, gridHeight)).toBeCloseTo(541.687795792985);
  });

  it("calculates the fireSpreadRate correctly for forest small litter fuel type", () => {
    sourceCell.vegetation = Vegetation.ForestSmallLitter;
    targetCell.vegetation = Vegetation.ForestSmallLitter;
    // Note that result is taken from:
    // https://drive.google.com/file/d/1ck0nwlawOtK-GjCV4qJ6ztMcxh3utbv-/view?usp=sharing
    // cells F13:
    // Wind speed in the spreadsheet uses feet/min, but we use mph here for better readability.
    // Also, note that target cell lies perfectly aligned with wind direction (northern).
    expect(getFireSpreadRate(sourceCell, targetCell, { speed: 1, direction: 0 }, cellSize,
      gridWidth, gridHeight)).toBeCloseTo(1.275686811);
    // cells F14:
    expect(getFireSpreadRate(sourceCell, targetCell, { speed: 2, direction: 0 }, cellSize,
      gridWidth, gridHeight)).toBeCloseTo(2.831591284);
    // cells F32:
    expect(getFireSpreadRate(sourceCell, targetCell, { speed: 20, direction: 0 }, cellSize,
      gridWidth, gridHeight)).toBeCloseTo(64.40222588);
  });

  it("calculates the fireSpreadRate correctly for forest large litter fuel type", () => {
    sourceCell.vegetation = Vegetation.ForestLargeLitter;
    targetCell.vegetation = Vegetation.ForestLargeLitter;
    // Note that result is taken from:
    // https://drive.google.com/file/d/1ck0nwlawOtK-GjCV4qJ6ztMcxh3utbv-/view?usp=sharing
    // cells F13:
    // Wind speed in the spreadsheet uses feet/min, but we use mph here for better readability.
    // Also, note that target cell lies perfectly aligned with wind direction (northern).
    expect(getFireSpreadRate(sourceCell, targetCell, { speed: 1, direction: 0 }, cellSize,
      gridWidth, gridHeight)).toBeCloseTo(6.268576733);
    // cells F14:
    expect(getFireSpreadRate(sourceCell, targetCell, { speed: 2, direction: 0 }, cellSize,
      gridWidth, gridHeight)).toBeCloseTo(12.42085772);
    // cells F32:
    expect(getFireSpreadRate(sourceCell, targetCell, { speed: 20, direction: 0 }, cellSize,
      gridWidth, gridHeight)).toBeCloseTo(212.927632);
  });

  it("takes into account wind direction", () => {
    expect(getFireSpreadRate(sourceCell, targetCell, { speed: 2, direction: 0 }, cellSize,
      gridWidth, gridHeight)).toBeCloseTo(27.6472608800662);
    expect(getFireSpreadRate(sourceCell, targetCell, { speed: 2, direction: 90 }, cellSize,
      gridWidth, gridHeight)).toBeCloseTo(7.0274244);
    expect(getFireSpreadRate(sourceCell, targetCell, { speed: 2, direction: -90 }, cellSize,
      gridWidth, gridHeight)).toBeCloseTo(7.0274244);
    expect(getFireSpreadRate(sourceCell, targetCell, { speed: 2, direction: 180 }, cellSize,
      gridWidth, gridHeight)).toBeCloseTo(3.86127);
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
