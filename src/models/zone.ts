import { LandType, TerrainType, DroughtLevel } from "./fire-model";
import { observable } from "mobx";

export interface ZoneOptions {
  landType?: LandType;
  moistureContent?: number; // calculated from drought & land type values
  terrainType?: TerrainType;
  droughtLevel?: number;
}

export class Zone {
  @observable public landType: LandType = LandType.Grass;
  @observable public moistureContent: number = 0; // reasonable range seems to be [0, 0.2]
  @observable public terrainType: TerrainType = TerrainType.Foothills;
  @observable public droughtLevel: DroughtLevel = DroughtLevel.MildDrought;

  constructor(props: ZoneOptions) {
    Object.assign(this, props);
  }
}
