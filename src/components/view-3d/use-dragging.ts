import { RefObject, useRef, useState } from "react";
import * as THREE from "three";
import { useThree } from "react-three-fiber";
import { useStores } from "../../use-stores";
import { PointerEvent } from "react-three-fiber/canvas";

// This helper can be used by interactions.
export const useDragging = (
  dragPlane: RefObject<THREE.Mesh | undefined | null> | undefined | null,
  {
    onDrag,
    onDragEnd
  }: {
    onDrag?: (point: THREE.Vector3) => void
    onDragEnd?: () => void
  }
) => {
  const { raycaster } = useThree();
  const { ui } = useStores();
  const [dragged, setDragged] = useState(false);

  const pointerMoveHandler = useRef(() => {
    if (!dragPlane || !dragPlane.current || !onDrag) {
      return;
    }
    const result = raycaster.intersectObject(dragPlane.current);
    if (result && result[0]) {
      onDrag(result[0].point);
    }
  });

  const pointerUpHandler = useRef(() => {
    window.removeEventListener("mousemove", pointerMoveHandler.current);
    window.removeEventListener("mouseup", pointerUpHandler.current);
    ui.dragging = false; // necessary to re-enable orbit controls
    setDragged(false);
    if (onDragEnd) {
      onDragEnd();
    }
  });

  return {
    dragged,
    startDragging: (e: PointerEvent) => {
      e.stopPropagation();
      if (!dragPlane || !dragPlane.current) {
        return;
      }
      window.addEventListener("mousemove", pointerMoveHandler.current);
      window.addEventListener("mouseup", pointerUpHandler.current);
      ui.dragging = true; // necessary to disable orbit controls
      setDragged(true);
    }
  };
};
