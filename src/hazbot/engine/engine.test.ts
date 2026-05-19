import { Engine } from "./engine";
import {
  BaseReading, FactorVariableImpl, RuleSet, SimPropImpl,
} from "./types";

interface TestReading extends BaseReading {
  payload?: Record<string, unknown>;
  ambientState?: { chartTabOpenAtStart?: boolean };
}

type TestDefaults = { wind?: { speed: number; direction: number }; zones?: Array<{ terrainType?: string }> };

const noopTranslate: NonNullable<ConstructorParameters<typeof Engine<TestReading, TestDefaults>>[0]["translate"]> =
  () => ({ kind: "no-op" });

function makeImpl(overrides: Partial<FactorVariableImpl<unknown, TestReading, TestDefaults>> = {}): FactorVariableImpl<unknown, TestReading, TestDefaults> {
  return {
    defaultValue: false,
    compute: (readings) => ({ value: readings.length > 0, witnesses: readings }),
    ...overrides,
  };
}

function makeSimImpl(overrides: Partial<SimPropImpl<TestReading, TestDefaults>> = {}): SimPropImpl<TestReading, TestDefaults> {
  return {
    defaultValue: false,
    evaluate: () => true,
    ...overrides,
  };
}

function makeRuleSet(overrides: Partial<RuleSet<TestDefaults>> = {}): RuleSet<TestDefaults> {
  return {
    id: "test",
    categories: [{ id: 1, studentAction: "", feedback: "", visualFeedback: "", expression: "ranSimulation" }],
    factorVariables: [{ name: "ranSimulation", definition: "", logEvents: [], details: "" }],
    defaults: {},
    ...overrides,
  };
}

describe("Engine — construction", () => {
  it("emits missing-rule-set load-failure when ruleSet is undefined", () => {
    const e = new Engine<TestReading, TestDefaults>({
      requestedRuleSetId: "23",
      factorVariables: {},
      simProps: {},
      translate: noopTranslate,
    });
    expect(e.isActive).toBe(false);
    expect(e.errors).toHaveLength(1);
    expect(e.errors[0]).toMatchObject({ kind: "load-failure", reason: "missing-rule-set", ruleSetId: "23" });
    expect(e.ruleSet).toBeUndefined();
    expect(e.requestedRuleSetId).toBe("23");
  });

  it("populates sessionId via the substrate helper", () => {
    const e = new Engine<TestReading, TestDefaults>({
      factorVariables: {},
      simProps: {},
      translate: noopTranslate,
    });
    expect(e.sessionId).toMatch(/^[A-Za-z0-9_-]{12}$/);
  });

  it("retains ruleSet on parse-error and surfaces a parse-error EngineError", () => {
    const ruleSet = makeRuleSet({
      categories: [{ id: 1, studentAction: "", feedback: "", visualFeedback: "", expression: "ranSimulation @@@" }],
    });
    const e = new Engine<TestReading, TestDefaults>({
      ruleSet,
      factorVariables: { ranSimulation: makeImpl() },
      simProps: {},
      translate: noopTranslate,
    });
    expect(e.isActive).toBe(false);
    expect(e.ruleSet).toBe(ruleSet);
    const parseErr = e.errors.find((x) => x.kind === "parse-error");
    expect(parseErr).toBeDefined();
  });

  it("retains ruleSet on missing-impl + appends missing-impl error", () => {
    const ruleSet = makeRuleSet();
    const e = new Engine<TestReading, TestDefaults>({
      ruleSet,
      factorVariables: {}, // no impl for "ranSimulation"
      simProps: {},
      translate: noopTranslate,
    });
    expect(e.isActive).toBe(false);
    expect(e.ruleSet).toBe(ruleSet);
    const missing = e.errors.find((x) => x.kind === "load-failure" && x.reason === "missing-impl");
    expect(missing).toBeDefined();
  });

  it("emits missing-defaults when impl declares a path that doesn't resolve", () => {
    const ruleSet = makeRuleSet({ defaults: { wind: { speed: 5, direction: 0 } } });
    const impl = makeImpl({ requiredDefaults: ["zones[*].terrainType"] });
    const e = new Engine<TestReading, TestDefaults>({
      ruleSet,
      factorVariables: { ranSimulation: impl },
      simProps: {},
      translate: noopTranslate,
    });
    const missing = e.errors.find((x) => x.kind === "load-failure" && x.reason === "missing-defaults");
    if (!missing || missing.kind !== "load-failure") throw new Error("expected missing-defaults load-failure");
    expect(missing.detail).toMatch(/ranSimulation.*zones\[\*\]\.terrainType/);
    expect(e.implsWithIncompleteDefaults.has("ranSimulation")).toBe(true);
  });

  it("succeeds when all defaults resolve, no missing impl, no parse error", () => {
    const ruleSet = makeRuleSet({
      defaults: { wind: { speed: 5, direction: 0 }, zones: [{ terrainType: "Plains" }] },
    });
    const impl = makeImpl({ requiredDefaults: ["zones[*].terrainType", "wind.speed"] });
    const e = new Engine<TestReading, TestDefaults>({
      ruleSet,
      factorVariables: { ranSimulation: impl },
      simProps: {},
      translate: noopTranslate,
    });
    expect(e.isActive).toBe(true);
    expect(e.errors).toHaveLength(0);
  });

  it("collects ambient-state keys per trigger across factor-vars and sim-props", () => {
    const ruleSet = makeRuleSet({
      categories: [{
        id: 1, studentAction: "", feedback: "", visualFeedback: "",
        expression: "ranSimulation WITH GraphOpen",
      }],
      factorVariables: [{ name: "ranSimulation", definition: "", logEvents: [], details: "" }],
    });
    const e = new Engine<TestReading, TestDefaults>({
      ruleSet,
      factorVariables: { ranSimulation: makeImpl() },
      simProps: { GraphOpen: makeSimImpl({ ambientStateKeys: { SimulationStarted: ["chartTabOpenAtStart"] } }) },
      translate: noopTranslate,
    });
    expect(e.isActive).toBe(true);
    expect(e.ambientKeysByTrigger.get("SimulationStarted")?.has("chartTabOpenAtStart")).toBe(true);
  });

  it("emits one stub-warning per stubbed referenced impl when load is otherwise clean", () => {
    const ruleSet = makeRuleSet({
      categories: [{
        id: 1, studentAction: "", feedback: "", visualFeedback: "",
        expression: "ranSimulation WITH SparksAtTopAndBottom",
      }],
    });
    const e = new Engine<TestReading, TestDefaults>({
      ruleSet,
      factorVariables: { ranSimulation: makeImpl() },
      simProps: { SparksAtTopAndBottom: makeSimImpl({ isStub: true, evaluate: () => false }) },
      translate: noopTranslate,
    });
    expect(e.isActive).toBe(true);
    const stubs = e.errors.filter((x) => x.kind === "stub-warning");
    expect(stubs).toHaveLength(1);
    const stub = stubs[0];
    if (stub.kind !== "stub-warning") throw new Error("expected stub-warning");
    expect(stub.stubName).toBe("SparksAtTopAndBottom");
  });

  it("does NOT emit stub-warnings when load failed otherwise", () => {
    const ruleSet = makeRuleSet({
      categories: [{
        id: 1, studentAction: "", feedback: "", visualFeedback: "",
        expression: "ranSimulation WITH SparksAtTopAndBottom",
      }],
    });
    const e = new Engine<TestReading, TestDefaults>({
      ruleSet,
      factorVariables: {}, // missing-impl
      simProps: { SparksAtTopAndBottom: makeSimImpl({ isStub: true }) },
      translate: noopTranslate,
    });
    expect(e.isActive).toBe(false);
    expect(e.errors.filter((x) => x.kind === "stub-warning")).toHaveLength(0);
  });

  it("declared-but-unused factor variable does not block load", () => {
    const ruleSet = makeRuleSet({
      factorVariables: [
        { name: "ranSimulation", definition: "", logEvents: [], details: "" },
        { name: "setWind", definition: "", logEvents: [], details: "" }, // declared but not referenced in the expression
      ],
    });
    const setWindImpl = makeImpl({ requiredDefaults: ["wind.speed", "wind.direction"] });
    const e = new Engine<TestReading, TestDefaults>({
      ruleSet,
      factorVariables: { ranSimulation: makeImpl(), setWind: setWindImpl },
      simProps: {},
      translate: noopTranslate,
    });
    // setWind requires wind defaults but is unreferenced — no missing-defaults should fire.
    expect(e.isActive).toBe(true);
  });
});

describe("Engine — listener / snapshot API", () => {
  function setup() {
    return new Engine<TestReading, TestDefaults>({
      factorVariables: {},
      simProps: {},
      translate: noopTranslate,
    });
  }

  it("getSnapshot returns 1 immediately after construction (initial-snapshot semantics)", () => {
    const e = setup();
    expect(e.getSnapshot()).toBe(1);
  });

  it("subscribe returns an unsubscribe function", () => {
    const e = setup();
    const fn = jest.fn();
    const unsub = e.subscribe(fn);
    expect(typeof unsub).toBe("function");
    unsub();
  });

  it("subscribe / getSnapshot are safe to call as bare references (PASS3-API-2)", () => {
    // Extracting the methods into locals must not lose `this`.
    const e = setup();
    const subscribe = e.subscribe;
    const getSnapshot = e.getSnapshot;
    const fn = jest.fn();
    const unsub = subscribe(fn);
    expect(getSnapshot()).toBe(1);
    unsub();
  });

  it("inactive engine consume() is a no-op (no snapshot tick)", () => {
    const e = new Engine<TestReading, TestDefaults>({
      factorVariables: {}, simProps: {}, translate: noopTranslate, // no ruleSet → inactive
    });
    const before = e.getSnapshot();
    e.consume({ name: "Whatever", at: 1 });
    expect(e.getSnapshot()).toBe(before);
  });

  it("constructor's notify ticks even with zero listeners (initial-snapshot semantics)", () => {
    // The counter going 0 → 1 is the load-bearing effect; checked above. This test
    // additionally asserts that subscribing AFTER construction does not retro-fire.
    const e = setup();
    const fn = jest.fn();
    e.subscribe(fn);
    expect(fn).not.toHaveBeenCalled();
    expect(e.getSnapshot()).toBe(1);
  });

  it("subscribe during a notify does not fire on the in-flight notify (reentrancy)", () => {
    // Exercise the reentrancy path by subscribing a second listener mid-notify;
    // the second listener must NOT fire on the in-flight outer notify.
    class TestEngine extends Engine<TestReading, TestDefaults> {
      forceNotify() { this.tickAndNotify(); }
    }
    const e = new TestEngine({
      factorVariables: {}, simProps: {}, translate: noopTranslate,
    });
    const inner = jest.fn();
    let added = false;
    // One-shot guard: subscribe `inner` only on the first notify so the second
    // notify measures clean reentrancy without re-entering the subscribe loop.
    e.subscribe(() => {
      if (!added) { added = true; e.subscribe(inner); }
    });
    e.forceNotify();
    expect(inner).not.toHaveBeenCalled();
    e.forceNotify();
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it("listener that calls consume() produces exactly one outer + one follow-up notify (no cascade)", () => {
    // Req 19 contract: a listener that triggers a state-changing op (e.g., a debug
    // listener that calls consume()) must NOT cause a recursive notify cascade. The
    // engine buffers the inner mutation's notify until the outer one finishes, then
    // fires exactly one follow-up.
    const ruleSet = makeRuleSet();
    const e = new Engine<TestReading, TestDefaults>({
      ruleSet,
      factorVariables: { ranSimulation: makeImpl() },
      simProps: {},
      translate: (event, sessionId) => {
        if (event.name === "T1" || event.name === "T2") {
          return { kind: "trigger", reading: { triggeredBy: event.name, at: event.at, sessionId, updates: [], temporalHistory: [] } };
        }
        return { kind: "no-op" };
      },
      runStartTriggers: ["T1", "T2"],
    });
    let firstFired = false;
    const fn = jest.fn(() => {
      // On the FIRST notify, re-enter the engine with a state-changing consume.
      // The substrate must buffer the inner notify rather than recurse.
      if (!firstFired) {
        firstFired = true;
        e.consume({ name: "T2", at: 2 });
      }
    });
    e.subscribe(fn);
    e.consume({ name: "T1", at: 1 });
    // Expected: outer notify (1) + buffered follow-up notify (1) = exactly 2 calls.
    expect(fn).toHaveBeenCalledTimes(2);
    // Both readings landed (no buffering of the consume itself — only the notify).
    expect(e.readings).toHaveLength(2);
  });

  it("unsubscribe during a notify prevents not-yet-iterated listeners from firing", () => {
    class TestEngine extends Engine<TestReading, TestDefaults> {
      forceNotify() { this.tickAndNotify(); }
    }
    const e = new TestEngine({
      factorVariables: {}, simProps: {}, translate: noopTranslate,
    });
    const later = jest.fn();
    let unsub: (() => void) | null = null;
    // Earlier listener (subscribed first) unsubs `later` when it fires.
    e.subscribe(() => unsub?.());
    unsub = e.subscribe(later);
    e.forceNotify();
    expect(later).not.toHaveBeenCalled();
  });
});
