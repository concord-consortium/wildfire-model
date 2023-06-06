import { Vegetation, TerrainType, DroughtLevel } from "../types";
import { observable, makeObservable } from "mobx";

export interface ZoneOptions {
  vegetation?: Vegetation;
  terrainType?: TerrainType;
  droughtLevel?: number;
}

// values for each level of vegetation: Grass, Shrub, Forest, ForestWithSuppression
export const moistureLookups: {[key in DroughtLevel]: number[]} = {
  [DroughtLevel.NoDrought]: [0.1275, 0.255, 0.17, 0.2125],
  [DroughtLevel.MildDrought]: [0.09, 0.18, 0.12, 0.15],
  [DroughtLevel.MediumDrought]: [0.0525, 0.105, 0.07, 0.0875],
  [DroughtLevel.SevereDrought]: [0.015, 0.03, 0.02, 0.025],
};


export class Zone {
  @observable public vegetation: Vegetation = Vegetation.Grass;
  @observable public terrainType: TerrainType = TerrainType.Foothills;
  @observable public droughtLevel: DroughtLevel = DroughtLevel.MildDrought;

  constructor(props?: ZoneOptions) {
    makeObservable(this);
    Object.assign(this, props);
  }

  clone() {
    return new Zone({
      vegetation: this.vegetation,
      terrainType: this.terrainType,
      droughtLevel: this.droughtLevel,
    });
  }
}
