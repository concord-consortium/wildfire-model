# WM-32: Dismissing Hazbot coach marks can get the sequence stuck on Restart

**Jira**: https://concord-consortium.atlassian.net/browse/WM-32

**Status**: **Closed**

## Overview

Every Hazbot coaching tour opens with "First, **Restart** your model" or "First, click **Clear All** to reset your model", and both controls disable themselves the moment they are used. Re-opening Hazbot rebuilt the tour from step 1, so the student landed on a coach mark anchored to a dead button with no way forward: an intermediate gated step renders no Next button, and `onTargetLost: "close"` does not fire because the button is still mounted and laid out, merely disabled. This story makes a re-opened tour start at the first step the student has not already satisfied.

It affects all 32 coaching tours, and there were three distinct routes into the dead end. Two happen at open time (re-opening after Restart, and after Clear All) and are fixed by the skip. The third, where a step goes dead while the student is sitting on it, is fixed by a Continue affordance added to the shared coach-mark library.

## Requirements

**The skip.**

- When a tour is opened, leading steps whose anchor is already un-clickable are dropped, and the tour is driven from the first step the student has not satisfied. The first-time path is unchanged: nothing is skipped while the first anchor is live.
- "Satisfied" is decided per anchor by a predicate referencing the `simulation.ts` getter that owns that control's enabled state, not by the rendered `disabled` attribute. Two anchors carry a predicate: `restart-button` (`!restartEnabled`) and `clear-all-button` (`!reloadEnabled`). Reading model state is what keeps a control that is merely *suppressed* from counting as *done*: `clear-all-button` is also disabled by `ui.showTerrainUI`, so with the Setup panel open it renders dead while `reloadEnabled` is still true.
- A step whose anchor has no predicate is never dropped. A `tour-map.test.ts` case asserts every anchor the map can emit as a non-terminal step either has a predicate or is a declared omission (`terrain-button`, `terrain-next`), so a new leading anchor fails the build until someone declares what satisfied means for it.
- The skip is a satisfied-step skip, not a progress tracker: re-evaluated from live model state on every open, and a step the student can still act on is never dropped even if they have already performed it.
- The terminal step is never dropped, so a tour can never collapse to zero steps. Carried by the helper's own index bound.
- No cap on how many leading steps may be dropped; a cap would reintroduce the dead end.
- A first open of a Clear All tour (41/2, 44/2, 46/2) drops nothing, since a student only reaches those categories by running a model, which requires a spark.
- Progress text is suppressed when one step remains, so a collapsed tour never reads "Step 1 of 1".
- Step numbering is against the driven array: a three-step tour re-opened after Restart reads "Step 1 of 2".
- All four Hazbot tour events carry `skippedSteps`, so each row reads without a join. `stepCount` and `lastStepIndex` stay in driven coordinates; the authored index is `lastStepIndex + skippedSteps`. `null` for the intro phase on `HazbotCoachMarkHiddenByRun`.
- `LOGGED-EVENTS.md` rows for all four events state which coordinate system each field is in. `APP_RULES_VERSION` is **not** bumped: the presence of `skippedSteps` is itself the release marker, and the coordinates coincide wherever it is `0`.
- Prose the change invalidates is updated in the same PR: `CLAUDE.md:83` and `:144`, and the `tour-map.tsx` file header.

**The library change (`@concord-consortium/coachmarks`).**

- A gated step whose anchor is un-clickable renders a Continue button, so no gated step can be a dead end. Evaluated at step entry as well as on mutation. While the anchor is clickable the step stays gated exactly as before, so the affordance can never skip a step the student could have acted on.
- The signal is reversible and per-step, so it needs its own hook: `useTargetWatcher` cancels the tour under `onTargetLost: "close"` and disconnects after firing, so it cannot report an anchor coming back live.
- The button reads "Continue", set by the app via `nextBtnText`; the library default stays "Next".
- Published as `0.0.1-pre.11` and repinned before the wildfire branch is pushed. `pre.11` also changes how the outline ring follows a moving target, which affects **every** anchored tour step rather than only the gated ones. **Verified on the merged tree** by driving 23/2 and measuring `.coachmarks-outline-ring` against its anchor's rect across five viewport sizes: the anchor moved as much as 343px horizontally and 190px vertically and the two centers stayed identical, off by 0px in both axes each time. Scrolling and opening the graph panel are not cases the app can reach: the bottom bar is fixed, so its anchors do not move under either.

**The WM-46 regression fix.**

- `resetHazbotFeedback()` no longer destroys a **driving** tour. Clear All is the authored first step of the three Clear All tours, so tearing the tour down on that click made their second step unreachable. A **deferred** open (pending inside the avatar's 400ms scale-up, before any tour exists) is still cancelled, which is WM-46's actual guarantee.
- `tourActive` **moves** from `HazbotButton`'s local `useState` into the UI store as `ui.hazbotTourActive`, so the gate has something to read. The panel effect's cleanup clears it, since the store outlives the component.

**The Fireline ring move.**

- 44/3 and 46/3 ring `start-button` rather than `fireline-button`. `fireLineEnabled` requires `simulationStarted` and both tours open on Restart, so the terminal step always rang a disabled control; Start is live there because `restart()` does not clear sparks. Decided by Trudi.

**Authoring.**

- `docs/hazbot-update-workflow.md` records the convention the skip depends on: any step after the first can become a tour's opener, so no step may open with a connective pointing back at one the student never saw. A `tour-map.test.ts` case enforces it over `tourData`.

## Technical Notes

**Tour inventory.** `tour-map.tsx` holds **32** tours (not the 33 the ticket describes): **29** open on `restart-button`, **3** on `clear-all-button` (41/2, 44/2, 46/2). Rulesets were renumbered by a re-extract, so the map is 23, 24, 25, 32, 33, 34, 35, 41, 44, 46; the old 42, 45, 47 and 54 are gone. Counts in the ticket description are stale.

**Eight distinct lines can become an opener.** Across the 32 tours the step-2 texts collapse to eight distinct strings, led by "Click the **Setup** button." (19 tours) and "Click **Start** to run the model!" (4). Every one is reachable as the first thing a student reads after a reopen.

**Only one leading step can be dropped today, incidentally rather than by design.** `setupEnabled` is the exact complement of `restartEnabled`, and every tour of three or more steps has `terrain-button` at index 1, so a three-step tour collapses to exactly two. This is not a safety property: if a future control change made two leading anchors dead at once, dropping both would be correct. The four-step tours (24/2, 24/3, 24/4) are bounded a second way, since `terrain-next` carries no predicate.

**The two guards are not redundant, and each is independently mutation-visible.** The index bound `i < steps.length - 1` is the collapse-to-zero guarantee. The `!step.advanceOn` break is a separate rule, "only click-gated steps are droppable". Neither is reachable through `buildTour` (it stamps `advanceOn` on every non-terminal anchored step, and no tour authors a viewport step anywhere but its terminal): swept over all 32 tours, both `ctx` branches and all 8 reachable model states, removing the `!step.advanceOn` break changes none of the 512 outputs. The break is kept because the exported helper takes `EngineStep[]`, a public library type, so a mid-tour ungated step is inside its contract. Both are therefore pinned by synthetic cases; a case over real tour data could not fail.

**The skip path is unit-testable with no DOM.** Reading model state rather than the DOM removes any need to touch the document, and there is no render-timing question by construction. One consequence: `createStores()` starts with `simulationStarted === false` and no sparks, so **both** predicates read satisfied by default, and cases meaning "nothing done yet" must say so.

**A collapsed single-step coach mark is not the intro popover, in either shape it can take.** Thirteen of the 32 tours collapse to a single step on default post-Restart state. Eight collapse onto an **anchored** terminal, differing from the intro by outline ring, avatar badge, `popoverOffset` and done label. Five collapse onto a **viewport** terminal (25/3, 25/4, and 23/4 / 33/4 / 35/6 in their `sparkZoneCount >= 2` branch), which has no ring, offset or arrow, and differs instead by centered-top placement, badge and label.

**A two-step floor was considered and rejected.** It is coherent only because the Continue affordance exists, and it is worse in every case checked: on 41/2 it puts the student back on a dead Clear All, and on 25/3 it restores "Step 1 of 2" pointing at a dead Restart, which is the complaint the story was filed for.

**Authored-coordinate numbering ("Step 2 of 3") is not available.** The engine renders progress from the driven array with no offset or explicit-total option. Driving the full array and calling `moveTo(1)` trips `isLaidOut`'s zero-rect check and was rejected.

## Out of Scope

- **A cap on how many leading steps the skip may drop.** Dropping every satisfied leading step is the intended behavior.
- **A test pinning the `restartEnabled` / `setupEnabled` complementarity.** It only decides how many steps get dropped, and dropping more is correct, so nothing about the fix's safety rests on it.
- **Reopening `restartEnabled` / `reloadEnabled` semantics.** WM-24 settled the model-control states deliberately.
- **Changing what `buildTour` returns.** The authored array, its guards, `tour-map.test.ts` and `tour-data.generated.ts` stay as they are; the slice happens at the `drive()` call site.
- **The Reload to Clear All rename.** WM-47 landed it. The model getter and method keep their pre-rename names (`reloadEnabled`, `reload()`).
- **Accessibility review**, per the standing scope for this repo.

## Not Yet Implemented

- **The residual mid-tour dead end.** A run now tears the coach mark down (`runInProgress` clears `ui.showHazbotFeedback`), which closes the specific repro this spec named. The general case is not proven gone, since a route that kills an anchor without starting a run would still strand the student, but the repro has to be re-derived before it is filed as its own ticket.
- **Four content items for Trudi**, all out of scope and none blocking. (1) The three Clear All tours' second step is reachable for the first time and its instruction cannot be followed as authored: after a Clear All the student must place sparks before Start enables, and no step says so. (2) On 44/3 and 46/3 the ring moves to Start, but the step still asks for a Fireline and a Helitack, and the run gate removes the coach mark the moment Start is pressed. (3) A reopened tour opens on a later step with no textual acknowledgment; decided as intentional, but she may disagree. (4) Same family as (1) on the spark tours: after a Restart the 13 two-step tours leave a single coach mark, and on several that lone instruction cannot be followed as authored (25/3 still shows both sparks on the map with the Spark button grayed).
- **Two bolding near-duplicates in the sheet**: "Make sure there is a **Spark** in each zone." against "a spark", and "Place one **Spark** in Zone 1..." against "one spark".
- **Trusted publishing for `coachmarks`.** `pre.11` was published from a developer machine using a granular access token with bypass-2FA enabled, which is the token type npm is deprecating. The org already runs OIDC trusted publishing for `accessibility-tools`; adopting it here also raises a convention question, since that repo keeps `0.0.0-development` in `package.json` and stamps the version from the git tag while `coachmarks` commits real versions.

## Decisions

### Does the per-step Continue button ship inside WM-32, or as its own ticket?
Both ship under WM-32. The library is authored in house and deliberately pre-v1, so a `pre.11` publish and repin is routine rather than an outside dependency.

### Does anything read `stepCount` or `lastStepIndex` off the tour events?
No consumer outside `hazbot-button.test.tsx`; no Cypress spec and no script. Already settled in the closed WM-31 spec, which recorded that WM-32 would resolve these to driven coordinates with `skippedSteps` reconciling.

### Who fixes the Clear All tours' unfollowable terminal instruction?
Split by ownership: WM-32 fixes the regression that made the step reachable at all; the content half goes to Trudi.

### Does moving the Fireline ring to Start (44/3, 46/3) belong to WM-32?
Yes. Trudi had already decided it, it lives in `tour-map.tsx` rather than her sheet, and it is what makes the skip's output actionable on those two tours.

### Should the Restart/Setup complementarity be pinned by a test?
No, and for a stronger reason than "it's incidental": it is not a safety property at all. It decides only how many leading steps get dropped, and dropping more is correct.

### Is the "Click to **Start**" typo worth reporting?
Moot. Re-enumerating the current 32 tours finds four occurrences of the correct "Click **Start** to run the model!" and zero of the typo; the sheet was fixed upstream.

### Are the helper's two collapse guards redundant?
No, and the premise was wrong. The index bound is the collapse-to-zero guarantee; `!step.advanceOn` is the separate "only click-gated steps are droppable" rule. Each fails under exactly one mutation, shown by driving the exported helper with synthetic arrays.

### Should `dropSatisfiedLeadingSteps` be exported, and does it have a render-timing problem?
Export it, following `parseFeedback`'s precedent in the same file, since that is what makes the guard tests possible. The timing half is moot once the helper reads MobX state rather than the DOM.

### Should the skip have an upper bound?
No cap. If two leading anchors were ever dead at once, a tour gated on them is exactly the dead end this story removes.

### Is there an acceptance criterion for the first open of a Clear All tour?
Added, with a named test case. A student only reaches those categories by running a model, which requires a spark, so `reloadEnabled` is true at first open.

### What does the student see when a skip happens more than once in a session?
The behavior is intended and the worry does not arise: the skip re-reads live state at every open and never drops a step the student can still act on. Stated as a Requirement rather than changed.

### Is updating the existing exact-match log assertion enough coverage?
No. The non-zero `skippedSteps` payload is its own case, because the existing test sees `skippedSteps: 0` and cannot fail on the counting logic.

### Driven or authored step numbering?
Driven. A three-step tour reopened after Restart reads "Step 1 of 2". No `progressOffset` and no library change; the consequence is that `showProgress` becomes conditional so a collapsed tour never reads "Step 1 of 1".

### Should usage data be gathered on how often students reopen?
No. The dead end is a correctness defect with a reproduction, not a feature whose value has to be argued from usage.

### Should a reopened tour acknowledge what it skipped?
Silence. Verified live: the grayed control carries the signal, and adding text would need new authored content for all 32 tours.

### Does the single-bubble case lose the signal that a sequence is in progress?
No change. The collapsed coach mark is structurally distinct from the intro popover in both shapes it can take, and inventing a new affordance for the 13 two-step tours is not warranted.

### Does the skip make the sheet's authored order diverge from what students see?
Add a guard test and document the convention. Nothing needs repairing now: zero lines at index 1 or deeper open with a connective, and all 29 leading connectives sit on index 0.

### Is the "First, ..." convention load-bearing?
No. It is already not uniform (25/2, 25/3, 25/4 author "**Restart** your model first."), and the skip never reads step text.

### Is the stated test cost right once the WM-46 fix is counted?
Corrected: 1 of 48 for the skip slice alone, 3 of 48 with the regression fix, and the two extra failures named. WM-46's own guarantee stays green.

### How should a transiently unavailable anchor be treated?
Read model state, not rendered state, so a control the Setup panel is suppressing is not counted as done, and let the library's Continue affordance carry the transient case.

### Should `appRulesVersion` be bumped for the payload change?
No. Document the discriminator instead: the presence of `skippedSteps` is itself the release marker, and the two coordinate systems coincide wherever it is `0`, so a query spanning the boundary needs no release date.

### Can the transient-suppression test fail on the line that names it?
Not as first written. Drive it through `<BottomBar />` so a DOM-reading reimplementation genuinely fails it: with `sparks.length > 0` and `ui.showTerrainUI = true` the rendered button really is disabled while `reloadEnabled` stays true. The cost is a `BottomBar` import in a focused unit-test file, which is the price of the assertion being able to fail.

### The progress-suppression case asserted a tautology
`expect(driven.length > 1).toBe(false)` beside `toHaveLength(1)` re-types the production expression instead of observing it. Replaced by asserting `engines[1].opts.showProgress` through the component.

### A terminal-step case duplicated the one above it
Deleted; its one distinct assertion (the two-steps-remain progress counterpart) moved into the preceding case, where the state that produces it already exists.

### `LOGGED-EVENTS.md:85` states a fact the ring move makes false
Rewritten rather than checked. All six tours are now separated by what their step *asks for* rather than what it is anchored to, which is the guidance the row already gave and which the ring move makes literally true.

### Does the intro-vs-collapsed argument hold for viewport terminals?
Not as written. Anchored terminals differ by ring, badge, offset and label; viewport terminals have no ring, offset or arrow and differ instead by centered-top placement, badge and label.

### Moving `tourActive` into the store loses unmount scoping
Add `ui.hazbotTourActive = false` to the effect's cleanup. It is a no-op on every dep-change route, since the effect's next run clears it anyway, so only an unmount reaches it, and only an unmount case can test it.

### The `:863` rewrite would drop a permanent-brick guarantee
Have the rewritten case carry both halves: the driving tour survives `resetHazbotFeedback()`, and after its own `onDestroyed` the `.noHazbot` class is gone and the button is not disabled.

### Should `skippedSteps` ride only on `HazbotShowMeClicked`?
No. Carry it on all four events, typed `number | null`, following the rule the `HazbotCoachMarkHiddenByRun` row already states for `feedbackLevel` ("repeated here so the row reads without a join"). A session whose `HazbotShowMeClicked` is missing would otherwise leave `lastStepIndex` uninterpretable with no signal that it is wrong.
