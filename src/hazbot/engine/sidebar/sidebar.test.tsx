import * as React from "react";
import { render, screen, act } from "@testing-library/react";
import { Engine, EngineOpts } from "../engine";
import { BaseReading, FactorVariableImpl, RuleSet } from "../types";
import { AnalysisEngineProvider } from "../react";
import { Sidebar } from "./sidebar";

interface TestReading extends BaseReading {
  foo?: string;
  bar?: number;
}
type TestDefaults = unknown;

const noopTranslate: EngineOpts<TestReading, TestDefaults>["translate"] = (event, sessionId) => {
  if (event.name === "Triggered") {
    return {
      kind: "trigger",
      reading: { triggeredBy: "Triggered", at: event.at, sessionId, updates: [], foo: "f", bar: 1 },
    };
  }
  return { kind: "no-op" };
};

const ranSimulationImpl: FactorVariableImpl<boolean, TestReading, TestDefaults> = {
  defaultValue: false,
  compute: (readings) => ({ value: readings.length > 0, witnesses: readings }),
};

function makeRuleSet(): RuleSet<TestDefaults> {
  return {
    id: "tab1",
    categories: [
      { id: 1, studentAction: "Ran the sim", feedback: "Step 1 done", visualFeedback: "", expression: "ranSimulation" },
    ],
    factorVariables: [{ name: "ranSimulation", definition: "", logEvents: [], details: "" }],
    defaults: {},
  };
}

function wrap(engine: Engine<TestReading, TestDefaults>): React.FC<{ children: React.ReactNode }> {
  // eslint-disable-next-line react/display-name
  return ({ children }) => (
    <AnalysisEngineProvider engine={engine} appRulesVersion={1}>{children}</AnalysisEngineProvider>
  );
}

describe("Sidebar (substrate, generic over TReading)", () => {
  it("renders without throwing given a populated active engine + Provider", () => {
    const engine = new Engine<TestReading, TestDefaults>({
      ruleSet: makeRuleSet(),
      factorVariables: { ranSimulation: ranSimulationImpl },
      simProps: {},
      translate: noopTranslate,
      runStartTriggers: ["Triggered"],
    });
    const Wrapper = wrap(engine);
    render(<Wrapper><Sidebar title="Hazbot" /></Wrapper>);
    expect(screen.getByText(/Hazbot/)).toBeInTheDocument();
  });

  it("displays matched-category studentAction once a reading triggers cat 1; feedback shows when expanded", () => {
    const engine = new Engine<TestReading, TestDefaults>({
      ruleSet: makeRuleSet(),
      factorVariables: { ranSimulation: ranSimulationImpl },
      simProps: {},
      translate: noopTranslate,
      runStartTriggers: ["Triggered"],
    });
    const Wrapper = wrap(engine);
    render(<Wrapper><Sidebar title="Hazbot" /></Wrapper>);
    act(() => engine.consume({ name: "Triggered", at: 100, ambientState: {} }));
    // studentAction is in the always-visible header; feedback is only shown on expand.
    expect(screen.getByText(/Ran the sim/)).toBeInTheDocument();
    expect(screen.queryByText(/Step 1 done/)).not.toBeInTheDocument();
    // Matched category gets the matched-class for the bold-border highlight (Req 17).
    // eslint-disable-next-line testing-library/no-node-access
    const entry = screen.getByText(/Ran the sim/).closest(".hazbot-sidebar-entry");
    expect(entry?.className).toMatch(/hazbot-sidebar-category-matched/);
    // Click the row's header to expand and reveal the feedback.
    act(() => { screen.getByText(/Ran the sim/).click(); });
    expect(screen.getByText(/Step 1 done/)).toBeInTheDocument();
  });

  it("renders the load-error banner when engine is inactive due to bad rule-set id", () => {
    const engine = new Engine<TestReading, TestDefaults>({
      requestedRuleSetId: "missing",
      factorVariables: { ranSimulation: ranSimulationImpl },
      simProps: {},
      translate: noopTranslate,
    });
    const Wrapper = wrap(engine);
    render(<Wrapper><Sidebar title="Hazbot" /></Wrapper>);
    expect(screen.getByText(/Load error/)).toBeInTheDocument();
    // The same error appears in both the banner and the errors panel — both should render.
    expect(screen.getAllByText(/Rule set not found: missing/).length).toBeGreaterThanOrEqual(1);
  });

  it("re-renders readings count when consume() ticks the snapshot", () => {
    const engine = new Engine<TestReading, TestDefaults>({
      ruleSet: makeRuleSet(),
      factorVariables: { ranSimulation: ranSimulationImpl },
      simProps: {},
      translate: noopTranslate,
      runStartTriggers: ["Triggered"],
    });
    const Wrapper = wrap(engine);
    render(<Wrapper><Sidebar title="Hazbot" /></Wrapper>);
    expect(screen.getByText(/Readings \(0\)/)).toBeInTheDocument();
    act(() => engine.consume({ name: "Triggered", at: 100, ambientState: {} }));
    expect(screen.getByText(/Readings \(1\)/)).toBeInTheDocument();
  });

  it("renders a generic JSON-pretty-print of TReading payload (foo, bar) in expanded reading", () => {
    const engine = new Engine<TestReading, TestDefaults>({
      ruleSet: makeRuleSet(),
      factorVariables: { ranSimulation: ranSimulationImpl },
      simProps: {},
      translate: noopTranslate,
      runStartTriggers: ["Triggered"],
    });
    const Wrapper = wrap(engine);
    render(<Wrapper><Sidebar title="Hazbot" /></Wrapper>);
    act(() => engine.consume({ name: "Triggered", at: 100, ambientState: {} }));
    // Click the reading row to expand.
    const row = screen.getByText(/Triggered ·/);
    act(() => { row.click(); });
    // Foo and bar should appear in the JSON pretty-print.
    expect(screen.getByText(/"foo": "f"/)).toBeInTheDocument();
    expect(screen.getByText(/"bar": 1/)).toBeInTheDocument();
  });

  it("shows the inactive-fallback note when ruleSet is undefined", () => {
    const engine = new Engine<TestReading, TestDefaults>({
      requestedRuleSetId: "missing",
      factorVariables: { ranSimulation: ranSimulationImpl },
      simProps: {},
      translate: noopTranslate,
    });
    const Wrapper = wrap(engine);
    render(<Wrapper><Sidebar title="Hazbot" /></Wrapper>);
    expect(screen.getByText(/Engine inactive — values shown are impl defaults/)).toBeInTheDocument();
  });
});
