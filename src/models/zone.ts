import { LandType } from "./fire-model";

export interface ZoneOptions {
  landType?: LandType;
  moistureContent?: number;
}

export class Zone {
  public landType: LandType = LandType.Grass;
  public moistureContent: number = 0; // reasonable range seems to be [0, 0.2]

  constructor(props: ZoneOptions) {
    Object.assign(this, props);
  }
}
