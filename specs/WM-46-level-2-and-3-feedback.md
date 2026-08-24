# Hazbot: level 2 and 3 feedback

**Jira**: https://concord-consortium.atlassian.net/browse/WM-46

**Status**: **Closed**

## Overview

Hazbot shows the same feedback every time a student clicks it while their category has not changed. This story adds a second and third level of feedback for a repeat click on the same category, drawn from the "Notes for Round 2" and "Notes for Round 3" columns that already exist in the source spreadsheet.

For a non-engineering audience: a student who clicks the Hazbot Analysis button twice without changing anything sees the identical hint twice today. The intent is that Hazbot escalates: the first click gives the category's coaching, a second click on the same result gives a different nudge, and a third points the student at a person. Trudi's framing on the ticket is "if Hazbot is clicked and the student has the SAME SCORE, it will give a different bit of feedback on the second and third time they click." The content already exists in the feedback tables, so most of the work is teaching the pipeline to read two columns it currently ignores, holding a small amount of per-category click state, and picking the right string. The wording is explicitly provisional: Sam described the level 2 and 3 text as "zero-th order approximations in the table for now", so this is expected to take more than one pass and more than one PR.

## Background

**Where the content lives, verified against the workbook.** Columns **G "Notes for Round 2"** and **H "Notes for Round 3"** exist on 7 of the 11 activity tabs (23, 24, 25, 32, 33, 34, 35) and are already populated: 56 cells in total, 28 in each column. The other four tabs (42, 45, 47, 54) have no such columns at all. Three patterns fall out and each became a requirement or a question:

- **Category 1 never has a level 2 or 3.** On every tab the "did not run the simulation" category is blank in both columns.
- **The top category has levels only on 23 and 24, read as a fill-down artifact.** **Confirmed by Sam on 2026-08-22, and fixed at source**: he cleared both cells on both tabs, so all seven authored tabs now leave the celebration row blank and the re-extract (`fa79150`) drops them from `23.ts` and `24.ts`. The counts in this section describe the workbook as analyzed at the branch cut, which had 56 Round cells; the current export has 52. Five of the seven authored tabs leave the celebration row blank in both columns, and the sheet's README assigns the after-success repeat click to category 100. Byte-identity with the row above is explicitly *not* offered as evidence: adjacent-row duplication is ordinary in this column (seven runs among genuine middle categories, four of them repeating the tab's own investigation name above a populated row holding different text).
- **Four tabs have no columns at all**, so on 42, 45, 47 and 54 every category is level 1 only.

**The level 3 string is a single global constant.** All 28 Round 3 cells resolve to one distinct value, `"I'm all out of ideas! Please ask your teacher or a classmate for help!`, including a stray leading double quote that is in the cell. This matches Sam's scope-down: "no more than three feedbacks given in total, with the last one being like 'please get help from teacher or friend?'".

**The Round 2/3 cells are not in column C's format.** Column C always reads `Hazbot: <text>\n[Label]`. Of the 56 Round 2/3 cells, **zero** carry the `Hazbot:` prefix and **zero** carry a trailing `[Label]` action token, so as authored they parse to a body with an empty label and a `Done` button, with the level-1 tour still armed behind it.

**Category 100 is already the authored answer to a neighboring question, and the extractor threw it away.** Every tab carries a category with id 100 whose studentAction is "Student repeats run after success and wants more feedback from Hazbot", correctly formatted with prefix and token, on all 11 tabs. `extract-impl.js` dropped every row with `id >= 100`. The sheet's README documents category 100 as belonging to a "feedback mechanism" module, which is this story.

**There is no click event to count.** `HazbotButtonClicked` and the three tour events are unhandled in `translate.ts` and fall through to a no-op, which is load-bearing rather than incidental: `log()` routes every event through `engine.consume()`, so a click that produced a reading would mutate the category it just reported. "The second and third time they click" therefore needs net-new state that does not live in the readings stream.

**This story stacks on WM-45**, which introduced `category.current` and selects feedback by `category_used` rather than by the all-time best. That is the value "same score" compares, and it changes more often than `best` does.

## Requirements

The requirement IDs below are the final set. The source spec carries the full measurement and rationale behind each one; what follows is the normative statement.

- **R1.** Teach the extractor to read columns G and H into two new optional `Category` fields, on the `arrowText` precedent for an optional column not every tab carries.
- **R1a.** Normalize the Round 2/3 cells at extraction, in `normalizeFeedback`. Four jobs: prepend `Hazbot: ` when the cell lacks it; strip a stray leading double quote **only on an unterminated one** (an odd number of quotes in the cell); append a default action token when the cell carries none; and warn on a Round 2/3 token outside the authored set. **The default token is level-aware**: a tokenless Round 2 cell on a category whose level-1 token is `[Show me]` defaults to `[Show me]`, everything else to `[Okay]`. The signature widens to take the category's level-1 token. Verified a no-op on existing content: across all 11 tabs, zero committed level-1 cells lack the prefix or a token.
- **R2.** `Category` gains `feedbackRound2?: string` and `feedbackRound3?: string`. Inert to the substrate, which parses only `expression`.
- **R2a.** Both levels stay per-category sheet data. Level 3 is not special-cased into a code constant even though it is provably one string today.
- **R3.** Hold feedback-level state **per category** for the page session, as `UIModel.hazbotFeedbackLevels`, a map from category id to the highest level shown. Nothing inside a run resets it; a category returned to resumes where it left off. The single exception is Clear All (R3b). The key is WM-45's `category_used`.
- **R3a.** Advance the level **when the popover actually opens**, not in `handleClick`. A click-site counter advances levels the student never sees: two presses in a row register two clicks and show one unchanged popover. Accepted cost: the level advances however the popover is dismissed, × and Escape included.
- **R3a-i.** "When it opens" is inside the deferred open, not at the top of the effect. Read the stored level and pick the string at the top of the effect (where `parseFeedback`, `buildTour` and `tourDoneLabel` need it); commit the map write and the R7a log inside `openOnce`, whose `opened` guard makes it exactly once per open.
- **R3b.** **Clear All clears the level map**, every category at once. This is the bottom-bar control (`data-testid="reload-button"`), which WM-47 renames from Reload. The top bar's refresh icon already clears it for free via `window.location.reload()`, so this is a consistency fix rather than a new behavior. Restart is deliberately **not** a reset.
- **R4.** The feedback pick becomes level-aware: level 1 uses `feedback`, level 2 the Round 2 string, level 3 the Round 3 string.
- **R4a.** The action token becomes the switch that offers the coach-mark walk-through: the tour launches only when `buildTour` returns a tour **and** the level's own text ends in `[Show me]`, compared trimmed and lowercased. Behavior-preserving at level 1 (the 34 categories with a tour are exactly the 34 whose level-1 token is `[Show me]`). What ships: level 2 re-offers the walk-through on the 34 coaching categories, level 3 is terminal everywhere.
- **R4b.** Extract the category-100 row as feedback-mechanism data into a new **optional** `RuleSet.repeatFeedback` slot, and use it for every repeat click on the tab's top category. **"Top category" means the highest category id below 100**; the `[Hooray!]` level-1 token agrees on all 11 tabs and is kept as a cross-check, not as the rule. Level 1 on the top category stays the celebration; level 2 and beyond is category 100's string, terminal. This is the one requirement a sheet edit cannot absorb *(confirmed by Sam 2026-08-22; see Confirmations outstanding)*.
- **R4c.** Category 100 must **not** enter `categories`. Its rows carry `-- no pseudo code --`, and a leak produces a `parse-error` that leaves the engine holding zero readings, so the activity classifies nothing at all. It is a feedback selection rather than a category value, so `matchedCategory` and `categoryUsed` keep logging the sub-100 category.
- **R5.** Level 3 is terminal, and more precisely **the level never rises above the highest level that exists** for that category, so the level and the string it names stay in step. A fully populated category logs 1, 2, 3, 3; the top category logs 1, 2, 2; a middle category on 42/45/47/54 logs 1, 1, 1.
- **R6.** Where a level is absent, fall back to the highest level that exists, and never blank.
- **R6a.** On 42, 45, 47 and 54 that means level 1 repeats and no global level 3 is substituted in. Eight middle categories are affected and every one carries a coach-mark walk-through, so a repeat click re-offers actionable help rather than stalling.
- **R7.** **Text only.** The levels change the popover string; the walk-through does not vary by level and no level is threaded into `buildTour`. Confirmed with the product owner 2026-08-21. R4a still gives an author per-level control over *whether* the existing walk-through is offered.
- **R7a.** Log the level on a **new** event at the display site: `HazbotFeedbackShown { ruleSetId, categoryId, feedbackLevel, source }`. `HazbotButtonClicked` is left exactly as it is. Document the event in `LOGGED-EVENTS.md`, including that `feedbackLevel` is **not monotonic** within a session (R3b resets it, as does a top-bar reload by ending the page session).
- **R7b.** It is a new event rather than a field on the click because the click site and the display site are different moments and do not correspond one-to-one; deriving the level downstream by counting clicks over-counts by exactly the presses that displayed nothing.
- **R7c.** Write down which of the two logged series answers which question: the `HazbotButtonClicked` / `HazbotFeedbackShown` gap counts presses that opened **no popover at all**; a press that showed nothing new leaves **no gap** and is found as consecutive `HazbotFeedbackShown` events on one `categoryId` with the same `feedbackLevel` and `source`.
- **R7d.** `source` (`"level1" | "round2" | "round3" | "category100"`) exists because `feedbackLevel` alone cannot identify the string, and because the source survives the wording churn Sam expects. A sentinel level was rejected for breaking the field's `1 | 2 | 3` contract.
- **R7e.** Add `feedbackLevel` to `HazbotShowMeClicked`, `HazbotTourCompleted` and `HazbotTourDismissed`, since the tour can now launch from two levels and nothing else in the payload separates them.
- **R8.** Bump `APP_RULES_VERSION` from **6 to 7**, once for this branch (master is at 4, WM-51 took it to 5, WM-45 to 6).
- **R8a.** Widen `docs/hazbot-update-workflow.md` §7 to cover **feedback-selection** semantics, folded into WM-45's evaluation-semantics bullet rather than bolted on as a third clause, and inherit its placement rule (the bump belongs in the commit that changes the semantics).
- **R8b.** Bump `ENGINE_VERSION` from **`0.1.0` to `0.2.0`**. Three additive substrate items: R2's two `Category` fields, R4b's optional `RuleSet` slot, and the new `topCategoryId` barrel export. Optional is what makes it additive, since `RuleSet` is hand-constructed in 17 substrate test sites.
- **R9.** Regenerate the validation playbooks and the tour data; the tour data must come back **unchanged**. **The replay fixture is deliberately not regenerated**: the generator never serializes the rule-set, so the new fields structurally cannot reach it. If it ever does fail, suspect an R4c leak rather than a stale fixture.
- **R9a.** Teach the playbook generator the new levels: emit the Round 2, Round 3 and category-100 lines alongside the existing Feedback line. **Label the top category's Round rows `(level 2, not shown)` / `(level 3, not shown)`** with a note that the repeat-click line supersedes them; every other category's rows are unlabeled.
- **R9b.** Surface the feedback level in the dev sidebar, routed through the existing host-supplied `diagnostics` prop rather than through new substrate API. The readout lands in the **Diagnostics** section and is **UI-store state only**: the level map rendered compactly plus the level and `source` last displayed. The empty map is a rendered state (`Feedback levels: (none)`), not an absent one.
- **R9b-i.** The level readout must not ride on `buildPresetDiagnostics`'s return value, or it disappears on every URL without `?preset`. Compose the array at the `app.tsx` call site from the preset half and the level half, either able to be absent, `undefined` when both are; keep `buildPresetDiagnostics` pure.
- **R9c.** Expose `window.test.resetHazbotFeedbackLevels()` and document it in `CLAUDE.md`. This costs a reordering: hoist the `UIModel` construction above the `window.test` assignment in `stores.ts` and pass it to `createTestHelpers`.
- **R9d.** Render the new strings in the dev sidebar's per-category detail panel beside the existing `Feedback:` row, omitted when the category carries none, with category 100 shown once per rule-set. Label the top category's rows `not shown` exactly as R9a does, with a muted line beneath.
- **R10.** No change to any category expression, factor variable or sim-prop.
- **R11.** Pin the behavior with unit tests, not only with regenerated artifacts. The selection rule is pure logic with no on-screen symptom when it drifts.
- **R11a.** `extract-impl.test.js`: `normalizeFeedback`'s four new jobs (including all three branches of the level-aware default) and the new token warning, each with a case proving it is a no-op on a well-formed column C cell.
- **R11b.** The category-100 extraction is pinned in **two places**: the *mechanism* on synthetic rows in `extract-impl.test.js` (the row lands in the slot; it does not land in `categories`), and the *corpus* in `src/hazbot/rule-sets/index.test.ts` (every committed rule-set carries the slot; no committed `categories` array holds an id >= 100), where it is a re-extraction regression gate.
- **R11c.** `hazbot-button.test.tsx`: the level ladder, four cases: 1, 2, 3, 3; the top category 1, 2, 2 with `source: "category100"`; a no-Round-columns category 1, 1, 1; and a category left and returned to resuming rather than replaying.
- **R11d.** `hazbot-button.test.tsx`: the level advances on display, not on click. A press while the popover is open logs a second `HazbotButtonClicked` and neither advances the level nor emits a second `HazbotFeedbackShown`.
- **R11e.** Assert the R5 cap directly: the logged `feedbackLevel` never exceeds the number of strings that exist for that category.
- **R11f.** `playbook-impl.test.js`: the new Round 2, Round 3 and category-100 lines, the no-Round-columns negative case, and R9a's labeling in both directions.
- **R11g.** `hazbot-button.test.tsx`: R4a's token gate, four cases: launch at level 1, launch at level 2, no launch at level 3, and `[Show Me]` launches (pinning the trimmed, lowercased comparison).
- **R11h.** `sidebar.test.tsx`: R9d's per-category rows (present / absent rather than empty / labeled on the top category / category 100 once per rule-set) and R9b's diagnostic line including its `(none)` zero state, scoped to the rendering contract only.
- **R11i.** Pin R9b-i in `src/components/app.test.tsx`, where the composition lives: with no requested preset the array handed to `Sidebar` still carries the level readout, and with neither half present it is `undefined` rather than `[]`.

## Technical Notes

**Implementation anchors**, fixed in the spec so the type, the emitter, the generator, the sidebar, the button and the tests could not invent six different names:

```ts
// src/hazbot/engine/types.ts, Category — both optional
feedbackRound2?: string;   // sheet column G, "Notes for Round 2"
feedbackRound3?: string;   // sheet column H, "Notes for Round 3"

// src/hazbot/engine/types.ts, RuleSet — optional
repeatFeedback?: { id: number; studentAction: string; feedback: string };

// src/models/ui.ts, UIModel
@observable public hazbotFeedbackLevels = new Map<number, number>();
@observable public hazbotLastFeedbackShown?: { level: number; source: string } = undefined;

// src/hazbot/engine/top-category.ts, new substrate module, exported from the barrel
export function topCategoryId(ruleSet: Pick<RuleSet, "categories"> | undefined): number | null;
```

**MobX constraints on the level map.** `UIModel` had no collection precedent (every existing `@observable` there is a primitive). MobX 6 deep-converts a `Map` assigned to an `@observable` field into an `ObservableMap`, so `.set()` is tracked and the sidebar readout re-renders; a plain object or a module-level `Map` would give a working feature with a dead readout. `configure({ enforceActions: "never" })` means it is mutated directly with no `@action` wrapper. Verified live: `isObservableMap(stores.ui.hazbotFeedbackLevels)` is true.

**Source workbook and regeneration.** The authoritative export is `Wildfire Hazbot Feedback Tables (8).xlsx`; the full path matters, since the same directory holds around twenty files matching the pattern. Re-extracting it reproduces the committed rule-sets byte for byte, so the extractor writes in place and `git diff` is the sheet diff. Both derived-artifact generators are idempotent on the current tree, which is what gives R9's "the tour data must come back unchanged" something real to fail against.

**Two display consumers of `cat.feedback`, not one.** `hazbot-button.tsx` is the only **student-facing** reader; the dev sidebar's per-category detail panel is the second display site (R9d), and `playbook-impl.js` and `extract-impl.js` are pipeline.

**Why text-only is additive rather than a corner cut.** Varying the walk-through per level would need per-level anchor arrays, since `buildTour` returns null when the anchor and step counts disagree and the anchors are hand-authored per category. Keeping the level out of `buildTour` means a later per-level tour is an addition rather than a rewrite, and it keeps this story's diff off the lines WM-32 and WM-31 touch.

**One unavoidable diff overlap: `bottom-bar.tsx`.** R3b hangs the level-map clear off `handleReload`, and WM-47 is relabeling and moving that same button and may rename its `reload-button` testid. R3b is one line and depends on neither, so whichever story lands second rebases it.

**Where the click state cannot live.** The readings stream is deliberately click-free, so the counter belongs in the UI store alongside `ui.showHazbotFeedback` and `ui.hazbotPulseArmed`, not in the engine.

**Terminal PR in the stack.** This branch sits on WM-45, which sits on WM-51, and nothing is stacked on it, which is what made shipping a best answer to each open question cheap: any of them can be revised in place without rebasing a dependent branch.

## Out of Scope

- **Per-level coach-mark walk-throughs** (R7). Parked with WM-32, whose mechanism section already records the sizing.
- **Sam's "comprehensive diagnosis and serious help" branch** and the four-clicks-total rule from his design doc. Scoped out by Sam on 2026-08-18.
- **The `run_record` / `run_history` structure** and `coachmark_tutorial` instrumentation. Deferred by WM-45.
- **The Relations column** in the factor-variable block. That is WM-50.
- **Authoring the missing Round 2/3 columns on 42, 45, 47 and 54.** A content gap flagged to Trudi, not blocking. Tab 45 looks inconsistent with itself: it groups with the seven authored tabs on its category-100 text but with the unauthored four on its Round columns.
- **Authoring the level 2 and 3 wording.** Trudi and Sam own the content; this story ships whatever the sheet holds. The pipeline supplies a default **action token** for a cell that carries none, because that convention is invented here; it supplies no words.
- **Changing which category is selected.** That is WM-45.

## Confirmations outstanding with Sam and Trudi

Neither Sam nor Trudi was reachable when the branch was cut (2026-08-22, a Saturday; Trudi on vacation that week), so each question ships its most defensible answer and becomes "here is what it does, is that right" rather than a blocker.

**Question 1 was answered the same day: yes** (Sam, Slack, 2026-08-22 12:12). He confirmed category 100 as the source for the repeat click after success, and he had already cleared 23/24's G6 and H6 at source, so the sheet and the code now agree and the reversal diff is dead rather than parked. Questions 2 and 3 are Trudi's and remain open. **Question 4 was never sent to Sam**: whether a level re-offers the coach mark at all is already answered by his design note, and what is actually open is whether each Round 2 body is paired with the right walk-through, which is content and therefore Trudi's.

| # | Owner | What shipped | Cost if the answer differs |
|---|---|---|---|
| ~~1~~ | Sam | The top category's repeat click uses category 100; 23/24's G6/H6 discarded as a fill-down (R4b) | **ANSWERED YES 2026-08-22.** No cost: the shipped behavior is what he wanted, and he cleared the two cells at source |
| 2 | Trudi | The "Supression" misspelling (tab 33 category 2) ships verbatim; the stray leading `"` is stripped by the pipeline; tab 34's category-100 narrative names the wrong category | Re-import, two cells |
| 3 | Trudi | 42, 45, 47 and 54 repeat level 1 on their middle categories (R6a) | Re-import |
| 4 | ~~Sam~~ **Trudi** | Level 2 re-offers the coach-mark walk-through; level 3 is terminal (R1a, R4a) | One line in `normalizeFeedback`, or per cell in the sheet. The mechanism half is settled by Sam's design note; what is open is the wording pairing below |

Question 4 leaves two content judgments open that no measurement settles: 12 of the 28 Round 2 cells read "Go down and look at the questions you need to answer.", and 10 of those sit on `[Show me]` categories, so the body sends the student **down** the page while the re-offered walk-through points **up** at the model controls; and "more insistent" is not yet expressed anywhere, since level 2 offers the identical tour with an identical button. Both are absorbed per cell by typing `[Okay]` into the affected cells, which R4a was built to allow and which needs no code.

## Not Yet Implemented

- **A dismissal event for the intro popover.** R3a's accepted cost is that closing a popover with × or Escape spends that level without the student seeing the walk-through. It is derivable from the shipped events (consecutive `HazbotFeedbackShown` on one category with no `HazbotShowMeClicked` between them, on `[Show me]` categories only), and that query is documented instead. A real dismissal event would be net-new logging beyond R7a and R7e — deferred unless the PIs find it matters.
- **The sheet-side tidy-ups.** Nothing was typed into the workbook, since editing our copy would trade the byte-for-byte re-extraction invariant for a silent divergence. **G6/H6 on tabs 23 and 24 are done**: Sam cleared them at source on 2026-08-22 and `fa79150` re-extracted the result. The "Supression" fix, tab 34's category-100 narrative, and any explicit `[Show me]` tokens are still left to Trudi's next export.
- ~~**The Question 1 reversal.**~~ **Retired 2026-08-22.** Sam confirmed the shipped behavior and cleared the two cells, so the 9-line `ladder()` diff has nothing left to honor. With it goes the reason to keep the `tmp/wm46*` measurement trail, which is what leaves two suites red on a local `npm test`.
- ~~**`testPathIgnorePatterns` scoped to exclude `<rootDir>/tmp/`.**~~ **Moot 2026-08-22.** The two locally-red suites came from this plan's own spike artifacts, and those were deleted once question 1 closed, so a clean tree now runs green with no `package.json` change. The workbook probes worth keeping were moved to the repo oob namespace under `hazbot-sweep/wm46-probes/`, where jest cannot collect them.
- **Windowed truth trees and a windowed Factor Variables panel in the sidebar.** Inherited from WM-45's R8b and not revisited here.

## Decisions

### The Round 2/3 cells carry no `Hazbot:` prefix and no `[Label]` action token. Where does that get fixed?
**Context**: All 56 populated cells are bare sentences, so both level 2 and level 3 parse to a body with an empty label, and the coachmarks library defaults the button to `Done`. The larger finding is that the token and the walk-through are decoupled: `buildTour` is called with the category, not the level, so swapping only the string leaves the level-1 tour armed under level 2/3 text.

**Options considered**:
- A) Ask Trudi and Sam to author the cells in column C's format, and change no code.
- B) Normalize at extraction: the emitter adds the prefix and a default token when the cell lacks them.
- C) Normalize at render, in `parseFeedback`.
- D) Treat the missing token as intentional and render a fixed default button regardless of the cell.

**Decision**: **B, plus the token controls the tour** (R1a, R4a). Two measurements made it safe rather than a guess: zero committed level-1 cells lack the prefix or a token, so normalization cannot change existing output; and the 34 categories with a tour are exactly the 34 whose token is `[Show me]`, so gating on the token changes no current behavior. A was rejected as blocking on 56 cells being re-authored; C because `parseFeedback` is a pure display parser and the fixup belongs where `normalizeFeedback` already lives; D because it takes authoring control away for no saving.

**Amended**: the default token is level-aware rather than a fixed `[Okay]`. See the level-2 walk-through decision below.

---

### What resets the feedback level?
**Context**: The sheet does not say. Traced against one session on tab 23 (defaults run → category 2, wrong zones → category 3, revert → category 2), the deciding row is the return to a category already seen.

**Options considered**:
- A) Reset only when the selected category changes.
- B) Reset when the category changes **or** a new run starts, so each run gets a fresh escalation.
- C) Never reset within a page session: the level is per category, so returning resumes where it left off.

**Decision**: **C, plus increment-on-display** (R3, R3a). A and B both replay a hint the student has already read and did not act on, which is close to the complaint the feedback work exists to fix, and under WM-45's run-scoped category that return is the common case rather than an edge one. B additionally makes levels 2 and 3 nearly unreachable for a student who is actually working, and contradicts Sam's per-category "in total" count; its one real virtue, throttling a frustrated clicker, is delivered by R3a instead.

**Accepted consequence**: once a category has spent its three feedbacks, every later occurrence of it shows "ask your teacher". That is Sam's cap working as written. Two routes back to level 1: Clear All and a browser reload. Restart is deliberately not one.

---

### Level 3 is one identical string everywhere. Does it stay per-category sheet data?
**Context**: All 28 Round 3 cells resolve to a single value across all 7 tabs, and Sam's scope-down describes level 3 as a fixed role rather than per-category content. The 28 Round 2 cells are the opposite case: 9 distinct values.

**Options considered**:
- A) Keep it as a per-category column.
- B) Read it from the sheet but store it once, failing the extraction if a tab ever disagrees.
- C) Make level 3 a code constant and stop reading column H.

**Decision**: **A** (R2a). The duplication lives in generated files, so removing it buys nothing. B looks like WM-45's `range_cc` pinning test, but that guards a *derived* value with one correct answer, while this is authored content with nothing to check it against, so the assertion would fail the build the first time Trudi writes a different level 3. C puts the one string that tells a stuck student to ask a person behind a developer.

---

### Category 100 is authored, correctly formatted, present on all 11 tabs, and thrown away. Is it this story's answer for a repeat click after success?
**Context**: Every tab carries a category 100 whose studentAction is "Student repeats run after success and wants more feedback from Hazbot". The extractor dropped it, and the sheet's own README says it belongs in the feedback-mechanism module, which is this story.

**Options considered**:
- A) Bring it into the extraction as feedback-mechanism data (not a matchable category) and use it for any repeat click on the top category, on all 11 tabs.
- B) Leave it dropped and use the Round 2/3 columns where they exist (23, 24), repeating the celebration elsewhere.
- C) Leave it dropped and suppress escalation on the top category entirely.
- D) Out of scope for WM-46; file it separately.

**Decision**: **A** (R4b, R4c). It uses content that is authored, correctly formatted, README-documented, present on all 11 tabs including the four with no Round columns, and currently discarded. B implements the fill-down on two tabs and does nothing on the other five; C discards the content and repeats the celebration forever; D defers the one case the README explicitly assigns here. R4c is what makes A safe rather than a trap: the row lands in its own slot, never in `categories`, and never becomes a logged category id.

---

### Four tabs have no Round 2/3 columns at all. Is level 1 repeating the intended behavior there?
**Context**: After R4b takes the top category and category 1 is set aside, only eight middle categories are affected (42 cat 2; 45 cats 2-3; 47 cats 2-4; 54 cats 2-3), and measured, **all eight have a coach-mark walk-through**.

**Options considered**:
- A) Yes. Those activities are level 1 only until someone authors the columns.
- B) Apply the global level 3 string on a repeat click even where no level 2 exists.
- C) Ask Trudi whether the four tabs were an oversight before deciding.

**Decision**: **A** (R6a), with the gap reported to Trudi rather than waiting on her. B invents escalation the author did not write and lands it on the eight categories least in need of it: their level 1 is a working walk-through, and B would replace it with "I'm all out of ideas" on the second click. C is not a blocker, since A ships either way and the implementation is identical.

---

### Should the feedback level be logged?
**Context**: Nothing is logged when the intro popover opens. That has not mattered while one category meant one string; this story ends the one-to-one, and Sam expects the wording to churn, so the mapping would not be reconstructible after the fact.

**Options considered**:
- A) Add `feedbackLevel` to `HazbotButtonClicked`.
- B) Derive it downstream by counting consecutive same-category clicks.
- C) No logging change.

**Decision**: **A prime**, a new display-site event (R7a, R7b, R7c). B is unsound rather than merely weaker, since clicks and displays do not correspond and a downstream count over-reports by the presses that showed nothing. Putting the level on the click records it against an action that may not have produced one. Moving the existing click log into the effect was rejected outright: it would silently convert a click counter into a display counter, the longitudinal break WM-45's R9 exists to prevent.

---

### What does this branch bump, and does the `APP_RULES_VERSION` policy actually cover it?
**Context**: Two halves. The substrate version was not mentioned anywhere in the draft, though `Category` and `RuleSet` are both barrel-exported and both gain fields. And `docs/hazbot-update-workflow.md` §7 authorizes a rules bump for expression, factor-variable and defaults changes, none of which this story makes, so on a literal reading it excluded this case.

**Options considered**:
- A) Bump both, name the numbers, and widen §7 to cover feedback-selection semantics.
- B) Bump both and name the numbers, but leave §7 alone and justify the rules bump as "new rule-set content".
- C) Bump `ENGINE_VERSION` only.
- D) Bump `APP_RULES_VERSION` only, since the type additions are inert cargo.

**Decision**: **A** (R8, R8a, R8b). The rules bump is owed whatever §7 currently says, because §7's own stated purpose is that dataset consumers can correlate sessions with the rule-set version, and this branch is exactly such a boundary. A over B because this is the second consecutive story where the policy plainly should cover the case and does not, which is a sign it is written too narrowly. D rejected outright: inert to the engine is not absent from the API.

---

### What `feedbackLevel` is logged when category 100's string is shown?
**Context**: R4b makes the top category's repeat feedback come from category 100 while `categoryId` stays sub-100. Working it through surfaced a second ambiguity: nothing said whether the *counter* stops or keeps climbing, so as written a third click on the top category would log level 3 while showing the level 2 string.

**Options considered**:
- A) Log it as level 2 and accept that the source is not distinguishable.
- B) Log a distinct sentinel level (e.g. `100`).
- C) Add a separate `source` field naming where the string came from.

**Decision**: **C, plus a cap on the counter** (R5 amended, R7a, R7d). The level never exceeds what exists for the category, and `source` names the origin. C over B because a sentinel breaks the `1 | 2 | 3` contract for every consumer; C over A because the source survives the wording churn Sam has told us to expect, and a level number alone does not.

---

### The "56 cells" figure was Round 2 plus Round 3, and three passages attributed it to Round 3 alone
**Context**: Measured on the workbook, there are 28 Round 2 and 28 Round 3 cells. The uniformity claim and the stray-quote claim are both true of 28, not 56, so Trudi was being asked to fix twice as many cells as exist.

**Decision**: Corrected in four places, with "28 in each column" recorded next to the total so the two numbers cannot drift apart again. R2a additionally gained the Round 2 count (9 distinct values), which is the sharper argument for keeping both columns as per-category sheet data.

---

### "The tab's top category" was never defined, and three requirements turn on it
**Context**: Category ids are contiguous `1..N` on all 11 tabs, and the top category is also exactly the one whose level-1 token is `[Hooray!]`, 11 for 11. The two rules agree today and could diverge under a future re-extract.

**Decision**: R4b defines it as **the highest category id below 100** and keeps the `[Hooray!]` correspondence as a cross-check, so a future re-extract that breaks the agreement fails against a stated definition rather than an assumed one. A third in-sheet signal (the category-100 narrative naming the category it follows) disagrees on tab 34 and is read as a copy-paste slip; nothing ships from that cell either way.

---

### R4a puts the literal string `[Show me]` into code for the first time
**Context**: Verified by grep, no code path compares against token text today; the tour decision is structural, which is why the 34-for-34 correspondence holds without any code knowing the word. A near-miss like `[Show me how]` would silently ship a terminal popover on a category that has a walk-through to offer.

**Decision**: The comparison is trimmed and lowercased, and R1a's normalizer warns at extraction when a Round 2/3 cell carries a token outside the authored set (`Show me`, `Okay`, `Hooray!`, `Got it!`), next to the id-versus-marker warning that already lives there.

---

### R4b's new `RuleSet` slot was not stated to be optional, and R8b's minor bump depends on it
**Context**: `RuleSet` is hand-constructed in 17 places across the substrate's own tests. A required slot breaks all of them and makes the change breaking rather than additive.

**Decision**: R4b says optional, and R8b names the 17 literals as the reason optionality is what keeps the bump minor.

---

### A second source typo ships to students, and the Trudi question list missed it
**Context**: One Round 2 cell (tab 33 category 2) reads "Fire Supression Investigation". R1a strips the stray quote but nothing catches this, and it does not occur in any committed level-1 string, so it is new student-facing content this story introduces.

**Decision**: Both typos go to Trudi, separated by consequence: the quote is stripped by the pipeline, the misspelling is not. Not patched in `normalizeFeedback` (content, not format) and not edited in our copy of the workbook, which would trade the byte-for-byte re-extraction invariant for a silent divergence and would be reintroduced by her next export anyway.

---

### The spec stated no testing requirements at all
**Context**: WM-45, the immediately preceding story in the same stack, carries seven, several written because a spiked implementation passed while being wrong. The gap is sharpest on the R5 cap and the R6 fallback, which are pure logic: a category that logs `feedbackLevel: 3` while showing level 1 text looks fine on screen and corrupts only the dataset.

**Decision**: Added R11 through R11i.

---

### Nothing reset the level state, so the feature could not be walked
**Context**: `simulation.reload()` is an in-model reset that leaves the `ui` store alone, so validating level 3 on the 34 coaching categories would have cost a full browser reload and Terrain Setup walk each time.

**Decision**: Added R9c, a `window.test.resetHazbotFeedbackLevels()` helper on the pattern the repo already documents for Playwright walks. Clear All is not a substitute: it clears every category at once and resets the whole activity.

---

### Should R9 also regenerate the replay fixture, given WM-45 just touched it?
**Context**: WM-45 added `current` and `category_used` to the fixture one commit earlier, so its absence from R9 needed to be a decision rather than an oversight.

**Decision**: **Correctly omitted, and R9 now says so.** Established by spiking the new field shape onto ruleset 25, the tab the fixture replays: the test passes unregenerated, and regenerating produces a diff where every changed line is a `sessionId` the test strips from both sides anyway. The fixture's README sets a failure-driven policy and names its diff as the review surface for semantic drift, so regenerating without cause spends that surface on noise. The same spike hardened R4c: injecting a real category-100 row into `categories` yields a `parse-error` and **zero readings**, so the failure mode is total rather than partial.

---

### R4b read as settled in Requirements, but it is the one decision that costs a rebuild
**Context**: The questions section was clear that R4b is the single place the spec deliberately discards authored content; R4b itself said none of that, so a reviewer reading only Requirements saw a settled requirement.

**Decision**: R4b states outright that it is the one requirement a sheet edit cannot absorb, gives the evidence and its status, and forward-references Question 1.

---

### R7c overstated what the click/display gap measures
**Context**: Under R5's cap, a repeat click on an exhausted category *does* open a popover and *does* emit `HazbotFeedbackShown`, so the gap stays zero while nothing new appears. Verified against the real component: two presses with the popover open give two click events, one coachmarks engine, one `highlight` call.

**Decision**: R7c is rewritten to separate the two queries. The gap counts presses that opened **no popover at all**; a press that showed nothing new leaves no gap and is found as consecutive `HazbotFeedbackShown` events with the same `categoryId`, `feedbackLevel` and `source`.

---

### The app's Reload button did not reset the level, so a full restart could open on "ask your teacher"
**Context**: `bottom-bar.tsx`'s handler calls `simulation.reload()`, which touches the simulation model only. So a student could press Reload, walk back through Terrain Setup, place fresh sparks, run, click Hazbot, and be told "I'm all out of ideas!" as the first thing they see after a full restart, with no way for a teacher to explain or clear it. The app also has a *second* reload control, the top bar's refresh icon, which calls `window.location.reload()` and therefore already clears the map for free, so without a change the two controls disagreed.

**Decision**: The map is cleared, all of it, on Clear All (**R3b**), which makes the two controls agree and is the only one of the two needing code. WM-47 renames this exact button from Reload to Clear All and exists because PD reported mis-clicks on it, so a button labeled "all" that silently preserves Hazbot's escalation is a worse mismatch than one labeled Reload. Restart is deliberately not a reset. Accepted tension with Sam's cap: a determined student can exceed three per category, at the price of redoing the whole activity.

---

### R9c's helper could not reach the `ui` store as `stores.ts` was ordered
**Context**: `createStores()` constructs the simulation, assigns `window.test = createTestHelpers(simulation)`, and only then constructs `new UIModel()` inside the returned object literal, so the helper had no way to see the store it needs to clear.

**Decision**: Hoist the `UIModel` construction above the `window.test` assignment and pass it in. R3b is unaffected, since `handleReload` already has `ui` in scope. Verified after implementing that the helper empties the map on **the same `UIModel` the returned stores hold**, which is the whole point of the hoist and the thing that fails silently without it.

---

### R3b makes `feedbackLevel` non-monotonic within a session, and nothing told an analyst why
**Context**: After R3b the level can drop back to 1 mid-session. Both reset routes are already logged and documented, so the information is recoverable, but nothing says an analyst must segment on them.

**Decision**: R7a requires the `LOGGED-EVENTS.md` entry to state the non-monotonicity and name both reset routes, following the precedent WM-45 set with its `categoryId`-above-`matchedCategory` note.

---

### The walk-through was never re-offered at level 2, which is the one thing Sam's design asks for by name
**Context**: Measured, **0 of 56** Round 2/3 cells carry a bracket token, so R1a's default decides the behavior for every level 2 and 3 popover that ships, and a fixed `[Okay]` made all of them terminal. The consequence compounds with R3a: a student who opens a coaching category's level 1 and closes it with × or Escape has spent that level, so the walk-through, the only actionable help the feature has, was reachable for exactly one dismissed popover and then gone for the session. The better-authored tabs degrade worse, since on 42/45/47/54 level 1 simply repeats.

**Options considered**:
- A) Ask Trudi and Sam to type `[Show me]` into the Round 2 cells of the coaching categories. Pure sheet edit.
- B) Make R1a's default token level-aware: a tokenless Round 2 cell on a category with a tour defaults to `[Show me]`; Round 3 keeps `[Okay]`.
- C) Accept level 2 and 3 as terminal.

**Decision**: first resolved as **A with C's code shipping**, then **superseded: B ships.** The argument that had ruled B out was that defaulting the token would override a deliberate blank. It cannot: the token convention for the Round columns is invented in this spec, so no author has ever had the option of declining it. With 0 of 56 cells carrying a token, the "default" is not an edge case but the rule for every level 2 and 3 popover, and choosing `[Okay]` there was not the neutral option but a silent decision against the design note. One line reverses it, and an authored token still wins, so Question 4 becomes a confirm-what-shipped question.

---

### The fill-down evidence for R4b was presented as decisive, and half of it was not evidence at all
**Context**: The case rested on two facts: five blank celebration rows, and byte-identity between the 23/24 top row and the row above. Measured across the Round 2 column, adjacent-row duplication is the *norm*: nine runs in total, of which the two disputed cells cannot be counted (circular), three sit above the blank celebration row (neither support nor undercut), and four sit above a populated row holding different text. Those four each repeat the tab's own investigation name ("Wind", "Mountain", "Vegetation", "Tree Survival"), which a drag-fill cannot produce on four separate tabs.

**Decision**: R4b is unchanged; its evidence is corrected in all three places that state it. The case rests on **one** fact, the five blank celebration rows plus the README. Question 1 drops the "Row above" column and says in as many words that the two 23/24 runs are excluded because they are the cells the question is about, so Sam is not cued to agree for a reason that does not hold.

---

### `hazbot-button.tsx` is not the only display consumer of `category.feedback`
**Context**: Verified by grep, four readers exist and two of them display: the student-facing popover and the dev sidebar's per-category detail panel. After this story the sidebar would show one of up to three strings with nothing to say the other two exist, which is the same staleness R9a fixes for the playbooks, on the surface a walker actually has open while clicking.

**Decision**: Technical Notes now says "one *student-facing* consumer" and lists all four. Added **R9d**: the sidebar's detail panel renders the Round 2 and Round 3 strings beside its `Feedback:` row, omitting rows a category does not carry, with category 100 shown once per rule-set.

---

### R9b's stated placement and its stated mechanism were incompatible
**Context**: R9b asked for the readout "beside WM-45's Category block" *and* routed through the host-supplied `diagnostics` prop. Those render in different sections and the ordering is fixed in the substrate component. Its second half asked for "the level for the current `used` category", which needs an engine value inside `AppComponent`, a MobX observer over the stores that never calls `useAnalysisEngine`; it would appear to work only because App re-renders off `simulation.time`.

**Decision**: Keep the `diagnostics` route, drop the placement wording (the readout renders in the Diagnostics section above the Category block, and a walker reads the two together), and make the content **UI-store state only**: the level map rendered compactly plus the last level and `source`. Showing the whole map is also the more useful readout, since it covers every category the student has touched.

---

### R11b put an all-11-tabs assertion in a test file that never sees a real tab
**Context**: `extract-impl.test.js` is driven entirely by a hand-written synthetic fixture; it never reads a workbook and never imports the committed rule-sets, so it structurally cannot assert anything about 11 tabs.

**Decision**: R11b is split. The *mechanism* half stays on synthetic rows, both directions. The *corpus* half moves to `src/hazbot/rule-sets/index.test.ts`, which already loops all 11 by name, where it is a re-extraction regression gate rather than a unit test, which is what R4c's zero-readings blast radius calls for.

---

### R4a's token gate was made load-bearing and nothing tested it
**Context**: The existing walk-through block gates entirely on `buildTour` returning a tour or null, so none of its six tests reaches the new branch. The missing branch has no visible symptom: at level 2 the body text is correct and only the button label differs.

**Decision**: Added **R11g**, four cases: launch at level 1, launch at level 2, no launch at level 3, and `[Show Me]` launches. Revised the same day when R1a's default became level-aware, since that flipped which branch ships.

---

### R9d and R9b's sidebar readouts were added without test requirements, while their playbook twin had one
**Context**: R11f pins the playbook generator's new lines including the negative case; R9a and R9d exist for the same reason and R9d is on the surface a walker actually has open.

**Decision**: Added **R11h**, scoped to the rendering contract only. The level *arithmetic* is deliberately left to R11c and R11e so the same rule is not pinned twice.

---

### R3a's increment site was one level too shallow
**Context**: "When the popover opens" and "the effect body runs" are different moments, because `openIntro` is deferred to the avatar's transform `transitionend` or a 400ms fallback and the teardown can pre-empt it. Measured against the real component: a click then unmount inside 400ms is 1 effect run and **0** opens, and the no-engine / empty-feedback branch is the same, so an increment at the top of the effect would spend a level on nothing shown.

**Decision**: Added **R3a-i**. Pick the level and the string at the top of the effect, where `parseFeedback`, `buildTour` and `tourDoneLabel` need them; commit the map write and the log inside `openOnce`, whose `opened` guard makes it exactly once per open.

---

### R9b's readout was invisible on any URL without `?preset`
**Context**: `buildPresetDiagnostics(undefined)` returns `undefined` and the sidebar renders the section only when the array is non-empty. Measured live: `?hazbotRules=23&hazbotSidebar=true` renders every other panel with **no Diagnostics section at all**; adding `preset=plainsTwoZone` makes it appear. R9c exists so a walker can check every category in one page load, and no Hazbot URL is required to carry a preset.

**Decision**: Added **R9b-i** (compose at the `app.tsx` call site from two independently-absent halves, `undefined` when both are, `buildPresetDiagnostics` stays pure) and **R11i** (pin it in `app.test.tsx`, where the composition lives, since the substrate sidebar only ever sees the finished array).

---

### Two anchors confirmed with no change
**Context**: Both were asserted rather than tested before implementation. The `@observable` Map had no precedent in `UIModel`, where every existing observable is a primitive; and `HazbotFeedbackShown` is emitted through `log()`, which routes every event through `engine.consume()`.

**Decision**: No change to either. The field is a real `ObservableMap` and an observer re-renders on `.set()` outside an action and on `.clear()`. Consuming the new event leaves readings, observed values, temporal history, error count and the category selection identical, with **zero** subscriber notifications, because a temporal reducer runs only if the variable's `acceptedEvents` lists the event name.

---

### What should the two dev surfaces show for the top category's discarded Round 2/3 content?
**Context**: The extractor emits those cells faithfully while R4b's selection discards them, so the playbook and the sidebar would each assert two strings a student can never reach, formatted identically to the real ones. Measured, this is four cells on two tabs (23 and 24 category 5). Live in the app, the only thing contradicting the rows was the repeat-click line **555px above**, off-screen exactly when the rows are being read.

**Options considered**:
- A) Emit as authored and annotate the rows "not shown: superseded by category 100".
- B) Emit as authored and suppress the rows on both dev surfaces.
- C) Do not emit them at all: the extractor skips the Round columns on the top category.

**Decision**: **A**. It fixes the actual defect without moving the fill-down decision out of the one place that owns it. R4b is still unconfirmed with Sam, so the discarded content stays visible and labeled rather than deleted at source, and the reversal stays inside one function. C was rejected for that reason plus a second: the extractor writes in place so `git diff` is the sheet diff, and dropping authored cells would end that.

---

### The "top category" rule is needed in three places. Keep the duplicates or share one helper?
**Context**: The selection rule, the playbook generator and (after the decision above) the sidebar all need it. If the three diverge, the docs and the dev sidebar describe the feature against a different category than the app implements it for, on the one requirement still unconfirmed with Sam.

**Options considered**:
- A) Keep three copies, each with a comment naming the others; R11c, R11f and R11h pin all three ends.
- B) One shared helper in the substrate, exported from the barrel.
- C) Have the extractor emit a `topCategoryId` field on the generated rule-set.

**Decision**: **B**, `src/hazbot/engine/top-category.ts`. Three copies of a rule this load-bearing stay correct right up until someone changes the definition, which is exactly what Question 1 could force. Verified first that a plain-JS generator can require a TypeScript module both under ts-node and under ts-jest, so the dependency is not new. C adds generated state that can go stale against `categories`, in a file whose diff is meant to be the sheet diff.

---

### Should the Diagnostics section appear before the student's first Hazbot click?
**Context**: With the builder returning `undefined` on an empty map, the whole section is absent on a no-preset URL until the first click and then appears.

**Options considered**:
- A) Leave it. No rows means no section, which is the existing contract for the preset diagnostic.
- B) Always emit a `Feedback levels: (none)` row.

**Decision**: **B**. The sidebar's own conventions split on a principle: structural panels render with a zero state, panels whose content is optional *to the host* render nothing when empty. An empty level map is not optional host content; it is a state the feature passes through twice per validation cycle. The deciding measurement was not first render but the reset: on a no-preset URL, `resetHazbotFeedbackLevels()` made the **entire Diagnostics section disappear**, which is ambiguous with a broken sidebar on the surface whose job is telling a walker what the next click will show.

---

### R7c had a deliverable and no step delivered it
**Context**: R7c says the distinction between the two logged series "has to be written down or an analyst will compute the wrong one", and R6a guarantees the confusing case occurs in real data.

**Decision**: The plan specifies the `LOGGED-EVENTS.md` subsection verbatim, in the style of the existing `categoryId` note, covering both queries plus the dismissed-popover query from R3a.

---

### Five requirements are satisfied by construction and the plan never said so
**Context**: R2a, R7, R7b, R10 and R11 produce no work item, so no step claimed them, which is indistinguishable from forgetting them. R7 invites an active misreading, since R4a's `offersTour` gate is new code keyed on the level's token.

**Decision**: Added a "Requirements this plan constrains rather than implements" section with the evidence for each, and spelled out the R7-versus-R4a distinction: R7 governs the tour's *content*, which never varies by level; R4a governs whether the existing tour is *offered*, which R7's own text allows.

---

### The plan claimed Question 1 was a one-line reversal
**Context**: Stated twice, and it carried weight in the Q1 decision. Deleting `ladder()`'s early return leaves the top category with four rungs, which logs `feedbackLevel: 4` and breaks the `1 | 2 | 3` contract R7d relies on.

**Decision**: Both claims corrected, and the working 9-line reversal spiked and recorded in the Q1 decision so nobody re-derives it when Sam answers.

---

### R9's tour-data regeneration was claimed but never instructed
**Context**: The generator appeared only in the verification preamble. The coupling is real: `tour-data-impl.js` derives each tour's `doneLabel` by parsing `arrowText` and strips a `Hazbot:` prefix while doing so, and step 1 changes the shared normalizer that prepends that prefix.

**Decision**: Step 1 runs it as a check with the no-diff expectation stated and says what a non-empty diff would mean. Also checked that leaving the playbooks stale between steps breaks nothing, since no freshness test exists for either artifact.

---

### The stray-quote strip was unconditional, and the sheet's style will collide with it
**Context**: **12 of the 28 Round 2 cells already contain double quotes**, because the authors name activity sections that way. The first cell that *opens* with such a name would ship with its opening quote silently eaten, indistinguishable in the re-extract diff from an intended edit.

**Decision**: The strip fires only on an odd number of quotes, i.e. an unterminated leading one. Re-running the extractor with the condition produces output identical to the unconditional version, file for file. Two R11a cases added, and R1a in requirements.md carries the condition so the two documents do not diverge.

---

### Three fixture traps in the button and sidebar test files
**Context**: All three were measured while writing probes, and each surfaces as an error pointing away from its cause. (1) A single-category fixture silently makes that category the top one, so `ladder()` takes the R4b branch and a ladder test passes for the wrong reason; the tempting repair of adding `repeatFeedback` converts a Round-columns test into a category-100 test. (2) `engineWith`'s parameter type admits only `id` and `feedback`, so three of the four new cases cannot be written against it and the top-category case has nothing to walk to. (3) The dismissal route the file uses everywhere (`onDestroyed` alone) is the **`[Show me]` activation** route, so with `offersTour` true it launches the tour and the test dies with `TypeError: tourEngine.drive is not a function`, which reads as a broken mock.

**Decision**: All three recorded in the step where the tests are specified: the fixture needs a higher-id category (and, for the sidebar's labeling case, the row to be labeled must sit on the highest id), `engineWith` is widened to take the Round fields and a `repeatFeedback` argument, and the ladder cases close through `onCancelRequested` then `onDestroyed` with a `drive` spy on the shared mock for the cases that do activate the tour. `feedback-levels.test.ts` pins the degenerate single-category shape deliberately.

---

### `app.test.tsx` could not observe what R11i says it proves
**Context**: Two layers of vacuity, found in successive rounds. The barrel mock is a plain object literal with no `requireActual` spread, so a bare `jest.fn()` returns `undefined` and the composition yields no section, which is byte-identical to R11i's *negative* case. And the file also mocks `Sidebar` itself with a component that ignores its props, so "the array handed to `Sidebar`" is not observable from that file at all. R9b-i is the requirement with the measured failure mode, and this is its only guard.

**Decision**: The builder mock returns a row (`[{ label: "Feedback levels", value: "(none)" }]`) with the negative case overriding it per-test, **and** the `Sidebar` mock captures `props.diagnostics` into a spy so the two cases are distinguishable. Stated plainly what each file proves: `app.test.tsx` proves the composition, `engine-singleton.test.ts` proves the builder always returns at least one row. Neither can prove both.

---

### The three top-category consumers agreed on the category and disagreed on the condition
**Context**: `ladder()` takes its early return regardless of `repeatFeedback`; the playbook matches; the sidebar gated on `repeatFeedback !== undefined && cat.id === topId`. Without the slot the sidebar would render the top category's Round rows formatted identically to the reachable ones, reintroducing exactly the defect the annotate decision was taken to fix. The divergent branch is unreachable in the committed corpus but reachable in every hand-built test fixture, since the slot is optional by design.

**Decision**: Drop `repeatFeedback !== undefined` from `roundsSuperseded` so all three agree, and keep the gate only on the *wording* of the muted explanatory line, via a ternary that switches between "uses the rule-set's repeat feedback, listed at the end of this panel" and a no-repeat-feedback sentence. State the shared rule as two parts: *which* category is top (`topCategoryId`, shared) and *that* its Round columns are never reachable (unconditional, written the same way in all three places). A later round corrected the resolution prose, which had described a gate and a fallback that cannot both hold.

---

### The SE12 comment in `app.tsx` contradicted the code the plan puts under it
**Context**: The comment says `diagnostics` must not be a top-level const in the component body, so the `getUrlConfig()` scan runs only when the sidebar mounts. The plan introduces exactly such a const. The constraint is still honored, because the const binds a *function* whose body runs only at the JSX call site inside the mount branch, but the comment as written reads as a rule the adjacent code breaks, on a comment whose last clause is a "do not correct this" instruction.

**Decision**: Rewrite the comment to say the binding is a function and the scan still happens only at the call site. What shipped drops the trailing pointer into the spec's self-review section, since the rewritten comment states the constraint in full on its own.

---

### The category-100 string is displayed content and got neither the token warning nor a default
**Context**: All 11 top categories walk `L1 → L2/category100`, so this is the level-2 string every student who reaches the success category reads, on every tab. It was normalized without a `defaultToken` and never checked, exempt from both guards the same change installs everywhere else it displays a string.

**Decision**: Call the unknown-token warning on the captured row. Deliberately **not** giving it a default token: unlike the Round columns, the `Hazbot: …\n[Token]` convention already exists for this cell and all 11 tabs follow it, so a blank there is an authoring error worth a warning rather than an absence worth filling in.

---

### The break inventory missed `extract-impl.test.js`, and "all 643 tests pass unmodified" was false
**Context**: Measured by spiking step 1 verbatim: **642 passed, 1 failed**. `normalizeFeedback`'s prefix-prepend rewrites the synthetic fixture's bare `"Good start!"` cell, and the no-op measurement behind R1a is about the **workbook**, not about a hand-written fixture that does not follow its convention. Three other tests in that file survive only incidentally and are named so nobody "corrects" them later.

**Decision**: The preamble names six breaking tests including this one with its reason, "all 643 pass" became "642 of 643", and the step carries the corrected expectation. A red suite the plan says cannot happen is the most expensive kind of surprise.

---

### The new emission had no emitted-TypeScript coverage, and the existing gate rejected it
**Context**: `emitRepeatFeedback` adds a new nesting level to the generated module, and every specified test asserts on `parseTab`'s return value. The repo's `compileAndLoad` helper exists for exactly this, but its inline `RuleSet` stub omits the new slot, so emitting a category-100 row through it fails with `TS2322`. Today's synthetic fixture has neither a category-100 row nor Round columns, so the guard does not fail; it simply never sees the new code.

**Decision**: Widen the stub with `repeatFeedback?: any` and add a round-trip case over a **separate** synthetic tab carrying a category-100 row and populated Round columns (separate because six other tests depend on the existing fixture). The corpus gate does not substitute for this: it runs against whatever the last re-extract wrote, so it cannot fail before the emitter has already produced the file.

---

### Leftover spike artifacts under `tmp/` make `npm test` red before any work starts
**Context**: Two probe test files under `tmp/` are collected by jest, whose `testPathIgnorePatterns` covers only `node_modules` and `cypress`. Measured on a clean tree: 2 failed suites, 76 passed. CI is unaffected because `tmp/` is gitignored, but the plan asks the implementer to read the break inventory literally, and a baseline that is already two suites red is what makes someone stop trusting the count.

**Decision**: Leave the artifacts and the jest config alone and record the two-red baseline in the verification preamble instead. The `tmp/wm46*` directories hold the measurement trail behind the plan, including Question 1's reversal diffs, and Question 1 is still open. Both files contribute **0 tests**, so only the suite count moves. Scoping `testPathIgnorePatterns` to `<rootDir>/tmp/` is the durable fix (verified green) but is a repo-config change outside this branch.

---

### The step-4 sidebar JSX as written fails `npm run lint`
**Context**: The two new Round rows were written with the closing `</div>` on the same line as the `</span>`, which trips `react/jsx-closing-tag-location` twice. It slipped through because the row it was copied from is a *single*-line JSX expression, where the rule does not apply; adding the ternary is what makes it multiline. Found only by running the linter, after three read-throughs had not caught it.

**Decision**: Both rows reformatted with open and closing tags on their own lines. The same targeted pass found two further lint failures in the sidebar *test* (`testing-library/no-node-access` from `.closest("[role=button]")`, and the same closing-tag rule inside `render(...)`), fixed the way the file already does it: click the studentAction text and bind the array to a local before a single-line render.

---

### Where the shipped code differs from the plan
**Context**: Four further divergences were recorded at execution time so a re-read does not "correct" them back, each forced by a toolchain constraint or by an applied review finding.

**Decision**: `hazbot-button.tsx` imports `selectFeedback` from the wildfire barrel rather than the module, so the barrel export has a consumer like every other one. The map assertion uses `Array.from` rather than a spread, since `tsconfig` targets es5 with no `downlevelIteration` and `[...map.entries()]` is a compile error that fails the whole suite. Step 1's two category-100 `parseTab` cases were merged into one and the survivor renamed `keeps a category row with id >= 100 out of categories`, since the old name became false. And `parseActionToken` gained its own test block rather than shipping as a dead "for tests" export, since it is what the level-aware default and the token warning key off and its regex has to stay in step with `parseFeedback`.
