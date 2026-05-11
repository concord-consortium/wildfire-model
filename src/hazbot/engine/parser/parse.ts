import { Expression, Operand } from "./ast";
import { Token, tokenize, TokenizeError } from "./tokenize";

export class ParseError extends Error {
  expression: string;
  tokenSpan: { start: number; end: number };
  offendingToken: string;
  detail: string;
  constructor(args: { expression: string; tokenSpan: { start: number; end: number }; offendingToken: string; detail: string }) {
    super(args.detail);
    this.name = "ParseError";
    this.expression = args.expression;
    this.tokenSpan = args.tokenSpan;
    this.offendingToken = args.offendingToken;
    this.detail = args.detail;
    // Restore prototype chain — ES5 target loses it for Error subclasses.
    Object.setPrototypeOf(this, ParseError.prototype);
  }
}

interface Cursor {
  expression: string;
  tokens: Token[];
  pos: number;
}

function peek(c: Cursor, offset = 0): Token { return c.tokens[c.pos + offset]; }
function advance(c: Cursor): Token { return c.tokens[c.pos++]; }
function expect(c: Cursor, kind: Token["kind"], detail: string): Token {
  const t = peek(c);
  if (t.kind !== kind) {
    throw new ParseError({
      expression: c.expression,
      tokenSpan: { start: t.start, end: t.end },
      offendingToken: t.text,
      detail: `${detail} (got ${t.kind === "EOF" ? "end of expression" : `\`${t.text}\``})`,
    });
  }
  return advance(c);
}

export function parse(expression: string): Expression {
  let tokens: Token[];
  try {
    tokens = tokenize(expression);
  } catch (err) {
    if (err instanceof TokenizeError) {
      throw new ParseError({
        expression,
        tokenSpan: err.span,
        offendingToken: err.offendingText,
        detail: err.message,
      });
    }
    throw err;
  }
  const c: Cursor = { expression, tokens, pos: 0 };
  const expr = parseOr(c);
  const next = peek(c);
  if (next.kind !== "EOF") {
    throw new ParseError({
      expression,
      tokenSpan: { start: next.start, end: next.end },
      offendingToken: next.text,
      detail: `unexpected token \`${next.text}\` after end of expression`,
    });
  }
  return expr;
}

// OR has the lowest precedence; it produces a left-associative tree.
function parseOr(c: Cursor): Expression {
  let left = parseAnd(c);
  while (peek(c).kind === "OR") {
    advance(c);
    const right = parseAnd(c);
    left = { kind: "or", left, right };
  }
  return left;
}

function parseAnd(c: Cursor): Expression {
  let left = parseNot(c);
  while (peek(c).kind === "AND") {
    advance(c);
    const right = parseNot(c);
    left = { kind: "and", left, right };
  }
  return left;
}

function parseNot(c: Cursor): Expression {
  if (peek(c).kind === "NOT") {
    advance(c);
    const child = parseNot(c);
    return { kind: "not", child };
  }
  return parseComparisonOrPrimary(c);
}

// Either a comparison (operand op operand) or a higher-precedence primary.
// Required by Req 12: comparison operands must be `.size`/`.length` accessors or numeric literals.
function parseComparisonOrPrimary(c: Cursor): Expression {
  const startTok = peek(c);

  // If we're looking at an operand-only token (NUMBER, or IDENT-LOWER followed by .size/.length),
  // parse it as an operand and require a comparison to follow.
  // Otherwise fall back to parsePrimary (which handles parens, WITH, sim-props, plain identifiers).
  if (startTok.kind === "NUMBER") {
    const lhs = parseOperand(c);
    return parseComparisonTail(c, lhs, startTok);
  }
  if (startTok.kind === "IDENT-LOWER" &&
      (peek(c, 1).kind === "DOT-SIZE" || peek(c, 1).kind === "DOT-LENGTH")) {
    const lhs = parseOperand(c);
    return parseComparisonTail(c, lhs, startTok);
  }

  const expr = parsePrimary(c);
  // If a comparison operator follows a non-operand expression, that's a form mismatch.
  const after = peek(c);
  if (compareOp(after.kind)) {
    // Build the offending-form description from the parsed expression's shape.
    const formDesc = describeExpressionForm(expr) ?? `\`${startTok.text}\``;
    throw new ParseError({
      expression: c.expression,
      tokenSpan: { start: startTok.start, end: after.end },
      offendingToken: startTok.text || after.text,
      detail: `expected \`.size\` / \`.length\` / numeric literal; got bare identifier ${formDesc} on LHS of comparison`,
    });
  }
  return expr;
}

function describeExpressionForm(expr: Expression): string | null {
  if (expr.kind === "boolean-leaf") return `\`${expr.name}\``;
  if (expr.kind === "and" || expr.kind === "or" || expr.kind === "not") return `parenthesized logical expression`;
  if (expr.kind === "with") return `WITH expression`;
  return null;
}

function parseComparisonTail(c: Cursor, lhs: Operand, startTok: Token): Expression {
  const opTok = peek(c);
  const op = compareOp(opTok.kind);
  if (!op) {
    throw new ParseError({
      expression: c.expression,
      tokenSpan: { start: startTok.start, end: opTok.end },
      offendingToken: opTok.text || startTok.text,
      detail: `expected comparison operator after operand`,
    });
  }
  advance(c);
  const rhs = parseOperand(c);
  return { kind: "comparison", op, lhs, rhs };
}

function compareOp(kind: Token["kind"]): "==" | "!=" | ">" | "<" | ">=" | "<=" | null {
  switch (kind) {
    case "EQ": return "==";
    case "NEQ": return "!=";
    case "GT": return ">";
    case "LT": return "<";
    case "GTE": return ">=";
    case "LTE": return "<=";
    default: return null;
  }
}

function parseOperand(c: Cursor): Operand {
  const tok = peek(c);
  if (tok.kind === "NUMBER") {
    advance(c);
    return { kind: "literal", value: tok.numValue ?? Number(tok.text) };
  }
  if (tok.kind === "IDENT-LOWER") {
    advance(c);
    const acc = peek(c);
    if (acc.kind === "DOT-SIZE") {
      advance(c);
      return { kind: "accessor", name: tok.text, accessor: ".size" };
    }
    if (acc.kind === "DOT-LENGTH") {
      advance(c);
      return { kind: "accessor", name: tok.text, accessor: ".length" };
    }
    throw new ParseError({
      expression: c.expression,
      tokenSpan: { start: tok.start, end: tok.end },
      offendingToken: tok.text,
      detail: `expected \`.size\` / \`.length\` / numeric literal; got bare identifier \`${tok.text}\` in operand position`,
    });
  }
  throw new ParseError({
    expression: c.expression,
    tokenSpan: { start: tok.start, end: tok.end },
    offendingToken: tok.text,
    detail: `expected \`.size\` / \`.length\` / numeric literal; got \`${tok.text}\``,
  });
}

function parsePrimary(c: Cursor): Expression {
  const tok = peek(c);

  if (tok.kind === "LPAREN") {
    advance(c);
    const inner = parseOr(c);
    expect(c, "RPAREN", "expected `)`");
    return inner;
  }

  if (tok.kind === "IDENT-LOWER") {
    // factor variable name. Lookahead: WITH means `varName WITH propExpr`.
    if (peek(c, 1).kind === "WITH") {
      advance(c); // varName
      const varName = tok.text;
      advance(c); // WITH
      // Parens override the greedy rule's *delimitation* (the WITH ends at the close paren),
      // but the content inside is still a prop expression (sim-props + AND/OR/NOT/parens).
      let propExpr: Expression;
      if (peek(c).kind === "LPAREN") {
        advance(c);
        propExpr = parsePropExpression(c);
        expect(c, "RPAREN", "expected `)` to close WITH prop expression");
      } else {
        propExpr = parsePropExpression(c);
      }
      return { kind: "with", varName, propExpr };
    }
    // Bare boolean leaf factor variable.
    advance(c);
    return { kind: "boolean-leaf", name: tok.text };
  }

  if (tok.kind === "IDENT-UPPER") {
    // Sim-props are only reachable via parsePropExpression (the WITH body parser).
    // If parsePrimary sees one, it's by definition outside a WITH context.
    throw new ParseError({
      expression: c.expression,
      tokenSpan: { start: tok.start, end: tok.end },
      offendingToken: tok.text,
      detail: `expected \`WITH\` binding for sim-prop \`${tok.text}\``,
    });
  }

  throw new ParseError({
    expression: c.expression,
    tokenSpan: { start: tok.start, end: tok.end },
    offendingToken: tok.text,
    detail: `unexpected token \`${tok.text || "end of expression"}\``,
  });
}

// Greedy WITH prop expression. Accepts ONLY sim-prop-related tokens (sim-props, AND/OR/NOT,
// parens). The moment a lowercase identifier or any non-prop-expression token appears, the
// prop expression terminates so the outer parser resumes — that's the README's "greedy" rule.
function parsePropExpression(c: Cursor): Expression {
  return parsePropOr(c);
}
function parsePropOr(c: Cursor): Expression {
  let left = parsePropAnd(c);
  while (peek(c).kind === "OR") {
    if (!isPropExprStart(peek(c, 1).kind)) break;
    advance(c);
    const right = parsePropAnd(c);
    left = { kind: "or", left, right };
  }
  return left;
}
function parsePropAnd(c: Cursor): Expression {
  let left = parsePropNot(c);
  while (peek(c).kind === "AND") {
    if (!isPropExprStart(peek(c, 1).kind)) break;
    advance(c);
    const right = parsePropNot(c);
    left = { kind: "and", left, right };
  }
  return left;
}
function parsePropNot(c: Cursor): Expression {
  if (peek(c).kind === "NOT") {
    advance(c);
    const child = parsePropNot(c);
    return { kind: "not", child };
  }
  return parsePropPrimary(c);
}
function parsePropPrimary(c: Cursor): Expression {
  const tok = peek(c);
  if (tok.kind === "LPAREN") {
    advance(c);
    const inner = parsePropExpression(c);
    expect(c, "RPAREN", "expected `)` in prop expression");
    return inner;
  }
  if (tok.kind === "IDENT-UPPER") {
    advance(c);
    return { kind: "sim-prop-leaf", name: tok.text };
  }
  throw new ParseError({
    expression: c.expression,
    tokenSpan: { start: tok.start, end: tok.end },
    offendingToken: tok.text,
    detail: `expected sim-prop identifier in WITH prop expression; got \`${tok.text || "end of expression"}\``,
  });
}
function isPropExprStart(kind: Token["kind"]): boolean {
  return kind === "IDENT-UPPER" || kind === "NOT" || kind === "LPAREN";
}
