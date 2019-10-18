import React, { useEffect } from "react";
import * as THREE from "three";
import { BufferAttribute, Float32BufferAttribute, PlaneBufferGeometry } from "three";
import { useThree } from "../../react-three-hook";
import { observer } from "mobx-react";
import { useStores } from "../../use-stores";
import { Cell, FireState } from "../../models/cell";
import { LandType } from "../../models/fire-model";

const PLANE_WIDTH = 1;
const LAND_COLOR = {
  [LandType.Grass]: [1, 0.83, 0, 1],
  [LandType.Shrub]: [0, 1, 0, 1],
};
const BURNING_COLOR = [1, 0, 0, 1];
const BURNT_COLOR = [0.2, 0.2, 0.2, 1];

const cellIdx = (cell: Cell, gridWidth: number, gridHeight: number) => (gridHeight - 1 - cell.y) * gridWidth + cell.x;

const setCellColor = (colArray: number[], cell: Cell, gridWidth: number, gridHeight: number) => {
  const idx = cellIdx(cell, gridWidth, gridHeight) * 4;
  let color = [0, 0, 0, 1];
  if (cell.fireState === FireState.Burning) {
    color = BURNING_COLOR;
  } else if (cell.fireState === FireState.Burnt) {
    color = BURNT_COLOR;
  } else {
    color = LAND_COLOR[cell.landType];
  }
  colArray[idx] = color[0];
  colArray[idx + 1] = color[1];
  colArray[idx + 2] = color[2];
  colArray[idx + 3] = color[3];
};

export const Terrain = observer(() => {
  const { simulation } = useStores();
  const { getEntity } = useThree<THREE.Mesh>(({ scene }) => {
    const planeHeight = simulation.config.modelHeight * PLANE_WIDTH / simulation.config.modelWidth;
    const planeGeometry = new THREE.PlaneBufferGeometry(
      PLANE_WIDTH, planeHeight, simulation.gridWidth - 1, simulation.gridHeight - 1
    );
    planeGeometry.addAttribute("color",
      new Float32BufferAttribute(new Array((simulation.gridWidth) * (simulation.gridHeight) * 4), 4)
    );
    const planeMaterial = new THREE.MeshPhongMaterial({ vertexColors: THREE.VertexColors, side: THREE.DoubleSide });
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
    // Apply height map to vertices of plane.
    simulation.cells.forEach(cell => {
      const yAttrIdx = cellIdx(cell, simulation.gridWidth, simulation.gridHeight) * 3 + 2;
      posArray[yAttrIdx] = cell.elevation * heightMult;
    });
    geometry.computeVertexNormals();
    (geometry.attributes.position as BufferAttribute).needsUpdate = true;
  }, [simulation.dataReady]);

  useEffect(() => {
    const plane = getEntity();
    if (!plane) {
      return;
    }
    const geometry = plane.geometry as PlaneBufferGeometry;
    const colArray = geometry.attributes.color.array as number[];
    simulation.cells.forEach(cell => {
      setCellColor(colArray, cell, simulation.gridWidth, simulation.gridHeight);
    });
    geometry.computeVertexNormals();
    (geometry.attributes.color as BufferAttribute).needsUpdate = true;
  }, [simulation.cells]);

  return null;
});
