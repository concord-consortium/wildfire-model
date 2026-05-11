// Stub — filled in step 5.
import * as React from "react";
import { BaseReading } from "../types";
import { Engine } from "../engine";

export interface AnalysisEngineProviderProps<TReading extends BaseReading = BaseReading, TDefaults = unknown> {
  engine: Engine<TReading, TDefaults>;
  appRulesVersion: string | number;
  children?: React.ReactNode;
}

export interface HookReturn<TReading extends BaseReading = BaseReading, TDefaults = unknown> {
  engine: Engine<TReading, TDefaults>;
  appRulesVersion: string | number;
  factorVariableValues: Record<string, unknown>;
  matchedCategory: number | null;
  perCategoryTruth: Record<number, unknown>;
}

export function AnalysisEngineProvider<TReading extends BaseReading, TDefaults>(
  _props: AnalysisEngineProviderProps<TReading, TDefaults>,
): React.ReactElement | null { return null; }

export function useAnalysisEngine<TReading extends BaseReading = BaseReading, TDefaults = unknown>(): HookReturn<TReading, TDefaults> {
  throw new Error("useAnalysisEngine stub");
}
