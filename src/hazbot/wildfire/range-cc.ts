import { Expression } from "../engine";

// Sam's `range_cc` derivation ("Translating Data Insights into Feedbacks", last three
// subtabs), restated: range_cc is assigned PER OCCURRENCE, not per variable. An
// occurrence carrying a prop expression (`ranSimulation WITH …`) scores 1 and a bare
// occurrence (`setAnyVar`, `uniqueWindValuesUsed.size > 1`, even a bare `ranSimulation`)
// scores 0; NOT preserves its operand; OR takes the max; AND sums. The activity value is
// the plain numeric max across its categories.
//
// Derived rather than hardcoded so a re-extract that moves a value fails the pin in
// range-cc.test.ts, with Sam's number on one side and the sheet's on the other, instead
// of silently windowing an activity wrongly.
export function rangeCcOfExpression(expr: Expression): number {
  switch (expr.kind) {
    case "with": return 1;
    case "not": return rangeCcOfExpression(expr.child);
    case "or": return Math.max(rangeCcOfExpression(expr.left), rangeCcOfExpression(expr.right));
    case "and": return rangeCcOfExpression(expr.left) + rangeCcOfExpression(expr.right);
    case "boolean-leaf":
    case "accessor":
    case "comparison":
    case "literal":
    case "sim-prop-leaf":
      return 0;
    default: {
      const exhaustive: never = expr;
      throw new Error(`rangeCcOfExpression: unhandled kind ${(exhaustive as { kind: string }).kind}`);
    }
  }
}

// Takes the map `categoryExpressions(engine)` returns: parse failures are already
// dropped, so there is no sentinel to guard against and the substrate's internal
// AST-cache representation stays out of wildfire.
export function deriveRangeCc(exprs: Map<number, Expression>): number {
  let max = 0;
  exprs.forEach((ast) => { max = Math.max(max, rangeCcOfExpression(ast)); });
  return max;
}
