import * as THREE from "three";

export const getDefCamera = ({ offsetWidth, offsetHeight }: { offsetWidth: number, offsetHeight: number }) => {
  const camera = new THREE.PerspectiveCamera(
    33,
    offsetWidth / offsetHeight,
    0.1,
    1000,
  );
  camera.position.copy(THREE.Object3D.DefaultUp.multiplyScalar(2));
  camera.lookAt(new THREE.Vector3(0, 0, 0));

  return camera;
};

export const getDefRenderer = (canvas: HTMLCanvasElement) => {
  const context = canvas.getContext("webgl");
  if (!context) {
    return null;
  }
  const renderer = new THREE.WebGLRenderer({
    canvas,
    context,
  });
  renderer.setSize(canvas.offsetWidth, canvas.offsetHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  return renderer;
};

export const getDefScene = () => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xcac8c8);
  // scene.add(new THREE.AmbientLight(0xffffff));
  scene.add(new THREE.HemisphereLight(0xC6C2B6, 0x3A403B, 0.75));
  const light = new THREE.PointLight(0xffffff, 0.3);
  light.position.set(0, 2, 1);
  scene.add(light);
  return scene;
};
