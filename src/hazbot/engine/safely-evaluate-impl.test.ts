/* eslint-disable testing-library/render-result-naming-convention --
 * The substrate render-path wrappers `evaluateFactorVarForRender` /
 * `evaluateSimPropForRender` happen to end in "Render", which causes the
 * `testing-library/render-result-naming-convention` lint rule to misfire on
 * any local that captures their return value (it pattern-matches on the
 * function name). React Testing Library's `render()` is unused in this file.
 */
import {
  EngineLite, safelyEvaluateFactorVar, safelyEvaluateSimProp,
  evaluateFactorVarForRender, evaluateSimPropForRender,
} from "./safely-evaluate-impl";
import { BaseReading, EngineError, FactorVariableImpl, SimPropImpl } from "./types";

interface TR extends BaseReading {}
type TD = { wind?: { speed: number } };

function makeEngine(): EngineLite<TR> {
  return { readings: [], errors: [], ruleSet: { id: "test" } };
}

const throwingFactorVar: FactorVariableImpl<boolean, TR, TD> = {
  defaultValue: false,
  compute: () => { throw new Error("boom"); },
};

const throwingSimProp: SimPropImpl<TR, TD> = {
  defaultValue: false,
  evaluate: () => { throw new Error("boom"); },
};

describe("safelyEvaluateFactorVar (consume path)", () => {
  it("appends impl-eval-throw to engine.errors with implKind=factor-variable, no readingIndex", () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    const e = makeEngine();
    const out = safelyEvaluateFactorVar(e, { name: "ranSimulation", impl: throwingFactorVar }, [], { wind: { speed: 0 } });
    expect(out).toEqual({ value: false, witnesses: [] });
    expect(e.errors).toHaveLength(1);
    const err: EngineError = e.errors[0];
    if (err.kind !== "impl-eval-throw") throw new Error("expected impl-eval-throw");
    expect(err.implKind).toBe("factor-variable");
    expect(err.implName).toBe("ranSimulation");
    expect(err.readingIndex).toBeUndefined();
  });

  it("returns the per-impl-kind fallback shape on throw", () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    const setFvar: FactorVariableImpl<Set<string>, TR, TD> = {
      defaultValue: new Set(),
      compute: () => { throw new Error("boom"); },
    };
    const e = makeEngine();
    const r = safelyEvaluateFactorVar(e, { name: "x", impl: setFvar }, [], { wind: { speed: 0 } });
    expect(r.value).toBeInstanceOf(Set);
    expect(r.value.size).toBe(0);
    expect(r.witnesses).toEqual([]);
  });

  it("does not poison subsequent calls (same wrapper, fresh engine state)", () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    const e = makeEngine();
    safelyEvaluateFactorVar(e, { name: "x", impl: throwingFactorVar }, [], {});
    safelyEvaluateFactorVar(e, { name: "x", impl: throwingFactorVar }, [], {});
    expect(e.errors).toHaveLength(2);
  });
});

describe("safelyEvaluateSimProp (consume path)", () => {
  it("appends impl-eval-throw with readingIndex", () => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
    const e = makeEngine();
    const r: TR = { triggeredBy: "SimulationStarted", at: 0, sessionId: "x", updates: [] };
    const result = safelyEvaluateSimProp(e, { name: "S", impl: throwingSimProp }, r, 3, {});
    expect(result).toBe(false);
    if (e.errors[0].kind !== "impl-eval-throw") throw new Error("expected");
    expect(e.errors[0].readingIndex).toBe(3);
    expect(e.errors[0].implKind).toBe("sim-prop");
  });
});

describe("evaluateFactorVarForRender (render path)", () => {
  it("on throw returns fallback WITHOUT mutating engine state", () => {
    const e = makeEngine();
    const computed = evaluateFactorVarForRender(
      { name: "x", impl: throwingFactorVar }, [], { wind: { speed: 0 } }, e.implsWithIncompleteDefaults,
    );
    expect(computed).toEqual({ value: false, witnesses: [] });
    expect(e.errors).toEqual([]);
  });

  it("Branch 1: defaults undefined && impl reads defaults → fallback without calling compute", () => {
    let called = false;
    const fvar: FactorVariableImpl<boolean, TR, TD> = {
      defaultValue: false,
      requiredDefaults: ["wind.speed"],
      compute: () => { called = true; return { value: true, witnesses: [] }; },
    };
    const computed = evaluateFactorVarForRender({ name: "x", impl: fvar }, [], undefined);
    expect(computed).toEqual({ value: false, witnesses: [] });
    expect(called).toBe(false);
  });

  it("Branch 1: defaults undefined && no requiredDefaults → call compute", () => {
    let called = false;
    const fvar: FactorVariableImpl<boolean, TR, TD> = {
      defaultValue: false,
      compute: () => { called = true; return { value: true, witnesses: [] }; },
    };
    const computed = evaluateFactorVarForRender({ name: "x", impl: fvar }, [], undefined);
    expect(computed.value).toBe(true);
    expect(called).toBe(true);
  });

  it("Branch 2: defaults defined && impl in implsWithIncompleteDefaults → fallback", () => {
    let called = false;
    const fvar: FactorVariableImpl<boolean, TR, TD> = {
      defaultValue: false,
      requiredDefaults: ["wind.speed"],
      compute: () => { called = true; return { value: true, witnesses: [] }; },
    };
    const incomplete = new Set<string>(["x"]);
    const computed = evaluateFactorVarForRender({ name: "x", impl: fvar }, [], { wind: { speed: 0 } }, incomplete);
    expect(computed).toEqual({ value: false, witnesses: [] });
    expect(called).toBe(false);
  });

  it("Branch 3: defaults defined && impl complete → call compute normally", () => {
    let called = false;
    const fvar: FactorVariableImpl<boolean, TR, TD> = {
      defaultValue: false,
      requiredDefaults: ["wind.speed"],
      compute: () => { called = true; return { value: true, witnesses: [] }; },
    };
    const computed = evaluateFactorVarForRender({ name: "x", impl: fvar }, [], { wind: { speed: 5 } });
    expect(computed.value).toBe(true);
    expect(called).toBe(true);
  });
});

describe("evaluateSimPropForRender (render path)", () => {
  it("on throw returns the impl's defaultValue WITHOUT mutating engine state", () => {
    const e = makeEngine();
    const reading: TR = { triggeredBy: "X", at: 0, sessionId: "x", updates: [] };
    const computed = evaluateSimPropForRender(
      { name: "S", impl: throwingSimProp }, reading, { wind: { speed: 0 } }, e.implsWithIncompleteDefaults,
    );
    expect(computed).toBe(false);
    expect(e.errors).toEqual([]);
  });
});
/* eslint-enable testing-library/render-result-naming-convention */
