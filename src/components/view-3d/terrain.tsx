import React from "react";
import * as THREE from "three";
import { useThree } from "../../react-three-hook";
import { useEffect } from "react";
import { observer } from "mobx-react";
import { useStores } from "../../use-stores";
import { PlaneBufferGeometry, BufferAttribute } from "three";

const PLANE_WIDTH = 1;

export const Terrain = observer(() => {
  const { simulation } = useStores();
  const { getEntity } = useThree<THREE.Mesh>(({ scene }) => {
    const planeHeight = simulation.config.modelHeight * PLANE_WIDTH / simulation.config.modelWidth;
    const planeGeometry = new THREE.PlaneBufferGeometry(
      PLANE_WIDTH, planeHeight, simulation.gridWidth - 1, simulation.gridHeight - 1
    );
    const planeMaterial = new THREE.MeshPhongMaterial({ color: 0x039008 });
    planeMaterial.side = THREE.DoubleSide;
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
    const heightMult = PLANE_WIDTH / simulation.config.modelWidth;
    // apply height map to vertices of plane
    simulation.cells.forEach(cell => {
      const cellIdx = (simulation.gridHeight - 1 - cell.y) * (simulation.gridHeight) + cell.x;
      const yAttrIdx = cellIdx * 3 + 2;
      posArray[yAttrIdx] = cell.elevation * heightMult;
    });
    geometry.computeVertexNormals();
    (geometry.attributes.position as BufferAttribute).needsUpdate = true;
  }, [simulation.dataReady]);

  return null;
});
