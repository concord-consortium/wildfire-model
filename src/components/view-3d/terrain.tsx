import React, { useEffect } from "react";
import * as THREE from "three";
import { BufferAttribute, Float32BufferAttribute, PlaneBufferGeometry } from "three";
import { useThree } from "../../react-three-hook";
import { observer } from "mobx-react";
import { useStores } from "../../use-stores";
import { Cell, FireState } from "../../models/cell";
import { SimulationModel } from "../../models/simulation";
import { IThreeContext } from "../../react-three-hook/threejs-manager";
import { ftToViewUnit, PLANE_WIDTH, planeHeight } from "./helpers";
import { SparksContainer } from "./spark";
import { Interaction } from "../../models/ui";
import { AddSparkInteraction } from "./add-spark-interaction";
import { DrawFireLineInteraction } from "./draw-fire-line-interaction";
import { DroughtLevel } from "../../models/fire-model";
import { FireLineMarkersContainer } from "./fire-line-marker";

const getTerrainColor = (droughtLevel: number) => {
  switch (droughtLevel) {
    case DroughtLevel.NoDrought:
      return [0.008, 0.831, 0.039, 1];
    case DroughtLevel.MildDrought:
      return [0.573, 0.839, 0.216, 1];
    case DroughtLevel.MediumDrought:
      return [0.757, 0.886, 0.271, 1];
    default:
      return [0.784, 0.631, 0.271, 1];
  }
};
const BURNING_COLOR = [1, 0, 0, 1];
const BURNT_COLOR = [0.2, 0.2, 0.2, 1];
const RIVER_COLOR = [0.663, 0.855, 1, 1];
const FIRE_LINE_UNDER_CONSTRUCTION_COLOR = [0.5, 0.5, 0, 1];

const vertexIdx = (cell: Cell, gridWidth: number, gridHeight: number) => (gridHeight - 1 - cell.y) * gridWidth + cell.x;

const setVertexColor = (colArray: number[], cell: Cell, gridWidth: number, gridHeight: number) => {
  const idx = vertexIdx(cell, gridWidth, gridHeight) * 4;
  let color;
  if (cell.fireState === FireState.Burning) {
    color = BURNING_COLOR;
  } else if (cell.fireState === FireState.Burnt) {
    color = BURNT_COLOR;
  } else if (cell.isRiver) {
    color = RIVER_COLOR;
  } else if (cell.isFireLineUnderConstruction) {
    color = FIRE_LINE_UNDER_CONSTRUCTION_COLOR;
  } else {
    color = getTerrainColor(cell.droughtLevel);
  }
  colArray[idx] = color[0];
  colArray[idx + 1] = color[1];
  colArray[idx + 2] = color[2];
  colArray[idx + 3] = color[3];
};

const setupMesh = (simulation: SimulationModel) => ({ scene }: IThreeContext) => {
  const height = planeHeight(simulation);
  const planeGeometry = new THREE.PlaneBufferGeometry(
    PLANE_WIDTH, height, simulation.gridWidth - 1, simulation.gridHeight - 1
  );
  planeGeometry.addAttribute("color",
    new Float32BufferAttribute(new Array((simulation.gridWidth) * (simulation.gridHeight) * 4), 4)
  );
  const planeMaterial = new THREE.MeshPhongMaterial({ vertexColors: THREE.VertexColors, side: THREE.DoubleSide });
  const planeMesh = new THREE.Mesh(planeGeometry, planeMaterial);
  planeMesh.lookAt(new THREE.Vector3(0, 0, 1));
  // Move plane so bottom-left corner is at (0, 0) point;
  planeMesh.position.set(PLANE_WIDTH * 0.5, height * 0.5, 0);
  scene.add(planeMesh);
  return planeMesh;
};

const setupElevation = (plane: THREE.Mesh, simulation: SimulationModel) => {
  const geometry = plane.geometry as PlaneBufferGeometry;
  const posArray = geometry.attributes.position.array as number[];
  const mult = ftToViewUnit(simulation);
  // Apply height map to vertices of plane.
  simulation.cells.forEach(cell => {
    const zAttrIdx = vertexIdx(cell, simulation.gridWidth, simulation.gridHeight) * 3 + 2;
    posArray[zAttrIdx] = cell.elevation * mult;
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
  (geometry.attributes.color as BufferAttribute).needsUpdate = true;
};

export const Terrain = observer(() => {
  const { simulation, ui } = useStores();
  const { getEntity } = useThree<THREE.Mesh>(setupMesh(simulation));

  useEffect(() => {
    const plane = getEntity();
    if (plane) {
      setupElevation(plane, simulation);
    }
  }, [simulation.cellsElevationFlag]);

  useEffect(() => {
    const plane = getEntity();
    if (plane) {
      updateColors(plane, simulation);
    }
  }, [simulation.cellsStateFlag]);

  // Note that we don't want to conditionally render <PlaceSparkInteraction> or provide more props to it.
  // If <PlaceSparkInteraction> subscribes to stores directly, we can avoid unnecessary re-renders of parent component
  // (Terrain) when some properties change.
  return <>
    <SparksContainer getTerrain={getEntity}/>
    <FireLineMarkersContainer getTerrain={getEntity}/>
    { ui.interaction === Interaction.PlaceSpark && <AddSparkInteraction getTerrain={getEntity} /> }
    { ui.interaction === Interaction.DrawFireLine && <DrawFireLineInteraction getTerrain={getEntity} /> }
  </>;
});
