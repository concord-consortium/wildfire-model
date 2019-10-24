export interface Fuel {
  sav: number;
  packingRatio: number;
  netFuelLoad: number;
  heatContent: number;
  mx: number;
  totalMineralContent: number;
  effectiveMineralContent: number;
  fuelBedDepth: number;
}

export interface Zone {
  terrainType: TerrainType;
  vegetation: VegetationType;
  droughtIndex: DroughtIndex;
}

export type TerrainType = "plains" | "foothills" | "mountains";
export type VegetationType = "shrub" | "smallForest" | "largeForest";
export type DroughtIndex = "none" | "mild" | "medium" | "severe";
