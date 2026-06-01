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
- **NOT imported, still needed from this artboard:** the **terrain background PNGs** (`{2,3}-zone-{terrain}-{left,mid,right}.png` + river overlays) = the "shortened terrains"; **slider thumb assets** (the graph panel created `slider-thumb-small.svg` — check if it fits or a new one is needed); any **new Wind face/symbol** asset beyond wind-dial/wind-arrow (the rotating `wind-symbol.svg`).
- **NOT pulled from WM-26:** the `wind-dial.tsx` `radius` tweak (35→29) and `wind-dial.scss` changes. Only the WM-26 *assets* were taken; the component is still master's version. Reconcile when doing the Wind Direction control (line 18).

## Scope (from Jira), ordered easiest → hardest

Already handled:

- [x] **Title → "Setup"** — done in WM-3 (merged to master), out of scope here
- [x] **Import corrected terrain/wind/drought SVG icons** — from WM-26 (commit d7832a2); see Asset status above

Pure CSS (size/color/background on isolated elements):

- [ ] **"Terrain Type" label** — size; add white background. **Confirmed:** the artboard wraps the Lato 14/700 #434343 text in a `Label back` white rect (88×21 behind a 78×17 label, ≈5px horizontal / 2px vertical padding, token `white`). Same `Label back` pattern backs the Vegetation/Drought/Wind labels below. `.terrainSelectorHeader` in [terrain-type-selector.scss](../../src/components/terrain-type-selector.scss). (Per Jira, no reposition for this one.)
- [ ] **"Vegetation Type" label** — size; white background; position. `.header` (vegetation instance) in [vertical-selectors.scss](../../src/components/vertical-selectors.scss)
- [ ] **"Drought Index" label** — size; white background; position. `.header` (drought instance) in vertical-selectors.scss
- [ ] **"Wind Direction" label** — size; white background; position. **Confirmed:** the artboard has separate `Wind Direction` (two-line "Wind\nDirection") and `Wind Speed` text layers, both Lato 14/700 #434343 — so the combined `.key` in [wind-circular-control.scss](../../src/components/wind-circular-control.scss) does need to split into two labels (architecture note validated)
- [ ] **"Wind Speed" label** — size; white background; position. Separate `Wind Speed` label confirmed (see above)
- [ ] **Instructions number** — font Roboto Condensed **14**/700 white (confirmed), 20×20 badge. ⚠️ **Background is NOT teal.** Zeplin (`Step back`) shows **`#595959`** gray, not `cc-teal` #0592af. The current code is `#797979`; the artboard just darkens it to `#595959`. (The only teal bar on the artboard is `cc-teal-dark-1` #0481a0 on the live-app Hazbot "Question Header", a different element — likely the source of the earlier "teal" note.) If teal was a Jira/design intent it conflicts with the artboard; resolve before implementing. `.setupStepIcon` in terrain-panel.scss (currently `#797979` gray bg, 13px)
- [ ] **Instructions prompt** — updated text/styling; verify the font loads (check index.html). Text is `panelInstructions[]` in terrain-panel.tsx; styled `.instructions` (currently italic 13px). Target confirmed against artboard: Lato **14** #434343, **italic stays** — base text is Lato-Italic 14/400 with the zone phrase in Lato-BoldItalic 14/700 (e.g. "Adjust conditions in **_each zone_**")
- [ ] **Wind panel — instructions prompt** — step-2 prompt "Set initial wind direction and speed" (`panelInstructions[2]`); same `.instructions` style, just verify on green bg
- [ ] **Cursors** — `cursor: pointer` on buttons (close, Next/Previous/Create, radios, zone thumbnails); `grab`/`grabbing` on the three sliders (veg, drought, wind speed) and the wind dial. (Graph panel got grab from rc-slider defaults; these are MUI sliders + react-circular-input, so set explicitly.)

Small structural / state changes:

- [ ] **Close button** — new icon (replace literal `X` with the Zeplin close asset) + hover/select states. `.closeButton` (currently `:hover` gray fill)
- [ ] **Bottom buttons (Next, Previous, Create)** — add hover/select states; size confirmed **76×28**, and a designer note states **all panel buttons are the same size**. `.continueButton` (currently 78×27, white, gray border). Per typography: labels Lato 14/700; **Create is white text on a green fill** (artboard `#008927` default; hover lighter greens `#66e98b`/`#aaffc2`) — green, not teal. Next/Previous text #434343
- [ ] **Zone buttons** — new positions; check size; label size; hover/select states. `renderZones` + [zone-selector.scss](../../src/components/zone-selector.scss). Zeplin zone thumbs: 2-zone 120×100, 3-zone 80×100. "Zone N" label is Lato 12/700 #434343. `.selected` / `.fixed` (readonly) states exist. **State opacities (from artboard annotations):** Default = terrain & veg-icon at 50% opacity; Hover = outline 50% + terrain/veg 75%; Select = outline/terrain/veg 100% + background-color update, and the previously-selected zone returns to Default. Behaves like a radio group (a selected zone has no hover state). Conditions sit ~10px from the bottom of the zone buttons
- [ ] **Terrain Type radio buttons + labels** — update radio asset; label size; positions; **fix hit areas** (artboard `Target` shapes are 70–92×40, much larger than the 20×20 radio). [terrain-type-selector.tsx](../../src/components/terrain-type-selector.tsx) (MUI `RadioGroup`, Plains/Foothills/Mountains, `.radio` / `.terrainOption`). 2-zone step-1 only. Designer note: Medium font weight was considered when spacing this row

Asset swaps + slider/control work (icon SVGs already imported; wire them in + fix layout/hit areas):

- [ ] **Terrains (zone backgrounds)** — new shortened terrain PNGs + river overlays; hover/select states. Export from artboard, replace `src/assets/terrain/{2,3}-zone-*.png`. The veg type icon over the thumbnail comes from `vegetationIcons` (already updated)
- [ ] **Vegetation Type slider** — confirm new veg icons render; check layout/position; **fix hit areas**; update thumb asset. vegetation-selector.tsx + vertical-selectors.scss
- [ ] **Drought Index slider** — confirm new water-drop icons; layout/position; **fix hit areas**; update thumb asset. drought-selector.tsx + vertical-selectors.scss
- [ ] **Wind Speed slider** — layout/position; **fix hit areas**; update thumb asset. Horizontal MUI Slider in wind-circular-control.tsx (`speedMarks`, classes `rail`/`mark`/`thumb`/`markLabel`)
- [ ] **Wind Direction control** — update Wind face + Wind Arrow assets; update interactivity/states. wind-dial.tsx/.scss (+ `wind-symbol.svg`). Reconcile the WM-26 `radius` 35→29 change not pulled here. **States (from artboard annotations):** only the **face** is clickable (cursor pointer); the arrow uses grab/grabbing. Hover-face = face outline 50% op; Select/click face = outline 100% op + wind-speed display updates; Hover-arrow = arrow outline 50%; Drag-arrow = face + arrow outline 100% + speed updates

Broader layout work (panel dimensions + spacing relationships across the whole panel):

- [ ] **Panel size** — Zeplin renders the panel at **320×465**; current code is `$width: 288px` / `height: 476px` in terrain-panel.scss. So **+32px wider, ~11px shorter**. Re-check all absolute-positioned children (`.buttonContainer`, `.closeButton`) and the `margin-left` centering calc after resizing
- [ ] **Repositioning pass** — confirm all element positions/spacing match the new artboard once sizes + assets are in (both 2- and 3-zone, all three steps)

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
| Primary button label ("Create") | Lato | 14 | 700 | white |
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
