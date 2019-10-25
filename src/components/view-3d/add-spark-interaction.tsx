import React, { useContext, useEffect, useRef } from "react";
import * as THREE from "three";
import { observer } from "mobx-react";
import { useStores } from "../../use-stores";
import { SimulationModel } from "../../models/simulation";
import { ThreeJSContext } from "../../react-three-hook/threejs-manager";
import { ftToViewUnit, intersects } from "./helpers";
import { Interaction, UIModel } from "../../models/ui";

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

const setupAddSparkInteraction = (
  { terrain, simulation, ui, mouseHandlers, canvas, camera }: IPlaceSparkInteractionProps
) => {
  if (mouseHandlers) {
    // Cleanup.
    canvas.removeEventListener("click", mouseHandlers.click);
    canvas.classList.remove(css.sparkActive);
  }
  if (ui.interaction === Interaction.PlaceSpark) {
    const click = (event: MouseEvent) => {
      const result = intersects({ event, camera, canvas, object: terrain });
      if (result) {
        const p = result.point;
        const ratio = ftToViewUnit(simulation);
        simulation.addSpark(p.x / ratio, p.y / ratio);
        ui.interaction = null;
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

export const AddSparkInteraction: React.FC<IProps> = observer(({ getTerrain }) => {
  const { simulation, ui } = useStores();
  const { canvas, camera } = useContext(ThreeJSContext);
  const mouseHandlers = useRef<{ click: (event: MouseEvent) => void }>();

  useEffect(() => {
    const terrain = getTerrain();
    if (terrain) {
      mouseHandlers.current = setupAddSparkInteraction({
        ui, simulation, canvas, camera, terrain, mouseHandlers: mouseHandlers.current
      });
    }
  }, [ui.interaction]);

  return null;
});
