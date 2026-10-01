# Implementation Plan: Hazbot: show level 1 feedback twice

**Jira**: https://concord-consortium.atlassian.net/browse/WM-61
**Requirements Spec**: [requirements.md](requirements.md)
**Status**: **In Development**

## Implementation Plan

Two commits on disjoint files; neither needs the other to compile or pass. The labels go first: "Round 2" is correct under both the old and the new ladder, whereas the reverse order leaves one commit whose sidebar and playbooks label Round 2 as "level 2" while it is shown at level 3.

Baseline on master `82619f9`: 88 suites, 1083 tests, all green; the playbook generator is idempotent (no diff on a fresh run). With both steps applied: 88 suites, 1085 tests (the ladder step adds two), all green; `npm run lint` reports no errors and no warnings in any touched file.

### Label the Round rows by Round in the sidebar and playbooks

**Summary**: R12 and R13. Developer-tool labels only, plus the regenerated playbooks. No behavior change.

**Files affected**:
- `src/hazbot/engine/sidebar/sidebar.tsx`: two labels
- `src/hazbot/engine/sidebar/sidebar.test.tsx`: five label strings, one test name
- `scripts/playbook-impl.js`: `roundLabel`, one comment
- `scripts/playbook-impl.test.js`: five label strings
- `docs/hazbot-validation/*.md`: regenerated (64 changed lines across the ten playbooks)

**Estimated diff size**: ~20 lines of code and tests, plus the 64 regenerated lines

**`sidebar.tsx`** lines 279 and 285: `Feedback (level 2{...}):` and `Feedback (level 3{...}):` become `Feedback (Round 2{...}):` and `Feedback (Round 3{...}):`. The `roundsSuperseded` suffix and the muted line are unchanged.

**`playbook-impl.js`**: `roundLabel` becomes `(n) => (top ? \`Round ${n}, not shown\` : \`Round ${n}\`)`, and the comment's first sentence "The level 2 / level 3 strings a repeat click shows, omitted where the tab carries no Round columns." becomes "The Round 2 / Round 3 strings a repeat click shows, labeled by Round rather than by the level they appear at so the label survives a change to the ladder, and omitted where the tab carries no Round columns."

**Tests**: in `sidebar.test.tsx` and `playbook-impl.test.js`, the comment "after its level-3 line" in the playbook test becomes "after its Round 3 line", and every `(level 2` / `(level 3` in a label assertion becomes `(Round 2` / `(Round 3`, including the negative cases (`not.toContain` in the playbook test, and the two regex `queryByText(/Feedback \(level 2/)` cases in the sidebar test, which a plain-string search-and-replace misses); `sidebar.test.tsx`'s "renders a middle category's Round rows unlabeled" is renamed "labels a middle category's Round rows by Round". The negative cases alone could not catch a reverted label, but each file's positive cases do.

**Regenerate**: `node scripts/generate-hazbot-validation-playbook.js`; the diff must be exactly one label per Round line (64 lines, 6/6/8/8/8/6/10/2/4/6 across 23/24/25/32/33/34/35/41/44/46). Anything else means the generator was not idempotent against the tree and should be investigated rather than committed.

**Verify**: `npm test`, `npm run lint`, and a second generator run produces no diff.

---

### Show level 1 twice in the feedback ladder

**Summary**: The behavior change, its tests, the `APP_RULES_VERSION` bump §7 requires in the same commit, the log documentation for the new numbering, and the comments that state the old ladder (R1 to R11, R14 except the label tests, R15 to R17).

**Files affected**:
- `src/hazbot/wildfire/feedback-levels.ts`: the repeat rung, `level1Repeat`, comments
- `src/hazbot/wildfire/rules-version.ts`: 8 to 9, comment
- `src/hazbot/wildfire/feedback-levels.test.ts`: the new ladder shapes
- `src/hazbot/wildfire/feedback-ladder.test.ts`: the five-press corpus walk, the no-repeat-outside-the-list check
- `src/components/hazbot-button.test.tsx`: four cases updated, one added
- `src/components/hazbot-button.tsx`: one comment
- `src/models/stores.ts`: one comment
- `LOGGED-EVENTS.md`: the `HazbotFeedbackShown` row, a new version-9 subsection, three derived-query edits

**Estimated diff size**: ~200 lines

**`feedback-levels.ts`**, in full after the change:

```ts
import { RuleSet, topCategoryId } from "../engine";
import { WildfireDefaults } from "./types";

// Which rung of a category's feedback ladder a click shows, and where its string came
// from. `source` exists because the level alone cannot identify the string: level 2 is
// the category's own level 1 string again on a category with Round content, and the
// rule-set's category-100 row on the top category, and the wording is expected to churn.
export type FeedbackSource = "level1" | "level1Repeat" | "round2" | "round3" | "category100";

export interface FeedbackSelection {
  feedback: string;
  level: number;             // 1 to 4, capped at the rungs that exist for the category
  source: FeedbackSource;
}

// The ordered ladder of strings for one category. Level 1 is always the category's own
// feedback. On the top category the whole tail is the rule-set's category-100 row and stops
// there. Anywhere else with Round content, level 1 is shown a second time before the Round
// columns, so a student who skimmed it can read it again before Hazbot runs out of ideas.
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
  if (cat.feedbackRound2 || cat.feedbackRound3) {
    rungs.push({ feedback: cat.feedback, source: "level1Repeat" });
  }
  if (cat.feedbackRound2) rungs.push({ feedback: cat.feedbackRound2, source: "round2" });
  if (cat.feedbackRound3) rungs.push({ feedback: cat.feedbackRound3, source: "round3" });
  return rungs;
}

// Pick the string for the next press. `shownLevel` is the highest level already shown for
// this category in this page session (0 = never shown). The level never rises above the
// number of rungs that exist, so `level` and `source` always name the same string, and a
// category with no Round content repeats level 1 rather than blanking or skipping ahead.
export function selectFeedback(/* unchanged */) { /* unchanged */ }
```

**`rules-version.ts`**: `APP_RULES_VERSION = 9`, and the comment's last two sentences become: "Version 9 is the second kind: no category resolves differently, but on every category with Round 2/3 content a repeat click shows level 1 a second time before Round 2, so level 2 there is the repeated level 1 and Rounds 2 and 3 are levels 3 and 4."

**Comments elsewhere** (R17):
- `hazbot-button.tsx:143`: "Which of the category's up-to-three strings this press shows." becomes "Which rung of the category's feedback ladder this press shows." The rest of the comment stands.
- `stores.ts:69`: "so a validation walk can check level 3 on one category" becomes "so a validation walk can check the last level on one category".

**`feedback-levels.test.ts`**: replace the three walk-shaped cases and add one; the rest stand (the no-Round, top-category, lone-category and null cases already pin R2 and R3, and the top-category fixture already carries Round columns).

```ts
it("shows level 1 twice, then Round 2 and Round 3", () => {
  expect(selectFeedback(full, 2, 0)).toEqual({ feedback: "L1", level: 1, source: "level1" });
  expect(selectFeedback(full, 2, 1)).toEqual({ feedback: "L1", level: 2, source: "level1Repeat" });
  expect(selectFeedback(full, 2, 2)).toEqual({ feedback: "L2", level: 3, source: "round2" });
  expect(selectFeedback(full, 2, 3)).toEqual({ feedback: "L3", level: 4, source: "round3" });
});

it("caps at the last rung rather than running off the end", () => {
  expect(selectFeedback(full, 2, 4)).toEqual({ feedback: "L3", level: 4, source: "round3" });
  expect(selectFeedback(full, 2, 99)).toEqual({ feedback: "L3", level: 4, source: "round3" });
});

it("repeats level 1 before Round 2 when only Round 2 is authored, and stops there", () => {
  const rs = ruleSet([cat(2, "L1", "L2"), FILLER]);
  expect(selectFeedback(rs, 2, 1)).toEqual({ feedback: "L1", level: 2, source: "level1Repeat" });
  expect(selectFeedback(rs, 2, 2)).toEqual({ feedback: "L2", level: 3, source: "round2" });
  expect(selectFeedback(rs, 2, 3)).toEqual({ feedback: "L2", level: 3, source: "round2" });
});

// Round 3 without Round 2 is not authored today; it still gets the repeat, and Round 3
// follows it as level 3, so `level` and `source` keep naming the same string.
it("repeats level 1 before Round 3 when Round 2 is absent", () => {
  const rs = ruleSet([cat(2, "L1", undefined, "L3"), FILLER]);
  expect(selectFeedback(rs, 2, 1)).toEqual({ feedback: "L1", level: 2, source: "level1Repeat" });
  expect(selectFeedback(rs, 2, 2)).toEqual({ feedback: "L3", level: 3, source: "round3" });
});
```

Mutations caught: deleting the repeat push fails all four; gating it on `feedbackRound2` alone fails the Round-3 case; pushing it on the top category fails the existing top-category case.

**`feedback-ladder.test.ts`**: the header comment gains one sentence ("Each of these also shows its level 1 string twice before Round 2."), the walk becomes five presses, and a second corpus test pins that nothing outside the list repeats.

```ts
// Walks the ladder the way five presses do. Runs over the pinned list rather than the
// derived one, so a dropped rung fails here as well as in the equality assertion above.
it.each(ROUND_2_LADDERS)("%s shows level 1 twice, then Round 2 and Round 3", (pair) => {
  const [ruleSetId, categoryId] = pair.split("/");
  const ruleSet = ruleSets[ruleSetId];
  const selections = [0, 1, 2, 3, 4]
    .map((shown) => selectFeedback(ruleSet, Number(categoryId), shown));

  expect(selections.map((s) => s?.level)).toEqual([1, 2, 3, 4, 4]);
  expect(selections.map((s) => s?.source))
    .toEqual(["level1", "level1Repeat", "round2", "round3", "round3"]);
  expect(selections[1]?.feedback).toBe(selections[0]?.feedback);
  expect(new Set(selections.slice(1, 4).map((s) => s?.feedback)).size).toBe(3);
});

// Category 1 on every tab and every top category. The length check keeps an empty walk
// from passing.
it("never repeats level 1 on a category without a Round 2 rung", () => {
  const others: string[] = [];
  for (const [id, ruleSet] of Object.entries(ruleSets)) {
    for (const category of ruleSet.categories) {
      const pair = `${id}/${category.id}`;
      if (ROUND_2_LADDERS.includes(pair)) continue;
      others.push(pair);
      const sources = [0, 1, 2].map((shown) => selectFeedback(ruleSet, category.id, shown)?.source);
      expect(sources).not.toContain("level1Repeat");
    }
  }
  expect(others).toHaveLength(20);
});
```

**`hazbot-button.test.tsx`**, in the `Hazbot feedback levels` block:

- "walks level 1, 2, 3 and then repeats level 3" becomes "shows level 1 twice, then Round 2 and Round 3, then repeats Round 3": five presses; bodies `["Level one", "Level one", "Level two", "Level three", "Level three"]`; `shownLevels` `[[1, "level1"], [2, "level1Repeat"], [3, "round2"], [4, "round3"], [4, "round3"]]`; `hazbotFeedbackLevels.get(2)` is 4 and `hazbotLastFeedbackShown` is `{ level: 4, source: "round3" }`.
- The per-category resume test gains a fourth press, since the return to category 2 now shows its repeated level 1 and a body alone cannot tell resume from replay: presses on 2, 3, 2, 2 show `"Two one"`, `"Three one"`, `"Two one"`, `"Two two"`, and the map is `[[2, 3], [3, 1]]`. A reset-on-category-change mutation shows `"Two one"` on the fourth press.
- The cap test is renamed "never logs a level above the number of rungs the category carries" and its expected maximum becomes 3 (a Round-2-only category: level 1, its repeat, Round 2).
- In the token-gate block, the existing case becomes the authored-token case and a shipped-shape case is added before it. `finish` is `act(() => { cmOpts.onDestroyed(); })`, the terminal Done on a driving tour, as the existing case already does inline.

```ts
it("offers the walk-through on both level 1 showings and not on the [Okay] Rounds", () => {
  const logSpy = jest.spyOn(logModule, "log").mockImplementation(() => undefined);
  mockGetEngine.mockReturnValue(gateEngine(
    "Hazbot: Level one\n[Show me]",
    "Hazbot: Level two\n[Okay]",
    "Hazbot: Level three\n[Okay]",
  ));
  renderWithStores();

  openAndActivate(); finish();                   // level 1: tour
  openAndActivate(); finish();                   // level 2, the repeat: tour again
  openAndActivate();                             // level 3: [Okay], closes
  openAndActivate();                             // level 4: [Okay], closes

  const launches = payloads(logSpy, "HazbotShowMeClicked").map((p) => p.feedbackLevel);
  expect(launches).toEqual([1, 2]);
});

it("follows the displayed string's token, so an authored [Show me] Round 2 also launches", () => {
  // the existing "launches at level 1 and again at level 2" case, with a third
  // openAndActivate(); finish(); before the final openAndActivate(), expecting [1, 2, 3]
});
```

**`LOGGED-EVENTS.md`** (R10), matching the file's wrapped-note style:

- `HazbotFeedbackShown` row: the `source` union gains `\| "level1Repeat"`, and "`feedbackLevel` is 1, 2 or 3, capped at how many strings the category carries. `source` names which string that is, which the level alone cannot: on a tab's top category, level 2 is the rule-set's category-100 repeat feedback rather than a Round 2 column." becomes "`feedbackLevel` runs from 1 to 4, capped at the number of rungs in the category's ladder, which from `appRulesVersion` 9 is one more than the number of strings on a category with Round content, since its Round 1 advice is shown twice. `source` names which string that is, which the level alone cannot: level 2 is Round 1 shown a second time (`level1Repeat`) on a category with Round content, and the rule-set's category-100 repeat feedback on a tab's top category."
- A new subsection placed first among the Hazbot notes, above "Rule-set ids renumbered":

  > ### `feedbackLevel` renumbered (`appRulesVersion` 9 onward)
  >
  > Here **Round 1, 2 and 3** name the advice as authored (Round 1 is the category's main feedback) and **level** names only the logged `feedbackLevel` number; from this version the two no longer line up. The `source` values `level1` and `level1Repeat` both mean Round 1, and keep their names so that existing queries on `level1` still work.
  >
  > On every category with Round 2 or Round 3 content, Hazbot shows the category's Round 1 advice twice before moving on. From `appRulesVersion` 9, `feedbackLevel` 2 on those categories is Round 1 shown a second time rather than Round 2, and Rounds 2 and 3 are levels 3 and 4, on all five events that carry the field: `HazbotFeedbackShown`, `HazbotShowMeClicked`, `HazbotTourDismissed`, `HazbotTourCompleted` and `HazbotCoachMarkHiddenByRun`. Categories with no Round content (category 1 on every tab) still log level 1 on every press, and a tab's top category still logs 1, 2, 2 with `source` `level1`, `category100`, `category100`.
  >
  > On `HazbotFeedbackShown` the two numberings can be told apart by `source` alone: `level1Repeat` never occurs before version 9, and `round2` moves from level 2 to level 3. The four coach-mark events carry no `source`, so a `feedbackLevel` of 2 there is Round 2 before version 9 and Round 1 from it; segment those on `appRulesVersion`. Because the repeated string carries Round 1's `[Show me]` token, a `HazbotShowMeClicked` with `feedbackLevel: 2` from version 9 is a student taking the walk-through on the second offer of the same advice.

- Silent-repeat note: "A fully populated category logs 1, 2, 3, 3, so the fourth click is a silent repeat." becomes "A fully populated category logs 1, 2, 3, 4, 4, so the fifth click is a silent repeat. Levels 1 and 2 show the same string but are not a silent repeat: the second showing is deliberate and carries its own `source`."
- Token note: "as the content ships at `appRulesVersion` 8, levels 1 and 2 carry `[Show me]` and level 3 carries `[Okay]`." becomes "as the content ships at `appRulesVersion` 9, levels 1 and 2 (Round 1, shown twice) carry `[Show me]` and levels 3 and 4 carry `[Okay]`; at version 8 only level 1 carried `[Show me]`."
- Dismissal-query note: "A query keyed on the category alone therefore counts every level-3 repeat as a dismissal" becomes "counts every pair that starts at level 3 or 4 as a dismissal", since both of those levels carry `[Okay]`.
- Reset example: "a pair spanning a reset reads level 3 then level 1" becomes "level 4 then level 1".

**Verify**: `npm test` (all green, 1085 tests with both steps applied), `npm run lint`, and `git diff --stat` shows only the files listed. Then re-grep the repo prose for the old ladder (R17):

```bash
grep -nE -i 'level [234]|1, 2, 3|three (levels|strings|feedbacks)|up-to-three|round ?[23]' CLAUDE.md README.md docs/hazbot-update-workflow.md
```

On master this prints one line, `docs/hazbot-update-workflow.md:242` ("adding Round 2/3 columns counts"), which stays true. Any other hit states the old ladder and gets updated in this commit.

**Live walk** (R18), against `npm start` with the Playwright MCP browser, before committing:

1. Open `http://localhost:8080/?hazbotRules=23&hazbotSidebar=true&preset=plainsTwoZone&helitackAvailable=false&fireLineAvailable=false&severeDroughtAvailable=false&showBurnIndex=false&forestWithSuppressionAvailable=false`. No Terrain Setup dialog opens on this URL.
2. Leave the setup at its defaults, run `window.test.placeSparkInZone(0); window.test.placeSparkInZone(1);`, and click Start. The run burns out in about 20 seconds, and the sidebar's matched row is category 2 ("Looks like you haven't changed the Setup yet").
3. Click Hazbot five times, closing each popover with × or Escape. Expect: clicks 1 and 2 show the same level 1 text with a **Show me** button; click 3 shows the Round 2 "Go up and look at the instructions under "Drought Investigation" again" with **Okay**; clicks 4 and 5 show "I'm all out of ideas!" with **Okay**. After click 5, the sidebar's Diagnostics read `Feedback levels: 2→4` and `Last shown: level 4 (round3)`; after click 2, `Last shown: level 2 (level1Repeat)`.
4. Run `window.test.resetHazbotFeedbackLevels()` and click once more: the level 1 text is back, and the sidebar reads `2→1`.
5. Click Hazbot again (now level 2) and press **Show me** this time: the walk-through launches.

The same procedure on master (dry run, 2026-09-30) showed click 1 with **Show me**, click 2 already on Round 2 with **Okay**, clicks 3 to 5 on "I'm all out of ideas!", and the sidebar at `2→3`, so each expectation above differs from master behavior and can fail.

---

### After merge: hand off the switch date to Sam

Not a commit. Once the release carrying this story is live in the students' activities, send Sam the date it went live and the plain-terms change (R11). The switch is the date the activities start loading the release, not the merge date.

## Open Questions

### RESOLVED: Judgment call: one commit or two?
**Options considered**:
- A) Two: the labels and regenerated playbooks, then the ladder with its log contract.
- B) One commit for everything.

**Decision**: A. The label change is independent of the ladder and its 64-line regenerated diff would bury the behavior change in review. The rules-version bump rides with the ladder, as §7 requires.

### RESOLVED: Judgment call: does `LOGGED-EVENTS.md` go in the ladder commit or its own?
**Options considered**:
- A) In the ladder commit.
- B) A separate docs commit.

**Decision**: A. The doc states the contract the ladder commit changes; landing it separately leaves a reachable commit whose logs disagree with their documentation, the same reason §7 puts the version bump in the semantics commit.

### RESOLVED: Judgment call: how does the resume test distinguish resume from replay now?
**Options considered**:
- A) Add a fourth press, which shows Round 2 only if the level resumed.
- B) Assert on the map alone.

**Decision**: A. After the change the third press shows `"Two one"` under both resume and replay, so the body stops discriminating; the map assertion still does, but a body the student would see is the stronger check and costs one press.

### RESOLVED: Low confidence: do the specified button-test sequences run as written against the harness?
**Decision**: Yes. Both steps were applied verbatim as throwaway code and run: the three ladder files pass (99 tests), the full suite passes (1085), and lint is clean on every touched file. Mutations confirm the new tests can fail: deleting the repeat push fails 41 tests; gating it on `feedbackRound2` alone fails the Round-3-only case; pushing it on every non-top category fails the no-Round cases in `feedback-levels.test.ts` and `hazbot-button.test.tsx` and the corpus "never repeats" check. Reverted.

## Self-Review

Roles: commit reviewer (step independence and order), test runner (can each named test be written and fail), operator (the release and the log handoff). Checked by applying the plan as throwaway code; findings that did not survive were dropped.

### Commit reviewer

#### RESOLVED: The ladder-first order left one commit with wrong dev-tool labels
With the ladder first, the commit between the two steps shows Round 2 at level 3 while the sidebar and every playbook call it "level 2". Labels are now first, since "Round 2" is true either side of the ladder change.

### Test runner

#### RESOLVED: The sidebar's negative label cases are regexes
`sidebar.test.tsx` checks absence with `queryByText(/Feedback \(level 2/)`; a plain-string replace of `Feedback (level` leaves both untouched, and they would then pass vacuously forever. Found by running the replace. The label step now names them.

### Operator

#### RESOLVED: No test pins `APP_RULES_VERSION`, so the bump is easy to drop in a rebase
`rules-version.test.ts` checks only that the value is a positive integer, and `app.test.tsx` / `log.test.ts` mock it. That is deliberate (a pinned number would just be edited alongside every bump), so no test is added; the ladder step lists the bump under its files and the requirements carry it as R9, which is where a reviewer checks it.
