import React, { useContext, useEffect } from "react";
import { ThreeJSContext, ThreeJSManager } from "../../react-three-hook/threejs-manager";
import { CameraControls } from "./camera-controls";
import { Terrain } from "./terrain";
import { Lights } from "./lights";
import Shutterbug from "shutterbug";

const ShutterbugSupport = React.memo(() => {
  const { render } = useContext(ThreeJSContext);
  (window as any).rend = render;
  useEffect(() => {
    Shutterbug.on("saycheese", render);
    return () => Shutterbug.off("saycheese", render);
  }, []);
  return null;
});

// Note that React.memo is very important here. Let's try to limit number of unnecessary React re-renders to minimum.
// Child components should subscribe to MobX store themselves, so they'll be re-rendered individually based on the
// their usage of store properties.
export const View3D = React.memo(() => {
  return (
    <ThreeJSManager>
      <ShutterbugSupport/>
      <CameraControls/>
      <Lights/>
      <Terrain/>
    </ThreeJSManager>
  );
});
