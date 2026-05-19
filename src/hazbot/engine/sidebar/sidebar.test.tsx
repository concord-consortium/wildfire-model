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
      reading: { triggeredBy: "Triggered", at: event.at, sessionId, updates: [], temporalHistory: [], foo: "f", bar: 1 },
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
    // Matched category gets the matched-class for the outline highlight (Req 17).
    // eslint-disable-next-line testing-library/no-node-access
    const entry = screen.getByText(/Ran the sim/).closest(".hazbot-sidebar-entry");
    expect(entry?.className).toMatch(/hazbot-sidebar-category-matched/);
    // Click the row's header to expand and reveal the feedback.
    act(() => { screen.getByText(/Ran the sim/).click(); });
    expect(screen.getByText(/Step 1 done/)).toBeInTheDocument();
  });

  it("renders the errors panel when engine is inactive due to bad rule-set id", () => {
    const engine = new Engine<TestReading, TestDefaults>({
      requestedRuleSetId: "missing",
      factorVariables: { ranSimulation: ranSimulationImpl },
      simProps: {},
      translate: noopTranslate,
    });
    const Wrapper = wrap(engine);
    render(<Wrapper><Sidebar title="Hazbot" /></Wrapper>);
    // Load-failure surfaces in the Errors / Warnings panel (now at top of sidebar).
    expect(screen.getByText(/Errors \/ Warnings/)).toBeInTheDocument();
    expect(screen.getByText(/Rule set not found: missing/)).toBeInTheDocument();
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

  it("hides Categories / Readings / FactorVariables panels when ruleSet is undefined (Req 17 case b)", () => {
    const engine = new Engine<TestReading, TestDefaults>({
      requestedRuleSetId: "missing",
      factorVariables: { ranSimulation: ranSimulationImpl },
      simProps: {},
      translate: noopTranslate,
    });
    const Wrapper = wrap(engine);
    render(<Wrapper><Sidebar title="Hazbot" /></Wrapper>);
    // Per Req 17 case (b): sidebar shows only the engine errors panel (at top) and
    // the rule-set-id fallback (in the header) — no Categories, Readings, or Factor
    // Variables panels.
    expect(screen.queryByText(/^Categories$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Readings/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Factor Variables$/)).not.toBeInTheDocument();
    // Errors panel still visible.
    expect(screen.getByText(/Errors \/ Warnings/)).toBeInTheDocument();
  });

  it("double-encodes partially-true expressions with per-leaf true/false classes (AC: leaf coloring)", () => {
    // Two-leaf AND where one leaf is true and the other is false — visible differentiation per AC.
    const aImpl: FactorVariableImpl<boolean, TestReading, TestDefaults> = {
      defaultValue: false,
      compute: () => ({ value: true, witnesses: [] }),
    };
    const bImpl: FactorVariableImpl<boolean, TestReading, TestDefaults> = {
      defaultValue: false,
      compute: () => ({ value: false, witnesses: [] }),
    };
    const rs: RuleSet<TestDefaults> = {
      id: "leaf-color",
      categories: [{
        id: 1, studentAction: "Both", feedback: "", visualFeedback: "",
        expression: "a AND b",
      }],
      factorVariables: [
        { name: "a", definition: "", logEvents: [], details: "" },
        { name: "b", definition: "", logEvents: [], details: "" },
      ],
      defaults: {},
    };
    const engine = new Engine<TestReading, TestDefaults>({
      ruleSet: rs,
      factorVariables: { a: aImpl, b: bImpl },
      simProps: {},
      translate: noopTranslate,
    });
    const Wrapper = wrap(engine);
    render(<Wrapper><Sidebar title="Hazbot" /></Wrapper>);
    // Leaves render with class `hazbot-sidebar-leaf-true` / `-false` per truth value.
    // We locate each leaf by its visible text ("a" / "b") and assert the className.
    const aLeaves = screen.getAllByText("a");
    const aLeaf = aLeaves.find((el) => el.className.includes("hazbot-sidebar-leaf"));
    expect(aLeaf?.className).toMatch(/hazbot-sidebar-leaf-true/);
    const bLeaves = screen.getAllByText("b");
    const bLeaf = bLeaves.find((el) => el.className.includes("hazbot-sidebar-leaf"));
    expect(bLeaf?.className).toMatch(/hazbot-sidebar-leaf-false/);
  });

  it("matched-highlight and per-category status icon can disagree under monotonicity (AC: disagreement scenario)", () => {
    // Build a rule set + impls where category 2's matched floor is locked in by a
    // prior reading, but the CURRENT truth-icon evaluation is false. The matched-
    // class outline stays on cat 2 even though the icon shows ✗ — engine surfaces
    // both pieces of state independently.
    // a flips to true once any reading lands, then stays true.
    const aImpl: FactorVariableImpl<boolean, TestReading, TestDefaults> = {
      defaultValue: false,
      compute: (readings) => ({ value: readings.length > 0, witnesses: readings }),
    };
    // b is true only when there's exactly one reading (so it goes true → false as
    // more readings arrive — exercises the matched-vs-current disagreement).
    const bImpl: FactorVariableImpl<boolean, TestReading, TestDefaults> = {
      defaultValue: false,
      compute: (readings) => ({ value: readings.length === 1, witnesses: readings }),
    };
    const rs: RuleSet<TestDefaults> = {
      id: "disagree",
      categories: [
        { id: 1, studentAction: "Cat 1", feedback: "", visualFeedback: "", expression: "a" },
        { id: 2, studentAction: "Cat 2", feedback: "", visualFeedback: "", expression: "a AND b" },
      ],
      factorVariables: [
        { name: "a", definition: "", logEvents: [], details: "" },
        { name: "b", definition: "", logEvents: [], details: "" },
      ],
      defaults: {},
    };
    const engine = new Engine<TestReading, TestDefaults>({
      ruleSet: rs,
      factorVariables: { a: aImpl, b: bImpl },
      simProps: {},
      translate: noopTranslate,
      runStartTriggers: ["Triggered"],
    });
    const Wrapper = wrap(engine);
    render(<Wrapper><Sidebar title="Hazbot" /></Wrapper>);
    // Reading 1 → both a and b are true → cat 2 matches. Floor = 2.
    act(() => engine.consume({ name: "Triggered", at: 100, ambientState: {} }));
    // Reading 2 → a still true but b becomes false → cat 2 currently false.
    // Floor stays at 2 (monotonicity); per-category status for cat 2 = ✗.
    act(() => engine.consume({ name: "Triggered", at: 200, ambientState: {} }));
    // Matched-class outline is on cat 2's row.
    // eslint-disable-next-line testing-library/no-node-access
    const cat2Row = screen.getByText(/Cat 2/).closest(".hazbot-sidebar-entry");
    expect(cat2Row?.className).toMatch(/hazbot-sidebar-category-matched/);
    // The same row's status icon shows ✗ (current truth, not matched state).
    expect(cat2Row?.textContent).toMatch(/✗/);
  });

  it("shows the inactive-fallback note in Factor Variables panel when engine is inactive but ruleSet is defined (e.g., missing-defaults)", () => {
    // Build a rule set whose category expression references a factor variable that
    // declares a requiredDefaults path the rule set's defaults don't satisfy. The
    // engine constructs (ruleSet retained), fails load validation, and the panel
    // surfaces the fallback note for the developer.
    const fvarReadingDefaults: FactorVariableImpl<boolean, TestReading, { needed?: string }> = {
      defaultValue: false,
      requiredDefaults: ["needed"],
      compute: (_readings, defaults) => ({ value: defaults?.needed !== undefined, witnesses: [] }),
    };
    const rs: RuleSet<{ needed?: string }> = {
      id: "tabX",
      categories: [{ id: 1, studentAction: "stub", feedback: "", visualFeedback: "", expression: "needsDefault" }],
      factorVariables: [{ name: "needsDefault", definition: "", logEvents: [], details: "" }],
      defaults: {}, // intentionally missing — triggers missing-defaults load failure
    };
    const engine = new Engine<TestReading, { needed?: string }>({
      ruleSet: rs,
      factorVariables: { needsDefault: fvarReadingDefaults },
      simProps: {},
      translate: noopTranslate,
    });
    const Wrapper = wrap(engine);
    render(<Wrapper><Sidebar title="Hazbot" /></Wrapper>);
    expect(screen.getByText(/Engine inactive — values may be impl defaults/)).toBeInTheDocument();
  });
});
