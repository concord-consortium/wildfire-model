import { RuleSet } from "./types";

// The rule-set's top category: the highest category id present. Hosts whose sheets number
// feedback-mechanism rows at or above 100 keep those out of `categories` entirely (they
// land in `repeatFeedback`), so "highest id" and "the success category" coincide.
//
// Shared rather than re-derived per consumer: the app's feedback-level selection, the dev
// sidebar and the validation-playbook generator all have to agree on which category this
// is, and if they ever disagree the docs describe the feature against a different category
// than the app implements it for.
export function topCategoryId(ruleSet: Pick<RuleSet, "categories"> | undefined): number | null {
  if (!ruleSet || ruleSet.categories.length === 0) return null;
  return ruleSet.categories.reduce((max, c) => (c.id > max ? c.id : max), ruleSet.categories[0].id);
}
