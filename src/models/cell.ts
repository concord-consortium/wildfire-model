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
  baseElevation?: number;
  ignitionTime?: number;
  fireState?: FireState;
  isRiver?: boolean;
  isFireLine?: boolean;
  isFireLineUnderConstruction?: boolean;
}

const FIRE_LINE_DEPTH = 2000;

export class Cell {
  public x: number;
  public y: number;
  public zone: Zone;
  public baseElevation: number = 0;
  public ignitionTime: number = Infinity;
  public burnTime: number = Infinity;
  public fireState: FireState = FireState.Unburnt;
  public isRiver: boolean = false;
  public isFireLine: boolean = false;
  public isFireLineUnderConstruction: boolean = false;

  constructor(props: CellOptions) {
    Object.assign(this, props);
  }

  public get vegetation() {
    return this.zone.vegetation;
  }

  public get elevation() {
    if (this.isFireLine) {
      return this.baseElevation - FIRE_LINE_DEPTH;
    }
    return this.baseElevation;
  }

  public get moistureContent() {
    if (this.isRiver || this.isFireLine) {
      return Infinity;
    }
    return this.zone.moistureContent;
  }

  public get droughtLevel() {
    return this.zone.droughtLevel;
  }

  public reset() {
    this.ignitionTime = Infinity;
    this.burnTime = Infinity;
    this.fireState = FireState.Unburnt;
    this.isFireLineUnderConstruction = false;
    this.isFireLine = false;
  }
}
