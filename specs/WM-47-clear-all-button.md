# WM-47: Clear All button replaces Reload button and moves left of Setup

**Jira**: https://concord-consortium.atlassian.net/browse/WM-47

**Status**: **Closed**

## Overview

The bottom bar's Reload button is renamed **Clear All**, moved from the middle of the control row to its far left, and widened to 66px. Its behavior is unchanged. Two things made this bigger than a label change: Reload shared a widget group with Restart, so moving it split that group in two; and three Hazbot coach-mark steps already instructed the student to click Clear All while the coach mark still rang a control named `reload-button`, so the testid rename is what makes the tours point at the button their own text names.

PD feedback found that students were mis-clicking Reload, which wipes the model, because it sat directly beside Restart in the middle of a row of frequently used controls. Renaming it Clear All says plainly what it does, and moving it to the far left of the row, away from the play controls, puts distance between it and the buttons a student reaches for repeatedly.

The tour copy half was already done before this story started: Trudi authored the wording on 2026-08-25 and WM-54 extracted it, so this story owned only the code, verified the extracted strings, and needed nothing further from her.

## Requirements

All requirements below were fully implemented.

- The bottom bar's Reload button is relabeled **Clear All** and moved to the far left of the control row, before Setup.
- **The shared `.reloadRestart` widget group is dissolved.** Clear All becomes its own group and Restart becomes its own group; the `margin-right: 0` abutting modifier moves off `.reloadRestart` and onto whichever group now precedes each seam. This is the structural core of the change, not a side effect of the move.
- Clear All renders at **66px content / 68px border box**. The 66 is the board's uniform 6px label inset applied to a longer word: "Clear All" measures 53.95px at Lato Bold 14px and 54 + 6 + 6 = 66, exactly as Restart's 48 + 6 + 6 = 60. It is not a fit constraint; "Clear All" already fits inside 60px.
- **Clear All needs its own width override.** `.playbackButton` locks Clear All, Restart and Start to `min-width: 60px !important; width: 60px !important`, so a plain `width: 66px` cannot win. Clear All takes a modifier carrying `width: 66px !important`, cross-referencing that rule's existing explanation rather than repeating it. It does **not** override `min-width`: `.playbackButton` pins that at 60, and the used width is `clamp(min-width, width)`, so a floor below the target never binds.
- Restart becomes an independent 62px border-box group in its existing position between Spark and Start.
- Its behavior, enable rule, and logged events are unchanged. In particular the `SimulationReloaded` and `TopBarReloadButtonClicked` **log event names are not renamed**, and neither is the `reason` string on the `SimulationEnded` payload. The existing assertion in `log-events.test.tsx` keeps its expected strings; only its selector changes.
- The `reload-button` `data-testid` is renamed to `clear-all-button` across all nine files that reference it, in one commit.
- **The three Hazbot tour steps were already authored and extracted; this story verified rather than authored them.** Category 2 on rule-sets 41, 44 and 46 reads `First, click **Clear All** to reset your model. (Step 1 of 2)`, and after the testid rename the coach mark rings the control that text names.
- **No sheet edit and no re-extract are needed.** The extractor and `npm run generate-hazbot-tour-data` were both run by WM-54 against the shipped export, and their artifacts are committed. Running them again must produce no diff; a diff means the wrong export was used.
- The `visualFeedback` cell on those same three tabs is likewise already updated: it reads `1. Clear All button outlined; coach mark points to Clear All button`. Verified alongside `arrowText`, since it is the authored source the tour anchors are derived from.
- **`feedbackRound2` on those same three tabs is a third verify target**, and the only one of the three rendered straight from the rule-set, with no generated artifact and no assertion between the authored cell and the screen (`arrowText` is student-facing too, but reaches the UI through `tour-data.generated.ts`): it reads `Hazbot: If you have changed the model setup, click **Clear All** to reset the model and run it again!` and renders as the level-2 feedback rung (`feedback-levels.ts`). Nothing in the extractor or the suite guards it, so a regressed re-extract would leave the student told to click a button that does not exist while passing every other check in this story.
- The authored `(Step 1 of 2)` suffix stays exactly as it is. The generator validates it and fails without it; it is not what the student sees.
- `APP_RULES_VERSION` is **not** bumped. The change is editorial, not semantic, per `docs/hazbot-update-workflow.md`.
- Every existing test and comment that names the Reload button is updated: `bottom-bar.test.tsx`, `log-events.test.tsx`, `build-tour.test.ts`, `bottom-bar-visuals.cy.ts`, `bottom-bar-state-machine.cy.ts`, and `cypress/support/elements/BottomBar.js`.
- **`bottom-bar-visuals.cy.ts`'s "renders 0 px gap within the Reload+Restart paired group" test is deleted, not rewritten.** Its subject stops existing when the group is split.
- **`$bottomBarWidgetGroupSpacing` goes from 9px to 4px** (`common.scss`), giving the board's 3px visible gap (`spacing - 1`). Its comment's arithmetic is updated with it. The resulting chain is `3, 3, -1, -1, 3, -1` across this story's seven widget groups, with `mainContainer` at 481px; `bottom-bar-visuals.cy.ts` carries both numbers.

## Technical Notes

Layout numbers come from the *Updated Wildfire Controls and Labels* board (`.../screen/6a8566a1c90489f7be36e66a`), group "Bottom Controls".

**The board's finished control row, left to right.** Border-box widths, with the border-box gap to the next group. This table is the source WM-48 and WM-40 should re-derive from rather than reading numbers off the browser:

| Order | Widget | Content | Border box | Gap after | Owner |
|---|---|---|---|---|---|
| 1 | **Clear All** | **66** | **68** | 3 | **WM-47** |
| 2 | Setup | 82 | 84 | 3 | unchanged |
| 3 | Vegetation Key | 90 | 92 | 3 | WM-48 |
| 4 | Spark | 60 | 62 | -2 | unchanged |
| 5 | Restart | 60 | 62 | -2 | **WM-47 (left the shared group)** |
| 6 | Start / Pause | 60 | 62 | -2 | unchanged |
| 7 | Speed | 97 | 99 | 3 | WM-40 |
| 8 | Fireline | 65 | 67 | -2 | unchanged |
| 9 | Helitack | 65 | 67 | - | unchanged |

> **Build the `-2` gaps in this table as `-1`.** The table records what the board draws; Michael's 2026-08-26 answer keeps the implemented coincident 1px seam instead (see the resolved seam decision). So the chain to build and to assert is `3, 3, 3, -1, -1, -1, 3, -1`, and the finished row spans **671px**, not the 667 this table sums to. Whoever owns "the bar matches the board" must treat 671 as correct and the board's 667 as superseded, or they will chase a 4px discrepancy.

Every widget border is 1px inside `#797979` with a 10px radius, unchanged. Setup, Spark, Start, Fireline and Helitack keep their current widths exactly, so this row is not a re-sizing pass: only Clear All's width and the gaps moved.

**Why 66, measured.** The board sets a uniform **6px inset** between a control's label and its content box: "Clear All" text 54 wide in a 66 box, "Restart" 48 in 60, "Helitack" 53 in 65. Measured live at the label's real font (`700 14px Lato`), "Clear All" is **53.95px** and "Reload" was 43.72px, matching the board's 54 exactly.

**The row got 40px WIDER, not narrower.** `sprint-24-mechanisms.md` flagged that the Fire Intensity Scale's departure frees 151px and that the net budget "may well be a net gain". Measured: it is a net **loss** of horizontal room. The scale's 142 + 9 leaves, but Vegetation Key (92) and Speed (99) arrive. Holding the old 9px spacing while adding those two would give a 691px row; tightening to 4px brings it to 671, so **the tightening saves a real 20px** even though its stated justification (*"esp when the Fire Intensity Scale is displayed"*) describes a condition WM-52 deletes.

**No intermediate state overflows the bar, verified rather than assumed.** A spacer widget group was injected into the live bar at a 950px viewport and grown: at widget spans of 637, 669, 677 and **701px** the bar never overflows. `.leftContainer` and `.rightContainer` are `flex: 1 1 0%` and absorb the growth, and the CC logo has already swapped to its small variant at this viewport.

**The spacing mechanism is one variable.** `$bottomBarWidgetGroupSpacing` is applied as `margin-right` on `.widgetGroup`, against a `margin-left: -$bottomBarBorderWidth`. So the rendered border-box gap is `spacing - 1`. The board's 3px gap therefore means `4px`.

**LOGGING TRAP: three of the strings that say "Reload" must not change.** `SimulationReloaded` is logged from the Clear All handler and as the `reason` on the preceding `SimulationEnded`; `TopBarReloadButtonClicked` is logged from `top-bar.tsx`. Both are consumed by the Hazbot translator (`translate.ts`) and both are named in the `logEvents` arrays and `details` prose of `rule-sets/44.ts` and `46.ts`, which are extracted artifacts a re-extract would revert. A third, the lowercase `"reload"` `CancelReason` on `FireLineCanceled`, is not named in the ticket at all. The suite catches a rename of the emitted string; what nothing catches is a **global** find-and-replace, which renames the expectations along with the source and stays self-consistent.

**The `(Step 1 of 2)` suffix is load-bearing for the extractor and invisible to the student.** `STEPNUM_RE` (`tour-data-impl.js`) matches it, the generator fails the build if a step line lacks it or if the numbers are out of order; the parsed value is then discarded and the displayed numbering comes from the engine. So it must stay correct in the authored cell and must not be treated as the source of what the coach mark shows.

**The top-bar Reload is a different button and stays.** `top-bar.tsx` renders a `RefreshIcon` whose handler calls `window.location.reload()`. It reloads the page, not the model, so the app now contains a Clear All and a page-level reload at the same time.

**Enable semantics are unchanged.** `reloadEnabled = setupChanged || sparks.length > 0`. The board's state table introduces Clear All at state 2 (*"If Setup is changed: Clear All is enabled"*) and does not restate it at state 3, but the `bottom-bar-state-machine.cy.ts` state-3 test confirms sparks also enable it. Read the board's list as "what newly becomes enabled at each transition", not as a narrowing.

**Nothing enforces that the generated tour text matches its source.** CI runs two gating jobs, `build_test` (`npm run build`, then `npm run test:coverage -- --runInBand`) and `cypress` (the full `cypress/e2e/` suite in Chrome against `npm start`), and `s3-deploy` lists both under `needs:`. So the Cypress geometry assertions are CI-gated. The hole is narrower than "CI runs only two commands": no job runs `npm run generate-hazbot-tour-data`, and neither suite compares the generated file against its source. `tour-map.test.ts` pins step *counts*, so a hand-edit of a step's **text** in `tour-data.generated.ts` passes every test. Half of that is mechanically checkable, since `generate-hazbot-tour-data.js` reads the committed rule-set modules rather than the spreadsheet; the other half, whether the rule-sets still match the sheet, is not checkable in the repo because the xlsx is not in it.

**The repo distinguishes the button from the model operation by capitalization, not by file**, and the rule reaches past `src/` and `cypress/` into the checked-in documentation: lowercase "reload" is always the operation, capital "Reload" is never the operation. That rule is what selected the comment and prose sites this story updated, and what makes `localhost-urls.md`'s *"Reload the page entirely"* a deliberate keep rather than a special case.

## Out of Scope

- **The Vegetation Key toggle** (WM-48) and **the speed control** (WM-40), even though the board draws both in this row.
- **Removing the Fire Intensity Scale** (WM-52).
- **Changing what Clear All does.** It is a rename plus a move; `reload()`'s reset semantics, its enable rule, and its logged events are untouched.
- **Extracting a shared width-locking mechanism across the bar's controls.** The two families involved defeat different browser behaviors and only two pill widths will exist.
- **Adding a `generate-hazbot-tour-data && git diff --exit-code` CI step.** Worth doing and specified precisely enough to do: one step in the existing `build_test` job, after `npm run build`. Still workflow infrastructure rather than part of a button rename.
- **Sweeping the unused getters out of `cypress/support/elements/BottomBar.js`.** `getClearAllButton()` has no callers, so this story renamed a method nothing calls. It was not deleted instead, because it was already unused before this story and it is not the only one: `getFireLineButton()` and `getHelitackButton()` are uncalled too.
- **Renaming the top-bar page-reload control.**
- **Bumping `APP_RULES_VERSION`.**
- **Accessibility review**, per the standing scope for this repo.

## Not Yet Implemented

- **"The bar matches the board" for the full nine-widget row** — deferred to whichever of **WM-48** and **WM-40** lands last. Its job is to re-derive the whole gap chain in one pass from the Technical Notes table above rather than reading it off the browser, targeting the **671px** span. No intermediate state matches the board, because the widget list is incomplete until both land.
- **The `.fireLineHelitack` name drift in `bottom-bar.scss`** — `.placeSpark`'s block comment says *"Same cross-module pattern as `.fireLineHelitack button { width: 65px }`"*, and no `.fireLineHelitack` exists; the rule is `.fireLineButton, .helitackButton`. Pre-existing drift, deliberately not fixed here: nothing in this change touches it, so correcting it would be unrelated cleanup in a commit about a button. Recorded rather than silently skipped.
- **`specs/WM-17-hazbot-visual-feedback-overlay-renderer/requirements.md:60,145`** still name the Reload button and the `reload-button` testid, and were deliberately not touched: that spec was already stale before this story, since it still names rule-sets 42/45/47 that WM-54 renumbered.
- **`clear-all.svg`'s internal `id` / `<title>` / `data-name="Reload"` metadata** is deliberately left alone. SVGO strips the `id` and `<title>` at build time and only `data-name` reaches the DOM, where nothing selects on it; `restart.svg` and `start.svg` carry the identical inert pattern. It is invisible to both finish-line greps, since neither covers `*.svg`, so it is recorded here rather than left to look like a missed rename.

## Decisions

### Does WM-47 implement the tightened spacing, or does the last of the four stories do it?
**Context**: The tightening is one variable (`$bottomBarWidgetGroupSpacing: 9 -> 4`) and belongs to this ticket's description. But the board's finished row only exists once WM-48's Vegetation Key and WM-40's Speed are in it and WM-52's scale is out, so applying it now produces a bar matching neither today's design nor the board.
**Options considered**:
- A) Ship the rename and the move; leave the variable at 9 and let the last of the four stories set it.
- B) Change the variable here, accepting an intermediate state that matches neither design.
- C) Sequence the four stories so this one lands last and do the whole row in one pass.

**Decision**: **B** (Doug, 2026-08-26). Two things had to hold and both were checked. The 4px is a real design value, not a Zeplin bounding-box artifact: the board carries a Border and a Back rect per control, the Border outset exactly 1px on all four sides, which maps onto CSS's border box and content box, and the Border widths of the five untouched controls match the app's live widths exactly. And it is a deliberate redraw rather than an inherited one: WM-23 specified a 10px content-edge / 8px visible gap, which is what `9px` implemented, so this board halves it. The measured risk argument also collapsed, since no intermediate span up to 701px overflows the bar. Why here rather than deferred: this story rewrites the adjacency chain and the `mainContainer` assertion either way, so folding the tightening in changes the numbers those two assertions carry, not the number of lines touched.

---

### Is the `reload-button` `data-testid` renamed to `clear-all-button`?
**Context**: The ticket raises this and leaves it open. Renaming ripples into `ANCHOR_TESTIDS`, three `tour-map.tsx` entries (in lockstep, or `tour-map.test.ts` fails), the Jest state-machine spec, both Cypress specs, and `BottomBar.js`.
**Options considered**:
- A) Rename to `clear-all-button` and update every consumer in one commit.
- B) Keep `reload-button` and add a comment explaining the mismatch.

**Decision**: **A.** The testid is not a logged value, so unlike `SimulationReloaded` there is no data-integrity reason to keep it, and leaving a selector named after a button that no longer exists is precisely the drift this repo's reviews keep catching. Option B would also make the Hazbot side actively misleading, since `tour-map.tsx` would read `anchor("reload-button")` for a coach mark ringing Clear All. Two corrections to the cost estimate, both from grepping rather than from the ticket: the rename touches **nine** files, not seven, and the two extra ones are not about the bottom bar at all (`log-events.test.tsx` clicks the button by testid; `build-tour.test.ts` asserts the full selector string as a literal). `tour-map.test.ts` makes the `ANCHOR_TESTIDS` half self-enforcing.

---

### What is Trudi's wording for the three tour steps?
**Context**: The mechanical substitution gives "First, **Clear All** your model", which is not English. The bold run has to cover exactly the button label, because the generator's rich-text extraction maps bold runs to the emphasized token. (This question was addressed to Sam in the first draft and that was wrong: Sam owns the rules and the DSL, and everything about which words a student reads is Trudi's.)
**Options considered**:
- A) Ask Trudi for the copy before touching the sheet.
- B) Propose "First, click **Clear All**." and ask her to confirm or replace it.

**Decision**: **Answered in the sheet, closest to B.** She authored the copy directly rather than replying with a phrase to paste. Identical on all three tabs: `1. Hazbot: First, click **Clear All** to reset your model. (Step 1 of 2)` / `2. Hazbot: Click **Start** to run the model! (Step 2 of 2)`. Both extractor constraints hold, verified rather than assumed: the cell keeps its leading ordinal and its trailing `(Step 1 of 2)`, and running `buildBoldMap` over the shipped export shows the bold run covering exactly the button name. An intermediate 2026-08-25 export briefly left tabs 44 and 46 reading *"First, **Restart** your model"*, which was wrong on the merits too (`restart()` preserves the student's setup changes and only `reload()` restores defaults, while category 2 fires precisely because the student is off defaults); that state never shipped.

---

### Does the abutting seam become -2px per the board, or stay -1px?
**Context**: The board draws abutting widget pairs overlapping by 2px, putting their two 1px borders adjacent rather than coincident. The implemented -1px makes the borders coincide into a single line, which is what the designer asked for when Fireline and Helitack were split into separate bubbles. Two pixels, but at four seams, and visible as a heavier row.
**Options considered**:
- A) Keep -1px and treat the board's 2px overlap as a drawing artifact.
- B) Adopt -2px to match the board exactly.
- C) Ask Michael.

**Decision**: **A**, on Michael's answer of 2026-08-26: *"Keep the approach that's already implemented. In the spec, I just kept how it was originally designed. Not worth changing it at this point imo."* The "drawing artifact" theory in A did not survive measurement, which is what made C the serious option: at **all four** seams the two content boxes are exactly adjacent and the -2 falls out of each border rect extending 1px past its content, drawn identically four times. Michael's second sentence settles which of the two remaining explanations holds: the board inherited the `-2` from the original design rather than anyone redrawing the seam. Consequence to carry forward: the finished row spans **671px**, not the board's 667. This does **not** retract the spacing tightening, which is a separate variable.

---

### Is "Clear All ICON" a new glyph, or the existing reload icon renamed?
**Context**: The board exports it as a distinct asset and carries no "Reload ICON", but the layer tree cannot say whether the artwork differs from the repo's.
**Options considered**:
- A) Download the exported SVG and diff before deciding.
- B) Assume it is the same glyph.

**Decision**: **The check was run, and it is the same glyph.** The arrow is identical under a +4 translation, anchor point by anchor point (repo `15.26,24.25` against Zeplin `19.2617,28.2461`, and three more). The export differs only in its wrapper, a 38x38 box with a white highlight circle around the `#797979` disc, and that wrapper is the board's convention for every pill-button icon: "Restart ICON" has the identical three-layer structure and its glyph likewise matches the repo's under the same +4. So the story gained **no artwork work**.

---

### Is Trudi's "Reset" suggestion closed?
**Context**: Her 2026-08-18 comment asks *"Maybe use 'Reset' instead of reload. What is the current convention?"* and was never answered on the ticket. Michael's description and the board both say Clear All, so it is settled in practice, but nothing recorded that her question was considered rather than overlooked, and this is a label three coach-mark tours now quote.
**Options considered**:
- A) Treat the description and the board as the answer.
- B) One line back to Trudi before the sheet edit, since the sheet edit is the expensive half to redo.

**Decision**: **A, settled on Clear All** (Doug, 2026-08-25). Trudi has since adopted it herself at source: the Round 2 cells she authored read *"click **Clear All** to reset the model"*, which is confirmation by the content author rather than only by the design. The "expensive half to redo" analysis was the reason it was worth confirming rather than assuming: the label propagates to the button, the width driver (66 = 54 + 6 + 6, so a shorter word gives a different container width), six authored cells, and `clear-all-button` across nine files.

---

### Splitting the Reload/Restart group is the real change, and the requirements bury it
**Decision**: accepted; it is its own requirement rather than a clause. Confirmed live that `.reloadRestart` rendered as a single 122px box containing two `<button>` elements, so "the pair" was a real DOM structure and not a visual impression. Two consequences only exist once the group dissolves: Clear All needs its own width override to escape `.playbackButton`'s `!important` 60px lock, and the paired-group Cypress test is deleted rather than rewritten.

---

### Four widths are about to be specified in four different ways
**Context**: The finding read Clear All's 66px as a fifth instance of the hardcoded-width workaround used by `.terrainButton` (82), `.placeSpark` (60) and `.fireIntensityScale` (140), and argued this was the last cheap moment to extract it.
**Decision**: **the premise is wrong, and correcting it changes the answer.** The comment the finding was reading says so explicitly: the circular-sizing dependency comes from `.iconButton { width: 100%; min-width: 60px }` fighting a shrink-wrapping parent, and *"pill buttons avoid this because `.playbackButton` has no `width: 100%`"*. Clear All is a pill. What it needs is different and simpler: a modifier with its own `!important` to beat `.playbackButton`'s. Extraction rejected: it would span two families that defeat different browser behaviors, and after this change exactly two pill widths exist (60 and 66). If WM-40's Speed control turns out to be a pill as well, that is the moment to reconsider.

---

### The generated files are the source of truth for the tour text, and nothing enforces that
**Decision**: confirmed, and it splits into a checkable half and an uncheckable one. The hole is real but not for the reason first written: CI runs two gating jobs including a full Cypress e2e run, and neither compares `tour-data.generated.ts` against the rule-sets. The checkable half is bigger than the finding assumed, since the generator reads the committed rule-set modules rather than the spreadsheet, making `npm run generate-hazbot-tour-data && git diff --exit-code` a self-contained CI step needing no xlsx. The uncheckable half is whether the rule-sets still match the sheet. The CI step is recorded in Out of Scope as worth doing but not part of a button rename.

---

### One existing Cypress test should be deleted, not updated
**Decision**: accepted verbatim; deletion is a requirement in its own right. The test reached for the inner rects of both buttons through `innerRect()` precisely because they shared an ancestor group, so after the split it has neither a subject nor a way to express one. Rewriting it would keep a test whose name and rationale describe a structure that is gone.

---

### Nothing verifies that the log event names survived the rename
**Decision**: the assertion the finding asks for **already exists**, and the residual risk is narrower and nastier than described. `log-events.test.tsx` clicks the button by testid and asserts `SimulationEnded` carries `reason: "SimulationReloaded"` followed by a bare `SimulationReloaded`; `translate.test.ts` and `helitack-run-window.test.ts` each iterate over the literal event names. So a rename of the emitted string alone turns several suites red. What no in-repo test can catch is a **global** find-and-replace, which renames the expectations too. The requirement is therefore phrased as "the existing assertion keeps its expected strings; only its selector changes", which is the instruction that actually prevents it. One backstop exists outside the suite: `rule-sets/44.ts` and `46.ts` are extracted artifacts, so a global rename would be reverted by the next re-extract and appear as an unexplained diff.

---

### The adjacency test's expected values are being rewritten by four stories in sequence
**Decision**: accepted, and the board makes the fix concrete. Whoever owns "the bar matches the board" re-derives the whole chain from the Technical Notes table in one pass; the intervening stories change only the widget list, not the gap values. Otherwise each story reads the numbers off the running app, which turns a regression test into a snapshot of whatever the code currently does.

---

### This story's spacing bullet is the coupling point for four stories and it has no owner
**Decision**: accepted, and the owner is **whichever of WM-48 and WM-40 lands last**. Everything that owner needs is written down: the board's finished row is fully specified in the Technical Notes table, the spacing change is one variable, and measurement ruled out the failure mode that would have forced an ordering. This story does the `9px -> 4px` change itself, so the value is no longer waiting on anyone.

---

### The Hazbot half is more than half the work and is not reflected in the estimate
**Decision**: **2 points stands** (Doug, 2026-08-26). Every input the finding rested on is gone. The deep dive first moved work onto both sides of the scale: the Hazbot half grew to six authored cells and a nine-file testid rename, while the code half lost the asset work and gained a width override. Then WM-54 closed it out entirely: Trudi authored the copy directly and WM-54 extracted it, so the six authored cells became **zero** and both generator runs were already committed. What remained was the nine-file rename plus verifying the extracted strings, mechanical and enumerated, with no cross-tool workflow and no external blocker.

---

### A find-and-replace on "Reload" would silently corrupt the longitudinal event series
**Decision**: the risk is real and is carried by a requirement rather than only a note, but one clause needed correcting. It is not true that no test would fail: `log-events.test.tsx`, `translate.test.ts` and `helitack-run-window.test.ts` all assert the literal strings. The exact scenario the finding describes, a project-wide find-and-replace, is the one that slips through, because it renames the expectations too. Confirmed the surface: both names appear in `translate.ts` and in the `logEvents` arrays and `details` prose of two extracted rule-sets, and the ticket description says nothing about any of it.

---

### The sheet is about to disagree with the UI in a way the extractor cannot detect
**Context**: `visualFeedback` would still say "Reload button outlined" while the button says Clear All, unless edited alongside `arrowText`. The drift would sit in the checked-in rule-sets, be quoted in the generated validation playbooks, and be read by the next person authoring an anchor as though it were current.
**Decision**: accepted; it is a requirement, and the ticket's omission is confirmed by reading the description in full, where step 1 names `arrowText` only. One refinement to "the extractor has no way to notice": it has exactly one partial guard, which warns when the count of numbered lines in `visualFeedback` disagrees with the `arrowText` step count. That catches a structural mismatch and is blind to prose naming the wrong button, so the finding's conclusion stands.

---

### The "(Step 1 of 2)" suffix is validated but never rendered, and the copy edit will tempt someone to fix it
**Decision**: confirmed exactly as described, and stated as a requirement so the editor is told rather than left to work it out. The generator fails the build when a step line lacks the suffix, and again when the number disagrees with the line's position; the parsed value is then discarded and `tour-data.generated.ts` carries only the stripped text. So the suffix is a build-time assertion that the author's own numbering is self-consistent, which is a useful thing and not a vestige.

---

### Does the Clear All group carry `white-space: nowrap` forward, or drop it?
**Context**: `.reloadRestart` declared `white-space: nowrap` and the label inherited it. A plain `.widgetGroup` computes `normal`, so the declaration disappears unless moved onto `.clearAll`. No test can distinguish the two choices, since deleting a `nowrap` that nothing needs leaves the suite green.
**Options considered**:
- A) Carry it onto `.clearAll` with a one-line comment. Preserves today's behavior exactly; costs one unverifiable line.
- B) Drop it. The change orphans it, measurement says it does no work, and Start's group already runs without it.
- C) Drop it and assert the label's rendered height in the Cypress visuals spec.

**Decision**: **B, drop it** (Doug, 2026-08-26). The declaration cannot affect layout, measured rather than reasoned: `.playbackButtonLabel` is `position: absolute; width: 100%`, so the label does not participate in the button's shrink-wrap at all, and a wrap could only push text onto a second line. Prototyped live, the label stays one line at 24.5px in both Lato (53.94px) and the Arial fallback (56.80px); the negative result is meaningful rather than vacuous because a stress case (`"Clear Everything"`) does go to 49px. `.playbackButtonLabel`'s own comment is the evidence that it is vestigial: it records that the label used to be an inline-flow text node and was wrapped in a span, and the inline-flow text node is what a group-level `nowrap` was protecting. Option C is rejected on the repo's own test rule: a rendered-height assertion would not fail if the `nowrap` line were deleted, so it does not guard the thing the question is about.

---

### Do the model-level `reload` names stay as they are?
**Context**: `simulation.reload()`, `simulation.reloadEnabled` and the component's `handleReload` are still named after the old label. They are not logged values, so unlike `SimulationReloaded` there is no data-integrity reason to keep them; but `reload()` genuinely describes what the model does and reads consistently with the event it emits.
**Options considered**:
- A) Leave all three.
- B) Rename `handleReload` → `handleClearAll` only.
- C) Rename all three, spreading into `simulation.ts`, its tests, and every call site.

**Decision**: **B** (Doug, 2026-08-26). Costs were counted rather than estimated: C touches 21 lines across 7 files, B touches 2 lines in one file. The split is the useful one because the two layers name different things. `handleReload` is named after a **button**, and that button's name changed, so it drifted exactly as the testid did. `reload()` and `reloadEnabled` are named after a **model operation**, restoring authored defaults, which this story does not change and which is the vocabulary of the `SimulationReloaded` event it emits; renaming those would put a `clearAll()` next to a `SimulationReloaded` emit and make the model read less consistently, not more. A was rejected because it leaves a two-line drift of precisely the kind the testid decision refused to leave.

---

### Do the state-machine state names get renamed along with the titles?
**Context**: Both state-machine specs name states from the design's state table, including `state 7 (AfterReload)`. Renaming a state identifier shared with the design document makes the code and the board disagree unless the board's table was relabeled too.
**Options considered**:
- A) Rename the enable-state prose but keep `AfterReload` as the state identifier.
- B) Rename both.
- C) Check the board's state table first and follow it.

**Decision**: **B, state 7 becomes `AfterClearAll`** (Doug, 2026-08-26). The question's premise is false, which collapses C into a straight answer: the board carries **no CamelCase state names at all**. Its state table is seven numbered prose lines, and state 7 reads `7: If Clear All is pressed: return to Default; clears model`. The CamelCase names were coined in this repo by the closed WM-24 spec, not published by the design, so renaming brings the repo into agreement with the design rather than out of it, and option A's stated justification does not exist. The surface is also smaller than the question implies: `AfterReload` appeared 4 times, all prose and never as a symbol. It follows the same seam as the naming decision above: it names the **button press** that causes the transition, so it moves while `simulation.reload()` stays. One deliberate consequence: `bottom-bar.test.tsx` now carries an `AfterClearAll` comment a few lines from tests asserting the literal `SimulationReloaded`. That disagreement is correct.

---

### CI runs Cypress, and three places in these specs said it does not
**Context**: Both spec files asserted that CI runs `npm run build` and `npm run test:coverage` only, and one implementation decision was justified by that premise.
**Decision**: accepted in full (Doug, 2026-08-26). It is false: `.github/workflows/ci.yml` has a second job, `cypress`, running against `npm start` in Chrome on every push over every spec in `cypress/e2e/`, and `s3-deploy` lists it alongside `build_test`. Verified live rather than read off the YAML. Three consequences, the first two in this story's favor: every geometry number this story writes is CI-gated and blocks the branch build; the generated-tour-text gap is narrower than stated and must be restated as "no job runs `npm run generate-hazbot-tour-data`"; and the label assertion still belongs in Jest but for a different reason, that it is a component-level fact about rendered copy beside the existing `toHaveTextContent` precedent. Resolving this also left step 1's Verification stale, which now calls for the same Chrome Cypress run as step 2.

---

### Two hand-maintained docs instruct the reader to click "Reload" and neither spec listed them
**Decision**: accepted in full (Doug, 2026-08-26). `CLAUDE.md` carries five lines, including the *"Restart vs Reload behavior"* heading and two imperative instructions that become impossible to follow once the label changes; this is the file every future session loads as context, and its whole purpose is to tell the reader which control to click during a Playwright validation walk. `docs/hazbot-validation/localhost-urls.md` carries three, and is hand-maintained rather than generated, confirmed by reading the generator, which writes only `<id>.md` files. One line stays: *"Reload the page entirely"* is the browser operation. The generated numbered playbooks need nothing, being generated from rule-sets that already say Clear All.

---

### The step-2 "greppable finish line" does not hold, and it hides stale sites the plan omits
**Decision**: accepted in full (Doug, 2026-08-26). Run against the tree the plan described, the grep did not come back clean. Two survivors are deliberate (the top bar's page-level reload, and the log event names) but three sites were genuinely stale and missing from the plan, all in `log-events.test.tsx`: a comment naming the button twice, and an `it()` title carrying the string that must change and the string that must not on the same line, four characters apart (`logs reason 'reload' when Reload discards a placement`). The finish line was rewritten to name its classes of deliberate survivor and to carry the runnable grep, so it now fails on a miss instead of returning hits a reader cannot triage.

---

### The proposed `.clearAll` comment shipped a wrong specificity value and a misleading analogy
**Context**: The comment read *"`.clearAll button` is 0,1,1 ... the same class-plus-tag pattern as `.placeSpark button`"*. Both halves are wrong, and the comment is the one that would ship.
**Decision**: accepted in full (Doug, 2026-08-26). Measured by compiling the SCSS: because the rule is nested inside `.bottomBar`, sass emits `.bottomBar .clearAll button`, which is **0,2,1**, not 0,1,1. The analogy is the more misleading half, because `.placeSpark button` and `.fireLineButton button` carry **no `!important`** — at 0,2,1 they already outrank MUI's rule, so plain specificity is enough. `.clearAll button` needs `!important` for a different reason: it has to beat `.playbackButton`'s own `!important`, which specificity alone cannot do. Read as written, the natural conclusion is that the `!important` is copied ceremony. It is load-bearing, verified by negative control: without it the button falls back to 60 content / 62 border box. The comment now leads with the real mechanism and names the other rules as the contrasting case.

---

### Two more hand-maintained docs name the button, and the finish line is scoped so it cannot see them
**Decision**: accepted in full. There are four such documents, not the two the earlier finding named. `LOGGED-EVENTS.md` carries two lines, and what makes this more than an omission is that the file is already half-renamed: two later lines written by WM-46 say Clear All, so leaving these makes one document describe the same button under both names. `src/hazbot/TBD.md` quotes the `CLAUDE.md` section heading this story renames, which is the repo's named repeat offense in its exact form, a comment header in another file quoting the contract being changed. Neither is reachable from the code finish line: one is outside `src/` and `cypress/`, the other is inside `src/` but excluded by the `--include` list. So the check added specifically to fail on a miss returned clean while two documents were stale. The finish line gained a second grep over Markdown.

---

### The `min-width: 66px !important` half of the width override does nothing
**Context**: The negative control that had been run removed `!important` from both declarations at once. It proves the `!important` matters; it says nothing about whether the second declaration does.
**Decision**: **ship `width: 66px !important` alone** (Doug, 2026-08-26). Measured live by cycling four variants: `width: 66px !important` on its own already gives 66 content / 68 border box, with `min-width` left at `.playbackButton`'s 60. The used width is `clamp(min-width, width, max-width)`, and 60 is *below* the 66 target, so it never clamps. The reason this is worth more than one deleted line is the comment: justifying the pair through `max(min-width, width)` reasoning states a rule that is false at this width, next to a rule (`.placeSpark`) where it is true because the competing min-width (MUI's 64) *exceeds* the 60 target — and WM-40 adds a 97px pill against the same lock. The defensive argument does not survive either: `min-width` is a floor, so it cannot stop the box overflowing if the label outgrew 66, and no reachable value of the competing min-width rises above 66.

---

### `.placeSpark`'s own comment carries the specificity value the new comment corrects
**Decision**: the specificity number is corrected (0,1,1 → 0,2,1); the neighboring `.fireLineHelitack` name drift is **not**. The first is a value this story makes appear twice and disagree with itself about the same selector 70 lines apart, which is the repo's one-source-of-truth rule, and the new comment points a reader straight at it. The second predates the story and nothing in the change touches it, so fixing it here would be unrelated cleanup in a commit about a button. Recorded rather than silently skipped, so the next reader knows it was seen.

---

### The naming seam that renames `handleReload` puts `reload.svg` on the rename side
**Context**: The naming decision draws a clean line — names for the **button** move, names for the **model operation** stay. `ReloadIcon` and `assets/bottom-bar/reload.svg` sit on the button side of it, and the directory's convention is to name each file for its button rather than its glyph (`spark.svg`, `helitack.svg`, `restart.svg`, `terrain-setup.svg`).
**Options considered**:
- A) Keep `reload.svg`, citing the resolved icon question and WM-3's precedent.
- B) Rename the file and the import.

**Decision**: **B, rename** (Doug, 2026-08-26). The icon question answered *"is the artwork different"* (no); it did not answer *"does the file rename"*. Two things settled it before deciding. The SVG carries three internal "Reload" strings the specs never mentioned, but SVGO strips two at build time and only `data-name` reaches the DOM, where nothing selects on it and sibling assets carry the same inert pattern — so there is no tooltip, no accessible-name change and no test coupling, and the question is purely source-tree naming. And WM-3's counter-precedent (`terrain-setup.svg` surviving the "Terrain Setup" → "Setup" rename) is narrower than it looks: its stated reason was the Cypress `data-name` selectors on the zone-count thumbnails, which has no analogue here, and it declined the testid rename in the same breath, which this story does not. `reload.svg` had exactly one importer, so the cost was two lines.

---

### Deleting the 122px paired-group test is justified by an assertion the plan described as optional
**Context**: The plan deleted the paired-group width test because *"the width it asserted is covered by the two new per-widget assertions"*, but introduced the Clear All assertion as an instruction and the Restart one as an opportunity (*"can be asserted at 62 for the first time"*), while the deletion depends on both.
**Decision**: accepted. Verified against the file: the per-widget width test asserted Setup, Spark, Start, Fireline and Helitack, and never mentioned Restart, whose testid appeared exactly once more, inside the other test being deleted. So if the Restart assertion were treated as optional and skipped, the commit that splits the group would leave Restart as the only bottom-bar control with no width coverage at all, on the story that restructures it. Both assertions are required.

---

### The label assertion's placement instruction named a location that does not exist
**Context**: The plan said the new assertion *"belongs beside the existing label assertions"* and follows the `toHaveTextContent` precedent, then said to place it *"rather than in the state-machine matrix"*. Those two sentences cannot both be followed.
**Decision**: accepted. Verified: the cited precedent **is** inside the state-machine matrix, and the file's only other `toHaveTextContent` calls are both about the same Start/Pause ternary. There is no cluster of label assertions to sit beside. The honest home is `describe("BottomBar component")`, which already holds the plain presence assertions, declares the `stores` / `beforeEach` the snippet assumes, and needs no `seedState` — that last property being the one the plan itself uses to distinguish this assertion from the precedent, since all three existing calls guard a state-dependent ternary and this label does not vary with state.

---

### The requirements overstated `feedbackRound2` as the only student-facing string of the three
**Context**: The requirements called `feedbackRound2` *"the only one of the three the student actually reads"*, contradicting the same document's Technical Notes two sections earlier, which say `arrowText` reaches the UI through `tour-data.generated.ts` and is shown in the coach-mark popover.
**Decision**: accepted, and applied in both files. Two of the three are student-facing and only `visualFeedback` is authoring-only. The distinction the bullet was reaching for is real but different: `feedbackRound2` is the only one rendered **straight from the rule-set module**, with no generated artifact and no assertion anywhere between the authored cell and the screen, which is exactly why a regressed re-extract would surface there first. The verify target is unchanged; only the reason it is worth verifying is now the true one.
