// App-side rules version (per Req 20). Bumped per the policy in
// docs/hazbot-update-workflow.md when the feedback a given session receives changes: either
// the category it resolves to (a sheet edit, or a change in how the expressions are
// evaluated) or which of that category's strings is selected. Version 7 is the second kind:
// no category resolves differently, but a repeat click now escalates through levels 2 and 3.
export const APP_RULES_VERSION = 7;
