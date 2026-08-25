# Hazbot: renumber the Act 4 and 5 rule-sets and remove Act 5.5

**Jira**: https://concord-consortium.atlassian.net/browse/WM-54

**Status**: **Closed**

## Overview

Trudi updated the Wildfire Hazbot Feedback Tables on 2026-08-24: the Act 4 and Act 5 tabs are renumbered, level 2 and 3 feedback is filled in for every remaining task, and Hazbot is removed from Act 5.5 because that page is a performance assessment. This story re-extracts the sheet, renames the four affected rule-sets, drops Act 5.5, and regenerates everything the sheet drives.

The tab number on a Feedback Tables tab is the activity and page it coaches, and it becomes the rule-set module name, the key in the aggregate `ruleSets` record, the key in the hand-written `tour-map.tsx` anchor map, the suffix on every fixture symbol, and the value a LARA page is authored with as `?hazbotRules=NN`. **A renumbering in the sheet is therefore a repo-wide rename, not a regeneration.**

## Requirements

- **R1.** Re-extract all tabs from the 2026-08-25 export, producing rule-sets 41, 44 and 46 in place of 42, 45 and 47, plus `index.ts` and `dsl-grammar.md`.
- **R2.** Add `"55"` to `EXCLUDED_TABS` (`scripts/extract-impl.js`) so Act 5.5 is not emitted, and correct the two comments describing that value (`scripts/extract-hazbot-sheets.js`, which claimed tabs 43/45/47/54 were excluded while the array was empty, and `scripts/extract-impl.js`, which said all 11 rule-set tabs are extracted). The workbook carries 11 rule-set tabs and this story extracts 10.
- **R3.** Delete `rule-sets/54.ts` and `rule-sets/54.test.ts`, and delete **four** stale playbooks by hand: `docs/hazbot-validation/{42,45,47,54}.md`. The playbook generator writes one file per key in `ruleSets` and has no delete and no directory scan, so the rename orphans three playbooks just as surely as the deletion orphans the fourth.
- **R4.** Rename the per-tab tests and the `tabNN` / `varsNN` / `defaultZonesNN` / `defaultWindNN` / `changedZonesNN` / `changedWindNN` / `fireLineNN` / `defaultsNN` symbols plus each `id:` literal in `rule-sets/__fixtures__/tab-shapes.ts`. **The rename must cover comment prose as well as identifiers**, which a symbol-level substitution misses.
- **R4a.** Delete the orphaned `tab54` fixture block in `tab-shapes.ts` and its supporting consts.
- **R4b.** Renumber the tab-provenance comments in hand-written engine code, which no symbol rename and no test touches: `factor-variables.ts` and `sim-props.ts`. `sim-props.ts`'s two `DefaultVegetations` / `SevereDroughts` comments retarget from tab 54 to **tab 55** rather than being deleted, because the workbook still holds those expressions there. *(Extended during implementation: seven further stale references sat outside those two files and outside every requirement's inventory, in `engine-singleton.ts`, `sim-props.test.ts`, `factor-variables.test.ts`, `current-category-sweep.test.ts` and `src/hazbot/TBD.md`. Sweep for the prose form (`tab 45`, `Tab 45/47/54`) as well as the quoted-literal form.)*
- **R4c.** Add `DefaultVegetations` and `SevereDroughts` to `expectedUnreferenced` in `index.test.ts`. Removing rule-set 54 leaves them referenced by no surviving expression; the impls and their tests stay.
- **R5.** Update `src/hazbot/wildfire/tour-map.tsx`: the `"42"`, `"45"`, `"47"` and `"54"` keys and the id-enumerating comments. The `"54"` entry is deleted, not renamed. Anchors are unchanged.
- **R6.** Update every remaining test naming an id as a literal, including `engine-singleton.test.ts`, which reaches ids through `setUrl("?hazbotRules=47")` rather than a bare literal and which a literal-quoting grep misses. Two need more than substitution: `index.test.ts` drops a key from `expectedStubWarnings` and its exported-rule-set list becomes 10, and `current-category-sweep.test.ts` renames three keys and deletes the `"54"` expectation block.
- **R7.** Regenerate the derived artifacts after R1 and never before it: `npm run generate-hazbot-tour-data` then `node scripts/generate-hazbot-validation-playbook.js`. **The tour-data regeneration is not optional and its omission is silent** (see Technical Notes).
- **R8.** Update `docs/hazbot-validation/localhost-urls.md`: the tab-to-activity-and-page table including each row's `hazbotRules=` URL, the **## Placeholder tabs** section, and the validation result tables. **The Act 5.5 row leaves the main table rather than being renumbered into it**, because tab 55 has no rule-set, no playbook and no working URL; it is recorded under **## Placeholder tabs**, which is the doc's own home for a tab that is not extracted.
- **R8a.** Update `docs/hazbot-update-workflow.md`, which hardcodes the id set inside the contract-diff script the workflow tells the next engineer to run. It is the one place the id set is copied that no test or generator reaches.
- **R9 / R9a.** Amend `LOGGED-EVENTS.md`, the only file pinning old ids in prose that exists on this branch. Four edits plus a fifth the version bump forces: **(i)** the `categoryId` note's "occurs only on tab 45" becomes 44; **(ii)** the clause naming rule-sets whose middle categories carry no level 2 is **deleted rather than renumbered**, since every shipped rule-set's middle categories now carry level 2 and 3; **(iv)** a new `### Rule-set ids renumbered (appRulesVersion 8 onward)` subsection recording the mapping and that 54 has no successor; **(v)** the action-token note's `appRulesVersion` 7 becomes 8. *(**(iii)** was not executable: see Not Delivered As Specified.)*
- **R10.** **Bump `APP_RULES_VERSION` from 7 to 8.** *(This reverses the ticket's R10, which says not to bump.)*
- **R10a.** Add a test pinning the feedback ladder across every shipped rule-set: an exact-equality assertion on the pinned list of `ruleSetId/categoryId` pairs carrying a live Round 2 rung, placed **before** the walk so an empty set cannot pass vacuously, then a walk asserting each yields three distinct strings with sources `level1`, `round2`, `round3`. Measured at 26 pairs before and **32** after. Pinning pairs rather than strings means a reworded cell does not touch it.
- **R11.** Full suite green, lint clean, and a validation walk against the four affected tabs. **The walk is the only check in this story that survives a consistent wrong rename**, since every assertion naming an id is edited here, so the suite goes green when the tests agree with the code rather than when either is right.

### Delivered beyond the requirements

- **A membership assertion on `SAM_RANGE_CC`** (`range-cc.test.ts`). Both of its `deriveRangeCc` assertions walked the map's own keys and never compared them against `Object.keys(ruleSets)`, so a rule-set absent from the map was skipped rather than failing, and `deriveRangeCc` answers 0 for an unknown id, which is also the legitimate "no trailing window" value. This change edits that key set, which is exactly the operation the gap hid.
- **`src/hazbot/TBD.md`'s typo entry closed.** It listed `"neecessarily"` and `"magitude"` / `"magnituide"` as outstanding at source; the 2026-08-25 export cleared both from every extracted rule-set.

### Not delivered as specified

- **R9a(iii)** could not be executed. It assumed WM-31 landed first and added a `HazbotCoachMarkHiddenByRun` row enumerating seven tours by id, which this story would then correct. That row is absent from `LOGGED-EVENTS.md` on master, because WM-31 is spec-only. WM-31 writes the row with correct ids on the rebase that follows this merge. For that pass the enumeration is **six** tours split four and two: 41/2, 44/2, 46/2 and 46/4 anchored on Start, and 44/3 and 46/3 anchored on Fireline.

## Technical Notes

### What the sheet actually changed

Shipped from `Wildfire Hazbot Feedback Tables (12).xlsx`. Three exports landed on 2026-08-25 in response to review: `(10)` carried the renumber, `(11)` re-authored category 2 on 41, 44 and 46 to name **Clear All** in both authored columns and fixed two typos, and `(12)` changed tab 41 category 2 and the `dsl-grammar.md` tab pointer.

The renumbering is a clean positional shift: **42 to 41, 45 to 44, 47 to 46, 54 to 55**, with no content moving between tabs and no tab added or removed. **Tab 55 is byte-identical to tab 54**, and is the only tab with no Round 2 / Round 3 columns at all.

Four student-visible changes ride inside a story described as a rename:

1. Act 5.5 loses Hazbot entirely.
2. Round 2 and 3 arrive on six categories: 41/2, 44/2, 44/3, 46/2, 46/3 and 46/4.
3. Tab 24 category 4's Round 2 and tab 46 category 4's **level 1** string are reworded. The second is a first-click string on a live coaching category, not a Round column.
4. Tab 41 category 2's expression changes (see below).

### Tab 41 category 2 is a semantic change with no behavioral effect

`(12)` changed it from `setAnyVar` to `ranSimulation WITH NOT DefaultVars`, reading the run rather than the session. The two are **indistinguishable for this rule-set**: category 3 (`ranSimulation WITH DefaultVars`) outranks category 2, so whenever 3 is false the only runs in scope are non-default, which makes 2 true under either form. Verified by probing six sessions under both full matching and `category.current`, with identical results throughout.

The tests are not thereby vacuous. Mutation-tested: making category 2 unsatisfiable fails 4 tests. A mutation to bare `ranSimulation` stays green, which is the same equivalence rather than a coverage gap, and no session can distinguish them.

### The silent failure: `tour-map.test.ts` is not a gate until the tour data is regenerated

`tour-map.test.ts` asserts that `Object.keys(tourMap)` equals `Object.keys(tourData)`, which reads like a safety net over the hand-written map. **It is not, because neither side is ever checked against `ruleSets`.** `tourData` is a committed generated artifact and `tourMap` is hand-written, so the two can agree with each other while both disagree with the rule-sets that exist.

Measured by doing the renumber and running the suite at each stage: with the rule-sets renumbered and nothing else touched, **11 suites fail and `tour-map.test.ts` passes**; it only goes red once `npm run generate-hazbot-tour-data` has run. So skipping R7 leaves every tour on the renamed rule-sets unreachable **with no test red**. R7 is what converts the invariant into a gate.

### `range-cc` degrades to zero rather than erroring on an unknown id

`deriveRangeCc` on an id that is not in `ruleSets` returns 0. **Zero is also the legitimate value meaning "no trailing window"**, so an unknown id does not announce itself; it silently widens the analysis to the whole session.

### What a stale `?hazbotRules` does, measured

`?hazbotRules=42` after the rename renders **no Hazbot button at all**. Not an error, not a fallback: the button is simply absent. `AnalysisEngineActivated` is gated on `engine?.isActive && engine.ruleSet` (`log.ts`), so it does not fire either, and `getDerivedRangeCc()` returns 0. The failure mode of getting the LARA half wrong is a page that looks fine and has quietly lost its coaching, and nothing in this repo can detect it.

### `APP_RULES_VERSION` must be bumped, contradicting the ticket

`feedback-levels.ts` caps the level at the number of rungs that exist, so a category with no level 2 repeats level 1. Master's `42.ts` contained zero `feedbackRound` entries, so a repeat click on 42/2 showed level 1 again; 41/2 now returns three distinct strings with sources `level1`, `round2`, `round3`. `docs/hazbot-update-workflow.md` defines a selection-semantics change as any change to which string a given session is shown, and requires a bump. **7 to 8.**

### The Restart/Clear All mismatch was fixed at source

`(10)` had category 2's `arrowText` on 44 and 46 reading "First, **Restart** your model" while the matching `visualFeedback` still said `Reload button outlined`. `(11)` replaced all six cells with **Clear All**, identically on all three tabs, keeping 2 numbered steps and the `(Step N of 2)` suffixes the tour generator validates.

**The ring was the half that was right, measured rather than argued.** `restart()` resets the run and never touches zone vegetation, drought or `setupChanged`; `reload()` calls `restart()` and then restores the setup. Confirmed live on `townsThreeZone`: zone vegetation `[1,1,1]` by default, `[0,1,1]` after changing zone 0, still `[0,1,1]` after `restart()`, back to `[1,1,1]` after `reload()`. Category 2 fires exactly because the student is off defaults, so **Restart cannot clear the condition the category exists to report.**

**The copy window this build order accepts.** WM-47 renames the `reload-button` testid and the button's label, and lands after this story, so this story ships authored copy naming Clear All while the button is still labeled Reload. That is a copy mismatch, not a functional break: verified in the browser that the step-1 ring lands on the real Reload button and that the step advances on click.

### The three sheet edits were all made at source

None reaches WM-47's round-trip: "Concord WIldfire" and tab 41's "Click to **Start**" were fixed in `(11)`, and `dsl-grammar.md`'s pointer at the `"45"` sheet in `(12)`, which now reads `"44"`.

### Scope of the rename

45 files. Eleven are generated and need no hand edit: the per-tab modules, `index.ts`, `tour-data.generated.ts`, `dsl-grammar.md` and the playbooks. **Cypress is untouched.**

`engine-singleton.test.ts` was missing from the ticket's file list because its ids appear as `?hazbotRules=45` rather than as `"45"`. Search for the URL form and the prose form, not only the quoted literal.

### Verification

Baseline 948/948 across 78 suites. Final **964/964 across 78 suites** (the deleted `54.test.ts` removes 18; the new ladder and membership tests add 34), lint 0 errors / 31 warnings unchanged, and `tsc --noEmit` shows only the two pre-existing `line-chart.tsx` errors.

The R11 walk confirmed tabs 41, 44 and 46 load and match, tab 41 category 2 on its new expression, the level 1 / Round 2 / Round 3 ladder end to end on 46/4, and that `?hazbotRules=54` and `=55` render no Hazbot button and no error.

## Out of Scope

- **The Reload versus Restart copy decision.** Resolved at source; extract as authored.
- **The `reload-button` testid rename**, which WM-47 owns and which lands after this story.
- **Renumbering the sibling Sprint 24 spec branches.** Four pin the old ids in their own specs: **WM-31**, **WM-32**, **WM-42** and **WM-47**. None of those files exists on this branch. Each renumbers its own spec on the rebase that follows this merge, and the inventory lives in `sprint-24-spec-branches.md`. **Two need arithmetic rather than substitution**: WM-31's "three tours authored to span the run" becomes two (44/3, 46/3) and its seven Start-ending tours become six, and WM-32's "34 tours" becomes 32.
- **Re-authoring the activity pages in LARA.** Not repo work and not a dependency: these are research activities with no current users.
- **Any change to a category expression, factor variable or sim-prop beyond the one the sheet carries** (tab 41 category 2, above). No impl in `factor-variables.ts` or `sim-props.ts` changes.
- **`tour-map.tsx` anchor corrections.** Keys move; targets do not.
- **Backfilling a test that would catch a skipped tour-data regeneration.** Recorded as a standing note in `sprint-24-spec-branches.md`; two stories have now found the same hole.

## Decisions

### Did the LARA activity pages renumber alongside the spreadsheet tabs?
**Context**: `?hazbotRules=NN` is authored per page. If the pages did not move, renaming the rule-sets unhooks every one of them, and the measured behavior is a page with no Hazbot button and no error.
**Options considered**:
- A) Pages renumbered. Land the rename and coordinate re-authoring before deploy.
- B) Pages did not renumber. Keep the repo ids at 42/45/47 and record the divergence.
- C) Pages renumber later. Land the rename behind the existing ids by aliasing both.
- D) A, plus surface an unknown `?hazbotRules` as a visible error.

**Decision**: **A, and it does not gate anything.** These are research activities with no current users, so a window in which a page points at an id that no longer exists costs nothing. C was rejected on cost: aliasing produces 12 playbooks with two identical files, forces a duplicate `tour-map.tsx` entry, and would live in `index.ts`, which carries a `DO NOT EDIT` banner and is regenerated. D is its own decision about what an authoring error should look like to a student.

---

### Should the ticket's R10 be corrected in Jira, or only here?
**Context**: The ticket says not to bump `APP_RULES_VERSION`, and the deep dive shows that is wrong under the documented policy.
**Options considered**:
- A) Edit the ticket's R10 to match, with a one-line note saying why.
- B) Leave the ticket and let the spec be authoritative.

**Decision**: **A.** The ticket was written before the deep dive and states the opposite of what the workflow policy requires; leaving it is how a spec gets read as stale.

---

### Does tab 55 keep a rule-set that is merely unreferenced, or none at all?
**Context**: Excluding at extraction means no module exists; the alternative is to emit it and never author a page against it, keeping the content if Act 5.5 changes its mind.
**Options considered**:
- A) Exclude at extraction. No module, no test, no playbook.
- B) Emit it, leave it unreferenced, and note it in `TBD.md`.

**Decision**: **A, and B is not actually available.** `tour-map.test.ts` requires `Object.keys(tourMap)` to equal `Object.keys(tourData)`, and `tourData` is generated from whatever rule-sets exist, so emitting 55 forces a `"55"` entry in `tour-map.tsx` and keeps Act 5.5's two coaching tours alive in code. "Unreferenced" is not a state this repo supports for a rule-set with coaching categories. Excluding also **self-executes the removal**, and restoring it later is a one-line `EXCLUDED_TABS` change plus a re-extract.

---

### Do the renamed per-tab tests keep their existing assertions unchanged?
**Context**: WM-51 established the discipline of re-reading every changed tab's test against its new expression rather than chasing failures to green. If no expression changed, the discipline may not apply.
**Options considered**:
- A) Pure rename. Any assertion change is a defect in the rename.
- B) Re-read each test against its rule-set, and treat a needed change as a finding.

**Decision**: **A for 44 and 46, B for 41.** The rename was rehearsed with a purely mechanical substitution and all 32 assertions passed unedited. The `(12)` export then changed tab 41 category 2, so the re-read discipline does apply there. Every assertion still held (the two expressions are equivalent for this rule-set), but the prose was wrong and was rewritten: the header listed category 2 as `setAnyVar` and category 3 as an expression already stale on master, and claimed 2 and 3 are mutually exclusive, which is false for two existential-over-runs expressions.

---

### Does the validation walk cover all ten rule-sets or only the four that moved?
**Context**: WM-51 walked every rule-set. Nothing changed on the other six and their generated modules are byte-identical, but the `index.ts` regeneration and the version bump touch every load path.
**Options considered**:
- A) Four tabs. The other six are provably identical.
- B) All ten, matching the WM-51 precedent.
- C) Four tabs plus a load-only smoke check on the other six.

**Decision**: **A, because C is already automated.** `index.test.ts` loops over every key in `ruleSets` and asserts each loads with no missing-impl and no parse-error, so the load path C would smoke-check by hand is covered for all ten.

---

### Do the two sim-props that Act 5.5's removal orphans stay or go?
**Context**: Deleting rule-set 54 leaves `DefaultVegetations` and `SevereDroughts` referenced by no surviving expression. WM-51's convention says to delete nothing on a re-extract, but these are orphaned by a curriculum decision rather than a rules revision.
**Options considered**:
- A) Keep both, add them to `expectedUnreferenced`, note that they are Act 5.5's.
- B) Delete both impls, their registrations, their tests and their entries.
- C) Keep them but mark them deprecated with a pointer to this story.

**Decision**: **A**, and **retarget their provenance comments from tab 54 to tab 55** rather than deleting or annotating them: the workbook still holds tab 55 with those expressions, so the comment stays a statement of fact rather than a note about history. The measured cost of keeping them is `expectedUnreferenced` growing from 8 names to 10 and nine tests exercising a path no expression reaches, with no runtime cost. C was rejected independently: a deprecation marker is a comment describing a change, which the repo's comment standard says to delete rather than write.

---

### Which playbooks does the rename orphan?
**Context**: The first draft named only `54.md`. The generator writes one file per key in `ruleSets` and never deletes, so the rename orphans three more.
**Options considered**:
- A) Name all four and keep the deletion manual.
- B) Teach the generator to prune any `docs/hazbot-validation/<digits>.md` with no matching key.

**Decision**: **A.** B is about six lines and safe (`localhost-urls.md` is the directory's only non-numeric file), but it is a tooling change inside a story whose job is ingesting a sheet revision, and it adds a destructive operation to a generator that has only ever written. `git log --diff-filter=D` over that directory is empty, so no playbook has ever been deleted here and nobody has the habit.

---

### Should the sibling spec branches be renumbered here?
**Context**: R9 originally instructed edits to `specs/WM-31-.../` and `specs/WM-47-.../`, neither of which exists on this branch.
**Options considered**:
- A) Land those branches first and rebase this one onto them.
- B) Make the edits on those branches as part of their own work, and record the inventory somewhere they will read it.

**Decision**: **B.** A survey found **four** sibling branches pin the old ids, not two. R9 now covers `LOGGED-EVENTS.md` only, which is the one file in its original list that exists on this branch; the four-branch inventory moved to Out of Scope and to `sprint-24-spec-branches.md`, where it is read at the moment someone picks the branch up.

---

### What guards the `APP_RULES_VERSION` bump?
**Context**: `rules-version.test.ts` and `engine-singleton.test.ts` each assert only that the constant is a positive integer, and `feedback-levels.test.ts` builds synthetic rule-sets and never imports a real one. Nothing bound a shipped rule-set to a level ladder.
**Options considered**:
- A) Pin only the six new ladders.
- B) Pin the ladder across every shipped rule-set by exact equality, then walk each.

**Decision**: **B (R10a), and the reason is ingestion rather than the bump.** The bump is a documentation act and `selectFeedback` is already covered against synthetic fixtures. What was unguarded is the content: **a re-extract from the wrong workbook export would drop the Round columns with nothing red.** There were eighteen Hazbot exports in `~/Downloads` and picking the right one is this story's whole job, so the exposure is real. A was rejected as too narrow, since the wrong-workbook failure hits all ten rule-sets.

---

### Withdrawn: does deleting rule-set 54 lose the repo's only test of `WITH` absorbing an unparenthesized `OR`?
**Context**: `54.ts` held the only category expression with a top-level `OR` that is not parenthesized, and `54.test.ts` the only assertion depending on the resulting precedence.
**Decision**: **Withdrawn; the regression mode is loud and the behavior is documented.** `dsl-grammar.md` specifies the greedy-`WITH` rule outright, with a worked example, and the rule is the same for `AND`, whose form is carried by eight rule-sets and heavily tested. A sim-prop falling outside a `WITH` binding is a **parse error**, and `index.test.ts` pins zero parse errors for every rule-set, so a precedence regression fails by rule-set id and category. No test is added.

---

### Withdrawn: should the id set be given one authority?
**Context**: Counted ten copies of the id set, of which two are generated. The failure mode is not a broken build but `tour-map.test.ts` passing while four tours are dead.
**Decision**: **Withdrawn as out of scope for a re-extract.** Giving the id set one authority is a refactor of code this story only renames, and nothing about the renumber depends on it. The measured copy count is recorded so whoever proposes it later inherits the inventory.

---

### Withdrawn: should this story build the gate that would catch a skipped tour-data regeneration?
**Context**: A third assertion in `tour-map.test.ts` against `Object.keys(ruleSets)`, or a CI step running `npm run generate-hazbot-tour-data && git diff --exit-code`, would close the hole. WM-47's spec identified the second and did not build it.
**Decision**: **Withdrawn.** Building the gate is not part of ingesting a sheet revision, and it belongs to no story currently in the sprint. Recorded in `sprint-24-spec-branches.md` as a standing note so the third story to trip over it inherits the analysis. R7 stands as the instruction in the meantime.
