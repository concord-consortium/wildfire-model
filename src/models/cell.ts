import { Zone } from "./zone";

export enum FireState {
  Unburnt = 0,
  Burning = 1,
  Burnt = 2
}

export interface CellOptions {
  x: number;
  y: number;
  zone: Zone;
  elevation?: number;
  ignitionTime?: number;
  fireState?: FireState;
}

export class Cell {
  public x: number;
  public y: number;
  public zone: Zone;
  public elevation: number = 0;
  public ignitionTime: number = Infinity;
  public fireState: FireState = FireState.Unburnt;

  constructor(props: CellOptions) {
    Object.assign(this, props);
  }

  public get landType() {
    return this.zone.landType;
  }

  public get moistureContent() {
    return this.zone.moistureContent;
  }
}
