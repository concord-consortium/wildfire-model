import {ISimulationConfig} from "./config";

export interface IPresetConfig extends ISimulationConfig {
  landType?: number[][];
  elevation?: number[][];
}

const presets: {[key: string]: Partial<IPresetConfig>} = {
  test1: {
    modelWidth: 100,
    modelHeight: 100,
    cellSize: 1,
    spark: [49, 49],
    landType: [
      [ 0, 0, 0, 0 ],
      [ 0, 0, 0, 0 ],
      [ 0, 0, 0, 0 ],
      [ 0, 0, 0, 0 ],
    ]
  },
  test2: {
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
