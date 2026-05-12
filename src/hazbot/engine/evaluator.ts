import { BaseReading, FactorVariableImpl, RuleSet, SimPropImpl } from "./types";
import { Expression, Operand } from "./parser";
import { CachedAst, PARSE_ERROR_SENTINEL } from "./engine";
import {
  FactorVarWrap, SimPropWrap,
  evaluateFactorVarForRender, evaluateSimPropForRender,
} from "./safely-evaluate-impl";

// Per-leaf truth tree mirror used by the sidebar's truth-coloring (Req 17).
// Each node carries a `truth` boolean alongside the original AST shape so the
// renderer can color leaves without re-evaluating.
export type LeafTruth =
  | { kind: "boolean-leaf"; name: string; truth: boolean }
  | { kind: "comparison"; op: string; lhs: Operand; rhs: Operand; truth: boolean }
  | {
      kind: "with"; varName: string; propExpr: Expression; truth: boolean;
      boundReading?: BaseReading;
      // Chronological index of boundReading within engine.readings (matches the
      // underlying array shape; Readings panel displays newest-first). Undefined
      // when boundReading is undefined.
      boundReadingIndex?: number;
      candidateEvaluations?: Array<{ reading: BaseReading; propResult: boolean }>;
      // Per-leaf truth tree for the inner propExpr, evaluated against the witness
      // reading (bound reading when WITH matched; latest candidate otherwise). Lets
      // the sidebar color sim-prop leaves inside a WITH the same way it colors
      // outer leaves. Undefined when no witnesses exist (no run-start reading yet).
      propTruth?: PropLeafTruth;
    }
  | { kind: "and"; left: LeafTruth; right: LeafTruth; truth: boolean }
  | { kind: "or"; left: LeafTruth; right: LeafTruth; truth: boolean }
  | { kind: "not"; child: LeafTruth; truth: boolean };

// Per-leaf truth tree for the inner propExpr of a WITH clause. Distinct from
// LeafTruth because the propExpr grammar is narrower — only sim-prop leaves and
// boolean combinators are valid here (per the parser).
export type PropLeafTruth =
  | { kind: "sim-prop-leaf"; name: string; truth: boolean }
  | { kind: "and"; left: PropLeafTruth; right: PropLeafTruth; truth: boolean }
  | { kind: "or"; left: PropLeafTruth; right: PropLeafTruth; truth: boolean }
  | { kind: "not"; child: PropLeafTruth; truth: boolean };

export interface EvalCtx<TR extends BaseReading, TD> {
  readings: TR[];
  defaults: TD | undefined;
  factorVariables: Record<string, FactorVariableImpl<unknown, TR, TD>>;
  simProps: Record<string, SimPropImpl<TR, TD>>;
  // Wrappers — call sites pass safelyEvaluate* (consume) or evaluateForRender (render).
  wrapFactorVar: FactorVarWrap<TR, TD>;
  wrapSimProp: SimPropWrap<TR, TD>;
}

// Render-path ctx builder using `evaluateForRender` and the engine's
// per-impl incomplete-defaults Set (per EXT-7 / EXT-18).
export function makeRenderCtx<TR extends BaseReading, TD>(
  readings: TR[],
  defaults: TD | undefined,
  factorVariables: Record<string, FactorVariableImpl<unknown, TR, TD>>,
  simProps: Record<string, SimPropImpl<TR, TD>>,
  implsWithIncompleteDefaults?: Set<string>,
): EvalCtx<TR, TD> {
  return {
    readings, defaults, factorVariables, simProps,
    wrapFactorVar: (fvar, rs, ds) => evaluateFactorVarForRender(fvar, rs, ds, implsWithIncompleteDefaults),
    wrapSimProp: (sprop, r, ds) => evaluateSimPropForRender(sprop, r, ds, implsWithIncompleteDefaults),
  };
}

// Evaluate an expression to a boolean (short-circuit OK; matching path uses this).
export function evaluateExpr<TR extends BaseReading, TD>(expr: Expression, ctx: EvalCtx<TR, TD>): boolean {
  switch (expr.kind) {
    case "boolean-leaf": {
      const fvar = ctx.factorVariables[expr.name];
      if (!fvar) return false;
      const v = ctx.wrapFactorVar({ name: expr.name, impl: fvar }, ctx.readings, ctx.defaults).value;
      return Boolean(v);
    }
    case "comparison": {
      const lhs = readOperand(expr.lhs, ctx);
      const rhs = readOperand(expr.rhs, ctx);
      return compare(expr.op, lhs, rhs);
    }
    case "and": return evaluateExpr(expr.left, ctx) && evaluateExpr(expr.right, ctx);
    case "or": return evaluateExpr(expr.left, ctx) || evaluateExpr(expr.right, ctx);
    case "not": return !evaluateExpr(expr.child, ctx);
    case "with": return evaluateWith(expr.varName, expr.propExpr, ctx).value;
    case "sim-prop-leaf":
    case "accessor":
    case "literal":
      // These leaves are only valid inside WITH or comparison; reaching them at
      // top level means the AST is malformed (parser bug or hand-constructed AST).
      // Throw rather than silently return false — caller wraps via safelyEvaluate
      // wrappers, so the throw lands in engine.errors as impl-eval-throw rather
      // than escaping into render.
      throw new Error(`evaluateExpr: ${expr.kind} is only valid as a sub-node, not as a top-level expression`);
    default: {
      const _exhaustive: never = expr;
      throw new Error(`evaluateExpr: unhandled ${(_exhaustive as { kind: string }).kind}`);
    }
  }
}

function readOperand<TR extends BaseReading, TD>(op: Operand, ctx: EvalCtx<TR, TD>): unknown {
  if (op.kind === "literal") return op.value;
  // accessor: read factor variable via wrap, then apply .size or .length.
  const fvar = ctx.factorVariables[op.name];
  if (!fvar) return undefined;
  const v = ctx.wrapFactorVar({ name: op.name, impl: fvar }, ctx.readings, ctx.defaults).value;
  if (op.accessor === ".size" && v instanceof Set) return v.size;
  if (op.accessor === ".length" && Array.isArray(v)) return v.length;
  return undefined;
}

function compare(op: string, lhs: unknown, rhs: unknown): boolean {
  if (typeof lhs !== "number" || typeof rhs !== "number") return false;
  switch (op) {
    case "==": return lhs === rhs;
    case "!=": return lhs !== rhs;
    case ">": return lhs > rhs;
    case "<": return lhs < rhs;
    case ">=": return lhs >= rhs;
    case "<=": return lhs <= rhs;
    default: return false;
  }
}

// Per Tech Notes "Evaluator interface extensions" — WITH evaluator iterates over
// witnesses returned by routing the factor-variable compute through the wrap.
export interface WithResult<TR extends BaseReading> {
  value: boolean;
  boundReading?: TR;
  candidateEvaluations: Array<{ reading: TR; propResult: boolean }>;
}

export function evaluateWith<TR extends BaseReading, TD>(
  varName: string, propExpr: Expression, ctx: EvalCtx<TR, TD>,
): WithResult<TR> {
  const fvar = ctx.factorVariables[varName];
  if (!fvar) return { value: false, candidateEvaluations: [] };
  // Route factor-variable compute through wrap (per EXT-13). On throw the wrap
  // returns { value: defaultValue, witnesses: [] } — empty candidates path.
  const wrapped = ctx.wrapFactorVar({ name: varName, impl: fvar }, ctx.readings, ctx.defaults);
  const witnesses = wrapped.witnesses ?? [];
  const candidates: Array<{ reading: TR; propResult: boolean }> = [];
  let bound: TR | undefined;
  for (const w of witnesses) {
    const propResult = evaluatePropExpr(propExpr, w, ctx);
    candidates.push({ reading: w, propResult });
    if (propResult && bound === undefined) bound = w;
  }
  return { value: bound !== undefined, boundReading: bound, candidateEvaluations: candidates };
}

// Within a WITH binding, the propExpr is evaluated against a single witness reading.
// Sim-prop leaves route through wrapSimProp.
function evaluatePropExpr<TR extends BaseReading, TD>(expr: Expression, reading: TR, ctx: EvalCtx<TR, TD>): boolean {
  switch (expr.kind) {
    case "sim-prop-leaf": {
      const sprop = ctx.simProps[expr.name];
      if (!sprop) return false;
      return ctx.wrapSimProp({ name: expr.name, impl: sprop }, reading, ctx.defaults);
    }
    case "and": return evaluatePropExpr(expr.left, reading, ctx) && evaluatePropExpr(expr.right, reading, ctx);
    case "or": return evaluatePropExpr(expr.left, reading, ctx) || evaluatePropExpr(expr.right, reading, ctx);
    case "not": return !evaluatePropExpr(expr.child, reading, ctx);
    // boolean-leaf / comparison / with / accessor / literal are invalid inside a WITH
    // prop expression — the parser rejects them at parse time. Throw rather than
    // silently return false (defensive degradation) so a malformed AST surfaces.
    default:
      throw new Error(`evaluatePropExpr: ${expr.kind} is not valid inside a WITH prop expression`);
  }
}

// Render-path mirror of evaluatePropExpr that produces a PropLeafTruth tree
// (not just a boolean), so the sidebar can color individual sim-prop leaves
// inside a WITH clause. Non-short-circuit — every branch is evaluated.
function evaluatePropLeaf<TR extends BaseReading, TD>(
  expr: Expression, reading: TR, ctx: EvalCtx<TR, TD>,
): PropLeafTruth {
  switch (expr.kind) {
    case "sim-prop-leaf": {
      const sprop = ctx.simProps[expr.name];
      const truth = sprop ? ctx.wrapSimProp({ name: expr.name, impl: sprop }, reading, ctx.defaults) : false;
      return { kind: "sim-prop-leaf", name: expr.name, truth };
    }
    case "and": {
      const left = evaluatePropLeaf(expr.left, reading, ctx);
      const right = evaluatePropLeaf(expr.right, reading, ctx);
      return { kind: "and", left, right, truth: left.truth && right.truth };
    }
    case "or": {
      const left = evaluatePropLeaf(expr.left, reading, ctx);
      const right = evaluatePropLeaf(expr.right, reading, ctx);
      return { kind: "or", left, right, truth: left.truth || right.truth };
    }
    case "not": {
      const child = evaluatePropLeaf(expr.child, reading, ctx);
      return { kind: "not", child, truth: !child.truth };
    }
    default:
      throw new Error(`evaluatePropLeaf: ${expr.kind} is not valid inside a WITH prop expression`);
  }
}

// Non-short-circuit leaf evaluator for the sidebar's truth-coloring.
export function evaluateLeaf<TR extends BaseReading, TD>(expr: Expression, ctx: EvalCtx<TR, TD>): LeafTruth {
  switch (expr.kind) {
    case "boolean-leaf": {
      const truth = evaluateExpr(expr, ctx);
      return { kind: "boolean-leaf", name: expr.name, truth };
    }
    case "comparison": {
      return { kind: "comparison", op: expr.op, lhs: expr.lhs, rhs: expr.rhs, truth: evaluateExpr(expr, ctx) };
    }
    case "with": {
      const result = evaluateWith(expr.varName, expr.propExpr, ctx);
      // Witness reading for per-leaf truth: bound reading when WITH matched, else
      // the most recent candidate (so even a failing WITH shows current sim-prop
      // truths). When no candidates exist (factor variable returned no witnesses),
      // propTruth stays undefined and the renderer falls back to plain text.
      const witness = result.boundReading
        ?? (result.candidateEvaluations.length > 0
          ? result.candidateEvaluations[result.candidateEvaluations.length - 1].reading
          : undefined);
      const propTruth = witness !== undefined
        ? evaluatePropLeaf(expr.propExpr, witness, ctx)
        : undefined;
      const boundReadingIndex = result.boundReading !== undefined
        ? ctx.readings.indexOf(result.boundReading)
        : undefined;
      return {
        kind: "with", varName: expr.varName, propExpr: expr.propExpr,
        truth: result.value, boundReading: result.boundReading,
        boundReadingIndex: boundReadingIndex !== undefined && boundReadingIndex >= 0 ? boundReadingIndex : undefined,
        candidateEvaluations: result.candidateEvaluations,
        propTruth,
      };
    }
    case "and": {
      const left = evaluateLeaf(expr.left, ctx);
      const right = evaluateLeaf(expr.right, ctx);
      return { kind: "and", left, right, truth: left.truth && right.truth };
    }
    case "or": {
      const left = evaluateLeaf(expr.left, ctx);
      const right = evaluateLeaf(expr.right, ctx);
      return { kind: "or", left, right, truth: left.truth || right.truth };
    }
    case "not": {
      const child = evaluateLeaf(expr.child, ctx);
      return { kind: "not", child, truth: !child.truth };
    }
    case "sim-prop-leaf":
    case "accessor":
    case "literal":
      // These leaves are only valid inside WITH or comparison; unreachable in well-formed ASTs.
      return { kind: "boolean-leaf", name: "<invalid>", truth: false };
    default: {
      const _exhaustive: never = expr;
      throw new Error(`evaluateLeaf: unhandled ${(_exhaustive as { kind: string }).kind}`);
    }
  }
}

// One-shot per-state matching evaluator: returns the highest-id category whose
// expression evaluates true, iterating in reverse over the rule set's categories.
export function highestTrueAt<TR extends BaseReading, TD>(
  ruleSet: RuleSet<TD>, parsedExpressions: Map<number, CachedAst>, ctx: EvalCtx<TR, TD>,
): number | null {
  for (let i = ruleSet.categories.length - 1; i >= 0; i--) {
    const category = ruleSet.categories[i];
    const ast = parsedExpressions.get(category.id);
    if (!ast || ast === PARSE_ERROR_SENTINEL) continue;
    if (evaluateExpr(ast, ctx)) return category.id;
  }
  return null;
}

// Monotone floor: max over i of highestTrueAt(readings.slice(0, i+1)),
// including an i=-1 empty-prefix evaluation so categories that fire on the
// "nothing has happened yet" state (e.g., `NOT ranSimulation`) match correctly.
// Rule sets without such categories see `highestTrueAt([])` return null, so the
// empty-prefix iteration is a no-op for them. Per Req 7 / ENG-3.
export function computeMatchedCategoryFloor<TR extends BaseReading, TD>(
  ruleSet: RuleSet<TD>, parsedExpressions: Map<number, CachedAst>,
  ctxBuilder: (readingsSlice: TR[]) => EvalCtx<TR, TD>,
  readings: TR[],
): number | null {
  let floor: number | null = null;
  // Empty-prefix state — covers rule sets whose lowest category fires when
  // no readings have been consumed yet (e.g., the "Did not run the simulation"
  // category that's standard across tabs 23–35).
  const emptyMatch = highestTrueAt(ruleSet, parsedExpressions, ctxBuilder([]));
  if (emptyMatch !== null) floor = emptyMatch;
  for (let i = 0; i < readings.length; i++) {
    const slice = readings.slice(0, i + 1);
    const ctx = ctxBuilder(slice);
    const matched = highestTrueAt(ruleSet, parsedExpressions, ctx);
    if (matched !== null && (floor === null || matched > floor)) floor = matched;
  }
  return floor;
}
