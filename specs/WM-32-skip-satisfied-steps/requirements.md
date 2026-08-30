# WM-32: Dismissing Hazbot coach marks can get the sequence stuck on Restart

**Jira**: https://concord-consortium.atlassian.net/browse/WM-32
**Repo**: https://github.com/concord-consortium/wildfire-model
**Implementation Plan**: [implementation.md](implementation.md)
**Status**: **Ready to implement** (spec only; no code on the branch; all open questions resolved 2026-08-30)

## Overview

Every Hazbot coaching tour opens with "First, **Restart** your model" or "First, click **Clear All** to reset your model", and both controls disable themselves the moment they are used. Re-opening Hazbot rebuilds the tour from step 1, so the student lands on a coach mark anchored to a dead button with no way forward. This story makes a re-opened tour start at the first step the student has not already satisfied.

## Project Owner Overview

A student who dismisses Hazbot's coach marks and then asks to see them again can be left permanently stuck. The coach mark points at the Restart button and waits for a click, but Restart grayed itself out the instant it was pressed, and the coach mark offers no other way to continue. There is no keyboard escape and no Next button, so the only recovery is closing Hazbot entirely and losing the guidance.

This is not a quirk of one example: it affects all 32 coaching tours, and there are three distinct ways to reach the dead end. This story fixes the two that happen at open time (re-opening after Restart, and re-opening after Clear All) by skipping steps the student has already completed, so a re-opened tour resumes where they actually are. The third route, where a step goes dead while the student is sitting on it, needs a change in the shared coach-mark library and is scoped separately below.

## Background

The Hazbot walk-through is a click-gated tour: `build-tour.ts:56` stamps `advanceOn: { event: "click" }` onto every non-terminal step, and the coachmarks engine advances only when the student clicks the exact element the step anchors. Intermediate steps render no Next button, because `showNext = showButtons.includes("next") && (!actionGated || isLast)` is engine-global in `@concord-consortium/coachmarks` (verified in the pinned `0.0.1-pre.9` dist, `index.js:747`). So a gated tour cannot have an intermediate step that is not gated on clicking a live element.

The first step of every tour anchors a control that disables itself when used:

- `restartEnabled === simulationStarted` (`simulation.ts:166`), so clicking Restart clears `simulationStarted` and kills the Restart anchor.
- `reloadEnabled === setupChanged || sparks.length > 0` (`simulation.ts:162`), and `reload()` clears `setupChanged` and restores `sparks` to the preset default (`simulation.ts:445`, `:326`), so Clear All kills its own anchor the same way. The getter and the method keep the pre-WM-47 `reload` name; only the UI label and the `clear-all-button` testid were renamed.

`hazbot-button.tsx` rebuilds the tour from step 0 on every open, so a dismiss-and-reopen anchors a disabled button. `onTargetLost: "close"` does not rescue it: the button is still mounted and laid out, merely disabled. The signature is an empty popover button group next to a disabled anchor: no gate to satisfy and no button to press.

A prototype of the fix was written and verified live against rulesets 23/2, 25/2 and 42/2 on 2026-08-07 (the numbering of the day; 42 no longer exists), and unit tested on 2026-08-24. It is no longer carried as code: on 2026-08-30 the branch was rebased onto `origin/master` at `c692687` and both commits were unwound into [implementation.md](implementation.md), which now holds the helper, the call-site change and the tests verbatim. That document is the source of truth for the prototype, and every claim in it was re-verified against the new base.

## Requirements

- When a tour is opened, leading steps whose anchor is already un-clickable are dropped, and the tour is driven from the first step the student has not satisfied. The first-time path is unchanged: nothing is skipped while the first anchor is live.
- "Satisfied" is decided per anchor by a predicate that references the `simulation.ts` getter owning that control's enabled state, not by the anchor's rendered `disabled` attribute. Two anchors carry a predicate: `restart-button` (`!restartEnabled`) and `clear-all-button` (`!reloadEnabled`). Reading model state rather than rendered state is what keeps a control that is merely *suppressed* from counting as *done*: `clear-all-button` is `!reloadEnabled || ui.showTerrainUI` (`bottom-bar.tsx:147`), so with the Setup panel open it renders disabled while `reloadEnabled` is still true.
- A step whose anchor has no predicate is never dropped. That is the safe default and it subsumes the absent-anchor case: `terrain-next` lives inside the closed Setup panel and `terrain-button` can only be disabled in a state where `restart-button` is live, so neither needs one. The map is enforced rather than remembered: a `tour-map.test.ts` case asserts every anchor `tourMap` can emit as a non-terminal step has a predicate, so a new leading anchor fails the build until someone declares what satisfied means for it.
- The skip is a **satisfied-step** skip, not a progress tracker. It is re-evaluated from live model state on every open, and a step whose control the student can still act on is never dropped even if they have already performed it. Re-opening after clicking Setup therefore shows the Setup step again, because `setupEnabled === !simulationStarted` (`simulation.ts:154`) does not change when the panel opens.
- The library's Continue affordance is what keeps a *not* satisfied but currently un-clickable step from being a dead end. It renders whenever the step's anchor is un-clickable, **whether the anchor was already so when the step was entered or became so while the step was showing**. The at-entry case is the one this story creates: the skip deliberately declines to drop a transiently suppressed step, so that step is entered with its anchor already dead, and a mutation-only implementation would miss it.
- The terminal step is never dropped, so a tour can never collapse to zero steps. This guarantee is carried by the helper's own index bound, not by the absence of a gate on the terminal step (see Technical Notes).
- There is no cap on how many leading steps may be dropped. Dropping every dead leading step is the intended behavior; a cap would reintroduce the dead end this story exists to remove.
- A first open of a Clear All first tour (41/2, 44/2, 46/2) drops nothing. After a run with sparks placed, `reloadEnabled` is true, so the Clear All anchor is live and the tour starts at step 1 exactly as a Restart-first tour does.
- Progress text is suppressed when only one step remains, so a two-step tour that loses its first step renders a single coach mark rather than "Step 1 of 1".
- Step numbering is renumbered against the driven array, not the authored one: a three-step tour re-opened after Restart reads "Step 1 of 2".
- All four Hazbot tour events carry `skippedSteps`, so a dismissal on the first *visible* step is not indistinguishable from a dismissal on the first *authored* step, and no row needs a join to be read. `stepCount` and `lastStepIndex` stay in driven coordinates; the authored index is `lastStepIndex + skippedSteps`. On `HazbotCoachMarkHiddenByRun` the field is `null` for the intro phase, exactly as `lastStepIndex` already is. Repeating the field on the three outcome events rather than leaving it to a join to `HazbotShowMeClicked` follows the rule that row already states for `feedbackLevel` ("it is repeated here so the row reads without a join"), and a join is not merely inconvenient: a session whose `HazbotShowMeClicked` is missing leaves `lastStepIndex` uninterpretable with no signal that it is wrong.
- `LOGGED-EVENTS.md`'s rows for all **four** Hazbot tour events (`HazbotShowMeClicked`, `HazbotTourCompleted`, `HazbotTourDismissed` and `HazbotCoachMarkHiddenByRun`) are updated in the same PR to state which coordinate system each field is in. The current rows describe `stepCount` as "the number of steps in the launched tour" and say nothing about skipping; `HazbotCoachMarkHiddenByRun` (`LOGGED-EVENTS.md:85`) additionally spells the `lastStepIndex` against `stepCount - 1` derivation out in prose, so it is checked rather than rewritten.
- `APP_RULES_VERSION` is **not** bumped and no `### ... (appRulesVersion N onward)` section is added. Instead the `HazbotShowMeClicked` row states that the presence of `skippedSteps` is itself the release marker, and that the driven and authored coordinates coincide wherever it is `0`, so a query spanning the boundary needs no release date.
- Prose elsewhere that the change invalidates is updated in the same PR: `CLAUDE.md:83` and `:144`, which document `window.test.resetHazbotFeedbackLevels()` as closing an open Hazbot popover (it no longer closes a driving tour), and `tour-map.tsx:19`, whose file header states the Fireline ring rule that the ring move reverses.
**The library change (`@concord-consortium/coachmarks`).**

- A gated step whose anchor is un-clickable renders a Continue button, so no gated step can be a dead end. The predicate is the anchor's un-clickability, evaluated at step entry as well as on mutation (see the Requirement above). While the anchor is clickable the step stays gated exactly as today, so the affordance can never be used to skip a step the student could have acted on.
- The affordance is a reversible per-step signal, not a target-lost one. `useTargetWatcher` cannot carry it: its callback cancels the tour under `onTargetLost: "close"`, and it disconnects after firing, so it cannot report an anchor coming back live.
- The button reads "Continue", which the app sets via `nextBtnText`; the library's own default stays "Next".
- Published as `0.0.1-pre.10` and repinned here **before** the wildfire branch is pushed, per the standing constraint that wildfire must not point at an unpublished coachmarks version.

**The WM-46 regression fix.**

- `resetHazbotFeedback()` no longer destroys a **driving** tour. Clear All is the authored first step of the three Clear All tours (41/2, 44/2, 46/2), so tearing the tour down on that click makes their second step unreachable. A **deferred** open (pending inside the avatar's 400ms scale-up, before any tour exists) is still canceled, which is WM-46's actual guarantee.
- `tourActive` **moves** from `HazbotButton`'s local `useState` into the UI store as `ui.hazbotTourActive`, so the gate has something to read. It is a move rather than a duplication: the component reads `ui.hazbotTourActive` for its `.noHazbot` class exactly as it reads `ui.showHazbotFeedback` for `.coached`, and the closed-branch write stays so no stale value reaches the render that reopens the panel.

**The Fireline ring move.**

- 44/3 and 46/3 ring `start-button` rather than `fireline-button`. `fireLineEnabled` requires `simulation.simulationStarted` (`bottom-bar.tsx:88`) and both tours open with "First, **Restart** your model.", so the terminal step always rang a disabled control; Start is live at that moment because `restart()` does not clear sparks. Decided by Trudi (*"I think the outline should move to start!"*).

**Authoring.**

- `docs/hazbot-update-workflow.md` records the convention the skip depends on: any step after the first can become a tour's opener, so no step may open with a connective pointing back at one the student never saw. A `tour-map.test.ts` case enforces it over `tourData`.

**Testing.**

- `dropSatisfiedLeadingSteps` is exported from `hazbot-button.tsx` and unit tested directly, as `parseFeedback` in the same file already is, so its guards can be exercised against a synthetic step array rather than only through the full component.
- Unit tests cover the skip path, the no-skip path, the no-predicate path, the transient-suppression path (`ui.showTerrainUI` true with `reloadEnabled` true drops nothing), the progress suppression, the collapse-to-zero guard, the Clear All first tours' first-open path, and the **non-zero** `skippedSteps` payload. `hazbot-button.test.tsx:396`'s exact-match assertion on the log payload is updated rather than loosened, and the non-zero case is asserted separately rather than treated as already covered by that update.
- The two existing tests that pin the behavior the WM-46 regression fix reverses are rewritten rather than deleted: `hazbot-button.test.tsx:863` asserts instead that a **driving** tour keeps `.noHazbot` across a `resetHazbotFeedback()`, and `:879` that a reopen after a **completed** tour still never commits `.noHazbot`. WM-46's own case at `:615` stays as it is and must stay green.
- `hazbot-button.test.tsx:394`'s no-skip case is given a started run rather than relying on the default store state, so its "nothing was dropped" outcome is behavioral rather than incidental.
- Existing tour invariants are untouched: `buildTour` still returns the full authored array, and `tour-map.test.ts` and `tour-data.generated.ts` keep their current step counts.

## Technical Notes

Findings below were established by reading the code and by throwaway Jest tests written against it (since deleted, per the note at the end of this section). They were re-verified on 2026-08-30 against `origin/master` at `c692687`, which is 74 commits past the tree the prototype was written on; what moved between the two is itemized under "Drift since the prototype" in [implementation.md](implementation.md).

**Tour inventory, counted on the current tree.** `tour-map.tsx` holds **32** tours, not the 33 the ticket describes: **29** open on `anchor("restart-button")` and **3** on `anchor("clear-all-button")` (41/2, 44/2, 46/2). The rulesets were also renumbered by a re-extract since the ticket was written, so the map is now 23, 24, 25, 32, 33, 34, 35, 41, 44 and 46; the old 42, 45, 47 and 54 are gone. Every count in the ticket description and in the prototype's commit messages is stale, and the numbering in them does not map onto the current tree.

**The sheet-side content change the fix required has already landed.** The fix promotes step 2 to the opening coach mark, which read oddly while those lines began with "Now". `grep -c 'Now ' src/hazbot/wildfire/tour-data.generated.ts` returns **0** on the current tree: Trudi's removals reached the app through the WM-51 re-extract, so 23/2's second step now reads "Click the **Setup** button." with no leading connective. There is no remaining content dependency for this fix.

**Eight distinct lines can become an opener, not three.** Across the 32 tours, the step-2 texts (the ones the skip promotes) collapse to eight distinct strings: "Click the **Setup** button." (19 tours), "Click **Start** to run the model!" (4), "Place one spark in Zone 1 and one spark in Zone 2, then run the model again." (3), "Add both a **Fireline** and a **Helitack** while the model is running. Click **Start** to begin!" (2), and one tour each for "Place one spark at the **bottom of a mountain** in one zone and one spark at the **top of a mountain** in the other zone, then run the model again.", "Make sure there is a **Spark** in each zone. Then run the model again.", "Make sure there is a spark in each zone. Then run the model again." and "Place one **Spark** in Zone 1 and one **Spark** in Zone 2, then run the model again." Every one of them is reachable as the first thing a student reads after a reopen.

**The "First, ..." convention already has exceptions, and the code does not depend on it.** The 32 step-1 texts are three strings: "First, **Restart** your model." (26 tours), "**Restart** your model first." (3: 25/2, 25/3, 25/4) and "First, click **Clear All** to reset your model." (3: 41/2, 44/2, 46/2). So the prefix is not uniform even today. Separately, no tour carries a "First," line at any index above 0. The skip reads the rendered `disabled` state and never looks at the text, so no prose convention is load-bearing for the fix; what is left is the content-workflow question about the eight promotable lines above.

**Only one leading step can be dropped today, and that is incidental rather than load-bearing.** `setupEnabled === !simulationStarted` (`simulation.ts:154`) is the exact complement of `restartEnabled === simulationStarted` (`:166`), and every tour of three or more steps has `terrain-button` at index 1, so in the state where Restart is dead, Setup is live and a three-step tour collapses to exactly two. This is not a safety property: if a future control change ever made two leading anchors dead at once, dropping both would be the *correct* outcome, since a tour gated on two dead controls is exactly the dead end this story removes. The four-step tours (24/2, 24/3, 24/4) are bounded a second way: their index-2 anchor `terrain-next` carries no `SATISFIED_BY` predicate, so the loop breaks there regardless of any enable state.

**The skip path is unit-testable with no DOM at all.** The earlier note that it needs a real browser applied to the rejected `moveTo` shape, which trips `isLaidOut`'s zero-rect check. Reading model state rather than the DOM removes the last reason to touch the document: the helper takes the `SimulationModel` and the cases are driven by setting `simulationStarted`, `sparks` and `setupChanged` on a real store. No anchor injection, no `afterEach` cleanup of nodes appended outside `render()`.

This changes what the existing suite sees. `createStores()` starts with `simulationStarted === false` and no sparks, so **both** leading predicates read satisfied by default, and the existing "launches a gated tour" case at `hazbot-button.test.tsx:394` now drives 2 steps rather than 3. Its no-skip outcome had been structural (no anchor in the document under the rejected DOM shape) rather than behavioral; giving it `simulationStarted = true` makes Restart genuinely live and turns it into a real assertion.

**The two guards are not redundant: they guard different things, and each is independently mutation-visible.** Exporting the helper and driving it with synthetic step arrays separates them, and both mutations were run in this pass.

The index bound `i < steps.length - 1` is the collapse-to-zero guarantee, and it is the only one: with a two-step array in which **both** steps carry `advanceOn` and both anchors are disabled, widening the bound to `i < steps.length` drops the array to zero steps and the case fails, while the `!step.advanceOn` break never fires.

The `!step.advanceOn` break is a different rule, "only click-gated steps are droppable". The case that shows it is a leading step with a `target` but **no** `advanceOn`, followed by a gated dead one: removing the break drops both and the case fails, while the index bound never fires. The viewport shape does **not** show it, because a viewport step carries no `target` and the `!step.target` break catches it first; a case built that way stays green under the mutation and is therefore unable to fail.

Neither break is reachable through `buildTour` today. `build-tour.ts:56` stamps `advanceOn` on every non-terminal anchored step, and no tour authors a viewport step anywhere but its terminal, so on real input only the index bound and the `SATISFIED_BY` lookup do any work. Swept across all 32 tours, both `ctx` branches and all 8 reachable combinations of `simulationStarted` / `sparks` / `setupChanged`, dropping the `!step.advanceOn` break changes the output of none of the 512 combinations. The break is kept because the exported helper's signature takes `EngineStep[]`, a public library type, rather than "whatever `buildTour` emitted", so a mid-tour ungated step is inside its contract even though nothing authors one yet. That is also why the guard is pinned by a synthetic case rather than by a tour: a test written over `buildTour` output could not fail.

**There is no render-timing question left.** The helper reads MobX state directly and never touches the document, so the unflushed-prop window raised in the first review pass cannot arise by construction rather than by argument. (It was already unreachable on this path: `openTour` runs from the intro engine's `onDestroyed`, after the avatar's scale-up and two user clicks.)

**"Step 2 of 3" is not available at the current pin.** The engine renders the progress line as `renderProgressText(opts.progressText, activeIndex + 1, stepsLength)` (`dist/index.js:937-941`), both taken from the driven array, and exposes no offset or explicit-total option. Rendering authored-coordinate numbering would therefore need a coachmarks change and a repin, the same cross-repo cost as the Continue button in the first open question. Driving the full array and calling `moveTo(1)` is the shape that was already tried and rejected (it trips `isLaidOut`'s zero-rect check).

**A collapsed single-step coach mark is not visually the intro popover, in either of the two shapes it can take.** The tour engine leaves `showOutlineRing` and `showAvatar` at their library defaults, both `true` (`dist/index.js:82`, `:897`), while the intro sets both to `false` explicitly.

Thirteen of the 32 tours collapse to a single step on default post-Restart state, and they do not all collapse to the same shape. Eight collapse onto an **anchored** terminal: the bubble draws the outline ring on a bottom-bar control, shows the Hazbot avatar badge, sits at `popoverOffset: 27` from that control with an arrow into it, and carries the tour's `doneLabel` ("Got it!"). Five collapse onto a **viewport** terminal (25/3, 25/4, and 23/4 / 33/4 / 35/6 in their `sparkZoneCount >= 2` branch), where two of those four differences do not exist: a viewport popover carries no `element`, `outline-ring.tsx` returns null without one, and nothing is anchored, so there is no ring, no `popoverOffset` and no arrow. What separates it from the intro instead is placement, badge and label: it sits centered at the top of the map with no pointer at all, while the intro sits at the bottom right with an arrow into the enlarged robot, no badge, and the category's bracket token ("Show me" / "Okay" / "Hooray!"). Confirmed live on 25/3 (`tmp/playwright/wm32-intro-popover-25-3.png` against `tmp/playwright/wm32-tour-step2-viewport-25-3.png`). Neither shape can be mistaken for the intro popover; the reasons differ between them.

A **two-step floor**, so a 2-step tour never skips and the library's Continue affordance carries its dead opener, was considered and rejected. It is only coherent because that affordance now exists, and it is worse in every case checked: on 41/2 it puts the student back on a dead Clear All needing an extra click, and on 25/3 it restores "Step 1 of 2" pointing at a dead Restart, which is the complaint this story was filed for.

**The spark tours' terminal instruction cannot be followed after a Restart either.** Walked live on 25/3: the terminal reads "Place one spark in Zone 1 and one spark in Zone 2, then run the model again", but `restart()` does not clear sparks, so both are still on the map, `canAddSpark` is `zonesCount - sparks.length` = 0 and the Spark button is grayed. The student has to Clear All first and no step says so. On 23/4, 33/4 and 35/6 the `sparkZoneCount >= 2` branch is worse: the collapsed instruction describes the state that selected the branch. Same family as the Clear All finding below, pre-existing on a forward walk, and out of scope here; what the skip changes is that it becomes the whole tour rather than its second half. On the content list for Trudi.

**The Clear All tours' terminal instruction cannot be followed.** After a Clear All, `reload()` restores `sparks` to the preset default (`setInputParamsFromConfig`, `simulation.ts:326`, which is empty for every preset the Hazbot activities use: only `basic`, `basicWithWind`, `slope45deg` and `basicWithSlopeAndWind` author a `sparks` key, and the rest fall through to `config.ts:174`'s `sparks: []`) and clears `setupChanged`, so `ready === dataReady && sparks.length > 0` (`simulation.ts:78`) is false and `startEnabled === ready && !simulationEnded` (`:158`) is false, yet the promoted terminal step says "Click **Start** to run the model!" and rings a grayed Start. This applies to all three Clear All tours (41/2, 44/2, 46/2), which share that terminal. The student is not *stuck* (a terminal step is Done-terminated, so "Got it!" is available), but the instruction is unfollowable. This is pre-existing and independent of the skip: the same thing happens on a normal forward walk. Same family as the Fireline ring on 44/3 and 46/3, where the ring sits on a control that is grayed until the model runs.

**The library gap is unchanged at the current pin.** `@concord-consortium/coachmarks@0.0.1-pre.9` exposes no per-step `showNext` and no `advanceTarget`/`advanceElement` (checked against `dist/index.d.ts`; the step types carry only `advanceOn`, `ringTarget`/`ringElement`, `initialFocus`). So the mid-tour dead end has no in-library escape today, and the app-side skip structurally cannot reach it: the skip runs at open time on leading steps.

**Suite baseline on this branch, and the measured test cost.** With no code on the branch, `npx jest` reports **1022 passed of 1022** across 82 suites. Both figures below were measured by applying the change as a throwaway probe and running `hazbot-button.test.tsx` (48 cases), then reverting.

The **skip slice alone** breaks one case: 1 failed of 48, `hazbot-button.test.tsx`'s "launches a gated tour on [Show me]". Two assertions inside it move, at `:394` (the driven length) and `:396` (the exact-match payload, which gains `skippedSteps`). Both move because `createStores()` leaves `simulationStarted` false, so the Restart step reads satisfied; giving the case a started run restores 3 driven steps and `skippedSteps: 0`. `buildTour`, its guards, `tour-map.test.ts` and `tour-data.generated.ts` are untouched, which is what makes this cheaper than the description's option 3 assumed.

Adding the **WM-46 regression fix** (question 3) takes it to 3 failed of 48, and to **3 failed of 1022** across the full 82-suite run, all three in this one file. The two extra failures are existing tests that assert the contract the fix reverses, and both are correct to fail: with the fix a driving tour survives Clear All, so `.noHazbot` legitimately stays on the button.

- `hazbot-button.test.tsx:863` "never shows the tour's click-blocking faded state while the panel is closed"
- `hazbot-button.test.tsx:879` "reopening after a Clear All never commits .noHazbot either"

WM-46's own guarantee is unaffected: `:615` "cancels a deferred open when a reset lands before the popover appears" stays green under the probe, which is the claim question 3's fix rests on.

**A run now tears the coach mark down, which closes one of the three dead ends.** `runInProgress` (`simulation.ts:150`) disables the Hazbot button and clears `ui.showHazbotFeedback`, logging the new `HazbotCoachMarkHiddenByRun` event. So the specific mid-tour repro this spec names (sit on 23/2's Setup step, click Start) no longer strands the student: the tour is destroyed instead. The mid-tour dead end is not proven gone, since a route that kills an anchor without starting a run would still strand them, but the repro has to be re-derived before that case is filed as its own ticket.

**Throwaway artifacts.** The cases described above were written as throwaway Jest files (and, for the mutation runs, a temporary `export` on the helper) and deleted afterward. Their findings are recorded here and the real tests are written out in [implementation.md](implementation.md), to be added to `hazbot-button.test.tsx` as part of the implementation.

## Out of Scope

- **The mid-tour dead end is IN scope**, via the library's Continue affordance, and is listed here only because earlier drafts excluded it. The open-time skip structurally cannot reach a step whose anchor dies while the student is on it, and the skip's decision to keep a transiently suppressed step creates a second case of the same shape at step entry. One change answers both: resolved in the first open question, specified in the Requirements above. What stays out of scope is the residual **content** defect on those tours (below).
- **A cap on how many leading steps the skip may drop.** Rejected: dropping every satisfied leading step is the intended behavior, and a cap would restore the dead end. The index bound already bounds the worst case at "the tour opens on its terminal step".
- **A test pinning the `restartEnabled` / `setupEnabled` complementarity.** Rejected for the same reason: the complementarity only decides *how many* steps get dropped, and dropping more is correct, so nothing about the fix's safety rests on it.
- **The Reload to Clear All rename.** WM-47 has landed: the three openers now read "First, click **Clear All** to reset your model." and the anchor is `clear-all-button`. The model getter and method keep their pre-rename names (`reloadEnabled`, `reload()`), so the predicate map keys on the new testid and references the old getter, and a further rename touches one line.
- **Reopening `restartEnabled` / `reloadEnabled` semantics** (the description's option 1). WM-24 settled the model-control states deliberately; making a used control clickable again to satisfy a coach mark would undo that.
- **Changing what `buildTour` returns.** The authored array, its guards, `tour-map.test.ts` and `tour-data.generated.ts` stay as they are. The slice happens at the `drive()` call site.
- **Accessibility review**, per the standing scope for this repo.

## Open Questions

### RESOLVED: Does the per-step Continue button ship inside WM-32, or as its own ticket?
**Context**: The app-side skip fixes two of the three dead ends. The third (a step's anchor going dead mid-tour) is only reachable by a change to `@concord-consortium/coachmarks`, which is authored in house and deliberately pre-v1, so it is a routine next-`pre.N` publish plus a repin rather than an outside dependency. It is still a second repo, a publish, and a repin, and the standing constraint is that wildfire must not be pushed while it points at an unpublished coachmarks version. The two changes are independent: the skip can ship on its own.
**Options considered**:
- A) Ship the skip in WM-32; file the library Continue button as a new ticket, referencing the mid-tour repro.
- B) Do both under WM-32, accepting the cross-repo publish inside this story's branch.
- C) Ship the skip and leave the mid-tour case unticketed until it is reported from the field.

**Findings:** a second, independent reason to want a coachmarks change surfaced during this pass, which changes the arithmetic of option B. Authored-coordinate progress numbering ("Step 2 of 3") is also unavailable at `pre.9`: the engine computes the progress line from the driven array alone (`renderProgressText(opts.progressText, activeIndex + 1, stepsLength)`, `dist/index.js:937-941`) with no offset or explicit-total option. If Trudi wants authored numbering (the PM review item below), that need and the Continue button would ride the same publish.

**Severity of the mid-tour case, re-derived 2026-08-30.** It survives, but it is smaller than this spec assumed and it no longer traps anyone. Reproduced live on ruleset 41/2: with the tour open on step 1, clicking Restart and then Setup (neither of which the tour asked for) opens the Setup panel, which disables `clear-all-button` through the `|| ui.showTerrainUI` term in `bottom-bar.tsx:147`. The coach mark keeps ringing the grayed button with only the close × available. **Closing the Setup panel re-enables it and the tour is live again**, so the state is temporary and self-healing. The permanent version is gone: every anchor whose disabled state persists is driven by `simulationStarted`, which requires a run, and a run now tears the coach mark down. Every other mid-tour dead anchor sits on a terminal step, where "Got it!" is available. So the surviving case is index 0 of the three Clear All tours, and it heals itself.

**The library can already see it; only the predicate says no.** Two throwaway vitest cases in the coachmarks repo (since deleted) established that `isLaidOut` accepts a disabled button, so `onTargetLost` never fires for one, **and** that the `MutationObserver` config `useTargetWatcher` already uses does fire on the `disabled` attribute mutation. The plumbing is in place; the change is the predicate plus the `showNext` line at `popover.tsx:469`. Note the shape: a *static* per-step Continue opt-in is wrong, because it would render Continue on every visit to that step including when the anchor is live. The correct shape is reactive, showing Continue only once the anchor goes un-clickable.

**Decision**: **B.** Both changes ship under WM-32. The library is authored in house and deliberately pre-v1, so a `pre.10` publish and repin is routine rather than an outside dependency. (The progress-offset option was the other candidate for that publish; the PM question below resolved to driven numbering, so the Continue button is the only library change WM-32 carries.) The standing constraint still applies: wildfire must not be pushed while it pins an unpublished coachmarks version, so the publish lands before the wildfire branch goes up. The library ticket's framing is "a gated step has no way to notice its anchor became un-clickable", not "students get stuck".

---

### RESOLVED: Does anything read `stepCount` or `lastStepIndex` off `HazbotShowMeClicked` / the dismissal events?
**Context**: The slice changes both fields' meaning. `stepCount` becomes the driven count rather than the authored one, and `lastStepIndex` becomes relative to the sliced array, so a dismissal on the first *visible* step logs 0 whether or not a step was skipped. The prototype adds `skippedSteps` so the two can be told apart after the fact, but that only helps if the consumer knows to add it back. If a researcher query treats `stepCount` as "how long is this tour", it will now under-report.
**Options considered**:
- A) Keep `skippedSteps` as the reconciling field and leave `stepCount` meaning the driven count.
- B) Report `stepCount` as the authored count and add `drivenStepCount`, so existing queries keep their meaning.
- C) Report `lastStepIndex` in authored coordinates (add `skippedSteps` back to it) so step indices are comparable across sessions.

**Findings:** the question has an answer in the repo, and it eliminates B and C as standalone options. Nothing in the app reads these fields (the three Hazbot tour events are deliberate no-ops in `translate.ts`), but there is one named downstream consumer, recorded in `specs/WM-45-analysis-last-run.md:103` on 2026-08-21: Sam's choice-at-maximum flow needs to know whether a student finished a walk-through, and "coach-mark completion is derivable from `HazbotShowMeClicked { stepCount }` paired with the `lastStepIndex` on `HazbotTourCompleted` / `HazbotTourDismissed`". That derivation is `lastStepIndex === stepCount - 1`, and it only works while both fields are in the **same** coordinate system. Option A keeps them both driven and preserves it. Option B alone (authored `stepCount`, driven `lastStepIndex`) breaks it in the skip case: a completed 3-step tour that opened at step 2 would log `lastStepIndex: 1, stepCount: 3` and read as abandoned. Option C alone breaks it symmetrically. Only A, or B and C applied together, keeps the pairing self-consistent. What is genuinely lost under A is cross-session comparability of "how long is this tour" and of authored step identity, both recoverable by adding `skippedSteps` back. The events shipped in `v1.5.0` (2026-06-29), so any existing series is about eight weeks long.

**Second consumer, added since:** `LOGGED-EVENTS.md` now documents a fourth event, `HazbotCoachMarkHiddenByRun`, whose row spells the same derivation out in prose: it tells a reader to judge abandonment-by-running by comparing its `lastStepIndex` against `stepCount` on the paired `HazbotShowMeClicked`, and it names six specific tours where a terminal index means compliance rather than abandonment. That prose is only correct while both fields stay in driven coordinates, which strengthens A and means the row has to be revisited as part of whichever option is chosen, not afterward.

**Decision**: **A**, and it was already settled elsewhere. `specs/WM-31-disable-hazbot-while-running.md:64`, a closed spec for work that has since merged, records that "WM-32 resolved `stepCount` and `lastStepIndex` to driven coordinates with `skippedSteps` reconciling, so this event's terminal test survives it", and WM-31's `HazbotCoachMarkHiddenByRun` row was written against that. Reopening the choice now would falsify a merged spec and the prose in `LOGGED-EVENTS.md:85` that depends on it.

The arithmetic was re-checked against the WM-45 derivation on a 3-step tour with 1 step skipped and completed: A logs `{stepCount: 2, lastStepIndex: 1}` and reads COMPLETED; B alone logs `{3, 1}` and C alone logs `{2, 2}`, both of which read a completed tour as abandoned; B and C together are self-consistent but change two fields to end up where A already is. Nothing in the app reads any of these (the four Hazbot tour events are unhandled in `translate.ts`), so the only consumers are downstream queries, and they are best served by the coordinate system the merged spec already promised them.

`WM-31:81` also confirms a deliverable this spec already carries: because WM-31 landed first, WM-32 writes all four event names into the coordinate-system note, not three.

---

### RESOLVED: Who fixes the Clear All tours' unfollowable terminal instruction, and is it in this story?
**Context**: 41/2, 44/2 and 46/2 say "First, click **Clear All** to reset your model." then "Click **Start** to run the model!", but Clear All empties the sparks, so Start is grayed when that coach mark appears. Trudi's 2026-08-18 comment answered the Fireline ring question and the "Now" prefixes but did not address this one. It is pre-existing, is not caused or worsened by the skip, and is content (the sheet) rather than code. The skip does make it more visible: after a reopen, the grayed-Start coach mark becomes the *only* thing the student sees.
**Options considered**:
- A) Out of scope for WM-32; raise it with Trudi as a separate content ticket.
- B) In scope, since the skip promotes it to the opening coach mark.
- C) Change the tour's anchor rather than its text, ringing whatever the student can actually act on.

**Findings:** the mechanism is confirmed by reading the getters rather than by inference: `reload()` clears `setupChanged` and restores `sparks` to the preset default (`simulation.ts:445`, `:326`), `ready === dataReady && sparks.length > 0` (`:78`), and `startEnabled === ready && !simulationEnded` (`:158`), so Start is unavoidably disabled at the moment the terminal step is shown after a Clear All. The scope is all three Clear All tours (41/2, 44/2, 46/2), which share a `start-button` terminal and the same authored text. Option C is cheaper than it looks (`tour-map.tsx` lines 126, 130, 135) but there is no better anchor to move the ring to: after a Clear All the student's next real action is placing a spark, which none of the three tours mention. That points at a text change rather than an anchor change, which makes this Trudi's and Sam's call either way.

**Re-derived 2026-08-30: there are two defects here, not one, and one of them is a regression we own.**

*Behavior (ours, a regression from WM-46).* `bottom-bar.tsx:346` calls `ui.resetHazbotFeedback()`, which lowers `showHazbotFeedback` (`ui.ts:56`). That flag is the sole dependency of the Hazbot panel effect, so lowering it runs the effect's cleanup and destroys both engines. The three Clear All tours are authored as "1. click **Clear All**" then "2. click **Start**", so **step 1 instructs the exact action that kills the tour** and step 2 is unreachable. Walked live on 41/2: the coach mark vanishes on the ringed click.

Git dates the cause precisely. Through 2026-08-23 the handler cleared the level maps only and left the flag raised, so the tour survived the click and advanced. `fd387c4` (WM-46, 2026-08-24) introduced `resetHazbotFeedback()` and the flag lowering, targeting an unrelated race where a press inside the avatar's 400ms scale-up window landed its level back into the just-cleared map; in-flight tours were collateral. The WM-47 rename (`f256463`, `a195ef0`, 2026-08-26) is **not** the cause. A throwaway test pinned the causation to that single line. This spec's original "unfollowable terminal instruction" text described the pre-WM-46 world accurately and was overtaken by that commit.

*Content (pre-existing, Sam and Trudi's).* Even with the tour surviving, step 2 says "Click **Start** to run the model!" while Start is disabled, because `reload()` empties the sparks and `startEnabled` requires `ready === dataReady && sparks.length > 0`. The tour never mentions placing sparks, which is the student's actual next action. Broken since the tours were authored.

**Decision**: **C, split by ownership.** WM-32 fixes the regression; the content half goes to Trudi.

*The fix.* `resetHazbotFeedback()` must still cancel a **deferred** open (WM-46's defect) but must not destroy a **driving** tour. The two states are mutually exclusive: the deferred open is pending only inside the 400ms scale-up window, and `openOnce` sets `opened = true` before any tour exists. So the flag lowering is gated on whether a tour is running, which means promoting `tourActive` out of `HazbotButton`'s local `useState` and into the UI store. That is a move rather than a duplication, so there is still one source of truth; the component reads `ui.hazbotTourActive` for its `.noHazbot` class exactly as it reads `ui.showHazbotFeedback` for `.coached`.

*Verified.* A throwaway probe (the flag lowering commented out, since reverted) was walked live on 41/2: the tour survived the Clear All click and advanced to "Step 2 of 2 / Click **Start** to run the model! / [Got it!]" with Start grayed and `sparks.length === 0`. That is both halves confirmed at once: the fix restores step 2, and the residual content defect is exactly as described.

*Delivery note.* When the branch goes up for review, Trudi has to be told that the Clear All tours' second step is now reachable for the first time and that its instruction cannot be followed as authored, with the spark placement the likely missing step. Carried as a deliverable in [implementation.md](implementation.md).

---

### RESOLVED: Does moving the Fireline ring to Start (44/3, 46/3) belong to WM-32?
**Context**: Trudi answered this one directly: *"I think the outline should move to start!"* It is a `tour-map.tsx` edit plus a `visualFeedback` change in the sheet, and it is the same class of defect as the Clear All question above. It was surfaced by this investigation but is not caused by the skip.
**Options considered**:
- A) Fold it into WM-32, since the decision is already made and the edit is two lines in `tour-map.tsx`.
- B) Keep WM-32 to the dead-end fix and carry the ring move on whichever ticket owns the sheet's `visualFeedback` column.

**Findings:** re-counted on the current tree, the edit is two lines rather than three: `tour-map.tsx:131` and `:136` each read `[anchor("restart-button"), anchor("fireline-button")]`, and both share the same authored terminal text ("Add both a **Fireline** and a **Helitack** while the model is running. Click **Start** to begin!"). The two are byte-identical, so the change is uniform. The re-extract that renumbered the rulesets dropped the third. Note that this edit and the previous question pull in opposite directions: here the ring moves *to* Start, while the Clear All tours' problem is a ring already *on* a grayed Start. Whoever takes these should take both, because "ring the control the student can act on" cannot be the rule in one place and not the other.

**Decision**: **A, fold it into WM-32.** Three things make this different from the Clear All content item deferred above: Trudi has already decided it, it is `tour-map.tsx` rather than her sheet, and it is what makes the skip's output actionable on these two tours.

*Why it is provable without a live walk.* `fireLineEnabled` requires `simulation.simulationStarted` (`bottom-bar.tsx:88`), both tours are `[restart-button, fireline-button]`, their step 1 is "First, **Restart** your model.", and `restart()` clears `simulationStarted`. So the terminal step necessarily rings a disabled Fireline. Start is live at that same moment, because `restart()` does not clear sparks, so `ready` holds and `startEnabled` is true.

*Why the two changes are complementary.* These are 2-step tours, so a reopen after Restart drops step 1 and the terminal step becomes the only coach mark shown. Without the ring move, WM-32 promotes a grayed Fireline to be the whole of what the student sees; with it, the promoted step rings a control they can act on.

*Scope of the edit.* `tour-map.tsx:131` and `:136`, byte-identical, `anchor("fireline-button")` to `anchor("start-button")`. The sheet's `visualFeedback` still reads "Fireline button outlined", but that prose is the author's reference and is not parsed at runtime; the generator's only check on it is a line-count match, which is unchanged. So the code moves ahead of the sheet without breaking the build, and the sheet follows on a later re-extract.

*Not fixed by this, and carried to Trudi with the Clear All item.* The step reads "Add both a **Fireline** and a **Helitack** while the model is running. Click **Start** to begin!" Clicking Start begins a run, and the run gate tears the coach mark down, so the during-run half leaves the screen at the moment it becomes actionable. `LOGGED-EVENTS.md:85` already documents this for these two tours.

---

### RESOLVED: Should the Restart/Setup complementarity be pinned by a test?
**Context**: The skip's guarantee that a three-step tour collapses to exactly two, never to one, rests entirely on `restartEnabled` and `setupEnabled` being exact complements. Nothing asserts that today. WM-31 and WM-47 both touch this area, and a future change to the control states would silently widen the skip rather than fail a test. The counter-argument is that the terminal-step guard already bounds the damage: the worst case is a tour that opens further along than intended, not one that collapses.
**Options considered**:
- A) Add an invariant test in `simulation.test.ts` asserting `restartEnabled === !setupEnabled` across the state space.
- B) Add a `tour-map.test.ts` invariant that no tour of 3+ steps has two consecutive leading gated steps whose enable predicates can both be false.
- C) Leave it; the terminal guard is sufficient and the invariant is self-evident from two adjacent getters.

**Decision**: **C, but for a stronger reason than the one listed.** The complementarity is not a safety property at all, so there is nothing here worth pinning. It decides only *how many* leading steps get dropped, and dropping more is the correct outcome: a tour whose first two anchors are both dead is precisely the dead end this story removes, and stopping the skip early would restore it. The only property that has to hold is "never drop the terminal step", and that is carried locally by the helper's index bound, proved mutation-visible in this pass (see Technical Notes) and independent of anything in `simulation.ts`. Option A would pin a true statement that nothing depends on, and option B would encode a rule the code deliberately does not follow. The blast radius is also smaller than the question assumes: the four-step tours stop at index 2 anyway, because `terrain-next` is inside the closed Setup panel and `querySelector` returns null. Recorded in Out of Scope.

---

### RESOLVED (now moot): Is the "Click to **Start**" typo worth reporting?
**Context**: the tour then numbered 42/2 had a second step reading "Click to **Start** to run the model!" while its siblings read "Click **Start** to run the model!". Trivial, but the skip promotes this exact line to the opening coach mark for that tour.
**Options considered**:
- A) Report it to Sam with the other content items; do not touch the generated file.
- B) Ignore it.

**Decision**: **A, and it has since been fixed upstream.** Re-enumerating every step-2 text across the current 32 tours on 2026-08-30 finds four occurrences of "Click **Start** to run the model!" (41/2, 44/2, 46/2, 46/4) and zero of the "Click to **Start**" form, so the sheet correction has already reached the app through a re-extract and nothing needs reporting. The reasoning is kept because it still applies to the two near-duplicates below, which have **not** been fixed. Original decision: `tour-data.generated.ts` is a build artifact of the sheet, so the correction has to happen in the sheet and reach the app through a re-extract; hand-editing the generated file would be reverted by the next run. Reporting it costs one line in the content list that already has to go to Sam for the questions above, and the skip promotes this exact string to the opening coach mark, so leaving it is a visible defect rather than a hidden one. The wording itself stays Sam's call. The same enumeration turned up two more near-duplicate pairs worth including in that same list: "Make sure there is a **Spark** in each zone." against "Make sure there is a spark in each zone.", and "Place one **Spark** in Zone 1 and one **Spark** in Zone 2" against "Place one spark in Zone 1 and one spark in Zone 2", differing only in bolding.

## Self-Review

> **Note added in the second pass.** The decisions below were written while the skip read the anchor's rendered `disabled` attribute. That premise was replaced: the skip now reads a per-anchor predicate over model state (see the second pass's first Senior Engineer finding). Where a decision here reasons from `document.querySelector` returning null, the equivalent mechanism is now "the anchor carries no `SATISFIED_BY` predicate"; the conclusions are unchanged. The items are kept as written rather than rewritten, since they are the record of how the shape was reached.

### Senior Engineer

#### RESOLVED: The helper's two collapse guards are redundant, and the spec should say which one is authoritative
Mutation testing showed that removing either the `i < steps.length - 1` bound or the `!step.advanceOn` break leaves every behavioral test green; only removing both collapses a tour. Redundant guards are cheap here, but the requirement "the terminal step is never dropped" currently maps to two mechanisms with no stated owner, and a future reader deleting the "obviously redundant" one has no test to stop them. Either state in the implementation that the `advanceOn` check is the real guarantee and the index bound is a cheap belt-and-braces, or drop one and let the remaining test carry it.

**Decision**: the premise was wrong, and the corrected answer inverts the finding's suggestion. The guards are not redundant and neither should be dropped: the **index bound** is the collapse-to-zero guarantee and the `!step.advanceOn` break is a separate rule ("only click-gated steps are droppable"). The earlier mutation result was an artifact of testing through `buildTour`, which can never emit a terminal step carrying `advanceOn` (`build-tour.ts:56`), so the two guards always fired together on real input. Driving the exported helper with synthetic arrays separates them, and each mutation then fails exactly one case: widening the bound to `i < steps.length` collapses a two-step all-gated, all-disabled array to zero, and removing the `advanceOn` break drops a leading step that carries a `target` but no `advanceOn`. A third pass corrected the second case: it had been written with a **viewport** step, which the `!step.target` break catches first, so as written it could not fail. See Technical Notes for the corrected shape and for the 512-combination sweep showing the break is unreachable through `buildTour`. The implementation states that the index bound owns the collapse guarantee, and both cases are named in the Requirements' test bullet.

---

#### RESOLVED: `dropSatisfiedLeadingSteps` reads the DOM from inside a MobX effect and is not exported
It runs `document.querySelector` at open time inside the `showHazbotFeedback` effect, which is the right moment but couples tour construction to render timing: a control that has not yet flushed its `disabled` prop will read as clickable and the step will not be skipped. In practice the open path already waits on the 400ms scale-up fallback, so this is unlikely, but it is untested. The helper is also module-private, so every test has to drive it through the full component. `parseFeedback` in the same file is exported for exactly this reason.

**Decision**: **export it**, and treat the timing half as moot. The export follows `parseFeedback`'s precedent in the same file and is what makes the guard tests above possible at all, so it is a requirement rather than a nicety. On timing: `dropSatisfiedLeadingSteps` does not run in the effect body. It runs inside `openTour`, which is called from the intro engine's `onDestroyed` when the student activates "Show me", so the read happens after the intro has waited out the avatar scale-up (`transitionend` with a 400ms fallback) and after two separate user clicks. Any state change that disabled an anchor was committed and painted long before. There is no unflushed-prop window on this path, so there is nothing to test for.

---

#### RESOLVED: Skipping is unconditional, with no upper bound on how many steps it will drop
The loop drops consecutive leading gated-and-disabled steps with no limit. Today the Restart/Setup complementarity bounds it at one, but that invariant is unpinned (see the open question) and lives in a different file. If a future control change made two leading anchors disabled at once, a three-step tour would open on its terminal step with no warning and no test failure. A hard cap, or an assertion that at most one leading step is ever dropped, would make the blast radius explicit.

**Decision**: **no cap.** The unbounded behavior is the correct one: if two leading anchors were ever dead at once, a tour gated on them is exactly the dead end this story exists to remove, and a cap would leave the student stuck on the second dead button instead of the first. "Opens on its terminal step" is the intended degradation, not a failure, and it is already the hard floor via the index bound. The blast radius is additionally bounded in practice by the absent-anchor break: the four-step tours (24/2, 24/3, 24/4) anchor `terrain-next` inside the closed Setup panel, so `querySelector` returns null and the loop stops at index 2 whatever the enable states are. Recorded as a Requirement and in Out of Scope.

---

### QA Engineer

#### RESOLVED: The requirement list has no acceptance criterion for the first-open path on a reload-first tour
The requirements and the prototype's live verification both cover "first open unchanged" on 23/2 (Restart). The Clear All first tours (41/2, 44/2, 46/2, then numbered 42/2, 45/2, 47/2) are only verified for the *reopen* case. `reloadEnabled = setupChanged || sparks.length > 0` is not the complement of anything, so its first-open state is reached differently from Restart's and deserves its own case: after a run with sparks placed, Clear All is enabled and nothing should be skipped.

**Decision**: accepted; a Requirement and a named test case were added for it. The state reasoning holds: a student only reaches one of those categories by running a model, which requires `ready === dataReady && sparks.length > 0` (`simulation.ts:78`), so `sparks.length > 0` and therefore `reloadEnabled` are true at first open and nothing is dropped. The prototype's 2026-08-07 live run covered the reopen but not this direction.

---

#### RESOLVED: No stated criterion for what the student sees when a skip happens mid-session more than once
A student can dismiss and reopen repeatedly. Each reopen re-evaluates the skip against live state, so the tour can open at a different step each time, and after completing the second step the third reopen may show only the terminal. Nothing in the requirements says whether that is intended (it follows from the design) or whether a tour that has been fully satisfied should still open at its terminal step rather than not opening at all.

**Decision**: the behavior is intended, and the specific worry does not arise, so the fix is to say what the rule is rather than to change anything. The skip is a **dead-anchor** skip, not a progress tracker: it re-reads live `disabled` state at every open and never drops a step whose anchor is still clickable, even one the student has already performed. Concretely, opening the Setup panel does not disable Setup (`setupEnabled === !simulationStarted`, `simulation.ts:154`, unchanged by opening the panel), so the second and third reopens show the *same* "Click the **Setup** button." coach mark rather than advancing to the terminal. The "fully satisfied tour" case cannot occur either, because the index bound always keeps the terminal step, so there is never a tour with nothing to open. Added as a Requirement.

---

#### RESOLVED: The one failing assertion is described as a test update, but it is the only coverage of the log payload
`hazbot-button.test.tsx:396` asserts the payload by exact match, which is what makes it fail. Updating it to include `skippedSteps: 0` restores green but leaves the *non-zero* case uncovered unless the new tests assert it explicitly. The throwaway run covered it (case H); the requirement should name it so it is not dropped as "already covered by the updated assertion".

**Decision**: accepted verbatim. The Requirements' test bullet now names the non-zero `skippedSteps` payload as its own case and says explicitly that updating the existing exact-match assertion does not cover it. The risk is real precisely because the existing test sees `skippedSteps: 0` for a structural reason rather than a behavioral one: `HazbotButton` renders alone in that suite, so no anchor is in the document, `querySelector` returns null and the loop breaks at index 0 regardless of what the helper does.

---

### Product Manager

#### RESOLVED: The renumbering decision is recorded as a mechanism, not as a product choice
"Step 1 of 2" on a reopened three-step tour is a deliberate choice over "Step 2 of 3", justified by the case of a student who restarted on their own and then opened Hazbot for the first time, who would otherwise be told they are on step 2 of something they never started. That reasoning is sound but has not been put to Trudi, and it changes what a student sees.

**Findings:** the sheet authors the numbering and the build validates it. `arrowText` carries a trailing "(Step n of N)" on every line, parsed by `STEPNUM_RE` (`scripts/tour-data-impl.js:21`), checked against both the line's position and the declared total (a mismatch fails the build), then stripped; the library re-renders it from `progressText`. `tour-map.test.ts:22` pins each factory's arity to the parsed `stepCount`, so today what the student sees and what the sheet authors cannot disagree. The skip is the first thing that separates them. Authored-coordinate numbering would need a `progressOffset` option in coachmarks (about six lines feeding `popover.tsx:750-753`), since the engine builds the line from the driven array alone and exposes no offset or explicit-total option.

**Decision**: **driven numbering.** The fraction counts the steps actually shown, so a three-step tour reopened after Restart reads "Step 1 of 2". No `progressOffset` is added and no library change is needed for this. The consequence is that `showProgress` is conditional on `steps.length > 1`: with driven numbering a two-step tour that drops its opener would otherwise render "Step 1 of 1", and 13 of the 32 tours are two steps. The sheet's "(Step n of N)" annotations become authoring bookkeeping rather than a description of what is rendered.

**Sheet impact: none.** The worry was that a promoted line would read as a continuation of a step the student never saw. Scanned across all 32 tours: **zero** lines at index 1 or deeper open with a connective ("First", "Then", "Now", "Next", "Also", "And"). All 29 leading connectives sit on index 0, the step the skip drops. The lines containing "then" and "again" use them intra-sentence, referring to the action in the same line, and read correctly as an opener. This is already clean because an earlier re-extract removed the "Now" prefixes that were the real symptom.

---

#### RESOLVED: The story's value depends on how often students actually reopen, and nobody has looked
The dead end requires a dismiss followed by a reopen. `HazbotShowMeClicked` and the dismissal events are already logged, so the frequency of reopen-after-first-step is answerable from existing data. Not a blocker, but it would settle whether the mid-tour case is worth a second ticket now or later, which is the first open question.

**Findings:** the data exists and the query shape is concrete, so this is a decision about whether to spend the time rather than about whether it is possible. The three tour events shipped in `v1.5.0` (2026-06-29, which contains the WM-17 merge `f31e1ac`), so there is roughly eight weeks of series. The dead end corresponds to a session with two or more `HazbotShowMeClicked` events carrying the same `(ruleSetId, categoryId)`, where the first is followed by a `HazbotTourDismissed` with `lastStepIndex: 0`; the reopen after that is the stuck one. `HazbotButtonClicked` bounds the denominator.

**Decision**: **do not run it.** The dead end is a correctness defect with a reproduction, not a feature whose value has to be argued from usage, so a frequency number cannot change whether it is fixed. It was also going to be used to decide whether the mid-tour case deserved its own ticket, and that decision has since been made on other grounds (see the first open question). Recorded here so the query shape is not lost if someone wants it later for a different purpose.

---

### Student

#### RESOLVED: A tour that silently opens further along gives no sense of what was skipped
From the student's side, dismissing and reopening produces a *different* coach mark than the one they dismissed, with no acknowledgment that the first step was already done. That is better than being stuck, but "Step 1 of 2" on a tour that was "Step 1 of 3" a moment ago reads as though the guidance changed rather than advanced. Worth deciding whether the promoted step needs any acknowledgment ("Nice, you already restarted") or whether the silence is preferable.

**Findings:** the surface this touches is smaller and more uniform than it looks, which makes an acknowledgment cheaper than expected if Trudi wants one. Across all 32 tours the promoted opener is one of only eight distinct strings, and a single one of them, "Click the **Setup** button.", covers 19 of the 32 tours; the remaining seven cover one to four tours each (full list in Technical Notes). None of the eight currently acknowledges a prior step, and none of them reads as broken on its own, since the "Now" prefixes that would have jarred were removed by the WM-51 re-extract. So the realistic options are silence (nothing to build), or one acknowledgment line that would land correctly on 19 of 32 tours from a single edit.

**Decision**: **silence.** Walked live on 23/2 with the skip patched in as a throwaway (since reverted): the first open reads "First, **Restart** your model. / Step 1 of 3" with Restart live, and after a dismiss, a Restart and a reopen it reads "Click the **Setup** button. / Step 1 of 2" with the ring on Setup. Screenshots at `tmp/playwright/wm32-before-first-open-step1of3.png` and `wm32-after-reopen-step1of2.png`.

The skip is not silent, it is just not narrated: the **grayed Restart is visible in the same bottom bar**, three controls along from the ringed Setup, so the student can see that the step they were previously asked to do is now unavailable. That signal is more reliable than a sentence, because it reflects live state rather than an assumption about what the student did.

An acknowledgment line was rejected on two grounds. It restates what the control state already shows, and it is only correct when a step was actually skipped, so the same authored string would be wrong on a first open where nothing is dropped. An app-side prefix keyed on `skippedSteps > 0` was rejected more firmly: it would have to compose grammatically with all eight promotable openers, and it puts student-facing prose in the app rather than the sheet, which is Sam's and Trudi's to own. Worth mentioning to Trudi with the other content items in case she disagrees.

---

#### RESOLVED: The single-bubble case loses the only signal that a sequence is in progress
When a two-step tour collapses to one step, the progress text is suppressed and the coach mark becomes indistinguishable from the non-coaching intro popover, which is also a lone bubble with a single button. A student who asked for a walk-through gets what looks like a one-off remark. The suppression is right (there is no "Step 1 of 1"), but the resulting bubble may want to keep something that marks it as the tour rather than the intro.

**Findings:** "indistinguishable" is not accurate, and the four differences are structural rather than incidental. The tour engine leaves `showOutlineRing` and `showAvatar` at their library defaults, both `true` (`dist/index.js:82`, `:897`), while the intro sets both to `false` explicitly. So a collapsed one-step tour bubble draws the outline ring around a bottom-bar control, shows the Hazbot avatar badge, sits at `popoverOffset: 27` from that control, and carries the tour's `doneLabel` ("Got it!"); the intro draws no ring and no badge, sits at `popoverOffset: 25` from the robot itself, and carries the category's bracket token ("Show me" / "Okay" / "Hooray!"). Whether that is *enough* signal is still a design call, but it is a call about adding to four existing differences rather than about a bubble with none. Evidence here is read from the engine options and the pinned library, not from a screenshot.

**Decision**: **no change.** Four structural differences is enough to tell the two apart, and the alternative is inventing a new affordance for a case that arises only on the 13 two-step tours after a skip. The related cost, that the progress line is suppressed in exactly this case, is a consequence of the driven-numbering decision above and is accepted with it.

---

### Education Material Developer

#### RESOLVED: The fix makes the sheet's authored step order silently divergent from what students see
The sheet authors a linear sequence; the app now drives a suffix of it, chosen at runtime. Nothing in the sheet indicates which lines can become an opener, so an author revising "Click the **Setup** button." has no way to know it is sometimes the first thing a student reads. Whether that warrants a note in the sheet, a column, or nothing at all is a content-workflow decision.

**Findings:** the affected surface was enumerated, and it is 32 tours mapping to **eight** distinct lines rather than the three this finding assumed (the full list is in Technical Notes; "Click the **Setup** button." alone accounts for 19 tours). Two things narrow the decision. First, the divergence is bounded to step 1: no tour can promote a step past index 1 at open time, because the only deeper leading anchor is `terrain-next`, which lives inside the closed Setup panel and is therefore never resolvable at open time. So a sheet-side marker would only ever need to mark the second line of a tour, never an arbitrary one. Second, the eight lines already read as standalone instructions, since the WM-51 re-extract removed the "Now" prefixes that were the concrete symptom. So this is a question about protecting future authoring rather than about repairing anything today.

**Decision**: **add a guard test**, and document the convention in `docs/hazbot-update-workflow.md`. Nothing needs repairing now: scanned across all 32 tours, zero lines at index 1 or deeper open with a connective, and all 29 leading connectives sit on index 0, the step the skip drops. What is unprotected is the future, because `tour-data.generated.ts` is regenerated from the sheet and a re-extract that reintroduced "Now, click the **Setup** button." would ship silently.

The test asserts that no step after the first opens with a leading connective, over a tight word list. Prototyped both ways before being specced: it passes on today's sheet, and with a "Now" prefix injected onto 23/2's second step it fails and names the offender (`23/2 step 2: "Now click the **Setup** button."`). So it can fail, and its failure is actionable. This is a different case from the "First, ..." convention declined above, which the implementation genuinely never reads; this one guards a property the skip depends on. A word list is blunt and could false-positive on a legitimate future opener, so the failure message says to look rather than asserting the line is wrong.

---

#### RESOLVED: The "First, ..." convention is now load-bearing and undocumented
The fix relies on "First, **Restart** your model" only ever appearing where it genuinely is first, which holds today because that line is only ever authored at index 0. If a future tour authored "First, ..." at a later index, or dropped the leading step entirely, the promoted opener would read wrongly and no test would catch it. The convention should be written down wherever the sheet's authoring rules live.

**Decision**: the premise does not hold, and the residue belongs to the finding above rather than here. Two checks across all 32 tours settle it. The convention is already not uniform: 25/2, 25/3 and 25/4 author their opener as "**Restart** your model first." rather than "First, **Restart** your model.", so a written rule phrased around the "First," prefix would be false on the day it was written. And the code does not rely on the prefix in any form: `dropSatisfiedLeadingSteps` reads the anchor's rendered `disabled` state and never inspects step text, so no wording, present or future, can widen or narrow the skip. (For completeness, no tour carries a "First," line at any index above 0 today.) What remains true is that authors cannot tell which lines can be promoted to openers, and that is the content-workflow question in the finding above; it is tracked there rather than duplicated as a convention to document. No test is added, because a test pinning a prose convention the implementation does not read would be decoration.

---

## Self-Review (second pass, 2026-08-30)

Every finding below was verified against the tree before it was written: by reading the
implicated code, by a throwaway Jest probe that applied the specced change and ran the
suite, or by a throwaway test driving the real `BottomBar`. Probes have been reverted; the
tree is back to spec-only and `npx jest` is 1022 of 1022 across 82 suites.

### Senior Engineer

#### RESOLVED: The stated test cost is wrong once the in-scope WM-46 regression fix is counted
Technical Notes says "The one assertion the slice breaks is `hazbot-button.test.tsx:396` ... That is the whole test cost", and the Requirements' test bullet names only that assertion. That is true of the **skip slice alone**: with the helper, the call-site change and `showProgress: steps.length > 1` applied as a probe, `hazbot-button.test.tsx` reported 1 failed of 48, at `:396`, exactly as claimed.

It stops being true once question 3's decision is applied. Adding the `resetHazbotFeedback()` gating and the `tourActive` move to the UI store takes the same suite to **3 failed of 48**. The two extra failures are pre-existing tests that assert the behavior the fix deliberately removes:

- `:863` "never shows the tour's click-blocking faded state while the panel is closed", which drives `resetHazbotFeedback()` with a tour running and asserts `.noHazbot` is gone.
- `:879` "reopening after a Clear All never commits .noHazbot either", the same route asserted across the reopen.

Both are correct to fail: with the fix the tour survives Clear All, so `.noHazbot` legitimately stays. But they are existing coverage of a contract this story reverses, and the spec neither names them nor says what replaces them. WM-46's own guarantee is unaffected: "cancels a deferred open when a reset lands before the popover appears" (`:615`) stayed green under the probe, which is the claim question 3 rests on.

Suggested resolution: correct the Technical Notes sentence to give the real figure, and add the two rewrites to the Requirements' test bullet, saying what each should assert instead (a driving tour keeps `.noHazbot` through a reset; a reopen after a *completed* tour still never commits it).


**Decision**: accepted as written. Technical Notes now carries both measured figures (1 of 48 for the slice, 3 of 48 with the regression fix) and names the two extra failures; the Requirements' test bullet now says what `:863` and `:879` assert instead, and that `:615` stays. The fix is right and the tests are stale, not the reverse.

---

#### RESOLVED: The skip's rule treats a transiently unavailable anchor as a satisfied one, and no requirement covers it
The spec's rule is "the anchor's rendered disabled state" (Requirements bullet 2), justified as covering any self-disabling control with no button names to maintain. That holds for `restart-button`, whose only disable term is `!restartEnabled === !simulationStarted`. It does not hold for `clear-all-button`, the other leading anchor, which is `disabled={!simulation.reloadEnabled || ui.showTerrainUI}` (`bottom-bar.tsx:147`). The second term is a transient view state with nothing to do with whether the student cleared anything.

Verified with a throwaway test rendering the real `BottomBar`: with `sparks.length > 0`, `simulationStarted === false` and `ui.showTerrainUI === true` (the post-Restart, Setup-panel-open state this spec already walked live at question 1), `reloadEnabled` is **true** yet `clear-all-button` reads `disabled`. Running `dropSatisfiedLeadingSteps` over the real 41/2 tour in that state drops step 1 and drives a single step, whose target is `start-button`, which the same `ui.showTerrainUI` term also renders disabled. So the tour opens on a dead terminal with the Clear All instruction gone.

This is the same mechanism question 1 identified, but at open time rather than mid-tour, and the mitigation recorded there does not carry over: mid-tour the step is restored when the panel closes, whereas the skip's drop is committed for the whole of that open. Closing the panel does not bring the step back. It affects the three Clear All tours (41/2, 44/2, 46/2).

Suggested resolution: decide the rule and state it as a requirement. The cheapest shape that keeps the "no button names" property is to skip only when no modal/panel view state is suppressing the bar (`!ui.showTerrainUI`), which is one term and is already the condition under which the tour is worth driving at all. Whatever is chosen needs a Requirements bullet and a test case, because nothing today distinguishes the two causes of `disabled`.


**Decision**: read model state, not rendered state, and let the library's Continue affordance carry the transient case.

The option of accepting the drop and documenting it was rejected once the walk was written out concretely on 41/2. In the divergent state (run with a changed setting, then Restart, then Setup, then Hazbot, then [Show me]) accepting it shows a lone bubble reading "Click **Start** to run the model!" ringing a grayed Start, with the Clear All instruction the student actually needed never shown, recoverable only by a dismiss and reopen. Reading model state shows the authored tour unchanged, which is today's behavior and the correct one.

The counter-argument, that this leaves the student on a gated step whose anchor is grayed, is what the ticket itself proposed the Continue button for: *"we either allow this click again ... or add a 'continue' button in the coach mark for this case"*. The two changes are complementary rather than alternatives. The skip removes steps the student has genuinely completed; Continue removes the dead end from a step they have not. Neither alone answers the ticket's *"I don't see coach marks past this point"* in every state.

*Shape.* A `Partial<Record<AnchorTestId, (sim: SimulationModel) => boolean>>` with two entries, each referencing the getter that owns the control's state, so there is one source of truth rather than a re-derivation. The helper takes the `SimulationModel`, matches the step's `target` selector back to its testid, and drops only while a registered predicate says satisfied. It never touches the document, which removes the DOM read, the `aria-disabled` branch, the absent-anchor rule and the anchor-injection scaffolding in one go.

*Verified.* Confirmed against the tree that the transient term reaches exactly one droppable anchor. Rendering the real `BottomBar` and diffing every control's `disabled` with `ui.showTerrainUI` off versus on, holding all else fixed, flips exactly `clear-all-button` and `spark-button`; `spark-button` is only ever a terminal step. Enumerating `tourMap` across both conditional branches gives the complete droppable set as `restart-button` (index 0, 29 tours), `clear-all-button` (index 0, 3 tours), `terrain-button` (index 1, 19 tours) and `terrain-next` (index 2, 3 tours), which is what bounds the predicate map at two entries. Confirmed too that the pinned library renders no overlay or scrim (`dist/styles/base.css` defines popover, ring and arrow classes only, ring and arrow both `pointer-events: none`), so the page stays interactive under a coach mark and the transient state is escapable, though not in a way any student would discover.

*The criterion this forces.* The affordance must render whenever the anchor is un-clickable, at step entry as well as on mutation. The at-entry case is the one this decision creates and a mutation-only watcher would miss it. Carried as a Requirement.

---

#### RESOLVED: Out of Scope still excludes the library change that question 1 resolved into scope
Out of Scope's first entry says the mid-tour dead end "cannot be reached" by the skip, that the case "needs a fresh repro before it is filed", and that its fix "is a change to `@concord-consortium/coachmarks`. See the first open question." Question 1 resolves to **B**: "Both changes ship under WM-32", and implementation.md's build order opens with publishing `0.0.1-pre.10`. The two sections say opposite things about the single largest deliverable in the story, and Out of Scope is the section a reader checks first.

Suggested resolution: rewrite the Out of Scope entry to say the mid-tour dead end is in scope via the library change, and move only the residual content half (the unfollowable Start instruction) to the out-of-scope list.


**Decision**: accepted. The Out of Scope entry now states that the mid-tour dead end is in scope via the library's Continue affordance, and keeps out only the residual content defect. The skip's transient-suppression decision gives that affordance a second, at-entry case to cover, so the two sections now agree on both what it is for and why it ships here.

---

#### RESOLVED: Two internal cross-references point at the wrong lines
Requirements bullet 3 and the QA finding at the same claim both cite `setupEnabled` as `simulation.ts:146`; it is at `:154`, which the Technical Notes' drift list states correctly. The Self-Review's third QA finding cites the exact-match log assertion as `hazbot-button.test.tsx:364`; it is at `:396`, which the Requirements bullet and Technical Notes both state correctly. Both are the same value recorded in two places and disagreeing, which is the class of thing reviewers here flag.

Suggested resolution: fix both to the verified values, or drop the line numbers from the prose sites and keep them only where the drift list records them.


**Decision**: accepted. `simulation.ts:146` corrected to `:154` at both sites, and `hazbot-button.test.tsx:364` corrected to `:396`. Both verified against the tree.

---

### QA Engineer

#### RESOLVED: The Requirements section covers one of the story's five deliverables
implementation.md's build order ships: the coachmarks `pre.10` Continue affordance plus the repin; the skip; the WM-46 regression fix; the Fireline ring move; and two documentation changes. The Requirements section covers only the skip, its logging and the `LOGGED-EVENTS.md` rows. There is no requirement, and therefore no acceptance criterion, for:

- the library's reactive Continue affordance (behavior, when it appears, when it does not) or the repin,
- `resetHazbotFeedback()` no longer tearing down a driving tour,
- the ring on 44/3 and 46/3 moving to Start,
- the authoring convention added to `docs/hazbot-update-workflow.md` and the guard test that enforces it.

The three that live only inside resolved-question Decisions are the ones most likely to be dropped or built differently, because a reader working from the Requirements list would not know they are in the story at all. This also explains the previous finding's shape: the test-cost sentence was written against the skip alone because the skip is all the Requirements section describes.

Suggested resolution: add one testable bullet per deliverable. The Decisions stay as the rationale; the Requirements list becomes the checklist.


**Decision**: accepted. The Requirements section is now grouped by deliverable, with testable bullets for the library change and its publish/repin, the WM-46 regression fix and the `tourActive` move, the Fireline ring move, and the authoring convention plus its guard test. The Decisions stay as the rationale; the Requirements list is the checklist.

---

#### RESOLVED: The docs bullet names three `LOGGED-EVENTS.md` rows; the resolved decision says four
Requirements bullet 11 lists `HazbotShowMeClicked`, `HazbotTourCompleted` and `HazbotTourDismissed`. Question 2's decision closes with "because WM-31 landed first, WM-32 writes all four event names into the coordinate-system note, not three", and implementation.md's Documentation section lists four, `HazbotCoachMarkHiddenByRun` included. That fourth row (`LOGGED-EVENTS.md:85`) is the one whose prose spells the derivation out at length, so it is the one most exposed to the coordinate change.

Suggested resolution: make the Requirements bullet name all four.


**Decision**: accepted, and merged with the invalidated-prose finding below into one documentation bullet. The bullet now names all four rows and adds `CLAUDE.md:83`/`:144` and `tour-map.tsx:19`.

---

#### RESOLVED: Two pieces of prose the change invalidates are not on the update list
The spec's documentation scope is `LOGGED-EVENTS.md` plus the workflow doc. Two other places state contracts this story reverses:

- `CLAUDE.md:83` documents the debug hook as "`window.test.resetHazbotFeedbackLevels()` // clear every category's Hazbot feedback level ... also closes an open Hazbot popover (WM-46)". That hook routes through `resetHazbotFeedback()` (`stores.ts:72`), so after the gating it no longer closes an open **tour**. `CLAUDE.md:144` describes the same behavior a second time.
- `tour-map.tsx:19`, in the file-level header, states the Fireline rule: "44/3 and 46/3 ring the Fireline button only (not Fireline + Helitack + Start)". implementation.md names the two per-entry comments at `:128` and `:133` but not this one, so the change would leave the file's own header contradicting the map below it.

Suggested resolution: add both to the documentation deliverable.


**Decision**: accepted; folded into the same Requirements documentation bullet as the finding above.

---

### Product Manager

#### RESOLVED: The library publish is committed to on a case the spec itself describes as transient
Question 1 resolves to shipping the coachmarks change under WM-32. Its two supporting reasons have both since been withdrawn inside the same document. The progress-offset option was named as the other thing that publish would carry; the PM decision below then chose driven numbering, so it is not needed. And the severity re-derivation records that the permanent mid-tour dead end is gone (a run now tears the coach mark down), leaving one case: index 0 of the three Clear All tours, where "closing the Setup panel re-enables it and the tour is live again ... the state is temporary and self-healing".

I confirmed the library facts that make the change buildable: `isLaidOut` (`dist/index.js:21`) checks only connectedness, `offsetParent` and rect, so a disabled button passes and `onTargetLost` never fires; `useTargetWatcher` observes with `attributes: true`, so the `disabled` mutation does reach it; and `showNext` at `:747` is the engine-global predicate that would have to change. So the change is real work in a second repo, gated by a publish and a repin, and the standing constraint blocks pushing wildfire until it lands. What is missing is the case for spending it now: a self-healing transient on three tours, with no repro recorded in the spec and no acceptance criterion.

Note that the finding above sharpens this rather than softening it. The non-healing version of that same `ui.showTerrainUI` term is the open-time skip, which is app-side and needs no library change at all.

Suggested resolution: reconsider B against A. If B stands, record the repro and the acceptance criteria for the Continue affordance so the library work is specified rather than implied; if it moves to A, the skip ships without a cross-repo dependency and the branch can go up immediately.


**Decision**: withdrawn, and the finding was wrong in its premise rather than merely overtaken.

It argued from the surviving mid-tour case alone, which is thin: three tours, one transient state, escapable by closing a panel. Reading the ticket back settles it the other way. The description asks for exactly this affordance (*"or add a 'continue' button in the coach mark for this case"*) against exactly this symptom (*"I don't see coach marks past this point"*), and the skip alone does not answer that symptom in every state. The resolution of the transient-anchor finding above then gives the affordance a second and more important job: the skip deliberately keeps a suppressed-but-unsatisfied step, so that step is entered with a dead anchor, and Continue is what stops it being a dead end. Without the library change, that decision would not be safe to make.

The finding's supporting observation stands and is kept: the progress-offset option is not needed, so the Continue affordance is the only thing `0.0.1-pre.10` carries. Question 1's decision **B** is unchanged.

---

### Education Researcher

#### RESOLVED: The payload-semantics change gets no `appRulesVersion` boundary, unlike every prior one
`LOGGED-EVENTS.md` dates every previous change of this kind to a version: rule-set ids renumbered at 8 (`:87`), `categoryId` meaning at 6 (`:104`), `feedbackLevel` monotonicity at 7 (`:121`), the click-versus-shown relationship at 7 (`:136`). WM-32 redefines `stepCount` and `lastStepIndex` from authored to driven coordinates and adds `skippedSteps`, and neither the Requirements bullet nor implementation.md's Documentation section names a boundary. A researcher joining the roughly eight weeks of existing series has nothing dated to split on; in practice the discriminator is the presence of `skippedSteps`, which works but is written down nowhere.

Whether `APP_RULES_VERSION` itself should move is a real question rather than a formality. The policy in `docs/hazbot-update-workflow.md:208-210` is scoped to which *string* a session is shown, so a literal reading says no. But this story does change what a student sees for a given history in two ways: a re-opened tour opens on a different coach mark, and the WM-46 fix makes step 2 of the three Clear All tours reachable for the first time. `APP_RULES_VERSION` is currently 8.

Suggested resolution: settle it explicitly rather than by omission. Either bump to 9 and add the boundary section, or keep 8 and document `skippedSteps`-presence as the discriminator in the `HazbotShowMeClicked` row. Either way it belongs in the Requirements' docs bullet.


**Decision**: **do not bump; document the discriminator instead.**

The written policy (`docs/hazbot-update-workflow.md:208-210`) scopes a bump to which category a session resolves to, or which of that category's strings is selected. WM-32 changes neither: same category, same feedback string, different tour steps and different payload coordinates.

Practice agrees, and **WM-31** is the direct precedent. It added a whole new logged event (`HazbotCoachMarkHiddenByRun`), rewrote `LOGGED-EVENTS.md`, and changed what a student sees mid-tour, since a run now destroys an open coach mark. Its PR touched `LOGGED-EVENTS.md`, `hazbot-button.tsx`, `simulation.ts` and the workflow doc, and did not touch `rules-version.ts`; no boundary section was added for it either. Every bump in the file's history (5 to 6 on WM-45's `category_used`, 6 to 7 on WM-46's display-time level, 7 to 8 on WM-54's renumbering, the rest re-extracts) tracks feedback selection.

The stronger reason is that this change is self-dating in a way the four existing boundaries are not. `skippedSteps` is emitted on every `HazbotShowMeClicked` after this release and on none before it, and the driven and authored coordinates **coincide wherever it is `0`**. So a query spanning the boundary is correct without knowing the release date, which is not true of the `categoryId` change at version 6, where a field silently changed meaning and only the version separates the two readings. A sentence in the row buys more than a version marker would.

Raised with Sam in the same handoff as the content items, framed as "we did not bump, here is why", rather than blocked on him.

---

### Education Material Developer

#### RESOLVED: "empty for the shipped presets" is not true of all of them
Technical Notes justifies the unfollowable-Start finding with "`reload()` restores `sparks` to the preset default (`setInputParamsFromConfig`, `simulation.ts:326`, which is empty for the shipped presets)". `src/presets.ts` ships four presets that carry `sparks: [[50000, 50000]]` (`basic`, `basicWithWind`, `slope45deg`, `basicWithSlopeAndWind`); the rest omit the key and fall through to `config.ts:174`'s `sparks: []`. The mechanism is right for every preset a Hazbot activity uses, but on one of those four a Clear All leaves a spark, `ready` holds, and the terminal Start instruction is followable.

This matters only because that sentence is the evidence behind a content item being handed to Trudi. Overstated evidence in a handoff is worth a word change.

Suggested resolution: say "empty for every preset the Hazbot activities use" and name the exception, or drop the parenthetical and cite the activity presets directly.


**Decision**: accepted. The parenthetical now says "empty for every preset the Hazbot activities use" and names the four exceptions.

---
