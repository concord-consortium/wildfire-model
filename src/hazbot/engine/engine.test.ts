import { Engine } from "./engine";
import {
  BaseReading, EngineConstructionError, FactorVariableImpl, RuleSet, SimPropImpl, TemporalVariableImpl,
} from "./types";

interface TestReading extends BaseReading {
  payload?: Record<string, unknown>;
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
          return { kind: "trigger", reading: { triggeredBy: event.name, at: event.at, sessionId, temporalHistory: [] } };
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

describe("Engine — temporal variables (R18 construction + dispatch)", () => {
  const boolReducer = (prev: boolean, event: { name: string }): boolean => event.name === "ChartTabShown";
  function makeBoolVar(name = "chartTabOpen"): TemporalVariableImpl<boolean> {
    return { name, initialValue: false, acceptedEvents: ["ChartTabShown", "ChartTabHidden"], reduce: boolReducer };
  }

  it("initializes temporalValues from initialValue and observed=false for every declared variable", () => {
    const e = new Engine<TestReading, TestDefaults>({
      ruleSet: makeRuleSet(),
      factorVariables: { ranSimulation: makeImpl() },
      simProps: {},
      translate: noopTranslate,
      temporalVariables: { chartTabOpen: makeBoolVar() as TemporalVariableImpl<unknown> },
    });
    expect(e.temporalValues.chartTabOpen).toBe(false);
    expect(e.observed.chartTabOpen).toBe(false);
    expect(e.temporalVariableNames).toEqual(["chartTabOpen"]);
  });

  it("accepts initialTemporalValues override; observed still false everywhere", () => {
    const e = new Engine<TestReading, TestDefaults>({
      ruleSet: makeRuleSet(),
      factorVariables: { ranSimulation: makeImpl() },
      simProps: {},
      translate: noopTranslate,
      temporalVariables: { chartTabOpen: makeBoolVar() as TemporalVariableImpl<unknown> },
      initialTemporalValues: { chartTabOpen: true },
    });
    expect(e.temporalValues.chartTabOpen).toBe(true);
    expect(e.observed.chartTabOpen).toBe(false);
  });

  it("consume invokes matching reducer; non-matching events leave temporalValues unchanged", () => {
    const e = new Engine<TestReading, TestDefaults>({
      ruleSet: makeRuleSet(),
      factorVariables: { ranSimulation: makeImpl() },
      simProps: {},
      translate: noopTranslate,
      temporalVariables: { chartTabOpen: makeBoolVar() as TemporalVariableImpl<unknown> },
    });
    e.consume({ name: "ChartTabShown", at: 10 });
    expect(e.temporalValues.chartTabOpen).toBe(true);
    expect(e.observed.chartTabOpen).toBe(true);
    e.consume({ name: "UnrelatedEvent", at: 20 });
    expect(e.temporalValues.chartTabOpen).toBe(true);  // unchanged
  });

  it("single event matching multiple variables invokes reducers in declaration order", () => {
    const calls: string[] = [];
    const varA: TemporalVariableImpl<number> = {
      name: "a", initialValue: 0, acceptedEvents: ["X"],
      reduce: (prev) => { calls.push("a"); return prev + 1; },
    };
    const varB: TemporalVariableImpl<number> = {
      name: "b", initialValue: 0, acceptedEvents: ["X"],
      reduce: (prev) => { calls.push("b"); return prev + 1; },
    };
    const e = new Engine<TestReading, TestDefaults>({
      ruleSet: makeRuleSet(),
      factorVariables: { ranSimulation: makeImpl() },
      simProps: {},
      translate: noopTranslate,
      temporalVariables: {
        a: varA as TemporalVariableImpl<unknown>,
        b: varB as TemporalVariableImpl<unknown>,
      },
    });
    e.consume({ name: "X", at: 1 });
    expect(calls).toEqual(["a", "b"]);
    expect(e.temporalValues.a).toBe(1);
    expect(e.temporalValues.b).toBe(1);
  });
});

function captureConstructionError(build: () => unknown): EngineConstructionError {
  try { build(); }
  catch (e) {
    if (e instanceof EngineConstructionError) return e;
    throw e;
  }
  throw new Error("expected EngineConstructionError throw");
}

describe("Engine — R18e trigger/state-change overlap guard", () => {
  it("throws EngineConstructionError when a temporal variable's acceptedEvents overlaps a factor variable's logEvents", () => {
    const overlappingVar: TemporalVariableImpl<boolean> = {
      name: "v", initialValue: false, acceptedEvents: ["SimulationStarted"],
      reduce: () => true,
    };
    const ruleSet = makeRuleSet({
      factorVariables: [{ name: "ranSimulation", definition: "", logEvents: ["SimulationStarted"], details: "" }],
    });
    const caught = captureConstructionError(() => new Engine<TestReading, TestDefaults>({
      ruleSet,
      factorVariables: { ranSimulation: makeImpl() },
      simProps: {},
      translate: noopTranslate,
      temporalVariables: { v: overlappingVar as TemporalVariableImpl<unknown> },
    }));
    const overlap = caught.errors.find((er) => er.kind === "trigger-state-change-overlap");
    if (overlap?.kind !== "trigger-state-change-overlap") {
      throw new Error("expected trigger-state-change-overlap error");
    }
    expect(overlap.variableName).toBe("v");
    expect(overlap.eventName).toBe("SimulationStarted");
    expect(overlap.factorVariableName).toBe("ranSimulation");
    expect(caught.ruleSetId).toBe("test");
  });
});

describe("Engine — R18f initialTemporalValues exhaustiveness + type-shape", () => {
  const boolVar: TemporalVariableImpl<boolean> = {
    name: "foo", initialValue: false, acceptedEvents: ["X"],
    reduce: () => true,
  };

  function buildOpts(initialTemporalValues: Record<string, unknown>) {
    return {
      ruleSet: makeRuleSet(),
      factorVariables: { ranSimulation: makeImpl() },
      simProps: {},
      translate: noopTranslate,
      temporalVariables: { foo: boolVar as TemporalVariableImpl<unknown> },
      initialTemporalValues,
    };
  }

  function getMismatch(caught: EngineConstructionError): {
    missing: string[]; unknown: string[];
    typeMismatches: Array<{ name: string; expectedType: string; actualType: string }>;
  } {
    const m = caught.errors.find((er) => er.kind === "temporal-initial-values-mismatch");
    if (m?.kind !== "temporal-initial-values-mismatch") throw new Error("expected mismatch error");
    return { missing: m.missing, unknown: m.unknown, typeMismatches: m.typeMismatches };
  }

  it("missing key produces temporal-initial-values-mismatch with missing populated", () => {
    const caught = captureConstructionError(() => new Engine<TestReading, TestDefaults>(buildOpts({})));
    const m = getMismatch(caught);
    expect(m.missing).toEqual(["foo"]);
    expect(m.unknown).toEqual([]);
    expect(m.typeMismatches).toEqual([]);
  });

  it("unknown key produces temporal-initial-values-mismatch with unknown populated", () => {
    const caught = captureConstructionError(() => new Engine<TestReading, TestDefaults>(buildOpts({ foo: true, typo: true })));
    const m = getMismatch(caught);
    expect(m.missing).toEqual([]);
    expect(m.unknown).toEqual(["typo"]);
    expect(m.typeMismatches).toEqual([]);
  });

  it("string override for boolean variable produces type-mismatch", () => {
    const caught = captureConstructionError(() => new Engine<TestReading, TestDefaults>(buildOpts({ foo: "yes" })));
    const m = getMismatch(caught);
    expect(m.typeMismatches).toEqual([{ name: "foo", expectedType: "boolean", actualType: "string" }]);
  });

  it("object override for null initialValue produces type-mismatch", () => {
    const nullVar: TemporalVariableImpl<unknown> = {
      name: "n", initialValue: null, acceptedEvents: ["X"], reduce: () => null,
    };
    const caught = captureConstructionError(() => new Engine<TestReading, TestDefaults>({
      ruleSet: makeRuleSet(),
      factorVariables: { ranSimulation: makeImpl() },
      simProps: {},
      translate: noopTranslate,
      temporalVariables: { n: nullVar },
      initialTemporalValues: { n: {} },
    }));
    const m = getMismatch(caught);
    expect(m.typeMismatches).toEqual([{ name: "n", expectedType: "null", actualType: "object" }]);
  });

  it("happy path: exhaustive correctly-typed override constructs cleanly", () => {
    const e = new Engine<TestReading, TestDefaults>(buildOpts({ foo: true }));
    expect(e.temporalValues.foo).toBe(true);
    expect(e.observed.foo).toBe(false);
  });
});

describe("Engine — initialErrors suppression contract", () => {
  it("ruleSet undefined + non-empty initialErrors → errors equals supplied entries; isActive false", () => {
    const supplied: import("./types").EngineError[] = [{
      kind: "temporal-validation",
      ruleSetId: "23",
      implName: "GraphOpen",
      implType: "simProp",
      missingVariableName: "missingVar",
      at: 1234,
    }];
    const e = new Engine<TestReading, TestDefaults>({
      requestedRuleSetId: "23",
      factorVariables: {},
      simProps: {},
      translate: noopTranslate,
      initialErrors: supplied,
    });
    expect(e.errors).toEqual(supplied);
    expect(e.isActive).toBe(false);
  });

  it("ruleSet undefined + empty initialErrors → synthetic missing-rule-set entry; isActive false", () => {
    const e = new Engine<TestReading, TestDefaults>({
      requestedRuleSetId: "23",
      factorVariables: {},
      simProps: {},
      translate: noopTranslate,
      initialErrors: [],
    });
    expect(e.errors).toHaveLength(1);
    expect(e.errors[0]).toEqual(expect.objectContaining({ kind: "load-failure", reason: "missing-rule-set", ruleSetId: "23" }));
    expect(e.isActive).toBe(false);
  });

  it("ruleSet undefined + initialErrors absent → synthetic missing-rule-set entry (existing behavior pinned)", () => {
    const e = new Engine<TestReading, TestDefaults>({
      requestedRuleSetId: "23",
      factorVariables: {},
      simProps: {},
      translate: noopTranslate,
    });
    expect(e.errors).toHaveLength(1);
    expect(e.errors[0]).toEqual(expect.objectContaining({ kind: "load-failure", reason: "missing-rule-set" }));
    expect(e.isActive).toBe(false);
  });

  it("ruleSet undefined + multiple R7 initialErrors → all surfaced; isActive false via extended hasLoadBlockingError", () => {
    const supplied: import("./types").EngineError[] = [
      {
        kind: "temporal-validation", ruleSetId: "23", implName: "X",
        implType: "factorVariable", missingVariableName: "v", at: 1,
      },
      {
        kind: "trigger-state-change-overlap", ruleSetId: "23",
        variableName: "v", eventName: "E", factorVariableName: "f", at: 2,
      },
    ];
    const e = new Engine<TestReading, TestDefaults>({
      requestedRuleSetId: "23",
      factorVariables: {},
      simProps: {},
      translate: noopTranslate,
      initialErrors: supplied,
    });
    expect(e.errors).toEqual(supplied);
    expect(e.isActive).toBe(false);
  });
});
