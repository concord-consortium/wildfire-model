import { makeAutoObservable } from "mobx";
import { TOP_DOWN_CENTER_OFFSET_PX, TOP_DOWN_MARGIN_PX } from "./orbit-pivot";

// Module-level observable used only when ?cameraSettings=true. Drives the
// readout panel in the top bar and lets the panel push a chosen FOV and the
// top-down framing values back into the 3D view.
class CameraDebugStore {
  position: [number, number, number] = [0, 0, 0];
  target: [number, number, number] = [0, 0, 0];
  fov = 33;
  polarDeg = 0;
  centerOffsetPx = TOP_DOWN_CENTER_OFFSET_PX;
  topDownMarginPx = TOP_DOWN_MARGIN_PX;

  constructor() {
    makeAutoObservable(this);
  }

  setPose(position: [number, number, number], target: [number, number, number]) {
    this.position = position;
    this.target = target;
  }

  setFov(fov: number) {
    this.fov = fov;
  }

  setPolarDeg(deg: number) {
    this.polarDeg = deg;
  }

  setCenterOffsetPx(px: number) {
    this.centerOffsetPx = px;
  }

  setTopDownMarginPx(px: number) {
    this.topDownMarginPx = px;
  }
}

export const cameraDebugStore = new CameraDebugStore();
