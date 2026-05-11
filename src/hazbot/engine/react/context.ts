import * as React from "react";
import { Engine } from "../engine";
import { BaseReading } from "../types";

// React contexts can't carry generic type parameters at the boundary, so the engine
// is typed as Engine<BaseReading, unknown> here. Per LIB-3: useAnalysisEngine's
// generics are a *consumer's claim*, not TS-validated narrowing — host apps with
// strict type-safety needs should wrap the hook in a typed factory in their bridge.
export interface AnalysisEngineContextValue {
  engine: Engine<BaseReading, unknown>;
  appRulesVersion: string | number;
}

export const AnalysisEngineContext = React.createContext<AnalysisEngineContextValue | null>(null);
