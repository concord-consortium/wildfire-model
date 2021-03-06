import React, { useEffect, useRef } from "react";
import { Canvas, useThree } from "react-three-fiber";
import { Provider } from "mobx-react";
import { useStores } from "../../use-stores";
import { DEFAULT_UP, PLANE_WIDTH, planeHeight } from "./helpers";
import { CameraControls } from "./camera-controls";
import { Terrain } from "./terrain";
import { SparksContainer } from "./spark";
import * as THREE from "three";
import { FireLineMarkersContainer } from "./fire-line-marker";
import { TownMarkersContainer } from "./town-marker";
import Shutterbug from "shutterbug";

// This needs to be a separate component, as useThree depends on context provided by <Canvas> component.
const ShutterbugSupport = () => {
  const { gl, scene, camera } = useThree();
  const renderRef = useRef(() => {
    gl.render(scene, camera);
  });
  useEffect(() => {
    Shutterbug.on("saycheese", renderRef.current);
    return () => Shutterbug.off("saycheese", renderRef.current);
  }, []);
  return null;
};

export const View3d = () => {
  const stores = useStores();
  const simulation = stores.simulation;
  const cameraPos: [number, number, number] = [PLANE_WIDTH * 0.5, planeHeight(simulation) * -1.5, PLANE_WIDTH * 1.5];
  const terrainRef = useRef<THREE.Mesh>(null);

  // If pixelRatio is 2 or more, use a bit reduced value. It seems to be a good compromise between
  // rendering quality and performance (PJ: on my 2017 MacBook Pro 15", pixelRatio = 2 was causing visible FPS drop).
  const pixelRatio = window.devicePixelRatio > 1 ? Math.max(1, window.devicePixelRatio * 0.75) : 1;
  return (
    <Canvas camera={{ fov: 33, up: DEFAULT_UP, position: cameraPos }} pixelRatio={pixelRatio}>
      {/* Why do we need to setup provider again? No idea. It seems that components inside Canvas don't have
          access to MobX stores anymore. */}
      <Provider stores={stores}>
        <CameraControls/>
        <hemisphereLight args={[0xC6C2B6, 0x3A403B, 1.2]} up={DEFAULT_UP}/>
        <Terrain ref={terrainRef}/>
        <SparksContainer dragPlane={terrainRef}/>
        <FireLineMarkersContainer dragPlane={terrainRef}/>
        <TownMarkersContainer/>
        <ShutterbugSupport/>
      </Provider>
    </Canvas>
  );
};
