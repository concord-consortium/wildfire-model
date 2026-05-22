// Substrate types — the host-app-facing interfaces.

export interface BaseReading {
  triggeredBy: string;
  at: number;
  sessionId: string;
  temporalHistory: TemporalVariableChange[];
}

export interface TemporalVariableChange {
  at: number;
  name: string;
  value: unknown;
  eventName: string;
}

export interface TemporalVariableImpl<V = unknown> {
  name: string;
  initialValue: V;
  acceptedEvents: string[];
  reduce: (currentValue: V, event: ConsumedEvent) => V;
}

export interface ConsumedEvent {
  name: string;            // e.g. "SimulationStarted"
  data?: unknown;          // public log payload (LARA-bound)
  at: number;              // timestamp the event was emitted
}

// `TDefaults` is retained as a phantom parameter (unused inside the interface
// since WM-27 removed `RuleSet.defaults`) so the generated rule-set modules'
// `RuleSet<WildfireDefaults>` annotations stay valid without per-module edits.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface RuleSet<TDefaults = unknown> {
  id: string;                       // tab name, e.g. "23"
  categories: Category[];           // ordered lowest-to-highest by id
  factorVariables: FactorVariableDef[];
}

export interface Category {
  id: number;
  studentAction: string;
  feedback: string;
  visualFeedback: string;
  arrowText?: string;
  expression: string;
}

export interface FactorVariableDef {
  name: string;
  definition: string;
  logEvents: string[];
  details: string;
}

export interface FactorVariableImpl<V = unknown, TReading extends BaseReading = BaseReading, TDefaults = unknown> {
  temporalReads?: string[];
  // Substrate's catch handler reads `defaultValue` on impl throw (per ENG-1).
  defaultValue: V;
  isStub?: boolean;
  compute: (readings: TReading[], defaults: TDefaults) => { value: V; witnesses: TReading[] };
}

export interface SimPropImpl<TReading extends BaseReading = BaseReading, TDefaults = unknown> {
  temporalReads?: string[];
  defaultValue: boolean;
  isStub?: boolean;
  evaluate: (reading: TReading, defaults: TDefaults) => boolean;
}

export type EngineError =
  | { kind: "load-failure"; reason: "missing-rule-set" | "missing-impl"; ruleSetId?: string; detail: string; at: number }
  | {
      kind: "parse-error"; ruleSetId: string; categoryId: number; expression: string;
      tokenSpan: { start: number; end: number }; offendingToken: string; detail: string; at: number;
    }
  | {
      kind: "impl-eval-throw"; ruleSetId: string; implName: string;
      implKind: "factor-variable" | "sim-prop"; readingIndex?: number; thrown: unknown; at: number;
    }
  | { kind: "stub-warning"; stubName: string; at: number }
  | {
      kind: "temporal-validation"; ruleSetId: string; implName: string;
      implType: "factorVariable" | "simProp"; missingVariableName: string; at: number;
    }
  | {
      kind: "temporal-reducer-error"; ruleSetId: string; variableName: string;
      event: ConsumedEvent; thrown: unknown; at: number;
    }
  | {
      kind: "trigger-state-change-overlap"; ruleSetId: string; variableName: string;
      eventName: string; factorVariableName: string; at: number;
    }
  | {
      kind: "temporal-initial-values-mismatch"; ruleSetId: string;
      missing: string[]; unknown: string[];
      typeMismatches: Array<{ name: string; expectedType: string; actualType: string }>;
      at: number;
    };

export class EngineConstructionError extends Error {
  constructor(
    public readonly errors: EngineError[],
    public readonly ruleSetId: string,
  ) {
    super(`Engine construction failed for rule set ${ruleSetId} (${errors.length} error(s))`);
    this.name = "EngineConstructionError";
    Object.setPrototypeOf(this, EngineConstructionError.prototype);
  }
}
