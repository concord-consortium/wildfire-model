import { log as laraLog } from "@concord-consortium/lara-interactive-api";
import { createLogWrapper } from "@concord-consortium/log-monitor";
import { getUrlConfig } from "./config";
import { buildAnalysisEngineActivatedPayload, getAnalysisEngine } from "./hazbot/wildfire";

const { logMonitor } = getUrlConfig();

// External destinations (LARA + log-monitor sidebar) — wrapper constructed once.
const externalLog = logMonitor ? createLogWrapper(laraLog) : laraLog;

// Module-level state — persists for the page-load lifetime. Tests that exercise
// log() directly should mock the entire module rather than relying on per-test
// state isolation.
let analysisEngineActivatedEmitted = false;

export const log = (name: string, data?: object): void => {
  // Cast: lara's log accepts `object`; createLogWrapper narrows to Record<string, unknown>
  // for its log-monitor mirror. Both shapes are satisfied by any plain payload object.
  externalLog(name, data as Record<string, unknown> | undefined);
  // Route the event to the Hazbot analysis engine if it's been constructed.
  // The `?.` covers the no-engine case (URL flags unset); the engine's consume()
  // covers the inactive-engine case via its own !isActive early return.
  const engine = getAnalysisEngine();
  engine?.consume({ name, data, at: Date.now() });
  // Once-per-page-load AnalysisEngineActivated emission (per Req 20). Fires only
  // when the engine constructed cleanly. Sent via the external log path so it
  // lands in LARA + log-monitor like every other event. Not fed back through
  // engine.consume — the engine emits it on behalf of itself; routing it back
  // through translate() (which maps it to a no-op) would be a needless cycle.
  if (engine?.isActive && !analysisEngineActivatedEmitted && engine.ruleSet) {
    analysisEngineActivatedEmitted = true;
    externalLog("AnalysisEngineActivated", buildAnalysisEngineActivatedPayload(engine.ruleSet.id));
  }
};
