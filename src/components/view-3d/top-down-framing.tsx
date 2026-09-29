import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useStores } from "../../use-stores";
import { cameraDebugStore } from "./camera-debug-store";
import { BAR_OVERLAP_PX, LABEL_STRIP_PX, TOP_DOWN_CENTER_OFFSET_PX, TOP_DOWN_MARGIN_PX } from "./orbit-pivot";
import { DEFAULT_UP, ftToViewUnit, planeHeight } from "./helpers";

export interface TopDownZoomInput {
  polar: number;          // radians
  designPolar: number;    // the default pose's polar angle, radians
  canvasHeight: number;   // CSS px
  silhouettePx: number;   // straight-down height of the terrain's bounding box, CSS px
  marginPx: number;
}

// Floor for the zoom, so a margin wider than the gap allows cannot collapse or flip the projection.
const MIN_TOP_DOWN_ZOOM = 0.1;

// The zoom that shrinks the straight-down model until it clears the gap between the zone labels
// and the bottom bar by marginPx at both edges: 1 at the default pose and flatter, eased toward
// straight down, where the matching image shift is exact. Never enlarges.
export const topDownZoom = ({ polar, designPolar, canvasHeight, silhouettePx, marginPx }: TopDownZoomInput) => {
  if (marginPx <= 0 || silhouettePx <= 0) return 1;
  const gapPx = canvasHeight - LABEL_STRIP_PX - BAR_OVERLAP_PX;
  const zTop = THREE.MathUtils.clamp((gapPx - 2 * marginPx) / silhouettePx, MIN_TOP_DOWN_ZOOM, 1);
  const t = THREE.MathUtils.smoothstep(1 - polar / designPolar, 0, 1);
  return 1 - t * (1 - zTop);
};

// Applies topDownZoom through the projection, with a vertical view offset that keeps the model's
// center where the orbit pivot puts it, so OrbitControls' distance and limits are untouched. The
// raycaster inverts the projection matrix, so clicks still land under the pointer.
export const TopDownFraming = ({ targetPos, designPos }: {
  targetPos: [number, number, number];
  designPos: [number, number, number];
}) => {
  const { camera, controls, size } = useThree();
  const simulation = useStores().simulation;
  const lastKey = useRef("");
  const maxElevation = useRef({ flag: -1, value: 0 });
  const designPolar = useMemo(
    () => new THREE.Vector3(...designPos).sub(new THREE.Vector3(...targetPos)).angleTo(new THREE.Vector3(...DEFAULT_UP)),
    [targetPos, designPos]
  );

  useFrame(() => {
    const perspective = camera as THREE.PerspectiveCamera;
    const orbit = controls as unknown as { getPolarAngle?: () => number; getDistance?: () => number; target: THREE.Vector3 } | null;
    if (typeof perspective.fov !== "number" || !orbit?.getPolarAngle || !orbit.getDistance) return;

    const cameraSettings = simulation.config.cameraSettings;
    const marginPx = cameraSettings ? cameraDebugStore.topDownMarginPx : TOP_DOWN_MARGIN_PX;
    const applied = perspective.zoom !== 1 || !!perspective.view?.enabled;
    if (marginPx <= 0 && !applied) return;
    const offsetPx = cameraSettings ? cameraDebugStore.centerOffsetPx : TOP_DOWN_CENTER_OFFSET_PX;
    const polar = orbit.getPolarAngle();
    const distance = orbit.getDistance();
    const flag = simulation.cellsElevationFlag;
    const key = [marginPx, offsetPx, polar, distance, flag, size.width, size.height, perspective.fov].join();
    if (key === lastKey.current) return;
    lastKey.current = key;

    if (maxElevation.current.flag !== flag) {
      let max = 0;
      for (const cell of simulation.cells) max = Math.max(max, cell.elevation);
      maxElevation.current = { flag, value: max * ftToViewUnit(simulation) };
    }
    // Straight down, the camera sits `distance` above the pivot.
    const depth = distance + orbit.target.z - maxElevation.current.value;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(perspective.fov) / 2);
    const silhouettePx = planeHeight(simulation) * size.height / (2 * depth * tanHalf);

    const zoom = topDownZoom({ polar, designPolar, canvasHeight: size.height, silhouettePx, marginPx });
    if (zoom === 1 && !applied) return;
    perspective.zoom = zoom;
    if (zoom < 1) {
      perspective.setViewOffset(size.width, size.height, 0, -offsetPx * (1 - zoom), size.width, size.height);
    } else {
      perspective.clearViewOffset();
    }
    perspective.updateProjectionMatrix();
  });
  return null;
};
