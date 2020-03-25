import { RefObject, useState } from "react";
import * as THREE from "three";
import { useStores } from "../../use-stores";
import { useDragging } from "./use-dragging";
import { ftToViewUnit } from "./helpers";
import { PointerEvent } from "react-three-fiber/canvas";
import { Interaction } from "../../models/ui";

export const useDraggingOverPlaneInteraction = (
  enabled: boolean,
  onDrag?: (x: number, y: number) => void,
  dragPlane?: RefObject<THREE.Mesh>
) => {
  const { simulation, ui } = useStores();
  const [ hovered, setHover ] = useState(false);
  const { dragged, startDragging } = useDragging(dragPlane, {
    onDrag: (p: THREE.Vector3) => {
      if (onDrag) {
        const r = ftToViewUnit(simulation);
        onDrag(p.x / r, p.y / r);
      }
    },
    onDragEnd: () => {
      setHover(false);
    }
  });
  // This interaction should be active only when all the others are inactive.
  // HoverOverDraggable is set by this handler below.
  const active = enabled && (ui.interaction === null || ui.interaction === Interaction.HoverOverDraggable);
  return {
    active,
    hovered,
    dragged,
    onPointerOver: (e: PointerEvent) => {
      // Ignore this event while object is being dragged around. We don't want to trigger some state changes
      // when cursor randomly enters or leaves object area.
      if (!dragged) {
        e.stopPropagation();
        setHover(true);
        ui.interaction = Interaction.HoverOverDraggable;
      }
    },
    onPointerOut: (e: PointerEvent) => {
      // Ignore this event while object is being dragged around. We don't want to trigger some state changes
      // when cursor randomly enters or leaves object area.
      if (!dragged) {
        e.stopPropagation();
        setHover(false);
        ui.interaction = null;
      }
    },
    onPointerDown: (e: PointerEvent) => {
      e.stopPropagation();
      startDragging(e);
    }
  }
};
