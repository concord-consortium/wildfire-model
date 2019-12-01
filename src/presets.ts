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
    maxTimeStep: 10,
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
  },
  test01: {
    modelWidth: 120000,
    modelHeight: 80000,
    gridWidth: 240,
    heightmapMaxElevation: 20000,
    zoneIndex: "data/test01_zonemap.png",
    elevation: "data/test01_heightmap.png",
  },
  defaultTwoZone: {
    modelWidth: 120000,
    modelHeight: 80000,
    gridWidth: 240,
    heightmapMaxElevation: 20000,
    zones: [
      { terrainType: 1, landType: 0, droughtLevel: 3 },
      { terrainType: 1, landType: 1, droughtLevel: 2 },
    ],
    zoneIndex: [
      [ 0, 1 ]
    ]
  },
  defaultThreeZone: {
    modelWidth: 120000,
    modelHeight: 80000,
    gridWidth: 240,
    heightmapMaxElevation: 20000,
    zonesCount: 3,
    zoneIndex: [
      [ 0, 1, 0 ]
    ]
  },
  threeZonePlains: {
    modelWidth: 120000,
    modelHeight: 80000,
    gridWidth: 240,
    heightmapMaxElevation: 20000,
    zones: [
      { terrainType: 2, landType: 0, droughtLevel: 3 },
      { terrainType: 2, landType: 1, droughtLevel: 2 },
      { terrainType: 2, landType: 2, droughtLevel: 0 }
    ],
    zonesCount: 3,
    zoneIndex: [
      [ 0, 1, 2 ]
    ],
    elevation: "data/plains-plains-plains-heightmap-edge.png",
  },
  threeZoneFoothills: {
    modelWidth: 120000,
    modelHeight: 80000,
    gridWidth: 240,
    heightmapMaxElevation: 20000,
    zones: [
      { terrainType: 1, landType: 0, droughtLevel: 3 },
      { terrainType: 1, landType: 1, droughtLevel: 2 },
      { terrainType: 1, landType: 2, droughtLevel: 0 }
    ],
    zonesCount: 3,
    zoneIndex: [
      [ 0, 1, 2 ]
    ],
    elevation: "data/foothills-foothills-foothills-heightmap-edge.png",
  },
  threeZoneMountains: {
    modelWidth: 120000,
    modelHeight: 80000,
    gridWidth: 240,
    heightmapMaxElevation: 20000,
    zones: [
      { terrainType: 0, landType: 1, droughtLevel: 3 },
      { terrainType: 0, landType: 2, droughtLevel: 2 },
      { terrainType: 0, landType: 3, droughtLevel: 0 }
    ],
    zonesCount: 3,
    zoneIndex: [
      [ 0, 1, 2 ]
    ],
    elevation: "data/mountains-mountains-mountains-heightmap-edge.png",
  },
  threeZoneMix: {
    modelWidth: 120000,
    modelHeight: 80000,
    gridWidth: 240,
    heightmapMaxElevation: 20000,
    zones: [
      { terrainType: 0, landType: 0, droughtLevel: 3 },
      { terrainType: 1, landType: 1, droughtLevel: 2 },
      { terrainType: 2, landType: 2, droughtLevel: 0 }
    ],
    zonesCount: 3,
    zoneIndex: [
      [ 0, 1, 2 ]
    ],
    elevation: "data/mountains-foothills-plains-heightmap-edge.png",
  },
};

export default presets;
