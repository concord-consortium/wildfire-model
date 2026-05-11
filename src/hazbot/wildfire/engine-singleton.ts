import { Engine, ENGINE_VERSION } from "../engine";
import { getUrlConfig } from "../../config";
import { ruleSets } from "../rule-sets";
import { factorVariables } from "./factor-variables";
import { simProps } from "./sim-props";
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
  if (!cfg.hazbotRules && !cfg.hazbotSidebar) {
    cached = undefined;
    return undefined;
  }
  // The URL parser converts numeric strings to numbers (e.g., ?hazbotRules=23 → 23).
  // Coerce to string here so downstream uses (rule-set lookup, sidebar display,
  // EngineError.ruleSetId) work uniformly.
  const requestedRuleSetId = cfg.hazbotRules !== undefined ? String(cfg.hazbotRules) : undefined;
  const ruleSet = requestedRuleSetId ? ruleSets[requestedRuleSetId] : undefined;
  const engine = new Engine<WildfireReading, WildfireDefaults>({
    ruleSet,
    requestedRuleSetId,
    factorVariables,
    simProps,
    translate,
    runStartTriggers: ["SimulationStarted"],
  });
  // Step 14 wires src/log.ts to detect this just-constructed active engine and
  // emit AnalysisEngineActivated using buildAnalysisEngineActivatedPayload below.
  // The substrate's Engine doesn't emit logs itself.
  cached = engine;
  return engine;
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
