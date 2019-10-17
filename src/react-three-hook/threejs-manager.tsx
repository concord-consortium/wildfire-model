import React, { createContext, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas } from "./canvas";
import { useAnimationFrame } from "./use-animation-frame";
import { getDefCamera, getDefRenderer, getDefScene } from "./default-threejs-setup";

const DEFAULT_CANVAS_STYLE = { width: "100%", height: "100%" };

export interface IThreeContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  time: number;
}

const defaultContext = {
  scene: new THREE.Scene(),
  camera: new THREE.PerspectiveCamera(),
  canvas: document.createElement("canvas"),
  time: 0
};

export const ThreeJSContext = createContext<IThreeContext>(defaultContext);

interface IProps {
  getCamera?: (canvas: HTMLCanvasElement) => THREE.PerspectiveCamera;
  getRenderer?: (canvas: HTMLCanvasElement) => THREE.Renderer;
  getScene?: () => THREE.Scene;
  canvasStyle?: any;
}

export const ThreeJSManager: React.FC<IProps> = ({
  children,
  getRenderer = getDefRenderer,
  getCamera = getDefCamera,
  getScene = getDefScene,
  canvasStyle = DEFAULT_CANVAS_STYLE
}) => {
  const [threeIsReady, setThreeIsReady] = useState(false);
  const [time, updateTime] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>();
  const sceneRef = useRef<THREE.Scene>();
  const cameraRef = useRef<THREE.PerspectiveCamera>();
  const rendererRef = useRef<THREE.Renderer>();

  const threeContext = {
    scene: sceneRef.current || defaultContext.scene,
    camera: cameraRef.current || defaultContext.camera,
    canvas: canvasRef.current || defaultContext.canvas,
    time,
  };

  // setup scene, camera, and renderer, and store references
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const renderer = getRenderer(canvas);
      if (renderer) {
        sceneRef.current = getScene();
        cameraRef.current = getCamera(canvas);
        rendererRef.current = renderer;

        setThreeIsReady(true);
      } else {
        throw new Error("ThreeJSManager: WebGL not supported");
      }
    }
  }, []);

  // update camera and renderer when dimensions change
  let offsetWidth: number | undefined;
  let offsetHeight: number | undefined;
  if (canvasRef.current) {
    offsetWidth = canvasRef.current.offsetWidth;
    offsetHeight = canvasRef.current.offsetHeight;
  }

  useEffect(() => {
      if (canvasRef.current && cameraRef.current && rendererRef.current && offsetWidth && offsetHeight) {
        cameraRef.current.aspect = offsetWidth / offsetHeight;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(offsetWidth, offsetHeight);
      }
    }, [offsetWidth, offsetHeight]);

  // set animation frame time value and rerender the scene
  useAnimationFrame((newTime: number) => {
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
  });

  return (
    <>
      <Canvas ref={canvasRef} style={canvasStyle}/>
      {threeIsReady && (
        <ThreeJSContext.Provider value={threeContext}>
          {children}
        </ThreeJSContext.Provider>
      )}
    </>
  );
};
