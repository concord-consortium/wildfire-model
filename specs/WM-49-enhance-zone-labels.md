# Hazbot: Enhance Zone Labels

**Jira**: https://concord-consortium.atlassian.net/browse/WM-49

**Status**: **Closed**

## Overview

The zone labels on the map are re-laid out to name a zone's vegetation type and drought level in words instead of leaving a student to decode two small icons. They grow from 142 x 46 to 170 x 60, gain a white border, and stop being interactive: no click, no hover, no pressed state, no lock icon, and no shortcut into the Setup panel.

Workshop feedback said students could not tell a zone's conditions from its label: a student reading "Zone 1 / Hills" had to already know that a particular green shape meant shrub. The labels now spell both out, all the time, with no interaction required.

Michael specified this twice. The 2026-08-24 version was an expandable label with a caret; he reversed it in Slack on 2026-08-27 and posted the replacement design on 2026-08-28. The second version is a simplification, not a complication: there is no expand state, so nothing to persist and no caret asset to pull. Four of the five open questions the story used to carry stopped existing rather than being answered.

## Requirements

- Each zone label is **170 x 60** border-box, with a **1px `#ffffff` border** (was 1px `#797979`), radius 4. Per-zone fills are unchanged. The element was `content-box`, so this required `box-sizing: border-box` and not only new dimensions.
- The label renders **two rows**:
  - **Row 1**: `Zone N`, a `·` bullet, and the terrain type, on one line, horizontally centered as a unit so the center shifts with the terrain type's width.
  - **Row 2**: the **vegetation icon and its name** on the left, and the **drought icon and its name** on the right, side by side. Three stacked rows do not fit in 60px at a 14px line height.
- Each name sits in a fixed **two-line, 28px band**. All four drought names fill both lines (`Severe / Drought`, `Medium / Drought`, `Mild / Drought`, `No / Drought`); on the vegetation side only the abbreviation does (`Forest / w Suppr.`), while `Grass`, `Shrub` and `Forest` are single lines centered in the same band.
- The vegetation name is **abbreviated for this surface only**: `"Forest with Suppression"` renders as **`"Forest w Suppr."`**. Every other display site keeps the full string. The break needs a non-breaking space (`"Forest w\u00A0Suppr."`) rather than a box width: `"Forest w"` is 47.16px, so it still fits the 48px box and ordinary wrapping would leave `w` on line 1.
- Type is unchanged from what the repo already declared: `Zone N` and the bullet in **Lato Bold 14**, everything else in **Roboto Condensed Regular 14**, all `#434343`.
- The vegetation icon renders at the asset's intrinsic **28 x 28**, carrying the **1.5px white outline the asset already provides**. The drought icon renders at the **20 x 28** asset's own size (its 19 x 25 artwork is drawn inside that box). No new font, color or asset was needed.
- Labels sit **at least 10px apart**. This is a floor that prevents a real failure, not a nominal gap.
- **The box and the floor are guarded in Cypress**, since jsdom does no layout and nothing else can see them. The floor's case runs at a three-zone preset with the graph open at `cy.viewport(950, 880)`, the only condition under which the failure it guards exists.
- **The labels are not interactive.** No `onClick`, no hover or pressed ring, no pointer cursor, no lock icon, and no path into the Setup panel. Everything that existed only to serve those is removed, not left dead.
- **Overlap with the Time and Wind Meter displays is accepted**, per Michael, at the widths where it occurs. It is not a defect this story fixes and not a constraint the layout has to satisfy.
- Existing zone-label behavior not named above is unchanged, including the per-zone colors and the `Zone N` and terrain-type text sources.

## Technical Notes

### The layout, measured at both ends

Measured on the running app at `?preset=hillThreeZone`, three zones, graph open. The left display stack is three fixed boxes at `left: 10px`, all 104px wide, so its right edge is x 114.

| Viewport | | First label left | Gap between labels | Clearance from the left stack |
|---|---|---|---|---|
| **1241 x 529** (target device) | as built, 142 | 141.3 | 100.7 | 27.3 |
| | **at 170 + the floor** | 124 | **76** | **10, still clear** |
| **950 x 880** | as built, 142 | 73.4 | 23.1 | **-40.6, already behind** |
| | at 170, no floor | 56 | **0** | -58 |
| | **at 170 + the floor** | 44.5 | **10** | **-69.5** |

**At the target device the new size fits**, with 10px of horizontal clearance and the 10px minimum gap slack by a factor of seven. The taller label reaches 3px into the Wind Meter's vertical band, but the two never overlap horizontally there. Horizontal overlap with the left stack only begins below roughly **1206px** of viewport width.

**At 950 the labels cannot hold 170 and the gap collapses to zero** without the floor, because `.simulationInfo` distributes them with `margin-left/right: auto` inside an 80%-width row. That is what Michael's "squeeze 'em together a little more" and the 10px floor are for: the gap has to be a real gap the labels cannot give back. The 169 they fall to is not shrink-to-fit, it is the label's **min-content width**, set by row 2's four fixed, non-shrinking boxes (153 of content plus 14 of padding and 2 of border).

**The horizontal overlap with the left stack is pre-existing and accepted.** At 950 the label is already 40.6px behind the stack as built; the requirements as specified deepen that to 69.5. Nothing is clipped on the right: the third label ends at x 574.5 against the graph panel's left edge at 633, so the whole cost lands on the left.

### The vegetation label needed a third form, and there were already two

`vegetationLabels` (`types.ts`) is **data**: logged in `SimulationStarted` and `ZoneUpdated`, and compared against by the Hazbot matcher. Its value `"Forest With Suppression"` cannot move. Two display sites worked around that with the same copy-pasted `.replace`. The fix is the one `terrainDisplayLabels` already models: `vegetationDisplayLabels` holds the full display spelling and replaces both `.replace` call sites; `vegetationAbbreviatedLabels` holds the zone label's form. `droughtLabels` needed none of this, its values match the design exactly.

The abbreviation is **not** a fit workaround: `"Forest with Suppression"` is 132.8px on one line and would fit the old layout. It does not fit beside a drought name in a 170px box.

### Removing the click orphaned more than the handler

`simulation-info.tsx` held the **only writer** of `ui.terrainUISelectedZone`, so removing the click orphaned the store field, the `terrain-panel.tsx` effect that existed purely to consume it (and its `setCurrentPanel(1)` jump), that effect's `|| 0` fallback, `showTerrainPanel` with its `log("ZoneButtonClicked", ...)`, the `locked`/`onClick` props, `LockIcon`, `.lockIcon`, `.zone`'s `position: relative`, the `.active` class with both `box-shadow` rules, and `src/assets/lock.svg`. `.zone`'s `z-index: 2` survives: it is what keeps the label above the 3D canvas, and z-index applies to a flex item whether or not it is positioned.

The Setup-panel shortcut is a **feature** going away, not only dead code. Trudi confirmed it was unused.

### Test fallout

Three tests were deleted across two files, all covering the removed interaction: two in `simulation-info.test.tsx` (the click opening the terrain panel, and the lock appearing on start) and test (o) in `terrain-panel.test.tsx`, which drove the wizard through the write this story removes and **fails** rather than going stale. No coverage went with it: test (n) already pins `panel: "conditions"` with `reachedWind: true` through the Previous route, which is now the only route.

### Design source

Board: **Updated Wildfire Controls and Labels**, `https://app.zeplin.io/project/5fe47ae231d1f6a428c53450/screen/6a8566a1c90489f7be36e66a`, group `Zone Conditions Display Examples` at (1350, 1025). A searchable text dump is at `~/docs/zeplin-specs/updated-wildfire-controls-and-labels.md`. `Zone Conditions Display Button States` at (1760, 1025) draws the superseded expand-and-collapse sequence.

The board's `Sim` mockup draws the labels in place once, in a two-zone case at one nominal frame width: top-aligned with the Time display, 118px of clearance from the key area, and 240px apart. It confirms the 170 x 60 box and the alignment, and says the crowding is a narrow-viewport artifact rather than the design's intent, but it does not settle the three-zone case.

## Out of Scope

- **Textures on the zone labels.** WM-48 textured the 3D model and WM-53 the Setup panel thumbnails; neither touches the map's zone labels. WM-53's standing advice, since the shared `vegetationIcons` array reaches five components including this one, is that textured icons get a second export rather than a mutation.
- **Moving or resizing the Time and Wind Meter displays.** This story fits around that stack, and the overlap is accepted rather than fixed.
- **A replacement shortcut into the Setup panel.** The design removes it and offers nothing in its place.
- **Re-pointing the story.** It was pointed 2 against the expandable design and is materially smaller now. Worth raising at grooming.
- Accessibility review. Out of scope in this repo.

## Not Yet Implemented

- **The `ZoneButtonClicked` discontinuity note ships with two placeholders.** `LOGGED-EVENTS.md` carries `<deploy date, filled in at release>` and `<release tag>` by design: the note anchors on the deploy date, and guessing it now would be wrong if a release goes out first. Someone has to fill both in at release or the note tells a researcher nothing about when the series ended.
- **Two FYIs to Michael were promised and not sent.** That holding 170 and the 10px floor together deepens the accepted overlap from 58 to **69.5px** at 950 x 880 (recorded as accepted, not a blocker), and that the vegetation icon renders at its intrinsic 28 rather than the board's 26, with the 2px coming out of row 2's gaps.

## Decisions

### Does `ZoneButtonClicked` survive, and in what form?
**Context**: Its only call site was inside the deleted click handler. It has no consumer in the app (not in `translate.ts`, named by no rule-set), so it is purely researcher-facing: removing it breaks no code and silently ends a longitudinal series.
**Options considered**:
- A) Remove it. An event that never fires is worse than an absent one.
- B) Keep the name, re-point it at something else the label still does.
- C) Remove it and add a note to `LOGGED-EVENTS.md` recording when it stopped and why.

**Decision**: **C**, Doug, 2026-08-28. This is the file's existing convention rather than a new one: four prose subsections already document discontinuities so a researcher does not read a break in the data as a finding. B would mean inventing a trigger and silently changing what the series means. Not the WM-47 case, where `SimulationReloaded` kept its name because the trigger survived under a new label; here the trigger is deleted.

---

### What anchors the discontinuity note, given no payload carries the app version?
**Context**: The four existing notes anchor on `appRulesVersion`, a Hazbot counter that does not apply. `src/log.ts` forwards `(name, data)` and adds nothing; the only version-like fields sit on `AnalysisEngineActivated`, which fires only on Hazbot-enabled pages, while `ZoneButtonClicked` fired on every page.
**Options considered**:
- A) Anchor on the app version, e.g. "stopped firing in 1.6.0".
- B) Bump `APP_RULES_VERSION` to manufacture an anchor.
- C) Anchor on the deploy date, and say outright that no payload field marks the boundary.

**Decision**: **C**, Doug, 2026-08-28. "1.6.0" is neither settled (the bump is its own release commit) nor queryable, so a reader could not turn it into a filter. B is not an option: a bump would falsely signal a feedback change to every Hazbot query. The note names the story and release tag as human landmarks and states that the boundary has to be read from timestamps.

---

### Does the layout hold 170 and the 10px floor even though it deepens the accepted overlap?
**Context**: Michael accepted the overlap at the depth growing to 170 produces (58px), but that is the state where labels sit at their 169 min-content and the gap collapses. Enforcing both requirements puts the first label at x 44.5, i.e. **69.5px** behind the Time display.
**Options considered**:
- A) Keep 170 x 60 and the 10px floor, and record 69.5 as the depth the requirements produce.
- B) Let the labels shrink further (holds the overlap nearer 52).
- C) Confine the row to the space right of the key area (overlap down to 12.5).

**Decision**: **A**, Doug, 2026-08-28. The target device never sees the overlap (it begins below about 1206px), and at 950 the app is already 40.6px into the stack today. B is not reachable without letting row 2's name boxes shrink, which re-wraps `w Suppr.` and `Medium` to a third line that will not fit in 60px; C stops the labels being centered on the frame, which is how the design draws them.

---

### Is the Cypress layout coverage in scope, and under what conditions?
**Context**: jsdom does no layout, so the box and the floor are guarded in Cypress or not at all. But `cypress.config.ts` runs at 1400 x 1000, where the gap measures 118.4 with the floor and 115.1 without, so a `gap >= 10` assertion there passes either way.
**Options considered**:
- A) Both halves in scope, with the floor's case at a named narrow viewport.
- B) Put the layout requirement explicitly out of scope.

**Decision**: **A**, Doug, 2026-08-28. The box is asserted at the default viewport, where 170 x 60 is unconditional once shrinking is off. The floor runs at a three-zone preset with the graph open at `cy.viewport(950, 880)`: the collapse only exists below about 993px of viewport width, where the row's width crosses 530.

---

### Does the vegetation icon render at 28 or at the design's 26?
**Context**: The board labels the icon 26 x 26 with a 1.5px white outline, and row 2's board arithmetic closes exactly at 26. But the same component in the board's exportable library is reported at 28 x 28, matching the asset: a 26.5 x 26.5 rect at (0.75, 0.75) stroked 1.5px has outer bounds of precisely 28. The two numbers cannot both be honored.
**Options considered**:
- A) Render at the intrinsic 28 x 28; the stroke stays exactly 1.5px and row 2's gaps absorb the 2px.
- B) Scale to 26 x 26; matches the board exactly but thins the stroke to 1.39px.
- C) Ask Michael which number he meant.

**Decision**: **A**, Doug, 2026-08-28. The argument is mechanical rather than aesthetic: these SVGs carry hard `width`/`height` attributes, so a 26px parent box does not scale them, it only lets them bleed. Reaching a true 26 needs an explicit `svg` size rule that exists at no other icon site in the repo, and would make this the only place the outline stroke is not 1.5px. Both variants were built in the running page; at 1:1 they are indistinguishable.

---

### What shape does the abbreviation take?
**Context**: The zone label needs a third form of the vegetation label, and it must not be a fourth open-coded string.
**Options considered**:
- A) A second map, `vegetationAbbreviatedLabels`, spread from the display map so only the differing entry is written twice.
- B) One map of records, `{ full, abbreviated }` per vegetation.
- C) A single `abbreviateVegetation(label)` helper.

**Decision**: **A**, Doug, 2026-08-28. It reproduces the `terrainLabels` / `terrainDisplayLabels` pair ten lines above it in the same file, comment structure included: a reader who has understood one has understood the other. B changes the shape of a map five components read from, for one surface's benefit; C hides the abbreviation inside a function body where the next surface that wants it cannot find it. The spread-and-override form is load-bearing, not stylistic: `vegetation-selector.tsx` selects options by key order with `Object.values(...).slice(...)`, and integer-like keys enumerate in ascending numeric order regardless of insertion order (verified).

---

### How is the `Forest` / `w Suppr.` break produced?
**Context**: The plan assumed the 48px box made ordinary wrapping reproduce the design. It does not: line filling is greedy and `"Forest w"` is 47.16px, which fits, so a plain space wraps it as `Forest w` / `Suppr.`.
**Options considered**:
- A) A non-breaking space in the abbreviation: `"Forest w\u00A0Suppr."`.
- B) A hand-placed break in the markup.
- C) Reword the abbreviation.

**Decision**: **A**, Doug, 2026-08-28. No width fixes this: anything under 47.16 is also under the 47.27 that `w Suppr.` needs and sends it to a third line. `text-wrap: balance` and `pretty` were both tried live and changed nothing. A is the idiom `terrain-summary.tsx` already uses on this same string, and it holds the break inside the constant rather than the markup (B is the open-coded string the requirements ruled out). Verified live at 34.84 / 47.27, two lines, no overflow. Checked that testing-library's default normalizer treats `\u00A0` as whitespace, so `getByText` with a plain space matches; only an exact `textContent` comparison would not.

---

### Row 2's `flex-shrink: 0`, and the 1px of asymmetry
**Context**: The declarations were justified by a measurement (boxes shrinking to 46.97 / 44.03) taken against a 5px-gap row, which no longer applies: at the shipped 4px gaps row 2 uses 153 of a 154px content box, so nothing is ever asked to shrink. The leftover pixel puts row 2 at 8px from the left inner edge and 9 from the right, against the design's symmetric 8 and 8.
**Options considered**:
- A) Delete the declarations as inert.
- B) Keep them as a guard with a corrected comment, gaps at 4 / 4 / 4, accepting insets of 8 and 9.
- C) Redistribute the gaps 4 / 5 / 4 to recover the symmetric inset.

**Decision**: **B**, Doug, 2026-08-28. C was built and measured first, because it is the more faithful arrangement in isolation, and was rejected on a consequence only the mutation matrix showed: at 4 / 5 / 4 the row uses exactly 154 of 154, which raises `.zone`'s min-content from 169 to 170, and deleting `.zone`'s `flex-shrink: 0` then changes nothing measurable. That turns the Cypress `width === 170` assertion into one that passes under every mutation. The failure the guard prevents is real at `gap: 5px` (the vegetation box lands at 46.39 and `Forest w Suppr.` goes to three lines), so the declaration stays with a comment that says what it guards rather than claiming a shrink the shipped numbers produce.

---

### Where do the two Cypress cases live?
**Context**: `key-area-visuals.cy.ts` is the existing geometry guard for this region, but the zone labels are not in the key area, and the floor case has to change the viewport and open the graph, which no case in that file does.
**Options considered**:
- A) Extend `key-area-visuals.cy.ts`, reusing its `rect()` helper and constants.
- B) A new `zone-label-visuals.cy.ts`.
- C) Split them across both files.

**Decision**: **B**, Doug, 2026-08-28. `key-area-visuals.cy.ts` reads as the natural home only until you open it: its header scopes the file to the fixed left edge, and both of its describes share a `plainsTwoZone` `beforeEach` the floor case cannot use. `<region>-visuals.cy.ts` is already the convention two files follow, and `bottom-bar-visuals.cy.ts` is the precedent for a case that re-visits with its own viewport.

---

### Which preset does the floor case load?
**Context**: The sketch visited `mountainsandplainsThreeZone`, which is not a preset. `getResolvedConfig` looks the name up as `presets[urlConfig.preset || base.preset]`, so an unknown name resolves to `undefined` and the preset layer is skipped entirely, leaving base defaults: three zones, all Plains, `zonesCount` unpinned.

**Decision**: Use `hillThreeZone`, a real three-zone preset. The bad name happened to render three labels, so the case would have passed while measuring something nobody chose, and a real `mountainsandplainsThreeZone` added later would silently change it. Re-measured under `hillThreeZone` at 950 x 880: labels at x 44.5 / 224.5 / 404.5, all 170 x 60, both gaps exactly 10.

---

### Does the floor case assert the width as well as the gap?
**Context**: The floor's two declarations fail differently, measured at 950 x 880 with three zones and the graph open.

| Mutation | Width | Gap |
|---|---|---|
| Container `gap` deleted | 170 | **0** |
| `.zone` `flex-shrink: 0` deleted | **169** | 10 |
| Both present | 170 | 10 |

**Decision**: Assert both. A gap-only assertion never sees the second mutation, because row 2's own non-shrinking boxes floor the label at a 169px min-content width, so the only symptom is 1px of lost width, and the box case that would catch it runs at the default viewport where 170 holds either way.

---

### Where does the "map label only" coverage live?
**Context**: The planned test asserted both the abbreviation in the zone label and the full spelling in Setup, in `simulation-info.test.tsx`, which renders `<SimulationInfo />` and nothing else. `TerrainSummary` and `VegetationSelector` are rendered only by `TerrainPanel`, so the leak half would have asserted nothing. Separately, nothing in `src/` asserted the display spelling at all, so re-pointing both `.replace` call sites at a new map turned nothing red.
**Options considered**:
- A) Keep both assertions in `simulation-info.test.tsx`.
- B) Split: the abbreviation stays where the label is, both Setup call sites get assertions in `terrain-panel.test.tsx`.
- C) New `vegetation-selector.test.tsx` and `terrain-summary.test.tsx` files.

**Decision**: **B**, Doug, 2026-08-28. It needs no new files and no new fixtures: `describe("vegetation selector")` already sets `defaultThreeZones`, which carries both preconditions (a Mountains zone at index 0 for the slider, a `ForestWithSuppression` zone at index 2 for the caption). A would have left `VegetationSelector`'s call site unguarded; C rebuilds those preconditions twice for components `TerrainPanel` already mounts.

---

### Is remove-then-rebuild the right commit split?
**Context**: Removing the interactivity first means one commit where the label is non-interactive but still looks like the old 142 x 46 design, an intermediate state that never ships.
**Options considered**:
- A) Remove, then rebuild.
- B) One combined commit.
- C) Rebuild first, then remove, accepting a red middle commit.

**Decision**: **A**, Doug, 2026-08-28. Every commit stays green, each deleted test travels in the commit that breaks it, and the layout diff stays free of unrelated deletions. C is the only option that puts a red commit in the history; B mixes a 90-line deletion into a 200-line visual rewrite.

---

### Corrections applied during self-review

Smaller findings that changed the spec rather than producing a choice, kept because each is a trap for whoever re-derives these numbers:

- **Both name boxes are the design's own groups, not the text bounds inside them.** The `Vegetation Type` group is 48 x 28 and the `Drought Index` text group 45 x 28 in every one of the twelve drawn labels; what varies inside is the text bound, which is why `Grass` reports 32 and `Severe Drought` 44. Reading the bounds as the boxes would "correct" 45 to 44 and wrap `Medium` (44.61px) to a third line. The same group-versus-artwork misreading was caught three separate times, on the drought icon, the vegetation icon and the drought name.
- **The drought icon is a 20 x 28 asset with 19 x 25 artwork**, so rendering at intrinsic size reproduces the design; setting the element to 19 x 25 scales the glyph down about 5%.
- **The title row keeps the design's 5px gap** while row 2 comes down to 4. Only row 2 is budget-constrained; the title row has the full 154px content box against a widest case of 115px.
- **`terrain-summary.tsx`'s ternary collapses to one expression.** `Grass`, `Shrub` and `Forest` contain no space, so replacing the first space is identity on every value except `Forest with Suppression`. The non-breaking space is written as `\u00A0` rather than typed: moved into a `.replace`, the two arguments render identically in most editors, so the one line whose whole purpose is the difference between two invisible characters would be unreviewable.
- **The container's `gap` goes in the existing `.simulationInfo` block**, beside the `display: flex` it belongs with, rather than opening a second block for the same selector. The fixed-position `.windContainer` is unaffected: an out-of-flow child is not a flex item.
- **The Cypress cases wait on `sim.dataReady`** after `cy.visit`, matching the two existing visual specs, since they read geometry off a page that mounts a WebGL canvas.

---

### Discovered during implementation

- **The graph's opening animation has to be stopped, or the floor case measures the easing.** `.mainContent` carries `transition: 1s` (`app.scss`) and shrinks by the right panel's width when the graph opens, so the labels reflow for a second after the click. The same correct CSS failed at a gap of -50.6, then passed at 22.4, then at 10, across three runs. The case appends a `* { transition: none !important; }` style to the AUT document after `cy.visit` and before the graph click. A retrying `should` is not a substitute: without the floor the gap eases continuously from ~86 down to 0, so it passes through 10 on the way and a retrying assertion can catch that transient and go green.
- **`src/assets/lock.svg` had no importer once `LockIcon` went**, and no SCSS `url()` reference, so it was deleted with the rest of the lock.
