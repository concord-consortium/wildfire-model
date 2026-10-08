import {
  flushStateUpdates, getInitInteractiveMessage, inIframe, setInteractiveState, setSupportedFeatures, unlockQuestions
} from "@concord-consortium/lara-interactive-api";
import type { IStores } from "./models/stores";
import type { UIModel } from "./models/ui";
import {
  applySavedState, buildSavedState, ISavedRunState, savedStateUnlocked, validateSavedState
} from "./models/saved-state";
import { getAnalysisEngine } from "./hazbot/wildfire";
import { hazbotAvailable } from "./hazbot/wildfire/hazbot-available";
import { log } from "./log";

// Sent at once rather than after the API's debounce, so a reload or tab close cannot lose it.
const sendState = (ui: UIModel, state: ISavedRunState) => {
  ui.lastSavedState = state;
  setInteractiveState(state);
  flushStateUpdates();
};

// Without the Hazbot button nothing can unlock, so the host must not be told Wildfire gates.
const initQuestionGating = (ui: UIModel, interactiveState: unknown) => {
  if (!hazbotAvailable(getAnalysisEngine(), ui.readOnly)) return;
  setSupportedFeatures({ questionGating: true });
  ui.questionGatingDeclared = true;
  if (savedStateUnlocked(interactiveState)) {
    ui.questionsUnlocked = true;
    unlockQuestions({ restored: true });
    // A run that ended before init has already saved over the flagged state without the flag.
    if (ui.lastSavedState) sendState(ui, { ...ui.lastSavedState, questionsUnlocked: true });
  }
};

// Restores a saved run only in report mode, where the model is read-only. In runtime mode the
// student's model loads fresh whatever state the Activity Player sends.
export const initInteractiveState = async (stores: IStores) => {
  const { simulation, chartStore, ui } = stores;
  if (!inIframe()) return;
  const initMessage = await getInitInteractiveMessage<unknown>();
  if (initMessage?.mode === "runtime") {
    initQuestionGating(ui, initMessage.interactiveState);
    return;
  }
  if (initMessage?.mode !== "report") return;

  ui.readOnly = true;
  // The model is interactive until the init message arrives, so undo anything started before it.
  ui.showTerrainUI = false;
  ui.interaction = null;
  ui.fireLinePlacementInProgress = false;
  if (simulation.simulationStarted) {
    chartStore.reset();
    simulation.restart();
  }
  if (!initMessage.interactiveState) return;
  await simulation.dataReadyPromise;
  const result = validateSavedState(initMessage.interactiveState, simulation);
  if (!result.ok) {
    console.warn(`Wildfire ignored the saved state: ${result.reason}`);
    return;
  }
  try {
    await applySavedState(stores, result.state);
  } catch (e) {
    console.warn("Wildfire could not draw the saved state", e);
    chartStore.reset();
    simulation.reload();
  }
};

export const saveRun = (stores: IStores, endReason: string) => {
  if (!inIframe() || stores.ui.readOnly) return;
  sendState(stores.ui, buildSavedState(stores, endReason));
};

// Must run before the caller resets the model. Only a run's first end is saved: the Restart,
// Clear All or reload that follows a burn-out logs the same run again.
export const logSimulationEnded = (stores: IStores, reason: string) => {
  const { simulation, chartStore } = stores;
  const firstEnd = simulation.simulationStarted && !simulation.simulationEndedLogged;
  simulation.simulationEndedLogged = true;
  if (simulation.simulationStarted) {
    chartStore.recordCurrentHourIfMissing(simulation);
  }
  log("SimulationEnded", { reason, outcome: simulation.getOutcomeData(chartStore) });
  if (firstEnd) {
    saveRun(stores, reason);
  }
};

// The rule: a Hazbot click after a run ended in this visit. Every ended run is saved before the
// Hazbot button can be clicked again, so a run this visit is exactly a saved state in hand, and
// the unlock re-saves that run with the flag set so a later visit can restore it.
export const unlockQuestionsIfEarned = (ui: UIModel) => {
  if (!ui.questionGatingDeclared || ui.questionsUnlocked || !ui.lastSavedState) return;
  ui.questionsUnlocked = true;
  unlockQuestions();
  sendState(ui, { ...ui.lastSavedState, questionsUnlocked: true });
};
