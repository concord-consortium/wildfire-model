import { Vector2 } from "three";

export interface Fuel {
  sav: number;
  packingRatio: number;
  netFuelLoad: number;
  mx: number;
  fuelBedDepth: number;
}

export interface Town {
  name: string;
  position: Vector2;
}

export enum Vegetation {
  Grass = 0,
  Shrub = 1,
  Forest = 2,
  ForestWithSuppression = 3
}

export const vegetationLabels: Record<Vegetation, string> = {
  [Vegetation.Grass]: "Grass",
  [Vegetation.Shrub]: "Shrub",
  [Vegetation.Forest]: "Forest",
  [Vegetation.ForestWithSuppression]: "Forest With Suppression"
};

export enum TerrainType {
  Plains = 0,
  Foothills = 1,
  Mountains = 2
}

export const terrainLabels: Record<TerrainType, string> = {
  [TerrainType.Plains]: "Plains",
  [TerrainType.Foothills]: "Foothills",
  [TerrainType.Mountains]: "Mountains",
};

export enum DroughtLevel {
  NoDrought = 0,
  MildDrought = 1,
  MediumDrought = 2,
  SevereDrought = 3
}

export const droughtLabels: Record<DroughtLevel, string> = {
  [DroughtLevel.NoDrought]: "No Drought",
  [DroughtLevel.MildDrought]: "Mild Drought",
  [DroughtLevel.MediumDrought]: "Medium Drought",
  [DroughtLevel.SevereDrought]: "Severe Drought",
};

export interface IWindProps {
  // Wind speed in mph.
  speed: number;
  // Angle in degrees following this definition: https://en.wikipedia.org/wiki/Wind_direction
  // 0 is northern wind, 90 is eastern wind.
  direction: number;
}
