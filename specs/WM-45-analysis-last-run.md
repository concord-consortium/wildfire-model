# Hazbot: analysis should reflect the last run, not the best one

**Jira**: https://concord-consortium.atlassian.net/browse/WM-45

**Status**: **Closed**

## Overview

Hazbot currently reports the best category a student has ever reached, so a student who does well and then does worse gets feedback about the earlier, better run. This story adds a second category value, `category.current`, computed over a short window of the student's most recent runs, and draws the feedback from that rather than from the best. The all-time best is kept, keeps its ratchet, and is still what gets logged; what changes is which of the two the coaching describes.

For a non-engineering audience: when a student clicks the Hazbot button, Hazbot looks at everything the student has done in the session and picks the highest-scoring description that fits. That was a deliberate choice, since a student's score was never allowed to go down, but in the classroom it reads as a bug. The fix keeps the "no demotion" promise and adds a second reading of the same student. `category.best` stays exactly as it is. A new `category.current` describes only the last run, or the last two runs for the activities that need a comparison, and the feedback Hazbot shows is tuned to that. One consequence is worth stating plainly, because it is the point of the ticket rather than a side effect: a student who reaches the top category and then does something weaker is coached on the weaker run, so they see help rather than the celebration. Their best result is still held internally, and Sam's design has an answer for that moment (Hazbot offers them a choice between help and moving on), but that flow is deliberately not in this story.

## Background

**What was reproduced.** On ruleset 23: a perfect run alone matches Category 5 (correct); a weaker run alone matches Category 4 (correct); the perfect run followed by the weaker run matches Category 5, when it should match 4. So the student is coached on the earlier run.

**Two independent mechanisms cause it.**

1. **The matched category is a monotone floor.** `computeMatchedCategoryFloor` (`src/hazbot/engine/evaluator.ts:295-313`) walks every prefix of the readings and keeps the maximum. The local variable is literally named `floor`, so the ratchet is deliberate rather than accidental.
2. **The factor variables are cumulative.** `runReadings()` (`src/hazbot/wildfire/factor-variables.ts:17`) returns every canonical run, and each boolean is `witnesses.length > 0`, meaning "any run, ever".

**Measured, and it constrains the design: removing the floor on its own still returns Category 5.** Every factor variable is monotonic, so a category built from positive conditions cannot switch back off once it switches on, and that is the shape of most rulesets' top category. "Take the latest category instead of the highest" does not work and never can. The window is the load-bearing part of the fix, not the ratchet.

**Sam's design supersedes the original framing.** "Translating Data Insights into Feedbacks" ([doc](https://docs.google.com/document/d/1cyDiewBhsFb97u8Aq7ZzuXLEnbwN1b4aUfoJ4Z7OhYE/edit)), last three subtabs, was written for exactly this problem before the ticket existed: keep `best` and add `current`; `range_cc` (the number of trailing runs `current` covers) replaces "the last run"; Sam hand-computed all eleven values (**0** for 24; **1** for 23, 25, 32, 33, 34, 35, 42, 54; **2** for 45 and 47).

**Four decisions were already closed before this spec opened.**

| # | Question | Resolution |
|---|---|---|
| 1 | Is the score allowed to go down? | No demotion in the record. `best` and `current` coexist, `best` keeps its ratchet and is what is logged; the feedback follows `current` |
| 2 | What about rulesets whose top category needs several runs? | Their `range_cc` covers it: 0 for 24, 2 for 45 and 47 |
| 3 | What happens to run records the in-app Reload wipes? | Keep them all. **No code change needed**: `engine.readings` is append-only and Reload is handled in `translate.ts` as a modifier that only closes the run window |
| 4 | Does a paused-and-resumed run count as one run or two? | One. `canonical-runs.ts` already implements this |

## Requirements

- **R1.** Add a second category value, `category.current`, computed alongside the existing matched category. The existing value keeps today's algorithm unchanged, including the monotone floor, and becomes `category.best`.
- **R2.** `category.current` is computed over the last `range_cc` canonical runs, where a canonical run is what `canonical-runs.ts` already defines (a paused-and-resumed run is one run).
- **R2a.** The newest canonical run counts even when it has not finished, so a student who pauses mid-run and asks for analysis is told about the run they are watching. No completeness test is applied.
- **R2b.** When the session holds fewer canonical runs than `range_cc`, `current` is evaluated over the runs that exist rather than treated as insufficient data. Sam's "N < R evaluates false" rule governs a factor variable's range, not the activity window, and no referenced factor variable has a range above 1.
- **R3.** Every factor variable referenced by a tab with a positive `range_cc` is recomputed over the window, since all of them are range 1 by Sam's definition. `category.current` is therefore a plain evaluation over the trimmed readings, with no mixed-scope context.
- **R3a.** Assert that property rather than assuming it: no tab with a positive `range_cc` may reference a range-0 factor variable (`uniqueWindValuesUsed`, `uniqueNonZeroWindValuesUsed`, `triedAllVegetations`). If a future re-extract breaks it, the test fails and says that Sam's reuse-from-`best` rule now needs implementing, instead of the tab silently misclassifying.
- **R3b.** `category.current` is evaluated once at the end of the window, not as a floor over prefixes within it, so the ratchet is not reintroduced at a two-run scale on 45 and 47.
- **R4.** `category.current` is undefined, and every consumer falls back to `category.best`, in two cases: the activity's `range_cc` is 0, and no category matches at the end of the window.
- **R4a.** `category.current` is computed from the readings on demand. This story adds no `run_record` / `run_history` structure and no incremental per-run update. *(Negative requirement: nothing built. `computeCurrentCategoryForEngine` recomputes from `engine.readings` per call.)*
- **R5.** Derive each activity's `range_cc` from its own category expressions, per Sam's rules, rather than hardcoding a lookup table.
- **R5a.** Pin the derivation with a test asserting Sam's eleven hand-computed values, so a future re-extract that moves a value fails visibly with the sheet's number on one side and Sam's on the other.
- **R6.** The feedback Hazbot shows on a click is selected by `category_used = current` when `current` is defined, falling back to `best` when it is not (R4). The coach-mark tour launched from that feedback keys off the same `category_used`, not off `best`. This is the whole of the near-term deliverable: the *first* feedback for any category.
- **R6a.** The no-demotion promise is kept in the *record*, not in the feedback: `best` is unchanged, keeps its ratchet, and is still carried as `matchedCategory` on every click (R9). What the student sees describes the window, so on the tabs where the two disagree the feedback follows `current` in both directions.
- **R7.** Bind the most recent qualifying run in `evaluateWith`, not the earliest. This is a **diagnostic** fix, not a classification one: `evaluateWith` returns `value: bound !== undefined`, so first-versus-last binding cannot change any category's truth. It changes what the sidebar reports as the matching run, which is what a validation walk reads.
- **R8.** The dev sidebar surfaces all three values, so a validation walk can read `best`, `current` and the selected `category_used` rather than inferring them. The `current` row also carries the window size and the number of canonical runs it actually covered. The values reach the sidebar through `useAnalysisEngine`'s `HookReturn`, and the highlighted `.hazbot-sidebar-category-matched` row follows `category_used`, not `best`. This is additive substrate API and triggers R10b.
- **R8a.** State in the same place that everything else in the sidebar stays `best`-scoped: the per-category truth icons, the Factor Variables panel and the expression coloring are all computed over the full readings array and this story does not change that. Measured on tab 23 (run 1 correct zones plus one spark per zone, run 2 all defaults): `best` 5, `current` 2, `category_used` 2, while the full-history truth is `{1: false, 2: false, 3: true, 4: false, 5: true}` and `setAnyZoneVar` reads `true`.
- **R8b.** Rendering a windowed truth tree and a windowed Factor Variables panel is deliberately **not** in scope. It needs a second `EvalCtx` threaded through the substrate sidebar, which is substrate work for a dev-only surface. R8a's note is the cheaper fix for the same failure mode. *(Explicitly not built.)*
- **R9.** `HazbotButtonClicked` gains `categoryUsed` and `categoryCurrent` (both `number | null`). **`matchedCategory` keeps meaning `best`**, so no existing field changes meaning and sessions logged before this change stay comparable with ones after it.
- **R9a.** **`LOGGED-EVENTS.md` must be updated**, for five events rather than one: the two new fields on `HazbotButtonClicked`, plus a note on `HazbotShowMeClicked`, `HazbotTourCompleted` and `HazbotTourDismissed` that their `categoryId` is now `category_used`, which may differ from `matchedCategory` **in either direction** (lower is the common case; higher occurs only on tab 45, only as `2 -> 3`, and never reaches a celebration category). The fifth is `AnalysisEngineActivated`, which gains `rangeCc` (R9b); document there that a null `categoryCurrent` means `range_cc` 0 when `rangeCc` is 0, and an unmatched window otherwise. Cross-reference `APP_RULES_VERSION` 6 (R10) as the boundary marker.
- **R9b.** Carry the derived `range_cc` on the `AnalysisEngineActivated` payload, next to `engineVersion`, `appRulesVersion` and `ruleSetId`. Without it `categoryCurrent: null` is uninterpretable, since R4 gives it two causes that log identically and R5 makes the disambiguator a function of the expressions inside a particular build.
- **R10.** Bump `APP_RULES_VERSION` from 5 to 6, once for this branch. The 5 is WM-51's, inherited through the stack (`master` is at 4).
- **R10a.** Widen the bump policy in `docs/hazbot-update-workflow.md` §7 to cover changes in *evaluation* semantics, not only sheet edits.
- **R10b.** Bump the substrate version in `src/hazbot/engine/version.ts` from `0.0.1` to `0.1.0`, per the "minor for additive API" policy in the WM-10 spec. The bump is **unconditional** on this branch. The surface being versioned: a host-supplied readings-window selector reaching `computeView`, plus the new `HookReturn` fields it feeds.
- **R11.** No change to the rule-set files, the sheet extraction, or the feedback text. This story changes how the existing expressions are evaluated, not what they say. *(Negative requirement. The fixture-extraction step edits files under `src/hazbot/rule-sets/`, but only the `<tab>.test.ts` files.)*
- **R12.** Re-run both oob sweep harnesses (`hazbot-coverage-sweep.test.ts` and `hazbot-patch-verification.test.ts`) after the classification change, with `VegetationSet`, `DroughtLevelSet` and `WindSet` added to their axis lists. Downward reclassification is expected and is the point of the story, so the usual "no already-covered state moves" bar does not apply.
- **R12a.** It is replaced by two bars that do apply. First, **`best` may not move at all**. Second, **no upward move may land on its ruleset's highest category id**, so no student can be congratulated on a window they did not earn. Measured: tab 23 moves 29 of 81 two-run states, tab 45 moves 5 of 64, tab 47 moves none of 64. Upward moves exist and are confined to one shape: `2 -> 3` on tab 45.
- **R12b.** Commit both R12a bars as a test, rather than leaving them in the deliberately uncommitted oob harnesses. The committed version enumerates each positive-`range_cc` tab over its own axes and asserts (a) `best` matches a pinned baseline and (b) no upward move lands on its ruleset's highest category id.
- **R12c.** Build the per-tab readings from the constants already in each `<tab>.test.ts`, extracted to a shared fixture rather than authored fresh. This is the requirement that decides whether R12b is a gate or a decoration: a tab-23 builder whose "correct zone setup" did not actually satisfy `CorrectZoneSetup` reported 18 of 81 moved states instead of 29, as a clean pass.
- **R12d.** Ten tabs have a positive `range_cc` (23, 25, 32, 33, 34, 35, 42, 45, 47, 54) and their axes differ, so name the axis set per tab. **Tab 54 is the exception that looks like it belongs with 45 and 47 and does not**: its categories 3 and 4 both require `SevereDroughts` (every zone at Severe Drought) while its SIMINIT default is No Drought throughout, so a default-versus-changed axis never leaves category 2. Its real axis is severity, and its own test file already carries it.
- **R12e.** The sweep asserts, per tab, that its `best` series covers **more than one distinct category id**, and logs the distinct set. This is the cheap structural guard against R12c's failure mode.
- **R13.** Rebuild the reproduction probe from the WM-45 reproduction table (perfect run then weaker run on ruleset 23 must resolve to 4, not 5) and keep it as a committed regression test rather than a throwaway.
- **R13a.** Pin the `current > best` case in the same committed test. The sequence: on tab 45, run 1 changed setup with a fire line, run 2 default setup with a helitack, run 3 default setup with no tools, giving `best` 2, `current` 3, `category_used` 3.
- **R14.** Regenerate the replay fixture and require a `sessionId`-only diff. The fixture pins `matchedCategoryHistory` for ruleset 25 computed from `best`, which this story does not change, so any other diff is a `best` regression.
- **R14a.** The generated validation playbooks are unchanged. What needs editing is `docs/hazbot-validation/localhost-urls.md`, in two places, both justified by a whole-history reading that only `best` still satisfies (the "full page navigation per probe" guidance and the "engine picks the highest-numbered ✓" sentence).
- **R14b.** Add the `current` and `category_used` series to the fixture alongside `matchedCategoryHistory`, so the value this story introduces is pinned by the same determinism check that pins `best`. Both `scripts/generate-replay-fixture.js` and `replay-fixture.test.ts` change together. On the commit that introduces them the expected diff is `sessionId` plus the two new arrays, and `sessionId`-only from then on.

## Technical Notes

**The window is a wildfire concept, not an engine concept, and R8 decides how it reaches the substrate.** The substrate is host-app-agnostic and its eslint boundary forbids importing outside `src/hazbot/engine/`, so the trailing-window trim cannot be written into the engine as "the last N runs". Two routes were available in principle: a generic readings-window selector the host app supplies, or a wildfire-side transform applied before the readings reach the evaluator. **R8 rules the second one out**, because `computeView` derives every field of `HookReturn` from the engine instance alone, so a trim applied wildfire-side in `hazbot-button.tsx` can satisfy R6 but can never put `current` and `category_used` on the `HookReturn` where R8 requires them. The surviving surface is a host-supplied readings-window selector reaching `computeView`, and that selector *is* the additive substrate API R10b bumps `0.0.1` to `0.1.0` for.

**The `diagnostics` escape hatch was considered and rejected.** `Sidebar` already takes a host-supplied `diagnostics` prop, so wildfire could show the three values as diagnostic lines with no substrate change at all. What that saves is the additive substrate API surface plus the version bump; what it costs is that the highlighted matched row keeps showing `best`, which is where `CLAUDE.md` tells a validation walker to read the engine's answer. The story is already in the business of correcting walker guidance (R14a, R8a), so this is a real trade rather than a forced move. It is decided for R8 on the ground that a correct value in the row people read beats a correction note beside a wrong one.

**The window is a uniform slice of readings, measured rather than assumed.** Sam's design allows a mixed scope, where range-0 factor variables see the full history while the rest see the window, which would have required a per-variable readings selector on `EvalCtx`. It has no live instance: the only range-0 variables are on tab 24, whose `range_cc` is 0, plus `triedAllVegetations`, which the re-extract left unreferenced. So `category.current` is `highestTrueAt` over a trimmed readings array and `EvalCtx` is untouched. R3a guards the assumption.

**`current` is usually below `best`, and where it is above, following it is both safe and correct.** A trailing window can make a `NOT`-guarded lower category true that was false over the full history, so `current` is not bounded above by `best`: enumerating tab 45, `current > best` in 35 of 512 three-run sequences, 308 of 4096 four-run, and 2121 of 32768 five-run. An earlier draft of R6 took `min(best, current)` here, and measured, that choice reinstates the bug the story exists to fix (see the Decisions section). Following `current` upward cannot over-reward, by construction: a category built only from positive conditions that is true over a suffix is also true over the full history, so an upward move requires a `NOT`-guard, and every upward move measured is `2 -> 3` on tab 45, coaching to coaching, never the celebration.

**Which tabs can move upward at all is a static property of the expressions.** An upward move needs an anti-monotone subterm, and two shapes qualify: a **history factor variable under an odd number of `NOT`s**, and a **`WITH` occurrence under an odd number of `NOT`s** (a `NOT` *inside* a `WITH`'s prop expression does not qualify, since sim-props evaluate per reading).

| Tab | NOT-guarded shape | Consequence |
|---|---|---|
| 25, 34, 42, 54 | none | `current > best` structurally impossible |
| 24 | categories 2-4 (history variables) | `range_cc` 0, so `current` is undefined and R4's fallback applies |
| 23, 32, 33, 35 | category 2 only (history variable) | can only lift `current` to 2, and `best` is at least 2 once any run exists, so no upward move |
| 47 | category 4 (a negated `WITH`) | category 5 is category 4 with the `NOT` removed, so whenever category 4 is true in a window and false over the history, category 5 is true over the history and `best` is 5. No upward move, by subsumption rather than by absence |
| 45 | category 3 (history variables), against a top category of 4 | the sole tab that can move upward, landing one below the celebration |

**The downward direction has a consequence worth accepting deliberately: on the two `range_cc = 2` tabs, a windowed category can deny a run the student actually made.** Both carry a category whose text is a claim about the whole session rather than about a run, and a trailing window cannot express that claim. Tab 47 category 4 asks "Did you try running the model **without firelines and helitacks**?" of a student who did exactly that first (33 of 512 three-run states). Tab 45 reaches the same place through `NOT (usedFireline AND usedHelitack)`: "Try using both the **firelines and helitacks!**" to a student who used both (511 of 4096 four-run states). This is accepted rather than fixed: it is the price of coaching on the window wherever a category's text encodes history, it is Sam's design behaving as he specified it, and the remedy if he dislikes it is a per-category `range_cc` rather than anything in this story's code.

**Sam's `range_cc` derivation reproduces his hand-computed table exactly, on all eleven tabs.** The rules, restated precisely: `range_cc` is assigned **per occurrence**, so an occurrence carrying a prop expression (`ranSimulation WITH ...`) scores 1 and a bare occurrence scores 0; `NOT` preserves its operand; `OR` takes the max; `AND` sums; the activity value is the numeric max across its categories. Tab 24 derives 0 for a coherent reason rather than by special case: it carries no `WITH` clause anywhere. Note the distinction between the two parameters Sam defines: the *range* of a factor variable is how many successive runs it takes to compute and decides whether it is recomputed or reused; the *range_cc* of an occurrence is an input to the per-activity window size only.

**R2a depends on WM-31, which has not shipped.** The paused-run case only has an effect if the Hazbot button is clickable while paused. Trudi settled it on 2026-08-18: the WM-31 description reads "if model is stopped/paused, Hazbot is enabled and ready", and the description is the authority, not her summarizing sentence, which parses both ways read cold.

**A short window is safe, measured.** On a one-run session with `range_cc = 2`, evaluating over the single run that exists gives tab 45 category 3 and tab 47 category 3 (without mitigation) or 4 (with). All four are the right coaching. The alternative reading is actively harmful: treating a short window as insufficient data would evaluate `ranSimulation` false, so `NOT ranSimulation` goes true and a student who has just run the model is told they have not run it.

**A Reload leaves `current` describing the run that was just wiped.** Decision 3 keeps every run record and `canonicalRunReadings` ignores `runWindowClosed`, so after an in-app Reload the newest canonical run is the discarded one. Today's floor behaves the same way, so this is inherited rather than introduced. Fixing it is not cheap: `translate.ts` maps `SimulationRestarted`, `SimulationReloaded` and `TopBarReloadButtonClicked` to one modifier that pushes no reading, so the readings stream cannot tell a Reload from a Restart.

**What the eventual choice-at-maximum flow needs, in Sam's words (2026-08-21).** The feedback logic has to depend "not just on `category.current` and `category.best` but also on the full feedback request/action history", specifically whether the student requested feedback on a given run and what they then did with the coach marks. **The data that flow needs is already being logged**, so nothing here blocks it: whether feedback was requested comes from `HazbotButtonClicked`, and coach-mark completion is derivable from `HazbotShowMeClicked { stepCount }` paired with the `lastStepIndex` on `HazbotTourCompleted` / `HazbotTourDismissed`.

**Reload and browser reload differ.** The in-app Reload keeps every prior run record. A *browser page* reload destroys the in-memory engine, so run history does not survive leaving and re-entering the page. Sam is on record that this is acceptable; WM-20 is the story that would make it durable, and it is out of the sprint.

**Live caution carried from WM-51.** `CorrectZoneSetup` on tab 23 has an unresolved ambiguity: its Details cell allows zone 2's terrain to be "same as zone 1 or Foothills", while a plain-language note in the same tab says "either both sides the plains or both sides hills". The implementation follows the Details. This is queued for Sam and is not WM-45's to fix.

**Test harnesses.** The two oob sweep harnesses under `hazbot-sweep/` are deliberately not committed. Their axis lists need `VegetationSet`, `DroughtLevelSet` and `WindSet` added, or tab 34 degenerates and falsely reports categories unreachable.

**Implementation facts established by spiking the plan and reverting** (baseline suite green at 72 suites / 796 tests):

- **The trim cannot resolve by identity or by timestamp.** `canonicalRunReadings` returns a *clone* for any pause/resume-folded run, so `readings.indexOf(run)` is `-1` for exactly the runs Decision 4 exists to handle, and an `at`-based fallback can silently widen the window to the whole session because `at` carries no uniqueness contract. The trim takes exact indices from the canonical-run walk instead (`canonicalRunStartIndices`).
- **`EngineOpts` is the right route for the window, not `AnalysisEngineProviderProps`.** `hazbot-button.tsx` reads the engine through `getAnalysisEngine()` with no React context, so a prop-borne selector cannot serve it, and a selector fixed for the engine's lifetime needs no `computeView` cache-key change.
- **A two-run enumeration never exercises R12a's upward bar.** Upward moves first appear on tab 45 at depth 3. So the committed sweep runs tab 45 at depth 3; every other positive-`range_cc` tab stays at depth 2.
- **The selector return type must be nullable.** Returning an *empty* window for `range_cc` 0 makes `highestTrueAt` evaluate the empty-prefix state, which matches `NOT ranSimulation` on every tab: measured on tab 24, `best` 5 and empty-window `current` 1, so the student is told to scroll up and run the model no matter what they did.
- **R4's fallback is unreachable across all ten positive-`range_cc` tabs**, not just 45 and 47: swept at depth 2 over each tab's own shape space (1,000+ states), zero null `current` and zero null `best` anywhere.
- **Lint is a hard CI gate, through the build rather than through a job of its own.** `npm run build` is `npm-run-all lint:build clean build:webpack`, so `lint:build` errors fail the "Build and Run Jest Tests" job before Jest runs, and the job's name then blames the tests. Run `npm run lint` before pushing: it catches the same errors, and the two configs differ only in severity for warnings.

## Out of Scope

- **The choice-at-maximum-category flow** ("your runs look great, but the last run has room for improvement, do you want help or shall we move on?"). Sam's design specifies it; the near-term ask is the first feedback only.
- **Level 2 and level 3 feedback**, the "same score, different hint on the second and third click" progression. That is WM-46, which stacks on this story.
- **The "comprehensive diagnosis and serious help" branch** and the four-clicks-total rule from Sam's feedback logic.
- **The `run_record` / `run_history` structure and incremental per-run computation.** Sam asked for it; it makes no observable difference to this deliverable and its consumers are WM-46 and WM-20.
- **`coachmark_tutorial` instrumentation** (`num_steps` / `steps_completed`) and the `user_choice` field of `hazbot_interaction`. `user_choice` has no consumer until the choice flow exists; the other two need no instrumentation at all, being already derivable from the tour events.
- **Resetting `current` on Reload.** It needs `translate.ts` to distinguish Reload from Restart, which it currently does not. Belongs with **WM-47**, which renames that button to Clear All.
- **Persisting `run_history` across a browser page reload.** That is WM-20 / LARA-211 / AP-73, all out of the sprint.
- **Limiting how many times a student may click Hazbot.** Decided by Trudi on 2026-08-18: no limit. See WM-31.
- **Disabling Hazbot during a run.** WM-31.
- **Re-extracting or editing the rule-sets.** WM-51 did that; this story evaluates the same expressions differently.
- **Resolving the tab-23 `CorrectZoneSetup` ambiguity.** Queued for Sam.
- **A windowed truth tree and a windowed Factor Variables panel in the sidebar** (R8b). It needs a second `EvalCtx` threaded through the substrate sidebar, for a dev-only surface.

## Answers carried back from Sam and Trudi

- **`range_cc` is derived, not authored** (2026-08-21). Sam's reply was a flat "No" to whether he wants a value the expressions do not imply. R5 and R5a stand unchanged, and the per-category override column stays a deferral rather than a plan.
- **The incremental `run_record` is not being built** (2026-08-21). Accepted conditionally: "I am fine with it for now ... As long as what we are building now does not accidentally block these future extensions (and I don't see such blocks), it should be OK." The condition is met.
- **On tabs 45 and 47, a two-run window can deny a run the student made** (2026-08-21). Accepted for this round: "It seems that there is little we can do for the time being", and "we may be sticking with 'just use category.current' strategy for this round and then hash out a more complex scenario later."

## Decisions

### Hardcode the eleven `range_cc` values, or build Sam's auto-derivation?
**Context**: This was read as the story's open cost driver, on the assumption that the derivation was substantial and that it disagreed with Sam's table on two tabs. Neither assumption held: implemented as an AST walk over the already-extracted expressions the derivation is about twenty lines, and it reproduces Sam's values on all eleven tabs. The apparent conflict on tabs 24 and 42 was an error in the hand-computation, since `range_cc` is assigned per *occurrence*.

**Options considered**:
- A) Hardcode the eleven values in one table, with a comment pointing at Sam's doc.
- B) Derive, and pin Sam's eleven values in a test.
- C) Derive, plus explicit per-activity / per-category / per-variable override machinery as Sam's design allows.
- D) Hardcode now, and file the derivation as a follow-up story.

**Decision**: **B.** The deciding argument is WM-51's durable lesson about invisible contract drift. A hardcoded table is precisely the kind of constant that goes stale when Sam edits the sheet: tab 34 moved from 0 to 1 purely because its expressions changed, and nothing in the codebase would have noticed. Deriving from the expressions means the value re-derives at the next re-extract, and the pinning test turns a future divergence into a failing test. C is machinery for a need that has not appeared.

---

### Should `range_cc` live in the base spreadsheet?
**Context**: Sam's design allows `range_cc` as an optional parameter at three levels (per activity page, per category, per factor variable). None of those columns exist, and the extractor's column map has no entry for them. A per-category column is cheap; a per-activity scalar has no home at all, since the non-category rows are deliberately dropped.

**Options considered**:
- A) Keep it out of the sheet; the derivation reads expressions that are already extracted.
- B) Ask Sam to add a per-activity `range_cc` cell to each tab, and extend the extractor to read it.
- C) Full three-level support as Sam's design describes.

**Decision**: **A.** With the value derived, anything authored in the sheet could only be an override, and no tab needs one. The usual argument for the sheet (Sam retunes without a developer) is already satisfied by a different route: `range_cc` follows from the expressions he authors. A hand-entered cell would *introduce* drift risk rather than remove it. **Trigger for revisiting**: the first time Sam wants a window the expressions do not imply, add a **per-category** column, which is the level that fits the extractor's row shape.

---

### What does `category.current` mean for a paused, unfinished run?
**Context**: Trudi ruled that Hazbot is enabled while paused, so a student can ask for analysis part-way through a run. Two facts decide most of it: **no sim-prop reads run outcome**, so a finished run tells the engine almost nothing a paused one does not; and **the paused run is already a canonical run**, since `canonicalRunReadings` pushes a run at its `SimulationStarted`.

**Options considered**:
- A) Evaluate the partial run as the newest run in the window.
- B) Fall back to the last *completed* run, so the window only ever contains finished runs.
- C) Evaluate the partial run only when it is the sole run, otherwise fall back.

**Decision**: **A.** It needs no new logic, and it is the only option that does not reintroduce the bug the story exists to fix: under B, a student who makes a perfect run, starts a weaker one, pauses, and clicks Hazbot is told about the perfect run, which is Trudi's original complaint verbatim. **Known wrinkle** (which does not separate the options): a fire line drawn while paused is not in the engine's reading until the student resumes, so a student who pauses via the Fire Line button, draws, and clicks Hazbot is told they have not used mitigation.

---

### Which of the remaining history-scoped factor variables should be recomputed over the window?
**Context**: The question turns on *range* versus *range_cc*. `setAnyVar`, `setAnyZoneVar`, `usedFireline` and `usedHelitack` each need exactly one run to compute, so they are range 1; the `range_cc` 0 they score is an input to window *size*. Two policies were probed against real sequences:

| Case | `best` | reuse from `best` | recompute over window |
|---|---|---|---|
| Tab 45, tools in runs 1-2, plain runs 3-4 | 4 | **null, nothing matches** | 3 |
| Tab 23, run 1 changed zones, run 2 pure defaults | 3 | 3 | 2 |

**Options considered**:
- A) Recompute all of them; every referenced factor variable is range 1.
- B) Reuse the prop-less accumulators from `best`, treating them as range 0.
- C) Decide per variable with Sam, treating all six as open.

**Decision**: **A.** It is the literal reading of Sam's range definition, it is the only policy that never produces a null `current` (tab 45 under reuse is a coverage hole of exactly the shape WM-51 spent its branch closing), and it gives more precise coaching on the tab-23 case. It also removes the mixed-scope machinery from the build: `EvalCtx` is untouched.

---

### Does this story build the `run_record` structure and compute incrementally, or compute `current` on demand?
**Context**: Sam asked for the category to be updated "as soon as the relevant data are available". Cost is not the motive: a full floor computation runs at 0.3 ms for a 5-run session, and the view is already memoized per engine snapshot. The durable record already exists and is not in memory: `log()` sends every event to LARA before routing it to the engine.

**Options considered**:
- A) Compute `current` on demand from the existing readings. No new data structure, no lifecycle.
- B) Build `run_history` / `run_record` now, updated incrementally as runs progress.
- C) Compute on demand, but land the `run_record` type and populate it per run with no consumer, so WM-46 inherits the shape.

**Decision**: **A.** For this deliverable the two are observationally identical, because the engine is already a pure function of an append-only readings array. B buys a lifecycle to get wrong for a benefit no consumer needs, and its one real benefit (persistence) belongs to WM-20. **Re-checked when WM-46 moved from "later" to "being specced today"**, and the shorter horizon strengthens the deferral: WM-46's actual ask is a per-category *click* counter, which is the `hazbot_interaction` half of Sam's shape, not the `run_record` half, and that half cannot be derived at all, so WM-46 must introduce new state whatever WM-45 lands. **One decision to carry into WM-46's spec**: whether click state lives outside the engine or clicks become readings. The second breaks the invariant this story is built on (the engine is a pure function of a click-free readings array) and is the hazard the WM-6 no-op was written to prevent.

---

### How does `category.current` collapse a window of more than one run?
**Context**: For `range_cc = 1` the question does not arise, but 45 and 47 sit at 2 and their top categories are two `ranSimulation WITH ...` clauses ANDed together, which only evaluate true at the *end* of a two-run window. Enumerating all 64 two-run sequences on each: zero end-of-window nulls on both tabs, and five end-versus-floor disagreements on 45 (floor higher in all five), zero on 47.

**Options considered**:
- A) Evaluate once at the end of the window; if nothing matches, `current` is undefined and falls back to `best` per R4.
- B) Evaluate once at the end of the window; if nothing matches, treat it as null distinctly from undefined.
- C) Apply the floor within the window.

**Decision**: **A.** C re-introduces the ratchet at two-run scale, and the five sequences where it differs all report the earlier run, which is what the story exists to stop. A and B are the same behavior, and A reuses the fallback path R4 already defines. Since the fallback is unreachable on the evidence, its value is defensive.

---

### What should WM-45 be repointed to?
**Context**: The story's content changed substantially during speccing.

**Decision**: **Not revisited in the spec.** What is worth carrying into the conversation is that the *content* changed rather than the size: the deliverable is Sam's `range_cc` design with the derivation built rather than the table hardcoded, minus the incremental `run_record`, and with no sheet, extractor or mixed-scope-context work in it.

---

### R2a depends on a WM-31 behavior that has not shipped
**Context**: R2a (the unfinished newest run counts) only has an effect if Hazbot is clickable while paused, which is WM-31's gate and still To Do. Today the button has no `disabled` state at all, so R2a is live now and would be silently retired if WM-31 disabled the paused case.

**Decision**: Recorded as a dependency in the Technical Notes, with the WM-31 *description* named as the authority over Trudi's summarizing sentence, which parses both ways read cold.

---

### The spec bumped the rules version but not the substrate version
**Context**: The substrate carries its own semver with a "minor for additive API" policy, and `engineVersion` rides in the `AnalysisEngineActivated` payload, so leaving it unchanged would show the same substrate version on both sides of an evaluator behavior change.

**Decision**: Added **R10b**. Initially conditional on which route the implementation took; later made unconditional (see the R10b/R8 route decision below).

---

### The behavior when a session has fewer runs than `range_cc` was undefined
**Context**: R2 never said what happens when the session holds fewer runs than the window. Sam's "if R > 0 and N < R, the factor variable must evaluate false" rule looks relevant but governs a *factor variable's* range, and no referenced variable has a range above 1.

**Decision**: Added **R2b** (evaluate over the runs that exist), with the four measured values recorded. The alternative reading would drop a student who has just run the model to category 1, "you have not run the simulation yet".

---

### R10 did not say which version numbers, on a branch where the predecessor already bumped
**Context**: This branch is stacked on WM-51, which already moved `APP_RULES_VERSION` from 4 to 5. Without naming the numbers, a reviewer cannot tell whether 5 was this story's bump or the parent's, and the version is the handle that lets a dataset consumer correlate a session with the rules that classified it.

**Decision**: **R10** names 5 to 6, and new **R10a** widens the workflow doc's bump policy, which was written entirely in terms of sheet edits and so did not literally cover an evaluation-semantics change.

---

### R12 discarded the only gate the harnesses provide
**Context**: R12 said reclassification is expected, so the patch-verification matrix is "read as a report rather than a pass/fail gate". That left the story with no automated check on the blast radius, on the branch that changes the matched category for every multi-run session.

**Decision**: **R12** scopes the retired bar to downward moves and **R12a** adds the invariants that replace it. The first version of R12a was "no state may be reclassified upward", which followed from `category_used = min(best, current)`. **Superseded** when R6 dropped the `min`: upward moves are legal in one measured shape, so R12a now carries the two bars that survive (`best` may not move at all; no upward move may land on its ruleset's highest category id).

---

### R14's treatment of the replay fixture was too weak to catch the thing it should catch
**Context**: R14 asked to "re-verify the validation playbooks and the replay fixture". The fixture is more useful than that: it pins `matchedCategoryHistory` for ruleset 25 computed through `best`, which this story must not change, so a diff is not something to re-verify, it is proof that `best` regressed.

**Decision**: **R14** becomes an assertion (regenerate, expect a `sessionId`-only diff, verified as the baseline on the branch), and **R14a** redirects the playbook half at `localhost-urls.md`, whose walk guidance is justified by the floor, rather than at the generated playbooks, which are driven by sheet content this story does not touch.

---

### The Overview and Project Owner Overview overstated the change in two directions
**Context**: The Overview said the feedback reflects `current` "instead of the all-time best" while R6 at the time selected `min(best, current)`, and the Project Owner Overview promised "nothing takes an achievement away from a student" while the Technical Notes recorded that a student who peaks and then regresses is shown coaching rather than the celebration.

**Decision**: Both rewritten. The `min` half was later re-corrected when R6 dropped the `min`, which made the Overview's *original* phrasing closer to the shipped behavior than the correction had been. The regression consequence is now stated directly in the Project Owner Overview, since it is the single most likely thing for Trudi to ask about after it ships.

---

### After an in-app Reload, Hazbot describes a run the student can no longer see
**Context**: Decision 3 keeps every run record and `canonicalRunReadings` ignores `runWindowClosed`, so the newest canonical run after a Reload is the run that was just discarded, and the Hazbot button has no `disabled` gate today.

**Decision**: Real, inherited from today's floor, and deliberately left. Recorded in the Technical Notes and pointed at **WM-47** in Out of Scope. The blocker is that `translate.ts` maps Reload and Restart to the same reading-less modifier, so the stream cannot distinguish them, and only Reload is a case where blanking `current` would be right.

---

### R9 must add fields rather than repurpose `matchedCategory`
**Context**: `matchedCategory`'s semantics are pinned in the WM-6 spec. If it silently started meaning `category_used`, every session logged before and after this change would look like one series with a discontinuity in the middle, discoverable only by an analyst who knew to check `APP_RULES_VERSION`.

**Decision**: **R9** adds `categoryUsed` and `categoryCurrent` and pins `matchedCategory` to `best`. **R9a** requires the `LOGGED-EVENTS.md` update and widens it to the three tour events, whose `categoryId` also shifts to `category_used`: four events change semantics on this branch, not one (later five, with `AnalysisEngineActivated`).

---

### Sam should be told the derivation exists, since it changes where his control lives
**Context**: Deriving `range_cc` is the right call for drift, but Sam's design deliberately offers "complete manual control" through optional parameters at three levels, and this spec implements none of them. His eleven hand-computed values become an assertion about the code rather than an input to it.

**Decision**: Added a **Questions for Sam and Trudi** section collecting the three items the spec owed a person: the derived-not-authored `range_cc` and its escape hatch, the deferred incremental `run_record`, and the two cases where Hazbot describes a model the student is not looking at. All three came back answered (see "Answers carried back" above).

---

### `min(best, current)` reinstates the story's own bug where `current` exceeds `best`
**Context**: The Technical Notes called `min` "safe but not free" and noted only that a trailing window *can* make a `NOT`-guarded lower category true. Measured, that case is not hypothetical: on tab 45, `current > best` in 35 of 512 three-run sequences. Concretely, run 1 changed setup with a fire line, run 2 default with a helitack, run 3 default with no tools gives `best` 2 and `current` 3, so `min` selects 2, whose feedback is "Looks like you changed the Setup. Let's run the model using the original settings!" with a tour through Reload then Start, to a student whose last two runs both used the original settings. That is the complaint the story exists to fix, arriving through the requirement written to prevent demotion. The two-run enumeration could not see this, because `current > best` needs a run that has fallen out of the window.

**Options considered**:
- A) Keep `min` and record this as accepted, on the ground that no-demotion outranks window fidelity.
- B) Select `current` when it is defined and fall back to `best` only when it is not, with `best` still logged and un-demoted in the payload.

**Decision**: **B.** **R6** selects `current` outright and **R6a** relocates the no-demotion promise to the record. The deciding measurement is that following `current` upward cannot over-reward: an upward move requires a `NOT`-guard, and every upward move measured is `2 -> 3` on tab 45, coaching to coaching, never a celebration. R12a's no-upward-move invariant could not survive this and was replaced by two bars that do; **R13a** pins the three-run tab-45 sequence.

---

### R8 surfaces three numbers into a sidebar whose other panels all still describe `best`
**Context**: Every other panel in the sidebar is computed over the full history, and the matched-row highlight was driven by `best`. Verified on tab 23: `best` 5, `current` 2, `category_used` 2, while the full-history truth is `{1: false, 2: false, 3: true, 4: false, 5: true}` and `setAnyZoneVar` reads `true`, so the walker sees `▸ ✗ 2` next to a `category_used` of 2 and a factor variable holding the opposite of the value `current` was computed from.

**Decision**: **R8** now requires the `current` row to carry its window size and covered-run count; **R8a** requires the sidebar to state that the truth icons, Factor Variables panel and expression coloring stay `best`-scoped; **R8b** records that rendering a windowed truth tree is deliberately out of scope and why. **R14a** extends to `localhost-urls.md:118` as well as `:184`.

---

### The invariant R12a called a gate had no committed home, and `current` had no determinism coverage
**Context**: Both harnesses R12a runs in are deliberately uncommitted, so the gate existed only for as long as someone re-ran them by hand: nothing in CI would catch a later refactor dropping the selection rule. Separately, R14 pinned `best` in the replay fixture and gave `current` no coverage at all.

**Decision**: **R12b** commits the two bars as a narrow always-on test over the positive-`range_cc` tabs, built on the existing `matchAgainst` / `mkReading` helpers. **R14b** adds the `current` and `category_used` series to the replay fixture, and records the one-off consequence for R14's own diff bar.

---

### R10b named one API route to the substrate, and R8 forces a different one
**Context**: R10b made the substrate bump conditional on the window reaching the engine "through a new `EngineOpts` field", and said a purely wildfire-side trim meant "no bump is due". But R8's sidebar is substrate code and the matched-row highlight reads off `useAnalysisEngine`'s `HookReturn`, so R8 pushes toward an additive substrate change wherever the trim lives, and R10b's "no bump due" branch may be unreachable.

**Decision**: **R8** names its route explicitly (the `HookReturn`, with the matched-row highlight following `category_used`) and **R10b** drops the condition, making the `0.0.1` to `0.1.0` bump unconditional. The `diagnostics` alternative is recorded in the Technical Notes as considered and rejected.

---

### R9a described the direction of the log-field shift as one-way
**Context**: R9a told `LOGGED-EVENTS.md` to note that the tour events' `categoryId` "may be lower than `matchedCategory`", which was exact under the `min` it was written against. Under the R6 that replaced it, `category_used` can also be *higher*: tab 45 `2 -> 3`.

**Decision**: **R9a** states the shift is two-way, names tab 45 `2 -> 3` as the only upward case, and points at the Technical Notes for why it cannot reach a celebration category. An analyst told the value only ever goes down would read a higher `categoryId` as corrupt data, which is precisely the longitudinal break R9 exists to prevent.

---

### R14b named the test that reads the fixture but not the script that writes it
**Context**: R14b cited only the consumer. Both sides have to change together or the regenerated fixture will not carry the fields the test asserts, and the failure surfaces as a confusing fixture mismatch rather than as a missing implementation.

**Decision**: **R14b** names `scripts/generate-replay-fixture.js` alongside `replay-fixture.test.ts`, with line anchors for both.

---

### The upward-move claim was measured on three tabs when it can be established on all eleven
**Context**: R12a scoped its claim honestly to the tabs enumerated, but `current > best` requires an anti-monotone subterm, which is a static property of the parsed expressions.

**Decision**: The all-tab table is folded into the Technical Notes and R12a's second bar is restated as a structural property that the committed test *confirms* against a future re-extract rather than establishes. **Amended by the fifth pass**: the first version of the screening rule looked only for a history factor variable under an odd number of `NOT`s, which put tab 47 in the "none" row wrongly (see the next decision).

---

### Windowing inverts the categories whose text is a claim about the whole session, and both `range_cc = 2` tabs have one
**Context**: Tab 47 category 4's studentAction is explicit: "but without *first* running with original settings with neither fireline nor helitack", and its feedback plus live `[Show me]` tour ask the student whether they tried the baseline run they opened with. Measured: 33 of 512 three-run states on 47 (`best` 5 to `current` 4), and 511 of 4096 four-run states on 45 (`best` 4 to `current` 3, "Try using both the firelines and helitacks!" to a student who used both). This is the mirror of the reported bug: "the feedback denies a run I actually did".

**Decision**: Accepted, not fixed. Recorded in the Technical Notes with both sequences and their counts, and raised with Sam, who accepted it for this round. No requirement changed: it follows from Sam's own `range_cc` values, and the alternatives (reusing history-scoped accumulators, or widening the window) are worse. The lever if he changes his mind is a per-category `range_cc` or feedback text that does not assert history.

---

### R8 foreclosed one of the two routes the Technical Notes still presented as open, and the substrate API being versioned was never named
**Context**: The notes presented the readings-window selector and the wildfire-side transform as alternatives. Measured against the code, `computeView` derives every `HookReturn` field from the engine instance alone and the provider props carry only `engine` and `appRulesVersion`, so a wildfire-side trim satisfies R6 but can never reach `HookReturn`.

**Decision**: The Technical Notes state that R8 rules out the wildfire-side transform, with the two code facts that force it, and name the surviving surface (a host-supplied readings-window selector reaching `computeView`, on `EngineOpts` or `AnalysisEngineProviderProps`, with the choice left to implementation and later settled as `EngineOpts`). **R10b** points at that named surface.

---

### The screening rule behind R12a's structural claim missed negated `WITH` occurrences, and tab 47 has one
**Context**: Tab 47 category 4 is `NOT(with(ranSimulation, ...)) AND with(ranSimulation, ...)`. The `NOT` sits over a `WITH` *occurrence*, which is anti-monotone for the same reason a history factor variable is, so the rule as stated would not flag a future re-extract that put a negated `WITH` on a high category.

**Decision**: The rule now names both shapes and says why a `NOT` *inside* a `WITH`'s prop expression does not qualify. Tab 47 moves into its own row carrying the subsumption argument (category 5 is category 4 with the `NOT` removed), confirmed by enumerating 36,928 states at two- to five-run depth for zero upward moves. The conclusion is unchanged.

---

### `categoryCurrent: null` carries two different meanings, and the parameter that separates them was recorded nowhere
**Context**: R4 gives `current` two distinct undefined cases (the activity's `range_cc` is 0; nothing matched at the end of the window) and they log identically. The disambiguator is `range_cc`, which R5 makes derived rather than authored, so it exists only as a function of expressions inside a particular build, and `HazbotButtonClicked` carries no `ruleSetId` of its own.

**Decision**: Added **R9b** (carry the derived `range_cc` on `AnalysisEngineActivated`, the once-per-page-load event that already carries the other two version handles), and widened **R9a** from four events to five. Verified in the spike that `rangeCc` reaches the payload as `0` on tab 24, so the disambiguator is present exactly where the two null causes need separating.

---

### R12b's scope was ten tabs, but its axes, size and runtime came from the three that were enumerated
**Context**: The positive-`range_cc` tabs are ten and their axes differ; only 45, 47 and 54 are described by "zone and tool axes". The sharper risk is that a hand-authored fixture that is subtly wrong pins a baseline that passes forever: a first tab-23 builder whose "correct zone setup" did not satisfy `CorrectZoneSetup` produced 18 of 81 moved states instead of 29, and nothing about the run said so.

**Decision**: **R12b** drops the size and runtime figures measured on three tabs. New **R12c** requires the per-tab readings be built from the constants already in each `<tab>.test.ts`. New **R12d** names the ten tabs and each one's axis set. **R12a** now states the axis sets behind its counts so the numbers are reproducible from the spec.

---

### The `diagnostics` route was rejected on a ground the story itself removes
**Context**: The notes rejected `diagnostics` because it leaves the matched row showing `best`, "the one place the documented workflow points at". But R14a already rewrites two sentences of walker guidance and R8a already adds a correction note to the sidebar, so the story is in that business, and the same edit to `CLAUDE.md` would make the cheap route correct. The real comparison is a substrate API addition plus a version bump against one documentation sentence, on a dev-only surface.

**Decision**: The comparison is restated honestly and **R8 still wins**: a correct value in the row walkers read beats a correction note beside a wrong one. R8, R8a, R8b and R10b are unchanged.

---

### How does the window describe itself to the sidebar?
**Context**: R8 requires the `current` row to carry the window size and the number of canonical runs covered. Both are wildfire concepts, and whatever shape carries them becomes part of the additive API R10b versions, in a substrate whose eslint boundary keeps it from knowing what a "run" is.

**Options considered**:
- A) A free-text `label` on `WindowSelection`, authored wildfire-side (`"range_cc 2 · 1 of 2 runs"`) and rendered verbatim.
- B) Typed numbers on `WindowSelection` (`{ readings, windowSize, runsCovered }`), rendered as "window 2 · covered 1".
- C) Neither on the substrate: surface the two numbers through the existing host-supplied `diagnostics` prop.

**Decision**: **A**, the free-text `label`. The substrate already carries host-authored free text for exactly this purpose (`SidebarDiagnostic` is `{ label, value, status? }`), the host-agnostic boundary is lint-enforced rather than conventional (so B would put run vocabulary into the type that rule exists to keep run-free), and rendered live, A is the only variant that names `range_cc`, the term the sheet, Sam's doc, this spec and the new `rangeCc` log field all use. C was re-costed and is not the small-API option it looked like: R8 puts the matched-row highlight on `category_used`, which requires `categoryUsed` on `HookReturn` regardless, so C pays the additive API and the bump anyway.

---

### How is the sweep's `best` baseline committed?
**Context**: R12b's first bar needs literal expected values in the repo rather than a re-derivation. Ten tabs at their own depths come to roughly 1,300 states, tab 45 alone contributing 512.

**Options considered**:
- A) One compact string per tab, one character per state (2 lines for tab 23, ~20 across all ten).
- B) Explicit arrays keyed by shape name (83 lines for tab 23, ~1,150 across all ten).
- C) A generated JSON fixture plus a generator script (413 lines for tab 23, ~5,000 across all ten).

**Decision**: **D**, a hybrid the three options missed: **store compact, assert named.** All three were built for tab 23's 81 states and diffed against a simulated deliberate change. The deciding evidence was the Jest failure message rather than the PR diff: A's `toBe` prints two 81-character strings (512 for tab 45) with no pointer to the difference, while B's `toEqual` names each changed key but costs ~1,150 committed lines. D commits the compact series, chunked one line per first-run shape and labeled with it, then asserts that the *moved set* is empty, so the failure lists only the states that moved, named, with old and new values.

**Supporting findings, one of them corrected after the fact.** `max-len` is a warning at 160 characters, so tab 45's 512-character flat series would warn while 64-character chunks will not. The source spec paired that with a claim that lint is not a gate ("CI runs build, Jest and Cypress with no separate lint step, so this is about reviewability"), and **that half is wrong**: there is no separate lint *job*, but `npm run build` is `npm-run-all lint:build clean build:webpack`, so `lint:build` runs first and its errors fail the "Build and Run Jest Tests" job before Jest starts. Found on 2026-08-21 when this branch's PR went red: seven `testing-library/no-node-access` errors in `sidebar.test.tsx` while all 879 tests passed. The chunking decision is unaffected, since `max-len` really is only a warning; what changes is that a lint error anywhere is a hard gate.

---

### `category_used` was derived independently in two places, and no proposed test pinned the direction that would catch a regression
**Context**: `readCategories` in `hazbot-button.tsx` computed `used: current ?? best` and `computeView` separately computed the same rule, and the R13a probe compared against the test's own `current ?? best`, which is a tautology that never executes the production selection. In the common direction (`current < best`) a `min` revert still passes, so after this branch landed, reverting to `min` would have kept CI green.

**Decision**: The selection rule moves into the substrate as `computeCategorySelectionForEngine`, returning `{ best, current, used, label }`, the only place `current ?? best` is written (that removed three copies, not two: the fixture generator had a fourth phrasing). The direction is pinned where it is decided: `hazbot-button.test.tsx` and `sidebar.test.tsx` each gain a `best` 2 / `current` 3 case, and `evaluator.test.ts` asserts the rule directly. The R13a probe is relabeled to say it pins the two inputs and explicitly not the selection.

---

### The shared `TabFixture` shape did not fit tabs 25 and 34
**Context**: `TabFixture` declared `defaults` as required, but `25.test.ts` deliberately omits it (rule set 25 references no `set*` factor variable). It also declared a single `start` builder, while tab 25 has two and tab 34 carries a `zones(veg, drought)` helper that returns `WildfireZone[]` and so satisfies neither half of a `ReadingBuilder`.

**Decision**: `defaults` becomes optional, mirroring `makeWildfireEngine`'s own signature. The `builders` record introduced as a first fix was then **removed entirely**: asked why any tab needed a helper at all, the answer was that none does. Checked against all eleven files, every builder merges data and nothing else, `topoReading`'s whole contribution is two literals that belong in a `base` object, and `zones` is a zone-array constructor that stays local because only its outputs are shared. `TabFixture` is data only (`{ id, defaults?, base, shapes }`) with one shared builder, verified by sweeping all ten positive-`range_cc` tabs through it.

---

### The `log.ts` edit breaks `src/log.test.ts`, which was not in the step's Files affected
**Context**: Verified empirically: two of the four tests in `src/log.test.ts` fail with `getDerivedRangeCc is not a function`, because `loadLogWithMocks` installs a `jest.doMock` factory returning exactly three exports. Adding one line to that factory turns all four green.

**Decision**: `src/log.test.ts` joins the Derive step's Files affected, with the exact mock line and the measured failure count. The two neighboring suites that mock the same barrel and need nothing (`app.test.tsx`, `engine-singleton.test.ts`) are named so they are not "fixed" speculatively.

---

### `deriveRangeCc` made wildfire the first host code to reach past the substrate's public barrel, in the same commit that versions that barrel
**Context**: `range-cc.ts` imported `CachedAst` and `PARSE_ERROR_SENTINEL` from deep inside the engine, and R3a's test additionally needed `walkReferences`. None of the three is re-exported, and the barrel's header states that everything not re-exported is substrate-internal. Not a lint failure (the restricted-paths zone constrains the engine as importer, not as importee), but an API question, live because R10b is bumping the version for exactly this surface.

**Decision**: The substrate gains one narrow accessor, `categoryExpressions(engine)`, returning only successfully-parsed ASTs, so `CachedAst` and `PARSE_ERROR_SENTINEL` never cross the boundary and stay free to change. `deriveRangeCc` narrows to `(exprs: Map<number, Expression>) => number`. The boundary rule is written down (production host code through the barrel, test files may deep-import), and R10b's versioned surface is restated as three additions rather than one.

---

### The Category summary block rendered for hosts that supply no window
**Context**: The block was gated on `engine.ruleSet` only, so any substrate consumer without a window would see its only category value relabeled `best`, a `current: n/a` row for a concept it does not have, and a note about panels describing "best, not current" that is meaningless without a window.

**Decision**: Gate on `engine.readingsWindow`, so a selector-less host sees today's sidebar unchanged while wildfire always renders the block, including tab 24 where the selector exists and returns null and the walker needs to see `current: n/a` with the highlight back on `best`. Neither `engine.ruleSet` nor `categoryWindowLabel !== null` is the right gate, and a test pins the selector-less case.

---

### `matchCurrentAgainst` reimplemented the window, so the sweep could not see a change in `makeReadingsWindow`
**Context**: As written, R12b's always-on gate never executed `makeReadingsWindow` or `computeCurrentCategoryForEngine`, so a change to either (excluding unfinished runs, moving the fallback, changing the `rangeCc` 0 answer) left the sweep green. The `rangeCc` it used also came from the hardcoded baseline entry rather than from `deriveRangeCc`.

**Decision**: `matchCurrentAgainst` points a real engine's public `readings` field at the pre-translated array and calls `computeCurrentCategoryForEngine`, so the trim, the fallback, the `rangeCc` 0 null and the label are all production code under test. `BASELINES[tab].rangeCc` is demoted from an input to an assertion against `deriveRangeCc`, removing the second place the window size was stated.

---

### R14b names `replay-determinism.test.ts`, but the plan touched only `replay-fixture.test.ts`
**Context**: Verified: `replay-determinism.test.ts` is substrate-side, builds two engines over a synthetic rule set, and has no connection to the wildfire fixture, so adding series to the fixture does nothing for it and `computeCurrentCategoryForEngine` would have ended up with no two-engine determinism coverage at all.

**Decision**: Do both halves and say so. `replay-determinism.test.ts` gains a run-free `readings.slice(-1)` selector in `makeOpts()` and a `currentA` / `currentB` pair asserted alongside the existing pair. The selector doubles as a check that the new API is usable by a host with no concept of a run.

---

### The sweep's engine got its selector after construction, contradicting the invariant that lets the WeakMap key alone
**Context**: The Sidebar step depends on "the selector arrives on `EngineOpts` and is therefore fixed for the engine's lifetime", which the spike confirmed is not true of a prop-borne selector (it returns a stale `categoryCurrent`). A post-construction assignment in a test helper turns that property into a convention. The chicken-and-egg is real (the derivation reads `parsedExpressions`, which does not exist until the constructor returns) but is already solved in production without mutation, by closing over a deferred reference.

**Decision**: `makeWildfireEngine` gains a `windowed` flag and builds the selector into `EngineOpts`, closing over a `let engine` declared above the constructor call, the same deferred-reference pattern `engine-singleton.ts` and the fixture generator already use. `readingsWindow` is never assigned post-construction anywhere.

---

### R12d's axis set for tab 54 made the committed sweep vacuous, and three shape counts were wrong
**Context**: Built on a default-versus-changed axis and swept at depth 2, **all 64 tab-54 states classify as category 2 for both `best` and `current`, with zero moved**. The cause is in the rule set: cats 3 and 4 both require `SevereDroughts` (every zone at Severe Drought) while the tab's SIMINIT default is No Drought throughout. Rebuilt on the tab's own `severeZones` / `vegChangedNotSevere` constants it sweeps 144 states across categories 2, 3 and 4 with 35 moved. The same over-generalization gave "9 shapes" for tabs 32, 33 and 35, which are 8, 8 and 12.

**Decision**: **R12d** names tab 54's severity axis and corrects the counts. New **R12e** adds the structural guard: each tab's `best` series must cover more than one distinct category id, and the distinct set is logged per tab. That single assertion turns this whole class of mis-built fixture from a green baseline into a named failure.

---

### The Feedback step's test blast radius is 14 of 24 tests, not the one case described
**Context**: Measured by applying the step's change: `hazbot-button.test.tsx` runs 14 failed / 10 passed of 24. The reason is structural: the file drives nine `mockMatched.mockReturnValue(...)` sites, and once the component reads `computeCategorySelectionForEngine` those overrides are inert and cannot be made to work indirectly, because the selection function calls the floor through `evaluator.ts`'s own local binding rather than through the mocked barrel.

**Decision**: State the measured figure in the step and name the conversion (`mockMatched` to `mockSelection`, `1` to `{ best: 1, current: null, used: 1 }`), so a reviewer treats 14 red tests as the expected diff rather than a mistake. The line estimate stands, since the churn is one line per site.

---

### Seven of the ten sweep baselines would have been generated after the change they are meant to pin
**Context**: The Sweep step lands after the classification changes, so seven baselines would have recorded whatever the already-changed tree produced, making bar 1 self-confirming on seven of ten tabs. **A first attempt at this resolution was itself wrong and is recorded rather than quietly replaced**: it moved the capture into the Fixture step on the ground that the step lands early, but the Fixture step is sixth of nine, so the capture would have been just as post-change there.

**Decision**: All seven missing series were **measured on the unmodified branch** and committed alongside the three from the pre-implementation spike, with a per-tab totals table. The sweep step says not to re-measure during implementation. Recorded alongside: `best` is genuinely untouched, so this closed a cheap gap rather than a live defect, and it is a gap R12e cannot cover, since R12e catches a fixture that never reaches its categories, not one that reaches them at already-shifted values.

---

### The `at`-resolved trim can silently return the wrong window, and the alternative is exact
**Context**: `canonicalRunWindowStart` fell back to `findIndex((r) => r.at === target.at)`, citing the sidebar's `readingIndexOf` as precedent. The precedent does not carry: a wrong index there mislabels a diagnostic, while here it changes which readings `category.current` is computed from. `findIndex` returns the **first** reading with that timestamp and `at` carries no uniqueness contract. Demonstrated on a tab-47 session where the correct window start is index 2 and the trim returns **0**, silently widening the window to the entire session. Production exposure is low (user gestures separate the timestamps) but **test** exposure is not: the shared fixtures default `at` to 100 for every reading, so a folded-run fixture collides by construction and passes for the wrong reason.

**Decision**: Resolve the index exactly rather than heuristically. `canonical-runs.ts` gains `canonicalRunStartIndices` from the same walk that produces the run readings, and `canonicalRunWindowStart` reads `starts[starts.length - rangeCc]` with no `indexOf` and no `at` comparison. Both the clone problem and the collision go away, the run-boundary rule stays in one place, and `run-window.test.ts` gains the colliding-`at` pin.

---

### `APP_RULES_VERSION` was bumped in the last commit, seven commits after the semantics it marks
**Context**: The Selector step argues the point correctly for `ENGINE_VERSION` ("it belongs with the substrate API it versions"), and the Docs step then did the opposite for `APP_RULES_VERSION`, which by R10a's own widened policy marks a change in evaluation semantics. Those semantics change in commit 3 of 9, so commits 3 through 8 would classify students under version 6's rules while every payload reported `appRulesVersion: 5`. The repo deploys per-branch builds, so a mid-branch state is reachable by more than bisect.

**Decision**: The `rules-version.ts` bump moves into the **Feedback** step, next to the change it marks. The Docs step keeps R9a, R10a and R14a and says outright that neither version constant lives in it, since each belongs with the change it versions.

---

### The `HookReturn` comment's label-to-window rule is falsified by this plan's own determinism selector
**Context**: The Sidebar step documented `categoryWindowLabel` as non-null exactly when the window matched something, so the sidebar could tell R4's two null causes apart. `WindowSelection.label` is optional, so that biconditional holds for wildfire and for nobody else, and the counterexample ships in the same branch: the Replay step's determinism selector has a window, matches a category, and carries no label.

**Decision**: The comment describes the label as what it is, an optional host-authored display string, names this branch's own label-less selector as the counterexample, and says not to infer window presence from it. The sidebar gate (`engine.readingsWindow`) was already correct and is unchanged. A note records that distinguishing R4's two null causes through `HookReturn` would need its own field.

---

**Housekeeping corrections** (recorded for completeness; none changed a decision): two stale file/line citations were corrected and the blanket "every other citation was re-checked" claim was scoped to the pass that made it; two arithmetic leftovers in the per-step line estimates were fixed and the replay generator was changed to take all three series from one selection call rather than calling the floor twice; and two measured facts that did not reproduce were restated (the `log.test.ts` failure does render a message body, and the reachable window-label set is twelve labels rather than five, with `range_cc 2 · 1 of 2 runs` unreachable because covered is always `min(rangeCc, total)`).
