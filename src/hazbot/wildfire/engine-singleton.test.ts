import { getAnalysisEngine, buildAnalysisEngineActivatedPayload, APP_RULES_VERSION } from "./index";
import { _resetAnalysisEngineForTests } from "./engine-singleton";
import { ENGINE_VERSION } from "../engine";

// Capture / restore window.location around tests so the URL mock doesn't leak.
const originalLocation = window.location;
afterAll(() => {
  Object.defineProperty(window, "location", { value: originalLocation, writable: true });
});

beforeEach(() => {
  _resetAnalysisEngineForTests();
});

function setUrl(search: string) {
  // jsdom-friendly URL update; the existing getURLParam reads from window.location.href.
  Object.defineProperty(window, "location", {
    value: new URL(`https://wildfire-model.unexisting.url.com/${search}`),
    writable: true,
  });
}

describe("getAnalysisEngine", () => {
  it("returns undefined when neither URL flag is set", () => {
    setUrl("");
    expect(getAnalysisEngine()).toBeUndefined();
  });

  it("memoizes the engine across calls", () => {
    setUrl("?hazbotSidebar=true");
    const a = getAnalysisEngine();
    const b = getAnalysisEngine();
    expect(a).toBe(b);
  });

  it("constructs an engine when ?hazbotSidebar=true is set", () => {
    setUrl("?hazbotSidebar=true");
    const e = getAnalysisEngine();
    expect(e).toBeDefined();
    // Engine is inactive in this test because the rule-sets stub is empty (step 10
    // lands the real registry). Behavior verification of runStartTriggers happens
    // in step 10's bridge-side sidebar test against ruleSets["23"].
  });

  it("returns an inactive engine when ?hazbotRules references a missing rule set", () => {
    setUrl("?hazbotRules=missing-id");
    const e = getAnalysisEngine();
    if (!e) throw new Error("expected engine");
    expect(e.isActive).toBe(false);
    expect(e.requestedRuleSetId).toBe("missing-id");
  });

  it("returns an active engine when ?hazbotRules resolves to a known rule set (tab 23)", () => {
    setUrl("?hazbotRules=23");
    const e = getAnalysisEngine();
    if (!e) throw new Error("expected engine");
    expect(e.isActive).toBe(true);
    expect(e.requestedRuleSetId).toBe("23");
  });
});

describe("buildAnalysisEngineActivatedPayload (per Req 20)", () => {
  it("includes engineVersion + appRulesVersion + ruleSetId; no sessionId", () => {
    const payload = buildAnalysisEngineActivatedPayload("23");
    expect(payload).toEqual({
      engineVersion: ENGINE_VERSION,
      appRulesVersion: APP_RULES_VERSION,
      ruleSetId: "23",
    });
    expect(payload).not.toHaveProperty("sessionId");
  });

  it("APP_RULES_VERSION is a positive integer", () => {
    expect(typeof APP_RULES_VERSION).toBe("number");
    expect(APP_RULES_VERSION).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(APP_RULES_VERSION)).toBe(true);
  });
});
