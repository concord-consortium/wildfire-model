import { categoryExpressions, Engine } from "../engine";
import { walkReferences } from "../engine/walk-references";
import { ruleSets } from "../rule-sets";
import { factorVariables } from "./factor-variables";
import { deriveRangeCc, rangeCcOfExpression } from "./range-cc";
import { simProps } from "./sim-props";
import { temporalVariables } from "./temporal-variables";
import { translate } from "./translate";
import { WildfireDefaults, WildfireReading } from "./types";

// Sam's authored values ("Translating Data Insights into Feedbacks"). Pinned so a
// re-extract that moves a value fails here, with Sam's number on one side and the
// sheet's on the other, rather than silently windowing an activity wrongly.
const SAM_RANGE_CC: Record<string, number> = {
  "23": 1, "24": 0, "25": 1, "32": 1, "33": 1, "34": 1, "35": 1, "42": 1, "45": 2, "47": 2, "54": 1,
};

// Factor variables whose value is a property of the whole session rather than of any
// one run, so they cannot be evaluated against a trailing window.
const RANGE_ZERO_VARS = ["uniqueWindValuesUsed", "uniqueNonZeroWindValuesUsed", "triedAllVegetations"];

function engineFor(id: string): Engine<WildfireReading, WildfireDefaults> {
  return new Engine<WildfireReading, WildfireDefaults>({
    ruleSet: ruleSets[id],
    requestedRuleSetId: id,
    factorVariables,
    simProps,
    temporalVariables,
    translate,
    runStartTriggers: ["SimulationStarted"],
  });
}

describe("rangeCcOfExpression", () => {
  it("scores an occurrence carrying a prop expression 1 and a bare occurrence 0", () => {
    expect(rangeCcOfExpression({ kind: "boolean-leaf", name: "ranSimulation" })).toBe(0);
    expect(rangeCcOfExpression({
      kind: "with", varName: "ranSimulation", propExpr: { kind: "sim-prop-leaf", name: "OneSparkPerZone" },
    })).toBe(1);
  });

  it("preserves its operand under NOT, takes the max under OR and sums under AND", () => {
    const withOcc = {
      kind: "with" as const, varName: "ranSimulation",
      propExpr: { kind: "sim-prop-leaf" as const, name: "OneSparkPerZone" },
    };
    const bare = { kind: "boolean-leaf" as const, name: "setAnyZoneVar" };
    expect(rangeCcOfExpression({ kind: "not", child: withOcc })).toBe(1);
    expect(rangeCcOfExpression({ kind: "or", left: withOcc, right: bare })).toBe(1);
    expect(rangeCcOfExpression({ kind: "and", left: withOcc, right: withOcc })).toBe(2);
    expect(rangeCcOfExpression({ kind: "and", left: withOcc, right: bare })).toBe(1);
  });
});

describe("deriveRangeCc", () => {
  it("reproduces Sam's authored value for every rule set", () => {
    const derived: Record<string, number> = {};
    Object.keys(SAM_RANGE_CC).forEach((id) => {
      derived[id] = deriveRangeCc(categoryExpressions(engineFor(id)));
    });
    expect(derived).toEqual(SAM_RANGE_CC);
  });

  // Sam's rule is that a whole-session factor variable must be read from `best` rather
  // than from the window. Nothing implements that today because no windowed activity
  // uses one; this asserts that stays true.
  it("no windowed rule set references a whole-session factor variable", () => {
    const offenders: string[] = [];
    Object.keys(SAM_RANGE_CC).forEach((id) => {
      const engine = engineFor(id);
      if (deriveRangeCc(categoryExpressions(engine)) === 0) return;
      categoryExpressions(engine).forEach((ast, categoryId) => {
        walkReferences(ast).factorVars.forEach((name) => {
          if (RANGE_ZERO_VARS.includes(name)) {
            offenders.push(`${id} cat ${categoryId}: ${name} must be read from best, not the window`);
          }
        });
      });
    });
    expect(offenders).toEqual([]);
  });
});
