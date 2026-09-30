# Wildfire saves interactive state

**Jira**: https://concord-consortium.atlassian.net/browse/WM-64

**Status**: **Closed**

## Overview

Wildfire forgot everything when the page reloaded, so a teacher or researcher reviewing a student's work could not see what the student ran. The model now saves each run's setup, outcome and burn map as its interactive state, and draws that run again, read-only, when a report view loads it, so the teacher report's interactive state history can show a student's runs one by one. A student who comes back to the activity starts fresh, as before: restoring into the student's own, editable model is left for later.

An activity needs two authoring flags for any of this to reach history, neither set by this story: `enable_learner_state` on the Wildfire embeddable (without it the Activity Player silently drops every save; with it Wildfire becomes a numbered question unless `hide_question_number` is set, and counts as answered once a run is saved) and `save_interactive_state_history` on the activity or sequence.

## Requirements

- **R1 (what is saved).** When a run ends, the model saves its latest run as the interactive state: a format version; the setup (each zone's vegetation, terrain type and drought level; wind speed and direction, the student's setting rather than a scheduled wind change; spark positions; the fire-line segments built during the run, recorded as each is built since the markers are consumed; helitack drop points and times; the speed setting); the run's `SimulationEnded` outcome payload as logged; the graph's hourly burn samples per zone (`[hour, acres]`, thousands of acres to 4 decimals); the graph's fire-line and helitack markers (hour, kind, action order); the per-cell burn map, 2 bits per cell (unburnt, burning, burnt, burnt-and-survived), packed and base64-encoded; and identity (preset name, grid width and height, zone count, app version from `package.json`).
- **R2 (when).** Once per ended run, on the four routes that log `SimulationEnded`: burn-out (`ByItself`), Restart, Clear All and the top bar's reload. Never on setup edits, spark placement, pauses, ticks or leaving the page; a run started but never ended is not saved. Each run is saved at most once: the Restart, Clear All or reload that follows a burn-out logs the same run again and does not save, and a reload with no run saves nothing.
- **R3 (latest run only).** The state holds only the latest run; history holds the earlier ones.
- **R4 (delivery).** Every save is sent at once rather than after the API's 2 s debounce, so an iframe reload or tab close cannot lose it and a reload does not raise the API's "State has not been saved" prompt. A save from the top bar's reload reaches the Activity Player before the page reloads.
- **R5 (no restore in runtime).** In runtime mode the model never applies a saved state, and keeps saving under R2.
- **R6 (report mode).** With a saved state that fits, the model shows that run as it ended: zones, wind and speed applied; sparks and fire lines placed; burnt, surviving, burning and helitack cells drawn; the time display at the run's duration; the graph redrawn with its markers. It is read-only: no Start, Restart, spark placing or dragging, fire line, helitack, speed, Setup, Clear All, top-bar reload, Hazbot or saves. The camera, graph panel, Vegetation Key switch, fullscreen, Share and About stay usable. Each history entry draws its own run.
- **R7 (a mismatch).** A state that fails the identity check (preset, grid, and the zone count only when `zonesCount` is fixed by the preset or URL; otherwise 2 or 3 fits) or is malformed is ignored: the model shows its fresh state and writes the reason to the browser console. The state is treated as untrusted data.
- **R8 (outside the Activity Player).** Standalone, the model behaves exactly as before: no save, no restore, no wait for an init message.
- **R9 (size).** At most about 20 KB at the default 240 x 160 grid (the burn map alone is 12,800 bytes), far below Firestore's 1 MiB document limit.
- **R10 (logging).** No new log events.

## Technical Notes

- **Where it lives.** `src/models/saved-state.ts` holds the format (`buildSavedState`, `validateSavedState`, `applySavedState`, `encodeBurnMap` / `decodeBurnMap`); `src/interactive-state.ts` connects it to `lara-interactive-api` (`initInteractiveState`, `saveRun`, `logSimulationEnded`); `ui.readOnly` is the report-mode flag the bottom bar, top bar, spark markers and map interactions read.
- **Once per run without a new flag.** `logSimulationEnded` replaces the four `SimulationEnded` blocks and saves when `simulationStarted && !simulationEndedLogged`, read before setting the flag. `start()` clears the flag, so that test is exactly "this run's first end". It must run before the caller resets the model.
- **The API deep-freezes what it stores.** `buildSavedState` copies everything it takes from the model and chart, `restart()` assigns fresh `fireLineSegments` / `helitackDrops` arrays, and `restoreBurnData` copies the saved samples before the graph mutates them.
- **Validation bounds every point.** `buildFireLine` and `setHelitackPoint` index `cells` unchecked, so a finite point past the grid throws mid-restore and a negative `x` lands in the previous row. Every spark, segment endpoint and drop must satisfy `0 <= x < modelWidth`, `0 <= y < modelHeight`. A state that passes validation but still throws while drawn resets the model to fresh, with a console warning.
- **Restore order.** `restoredRunEnded` is set first, so the graph's live effects already skip when `updateZones` flips `dataReady`; then zones (resizing the model if the student picked a different zone count), wind, speed and sparks; then fire lines and helitack drops, each drop at its saved time; the burn map last, because a drop puts out burning cells in its radius; then `time` and `simulationStarted`. A throwaway round trip in the running app differed in 0 of 38,400 cells.
- **Graph.** The `dataReady`, per-hour and both marker effects skip a restored run (otherwise they clear the graph, zero its last sample, or add markers for the replayed interventions). An effect on `ChartStore.restoreVersion`, declared after the zones-count effect, rebuilds the datasets and markers through the same helpers the live graph uses (`createZoneDataSet`, `buildEventAnnotation`).
- **Version string.** `require("../../package.json").version` with a local `require` declaration. Under CommonJS a named import bundles all of `package.json` (4.6 KB, `devDependencies` included); the member access shakes down to the version string alone.
- **Burn map packing** is arithmetic (`Math.floor`, `%`, powers of 4) rather than bit operators, since the repo lints with `no-bitwise`.
- **Accepted limitations.** Restoring on a legacy preset with its own `zoneIndex` (`basic*`, `complexZones`, `zonesFromImage`) draws the default zone layout, since `updateZones` resets it; no activity preset has one. With `showBurnIndex` on, a restored burning cell shows the Low tier, because spread rates are not saved. Terrain overridden by individual URL parameters within one preset is not caught by the identity check.

## Out of Scope

- The route to the researcher analysis dashboard and the Activity Player's history (both already existed).
- Per-cell ignition times, spread rates and burn times (120 to 200 KB, too heavy for history, not needed to draw an ended run).
- Saving or restoring the camera pose, the graph panel's open state, the Vegetation Key switch or Hazbot's feedback levels.
- Restoring into the student's editable model in the Activity Player. The saved format already holds what that would need, so it can be added later as wiring.
- Resuming a run mid-burn: a restored run is always in its ended state.
- Authored state: the model is still configured by URL parameters.

## Decisions

### Save on every change, or once per ended run?
**Context**: Each `setInteractiveState` that lands is a full history entry.
**Options considered**:
- A) Save once per ended run.
- B) Save on every setup change and at run end.

**Decision**: A. B would fill history with half-finished setups, and the point of history here is to scrub between runs.

---

### Store helitack and fire-line cells, or replay them?
**Context**: One measured helitack drop changed 80 cells; storing per-cell counts or flags would add a second map.
**Options considered**:
- A) Save drop points and built segments and rebuild their cells with the existing code paths.
- B) Save per-cell helitack counts and fire-line flags.

**Decision**: A. `buildFireLine` and `setHelitackPoint` are deterministic, the inputs are a few bytes, and they are the setup a researcher wants to see. Built segments are recorded rather than markers, because the markers are consumed when a line is built.

---

### Restore in report mode only, or also into the student's model?
**Context**: Restoring into the student's model raised a Hazbot mismatch (its readings start empty on every load, so a returning student would read as never having run the model) and needed guards so a restored run's Restart, Clear All and reload would not log and save a zero-burn run. Scrubbing a student's runs happens entirely in portal-report's report mode.
**Options considered**:
- A) Restore in report mode only.
- B) Restore in both, feeding Hazbot from the restored run or from its saved readings.

**Decision**: A (Doug, 2026-09-28). It makes the Hazbot question moot (Hazbot is hidden in report mode), needs no restored-run logging guards, and keeps the student's experience unchanged. For a later runtime restore: Hazbot's readings grew about 3.8 KB per run, so saving them would dominate the state within a few dozen runs.

---

### How to draw cells still burning when Restart or Clear All ended the run?
**Context**: Without ignition times the renderer cannot show how far a burning cell had got.
**Options considered**:
- A) Draw them as burning.
- B) Draw them as burnt.

**Decision**: A. It is the fire as the student left it, and the renderer already draws a burning cell with no ignition time as flame on uncharred ground.

---

### Should Clear All's save be followed by an empty state?
**Context**: Clear All saves the run it clears, so history's latest entry is that run rather than a clean model.
**Options considered**:
- A) Accept it.
- B) Also save an empty state after Clear All.

**Decision**: A. The save is a true record of a run, and B would add an empty history entry for every Clear All.

---

### Record paused-and-abandoned runs?
**Context**: The Activity Player asks for state on an in-app page change, so such a run could be saved there, but not on a tab close, refresh or back.
**Options considered**:
- A) Record ended runs only.
- B) Also save on pause or through the unload hook.

**Decision**: A (Doug, 2026-09-28).

---

### What identity does a saved state carry?
**Context**: Grid size and zone count match across presets, and history entries are read without the session's logs beside them.
**Options considered**:
- A) Grid size and zone count only.
- B) Add the preset name and the app version.

**Decision**: B. The preset catches a state drawn over another preset's terrain after an author changes the activity URL, and the version lets an analyst tell model versions apart.

---

### When is the zone count compared?
**Context**: On a preset without a fixed `zonesCount` (such as `default`) the Setup wizard lets the student pick 2 or 3, so comparing against the freshly loaded model would reject genuine runs. `zonesCount` can also be fixed by a URL parameter.
**Options considered**:
- A) Always compare against the loaded model.
- B) Compare only when `zonesCount` is fixed, from the preset or the URL; otherwise accept 2 or 3 and let the restore resize the model.

**Decision**: B.

---

### How is a burned-out run kept from saving twice?
**Context**: After a burn-out, Restart, Clear All and reload log `SimulationEnded` again, and reload logs one even with no run.
**Options considered**:
- A) A new `runSaved` flag.
- B) Read the existing `simulationEndedLogged` before setting it, in one shared `logSimulationEnded`.

**Decision**: B. A second flag would be a second source of truth for the same fact, and one helper replaces four duplicated log blocks.

---

### Where does the save happen?
**Context**: Restart and Clear All reset the model in the same handler that logs, and reload reloads the page 100 ms later.
**Options considered**:
- A) Beside each `SimulationEnded` log.
- B) One MobX reaction plus special cases.

**Decision**: A. A reaction on `simulationEnded` would miss Restart and Clear All; the log sites already compute the outcome at exactly the moment the state has to be captured.

---

### How does a restored run count as ended without an engine?
**Context**: `simulationEnded` needs `engine.fireDidStop`.
**Options considered**:
- A) A `restoredRunEnded` flag folded into `simulationEnded`, cleared in `restart()`.
- B) A stub `FireEngine` with `fireDidStop` set.

**Decision**: A. A stub engine would report zeros to anything reading it, such as `getOutcomeData`.

---

### Zones saved as enum values or labels?
**Context**: The `SimulationStarted` log uses labels.
**Options considered**:
- A) Numeric enum values.
- B) Labels.

**Decision**: A. Validation is a range check, and a label rename cannot orphan saved states.

---

### How are restored graph markers built?
**Context**: The live fire-line and helitack markers each had their own `Annotation` literal.
**Options considered**:
- A) Build restored markers separately.
- B) One `buildEventAnnotation(kind, hour, actionOrder)` used by the live effects and the restore.

**Decision**: B, so a restored marker is by construction the one the student saw.

---

### Which untrusted input does validation reject?
**Context**: The state comes from the parent window, and a wrong-length burn map, an out-of-range enum or an out-of-grid point would throw or corrupt the model mid-restore.
**Options considered**:
- A) Check types and finiteness only.
- B) Also bound every point to the model, check times, and check that zones and samples have one entry per zone.

**Decision**: B, with a malformed state ignored like a mismatched one and the reason written to the console, since portal-report drops log messages.
