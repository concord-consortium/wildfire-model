# Hazbot: renumber the Act 4 and 5 rule-sets and remove Act 5.5

**Jira**: https://concord-consortium.atlassian.net/browse/WM-54
**Repo**: https://github.com/concord-consortium/wildfire-model
**Status**: **In Development**

## Overview

Trudi updated the Wildfire Hazbot Feedback Tables on 2026-08-24: the Act 4 and Act 5 tabs are renumbered, level 2 and 3 feedback is filled in for every remaining task, and Hazbot is removed from Act 5.5 because that page is a performance assessment. This story re-extracts the sheet, renames the four affected rule-sets, drops Act 5.5, and regenerates everything the sheet drives.

## Project Owner Overview

Hazbot's coaching rules are authored by the project team in a Google Sheet rather than in code, and each tab in that sheet is named for the activity and page it coaches, so tab 42 is activity 4, page 2. Pages moved within Act 4 and Act 5, so the tabs were renamed to match, and the files in the codebase carry those same names. This story brings the rename into the code and fills in the second and third rounds of feedback that a student now sees when they click Hazbot again after already getting an answer.

Two things in it are visible to students rather than only to developers. The Act 5.5 page loses its Hazbot entirely, which is deliberate: that page is a performance assessment, so coaching does not belong there. And on three pages a repeat click now escalates through two further messages instead of repeating the first one, which is the level 2 and 3 content the team just finished writing.

## Background

The rule-sets under `src/hazbot/rule-sets/` are generated, not hand-written. `scripts/extract-hazbot-sheets.js` reads the Feedback Tables `.xlsx` export and emits one typed `RuleSet<WildfireDefaults>` module per tab, named after the tab. That name is also the key in the aggregate `ruleSets` record, the key in the hand-written `tour-map.tsx` anchor map, the suffix on every fixture symbol, and the value a LARA page is authored with as `?hazbotRules=NN`. **A renumbering in the sheet is therefore a repo-wide rename, not a regeneration.**

This is the same kind of story as WM-51, which re-extracted the rule-sets after Sam's 2026-08-19 revision. It differs in that WM-51 changed category expressions while leaving every id alone, and this one changes no expression while moving four ids and deleting one rule-set.

## Requirements

- **R1.** Re-extract all tabs from the 2026-08-25 export, producing rule-sets 41, 44 and 46 in place of 42, 45 and 47, plus `index.ts` and `dsl-grammar.md`.
- **R2.** Add `"55"` to `EXCLUDED_TABS` (`scripts/extract-impl.js:8`) so Act 5.5 is not emitted, and correct the **two** comments that describe that value: `scripts/extract-hazbot-sheets.js:21`, which still claims tabs 43, 45, 47 and 54 are excluded while the array is empty, and `scripts/extract-impl.js:6-7`, which says *"All 11 rule-set tabs are now extracted (WM-18 R1)"*. The new workbook still carries 11 rule-set tabs (23, 24, 25, 32, 33, 34, 35, 41, 44, 46, 55) and this story extracts 10.
- **R3.** Delete `rule-sets/54.ts` and `rule-sets/54.test.ts`, and delete **four** stale playbooks by hand: `docs/hazbot-validation/{42,45,47,54}.md`. The playbook generator iterates `Object.entries(ruleSets)` and so writes `41.md`, `44.md` and `46.md` on its own, but it **only writes**: it has no delete and no directory scan, so the rename orphans `42.md`, `45.md` and `47.md` just as surely as the deletion orphans `54.md`. Left behind, each is a complete and plausible-looking playbook for a rule-set that no longer exists, sitting beside its replacement. **No playbook has ever been deleted in this repo** (`git log --diff-filter=D -- docs/hazbot-validation/` is empty), so there is no habit to fall back on. R8 repoints `localhost-urls.md`'s links at the new files, which leaves the old ones unreferenced rather than broken, so nothing else surfaces them.
- **R4.** Rename the per-tab tests and fixtures: `rule-sets/{42,45,47}.test.ts`, and the `tabNN` / `varsNN` / `defaultZonesNN` / `defaultWindNN` / `changedZonesNN` / `changedWindNN` / `fireLineNN` / `defaultsNN` symbols plus each block's `id:` literal in `rule-sets/__fixtures__/tab-shapes.ts`. **The rename must cover comment prose as well as identifiers**, which a symbol-level substitution misses: each per-tab test opens `// Tab 42 categories ...` and `// SIMINIT defaults for tab 42 ...`, `index.test.ts:24` says *"referenced by 45/47/54 and 45 respectively"*, and `test-helpers.ts:25` names `DefaultVegetations`.
- **R4b.** Renumber the **tab-provenance comments in the hand-written engine code**, which no symbol rename and no test touches: `factor-variables.ts:194` and `:206` (both *"Per the sheet (tab 45)"*), and `sim-props.ts:229`, `:236` and `:352` (*"tabs 45/47/54"* and *"tabs 45/47"*). Neither file appears in the ticket's inventory. Per the resolved question below, `sim-props.ts:320` and `:338` retarget from tab 54 to **tab 55** rather than being deleted. **Five further stale references sit outside those two files** and outside every requirement's inventory, found by sweeping for the prose forms (`tab 45`, `Tab 45/47/54`) rather than the quoted-literal form: `engine-singleton.ts:101-102` (twice, in the reset-hook comment), `sim-props.test.ts:332` and `:349`, `factor-variables.test.ts:135`, `current-category-sweep.test.ts:19` and `:197`, and `src/hazbot/TBD.md:43`. Sweep for the prose form as well as the literal one; `engine-singleton.test.ts` was missed by the ticket for the same reason in its `?hazbotRules=` form.
- **R4c.** Add `DefaultVegetations` and `SevereDroughts` to `expectedUnreferenced` in `index.test.ts`. Removing rule-set 54 leaves them referenced by no surviving expression; the impls and their tests stay.
- **R4a.** Delete the now-orphaned `tab54` fixture block in `tab-shapes.ts` (`:524` and its `defaultZones54` / `vars54` supporting consts). Verified during the rehearsal that nothing outside that file references it once `54.test.ts` is gone.
- **R5.** Update `src/hazbot/wildfire/tour-map.tsx`: the `"42"`, `"45"`, `"47"` and `"54"` keys at `:125,129,134,139`, and the id-enumerating comments at `:19,124,128,133`. The `"54"` entry is deleted, not renamed.
- **R6.** Update every remaining test that names an id as a literal: `current-category-regression.test.ts`, `current-category-sweep.test.ts`, `index.test.ts` (both the `expectedStubWarnings` map and the "exports all 11 rule-sets" list, which becomes 10), `run-window.test.ts`, `helitack-run-window.test.ts`, `build-tour.test.ts:57`, `range-cc.test.ts:15`, and **`engine-singleton.test.ts:243,253`**, which reach the ids through `setUrl("?hazbotRules=47")` and `setUrl("?hazbotRules=45")` rather than a bare literal. Two of these need more than a substitution: `index.test.ts` drops a key from `expectedStubWarnings` and its "exports all 11 rule-sets" list becomes **10**, and `current-category-sweep.test.ts` renames three keys and deletes the whole `"54"` expectation block at `:115`.
- **R7.** Regenerate the derived artifacts after R1 and never before it: `npm run generate-hazbot-tour-data` and `node scripts/generate-hazbot-validation-playbook.js`. **The tour-data regeneration is not optional and its omission is silent** (see Technical Notes).
- **R8.** Update `docs/hazbot-validation/localhost-urls.md`: the tab-to-activity-and-page table at `:24-27` including each row's `hazbotRules=` URL, the **## Placeholder tabs** section at `:30-32`, whose *"(none: all 11 rule-set tabs are extracted as of WM-18; `EXCLUDED_TABS` ... is empty.)"* R2 falsifies on both halves, and the validation result tables at `:162-189` that name tabs 45, 47 and 54. **The Act 5.5 row leaves the main table rather than being renumbered into it.** That table gives one row per rule-set and links each to its playbook, and tab 55 has no rule-set, no playbook (R3 deletes `54.md`) and no working `hazbotRules=` URL, so a renumbered row would link to a file that no longer exists. The **## Placeholder tabs** section directly beneath is the documented home for a tab that is not extracted, which is exactly what it becomes: record 55 there with its activity and page (5.5, formerly listed as activity 5 page 4) and the reason, replacing the "(none)" text R2 falsifies.
- **R8a.** Update `docs/hazbot-update-workflow.md:70`, which hardcodes `TABS = ["23","24","25","32","33","34","35","42","45","47","54"]` inside the contract-diff script the workflow tells the next engineer to run. Left alone it names four files that no longer exist and omits three that do. This is the process document for exactly this class of story, and it is the one place the id set is copied that no test or generator reaches.
- **R9.** Amend `LOGGED-EVENTS.md`, which is the only file pinning the old ids in prose that exists on this branch. See R9a for its edits. **The sibling specs are deliberately not in this requirement**; see Out of Scope.
- **R9a.** `LOGGED-EVENTS.md` needs **four** separate edits and none is a spec file, plus a fifth the version bump forces: the action-token note pins the version its content ships at (*"as the content ships at `appRulesVersion` 7"*), which R10 moves to 8. The claim it makes, that levels 1 and 2 carry `[Show me]` and level 3 carries `[Okay]`, still holds against the new content. **(i)** Line 91 already reads *"It occurs only on tab 45"* on master today, in the `categoryId` note, and tab 45 becomes 44. **(ii)** Line 135 reads *"on rule-sets 42, 45, 47 and 54, whose middle categories carry no level 2"*. This one does not renumber: after this story 41, 44 and 46 all carry level 2 on their middle categories, so the clause is deleted rather than corrected, and 55 is not a substitute referent because it is excluded and carries no Round columns at all. **(iii)** *Not executable on this branch.* WM-31 was expected to land first, and its R39 adds a `HazbotCoachMarkHiddenByRun` row enumerating seven tours by id. That row is **absent from `LOGGED-EVENTS.md` on master**, so WM-31 renumbers it on the rebase that follows this merge, the way the sibling specs do. For that pass, the correct enumeration is six tours split four and two: 41/2, 44/2, 46/2, 46/4 anchored on Start, and 44/3, 46/3 anchored on Fireline. **(iv)** A new subsection under `## Hazbot` recording the id renumber as a boundary in the logged data. `ruleSetId` is a join key on five payloads (`AnalysisEngineActivated`, `HazbotFeedbackShown`, `HazbotShowMeClicked`, `HazbotTourCompleted`, `HazbotTourDismissed`), and sessions either side of this deploy carry different values for the same page, which no consumer can recover after the fact. Follow the file's existing convention, `### <topic> (\`appRulesVersion\` N onward)`, as used at `:84`, `:98` and `:113`: state that 42, 45 and 47 became 41, 44 and 46 from `appRulesVersion` 8, and that **54 has no successor** because Act 5.5's Hazbot was removed by curriculum decision, so its series is closed rather than sparse. That last point is the whole of what the data consumers need and it is one paragraph, so no separate message is required; call it out in the PR description as well.
- **R10.** **Bump `APP_RULES_VERSION` from 7 to 8.** *(This reverses the ticket's R10, which says not to bump. See Technical Notes: the Round 2/3 content changes which string a repeat click shows, which is the exact case the policy calls a selection-semantics change.)*
- **R10a.** Add a test pinning the **feedback ladder across every shipped rule-set**, because a re-extract that silently drops the Round 2/3 columns is invisible to the suite today: it raises no parse error, changes no expression and changes no step count, so `index.test.ts`, `current-category-sweep.test.ts` and `tour-map.test.ts` all stay green while students go back to seeing level 1 repeated. Model it on `index.test.ts`'s `expectedUnreferenced`: an **exact-equality** assertion on the pinned list of `ruleSetId/categoryId` pairs carrying a live Round 2 rung, then a walk asserting each yields three distinct strings with sources `level1`, `round2`, `round3`. The equality assertion has to come **before** the loop, or an empty set passes vacuously and the test cannot fail. Measured: the list is **26** pairs on master (all three-distinct, none a top category whose Round columns category 100 would supersede) and **32** after this story, the six additions being 41/2, 44/2, 44/3, 46/2, 46/3 and 46/4. Pinning pairs rather than strings means Sam rewording a cell does not touch it.
- **R11.** Full suite green and lint clean, and a validation walk against the four affected tabs confirming the renumbered rule-sets load and match as before. **The walk is the only check in this story that survives a consistent wrong rename.** Every assertion naming an id is edited here, so the suite goes green when the tests agree with the code rather than when either is right, which is the same global-find-and-replace hazard WM-47's spec identified for `SimulationReloaded`. What the walk adds is a reading the tests cannot do: re-read each changed category's `visualFeedback` against `tour-map.tsx`, not only its step count, per the warning in `docs/hazbot-update-workflow.md` section 6.

## Technical Notes

### What actually changed in the sheet

**Shipped from `Wildfire Hazbot Feedback Tables (12).xlsx`** (2026-08-25 11:09), not the `(10)` export this section was first written against. Two later exports landed the same morning in response to review: `(11)` re-authored category 2 on 41, 44 and 46 to name **Clear All** in both `visualFeedback` and `arrowText` and fixed two typos, and `(12)` carried Sam's change of tab 41 category 2 to `ranSimulation WITH NOT DefaultVars` plus the `dsl-grammar.md` tab pointer. Diffed the 2026-08-25 export against the 2026-08-22 one (`(10).xlsx` against `(9).xlsx`). The renumbering is a clean positional shift: **42 to 41, 45 to 44, 47 to 46, 54 to 55**, with no content moving between tabs and no tab added or removed. Tabs 23, 24, 25, 32, 33, 34, 35, README and SIMINIT keep their numbers. **Tab 55 is byte-identical to tab 54**, and is the only tab with no `Notes for Round 2` / `Notes for Round 3` columns at all, which corroborates Trudi's instruction to ignore it.

`localhost-urls.md:27` maps 54 to activity 5 page 4, so the page that was 5.4 is the one now called 5.5.

Level 2 and 3 feedback was missing on exactly three tabs and is now complete: **41 gained category 2; 44 gained categories 2 and 3; 46 gained categories 2, 3 and 4.**

Two cells were **reworded** on top of that, and both reach students. Measured by re-extracting the new export into a scratch tree and diffing every module against its committed counterpart with the ids normalized, so the comparison sees content and not the rename:

- **Tab 24 category 4 Round 2**: *"Go down and look at the questions you need to answer."* becomes *"Go down and look at the questions. See if you can answer the questions!"*
- **Tab 46 category 4 level 1 `feedback`**: *"Did you try running the model **without firelines and helitacks** to see where the fire spread?"* becomes *"...to see where the fire spreads **first**?"* This is a **first-click** string on a live coaching category, not a Round column, so it changes what a student sees on their first press rather than on a repeat.

Tab 24's reword also means `docs/hazbot-validation/24.md` changes under R7, which is a regenerated file on a tab this story does not otherwise touch. Expect it in the diff.

Nothing else in the workbook moved. Every other generated module is byte-identical to its current counterpart, and so is `dsl-grammar.md`.

### The extraction needs no parser or extractor change

Verified by dry-running `scripts/extract-hazbot-sheets.js` against the new export into a scratch directory. It completes clean. With `EXCLUDED_TABS = ["55"]` it emits ten rule-sets, omits 55 from `index.ts`, and reports `Excluded tabs (per spec): 55` on stdout. Excluding the Round 2/3 additions and the two rewordings above, every generated module is identical to its current counterpart.

### The silent failure: `tour-map.test.ts` is not a gate until the tour data is regenerated

This is the most important finding in the story and it is counter-intuitive.

`tour-map.test.ts:11-20` asserts that `Object.keys(tourMap)` equals `Object.keys(tourData)` exactly, per rule-set and per category. That reads like a safety net over the hand-written map. **It is not, because neither side is checked against `ruleSets`.** `tourData` is a committed generated artifact, and `tourMap` is hand-written, so the two can agree with each other while both disagree with the rule-sets that actually exist.

Measured by doing the renumber for real on this branch and running the suite at each stage:

| State | Result |
|---|---|
| Rule-sets renumbered, nothing else touched | **11 suites fail, 4 tests fail**, but `tour-map.test.ts` **passes** |
| `npm run generate-hazbot-tour-data` then run again | `tour-map.test.ts` fails on map coverage and on step-count agreement |

So a change that renumbers the rule-sets and skips R7 leaves `tourMap` and `tourData` keyed to rule-sets that no longer exist, every tour on those four rule-sets silently unreachable, and **no test red**. R7 is what converts the invariant into a gate.

The suites that do fail on the rename alone are loud and by name: seven fail to compile on `Cannot find module './42'` and similar (`42.test.ts`, `45.test.ts`, `47.test.ts`, `54.test.ts`, `current-category-regression.test.ts`, `current-category-sweep.test.ts`, `helitack-run-window.test.ts`, `run-window.test.ts`), and four assertions fail in `index.test.ts` (twice), `range-cc.test.ts` and `engine-singleton.test.ts`.

### `range-cc` degrades to zero rather than erroring on an unknown id

`range-cc.test.ts` fails with `"42": 0` rather than a missing key, because `deriveRangeCc` on an id that is not in `ruleSets` returns 0. **Zero is also the legitimate value meaning "no trailing window"**, so an unknown id does not announce itself; it silently widens the analysis to the whole session. The test catches it here only because `SAM_RANGE_CC` pins the expected values.

### What a stale `?hazbotRules` does, measured

The one consequence that reaches students if the LARA pages do not renumber alongside the sheet. Verified with a throwaway test against the renumbered tree (since deleted):

- `?hazbotRules=42` after the rename renders **no Hazbot button at all**. Not an error, not a fallback: the button is simply absent, which matches the documented behavior at `bottom-bar.tsx:234-235` and the existing `?hazbotRules=99` case in `bottom-bar.test.tsx:520`.
- `getDerivedRangeCc()` returns 0 for the stale id, and the correct value (1) for `?hazbotRules=41`.

So the failure mode of getting the LARA half wrong is a page that looks fine and has quietly lost its coaching. Nothing in this repo can detect it.

### `APP_RULES_VERSION` must be bumped, contradicting the ticket

`APP_RULES_VERSION` is **7**, bumped by WM-46 with the comment *"no category resolves differently, but a repeat click now escalates through levels 2 and 3."*

`feedback-levels.ts:47-51` caps the level at the number of rungs that exist, and its own comment states the consequence: *"a category with no level 2 repeats level 1 rather than blanking or skipping to level 3."* Master's `42.ts` contains zero `feedbackRound` entries, so a repeat click on 42/2 today shows level 1 again. Verified by throwaway test against the renumbered tree (since deleted) that `41/2` now returns levels 1, 2 and 3 with sources `level1`, `round2`, `round3` and **three distinct strings**.

`docs/hazbot-update-workflow.md:210` defines a selection-semantics change as *"any change to which string a given session is shown ... whether the change is in how the existing expressions are evaluated ... or in how the category's feedback is picked once the category is known"*, and requires a bump. What a student sees for a given history changes on three tabs. **7 to 8.**

### The Restart/Clear All mismatch was fixed at source before this story shipped

Recorded because the analysis below drove the build-order decision, and because the window it
describes is still open.

The `(10)` export had category 2's `arrowText` on 44 and 46 reading *"First, **Restart** your
model"* while the matching `visualFeedback` still said `Reload button outlined`, and 41 said
Reload in both. `(11)` replaced all six cells with **Clear All**: `visualFeedback` reads
`1. Clear All button outlined; coach mark points to Clear All button` and `arrowText` reads
*"First, click **Clear All** to reset your model. (Step 1 of 2)"*, identically on all three
tabs. Verified that both columns keep 2 numbered steps and the `(Step N of 2)` suffixes
`tour-data-impl.js:50` requires, and that the bold run covers exactly the button name.

**The ring is the half that was right, measured rather than argued.** `simulation.ts:408`
`restart()` resets the run (cells, time, fire-line markers, wind) and never touches zone
vegetation, drought or `setupChanged`; `reload()` calls `restart()` and then adds
`setupChanged = false`, `setInputParamsFromConfig()` and `populateCellsData()`. Confirmed live
on `townsThreeZone`: zone vegetation `[1,1,1]` by default, `[0,1,1]` after changing zone 0,
still `[0,1,1]` after `restart()`, back to `[1,1,1]` after `reload()`. Category 2 on 44 and 46
is `ranSimulation WITH NOT DefaultVars`, so it fires exactly because the student is off
defaults, and **Restart cannot clear the condition the category exists to report**. Clear All
is the renamed Reload, so the authored copy and the anchor now agree on the control.

**The copy window this build order accepts.** WM-47 renames the `reload-button` testid and the
button's label; it lands after this story. So this story ships authored copy naming Clear All
while the button is still labeled Reload and `tour-map.tsx` still anchors `reload-button`. That
is a copy mismatch, not a functional break: verified in the browser that the step-1 ring lands
on the real Reload button (ring at x=728 w=66 around the button at x=731 w=60) and that the
step advances on click. Retargeting the anchor to `restart-button` is not an option, per the
measurement above.

### The three sheet edits were all made at source

All three were fixed in the workbook rather than worked around in the repo, so none of them
reaches WM-47's round-trip:

- **"Concord WIldfire"** with a capital I (tab 46 category 4 Round 2): fixed in `(11)`.
  Confirmed live in the browser, where the level 2 popover reads "Concord Wildfire".
- **Tab 41's "Click to **Start** to run the model!"**, where a stray "to" sat between the
  ordinal and the bold run: fixed in `(11)`, which now reads "Click **Start** to run the model!"
  in line with 44 and 46.
- **`dsl-grammar.md:105`**, which pointed at the *"45"* sheet: fixed in `(12)`, and the
  regenerated file now points at *"44"*, which is where that `NOT (usedFireline AND
  usedHelitack) AND ...` example lives. `(11)` had left it untouched, so the file was
  byte-identical there and the regeneration would have reproduced the stale pointer.

`(11)` also stripped a stray leading `"` from Round 3 text in 26 cells across nine tabs and
fixed "Fire Supression" on tab 33. The stray quote never reached the repo, since the committed
tree predates `(10)`, so only the tab 33 fix appears in this story's diff.

### Scope of the rename

About nineteen files, all under `src/hazbot/` and `docs/hazbot-validation/`, plus `scripts/extract-impl.js` and `LOGGED-EVENTS.md`. **Cypress is untouched.** Six of the nineteen are generated and need no hand edit: `rule-sets/NN.ts`, `rule-sets/index.ts`, `tour-data.generated.ts`, `dsl-grammar.md`, and the playbooks. The rest are hand-written.

`engine-singleton.test.ts` was missing from the ticket's own file list because its ids appear as `?hazbotRules=45` rather than as `"45"`, which a literal-quoting grep does not find. Assume the same for any future re-scan and search for the URL form too.

### Suite baseline

`master` and this branch are **948/948 clean**, re-measured on 2026-08-25 rather than taken from the sprint doc.

## Out of Scope

- **The Reload versus Restart copy decision.** Resolved at source: the `(11)` export names Clear All in both authored columns on all three tabs. Extract as authored.
- **The `reload-button` testid rename**, which WM-47 owns and which lands after this story. This story ships copy naming Clear All against a button still labeled Reload; see Technical Notes.
- **Renumbering the sibling Sprint 24 spec branches.** Four of them pin the old ids in their own specs: **WM-31** (`requirements.md` and `implementation.md`, thirteen locations), **WM-32** (`requirements.md`), **WM-42** (`implementation.md:768`) and **WM-47** (`requirements.md`). None of those files exists on this branch, so the edit is not executable here, and the branches are unscheduled relative to this one. Each renumbers its own spec on the rebase that follows this merge, and the inventory lives in `sprint-24-spec-branches.md` beside the existing rebase block, which is where it is read at the moment someone picks the branch up. **Two of the four need arithmetic rather than substitution**, and the note has to say so: WM-31's lines 104 and 134 open *"Three more tours are authored to span the run"* and name 45/3, 47/3 and 54/3, and WM-32 carries the same three-tour set in an OPEN question heading, states *"`tour-map.tsx` now holds 34 tours"* (counted live: 34, of which rule-set 54 contributes 2, so 32 after this story), and says *"the code edit is three lines, not two: `tour-map.tsx:131`, `:136` and `:142`"*, where `:142` is the 54/3 entry this story deletes.
- **Re-authoring the activity pages in LARA.** Not repo work, and not a dependency: these are research activities with no current users, so the pages can be re-authored with the new ids after this lands. See the first resolved question.
- **Any change to a category expression, factor variable or sim-prop beyond the one the sheet carries.** The `(12)` export changes **tab 41 category 2** from `setAnyVar` to `ranSimulation WITH NOT DefaultVars` and drops the five factor-variable declarations that leaves unused, which this story extracts and re-reads its test against (see the resolved question below). No other expression moved, and no impl in `factor-variables.ts` or `sim-props.ts` changes.
- **`tour-map.tsx` anchor corrections**, including the Reload/Restart mismatch above. Keys move; targets do not.
- **Backfilling a test that would catch a skipped tour-data regeneration.** Worth doing and not this story; see the QA finding.

## Open Questions

### RESOLVED: Did the LARA activity pages renumber alongside the spreadsheet tabs?

**Context**: `?hazbotRules=NN` is authored per page. If the pages moved, every Act 4 and Act 5 page must be re-authored in lockstep with this story. If they did not, then renaming the rule-sets unhooks every one of those pages, and measured behavior is that the page renders with no Hazbot button and no error. This gates the merge, not the build: the re-extract, the Act 5.5 removal and the regeneration are identical either way, and only the rename half depends on the answer. It also needs an owner, since the re-authoring is not Doug's work.

**Options considered**:
- A) Pages renumbered. Land the rename and coordinate the re-authoring before deploy.
- B) Pages did not renumber. Keep the repo ids at 42/45/47 despite the sheet, and record the divergence.
- C) Pages renumber later. Land the rename behind the existing authored ids by aliasing both.
- D) A, plus surface an unknown `?hazbotRules` as a visible error rather than an absent button.

**Decision**: **A, and it does not gate anything.** These are research activities with no current users, so a window in which an Act 4 or Act 5 page points at a rule-set id that no longer exists costs nothing. Land the rename and let the activities be re-authored with the new ids afterward. C was tested and rejected on cost: aliasing produces 12 playbooks instead of 10 with two identical files, forces a duplicate `tour-map.tsx` entry, and would live in `index.ts`, which carries a `DO NOT EDIT` banner and is regenerated by the extractor, so the alias is either a permanent extractor change or a hand edit the next re-extract reverts. D stays out of scope: it changes runtime behavior for every activity, not just these, and what an authoring error should look like to a student is its own decision.

### RESOLVED: Should the ticket's R10 be corrected in Jira, or only here?

**Context**: WM-54's description says not to bump `APP_RULES_VERSION`, and the deep dive shows that is wrong: the Round 2/3 additions are a selection-semantics change under the documented policy. The spec now says 7 to 8. Leaving the ticket contradicting the spec is the kind of drift that gets read as the spec being out of date.

**Options considered**:
- A) Edit the ticket's R10 to match, with a one-line note saying why.
- B) Leave the ticket and let the spec be authoritative.

**Decision**: **A.** The ticket was written before the deep dive and states the opposite of what the workflow policy requires; leaving it is how a spec gets read as stale. The edit is one requirement plus a sentence of rationale.

### RESOLVED: Does tab 55 keep a rule-set that is merely unreferenced, or none at all?

**Context**: R2 excludes 55 at extraction, so no module exists. The alternative is to emit it and simply never author a page against it, which keeps the content in the repo if Act 5.5 changes its mind. Excluding is cleaner and matches Trudi's "ignore that feedback table", but it means restoring Act 5.5's Hazbot later is a re-extract rather than a config change.

**Options considered**:
- A) Exclude at extraction. No module, no test, no playbook.
- B) Emit it, leave it unreferenced, and note it in `TBD.md`.

**Decision**: **A, and B is not actually available.** `tour-map.test.ts` requires `Object.keys(tourMap)` to equal `Object.keys(tourData)`, and `tourData` is generated from whatever rule-sets exist, so emitting 55 forces a `"55"` entry in `tour-map.tsx` and keeps Act 5.5's two coaching tours alive in code. "Unreferenced" is not a state this repo supports for a rule-set with coaching categories. Excluding also **self-executes the removal**: measured behavior for an id with no rule-set is no Hazbot button at all, so Act 5.5 loses its coaching on deploy whether or not anyone edits the LARA page. Restoring it later is a one-line `EXCLUDED_TABS` change plus a re-extract, which is cheap.

### RESOLVED: Do the renamed per-tab tests keep their existing assertions unchanged?

**Context**: `45.test.ts` and `47.test.ts` are substantial (23 and 25 id references each) and assert per-category matching behavior. No expression changed in this revision, so a pure rename should leave every assertion intact. But WM-51's R4 established the opposite discipline for a re-extract: *"review every changed tab's per-rule-set test against its new expression and rewrite what no longer describes reality, rather than chasing failures to green."* Here nothing changed except ids and added feedback strings, so the discipline may not apply.

**Options considered**:
- A) Pure rename. Any assertion change is a defect in the rename.
- B) Re-read each test against its rule-set as WM-51 did, and treat a needed change as a finding.

**Decision**: **A for 44 and 46, B for 41.** The rename was rehearsed on the branch: `42/45/47.test.ts` renamed to `41/44/46.test.ts` with a purely mechanical substitution of `ruleSetNN` / `tabNN` / `varsNN` and the module path, and **all 32 assertions passed with no edit to any expectation**.

**The `(12)` export then changed tab 41 category 2**, so WM-51's re-read discipline does apply to `41.test.ts` after all. Re-read against the new expressions, and measured rather than assumed:

- **Every assertion still holds unedited.** `setAnyVar` and `ranSimulation WITH NOT DefaultVars` are in fact indistinguishable for this rule-set, because category 3 (`ranSimulation WITH DefaultVars`) outranks category 2: whenever 3 is false the only runs in scope are non-default, which makes 2 true under either form. A probe over six sessions returned identical results for both expressions, under full matching and under `category.current`.
- **The tests are not thereby vacuous.** Mutation-tested: making category 2 unsatisfiable fails 4 tests. A separate mutation to bare `ranSimulation` stays green, which is the same equivalence rather than a coverage gap, and no session can distinguish them.
- **The prose was wrong and is rewritten.** The header comment listed category 2 as `setAnyVar` and category 3 as `ranSimulation AND NOT setAnyVar` (already stale on master), and claimed 2 and 3 are mutually exclusive, which is false for two existential-over-runs expressions. Test (b)'s name and test (d)'s comment named `setAnyVar` too.

So the substitution missed comment prose in both cases, which R4 covers, and on 41 it missed a claim about the expressions that had stopped being true.

### RESOLVED: Does the validation walk cover all ten rule-sets or only the four that moved?

**Context**: R11 says the four affected tabs. WM-51's R10 ran a full automated Playwright walk across every rule-set. Nothing changed on the other six, and their generated modules are byte-identical, so a full walk is arguably wasted. Against that, the `index.ts` regeneration and the `APP_RULES_VERSION` bump touch every rule-set's load path.

**Options considered**:
- A) Four tabs. The other six are provably identical.
- B) All ten, matching the WM-51 precedent.
- C) Four tabs plus a load-only smoke check on the other six.

**Decision**: **A, because C is already automated.** `index.test.ts` loops over every key in `ruleSets` and asserts each one loads with no missing-impl and no parse-error, so the load path C would smoke-check by hand is covered by the suite for all ten. The other six modules are byte-identical to their current counterparts (diffed), so a browser walk over them would be re-validating unchanged files. Walk the four that moved.

### RESOLVED: Do the two sim-props that Act 5.5's removal orphans stay or go?

**Context**: Discovered by rehearsing the rename, not by reading. Deleting rule-set 54 leaves `DefaultVegetations` (`sim-props.ts:323`) and `SevereDroughts` (`:343`) referenced by **no surviving expression**: they were used only by tab 54. `index.test.ts`'s pinned `expectedUnreferenced` list fails loudly with both names added, which is exactly what that test is for.

Two conventions point opposite ways. WM-51's R7 says *"Leave the newly-unreferenced factor variables in place; delete nothing"*, and `index.test.ts`'s own comment explains why: *"nothing is deleted when a re-extract orphans an impl (some are expected back when the analysis window lands)."* Against that, orphaned code with no caller is normally deleted, and these two are orphaned by a curriculum decision rather than by a rules revision, so "expected back" is weaker here than in the WM-51 case.

Both impls carry unit tests in `sim-props.test.ts` (10 references), which would also go.

**Options considered**:
- A) Keep both, add them to `expectedUnreferenced`, and note in the spec that they are Act 5.5's.
- B) Delete both impls, their registrations, their tests, and their `expectedUnreferenced` entries.
- C) Keep them but mark them deprecated in `sim-props.ts` with a pointer to this story.

**Decision**: **A.** Keep both, add them to `expectedUnreferenced`, and **retarget their provenance comments from tab 54 to tab 55** rather than deleting or annotating them: the workbook still holds tab 55 with those expressions, so tab 55 is where the requirement genuinely lives and the comment stays a statement of fact rather than a note about history. This keeps WM-51's "delete nothing" convention and leaves restoring Act 5.5 as a one-line `EXCLUDED_TABS` change.

The measured harm of keeping them is small and fully enumerated: two dangling comments (fixed above), `expectedUnreferenced` growing from 8 names to 10 without weakening its exact-equality assertion, and nine tests at `sim-props.test.ts:422-457` exercising a path no expression reaches. No runtime cost, no correctness risk, about 40 lines. C was rejected independently: a deprecation marker is a comment describing a change, which the repo's comment standard says to delete rather than write.

For the record, deleting would not have been risky either. Verified by throwaway test (since deleted) that a rule-set naming an absent sim-prop produces a `load-failure` with `detail: "sim-prop \`NoSuchSimProp\` has no impl"` and still constructs, and `index.test.ts`'s per-rule-set gate catches it by name. The restore cost under B would have been loud, not silent.


## Self-Review

Every issue below was verified against the working tree before it was written: the 2026-08-25
export was re-extracted into a scratch directory and diffed against the committed rule-sets, the
suite was re-run on this branch's head, throwaway tests were written and deleted, and the two
sibling branches were read with `git show`. Findings that the first review round asserted without
verification and that did not survive it are marked WITHDRAWN with the measurement that killed them.

### Senior Engineer

#### RESOLVED: `LOGGED-EVENTS.md:135` is a third edit R9a misses, and it is a correctness edit rather than a renumber

R9a names two edits to `LOGGED-EVENTS.md`: line 91's *"It occurs only on tab 45"*, and the
`HazbotCoachMarkHiddenByRun` row that WM-31 will have added. There is a third. Line 135 reads
*"on rule-sets 42, 45, 47 and 54, whose middle categories carry no level 2"*. Verified against the
scratch extraction: 41 gains Round 2 and 3 on category 2, 44 on categories 2 and 3, 46 on 2, 3 and
4. So substituting the digits produces a sentence that is false about the very tabs it names. The
edit is to delete or invert the clause, and rule-set 55 is not a substitute referent because it is
excluded and has no Round columns at all.

#### RESOLVED: two prose statements about the extractor's own configuration are falsified by R2 and no requirement names either

R2 changes `EXCLUDED_TABS` and corrects one comment. Two other statements about that exact value go
stale in the same commit:

- `scripts/extract-impl.js:6-7`: *"All 11 rule-set tabs are now extracted (WM-18 R1)."* The new
  workbook still carries 11 rule-set tabs (23, 24, 25, 32, 33, 34, 35, 41, 44, 46, 55) and this
  story extracts 10.
- `docs/hazbot-validation/localhost-urls.md:30-32`, under **## Placeholder tabs**: *"(none: all 11
  rule-set tabs are extracted as of WM-18; `EXCLUDED_TABS` in scripts/extract-impl.js is empty.)"*
  R2 makes both halves untrue, and R8 covers only the URL table and the validation result tables.

#### RESOLVED: `docs/hazbot-update-workflow.md:70` hardcodes the id set inside the script the workflow tells you to run

The workflow doc's contract-diff step embeds `TABS = ["23","24","25","32","33","34","35","42","45","47","54"]`
in a copy-paste Python block that opens `src/hazbot/rule-sets/{tab}.ts` for each id. After this story
it names four files that do not exist and omits three that do. Read the failure modes: a stale id
raises `FileNotFoundError` and stops the sweep, which is loud, but a renamed tab that someone adds
to the list gets `git show origin/master:.../41.ts` returning empty, so every row reports `ADDED`.
Neither is a silent skip, but the doc is the process document for exactly this class of story and it
is not named in R9's list of prose to amend. This is the "update the prose the change invalidates"
case, and the file is the one that tells the next person how to do the change.

#### WITHDRAWN: the id set has about ten copies, not five, and this story is a manual sweep across all of them

The first round guessed five. Counted: `rule-sets/index.ts` (generated), `index.test.ts`'s
`expectedStubWarnings` keys, `index.test.ts`'s "exports all 11 rule-sets" list, `tour-map.tsx` keys,
`tour-data.generated.ts` keys (generated), `range-cc.test.ts`'s `SAM_RANGE_CC`,
`current-category-sweep.test.ts`'s expectation blocks, `__fixtures__/tab-shapes.ts`'s `TAB_FIXTURES`,
`localhost-urls.md`'s table, `hazbot-update-workflow.md:70`, plus the per-tab source and test
filenames. Two of those are generated and follow on their own; the rest are hand edits. The failure
mode is not a broken build but `tour-map.test.ts` passing while four tours are dead. Whether to give
the id set one authority is arguably out of scope, but this story is the moment the cost is visible.

**Withdrawn: out of scope for a re-extract.** Giving the id set one authority is a refactor of code
this story only renames, and nothing about the renumber depends on it. The measured copy count stays
here so whoever proposes it later has the inventory.

#### RESOLVED: R3 deletes one stale playbook; the story orphans four

Verified: `scripts/generate-hazbot-validation-playbook.js` and `scripts/generate-hazbot-tour-data.js`
contain exactly one filesystem write each (`fs.writeFileSync`) and no `unlink`, `rm` or directory
scan. So `docs/hazbot-validation/54.md` survives every regeneration and reads as current. It is one
`rm`.

**The finding was understated, and R3 was wrong.** The generator writes one file per key in
`ruleSets`, so after the rename it emits `41.md`, `44.md` and `46.md` and leaves **four** orphans,
not one: `42.md`, `45.md` and `47.md` are orphaned by the rename exactly as `54.md` is orphaned by
the deletion. R3 named only `54.md`, which is the mistake the "one step with no mechanical prompt"
framing hid. `git log --diff-filter=D -- docs/hazbot-validation/` is empty, so no playbook has ever
been deleted here and nobody has the habit.

**Decision: fix R3 to name all four and keep the deletion manual.** Teaching the generator to prune
(delete any `docs/hazbot-validation/<digits>.md` with no matching key, which is safe because
`localhost-urls.md` is the directory's only non-numeric file) is about six lines and was considered.
It is out of scope on two counts: it is a tooling change inside a story whose job is ingesting a
sheet revision, and it adds a destructive operation to a generator that has only ever written, which
is not a thing to get right under a same-day deadline. Recorded in `sprint-24-spec-branches.md` as a
standing note, since it belongs to no later spec either.

#### WITHDRAWN: deleting `54.test.ts` loses Helitack, fireline-arm and three-zone coverage

Measured, and wrong on all three counts. `47.test.ts` (which becomes `46.test.ts`) carries the same
`(Fireline OR Helitack)` and `NOT (Fireline OR Helitack)` shapes, including a helitack-only run that
proves cat 3 no longer over-matches, and `45.test.ts` covers `usedFireline AND usedHelitack`. The
fixtures for 32, 34, 45 and 47 are all three-zone. `DefaultVegetations` and `SevereDroughts` keep
their nine unit tests at `sim-props.test.ts:422-457`. What is genuinely lost is in the next finding.

#### WITHDRAWN: deleting rule-set 54 removes the repo's only exercise of `WITH` absorbing an unparenthesized `OR`

`54.ts:29` is `ranSimulation WITH NOT DefaultVegetations OR NOT SevereDroughts`, and it is the only
category expression in any rule-set with a top-level `OR` that is not parenthesized. Every other
`OR` in the workbook sits inside brackets. That matters because the precedence is not obvious:
a throwaway parse (since deleted) returned `{ kind: "with", varName: "ranSimulation", propExpr:
{ kind: "or", ... } }`, so `WITH` swallows the whole disjunction into its prop expression. The
expression means "some run exists in which vegetation was off default OR drought was not severe",
not "(some run was off default) OR (drought is not severe)". `parser.test.ts` has `a OR b AND c`
(line 52) and `ranSimulation WITH (OneSparkPerZone OR TwoSparks)` (line 187), but no case for the
unparenthesized form, and `54.test.ts:66-69` is the only assertion anywhere that depends on the
resulting behavior. Deleting both leaves that precedence rule unguarded at every level. 

**Withdrawn: the regression mode is loud, and the behavior is documented.** Two measurements killed
it. First, `dsl-grammar.md` specifies the greedy-`WITH` rule outright (rule 2: a prop expression
*"ends right after the last prop name not followed by any more prop expression"*; rule 3: the
`WITH` binding *"must be computed first, by taking the full possible WITH <prop expression>"*), with
worked example **b** showing `ranSimulation WITH UniqueVegetationPerZone AND NOT UniformDroughtLevels`
parsing as `ranSimulation WITH (...)`. The rule is the same for `AND` and `OR`, and its `AND` form is
carried by eight rule-sets and heavily tested, so what tab 54 uniquely exercised was the operator,
not the rule. Second, a throwaway (since deleted) showed the failure would not be silent: a sim-prop
that falls outside a `WITH` binding is a **parse error** with
`detail: "expected \`WITH\` binding for sim-prop \`SevereDroughts\`"`, and `index.test.ts`'s load
gate pins zero parse errors for every rule-set, so a precedence regression fails by rule-set id and
category. No test is needed here, and none is added.

### QA Engineer

#### RESOLVED: R9 instructs edits to spec files that do not exist on this branch

`specs/WM-31-disable-hazbot-while-running/` and `specs/WM-47-clear-all-button/` are absent from
`specs/` on `WM-54-renumber-rule-sets`. Both were confirmed to exist only on their own unmerged
branches (`git show WM-31-disable-hazbot-while-running:specs/.../requirements.md` succeeds; the path
is not in this branch's tree). So R9 cannot be executed here. It needs a merge-order sentence:
either those branches land first and this one rebases onto them, or the edits are made on those
branches as part of their own work. R9a already assumes WM-31 lands first; the Out of Scope section
implies WM-47 lands after, which would make its spec unreachable from this branch in either
direction.

**Decision: drop the sibling-spec edits from R9 and record the renumber in
`sprint-24-spec-branches.md` instead.** A survey of every WM branch's own spec folder found the
first draft understated the scope: **four** sibling branches pin the old ids, not two. WM-32
(`requirements.md`) and WM-42 (`implementation.md:768`) were missing from R9 entirely, and WM-32 is
the worst of the four, carrying two OPEN question headings with old ids plus two counts that have to
be recomputed rather than substituted. R9 now covers `LOGGED-EVENTS.md` only, which is the one file
in its original list that exists on this branch; the four-branch inventory moved to Out of Scope and
to the branches doc, where it is read at the moment someone picks the branch up rather than while
they are working on a story that cannot act on it. R9a(iii) stays as written, since
`LOGGED-EVENTS.md` is on master and its edit is executable whichever spec branch lands when.

#### RESOLVED: R9 understates the WM-31 edit by an order of magnitude, and part of it is a count change rather than a renumber

R9 describes it as "R39's seven-tour enumeration, plus lines 538 and 568". Counted on the branch:
the old ids appear at lines 42, 98, 100, 102, 104, 118, 134, 148, 532, 540, 559, 568 and 583, which
is thirteen locations. Two of them do not renumber. Line 104 opens *"Three more tours are authored
to span the run, and this story cuts them at Start"* and names 45/3, 47/3 and 54/3; line 134's Out
of Scope entry names the same three. This story deletes 54/3, so both become two, in the same way
R9a already recognizes for the seven-tour count. A digit substitution over that spec leaves two
statements that contradict their own subject count.

#### WITHDRAWN: the story's central risk has no test and the spec should name what would catch it

Confirmed by reading `tour-map.test.ts:10-20`: it sorts `Object.keys(tourData)` against
`Object.keys(tourMap)` and compares per-category keys, and neither side is ever compared with
`ruleSets`. `tourData` is a committed generated artifact and `tourMap` is hand-written, so the two
agree with each other while both disagree with the rule-sets that exist. R7 says to run the
regeneration, which is an instruction, not a gate. What would close it is a third assertion in that
same file against `Object.keys(ruleSets)`, or a CI step running
`npm run generate-hazbot-tour-data && git diff --exit-code`. WM-47's spec already identified the
second and did not build it. Two stories have now found the same hole and neither fills it.

**Withdrawn from this story.** Building the gate is not part of ingesting a sheet revision, and it
belongs to no story currently in the sprint. Recorded in `sprint-24-spec-branches.md` as a standing
note so the third story to trip over it inherits the analysis instead of rediscovering it. R7 stands
as the instruction in the meantime.

#### RESOLVED: the `APP_RULES_VERSION` bump has no assertion tying it to the behavior it marks

Verified: `rules-version.test.ts:5-7` and `engine-singleton.test.ts:222-224` each assert only that
the constant is an integer at least 1, which is the same assertion written twice in two files.
`feedback-levels.test.ts` builds its own synthetic rule-sets (`cat()` / `ruleSet()` helpers at the
top of the file) and never imports a real one, and nothing else calls `selectFeedback` outside
`hazbot-button.tsx`. So no test binds a shipped rule-set to a level ladder, and the behavior R10
exists to mark, that a repeat click on 41/2, 44/2, 44/3, 46/2, 46/3 and 46/4 now yields three
distinct strings instead of one repeated, is unasserted. The throwaway test written during the deep
dive did exactly that and was deleted per procedure.

**Decision: R10a, and the reason is ingestion rather than the bump.** The bump itself is a
documentation act and `feedback-levels.test.ts` already covers `selectFeedback` thoroughly against
synthetic fixtures. What is genuinely unguarded is the content: **a re-extract from the wrong
workbook export would drop the Round columns with nothing red.** There are eighteen Hazbot exports
in `~/Downloads` and picking the right one is this story's whole job, so the exposure is real rather
than theoretical. Measured with a throwaway (since deleted): 26 live Round-2 rungs on master, all
walking three distinct strings, none on a top category; 32 after this story. R10a pins the pair list
by exact equality and walks each ladder, which fails by name on a dropped or added rung and does not
churn when a cell is reworded. Pinning only the six new ladders was rejected as too narrow, since the
wrong-workbook failure hits all ten rule-sets. Also noted and deliberately left alone: the positive-
integer assertion exists in both `rules-version.test.ts` and `engine-singleton.test.ts:222`, which is
one source of truth too few, but it is unrelated to ingesting a sheet revision.

#### RESOLVED: "full suite green" cannot distinguish a correct rename from a consistent wrong one

Every assertion that names an id is edited by this story, so the suite goes green when the tests
agree with the code, not when either is right. This is the same global-find-and-replace hazard
WM-47's spec identified for `SimulationReloaded`, and that spec's own answer applies: name the check
that survives it rather than restating the risk. Here it is R11's validation walk, and specifically
reading each changed category's `visualFeedback` against `tour-map.tsx` rather than trusting step
counts. R11 says that already; the point is that it is the only line in the story doing that job,
and it should say so.

### Product Manager

#### RESOLVED: four student-visible changes ride inside a story described as a rename, and two of them are nowhere in the spec

The Technical Notes state that tab 24's category 4 Round 2 reword "is the only other change anywhere
in the workbook". Diffing the scratch extraction against the committed rule-sets, id substitution
aside, that is false. There are four student-visible changes:

1. Act 5.5 loses Hazbot entirely.
2. Round 2 and 3 arrive on six categories across 41, 44 and 46.
3. Tab 24 category 4's Round 2 was reworded (*"Go down and look at the questions you need to
   answer."* becomes *"Go down and look at the questions. See if you can answer the questions!"*).
4. **Tab 46 category 4's level 1 `feedback` was reworded**: *"Did you try running the model without
   firelines and helitacks to see where the fire spread?"* becomes *"...to see where the fire spreads
   first?"*. This is a first-click string on a live coaching category, not a Round column, and it
   appears nowhere in the spec.

Items 3 and 4 also mean the regenerated `docs/hazbot-validation/24.md` changes, which the "about
nineteen files" scope note does not account for. The Requirements section should carry the content
changes, and the PR description should lead with them.

#### RESOLVED: The merge gate is owned by nobody and the spec cannot assign it

**Withdrawn.** The premise was that a stale `?hazbotRules` reaching students is costly. It is not:
these are research activities with no current users, so the re-authoring is follow-up work rather
than a gate. What survives is smaller and belongs on the ticket rather than in the spec: someone has
to know the new ids exist. R9 and the PR description cover that.

### Education Researcher

#### RESOLVED: the rule-set id is a join key in the logged data and this story changes its meaning

Confirmed: `ruleSetId` is carried on `AnalysisEngineActivated`, `HazbotFeedbackShown`,
`HazbotShowMeClicked`, `HazbotTourCompleted` and `HazbotTourDismissed`
(`LOGGED-EVENTS.md:77-82`, emitted from `hazbot-button.tsx:127`). Sessions logged before this change
carry 42, 45, 47 and 54; sessions after carry 41, 44, 46 and nothing for Act 5.5. Anyone analyzing
across the boundary needs to know 45 and 44 are the same page and that 54's disappearance is a
curriculum decision rather than missing data. `APP_RULES_VERSION` 7 to 8 marks the boundary without
explaining it. `LOGGED-EVENTS.md` is already being edited by R9a and R9a's third edit above, so the
id mapping costs one table there.

**Decision: R9a gains a fourth edit**, a new subsection under `## Hazbot` following the file's own
`### <topic> (\`appRulesVersion\` N onward)` convention, which it already uses at `:84`, `:98` and
`:113`. It states that 42, 45 and 47 became 41, 44 and 46 from version 8, and that 54 has no
successor. This absorbs the Act 5.5 finding below: the two are one paragraph, not two deliverables.

#### RESOLVED: Act 5.5's removal ends a data series mid-study

Whatever Act 5.5 sessions have already been logged are the complete set; there will be no more. If
any analysis is planned on that page's coaching, it needs to know the series is closed as of this
deploy rather than sparse. Sam is the named consumer of the completion derivation
(`specs/WM-45-analysis-last-run.md:103`), which makes him the person to tell.

**Decision: folded into R9a(iv)** rather than carried as a separate requirement or a message. The
distinction a consumer needs, that 54's disappearance is a curriculum decision and not missing data,
is one sentence in the same subsection as the id mapping, and putting it in the repo makes it
durable in a way a Slack message is not. The PR description repeats it.

### Education Material Developer

#### WITHDRAWN: the Restart wording ships as an on-screen contradiction inside a coach mark

Verified against the scratch extraction, cell by cell. On 44 and 46 category 2 the authored
`arrowText` step 1 now reads *"First, **Restart** your model. (Step 1 of 2)"* while the same
category's `visualFeedback` still reads *"1. Reload button outlined; coach mark points to Reload
button"*, and `tour-map.tsx:129,134` anchors `reload-button`. Tab 41 kept **Reload** in both, so it
is the one that stays consistent and 44 and 46 are the two that break.

The consequence is sharper than "the prose disagrees": `tour-data.generated.ts` carries the step
text itself, so after regeneration step 1 of a two-step guided walkthrough draws its ring on the
Reload button while its bubble tells the student to press Restart. `tour-map.test.ts` cannot see it,
because the step count is unchanged and `reload-button` is in `ANCHOR_TESTIDS`. This is the exact
defect class `docs/hazbot-update-workflow.md` section 6 warns about. Either the mismatch is worth
holding those two cells, or the spec should state plainly that it ships a coach mark pointing at the


**Withdrawn: WM-47 already owns this, in two places.** Its spec carries
`### OPEN: What is Sam's wording for the three tour steps?` and
`#### RESOLVED: The sheet is about to disagree with the UI in a way the extractor cannot detect`,
whose decision reads *"accepted; it is a requirement"* and folds both the `arrowText` and the
`visualFeedback` string into the message to Sam. This story ingests the cells as authored, which is
what a re-extract does; the copy is not its decision to make. The measurement stays in Technical
Notes because WM-54 is the story that ships the mismatch.

#### WITHDRAWN: the Round 2 text was written against a button that does not exist yet

Confirmed: the new `feedbackRound2` on category 2 of 41, 44 and 46 is identical on all three and
reads *"If you have changed the model setup, click **Clear All** to reset the model and run it
again!"*. There is no Clear All control until WM-47 lands. So on the day this story merges, a second
Hazbot click on three pages tells students to press a control that is not on screen. That is a
sequencing consequence of extracting finished content ahead of the UI it describes.

**Withdrawn from this story, and handed to WM-47.** The decision is WM-47's, but its spec was
written **2026-08-22**, three days before this export, and contains no reference to Round 2 or
`feedbackRound` at all. So it cannot know that three further authored strings now name the button it
is renaming. Recorded in `sprint-24-spec-branches.md` so Thursday's pass picks it up.

#### RESOLVED: the regenerated `dsl-grammar.md` will point at a sheet that no longer exists

`src/hazbot/dsl-grammar.md:105` reads *"If NOT is to apply to a binary expression, then the whole
binary expression must be parenthesized (see the "45" sheet, for an example)"*. The file is
generated from the workbook's README tab, and the scratch extraction's `dsl-grammar.md` is
byte-identical to the committed one, which means Trudi's renumbering did not touch that sentence.
So R1's regeneration reproduces a pointer to tab 45 after tab 45 is gone. It cannot be fixed in the
repo without hand-editing a `DO NOT EDIT` artifact, so it belongs with the two typos in WM-47's
sheet round-trip. Three sheet edits, not two.

#### RESOLVED: R8 is silent on what happens to the Act 5.5 row in `localhost-urls.md`

The table at `:24-27` gives one row per rule-set: tab, activity, page, preset, a link to the
playbook, and a `hazbotRules=` URL. R8 says to update the table "including each row's `hazbotRules=`
URL", which reads as a renumber of all four rows. But tab 55 has no rule-set, no playbook and no
working URL, and R3 deletes `54.md`, which is the file that row links to. So the row has to be
deleted or converted into a note, and the requirement did not say which.

**Decision: the row leaves the table and Act 5.5 is recorded under `## Placeholder tabs`**, which
answers it by following the doc's own structure rather than inventing a convention. That section
exists to name tabs that are not extracted, and R2 is what makes its current "(none)" text false, so
one edit serves both. R8 now says so.
