import { observable } from "mobx";
import { urlConfigWithDefaultValues } from "../config";

export enum Interaction {
  PlaceSpark = "PlaceSpark",
  Dragging = "Dragging"
}

export class UIModel {
  @observable public view = urlConfigWithDefaultValues.view;
  @observable public showTerrainUI = false;
  @observable public maxSparks: number;

  @observable public interaction: Interaction | null = null;
  @observable public hoverDistance: number = Infinity;
  @observable public hoverTarget: THREE.Object3D | null = null;
}
