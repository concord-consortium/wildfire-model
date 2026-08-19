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
| `AnalysisEngineActivated` | `{ engineVersion: string, appRulesVersion: string \| number, ruleSetId: string }` | Once per page load, only when the Hazbot analysis engine is active (the URL provides `?hazbotRules=<id>` AND that id resolves to a known rule set AND load-time validation passes). Payload identifies the engine and rule-set version pair the session ran against. No `sessionId` in the payload — the engine surfaces its own session id via `engine.sessionId` for sidebar display only (per Req 20). |
| `HazbotButtonClicked` | `{ matchedCategory: number \| null }` | User clicks the Hazbot Analysis button (rendered only on Hazbot-enabled pages with a loaded rule-set). `matchedCategory` is the engine's matched category id at click time (read via the pure `computeMatchedCategoryForEngine`), carrying `null` explicitly when no category floor matches (e.g. a pre-run click whose lowest category does not fire on the empty-reading prefix). The click is a deliberate no-op inside the engine (unhandled in `translate.ts`), so it does not mutate the matched category it reports (per WM-6). |
| `HazbotShowMeClicked` | `{ ruleSetId: string \| null, categoryId: number \| null, stepCount: number }` | User activates the `[Show me]` button on a coaching category's intro popover, launching the visual-feedback walk-through (WM-17). `stepCount` is the number of steps in the launched tour. Like the other Hazbot events, a deliberate engine no-op (unhandled in `translate.ts`). |
| `HazbotTourCompleted` | `{ ruleSetId: string \| null, categoryId: number \| null, lastStepIndex: number }` | User finishes the walk-through via the terminal `[Got it!]` button (the tour engine's `onDestroyed` fires without a preceding cancel). `lastStepIndex` is the 0-based index of the last step shown. Deliberate engine no-op. |
| `HazbotTourDismissed` | `{ ruleSetId: string \| null, categoryId: number \| null, lastStepIndex: number }` | User closes or Escapes the walk-through before the end (the tour engine's `onCancelRequested` fires). `lastStepIndex` is the 0-based index of the step shown when dismissed. Deliberate engine no-op. |
