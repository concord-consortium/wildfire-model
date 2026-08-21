import { parse } from "./parser";
import {
  EvalCtx, evaluateExpr, evaluateLeaf, evaluateWith,
  highestTrueAt, computeMatchedCategoryFloor, computeCurrentCategoryForEngine,
  computeCategorySelectionForEngine, categoryExpressions,
} from "./evaluator";
import { CachedAst, Engine } from "./engine";
import { BaseReading, FactorVariableImpl, RuleSet, SimPropImpl, WindowSelection } from "./types";
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
  return { triggeredBy, at, sessionId: "test", temporalHistory: [] };
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

  // A factor variable may return a *derived* witness that is not an element of
  // engine.readings (wildfire's canonical-run fold clones the run's first-start
  // reading to carry merged tool data). The clone preserves the source `at`, so the
  // WITH leaf's boundReadingIndex must still resolve by timestamp rather than drop to
  // undefined ("Matched on reading #?" in the sidebar).
  it("resolves boundReadingIndex by `at` for a derived (non-identity) witness", () => {
    const r1 = { ...mkReading("SimulationStarted", 10), payload: { hasOneSpark: false } } as TR;
    const r2 = mkReading("SimulationStopped", 20) as TR;
    const r3 = { ...mkReading("SimulationStarted", 30), payload: { hasOneSpark: true } } as TR;
    // Fold r1+r3 into a clone of r1 that carries r3's matching prop — mirrors foldResume.
    const foldedWitness = { ...r1, payload: { hasOneSpark: true } } as TR;
    const foldingFvar: FactorVariableImpl<boolean, TR, TD> = {
      defaultValue: false,
      compute: () => ({ value: true, witnesses: [foldedWitness] }),
    };
    const oneSparkSim: SimPropImpl<TR, TD> = {
      defaultValue: false,
      evaluate: (r) => Boolean((r.payload as { hasOneSpark?: boolean } | undefined)?.hasOneSpark),
    };
    const ctx = makeCtx([r1, r2, r3], { ranSimulation: foldingFvar }, { OneSparkPerZone: oneSparkSim });
    const leaf = evaluateLeaf(parse("ranSimulation WITH OneSparkPerZone"), ctx);
    if (leaf.kind !== "with") throw new Error("expected with node");
    expect(leaf.truth).toBe(true);
    // The clone is not in ctx.readings (indexOf === -1), but its `at` (10) matches r1.
    expect(leaf.boundReadingIndex).toBe(0);
  });
});

describe("evaluator — highestTrueAt + computeMatchedCategoryFloor", () => {
  const ruleSet: RuleSet<TD> = {
    id: "test",
    factorVariables: [],
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

describe("evaluator — readings window (category.current)", () => {
  const toolImpl: FactorVariableImpl<boolean, TR, TD> = {
    defaultValue: false,
    compute: (readings) => {
      const hits = readings.filter((r) => Boolean((r.payload as { tool?: boolean } | undefined)?.tool));
      return { value: hits.length > 0, witnesses: hits };
    },
  };

  const windowRuleSet: RuleSet<TD> = {
    id: "window-test",
    factorVariables: [
      { name: "ranSimulation", definition: "", logEvents: [], details: "" },
      { name: "usedTool", definition: "", logEvents: [], details: "" },
    ],
    categories: [
      { id: 1, studentAction: "", feedback: "", visualFeedback: "", expression: "NOT ranSimulation" },
      { id: 2, studentAction: "", feedback: "", visualFeedback: "", expression: "ranSimulation" },
      { id: 3, studentAction: "", feedback: "", visualFeedback: "", expression: "ranSimulation AND NOT usedTool" },
    ],
  };

  function makeEngine(
    readings: TR[],
    readingsWindow?: (rs: TR[]) => WindowSelection<TR> | null,
  ): Engine<TR, TD> {
    const engine = new Engine<TR, TD>({
      ruleSet: windowRuleSet,
      factorVariables: { ranSimulation: ranSimulationImpl, usedTool: toolImpl },
      simProps: {},
      translate: () => ({ kind: "no-op" }),
      readingsWindow,
    });
    engine.readings = readings;
    return engine;
  }

  // Run 1 used a tool, run 2 did not. The floor over the full history is 2 (cat 3 is
  // false at every prefix once the tool reading is in) while the last-run window,
  // seeing no tool, reaches 3. That pair is `current` above `best`.
  const toolThenClean: TR[] = [
    { ...mkReading("SimulationStarted", 1), payload: { tool: true } } as TR,
    mkReading("SimulationStarted", 2),
  ];
  const lastOne = (rs: TR[]): WindowSelection<TR> => ({ readings: rs.slice(-1) });

  it("returns null when the engine has no selector", () => {
    expect(computeCurrentCategoryForEngine(makeEngine(toolThenClean))).toBeNull();
  });

  it("returns null for an inactive engine even with a selector", () => {
    const engine = new Engine<TR, TD>({
      requestedRuleSetId: "window-test",
      factorVariables: {},
      simProps: {},
      translate: () => ({ kind: "no-op" }),
      readingsWindow: lastOne,
    });
    expect(engine.isActive).toBe(false);
    expect(computeCurrentCategoryForEngine(engine)).toBeNull();
  });

  // A null selection is not an empty window: category 1 is `NOT ranSimulation`, so
  // falling through to an empty-window evaluation would answer 1 here (the case the
  // empty-window test below pins) for a student who has run the simulation twice.
  it("returns null when the selector returns null", () => {
    expect(computeCurrentCategoryForEngine(makeEngine(toolThenClean, () => null))).toBeNull();
  });

  it("returns the highest category true over the slice and passes the label through", () => {
    const engine = makeEngine(toolThenClean, (rs) => ({ readings: rs.slice(-1), label: "last run" }));
    expect(computeCurrentCategoryForEngine(engine)).toEqual({ category: 3, label: "last run" });
  });

  it("does not apply the monotone floor within the window", () => {
    const cleanThenTool: TR[] = [
      mkReading("SimulationStarted", 1),
      { ...mkReading("SimulationStarted", 2), payload: { tool: true } } as TR,
    ];
    const engine = makeEngine(cleanThenTool, (rs) => ({ readings: rs }));
    expect(computeCurrentCategoryForEngine(engine)?.category).toBe(2);
    expect(computeMatchedCategoryFloor(
      windowRuleSet, engine.parsedExpressions,
      (slice) => makeCtx(slice, { ranSimulation: ranSimulationImpl, usedTool: toolImpl }),
      cleanThenTool,
    )).toBe(3);
  });

  it("evaluates the empty-prefix state for an empty window rather than throwing", () => {
    const engine = makeEngine(toolThenClean, () => ({ readings: [] }));
    expect(computeCurrentCategoryForEngine(engine)).toEqual({ category: 1, label: undefined });
  });

  it("computeCategorySelectionForEngine takes `used` from `current` when it is below `best`", () => {
    const engine = makeEngine(toolThenClean, () => ({ readings: [], label: "empty" }));
    expect(computeCategorySelectionForEngine(engine))
      .toEqual({ best: 2, current: 1, used: 1, label: "empty" });
  });

  // The case a min(best, current) revert would break.
  it("computeCategorySelectionForEngine takes `used` from `current` when it is above `best`", () => {
    const engine = makeEngine(toolThenClean, lastOne);
    expect(computeCategorySelectionForEngine(engine))
      .toEqual({ best: 2, current: 3, used: 3, label: undefined });
  });

  it("computeCategorySelectionForEngine falls back to `best` when the selector returns null", () => {
    const engine = makeEngine(toolThenClean, () => null);
    expect(computeCategorySelectionForEngine(engine))
      .toEqual({ best: 2, current: null, used: 2, label: undefined });
  });
});

describe("evaluator — categoryExpressions", () => {
  it("returns the parsed AST per category id and omits parse failures", () => {
    const engine = new Engine<TR, TD>({
      ruleSet: {
        id: "parse-test",
        factorVariables: [{ name: "ranSimulation", definition: "", logEvents: [], details: "" }],
        categories: [
          { id: 1, studentAction: "", feedback: "", visualFeedback: "", expression: "ranSimulation" },
          { id: 2, studentAction: "", feedback: "", visualFeedback: "", expression: "AND OR" },
        ],
      },
      factorVariables: { ranSimulation: ranSimulationImpl },
      simProps: {},
      translate: () => ({ kind: "no-op" }),
    });
    const exprs = categoryExpressions(engine);
    expect(Array.from(exprs.keys())).toEqual([1]);
    expect(exprs.get(1)).toEqual({ kind: "boolean-leaf", name: "ranSimulation" });
  });
});
