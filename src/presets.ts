import {ISimulationConfig} from "./config";

export interface IPresetConfig extends ISimulationConfig {
  landType?: number[][];
  elevation?: number[][] | string;
}

const presets: {[key: string]: Partial<IPresetConfig>} = {
  basic: {
    modelWidth: 100000,
    modelHeight: 100000,
    cellSize: 1000,
    spark: [50000, 50000],
    landType: [
      [ 0 ]
    ]
  },
  basicWithWind: {
    modelWidth: 100000,
    modelHeight: 100000,
    cellSize: 1000,
    spark: [50000, 50000],
    windSpeed: 1,
    windDirection: 0,
    landType: [
      [ 0 ]
    ]
  },
  basicWithSlope: {
    modelWidth: 100000,
    modelHeight: 100000,
    cellSize: 1000,
    spark: [50000, 50000],
    heightmapMaxElevation: 3000,
    landType: [
      [ 0 ]
    ],
    elevation: [
      [ 3000, 0 ],
      [ 3000, 0 ]
    ]
  },
  basicWithSlopeAndWind: {
    modelWidth: 100000,
    modelHeight: 100000,
    cellSize: 1000,
    spark: [50000, 50000],
    windSpeed: 1,
    windDirection: 0,
    heightmapMaxElevation: 10000,
    landType: [
      [ 0 ]
    ],
    elevation: [
      [ 10000, 0 ],
      [ 10000, 0 ]
    ]
  },
  hills: {
    modelWidth: 100000,
    modelHeight: 100000,
    cellSize: 1000,
    spark: [50000, 50000],
    timeStep: 10,
    heightmapMaxElevation: 3000,
    landType: [
      [ 0 ]
    ],
    elevation: "data/hills.png"
  },
  randomHeightmap: {
    modelWidth: 100000,
    modelHeight: 100000,
    cellSize: 1000,
    spark: [50000, 50000],
    heightmapMaxElevation: 3000,
    landType: [
      [ 0 ]
    ],
    elevation: "data/randomHeightmap.png"
  },
  landTypes: {
    modelWidth: 100000,
    modelHeight: 100000,
    cellSize: 1000,
    spark: [50000, 50000],
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
