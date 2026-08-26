# Wildfire Setup panel UI/UX updates

**Jira**: https://concord-consortium.atlassian.net/browse/WM-14

**Status**: **Closed**

## Overview

The Setup dialog is a three-step wizard in `terrain-panel.tsx`: model choice (number of zones), Adjust Conditions (zone thumbnails plus editable terrain type, vegetation and drought), and Adjust Wind (zone thumbnails, a read-only recap of the conditions, and the wind direction and speed control). This story brought that dialog in line with the Zeplin artboard: a shorter and wider panel, updated terrain and icon assets, larger labels on white backgrounds, corrected positions, and working hover/select states with usable hit areas. It covers both the 2-zone and 3-zone models.

The work ran as a bullet-by-bullet visual pass, each item screenshotted against the running app and measured against the artboard before it was ticked off. A designer review of the deployed branch on 2026-06-05 reopened several bullets that had been called done but had not landed correctly in the app, and added a set of net-new items for the step-0 zones-count radio; that second round is folded into the requirements below.

## Requirements

Labels and text (all Lato 14/700 `#434343` on a white pill, per the artboard's `Label back` pattern):

- **R1.** "Terrain Type", "Vegetation Type", "Drought Index", "Wind Direction" and "Wind Speed" labels get the larger size and the white background; all but Terrain Type also get new positions.
- **R2.** The combined "Wind Direction and Speed" key splits into two separate labels, since the artboard shows them apart.
- **R3.** Instructions number badge: 20x20, radius 10, Roboto Condensed 14/700 white on `#595959`.
- **R4.** Instructions prompt: Lato 14 italic `#434343`, with the key phrase in each step's copy emphasized. Step 1 reads "Adjust **conditions** in **each zone**" (was "variables"); step 2 reads "Set initial **wind direction** and **wind speed**".

Controls and states:

- **R5.** Close button: the exported `Setup Close ICON` replaces the literal `X`, 24x24 radius 5, with default/hover/active states.
- **R6.** Bottom buttons (Next, Previous, Create): 76x28, radius 5, 1px `#797979` border, Lato 14/700, with hover and active states. Create is light green `#aaffc2` and its text is `#434343`, not white, except when pressed.
- **R7.** Cursors: `pointer` on buttons, radios and interactive zone thumbnails; `grab`/`grabbing` on the three sliders and the wind dial.
- **R8.** Zone thumbnails behave as a radio group: default 50% opacity, hover 75%, selected 100%, no hover state once selected, and the read-only step-2 thumbnails sit flat at 100% with no hover response.
- **R9.** Step-0 zones-count radio: `#797979` ring and dot backed by a white disk; the "2"/"3" labels grow and bold on selection without shifting horizontally; the radio, label and image act as one target, and the selected image shows its full white outline.
- **R10.** Step-1 terrain type radios (2-zone): Roboto Condensed 14/400 `#434343` labels, the full `FormControlLabel` as the hit area, radio styling matched to the step-0 radios, and no horizontal shift when the label bolds.

Assets and sliders:

- **R11.** Replace the 20 terrain background PNGs in place with the shortened artboard exports: 120x100 (2-zone) and 80x100 (3-zone) inside a 4px white frame.
- **R12.** Wire the river overlay strips back in over the shortened terrains, aligned flush at the bottom and dimming with the terrain.
- **R13.** Vegetation and drought sliders: Roboto Condensed 13 marks with the selected mark at weight 500, rail lengthened to 114px so the marks land on the Zeplin positions, headers indented over the slider column, and the chevron-ring thumb asset swapped in.
- **R14.** Wind speed slider: lifted out of the cramped wind text into its own 92px-wide positioned container, 13px marks, small chevron-ring thumb.
- **R15.** "Forest with Suppression" renders on two lines with a lowercase "with".
- **R16.** Vegetation icons show only their dark outline on the sliders and only their white outline on the terrain thumbnails.

Layout:

- **R17.** Panel size: 320x465 outer, border `#797979`.
- **R18.** Repositioning pass on step 1 for both 2-zone and 3-zone, measured row by row against the artboard.
- **R19.** Step-2 wind recap: terrain type text labels and the TerrainSummary vegetation and drought icon-plus-caption units restyled and repositioned, with the drought labels vertically aligned to their icons, and the wind speed section dropped to match the artboard while keeping its value on two lines.
- **R20.** Wind direction dial enlarged, recentered with its rotating wind symbol on a shared pivot. *(Partial: the artboard's per-face and per-arrow interactive states were not built. See Not Yet Implemented.)*

## Technical Notes

**Asset provenance matters more than it looks.** The vegetation, drought, wind arrow and wind dial SVGs came from WM-26 (commit d7832a2), which hand-fixed a border defect in them. Re-exporting any of those four from this artboard silently regresses that fix, and the byte sizes of the Zeplin exports were confirmed to match the pre-fix originals. Only the terrain background PNGs and the new slider thumb and close-icon assets were pulled from this artboard.

**The vegetation SVGs carry per-context outline hooks.** Each has a `dark-outline` and a `white-outline` class on the relevant rect, so a context can hide one with `:global(.white-outline){ display: none }` in its own SCSS. Both hooks are prefix-proof, which matters because of the SVGO change below.

**Inline SVG ids are namespaced by webpack.** The Forest with Suppression icon rendered with a missing tree because two inline SVGs on the page both defined `mask-4`/`mask-6`, and the later icon's masks resolved to the earlier icon's. The fix is SVGO's `prefixIds` (with `prefixClassNames: false`, which keeps the outline hooks working) in `webpack.config.js`, so no two icons can collide again.

**`WindDial` is shared and size-aware.** The same component renders the setup panel dial and the model-display dial in `simulation-info.tsx`. It takes a `size` prop that defaults to 59 (the model display) while the setup panel passes its own larger value, so neither context can be broken by resizing the other.

**`.terrainTypeLabel` is rendered in two places.** It appears on the step-2 wind recap and also on step-1 for the 3-zone case, which has no editable terrain type selector. Restyling it changes both; verify both, or scope the styling under the `.panel2` wrapper on the dialog root.

**Reference colors and typography.** UI text is `#434343`, which is not the `cc-charcoal` token (`#3f3f3f`). Every Roboto style on this artboard is condensed (`font-stretch: 0.75`), at weights 400, 500 and 700; every Lato style is normal width.

Zeplin screen: https://app.zeplin.io/project/5fe47ae231d1f6a428c53450/screen/6a10411879d13e7fb9ac0a00

## Out of Scope

- **Renaming the dialog title to "Setup"**, which shipped in WM-3.
- **Exporting the corrected terrain, wind and drought icons**, which came from WM-26.

## Not Yet Implemented

- **Wind dial interactive states (face click vs arrow drag).** The artboard makes only the face clickable (`pointer`) and the arrow the drag handle (`grab`/`grabbing`), with outline-opacity feedback on hover, select and drag. The current control wraps the whole dial in a single `react-circular-input` `CircularInput` with drag-anywhere, and the border-fixed SVGs have no separate outline sub-layer to toggle, so the visual hook does not exist yet. The designer marked the cursor split as optional. Deferred to WM-26.
- **Larger hit areas on the wind speed slider thumb.** The artboard's target shapes are bigger than the visual thumb. The thumb asset itself was swapped; only the enlarged target was deferred.
- **Swapping the MUI default radio for the Zeplin `Radio Button` SVG asset** on the 2-zone terrain type row. Optional polish; the restyled default radio reads the same.

## Decisions

### Is the instructions number badge teal or gray?

**Context**: An early draft of this spec called for teal `#0592af` on the step-number badge, and the existing code used a gray `#797979`.

**Options considered**:
- A) Teal `#0592af`, per the spec draft.
- B) Gray `#595959`, per the artboard's `Step back` layer.

**Decision**: **B**. The teal was unsupported: it appears nowhere in the Jira text, and the only teal on the board is `cc-teal-dark-1` on the unrelated Hazbot header. The artboard badge is gray, so the existing gray simply darkens from `#797979` to `#595959`.

---

### What color is the Create button's label?

**Context**: Working notes at one point recorded Create as white text on a `#008927` green, which would have made it the one button on the panel with a different text treatment.

**Options considered**:
- A) White label on dark green.
- B) `#434343` label, matching every other button, with white only on the pressed state.

**Decision**: **B**. The in-context Create text reads `#434343` on the artboard. Create differs from Next and Previous only in its fill (`#aaffc2` default, `#66e98b` hover, `#008927` active), not in its type color, and the label goes white only when pressed.

---

### How do the trimmed river overlay PNGs get aligned to the shortened terrains?

**Context**: The five river overlays export from Zeplin as trimmed thin strips containing only the river pixels, with the transparent margin removed. The existing `.riverOverlay` CSS expects a full-height overlay it can align with the terrain image.

**Options considered**:
- A) Rework `.riverOverlay` to position and size the trimmed strips.
- B) Pad each strip back out to its full layer size (120x100 or 80x100, river bottom-anchored) so it behaves like the old overlay.

**Decision**: **B**. Padding at export time means no SCSS change at all: the existing `background-size: cover` rule aligns the padded strip with the terrain identically, the river sits flush at the bottom, and because the overlay is a child of `.terrainImage` it inherits the 50/75/100% opacity states for free. Verified across the 2-zone case, where the river connects across the zone boundary, and the 3-zone case.

---

### How does the 79px setup dial coexist with WM-26's 59px model-display dial?

**Context**: `WindDial` is shared between the setup panel and `simulation-info.tsx`. WM-26 shrinks it to 59px / radius 29 for the model display; the setup artboard specifies 79px. A single global size cannot serve both.

**Options considered**:
- A) Shrink globally to 59px, breaking the setup panel.
- B) Make `WindDial` size-aware with a `size` prop or per-context class.

**Decision**: **B**. `WindDial` gained a `size` prop defaulting to 59, so the model display is untouched, and the setup panel passes its own value through a single `WIND_DIAL_SIZE` constant in `wind-circular-control.tsx`.

---

### Why do the zone thumbnails render taller than the artboard says?

**Context**: The terrain images were rendering at 128x108 rather than the specified 120x100, and the extra height pushed every row below them into a visible downward drift across the whole step-1 panel.

**Decision**: The frame is 4px, so the outer box is 128x108 and the image inside it must be 120x100. Setting `.terrainPreview` to `box-sizing: border-box` and dropping `.zone` height from 116 to 108 makes the image render at exactly the artboard size with no `cover` zoom-crop. The rest of the drift came from the slider rail being compressed, fixed by lengthening it from 103 to 114px.

---

### What size should the slider thumbs be?

**Context**: Zeplin specifies a 24px ring for the vertical vegetation and drought thumbs and a 20px ring for the wind speed thumb, and both assets bake their own white hover halo, which collides with MUI's built-in box-shadow halo.

**Decision**: All three thumbs use a 20px element with the halo circle removed from the SVG and the remaining ring drawn oversized (133% vertical, 140% wind) so the inset ring fills the element. Our sliders are more compressed than the artboard's, and 24px read as oversized against the tighter tick spacing.

---

### How does "Forest with Suppression" become lowercase without breaking Hazbot?

**Context**: The designer asked for the label to read "Forest with Suppression" on two lines. The canonical `vegetationLabels` string is "Forest With Suppression" and is matched by the Hazbot analysis engine.

**Decision**: Lowercase it as a display-only transform in `vegetation-selector.tsx` and leave the canonical label alone. The two-line wrap comes from removing the fixed label width and letting the text flow.

---

### Was the broken Forest with Suppression icon an asset problem?

**Context**: The designer reported the icon looked "messed up" and suggested re-grabbing the asset from Zeplin.

**Decision**: Not an asset problem. The re-grabbed SVG was byte-identical, and the real cause was a duplicate-id collision between two inline SVGs on the page. Fixed globally with SVGO `prefixIds` rather than per-icon, so the class of bug cannot recur. Verified live with zero duplicate ids and both trees rendering.

---

### The wind dial face's white outline looks wrong on hover and select

**Context**: The designer flagged that something was off with the face's white outline in its hover and select states.

**Decision**: Left as designed. The halo is the SVG's `#Highlight` disk sitting roughly 4px outside the `#Outline` ring, which matches Zeplin, whose Face group is 79 around a 71 outline. Thinning it would mean editing the asset. The separate per-face and per-arrow state split remains deferred.

---

### Slider tick alignment

**Context**: The vegetation and drought slider tick marks do not align perfectly with their labels.

**Decision**: Accepted as-is by the designer, who said it was fine if it was the best achievable. No change made.

---

### What does the Jira line about the green wind panel's terrain, vegetation and drought labels actually cover?

**Context**: The Jira line ("on the Wind Direction green panel, terrain type, veg type, drought index: label size, positions") could have meant editable controls duplicated onto step 2.

**Decision**: It is the read-only recap on step 2, not editable controls, and it spans two code locations: `renderZoneTerrainTypeLabels` in `terrain-panel.tsx` for the terrain type text, and `TerrainSummary` for the vegetation and drought icon-plus-caption units. Same treatment for 2-zone and 3-zone; only the zone count and column width differ.
