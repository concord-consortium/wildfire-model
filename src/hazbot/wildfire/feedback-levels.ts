import { RuleSet, topCategoryId } from "../engine";
import { WildfireDefaults } from "./types";

// Which of a category's up-to-three feedback strings a click shows, and where that
// string came from. `source` exists because the level alone cannot identify the string:
// on the top category level 2 is the rule-set's category-100 row rather than a Round 2
// column, and the wording is expected to churn.
export type FeedbackSource = "level1" | "round2" | "round3" | "category100";

export interface FeedbackSelection {
  feedback: string;
  level: number;             // 1 | 2 | 3, capped at what exists for the category
  source: FeedbackSource;
}

// The ordered ladder of strings that exist for one category: level 1 is always the
// category's own feedback; level 2 and 3 come from the Round columns, except on the top
// category, where the whole tail is the rule-set's category-100 row and stops there.
function ladder(
  ruleSet: RuleSet<WildfireDefaults> | undefined,
  categoryId: number | null,
): { feedback: string; source: FeedbackSource }[] {
  const cat = ruleSet?.categories.find((c) => c.id === categoryId);
  if (!cat?.feedback) return [];
  const rungs: { feedback: string; source: FeedbackSource }[] = [
    { feedback: cat.feedback, source: "level1" },
  ];
  if (categoryId === topCategoryId(ruleSet)) {
    if (ruleSet?.repeatFeedback?.feedback) {
      rungs.push({ feedback: ruleSet.repeatFeedback.feedback, source: "category100" });
    }
    return rungs;
  }
  if (cat.feedbackRound2) rungs.push({ feedback: cat.feedbackRound2, source: "round2" });
  if (cat.feedbackRound3) rungs.push({ feedback: cat.feedbackRound3, source: "round3" });
  return rungs;
}

// Pick the string for the next press. `shownLevel` is the highest level already shown for
// this category in this page session (0 = never shown). The level never rises above the
// number of rungs that exist, so `level` and `source` always name the same string, and a
// category with no level 2 repeats level 1 rather than blanking or skipping to level 3.
export function selectFeedback(
  ruleSet: RuleSet<WildfireDefaults> | undefined,
  categoryId: number | null,
  shownLevel: number,
): FeedbackSelection | null {
  const rungs = ladder(ruleSet, categoryId);
  if (rungs.length === 0) return null;
  const level = Math.min(shownLevel + 1, rungs.length);
  return { feedback: rungs[level - 1].feedback, level, source: rungs[level - 1].source };
}
