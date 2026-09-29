import * as THREE from "three";

// Design FOV. Must match the value the PerspectiveCamera ends up rendering at.
// Hardcoded rather than read from `camera.fov` because the fitter effect runs
// before drei's PerspectiveCamera has applied its fov prop (the r3f Canvas
// default is 75, not our 33).
export const CAMERA_FIT_FOV_DEG = 33;
// Default camera pose, chosen by the PIs via the ?cameraSettings=true panel and
// captured on the default preset. In view units (PLANE_WIDTH = 1). CameraFitter
// preserves this look-angle and design distance, pulling farther back only on
// narrow viewports.
export const DESIGN_CAMERA_POS = { x: 0.5, y: -0.35, z: 1.285 };
export const DESIGN_TARGET_POS = { x: 0.5, y: 0.263, z: 0.15 };
// planeHeight of the preset the pose was captured on (default: 80000/120000).
// The depth-axis (y) components scale by planeHeight / this so the framing
// adapts to presets with a different model aspect ratio.
export const DESIGN_PLANE_HEIGHT = 80000 / 120000;
// How far the student can tilt from straight down (polar angle 0).
export const MAX_POLAR_ANGLE = Math.PI * 0.4;

// The HTML that covers the canvas: the zone labels (60px plus a 10px margin) from the canvas top,
// and the bottom bar's overlap of the canvas bottom. The Cypress framing test guards both against
// layout drift.
export const LABEL_STRIP_PX = 70;
export const BAR_OVERLAP_PX = 22;
// How far below the canvas center, in CSS px, the top-down view should put the model's center: the
// middle of the uncovered gap.
export const TOP_DOWN_CENTER_OFFSET_PX = (LABEL_STRIP_PX - BAR_OVERLAP_PX) / 2;
// Space, in CSS px, the straight-down model should leave between itself and the zone labels and
// the bottom bar. 0 leaves the model at the size the orbit radius gives it.
export const TOP_DOWN_MARGIN_PX = 0;

// The orbit target on the camera's line of sight at which a straight-down view shows the model's
// ground-level center `offsetPx` CSS px below the canvas center. Seen from above, the camera sits
// at height H = t + pivot.z over a pivot t along the line, and the canvas shows
// canvasHeight / (2 H tan(fov / 2)) px per view unit, so the pivot must lead the model's center
// (planeHeight / 2) by offsetPx / that. Solved for t in closed form.
export function computeOrbitPivot(
  cameraPos: THREE.Vector3,
  lookDir: THREE.Vector3,   // unit vector from the camera toward the ground
  planeHeight: number,
  canvasHeight: number,
  fovDeg: number,
  offsetPx: number,
): THREE.Vector3 {
  const k = offsetPx * 2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2) / canvasHeight;
  const t = (planeHeight / 2 + k * cameraPos.z - cameraPos.y) / (lookDir.y - k * (1 + lookDir.z));
  return cameraPos.clone().addScaledVector(lookDir, t);
}
