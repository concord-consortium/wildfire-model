import { SimulationModel } from "./simulation";
import { Interaction, UIModel } from "./ui";
import { log } from "../log";

// "other" is reserved for the reaction backstop in useFireLinePlacementCancel: it means
// a route left DrawFireLine without calling this itself, and should be treated as a gap.
export type FireLineCancelReason = "escape" | "toggle" | "toolSwitch" | "start" | "other";

// Discards a fire line placement that was never completed and disarms the tool. Safe to
// call unconditionally; it does nothing unless the tool is armed or a placement is open.
export const cancelFireLinePlacement = (
  simulation: SimulationModel, ui: UIModel, reason: FireLineCancelReason
) => {
  const armed = ui.interaction === Interaction.DrawFireLine;
  if (!armed && !ui.fireLinePlacementInProgress) {
    return;
  }
  const [start, end] = simulation.fireLineMarkers;
  const placed = ui.fireLinePlacementInProgress && !!start;
  const data: Record<string, unknown> = { reason };
  if (placed) {
    data.x = start.x / simulation.config.modelWidth;
    data.y = start.y / simulation.config.modelHeight;
    data.elevation = simulation.cellAt(start.x, start.y)?.elevation;
    if (end) {
      simulation.markFireLineUnderConstruction(start, end, false);
    }
    simulation.fireLineMarkers.length = 0;
  }
  ui.fireLinePlacementInProgress = false;
  if (armed) {
    // Only when still armed: the backstop runs after another writer has already moved
    // ui.interaction on, and clearing it there would undo their tool switch.
    ui.interaction = null;
  }
  log("FireLineCanceled", data);
};

// Logs a drag of one placed fire line endpoint. The markers pair up by index, so an odd
// count leaves an endpoint without a partner and there is no line to report.
export const logFireLineUpdate = (simulation: SimulationModel, idx: number) => {
  const start = idx % 2 === 0 ? simulation.fireLineMarkers[idx] : simulation.fireLineMarkers[idx - 1];
  const end = idx % 2 === 0 ? simulation.fireLineMarkers[idx + 1] : simulation.fireLineMarkers[idx];
  if (!start || !end) {
    return;
  }
  log("FireLineUpdated", {
    x1: start.x / simulation.config.modelWidth,
    y1: start.y / simulation.config.modelHeight,
    elevation1: simulation.cellAt(start.x, start.y)?.elevation,
    x2: end.x / simulation.config.modelWidth,
    y2: end.y / simulation.config.modelHeight,
    elevation2: simulation.cellAt(end.x, end.y)?.elevation
  });
};
