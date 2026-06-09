import { Engine, EngineOpts } from "./engine";
import { BaseReading, FactorVariableImpl, RuleSet, TemporalVariableImpl } from "./types";

interface TR extends BaseReading {
  payload?: Record<string, unknown>;
}
type TD = { wind?: { speed: number; direction: number } };

function makeTranslate(): EngineOpts<TR, TD>["translate"] {
  return (event, sessionId) => {
    if (event.name === "SimulationStarted") {
      const reading: TR = {
        triggeredBy: "SimulationStarted",
        sessionId,
        at: event.at,
        temporalHistory: [],
      };
      return { kind: "trigger", reading };
    }
    if (event.name === "SimulationEnded") {
      const reading: TR = { triggeredBy: "SimulationEnded", sessionId, at: event.at, temporalHistory: [] };
      return { kind: "trigger", reading };
    }
    return { kind: "no-op" };
  };
}

function makeRuleSet(opts: { categories?: RuleSet<TD>["categories"] } = {}): RuleSet<TD> {
  return {
    id: "test",
    categories: opts.categories ?? [{ id: 1, studentAction: "", feedback: "", visualFeedback: "", expression: "ranSimulation" }],
    factorVariables: [{ name: "ranSimulation", definition: "", logEvents: [], details: "" }],
  };
}

const ranSimulationImpl: FactorVariableImpl<boolean, TR, TD> = {
  defaultValue: false,
  compute: (readings) => {
    const sims = readings.filter((r) => r.triggeredBy === "SimulationStarted");
    return { value: sims.length > 0, witnesses: sims };
  },
};

describe("Engine consume — trigger pipeline", () => {
  it("appends a Reading on a successful trigger and ticks the snapshot exactly once", () => {
    const e = new Engine<TR, TD>({
      ruleSet: makeRuleSet(),
      factorVariables: { ranSimulation: ranSimulationImpl },
      simProps: {},
      translate: makeTranslate(),
      runStartTriggers: ["SimulationStarted"],
    });
    const before = e.getSnapshot();
    e.consume({ name: "SimulationStarted", at: 100 });
    expect(e.readings).toHaveLength(1);
    expect(e.readings[0].triggeredBy).toBe("SimulationStarted");
    expect(e.getSnapshot()).toBe(before + 1);
  });

  it("no-op events do not tick the snapshot", () => {
    const e = new Engine<TR, TD>({
      ruleSet: makeRuleSet(),
      factorVariables: { ranSimulation: ranSimulationImpl },
      simProps: {},
      translate: makeTranslate(),
      runStartTriggers: ["SimulationStarted"],
    });
    const before = e.getSnapshot();
    e.consume({ name: "TopBarReloadButtonClicked", at: 100 });
    expect(e.getSnapshot()).toBe(before);
  });

  it("notifies listeners exactly once per consume that mutates state", () => {
    const e = new Engine<TR, TD>({
      ruleSet: makeRuleSet(),
      factorVariables: { ranSimulation: ranSimulationImpl },
      simProps: {},
      translate: makeTranslate(),
      runStartTriggers: ["SimulationStarted"],
    });
    const fn = jest.fn();
    e.subscribe(fn);
    e.consume({ name: "SimulationStarted", at: 100 });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe("Engine consume — temporal-variable dispatch (R5/R18d)", () => {
  it("seeds reading.temporalHistory at trigger time with current temporal values", () => {
    const chartTabOpen: TemporalVariableImpl<boolean> = {
      name: "chartTabOpen", initialValue: false,
      acceptedEvents: ["ChartTabShown", "ChartTabHidden"],
      reduce: (_p, evt) => evt.name === "ChartTabShown",
    };
    const e = new Engine<TR, TD>({
      ruleSet: makeRuleSet(),
      factorVariables: { ranSimulation: ranSimulationImpl },
      simProps: {},
      translate: makeTranslate(),
      temporalVariables: { chartTabOpen: chartTabOpen as TemporalVariableImpl<unknown> },
      runStartTriggers: ["SimulationStarted"],
    });
    // Pre-trigger state change should mutate live values without seeding a reading.
    e.consume({ name: "ChartTabShown", at: 10 });
    expect(e.temporalValues.chartTabOpen).toBe(true);
    expect(e.observed.chartTabOpen).toBe(true);
    expect(e.readings).toHaveLength(0);
    // Trigger: reading.temporalHistory must include the seed at trigger time.
    e.consume({ name: "SimulationStarted", at: 100 });
    expect(e.readings).toHaveLength(1);
    const seed = e.readings[0].temporalHistory.find((c) => c.eventName === "SimulationStarted" && c.name === "chartTabOpen");
    expect(seed?.value).toBe(true);
  });

  it("within-window state change appends to the latest reading's temporalHistory", () => {
    const chartTabOpen: TemporalVariableImpl<boolean> = {
      name: "chartTabOpen", initialValue: false,
      acceptedEvents: ["ChartTabShown", "ChartTabHidden"],
      reduce: (_p, evt) => evt.name === "ChartTabShown",
    };
    const e = new Engine<TR, TD>({
      ruleSet: makeRuleSet(),
      factorVariables: { ranSimulation: ranSimulationImpl },
      simProps: {},
      translate: makeTranslate(),
      temporalVariables: { chartTabOpen: chartTabOpen as TemporalVariableImpl<unknown> },
      runStartTriggers: ["SimulationStarted"],
    });
    e.consume({ name: "SimulationStarted", at: 100 });
    expect(e.readings[0].temporalHistory).toHaveLength(1);  // just the seed
    e.consume({ name: "ChartTabShown", at: 150 });
    expect(e.readings[0].temporalHistory).toHaveLength(2);
    expect(e.readings[0].temporalHistory[1]).toEqual({
      at: 150, name: "chartTabOpen", value: true, eventName: "ChartTabShown",
    });
  });

  it("R18d reducer-throw contract: errors get temporal-reducer-error; no commit, no translate, no second reducer", () => {
    const calls: string[] = [];
    const thrower: TemporalVariableImpl<boolean> = {
      name: "a", initialValue: false,
      acceptedEvents: ["BadEvent"],
      reduce: () => { calls.push("a-reduce"); throw new Error("boom"); },
    };
    const second: TemporalVariableImpl<boolean> = {
      name: "b", initialValue: false,
      acceptedEvents: ["BadEvent"],
      reduce: () => { calls.push("b-reduce"); return true; },
    };
    const translateSpy = jest.fn().mockReturnValue({ kind: "no-op" });
    const e = new Engine<TR, TD>({
      ruleSet: makeRuleSet(),
      factorVariables: { ranSimulation: ranSimulationImpl },
      simProps: {},
      translate: translateSpy,
      temporalVariables: {
        a: thrower as TemporalVariableImpl<unknown>,
        b: second as TemporalVariableImpl<unknown>,
      },
    });
    translateSpy.mockClear();
    e.consume({ name: "BadEvent", at: 99 });
    // First reducer ran; second did NOT (fail-fast).
    expect(calls).toEqual(["a-reduce"]);
    // Error pushed with full context.
    const err = e.errors.find((er) => er.kind === "temporal-reducer-error");
    if (err?.kind !== "temporal-reducer-error") throw new Error("expected temporal-reducer-error");
    expect(err.variableName).toBe("a");
    expect(err.event.name).toBe("BadEvent");
    expect(err.at).toBe(99);
    expect(err.thrown).toBeInstanceOf(Error);
    // No commit — temporalValues unchanged, observed unchanged.
    expect(e.temporalValues.a).toBe(false);
    expect(e.temporalValues.b).toBe(false);
    expect(e.observed.a).toBe(false);
    expect(e.observed.b).toBe(false);
    // translate not called.
    expect(translateSpy).not.toHaveBeenCalled();
    // No reading created.
    expect(e.readings).toHaveLength(0);
  });
});
