import { action, observable } from "mobx";
import { urlConfigWithDefaultValues } from "../config";

export enum Interaction {
  PlaceSpark = "PlaceSpark",
  Dragging = "Dragging"
}

export enum Draggable {
  Spark = "Spark"
}

export class UIModel {
  @observable public view = urlConfigWithDefaultValues.view;
  @observable public showTerrainUI = false;
  @observable public maxSparks: number;
  @observable public interaction: Interaction | null = null;
  @observable public draggableObject: Draggable | null = null;
  @observable public draggableObjectIdx: number | null = null;

  @action.bound public setDraggableObject(type: Draggable | null, idx: number | null = null) {
    this.draggableObject = type;
    this.draggableObjectIdx = idx;
  }
}
