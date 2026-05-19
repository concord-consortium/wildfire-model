import { Engine, EngineConstructionError, ENGINE_VERSION } from "../engine";
import { getUrlConfig } from "../../config";
import { ruleSets } from "../rule-sets";
import { factorVariables } from "./factor-variables";
import { simProps } from "./sim-props";
import { temporalVariables } from "./temporal-variables";
import { translate } from "./translate";
import { WildfireDefaults, WildfireReading } from "./types";
import { APP_RULES_VERSION } from "./rules-version";

// Lazy memoized factory. URL flags read on first call; engine constructed once.
// Per Tech Notes "Library scope and the Reading boundary" / spec line ~290.
let cached: Engine<WildfireReading, WildfireDefaults> | undefined;
let init: "uninit" | "initialized" = "uninit";

export function getAnalysisEngine(): Engine<WildfireReading, WildfireDefaults> | undefined {
  if (init === "initialized") return cached;
  init = "initialized";
  const cfg = getUrlConfig();
  // Explicit undefined check (not `!cfg.hazbotRules`): the URL parser converts
  // numeric strings to numbers, and a future ruleset id of 0 would be valid.
  if (cfg.hazbotRules === undefined && !cfg.hazbotSidebar) {
    cached = undefined;
    return undefined;
  }
  // The URL parser converts numeric strings to numbers (e.g., ?hazbotRules=23 → 23).
  // Coerce to string here so downstream uses (rule-set lookup, sidebar display,
  // EngineError.ruleSetId) work uniformly.
  const requestedRuleSetId = cfg.hazbotRules !== undefined ? String(cfg.hazbotRules) : undefined;
  const ruleSet = requestedRuleSetId ? ruleSets[requestedRuleSetId] : undefined;
  // Forward the latest reading to translate so it can downgrade
  // `ChartTabShown`/`ChartTabHidden` to no-ops when no run is in progress.
  // The closure captures `engine` by reference; its body only runs at consume
  // time, after the `new Engine(...)` initializer has assigned to `engine`.
  try {
    const engine: Engine<WildfireReading, WildfireDefaults> = new Engine<WildfireReading, WildfireDefaults>({
      ruleSet,
      requestedRuleSetId,
      factorVariables,
      simProps,
      temporalVariables,
      translate: (event, sessionId) => {
        const readings = engine.readings;
        const last = readings.length > 0 ? readings[readings.length - 1] : undefined;
        return translate(event, sessionId, last);
      },
      runStartTriggers: ["SimulationStarted"],
    });
    // Step 14 wires src/log.ts to detect this just-constructed active engine and
    // emit AnalysisEngineActivated using buildAnalysisEngineActivatedPayload below.
    // The substrate's Engine doesn't emit logs itself.
    cached = engine;
    return engine;
  } catch (e) {
    if (e instanceof EngineConstructionError) {
      // Surface caught construction errors via a placeholder engine so the
      // sidebar's ErrorsPanel renders them. The placeholder construction is
      // provably throw-free — see the matching maintenance-gate comment in
      // engine.ts on the `ruleSet === undefined` branch. `initialErrors`
      // suppresses the engine's synthetic missing-rule-set entry; the
      // caller-supplied errors are the authoritative diagnostic.
      const placeholder = new Engine<WildfireReading, WildfireDefaults>({
        ruleSet: undefined,
        requestedRuleSetId,
        factorVariables,
        simProps,
        temporalVariables: {},
        translate,
        runStartTriggers: ["SimulationStarted"],
        initialErrors: e.errors,
      });
      cached = placeholder;
      return placeholder;
    }
    throw e;
  }
}

// Reset hook for tests so they can construct multiple engines (test-only).
// Not re-exported from index.ts — tests import directly from this module.
export function _resetAnalysisEngineForTests(): void {
  cached = undefined;
  init = "uninit";
}

// Public helper called by step 14's log.ts to construct the AnalysisEngineActivated payload
// (extracted so call sites have a single shape source-of-truth per Req 20).
export function buildAnalysisEngineActivatedPayload(ruleSetId: string): {
  engineVersion: string; appRulesVersion: string | number; ruleSetId: string;
} {
  return {
    engineVersion: ENGINE_VERSION,
    appRulesVersion: APP_RULES_VERSION,
    ruleSetId,
  };
}
