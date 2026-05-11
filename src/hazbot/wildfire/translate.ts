import { ConsumedEvent, ReadingUpdate } from "../engine";
import { WildfireReading } from "./types";

// Maps incoming events to triggers / modifiers / no-ops for the engine.
// Per Tech Notes "Inputs: triggers vs. modifiers".
export type TranslateResult =
  | { kind: "trigger"; reading: WildfireReading }
  | { kind: "modifier"; update: ReadingUpdate }
  | { kind: "no-op" };

export function translate(event: ConsumedEvent, sessionId: string): TranslateResult {
  switch (event.name) {
    case "SimulationStarted": {
      const data = (event.data ?? {}) as Partial<WildfireReading>;
      const ambient = (event.ambientState ?? {}) as { chartTabOpenAtStart?: boolean };
      const reading: WildfireReading = {
        triggeredBy: "SimulationStarted",
        sessionId,
        at: event.at,
        updates: [],
        zones: data.zones,
        sparks: data.sparks,
        wind: data.wind,
        ambientState: ambient,
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
        outcome: data.outcome,
      };
      return { kind: "trigger", reading };
    }
    case "ChartTabShown":
      return { kind: "modifier", update: { source: "ChartTabShown", value: true, at: event.at } };
    case "ChartTabHidden":
      return { kind: "modifier", update: { source: "ChartTabHidden", value: false, at: event.at } };
    case "SimulationRestarted":
    case "SimulationReloaded":
    case "TopBarReloadButtonClicked":
    case "AnalysisEngineActivated":
      return { kind: "no-op" };
    default:
      return { kind: "no-op" };
  }
}
