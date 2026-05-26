# Bottom-Bar Controls: State Machine for Setup / Spark / Reload / Restart / Start

**Jira**: https://concord-consortium.atlassian.net/browse/WM-24
**Repo**: https://github.com/concord-consortium/wildfire-model
**Implementation Spec**: [implementation.md](implementation.md)
**Status**: **Ready for Implementation**

## Overview

Rewrite the enable/disable rules for the bottom-bar control buttons so they reflect the
true lifecycle of the simulation (default → setup changed → spark placed → running →
ended → restarted). Today several buttons (Reload, Restart, post-run Start, post-run
Fireline / Helitack) are enabled or disabled at the wrong times relative to the spec.

## Project Owner Overview

The bottom-bar buttons (Setup, Spark, Reload, Restart, Start/Stop, Fire Line, Helitack)
are the student's primary controls for running the Wildfire Model. The Hazbot
behavior-based help-overlay epic (AP-80) assumes those buttons only light up when the
intended action makes sense at that point in the lifecycle — for example, Restart should
only be offered once there is something to restart from. The current implementation lets
Reload and Restart be clicked in the default state, lets Start be re-pressed after a
run completes, and leaves Fire Line / Helitack enabled after they were authored but never
used. This ticket realigns the buttons with the lifecycle so the help text matches what
the student actually sees, and so the controls themselves teach the workflow.

## Background

### Current implementation

Controls are rendered in
[bottom-bar.tsx](../../src/components/bottom-bar.tsx) and their enabled state is computed
from a handful of observables on the `SimulationModel`
([simulation.ts](../../src/models/simulation.ts)):

| Button | Disabled when (today) | Source |
|---|---|---|
| Setup | `simulation.simulationStarted` | [bottom-bar.tsx:93](../../src/components/bottom-bar.tsx#L93), [105](../../src/components/bottom-bar.tsx#L105) |
| Spark | `placing-spark` OR `!canAddSpark` OR `simulationStarted` | [bottom-bar.tsx:62-65](../../src/components/bottom-bar.tsx#L62-L65) |
| Reload | **never** (no `disabled` prop) | [bottom-bar.tsx:122-130](../../src/components/bottom-bar.tsx#L122-L130) |
| Restart | **never** (no `disabled` prop) | [bottom-bar.tsx:131-138](../../src/components/bottom-bar.tsx#L131-L138) |
| Start / Stop | `!simulation.ready` (i.e. no spark placed) | [bottom-bar.tsx:143](../../src/components/bottom-bar.tsx#L143) |
| Fire Line | `drawing-line` OR `!canAddFireLineMarker` OR `!simulationStarted` | [bottom-bar.tsx:67-71](../../src/components/bottom-bar.tsx#L67-L71) |
| Helitack | `helitack-active` OR `!canUseHelitack` OR `!simulationStarted` | [bottom-bar.tsx:73-77](../../src/components/bottom-bar.tsx#L73-L77) |

State observables that drive the above
([simulation.ts:53-54](../../src/models/simulation.ts#L53-L54)):

- `simulationStarted` — true once `start()` has been called, until `restart()` / `reload()`.
- `simulationRunning` — true while the frame loop is active; toggled false by `stop()`
  or when the engine reports `fireDidStop`
  ([simulation.ts:316](../../src/models/simulation.ts#L316)).

There is **no observable for "Setup has been changed since default"** today — this
will be added. (An earlier draft also tracked "was Fire Line / Helitack used during
the run", but that signal turned out not to be load-bearing for the final state
machine — see RESOLVED "Req 5 keeps used Fire Line / Helitack enabled post-run, but
clicking them does nothing.")

### Gaps vs. the spec

| Lifecycle | Spec requires | Currently |
|---|---|---|
| Default (preset just loaded, nothing touched) | Setup, Spark enabled. Reload, Restart, Start, Fire Line, Helitack disabled. | Reload and Restart are enabled. (Start is correctly disabled.) |
| Setup changed | Reload becomes enabled. | Reload was already enabled. No `setupChanged` flag exists. |
| Spark placed | Start enabled. Spark stays enabled until all sparks placed. | Already correct. |
| During run (Start pressed) | Start → Stop. Restart enabled. Setup, Spark disabled. Fire Line / Helitack enabled iff **authored** (preset / URL config has `fireLineAvailable === true` resp. `helitackAvailable === true`; defined more fully at the top of the Requirements section). | Restart was already always enabled. Fire Line / Helitack do enable on `simulationStarted` and the `fireLineAvailable` / `helitackAvailable` config flags act as the "authored" gate. |
| After run (fire finished naturally) | Stop → Start, **Start disabled**. Restart enabled. Setup, Spark disabled. Fire Line, Helitack disabled (regardless of whether they were used). | After run, `simulationStarted` stays true so Setup/Spark stay disabled, but Start re-enables (`ready` is still true) and Fire Line / Helitack stay enabled. |
| Restart pressed | Restart disabled. Start enabled. Setup and Spark (if any left) enabled. Placed sparks remain and can be moved. Fire Line / Helitack disabled (back to pre-run). Any placed fire lines on the model are cleared. | Restart never disables. `restart()` already preserves sparks and clears `fireLineMarkers` ([simulation.ts:242-266](../../src/models/simulation.ts#L242-L266)). Setup / Spark / Start re-enable correctly because `simulationStarted` flips false. |
| Reload pressed | Return to Default. Clears model. | Already correct (`reload()` calls `restart()` then re-runs `setInputParamsFromConfig()` + `populateCellsData()`, [simulation.ts:268-273](../../src/models/simulation.ts#L268-L273)). |

### Buttons explicitly NOT in scope

The spec calls out "Hazbot and Fullscreen Toggle are always enabled". The Fullscreen
icon in [bottom-bar.tsx:184](../../src/components/bottom-bar.tsx#L184) already has no
disable predicate. The Hazbot button is in the top bar / overlay system (out of this
file) and is unchanged by this ticket.

The **Fire Intensity Scale** rendered in
[bottom-bar.tsx:172-178](../../src/components/bottom-bar.tsx#L172-L178) is a display
widget, not a button. Its visibility is gated by `config.showBurnIndex`. The Zeplin
artboard shows it visible in all 7 lifecycle states. This ticket does not change its
behavior.

## Requirements

The bottom-bar controls must follow this state machine. "Authored" means the
preset / URL config has `fireLineAvailable === true` (resp. `helitackAvailable === true`).

1. **Default** (preset loaded, nothing changed, no spark placed, sim not started):
   - Enabled: **Setup**, **Spark**.
   - Disabled: **Reload**, **Restart**, **Start**, **Fire Line**, **Helitack**.
   - **Preset caveat**: a few dev/test presets (`basic`, `basicWithWind`,
     `slope45deg`, `basicWithSlopeAndWind` in [src/presets.ts](../../src/presets.ts))
     ship with a pre-placed spark in `config.sparks`. On load they satisfy
     `sparks.length > 0`, so the Reload-enabled predicate fires and the lifecycle
     effectively starts in state 3 (Spark placed) rather than state 1 (Default).
     All curriculum-facing presets (`plainsTwoZone`, `mountainsandplainsTwoZone`,
     `hillTwoZone`, `hillThreeZone`, etc.) have empty `sparks`, so this only
     affects developer environments.

2. **Setup changed** (the user has committed setup edits via the wizard's Create
   button — i.e. `setupChanged === true`; defined precisely below):
   - Reload becomes **enabled**.
   - All other rules from the current sub-state still apply.

   "Setup changed" means: the user clicks **Create** on the wizard *and* at least one
   of `zonesCount`, any zone's `terrainType` / `vegetation` / `droughtLevel`,
   `windSpeed`, or `windDirection` differs from the values captured when the wizard
   opened. The diff is against the wizard-open snapshot, **not** against the preset
   default — so reverting customizations to the preset values via Create still leaves
   `setupChanged === true` (acceptable wart; Reload then becomes a harmless no-op).
   See RESOLVED question ["What counts as 'Setup changed'?"](#resolved-what-counts-as-setup-changed)
   for the full rationale.

3. **Spark placed** (at least one spark exists on the model, sim not yet started):
   - **Start** becomes enabled.
   - **Spark** stays enabled iff `remainingSparks > 0` AND the user is not
     already in placement mode (`ui.interaction !== Interaction.PlaceSpark`).
     The existing `Interaction.PlaceSpark` guard from
     [bottom-bar.tsx:62-65](../../src/components/bottom-bar.tsx#L62-L65) is
     preserved in the new `sparkEnabled` button-state getter, mirroring how
     Requirement 4 preserves the Fire Line / Helitack interaction guards. The
     per-zone budget rule (one spark per zone — see
     [simulation.ts:104-107](../../src/models/simulation.ts#L104-L107)) is
     carried by `canAddSpark` / `remainingSparks` as today. See Technical
     Notes' "New `@computed` properties" for where each predicate lives
     (`sparkEnabled` is a component-class getter that composes a
     simulation-only predicate with the `ui.interaction` guard, since
     `ui.interaction` is not owned by `SimulationModel`).
   - **Reload** becomes enabled (sparks placed counts as "something material happened" —
     see RESOLVED question "After a run ends, should Reload be enabled?").

4. **Running or Paused** (user has pressed Start at least once; engine still alive;
   fire has not finished naturally — i.e. `simulationStarted && !engine?.fireDidStop`):
   - The Start/Stop button label is **Stop** while `simulationRunning === true` (i.e.
     the engine is ticking) and **Start** while `simulationRunning === false` (i.e.
     the user has paused via Stop). Either way the button stays **enabled** so the
     user can pause or resume.
   - **Restart** is enabled.
   - **Setup** and **Spark** are disabled.
   - **Fire Line** is enabled iff authored AND the existing
     `canAddFireLineMarker` predicate is true (i.e. fewer than 2 markers committed
     and `time - lastFireLineTimestamp > fireLineDelay` cooldown elapsed —
     [simulation.ts:109-117](../../src/models/simulation.ts#L109-L117)) AND the user
     is not already drawing (`ui.interaction !== Interaction.DrawFireLine`). The
     cooldown / capacity gates are preserved from the current implementation, not
     removed. Available during the user-pause sub-state too, since the existing
     Fire Line workflow pauses the engine for marker placement (see RESOLVED
     question "After Stop is pressed mid-run...").
   - **Helitack** is enabled iff authored AND the existing `canUseHelitack`
     predicate is true (cooldown elapsed —
     [simulation.ts:119-127](../../src/models/simulation.ts#L119-L127)) AND the
     user is not already selecting a drop (`ui.interaction !== Interaction.Helitack`).
     Same preservation note: existing cooldown is kept.

5. **Ended — fire finished naturally** (`simulationStarted && !simulationRunning &&
   engine?.fireDidStop`). User-pressed Stop does **not** enter this state (see
   RESOLVED question "After Stop is pressed mid-run..."):
   - Start/Stop button shows **Start**, **disabled** (a finished run cannot be
     resumed; the user must Restart or Reload).
   - **Restart** stays enabled.
   - **Setup** and **Spark** stay disabled.
   - **Fire Line** is disabled. (The Zeplin Ended-state depicts Fire Line disabled
     unconditionally; clicking it post-run would have no useful effect anyway since
     Start is disabled and `applyFireLineMarkers()` only runs on Start. See
     RESOLVED Self-Review issue "Req 5 keeps used Fire Line / Helitack enabled
     post-run, but clicking them does nothing.")
   - **Helitack** is disabled. (Same reasoning.)

6. **Restarted** (Restart button pressed from Running, Paused, or Ended):
   - **Restart** is now disabled (we are back to a pre-run state).
   - **Start** is enabled (sparks still exist).
   - **Setup** is enabled.
   - **Spark** is enabled iff there is still spark budget remaining (`remainingSparks > 0`).
   - Previously placed sparks remain on the model and can be moved. Drag-to-move
     is already wired through `simulation.setSpark()`
     ([spark.tsx:18](../../src/components/view-3d/spark.tsx#L18),
     [simulation.ts:433](../../src/models/simulation.ts#L433)) and is not affected
     by the new state machine. Regression-covered by the new "Drag-to-move
     spark survives Restart" Jest test enumerated below.
   - **Fire Line** and **Helitack** are disabled (we are pre-run again).
   - Any placed Fire Line markers are cleared from the model.
   - **`ui.interaction` is reset to `null`**, abandoning any in-progress
     `DrawFireLine` / `Helitack` interaction. (Mid-`PlaceSpark` + Restart isn't
     reachable via UI flow — Restart is disabled while Spark is enabled — but
     the reset applies unconditionally for symmetry with Reload and to close
     the phantom-click-handler gap noted in the now-removed Out-of-Scope
     bullet on `ui.interaction`.)
   - Reload's enabled state follows the same global rule: enabled iff
     `setupChanged === true` **or** at least one spark is placed. Since Restart
     preserves both `setupChanged` and the placed sparks, Reload is enabled after any
     Restart that follows a run.

7. **Reload pressed** (from any state):
   - Returns to Default. User-placed fire lines, user-placed sparks, and custom
     setup are all cleared. The preset is re-applied, which restores `sparks` to
     the preset's `config.sparks` (empty for curriculum presets; pre-placed for
     dev presets like `basic` — see the Preset caveat under Requirement 1). The
     `setupChanged` flag resets to false.
   - **`ui.interaction` is reset to `null`**, abandoning any in-progress
     `PlaceSpark` / `DrawFireLine` / `Helitack` interaction. Without this,
     a user who clicks Spark in `SetupChanged` (so Reload is enabled), then
     clicks Reload before placing the spark, would land in Default with
     `ui.interaction === Interaction.PlaceSpark` still set — which the new
     `sparkEnabled` getter (Requirement 3) reads as "already placing", leaving
     Spark disabled in Default and violating Requirement 1.

### Non-functional / scope requirements

- The state machine is encoded as `@computed` properties on existing MobX
  stores for the pure-simulation predicates (`setupEnabled`, `startEnabled`,
  `reloadEnabled`, `restartEnabled`, plus the `simulationEnded` and
  `setupChanged` building blocks), and as component-class getters on
  `BottomBar` for the three predicates that compose simulation state with
  `ui.interaction` (`sparkEnabled`, `fireLineEnabled`, `helitackEnabled`).
  No predicate is computed ad-hoc inline in the button JSX. See Technical
  Notes' "New `@computed` properties" for the per-button split rationale
  (the cross-store predicates live in the component to avoid coupling
  `SimulationModel` to the `ui` store).
- The `bottom-bar.test.tsx` Jest suite is updated so each rule above is asserted at
  least once. Specifically: existing tests that assert "Restart and Reload are always
  enabled" must be replaced.
- Cypress smoke flow and the Jest suite must pass under the new rules. No proactive
  rewrites to Cypress flows or Hazbot rulesets are required (see RESOLVED question
  "Should existing Cypress and Hazbot-ruleset tests be updated as part of this
  ticket, or in follow-ups?").
- The Reload predicate (`setupChanged || sparks.length > 0`) must have explicit
  edge-case tests beyond the seven-state matrix:
  - `setupChanged=true, sparks=0` → Reload enabled.
  - `setupChanged=false, sparks=1` → Reload enabled.
  - `setupChanged=false, sparks=0` → Reload disabled (Default-equivalent).
- The `setupChanged` lifecycle must have explicit tests:
  - `restart()` does NOT reset `setupChanged` (i.e. customizations survive Restart).
  - `reload()` DOES reset `setupChanged` to false.
- The `ui.interaction` reset on Reload / Restart (Requirements 6 and 7) must
  have explicit tests:
  - **Reload-during-PlaceSpark returns to Default with Spark enabled**:
    set `setupChanged=true` (so Reload is enabled), trigger Spark
    (`ui.interaction = Interaction.PlaceSpark`), click Reload → assert
    `ui.interaction === null` AND `sparkEnabled === true`. Regression guard
    for the contradiction that motivated Issue 1 in the external review.
  - **Restart-during-DrawFireLine returns to Restarted with interaction
    cleared**: start a run, trigger Fire Line
    (`ui.interaction = Interaction.DrawFireLine`), click Restart → assert
    `ui.interaction === null`. (Mid-`PlaceSpark` + Restart isn't reachable
    via UI flow per Requirement 6's note, so the test exercises the
    reachable `DrawFireLine` path.)
- **Drag-to-move spark survives Restart**: place spark, press Start, press
  Restart, then call `simulation.setSpark(idx, x, y)` with new coords →
  `sparks[idx]` reflects the new coords. Regression guard for the Req-6
  "placed sparks remain on the model and can be moved" promise. The drag UI
  itself isn't tested here — `setSpark` is the load-bearing call.
- The Fire Line / Helitack **authoring gate** must have explicit tests
  (regression guard: every other enumerated test runs with the gates open,
  so a code path that ignored the `config.*Available` flag would still pass):
  - Press Start with `config.fireLineAvailable=false` → in state 4 (Running),
    `fireLineEnabled === false` regardless of `canAddFireLineMarker` or
    `ui.interaction`.
  - Press Start with `config.helitackAvailable=false` → in state 4 (Running),
    `helitackEnabled === false` regardless of `canUseHelitack` or
    `ui.interaction`.
- The `simulationEnded` computed must have direct **value tests** in
  `simulation.test.ts` that cover each combination of underlying state.
  These guard the predicate's truth-table but **do not** by themselves
  guard the reactivity contract from Technical Notes — see the
  reactivity bullet immediately below:
  - Pre-start: `simulationStarted=false` → `simulationEnded === false`.
  - Running: `simulationStarted && simulationRunning` →
    `simulationEnded === false`.
  - Paused (user-Stop): `simulationStarted && !simulationRunning &&
    !engine?.fireDidStop` → `simulationEnded === false`.
  - Ended (fire finished): `simulationStarted && !simulationRunning &&
    engine?.fireDidStop` → `simulationEnded === true`.
  - After Restart: `simulationStarted=false`, `engine=null` →
    `simulationEnded === false` (covers the `engine?.` optional-chain
    branch).
- The `simulationEnded` **reactivity contract** must have at least one
  observer-level test (regression guard for the contract documented in
  Technical Notes — value-only tests above would pass under a future
  refactor that flipped `engine.fireDidStop` without also flipping
  `simulationRunning`, silently breaking UI re-renders on natural fire
  completion). Either form below satisfies the requirement:
  - **(option A) `reaction` test** in `simulation.test.ts`: subscribe to
    `simulationEnded` via `reaction(() => simulation.simulationEnded,
    callback)`; drive the supported `tick()` path that flips both
    `simulationRunning=false` and `engine.fireDidStop=true`
    ([simulation.ts:315-317](../../src/models/simulation.ts#L315-L317))
    — e.g. step the engine until `fireDidStop`, or invoke `tick()` with
    the engine in a finished state. Assert the `reaction` callback fired
    with the new value `true`. OR
  - **(option B) render-level `@observer` test** in
    `bottom-bar.test.tsx` or similar: mount a thin `@observer` component
    that reads `simulation.simulationEnded` (or any Ended-state-driven
    button predicate, e.g. `startEnabled` in state 5); advance the
    supported state path; assert the component re-rendered (e.g. via a
    render-count spy or by asserting the resulting DOM reflects the new
    value).

  Either form proves the reactivity edge is real, not just that the
  computed value happens to be correct at point-in-time read.
- The Paused vs. Ended distinction must have explicit tests (this is new behavior
  beyond the ticket's literal text — see RESOLVED question "After Stop is pressed
  mid-run..."):
  - Press Start → press Stop while engine has not finished → `startEnabled === true`,
    button label is "Start", Restart enabled, Setup/Spark disabled. Pressing Start
    again resumes from the same engine state.
  - Press Start → let fire finish (`engine.fireDidStop === true`) →
    `startEnabled === false`, button label is "Start", Restart enabled, Setup/Spark
    disabled, Fire Line / Helitack disabled.
  - Press Start → press Stop (Paused) → press Restart → assert Restarted-state
    rules: sparks preserved, `simulationStarted === false`, `engine === null`,
    Setup and Spark re-enabled, Restart disabled, Start enabled.
  - Press Start → press Stop (Paused) → press Reload → assert Default-state
    rules: `setupChanged === false`, **`sparks` match the preset's
    `config.sparks` (empty for curriculum presets, preplaced for dev presets
    like `basic`)**, Restart disabled, and Reload disabled (assuming the
    preset has empty `config.sparks`; for dev presets the lifecycle starts in
    state 3 per the Preset caveat under Requirement 1).
  - Press Start (Running, engine ticking) → press Reload → assert Default-state
    rules (including `reloadEnabled === false` post-Reload, assuming the
    preset has empty `config.sparks`) and that the engine has been torn
    down (`engine === null`, `simulationStarted === false`).
- The `setupChanged` snapshot-diff in `applyAndClose` must have explicit tests in
  `terrain-panel.test.tsx`:
  - **(a)** Open wizard, click Create with no field changes → `setupChanged` stays
    false.
  - **(b)** Open, change drought level for a zone, click Create → `setupChanged`
    becomes true. (This is the canary test for diff-before-mutate ordering:
    the diff must compare the wizard's local state against the open-time
    snapshot, not against the just-mutated `simulation.*` values. A
    broken post-mutate diff would produce false here and the test would
    fail.)
  - **(c)** Open, change drought, change it back to the snapshot value, click
    Create → `setupChanged` stays false (diff is empty).
  - **(d)** Open, change drought, close via X → `setupChanged` stays false
    (cancel path has no side effect).
  - **(e)** Start with `setupChanged === true`, open wizard, no field changes,
    click Create → `setupChanged` stays true (no auto-clear; locks in the
    "known wart" semantics described in the RESOLVED question "What counts as
    'Setup changed'?").
  - **(f)** Open, change `windSpeed`, click Create →
    `setupChanged` becomes true. Guards against the diff function silently
    dropping wind speed from the tracked-field set. Wind **direction**
    coverage lives in a unit test on the extracted `setupSnapshotDiffers`
    helper (synthetic-snapshot test), not the wizard-driven path —
    `WindDial` is a custom SVG with no `<input>` element, so
    `fireEvent.change` has nothing to target. See implementation.md's
    RESOLVED "Wind / zonesCount test ergonomics" block for the helper
    extraction and unit-test sketch.
  - **(g)** Open, change `zonesCount` (e.g., 2 → 3), click Create →
    `setupChanged` becomes true. Guards against the diff function silently
    dropping `zonesCount` from the tracked-field set.
  - **(h)** Snapshot refreshes on re-open: change drought 2 → 3, Create
    (`setupChanged` becomes true), then manually reset `setupChanged` to
    false, reopen the wizard, no field change, Create → `setupChanged`
    stays false. **Canary test for snapshot-refresh on re-open.** If the
    snapshot effect only captures on first mount (e.g., a broken
    implementation that guards with `if (openSnapshotRef.current === null)`),
    the second open's diff compares stale snapshot (drought=2) against
    live wizard state (drought=3) → non-empty diff → `setSetupChanged(true)`
    → test fails. With the correct implementation, the second open captures
    a fresh snapshot at drought=3 → diff is empty → `setupChanged` stays
    false. Cases (b) and (e) together don't catch this: (b) only proves
    first-open capture, (e) only proves the no-change Create is a no-op on
    the diff.

## Technical Notes

### New state to track

To express the spec we need one piece of new state, plus a deliberate
non-decision about a second:

1. **`setupChanged: boolean`** on `SimulationModel`. Set true by the wizard's
   `applyAndClose` ([terrain-panel.tsx:75](../../src/components/terrain-panel.tsx#L75))
   iff the user clicks Create and at least one of `zonesCount`, any zone's
   `terrainType` / `vegetation` / `droughtLevel`, `windSpeed`, or `windDirection`
   differs from a snapshot captured when the wizard opened. Reset to false by
   `reload()`. See RESOLVED question "What counts as 'Setup changed'?" for the full
   rationale. **Diff timing**: the snapshot must be captured at wizard-open and
   the diff computed *before* `applyAndClose` calls
   `simulation.setWindSpeed` / `setWindDirection` / `updateZones`. Computing
   the diff against `simulation.*` after the mutators run would always
   produce an empty diff (since the simulation now matches the local
   wizard state), silently disabling the entire Reload-on-customization
   feature. **Snapshot storage**: capture the open-time snapshot via
   `useRef` (not `useState`) — the snapshot is only read at Create time
   and should not trigger renders. Write it in a `useEffect` that runs
   when `ui.showTerrainUI` flips to `true` (opposite polarity from the
   existing close-time reset effect at
   [terrain-panel.tsx:58-68](../../src/components/terrain-panel.tsx#L58-L68)).
2. **No "used" state needed.** An earlier draft tracked "was Fire Line / Helitack
   used during the run" via the existing `lastFireLineTimestamp` /
   `lastHelitackTimestamp` observables, in order to conditionally disable those
   buttons post-run. The Self-Review collapsed Ended-state Fire Line / Helitack to
   "always disabled" (matching the Zeplin), so the used-state is no longer
   load-bearing for button state. The "was used" definition is retained as
   documentation in the RESOLVED question "What does 'Fire Line / Helitack was used'
   mean exactly?" but does not need to be exposed as a `@computed`.

3. **No new log events are needed for the button-state machine itself.** Each
   Create press emits a `TerrainPanelSettingsSaved` event
   ([terrain-panel.tsx:80](../../src/components/terrain-panel.tsx#L80)), so
   researchers and Hazbot rulesets can recover "user pressed Create N times" and
   the timing of those presses. The event currently carries no payload, so the
   per-edit *delta* (what specifically changed at each Create) isn't recoverable
   from the event log alone — only the *live final setup* at Start time is, via
   each `SimulationStarted` event's config snapshot
   ([bottom-bar.tsx:205-247](../../src/components/bottom-bar.tsx#L205-L247)) diffed
   against the preset defaults. Note that this recovers the live setup, **not the
   exact `setupChanged` flag**: under the snapshot-on-open wart (RESOLVED
   ["What counts as 'Setup changed'?"](#resolved-what-counts-as-setup-changed)),
   a user who customizes via Create and then reverts to preset defaults via Create
   ends with `setupChanged === true` but a live config that matches the preset, so
   an event-log diff would yield a false negative for that case. If the exact flag
   or per-edit deltas are needed for future research, the `TerrainPanelSettingsSaved`
   payload can be extended; doing so is out of scope here. Fire Line and Helitack usage are
   already logged with payloads by `FireLineAdded`
   ([use-draw-fire-line-interaction.tsx:45](../../src/components/view-3d/use-draw-fire-line-interaction.tsx#L45))
   and `Helitack`
   ([use-helitack-interaction.ts:18](../../src/components/view-3d/use-helitack-interaction.ts#L18)).
   Phase-2 reviewers should resist the instinct to add redundant logging for these
   signals — analytics / Hazbot rulesets can recover them from the existing event
   stream.

### New `@computed` properties (suggested shape)

- `setupChanged: boolean` (observable, set by the setup wizard).
- `simulationEnded: boolean` — true when `simulationStarted && !simulationRunning &&
  engine?.fireDidStop`. Distinguishes "Ended" (fire finished naturally) from
  "Running", "Paused" (user-Stop), and "Restarted". **Reactivity contract**:
  `engine` is not `@observable` and `FireEngine.fireDidStop` is a plain field
  on a non-MobX class, so the computed's reactivity is carried entirely by
  `simulationStarted` and `simulationRunning`. This works today because the
  same `tick()` call that flips `fireDidStop = true` also flips
  `simulationRunning = false` ([simulation.ts:315-317](../../src/models/simulation.ts#L315-L317)).
  Phase 2 implementers and future refactorers: **`engine?.fireDidStop` is a
  discriminator read only; do not rely on it driving reactivity directly.** A
  change that flipped `fireDidStop` without also flipping `simulationRunning`
  would silently break button state.
- Per-button enabled/disabled getters, split by which store(s) they read:
  - **On `SimulationModel` (pure `@computed` properties)**: `setupEnabled`,
    `startEnabled`, `reloadEnabled`, `restartEnabled`. These depend only on
    simulation-side state: the observables `simulationStarted`,
    `simulationRunning`, `setupChanged`, `sparks.length`, plus the
    `simulationEnded` `@computed` (which itself carries the
    `engine?.fireDidStop` discriminator subject to the reactivity contract
    above — these per-button computeds should read `simulationEnded`, not
    `engine?.fireDidStop` directly, so the contract is composed once
    rather than re-derived). JSX reads them as
    `disabled={!simulation.setupEnabled}` etc.
  - **On the `BottomBar` component (class getters reading both stores)**:
    `sparkEnabled`, `fireLineEnabled`, `helitackEnabled`. These compose a
    simulation-only predicate (e.g. `canAddSpark` + lifecycle, or
    `canAddFireLineMarker` + `config.fireLineAvailable` + lifecycle) with
    the `ui.interaction !== Interaction.X` guard. `ui.interaction` is owned
    by the `ui` store, not `SimulationModel`, so the final predicate lives
    in the component to avoid coupling `SimulationModel` to `ui`. This
    mirrors the existing pattern at
    [bottom-bar.tsx:62-77](../../src/components/bottom-bar.tsx#L62-L77).
    Phase 2 implementers may, if helpful, expose the simulation-only half
    as a separate `@computed` on `SimulationModel` (e.g.
    `simulation.sparkAvailable`) and have the component getter combine it
    with the `ui.interaction` guard — the spec doesn't mandate this
    factoring, only that the final per-button predicate is observable
    (i.e. read inside `render()` so `@observer` tracks both stores'
    observables).
- `reloadEnabled` is `setupChanged || sparks.length > 0` (per RESOLVED question
  "After a run ends, should Reload be enabled?").

### Files likely to change

- [src/components/bottom-bar.tsx](../../src/components/bottom-bar.tsx) — buttons
  read new computeds. The component-class getters at lines 62-77 stay as
  the home for the three `ui.interaction`-gated predicates (`sparkEnabled`,
  `fireLineEnabled`, `helitackEnabled`); they are rewritten to compose the
  new simulation-side predicates with the `ui.interaction !== Interaction.X`
  guard. The four pure-simulation predicates (`setupEnabled`, `startEnabled`,
  `reloadEnabled`, `restartEnabled`) are read directly from `simulation.*`
  in `render()`. The `handleReload` and `handleRestart` methods in
  [bottom-bar.tsx](../../src/components/bottom-bar.tsx)
  additionally set `ui.interaction = null` to abandon any in-progress
  interaction (Requirements 6 and 7). The reset lives in the handlers, not
  in `simulation.reload()` / `simulation.restart()`, because `SimulationModel`
  does not own the `ui` store.
- [src/models/simulation.ts](../../src/models/simulation.ts) — add the new
  observables / computeds. `reload()` resets `setupChanged` to false (full
  return-to-Default); `restart()` must preserve `setupChanged` (Requirement 6,
  customizations survive Restart, locked in by the `setupChanged` lifecycle
  tests in the Non-functional / scope requirements section: "`restart()` does
  NOT reset `setupChanged`" and "`reload()` DOES reset `setupChanged` to
  false"). Run/engine state (`simulationStarted`,
  `simulationRunning`, `engine`, fire line state, timestamps) continues to
  reset on both methods as today.
- The setup wizard ([src/components/terrain-panel.tsx](../../src/components/terrain-panel.tsx))
  — `setSetupChanged(true)` is called **only** from `applyAndClose` (the Create
  button handler at [terrain-panel.tsx:75-81](../../src/components/terrain-panel.tsx#L75-L81)),
  and only when the diff between the wizard-open snapshot and the local
  wizard state is non-empty for any of `zonesCount`, per-zone `terrainType` /
  `vegetation` / `droughtLevel`, `windSpeed`, or `windDirection`. Do **not**
  call `setSetupChanged(true)` from individual slider / dropdown / zone-edit
  handlers — those handlers mutate local React state only, and the diff
  happens at Create time. See Technical Notes' "Diff timing" and "Snapshot
  storage" clauses on the `setupChanged` bullet for the snapshot-capture
  polarity (open-time, in a `useRef`, before `applyAndClose` mutates
  `simulation.*`).
- [src/components/bottom-bar.test.tsx](../../src/components/bottom-bar.test.tsx) —
  rewrite to cover all seven lifecycle states from the Requirements section (1–7).
  When the test fixture uses a preset with empty `config.sparks` (the
  curriculum-facing case), state 7 (AfterReload) is identical to state 1
  (Default), so the corresponding assertions can be reused. Tests that exercise
  dev presets with pre-placed sparks (`basic`, `basicWithWind`, etc.) must
  apply the SparkPlaced-style assertions for state 7 instead (see the State 7
  preset caveat under the Visual Specifications matrix): **Reload** and
  **Start** enabled, **Restart** disabled, **Setup** and **Spark** enabled.
- [src/models/simulation.test.ts](../../src/models/simulation.test.ts) — add
  coverage for the new simulation-side observables and computeds:
  `setupChanged` lifecycle (`restart()` preserves, `reload()` resets),
  `simulationEnded` value tests (five-state truth table) and reactivity
  contract, plus the `reloadEnabled` Reload-predicate edge cases. The
  per-button `setupEnabled` / `startEnabled` / `restartEnabled` computeds
  are exercised transitively by the seven-state matrix in
  `bottom-bar.test.tsx`; direct unit coverage here is optional unless a
  predicate has a non-trivial gate (e.g. `reloadEnabled`'s OR of
  `setupChanged` and `sparks.length > 0`).
- [src/components/log-events.test.tsx](../../src/components/log-events.test.tsx)
  — fixture update for one test. "fires with reason 'SimulationReloaded'
  before reload" at [log-events.test.tsx:57-76](../../src/components/log-events.test.tsx#L57-L76)
  currently sets `simulationStarted = true` only, but under the new
  `reloadEnabled = setupChanged || sparks.length > 0` rule, Reload is
  **disabled** in that state and `userEvent.click(...)` would no-op
  against the disabled button (causing the test to fail at the
  `endedIdx >= 0` and `reason === "SimulationReloaded"` assertions). Add
  `stores.simulation.sparks.push(new Vector2(50000, 50000))` (mirroring the
  existing pattern in the test-4 fixture at
  [log-events.test.tsx:102](../../src/components/log-events.test.tsx#L102))
  before the click to enable Reload. The other three tests in this file
  are unaffected: test 1 (Restart at lines 27-55) — `simulationStarted`
  puts the sim in Running/Paused so Restart is enabled; test 3 (TopBar
  reload at lines 78-96) — uses a different button outside the bottom-bar
  state machine; test 4 (Stop at lines 98-120) — already sets a spark.

### Visual specs

Zeplin artboard:
[6a10421e976294081e161cae](https://app.zeplin.io/project/5fe47ae231d1f6a428c53450/screen/6a10421e976294081e161cae)
("WM-24 Hazbot: Wildfire model controls states"). Depicts each of the 7 lifecycle
states with the corresponding bottom-bar controls. Disabled state = text + icon at
`opacity: 0.35`, background at full opacity, 9px border-radius. The current
[icon-button.scss:35](../../src/components/icon-button.scss#L35) uses
`opacity: 0.5` on the whole button — this needs to change to `0.35` on the inner
content (text/icon) only. See RESOLVED question "Visual specifications for disabled /
enabled / hover states" for the full per-button matrix.

**Cross-component impact**: the IconButton CSS change applies to **every** disabled
IconButton in the project, not just the new Reload / Restart disabled states.
Existing IconButton consumers — Setup, Spark, Fire Line, Helitack — will also adopt
the new 0.35 disabled treatment. This is intentional (Zeplin shows them at 0.35
too), but reviewers should look at all of those buttons' disabled appearance in the
implementation PR, not just Reload / Restart.

**Accessibility note**: 0.35 is a 65% fade — disabled icons sit close to the edge
of perceptual contrast against a near-white background. This value is a deliberate
designer choice from the Zeplin artboard, not our judgment. The implementation PR
should include a sighted-user check (and ideally a screenshot in the PR
description) that the disabled icons remain visible enough to indicate the button
exists. WCAG 1.4.11 technically exempts disabled controls from the 3:1 contrast
floor, so the choice is not non-compliant — it's a usability check, not a gating
issue. **If the rendered check looks insufficient, flag the designer
(Michael Tirenin) before merging — do not silently raise the opacity, since 0.35
is the designer's explicit choice.**

## Out of Scope

- Visual redesign of the buttons themselves (icons, colors, layout). Only the
  enabled / disabled rules change.
- The Hazbot button and the Fullscreen toggle (always enabled per the ticket).
- The top bar, About dialog, and the help-overlay system itself (AP-80 is the parent
  epic but is not implemented here).
- The setup wizard's internal flow — only the side-effect of "user changed something
  in setup" is in scope.
- **Renaming "Stop" to "Pause"** — the designer noted that the button semantically
  *is* a Pause and the label is wrong, but deferred the rename to a future sprint
  (see RESOLVED question "After Stop is pressed mid-run..."). **No follow-up Jira
  ticket has been filed for the rename as of this spec.**
- **Screen-reader and keyboard-only perception of disabled buttons.** MUI's
  `disabled` prop sets the native HTML `disabled` attribute, which (a) is exposed
  to assistive tech as an unavailable/disabled control via the platform
  accessibility tree (a separate mechanism from `aria-disabled="true"`, which is
  not synthesized from native `disabled`) AND (b) **removes the button from
  the tab order entirely**. So a keyboard or screen-reader user can't Tab to a
  disabled control to discover its existence, and transitions between
  enabled/disabled aren't announced without an ARIA live region or comparable
  mechanism. The state machine teaches the workflow by making buttons appear /
  disappear, and sighted users perceive that change visually — assistive-tech
  users currently do not. A future a11y pass might switch to `aria-disabled` with
  per-button click guards to keep the controls focusable while still preventing
  activation; designing that mitigation is its own pass and is deferred to a
  future ticket.
- **Tooltip / hint on disabled buttons.** Disabled controls show only the
  visual fade; they do not surface a "why is this unavailable?" tooltip on hover
  or focus. This is intentional: the parent epic AP-80 (Hazbot help-overlay) is
  the system that explains *why* a control is unavailable at any given moment.
  This ticket provides the visual state machine that Hazbot rulesets reference;
  the per-control explanations themselves are Hazbot's responsibility, not the
  bottom bar's.
- **Focus re-targeting when a focused button becomes disabled mid-action.** If a
  focused control transitions to disabled (e.g. via the post-Start Setup/Spark
  disable), the browser moves focus to `document.body` per default behavior.
  Custom focus management (e.g. moving focus to the next still-enabled control
  in the bar) is not implemented here. The trigger paths are narrow in this UI —
  most state transitions are triggered by the same button that gets disabled,
  so the user's focus is on a button that *stays* present (just relabeled, like
  Start → Stop) rather than on one that vanishes — so the disorientation risk
  is low. Explicitly deferred.

## Open Questions

### RESOLVED: What counts as "Setup changed"?

**Context**: Requirement 2 says "If Setup is changed: Reload is enabled". We need a
crisp definition of "changed".

**Code investigation findings**:
- The setup wizard ([terrain-panel.tsx](../../src/components/terrain-panel.tsx)) holds
  all in-progress edits in local React state. The only place those edits flow into
  `SimulationModel` is `applyAndClose` (the **Create** button) at
  [terrain-panel.tsx:75-81](../../src/components/terrain-panel.tsx#L75-L81).
- `handleClose` (the **X** button) only flips `ui.showTerrainUI` and discards the
  local state via the reset `useEffect` at
  [terrain-panel.tsx:58-68](../../src/components/terrain-panel.tsx#L58-L68). Cancelling
  the wizard has no side effect on `simulation`.
- Wind is wizard-only. The `WindDial` rendered on the main canvas
  ([simulation-info.tsx](../../src/components/simulation-info.tsx)) is read-only;
  `simulation.setWindSpeed` / `setWindDirection` are only called from the wizard.

**Decision**: **Snapshot-on-open, diff-on-Create.** Setup is considered changed iff
the user clicks **Create** on the wizard *and* at least one of these values differs
from the values captured when the wizard opened:
- `zonesCount`
- For each zone: `terrainType`, `vegetation`, `droughtLevel`
- `windSpeed`
- `windDirection`

Cancelling the wizard with X (or navigating away without Create) is a no-op for the
`setupChanged` flag. `reload()` resets `setupChanged` back to false.

**Known edge case** (acceptable wart): the rule fires on diff-against-snapshot, not
diff-against-preset. If a user customizes via Create (`setupChanged=true`), then
re-opens the wizard and *manually reverts* every value to the preset defaults via
Create, the diff against the snapshot is non-empty (they edited values) so
`setupChanged` stays true — even though the live sim now matches the preset. Reload
remains "enabled" with conceptually nothing to do; clicking it is a harmless no-op
(reload to a state that already matches). Fixing this would require maintaining a
preset baseline and diffing against it, which is more expensive and not worth the
complexity for a user-driven multi-step edge case.

---

### RESOLVED: After Restart, should Reload be enabled?

**Context**: Requirement 6 lists what Restart does but is silent on Reload's state.
After Restart we are back to a pre-run state, but the user's setup customizations
(drought, wind, etc.) and placed sparks are preserved.

**Code investigation findings**:
- `restart()` at [simulation.ts:242-266](../../src/models/simulation.ts#L242-L266)
  clears fire/cells/fireline state and resets timestamps but **leaves `zones`,
  `wind`, and the wizard's customizations intact**. (The `userDefinedWind` block
  there is unrelated — it handles presets that auto-change wind mid-run via
  `changeWindOnDay`.)
- Only `reload()` re-applies `config` via `setInputParamsFromConfig()`, which is
  what wipes wizard customizations back to preset defaults.

So after Restart, any customizations the user committed via Create are still live in
`simulation`. The `setupChanged` flag (set by Create when wizard values diverge from
the wizard-open snapshot — see RESOLVED ["What counts as 'Setup changed'?"](#resolved-what-counts-as-setup-changed))
continues to reflect "the user has committed wizard edits in this session," which
remains true after Restart, and Reload should follow it.

**Decision**: **A — Reload follows the global rule everywhere, including
post-Restart.** `restart()` does **not** reset `setupChanged`. Only `reload()` resets
it. Combined with the broadened Reload predicate from RESOLVED ["After a run ends,
should Reload be enabled?"](#resolved-after-a-run-ends-should-reload-be-enabled)
(`setupChanged || sparks.length > 0`), this means: any Restart that follows a run
leaves Reload **enabled**, because Restart preserves the placed sparks even when no
setup customizations were made. The only post-Restart state where Reload would be
disabled is the (UI-unreachable) case of Restart firing from a state with zero sparks
and `setupChanged === false` — Restart itself is only enabled once a run has been
started, and a run requires at least one spark.

---

### RESOLVED: After a run ends, should Reload be enabled?

**Context**: Requirement 5 lists what happens after a run but does not say whether
Reload is enabled.

**Code investigation findings**:
- `restart()` preserves placed sparks
  ([simulation.ts:242-266](../../src/models/simulation.ts#L242-L266)).
- `reload()` calls `restart()` and then `setInputParamsFromConfig()`
  ([simulation.ts:140-156](../../src/models/simulation.ts#L140-L156)), which clears
  `sparks` and re-adds the preset's `config.sparks`. Most presets have an empty
  `config.sparks`, so Reload effectively wipes placed sparks.
- This means Reload has a real effect even when `setupChanged === false`: it clears
  placed sparks (Restart keeps them).

**Decision**: **C — broaden the global Reload rule.** Reload is enabled iff
`setupChanged === true` **OR** at least one spark has been placed. This collapses
the post-run question into the same rule used everywhere else: Default has no
customizations and no sparks → Reload off; once anything material has happened (Create
with changes, or a spark placed), Reload turns on and stays on until pressed. No
special-case for the Ended state.

This refines the rule promised by RESOLVED question "What counts as 'Setup changed'?":
`setupChanged` itself is still wizard-only, but the **Reload-enabled predicate** is
`setupChanged || sparks.length > 0`.

---

### RESOLVED: What does "Fire Line / Helitack was used" mean exactly?

**Context**: Requirement 5 says "If Fire Line and Helitack were enabled and not used,
they are disabled" after the run ends. We need a precise definition of "used".

**Code investigation findings**:
- `lastFireLineTimestamp` is initialized to `-Infinity`
  ([simulation.ts:55](../../src/models/simulation.ts#L55)) and set to `this.time`
  only inside `buildFireLine()`
  ([simulation.ts:513](../../src/models/simulation.ts#L513)), which is called from
  `applyFireLineMarkers()`
  ([simulation.ts:488-501](../../src/models/simulation.ts#L488-L501)) at the start
  of every run. `applyFireLineMarkers` processes markers in pairs (`i += 2`, only
  if `i+1` exists), so a lone uncommitted marker is silently ignored.
- `lastHelitackTimestamp` is initialized to `-Infinity`
  ([simulation.ts:56](../../src/models/simulation.ts#L56)) and set to `this.time`
  only inside `setHelitackPoint()`
  ([simulation.ts:535](../../src/models/simulation.ts#L535)).
- Both timestamps are reset to `-Infinity` by `restart()`
  ([simulation.ts:247-248](../../src/models/simulation.ts#L247-L248)).

In the Ended state (post-run, pre-Restart), both timestamps are still readable.

**Decision**: **A' — refined A.** Use the existing timestamps; no new observables
needed.
- "Fire Line was used" = `lastFireLineTimestamp !== -Infinity` (at least one fully
  committed fire line was applied this run).
- "Helitack was used" = `lastHelitackTimestamp !== -Infinity` (at least one drop
  landed this run).

Implications:
- A lone, uncommitted fire-line marker does **not** count as used.
- Clicking the Fire Line or Helitack button but never placing anything does **not**
  count as used.

---

### RESOLVED: After Stop is pressed mid-run, do the same end-state rules apply as when fire stops naturally?

**Context**: Requirement 5 is labeled "After run" but doesn't distinguish user-pressed
Stop from engine-detected `fireDidStop`. They are arguably different: a user-paused
sim might want Start to remain enabled (resume), while a fire-finished sim probably
should not.

**Code investigation findings**:
- `simulation.stop()`
  ([simulation.ts:238-240](../../src/models/simulation.ts#L238-L240)) only flips
  `simulationRunning = false`; it does **not** touch `engine`. So the engine state
  is preserved.
- `simulation.start()` is reentrant — if `engine` already exists, it reuses it
  ([simulation.ts:226-228](../../src/models/simulation.ts#L226-L228)). So
  re-pressing Start after Stop genuinely resumes from the same engine state.
- The Fire Line button workflow depends on this. `handleFireLine`
  ([bottom-bar.tsx:282-294](../../src/components/bottom-bar.tsx#L282-L294)) calls
  `simulation.stop()` to pause the sim so the user can draw markers; the user then
  clicks Start to resume, which calls `start()` → `applyFireLineMarkers()`
  ([simulation.ts:230](../../src/models/simulation.ts#L230)) → fire line is built,
  sim resumes from the same engine state.
- Helitack does **not** pause the sim — `handleHelitack`
  ([bottom-bar.tsx:296-301](../../src/components/bottom-bar.tsx#L296-L301)) just
  flips `ui.interaction = Interaction.Helitack`. So the fire keeps spreading while
  the user picks a drop point.
- `app.tsx`'s `SimulationEnded`-by-itself log
  ([app.tsx:56-74](../../src/components/app.tsx#L56-L74)) is already gated on
  `prev.running && !running && fireDidStop`, so the codebase already distinguishes
  user-Stop from fire-finished in at least one place.

**Other `simulationRunning` readers** (relevant to any refactor):
- [bottom-bar.tsx:148](../../src/components/bottom-bar.tsx#L148) — Start/Stop button
  label.
- [bottom-bar.tsx:197](../../src/components/bottom-bar.tsx#L197) — `handleStart`
  branches on it.
- [bottom-bar.tsx:285](../../src/components/bottom-bar.tsx#L285) —
  `handleFireLine` reads it (for logging).
- [simulation.ts:276](../../src/models/simulation.ts#L276) — `rafCallback`
  early-returns on `!simulationRunning`. **This is the engine-pause mechanism.**
- [graph.tsx:184](../../src/components/graph.tsx#L184) — `isPlaying` passed to the
  acres-burned chart.
- `log-events.test.tsx` — tests directly assign `simulationRunning` to simulate state
  transitions.

**Options considered**:

- **A) Stop is a pause; `fireDidStop` is terminal.** "Ended" =
  `simulationStarted && !simulationRunning && engine?.fireDidStop`. User-pressed Stop
  produces a "Paused" sub-state where Start re-enables to resume. The ticket's
  "After run" rules fire only when fire actually finishes. Preserves the current Fire
  Line workflow exactly. **Lowest blast radius.** Deviates from strict ticket reading
  on one bullet ("Start is disabled" after user-Stop).

- **B) Stop is terminal; refactor Fire Line pause out of `stop()`.** Implements every
  ticket bullet literally. Required code changes:
  1. **Add a new pause mechanism** in `simulation.ts` — e.g. a `pausedForUI: boolean`
     observable, or a check on `ui.interaction === Interaction.DrawFireLine`. The
     `rafCallback` guard at [simulation.ts:276](../../src/models/simulation.ts#L276)
     becomes `if (!this.simulationRunning || this.pausedForUI) return;`.
  2. **Move `applyFireLineMarkers()`** off the `start()` call site
     ([simulation.ts:230](../../src/models/simulation.ts#L230)) — markers should be
     committed when the interaction *completes* (in
     [use-draw-fire-line-interaction.tsx:40](../../src/components/view-3d/use-draw-fire-line-interaction.tsx#L40),
     where `ui.interaction = null`), not when the user next presses Start.
  3. **Rewrite `handleFireLine`** at
     [bottom-bar.tsx:282-294](../../src/components/bottom-bar.tsx#L282-L294) so it
     pauses via the new mechanism instead of `simulation.stop()`. No more
     `wasRunning` branch.
  4. **Decide chart behavior** in
     [graph.tsx:184](../../src/components/graph.tsx#L184) — should the chart show
     "playing" while paused for a fire-line draw? Probably yes (the model is paused
     but conceptually mid-run), so pass `simulationRunning || pausedForUI` to
     `isPlaying`.
  5. **Update tests**: `bottom-bar.test.tsx`, `log-events.test.tsx`,
     `simulation.test.ts`. Most are straightforward; the `log-events` tests that poke
     `simulationRunning` directly need a careful pass.
  6. **Cypress**: any flow that clicks Start after Stop expecting a resume needs
     updating.

  Blast radius: ~4-5 source files plus tests. Moderate. The trickiest piece is #2
  — moving the commit timing for fire-line markers. Currently they're applied on the
  next `start()`; under B, they'd be applied as soon as drawing completes.

- **C) Remove the Stop affordance entirely**, so the only way out of "Running" is to
  let the fire finish or to Restart / Reload. The button while running shows "Stop"
  but is disabled (or hidden). Removes the ambiguity at the cost of removing a
  useful affordance.

**Designer message draft** (copy-paste into the Jira comment):

> Hey — quick question on requirement 5 ("After run: Stop becomes Start and Start is
> disabled..."). The current code treats the Stop button as a pause: pressing Stop
> halts the model but keeps engine state, and pressing Start again resumes from where
> it left off. This is also how the Fire Line button works internally — it pauses the
> sim so you can draw markers, then resumes when you press Start.
>
> Reading the ticket literally, "After run: Start is disabled" would mean that
> pressing Stop ends the run (no resume) — the user would have to Restart / Reload to
> get the model moving again. That's implementable but means we also need a separate
> "pause-for-drawing" mechanism for Fire Line so the Fire Line workflow doesn't end
> the run.
>
> Two clarifications would help:
>
> 1. **Is "After run" meant to cover user-pressed Stop too, or only fire-finished-naturally?**
>    - If only fire-finished, we keep Stop as a pause (low-risk change).
>    - If both, we treat Stop as terminal and need to refactor the Fire Line pause
>      mechanism (moderate refactor).
>
> 2. **If Stop is terminal, do you still want a Stop affordance during a run?**
>    Or should the only ways out of "Running" be: let it finish, Restart, or Reload?

**Decision**: **A — Stop is a pause; only fire-finished-naturally is terminal.**

Confirmed by the ticket designer (Michael Tirenin) in chat:

> Q1: Is "After run" meant to cover user-pressed Stop too, or only fire-finished-naturally?
>
> A: Only for fire finished naturally; currently, when the fire finishes, it returns
> to Start already, I'm just saying it should also be disabled at that point. (In
> general, it seems like buttons were available when they shouldn't have been (like
> Reload and Restart were available even before anything was done or changed), so I
> was just trying to make these controls make sense for the user, rather than
> possibly frustrating/confusing.)
>
> Q2: If Stop is terminal, do you still want a Stop affordance during a run?
>
> A: Stop isn't terminal — it should be available during a run. Also, it should
> really be Pause, but I can't recall why Stop was chosen at the time. Maybe
> something we can discuss/change in a future sprint.

Implications:
- "Ended" state = `simulationStarted && !simulationRunning && engine?.fireDidStop`.
  Only fire-finished triggers the Ended-state rules (Start disabled, etc.).
- User-pressed Stop produces a "Paused" sub-state: Start re-enables to resume. All
  other Running-state rules continue to apply (Restart enabled, Setup/Spark disabled,
  Fire Line / Helitack remain enabled per authoring).
- No refactor of `simulation.stop()` or the Fire Line pause mechanism is needed.
- Renaming the button from "Stop" to "Pause" is **out of scope** for this ticket
  (deferred to a future sprint per the designer).
- **Paused vs. Ended visual similarity (known UX tax until rename ships).** Both
  sub-states show the label "Start" on the Start/Stop button. The only visual
  differentiator is that Start is **enabled** in Paused (it can resume the engine)
  and **disabled** in Ended (the fire has finished). After the future "Stop" →
  "Pause" rename, the distinction will be carried by the button label as well.
  Hazbot rulesets can key off the new `simulationEnded` computed if a richer
  learner-facing explanation of "the run is over, not paused" is needed; this spec
  does not introduce a tooltip-based fallback (per the Out of Scope bullet on
  disabled-button tooltips).

---

### RESOLVED: Visual specifications for disabled / enabled / hover states

**Context**: The ticket links to a Zeplin artboard for this feature.

**Zeplin investigation findings**: The correct artboard URL is
`https://app.zeplin.io/project/5fe47ae231d1f6a428c53450/screen/6a10421e976294081e161cae`
("WM-24 Hazbot: Wildfire model controls states"). It depicts each of the 7 lifecycle
states from the ticket as a separate visual, with the bottom-bar controls drawn for
each. Cross-referencing the per-button content-opacity values against our resolved
state-machine rules:

| State | Setup | Spark | Reload | Restart | Start/Stop | Fire Line | Helitack |
|---|---|---|---|---|---|---|---|
| 1 Default | E | E | D | D | D (Start) | D | D |
| 2 SetupChanged | E | E | **E** | D | D (Start) | D | D |
| 3 SparkPlaced | E | E | E | D | **E** (Start) | D | D |
| 4 Running | D | D | E | E | E (Stop) | E | E |
| 5 Ended | D | D | E | E | D (Start) | D | D |
| 6 Restarted | E | E | E | D | E (Start) | D | D |
| 7 AfterReload | E | E | D | D | D (Start) | D | D |

(E = enabled, D = disabled.) **Every cell matches our resolved rules exactly**,
including the option-C broadening of Reload (sparks-placed enables Reload in states
3, 4, 5, 6).

**Conditional cells (Spark, Fire Line, Helitack)**: The `E` values for these three
buttons collapse the per-button predicates from Requirements 3-4 into a single
glyph. Tests and implementation derived from the matrix must apply the predicates,
not just the cell value:
- **Spark `E`** (states 3, 6) assumes `remainingSparks > 0` AND
  `ui.interaction !== Interaction.PlaceSpark`. If the user has exhausted the
  per-zone spark budget the cell is effectively `D`.
- **Fire Line `E`** (state 4) assumes `config.fireLineAvailable === true` AND
  `canAddFireLineMarker` (cooldown elapsed, fewer than 2 markers committed,
  [simulation.ts:109-117](../../src/models/simulation.ts#L109-L117)) AND
  `ui.interaction !== Interaction.DrawFireLine`. With `fireLineAvailable=false`
  the cell is `D` regardless of lifecycle state.
- **Helitack `E`** (state 4) assumes `config.helitackAvailable === true` AND
  `canUseHelitack` (cooldown elapsed,
  [simulation.ts:119-127](../../src/models/simulation.ts#L119-L127)) AND
  `ui.interaction !== Interaction.Helitack`. With `helitackAvailable=false`
  the cell is `D` regardless of lifecycle state.

The unconditional cells (Setup, Reload, Restart, Start/Stop label-and-enabled)
are exact for states 1-6: those depend only on lifecycle observables and have no
per-button predicates to compose.

**State 7 (AfterReload) preset caveat**: The state 7 row assumes the preset's
`config.sparks` is empty (the case for all curriculum-facing presets like
`plainsTwoZone`, `mountainsandplainsTwoZone`, `hillTwoZone`, `hillThreeZone`).
For dev/test presets that ship with pre-placed sparks (`basic`, `basicWithWind`,
`slope45deg`, `basicWithSlopeAndWind`; see Requirement 1's Preset caveat),
Reload restores those sparks, so AfterReload lands in SparkPlaced-style state:
**Reload** is enabled (via the `sparks.length > 0` half of
`reloadEnabled = setupChanged || sparks.length > 0`) and **Start** is enabled
(same predicate that fires in state 3, subject to `remainingSparks` and the
`Interaction.PlaceSpark` guard from Requirement 3). Setup, Restart, Fire Line,
and Helitack cells remain as the state 7 row shows. Implementers and test
writers must not assert "AfterReload is always Default" — assertions for
state 7 must either fix the preset to one with empty `config.sparks` or
branch on `sparks.length`.

**Decision**:
- **Disabled visual treatment**: text label and icon at `opacity: 0.35`. Button
  background stays at full opacity. (The existing
  [icon-button.scss:35](../../src/components/icon-button.scss#L35) uses
  `opacity: 0.5` on the whole button — needs to change to `0.35` on the inner
  content only.)
- **Background**: white (`#FFFFFF`), 9px border-radius (matches current).
- **No focus / hover variants** are depicted in the artboard — keep the browser /
  MUI defaults unless the designer asks otherwise.
- **No designer annotations** in the artboard.

---

### RESOLVED: Should existing Cypress and Hazbot-ruleset tests be updated as part of this ticket, or in follow-ups?

**Context**: Tightening enable/disable rules might break tests that interact with the
bottom bar.

**Code investigation findings**:

*Cypress*: All bottom-bar clicks go through
[cypress/support/elements/BottomBar.js](../../cypress/support/elements/BottomBar.js).
Audited usage in `smoke.cy.ts` (the only flow that exercises the run lifecycle).
**Test isolation note**: `smoke.cy.ts` has a `beforeEach` at
[smoke.cy.ts:11-14](../../cypress/e2e/smoke.cy.ts#L11-L14) running
`cy.visit("/?zonesCount=3")` before every `it`. Cypress v12 doesn't preserve
state between `it` blocks, so each test starts from a freshly-loaded page.
This matters because the Restart click is in a separate `it`
([smoke.cy.ts:109-112](../../cypress/e2e/smoke.cy.ts#L109-L112)) from the
spark / start sequence at lines 96-108 — so Restart fires in **Default**, not
in Running.

| Line | `it` block | Action | Pre-state | Under new rules |
|---|---|---|---|---|
| 25 / terrain | "terrain setup smoke test" | `getTerrainSetupButton().click()` | Default | ✓ Setup enabled in Default |
| 97-99 | "adds sparks to graph..." | `getSparkButton().click({ force: true })` ×2 | Default (after `cy.visit`) | ✓ Spark enabled in Default |
| 101 | "adds sparks..." | `getStartButton().should("contain", "Start")` | SparkPlaced | ✓ Label correct after spark placed |
| 105 | "adds sparks..." | `getStartButton().click({ force: true })` | SparkPlaced | ✓ Start enabled after spark placed |
| 106 | "adds sparks..." | `getStartButton().should("contain", "Stop")` | Running | ✓ Label flips on Running |
| 110 | **"restarts mode"** (separate `it`) | `getRestartButton().click({ force: true })` | **Default** (fresh `cy.visit`) | ⚠ Restart **disabled** in Default; forced click still fires `handleRestart`, which is a no-op against already-default state (see below) |
| 111 | "restarts mode" | `getStartButton().should("contain", "Start")` | Default | ✓ Label is "Start" in Default (independently of the no-op handler call above) |
| 112 | "restarts mode" | `getModelTimeProgress().should("contain", "0 hours")` | Default | ✓ Model time is 0 in fresh Default |

**Behavior under the new rules**: The line-110 click hits a `<button disabled>`.
Cypress's `{ force: true }` bypasses actionability checks **and fires the
click event directly via Cypress's event emitter**, so the handler runs even
though the button is disabled (see
[Cypress click docs](https://docs.cypress.io/api/commands/click) and
[Forcing events](https://docs.cypress.io/app/core-concepts/interacting-with-elements#Forcing)).
However, `handleRestart` ([bottom-bar.tsx](../../src/components/bottom-bar.tsx),
`handleRestart` method) executes harmlessly here: `simulationStarted` is
false in Default, so the logging branch is skipped; `chartStore.reset()` is
a no-op on an empty store; `simulation.restart()`
([simulation.ts:242-266](../../src/models/simulation.ts#L242-L266)) clears
sparks/markers (already empty), resets observables (already at defaults),
and nulls the engine (already null). The only side effect is one
`SimulationRestarted` log entry against a Default-state simulation. The
line-111 / line-112 assertions still pass because they describe the
unchanged Default state (Start label is "Start" in Default; model time is 0
in fresh Default). **The suite stays green**, but the Restart assertion in
the "restarts mode" `it` is **vestigial regardless**: it no longer
exercises a state transition, and the post-conditions it asserts are
already true before the click.

`terrairn-setup.cy.ts` only opens / closes the Setup wizard, not affected. No
existing test clicks Reload, so no Reload-from-Default test breaks.

**Phase-2 follow-up note**: Restoring meaningful Restart coverage in
`smoke.cy.ts` requires either (a) moving the Restart click into the same
`it` as the spark / start sequence so it fires in Running, or (b) adding
state-seeding to the "restarts mode" test. Either is out of scope for this
ticket per the broader Cypress-rewrites scope decision below; flagged
here so a future Cypress-pass ticket has the diagnosis ready.

*Hazbot rulesets*: All references to `SimulationStarted`, `SimulationStopped`,
`SimulationRestarted`, `SimulationReloaded`, `SimulationEnded` are
**event-log consumers** (`logEvents: [...]` arrays). They don't probe button state;
they react to logged events. Those events still fire from the same `handle*`
methods under the new rules — only the buttons' `disabled` predicates change.
No ruleset is affected.

**Decision**: **B with caveat — out of scope, but verify the existing suites pass
without changes.** No proactive Cypress or Hazbot-ruleset rewrites are needed. The
implementation PR runs the full Cypress smoke flow and Jest test suite as part of
CI; any breakage gets handled in the PR. Adding new Cypress coverage specifically
for the new disabled-state transitions is a follow-up ticket if desired (Jest
coverage in `bottom-bar.test.tsx` is sufficient for verifying the state machine —
see the test-coverage requirement in the main Requirements section).

---

## Self-Review

### Senior Engineer

#### RESOLVED: Non-functional requirements contradict the resolved Cypress/Hazbot scope

Lines 147-150 still say "Existing Cypress tests... reviewed and updated where they
incidentally depend on the old behavior (See OPEN question)" and "Hazbot rulesets...
reviewed for assumptions about button-state. (See OPEN question)". That OPEN question
is now RESOLVED as **out of scope** — no proactive Cypress / Hazbot rewrites needed,
just CI verification. The two bullets in the Requirements section are stale and
contradict the resolution. Should be removed or rewritten to match.

#### RESOLVED: Req 5 keeps used Fire Line / Helitack enabled post-run, but clicking them does nothing

Requirement 5 says "If Fire Line was enabled during the run but **never used**, it is
now disabled. If it was used, it stays enabled (though clicking it has no useful
effect once the run is over)." Same for Helitack. This is a literal reading of the
ticket, but it leaves a button enabled whose click goes nowhere — clicking Fire Line
in Ended would call `simulation.stop()` (no-op, already stopped) and enter
`Interaction.DrawFireLine`, but markers would never apply because Start is disabled.
UX smell. Two options: (1) disable Fire Line / Helitack in Ended regardless of
used-state (cleaner; very small deviation from the ticket); (2) keep as written and
let them appear "enabled but dead" if used.

#### RESOLVED: Fire Line cooldown during Paused sub-state not explicit

The existing `canAddFireLineMarker` predicate
([simulation.ts:109-117](../../src/models/simulation.ts#L109-L117)) gates Fire Line
on a cooldown (`time - lastFireLineTimestamp > fireLineDelay`) and a 2-marker
capacity. Requirement 4 just says "Fire Line is enabled iff authored". It implicitly
inherits the cooldown / capacity from the existing predicate, but should say so
explicitly to avoid a Phase-2 reviewer wondering whether those constraints are
preserved or dropped.

#### RESOLVED: `simulationEnded` computed has a dead branch (`engine === null`)

The suggested computed at line 180-182 includes `engine === null` as a path to
"Ended". But `engine` is only nulled by `restart()`, which also flips
`simulationStarted = false` — so `engine === null && simulationStarted === true`
should be unreachable. Either tighten the predicate to just
`simulationStarted && !simulationRunning && engine?.fireDidStop`, or note why the
defensive `engine === null` matters.

---

### QA Engineer

#### RESOLVED: Missing test enumeration for the Reload predicate

The non-functional bullet says "each rule above is asserted at least once" but
doesn't enumerate the Reload edge cases. The Reload predicate
(`setupChanged || sparks.length > 0`) has three meaningful combinations to test
beyond the seven-state matrix:
- `setupChanged=true, sparks=0` → enabled.
- `setupChanged=false, sparks=1` → enabled.
- `setupChanged=false, sparks=0` → disabled (Default-equivalent).

Plus a test that confirms `restart()` preserves `setupChanged` and a test that
confirms `reload()` resets it. Should be called out.

#### RESOLVED: Missing test for the "Stop is a pause" behavior

New behavior added in this ticket: user-pressed Stop keeps Start enabled (resume).
Should be an explicit test in `bottom-bar.test.tsx` and/or `simulation.test.ts`:
press Start → press Stop → assert `startEnabled === true` and the button label is
"Start". Distinct from the "fire-finished" path which asserts `startEnabled === false`.

#### RESOLVED: Visual regression risk from IconButton opacity change (0.5 → 0.35)

Changing the IconButton disabled treatment from `opacity: 0.5` (whole-button) to
`opacity: 0.35` (content only) affects every disabled-state IconButton in the
project, not just the bottom-bar ones added in this ticket. There's no visual
regression testing today. Worth a note that this affects Spark, Setup, Fire Line,
and Helitack disabled appearance too, and reviewers should look at all of them.

#### RESOLVED: Missing test for the `setupChanged` snapshot-diff in `applyAndClose`

The new "snapshot-on-open, diff-on-Create" logic in `terrain-panel.tsx` is the
load-bearing piece for the entire Reload rule. Cases to cover in
`terrain-panel.test.tsx`: (a) open wizard, Create with no changes → `setupChanged`
stays false; (b) open, change drought, Create → true; (c) open, change drought
back to original, Create → false; (d) open, change drought, X-close → false.

---

### Product Manager

#### RESOLVED: Ticket says "placed Sparks remain on model and can be moved" — spec affirms remain, silent on moved

Requirement 6 says sparks "remain on the model and can be moved" — copies the
ticket exactly. But neither the requirements list nor Technical Notes explicitly
confirms that spark-dragging still works post-Restart. If the implementation reuses
existing spark-movement code, this is a no-op. Worth a one-line affirmation that
spark drag-to-move continues to work in the Restarted state, or a flag that this
needs verification.

#### RESOLVED: Fire Intensity Scale state not addressed

The Zeplin table at line 509-517 shows the Fire Intensity Scale enabled in all 7
states. The Requirements section doesn't mention it at all because it's a display
widget, not a button. Fine to leave out, but a single sentence under "Buttons
explicitly NOT in scope" would close the loop.

---

### WCAG Accessibility Expert

#### RESOLVED: 0.35 opacity disabled state may be too faint to perceive

The Zeplin spec drops content opacity to 0.35 — a 65% fade. White-on-white-ish
backgrounds with teal / charcoal icons at 35% may be readable enough, but it's at
the edge of WCAG 1.4.11 (Non-text Contrast). Disabled controls are technically
exempt from contrast requirements, but if the icon is *so* faint a sighted user
can't tell the button exists, that's a usability problem regardless of WCAG. Worth
verifying the actual rendered contrast against a representative bottom-bar
background before sign-off, and noting in the spec that 0.35 was an explicit
designer choice (so reviewers don't second-guess it).

#### RESOLVED: No mention of state-change announcement for screen reader users

When a button transitions enabled → disabled (e.g., Setup disables when Start is
pressed), MUI sets `aria-disabled="true"` automatically — that's covered. But the
transition itself isn't announced unless the consuming UI has a live region or
similar. For a state machine whose whole point is teaching the workflow via
button availability, sighted users see the change but screen-reader users may
not. Worth flagging as a deliberate decision (out of scope vs. addressed).

---

### Education Researcher

#### RESOLVED: `setupChanged` doesn't auto-clear on wizard-driven revert to defaults

*Surfaced during re-review after the initial 13 issues were resolved.*

Our `setupChanged` rule fires on diff-against-snapshot (wizard-open), not
diff-against-preset. If the user manually reverts every value to preset defaults via
Create, the diff against the wizard-open snapshot is non-empty (they edited values),
so `setupChanged` stays true even though the live sim now matches the preset. Reload
would remain "enabled" with conceptually nothing to do. **Documented as a known
acceptable wart** in the RESOLVED question "What counts as 'Setup changed'?"; not
worth the implementation complexity of a preset-baseline comparison.

---

#### RESOLVED: New state signals (`setupChanged`, `fireLineUsed`, `helitackUsed`) not in the event log

The spec adds three new derived signals about student behavior — whether they
customized setup, used Fire Line, used Helitack during a run. These drive button
state but aren't independently logged. For research / Hazbot purposes,
`setupChanged` is *approximately* recoverable from the existing `SimulationStarted`
event's config snapshot (diff against the preset — accurate except for the
snapshot-on-open wart, where a revert-to-preset Create leaves `setupChanged === true`
with a matching live config; an exact recovery would need a payload on
`TerrainPanelSettingsSaved`). `fireLineUsed` / `helitackUsed` are recoverable from
the existing `FireLineAdded` / `Helitack` log events. So no new log events are
*necessary*. But worth an explicit note in Technical Notes that "no new log events
are needed because the underlying behavior is already logged" — so a Phase-2 reviewer
doesn't add redundant events.

---

### RESOLVED: Reload and Restart button styling when disabled

**Context**: Today these are MUI `<Button>`s with `disableRipple`, no `disabled` prop,
and no disabled-state CSS. Once they can become disabled, they need a visual treatment.

**Zeplin investigation findings**: In the artboard, the Reload and Restart controls
use the **same disabled treatment** as the IconButton-based controls (Setup, Spark,
Fire Line, Helitack): text label and icon dropped to `opacity: 0.35`, background
stays at full opacity. They are visually indistinguishable from the IconButtons in
their disabled state.

**Decision**: **Match the IconButton disabled treatment**, with the opacity change
from RESOLVED question "Visual specifications for disabled / enabled / hover
states":
- Add `disabled={!simulation.reloadEnabled}` (resp. `restartEnabled`) to the Reload
  / Restart `<Button>`s at
  [bottom-bar.tsx:122-138](../../src/components/bottom-bar.tsx#L122-L138).
- Apply the same `opacity: 0.35` content-fade pattern. Implementation choice (not
  picked here): keep Reload / Restart as MUI `<Button>` and add a scoped disabled
  rule in `bottom-bar.scss`, OR convert them to use `IconButton`. The disabled
  appearance is identical either way. Leaving this implementation choice to the
  Phase 2 plan.

---

## Self-Review (re-run, 2026-05-26)

### Senior Engineer

#### RESOLVED: Background section claims a "used" observable is needed, contradicting the resolved Technical Notes
Lines 53-55 (Background → Current implementation) state: "There is **no observable
for 'Setup has been changed since default'** and **no observable for 'Fire Line /
Helitack was actually used'**. Both will need to be added to express the new rules."
But the resolved Technical Notes at lines 213-220 say the opposite for the second
half: "No 'used' state needed." After the Self-Review collapsed Ended-state
Fire Line / Helitack to "always disabled", the used-state is no longer load-bearing.
The Background is stale and should be reworded so a fresh reader doesn't go hunting
for a "used" observable that the spec explicitly decided against.

**Resolution**: Background updated — the "no observable for setup change" claim
stays (still accurate); the "no observable for Fire Line / Helitack used" sentence
is now a parenthetical forward-reference to the RESOLVED block that decided the
signal isn't load-bearing.

#### RESOLVED: Gaps-vs-spec table row "After run" still describes the un-resolved (used-conditional) rule
Lines 65-66 (the row beginning "After run (sim stops on its own, or user pressed
Stop)") describes the desired behavior as: "If Fire Line / Helitack were enabled
and **not used**, they are disabled." That's the *original* ticket reading. The
resolved Requirement 5 (line 132-137) drops the used-conditional and disables them
unconditionally in Ended. The Gaps table row is now misleading — should be
rewritten to match the resolution.

**Resolution**: Gaps table row updated to describe Fire Line / Helitack as disabled
unconditionally in the Ended state, and the row label tightened to "After run (fire
finished naturally)" to match the Paused-vs-Ended split established by Requirement 5.

#### RESOLVED: `restartedSinceLastRun` computed appears unused
Technical Notes line 240-241 proposes `restartedSinceLastRun: boolean — implied by
simulationStarted === false && sparks.length > 0`. Cross-checking against the Zeplin
button matrix (line 601-609): state 3 (SparkPlaced) and state 6 (Restarted) have
**identical** enabled/disabled values for every button. So nothing in the spec
needs to distinguish the two states. The computed appears decorative. Either give
it a concrete consumer (e.g., a future Hazbot rule) or drop it from the suggested
shape so Phase 2 reviewers don't implement an unused observable.

**Resolution**: Dropped the `restartedSinceLastRun` bullet from the suggested-shape
list in Technical Notes. The remaining computeds (`setupChanged`, `simulationEnded`,
per-button enabled/disabled, `reloadEnabled` predicate) are all load-bearing.

#### RESOLVED: Reload-disabled rule violated by presets with non-empty `config.sparks`
Requirement 1 (Default) says Reload is disabled. The Reload predicate is
`setupChanged || sparks.length > 0`. But several presets in
[src/presets.ts](../../src/presets.ts) — `basic`, `basicWithWind`, `slope45deg`,
`basicWithSlopeAndWind` — declare `sparks: [[50000, 50000]]`. On preset load,
`setInputParamsFromConfig` adds those sparks to the model, so `sparks.length > 0`
immediately, which makes Reload **enabled** in what the spec calls "Default" for
these presets. The student-facing curriculum presets (`plainsTwoZone`,
`mountainsandplainsTwoZone`, `hillTwoZone`, `hillThreeZone`) all have empty
`sparks`, so the issue is invisible in classroom use. But the spec's wording
implies an invariant that doesn't hold across all presets. Two paths:
- (a) Clarify that "Default" means "preset just loaded, the preset has no
  preplaced sparks". For presets with preplaced sparks, the lifecycle starts in
  state 3 (SparkPlaced), not state 1.
- (b) Refine the Reload predicate to `setupChanged || (sparks.length > 0 &&
  userPlacedASpark)`, distinguishing user-placed from preset-placed sparks. More
  work; probably not worth it.

**Resolution**: Option (a). Added a "Preset caveat" bullet under Requirement 1
noting that the four dev/test presets with preplaced sparks effectively start the
lifecycle in state 3 (Spark placed), not state 1 (Default), and that all
curriculum-facing presets have empty `sparks` so this is invisible in classroom
use. No code change.

---

### QA Engineer

#### RESOLVED: Missing test — `setupChanged` stays true through a no-op re-Create
The four `terrain-panel.test.tsx` cases at lines 192-199 cover the transitions
from the **initial false** state. They don't cover the inverse: once
`setupChanged === true` (after a Create-with-changes), re-opening the wizard
captures a *new* snapshot equal to the live (customized) state, so a subsequent
no-op Create has an empty diff. The spec implies `setupChanged` should **stay
true** in that case (it never auto-clears except on `reload()`), but the rule
is implicit. Add a test case (e): start from `setupChanged=true`, open wizard,
no field changes, Create → `setupChanged` stays true.

**Resolution**: Added test case (e) to the `terrain-panel.test.tsx` enumeration,
explicitly locking in the "set-on-diff, never auto-clear" semantics that the
"known wart" RESOLVED block depends on.

#### RESOLVED: Missing test — Paused → Restart and Paused → Reload transitions
The Paused-vs-Ended tests at lines 184-188 cover entry into the Paused sub-state
and the engine-finished-naturally branch. They don't assert what happens when the
user *exits* Paused via Restart or Reload. Specifically: after Paused,
press Restart → expect Restarted-state rules (sparks preserved, Setup/Spark
re-enabled, engine reset). Worth one explicit test per exit path.

**Resolution**: Added two test bullets to the Paused-vs-Ended test list covering
Paused → Restart and Paused → Reload, asserting the corresponding state-rule
expectations.

#### RESOLVED: Missing test — Reload during Running and during Paused
The Zeplin matrix at line 605-606 has Reload **enabled** in state 4 (Running).
Pressing Reload while the engine is ticking is a real path. The spec doesn't
enumerate a test for it. At minimum: press Start, then Reload while
`simulationRunning === true` → expect Default-state rules and engine torn down.
Same for Reload-during-Paused (engine state preserved but not running).

**Resolution**: Added a Running → Reload test bullet asserting Default-state
rules and engine teardown. Paused → Reload is covered by the previous
issue's resolution.

---

### Product Manager

#### RESOLVED: Stop → Pause rename has no follow-up tracking note
Out of Scope at line 299-301 mentions the rename was deferred to "a future
sprint" per the designer. There's no Jira link, no "see WM-XX" pointer, no note
that a follow-up ticket was even filed. Until renamed, every doc / Hazbot rule
that references "Stop" remains correct, but the misnomer keeps accruing. Either
file the follow-up now and link it, or note explicitly that no follow-up has
been filed yet (so a future maintainer doesn't assume one exists).

**Resolution**: Added a sentence to the Out of Scope bullet stating "No follow-up
Jira ticket has been filed for the rename as of this spec." Filing the ticket
itself is left to the user, outside the spec.

#### RESOLVED: No contingency for the 0.35-opacity sighted-user check failing
The accessibility note at line 281-288 requires the implementation PR to include
a "sighted-user check that the disabled icons remain visible enough to indicate
the button exists". It doesn't say what to do if the check fails — escalate to
designer? Pick a darker value? Block merge? Currently a reviewer who notices a
problem has no documented escalation path. One sentence ("if the check fails,
flag the designer before merging") would close the loop.

**Resolution**: Appended an escalation sentence to the Accessibility note —
flag the designer (Michael Tirenin) rather than silently raising the opacity.

---

### WCAG Accessibility Expert

#### RESOLVED: Disabled MUI buttons are removed from tab order entirely, not just announced as disabled
The Out of Scope note at line 303-310 explains that the *transition* from
enabled → disabled is not announced for screen-reader users. True, but there's a
stronger implication that should be acknowledged: MUI's `disabled` prop sets the
underlying `<button disabled>` attribute, which **removes the element from the
tab order**. So a keyboard or screen-reader user can't even Tab to a disabled
Reload to discover it exists. The visual lifecycle (greyed-out button is
visible) has no keyboard-accessible equivalent. This is standard HTML behavior
and WCAG-compliant (disabled controls are exempt), but the spec's "Out of Scope"
framing currently undersells the gap — assistive-tech users miss not just the
state transition but the existence of the control. If preferred, switching to
`aria-disabled="true"` (instead of `disabled`) would keep buttons focusable while
preventing activation, at the cost of needing per-button click guards. Worth
calling out as a deliberate choice rather than burying.

**Resolution**: Broadened the existing Out of Scope bullet (formerly titled
"Screen-reader announcements...") to "Screen-reader and keyboard-only perception
of disabled buttons", explicitly covering both the unannounced transition and
the tab-order removal. Noted the `aria-disabled` + click-guard mitigation as the
shape a future a11y pass might take.

#### RESOLVED: Focus behavior when a focused button becomes disabled mid-action not specified
If a keyboard user has focus on Setup, then triggers Start via some other path
(e.g. keyboard shortcut or screen-reader script), Setup becomes disabled. The
browser will move focus to `document.body` (typical default) and the next Tab
press starts from the top of the page — disorienting. The spec doesn't say
whether the implementation should explicitly re-target focus when a focused
button transitions to disabled (common pattern: move focus to the next still-
enabled control in the bar). Worth either specifying a behavior or explicitly
deferring to "browser default — acceptable, not designed".

**Resolution**: Added an Out of Scope bullet explicitly deferring custom focus
re-targeting, noting that in practice this UI's trigger paths put focus on a
control that *stays* present (Start → Stop) rather than one that vanishes, so
the disorientation risk is low.

---

### Student

#### RESOLVED: A disabled button gives no learner-facing explanation of why
The state machine teaches the lifecycle by making buttons appear / disappear.
But once a student sees Fire Line greyed out in the Ended state, there is no
hover tooltip, no helper text, no Hazbot integration spelled out in this spec
that explains "this is unavailable now because the run has ended; press Restart
to use Fire Line again". The spec assumes the visual cue alone is pedagogy
enough. For a learner who didn't see the transition (e.g. came back to the tab
mid-run), the disabled button reads as broken, not as guidance. Either: (a)
add a tooltip-on-disabled requirement, (b) note explicitly that Hazbot
(parent epic AP-80) is the explainer and this ticket only provides the visual,
or (c) flag as a known UX gap for follow-up.

**Resolution**: Option (b). Added an Out of Scope bullet ("Tooltip / hint on
disabled buttons") making explicit that this ticket provides the visual state
machine and that the Hazbot help-overlay (parent epic AP-80) owns the
per-control explanations. Avoids duplicating or competing with Hazbot.

#### RESOLVED: "Stop" misnomer hurts the workflow this ticket exists to clarify
The designer acknowledged that the Start/Stop button is semantically a Pause and
deferred the rename. But this ticket's entire purpose is to make the controls
teach the workflow — and right now the controls *teach the wrong workflow* on
Stop (a student presses Stop expecting the run to end, gets a paused engine and
a button that re-says "Start", and may or may not realize the engine state is
preserved). The new Paused-vs-Ended split makes this worse: pressing Stop and
pressing "fire finished naturally" produce visually identical button states
(Start re-appears) but functionally different ones (Start enabled vs. disabled).
Worth either accepting this is a known UX tax until the rename ships, or
considering whether a temporary tooltip ("Press Start to resume") on the
post-Stop Start button would help learners — even if the broader rename is
deferred.

**Resolution**: Acknowledged as a known UX tax. Added a "Paused vs. Ended visual
similarity" bullet to the Implications of the RESOLVED "After Stop is pressed
mid-run..." block, noting that the only visual differentiator is Start
enabled/disabled until the rename ships. Hazbot rulesets can carry richer
explanation via the new `simulationEnded` computed; no new tooltip work is added
here (consistent with the disabled-button tooltip Out of Scope bullet).

---

### Education Researcher

#### RESOLVED: `setupChanged` lifecycle isn't independently logged — only its final state at Start
The Technical Notes at line 222-232 argue no new log events are needed because
`setupChanged` is recoverable post-hoc from the `SimulationStarted` event's
config snapshot. That recovers the *value at Start time*. But the spec's
state machine flips `setupChanged` on every Create-with-changes, potentially
multiple times before a run. A researcher interested in "how many times did the
student adjust setup before pressing Start", or "how long did the student spend
in the Setup-changed-but-no-spark state", can't recover that from
`SimulationStarted` alone. If that fine-grained signal isn't needed, fine —
but the spec should say so explicitly, rather than leaving "no new log events
needed" as an unqualified claim. (Counter: each Create call already emits a
log event today? Worth verifying before deciding.)

**Resolution**: Verified that `terrain-panel.tsx`'s `applyAndClose` already
emits `TerrainPanelSettingsSaved` on every Create press. So "how many Creates,
and when" is recoverable; the per-Create *delta* is not (the event has no
payload). Tightened the Technical Notes paragraph to name the existing event
explicitly, acknowledge the payload limit, and note that extending the payload
for finer-grained research is a deliberate non-goal of this ticket.

---

### Re-run cleanup (issues surfaced after first-pass resolutions)

#### RESOLVED: Technical Notes intro promises "two pieces of state" but only one is needed
After the Senior Engineer resolutions cleaned up the Background, the Technical
Notes intro at line 228 still says "we need two pieces of state that do not exist
today" and then lists `setupChanged` as #1 plus a "**No 'used' state needed**"
paragraph as #2. Only one new piece of state is actually required; the second
paragraph documents a deliberate non-decision. Misleading to call them both
"pieces of state".

**Resolution**: Reworded the intro to "we need one piece of new state, plus a
deliberate non-decision about a second".

#### RESOLVED: `bottom-bar.test.tsx` rewrite scope says "six lifecycle states" but the spec enumerates seven
The Files-likely-to-change bullet for `bottom-bar.test.tsx` said "rewrite to
cover all six lifecycle states". The Requirements section enumerates seven
(Default, Setup changed, Spark placed, Running/Paused, Ended, Restarted, Reload
pressed) and the Zeplin matrix also shows seven. "Six" was probably collapsing
AfterReload === Default but the collapse wasn't explained, risking
under-coverage in the new test suite.

**Resolution**: Changed to "all seven lifecycle states from the Requirements
section (1–7)" with an explicit note that state 7 (AfterReload) is identical to
state 1 (Default) so the corresponding assertions can be reused.

---

## Self-Review (third pass, 2026-05-26)

Engineering-focused mix: Senior Engineer, QA Engineer, Technical Writer.

### Senior Engineer

#### RESOLVED: Spark button's `placing-spark` interaction guard not carried into the new computed
The current implementation at
[bottom-bar.tsx:62-65](../../src/components/bottom-bar.tsx#L62-L65) disables
Spark if `ui.interaction === Interaction.PlaceSpark` — prevents re-entering
placement while already placing. The new state machine (Requirement 3, line
105-110) says "Spark stays enabled until the per-zone spark budget is
exhausted" and references `canAddSpark` indirectly via the budget rule, but
**does not** explicitly preserve the `Interaction.PlaceSpark` guard. By
contrast, Requirement 4 (line 119-133) explicitly preserves the analogous
`Interaction.DrawFireLine` and `Interaction.Helitack` guards for Fire Line and
Helitack. The Technical Notes `sparkEnabled` bullet is silent. Without an
explicit statement, a Phase 2 reviewer could drop the guard and re-introduce
the "click Spark while already placing" weirdness.

**Resolution**: Requirement 3 now explicitly preserves the
`Interaction.PlaceSpark` guard alongside the per-zone budget rule, mirroring
how Requirement 4 handles Fire Line / Helitack. Phase 2 implementers carry
the guard into the new `sparkEnabled` computed.

#### RESOLVED: Reload (and Restart) behavior when pressed mid-interaction unspecified
`reload()` and `restart()` are described in terms of model state ("clears
sparks, fire lines, custom setup" / "clears placed Fire Line markers"), but
the spec is silent on `ui.interaction`. If the user is mid-interaction
(`Interaction.PlaceSpark`, `Interaction.DrawFireLine`, or
`Interaction.Helitack`) when they press Reload or Restart, current code does
not reset `ui.interaction`. After the transition the user could end up in a
fresh model with a stale interaction handler active — clicking the canvas
would trigger placement on an out-of-date target. Worth specifying explicitly:
either (a) Reload / Restart also reset `ui.interaction` to `null`, or
(b) the spec defers to the existing behavior with a known-acceptable note.
Today the Zeplin matrix doesn't depict mid-interaction states, so the answer
isn't visually mandated.

**Resolution**: Option (b). Added an Out of Scope bullet noting that
interaction-lifecycle behavior is preserved as-is, with a Phase 2 sanity-check
instruction: if mid-interaction Reload / Restart triggers a phantom click
handler or crash, file a follow-up rather than expanding this ticket.

---

### QA Engineer

#### RESOLVED: No test enumerated for the wind-change path to `setupChanged`
The `terrain-panel.test.tsx` test enumeration at lines 209-222 covers cases
(a)–(e), all framed around drought-level changes. But the snapshot-on-open /
diff-on-Create rule lists five tracked fields: `zonesCount`, per-zone
`terrainType` / `vegetation` / `droughtLevel`, `windSpeed`, and
`windDirection`. There's no test for "open wizard, change wind direction,
Create → `setupChanged` becomes true". A future refactor that accidentally
drops wind from the snapshot diff would slip past drought-only coverage. Add
at least one wind-change case to the enumeration — and arguably one
`zonesCount`-change case too.

**Resolution**: Added test cases (f) wind-change → `setupChanged` true and
(g) `zonesCount`-change → `setupChanged` true to the terrain-panel test
enumeration. The two cases together guard the non-drought fields of the
snapshot diff.

#### RESOLVED: "Authored" gate has no enumerated test
Requirements 4 and 5 hinge on whether Fire Line / Helitack are "authored"
(`fireLineAvailable === true` resp. `helitackAvailable === true`). Neither the
seven-state matrix nor the explicit edge-case tests cover the authoring gate
itself. Concretely: "with `fireLineAvailable=false`, Fire Line stays disabled
in state 4 (Running) regardless of any other condition" — and the same for
Helitack. Without it, a regression that ignores the authoring flag could pass
the existing assertions because all the curriculum presets default to
`fireLineAvailable=true`.

**Resolution**: Added two authoring-gate tests to the `bottom-bar.test.tsx`
non-functional requirements: with `fireLineAvailable=false` →
`fireLineEnabled === false` in Running regardless of other conditions, and
the parallel test for Helitack.

#### RESOLVED: Paused → Reload assertion is ambiguous about sparks
Line 203-204 reads "Press Start → press Stop (Paused) → press Reload → assert
Default-state rules: `setupChanged === false`, sparks cleared **(or reset to
the preset's `config.sparks`)**, ...". The parenthetical creates a real
ambiguity: for curriculum presets with empty `config.sparks` sparks should be
empty; for the dev presets with preplaced sparks (`basic`, `basicWithWind`,
`slope45deg`, `basicWithSlopeAndWind`) sparks should equal `config.sparks`.
The test as worded permits either outcome. Tighten to one universal
assertion: "sparks match the preset's `config.sparks` post-Reload" (which
covers both empty and non-empty cases).

**Resolution**: Replaced the hedged parenthetical with a single universal
assertion ("`sparks` match the preset's `config.sparks` (empty for curriculum
presets, preplaced for dev presets like `basic`)") so the test outcome is
unambiguous across all preset classes.

#### RESOLVED: Drag-to-move spark post-Restart relies on PR-time manual verification
Requirement 6 (line 156-159) currently says "Drag-to-move is already wired
through `simulation.setSpark()` ... verify it still works post-Restart in the
implementation PR". That's a manual verification step, not an automated test.
Given the new state machine touches spark-related logic, regression risk is
real. Worth elevating to a Jest assertion ("after Restart, `setSpark(idx, x,
y)` still mutates `sparks[idx]`") or a Cypress drag step in the smoke flow,
not a PR-time eyeball check.

**Resolution**: Added a Jest test ("Drag-to-move spark survives Restart") to
the non-functional test enumeration that asserts `setSpark(idx, x, y)`
mutates `sparks[idx]` post-Restart. The drag UI itself isn't tested —
`setSpark` is the load-bearing call. Requirement 6 updated to point to this
test instead of "verify in PR".

---

### Technical Writer

#### RESOLVED (skipped): Two parallel top-level "Self-Review" sections in the same document
The doc has `## Self-Review` at line 734 and `## Self-Review (re-run,
2026-05-26)` at line 919. Both are H2, so a reader skimming the TOC sees
them as peers. The second is in fact a continuation of the first after the
spec was edited mid-review. With this third pass appended below, the doc
will have three peer sections labelled almost identically. Suggest one of:
(a) merge into a single `## Self-Review` section with `### Pass 1`,
`### Pass 2`, `### Pass 3` subsections; (b) demote all three under a single
`## Review History` parent.

**Resolution**: Skipped. Restructure would cascade through three pass
sections and dozens of role/issue heading lines for cosmetic clarity that
doesn't change the spec's substance. Triaged as not worth the churn.

#### RESOLVED: "Authored" defined in Requirements, but used in the Background's Gaps table beforehand
The term is first used at line 66 ("Fire Line / Helitack enabled iff
**authored**") inside the Background section's Gaps table. It isn't defined
until line 86-87 ("'Authored' means the preset / URL config has
`fireLineAvailable === true` (resp. `helitackAvailable === true`)") at the
top of the Requirements section. A top-down reader hits the use before the
definition and has to infer. Move the definition up into Background, or add
a forward reference on first use.

**Resolution**: Added a parenthetical at first use in the Gaps table giving
the short definition plus a pointer to the fuller one in the Requirements
section. Lighter-touch than moving the whole definition.

#### RESOLVED (skipped): State names rendered inconsistently throughout the doc
State references appear in at least three forms: human prose ("Setup
changed", "Spark placed", "Running or Paused"), PascalCase shorthand
("SparkPlaced", "AfterReload", "Restarted"), and lowercase ("after run").
The Zeplin matrix at lines 665-673 uses one column-header style (numbered
"1 Default", "2 SetupChanged", ...) while the Requirements section enumeration
at lines 89-169 uses a different style ("1. **Default**", "2. **Setup
changed**", ...). Readers cross-referencing the matrix to the requirements
have to mentally translate. Pick one convention (suggestion: numbered
PascalCase — `1. Default`, `2. SetupChanged`, `3. SparkPlaced`, ...) and
apply across Background, Requirements, and the Zeplin matrix.

**Resolution**: Skipped. Standardizing would touch dozens of cross-references
across Background, Requirements, Zeplin matrix, RESOLVED blocks, and test
enumerations for cosmetic gain. The existing two-round review didn't flag
the inconsistency as a blocker; readers cross-referencing can map between
forms without ambiguity.

#### RESOLVED: `Status` field still reads "In Development" after two completed review passes
The very first metadata field of the doc reads `**Status**: **In
Development**`. After two full self-review rounds and (now) a third, plus
the cross-reference review in Phase 3, the field is misleading at a glance.
Either bump to `Ready for Implementation` / `Ready for Review` (whichever
better matches the lifecycle stage), or note that "In Development" is
deliberately retained until the implementation PR lands.

**Resolution**: Bumped to `Ready for Implementation`. The spec has
completed four self-review passes (this pass being the fourth, focused
on engineering concerns). External review is an optional next step
(cc-create-spec Phase 4), but the spec stands ready for Phase 2
implementation work to begin now. If external review surfaces material
changes, the status can step back temporarily before re-advancing.

---

## Self-Review (fourth pass, 2026-05-26)

Engineering-focused mix: Senior Engineer, QA Engineer, MobX/React Reactivity
Reviewer. This pass deliberately seeks issues the first three passes did not
catch, grounded in a re-read of [src/components/bottom-bar.tsx](../../src/components/bottom-bar.tsx),
[src/models/simulation.ts](../../src/models/simulation.ts), and
[src/components/terrain-panel.tsx](../../src/components/terrain-panel.tsx).

### Senior Engineer

#### RESOLVED: `simulationEnded` computed depends on a non-observable (`engine?.fireDidStop`)
The Technical Notes suggest:
> `simulationEnded: boolean — true when simulationStarted && !simulationRunning && engine?.fireDidStop`.

In [simulation.ts:37](../../src/models/simulation.ts#L37), `engine` is declared
`public engine: FireEngine | null = null;` — **no `@observable`**. And
`FireEngine` is not a MobX class either, so `fireDidStop` is a plain field on a
plain object. A naïvely-written `@computed get simulationEnded()` reading
`this.engine?.fireDidStop` would *not* re-evaluate when `fireDidStop` flips on
its own — MobX has no dependency edge for non-observable reads. It only works
today because the same code path that flips `fireDidStop = true` also flips
`this.simulationRunning = false` ([simulation.ts:315-317](../../src/models/simulation.ts#L315-L317)),
and the computed *does* depend on `simulationRunning`. So the dependency is
load-bearing-by-coincidence, not by design.

This isn't a bug today — the computed will fire when expected — but Phase 2
implementers and any future refactorer need to know the rule: **do not rely on
`engine?.fireDidStop` driving reactivity directly.** A future change that
flipped `fireDidStop` without also flipping `simulationRunning` would silently
break button state. Options:
- (a) Document explicitly in Technical Notes that the computed derives its
  reactivity from `simulationRunning`, and that `engine?.fireDidStop` is read
  only as a discriminator (not a trigger).
- (b) Promote `engine` to `@observable` (cheap; one decorator) so it triggers
  on assignment in `restart()` and `start()`.
- (c) Add a dedicated `@observable simulationEndedReason` flag set inside
  `tick()` when `fireDidStop` is detected, and key the computed off that.

(a) is the lowest-effort and matches the existing implicit contract; (b)
adds a small safety margin; (c) overengineers for a hypothetical refactor.

**Resolution**: Option (a). Added an explicit "Reactivity contract" note to
the `simulationEnded` bullet in Technical Notes documenting that
`simulationRunning` carries the reactivity and `engine?.fireDidStop` is a
discriminator read only. Future refactorers are warned not to rely on
`fireDidStop` driving reactivity directly.

---

#### RESOLVED: Diff timing in `applyAndClose` not specified — current code mutates simulation before any diff could run
The spec's Reload predicate hinges on `setupChanged`, which is set "iff the
user clicks Create and at least one of [tracked fields] differs from a
snapshot captured when the wizard opened" (RESOLVED "What counts as 'Setup
changed'?"). But [terrain-panel.tsx:75-81](../../src/components/terrain-panel.tsx#L75-L81)
currently calls `simulation.setWindSpeed(windSpeed)`,
`simulation.setWindDirection(windDirection)`, and `simulation.updateZones(zones)`
inline in `applyAndClose`. If the Phase 2 diff function reads from
`simulation.*` to compute the diff (the obvious approach for someone unfamiliar
with the snapshot rule), it would always see an empty diff because the local
React state and the simulation have just been reconciled by the mutator calls.

The spec implies — but doesn't say — that the diff must run **against a
snapshot captured at wizard-open time**, before the `applyAndClose` mutators
fire. Without this being explicit, a reasonable implementer could compute the
diff post-mutate and produce silently-broken behavior (no Reload ever
enables despite real edits). Worth a one-sentence Technical Note: "The
snapshot must be captured at wizard-open and the diff computed before
calling the `simulation.*` mutators in `applyAndClose`."

(Cross-references: test case (a) at line 235 — "Create with no changes →
`setupChanged` stays false" — would pass under the broken implementation
too, since the post-mutate diff would also be empty. So that test alone
doesn't catch the bug. Test case (b) — "change drought, Create →
`setupChanged` becomes true" — is the one that would fail under the broken
ordering, but only because the *snapshot-captured* drought differs from the
*just-mutated* drought. The test name doesn't make this dependency
obvious.)

**Resolution**: Added a "Diff timing" clause to the `setupChanged`
Technical Notes bullet explicitly mandating snapshot-on-open and
diff-before-mutate. Annotated test case (b) in the terrain-panel test
enumeration as the canary for the ordering, so a Phase 2 implementer who
breaks it sees the failure pointing at the right cause.

---

### QA Engineer

#### RESOLVED: `simulationEnded` computed has no enumerated unit test
The Technical Notes add a new `simulationEnded` computed
(`simulationStarted && !simulationRunning && engine?.fireDidStop`) that's
load-bearing for the Paused-vs-Ended split. Every bottom-bar test exercises
it transitively, but it has no direct unit-test enumerated in
`simulation.test.ts`. Direct coverage would catch reactivity regressions
faster than full bottom-bar render tests:
- Pre-start: `simulationStarted=false` → `simulationEnded === false`.
- Running: `simulationStarted && simulationRunning` → `simulationEnded === false`.
- Paused (user-Stop): `simulationStarted && !simulationRunning && !engine?.fireDidStop`
  → `simulationEnded === false`.
- Ended (fire finished): `simulationStarted && !simulationRunning && engine?.fireDidStop`
  → `simulationEnded === true`.
- After Restart: `simulationStarted=false`, `engine=null` →
  `simulationEnded === false` (covers the `engine?.` optional-chain branch).

Add as a non-functional test bullet under `simulation.test.ts`.

**Resolution**: Added a direct `simulationEnded` test bullet to the
non-functional test enumeration, placed adjacent to the existing Paused
vs. Ended distinction tests. Cross-links explicitly to the reactivity
contract from Issue 1 so a future refactor that breaks the contract has
a unit test pointing at the cause.

---

#### RESOLVED: No assertion that pressing Reload disables Reload (state 5/6/4 → state 7 = state 1)
The seven-state matrix conceptually covers state 7 (AfterReload) as
identical to state 1 (Default), and the non-functional requirements list
mentions reusing assertions ("State 7 (AfterReload) is identical to state 1
(Default), so the corresponding assertions can be reused"). But neither the
seven-state matrix nor the explicit edge-case tests directly assert the
*transition*: "from a state where `reloadEnabled === true` (e.g., Ended,
Restarted, SetupChanged, SparkPlaced, Running), press Reload → assert
`reloadEnabled === false`". The currently-enumerated "Press Start → press
Stop (Paused) → press Reload" and "Press Start (Running) → press Reload"
tests assert the Default-state rules post-Reload but don't *call out*
Reload-becomes-disabled as the load-bearing observation. Adding "and
`reloadEnabled === false`" to those two test bullets closes the loop.

**Resolution**: On re-reading, the Paused → Reload bullet already
names "Reload disabled" in its assertion list — only the
Running → Reload bullet was missing it. Added explicit
`reloadEnabled === false` (with the empty-`config.sparks` caveat) to the
Running → Reload bullet so both transitions name the load-bearing
observation in-place.

---

### MobX/React Reactivity Reviewer

#### RESOLVED: Snapshot storage shape (`useRef` vs. `useState`) not specified for `terrain-panel.tsx`
The wizard's snapshot-on-open value needs a home in the React component. Two
options:
- **`useRef`** — Imperative reference, updates do not trigger re-render.
  Correct for a value that is *read at Create time* but not displayed.
- **`useState`** — Reactive, updates trigger a re-render. Wrong here: the
  snapshot doesn't drive any visible UI, so re-rendering on snapshot
  updates is pure waste.

The spec is silent. A Phase 2 implementer reaching for the more familiar
`useState` would technically work but introduce a wasted re-render on every
wizard open. Worth one line in Technical Notes: "Capture the open-time
snapshot via `useRef` (not `useState`) — the snapshot is only read at
Create time and should not trigger renders."

Bonus: the existing reset `useEffect` at
[terrain-panel.tsx:58-68](../../src/components/terrain-panel.tsx#L58-L68)
re-runs when `ui.showTerrainUI` flips back to `false` (i.e. on close).
The snapshot ref needs to be **written on open**, not on close — i.e.
guarded by `if (ui.showTerrainUI)` inside an effect, or computed lazily
when `applyAndClose` runs by reading from a separate "snapshot frozen at
last open" effect. The latter is cleaner. Either way, the existing reset
effect's polarity is `!ui.showTerrainUI` (close); a new effect with the
opposite polarity is needed.

**Resolution**: Added a "Snapshot storage" clause to the `setupChanged`
Technical Notes bullet mandating `useRef` (not `useState`) and an
open-polarity `useEffect`, with an explicit cross-reference to the
existing close-polarity reset effect so the polarity-difference is
called out for the Phase 2 reviewer.

---

#### RESOLVED (skipped): Disabled Reload / Restart MUI `<Button>`s do not currently subscribe to MobX observables — `@observer` triggers on `simulation.*` but the JSX must read the computed
Today, [bottom-bar.tsx:122-138](../../src/components/bottom-bar.tsx#L122-L138)
renders Reload and Restart as MUI `<Button>` with no `disabled` prop and no
read of any observable. Adding `disabled={!simulation.reloadEnabled}` and
`disabled={!simulation.restartEnabled}` is straightforward, but worth a
sentence in Technical Notes that **the JSX must read the computed by name
inside the render method**, not through an intermediate non-observable
variable. The reason: `@observer` (mobx-react) only tracks observable reads
that happen during `render()`. A pattern like
```tsx
const reloadEnabled = simulation.reloadEnabled;  // read once
return <Button disabled={!reloadEnabled} ... />
```
works because the read happens during render. But a pattern like
```tsx
const helpers = computeButtonState(simulation);  // read inside helper
return <Button disabled={!helpers.reloadEnabled} ... />
```
also works *only because* the helper reads the observable synchronously
during render. A naïve refactor that memoized `helpers` outside the
component (e.g. as a module-level helper that captured a stale snapshot)
would silently break reactivity. Worth one sentence: "Per-button computeds
must be read directly from `simulation` inside `render()` to participate
in `@observer` tracking." This is standard MobX hygiene but easy to forget
for someone unfamiliar with the pattern.

**Resolution**: Skipped. The current code at
[bottom-bar.tsx:62-77](../../src/components/bottom-bar.tsx#L62-L77)
already uses class getters reading `simulation.*` during render — the
Phase 2 implementer will most likely just swap those for reads of the
new computeds, preserving the in-render-read pattern. The risk is
defensive against a refactor nobody is proposing. Skipping avoids
spec bloat.

---

## External Review (Phase 4, 2026-05-26)

Findings raised by an external LLM review pass. Roles applied: Senior
Engineer, QA Engineer, Product Manager, MobX/React Reactivity Reviewer.

### Senior Engineer

#### RESOLVED [HIGH]: Interaction-dependent computeds cannot all live on `SimulationModel`
The spec asked for per-button computeds read as `simulation.sparkEnabled`,
`fireLineEnabled`, `helitackEnabled`, but those predicates depend on
`ui.interaction` — which lives on the `ui` store, not `SimulationModel`. A
Phase 2 implementer would either couple `SimulationModel` to UI state
(architectural smell) or be unable to satisfy the requirement as literally
written. The existing code at
[bottom-bar.tsx:62-77](../../src/components/bottom-bar.tsx#L62-L77) already
uses *component-class* getters that read both stores, which is the obvious
existing pattern but wasn't called out in the spec.

**Resolution**: Updated Technical Notes' "New `@computed` properties" bullet
to explicitly split per-button getters by store: `setupEnabled`,
`startEnabled`, `reloadEnabled`, `restartEnabled` live on `SimulationModel`
as `@computed` properties (simulation-only predicates); `sparkEnabled`,
`fireLineEnabled`, `helitackEnabled` live on the `BottomBar` component as
class getters that combine a simulation-only predicate with the
`ui.interaction !== Interaction.X` guard, mirroring the existing pattern.
Requirement 3's Spark bullet updated to refer to "button-state getter"
instead of "computed" and cross-reference the Technical Notes split.

---

#### RESOLVED [HIGH]: Files-to-change note contradicts `setupChanged` restart semantics
The [src/models/simulation.ts](../../src/models/simulation.ts) bullet under
"Files likely to change" previously said `restart()` and `reload()` reset
the new observables / computeds — but Requirement 6 and the explicit
`setupChanged` lifecycle tests in the Non-functional / scope requirements
section ("`restart()` does NOT reset `setupChanged`" / "`reload()` DOES
reset `setupChanged` to false") require `restart()` to preserve
`setupChanged`. A Phase 2 implementer following the
Files-likely-to-change bullet literally could reset `setupChanged` in
`restart()` and silently break the lifecycle.

**Resolution**: Rewrote the bullet to spell out which method resets what:
`reload()` resets `setupChanged`; `restart()` must preserve it. Run/engine
state (`simulationStarted`, `simulationRunning`, `engine`, fire line state,
timestamps) continues to reset on both, as today.

---

### QA Engineer

#### RESOLVED [MEDIUM]: Zeplin matrix presents conditional enabled states as unconditional
The seven-state Zeplin matrix uses `E` for Spark / Fire Line / Helitack in
states 3, 4, and 6 — but those buttons are gated by per-button predicates
(`remainingSparks`, `config.fireLineAvailable` / `helitackAvailable`,
`canAddFireLineMarker` cooldown/capacity, `canUseHelitack` cooldown,
`ui.interaction`). A test or implementer copying directly from the matrix
could end up asserting "always enabled" in those cells and silently miss the
gates. The risk was real because the matrix prose at the time said "Every
cell matches our resolved rules exactly", which reinforced a literal
column-as-truth reading.

**Resolution**: Added a "Conditional cells" footnote below the matrix that
spells out which predicates collapse into the `E` glyph for each of Spark,
Fire Line, and Helitack — and explicitly notes that the unconditional cells
(Setup, Reload, Restart, Start/Stop) are exact. The matrix's "Every cell
matches" sentence is preserved as accurate at the lifecycle-state granularity;
the new footnote disambiguates the cell-level reading.

---

### MobX/React Reactivity Reviewer

#### RESOLVED [MEDIUM]: `simulationEnded` tests don't actually verify the reactivity contract
The spec previously claimed that direct unit tests in `simulation.test.ts`
were the regression guard for the `simulationEnded` reactivity contract.
They aren't — value-only assertions (`expect(simulation.simulationEnded)
.toBe(...)`) check the predicate's truth-table but cannot detect a future
refactor that flips `engine.fireDidStop` without also flipping
`simulationRunning`. The reactivity edge in MobX is carried by
`simulationRunning` (the only observable read in the computed); breaking
that edge would leave the value correct at point-of-read but stop
observers from re-firing. The UI could go quiet on natural fire completion
while the value-only tests stayed green.

**Resolution**: Split the test enumeration into two bullets: a **value
tests** bullet covering the five-state truth table (unchanged), plus a
new **reactivity contract** bullet requiring at least one observer-level
test (either a `reaction(() => simulation.simulationEnded, ...)` test in
`simulation.test.ts`, or a render-level `@observer` test in
`bottom-bar.test.tsx`). The supported `tick()` path that flips both
`simulationRunning=false` and `fireDidStop=true` is named explicitly so a
Phase 2 implementer doesn't have to reverse-engineer the trigger from
Technical Notes. The misleading parenthetical that claimed the value-only
tests "would fail first" was tightened to make clear they don't guard the
reactivity contract on their own.

---

### Product Manager

#### RESOLVED [LOW]: Restarted state heading omits Paused
Requirement 6's heading previously read "Restart button pressed from
Running or Ended" — but Requirement 4 enables Restart throughout the
Running-or-Paused state, and the test list at the Paused-vs-Ended
enumeration explicitly covers a Paused → Restart transition. The heading
was inconsistent with the rest of the spec.

**Resolution**: Single-word edit to Requirement 6's heading: "from
Running or Ended" → "from Running, Paused, or Ended". No other text or
test changes needed — the body of Requirement 6 already describes the
Restarted post-state without referencing the source sub-state.

---

## External Review (Phase 4, pass 2, 2026-05-26)

Second external LLM review pass after the first round of fixes. Five
findings raised, four substantive and one factual.

### Senior Engineer

#### RESOLVED [HIGH]: Reload/Restart "from any state" contradicted preserved `ui.interaction`
Requirement 7 said Reload returns to Default from any state, but the
prior Out-of-Scope bullet on `ui.interaction` preserved it. With the
pass-3 explicit `Interaction.PlaceSpark` guard on `sparkEnabled` (Req 3),
a user mid-`PlaceSpark` who clicks Reload — reachable via the
`SetupChanged → click Spark → click Reload` path, since Reload is enabled
in `SetupChanged` — landed in Default with stale `ui.interaction`, which
the new `sparkEnabled` getter reads as "already placing" and disables
Spark. That violates Requirement 1.

Mid-`PlaceSpark` + Restart is *not* reachable (Restart is only enabled
in Running / Paused / Ended, where Spark is disabled). But
mid-`DrawFireLine` / mid-`Helitack` + Reload-or-Restart is reachable from
Running and could leak phantom click handlers — the same concern the
old Out-of-Scope bullet flagged for follow-up.

Verified against [src/hazbot/](../../src/hazbot/): no ruleset references
`ui.interaction`. All factor variables and category expressions consume
logged events (`SimulationStarted`, `SimulationRestarted`,
`SimulationReloaded`, `SimulationEnded`, etc.). Resetting `ui.interaction`
adds / removes no events, so the analysis engine is unaffected.

**Resolution**: Added `ui.interaction = null` to both Requirement 6
(Restarted) and Requirement 7 (Reload). Removed the now-contradicted
Out-of-Scope bullet on `ui.interaction`. Updated Files-likely-to-change
to spell out that the reset wires into the `handleReload` / `handleRestart`
methods in [bottom-bar.tsx](../../src/components/bottom-bar.tsx),
not in `simulation.ts` (since `simulation` doesn't own `ui`). Added two
test bullets to the non-functional requirements: Reload-during-PlaceSpark
asserts `sparkEnabled === true` (the load-bearing regression guard) and
Restart-during-DrawFireLine asserts `ui.interaction === null` (the
reachable Restart case, since mid-`PlaceSpark` + Restart isn't
UI-reachable).

---

#### RESOLVED [HIGH]: `setSetupChanged` wiring instruction contradicted snapshot-diff-on-Create
The Files-likely-to-change bullet said "wire a `setSetupChanged(true)`
call into whichever actions are considered changes" for the wizard's
slider / dropdown / zone-edit handlers. That phrasing was leftover from
an earlier draft and directly contradicted the resolved design
(Requirement 2 line 106-112, Technical Notes `setupChanged` bullet at
line 321-338): `setupChanged` is set **only** on Create, after diffing
the wizard-open snapshot against the local wizard state. Wiring the
call into per-field handlers would mark canceled wizard edits as
committed changes and break test cases (d) X-close-no-change and
(c) revert-back-via-Create. A Phase-2 implementer reading the bullet
literally would have built the broken implementation.

**Resolution**: Rewrote the bullet to name `applyAndClose` as the only
call site, list the tracked fields, explicitly forbid wiring from
per-field handlers, and cross-reference the "Diff timing" and "Snapshot
storage" Technical Notes clauses that fix the call-site mechanics.

---

#### RESOLVED [MEDIUM]: Computed-on-store requirement contradicted component-class-getter design
The non-functional requirement said the state machine "is encoded as
`@computed` properties (or equivalent) on the existing MobX store(s)"
while Technical Notes' "New `@computed` properties" bullet put
`sparkEnabled` / `fireLineEnabled` / `helitackEnabled` on the
`BottomBar` component as class getters (because they compose
`SimulationModel` predicates with `ui.interaction`, and `ui` is a
separate store). The previous External-Review HIGH resolution affirmed
the split design but the non-functional bullet wasn't updated to
match — leaving a Phase-2 reader two reasonable interpretations.

**Resolution**: Rewrote the non-functional bullet to name the split
explicitly: pure-simulation predicates (`setupEnabled`, `startEnabled`,
`reloadEnabled`, `restartEnabled`) plus the building blocks
(`simulationEnded`, `setupChanged`) live on `SimulationModel` as
`@computed`; the three cross-store predicates (`sparkEnabled`,
`fireLineEnabled`, `helitackEnabled`) live on `BottomBar` as class
getters. The "no predicate computed ad-hoc inline in JSX" rule is
preserved. Considered (and rejected) moving the cross-store predicates
into a dedicated controller store — three getters don't justify a new
store class.

---

### QA Engineer

#### RESOLVED [MEDIUM]: Cypress smoke audit misread test isolation
The prior audit table in the RESOLVED "Should existing Cypress and
Hazbot-ruleset tests be updated…" block treated `smoke.cy.ts` as a
single linear flow and claimed the Restart click at line 110 happens
"during Running". But `smoke.cy.ts` has a `beforeEach` `cy.visit()` at
[smoke.cy.ts:11-14](../../cypress/e2e/smoke.cy.ts#L11-L14), and the
Restart click lives in a separate `it` block at
[smoke.cy.ts:109-112](../../cypress/e2e/smoke.cy.ts#L109-L112) — so
Restart actually fires from a freshly-loaded Default state, where the
new rules disable it. The audit's "✓ Restart enabled during Running"
row was factually wrong, and its conclusion "Smoke flow should pass
unchanged" was right *for the wrong reason*.

Re-verified runtime behavior: Cypress's `{ force: true }` bypasses
actionability checks (visibility, scroll, occlusion) but does **not**
bypass the native HTML `disabled` attribute — a synthesized click on a
disabled button no-ops silently. The line-111 / line-112 assertions
still pass because they describe the unchanged Default state ("Start"
label and 0-hour model time are both correct in Default). So the suite
remains green, but the Restart `it` is now **vestigial** — it no longer
exercises Restart at all.

Considered patching `smoke.cy.ts` in this ticket (combine the two `it`
blocks so Restart fires in Running) but rejected to preserve the
existing scope decision in the same RESOLVED block ("No proactive
Cypress or Hazbot-ruleset rewrites are needed").

**Resolution**: Rewrote the Cypress audit table to (a) call out the
`beforeEach` / separate-`it` isolation, (b) show the correct pre-state
column for each click, (c) flag the line-110 Restart click as a silent
no-op against a disabled button, and (d) note that line-111 / line-112
assertions still pass because they describe the unchanged Default
state — not because Restart did anything. Added a Phase-2 follow-up
note that restoring meaningful Restart coverage requires combining
the `it` blocks or seeding state in the "restarts mode" test — out
of scope here, but pre-diagnosed for a future Cypress-pass ticket.

---

#### RESOLVED [MEDIUM]: `log-events.test.tsx` omitted from Files-likely-to-change, breaks under `reloadEnabled` rule
The "fires with reason 'SimulationReloaded' before reload" test at
[log-events.test.tsx:57-76](../../src/components/log-events.test.tsx#L57-L76)
sets `simulationStarted = true` only — no spark, no `setupChanged` — and
clicks the BottomBar Reload button. Under the new
`reloadEnabled = setupChanged || sparks.length > 0` rule, Reload is
disabled in that state. Unlike Cypress's `force: true` (which bypasses
actionability but not `disabled`), Jest + `@testing-library/user-event`
respects the `disabled` attribute and the click no-ops. The test's
`endedIdx >= 0` and `reason === "SimulationReloaded"` assertions then
fail. The Files-likely-to-change list named `bottom-bar.test.tsx` and
`simulation.test.ts` but omitted `log-events.test.tsx`, so a Phase-2
implementer following the file list would have shipped a broken test
suite.

Audited the rest of the file. Tests 1 (Restart, lines 27-55), 3 (TopBar
reload, lines 78-96), and 4 (Stop, lines 98-120) all survive: test 1's
`simulationStarted = true` puts the sim in Running/Paused so Restart is
enabled; test 3 uses a top-bar button outside the state machine; test 4
already seeds `sparks` and `simulationRunning`. Only test 2 needs a
fixture update.

**Resolution**: Added a `log-events.test.tsx` bullet to
Files-likely-to-change naming the one test that breaks (test 2,
"fires with reason 'SimulationReloaded' before reload" at lines 57-76),
the specific failure mode (`userEvent.click` no-ops against the
disabled Reload button), and the minimal fixture patch
(`stores.simulation.sparks.push(new Vector2(50000, 50000))` before the
click, mirroring test 4's existing pattern at line 102). Also
enumerated tests 1, 3, and 4 as confirmed-unaffected so a Phase-2
reviewer doesn't re-audit them.

---
