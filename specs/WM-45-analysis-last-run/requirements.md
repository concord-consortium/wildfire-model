# Hazbot: analysis should reflect the last run, not the best one

**Jira**: https://concord-consortium.atlassian.net/browse/WM-45
**Repo**: https://github.com/concord-consortium/wildfire-model
**Status**: **In Development**

## Overview

Hazbot currently reports the best category a student has ever reached, so a student who does well and then does worse gets feedback about the earlier, better run. This story adds a second category value, `category.current`, computed over a short window of the student's most recent runs, and draws the feedback from that rather than from the best. The all-time best is kept, keeps its ratchet, and is still what gets logged; what changes is which of the two the coaching describes.

## Project Owner Overview

When a student clicks the Hazbot button, Hazbot looks at everything the student has done in the session and picks the highest-scoring description that fits. That was a deliberate choice: a student's score was never allowed to go down. In the classroom it reads as a bug. A student who makes a perfect run, does not ask for feedback, then makes a weaker run and does ask, is told about the perfect run they are no longer looking at.

The fix keeps the "no demotion" promise and adds a second reading of the same student. `category.best` stays exactly as it is. A new `category.current` describes only the last run, or the last two runs for the activities that need a comparison, and the feedback Hazbot shows is tuned to that. The two coexist: nothing takes an achievement away from a student, but the coaching is about what they just did. This follows a design the rules author (Sam) wrote before the ticket existed, including a per-activity table saying how many trailing runs each activity's "current" should cover.

One consequence is worth stating plainly, because it is the point of the ticket rather than a side effect: a student who reaches the top category and then does something weaker is coached on the weaker run, so they see help rather than the celebration. Their best result is still held internally, and Sam's design has an answer for that moment (Hazbot offers them a choice between help and moving on), but that flow is deliberately not in this story.

## Background

**What was reproduced.** On ruleset 23: a perfect run alone matches Category 5 (correct); a weaker run alone matches Category 4 (correct); the perfect run followed by the weaker run matches Category 5, when it should match 4. So the student is coached on the earlier run.

**Two independent mechanisms cause it.**

1. **The matched category is a monotone floor.** `computeMatchedCategoryFloor` (`src/hazbot/engine/evaluator.ts:295-313`) walks every prefix of the readings and keeps the maximum. The local variable is literally named `floor`, so the ratchet is deliberate rather than accidental.
2. **The factor variables are cumulative.** `runReadings()` (`src/hazbot/wildfire/factor-variables.ts:17`) returns every canonical run, and each boolean is `witnesses.length > 0`, meaning "any run, ever".

**Measured, and it constrains the design: removing the floor on its own still returns Category 5.** Every factor variable is monotonic (booleans are "some run satisfied this", sets only grow, the run list only grows), so a category built from positive conditions cannot switch back off once it switches on, and that is the shape of most rulesets' top category. "Take the latest category instead of the highest" does not work and never can. The window is the load-bearing part of the fix, not the ratchet.

**A third issue in the same area, smaller than it first looked.** `evaluateWith` (`src/hazbot/engine/evaluator.ts:132-149`) binds the *first* witness satisfying the prop expression, so `ranSimulation WITH CorrectZoneSetup` binds the *earliest* qualifying run. That reads as a second bug behind the reported one, but it is not: the function returns `value: bound !== undefined`, so which witness is bound cannot change any category's truth. Verified by flipping the binding and running the full suite, which stays green at 743 tests. The bound reading is consumed only by the sidebar, so the earliest-run binding misleads a validation walk rather than a student. R7 fixes it on those grounds.

**Sam's design supersedes the original framing.** "Translating Data Insights into Feedbacks" ([doc](https://docs.google.com/document/d/1cyDiewBhsFb97u8Aq7ZzuXLEnbwN1b4aUfoJ4Z7OhYE/edit)), last three subtabs, was written for exactly this problem before the ticket existed. The parts that bind this story:

- **Keep `best`, add `current`.** `category.best` keeps today's algorithm, ratchet included. `category.current` is computed alongside it over a limited window. Where the student has already reached the maximum category and then regresses, Hazbot offers a choice rather than demoting them. This answers "is the score allowed to go down" better than a yes or a no: it does not go down, the two coexist.
- **`range_cc` replaces "the last run".** `range_cc` is the number of trailing runs `current` is computed over. Factor variables whose range is 0 are reused from the `best` calculation unchanged; only positive-range variables are recomputed over the last `range_cc` runs; `range_cc = 0` for an activity means `current` is undefined and falls back to `best`.
- **Sam has hand-computed all eleven values**: **0** for 24; **1** for 23, 25, 32, 33, 34, 35, 42, 54; **2** for 45 and 47. Activity 34 moved from 0 to 1 as a direct consequence of WM-51 (it no longer has any cross-run factor variable), and Sam updated his doc on 2026-08-20 to match.
- **The `run_record` shape.** The "Additional data needed" subsection specifies a `run_history` array of `run_record`s, each carrying `category.best`, an optional `category.current`, and an optional `hazbot_interaction` (`category_used`, `feedback_text`, optional `user_choice`, optional `coachmark_tutorial` with `num_steps` / `steps_completed`). It also specifies *when* each record updates: at run start from the launch parameters, during the run on relevant log events, at run end if any category depends on results, on a Hazbot click, on each coachmark step, and finalization when the next run starts or the page ends.
- **Scope was narrowed by Sam himself on 2026-08-18**: the near-term target is *"the 'first feedback' for any category"*. The choice-at-maximum flow, the level 2/3 progression, and the "comprehensive diagnosis" branch are not in the immediate ask (the level 2/3 work is WM-46).

**Where WM-51 left this.** WM-51 delivered run-scoping only where Sam did it at source in the sheet (rulesets 34 and 42 moved to sim-props inside `WITH`). Everything else is still history-scoped. The remaining surface, computed from the new extraction with `ranSimulation` excluded because it is the run trigger rather than an accumulator:

| Ruleset | History variables still used |
|---|---|
| 23 | `setAnyZoneVar` |
| 24 | `setAnyZoneVar`, `uniqueWindValuesUsed`, `uniqueNonZeroWindValuesUsed` |
| 32 | `setAnyZoneVar` |
| 33 | `setAnyVar` |
| 35 | `setAnyVar` |
| 42 | `setAnyVar` |
| 45 | `usedFireline`, `usedHelitack` |
| 25, 34, 47, 54 | none, fully run-scoped |

Note that some of these are *correctly* history-scoped: `uniqueWindValuesUsed.size > 1` on 24 asks whether the student tried more than one wind value, which cannot be answered from one run at all.

**Four decisions are already closed and are not open here.**

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
- **R4a.** `category.current` is computed from the readings on demand. This story adds no `run_record` / `run_history` structure and no incremental per-run update.
- **R5.** Derive each activity's `range_cc` from its own category expressions, per Sam's rules, rather than hardcoding a lookup table.
- **R5a.** Pin the derivation with a test asserting Sam's eleven hand-computed values (0 for 24; 1 for 23, 25, 32, 33, 34, 35, 42, 54; 2 for 45 and 47), so a future re-extract that moves a value fails visibly with the sheet's number on one side and Sam's on the other.
- **R6.** The feedback Hazbot shows on a click is selected by `category_used = current` when `current` is defined, falling back to `best` when it is not (R4). The coach-mark tour launched from that feedback keys off the same `category_used`, not off `best`. This is the whole of the near-term deliverable: the *first* feedback for any category.
- **R6a.** The no-demotion promise is kept in the *record*, not in the feedback: `best` is unchanged, keeps its ratchet, and is still carried as `matchedCategory` on every click (R9). What the student sees describes the window, which is the point of the story, so on the tabs where the two disagree the feedback follows `current` in both directions. See the Technical Notes on why following `current` upward cannot congratulate a student who has not earned it.
- **R7.** Bind the most recent qualifying run in `evaluateWith`, not the earliest. This is a **diagnostic** fix, not a classification one: `evaluateWith` returns `value: bound !== undefined`, so first-versus-last binding cannot change any category's truth. It changes what the sidebar reports as the matching run (`boundReadingIndex`, "Matched on reading #N", `propTruth` coloring), which is what a validation walk reads. Measured: flipping the binding leaves the full suite green at 743 tests across 68 suites.
- **R8.** The dev sidebar surfaces all three values, so a validation walk can read `best`, `current` and the selected `category_used` rather than inferring them. The `current` row also carries the window size and the number of canonical runs it actually covered, since those are the two inputs a walker cannot recover from anything else on screen. The values reach the sidebar through `useAnalysisEngine`'s `HookReturn` (`src/hazbot/engine/react/use-analysis-engine.ts:17`), and the highlighted `.hazbot-sidebar-category-matched` row follows `category_used`, not `best`. That is the row `CLAUDE.md` tells a validation walker to read as the engine's answer, so it has to be the selected value. This is additive substrate API and triggers R10b.
- **R8a.** State in the same place that everything else in the sidebar stays `best`-scoped: the per-category `▸ ✓ / ✗` truth icons, the Factor Variables panel and the highlighted matched row are all computed over the full readings array (`use-analysis-engine.ts:39,58,61`) and this story does not change that. Without the note the panels read as a derivation of the three numbers above them, and they are not. Measured on tab 23 with run 1 = correct zones plus one spark per zone and run 2 = all defaults: `best` 5, `current` 2, `category_used` 2, while the full-history truth is `{1: false, 2: false, 3: true, 4: false, 5: true}` and `setAnyZoneVar` reads `true`, so the walker sees `▸ ✗ 2` beside a `category_used` of 2 and a factor variable holding the opposite of the value `current` was computed from.
- **R8b.** Rendering a windowed truth tree and a windowed Factor Variables panel is deliberately **not** in scope. It needs a second `EvalCtx` threaded through the substrate sidebar, which is substrate work for a dev-only surface, on a story that otherwise leaves `EvalCtx` untouched (see Technical Notes). R8a's note is the cheaper fix for the same failure mode: a walker drawing a wrong conclusion from a panel that does not describe the number next to it.
- **R9.** `HazbotButtonClicked` gains `categoryUsed` and `categoryCurrent` (both `number | null`, carried explicitly like the existing field). **`matchedCategory` keeps meaning `best`**, so no existing field changes meaning and sessions logged before this change stay comparable with ones after it.
- **R9a.** **`LOGGED-EVENTS.md` must be updated**, and for five events rather than one: the two new fields on `HazbotButtonClicked` (line 78), plus a note on `HazbotShowMeClicked`, `HazbotTourCompleted` and `HazbotTourDismissed` that their `categoryId` is now the category the feedback was selected from (`category_used`), which may differ from `matchedCategory` **in either direction**. Lower is the common case and the point of the story. Higher occurs only on tab 45, only as `2 -> 3`, and never reaches a celebration category; the Technical Notes explain why. Say so explicitly, because an analyst told the value only ever goes down will read a higher `categoryId` as corrupt data rather than as documented behavior, which is the longitudinal break R9 exists to prevent. All three read the same `matched` variable the feedback is picked from (`hazbot-button.tsx:119`), so their meaning shifts under R6 whether or not anything is written down. The fifth is `AnalysisEngineActivated`, which gains `rangeCc` (R9b); document there that a null `categoryCurrent` means `range_cc` 0 when `rangeCc` is 0, and an unmatched window otherwise. Cross-reference `APP_RULES_VERSION` 6 (R10) as the boundary marker.
- **R9b.** Carry the derived `range_cc` on the `AnalysisEngineActivated` payload, next to `engineVersion`, `appRulesVersion` and `ruleSetId`. Without it `categoryCurrent: null` is uninterpretable: R4 gives it two different causes (the activity's `range_cc` is 0, and no category matched at the end of the window) and they log identically, while `HazbotButtonClicked` carries no `ruleSetId` of its own. The disambiguator cannot be recovered after the fact either, because R5 derives `range_cc` from the expressions rather than authoring it, so its value lives only inside a particular build and moves silently when Sam edits a cell (tab 34 moved 0 to 1 on the previous branch for exactly that reason). `APP_RULES_VERSION` marks that a boundary exists without saying what the value was on either side. This is the same break R9 exists to prevent, applied to the field this story adds rather than the one it preserves.
- **R10.** Bump `APP_RULES_VERSION` from 5 to 6, once for this branch. The 5 is WM-51's, inherited through the stack (`master` is at 4).
- **R10a.** Widen the bump policy in `docs/hazbot-update-workflow.md` §7 to cover changes in *evaluation* semantics, not only sheet edits. As written it lists only sheet-side causes, so a change like this one, which alters the category a given session resolves to without touching a cell, falls outside a policy that plainly should include it.
- **R10b.** Bump the substrate version in `src/hazbot/engine/version.ts` from `0.0.1` to `0.1.0`, per the "minor for additive API" policy in the WM-10 spec. The bump is **unconditional** on this branch rather than contingent on how the window reaches the engine: R8 puts `current` and `category_used` on `useAnalysisEngine`'s `HookReturn` and drives the substrate sidebar's matched-row highlight from the latter, which is additive substrate API whether or not the trim itself is written wildfire-side. The surface being versioned is named in the Technical Notes: a host-supplied readings-window selector reaching `computeView`, plus the two new `HookReturn` fields it feeds. `engineVersion` is carried in the `AnalysisEngineActivated` payload, so leaving it unchanged would show the same substrate version on both sides of an evaluator behavior change.
- **R11.** No change to the rule-set files, the sheet extraction, or the feedback text. This story changes how the existing expressions are evaluated, not what they say.
- **R12.** Re-run both oob sweep harnesses (`hazbot-coverage-sweep.test.ts` and `hazbot-patch-verification.test.ts`) after the classification change, with `VegetationSet`, `DroughtLevelSet` and `WindSet` added to their axis lists. Downward reclassification is expected and is the point of the story, so the usual "no already-covered state moves" bar does not apply.
- **R12a.** It is replaced by two bars that do apply. First, **`best` may not move at all**: this story does not touch it, so any change in the `best` column of the matrix is a regression. Second, **no upward move may land on its ruleset's highest category id**, so no student can be congratulated on a window they did not earn. Measured on the structured sweeps: tab 23 moves 29 of 81 two-run states, tab 45 moves 5 of 64, tab 47 moves none of 64. The tab-23 81 is nine shapes per run over two runs: three zone setups (default, the sheet's correct pair, changed-but-incorrect) crossed with three spark placements (none, one, one per zone). Tab 45 and 47's 64 is eight shapes per run over two runs: default-versus-changed zones crossed with fire line and helitack. Upward moves exist and are confined to one shape: `2 -> 3` on tab 45. The Technical Notes settle that for all eleven tabs from the parsed expressions rather than from the enumeration, so this bar is a structural property the test confirms against a future re-extract, not one it establishes.
- **R12b.** Commit both R12a bars as a test, rather than leaving them in the oob harnesses. The harnesses are deliberately uncommitted (Technical Notes, "Test harnesses"), so as written the story's strongest gate exists only while someone re-runs it by hand, and after R6 a silent revert to `min(best, current)` would be invisible to CI. The committed version enumerates each positive-`range_cc` tab over its own axes and asserts (a) `best` matches a pinned baseline and (b) no upward move lands on its ruleset's highest category id. It builds on the existing `matchAgainst` / `mkReading` helpers in `src/hazbot/rule-sets/test-helpers.ts`. The oob sweeps stay as the broad exploratory pass; this is the narrow always-on one.
- **R12c.** Build the per-tab readings from the constants already in each `<tab>.test.ts`, extracted to a shared fixture rather than authored fresh. This is the requirement that decides whether R12b is a gate or a decoration. A sweep whose fixture is subtly wrong pins a baseline that passes forever while covering a different activity than the one it names, and nothing about the run says so. Demonstrated while verifying this spec: a tab-23 builder whose "correct zone setup" did not actually satisfy `CorrectZoneSetup` reported 18 of 81 moved two-run states instead of 29, and `best` 3 where R8a's case is `best` 5, as a clean pass. Rebuilding from `23.test.ts`'s constants reproduced 29 of 81 and `best` 5 exactly. Those constants are also the ones a re-extract invalidates, so sharing them means a sheet change breaks the per-category tests and the sweep together instead of leaving the sweep quietly guarding nothing.
- **R12d.** Ten tabs have a positive `range_cc` (23, 25, 32, 33, 34, 35, 42, 45, 47, 54) and their axes differ, so name the axis set per tab rather than describing them all as "zone and tool" axes, which fits only 45, 47 and 54. Each tab's set is already expressed in its test file: 23 / 32 / 33 / 35 carry per-tab correct-setup zone shapes plus a spark-placement axis; 34 carries `VegetationSet` / `WindSet` / `DroughtLevelSet` shapes; 42 carries default-versus-changed only; 25 carries uniform-versus-non-uniform zones plus five spark placements including the `sparksTopBottom` / `sparksPerZoneMid` pair its `topoReading` builder supplies elevation for; 45, 47 and 54 carry default-versus-changed zones crossed with fire line and helitack. No tab needs a shape that has not already been exercised, but not every shape is a named constant: tab 42's changed wind is an inline literal at `42.test.ts:32` and tab 45's helitack flag is inline too, so R12c's extraction includes lifting those to names. Sizing follows from that per-tab work rather than from the three-tab harness the enumeration in R12a used.
- **R13.** Rebuild the reproduction probe from the WM-45 reproduction table (perfect run then weaker run on ruleset 23 must resolve to 4, not 5) and keep it as a committed regression test rather than a throwaway.
- **R13a.** Pin the `current > best` case in the same committed test, since it is the one place R6 chose window fidelity over the floor and nothing else would catch a silent revert to a `min`. The sequence: on tab 45, run 1 changed setup with a fire line, run 2 default setup with a helitack, run 3 default setup with no tools, giving `best` 2, `current` 3, `category_used` 3.
- **R14.** Regenerate the replay fixture and require a `sessionId`-only diff. The fixture pins `matchedCategoryHistory` for ruleset 25 computed from `best`, which this story does not change, so any other diff is a `best` regression rather than something to re-verify. Verified as the current baseline on this branch: regenerating today changes only `sessionId`.
- **R14a.** The generated validation playbooks are driven by sheet content this story does not touch and should be unchanged. What needs editing is `docs/hazbot-validation/localhost-urls.md`, in two places, both justified by a whole-history reading that only `best` still satisfies. Line 184's "full page navigation per probe" guidance rests on the monotone floor, which stays true of `best` and is false of `current`. Line 118 tells the walker that "the engine picks the highest-numbered ✓ as the matched feedback", which after this change is false for `current` and for `category_used`: the verified tab-23 case in R8a lands on a category whose icon is `✗`. Both sentences need to say which row they are talking about.
- **R14b.** Add the `current` and `category_used` series to the fixture alongside `matchedCategoryHistory`, so the value this story introduces is pinned by the same determinism check that pins `best`. Both sides change together: `scripts/generate-replay-fixture.js` writes the series (it builds `matchedCategoryHistory` at lines 75-78 and emits it at 137) and `replay-fixture.test.ts` asserts it (line 52 calls `computeMatchedCategoryForEngine`, line 65 compares). Changing only one produces a fixture mismatch that reads as a broken fixture rather than as a missing implementation. Without it `current` sits outside `replay-determinism.test.ts` entirely. Note the one-off consequence for R14's own bar: on the commit that introduces them the expected diff is `sessionId` plus the two new arrays, and `sessionId`-only from then on.

## Technical Notes

**Where the category is computed today.** `computeMatchedCategoryForEngine` (`evaluator.ts:318-328`) is the single entry point, called from `use-analysis-engine.ts:58` (sidebar) and twice in `hazbot-button.tsx` (`:119` for the feedback text, `:245` for the click log). A second value threads through the same three call sites.

**The window is a wildfire concept, not an engine concept, and R8 decides how it reaches the substrate.** The substrate is host-app-agnostic and its eslint boundary forbids importing outside `src/hazbot/engine/`; `canonicalRunReadings` lives in `src/hazbot/wildfire/`. So the trailing-window trim cannot be written into the engine as "the last N runs". Two routes were available in principle: a generic readings-window selector the host app supplies, or a wildfire-side transform applied before the readings reach the evaluator. **R8 rules the second one out.** `computeView` (`use-analysis-engine.ts:31-70`) derives every field of `HookReturn` from the engine instance alone, and `AnalysisEngineProviderProps` (`react/provider.tsx:6-10`) carries only `engine` and `appRulesVersion`, so a trim applied wildfire-side in `hazbot-button.tsx` can satisfy R6 but can never put `current` and `category_used` on the `HookReturn` where R8 requires them.

So the surface is the first route: a host-supplied readings-window selector reaching `computeView`, carried either on `EngineOpts` (alongside `defaults` and `runStartTriggers`, which are the existing precedents for host-supplied evaluation inputs) or on `AnalysisEngineProviderProps`. Choosing between those two is an implementation call and not settled here. Naming the surface is the point: that selector *is* the additive substrate API R10b bumps `0.0.1` to `0.1.0` for, and an implementer who starts from the wildfire-side transform because it is the smaller change will build it, find it cannot satisfy R8, and redo the plumbing.

**The `diagnostics` escape hatch was considered and rejected, and the comparison is closer than it first looks.** `Sidebar` already takes a host-supplied `diagnostics` prop, rendered from `app.tsx:137` via `buildPresetDiagnostics`, so wildfire could show `best` / `current` / `category_used` as three diagnostic lines with no substrate change at all. What that saves is not a semver digit: it is the additive substrate API surface R8 forces (see the paragraph below on where the window reaches the hook) plus the `0.1.0` bump that follows from it. What it costs is that the highlighted `.hazbot-sidebar-category-matched` row keeps showing `best`, and that row is where `CLAUDE.md` tells a validation walker to read the engine's answer.

The obvious answer to that cost is to edit the sentence, and it deserves saying that this story is already in that business: R14a rewrites two sentences of `localhost-urls.md` for the same reason, and R8a adds a note to the sidebar about which panels stay `best`-scoped. So the choice is a real trade rather than a forced move. It is decided for R8 on the ground that a correct value in the row people read beats a correction note beside a wrong one. Every validation walk on the last three stories has read that row, the workflow doc trains walkers to read it, and R8a exists precisely because notes are this spec's fallback where a correct value is unaffordable. Here it is affordable, so the note is not the right instrument.

**The window is a uniform slice of readings, measured rather than assumed.** Sam's design allows a mixed scope, where range-0 factor variables see the full history while the rest see the window, which would have required a per-variable readings selector on `EvalCtx` (today one `readings` array is shared by every leaf). It has no live instance: the only range-0 variables are `uniqueWindValuesUsed` and `uniqueNonZeroWindValuesUsed` on tab 24, whose `range_cc` is 0, plus `triedAllVegetations`, which the re-extract left unreferenced. So `category.current` is `highestTrueAt` over a trimmed readings array and `EvalCtx` is untouched. R3a guards the assumption.

**`current` is usually below `best`, and where it is above, following it is both safe and correct.** `best` dominates in most states because it is a floor over a superset of prefixes, but a trailing window can make a `NOT`-guarded lower category true that was false over the full history, so `current` is not bounded above by `best`. That case is real rather than theoretical: enumerating tab 45 exhaustively over zones (default/changed) x tools (plain/fire line/helitack/both), `current > best` in 35 of 512 three-run sequences, 308 of 4096 four-run, and 2121 of 32768 five-run. It is exclusive to tab 45, whose category 3 carries `NOT (usedFireline AND usedHelitack)`, the only `NOT`-guarded *history* factor variable on any of the eleven tabs; tabs 23 and 47 produce none at any depth checked.

An earlier draft of R6 took `min(best, current)` here, on the reasoning that no demotion should hold structurally rather than by argument. Measured, that choice reinstates the bug the story exists to fix. Take run 1 = changed setup with a fire line, run 2 = default setup with a helitack, run 3 = default setup with no tools: `best` 2, `current` 3, and `min` selects 2, whose feedback is "Looks like you changed the Setup. Let's run the model using the original settings!" with a `[Show me]` tour through Reload then Start. The student's last two runs both used the original settings; the coaching describes run 1, which is outside the window. Following `current` gives category 3, "Try using both the **firelines and helitacks!**", which is the accurate reading of the window.

**Following `current` upward cannot over-reward, by construction.** A category built only from positive conditions that is true over a suffix is also true over the full history, so the full-history prefix satisfies it too and `best` is at least as high. An upward move therefore requires a `NOT`-guard, and every upward move measured is `2 -> 3` on tab 45, at three-, four- and five-run depth alike. Both are coaching categories; tab 45's celebration (category 4, "Great job! You're ready to answer the questions below") is never reachable this way. R12a pins the general form of that property.

**Which tabs can move upward at all is a static property of the expressions, so it is settled for all eleven rather than measured on three.** An upward move needs an anti-monotone subterm: something that can be true over a trailing window and false over the full history. Two shapes qualify, and the second is easy to miss. The first is a **history factor variable under an odd number of `NOT`s**, since those accumulators only grow. The second is a **`WITH` occurrence under an odd number of `NOT`s**: `ranSimulation WITH P` also only gains witnesses as readings accumulate, so negating it is anti-monotone in exactly the same way. A `NOT` *inside* a `WITH`'s prop expression does not qualify, because sim-props evaluate per reading and the `WITH` around them stays monotone; that is why tabs 25, 34, 45 and 54 are unaffected by their `WITH NOT ...` clauses. Walking every category on all eleven tabs for both shapes:

| Tab | NOT-guarded history variable | Consequence |
|---|---|---|
| 25, 34, 42, 54 | none | `current > best` structurally impossible |
| 24 | categories 2-4 (history variables) | `range_cc` 0, so `current` is undefined and R4's fallback applies |
| 23, 32, 33, 35 | category 2 only (history variable) | can only lift `current` to 2, and `best` is at least 2 once any run exists, so no upward move |
| 47 | category 4 (a negated `WITH`) | category 5 is category 4 with the `NOT` removed, so whenever category 4 is true in a window and false over the history, category 5 is true over the history and `best` is 5. No upward move, by subsumption rather than by absence |
| 45 | category 3 (history variables), against a top category of 4 | the sole tab that can move upward, landing one below the celebration |

So R12a's second bar holds by construction on every tab, and tab 45 is the only tab that can move upward at all, which is the one the enumeration measured. Tab 47 is the row worth reading twice: it carries the anti-monotone shape and still cannot move upward, so its safety comes from the subsumption argument rather than from having no `NOT`. Checked empirically as well, since it is the case the static rule nearly missed: enumerating tab 47 at two-, three-, four- and five-run depth over the same eight-shape axis set (36,928 states) gives zero upward moves. The committed test in R12b therefore confirms the property against a future re-extract rather than establishing it: a sheet edit that moves a `NOT` onto a history variable in a high category is exactly what would break it, and is exactly the kind of change this repo has already seen once.

**The downward direction has a consequence worth accepting deliberately: on the two `range_cc = 2` tabs, a windowed category can deny a run the student actually made.** Both of those tabs carry a category whose text is a claim about the whole session rather than about a run, and a trailing window cannot express that claim. Tab 47 category 4's studentAction is "Ran with original settings and with at least one fireline or helitack, *but without first running with original settings with neither fireline nor helitack*", and its feedback asks "Did you try running the model **without firelines and helitacks** to see where the fire spread?", with a live `[Show me]` tour (`tourData["47"][4]`) through Restart then Start. Measured: runs of default/no mitigation, default/fireline, default/fireline give `best` 5 and `current` 4, so a student who has finished the comparison and earned category 5's "Great job on this investigation!" is asked whether they did the baseline run they opened with. That is 33 of the 512 three-run states. Tab 45 reaches the same place through `NOT (usedFireline AND usedHelitack)`: runs of fireline, helitack, plain, plain give `best` 4 and `current` 3, whose feedback is "Try using both the **firelines and helitacks!**" to a student who used both, in 511 of the 4096 four-run states. (The tab-45 sequence is the one already measured in the resolved "which of the remaining history-scoped factor variables" question, where it was read only as evidence that recomputing avoids a null `current`.)

This is accepted rather than fixed. It is the price of coaching on the window wherever a category's text encodes history, it is Sam's design behaving as he specified it (he set `range_cc = 2` on exactly these two tabs), and the alternatives are worse: reusing the history-scoped accumulators produces a null `current` on tab 45, and widening the window defeats the story. It is recorded because it is the mirror of the reported bug, close enough to be mistaken for a regression by anyone walking these two tabs, and because the remedy if Sam dislikes it is a per-category `range_cc` rather than anything in this story's code. Raised with him below.

**Where the derived `range_cc` reaches the log.** `buildAnalysisEngineActivatedPayload` (`src/hazbot/wildfire/engine-singleton.ts:121-134`) is wildfire-side, already takes the `ruleSetId`, and already returns a plain object assembled from `ENGINE_VERSION` and `APP_RULES_VERSION`, so R9b is one more field built from the derivation this story adds. It is the right home rather than the click event because `range_cc` is a per-activity constant for the page, and `AnalysisEngineActivated` is the once-per-page-load event that already carries the other two version handles an analyst needs.

**Sam's `range_cc` derivation reproduces his hand-computed table exactly, on all eleven tabs.** Verified by walking the parsed ASTs rather than by hand. The rules, restated precisely: `range_cc` is assigned **per occurrence**, not per variable, so an occurrence carrying a prop expression (`ranSimulation WITH ...`) scores 1 and a bare occurrence (`setAnyVar`, `uniqueWindValuesUsed.size > 1`, or even a bare `ranSimulation`) scores 0; `NOT` preserves its operand; `OR` takes the max; `AND` sums; the activity value is the plain numeric max across its categories. Tab 24 derives 0 for a coherent reason rather than by special case: it carries no `WITH` clause anywhere, so it has nothing run-anchored to window.

Note the distinction between the two parameters Sam defines, because they read alike. The *range* of a factor variable is how many successive runs it takes to compute (`ranSimulation` is range 1) and it decides whether the variable is recomputed over the window or reused from `best`. The *range_cc* of an occurrence is an input to the per-activity window size only. A bare `ranSimulation` scores `range_cc` 0 while still being a range-1 variable.

**R2a depends on WM-31, which has not shipped.** The paused-run case only has an effect if the Hazbot button is clickable while paused. That gate is WM-31's (still To Do); today the button has no `disabled` state at all, so R2a is live now and would be silently retired if WM-31 disabled the paused case. Trudi settled it on 2026-08-18: the WM-31 description reads "if model is stopped/paused, Hazbot is enabled and ready". Her summarizing sentence, "Hazbot can be clicked any time the model is not running (or paused)", parses both ways read cold, so the description is the authority, not the summary.

**A short window is safe, measured.** On a one-run session with `range_cc = 2`, evaluating over the single run that exists gives tab 45 category 3 for a default run with or without a fire line, and tab 47 category 3 without mitigation and 4 with. All four are the right coaching. The alternative reading is actively harmful: treating a short window as insufficient data would evaluate `ranSimulation` false, so `NOT ranSimulation` goes true and a student who has just run the model is told they have not run it (R2b).

**A student who has already reached the top category and then regresses now gets coaching, not the celebration.** With `category_used = current`, a student at `best` 5 and `current` 4 on tab 23 is shown category 4's feedback rather than category 5's "Great job! You're ready to answer the questions below". That is Trudi's example exactly, so it is the asked-for behavior rather than a side effect, and Sam's eventual answer for it (offer the student a choice) is deliberately out of scope here. Worth stating because it is the one place where "the score never goes down" and "the feedback describes the last run" visibly pull apart: `best` still holds the 5, but nothing student-facing shows it until the choice flow lands.

**A Reload leaves `current` describing the run that was just wiped.** Decision 3 keeps every run record, and `canonicalRunReadings` ignores `runWindowClosed`, so after an in-app Reload the newest canonical run is the discarded one and `current` describes it on a blank model. The Hazbot button has no `disabled` gate today (that is WM-31), so the click is reachable. Today's floor behaves the same way, so this is inherited rather than introduced; what changes is only which stale run gets described. Fixing it is not cheap: `translate.ts` maps `SimulationRestarted`, `SimulationReloaded` and `TopBarReloadButtonClicked` to one modifier that pushes no reading, so the readings stream cannot tell a Reload (sparks and terrain cleared) from a Restart (both kept), and only the first is a case where blanking `current` would be right.

**What the eventual choice-at-maximum flow needs, in Sam's words (2026-08-21).** Confirming the tabs 45/47 consequence above, he set out why a proper answer is not available yet: the feedback logic has to depend *"not just on `category.current` and `category.best` but also on the full feedback request/action history"*, specifically whether the student requested feedback on any given run and, if they did, *"what the user actually did (follow the coach marks completely or quit early)"*. On the tab-45 sequence in this spec (fire line, helitack, then two plain runs, giving `best` 4 and `current` 3), his ideal response depends on whether the student already received category 4's feedback: if they did, a gentle reminder of it beats category 3's coaching, and if they have never clicked at all the ideal is a choice, *"Are you just exploring or do you need help improving the last couple of runs? Or do you want feedback on your best performance so far?"*. He is explicit that the group has not settled this, which is why "just use `category.current`" is the decision for this round rather than the final answer.

**The data that flow needs is already being logged, so nothing here blocks it.** Sam accepted the deferred `run_record` on the condition that this story does not accidentally block the future extension. It does not, and the reason is stronger than "no blocks": both inputs he names are already in the LARA stream. *Whether feedback was requested, and for what*, comes from `HazbotButtonClicked` (gaining `categoryUsed` / `categoryCurrent` under R9, plus `rangeCc` on `AnalysisEngineActivated` under R9b), and WM-46 adds a display-site event carrying the feedback level and its source. *Whether the coach marks were followed or abandoned* is derivable today from `HazbotShowMeClicked { stepCount }` paired with `HazbotTourCompleted { lastStepIndex }` or `HazbotTourDismissed { lastStepIndex }`: those are exactly Sam's `coachmark_tutorial` `num_steps` and `steps_completed`. So the `run_record` he wants is a reshaping of data already recorded rather than new instrumentation, which is also why the `coachmark_tutorial` line in Out of Scope needs no build.

**Reload and browser reload differ.** The in-app Reload keeps every prior run record (decision 3 above). A *browser page* reload destroys the in-memory engine, so run history does not survive leaving and re-entering the page. Sam is on record (2026-08-18) that this is acceptable. WM-20 is the story that would make it durable, and it is out of the sprint.

**Reachability and contract fidelity are different properties** (durable lesson from WM-51). The coverage sweep and the per-category browser walk both test whether some state matches a category. Neither can see an implementation that has drifted from its sheet contract. `docs/hazbot-update-workflow.md` step 2 now carries a contract-drift check for this.

**Live caution carried from WM-51.** `CorrectZoneSetup` on tab 23 has an unresolved ambiguity: its Details cell allows zone 2's terrain to be "same as zone 1 or Foothills", so Plains + Foothills is legal, while a plain-language note in the same tab (rows 18-19) says "either both sides the plains or both sides hills". The current implementation and one of its tests follow the Details and allow the mixed case. This is queued for Sam and is not WM-45's to fix, but nothing here should be built on the assumption that the mixed case is settled.

**Test harnesses.** The two oob sweep harnesses under `hazbot-sweep/` are deliberately not committed. Both were load-bearing on WM-51: the reclassification matrix rejected a fix the coverage sweep had passed. Their axis lists need `VegetationSet`, `DroughtLevelSet` and `WindSet` added, or tab 34 degenerates and falsely reports categories unreachable.

## Out of Scope

- **The choice-at-maximum-category flow** ("your runs look great, but the last run has room for improvement, do you want help or shall we move on?"). Sam's design specifies it; the near-term ask is the first feedback only. He restated its requirements on 2026-08-21 and confirmed the group has not settled them; see the Technical Notes.
- **Level 2 and level 3 feedback**, the "same score, different hint on the second and third click" progression. That is WM-46, which stacks on this story.
- **The "comprehensive diagnosis and serious help" branch** and the four-clicks-total rule from Sam's feedback logic.
- **The `run_record` / `run_history` structure and incremental per-run computation.** Sam asked for it; it makes no observable difference to this deliverable and its consumers are WM-46 and WM-20. See the resolved question below.
- **`coachmark_tutorial` instrumentation** (`num_steps` / `steps_completed`) and the `user_choice` field of `hazbot_interaction`. `user_choice` has no consumer until the choice flow exists. `num_steps` / `steps_completed` need no instrumentation at all: they are already derivable from `HazbotShowMeClicked { stepCount }` and the `lastStepIndex` on `HazbotTourCompleted` / `HazbotTourDismissed`. See the Technical Notes.
- **Resetting `current` on Reload.** It needs `translate.ts` to distinguish Reload from Restart, which it currently does not. Belongs with **WM-47**, which renames that button to Clear All.
- **Persisting `run_history` across a browser page reload.** That is WM-20 / LARA-211 / AP-73, all out of the sprint.
- **Limiting how many times a student may click Hazbot.** Decided by Trudi on 2026-08-18: no limit. See WM-31.
- **Disabling Hazbot during a run.** WM-31.
- **Re-extracting or editing the rule-sets.** WM-51 did that; this story evaluates the same expressions differently.
- **Resolving the tab-23 `CorrectZoneSetup` ambiguity.** Queued for Sam.

## Questions for Sam and Trudi

**For Sam. `range_cc` is derived, not authored, and the manual-control half of your design is not implemented.** **ANSWERED 2026-08-21: no overrides wanted.** Sam's reply was a flat "No" to whether he wants a value the expressions do not imply. R5 and R5a stand unchanged, and the per-category column stays a deferral rather than a plan.

 The derivation reproduces all eleven of your values (verified against the parsed expressions), and a test pins them, so if a re-extract ever moves one the test fails with your number on one side and the sheet's on the other. The trade is that a value you want which the expressions do not imply now needs a developer. If that comes up, the fix is a per-category `range_cc` column in the sheet, which is a small extractor change (see the resolved question on the spreadsheet).

**For Sam. The incremental `run_record` is not being built.** **ANSWERED 2026-08-21: accepted, conditionally.** *"I am fine with it for now ... As long as what we are building now does not accidentally block these future extensions (and I don't see such blocks), it should be OK."* The condition is met, and by more than he assumed: see the Technical Notes on what the log stream already carries.

 You asked for the category to be updated as each run completes. This story recomputes on demand instead, which produces identical numbers, costs under a millisecond for a classroom-length session, and leaves the per-run trail where it already is, in the LARA log stream. The `run_record` structure is worth building when something consumes it, which is WM-46 or WM-20.

**For Sam. On tabs 45 and 47, a two-run window can deny a run the student made.** **ANSWERED 2026-08-21: accepted for this round.** *"It seems that there is little we can do for the time being"*, and *"we may be sticking with 'just use category.current' strategy for this round and then hash out a more complex scenario later."* He also described what the eventual answer needs; recorded in the Technical Notes and in Out of Scope.

 Both tabs carry a category whose wording is a claim about the whole session (47's category 4 is "without *first* running with original settings with neither fireline nor helitack"; 45's category 3 is `NOT (usedFireline AND usedHelitack)`), and a two-run window cannot see far enough back to evaluate it. So a student who finishes the investigation and then does one more run is coached to do the thing they already did, tour included. Measured on 33 of 512 three-run states on 47 and 511 of 4096 four-run states on 45. We are shipping it as designed, since it follows from your `range_cc` values and the alternatives are worse, but if you want it different the lever is a per-category `range_cc` (window those two categories wider than the rest of their tab) or feedback text that does not assert history.

**For Trudi. Two cases where Hazbot describes a model the student is not looking at.** First, a student who pauses mid-run and clicks Hazbot: we are describing the run they are watching rather than the last one they finished, which follows your original ask. Second, a student who clicks Reload and then Hazbot is told about the run they just wiped. That is today's behavior too, and changing it needs work in the event translation layer, so it is parked with WM-47 (Clear All) unless you want it sooner.

## Open Questions

### RESOLVED: Hardcode the eleven `range_cc` values, or build Sam's auto-derivation?
**Context**: This was read as the story's open cost driver, on the assumption that the derivation was substantial and that it disagreed with Sam's table on two tabs. Both assumptions were checked and neither held. Implemented as an AST walk over the already-extracted expressions, the derivation is about twenty lines, roughly the size of the lookup table it replaces, and it reproduces Sam's hand-computed values on all eleven tabs. The apparent conflict on tabs 24 and 42 was an error in the hand-computation: `range_cc` is assigned per *occurrence*, so a bare `ranSimulation` scores 0 rather than 1.

**Options considered**:
- A) Hardcode the eleven values in one table, with a comment pointing at Sam's doc.
- B) Derive, and pin Sam's eleven values in a test.
- C) Derive, plus explicit per-activity / per-category / per-variable override machinery as Sam's design allows.
- D) Hardcode now, and file the derivation as a follow-up story.

**Decision**: **B.** The deciding argument is WM-51's durable lesson about invisible contract drift. A hardcoded table is precisely the kind of constant that goes stale when Sam edits the sheet: tab 34 moved from 0 to 1 last week purely because its expressions changed, and nothing in the codebase would have noticed. Deriving from the expressions means the value re-derives itself at the next re-extract, and the pinning test (R5a) turns a future divergence into a failing test rather than a silent regression. C is machinery for a need that has not appeared, since every tab derives correctly today; if Sam ever wants a value the expressions do not imply, the override path is a small addition at the point it is needed. A and D buy nothing B does not, the derivation costing about what the table costs.

---

### RESOLVED: Should `range_cc` live in the base spreadsheet?
**Context**: Sam's design allows `range_cc` as an optional parameter at three levels: per activity page, per category, and per factor variable. None of those columns exist today, and the extractor's column map (`scripts/extract-impl.js:131-167`) has no entry for them. The extractor parses each tab as two row blocks, so a per-category or per-factor-variable column is cheap (one `findCol` entry, one optional field, one emitter line, with `arrowText` as the in-repo precedent), while a per-activity scalar has no home at all: the non-category rows that exist on each tab (id >= 100, `-- no pseudo code --`) are deliberately dropped at `extract-impl.js:85`.

**Options considered**:
- A) Keep it out of the sheet; the derivation reads expressions that are already extracted.
- B) Ask Sam to add a per-activity `range_cc` cell to each tab, and extend the extractor to read it.
- C) Full three-level support (activity, category, factor variable) as Sam's design describes.

**Decision**: **A.** With the value derived (R5), anything authored in the sheet could only be an override, and no tab needs one: all eleven derive to Sam's own numbers. B and C ship a column that is empty on every row, plus extractor and emitter handling, plus a blocking dependency on Sam editing eleven tabs before anything can be extracted. The usual argument for the sheet, that Sam should be able to retune without a developer, is already satisfied by a different route: `range_cc` follows from the expressions he authors, so changing an expression changes the window with it. A hand-entered cell would *introduce* drift risk rather than remove it, since it can disagree with the expressions in its own row.

**Trigger for revisiting**, so this is a deferral and not a rejection: the first time Sam wants a window the expressions do not imply, add a **per-category** `range_cc` column, which is the level that fits the extractor's existing row shape. WM-46 (Round 2/3 columns) and WM-50 (Relations) are both adding columns already, so there will be a natural moment to fold it in.

---

### RESOLVED: What does `category.current` mean for a paused, unfinished run?
**Context**: Hazbot is disabled during a run, which is what makes "the last run" unambiguous, but Trudi ruled on 2026-08-18 that Hazbot is *enabled while paused*. A paused-and-resumed run is one run, so a student can pause part-way through a run that has not finished and ask for analysis. Two facts from the code decide most of this. First, **no sim-prop reads run outcome**: every prop on all eleven tabs evaluates against the run-start snapshot plus in-run tool modifiers, and the `outcome` field on the `SimulationEnded` reading (`types.ts:26`) has no consumer, so a finished run tells the engine almost nothing a paused one does not. Second, **the paused run is already a canonical run**: `canonicalRunReadings` pushes a run at its `SimulationStarted` and uses terminals only to decide whether the *next* start is a resume. A probe confirms a paused newest run behaves identically to a completed one, giving `best` 5 / `current` 4 on the reproduction case either way.

**Options considered**:
- A) Evaluate the partial run as the newest run in the window.
- B) Fall back to the last *completed* run, so the window only ever contains finished runs.
- C) Evaluate the partial run only when it is the sole run, otherwise fall back.

**Decision**: **A.** It needs no new logic, and it is the only option that does not reintroduce the bug the story exists to fix: under B, a student who makes a perfect run, starts a weaker one, pauses, and clicks Hazbot is told about the perfect run they are no longer looking at, which is Trudi's original complaint verbatim. B also needs new machinery to detect run completeness and exclude the open run, so it costs more to deliver a worse answer; C is B's problem in a smaller case plus a second code path.

**Known wrinkle, which does not separate the options**: a fire line drawn while paused is not in the engine's reading until the student resumes, because it arrives on the resume's `SimulationStarted` payload and is merged by `foldResume`. So on tabs 45, 47 and 54 a student who pauses via the Fire Line button, draws the line, and clicks Hazbot before resuming is told they have not used mitigation. That is arguably accurate, since the line is not applied to the model yet, and B would report it the same way.

**Confirm rather than block**: this is nominally Trudi's call. The question for her is one line, "if a student pauses mid-run and asks Hazbot for analysis, should the feedback describe the run they are watching, or the last run they finished?", and A is both the cheaper build and the one matching what she already asked for.

---

### RESOLVED: Which of the remaining history-scoped factor variables should be recomputed over the window?
**Context**: The question turns on a distinction in Sam's doc that is easy to slide past: *range* and *range_cc* are different parameters. A factor variable's **range** is how many successive runs it takes to compute, and Sam says "for most factor variables ... the range is 1"; the only range-0 examples he names are `uniqueWindValuesUsed`, `uniqueNonZeroWindValuesUsed` and `triedAllVegetations`. `setAnyVar`, `setAnyZoneVar`, `usedFireline` and `usedHelitack` each need exactly one run to compute, so they are range 1. The `range_cc` 0 they score is a per-occurrence input to the window *size*, not a claim about their range.

Measured, walking every tab's references: every range-0 variable lives on tab 24, whose `range_cc` is 0, so no tab with a positive `range_cc` references one. Two policies were then probed against real sequences:

| Case | `best` | reuse from `best` | recompute over window |
|---|---|---|---|
| Tab 45 (`range_cc` 2), tools used in runs 1-2, plain default runs 3-4 | 4 | **null, nothing matches** | 3 |
| Tab 23 (`range_cc` 1), run 1 changed zones, run 2 pure defaults | 3 | 3, "your zone setups do not match the photos" | 2, "looks like you haven't changed the Setup yet" |

Tab 45 under reuse is a coverage hole: category 3's guard `NOT (usedFireline AND usedHelitack)` stays false on the reused history while category 4's two `WITH` clauses fail inside the window, so nothing matches. That is the failure shape WM-51 spent its branch closing.

**Options considered**:
- A) Recompute all of them; every referenced factor variable is range 1.
- B) Reuse the prop-less accumulators (`setAnyVar`, `setAnyZoneVar`, `usedFireline`, `usedHelitack`) from `best`, treating them as range 0.
- C) Decide per variable with Sam, treating all six as open.

**Decision**: **A.** It is the literal reading of Sam's range definition, it is the only policy of the two that never produces a null `current`, and it gives the more precise coaching on the tab-23 case. It also removes the mixed-scope machinery from the build: with nothing to reuse, `category.current` is `highestTrueAt` over a trimmed readings array and `EvalCtx` is untouched. R3a pins the property so a future re-extract that puts a range-0 variable on a windowed tab fails a test rather than misclassifying quietly.

---

### RESOLVED: Does this story build the `run_record` structure and compute incrementally, or compute `current` on demand?
**Context**: Sam asked on 2026-08-18 that the category be *"update[d] ... as soon as the relevant data are available"*, driven by a per-run `run_record`, rather than recomputed from the whole history on a click. Two measurements bear on it. **Cost is not the motive**: a full floor computation runs at 0.3 ms for a 5-run session and 10.7 ms at 100 runs (quadratic, but a classroom session is single-digit runs), and `use-analysis-engine.ts` already memoizes the whole view per engine snapshot in a `WeakMap`; adding `current` costs one evaluation over a one-or-two-run slice. **The durable record already exists and is not in memory**: `log()` (`src/log.ts:16`) sends every event to LARA before routing it to the engine, and `HazbotButtonClicked { matchedCategory }` is already in that stream, so the researcher-facing half of Sam's `hazbot_interaction` is delivered by logging rather than by a `run_history` array. A `run_history` held in memory dies on page reload, which Sam has accepted, and WM-20 (which would make it durable) is out of the sprint.

**Options considered**:
- A) Compute `current` on demand from the existing readings. No new data structure, no lifecycle.
- B) Build `run_history` / `run_record` now, updated incrementally as runs progress.
- C) Compute on demand, but land the `run_record` type and populate it per run with no consumer, so WM-46 inherits the shape.

**Decision**: **A.** For this deliverable the two are observationally identical, because the engine is already a pure function of an append-only readings array, so a click-time recompute yields exactly what an incremental update would have accumulated. B buys a lifecycle to get wrong (update at start, on relevant events, at end, finalize on next run or page end, all of it re-derivable) for a benefit no consumer needs, and its one real benefit, persistence, belongs to WM-20. C would land a guessed shape populated with the two fields that were already derivable: the fields WM-46 actually needs are the interaction ones (`category_used`, whether this category has been seen before, coachmark completion), and the click-counting state behind them does not exist today, since `AnalysisEngineActivated` is a no-op that fires once per page load. WM-46 should define the record against its own requirements.

**Re-checked on 2026-08-21, when WM-46 moved from "later" to "being specced today".** The deferral stands, and the shorter horizon strengthens it rather than weakening it. Three facts decide it. First, WM-46's actual ask, per Trudi's comment on the ticket, is "if Hazbot is clicked and the student has the SAME SCORE, give a different bit of feedback on the second and third time they click": that is a per-category *click* counter, which is the `hazbot_interaction` half of Sam's shape, not the `run_record` half. The run half is the part WM-46 has no use for and the part already derivable from the readings log. Second, the half WM-46 does need cannot be derived at all, so WM-46 must introduce new state whatever WM-45 lands: `HazbotButtonClicked` and the three tour events fall through to `default: return { kind: "no-op" }` (`translate.ts:67-68`), so clicks push no reading, and that no-op is load-bearing rather than incidental (`hazbot-button.tsx:240-243`: `log()` routes every event through `engine.consume()`, so a click that produced a reading would mutate the category it just reported). `AnalysisEngineActivated` is a no-op too and is emitted straight through `externalLog` without passing through consume, so there is no per-session click state to extend. Third, the original reason to defer was that WM-46 should define the record against its own requirements, and that now happens in hours; landing a guessed shape today and reshaping it tomorrow is churn with no window of benefit. WM-46 stacks on this story, so it adds what it needs on top with no rework here, and this story already hands it the inputs it consumes: R6's `category_used` is the "score" it compares for sameness, and R9 carries `categoryUsed` on the click payload.

**One decision to carry into WM-46's spec rather than let it stumble into**: whether click state lives outside the engine or clicks become readings. The second is tempting, since it would make click counts derivable the way `current` is, but it breaks the invariant this story is built on, that the engine is a pure function of a click-free append-only readings array, and it is exactly the hazard the WM-6 no-op was written to prevent. If WM-46 wants to change that contract it should be a deliberate, reviewed change with `computeMatchedCategoryFloor` in scope, not a side effect of adding a counter.

**Recorded as a deviation from Sam's stated preference**, since he asked for incremental updating. The reason to decline for now is that it is an internal implementation choice with no observable difference in this story's output, and the readings log already carries the per-run trail his `run_record` was designed to hold. If he wants the structure itself as a deliverable, that is a conversation, and it belongs with WM-46 or WM-20.

---

### RESOLVED: How does `category.current` collapse a window of more than one run?
**Context**: For `range_cc = 1` the window holds one run and the question does not arise, but 45 and 47 sit at 2, and their top categories are two `ranSimulation WITH ...` clauses ANDed together, which only evaluate true at the *end* of a two-run window. Measured by enumerating all 64 two-run sequences on each of those tabs (each run varying default-versus-changed setup, fire line, helitack):

| Tab | end-of-window nulls | end != floor |
|---|---|---|
| 45 | 0 | 5, floor higher in all 5 |
| 47 | 0 | 0 |

The null case never arises: each tab's low categories partition the "ran something" space. And every disagreement is the reported bug in miniature, of the form run 1 = a good default run with a tool, run 2 = a changed-setup run, where the floor reports category 3 (about run 1) and the end-of-window evaluation reports category 2 (about run 2).

**Options considered**:
- A) Evaluate once at the end of the window; if nothing matches, `current` is undefined and falls back to `best` per R4.
- B) Evaluate once at the end of the window; if nothing matches, treat it as null distinctly from undefined.
- C) Apply the floor within the window.

**Decision**: **A.** C re-introduces the ratchet at two-run scale, and the five sequences where it differs all report the earlier run, which is what the story exists to stop; it is the only policy that could reproduce the original complaint on 45 and 47 after this ships. A and B are the same behavior, and A is the simpler statement, reusing the fallback path R4 already defines rather than inventing a second one. Since the fallback is unreachable on the evidence, its value is defensive: an unmatched window degrades to today's behavior rather than to no feedback.

**Scope of the evidence**, so it is not overclaimed: the enumeration is exhaustive over that axis set for the two `range_cc = 2` tabs only. The equivalent check for single-run windows across all eleven tabs is the coverage sweep in R12.

---

### RESOLVED: What should WM-45 be repointed to?
**Decision**: **Not revisited here.** The estimate is out of this spec's scope. What is worth carrying into the conversation with Sam is that the *content* of the story changed rather than its size: the deliverable is his `range_cc` design with the derivation built rather than the table hardcoded, minus the incremental `run_record`, and with no sheet, extractor or mixed-scope-context work in it.

## Self-Review

### Senior Engineer (second pass)

#### RESOLVED: R2a depends on a WM-31 behavior that has not shipped
R2a only has an effect if Hazbot is clickable while paused, which is WM-31's gate and still To Do. Trudi's ruling is settled in the WM-31 description; her summarizing sentence parses both ways read cold. **Resolution**: recorded as a dependency in Technical Notes, with the description named as the authority.

---

#### RESOLVED: The spec bumps the rules version but not the substrate version
The substrate carries its own semver (`src/hazbot/engine/version.ts`, `0.0.1`) with a "minor for additive API" policy (WM-10 spec), and `engineVersion` rides in the `AnalysisEngineActivated` payload. The Technical Notes contemplate reaching the engine through a new optional `EngineOpts` field, which is additive API. **Resolution**: added **R10b**, conditional on which route the implementation takes.

---

### Senior Engineer

#### RESOLVED: The behavior when a session has fewer runs than `range_cc` is undefined
**Resolution**: added **R2b** (evaluate over the runs that exist) plus a Technical Notes paragraph recording the four measured values.

R2 says `current` is computed over "the last `range_cc` canonical runs" and never says what happens when the session holds fewer runs than that. It matters on 45 and 47, which need two. Sam's doc has a rule that looks relevant but is not: his "if R > 0 and N < R, the factor variable must evaluate false" governs a *factor variable's* range, and no referenced variable has a range above 1, so it does not reach the activity window. Measured on a one-run session with `range_cc = 2`: tab 45 gives 3 for a default run with or without a fire line, tab 47 gives 3 without mitigation and 4 with, all of which are the right coaching. So the sensible reading works; it just needs stating, because the alternative reading (treat a short window as insufficient data and evaluate false) would drop a student who has just run the model to category 1, "you have not run the simulation yet".

---

#### RESOLVED: R10 does not say which version numbers, on a branch where the predecessor already bumped
**Resolution**: **R10** now names 5 to 6, and a new **R10a** widens the workflow doc's bump policy, which is written entirely in terms of sheet edits and so does not literally cover an evaluation-semantics change.

R10 says "bump `APP_RULES_VERSION` once for whatever this branch ships". This branch is stacked on WM-51, which already moved the value from 4 to 5 for its own re-extract. Without naming the numbers, a reviewer cannot tell whether 5 was this story's bump or the parent's, and the version is precisely the handle that lets a dataset consumer correlate a session with the rules that classified it.

---

### QA Engineer

#### RESOLVED: R12 discards the only gate the harnesses provide, when a real gate is available
**Resolution**: **R12** now scopes the retired bar to downward moves, and **R12a** adds the invariant that replaces it, with the measured blast radius.

R12 says reclassification is expected, so the patch-verification matrix is "read as a report rather than a pass/fail gate". That is true of its usual bar (no already-covered state may move) but it leaves the story with no automated check on the blast radius, on the branch that changes the matched category for every multi-run session. There is a stronger invariant available for free: since `category_used = min(best, current)` and `best` is unchanged, **no state can be reclassified upward**. Any upward move is a defect by construction. That turns the matrix back into a gate with a precise failure condition, and it also catches the subtle mistake of computing `current` over the wrong window, which can only show up as an unexpectedly high value.

**Superseded by the third-pass review**: R6 no longer takes a `min`, so upward moves are legal in one measured shape and the no-upward-move invariant is not available. R12a now carries the two bars that survive: `best` may not move at all, and no upward move may land on its ruleset's highest category id.

---

#### RESOLVED: R14's treatment of the replay fixture is too weak to catch the thing it should catch
**Resolution**: **R14** becomes an assertion (regenerate, expect a `sessionId`-only diff; verified as the current baseline on this branch), and **R14a** redirects the playbook half of the requirement at `localhost-urls.md`, whose walk guidance is justified by the floor.

R14 asks to "re-verify the validation playbooks and the replay fixture". The fixture is more useful than that: `expected.json` pins `matchedCategoryHistory` for ruleset 25, computed through `computeMatchedCategoryForEngine`, which is `best`. This story must not change `best`, so the regenerated fixture must come back identical apart from `sessionId`. A diff is not something to re-verify, it is proof that `best` regressed. The playbooks are a different case: they are generated from sheet content this story does not touch, so what needs review is the walk instructions that assume a monotone floor, not the generated files.

---

### Product Manager

#### RESOLVED: The Overview and the Project Owner Overview overstate the change in two directions
**Resolution**: the Overview now says the feedback is selected from the lower of the two values rather than "instead of" the best, and the Project Owner Overview states the regression consequence directly instead of leaving it to the Technical Notes.

The Overview says the feedback reflects `current` "instead of the all-time best", while R6 actually selects `min(best, current)`. The difference is invisible today but real, and the summary is what a PM reads. **Partly superseded by the third-pass review**: R6 now selects `current` outright, so the Overview's original phrasing was closer to the shipped behavior than the `min` it was corrected to; the Overview has been rewritten again to match. Separately, the Project Owner Overview promises "nothing takes an achievement away from a student" while the Technical Notes now record that a student who peaks and then regresses is shown coaching rather than the celebration. Both statements are defensible (`best` does keep the achievement; nothing student-facing shows it), but a reader who only reads the top of the document will be surprised by the behavior, and this is the single most likely thing for Trudi to ask about after it ships.

---

### Student

#### RESOLVED: After an in-app Reload, Hazbot describes a run the student can no longer see
**Resolution**: real, inherited from today's floor, and deliberately left. Recorded in Technical Notes and pointed at WM-47 in Out of Scope. The blocker is that `translate.ts` maps Reload and Restart to the same reading-less modifier, so the stream cannot distinguish them; only Reload is a case where blanking `current` would be right. Worth raising with Trudi alongside the paused-run question, since both ask what Hazbot should say when the model is not in the state it analyzed.

Decision 3 keeps every run record, including those Reload wipes from the model, and `canonicalRunReadings` ignores `runWindowClosed` entirely, so the newest canonical run after a Reload is the run that was just discarded. The Hazbot button carries no `disabled` gate today (that is WM-31), so a student can Reload, land on a blank model at Terrain Setup, click Hazbot, and be told about a run that is no longer on screen. Today's behavior has the same shape, since the floor also survives Reload, but this story is specifically about making the feedback describe what the student is looking at, so the case is worth an explicit decision rather than inheriting one.

---

### Education Researcher

#### RESOLVED: R9 must add fields rather than repurpose `matchedCategory`
**Resolution**: **R9** adds `categoryUsed` and `categoryCurrent` and pins `matchedCategory` to `best`. **R9a** requires the `LOGGED-EVENTS.md` update and widens it to the three tour events, whose `categoryId` also shifts to `category_used` under R6: `HazbotShowMeClicked`, `HazbotTourCompleted` and `HazbotTourDismissed` all read the same `matched` variable the feedback is picked from, so four events change semantics on this branch, not one.

R9 says the click payload "records the category actually used for the feedback alongside the existing value". The existing field's semantics are pinned in the WM-6 spec, including that it is typed `number | null` and carries `null` explicitly so the analytics schema is uniform. If `matchedCategory` silently starts meaning `category_used`, every session logged before and after this change looks like one series with a discontinuity in the middle, and the only way to tell them apart is `APP_RULES_VERSION`, which requires the analyst to know to look. Naming the fields in the requirement, and stating that `matchedCategory` keeps meaning `best`, costs nothing now and prevents a silent break in longitudinal comparisons.

---

### Education Material Developer

#### RESOLVED: Sam should be told the derivation exists, since it changes where his control lives
**Resolution**: added a **Questions for Sam and Trudi** section collecting the three items this spec owes a person: the derived-not-authored `range_cc` and its escape hatch, the deferred incremental `run_record`, and the two cases where Hazbot describes a model the student is not looking at.

Deriving `range_cc` is the right call for drift, but Sam's design deliberately offers "complete manual control" through optional parameters at three levels, and this spec implements none of them. The consequence is that his eleven hand-computed values become an assertion about the code rather than an input to it, and if he wants a twelfth value that the expressions do not imply he needs a developer. That is a reasonable trade at this size, but it is his design being partially implemented, so it should be said to him rather than discovered. The spec should record what he does if he disagrees with a derived value.

---

### Senior Engineer (third pass)

#### RESOLVED: `min(best, current)` reinstates the story's own bug in the states where `current` exceeds `best`
**Resolution**: **R6** now selects `current` outright, falling back to `best` only where `current` is undefined, and **R6a** relocates the no-demotion promise to the record (`best` unchanged, still logged as `matchedCategory`). **R12a**'s no-upward-move invariant could not survive that and is replaced by two bars that do: `best` may not move at all, and no upward move may land on its ruleset's highest category id. **R13a** pins the three-run tab-45 sequence. The deciding measurement is that following `current` upward cannot over-reward: a positive category true on a suffix is true on the full history, so an upward move requires a `NOT`-guard, and every upward move measured (tab 45, depths 3/4/5) is `2 -> 3`, coaching to coaching, never the celebration.

Technical Notes say `min` is "safe but not free" and that "in practice `best` dominates", noting only that a trailing window *can* make a `NOT`-guarded lower category true. Measured, that case is not hypothetical and its consequence was never examined: enumerating all 512 three-run sequences on tab 45 (zones default/changed x tools plain/fireline/helitack/both), `current > best` in **35 of 512**. It is exclusive to tab 45, whose category 3 carries `NOT (usedFireline AND usedHelitack)`, the only `NOT`-guarded *history* factor variable on any of the eleven tabs. Tabs 23 and 47 give zero at both two-run and three-run depth.

Concrete sequence: run 1 changed setup with a fire line, run 2 default setup with a helitack, run 3 default setup with no tools. `best` = 2, `current` = 3, so `category_used` = 2. Category 2's feedback is "Looks like you changed the Setup. Let's run the model using the original settings!" with a `[Show me]` tour walking the student through Reload then Start. The student's last two runs both used the original settings. They are coached on run 1, which is outside the window, which is the complaint the story exists to fix, arriving through the requirement written to prevent demotion.

The two-run enumeration in the resolved "how does `current` collapse a window" question could not see this: `current > best` needs a run that has fallen out of the window, so it needs at least three runs.

**Suggested resolution**: decide explicitly rather than inheriting it from `min`. Either (a) keep `min` and record this as accepted, on the ground that no-demotion outranks window fidelity, or (b) select `current` when it is defined and fall back to `best` only when it is not, with `best` still logged and still un-demoted in the payload. Whichever is chosen, the sequence above belongs in R13's committed probe so the behavior is pinned rather than incidental.

---

### QA Engineer (second pass)

#### RESOLVED: R8 surfaces three numbers into a sidebar whose other panels all still describe `best`
**Resolution**: **R8** now requires the `current` row to carry its window size and covered-run count; **R8a** requires the sidebar to state that the truth icons, Factor Variables panel and matched-row highlight stay `best`-scoped, with the measured tab-23 case recorded; **R8b** records that rendering a windowed truth tree is deliberately out of scope and why. **R14a** now covers `localhost-urls.md:118` as well as :184.

R8 says the sidebar surfaces `best`, `current` and `category_used` "so a validation walk can read" them. Measured, that is not enough to walk `current`, because every other panel in the sidebar is computed over the full history: `perCategoryTruth` and `factorVariableValues` are both built from `engine.readings` (`use-analysis-engine.ts:39,61`), and the `.hazbot-sidebar-category-matched` highlight is driven by `matchedCategory`, which is `computeMatchedCategoryForEngine` = `best` (`use-analysis-engine.ts:58`, `sidebar.tsx:85,156`).

Verified on tab 23 with run 1 = correct zones plus one spark per zone and run 2 = all defaults: `best` 5, `current` 2, `category_used` 2, while the full-history per-category truth is `{1: false, 2: false, 3: true, 4: false, 5: true}` and `setAnyZoneVar` reads `true`. So the walker sees `▸ ✗ 2` next to a `category_used` of 2, and a Factor Variables panel whose `setAnyZoneVar` is the opposite of the value `current` was computed from. `docs/hazbot-validation/localhost-urls.md:118` instructs the walker that "the engine picks the highest-numbered ✓ as the matched feedback", which is now false for two of the three numbers.

**Suggested resolution**: extend R8 to say what a `current` row has to carry to be walkable (at minimum the window size and the run count it covered), and extend R14a's `localhost-urls.md` edit to line 118 as well as line 184, since both sentences are justified by a whole-history reading that only `best` still satisfies.

---

#### RESOLVED: the invariant R12a calls a gate has no committed home, and `current` has no determinism coverage
**Resolution**: **R12b** commits the two R12a bars as a narrow always-on test over the positive-`range_cc` tabs, built on the existing rule-set helpers rather than the uncommitted oob harnesses. **R14b** adds the `current` and `category_used` series to the replay fixture so `current` is covered by the same determinism check as `best`, and records the one-off diff that introducing them causes to R14's own bar.

R12a describes "no state may be reclassified upward" as turning the matrix "back into a gate with a precise failure condition", and its stated purpose is catching a dropped `min` or a window computed too wide. Both harnesses it runs in are deliberately uncommitted (Technical Notes, "Test harnesses"), so the gate exists only for as long as someone re-runs them by hand. Nothing in CI would catch a later refactor dropping the `min`. The invariant is cheap to commit: the three-tab enumeration used to verify this review is about twenty lines on top of the existing `matchAgainst` / `mkReading` helpers in `src/hazbot/rule-sets/test-helpers.ts`.

Separately, R14 pins `matchedCategoryHistory` in the replay fixture, which is `best` (`replay-fixture.test.ts:52` calls `computeMatchedCategoryForEngine`). Confirmed: regenerating today yields a `sessionId`-only diff. That is a good regression bar for `best` and no coverage at all for `current`, the value this story adds.

**Suggested resolution**: promote the upward-move invariant to a committed test over the tabs whose `range_cc` is positive, and add a `currentCategoryHistory` (or the `category_used` series) alongside `matchedCategoryHistory` in the replay fixture so `current` is pinned by the same determinism check.

---

### Senior Engineer (third pass, continued)

#### RESOLVED: R10b names one API route to the substrate, and R8 forces a different one
**Resolution**: **R8** now names its route explicitly (the `useAnalysisEngine` `HookReturn`, with the matched-row highlight following `category_used`), and **R10b** drops the `EngineOpts`-only condition and makes the `0.0.1` to `0.1.0` bump unconditional on this branch. The `diagnostics` alternative, which would have avoided the bump entirely, is recorded in Technical Notes as considered and rejected, with the reason: it leaves `best` in the row the validation workflow is documented against.

R10b makes the substrate bump conditional on the window reaching the engine "through a new `EngineOpts` field", and says that if the trim is implemented entirely wildfire-side "no bump is due". But R8's sidebar is substrate code (`src/hazbot/engine/sidebar/sidebar.tsx`), and the matched-row highlight reads `matchedCategory` off the `HookReturn` of `useAnalysisEngine` (`src/hazbot/engine/react/use-analysis-engine.ts:17`), which is substrate API. So R8 pushes toward an additive substrate change no matter where the trim itself lives, and R10b's "no bump due" branch may be unreachable.

There is one escape hatch and it is worth naming rather than discovering: `Sidebar` already takes a host-supplied `diagnostics` prop, passed from `app.tsx:137`, so wildfire could render three diagnostic lines with no substrate change at all. That satisfies R8's letter while leaving the highlighted matched row showing `best`, which is the row CLAUDE.md tells a validation walker to read.

**Suggested resolution**: state which of the two routes R8 takes, and rewrite R10b's condition in terms of "any additive substrate API change, including the sidebar/hook surface" rather than `EngineOpts` alone.

---

### Senior Engineer (third pass, housekeeping)

#### RESOLVED: one citation is off by seven lines
**Resolution**: corrected to `extract-impl.js:85`. Every other file/line citation in the spec was re-checked against the branch at that point and was accurate. That sweep predates the third- and fourth-pass edits; the fifth pass re-checked the whole set and found one stale range (`evaluator.ts:318-331`, now 318-328), so a re-check is scoped to the pass that ran it rather than standing open-endedly.

The resolved "should `range_cc` live in the base spreadsheet" question says the non-category rows "are deliberately dropped at `extract-impl.js:85`". Line 78 is the warning that fires when a row's id and its `-- no pseudo code --` marker disagree; the drop is `if (id >= 100) continue;` at line 85. Every other file/line citation in the spec as it stood at this pass was checked and is accurate.

**Suggested resolution**: change 78 to 85.

---

### Senior Engineer (fourth pass, re-review of the third-pass changes)

#### RESOLVED: R9a still describes the direction of the shift as one-way
**Resolution**: **R9a** now states the shift is two-way, names tab 45 `2 -> 3` as the only upward case, and points at the Technical Notes for why it cannot reach a celebration category.

R9a tells `LOGGED-EVENTS.md` to note that the three tour events' `categoryId` "is now the category the feedback was selected from (`category_used`), which may be lower than `matchedCategory`". That was exact under the `min` R6 it was written against. Under the R6 this review installed, `category_used = current`, which can also be *higher* than `matchedCategory` (= `best`): measured, tab 45 `2 -> 3` at three-, four- and five-run depth. An analyst told the value only ever goes down will read a higher `categoryId` than `matchedCategory` as corrupt data rather than as the documented behavior, and this is precisely the longitudinal-comparison break R9 exists to prevent.

**Suggested resolution**: R9a says the shift is two-way, names tab 45 as the only tab where the upward direction occurs, and points at the Technical Notes paragraph that explains why it cannot reach a celebration category.

---

#### RESOLVED: R14b names the test that reads the fixture but not the script that writes it
**Resolution**: **R14b** now names `scripts/generate-replay-fixture.js` alongside `replay-fixture.test.ts`, with the line anchors for both.

R14b requires the `current` and `category_used` series in the replay fixture and cites `replay-fixture.test.ts:52`, which is the consumer. The producer is `scripts/generate-replay-fixture.js`, which builds `matchedCategoryHistory` at lines 75-78 and emits it at line 137. Both sides have to change together or the regenerated fixture will not carry the fields the test asserts, and the failure surfaces as a confusing fixture mismatch rather than as a missing implementation.

**Suggested resolution**: name both files in R14b.

---

#### RESOLVED: the upward-move claim is measured on three tabs when it can be established on all eleven
**Resolution**: the all-tab table is folded into the Technical Notes and **R12a**'s second bar is restated as a structural property that R12b's test confirms against a future re-extract rather than establishes.

R12a and the Technical Notes say upward moves are confined to `2 -> 3` on tab 45 "at every session length checked", scoped honestly to the three tabs enumerated. The claim can be made structurally instead, which is stronger and costs nothing, because `current > best` requires a history factor variable under an odd number of `NOT`s and that is a static property of the parsed expressions. Walking every category on all eleven tabs for it gives:

| Tab | NOT-guarded history variable | Consequence |
|---|---|---|
| 25, 34, 42, 47, 54 | none | `current > best` structurally impossible |
| 24 | cats 2-4 | `range_cc` 0, so `current` is undefined and R4's fallback applies |
| 23, 32, 33, 35 | category 2 only | can only lift `current` to 2, and `best` is at least 2 once any run exists, so no upward move |
| 45 | category 3, with top = 4 | the sole case, and it lands one below the celebration |

So R12a's second bar ("no upward move may land on its ruleset's highest category id") holds by construction on every tab rather than by observation on three, and the only tab that can move upward at all is the one measured.

**Amended by the fifth-pass review**: the screening rule stated here is too narrow. A `WITH` occurrence under an odd number of `NOT`s is anti-monotone for the same reason a history factor variable is, and tab 47 category 4 is one, so 47 does not belong in the "none" row. The conclusion survives on a different argument (category 5 subsumes category 4), and the Technical Notes table now carries both shapes and gives 47 its own row.

**Suggested resolution**: fold the table into the Technical Notes and restate R12a's bar as a structural property the committed test confirms rather than establishes.

---

### Teacher (fifth pass)

#### RESOLVED: windowing inverts the categories whose text is a claim about the whole session, and both `range_cc = 2` tabs have one
**Resolution**: recorded as an accepted consequence in the Technical Notes, with both sequences and their counts, next to the upward-direction analysis it mirrors. Added to **Questions for Sam and Trudi**, naming the per-category `range_cc` escape hatch. No requirement changed: this follows from Sam's own `range_cc` values and the alternatives are worse.

Two categories on the two windowed-comparison tabs are written as assertions about the student's *history*, not about a run. Evaluating them over a trailing window makes the engine assert something the student's own session contradicts, and then launch a coach-mark tour for it.

Tab 47 category 4's studentAction is explicit: *"Ran with original settings and with at least one fireline or helitack, **but without first running with original settings with neither fireline nor helitack**"*. Its feedback is "Did you try running the model **without firelines and helitacks** to see where the fire spread?", and `tourData["47"][4]` exists, so `[Show me]` walks the student through Restart then Start. Measured on the enumeration: runs = default/no mitigation, default/fireline, default/fireline gives `best` 5 and `current` 4, so a student who has already completed the comparison and earned category 5's "Great job on this investigation!" is asked whether they tried the baseline run they did first. 33 of the 512 three-run tab-47 states land on `best` 5 -> `current` 4.

Tab 45 category 3 has the same shape through `NOT (usedFireline AND usedHelitack)`: runs = fireline, helitack, plain, plain gives `best` 4 and `current` 3, whose feedback is "Try using both the **firelines and helitacks!**" to a student who used both. 511 of the 4096 four-run states land there. The spec has already measured this exact sequence, in the resolved "which of the remaining history-scoped factor variables" question, but read it only as evidence that recomputing avoids a null `current`; the coaching it produces was not examined.

Why it matters: this is the mirror of the bug the story exists to fix. The reported bug is "the feedback describes a run outside what I am looking at"; this is "the feedback denies a run I actually did". The Technical Notes analyze `NOT`-guarded categories only in the upward direction (`current > best`, and why following it up cannot over-reward). The downward direction is the common one and it is where the contradictory coaching lives, and no requirement, note or out-of-scope item names it.

**Suggested resolution**: state it. This is Sam's design behaving as designed (he set `range_cc = 2` on exactly these two tabs), so the decision is probably to accept it, but it should be an accepted consequence with the two sequences recorded, not an undiscovered one. It also belongs in the "Questions for Sam and Trudi" section, since the fix if they dislike it is a per-category `range_cc` (the escape hatch the spreadsheet question already parks) or feedback text that does not assert history.

---

### Senior Engineer (fifth pass)

#### RESOLVED: R8 forecloses one of the two routes the Technical Notes still present as open, and the substrate API that R10b bumps for is never named
**Resolution**: the Technical Notes paragraph now states that R8 rules out the wildfire-side transform, with the two code facts that force it, and names the surviving surface (a host-supplied readings-window selector reaching `computeView`, on `EngineOpts` or `AnalysisEngineProviderProps`, with the choice between those two left to implementation). **R10b** now points at that named surface instead of the bare phrase "additive substrate API".

Technical Notes say the trim "has to be either a generic hook the host app supplies (a readings-window selector) or a wildfire-side transform applied before the readings reach the evaluator". Measured against the code, R8 rules the second one out. `computeView` (`use-analysis-engine.ts:31-70`) derives every field of `HookReturn` from the engine instance alone, and `AnalysisEngineProviderProps` (`react/provider.tsx:6-10`) carries only `engine` and `appRulesVersion`. A trim applied wildfire-side, in `hazbot-button.tsx`, satisfies R6 but can never reach `HookReturn`, which is where R8 requires the three values to appear. So R8 forces the host-supplied-selector route, on `EngineOpts` or on the provider props.

That is the additive substrate API R10b bumps `0.0.1` to `0.1.0` for, and the spec never says what it is. The third-pass review removed the `EngineOpts` mention when it made the bump unconditional, which fixed the version question but left the API question unanswered: R10b now asserts an additive API change without naming the addition, and the Technical Notes still read as though the implementer has a choice.

**Suggested resolution**: name the route in the Technical Notes (a host-supplied readings-window selector reaching `computeView`, via `EngineOpts` or `AnalysisEngineProviderProps`), say that the pure wildfire-side transform is ruled out by R8 rather than available, and have R10b point at that named surface as the thing being versioned.

---

#### RESOLVED: the screening rule behind R12a's structural claim misses negated `WITH` occurrences, and tab 47 has one
**Resolution**: the Technical Notes rule now names both anti-monotone shapes (a history factor variable *or* a `WITH` occurrence under an odd number of `NOT`s) and says why a `NOT` inside a `WITH`'s prop expression does not qualify. Tab 47 moves out of the "none" row into its own, carrying the category-5-subsumes-category-4 argument plus the 36,928-state enumeration that confirms it. The fourth-pass entry that introduced the table is marked amended. No requirement changed.

The Technical Notes settle R12a's second bar for all eleven tabs from a static rule: "An upward move needs a history factor variable under an odd number of `NOT`s." The table puts tab 47 in the "none" row alongside 25, 34, 42 and 54.

Verified against the parsed AST, tab 47 category 4 is `NOT(with(ranSimulation, DefaultVars AND NOT(Fireline OR Helitack))) AND with(ranSimulation, DefaultVars AND (Fireline OR Helitack))`. The `NOT` sits over a `WITH` *occurrence*, not over a history factor variable. That is the same anti-monotone shape and the same mechanism: `ranSimulation WITH P` only gains witnesses as readings accumulate, so negating it can be true over a window and false over the full history. Tab 47 does not belong in the "none" row, and the rule as stated would not flag a future re-extract that put a negated `WITH` on a high category.

The conclusion is unaffected. Enumerating tab 47 at two-, three-, four- and five-run depth over the same 8-shape axis set (36,928 states) gives zero upward moves, for a reason the spec does not currently give: category 5 is category 4's precondition with the `NOT` removed, so whenever category 4 is true in a window and false over the history, category 5 is true over the history and `best` is 5.

**Suggested resolution**: widen the rule to "a history factor variable *or a `WITH` occurrence* under an odd number of `NOT`s", move 47 into its own row with the category-5-subsumes-category-4 argument, and keep the conclusion.

---

#### RESOLVED: one citation is stale, and the fourth pass's blanket re-check claim is not true
**Resolution**: `evaluator.ts:318-331` corrected to `318-328`. The third-pass entry's blanket claim is scoped to the pass that made it, and points at this pass as the later check. The full re-check of every other citation on this branch is recorded below and came back clean.

Technical Notes cite `computeMatchedCategoryForEngine` as `evaluator.ts:318-331`. The function is `318-328` and the file is 328 lines, so the cited range runs past the end of the file. Minor on its own; it matters because the third-pass housekeeping issue asserts "Every other file/line citation in the spec was re-checked against the branch and is accurate", and the fourth pass repeats it, so a reader takes the citations as verified.

Every other citation was re-checked on this branch and is accurate. Re-verified again after rebasing onto `master` at `26edb6b`, which moved three of them: `app.tsx:134` to `:137`, `LOGGED-EVENTS.md:76` to `:78` (WM-29 added four lines of fire line events above that row), and `ui.ts:22` to `:27`, all corrected. The full set: `evaluator.ts:132-149`, `:295-313`; `factor-variables.ts:17`; `use-analysis-engine.ts:17,39,58,61`; `hazbot-button.tsx:119,245`; `sidebar.tsx:85,156`; `app.tsx:137`; `version.ts` at `0.0.1`; `APP_RULES_VERSION` 5 on this branch and 4 on `master`; `extract-impl.js:85,131-167`; `replay-fixture.test.ts:52,65`; `generate-replay-fixture.js:75-78,137`; `LOGGED-EVENTS.md:78`; `localhost-urls.md:118,184`; `test-helpers.ts` `matchAgainst` / `mkReading`; `types.ts:26`.

**Suggested resolution**: change 331 to 328, and scope the blanket claim to the date it was made.

---

### Data / Analytics Engineer (fifth pass)

#### RESOLVED: `categoryCurrent: null` carries two different meanings, and the parameter that separates them is recorded nowhere
**Resolution**: added **R9b** (carry the derived `range_cc` on the `AnalysisEngineActivated` payload), widened **R9a** from four events to five so `LOGGED-EVENTS.md` records the new field and both causes of a null `categoryCurrent`, and added a Technical Notes paragraph naming `buildAnalysisEngineActivatedPayload` as the site and saying why the once-per-page-load event is the right home rather than the click.

R9 types `categoryCurrent` as `number | null`. R4 gives `current` two distinct undefined cases: the activity's `range_cc` is 0, and no category matched at the end of the window. They log identically. On tab 24 the field is null on every click for a structural reason; on tab 45 a null would mean the window matched nothing, which the spec elsewhere argues is unreachable and defensive. An analyst sees one value.

The disambiguator is `range_cc`, and R5 makes it derived rather than authored, so it exists only as a function of expressions inside a particular build. It is in no payload. `HazbotButtonClicked` carries only `matchedCategory` today (`LOGGED-EVENTS.md:78`) and R9 adds two category ids to it, so the event does not even carry `ruleSetId`; reconstructing which activity a click belongs to already requires joining to `AnalysisEngineActivated`, and reconstructing the window size requires knowing what the expressions looked like at that `APP_RULES_VERSION`. `APP_RULES_VERSION` marks that a boundary exists but does not say what the value was on either side, and the whole point of R5 is that the value moves silently when Sam edits an expression (tab 34 moved 0 to 1 last week for exactly that reason).

This is the same failure mode the resolved Education Researcher issue was written to prevent, applied to the new field rather than the existing one: a longitudinal series that cannot be interpreted without out-of-band knowledge of the build.

**Suggested resolution**: add the derived `range_cc` to the `AnalysisEngineActivated` payload, next to `engineVersion`, `appRulesVersion` and `ruleSetId`. It is one number, it is already computed at load, it is per activity so the once-per-page-load event is the right home, and it turns `categoryCurrent: null` into an interpretable value. Extend R9a's `LOGGED-EVENTS.md` edit to cover it.

---

### QA Engineer (third pass)

#### RESOLVED: R12b's scope is ten tabs, but its axes, size and runtime come from the three that were enumerated
**Resolution**: **R12b** drops the "about twenty lines" and single-tab runtime figures, which were measured on three tabs. New **R12c** requires the per-tab readings be built from the constants already in each `<tab>.test.ts`, with the wrong-fixture failure demonstrated. New **R12d** names the ten tabs and each one's axis set, all of which already exist in the committed test files, including tab 25's `topoReading` elevation path, so no tab is deferred. **R12a** now states the axis sets behind its 29 of 81 and 5 of 64 so the numbers are reproducible from the spec.

R12b says the committed test "enumerates the positive-`range_cc` tabs over their zone and tool axes", is "about twenty lines", and "runs 32768 five-run tab-45 states in well under a second". The positive-`range_cc` tabs are ten: 23, 25, 32, 33, 34, 35, 42, 45, 47 and 54. Only 45, 47 and 54 are described by "zone and tool axes". Tab 25's axes are spark placement and `SparksAtTopAndBottom`, which needs terrain elevation; tab 34's are `VegetationSet` / `WindSet` / `DroughtLevelSet`; tabs 23, 32, 33 and 35 need per-tab correct-setup constants. Each tab needs its own reading builder with its own sheet-authored constants, which is where the size estimate goes.

The sharper risk is that a hand-authored fixture that is subtly wrong pins a baseline that passes forever while covering much less than it appears to. Demonstrated while verifying this review: a first tab-23 builder whose "correct zone setup" did not actually satisfy `CorrectZoneSetup` produced 18 of 81 moved two-run states instead of the spec's 29, and reported `best` 3 where the spec's R8a case is `best` 5. Nothing about the run said the fixture was wrong. Rebuilding the constants from `23.test.ts` reproduced 29 of 81 and `best` 5 exactly.

Relatedly, R12a quotes "tab 23 moves 29 of 81 two-run states" without saying what the 81 states are, so the number is not reproducible from the spec alone. It is 9 shapes per run (three zone setups: default, the sheet's correct pair, changed-but-incorrect; times three spark placements: none, one, one per zone) over two runs.

**Suggested resolution**: have R12b build its per-tab readings from the constants already in each `<tab>.test.ts` rather than fresh ones, name the axis set for each tab it covers, and either scope it to the tabs whose axes are defined or say explicitly which tabs are deferred and why. Record the tab-23 axis set alongside R12a's 29 of 81.

---

### Product Manager (second pass)

#### RESOLVED: the `diagnostics` route is rejected on a ground the story itself removes
**Resolution**: the Technical Notes paragraph is rewritten to state the real comparison (an additive substrate API surface plus the version bump, against one `CLAUDE.md` sentence and a less prominent placement), to acknowledge that R14a is already editing walker guidance, and to reject `diagnostics` on the ground that survives: a correct value in the row walkers read beats a correction note beside a wrong one. R8, R8a, R8b and R10b are unchanged.

The Technical Notes reject the `diagnostics` prop because it "leaves the highlighted `.hazbot-sidebar-category-matched` row showing `best`, and that row is exactly where `CLAUDE.md` instructs a validation walker to read the engine's answer", concluding that "the cheap route saves a semver digit by putting the wrong number in the one place the documented workflow points at".

That argument treats the walker documentation as fixed. It is not: R14a already requires editing two sentences of `docs/hazbot-validation/localhost-urls.md` precisely because this story invalidates guidance written against a whole-history reading, and R8a requires adding a note to the sidebar saying which panels stay `best`-scoped. So the story is already in the business of correcting walker guidance, and the same edit applied to `CLAUDE.md`'s "read the matched row" sentence would make the cheap route correct.

The real cost being compared is not a semver digit. It is the substrate API addition R8 forces (see the Senior Engineer issue above) against one more documentation sentence, on a dev-only surface, for a story whose user-facing deliverable is "the first feedback for any category". Three requirements (R8, R8a, R8b) plus a substrate minor bump is a large share of this story's surface area for a panel no student sees.

**Suggested resolution**: re-state the comparison honestly (substrate API addition plus version bump, versus one `CLAUDE.md` sentence and a less prominent sidebar placement) and then choose. R8 may still win, since the highlighted row is genuinely the thing walkers read and a note is easier to miss than a correct value, but the spec should not present it as forced.

---
