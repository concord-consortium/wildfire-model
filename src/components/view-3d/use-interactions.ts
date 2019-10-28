import { useContext, useEffect, useRef } from "react";
import { ThreeJSContext } from "../../react-three-hook/threejs-manager";
import * as THREE from "three";
import { useStores } from "../../use-stores";
import { intersects } from "./helpers";

interface IUseInteractionProps {
  getObject: () => THREE.Object3D | THREE.Sprite | undefined;
  getDragBaseObject?: () => THREE.Object3D | undefined;
  onClick?: (x: number, y: number, z: number) => void;
  onDrag?: (x: number, y: number, z: number) => void;
  onMouseOver?: () => string | void; // optionally returns cursor style
  onMouseOut?: () => void;
  cursor?: string;
}

interface IMouseHandlers {
  [name: string]: (event: MouseEvent) => void;
}

export const useInteractions = ({
  getObject, getDragBaseObject, onClick, onDrag, onMouseOver, onMouseOut, cursor
}: IUseInteractionProps) => {
  const { ui } = useStores();
  const { canvas, camera } = useContext(ThreeJSContext);
  const mouseHandlers = useRef<IMouseHandlers>();

  if (!mouseHandlers.current) {
    // Local state used by mouse handlers.
    let hoverDetected = false;
    const defCursor = cursor || "";

    mouseHandlers.current = {};
    if (onClick) {
      mouseHandlers.current.click = (event: MouseEvent) => {
        const object = getObject();
        if (!object) {
          return;
        }
        const result = intersects({ event, camera, canvas, object });
        if (result) {
          const p = result.point;
          onClick(p.x, p.y, p.z);
        }
      };
    }
    if (onDrag || onMouseOver || onMouseOut) {
      mouseHandlers.current.mousemove = (event: MouseEvent) => {
        const object = getObject();
        if (!object) {
          return;
        }
        const baseMesh = getDragBaseObject && getDragBaseObject();
        if (ui.dragging && ui.hoverTarget === object && baseMesh && onDrag) {
          // Dragging in 3D needs to happen over some other mesh (e.g. plane). That's why baseMesh is used.
          // Note that actually it can be any shape.
          const result = intersects({ event, camera, canvas, object: baseMesh });
          if (result) {
            const p = result.point;
            onDrag(p.x, p.y, p.z);
          }
        } else if (!ui.dragging && !hoverDetected) {
          // Check if cursor hovers an object.
          const p = intersects({ event, camera, canvas, object });
          if (p !== null && p.distance < ui.hoverDistance) {
            // Note that distance is being check, as cursor can intersect multiple objects.
            hoverDetected = true;
            ui.setHoverTarget(object, p.distance);
            if (onMouseOver) {
              const mouseOverCursor = onMouseOver();
              if (mouseOverCursor) {
                canvas.style.cursor = mouseOverCursor;
              }
            }
          }
        } else if (!ui.dragging && hoverDetected)  {
          // Check if cursor has left the object.
          const p = intersects({ event, camera, canvas, object });
          if (p === null) {
            // Hover was active, but the cursor has left the object area.
            hoverDetected = false;
            ui.resetHoverTarget();
            if (onMouseOut) {
              onMouseOut();
            }
            canvas.style.cursor = defCursor;
          } else if (ui.hoverTarget !== object && p.distance > ui.hoverDistance) {
            // Cursor is still intersecting with object, but there's another one closer to the camera.
            hoverDetected = false;
            if (onMouseOut) {
              onMouseOut();
            }
          } else if (ui.hoverTarget === object && p.distance < ui.hoverDistance) {
            // Update distance only.
            ui.setHoverTarget(object, p.distance);
          }
        }
      };
    }
    if (onDrag && getDragBaseObject) {
      mouseHandlers.current.mousedown = () => {
        if (hoverDetected) {
          ui.dragging = true;
        }
      };
      mouseHandlers.current.mouseup = () => {
        if (ui.dragging) {
          ui.dragging = false;
        }
      };
    }
  }

  const handlers = mouseHandlers.current;
  return {
    enable: () => {
      if (cursor) {
        canvas.style.cursor = cursor;
      }
      Object.keys(handlers).forEach(name => {
        canvas.addEventListener(name, handlers[name]);
      });
    },
    disable: () => {
      const object = getObject();
      if (object && ui.hoverTarget === object) {
        // Cleanup hover target if the current interaction set it before.
        ui.resetHoverTarget();
        canvas.style.cursor = "";
      }
      if (cursor) {
        canvas.style.cursor = "";
      }
      Object.keys(handlers).forEach(name => {
        canvas.removeEventListener(name, handlers[name]);
      });
    }
  };
};
