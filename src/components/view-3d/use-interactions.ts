import { useContext, useEffect } from "react";
import { ThreeJSContext } from "../../react-three-hook/threejs-manager";
import * as THREE from "three";
import { useStores } from "../../use-stores";
import { Interaction } from "../../models/ui";
import { intersects } from "./helpers";

interface IUseInteractionProps {
  getObject: () => THREE.Object3D | THREE.Sprite | undefined;
  getDragBaseObject?: () => THREE.Object3D | undefined;
  onDrag?: (x: number, y: number) => void;
  onMouseOver?: () => string | void; // optionally returns cursor style
  onMouseOut?: () => void;
}

export const useInteractions = ({
  getObject, getDragBaseObject, onDrag, onMouseOver, onMouseOut
}: IUseInteractionProps) => {
  const { ui } = useStores();
  const { canvas, camera } = useContext(ThreeJSContext);

  useEffect(() => {
    let hoverDetected = false;

    const mousemove = (event: MouseEvent) => {
      const object = getObject();
      const baseMesh = getDragBaseObject && getDragBaseObject();
      if (hoverDetected && onDrag && baseMesh && ui.interaction === Interaction.Dragging) {
        const result = intersects({ event, camera, canvas, object: baseMesh });
        if (result) {
          const p = result.point;
          onDrag(p.x, p.y);
        }
      } else if (hoverDetected && object && ui.interaction === null)  {
        const p = intersects({ event, camera, canvas, object });
        if (p === null) {
          hoverDetected = false;
          ui.hoverTarget = null;
          ui.hoverDistance = Infinity;
          if (onMouseOut) {
            onMouseOut();
          }
          canvas.style.cursor = "";
        } else if (ui.hoverTarget !== object && p.distance > ui.hoverDistance) {
          hoverDetected = false;
          if (onMouseOut) {
            onMouseOut();
          }
        }
      } else if (!hoverDetected && object && ui.interaction === null) {
        const p = intersects({ event, camera, canvas, object });
        if (p !== null && p.distance < ui.hoverDistance) {
          hoverDetected = true;
          ui.hoverTarget = object;
          ui.hoverDistance = p.distance;
          if (onMouseOver) {
            const cursor = onMouseOver();
            if (cursor) {
              canvas.style.cursor = cursor;
            }
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
