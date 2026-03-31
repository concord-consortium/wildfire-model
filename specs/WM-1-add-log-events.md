# Add Log Events and Integrate Log Monitor for Wildfire Model

**Jira**: [WM-1](https://concord-consortium.atlassian.net/browse/WM-1)

**Status**: **Closed**

## Overview

Add new log events and integrate the `@concord-consortium/log-monitor` developer sidebar into the wildfire-model to improve observability of simulation lifecycle, student interactions, and wildfire-specific outcome data. This supports the behavior-based help overlays initiative (DT-14) by giving researchers the granular event data needed to understand how students interact with the simulation.

## Requirements

### Log Monitor Integration
- Added `@concord-consortium/log-monitor` as an npm dependency.
- Added `logMonitor: false` to `DEFAULT_CONFIG` in `src/config.ts`, controllable via URL parameter `?logMonitor=true`.
- Created `src/log.ts` wrapper using `createLogWrapper` from `@concord-consortium/log-monitor`.
- Migrated all 10 files that imported `log` from `@concord-consortium/lara-interactive-api` to import from `src/log.ts`.
- Renders `<LogMonitor logFilePrefix="wildfire-log-events" />` when `logMonitor` is true, in a flex layout with the app content wrapped to prevent absolute-positioned elements from escaping into the sidebar.

### General Requirements

1. **New "SimulationEnded" Event** — Fires when the simulation ends terminally (fire burns out, restart, reload, top-bar reload). Includes `reason` field and `outcome` data. Pausing (Stop) does NOT trigger SimulationEnded. FireLineButtonClicked and HelitackButtonClicked do NOT trigger SimulationEnded. Ordering requirement: SimulationEnded dispatches before restart/reload resets state.

1a. **Enhanced "SimulationStopped" with Outcome Data** — The existing SimulationStopped event now includes an `outcome` field with the same structure as SimulationEnded, ensuring researchers have data even if the student pauses and closes the browser.

2. **Enhanced "SimulationStarted" Parameters** — Logs all `ISimulationConfig` parameters as a full configuration snapshot. Large array/image fields (`elevation`, `unburntIslands`, `zoneIndex`) log metadata only. Runtime state (sparks with zone index, fire line markers, zones with labels, wind, towns) added on top of config.

3. **Mouse Enter/Leave and Click Events** — `SimulationMouseEnter`/`SimulationMouseLeave` with `{ clientX, clientY, percentX, percentY }` relative to the simulation container. `SimulationClicked` with unified schema: `hit3d` flag, DOM coordinates always present, `modelX`/`modelY`/`elevation` only when `hit3d` is true. Clicks only fire within the 3D canvas area, not on UI controls. Specific interaction clicks (SparkPlaced, FireLineAdded, Helitack) suppress the generic SimulationClicked via a module-level flag.

4. **"GraphDataRangeToggled" Event** — Fires when "Show All Data" / "Show Recent Data" toggle is clicked, with `{ showAll: true/false }`.

### Wildfire-Specific Requirements

5. **Enhanced "SimulationStarted" Parameters for Wildfire** — Fire line markers with coordinates and elevation, town locations, sparks with zone index, wind speed/direction/scaleFactor.

6. **Wildfire "SimulationEnded" Outcome Data** — Duration (minutes and hours), area burned per zone (percentage and acres with formula `burnedCellCount * cellSize² / 43560`), piecewise burn rates per zone (thousands of acres/hour from raw unrounded data, rounded to 4 decimal places), summary statistics (max burn rate, time of max burn rate), town outcomes (burned/saved). All floats rounded to 4 decimal places.

7. **Add Elevation to "FireLineUpdated" Events** — Includes `elevation1` and `elevation2` matching the `FireLineAdded` pattern.

### Documentation

8. **`LOGGED-EVENTS.md` Reference Document** — 3-column tables (`Event | Parameters | When`) grouped by category, following the hurricane-model layout. Linked from `README.md`. Documents all 33 events.

### Dependency Update

9. **Update `@concord-consortium/lara-interactive-api`** — Updated from `^1.9.2` to `^1.13.0`.

## Technical Notes

- **Units**: All model dimensions in feet. Acreage: `1 acre = 43560 ft²`.
- **State management**: MobX with `SimulationModel`, `UIModel`, `ChartStore`.
- **Natural simulation end**: Detected via MobX `reaction` in `app.tsx` watching `simulationRunning` transition from true to false while `engine.fireDidStop` is true. Guard flag (`simulationEndedLogged`) prevents double-firing when restart/reload also triggers the reaction.
- **Burn rate data**: Raw (unrounded) burn data stored in `ChartStore.rawBurnData` parallel to the chart's rounded display data, enabling precise burn rate computation.
- **SimulationClicked architecture**: Three-path coverage — terrain hits via `useSimulationClickedInteraction` (always-on raycasting), canvas misses via `onPointerMissed`, UI clicks not logged. Specific interactions suppress generic click via `markSpecificInteractionHandled()`.
- **LogMonitor layout**: Outer wrapper div with flex, inner content div with `transform: scale(1)` to create stacking context (following flooding-model pattern).

## Out of Scope

- Scroll-in/scroll-out visibility events — handled at the Activity Player level.
- Changes to the Activity Player or LARA Interactive API.
- Modifications to the `@concord-consortium/log-monitor` package itself.
- Logging of continuous mouse movement.
