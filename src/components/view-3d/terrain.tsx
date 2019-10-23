import React, { useEffect } from "react";
import * as THREE from "three";
import { BufferAttribute, Float32BufferAttribute, PlaneBufferGeometry } from "three";
import { useThree } from "../../react-three-hook";
import { observer } from "mobx-react";
import { useStores } from "../../use-stores";
import { Cell, FireState } from "../../models/cell";
import { LandType } from "../../models/fire-model";
import { SimulationModel } from "../../models/simulation";
import { IThreeContext } from "../../react-three-hook/threejs-manager";
import { PLANE_WIDTH, planeHeight } from "./helpers";
import { SparkInteraction } from "./spark-interaction";

const LAND_COLOR = {
  [LandType.Grass]: [1, 0.83, 0, 1],
  [LandType.Shrub]: [0, 1, 0, 1],
};
const BURNING_COLOR = [1, 0, 0, 1];
const BURNT_COLOR = [0.2, 0.2, 0.2, 1];

const vertexIdx = (cell: Cell, gridWidth: number, gridHeight: number) => (gridHeight - 1 - cell.y) * gridWidth + cell.x;

const setVertexColor = (colArray: number[], cell: Cell, gridWidth: number, gridHeight: number) => {
  const idx = vertexIdx(cell, gridWidth, gridHeight) * 4;
  let color;
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

const setupMesh = (simulation: SimulationModel) => ({ scene }: IThreeContext) => {
  const planeGeometry = new THREE.PlaneBufferGeometry(
    PLANE_WIDTH, planeHeight(simulation), simulation.gridWidth - 1, simulation.gridHeight - 1
  );
  planeGeometry.addAttribute("color",
    new Float32BufferAttribute(new Array((simulation.gridWidth) * (simulation.gridHeight) * 4), 4)
  );
  const planeMaterial = new THREE.MeshPhongMaterial({ vertexColors: THREE.VertexColors, side: THREE.DoubleSide });
  const planeMesh = new THREE.Mesh(planeGeometry, planeMaterial);
  planeMesh.lookAt(THREE.Object3D.DefaultUp);
  scene.add(planeMesh);
  return planeMesh;
};

const setupElevation = (plane: THREE.Mesh, simulation: SimulationModel) => {
  const geometry = plane.geometry as PlaneBufferGeometry;
  const posArray = geometry.attributes.position.array as number[];
  const heightMult = PLANE_WIDTH / simulation.config.modelWidth;
  // Apply height map to vertices of plane.
  simulation.cells.forEach(cell => {
    const yAttrIdx = vertexIdx(cell, simulation.gridWidth, simulation.gridHeight) * 3 + 2;
    posArray[yAttrIdx] = cell.elevation * heightMult;
  });
  geometry.computeVertexNormals();
  (geometry.attributes.position as BufferAttribute).needsUpdate = true;
};

const updateColors = (plane: THREE.Mesh, simulation: SimulationModel) => {
  const geometry = plane.geometry as PlaneBufferGeometry;
  const colArray = geometry.attributes.color.array as number[];
  simulation.cells.forEach(cell => {
    setVertexColor(colArray, cell, simulation.gridWidth, simulation.gridHeight);
  });
  geometry.computeVertexNormals();
  (geometry.attributes.color as BufferAttribute).needsUpdate = true;
};

export const Terrain = observer(({ children }) => {
  const { simulation } = useStores();

  const { getEntity } = useThree<THREE.Mesh>(setupMesh(simulation));

  useEffect(() => {
    const plane = getEntity();
    if (plane) {
      setupElevation(plane, simulation);
    }
  }, [simulation.dataReady]);

  useEffect(() => {
    const plane = getEntity();
    if (plane) {
      updateColors(plane, simulation);
    }
  }, [simulation.cells]);

  // Note that we don't want to conditionally render <PlaceSparkInteraction> or provide more props to it.
  // If <PlaceSparkInteraction> subscribes to stores directly, we can avoid unnecessary re-renders of parent component
  // (Terrain) when some properties change.
  return <>
    <SparkInteraction getTerrain={getEntity} />
  </>;
});
