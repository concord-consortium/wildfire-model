import { useStores } from "../../use-stores";
import { log } from "../../log";
import { Event } from "three";
import { ftToViewUnit } from "./helpers";

// Flag set by specific interaction handlers to suppress the generic SimulationClicked event.
// Reset at the start of each pointer event cycle.
let specificInteractionHandled = false;

export const markSpecificInteractionHandled = () => {
  specificInteractionHandled = true;
};

export const useSimulationClickedInteraction = () => {
  const { simulation } = useStores();
  return {
    active: true,
    onPointerDown: (e: Event) => {
      if (specificInteractionHandled) {
        specificInteractionHandled = false;
        return;
      }
      const ratio = ftToViewUnit(simulation);
      const x = e.point.x / ratio;
      const y = e.point.y / ratio;
      const cell = simulation.cells.length > 0 ? simulation.cellAt(x, y) : undefined;
      const nativeEvent = e.nativeEvent as PointerEvent;
      const canvas = nativeEvent.target as HTMLElement;
      const rect = canvas?.getBoundingClientRect();
      log("SimulationClicked", {
        hit3d: !!cell,
        clientX: nativeEvent.clientX,
        clientY: nativeEvent.clientY,
        percentX: rect ? Math.round(((nativeEvent.clientX - rect.left) / rect.width) * 100) : undefined,
        percentY: rect ? Math.round(((nativeEvent.clientY - rect.top) / rect.height) * 100) : undefined,
        modelX: cell ? x : undefined,
        modelY: cell ? y : undefined,
        elevation: cell?.elevation
      });
    }
  };
};
