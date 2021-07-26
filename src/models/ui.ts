import { observable, action } from "mobx";

export enum Interaction {
  PlaceSpark = "PlaceSpark",
  DrawFireLine = "DrawFireLine",
  HoverOverDraggable = "HoverOverDraggable",
  Helitack = "Helitack"
}

export class UIModel {
  @observable public showChart = false;
  @observable public showTerrainUI = false;
  @observable public terrainUISelectedZone = 0;
  @observable public maxSparks: number;

  @observable public interaction: Interaction | null = null;
  @observable public dragging: boolean = false;
}
