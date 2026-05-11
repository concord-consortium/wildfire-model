import * as React from "react";
import { Engine } from "../engine";
import { BaseReading } from "../types";
import { AnalysisEngineContext } from "./context";

export interface AnalysisEngineProviderProps<TReading extends BaseReading = BaseReading, TDefaults = unknown> {
  engine: Engine<TReading, TDefaults>;
  appRulesVersion: string | number;
  children?: React.ReactNode;
}

export function AnalysisEngineProvider<TReading extends BaseReading, TDefaults>(
  props: AnalysisEngineProviderProps<TReading, TDefaults>,
): React.ReactElement {
  const value = React.useMemo(
    () => ({
      // Cast: see context.ts — React can't carry generic Engine<TReading, TDefaults> through
      // its context boundary. The consumer's hook generics restore the typed view.
      engine: props.engine as unknown as Engine<BaseReading, unknown>,
      appRulesVersion: props.appRulesVersion,
    }),
    [props.engine, props.appRulesVersion],
  );
  return (
    <AnalysisEngineContext.Provider value={value}>
      {props.children}
    </AnalysisEngineContext.Provider>
  );
}
