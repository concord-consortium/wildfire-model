import { observable, action } from "mobx";
import { urlConfigWithDefaultValues } from "../config";

export enum Interaction {
  PlaceSpark = "PlaceSpark",
}

export class UIModel {
  // @observable public view = urlConfigWithDefaultValues.view;
  @observable public showTerrainUI = true;
  @observable public maxSparks: number;

  @observable public interaction: Interaction | null = null;

  @observable public dragging: boolean = false;
  @observable public hoverDistance: number = Infinity;
  @observable public hoverTarget: THREE.Object3D | null = null;

  @action.bound public setHoverTarget(target: THREE.Object3D, distance: number) {
    this.hoverTarget = target;
    this.hoverDistance = distance;
  }

  @action.bound public resetHoverTarget() {
    this.hoverTarget = null;
    this.hoverDistance = Infinity;
  }
}
