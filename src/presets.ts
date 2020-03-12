import { ISimulationConfig } from "./config";
import { DroughtLevel, Vegetation, TerrainType } from "./models/fire-model";

export interface IPresetConfig extends ISimulationConfig {
  zoneIndex: number[][] | string;
  // If `elevation` height map is provided, it will be loaded during model initialization and terrain setup dialog
  // won't let users change terrain type. Otherwise, height map URL will be derived from zones `terrainType` properties.
  elevation?: number[][] | string;
}

const presets: {[key: string]: Partial<IPresetConfig>} = {
  basic: {
    modelWidth: 100000,
    modelHeight: 100000,
    gridWidth: 20,
    sparks: [ [50000, 50000] ],
    zoneIndex: [
      [ 0, 1 ]
    ],
    riverData: null
  },
  threeZones: {
    modelWidth: 100000,
    modelHeight: 100000,
    gridWidth: 100,
    sparks: [ [50000, 50000] ],
    zoneIndex: [
      [ 0, 1, 2 ]
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
      { terrainType: TerrainType.Foothills, vegetation: Vegetation.Grass, droughtLevel: DroughtLevel.SevereDrought },
      { terrainType: TerrainType.Foothills, vegetation: Vegetation.Shrub, droughtLevel: DroughtLevel.MediumDrought },
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
    zones: [
      { terrainType: TerrainType.Foothills, vegetation: Vegetation.Grass, droughtLevel: 3 },
      { terrainType: TerrainType.Foothills, vegetation: Vegetation.Shrub, droughtLevel: 2 },
      { terrainType: TerrainType.Foothills, vegetation: Vegetation.ForestSmallLitter, droughtLevel: 0 },
    ],
    zoneIndex: [
      [ 0, 1, 2 ]
    ]
  },
  threeZonePlains: {
    modelWidth: 120000,
    modelHeight: 80000,
    gridWidth: 240,
    heightmapMaxElevation: 20000,
    zones: [
      { terrainType: TerrainType.Plains, vegetation: Vegetation.Grass, droughtLevel: 3 },
      { terrainType: TerrainType.Plains, vegetation: Vegetation.Shrub, droughtLevel: 2 },
      { terrainType: TerrainType.Plains, vegetation: Vegetation.ForestSmallLitter, droughtLevel: 0 },
    ],
    zonesCount: 3,
    zoneIndex: [
      [ 0, 1, 2 ]
    ]
  },
  threeZoneFoothills: {
    modelWidth: 120000,
    modelHeight: 80000,
    gridWidth: 240,
    heightmapMaxElevation: 20000,
    zones: [
      { terrainType: TerrainType.Foothills, vegetation: Vegetation.Grass, droughtLevel: 1 },
      { terrainType: TerrainType.Foothills, vegetation: Vegetation.Shrub, droughtLevel: 1 },
      { terrainType: TerrainType.Foothills, vegetation: Vegetation.ForestSmallLitter, droughtLevel: 1 },
    ],
    zonesCount: 3,
    zoneIndex: [
      [ 0, 1, 2 ]
    ]
  },
  threeZoneMountains: {
    modelWidth: 120000,
    modelHeight: 80000,
    gridWidth: 240,
    heightmapMaxElevation: 20000,
    zones: [
      { terrainType: TerrainType.Mountains, vegetation: Vegetation.Shrub, droughtLevel: 1 },
      { terrainType: TerrainType.Mountains, vegetation: Vegetation.ForestSmallLitter, droughtLevel: 1 },
      { terrainType: TerrainType.Mountains, vegetation: Vegetation.ForestLargeLitter, droughtLevel: 1 },
    ],
    zonesCount: 3,
    zoneIndex: [
      [ 0, 1, 2 ]
    ]
  },
  threeZoneMix: {
    modelWidth: 120000,
    modelHeight: 80000,
    gridWidth: 240,
    heightmapMaxElevation: 20000,
    zones: [
      { terrainType: TerrainType.Mountains, vegetation: Vegetation.Grass, droughtLevel: 3 },
      { terrainType: TerrainType.Foothills, vegetation: Vegetation.Shrub, droughtLevel: 3 },
      { terrainType: TerrainType.Plains, vegetation: Vegetation.ForestSmallLitter, droughtLevel: 3 },
    ],
    zonesCount: 3,
    zoneIndex: [
      [ 0, 1, 2 ]
    ]
  },
  extremeZones: {
    modelWidth: 120000,
    modelHeight: 80000,
    gridWidth: 240,
    heightmapMaxElevation: 20000,
    zones: [
      {
        terrainType: TerrainType.Mountains,
        vegetation: Vegetation.ForestLargeLitter,
        droughtLevel: DroughtLevel.SevereDrought
      },
      {
        terrainType: TerrainType.Foothills,
        vegetation: Vegetation.Shrub,
        droughtLevel: DroughtLevel.MediumDrought
      },
      { terrainType: TerrainType.Plains, vegetation: Vegetation.Grass, droughtLevel: DroughtLevel.NoDrought }
    ],
    zonesCount: 3,
    zoneIndex: [
      [ 0, 1, 2 ]
    ]
  },
  shrubThreeZone: {
    modelWidth: 120000,
    modelHeight: 80000,
    gridWidth: 240,
    heightmapMaxElevation: 20000,
    zonesCount: 3,
    zones: [
      { terrainType: TerrainType.Mountains, vegetation: Vegetation.Shrub, droughtLevel: 1 },
      { terrainType: TerrainType.Foothills, vegetation: Vegetation.Shrub, droughtLevel: 1 },
      { terrainType: TerrainType.Plains, vegetation: Vegetation.Shrub, droughtLevel: 1 },
    ],
    zoneIndex: [
      [ 0, 1, 2 ]
    ]
  },
  mountainTwoZone: {
    modelWidth: 120000,
    modelHeight: 80000,
    gridWidth: 240,
    heightmapMaxElevation: 20000,
    zones: [
      { terrainType: TerrainType.Mountains, vegetation: Vegetation.Shrub, droughtLevel: 1 },
      { terrainType: TerrainType.Mountains, vegetation: Vegetation.Shrub, droughtLevel: 1 },
    ],
    zoneIndex: [
      [ 0, 1 ]
    ]
  },
  plainsTwoZone: {
    modelWidth: 120000,
    modelHeight: 80000,
    gridWidth: 240,
    heightmapMaxElevation: 20000,
    zones: [
      { terrainType: TerrainType.Plains, vegetation: Vegetation.Shrub, droughtLevel: 1 },
      { terrainType: TerrainType.Plains, vegetation: Vegetation.Shrub, droughtLevel: 1 },
    ],
    zoneIndex: [
      [ 0, 1 ]
    ]
  },
  mountainsandplainsTwoZone: {
    modelWidth: 120000,
    modelHeight: 80000,
    gridWidth: 240,
    heightmapMaxElevation: 20000,
    zones: [
      { terrainType: TerrainType.Mountains, vegetation: Vegetation.Shrub, droughtLevel: 1 },
      { terrainType: TerrainType.Plains, vegetation: Vegetation.Shrub, droughtLevel: 1 },
    ],
    zoneIndex: [
      [ 0, 1 ]
    ]
  },
  hillThreeZone: {
    modelWidth: 120000,
    modelHeight: 80000,
    gridWidth: 240,
    heightmapMaxElevation: 20000,
    zonesCount: 3,
    zones: [
      { terrainType: TerrainType.Foothills, vegetation: Vegetation.Shrub, droughtLevel: 0 },
      { terrainType: TerrainType.Foothills, vegetation: Vegetation.Shrub, droughtLevel: 1 },
      { terrainType: TerrainType.Foothills, vegetation: Vegetation.Shrub, droughtLevel: 2 },
    ],
    zoneIndex: [
      [ 0, 1, 2 ]
    ]
  },
  hillTwoZone: {
    modelWidth: 120000,
    modelHeight: 80000,
    gridWidth: 240,
    heightmapMaxElevation: 20000,
    zones: [
      { terrainType: TerrainType.Foothills, vegetation: Vegetation.Shrub, droughtLevel: 1 },
      { terrainType: TerrainType.Foothills, vegetation: Vegetation.Shrub, droughtLevel: 1 },
    ],
    zoneIndex: [
      [ 0, 1 ]
    ]
  },
  extremeZoneMix: {
    modelWidth: 120000,
    modelHeight: 80000,
    gridWidth: 240,
    heightmapMaxElevation: 20000,
    zones: [
      { terrainType: TerrainType.Mountains, vegetation: Vegetation.Grass, droughtLevel: 3 },
      { terrainType: TerrainType.Foothills, vegetation: Vegetation.Shrub, droughtLevel: 3 },
      { terrainType: TerrainType.Plains, vegetation: Vegetation.ForestSmallLitter, droughtLevel: 3 },
    ],
    zonesCount: 3,
    zoneIndex: [
      [ 0, 1, 2 ]
    ]
  },
};

export default presets;
