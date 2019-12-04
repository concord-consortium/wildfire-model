import { Vegetation, TerrainType, DroughtLevel, moistureLookups } from "./fire-model";
import { observable } from "mobx";

export interface ZoneOptions {
  vegetation?: Vegetation;
  terrainType?: TerrainType;
  droughtLevel?: number;
}

export class Zone {
  @observable public vegetation: Vegetation = Vegetation.Grass;
  @observable public terrainType: TerrainType = TerrainType.Foothills;
  @observable public droughtLevel: DroughtLevel = DroughtLevel.MildDrought;

  constructor(props: ZoneOptions) {
    Object.assign(this, props);
  }

  public get moistureContent() {
    return moistureLookups[this.droughtLevel][this.vegetation];
  }
}
