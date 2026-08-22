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
  // The sheet's category-100 row: the feedback shown on a repeat click after the
  // student has already reached the tab's top category. Feedback-mechanism data,
  // never a matchable category, since its expression cannot parse. Optional, so
  // every hand-built RuleSet literal keeps compiling.
  repeatFeedback?: { id: number; studentAction: string; feedback: string };
}

export interface Category {
  id: number;
  studentAction: string;
  feedback: string;
  feedbackRound2?: string;          // sheet column G, "Notes for Round 2"
  feedbackRound3?: string;          // sheet column H, "Notes for Round 3"
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

// What a host's readings-window selector returns. The substrate is host-app-agnostic
// and cannot know what a "run" is, so the host decides which suffix of the readings
// `category.current` is evaluated over and describes that choice in its own vocabulary.
export interface WindowSelection<TReading extends BaseReading> {
  // The readings to evaluate over. A suffix of the array passed in, though the
  // substrate does not require that.
  readings: TReading[];
  // Free-text host description of the window, rendered verbatim by the dev sidebar
  // (wildfire supplies e.g. "range_cc 2 · 2 of 3 runs"). Never parsed by the substrate.
  label?: string;
}
