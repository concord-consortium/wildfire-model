# Hazbot: show level 1 feedback twice

**Jira**: https://concord-consortium.atlassian.net/browse/WM-61

**Status**: **Closed**

## Overview

Hazbot's repeat-click ladder showed a category's level 1 advice once, then Round 2, then Round 3 ("I'm all out of ideas!"). This story shows the level 1 advice (Round 1) a second time before Round 2, so a student who skimmed it can read it again before Hazbot runs out of ideas.

Trudi found that an adult (and so surely a student) often skims the first message, and because level 1 never came back, the next two clicks led straight to "I'm all out of ideas" about advice that was never really read. Her ask, for the fall test, was two appearances of level 1, so Round 2 moves to level 3 and Round 3 to level 4. The change is small for students and matters mostly for the logs: from the release that carries it, the logged `feedbackLevel` 2 means Round 1 shown again rather than Round 2, and a new `source` value names that second showing. It amends the ladder defined by [WM-46](WM-46-level-2-and-3-feedback.md), whose closed spec stays as the record of that story.

## Requirements

**The ladder**

- **R1.** On every category that is **not** the rule-set's top category and that carries at least one Round rung (`feedbackRound2` or `feedbackRound3`), the ladder gains a second level 1 rung directly after the first: the same `feedback` string, with `source: "level1Repeat"`. The Round rungs follow it unchanged. A fully populated category therefore shows level 1, level 1, Round 2, Round 3, and logs levels 1, 2, 3, 4, 4 on five presses with sources `level1`, `level1Repeat`, `round2`, `round3`, `round3`.
- **R2.** A category with no Round content is unchanged: it repeats level 1 and logs `feedbackLevel` 1 with `source: "level1"` on every press. On the shipped rule-sets that is category 1 on every tab.
- **R3.** The top category's ladder is unchanged: `[level1, category100]`, logging 1, 2, 2.
- **R4.** The cap is unchanged: the level never rises above the number of rungs, so `feedbackLevel` and `source` always name the displayed string. The highest level any category can now log is 4.
- **R5.** `FeedbackSource` gains `"level1Repeat"`, and the `FeedbackSelection.level` documentation reads 1 to 4 rather than `1 | 2 | 3`.
- **R6.** The change is permanent and unconditional: no URL parameter, rule-set field or other switch.

**The walk-through**

- **R7.** The second level 1 showing offers the **Show me** walk-through exactly as the first does, on every category whose level 1 token is `[Show me]` and whose `buildTour` returns a tour. No change to the button's token gate is needed or made; a test pins the behavior.

**Logging**

- **R8.** All five events that carry `feedbackLevel` (`HazbotFeedbackShown`, `HazbotShowMeClicked`, `HazbotTourDismissed`, `HazbotTourCompleted`, `HazbotCoachMarkHiddenByRun`) carry the new numbering: on a category with Round content, 2 is Round 1 shown a second time, 3 is Round 2 and 4 is Round 3. `HazbotFeedbackShown.source` carries `level1Repeat` for the second showing. No event gains or loses a field.
- **R9.** Bump `APP_RULES_VERSION` from 8 to 9 in the same commit that changes the ladder, per `docs/hazbot-update-workflow.md` §7, and update the comment in `rules-version.ts` to describe what version 9 marks.
- **R10.** Update `LOGGED-EVENTS.md` to the new contract. Its new and changed text uses **Round 1, 2 and 3** for the advice as authored (Round 1 is the category's main feedback, the sheet's column C) and **level** only for the logged `feedbackLevel` number:
  - the `HazbotFeedbackShown` row: `source` gains `"level1Repeat"`, `feedbackLevel` runs 1 to 4, and the cap is stated in rungs rather than strings;
  - a new subsection stating that from `appRulesVersion` 9 `feedbackLevel` 2 on a category with Round content is Round 1 shown a second time rather than Round 2, and 3 and 4 are Rounds 2 and 3, on all five events; that on `HazbotFeedbackShown` the two eras can be told apart by `source` alone (`level1Repeat` never appears before the switch, and `round2` moves from level 2 to 3); and that the four coach-mark events, which carry no `source`, must be segmented on `appRulesVersion`;
  - the derived-query notes: the silent-repeat example becomes 1, 2, 3, 4, 4, with a note that levels 1 and 2 show the same string but are not a silent repeat; the `[Show me]` sentence states that levels 1 and 2 (both Round 1) carry `[Show me]` and levels 3 and 4 carry `[Okay]` as the content ships at version 9, so a category-keyed query miscounts pairs that start at level 3 or 4; the reset example reads level 4 then level 1.
- **R11.** Handoff to Sam: once the release carrying this story is live in the students' activities, tell Sam the date it went live and what changed in plain terms (level 2 in the logs now means the Round 1 advice shown a second time; Rounds 2 and 3 are logged as 3 and 4; the new `level1Repeat` source marks the second showing). The date is when the activities start loading the release, not the PR merge date. *(Pending: a message to send after release, not a code deliverable.)*

**Developer tools**

- **R12.** The dev sidebar's per-category detail rows are labeled by Round: `Feedback (Round 2):` and `Feedback (Round 3):`, and on the top category `Feedback (Round 2, not shown):` / `Feedback (Round 3, not shown):`. The muted explanatory line is unchanged.
- **R13.** The playbook generator (`scripts/playbook-impl.js`) labels the same lines `Feedback (Round 2)` / `Feedback (Round 3)`, and `(Round 2, not shown)` / `(Round 3, not shown)` on the top category, with its notes unchanged. Every `docs/hazbot-validation/*.md` is regenerated; the only diff is the label on each Round line (64 lines across the ten playbooks). No rule-set content changes.

**Tests and validation**

- **R14.** Unit tests pin the new behavior:
  - `feedback-levels.test.ts`: the five-press walk on a full ladder, the repeated rung's `feedback` equal to level 1's; a Round-2-only and a Round-3-only category each get the repeat rung; a no-Round category and the top category (including one that carries Round columns) are unchanged.
  - `feedback-ladder.test.ts`: across the shipped rule-sets, the 32 pinned categories walk five presses to levels 1, 2, 3, 4, 4 with sources `level1`, `level1Repeat`, `round2`, `round3`, `round3`; presses 1 and 2 show the same string and presses 2, 3 and 4 show three distinct strings. Every category outside the list (category 1s and top categories) never yields `level1Repeat`, with a length assertion so an empty walk cannot pass.
  - `hazbot-button.test.tsx`: the ladder walk logs the new levels and sources; with the shipped token shape (Round 2 and 3 `[Okay]`) the walk-through launches at levels 1 and 2 only; with an authored `[Show me]` Round 2 it also launches at level 3; the per-category resume test still resumes rather than replays; the cap test is stated in rungs rather than strings.
  - `playbook-impl.test.js` and `sidebar.test.tsx`: the Round labels, in both the reachable and the "not shown" form.
  - Resets need no new test: `bottom-bar.test.tsx` and the `window.test` helper test in `stores.test.ts` already pin both routes.
- **R18.** Before the ladder commit, walk the ladder live with the Playwright MCP browser: on rule-set 23 category 2, five clicks show level 1 twice with **Show me**, then Round 2 and Round 3; the sidebar readout reaches `2→4` / `level 4 (round3)`; `window.test.resetHazbotFeedbackLevels()` returns the next click to level 1; and **Show me** on the second showing launches the walk-through.

**Unchanged**

- **R15.** Levels still reset on Clear All and on `window.test.resetHazbotFeedbackLevels()`, and not on Restart. No change to `ui.resetHazbotFeedback()`, `bottom-bar.tsx` or `stores.ts` beyond comment text that states the old ladder.
- **R16.** No change to any rule-set, category expression, factor variable, sim-prop, tour content or the workbook extraction. No `ENGINE_VERSION` bump: no substrate type or export changes.

**Prose the change invalidates**

- **R17.** Update every comment that states the three-level ladder (`feedback-levels.ts`, `hazbot-button.tsx`, `stores.ts`, `playbook-impl.js`). `CLAUDE.md`, `README.md` and `docs/hazbot-update-workflow.md` need no change; the ladder step re-greps all three before committing.

## Technical Notes

- **How the ladder works.** `ladder()` in `src/hazbot/wildfire/feedback-levels.ts` builds the ordered rungs for one category: `level1`, then (on a non-top category with Round content) `level1Repeat`, then `round2` and `round3` where present. On the rule-set's top category (the highest id below 100, `topCategoryId`) the tail is the rule-set's `repeatFeedback` (`source: "category100"`) and stops there. `selectFeedback` picks rung `min(shownLevel + 1, rungs.length)` and needed no change. `HazbotButton` reads the stored level at the top of its panel effect and commits it, with the `HazbotFeedbackShown` log, only inside `openOnce`, when the popover actually opens.
- **Measured across the ten shipped rule-sets** (23, 24, 25, 32, 33, 34, 35, 41, 44, 46): 32 categories carry Round 2 and Round 3, all coaching categories with a `[Show me]` level 1 token and a walk-through. Every shipped Round 2 and Round 3 string carries `[Okay]`, so before this story the walk-through was offered at level 1 only. Category 1 on every tab has no Round content, and every top category has a `repeatFeedback` row and no Round content.
- **The walk-through re-offer needs no button change.** Whether a popover offers **Show me** is decided by the displayed string's own action token (`offersTour`, gated also on `buildTour` returning a tour), and the repeated rung displays the category's `feedback` string.
- **Why the logs cannot be reinterpreted retroactively.** Before version 9, level 2 on a coaching category was Round 2; after it, level 2 is Round 1 again. The number alone is ambiguous across the boundary, so `LOGGED-EVENTS.md` names `source` and `appRulesVersion` as the two ways to segment. `APP_RULES_VERSION` is logged on `AnalysisEngineActivated`.
- **The sidebar diagnostic readout** (`buildFeedbackLevelDiagnostics`) renders `id→level` and `level N (source)` from the stored values, so it shows `level 2 (level1Repeat)` with no change.
- **Verified before and during implementation.** A throwaway application of the ladder change turned 40 tests red in exactly the three ladder files, and driving the real rule-set 23 category 2 through the real `HazbotButton` logged `[1, level1] [2, level1Repeat] [3, round2] [4, round3] [4, round3]` and launched the walk-through at levels 1 and 2. The shipped suite is 1085 tests. Mutations confirm the new tests can fail: deleting the repeat push fails 41; gating it on `feedbackRound2` alone fails the Round-3-only case; pushing it on every non-top category fails the no-Round cases and the corpus check. The live R18 walk passed on every expectation.

## Out of Scope

- A switch to turn the behavior on or off.
- Repeating the success message on the top category.
- Adding a repeat rung to categories with no Round content.
- Authoring or rewording any feedback string, including making Round 2 re-offer the walk-through.
- Amending the closed WM-46 spec.

## Not Yet Implemented

- The handoff to Sam (R11): the date the release reached students' activities, with the plain-terms summary of the renumbering. Deferred by design until the release is live, since the date is when the activities start loading it, not the merge date.

## Decisions

### Should the second showing of level 1 be logged with its own `source`?
**Context**: `feedbackLevel` and `source` are both logged, and doubling the level 1 rung shifts every later level, so the log needs a way to say which appearance a student saw.
**Options considered**:
- A) A new `source` value, `level1Repeat`, for the second showing.
- B) Log both showings as `level1`, told apart only by their level number.

**Decision**: A. The log says exactly which string a student saw. Trudi agreed on Slack, 2026-09-30.

---

### Permanent, or switchable for the fall test?
**Context**: Trudi's comment says "for the fall test".
**Options considered**:
- A) Permanent for every run.
- B) Switchable by a URL parameter or a per-rule-set setting.

**Decision**: A. Nothing to configure and no second mode to test. Trudi agreed, 2026-09-30.

---

### Does the success path change?
**Context**: The top category's ladder is the success message, then the rule set's category 100 "keep working" row.
**Decision**: No. The ladder stays `[level1, category100]` and still logs 1, 2, 2: the success message has no advice to miss and never reaches "all out of ideas". Trudi confirmed, 2026-09-30.

---

### How are the Round rows labeled in the dev sidebar and the playbooks?
**Context**: Both labeled the Round rows by ladder position ("level 2" / "level 3"), which this story makes wrong.
**Options considered**:
- A) Renumber the labels to level 3 / level 4.
- B) Label them by Round.

**Decision**: B, decided 2026-09-29. Both are developer tools, and a label by Round survives any renumbering. Changing the generator means regenerating every `docs/hazbot-validation/*.md`, a change to generator output, not to rule-set content.

---

### What do the log docs call the category's first advice?
**Context**: Sam, reviewing the summary page on 2026-09-30, pointed out that its log table used "level" both for the logged `feedbackLevel` number and for the first tier of advice ("Level 1 advice" beside "Round 2 advice"). After this story those diverge: logged level 2 is the first tier again, and level 3 is Round 2.
**Decision**: Call the category's main feedback **Round 1** in reader-facing text (the summary page, `LOGGED-EVENTS.md`, the handoff to Sam) and keep **level** for the logged number only. The `source` values are not renamed: `level1` has been logged since WM-46 and renaming it would break every existing query, and `level1Repeat` keeps the name Trudi agreed to so it stays paired with `level1`. Code identifiers and comments keep "level 1", where it names the ladder position.

---

### Which categories get the repeat rung?
**Options considered**:
- A) Only non-top categories that carry Round content (the 32 coaching categories).
- B) Every non-top category, including category 1, which would log 1, 2, 2 with `level1Repeat` while showing the same string as before.

**Decision**: A. It is what Trudi was told ("in every category that has Round 2 and Round 3 advice"), and it is the only place her complaint exists: a category with no Round content already repeats level 1 and never reaches "all out of ideas". B would change the logged numbers on category 1 with no change on screen.

---

### Bump `APP_RULES_VERSION`?
**Options considered**:
- A) Bump 8 to 9 in the ladder commit.
- B) No bump, relying on `source` and the switch date.

**Decision**: A. §7 of the update workflow requires it for a change to which string a session is shown, and it is the only in-log boundary for the four coach-mark events, which carry `feedbackLevel` but no `source`.

---

### Where does the repeat rung sit for a Round-3-only category?
**Options considered**:
- A) Directly after level 1 whenever either Round string exists.
- B) Only when Round 2 exists.

**Decision**: A. No shipped category is Round-3-only, but the ladder already promotes Round 3 when Round 2 is absent; the skim problem is the same whichever Round follows.

---

### Does the doubled `[Show me]` offer change the meaning of the "spent a level without taking the help" query?
**Context**: That query counts consecutive `HazbotFeedbackShown` pairs on one category with no `HazbotShowMeClicked` between them, restricted to where the earlier level offered the walk-through.
**Decision**: No new definition is needed. A level 1 closed without the tour then level 2 is a counted pair; level 2 then level 3 is counted; level 3 (`[Okay]`) then level 4 is excluded. The query is keyed on the displayed level's token, so it stays correct once `LOGGED-EVENTS.md` states which levels carry `[Show me]`.

---

### Is the regenerated playbook diff really label-only?
**Decision**: Verified by a throwaway relabel and regeneration before implementation, and again on the real change: exactly 64 lines across the ten playbooks (6, 6, 8, 8, 8, 6, 10, 2, 4, 6 for 23, 24, 25, 32, 33, 34, 35, 41, 44, 46), one per Round line, and the generator is idempotent.

---

### Reset tests
**Context**: A level-4 reset test would exercise the same `Map.clear()` the existing level-3 case pins.
**Decision**: No new test. `bottom-bar.test.tsx` and `stores.test.ts` already pin Clear All, Restart and the `window.test` helper, and no mutation separates a level-4 variant from them.

---

### The token-gate test keeps an authored-`[Show me]` Round 2 case
**Context**: The existing gate test used a `[Show me]` Round 2 to prove the gate follows the displayed string rather than the level; rewriting it to the shipped `[Okay]` shape alone would lose that.
**Decision**: Both cases: the shipped shape launches at levels 1 and 2 only, and an authored `[Show me]` Round 2 also launches at level 3.

---

### The cap is stated in rungs, not strings
**Context**: `LOGGED-EVENTS.md` and a button test name equated strings with levels. After this story a Round-2-only category carries two strings and three rungs.
**Decision**: Both now state the cap in rungs, so an analyst does not treat level 3 as impossible on such a category.

---

### One commit or two?
**Options considered**:
- A) Two: the labels and regenerated playbooks, then the ladder with its log contract.
- B) One commit for everything.

**Decision**: A, labels first. The 64-line regenerated diff would bury the behavior change in review, and "Round 2" is true on either side of the ladder change, whereas ladder-first left one commit whose dev-tool labels called Round 2 "level 2" while it showed at level 3.

---

### Does `LOGGED-EVENTS.md` go in the ladder commit or its own?
**Decision**: In the ladder commit. A separate docs commit would leave a reachable commit whose logs disagree with their documentation, the same reason §7 puts the version bump in the semantics commit.

---

### How does the resume test distinguish resume from replay?
**Options considered**:
- A) Add a fourth press, which shows Round 2 only if the level resumed.
- B) Assert on the map alone.

**Decision**: A. After the change the third press shows the Round 1 text under both resume and replay, so the body alone stops discriminating; the extra press makes the visible body the check.

---

### The sidebar's negative label cases are regexes
**Context**: `sidebar.test.tsx` checks absence with `queryByText(/Feedback \(level 2/)`, which a plain-string replace leaves untouched, so they would pass vacuously forever.
**Decision**: The label step names them explicitly, and they were updated to `Round`.

---

### No test pins `APP_RULES_VERSION`
**Context**: `rules-version.test.ts` checks only that the value is a positive integer.
**Decision**: Deliberately no pinning test, since a pinned number would just be edited alongside every bump; the requirement (R9) and the ladder commit's file list are where a reviewer checks it.
