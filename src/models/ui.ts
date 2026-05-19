import { observable, makeObservable } from "mobx";
import { CHART_TAB_INITIAL_OPEN } from "../hazbot/wildfire/constants";

export enum Interaction {
  PlaceSpark = "PlaceSpark",
  DrawFireLine = "DrawFireLine",
  HoverOverDraggable = "HoverOverDraggable",
  Helitack = "Helitack"
}

export class UIModel {
  @observable public showChart = CHART_TAB_INITIAL_OPEN;
  @observable public showTerrainUI = false;
  @observable public terrainUISelectedZone?: number = undefined;
  @observable public maxSparks: number;

  @observable public interaction: Interaction | null = null;
  @observable public dragging = false;

  constructor() {
    makeObservable(this);
  }
}
