// Substrate public API surface (per requirements.md "Substrate public API surface").
// This is the host-app-facing barrel; everything not re-exported here is substrate-internal.

export type {
  BaseReading, ReadingUpdate, ConsumedEvent, EngineError,
  RuleSet, Category, FactorVariableDef, FactorVariableImpl, SimPropImpl,
  TemporalVariableImpl, TemporalVariableChange,
} from "./types";
export { EngineConstructionError } from "./types";
export { Engine } from "./engine";
export type { EngineOpts } from "./engine";
export type { Expression } from "./parser";
export { ParseError } from "./parser";
export { ENGINE_VERSION } from "./version";
export { AnalysisEngineProvider, useAnalysisEngine } from "./react";
export type { AnalysisEngineProviderProps, HookReturn } from "./react";
