import { observer } from "mobx-react";
import { useStores } from "../../use-stores";
import { extend, useFrame, useThree } from "react-three-fiber";
import React, { useRef } from "react";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { PLANE_WIDTH, planeHeight } from "./helpers";

extend({ OrbitControls });

export const CameraControls = observer(function WrappedComponent() {
  const { simulation, ui } = useStores();
  const { camera, gl } = useThree();
  const ref = useRef<OrbitControls>();

  useFrame(() => ref.current && ref.current.update());

  // See: https://github.com/react-spring/react-three-fiber/issues/130
  // extend doesn't work too well with TypeScript. @ts-ignore is the easiest solution.
  // @ts-ignore
  return <orbitControls
    args={[camera, gl.domElement]}
    ref={ref}
    target={[PLANE_WIDTH * 0.5, planeHeight(simulation) * 0.5, 0.2]}
    enableRotate={!ui.dragging} // disable rotation when something is being dragged
    enablePan={false}
    rotateSpeed={0.5}
    zoomSpeed={0.5}
    minDistance={0.8}
    maxDistance={5}
    maxPolarAngle={Math.PI * 0.4}
    minAzimuthAngle={-Math.PI * 0.25}
    maxAzimuthAngle={Math.PI * 0.25}
  />;
});
