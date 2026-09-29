import React, { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls , PerspectiveCamera } from "@react-three/drei";
import { observer, Provider } from "mobx-react";
import { useStores } from "../../use-stores";
import { DEFAULT_UP, ftToViewUnit, PLANE_WIDTH, planeHeight } from "./helpers";
import { Terrain } from "./terrain";
import { ZoneLines } from "./zone-lines";
import { SparksContainer } from "./spark";
import * as THREE from "three";
import { FireLineMarkersContainer } from "./fire-line-marker";
import { TownMarkersContainer } from "./town-marker";
import { log } from "../../log";
import Shutterbug from "shutterbug";
import { cameraDebugStore } from "./camera-debug-store";
import {
  CAMERA_FIT_FOV_DEG, computeOrbitPivot, DESIGN_CAMERA_POS, DESIGN_PLANE_HEIGHT, DESIGN_TARGET_POS,
  MAX_POLAR_ANGLE, TOP_DOWN_CENTER_OFFSET_PX
} from "./orbit-pivot";
import { TopDownFraming } from "./top-down-framing";

// This needs to be a separate component, as useThree depends on context provided by <Canvas> component.
const ShutterbugSupport = () => {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    const render = () => {
      gl.render(scene, camera);
    };
    Shutterbug.on("saycheese", render);
    return () => Shutterbug.off("saycheese", render);
  }, [gl, scene, camera]);
  return null;
};

// Fits the terrain bounding box into the viewport by preserving the
// designer-chosen look-angle (direction from target to camera) and adjusting
// only the camera distance. Keeps a fixed % margin around the terrain so the
// composition reads the same on a wide Chromebook screen as on a narrower
// embedded viewport. Re-fits whenever the viewport size or design pose changes.
const TERRAIN_FIT_MARGIN = 1.05;

const CameraFitter = ({ targetPos, designPos, offsetPx }: {
  targetPos: [number, number, number];
  designPos: [number, number, number];
  offsetPx: number;
}) => {
  const { camera, size, controls } = useThree();
  const simulation = useStores().simulation;
  const fittedRef = useRef(false);
  // Clear the guard whenever the viewport size or design pose changes so the
  // next frame recalculates the distance. Without this the camera would stay
  // at the stale fit after a browser/embed resize and could reintroduce the
  // narrow-viewport clipping the fitter exists to prevent. Also on a new
  // OrbitControls instance, which drei swaps in at mount, dropping the first fit.
  useEffect(() => {
    fittedRef.current = false;
  }, [size.width, size.height, targetPos, designPos, offsetPx, controls]);
  // Runs every frame but short-circuits after the latest successful fit. We
  // need to wait for OrbitControls to be mounted (so we can call its
  // update() and have it re-derive its internal spherical from the new
  // camera position); a useEffect could fire before that.
  useFrame(() => {
    if (fittedRef.current) return;
    // Duck-type instead of `instanceof THREE.PerspectiveCamera` because drei
    // bundles its own Three.js instance.
    if (typeof (camera as { fov?: number }).fov !== "number") return;
    if (!controls) return;

    const target = new THREE.Vector3(...targetPos);
    const designCamera = new THREE.Vector3(...designPos);
    const offsetDir = new THREE.Vector3().subVectors(designCamera, target).normalize();
    const lookDir = offsetDir.clone().negate();

    const w = PLANE_WIDTH;
    const h = planeHeight(simulation);
    // Max terrain elevation in world units, matching the terrain geometry
    // (cell.elevation * ftToViewUnit). Using the actual scale rather than a
    // fixed guess keeps tall peaks from clipping at narrow viewports.
    const elev = simulation.config.heightmapMaxElevation * ftToViewUnit(simulation);
    const corners: THREE.Vector3[] = [];
    for (const x of [0, w]) {
      for (const y of [0, h]) {
        for (const z of [0, elev]) {
          corners.push(new THREE.Vector3(x, y, z));
        }
      }
    }

    const worldUp = new THREE.Vector3(DEFAULT_UP[0], DEFAULT_UP[1], DEFAULT_UP[2]);
    const right = new THREE.Vector3().crossVectors(lookDir, worldUp).normalize();
    const screenUp = new THREE.Vector3().crossVectors(right, lookDir).normalize();

    let maxRight = 0;
    let maxUp = 0;
    for (const c of corners) {
      const off = new THREE.Vector3().subVectors(c, target);
      maxRight = Math.max(maxRight, Math.abs(off.dot(right)));
      maxUp = Math.max(maxUp, Math.abs(off.dot(screenUp)));
    }

    const fovV = THREE.MathUtils.degToRad(CAMERA_FIT_FOV_DEG);
    const aspect = size.width / size.height;
    const tanHalfV = Math.tan(fovV / 2);
    const distH = (maxUp / tanHalfV) * TERRAIN_FIT_MARGIN;
    const distW = (maxRight / (aspect * tanHalfV)) * TERRAIN_FIT_MARGIN;
    // The designer-chosen distance is what the camera should sit at when the
    // viewport aspect is "design-friendly" (i.e. wide enough that the terrain
    // already fits with comfortable margins). Only pull farther back when the
    // current aspect is narrower than that and the terrain would otherwise
    // overflow the viewport edges.
    const designDistance = new THREE.Vector3().subVectors(designCamera, target).length();
    const distance = Math.max(designDistance, distH, distW);

    camera.position.copy(target).addScaledVector(offsetDir, distance);
    camera.updateProjectionMatrix();
    // Placed from the design target so the default view never moves, but orbiting a pivot further
    // along the same line of sight, which centers the straight-down view between labels and bar.
    const pivot = computeOrbitPivot(camera.position, lookDir, h, size.height, CAMERA_FIT_FOV_DEG, offsetPx);
    (controls as unknown as { target: THREE.Vector3 }).target.copy(pivot);
    // Re-sync OrbitControls' internal spherical so it doesn't snap back to
    // its captured-at-mount position on the next frame.
    (controls as unknown as { update?: () => void }).update?.();
    fittedRef.current = true;
  });
  return null;
};

// Pushes the live camera position, OrbitControls target and polar angle into
// cameraDebugStore each frame so the top-bar camera-settings panel can display them. Also
// exposes the camera + controls on window.debugCamera so a designer or test
// harness can imperatively set a pose without dispatching pointer events.
const CameraDebugTracker = () => {
  const { camera, controls } = useThree();
  useEffect(() => {
    (window as unknown as { debugCamera?: unknown }).debugCamera = { camera, controls };
    return () => {
      delete (window as unknown as { debugCamera?: unknown }).debugCamera;
    };
  }, [camera, controls]);
  useFrame(() => {
    const t = (controls as unknown as { target?: THREE.Vector3 })?.target;
    if (!t) return;
    const { x: px, y: py, z: pz } = camera.position;
    const sp = cameraDebugStore.position;
    const st = cameraDebugStore.target;
    if (sp[0] !== px || sp[1] !== py || sp[2] !== pz || st[0] !== t.x || st[1] !== t.y || st[2] !== t.z) {
      cameraDebugStore.setPose([px, py, pz], [t.x, t.y, t.z]);
    }
    const polarDeg = THREE.MathUtils.radToDeg((controls as unknown as { getPolarAngle: () => number }).getPolarAngle());
    if (polarDeg !== cameraDebugStore.polarDeg) cameraDebugStore.setPolarDeg(polarDeg);
  });
  return null;
};

export const View3d = observer(function View3d() {
  const stores = useStores();
  const simulation = stores.simulation;
  const ui = stores.ui;
  // Scale the design pose's depth axis by planeHeight so other-aspect presets
  // stay framed. Memoize so CameraFitter doesn't see a "new" array literal each
  // re-render and re-fit, which would snap a tilted camera back to the default pose.
  const yScale = planeHeight(simulation) / DESIGN_PLANE_HEIGHT;
  const cameraPos = useMemo<[number, number, number]>(
    () => [DESIGN_CAMERA_POS.x, DESIGN_CAMERA_POS.y * yScale, DESIGN_CAMERA_POS.z], [yScale]
  );
  const targetPos = useMemo<[number, number, number]>(
    () => [DESIGN_TARGET_POS.x, DESIGN_TARGET_POS.y * yScale, DESIGN_TARGET_POS.z], [yScale]
  );
  const terrainRef = useRef<THREE.Mesh>(null);
  const cameraSettingsEnabled = simulation.config.cameraSettings;
  // When the cameraSettings dev panel is active, the panel's FOV slider drives
  // the camera's FOV; otherwise the camera uses the default design FOV.
  const fov = cameraSettingsEnabled ? cameraDebugStore.fov : CAMERA_FIT_FOV_DEG;
  const centerOffsetPx = cameraSettingsEnabled ? cameraDebugStore.centerOffsetPx : TOP_DOWN_CENTER_OFFSET_PX;

  return (
    /* eslint-disable react/no-unknown-property */
    // See: https://github.com/jsx-eslint/eslint-plugin-react/issues/3423
    // flat=true disables tone mapping that is not a default in threejs, but is enabled by default in react-three-fiber.
    // It makes textures match colors in the original image.
    <Canvas camera={{manual: true}} flat={true} onPointerMissed={(e) => {
      const canvas = e.target as HTMLElement | null;
      const rect = canvas?.getBoundingClientRect();
      log("SimulationClicked", {
        hit3d: false,
        clientX: e.clientX,
        clientY: e.clientY,
        percentX: rect ? Math.round(((e.clientX - rect.left) / rect.width) * 100) : undefined,
        percentY: rect ? Math.round(((e.clientY - rect.top) / rect.height) * 100) : undefined
      });
    }}>
      {/* Why do we need to setup provider again? No idea. It seems that components inside Canvas don't have
          access to MobX stores anymore. */}
      <Provider stores={stores}>
        {/* Position is intentionally NOT passed: CameraFitter owns it (otherwise
            drei would re-apply the prop on subsequent renders and clobber the fit). */}
        <PerspectiveCamera makeDefault={true} fov={fov} up={DEFAULT_UP}/>
        <CameraFitter targetPos={targetPos} designPos={cameraPos} offsetPx={centerOffsetPx}/>
        <TopDownFraming targetPos={targetPos} designPos={cameraPos}/>
        {cameraSettingsEnabled && <CameraDebugTracker/>}
        {/* Target is intentionally NOT passed: CameraFitter owns it (otherwise
            drei would apply the prop to each new instance over the fit). */}
        <OrbitControls
          makeDefault={true}
          enableDamping={true}
          enableRotate={!ui.dragging} // disable rotation when something is being dragged
          enablePan={cameraSettingsEnabled}
          rotateSpeed={0.5}
          zoomSpeed={0.5}
          minDistance={0.8}
          maxDistance={5}
          maxPolarAngle={MAX_POLAR_ANGLE}
          minAzimuthAngle={-Math.PI * 0.25}
          maxAzimuthAngle={Math.PI * 0.25}
        />
        <hemisphereLight args={[0xC6C2B6, 0x3A403B, 1.2]} up={DEFAULT_UP}/>
        <Terrain ref={terrainRef}/>
        <ZoneLines/>
        <SparksContainer dragPlane={terrainRef}/>
        <FireLineMarkersContainer dragPlane={terrainRef}/>
        <TownMarkersContainer/>
        <ShutterbugSupport/>
      </Provider>
    </Canvas>
    /* eslint-enable react/no-unknown-property */
  );
});
