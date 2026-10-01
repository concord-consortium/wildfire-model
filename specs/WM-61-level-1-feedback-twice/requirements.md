# Hazbot: show level 1 feedback twice

**Jira**: https://concord-consortium.atlassian.net/browse/WM-61
**Repo**: https://github.com/concord-consortium/wildfire-model
**Implementation Spec**: [implementation.md](implementation.md)
**Status**: **In Development**

## Overview

Hazbot's repeat-click ladder shows a category's level 1 advice once, then Round 2, then Round 3 ("I'm all out of ideas!"). This story shows the level 1 advice a second time before Round 2, so a student who skimmed it can read it again before Hazbot runs out of ideas.

## Project Owner Overview

WM-46 gave Hazbot three levels of feedback per category: a repeat click on the same result escalates from the category's coaching, to a Round 2 nudge, to a Round 3 "ask your teacher or a classmate". Trudi found that an adult (and so surely a student) often skims the first message, and because level 1 then never comes back, the next two clicks lead straight to "I'm all out of ideas" about advice that was never really read. Her ask, for the fall test: two appearances of level 1, so Round 2 moves to level 3 and Round 3 to level 4.

The change is small for students and matters mostly for the logs. On every category that has Round 2 or Round 3 advice, the second click shows the level 1 advice again, including its **Show me** walk-through where the category has one. The success message is untouched. What changes for research is the meaning of the logged `feedbackLevel`: from the release that carries this story, level 2 means "level 1 shown again" rather than Round 2, and a new `source` value names that second showing. Whoever analyzes the logs (Sam) needs the date the change reached students to compare data from before and after it.

## Background

Trudi's comment on WM-61 is the requirement: "I suggest that we allow TWO APPEARANCES of level 1 feedback for the fall test. So, level 2 feedback would move to level 3 and level 3 would be level 4." The options were put to her in the decision doc [WM-61 needs two answers before Hazbot shows level 1 feedback twice](https://docs.google.com/document/d/1unev0NhgjUq94TTDHMX7XWvTbNESuLSD72Lsog5n4-A/edit), and she agreed to every recommendation on Slack on 2026-09-30 (see Resolved decisions).

This amends the ladder defined by the closed spec [WM-46](../WM-46-level-2-and-3-feedback.md) (R4, R5, R7a, R7d, R9a, R9d). That spec stays as the record of WM-46; this one owns the change.

**How the ladder works today, verified against the code.** `ladder()` in `src/hazbot/wildfire/feedback-levels.ts` builds the ordered list of strings ("rungs") for one category: `level1` (the category's `feedback`), then `round2` and `round3` where the category carries them. On the rule-set's top category (the highest id below 100, `topCategoryId`) the tail is instead the rule-set's `repeatFeedback` (the sheet's category 100 row, `source: "category100"`), and it stops there. `selectFeedback` picks rung `min(shownLevel + 1, rungs.length)`, so the level is the rung's 1-based position and never rises above the number of rungs. `HazbotButton` (`src/components/hazbot-button.tsx`) reads the stored level from `ui.hazbotFeedbackLevels` at the top of its panel effect and commits the new level, together with the `HazbotFeedbackShown` log, only inside `openOnce`, when the popover actually opens.

**Measured across the ten shipped rule-sets** (23, 24, 25, 32, 33, 34, 35, 41, 44, 46), with a throwaway probe over `ruleSets`:

- 32 categories carry Round 2 and Round 3, the exact list pinned in `feedback-ladder.test.ts`. Every one is a coaching category: its level 1 token is `[Show me]` and `buildTour` returns a walk-through for it.
- Every shipped Round 2 **and** Round 3 string carries `[Okay]`. So today the walk-through is offered at level 1 only; a student who closes the first popover with × or Escape never sees the offer again for that category.
- Category 1 on every tab ("did not run the model", `[Okay]`, no walk-through) has no Round content, so it repeats level 1 and logs 1, 1, 1.
- Every top category (`[Hooray!]`) has no Round content and a `repeatFeedback` row, so it logs 1, 2, 2 with sources `level1`, `category100`, `category100`.

**The walk-through re-offer comes for free.** Whether a popover offers **Show me** is decided by the displayed string's own action token (`offersTour = label.trim().toLowerCase() === "show me"`, gated also on `buildTour` returning a tour). The repeated rung displays the category's `feedback` string, whose token on all 32 categories is `[Show me]`, so the second showing re-offers the walk-through with no code change in the button.

**Where the level is logged.** `feedbackLevel` is on five events, all emitted from `hazbot-button.tsx`: `HazbotFeedbackShown` (with `source`), `HazbotShowMeClicked`, `HazbotTourDismissed`, `HazbotTourCompleted` and `HazbotCoachMarkHiddenByRun`. All five take `selected.level`, so all five change meaning together. `LOGGED-EVENTS.md` documents the field and several derived queries in terms of the current ladder (`feedbackLevel` "is 1, 2 or 3", "a fully populated category logs 1, 2, 3, 3", "levels 1 and 2 carry `[Show me]` and level 3 carries `[Okay]`", "a pair spanning a reset reads level 3 then level 1"). The `[Show me]` sentence is already inaccurate on master (every shipped level 2 carries `[Okay]`), and becomes accurate again after this story for a different reason, so it has to be rewritten rather than left.

**Resets are unaffected.** `ui.resetHazbotFeedback()` clears the whole level map; it is called from Clear All (`bottom-bar.tsx`) and from `window.test.resetHazbotFeedbackLevels()` (`stores.ts`). Restart does not call it. Nothing in this story touches that code, and the map stores levels as plain numbers, so a level of 4 is stored and cleared like any other.

**Rules version.** `docs/hazbot-update-workflow.md` §7 requires an `APP_RULES_VERSION` bump for any selection-semantics change, i.e. any change to which string a session is shown for a given history, in the same commit as the change. This story is one: the second click on 32 categories shows a different string. `APP_RULES_VERSION` is 8 on master, and it is logged on `AnalysisEngineActivated`, which gives the logs a precise in-data boundary for the switch.

## Requirements

**The ladder**

- **R1.** On every category that is **not** the rule-set's top category and that carries at least one Round rung (`feedbackRound2` or `feedbackRound3`), the ladder gains a second level 1 rung directly after the first: the same `feedback` string, with `source: "level1Repeat"`. The Round rungs follow it unchanged. A fully populated category therefore shows level 1, level 1, Round 2, Round 3, and logs levels 1, 2, 3, 4, 4 on five presses with sources `level1`, `level1Repeat`, `round2`, `round3`, `round3`.
- **R2.** A category with no Round content is unchanged: it repeats level 1 and logs `feedbackLevel` 1 with `source: "level1"` on every press. On the shipped rule-sets that is category 1 on every tab.
- **R3.** The top category's ladder is unchanged: `[level1, category100]`, logging 1, 2, 2 (Resolved decision 3).
- **R4.** The cap is unchanged: the level never rises above the number of rungs, so `feedbackLevel` and `source` always name the displayed string. The highest level any category can now log is 4.
- **R5.** `FeedbackSource` gains `"level1Repeat"`, and the `FeedbackSelection.level` documentation reads 1 to 4 rather than `1 | 2 | 3`.
- **R6.** The change is permanent and unconditional: no URL parameter, rule-set field or other switch (Resolved decision 2).

**The walk-through**

- **R7.** The second level 1 showing offers the **Show me** walk-through exactly as the first does, on every category whose level 1 token is `[Show me]` and whose `buildTour` returns a tour. No change to the button's token gate is needed or made; a test pins the behavior (R14).

**Logging**

- **R8.** All five events that carry `feedbackLevel` (`HazbotFeedbackShown`, `HazbotShowMeClicked`, `HazbotTourDismissed`, `HazbotTourCompleted`, `HazbotCoachMarkHiddenByRun`) carry the new numbering: on a category with Round content, 2 is Round 1 shown a second time, 3 is Round 2 and 4 is Round 3. `HazbotFeedbackShown.source` carries `level1Repeat` for the second showing. No event gains or loses a field.
- **R9.** Bump `APP_RULES_VERSION` from 8 to 9 in the same commit that changes the ladder, per `docs/hazbot-update-workflow.md` §7, and update the comment in `rules-version.ts` to describe what version 9 marks.
- **R10.** Update `LOGGED-EVENTS.md` to the new contract. Its new and changed text uses **Round 1, 2 and 3** for the advice as authored (Round 1 is the category's main feedback, the sheet's column C) and **level** only for the logged `feedbackLevel` number, since after this story the two no longer line up (Resolved decision below):
  - the `HazbotFeedbackShown` row: `source` gains `"level1Repeat"`, `feedbackLevel` runs 1 to 4, and the cap is stated in rungs rather than strings ("capped at how many strings the category carries" stops being true, since the repeated level 1 is a rung but not a new string);
  - a new subsection, in the style of the existing `appRulesVersion`-boundary notes, stating that from `appRulesVersion` 9 `feedbackLevel` 2 on a category with Round content is Round 1 shown a second time rather than Round 2, and 3 and 4 are Rounds 2 and 3, on all five events; that on `HazbotFeedbackShown` the two eras can also be told apart by `source` alone (`level1Repeat` never appears before the switch, and `round2` moves from level 2 to 3); and that on the four coach-mark events, which carry no `source`, sessions must be segmented on `appRulesVersion`;
  - the derived-query notes: the silent-repeat example becomes 1, 2, 3, 4, 4, and the note adds that levels 1 and 2 show the same string but are not a silent repeat, since the second showing is deliberate and carries its own `source`; the `[Show me]` sentence states that levels 1 and 2 (both Round 1) carry `[Show me]` and levels 3 and 4 carry `[Okay]` as the content ships at version 9, so a category-keyed query miscounts pairs that start at level 3 or 4; the reset example reads level 4 then level 1.
- **R11.** Handoff to Sam: once the release carrying this story is live in the students' activities, tell Sam the date it went live and what changed in plain terms (level 2 in the logs now means the Round 1 advice shown a second time; Rounds 2 and 3 are logged as 3 and 4; the new `level1Repeat` source marks the second showing). The date is when the activities start loading the release, not the PR merge date. This is a message, not a code deliverable; the spec records it so it is not forgotten.

**Developer tools** (Resolved decision 4)

- **R12.** The dev sidebar's per-category detail rows (`src/hazbot/engine/sidebar/sidebar.tsx`) are labeled by Round: `Feedback (Round 2):` and `Feedback (Round 3):`, and on the top category `Feedback (Round 2, not shown):` / `Feedback (Round 3, not shown):`. The muted explanatory line is unchanged.
- **R13.** The playbook generator (`scripts/playbook-impl.js`) labels the same lines `Feedback (Round 2)` / `Feedback (Round 3)`, and `(Round 2, not shown)` / `(Round 3, not shown)` on the top category, with its notes unchanged. Every `docs/hazbot-validation/*.md` is regenerated with `node scripts/generate-hazbot-validation-playbook.js`; the only diff is the label on each Round line (64 lines across the ten playbooks today). No rule-set content changes.

**Tests**

- **R14.** Unit tests pin the new behavior, each named against the mutation it catches:
  - `feedback-levels.test.ts`: the five-press walk on a full ladder (levels 1, 2, 3, 4, 4 and sources `level1`, `level1Repeat`, `round2`, `round3`, `round3`), the repeated rung's `feedback` equal to level 1's; a Round-2-only and a Round-3-only category each get the repeat rung; a no-Round category and the top category are unchanged (R2, R3), including a top category that carries Round columns.
  - `feedback-ladder.test.ts`: across the shipped rule-sets, the 32 pinned categories walk five presses to levels 1, 2, 3, 4, 4 with sources `level1`, `level1Repeat`, `round2`, `round3`, `round3`, presses 1 and 2 show the same string, and presses 2, 3 and 4 show three distinct strings. Also pin that every category outside the list (category 1s and top categories) never yields `level1Repeat`, with a length assertion first so an empty set cannot pass.
  - `hazbot-button.test.tsx`: the ladder walk logs the new levels and sources on `HazbotFeedbackShown`; with the shipped token shape (Round 2 and 3 `[Okay]`) the walk-through launches at levels 1 and 2 and at no later level, logging `HazbotShowMeClicked` with `feedbackLevel` 1 then 2 (R7); with an authored `[Show me]` Round 2 it also launches at level 3, so the gate still follows the displayed string's token; the per-category resume test still resumes rather than replays; the cap test is renamed to say rungs rather than strings (a Round-2-only category has two strings and three rungs).
  - `playbook-impl.test.js` and `sidebar.test.tsx`: the Round labels, in both the reachable and the "not shown" form.
  - Resets (R15) need no new test: `bottom-bar.test.tsx` ("Clear All clears the Hazbot feedback levels; Restart leaves them alone") and the `window.test` helper test in `stores.test.ts` already pin both routes, and the map stores the level as an opaque number, so a level-4 variant would catch no mutation the existing level-3 case misses.

- **R18.** Before the ladder commit, walk the ladder live in the running app with the Playwright MCP browser, per the repo's Hazbot validation workflow: on rule-set 23 category 2, five clicks show level 1 twice with **Show me**, then Round 2 and Round 3; the sidebar readout reaches `2→4` / `level 4 (round3)`; `window.test.resetHazbotFeedbackLevels()` returns the next click to level 1; and **Show me** on the second showing launches the walk-through. The unit tests mock the coach-mark library, so this is the only check of the popovers on screen.

**Unchanged**

- **R15.** Levels still reset on Clear All and on `window.test.resetHazbotFeedbackLevels()`, and not on Restart. No change to `ui.resetHazbotFeedback()`, `bottom-bar.tsx` or `stores.ts` beyond comment text that states the old ladder.
- **R16.** No change to any rule-set, category expression, factor variable, sim-prop, tour content or the workbook extraction. No `ENGINE_VERSION` bump: no substrate type or export changes (the sidebar row label is display text).

**Prose the change invalidates**

- **R17.** Update every comment that states the three-level ladder: `feedback-levels.ts` (header, `FeedbackSelection.level`, `ladder()`), `hazbot-button.tsx` ("up-to-three strings"), `stores.ts` (the reset helper's "check level 3"), and `playbook-impl.js` ("The level 2 / level 3 strings"). `CLAUDE.md` needs no change (it describes resets in terms of "level 1 again", which stays true), and neither do `README.md` or `docs/hazbot-update-workflow.md`; the ladder step re-greps all three before committing, in case they changed after this spec was written.

## Technical Notes

- **The one-line shape of the change.** In `ladder()`, after the top-category early return, push `{ feedback: cat.feedback, source: "level1Repeat" }` when the category carries either Round string, then the Round rungs as today. `selectFeedback` needs no change.
- **Tests that assert the old ladder** and must change: `feedback-levels.test.ts` (the level walk, the cap, Round-2-only, Round-3-promoted), `feedback-ladder.test.ts` (the three-press walk), `hazbot-button.test.tsx` ("walks level 1, 2, 3", the token-gate walk, the per-category resume test whose second visit to category 2 now shows "Two one" again, and the "never above the rung count" test whose max becomes 3 for a Round-2-only category), `playbook-impl.test.js` (four label assertions), `sidebar.test.tsx` (two label assertions and the not-shown case). Fixtures with `level: 3, source: "round3"` in `bottom-bar.test.tsx`, `ui.test.ts`, `stores.test.ts` and `engine-singleton.test.ts` use the pair as an arbitrary stored value and stay valid.
- **The sidebar diagnostic readout** (`buildFeedbackLevelDiagnostics`) renders `id→level` and `level N (source)` from the stored values, so it shows `level 2 (level1Repeat)` with no change.
- **Verified by running the change (throwaway, reverted).** With the one-line `ladder()` change applied, the full suite goes from green to 40 failures in exactly the three files listed above: the 32 per-category walks in `feedback-ladder.test.ts` (its "pins which categories carry a Round 2 rung" assertion still passes, since the set of laddered categories is unchanged), 4 `selectFeedback` cases, and 4 button cases (the level walk, the token gate, the per-category resume, the cap). Driving the real rule-set 23 category 2 through the real `HazbotButton` over five presses logged `HazbotFeedbackShown` levels and sources `[1, level1] [2, level1Repeat] [3, round2] [4, round3] [4, round3]`, showed an identical body on presses 1 and 2 with a `Show me` button on both, and launched the walk-through at levels 1 and 2 only (R7). The change lints clean.
- **Why the logs cannot be reinterpreted retroactively.** Before version 9, level 2 on a coaching category was Round 2; after it, level 2 is level 1 again. The number alone is ambiguous across the boundary, which is why R10 names `source` and `appRulesVersion` as the two ways to segment.

## Out of Scope

- A switch to turn the behavior on or off (Resolved decision 2).
- Repeating the success message on the top category (Resolved decision 3).
- Adding a repeat rung to categories with no Round content (see the judgment call below).
- Authoring or rewording any feedback string, including making Round 2 re-offer the walk-through.
- Amending the closed WM-46 spec.

## Open Questions

### RESOLVED: Should the second showing of level 1 be logged with its own `source`?
**Decision**: Yes, a new `source` value `level1Repeat`, so the log says which appearance a student saw. Trudi agreed on Slack, 2026-09-30.

### RESOLVED: Permanent, or switchable for the fall test?
**Decision**: Permanent for every run; no URL parameter or rule-set setting. Trudi agreed, 2026-09-30.

### RESOLVED: Does the success path change?
**Decision**: No. The top category's ladder stays `[level1, category100]` and still logs 1, 2, 2: the success message has no advice to miss and never reaches "all out of ideas". Trudi confirmed, 2026-09-30.

### RESOLVED: How are the Round rows labeled in the dev sidebar and the playbooks?
**Decision**: By Round ("Round 2" / "Round 3") rather than by level number, since both are developer tools and the label then survives any renumbering (decided 2026-09-29). Changing the generator means regenerating every `docs/hazbot-validation/*.md`, a change to generator output, not to rule-set content.

### RESOLVED: What do the log docs call the category's first advice?
**Context**: Sam, reviewing the summary page on 2026-09-30, pointed out that its log table used "level" both for the logged `feedbackLevel` number and for the first tier of advice ("Level 1 advice" beside "Round 2 advice"). After this story those diverge: logged level 2 is the first tier again, and level 3 is Round 2.
**Decision**: Call the category's main feedback **Round 1** in reader-facing text (the summary page, `LOGGED-EVENTS.md`, the handoff to Sam) and keep **level** for the logged number only. The `source` values are **not** renamed: `level1` has been logged since WM-46 and renaming it would break every existing query, and `level1Repeat` keeps the name Trudi agreed to so it stays paired with `level1`. `LOGGED-EVENTS.md` says in so many words that both mean Round 1. Code identifiers and comments keep "level 1", where it names the ladder position and is unambiguous.

### RESOLVED: Judgment call: which categories get the repeat rung?
**Options considered**:
- A) Only non-top categories that carry Round content (the 32 coaching categories).
- B) Every non-top category, including category 1, which would log 1, 2, 2 with `level1Repeat` while showing the same string it shows today.

**Decision**: A. It is what Trudi was told ("in every category that has Round 2 and Round 3 advice"), and it is the only place her complaint exists: a category with no Round content already repeats level 1 forever and never reaches "all out of ideas". B would change the logged numbers on category 1 with no change on screen, adding a contract change with nothing to show for it.

### RESOLVED: Judgment call: bump `APP_RULES_VERSION`?
**Options considered**:
- A) Bump 8 to 9 in the ladder commit.
- B) No bump, relying on `source` and the switch date.

**Decision**: A. §7 of the update workflow requires it for exactly this kind of change, and it is the only in-log boundary for the four coach-mark events, which carry `feedbackLevel` but no `source`. The switch date (R11) stays the plain-terms handoff for Sam.

### RESOLVED: Judgment call: where does the repeat rung sit relative to a Round-3-only category?
**Options considered**:
- A) Directly after level 1 whenever either Round string exists, so a Round-3-only category walks level 1, level 1, Round 3.
- B) Only when Round 2 exists.

**Decision**: A. No shipped category is Round-3-only, but the ladder already promotes Round 3 when Round 2 is absent; the skim problem is the same whichever Round follows, and gating on "any Round content" is the rule R1 states.

### RESOLVED: Low confidence: does the doubled `[Show me]` offer change the meaning of the "spent a level without taking the help" query in `LOGGED-EVENTS.md`?
**Context**: That query counts consecutive `HazbotFeedbackShown` pairs on one category with no `HazbotShowMeClicked` between them, restricted to where the earlier event's level offered the walk-through.
**Decision**: No new sentence needed beyond R10's edits. Walked through the new ladder: a level 1 closed without the tour then level 2 is a counted pair (correct, the offer was declined); level 2 closed then level 3 is counted (correct); level 3 (`[Okay]`) then level 4 is excluded because nothing was offered. The query is keyed on the displayed level's token, so it stays correct once R10 states which levels carry `[Show me]`.

### RESOLVED: Low confidence: is R13's "only diff is the label" true of the regenerated playbooks?
**Decision**: Verified. A throwaway relabel of `roundLabel` in `playbook-impl.js` followed by a regeneration changed exactly 64 lines across the ten playbooks (6, 6, 8, 8, 8, 6, 10, 2, 4, 6 for 23, 24, 25, 32, 33, 34, 35, 41, 44, 46), one per Round line, and nothing else; the generator is idempotent on master beforehand. Reverted.

## Self-Review

Roles: Senior Engineer, QA Engineer, Education Researcher (log integrity), Product Manager. Each finding below was checked against the code before being written down; candidates that did not survive (WM-64's saved state carrying Hazbot levels: it does not; `FeedbackSource` needing an `ENGINE_VERSION` bump: it is exported from the wildfire barrel, not the substrate) were dropped.

### QA Engineer

#### RESOLVED: R14's reset test could not fail
A level-4 reset test exercises the same `Map.clear()` the existing level-3 case in `bottom-bar.test.tsx` already pins, and `stores.test.ts` covers the `window.test` route; no mutation separates them. R14 now points at the existing tests instead of asking for a new one.

#### RESOLVED: R14's token-gate case dropped the authored-`[Show me]` Round 2 case
The existing gate test uses a `[Show me]` Round 2 on purpose, to prove the gate follows the displayed string rather than the level. Rewriting it to the shipped `[Okay]` shape alone would lose that. R14 now asks for both: shipped shape launches at 1 and 2 only; authored `[Show me]` Round 2 also launches at 3.

### Education Researcher

#### RESOLVED: "capped at how many strings the category carries" becomes false
`LOGGED-EVENTS.md` (the `HazbotFeedbackShown` row) and the `hazbot-button.test.tsx` test name "never logs a level above the number of strings the category carries" both equate strings with levels. After R1 a Round-2-only category carries two strings and three rungs, so an analyst reading the doc would treat level 3 as impossible there. R10 and R14 now state the cap in rungs.

