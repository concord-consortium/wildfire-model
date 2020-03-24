import { PointerEvent } from "react-three-fiber/canvas";

export enum InteractionAction {
  onClick = "onClick",
  onPointerDown = "onPointerDown",
  onPointerUp = "onPointerUp",
  onPointerMove = "onPointerMove"
}

export type InteractionHandler = {
  [action in InteractionAction]?: (e: PointerEvent) => void;
}
