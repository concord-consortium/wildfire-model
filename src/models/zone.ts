import { LandType } from "./fire-model";
import { TerrainType } from "../types";

export interface ZoneOptions {
  landType?: LandType;
  moistureContent?: number;
  terrainType?: TerrainType;
}

export class Zone {
  public landType: LandType = LandType.Grass;
  public moistureContent: number = 0; // reasonable range seems to be [0, 0.2]
  public terrainType: TerrainType = "foothills";

  constructor(props: ZoneOptions) {
    Object.assign(this, props);
  }
}
