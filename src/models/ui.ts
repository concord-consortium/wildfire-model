import { observable, makeObservable } from "mobx";

export enum Interaction {
  PlaceSpark = "PlaceSpark",
  DrawFireLine = "DrawFireLine",
  HoverOverDraggable = "HoverOverDraggable",
  Helitack = "Helitack"
}

export class UIModel {
  @observable public showChart = false;
  @observable public showTerrainUI = false;
  @observable public terrainUISelectedZone?: number = undefined;
  @observable public maxSparks: number;

  @observable public interaction: Interaction | null = null;
  @observable public dragging = false;

  constructor() {
    makeObservable(this);
  }
}
