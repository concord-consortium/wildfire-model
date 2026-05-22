# Hazbot: New WF Presets

**Jira**: https://concord-consortium.atlassian.net/browse/WM-4

**Status**: **Closed**

## Overview

Add two new simulation presets to [src/presets.ts](../src/presets.ts) so Hazbot activity
pages 25 and 42 start from the initial conditions specified in the project's "Wildfire
Hazbot Feedback Tables" spreadsheet (the **SIMINIT** sheet). Each new preset is an
existing base preset plus an `elevation` field that locks zone terrain type:
`mountainTwoZoneFixedTerrain` (page 25) and `defaultTwoZoneFixedTerrain` (page 42).

## Background

The SIMINIT sheet of [Wildfire Hazbot Feedback Tables](https://docs.google.com/spreadsheets/d/1AUfg2Gg3J0eusldNMecmRtbAGvecTjLviTd19FA6bT0) documents the
initial condition (zones, wind, sparks) for every Hazbot activity page. Exactly two
rows are flagged "YES" in its "Revised or new SIM?" column — pages 25 and 42 — and
those are the presets WM-4 calls for. Every other SIMINIT row already maps to an
existing preset.

Page 25's zones match the existing `mountainTwoZone` and page 42's match
`defaultTwoZone`, but both SIMINIT rows require terrain type to be **fixed**. In the
Terrain Setup dialog, [terrain-panel.tsx:235](../src/components/terrain-panel.tsx#L235)
renders the editable terrain-type selector only when `!config.elevation &&
zones.length === 2`; setting `elevation` on a two-zone preset hides it. The existing
base presets cannot be modified in place — `mountainTwoZone` is reused by pages 33/35
and `defaultTwoZone` by page 43, all of which must keep terrain editable — so each
locked page needs its own separately-named preset.

Locking terrain type is a data-integrity requirement: the Hazbot rule-sets track
`setVegetation` and `setDroughtLevel` but have no `setTerrainType` factor variable, so
an unlocked selector would let a student change terrain type undetected, corrupting
the behavior classification.

## Requirements

- **R1 — Page 25 preset.** Add a new preset named **`mountainTwoZoneFixedTerrain`** to
  [src/presets.ts](../src/presets.ts). It carries the same landscape as the existing
  `mountainTwoZone`, plus the R2 terrain lock:
  - `zonesCount: 2`
  - Zone 1 and Zone 2: `terrainType: Mountains`, `vegetation: Shrub`, `droughtLevel: MildDrought`
  - No `towns` — matching `mountainTwoZone`, which defines none
  - It sets no `windSpeed`/`windDirection`/`sparks` (per Q5) — wind stays at the
    default 0 and the student places up to 2 sparks (`zonesCount` is the spark cap),
    matching SIMINIT row 6 (wind 0, 2 user sparks).
- **R2 — Page 25 locked terrain.** The page-25 preset locks zone terrain type by
  setting `elevation: "data/mountains-mountains-heightmap.png"` — the heightmap that
  `getElevationData` would otherwise auto-derive from the zones' terrain type, so the
  terrain's appearance is unchanged while the Terrain Setup terrain-type selector is
  hidden.
- **R3 — Page 42 preset.** Add a new preset named **`defaultTwoZoneFixedTerrain`** to
  [src/presets.ts](../src/presets.ts). It carries the same landscape as the existing
  `defaultTwoZone` (its `zones` and `towns`), plus the R4 terrain lock:
  - `zonesCount: 2`
  - Zone 1: `terrainType: Foothills`, `vegetation: Grass`, `droughtLevel: MediumDrought`
  - Zone 2: `terrainType: Foothills`, `vegetation: Shrub`, `droughtLevel: MildDrought`
  - `towns`: the same array as `defaultTwoZone`
  - It sets no `windSpeed`/`windDirection`/`sparks` (per Q5) — page 42's fixed wind
    and fixed spark are LARA activity URL params (see R5).
- **R4 — Page 42 locked terrain.** The page-42 preset locks zone terrain type by
  setting `elevation: "data/foothills-foothills-heightmap.png"`.
- **R5 — Page 42 wind & fixed spark (recorded for the LARA task — not a WM-4
  deliverable).** Per Q5, the page-42 preset does **not** set wind or sparks; they are
  supplied as LARA activity URL params, like pages 43/45/47. WM-4 records the values
  so the downstream LARA task has them:
  - Wind: `windSpeed=2` (displayed magnitude 10 MPH) and `windDirection` per Q3
    (SIMINIT says 270; the page-43 reference URL uses 270.5 — PI to confirm).
  - Fixed spark at **`[74510, 34414]`** ft (zone 1, between the Rolling Rock and
    Sunrise town markers; see Q1). To make it non-removable and stop the student
    adding a second spark, the `sparks` URL param repeats the coordinate to fill both
    zone slots — `sparks=[[74510,34414],[74510,34414]]` — the technique pages 45/47
    use.
  - Applying these params to the LARA activity is out of scope (see Dependencies).
- **R6 — No new terrain art.** Both presets reuse the existing heightmap images that
  match their zone terrain types; no new image assets are introduced.
- **R7 — Preset names.** The new presets are named `mountainTwoZoneFixedTerrain`
  (page 25) and `defaultTwoZoneFixedTerrain` (page 42) — see Q2.
- **R8 — Validation.** Each preset is verified by loading it in the dev app
  (`?preset=<name>`) and confirming:
  - via Terrain Setup, that the zones match the SIMINIT row and that the terrain-type
    selector is **not** shown (terrain locked);
  - that the rendered 3D terrain is visually identical to the base preset
    (`?preset=mountainTwoZone` / `?preset=defaultTwoZone`).

  The page-42 preset is additionally checked with the R5 wind and `sparks` URL params
  appended — confirming the spark appears at `[74510, 34414]`, the Spark tool is
  disabled, the fixed spark cannot be moved or removed, the two coincident spark
  markers cause no visual or simulation problems, and wind reads 10 MPH from the west.
  Validation is manual; [src/presets.ts](../src/presets.ts) has no automated test
  coverage today, and matching that practice is a conscious choice for WM-4.

## Technical Notes

- **Preset structure** ([src/presets.ts](../src/presets.ts)): each preset is a
  `Partial<ISimulationConfig>`. Relevant fields — `zonesCount`, `zones[]`
  (`terrainType`, `vegetation`, `droughtLevel`), `sparks: number[][]` (model feet),
  `windSpeed` (mph), `windDirection` (degrees, 0 = north), `elevation`
  (`number[][] | string`). Enums come from [src/types.ts](../src/types.ts).
- **Config merge order**: `Object.assign(getDefaultConfig(), presetConfig, getUrlConfig())`
  ([simulation.ts:162](../src/models/simulation.ts#L162)) — URL params override preset
  values.
- **Terrain-type lock**: [terrain-panel.tsx:235](../src/components/terrain-panel.tsx#L235)
  gates the `TerrainTypeSelector` on `!config.elevation && zones.length === 2`.
- **Heightmap derivation**: [data-loaders.ts](../src/models/utils/data-loaders.ts)
  `getElevationData` builds `data/<zone0>-<zone1>[-<zone2>]-heightmap.png` from zone
  terrain types when `elevation` is absent. Supplying that exact path as `elevation`
  yields identical terrain but a truthy `config.elevation`. Files
  `mountains-mountains-heightmap.png` and `foothills-foothills-heightmap.png` already
  exist in [src/public/data/](../src/public/data/).
- **`elevation` accepts a string OR an array.** [image-utils.ts](../src/models/utils/image-utils.ts)
  `getInputData` branches on `input.constructor === Array` (inline grid) vs string
  (image URL — the same branch the auto-derived path uses). This spec uses the string
  image-path form. The `number[][]` arrays in existing presets (`slope45deg`, `basic`,
  `basicWithSlopeAndWind`) are synthetic dev/test terrains small enough to inline.
- **Spark cap**: there is no separate "max sparks" config — the user can place
  `remainingSparks = zonesCount - sparks.length` sparks. For a 2-zone model, one spark
  still leaves one placeable, so locking page 42 to a single fixed spark means filling
  **both** zone slots: `sparks=[[x,y],[x,y]]` (the same coordinate twice), as the
  pages 45/47 URLs do.
- **Wind magnitude**: SIMINIT's "magnitude" column is the displayed value;
  `displayed = windSpeed / windScaleFactor` and `windScaleFactor` defaults to 0.2, so
  displayed 10 MPH ⇒ `windSpeed: 2`.
- **`showCoordsOnClick` is currently broken** (discovered while authoring this spec).
  [use-show-coords-interaction.tsx](../src/components/view-3d/use-show-coords-interaction.tsx)
  registers its handler under `onClick`, but `getEventHandlers`
  ([interaction-handler.ts](../src/components/view-3d/interaction-handler.ts)) only wires
  up pointer events — `onClick` is intentionally excluded. So the flag has no effect.
  Fixing it (a one-line `onClick` → `onPointerUp` change) is out of scope for WM-4.

## Out of Scope

- Updating the LARA activity sequence so pages 25 and 42 reference the new `preset=`
  names — that lives in LARA, not this repo.
- Regenerating [docs/hazbot-validation/localhost-urls.md](../docs/hazbot-validation/localhost-urls.md)
  (auto-generated from a LARA sequence export).
- Any change to Hazbot rule-set modules — creating a `42.ts` rule-set, or
  re-validating `25.ts` against the new 2-zone model (see Dependencies).
- Setting page 42's wind and fixed spark, and any activity-level tool-availability
  flags (`helitackAvailable`, `fireLineAvailable`, `severeDroughtAvailable`,
  `showBurnIndex`), on the LARA activity — per Q5 these are LARA URL params, not
  preset fields. WM-4 records the page-42 values (R5) but does not apply them.
- New terrain/heightmap art assets.

## Dependencies

WM-4 delivers only the two preset objects. Completing it is **necessary but not
sufficient** to make pages 25 and 42 live — the following must also happen, tracked
outside WM-4:

- **LARA activity URL updates (follow-up ticket recommended).** Each activity's
  `preset=` URL must point at the new preset, and page 42's activity URL must add
  `windSpeed=2`, `windDirection` (PI to confirm 270 vs 270.5), and
  `sparks=[[74510,34414],[74510,34414]]`. WM-4 should not be considered to ship page
  42's fixed spark — that happens only when this runs.
- **Rule-set `25.ts` re-validation for page 25 (recommended QA, not blocking).**
  `25.ts` is already authored for a 2-zone mountains model, so switching page 25 to
  `mountainTwoZoneFixedTerrain` *corrects* today's preset/rule-set mismatch rather
  than creating one; `25.ts` itself needs no change. Re-walking the `25.md` playbook
  against the new preset afterward is sensible QA.
- **Page-42 Hazbot rule-set (`42.ts`).** No `42.ts` rule-set exists yet; authoring it
  is future work, outside WM-4.
- **`showCoordsOnClick` bug.** A separate bug ticket should be filed for the
  non-functional `showCoordsOnClick` flag.
- **WM-18** reworks how the Hazbot engine sources its comparison "defaults"; tracked
  separately and out of scope here.
