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

    it("renders missing-defaults", () => {
      const e: EngineError = {
        kind: "load-failure", reason: "missing-defaults", ruleSetId: "23", detail: "zones[1].terrainType is undefined", at: 0,
      };
      expect(renderError(e)).toEqual({
        severity: "error",
        message: "Missing defaults: 23 · zones[1].terrainType is undefined",
      });
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

  it("renders ambient-validation", () => {
    const e: EngineError = {
      kind: "ambient-validation", ruleSetId: "23", trigger: "SimulationStarted", implName: "GraphOpen",
      missingKey: "chartTabOpenAtStart", event: { name: "SimulationStarted", at: 0 }, at: 0,
    };
    expect(renderError(e)).toEqual({
      severity: "error",
      message: "Missing ambient state for SimulationStarted: GraphOpen reads chartTabOpenAtStart",
    });
  });

  describe("orphan-modifier", () => {
    it("renders no-prior-trigger", () => {
      const e: EngineError = {
        kind: "orphan-modifier", source: "ChartTabShown", reason: "no-prior-trigger",
        event: { name: "ChartTabShown", at: 0 }, at: 0,
      };
      expect(renderError(e)).toEqual({
        severity: "error",
        message: "Modifier ChartTabShown dropped: no trigger has fired yet",
      });
    });

    it("renders prior-trigger-failed", () => {
      const e: EngineError = {
        kind: "orphan-modifier", source: "ChartTabShown", reason: "prior-trigger-failed",
        event: { name: "ChartTabShown", at: 0 }, at: 0,
      };
      expect(renderError(e)).toEqual({
        severity: "error",
        message: "Modifier ChartTabShown dropped: prior trigger failed validation",
      });
    });

    it("renders between-runs", () => {
      const e: EngineError = {
        kind: "orphan-modifier", source: "ChartTabShown", reason: "between-runs",
        event: { name: "ChartTabShown", at: 0 }, at: 0,
      };
      expect(renderError(e)).toEqual({
        severity: "error",
        message: "Modifier ChartTabShown dropped: no run currently in progress",
      });
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
});
