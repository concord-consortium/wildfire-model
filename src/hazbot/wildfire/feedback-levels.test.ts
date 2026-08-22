import { selectFeedback } from "./feedback-levels";
import { RuleSet } from "../engine";
import { WildfireDefaults } from "./types";

const cat = (id: number, feedback: string, round2?: string, round3?: string) => ({
  id, studentAction: "", feedback, feedbackRound2: round2, feedbackRound3: round3,
  visualFeedback: "", expression: "x",
});

const ruleSet = (
  categories: ReturnType<typeof cat>[],
  repeatFeedback?: { id: number; studentAction: string; feedback: string },
): RuleSet<WildfireDefaults> => ({ id: "23", categories, factorVariables: [], repeatFeedback });

// Every fixture below carries a higher-id filler category: the HIGHEST id is the top
// category, whose ladder is level 1 plus the rule-set's repeat feedback and nothing else,
// so a lone category under test would silently be pinned at level 1.
const FILLER = cat(9, "Hazbot: Top\n[Hooray!]");

describe("selectFeedback", () => {
  const full = ruleSet([cat(2, "L1", "L2", "L3"), FILLER]);

  it("walks level 1, 2, 3 as the shown level rises", () => {
    expect(selectFeedback(full, 2, 0)).toEqual({ feedback: "L1", level: 1, source: "level1" });
    expect(selectFeedback(full, 2, 1)).toEqual({ feedback: "L2", level: 2, source: "round2" });
    expect(selectFeedback(full, 2, 2)).toEqual({ feedback: "L3", level: 3, source: "round3" });
  });

  it("caps at the last rung rather than running off the end", () => {
    expect(selectFeedback(full, 2, 3)).toEqual({ feedback: "L3", level: 3, source: "round3" });
    expect(selectFeedback(full, 2, 99)).toEqual({ feedback: "L3", level: 3, source: "round3" });
  });

  it("stops at level 2 when only Round 2 is authored", () => {
    const rs = ruleSet([cat(2, "L1", "L2"), FILLER]);
    expect(selectFeedback(rs, 2, 1)).toEqual({ feedback: "L2", level: 2, source: "round2" });
    expect(selectFeedback(rs, 2, 2)).toEqual({ feedback: "L2", level: 2, source: "round2" });
  });

  // Round 3 without Round 2 is not authored today, but the ladder must not leave a hole:
  // the second rung is Round 3 and it is reported as level 2, so `level` and `source`
  // keep naming the same string.
  it("promotes Round 3 to level 2 when Round 2 is absent", () => {
    const rs = ruleSet([cat(2, "L1", undefined, "L3"), FILLER]);
    expect(selectFeedback(rs, 2, 1)).toEqual({ feedback: "L3", level: 2, source: "round3" });
  });

  it("repeats level 1 for a category with no Round content", () => {
    const rs = ruleSet([cat(2, "L1"), FILLER]);
    expect(selectFeedback(rs, 2, 5)).toEqual({ feedback: "L1", level: 1, source: "level1" });
  });

  it("serves the top category's level 2 from repeatFeedback and stops there", () => {
    const rs = ruleSet(
      [cat(1, "Middle"), cat(5, "Celebrate", "Fill-down 2", "Fill-down 3")],
      { id: 100, studentAction: "", feedback: "Keep going!" },
    );
    expect(selectFeedback(rs, 5, 0)).toEqual({ feedback: "Celebrate", level: 1, source: "level1" });
    expect(selectFeedback(rs, 5, 1))
      .toEqual({ feedback: "Keep going!", level: 2, source: "category100" });
    expect(selectFeedback(rs, 5, 2))
      .toEqual({ feedback: "Keep going!", level: 2, source: "category100" });
  });

  // Deliberately pinned: a single-category rule-set makes that category the top one, so
  // its Round columns are unreachable and it stays at level 1 however often it is asked.
  it("pins a lone category at level 1, since it is the top category", () => {
    const rs = ruleSet([cat(2, "L1", "L2", "L3")]);
    expect(selectFeedback(rs, 2, 1)).toEqual({ feedback: "L1", level: 1, source: "level1" });
  });

  it("returns null for a missing category, a null id, an absent rule-set or empty feedback", () => {
    expect(selectFeedback(full, 7, 0)).toBeNull();
    expect(selectFeedback(full, null, 0)).toBeNull();
    expect(selectFeedback(undefined, 2, 0)).toBeNull();
    expect(selectFeedback(ruleSet([cat(2, ""), FILLER]), 2, 0)).toBeNull();
  });
});
