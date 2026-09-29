# Implementation Plan: Wildfire saves interactive state

**Jira**: https://concord-consortium.atlassian.net/browse/WM-64
**Requirements Spec**: [requirements.md](requirements.md)
**Status**: **In Development**

## Implementation Plan

### Record fire-line segments and helitack drops on the model

**Summary**: The model forgets both once they are applied: `applyFireLineMarkers` empties `fireLineMarkers`, and `setHelitackPoint` records only a timestamp. Both become lists on `SimulationModel` that a run's saved state can read and a restore can replay. Pure model change, independently testable.

**Files affected**:
- `src/models/simulation.ts`: `fireLineSegments` and `helitackDrops`, appended in `buildFireLine` and `setHelitackPoint`, cleared in `restart()`.
- `src/models/simulation.test.ts`: coverage for both lists.

**Estimated diff size**: ~70 lines

```ts
  // Every fire line built this run, as model-ft endpoints, and every helitack drop. The
  // markers themselves are consumed when a line is built, so these are what a saved run
  // replays.
  public fireLineSegments: Array<[number, number, number, number]> = [];
  public helitackDrops: Array<{ x: number; y: number; time: number }> = [];
```

`buildFireLine(start, end)` pushes `[start.x, start.y, end.x, end.y]` before building; `setHelitackPoint(px, py)` pushes `{ x: px, y: py, time: this.time }`; `restart()` assigns both a new empty array (and so do `reload()` and `load()`, which call it). Assigning rather than emptying in place matters: `setInteractiveState` deep-freezes whatever it is given, so a list that ever reached a saved state by reference could not be emptied or pushed to again, and although `buildSavedState` copies (next step), a fresh array keeps `restart()` safe regardless. Neither needs to be observable: nothing renders from them.

Tests: a line built from two markers leaves one segment and an empty `fireLineMarkers`; two drops leave two entries with their times; `restart()` clears both, and both accept a push after it even when the old arrays were frozen (`Object.freeze` in the test).

---

### The saved-state format

**Summary**: One module that turns the model into a saved run and back into a validated description of one, with no React, no stores and no interactive API, so every encoding decision is unit-tested in isolation. Delivers R1, R3, R7 and R9's content.

**Files affected**:
- `src/models/saved-state.ts` (new)
- `src/models/saved-state.test.ts` (new)

**Estimated diff size**: ~320 lines

```ts
export const SAVED_STATE_VERSION = 1;

export interface ISavedRunState {
  version: 1;
  identity: { preset: string; gridWidth: number; gridHeight: number; zonesCount: number; appVersion: string };
  setup: {
    zones: Array<{ vegetation: number; terrainType: number; droughtLevel: number }>;
    wind: { speed: number; direction: number };
    speedIndex: number;
    sparks: Array<[number, number]>;                         // model ft
    fireLineSegments: Array<[number, number, number, number]>;
    helitackDrops: Array<{ x: number; y: number; time: number }>;
  };
  time: number;                                              // minutes, the run's duration
  endReason: string;                                         // the SimulationEnded reason
  outcome: unknown;                                          // getOutcomeData(), as logged
  burnSamples: Array<Array<[number, number]>>;               // per zone, [hour, thousands of acres to 4 dp]
  annotations: Array<{ hour: number; kind: string; actionOrder: number }>; // the graph's fire-line and helitack markers
  burnMap: string;                                           // 2 bits per cell, base64
}
```

- `encodeBurnMap(cells)` / `decodeBurnMap(b64, cellCount)`: codes 0 unburnt, 1 burning, 2 burnt, 3 burnt-and-survived, four per byte, low bits first, base64 via `btoa`/`atob` over a binary string. Decoding rejects a string whose decoded length is not `ceil(cellCount / 4)`.
- `buildSavedState(simulation, chartStore, endReason)`: reads everything above, the annotations from `chartStore.chart.annotations` (`value`, `eventKind`, `actionOrder`); `outcome` is `simulation.getOutcomeData(chartStore)` so it is byte-for-byte what the log carries. Every array and object it takes from the model or the chart is copied (segments, drops, sparks, samples, annotations), because the API deep-freezes the state it stores. `appVersion` is `require("../../package.json").version`: `tsconfig.json` compiles to CommonJS, so a named `import { version }` becomes a `require` of the whole module and bundles all of `package.json` (measured: 4.6 KB, `devDependencies` included), while the direct member access is shaken down to the version string (measured: a 203-byte bundle).
- `validateSavedState(value, simulation)`: returns `{ ok: true, state }` or `{ ok: false, reason }` for a non-object, a version other than 1, an identity mismatch (preset, grid size, and the zone count only when `config.zonesCount` fixes it; otherwise 2 or 3 fits, since the Setup wizard lets the student pick), `setup.zones` or `burnSamples` not one entry per saved zone, zone values outside the `Vegetation` / `TerrainType` / `DroughtLevel` enums, a `speedIndex` outside `SPEEDS`, any spark, segment endpoint or drop point outside `0 <= x < modelWidth` and `0 <= y < modelHeight` (non-finite included), a drop time or `time` that is not a finite non-negative number, an annotation kind other than `FIRE_LINE_EVENT` / `HELITACK_EVENT`, or a burn map of the wrong length. The bounds check is load-bearing: `buildFireLine` and `setHelitackPoint` index `cells` unchecked, so a finite point past the grid throws mid-restore and a negative `x` lands on a cell in the previous row (both measured).

Tests: encode/decode round trip over every code at a non-multiple-of-4 cell count; `decodeBurnMap` rejects short and long input; `buildSavedState` on a model with a fire line and a drop carries both and an outcome equal to `getOutcomeData`; each `validateSavedState` rejection reason, including a point one cell past each edge; a state passed through the real, unmocked `setInteractiveState` leaves the model's lists writable; and the size of a built state for the default grid is under 20 KB (R9), asserted on `JSON.stringify(state).length`.

---

### Restoring a run into the model

**Summary**: Applies a validated saved run to the model and the graph so the run appears exactly as it ended, and marks it ended without an engine. Delivers R6's drawing.

**Files affected**:
- `src/models/saved-state.ts`: `applySavedState(simulation, chartStore, state): Promise<void>`.
- `src/models/simulation.ts`: `@observable restoredRunEnded`, folded into `simulationEnded`, cleared in `restart()`.
- `src/models/chart-store.ts`: `restoreBurnData(samples, annotations)` and an observable `restoreVersion`.
- `src/components/graph.tsx`: the dataset construction in `updateChartData` and `updateChartColors` moves into a helper that also builds a zone's dataset from its restored samples; the `Annotation` literal the two annotation effects build moves into `buildEventAnnotation(kind, hour, actionOrder)`, which owns each kind's `thickness` and `dashArray`, so a restored marker is built the way the live one was; an effect on `restoreVersion`, declared after the zones-count effect (which empties the datasets when the count changes, as a restore on a student-picked zone count can), rebuilds every dataset and adds the saved annotations through that helper; the `dataReady`, per-hour and both annotation effects skip while `simulation.restoredRunEnded` is set.
- `src/models/saved-state.test.ts`: restore tests.

**Estimated diff size**: ~320 lines

`applySavedState`, in order:
1. `simulation.updateZones(zones)` with `Zone`s built from the saved enums (which also resizes a model whose student picked a different zone count in Setup), then `await simulation.dataReadyPromise` (it repopulates the cells), then `restoredRunEnded = true`, so every graph effect below is already skipping.
2. Wind (`setWindSpeed`, `setWindDirection`), `setSpeedIndex`, and sparks (`sparks.length = 0`, then `addSpark` for each).
3. Each fire-line segment through `buildFireLine`, then each drop through `setHelitackPoint`, both with the model's `time` set to the drop's time so the recorded timestamps match.
4. The burn map last, since a drop resets burning cells in its radius: each cell's `fireState` and `isFireSurvivor` from its code.
5. `time`, `simulationStarted = true`, `simulationRunning = false`, then `updateCellsStateFlag()` and `updateCellsElevationFlag()`.
6. `chartStore.restoreBurnData(state.burnSamples, state.annotations)`.

Setting `time` in step 5 changes `timeInHours`, which fires the graph's per-hour effect after the next render, and that effect computes acres from `getZoneBurnPercentage`, which reads `engine.burnedCellsInZone` and so returns 0 with no engine. Unguarded, it would overwrite the restored final sample with 0 acres (the effect updates the last point in place when the hour matches). Two more effects would corrupt a restored graph. The `dataReady` effect calls `chartStore.clearData()`, which empties every dataset and the annotations, and it fires again after `updateZones` repopulates the cells, at a render that may fall after step 6. The two annotation effects fire on `lastFireLineTimestamp` and `lastHelitackTimestamp`, which the replay in step 3 changes, and would add one marker each at whatever hour is current. Hence the `restoredRunEnded` skip on all four, set in step 1 before anything they watch changes, and the saved annotations restored directly.

`simulationEnded` becomes `this.simulationStarted && !this.simulationRunning && (!!this.engine?.fireDidStop || this.restoredRunEnded)`, so a restored run reads as ended everywhere that derives from it (`startEnabled`, `runInProgress`); the reactivity-contract comment above `simulationEnded` is updated to match. `restart()` clears the flag so the model stays consistent if it is ever reset, though report mode offers no control that does.

The replay does not log: it calls the model methods, not the UI handlers that log `FireLineAdded` or `Helitack`. `setHelitackPoint` bumps `interventionCount`, which `restart()` resets, so nothing leaks into the next run.

Tests (Jest, on a model loaded with a test preset): a state built from a run with a fire line, a drop and burnt cells, applied to a freshly loaded model, reproduces every cell's `fireState`, `isFireSurvivor`, `helitackDropCount` and `isFireLine` (the round trip measured at 0 differing cells in the running app); `simulationEnded` is true and `startEnabled` false after restore and both flip after `restart()`; `restoreBurnData` leaves `rawBurnData` equal to the samples; a rendered `Graph` after a restore shows one dataset per zone with the saved points and the saved annotations, and they survive the following `dataReady` render.

---

### Save and restore through the Activity Player

**Summary**: Connects the format to `lara-interactive-api`: read the init message, restore only in report mode, save at the four run-end sites, flush before the reload button reloads, and stay inert standalone. Delivers R2, R4, R5, R6's entry point, R7 and R8.

**Files affected**:
- `src/interactive-state.ts` (new): `initInteractiveState(stores)`, `saveRun(stores, endReason)`, and `logSimulationEnded(stores, reason)`.
- `src/index.tsx`: calls `initInteractiveState(stores)`.
- `src/components/bottom-bar.tsx` (Restart, Clear All), `src/components/app.tsx` (burn-out), `src/components/top-bar/top-bar.tsx` (reload): each replaces its `SimulationEnded` block with `logSimulationEnded(stores, reason)`, before any reset.
- `src/models/ui.ts`: `@observable readOnly = false`.
- `src/interactive-state.test.ts` (new), with `@concord-consortium/lara-interactive-api` mocked.

**Estimated diff size**: ~290 lines

`initInteractiveState(stores)`:
- Returns immediately when `!inIframe()` (R8).
- `getInitInteractiveMessage()` then: in `"report"` mode sets `ui.readOnly = true` and, with an `interactiveState` (portal-report sends no init without one, so nothing may wait on the message), waits for `simulation.dataReadyPromise`, runs `validateSavedState`, and applies it when valid, writing the rejection reason to `console.warn` otherwise (R7; portal-report drops log messages, R10). In `"runtime"` mode it ignores the `interactiveState` entirely (R5).

`logSimulationEnded(stores, reason)` is the four sites' shared block: it reads `firstEnd = simulation.simulationStarted && !simulation.simulationEndedLogged` before touching anything, sets `simulationEndedLogged = true`, logs `SimulationEnded` with `getOutcomeData`, and calls `saveRun` when `firstEnd`. That test is exactly "this run's first end" with no new flag: `start()` clears `simulationEndedLogged`, so a burn-out reads it false and the Restart, Clear All or reload that follows reads it true; a Restart after a pause reads it false; a reload with no run reads `simulationStarted` false. Each site keeps its own condition for logging at all, so what is logged is unchanged: Restart and Clear All still call it only when `simulationStarted`, the reload button always, and the burn-out reaction only when `!simulationEndedLogged`.

`saveRun(stores, endReason)`: a no-op when `!inIframe()` or `ui.readOnly`; otherwise `setInteractiveState(buildSavedState(...))`, then `flushStateUpdates()` (synchronous) so the save does not sit in the API's 2 s debounce (R4). The top bar's reload handler keeps the existing 100ms before `window.location.reload()` as a floor for the log message.

Tests: standalone does nothing and never calls `getInitInteractiveMessage`; a runtime init with a valid saved state leaves the model fresh (R5) and still saves at the next run end; a report init with a valid state applies it and sets `readOnly`; a report init with an invalid one leaves the model fresh, warns with the reason, and still sets `readOnly`; report mode never saves; each of the four end routes calls `setInteractiveState` once with a state whose `endReason` matches, followed by `flushStateUpdates`; a burn-out followed by Restart, Clear All or reload saves once, with `endReason` `ByItself`; the reload button with no run started saves nothing; a Restart after a saved run leaves the next run saving again.

---

### Read-only report mode

**Summary**: R6's UI half: in report mode every control that changes the model is disabled and Hazbot is hidden, so a history entry can only be looked at.

**Files affected**:
- `src/components/bottom-bar.tsx`: every action button's `disabled`, and the `SpeedControl`'s, also checks `ui.readOnly`; the Hazbot button does not render.
- `src/components/view-3d/spark.tsx`: markers are not draggable when `ui.readOnly`. After a restore `simulationStarted` already locks them (`lockOnSimStart`), but the fresh view shown for an invalid state has not started.
- `src/components/view-3d/` interaction hooks (`use-place-spark-interaction.tsx`, `use-draw-fire-line-interaction.tsx`, `use-helitack-interaction.ts`): inert when `ui.readOnly`.
- `src/components/top-bar/top-bar.tsx`: the reload button is hidden.
- Tests beside each (`bottom-bar.test.tsx` and the interaction tests).

**Estimated diff size**: ~120 lines

The camera, the graph panel, the Vegetation Key switch, fullscreen, and the top bar's Share and About stay usable and need no change: each only alters the view, not the run.

## Open Questions

<!-- Implementation-focused questions only. Requirements questions go in requirements.md. -->

### RESOLVED: Judgment call: an ended flag rather than a stub engine
**Context**: `simulationEnded` needs `engine.fireDidStop`, and a restored run has no engine.
**Options considered**:
- A) A `restoredRunEnded` flag folded into `simulationEnded`.
- B) Construct a `FireEngine` for the restored cells and set `fireDidStop`.

**Decision**: **A.** B builds a real engine around cells it never ticks, and anything reading the engine (`burnedCellsInZone`, which `getOutcomeData` uses) would report the stub's zeros. The flag is one field, cleared where `simulationStarted` is.

### RESOLVED: Judgment call: zones saved as enum values, not labels
**Context**: The `SimulationStarted` log uses labels (`vegetationLabels` and so on).
**Options considered**:
- A) The numeric enum values.
- B) The labels.

**Decision**: **A.** Validation is a range check, and a label rename cannot orphan saved states. Analysts reading labels have them in the logs, and the outcome saved beside the setup is the logged payload.

### RESOLVED: Judgment call: save at the four logging sites rather than from a reaction
**Context**: A MobX reaction on `simulationEnded` would catch the burn-out route but not Restart or Clear All, which reset the model in the same handler that logs.
**Options considered**:
- A) Call `saveRun` beside each `SimulationEnded` log.
- B) One reaction plus special cases.

**Decision**: **A.** The four sites already compute the outcome at exactly the moment the state has to be captured, before any reset, and the Jest test asserts all four. Because three of those sites log again after a burn-out, the shared `logSimulationEnded` saves only on a run's first end, read from the existing `simulationEndedLogged` rather than a second flag.

## Self-Review

Roles: Senior Engineer, commit reviewer (does each step stand alone), test author (can each named test be written against the harness), and an education researcher reading the saved states and logs. Each item was checked against the current code before being written up.

### Senior Engineer

#### RESOLVED: The graph's per-hour effect would zero the restored final sample
`graph.tsx` updates the chart whenever `simulation.timeInHours` changes, computing acres from `getZoneBurnPercentage`, which reads `engine?.burnedCellsInZone` and is 0 with no engine. Setting the restored `time` fires that effect after the restore, and because the hour matches the last restored sample, `updateChartData` rewrites that sample in place with 0 acres. The effect now skips while `restoredRunEnded` is set. Corrected in the restore step.

#### RESOLVED: The graph's other effects would wipe or misplace a restored graph
The `dataReady` effect clears every dataset and annotation and re-fires after `updateZones`, and the annotation effects fire on the replayed timestamps at the current hour. All four now skip while `restoredRunEnded` is set, which step 1 sets first, and the annotations are saved and restored directly. Corrected in the format and restore steps.

### Education Researcher

#### RESOLVED: Restart or Clear All on a restored run would log and save a bogus run
All three handlers guard on `simulation.simulationStarted`, which a restored run sets, so each would have logged a `SimulationEnded` with an all-zero outcome (`getOutcomeData` on an engine-less model) and `saveRun` would have pushed it into history. **Superseded by the decision to restore only in report mode** (requirements, "Restore only in read-only views"): report mode renders none of those controls and never saves, so no guard is needed and none is planned.

### Commit reviewer

#### RESOLVED: The version source was left to "whichever exists"
The plan said `DefinePlugin` "if one is present, otherwise a JSON import". There is no `DefinePlugin` for the version in `webpack.config.js`, and `tsconfig.json` has `resolveJsonModule`, so the step now names the named JSON import. Corrected in place.

### Test author

No findings survived: `simulation.test.ts` already builds real models and awaits `dataReadyPromise`, which is what the restore tests need, and `lara-interactive-api` is a plain module that Jest can mock for the Activity Player step.


### Round 2

Roles: Senior Engineer, Security Engineer, Commit reviewer, Activity Player integrator, QA Engineer. Each item was checked against this repo, `lara-interactive-api` 1.13.0 as installed, and `activity-player` `origin/master`, and the ones marked "measured" were confirmed with throwaway Jest tests or a throwaway webpack build (2026-09-29), since deleted.

### Senior Engineer (round 2)

#### RESOLVED: The API deep-freezes the saved state, so any model array it references becomes read-only
`setInteractiveState` stores its argument through `ManagedState`'s `interactiveState` setter, which runs `deepFreeze` on it (measured: after one save, `Object.isFrozen` is true on a nested array, and `.length = 0` and `push` both throw `TypeError`). If `buildSavedState` puts `simulation.fireLineSegments` or `simulation.helitackDrops` into the state by reference, the next `restart()` (if it empties them with `.length = 0`, the idiom this file uses for `sparks` and `fireLineMarkers`) or the next run's first `push` throws. Suggested resolution: `buildSavedState` copies every array and object it takes from the model (segments, drops, sparks, samples, annotations), `restart()` assigns fresh arrays, and the format tests assert the model's lists are still writable after a save through the real `setInteractiveState`.

**Resolved**: `buildSavedState` copies everything it takes from the model and chart, `restart()` assigns fresh arrays, and tests cover a frozen-then-restarted list and a save through the real API. Applied in the first two steps.

### Security Engineer

#### RESOLVED: Validation checks coordinates for finiteness only, and finite out-of-grid values crash the replay
`validateSavedState` rejects non-finite coordinates, but `setHelitackPoint` and `buildFireLine` index `cells` without bounds checks. Measured on a 10 x 10 grid: a drop at `y` beyond the grid throws `Cannot read properties of undefined (reading 'x')`, a fire line ending beyond it throws `Cannot set properties of undefined (setting 'isFireLine')`, and a negative `x` silently lands on a cell in the previous row. The throw happens inside `applySavedState` after `updateZones` and `restoredRunEnded`, leaving a half-restored model. The same list also never checks that `setup.zones.length` equals `identity.zonesCount`, or that `burnSamples` has one entry per zone. Suggested resolution: validate every spark, segment endpoint and drop point to `0 <= x < modelWidth` and `0 <= y < modelHeight`, drop times and `time` to finite non-negative numbers, and the zones and samples lengths to the zone count, with a rejection test for each.

**Resolved**: validation bounds every point to the model, checks drop times and `time`, and checks the zones and samples lengths, with a one-cell-past-each-edge test. Applied in the format step.

### Commit reviewer (round 2)

#### RESOLVED: The named `package.json` import bundles the whole file
The format step says webpack 5 tree-shakes `import { version } from "../../package.json"`. It does not here: `tsconfig.json` has `"module": "commonjs"`, so ts-loader emits a `require` of the whole module. Measured with a throwaway production build using this repo's loader settings: the bundle carried all 4.6 KB of `package.json`, `devDependencies` included. Writing `require("../../package.json").version` (a direct member access, which webpack 5 does shake) produced a 203-byte bundle holding only `"1.6.0"`. Suggested resolution: use the direct `require(...).version` form (or a `DefinePlugin` constant) and correct the sentence in the format step.

**Resolved**: `appVersion` is `require("../../package.json").version`, with the measurement recorded in the format step.

### Senior Engineer (simplification)

#### RESOLVED: `runSaved` duplicates `simulationEndedLogged`
The four sites already share a once-per-run flag: `start()` clears `simulationEndedLogged`, and every `SimulationEnded` site sets it. "This is the run's first end" is exactly `simulationStarted && !simulationEndedLogged`, read before the site sets it: a burn-out sets it, so the Restart, Clear All or reload that follows reads it true; a Restart after a pause reads it false; a reload with no run reads `simulationStarted` false. A second flag with its own clear in `restart()` is a second source of truth for the same fact. Suggested resolution: drop `runSaved`, and have one helper (for example `logSimulationEnded(stores, reason)`) replace the four duplicated log blocks, computing the first-end test, setting the flag, logging and calling `saveRun` when it is the first end. The existing "burn-out then Restart saves once" tests carry over unchanged.

**Resolved**: `runSaved` is gone; `logSimulationEnded` replaces the four log blocks and saves on a run's first end. Applied in the Activity Player step and its judgment call.

#### RESOLVED: The restore builds the graph's annotations a second way
The live fire-line and helitack markers are built in two effects in `graph.tsx`, each with its own `thickness` and `dashArray` (`borderDash1` for fire lines, `borderDash2` for helitack). The restore step says it "adds the saved annotations" without saying how, which leaves a third construction of the same `Annotation` literal that can drift from the live one. Suggested resolution: a small `buildEventAnnotation(kind, hour, actionOrder)` in `graph.tsx` used by both live effects and the restore, so a restored marker is by construction the one the student saw.

**Resolved**: `buildEventAnnotation` in `graph.tsx` serves the live effects and the restore. Applied in the restore step.

### Activity Player integrator

#### RESOLVED: The Activity Player saves nothing unless the embeddable has learner state enabled
`managed-interactive.tsx` saves an interactive's state only when `shouldWatchAnswer`, which is `isQuestion(embeddable, { ignoreHideQuestionNumber: true })` (`page-walk.ts`), true only when `enable_learner_state` is set on the `MwInteractive` or in the library interactive's data. Otherwise every `setInteractiveState` is dropped, with no error either side. Turning it on also makes Wildfire a question in the activity: it gets a question number unless `hide_question_number` is set, and it counts as answered once a run has been saved. The requirements name `save_interactive_state_history` as the only switch. Suggested resolution: add the `enable_learner_state` precondition and its visible side effects to Background (and to the handoff for whoever authors the activities), and confirm whether the live Wildfire activities already have it.

**Resolved**: requirements Background now names both authoring flags and the question-numbering side effect. The authoring flag needs no action from this story (Doug, 2026-09-29).

### Senior Engineer (requirements)

#### RESOLVED: The zone-count identity check rejects valid states on a preset whose zone count the student picks
The Setup wizard opens on its zone-count panel whenever `config.zonesCount` is undefined (`terrain-panel.tsx`, `firstPanel`), which is the case for the `default` preset (the one used when the URL has no `preset`). A student there can run two zones on a model that loads with three, so R1's check of the saved zone count against the freshly loaded model's rejects a genuine run. Suggested resolution: compare the zone count only when `config.zonesCount` is set, and otherwise accept 2 or 3 (with `updateZones` resizing the model, and the graph's `restoreVersion` effect declared after its zones-count effect, which empties the datasets when the count changes). If no activity uses a preset without a fixed zone count, the alternative is to record that as an accepted limitation beside the custom-zone-layout one.

**Resolved**: the zone count is compared only when `config.zonesCount` fixes it (R7 and the validation list), `updateZones` resizes the model, and the `restoreVersion` effect is declared after the zones-count effect.

### QA Engineer

#### RESOLVED: R4 says a page change would lose a debounced save, but only a reload or tab close would
`setInteractiveState` writes `managedState.interactiveState` at once and only defers the post. On an in-app page change the Activity Player sends `getInteractiveState` with `unloading: true`, and the client answers with that already-updated state, so the run is kept. What the debounce loses is an iframe reload (the top bar's reload button) or a tab close, and a reload inside the window also triggers the client's "State has not been saved" `beforeunload` prompt, since the state is still dirty. The requirement stands; its rationale is off. Suggested resolution: reword R4's reason to the reload and tab-close cases and mention the prompt, which the immediate flush also avoids.

**Resolved**: R4's rationale now names the reload and tab-close cases and the leave-page prompt, and says why a page change is safe.
