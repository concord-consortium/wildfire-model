// R18a: Two-engine determinism test. Two Engine instances given identical opts and
// the same ConsumedEvent[] must produce identical readings, temporalValues, observed,
// and matchedCategory history. This pins R1's atomic-commit semantics and the
// declaration-order reducer dispatch against unintentional non-determinism.

import { Engine, EngineOpts } from "./engine";
import { BaseReading, ConsumedEvent, FactorVariableImpl, RuleSet, TemporalVariableImpl } from "./types";
import { computeMatchedCategoryForEngine } from "./evaluator";

interface TR extends BaseReading {
  ambientState?: Record<string, unknown>;
}
type TD = unknown;

function makeOpts(): EngineOpts<TR, TD> {
  const ranSimulation: FactorVariableImpl<boolean, TR, TD> = {
    defaultValue: false,
    compute: (readings) => {
      const sims = readings.filter((r) => r.triggeredBy === "SimulationStarted");
      return { value: sims.length > 0, witnesses: sims };
    },
  };
  const ruleSet: RuleSet<TD> = {
    id: "test",
    categories: [
      { id: 1, studentAction: "", feedback: "", visualFeedback: "", expression: "ranSimulation" },
    ],
    factorVariables: [{ name: "ranSimulation", definition: "", logEvents: ["SimulationStarted"], details: "" }],
    defaults: {},
  };
  const chartTabOpen: TemporalVariableImpl<boolean> = {
    name: "chartTabOpen",
    initialValue: false,
    acceptedEvents: ["ChartTabShown", "ChartTabHidden"],
    reduce: (_p, e) => e.name === "ChartTabShown",
  };
  return {
    ruleSet,
    factorVariables: { ranSimulation },
    simProps: {},
    translate: (event, sessionId) => {
      if (event.name === "SimulationStarted") {
        return {
          kind: "trigger",
          reading: { triggeredBy: "SimulationStarted", sessionId, at: event.at, updates: [], temporalHistory: [] },
        };
      }
      if (event.name === "SimulationEnded") {
        return {
          kind: "trigger",
          reading: { triggeredBy: "SimulationEnded", sessionId, at: event.at, updates: [], temporalHistory: [] },
        };
      }
      return { kind: "no-op" };
    },
    runStartTriggers: ["SimulationStarted"],
    temporalVariables: { chartTabOpen: chartTabOpen as TemporalVariableImpl<unknown> },
  };
}

describe("Engine — replay determinism (R18a)", () => {
  it("two engines with identical opts produce identical state over the same event stream", () => {
    const events: ConsumedEvent[] = [
      { name: "ChartTabShown", at: 10 },          // pre-trigger state change
      { name: "SimulationStarted", at: 100, ambientState: {} },
      { name: "ChartTabHidden", at: 150 },        // within-window state change
      { name: "ChartTabShown", at: 200 },         // within-window state change
      { name: "SimulationEnded", at: 300, ambientState: {} },
      { name: "ChartTabHidden", at: 400 },        // between-runs state change
    ];

    const engineA = new Engine<TR, TD>(makeOpts());
    const engineB = new Engine<TR, TD>(makeOpts());

    const matchedA: (number | null)[] = [];
    const matchedB: (number | null)[] = [];
    for (const event of events) {
      engineA.consume(event);
      matchedA.push(computeMatchedCategoryForEngine(engineA));
      engineB.consume(event);
      matchedB.push(computeMatchedCategoryForEngine(engineB));
    }

    // The sessionId differs across engine instances by design; compare structural state.
    const stripSessionId = (r: TR): Omit<TR, "sessionId"> => {
      // sessionId removed because it's nondeterministic per Engine instance.
      const { sessionId: _sid, ...rest } = r;
      return rest;
    };
    expect(engineA.readings.map(stripSessionId)).toEqual(engineB.readings.map(stripSessionId));
    expect(engineA.temporalValues).toEqual(engineB.temporalValues);
    expect(engineA.observed).toEqual(engineB.observed);
    expect(matchedA).toEqual(matchedB);
  });
});
