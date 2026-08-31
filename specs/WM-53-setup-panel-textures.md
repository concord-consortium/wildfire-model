# Hazbot: Add textures to Setup panels (when Vegetation Key is on)

**Jira**: https://concord-consortium.atlassian.net/browse/WM-53, with **WM-57** folded in

**Status**: **Closed**

## Overview

When the Vegetation Key is on, the zone terrain thumbnails in the Setup wizard carry the same per-vegetation texture the 3D model does, so a student choosing Grass or Forest sees the difference in the picture they are choosing rather than only in a corner badge. When the key is off, the thumbnails look exactly as they do today.

WM-48 gave the 3D model a surface texture per vegetation type behind a new Vegetation Key switch. This story carries that treatment back into the Setup wizard, where students actually pick the vegetation. It is not a reuse of WM-48's code: the Setup panel and the 3D model share no rendering path, which is what took the estimate from 2 points to 3.

**WM-57 is folded in here**, on Doug's call of 2026-08-28. It replaces all 20 thumbnail files with the board's 2x art and renames 5 of them from `foothills` to `hills`. It also deletes the three drought `filter` chains, which is the single finding this story's DOM shape was built on, so shipping the two separately would have put a rationale under review that was already being deleted and landed guard tests that WM-57 then made unfalsifiable.

## Requirements

- When the Vegetation Key is **on**, each zone's terrain thumbnail in the Setup wizard shows the vegetation texture for that zone's vegetation type, covering the same rect as the terrain image (120x100 at 2 zones, 80x100 at 3 zones).
- When the Vegetation Key is **off**, the thumbnails render exactly as they do today, with no texture layer in the DOM and no change to existing measurements.
- The texture appears on **both** wizard screens that draw zones: the interactive **Adjust Conditions** screen and the read-only **Adjust Wind** recap.
- The texture follows the zone's **vegetation type**, using the same four types and the same enum order as the model.
- The texture's ink color follows the zone's **drought level**, using the palette WM-48 establishes.
- **The ink is painted, not filtered.** The four tiles carry the glyphs as strokes over a transparent field, and the texture layer is `mask-image: url(<tile>)` with `background-color: <ink>`. That requires the tiles' `#808080` background rect to become `fill="none"` and `rasterizeSvg` to fill its canvas with `#808080` before drawing, which leaves the 3D texture byte-identical.
- Changing a zone's vegetation or drought while the wizard is open updates that zone's texture immediately.
- The texture must not disturb the existing zone-thumbnail states: the 4px white selection frame, the 50% / 75% / 100% terrain opacity for default / hover / selected, and the full-strength `.fixed` recap.
- **The texture carries the same state opacity as the terrain image**, built by wrapping the texture and `.terrainImage` in one container that carries the opacity.
- **The tile is drawn at a fixed `mask-size: 112.5px 112.5px` with `mask-repeat: repeat`, identical on 2-zone and 3-zone layouts.** The `mask-*` pair rather than `background-*`, because the layer has no background image and a `background-size` on it is inert.
- Reading the key's state must not couple the Setup panel to the 3D terrain: it reads the same `UIModel` flag WM-48's switch writes.
- **Toggling the Vegetation Key while the Setup wizard is open** adds or removes the texture on the open screen immediately, on both screens.
- The texture layer **fills the thumbnail rectangle**; it is not masked to a terrain silhouette.
- The texture layer is `position: absolute; inset: 0`, a **sibling of `.terrainImage`** ordered **after** it, so it paints above the river inside it. `.vegetationPreview` sits after the texture and **stays inside the opacity wrapper**. Both ordering rules are asserted in Jest.
- The tile filename per vegetation type comes from **one map shared with WM-48** (`VEGETATION_TILE_FILES` in `terrain-textures.ts`).
- **All 20 thumbnail files are the board's 2x art**, 240x200 at 2 zones and 160x200 at 3, dropped into the same `background-size: cover` boxes with no layout change.
- **The drought treatment is a multiply, not a filter.** The 15 terrain images are a neutral gray relief; `.terrainImage` carries `background-blend-mode: multiply` with the zone's drought color as an inline `background-color`, taken from `getTerrainColor` so a thumbnail and the model it previews read the same palette.
- **The river is not drought-tinted.** It is outside the drought group on the board, and a blend mode reaches only the element's own background layers, so `.riverOverlay` keeps its own ink. This is a behavior change: under the filter it was tinted.
- **The 5 thumbnails spelled `foothills` are renamed to `hills`**, matching the board and the UI's own display label. The path comes from an explicit `Record<TerrainType, string>` rather than the enum name, because `data-loaders.ts` still derives `data/foothills-*` from that enum. **The 14 files under `src/public/data/` are not renamed.**

## Technical Notes

**The Setup panel and the 3D model share no rendering code.** The model rasterizes its tiles to 512, packs them into a `DataTexture`'s four channels and samples them in a fragment shader. The Setup panel draws a CSS `background-image` on a `<div>`. There was no flag to flip.

**The thumbnails are a gray relief multiplied by a drought color.** The board states it in a layer name (`2-zone-plains-left-multiply`) with a solid drought-color shape at `blendMode: multiply` directly above it, and the four colors are its *Assigned Color / Terrain* column: `#02D40A`, `#92D637`, `#C1E245`, `#C8A145`. Those are `getTerrainColor`'s four values to the byte, so the panel and the shader share a palette rather than mirroring one. Verified in pixels rather than inferred: the browser's composite matches `relief x color` at a mean absolute error of **0.23 per channel** on the 3-zone hills-left thumbnail, and the three wrong colors score 19.6 to 77.2 on the same crop, so the fit identifies the drought level as well as the mechanism.

**Three things that are easy to get wrong about those assets.** The board's *Visual Display of Color* column is hand-authored and is not the composite, so it is a useful cross-check and a wrong source for any number. Zeplin's declared layer rect is not the exported file size: all 20 layers declare the full canvas, the 15 opaque terrain images export at it, and the 5 rivers originally exported trimmed to the ink's bounding box (Michael re-exported them on 2026-08-28; check both before assuming an export is canvas-sized). And "2x art" is Zeplin's @1x here, because the layer is authored at 240x200 for a 120x100 box.

**A blend mode reaches only the element's own background layers.** Unlike `filter`, `background-blend-mode` does not touch descendants, which is what leaves `.riverOverlay` untinted for free. It is also the trap in the change: the old sibling-not-child rule existed solely to dodge `filter`'s subtree recoloring, so once the filter is gone that rule stops being load-bearing and any test asserting it stops being able to fail. What survives is paint order, because the river lives inside `.terrainImage` and the glyphs are drawn crossing it.

**The terrain PNGs have no sky and no alpha.** All 15 are PNG color type 2, truecolor: top-down shaded relief, edge to edge. So there is no sky to protect from a rectangular fill and no alpha to derive a mask from.

**The ink's contrast target is a model number, not a thumbnail number.** `terrainGlyphContrast` is `[6, 6, 6, 7]` and the five hexes hit exactly that *against the model's flat drought colors*. Against the thumbnail's shaded relief they land near 4, which the designer drew knowingly. Do not "correct" this against the wrong reference.

**The shared icon arrays are a trap.** `vegetationIcons` and `droughtIcons` in `vertical-selectors.tsx` serve five components, one of which is the map's zone labels (WM-49's surface). If textured icons are ever wanted, add a second export rather than mutating these. `vegetation-selector.tsx` also makes enum order load-bearing via `.slice(1)`, `.slice(1, 3)` and `.slice(0, 3)`.

**Zeplin**: *Updated Wildfire Setup Panel and Terrain Textures*, `https://app.zeplin.io/project/5fe47ae231d1f6a428c53450/screen/6a8599f5f464e141fcb7b53b`. Four "with Vegetation Key ON" artboards paired against the four OFF ones. The board carries its requirements as blue text rather than annotation pins, so `list_annotations` is the right first call.

### Three constraints the build turned up, which are not obvious from reading the code

- **The GLSL program is a TypeScript template literal.** A backticked identifier inside a comment in `terrain-shader.ts` terminates the string and the file fails to parse. Write those comments without backticks.
- **`TerrainPanel` clones `simulation.zones` into local state at mount** and the wizard edits the clone, so a test that mutates the store never reaches the rendered cards. Drive the sliders instead. A Mountains zone's vegetation slider does not offer Grass, so a test needing Grass has to use a Plains zone.
- **Cypress cannot activate `:hover`** for a `getComputedStyle` read, because `cy.trigger` dispatches an event without moving the pointer. `bottom-bar-visuals.cy.ts` already records the same limitation. Setting a MUI slider's input value and firing `change` likewise does not move the slider; click the mark label, as `TerrainSetup.js` does.

## Out of Scope

- **The Vegetation Key switch itself**, and **the 3D model's textures**. Both are WM-48.
- **The map's zone labels.** WM-49 owns `simulation-info.tsx`.
- **Texturing the slider marks, the recap icon rows, or the 26x26 badge.** The board textures the zone terrain pictures only.
- **The 14 files under `src/public/data/`.** Not renamed, and deliberately so: see Not Yet Implemented.
- Accessibility review. Out of scope in this repo.

## Not Yet Implemented

- **The 14 files under `src/public/data/` are deliberately never renamed.** `getUrlConfig()` reads every key of `getDefaultConfig()` off the query string, and `elevation`, `unburntIslands` and `zoneIndex` are all keys, so a published activity URL can pin `data/foothills-*`. Breaking one does not degrade: `image-utils.ts:100` throws from the image's `error` listener where it cannot reject the enclosing promise, so `dataReady` never flips and the activity sits with no terrain and Start disabled. This is why the thumbnail path needs its own name map rather than the enum.
- **The hover state's 75% opacity has no automated coverage.** It is one of the four opacity declarations moved from `.terrainImage` to the wrapper; the other three are covered in Cypress. Cypress cannot activate `:hover` for a computed-style read, so this one is a manual check in the Playwright pass. Do not read the automated suite as covering it.

## Decisions

### Does the texture layer follow the terrain image's state opacity?
**Context**: The texture must be a sibling of `.terrainImage`, not a child, so it does not inherit the 50 / 75 / 100 default / hover / selected treatment.
**Options considered**:
- A) The texture carries the same opacity at every state, so the two read as one picture.
- B) The texture is always opacity 1, so vegetation stays legible on unselected zones.
- C) Wrap both in one container that carries the state opacity, with the drought filter left on the terrain image alone.

**Decision**: **A**, built as C describes. Confirmed by Michael 2026-08-27 ("Texture Opacity: fade with zone"), and the board agrees in its layer data: on the 3-zone ON artboard the default zone's texture instance carries `opacity: 0.5` against `1` on the selected zone's. C is not a third answer, it is how A gets built; probed live, a wrapper at 0.5 holding the filtered image plus the texture paints the ink as an exact 50% composite, so the hue survives and only the strength changes.

---

### How does a grayscale tile become drought-colored ink?
**Context**: The requirement says the ink follows the drought level, but the four tiles contain exactly two values (`#2A2A2A` strokes, `#808080` field), fully opaque, so a tile used as a plain background paints identically in every zone and hides what is behind it.
**Options considered**:
- A) `mask-image` + `mask-mode: luminance` + `background-color`.
- B) The tile as a background image, recolored by a CSS `filter` chain.
- C) Sixteen pre-colored SVG copies, one per vegetation per drought level.
- D) Fetch the tile, string-replace its two hexes, use the result as a data URI.
- E) Re-author the tile's field to `fill="none"`, then `mask-image` (alpha) + `background-color`.
- F) An inline SVG `feColorMatrix` mapping luminance to alpha and RGB to the ink.

**Decision**: **E**. Each option was built as a real layer and sampled: A and B are broken (A lays a ~50% ink wash over the whole thumbnail and leaves glyphs *lighter* than the field, because the tile's two values are 0.50 and 0.165 luminance, not 1.0 and 0.0); D, E and F are all byte-exact. E is the only one where the asset, the shader and the panel agree with no translation layer, and it costs four CSS properties with no fetch and no filter defs. The risk that changing a tile changes what the shader renders is measured at zero: **0 differing texels of 262,144** in every channel, all four tiles.

---

### Is the texture ordered before or after `.terrainImage`?
**Context**: The draft required the texture ordered *before* `.terrainImage`, reasoning that ordering it after would paint over the river.
**Options considered**:
- A) Keep the DOM order and add an explicit `z-index` to the texture.
- B) Order the texture after `.terrainImage`, accepting that it paints over the river.
- C) Give `.terrainPreview` an explicit stacking context and order both children by `z-index`.

**Decision**: **B**, and the river concern that ruled it out was wrong about the design. The board's stacking order is `Zone N Highlight`, terrain group, `Zone N Texture`, `Vegetation Type`, `Zone N Label`, and the river is a child of the terrain group, one level below the texture: the glyphs are *supposed* to cross the river. That makes A and C unnecessary, since two `z-index: auto` positioned layers paint in tree order. The reasoning under this changed when the filter went: while `.terrainImage` carried one, it formed a stacking context that hid a *preceding* sibling outright, which is what the original measurement caught. Without it, the ordering matters only against `.riverOverlay` nested inside, which is the reason the rule now gives.

---

### Who owns the 2x terrain re-export and the `foothills` to `hills` rename?
**Context**: The board carries all 20 terrain PNGs at 2x and names every asset `hills` where the repo says `foothills`. Neither is mentioned in WM-53's description, and neither is needed for the texture overlay.
**Options considered**:
- A) Both out of scope for WM-53; raise them as their own ticket (WM-57).
- B) Both in scope here, since this story is already in `zone-selector`.
- C) Take the 2x re-export and leave the rename to its own ticket.

**Decision**: **B**, arrived at through A, and the reversal is worth reading because the reason changed rather than the preference. A was right on 2026-08-28 morning, when the swap looked like commissioning 20 recolored assets and waiting: the exported art is a gray relief and no standard blend turned it into the artboards' thumbnails (rms 26 to 48 against a real match's ~5). Michael's correction that afternoon voided that measurement, which had been taken against assets he had already replaced, and named the recipe as a multiply. What was left was 20 binaries, one deleted filter block and one color map. The rename travels with it because it is the same 5 files, and the 14 `src/public/data/` files stay put on the public-URL finding below, which is what pushed the rename out in the first place and still holds.

---

### How is the texture tiled and scaled inside the thumbnail?
**Context**: The model's tile scale is governed by `terrainTextureTileFt`, machinery that does not exist in CSS. Too small reads as noise; too large shows one or two glyphs.
**Options considered**:
- A) `repeat` with an explicit size measured against the board.
- B) One non-repeating instance scaled to cover the zone.
- C) Ask Michael for the intended glyph count.

**Decision**: **A** at `mask-size: 112.5px 112.5px`, the same on both layouts. Three independent measurements off the board agree (Sketch instance geometry splits a 120px card 113 + 8; horizontal autocorrelation peaks at 113.0px; glyph-density back-calculation gives 113 to 122px), and Michael confirmed 112.5 as the authored value, which is what those were rounding. B is dead on the evidence rather than the argument: glyph density per unit area is the same on both layouts, so the tile is fixed rather than stretched. The board draws roughly 3x coarser than the model, which is a deliberate thumbnail-legibility choice.

---

### Is the texture clipped to the terrain silhouette, or to the rectangle?
**Context**: The board splits each texture group's children into uneven pieces, which looked like masking to the terrain shape.
**Options considered**:
- A) Fill the rectangle.
- B) Mask to the ground with a per-terrain-type mask asset (15 new files).
- C) Use the terrain PNG itself as a `mask-image` and rely on its alpha.

**Decision**: **A**, because the question rested on a false premise. The draft asserted the terrain art has sky above it; all 15 PNGs decode as truecolor with no alpha and zero blue-dominant pixels. That collapses C (there is no alpha to mask from) and makes B commission 15 assets to protect a region that does not exist. The uneven group children are what Sketch does to a tiled fill clipped to its frame. The texture crosses the river, which is what the board draws, and this diverges knowingly from the shader, which zeroes glyph weights over river cells.

---

### Does the wind screen's read-only recap get the texture?
**Context**: The board textures all four ON artboards, so the recap is textured. That raises a second-order question: `.vegetationPreview` is suppressed on that screen, so with the key off the picture carries no vegetation cue at all.
**Options considered**:
- A) Ship as drawn: texture on the recap, badge stays suppressed.
- B) Show the badge on the recap when the key is off, so the picture always carries a cue.

**Decision**: **A**. Doug, 2026-08-28. The badge is absent from the Wind artboard in *both* key states, so its absence is deliberate rather than something the texture happens to cover. B would add a cue the board does not draw to a screen that is read-only by design, which is a product change rather than an implementation choice. The consequence is recorded as known: the key-off recap is the least informative state, and the `terrain-summary.tsx` rows carry vegetation there alone.

---

### The sibling-not-child rule is the whole story and nothing enforces it
**Context**: The natural place for a future developer to put a texture overlay is exactly where `.riverOverlay` sits, and the resulting bug appears only at mild, medium and severe drought, as a hue shift that reads as a design choice.

**Decision**: Accepted while the filter existed, then **retired with it**. `background-blend-mode` does not touch descendants, so nesting the texture inside `.terrainImage` no longer changes anything and a Jest case asserting it cannot fail. The assertion was dropped rather than reworded, and the one that replaced it guards what is still true: the texture comes **after** the image that holds the river. The painted-color half moved the same way, from a Cypress case whose named mutation was the nested parent to two that state what they catch now, one for the ink reaching the screen and one for the river staying out of the multiply.

---

### The tile filename must not be derived by enum-name arithmetic
**Context**: `zone-selector.tsx` builds its terrain path by string concatenation over `TerrainType`, and this story adds a second such path from `Vegetation`. That mapping is not identity: `Vegetation.ForestWithSuppression` lowercases to `forestwithsuppression`, while the file is `forest-with-suppression.svg`.

**Decision**: Build the path from an explicit `Record<Vegetation, string>`, and not a new one: WM-48's loader already declares exactly this map, so export `VEGETATION_TILE_FILES` and import it. A filename that has to agree in two places is the failure this codebase keeps being reviewed for, and the hyphenated case is precisely where two copies would drift. The path is set as an inline `style` in the TSX rather than a `url()` in the SCSS, because css-loader would try to resolve it at build time against `src/components/`, where the tiles do not live.

---

### The only test that could catch the real failure cannot run in jsdom
**Context**: The requirement is a *painted color*, and jsdom applies no stylesheet filters, so a Jest test asserting the texture's color passes whether the layer is nested or not.

**Decision**: Accepted, and the spec now says which assertion is which rather than leaving it implied. The Jest assertions are **proxies**: they pin the two structural facts that cause the bug, and each fails if deleted. The **guarantee** is a painted color and needs a pixel check. One case is enough, because the failure is structural rather than per-drought-level: the same wrong parent breaks all three filtered levels identically. If the pixel case were ever dropped, the story would have no coverage of its central requirement and the Jest tests must not be described as if it does.

---

### No stated expectation for the key toggling while the wizard is open
**Context**: The switch is in the bottom bar and is always available, so a student can toggle it with the Setup panel open, and nothing said what should happen.

**Decision**: Accepted and stated as a requirement, and the "free" half is confirmed rather than assumed: `TerrainPanel` is wrapped in `observer` and `renderZones` is a plain function it calls during its own render, so a read of an `@observable` flag inside that subtree is tracked by `TerrainPanel`'s reaction. The behavior costs nothing and the requirement is a test rather than work.

---

### The dependency on WM-48 is stated but not scheduled
**Context**: WM-53 could not start before WM-48 landed, and a slip in WM-48 would block it entirely rather than merely delay it.

**Decision**: Dissolved rather than answered: WM-48 shipped before WM-53 started, so there was nothing left to sequence and no stub to write. The useful half of the analysis survives: WM-53's real dependency was always the **terrain** half of WM-48 (the tile files and their filename map), not the switch half, which is one trivially stubbable boolean.

---

### How is the painted-color check automated, if at all?
**Context**: The QA decision makes a pixel check the guarantee, and there is no pixel-sampling precedent in this repo: the existing visual specs assert `getComputedStyle`, and no PNG decoder is installed.
**Options considered**:
- A) A Cypress case with no new dependency: screenshot, read the PNG back as a buffer, decode it in the browser through `Image` plus a canvas.
- B) A Cypress case plus a `pngjs` devDependency and a `cy.task` that decodes in Node.
- C) No automated pixel check; verify manually and say so plainly.
- D) Assert the mask alpha by rasterizing the tile, and assert the CSS separately.

**Decision**: **A**. Doug, 2026-08-28, after building it as a throwaway so the cost and the assertion were measured rather than estimated. D is cheaper but tests the asset rather than the composition, so it would not catch the nested-parent bug at all. The tolerance had to be calibrated against the bug: a first pass proposed ±30 per channel, which **passes on the bug**, because the buggy render contains a neutral gray near the ink. At squared distance 300 the correct shape yields 116 pixels and the bug yields 0. The decode harness survived the fold and now serves two cases; only the mutation each one names changed, and the ink count reads 151 against the new art.

---

### The vegetation badge changes appearance when it leaves the drought filter
**Context**: The requirements spec claimed the move "changes nothing" because the badge is a white box with a gray icon. Measured, that is wrong: `hue-rotate` and `saturate` are identity on a gray, but `brightness` is a multiply and the icon is gray, not white.
**Options considered**:
- A) Accept it. The badge becomes drought-independent.
- B) Preserve today's appearance by applying the zone's drought filter to the badge as well.
- C) Accept it but raise it with Michael before merge.

**Decision**: **A**, and call it out in the PR body as an incidental fix. The icon's dominant gray goes from 188 / 216 / 244 / 226 across the four drought levels to a flat 188, which is what an undroughted zone already renders, so the change removes a washout rather than introducing an appearance. At medium drought the icon renders at 244 on a 255 white chip today: drought progressively washes the vegetation icon out of its own badge. B would add a filter no requirement asks for, purely to preserve that. **Overtaken by the fold**: with the filter deleted there is no drought treatment for the badge to be inside or outside of, so A is now what the code does everywhere rather than a consequence of moving one element. The measured outcome is unchanged, a flat 188.

---

### Does the badge stay inside the opacity wrapper?
**Context**: The plan made `.vegetationPreview` a sibling of the wrapper, which takes it out from under the state opacity as well as out from under the drought filter. Only the second half had been analyzed.

**Decision**: Keep the badge inside `.terrainLayers`, ordered after the texture. Measured on a compiled stylesheet in headless Chrome: outside the wrapper its effective alpha on a default zone is 0.60 against today's 0.30, an appearance that exists nowhere in the UI. Inside, it is 0.30 default and 1.0 selected, identical to today, with the box unchanged at 28x28 and the `.mid` / `.right` variants unaffected, because `.terrainLayers` is `inset: 0` with no border or padding. The Jest case asserts the two that can still fail: a descendant of `.terrainLayers`, ordered after the texture.

---

### Does `renderZones` become an options object?
**Context**: It takes five positional parameters and needs two more. `readonly` and `showVegetationKey` would sit adjacent as two bare booleans, which is where argument-order bugs live. There is exactly one call site.
**Options considered**:
- A) An options object.
- B) Two more positional parameters.

**Decision**: **A**. Delegated as an internal-shape call with no product consequence. The contrast targets are threaded through rather than read from `getDefaultConfig()`, because an activity can override `terrainGlyphContrast` and the thumbnails have to move with the model rather than with the default.

---

### Do the steps land as one PR or as a chain?
**Context**: The steps are independently reviewable and only the third is the story. The second changes assets and a loader the 3D terrain uses, so it carries the byte-identical-render evidence.
**Options considered**:
- A) One PR, one commit per step.
- B) Two PRs, splitting the rename out. *(Moot once the rename left the story.)*
- C) Two PRs, splitting the tile edit out, since it is the one change that touches what the 3D model renders.

**Decision**: **A**, one PR, four commits. On the merits alone C is the better shape, and the sprint boundary is what decides against it. The PR body must name the tile re-author commit specifically and quote its re-measured 0-of-262,144 evidence, so the reviewer is pointed at the 25 risky lines rather than left to find them inside a feature diff. That buys most of what C was after.

---

### The Cypress cases select CSS-module class names that do not exist in the built app
**Context**: `webpack.config.js` sets `localIdentName: '[name]--[local]--__wildfire-v1__'`, so a bare `.terrainLayers` matches nothing and Cypress fails the whole spec on a timeout rather than on the assertion. A `[class*="zone"]` substring match is separately wrong, since it also hits `zoneOption`, `zoneLabel`, `zoneLabelBorder` and `terrain-panel--zones`.

**Decision**: Applied. The spec declares its selectors as constants naming the hashed classes in full, the way `cypress/support/elements/TerrainSetup.js` does, with a comment saying why a bare class name would match nothing.

---

### The hover leg of the state-opacity case cannot pass
**Context**: Asserting `opacity: 0.75` after `cy.trigger("mouseover")` relies on a synthetic event activating CSS `:hover`, which follows the real pointer. Verified two ways: dispatching exactly what `cy.trigger` dispatches leaves the wrapper at 0.5 with `matches(":hover")` false, while driving the same page with a real pointer through Playwright gives 0.75. So the retargeted rule is right and only the driver is wrong.

**Decision**: Drop the hover leg and follow the precedent `bottom-bar-visuals.cy.ts` already set. The spec keeps default, selected and `.fixed`, states plainly that hover has no automated coverage, and carries a comment pointing at the sibling spec so nobody re-adds a `trigger("mouseover")`. `cypress-real-events` was the alternative: it buys one transient state at the price of a devDependency and a divergence between two visual specs that should read the same way.

---

### The `mask-size` requirement has no coverage on either layout
**Context**: A fixed tile scale identical on both layouts is a requirement with a named failure mode (someone rescaling for the narrower 3-zone card), and nothing asserted it. Jest computes no styles.

**Decision**: Applied. Chrome reports `mask-size` through `getComputedStyle` as `"112.5px 112.5px"`, so it is one assertion per layout. Running it on both is what makes it catch a rescale rather than restate the stylesheet.

---

### Renaming the 14 files under `src/public/data/` is a change to a public URL surface
**Context**: Raised as a disclosure obligation while the rename was still in scope, and it is the finding that got the rename cut. `getUrlConfig()` reads every key of `getDefaultConfig()` off the query string, and `elevation`, `unburntIslands` and `zoneIndex` are all keys, so `?elevation=data/foothills-foothills-heightmap.png` is a supported way to configure this model. The failure mode was traced and is worse than a silent 404: an uncaught error in an image `error` listener leaves `dataReady` permanently false. A related finding corrected `presets.ts:132` from a preset that does not exist to `defaultTwoZoneFixedTerrain`, showing that a rename miss would break an activity page rather than an unused preset.

**Decision**: Settled by renaming the 5 thumbnails and none of the 14 data files, which is why the thumbnail path needs its own `Record<TerrainType, string>` instead of the enum name both used to share. The thumbnails are not a URL surface: nothing reads them off the query string, and a miss shows a flat drought color rather than hanging the model. So the pre-merge check, the closed-spec disclosure and the Slack message to Trudi all stay withdrawn.

---

### The rename test does not test what its name claims
**Context**: The planned test computed a derived filename list and then only length-checked it, never resolving anything against the filesystem, which is the failure the step existed to prevent. It also could not be written as its title read: only 4 of the 27 three-zone combinations ship data files, because three-zone terrain comes from presets rather than the UI.

**Decision**: Applied, in `zone-selector-art.test.ts`, once the rename came back with the fold. It resolves all 20 paths against `src/public/` with `existsSync`, which is the check the earlier draft only looked like it was doing, and the mutation is measured rather than asserted: putting `foothills` back in the name map turns two of its three cases red. Both constraints the earlier analysis turned up held: `flatMap` is ES2019 against a `lib` of `["dom", "es5", "es2017"]`, and `tsconfig.json` sets `"types": ["jest"]`, which keeps `@types/node` out of the program even though it is installed. `src/hazbot/wildfire/replay-fixture.test.ts` is the in-repo precedent it follows: local `declare const __dirname` / `declare const require` plus `require("fs") as {...}`, touching no shared config.
