import React from "react";
import * as THREE from "three";
import { useThree } from "../../react-three-hook";
import { DEFAULT_UP } from "./helpers";

export const Lights = () => {
  useThree<THREE.Object3D>(({ scene }) => {
    const container = new THREE.Object3D();
    const hemisphereLight = new THREE.HemisphereLight(0xC6C2B6, 0x3A403B, 1.2);
    hemisphereLight.up.copy(DEFAULT_UP);
    container.add(hemisphereLight);
    scene.add(container);
    return container;
  });

  return null;
};
