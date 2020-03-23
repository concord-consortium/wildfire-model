import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { DEFAULT_UP, PLANE_WIDTH, planeHeight } from "./helpers";
import { useStores } from "../../use-stores";
import { observer } from "mobx-react";
import { useContext, useEffect, useRef } from "react";
import { ThreeJSContext } from "../../react-three-hook/threejs-manager";

export const CameraControls = observer(function WrappedComponent() {
  const { simulation, ui } = useStores();
  const context = useContext(ThreeJSContext);
  const controlsRef = useRef<OrbitControls>();

  useEffect(() => {
    const { camera, canvas } = context;
    camera.up.copy(DEFAULT_UP);

    const controls = new OrbitControls(camera, canvas);
    controls.target.set(PLANE_WIDTH * 0.5, planeHeight(simulation) * 0.5, 0.2);
    controls.enablePan = false;
    controls.rotateSpeed = 0.5;
    controls.zoomSpeed = 0.5;
    controls.minDistance = 0.8;
    controls.maxDistance = 3;
    controls.maxPolarAngle = Math.PI * 0.4; // don't let users look at the backside of the terrain
    controls.minAzimuthAngle = -Math.PI * 0.25;
    controls.maxAzimuthAngle = Math.PI * 0.25;

    camera.position.set(PLANE_WIDTH * 0.5, planeHeight(simulation) * -1.5, PLANE_WIDTH * 1.5);
    controls.update();

    controlsRef.current = controls;
  });

  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.enableRotate = !ui.dragging;
    }
  }, [ui.dragging]);

  return null;
});
