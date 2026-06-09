import { makeAutoObservable } from "mobx";

// Module-level observable used only when ?cameraSettings=true. Drives the
// readout panel in the top bar and lets the panel push a chosen FOV back into
// the PerspectiveCamera.
class CameraDebugStore {
  position: [number, number, number] = [0, 0, 0];
  target: [number, number, number] = [0, 0, 0];
  fov = 33;

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
}

export const cameraDebugStore = new CameraDebugStore();
