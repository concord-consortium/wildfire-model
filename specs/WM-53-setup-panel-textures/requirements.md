# Hazbot: Add textures to Setup panels (when Vegetation Key is on)

**Jira**: https://concord-consortium.atlassian.net/browse/WM-53
**Repo**: https://github.com/concord-consortium/wildfire-model
**Status**: **In Development**
**Implementation Spec**: [implementation.md](implementation.md)

**Blocked on**: nothing, as of 2026-08-28. The 2x terrain art moved to its own ticket (decision C below), so this story ships the texture layer and the rename and closes on its own. What that ticket needs, recorded here because the analysis lives in this spec: the 2x terrain art. The board's exportable terrain assets are a gray base that cannot be turned into the artboards' colorized thumbnails by any standard blend, so Michael has to export the 20 assets flattened and colorized at 2x, no-drought state, with the rivers on the full thumbnail canvas. Asked 2026-08-27. That ticket also carries the **`foothills` to `hills` rename of the 5 thumbnail files**, which was in WM-53 until 2026-08-28 and now travels with the art that replaces those same 5 files; see *Why the terrain filenames are not being renamed* below. Nothing in this story waits on either.

## Overview

When the Vegetation Key is on, the zone terrain thumbnails in the Setup wizard carry the same per-vegetation texture the 3D model does, so a student choosing Grass or Forest sees the difference in the picture they are choosing rather than only in a corner badge. When the key is off, the thumbnails look exactly as they do today.

## Project Owner Overview

WM-48 gives the 3D model a surface texture per vegetation type, behind a new "Vegetation Key" switch in the bottom bar. This story carries that treatment back into the Setup wizard, where students actually pick the vegetation. Today the wizard communicates vegetation with a 26x26 icon badge in the corner of each zone thumbnail, and on the wind screen not even that: the terrain picture itself is identical whether the zone is grass or old-growth forest. Texturing the thumbnails closes the loop, so the choice a student makes in Setup and the model they then watch use the same visual language.

The work is gated on WM-48 shipping first, because the switch this story reads is WM-48's to build. It is not a reuse of WM-48's code: the Setup panel and the 3D model share no rendering path, which is what took the estimate from 2 points to 3.

The board carries two things that are not in the Jira description, the **2x terrain art** and a **`foothills` to `hills` filename rename**. Both were pulled into this story on 2026-08-27 and both were taken back out, the art on 08-28 and the rename on 08-29. Neither is needed for the texture work, and the rename turned out to be the riskiest thing in the story rather than incidental tidying; see *Why the terrain filenames are not being renamed* below. WM-53 is now the texture layer and nothing else.

## Background

Michael filed WM-53 on 2026-08-23, one day after specifying WM-48, as the second half of the same design conversation. The description is one sentence: *"The textures added to the model should also be applied to the terrain displays in the Setup panels when the Vegetation Key is turned on. (And not shown when off.)"* It links the same three artifacts WM-48 does: the textured-terrain demo build, PR #129, and the `wildfire-explorer-textured-terrain-prototype` branch.

The design is on the **Updated Wildfire Setup Panel and Terrain Textures** Zeplin board, which carries four dedicated "with Vegetation Key ON" artboards paired against the four existing OFF ones (2-zone and 3-zone, Adjust Conditions and Adjust Wind). Those artboards are the spec, and they were read for this document.

Two facts shape everything below.

**The Setup panel and the 3D model share no rendering code.** PR #129 changes `src/components/view-3d/` (`terrain.tsx` plus new `terrain-shader.ts`, `terrain-textures.ts`, `terrain-colors.ts`), `config.ts`, four SVGs under `src/public/terrain-textures/`, a measurement script, and a demo banner. It touches nothing under `terrain-panel`, `zone-selector` or `src/assets/terrain/`. The model textures are rasterized to 512, packed into a `DataTexture`'s four channels and sampled in a fragment shader. The Setup panel draws a CSS `background-image` on a `<div>`. There is no flag to flip.

**The board models the texture as an overlay, not as new artwork.** Each ON artboard adds a group named `Zone 1 Texture` / `Zone 2 Texture` / `Zone 3 Texture` sized exactly to the terrain image (120x100 for 2-zone, 80x100 for 3-zone), sitting inside the zone at the same rect as the terrain picture, containing tiled instances of the same vegetation texture the model uses. There are exactly ten such groups on the board and all ten are inside the four ON artboards; the OFF artboards have none. So the terrain PNGs themselves do not change, and the story is one new layer per zone that is present when the key is on and absent when it is off.

## Requirements

- When the Vegetation Key is **on**, each zone's terrain thumbnail in the Setup wizard shows the vegetation texture for that zone's vegetation type, covering the same rect as the terrain image (120x100 at 2 zones, 80x100 at 3 zones).
- When the Vegetation Key is **off**, the thumbnails render exactly as they do today, with no texture layer in the DOM and no change to existing measurements.
- The texture appears on **both** wizard screens that draw zones: the interactive **Adjust Conditions** screen (the zone radio buttons) and the read-only **Adjust Wind** screen (the `.fixed` recap display). The board draws it on all four ON artboards.
- The texture follows the zone's **vegetation type**, using the same four types and the same enum order as the model: Grass, Shrub, Forest, Forest with Suppression.
- The texture's ink color follows the zone's **drought level**, using the palette WM-48 establishes (the board's "Assigned Color / Texture" column: no drought `#004001`, and the mild / medium / severe / burnt entries in the same table).
- **The ink is painted, not filtered.** The four tiles carry the glyphs as strokes over a transparent field, and the texture layer is `mask-image: url(<tile>)` with `background-color: <ink>`. That requires the tiles' `#808080` background rect to become `fill="none"` and `rasterizeSvg` to fill its canvas with `#808080` before drawing, which leaves the 3D texture byte-identical. See the resolved open question for the measurements that rule out the filter and luminance-mask alternatives.
- Changing a zone's vegetation or drought while the wizard is open updates that zone's texture immediately, like the existing badge and drought tint do.
- The texture must not disturb the existing zone-thumbnail states: the 4px white selection frame, the 50% / 75% / 100% terrain opacity for default / hover / selected, and the full-strength `.fixed` recap on the wind screen.
- **The texture carries the same state opacity as the terrain image** (50% default, 75% hover, 100% selected, 100% on the recap), so the two always read as one picture. Built by wrapping the texture and `.terrainImage` in one container that carries the opacity, leaving the drought filter on `.terrainImage` so `.riverOverlay` is untouched. The board states this directly: on the ON artboards a default zone's texture instance is drawn at `opacity: 0.5` against `1` on the selected zone.
- **The tile is drawn at a fixed `mask-size: 112.5px 112.5px` with `mask-repeat: repeat`, identical on 2-zone and 3-zone layouts.** Roughly one repeat across a 120px card. The properties are the `mask-*` pair and not the `background-*` pair, because under decision E the tile is the layer's mask and the layer has no background image at all: **measured 2026-08-28**, a layer carrying only `background-color` plus `mask-image` computes `background-image: none`, so a `background-size` set on it is inert and the tiling silently does not happen. This is the board's scale, **confirmed by Michael 2026-08-27** as the authored value, about 3x coarser than the model's own `terrainTextureTileFt` would give, and it is a thumbnail-legibility choice rather than a derived value. At that size the tile's authored `stroke-width="3"` on a 256 viewBox draws at **1.32px**, which is the figure he quoted alongside it.
- Reading the key's state must not couple the Setup panel to the 3D terrain: it reads the same `UIModel` flag WM-48's switch writes.
- **Toggling the Vegetation Key while the Setup wizard is open** adds or removes the texture on the open screen immediately, on both the Conditions and the Wind screens.
- The texture layer **fills the thumbnail rectangle**; it is not masked to a terrain silhouette. The terrain PNGs are opaque, sky-free, alpha-free art, so there is nothing to mask around.
- The texture layer is `position: absolute; inset: 0`, a **sibling of `.terrainImage`**, and **not a child** (the drought filter would rewrite its color). It is ordered **after** `.terrainImage`, so it paints above the terrain and above `.riverOverlay`, which is what the board draws. `.vegetationPreview` moves out of `.terrainImage` to sit after the texture, keeping the badge on top as the board draws it, **and it stays inside the opacity wrapper**. Outside the wrapper it stops fading with its zone and renders at twice today's strength on every unselected zone (measured: chip pixel `rgb(153,153,153)` against `rgb(77,77,77)` today), which would break the two requirements above about leaving the off state and the existing thumbnail states untouched. All three structural rules are asserted in Jest: not a descendant of `.terrainImage`, a descendant of the wrapper, ordered after the texture.
- The tile filename per vegetation type comes from **one map shared with WM-48** (`VEGETATION_TILE_FILES` in `terrain-textures.ts`), not from a second copy and not from `Vegetation[v].toLowerCase()`, which does not produce `forest-with-suppression`.
- **No terrain file is renamed.** `TerrainType[t].toLowerCase()` stays as the derivation in both `zone-selector.tsx` and `data-loaders.ts`, the 19 `foothills` filenames stay as they are, and no `terrainFileNames` map is introduced. See *Why the terrain filenames are not being renamed* below.

## Technical Notes

### Where the Setup panel's terrain art comes from

`terrain-panel.tsx` is the wizard. `zone-selector.tsx`'s `renderZones` draws each zone card:

- The terrain picture is a **CSS `background-image`** on `.terrainImage`, path built by string concatenation at `zone-selector.tsx:9-16`: `./terrain/${zoneCount}-zone-${TerrainType[t].toLowerCase()}${position}.png`. That is **15 terrain PNGs** in `src/public/terrain/` (2-zone and 3-zone, x plains/foothills/mountains, x left/mid/right).
- A **river overlay** is a second absolutely positioned `<div>` **nested inside** `.terrainImage`, drawing one of **5 river PNGs**.
- Vegetation appears only as `.vegetationPreview`, a **26x26 badge** with a 1px white border, bottom-left, and it is **suppressed entirely when `readonly`** (`zone-selector.tsx:72`).
- Drought is three hardcoded CSS `filter` chains at `zone-selector.scss:63-80`: mild `hue-rotate(327deg) saturate(80%) brightness(115%)`, medium `hue-rotate(316deg) saturate(80%) brightness(130%)`, severe `hue-rotate(297deg) saturate(65%) brightness(120%)`. No drought is no filter.

Measured live against the dev server on `?preset=hillThreeZone` (2026-08-24), and the code already matches the board: `.terrainPreview` is 88x108 and `.terrainImage` is **80x100** at 3 zones, with 2-zone at 128x108 / 120x100 per `zone-selector.scss:15-16`.

| Screen | terrain image | opacity | drought filter | vegetation badge |
|---|---|---|---|---|
| Adjust Conditions, selected zone | 80x100 | 1 | applied | present, opacity 1 |
| Adjust Conditions, unselected | 80x100 | 0.5 | applied | present, opacity 0.6 |
| Adjust Wind (`.fixed`) | 80x100 | **1 for every zone** | applied | **absent** |

**Consequence worth stating plainly:** on the wind screen the texture would be the *only* vegetation signal inside the picture, because the badge is not drawn there at all. Vegetation is currently communicated on that screen solely by the `terrain-summary.tsx` icon rows underneath.

### The drought filter destroys a nested overlay's color (measured, not inferred)

This is the finding that decides the DOM shape, and it was verified in the running app rather than reasoned about.

`.riverOverlay` is nested **inside** `.terrainImage`, so it is the obvious precedent for where a texture layer would go. But a CSS `filter` on a parent rasterizes and recolors its whole subtree. Two probe `<div>`s were injected into the medium-drought zone, both filled with `#424F12` (the board's medium-drought texture ink), one nested inside `.terrainImage` and one as a sibling in `.terrainPreview`, then the viewport was screenshotted and the pixels sampled:

| Probe | Painted color |
|---|---|
| Nested inside `.terrainImage` (where the river overlay lives), zone at opacity 1 | `rgb(128, 88, 49)` |
| Nested inside `.terrainImage`, zone at its 0.5 unselected opacity | `rgb(191, 152, 150)` |
| Sibling in `.terrainPreview` | `rgb(66, 79, 18)`, byte-exact |

**Re-verified 2026-08-26 against post-WM-52 master**, and the nested-at-opacity-1 figure reproduced to the byte. The second row is new: at the unselected zone's 0.5 opacity the nested probe lands somewhere else again, so the damage is not a fixed offset that could be pre-compensated, it varies with the zone's state.

So nesting the texture where the river sits would silently rewrite `#424F12` to `#805831`, a different hue entirely, and no test in the repo would notice. **The texture layer has to be a sibling of `.terrainImage` inside `.terrainPreview`.**

That has a cost the implementation must pay explicitly: a sibling does **not** inherit `.terrainImage`'s state opacity either, so the 50% / 75% / 100% default / hover / selected treatment has to be applied to the texture layer as well, or the two layers will drift apart as the student moves the mouse. See the first Open Question.

Probe elements were injected through the browser console and removed; no throwaway file was created and nothing was committed.

### The terrain PNGs have no sky and no alpha (measured)

Every one of the **15** terrain PNGs in `src/public/terrain/` was decoded and inspected: all are PNG **color type 2, truecolor with no alpha channel**, and all contain **zero blue-dominant pixels**. They are top-down shaded relief that runs green edge to edge, not a side-on landscape with a horizon. The 5 river PNGs are the only ones with transparency (palette + `tRNS`), which is what makes the river a separate overlay. Sizes confirm the board's note describes a change rather than the status quo: 2-zone are 120x100 and 3-zone are 80x100, i.e. **1x**.

Two consequences, both load-bearing below: there is **no sky to protect** from a rectangular texture fill, and there is **no alpha to mask from**, so a mask cannot be derived from the existing art.

### What tile scale the model's own numbers imply

The model uses `terrainTextureTileFt: 18000` over a `modelWidth` of 120,000 ft, which none of the WM presets override. A 2-zone card's 120px terrain image covers half the model (60,000 ft) and a 3-zone card's 80px image covers a third (40,000 ft), so **both render at 0.002 px per ft**. Carrying the model's own tile scale across therefore gives the **same 36px tile on both layouts**: 3.33 repeats across a 2-zone card, 2.22 across a 3-zone one. That removes option B's stated drawback (a glyph scale that differs between 2-zone and 3-zone) as a reason to pick anything, because at model scale the two already agree.

### The ink's contrast target is a model number, not a thumbnail number

Worth recording so nobody later "fixes" the ink against the wrong reference. `terrainGlyphContrast` is `[6, 6, 6, 7]`, and the five hexes hit exactly that **against the model's flat drought colors**: measured `6.01`, `5.97`, `6.03` and `7.00`. Against what the Setup thumbnail actually paints they land far lower, because a shaded relief is not a flat fill:

| level | thumbnail today | ink | contrast on the thumbnail | contrast on flat model color |
|---|---|---|---|---|
| No drought | `#1AB008` | `#004001` | 4.19 | 6.01 |
| Mild | `#85AD1F` | `#2D460B` | 4.01 | 5.97 |
| Medium | `#B6BA23` | `#424F12` | 4.26 | 6.03 |
| Severe | `#D09C38` | `#241B06` | 6.88 | 7.00 |

**This is not a defect and must not be "corrected".** The board's own composited thumbnail at mild drought renders `(119,175,45)`, against the repo's `(133,173,31)`, and the ink sits at `3.99` there versus `4.01` here. The designer drew it at that contrast knowingly. The two routes to the thumbnail arrive at the same place, so adopting the board's terrain art does not move this number either.

### The two texture asset sets are disjoint

| | Model textures (WM-48) | Setup panel icons (today) |
|---|---|---|
| Path | `src/public/terrain-textures/` | `src/assets/terrain/` |
| Files | `grass`, `shrub`, `forest`, `forest-with-suppression` | `vegetation-grass`, `vegetation-shrub`, `vegetation-fsl`, `vegetation-fll` |
| Size | 256x256 viewBox, `#808080` ground, `stroke-width="3"` | 28x28 viewBox |
| Loaded | `fetch` by URL, rasterized to canvas, packed into a `DataTexture` | SVGR-imported as React components |

Same four vegetation types, same enum order, nothing else in common. WM-53 wants the 256x256 tile, which is fetched by URL and therefore reachable from CSS as a plain `background-image` without touching WM-48's loader.

### The shared icon arrays are a trap

`vertical-selectors.tsx` exports `vegetationIcons` and `droughtIcons` as module-level arrays of React elements. **Five components consume them**, and one is not in the Setup panel:

| Consumer | Surface |
|---|---|
| `zone-selector.tsx:74` | Setup panel, the 26x26 zone-card badge |
| `terrain-summary.tsx:30,38` | Setup panel, the recap rows |
| `vegetation-selector.tsx:20,23,27` | Setup panel, slider marks |
| `drought-selector.tsx:28-38` | Setup panel, slider marks |
| **`simulation-info.tsx:20-21`** | **the map's zone labels, which is WM-49's surface** |

Editing those arrays to carry texture would reach the map zone label too. This is the same shape as *WM-39: where the string actually lives*: one shared export serving surfaces owned by different stories, where the fix was a parallel display-only map rather than an edit in place. If textured icons are ever wanted, add a second export rather than mutating these.

`vegetation-selector.tsx` also makes enum order load-bearing: it selects with `vegetationIcons.slice(1)`, `.slice(1, 3)` and `.slice(0, 3)` depending on terrain type and `forestWithSuppressionAvailable`, so reordering or padding the array silently changes which options a zone offers.

### The state this story reads belongs to WM-48

WM-48's spec resolves the flag's home: the Vegetation Key is **pure view state on `UIModel`**, not on `SimulationModel`, and it **persists across both Restart and Clear All**, following the `ui.showChart` precedent. Textures are **off by default**. WM-53 reads that flag and adds no state of its own. The flag's name is WM-48's to set; the existing convention in `ui.ts` is `showChart` / `showTerrainUI`.

### Zeplin

Board: **Updated Wildfire Setup Panel and Terrain Textures**, `https://app.zeplin.io/project/5fe47ae231d1f6a428c53450/screen/6a8599f5f464e141fcb7b53b`. It carries its requirements as blue text rather than annotation pins, so `list_annotations` is the right first call.

- The four ON artboards: 2-zone Conditions at (700, 1148), 2-zone Wind at (700, 1784), 3-zone Conditions at (1376, 1148), 3-zone Wind at (1376, 1784), each 320x465, paired against the OFF versions at x 370 and x 1046.
- `Zone N Texture` groups: 120x100 at 2 zones, 80x100 at 3 zones, positioned at (4, 8) relative to the zone, which is the same rect as the terrain image. The **group** is opacity 1; the state opacity sits on the tile instances inside it (0.5 on a default zone).
- Inside each group the texture is drawn as **tiled instances** of the vegetation SVG, clipped to the zone's terrain silhouette, at a repeat period of **112.5px** (a 120px card splits 112.5 + 7.5, which Sketch reports rounded as 113 + 8).
- The ON artboards draw a **selected zone next to a default one**, which is what makes the state opacity readable. Selection is marked by a `Zone N Highlight` white shape plus a `Label Highlight`, both present on Zone 1 and absent on Zone 2, in the OFF instances as well.
- The drought color table at (1876..2307, 375..678) gives "Assigned Color" and "Visual Display of Color", each split into **Texture** and **Terrain** columns, over rows No drought / Mild / Medium / Severe / Burnt. The no-drought texture swatch reads `#004001`, which matches WM-48's stroke palette exactly, so the two stories share one palette and it is WM-48's to land.
- `Example of Textures (Vegetation Key)` at (3236, 748) is a flat bitmap, useful to look at and not measurable. **It is a render of the 3D model, not of a Setup thumbnail**, so it is not evidence about panel tile scale; the ON artboards are, and they are vector.

**Two things on this board that are not obviously this story's**, both flagged as Open Questions below: the exportable terrain assets are drawn at **2x** (240x200 and 160x200) under the note *"Note: these are implemented at 0.5× in the Setup screens"*, while the repo's PNGs are 1x; and they are named **`hills`** where the repo says `foothills`.

### Testability

`zone-selector.tsx` builds the image path by string concatenation and applies drought as a class name, so both are assertable in jsdom off the DOM node, and `terrain-panel.test.tsx` already exists as a home. The presence or absence of the texture layer, its vegetation, and the zone count are all assertable the same way.

What is **not** assertable in jsdom: the CSS `filter` chains (they live in the stylesheet, not inline), and therefore the exact failure this spec exists to prevent. A test that pins the texture's painted color has to be a Cypress or Playwright pixel check, or it cannot fail. Pinning the *structural* rule instead is cheap and does catch the regression: assert that the texture layer is **not** a descendant of `.terrainImage`.

## Why the terrain filenames are not being renamed

The Zeplin board names its terrain assets `hills` where the repo says `foothills`, and WM-53 carried a rename of all 19 `foothills` files until 2026-08-29. It no longer does. The reasoning is recorded here rather than only in a resolved question, because "the board says `hills`, why does the repo say `foothills`" is a question the next person will ask.

**It was never in the ticket.** WM-53's description is one sentence about textures plus three links, with no mention of `hills`, `foothills`, or a rename, and no comments. The rename was found while reading the board during speccing.

**The board motivates 5 files, not 19.** Its exportable terrain assets are `2-zone-hills-left`, `2-zone-hills-right`, `3-zone-hills-left`, `3-zone-hills-mid` and `3-zone-hills-right`, which are the 5 zone thumbnails (verified against the board's asset list, 2026-08-29). **There are no heightmap or island assets on the board at all.** The other 14 files, in `src/public/data/`, were only in scope because `zonesToImageDataFile` happens to derive from the same enum.

**Those 14 are the only ones that carry risk, and it is real.** `getUrlConfig()` reads every key of `getDefaultConfig()` off the query string, and `elevation`, `unburntIslands` and `zoneIndex` are all keys, so `?elevation=data/foothills-foothills-heightmap.png` is a supported way to configure this model. Breaking one does not degrade: `image-utils.ts:100` throws from the image's `error` listener, where it cannot reject the enclosing promise, so `getInputData` never settles, `simulation.ts:347`'s `Promise.all` never resolves, and `dataReady` never flips. The activity sits with no terrain and Start disabled.

**Nothing is user-facing either way.** The thumbnail path appears only as an inline `background-image` URL and the data files only as a fetch. What students see is `terrainDisplayLabels`, which has read "Hills" since WM-39; what the Hazbot engine logs and matches is `terrainLabels`, which stays "Foothills". Neither depends on a filename.

**So the two halves were split permanently:**

- **The 14 files in `src/public/data/` are not renamed, now or later.** Nothing motivates it, the board never names them, and they are the only part that can break a deployed activity.
- **The 5 thumbnails are renamed as part of the 2x art ticket**, which replaces those exact 5 files anyway, so the rename costs nothing extra there. Those names are derived and never reach a URL, so that rename needs no announcement and breaks nothing.

**The consequence to accept, stated plainly:** the incoming 2x art arrives named `hills` and lands on files named `foothills`, so whoever does that ticket renames the thumbnails on the way in. That ticket is also where `zone-selector.tsx` gains a small filename map while `data-loaders.ts` keeps deriving from the enum. Two derivations that disagree about `TerrainType.Foothills` looks wrong until you name the reason, which is that the two families have different provenance: thumbnail names come from the designer, data filenames come from the enum. That is the same shape WM-39 already established with `terrainLabels` and `terrainDisplayLabels`, which deliberately disagree about this exact member.


## Out of Scope

- **The Vegetation Key switch itself.** That is WM-48: the control, its position between Setup and Spark, its geometry, its default-off value, and the `UIModel` flag.
- **The 3D model's textures.** Also WM-48.
- **The map's zone labels.** WM-49 owns `simulation-info.tsx`, including whether its badges ever gain texture.
- **Texturing the slider marks, the recap icon rows, or the 26x26 badge.** The board textures the zone terrain pictures only. The badge stays as it is.
- **The 2x terrain art.** Moved out on 2026-08-28 to WM-57. The 15 terrain thumbnails and 5 river overlays are replaced there with the board's art, flattened and colorized at the no-drought state, with the rivers on the full 240x200 (or 160x200) canvas. `.terrainImage` is `background-size: cover` at a fixed box, so it consumes a 2x asset with no code change, and the existing drought filter chains at `zone-selector.scss:63-80` keep applying on top.
- **The `foothills` to `hills` filename rename.** Moved out on 2026-08-29; the 5 thumbnails travel with the 2x art ticket and the 14 data files are not renamed at all. See the section above.
- Accessibility review. Out of scope in this repo.

## Open Questions

### RESOLVED: Does the texture layer follow the terrain image's state opacity?

**Decision**: **A**. The texture carries the same state opacity as `.terrainImage` (50 default / 75 hover / 100 selected), built as C describes: one wrapper carrying the opacity, with the drought filter left on `.terrainImage` so `.riverOverlay` is unaffected.

**Confirmed by Michael 2026-08-27**, in three words: *"Texture Opacity: fade with zone"*. That arrives on top of a board reading that had already settled it, so the resolution now rests on the designer's word and on the layer data agreeing, rather than on the layer data alone. Nothing in the design changes.

**Context**: `.terrainImage` is 50% opacity by default, 75% on hover, 100% when selected, and 100% on the read-only wind screen. The texture layer must be a **sibling** of `.terrainImage`, not a child, or the drought filter destroys its color (measured above), which means it does not inherit any of that. The 2-Zone Button States block specifies the terrain and the veg-type badge separately at each state (`terrain: 50% op / veg type: 50% op`, then 75%, then 100%) but says nothing about a texture.

**Options considered**:
- A) The texture layer carries the same opacity as `.terrainImage` at every state (50 / 75 / 100), so the two always read as one picture.
- B) The texture is always opacity 1, so vegetation stays legible on unselected zones.
- C) The texture and the terrain image are wrapped in one container that carries the state opacity, and the drought filter is moved onto the terrain image alone.

**Read off the board 2026-08-27, which answers it outright.** The premise above, that every ON artboard is in the selected state, is **wrong**: the *Adjust Conditions with Vegetation Key ON* artboards draw a selected zone and a default zone side by side. Zone 1 carries a `Zone 1 Highlight` white shape plus a `Label Highlight`, and Zone 2 carries neither; the same two markers appear on Zone 1 and are absent on Zone 2 in the key-OFF instance, which confirms they are the selection markers rather than zone decoration. With the states identified, the answer is stated in the layer data rather than inferred: on the 3-zone ON artboard the **default** zone's texture instance carries **`opacity: 0.5`** against `opacity: 1` on the selected zone's. Rendered pixels agree, over identical shrub artwork: contrast standard deviation 20.7 selected against 13.9 default, with the field lightening from 60 to 75. **B is eliminated**, so A's one-wrapper cost is the cost.

**Measured in an earlier pass**, which had narrowed it to a straight A-versus-B choice and priced A: C is not a third answer, it is how A gets built, and it works. Probing it live (a wrapper at `opacity: 0.5` holding `.terrainImage` with its filter intact plus a `#424F12` texture sibling) painted the texture `rgb(160, 148, 134)`, an exact 50% composite of `#424F12` over the panel, so the hue survives and only the strength changes. Nesting the texture the other way, inside the filtered image, painted `rgb(191, 152, 150)` at the same 0.5 opacity. So A costs **one wrapper `<div>` and moving the state opacity off `.terrainImage`**, with the drought filter staying where it is (which matters: `.riverOverlay` is a child of `.terrainImage` and is drought-filtered today, and this leaves that alone). B costs nothing at all. Neither is expensive, so the decision was always going to be whichever reads right, and the board says A.

### RESOLVED: How does a grayscale tile become drought-colored ink?

**Raised from WM-48, 2026-08-27**, while deciding whether WM-48 should export its ink derivation. It could not be decided there, because it depends on an answer this spec does not yet give.

**That deferral is discharged by decision E below, and this is where it lands.** WM-48 shipped with the derivation private, on the recorded grounds that WM-53's recoloring mechanism was undecided and that a mask plus a color needs the hexes while a CSS filter chain needs none. The mechanism is now decided, it is a mask plus a color, so the hexes are needed and WM-48's reason for withholding them no longer applies. Do not re-open it as a question against WM-48: exporting is this story's work.

**Context**: this spec requires *"the texture's ink color follows the zone's drought level"*, but the four tiles carry no color to follow it with. Counted across all four files in `src/public/terrain-textures/`, they contain exactly two values:

```
201  #2A2A2A   glyph strokes
  4  #808080   background rect, full 256 x 256
```

Pure grayscale, fully opaque. Used as a plain CSS `background-image`, a tile paints dark-gray glyphs on a mid-gray field, identically in every zone at every drought level, and its opaque background hides whatever is behind it. So a recoloring mechanism is required and none is specified. Every other decision here (position, ordering, opacity, `mask-size: 112.5px`) is settled; this one is not, and it is the one that makes the requirement achievable.

**What the board draws, read off the raw layer data 2026-08-27**: inside every `Zone N Texture` group the tile instances are paths with `fills: []` and a stroke border of `1.32px` in the drought ink. The 3-zone Adjust Conditions artboard strokes `#004001` on its no-drought zone, `#2D460B` on its mild one and `#424F12` on its medium one, which is WM-48's derived palette exactly. So the design is **ink strokes on a fully transparent field**, and the tile's `#808080` rect is not painted at all. The `1.32px` also confirms the tile scale: `stroke-width="3"` on a 256 viewBox drawn at 112.5px.

**Options considered** (each built as a real 120x100 layer over a `#C1E27B` terrain stand-in, rendered in Chromium and sampled; correct is a field left byte-exact at `rgb(193,226,123)` with a glyph core of `rgb(66,79,18)` = `#424F12`):

| mechanism | field pixel | glyph pixel | verdict |
|---|---|---|---|
| A) `mask-image: url(tile)` + `mask-mode: luminance` + `background-color: <ink>` | `(129,153,70)` | same as field | broken |
| A') as A, subtracted from a white gradient so alpha is `1 - luminance` | `(130,152,71)` | `(87,103,35)` | broken |
| B) the tile as a plain `background-image`, recolored by a CSS `filter` chain | `(128,128,128)` | `(42,42,42)` | broken |
| C) sixteen pre-colored SVG copies, one per vegetation per drought level | not measured | | works, forks the asset |
| D) fetch the tile, string-replace its two hexes, use the result as a data URI | `(193,226,123)` | `(66,79,18)` | exact |
| E) re-author the tile's field to `fill="none"`, then `mask-image` (alpha) + `background-color: <ink>` | `(193,226,123)` | `(66,79,18)` | exact |
| F) an inline SVG `feColorMatrix` mapping luminance to alpha and RGB to the ink | `(193,226,123)` | `(66,79,18)` | exact |

A fails for a structural reason worth recording, because it is the obvious first idea: the tile's two values are `0.50` and `0.165` luminance, not `1.0` and `0.0`. Any direct luminance mask therefore lays a roughly 50% ink wash across the whole thumbnail and leaves the glyphs *lighter* than the field around them. No `mask-composite` arrangement fixes that; only a remap (F) or a re-authored asset (C, E) does.

**Decision**: **E**. The tile's background rect becomes `fill="none"` in all four files, `rasterizeSvg` in `terrain-textures.ts` fills the canvas with `#808080` before `drawImage`, and the Setup panel's texture layer is `mask-image: url(<tile>)` with `background-color: <ink>`.

It is the only option where the asset, the 3D shader and the Setup panel agree with no translation layer between them: the file itself becomes what the board draws, ink strokes on nothing. The CSS is four properties with no magic numbers, no fetch and no filter defs, which is what D and F each cost in their own way. The one risk, that changing a tile changes what the shader renders, is measured at zero: rasterizing `grass.svg` and its `fill="none"` twin at 512 and diffing the red channel WM-48 packs gives **0 differing texels out of 262,144**, because compositing a transparent-field tile over gray is the same operation as rasterizing it against a gray rect.

**What this needs from WM-48**: the five ink hexes, which today exist only inside `terrain-glyph-colors.test.ts`. The derivation moves into `terrain-colors.ts` as production code and the test asserts the two agree, rather than being the only place the values exist. `TILE_DIR` and `VEGETATION_TILE_FILES` are already exported and are used unchanged.

**AMENDED 2026-08-28: PR #140 merged, so these edits land here rather than there.** This paragraph previously said the tile and `rasterizeSvg` changes would ride along on WM-48's files "while PR #140 for that work is still open". It merged on 2026-08-27 as `c692687`. Nothing about decision E changes, but three edits move into this story's own PR, against shipped code:

1. The ink derivation moves from `terrain-glyph-colors.test.ts` into `terrain-colors.ts` as production code, with the test asserting the two agree.
2. The background rect in all four tiles becomes `fill="none"`.
3. `rasterizeSvg` fills the canvas with `#808080` before `drawImage`.

**The consequence worth planning for is blast radius, not effort.** Edits 2 and 3 are to the 3D terrain's own assets and loader, so this story now changes what the model renders, not only what the Setup panel renders. The **0 differing texels out of 262,144** measured above stops being a reassurance recorded in a spec and becomes the regression evidence this story's PR has to carry, in the same shape as WM-48's own 0-of-1,409,280 pixel comparison. Re-measure it on the head commit rather than quoting the figure above.

---

### RESOLVED: The texture ordered *before* `.terrainImage` is invisible in almost every state

**Measured live 2026-08-27** against a running dev server, at 1440 x 900 and again at 950 x 880, on `?preset=plainsTwoZone`.

**Context**: this spec requires the texture layer to be *"`position: absolute; inset: 0`, a sibling of `.terrainImage` inside `.terrainPreview`, **ordered before it**"*, on the reasoning that ordering it after would paint over the river. Painting order does not work out that way here.

A magenta probe `div` was inserted exactly as specified, absolutely positioned and ordered before `.terrainImage`. It covers the image rect precisely (both `354,162,120x100`), and it is **not visible**:

| zone state | `.terrainImage` | probe pixel |
|---|---|---|
| selected, mild drought | `opacity: 1`, `filter: hue-rotate(327deg) saturate(0.8) brightness(1.15)` | `rgb(133,173,31)`, terrain shows through |
| unselected | `opacity: 0.5`, no filter | terrain blended over the probe |
| filter stripped, opacity 1 | neither | `rgb(255,0,255)`, probe visible |
| probe given `z-index: 1` | either | `rgb(255,0,255)`, probe visible |

**The mechanism is stacking contexts.** A CSS `filter` creates one, and so does `opacity` below 1. Either promotes `.terrainImage` out of the plain in-flow block painting step and into the same step as positioned descendants, where DOM order decides, and `.terrainImage` comes later. So it paints **above** a preceding absolutely-positioned sibling.

Since a zone always carries a drought filter, or a state opacity below 1, or both, the only state where the drawn rule yields a visible texture is a **selected, no-drought** zone. That is an unusually cruel failure: it works in the one state a developer is most likely to be looking at while building it, and fails everywhere else.

**Options considered**:
- A) Keep the DOM order and add an explicit `z-index` to the texture layer. Verified to work above. Needs a comment saying what it defends against, since the reason is invisible.
- B) Order the texture after `.terrainImage`, which is what the river-overlay concern was avoiding. The river lives inside `.terrainImage`, so this would paint over it.
- C) Give `.terrainPreview` an explicit stacking context and order both children by `z-index`.

**Decision**: **B**, and the river concern that ruled it out was wrong about the design. The board's raw layer data settles it: inside each zone the stacking order bottom to top is `Zone N Highlight`, then the terrain group, then `Zone N Texture`, then `Vegetation Type`, then `Zone N Label`, and **`2-zone River Left` is a child of the terrain group**, one level below the texture. Rendering the ON artboard confirms it by eye: the glyphs cross the blue river line rather than stopping at it. So the texture is *supposed* to sit above the river, and the ordering rule this question was defending never had a design behind it.

That also makes A and C unnecessary. Ordered after `.terrainImage`, an absolutely positioned `z-index: auto` sibling paints above it in every state, whether or not `.terrainImage` has formed a stacking context, so no `z-index` is needed and there is no invisible mechanism to comment. Verified across all four state combinations (selected and unselected, drought and no drought) with a magenta probe in the wrapper arrangement: the probe reads `rgb(255,0,255)` at full strength and `rgb(255,127,255)` under the wrapper's 0.5, over the terrain and over the river alike.

**Consequence for `.vegetationPreview`**: the badge is a child of `.terrainImage` today, so ordering the texture after `.terrainImage` covers it, while the board draws it above the texture. The badge moves out to be a sibling ordered after the texture layer, and it has to: `.terrainImage`'s filter forms a stacking context that traps its descendants, so no `z-index` on the badge could lift it above the texture. It loses the drought filter by moving, and that **does** change how it renders. `hue-rotate` and `saturate` are identity on a gray, but `brightness` is a multiply and the icon is gray rather than white, so today the icon's dominant gray tracks the drought level: 188 at no drought, 216 at mild, 244 at medium and 226 at severe (**measured 2026-08-28**; 232 of the badge's 784 pixels change). At medium drought that is 244 on a 255 white chip, which is to say drought progressively washes the vegetation icon out of its own badge. After the move the icon is a solid 188 at every level, matching what an undroughted zone already renders, so the change removes a washout rather than introducing a new appearance. The move is layout-neutral: `.terrainImage` is `position: static`, so the badge already resolves against `.terrainPreview` and its box is unchanged.

**Note**: the existing Jest assertion that the texture is "ordered before `.terrainImage`" pins a rule that, on its own, guarantees the texture is hidden. It is replaced by the opposite assertion, and the Cypress pixel check this spec already recommends is what would actually catch a paint-order regression.

---

### RESOLVED: Who owns the 2x terrain re-export and the `foothills` to `hills` rename?

**Context**: The board's Exportable Assets section carries all 20 terrain PNGs at **2x** (2-zone at 240x200, 3-zone at 160x200) under the note *"Note: these are implemented at 0.5× in the Setup screens"*. The repo's PNGs are 1x today (verified: `2-zone-plains-left.png` is 120x100) and render at exactly their intrinsic size, so the note describes a change, not the status quo. Separately, every board asset is named `hills` where the repo says `foothills`, which is WM-39's display rename reaching the filenames. Neither is mentioned in WM-53's description, and neither is needed for the texture overlay to work. But both live on this board, and `zone-selector.tsx:9-16` builds the path from `TerrainType[t].toLowerCase()`, so a filename rename is a code change, not just an asset swap.

**Options considered**:
- A) Out of scope for WM-53; raise it with Michael as its own ticket.
- B) In scope: take the 2x assets and the rename here, since this story is already in `zone-selector`.
- C) Take the 2x re-export (a pure asset swap, no code) and leave the rename to its own ticket, since the rename touches the `TerrainType` mapping that WM-39 deliberately left alone.

**Decision**: **B, both in scope for WM-53.** Doug's call, 2026-08-27, over a recommendation to split them out. The rename is unblocked and lands here. The 2x re-export is blocked on an asset Michael has to send, for the reason measured below, and it lands here as soon as it arrives.

**REOPENED 2026-08-28, on the calendar rather than on new evidence about the assets.** The asset has not arrived: WM-53's ticket was last touched 2026-08-27 04:44, its only attachment is from 08-23, and it carries no comments. Michael was active on WM-49 overnight and did not touch this. Sprint 24 ends Monday 08-31, and Friday is the only clear build day, so under B this story cannot close inside the sprint no matter how the build goes, because one of its three parts is waiting on someone else.

The choice is unchanged in substance and changed in timing:

- **B, as decided**: keep all three parts here. The story stays open until the assets land, and the texture work sits finished but unshipped behind them.
- **C**: take the texture work and the `foothills` to `hills` rename now, split the 2x re-export into its own ticket. The file-churn argument for B was that this story is already working in `zone-selector` and swapping the art later means touching the same files twice. That cost is real but it is bounded: the 2x swap is an asset replacement plus the intrinsic-size rule, and it does not touch the texture layer this story adds.

**Decision**: **C.** Doug, 2026-08-28, superseding the 2026-08-27 call for B. The texture layer and the `foothills` to `hills` rename ship in this story; the 2x art moves to its own ticket and lands when Michael sends it.

**SUPERSEDED 2026-08-29 by A, the option this question opened with.** Doug, after the implementation self-review priced the rename properly. Both non-texture items are now out: the 2x art on its own ticket, and the rename with it for the 5 thumbnails it actually covers, with the 14 data files not renamed at all. What changed the answer was not the argument but three measurements the earlier passes had not made. The board's asset list names only the 5 thumbnails and carries no heightmap or island assets, so 14 of the 19 files had no design motivation. `elevation`, `unburntIslands` and `zoneIndex` are all URL-overridable config keys, so renaming those 14 breaks a public surface, and it breaks by hanging rather than degrading. And the rename cost WM-53 three obligations that are not code: a pre-merge check, a named item in the closed spec, and a Slack message to Trudi. See *Why the terrain filenames are not being renamed* for the full reasoning; the analysis below stands as the record of how the file count and the two derivation sites were established.

Two things decided it. **The file-churn argument for B does not survive measurement**: the 2x swap is 20 binaries and nothing else, because `.terrainImage` and `.riverOverlay` are both `background-size: cover` on a 100% x 100% box, so the asset's intrinsic size never reaches layout. Verified live on 2026-08-28 by swapping a synthetic 240x200 image into the running Setup panel's Zone 1 thumbnail: the box stayed 120x100 and the image scaled correctly. So the swap shares no files with the texture layer, and deferring it costs a ticket rather than rework. **And the calendar**: the asset has not arrived, Sprint 24 ends 08-31, so under B this story could not close no matter how the build went.

**What the board's assets actually are, measured 2026-08-27**, because the pricing in this question was wrong in both halves.

The 20 exportable terrain assets export as **low-contrast gray relief** (`2-zone-plains-left` spans 88 to 136 around a modal 128), not as the green art the repo ships. The color in the artboards' zone thumbnails comes from a layer above the relief: inside each zone the board draws `2-zone-plains-left-multiply` with a solid per-drought color set to `blend-mode: multiply` over it. Those four tint colors are `#02D40A`, `#92D637`, `#C1E245` and `#C8A145`, which are **exactly** `getTerrainColor`'s four values in `terrain-colors.ts`. So the board is proposing the Setup panel share the 3D model's drought palette instead of the hue-rotate chains at `zone-selector.scss:63-80`.

**The gray assets cannot be turned into the artboard's thumbnails from our side.** The zone composite correlates with the gray relief at **0.92**, so it is built from it, but no standard blend reproduces it: fitting the rendered composite against relief-plus-tint gives rms errors of 47.6 (multiply), 28.8 (overlay), 28.8 (hard-light), 29.3 (soft-light) and 26.2 (`color`), where a real match would be under about 5. A per-channel affine fit *does* land (rms 2.6 to 3.6), but with coefficients that are not consistent with any tint-times-relief model, so it cannot be reconstructed as a rule.

**And the board's terrain is new artwork, not a re-export of ours.** Our current green PNGs carry almost none of that relief detail: correlation with the gray relief is **-0.01**, and `2-zone-plains-left` spans only 24 to 31 in red and 157 to 202 in green. The board's version has genuine 2x detail (high-frequency energy 0.187 against 0.053 for our art upscaled). This is a visual upgrade, not a resolution bump.

**So the ask to Michael is for flattened, colorized terrain art at 2x**, no-drought state only (our drought shading is applied in code on top), with the river assets on the full 240x200 thumbnail canvas rather than cropped to the river's bounding box, which is how they export today (`2-zone-river-left` comes out 240x38).

**The rename is 19 files across two loaders, not five.** `TerrainType[t].toLowerCase()` has two call sites: `zone-selector.tsx:11` builds the 5 `foothills` thumbnail names, and `data-loaders.ts:13` builds the heightmap and island filenames, which is **14 more** files in `src/public/data/`. `TerrainType.Foothills` stays as the enum member and the logged value, per WM-39's split between `terrainLabels` (wire format) and `terrainDisplayLabels` ("Hills"); the filenames are derived through a map rather than by renaming the enum.

**Measured in this pass**: the repo PNGs are confirmed 1x (2-zone 120x100, 3-zone 80x100, all 15 decoded), so the board's *"implemented at 0.5x"* note does describe a change. The two halves are priced very differently and should probably not travel together. The 2x re-export is **20 files and no code**, since `.terrainImage` is `background-size: cover` at a fixed box and would consume a 2x asset unchanged. The rename is **code**: `getBackgroundImage` at `zone-selector.tsx:9-16` derives the filename from `TerrainType[t].toLowerCase()`, so `foothills` to `hills` means either renaming the enum member (which `terrainLabels` at `types.ts:40` documents as wire format, logged and matched by the Hazbot engine) or introducing a filename map, which is the same shape WM-39 solved with `terrainDisplayLabels`. That asymmetry is what makes C a real option rather than a compromise.

### RESOLVED: How is the texture tiled and scaled inside a 120x100 (or 80x100) thumbnail?

**Decision**: **A**, `mask-repeat: repeat` at a fixed **`mask-size: 112.5px 112.5px`**, the same on both layouts. (The properties are named `background-*` in the options below, which was the framing before decision E made the tile a mask rather than a background image; the `mask-*` pair is what actually tiles it.) That is roughly one repeat across a 120px 2-zone card and 0.7 across an 80px 3-zone card.

**Confirmed by Michael 2026-08-27, and the exact value is 112.5 rather than the 113 measured below.** A nudge had gone out offering 36px as a stated default so silence would unblock rather than stall; he overrode it and gave the board's own number: *"in the spec, from the 256x256 tiles, they're 112.5px x 112.5px, so something close to that (which makes the line width 1.32px)"*. So the three measurements below were right and were rounding: 112.5 + 7.5 = 120 is the split exactly, where Sketch reported 113 + 8. His parenthetical is an independent check on WM-48's authored stroke width rather than a new number here, since 3 ÷ 256 × 112.5 = 1.32.

**Context**: The model's tile is a 256x256 SVG whose scale on the terrain is governed by `terrainTextureTileFt: 18000`, a value WM-48's spec notes must be counter-intuitively large or the glyphs mipmap away. None of that machinery exists in CSS. Too small and the texture reads as noise at thumbnail size; too large and a zone shows one or two glyphs.

**Options considered**:
- A) `background-repeat: repeat` with an explicit `background-size` chosen to put a defined number of glyphs across a zone, measured against the board's rendered example.
- B) One non-repeating instance scaled to cover the zone, accepting that the glyph scale then differs between 2-zone and 3-zone thumbnails.
- C) Ask Michael for the intended glyph count per zone, since the `Example of Textures (Vegetation Key)` bitmap shows the intended density but is not measurable.

**Measured off the board 2026-08-27, three ways that agree, so it does not need asking.** The `Example of Textures (Vegetation Key)` bitmap turned out to be a render of the **3D model**, not of a Setup thumbnail, so it was never the right evidence. The Setup panel's own ON artboards are, and they are vector:

1. **Sketch instance geometry.** Each `Zone N Texture` group holds tile instances that abut exactly. A 120px 2-zone card splits **113 + 8** (`x` 738 w 113, then `x` 851 w 8, against a card spanning 738 to 858), i.e. one full period of 113 plus the wrap remainder.
2. **Horizontal autocorrelation** of the rendered card peaks at **113.0px**, with the intra-tile glyph pitch at 16.5px.
3. **Glyph-density back-calculation.** The source shrub tile carries 53 glyph blobs in its 256px viewBox; the cards measure 3.6 to 4.2 blobs per 1000 px², which puts the tile at **113 to 122px**.

**So the answer is about 113px, and it is neither candidate this question was built around.** (Michael has since given the authored value as 112.5, which is what these three were rounding; see the Decision above.) The model's own scale implies 36px; "nearer 60px" was a misreading of the board. The board draws the texture roughly **3x coarser than the model does**, which is a deliberate thumbnail-legibility choice and the thing the question was really asking about.

**Option B is dead on the evidence, not on the argument.** Glyph density per unit area is the same on 2-zone and 3-zone cards (3.9 ± 0.3 per 1000 px²), so the tile is a fixed size rather than stretched to fit the card.

**Measured in an earlier pass**, when the question was still open. Option A is the mechanism, and the only free parameter is `background-size`. Deriving it from the model instead of the board: `terrainTextureTileFt: 18000` over the 120,000 ft `modelWidth` puts a 2-zone card (120px over 60,000 ft) and a 3-zone card (80px over 40,000 ft) at the same 0.002 px/ft, so the model's own scale is **a 36px tile on both layouts**, i.e. 3.33 repeats across a 2-zone card and 2.22 across a 3-zone one. That reasoning holds and the measurement above confirms its consequence: because the two layouts sit at the same ground scale, one fixed `background-size` serves both, which is what the board draws. The **60px** estimate in this paragraph came from eyeballing "roughly two instances across a 2-zone card" and is superseded by the three measurements above; it is one instance, at 112.5px.

### RESOLVED: Is the texture clipped to the zone's terrain silhouette, or to the rectangle?

**Context**: On the board each `Zone N Texture` group's children are split into uneven pieces (for the 2-zone Conditions artboard, one 113px piece and one 8px piece across a 120px zone), which is consistent with the texture being masked to the shape of the terrain rather than filling the box. The zone thumbnails are rectangles today: `.terrainImage` fills the whole 120x100 with `background-size: cover`.

**Options considered**:
- A) Fill the rectangle. Simple, and acceptable if the terrain art has no sky worth protecting.
- B) Mask the texture to the ground using a per-terrain-type mask asset, which means 15 new mask files.
- C) Use the terrain PNG itself as a CSS `mask-image` and rely on its alpha, if the PNGs carry an alpha channel that separates ground from sky.

**Decision**: **A, fill the rectangle**, because this question rested on a premise that is false. The draft asserted that "the terrain art runs edge to edge with sky above it in the plains and hills images". It does not. All 15 terrain PNGs were decoded: every one is **PNG color type 2, truecolor with no alpha channel**, and every one contains **zero blue-dominant pixels** at any row, top included. The art is top-down shaded relief that is green from edge to edge, so there is no sky in the thumbnail to protect and nothing for a texture fill to spill onto.

That collapses the other two options rather than merely losing to them. C is impossible, not just unattractive: there is no alpha channel to mask from, which was C's entire premise. B would commission 15 mask assets to protect a region that does not exist. The uneven group children on the board are what Sketch does to a tiled fill clipped to its frame, which is exactly what `mask-repeat: repeat` inside a fixed box produces anyway.

One thing the fill has to take a position on, since it is the real edge case the question was circling: the **river**. `.riverOverlay` is the one piece of the thumbnail that is not ground, and it is the only art in the folder with genuine transparency. **The board textures it.** `Zone N Texture` sits above the whole terrain group, and `2-zone River Left` is a child of that group, so the glyphs cross the river line; the rendered ON artboard shows this plainly. The texture layer is therefore `position: absolute; inset: 0` (which resolves to the same 120x100 / 80x100 rect, since `.terrainPreview` is border-box with a 4px border), ordered **after** `.terrainImage`.

**This diverges from the 3D model, and it is worth someone confirming.** WM-48's shader zeroes the glyph weights over river cells, so the model leaves rivers untextured (`terrain-shader.ts:266`). The panel has no per-cell weights to do the same with: the river is one alpha PNG drawn over the whole card, so matching the model would mean hoisting `.riverOverlay` out of `.terrainImage` to sit above the texture and carrying the drought filter class with it. That is a handful of lines, not a redesign, so cost is not what decides it. The board is followed here because it is the design of record for this panel and it draws the textured river deliberately, at a scale where the river is a one-pixel line.

### RESOLVED: Does the wind screen's read-only recap get the texture, and does that change what the badge does?

**Context**: The board draws the texture on all four ON artboards, including both Adjust Wind screens, so the recap is textured. That is settled. What it raises is a second-order question the board does not answer: on that screen `.vegetationPreview` is suppressed (`readonly`), so the texture becomes the only vegetation signal inside the picture, backed by the `terrain-summary.tsx` icon rows below. If a student turns the key off on the wind screen, the picture loses its only vegetation cue and the summary rows carry it alone. That is probably fine and is what the OFF artboard draws, but it is worth confirming rather than assuming.

**Options considered**:
- A) Ship as drawn: texture on the recap, badge stays suppressed, summary rows unchanged.
- B) Show the badge on the recap when the key is off, so the picture always carries some vegetation cue.

**Decision**: **A, ship as drawn.** Doug, 2026-08-28. Not routed to Trudi in the end. The board is the design of record for this panel, it draws the recap textured with the badge suppressed, and the layer data below shows that absence is deliberate rather than an omission the texture happens to cover. B would add a cue the board does not draw, to a screen that is read-only by design, which makes it a product change rather than an implementation choice. Nothing in this story needs it decided to be built.

**The board's layer data, read 2026-08-27, shows the badge's absence is deliberate rather than an omission the texture happens to cover.** Listing each zone group's children across the four artboards:

| screen | key | zone children on the board |
|---|---|---|
| Adjust Conditions | OFF | terrain, **Vegetation Type**, label |
| Adjust Conditions | ON | terrain, **Zone N Texture**, **Vegetation Type**, label |
| Adjust Wind | OFF | terrain, label |
| Adjust Wind | ON | terrain, **Zone N Texture**, label |

The badge is absent from the Wind artboard in **both** key states, so it is not that the texture replaced it. That matches `zone-selector.tsx:72`, which gates `.vegetationPreview` on `!readonly`.

**Re-checked against the board 2026-08-27, and it confirms the premise rather than dissolving it.** Cropping the key-OFF *Adjust Wind* artboard against the key-ON one: the two are identical except that ON adds the texture to the picture. The rows beneath (terrain type, then vegetation icon plus name, then droplet plus drought) are the existing `terrain-summary` rows and are **byte-for-byte the same in both states**, so nothing relocates into them and the badge does not reappear. With the key off the recap picture carries plain drought-tinted terrain and no vegetation cue at all, exactly as measured live below. **So this stays a product call**, and the board has no opinion to borrow: it draws the state, it does not say whether the state is acceptable.

**Measured in an earlier pass**: confirmed live on `?preset=hillThreeZone`. On the Adjust Wind recap every zone's `.terrainImage` is at opacity 1 with its drought filter applied, and `.vegetationPreview` is absent from the DOM entirely, because `zone-selector.tsx:72` gates it on `!readonly`. So with the key off, the three recap pictures differ only by terrain type and drought tint, and vegetation is named nowhere inside the picture. That is today's behavior, unchanged by this story; what changes is that the picture becomes *able* to carry it. The Education Material Developer finding below is the same call, so one answer covers both, and WM-48's own default-off question is its parent.

## Self-Review

### Senior Engineer

#### RESOLVED: The sibling-not-child rule is the whole story and nothing enforces it

The measured finding above is that a texture nested inside `.terrainImage` gets its color rewritten by the drought filter. The natural place for a future developer to put a texture overlay is exactly there, next to `.riverOverlay`, because that is the existing precedent in the same file. Nothing in the code will stop them, nothing will look wrong at no-drought (where there is no filter), and the bug appears only on mild, medium and severe drought as a hue shift that reads as a design choice. Suggested resolution: add a structural test asserting the texture layer is not a descendant of `.terrainImage`, and put the reason in a comment on the element itself rather than in this spec, since specs do not survive into the file.

**Decision**: accepted as suggested, and it is now a requirement, with one addition the re-measurement turned up. Both structural rules have to be guarded, not just one: the texture layer must be **not a descendant of `.terrainImage`** (or the drought filter rewrites its hue) and it must be the sibling that comes **after** `.terrainImage` (or it is hidden by it in every state that carries a filter or a sub-1 opacity). Both are readable off the DOM in jsdom, so both are cheap Jest assertions in `terrain-panel.test.tsx`, and both fail if someone reaches for the obvious `.riverOverlay`-shaped answer. The comment belongs on the element, not here, and it should say what breaks rather than restate the rule, since the rule is guessable and the reason is not. Note what these assertions can and cannot do: they pin structure, and the property anyone actually cares about is a painted color, which jsdom cannot see. That is the QA finding below, and the two should be written as a matched pair so the proxy is never mistaken for the guarantee.

---

#### RESOLVED: `getBackgroundImage` is string concatenation over an enum and this story adds a second such path

`zone-selector.tsx:9-16` builds `./terrain/${zoneCount}-zone-${TerrainType[t].toLowerCase()}${position}.png` with no compile-time guarantee the file exists, which is why the `foothills` / `hills` question is a real hazard rather than a cosmetic one. WM-53 will add a second URL built the same way, from `Vegetation[v]` into `src/public/terrain-textures/`, and that mapping is not identity: `Vegetation.ForestWithSuppression` lowercases to `forestwithsuppression`, while the file is `forest-with-suppression.svg`. Suggested resolution: build the texture path from an explicit `Record<Vegetation, string>`, for which `vegetationLabels` in `types.ts:23` is the in-repo precedent, rather than from enum-name arithmetic, and assert in a test that every entry resolves to a file that exists in the repo.

**Decision**: accepted, and the map should not be a new one. WM-48's loader already declares exactly this: `terrain-textures.ts` on the prototype branch has `const VEGETATION_TILE_FILES: Record<Vegetation, string>` mapping the four types to `grass.svg`, `shrub.svg`, `forest.svg` and `forest-with-suppression.svg`, which is the same four filenames WM-53 needs from the same directory. So the answer is to **export that map from WM-48's module and import it here**, not to write a parallel one: a filename that has to agree in two places is the failure this codebase keeps being reviewed for, and the hyphenated `forest-with-suppression` against `Vegetation[3].toLowerCase()` is precisely where two copies would drift. The finding's hazard is real and confirmed: the mapping is not identity in one of four cases.

Two implementation details that follow, both verified: the path has to be set as an inline `style={{ backgroundImage: url(...) }}` in the TSX, the way `zone-selector.tsx:69-71` already does for the terrain PNG, and not as a `url()` in the SCSS module, because css-loader would try to resolve it at build time against `src/components/` where the tiles do not live. And this is a WM-48 dependency of a different kind from the flag: it is an export, so if WM-48's module is not final yet, the fallback is a local map with a comment naming it as temporary.

---

### QA Engineer

#### RESOLVED: The only test that could catch the real failure cannot run in jsdom

The requirement this spec is built around is a *painted color*, and jsdom applies no stylesheet filters, so a Jest test asserting the texture's color passes whether the layer is nested or not. That is the exact "test that cannot fail" shape. The structural assertion (not a descendant of `.terrainImage`) does catch the regression and does run in Jest, but it pins a proxy rather than the property anyone cares about. Suggested resolution: state in the spec which assertion is the real guard and which is the proxy, add one Cypress case that samples the texture's painted pixel at medium drought, and if that is judged too expensive, say so explicitly rather than letting the Jest test imply coverage it does not have.

**Decision**: accepted, and the spec now says which is which rather than leaving it implied. The Jest assertions (not a descendant of `.terrainImage`, and ordered after it) are **proxies**: they pin the two structural facts that cause the bug, and they are worth having because each one fails if deleted, which is the bar this repo holds tests to. The **guarantee** is a painted color, and it needs a pixel check. Recommend one Cypress or Playwright case rather than a suite: render the Setup panel with the key on and a **selected** zone at medium drought, scan the texture layer's pixels, and assert that the one nearest the ink is within a small tolerance of `#424F12`. One case is enough because the failure is not per-drought-level, it is structural: the same wrong parent breaks all three filtered levels identically and none of them at no-drought, so a single medium-drought sample catches every instance of it.

**Do not write it as a byte-exact sample at a fixed coordinate. Measured 2026-08-28 against a live prototype, that test is not writable.** At the board's `mask-size: 112.5px` a byte-exact `rgb(66, 79, 18)` pixel does exist, but it is vanishingly rare: **2 of 12,000** on a selected shrub card and **7 of 12,000** on a grass one. Chromium rasterizes the mask at the tile's intrinsic 256px and then downscales it, so a `stroke-width="3"` line drawn at 0.44x almost never fills a whole destination pixel; at `mask-size: 225px` the same card yields 945 of 12,000, which confirms the mechanism rather than leaving it a guess. Two things follow for whoever writes the case. It has to run on a **selected** zone, because at the 0.5 default opacity the ink composites with the terrain and is never exact at any pixel. And it has to scan the layer rather than sample a coordinate, asserting a tolerance rather than byte-equality, because a 2-pixel margin is one Chromium antialiasing change away from zero. The tolerance costs nothing, because the discrimination is enormous: correct is squared distance 0 from the ink, while the nested-inside-`.terrainImage` failure lands on `rgb(128, 88, 49)` at a selected zone, squared distance 4,886 (and `rgb(191, 152, 150)` at an unselected one). A band of ±30 per channel separates the two by roughly a factor of two. If that pixel case is dropped for cost, this spec's position is that the story then has **no** coverage of its central requirement, and the Jest tests must not be described as if it does.

---

#### RESOLVED: No stated expectation for the key toggling while the wizard is open

The requirements say the texture updates when vegetation or drought changes, and they say it is absent when the key is off, but nothing says what happens when the student toggles the key *while the Setup panel is open*. The switch is in the bottom bar and WM-48 marks it "always available", so this is reachable. Suggested resolution: state it explicitly, and note that the zone components are MobX observers, so if the flag is an `@observable` on `UIModel` this is free and the requirement is a test rather than work.

**Decision**: accepted, and the "free" half is confirmed rather than assumed. `TerrainPanel` is wrapped in `observer` (`terrain-panel.tsx:35`), and `renderZones` is a plain function it calls during its own render rather than a component of its own, so a read of an `@observable` flag inside that subtree is tracked by `TerrainPanel`'s reaction and re-renders the cards. WM-48's spec resolves the flag as an `@observable` on `UIModel`, so the condition holds and the behavior costs nothing. The requirement is therefore: **toggling the Vegetation Key while the Setup wizard is open adds or removes the texture on the open screen immediately, on both the Conditions and the Wind screens**, and it is covered by a Jest test that flips the flag on the store and asserts the layer appears and disappears, which is the same shape as the existing `terrain-panel.test.tsx:508` test that drives the panel by writing to `ui`.

---

### Product Manager

#### RESOLVED: The dependency on WM-48 is stated but not scheduled

The spec says WM-53 cannot start before WM-48 lands the switch, and both stories sit on Friday Aug 28 in the current plan alongside WM-49, which is 8 points on one day with WM-48 at the front of a hard chain. The risk is not the sequencing, which is correct, but that a slip in WM-48 does not just delay WM-53, it blocks it entirely. Suggested resolution: identify what part of WM-53 is startable before the flag exists (the layer, the asset path, the tiling, everything except the condition) so the two can overlap, and record that the fallback is a locally stubbed boolean.

**Decision**: dissolved, not answered. WM-48 shipped on this branch before WM-53 started: `src/public/terrain-textures/` holds the four tiles, `TILE_DIR` and `VEGETATION_TILE_FILES` are exported from `terrain-textures.ts`, and the switch and its `UIModel` flag are in. There is nothing left to sequence and no stub to write. What survives from the analysis below is the useful half: WM-53's real dependency was always the terrain half of WM-48 rather than the switch half.

**Measured in this pass**, so the overlap can be planned rather than guessed. WM-53 has exactly **two** dependencies on WM-48 and they are not the same kind. The first is the flag, which is one boolean read and is trivially stubbable, so it blocks nothing. The second is the **tile files and their filename map**: WM-53 wants `src/public/terrain-textures/*.svg` and `VEGETATION_TILE_FILES`, neither of which exists on master, both of which arrive with WM-48's terrain half. That is the real dependency, and it is on the half of WM-48 that WM-48's own pointing question proposes to split away from the switch. So if WM-48 is split, WM-53 depends on the **terrain** half and not the switch half, which is the opposite of what "gated on the switch" implies and changes which order these can land in. Everything else here (the layer, its position and ordering, the state opacity, the tiling, the tests) is startable today against four copied tiles and a stubbed boolean.

---

### Education Material Developer

#### RESOLVED: Turning the key off leaves the wind screen with no vegetation cue in the picture

The wind screen suppresses the vegetation badge entirely, so with the key off a student reviewing their setup sees three terrain pictures that are visually identical regardless of what they chose, with the vegetation named only in the summary rows below. That is today's behavior and this story does not make it worse, but this story is the first time the picture *could* carry the information and a decision is being made to let a toggle remove it. Worth being explicit that the default state of the product, key off, is the state where the recap is least informative. Suggested resolution: note it as a known consequence of WM-48's default-off decision rather than reopening that decision, and let the fifth Open Question carry it.

**Decision**: carried by the fifth open question's answer, as this entry anticipated: **ship as drawn**. Doug, 2026-08-28. The consequence is recorded as a known one, following from WM-48's default-off decision rather than reopening it: the key-off recap is the least informative state of the product, and the `terrain-summary.tsx` rows carry the vegetation there alone.

**Skipped in the second pass as unanswerable by evidence**: no measurement decides whether a recap with no vegetation cue in the picture is acceptable. The one fact worth carrying is already measured above: `.vegetationPreview` is absent from the recap's DOM entirely, not merely faint, so with the key off the picture carries nothing and the `terrain-summary.tsx` rows carry it alone. Answer the fifth question and this one is answered with it.
