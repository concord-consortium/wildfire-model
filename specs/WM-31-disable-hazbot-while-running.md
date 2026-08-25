# WM-31: Disable Hazbot while the model is running

**Jira**: https://concord-consortium.atlassian.net/browse/WM-31

**Status**: **Closed**

## Overview

Hazbot analyzes the student's runs, but nothing stopped a student from clicking it while the fire was actively burning, so it answered about a model that was changing underneath the answer. This story disables the Hazbot button while the model is actively running, at 35% opacity with its blink cycle paused, and tears down any coach mark that is open when the run starts.

Trudi's policy, settled in Slack on 2026-08-25 after she reviewed the branch build: Hazbot waits for the whole run. A paused model still counts as running, so the button is unavailable from Start until the fire stops burning, pauses for a Fire Line included. Once the fire is out it can be clicked as many times as the student likes, and it is available before the first run as it always was. During a run the button is visibly unavailable rather than silently unhelpful, and the robot stops blinking so it reads as asleep rather than idle.

## Requirements

Numbered R27 to R44a, continuing the numbering the interview used.

- **R27.** The Hazbot button is disabled while a run is in progress and enabled whenever one is not. "In progress" is `simulation.runInProgress`, a computed reading `simulationStarted && !simulationEnded`, so it spans both pause routes (a Pause press and a Fire Line placement each stop the run without ending it), is false before any run has been made, and goes false on its own when the fire burns out or when a Restart or Reload discards the run. The predicate lives on the store rather than in the component so the browser tests and the unit tests read the same definition.
- **R28.** There is no cap on how many times Hazbot may be clicked once a run has ended.
- **R29.** While disabled, the whole button renders at 35% opacity: the robot, the "Hazbot Analysis" label, and the button back together.
- **R30.** The 35% is an override, not an addition. A MUI `Button` carrying `disabled` already renders at `opacity: 0.25` (measured live), so shipping `disabled={simulation.simulationRunning}` without a rule of its own produces a visibly darker button than the board specifies. The override uses the wrapper-class selector shape the file already uses, which wins on specificity without `!important`.
- **R31.** The 0.35 appears in exactly one place in `hazbot-button.scss`, shared with the existing `.noHazbot` rule rather than written twice.
- **R32.** `pointer-events: none` is not part of the disabled rule. MUI's disabled styling already applies it and the `disabled` attribute already blocks the click. Only `.noHazbot`, which has no `disabled` attribute, needs it.
- **R33.** While disabled, the robot's blink cycle stops and the robot holds eyes open. It resumes from the top of the loop when the button re-enables.
- **R34.** The disabled button is not clickable and does not open the feedback panel.
- **R35.** If a coach mark (intro popover or walk-through tour) is open when a run starts, it is hidden and the button returns to its small default appearance before taking the disabled treatment. The coach mark cuts immediately; the robot's shrink animates on the existing 0.25s `.avatar` transition, exactly as it already does on every other close route.
- **R36.** A coach mark hidden by a run start does not return by itself. The student reopens Hazbot after the run.
- **R37.** When no coach mark is open, a run start has no side effects at all: no log event, no visible state change beyond the fade. The teardown is written so that this falls out rather than being suppressed by a condition.
- **R38.** A coach mark torn down by a run start logs `HazbotCoachMarkHiddenByRun` with `{ ruleSetId, categoryId, phase, lastStepIndex, feedbackLevel }`, where `phase` is `"intro"` or `"tour"` and `lastStepIndex` is null on the intro. It is emitted from the panel effect's cleanup, gated on `simulation.simulationRunning` **and** on a coach mark actually existing (`intro || tourEngine`), so the existing user routes log exactly what they logged before, the nothing-open case stays silent, and a run started before the popover has opened stays silent too.
- **R39.** `LOGGED-EVENTS.md` is a deliverable of this story rather than a follow-up. WM-54 landed first, reversing the order its R9a assumed, so the row is written with the current rule-set ids from the start. This story does **not** take `APP_RULES_VERSION` to 9. The new row must state three things a reader cannot infer from the payload: that the event fires only when a coach mark was actually open; that `phase: "intro"` carries a null `lastStepIndex`; and what the event does and does not say about intent. `HazbotCoachMarkHiddenByRun` also joins the `ruleSetId` enumeration under "Rule-set ids renumbered", since it carries that key and the renumbering applies to it. The `categoryId` subsection is part of the same deliverable: it gains the fourth event name, is retitled from "tour events" to "coach-mark events", and its closing sentence is rewritten.
- **R40.** The button must not be left in the tour's faded state after a panel teardown from outside the component, and must not return to it on the next open. Two things are needed and neither substitutes for the other: the `.noHazbot` class is gated on `ui.showHazbotFeedback` as well as on `tourActive`, and `tourActive` is cleared on every such teardown. The gate lands with or before the run-start teardown; shipping the teardown without it produces a permanently unclickable button. `tourActive` is cleared in one place, the panel effect's closed branch, rather than at each external writer: a second writer inside the run-start teardown covers the run route only and leaves Clear All a render behind.
- **R41.** The ready pulse follows the same predicate, which deletes one of its two arming routes. `handleStart`'s pause branch armed the pulse on a manual Stop (WM-6, "a manual Stop counts as a run completed"), and that arm can no longer be seen by anyone: the pulse is gated on the run being over, resuming clears the arm, and a burnout arms it again through the `simulationEnded` reaction. The assignment and its comment come out rather than being left as dead state, and the reaction's comment stops claiming that manual Stop is armed elsewhere.
- **R42.** Unit tests cover: `runInProgress` itself, in `simulation.test.ts`, across the four transitions that move it (first Start, pause, burnout, Restart); disabled for the whole run with one case per route out of the running state (Pause press and Fire Line placement each leave it disabled; burnout in `tick()` and Restart each re-enable it); clicks during a pause do not open the panel; blinks stop while disabled and resume after (with `Math.random` pinned and timers advanced to the exact boundary); a run started with a tour open leaves the button disabled rather than faded-for-tour; reopening after such a teardown lands in `.coached` and never commits `.noHazbot`; the teardown logs `HazbotCoachMarkHiddenByRun` with the right `phase`, `lastStepIndex` and `feedbackLevel` (one case per phase) and mis-logs neither `HazbotTourCompleted` nor `HazbotTourDismissed`; a user dismiss while not running still logs `HazbotTourDismissed` and nothing else; a run start with nothing open logs and clears nothing; and a run started after the click but before the popover opens logs nothing. Two cases name the Clear All route (`ui.resetHazbotFeedback()`) rather than a bare flag write: the teardown leaves the button clickable, and the reopen after it commits no `.noHazbot` render. Plus two cases apart from the pause routes: mid-run Restart leaves the button enabled, and a Helitack drop leaves it disabled.
- **R43a.** The two Cypress cases drive a real burnout rather than a manual Stop, since a Stop no longer ends a run: a helper ticks the engine with a large time step, which advances one spread generation per call, until it reports `fireDidStop`. The fade case asserts the 35% survives a pause and clears on the burnout; the pulse case asserts a pause arms nothing.
- **R43.** The 35% itself is pinned in Cypress, not Jest. SCSS modules resolve through `identity-obj-proxy`, so a Jest assertion on computed opacity reads `""` and passes against any implementation. Both browser assertions go in the `Hazbot button pulse (WM-6)` describe of `bottom-bar-state-machine.cy.ts`, not `bottom-bar-visuals.cy.ts`, which visits a URL with no `hazbotRules` and therefore never mounts the button.
- **R44.** `bottom-bar-state-machine.cy.ts` is prose this change invalidates, not just a place to add a test. Four things change together: `APP_URL` gains `&hazbotRules=23` so the button mounts for every case; the `expectButtonStates` helper gains a `hazbot` key that every one of its ten call sites supplies; state 4 flips it to disabled; and the header comment is rewritten.
- **R44b.** The "Fireline armed" case in the same file asserts `hazbot: false`. Arming the tool pauses the run, so it is the browser-level statement of the pause branch, and it is the case that fails first if the predicate is ever narrowed back to `simulationRunning`.
- **R44a.** State 8 (SetupOpen) asserts `hazbot: true`, which is WM-42's decision rather than this story's. `simulationRunning` is false while the Setup wizard is open, and WM-42 deliberately locked the model controls in `.mainContainer` while leaving the region controls live. The case title changes with it, since "only Setup stays enabled" stops being true once an eighth control is asserted enabled beside it.

## Technical Notes

- **The disabled visual was already half-built, at the same opacity.** Zeplin gives Disabled and No Hazbot Default both `opacity: 0.35`; they differ only in whether the robot is drawn. Disabled keeps the robot, No Hazbot removes it.
- **MUI fades a disabled button to 0.25**, measured live. Everything else survives: the `#c1daff` background and `#797979` border hold, and the label keeps `color: #222` because `.label` sets it on the span. The border is declared `1.5px` and computes to `1px` at `devicePixelRatio` 1, since Chrome floors a sub-pixel border, so a browser assertion must expect 1px.
- **The override needs the wrapper-class shape, not `!important`.** `.hazbotButtonWrap.<state> .hazbotButton` is specificity 0,3,0 and beats MUI's `.MuiButtonBase-root.Mui-disabled` (0,2,0). A rule written as `.hazbotButton.Mui-disabled` would tie and lose on source order, the same trap the file already documents for `background` and `border`.
- **`simulationRunning` is cleared from three places reached by four UI routes, and only two of them end a run.** `simulation.stop()` serves both pause routes (the Pause press and Fire Line), which leave `runInProgress` true; `tick()` clears the flag on burnout, which is the route that ends a run through `simulationEnded`. Restart is the fourth route and ends the run a different way, by clearing `simulationStarted`: it is a discard rather than a pause, and logs `SimulationEnded` plus `SimulationRestarted` rather than `SimulationStopped`. `handleHelitack` deliberately does not stop the run, so a Helitack drop is not a pause route. Worth knowing downstream: `SimulationRestarted` and `SimulationReloaded` are modifiers in `translate.ts` that close the open run window, so a mid-run Restart changes what the engine reports on the next click as well as re-enabling the button.

- **Only `simulationRunning` carries reactivity into the predicate.** `runInProgress` reads `simulationEnded`, which reads `engine.fireDidStop`, and the engine is not observable. The supported production path is `tick()`, which sets the engine's flag and then clears `simulationRunning` in the same action, so any test seeding a burnout has to assign the stopped engine before flipping the flag, and a test cannot burn a fire out from a paused state without resuming first: the flag is already false, and MobX suppresses a same-value assignment.

- **WM-45's R2a becomes unreachable from the button.** R2a says the newest canonical run counts even when unfinished, so a student who pauses mid-run and asks for analysis is told about the run they are watching. Nothing about the engine changes and the requirement stays true of the data; there is simply no longer a way for a student to ask during a pause. It takes with it the wrinkle R2a recorded, where a fire line drawn during a pause is not in the reading until the student resumes, so a paused student who had just drawn one was told they had not used mitigation.

- **The ticket description still carries the superseded line.** It reads "if model is stopped/paused, Hazbot is enabled and ready", which was the authority for the original branch and is now the opposite of the policy. Trudi has not been asked to strike it yet.
- **LANDMINE: the naive teardown soft-locks the button.** `tourActive` is cleared in the tour engine's `onDestroyed`, but only on the `!cleanup` branch, and the programmatic teardown sets `cleanup = true` before destroying precisely so neither engine mis-logs. So an external writer clearing `ui.showHazbotFeedback` mid-tour leaves the wrapper on `.noHazbot`: faded, robot hidden, `pointer-events: none`, permanently. The one-token repair is to conjoin the panel flag into the class expression, which makes the bad state unreachable rather than recording it and relying on a fourth route to clear it.
- **The gate closes the run's window, not the reopen's.** `tourActive` stays true through the whole run, and the render that reopens the panel reads it before the panel effect clears it, so the reopen commits one render of `.noHazbot`. That is why R40 asks for both halves.
- **The soft-lock is a pre-existing bug that this story fixes.** `ui.showHazbotFeedback` has a fourth writer, and it is external: `ui.resetHazbotFeedback()` (WM-46), reached from Clear All and from `window.test.resetHazbotFeedbackLevels()`. Its teardown goes through the effect cleanup, which by design skips the tour engine's `setTourActive(false)`, so on master a Clear All during a tour leaves the wrapper on `.noHazbot` for the rest of the session: faded, robot hidden, `pointer-events: none`, and no `disabled` attribute to fall back on. The route is what three shipped tours ask for on their first step, since 41/2, 44/2 and 46/2 anchor step 0 to `reload-button` with the text "First, click **Clear All** to reset your model." The class gate fixes that as well as supporting the run-start teardown.
- **The teardown is inherently a no-op when nothing is open**, because MobX suppresses a same-value assignment: no reaction, no re-render, no log. R37 needs no guard provided the teardown writes the flag rather than calling a teardown routine.
- **The cleanup outlives the popover on both ends, which is why the log needs a second term.** The panel effect registers its cleanup before `openOnce` runs, which is deferred to the avatar's `transitionend` with a 400ms fallback. For 250 to 400ms the cleanup exists and `intro` is still null, so a log gated on `simulationRunning` alone fires for a coach mark that was never displayed. `intro || tourEngine` closes it and must not be simplified away.
- **Six live tours end by telling the student to press Start**, so the new event fires on their success path. Four are anchored there (41/2, 44/2, 46/2, 46/4, terminal text "Click **Start** to run the model!"); two only say it (44/3 and 46/3, anchored on Fireline, ending "Add both a **Fireline** and a **Helitack** while the model is running. Click **Start** to begin!"). The completion-count shift is a split rather than a collapse: the terminal popover also carries `[Got it!]`, so a student who dismisses before pressing Start still logs `HazbotTourCompleted`.
- **The blink phase matters.** The loop is `idle(1000 + rand * 2500)` then eyes closed 180ms then open then 80ms, a mean cycle of about 2510ms of which 180ms shows closed eyes. Simply stopping the scheduler would freeze the robot mid-blink about 7% of the time, for the whole run, which is why the disabled state forces eyes open.
- **The shrink already animates on every other close route.** `transition: transform 0.25s` lives on the base `.avatar` rule, deliberately, so suppressing it here would make the run-start route the only one that snaps.
- **Focus restore cannot land on the disabled button.** The library restores focus only when focus is already inside a popover, and the target is the step's own anchor, never the Hazbot `<button>`.
- **WM-32 interaction: no code conflict, one shared doc deliverable.** A three-way merge of the two branches produces no conflict; the reason is that WM-32 leaves `let lastStepIndex = 0;` as context and WM-31 is the only side that rewrites it. WM-32 resolved `stepCount` and `lastStepIndex` to driven coordinates with `skippedSteps` reconciling, so this event's terminal test survives it. The concrete step indices quoted in the source spec are pre-WM-32 measurements: once leading satisfied steps are dropped, a two-step tour opened after its Restart is already done is driven as one step and its terminal index is 0.
- **`APP_RULES_VERSION` stays at 8.** The bump policy is scoped to rules and selection semantics, and this story changes neither: for any history the log records, the category resolves the same way and the same string is selected. What changes is which histories are reachable. WM-42 is the governing precedent, having changed what `TerrainPanelButtonClicked` means and given `TerrainPanelClosed` a whole payload without bumping. The counter-argument is real and recorded: this does put a discontinuity in the data, and it is carried by the `LOGGED-EVENTS.md` row instead, which is why R39 makes it state the completion-count shift in detail.

## Out of Scope

- **Disabling Setup and Spark during a run.** The board's state 4 lists them alongside Hazbot, but both already disable themselves off `simulationStarted`. Nothing to build.
- **Any affordance explaining why Hazbot is unavailable.** Michael specified the opacity treatment alone. The rejected alternative was an "I will analyze your model after it is finished running" popover, which Trudi turned down for leaving a stale message after the run ends.
- **Putting Hazbot to sleep after the student reaches the maximum category.** From Sam's design doc, argued against by Trudi's "as many times as s/he wants", and it belongs to WM-9.
- **Capping post-run clicks.** Explicitly rejected.
- **The fade-out transition.** Optional polish only, on Michael's own framing.
- **Suppressing the robot's shrink animation on the run-start teardown.** Rejected: it already animates on all three existing close routes.
- **Re-authoring the two tours whose guidance spans the run.** 44/3 and 46/3 lose the during-run half of their instruction at the moment it becomes actionable, and the student cannot get it back. The fix is content rather than code, since the text is build-time generated from each category's authored `visualFeedback`, so it is Trudi's as owner of the feedback-table content. Raised with her as a non-blocking ask.
- **Restructuring how `tourActive` is stored.** The class gate makes the stuck state unreachable, so lifting the flag into the store is not needed to close this story.
- **Accessibility review**, per the standing scope for this repo.

## Not Yet Implemented

- **The WM-32 half of R39's doc obligation.** WM-32 makes it a deliverable that the `HazbotShowMeClicked` / `HazbotTourCompleted` / `HazbotTourDismissed` rows state which coordinate system `stepCount` and `lastStepIndex` are in. `HazbotCoachMarkHiddenByRun` carries `lastStepIndex` too, so whichever story lands second adds the fourth name to that enumeration. WM-31 landed first and WM-32 is still unmerged, so the note does not exist yet and **WM-32 writes all four names**. This is the merge-order branch the requirement anticipated, not an omission.

## Decisions

### Get the stray pause musing struck from the ticket description
**Context**: The description ended with a musing that reopened the pause branch as a design question after Trudi had already settled it, and it was the only line contradicting the rest of the description.
**Options considered**:
- A) Treat Trudi's policy as the decision, build enabled-while-paused, and get the line struck before starting.
- B) Ask Trudi to re-confirm before writing any code.

**Decision**: A, and the ask does not block the branch. Blocking would mean asking Trudi to re-state a policy she has stated twice and that is written into the description, while the only line contradicting it is one nobody is implementing. **Outcome**: the musing was closer to what she wanted than the description was. She reversed the pause branch after seeing the branch build, and the description is now the line that is wrong. Two non-blocking messages ride along: one to Trudi carrying the description edit, the Fire Line consequence, and the 44/3 and 46/3 re-authoring ask; one to Sam warning that `HazbotTourCompleted` counts for six categories will fall.

---

### Does "enabled while paused" really mean enabled during a Fire Line intervention?
**Context**: The chosen predicate puts the Fire Line pause on the enabled side, so Hazbot becomes clickable while the fire is half burned and the student is mid-intervention. The codebase already treats the two pauses as different in kind, since the Fire Line pause deliberately does not arm the ready pulse.
**Options considered**:
- A) Keep `simulationRunning`. A pause is a pause.
- B) Disable during a Fire Line pause too, gating on something that stays true across the intervention.
- C) Ask Trudi.

**Decision (superseded by "Trudi reversed the pause branch after seeing the branch build" below)**: A. Three findings settle it. **B cannot be built as written**: the intervention does not end when the line is drawn, and from the moment the second endpoint lands no flag distinguishes a Fire Line pause from a Pause-button pause. **Neither existing distinction can be borrowed**: `simulationEnded` is also false during a Pause-button pause, and `hazbotPulseArmed` is cleared by the first click. **WM-45 already decided the semantics** and makes the paused analysis correct rather than misleading: its R2a says a student who pauses mid-run and asks for analysis is told about the run they are watching. Measured live, a Fire Line pause produces the same state a Pause press does, down to the button reading "Start", so a Hazbot that follows the same flag agrees with what is on screen.

---

### Trudi reversed the pause branch after seeing the branch build
**Context**: The branch shipped "enabled while paused" and the branch-build message flagged the Fire Line consequence as the one part of the policy she might not have pictured. She replied (2026-08-25): a paused model counts as still running, so Hazbot is disabled while paused, and only when the fire has stopped burning is it active again.
**Options considered**:
- A) Gate on a run being in progress: `simulationStarted && !simulationEnded`.
- B) Gate on `simulationRunning` plus a separate flag tracking whether the student is mid-intervention.

**Decision**: A, folded into the open PR rather than raised as a follow-up. This is the requirement the earlier decision could not build, and the reason it could not is gone: B failed because nothing distinguishes a Fire Line pause from a Pause-button pause once the line is drawn, and the new policy does not need them distinguished. The predicate needs no new state, since `simulationEnded` already exists for the ready pulse. One reading was confirmed with her rather than assumed: "only when the fire has stopped burning" is about pauses, not about the pre-run state, so the button stays available before the first run, where the "you have not run the model yet" feedback and the tours that open with "First, Restart your model" live. The cost accepted with it is that a paused model looks stopped, down to the Start button reading "Start", while Hazbot is dim.

---

### Should a run-start teardown of an open coach mark be logged?
**Context**: The three existing routes each log something or nothing deliberately; a run-start teardown would fall into the silent bucket. From a research standpoint it is distinct: the student abandoned guidance by starting a run, which is not the same as dismissing it.
**Options considered**:
- A) Add a distinct event carrying the ruleset, category and last step index.
- B) Reuse `HazbotTourDismissed` with a reason field.
- C) Log nothing; the absence of a Completed event is inferable.

**Decision**: A, as `HazbotCoachMarkHiddenByRun`. `lastStepIndex` is null on the intro rather than 0, so no reader takes "step 0 was shown" for a popover with no steps, and `phase` separates an orphaned tour from an intro the student never got past. **B is weaker than it reads**: folding a non-user action into `HazbotTourDismissed` changes the denominator of every existing dismissal count, and it cannot carry the intro case at all, since dismissing the intro logs nothing today. **C's cost is concrete**: WM-45 records Sam deriving coach-mark completion from `HazbotShowMeClicked` paired with a terminator, so under C a tour ended by a run start has the same signature as a page reload.

---

### Where should the teardown live: inside `hazbot-button.tsx`, or at the Start call site?
**Context**: The button component owns every other route into and out of the panel, but `handleStart` already does a batch of run-start bookkeeping and a fifth line there would be the smallest diff.
**Options considered**:
- A) An effect inside `hazbot-button.tsx` keyed on `simulationRunning`.
- B) A line in `handleStart`.
- C) A `startRun` action on the store owning all of it.

**Decision**: A, and it needs no MobX `reaction()`: the component is an `observer` and a plain `useEffect` keyed on the flag does the job. Testability is decisive: `hazbot-button.test.tsx` renders the component standalone, so this route is testable next to the three existing panel routes, whereas a `handleStart` line would have to be exercised through the whole run machinery. Coverage is second, since `window.sim.start()` is a documented live debug path B would not cover. C was rejected as moving panel state into the model layer, which this codebase does not do.

---

### Does the disabled treatment need its own class, or should the tour state be refactored to share it?
**Context**: Zeplin gives Disabled and No Hazbot Default the same opacity, so writing 0.35 twice puts the same value in two rules that must agree with each other and with the board.
**Options considered**:
- A) A shared faded rule, with `.noHazbot` adding the avatar hide.
- B) A separate disabled rule with the constant duplicated.
- C) One SCSS variable feeding both rules.

**Decision**: A, as a shared selector list rather than a restructure. B is ruled out by the repo's one-source-of-truth rule for a value that has to agree in two places. C is weaker: a shared variable still leaves two declarations that can drift in other ways, and it does not express that these are the same visual state. The live measurement makes the rule mandatory rather than tidy, since without it MUI renders the button at 0.25.

---

### How should blinks be paused, and does the robot hold eyes-open or mid-blink?
**Context**: The board says "blinks are paused" without saying what the robot looks like while paused, and the natural implementations differ in outcome.
**Options considered**:
- A) Stop scheduling and force eyes open; restart from the top on re-enable.
- B) Stop scheduling only, leaving the current frame.
- C) True pause and resume, preserving the phase.

**Decision**: A. B is a real defect rather than a theoretical one: about 7% of run starts would freeze the robot mid-blink for the entire run, which reads as broken and would be reported as a bug months later. C is meaningless here, since the phase being preserved is a fresh uniform random idle, so resuming and restarting are the same distribution at the cost of extra state.

---

### What happens if the student starts a run while the intro popover is open, rather than a tour?
**Context**: The intro carries `.coached` (the enlarged robot), so the teardown has to shrink the robot as well as fade the button, and that scale-down is a 0.25s transition while the ticket asks for an immediate cut on the coach mark.
**Options considered**:
- A) Let the robot shrink on its existing transition; only the coach mark cuts.
- B) Suppress the transition so the whole thing is one cut.

**Decision**: A, and it is not really a choice. The transition lives on the base `.avatar` rule deliberately, so the shrink already animates on all three existing close routes. A is zero code and consistent with what the student has already seen; B would add code to make this the only route that snaps.

---

### Should the Cypress work be its own commit, or fold into the first step?
**Context**: Every Cypress change is about the disabled state, which is the first step's code, and none of it touches the coach-mark teardown.
**Options considered**:
- A) Fold it into the first step.
- B) Keep it as its own commit.

**Decision**: A. The SCSS half of that step has no Jest coverage that could ever fail, since `identity-obj-proxy` makes a jsdom read of computed opacity return `""`. Splitting would put the 0.35 override in one commit and its only possible test in another.

---

### The teardown route and the disabled state must land together, and the spec treated them as one
**Decision**: Accepted, with the dependency stated in the requirement and narrowed. The ordering constraint is not "teardown before disabling"; it is that the `.noHazbot` class gate lands with or before the teardown. Disabling the button alone is safe in any order, though not for the reason first recorded: the soft-lock is reachable on master through Clear All, and the disabled half neither creates nor worsens it. That matters for slicing: the disabled half genuinely can ship alone.

---

### Resetting `tourActive` in the effect cleanup may be the wrong fix
**Decision**: Accepted, and the derivation asked for is a single token: conjoining the panel flag into the `.noHazbot` expression. It removes the bug for the whole time the panel is closed, touches no cleanup path and does no `setState` during unmount. It does **not** remove the class of bug, which is what the second pass found, so the teardown clears `tourActive` at the source as well.

---

### `disabled` on the MUI Button interacts with the existing `onMouseDown` preventDefault
**Decision**: Confirmed inert; no work. The library restores focus only when focus is already inside a popover, and the restore target is the step's own anchor, never the Hazbot button. A native disabled button dispatches no mouse events, so the handler is inert while disabled.

---

### "Enabled while paused" needs a test per pause route, not one
**Decision**: Accepted; the requirement names one case per route. One correction and one addition: `handleHelitack` is deliberately not a pause route, so a Helitack drop leaves Hazbot disabled; and the Fire Line route is not only the likeliest to regress but the one whose intended behavior was in question.

---

### The blink requirement is only testable with pinned randomness
**Decision**: Accepted verbatim. This is the standing repo concern about tests that cannot fail, in its most literal form: the naive version passes against the unfixed code, because advancing past the 180ms window observes eyes-open either way. The requirement now says "with `Math.random` pinned and timers advanced to the exact boundary".

---

### No stated criterion for the state of a closed coach mark when the run starts
**Decision**: Accepted; added as R37, with the implementation shape that satisfies it named. Writing the flag when it is already false is inherently silent because MobX suppresses same-value assignments, and the requirement is phrased so this falls out rather than being suppressed by a guard, which is what stops a careless implementation from satisfying it.

---

### The story's title and its actual cost point at different halves
**Decision**: Accepted as a finding, and the deep dive inverts the premise. The teardown half turned out cheap (a three-line effect plus a one-token class change); the disabling half carried a hidden cost the story had not counted, since MUI renders a disabled button at 0.25 and the "two-line change" ships the wrong visual without an override rule. The story stays a 3 and ships whole. If it ever came to a cut, the disabled half is what survives.

---

### The policy is recorded in three places and only two of them agree
**Decision**: Accepted, and answered by the first question: the edit is made and does not block the branch. One correction to the finding: the contradiction is one line, not two. "Ready to respond to the current model setup" already describes a half-burned model, so the policy sentence stands as written.

---

### A disabled Hazbot gives no hint about when it comes back
**Decision**: Already answered authoritatively and recorded in Out of Scope. What the finding usefully does is name the failure mode the blink question turns on, and that half is decided in its favor: forcing eyes open is specifically what keeps the robot from reading as broken.

---

### Losing an open coach mark to a run start is silent and unrecoverable in one step
**Decision**: Confirmed and worth recording, but nothing to change. It is stronger than "may be": the category is read fresh at open time and the student cannot reopen until the run has finished and the engine has consumed a run's worth of new readings, so a different category is the expected case. WM-32 compounds it, since the reopened tour may also start at a different step.

---

### A silent teardown makes an abandoned tour indistinguishable from a completed one
**Decision**: Accepted, and answered by the logging question. The finding's evidence is what decided it: there is a named consumer, so the concern is concrete rather than general. `phase` is the part that answers it directly, separating an orphaned tour from an intro the student never got past, which a reconstruction from `SimulationStarted` timestamps could not have recovered.

---

### `lastStepIndex` is not in the panel cleanup's scope, so the payload does need extra state
**Decision**: Accepted. `lastStepIndex` is declared with `let` inside `openTour`, so the effect-level cleanup cannot see it and the verbatim implementation fails to compile with `TS2304`. It is hoisted to effect scope with `openTour`'s line becoming a reassignment, and the "no extra state" framing is gone.

---

### The class gate leaves `tourActive` stale, so the reopen flashes the tour state
**Decision**: Accepted in full. The gate makes `.noHazbot` unreachable while the panel is closed, which is what it was chosen for, but the reopen render still reads a stale `tourActive`. R40 now asks for both halves and says why neither substitutes for the other; R42 gains the reopen case; and the earlier decision claiming this "removes the class of bug rather than the instance" is corrected in place.

---

### `HazbotCoachMarkHiddenByRun` fires when no coach mark was ever displayed
**Decision**: Accepted. The cleanup is registered before `openOnce` runs, so for 250 to 400ms the cleanup exists with `intro` still null and a run started in that window logs an event with nothing on screen, indistinguishable from a real intro teardown. R38 gains the `intro || tourEngine` term, R42 gains the pre-open case, and a Technical Note records the window so the extra term is not later read as redundant.

---

### The `categoryId` note under the Hazbot table is part of what this change invalidates
**Decision**: Accepted. The new event's `categoryId` comes from the same binding the three tour events use, so leaving the enumeration naming three of four events would leave a reader unable to tell whether it means `categoryUsed` or `matchedCategory`.

---

### The named Cypress home does not render the Hazbot button, and the state-machine spec is unaddressed
**Decision**: Accepted on both halves. `bottom-bar-visuals.cy.ts` visits a URL with no `hazbotRules`, so the element does not exist there at all. Both browser assertions move to the `Hazbot button pulse (WM-6)` block, and a new requirement names the helper, the state-4 case and the header comment as things this story updates.

---

### `simulationRunning` falls on four routes, not three
**Decision**: Accepted on the fact, with the scope narrowed. The flag is cleared from three places reached by four UI routes; Restart is a discard rather than a pause, which is why it logs `SimulationEnded` plus `SimulationRestarted`. R42 keeps its pause-route list at three and gains one separate case for Restart rather than promoting it to a fourth peer. The pass also recorded an interaction the spec had missed: `SimulationRestarted` and `SimulationReloaded` are `translate.ts` modifiers that close the open run window.

---

### The board measurements and the disabled-visual reasoning check out
**Decision**: Confirmed by re-measurement. "Whole button at 35%, robot kept" is right, and a root `opacity` is the correct shape rather than the `> span` fade the other bottom-bar controls use. No `filter` is specified, so the `grayscale(1)` the other disabled controls carry is correctly absent here. Recorded because the repo's established disabled pattern is visibly different from the one this story picks.

---

### Three factual slips in Technical Notes
**Decision**: Accepted; all three corrected in place. The border was cited as `1px` when declared `1.5px`; the burnout write was cited two different ways in one document; and the Fire Line `stop()` line number was off by one.

---

### Six live tours end by telling the student to press Start, so the event fires on the success path
**Context**: R39 mandated that a `HazbotShowMeClicked` terminated by the new event reads as abandonment-by-running. For tours whose terminal step asks the student to press Start, that is the opposite of what happened.
**Decision**: Accepted as a documentation defect rather than a design one, and no new field is logged. The mandated note is rewritten so the event means only that a run started while a coach mark was up, with `lastStepIndex` against `stepCount` carrying the distinction. The behavioral alternative, exempting a tour on its terminal step from the teardown, was rejected: it puts a coach mark back on screen during a run, which is the state this story exists to remove.

---

### The row names four tours that end by asking the student to press Start; there are six
**Decision**: Accepted. The rule is stated by what the terminal step **asks for** rather than by its anchor, and all six are named, split into the four where pressing Start is the whole remaining ask and the two where it is half of one. A rule written off the anchor would miss half the affected categories.

---

### Two tours instruct the student to act while the model is running, and this story deletes the instruction
**Decision**: Scope it and route the real fix to content. Out of Scope gains an entry naming the lost during-run instruction and the reopen-restarts-at-Restart consequence. There is no escape hatch at all under the final policy: a Fire Line placement pauses the run but leaves Hazbot unavailable, and even after the fire is out the tour reopens at step 1, "First, **Restart** your model", which would throw away the run the student was told to intervene in. Re-authoring is Trudi's as owner of the feedback-table content.

---

### R39's "the note's body needs no rewording, only the fourth name" does not hold
**Decision**: Accepted, applied without asking, since there is no choice once the file is read. The subsection is retitled to "coach-mark events" because the new event also fires on the intro, and its closing sentence is rewritten because "these three events" loses its referent once four are named and is untrue of an event that post-dates the `appRulesVersion` 6 boundary. Retitling is safe: the only links into the file are two `#hazbot` anchors pointing at the `## Hazbot` heading.

---

### R44 cannot be implemented as written; the state-machine URL has no `hazbotRules`
**Decision**: Accepted, and one thing added the finding missed. R44 now names four changes rather than three, the fourth being that the header needs more than the eighth control: it states the file covers no visual styling and that "there is no automated assertion of the rendered styles", which R43's 0.35 assertion makes false. The URL change was measured live before being accepted, confirming nothing in the WM-24 matrix moves when the rule-set loads.

---

### The run-start teardown effect as written trips `exhaustive-deps`
**Decision**: Accepted, applied without asking since there is no choice to make. `ui` is a stable store object, so naming it in the dep array lints clean and changes nothing about when the effect runs. The teardown decision also loses its claim that `pulsing` is what makes the component observe `simulationRunning`: that read is short-circuited whenever `hazbotPulseArmed` is false, which is its state on every click, and the dep array is what establishes the observation.

---

### The second pass's border correction replaced a measured value with a declared one
**Decision**: Accepted, applied without asking. Both passes were half right: the declaration is `1.5px` and the rendered value is `1px`, and the sentence they were arguing over is about the rendered value. The note now says so and that a browser assertion must expect 1px.

---

### The two run-start teardown cases cannot fail on their Completed/Dismissed assertions
**Decision**: Accepted in full, and the plan edited rather than annotated. The mock's `destroy()` does not call back into `onDestroyed` the way the real engine does, so both cases now drive it explicitly. The intro case wanted stronger assertions than the finding proposed: with `cleanup` gone its `onDestroyed` reads as a `[Show me]` activation and **opens a tour in the middle of the run**, a worse regression than a stray log line and one the proposed assertion would never have caught.

---

### The blink test's "blinks stop while running" assertion cannot fail
**Decision**: Accepted, applied as suggested. The plan pinned `Math.random` and then advanced 5000ms, which is not the boundary and reproduces the trap in a new form. The case now advances to exactly t = 1000, the tick an un-suspended loop would close the eyes on, then advances the remainder as a separate stays-stopped assertion. Measured both directions: with the blink effect keyed `[]` it fails on the t = 1000 assertion rather than on the tail.

---

### The plan's `LOGGED-EVENTS.md` deliverable is missing R39's WM-32 half
**Decision**: Accepted, applied as suggested. The step gains a paragraph stating the conditional edit, which coordinate system WM-32 resolved to, why the new event belongs in the enumeration, and what each merge order implies. Nothing about the row or the `categoryId` subsection changes, since those are unconditional.

---

### The Cypress header rewrite dates a change instead of describing the contract
**Decision**: Accepted. "Hazbot joined the matrix in WM-31" is a changelog entry: it tells a reader when something changed rather than what is true, which is the one thing the repo's comment standard rules out. The header states the contract instead.

---

### Where should `tourActive` be cleared for a teardown from outside the component?
**Context**: Review of the branch found the run-start teardown's own `setTourActive(false)` covers the run route only. Clear All takes the same cleanup path, so its reopen still commits one render of `.noHazbot`, which paints.
**Options considered**:
- A) Clear it in the panel effect's closed branch, and delete the run teardown's copy.
- B) Add a second clear at the Clear All writer.

**Decision**: A. One writer per piece of state; the asymmetry existed because there were two. The closed branch is the panel-closed state sync, which is what `tourActive` mirrors, so every external teardown route is covered by construction rather than by remembering to add a line. Placing it in the effect's cleanup instead also works and there is no unmount hazard either way (React 18.2 makes a `setState` after unmount a silent no-op), but the closed branch reads better. A regression test drives Clear All, reopens, and asserts every committed class value.
