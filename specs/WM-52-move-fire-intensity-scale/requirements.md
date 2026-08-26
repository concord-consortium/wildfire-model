# WM-52: Move the Fire Intensity Scale to the display area (upper left)

**Jira**: https://concord-consortium.atlassian.net/browse/WM-52
**Repo**: https://github.com/concord-consortium/wildfire-model
**Status**: **In Development**

## Overview

The Fire Intensity Scale moves out of the bottom control bar and into the fixed key area down the left edge, sitting beneath the Wind Meter. All three key-area containers (Time, Wind Meter, Fire Intensity Scale) widen from 97px to 104px, and the scale is restyled to fit: a two-line title, a shorter color bar, and Low/High labels centered under the end swatches.

**This is the first move in a four-story sequence in the same sprint.** WM-35 targets the container width this story sets, WM-47's stated justification for tightening the bar's spacing ("esp when the Fire Intensity Scale is displayed") is deleted by this story, and WM-48's Vegetation Key toggle takes the bar space this story frees. None of the three is blocked by it in the strict sense (see the Out of Scope notes), but all three are written against a bar and a key area this story changes, so it should land first.

## Project Owner Overview

The bottom control bar is running out of room. Three separate pieces of work are landing in that row this sprint, and the Fire Intensity Scale is the one piece in it that is not a control: it is a legend, and legends belong with the other legends. Moving it up to the left-hand key area, beneath the Time and Wind Meter displays, groups the three read-only displays together and frees roughly 151px in the control bar for the buttons that need it.

The scale keeps its existing rule of only appearing when an activity is authored to show the burn index. The visible change for a student is that the color key now sits with the other information displays rather than at the end of a row of buttons, and the three displays line up at a common width.

## Background

The scale renders today at `bottom-bar.tsx:219-225` as a `.widgetGroup` containing a "Fire Intensity Scale" title `<div>` and the `<FireIntensityScale/>` component, wrapped in a `simulation.config.showBurnIndex &&` conditional. The title is the bottom bar's, not the component's: `fire-intensity-scale.tsx` renders only the color bar and the Low/High labels.

The destination is the fixed stack pinned at `left: 10px`, which is two components in two unrelated stylesheets. Time is a plain `<div>` in `app.tsx:105` styled by `app.scss:63` (`.timeDisplay`, 97 x 47, `top: $topBarHeight + 10px`), rendered outside `.mainContent`. The Wind Meter is inside `SimulationInfo` (`simulation-info.tsx:50`) styled by `simulation-info.scss:105` (`.windContainer`, 97 x 126, `top: 67px + $topBarHeight`), and is `position: fixed` despite living inside a flex row of zone cards inside `.mainContent`. **The two 97px widths are hardcoded independently with no shared variable**, so widening them is two edits that have to stay in lockstep.

`showBurnIndex` defaults to `true` (`config.ts:198`) and is settable per activity and via the `?showBurnIndex=false` URL param documented in `CLAUDE.md`. That param is more useful than it looks for this story: it already renders the bar exactly as this story will leave it, so the post-move bar can be measured today rather than predicted.

## Requirements

- The Fire Intensity Scale is removed from the bottom control bar and rendered in the fixed key area, directly beneath the Wind Meter.
- It appears only when `simulation.config.showBurnIndex` is true, exactly as it does today.
- **It is rendered from `app.tsx`, beside `.timeDisplay`**, and styled in `app.scss`, not added to `SimulationInfo`. `config` is already in scope there (`app.tsx:83`), and this keeps the story out of `simulation-info.*`, which WM-35 edits in the same sprint.
- The three key-area containers are 104px wide: Time 104 x 47, Wind Meter 104 x 126, Fire Intensity Scale 104 x 82. **All three widen unconditionally**, whatever `showBurnIndex` is; there is no 97px variant.
- The 104px value has **one** definition: a `$keyAreaWidth` in `common.scss`, alongside the bottom-bar variables that already live there, read by both `app.scss` and `simulation-info.scss`.
- The three containers stack at `left: 10px` with a 10px vertical gap between each, putting the scale's top at `$topBarHeight + 203px`. **The offsets are expressed as sums of named heights and one named gap**, not as the hand-derived literals `10`, `67` and `203` that each require re-adding two numbers from another file.
- Every container keeps a white fill, 4px radius, and no border.
- The scale's title reads "Fire Intensity Scale" on two lines, Lato Bold 14px `#434343`, centered, in an 84px box inset 10px from the left and 6px from the top. **The break is authored explicitly** (a `\n` in the string plus `white-space: pre-line`, the pattern `wind-circular-control.scss:69-70` already uses), not left to natural wrapping. Natural wrapping produces the right shape only while Lato is loaded, with 0.42px to spare (see Technical Notes).
- The color bar is an 83 x 12 border box: 1px `#797979` inside border, 3px radius, three 27 x 10 swatches with 2px radius on the outer ends only.
- The bar's three colors continue to derive from `BURN_INDEX_LOW` / `BURN_INDEX_MEDIUM` / `BURN_INDEX_HIGH` (`view-3d/terrain.tsx:37-39`). They must not be hardcoded from the design's hex values.
- **The moved component keeps importing those constants from `view-3d/terrain`, unchanged.** The import path looks incidental and is not: it is the sole reason a re-export exists in WM-48's branch (see Technical Notes), so it must not be tidied while moving the file.
- **`colorArrayToRGBA` emits `rgb(...)` rather than a three-argument `rgba(...)`**, and its unreachable four-element branch is removed. All three call sites pass three-element arrays, and the branch multiplies a fourth element by 255, which would be an invalid CSS alpha. This is what makes the swatch colors assertable in Jest at all. As built it is renamed `colorArrayToRGB` to match what it now emits, which the Technical Note below anticipates.
- Low and High labels are Roboto Condensed 14px `#434343`, centered under the first and last swatches respectively.
- **The bottom bar's now-dead scale code is removed**, not left behind: the `showBurnIndex` conditional at `bottom-bar.tsx:220`, the `.fireIntensityScale { width: 140px }` rule (`bottom-bar.scss:150`), the `css.fisHidden` class applied at `bottom-bar.tsx:135`, and the `&.fisHidden` rule (`bottom-bar.scss:174`). Deleting the last of these is a pure removal: measured live, that rule is already inert (see Technical Notes).
- The bottom bar after the change is six widget groups with visible gaps `8, -1, -1, 8, -1` and a `.mainContainer` of 485px at a 950px viewport. These are measured values, not predictions: they are what `?showBurnIndex=false` renders today.
- `cypress/e2e/bottom-bar-visuals.cy.ts` is updated: the 142px width assertion (`:59`) and the scale's place in the seven-widget adjacency chain (`:92`) both go, leaving the six-widget chain above.
- **Three pieces of prose that describe the code this story deletes are updated with it.** Each lives in a different file from the change, which is the case that gets missed: (a) the comment at `bottom-bar.scss:99` names `.fireIntensityScale` (width 140) as one of two examples of the hardcoded-content-width workaround, and that example is about to stop existing, so drop it from the list without restructuring the comment (WM-47 wants to extract the whole workaround, and that is its call); (b) the `bottom-bar-visuals.cy.ts` header says "FIS-hidden centering" lives in the Playwright walkthrough, and after this story there is no FIS-hidden mode at all; (c) `CLAUDE.md`'s `showBurnIndex=false` row says only "Hide burn-index UI", and should say the legend is omitted from the key area while the other two displays are unchanged.
- **That update changes the widget list only, never the gap values.** Four stories rewrite this one chain in sequence and the gap values belong to whichever of them is named as owning "the bar matches the board" (see Technical Notes). Re-deriving or "improving" `8` and `-1` here would pre-empt two questions that are open on WM-47.
- **`cypress/e2e/url-params.cy.ts` gains a position assertion.** Its two existing `showBurnIndex` cases assert only visibility and non-existence of the component's own class, so they pass identically wherever the scale is rendered. After this story they must also assert that it is in the key area.
- **Where each value is verified is stated, because most of them cannot be verified in Jest.** SCSS modules resolve through `identity-obj-proxy`, so no stylesheet is applied in jsdom: every width, offset, radius and border in this spec is a Cypress assertion. The exceptions are the swatch colors, which become a Jest assertion once `colorArrayToRGBA` emits `rgb()`, and the title's two-line content, which is a Jest text assertion once the break is authored.
- **The two Jest assertions reach their elements by `data-testid`, not by class.** `testing-library/no-container` and `no-node-access` are errors in this repo's ESLint config, so `container.querySelector` is not available and the title and each swatch carry a testid for the tests to select. The Cypress geometry additions reuse the swatch testid for the same reason.
- **The Cypress geometry lands in a new `cypress/e2e/key-area-visuals.cy.ts`**, modeled on `bottom-bar-visuals.cy.ts`, because no spec covers the key area today. It pins the three containers' width, left edge, heights and 10px gaps, their fill, radius and absent border, the bar and swatch geometry and end radii, the label centering, the title's box, inset and typography, and, in a second `describe`, that `?showBurnIndex=false` leaves Time and Wind Meter at 104px. The bar's `.mainContainer` width is asserted in `bottom-bar-visuals.cy.ts`, where it is viewport-independent because the container shrink-wraps its widgets.

## Technical Notes

Findings below were established by reading the code on this branch, by measuring the Zeplin board, by throwaway Jest tests, and by live measurement in Chrome against the dev server (all throwaway artifacts since deleted; see the last note).

**Every number came from the board.** Source: *Updated Wildfire Controls and Labels* (`.../screen/6a8566a1c90489f7be36e66a`), group **"Time and Wind Meter Display"** at (1350, 642), whose full redline title is "Time, Wind Meter, and Fire Intensity Scale Displays". The same geometry appears again in the full-app mock at (88, 132).

**The ticket's spec image has since been opened, and it corroborates the board on every value it can carry.** `image-20260821-190853.png` is a 468 x 1118 flat render of the same three-box stack, at a uniform **3.80x** of the CSS geometry, with no notes, annotations, states or callouts of any kind. Measured off the pixels: container width 395px (104.0), box heights 180 / 480 / 312 (47.4 / 126.4 / 82.1), both gaps 38 (10.0). Inside the scale: the title breaks as "Fire Intensity" / "Scale" with each line centered on the container's 52px axis, and "Fire Intensity" measures 82.4px of ink against the 83.58px advance width measured in Chrome; the bar outline sits at y 45.0 spanning 12.0px in **exactly** `#797979` (sampled `(121,121,121)`); the swatch band is 10.3px tall starting at y 45.8, spanning x 11.3 to 92.7 with its two internal boundaries at **38.7** and **65.6**, against the board's 12 / 39 / 66 / 93. The labels settle the one place the board's geometry was ambiguous: "Low" centers at **25.0** against the first swatch's 25.5, and "High" at **79.0** against the third swatch's 79.5, which is centering under the end swatches and not `space-between`. **The one thing the image is not good for is color**: its swatches sample `(244,182,63)`, `(239,135,51)`, `(234,51,35)`, washed toward gray from the board's `#ffb300` / `#ff8000` / `#ff0000`, so it is a screenshot rather than a color-accurate source. The board and the `BURN_INDEX_*` constants agree exactly, and remain the authority on the three colors.

**WM-35's spec image is the same drawing.** `image-20260821-064626.png` (310 x 706) renders the identical stack at **2.32x**: box width 241px (104.0), heights 109 / 293 / 191 (47.0 / 126.3 / 82.4), gaps 24 and 23 (10.3 / 9.9). So the two tickets carry one image at two export resolutions, and neither adds anything the board does not. For WM-35's own purposes it is consistent with `.windText` at its current 68px: the drawn "0 MPH from" is 65.0px of ink centered on the container axis, which fits 68 and could not also take " the".

| Element | Absolute | Size | Style |
|---|---|---|---|
| Time | (1360, 700) | 104 x 47 | `#ffffff`, radius 4, **no border** |
| Wind Meter | (1360, 757) | 104 x 126 | `#ffffff`, radius 4, **no border** |
| Fire Intensity Scale | (1360, 893) | 104 x 82 | `#ffffff`, radius 4, **no border** |

Gaps are 10px between each (747 to 757, 883 to 893), matching the current Time-to-Wind offset exactly: the code's `$topBarHeight + 10` and `$topBarHeight + 67` are 57px apart, and 47 + 10 = 57. So the scale lands at `$topBarHeight + 67 + 136` = `$topBarHeight + 203`, which resolves to y = 225 with `$topBarHeight: 22px` (`common.scss:1`). **Confirmed against the live DOM**, not just arithmetic: with the two existing boxes widened to 104 and a mock scale placed at `top: 225px`, the rendered stack reads Time y=32 h=47, Wind y=89 h=126, Scale y=225 h=82, with both gaps exactly 10.

**The board draws one key-area geometry and no `showBurnIndex: false` variant.** Both instances of the stack (the redline group and the full-app mock) draw all three boxes at 104px; there is no second Time or Wind Meter anywhere on the screen at 97px. The board's own note on the subject, at (88, 417) directly beneath the mock's scale, reads *"Note: the Fire Intensity Scale is only displayed when authored to be displayed"*, and says nothing about the other two boxes changing. The ticket separates the same two facts into two bullets, one conditional ("Fire Intensity Scale only appears when authored") and one not ("this updates also widens the Time and Wind Meter displays"). That is what settles the conditional-width question below.

**The widening is to 104px, not to the bottom bar's 142px.** The earlier guess in `sprint-24-mechanisms.md` was that the key area was being widened toward the bar's 142px widget group. It is not. And the 104 is not arbitrary: the two-line title box is **84px** and sits at a 10px inset, so 10 + 84 + 10 = 104 exactly. The title is what sets the width, and the 84 is itself the natural width of "Fire Intensity" at Lato Bold 14px, measured live at **83.58px**.

**Fire Intensity Scale internals, measured.** Relative to the 104 x 82 container:

| Piece | Rel. position | Size | Style |
|---|---|---|---|
| Title "Fire Intensity\nScale" | (10, 6) | 84 x 34 | Lato Bold 14px, `#434343`, centered, hard-wrapped to two lines |
| Color bar outline | (11, 45) | 83 x 12 | 1px inside `#797979`, radius 3 |
| Low swatch | (12, 46) | 27 x 10 | `#ffb300`, radius 2 |
| Medium swatch | (39, 46) | 27 x 10 | `#ff8000`, no radius |
| High swatch | (66, 46) | 27 x 10 | `#ff0000`, radius 2 |
| "Low" | (14, 59) | 23 x 16 | Roboto Condensed 14px, `#434343`, centered |
| "High" | (66, 59) | 26 x 16 | Roboto Condensed 14px, `#434343`, centered |

The vertical rhythm sums exactly: 6 + 34 + 5 + 12 + 2 + 16 + 7 = 82.

**The title's natural wrap is knife-edge and fails on the fallback font.** Measured in Chrome at Lato Bold 14px: "Fire Intensity" is **83.58px**, so it fits an 84px box with **0.42px** to spare, and an 83px box already produces three lines. With Lato absent and the stack falling back to `sans-serif` (Arial in this browser), the same string measures **87.14px** and the title wraps to **three lines** inside the 84px box. Three lines is 51px of title in a container that budgets 34, which pushes the bar and both labels 17px past the 82px box. So the authored break is not a style preference; it is what keeps a font-loading failure from breaking the layout. The repo already has this exact pattern in `wind-circular-control.scss:69-70`.

**The colors are unchanged, and the derivation must survive the move.** Verified by throwaway test rather than by eye: `BURN_INDEX_LOW = [1, 0.7, 0]`, `MEDIUM = [1, 0.5, 0]`, `HIGH = [1, 0, 0]` convert to exactly `#ffb300`, `#ff8000`, `#ff0000`, which are precisely the three hexes on the board. The restyle is geometry and typography only. Copying the hexes into SCSS would silently decouple the legend from the terrain shading it explains: `showBurnIndex` also drives `terrain.tsx:129`, where a false value replaces the three-tier burn-index coloring with a single `BURNING_COLOR`.

**TESTABILITY TRAP: the bar colors cannot be asserted in jsdom as the helper stands.** `colorArrayToRGBA` (`fire-intensity-scale.tsx:6-7`) emits `rgba(r,g,b)` with **three** arguments, since the `BURN_INDEX_*` constants have three elements. Browsers accept that as opaque `rgb()` under CSS Color 4, so there is no production bug. jsdom's CSS parser rejects it and silently drops the declaration: probed directly, `style.backgroundColor = "rgba(255,179,0)"` yields `""`, while `"rgb(255,179,0)"` and `"rgba(255,179,0,1)"` both yield `"rgb(255, 179, 0)"`. So a Jest test asserting the moved scale's swatch colors reads back empty strings, and a test written against that empty result would pass forever regardless of the colors.

**The helper's four-element branch is not just dead, it is wrong.** `colorArrayToRGBA` is module-private with exactly three call sites, all in `fire-intensity-scale.tsx`, all passing three-element `BURN_INDEX_*` arrays. Its guard reads `idx < 4 ? Math.round(v * 255) : v`, so a hypothetical fourth element (alpha, which CSS expects in 0 to 1) would also be multiplied by 255 and emitted as an invalid `rgba(255,0,0,128)`. The guard was presumably meant to be `idx < 3`. Since nothing reaches it, the branch and the `rgba` naming can go together with the fix.

**The `fisHidden` rule is already inert; deleting it changes nothing.** Proved live rather than assumed. Under `?showBurnIndex=false` the bar carries the `fisHidden` class, but `.mainContainer`'s computed `margin-left` and `margin-right` are both `0px`, and removing the class from the live DOM leaves its rect byte-identical (x 242.5, width 485, and the same +10px offset from viewport center). The reason is that `.leftContainer` and `.rightContainer` are both `flex: 1 1 0%`, so they consume all the free space and there is nothing for `margin: auto` to distribute. The two centering mechanisms the review asked about are not in competition: the flex siblings do all the work in both modes, and the `margin: 0 auto` has never done anything. (The +10px offset from true viewport center is pre-existing in both modes, caused by `.leftContainer` shrink-wrapping wider than `.rightContainer`, and is not this story's concern.)

**The post-move bottom bar is observable today.** `?showBurnIndex=false` renders exactly what this story leaves behind: six widget groups (Setup, Spark, Reload+Restart, Start, Fireline, Helitack) with adjacency gaps `8, -1, -1, 8, -1`, a `.mainContainer` of 485px, at a 950px viewport. With the scale present the same measurement is seven groups, gaps `8, -1, -1, 8, -1, 8`, and 635px. So updating the Cypress adjacency test means dropping the seventh id and the trailing `8`, and the expected result does not have to be invented.

**WM-47's spec measured the same row independently and agrees to the pixel.** Worth recording because the two passes never shared a number: it read today's bar as widths `84 / 62 / 122 / 62 / 67 / 67 / 142` with gaps `8, -1, -1, 8, -1, 8` and a widget span of **627px**. Removing the scale's 142 and the trailing 8 leaves exactly the six widgets and `8, -1, -1, 8, -1` above, and the `.mainContainer` figures reconcile through a constant 8px trailing margin on the last group: 627 + 8 = 635 with the scale, 477 + 8 = 485 without. So both specs' numbers corroborate each other rather than descending from one measurement.

**The gap values are not this story's to change, and two open questions on WM-47 are why.** Its QA finding "The adjacency test's expected values are being rewritten by four stories in sequence" resolves to a rule this story has to follow: whichever story is named as owning "the bar matches the board" re-derives the entire chain in one pass from the board's table, and **the intervening stories change only the widget list**. Both of the numbers in play here are live questions there: whether the abutting seam becomes `-2px` per the board (it is drawn `-2` at all four seams, consistently, so the "drawing artifact" reading is dead), and whether WM-47 or the last of the four applies `$bottomBarWidgetGroupSpacing: 9px -> 4px`. Neither blocks this story, because keeping today's values is what the rule prescribes either way. Note also that WM-47 measured the finished row at **667px, 40px wider than today's 627**, so the 151px this story frees is a gross figure that Vegetation Key (92) and Speed (99) more than consume; that does not change anything here, but it retires the "may well be a net gain" guess in `sprint-24-mechanisms.md`.

**WM-48 turns this component's import path into a load-bearing detail, so do not tidy it.** `fire-intensity-scale.tsx:3` is the **only** importer of the burn-index colors from `view-3d/terrain`. WM-48's prototype pulls the palette out into `terrain-colors.ts` so the shader can share it without a circular import, and keeps a re-export in `terrain.tsx` **specifically** to keep this one import working. Since this story lands Wednesday and WM-48 Thursday, the correct action here is to move the component and leave the import exactly as it is; WM-48's re-export then carries it. WM-48's own spec records the tidier end state for afterwards: once it has landed, this component can import from `terrain-colors.ts` directly and the re-export can go. That is a follow-up, not this story's work, and doing it early would break a file that does not exist on master yet.

**Geometry deltas from today.** The bar shrinks: `.barsContainer` is 88 x 15 content (90 x 17 border box) and becomes 81 x 10 content (83 x 12 border box). Its swatches move from `33.33%` each to a fixed 27px, which is an exact third of the 81px inner width, so percentages would also work. The labels row is 80px wide with `justify-content: space-between` today; on the board the two labels are centered under the end swatches instead (Low spans 1374-1397 against a swatch at 1372-1399; High spans 1426-1452 against 1426-1453), which is close to but not the same as space-between.

**The title has to be carried across, because it is not part of the component.** Confirmed by throwaway test: `<FireIntensityScale/>` renders "Low" and "High" and nothing matching "Fire Intensity". The string lives in `bottom-bar.tsx:222`. Either the component absorbs it or the new key-area wrapper supplies it, but it cannot simply be moved with the component as-is.

**The board's other two notes on this group are already satisfied, and should not be read as new work.** *"Note that outlines have been removed from these two displays (they are not interactive)"* matches the current code, which gives neither box a border. *"Also note color change compared to the Wind Meter in the Setup Panel"* is already implemented and documented: `wind-dial.scss:29-36` makes the dial outline and arrow `#2997ff` only in the interactive (Setup panel) case, and the read-only map meter keeps the gray baked into the SVGs, which is the `#797979` the board draws.

**Nothing else is fixed on the left edge.** The only `position: fixed` elements in `app.scss` are `.mainContent` (full width, `left: 0`), `.rightContent` (right-anchored), the debug `.topLine` rules, and `.timeDisplay`. The scale's new band, y 225 to 307, is clear. Note that `.mainContent` is itself `position: fixed` with `overflow: hidden` but no transform, which is why the Wind Meter's `position: fixed` escapes the clip today; rendering the scale from `app.tsx` keeps it outside that arrangement entirely, as Time already is.

**Grep trap, still live.** `.windContainer` exists in two stylesheets. `wind-circular-control.scss:3` is the wind control inside the Terrain Setup panel, a different component. The on-map Wind Meter is `simulation-info.scss:105`.

**Suite baseline, re-measured after rebasing onto `3081fb6` (2026-08-25).** `npx jest` reports **1006 tests across 78 suites**. The earlier 879 figure in this spec was measured before WM-42, WM-54 and WM-31 merged and is superseded. No Jest test touches the key-area geometry or the scale's placement.

**One test on master is intermittently red, and it is not this story's.** `fire-engine.test.ts:105`, *"burns out a burning cell whose ignition time a fire line erased"*, fails on roughly one run in two: three consecutive full-suite runs on the rebased head gave 1005/1006, 1006/1006, 1005/1006, while the file passes 10/10 in isolation. The cause is unseeded randomness rather than test order: `fire-engine.ts:155` gates end-of-low-intensity-fire on `Math.random()` and `:183` gates fire survival the same way, so whether every cell is out by the test's fixed day-7 advance is a coin flip. It arrived with WM-31's fire-line fix (`8d2d5a1`), merged today. **Consequence for this story: a red `fire-engine` line in a local run is pre-existing noise, not a regression, and the PR body's test count must not be quoted from a single run.**

**Throwaway artifacts.** Four Jest cases were written and deleted: the `BURN_INDEX_*` to Zeplin-hex equality, the rendered-bar color probe that exposed the jsdom trap, the title-ownership check, and a standalone jsdom `rgba()` arity probe. The live Chrome work used temporary inline styles and a mock key-area box on the running page, all reverted; an assembled screenshot of the result is at `tmp/playwright/wm52-key-area-assembled.png` (gitignored).

## Out of Scope

- **WM-35's Wind Meter label wrap.** The board draws `.windText` at its current 68px width, on two lines, for the shortest possible string ("0 MPH from the N"), and the assembled mock reproduces exactly that: at a 104px container the label still takes two lines. So widening the container does **not** by itself fix the three-line wrap, and WM-35 remains real work at its own fixed 81px label width, independent of this story's container. See the resolved question below.
- **The Vegetation Key toggle** that takes the freed bottom-bar space. That belongs to WM-48, whose description carries it ("a new switch is introduced to the bottom controls, to the right of Setup button", hidden by default).
- **WM-47's Clear All rename and its spacing tightening**, and **WM-40's speed control**. Both land in the same row. WM-47's stated justification for tightening ("esp when the Fire Intensity Scale is displayed") is what this story deletes, so its spacing bullet should be re-read after this lands rather than built against today's bar.
- **Re-laying out the bottom bar as a whole.** This story removes one widget group and lets the existing flex-sibling centering take over. The single layout pass across WM-47, WM-40 and WM-48 is separate work.
- **Extracting a `KeyArea` component that owns all three boxes.** Deferred rather than rejected: it is the right end state, but it would move `.windContainer` out of `simulation-info.scss`, which WM-35 is editing in the same sprint, and the shared `$keyAreaWidth` closes the duplication this story would otherwise introduce. Revisit once WM-35 has landed.
- **The bar cluster's pre-existing 10px offset from true viewport center**, caused by `.leftContainer` shrink-wrapping wider than `.rightContainer`. It is identical before and after this change.
- **Accessibility review**, per the standing scope for this repo.

## Open Questions

### RESOLVED: Do the Time and Wind Meter containers widen to 104px unconditionally, or only when the scale is authored?
**Context**: This is the one question `sprint-24-mechanisms.md` left open and the ticket does not answer in so many words: its bullets put "only appears when authored" and "widens the Time and Wind Meter displays" next to each other without connecting them. The deep dive adds one argument against unconditional widening: the 104 is set by the scale's own 84px two-line title (10 + 84 + 10), so with the scale absent there is no content reason for Time and Wind to be 104 rather than 97. Against that, conditional widening gives the key area two widths and makes the two displays visibly jump between activities.
**Options considered**:
- A) Widen unconditionally. One width, one set of constants, and the `showBurnIndex: false` case simply omits the third box.
- B) Widen only when the scale is shown, keeping 97px as the no-scale width.
- C) Ask Michael. It is one line, and both stories affected are Doug's, so it costs only sequencing.

**Decision**: **A**, and the board answers it, so C is unnecessary. Three pieces of evidence point the same way. The board draws exactly one key-area geometry: both instances of the stack (the redline group at 1350,642 and the full-app mock at 88,132) put all three boxes at 104, and there is no Time or Wind Meter anywhere on the screen at 97. The board's own note on this subject, pinned directly under the mock's scale, scopes the conditionality to the scale alone: *"Note: the Fire Intensity Scale is only displayed when authored to be displayed"*, with nothing about the other two boxes. And the ticket states the two facts as separate bullets, one conditional and one flat ("this updates also widens the Time and Wind Meter displays"). Beyond the design, B would introduce a conditional width where the app has never had one (97px is unconditional today) and would put the key-area width in a branch, which is the opposite of the single-definition requirement. The content argument for B is real but weak: 7px of unused width on two read-only boxes costs a student nothing, while two layouts cost every reader of the stylesheet something.

---

### RESOLVED: Does this story absorb WM-35's wrap fix, now that the board shows the container does not resolve it?
**Context**: WM-35 was written on the assumption that a companion story's widening might fix the wrap on its own. The board says otherwise: `.windText` is drawn at the same 68px it has today, inside the new 104px container, wrapping to two lines for the shortest string. The two stories are both Doug's and are scheduled on the same day with WM-52 first, so folding the `.windText` change in here is possible, but it is a separate ticket with its own points and its own signed-off spec image.
**Options considered**:
- A) Keep them separate. WM-52 sets the container width; WM-35 then targets 104px rather than 97px.
- B) Fold the `.windText` fix into WM-52, since the same two files are open and the dependency is real.

**Findings:** option B's stated premise is gone. WM-35's own spec settles it by measurement in both directions (`specs/WM-35-wind-meter-label-wrap/requirements.md`, the "WM-52 does not change the number" note): `.windText` carries its own explicit width, so the container width is irrelevant to the wrap, its chosen width fits inside both 97 and 104, and the target does not move. "Build order between the two stories is therefore a convenience, not a dependency." Confirmed live here from the other side: in the assembled 104px mock the label still wraps to two lines on the shortest string. One caveat worth carrying into the decision: WM-35 has its own open question whose option C is "drop the fixed width entirely and let the label fill the container's inner width". If that option is chosen, WM-35 becomes genuinely coupled to this story's width, and doing them together starts to make sense again. So this question is best answered after WM-35's width question, not before it.

**Decision**: **A**, and the caveat above is now dead rather than deferred: WM-35's width question resolved to **B, 81px**, a fixed width on `.windText`, and it rejected option C ("let the label fill the container's inner width") explicitly, in its own Out of Scope and twice more in its self-review, on the stated grounds that C would create exactly the cross-story coupling this story avoided. So there is no version of WM-35 that depends on this story's container width. One correction to option A as written above: WM-35 does not "target 104px rather than 97px", and after this it targets neither. Its 81px is sized against `"from the WNW"` at 80.03px and is required only to *fit inside* the container, which it does at 97 and at 104 alike. The dependency is therefore retired in both directions rather than re-pointed, which is what WM-35's own Product Manager finding asks for. What survives is a build-order convenience with one concrete benefit: going WM-52 first lets WM-35 write its width comment against the final 104px container once instead of writing 97px and amending it.

---

### RESOLVED: Where should the scale be rendered: `app.tsx` beside Time, or `SimulationInfo` beside the Wind Meter?
**Context**: The key area is already split across two components for no visible reason. Time is a bare `<div>` in `app.tsx` styled by `app.scss`; the Wind Meter is inside `SimulationInfo` and styled by `simulation-info.scss`, and is `position: fixed` even though it sits in a flex row of zone cards. A third fixed box makes the split worse whichever side it lands on. Consolidating all three into one key-area component would give the shared 104px width one home, but it is scope this ticket did not ask for.
**Options considered**:
- A) Add it to `SimulationInfo`, next to the Wind Meter it sits beneath.
- B) Add it to `app.tsx`, next to Time.
- C) Extract a `KeyArea` component that owns all three boxes and the shared width, and have `app.tsx` render it.

**Decision**: **B now, C later.** C is the right end state and it would dissolve both Senior Engineer findings below rather than patching them, but it has a concrete cost this sprint: it moves `.windContainer` out of `simulation-info.scss`, and WM-35 is editing that exact rule block in the same sprint, so the two branches would collide over a refactor neither ticket asked for. With `$keyAreaWidth` extracted (below), the duplication C exists to fix does not get worse, so deferring costs nothing but the split staying as it is. Between A and B, B is better on three counts: `app.tsx` already has `config` in scope (`app.tsx:83`), so the `showBurnIndex` conditional is a two-line addition next to the existing `.timeDisplay`; the scale lands outside `.mainContent`, where Time already is, rather than inside a flex row of zone cards; and `SimulationInfo`'s job is zone cards, which the legend has nothing to do with. Worth noting why A is not actively broken: `.mainContent` is `position: fixed` with `overflow: hidden` but carries no transform, so it does not establish a containing block and the Wind Meter's own `position: fixed` escapes the clip. B avoids depending on that.

---

### RESOLVED: Should `colorArrayToRGBA` be changed to emit `rgb()` for three-element colors?
**Context**: The helper emits a three-argument `rgba()`, which browsers accept and jsdom rejects. Nothing is broken in production, but it makes the swatch colors untestable in Jest, and this story is the moment the colors move and most want a test. The argument against is that it is unrelated to the story and the colors can be pinned in Cypress instead.
**Options considered**:
- A) Fix the helper to emit `rgb()` for three-element arrays and pin the colors in a Jest test.
- B) Leave it and pin the colors in Cypress alongside the geometry.
- C) Leave it and pin nothing; the derivation from `BURN_INDEX_*` is visible in the source.

**Decision**: **A**, and it is a deletion rather than an addition, which removes the "unrelated scope" objection. The helper is module-private with exactly three call sites, all in the file this story is already rewriting, all passing three-element arrays. Its four-element branch is unreachable *and* wrong: `idx < 4 ? Math.round(v * 255) : v` multiplies a fourth element by 255, so an alpha of 0.5 would emit `rgba(255,0,0,128)`, which is not valid CSS. So the change is "emit `rgb(r,g,b)` and delete the branch nothing reaches", which is the repo's standing rule about deleting what a change orphans. C is ruled out by the requirement that the colors keep deriving from `BURN_INDEX_*`: an invariant with no test is one refactor away from being a hardcoded hex. B is weaker than A rather than wrong, but it leaves the one assertion that is cheap and mutation-visible (change a `BURN_INDEX_*` constant, the Jest test fails) locked behind a browser run. Geometry still goes to Cypress either way.

---

### RESOLVED: Is the two-line title a hard break or a width-driven wrap?
**Context**: The board's text layer content is literally `"Fire Intensity\nScale"`, an authored line break, in an 84px box. "Fire Intensity Scale" at Lato Bold 14px would also wrap to two lines in 84px on its own, but not necessarily at the same point, and a font fallback could break it as "Fire / Intensity Scale". Hard-coding the break guarantees the drawn shape; letting it wrap keeps the string a single translatable unit and matches how the bottom bar renders it today.
**Options considered**:
- A) Let it wrap naturally in the 84px box.
- B) Author the break explicitly, matching the board's own line content.

**Decision**: **B**, on measurement. In Chrome at Lato Bold 14px, natural wrapping in an 84px box does produce exactly `["Fire Intensity", "Scale"]` at a 34px height, matching the board, so A looks correct at first. But the margin is **0.42px**: "Fire Intensity" measures 83.58px, and an 83px box already yields three lines. More decisively, with Lato unavailable and the stack falling back to `sans-serif`, the same string measures **87.14px** and the title takes **three lines** inside the 84px box. Three lines is 51px of title where the container budgets 34, so the bar and both labels are pushed 17px past the 82px box, on a font-loading failure rather than a code change. The concern the finding raises about the break landing in the wrong place is also unfounded in the other direction: "Intensity Scale" is 92px, so the three-line fallback is "Fire / Intensity / Scale", not the feared "Fire / Intensity Scale". The repo already has this pattern with a comment explaining it (`wind-circular-control.scss:69-70`), so B costs one `\n` and one `white-space: pre-line`.

## Self-Review

### Senior Engineer

#### RESOLVED: The 104px width will be written in three places unless something is extracted first
Today 97px is duplicated across `app.scss` and `simulation-info.scss` with no shared variable, and this story adds a third container. Changing the number becomes a three-file edit that silently half-applies if one is missed, and there is no test that would catch a 104/97 mismatch. `common.scss` already holds `$topBarHeight` and the bottom-bar spacing variables, so it is the obvious home for a `$keyAreaWidth`.

**Decision**: accepted as written, and it is now a requirement. `common.scss` is confirmed as the right home: it already carries `$topBarHeight`, `$bottomBarHeight` and `$bottomBarWidgetGroupSpacing`, the last of these with a comment explaining how the value is derived, which is exactly the pattern a `$keyAreaWidth` should follow. Doing this first also makes the conditional-width question above cheap either way, as the finding says, though that question is now resolved to the unconditional option so only one value is needed. Note that this is also what lets the `KeyArea` extraction be deferred without the duplication getting worse.

---

#### RESOLVED: The vertical offsets are magic numbers derived from each other
`.timeDisplay` uses `$topBarHeight + 10px` and `.windContainer` uses `67px + $topBarHeight`, where 67 is silently 10 + 47 + 10. The scale adds `$topBarHeight + 203px`, where 203 is silently 67 + 126 + 10. Each new box requires re-deriving the sum by hand from two other files, and changing any height breaks the stack with no failing test.

**Decision**: accepted; the offsets become sums of named heights and one named gap, alongside `$keyAreaWidth` in `common.scss`. The finding's arithmetic checks out against the live DOM: the rendered stack is Time at y=32 (22 + 10), Wind at y=89 (22 + 67), and the mocked scale at y=225 (22 + 203), with both gaps exactly 10. That measurement is also what makes the change safe to make in the same story: the numbers being replaced are known to be correct, so a named-sum version can be checked against them rather than re-derived. The 10px gap is the board's own rhythm (747 to 757, 883 to 893), so it deserves a name rather than three occurrences.

---

#### RESOLVED: Deleting `fisHidden` changes behavior for the `showBurnIndex: false` case, and that should be verified rather than assumed
The plan is that removing the scale makes the `fisHidden` centering unconditional, so the class can go. That is true only if `.mainContainer`'s default layout without `margin: 0 auto` is not relied on somewhere else in the bar. `.leftContainer` and `.rightContainer` are both `flex: 1` specifically to keep `.mainContainer` centered without the margin, which suggests the margin is a workaround for the scale's asymmetric width rather than the general case. Check which of the two centering mechanisms survives before deleting either.

**Decision**: verified, and the answer is better than the plan assumed: **the `fisHidden` rule is already inert, so deleting it is a pure removal with no behavior change at all.** Measured live under `?showBurnIndex=false`, where the class is applied: `.mainContainer`'s computed `margin-left` and `margin-right` are both `0px`, and removing the class from the DOM leaves the rect byte-identical (x 242.5, width 485). The `margin: 0 auto` never takes effect because `.leftContainer` and `.rightContainer` are `flex: 1 1 0%` and consume all the free space, leaving nothing for `margin: auto` to distribute. So the two mechanisms the finding asks about are not in competition and only one has ever been doing anything. One incidental observation: the cluster sits 10px right of true viewport center in **both** modes, because `.leftContainer` shrink-wraps wider than `.rightContainer`; that is pre-existing, unchanged by this story, and recorded in Out of Scope.

---

### QA Engineer

#### RESOLVED: The requirements are almost entirely geometry, and none of it is currently testable in Jest
Fourteen measured values, and the repo's Jest setup stubs CSS modules and does not apply stylesheets, so none of the widths, gaps, radii, or colors can be asserted there. The only place they can be pinned is Cypress, which already has a bottom-bar visual spec doing exactly this for the bar. The requirements should say where each value is verified.

**Decision**: accepted; the requirements now state it explicitly, and the split is smaller than the finding assumed because two of the values move into Jest's reach. Confirmed: `jest.config`'s `moduleNameMapper` sends `\\.(css|less|sass|scss)$` to `identity-obj-proxy`, so `css.foo` is the string `"foo"` and no stylesheet is ever applied. Every width, offset, radius and border is therefore a Cypress assertion. The two exceptions are created by decisions above: the swatch colors become a Jest assertion once `colorArrayToRGBA` emits `rgb()`, and the title's two-line content becomes a Jest text assertion once the break is authored rather than left to layout. Both are mutation-visible in Jest, which the geometry never can be.

---

#### RESOLVED: The two Cypress specs need opposite treatment and the spec only names one
`bottom-bar-visuals.cy.ts` must lose its scale assertions. `url-params.cy.ts` must keep its two `showBurnIndex` assertions **and** gain a position assertion, because after the move those two tests would pass identically whether the scale landed in the key area or was accidentally rendered anywhere else on the page: they only assert existence and visibility of a class. That is a test that cannot fail for the thing this story actually changes.

**Decision**: accepted verbatim, confirmed against the file, and added as a requirement. `url-params.cy.ts:6` and `:11` select `.fire-intensity-scale--fireIntensityScale--__wildfire-v1__` and assert only `should("be.visible")` and `should("not.exist")`. That class is the component's own root and survives the move untouched, so both cases pass unchanged wherever the component is rendered, including in the bottom bar it is supposed to leave. The position assertion is what makes the pair able to fail.

---

#### RESOLVED: No criterion covers what the bottom bar looks like after the scale leaves
The requirement says the dead code is removed and the container centers unconditionally, but nothing states the expected bar width or the gap chain that results. The existing adjacency test asserts an exact sequence of 8px and -1px gaps across seven widgets; after this change it is six widgets and the expected values are unstated. Whoever updates that test will be inventing the expected result rather than checking it against a spec.

**Decision**: accepted, and the expected result does not have to be invented, because the app already renders it. `?showBurnIndex=false` produces exactly the post-move bar: six widget groups (Setup, Spark, Reload+Restart, Start, Fireline, Helitack) with adjacency gaps `8, -1, -1, 8, -1` and a `.mainContainer` of 485px at a 950px viewport, against seven groups, gaps `8, -1, -1, 8, -1, 8` and 635px with the scale present. All of it measured live. So the Cypress update is a deletion of the seventh id and the trailing `8`, checked against a rendering rather than a prediction, and the numbers are now in the requirements.

---

### Product Manager

#### RESOLVED: This story is a dependency for three others and the spec says so only in Out of Scope
WM-35 targets the width this sets, WM-47's spacing justification is deleted by it, and WM-48's toggle takes the space it frees. That makes WM-52 the first move in a four-story sequence, which is a scheduling fact worth stating up front rather than in the exclusions.

**Decision**: accepted; moved to the Overview, with one correction to the word "dependency". None of the three is blocked in the strict sense: WM-35's own spec establishes by measurement that its 74px target fits inside both the old 97px and the new 104px container, so the build order there is convenience rather than dependency; WM-47's coupling is that this story deletes its stated justification, not its ability to proceed; and WM-48's is that it takes space this story frees, which it can also do afterwards. What is true, and now stated, is that all three are written against a bar and a key area this story changes, so it should land first. The Out of Scope entries stay as the per-story detail.

---

#### RESOLVED: The spec image on the ticket was never opened, and the spec should say the board replaced it
`image-20260821-190853.png` (234 x 559) is still unread. Every value here came from the Zeplin board instead, and the two agree in the sense that the board's group is the finished stack. But if the attachment carries anything the board does not (a state, a note, an annotation), it is unrecorded.

**Findings:** the ask is sharper than "five minutes in a browser", because the image is not reachable the way an attachment would be. Reading the ticket through `acli` shows it has **no attachment records at all**: the image is an inline ADF `media` node in the description body (`id: bf0c4b4f-affe-4bb8-a8eb-5440a8dd3d19`, `collection: ""`, alt `image-20260821-190853.png`, 234 x 559), so there is no attachment id to fetch and the CLI cannot retrieve it. Opening it genuinely requires the Jira web UI. Two things reduce the risk while it stays unread: the ticket's own description text was read in full during this pass and matches the spec (its four bullets are the move, the authored-only rule, the restyle, and the widening), and the image's 234 x 559 proportions are roughly the 104 x 275 stack at 2x, so it is most likely the same drawing the board carries. Note that WM-35's spec has an open question about the same unread-image problem on its own ticket, so one browser session closes both.

**Decision**: closed by opening it, 2026-08-25, and it changes nothing. Downloaded through the Jira web UI, as predicted, since no CLI route exists. The prediction that it is "most likely the same drawing the board carries" was correct and is now measured rather than inferred: it is a flat 468 x 1118 render of the same three-box stack at a uniform 3.80x, carrying **no state, note, annotation or callout**, so the risk the finding names is closed rather than accepted. Every value it can carry agrees with the board, including the two that were worth the trip: the title's authored break renders as "Fire Intensity" / "Scale", and the Low/High labels center under the end swatches rather than sitting at `space-between`. One limit worth recording: the image's swatch colors are washed toward gray, so it is not a color source and the board plus `BURN_INDEX_*` remain the authority there. WM-35's copy was opened in the same session and is the identical drawing at 2.32x, which closes its equivalent question too. Both measurements are in Technical Notes.

---

### Student

#### RESOLVED: The legend moves away from the thing it explains, and nothing says whether that is better
The scale explains the colors on the burning terrain. In the bottom bar it sits at the end of a row of controls, far from the map; in the key area it sits directly beside the map, under the wind and time readouts, which is the argument for the move. But it also moves away from the moment of use: a student watching a fire spread is looking at the terrain, and the key area is above it while the bar is below it. Worth one look at the assembled screen before calling the placement settled.

**Decision**: the look was taken, and it supports the move. An assembled mock was built on the running app (both existing boxes widened to 104, the bar's scale group hidden, and a board-accurate 104 x 82 box placed at `left: 10px; top: 225px`) and screenshotted at `tmp/playwright/wm52-key-area-assembled.png`. Measured on that render at a 950px viewport: today the scale's widget group sits at x 651 to 793, at the far right end of the control row and below the terrain; in the key area it sits at x 10 to 114, y 225 to 307, immediately left of the terrain and inside its vertical band. The three white boxes read as one column rather than three unrelated overlays. The premise that the key area is "above" the map is not what the screen shows: the stack runs down the left edge alongside the terrain, not above it. Combined with the fact that the placement is what the board draws, there is nothing here to reopen.

---

#### RESOLVED: Two 14px lines of title above a 12px bar makes the title the dominant element
In the container, the title occupies 34 of 82 vertical pixels and the actual color key occupies 12. The bar also shrinks from 15px tall to 10px. For a legend whose job is to let a student match a color on the map to a word, the key itself is now the smallest part of the box. That is what the board draws, so it is a designer's decision rather than a defect, but it is worth confirming that the shrink was intended and not a consequence of fitting a two-line title.

**Findings:** the causality runs the other way from what the finding suspects, which is worth having before asking. The two-line title is not a consequence of the box size; the box size is a consequence of the title. The container's 104px width is exactly 10 + 84 + 10, where 84 is the natural width of "Fire Intensity" at Lato Bold 14px (measured live at 83.58px), and the vertical rhythm sums exactly to 82 with no slack anywhere (6 + 34 + 5 + 12 + 2 + 16 + 7). So the whole container was sized around a deliberately two-line title, which makes an accidental shrink unlikely. The question that remains for Michael is therefore narrower and better posed: not "was the bar meant to shrink" but "was the title meant to be the widest element in the key area", since it is what sets the width of all three boxes. Worth pairing with the note that the shrink is real: 15px tall to 10px, and 88px wide to 81px.

**Decision**: build the board as drawn, and put the narrowed question to Michael as an FYI rather than a gate. Nothing here is in doubt at build time: he drew this geometry twice on the board, the ticket's spec image renders the same proportions a third time, and its own note scopes the conditionality to the scale's presence without saying anything about proportions. So the restyle proceeds and no story waits on an answer. The question is still worth asking because of what the 84px title now carries downstream: it is what sets the 104px width, and that width is inherited by the Time and Wind Meter boxes, is the container WM-35 writes its label comment against, and is the left-edge footprint WM-49 must lay its zone labels clear of. If that number should ever be smaller, the title is the only place it can give, so it is better to know now than after three stories have been written against it. Michael is the right person to ask and Trudi has not weighed in on any of the key-area work. The message carries it alongside WM-47's open `-2px` versus `-1px` seam question, which is the same person, the same board and the same row, and which does have a decision riding on the answer.

**Answered by Michael, 2026-08-26 05:52 EDT: "104 is right."** No change to anything in this spec. The 104 is now confirmed from three independent directions rather than two: the board draws it twice, the ticket's spec image renders it a third time, and the designer has now stated it in words. Downstream stories can treat it as settled rather than provisional, which is what the FYI was for.

---

### Education Material Developer

#### RESOLVED: An activity authored with `showBurnIndex: false` now has an empty gap or a shifting layout, and neither is specified
The flag turns off both the legend and the three-tier terrain coloring. After the move, an activity with it false has a key area of two boxes instead of three. Whether the space below the Wind Meter is simply empty (fine) or the two boxes change width (the open question above) determines whether authors see one layout or two.

**Decision**: answered by the conditional-width decision above, and now specified. There is **one** key-area layout: all three containers are 104px wide whatever `showBurnIndex` is, and a false value simply omits the third box, leaving the space below the Wind Meter empty. Authors therefore see one geometry, not two, and the flag's only layout effect is the presence or absence of the legend. The documentation half of the finding stands and is worth acting on: `showBurnIndex` is documented today only as a URL param in `CLAUDE.md`, with no note of what it does to the key area, and that line should say the legend is omitted and the other two displays are unchanged.
