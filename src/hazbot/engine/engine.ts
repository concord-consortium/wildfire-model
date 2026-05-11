// Stub — filled in step 3.
import { BaseReading, EngineError, FactorVariableImpl, RuleSet, SimPropImpl, ConsumedEvent, ReadingUpdate } from "./types";

export interface EngineOpts<TReading extends BaseReading, TDefaults = unknown> {
  ruleSet?: RuleSet<TDefaults>;
  requestedRuleSetId?: string;
  factorVariables: Record<string, FactorVariableImpl<unknown, TReading, TDefaults>>;
  simProps: Record<string, SimPropImpl<TReading, TDefaults>>;
  translate: (event: ConsumedEvent, sessionId: string) =>
    | { kind: "trigger"; reading: TReading }
    | { kind: "modifier"; update: ReadingUpdate }
    | { kind: "no-op" };
  runStartTriggers?: string[];
}

export class Engine<TReading extends BaseReading, TDefaults = unknown> {
  readings: TReading[] = [];
  errors: EngineError[] = [];
  sessionId = "";
  ruleSet: RuleSet<TDefaults> | undefined = undefined;
  requestedRuleSetId: string | undefined = undefined;
  factorVariables: Record<string, FactorVariableImpl<unknown, TReading, TDefaults>>;
  simProps: Record<string, SimPropImpl<TReading, TDefaults>>;

  constructor(_opts: EngineOpts<TReading, TDefaults>) {
    this.factorVariables = _opts.factorVariables;
    this.simProps = _opts.simProps;
  }
  get isActive(): boolean { return false; }
  consume(_event: ConsumedEvent): void { /* stub */ }
  subscribe = (_listener: () => void): (() => void) => () => undefined;
  getSnapshot = (): number => 0;
}
