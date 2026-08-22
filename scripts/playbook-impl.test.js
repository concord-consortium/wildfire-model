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

describe("renderPlaybook — the feedback-level lines (WM-46)", () => {
  // A middle category (2), the top category (4) carrying Round content it can never
  // reach, and a repeat-feedback row.
  const withRounds = (repeatFeedback) => {
    const rs = fixtureRuleSet();
    rs.categories[1].feedbackRound2 = "Hazbot: Middle two\n[Show me]";
    rs.categories[1].feedbackRound3 = "Hazbot: Middle three\n[Okay]";
    rs.categories[3].feedbackRound2 = "Hazbot: Top two\n[Okay]";
    rs.categories[3].feedbackRound3 = "Hazbot: Top three\n[Okay]";
    rs.repeatFeedback = repeatFeedback;
    return rs;
  };
  const repeat = { id: 100, studentAction: "Re-clicked", feedback: "Hazbot: Keep going!\n[Got it!]" };

  it("labels a middle category's Round lines as reachable levels", () => {
    const md = renderPlaybook(withRounds(repeat), parse);
    expect(md).toContain("- **Feedback (level 2)**: Hazbot: Middle two [Show me]");
    expect(md).toContain("- **Feedback (level 3)**: Hazbot: Middle three [Okay]");
  });

  it("labels the top category's Round lines 'not shown' and says what supersedes them", () => {
    const md = renderPlaybook(withRounds(repeat), parse);
    expect(md).toContain(
      "- **Feedback (level 2, not shown)**: Hazbot: Top two [Okay] (superseded by the repeat-click line below)");
    expect(md).toContain(
      "- **Feedback (level 3, not shown)**: Hazbot: Top three [Okay] (superseded by the repeat-click line below)");
  });

  it("renders the repeat-click line once, on the top category", () => {
    const md = renderPlaybook(withRounds(repeat), parse);
    expect(md.match(/Feedback \(repeat click after success\)/g)).toHaveLength(1);
    expect(md).toContain(
      "- **Feedback (repeat click after success)**: Hazbot: Keep going! [Got it!]" +
      " (from the sheet's category 100 row, which replaces any Round 2/3 content on this category)");
    // On the top category's own section, after its level-3 line.
    const topSection = md.slice(md.indexOf("### Category 4"));
    expect(topSection).toContain("Feedback (repeat click after success)");
  });

  // The label is gated on the top category alone, matching the selection rule's
  // unconditional early return; only the explanation names the replacement.
  it("still labels the top category 'not shown' without a repeat-feedback row", () => {
    const md = renderPlaybook(withRounds(undefined), parse);
    expect(md).toContain("- **Feedback (level 2, not shown)**: Hazbot: Top two [Okay]" +
      " (the top category's repeat click is served by the rule-set's repeat feedback," +
      " which this rule-set does not carry)");
    expect(md).not.toContain("Feedback (repeat click after success)");
  });

  it("adds only the repeat-click line to a rule-set with no Round content", () => {
    const rs = fixtureRuleSet();
    rs.repeatFeedback = repeat;
    const md = renderPlaybook(rs, parse);
    expect(md).not.toContain("Feedback (level 2");
    expect(md).not.toContain("Feedback (level 3");
    expect(md.match(/Feedback \(repeat click after success\)/g)).toHaveLength(1);
  });
});
