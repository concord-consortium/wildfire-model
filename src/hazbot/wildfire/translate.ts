import { ConsumedEvent, ReadingUpdate } from "../engine";
import { WildfireReading } from "./types";

// Maps incoming events to triggers / modifiers / no-ops for the engine.
// Per Tech Notes "Inputs: triggers vs. modifiers".
export type TranslateResult =
  | { kind: "trigger"; reading: WildfireReading }
  | { kind: "modifier"; update: ReadingUpdate }
  | { kind: "no-op" };

export function translate(
  event: ConsumedEvent,
  sessionId: string,
  latestReading?: WildfireReading,
): TranslateResult {
  switch (event.name) {
    case "SimulationStarted": {
      const data = (event.data ?? {}) as Partial<WildfireReading>;
      const ambient = (event.ambientState ?? {}) as { chartTabOpenAtStart?: boolean };
      const reading: WildfireReading = {
        triggeredBy: "SimulationStarted",
        sessionId,
        at: event.at,
        updates: [],
        temporalHistory: [],
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
        temporalHistory: [],
        outcome: data.outcome,
      };
      return { kind: "trigger", reading };
    }
    case "ChartTabShown":
    case "ChartTabHidden": {
      // Only emit as a modifier when a run is in progress (latest reading is a
      // SimulationStarted that hasn't yet ended). Otherwise the substrate's
      // orphan-modifier detector would emit a noisy "no-prior-trigger" or
      // "between-runs" error — but the GraphOpen sim-prop already captures
      // chart state at the next SimulationStarted via
      // `ambientState.chartTabOpenAtStart`, so the modifier carries no
      // additional information here. Silently no-op instead.
      if (!latestReading || latestReading.triggeredBy !== "SimulationStarted") {
        return { kind: "no-op" };
      }
      const value = event.name === "ChartTabShown";
      return { kind: "modifier", update: { source: event.name, value, at: event.at } };
    }
    case "SimulationRestarted":
    case "SimulationReloaded":
    case "TopBarReloadButtonClicked":
    case "AnalysisEngineActivated":
      return { kind: "no-op" };
    default:
      return { kind: "no-op" };
  }
}
