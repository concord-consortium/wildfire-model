# Hazbot: Add Hazbot Analysis Button

**Jira**: https://concord-consortium.atlassian.net/browse/WM-6

**Status**: **Closed**

## Overview

Add a "Hazbot Analysis" button (with the Hazbot avatar) in the model corner of the Wildfire Explorer. The button appears only on Hazbot-enabled pages, has a calm default look before the model runs and a "ready" glow after a run completes, and on click triggers the (separately built) Hazbot feedback panel.

The Hazbot is a pedagogical agent that watches how a student sets up and runs the wildfire model and offers targeted, behavior-based help. This story delivers the student's entry point into that help: a visible button in the model area that invites a click once the student has run the simulation. The button itself does not show any feedback text; it is the trigger. The actual coaching message comes from the matched rule-set category and is rendered by a sibling feature (WM-11). Surfacing the button only when Hazbot is enabled (via URL configuration) keeps it out of the way for activities that do not use the Hazbot.

## Requirements

- A "Hazbot Analysis" button renders in the bottom control-buttons row on Hazbot-enabled pages only, gated on a **loaded rule-set** — `getAnalysisEngine()?.ruleSet` being defined, not merely the presence of `?hazbotRules`. An invalid id (e.g. `?hazbotRules=99`, no matching key in `ruleSets`) yields `engine.ruleSet === undefined` and must **not** render the button, since no feedback path exists. This is the same gate WM-6 uses for the `AnalysisEngineProvider` mount, so the button and provider share one signal.
- The button is a 48 × 48 Hazbot avatar plus a two-line "Hazbot / Analysis" text label (Lato 16px, weight 700) to its right, per AP-79.
- The Hazbot avatar runs a **random blink** animation in all states (AP-79): on a randomized idle cycle the eyes briefly close. It is local presentation state on the button (no engine/run-lifecycle coupling) and is independent of the default/ready/hover/select button states below. Implemented via the layered avatar (separate `Back` / `Eyes` / `Blinks` SVGs).
- The button implements four states per AP-79: **default**, **ready (pulse)**, **hover**, and **select (pressed)**:
  - **Default** — no pulse. Shown before the model has run, while a run is in progress, and after the student has clicked the button for the current run.
  - **Ready** — a pulsing animated outline emanating from the button edge (`#0050C4` → `#FFF`), shown after a run **completes**. "Completes" is an explicit signal (not the bare `simulationStarted && !simulationRunning`): it arms on a manual Stop (the Start→Stop toggle) or on `simulationEnded` (natural burnout), and is explicitly **not** armed by a Fire Line pause (which also stops the sim but is mid-intervention). The pulse stops once the student clicks the button, and re-arms only after the next run completes. The pulse also requires `simulationStarted`, so a Restart or Reload (which clears `simulationStarted`) hides it, keeping the button un-pulsed in the pre-run state.
  - **Hover** and **Select** — standard interactive affordances per AP-79's button-states section.
- WM-6 wraps the Hazbot button's mount point in an `AnalysisEngineProvider` (gated on a loaded rule-set), as a forward-looking deliverable so the sibling WM-11 panel story can consume `useAnalysisEngine()` at this location without re-plumbing the mount. WM-6's own button does not consume the `useAnalysisEngine()` hook for rendering; its only engine read is the pure `computeMatchedCategoryForEngine()` call at click time for the log payload.
- Clicking the button sets a `showHazbotFeedback` observable flag on the UI store. The sibling panel story reads this flag to display the feedback; the displayed copy comes from the matched rule-set category's `feedback` field, not from this story. WM-6 does not render the panel.
- Clicking the button also logs a `HazbotButtonClicked` event carrying the matched category id (read at click time via the pure `computeMatchedCategoryForEngine(getAnalysisEngine())` call, not the `useAnalysisEngine()` hook), consistent with the other bottom-bar `*ButtonClicked` log events. The payload field is typed `number | null`: `computeMatchedCategoryForEngine` returns `null` when no category floor matches, and that `null` is carried **explicitly** rather than omitted, so the event schema is uniform for analytics. WM-6 does not feed the click to the engine as a Reading — but note this is enforced by `translate()`'s `default → no-op` branch, not by bypassing the engine: `log()` routes every event (this one included) through `engine.consume()`, so `HazbotButtonClicked` must stay **unhandled** in `translate.ts` or the click would mutate the matched category it just reported.
- The button is interactive before a run too: a pre-run click matches Category 1 and surfaces its pre-run message through the same feedback path.
- Visual design (placement, avatar asset, sizing, default vs. ready styling, glow) follows AP-79.

## Technical Notes

- **Engine access in React**: WM-6's button does **not** consume the `useAnalysisEngine()` hook — per Decision A it only sets the flag (and logs the click). Its inputs are the run-state observables and `ui.showHazbotFeedback` via `useStores()`, plus the gate resolved via `getAnalysisEngine()?.ruleSet` (a plain call, no hook). The one engine read it makes is at click time: `computeMatchedCategoryForEngine(getAnalysisEngine())` ([evaluator.ts:318](../src/hazbot/engine/evaluator.ts#L318)) to populate the `HazbotButtonClicked` log payload — a pure call, no hook or provider dependency. WM-6 still mounts an `AnalysisEngineProvider` around the button's location as a forward-looking deliverable so the sibling WM-11 panel story can consume `useAnalysisEngine()` there. `BottomBar` is a class component, so the button itself is a function-component (`observer`) child.
- **Gating**: `getAnalysisEngine()` returns `undefined` when neither `?hazbotRules` nor `?hazbotSidebar` is set, but it can be non-undefined for sidebar-only sessions and for an *invalid* `?hazbotRules` id (the engine is constructed with `ruleSet: undefined`, [engine-singleton.ts:33](../src/hazbot/wildfire/engine-singleton.ts#L33)). So the gate is specifically `getAnalysisEngine()?.ruleSet` being defined — not engine existence and not the bare presence of `?hazbotRules`. This is stricter than app.tsx's existing sidebar-provider mount (which gates on a truthy `engine` so the sidebar can still surface construction errors). A plain call, not the hook.
- **Run-complete signal**: "a run completed" is an explicit signal, not the bare `simulationStarted && !simulationRunning`. It arms on the manual Stop button (`handleStart`'s Start→Stop toggle) or on `simulationEnded` (natural burnout). A **Fire Line pause must be excluded**: `handleFireLine` also calls `simulation.stop()` and the draw-end handler does not resume, so a pure `!simulationRunning` test would wrongly arm the pulse mid-intervention. The arm flag is reset on the next Start and cleared on the click that opens feedback. The pulse predicate **also requires `simulationStarted`** (pulse = `armed && simulationStarted && !simulationRunning`): `restart()` and `reload()` clear `simulationStarted` without routing through `start()`, so requiring it auto-hides a stale pulse in the pre-run / terrain-setup state. Helitack does not stop the sim, so it needs no special handling.
- **Placement**: AP-79 places the button in the bottom **control-buttons row** ([bottom-bar.tsx](../src/components/bottom-bar.tsx)), not as a free-floating overlay in the 3D-view corner. The board has two layouts — "with Fire Intensity Scale" and "without" — and positions the Hazbot button relative to the centered middle controls / the Fire Intensity Scale.
- **Existing button/icon patterns**: [icon-button.tsx](../src/components/icon-button.tsx) (which takes an `icon` + `highlightIcon` pair) and the bottom-bar `Button`s are the established button idioms in this repo.
- **MobX**: any component reading `simulation.simulationRunning` / `simulationStarted` must be an `observer`. The Hazbot button is a function-component `observer` child of the class `BottomBar`. The WM-6-owned pulse state must therefore live as **observable** UI state, not a plain `BottomBar` instance field or closure variable, or the `observer` button will not re-render when it flips. The natural home is [UIModel](../src/models/ui.ts) alongside the new `showHazbotFeedback` flag, which also makes the pulse transitions unit-testable.
- **Avatar asset**: no `*hazbot*` asset existed in the repo; the avatar art is exported from AP-79 as three `svg@1x` layers (`Hazbot Button - Back` / `Eyes` / `Blinks`) and added under `src/assets/bottom-bar/`.

### AP-79 design specs ([Zeplin board](https://app.zeplin.io/project/5fe47ae231d1f6a428c53450/screen/69b2baa489a2e2f3308238b8))

AP-79 is a large board covering the whole coach-mark overlay system. WM-6 consumes only the Hazbot button:

- **Button (`Hazbot Button` group)**: 122 × 48. Composed of a 48 × 48 avatar placement (art `Hazbot` ≈ 47 × 44) and a two-line text label "Hazbot / Analysis" (Lato, 16px, weight 700, color `#222222`) to its right.
- **Default state**: rounded `#c1daff` (light blue) button background ("Button back" layer), no pulse.
- **Ready / pulse state**: a pulsing animated outline emanating from the button edge (`#0050C4` → `#FFF`). Not an exportable asset — built in code as a bordered rounded-rect ring (122×48, `border-radius: 10px`, `5px solid #0050c4`, `#c1daff` fill) that scales up + fades out, rendered as a Button sibling so it isn't clipped. Shown after each run completes; stops once clicked; re-arms after the next run.
- **Hover / Select**: measured from the "Hazbot Button States" artboard — Default `#c1daff`, Hover `#a4c7f9`, Select (pressed) `#80aff5`.
- **Random blink**: random idle `1000 + Math.random()*2500` ms → eyes closed (`Blinks`) for 180 ms → 80 ms pause → loop. Eyes layer shows when open. Hardened with a mounted guard so the recursive `setTimeout` never calls `setBlink` after unmount.
- **Large / scaled-up variant (135 × 69)**: the button scales up while the coach mark is displayed above it. This scale-up + coach-mark behavior is the sibling feedback-panel story, **not WM-6**.

## Out of Scope

- The feedback display itself (the sibling Hazbot feedback-panel story / WM-11 anchored popover). WM-6 sets the `showHazbotFeedback` flag on click; it does not render the panel.
- The button's scale-up animation and the coach mark displayed above it (sibling feedback-panel story).
- Activating grayed-out questions (AP-76).
- Confetti / success-state animation (WM-9).
- Any change to rule-set `feedback` copy.
- Accessibility concerns (per project convention, out of scope for this repo's specs).

## Decisions

### Where does the click handler "hand off" to, given the panel is a sibling story?
**Context**: WM-6 owns the button and its click; the panel that renders the feedback is a separate story (WM-11 anchored popover). The exact deliverable boundary must be defined so the button is testable now without the panel existing.
**Options considered**:
- A) WM-6 introduces shared UI state (a `ui.showHazbotFeedback` flag) the button sets; the sibling panel reads it later.
- B) WM-6 takes an `onClick`/callback prop; integration left to the sibling story.
- C) WM-6 ships the button plus a bare-bones inline panel showing the matched category's `feedback`, to be replaced later.

**Decision**: **A** — Add a `showHazbotFeedback` observable boolean to `UIModel` (matching the existing `showChart` / `showTerrainUI` idiom, toggled by direct assignment), which the button sets on click. The sibling WM-11 panel reads it. Gives the sibling a stable, conventional contract and is fully unit-testable now.

---

### What exactly triggers the "ready" state, and does it reset?
**Context**: The ticket says "ready" appears "after a run completes." A manual Stop sets `simulationRunning = false` without `fireDidStop`, so `simulationEnded` stays false — a precise rule must not drop the manual-Stop case.
**Options considered**:
- A) "Ready" = `simulationEnded` (fire stopped on its own). Misses the manual-Stop case.
- B) "Ready" latches after the first Start and stays ready across Restart. Glows during the run.
- C) "Ready" = `simulationStarted` (true as soon as Start pressed); glows during the run.
- D) "Ready" = `simulationStarted && !simulationRunning`.

**Decision**: **D, refined to an explicit arm signal** — "Ready" (pulsing) shows after a run **completes** and while the student has not yet clicked since that completion. "Completes" arms on a manual Stop (Start→Stop toggle) or `simulationEnded` (natural burnout), and is **not** armed by a Fire Line pause. The pulse predicate also requires `simulationStarted`, so Restart/Reload (which clear it without going through `start()`) hide any stale pulse. The next Start resets the arm.

---

### Is the button always enabled (clickable pre-run), or disabled until "ready"?
**Context**: A pre-run click is meant to surface Category 1's "run the model first" message (pre-run, `engine.isActive` is true with `matchedCategory === 1`).
**Options considered**:
- A) Always enabled. Pre-run / during-run clicks surface the Category-1 refusal feedback.
- B) Enabled only in the "ready" state; pre-run the button is visible but disabled.

**Decision**: **A** — The button is always enabled whenever it renders. The default/ready states are purely visual affordances, not interaction gates. Disabling pre-run would make the Category-1 message unreachable.

---

### Button presentation — avatar only, or avatar + "Hazbot Analysis" label?
**Context**: The ticket calls it a "Hazbot Analysis" button with the Hazbot avatar; the AP-79 board shows the exact composition.
**Options considered**:
- A) Avatar only (icon button), label deferred to AP-79.
- B) Avatar + visible "Hazbot Analysis" text label.
- C) Defer entirely to AP-79.

**Decision**: **B** — Per AP-79: a 48 × 48 Hazbot avatar plus a two-line "Hazbot / Analysis" label (Lato 16px, weight 700) to its right; 122 × 48 total.

---

### Are the AP-79 visual specs (Zeplin) available to fold into this spec now?
**Context**: This is UI work and AP-79 is the design source; the Zeplin MCP server is configured.
**Options considered**:
- A) Fetch the AP-79 specs now and fold them in.
- B) AP-79 not ready; proceed with behavior/structure and leave visual values as a tracked dependency.

**Decision**: **A** — AP-79 board fetched and specs folded into Technical Notes. WM-6 consumes only the Hazbot button portion of the larger coach-mark board.

---

### Which button animations/states are in WM-6 scope vs. deferred?
**Context**: AP-79 defines a Hover state, a Select (pressed) state, a periodic "random blink," and the scale-up-with-coach-mark behavior. WM-6 needs a crisp acceptance boundary.
**Options considered**:
- A) WM-6 ships default + ready + hover + select; random blink deferred; scale-up stays with the sibling panel.
- B) WM-6 ships everything intrinsic to the button including the blink; only scale-up + coach mark deferred.
- C) WM-6 ships only default + ready; hover, select, and blink all deferred.

**Decision**: **A, revised to include the random blink** — WM-6 ships default + ready(pulse) + hover + select **and the random-blink avatar animation**. The blink was pulled forward because the avatar is exported as three independent `svg@1x` layers and the blink is a self-contained ~25-line `useEffect` with no engine/run-lifecycle coupling, so shipping the avatar in pieces only to wire the animation separately is more overhead than value. The scale-up + coach mark stays with the sibling feedback-panel story.

---

### `useAnalysisEngine()` is not required by WM-6, but provider coverage is established for the sibling story
**Context**: The notes originally prescribed consuming `useAnalysisEngine()` inside the button. Per Decision A the button only sets `ui.showHazbotFeedback` and does not render feedback, so it never reads `matchedCategory` or the rule-set. The provider today wraps only the `Sidebar`; `BottomBar` is a class component outside it.
**Options considered**:
- A) Drop the provider requirement (button doesn't need the hook).
- B) Keep the `AnalysisEngineProvider` as an explicit, forward-looking deliverable.

**Decision**: **B** — WM-6 wraps the button's mount point in an `AnalysisEngineProvider` (gated on a loaded rule-set) so the sibling WM-11 panel can consume `useAnalysisEngine()` there without re-plumbing. WM-6 itself does not consume the hook for rendering. Recorded as its own requirement bullet so the provider work is intentional and reviewable.

---

### The "ready" rule spuriously arms the pulse during a Fire Line pause
**Context**: "Ready" was defined as `simulationStarted && !simulationRunning`. But `handleFireLine` calls `simulation.stop()` and the draw-end handler never resumes the sim, so mid-fire-line the button would pulse "ready" even though no run has completed and the student is mid-intervention. (Helitack does not stop the sim, so only the Fire Line and manual-Stop paths reach this paused-but-started state.)
**Decision**: "Run completed" becomes an explicit signal rather than the bare derivation. The pulse arms only on (a) the manual Stop button or (b) `simulationEnded` (natural burnout); a Fire Line pause is explicitly **excluded**. Costs one WM-6-owned tracked flag (set on manual Stop / burnout, reset on the next Start, cleared on the click that opens feedback). The derivation is private to WM-6 — the sibling contract is `ui.showHazbotFeedback` only.

---

### Gating signal is ambiguous for an invalid `?hazbotRules` id
**Context**: One requirement gated on "the presence of `?hazbotRules`," the notes on "`engine.ruleSet` being defined." `ruleSets` contains only keys 23,24,25,32,33,34,35,42,45,47,54, so `?hazbotRules=99` leaves the param present but `engine.ruleSet === undefined`.
**Decision**: Gate explicitly on `getAnalysisEngine()?.ruleSet` being defined — the stronger invariant guaranteeing a real feedback path, matching how `app.tsx` and the sidebar branch. An invalid id renders no button. The same gate is reused for the `AnalysisEngineProvider` mount, so button and provider share one signal.

---

### The button click is not logged, losing the record of when a student requests feedback
**Context**: WM-6 originally set only the `ui.showHazbotFeedback` observable on click. Every other bottom-bar action emits a `*ButtonClicked` log event, so a flag-only Hazbot click left analytics blind to the single most pedagogically interesting interaction.
**Decision (option B)**: On click, WM-6 logs a `HazbotButtonClicked` event carrying the matched category id, read at click time via the pure `computeMatchedCategoryForEngine(getAnalysisEngine())` call (not the hook, so it needs no provider). The payload field is `number | null` and carries `null` explicitly when no category matches. Feeding the click to the engine as a Reading remains out of scope.

---

### A manual Stop arms "ready," but a Fire Line pause does not — confirm the asymmetry is intentional
**Context**: Both `handleStart`'s Stop branch and `handleFireLine` call `simulation.stop()`, which only flips `simulationRunning` to false while `simulationStarted` stays true and the run is resumable. So "manual Stop = completed" vs "Fire Line pause = not completed" is a pure product distinction, not something run state expresses.
**Decision (option A, confirmed)**: A manual Stop is intended to count as "a run completed" and arms the pulse, even though the fire has not burned out and the run is resumable. Pressing Stop reads as "I am done; analyze me," the inverse of a Fire Line pause (an in-progress intervention). WM-6 arms on the handler (not the shared `SimulationStopped` log event) precisely so it can distinguish them.

---

### Restart and Reload leave the "ready" pulse armed, so it pulses in the pre-run state
**Context**: The arm flag was reset only "on the next Start," but `restart()` and `reload()` set `simulationStarted = false` without routing through `start()`, and the handlers never touch the flag. So: run completes (pulse on) → student clicks Restart/Reload instead of the Hazbot button → `simulationStarted` goes false but the armed flag stays set → the button keeps pulsing in the pre-run / terrain-setup state.
**Decision**: The pulse predicate additionally requires `simulationStarted` (pulse = `armed && simulationStarted && !simulationRunning`). Because `restart()`/`reload()` clear `simulationStarted` without going through `start()`, this auto-hides a stale pulse, and the stale flag is reset on the next Start.

---

### The run-complete / clicked tracking state needs a specified, observable home
**Context**: The spec called the pulse tracking "WM-6-owned state" but never said where it lives or that it must be reactive. The button is a function-component `observer` child of the class `BottomBar`; a plain instance field or closure variable would not re-render the button on change.
**Decision**: The pulse state lives as observable UI state on `UIModel` (same `@observable` idiom as `showHazbotFeedback`), so the `observer` button re-renders on flips and the transitions stay unit-testable.

---

### `HazbotButtonClicked` payload is undefined-shaped when the matched category is null
**Context**: `computeMatchedCategoryForEngine` returns `number | null` — `null` when no category floor matches the current readings (e.g. a pre-run click on a rule-set whose lowest category does not fire on the empty-reading prefix). The spec did not say what the log carries in that case.
**Decision**: The `HazbotButtonClicked` payload field is typed `number | null`, carrying `null` explicitly when no category matches, so the analytics schema is uniform across rule-sets and the pre-run case.

---

### Pulse-arming mechanism — single flag + burnout reaction, or predicate-folded `simulationEnded`?
**Context**: Two equivalent ways to drive the ready/pulse state. Manual Stop and a Fire Line pause leave identical run-state tuples (`simulationStarted && !simulationRunning && !simulationEnded`); only the handler that ran tells them apart. Natural burnout sets `simulationEnded` true — a distinct observable a `reaction` can detect.
**Options considered**:
- A) One `hazbotPulseArmed` flag, set by the manual-Stop handler **and** a `reaction` on `simulation.simulationEnded`; predicate `armed && started && !running`. One source of truth, trivial predicate, costs a reaction + disposer in `BottomBar`.
- B) No reaction: fold `simulationEnded` into the predicate with a separate `acknowledgedThisRun` flag. Two flags, more complex predicate.

**Decision**: **A**, with the reaction living in `BottomBar` (not the app.tsx burnout reaction). Keeps a single observable source of truth and the simplest predicate, co-locating all pulse logic with the button. Set true by the manual-Stop branch of `handleStart` and the `simulationEnded` reaction; set false by the click and by the Start path. A Fire Line pause sets it via neither path.

---

### Hazbot avatar asset — source, format, and layer composition
**Context**: No avatar asset existed. The repo pipeline is SVG-native (`@svgr/webpack`); AP-79 exports the avatar as three separate `svg@1x` layers (`Back`, `Eyes`, `Blinks`), a decomposition that exists to drive the random blink.
**Options considered**:
- A) Ask the designer for one flattened `hazbot.svg`; needs a round-trip.
- B) Export the sub-layer SVGs (available today) and stack them with absolute positioning; sets up the blink directly.
- C) Temporary placeholder glyph.

**Decision**: **B, and support the random blink now** — Stack the three layers; render `Back` always, then `Eyes` (open) or `Blinks` (closed) by the `blink` state. Unblocks immediately and the blink is a self-contained `useEffect`. Unmount cleanup hardened beyond AP-79's raw sketch (a mounted guard so no `setBlink` fires after unmount).

---

### Hover and Select exact visual values
**Context**: AP-79 defines distinct Default / Hover / Select button states; the explicit fills are on the "Hazbot Button States" artboard.
**Options considered**:
- A) Measure the exact fills now and bake them into the SCSS.
- B) Ship `darken(#c1daff, …)` placeholders and refine later.

**Decision**: **A** — measured and baked in: Default `#c1daff`, Hover `#a4c7f9`, Select (pressed) `#80aff5`; label `#222222` in all states. No measurement debt.

---

### Test layer for the bottom-bar integration — Jest or Cypress?
**Context**: The bottom bar maintains both layers with a documented split — `bottom-bar.test.tsx` (Jest/RTL) for component logic and `bottom-bar-state-machine.cy.ts` for full-page reactivity / `@observer` / build-tooling breaks. The bottom bar needs no WebGL.
**Options considered**:
- A) Jest only — fast; misses the real-run `@observer` pulse re-render.
- B) Cypress only — real run loop but slow, WebGL-gated, clumsy for log-payload/null assertions.
- C) Both, per the repo's existing split.

**Decision**: **C** — Jest owns all arm/clear/gating/click/blink logic; one added Cypress case proves the pulse class appears after a live Start→Stop and clears on click.

---

### Button placement within the control row was under-specified
**Context**: The plan said "add a `widgetGroup`" without pinning where in the flex row it goes, and the Fire Intensity Scale renders conditionally (`showBurnIndex`) — two layouts the button must look right in. AP-79 shows Hazbot as the rightmost control.
**Decision**: Specified the Hazbot `widgetGroup` as the **last child of `mainContainer`** (after the FIS group), so it renders rightmost in both FIS-shown and FIS-hidden layouts. Exact horizontal gap confirmed via screenshot-vs-board compare, not a pixel value lifted from a duplicated mock. *(During implementation the placement was further refined to a flexbox-balanced right region — the button centered in the gap between the last control and the fullscreen toggle, 10px from the toggle — and the standard `.widgetGroup` white-bubble wrapper was dropped since the button is a self-contained `#c1daff` pill.)*

---

### Jest integration tests should reuse the existing harness; the burnout-arm test needs the right trigger
**Context**: The Step-3 Jest bullets didn't anchor to the established `seedState` / `mockEngine` helpers in `bottom-bar.test.tsx`, and the burnout-arm case is subtle: `simulationEnded` is a computed over `simulation.engine?.fireDidStop`, which can't be set directly — the `reaction` only arms on the observed false→true edge.
**Decision**: Extend `bottom-bar.test.tsx` via `seedState` + `mockEngine`; drive the burnout-arm edge with `mockEngine({ fireDidStop: true })` + a running→stopped flip while mounted; import `act` from `react-dom/test-utils`.

---

### "Click not fed to the engine as a Reading" holds only via `translate()`'s default no-op
**Context**: `log()` routes every event through `engine.consume()`, so logging `HazbotButtonClicked` *does* reach the engine — it's harmless only because `translate()` falls through to `default → no-op` for that name. If a future `translate()` case emitted a reading for it, every click would mutate the matched category it just reported (the handler reads the category before `log()`).
**Decision**: Document the coupling — a comment at the `log("HazbotButtonClicked", …)` call, a requirements note, and the "must stay unhandled in `translate.ts`" invariant — plus an invariant guard test (consuming the event leaves `readings.length` and the matched category unchanged).

---

### The ready pulse is a code-built scaling outline, not a baked asset, and must render unclipped
**Context**: The pulse is not an exportable asset (zero assets under "Pulse Animation") — it's 5 onion-skinned vector frames, each a 122×48 rounded rect meant to scale up + fade out. AP-79 draws it emanating outside the 122×48 button box, so it must not be clipped by the MUI Button content box, the widgetGroup, or the fixed bottom bar. The original sketch used a `box-shadow` nested inside the `<Button>` — wrong primitive and clip-prone.
**Decision**: A bordered rounded-rect ring (measured values) animating `transform: scale()` + opacity, rendered as a **sibling of the `<Button>`** inside a `position: relative; overflow: visible` wrapper, with the button at `z-index:1` above the rings. Two staggered rings mirror the board's continuous pulse. Exact motion confirmed via screenshot-vs-board compare.

---

### The pulse-state unit test asserts on the wrong element
**Context**: The test sketch checked the pulse class via `screen.getByTestId("hazbot-button").className`, but `data-testid="hazbot-button"` is on the inner MUI `<Button>` while the `ready` class is on the **wrapper** `<div>`. With `identity-obj-proxy` mapping `css.ready === "ready"`, the post-arm assertion would always fail.
**Decision**: Assert against the wrapper via `screen.getByTestId("hazbot-button").closest(".hazbotButtonWrap")` and assert the `.pulse` ring count (0 when idle, 2 when pulsing). The click test keeps `data-testid="hazbot-button"` on the `<Button>` for `fireEvent.click`.

---

### MUI emotion will override the `.hazbotButton` background fills
**Context**: `hazbot-button.scss` sets the default / hover / active backgrounds directly on `.hazbotButton` (the MUI `<Button>` root) at specificity (0,1,0). The repo documents that MUI's `.MuiButton-root` defaults are injected after the static SCSS and win on equal-specificity source-order (hence `.playbackButton` needs `!important`), so the AP-79 fills risk not applying.
**Decision**: Add `!important` to the default, hover, and active `background` declarations (matching the documented `.playbackButton` pattern), with a comment explaining the emotion source-order reason.

---

### The burnout-arm Jest test depends on an assignment order the plan left unspecified
**Context**: `simulationEnded` is a computed over `simulationStarted && !simulationRunning && !!engine?.fireDidStop`, and `simulation.engine` is not observable — the reactivity edge is carried solely by `simulationRunning`. So the test must assign the `fireDidStop:true` engine **before** flipping `simulationRunning = false`; the reverse order leaves `simulationEnded` false and the reaction never fires (a silent false-negative).
**Decision**: The burnout-arm test specifies the order explicitly: inside one `act()`, assign `mockEngine({ fireDidStop: true })` first, then set `simulationRunning = false`, mirroring production `tick()` (which has `fireDidStop === true` before it sets `simulationRunning = false`).
