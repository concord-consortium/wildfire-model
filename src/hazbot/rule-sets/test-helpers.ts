// Parameterized helper for the per-rule-set five-shape sweep
// (per AC: per-rule-set five-shape sweep (a–e)).
//
// Each rule-set test file (23.test.ts, 24.test.ts, …) imports this helper
// and supplies a small fixture-builder that constructs the readings/state
// shapes for the (a)–(e) sweep cases against that specific rule set.

import { Engine, EngineOpts, RuleSet } from "../engine";
import { computeMatchedCategoryFloor, makeRenderCtx } from "../engine/evaluator";
import { factorVariables } from "../wildfire/factor-variables";
import { simProps } from "../wildfire/sim-props";
import { temporalVariables } from "../wildfire/temporal-variables";
import { translate } from "../wildfire/translate";
import { WildfireDefaults, WildfireReading } from "../wildfire/types";

export function makeWildfireEngine(ruleSet: RuleSet<WildfireDefaults>): Engine<WildfireReading, WildfireDefaults> {
  const opts: EngineOpts<WildfireReading, WildfireDefaults> = {
    ruleSet,
    requestedRuleSetId: ruleSet.id,
    factorVariables,
    simProps,
    temporalVariables,
    translate,
    runStartTriggers: ["SimulationStarted"],
  };
  return new Engine<WildfireReading, WildfireDefaults>(opts);
}

// Computes the matched category for a sequence of pre-translated readings,
// without going through consume() (which requires events). For per-rule-set
// tests it's simpler to construct readings directly. Test-only helper —
// re-runs the floor per call without snapshot-keyed caching; production code
// paths use useAnalysisEngine which memoizes via the React hook's WeakMap.
export function matchAgainst(
  ruleSet: RuleSet<WildfireDefaults>,
  engine: Engine<WildfireReading, WildfireDefaults>,
  readings: WildfireReading[],
): number | null {
  const defaults = ruleSet.defaults as WildfireDefaults;
  return computeMatchedCategoryFloor(
    ruleSet, engine.parsedExpressions,
    (slice) => makeRenderCtx(
      slice, defaults, engine.factorVariables, engine.simProps, engine.implsWithIncompleteDefaults,
    ),
    readings,
  );
}

export function mkReading(triggeredBy: string, at: number, opts: Partial<WildfireReading> = {}): WildfireReading {
  return { triggeredBy, sessionId: "test", at, updates: [], temporalHistory: [], ...opts };
}
