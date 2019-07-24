import {ISimulationConfig} from "./config";

export interface IPresetConfig extends ISimulationConfig {
  landType?: number[][];
  elevation?: number[][];
}

const presets: {[key: string]: Partial<IPresetConfig>} = {
  basic: {
    modelWidth: 100,
    modelHeight: 100,
    cellSize: 1,
    spark: [49, 49],
    landType: [
      [ 0 ]
    ]
  },
  basicWithWind: {
    modelWidth: 100,
    modelHeight: 100,
    cellSize: 1,
    spark: [49, 49],
    windSpeed: 1,
    windDirection: 0,
    landType: [
      [ 0 ]
    ]
  },
  basicWithSlope: {
    modelWidth: 100,
    modelHeight: 100,
    cellSize: 1,
    spark: [49, 49],
    landType: [
      [ 0 ]
    ],
    elevation: [
      [ 10, 0 ],
      [ 10, 0 ]
    ]
  },
  basicWithSlopeAndWind: {
    modelWidth: 100,
    modelHeight: 100,
    cellSize: 1,
    spark: [49, 49],
    windSpeed: 1,
    windDirection: 0,
    landType: [
      [ 0 ]
    ],
    elevation: [
      [ 10, 0 ],
      [ 10, 0 ]
    ]
  },
  landTypes: {
    modelWidth: 100,
    modelHeight: 100,
    cellSize: 1,
    spark: [49, 49],
    landType: [
      [ 0, 0, 0, 0, 0, 0, 0, 0, 0 ],
      [ 0, 0, 0, 0, 0, 0, 0, 0, 0 ],
      [ 0, 0, 0, 0, 0, 0, 0, 0, 0 ],
      [ 1, 0, 0, 0, 0, 0, 0, 0, 0 ],
      [ 1, 1, 0, 0, 0, 0, 0, 0, 0 ],
      [ 1, 1, 1, 0, 0, 0, 0, 0, 0 ],
      [ 1, 1, 1, 1, 0, 0, 0, 0, 0 ],
      [ 1, 1, 1, 1, 0, 0, 0, 0, 0 ],
      [ 1, 1, 1, 1, 1, 0, 0, 0, 0 ],
      [ 1, 1, 1, 1, 1, 0, 0, 0, 0 ],
      [ 1, 1, 1, 0, 0, 0, 0, 0, 0 ]
    ]
  }
};

export default presets;
