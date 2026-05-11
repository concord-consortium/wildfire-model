import * as React from "react";
import { Engine, PARSE_ERROR_SENTINEL } from "../engine";
import { BaseReading } from "../types";
import { AnalysisEngineContext } from "./context";
import {
  computeMatchedCategoryFloor, evaluateLeaf, makeRenderCtx, LeafTruth,
} from "../evaluator";
import { evaluateFactorVarForRender } from "../safely-evaluate-impl";

export interface HookReturn<TReading extends BaseReading = BaseReading, TDefaults = unknown> {
  engine: Engine<TReading, TDefaults>;
  appRulesVersion: string | number;
  factorVariableValues: Record<string, unknown>;
  matchedCategory: number | null;
  perCategoryTruth: Record<number, LeafTruth>;
}

interface CacheEntry {
  snapshot: number;
  appRulesVersion: string | number;
  view: HookReturn<BaseReading, unknown>;
}
// Module-level WeakMap keyed by engine instance — when the engine is discarded
// (typical in tests) the cache entry is GC'd automatically. Multiple consumer
// components in the same render hit the same cache (FE-3 / R10-1).
const cache = new WeakMap<Engine<BaseReading, unknown>, CacheEntry>();

function computeView<TR extends BaseReading, TD>(
  engine: Engine<TR, TD>,
  appRulesVersion: string | number,
): HookReturn<TR, TD> {
  const factorVariableValues: Record<string, unknown> = {};
  // factorVariableValues runs in all states via evaluateForRender's 3-branch guard.
  Object.entries(engine.factorVariables).forEach(([name, impl]) => {
    const wrapped = evaluateFactorVarForRender(
      { name, impl }, engine.readings, engine.ruleSet?.defaults as TD | undefined,
      engine.implsWithIncompleteDefaults,
    );
    factorVariableValues[name] = wrapped.value;
  });

  // matchedCategory + perCategoryTruth short-circuit when !isActive (per EXT-9).
  let matchedCategory: number | null = null;
  const perCategoryTruth: Record<number, LeafTruth> = {};
  if (engine.isActive && engine.ruleSet) {
    const defaults = engine.ruleSet.defaults as TD | undefined;
    matchedCategory = computeMatchedCategoryFloor(
      engine.ruleSet, engine.parsedExpressions,
      (slice) => makeRenderCtx(slice, defaults, engine.factorVariables, engine.simProps, engine.implsWithIncompleteDefaults),
      engine.readings,
    );
    const ctx = makeRenderCtx(
      engine.readings, defaults, engine.factorVariables, engine.simProps, engine.implsWithIncompleteDefaults,
    );
    engine.ruleSet.categories.forEach((cat) => {
      const ast = engine.parsedExpressions.get(cat.id);
      if (!ast || ast === PARSE_ERROR_SENTINEL) return;
      perCategoryTruth[cat.id] = evaluateLeaf(ast, ctx);
    });
  }

  return { engine, appRulesVersion, factorVariableValues, matchedCategory, perCategoryTruth };
}

export function useAnalysisEngine<TReading extends BaseReading = BaseReading, TDefaults = unknown>(): HookReturn<TReading, TDefaults> {
  const ctx = React.useContext(AnalysisEngineContext);
  if (ctx === null) throw new Error("useAnalysisEngine must be used inside <AnalysisEngineProvider>");
  // useSyncExternalStore re-renders when getSnapshot returns a different value.
  // Use the returned snapshot to key the cache (avoids a redundant getSnapshot call).
  const snapshot = React.useSyncExternalStore(ctx.engine.subscribe, ctx.engine.getSnapshot);
  const entry = cache.get(ctx.engine);
  if (entry && entry.snapshot === snapshot && entry.appRulesVersion === ctx.appRulesVersion) {
    return entry.view as unknown as HookReturn<TReading, TDefaults>;
  }
  const view = computeView<BaseReading, unknown>(ctx.engine, ctx.appRulesVersion);
  cache.set(ctx.engine, { snapshot, appRulesVersion: ctx.appRulesVersion, view });
  return view as unknown as HookReturn<TReading, TDefaults>;
}
