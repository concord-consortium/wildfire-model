import React, { useContext, useEffect, useRef } from "react";
import * as THREE from "three";
import { BufferAttribute, Float32BufferAttribute, PlaneBufferGeometry } from "three";
import { useThree } from "../../react-three-hook";
import { observer } from "mobx-react";
import { useStores } from "../../use-stores";
import { Cell, FireState } from "../../models/cell";
import { LandType } from "../../models/fire-model";
import { SimulationModel } from "../../models/simulation";
import { IThreeContext, ThreeJSContext } from "../../react-three-hook/threejs-manager";

import css from "./terrain.scss";
import { UIModel } from "../../models/ui";

const PLANE_WIDTH = 1;
const LAND_COLOR = {
  [LandType.Grass]: [1, 0.83, 0, 1],
  [LandType.Shrub]: [0, 1, 0, 1],
};
const BURNING_COLOR = [1, 0, 0, 1];
const BURNT_COLOR = [0.2, 0.2, 0.2, 1];

const planeHeight = (simulation: SimulationModel) =>
  simulation.config.modelHeight * PLANE_WIDTH / simulation.config.modelWidth;

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
    const yAttrIdx = cellIdx(cell, simulation.gridWidth, simulation.gridHeight) * 3 + 2;
    posArray[yAttrIdx] = cell.elevation * heightMult;
  });
  geometry.computeVertexNormals();
  (geometry.attributes.position as BufferAttribute).needsUpdate = true;
};

const updateColors = (plane: THREE.Mesh, simulation: SimulationModel) => {
  const geometry = plane.geometry as PlaneBufferGeometry;
  const colArray = geometry.attributes.color.array as number[];
  simulation.cells.forEach(cell => {
    setCellColor(colArray, cell, simulation.gridWidth, simulation.gridHeight);
  });
  geometry.computeVertexNormals();
  (geometry.attributes.color as BufferAttribute).needsUpdate = true;
};

interface IPlaceSparkInteractionProps {
  ui: UIModel;
  simulation: SimulationModel;
  canvas: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  plane: THREE.Mesh;
  mouseHandlers?: {
    click: (event: MouseEvent) => void;
  };
}

const setupPlaceSparkInteraction = (
  { plane, simulation, ui, mouseHandlers, canvas, camera }: IPlaceSparkInteractionProps
) => {
  if (mouseHandlers) {
    canvas.removeEventListener("click", mouseHandlers.click);
    canvas.classList.remove(css.sparkActive);
  }
  if (ui.sparkPositionInteraction) {
    const raycaster = new THREE.Raycaster();
    const click = (event: MouseEvent) => {
      const mouse = new THREE.Vector2();
      mouse.x = (event.clientX / canvas.offsetWidth ) * 2 - 1;
      mouse.y = -(event.clientY / canvas.offsetHeight ) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObject(plane);
      if (intersects.length > 0) {
        const p = intersects[0].point;
        simulation.setSpark(
          (p.x / PLANE_WIDTH + 0.5) * simulation.gridWidth,
          (-p.z / planeHeight(simulation) + 0.5) * simulation.gridHeight
        );
        ui.sparkPositionInteraction = false;
      }
    };
    canvas.addEventListener("click", click);
    canvas.classList.add(css.sparkActive);
    return {
      click
    };
  }
};

export const Terrain = observer(() => {
  const { simulation, ui } = useStores();
  const threeJSContext = useContext(ThreeJSContext);

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

  const mouseHandlers = useRef<{ click: (event: MouseEvent) => void }>();
  useEffect(() => {
    const plane = getEntity();
    if (plane) {
      const canvas = threeJSContext.canvas;
      const camera = threeJSContext.camera;
      mouseHandlers.current = setupPlaceSparkInteraction({
        ui, simulation, canvas, camera, plane, mouseHandlers: mouseHandlers.current
      });
    }
  }, [ui.sparkPositionInteraction]);

  return null;
});
