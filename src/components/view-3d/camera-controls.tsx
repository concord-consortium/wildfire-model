import OrbitControls from "three-orbitcontrols";
import { useThree } from "../../react-three-hook";

export const CameraControls = () => {
  useThree(({ camera, canvas }) => {
    const controls = new OrbitControls(camera, canvas);
    controls.enablePan = false;
    controls.rotateSpeed = 0.5;
    controls.zoomSpeed = 0.5;
    controls.minDistance = 1.8;
    controls.maxDistance = 10;
    controls.update();
  });
  return null;
};
