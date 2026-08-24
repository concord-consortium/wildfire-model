# WM-31: Disable Hazbot while the model is running

**Jira**: https://concord-consortium.atlassian.net/browse/WM-31
**Repo**: https://github.com/concord-consortium/wildfire-model
**Implementation Spec**: [implementation.md](implementation.md)
**Status**: **In Development**

## Overview

Hazbot analyzes the student's runs, but nothing stops a student from clicking it while the fire is actively burning, so it answers about a model that is changing underneath the answer. This story disables the Hazbot button while the model is actively running, at 35% opacity with its blink cycle paused, and tears down any coach mark that is open when the run starts.

## Project Owner Overview

Hazbot's feedback is about what a run produced. Today the button stays live while the fire is still burning, so a student can ask for an analysis of a model that has not finished, and can leave a coach mark sitting on screen while the simulation changes underneath it. Trudi's policy is that Hazbot waits: it can be clicked any time the model is not running, including while paused, and once the fire is done burning it can be clicked as many times as the student likes.

This story implements that policy. During a run the button is visibly unavailable rather than silently unhelpful, using the standard 35% disabled treatment the rest of the bottom bar already uses, and the robot stops blinking so it reads as asleep rather than idle. If a coach mark is open when the student presses Start, it closes and Hazbot returns to its small default appearance. Nothing brings that coach mark back on its own; the student reopens Hazbot when the run ends.

## Background

Nothing in the app reads the running state for the Hazbot button today. `hazbot-button.tsx` renders a plain MUI `Button` with no `disabled` prop, and the only run-aware behavior is the pulse halo, whose predicate already includes `!simulation.simulationRunning` (`hazbot-button.tsx:93-95`). The blink cycle is a self-scheduling `setTimeout` loop with no dependency on simulation state at all (`:68-84`).

The pause branch resolves to a one-line predicate. `handleStart`'s pause path and `handleFireLine` both call `simulation.stop()`, which sets `simulationRunning = false` and nothing else (`simulation.ts:404-406`), and a naturally-ending fire sets the same flag from `tick()` (`:496`). So `simulation.simulationRunning` is exactly Trudi's "not running (or paused)" line, and re-enabling at the end of a run needs no extra work: the flag falls on its own.

The coach-mark teardown was expected to be the expensive half. It is not. The feedback panel is driven by a single effect keyed on `ui.showHazbotFeedback` (`:122-264`), which juggles `cleanup` / `introCancelled` / `tourCancelled` so that `onDestroyed` can tell the real user routes apart from a programmatic teardown, and a run-start teardown is a fourth route through that logic. But the soft-lock it walks into turns out to be a one-token fix (see Technical Notes), and the disabling half turns out to carry a hidden cost of its own: MUI already fades a disabled button, to the wrong value.

## Requirements

Bullets are numbered R27 to R44, plus R44a, continuing the numbering the interview used, and those numbers are what the Self-Review sections and `implementation.md` cite.

- **R27.** The Hazbot button is disabled while `simulation.simulationRunning` is true, and enabled whenever it is false. This puts paused on the enabled side (a Pause press and a Fire Line placement both stop the run), matches "before any run has been made" (never run, never running), and re-enables automatically when a fire burns out.
- **R28.** There is no cap on how many times Hazbot may be clicked once a run has ended.
- **R29.** While disabled, the whole button renders at 35% opacity: the robot, the "Hazbot Analysis" label, and the button back together.
- **R30.** **The 35% is an override, not an addition.** A MUI `Button` carrying `disabled` already renders at `opacity: 0.25` (measured live), so shipping `disabled={simulation.simulationRunning}` without a rule of its own produces a visibly darker button than the board specifies and than the existing `.noHazbot` state. The override must use the wrapper-class selector shape the file already uses, which wins on specificity without `!important` (see Technical Notes).
- **R31.** The 0.35 appears in exactly one place in `hazbot-button.scss`, shared with the existing `.noHazbot` rule rather than written twice.
- **R32.** `pointer-events: none` is **not** part of the disabled rule. MUI's disabled styling already applies it, and the `disabled` attribute already blocks the click. Only `.noHazbot`, which has no `disabled` attribute, needs it.
- **R33.** While disabled, the robot's blink cycle stops **and the robot holds eyes open**. It resumes from the top of the loop when the button re-enables.
- **R34.** The disabled button is not clickable and does not open the feedback panel.
- **R35.** If a coach mark (intro popover or walk-through tour) is open when a run starts, it is hidden and the button returns to its small default appearance before taking the disabled treatment. The coach mark cuts immediately; the robot's shrink animates on the existing 0.25s `.avatar` transition, exactly as it already does on every other close route.
- **R36.** A coach mark hidden by a run start does not return by itself. The student reopens Hazbot after the run.
- **R37.** **When no coach mark is open, a run start has no side effects at all**: no log event, no visible state change beyond the fade. The teardown must be written so that this falls out rather than being suppressed by a condition.
- **R38.** A coach mark torn down by a run start logs `HazbotCoachMarkHiddenByRun` with `{ ruleSetId, categoryId, phase, lastStepIndex, feedbackLevel }`, where `phase` is `"intro"` or `"tour"` and `lastStepIndex` is null on the intro. `feedbackLevel` is the level of the coach mark that was on screen, read from the same `selected` binding the other four Hazbot events use, so every event about one popover reports the string it was showing. It is emitted from the panel effect's cleanup, gated on `simulation.simulationRunning` **and on a coach mark actually existing** (`intro || tourEngine`), so the existing user routes keep logging exactly what they log today, the nothing-open case stays silent, and a run started before the popover has opened stays silent too (see Technical Notes).
- **R39.** **`LOGGED-EVENTS.md` must be updated**, and it is a deliverable of this story rather than a follow-up. **WM-54 landed first**, reversing the order its R9a assumed: that story expected this row to exist already and to need its ids corrected, so it left the row to this one. Write it with the current ids from the start. WM-54 also added a `### Rule-set ids renumbered (appRulesVersion 8 onward)` subsection above the `categoryId` one, which is why the line citations below sit lower than they did, and took `APP_RULES_VERSION` to 8. **This story does not take it to 9** (see Technical Notes), so `rules-version.ts` is not among its changed files. The new `HazbotCoachMarkHiddenByRun` row goes in the Hazbot table alongside `HazbotShowMeClicked` / `HazbotTourCompleted` / `HazbotTourDismissed`, and it must state three things a reader cannot infer from the payload: that the event fires only when a coach mark was actually open, so its absence on a `SimulationStarted` means nothing was showing; that `phase: "intro"` carries a null `lastStepIndex` because the intro popover has no steps; and what the event does and does not say about the student's intent. It means only that a run started while a coach mark was up. Whether that is abandonment depends on where the tour had got to, and `lastStepIndex` carries it: a `lastStepIndex` below `stepCount - 1` (from the paired `HazbotShowMeClicked`) is abandonment-by-running, distinct from the abandonment-by-leaving that a `HazbotShowMeClicked` with no terminator at all still indicates, while a **terminal** `lastStepIndex` on a tour whose last step *asks the student to press Start* is the student complying with the instruction. The rule is what the terminal step asks for, not what it is anchored to, and six live coaching tours end that way: 41/2, 44/2, 46/2 and 46/4, whose terminal step is anchored on Start, and 44/3 and 46/3, anchored on Fireline but ending *"Add both a **Fireline** and a **Helitack** while the model is running. Click **Start** to begin!"*. The row must name all six, and split them, since compliance is partial for the second two: pressing Start is half of what those steps asked, and this story removes the during-run half before it becomes actionable. The row must also say that compliance has two routes, because the terminal popover carries a `[Got it!]` button as well as the instruction: a student who dismisses first and then presses Start still logs `HazbotTourCompleted`, so this event replaces it on one route rather than all of them. Those notes are what keep the WM-45 completion derivation (`specs/WM-45-analysis-last-run.md:103`) correct against sessions logged after this change. Like the other Hazbot events, note that it is a deliberate engine no-op. The row is also not the whole doc deliverable in a second way, and it depends on merge order with WM-32: that story's doc deliverable lists three events whose rows must state which coordinate system `stepCount` and `lastStepIndex` are in, and `HazbotCoachMarkHiddenByRun` carries `lastStepIndex` too, so whichever of the two lands second adds the fourth name to that enumeration (see Technical Notes). The row is not the whole doc deliverable: the `### categoryId on the tour events (appRulesVersion 6 onward)` subsection (`LOGGED-EVENTS.md:100-112`) enumerates the events it applies to, and `HazbotCoachMarkHiddenByRun` belongs in that enumeration. Its `categoryId` comes from the same binding the three tour events use (`matched`, from `readCategories(engine).used` at `hazbot-button.tsx:126`), so the note's `matchedCategory` warning carries over unchanged. Two of its other lines do not, and are part of the same deliverable: the subsection is headed "on the tour events" and `HazbotCoachMarkHiddenByRun` also fires on the intro, and it closes "Before `appRulesVersion` 6, `categoryId` on these three events was `matchedCategory`", which loses its referent once four events are named and is untrue of an event that post-dates that boundary. Left out, a reader of the new row cannot tell whether its `categoryId` means `categoryUsed` or `matchedCategory`, and the note's warning that the value may sit above `matchedCategory` on tab 44 without being corrupt never reaches the new event.
- **R40.** **The button must not be left in the tour's faded state after a run-start teardown, and must not return to it on the next open.** The tour state (`.noHazbot`) hides the robot and sets `pointer-events: none`; the disabled state keeps the robot and is reached through the `disabled` attribute. Two things are needed, and neither substitutes for the other. First, the run-start teardown **clears both** the panel flag and the tour flag (`ui.showHazbotFeedback = false; setTourActive(false);`), so no stale `tourActive` survives the run. Second, the `.noHazbot` class is gated on `ui.showHazbotFeedback` as well as on `tourActive`, so the state is unreachable while the panel is closed. **The gate lands with, or before, the run-start teardown**: shipping the teardown without it produces a permanently unclickable button. The gate alone is not enough because it does not clear `tourActive`, and the only writer that would (`setTourActive(false)`, `hazbot-button.tsx:124`) runs *after* the commit that reopens the panel, so the student's first reopen after a run commits one render of `.noHazbot` (see Technical Notes).
- **R41.** The ready pulse behavior is unchanged. It is already suppressed during a run and re-arms on its own.
- **R42.** Unit tests cover: the button is disabled during a run and enabled while paused (**one case per pause route**: the Pause press, the Fire Line placement, and the fire burning out in `tick()`), mid-run clicks do not open the panel, blinks stop while disabled and resume after (**with `Math.random` pinned** and timers advanced to the exact boundary), a run started with a tour open leaves the button in the disabled state rather than the tour state, reopening Hazbot after such a teardown lands in `.coached` and never commits `.noHazbot`, a run started with a coach mark open logs `HazbotCoachMarkHiddenByRun` with the right `phase`, `lastStepIndex` and `feedbackLevel` (one case per phase) and mis-logs neither `HazbotTourCompleted` nor `HazbotTourDismissed`, a user dismiss while not running still logs `HazbotTourDismissed` and nothing else, and a run started with no coach mark open logs nothing and clears nothing, and a run started after the Hazbot click but before the popover has opened logs nothing. Two further cases, listed apart from the pause routes: Restart pressed mid-run leaves the button enabled (Restart discards the run rather than suspending it), and a Helitack drop mid-run leaves the button disabled, since `handleHelitack` deliberately does not stop the run and so is not a pause route at all.
- **R43.** **The 35% itself is pinned in Cypress, not Jest.** SCSS modules resolve through `identity-obj-proxy` in this repo's Jest config, so no real CSS is applied in jsdom and a Jest assertion on the computed opacity would read `""` and pass against any implementation. Both the browser assertions, the HTML `disabled` attribute and the 0.35 opacity, go in the `Hazbot button pulse (WM-6)` describe block of `bottom-bar-state-machine.cy.ts` (`:234-262`), which already visits a `hazbotRules=23` URL. Not `bottom-bar-visuals.cy.ts`: it visits `/?preset=plainsTwoZone` with no `hazbotRules` (`:18`), and the button only mounts under `{hazbotEngine?.ruleSet && ...}` (`bottom-bar.tsx:243`), so the element does not exist on that page at all.
- **R44.** **`bottom-bar-state-machine.cy.ts` is prose this change invalidates, not just a place to add a test, and adding Hazbot to it starts with its URL.** It is the WM-24 guard that asserts the `disabled` attribute for all seven bottom-bar controls across the lifecycle states, from the same Zeplin matrix whose state 4 this story quotes. WM-42 added an eighth state after this spec was first written, so the WM-24 block now runs **nine** cases (eight lifecycle states plus the `Fireline armed` case) making **ten** `expectButtonStates` calls, since state 8 (SetupOpen) asserts a pre-state and a post-state. Hazbot becomes the eighth control in that matrix, so four things change together. First, **`APP_URL` (`:54`) gains `&hazbotRules=23`**: today it is `/?preset=plainsTwoZone`, the button only mounts under `{hazbotEngine?.ruleSet && ...}` (`bottom-bar.tsx:243`), and the WM-24 block's `beforeEach` (`:87`) visits that URL for every one of its nine cases, so a `hazbot` key added without it fails all nine on a missing element rather than only state 4. Second, the `expectButtonStates` helper (`:56-67`) gains the key, which means **all ten call sites supply an expectation**, not just state 4: the eight lifecycle states, the `Fireline armed` case, where arming the tool has paused the run and Hazbot is therefore enabled, and state 8's second call. Third, the state-4 (Running) case flips Hazbot to disabled. Fourth, the header comment is rewritten on **two** counts, and neither is the one an earlier draft of this requirement named: the header states no control count at all, so the eighth control adds nothing there. What it does state is that the file "Covers each of the seven states" (`:4`), which WM-42's eighth state already made false, and that it "Does NOT cover visual styling regressions (opacity, grayscale)" with "there is no automated assertion of the rendered styles" (`:10-14`), which requirement 43's 0.35 assertion makes false. The accepted cost of the URL change is that the nine WM-24 cases now depend on the Hazbot engine loading, so a rule-set validation failure would fail tests unrelated to WM-24; it is the same coupling the `Hazbot button pulse (WM-6)` block in the same file already carries.
- **R44a.** **State 8 (SetupOpen) asserts `hazbot: true`, which is WM-42's decision rather than this story's, and the case title changes with it.** `simulationRunning` is false while the Setup wizard is open, so this story's predicate leaves Hazbot enabled there, and that is the behavior WM-42 chose deliberately: "lock the bar" means the model controls in `.mainContainer`, not the region controls, so Spark, Reload and Start took `ui.showTerrainUI` (`bottom-bar.tsx:78`, `:170`, `:188`) while Hazbot and the fullscreen toggle stayed live, on the grounds that neither writes `ui.showTerrainUI`, neither discards wizard state and neither is a way of leaving Setup. It is already guarded: `bottom-bar.test.tsx:656-663` clicks Hazbot with the wizard open and asserts the feedback panel opens and the wizard stays. That case survives this story unchanged, because the two states cannot overlap: the Start button is disabled while `showTerrainUI` (`:188`), the Setup button is disabled once `simulationStarted` (`simulation.ts:146`), and the zone tiles, the only other writer of the flag, drop their click handler on the same condition (`simulation-info.tsx:18`, `:33`). So nothing here is open. What does change is the Cypress case title: "state 8 (SetupOpen): only Setup stays enabled; Spark/Reload/Start locked out" stops being true once an eighth control is asserted enabled beside Setup, so it becomes "Setup and Hazbot stay enabled; Spark/Reload/Start locked out".

## Technical Notes

Findings below were established by reading the code on this branch, by measuring the Zeplin board, by throwaway Jest tests written against the branch, and by live measurement in Chrome against the dev server (all throwaway artifacts since deleted; see the last note).

**The disabled visual is already half-built, at the same opacity.** Measured on the *Updated Wildfire Controls and Labels* board (`.../screen/6a8566a1c90489f7be36e66a`), Hazbot Button States column: the **Disabled** state (122 x 48 at 1176,2073) is `opacity: 0.35`, and the **No Hazbot Default** state (same size at 1176,2005) is **also `opacity: 0.35`**. The Default state is `opacity: 1`. The existing `.noHazbot` rule in `hazbot-button.scss:121-128` already implements `opacity: 0.35; pointer-events: none` plus `visibility: hidden` on the avatar. So the two states differ only in whether the robot is visible: **Disabled keeps the robot, No Hazbot removes it**.

**MUI already fades a disabled button, to 0.25.** Measured live in Chrome on the running app by setting `disabled` and `Mui-disabled` on the real button: computed `opacity` goes from `1` to **`0.25`**, and `pointer-events` to `none`. Everything else survives: the `#c1daff` background and the `#797979` border hold (both carry `!important` for the documented emotion source-order reason; the border is *declared* `1.5px` at `hazbot-button.scss:25` and *computes* to `1px` at `devicePixelRatio` 1, since Chrome floors a sub-pixel border, so a browser assertion must expect 1px), and the label keeps `color: #222` because `.label` sets it on the span while MUI's disabled color applies to the root. So the naive one-line change ships a button at the wrong opacity, matching neither the board nor `.noHazbot`, and the "whole button at 35%" requirement is satisfied by a single `opacity` on the root exactly as `.noHazbot` already does it. A screenshot of the corrected 0.35 state (robot, label, back and border all faded together) was taken during this pass and matches the board's Disabled cell.

**The override does not need `!important`, but it does need the wrapper-class shape.** Also measured live: a rule shaped like the existing `.hazbotButtonWrap.<state> .hazbotButton` (three classes, specificity 0,3,0) computes to `0.35` over MUI's `.MuiButtonBase-root.Mui-disabled` (0,2,0), with and without `!important`; with no rule at all it computes to `0.25`. A rule written instead as `.hazbotButton.Mui-disabled` would tie MUI on specificity and lose on source order, which is the same trap the file already documents for `background` and `border`. Follow the `.coached` / `.noHazbot` pattern: a third wrapper class.

**Board wording, for the record.** The Hazbot column reads *"Disabled / while model is being run (occurs when Start is pressed); blinks are paused"*, and the bar's state table, item 4, reads *"When Start is pressed and during run: Start becomes Pause; Restart is enabled; Setup, Spark, and Hazbot are disabled"*. Setup and Spark already disable themselves off `simulationStarted`; only Hazbot is new.

**The pause branch needs no special handling. `simulationRunning` is cleared from three places, reached by four UI routes.** `simulation.stop()` sets only `simulationRunning = false` (`simulation.ts:404-406`), and both pause routes go through it: `handleStart`'s running branch (`bottom-bar.tsx:266`) and `handleFireLine` (`:364`). A naturally-ending fire sets the same flag in `tick()` (`simulation.ts:496`). `handleHelitack` (`bottom-bar.tsx:380-386`) deliberately does **not** stop the run, so a Helitack drop is not a pause route and Hazbot stays disabled through it. The fourth UI route is **Restart**, and it is a discard rather than a pause: `restart()` clears the flag itself (`simulation.ts:409`) and `reload()` calls `restart()` (`:437`). Restart is enabled throughout a run (`restartEnabled` is `simulationStarted`, `:158`), so pressing it mid-run re-enables Hazbot, which is right, since the model is no longer running. It is not a peer of the three pause routes: it throws the run away rather than suspending it, which is why `handleRestart` logs `SimulationEnded` plus `SimulationRestarted` rather than `SimulationStopped` (`bottom-bar.tsx:324-338`). Worth knowing downstream: `SimulationRestarted` and `SimulationReloaded` are **modifiers** in `translate.ts` (`:56-63`) that close the open run window, so a mid-run Restart both re-enables Hazbot and changes what the engine reports on the next click. Gating on `simulationRunning` therefore satisfies "enabled while paused", "enabled after the run" and "enabled before any run" with one predicate and no extra state.

**LANDMINE: the naive teardown soft-locks the button, and the fix is one token.** `tourActive` is cleared in the tour engine's `onDestroyed`, but only on the `!cleanup` branch (`hazbot-button.tsx:194`). The programmatic teardown path sets `cleanup = true` *before* destroying, precisely so neither engine mis-logs, which also means `setTourActive(false)` is skipped. So if a run start clears `ui.showHazbotFeedback` from outside the component while a tour is active, the wrapper keeps `.noHazbot`: **opacity 0.35, robot hidden, and `pointer-events: none`, permanently**. Reproduced in jsdom, and then repaired in jsdom: changing the class expression at `hazbot-button.tsx:289` from `tourActive ? css.noHazbot : ""` to `(ui.showHazbotFeedback && tourActive) ? css.noHazbot : ""` turns the failing case green, and all 35 existing `hazbot-button.test.tsx` cases stay green. That is the whole repair. It is preferable to clearing `tourActive` on the cleanup path because it makes the bad state unreachable rather than recording it and relying on a fourth route to clear it, and because it involves no `setState` during unmount (the file already carries a `mounted` ref for exactly that hazard on the blink loop).

**The gate closes the run's window, not the reopen's.** The gate makes `.noHazbot` unreachable while
the panel is closed, but `tourActive` stays `true` through the whole run, because the cleanup path
skips `setTourActive(false)` for the same `cleanup`-flag reason the landmine above turns on. The only
writer that clears it is the panel effect's own `setTourActive(false)` (`hazbot-button.tsx:124`),
which runs *after* the commit that reopened the panel. So the render that sets
`ui.showHazbotFeedback = true` still sees `tourActive === true` and satisfies both halves of the gate.
Confirmed in jsdom with a `MutationObserver` on the wrapper's `class` attribute across the reopen
(`attributeOldValue`, records drained with `takeRecords()` rather than `disconnect()`, which discards
records still queued in the microtask): the committed value is `"hazbotButtonWrap noHazbot"`. Whether
that paints depends on React's passive-effect scheduling, so it is a one-frame flash rather than a
guaranteed one, but the stale flag is certain. Clearing `tourActive` in the run-start teardown removes
it at the source, which is why requirement 40 asks for both.

**This is not a pre-existing bug; it is a trap the story walks into.** `ui.showHazbotFeedback` is written from exactly three places today, all inside `hazbot-button.tsx` (`:138`, `:194`, `:217`), and the only one that fires while a tour is active also calls `setTourActive(false)`. `use-fire-line-placement-cancel.ts:22` reads the flag but never writes it. WM-31 introduces the first external writer, which is what makes the path reachable.

**`simulationRunning` has a single writer, which is what settles where the teardown lives.** It is set true in exactly one place, `simulation.start()` (`simulation.ts:398`), and `start()` has exactly one non-test caller, `bottom-bar.tsx:320`. So a reaction and a line in `handleStart` are behaviorally identical today, and the `use-fire-line-placement-cancel.ts` precedent ("the invariant cannot rely on each call site remembering") does not transfer, since there is only one call site to remember. What does decide it is testability: `hazbot-button.test.tsx` renders `HazbotButton` standalone, so a teardown owned by the component is testable alongside the other three routes, while one owned by `handleStart` would have to be driven through `bottom-bar.test.tsx` and the full run machinery. `window.sim.start()` is also a live debug path (see `CLAUDE.md`) that a `handleStart` line would not cover.

**The teardown is inherently a no-op when nothing is open.** Writing `ui.showHazbotFeedback = false` when it is already `false` does not notify: MobX's default comparer suppresses same-value assignments, so no reaction, no re-render and no log fires. The "no side effects when no coach mark is open" requirement therefore needs no guard, provided the teardown writes the flag rather than calling a teardown routine directly.

**The cleanup outlives the popover on both ends, which is why the log needs a second term.** The panel
effect registers its cleanup at `hazbot-button.tsx:254`, but the popover is not opened there: `openOnce`
is deferred to the avatar's transform `transitionend`, with a 400ms fallback (`:232-253`), so the
`.coached` scale-up settles before anything is drawn. For the 250 to 400ms in between, the cleanup
exists and `intro` is still `null`. A log gated on `simulation.simulationRunning` alone therefore fires
for a coach mark that was never displayed. Reproduced in jsdom: clicking Hazbot, advancing 100ms, then
setting `simulationRunning = true` creates zero coachmarks engines and still logs
`{ ruleSetId: "23", categoryId: 2, phase: "intro", lastStepIndex: null }`. That record is
indistinguishable from a real intro teardown, which is the exact distinction `phase` exists to carry,
and no reader can filter it out after the fact. Conjoining `intro || tourEngine` closes it. The term is
not redundant with the `simulationRunning` gate and should not be simplified away.

**A run-start teardown logs nothing today.** Verified: with `cleanup` set, both `HazbotTourCompleted` and `HazbotTourDismissed` are suppressed and only `destroy()` is called. So a coach mark torn down by a run start leaves no trace in the event stream unless the story adds one. See the open question.

**Six live tours end by telling the student to press Start, so the new event fires on their success path.** Four are anchored there: `tour-map.tsx` gives 41/2, 44/2, 46/2 and 46/4 a terminal `anchor("start-button")` with the text *"Click **Start** to run the model!"*. Two more only say it: 44/3 and 46/3 are anchored on `fireline-button` and end *"Add both a **Fireline** and a **Helitack** while the model is running. Click **Start** to begin!"*. All six are live `[Show me]` coaching categories, and `buildTour` makes the terminal step Done-terminated (no `advanceOn`, `build-tour.ts:56`), so the popover is still on screen while the student reads it and presses Start.

Verified live in Chrome on the dev server with the decided implementation, driving 44/3 (one default run, pause, Hazbot, `[Show me]`, Restart to advance): at the terminal step the Start button is enabled, is not covered by the popover (popover bottom 797, Start top 824) and wins the hit test at its own center, and the popover reports `aria-modal="false"` with no backdrop element, so nothing about the anchor being elsewhere stops the student pressing Start. Doing so destroyed the coach mark and logged `HazbotCoachMarkHiddenByRun { ruleSetId: "44", categoryId: 3, phase: "tour", lastStepIndex: 1 }` against a `stepCount: 2` on the paired `HazbotShowMeClicked`: a **terminal** index on a fireline-anchored tour. The anchor-based reading of the event would call that abandonment.

The count shift is a split, not a collapse. The same live run showed the terminal popover carrying a `[Got it!]` button alongside the instruction (the library forces the Done button on the last step even when `actionGated`, `dist/index.js:747`), so a compliant student has two routes: dismiss then Start, which still logs `HazbotTourCompleted`, or Start directly, which now logs the new event instead. Measured on both sides in jsdom for 41/2: **today** a run start leaves the tour open and the later "Got it!" logs `HazbotTourCompleted { lastStepIndex: 1 }`; **after this story** the run start logs `HazbotCoachMarkHiddenByRun { ruleSetId: "41", categoryId: 2, phase: "tour", lastStepIndex: 1 }` and `HazbotTourCompleted` never fires. So completion counts for these six fall by however many students take the second route, which is unknown in advance. Nothing needs to be logged to recover the distinction, since `lastStepIndex` reaches the terminal index and `stepCount` is already on the paired `HazbotShowMeClicked`; what it needs is the doc wording in requirement 39, and one message to Sam (below).

**Two more tours are authored to span the run, and this story cuts them at Start.** 44/3 and 46/3 are two-step tours (`[anchor("restart-button"), anchor("fireline-button")]`) whose terminal step reads *"Add both a **Fireline** and a **Helitack** while the model is running. Click **Start** to begin!"*. The run-spanning intent is explicit in the authoring: `tour-map.tsx:19` records that these two categories' `visualFeedback` rings "Fireline + Helitack + Start" and that v1 simplified it to Fireline only. The apparent escape hatch does not help: a Fire Line placement pauses the run and re-enables Hazbot, but the tour reopens at index 0, whose text is *"First, **Restart** your model"*, which would throw away the run the student is intervening in. Recorded in Out of Scope and raised with Trudi as content; no code in this story treats these two differently.

**The pulse needs no work; the blink does, and the phase matters.** The `pulsing` predicate already carries `!simulation.simulationRunning` (`:93-95`), verified by throwaway test: arming the pulse during a run leaves `ready` off the wrapper, and clearing `simulationRunning` puts it back. The blink loop (`:68-84`) has no such term: with `Math.random` pinned to 0 and timers advanced 1000ms during an active run, the robot still swaps to `hazbot-blinks`. The loop is `idle(1000 + rand * 2500) -> eyes closed 180ms -> eyes open -> 80ms -> repeat`, a mean cycle of about 2510ms of which 180ms shows closed eyes, so simply stopping the scheduler would leave the robot frozen mid-blink roughly 7% of the time, for the whole run. That is why the disabled state forces eyes open rather than freezing the current frame.

**The shrink already animates on every other close route.** `.avatar` carries `transition: transform 0.25s` on the base class, not on `.coached` (`hazbot-button.scss:47`, with a comment saying this is deliberate so both the open scale-up and the close scale-down animate). Since `.coached` is `ui.showHazbotFeedback && !tourActive`, clearing the flag from outside removes the class and the robot shrinks on that same transition. Letting it animate is therefore the *existing* behavior of terminal Done, the close button and Escape; suppressing it would make the run-start route the only one that snaps.

**Focus restore cannot land on the disabled button.** The library restores focus only when focus is currently inside a popover (`focusInEngine`, `dist/index.js:1486-1519`), which requires the student to have tabbed into it, and the restore target is the step's own anchor element: the avatar `<span>` for the intro, a bottom-bar control for a tour. The Hazbot `<button>` is never the target, and the `onMouseDown` preventDefault means it was never focused on click in the first place. A failed focus would leave focus on `<body>` with no visible consequence. The `onMouseDown` handler is inert while disabled, since a native disabled button dispatches no mouse events. Nothing to do here.

**WM-32 interaction: no code conflict, one shared doc deliverable.** The earlier note here said "no cross-story interaction", which is right about behavior and wrong about the deliverable. Checked against the unmerged `WM-32-skip-satisfied-steps` branch, whose head is `067cda5` and whose two implementation commits edit `hazbot-button.tsx` and `hazbot-button.test.tsx`, the same files this story changes.

*Behaviorally, nothing collides.* `hazbot-button` is not in `ANCHOR_TESTIDS` (`anchor-testids.ts`), so WM-32's `dropSatisfiedLeadingSteps` never inspects the Hazbot button, and WM-31 changes no other control's `disabled` state, so it cannot widen WM-32's skip. The relationship runs the other way and is helpful: once Hazbot cannot be opened mid-run, tours only ever open while `simulationRunning` is false.

*The merge is clean, verified rather than assumed, and re-verified on 2026-08-25 against the post-WM-46 base the two branches now share (`0183fa2`).* Both stories rewrite `openTour`'s opening lines, WM-31 to hoist `lastStepIndex` and WM-32 to rename the parameter, slice the steps, and add `skippedSteps` to the `HazbotShowMeClicked` payload. A three-way `git merge-file` of the two against that base produces **no conflict** (exit 0, zero markers), and the auto-merged body is the one you would write by hand: `let lastStepIndex: number | null = null;` at effect scope, `openTour(fullSteps)` slicing and logging `skippedSteps` alongside `feedbackLevel`, `showProgress: steps.length > 1`, and `lastStepIndex = 0` as a reassignment. The reason the two do not collide despite editing adjacent lines is that WM-32 leaves `let lastStepIndex = 0;` as context and WM-31 is the only side that rewrites it. The combined file typechecks with no new `tsc` errors, and the only Jest failure it produces is `hazbot-button.test.tsx:372`'s exact-match assertion on the `HazbotShowMeClicked` payload, which is the single failure WM-32's own spec already budgets for. WM-31 adds no breakage on top of it, and neither story needs to land first.

*The coordinate system WM-31's new event depends on is WM-32's to define, and WM-32 already chose to preserve it.* WM-32's second open question resolves `stepCount` and `lastStepIndex` to **driven** coordinates with `skippedSteps` as the reconciling field, explicitly to keep `lastStepIndex === stepCount - 1` working for the same WM-45 consumer (`specs/WM-45-analysis-last-run.md:103`). `HazbotCoachMarkHiddenByRun`'s terminal test rides on that pairing, so it survives WM-32 unchanged. Two consequences to carry, both documentation rather than code. First, WM-32's doc deliverable enumerates three events whose rows must state their coordinate system (`HazbotShowMeClicked`, `HazbotTourCompleted`, `HazbotTourDismissed`); `HazbotCoachMarkHiddenByRun` carries `lastStepIndex` too and belongs in that enumeration, so whichever story lands second adds the fourth name, exactly as it does for the `categoryId` subsection. Second, the concrete step indices quoted in this spec (`lastStepIndex: 1` on 41/2 and 44/3) are pre-WM-32 measurements: once leading satisfied steps are dropped, a two-step tour opened after its Restart is already done is driven as one step and its terminal index is 0. The rule holds; the illustrative numbers are not portable.

**Loading the rule-set does not disturb the WM-24 assertions, measured.** The `APP_URL` change requirement 44 asks for was checked live in Chrome before being written in. On `?preset=plainsTwoZone&hazbotRules=23`, state 1 reads Setup and Spark enabled with Reload/Restart/Start/Fireline/Helitack disabled, and state 4 (spark placed, Start pressed) reads Setup and Spark disabled with the other five enabled: exactly what the existing state-1 and state-4 cases assert on the rule-set-free URL. The Hazbot engine only consumes logged events, so it changes no button predicate. The same run also confirmed the gap this story closes, with the Hazbot button present and carrying no `disabled` attribute mid-run.

**Suite baseline on this branch.** `npx jest` reports **982 passed of 982 across 78 suites**, all green (re-measured 2026-08-25 on this branch rebased onto master at `be56b22`, which now carries WM-54; the 879 the earlier passes recorded predates WM-46, WM-42 and WM-54). Adding a `disabled` prop will need the existing `hazbot-button.test.tsx` cases checked, since several click the button directly without setting simulation state.

**Throwaway artifacts.** Two rounds of throwaway Jest cases were written and deleted: the first covering the disabled attribute, the mid-run click, the blink loop, the pulse, the stuck-`.noHazbot` landmine, the normal close route and the silent teardown; the second reproducing the landmine, proving the one-token repair and checking for a re-open flash. The live Chrome measurements above used temporary DOM and stylesheet edits on the running page, all reverted. The tree is back at its baseline.

**`APP_RULES_VERSION` stays at 8, and the precedent rather than the policy settles it.** Requirement 39
raised the question because WM-54 took the version to 8. The bump policy
(`docs/hazbot-update-workflow.md:207-210`) is scoped to rules and selection semantics: a bump marks a
change to *which string a given history is shown*, whether through category matching or through how a
category's feedback is picked. This story changes neither. For any history the log actually records, the
category resolves the same way and the same string is selected; what changes is which histories are
reachable, since a mid-run Hazbot click no longer exists. Every bump in the file's history is a rules or
selection change (WM-54's renumber, WM-46's feedback levels, WM-45's `category_used`, the rule-set
re-extracts before them), and none is an app-behavior or log-schema change.

**WM-42 is the governing precedent, and it is close to identical.** It changed what
`TerrainPanelButtonClicked` *means* (it stopped being an open count, since a click on the already-open
button now logs too) and gave `TerrainPanelClosed` a whole payload, and it did **not** bump: it reworded
the two rows in `LOGGED-EVENTS.md` and left the version alone. That is the same shape as this story, and
the same remedy applies.

The argument the other way is worth recording, because it is real and someone will raise it.
`appRulesVersion` is the key researchers segment on, and this story does put a discontinuity in the
data: `HazbotTourCompleted` counts fall for six categories, and mid-run `HazbotButtonClicked` events
stop occurring. A session on the far side of the change is not always distinguishable by payload alone,
since `HazbotCoachMarkHiddenByRun` only appears when a teardown actually happened. That is the exact
situation the `Rule-set ids renumbered` note answers with "segment on `appRulesVersion`". It is
outweighed by what the bump would cost: version 9 would tell a researcher the rules changed when no rule
did, which is the one thing the field exists to say. The discontinuity is carried by the
`LOGGED-EVENTS.md` row instead, which is why requirement 39 makes it state the completion-count shift in
so much detail.

**Every `file:line` in both spec files was re-derived on 2026-08-25 against the stacked tree**
(this branch on `WM-54-renumber-rule-sets`), and most of them had moved. The spec's code citations were
measured on 2026-08-22 against the pre-WM-46 `master`: WM-46 added 24 lines to `hazbot-button.tsx` and
WM-42 added 2 to `bottom-bar.tsx`, both after the citations were written and neither re-derived by the
8/24 rebase or the 8/25 renumber pass. The shifts are not uniform, so nothing here is recoverable by
adding a constant. What did **not** move, checked rather than assumed: every `simulation.ts` citation,
the `hazbot-button.scss` rules, `tour-map.tsx` and `tour-data.generated.ts` (including 44/3's step 1
still reading *"First, **Restart** your model"*, which requirement 39's compliance argument rests on),
`build-tour.ts:56`, the `translate.ts` modifier and no-op cases, and the coachmarks `dist/index.js`
lines.

**Requirement 38's payload was written before WM-46, and now carries `feedbackLevel` to match it.**
WM-46 added `feedbackLevel` to `HazbotShowMeClicked`, `HazbotTourCompleted` and `HazbotTourDismissed`
(`hazbot-button.tsx:163`, `:191`, `:183`), so all three coach-mark terminators report the string the
coach mark was showing. `HazbotCoachMarkHiddenByRun` is a fourth terminator on the same coach mark and
requirement 38 originally omitted the field, because it was specified before WM-46 merged. It is added,
for three reasons. It is free: `selected` is an effect-level binding (`:132`) in the same body as the
cleanup (`:254`), so it is one more property on a `log()` call that is already there, with none of the
hoisting `lastStepIndex` needed. It keeps the table's rows self-describing, which is the standard WM-46
set for exactly these events: `feedbackLevel` on `HazbotTourCompleted` and `HazbotTourDismissed` is
equally derivable from the paired `HazbotShowMeClicked`, and WM-46 carried it anyway. And it removes a
join from every downstream query, since the value is otherwise recoverable only by pairing each
teardown with the nearest preceding `HazbotFeedbackShown`, an adjacency match that cannot be checked by
value because the level is not monotonic within a session (`LOGGED-EVENTS.md:114`).

The cost, recorded so it is not rediscovered as a defect: the value is now stored in two events per
popover, so a session could in principle log a `HazbotFeedbackShown` and a
`HazbotCoachMarkHiddenByRun` that disagree. They cannot diverge in this implementation, since both read
the same `selected` binding from one effect run, but a future change that re-selects mid-popover would
make them able to. Nothing derives one from the other, so a disagreement would be silent.

## Out of Scope

- **Disabling Setup and Spark during a run.** The board's state 4 lists them alongside Hazbot, but both already disable themselves off `simulationStarted` (`simulation.ts:146` and the Spark predicate in `bottom-bar.tsx`). Nothing to build.
- **Any affordance explaining why Hazbot is unavailable.** Michael was asked whether the student gets one and answered with the opacity spec alone. The rejected alternative was a "I will analyze your model after it is finished running" popover, which Trudi turned down for leaving a stale message after the run ends.
- **Putting Hazbot to sleep after the student reaches the maximum category.** From Sam's design doc, argued against by Trudi's "as many times as s/he wants", and it belongs to WM-9, which is out of the sprint.
- **Capping post-run clicks.** Explicitly rejected.
- **The fade-out transition.** Optional polish only, on Michael's own framing.
- **Suppressing the robot's shrink animation on the run-start teardown.** Rejected: the shrink already animates on all three existing close routes, and suppressing it here would make this route the only inconsistent one.
- **Re-authoring the two tours whose guidance spans the run.** 44/3 and 46/3 both end on the step *"Add both a **Fireline** and a **Helitack** while the model is running. Click **Start** to begin!"*, so this story removes the during-run half of the instruction at the moment it becomes actionable, and the student cannot get it back (Hazbot stays disabled for the run, and a reopened tour drives from step 1, *"First, **Restart** your model"*, which would discard the run they are intervening in). The fix is content, not code: the instruction text is build-time generated from each category's authored `visualFeedback`, so splitting the during-run half into a step the student completes before Start is Trudi's to make. Raised with her as a non-blocking ask; this story ships the teardown as specified.
- **Restructuring how `tourActive` is stored.** The class-gate fix makes the stuck state unreachable, so lifting the flag into the store or deriving it from the effect's `phase` is not needed to close this story.
- **Accessibility review**, per the standing scope for this repo.

## Open Questions

### RESOLVED: Get the stray pause musing struck from the ticket description
**Context**: The description ends with *"or not; we could have Hazbot respond with 'continue running the model ...' if we want the student to finish the run every time?"*, added in the same 2026-08-19 edit that wrote in Trudi's policy. It reopens the pause branch as a design musing after Trudi had already settled it in Slack at 16:40 and Doug had mirrored that to the ticket as comment 42290. It is the only line in the description that contradicts the rest of it.
**Options considered**:
- A) Treat Trudi's policy as the decision, build enabled-while-paused, and get the line struck before starting.
- B) Ask Trudi to re-confirm before writing any code.

**Decision**: **A, and the ask does not block the branch.** Build against Trudi's policy now; send her one message that asks for the trailing line to be struck and tells her, as an FYI rather than a question, that a Fire Line placement counts as a pause so Hazbot goes live mid-intervention on a half-burned fire. If she dislikes that consequence it is an isolated change to one predicate. A third item for the same message, also non-blocking and squarely hers since she owns the feedback-table content: 44/3 and 46/3 tell the student to add a Fire Line and a Helitack *while the model is running*, and this story removes that instruction at Start with no way to re-read it, so those two terminal steps want re-authoring to deliver the during-run half before the run begins.

**A second ask, to Sam, also non-blocking**: tell him that `HazbotTourCompleted` counts for six categories will fall after this ships, because their terminal step tells the student to press Start and the run-start teardown now terminates the tour instead. Four are anchored on Start (41/2, 44/2, 46/2, 46/4) and two on Fireline while still ending "Click **Start** to begin!" (44/3, 46/3), so a rule written off the anchor misses half the affected categories. He is the named consumer of the completion derivation (`specs/WM-45-analysis-last-run.md:103`), the shift is silent in the data, and the recovery is a join he needs to know to make: a terminal `lastStepIndex` on `HazbotCoachMarkHiddenByRun` is compliance, not abandonment. Two caveats worth giving him rather than letting him find: the fall is a split rather than a collapse, since the terminal popover still offers `[Got it!]` and a student who dismisses before pressing Start keeps logging `HazbotTourCompleted`; and for the two fireline-anchored categories compliance is only partial, since this story removes the during-run half of their instruction (the same content ask that is going to Trudi above).

**The description's own policy sentence supports the resolved predicate, so what is left is a deletion rather than a question.** An earlier draft of this question assumed "not running (or paused)" was ambiguous about which pauses count and needed Trudi to disambiguate it. Read against the resolved Fire Line question above, it is not: the line reads "if model is stopped/paused, Hazbot is enabled and ready to respond to **the current model setup**", and "the current model setup" during a Fire Line pause is a half-burned model, which is exactly what that question resolved to and what WM-45's R2a already ships.

That removes the case for B. Blocking would mean asking Trudi to re-state a policy she has stated twice and that is written into the description, while the only line contradicting it is one nobody is implementing. Verified against the live ticket during this pass: the trailing musing is still present verbatim and the story is still To Do.

---

### RESOLVED (raised by this pass): Does "enabled while paused" really mean enabled during a Fire Line intervention?
**Context**: This is a contradiction inside the spec rather than a new design idea, which is why it is being raised. The Overview objects to a student "clicking it mid-run, so it answers about a model that is still changing", but the chosen predicate `simulationRunning` puts the Fire Line pause on the enabled side: arming Fire Line mid-run calls `simulation.stop()` (`bottom-bar.tsx:370`), the flag falls, and Hazbot becomes clickable while the fire is half burned and the student is in the middle of an intervention. Trudi's "not running (or paused)" most naturally reads as the Pause button, which is the state where the student has deliberately stepped back from the run. Note that the codebase already treats the two pauses as different in kind: `handleStart`'s pause arms the ready pulse, while the Fire Line pause deliberately does not, precisely so the pulse "stays off mid-intervention" (`bottom-bar.tsx:266-270`). The disabled state has no such distinction today.
**Options considered**:
- A) Keep `simulationRunning`. A pause is a pause, the student chose to stop the model, and the simplest predicate is the one Trudi's words support.
- B) Disable during a Fire Line pause too, by gating on something that stays true across the intervention (the same distinction the pulse already draws).
- C) Ask Trudi, bundled with the description edit in the question above.

**Decision**: **A, keep `simulationRunning`.** Three findings settle it.

**B cannot be built in the form it is written.** The intervention does not end when the line is drawn: `placeSecondEnd` (`use-draw-fire-line-interaction.tsx:42-44`) clears `ui.interaction` and `ui.fireLinePlacementInProgress` and leaves the simulation stopped, so the student must press Start again to resume. From the moment the second endpoint lands until they do, no flag distinguishes a Fire Line pause from a Pause-button pause. Gating on "something that stays true across the intervention" therefore covers only the drawing window, and Hazbot re-enables on the half-burned fire one click later regardless.

**Neither existing distinction can be borrowed.** `simulationEnded` is `simulationStarted && !simulationRunning && fireDidStop` (`simulation.ts:142-143`), so it is also false during a Pause-button pause, and gating on it would disable Hazbot while paused, contradicting Trudi's policy. `ui.hazbotPulseArmed` is cleared by `handleClick` (`hazbot-button.tsx:269`), so reusing it would re-disable the button after a single click. Covering the whole intervention would take a fourth observable written at three sites, for a window the student ends whenever they choose.

**WM-45 already decided the semantics, and they make the paused analysis correct rather than misleading.** Its R2a reads "the newest canonical run counts even when it has not finished, so a student who pauses mid-run and asks for analysis is told about the run they are watching", and its Technical Notes name WM-31 as the dependency that makes that state reachable. Analyzing a half-burned run is deliberate behavior, not a leak in the predicate.

Measured live on the dev server (`plainsTwoZone`, two sparks, Start then Fireline): `simulationRunning` false, `simulationStarted` true, `simulationEnded` false, and the Start/Pause button reads **"Start"**. That is the same state a Pause press produces, and `bottom-bar.tsx:193` reads the same flag to render it, so the app already tells the student the model is paused. A Hazbot that follows the same flag agrees with what is on screen.

The Helitack asymmetry the question raises points the other way: `handleHelitack` (`bottom-bar.tsx:380-386`) does not stop the run, so the model is still running and Hazbot stays disabled. The predicate is consistently "is the model running"; the two tools differ in whether they stop it.

---

### RESOLVED: Should a run-start teardown of an open coach mark be logged?
**Context**: The three existing routes each log something: `HazbotTourCompleted` on terminal Done, `HazbotTourDismissed` on close/Escape, and nothing at all on programmatic cleanup. A run-start teardown is the fourth, and today it would fall into the silent bucket. From a research standpoint it is a distinct event: the student abandoned guidance by starting a run, which is not the same as dismissing it. From an implementation standpoint it is the route most likely to double-log, since it fires alongside `SimulationStarted`.
**Options considered**:
- A) Add a distinct event (e.g. `HazbotCoachMarkHiddenByRun`) carrying the ruleset, category and last step index.
- B) Reuse `HazbotTourDismissed` with a reason field, so existing queries keep working.
- C) Log nothing. `SimulationStarted` already timestamps the run, and the absence of a Completed event is inferable.

**Decision**: **A**, as `HazbotCoachMarkHiddenByRun` with payload `{ ruleSetId, categoryId, phase: "intro" | "tour", lastStepIndex: number | null, feedbackLevel: number | null }`. `lastStepIndex` is null on the intro phase rather than 0, so no reader takes "step 0 was shown" for a popover that has no steps, and `phase` is what separates an orphaned tour from an intro the student never got past.

**The payload is reachable from the cleanup, at the cost of one hoist, which was this question's open implementation risk.** The log call does not belong in the run-start effect, which knows only that the flag changed; it belongs in the **panel effect's cleanup**, gated on `simulation.simulationRunning`. Four of the five payload fields are already in that cleanup's scope: `ruleSetId`, `matched`, `phase` and `selected` (which carries `feedbackLevel`) are effect-level bindings (`hazbot-button.tsx:126-127`, `:132`, `:154`). `lastStepIndex` is not. It is declared with `let` inside `openTour` (`:166`), so reading it from the cleanup at `:254` is a compile error (`TS2304: Cannot find name 'lastStepIndex'`, confirmed by building the decided implementation on this branch). It has to be hoisted to the effect body next to `cleanup`, with `openTour`'s line becoming a reassignment: a small edit to existing tour code, not a free read. React's ordering makes the gate correct: the run-start effect writes `ui.showHazbotFeedback = false`, MobX re-renders, and the panel cleanup runs on the following commit with `simulationRunning` still true. Proved in jsdom against the branch with the decided implementation in place (six cases, since reverted): an intro open at run start logs `{ ruleSetId: "23", categoryId: 4, phase: "intro" }`; a tour open at step 2 logs `phase: "tour", lastStepIndex: 2` from the live index; neither mis-logs `Completed` or `Dismissed`; a normal user dismiss while not running still logs `HazbotTourDismissed` and nothing else; and the 35 existing `hazbot-button.test.tsx` cases stay green.

**The double-log worry is unfounded, and the same run proves the silent case.** With nothing open, a run start logs nothing at all: the teardown writes `ui.showHazbotFeedback = false`, MobX suppresses the same-value assignment, and the panel effect is never entered. That is what lets the "no side effects when nothing is open" requirement fall out rather than be guarded.

**B is weaker than it reads.** `HazbotTourDismissed` means "the student closed it", so folding a non-user action into it changes the denominator of every existing dismissal count, reason field or not. It also cannot carry the intro case at all: dismissing the intro popover logs nothing today (`hazbot-button.tsx:209-219`), so B would leave half the teardowns invisible and still need a second event.

**C's cost is concrete rather than theoretical.** `specs/WM-45-analysis-last-run.md:103` records Sam deriving coach-mark completion from `HazbotShowMeClicked` paired with the `lastStepIndex` on `HazbotTourCompleted` / `HazbotTourDismissed`. Under C a tour ended by a run start is a `HazbotShowMeClicked` with no terminator, the same signature as a page reload, so the derivation would classify abandonment-by-running as abandonment-by-leaving. This story sharpens the distinction rather than blurring it: the student then cannot reopen Hazbot for the rest of the run, so abandonment-by-running is a bounded, pedagogically meaningful action.

**Engine impact: none.** `translate.ts` ends its switch with `default: return { kind: "no-op" }` (`:67-68`), so a new event name is inert in the analysis engine without a code change, consistent with the other Hazbot events. `LOGGED-EVENTS.md` gains one row.

---

### RESOLVED: Where should the teardown live: inside `hazbot-button.tsx`, or at the Start call site?
**Context**: The button component owns every other route into and out of the panel, which argues for a MobX reaction on `simulationRunning` inside it. But `handleStart` in `bottom-bar.tsx` already does a batch of run-start bookkeeping (canceling fire-line placement, clearing `ui.interaction`, closing the terrain UI, clearing `hazbotPulseArmed`), and a fifth line there would be the smallest diff. The counter-argument is that the fire can also stop and restart from elsewhere, and a reaction covers every writer of `simulationRunning` rather than one call site.
**Options considered**:
- A) A reaction inside `hazbot-button.tsx` on `simulationRunning`, so no external writer of the flag can bypass it.
- B) A line in `handleStart` alongside the existing run-start bookkeeping.
- C) A single `startRun` action on the store that owns all of this, with `handleStart` and any future caller going through it.

**Decision**: **A, and it needs no `reaction()`.** `HazbotButton` is a MobX `observer`, and a plain `useEffect` keyed on the flag does the job: `if (simulation.simulationRunning) ui.showHazbotFeedback = false;`, with the dep array written `[simulation.simulationRunning, ui]`. Both halves of that are load-bearing. The dep array is what establishes the MobX observation, since it is evaluated during render; the `pulsing` read is **not**, because `ui.hazbotPulseArmed` short-circuits ahead of it and is false on every click (`hazbot-button.tsx:269`). And `ui` belongs in the array: without it `npx eslint` reports `React Hook useEffect has a missing dependency: 'ui'`, and this repo treats an `exhaustive-deps` disable as a sign the effect is shaped wrong. `ui` is a stable store object, so naming it lints clean and changes nothing about when the effect runs. Both verified against the built implementation. Three points settle it against B. Testability is the decisive one: `hazbot-button.test.tsx` renders the component standalone, so this route is testable next to the three existing panel routes, whereas a `handleStart` line would have to be exercised through `bottom-bar.test.tsx` and the whole run machinery. Coverage is the second: `simulationRunning` is set true only in `simulation.start()` (`simulation.ts:398`) whose only non-test caller is `bottom-bar.tsx:320`, so the two options are behaviorally identical today, but `window.sim.start()` is a documented live debug path that B would not cover. Cohesion is the third: every other write of `ui.showHazbotFeedback` is in this file. Option C was rejected as moving panel state into the model layer, which this codebase does not do; and the `use-fire-line-placement-cancel.ts` precedent for a reaction does not apply here, since its stated reason is many call sites and there is one.

---

### RESOLVED: Does the disabled treatment need its own class, or should the tour state be refactored to share it?
**Context**: Zeplin gives Disabled and No Hazbot Default the same `opacity: 0.35`, differing only in whether the robot is drawn. Writing 0.35 a second time in `hazbot-button.scss` puts the same value in two rules that must agree with each other and with the board. The alternative is a shared faded base with the avatar-hiding split out, which touches the existing tour state and its tests.
**Options considered**:
- A) Extract a shared faded rule; `.noHazbot` adds `visibility: hidden` on the avatar, the disabled state does not.
- B) Write a separate disabled rule and accept the duplicated constant.
- C) Drive both from one SCSS variable (e.g. `$hazbotFadedOpacity`) without restructuring the rules.

**Decision**: **A, as a shared selector list rather than a restructure.** One declaration covering both wrapper states, `.hazbotButtonWrap.noHazbot .hazbotButton, .hazbotButtonWrap.<disabled> .hazbotButton { opacity: 0.35; }`, with `.noHazbot` keeping its own `pointer-events: none` and avatar rule beneath it. B is ruled out by the repo's one-source-of-truth rule for a value that has to agree in two places. C is weaker than A: a shared variable still leaves two declarations that can drift in other ways, and it does not express that these are the same visual state. The live measurement above makes this rule mandatory rather than tidy, since without it MUI renders the disabled button at 0.25, and it also fixes the selector shape: the third wrapper class gives specificity 0,3,0, which beats MUI's `.Mui-disabled` without `!important`, while a `.hazbotButton.Mui-disabled` rule would tie and lose on source order. `pointer-events` stays out of the shared rule: MUI's disabled styling and the `disabled` attribute both already cover it, and only `.noHazbot` needs it written.

---

### RESOLVED: How should blinks be paused, and does the robot hold eyes-open or mid-blink?
**Context**: The board says "blinks are paused" without saying what the robot looks like while paused. The loop is a chain of nested `setTimeout`s, and the natural implementations differ in outcome: stopping the scheduler leaves whatever frame was showing (possibly eyes closed, which reads as broken), while forcing `blink = false` on disable guarantees eyes open. "Paused" also literally suggests resuming where it left off, which the recursive-timeout shape does not support without extra state.
**Options considered**:
- A) Stop scheduling and force eyes open while disabled; restart the loop from the top on re-enable.
- B) Stop scheduling only, leaving the current frame as-is.
- C) True pause and resume, preserving the phase across the run.

**Decision**: **A.** B is a real defect, not a theoretical one: the loop (`hazbot-button.tsx:68-84`) runs `idle(1000 + rand * 2500)` then eyes closed for 180ms then eyes open then 80ms, a mean cycle of about 2510ms, so stopping the scheduler at a random moment freezes the robot mid-blink about 7% of the time, and it stays that way for the entire run. A frozen half-closed robot is exactly the "reads as broken" outcome the Student review below is worried about, and it would be intermittent enough to be reported as a bug months later. C is meaningless here: the phase being preserved is a fresh uniform random idle, so resuming it and restarting it are the same distribution, and it would cost extra state to achieve nothing. A is also the reading that matches the board's intent, since "paused" there is describing a robot that is asleep rather than one caught mid-motion.

---

### RESOLVED: What happens if the student starts a run while the *intro* popover is open, rather than a tour?
**Context**: The ticket says "if a coach mark is displayed", which covers both, and the teardown is the same call either way. But the two states differ on the way out: the intro carries `.coached` (the enlarged robot), so the run-start teardown has to shrink the robot back down as well as fade the button, and that scale-down is a 0.25s CSS transition on `.avatar` while the ticket asks for an immediate cut on the coach mark.
**Options considered**:
- A) Let the robot shrink on its existing 0.25s transition; only the coach mark cuts.
- B) Suppress the transition on this route so the whole thing is one cut.

**Decision**: **A**, and it is not really a choice. The transition lives on the base `.avatar` rule rather than on `.coached` (`hazbot-button.scss:46-47`), deliberately and with a comment saying so, which means the shrink already animates on all three existing close routes: terminal Done, the close button and Escape. `.coached` is `ui.showHazbotFeedback && !tourActive`, so clearing the flag from outside removes the class and the same transition runs. Option A is therefore zero code and consistent with everything the student has already seen, while B would add code to make the run-start route the only one that snaps. Recorded in Out of Scope.

## Self-Review

### Senior Engineer

#### RESOLVED: The teardown route and the disabled state are two changes that must land together, and the spec treats them as one
Disabling the button is a two-line change (`disabled={simulation.simulationRunning}` plus a CSS rule). Tearing down an open coach mark safely means either resetting `tourActive` on the cleanup path or restructuring how that path signals. Shipping the first without the second produces the soft-lock. The requirements list them as separate bullets with no stated ordering, and nothing marks the dependency.

**Decision**: accepted, with the dependency now stated in the requirement itself, and it is narrower than the finding assumed. The ordering constraint is not "teardown before disabling"; it is that the **`.noHazbot` class gate** lands with or before the teardown, because the gate is what makes the stuck state unreachable. Disabling the button on its own is safe in any order: with no external writer of `ui.showHazbotFeedback`, the soft-lock is not reachable. That matters for slicing, since it means the disabled half genuinely can ship alone (see the PM finding below).

---

#### RESOLVED: Resetting `tourActive` in the effect cleanup may be the wrong fix
The obvious repair is to call `setTourActive(false)` unconditionally in the effect's cleanup. That runs on unmount as well, where a `setState` on an unmounting component is at best pointless and at worst a warning, and the file already carries a `mounted` ref for exactly that reason on the blink loop. Deriving the tour state from something the render already reads, rather than holding it in a second `useState` that four routes have to remember to clear, would remove the class of bug rather than the instance.

**Decision**: accepted, and the derivation the finding asks for is a single token. `.noHazbot` becomes `(ui.showHazbotFeedback && tourActive) ? css.noHazbot : ""` at `hazbot-button.tsx:289`, which conjoins the flag the render already reads (`.coached` on the line above reads it too). Proved in jsdom during this pass: the landmine case flips from failing to passing and all 35 existing `hazbot-button.test.tsx` cases stay green. It removes the bug the finding names, for the whole time the panel is closed: the state cannot be displayed there, so no route has to remember to clear it. It does not remove the class of bug, which is what the second pass below found. The gate leaves `tourActive` set, and the reopen render reads it before the panel effect clears it, so the run-start teardown clears the flag itself as well (requirement 40). The gate still touches no cleanup path and does no `setState` during unmount, so the `mounted`-ref hazard does not arise; the added `setTourActive(false)` sits in the teardown effect's body, which only runs while mounted. Lifting `tourActive` into the store or deriving it from the effect's `phase` is recorded as out of scope.

---

#### RESOLVED: `disabled` on the MUI Button interacts with the existing `onMouseDown` preventDefault
The button suppresses focus-on-click with `onMouseDown={(e) => e.preventDefault()}` so the coach mark's focus restoration does not leave a visible ring. A disabled MUI button does not fire mouse events at all, so the handler is inert while disabled, which is fine. Worth confirming that the focus-restore path cannot land on a now-disabled button when a run starts while the coach mark is closing.

**Decision**: confirmed inert; no work. Reading the pinned library's `destroy()` (`dist/index.js:1486-1519`), focus is restored only when focus is already inside a coachmarks popover (`focusInEngine`), which requires the student to have tabbed into it, and the target is then the step's own anchor element: the avatar `<span>` for the intro, a bottom-bar control for a tour. The Hazbot `<button>` is never the restore target, so a disabled button cannot be focused by this path. Even in the tabbed-in case a failed `focus()` would leave focus on `<body>`, with no visible consequence, since the `onMouseDown` preventDefault means the button was never focused on click to begin with. The handler is inert while disabled, as the finding says, because a native disabled button dispatches no mouse events.

---

### QA Engineer

#### RESOLVED: "Enabled while paused" needs a test per pause route, not one
There are three ways `simulationRunning` goes false and they arrive through different code: the Pause press in `handleStart`, `handleFireLine`'s `simulation.stop()`, and the fire burning out in `tick()`. The requirement is written once and would naturally get one test. The Fire Line route is the one most likely to regress, because WM-29 is rewriting that interaction in the same sprint.

**Decision**: accepted; the requirement now names one case per route. All three were confirmed on this branch: `bottom-bar.tsx:266` (Pause), `bottom-bar.tsx:370` (Fire Line), `simulation.ts:496` (burnout). One correction and one addition. The correction: the enumeration is complete, and `handleHelitack` (`bottom-bar.tsx:380-386`) is deliberately **not** a pause route, so a Helitack drop leaves Hazbot disabled. The addition: the Fire Line route is not only the likeliest to regress, it is the one whose *intended* behavior is now in question, since it enables Hazbot mid-intervention. That is the new open question above, and the test for this route should be written after it is answered.

---

#### RESOLVED: The blink requirement is only testable with pinned randomness, and that should be said
The idle interval is `1000 + Math.random() * 2500`, so a test that advances timers by a fixed amount either pins `Math.random` or is flaky. The throwaway run hit this: advancing 3600ms fired the blink *and* its 180ms close in the same tick and observed eyes-open, which looks exactly like "blinks are stopped". A test asserting blinks are paused could pass against unmodified code for that reason.

**Decision**: accepted verbatim; the requirement now says "with `Math.random` pinned and timers advanced to the exact boundary". This is the standing repo concern about tests that cannot fail, in its most literal form: the naive version passes against the unfixed code. The loop's shape (`hazbot-button.tsx:68-84`) makes the boundary explicit: with `Math.random` pinned to 0 the eyes close at exactly 1000ms and open again at 1180ms, so the assertion has to land inside that 180ms window to mean anything.

---

#### RESOLVED: No stated criterion for the state of a *closed* coach mark when the run starts
Every requirement is written for the case where a coach mark is open. The common case is that none is open, and the button simply fades. Nothing says the fade must not be accompanied by any of the teardown side effects (no log event, no state reset visible to the student), which is the behavior a careless implementation would get wrong by running the teardown unconditionally on every run start.

**Decision**: accepted; added as a requirement, and the implementation shape that satisfies it is now named. Writing `ui.showHazbotFeedback = false` when it is already `false` is inherently silent, because MobX's default comparer suppresses same-value assignments, so no reaction runs, nothing re-renders and nothing logs. The requirement is phrased to say this must fall out rather than be suppressed by a guard, which is what keeps the careless implementation the finding describes (calling a teardown routine directly on every run start) from satisfying it.

---

### Product Manager

#### RESOLVED: The story's title and its actual cost point at different halves
"Disable Hazbot while model is running" reads as a two-line change and is pointed 3. The points are in the coach-mark teardown and its logging semantics, not in the disabling. That matters for how the work is sliced if the sprint runs short: the disabled state alone is shippable and useful, the teardown alone is not, and the spec should say which half survives a cut.

**Decision**: accepted as a finding, and the answer is that no slice is planned, because the deep dive inverts the premise. The teardown half turned out cheap: a three-line `useEffect` plus a one-token change to the class expression, both proved in jsdom during this pass. The disabling half turned out to carry a hidden cost the story had not counted: MUI renders a disabled button at `opacity: 0.25`, so the "two-line change" ships the wrong visual unless it also carries an override rule with the right selector shape, plus the blink gate, which is real work rather than a side effect. What survives a cut is also clearer now: the disabled half genuinely can ship alone, because the soft-lock is only reachable once something outside the component writes `ui.showHazbotFeedback`, and nothing does today. The teardown cannot ship without the class gate, but that is one token in the same file, so the two are not really separable halves. The remaining uncounted cost was the logging decision, and it is now resolved above to a distinct `HazbotCoachMarkHiddenByRun` event, whose implementation measured at one `log()` call in a cleanup the panel effect already has, plus a `LOGGED-EVENTS.md` row and no `translate.ts` change. So the three parts (the disabled visual with its opacity override and blink gate, the teardown with its class gate, the log row) are each small and land in one file plus one doc. The story stays a 3 and ships whole. What survives a cut, if it ever comes to that, is the disabled half: it is shippable alone because the soft-lock is only reachable once something outside `hazbot-button.tsx` writes `ui.showHazbotFeedback`, and nothing does today.

---

#### RESOLVED: The policy is recorded in three places and only two of them agree
Trudi's Slack message of 2026-08-18 16:40 is the decision. It is mirrored into the ticket as comment 42290 and written into the description. The description then contradicts itself in its last line. Anyone picking this up from Jira alone reads the contradiction and has no way to know which is current. Striking that line is a one-minute action with real value, and it is already on the ask list.

**Decision**: accepted, and answered by the first open question above: the edit is made, and it does not block the branch. One correction to the finding as written. It supposed the contradiction was two lines, the second being the policy sentence's own ambiguity about which pauses count. It is one line. "Ready to respond to the current model setup" already describes a half-burned model, which is the reading the Fire Line question resolved to, so the policy sentence stands as written and only the trailing musing is struck.

---

### Student

#### RESOLVED: A disabled Hazbot gives no hint about when it comes back
The student sees a faded, unblinking robot for the duration of a run with nothing indicating that it will return. Michael's answer was the opacity treatment alone and the explanatory-message alternative was rejected for good reasons, so this may simply be the accepted cost. But the run can last a while, and the robot stopping its blink is the only signal, which reads as "broken" as easily as "waiting".

**Decision**: already answered authoritatively, and recorded in Out of Scope: Michael specified the opacity treatment alone, and the explanatory popover was rejected by Trudi for leaving a stale message after the run ends. Nothing here reopens that. What the finding does usefully is name the failure mode the blink question above turns on, and that half is now decided in its favor: forcing eyes open rather than freezing the current frame is specifically what keeps the robot from reading as broken, which it would have done roughly 7% of the time under the freeze-the-frame implementation.

---

#### RESOLVED: Losing an open coach mark to a run start is silent and unrecoverable in one step
A student mid-tour who presses Start loses the guidance with no acknowledgment, and nothing brings it back. That is the decided behavior, and reopening is one click, but the reopened tour starts from the beginning of whatever the engine now matches, which may be a different category than the one they were being walked through.

**Decision**: confirmed and worth recording, but nothing to change. It is stronger than "may be": the category is read fresh at open time (`hazbot-button.tsx:125-126`, via `getAnalysisEngine()` and `computeCategorySelectionForEngine`), and this story disables Hazbot for the whole run, so the student cannot reopen until the run has finished and the engine has consumed an entire run's worth of new readings. A different category is the expected case, not an edge one. WM-32 compounds it in the same sprint: the reopened tour may also start at a different step, since its skip re-evaluates which leading anchors are dead. Both follow directly from decisions already made (the coach mark does not return by itself; Hazbot stays disabled during the run), and the only alternatives would reverse one of them, so this is documentation rather than a change.

---

### Education Researcher

#### RESOLVED: A silent teardown makes an abandoned tour indistinguishable from a completed one in the log
With the cleanup path logging nothing, a tour ended by a run start produces a `HazbotShowMeClicked` with no matching `HazbotTourCompleted` or `HazbotTourDismissed`. That is the same signature as a session that ended mid-tour, or a page reload. Any analysis counting completion rates would need to reconstruct the difference from `SimulationStarted` timestamps. This is the substance of the logging open question, and it argues for deciding it before the code, not after.

**Decision**: accepted, and answered by the logging question above, which resolved to a distinct `HazbotCoachMarkHiddenByRun` event. The finding's evidence is what decided it: there is now a named consumer this would affect, which turns the finding from a general concern into a concrete one. `specs/WM-45-analysis-last-run.md:103` records Sam's choice-at-maximum flow deriving coach-mark completion from `HazbotShowMeClicked` paired with the `lastStepIndex` on `HazbotTourCompleted` / `HazbotTourDismissed`, on 2026-08-21. Under the log-nothing option that derivation cannot distinguish abandonment-by-running from abandonment-by-leaving, and abandonment-by-running is a *pedagogically meaningful* action (the student chose to go run the model, which is often what the coach mark asked for) rather than a dropout. The reconstruction from `SimulationStarted` timestamps that the finding describes is possible but fragile, since it depends on clock ordering across two unrelated events. The `phase` field on the new event is the part that answers this finding directly: it separates an orphaned tour from an intro the student never got past, which the reconstruction from `SimulationStarted` timestamps could not have recovered either.

---

## Self-Review: second pass

Roles: Senior Engineer, QA Engineer, Education Researcher, Visual/Design. Every finding below was
verified against the code on this branch before being written: the decided implementation was built
out in the working tree, typechecked, and driven by throwaway Jest cases (six probes, since deleted);
the Zeplin board was re-measured through the inspect MCP; `npx jest` was re-run for the baseline. The
tree is back at its baseline with no source changes.

### Senior Engineer (second pass)

#### RESOLVED: `lastStepIndex` is not in the panel cleanup's scope, so the payload does need extra state

The logging decision above says the panel effect's cleanup "already closes over `ruleSetId`,
`matched`, `phase` and `lastStepIndex`", and requirement 38 rests on that. Three of the four are in
scope; `lastStepIndex` is not. It is declared with `let` **inside `openTour`** (`hazbot-button.tsx:166`),
so the effect-level cleanup at `:254` cannot see it. Building the decided implementation verbatim
fails to compile: `src/components/hazbot-button.tsx: error TS2304: Cannot find name
'lastStepIndex'`. Hoisting the declaration to the effect scope (next to `cleanup`) and turning
`openTour`'s line into a reassignment makes it compile and behave, but that is a change to existing
tour code, not a free read. Suggested resolution: state the hoist in the requirement or Technical
Notes so it is not discovered at implementation time, and drop the "reachable with no extra state"
framing.

**Decision**: accepted. The logging question's Decision now states which three fields are effect-level
bindings and that `lastStepIndex` must be hoisted out of `openTour`, citing the `TS2304` the verbatim
implementation produces, and the "no extra state" framing is gone. Requirement 38 is unchanged: it
names the payload and where the call lives, both of which still hold.

---

#### RESOLVED: the class gate leaves `tourActive` stale, so the *reopen* after a run-start teardown flashes the tour state

The gate makes `.noHazbot` unreachable **while the panel is closed**, which is what it was chosen for.
It does not clear `tourActive`, and the only writer that clears it on this route is the panel effect's
own `setTourActive(false)` (`hazbot-button.tsx:124`), which runs after the commit that reopened the
panel. So on the student's first reopen after a run, the render that sets `ui.showHazbotFeedback = true`
still sees `tourActive === true` and commits `.noHazbot`: the faded, robot-hidden state, one render
before the effect clears it. Confirmed in jsdom with a `MutationObserver` on the wrapper's `class`
attribute across the reopen: the recorded value is `"hazbotButtonWrap noHazbot"`. The Senior
Engineer decision above says "no route has to remember to clear anything"; that holds for the
closed panel and not for the reopen.
Suggested resolution: have the run-start teardown effect clear both (`ui.showHazbotFeedback = false;
setTourActive(false);`) and keep the gate as the belt-and-braces half. The unmount `setState` hazard
that ruled this out for the effect *cleanup* does not apply here, since the teardown effect body only
runs while mounted. Whichever way it lands, the reopen deserves a test case.

**Decision**: accepted in full. Requirement 40 now asks for both halves, the teardown clearing
`tourActive` at the source and the gate as the second layer, and says why neither substitutes for the
other. A Technical Note records the mechanism and the `MutationObserver` evidence. Requirement 42
gains the reopen case. The earlier Senior Engineer decision that claimed this "removes the class of
bug rather than the instance" is corrected in place to say what it actually covers.

---

### Education Researcher (second pass)

#### RESOLVED: `HazbotCoachMarkHiddenByRun` fires when no coach mark was ever displayed

Requirement 39 mandates that `LOGGED-EVENTS.md` state "the event fires only when a coach mark was
actually open, so its absence on a `SimulationStarted` means nothing was showing". The decided
implementation cannot honor that. The panel effect registers its cleanup at `:254`, but the popover
itself is opened later, by `openOnce` on the avatar's transform `transitionend` or the 400ms fallback
(`:232-253`). Between the Hazbot click and that moment, the cleanup exists and `intro` is still `null`,
so a run started in that window logs the event with nothing on screen. Reproduced in jsdom: clicking
Hazbot, advancing 100ms, then setting `simulationRunning = true` creates zero coachmarks engines and
still logs `{ ruleSetId: "23", categoryId: 2, phase: "intro", lastStepIndex: null }`. The window is
250 to 400ms wide and needs a Start press inside it, so it is rare rather than theoretical, but the
false positive is indistinguishable in the log from a real intro teardown, which is exactly the
distinction the event exists to carry. Suggested resolution: gate the log on an engine actually
existing (`intro || tourEngine`) rather than on `simulationRunning` alone, and cover the pre-open
window with a test.

**Decision**: accepted. Requirement 38 now carries the `intro || tourEngine` term alongside the
`simulationRunning` gate, requirement 42 gains the pre-open case, and a Technical Note records the
deferred-open window and the jsdom reproduction so the extra term is not later read as redundant.
Requirement 39 is unchanged: with the fix its mandated wording is true.

---

#### RESOLVED: the `categoryId` note under the Hazbot table is part of what this change invalidates

`LOGGED-EVENTS.md:100-112` carries a subsection, "### `categoryId` on the tour events
(`appRulesVersion` 6 onward)", which opens "On `HazbotShowMeClicked`, `HazbotTourCompleted` and
`HazbotTourDismissed`, `categoryId` is the category the feedback was selected from, i.e.
`categoryUsed`". `HazbotCoachMarkHiddenByRun` carries the same field with the same meaning: the
cleanup reads `matched`, which is bound from `readCategories(engine).used` at `hazbot-button.tsx:126`.
Requirement 39 lists three things the new row must say and does not mention this note, so the
enumeration would be left naming three of four events and a reader could not tell whether the new
event's `categoryId` is `categoryUsed` or `matchedCategory`. Suggested resolution: add the event to
that sentence as part of the same doc deliverable.

**Decision**: accepted. Requirement 39 now names the `categoryId` subsection alongside the table row as
part of the same doc deliverable, and records that the note's body needs only the fourth event name.

---

### QA Engineer (second pass)

#### RESOLVED: the named Cypress home does not render the Hazbot button, and the state-machine spec is unaddressed

Requirement 43 sends the 0.35 assertion to `bottom-bar-visuals.cy.ts` as "the existing home for this
kind of assertion". That file visits `/?preset=plainsTwoZone` (`:18`), with no `hazbotRules` param,
and the button only mounts under `{hazbotEngine?.ruleSet && ...}` (`bottom-bar.tsx:243`), so the
element does not exist on that page at all. The assertion needs its own visit URL, or a different
file. Separately, `bottom-bar-state-machine.cy.ts` is the WM-24 guard that asserts the HTML `disabled`
attribute for all seven bottom-bar controls across the lifecycle states, from the same Zeplin
matrix whose state 4 this story quotes. WM-31 adds Hazbot to that matrix, so its `expectButtonStates`
helper (`:56-67`), its state-4 case, and its header comment all describe a contract this story
changes, and the spec never mentions the file. It already has a `Hazbot button pulse (WM-6)` describe
block on a `hazbotRules=23` URL (`:234-262`), which is the natural home for both the disabled-attribute
and the opacity assertions. Suggested resolution: name the real target file(s) in requirement 43 and
add the state-machine coverage as an explicit deliverable.

**Decision**: accepted on both halves. Requirement 43 now sends both browser assertions to the
`Hazbot button pulse (WM-6)` block in `bottom-bar-state-machine.cy.ts` and says why not
`bottom-bar-visuals.cy.ts`, and a new requirement names the helper, the state-4 case and the header
comment as things this story updates. The `identity-obj-proxy` justification is unchanged and was
re-verified against the Jest config. One point in the old wording's favor, recorded so it is not
re-litigated: `bottom-bar-visuals.cy.ts` does already drive a run (`placeSparkInZone` then Start,
`:127-128`), so reaching the running state in Cypress is proven; only the URL and the button's
existence were wrong.

---

#### RESOLVED: `simulationRunning` falls on four routes, not three

Technical Notes line 57 says "there are exactly three routes" and requirement 42 asks for "one case
per pause route: the Pause press, the Fire Line placement, and the fire burning out in `tick()`".
There is a fourth: `restart()` sets `simulationRunning = false` (`simulation.ts:409`), and `reload()`
calls `restart()` (`:437`). Restart is enabled throughout a run (`restartEnabled` is
`simulationStarted`, `simulation.ts:158`), so pressing it mid-run re-enables Hazbot. Confirmed in
jsdom: with the button disabled mid-run, `simulation.restart()` flips it back to enabled. The
behavior is right (the model is not running), but the enumeration is not, and the sentence it appears
in is the one arguing that one predicate covers everything. Suggested resolution: correct the count,
say what Restart/Reload do, and decide whether the Restart route earns a test case of its own.

**Decision**: accepted on the fact, with the scope narrowed. The Technical Note now says the flag is
cleared from three places reached by four UI routes, names Restart/Reload, and explains that Restart
is a discard rather than a pause (it logs `SimulationEnded` + `SimulationRestarted`, not
`SimulationStopped`). It also records an interaction the spec had missed: `SimulationRestarted` and
`SimulationReloaded` are modifiers in `translate.ts` that close the open run window, so a mid-run
Restart changes what the next Hazbot click reports as well as re-enabling the button. Requirement 42
keeps its pause-route list at three and gains one separate case for Restart, rather than promoting
Restart to a fourth peer.

---

### Visual / Design (second pass)

#### RESOLVED: the board measurements and the disabled-visual reasoning check out

Re-measured through the Zeplin inspect MCP on the *Updated Wildfire Controls and Labels* board
(project `5fe47ae231d1f6a428c53450`, screen `6a8566a1c90489f7be36e66a`). The `Hazbot Button States`
column's **Disabled** cell at (1176, 2073) reports `opacity: 0.35` on the whole `Hazbot Button` group,
labeled "Disabled / while model is being run (occurs when Sta…", and its `Hazbot Button - Placement`
child (the robot) is present, while the **No Hazbot Default** cell at (1176, 2005) has no such child.
So "whole button at 35%, robot kept" is right, and a root `opacity` is the correct shape rather than
the `> span` fade the other bottom-bar controls use. No `filter` or effect is specified on the cell,
so the `grayscale(1)` that `icon-button.scss:49-84` and `bottom-bar.scss:302-328` apply to the other
disabled controls is correctly absent here. Those two files also independently corroborate the
`opacity: 0.25` measurement, in comments predating this story. Recorded because the repo's established
disabled pattern is visibly different from the one this story picks, and the next engineer will
otherwise wonder why.

---

#### RESOLVED: three factual slips in Technical Notes

Minor, but they are the citations a reader will follow. (a) Line 51 says the button's border is
`1px #797979`; it is `1.5px solid #797979` (`hazbot-button.scss:25`). (b) Background line 21 cites
`:495` for the burnout write; it is `simulation.ts:496`, which is what Technical Notes line 57 says,
so the spec disagrees with itself. (c) Lines 57, 109 and 221 cite `bottom-bar.tsx:369` for the Fire
Line `simulation.stop()`; `:369` is the `wasRunning` read and the `stop()` is `:370`.

**Decision**: accepted; all three corrected in place, no prose restructuring. (b) was the one worth the
ink beyond tidiness: the same fact was stated two ways in one document.

## Self-Review: third pass

Roles: Education Researcher, Education Material Developer / Student, QA Engineer, Senior Engineer,
Visual / Design. Every finding below was verified before being written. The decided implementation
(disabled prop, opacity override on a third wrapper class, blink gate, run-start teardown with
`setTourActive(false)`, the `.noHazbot` gate, the hoisted `lastStepIndex` and the cleanup log) was
built out in the working tree, typechecked, linted, driven by throwaway Jest probes, and exercised
live in Chrome against the dev server on `?preset=plainsTwoZone&hazbotRules=23`. The tree is back at its
baseline with no source changes.

**What the pass confirmed rather than challenged**, recorded so it is not re-derived: the decided
implementation compiles, adds no test failures (every existing case stays green), and behaves live
exactly as specified. Measured in Chrome mid-run: `disabled` present, computed `opacity` 0.35,
`pointer-events: none`, `#c1daff` background and `#222` label surviving, eyes-open layer showing and
the blink layer absent. Starting a run with the intro popover open took the wrapper from `coached` to
the disabled class in one commit, destroyed all nine popover nodes, and left the robot visible with
`transform: none`. A separate probe also disproved a suspicion worth recording: the run-start
`useEffect` does **not** depend on `pulsing` having dereferenced `simulationRunning` (it is
short-circuited away whenever `hazbotPulseArmed` is false, which is its state on every click). The
dep array `[simulation.simulationRunning]` is itself evaluated during render, so it establishes the
MobX observation on its own.

### Education Researcher (third pass)

#### RESOLVED: four live tours end by telling the student to press Start, so the new event fires on the tour's success path and the mandated doc wording calls it abandonment

Requirement 39 mandates that `LOGGED-EVENTS.md` say a `HazbotShowMeClicked` terminated by
`HazbotCoachMarkHiddenByRun` is an **abandonment-by-running**. For four of the live coaching tours
that is the opposite of what happened. `tour-map.tsx` gives 41/2, 44/2, 46/2 and 46/4 a terminal
`anchor("start-button")`, and `tour-data.generated.ts` gives each the terminal text *"Click **Start**
to run the model!"*. `buildTour` makes the terminal step Done-terminated (no `advanceOn`), so the
popover is still on screen while the student reads it and presses Start. The student who does exactly
what the tour asked produces the abandonment event.

Verified against the decided implementation in jsdom, driving ruleset 41 category 2 through
`[Show me]` to the terminal step and then setting `simulationRunning = true`: the only event logged is
`HazbotCoachMarkHiddenByRun { ruleSetId: "41", categoryId: 2, phase: "tour", lastStepIndex: 1 }`, and
`HazbotTourCompleted` never fires. So this story also silently moves those four categories' completion
counts toward zero, which is a break in the WM-45 derivation's denominator in the opposite direction
from the one the spec is guarding against.

Suggested resolution: `lastStepIndex === stepCount - 1` separates the two cases and `stepCount` is
already on `HazbotShowMeClicked`, so nothing new needs logging. Requirement 39's third mandated note
should say what the event actually means (the run started while a coach mark was up) and record that a
terminal `lastStepIndex` on a Start-anchored tour is compliance rather than abandonment, naming the
four categories.

**Decision**: accepted as a documentation defect rather than a design one, and no new field is logged.
Requirement 39's third mandated note is rewritten: the event means only that a run started while a
coach mark was up, `lastStepIndex` below `stepCount - 1` is abandonment-by-running, a terminal
`lastStepIndex` on a Start-anchored tour is compliance, and the row names the four categories. A
Technical Note records the four tours and the measured before/after. The behavioral alternative
(exempting a tour sitting on its terminal step from the teardown) was rejected: it puts a coach mark
back on screen during a run, which is the state this story exists to remove. A third option, logging
the distinction as its own field, was rejected as storing a value that `lastStepIndex` and the paired
`stepCount` already derive. The count shift for 41/2, 44/2, 46/2 and 46/4 is silent in the data, so it
is recorded as a non-blocking message to Sam alongside the Trudi ask in the first open question.

---

### Education Material Developer / Student (third pass)

#### RESOLVED: two tours instruct the student to act *while the model is running*, and this story deletes the instruction at the moment they start

Rulesets 44/3 and 46/3 carry the terminal text *"Add both a **Fireline** and a **Helitack**
while the model is running. Click **Start** to begin!"*, anchored on `fireline-button`. Under this story pressing
Start destroys that popover, Hazbot is disabled for the whole run, and requirement 36 says the coach
mark does not come back. The student loses the half of a two-part instruction that describes what to do
during the run, at exactly the moment it becomes actionable, and has no way to re-read it until the run
is over.

This is not the case Out of Scope already covers: that entry rejects an affordance *explaining why
Hazbot is unavailable*, which is a different question from guidance that was already on screen and is
now removed mid-task. Verified from `tour-map.tsx:131` / `:136` and `tour-data.generated.ts:160-163` /
`:170-173`; the Fire Line pause also means the student can reach Fire Line during the run, so the
instruction is followable, just no longer readable.

Suggested resolution: decide and record it rather than leaving it implicit. Either scope it (state that
44/3 and 46/3 coaching is degraded by this story and name the follow-up), or exempt a tour whose
terminal step spans the run from the teardown. Trudi should see this case, since it is her policy that
produces it.

**Decision**: scope it and route the real fix to content. Out of Scope gains an entry naming all three
categories, the lost during-run instruction and the reopen-restarts-at-Restart consequence, and a
Technical Note records the tours, the run-spanning authoring intent at `tour-map.tsx:19`, and why the
Fire Line pause is not an escape hatch. The instruction text is build-time generated from each
category's authored `visualFeedback`, so re-authoring those three terminal steps is **Trudi's**, as the
owner of the feedback-table content (Sam owns the rules, not the copy); it is added to the same
non-blocking message that already carries the description edit. Exempting run-spanning tours from the
teardown was rejected on two counts: it needs a new authored flag in `tour-map.tsx` marking which
terminal steps span a run, and it leaves a coach mark on screen during a run, which is the state this
story exists to remove. Auto-reopening at the end of the run was rejected as contradicting requirement
36 and returning stale guidance about a finished run.

---

### QA Engineer (third pass)

#### RESOLVED: requirement 44 cannot be implemented as written; the state-machine block's URL has no `hazbotRules`, so the Hazbot button does not exist for any of its cases

Requirement 44 asks this story to add Hazbot to `bottom-bar-state-machine.cy.ts`'s `expectButtonStates`
helper (`:56-67`), its state-4 case and its header comment. The helper is called by every state
case, and every one of them runs under a `beforeEach` that visits
`APP_URL = "/?preset=plainsTwoZone"` (`:54`, `:87`) with no `hazbotRules` param, so the button never
mounts (`bottom-bar.tsx:243` gates it on `hazbotEngine?.ruleSet`). Adding a `hazbot` key to the helper
fails every case on a missing element, not just state 4.

Verified live in Chrome on the running app at that exact URL: the seven bottom-bar controls are all
present in the DOM and `[data-testid="hazbot-button"]` is absent; adding `&hazbotRules=23` makes it
appear. This is the same defect the second pass caught in `bottom-bar-visuals.cy.ts`, one file over.

Suggested resolution: requirement 44 has to name the `APP_URL` change (adding `hazbotRules=23`) as part
of the deliverable and say what it costs, namely that all the WM-24 lifecycle cases then run against a
rule-set-loaded page.

**Decision**: accepted, and one thing added that the finding missed. Requirement 44 now names four
changes rather than three: the `APP_URL` gains `&hazbotRules=23`, the helper gains a `hazbot` key that
**every** call site must supply, state 4 flips it to disabled, and the header comment is rewritten. The
header needs more than the eighth control: it currently states the file covers no visual styling and
that "there is no automated assertion of the rendered styles", which requirement 43's 0.35 assertion
makes false. The URL change was measured live before being accepted: with the rule-set loaded, state 1
and state 4 read exactly what the existing cases assert, so nothing in the WM-24 matrix moves. Its cost,
that those cases now depend on the Hazbot engine loading, is recorded in the requirement and judged
acceptable since the `Hazbot button pulse (WM-6)` block in the same file already carries it. Asserting
Hazbot only in that WM-6 block was rejected: requirement 44's own argument is that Hazbot is the eighth
control in the matrix this file guards, and that option leaves the guard permanently one short. A
separate Hazbot-only lifecycle block was rejected as duplicating the state-driving code once per state.

---

### Senior Engineer (third pass)

#### RESOLVED: the run-start teardown effect as written trips `exhaustive-deps`, and this repo does not silence that rule

The Decision at the teardown question writes the effect body as
`if (simulation.simulationRunning) ui.showHazbotFeedback = false;`, and requirement 40 adds
`setTourActive(false)`. Keyed on `[simulation.simulationRunning]` alone, `npx eslint` reports
`React Hook useEffect has a missing dependency: 'ui'`. The standing repo position is that an
`exhaustive-deps` disable means the effect is shaped wrong, and the panel effect below it already
carries one, so a second would read as the pattern spreading.

There is no restructuring needed: `ui` is a stable store object, so `[simulation.simulationRunning, ui]`
lints clean and changes nothing about when the effect runs. Verified both ways against the built
implementation. The blink gate needs no such treatment: `simulation.simulationRunning` as a member
expression satisfies the rule on its own.

Suggested resolution: one clause in the Decision or Technical Notes naming the dep array, so the
implementer does not reach for a disable.

**Decision**: accepted, applied without asking since there is no choice to make: `ui` is a stable store
object, so `[simulation.simulationRunning, ui]` lints clean and changes nothing about when the effect
runs. The teardown question's Decision now names the dep array. It also loses the claim that `pulsing`
is what makes the component observe `simulationRunning`, which this pass disproved: the read is
short-circuited whenever `hazbotPulseArmed` is false, which is its state on every click, and the dep
array is what establishes the observation.

---

### Visual / Design (third pass)

#### RESOLVED: the second pass's border correction replaced a measured value with a declared one, inside the note that records measurements

Technical Notes' *"MUI already fades a disabled button, to 0.25"* paragraph is explicitly a record of
what was measured in Chrome, and it now reads "the `#c1daff` background and the `1.5px #797979` border
hold (both carry `!important` ...)". Measured live in Chrome at `devicePixelRatio` 1 on the running
app, mid-run with the disabled state applied: `getComputedStyle(button).borderWidth` is **`1px`**, not
`1.5px`. Chrome floors a sub-pixel border to whole device pixels. The source does declare
`border: 1.5px solid #797979` (`hazbot-button.scss:25`), so the second pass's finding was right about
the *declaration* and wrong to write it into a sentence about the *measurement*, which is where the
original `1px` came from.

It matters only because requirement 43 sends a browser assertion to Cypress: an assertion written off
this line asserts 1.5px and fails.

Suggested resolution: say both, e.g. "the border holds (declared 1.5px; computes to 1px at DPR 1)".

**Decision**: accepted, applied without asking. The measurement paragraph now says the border is
declared `1.5px` and computes to `1px` at `devicePixelRatio` 1 because Chrome floors a sub-pixel
border, and that a browser assertion must expect 1px. Both the second pass and the first were half
right: the declaration is 1.5px and the rendered value is 1px, and the sentence they were arguing over
is about the rendered value.
