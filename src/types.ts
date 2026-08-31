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

// DATA labels: logged in the SimulationStarted and ZoneUpdated payloads, and
// compared against by the Hazbot matcher (hazbot/wildfire/sim-props.ts), so they
// are effectively wire format. Display sites read the two maps below instead; do
// not sync these to them.
export const vegetationLabels: Record<Vegetation, string> = {
  [Vegetation.Grass]: "Grass",
  [Vegetation.Shrub]: "Shrub",
  [Vegetation.Forest]: "Forest",
  [Vegetation.ForestWithSuppression]: "Forest With Suppression"
};

// DISPLAY labels. Rendered text only, safe to change. ForestWithSuppression reads
// with a lowercase "with" on screen while still logging and matching as
// "Forest With Suppression".
export const vegetationDisplayLabels: Record<Vegetation, string> = {
  ...vegetationLabels,
  [Vegetation.ForestWithSuppression]: "Forest with Suppression",
};

// ABBREVIATED display labels, for surfaces too narrow for the full spelling. The
// map's own name is the contract: only ForestWithSuppression differs. The
// non-breaking space is load-bearing: in a 48px box "Forest w" (47.2px) still
// fits one line, so a plain space wraps this as "Forest w" / "Suppr." instead of
// "Forest" / "w Suppr.".
export const vegetationAbbreviatedLabels: Record<Vegetation, string> = {
  ...vegetationDisplayLabels,
  [Vegetation.ForestWithSuppression]: "Forest w\u00A0Suppr.",
};

export enum TerrainType {
  Plains = 0,
  Foothills = 1,
  Mountains = 2
}

// DATA labels: logged in the SimulationStarted and ZoneUpdated payloads, and
// compared against by the Hazbot matcher (sim-props.ts, derive-defaults.ts), so
// they are effectively wire format. The UI renders "Hills" for Foothills via
// terrainDisplayLabels below; do not sync these to it.
export const terrainLabels: Record<TerrainType, string> = {
  [TerrainType.Plains]: "Plains",
  [TerrainType.Foothills]: "Foothills",
  [TerrainType.Mountains]: "Mountains",
};

// DISPLAY labels. Rendered text only, safe to change. TerrainType.Foothills
// reads as "Hills" on screen (students did not know the word "foothill") while
// still logging and matching as "Foothills".
export const terrainDisplayLabels: Record<TerrainType, string> = {
  ...terrainLabels,
  [TerrainType.Foothills]: "Hills",
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
