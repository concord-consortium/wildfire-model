import { renderError } from "./error-rendering";
import { EngineError } from "./types";

describe("renderError", () => {
  describe("load-failure", () => {
    it("renders missing-rule-set with id", () => {
      const e: EngineError = { kind: "load-failure", reason: "missing-rule-set", ruleSetId: "23", detail: "", at: 0 };
      expect(renderError(e)).toEqual({ severity: "error", message: "Rule set not found: 23" });
    });

    it("renders missing-rule-set without id", () => {
      const e: EngineError = { kind: "load-failure", reason: "missing-rule-set", detail: "", at: 0 };
      expect(renderError(e)).toEqual({ severity: "error", message: "Rule set not found: (no ?hazbotRules param)" });
    });

    it("renders missing-impl", () => {
      const e: EngineError = { kind: "load-failure", reason: "missing-impl", ruleSetId: "23", detail: "ranSimulation", at: 0 };
      expect(renderError(e)).toEqual({ severity: "error", message: "Missing impl: 23 · ranSimulation" });
    });
  });

  it("renders parse-error with offending token", () => {
    const e: EngineError = {
      kind: "parse-error", ruleSetId: "23", categoryId: 2, expression: "ranSimulation AND foo",
      tokenSpan: { start: 18, end: 21 }, offendingToken: "foo", detail: "unexpected identifier", at: 0,
    };
    expect(renderError(e)).toEqual({
      severity: "error",
      message: "Parse error in category 2: unexpected identifier (offending: `foo`)",
    });
  });

  describe("impl-eval-throw", () => {
    it("renders sim-prop throws with reading index", () => {
      const e: EngineError = {
        kind: "impl-eval-throw", ruleSetId: "23", implName: "OneSparkPerZone",
        implKind: "sim-prop", readingIndex: 2, thrown: new Error("boom"), at: 0,
      };
      expect(renderError(e)).toEqual({
        severity: "error",
        message: "Sim-prop OneSparkPerZone threw at reading 2: Error: boom",
      });
    });

    it("renders factor-variable throws with readings count from context", () => {
      const e: EngineError = {
        kind: "impl-eval-throw", ruleSetId: "23", implName: "ranSimulation",
        implKind: "factor-variable", thrown: "kaboom", at: 0,
      };
      expect(renderError(e, { readingsLength: 5 })).toEqual({
        severity: "error",
        message: "Factor variable ranSimulation threw during computation over 5 readings: kaboom",
      });
    });

    it("renders factor-variable throws without readings count when context omitted", () => {
      const e: EngineError = {
        kind: "impl-eval-throw", ruleSetId: "23", implName: "ranSimulation",
        implKind: "factor-variable", thrown: "kaboom", at: 0,
      };
      expect(renderError(e)).toEqual({
        severity: "error",
        message: "Factor variable ranSimulation threw during computation: kaboom",
      });
    });
  });

  it("renders stub-warning", () => {
    const e: EngineError = { kind: "stub-warning", stubName: "SparksAtTopAndBottom", at: 0 };
    expect(renderError(e)).toEqual({
      severity: "warning",
      message: "Stub not yet implemented: SparksAtTopAndBottom",
    });
  });

  describe("temporal variants", () => {
    it("renders temporal-validation for a factor variable", () => {
      const e: EngineError = {
        kind: "temporal-validation", ruleSetId: "23", implName: "ranSimulation",
        implType: "factorVariable", missingVariableName: "fooVar", at: 0,
      };
      const view = renderError(e);
      expect(view.severity).toBe("error");
      expect(view.message).toContain("factor variable ranSimulation");
      expect(view.message).toContain('temporalReads "fooVar"');
      expect(view.message).toContain("ruleset 23");
    });

    it("renders temporal-validation for a sim-prop", () => {
      const e: EngineError = {
        kind: "temporal-validation", ruleSetId: "25", implName: "GraphOpen",
        implType: "simProp", missingVariableName: "chartTabOpen", at: 0,
      };
      const view = renderError(e);
      expect(view.severity).toBe("error");
      expect(view.message).toContain("sim-prop GraphOpen");
      expect(view.message).toContain('temporalReads "chartTabOpen"');
    });

    it("renders temporal-reducer-error with variable + event + thrown", () => {
      const e: EngineError = {
        kind: "temporal-reducer-error", ruleSetId: "23", variableName: "v",
        event: { name: "X", at: 0 }, thrown: new Error("boom"), at: 0,
      };
      const view = renderError(e);
      expect(view.severity).toBe("error");
      expect(view.message).toContain("v");
      expect(view.message).toContain("X");
      expect(view.message).toContain("boom");
    });

    it("renders trigger-state-change-overlap", () => {
      const e: EngineError = {
        kind: "trigger-state-change-overlap", ruleSetId: "23",
        variableName: "v", eventName: "SimulationStarted", factorVariableName: "ranSimulation", at: 0,
      };
      const view = renderError(e);
      expect(view.severity).toBe("error");
      expect(view.message).toContain("v");
      expect(view.message).toContain("SimulationStarted");
      expect(view.message).toContain("ranSimulation");
      expect(view.message).toContain("ruleset 23");
    });

    it("renders temporal-initial-values-mismatch with all three parts", () => {
      const e: EngineError = {
        kind: "temporal-initial-values-mismatch", ruleSetId: "23",
        missing: ["a"], unknown: ["b"],
        typeMismatches: [{ name: "c", expectedType: "boolean", actualType: "string" }],
        at: 0,
      };
      const view = renderError(e);
      expect(view.severity).toBe("error");
      expect(view.message).toContain("missing: a");
      expect(view.message).toContain("unknown: b");
      expect(view.message).toContain("c expected boolean, got string");
    });
  });
});
