import * as React from "react";
import { render, renderHook, act } from "@testing-library/react";
import { Engine, EngineOpts } from "../engine";
import { BaseReading, FactorVariableImpl, RuleSet } from "../types";
import { AnalysisEngineProvider } from "./provider";
import { useAnalysisEngine } from "./use-analysis-engine";

interface TR extends BaseReading { payload?: Record<string, unknown> }
type TD = unknown;

const noopTranslate: EngineOpts<TR, TD>["translate"] = (event, sessionId) => {
  if (event.name === "SimulationStarted") {
    const reading: TR = { triggeredBy: "SimulationStarted", at: event.at, sessionId, updates: [], temporalHistory: [] };
    return { kind: "trigger", reading };
  }
  return { kind: "no-op" };
};

const ranSimulationImpl: FactorVariableImpl<boolean, TR, TD> = {
  defaultValue: false,
  compute: (readings) => {
    const sims = readings.filter((r) => r.triggeredBy === "SimulationStarted");
    return { value: sims.length > 0, witnesses: sims };
  },
};

function makeRuleSet(): RuleSet<TD> {
  return {
    id: "test",
    categories: [{ id: 1, studentAction: "", feedback: "good", visualFeedback: "", expression: "ranSimulation" }],
    factorVariables: [{ name: "ranSimulation", definition: "", logEvents: [], details: "" }],
    defaults: {},
  };
}

function makeEngine(opts: Partial<EngineOpts<TR, TD>> = {}): Engine<TR, TD> {
  return new Engine<TR, TD>({
    ruleSet: makeRuleSet(),
    factorVariables: { ranSimulation: ranSimulationImpl },
    simProps: {},
    translate: noopTranslate,
    runStartTriggers: ["SimulationStarted"],
    ...opts,
  });
}

function wrap(engine: Engine<TR, TD>): React.FC<{ children: React.ReactNode }> {
  // eslint-disable-next-line react/display-name
  return ({ children }) => (
    <AnalysisEngineProvider engine={engine} appRulesVersion={1}>{children}</AnalysisEngineProvider>
  );
}

describe("useAnalysisEngine", () => {
  it("throws with the documented message when used outside Provider", () => {
    // Suppress React's expected error logging.
    const errSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => renderHook(() => useAnalysisEngine())).toThrow(
      "useAnalysisEngine must be used inside <AnalysisEngineProvider>",
    );
    errSpy.mockRestore();
  });

  it("returns engine + appRulesVersion + factorVariableValues + matchedCategory + perCategoryTruth", () => {
    const engine = makeEngine();
    const { result } = renderHook(() => useAnalysisEngine<TR, TD>(), { wrapper: wrap(engine) });
    expect(result.current.engine).toBe(engine);
    expect(result.current.appRulesVersion).toBe(1);
    expect(result.current.factorVariableValues).toHaveProperty("ranSimulation", false);
    expect(result.current.matchedCategory).toBeNull(); // no readings yet
  });

  it("re-renders on consume() and updates derived view", () => {
    const engine = makeEngine();
    const { result } = renderHook(() => useAnalysisEngine<TR, TD>(), { wrapper: wrap(engine) });
    expect(result.current.matchedCategory).toBeNull();
    act(() => engine.consume({ name: "SimulationStarted", at: 100, ambientState: {} }));
    expect(result.current.factorVariableValues.ranSimulation).toBe(true);
    expect(result.current.matchedCategory).toBe(1);
  });

  it("returns reference-equal derived fields across two hook calls in the same render (memoization)", () => {
    const engine = makeEngine();
    const captured: Array<{ a: ReturnType<typeof useAnalysisEngine<TR, TD>>; b: ReturnType<typeof useAnalysisEngine<TR, TD>> }> = [];
    const Probe: React.FC = () => {
      const a = useAnalysisEngine<TR, TD>();
      const b = useAnalysisEngine<TR, TD>();
      captured.push({ a, b });
      return null;
    };
    render(<Probe />, { wrapper: wrap(engine) });
    expect(captured).toHaveLength(1);
    expect(captured[0].a).toBe(captured[0].b);
    expect(captured[0].a.factorVariableValues).toBe(captured[0].b.factorVariableValues);
  });

  it("inactive engine (missing-rule-set) returns matchedCategory null and empty perCategoryTruth", () => {
    const engine = new Engine<TR, TD>({
      requestedRuleSetId: "23",
      factorVariables: { ranSimulation: ranSimulationImpl },
      simProps: {},
      translate: noopTranslate,
    });
    const { result } = renderHook(() => useAnalysisEngine<TR, TD>(), { wrapper: wrap(engine) });
    expect(result.current.engine.isActive).toBe(false);
    expect(result.current.matchedCategory).toBeNull();
    expect(result.current.perCategoryTruth).toEqual({});
  });

  it("inactive engine consume() does not re-render (snapshot doesn't tick)", () => {
    const inactive = new Engine<TR, TD>({
      requestedRuleSetId: "23",
      factorVariables: { ranSimulation: ranSimulationImpl },
      simProps: {},
      translate: noopTranslate,
    });
    let mountCount = 0;
    const Probe: React.FC = () => { useAnalysisEngine<TR, TD>(); mountCount++; return null; };
    render(<Probe />, { wrapper: wrap(inactive) });
    const mountsBefore = mountCount;
    act(() => inactive.consume({ name: "SimulationStarted", at: 100 }));
    expect(mountCount).toBe(mountsBefore);
  });

  it("render-path impl throw does not mutate engine.errors", () => {
    const throwingFvar: FactorVariableImpl<boolean, TR, TD> = {
      defaultValue: false,
      compute: () => { throw new Error("boom"); },
    };
    const ruleSet: RuleSet<TD> = {
      ...makeRuleSet(),
      categories: [{ id: 1, studentAction: "", feedback: "", visualFeedback: "", expression: "throwingFactor" }],
      factorVariables: [{ name: "throwingFactor", definition: "", logEvents: [], details: "" }],
    };
    const engine = new Engine<TR, TD>({
      ruleSet,
      factorVariables: { throwingFactor: throwingFvar },
      simProps: {},
      translate: noopTranslate,
      runStartTriggers: ["SimulationStarted"],
    });
    const errorsBefore = engine.errors.length;
    renderHook(() => useAnalysisEngine<TR, TD>(), { wrapper: wrap(engine) });
    expect(engine.errors.length).toBe(errorsBefore); // no impl-eval-throw appended via render
  });
});
