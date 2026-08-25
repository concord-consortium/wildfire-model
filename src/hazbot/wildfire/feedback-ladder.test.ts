import { topCategoryId } from "../engine";
import { ruleSets } from "../rule-sets";
import { selectFeedback } from "./feedback-levels";

// Every `ruleSetId/categoryId` carrying a live Round 2 rung: a category with a
// `feedbackRound2`, excluding each rule-set's top category, whose level 2 is the
// category-100 row rather than a Round column. Pinned by exact equality, because an
// extraction from a workbook export that is missing the Round columns is otherwise
// invisible to the suite: it raises no parse error, changes no expression and changes no
// tour step count, so every other test stays green while a repeat click goes back to
// showing level 1 again. A pair appearing here means a category gained a rung; a pair
// disappearing means one lost it.
const ROUND_2_LADDERS = [
  "23/2", "23/3", "23/4",
  "24/2", "24/3", "24/4",
  "25/2", "25/3", "25/4", "25/5",
  "32/2", "32/3", "32/4", "32/5",
  "33/2", "33/3", "33/4", "33/5",
  "34/2", "34/3", "34/4",
  "35/2", "35/3", "35/4", "35/5", "35/6",
  "41/2",
  "44/2", "44/3",
  "46/2", "46/3", "46/4",
];

describe("feedback ladders across the shipped rule-sets", () => {
  it("pins which categories carry a Round 2 rung", () => {
    const actual: string[] = [];
    for (const [id, ruleSet] of Object.entries(ruleSets)) {
      const top = topCategoryId(ruleSet);
      for (const category of ruleSet.categories) {
        if (category.id !== top && category.feedbackRound2) actual.push(`${id}/${category.id}`);
      }
    }
    expect(actual.sort()).toEqual([...ROUND_2_LADDERS].sort());
  });

  // Walks the ladder the way three presses do. Runs over the pinned list rather than the
  // derived one, so a dropped rung fails here as well as in the equality assertion above.
  it.each(ROUND_2_LADDERS)("%s escalates through three distinct strings", (pair) => {
    const [ruleSetId, categoryId] = pair.split("/");
    const ruleSet = ruleSets[ruleSetId];
    const selections = [0, 1, 2].map((shown) => selectFeedback(ruleSet, Number(categoryId), shown));

    expect(selections.map((s) => s?.level)).toEqual([1, 2, 3]);
    expect(selections.map((s) => s?.source)).toEqual(["level1", "round2", "round3"]);
    expect(new Set(selections.map((s) => s?.feedback)).size).toBe(3);
  });
});
