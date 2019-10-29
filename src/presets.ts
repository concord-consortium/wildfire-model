import {ISimulationConfig} from "./config";

export interface IPresetConfig extends ISimulationConfig {
  zoneIndex: number[][] | string;
  elevation?: number[][] | string;
}

const presets: {[key: string]: Partial<IPresetConfig>} = {
  basic: {
    modelWidth: 100000,
    modelHeight: 100000,
    gridWidth: 100,
    sparks: [ [50000, 50000] ],
    zoneIndex: [
      [ 0, 1 ]
    ]
  },
  threeZones: {
    modelWidth: 100000,
    modelHeight: 100000,
    gridWidth: 100,
    sparks: [ [50000, 50000] ],
    zoneIndex: [
      [ 0, 1, 0 ]
    ]
  },
  basicWithWind: {
    modelWidth: 100000,
    modelHeight: 100000,
    gridWidth: 100,
    sparks: [ [50000, 50000] ],
    windSpeed: 1,
    windDirection: 0,
    zoneIndex: [
      [ 0, 1 ]
    ]
  },
  slope45deg: {
    modelWidth: 100000,
    modelHeight: 100000,
    gridWidth: 100,
    sparks: [ [50000, 50000] ],
    heightmapMaxElevation: 3000,
    zoneIndex: [
      [ 0, 1 ]
    ],
    elevation: [
      [ 100000, 0 ],
      [ 100000, 0 ]
    ]
  },
  basicWithSlopeAndWind: {
    modelWidth: 100000,
    modelHeight: 100000,
    gridWidth: 100,
    sparks: [ [50000, 50000] ],
    windSpeed: 1,
    windDirection: 0,
    heightmapMaxElevation: 10000,
    zoneIndex: [
      [ 0, 1 ]
    ],
    elevation: [
      [ 10000, 0 ],
      [ 10000, 0 ]
    ]
  },
  hills: {
    modelWidth: 25000,
    modelHeight: 25000,
    gridWidth: 100,
    sparks: [ [5000, 12500] ],
    timeStep: 10,
    heightmapMaxElevation: 3000,
    zoneIndex: [
      [ 0, 1 ]
    ],
    elevation: "data/hills.png"
  },
  randomHeightmap: {
    modelWidth: 100000,
    modelHeight: 100000,
    gridWidth: 100,
    sparks: [ [50000, 50000] ],
    heightmapMaxElevation: 7000,
    zoneIndex: [
      [ 0, 1 ]
    ],
    elevation: "data/randomHeightmap.png"
  },
  complexZones: {
    modelWidth: 100000,
    modelHeight: 100000,
    gridWidth: 100,
    sparks: [ [50000, 50000] ],
    zoneIndex: [
      [ 0, 0, 0, 0, 0, 0, 2, 2, 2 ],
      [ 0, 0, 0, 0, 0, 0, 0, 2, 2 ],
      [ 0, 0, 0, 0, 0, 0, 0, 0, 2 ],
      [ 1, 0, 0, 0, 0, 0, 0, 0, 0 ],
      [ 1, 1, 0, 0, 0, 0, 0, 0, 0 ],
      [ 1, 1, 1, 0, 0, 0, 0, 0, 0 ],
      [ 1, 1, 1, 1, 0, 0, 0, 0, 0 ],
      [ 1, 1, 1, 1, 0, 0, 0, 0, 0 ],
      [ 1, 1, 1, 1, 1, 0, 0, 0, 0 ],
      [ 1, 1, 1, 1, 1, 0, 0, 0, 0 ],
      [ 1, 1, 1, 0, 0, 0, 0, 0, 0 ]
    ]
  },
  zonesFromImage: {
    modelWidth: 100000,
    modelHeight: 100000,
    gridWidth: 100,
    sparks: [ [50000, 50000] ],
    zoneIndex: "data/complexZones.png",
  }
};

export default presets;
