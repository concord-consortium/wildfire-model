# Hazbot: Add Hazbot Analysis Button

**Jira**: https://concord-consortium.atlassian.net/browse/WM-6
**Repo**: https://github.com/concord-consortium/wildfire-model
**Implementation Spec**: [implementation.md](implementation.md)
**Status**: **In Development**

## Overview

<!-- Rewritten during Finalization. -->
Add a "Hazbot Analysis" button (with the Hazbot avatar) in the model corner of the Wildfire Explorer. The button appears only on Hazbot-enabled pages, has a calm default look before the model runs and a "ready" glow after a run completes, and on click triggers the (separately built) Hazbot feedback panel.

## Project Owner Overview

<!-- Rewritten during Finalization. -->
The Hazbot is a pedagogical agent that watches how a student sets up and runs the wildfire model and offers targeted, behavior-based help. This story delivers the student's entry point into that help: a visible button in the model area that invites a click once the student has run the simulation. The button itself does not show any feedback text; it is the trigger. The actual coaching message comes from the matched rule-set category and is rendered by a sibling feature. Surfacing the button only when Hazbot is enabled (via URL configuration) keeps it out of the way for activities that do not use the Hazbot.

## Background

The Hazbot analysis engine (the "substrate") classifies recorded student behavior into pedagogical categories defined per rule-set under [src/hazbot/rule-sets/](../../src/hazbot/rule-sets/). The engine is constructed once per session by [getAnalysisEngine()](../../src/hazbot/wildfire/engine-singleton.ts) and exposed to React via the `AnalysisEngineProvider` / `useAnalysisEngine` pair in [src/hazbot/engine/react/](../../src/hazbot/engine/react/). `useAnalysisEngine()` already returns the live `matchedCategory` (computed by `computeMatchedCategoryForEngine`) plus the full rule-set, so the matched category's `feedback` text is reachable without new engine work (WM-10, done).

Today the engine and its `useAnalysisEngine` hook are only consumed by the developer sidebar ([src/hazbot/engine/sidebar/sidebar.tsx](../../src/hazbot/engine/sidebar/sidebar.tsx)), which mounts when `?hazbotSidebar=true`. There is no student-facing Hazbot UI yet. The app shell ([src/components/app.tsx](../../src/components/app.tsx)) constructs the engine when either `?hazbotRules` or `?hazbotSidebar` is set, and mounts the sidebar (with its own `AnalysisEngineProvider`) as an optional right column.

Each rule-set defines categories in priority order; the first whose expression is true is "matched." Category 1 (e.g. `NOT ranSimulation`) matches before any run, so a pre-run click naturally surfaces the "run the model first" refusal message through the same feedback path. No separate pre-run copy is needed.

The simulation model ([src/models/simulation.ts](../../src/models/simulation.ts)) exposes the run lifecycle: `simulationStarted`, `simulationRunning`, and the computed `simulationEnded` (`simulationStarted && !simulationRunning && engine.fireDidStop`). These are candidate signals for the button's "ready" state.

This story (WM-6) delivers the button and its click wiring only. The popover/panel that displays the feedback is a sibling story built on the WM-11 anchored-popover primitive; the visual design is owned by AP-79.

## Requirements

<!-- Updated as Open Questions are resolved. -->

- A "Hazbot Analysis" button renders in the bottom control-buttons row on Hazbot-enabled pages only, gated on a **loaded rule-set** — `getAnalysisEngine()?.ruleSet` being defined, not merely the presence of `?hazbotRules`. An invalid id (e.g. `?hazbotRules=99`, no matching key in `ruleSets`) yields `engine.ruleSet === undefined` and must **not** render the button, since no feedback path exists. This is the same gate WM-6 uses for the `AnalysisEngineProvider` mount, so the button and provider share one signal.
- The button is a 48 × 48 Hazbot avatar plus a two-line "Hazbot / Analysis" text label (Lato 16px, weight 700) to its right, per AP-79.
- The Hazbot avatar runs a **random blink** animation in all states (AP-79): on a randomized idle cycle the eyes briefly close. It is local presentation state on the button (no engine/run-lifecycle coupling) and is independent of the default/ready/hover/select button states below. Implemented via the layered avatar (separate `Back` / `Eyes` / `Blinks` SVGs).
- The button implements four states per AP-79: **default**, **ready (pulse)**, **hover**, and **select (pressed)**:
  - **Default** — no pulse. Shown before the model has run, while a run is in progress, and after the student has clicked the button for the current run.
  - **Ready** — a pulsing animated outline emanating from the button edge (`#0050C4` → `#FFF`), shown after a run **completes**. "Completes" is an explicit signal (not the bare `simulationStarted && !simulationRunning`): it arms on a manual Stop (the Start→Stop toggle) or on `simulationEnded` (natural burnout), and is explicitly **not** armed by a Fire Line pause (which also stops the sim but is mid-intervention). The pulse stops once the student clicks the button, and re-arms only after the next run completes. The pulse also requires `simulationStarted`, so a Restart or Reload (which clears `simulationStarted`) hides it, keeping the button un-pulsed in the pre-run state.
  - **Hover** and **Select** — standard interactive affordances per AP-79's button-states section.
- WM-6 wraps the Hazbot button's mount point in an `AnalysisEngineProvider` (gated on a loaded rule-set), as a forward-looking deliverable so the sibling WM-11 panel story can consume `useAnalysisEngine()` at this location without re-plumbing the mount. WM-6's own button does not consume the `useAnalysisEngine()` hook for rendering; its only engine read is the pure `computeMatchedCategoryForEngine()` call at click time for the log payload (see below).
- Clicking the button sets a `showHazbotFeedback` observable flag on the UI store. The sibling panel story reads this flag to display the feedback; the displayed copy comes from the matched rule-set category's `feedback` field, not from this story. WM-6 does not render the panel.
- Clicking the button also logs a `HazbotButtonClicked` event carrying the matched category id (read at click time via the pure `computeMatchedCategoryForEngine(getAnalysisEngine())` call, not the `useAnalysisEngine()` hook), consistent with the other bottom-bar `*ButtonClicked` log events. The payload field is typed `number | null`: `computeMatchedCategoryForEngine` returns `null` when no category floor matches (e.g. a pre-run click on a rule-set whose lowest category does not fire on the empty-reading prefix), and that `null` is carried **explicitly** rather than omitted, so the event schema is uniform for analytics. WM-6 does not feed the click to the engine as a Reading — but note this is enforced by `translate()`'s `default → no-op` branch, not by bypassing the engine: `log()` routes every event (this one included) through `engine.consume()`, so `HazbotButtonClicked` must stay **unhandled** in [translate.ts](../../src/hazbot/wildfire/translate.ts) or the click would mutate the matched category it just reported.
- The button is interactive before a run too: a pre-run click matches Category 1 and surfaces its pre-run message through the same feedback path.
- Visual design (placement, avatar asset, sizing, default vs. ready styling, glow) follows AP-79.

## Technical Notes

- **Engine access in React**: WM-6's button does **not** consume the `useAnalysisEngine()` hook — per Decision A it only sets the flag (and logs the click). Its inputs are the run-state observables and `ui.showHazbotFeedback` via `useStores()`, plus the `?hazbotRules` gate (see Gating below, resolved via `getAnalysisEngine()?.ruleSet` — a plain call, no hook). The one engine read it does make is at click time: `computeMatchedCategoryForEngine(getAnalysisEngine())` ([evaluator.ts:318](../../src/hazbot/engine/evaluator.ts#L318)) to populate the `HazbotButtonClicked` log payload — a pure call, still no hook or provider dependency. WM-6 does still mount an `AnalysisEngineProvider` around the button's location as a forward-looking deliverable (see Requirements): today the provider only wraps the sidebar ([app.tsx:132-136](../../src/components/app.tsx#L132-L136)), so this establishes provider coverage at the bottom-bar mount for the sibling WM-11 panel story, which *will* consume `useAnalysisEngine()` there. The matched category object (with `feedback`) the sibling reads is `engine.ruleSet.categories.find(c => c.id === matchedCategory)`. Note `BottomBar` is a class component, so the button itself is a function-component (`observer`) child.
- **Gating**: `getAnalysisEngine()` returns `undefined` when neither `?hazbotRules` nor `?hazbotSidebar` is set, but it can be non-undefined for sidebar-only sessions, and it is also non-undefined for an *invalid* `?hazbotRules` id (the engine is constructed with `ruleSet: undefined`, [engine-singleton.ts:33](../../src/hazbot/wildfire/engine-singleton.ts#L33)). So the gate is specifically `getAnalysisEngine()?.ruleSet` being defined — not engine existence and not the bare presence of `?hazbotRules`. Note this is **stricter** than app.tsx's existing sidebar-provider mount ([app.tsx:132](../../src/components/app.tsx#L132)), which gates only on a truthy `engine` (so the sidebar still mounts for an invalid id to surface construction errors via its ErrorsPanel); the `engine.ruleSet` branch is what the `Sidebar` content (and WM-6's button) use to require a real feedback path. This is a plain call, not the `useAnalysisEngine()` hook.
- **Run-complete signal** (resolved, Self-Review QA option C): "a run completed" is an explicit signal, not the bare `simulationStarted && !simulationRunning`. It arms on the manual Stop button (`handleStart`'s Start→Stop toggle, [bottom-bar.tsx:216-217](../../src/components/bottom-bar.tsx#L216-L217)) or on `simulationEnded` (computed in [src/models/simulation.ts:136](../../src/models/simulation.ts#L136), natural burnout, access via `useStores()`). A **Fire Line pause must be excluded**: `handleFireLine` also calls `simulation.stop()` ([bottom-bar.tsx:297](../../src/components/bottom-bar.tsx#L297)) and the draw-end handler does not resume ([use-draw-fire-line-interaction.tsx:40](../../src/components/view-3d/use-draw-fire-line-interaction.tsx#L40)), so a pure `!simulationRunning` test would wrongly arm the pulse mid-intervention. The "run completed since last arm" flag is reset on the next Start and cleared on the click that opens feedback. The pulse predicate **also requires `simulationStarted`** (i.e. pulse = armed flag `&& simulationStarted && !simulationRunning`): `restart()` ([simulation.ts:402-404](../../src/models/simulation.ts#L402)) and `reload()` ([simulation.ts:428-434](../../src/models/simulation.ts#L428)) clear `simulationStarted` without routing through `start()`, so requiring it auto-hides a stale pulse if the student hits Restart/Reload after a completed run instead of clicking the button (the stale armed flag is then reset on the next Start). Without this guard the pulse would glow over the pre-run / terrain-setup state. Helitack does not stop the sim, so it needs no special handling.
- **Placement**: AP-79 places the button in the bottom **control-buttons row** ([src/components/bottom-bar.tsx](../../src/components/bottom-bar.tsx)), not as a free-floating overlay in the 3D-view corner. The board has two layouts — "with Fire Intensity Scale" and "without" — and notes the Hazbot button is positioned relative to the centered middle controls / the Fire Intensity Scale. (The ticket's "model corner" phrasing is looser than the design; the bottom control row is authoritative.)
- **Existing button/icon patterns**: [src/components/icon-button.tsx](../../src/components/icon-button.tsx) (which already takes an `icon` + `highlightIcon` pair) and the bottom-bar `Button`s are the established button idioms in this repo.
- **MobX**: any component reading `simulation.simulationRunning` / `simulationStarted` must be an `observer`. The Hazbot button is a function-component `observer` child of the class `BottomBar`. The WM-6-owned pulse state (the "run completed since last arm" and "clicked since last run" flags) must therefore live as **observable** UI state, not a plain `BottomBar` instance field or closure variable, or the `observer` button will not re-render when it flips and the pulse will not turn on/off. The natural home is [UIModel](../../src/models/ui.ts) alongside the new `showHazbotFeedback` flag (same `@observable` idiom), which also makes the pulse transitions unit-testable.
- **No avatar asset exists yet**: `find src/assets -iname "*hazbot*"` returns nothing; the Hazbot avatar art must be exported from AP-79 and added to the repo.

### AP-79 design specs ([Zeplin board](https://app.zeplin.io/project/5fe47ae231d1f6a428c53450/screen/69b2baa489a2e2f3308238b8))

AP-79 is a large board covering the whole coach-mark overlay system. WM-6 consumes only the Hazbot button:

- **Button (`Hazbot Button` group)**: 122 × 48. Composed of a 48 × 48 avatar placement (`Hazbot Button - Placement`; avatar art `Hazbot` ≈ 47 × 44) and a two-line text label "Hazbot / Analysis" (Lato, 16px, weight 700) to its right.
- **Default state**: avatar + label, no pulse.
- **Ready / pulse state**: "Pulsing animated outline (emanating from button edge), similar to the Update Code button in MODA; `#0050C4` to `#FFF`." Shown after each run completes; stops once clicked; re-arms after the next run.
- **Hover / Select states**: the board defines distinct Default / Hover / Select button states (exact values to be measured during implementation).
- **Random blink** (in scope, per the updated animations decision): AP-79 calls for a periodic random blink on the Hazbot avatar with a sketch `useState`/`useEffect` snippet on the board — random idle `1000 + Math.random()*2500` ms → eyes closed (`Blinks` layer) for 180 ms → 80 ms pause → loop. The avatar is exported as three `svg@1x` layers (`Hazbot Button - Back` / `Eyes` / `Blinks`); the button stacks `Back` + (`Eyes` open / `Blinks` closed). See [implementation.md](implementation.md) for the hardened (unmount-safe) version of the loop.
- **Large / scaled-up variant (135 × 69)**: the button scales up while the coach mark is displayed above it. This scale-up + coach-mark behavior is the sibling feedback-panel story, **not WM-6**.
- The board uses `#0050C4` as the Hazbot accent/step color and Lato for labels.

## Out of Scope

- The feedback display itself (the sibling Hazbot feedback-panel story / WM-11 anchored popover). WM-6 sets the `showHazbotFeedback` flag on click; it does not render the panel.
- The button's scale-up animation and the coach mark displayed above it (sibling feedback-panel story).
- Activating grayed-out questions (AP-76).
- Confetti / success-state animation (WM-9).
- Any change to rule-set `feedback` copy.
- Accessibility concerns (per project convention, out of scope for this repo's specs).

## Open Questions

### RESOLVED: Where does the click handler "hand off" to, given the panel is a sibling story?
**Context**: WM-6 owns the button and its click; the panel that renders the feedback is a separate story (WM-11 anchored popover). We need to define WM-6's exact deliverable boundary so the button is testable now without the panel existing.
**Options considered**:
- A) WM-6 introduces shared UI state (e.g. a `ui.showHazbotFeedback` flag) that the button sets; the sibling panel story later reads it. WM-6 ships the button + state plumbing, with a temporary minimal render (or no render) of the panel.
- B) WM-6 takes an `onClick`/callback prop and the integration is left to the sibling story; WM-6 only proves the button renders and fires the handler (verified via test/log).
- C) WM-6 ships the button plus a bare-bones inline panel that shows the matched category's `feedback` text (no WM-11 styling), to be replaced by the sibling story.

**Decision**: **A** — Add a `showHazbotFeedback` observable boolean to [UIModel](../../src/models/ui.ts) (matching the existing `showChart` / `showTerrainUI` flag idiom, toggled by direct assignment), which the button sets on click. The sibling WM-11 panel story reads this flag. WM-6 ships the button + the flag; it does not render the panel. This gives the sibling story a stable, conventional contract and is fully unit-testable now (assert the flag flips on click).

### RESOLVED: What exactly triggers the "ready" state, and does it reset?
**Context**: The ticket says "ready" appears "after a run completes." `simulation` exposes `simulationStarted`, `simulationRunning`, and computed `simulationEnded` (fire burned out by itself). The Start button toggles to "Stop" mid-run ([bottom-bar.tsx:166](../../src/components/bottom-bar.tsx#L166)); a manual Stop sets `simulationRunning = false` without `fireDidStop`, so `simulationEnded` stays false. We need a precise rule that doesn't drop the manual-Stop case.
**Options considered**:
- A) "Ready" = `simulationEnded` (the fire has stopped on its own). Misses the manual-Stop case.
- B) "Ready" latches after the first Start and stays ready, even across Restart. Glows during the run, contradicting "after a run completes."
- C) "Ready" = `simulationStarted` (true as soon as Start is pressed); glow appears during the run.
- D) "Ready" = `simulationStarted && !simulationRunning` — a run has been started and is not currently running.

**Decision**: **D, refined by AP-79, then further refined to option C in Self-Review (QA)** — "Ready" (pulsing) is shown after a run **completes** and while the student has not yet clicked the button since that completion. "Completes" is an **explicit signal** rather than the bare `simulationStarted && !simulationRunning`: it arms on a manual Stop (Start→Stop toggle) or `simulationEnded` (natural burnout), and is **not** armed by a Fire Line pause (which also stops the sim but is mid-intervention — see Self-Review QA "ready rule spuriously arms during a Fire Line pause"). This shows no pulse before the first run or during an active run, stops the pulse once the student clicks (opens feedback), and re-arms only after the next run completes ("Hazbot button pulses after each run"). Tracking both "run completed since last arm" and "clicked since last run" is WM-6's responsibility since WM-6 owns the click; the next Start resets them. The pulse predicate **also requires `simulationStarted`**, so a Restart or Reload (both clear `simulationStarted` without going through `start()`) hides any stale pulse before the next run, keeping "no pulse before the first run" intact. It is a small derivation over existing observables plus this WM-6-owned state.

### RESOLVED: Is the button always enabled (clickable pre-run), or disabled until "ready"?
**Context**: The ticket's click-behavior note implies a pre-run click is valid (it surfaces Category 1's "run the model first" message). Verified: pre-run, `engine.isActive` is true with a loaded rule-set and `matchedCategory === 1` (`NOT ranSimulation`), so a pre-run click has valid feedback. But a design could instead disable the button until a run completes.
**Options considered**:
- A) Always enabled. Pre-run / during-run clicks surface the Category-1 refusal feedback. (Matches the ticket's "no separate pre-run copy" reasoning.)
- B) Enabled only in the "ready" state; pre-run the button is visible but disabled/non-interactive.

**Decision**: **A** — The button is always enabled whenever it renders. The default/ready states are purely visual affordances, not interaction gates. A pre-run (or during-run) click surfaces the Category-1 "run the model first" feedback through the same path. Disabling pre-run would make that message unreachable and contradict the ticket's click-behavior section.

### RESOLVED: Button presentation — avatar only, or avatar + "Hazbot Analysis" label?
**Context**: The ticket calls it a "Hazbot Analysis" button with the Hazbot avatar. The AP-79 Zeplin board was fetched and shows the exact composition.
**Options considered**:
- A) Avatar only (icon button), label text deferred to AP-79's final spec.
- B) Avatar + visible "Hazbot Analysis" text label.
- C) Defer entirely to AP-79; treat as a visual-spec dependency and do not finalize until the Zeplin design is available.

**Decision**: **B** — Per AP-79: a 48 × 48 Hazbot avatar plus a two-line "Hazbot / Analysis" text label (Lato 16px, weight 700) to its right; 122 × 48 total.

### RESOLVED: Are the AP-79 visual specs (Zeplin) available to fold into this spec now?
**Context**: This is UI work and AP-79 is the design source. The Zeplin MCP server is configured.
**Options considered**:
- A) Provide the AP-79 Zeplin URL now; I fetch the specs and fold them in, resolving the visual-detail questions.
- B) AP-79 design is not ready; proceed with behavior/structure now and leave visual values as a tracked dependency on AP-79.

**Decision**: **A** — AP-79 board fetched ([Zeplin screen](https://app.zeplin.io/project/5fe47ae231d1f6a428c53450/screen/69b2baa489a2e2f3308238b8)). Specs folded into Technical Notes below. Note AP-79 is a large board covering the full coach-mark overlay system; WM-6 consumes only the Hazbot button portion.

### RESOLVED: Which button animations/states are in WM-6 scope vs. deferred?
**Context**: AP-79 defines several button behaviors beyond default/ready: a Hover state, a Select (pressed) state, a periodic "random blink" on the avatar, and the scale-up-with-coach-mark behavior. The scale-up is clearly the sibling panel story. The others need a scope call so WM-6 has a crisp acceptance boundary.
**Options considered**:
- A) WM-6 ships default + ready(pulse) + hover + select (all states intrinsic to the button); the random blink is deferred to a polish story; scale-up stays with the sibling panel story.
- B) WM-6 ships everything intrinsic to the button including the random blink (default + ready + hover + select + blink); only scale-up + coach mark are deferred.
- C) WM-6 ships only default + ready(pulse) (the two states the ticket's AC names); hover, select, and blink all deferred to a polish/visual story.

**Decision**: **A, revised to include the random blink** — WM-6 ships default + ready(pulse) + hover + select **and the random-blink avatar animation**. Blink was originally deferred (option A), but during implementation planning the avatar was found to be exported as three independent `svg@1x` layers (`Back` / `Eyes` / `Blinks`) and the blink is a self-contained ~25-line `useEffect` with no engine/run-lifecycle coupling — so stacking the layers for the static avatar already does most of the work, and shipping the avatar in pieces only to wire the animation in a separate story is more process overhead than value. Pulled forward (confirmed). The scale-up + coach mark stays with the sibling feedback-panel story.

## Self-Review

<!-- Each issue below was verified against the current code before being recorded
     (see the code references). Processed one at a time. -->

### Senior Engineer

#### RESOLVED: `useAnalysisEngine()` is not required by WM-6, but WM-6 establishes provider coverage for the sibling story
The Technical Notes originally prescribed consuming `useAnalysisEngine()` inside the button. Per the resolved Decision A, WM-6's button **only sets `ui.showHazbotFeedback` on click and does not render feedback** — so it never reads `matchedCategory` or the rule-set. Verified against code: the three things the button actually needs are (1) the run-lifecycle observables (`simulationStarted` / `simulationRunning`) via `useStores()`, (2) `ui.showHazbotFeedback` via `useStores()`, and (3) the `?hazbotRules` gate. None require the analysis-engine hook. The provider today wraps only the `Sidebar` ([app.tsx:132-136](../../src/components/app.tsx#L132-L136)); the `BottomBar` is a class component outside it.

**Decision (option B)**: Keep the `AnalysisEngineProvider` requirement, but make it an **explicit, forward-looking deliverable** rather than a consequence of the button needing the hook. WM-6 wraps the Hazbot button's mount point in an `AnalysisEngineProvider` (gated on a loaded rule-set) so the sibling WM-11 panel story can consume `useAnalysisEngine()` at exactly this location without re-plumbing the mount. WM-6 itself does **not** consume the hook for rendering (its sole engine read is the pure `computeMatchedCategoryForEngine()` call at click time for the log payload — see the Education Researcher option-B resolution). This is recorded as its own requirement bullet so the provider work is intentional and reviewable, not buried in the notes.

---

### QA Engineer

#### RESOLVED: The "ready" rule spuriously arms the pulse during a Fire Line pause
"Ready" was defined as `simulationStarted && !simulationRunning` (plus not-clicked-since-run), justified as covering natural burnout and manual Stop. But `handleFireLine` calls `simulation.stop()` ([bottom-bar.tsx:297](../../src/components/bottom-bar.tsx#L297)), and the draw-end handler ends the interaction with `ui.interaction = null` and **never resumes the sim** ([use-draw-fire-line-interaction.tsx:40](../../src/components/view-3d/use-draw-fire-line-interaction.tsx#L40)) — the student must press Start again. So while a student is mid-fire-line (sim paused), `simulationStarted && !simulationRunning` is true and the Hazbot button would pulse "ready," even though no run has *completed* and the student is in the middle of an intervention. The spec only considered burnout and the explicit Stop button. (Helitack does **not** stop the sim — [bottom-bar.tsx:307-312](../../src/components/bottom-bar.tsx#L307-L312) — so only the Fire Line path and the manual-Stop path reach this paused-but-started state.)

**Decision (option C)**: "Run completed" becomes an explicit signal rather than the bare `simulationStarted && !simulationRunning` derivation. The pulse arms only on (a) the manual Stop button (the Start→Stop toggle in `handleStart`) or (b) `simulationEnded` (natural burnout); a Fire Line pause is explicitly **excluded**. This is faithful to "after a run completes." It costs one small piece of WM-6-owned tracked state (a "run completed since last arm" flag, set on manual Stop / burnout, reset on the next Start, and cleared on the click that opens feedback). This derivation is private to WM-6 — nothing outside the button reads it (the sibling contract is `ui.showHazbotFeedback` only) — so if the fire-line-pause distinction proves unnecessary it can be relaxed to a simpler predicate with a localized edit + test update later.

#### RESOLVED: Gating signal is ambiguous for an invalid `?hazbotRules` id
Requirement line 33 originally gated on "the presence of `?hazbotRules=<id>`," while Technical Notes gated on "`engine.ruleSet` being defined." These diverged: `ruleSets` contains only keys 23,24,25,32,33,34,35,42,45,47,54 ([rule-sets/index.ts](../../src/hazbot/rule-sets/index.ts)), so `?hazbotRules=99` leaves the param present but `engine.ruleSet === undefined` ([engine-singleton.ts:33](../../src/hazbot/wildfire/engine-singleton.ts#L33)). Under one reading the button renders for a bogus id (with no feedback possible); under the other it does not.

**Decision**: Gate explicitly on `getAnalysisEngine()?.ruleSet` being defined — the stronger invariant, since it guarantees a real feedback path exists and matches how `app.tsx` and the sidebar already branch. An invalid id renders no button. The requirement and the Gating note are updated to state this single signal, which is also reused for the `AnalysisEngineProvider` mount gate (SE option B), so button and provider share one gate.

---

### Education Researcher

#### RESOLVED: The button click is not logged, losing the record of when a student requests feedback
WM-6 set only the `ui.showHazbotFeedback` observable on click. Every other bottom-bar action emits a log event — `SparkButtonClicked`, `FireLineButtonClicked`, `HelitackButtonClicked`, `TerrainPanelButtonClicked` ([bottom-bar.tsx:304-324](../../src/components/bottom-bar.tsx#L304-L324)). A flag-only Hazbot click produces no event, so research/analytics cannot see when (or how often, or at what matched-category state) a student asked the Hazbot for feedback — arguably the single most pedagogically interesting interaction in the feature.

**Decision (option B)**: On click, WM-6 logs a `HazbotButtonClicked` event **carrying the matched category id**, consistent with the existing button-logging convention. The matched category is read at click time via the pure `computeMatchedCategoryForEngine(getAnalysisEngine())` call ([evaluator.ts:318](../../src/hazbot/engine/evaluator.ts#L318), returns `number | null`) — **not** the `useAnalysisEngine()` hook — so this does not contradict the SE decision that the button does not consume the hook for rendering, and needs no provider. The payload field is typed `number | null` and carries `null` explicitly when no category matches (deterministic with the evaluator's contract), so the analytics schema stays uniform across rule-sets and the pre-run case. Feeding the click to the engine as a Reading remains out of scope (the matched category is computed from prior behavior; the click only surfaces it).

---

<!-- ============================================================
     Round 2: code-verified multi-role review (2026-06-15)
     Each issue below was deep-dived against the current source
     (run lifecycle, MobX store, evaluator) before being written.
     ============================================================ -->

### QA Engineer (Round 2)

#### RESOLVED: Restart and Reload leave the "ready" pulse armed, so it pulses in the pre-run state
The resolved ready rule arms a WM-6-owned "run completed since last arm" flag on manual Stop / burnout and resets it **only "on the next Start"** (Decision "What exactly triggers the ready state", and Technical Notes "Run-complete signal"). But `restart()` ([simulation.ts:402-404](../../src/models/simulation.ts#L402)) and `reload()` ([simulation.ts:428-434](../../src/models/simulation.ts#L428), which calls `restart()`) set `simulationStarted = false` **without routing through `start()`** ([simulation.ts:378](../../src/models/simulation.ts#L378)), and `handleRestart` / `handleReload` ([bottom-bar.tsx:263-291](../../src/components/bottom-bar.tsx#L263)) never touch any WM-6 flag. So this sequence is unhandled: run completes (flag armed, pulse on) → student clicks **Restart** (or **Reload**) instead of the Hazbot button → `simulationStarted` goes false but the armed flag stays set → the button keeps pulsing in the pre-run / terrain-setup state, contradicting "shows no pulse before the first run." (Reload is worse: it forces the student back through Terrain Setup, so the pulse glows over setup.)

**Resolution**: The pulse predicate now additionally requires `simulationStarted` (pulse = armed `&& simulationStarted && !simulationRunning`). Because `restart()` and `reload()` clear `simulationStarted` without going through `start()`, this auto-hides a stale pulse in the pre-run / terrain-setup state, and the stale armed flag is reset on the next Start. Folded into the "Ready" requirement bullet, the ready-state Decision, and the "Run-complete signal" Technical Note.

---

### Product Manager (Round 2)

#### RESOLVED: A manual Stop arms "ready," but a Fire Line pause does not — confirm this asymmetry is the design intent
The ready rule arms on the manual Stop button but explicitly **excludes** a Fire Line pause as "mid-intervention." Verified that both paths are mechanically identical at the model layer: `handleStart`'s Stop branch ([bottom-bar.tsx:216-217](../../src/components/bottom-bar.tsx#L216)) and `handleFireLine` ([bottom-bar.tsx:296-297](../../src/components/bottom-bar.tsx#L296)) both call `simulation.stop()`, which only flips `simulationRunning` to false while `simulationStarted` stays true and the run is resumable via Start. So "manual Stop = a run completed" but "Fire Line pause = not completed" is a pure product distinction, not something the run state expresses. It is defensible (Stop reads as "I'm done; analyze me"), but it is non-obvious and the ticket's wording is just "after a run completes."

**Resolution (option A, confirmed)**: A manual Stop is intended to count as "a run completed" and arms the pulse, even though the fire has not burned out and the run is resumable. Pressing Stop reads as "I am done; analyze me," which is the inverse of a Fire Line pause (an in-progress intervention). The asymmetry is deliberate, not an oversight: the two paths share `simulation.stop()` but carry different user intent, and WM-6 arms on the handler (not the shared `SimulationStopped` log event) precisely so it can distinguish them.

---

### Senior Engineer (Round 2)

#### RESOLVED: The run-complete / clicked tracking state needs a specified, observable home
The spec calls the pulse tracking "WM-6-owned state" but never says where it lives or that it must be reactive. Verified: the Hazbot button is a function-component `observer` child of the class `BottomBar` (Technical Notes), and `UIModel` ([ui.ts](../../src/models/ui.ts)) currently holds no such flag. If the armed/clicked state is a plain instance field on `BottomBar` or a closure variable, the `observer` button will **not** re-render when it changes, so the pulse will not turn on/off. It has to be MobX-observable.

**Resolution**: Added to the MobX Technical Note: the pulse state lives as observable UI state on `UIModel` (same `@observable` idiom as `showHazbotFeedback`), so the `observer` button re-renders on flips and the transitions stay unit-testable.

---

### Education Researcher (Round 2)

#### RESOLVED: `HazbotButtonClicked` payload is undefined-shaped when the matched category is null
The event is specified to carry "the matched category id" from `computeMatchedCategoryForEngine(getAnalysisEngine())`, but that helper returns `number | **null**` ([evaluator.ts:318-328](../../src/hazbot/engine/evaluator.ts#L318)): it yields `null` when no category floor matches the current readings. The button renders only with a loaded rule-set (so `isActive` is true), but a pre-run click on a rule-set whose lowest category does not fire on the empty-reading prefix still computes `null`. The spec does not say what the log carries in that case, so analytics could see a missing field, `null`, or `undefined` inconsistently.

**Resolution**: The `HazbotButtonClicked` requirement and the Education Researcher decision now type the payload field `number | null`, carrying `null` explicitly when no category matches, so the analytics schema is uniform across rule-sets and the pre-run case.

---
