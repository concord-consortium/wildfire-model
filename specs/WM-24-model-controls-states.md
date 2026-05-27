# Bottom-Bar Controls: State Machine for Setup / Spark / Reload / Restart / Start

**Jira**: https://concord-consortium.atlassian.net/browse/WM-24

**Status**: **Closed**

## Overview

Rewrite the enable/disable rules for the bottom-bar control buttons so they reflect the
true lifecycle of the simulation (default → setup changed → spark placed → running →
ended → restarted). Prior to this ticket several buttons (Reload, Restart, post-run
Start, post-run Fireline / Helitack) were enabled or disabled at the wrong times
relative to the desired pedagogy.

The bottom-bar buttons (Setup, Spark, Reload, Restart, Start/Stop, Fire Line, Helitack)
are the student's primary controls for running the Wildfire Model. The Hazbot
behavior-based help-overlay epic (AP-80) assumes those buttons only light up when the
intended action makes sense at that point in the lifecycle. Aligning the controls with
the lifecycle (a) makes the help text match what the student actually sees, and (b)
lets the controls themselves teach the workflow.

## Requirements

The bottom-bar controls follow this state machine. "Authored" means the preset / URL
config has `fireLineAvailable === true` (resp. `helitackAvailable === true`).

1. **Default** (preset loaded, nothing changed, no spark placed, sim not started):
   - Enabled: **Setup**, **Spark**.
   - Disabled: **Reload**, **Restart**, **Start**, **Fire Line**, **Helitack**.
   - **Preset caveat**: a few dev/test presets (`basic`, `basicWithWind`,
     `slope45deg`, `basicWithSlopeAndWind`) ship with a pre-placed spark, so on
     load they effectively start in state 3 (SparkPlaced) rather than state 1.
     All curriculum-facing presets have empty `sparks` so this only affects
     developer environments.

2. **Setup changed** (user clicked **Create** on the wizard and at least one of
   `zonesCount`, any zone's `terrainType` / `vegetation` / `droughtLevel`,
   `windSpeed`, or `windDirection` differs from the wizard-open snapshot):
   - Reload becomes **enabled**.
   - All other rules from the current sub-state still apply.
   - The diff is against the wizard-open snapshot, *not* against the preset
     default — reverting customizations via Create still leaves
     `setupChanged === true` (acceptable wart; Reload then becomes a harmless
     no-op).

3. **Spark placed** (at least one spark exists on the model, sim not yet started):
   - **Start** becomes enabled.
   - **Spark** stays enabled iff `remainingSparks > 0` AND the user is not
     already in placement mode (`ui.interaction !== Interaction.PlaceSpark`).
   - **Reload** becomes enabled (sparks placed counts as "something material happened").

4. **Running or Paused** (`simulationStarted && !engine?.fireDidStop`):
   - The Start/Stop button label is **Stop** while `simulationRunning === true`
     (engine ticking) and **Start** while `simulationRunning === false` (user
     paused via Stop). The button stays **enabled** either way so the user can
     pause or resume.
   - **Restart** is enabled.
   - **Setup** and **Spark** are disabled.
   - **Fire Line** is enabled iff authored AND `canAddFireLineMarker` (cooldown
     elapsed, fewer than 2 markers committed) AND
     `ui.interaction !== Interaction.DrawFireLine`.
   - **Helitack** is enabled iff authored AND `canUseHelitack` (cooldown
     elapsed) AND `ui.interaction !== Interaction.Helitack`.

5. **Ended — fire finished naturally** (`simulationStarted && !simulationRunning &&
   engine?.fireDidStop`). User-pressed Stop does **not** enter this state:
   - Start/Stop button shows **Start**, **disabled**.
   - **Restart** stays enabled.
   - **Setup** and **Spark** stay disabled.
   - **Fire Line** and **Helitack** are **disabled** (regardless of whether
     they were used during the run).

6. **Restarted** (Restart button pressed from Running, Paused, or Ended):
   - **Restart** is now disabled.
   - **Start** is enabled (sparks still exist).
   - **Setup** is enabled.
   - **Spark** is enabled iff `remainingSparks > 0`.
   - Previously placed sparks remain on the model and can be moved.
   - **Fire Line** and **Helitack** are disabled.
   - Any placed Fire Line markers are cleared from the model.
   - **`ui.interaction` is reset to `null`**, abandoning any in-progress
     `DrawFireLine` / `Helitack` interaction.
   - Reload's enabled state follows the same global rule
     (`setupChanged || sparks.length > 0`); since Restart preserves both
     `setupChanged` and placed sparks, Reload is enabled after any Restart that
     follows a run.

7. **Reload pressed** (from any state):
   - Returns to Default. User-placed fire lines, user-placed sparks, and custom
     setup are all cleared. The preset is re-applied; `setupChanged` resets to
     false.
   - **`ui.interaction` is reset to `null`**, abandoning any in-progress
     `PlaceSpark` / `DrawFireLine` / `Helitack` interaction.

### Non-functional requirements

- The state machine is encoded as `@computed` properties on `SimulationModel`
  for the pure-simulation predicates (`setupEnabled`, `startEnabled`,
  `reloadEnabled`, `restartEnabled`, plus the `simulationEnded` and
  `setupChanged` building blocks), and as component-class getters on `BottomBar`
  for the three predicates that compose simulation state with `ui.interaction`
  (`sparkEnabled`, `fireLineEnabled`, `helitackEnabled`). No predicate is
  computed ad-hoc inline in the button JSX.
- The Reload predicate (`setupChanged || sparks.length > 0`) has explicit
  edge-case tests in `simulation.test.ts` (true/false × `setupChanged` × `sparks`).
- The `setupChanged` lifecycle has explicit tests confirming `restart()` does
  NOT reset it and `reload()` DOES reset it.
- The `ui.interaction` reset on Reload / Restart has explicit tests:
  Reload-during-PlaceSpark and Restart-during-DrawFireLine.
- A "Drag-to-move spark survives Restart" test calls `setSpark(idx, x, y)`
  after Restart and asserts the new coords stick.
- The Fire Line / Helitack authoring gate has explicit tests asserting the
  buttons stay disabled in state 4 regardless of any other condition when the
  `config.*Available` flag is false.
- The `simulationEnded` computed has direct value-tests in `simulation.test.ts`
  covering each state of its truth table, plus an observer-level reactivity
  test (via `mobx.reaction`).
- The Paused vs. Ended distinction has explicit tests covering all four exit
  paths from Paused: resume (Start), let-finish (Ended), Restart, Reload.
- The `setupChanged` snapshot-diff has eight cases in `terrain-panel.test.tsx`:
  (a) no-change Create, (b) change drought + Create (diff-before-mutate canary),
  (c) change and revert + Create, (d) change + X-close, (e) seeded true + no-change
  Create, (f) change wind speed + Create, (g) change zones count + Create,
  (h) snapshot refresh on re-open canary.

## Technical Notes

### New state on `SimulationModel`

- **`setupChanged: boolean`** (observable). Set true by the wizard's
  `applyAndClose` iff the user clicks Create and the diff between the
  wizard-open snapshot and local wizard state is non-empty for any of
  `zonesCount`, per-zone `terrainType` / `vegetation` / `droughtLevel`,
  `windSpeed`, or `windDirection`. Reset to false by `reload()`.
- **No "used" state needed** for Fire Line / Helitack; Ended-state behavior
  collapses to "always disabled" so the existing
  `lastFireLineTimestamp` / `lastHelitackTimestamp` observables do not need
  to be promoted to button-state inputs.
- **No new log events needed**. Each Create press already emits
  `TerrainPanelSettingsSaved`; Fire Line and Helitack usage are already
  logged with payloads.

### New `@computed` properties

- `simulationEnded`: `simulationStarted && !simulationRunning &&
  !!engine?.fireDidStop`. **Reactivity contract**: `simulationRunning` carries
  the dependency edge; `engine?.fireDidStop` is a discriminator read only.
  Future refactorers must not rely on `fireDidStop` driving reactivity
  directly. (A documentation comment to this effect lives on the `fireDidStop`
  field itself in `fire-engine.ts`.)
- On `SimulationModel`: `setupEnabled`, `startEnabled`, `reloadEnabled`,
  `restartEnabled` — pure-simulation predicates.
- On `BottomBar` (component-class getters): `sparkEnabled`, `fireLineEnabled`,
  `helitackEnabled` — compose a simulation-only predicate with the
  `ui.interaction !== Interaction.X` guard.

### Snapshot capture in the wizard

- Captured via `useRef<ISetupSnapshot | null>` (not `useState` — avoids a wasted
  re-render).
- Written in a `useEffect` that fires when `ui.showTerrainUI` flips to `true`
  (opposite polarity from the existing close-time reset effect).
- Diff computed in `applyAndClose` **before** the `simulation.*` mutators run.
  Computing the diff post-mutate would always see an empty diff (silently
  disabling the entire Reload-on-customization feature).
- Helpers extracted to `src/components/setup-snapshot.ts` so wind-direction
  coverage can land in a synthetic-snapshot unit test (`WindDial` is a custom
  SVG with no `<input>` element to drive in the DOM-level test).

### Visual styling

- Disabled visual treatment per Zeplin: text + icon at `opacity: 0.35`
  (content only, not the whole button); button background stays at full
  opacity; 9px border-radius; `filter: grayscale(1)` on the button.
- Implementation gotcha (discovered post-merge during sighted-user check): MUI
  v5's emotion-generated `:disabled` rule applies `opacity: 0.25` to the whole
  Button, which compounds with the spec's `0.35` content opacity to give an
  effective ~0.09 — disabled icons render nearly invisible against the
  near-white bottom bar. Override with `opacity: 1 !important` on
  `&:disabled, &.Mui-disabled` so the spec's content opacity is the only fade
  applied.

## Out of Scope

- Visual redesign of the buttons themselves (icons, colors, layout). Only the
  enabled / disabled rules change.
- The Hazbot button and the Fullscreen toggle (always enabled per the ticket).
- The top bar, About dialog, and the help-overlay system itself (AP-80 is the
  parent epic but is not implemented here).
- The setup wizard's internal flow — only the side-effect of "user changed
  something in setup" is in scope.
- **Renaming "Stop" to "Pause"** — semantically the button is a Pause, but the
  rename was deferred to a future sprint per the designer.
- **Screen-reader and keyboard-only perception of disabled buttons** — MUI's
  `disabled` prop removes the element from the tab order and the transition
  isn't announced. A future a11y pass might switch to `aria-disabled` with
  per-button click guards; designing that mitigation is deferred.
- **Tooltip / hint on disabled buttons** — the parent epic AP-80
  (Hazbot help-overlay) is the system that explains *why* a control is
  unavailable at any given moment. This ticket provides the visual state
  machine that Hazbot rulesets reference.
- **Focus re-targeting when a focused button becomes disabled mid-action** —
  browser default (move focus to `document.body`) is acceptable; custom focus
  management deferred.

## Not Yet Implemented

The following items were identified during the spec process but explicitly
deferred — none have follow-up Jira tickets filed:

- **"Stop" → "Pause" button rename** — designer (Michael Tirenin) deferred to
  a future sprint. No follow-up ticket filed.
- **Meaningful Restart coverage in `smoke.cy.ts`** — the existing `it` block
  was diagnosed as vestigial (fires Restart against a disabled button in
  Default state and silently no-ops). Restoring meaningful coverage requires
  combining `it` blocks or seeding state. Out of scope here; pre-diagnosed for
  a future Cypress-pass ticket.
- **Mid-interaction Reload/Restart Phase-2 sanity check** — instruction in the
  spec: if mid-interaction Reload/Restart triggers a phantom click handler or
  crash, file a follow-up rather than expand this ticket. (Partially mitigated
  by the `ui.interaction = null` reset added during External Review pass 2.)
- **Screen-reader / keyboard a11y mitigation for disabled buttons** — a future
  a11y pass might switch to `aria-disabled` with click-guards. Deferred.
- **Custom focus re-targeting when a focused button becomes disabled
  mid-action** — explicitly deferred; disorientation risk judged low because
  trigger paths put focus on controls that stay present (Start → Stop).
- **Enforcing the `simulationEnded` reactivity contract** — making
  `FireEngine.fireDidStop` private was rejected as scope creep. Worth a
  follow-up ticket if the team wants the contract enforced rather than
  documented.
- **Promoting Cypress `Window` augmentation to shared
  `cypress/support/index.d.ts`** — kept inline because there is currently only
  one Cypress consumer. Lift to a shared types file when a second consumer
  appears.
- **Zeplin-driven visual-regression pass for disabled-state styling** — Step 7
  of the implementation plan (Cypress smoke spec) asserts only the HTML
  `disabled` attribute, not opacity / grayscale. A computed-style assertion or
  screenshot-diff pass would close the styling-regression gap end-to-end.

## Decisions

### Requirements decisions

#### What counts as "Setup changed"?

**Context**: Requirement 2 enables Reload when "Setup is changed"; needed a
crisp definition.

**Decision**: Snapshot-on-open, diff-on-Create. `setupChanged` flips true only
when Create is clicked and at least one of `zonesCount`, per-zone
`terrainType`/`vegetation`/`droughtLevel`, `windSpeed`, or `windDirection`
differs from the wizard-open snapshot. X-close is a no-op; `reload()` resets it.
Known acceptable wart: a wizard-driven revert to preset defaults still leaves
`setupChanged === true`.

---

#### After Restart, should Reload be enabled?

**Context**: Requirement 6 lists what Restart does but is silent on Reload's
state. After Restart we're back to a pre-run state, but customizations and
placed sparks are preserved.

**Options considered**:
- A) Reload follows the global rule everywhere, including post-Restart.
- B) Special-case Reload off after Restart.

**Decision**: Option A. `restart()` does not reset `setupChanged`; Reload
follows the global predicate (`setupChanged || sparks.length > 0`), so
post-Restart Reload is enabled because sparks are preserved.

---

#### After a run ends, should Reload be enabled?

**Context**: Requirement 5 doesn't say whether Reload is enabled after the run.

**Options considered**:
- A) Reload off.
- B) Reload on.
- C) Broaden the global Reload rule.

**Decision**: Option C. Reload is enabled iff
`setupChanged || sparks.length > 0` everywhere, no special-case for Ended.
Reload has a real effect even when `setupChanged === false` (it clears placed
sparks; Restart keeps them).

---

#### What does "Fire Line / Helitack was used" mean exactly?

**Context**: Original requirement said "If Fire Line was enabled and not used,
it is disabled after the run." Needed a definition.

**Options considered**:
- A) Add new "used" observables.
- A') Reuse the existing `lastFireLineTimestamp` / `lastHelitackTimestamp`.

**Decision**: A'. Use `lastFireLineTimestamp !== -Infinity` and
`lastHelitackTimestamp !== -Infinity`. Lone uncommitted markers and unclicked
placements do not count as "used". Subsequently collapsed entirely
(decision: "Req 5 keeps used Fire Line / Helitack enabled post-run"), making
the used-state non-load-bearing.

---

#### After Stop is pressed mid-run, do the same end-state rules apply as when fire stops naturally?

**Context**: Requirement 5 is labeled "After run" but doesn't distinguish
user-pressed Stop from engine-detected `fireDidStop`. The current code treats
Stop as a pause; refactoring to make Stop terminal would break the Fire Line
workflow (which pauses the sim for marker placement).

**Options considered**:
- A) Stop is a pause; only `fireDidStop` is terminal.
- B) Stop is terminal; refactor Fire Line pause mechanism (~4-5 source files
  plus tests).
- C) Remove the Stop affordance entirely.

**Decision**: Option A, confirmed by designer (Michael Tirenin). "Ended" =
`simulationStarted && !simulationRunning && engine?.fireDidStop`. User-pressed
Stop produces a Paused sub-state (Start re-enables to resume). Renaming Stop
to Pause is acknowledged but deferred.

---

#### Visual specifications for disabled / enabled / hover states

**Context**: The Zeplin artboard depicts each of the 7 lifecycle states.
Existing IconButton CSS used `opacity: 0.5` on the whole button.

**Decision**: Text label and icon at `opacity: 0.35` (content only via
`> span`); button background stays at full opacity; white `#FFFFFF`
background, 9px border-radius; no custom focus/hover variants;
`filter: grayscale(1)` on the button. Implementation post-merge: also override
MUI's `:disabled` opacity to neutralize compounding.

---

#### Should existing Cypress and Hazbot-ruleset tests be updated as part of this ticket?

**Context**: Tightening enable/disable rules might break tests that interact
with the bottom bar.

**Options considered**:
- A) Update proactively.
- B) Out of scope with CI verification.

**Decision**: Option B. No proactive Cypress or Hazbot-ruleset rewrites; verify
existing suites pass in CI. The existing Restart click in `smoke.cy.ts` was
diagnosed as silently no-op'ing against a disabled button — left as-is, flagged
for a future Cypress-pass ticket.

---

#### Reload and Restart button styling when disabled

**Context**: Reload/Restart are MUI `<Button>`s, not `IconButton`s. They had
no disabled-state CSS.

**Decision**: Match the IconButton disabled treatment (0.35 content fade,
full-opacity background, grayscale filter). Implementation choice between
scoped CSS on `<Button>` vs. converting to IconButton deferred to the Phase 2
plan; later chose scoped CSS to preserve horizontal layout.

---

### Implementation decisions

#### Wind / zonesCount test ergonomics for terrain-panel test cases (f) and (g)

**Context**: `WindDial` (wind direction) is a custom SVG with no `<input>` to
drive with `fireEvent.change`; `ZonesCountSelector` is an MUI `<RadioGroup>`.
The drought-slider pattern (`getByTestId(...).querySelector("input")` +
`fireEvent.change`) doesn't apply directly.

**Decision**: Pivot case (f) to wind **speed** (which has a real `<Slider>`).
Extract `setupSnapshotDiffers` into a new `setup-snapshot.ts` module with unit
tests covering wind direction synthetically. Case (g) targets MUI's
auto-rendered radio inputs by `value` attribute.

---

#### Reload/Restart disabled styling — scoped CSS vs. convert to IconButton

**Context**: Reload/Restart currently render as horizontal `<Button>`s;
IconButton renders vertically (icon above label). Either could be the
disabled-styling target.

**Options considered**:
- A) Keep as `<Button>`, add scoped `.playbackButton:disabled` rule.
- B) Convert to IconButton.
- C) Extract shared SCSS mixin.

**Decision**: Option A. Conversion would force a visual redesign (vertical
layout) that is explicitly Out of Scope. The mixin route adds plumbing for
marginal benefit (rule appears in only two places).

---

#### Step 5 size and split — one commit or two?

**Context**: The bottom-bar rewire + test rewrite + log-events fixture patch
is ~400 lines. Splitting would let reviewers approve source separately, but
existing tests assert "Restart and Reload always enabled" — splitting source
from tests would leave the suite red between commits.

**Decision**: Single commit. The only path that keeps CI green between
commits.

---

#### Should the implementation include a small Cypress smoke step for the new disabled-state transitions?

**Context**: Out-of-scope decision in requirements.md left Cypress rewrites
out, but a thin browser-level test would catch CSS / reactivity / build
regressions Jest cannot.

**Options considered**:
- A) Out of scope.
- B) One `it` added to `smoke.cy.ts`.
- C) Dedicated `bottom-bar-state-machine.cy.ts` covering all seven states.

**Decision**: Option C. Net addition rather than rewrite of existing files;
single-purpose file reviewers can extend or delete independently.

---

#### Interaction-dependent computeds cannot all live on `SimulationModel` (External Review)

**Context**: Earlier draft put `sparkEnabled`, `fireLineEnabled`,
`helitackEnabled` on `SimulationModel`, but those predicates need
`ui.interaction` which lives on the `ui` store — would couple
`SimulationModel` to UI state.

**Decision**: Split per-button getters by store. `setupEnabled`,
`startEnabled`, `reloadEnabled`, `restartEnabled` live on `SimulationModel` as
`@computed`; `sparkEnabled`, `fireLineEnabled`, `helitackEnabled` live on
`BottomBar` as component-class getters that compose a simulation-only
predicate with `ui.interaction !== Interaction.X`.

---

#### `simulationEnded` computed depends on a non-observable (`engine?.fireDidStop`)

**Context**: `engine` is not `@observable` and `FireEngine.fireDidStop` is a
plain field, so the computed's reactivity is carried entirely by
`simulationRunning`.

**Options considered**:
- A) Document the reactivity contract explicitly.
- B) Promote `engine` to `@observable`.
- C) Add a dedicated `@observable simulationEndedReason` flag.

**Decision**: Option A. Document that `simulationRunning` carries reactivity
and `engine?.fireDidStop` is a discriminator-only read. Cross-reference
comment added to the `fireDidStop` field itself in `fire-engine.ts`.

---

#### Diff timing in `applyAndClose` not specified

**Context**: A naïve diff that reads from `simulation.*` to compute the diff
after the `setWindSpeed`/`setWindDirection`/`updateZones` mutators run would
always see an empty diff, silently disabling the entire Reload-on-customization
feature.

**Decision**: Mandate snapshot-on-open and diff-before-mutate in the
Technical Notes. Test case (b) (change drought + Create) annotated as the
canary for the ordering.

---

#### Snapshot storage shape (`useRef` vs `useState`)

**Context**: The wizard's snapshot is read at Create time and never displayed.

**Decision**: `useRef` (not `useState`). The snapshot doesn't drive any
visible UI, so re-rendering on snapshot updates would be pure waste.

---

#### Reload/Restart "from any state" contradicted preserved `ui.interaction` (External Review pass 2)

**Context**: The pass-3 explicit `Interaction.PlaceSpark` guard on
`sparkEnabled` made the previously Out-of-Scope "preserve `ui.interaction`"
decision reachable as a bug: SetupChanged → click Spark → click Reload lands
in Default with stale `ui.interaction === PlaceSpark`, leaving Spark disabled
and violating Requirement 1.

**Decision**: Add `ui.interaction = null` to both `handleReload` and
`handleRestart`. Two new tests added (Reload-during-PlaceSpark and
Restart-during-DrawFireLine).

---

#### `setSetupChanged` setter shape

**Context**: The setter accepts a boolean. Production calls pass `true`;
`reload()` writes the field directly; a snapshot-refresh canary test passes
`false`. Reads as slightly asymmetric.

**Options considered**:
- A) Keep symmetric setter, document call sites.
- B) Split into `markSetupChanged()` and `clearSetupChanged()`.

**Decision**: Option A. Three well-understood callers; doubling the method
count would be premature factoring. Setter comment updated to document the
three call sites symmetrically.

---

#### Cypress type augmentation pulled decorated MobX source into TS check (External Review pass 2)

**Context**: First-pass solution declared
`window.sim: import("../../src/models/simulation").SimulationModel` in the
Cypress spec. But `cypress/tsconfig.json` doesn't enable
`experimentalDecorators`, and `simulation.ts` uses `@observable` /
`@action` / `@computed` — `tsc -p cypress/tsconfig.json --noEmit` would fail
with TS1219.

**Decision**: Replace with a local structural `SimLike` interface covering
only the fields the spec reads. Avoid enabling `experimentalDecorators` in
the Cypress tsconfig (broader scope; would affect every Cypress test).

---

#### `mockEngine` helper return type — `Partial<FireEngine>` vs `Pick<...>`

**Context**: The test helper centralizes the FireEngine fake. Initial draft
used `Partial<FireEngine>`, which makes every field optional and wouldn't
catch a new BottomBar engine read at helper level.

**Decision**: Use narrow `Pick<FireEngine, "fireDidStop" | "burnedCellsInZone">`.
Catches upstream rename of either field; doesn't catch new consumer reads at
the cast site (`(simulation as any).engine = mockEngine()` erases). Two
documented escape hatches if that protection ever becomes needed.

---

#### Cypress forced-end ordering breaks `simulationEnded` (External Review)

**Context**: The state-5 Cypress shortcut originally set
`simulationRunning = false` *before* `engine.fireDidStop = true`. Because
`fireDidStop` is non-observable and `simulationEnded`'s only observable
dependency is `simulationRunning`, the computed would lock in `false` at the
`simulationRunning` edge while `fireDidStop` was still `false`.

**Decision**: Reverse the order — set `fireDidStop = true` first, then flip
`simulationRunning = false`. The order is load-bearing for the documented
reactivity contract.

---

#### `log-events.test.tsx` test 6 becomes vacuous under new rules

**Context**: "does NOT fire SimulationEnded on restart when simulation was
never started" tests the Default-state Restart click. Under the new
`restartEnabled = simulationStarted` rule, Restart is disabled in Default;
`userEvent.click` is a no-op; both assertions trivially hold.

**Options considered**:
- A) Delete the test.
- B) Restructure to a different code path.

**Decision**: Option A. The state-1 matrix in `bottom-bar.test.tsx` asserts
`restart-button` disabled in Default, subsuming the coverage at the matrix
level. The handler-internal guard stays as defensive code.

---

#### State 7 (AfterReload) Jest test is structurally identical to State 1

**Context**: `seedState(7)` no-ops to Default-equivalent state without
exercising the `reload()` codepath. Test would pass even if `reload()` broke.

**Options considered**:
- A) Delete the state-7 matrix slot.
- B) Rewrite to actually click Reload.

**Decision**: Option A. AfterReload coverage now lives in the Paused → Reload
and Running → Reload edge tests, which click the real button and assert
Default-equivalent post-state.

---

#### Step 2 reactivity test relies on undocumented jsdom rAF semantics

**Context**: The reactivity test schedules a real `requestAnimationFrame` via
`sim.start()` before setting up the `reaction()` observer. Brittle to any
`await` slipped between them (would yield to the rAF callback).

**Decision**: Add inline comment naming the rAF/jsdom ordering dependency and
the escape hatch (replace `start()` with manual engine setup if an `await` is
unavoidable). Subsequently trimmed to a hygiene-rule one-liner after
verification showed the "silent degradation" mechanism was speculative.

---

#### Missing test — snapshot refresh on wizard re-open after a Create (case h)

**Context**: Cases (a)-(g) all exercise the wizard on its *first* open. None
tested the load-bearing "snapshot refreshes when the wizard closes and
reopens" path. A broken implementation that captured the snapshot only on
first mount would pass (a)-(g) but produce subtly broken `setupChanged`
semantics in the second-open path.

**Decision**: Add test case (h): change drought + Create, manually reset
`setupChanged` to false, reopen wizard, no field change, Create — assert
`setupChanged` stays false. Loud failure if the snapshot doesn't refresh.

---

#### Step 6 sighted-user check accounts for `grayscale(1)` + `opacity: 0.35` compounding

**Context**: Compounding grayscale with low opacity over a near-white
background lands close to "barely present" — closer than 0.35 opacity on
color icons alone would suggest.

**Decision**: Require the sighted-user check in both standard rendering and
at least one low-vision simulation (Chrome DevTools "Emulate vision
deficiencies"). If either rendering looks insufficient, flag the designer
(Michael Tirenin) before merging rather than silently raising the opacity.
(Post-merge: a real MUI compounding issue surfaced during this check — the
spec's escalation path triggered correctly and produced a follow-up fix.)
