import { topCategoryId } from "./top-category";
import { RuleSet } from "./types";

describe("topCategoryId", () => {
  const cat = (id: number) => ({
    id, studentAction: "", feedback: "f", visualFeedback: "", expression: "x",
  });

  it("returns null for an undefined rule-set or an empty categories array", () => {
    expect(topCategoryId(undefined)).toBeNull();
    expect(topCategoryId({ categories: [] })).toBeNull();
  });

  it("returns the only id when there is one category", () => {
    expect(topCategoryId({ categories: [cat(3)] })).toBe(3);
  });

  // The rule is "highest id", not "last element": a future sheet that numbers categories
  // out of order must not silently move the success category.
  it("returns the maximum id, not the last element, on a non-contiguous set", () => {
    expect(topCategoryId({ categories: [cat(1), cat(7), cat(4)] })).toBe(7);
  });

  // Both call shapes in the codebase: feedback-levels.ts passes a whole RuleSet, the
  // sidebar passes the categories array it already has.
  it("accepts a full RuleSet and a bare { categories } alike", () => {
    const ruleSet: RuleSet = { id: "23", categories: [cat(1), cat(5)], factorVariables: [] };
    expect(topCategoryId(ruleSet)).toBe(topCategoryId({ categories: ruleSet.categories }));
  });
});
