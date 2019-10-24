import React, { useContext, useEffect, useRef } from "react";
import * as THREE from "three";
import { observer } from "mobx-react";
import { useStores } from "../../use-stores";
import { SimulationModel } from "../../models/simulation";
import { ThreeJSContext } from "../../react-three-hook/threejs-manager";
import { ftToViewUnit, intersects } from "./helpers";
import { Draggable, Interaction, UIModel } from "../../models/ui";

import css from "./drag-interaction.scss";

interface IMouseHandlers {
  mousemove: (event: MouseEvent) => void;
  mousedown: (event: MouseEvent) => void;
  mouseup: (event: MouseEvent) => void;
}

interface IPlaceSparkInteractionProps {
  ui: UIModel;
  simulation: SimulationModel;
  canvas: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  terrain: THREE.Mesh;
  mouseHandlers?: IMouseHandlers;
}

const setupDragInteraction = (
  { terrain, simulation, ui, mouseHandlers, canvas, camera }: IPlaceSparkInteractionProps
) => {
  if (mouseHandlers) {
    // Cleanup.
    canvas.removeEventListener("mousemove", mouseHandlers.mousemove);
    canvas.removeEventListener("mousedown", mouseHandlers.mousedown);
    canvas.removeEventListener("mouseup", mouseHandlers.mouseup);
    canvas.classList.remove(css.draggableObjectPresent);
  }
  // Note that we setup generic dragging interaction when:
  // - there's draggableObject available, so something is already selected.
  // - there's no other interaction active. We don't want to interrupt it.
  if (ui.draggableObject && ui.interaction === null) {
    const mousedown = () => {
      if (ui.draggableObject) {
        ui.interaction = Interaction.Dragging;
      }
    };
    const mouseup = () => {
      ui.interaction = null;
    };
    const mousemove = (event: MouseEvent) => {
      if (ui.interaction !== Interaction.Dragging || !ui.draggableObject) {
        return;
      }
      const result = intersects({ event, camera, canvas, object: terrain });
      if (result) {
        const p = result.point;
        const ratio = ftToViewUnit(simulation);
        if (ui.draggableObject === Draggable.Spark) {
          simulation.setSpark(ui.draggableObjectIdx!, p.x / ratio, p.y / ratio);
        }
        // More object types will come here.
      }
    };
    canvas.addEventListener("mousedown", mousedown);
    canvas.addEventListener("mouseup", mouseup);
    canvas.addEventListener("mousemove", mousemove);
    canvas.classList.add(css.draggableObjectPresent);
    return { mousedown, mouseup, mousemove };
  }
};

interface IProps {
  getTerrain: () => THREE.Mesh | undefined;
}

export const DragInteraction: React.FC<IProps> = observer(({ getTerrain }) => {
  const { simulation, ui } = useStores();
  const { canvas, camera } = useContext(ThreeJSContext);
  const mouseHandlers = useRef<IMouseHandlers>();

  useEffect(() => {
    const terrain = getTerrain();
    if (terrain) {
      mouseHandlers.current = setupDragInteraction({
        ui, simulation, canvas, camera, terrain, mouseHandlers: mouseHandlers.current
      });
    }
  }, [ui.draggableObject, ui.draggableObjectIdx]);

  return null;
});
