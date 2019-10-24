import { useContext, useEffect } from "react";
import { ThreeJSContext } from "../../react-three-hook/threejs-manager";
import * as THREE from "three";
import { useStores } from "../../use-stores";
import { Interaction } from "../../models/ui";
import { intersects } from "./helpers";

import css from "./use-interactions.scss";

interface IUseInteractionProps {
  getObject: () => THREE.Object3D | THREE.Sprite | undefined;
  getDragBaseObject?: () => THREE.Object3D | undefined;
  onDrag?: (x: number, y: number) => void;
  onMouseOver?: () => void;
  onMouseOut?: () => void;
}

export const useInteractions = ({ getObject, getDragBaseObject, onDrag, onMouseOver, onMouseOut }: IUseInteractionProps) => {
  const { ui } = useStores();
  const { canvas, camera } = useContext(ThreeJSContext);

  useEffect(() => {
    let hoverDetected = false;

    const mousemove = (event: MouseEvent) => {
      const object = getObject();
      const baseMesh = getDragBaseObject && getDragBaseObject();
      if (onDrag && baseMesh && ui.interaction === Interaction.Dragging && hoverDetected) {
        const result = intersects({ event, camera, canvas, object: baseMesh });
        if (result) {
          const p = result.point;
          onDrag(p.x, p.y);
        }
      } else if (object && ui.interaction === null) {
        // Detect dragging only if there's no other interaction active.
        hoverDetected = intersects({ event, camera, canvas, object }) !== null;
        if (hoverDetected) {
          canvas.classList.add(css.grab);
          if (onMouseOver) {
            onMouseOver();
          }
        }
        if (!hoverDetected) {
          canvas.classList.remove(css.grab);
          if (onMouseOut) {
            onMouseOut();
          }
        }
      }
    };
    const mousedown = () => {
      if (hoverDetected) {
        ui.interaction = Interaction.Dragging;
      }
    };
    const mouseup = () => {
      if (ui.interaction === Interaction.Dragging) {
        ui.interaction = null;
      }
    };

    if (onDrag || onMouseOver || onMouseOut) {
      canvas.addEventListener("mousemove", mousemove);
      canvas.addEventListener("mousedown", mousedown);
      canvas.addEventListener("mouseup", mouseup);
    }

    return () => {
      if (onDrag || onMouseOver || onMouseOut) {
        canvas.removeEventListener("mousemove", mousemove);
        canvas.removeEventListener("mousedown", mousedown);
        canvas.removeEventListener("mouseup", mouseup);
      }
    };
  }, []);
};
