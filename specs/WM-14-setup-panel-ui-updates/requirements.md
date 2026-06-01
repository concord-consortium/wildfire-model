# WM-14 — Wildfire Setup panel UI/UX updates

Lightweight checklist sourced from the Jira ticket. Bullets get ticked off as we work through them interactively against Zeplin. Covers both 2- and 3-zone models.

Overall direction (from Jira): make the panel **less tall but wider**, swap in updated assets, increase label sizes, reposition, fix hover/select states, fix hit areas.

> **Working style:** verify each bullet visually against Zeplin before ticking it (screenshot the running app, compare to the artboard, check rendered box dimensions). Fill the reference tables and per-item notes as values are confirmed.

## Architecture map (read this first in a fresh session)

The Setup dialog is a **3-step wizard** in [terrain-panel.tsx](../../src/components/terrain-panel.tsx), wrapped in MobX `observer`. `currentPanel` state (0/1/2) selects the step; `firstPanel` is 0 only when `config.zonesCount` is undefined (the model-choice step is shown), otherwise 1. The whole dialog is gated on `ui.showTerrainUI`. Local wizard state (`zones`, `windSpeed`, `windDirection`, `selectedZone`) is committed to the simulation only on **Create** (`applyAndClose`).

Shell elements (all in terrain-panel.tsx / [terrain-panel.scss](../../src/components/terrain-panel.scss), every step):
- **Close button** `.closeButton` (renders literal `X`, [terrain-panel.tsx:237](../../src/components/terrain-panel.tsx#L237))
- **Header** `.header` = "Setup" (Lato 14, white bg)
- **Instructions** `.instructions` = number badge `.setupStepIcon` (the step number) + prompt text from `panelInstructions[]` ([terrain-panel.tsx:24-28](../../src/components/terrain-panel.tsx#L24))
- **Button container** `.buttonContainer .continueButton` (Next / Previous / Create, MUI `Button`)
- Panel background tint via `.background.panel0` (gray), `.zone1/.zone2/.zone3` (red/blue/orange, the conditions step), `.panel2` (`$zoneGreen`, the wind step). Colors come from `common.scss`.

Per-step contents:

| Step | `currentPanel` | What it shows | Components |
|---|---|---|---|
| Model choice | 0 | "number of zones" radio + Next | [ZonesCountSelector](../../src/components/zones-count-selector.tsx) |
| Adjust Conditions | 1 | zone thumbnails; **editable** Terrain Type (2-zone only) / veg / drought | [zone-selector](../../src/components/zone-selector.tsx) `renderZones`, [TerrainTypeSelector](../../src/components/terrain-type-selector.tsx), [VegetationSelector](../../src/components/vegetation-selector.tsx), [DroughtSelector](../../src/components/drought-selector.tsx) |
| Adjust Wind (green) | 2 | zone thumbnails; **read-only recap** of terrain/veg/drought; wind control; Create | `renderZones` (readonly), `renderZoneTerrainTypeLabels`, [TerrainSummary](../../src/components/terrain-summary.tsx), [WindCircularControl](../../src/components/wind-circular-control.tsx) |

Key shared pieces:
- **Zone thumbnails** ([zone-selector.tsx](../../src/components/zone-selector.tsx) `renderZones`): terrain background **PNG** (`./terrain/{2,3}-zone-{terrain}-{left,mid,right}.png`) + river overlay PNG + a vegetation icon preview + "Zone N" label. `readonly` flag (true on step 2) hides the editable veg preview and the radio. The "shortened terrain assets" in the ticket are these PNG backgrounds.
- **Veg + drought icons**: defined once in [vertical-selectors.tsx](../../src/components/vertical-selectors.tsx) as `vegetationIcons[]` / `droughtIcons[]`, imported from `src/assets/terrain/vegetation-*.svg` and `drought-*.svg`. **These SVGs are the WM-26 corrected exports already imported (commit d7832a2).** Used by VegetationSelector, DroughtSelector, TerrainSummary, and the zone thumbnail preview, so any icon change ripples to all four.
- **VegetationSelector / DroughtSelector** share [vertical-selectors.scss](../../src/components/vertical-selectors.scss); both are **vertical MUI `Slider`s** (`track={false}`, custom `thumb`/`rail`/`mark`/`markLabel` classes) with a `.header` label ("Vegetation Type" / "Drought Index") and a `.sliderIcons` column.
- **WindCircularControl** ([wind-circular-control.tsx](../../src/components/wind-circular-control.tsx)): the compass dial ([WindDial](../../src/components/wind-dial.tsx), uses `react-circular-input`), a rotating `wind-symbol.svg` overlay, a single combined `.key` label "Wind Direction and Speed", the wind text, and a **horizontal MUI `Slider`** for wind speed (`speedMarks` 0/10/20/30). NOTE: Zeplin splits this into **separate "Wind Direction" and "Wind Speed" labels** (see line 16 / 19 below), so the combined `.key` likely needs to become two labels.

### Asset status (important)

- **Imported from WM-26 (done):** `vegetation-*.svg` (grass/shrub/fsl/fll), `drought-*.svg` (no/mild/med/severe), `wind-arrow.svg`, `wind-dial.svg`. Do **not** re-export these from Zeplin (WM-26 hand-fixed a border issue; re-export regresses it). The veg SVGs carry a `class="dark-outline"` hook; hide it per-context with `:global(.dark-outline){ display:none }` in the relevant SCSS if needed.
- **Still to re-export from this artboard:** the **terrain background PNGs** = the "shortened terrains". ⚠️ These already exist in the repo at **`src/public/terrain/`** (all 20, served as `./terrain/{2,3}-zone-{terrain}-{left,mid,right}.png` + `{2,3}-zone-river-{pos}.png` overlays) but are the **old taller** versions: 2-zone `120×136`, 3-zone `80×136`. The artboard versions are shortened to **`120×100` / `80×100`** (widths unchanged), so this is a **replace-in-place**, not a fresh import. All 20 are confirmed exportable as PNG (@1x–@4x) via the zeplin-inspect MCP. **Slider thumb assets:** both `Slider Thumb` and `Slider Thumb Small` exist as exportable SVG on the artboard — check which fits. **Wind face/symbol:** `Wind Direction Face`, `Wind Direction Arrow`, and `Wind Symbol` all exist as exportable assets.
- **NOT pulled from WM-26:** the `wind-dial.tsx` `radius` tweak (35→29) and `wind-dial.scss` changes. Only the WM-26 *assets* were taken; the component is still master's version. Reconcile when doing the Wind Direction control (line 18).

## Scope (from Jira), ordered easiest → hardest

Already handled:

- [x] **Title → "Setup"** — done in WM-3 (merged to master), out of scope here
- [x] **Import corrected terrain/wind/drought SVG icons** — from WM-26 (commit d7832a2); see Asset status above

Pure CSS (size/color/background on isolated elements):

- [x] **"Terrain Type" label** — size; add white background. **Confirmed:** the artboard wraps the Lato 14/700 #434343 text in a `Label back` white rect (88×21 behind a 78×17 label, ≈5px horizontal / 2px vertical padding, token `white`). Same `Label back` pattern backs the Vegetation/Drought/Wind labels below. `.terrainSelectorHeader` in [terrain-type-selector.scss](../../src/components/terrain-type-selector.scss). (Per Jira, no reposition for this one.) ✅ Done: `.terrainSelectorHeader` now `fit-content` Lato 14/700 #434343 on white; verified in-app at 86×21.
- [x] **"Vegetation Type" label** — size; white background; position. Shared `.header` in [vertical-selectors.scss](../../src/components/vertical-selectors.scss) (one change covers veg + drought). ✅ Size + white bg done (now Lato 14/700 #434343 on white pill, verified 14px/700/white in-app). Absolute position re-verified in the panel-resize + repositioning pass (panel still 288 vs target 320).
- [x] **"Drought Index" label** — size; white background; position. Same shared `.header` change as above; ✅ verified in-app.
- [x] **"Wind Direction" label** — size; white background; position. The combined `.key` was split into `.windDirectionKey` + `.windSpeedKey` in [wind-circular-control.tsx](../../src/components/wind-circular-control.tsx)/[.scss](../../src/components/wind-circular-control.scss). ✅ Both now Lato 14/700 #434343 on white pills, verified in-app (Wind Direction 104×21, left of dial). The two-line "Wind\nDirection" wrap + final position handled in the wind-control rework + repositioning pass.
- [x] **"Wind Speed" label** — size; white background; position. Now its own `.windSpeedKey` label; ✅ verified in-app (84×21, 14/700 #434343 white, above the speed slider).
- [x] **Instructions number** — background **`#595959`** gray, font Roboto Condensed **14**/700 white, 20×20 badge (all confirmed: Zeplin `Step back`). The current code `#797979` just darkens to `#595959`. ✅ Done: `.setupStepIcon` now 20×20 / radius 10 / Roboto Condensed 14/700 white / `#595959`; verified exact in-app. (An earlier draft of this spec called for teal `#0592af`; that was unsupported — teal is nowhere in the Jira text and the artboard badge is gray. The only teal on the board is `cc-teal-dark-1` #0481a0 on the unrelated Hazbot header.) `.setupStepIcon` in terrain-panel.scss (currently `#797979` gray bg, 13px)
- [x] **Instructions prompt** — updated text/styling. `panelInstructions[]` in terrain-panel.tsx now JSX with `<b>` emphasis; `.instructions` bumped to Lato 14 italic #434343. Per-run copy + emphasis confirmed via `describe_layer` and matched in-app: step 0 "Select the **number of zones** in your model", step 1 "Adjust **conditions** in **each zone**" (was "variables"). ✅ Verified: 14px italic #434343, emphasized phrases bold-italic 700.
- [x] **Wind panel — instructions prompt** — step-2 prompt corrected to "Set initial **wind direction** and **wind speed**" (`panelInstructions[2]`; was "...and speed"), same `.instructions` style. ✅ Verified on green bg: 14px italic, both phrases bold-italic 700.
- [x] **Cursors** — `cursor: pointer` on buttons (close, Next/Previous/Create, radios, zone thumbnails); `grab`/`grabbing` on the three sliders (veg, drought, wind speed) and the wind dial. ✅ Done + verified in-app: close/continue buttons & terrain radios `pointer`, interactive zone thumbnails `pointer` (readonly `.fixed` zones correctly `default`), veg/drought/wind-speed thumbs + `.windCircularControl` dial `grab` with `grabbing` on `:active`/`.Mui-active`. Zones-count radio `.labelContainer` also set `pointer` (step-0, not reachable from a 2-zone preset).

Small structural / state changes:

- [x] **Close button** — new icon + hover/select states. Exported `Setup Close ICON` → `src/assets/setup-close.svg` (path switched to `currentColor`), replaces the literal `X`; `.closeButton` now 24×24 / radius 5. States from Zeplin: default transparent + gray `#797979` glyph, hover `#dfdfdf`, active `#757575` + white glyph. ✅ Verified in-app (default + hover screenshots match artboard).
- [x] **Bottom buttons (Next, Previous, Create)** — hover/active states + size. All **76×28**, radius 5, 1px `#797979` border, Lato 14/700, active text → white. **Next/Previous (`.continueButton`):** white → hover `#dfdfdf` → active `#757575`. **Create (`.createButton`):** `#aaffc2` (light green) → hover `#66e98b` → active `#008927`. ⚠️ Text is **`#434343` on all** — Create is NOT white (the in-context Create text reads `#434343`; the earlier "Create = white / `#008927` default" notes were wrong). ✅ Verified in-app: sizes, fills, border, hover.
- [x] **Zone buttons** — new positions; check size; label size; hover/select states. `renderZones` + [zone-selector.scss](../../src/components/zone-selector.scss). Zeplin zone thumbs: **120×100** (2-zone) / **80×100** (3-zone) terrain image inside a **4px white frame** (→ 128×108 / 88×108). "Zone N" label: **Lato 14/700** #434343 (⚠️ not 12 — the 12/700 typography row is the bare zone *number* elsewhere) on a `Label back` pill **59×24** filled with a **light zone tint** (`#ffd8fa` zone1 / `#d6ecff` zone2), centered on the thumbnail top edge. River overlays (held-back trimmed strips) wire in here. ✅ Done + verified: `.terrainPreview` set to **`box-sizing: border-box`** + `.zone` height 116→**108** so the terrain image renders exactly **120×100** / **80×100** (Zeplin) inside the 4px frame — no more `cover` zoom-crop (was rendering 128×108). `.zoneLabel` is a constant light-tint pill (Lato 14/700 #434343, `#ffd8fa`/`#d6ecff`/`#ffe8cd`, 62×23); `.zoneLabelBorder` now `translate(-50%,-50%)` so the label **straddles the tile's top edge** (verified panel-rel top 70 ≈ Zeplin 71). Opacity states split to **default 50% / hover 75% / selected 100%**. River overlays wired (see Terrains item). `.selected` / `.fixed` (readonly) states exist. **State opacities (from artboard annotations):** Default = terrain & veg-icon at 50% opacity; Hover = outline 50% + terrain/veg 75%; Select = outline/terrain/veg 100% + background-color update, and the previously-selected zone returns to Default. Behaves like a radio group (a selected zone has no hover state). Conditions sit ~10px from the bottom of the zone buttons
- [ ] **Terrain Type radio buttons + labels** — update radio asset; label size; positions; **fix hit areas** (artboard `Target` shapes are 70–92×40, much larger than the 20×20 radio). [terrain-type-selector.tsx](../../src/components/terrain-type-selector.tsx) (MUI `RadioGroup`, Plains/Foothills/Mountains, `.radio` / `.terrainOption`). 2-zone step-1 only. Designer note: Medium font weight was considered when spacing this row. ✅ Done + verified: labels now Roboto Condensed **14**/400 #434343 (was 10px gray), row widened to 100%, height 28; hit area is the full MUI `FormControlLabel` (radio + label). ⏳ Optional polish: swap MUI default radio for the Zeplin `Radio Button` SVG asset (current gray default reads the same).

Asset swaps + slider/control work (icon SVGs already imported; wire them in + fix layout/hit areas):

- [x] **Terrains (zone backgrounds)** — new shortened terrain PNGs + river overlays; hover/select states. Re-export from artboard and replace in-place at **`src/public/terrain/{2,3}-zone-*.png`** (all 20 already exist there at the old `×136` height → new `×100`). The veg type icon over the thumbnail comes from `vegetationIcons` (already updated).
  - ✅ **Done:** the 15 plains/foothills/mountains backgrounds re-exported at `120×100` / `80×100` and committed.
  - ✅ **River overlays done:** the 5 `*-zone-river-*.png` export from Zeplin as **trimmed thin strips** (their content: 120×15/24, 80×13/16/26 — only the river pixels, transparent margin trimmed). Rather than rework `.riverOverlay`, **padded each strip back to full layer size** (`120×100` / `80×100`, river bottom-anchored via `magick -gravity south -extent`) so it behaves like the old full-height overlay. The existing `.riverOverlay` (`background-size:cover; bg-position 0% 0%`) then aligns the strip with the terrain **identically** — height fills the 108px box exactly (no vertical crop), so the river sits flush at the bottom and dims with the terrain (it's a child of `.terrainImage`, inherits the 50/75/100% opacity states). **No SCSS change needed.** Verified in-app on 2-zone (river spans + connects across the zone boundary) and 3-zone (flush bottom).
- [x] **Vegetation Type slider** — ✅ veg icons render (Grass/Shrub/Forest), shared `.markLabel` Roboto Condensed **13** #434343, selected mark **500** (verified: Shrub=500, others=400). ✅ **Rail lengthened 103→114px** so marks match Zeplin exactly (Forest 277 / Shrub 334 / Grass 391 panel-rel). ✅ **Header indented** (`margin-left:27`) to sit over the slider column (l=33, Zeplin 33). ✅ **Thumb swapped** to `slider-thumb.svg` (Zeplin chevron ring, white halo-circle removed) drawn at 133% so the inset ring fills a **20px** element. vegetation-selector.tsx + vertical-selectors.scss
- [x] **Drought Index slider** — ✅ water-drop icons render, same `.markLabel` 13/selected-500 (verified: Mild Drought=500, others=400). ✅ same rail-114 / header-indent (l=193, Zeplin 192) / 20px chevron thumb as veg. drought-selector.tsx + vertical-selectors.scss
- [x] **Wind Speed slider** — layout/position; ✅ thumb asset; ⏳ **fix hit areas**. Horizontal MUI Slider in wind-circular-control.tsx (`speedMarks`, classes `rail`/`mark`/`thumb`/`markLabel`). ✅ **Layout + 13px marks done:** the slider was lifted out of the cramped `.windText` (~37px) into its own absolutely-positioned `.windSliderControls` at left:199/top:84, **width 92px** (matches Zeplin rail span 201–289). markLabel now **13px** #434343, selected-mark **500** (verified in-app: 0/10/20/30 all 13px, active "0"=500, others=400 — no overlap). ✅ **Thumb swapped** to `slider-thumb-small.svg` (Zeplin `Slider Thumb Small`, white halo-circle removed) drawn at 140% so the inset ring fills a **20px** element. ⏳ larger hit-area still deferred. **Thumb sizing note:** Zeplin rings are 24px (veg/drought) / 20px (wind), but our sliders are more compressed than the artboard's, so all three thumbs use **20px** (24px read oversized against the tighter ticks).
- [ ] **Wind Direction control** — ✅ assets + layout settled; ⏳ interactivity/states remain. wind-dial.tsx/.scss (+ `wind-symbol.svg`).
  - ✅ **Face + Arrow assets already correct:** the artboard `Wind Direction Face` / `Wind Direction Arrow` exports differ from `wind-dial.svg` / `wind-arrow.svg` **on purpose** — WM-26 hand-fixed a border issue and we pulled those border-fixed SVGs in commit d7832a2. Re-exporting from Zeplin regresses the fix, so **do not swap face/arrow** (confirmed: downloaded both, byte sizes match the pre-fix originals).
  - ✅ **Layout/reposition done** (in the wind-control pass): dial control moved off-center to left:52 (green-relative top 273 ≈ Zeplin 275); two-line "Wind\nDirection" label at left:7/top:5 (green-rel ~278 ≈ Zeplin 280); Wind Speed label + "0 MPH from\nthe N" + widened slider on the right. Verified in-app on 2- and 3-zone.
  - ⏳ **Radius reconciliation = merge concern, not a WM-14 change:** WM-26's `radius` 35→29 + `dialContainer` 72→59 is for the **model-display** dial (shared `WindDial`, also used by [simulation-info.tsx](../../src/components/simulation-info.tsx)). The WM-14 setup face is **79px** per Zeplin, so the shared `WindDial` must become **size-aware** at merge time (e.g. a size prop) — shrinking it to 59 would break the setup panel. Left WM-14 at its working 72px/radius-35; flag at PR merge.
  - ⏳ **States (from artboard annotations):** only the **face** is clickable (cursor pointer); the arrow uses grab/grabbing. Hover-face = face outline 50% op; Select/click face = outline 100% op + wind-speed display updates; Hover-arrow = arrow outline 50%; Drag-arrow = face + arrow outline 100% + speed updates. (Current impl wraps the whole dial in one `react-circular-input` CircularInput with grab/grabbing; splitting face-click vs arrow-drag is a behavioral change — scope with designer/user before implementing.)

Broader layout work (panel dimensions + spacing relationships across the whole panel):

- [x] **Panel size** — Zeplin panel (`Setup Control back`) is **320×465 outer**. Done (pulled forward, since it's foundational for all positioning): with content-box + 5px padding + 1px border, set `$width: 308` / `height: 453` → **320×465 outer** (verified in-app); border color silver→`#797979`. `margin-left` calc auto-tracks `$width`. ✅ Verified 320×465. Note: step-1 content is slightly crowded at the bottom until zone thumbnails shrink 140→100.
- [x] **Repositioning pass (step 1, 2- and 3-zone)** — measured every row against the Zeplin step-1 panel (origin 190,354) and aligned to panel-relative coords: zone label top 70 (≈71), terrain image 120×100, Terrain Type label 189 (≈189), radio row 216 (≈215), Veg/Drought headers l=33/193 (Zeplin 33/192) top 240, slider marks Forest 277 / Shrub 334 / Grass 391 (exact), Next 423. The downward drift came from the thumbnails rendering 8px too tall (fixed via `border-box`) + the slider rail being compressed (103→114px). Verified in-app 2- and 3-zone; step-2 thumbnails inherit the shorter tile. ⏳ Remaining: fine sweep of step-2 wind recap spacing + a final 3-zone wind pass.

## Deferred / skipped this pass (open decisions)

Items intentionally **not** implemented in the wind-control layout pass, with the reason and the options for whoever picks them up. None are blocked by code — each needs a design/scope decision before building.

### 1. Wind-dial interactive states (skipped — needs design decision)

**What the artboard asks for** (annotations on the dial states): only the **face** is clickable (`cursor: pointer`); the **arrow** is the drag handle (`grab` / `grabbing`). Hover-face → face outline 50% opacity; click/select face → face outline 100% + wind-speed display updates; hover-arrow → arrow outline 50%; drag-arrow → face + arrow outline both 100% + speed updates.

**Why skipped:** the current control wraps the *entire* dial in one `react-circular-input` `CircularInput` (whole-dial `grab`/`grabbing`, drag-anywhere). The artboard splits interaction into a **clickable face** vs a **draggable arrow** — a behavioral change to working drag logic. Also, the current `wind-dial.svg` / `wind-arrow.svg` (WM-26 border-fixed) have no dedicated "outline" sub-layer to toggle for the hover/select opacity states, so the visual hook doesn't exist yet.

**Options:**
- **(A) Leave as-is** — keep the single drag-anywhere CircularInput (functionally fine; current choice). Lowest risk; visually omits the hover/select outline feedback.
- **(B) Add states without restructuring** — keep drag-anywhere, but layer `cursor: pointer` on the face region + a CSS outline/opacity hover on the face/arrow SVG wrappers. Approximates the artboard feedback without splitting click vs drag. Needs an outline element added to the SVGs (or a CSS `filter`/`outline` overlay).
- **(C) Full split** — face = click-to-set + pointer; arrow = the only drag handle with grab/grabbing; wire outline-opacity on hover/select/drag per annotation. Closest to artboard; largest change to interaction + likely a custom control replacing parts of `react-circular-input`.

**Recommend:** confirm with the designer whether the click-face-vs-drag-arrow distinction is required, or whether (B)'s visual-only outline feedback on the existing drag control is acceptable.

### 2. Slider thumb asset + hit areas (deferred to polish #3)

Veg, drought, and wind-speed sliders still use `slider-vertical.svg` / `slider-horizontal.svg` (plain dots). Zeplin specifies **`Slider Thumb`** (32px, vertical sliders) and **`Slider Thumb Small`** (28px, wind speed) — a gray ring + up/down chevrons with a white hover-halo baked into the SVG. Also "fix hit areas" (artboard target shapes are larger than the visual thumb).

**Why skipped:** lower priority than layout; swapping the thumb interacts with MUI's built-in box-shadow halo (the SVG bakes its own halo), so default vs hover/active needs reconciling. **Options:** (A) crop a 20px ring-only variant for default + use the full 28px SVG (with halo) for hover/active; (B) size the element to 28px and drive default/hover purely via the SVG; (C) keep MUI box-shadow halo + only swap the ring glyph. Decide when doing polish #3.

### 3. Dial face size vs WM-26 (merge-time reconciliation)

WM-14 setup face = **79px**; WM-26 shrinks the **shared** `WindDial` (also in [simulation-info.tsx](../../src/components/simulation-info.tsx)) to 59px / radius 29 for the model display. Left WM-14 at its working 72px/radius-35. **Decision at merge:** make `WindDial` size-aware (size prop or per-context class) so both contexts coexist; do not globally shrink to 59px.

## Line 16 detail — wind-panel recap (confirmed against artboard 2026-06-01)

Jira: *"on the Wind Direction green panel, terrain type, veg type, drought index — label size, positions."*

**Confirmed** (designer artboard screenshot, the two green "Adjust Wind" panels): this is the **read-only recap** on step 2 (`currentPanel === 2`, the green panel ending in Create), NOT editable controls. For each zone, stacked under the zone thumbnail:
- **Terrain type** = text label only, no icon (e.g. "Plains", "Mountains"). Rendered by `renderZoneTerrainTypeLabels()` ([terrain-panel.tsx:213-219](../../src/components/terrain-panel.tsx#L213), used at [:319](../../src/components/terrain-panel.tsx#L319)) → `.terrainTypeLabels .terrainTypeLabel` (currently `font-size: 10px`).
- **Veg type** = icon + label (e.g. tree + "Shrub"). From [TerrainSummary](../../src/components/terrain-summary.tsx) `.icon` + `.caption`.
- **Drought** = icon + label (e.g. drop + "Mild Drought"). Also TerrainSummary (`.drought` icon + `.caption`).

So line 16 spans **two code locations**: `renderZoneTerrainTypeLabels` (terrain type) and `TerrainSummary` / [terrain-summary.scss](../../src/components/terrain-summary.scss) (veg + drought). "label size, positions" covers the text labels and the icon+label units; icons are part of the veg/drought recap. **Same treatment for 2- and 3-zone** (only zone count / column width differs).

**Shared-style caveat:** `.terrainTypeLabel` is **also** rendered on **step 1 for the 3-zone case** ([terrain-panel.tsx:274-276](../../src/components/terrain-panel.tsx#L274)) because 3-zone has no editable Terrain Type selector. Restyling `.terrainTypeLabel` for the wind recap also changes the 3-zone step-1 labels. Verify both, or scope step-2 styling via the `.panel2` wrapper (the `.background.panel2` class is on the dialog root).

Distinct from: line 10 (editable Terrain Type radios, step 1, 2-zone) and lines 11-14 (editable veg/drought labels + sliders, step 1). Line 16 is the read-only mirror of those on step 2.

## Colors reference (from Zeplin design tokens)

_All ten rows below verified against the artboard palette via the zeplin-inspect MCP, 2026-06-01 — exact RGB matches._

Named CC palette tokens used on this artboard. UI text is **#434343** (`rgb(67,67,67)`) — note this is *not* the same as the `cc-charcoal` token (#3f3f3f). SCSS color vars live in `common.scss` (`$controlText`, `$controlGray`, `$zoneGreen`, `$zone1Red`, etc.).

| Token | Hex | RGB | Likely use |
|---|---|---|---|
| (text) | `#434343` | 67,67,67 | all UI label/prompt text |
| white | `#ffffff` | 255,255,255 | label backgrounds, primary-button text |
| cc-charcoal | `#3f3f3f` | 63,63,63 | — |
| cc-charcoal-hint | `#828282` | 130,130,130 | — |
| cc-charcoal-light-1 | `#979797` | 151,151,151 | borders / inactive |
| cc-charcoal-light-2 | `#dfdfdf` | 223,223,223 | hover fills / dividers |
| cc-teal | `#0592af` | 5,146,175 | instructions number bg, accents |
| cc-teal-dark-1 | `#0481a0` | 4,129,160 | teal hover/active |
| cc-teal-dark-2 | `#016082` | 1,96,130 | teal pressed |
| cc-teal-light-3 | `#93d5e4` | 147,213,228 | light teal fills |

_Per-element fills/borders/states to be confirmed against the artboard's "2-Zone / 3-Zone Button States" sections as each item is worked._

## Typography reference (from Zeplin)

_All eight rows below verified against the artboard text styles via the zeplin-inspect MCP, 2026-06-01 (the `#1500ff` blue annotation styles were correctly excluded as designer notes)._

All real text styles found on the artboard. **Every Roboto style is condensed** (`font-stretch: 0.75`) — same as the graph panel; every Lato style is normal width. Color **#434343** unless noted. Roboto Condensed weights needed: **400, 500, 700** (the graph-panel work already added 500 to index.html — verify it's still imported).

| Use | Font | Size | Weight | Color |
|---|---|---|---|---|
| Instructions number ("1") | Roboto Condensed | 14 | 700 | white (on teal) |
| Tick / terrain labels ("Plains") | Roboto Condensed | 14 | 400 | #434343 |
| Instructions prompt body ("Adjust conditions…") | Lato | 14 | 400 | #434343 |
| Button labels ("Next", "Helitack") | Lato | 14 | 700 | #434343 |
| Button label ("Create") | Lato | 14 | 700 | #434343 (white only on active/pressed) |
| Slider labels — medium ("Mild Drought") | Roboto Condensed | 13 | 500 | #434343 |
| Slider labels — regular ("No Drought") | Roboto Condensed | 13 | 400 | #434343 |
| Zone number ("2") | Lato | 12 | 700 | #434343 |

## Reference

- Jira: WM-14
- Zeplin: https://app.zeplin.io/project/5fe47ae231d1f6a428c53450/screen/6a10411879d13e7fb9ac0a00
- Saved Zeplin screen JSON (for tooling/measurements): `/tmp/zeplin-wm14-screen.json` (regenerate via the zeplin MCP `get_screen` if missing; it is a /tmp scratch file, not committed)
- Branch: `WM-14-setup-panel-ui-updates` off master; asset import commit d7832a2

## Files in scope

- [terrain-panel.tsx](../../src/components/terrain-panel.tsx) / [terrain-panel.scss](../../src/components/terrain-panel.scss) — wizard shell, close button, header, instructions, buttons, terrain-type recap labels, wind container
- [zone-selector.tsx](../../src/components/zone-selector.tsx) / [zone-selector.scss](../../src/components/zone-selector.scss) — zone thumbnails (terrain PNGs, "Zone N" labels, states)
- [zones-count-selector.tsx](../../src/components/zones-count-selector.tsx) / [zones-count-selector.scss](../../src/components/zones-count-selector.scss) — step-0 zone count radio
- [terrain-type-selector.tsx](../../src/components/terrain-type-selector.tsx) / [terrain-type-selector.scss](../../src/components/terrain-type-selector.scss) — step-1 terrain radios (2-zone)
- [vegetation-selector.tsx](../../src/components/vegetation-selector.tsx), [drought-selector.tsx](../../src/components/drought-selector.tsx), [vertical-selectors.tsx](../../src/components/vertical-selectors.tsx) / [vertical-selectors.scss](../../src/components/vertical-selectors.scss) — step-1 sliders + shared icon definitions
- [terrain-summary.tsx](../../src/components/terrain-summary.tsx) / [terrain-summary.scss](../../src/components/terrain-summary.scss) — step-2 veg/drought recap
- [wind-circular-control.tsx](../../src/components/wind-circular-control.tsx) / [wind-circular-control.scss](../../src/components/wind-circular-control.scss), [wind-dial.tsx](../../src/components/wind-dial.tsx) / [wind-dial.scss](../../src/components/wind-dial.scss) — step-2 wind direction + speed
- [src/assets/terrain/](../../src/assets/terrain/) — veg/drought SVG icons (imported from WM-26); terrain background PNGs + thumb assets still to export from Zeplin
- `src/components/common.scss` — shared color vars; `src/index.html` — font imports (verify Roboto Condensed 400/500/700)
