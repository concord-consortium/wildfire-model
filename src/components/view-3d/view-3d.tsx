import React from "react";
import { ThreeJSManager } from "../../react-three-hook/threejs-manager";
import { CameraControls } from "./camera-controls";
import { Terrain } from "./terrain";

// Note that React.memo is very important here. Let's try to limit number of unnecessary React re-renders to minimum.
// Child components should subscribe to MobX store themselves, so they'll be re-rendered individually based on the
// their usage of store properties.
export const View3D = React.memo(() => {
  return (
    <ThreeJSManager>
      <CameraControls/>
      <Terrain/>
    </ThreeJSManager>
  );
});
