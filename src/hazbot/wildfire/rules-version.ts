// App-side rules version (per Req 20). Bumped per the policy in
// docs/hazbot-update-workflow.md when the feedback a given session receives changes: either
// the category it resolves to (a sheet edit, or a change in how the expressions are
// evaluated) or which of that category's strings is selected. Version 9 is the second kind:
// no category resolves differently, but on every category with Round 2/3 content a repeat
// click shows level 1 a second time before Round 2, so level 2 there is the repeated level 1
// and Rounds 2 and 3 are levels 3 and 4.
export const APP_RULES_VERSION = 9;
