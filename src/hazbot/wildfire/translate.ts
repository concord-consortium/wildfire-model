import { ConsumedEvent } from "../engine";
import { WildfireReading } from "./types";

// Maps incoming events to triggers / no-ops / modifiers for the engine.
// ChartTabShown / ChartTabHidden are handled by the chartTabOpen temporal
// variable; they never produce modifiers.
export type TranslateResult =
  | { kind: "trigger"; reading: WildfireReading }
  | { kind: "no-op" }
  | { kind: "modifier"; apply: (lastReading: WildfireReading | undefined) => boolean };

// A helitack / terminator only acts on an *open* run-start reading — i.e. a
// SimulationStarted reading whose window has not been closed by a terminator.
const isOpenRunStart = (r: WildfireReading | undefined): r is WildfireReading =>
  r?.triggeredBy === "SimulationStarted" && !r.runWindowClosed;

export function translate(
  event: ConsumedEvent,
  sessionId: string,
): TranslateResult {
  switch (event.name) {
    case "SimulationStarted": {
      const data = (event.data ?? {}) as Partial<WildfireReading>;
      const reading: WildfireReading = {
        triggeredBy: "SimulationStarted",
        sessionId,
        at: event.at,
        temporalHistory: [],
        zones: data.zones,
        sparks: data.sparks,
        fireLineMarkers: data.fireLineMarkers,
        wind: data.wind,
        elevationRange: data.elevationRange,
        heightmapMaxElevation: data.heightmapMaxElevation,
      };
      return { kind: "trigger", reading };
    }
    case "SimulationEnded":
    case "SimulationStopped": {
      const data = (event.data ?? {}) as Partial<WildfireReading>;
      const reading: WildfireReading = {
        triggeredBy: event.name,
        sessionId,
        at: event.at,
        temporalHistory: [],
        outcome: data.outcome,
      };
      return { kind: "trigger", reading };
    }
    case "Helitack":
      return { kind: "modifier", apply: (lastReading) => {
        if (!isOpenRunStart(lastReading)) return false;  // pre-run / between-runs → ignore
        lastReading.helitack = true;
        return true;
      } };
    case "SimulationRestarted":
    case "SimulationReloaded":
    case "TopBarReloadButtonClicked":
      return { kind: "modifier", apply: (lastReading) => {
        if (!isOpenRunStart(lastReading)) return false;  // window already closed by a reading-pushing terminator
        lastReading.runWindowClosed = true;
        return true;
      } };
    case "ChartTabShown":
    case "ChartTabHidden":
    case "AnalysisEngineActivated":
    default:
      return { kind: "no-op" };
  }
}
