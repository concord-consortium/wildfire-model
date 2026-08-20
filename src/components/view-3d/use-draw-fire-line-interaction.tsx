import { useStores } from "../../use-stores";
import { ftToViewUnit } from "./helpers";
import { Event } from "three";
import { Interaction } from "../../models/ui";
import { InteractionHandler } from "./interaction-handler";
import { dist } from "../../models/utils/grid-utils";
import { fireLineData, fireLinePointData } from "../../models/fire-line-placement";
import { log } from "../../log";

const MIN_DIST = 1500; // feet

export const useDrawFireLineInteraction: () => InteractionHandler = () => {
  const { simulation, ui } = useStores();
  // Markers can be cleared without the flag (restart, reload), so both must hold.
  const placementInProgress = () => ui.fireLinePlacementInProgress && simulation.fireLineMarkers.length >= 2;

  const modelCoords = (e: Event) => {
    const ratio = ftToViewUnit(simulation);
    return { x: e.point.x / ratio, y: e.point.y / ratio };
  };

  const placeFirstEnd = (x: number, y: number) => {
    if (!simulation.canAddFireLineMarker) {
      return;
    }
    // Both markers land at the same point so the preview can move the second one through
    // setFireLineMarker, the only path that applies limitFireLineLength.
    simulation.addFireLineMarker(x, y);
    simulation.addFireLineMarker(x, y);
    ui.fireLinePlacementInProgress = true;
    log("FireLineFirstEndPlaced", fireLinePointData(simulation, { x, y }));
  };

  const placeSecondEnd = (x: number, y: number) => {
    const start = simulation.fireLineMarkers[0];
    if (dist(start.x, start.y, x, y) < MIN_DIST) {
      // Too short to be a deliberate fire line. Ignore the click and stay armed.
      return;
    }
    simulation.setFireLineMarker(1, x, y);
    const end = simulation.fireLineMarkers[1];
    ui.fireLinePlacementInProgress = false;
    ui.interaction = null;
    log("FireLineAdded", fireLineData(simulation, start, end));
  };

  return {
    active: ui.interaction === Interaction.DrawFireLine,
    onPointerDown: (e: Event) => {
      const { x, y } = modelCoords(e);
      if (placementInProgress()) {
        placeSecondEnd(x, y);
      } else {
        placeFirstEnd(x, y);
      }
    },
    // Left undefined until the preview has something to follow: every defined handler
    // enables raycasting on the terrain mesh (see getEventHandlers).
    onPointerMove: ui.fireLinePlacementInProgress
      ? (e: Event) => {
        if (!placementInProgress()) {
          return;
        }
        const { x, y } = modelCoords(e);
        simulation.setFireLineMarker(1, x, y);
      }
      : undefined
  };
};
