import { observable, action } from "mobx";

export enum Interaction {
  PlaceSpark = "PlaceSpark",
  DrawFireLine = "DrawFireLine",
}

export class UIModel {
  @observable public showTerrainUI = false;
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
