import * as THREE from "three";
import {
  CAMERA_FIT_FOV_DEG, computeOrbitPivot, DESIGN_CAMERA_POS, DESIGN_PLANE_HEIGHT, DESIGN_TARGET_POS,
  TOP_DOWN_CENTER_OFFSET_PX
} from "./orbit-pivot";
import { DEFAULT_UP } from "./helpers";

const DESIGN_CAMERA = new THREE.Vector3(DESIGN_CAMERA_POS.x, DESIGN_CAMERA_POS.y, DESIGN_CAMERA_POS.z);
const DESIGN_TARGET = new THREE.Vector3(DESIGN_TARGET_POS.x, DESIGN_TARGET_POS.y, DESIGN_TARGET_POS.z);
const lookDir = new THREE.Vector3().subVectors(DESIGN_TARGET, DESIGN_CAMERA).normalize();

// Where the ground rectangle's center lands, in CSS px below the canvas center, when the camera
// orbits the pivot to the straight-down end of the tilt. OrbitControls stops just short of
// vertical, since exactly vertical is degenerate with up = +z, so the camera does too.
const topDownCenterOffsetPx = (pivot: THREE.Vector3, canvasHeight: number) => {
  const radius = DESIGN_CAMERA.distanceTo(pivot);
  const polar = 1e-4;
  const camera = new THREE.PerspectiveCamera(CAMERA_FIT_FOV_DEG, 1241 / canvasHeight, 0.01, 100);
  camera.up.set(...DEFAULT_UP);
  camera.position.set(pivot.x, pivot.y - radius * Math.sin(polar), pivot.z + radius * Math.cos(polar));
  camera.lookAt(pivot);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const ndc = new THREE.Vector3(0.5, DESIGN_PLANE_HEIGHT / 2, 0).project(camera);
  return -ndc.y * canvasHeight / 2;
};

describe("computeOrbitPivot", () => {
  it("returns a point on the camera's line of sight", () => {
    const pivot = computeOrbitPivot(DESIGN_CAMERA, lookDir, DESIGN_PLANE_HEIGHT, 463, CAMERA_FIT_FOV_DEG, TOP_DOWN_CENTER_OFFSET_PX);
    const cross = new THREE.Vector3().subVectors(pivot, DESIGN_CAMERA).cross(lookDir);
    expect(cross.length()).toBeLessThan(1e-9);
  });

  it("puts the pivot over the model's center when there is no offset", () => {
    const pivot = computeOrbitPivot(DESIGN_CAMERA, lookDir, DESIGN_PLANE_HEIGHT, 463, CAMERA_FIT_FOV_DEG, 0);
    expect(pivot.y).toBeCloseTo(DESIGN_PLANE_HEIGHT / 2, 12);
  });

  it.each([463, 634, 734, 1014])("centers the top-down model offsetPx below a %ipx canvas's center", (canvasHeight) => {
    const pivot = computeOrbitPivot(DESIGN_CAMERA, lookDir, DESIGN_PLANE_HEIGHT, canvasHeight, CAMERA_FIT_FOV_DEG, TOP_DOWN_CENTER_OFFSET_PX);
    expect(Math.abs(topDownCenterOffsetPx(pivot, canvasHeight) - TOP_DOWN_CENTER_OFFSET_PX)).toBeLessThan(0.5);
  });

  it("matches the pivot measured in the running app at the Chromebook's 463px canvas", () => {
    const pivot = computeOrbitPivot(DESIGN_CAMERA, lookDir, DESIGN_PLANE_HEIGHT, 463, CAMERA_FIT_FOV_DEG, TOP_DOWN_CENTER_OFFSET_PX);
    expect(pivot.x).toBeCloseTo(0.5, 4);
    expect(pivot.y).toBeCloseTo(0.3784, 4);
    expect(pivot.z).toBeCloseTo(-0.0638, 4);
  });
});
