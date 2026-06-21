# Add dotted lines to delineate the zones

**Jira**: https://concord-consortium.atlassian.net/browse/WM-7

**Status**: **Closed**

## Overview

Add a white dashed line drawn on the 3D terrain along the boundaries between zones so students can clearly see where one zone ends and the next begins. The wildfire model divides the landscape into 2 or 3 zones, each with its own vegetation, terrain type, and drought level; until now the only cue to a zone boundary was a subtle change in terrain coloring. The line gives students and teachers a clear, persistent reference for reasoning about how conditions differ across the landscape and how fire behaves as it crosses from one zone into another. Rendering is gated behind a `showZoneLines` config/URL flag (default off), and the exact dash sizing is expected to be refined through visual iteration with the project owner.

## Requirements

- A **white dashed line** is drawn on the 3D terrain along the boundary between adjacent zones.
- The boundary is derived **generically**: a segment is drawn wherever two adjacent cells have differing `zoneIdx`. Works for 2-zone (one divider) and 3-zone (two dividers) models, and for custom/non-straight zone layouts (`complexZones`, image-based zones).
- The line follows the terrain surface elevation (drapes over the heightmap) rather than sitting at a flat height.
- By default the line is **fully visible and drawn on top of** fire/burnt terrain (unchanged by fire state). The implementation is structured so depth-based occlusion can be switched on later without a rewrite *(occlusion mode itself not built — see Out of Scope)*.
- Rendering of the line is gated by the `showZoneLines` config/URL parameter, defaulting to **OFF**.
- Exact dash length/gap and line width are not fixed by a formal design; a reasonable white-dashed default matching the ticket sketch is implemented and refined visually with the project owner *(final styling values settled through iteration, not in this spec)*.

## Technical Notes

Implemented as a `THREE.LineSegments` sibling of `Terrain` inside the Canvas ([src/components/view-3d/zone-lines.tsx](src/components/view-3d/zone-lines.tsx)), with a `THREE.BufferGeometry` of boundary edges and a `LineDashedMaterial` (white, `depthTest: false`, `renderOrder` above terrain). Validated across `plainsTwoZone`, `hillThreeZone`, and `complexZones` (diagonal/staircase boundaries), draped over terrain and staying fully visible over active/burnt fire. Geometry build:
- Iterate cells; for each cell's right and bottom neighbor, if `zoneIdx` differs, emit a segment along the shared grid edge (right edge at model-x `(x+1)*cellSize`, spanning `y..y+1`; bottom edge at model-y `(y+1)*cellSize`, spanning `x..x+1`). Checking only right+bottom avoids drawing each edge twice.
- World coords mirror `marker.tsx`: `modelFt * ftToViewUnit(simulation)`; segment z = average of the two adjacent cells' `elevation * ratio`, plus a small lift (`+0.004` view units) to avoid z-fighting.
- `LineDashedMaterial` requires `computeLineDistances()` on the line object after the position attribute is set (done in a `useLayoutEffect`). Starting dash values: `dashSize 0.012`, `gapSize 0.008` (view units) — tuned visually.
- Geometry rebuilds on `cellsElevationFlag` / grid-size change. `linewidth` on `LineDashedMaterial` is capped at 1px on most WebGL platforms; a fat-line approach (e.g. `Line2`/`LineGeometry`) would be needed for a thicker line.

The `showZoneLines` flag was added to the config interface and `getDefaultConfig()` (default `false`) in [src/config.ts](src/config.ts), following the existing `showBurnIndex` pattern; URL-param coercion is handled generically by `getUrlConfig()`.

Note on complex boundaries: segments follow cell edges, so diagonal `zoneIdx` boundaries render as a 90° staircase (accurate to the grid, not smoothed). The study's standard presets use straight vertical dividers, so this only affects custom presets.

Relevant files: [view-3d.tsx](src/components/view-3d/view-3d.tsx) (scene assembly), [terrain.tsx](src/components/view-3d/terrain.tsx) (terrain mesh, color/elevation), [helpers.ts](src/components/view-3d/helpers.ts) (ft→view-unit conversion), [simulation.ts](src/models/simulation.ts) (zone/cell data), [grid-utils.ts](src/models/utils/grid-utils.ts) (neighbor helpers).

## Out of Scope

- Accessibility concerns (keyboard, screen reader, color contrast) are out of scope for this repo.
- Labeling zones with names/numbers (this story is the boundary line only).
- Changing zone data, zone assignment, or the setup/zone-selector UI.
- Finalizing exact styling values (dash size, line width); these are settled through visual iteration with the project owner, not in this spec.
- Building the depth-based occlusion mode (only leaving the door open for it; default remains draw-on-top).

## Decisions

### What is the source of truth for the line's visual styling?
**Context**: The ticket provides a hand sketch as a "starting point" and explicitly expects tweaking once seen in 3D. We needed to know how precise to be about color, dash length/gap, and line width, and whether a Zeplin design exists.
**Options considered**:
- A) No formal design; implement a reasonable default from the sketch (white/black dashed line) and iterate visually with the project owner. Leave exact values to dev judgment.
- B) A Zeplin design exists; fetch it and pin exact color/dash/width values as requirements.
- C) Define specific target values now in the spec and treat the sketch as superseded.

**Decision**: A. No formal design. Implement a white dashed line (matching the ticket sketch) and iterate visually with the project owner; exact dash/width values left to dev judgment.

### Which zone configurations must the line support?
**Context**: Default presets split zones with straight vertical lines (2-zone: one divider; 3-zone: two dividers). Custom presets (`complexZones`, image-based) can have arbitrary, non-straight boundaries. Supporting only straight dividers is simpler; supporting arbitrary boundaries is more general but more work.
**Options considered**:
- A) All zone boundaries generically (any adjacent cells with differing `zoneIdx`), so it works for every preset including custom/diagonal/image-based.
- B) Only the standard straight vertical dividers used by the study presets (2-zone and 3-zone).
- C) Standard straight dividers now; generic boundaries deferred to a follow-up.

**Decision**: A. Derive boundaries generically from differing `zoneIdx` so all presets (including custom/diagonal/image-based) are supported. Validated in a spike across `plainsTwoZone`, `hillThreeZone`, and `complexZones`.

### How should the line behave while a fire is active or has burned across it?
**Context**: The ticket calls out wanting to see "how it looks when fire(s) is active." The line could stay fully visible on top of fire/burnt cells, or be visually de-emphasized where fire overlaps.
**Options considered**:
- A) Always fully visible, drawn on top of fire/burnt terrain (render over, no z-fighting), unchanged by fire state.
- B) Visible but allowed to be occluded by raised fire effects / depth as normal.
- C) Some other treatment.

**Decision**: A (draw on top, fully visible, unchanged by fire state) as the default, with the implementation structured so B (depth-based occlusion) can be enabled later without a rewrite.

### Should the zone line be always-on, or gated by a config/URL parameter?
**Context**: Many features in this app are toggleable via config/URL params (e.g. `showBurnIndex`, `*Available`). The zone line could always render, or be controllable (default on or off) so it can be disabled for certain activities.
**Options considered**:
- A) Always on, no config flag.
- B) Config/URL param (e.g. `showZoneLines`), default ON.
- C) Config/URL param, default OFF.

**Decision**: C. Gate behind the `showZoneLines` config/URL param, default OFF.
