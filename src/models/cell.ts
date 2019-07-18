import {LandType} from "./fire-model";

export enum FireState {
  Unburnt = 0,
  Burning = 1,
  Burnt = 2
}

export interface CellOptions {
  x?: number;
  y?: number;
  landType?: LandType;
  elevation?: number;
  ignitionTime?: number;
  fireState?: FireState;
}

export class Cell {
  public x: number;
  public y: number;
  public landType: LandType = LandType.Grass;
  public elevation: number = 0;
  public ignitionTime: number = Infinity;
  public fireState: FireState = FireState.Unburnt;

  constructor(props: CellOptions) {
    Object.assign(this, props);
  }
}
