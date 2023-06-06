import { ISimulationConfig } from "./config";
import { DroughtLevel, TerrainType, Vegetation } from "./types";

const presets: { [key: string]: Partial<ISimulationConfig> } = {
  basic: {
    modelWidth: 100000,
    modelHeight: 100000,
    gridWidth: 100,
    sparks: [[50000, 50000]],
    zoneIndex: [
      [0, 1]
    ],
    elevation: [
      [0]
    ],
    riverData: null
  },
  basicWithWind: {
    modelWidth: 100000,
    modelHeight: 100000,
    gridWidth: 100,
    sparks: [[50000, 50000]],
    windSpeed: 1,
    windDirection: 0,
    zoneIndex: [
      [0, 1]
    ],
    elevation: [
      [0]
    ],
    riverData: null
  },
  slope45deg: {
    modelWidth: 100000,
    modelHeight: 100000,
    gridWidth: 100,
    sparks: [[50000, 50000]],
    heightmapMaxElevation: 3000,
    zoneIndex: [
      [0, 1]
    ],
    elevation: [
      [100000, 0],
      [100000, 0]
    ],
    riverData: null
  },
  basicWithSlopeAndWind: {
    modelWidth: 100000,
    modelHeight: 100000,
    gridWidth: 100,
    sparks: [[50000, 50000]],
    windSpeed: 1,
    windDirection: 0,
    heightmapMaxElevation: 10000,
    zoneIndex: [
      [0, 1]
    ],
    elevation: [
      [10000, 0],
      [10000, 0]
    ],
    riverData: null
  },
  complexZones: {
    zonesCount: 3,
    zoneIndex: [
      [0, 0, 0, 0, 0, 0, 2, 2, 2],
      [0, 0, 0, 0, 0, 0, 0, 2, 2],
      [0, 0, 0, 0, 0, 0, 0, 0, 2],
      [1, 0, 0, 0, 0, 0, 0, 0, 0],
      [1, 1, 0, 0, 0, 0, 0, 0, 0],
      [1, 1, 1, 0, 0, 0, 0, 0, 0],
      [1, 1, 1, 1, 0, 0, 0, 0, 0],
      [1, 1, 1, 1, 0, 0, 0, 0, 0],
      [1, 1, 1, 1, 1, 0, 0, 0, 0],
      [1, 1, 1, 1, 1, 0, 0, 0, 0],
      [1, 1, 1, 0, 0, 0, 0, 0, 0]
    ]
  },
  zonesFromImage: {
    zonesCount: 3,
    zoneIndex: "data/complexZones.png",
  },
  default: {
    zones: [
      { terrainType: TerrainType.Mountains, vegetation: Vegetation.Forest, droughtLevel: 0 },
      { terrainType: TerrainType.Foothills, vegetation: Vegetation.Shrub, droughtLevel: 1 },
      { terrainType: TerrainType.Plains, vegetation: Vegetation.Grass, droughtLevel: 2 },
    ],
    towns: [
      { name: "Skyview", x: 0.12, y: 0.68, terrainType: TerrainType.Mountains },
      { name: "Rolling Rock", x: 0.60, y: 0.25, terrainType: TerrainType.Foothills },
      { name: "Evensville", x: 0.78, y: 0.55, terrainType: TerrainType.Plains },
    ]
  },
  defaultTwoZone: {
    zonesCount: 2,
    zones: [
      { terrainType: TerrainType.Foothills, vegetation: Vegetation.Grass, droughtLevel: DroughtLevel.MediumDrought },
      { terrainType: TerrainType.Foothills, vegetation: Vegetation.Shrub, droughtLevel: DroughtLevel.MildDrought },
    ],
    towns: [
      { name: "Skyview", x: 0.12, y: 0.68, terrainType: TerrainType.Mountains },
      { name: "Peaksburg", x: 0.77, y: 0.37, terrainType: TerrainType.Mountains },
      { name: "Happy Valley", x: 0.31, y: 0.36, terrainType: TerrainType.Mountains },
      { name: "Sunrise", x: 0.81, y: 0.60, terrainType: TerrainType.Foothills },
      { name: "Hillsboro", x: 0.36, y: 0.55, terrainType: TerrainType.Foothills },
      { name: "Rolling Rock", x: 0.60, y: 0.25, terrainType: TerrainType.Foothills },
      { name: "Evensville", x: 0.78, y: 0.55, terrainType: TerrainType.Plains },
      { name: "Meadowland", x: 0.15, y: 0.55, terrainType: TerrainType.Plains },
      { name: "Greenfield", x: 0.40, y: 0.15, terrainType: TerrainType.Plains }
    ]
  },
  townsThreeZone: {
    zonesCount: 3,
    zones: [
      { terrainType: TerrainType.Mountains, vegetation: Vegetation.Shrub, droughtLevel: 0 },
      { terrainType: TerrainType.Foothills, vegetation: Vegetation.Shrub, droughtLevel: 0 },
      { terrainType: TerrainType.Plains, vegetation: Vegetation.Shrub, droughtLevel: 0 },
    ],
    towns: [
      { name: "Skyview", x: 0.12, y: 0.68, terrainType: TerrainType.Mountains },
      { name: "Rolling Rock", x: 0.60, y: 0.25, terrainType: TerrainType.Foothills },
      { name: "Evensville", x: 0.78, y: 0.55, terrainType: TerrainType.Plains },
    ]
  },
  fiveTownsThreeZone: {
    zonesCount: 3,
    zones: [
      { terrainType: TerrainType.Mountains, vegetation: Vegetation.Shrub, droughtLevel: 0 },
      { terrainType: TerrainType.Foothills, vegetation: Vegetation.Shrub, droughtLevel: 0 },
      { terrainType: TerrainType.Plains, vegetation: Vegetation.Shrub, droughtLevel: 0 },
    ],
    towns: [
      { name: "Skyview", x: 0.12, y: 0.68, terrainType: TerrainType.Mountains },
      { name: "Happy Valley", x: 0.4, y: 0.53, terrainType: TerrainType.Foothills },
      { name: "Rolling Rock", x: 0.60, y: 0.25, terrainType: TerrainType.Foothills },
      { name: "Evensville", x: 0.78, y: 0.55, terrainType: TerrainType.Plains },
      { name: "River Run", x: 0.8, y: 0.1, terrainType: TerrainType.Plains },
    ]
  },
  dryTownsThreeZone: {
    zonesCount: 3,
    zones: [
      { terrainType: TerrainType.Mountains, vegetation: Vegetation.Forest, droughtLevel: 1 },
      { terrainType: TerrainType.Foothills, vegetation: Vegetation.Shrub, droughtLevel: 2 },
      { terrainType: TerrainType.Plains, vegetation: Vegetation.Shrub, droughtLevel: 2 },
    ],
    towns: [
      { name: "Peaksburg", x: 0.2, y: 0.55, terrainType: TerrainType.Mountains },
      { name: "Hillsboro", x: 0.4, y: 0.3, terrainType: TerrainType.Foothills },
      { name: "Meadowland", x: 0.8, y: 0.65, terrainType: TerrainType.Plains },
    ]
  },
  defaultThreeZone: {
    zonesCount: 3,
    zones: [
      { terrainType: TerrainType.Mountains, vegetation: Vegetation.Forest, droughtLevel: 0 },
      { terrainType: TerrainType.Foothills, vegetation: Vegetation.Shrub, droughtLevel: 1 },
      { terrainType: TerrainType.Plains, vegetation: Vegetation.Grass, droughtLevel: 2 },
    ],
    towns: [
      { name: "Skyview", x: 0.12, y: 0.68, terrainType: TerrainType.Mountains },
      { name: "Rolling Rock", x: 0.60, y: 0.25, terrainType: TerrainType.Foothills },
      { name: "Evensville", x: 0.78, y: 0.55, terrainType: TerrainType.Plains },
    ]
  },
  threeZonePlains: {
    zonesCount: 3,
    zones: [
      { terrainType: TerrainType.Plains, vegetation: Vegetation.Grass, droughtLevel: 3 },
      { terrainType: TerrainType.Plains, vegetation: Vegetation.Shrub, droughtLevel: 2 },
      { terrainType: TerrainType.Plains, vegetation: Vegetation.Forest, droughtLevel: 0 },
    ]
  },
  threeGreenZonePlains: {
    zonesCount: 3,
    zones: [
      { terrainType: TerrainType.Plains, vegetation: Vegetation.Grass, droughtLevel: 1 },
      { terrainType: TerrainType.Plains, vegetation: Vegetation.Grass, droughtLevel: 1 },
      { terrainType: TerrainType.Plains, vegetation: Vegetation.Grass, droughtLevel: 1 },
    ]
  },
  threeZoneFoothills: {
    zonesCount: 3,
    zones: [
      { terrainType: TerrainType.Foothills, vegetation: Vegetation.Grass, droughtLevel: 1 },
      { terrainType: TerrainType.Foothills, vegetation: Vegetation.Shrub, droughtLevel: 1 },
      { terrainType: TerrainType.Foothills, vegetation: Vegetation.Forest, droughtLevel: 1 },
    ]
  },
  threeGreenZoneFoothills: {
    zonesCount: 3,
    zones: [
      { terrainType: TerrainType.Foothills, vegetation: Vegetation.Grass, droughtLevel: 1 },
      { terrainType: TerrainType.Foothills, vegetation: Vegetation.Grass, droughtLevel: 1 },
      { terrainType: TerrainType.Foothills, vegetation: Vegetation.Grass, droughtLevel: 1 },
    ]
  },
  threeZoneMountains: {
    zonesCount: 3,
    zones: [
      { terrainType: TerrainType.Mountains, vegetation: Vegetation.Shrub, droughtLevel: 1 },
      { terrainType: TerrainType.Mountains, vegetation: Vegetation.Forest, droughtLevel: 1 },
      { terrainType: TerrainType.Mountains, vegetation: Vegetation.Forest, droughtLevel: 1 },
    ]
  },
  threeZoneMix: {
    zonesCount: 3,
    zones: [
      { terrainType: TerrainType.Mountains, vegetation: Vegetation.Grass, droughtLevel: 3 },
      { terrainType: TerrainType.Foothills, vegetation: Vegetation.Shrub, droughtLevel: 3 },
      { terrainType: TerrainType.Plains, vegetation: Vegetation.Forest, droughtLevel: 3 },
    ]
  },
  extremeZones: {
    zonesCount: 3,
    zones: [
      {
        terrainType: TerrainType.Mountains,
        vegetation: Vegetation.Forest,
        droughtLevel: DroughtLevel.MediumDrought
      },
      {
        terrainType: TerrainType.Foothills,
        vegetation: Vegetation.Shrub,
        droughtLevel: DroughtLevel.MediumDrought
      },
      { terrainType: TerrainType.Plains, vegetation: Vegetation.Grass, droughtLevel: DroughtLevel.NoDrought }
    ]
  },
  shrubThreeZone: {
    zonesCount: 3,
    zones: [
      { terrainType: TerrainType.Mountains, vegetation: Vegetation.Shrub, droughtLevel: 1 },
      { terrainType: TerrainType.Foothills, vegetation: Vegetation.Shrub, droughtLevel: 1 },
      { terrainType: TerrainType.Plains, vegetation: Vegetation.Shrub, droughtLevel: 1 },
    ]
  },
  mountainTwoZone: {
    zonesCount: 2,
    zones: [
      { terrainType: TerrainType.Mountains, vegetation: Vegetation.Shrub, droughtLevel: 1 },
      { terrainType: TerrainType.Mountains, vegetation: Vegetation.Shrub, droughtLevel: 1 },
    ]
  },
  plainsTwoZone: {
    zonesCount: 2,
    zones: [
      { terrainType: TerrainType.Plains, vegetation: Vegetation.Shrub, droughtLevel: 1 },
      { terrainType: TerrainType.Plains, vegetation: Vegetation.Shrub, droughtLevel: 1 },
    ]
  },
  mountainsandplainsTwoZone: {
    zonesCount: 2,
    zones: [
      { terrainType: TerrainType.Mountains, vegetation: Vegetation.Shrub, droughtLevel: 1 },
      { terrainType: TerrainType.Plains, vegetation: Vegetation.Shrub, droughtLevel: 1 },
    ]
  },
  hillThreeZone: {
    zonesCount: 3,
    zones: [
      { terrainType: TerrainType.Foothills, vegetation: Vegetation.Shrub, droughtLevel: 0 },
      { terrainType: TerrainType.Foothills, vegetation: Vegetation.Shrub, droughtLevel: 1 },
      { terrainType: TerrainType.Foothills, vegetation: Vegetation.Shrub, droughtLevel: 2 },
    ]
  },
  hillTwoZone: {
    zonesCount: 2,
    zones: [
      { terrainType: TerrainType.Foothills, vegetation: Vegetation.Shrub, droughtLevel: 1 },
      { terrainType: TerrainType.Foothills, vegetation: Vegetation.Shrub, droughtLevel: 1 },
    ]
  },
  extremeZoneMix: {
    zonesCount: 3,
    zones: [
      { terrainType: TerrainType.Mountains, vegetation: Vegetation.Grass, droughtLevel: 3 },
      { terrainType: TerrainType.Foothills, vegetation: Vegetation.Shrub, droughtLevel: 3 },
      { terrainType: TerrainType.Plains, vegetation: Vegetation.Forest, droughtLevel: 3 },
    ]
  },
};

export default presets;
