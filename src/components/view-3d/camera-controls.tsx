import OrbitControls from "three-orbitcontrols";
import { useThree } from "../../react-three-hook";
import { DEFAULT_UP, PLANE_WIDTH, planeHeight } from "./helpers";
import { useStores } from "../../use-stores";
import { observer } from "mobx-react";
import { useEffect } from "react";

export const CameraControls = observer(() => {
  const { simulation, ui } = useStores();
  const { getEntity } = useThree(({ camera, canvas }) => {
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

    return controls;
  });

  useEffect(() => {
    const controls = getEntity();
    if (controls) {
      controls.enableRotate = !ui.dragging;
    }
  }, [ui.dragging]);

  return null;
});
