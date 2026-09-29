import {
  flushStateUpdates, getInitInteractiveMessage, inIframe, setInteractiveState
} from "@concord-consortium/lara-interactive-api";
import type { IStores } from "./models/stores";
import { applySavedState, buildSavedState, validateSavedState } from "./models/saved-state";
import { log } from "./log";

// Restores a saved run only in report mode, where the model is read-only. In runtime mode the
// student's model loads fresh whatever state the Activity Player sends.
export const initInteractiveState = async ({ simulation, chartStore, ui }: IStores) => {
  if (!inIframe()) return;
  const initMessage = await getInitInteractiveMessage<unknown>();
  if (initMessage?.mode !== "report") return;

  ui.readOnly = true;
  if (!initMessage.interactiveState) return;
  await simulation.dataReadyPromise;
  const result = validateSavedState(initMessage.interactiveState, simulation);
  if (!result.ok) {
    console.warn(`Wildfire ignored the saved state: ${result.reason}`);
    return;
  }
  try {
    await applySavedState(simulation, chartStore, result.state);
  } catch (e) {
    console.warn("Wildfire could not draw the saved state", e);
    chartStore.reset();
    simulation.reload();
  }
};

// Sent at once rather than after the API's debounce, so a reload or tab close cannot lose it.
export const saveRun = ({ simulation, chartStore, ui }: IStores, endReason: string) => {
  if (!inIframe() || ui.readOnly) return;
  setInteractiveState(buildSavedState(simulation, chartStore, endReason));
  flushStateUpdates();
};

// Must run before the caller resets the model. Only a run's first end is saved: the Restart,
// Clear All or reload that follows a burn-out logs the same run again.
export const logSimulationEnded = (stores: IStores, reason: string) => {
  const { simulation, chartStore } = stores;
  const firstEnd = simulation.simulationStarted && !simulation.simulationEndedLogged;
  simulation.simulationEndedLogged = true;
  log("SimulationEnded", { reason, outcome: simulation.getOutcomeData(chartStore) });
  if (firstEnd) {
    saveRun(stores, reason);
  }
};
