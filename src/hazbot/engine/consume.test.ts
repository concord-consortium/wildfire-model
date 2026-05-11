import { Engine, EngineOpts } from "./engine";
import { BaseReading, FactorVariableImpl, ReadingUpdate, RuleSet, SimPropImpl } from "./types";

interface TR extends BaseReading {
  payload?: Record<string, unknown>;
  ambientState?: { chartTabOpenAtStart?: boolean };
}
type TD = { wind?: { speed: number; direction: number } };

function makeTranslate(): EngineOpts<TR, TD>["translate"] {
  return (event, sessionId) => {
    if (event.name === "SimulationStarted") {
      const reading: TR = {
        triggeredBy: "SimulationStarted",
        sessionId,
        at: event.at,
        updates: [],
        ambientState: (event.ambientState as TR["ambientState"]) ?? {},
      };
      return { kind: "trigger", reading };
    }
    if (event.name === "SimulationEnded") {
      const reading: TR = { triggeredBy: "SimulationEnded", sessionId, at: event.at, updates: [] };
      return { kind: "trigger", reading };
    }
    if (event.name === "ChartTabShown") {
      const update: ReadingUpdate = { source: "ChartTabShown", value: true, at: event.at };
      return { kind: "modifier", update };
    }
    if (event.name === "ChartTabHidden") {
      const update: ReadingUpdate = { source: "ChartTabHidden", value: false, at: event.at };
      return { kind: "modifier", update };
    }
    return { kind: "no-op" };
  };
}

function makeRuleSet(opts: { categories?: RuleSet<TD>["categories"]; defaults?: RuleSet<TD>["defaults"] } = {}): RuleSet<TD> {
  return {
    id: "test",
    categories: opts.categories ?? [{ id: 1, studentAction: "", feedback: "", visualFeedback: "", expression: "ranSimulation" }],
    factorVariables: [{ name: "ranSimulation", definition: "", logEvents: [], details: "" }],
    defaults: opts.defaults ?? {},
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
    e.consume({ name: "SimulationStarted", at: 100, ambientState: {} });
    expect(e.readings).toHaveLength(1);
    expect(e.readings[0].triggeredBy).toBe("SimulationStarted");
    expect(e.getSnapshot()).toBe(before + 1);
  });

  it("ambient-validation: missing required key produces ambient-validation error and no Reading", () => {
    const graphOpenSim: SimPropImpl<TR, TD> = {
      defaultValue: false,
      ambientStateKeys: { SimulationStarted: ["chartTabOpenAtStart"] },
      evaluate: (r) => Boolean(r.ambientState?.chartTabOpenAtStart),
    };
    const ruleSet = makeRuleSet({
      categories: [{
        id: 1, studentAction: "", feedback: "", visualFeedback: "",
        expression: "ranSimulation WITH GraphOpen",
      }],
    });
    const e = new Engine<TR, TD>({
      ruleSet,
      factorVariables: { ranSimulation: ranSimulationImpl },
      simProps: { GraphOpen: graphOpenSim },
      translate: makeTranslate(),
      runStartTriggers: ["SimulationStarted"],
    });
    expect(e.isActive).toBe(true);
    e.consume({ name: "SimulationStarted", at: 100 /* no ambientState */ });
    expect(e.readings).toHaveLength(0);
    const av = e.errors.find((x) => x.kind === "ambient-validation");
    if (!av || av.kind !== "ambient-validation") throw new Error("expected ambient-validation");
    expect(av.implName).toBe("GraphOpen");
    expect(av.missingKey).toBe("chartTabOpenAtStart");
  });

  it("subsequent ChartTabShown after a failed SimulationStarted gets `prior-trigger-failed`", () => {
    const graphOpenSim: SimPropImpl<TR, TD> = {
      defaultValue: false,
      ambientStateKeys: { SimulationStarted: ["chartTabOpenAtStart"] },
      evaluate: (r) => Boolean(r.ambientState?.chartTabOpenAtStart),
    };
    const ruleSet = makeRuleSet({
      categories: [{
        id: 1, studentAction: "", feedback: "", visualFeedback: "",
        expression: "ranSimulation WITH GraphOpen",
      }],
    });
    const e = new Engine<TR, TD>({
      ruleSet,
      factorVariables: { ranSimulation: ranSimulationImpl },
      simProps: { GraphOpen: graphOpenSim },
      translate: makeTranslate(),
      runStartTriggers: ["SimulationStarted"],
    });
    e.consume({ name: "SimulationStarted", at: 100 }); // fails ambient
    e.consume({ name: "ChartTabShown", at: 110 });
    const orphan = e.errors.find((x) => x.kind === "orphan-modifier");
    if (!orphan || orphan.kind !== "orphan-modifier") throw new Error("expected orphan-modifier");
    expect(orphan.reason).toBe("prior-trigger-failed");
  });

  it("modifier with no prior trigger (bootstrap) gets `no-prior-trigger`", () => {
    const e = new Engine<TR, TD>({
      ruleSet: makeRuleSet(),
      factorVariables: { ranSimulation: ranSimulationImpl },
      simProps: {},
      translate: makeTranslate(),
      runStartTriggers: ["SimulationStarted"],
    });
    e.consume({ name: "ChartTabShown", at: 100 });
    const orphan = e.errors.find((x) => x.kind === "orphan-modifier");
    if (!orphan || orphan.kind !== "orphan-modifier") throw new Error("expected orphan-modifier");
    expect(orphan.reason).toBe("no-prior-trigger");
  });

  it("modifier between-runs (latest reading is SimulationEnded) gets `between-runs`", () => {
    const e = new Engine<TR, TD>({
      ruleSet: makeRuleSet(),
      factorVariables: { ranSimulation: ranSimulationImpl },
      simProps: {},
      translate: makeTranslate(),
      runStartTriggers: ["SimulationStarted"],
    });
    e.consume({ name: "SimulationStarted", at: 100, ambientState: {} });
    e.consume({ name: "SimulationEnded", at: 200 });
    e.consume({ name: "ChartTabShown", at: 210 });
    const orphans = e.errors.filter((x) => x.kind === "orphan-modifier");
    expect(orphans).toHaveLength(1);
    if (orphans[0].kind !== "orphan-modifier") throw new Error("expected orphan-modifier");
    expect(orphans[0].reason).toBe("between-runs");
  });

  it("modifier appends to latest reading when run is in progress", () => {
    const e = new Engine<TR, TD>({
      ruleSet: makeRuleSet(),
      factorVariables: { ranSimulation: ranSimulationImpl },
      simProps: {},
      translate: makeTranslate(),
      runStartTriggers: ["SimulationStarted"],
    });
    e.consume({ name: "SimulationStarted", at: 100, ambientState: {} });
    e.consume({ name: "ChartTabShown", at: 110 });
    expect(e.readings[0].updates).toEqual([{ source: "ChartTabShown", value: true, at: 110 }]);
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

  it("ambient-validation does not fire for unreferenced impls that declare ambient keys", () => {
    // An unused sim-prop registered with ambient keys should not trigger ambient-validation.
    const unusedSim: SimPropImpl<TR, TD> = {
      defaultValue: false,
      ambientStateKeys: { SimulationStarted: ["forgottenKey"] },
      evaluate: () => true,
    };
    const e = new Engine<TR, TD>({
      ruleSet: makeRuleSet(), // expression: "ranSimulation" — does not reference unusedSim
      factorVariables: { ranSimulation: ranSimulationImpl },
      simProps: { unusedSim },
      translate: makeTranslate(),
      runStartTriggers: ["SimulationStarted"],
    });
    expect(e.isActive).toBe(true);
    e.consume({ name: "SimulationStarted", at: 100 /* no ambientState; no key required */ });
    expect(e.errors.filter((x) => x.kind === "ambient-validation")).toHaveLength(0);
    expect(e.readings).toHaveLength(1);
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
    e.consume({ name: "SimulationStarted", at: 100, ambientState: {} });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});


