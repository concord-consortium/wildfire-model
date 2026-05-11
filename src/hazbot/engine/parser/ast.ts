// AST shapes produced by the DSL parser. The discriminated union lets the
// evaluator branch exhaustively per node kind.

export type Operand =
  | { kind: "accessor"; name: string; accessor: ".size" | ".length" }
  | { kind: "literal"; value: number };

export type CompareOp = ">" | "<" | "==" | "!=" | ">=" | "<=";

export type Expression =
  | { kind: "boolean-leaf"; name: string }
  | { kind: "comparison"; op: CompareOp; lhs: Operand; rhs: Operand }
  | { kind: "with"; varName: string; propExpr: Expression }
  | { kind: "and"; left: Expression; right: Expression }
  | { kind: "or"; left: Expression; right: Expression }
  | { kind: "not"; child: Expression }
  | { kind: "sim-prop-leaf"; name: string }
  | { kind: "accessor"; name: string; accessor: ".size" | ".length" }
  | { kind: "literal"; value: number };
