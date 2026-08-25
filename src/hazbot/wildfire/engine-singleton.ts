import { categoryExpressions, Engine, EngineConstructionError, ENGINE_VERSION } from "../engine";
import type { SidebarDiagnostic } from "../engine/sidebar";
import { getResolvedConfig, getUrlConfig } from "../../config";
import presets from "../../presets";
import { ruleSets } from "../rule-sets";
import { deriveWildfireDefaults } from "./derive-defaults";
import { deriveRangeCc } from "./range-cc";
import { makeReadingsWindow } from "./run-window";
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
// Per-activity constant derived from the engine's parsed expressions, so it memoizes
// beside the engine and is cleared with it below.
let rangeCcMemo: number | undefined;

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
  // Derive the engine's change-detection defaults from the resolved simulation
  // config (preset + URL params) — the same initial state the running
  // SimulationModel loads (per WM-27 Requirements 2–5).
  const defaults = deriveWildfireDefaults(getResolvedConfig());
  // The selector must be lazy: deriveRangeCc reads engine.parsedExpressions, and the
  // Engine parses inside its constructor, so the value does not exist at the moment
  // EngineOpts is assembled. That laziness is also why it is installed unconditionally,
  // including on a range_cc 0 activity: the value is unknown on this line, so the
  // "no window" answer is the selector's null return rather than the absence of a
  // selector. getDerivedRangeCc memoizes, so the selector and log.ts share one
  // derivation.
  const readingsWindow = makeReadingsWindow(getDerivedRangeCc);
  // ChartTab events are now state changes processed by the chartTabOpen
  // temporal variable; translate no longer needs the latest reading.
  try {
    const engine: Engine<WildfireReading, WildfireDefaults> = new Engine<WildfireReading, WildfireDefaults>({
      ruleSet,
      requestedRuleSetId,
      factorVariables,
      simProps,
      temporalVariables,
      translate,
      runStartTriggers: ["SimulationStarted"],
      defaults,
      readingsWindow,
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
        defaults,
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
  // Without this a test that builds a tab-24 engine, resets, then builds a tab-44 one
  // keeps range_cc 0, so tab 44's selector returns null and every windowed assertion
  // in the file passes vacuously against `best`.
  rangeCcMemo = undefined;
}

// Derived range_cc for the active engine, or 0 when there is no engine or no rule set.
// Both the window selector and log.ts read this one value, so they cannot disagree.
//
// Exported because AnalysisEngineActivated carries it: without it a logged
// `categoryCurrent: null` is uninterpretable, since it has two causes (the activity's
// range_cc is 0, and no category matched at the end of the window) that log identically.
export function getDerivedRangeCc(): number {
  if (rangeCcMemo !== undefined) return rangeCcMemo;
  const engine = getAnalysisEngine();
  // Not memoized when there is no engine yet: getAnalysisEngine is itself lazy, and
  // caching a 0 from a pre-initialization call would stick for the page's lifetime.
  if (!engine?.ruleSet) return 0;
  rangeCcMemo = deriveRangeCc(categoryExpressions(engine));
  return rangeCcMemo;
}

export interface RequestedPresetInfo {
  preset: string;       // the verbatim URL `preset` value
  recognized: boolean;  // matched a key in src/presets.ts (false → silent base-config fallback)
}

// Returns the requested-preset diagnostic when the activity URL provides a
// `preset` value; undefined when it does not (nothing to validate). Per WM-27
// Requirement 13. `recognized: false` means the name fell back to the base config.
export function getRequestedPresetInfo(): RequestedPresetInfo | undefined {
  // `IUrlConfig.preset` is declared `string`, but getUrlConfig() departs from
  // that in two ways: (a) it only assigns the key when the URL actually carries
  // it — so `preset` is runtime-optional — and (b) it parseFloat-coerces any
  // all-digit value, so `?preset=23` arrives as a *number* (the same coercion
  // that makes ISimulationConfig type `hazbotRules` as `string | number`). Read
  // it wide as `string | number | undefined` so the absent-param `=== undefined`
  // check type-checks AND a numeric value is not mis-typed as a string; then
  // String()-normalize so an all-digit preset name still records/compares as a
  // string. The String() call is load-bearing — do not drop it as redundant.
  const urlPreset = getUrlConfig().preset as string | number | undefined;
  if (urlPreset === undefined) return undefined;
  const name = String(urlPreset);
  // Own-property check, NOT `presets[name] !== undefined`: `presets` is a plain
  // object, so a bare bracket lookup also resolves inherited Object.prototype
  // members — `?preset=constructor` / `toString` / `hasOwnProperty` would each
  // be wrongly reported as a recognized preset.
  const recognized = Object.prototype.hasOwnProperty.call(presets, name);
  return { preset: name, recognized };
}

// Public helper called by log.ts to construct the AnalysisEngineActivated payload
// (extracted so call sites have a single shape source-of-truth per Req 20). The
// preset fields appear only when a URL preset is present (per WM-27 Requirement 13).
export function buildAnalysisEngineActivatedPayload(
  ruleSetId: string,
  presetInfo?: RequestedPresetInfo,
  rangeCc?: number,
): {
  engineVersion: string; appRulesVersion: string | number; ruleSetId: string;
  rangeCc?: number; preset?: string; presetRecognized?: boolean;
} {
  return {
    engineVersion: ENGINE_VERSION,
    appRulesVersion: APP_RULES_VERSION,
    ruleSetId,
    ...(rangeCc !== undefined ? { rangeCc } : {}),
    ...(presetInfo ? { preset: presetInfo.preset, presetRecognized: presetInfo.recognized } : {}),
  };
}

// Maps the requested-preset diagnostic onto the sidebar's generic `diagnostics`
// slot. Pure (takes the RequestedPresetInfo, reads no globals) so the
// match/no-match mapping and the screen-reader `(unrecognized preset)` text cue
// are unit-testable without rendering app.tsx. Returns undefined when there is
// no requested preset, so the sidebar's `diagnostics` slot stays empty and the
// section renders nothing.
export function buildPresetDiagnostics(
  presetInfo: RequestedPresetInfo | undefined,
): SidebarDiagnostic[] | undefined {
  if (!presetInfo) return undefined;
  return [{
    label: "Requested preset",
    value: presetInfo.recognized
      ? presetInfo.preset
      : `${presetInfo.preset} (unrecognized preset)`,
    status: presetInfo.recognized ? "match" : "no-match",
  }];
}

// The feedback-level readout for the dev sidebar's Diagnostics section. UI-store state
// only (the level map, plus the last level/source displayed), so it stays readable from
// AppComponent, which observes the stores and not the engine.
export function buildFeedbackLevelDiagnostics(
  levels: Map<number, number> | undefined,
  lastShown?: { level: number; source: string } | undefined,
): SidebarDiagnostic[] {
  // Always at least one row, including the empty case: on a Hazbot page the level map
  // always has a meaningful value, and "nothing shown yet, the next click is level 1
  // everywhere" is a state a walker needs to read, most sharply right after
  // window.test.resetHazbotFeedbackLevels().
  const entries = !levels || levels.size === 0 ? "(none)" : Array.from(levels.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([id, level]) => `${id}→${level}`)
    .join(", ");
  const rows: SidebarDiagnostic[] = [{ label: "Feedback levels", value: entries }];
  if (lastShown) {
    rows.push({ label: "Last shown", value: `level ${lastShown.level} (${lastShown.source})` });
  }
  return rows;
}
