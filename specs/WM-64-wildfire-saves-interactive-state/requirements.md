# Wildfire saves interactive state

**Jira**: https://concord-consortium.atlassian.net/browse/WM-64
**Repo**: https://github.com/concord-consortium/wildfire-model
**Implementation Spec**: [implementation.md](implementation.md)
**Status**: **In Development**

## Overview

Wildfire forgets everything when the page reloads, so a teacher or researcher reviewing a student's work cannot see what the student ran. This story makes the model save each run's setup, outcome and burn map as its interactive state, and draw that run again, read-only, when a report view loads it, so the teacher report's interactive state history can show a student's runs one by one.

## Project Owner Overview

Researchers want a realistic, AI-assisted evaluation of how students use the wildfire model, and that needs more than the event log: it needs the runs themselves. The Activity Player already keeps a history of an interactive's saved states, and the researcher dashboard already receives Wildfire's logs and state, but Wildfire has never saved any state for them to receive.

After this story, each time a run ends Wildfire saves the zones, wind, sparks, fire lines and helitack drops the student used, the burn results already sent to the logs, and a compact map of what burned. When a teacher or researcher scrubs through the student's history in the report, each saved state draws that run's map and graph read-only. A student who comes back to the activity starts fresh, as today: restoring into the student's own, editable model is left for later. A saved state is about 17 to 19 KB, well within the storage limits.

## Background

The ticket asks for four things. Two already exist and need no work (Doug, 2026-09-28): the route that delivers Wildfire's logs and state to the researcher analysis dashboard, and the Activity Player's interactive state history, turned on per activity or sequence by `save_interactive_state_history`. The remaining two are this story: saving the settings of the variables, and saving the burn state when the sim has been run.

The analysis doc ([Saving Wildfire state costs about 2 KB per run](https://docs.google.com/document/d/12_qAb7vBLO3yo959sApbLF_DLRunLigGa3qm7Afu40w)) measured the cost in the running app: about 2 KB of JSON for the starting values plus the final burn summary, both reusing payloads the model already builds for `SimulationStarted` and `SimulationEnded`; a fixed 12.8 KB for a per-cell fire-state map packed at 2 bits per cell; and 120 to 200 KB for per-cell ignition times, which is too heavy. It recommends keeping only the latest run in the state and letting history hold the earlier ones. Doug decided (2026-09-28) that **the burn map is in the state**, since scrubbing back through history to see different runs is the point of the story, and then that **the model restores a saved run only in report mode** (see Open Questions, "Restore only in read-only views").

Today the model saves nothing. Its only use of `@concord-consortium/lara-interactive-api` (1.13.0) is `log` (`src/log.ts`); there is no `setInteractiveState`, `getInitInteractiveMessage` or `localStorage`, and every page load starts from the URL parameters and preset (`SimulationModel.load` in `src/models/simulation.ts`).

**How the Activity Player stores it** (checked against `activity-player` `origin/master`, 2026-09-03). A saved state becomes the interactive's answer document, `sources/{key}/answers/{answerId}`, with the state JSON-encoded inside its `report_state` string (`embeddable-utils.ts`, `getAnswerWithMetadata`). With history on, **every `setInteractiveState` call** gets a fresh history id (`managed-interactive.tsx`, `nanoid()` after each save) and `createOrUpdateAnswer` (`firebase-db.ts`) writes, in one batch, the answer, a small `interactive_state_histories` entry (`state_type: "full"`) and a full copy of the answer in `interactive_state_history_states/{historyId}`. So each state and each history entry is one Firestore document, subject to Firestore's 1 MiB document limit, and the Activity Player has no size check: an oversize save would fail the whole batch. History gets one entry per save, not per run, which is why the save timing below matters.

**Saving needs learner state enabled on the embeddable.** The Activity Player keeps an interactive's state only when `isQuestion(embeddable, { ignoreHideQuestionNumber: true })` holds (`managed-interactive.tsx`, `shouldWatchAnswer`; `page-walk.ts`), which requires `enable_learner_state` on the `MwInteractive` or in the library interactive's data. Without it every save is dropped silently on both sides. Turning it on also makes Wildfire a question in the activity: it is numbered unless `hide_question_number` is set, and it counts as answered once a run is saved. So an activity needs both `enable_learner_state` on the Wildfire embeddable and `save_interactive_state_history` on the activity or sequence; this story changes neither, and whoever authors the activities has to set them.

**How history is viewed.** portal-report's dashboard scrubs through history (`interactive-state-history-range-input.tsx`) and loads each state into the interactive's iframe (`iframe-answer.tsx`, `interactive-iframe`), posting `initInteractive` with the saved `report_state` (`mode: "report"`, `interactiveState` parsed). So Wildfire must draw a saved run in report mode. The key of that iframe includes the answer's state version, so each history step remounts it and the model loads afresh for every entry. With no state, portal-report posts no `initInteractive` at all (`interactive-iframe.js`, `connect()` returns early), so the model never learns it is in report mode. That view is an ordinary, clickable iframe loading the same URL as the Activity Player (only portal-report's compact thumbnails set `pointer-events: none`), so today the whole model, Hazbot included, would be live there; report mode has to make it read-only.

**What a drawn run needs.** The map rendering (`src/components/view-3d/terrain.tsx`) reads more per cell than the three fire states: `isFireSurvivor` (a burnt forest cell that survived draws in its terrain color, not burnt), `helitackDropCount` (lowers the cell's drought level, the green splotch) and `isFireLine` (lowers the cell's elevation). Fire lines rebuild deterministically from the saved built segments (`buildFireLine`), and helitack drops from their drop points (`setHelitackPoint`), so only the fire state and the survivor flag need a per-cell map, and the 2-bit map's spare fourth value carries "burnt, survived". The graph samples each zone once per simulated hour (`graph.tsx`, `chartStore.rawBurnData`), and the `SimulationEnded` outcome's per-zone `burnRates` are the differences between those samples. Rebuilding the graph from the rates would assume exactly one hour between samples, which a fast run need not keep, so the samples themselves are saved (a few KB). The graph's fire-line and helitack markers are chart annotations added by effects in `graph.tsx` at the hour the line was built or the drop made, ordered by the model's action order; replaying the interventions cannot reproduce them, so they are saved too. Town markers draw only their names, so the towns burned are in the saved outcome but nothing on the map shows them.

## Requirements

- **R1 (what is saved).** When a run ends, the model saves its latest run as the interactive state: a **format version**; the **setup** (each zone's vegetation, terrain type and drought level; wind speed and direction (the student's setting, not a scheduled wind change); spark positions; **the fire-line segments built during the run** (each built line's two endpoints, recorded as it is built, since the markers are consumed when a line is built); **helitack drop points and times**; the speed setting); the run's **`SimulationEnded` outcome** payload as logged (duration, per-zone burn percentage, acres, hourly burn rates, maximum burn rate, towns burned); the graph's **hourly burn samples** per zone (`[hour, acres]` pairs, in thousands of acres to 4 decimals); the graph's **fire-line and helitack markers** (hour, kind and action order of each); the **per-cell burn map**, 2 bits per cell (unburnt, burning, burnt, burnt-and-survived) packed and base64-encoded; and enough **identity to check a state still fits the model it is loaded into, and to tell an analyst which model produced it** (the preset name, grid width and height, zone count, and the app version from `package.json`).
- **R2 (when).** A save happens once per ended run, on each of the four routes that log `SimulationEnded` today: the fire burning out (`ByItself`), Restart, Clear All and the top bar's reload button. It does not happen on setup edits, spark placement, pauses, ticks or the student leaving the page, since each save is a history entry and history should record runs only. A run that is started but never ended (paused and abandoned, or the tab closed) is not saved. **Each run is saved at most once**: after the fire burns out, the Restart, Clear All and reload routes log a second `SimulationEnded` for the same run, and those do not save again. The reload button logs `SimulationEnded` even when no run was started; that saves nothing.
- **R3 (latest run only).** The state holds only the latest run, never a list: the history holds the earlier ones.
- **R4 (delivery).** Every save is sent to the Activity Player at once, not after the API's debounce: `setInteractiveState` records the state immediately but posts it only after 2 s, so an iframe reload or tab close in that window would lose the run, and a reload inside it also raises the API's "State has not been saved" leave-page prompt. (An in-app page change is safe either way: the Activity Player asks for the state on the way out, and the API answers with the recorded one.) In particular a save triggered by the top bar's reload button reaches the Activity Player before the page reloads (the model reloads 100ms after logging today).
- **R5 (no restore in runtime).** In runtime mode (the Activity Player, where the student works) the model never applies a saved state: it loads as it does today whatever state the Activity Player sends, and keeps saving under R2.
- **R6 (report mode).** In report mode (portal-report's history scrubbing and answer view), with a saved state that fits (R1's identity check), the model shows that run as it ended: the zones, wind and speed applied; sparks and fire lines placed; the map drawn with burnt, surviving, burning (as the fire stood when the run ended) and helitack cells; the time display at the run's duration; the graph redrawn with its fire-line and helitack markers. It is read-only: no Start, Restart, spark (placing or dragging), fire-line, helitack, speed, Setup or Clear All actions, no top-bar reload, no Hazbot, and no saves. The camera, the graph panel and the pure view controls (the Vegetation Key switch, fullscreen, and the top bar's Share and About) stay usable, since none of them changes the run. Each history entry draws its own run.
- **R7 (a mismatch).** portal-report sends no init message without a saved state (see Background), so report mode always arrives with one. A saved state that fails the identity check (for example, the activity's URL now points at a different preset or grid; the zone count is compared only when `zonesCount` fixes it, from the preset or a `zonesCount` URL parameter, since when nothing does, as on the `default` preset, the Setup wizard lets the student pick 2 or 3) **or is malformed** (an unknown format version, a burn map of the wrong length, values out of range) is ignored: the model shows its fresh state, and the reason is written to the browser console (report mode's log messages go nowhere, see R10). The state arrives from the parent window and is treated as untrusted data.
- **R8 (outside the Activity Player).** Run standalone (not in an iframe), the model behaves exactly as today: no save, no restore, and no wait for an init message that will never come.
- **R9 (size).** A saved state is at most about 20 KB at the default 240 x 160 grid (measured components: setup and outcome about 2 KB, the burn map 12,800 bytes, the graph samples 2 to 4 KB for a 50-hour, 3-zone run, helitack drops, fire-line segments and graph markers a few bytes each). It stays far below Firestore's 1 MiB document limit even for a long run.
- **R10 (logging).** No new log events. Saving is triggered by a `SimulationEnded` that is already logged, and restoring happens only in report mode, where portal-report does not listen for log messages.

## Technical Notes

**Files touched in the app.**
- `src/components/bottom-bar.tsx` (Restart, Clear All), `src/components/app.tsx` (the fire burning out) and `src/components/top-bar/top-bar.tsx` (reload) are the four `SimulationEnded` sites and therefore the save points. They all build the same outcome with `simulation.getOutcomeData(chartStore)`. Restart and Clear All log whenever `simulationStarted` is set and the reload button logs unconditionally, none of them checking `simulationEndedLogged`, which is why R2 guards the save rather than the log.
- `src/models/simulation.ts`: the setup lives in `zones`, `wind`, `sparks`, `fireLineMarkers` and `speedIndex`; `buildStartReadingData()` already builds normalized spark and marker positions; `setHelitackPoint(px, py)` mutates cells and does not record the drop, so the drop points need recording to be saved.
- `src/models/cell.ts`: `FireState` is `Unburnt = 0, Burning = 1, Burnt = 2`, which leaves 3 for burnt-and-survived in a 2-bit code.
- `src/components/graph.tsx` / `ChartStore.rawBurnData`: hourly per-zone samples `{ time, acres }`, the source of the outcome's `burnRates`.
- `src/log.ts`: the existing `lara-interactive-api` import site.

**Measured on current master** (2026-09-28, `hillThreeZone`, one spark per zone, a helitack drop at hour 10, fastest speed): the run lasted 53.5 simulated hours, burned 1,791 of 38,400 cells, ended with no burning cells, and the one helitack drop changed 80 cells. The 2-bit map with the survivor value packed to exactly 12,800 base64 bytes, as the analysis doc predicted. The drop touching 80 cells is why drops are saved as points and replayed, not as a per-cell count map.

**Interactive API available** (1.13.0): `getInitInteractiveMessage`, `getMode`, `setInteractiveState`, `setInteractiveStateTimeout`, `flushStateUpdates`, `setSupportedFeatures`, `inIframe`.

**A save and restore round trip, run for real** (2026-09-28, throwaway code in the running app, `mountainTwoZone`): a run with a fire line added after a pause and a helitack drop mid-run, recorded as fire-line segments, drop points and the 2-bit map, then restored into a freshly loaded page by rebuilding the segments (`buildFireLine`), replaying the drops (`setHelitackPoint`) and applying the map last. **0 of 38,400 cells differed** in fire state, survivor flag, helitack count or fire-line flag. The same run ended with `fireLineMarkers` empty although it had built a 101-cell fire line, which is why R1 saves built segments rather than markers. The map goes last because a helitack replay resets burning cells in its radius; overlapping drops add, and the replay reproduces the counts.

**A restored run needs its own ended flag.** `simulationEnded` is `simulationStarted && !simulationRunning && !!engine?.fireDidStop`, and a restored run has no engine, so the implementation must mark a restored run ended without building one.

**Accepted limitation: custom zone layouts.** `updateZones` resets `zoneIndex` to the default division, so restoring a run on a legacy preset with its own `zoneIndex` (`basic*`, `complexZones`, `zonesFromImage`) that was made without opening Setup draws the default layout. No activity preset has one.

**Save ordering matters on three routes.** Restart and Clear All reset the cells right after logging `SimulationEnded`, and the reload button reloads the page 100ms later, so the state has to be captured before the reset, the same point where the outcome is computed.

## Out of Scope

- The route to the researcher analysis dashboard and the Activity Player's history (both exist; see Background).
- Per-cell ignition times, spread rates and burn times (too heavy for history; not needed to draw an ended run).
- Saving or restoring the camera pose, the graph panel's open state, the Vegetation Key switch or Hazbot's feedback levels.
- **Restoring into the student's editable model in the Activity Player** (decided 2026-09-28; the saved format already holds what that would need, so it can be added later as wiring).
- Resuming a run mid-burn: a restored run is always in its ended state.
- Authored state: the model is still configured by URL parameters.

## Open Questions

### RESOLVED: Judgment call: one save per ended run, not on every change
**Context**: `setInteractiveState` can be called whenever anything changes, and the API debounces it, but each call that lands is a full history entry.
**Options considered**:
- A) Save once per ended run.
- B) Save on every setup change and at run end.

**Decision**: **A.** B would fill a student's history with half-finished setups between runs, and the story's use of history is to scrub between runs. The setup of each run is in its saved state anyway.

### RESOLVED: Judgment call: replay helitack drops and fire lines rather than storing their cells
**Context**: Both change many cells (80 for one measured helitack drop). Storing per-cell counts or flags would add a second map.
**Options considered**:
- A) Save the drop points and built fire-line segments and rebuild their cells on restore with the existing code paths.
- B) Save per-cell helitack counts and fire-line flags.

**Decision**: **A.** The existing `buildFireLine` and `setHelitackPoint` already turn those inputs into cells deterministically, the inputs are a few bytes each, and they are the setup a researcher wants to see anyway.

### RESOLVED: Hazbot after a restore
**Context**: Hazbot classifies the student from the session's event log, which starts empty on every page load. A restored run has no readings behind it, so a returning student's first Hazbot click treats them as not having run the model (category 1, `NOT ranSimulation`), with their last run on screen.
**Options considered**:
- A) Leave Hazbot starting fresh, as it does after any reload today.
- B) Feed the restored run's setup and outcome to Hazbot as readings, so it classifies as if the run had just happened.
- C) Save and restore Hazbot's own state (its readings or factor variables).

**Decision**: **Moot: restores happen only in report mode, where Hazbot is hidden** (Doug, 2026-09-28; see "Restore only in read-only views" below). Measured for the record, in case runtime restore is added later: Hazbot's readings grew about 3.8 KB per run in a real session (2.9 KB after one run, 22.5 KB after six, `plainsTwoZone`, one pause per run), and every history entry would carry them all, so C would dominate the state within a few dozen runs; B costs nothing extra but forgets earlier runs.

### RESOLVED: Restore only in read-only views
**Context**: Restoring into the student's own model raised the Hazbot mismatch above, and a restored run's Restart, Clear All and reload would have logged a zero-burn `SimulationEnded` and saved it as a new history entry, which needed guards. The use the story needs, scrubbing a student's runs, happens entirely in portal-report's report mode.
**Options considered**:
- A) Restore in report mode only; the Activity Player loads fresh as today.
- B) Restore in both, with Hazbot fed from the restored run (B above) or its saved readings (C above).

**Decision**: **A** (Doug, 2026-09-28). It removes the Hazbot question and the restored-run logging guards, keeps the student's experience exactly as today, and can be extended later without changing the saved format.

### RESOLVED: Low confidence: a run ended by Restart or Clear All mid-burn
**Context**: Those routes can end a run with cells still burning. The burn map records them as burning, but a restored run is ended, and without ignition times the renderer cannot show how far each burning cell had got.
**Options considered**:
- A) Draw them as burning (the fire as it stood when the student stopped it).
- B) Draw them as burnt.

**Decision**: **A.** It is the fire as the student left it, and the renderer already handles it: in the textured path a burning cell's char progress `(time - ignitionTime) / burnTime` is `-Infinity` with no ignition time and clamps to 0, so it draws as flame on uncharred ground, and the vertex-color path uses `BURNING_COLOR` (`terrain.tsx`, `updateBurnState` and the vertex color function). One limitation, accepted: with `showBurnIndex` on, a restored burning cell shows the Low tier, because its spread rate is not saved.

### RESOLVED: Low confidence: Clear All saves the run it clears
**Context**: Clear All logs `SimulationEnded` for a started run and then resets everything. Under R2 it saves that run, so the history's latest entry is the run the student cleared rather than a clean model.
**Options considered**:
- A) Accept it: the save records the run.
- B) Also save an empty state after Clear All, so the next load is clean (one more history entry per Clear All).

**Decision**: **A.** The save is a true record of a run the student made, which is what the history is for, and B would put an empty entry in the history for every Clear All, the kind of noise R2 exists to avoid. (Since the Activity Player never restores, R5, the student does not see it either way.)

## Self-Review

Roles: Senior Engineer, QA Engineer, Education Researcher, Teacher, Student, Security Engineer, WCAG Accessibility Expert. Each item was checked against the code (this repo, `activity-player` and `portal-report`) before being written up; the Teacher, Student and WCAG passes found nothing that survived checking, since report mode adds no new controls and restore reuses the existing ended state.

### Education Researcher

#### RESOLVED: A saved state did not say which model produced it
History entries are read on their own, without the session's logs beside them, and R1 carried only the grid size. The identity now includes the preset name and the app version (`package.json`, 1.6.0 today), so an analyst can tell states from different model versions apart. Corrected in R1.

#### RESOLVED: A run the student paused and left is never saved
R2 saves only on the four `SimulationEnded` routes, so a run paused and abandoned leaves no state. The Activity Player does ask interactives for their state on an in-app page change (`app.tsx`, `requestInteractiveStates({ unloading: true })`, answered through the API's `setOnUnload`), so such a run could be saved there, but not on a tab close, refresh or browser back. **Decided (Doug, 2026-09-28): record ended runs only**, so neither that hook nor a save on pause is used; R2 says so.

### Senior Engineer

#### RESOLVED: The identity check could accept a state drawn on different terrain
Grid size and zone count match across presets, so a state saved under one preset could be drawn over another's terrain after an author changed the activity URL. The preset name is now part of the identity (R1, R7). Terrain overridden by individual URL parameters within one preset is not caught, which is accepted: that is an authoring change to a live activity.

### Security Engineer

#### RESOLVED: Saved state from the parent window was trusted as-is
`initInteractive` delivers whatever was stored, from the Activity Player or from portal-report. Decoding a burn map of the wrong length, or zone values outside the enums, would throw or corrupt the model. R7 now requires a malformed state to be ignored like a mismatched one, with the reason logged.

### QA Engineer

#### RESOLVED: A burned-out run was saved twice
Restart, Clear All and the reload button log `SimulationEnded` again after a burn-out, and the reload button logs one with no run at all (both measured in Jest on 2026-09-29). Saving at every log would put the usual burn out, then Restart flow into history twice, or once with the wrong end reason when the two land within the API's 2 s debounce. R2 now saves each run at most once and never for an unrun model.

#### RESOLVED: A debounced save could be lost
The API holds a state for 2 s and a newer call replaces it, so a student leaving the page right after a run would lose it. R4 now sends every save at once.

#### RESOLVED: Report-mode logging goes nowhere
portal-report's interactive iframe listens for `getFirebaseJWT`, `height` and `getAttachmentUrl` only (`interactive-iframe`), so anything the model logs in report mode is dropped. With restores confined to report mode, R10 now adds no restore event, and R7's mismatch reason goes to the browser console instead.

### Round 2 (requirements re-review after the implementation review's changes)

Roles: QA Engineer, Senior Engineer, Teacher. The implementation review changed R4, R7 and Background; this pass rechecked those and the rest against the code. R4's leave-page prompt was confirmed in Playwright (a cross-origin iframe with a `beforeunload` handler that reloads itself after a click raised the prompt, 2026-09-29, throwaway pages since deleted). Two findings survived.

#### RESOLVED: R6 did not say whether the view-only controls stay usable
R6 listed the disabled actions and kept the camera and graph panel, but the Vegetation Key switch, fullscreen, Share and About are neither; a tester could not tell whether a live Vegetation Key in report mode was a defect. All four only change view state (`ui.showVegetationKey`, the fullscreen API, two dialogs). R6 now keeps them usable.

#### RESOLVED: R7 tied the zone-count check to the preset alone
`zonesCount` is also a URL parameter (`getUrlConfig` reads every default-config key, and `zonesCount` is one), so an activity can fix it without its preset doing so. R7 now says the count is compared whenever `zonesCount` is set, from either source.

