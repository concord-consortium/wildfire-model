# Logged Events Reference

All events are logged via `@concord-consortium/lara-interactive-api` `log()` function.
Events are only sent when the simulation is embedded in LARA/Activity Player.

All model coordinates are in feet. Normalized coordinates (x, y) are relative to model width/height (0-1 range).

## Simulation Lifecycle

| Event | Parameters | When |
|-------|-----------|------|
| `SimulationStarted` | `{ preset, modelWidth, modelHeight, gridWidth, cellSize, gridHeight, elevation, unburntIslands, zoneIndex, maxTimeStep, modelDayInSeconds, windSpeed, windDirection, neighborsDist, minCellBurnTime, heightmapMaxElevation, tpiBands, tpiMarginFraction, tpiDebug, zonesCount, fillTerrainEdges, riverData, windScaleFactor, showModelDimensions, fireLineDelay, helitackDelay, maxFireLineLength, helitackDropRadius, showBurnIndex, showCoordsOnClick, unburntIslandProbability, fireSurvivalProbability, droughtIndexLocked, severeDroughtAvailable, riverColor, fireLineAvailable, helitackAvailable, forestWithSuppressionAvailable, changeWindOnDay, newWindDirection, newWindSpeed, logMonitor, sparks: [{ x, y, zoneIdx, tpi?: [number \| null] }], zones: [{ vegetation, terrainType, droughtLevel }], wind: { speed, direction, scaleFactor }, towns, fireLineMarkers: [{ x, y, elevation }] }` | User clicks Start. Large array fields (elevation, unburntIslands, zoneIndex) are logged as metadata strings or URLs, not raw data. Each spark's `tpi` is its multi-scale Topographic Position Index (one entry per `tpiBands` concentric band; negative = valley, positive = ridge/peak; `null` for a band with no usable cell; omitted for a spark on an excluded terrain-edge cell) — used by the Hazbot SparksAtTopAndBottom predicate. |
| `SimulationStopped` | `{ outcome: { durationMinutes, durationHours, zones: [{ zoneIndex, burnPercentage, burnedAcres, burnRates: [number], maxBurnRate, timeOfMaxBurnRate }], towns: [{ name, burned }] } }` | Simulation is stopped — either by user clicking Stop/Pause or by entering Fire Line mode. Includes outcome snapshot so data is available even if the student closes the browser without restarting. `burnRates` is an array of numbers (thousands of acres/hour) where index 0 = hour 1, index 1 = hour 2, etc. |
| `SimulationEnded` | `{ reason: "ByItself" \| "SimulationRestarted" \| "SimulationReloaded" \| "TopBarReloadButtonClicked", outcome: { durationMinutes, durationHours, zones: [{ zoneIndex, burnPercentage, burnedAcres, burnRates: [number], maxBurnRate, timeOfMaxBurnRate }], towns: [{ name, burned }] } }` | Fire burns out naturally, or user restarts/reloads. `burnRates` is an array of numbers (thousands of acres/hour) where index 0 = hour 1, index 1 = hour 2, etc. |
| `SimulationRestarted` | — | User clicks Restart (bottom bar) |
| `SimulationReloaded` | — | User clicks Reload (bottom bar) |
| `TopBarReloadButtonClicked` | — | User clicks Reload (top bar) |

## Mouse Interaction

| Event | Parameters | When |
|-------|-----------|------|
| `SimulationMouseEnter` | `{ clientX, clientY, percentX, percentY }` | Mouse enters the simulation container |
| `SimulationMouseLeave` | `{ clientX, clientY, percentX, percentY }` | Mouse leaves the simulation container |
| `SimulationClicked` | `{ hit3d, clientX, clientY, percentX, percentY, modelX?, modelY?, elevation? }` | Click within the 3D canvas. `hit3d: true` includes model coordinates when the terrain mesh is hit; `hit3d: false` for canvas clicks that miss the terrain (missed raycasts) |

## Fire Tools

| Event | Parameters | When |
|-------|-----------|------|
| `SparkButtonClicked` | — | User clicks Spark button |
| `SparkPlaced` | `{ x, y, elevation }` | User places a spark on the terrain |
| `FireLineButtonClicked` | — | User clicks Fire Line button to arm the tool. Not logged when the click cancels an already-armed tool, so this counts attempts rather than button presses; that click logs `FireLineCanceled` with `reason: "toggle"` instead. |
| `FireLineFirstEndPlaced` | `{ x, y, elevation }` | User clicks the first end of a fire line. The tool stays armed and a length-clamped preview follows the cursor until the second click. |
| `FireLineAdded` | `{ x1, y1, elevation1, x2, y2, elevation2 }` | User clicks the second end, completing the fire line. Records where the line was *first* drawn, not its final geometry: later endpoint drags log `FireLineUpdated`, and the line actually built into the terrain is `fireLineMarkers` in the `SimulationStarted` payload. |
| `FireLineCanceled` | `{ reason: "escape" \| "toggle" \| "toolSwitch" \| "start" \| "restart" \| "reload" \| "other", x?, y?, elevation? }` | User abandons a fire line before the second click, or disarms the tool without placing anything. `reason` names the route out: the Escape key, a second click on the Fire Line button, switching to Helitack, or pressing Start, Restart or Reload. Coordinates are the discarded first endpoint, omitted when the tool was armed but no end was placed. `"other"` is a backstop for a route with no explicit call site and should be read as a gap to investigate rather than an expected value. |
| `FireLineUpdated` | `{ x1, y1, elevation1, x2, y2, elevation2 }` | User drags a fire line endpoint |
| `HelitackButtonClicked` | — | User clicks Helitack button |
| `Helitack` | `{ x, y, elevation }` | User drops helitack on the terrain |

## Terrain & Settings

| Event | Parameters | When |
|-------|-----------|------|
| `TerrainPanelButtonClicked` | — | User opens/closes Terrain Setup |
| `TerrainPanelClosed` | — | User closes Terrain Setup via X button |
| `TerrainPanelSettingsSaved` | — | User clicks Create in Terrain Setup |
| `TerrainPanelZoneChanged` | `{ zone }` | User switches zone tab in Terrain Setup |
| `TerrainPanelNextButtonClicked` | — | User clicks Next in Terrain Setup |
| `TerrainPanelPreviousButtonClicked` | — | User clicks Previous in Terrain Setup |
| `ZoneUpdated` | `{ zone, terrain?, vegetation?, moisture? }` | User changes a zone property |
| `ZonesCountChanged` | `{ count }` | User changes number of zones |
| `ZoneButtonClicked` | `{ zone }` | User clicks a zone info button on the main view |
| `WindUpdated` | `{ angle, direction }` (direction change) or `{ speed }` (speed change) | User changes wind direction or speed in Terrain Setup |

## Graph

| Event | Parameters | When |
|-------|-----------|------|
| `ChartTabShown` | — | User opens the chart panel |
| `ChartTabHidden` | — | User closes the chart panel |
| `GraphDataRangeToggled` | `{ showAll }` | User toggles between Show All Data / Show Recent Data |

## Dialogs & UI

| Event | Parameters | When |
|-------|-----------|------|
| `ShareDialogOpened` | — | User opens Share dialog |
| `AboutDialogOpened` | — | User opens About dialog |
| `FullscreenEnabled` | — | User enters fullscreen mode |
| `FullscreenDisabled` | — | User exits fullscreen mode |

## Hazbot

| Event | Parameters | When |
|-------|-----------|------|
| `AnalysisEngineActivated` | `{ engineVersion: string, appRulesVersion: string \| number, ruleSetId: string, rangeCc: number }` | Once per page load, only when the Hazbot analysis engine is active (the URL provides `?hazbotRules=<id>` AND that id resolves to a known rule set AND load-time validation passes). Payload identifies the engine and rule-set version pair the session ran against. No `sessionId` in the payload — the engine surfaces its own session id via `engine.sessionId` for sidebar display only (per Req 20). `rangeCc` is the activity's derived window size: how many trailing canonical runs `categoryCurrent` is evaluated over. It is the disambiguator for a null `categoryCurrent` on `HazbotButtonClicked`, which has two causes that otherwise log identically: `rangeCc: 0` means the activity has no window at all (tab 24 is the only one today), and any positive value means the window matched no category. The value is derived from the rule set's expressions rather than authored, so it cannot be recovered after the fact. Sessions from `appRulesVersion` 6 onward carry it. |
| `HazbotButtonClicked` | `{ matchedCategory: number \| null, categoryUsed: number \| null, categoryCurrent: number \| null }` | User clicks the Hazbot Analysis button (rendered only on Hazbot-enabled pages with a loaded rule-set). **`matchedCategory` keeps its original meaning**: the monotone floor over the whole session, i.e. the best the student ever did. It is unchanged by `appRulesVersion` 6, so the series is comparable across the boundary. `categoryCurrent` is the highest category true at the end of the last `rangeCc` canonical runs, and `categoryUsed` is `categoryCurrent ?? matchedCategory`: the category the student was actually shown. All three carry `null` explicitly when nothing matches; `categoryCurrent` is additionally null when the activity has no window (see `rangeCc` on `AnalysisEngineActivated`). The click is a deliberate no-op inside the engine (unhandled in `translate.ts`), so it does not mutate the categories it reports (per WM-6). |
| `HazbotFeedbackShown` | `{ ruleSetId: string \| null, categoryId: number \| null, feedbackLevel: number, source: "level1" \| "round2" \| "round3" \| "category100" }` | The Hazbot popover actually opened, carrying the string it displayed. `feedbackLevel` is 1, 2 or 3, capped at how many strings the category carries. `source` names which string that is, which the level alone cannot: on a tab's top category, level 2 is the rule-set's category-100 repeat feedback rather than a Round 2 column. Emitted once per opened popover, never for a press that opened nothing. Deliberate engine no-op. See the two notes below the table. |
| `HazbotShowMeClicked` | `{ ruleSetId: string \| null, categoryId: number \| null, stepCount: number, feedbackLevel: number \| null }` | User activates the `[Show me]` button on a coaching category's intro popover, launching the visual-feedback walk-through (WM-17). `stepCount` is the number of steps in the launched tour. `feedbackLevel` is the level of the popover the student activated from: the tour can now be re-offered from level 2, and its content is the same walk-through either way, so this is what separates a first coaching from a repeat one. Like the other Hazbot events, a deliberate engine no-op (unhandled in `translate.ts`). See the `categoryId` note below the table. |
| `HazbotTourCompleted` | `{ ruleSetId: string \| null, categoryId: number \| null, lastStepIndex: number, feedbackLevel: number \| null }` | User finishes the walk-through via the terminal `[Got it!]` button (the tour engine's `onDestroyed` fires without a preceding cancel). `lastStepIndex` is the 0-based index of the last step shown. `feedbackLevel` is the level the tour was launched from. Deliberate engine no-op. See the `categoryId` note below the table. |
| `HazbotTourDismissed` | `{ ruleSetId: string \| null, categoryId: number \| null, lastStepIndex: number, feedbackLevel: number \| null }` | User closes or Escapes the walk-through before the end (the tour engine's `onCancelRequested` fires). `lastStepIndex` is the 0-based index of the step shown when dismissed. `feedbackLevel` is the level the tour was launched from. Deliberate engine no-op. See the `categoryId` note below the table. |

### `categoryId` on the tour events (`appRulesVersion` 6 onward)

On `HazbotShowMeClicked`, `HazbotTourCompleted` and `HazbotTourDismissed`, `categoryId` is
the category the feedback was selected from, i.e. `categoryUsed`, which **may differ from
`matchedCategory` in either direction**.

Lower is the common case and the point of the change: the student is coached on the run
they just made rather than on their best run. Higher is rare. It occurs only on tab 45,
only as 2 to 3, and never reaches a celebration category; it happens when a trailing window
makes a NOT-guarded lower category true that was false over the full session. A
`categoryId` above `matchedCategory` is documented behavior, not corrupt data.

Before `appRulesVersion` 6, `categoryId` on these three events was `matchedCategory`.

### `feedbackLevel` is not monotonic within a session (`appRulesVersion` 7 onward)

A category's level rises with each opened popover and is reset wholesale by two routes, so
a later `HazbotFeedbackShown` on the same `categoryId` can carry a *lower* `feedbackLevel`
than an earlier one. The routes are Clear All (which also logs `SimulationEnded` with
`reason: "SimulationReloaded"`) and ending the page session (`TopBarReloadButtonClicked`,
or any navigation, since the levels live in memory only). Restart does **not** reset them.
A drop with neither of those events before it is a new page session, not corrupt data.

### `HazbotButtonClicked` versus `HazbotFeedbackShown` (`appRulesVersion` 7 onward)

The two series answer different questions and are not interchangeable.

**Presses that opened no popover at all** are the gap between them: count
`HazbotButtonClicked` minus `HazbotFeedbackShown` over a session. This is one situation
only, a press while the popover is already open. The button has no disabled state and the
open flag is already true, so the press registers and displays nothing.

**Presses that showed the student nothing new** leave *no* gap, because a repeat click on an
exhausted category still opens a popover and still emits `HazbotFeedbackShown`. Find them as
consecutive `HazbotFeedbackShown` events on the same `categoryId` carrying the same
`feedbackLevel` and `source`. A fully populated category logs 1, 2, 3, 3, so the fourth click
is a silent repeat; on rule-sets 42, 45, 47 and 54, whose middle categories carry no level 2
or 3, the same category logs 1, 1, 1 across three clicks that all showed the same words.

**Presses that spent a level without the student taking the help** are the pairs of consecutive
`HazbotFeedbackShown` events on the same `categoryId` with **no** `HazbotShowMeClicked` between
them. The level advances whenever the popover opens, however it is dismissed, so a student who
closes a coaching popover with × or Escape has spent that level without seeing the walk-through.
This applies only to coaching categories, whose action token is `[Show me]`; on `[Okay]` and
`[Hooray!]` categories there is nothing to activate, so the absence means nothing.
