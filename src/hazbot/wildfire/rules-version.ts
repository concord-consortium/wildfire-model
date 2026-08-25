// App-side rules version (per Req 20). Bumped per the policy in
// docs/hazbot-update-workflow.md when the feedback a given session receives changes: either
// the category it resolves to (a sheet edit, or a change in how the expressions are
// evaluated) or which of that category's strings is selected. Version 8 is the second kind:
// no category resolves differently, but six categories across rule-sets 41, 44 and 46 carry
// level 2 and 3 rungs, so a repeat click on them escalates rather than repeating level 1.
export const APP_RULES_VERSION = 8;
