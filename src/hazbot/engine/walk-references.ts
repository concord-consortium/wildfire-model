import { Expression } from "./parser";

// AST walker. Collects the lowercase identifiers (factor variables) and
// uppercase identifiers (sim-props) that the expression references.
export interface References {
  factorVars: Set<string>;
  simProps: Set<string>;
}

export function walkReferences(expr: Expression): References {
  const refs: References = { factorVars: new Set(), simProps: new Set() };
  walk(expr, refs);
  return refs;
}

function walk(expr: Expression, refs: References): void {
  switch (expr.kind) {
    case "boolean-leaf":
      refs.factorVars.add(expr.name);
      return;
    case "comparison":
      // Both operands may be accessors (factor variables) or literals.
      if (expr.lhs.kind === "accessor") refs.factorVars.add(expr.lhs.name);
      if (expr.rhs.kind === "accessor") refs.factorVars.add(expr.rhs.name);
      return;
    case "accessor":
      refs.factorVars.add(expr.name);
      return;
    case "literal":
      return;
    case "with":
      refs.factorVars.add(expr.varName);
      walk(expr.propExpr, refs);
      return;
    case "and":
    case "or":
      walk(expr.left, refs);
      walk(expr.right, refs);
      return;
    case "not":
      walk(expr.child, refs);
      return;
    case "sim-prop-leaf":
      refs.simProps.add(expr.name);
      return;
    default: {
      const _exhaustive: never = expr;
      throw new Error(`walkReferences: unhandled kind ${(_exhaustive as { kind: string }).kind}`);
    }
  }
}
