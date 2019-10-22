import OrbitControls from "three-orbitcontrols";
import { useThree } from "../../react-three-hook";

export const CameraControls = () => {
  useThree(({ camera, canvas }) => {
    const controls = new OrbitControls(camera, canvas);
    controls.enablePan = false;
    controls.rotateSpeed = 0.5;
    controls.zoomSpeed = 0.5;
    controls.minDistance = 0.8;
    controls.maxDistance = 3;
    controls.maxPolarAngle = Math.PI * 0.4; // don't let users look at the backside of the terrain
    controls.minAzimuthAngle = -Math.PI * 0.25;
    controls.maxAzimuthAngle = Math.PI * 0.25;
    controls.update();
  });
  return null;
};
