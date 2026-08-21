import * as React from "react";
import { Engine, PARSE_ERROR_SENTINEL } from "../engine";
import { BaseReading } from "../types";
import { AnalysisEngineContext } from "./context";
import {
  computeCategorySelectionForEngine, evaluateLeaf, makeRenderCtx, LeafTruth,
} from "../evaluator";
import { evaluateFactorVarForRender, evaluateSimPropForRender } from "../safely-evaluate-impl";

export interface HookReturn<TReading extends BaseReading = BaseReading, TDefaults = unknown> {
  engine: Engine<TReading, TDefaults>;
  appRulesVersion: string | number;
  factorVariableValues: Record<string, unknown>;
  // Each sim-prop's value at the latest run-start reading, or null when no run-start
  // reading exists yet (sim-props are per-reading; no reading = no meaningful value).
  simPropValues: Record<string, boolean | null>;
  matchedCategory: number | null;
  // `categoryCurrent` is null both when the activity has no window and when the window
  // matched nothing. `categoryUsed` is what the student-facing feedback is selected from
  // and what the highlighted category row shows.
  categoryCurrent: number | null;
  categoryUsed: number | null;
  // The HOST's own description of the window it chose, or null. A display string, not a
  // signal: `label` is optional, so a host that supplies a selector and no label reads
  // null here while having a perfectly good window. Window presence is the selector's
  // presence, `engine.readingsWindow` alone, which is what the sidebar gates on: a
  // selector that returns null for this activity still renders the block, so the walker
  // sees `current: n/a` with the highlight back on `best` (tab 24's range_cc 0 case)
  // rather than no block at all. Telling the two null causes of `categoryCurrent` apart
  // would need its own field.
  categoryWindowLabel: string | null;
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
  // factorVariableValues runs in all engine states — evaluateFactorVarForRender
  // calls compute inside a try/catch and falls back to the impl default on throw.
  Object.entries(engine.factorVariables).forEach(([name, impl]) => {
    const wrapped = evaluateFactorVarForRender({ name, impl }, engine.readings, engine.defaults);
    factorVariableValues[name] = wrapped.value;
  });

  // Sim-props evaluate per-reading, so "current value" means the latest run-start
  // reading. Without one, sim-props have no meaningful value — surface null so the
  // sidebar can show a placeholder rather than a misleading default.
  const simPropValues: Record<string, boolean | null> = {};
  const witnessReading = engine.latestRunStartReading;
  const defaults = engine.defaults;
  Object.entries(engine.simProps).forEach(([name, impl]) => {
    if (witnessReading === undefined) {
      simPropValues[name] = null;
    } else {
      simPropValues[name] = evaluateSimPropForRender({ name, impl }, witnessReading, defaults);
    }
  });

  // matchedCategory + perCategoryTruth short-circuit when !isActive (per EXT-9).
  // One call, so the sidebar cannot disagree with the number hazbot-button shows the
  // student: both read the same computeCategorySelectionForEngine.
  const { best: matchedCategory, current: categoryCurrent, used: categoryUsed, label } =
    computeCategorySelectionForEngine(engine);
  const categoryWindowLabel = label ?? null;
  const perCategoryTruth: Record<number, LeafTruth> = {};
  if (engine.isActive && engine.ruleSet) {
    const ctx = makeRenderCtx(engine.readings, defaults, engine.factorVariables, engine.simProps);
    engine.ruleSet.categories.forEach((cat) => {
      const ast = engine.parsedExpressions.get(cat.id);
      if (!ast || ast === PARSE_ERROR_SENTINEL) return;
      perCategoryTruth[cat.id] = evaluateLeaf(ast, ctx);
    });
  }

  return {
    engine, appRulesVersion, factorVariableValues, simPropValues,
    matchedCategory, categoryCurrent, categoryUsed, categoryWindowLabel, perCategoryTruth,
  };
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
