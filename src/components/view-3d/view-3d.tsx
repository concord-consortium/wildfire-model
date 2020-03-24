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

export const View3d = () => {
  const stores = useStores();
  const simulation = stores.simulation;
  const cameraPos: [number, number, number] = [PLANE_WIDTH * 0.5, planeHeight(simulation) * -1.5, PLANE_WIDTH * 1.5];
  const terrainRef = useRef<THREE.Mesh>(null);
  const { gl, scene, camera } = useThree();
  const renderRef = useRef(() => {
    gl.render(scene, camera);
  });
  useEffect(() => {
    Shutterbug.on("saycheese", renderRef.current);
    return () => Shutterbug.off("saycheese", renderRef.current);
  }, []);

  return (
    <Canvas camera={{fov: 33, up: DEFAULT_UP, position: cameraPos}} pixelRatio={window.devicePixelRatio}>
      {/* Why do we need to setup provider again? No idea. It seems that components inside Canvas don't have
          access to MobX stores anymore. */}
      <Provider stores={stores}>
        <CameraControls />
        <hemisphereLight args={[0xC6C2B6, 0x3A403B, 1.2]} up={DEFAULT_UP} />
        <Terrain ref={terrainRef}/>
        <SparksContainer dragPlane={terrainRef}/>
        <FireLineMarkersContainer dragPlane={terrainRef}/>
        <TownMarkersContainer />
      </Provider>
    </Canvas>
  );
};
