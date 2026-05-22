import { ConsumedEvent } from "../engine";
import { WildfireReading } from "./types";

// Maps incoming events to triggers / no-ops for the engine.
// ChartTabShown / ChartTabHidden are handled by the chartTabOpen temporal
// variable; they never produce modifiers.
export type TranslateResult =
  | { kind: "trigger"; reading: WildfireReading }
  | { kind: "no-op" };

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
    case "ChartTabShown":
    case "ChartTabHidden":
    case "SimulationRestarted":
    case "SimulationReloaded":
    case "TopBarReloadButtonClicked":
    case "AnalysisEngineActivated":
    default:
      return { kind: "no-op" };
  }
}
