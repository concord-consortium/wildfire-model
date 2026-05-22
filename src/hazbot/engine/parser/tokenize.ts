// Linear-scan tokenizer for the Hazbot DSL.
// Token kinds per requirements.md Req 12 and the spec's Implementation Plan step 2.

export type TokenKind =
  | "IDENT-LOWER" | "IDENT-UPPER"
  | "AND" | "OR" | "NOT" | "WITH"
  | "LPAREN" | "RPAREN"
  | "DOT-SIZE" | "DOT-LENGTH"
  | "EQ" | "NEQ" | "LT" | "LTE" | "GT" | "GTE"
  | "NUMBER" | "EOF";

export interface Token {
  kind: TokenKind;
  text: string;
  start: number;
  end: number;
  // Numeric value if kind === "NUMBER".
  numValue?: number;
}

export class TokenizeError extends Error {
  span: { start: number; end: number };
  offendingText: string;
  constructor(message: string, span: { start: number; end: number }, offendingText: string) {
    super(message);
    this.name = "TokenizeError";
    this.span = span;
    this.offendingText = offendingText;
    Object.setPrototypeOf(this, TokenizeError.prototype);
  }
}

const KEYWORDS: Record<string, TokenKind> = {
  AND: "AND",
  OR: "OR",
  NOT: "NOT",
  WITH: "WITH",
};

const IDENT_RE = /^[A-Za-z][A-Za-z0-9]*/;
// Per Req 12 numeric grammar: `/^\d+$/`. Reject 1.5, -1, 0xff, 1e3 at parse time
// — we tokenize a leading digit run and let the parser surface the form-mismatch
// for any tail (e.g., a `.5` or `e3` immediately after) as a parse error.
const NUMBER_RE = /^\d+/;

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = input.length;
  while (i < len) {
    const ch = input[i];
    // skip whitespace
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") { i++; continue; }
    const start = i;

    if (ch === "(") { tokens.push({ kind: "LPAREN", text: "(", start, end: i + 1 }); i++; continue; }
    if (ch === ")") { tokens.push({ kind: "RPAREN", text: ")", start, end: i + 1 }); i++; continue; }

    if (ch === ".") {
      const dotTail = input.slice(i);
      if (dotTail.startsWith(".size")) {
        tokens.push({ kind: "DOT-SIZE", text: ".size", start, end: i + 5 }); i += 5; continue;
      }
      if (dotTail.startsWith(".length")) {
        tokens.push({ kind: "DOT-LENGTH", text: ".length", start, end: i + 7 }); i += 7; continue;
      }
      throw new TokenizeError(`unexpected '.': expected '.size' or '.length'`, { start, end: i + 1 }, ch);
    }

    if (ch === ">" || ch === "<" || ch === "=" || ch === "!") {
      const next = input[i + 1];
      if (ch === "=" && next === "=") { tokens.push({ kind: "EQ", text: "==", start, end: i + 2 }); i += 2; continue; }
      if (ch === "!" && next === "=") { tokens.push({ kind: "NEQ", text: "!=", start, end: i + 2 }); i += 2; continue; }
      if (ch === ">" && next === "=") { tokens.push({ kind: "GTE", text: ">=", start, end: i + 2 }); i += 2; continue; }
      if (ch === "<" && next === "=") { tokens.push({ kind: "LTE", text: "<=", start, end: i + 2 }); i += 2; continue; }
      if (ch === ">") { tokens.push({ kind: "GT", text: ">", start, end: i + 1 }); i++; continue; }
      if (ch === "<") { tokens.push({ kind: "LT", text: "<", start, end: i + 1 }); i++; continue; }
      throw new TokenizeError(`unexpected character: ${ch}`, { start, end: i + 1 }, ch);
    }

    const tail = input.slice(i);

    const numMatch = NUMBER_RE.exec(tail);
    if (numMatch) {
      const text = numMatch[0];
      const end = i + text.length;
      // Reject any of: trailing `.` (1.5), `e`/`E` exponent, `x`/`X` hex marker,
      // or `.<digit>`. Also catch leading-`-` prefixes earlier (we never enter this branch
      // for a `-` char — there's no UNARY-MINUS token, so `-1` becomes `-` (unknown char) + `1`).
      const nextChar = input[end];
      if (nextChar === "." || nextChar === "e" || nextChar === "E" || nextChar === "x" || nextChar === "X") {
        const wider = /^[0-9.eExX][\w.]*/.exec(tail);
        const wText = wider ? wider[0] : text;
        throw new TokenizeError(
          `expected non-negative decimal integer; got \`${wText}\``,
          { start, end: i + wText.length },
          wText,
        );
      }
      tokens.push({ kind: "NUMBER", text, start, end, numValue: Number(text) });
      i = end;
      continue;
    }

    const identMatch = IDENT_RE.exec(tail);
    if (identMatch) {
      const text = identMatch[0];
      const end = i + text.length;
      const kw = KEYWORDS[text];
      if (kw) {
        tokens.push({ kind: kw, text, start, end });
      } else {
        const isUpper = /^[A-Z]/.test(text);
        tokens.push({ kind: isUpper ? "IDENT-UPPER" : "IDENT-LOWER", text, start, end });
      }
      i = end;
      continue;
    }

    throw new TokenizeError(`unexpected character: ${ch}`, { start, end: i + 1 }, ch);
  }
  tokens.push({ kind: "EOF", text: "", start: len, end: len });
  return tokens;
}
