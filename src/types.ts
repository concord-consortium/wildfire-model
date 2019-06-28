import { LandType } from "./models/fire-model";

export interface GridCell {
  x: number;
  y: number;
  landType: LandType;
  elevation: number;
  fire: number;
}

export interface Fuel {
  sav: number;
  packingRatio: number;
  netFuelLoad: number;
  heatContent: number;
  moistureContent: number;
  mx: number;
  totalMineralContent: number;
  effectiveMineralContent: number;
  fuelBedDepth: number;
}
