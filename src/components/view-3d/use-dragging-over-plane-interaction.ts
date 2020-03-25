import { RefObject, useState } from "react";
import * as THREE from "three";
import { useStores } from "../../use-stores";
import { useDragging } from "./use-dragging";
import { ftToViewUnit } from "./helpers";
import { PointerEvent } from "react-three-fiber/canvas";

export const useDraggingOverPlaneInteraction = (
  enabled: boolean,
  setPosition?: (x: number, y: number) => void,
  dragPlane?: RefObject<THREE.Mesh>
) => {
  const { simulation } = useStores();
  const [ hovered, setHover ] = useState(false);
  const { dragged, startDragging } = useDragging(dragPlane, {
    onDrag: (p: THREE.Vector3) => {
      if (setPosition) {
        const r = ftToViewUnit(simulation);
        setPosition(p.x / r, p.y / r);
      }
    }
  });
  return {
    active: !!(enabled && setPosition && dragPlane?.current),
    hovered,
    dragged,
    onPointerOver: (e: PointerEvent) => {
      e.stopPropagation();
      setHover(true);
    },
    onPointerOut: (e: PointerEvent) => {
      e.stopPropagation();
      setHover(false);
    },
    onPointerDown: (e: PointerEvent) => {
      e.stopPropagation();
      startDragging(e);
    }
  }
};
