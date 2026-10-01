import { TemporalVariableImpl } from "../engine";
import { CHART_TAB_INITIAL_OPEN } from "./constants";

// Convention: pin V at the declaration site (e.g. TemporalVariableImpl<boolean>)
// so the reducer body benefits from narrow typing (_prev: boolean, return
// boolean). The map type below widens to <unknown> for storage; consumers
// (engine.temporalValues[name], currentTemporal<V>) work with `unknown` and
// don't rely on V from the map.
//
// Invariant: the host must emit `ChartTabShown` / `ChartTabHidden` whenever
// `ui.showChart` changes. `UIModel.setShowChart` is the single setter that
// mutates the observable and emits the event together; any new mutation site
// must go through it, or the engine's chartTabOpen projection will silently
// desync from the visual ground truth.
const chartTabOpen: TemporalVariableImpl<boolean> = {
  name: "chartTabOpen",
  initialValue: CHART_TAB_INITIAL_OPEN,
  acceptedEvents: ["ChartTabShown", "ChartTabHidden"],
  reduce: (_prev, event) => event.name === "ChartTabShown",
};

// Explicit `<unknown>` matches the project pattern at
// src/hazbot/wildfire/factor-variables.ts (Record<string, FactorVariableImpl<unknown, ...>>).
// V is erased here on purpose.
export const temporalVariables: Record<string, TemporalVariableImpl<unknown>> = {
  chartTabOpen,
};
