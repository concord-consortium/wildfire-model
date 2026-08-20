import { ICoords, SimulationModel } from "./simulation";
import { Interaction, UIModel } from "./ui";
import { log } from "../log";

// Every fire line event reports positions as a fraction of the model extent paired with the
// elevation under the point, so one point and one endpoint pair describe them all.
export const fireLinePointData = (simulation: SimulationModel, point: ICoords) => ({
  x: point.x / simulation.config.modelWidth,
  y: point.y / simulation.config.modelHeight,
  elevation: simulation.cellAt(point.x, point.y)?.elevation
});

export const fireLineData = (simulation: SimulationModel, start: ICoords, end: ICoords) => {
  const from = fireLinePointData(simulation, start);
  const to = fireLinePointData(simulation, end);
  return {
    x1: from.x, y1: from.y, elevation1: from.elevation,
    x2: to.x, y2: to.y, elevation2: to.elevation
  };
};

// "other" is reserved for the reaction backstop in useFireLinePlacementCancel: it means
// a route left DrawFireLine without calling this itself, and should be treated as a gap.
export type FireLineCancelReason =
  "escape" | "toggle" | "toolSwitch" | "start" | "restart" | "reload" | "other";

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
    Object.assign(data, fireLinePointData(simulation, start));
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
  log("FireLineUpdated", fireLineData(simulation, start, end));
};
