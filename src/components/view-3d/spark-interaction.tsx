import React, { useContext, useEffect, useRef } from "react";
import * as THREE from "three";
import { observer } from "mobx-react";
import { useStores } from "../../use-stores";
import { SimulationModel } from "../../models/simulation";
import { ThreeJSContext } from "../../react-three-hook/threejs-manager";
import { PLANE_WIDTH, planeHeight } from "./helpers";
import { UIModel } from "../../models/ui";

import css from "./spark-interaction.scss";

interface IPlaceSparkInteractionProps {
  ui: UIModel;
  simulation: SimulationModel;
  canvas: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  terrain: THREE.Mesh;
  mouseHandlers?: {
    click: (event: MouseEvent) => void;
  };
}

const setupPlaceSparkInteraction = (
  { terrain, simulation, ui, mouseHandlers, canvas, camera }: IPlaceSparkInteractionProps
) => {
  if (mouseHandlers) {
    canvas.removeEventListener("click", mouseHandlers.click);
    canvas.classList.remove(css.sparkActive);
  }
  if (ui.sparkPositionInteraction) {
    const raycaster = new THREE.Raycaster();
    const click = (event: MouseEvent) => {
      const mouse = new THREE.Vector2();
      // Raycaster is expecting normalized mouse position.
      mouse.x = (event.clientX / canvas.offsetWidth ) * 2 - 1;
      mouse.y = -(event.clientY / canvas.offsetHeight ) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObject(terrain);
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

interface IProps {
  getTerrain: () => THREE.Mesh | undefined;
}

export const SparkInteraction: React.FC<IProps> = observer(({ getTerrain }) => {
  const { simulation, ui } = useStores();
  const threeJSContext = useContext(ThreeJSContext);
  const mouseHandlers = useRef<{ click: (event: MouseEvent) => void }>();

  useEffect(() => {
    const terrain = getTerrain();
    if (terrain) {
      const canvas = threeJSContext.canvas;
      const camera = threeJSContext.camera;
      mouseHandlers.current = setupPlaceSparkInteraction({
        ui, simulation, canvas, camera, terrain, mouseHandlers: mouseHandlers.current
      });
    }
  }, [ui.sparkPositionInteraction]);

  return null;
});
