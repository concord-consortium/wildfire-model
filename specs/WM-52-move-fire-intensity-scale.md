# WM-52: Move the Fire Intensity Scale to the display area (upper left)

**Jira**: https://concord-consortium.atlassian.net/browse/WM-52

**Status**: **Closed**

## Overview

The Fire Intensity Scale moves out of the bottom control bar and into the fixed key area down the left edge, sitting beneath the Wind Meter. All three key-area containers (Time, Wind Meter, Fire Intensity Scale) widen from 97px to 104px, and the scale is restyled to fit: a two-line title, a shorter color bar, and Low/High labels centered under the end swatches.

It is the first of four stories landing in the bottom bar in one sprint. WM-35 was written against the container width this story sets, WM-47's stated justification for tightening the bar's spacing ("esp when the Fire Intensity Scale is displayed") is deleted by this story, and WM-48's Vegetation Key toggle takes the bar space this story frees. None of the three is blocked by it in the strict sense, but all three are written against a bar and a key area this story changes, so it lands first.

The bottom control bar was running out of room, and the scale is the one thing in that row that is not a control: it is a legend, and legends belong with the other legends. Moving it groups the three read-only displays into one column beside the map. The scale keeps its existing rule of only appearing when an activity is authored to show the burn index.

## Requirements

- The Fire Intensity Scale is removed from the bottom control bar and rendered in the fixed key area, directly beneath the Wind Meter.
- It appears only when `simulation.config.showBurnIndex` is true, exactly as it did before.
- **It is rendered from `app.tsx`, beside `.timeDisplay`**, and positioned from `app.scss`, not added to `SimulationInfo`. `config` is already in scope there, and this keeps the story out of `simulation-info.*`, which WM-35 edits in the same sprint.
- The three key-area containers are 104px wide: Time 104 x 47, Wind Meter 104 x 126, Fire Intensity Scale 104 x 82. **All three widen unconditionally**, whatever `showBurnIndex` is; there is no 97px variant.
- The 104px value has **one** definition: a `$keyAreaWidth` in `common.scss`, alongside the bottom-bar variables that already live there, read by both `app.scss` and `simulation-info.scss`.
- The three containers stack at `left: 10px` with a 10px vertical gap between each, putting the scale's top at `$topBarHeight + 203px` (y = 225). **The offsets are sums of named heights and one named gap**, not the hand-derived literals `10`, `67` and `203` that each required re-adding two numbers from another file.
- Every container keeps a white fill, 4px radius, and no border. The fill and radius are also single definitions in `common.scss`, since three containers must agree on them *(added during implementation review: the two pre-existing containers already disagreed, `background: white` against `background: #fff`)*.
- The scale's title reads "Fire Intensity Scale" on two lines, Lato Bold 14px `#434343`, centered, in an 84px box inset 10px from the left and 6px from the top. **The break is authored explicitly** (a `\n` in the string plus `white-space: pre-line`), not left to natural wrapping.
- The color bar is an 83 x 12 border box: 1px `#797979` inside border, 3px radius, three 27 x 10 swatches with 2px radius on the outer ends only.
- The bar's three colors continue to derive from `BURN_INDEX_LOW` / `BURN_INDEX_MEDIUM` / `BURN_INDEX_HIGH` (`view-3d/terrain.tsx`). They are not hardcoded from the design's hex values.
- **The moved component keeps importing those constants from `view-3d/terrain`, unchanged.** The import path looks incidental and is not: it is the sole reason a re-export exists in WM-48's branch, so it must not be tidied while moving the file.
- **The color helper emits `rgb(...)` rather than a three-argument `rgba(...)`**, and its unreachable four-element branch is removed. All call sites pass three-element arrays, and the branch multiplied a fourth element by 255, which would be an invalid CSS alpha. This is what makes the swatch colors assertable in Jest at all. *(Built as `colorArrayToRGB`, renamed to match what it emits.)*
- Low and High labels are Roboto Condensed 14px `#434343`, centered under the first and last swatches respectively.
- **The bottom bar's now-dead scale code is removed**, not left behind: the `showBurnIndex` conditional, the `.fireIntensityScale { width: 140px }` rule, the `css.fisHidden` class and the `&.fisHidden` rule. Deleting the last of these is a pure removal: measured live, that rule was already inert. *(Implementation review added a fifth: the bar's `.label` rule, whose only consumer was the scale's title.)*
- The bottom bar after the change is six widget groups with visible gaps `8, -1, -1, 8, -1` and a `.mainContainer` of 485px. These are measured values, not predictions: they are what `?showBurnIndex=false` rendered before the change.
- `cypress/e2e/bottom-bar-visuals.cy.ts` loses the 142px width assertion and the scale's place in the seven-widget adjacency chain, leaving the six-widget chain above.
- **Three pieces of prose that describe the deleted code are updated with it**, each in a different file from the change, which is the case that gets missed: (a) the `bottom-bar.scss` comment naming `.fireIntensityScale` as an example of the hardcoded-content-width workaround; (b) the `bottom-bar-visuals.cy.ts` header describing FIS-hidden centering, a mode that no longer exists; (c) `CLAUDE.md`'s `showBurnIndex=false` row, which said only "Hide burn-index UI".
- **The Cypress update changes the widget list only, never the gap values.** Four stories rewrite this one chain in sequence and the gap values belong to whichever of them owns "the bar matches the board". Re-deriving `8` and `-1` here would pre-empt two questions open on WM-47.
- **`cypress/e2e/url-params.cy.ts` gains a position assertion.** Its existing `showBurnIndex` cases asserted only visibility and non-existence of the component's own class, so they passed identically wherever the scale was rendered. *(Built by strengthening the existing "omitted" case rather than adding a third test, so the case the finding named is the one that became falsifiable.)*
- **Where each value is verified is stated, because most cannot be verified in Jest.** SCSS modules resolve through `identity-obj-proxy`, so no stylesheet is applied in jsdom: every width, offset, radius and border is a Cypress assertion. The exceptions are the swatch colors, once the helper emits `rgb()`, and the title's two-line content, once the break is authored.
- **The two Jest assertions reach their elements by `data-testid`, not by class.** `testing-library/no-container` and `no-node-access` are errors in this repo's ESLint config, so `container.querySelector` is unavailable; the title and each swatch carry a testid. The Cypress geometry reuses the swatch testid.
- **The Cypress geometry lands in a new `cypress/e2e/key-area-visuals.cy.ts`**, modeled on `bottom-bar-visuals.cy.ts`, because no spec covered the key area. It pins the three containers' width, left edge, heights and gaps, their fill, radius and absent border, the bar and swatch geometry and end radii, the label centering, and the title's box, inset and typography; a second `describe` covers `?showBurnIndex=false` leaving Time and Wind Meter at 104px. The bar's `.mainContainer` width is asserted in `bottom-bar-visuals.cy.ts`.

## Technical Notes

**Source of every number.** The Zeplin board *Updated Wildfire Controls and Labels* (`.../screen/6a8566a1c90489f7be36e66a`), group "Time and Wind Meter Display" at (1350, 642), whose full redline title is "Time, Wind Meter, and Fire Intensity Scale Displays". The same geometry appears again in the full-app mock at (88, 132).

| Element | Absolute | Size | Style |
|---|---|---|---|
| Time | (1360, 700) | 104 x 47 | `#ffffff`, radius 4, **no border** |
| Wind Meter | (1360, 757) | 104 x 126 | `#ffffff`, radius 4, **no border** |
| Fire Intensity Scale | (1360, 893) | 104 x 82 | `#ffffff`, radius 4, **no border** |

Gaps are 10px between each, matching the current Time-to-Wind offset exactly: `$topBarHeight + 10` and `$topBarHeight + 67` are 57px apart, and 47 + 10 = 57. So the scale lands at `$topBarHeight + 203`, which resolves to y = 225 with `$topBarHeight: 22px`.

**Fire Intensity Scale internals**, relative to the 104 x 82 container:

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

**The 104 is set by the title, not chosen.** The two-line title box is 84px at a 10px inset, so 10 + 84 + 10 = 104 exactly, and the 84 is the natural width of "Fire Intensity" at Lato Bold 14px, measured live at **83.58px**. That matters downstream: the same 104 is inherited by the Time and Wind Meter boxes, is the container WM-35's label sits inside, and is the left-edge footprint WM-49's zone labels must clear. If the key area ever needs to be narrower, the title is the only place it can give. Michael confirmed the width directly on 2026-08-26: *"104 is right."*

**The title's natural wrap is knife-edge and fails on the fallback font.** At Lato Bold 14px "Fire Intensity" is 83.58px, fitting an 84px box with **0.42px** to spare; an 83px box already produces three lines. With Lato absent and the stack falling back to `sans-serif`, the same string measures **87.14px** and takes **three lines**, which is 51px of title in a container that budgets 34, pushing the bar and both labels 17px past the 82px box. The authored break is what keeps a font-loading failure from breaking the layout, not a style preference. The repo already had this pattern at `wind-circular-control.scss`.

**The colors are unchanged and the derivation must survive the move.** `BURN_INDEX_LOW = [1, 0.7, 0]`, `MEDIUM = [1, 0.5, 0]`, `HIGH = [1, 0, 0]` convert to exactly `#ffb300`, `#ff8000`, `#ff0000`, which are precisely the three hexes on the board. Copying the hexes into SCSS would silently decouple the legend from the terrain shading it explains: `showBurnIndex` also drives `terrain.tsx`, where a false value replaces the three-tier coloring with a single `BURNING_COLOR`.

**Testability trap: the colors could not be asserted in jsdom as the helper stood.** The helper emitted `rgba(r,g,b)` with **three** arguments. Browsers accept that as opaque `rgb()` under CSS Color 4, so there was no production bug, but jsdom's parser rejects it and silently drops the declaration: `style.backgroundColor = "rgba(255,179,0)"` yields `""`, while `"rgb(255,179,0)"` yields `"rgb(255, 179, 0)"`. A Jest test written against the empty result would have passed forever regardless of the colors. Confirmed during implementation by reverting the fix: both color assertions fail with the three-argument form.

**The `fisHidden` rule was already inert.** Under `?showBurnIndex=false`, where the class was applied, `.mainContainer`'s computed margins were both `0px` and removing the class left its rect byte-identical. `.leftContainer` and `.rightContainer` are `flex: 1 1 0%` and consume all free space, so the `margin: 0 auto` never had anything to distribute. Deleting it was a pure removal with no behavior change. (The cluster sits 10px right of true viewport center in both modes, because `.leftContainer` shrink-wraps wider than `.rightContainer`; pre-existing and unrelated.)

**Two specs measured the bar independently and agree to the pixel.** WM-47's pass read the pre-change bar as widths `84 / 62 / 122 / 62 / 67 / 67 / 142` with gaps `8, -1, -1, 8, -1, 8` and a widget span of **627px**. Removing the scale's 142 and the trailing 8 leaves exactly the six widgets and `8, -1, -1, 8, -1`, and the `.mainContainer` figures reconcile through a constant 8px trailing margin: 627 + 8 = 635 with the scale, 477 + 8 = 485 without. `.mainContainer` is viewport-independent because it shrink-wraps its widgets, measured at 485 on both a 950px and a 1400px viewport.

**The 151px this story frees is a gross figure.** WM-47 measured the finished row at **667px against today's 627**, because Vegetation Key (92) and Speed (99) more than consume what the scale's 142 + 9 releases. This retires the "may well be a net gain" guess in `sprint-24-mechanisms.md`.

**WM-48 makes this component's import path load-bearing.** `fire-intensity-scale.tsx` is the **only** importer of the burn-index colors from `view-3d/terrain`. WM-48's prototype pulls the palette into `terrain-colors.ts` and keeps a re-export in `terrain.tsx` specifically to keep that one import working. Once WM-48 has landed, the tidier end state is for this component to import from `terrain-colors.ts` directly and let the re-export go; doing it early would break against a file not yet on master.

**Geometry deltas.** The bar shrank from 88 x 15 content (90 x 17 border box) to 81 x 10 (83 x 12). Its swatches moved from `33.33%` each to a fixed 27px, an exact third of the 81px inner width. The labels row was 80px wide with `justify-content: space-between`; the board centers the two labels under the end swatches instead, which is close to but not the same as space-between.

**The title was not part of the component** and had to be carried across: `<FireIntensityScale/>` rendered only the bar and the Low/High labels, with the string living in `bottom-bar.tsx`. As built, the component absorbs it, which is what puts the two-line content within reach of a Jest assertion.

**Grep trap, still live.** `.windContainer` exists in two stylesheets. `wind-circular-control.scss` is the wind control inside the Terrain Setup panel, a different component. The on-map Wind Meter is `simulation-info.scss`.

**The board's other two notes on this group were already satisfied** and are not new work. *"Note that outlines have been removed from these two displays"* matched the code, which gives neither box a border. *"Also note color change compared to the Wind Meter in the Setup Panel"* was already implemented: `wind-dial.scss` makes the dial outline and arrow `#2997ff` only in the interactive case, and the read-only map meter keeps the gray baked into the SVGs.

**Nothing else is fixed on the left edge.** The only `position: fixed` elements in `app.scss` are `.mainContent`, `.rightContent`, the debug `.topLine` rules, and `.timeDisplay`. The scale's band, y 225 to 307, is clear. `.mainContent` is `position: fixed` with `overflow: hidden` but no transform, which is why the Wind Meter's own `position: fixed` escapes the clip; rendering the scale from `app.tsx` keeps it outside that arrangement entirely.

**The ticket's spec image and WM-35's are one drawing at two export sizes.** Neither ticket has an attachment record, so both are inline ADF `media` nodes with no id a CLI can fetch, and the Jira web UI is the only route. Opened 2026-08-25: `image-20260821-190853.png` (468 x 1118) renders the stack at 3.80x and `image-20260821-064626.png` (310 x 706) at 2.32x, both carrying no state, note or annotation the board lacks. They confirm the container geometry, the authored title break, and, in the one place the board was ambiguous, that Low and High center under the end swatches rather than sitting at `space-between`. **They are not a color source**: their swatches sample washed toward gray, so the board and `BURN_INDEX_*` remain the authority there.

## Out of Scope

- **WM-35's Wind Meter label wrap.** The board draws `.windText` at its existing 68px width, on two lines, for the shortest possible string, so widening the container does not by itself fix the three-line wrap. WM-35 remains real work at its own fixed 81px label width, independent of this story's container in both directions.
- **The Vegetation Key toggle** that takes the freed bottom-bar space. That belongs to WM-48.
- **WM-47's Clear All rename and its spacing tightening**, and **WM-40's speed control**. Both land in the same row. WM-47's stated justification for tightening is what this story deletes, so its spacing bullet should be re-read after this lands rather than built against the old bar.
- **Re-laying out the bottom bar as a whole.** This story removes one widget group and lets the existing flex-sibling centering take over. The single layout pass across WM-47, WM-40 and WM-48 is separate work.
- **Extracting a `KeyArea` component that owns all three boxes.** Deferred rather than rejected: it is the right end state, but it would move `.windContainer` out of `simulation-info.scss`, which WM-35 edits in the same sprint, and the shared `$keyAreaWidth` closes the duplication this story would otherwise introduce. Revisit once WM-35 has landed.
- **The bar cluster's pre-existing 10px offset from true viewport center.** Identical before and after.
- **Accessibility review**, per the standing scope for this repo.

## Decisions

### Do the Time and Wind Meter containers widen to 104px unconditionally, or only when the scale is authored?
**Context**: The one question `sprint-24-mechanisms.md` left open, and the ticket puts "only appears when authored" and "widens the Time and Wind Meter displays" next to each other without connecting them. Against unconditional widening: the 104 is set by the scale's own title, so with the scale absent there is no content reason for the other two to be 104.
**Options considered**:
- A) Widen unconditionally. One width, one set of constants; the no-scale case simply omits the third box.
- B) Widen only when the scale is shown, keeping 97px as the no-scale width.
- C) Ask Michael.

**Decision**: **A**, settled by the board so C was unnecessary. Both instances of the stack draw all three boxes at 104 with no 97px variant anywhere on the screen, the board's own note scopes the conditionality to the scale alone, and the ticket states the two facts as separate bullets, one conditional and one flat. B would also introduce a conditional width where the app has never had one and put the key-area width in a branch, which is the opposite of the single-definition requirement. 7px of unused width on two read-only boxes costs a student nothing; two layouts cost every reader of the stylesheet something.

---

### Does this story absorb WM-35's wrap fix?
**Context**: WM-35 was written assuming a companion story's widening might fix its wrap. Both stories are the same developer's and scheduled the same day.
**Options considered**:
- A) Keep them separate.
- B) Fold the `.windText` fix into WM-52, since the same files are open.

**Decision**: **A**, and the dependency is retired in both directions rather than re-pointed. WM-35 resolved its width question to a fixed **81px** on `.windText` and explicitly rejected letting the label fill the container, on the stated grounds that it would create exactly the cross-story coupling this story avoided. 81px is sized against `"from the WNW"` at 80.03px and only has to *fit inside* the container, which it does at 97 and 104 alike, so no version of WM-35 depends on this story's width. What survives is a build-order convenience: going first lets WM-35 write its width comment against the final container once instead of writing 97px and amending it.

---

### Where should the scale be rendered: `app.tsx` beside Time, or `SimulationInfo` beside the Wind Meter?
**Context**: The key area was already split across two components for no visible reason, and a third fixed box makes the split worse whichever side it lands on.
**Options considered**:
- A) Add it to `SimulationInfo`, next to the Wind Meter it sits beneath.
- B) Add it to `app.tsx`, next to Time.
- C) Extract a `KeyArea` component owning all three boxes and the shared width.

**Decision**: **B now, C later.** C is the right end state and would dissolve both Senior Engineer findings rather than patching them, but it moves `.windContainer` out of `simulation-info.scss`, which WM-35 edits in the same sprint, so the branches would collide over a refactor neither ticket asked for. With `$keyAreaWidth` extracted, the duplication C exists to fix does not get worse. B beats A on three counts: `config` is already in scope in `app.tsx`; the scale lands outside `.mainContent`, where Time already is, rather than inside a flex row of zone cards; and `SimulationInfo`'s job is zone cards, which a legend has nothing to do with.

---

### Should the color helper emit `rgb()` for three-element colors?
**Context**: It emitted a three-argument `rgba()`, which browsers accept and jsdom rejects, making the swatch colors untestable in Jest at the moment they most want a test.
**Options considered**:
- A) Fix the helper and pin the colors in a Jest test.
- B) Leave it and pin the colors in Cypress alongside the geometry.
- C) Leave it and pin nothing; the derivation is visible in the source.

**Decision**: **A**, and it is a deletion rather than an addition, which removes the "unrelated scope" objection. The helper is module-private with three call sites, all in the file this story rewrites, all passing three-element arrays, and its four-element branch is unreachable *and* wrong (it multiplies an alpha by 255, emitting invalid CSS). C is ruled out by the requirement that the colors keep deriving from `BURN_INDEX_*`: an invariant with no test is one refactor away from being a hardcoded hex. B is weaker rather than wrong, but leaves the one cheap mutation-visible assertion locked behind a browser run.

---

### Is the two-line title a hard break or a width-driven wrap?
**Context**: The board's text layer content is literally `"Fire Intensity\nScale"`. Natural wrapping keeps the string a single translatable unit and matches how the bottom bar rendered it.
**Options considered**:
- A) Let it wrap naturally in the 84px box.
- B) Author the break explicitly.

**Decision**: **B**, on measurement. Natural wrapping does produce the right two lines in Chrome with Lato loaded, so A looks correct at first, but the margin is **0.42px** and an 83px box already yields three lines. Decisively, with Lato unavailable the string measures 87.14px and takes three lines, pushing the bar and labels 17px past the container on a font-loading failure rather than a code change. The feared "Fire / Intensity Scale" break is not the risk: "Intensity Scale" is 92px, so the fallback is "Fire / Intensity / Scale".

---

### The 104px width would be written in three places unless something is extracted first
**Context**: 97px was duplicated across `app.scss` and `simulation-info.scss` with no shared variable, and this story adds a third container. Changing it becomes a three-file edit that silently half-applies, with no test that would catch a mismatch.

**Decision**: Accepted, and made a requirement. `common.scss` already carries `$topBarHeight`, `$bottomBarHeight` and `$bottomBarWidgetGroupSpacing`, the last with a comment explaining its derivation, which is the pattern `$keyAreaWidth` follows. This is also what lets the `KeyArea` extraction be deferred without the duplication getting worse.

---

### The vertical offsets are magic numbers derived from each other
**Context**: `.timeDisplay` used `$topBarHeight + 10px` and `.windContainer` used `67px + $topBarHeight`, where 67 is silently 10 + 47 + 10; the scale would add 203, silently 67 + 126 + 10. Each new box required re-deriving a sum by hand from two other files.

**Decision**: Accepted; the offsets became sums of named heights and one named gap. The arithmetic was checked against the live DOM first (Time y=32, Wind y=89, mocked scale y=225, both gaps exactly 10), so the named-sum version could be verified against known-correct numbers rather than re-derived.

---

### Deleting `fisHidden` changes behavior for the no-scale case, and that should be verified rather than assumed
**Context**: The plan assumed removing the scale makes the `fisHidden` centering unconditional. That holds only if `.mainContainer`'s default layout is not relied on elsewhere, and the `flex: 1` siblings suggested the margin might be a workaround for the scale's asymmetric width.

**Decision**: Verified, and the answer was better than the plan assumed: the rule was **already inert**, so deleting it is a pure removal with no behavior change at all. The two centering mechanisms were never in competition; only the flex siblings ever did anything.

---

### The requirements are almost entirely geometry, and none of it is testable in Jest
**Context**: Fourteen measured values, and `jest.config`'s `moduleNameMapper` sends stylesheets to `identity-obj-proxy`, so no CSS is ever applied in jsdom.

**Decision**: Accepted; the requirements now state where each value is verified. The split is smaller than the finding assumed because two values move into Jest's reach, both created by decisions above: the swatch colors once the helper emits `rgb()`, and the title's two-line content once the break is authored. Both are mutation-visible in Jest, which the geometry never can be.

---

### The two Cypress specs need opposite treatment and the spec named only one
**Context**: `bottom-bar-visuals.cy.ts` must lose its scale assertions, but `url-params.cy.ts` must keep its two `showBurnIndex` cases *and* gain a position assertion, because both assert only existence and visibility of the component's own root class, which survives the move untouched. They would pass identically with the scale left in the bar.

**Decision**: Accepted verbatim and added as a requirement. The position assertion is what makes the pair able to fail. *(Implementation review then folded the assertion into the existing "omitted" case rather than adding a third test, so the case the finding named is the one that became falsifiable.)*

---

### No criterion covered what the bottom bar looks like after the scale leaves
**Context**: The adjacency test asserts an exact sequence of gaps across seven widgets; after the change it is six, and whoever updated it would be inventing the expected result.

**Decision**: Accepted, and the expected result did not have to be invented, because the app already rendered it: `?showBurnIndex=false` produces exactly the post-move bar. So the update is a deletion of the seventh id and the trailing `8`, checked against a rendering rather than a prediction, with the numbers in the requirements.

---

### This story is a dependency for three others and the spec said so only in Out of Scope
**Context**: WM-35, WM-47 and WM-48 are all written against a bar and a key area this story changes, which is a scheduling fact worth stating up front.

**Decision**: Accepted and moved to the Overview, with one correction to the word "dependency". None of the three is blocked in the strict sense: WM-35's own width fits inside both the old and new container, so its build order is convenience; WM-47's coupling is that this story deletes its stated justification, not its ability to proceed; and WM-48 can take the freed space afterwards. What is true is that all three are written against what this story changes, so it should land first.

---

### The spec image on the ticket was never opened
**Context**: Every value came from the Zeplin board instead. If the image carried anything the board did not (a state, a note, an annotation), it was unrecorded. It turned out not to be reachable as an attachment at all: the ticket has no attachment records, so the image is an inline ADF `media` node with no id for a CLI to fetch.

**Decision**: Closed by opening it in the Jira web UI, 2026-08-25, and it changed nothing. It is a flat render of the same three-box stack with no state, note or annotation, and every value agrees with the board, including the authored title break and the label centering. WM-35's copy is the identical drawing at a different export size, which closed its equivalent question in the same session. One limit recorded: it is a screenshot, not a color source.

---

### The legend moves away from the thing it explains
**Context**: The scale explains the colors on the burning terrain. The key area sits beside the map, which is the argument for the move, but a student watching a fire is looking at the terrain.

**Decision**: An assembled mock was built on the running app and measured: the scale moves from x 651-793, at the far right end of the control row, to x 10-114 in the vertical band of the terrain itself. The three white boxes read as one column rather than three unrelated overlays. The premise that the key area is "above" the map is not what the screen shows: the stack runs down the left edge alongside the terrain. Nothing to reopen.

---

### Two 14px lines of title above a 12px bar makes the title the dominant element
**Context**: The title occupies 34 of 82 vertical pixels and the color key 12, and the bar shrinks from 15px tall to 10px. For a legend whose job is matching a map color to a word, the key is now the smallest part of the box.

**Decision**: Build the board as drawn, and put the question to Michael as an FYI rather than a gate. The causality runs opposite to the finding's suspicion: the box was sized around the title, not the title squeezed into the box. 104 is exactly 10 + 84 + 10 and the vertical rhythm sums to 82 with no slack, which makes an accidental shrink unlikely. The sharper question, which the 84px title now carries downstream into WM-35 and WM-49, was put to Michael and **answered on 2026-08-26: "104 is right."**

---

### An activity authored with `showBurnIndex: false` has an empty gap or a shifting layout, and neither was specified
**Context**: The flag turns off both the legend and the three-tier terrain coloring, so an activity with it false has a key area of two boxes instead of three.

**Decision**: Answered by the conditional-width decision: there is **one** key-area layout. All three containers are 104px whatever the flag is, and a false value simply omits the third box, leaving the space below the Wind Meter empty. Authors see one geometry, not two. The documentation half was acted on: the `CLAUDE.md` row for the URL param now says the legend is omitted and the other two displays are unchanged.
