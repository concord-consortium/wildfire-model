import { ConsumedEvent } from "../engine";
import { WildfireReading } from "./types";

// Maps incoming events to triggers / no-ops for the engine.
// ChartTabShown / ChartTabHidden are handled by the chartTabOpen temporal
// variable now; they never produce modifiers (and the substrate's modifier
// branch is retired in Step 9).
export type TranslateResult =
  | { kind: "trigger"; reading: WildfireReading }
  | { kind: "modifier"; update: import("../engine").ReadingUpdate }
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
        updates: [],
        temporalHistory: [],
        zones: data.zones,
        sparks: data.sparks,
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
        updates: [],
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
