/* eslint-disable testing-library/render-result-naming-convention --
 * `renderPlaybook` is a markdown-renderer helper, not React Testing Library's
 * `render()`; the rule misfires on locals capturing its return.
 */
const { renderPlaybook } = require("./playbook-impl");
require("ts-node/register");
const { parse } = require("../src/hazbot/engine/parser");

function fixtureRuleSet() {
  return {
    id: "fixture",
    categories: [
      {
        id: 1, studentAction: "didn't run", feedback: "run it", visualFeedback: "",
        expression: "NOT ranSimulation",
      },
      {
        id: 2, studentAction: "ran", feedback: "good", visualFeedback: "",
        expression: "ranSimulation WITH OneSparkPerZone",
      },
      {
        id: 3, studentAction: "did A and B", feedback: "great", visualFeedback: "",
        expression: "setDroughtLevel AND (NOT usedOneSparkPerZone OR uniqueWindValuesUsed.size > 1)",
      },
      {
        id: 4, studentAction: "complex", feedback: "wow", visualFeedback: "",
        expression: "ranSimulation WITH (UniqueVegetationPerZone AND NOT UniformDroughtLevels)",
      },
    ],
    factorVariables: [
      { name: "ranSimulation", definition: "Sim was started", logEvents: ["SimulationStarted"], details: "" },
      { name: "setDroughtLevel", definition: "Drought changed", logEvents: [], details: "Some details about drought." },
    ],
    defaults: {},
  };
}

describe("renderPlaybook", () => {
  it("includes auto-generated header", () => {
    const md = renderPlaybook(fixtureRuleSet(), parse);
    expect(md.startsWith("> **AUTO-GENERATED")).toBe(true);
  });

  it("renders per-leaf breakdown for boolean factor variables", () => {
    const md = renderPlaybook(fixtureRuleSet(), parse);
    expect(md).toContain("`ranSimulation` is true");
    expect(md).toContain("NOT");
  });

  it("renders comparison-operator leaves with the operator + literal", () => {
    const md = renderPlaybook(fixtureRuleSet(), parse);
    expect(md).toContain("`uniqueWindValuesUsed.size > 1`");
  });

  it("renders WITH sub-expressions as 'exists a <var> reading where:'", () => {
    const md = renderPlaybook(fixtureRuleSet(), parse);
    expect(md).toContain("exists a `ranSimulation` reading where:");
    expect(md).toContain("sim-prop `OneSparkPerZone` is true");
  });

  it("preserves AND/OR/NOT structure in nested expressions", () => {
    const md = renderPlaybook(fixtureRuleSet(), parse);
    // Cat 3 has AND of (setDroughtLevel) and (NOT usedOneSparkPerZone OR ...).
    expect(md).toMatch(/ALL of:[\s\S]+ANY of:[\s\S]+NOT:/);
  });

  it("inlines factor-variable definitions + details from the rule set", () => {
    const md = renderPlaybook(fixtureRuleSet(), parse);
    expect(md).toContain("**ranSimulation** — Sim was started");
    expect(md).toContain("Details: Some details about drought");
  });

  it("renders a parse error gracefully for an unparseable expression", () => {
    const broken = {
      id: "broken",
      categories: [{ id: 1, studentAction: "", feedback: "", visualFeedback: "", expression: "bare @ syntax" }],
      factorVariables: [],
      defaults: {},
    };
    const md = renderPlaybook(broken, parse);
    expect(md).toContain("PARSE ERROR");
  });
});

/* eslint-enable testing-library/render-result-naming-convention */
