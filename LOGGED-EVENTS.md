# Logged Events Reference

All events are logged via `@concord-consortium/lara-interactive-api` `log()` function.
Events are only sent when the simulation is embedded in LARA/Activity Player.

All model coordinates are in feet. Normalized coordinates (x, y) are relative to model width/height (0-1 range).

## Simulation Lifecycle

| Event | Parameters | When |
|-------|-----------|------|
| `SimulationStarted` | `{ preset, modelWidth, modelHeight, gridWidth, cellSize, gridHeight, elevation, unburntIslands, zoneIndex, maxTimeStep, modelDayInSeconds, windSpeed, windDirection, neighborsDist, minCellBurnTime, heightmapMaxElevation, zonesCount, fillTerrainEdges, riverData, windScaleFactor, showModelDimensions, fireLineDelay, helitackDelay, maxFireLineLength, helitackDropRadius, showBurnIndex, showCoordsOnClick, unburntIslandProbability, fireSurvivalProbability, droughtIndexLocked, severeDroughtAvailable, riverColor, fireLineAvailable, helitackAvailable, forestWithSuppressionAvailable, changeWindOnDay, newWindDirection, newWindSpeed, logMonitor, sparks: [{ x, y, elevation, zoneIdx }], zones: [{ vegetation, terrainType, droughtLevel }], wind: { speed, direction, scaleFactor }, towns, fireLineMarkers: [{ x, y, elevation }] }` | User clicks Start. Large array fields (elevation, unburntIslands, zoneIndex) are logged as metadata strings or URLs, not raw data. |
| `SimulationStopped` | `{ outcome: { durationMinutes, durationHours, zones: [{ zoneIndex, burnPercentage, burnedAcres, burnRates, maxBurnRate, timeOfMaxBurnRate }], towns: [{ name, burned }] } }` | User clicks Stop/Pause — includes outcome snapshot so data is available even if the student closes the browser without restarting |
| `SimulationEnded` | `{ reason: "ByItself" \| "SimulationRestarted" \| "SimulationReloaded" \| "TopBarReloadButtonClicked", outcome: { durationMinutes, durationHours, zones: [{ zoneIndex, burnPercentage, burnedAcres, burnRates, maxBurnRate, timeOfMaxBurnRate }], towns: [{ name, burned }] } }` | Fire burns out naturally, or user restarts/reloads |
| `SimulationRestarted` | — | User clicks Restart (bottom bar) |
| `SimulationReloaded` | — | User clicks Reload (bottom bar) |
| `TopBarReloadButtonClicked` | — | User clicks Reload (top bar) |

## Mouse Interaction

| Event | Parameters | When |
|-------|-----------|------|
| `SimulationMouseEnter` | `{ clientX, clientY, percentX, percentY }` | Mouse enters the simulation container |
| `SimulationMouseLeave` | `{ clientX, clientY, percentX, percentY }` | Mouse leaves the simulation container |
| `SimulationClicked` | `{ hit3d, clientX, clientY, percentX, percentY, modelX?, modelY?, elevation? }` | Click anywhere in the simulation container. `hit3d: true` includes model coordinates when the terrain mesh is hit; `hit3d: false` for UI overlays or missed raycasts |

## Fire Tools

| Event | Parameters | When |
|-------|-----------|------|
| `SparkButtonClicked` | — | User clicks Spark button |
| `SparkPlaced` | `{ x, y, elevation }` | User places a spark on the terrain |
| `FireLineButtonClicked` | — | User clicks Fire Line button |
| `FireLineAdded` | `{ x1, y1, elevation1, x2, y2, elevation2 }` | User draws a fire line |
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
