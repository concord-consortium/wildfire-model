import { BaseReading, EngineError, FactorVariableImpl, SimPropImpl } from "./types";
import { renderError } from "./error-rendering";

export interface EngineLite<TReading extends BaseReading> {
  readings: TReading[];
  errors: EngineError[];
  ruleSet: { id: string } | undefined;
  // For EXT-18 — render-path defaults guard.
  implsWithIncompleteDefaults?: Set<string>;
}

interface NamedFactorVar<V, TR extends BaseReading, TD> {
  name: string;
  impl: FactorVariableImpl<V, TR, TD>;
}
interface NamedSimProp<TR extends BaseReading, TD> {
  name: string;
  impl: SimPropImpl<TR, TD>;
}

// Consume-path wrapper for FactorVariableImpl.compute.
// On throw: append impl-eval-throw to engine.errors (no readingIndex per EXT-19),
// log to console, and return the per-impl-kind fallback shape (per EXT-12):
// `{ value: impl.defaultValue, witnesses: [] }`.
//
// NOTE: WM-10's engine deliberately performs no expression evaluation during
// `consume()` — all evaluation happens off the React render path via
// `evaluateFactorVarForRender` / `evaluateSimPropForRender`. This consume-path
// wrapper exists as a substrate API for future consumers that want to evaluate
// at consume time (e.g., emitting matched-category transitions as engine events,
// log replay, non-React analytic surfaces); the `impl-eval-throw` variant in
// `EngineError` is reachable through this path. Engine state mutation lives here,
// not in the render-path wrapper, per ENG-2.
export function safelyEvaluateFactorVar<V, TR extends BaseReading, TD>(
  engine: EngineLite<TR>,
  fvar: NamedFactorVar<V, TR, TD>,
  readings: TR[],
  defaults: TD,
): { value: V; witnesses: TR[] } {
  try {
    return fvar.impl.compute(readings, defaults);
  } catch (thrown) {
    const err: EngineError = {
      kind: "impl-eval-throw",
      ruleSetId: engine.ruleSet?.id ?? "(unknown)",
      implName: fvar.name,
      implKind: "factor-variable",
      thrown,
      at: Date.now(),
    };
    engine.errors.push(err);
    // eslint-disable-next-line no-console
    console.error(renderError(err, { readingsLength: readings.length }).message);
    return { value: fvar.impl.defaultValue, witnesses: [] };
  }
}

// Consume-path wrapper for SimPropImpl.evaluate.
// On throw: append impl-eval-throw with readingIndex (sim-prop reads a single reading),
// log to console, return impl.defaultValue (boolean).
export function safelyEvaluateSimProp<TR extends BaseReading, TD>(
  engine: EngineLite<TR>,
  sprop: NamedSimProp<TR, TD>,
  reading: TR,
  readingIndex: number,
  defaults: TD,
): boolean {
  try {
    return sprop.impl.evaluate(reading, defaults);
  } catch (thrown) {
    const err: EngineError = {
      kind: "impl-eval-throw",
      ruleSetId: engine.ruleSet?.id ?? "(unknown)",
      implName: sprop.name,
      implKind: "sim-prop",
      readingIndex,
      thrown,
      at: Date.now(),
    };
    engine.errors.push(err);
    // eslint-disable-next-line no-console
    console.error(renderError(err).message);
    return sprop.impl.defaultValue;
  }
}

// Render-path wrapper for FactorVariableImpl.compute (per EXT-7 / ENG-2 / EXT-18).
// Three-branch defaults guard:
//   (1) defaults === undefined → if impl reads defaults, return fallback without
//       calling compute. Else call compute with cast (impl contract: doesn't read defaults).
//   (2) defaults defined && impl in implsWithIncompleteDefaults → return fallback.
//   (3) defaults defined && impl complete → call compute normally.
// Always catches throws and returns the per-impl-kind fallback shape WITHOUT
// mutating engine state (no errors append, no console output).
export function evaluateFactorVarForRender<V, TR extends BaseReading, TD>(
  fvar: NamedFactorVar<V, TR, TD>,
  readings: TR[],
  defaults: TD | undefined,
  implsWithIncompleteDefaults?: Set<string>,
): { value: V; witnesses: TR[] } {
  const reads = fvar.impl.requiredDefaults?.length ?? 0;
  // Branch 1: defaults undefined.
  if (defaults === undefined) {
    if (reads > 0) return { value: fvar.impl.defaultValue, witnesses: [] };
    // Impl doesn't read defaults; safe to call.
    try {
      return fvar.impl.compute(readings, undefined as TD);
    } catch {
      return { value: fvar.impl.defaultValue, witnesses: [] };
    }
  }
  // Branch 2: defaults defined but this impl is incomplete.
  if (implsWithIncompleteDefaults?.has(fvar.name)) {
    return { value: fvar.impl.defaultValue, witnesses: [] };
  }
  // Branch 3.
  try {
    return fvar.impl.compute(readings, defaults);
  } catch {
    return { value: fvar.impl.defaultValue, witnesses: [] };
  }
}

// Render-path wrapper for SimPropImpl.evaluate.
export function evaluateSimPropForRender<TR extends BaseReading, TD>(
  sprop: NamedSimProp<TR, TD>,
  reading: TR,
  defaults: TD | undefined,
  implsWithIncompleteDefaults?: Set<string>,
): boolean {
  const reads = sprop.impl.requiredDefaults?.length ?? 0;
  if (defaults === undefined) {
    if (reads > 0) return sprop.impl.defaultValue;
    try {
      return sprop.impl.evaluate(reading, undefined as TD);
    } catch {
      return sprop.impl.defaultValue;
    }
  }
  if (implsWithIncompleteDefaults?.has(sprop.name)) {
    return sprop.impl.defaultValue;
  }
  try {
    return sprop.impl.evaluate(reading, defaults);
  } catch {
    return sprop.impl.defaultValue;
  }
}

// Helpers used by step 5 / step 6 for substrate-internal type-narrowing.
// Re-exported via internal-only convention; not part of the published surface.
//
// SimPropWrap omits `readingIndex` deliberately: the only live caller is the
// evaluator's WITH path (evaluatePropExpr), which iterates witnesses without a
// stable index into engine.readings — the witness set is filtered from the full
// readings array but isn't 1:1 with it. The consume-path `safelyEvaluateSimProp`
// takes readingIndex separately because its own callers (none today, but reserved
// for a future consume-time evaluator) have an authoritative index in scope.
export type FactorVarWrap<TR extends BaseReading, TD> =
  <V>(fvar: NamedFactorVar<V, TR, TD>, readings: TR[], defaults: TD | undefined) => { value: V; witnesses: TR[] };
export type SimPropWrap<TR extends BaseReading, TD> =
  (sprop: NamedSimProp<TR, TD>, reading: TR, defaults: TD | undefined) => boolean;

