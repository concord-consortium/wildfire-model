import { LandType, TerrainType } from "./fire-model";
import { observable } from "mobx";

export interface ZoneOptions {
  landType?: LandType;
  moistureContent?: number;
  terrainType?: TerrainType;
}

export class Zone {
  @observable public landType: LandType = LandType.Grass;
  @observable public moistureContent: number = 0; // reasonable range seems to be [0, 0.2]
  @observable public terrainType: TerrainType = TerrainType.Foothills;

  constructor(props: ZoneOptions) {
    Object.assign(this, props);
  }
}
