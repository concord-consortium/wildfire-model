import { parse, ParseError } from "./index";
import { Expression } from "./ast";

function ok(expr: string): Expression { return parse(expr); }
function fail(expr: string): ParseError {
  try {
    parse(expr);
  } catch (e) {
    if (e instanceof ParseError) return e;
    throw e;
  }
  throw new Error(`expected parse to fail for: ${expr}`);
}

describe("parser — boolean leaves", () => {
  it("parses a single boolean leaf", () => {
    expect(ok("ranSimulation")).toEqual({ kind: "boolean-leaf", name: "ranSimulation" });
  });
});

describe("parser — operators and precedence", () => {
  it("parses NOT", () => {
    expect(ok("NOT ranSimulation")).toEqual({
      kind: "not", child: { kind: "boolean-leaf", name: "ranSimulation" },
    });
  });

  it("parses AND left-associatively", () => {
    expect(ok("a AND b AND c")).toEqual({
      kind: "and",
      left: {
        kind: "and",
        left: { kind: "boolean-leaf", name: "a" },
        right: { kind: "boolean-leaf", name: "b" },
      },
      right: { kind: "boolean-leaf", name: "c" },
    });
  });

  it("parses OR left-associatively", () => {
    expect(ok("a OR b OR c")).toEqual({
      kind: "or",
      left: {
        kind: "or",
        left: { kind: "boolean-leaf", name: "a" },
        right: { kind: "boolean-leaf", name: "b" },
      },
      right: { kind: "boolean-leaf", name: "c" },
    });
  });

  it("AND binds tighter than OR (precedence)", () => {
    // `a OR b AND c` parses as `a OR (b AND c)`
    expect(ok("a OR b AND c")).toEqual({
      kind: "or",
      left: { kind: "boolean-leaf", name: "a" },
      right: {
        kind: "and",
        left: { kind: "boolean-leaf", name: "b" },
        right: { kind: "boolean-leaf", name: "c" },
      },
    });
  });

  it("NOT binds tighter than AND", () => {
    expect(ok("NOT a AND b")).toEqual({
      kind: "and",
      left: { kind: "not", child: { kind: "boolean-leaf", name: "a" } },
      right: { kind: "boolean-leaf", name: "b" },
    });
  });

  it("parens override precedence", () => {
    // `(a OR b) AND c`
    expect(ok("(a OR b) AND c")).toEqual({
      kind: "and",
      left: { kind: "or", left: { kind: "boolean-leaf", name: "a" }, right: { kind: "boolean-leaf", name: "b" } },
      right: { kind: "boolean-leaf", name: "c" },
    });
  });
});

describe("parser — comparison operators", () => {
  it("parses .size > literal", () => {
    expect(ok("uniqueWindValuesUsed.size > 1")).toEqual({
      kind: "comparison", op: ">",
      lhs: { kind: "accessor", name: "uniqueWindValuesUsed", accessor: ".size" },
      rhs: { kind: "literal", value: 1 },
    });
  });

  it("parses .length == literal", () => {
    expect(ok("simulationRuns.length == 0")).toEqual({
      kind: "comparison", op: "==",
      lhs: { kind: "accessor", name: "simulationRuns", accessor: ".length" },
      rhs: { kind: "literal", value: 0 },
    });
  });

  it("parses each comparison operator", () => {
    for (const [op, expected] of [["==", "=="], ["!=", "!="], [">", ">"], ["<", "<"], [">=", ">="], ["<=", "<="]] as const) {
      const e = ok(`runs.length ${op} 1`) as { kind: "comparison"; op: string };
      expect(e.op).toBe(expected);
    }
  });

  it("rejects bare identifier on either side of comparison", () => {
    const e = fail("ranSimulation > 1");
    expect(e.detail).toMatch(/expected.*\.size.*\.length.*numeric.*bare identifier `ranSimulation`/);
  });

  it("rejects parenthesized logical expression as comparison operand", () => {
    expect(() => parse("(a AND b) > 1")).toThrow(ParseError);
  });
});

describe("parser — numeric literal grammar", () => {
  it("accepts 0, 1, 42", () => {
    expect((ok("uniqueWindValuesUsed.size == 0") as { rhs: { value: number } }).rhs.value).toBe(0);
    expect((ok("uniqueWindValuesUsed.size == 1") as { rhs: { value: number } }).rhs.value).toBe(1);
    expect((ok("uniqueWindValuesUsed.size == 42") as { rhs: { value: number } }).rhs.value).toBe(42);
  });

  it("rejects 1.5", () => {
    const e = fail("uniqueWindValuesUsed.size == 1.5");
    expect(e.detail).toMatch(/expected non-negative decimal integer.*1.5/);
  });

  it("rejects -1 (no unary minus)", () => {
    expect(() => parse("uniqueWindValuesUsed.size == -1")).toThrow(ParseError);
  });

  it("rejects 0xff (hex)", () => {
    const e = fail("uniqueWindValuesUsed.size == 0xff");
    expect(e.detail).toMatch(/expected non-negative decimal integer.*0xff/);
  });

  it("rejects 1e3 (scientific)", () => {
    const e = fail("uniqueWindValuesUsed.size == 1e3");
    expect(e.detail).toMatch(/expected non-negative decimal integer.*1e3/);
  });
});

describe("parser — WITH binding", () => {
  it("parses simple WITH (sim-prop)", () => {
    expect(ok("ranSimulation WITH OneSparkPerZone")).toEqual({
      kind: "with",
      varName: "ranSimulation",
      propExpr: { kind: "sim-prop-leaf", name: "OneSparkPerZone" },
    });
  });

  it("greedy WITH consumes a chained AND of sim-props", () => {
    // Per README: `varName WITH PropA AND PropB` parses with both sim-props inside the WITH.
    const e = ok("ranSimulation WITH UniqueVegetationPerZone AND NOT UniformDroughtLevels");
    expect(e).toEqual({
      kind: "with",
      varName: "ranSimulation",
      propExpr: {
        kind: "and",
        left: { kind: "sim-prop-leaf", name: "UniqueVegetationPerZone" },
        right: { kind: "not", child: { kind: "sim-prop-leaf", name: "UniformDroughtLevels" } },
      },
    });
  });

  it("greedy WITH terminates at a lowercase identifier (next factor variable)", () => {
    // `varName WITH UniqueX AND otherVar` → WITH binds only `UniqueX`; outer AND takes `otherVar`.
    const e = ok("ranSimulation WITH OneSparkPerZone AND setDroughtLevel");
    expect(e).toEqual({
      kind: "and",
      left: { kind: "with", varName: "ranSimulation", propExpr: { kind: "sim-prop-leaf", name: "OneSparkPerZone" } },
      right: { kind: "boolean-leaf", name: "setDroughtLevel" },
    });
  });

  it("parens inside WITH override greedy", () => {
    // `varName WITH (OneSparkPerZone) AND OtherVar` — outer AND takes the bare lowercase `OtherVar`.
    const e = ok("ranSimulation WITH (OneSparkPerZone) AND setDroughtLevel");
    expect(e).toEqual({
      kind: "and",
      left: { kind: "with", varName: "ranSimulation", propExpr: { kind: "sim-prop-leaf", name: "OneSparkPerZone" } },
      right: { kind: "boolean-leaf", name: "setDroughtLevel" },
    });
  });

  it("WITH with parenthesized OR of sim-props", () => {
    const e = ok("ranSimulation WITH (OneSparkPerZone OR TwoSparks)");
    expect(e).toEqual({
      kind: "with", varName: "ranSimulation",
      propExpr: {
        kind: "or",
        left: { kind: "sim-prop-leaf", name: "OneSparkPerZone" },
        right: { kind: "sim-prop-leaf", name: "TwoSparks" },
      },
    });
  });

  it("README worked example (a) — `varName WITH (UniqueX) AND ...`", () => {
    const e = ok("ranSimulation WITH (UniqueVegetationPerZone) AND ranSimulation WITH NOT UniformDroughtLevels");
    expect(e.kind).toBe("and");
  });

  it("rejects lowercase identifiers inside WITH parens", () => {
    const e = fail("ranSimulation WITH (otherFactorVariable)");
    expect(e.detail).toMatch(/sim-prop/);
  });

  it("rejects a comparison expression inside WITH parens", () => {
    expect(() => parse("ranSimulation WITH (uniqueWindValuesUsed.size > 1)")).toThrow(ParseError);
  });

  it("emits a sensible error for trailing AND inside WITH prop expression", () => {
    expect(() => parse("ranSimulation WITH OneSparkPerZone AND")).toThrow(ParseError);
  });
});

describe("parser — bare sim-props", () => {
  it("rejects bare sim-prop at top level", () => {
    const e = fail("OneSparkPerZone");
    expect(e.detail).toMatch(/expected.*WITH.*OneSparkPerZone/);
  });

  it("rejects bare sim-prop inside AND outside WITH", () => {
    const e = fail("OneSparkPerZone AND ranSimulation");
    expect(e.detail).toMatch(/expected.*WITH.*OneSparkPerZone/);
  });
});

describe("parser — error reporting", () => {
  it("reports unbalanced parens", () => {
    expect(() => parse("(ranSimulation")).toThrow(ParseError);
  });

  it("reports trailing tokens", () => {
    expect(() => parse("ranSimulation foo")).toThrow(ParseError);
  });

  it("includes tokenSpan and offendingToken on errors", () => {
    const e = fail("ranSimulation > 1");
    expect(e.tokenSpan).toEqual(expect.objectContaining({ start: expect.any(Number), end: expect.any(Number) }));
    expect(e.offendingToken).toBe("ranSimulation");
    expect(e.expression).toBe("ranSimulation > 1");
  });

  it("reports unexpected character", () => {
    const e = fail("ranSimulation @ foo");
    expect(e.detail).toMatch(/unexpected character.*@/);
  });
});

describe("parser — full expressions from sheets", () => {
  it("parses tab 23 cat 1: ranSimulation", () => {
    expect(ok("ranSimulation")).toEqual({ kind: "boolean-leaf", name: "ranSimulation" });
  });

  it("parses tab 24 cat 1: NOT (uniqueWindValuesUsed.size > 1)", () => {
    expect(ok("NOT (uniqueWindValuesUsed.size > 1)")).toEqual({
      kind: "not",
      child: {
        kind: "comparison", op: ">",
        lhs: { kind: "accessor", name: "uniqueWindValuesUsed", accessor: ".size" },
        rhs: { kind: "literal", value: 1 },
      },
    });
  });

  it("parses tab 25 cat 2: setDroughtLevel AND NOT usedOneSparkPerZone", () => {
    expect(ok("setDroughtLevel AND NOT usedOneSparkPerZone")).toEqual({
      kind: "and",
      left: { kind: "boolean-leaf", name: "setDroughtLevel" },
      right: { kind: "not", child: { kind: "boolean-leaf", name: "usedOneSparkPerZone" } },
    });
  });
});
