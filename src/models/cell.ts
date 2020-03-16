import { Zone } from "./zone";
import { Vegetation } from "./fire-model";

export enum FireState {
  Unburnt = 0,
  Burning = 1,
  Burnt = 2
}

// See: https://www.pivotaltracker.com/story/show/170344417
export enum BurnIndex {
  Low = 0,
  Medium = 1,
  High = 2
}

export interface CellOptions {
  x: number;
  y: number;
  zone: Zone;
  baseElevation?: number;
  ignitionTime?: number;
  fireState?: FireState;
  isUnburntIsland?: boolean;
  isRiver?: boolean;
  isFireLine?: boolean;
  isFireLineUnderConstruction?: boolean;
}

const FIRE_LINE_DEPTH = 2000;
const MAX_BURN_TIME = 500;

export class Cell {
  public x: number;
  public y: number;
  public zone: Zone;
  public baseElevation: number = 0;
  public ignitionTime: number = Infinity;
  public spreadRate: number = 0;
  public burnTime: number = MAX_BURN_TIME;
  public fireState: FireState = FireState.Unburnt;
  public isUnburntIsland: boolean = false;
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
    if (this.isBurnable) {
      return this.zone.moistureContent;
    }
    return Infinity;
  }

  public get isBurnable() {
    return !this.isRiver && !this.isUnburntIsland && !this.isFireLine;
  }

  public get droughtLevel() {
    return this.zone.droughtLevel;
  }

  public get isBurningOrWillBurn() {
    return this.fireState === FireState.Burning || this.fireState === FireState.Unburnt && this.ignitionTime < Infinity;
  }

  public get burnIndex() {
    // Values based on: https://www.pivotaltracker.com/story/show/170344417/comments/209774367
    if (this.vegetation === Vegetation.Grass) {
      if (this.spreadRate < 45) {
        return BurnIndex.Low;
      }
      return BurnIndex.Medium;
    }
    if (this.vegetation === Vegetation.Shrub) {
      if (this.spreadRate < 10) {
        return BurnIndex.Low;
      }
      if (this.spreadRate < 20) {
        return BurnIndex.Medium;
      }
      return BurnIndex.High;
    }
    if (this.vegetation === Vegetation.ForestSmallLitter) {
      if (this.spreadRate < 25) {
        return BurnIndex.Low;
      }
      return BurnIndex.Medium;
    }
    // this.vegetation === Vegetation.ForestLargeLitter
    if (this.spreadRate < 12) {
      return BurnIndex.Low;
    }
    if (this.spreadRate < 25) {
      return BurnIndex.Medium;
    }
    return BurnIndex.High;
  }

  public reset() {
    this.ignitionTime = Infinity;
    this.spreadRate = 0;
    this.burnTime = MAX_BURN_TIME;
    this.fireState = FireState.Unburnt;
    this.isFireLineUnderConstruction = false;
    this.isFireLine = false;
  }
}
