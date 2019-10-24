import { SimulationModel } from "../../models/simulation";
import * as THREE from "three";

export const DEFAULT_UP = new THREE.Vector3(0, 0, 1);

export const PLANE_WIDTH = 1;

export const planeHeight = (simulation: SimulationModel) =>
  simulation.config.modelHeight * PLANE_WIDTH / simulation.config.modelWidth;

// Ratio between model unit (feet) and 3D view distance unit (unitless).
export const ftToViewUnit = (simulation: SimulationModel) => PLANE_WIDTH / simulation.config.modelWidth;

interface IIntersectsInput {
  event: MouseEvent;
  canvas: HTMLCanvasElement;
  camera: THREE.Camera;
  object: THREE.Object3D;
}

export const intersects = ({ event, canvas, camera, object }: IIntersectsInput) => {
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  // Raycaster is expecting normalized mouse position.
  mouse.x = (event.clientX / canvas.offsetWidth ) * 2 - 1;
  mouse.y = -(event.clientY / canvas.offsetHeight ) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const result = raycaster.intersectObject(object);
  return result[0] || null;
};
