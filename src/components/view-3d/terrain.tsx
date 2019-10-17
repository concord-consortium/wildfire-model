import React from "react";
import * as THREE from "three";
import { useThree } from "../../react-three-hook";
import { useEffect } from "react";
import { observer } from "mobx-react";
import { useStores } from "../../use-stores";
import { PlaneBufferGeometry, BufferAttribute } from "three";

const HEIGHT_SCALE = 0.00000001;

export const Terrain = observer(() => {
  const { simulation } = useStores();
  const { getEntity } = useThree<THREE.Mesh>(({ scene }) => {
    const planeGeometry = new THREE.PlaneBufferGeometry(1, 1, simulation.gridWidth, simulation.gridHeight);
    const planeMaterial = new THREE.MeshPhongMaterial({ color: 0x039008 });
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.lookAt(THREE.Object3D.DefaultUp);
    scene.add(plane);
    return plane;
  });

  useEffect(() => {
    const plane = getEntity();
    if (!plane) {
      return;
    }
    const geometry = plane.geometry as PlaneBufferGeometry;
    const posArray = geometry.attributes.position.array as number[];
    // apply height map to vertices of plane
    simulation.cells.forEach(cell => {
      const cellIdx = cell.y * (simulation.gridHeight + 1) + cell.x;
      const yAttrIdx = cellIdx * 3 + 2;
      posArray[yAttrIdx] = cell.elevation  * simulation.config.heightmapMaxElevation * HEIGHT_SCALE;
    });
    geometry.computeVertexNormals();
    (geometry.attributes.position as BufferAttribute).needsUpdate = true;
  }, [simulation.dataReady]);

  return null;
});
