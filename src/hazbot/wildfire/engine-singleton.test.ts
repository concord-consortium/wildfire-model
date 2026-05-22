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
    // Engine is inactive here because no `?hazbotRules` was passed — no rule set is
    // selected. runStartTriggers / active-engine behavior is verified in the
    // bridge-side sidebar test against ruleSets["23"].
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

describe("getAnalysisEngine — config-derived defaults wiring (per WM-27)", () => {
  it("threads deriveWildfireDefaults(getResolvedConfig()) onto engine.defaults for a known preset", () => {
    setUrl("?hazbotRules=23&preset=plainsTwoZone");
    const e = getAnalysisEngine();
    if (!e) throw new Error("expected engine");
    // Explicit WildfireDefaults literal (not re-derived) so the test catches a
    // wrong derivation as well as broken wiring. plainsTwoZone is Plains/Shrub/1
    // ×2; the base config carries wind 0/0.
    expect(e.defaults).toEqual({
      zones: [
        { terrainType: "Plains", vegetation: "Shrub", droughtLevel: "Mild Drought" },
        { terrainType: "Plains", vegetation: "Shrub", droughtLevel: "Mild Drought" },
      ],
      wind: { speed: 0, direction: 0 },
    });
  });
});

describe("getAnalysisEngine — rule-sets 32–35 load with no defaults-attributable error (Req 8)", () => {
  // Replaces the removed negative `missing-defaults` assertions: with the
  // failure mode gone, 32–35 must now load cleanly. Also guards against any
  // other load-failure path silently re-blocking them.
  for (const id of ["32", "33", "34", "35"]) {
    it(`rule-set ${id} loads: isActive with no load-failure error`, () => {
      setUrl(`?hazbotRules=${id}`);
      const e = getAnalysisEngine();
      if (!e) throw new Error("expected engine");
      expect(e.isActive).toBe(true);
      expect(e.errors.filter((err) => err.kind === "load-failure")).toEqual([]);
    });
  }
});

describe("getAnalysisEngine — EngineConstructionError catch path", () => {
  // The wildfire rulesets don't currently trigger R7 construction errors; we
  // inject a malformed `temporalVariables` via jest.isolateModules so the
  // bridge's catch branch runs against a real wildfire ruleset.
  function loadSingletonWithBadTemporal(): { getAnalysisEngine: typeof import("./engine-singleton").getAnalysisEngine } {
    let captured: { getAnalysisEngine: typeof import("./engine-singleton").getAnalysisEngine } | null = null;
    jest.isolateModules(() => {
      // Inject a temporal variable whose acceptedEvents overlaps ruleset 25's
      // factor variable `ranSimulation` (logEvents: ["SimulationStarted"]),
      // which triggers `trigger-state-change-overlap` at engine construction.
      jest.doMock("./temporal-variables", () => ({
        temporalVariables: {
          overlapping: {
            name: "overlapping",
            initialValue: false,
            acceptedEvents: ["SimulationStarted"],
            reduce: () => true,
          },
        },
      }));
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const singleton = jest.requireActual<typeof import("./engine-singleton")>("./engine-singleton");
      singleton._resetAnalysisEngineForTests();
      captured = { getAnalysisEngine: singleton.getAnalysisEngine };
    });
    if (!captured) throw new Error("isolateModules did not run");
    return captured;
  }

  it("returns an inactive placeholder Engine when temporal-variable misconfiguration triggers EngineConstructionError", () => {
    setUrl("?hazbotRules=25");
    const { getAnalysisEngine: getEngine } = loadSingletonWithBadTemporal();
    const e = getEngine();
    if (!e) throw new Error("expected placeholder engine, got undefined");
    expect(e.isActive).toBe(false);
    // Caught construction error is surfaced on the placeholder.
    const overlap = e.errors.find((err) => err.kind === "trigger-state-change-overlap");
    expect(overlap).toBeDefined();
    // Synthetic `load-failure: missing-rule-set` is suppressed when initialErrors is non-empty.
    expect(e.errors.find((err) => err.kind === "load-failure" && err.reason === "missing-rule-set")).toBeUndefined();
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
