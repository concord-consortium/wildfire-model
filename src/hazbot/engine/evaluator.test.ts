import { parse } from "./parser";
import {
  EvalCtx, evaluateExpr, evaluateLeaf, evaluateWith,
  highestTrueAt, computeMatchedCategoryFloor,
} from "./evaluator";
import { CachedAst } from "./engine";
import { BaseReading, FactorVariableImpl, RuleSet, SimPropImpl } from "./types";
import {
  evaluateFactorVarForRender, evaluateSimPropForRender,
} from "./safely-evaluate-impl";

interface TR extends BaseReading { payload?: Record<string, unknown> }
type TD = unknown;

function makeCtx(
  readings: TR[],
  factorVariables: Record<string, FactorVariableImpl<unknown, TR, TD>>,
  simProps: Record<string, SimPropImpl<TR, TD>> = {},
): EvalCtx<TR, TD> {
  return {
    readings,
    defaults: undefined,
    factorVariables,
    simProps,
    wrapFactorVar: (fvar, rs, ds) => evaluateFactorVarForRender(fvar, rs, ds),
    wrapSimProp: (sprop, r, ds) => evaluateSimPropForRender(sprop, r, ds),
  };
}

function mkReading(triggeredBy: string, at: number): TR {
  return { triggeredBy, at, sessionId: "test", updates: [] };
}

const ranSimulationImpl: FactorVariableImpl<boolean, TR, TD> = {
  defaultValue: false,
  compute: (readings) => {
    const sims = readings.filter((r) => r.triggeredBy === "SimulationStarted");
    return { value: sims.length > 0, witnesses: sims };
  },
};

describe("evaluator — boolean leaves", () => {
  it("evaluates a true boolean leaf", () => {
    const ctx = makeCtx([mkReading("SimulationStarted", 1)], { ranSimulation: ranSimulationImpl });
    expect(evaluateExpr(parse("ranSimulation"), ctx)).toBe(true);
  });

  it("evaluates a false boolean leaf when readings are empty", () => {
    const ctx = makeCtx([], { ranSimulation: ranSimulationImpl });
    expect(evaluateExpr(parse("ranSimulation"), ctx)).toBe(false);
  });

  it("AND/OR/NOT compose correctly", () => {
    const ctx = makeCtx([mkReading("SimulationStarted", 1)], {
      ranSimulation: ranSimulationImpl,
      otherFactor: { defaultValue: false, compute: () => ({ value: false, witnesses: [] }) },
    });
    expect(evaluateExpr(parse("ranSimulation AND NOT otherFactor"), ctx)).toBe(true);
    expect(evaluateExpr(parse("otherFactor OR ranSimulation"), ctx)).toBe(true);
    expect(evaluateExpr(parse("ranSimulation AND otherFactor"), ctx)).toBe(false);
  });
});

describe("evaluator — comparisons", () => {
  const setImpl: FactorVariableImpl<Set<string>, TR, TD> = {
    defaultValue: new Set(),
    compute: (readings) => ({ value: new Set(readings.map((r) => r.triggeredBy)), witnesses: readings }),
  };
  const arrImpl: FactorVariableImpl<TR[], TR, TD> = {
    defaultValue: [],
    compute: (readings) => ({ value: readings, witnesses: readings }),
  };
  const ctx = (readings: TR[]) => makeCtx(readings, { uniqueWindValuesUsed: setImpl, simulationRuns: arrImpl });

  it("evaluates .size > literal", () => {
    expect(evaluateExpr(parse("uniqueWindValuesUsed.size > 1"),
      ctx([mkReading("A", 1), mkReading("B", 2)]))).toBe(true);
    expect(evaluateExpr(parse("uniqueWindValuesUsed.size > 1"),
      ctx([mkReading("A", 1)]))).toBe(false);
  });

  it("evaluates .length comparisons", () => {
    expect(evaluateExpr(parse("simulationRuns.length == 0"), ctx([]))).toBe(true);
    expect(evaluateExpr(parse("simulationRuns.length >= 1"), ctx([mkReading("X", 1)]))).toBe(true);
  });
});

describe("evaluator — WITH binding", () => {
  const oneSparkSim: SimPropImpl<TR, TD> = {
    defaultValue: false,
    evaluate: (r) => Boolean((r.payload as { hasOneSpark?: boolean } | undefined)?.hasOneSpark),
  };

  it("evaluates true when at least one witness satisfies the prop", () => {
    const r1 = { ...mkReading("SimulationStarted", 1), payload: { hasOneSpark: true } } as TR;
    const r2 = { ...mkReading("SimulationStarted", 2), payload: { hasOneSpark: false } } as TR;
    const ctx = makeCtx([r1, r2], { ranSimulation: ranSimulationImpl }, { OneSparkPerZone: oneSparkSim });
    const ast = parse("ranSimulation WITH OneSparkPerZone");
    if (ast.kind !== "with") throw new Error("expected with-expression");
    const result = evaluateWith("ranSimulation", ast.propExpr, ctx);
    expect(result.value).toBe(true);
    expect(result.boundReading?.at).toBe(1);
    expect(result.candidateEvaluations).toHaveLength(2);
  });

  it("evaluates false with empty witnesses (no SimulationStarted readings yet)", () => {
    const ctx = makeCtx([], { ranSimulation: ranSimulationImpl }, { OneSparkPerZone: oneSparkSim });
    const result = evaluateWith("ranSimulation", { kind: "sim-prop-leaf", name: "OneSparkPerZone" }, ctx);
    expect(result.value).toBe(false);
    expect(result.candidateEvaluations).toEqual([]);
  });

  it("returns empty candidates when factor variable throws (wrapped → empty witnesses)", () => {
    const throwingFvar: FactorVariableImpl<boolean, TR, TD> = {
      defaultValue: false,
      compute: () => { throw new Error("boom"); },
    };
    const ctx = makeCtx([mkReading("SimulationStarted", 1)], { ranSimulation: throwingFvar }, { OneSparkPerZone: oneSparkSim });
    const result = evaluateWith("ranSimulation", { kind: "sim-prop-leaf", name: "OneSparkPerZone" }, ctx);
    expect(result.value).toBe(false);
    expect(result.candidateEvaluations).toEqual([]);
  });
});

describe("evaluator — leaf evaluator (non-short-circuit)", () => {
  it("attaches truth value to every leaf", () => {
    const ctx = makeCtx([mkReading("SimulationStarted", 1)], {
      ranSimulation: ranSimulationImpl,
      otherFactor: { defaultValue: false, compute: () => ({ value: false, witnesses: [] }) },
    });
    const leaf = evaluateLeaf(parse("ranSimulation AND otherFactor"), ctx);
    if (leaf.kind !== "and") throw new Error("expected and node");
    expect(leaf.truth).toBe(false);
    expect(leaf.left.truth).toBe(true);
    expect(leaf.right.truth).toBe(false);
  });
});

describe("evaluator — highestTrueAt + computeMatchedCategoryFloor", () => {
  const ruleSet: RuleSet<TD> = {
    id: "test",
    factorVariables: [],
    defaults: {},
    categories: [
      { id: 1, studentAction: "", feedback: "", visualFeedback: "", expression: "ranSimulation" },
      { id: 2, studentAction: "", feedback: "", visualFeedback: "", expression: "setDroughtLevel AND NOT usedOneSparkPerZone" },
    ],
  };

  function asts(): Map<number, CachedAst> {
    const m = new Map<number, CachedAst>();
    m.set(1, parse("ranSimulation"));
    m.set(2, parse("setDroughtLevel AND NOT usedOneSparkPerZone"));
    return m;
  }

  function buildCtx(readings: TR[]): EvalCtx<TR, TD> {
    const setDroughtLevelImpl: FactorVariableImpl<boolean, TR, TD> = {
      defaultValue: false,
      compute: (rs) => ({ value: rs.length >= 1, witnesses: rs }),
    };
    const usedOneSparkPerZoneImpl: FactorVariableImpl<boolean, TR, TD> = {
      defaultValue: false,
      compute: (rs) => ({ value: rs.length >= 3, witnesses: rs }),
    };
    return makeCtx(readings, {
      ranSimulation: ranSimulationImpl,
      setDroughtLevel: setDroughtLevelImpl,
      usedOneSparkPerZone: usedOneSparkPerZoneImpl,
    });
  }

  it("highestTrueAt picks the highest true category", () => {
    const ctx = buildCtx([mkReading("SimulationStarted", 1)]);
    expect(highestTrueAt(ruleSet, asts(), ctx)).toBe(2);
  });

  it("highestTrueAt returns null when nothing matches", () => {
    const ctx = buildCtx([]);
    expect(highestTrueAt(ruleSet, asts(), ctx)).toBeNull();
  });

  it("computeMatchedCategoryFloor preserves the floor across non-monotone expression transitions", () => {
    // After 1 reading: cat 2 matches (setDroughtLevel=true, usedOneSparkPerZone=false). Floor: 2.
    // After 3 readings: usedOneSparkPerZone flips true → cat 2 false, but cat 1 still true. Per-state highest is 1, but the FLOOR stays at 2.
    const readings: TR[] = [
      mkReading("SimulationStarted", 1),
      mkReading("SimulationStarted", 2),
      mkReading("SimulationStarted", 3),
    ];
    const floor = computeMatchedCategoryFloor(ruleSet, asts(), buildCtx, readings);
    expect(floor).toBe(2);
  });
});
