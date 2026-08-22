// Parameterized helper for the per-rule-set five-shape sweep
// (per AC: per-rule-set five-shape sweep (a–e)).
//
// Each rule-set test file (23.test.ts, 24.test.ts, …) imports this helper
// and supplies a small fixture-builder that constructs the readings/state
// shapes for the (a)–(e) sweep cases against that specific rule set.

import { categoryExpressions, Engine, EngineOpts, RuleSet } from "../engine";
import {
  computeCurrentCategoryForEngine, computeMatchedCategoryFloor, makeRenderCtx,
} from "../engine/evaluator";
import { deriveRangeCc } from "../wildfire/range-cc";
import { makeReadingsWindow } from "../wildfire/run-window";
import { factorVariables } from "../wildfire/factor-variables";
import { simProps } from "../wildfire/sim-props";
import { temporalVariables } from "../wildfire/temporal-variables";
import { translate } from "../wildfire/translate";
import { WildfireDefaults, WildfireReading } from "../wildfire/types";

// `defaults` is intentionally optional: it mirrors the optional
// EngineOpts.defaults, and rule-set 25 references no `set*` factor variable and
// no defaults-consuming sim-prop, so a required parameter would force a
// meaningless argument in 25.test.ts. Caution: a rule-set that references a
// `set*` factor variable OR a `defaults`-consuming sim-prop (`DefaultVars`,
// `DefaultVegetations`, `WindSet`, `VegetationSet`, `DroughtLevelSet`) and is
// built without `defaults` silently misclassifies
// — a `set*` factor variable evaluates against `undefined`, throws, and is
// caught to its `false` fallback; a `defaults`-consuming sim-prop hits its
// `if (!defaults…) return false` guard. Either way the gated category is wrong.
// So a caller testing rule-set 23, 24, 32, 33, 34, 35, 42, 45, 47, or 54 must
// pass `defaults`.
//
// `windowed` builds the engine with the production readings-window selector, so a test
// driving `category.current` exercises the shipped trim rather than a copy of it.
export function makeWildfireEngine(
  ruleSet: RuleSet<WildfireDefaults>,
  defaults?: WildfireDefaults,
  windowed = false,
): Engine<WildfireReading, WildfireDefaults> {
  // `engine` is closed over before it exists and read only after the constructor
  // returns, the same deferred-reference shape engine-singleton.ts uses. Forced by the
  // derivation reading parsedExpressions, which does not exist while opts is assembled.
  // Keeping the selector on EngineOpts, rather than assigning the field afterwards, is
  // what makes it fixed for the engine's lifetime, an invariant the sidebar's
  // snapshot-keyed cache relies on.
  const opts: EngineOpts<WildfireReading, WildfireDefaults> = {
    ruleSet,
    requestedRuleSetId: ruleSet.id,
    factorVariables,
    simProps,
    temporalVariables,
    translate,
    runStartTriggers: ["SimulationStarted"],
    defaults,
    ...(windowed
      ? { readingsWindow: makeReadingsWindow(() => deriveRangeCc(categoryExpressions(engine))) }
      : {}),
  };
  const engine = new Engine<WildfireReading, WildfireDefaults>(opts);
  return engine;
}

// `category.current` for a pre-translated readings array, through the SAME code the app
// runs: the engine's own readingsWindow selector, then computeCurrentCategoryForEngine.
// Nothing about the window is restated here, because a restatement is a second
// implementation that callers would then be gating instead of the first one.
//
// The engine must be built with `windowed`; without a selector this returns null, which
// is also production's answer for a host that supplies no window.
export function matchCurrentAgainst(
  engine: Engine<WildfireReading, WildfireDefaults>,
  readings: WildfireReading[],
): number | null {
  const saved = engine.readings;
  engine.readings = readings;
  try {
    const result = computeCurrentCategoryForEngine(engine);
    return result ? result.category : null;
  } finally {
    engine.readings = saved;
  }
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
  return computeMatchedCategoryFloor(
    ruleSet, engine.parsedExpressions,
    (slice) => makeRenderCtx(slice, engine.defaults, engine.factorVariables, engine.simProps),
    readings,
  );
}

export function mkReading(triggeredBy: string, at: number, opts: Partial<WildfireReading> = {}): WildfireReading {
  return { triggeredBy, sessionId: "test", at, temporalHistory: [], ...opts };
}
