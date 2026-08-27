# WM-48: Add texture to represent vegetation in the model

**Jira**: https://concord-consortium.atlassian.net/browse/WM-48
**Repo**: https://github.com/concord-consortium/wildfire-model
**Implementation Spec**: [implementation.md](implementation.md)
**Status**: **In Development**

## Overview

The 3D terrain gains a per-vegetation-type surface texture, so grass, shrub, forest and forest-with-suppression read as different ground rather than as four shades of the same flat color. The textures are off by default behind a new "Vegetation Key" switch in the bottom bar, between Setup and Spark. A working prototype exists on PR #129 and rebases onto master without conflicts.

**This story is the reason three others are moving.** The switch needs bottom-bar space that the Fire Intensity Scale currently occupies, which is what WM-52 removes and what WM-47's spacing rework is partly sized against; WM-40's speed control lands in the same row. The ticket records that in half a sentence, so it is stated here in full.

## Project Owner Overview

Teachers at the ISLAND workshop asked to see the vegetation in the model, not just infer it from a zone label. The model's scale is far too large to draw individual trees or blades of grass, so the approach is an abstract map symbol per vegetation type, repeated across the ground the way a paper map hatches a forest.

Michael has already built this as a working prototype and Trudi signed off on the direction. The remaining work is turning that prototype into shippable code and adding the switch that turns the textures on, which is deliberately off by default so the plain model stays the default view.

## Requirements

- Each of the four vegetation types (grass, shrub, forest, forest with suppression) renders a distinct texture on the terrain.
- Glyph stroke width is authored at **3px** in the tile SVG.
- **Glyph stroke color is derived per fragment from the terrain color and a contrast target, and that derivation is what produces the five colors the ticket specifies.** They are not two designs: evaluated in the shader's linear working space at `terrainGlyphContrast: [6, 6, 6, 7]` and `terrainGlyphContrastBurnt: 6`, the prototype's `wfInk` reproduces `#004001`, `#2D460B`, `#424F12`, `#241B06` and `#B3B3B3` exactly. See Technical Notes.
- **A unit test pins `terrainGlyphContrast`, `terrainGlyphContrastBurnt` and the four `getTerrainColor` values against the five board-authored hexes.** It reimplements `wfInk` in TypeScript, because the shipping copy is GLSL and Jest has no WebGL, so it guards **the inputs, not the formula**: retuning a contrast target or nudging a drought color turns it red, editing the GLSL does not. The requirement is written that way deliberately rather than overstated, and the GLSL carries a comment naming the test as its mirror. The formula itself is covered by looking at the render.
- **The five hexes are material colors, before lighting.** The scene's hemisphere light costs roughly 64% of the luminance, so the rendered stroke over no-drought terrain samples `#002D00`, not `#004001`, and the contrast ratios land at 3.1 to 3.5:1 rather than the configured 6 and 7 (Michael's measured table, PR #129). Nobody should expect to eyedropper `#004001` out of the running app.
- **Textures are hidden by default.** A new switch is added to the bottom controls, **between the Setup and Spark buttons**, labeled "Vegetation Key".
- The switch is always available: it has no disabled state.
- **The switch's on state turns the track `#2997ff` and moves the thumb 18px** (left edge 400 off, 418 on, against a track at 409; the 28px thumb overhangs the 28px track by 9px at whichever end it rests). Hover and select follow the board's other controls: icon outline at 50% opacity on hover, 100% on select, in both the on and off variants.
- **The switch's state is `ui.showVegetationKey` on `UIModel`, and that flag, not `config.showVegetationKey`, is what `terrain.tsx` reads.** `simulation.config` is a plain object that nothing writes at runtime, so a switch setting a config field would repaint nothing; see Technical Notes.
- **`ui.showVegetationKey` is initialized from `config.showVegetationKey`**, which stays `false` by default. `?showVegetationKey=true` is a supported authoring parameter, not a demo hook: Trudi asked for it by name so that Hazbot-enabled tasks can open with the key on (see the resolved Student question). It sets an opening state rather than a hard gate, so the switch still toggles off from there. The switch itself always ships: no config field hides it. Default-off is a backward-compatibility constraint, because the key on by default would change what the already-published module renders.
- **The config field is named `showVegetationKey`, not the prototype's `texturedTerrain`.** It joins the existing `show<Thing>` family in `config.ts`, whose default-off members are `showModelDimensions`, `showZoneLines` and `showCoordsOnClick`, and whose authoring member is `showBurnIndex`: a per-activity toggle for a key-area UI element, which is exactly this. The rename also makes the config key, the MobX flag and the on-screen label one name instead of three. `texturedTerrain` matched nothing, and the `<thing>Available` family is about enabling tools rather than visibility, so it was not an alternative. The rename retires PR #129's `?texturedTerrain=true` demo link, which is deliberate: that link points at a separate demo deploy and nothing in this repo depends on it. Documented in `CLAUDE.md`'s URL-param table with this story.
- **The prototype's demo version banner comes out of `top-bar.tsx` and `top-bar.scss`.** It was gated on the same config field authors are now told to set, so leaving it in would have put `Wildfire Explorer: Textured Terrain - v0.2 - updated: 8/21/26` across the top bar of every activity opening with the key on, which was verified on the rebased build before removal. PR #129's own gap list already called it demo scaffolding; the parameter's promotion is what turned removing it from a tidy-up into a blocker. **Both files are byte-identical to master**, so the story adds no top-bar diff at all: the work is built onto master rather than rebased onto the prototype, so the banner is never introduced in the first place.
- **The switch's state persists across both Restart and Clear All**, following the `ui.showChart` precedent. Neither `handleClearAll` nor `simulation.reload()` touches it.
- **The switch is purpose-built in the bottom bar, reusing `slider-thumb-small.svg`**, not an MUI `Switch`. The repo has no `Switch` anywhere, and that asset is already used as a CSS `background-image` on a track (`wind-circular-control.scss:115`), which is the exact mechanism the board draws.
- Stretched textures on the vertical sides of the model are suppressed.
- Textures over the river are suppressed.
- **The river color no longer stretches down the sides of the model *when textures are on*.** This one is deliberately gated to the textured path, so the switch-off render stays byte-identical to master. The residual in the default view is small and known: on `mountainsandplainsTwoZone`, 5 of 498 river cells sit on the perimeter (x=0 at y=12-13, x=239 at y=27-29), so two smears of roughly 1,000 to 1,500 ft on an 80,000 ft edge, visible only after orbiting down toward `maxPolarAngle`. It is a pre-existing master artifact and is not fixed here.
- With the textures off, the terrain renders through the existing vertex-color path unchanged. **Verified 2026-08-27 by pixel comparison after the rebase**, production builds of `origin/master` and of the rebased prototype side by side on `mountainsandplainsTwoZone`: identical in the initial view and in a burnt/burning state, 0 of 1,409,280 channel samples differing in each. See Technical Notes. The comparison is re-run before merge if the terrain code moves again.
- Texture loading failure degrades to the untextured terrain rather than breaking the view.
- **The tile URL resolves correctly on a branch deploy. Verified 2026-08-27** against the prototype's own demo build, so this is evidence rather than a pending check; see Technical Notes.
- **The story ships as one PR, with the terrain work, the switch work and the untextured-path performance fix as three separate, clearly named commits**, so the diff reads in three passes and the seams survive in `git log`. The performance commit is the one that touches the default render path and it stands alone deliberately, so it can be reviewed, and if necessary reverted, without disturbing the feature.
- **The PR body calls out two things explicitly, with their numbers: the untextured-path performance commit and the bottom-bar row change.** On the first, say that it changes the default render path's speed and not its output, give the 36.8ms to 28.6ms Chromebook figure, and cite the pixel comparison as the evidence; a reviewer who finds an unannounced edit to the untextured path in a vegetation-texture PR is right to stop. On the second, give its numbers (`.mainContainer` 481 to 576, `.rightContainer` driven down to its 194px content floor, after which only `.leftContainer` can absorb further growth) and name it as the change to review. It is roughly 60 lines against the rebased prototype, and it is the half that is new rather than already built, so it is the half that can be nodded through. Note that this is **not** a centering regression: measured at 950px with a rule-set loaded, `.mainContainer`'s center sits 10px right of the viewport center today and 7px left of it with the switch, so the offset shrinks. Do not ask a reviewer to look for a centering break.
- **The tiles load once per page and are retained; the switch gates only whether the textured material renders.** Passing the live switch value into `useTerrainTextures` is the broken shape: verified under Jest against the prototype's own hook, switching off disposes the texture while the hook keeps returning it, switching on then renders one frame against that disposed texture, and every off/on cycle re-fetches and re-rasterizes all four tiles.
- **No per-cell loop in `terrain.tsx` reads `simulation.gridWidth` or `simulation.gridHeight`.** Both are `@computed` (`simulation.ts:82-87`), and a computed read from a `useLayoutEffect` rather than from inside a reaction has no observers, so MobX re-evaluates it on every access. `isNearTerrainEdge` calls `simulation.isTerrainEdge` five times per cell and each call reads up to two of them, so the textured path pays up to 384,000 recomputes per tick. That single predicate is the whole of the Chromebook problem: fixing it takes the textured burning median from **82.2ms (100% of frames past the 66.5ms clamp) to 39.0ms (0%)**, with `updateBurnState` untouched. Either hoist the values into locals above the loop or precompute the near-edge predicate into a `Uint8Array` mask; both render pixel-identically to today. **Verified by re-running the frame-time probe on a Chromebook**, with the textured burning median required to land under 66.5ms. Because `updateColors` is shared, the same hoist also fixes the untextured path, which master has been paying about 9.3ms/tick for; that is deliberate, it ships as its own commit, and it is why the PR body has to name it. See the Performance Engineer finding and the resolved open question.
- **`updateBurnState` stays whole-grid-per-tick, and the textured path keeps calling `updateColors` every tick.** Both were specified as optimizations on a mis-attribution and neither is worth building. Deleting `updateBurnState` outright, which is the ceiling of any incremental scheme, is worth **3ms** on the Chromebook against a threshold the bullet above already clears by 27ms; the `DataTexture` re-upload it was blamed for is free. Skipping the textured `updateColors` is not safe as stated in any case, because `isFireLineUnderConstruction` does change mid-run.
- **Toggling the switch logs `VegetationKeyShown` / `VegetationKeyHidden`**, a paired view-toggle event following `ChartTabShown` / `ChartTabHidden` (`right-panel.tsx:26-30`), with an explicit no-op `case` in `translate.ts` alongside the chart-tab one.
- **`scripts/measure-terrain-textures.mjs` comes across with the tiles and the story requires running it** after any tile change, rather than inheriting it as scaffolding nothing invokes. It gets a row in `CLAUDE.md`'s commands table so the next person editing a tile finds it, and it was run on the shipped tiles: all four pass at viewBox 256, stroke 3, background exactly 128, sd 28.3 to 36.0 against a floor of 12.
- **The exploratory config knobs are collapsed to constants: nine fields become three.** `terrainGlyphContrast` and `terrainGlyphContrastBurnt` survive, because they are what produce the specified colors. `showVegetationKey` survives with its meaning narrowed to the initial value of `ui.showVegetationKey`, and its comment says so rather than describing it as the render gate. The other six (`terrainTextureTileFt`, `terrainTextureHighlight`, `terrainBurnEdgeNoiseScale`, `terrainBurnEdgeSoftness`, `terrainTextureMacroAmount`, `terrainTextureSlopeFade`) become module constants in `terrain-shader.ts`, keeping the prototype's comments, which explain non-obvious mechanisms (particularly why the tile size must be counter-intuitively large) that survive the move. Verified to change no pixels on either path.

## Technical Notes

The prototype was read in full from `origin/wildfire-explorer-textured-terrain-prototype` (PR #129, "DO NOT MERGE"). **PR #129 carries no comments and no reviews**, so its body is the whole of the recorded discussion, and that body is substantial: it documents the tiling contract, the ink derivation with on-screen sampled values, and a Known gaps list. Three of its gaps are adopted here as facts rather than re-derived: the top-bar version tag is demo scaffolding to be removed before merge, no unit tests were written for the shader or the loader, and Cypress had never been run against this branch, which mattered because Cypress is the only WebGL-capable runner in the repo. **That one is now closed: `CI=true npx cypress run --browser chrome` against the rebased prototype passes 43 of 43 across all 8 specs** (2026-08-27). **Two** design boards are sources, not one. Layout and the switch's states come from the *Updated Wildfire Controls and Labels* board (`.../screen/6a8566a1c90489f7be36e66a`); the tiles, the color table and the Setup-panel texture treatment come from *Updated Wildfire Setup Panel and Terrain Textures* (`.../screen/6a8599f5f464e141fcb7b53b`), which exports the four tiles as SVG assets named `grass`, `shrub`, `forest` and `forest-with-suppression`, carries an "Assigned Color" table holding the five stroke hexes as swatches beside the terrain colors, and draws the four Setup-panel "with Vegetation Key ON" variants that WM-53 builds from. Nothing here is reconstructed from screenshots.

**The board's "implemented at 0.5x" note is about the terrain assets, not the textures**, and an earlier draft of this spec attached it to the wrong thing. It sits under the board's exportable *terrain* images, which are drawn at 2x (240 x 200 for a 2-zone card, 160 x 200 for a 3-zone one) against the repo's 1x PNGs, all 15 of which WM-53 decoded and confirmed. The Setup panel's *texture* scale is a separate number and it is not 0.5x of anything: the tile is drawn at **112.5px square from the 256px source**, which is 0.44x. WM-53 derived that independently from the board three ways, as roughly 113px, and Michael confirmed the exact authored value 2026-08-27; 112.5 + 7.5 = 120 is the split the board's own instance geometry shows across a 2-zone card. It is about 3x coarser than the model's own `terrainTextureTileFt` implies, which is a thumbnail-legibility choice and WM-53's to carry. It corroborates one thing here: at 112.5px the authored `stroke-width="3"` on a 256 viewBox draws at 1.32px, which is the figure Michael quoted unprompted.

**The prototype is substantial, and it rebases cleanly.** Three commits, 12 files, **+1678 / -42**: a shader (`terrain-shader.ts`, 343 lines), a texture loader (`terrain-textures.ts`, 136), an extracted palette (`terrain-colors.ts`, 42), a restructured `terrain.tsx` (+219/-42), 72 lines of new config, four tile SVGs, and a 243-line authoring-contract checker. Master has moved **117 commits across 171 files** since it branched at `4818bf5`, and **not one of those files is a file the prototype touches** (re-measured 2026-08-26 against `origin/master`, after WM-35, WM-47 and WM-52 landed; the intersection of the prototype's 12 paths with master's 171 is empty). So there is no textual conflict to resolve; this can be rebased and then reviewed as new code rather than reconstructed. **The rebase was performed 2026-08-27 rather than left as a path-intersection argument**, and it is clean: three commits, no conflicts, and on the rebased head `tsc --noEmit` reports only the two pre-existing `line-chart.tsx` errors, `npm run lint` reports 0 errors with no warnings in any prototype file, and `npx jest` reports 1010 of 1010.

**How it works.** Four 256 x 256 SVG tiles live in `src/public/terrain-textures/`, each with a `#808080` background rect and `#2A2A2A` glyph strokes, and are **fetched by URL at runtime rather than imported**, because the webpack `.svg` rule pipes imported SVGs through SVGR (yielding a component, not a URL) and because serving them statically lets an artist edit a tile and reload with no rebuild. They are rasterized to 512 x 512 through `<img>` plus a canvas, then packed into the four channels of a single `THREE.DataTexture` in **Vegetation enum order**, which matches `types.ts:16-21` exactly (Grass 0, Shrub 1, Forest 2, ForestWithSuppression 3). The packing exists because GLSL forbids indexing a sampler array by a per-fragment value, so the alternative would be sampling all four tiles and discarding three. The texture is tagged `NoColorSpace` because the tiles are luminance data rather than color, with **128 as the neutral "unchanged" point**, and anisotropic filtering is applied because the terrain is viewed at a shallow angle.

There is deliberately **no separate burnt tile**: burnt ground samples the same tiles and recolors them, so a burnt cell keeps the glyph of whatever grew there and the two can never fall out of sync.

**THE COLOR "CONFLICT" DOES NOT EXIST. The ticket's five hexes are exactly what the prototype computes.** The earlier reading was right that grepping the diff for `004001`, `2D460B`, `424F12`, `241B06` and `B3B3B3` returns no hits, and wrong about what that meant: the hexes are absent because they are *derived*, not because a different design was chosen. Reimplementing `wfInk` and `wfRatioFor` (`terrain-shader.ts:124-167`) in isolation and evaluating them against the four `getTerrainColor` values plus `BURNT_COLOR`, in the **linear** working space a three.js fragment shader operates in, reproduces every one of the five to the byte:

| Level | Terrain color (sRGB) | Linear luminance | Contrast target | Branch | Derived ink | Ticket |
|---|---|---|---|---|---|---|
| No drought | `#02D40A` | 0.4707 | 6 | darken | **`#004001`** | `#004001` |
| Mild | `#92D637` | 0.5446 | 6 | darken | **`#2D460B`** | `#2D460B` |
| Medium | `#C1E245` | 0.6613 | 6 | darken | **`#424F12`** | `#424F12` |
| Severe | `#C8A145` | 0.3816 | **7** | darken | **`#241B06`** | `#241B06` |
| Burnt | `#333333` | 0.0331 | 6 | **lighten** | **`#B3B3B3`** | `#B3B3B3` |

Two details fall out of that table and both matter. The severe row is darker than the others because its contrast target is 7 rather than 6, so the `[6, 6, 6, 7]` array is a designer-visible parameter rather than a tuning dial. And the burnt row is the one that proves the mechanism: `#B3B3B3` is a **light gray on dark ground**, produced by the lighten branch, which triggers only when the base's linear luminance is below **0.1792**; burnt is 0.0331 and clears it comfortably, while every drought color is far above it. **Corrected 2026-08-27**: an earlier draft concluded from this that the ticket's list "is a record of the prototype's output" and that "the numbers could only have been written by reading them off the running prototype." That is wrong, and the artifact that settles it is the Terrain Textures board, where all five sit as 50 x 50 swatches in a column headed **"Assigned Color"**, beside a "Terrain" column holding `#02D40A` through `#333333`. They are authored design values. The derivation reproducing them exactly is the agreement of two independent things, not a transcript of one, which is precisely why the agreement is worth a test.

Worth noting for anyone re-deriving this: evaluating the same formulas on the **sRGB** values instead produces `#001501`, `#101806`, `#161A08`, `#0F0C05` and `#000000`, none of which match, and the burnt case in particular comes out black rather than gray. The color space is the whole result.

**Stroke width 3 is confirmed.** All four tiles carry `stroke-width="3"` on their glyph paths, on a 256 viewBox. Rasterizing at 512 draws them at 2x, so the authored 3 lands at 6px in the raster, and `terrainTextureTileFt: 18000` over the default 120,000 ft model gives about 6.7 repeats across the terrain. The ticket's "ends up ~1.9px when applied to the model" is the on-screen figure, not the authored one.

**The tile size must be counter-intuitively large**, and the config says why: the default view shows roughly 120 ft per screen pixel, so a small tile puts its detail below the pixel grid, mipmapping averages it back to the tile's mean, and since that mean is neutral by contract **the texture disappears entirely**. An abstract map symbol needs roughly 15 to 30 screen pixels to be recognizable, which is 1800 to 3600 ft of ground.

**The four tiles, rendered and looked at.** Extracted from the branch and rasterized in Chrome (screenshot at `tmp/playwright/wm48-terrain-tiles.png`, gitignored). Grass is a field of small three-stroke tufts; forest is outlined conifer triangles; forest-with-suppression is the same triangles under a diagonal hatch; **shrub is a field of scalloped, cloud-shaped outlines**. See the open question: that is the tile Trudi rejected, and it has not changed.

**All three of the ticket's "other fixes" are already implemented.** River cells are given all-zero texture weights, which the shader reads as neutral so the river renders as flat water (`terrain.tsx:204-209`); the river's color is suppressed across the outermost cell ring so it no longer interpolates down the side of the model (`:107-123`); and the vertical skirt is handled by `terrainTextureSlopeFade: [0.15, 0.5]`, which fades the texture out as the surface normal turns away from vertical, because the tile UV is a top-down planar projection that smears on near-vertical faces.

**`simulation.config` is a plain object, not observable state.** `SimulationModel.config` is an undecorated field (`simulation.ts:34`); `makeObservable(this)` at `:74` picks up only the `@observable` members declared at `:44-71`. It is assigned once from `getResolvedConfig()`, which is `Object.assign(base, preset, urlConfig)` over plain objects (`config.ts:289-293`), and nothing in `src/` writes to a config field at runtime outside tests. So config reads are safe *inside a render* (`app.tsx:112` gates the Fire Intensity Scale on `config.showBurnIndex` this way) and useless as *mutable state*: a control writing `config.texturedTerrain` would change no observer's output. That is why the switch's flag lives on `UIModel` and the config field is only its initial value.

**THE SWITCH DOES NOT EXIST IN THE PROTOTYPE.** The only top-bar change is a version-tag banner for the demo build (`<strong>Wildfire Explorer: Textured Terrain - v0.2</strong>`), not a control. Textures are gated purely on `config.texturedTerrain`, default `false`, reachable via `?texturedTerrain=true`. **The entire bottom-bar switch is unbuilt work** and is not represented in the prototype's 1678 lines.

**The switch's geometry, from the board.** The Vegetation Key control sits **between Setup and Spark**, not merely "to the right of Setup":

| Piece | Value |
|---|---|
| Widget group | 90px content / 92px border box, 1px `#797979` inside border, 10px radius |
| "Vegetation Key" label | 70 x 34 at rel (10, 4), two lines |
| Switch group | 46 x 28 at rel (22, 41) |
| Track | 28 x 10, `#d8d8d8`, 1px `#797979` inside, radius 11 |
| Thumb | the "Slider Thumb Small" asset, 28 x 28 group with a 20 x 20 visible circle |
| Track fill, off / on | `#d8d8d8` / **`#2997ff`** |
| Thumb left edge, off / on | 400 / **418** (track left edge 409) |
| Hover / select | icon outline 50% opacity / 100% opacity, both variants |

**What inserting it does to the row, measured on master.** The row today is **seven widget groups** at `Clear All 68 / Setup 84 / Spark 62 / Restart 62 / Start 62 / Fireline 67 / Helitack 67`, with `$bottomBarWidgetGroupSpacing: 4px` and each group's `margin-left: -1px`, so the effective gaps are `3, 3, -1, -1, 3, -1` and `.mainContainer` measures **481px**. Inserting a 92px group between Setup and Spark was probed live at a 950 x 880 viewport by cloning a widget group into place: `.mainContainer` goes to **576px** (92 plus a 3px gap), `.leftContainer` falls from 244.5 to 180 and `.rightContainer` from 224.5 to **194**. The bar does not overflow (`scrollWidth` stays 950), but 194 is exactly `.rightContainer`'s content width (Hazbot button 122 + 10px gap + fullscreen toggle 62), so it has bottomed out and `.mainContainer` is **no longer centered**: left 180 against right 194. Centering, not overflow, is what this switch spends. WM-40's speed control lands in the same row on top of that.

In the board's default bottom-bar row the thumb sits at the **left** end of the track, consistent with textures hidden by default. The board's note beside the states column reads *"Disabled (may not need) NOTE: this switch should always be available; future design may warrant a disabled state"*, and that column's four rows are labeled "Default On", "Hover", "Select" and "Disabled", which is a state-variant list rather than a statement about the initial value.

**There is nothing to share with WM-40's control, which the "build the thumb once" idea assumed.** The two use different assets at different sizes: WM-48's switch thumb is `slider-thumb-small.svg` (28px group, 20px circle) and WM-40's slider thumb is the larger `Slider Thumb` (32px group, 24px circle), and the board exports both as separate assets. They are also different component families: WM-40 is an MUI `Slider` in `step={null}` mode, WM-48 is a two-state toggle.

**The repo has no `Switch`, but it does have the mechanism the board draws.** `@mui/material`'s `Slider` is used in three components (`wind-circular-control`, `vegetation-selector`, `drought-selector`) and `rc-slider` in the chart controls, but `Switch` appears nowhere. `slider-thumb-small.svg` is already consumed two ways: as an SVGR component (`charts/components/line-chart-controls.tsx:7`) and as a CSS `background-image` on a track (`wind-circular-control.scss:115`). The second of those is exactly a thumb-on-a-track, which is what the board's switch is.

**An authoring-contract checker already exists.** `scripts/measure-terrain-textures.mjs` rasterizes each tile through headless Chrome (the same rasterizer that ships, and served over HTTP because Chrome taints a canvas drawn from a `file://` image) and checks the viewBox, the glyph stroke width, that the background's modal value sits on **128**, and the standard deviation, noting that below roughly 12 a tile disappears at distance. That is a ready-made guard for the one failure mode nobody can judge by eye.

**The tile fetch bypasses webpack's `publicPath`.** `terrain-textures.ts:13` sets `TILE_DIR = "terrain-textures/"`, a bare relative path assigned to `img.src`, so it resolves against the **document URL**. Meanwhile `webpack.config.js:153` sets `publicPath: DEPLOY_PATH` for the HTML plugin and `CopyWebpackPlugin` copies `src/public` to the build root. The prototype's comment says the relative path "resolves correctly under a branch deploy path", and it does for `/branch/foo/index.html` and for `/branch/foo/`, both of which resolve to `/branch/foo/terrain-textures/...`. It does **not** for a URL with no trailing slash, which resolves one level up. Since branch builds serve from `/branch/<name>/`, this is verifiable in one page load on a real branch deploy, and it is worth doing rather than assuming, because the failure is silent by design.

**The tile path was checked on a real deploy, and it works.** PR #129 links a live build at `https://models-resources.concord.org/demos/branch/wildfire-explorer-textured-terrain/`. All four tiles return 200 under `.../terrain-textures/`, and the served `shrub.svg` is byte-identical to the file on the branch. The failure case reasoned about above does not arise either: requesting the directory URL **without** a trailing slash returns 200 with an effective URL that has one, so the document URL a browser resolves `terrain-textures/` against always ends in a slash. The bare relative path and `publicPath` can still disagree in principle; on this deployment shape they do not.

**The `terrain-colors.ts` extraction does not collide with WM-52, and there is a tidier end state.** `fire-intensity-scale.tsx:3` is the **only** importer of the burn-index colors from `view-3d/terrain`, and the prototype's `terrain.tsx:26` re-exports them from `terrain-colors.ts` precisely to keep it working. WM-52 moves that component but explicitly keeps the colors deriving from `BURN_INDEX_*`, so the re-export carries it either way and the two stories touch the chain from opposite ends without conflicting. If WM-48 lands first, the cleaner follow-up is for WM-52's moved component to import from `terrain-colors.ts` directly and let the re-export go.

**Texture memory, computed.** One 512 x 512 RGBA `DataTexture` is 1.0 MiB, and a full mip chain adds about a third, so roughly **1.4 MiB** steady state while the switch is on, plus four transient rasterization canvases during load. That is small enough not to be the Chromebook concern, and neither, as it turned out, was the fragment shader: the cost was per-cell CPU work. See the Performance Engineer finding.

**`forestWithSuppressionAvailable` can be false** (`config.ts:97`, a documented URL param), so the fourth vegetation type is not selectable in every activity. The prototype packs all four tiles unconditionally, which is harmless but means one channel is dead weight in those activities.

**Suite baseline on this branch.** `npx jest` reports **1010 passed of 1010** across 79 suites, re-measured 2026-08-27 on the actually-rebased head, alongside Cypress at 43 of 43. No repo files were created or modified; the tile rendering used copies extracted to a scratch directory and served over a temporary local HTTP server, both since removed.

**Unobserved MobX computeds recompute on every read, and the terrain render loop does that tens of thousands of times a tick.** `SimulationModel.gridWidth` and `gridHeight` are `@computed` (`simulation.ts:82-87`), each a one-line read of `this.config`. `updateColors` passes both to `setVertexColor` **per cell**, from a `useLayoutEffect` rather than from inside a reaction, so the computeds have no observers and MobX re-evaluates them on every access. At the default gridWidth 240 that is 76,800 recomputes per tick in the untextured path, and up to 384,000 in the textured one, because `isNearTerrainEdge` calls `simulation.isTerrainEdge` five times per cell and each call reads up to two of them. Measured over 38,400 cells, ten computed reads per cell cost 14.0ms against 1.9ms for the same count of plain `config` reads: the arithmetic is free and the property access is the whole cost. Two shapes fix it. Hoisting the values into locals above the loop recovers 13 of the 15ms and has no invalidation surface. Precomputing the near-edge predicate into a `Uint8Array` recovers about 1.5ms/tick more on desktop but has to be invalidated when the grid is resized. Both are pixel-identical to today.

**How the untextured path's byte-identity was verified, and why the burnt half does not use a real fire.** Production builds of `origin/master` and of the rebased prototype were served side by side and the terrain canvas alone was captured on `mountainsandplainsTwoZone` (river, two zones), so the prototype's demo-only top-bar version banner does not pollute the comparison. The initial view is deterministic and diffs clean. The burnt state cannot be compared through a real burn, because `data-loaders.ts:64` randomizes unburnt islands at terrain-load time, before any page-level `Math.random` seed could be installed, on top of the two unseeded rolls in `fire-engine.ts`. So fire state was written directly into the cells in a fixed `(x * 7 + y * 13) % 11` pattern on both builds, giving 10,474 burnt cells of which 3,492 are fire survivors and 10,472 burning cells at three spread rates chosen to land in all three burn-index tiers, and repainted by bumping `cellsStateFlag`. Identical cell state on both sides, so the diff means something a seeded burn still would not have. Both comparisons came out at 0 of 1,409,280 channel samples differing.

## Out of Scope

- **Removing the Fire Intensity Scale from the bottom bar** to make room. That is WM-52.
- **The Clear All rename and move** (WM-47) and **the speed control** (WM-40), which land in the same row.
- **Sharing a thumb component with WM-40.** Rejected on measurement: different assets, different sizes, different component families.
- **Enhancing the zone labels** (WM-49), which the ticket links to but which is a separate, currently unspec'ed story.
- **The Setup panel changes and the Fire Intensity Scale restyle**, both explicitly assigned elsewhere by the description.
- **Accessibility review**, per the standing scope for this repo. Note that the prototype's config comments reason about contrast in WCAG terms; that is the prototype author's rationale for choosing ratios, not a requirement this spec adopts.

## Open Questions

### RESOLVED: Fixed stroke hexes, or the prototype's derived-contrast ink?
**Context**: The description lists five exact colors; the prototype computes the ink per fragment from a contrast target and contains none of those hexes. Both cannot be the implementation.
**Options considered**:
- A) Use the five fixed hexes and delete the contrast machinery.
- B) Keep the derived-contrast approach and treat the hexes as approximately what it produces.
- C) Keep the derivation but pin the four drought results to the specified hexes, so the mechanism survives and the shipped colors are the designer's.

**Decision**: **B, and not "approximately": exactly.** Reimplementing `wfInk` and `wfRatioFor` outside the shader and evaluating them in linear working space at the configured targets reproduces all five hexes to the byte, including the burnt `#B3B3B3` via the lighten branch (full table in Technical Notes). So there was never a conflict to settle: the description's list documents the prototype's output. That makes A actively wrong, since it would delete the mechanism that generates the numbers it keeps, and lose the property that makes the burnt case work without a hand-picked ash color. C turns out to be unnecessary in its stated form, because the results already *are* the specified hexes, but its instinct was right and is worth keeping in a cheaper form: rather than pinning the outputs in the shader, a unit test asserts that the derivation still produces those five, which is now a requirement. That test is mutation-visible in the way that matters, since retuning `terrainGlyphContrast` or a drought color changes a shipped color and would otherwise change it silently. It also settles part of the config-surface question below: `terrainGlyphContrast` is not an exploration dial.

---

### RESOLVED: Does the prototype ship, or is it rewritten?
**Context**: PR #129 is titled "DO NOT MERGE" and is exploratory by its own config comments, but it is 1678 lines of working, heavily commented code that rebases with zero conflicts. It also carries nine new config knobs, most of which are tuning dials from the exploration rather than things an activity author would ever set.
**Options considered**:
- A) Rebase the prototype, then harden it: keep the architecture, collapse the exploratory knobs to constants, keep the checker script.
- B) Ship it as-is behind the switch and tidy later.
- C) Re-implement from the prototype as reference.

**Decision**: **A.** C is ruled out by what the deep dive found in the code rather than by effort alone: the parts that look like exploration are load-bearing and were arrived at by solving specific problems that a reimplementation would have to rediscover. The contrast derivation is the clearest case, since it is what produces the designer's five colors; the same is true of the channel packing (GLSL cannot index a sampler array per fragment), the 18,000 ft tile (a smaller one mipmaps away to nothing), the `NoColorSpace` tag, and the slope fade. B is ruled out by the config surface: nine fields settable per activity and by URL param is a contract with authors, and shipping it "to tidy later" makes it one. A is what is left, and the deep dive makes it concrete rather than aspirational: the rebase is textually free (44 commits across 108 files on master, none of them files the prototype touches), the knobs to keep versus collapse are now identifiable (see the Senior Engineer finding), and the checker script is a guard the repo should want rather than scaffolding to drop.

---

### RESOLVED: Is the shrub tile still the one that "looks too much like clouds"?
**Context**: In the 2026-08-20 Slack thread Trudi's one substantive criticism was that the shrub texture reads as clouds, and Michael owned the rework. Nothing on the ticket records whether that was addressed. This matters more than it sounds: it is the one piece of the design that a stakeholder actively rejected.
**Options considered**:
- A) Confirm with Michael whether the current `shrub.svg` is the revised one before building on it.
- B) Ship whatever is on the branch and iterate on the asset later, since swapping a tile is a file replacement.

**Findings:** the question is answered, and the answer is yes. The four tiles were extracted from the branch and rasterized in Chrome during this pass (`tmp/playwright/wm48-terrain-tiles.png`): **the shrub tile is a field of scalloped, cloud-shaped outlines**, at full size and still at the roughly 60px scale the config reasons about. So no revision has landed. The commit dates cannot refine that much: all three prototype commits are stamped 2026-08-21 16:01, within 21 seconds of each other, which is a push after a rebase rather than three authoring sessions, so the date tells you when the branch was pushed and not when the art was drawn. That closes option A's question, which was "is it revised" and is now "it is not", and leaves the real choice: block on a revised tile, or take B and swap the file later. Two facts for that call: swapping is genuinely a one-file replacement plus a run of the checker script, and the other three tiles read clearly (tufts, conifer triangles, and triangles under a diagonal hatch), so the rejection is isolated to one of four.

**Decision (2026-08-27): B, ship the current tile. Confirmed by Michael directly the same day.** Asked in Slack whether the tile still needed his revision, framed as not wanting to ship the version that was already rejected, he replied: *"Shrub should be correct. We're going to test it."* Note that he contradicts the premise rather than conceding it: his position is that the current tile is the right one and that it will be validated in use, not that a rework is outstanding. That closes the question on the designer's own word, and the inference below now corroborates it rather than carrying it.

The framing above, that a stakeholder rejected this asset and the rework never landed, does not survive the artifact that was missing from it. WM-48 links **WM-37, a Design Task assigned to Michael, status Done, resolved 2026-08-23 02:20**, which is three days *after* the 2026-08-20 critique. The designer closed his own design task with the asset unchanged.

The timeline, assembled this pass:

| Date | Event |
|---|---|
| 2026-08-19 | Both Zeplin boards created (ids `6a8566a1`, `6a8599f5`), carrying the cloud-like shrub |
| 2026-08-20 | Trudi's Slack critique; Michael owns the rework |
| 2026-08-21 16:01 | Prototype branch pushed, shrub unchanged |
| 2026-08-23 02:20 | **Michael marks WM-37 Done** |

And the tile is identical everywhere it exists: the Zeplin board asset, the branch file, and the file served by the live demo build are byte-identical, and rasterized at 512 the board and branch copies differ by **zero pixels** above 8/255. Neither WM-48 nor WM-37 carries any comment about the shrub, PR #129 has no comments at all, and its body describes the tile neutrally as "a lobed clump".

So this stops being a blocking request for work. Nothing in Jira, GitHub or Zeplin records an outstanding rework, and blocking an implementation story on a design task its designer has signed off is second-guessing him. The cost of being wrong stays low for as long as we want it to: the tiles are fetched by URL at runtime, so a swap is one file replacement plus a run of `scripts/measure-terrain-textures.mjs`, with no rebuild and no import to update, and the source to swap *from* is now known to be the `shrub` asset on the Terrain Textures board. The other three tiles read clearly, and the feature is off by default.

**Routed to**: Michael, as a confirmation rather than a request: WM-37 is Done, so the current shrub is being taken as final; say so if that is not what Done meant.

---

### RESOLVED: Confirm the default is off, given the board's "Default On" label
**Context**: The description says *"the textures are hidden by default"* and the board's default bottom-bar row draws the thumb at the left of the track, so off. But the switch's own states column is annotated **"Default On"**, which almost certainly names the on-state variant rather than stating an initial value, and Trudi reversed herself on this exact question within one minute in the original thread.
**Options considered**:
- A) Off by default, per the description and the drawn bottom bar. Read "Default On" as a variant name.
- B) Confirm with Trudi before building.

**Decision**: **A**, and the label reads as a variant name because that is demonstrably what it is. The four annotations in that column are "Default On", "Hover / icon outline 50% op", "Select / icon outline 100% op" and "Disabled (may not need)", which is the same four-row state list every other control on the board carries; the only thing distinguishing this one is that its default row had to say which of the two toggle positions is drawn. So it names a variant, exactly as the question suspected, and it is not a third opinion about the initial value. Against it stand two artifacts that agree: the description says textures are hidden by default, and the board's own default bottom-bar row draws the thumb at the left of the track. Trudi's reversal is real but it resolved, in the direction the description then recorded, so the history is a reason to read the artifacts carefully rather than a reason to reopen a settled call. `config.texturedTerrain` already defaults to `false` in the prototype, so A is also what the code does today.

---

### RESOLVED: What kind of control is the switch, and does the bottom bar have anything to build it from?
**Context**: Every existing bottom-bar control is a button or a button pair; there is no toggle switch anywhere in the bar today. The board draws a track-and-thumb switch reusing the "Slider Thumb Small" asset that the Setup panel's sliders already use. WM-40's speed control is arriving in the same row with its own slider-like control, so there may be a shared thumb treatment worth factoring once rather than twice.
**Options considered**:
- A) A purpose-built toggle in `bottom-bar.tsx` reusing `slider-thumb-small.svg`.
- B) An MUI `Switch` restyled to the board.
- C) Coordinate with WM-40 so the two thumb treatments are built once.

**Decision**: **A**, with C eliminated by measurement rather than by preference. The two controls have nothing to share: WM-48's thumb is `slider-thumb-small.svg` at a 28px group with a 20px circle, WM-40's is the larger `Slider Thumb` at 32px with a 24px circle, the board exports them as two separate assets, and the components are different families (a two-state toggle against an MUI `Slider` in `step={null}` mode). Factoring them would mean inventing a shared abstraction over two things that differ in asset, size and behavior. Between A and B, the repo settles it: `@mui/material`'s `Switch` appears **nowhere** in this codebase, while the mechanism the board actually draws, a thumb image positioned on a small track, already exists at `wind-circular-control.scss:115`, which paints `slider-thumb-small.svg` as a `background-image` on a track. B would import an unused component family whose default anatomy (a large switch with a ripple and a shadowed thumb) would need to be restyled away to reach a 28 x 10 track. A reuses an asset and a technique the repo already has.

---

### RESOLVED: Does the texture toggle persist across Restart and Clear All?
**Context**: It is a view preference rather than model state, so it plausibly survives everything. But Clear All promises a return to defaults.
**Options considered**:
- A) Persist across both.
- B) Persist across Restart, reset on Clear All.

**Findings:** the persistence half is settled by where the flag has to live, and it separates cleanly from the logging half, which is now its own question below. Unlike WM-40's speed multiplier, which affects the model clock and therefore belongs on `SimulationModel`, this is pure view state and belongs on `UIModel`. That matters because the two have different reset machinery: `simulation.reload()` has a designated *"Reset user-controlled properties too"* seam (`setInputParamsFromConfig()`), whereas nothing resets `UIModel` on Clear All. `handleClearAll` (`bottom-bar.tsx:329-347`, renamed from `handleReload` by WM-47) clears exactly three ui things by hand, `ui.interaction`, the fire-line placement and `ui.resetHazbotFeedback()`, and leaves the rest alone. The repo already has a directly analogous precedent for the outcome: `ui.showChart` is a view preference initialized from `CHART_TAB_INITIAL_OPEN` and it survives Clear All untouched. So persisting across both is the free and consistent behavior, and B would need a new line written against the existing convention.

**Decision**: **A, persist across both.** Verified in the code rather than argued from principle: `handleClearAll` at `bottom-bar.tsx:329-347` is the whole of Clear All's UI reset, it names the three things it clears, and `ui.showChart` (`ui.ts:12`) is an existing view preference that it does not touch and that therefore already survives Clear All today. `simulation.reload()` (`simulation.ts:445-451`) resets model state through `setInputParamsFromConfig()` and never reaches `UIModel`. So A is what the code does with no new line written, and B would mean adding a reset that contradicts the only precedent. WM-53 reads this flag and its spec already depends on this answer.

---

### RESOLVED: Is the texture toggle logged?
**Context**: A researcher comparing runs would want to know whether a student had the textures on, and nothing logs it today. The flag's home and lifetime are settled above; this is only about whether toggling it emits an event.
**Options considered**:
- A) Log a toggle event.
- B) Log nothing for now.

**Decision**: **A, log it as a paired event**, `VegetationKeyShown` / `VegetationKeyHidden`, with an explicit no-op `case` in `translate.ts` beside the chart-tab one.

The precedent this question reached for was the wrong one. `ZoneButtonClicked` is a researcher-only event, but the closest analog is sitting on the very flag this story's persistence decision is modeled on. `right-panel.tsx:26-30` does:

```ts
ui.showChart = isOpen;
if (ui.showChart) { log("ChartTabShown"); } else { log("ChartTabHidden"); }
```

A two-state view preference on `UIModel`, logged as **two named events, one per state**. `FullscreenEnabled` / `FullscreenDisabled` (`bottom-bar.tsx:39-49`) is the same shape. Logging a view toggle as a pair is the convention here, not an exception, and both existing examples are toggles with no model effect at all.

The second half is that this is not necessarily researcher-only. `ChartTabShown` / `ChartTabHidden` **are** consumed by the engine: `translate.ts:64-65` maps them, and the comment at `:5` records that they feed the `chartTabOpen` temporal variable. So "log a view toggle, and let a rule-set read it later if it wants to" is already a built path. Given that the Vegetation Key exists for a pedagogical reason, a future category asking whether a student ever looked at the vegetation is plausible enough to be worth not foreclosing, and adding a researcher-facing series after activities have run means the early data cannot answer it.

A single event with a boolean payload was considered and rejected: cheaper to write, but it breaks the naming both existing examples chose, for no gain. The `translate.ts` entry is an explicit no-op case rather than an omission, so the event reads as known-and-ignored instead of accidentally unhandled.

---

### RESOLVED: The story is unpointed, and it is not a 3

**Splitting is decided (2026-08-27): it ships as ONE PR. Option C is rejected.**

**Pointing is closed as out of scope, 2026-08-27, by Doug's call**, for this story and for every other branch in flight this sprint. The story-point value is not being set and the Jira automation nag is being ignored. Nothing below is a live question; it is kept for the sizing evidence, which is still the honest description of what the work is.
**Context**: WM-48 carries no story-point value and the Jira automation has flagged it. It was cloned from WM-37 at an assumed 3. What is actually in front of it is a 1678-line shader-and-texture-pipeline rebase, a design conflict to settle, a brand-new control type in a row three other stories are also changing, and a tile that a stakeholder rejected.
**Options considered**:
- A) Point it after the first two open questions are settled, since they change the size materially.
- B) Point it now at 5, reflecting the prototype-hardening plus the new control.
- C) Split it: the terrain rendering and the bottom-bar switch are independently reviewable.

**Findings:** option A's premise is largely spent, since the two questions it wanted settled are now settled. The color question turned out to be no conflict at all, which removes a design negotiation and replaces it with a unit test; and the ship-or-rewrite question resolved to rebase-and-harden, which is the middle-cost answer. What is left is measurable rather than unknown: a clean rebase, a config-surface triage over nine fields, one new control whose geometry is fully specified and whose mechanism already exists in the repo, one test for the ink derivation, a screenshot comparison for the untextured path, and one rejected tile that is a file swap whenever it arrives. C was the interesting option at the time, and the deep dive supported its feasibility: the terrain half and the switch half share no files at all (the switch touches `bottom-bar.tsx`, `bottom-bar.scss` and `ui.ts`; the terrain half touches `view-3d/` and `config.ts`), so they are not merely independently reviewable but independently landable, which also decouples the switch from the three-story bottom-bar sequence.

**Split decision, 2026-08-27: one PR.** C was carried as the live option for a day and is now rejected, on a change of premise rather than a change of measurement. The split's purpose was **review pipelining**, never unblocking: the reviewer would take the terrain half while the switch half was built, against a cutoff before he is out Friday. That assumed serial human review attention was the scarce resource. It is mostly an AI review, so one ~1800-line diff costs about what two ~900-line ones do, and both halves are being built by one person in one day, so there is no build-side parallelism to overlap against.

**The decisive argument is that the switch half is not independently reviewable.** Terrain alone is coherent: textures behind `config.texturedTerrain`, reachable by URL param, testable standalone. Switch alone is not, because it is a control writing `ui.showVegetationKey`, a flag nothing in that diff reads. Splitting would hand a reviewer a toggle whose whole purpose sits in another PR. The file-disjointness measured below is real, but it establishes that the halves *could* be split, not that they *should* be.

**What C was protecting, and how one PR pays for it instead.** The switch half carries the centering break, and the risk of folding ~60 lines of contentious bottom-bar layout into 1678 lines of mechanical shader and loader code is that it gets nodded through. Two things are therefore requirements of this PR, not preferences: **terrain and switch land as separate, clearly named commits** so the diff reads in two passes; and **the centering change is called out explicitly in the PR body with its numbers**, named as the thing to actually review.

**What would reverse it**: review tooling that truncates or degrades on a diff this size. Not measured. If it chokes, split after all, terrain first.

**Routed to**: nobody. Closed.

**Measured in this pass**, so the number is chosen against facts rather than impressions: the rebase is still free after WM-35, WM-47 and WM-52 (117 commits, 171 files on master, zero intersection with the prototype's 12); the suite baseline on the rebased head is 1010 passed of 1010; the config triage is nine fields, of which three are keeps and six are collapses; and the switch half is confirmed disjoint from the terrain half by file (`bottom-bar.tsx`, `bottom-bar.scss`, `ui.ts` against `view-3d/` and `config.ts`), which is what makes option C landable rather than merely reviewable. The one number that moved against the story is the row: the switch takes `.mainContainer` from 481 to 576 and breaks its centering at 950px (see Technical Notes), so the switch half carries a layout consequence the terrain half does not.

### RESOLVED: Does the untextured path's own MobX fix land in this PR, or its own?
**Context**: `updateColors` reads `simulation.gridWidth` and `gridHeight` per cell on master as well as on this branch, so the default untextured view every existing activity uses spends about 9.3ms/tick recomputing two unobserved computeds. Hoisting the three reads takes the untextured Chromebook burning median from 36.8ms to 28.6ms, a ~22% frame-time improvement, and changes no output.

**Decision (2026-08-27): it lands in this PR, as its own clearly named commit.**

The framing that made this look like a three-way choice was wrong in one option. A standalone hoist PR landing first is not actually cheaper, because **this story rewrites `updateColors` itself**, adding the `baseColorOnly` and `nearTerrainEdge` parameters to the very argument list the hoist edits. A separate PR would collide with this branch in those exact lines, so the real choice was fold it in or file it.

Three things settle it toward folding in. The story already ships as separate, clearly named commits, so a third one reads as structure rather than as a smuggled change. The evidence that makes an output-preserving performance change safe to review is evidence this story has to produce anyway: the byte-identity pixel comparison is already a requirement here, and it is exactly what proves the hoist changes nothing visible. And filing it separately would park a four-line fix, worth 22% of the frame time in the view every existing activity uses, behind a feature story that might slip.

**The scope was verified before deciding, and it is one function.** The only per-tick site on master is `terrain.tsx:156`. `setupElevation` (`:166`), `populateCellsData` (`simulation.ts:342`) and the TPI scan have the same shape but run on elevation change, on load and on spark placement respectively, so they are cheap by frequency and are not required here. The fire engine is immune and already uses the fix: `fire-engine.ts:108-109` copies the dimensions into plain instance fields in its constructor and the hot loop reads those, which makes `updateColors` the outlier rather than the convention.

**The cost of the decision, stated plainly so the PR body can carry it**: this PR's safety argument is that the switch-off render is byte-identical to master, and that stays true of the *output* but is no longer true of the *code*. A reviewer scanning for "does this touch the untextured path" will now find a hit, and should, which is why the PR body has to name this commit and its numbers rather than let it be discovered.


## Self-Review

### Senior Engineer

#### RESOLVED: Nine new config fields is a large public surface for one visual feature
`config.ts` gains `texturedTerrain`, `terrainTextureTileFt`, `terrainGlyphContrast`, `terrainGlyphContrastBurnt`, `terrainTextureHighlight`, `terrainBurnEdgeNoiseScale`, `terrainBurnEdgeSoftness`, `terrainTextureMacroAmount` and `terrainTextureSlopeFade`. Every one of those is settable per activity and via URL param, which makes them a contract with authors. Deciding which are real authoring knobs and which become constants is part of hardening, not a follow-up.

**Decision**: accepted, it is part of hardening, and the color result above makes the triage decidable rather than a matter of taste. Three fields are load-bearing and stay: `texturedTerrain` is the feature flag the switch drives; `terrainGlyphContrast` and `terrainGlyphContrastBurnt` are what produce the designer's five hexes, so they are a design parameter with a test attached rather than a dial. `terrainTextureTileFt` is arguably a fourth, since its value is reasoned about against the model's ground-feet-per-pixel and an activity with a different `modelWidth` would want it to move. The remaining five (`terrainTextureHighlight`, `terrainBurnEdgeNoiseScale`, `terrainBurnEdgeSoftness`, `terrainTextureMacroAmount`, `terrainTextureSlopeFade`) are exploration dials whose own comments say so, most explicitly `terrainTextureMacroAmount`, documented as mostly making the field look blotchy and "kept low" at 0.07. Collapsing those to constants is a requirement.

---

#### RESOLVED: `terrain-colors.ts` extraction changes an import graph that other files depend on
The prototype pulls the palette out of `terrain.tsx` so the shader can share it without a circular import, and re-exports the burn-index colors from `terrain.tsx` so existing importers are unaffected. That re-export is load-bearing and invisible: `fire-intensity-scale.tsx` imports `BURN_INDEX_*` from `view-3d/terrain`, and WM-52 is moving that component. Two stories touching the same import chain from opposite ends is worth knowing about before either lands.

**Decision**: checked, and they do not collide. `fire-intensity-scale.tsx:3` is the **only** importer of those symbols from `view-3d/terrain` anywhere in the repo, and the prototype's re-export at `terrain.tsx:26` exists precisely to keep it working. WM-52 moves where the component renders and explicitly requires the colors to keep deriving from `BURN_INDEX_*`, so it keeps importing through the same chain regardless of which story lands first. The finding's instinct was right to check; the outcome is that the re-export is doing its job. Worth recording the tidier end state rather than acting on it now: once both have landed, the moved component should import from `terrain-colors.ts` directly and the re-export can go, which is a follow-up rather than a coordination problem.

---

#### RESOLVED: Runtime SVG fetching is a deliberate choice with a deployment consequence
The tiles are served from `src/public/` and fetched by relative URL rather than bundled, which is what lets an artist iterate without a rebuild. It also means four extra network requests at load, files that the bundler cannot hash or fingerprint, and a path that has to resolve correctly under a branch-deploy prefix. The prototype's comment says the relative path handles the last one; that should be verified on an actual branch deploy rather than assumed.

**Decision**: accepted, and the verification is now a requirement with a precise thing to check. The mechanism is confirmed: `terrain-textures.ts:13` uses `TILE_DIR = "terrain-textures/"`, a bare relative path assigned to `img.src`, so it resolves against the **document URL** and never consults webpack's `publicPath`, which `webpack.config.js:153` sets to `DEPLOY_PATH` for the HTML plugin. Those two mechanisms can therefore disagree, which is what makes the comment's claim worth testing rather than reading. Working it through: for `/branch/foo/index.html` and for `/branch/foo/` the relative path resolves to `/branch/foo/terrain-textures/...` and is correct; for a URL with no trailing slash it resolves one level up and 404s. One page load on a real branch deploy settles it. The count is also smaller than the finding assumed in one respect, since the four tiles are fetched once and packed into a single texture, but it is four requests either way.

---

#### RESOLVED: The texture loader breaks when the flag toggles at runtime, which is the one thing this story adds

`useTerrainTextures(enabled)` (`terrain-textures.ts:104-131`) was only ever exercised with a flag that never changes: the prototype reads `config.texturedTerrain` once, at page load. The switch turns that into a value a student flips repeatedly, and the hook does not survive it. Run against the prototype's real hook under Jest, with `enabled` driven false to true to false to true:

- **Switch off**: the effect cleanup calls `vegetationTiles.dispose()`, but nothing calls `setTextures(null)`, so the hook keeps returning the now-disposed `DataTexture`.
- **Switch on again**: the hook returns *that same disposed object* on the first render, before the reload resolves. `terrain.tsx:264` computes `textured = config.texturedTerrain && !!terrainTextures`, so the shader material is built pointing at a disposed texture and only swapped when the new load lands.
- **Every off/on cycle re-fetches and re-rasterizes all four tiles.** Fetch count went 4 to 8 across a single cycle. Nothing caches.

The tiles are immutable for the life of the page, so the fix is small: load once and keep the texture, gating only the *render* on the switch, rather than tying the loader's lifetime to it. That needs to be a stated requirement, because the natural reading of "the switch enables textures" is to pass the switch straight into `useTerrainTextures`, which is the broken shape.

**Decision**: accepted as stated, and now a requirement. The loader is driven by "has the feature been switched on at least once this page load", not by the live switch value, and the switch gates only whether the textured material is used. Loading once and retaining costs the 1.4 MiB computed above, which the memory finding already established is not the constraint.

Two consequences worth recording. It removes the disposed-texture window entirely rather than patching it, which is the shape this repo's own review standard prefers: make the bad state unreachable instead of detecting and recovering from it. And it makes toggling instant, which matters more than it first appears, because a control whose purpose is comparison ("what does this zone look like as forest?") will be flipped back and forth, and the alternative re-fetches and re-rasterizes four SVGs every time.

The same reasoning applies one level up, in `terrain.tsx`: `cellData` is a `useMemo` keyed on `textured`, so toggling also disposes and recreates both cell `DataTexture`s. Those are cheap next to the tiles but should follow the same rule.

---

#### RESOLVED: `simulation.config` is not observable, so "the feature flag the switch drives" cannot be `config.texturedTerrain`

The config triage above keeps `texturedTerrain` on the grounds that it is "the feature flag the switch drives", while the Requirements put the switch's state on `UIModel`. Only one of those can be the thing `terrain.tsx` reads, and the first is not available: `SimulationModel.config` is a plain, undecorated field (`simulation.ts:34`; `makeObservable(this)` at `:74` picks up only the `@observable` members listed at `:44-71`), assigned from `getResolvedConfig()`, which is `Object.assign` over plain objects (`config.ts:289-293`). Writing to it would change no observer's output, so a switch that sets `config.texturedTerrain` would not repaint the terrain.

**Decision**: the switch drives `ui.showVegetationKey`, and the config field survives as **the initial value of that flag**, default `false`. (It was later renamed from `texturedTerrain` to `showVegetationKey`; see the Requirements bullet on the naming.) Two alternatives were considered and rejected. Deleting the config field outright is the smallest change but throws away `?texturedTerrain=true`, which is the link this feature has been demoed with. Turning it into an availability gate, `{config.texturedTerrain && <VegetationKeySwitch />}` on the pattern `app.tsx:112` already uses for `showBurnIndex`, is the only option that lets an activity suppress the control, and nothing on the ticket or on either board suggests an activity would want to; adding the knob speculatively is what the config triage immediately above spent nine fields arguing against. As the initial value the field costs one line, keeps the demo URL working, and leaves intact the resolved decision that the switch is always available with no disabled state.

Recorded because it is the non-obvious half: config-gated *rendering* is fine in this codebase precisely because config never changes (`app.tsx:107-116` reads `config.topLines` and `config.showBurnIndex` inline), but config-gated *state* is not, and the difference is invisible at the call site.

---

#### RESOLVED: The prototype's demo-build version banner has no disposition

The rebase brings across a top-bar change nothing in this spec accounts for: `top-bar.tsx` renders `Wildfire Explorer: Textured Terrain - v0.2 - updated: 8/21/26` whenever `simulation.config.texturedTerrain` is true, with 21 lines of `.versionTag` / `.versionDate` styling in `top-bar.scss`. Technical Notes mentions the banner exists, in the course of establishing that the prototype contains no switch, but no requirement and no Out of Scope entry says to remove it. Left in and wired to whatever flag ends up gating textures, a build-identification string from an exploratory branch appears in the top bar for every student who turns the Vegetation Key on. Deleting both files' changes is the obvious call; it just needs to be written down, since "rebase and harden" otherwise carries them silently.

**Decision**: delete both files' changes, on the author's own instruction rather than this spec's judgment. PR #129 lists it under Known gaps: *"The version tag in the top bar is demo scaffolding and should be removed before any merge."* So the rebase drops `top-bar.tsx` and `top-bar.scss` entirely, taking the prototype to 10 changed files.


---

### QA Engineer

#### RESOLVED: The one thing that must not regress is the untextured path, and nothing asserts it
The requirement is that with textures off the terrain renders exactly as it does today. The prototype restructures `terrain.tsx` by +219/-42 to achieve that, which is a lot of surgery around a promise of "no visible change". There is no existing test over terrain rendering at all, so the whole guarantee rests on someone looking at it. A screenshot comparison of the default view before and after, on at least one preset, is the minimum.

**Decision**: accepted as stated and promoted to a requirement, including the "at least one preset" floor. The finding is right that nothing covers this: there is no test over terrain rendering anywhere in the suite, and there cannot usefully be a Jest one, since the output is a WebGL canvas. **Corrected 2026-08-27.** This finding originally reasoned that the screenshot should use a river preset because the river-color suppression *"is the one part of the restructure that touches the untextured path's output rather than just its code."* That is backwards: the suppression is gated on `baseColorOnly`, which is `textured`, so with the switch off it never runs and **nothing** in the restructure changes untextured output. See the river finding below. Michael reached the same conclusion by measurement rather than by reading, and PR #129 leads its verification section with it: *"With the flag off, the render is byte-for-byte identical to master - confirmed by pixel comparison, not by inspection."*

What survives is the comparison's shape rather than its rationale. Use a preset with a river and more than one zone, because that is the most informative view of the textured half, and include a post-burn state as well as the initial view, since the burnt and burn-index color paths are rewritten. The off-state half of the comparison is now a re-confirmation of something already measured once, which is worth doing after a rebase precisely because it was measured before it.

**Done 2026-08-27, exactly to that shape, and it passes.** `mountainsandplainsTwoZone`, terrain canvas only, `origin/master` against the rebased prototype with the switch off: identical in the initial view and identical in a burnt/burning state, 0 of 1,409,280 channel samples differing in each. The burnt half does not use a real fire, because unseeded randomness at terrain-load time would make it meaningless; see the Technical Note on how it was driven instead. Re-run before merge if the terrain code moves again.

---

#### RESOLVED: The tile contract has a checker, and the story should require running it rather than merely inheriting it
`measure-terrain-textures.mjs` exists and checks precisely the properties that fail silently: a background off 128 tints an entire zone and corrupts the drought coding the simulation uses to communicate, and a low-SD tile vanishes at distance. Neither is visible in review. If that script comes across but nobody is told to run it after a tile changes, it becomes a fixture nothing imports.

**Decision**: accepted verbatim; "run it after any tile change" is now a requirement rather than an implication. The finding names the exact repo failure mode ("a fixture nothing imports"), and this story is unusually likely to hit it, because a tile change is already scheduled: the shrub tile has been rejected and will be replaced at some point after this lands, quite possibly by someone who was not part of this work. The two properties it guards are also the two nobody can eyeball, since a background one value off 128 looks like nothing and a low-standard-deviation tile looks fine up close and vanishes at play distance. Worth noting it needs headless Chrome and an HTTP server, so it is a local command rather than a CI step as written.

---

#### RESOLVED: A texture-loading failure is designed to be silent, which makes it untestable in practice
The loader logs to console and falls back to the untextured terrain, which is the right behavior for a student. It also means a broken tile path in production looks identical to the switch being off. Given the tiles are fetched at runtime from a path that varies by deployment, that is the failure most likely to actually happen, and the least likely to be noticed.

**Decision**: accepted, and the two halves separate cleanly. The student-facing behavior stays exactly as the prototype has it, because degrading to the untextured terrain is correct and an error surfaced to a student would be worse than a missing texture. What the finding is really identifying is a *detection* gap, and it is addressed by the branch-deploy verification above rather than by changing the fallback: the failure mode it worries about is specifically the deployment-path one, which is a one-time check per deployment shape rather than a per-session risk. Worth adding one thing the loader already gives for free: it rejects with `failed to load terrain tile: ${url}` including the URL (`terrain-textures.ts:58`), so the console message identifies which path was tried, which is what makes the check a glance rather than an investigation.

---

#### RESOLVED: The required "unit test pins the derivation" cannot test the derivation

Requirement: *"A unit test pins the derivation against those five hexes ... Changing a contrast target or a drought color turns it red."* `wfInk` and `wfRatioFor` are **GLSL**, living inside a template literal in `terrain-shader.ts` (`FRAGMENT_DECL`, lines 124-167). Jest runs on jsdom (`package.json:7`) with no WebGL context and no headless-gl dependency, so no Jest test can execute them. The only test that can exist is a TypeScript reimplementation of the same arithmetic.

That test was written during this pass to check the claim, and it does reproduce all five hexes to the byte (`#004001`, `#2D460B`, `#424F12`, `#241B06`, `#B3B3B3`), so the spec's technical assertion is confirmed. But it is about thirty lines duplicating the shader in another language, and **it would keep passing if someone edited the GLSL**, which is the one mutation the requirement exists to catch. As written the requirement produces a test that cannot fail on its own subject.

**Decision**: keep the TypeScript reimplementation and **reword the requirement to what it guards**, rather than changing the shader to suit the test.

The finding overstated the problem in one respect, and the correction matters: the requirement's own named mutations, *"changing a contrast target or a drought color"*, **are** caught, because the test imports `terrainGlyphContrast` from config and `getTerrainColor` from `terrain-colors.ts`. Only an edit to the GLSL body escapes it. That is also the mutation least likely to happen unseen, since nobody rewrites `wfInk` without looking at the terrain; whereas retuning a contrast value is a one-character change that silently ships a different green. The test covers the plausible failure and misses the implausible one.

Moving the derivation into TypeScript and passing five precomputed inks as uniforms was the attractive alternative, and the code rules it out. `wfGlyphSurface` is called with `diffuseColor.rgb`, the **interpolated** vertex color, so across a zone boundary the base is a blend of two drought colors over one 500 ft cell. Evaluated over that blend, continuous derivation and nearest-of-four precomputation diverge by up to **23/255**, and a zone boundary is exactly where two vegetation textures meet. The performance argument does not rescue it either: the two `wfInk` calls are about 40 ALU ops against roughly 20 `wfHash` evaluations (~200 ops) for the burn-edge and macro noise, so `wfInk` is about 15% of the shader's arithmetic and is not where the Chromebook cost lives.

A rendered-pixel harness would cover the formula properly, and there is none; Cypress is the only WebGL-capable runner here and needs `CI=true` locally to work at all. Michael did perform that check by hand once, and the result is the on-screen column in PR #129's table. That is precisely the evidence that does not survive: it is a number in a PR body, and nothing re-runs it.

---

#### RESOLVED: The river-down-the-side fix only applies when textures are on, and the finding that justified the screenshot preset says the opposite

Requirement: *"Textures over the river are suppressed, and the river color no longer stretches down the sides of the model."* The first clause is unconditional in the code; the second is not. `updateColors` passes `baseColorOnly = textured` (`terrain.tsx:154`), and the river suppression is `baseColorOnly && isNearTerrainEdge(cell, simulation)`, under a comment that states the intent plainly: *"Gated on the textured path so the untextured render stays byte-identical to the unmodified app."* Master's `terrain.tsx` has no edge handling at all (`:132-133` colors any `cell.isRiver` unconditionally). So with the switch off, which is the default, the river still interpolates its blue down the side of the model exactly as it does today.

That may well be the right behavior, since it is what keeps the off state byte-identical. But the requirement reads as an unconditional fix of one of the ticket's "other fixes", and a reader checking it against the default view would find it absent.

It also corrects the QA finding above it. *"The one thing that must not regress is the untextured path"* concluded that the screenshot should use a river preset because the river suppression *"is the one part of the restructure that touches the untextured path's output rather than just its code."* It is the opposite: it is gated out of the untextured path specifically. Nothing in the restructure changes untextured output. A river preset is still a sensible choice for the textured half of the comparison, but the stated reason is wrong and should not survive into the PR.

**Decision**: keep the gate, and reword the requirement to match. Three things settle it.

The ticket is describing the prototype, not requesting an independent fix: its "other fixes" block runs *"stretched textures on the sides of the model are hidden/removed / textures over the river are hidden/removed / the river was also stretching on the sides; hidden/removed now"*, in the past tense, with the first two items inherently about textures.

The residual is tiny. Measured live on `mountainsandplainsTwoZone`, 5 of 498 river cells sit on the perimeter, so the default view keeps two blue smears of roughly 1,000 to 1,500 ft on an 80,000 ft edge, and the default camera is near top-down: reaching them takes a deliberate orbit toward the 0.4pi `maxPolarAngle`, about 18 degrees above the horizon.

The gate is what buys byte-identity, which is the strongest safety property available for merging 1,678 lines that restructure the terrain renderer, and which Michael verified by pixel comparison rather than by eye. Ungating it would trade that for two smears of a pre-existing master artifact that nobody has reported, in the render path every existing activity uses. Doing it as its own commit, so the comparison runs one commit earlier, was the considered middle option and was rejected on the same reasoning: the benefit does not justify touching the default render at all.

---

#### RESOLVED: "The shipped colors stay the designer's" is true of the material color only

The five hexes are what the fragment shader hands the material, before lighting. The prototype's own config comment is explicit: the hemisphere light scales the scene by roughly 0.19 to 0.35x depending on slope, and *"a material ratio of 6 lands nearer 2.5:1 on screen"*. So no pixel a student sees is `#004001`. This matters for two of the requirements at once: it is why the pinning check has to be a unit test rather than a screenshot, and it is why a reviewer eyedropping the running app against the ticket's hex list will find a mismatch and be right to. One clause in the requirement saying the hexes are pre-lighting material colors would prevent that.

**Decision**: accepted, and the clause is now a requirement in its own right, carrying Michael's measured values rather than an estimate. PR #129 samples the rendered frame and reports the on-screen pairs: `#02D40A` renders `#09850A` with its stroke at `#002D00`, and burnt `#333333` renders `#20201D` with its stroke at `#6E6C65`. The light costs about 64% of the luminance and the ratios land at 3.09 to 3.49:1 against the configured 6 and 7. So a reviewer eyedropping the app will find no pixel matching the ticket's list, and will be right to.


---

### Performance Engineer

#### RESOLVED: The Chromebook target is asserted in a comment and never measured
The channel-packing decision is justified as mattering "on the Chromebooks this sim targets", which is a real constraint, but nothing in the prototype records a measurement on that hardware. The work added per fragment is not trivial: a texture sample, a four-way distance comparison, two `wfInk` evaluations, noise for the burn edge, and a slope fade. The sim runs a per-frame cell update loop whose timestep clamps on slow frames (see WM-40), so a frame-rate hit could in principle change model pacing as well as smoothness. **Re-derived from the code 2026-08-27, that turns out to be true only below 15 fps**; see the correction in the findings.

**Findings:** the per-fragment inventory holds up on a full read of the shader, and the interaction with WM-40 is real and worth quantifying before anyone measures. Each `wfInk` call is a luminance dot product, four divisions and a branch, and it runs twice per fragment (once against the drought color, once against burnt) plus `wfRatioFor`'s four distance calls, on top of the tile sample, the burn-edge noise and the slope fade. **CORRECTED 2026-08-27, re-derived from `simulation.ts:469-495` rather than carried over from WM-40's notes.** The claim this paragraph used to make, that the `maxTimeStep` clamp *"starts binding at roughly a 1s frame at 1x and 0.5s at 2x, so a frame-rate regression at 2x degrades the model's pace toward 1x"*, is wrong in both halves, and correcting it shrinks the whole concern:

- **The sim is real-time-locked, not frame-locked.** `timeStep = Math.min(maxTimeStep, optimalTimeStep * 4, ratio * realTimeDiffInMinutes)`, and that third term is elapsed wall-clock. A slower frame rate takes proportionally bigger steps and the run still consumes the same real seconds, so **frame rate does not affect model pace at all** until a clamp binds.
- **The clamp that can bind is `optimalTimeStep * 4`, at a 66.5ms frame, i.e. about 15 fps** - not 1s. At the default `modelDayInSeconds: 8` it equals 11.97 model-minutes.
- **`maxTimeStep` (180) is unreachable.** 11.97 is always the smaller of the two, so 180 can never win the `min`; it would need `modelDayInSeconds` under about 0.53s.
- **The threshold does not depend on the speed setting.** The comparison is `ratio * realTimeDiff` against `ratio * 0.001108`, and `ratio` cancels, so 2x is no worse than 1x. This holds as long as WM-40 implements speed through `ratio` (i.e. `modelDayInSeconds`); if it instead runs multiple ticks per frame, re-derive.

**So the open item collapses to one binary**: does textured terrain push a Chromebook below 15 fps? Above that there is no pacing consequence and the cost is smoothness alone, on a feature that is off by default. Below it, the run genuinely stretches. Two mitigations are already in the design and should be part of what gets measured rather than assumed: the feature is off by default, so the untextured path carries none of this cost, and the packing means one sample rather than four. What cannot be done from here is the measurement itself, which needs the target hardware.

**Routed to**: Doug

**Why it needs them**: it is a request to run a check on target hardware, so the call is whether it happens in this story, as a follow-up, or not at all.

**A Chromebook is available (2026-08-27), which changes the cost of settling this.** Combined with the correction above, this is no longer a measurement exercise with an ambiguous pass mark: it is one threshold. Load the prototype's demo build on the Chromebook with `?texturedTerrain=true`, run a fire, and read frame time. **Clear 66.5ms (15 fps) and the item closes outright** rather than becoming a follow-up ticket, because above that threshold the feature costs smoothness only and is off by default anyway. There is no need to compare against the flag-off run, and no need to test at 2x, since the threshold is speed-independent.

**MEASURED 2026-08-27, on the target hardware. The answer is that it does not clear the threshold, and the cause is not the shader.**

The prototype's own demo build was proxied through a local instrument that injects a self-driving probe (4s idle sample, place both sparks, Start, 10s burning sample) and reports back. Run on a Chromebook (Intel UHD Graphics 600, GLK 2, viewport 1241x529, DPR 1.10) and on an Intel Iris Xe desktop:

| device | mode | idle median | burning median | burning fps | p95 | frames over 66.5ms |
|---|---|---|---|---|---|---|
| Chromebook | **textured** | 16.7ms | **83.7ms** | **11.9** | 94.9ms | **100%** |
| Chromebook | plain | (discarded) | 36.8ms | 27.2 | 50.6ms | 1.2% |
| Desktop | textured | 16.8ms | 37.3ms | 26.8 | 51.6ms | 0.4% |
| Desktop | plain | 16.7ms | 18.2ms | 54.9 | 27.5ms | 0% |

(The Chromebook's plain *idle* sample read 8956.8ms, which is `requestAnimationFrame` throttling in a backgrounded tab during the ngrok interstitial. Discarded; the burning sample is clean.)

**The binary this item reduced to comes out on the wrong side.** The Chromebook is under the clamp without textures (1.2% of frames over 66.5ms) and never under it with them (100%). So the clamp binds continuously and the run genuinely stretches: the same fire takes longer in model time with the Vegetation Key on. The earlier reasoning that "the feature is off by default, so the cost is smoothness alone" does not hold for a student who turns it on.

**The cost is per-cell CPU work, not the fragment shader.** Two independent lines of evidence. First, the textured/plain ratio is 2.27x on the UHD 600 and 2.05x on the Iris Xe; those GPUs differ enormously in fragment throughput, and a fragment-bound cost would not produce near-identical ratios. Second, a direct discriminating experiment: `config.gridWidth` is a plain field a URL param can set (unlike `simulation.gridWidth`, the computed wrapping it, which is the subject of the correction below), so quartering the cell count to 9,600 while holding model size, camera and therefore screen coverage constant leaves fragment cost per frame unchanged. On desktop the textured-minus-plain difference collapsed from **19.1ms to zero** (textured 16.7ms, plain 16.7ms, both vsync-capped), i.e. at least 20.6ms of the textured path's cost was per-cell and none of it was per-fragment.

**CORRECTED 2026-08-27, by measuring the two functions directly instead of inferring them from frame time. The culprit is not `updateBurnState`.** The paragraphs this replaces reasoned that `updateColors` runs in both paths and therefore cancels out of the difference, leaving `updateBurnState` as the only textured-only per-tick work, and priced an incremental rewrite of it at "essentially all" of the 46.9ms. Both halves are wrong. An instrumented build that times each function per tick reports:

| path | `updateColors` ms/tick | `updateBurnState` walk ms/tick |
|---|---|---|
| plain, desktop | 17.19 | - |
| textured, desktop | 30.80 | 5.69 |
| textured, Chromebook | 58.06 | 11.32 |

`updateColors` does not cancel. It costs **13.6ms/tick more in the textured path** than in the plain one on desktop, despite doing strictly less color work there, since `baseColorOnly = true` skips the burning and burnt branches. The extra is `isNearTerrainEdge`, which the `baseColorOnly &&` short-circuit evaluates only on the textured path, exactly as the river-suppression gate intends. It is roughly **87%** of the whole textured-minus-plain gap. `updateBurnState`'s walk is the remaining 13%, and its `DataTexture` re-upload is **free**: filling the buffer and never setting `needsUpdate` was not faster, which is unsurprising for a 153,600-byte upload with no mip chain (`minFilter = LinearFilter` suppresses `generateMipmap`).

**What makes the predicate expensive is unobserved MobX computeds, not its arithmetic.** Micro-benchmarked in the live page over all 38,400 cells, Intel Iris Xe:

| | ms |
|---|---|
| `isNearTerrainEdge` as written (5 `simulation.isTerrainEdge` calls per cell) | 15.0 |
| the identical arithmetic with `gridWidth`/`gridHeight` hoisted into locals | 2.0 |
| 10 reads of `simulation.gridWidth`/`gridHeight` per cell, nothing else | 14.0 |
| 10 reads of `simulation.config.gridWidth` per cell (plain object) | 1.9 |

See the Technical Note on unobserved computeds for the mechanism.

**The fix, measured on the target hardware rather than projected.** Precomputing the near-edge predicate into a `Uint8Array` mask, which renders pixel-identically to the uncached predicate (640x800, diff bounding box `None`):

| Chromebook run | burning median | fps | frames over 66.5ms |
|---|---|---|---|
| textured, as the prototype has it | 82.2ms | 12.2 | **100%** |
| textured, edge predicate cached | **39.0ms** | 25.6 | **0%** |
| plain, dims hoisted | 28.6ms | 35.0 | 0% |
| textured, cached, `updateBurnState` deleted entirely | 36.0ms | 27.8 | 0% |

The second row closes the item: the clamp never binds, so the Vegetation Key no longer stretches model pacing, and nothing in `updateBurnState` had to change to get there. The fourth row prices the rewrite this finding used to require: deleting the function outright, the ceiling of any incremental scheme, is worth **3ms** against a threshold already cleared by 27ms. The walk measures 11.9ms/tick on that device but only 3ms of it reaches frame time, so it is not on the critical path.

**The same trap is already in master, at one fifth the multiplier.** `updateColors` passes `simulation.gridWidth, simulation.gridHeight` per cell on master too, so the untextured path every existing activity uses spends about 9.3ms/tick on the same recomputes. Hoisting the three reads, changing no output, takes the untextured Chromebook burning median from **36.8ms to 28.6ms**. That is a real improvement to the default view and it is not this story's bug. **Resolved: it lands in this PR, as its own commit**, because this story rewrites the very argument list the fix edits, so a separate PR would collide with this branch in those lines. See the resolved open question for the reasoning and for the cost that decision carries.

**Decision**: still a requirement of the story, and still not a follow-up, but a different and much smaller change than the one this finding originally specified. Stop reading the two computeds inside the per-cell loops. The incremental `updateBurnState` and the skipped textured `updateColors` are both dropped: the first buys 3ms, and the second is unsafe as stated because `isFireLineUnderConstruction` does change mid-run. The harness is reusable and now runs against a local build rather than the public demo, so it can confirm the change on the same device.

**What would reverse it**: nothing outstanding. The concern that opened this finding is measured closed on the hardware that raised it.

---

#### RESOLVED: 512 x 512 x RGBA held for the life of the page, plus mipmaps and anisotropy
That is a megabyte of texture memory plus mip levels, which is unremarkable on a desktop and worth a glance on a low-end Chromebook, particularly alongside the existing terrain geometry. The loader disposes correctly on unmount and on cancel, which is good; the question is only the steady-state cost when the switch is on.

**Decision**: computed, and it is not a concern. One 512 x 512 RGBA texture is exactly 1.0 MiB, and a full mip chain adds about a third, so the steady-state cost is roughly **1.4 MiB** while the switch is on and zero while it is off. The four rasterization canvases are transient and released after packing. For scale, that is a fraction of what the terrain geometry itself occupies, and it is a single allocation rather than four, which is the packing decision paying off in memory as well as in sampler count. The finding's own framing was that it was "worth a glance"; the glance has been taken and memory is not where the Chromebook risk lived. Nor, as it turned out, was the fragment shader: the cost was per-cell CPU work, and specifically unobserved MobX computed reads. See the finding above.

---

### Product Manager

#### RESOLVED: This story is the reason three other stories are moving, and its own scope note is one clause
The bottom bar is being rearranged because the Fire Intensity Scale has to leave to make room for this switch. That makes WM-48 the cause of WM-52 and a contributor to WM-47's spacing rework, and the only trace of that on this ticket is the half-sentence "this means removing the Fire Intensity Scale from the bottom controls". Anyone reading WM-48 alone would not know it had set three other stories in motion.

**Decision**: accepted; the relationship now leads the Overview rather than sitting in Out of Scope. One refinement from the other stories' own passes: "cause" is right for WM-52 and overstated for the other two. WM-52's spec confirms the scale leaves to free bar space; WM-47's tightening was justified by a condition WM-52 then deletes, so this story is an indirect contributor there rather than the driver; and WM-40 shares the row without depending on this at all. Also worth recording alongside it, from WM-47's measurements: no intermediate arrangement of the four stories overflows the bar at a 950px viewport, so the coupling is about how the row looks between commits, not about whether it works. Re-measured against post-WM-47 master, that holds and is more precise than "looks": inserting this switch takes `.mainContainer` from 481 to 576 and drives `.rightContainer` to its 194px content width, at which point the row stops being centered. It still fits; it stops being symmetric. Editing the ticket to say any of this is yours.

---

#### RESOLVED: The description's implementation block is precise about colors and silent about the switch
It gives four stroke hexes to six digits and then describes the entire new control as "a new switch is introduced to the bottom controls (to the right of Setup button)". The switch is the part with no prototype behind it and the part that lands in a contested row. The specificity is inverted relative to the risk.

**Decision**: the observation is right about the description and the inversion is now largely undone by this spec, from both ends. The colors turned out to need no decision at all, since the six-digit hexes are a transcription of what the shader already computes, so the description's most precise passage is also its least load-bearing. The switch, meanwhile, is now specified as fully as the colors were: position (between Setup and Spark, not merely right of Setup), a 90/92px widget, a 70 x 34 two-line label, a 28 x 10 track, the `slider-thumb-small.svg` thumb, the always-available rule, and the resolved decision to build it rather than reach for MUI. So the remaining risk in the switch is not underspecification but that it lands in a row three other stories are changing, which is the sequencing question those stories share.

---

#### RESOLVED: "It stops being centered" does not survive measurement; the row is already off center, and the switch reduces the offset

The Requirements promote this into a PR-body obligation: *"The PR body calls out the bottom-bar centering change explicitly, with its numbers ... named as the change to review."* Re-measured live at 950 x 880 on `?preset=plainsTwoZone&hazbotRules=25`, by cloning a 92px widget group into place between Setup and Spark:

| | `.mainContainer` | `.leftContainer` | `.rightContainer` | main's center vs viewport center |
|---|---|---|---|---|
| master today | 481 | 244.5 | 224.5 | **+10px (right of center)** |
| with the switch | 576 | 180 | 194 | **-7px (left of center)** |

Every width the spec quotes is exactly right. The conclusion drawn from them is not. `.mainContainer` is **not centered today**: it sits 10px right of the viewport center, because `.leftContainer`'s natural content is wider than `.rightContainer`'s. Inserting the switch moves it 7px to the *left* of center, so the magnitude of the offset goes from 10px to 7px. The switch does not break centering; the row was never centered, and by this measure it gets marginally more symmetric.

What *is* real, and is the part worth keeping, is the floor: `.rightContainer` stops at 194 because that is its content width (Hazbot button 122 + 10px gap + fullscreen 62), so from there on any further growth in the row comes out of `.leftContainer` alone. That floor is what the next finding is about. Note also that 194 only holds when a Hazbot rule-set is loaded; without one, `.rightContainer`'s content is the 62px fullscreen toggle alone and the arithmetic is different.

**Decision**: correct the claim and rewrite the requirement built on it. The requirement previously obliged the PR body to call out "the bottom-bar centering change" as the thing to review; as measured there is no centering change to call out, and asking a reviewer to check a symptom that does not exist wastes the one instruction the PR body gets to give. What the PR body should name instead is the **`.rightContainer` floor**: inserting the switch drives it to its 194px content width, after which the row can only absorb further growth from the left. That is the durable fact, it is what WM-40 will run into next, and it is checkable.

---

#### RESOLVED: "The bar does not overflow" was measured at one viewport, and the switch moves the threshold by 95px

Technical Notes: *"The bar does not overflow (`scrollWidth` stays 950)."* True, and it is also the only viewport tested. The bar's minimum non-overflowing width is `leftMin + mainContainer + rightMin`, where `leftMin` measures 53.3 (small logo plus padding; the logo swaps at the 960px media query in `bottom-bar.scss:326-335`) and `rightMin` is the 194 above. Measured directly by shrinking the viewport:

| Row | Minimum viewport | At 800px |
|---|---|---|
| master today | ~729px | fits |
| + Vegetation Key (92) | **~824px** | overflows by 23px |
| + Vegetation Key + a second 92px widget (WM-40 stand-in) | **~918px** | overflows by 118px |

So the switch costs about 95px of usable viewport, and the speed control landing in the same row would bring the floor to within roughly 30px of the 950 the spec measured at. The existing note that *"no intermediate arrangement of the four stories overflows the bar at a 950px viewport"* holds at 950 and stops being reassuring just below it. Whether that matters is a real question rather than a rhetorical one: it depends on the narrowest viewport these activities actually run at, which nothing in this spec records, and the design board frames the model inside a 640px-wide Activity Player column, where the bar already overflows by 88px on master today. That last part is a pre-existing condition and not this story's to fix, but it is the reason the threshold is worth stating rather than a single pass/fail at 950.

**Decision**: record the thresholds in Technical Notes, and take no action beyond that. The Chromebook frame-time run supplied the missing fact as a side effect: it reported a real-world viewport of **1241 x 529** on the target device, which clears the post-switch 824px threshold by more than 400px. And the design board's 640px Activity Player frame is a layout mock rather than a runtime constraint, since the bar already overflows by 88px at 640 on master today, which would be a live bug if activities ran that narrow.

So the arithmetic is worth writing down, because WM-40 inherits it and lands within roughly 30px of the viewport the original claim was measured at, but nothing here needs to change. Naming a minimum supported width and requiring the row to fit at it was the considered alternative; it would invent a constraint from one data point, and the one data point we have is comfortable.


---

### Student

#### RESOLVED: A key that is off by default is a key most students will never see
The feature exists because students could not tell what vegetation they were looking at. Defaulting it off means the default experience still cannot tell them, and discovering the switch requires noticing an unlabeled-by-purpose toggle in a row of controls (seven widget groups on master today, eight once this switch lands, nine if WM-40's speed control also does). That is the decided behavior and there are good reasons for it, but it is worth being explicit that the workshop complaint is only answered for students who find the switch.

**Findings:** the discoverability is a little better than "unlabeled-by-purpose" suggests, and the underlying tension is real and now decided in one direction twice over. The control is not unlabeled: the board gives it a two-line "Vegetation Key" label in the same Lato Bold 14px every other control uses, so it reads as a named thing rather than a bare toggle, and at 92px it would be the **widest** widget in the row (measured on master after WM-47: Setup 84, Clear All 68, Fireline and Helitack 67, Spark, Restart and Start 62). What remains true is the finding's core point: a student who does not touch it sees the same flat terrain that prompted the workshop complaint. Worth carrying into any reconsideration that the default-off decision has now been recorded three ways (Trudi's reversal settling on off, the description, and the board's default row drawing the thumb left), so this is a request to revisit a settled call rather than an unanswered question, and the counter-argument it would have to beat is that the plain model is the default view the rest of the design assumes.

**Routed to**: Trudi

**Why it needs them**: whether the default view should answer the workshop complaint on its own is a pedagogy and product-scope call about what a student sees.

**Skipped in the second pass as unanswerable by evidence**: no measurement can say whether students will find the switch or whether the plain model should be the default. The only facts worth carrying are already above (the control is labeled, it is the widest widget in the row at 92px, and default-off is recorded three independent ways). WM-49 carries the same shape of question about its collapsed-by-default zone labels, and WM-53 inherits this one on the Setup panel's wind screen, so a single answer covers all three.

**Decision (Trudi, 2026-08-27): default off, and the URL param is a first-class authoring parameter rather than a demo hook.** Her words: *"I agree with Michael on all of these. By default, we cannot have the veggie key on as it would mess with the OG version of the model (though, I think at this point, we are going to have to go into the module and make a lot of edits -- @apallant said she would help with that). However, I would like a URL param to turn the veggie key on for some of these new Hazbot enabled tasks."*

Two things change as a result, and the second is the one with teeth.

**The reason for default-off is now backward compatibility, not pedagogy.** The three recordings above (Trudi's earlier reversal, the description, the board's default row) all read as product preference, which is the kind of call a later reviewer can reopen. This one does not: turning the key on by default would change what the already-published module renders for existing activities. That makes default-off a constraint rather than a preference, and it is why the discoverability tension this question raised is accepted rather than resolved. The curriculum-side edits Trudi mentions, with Ann Pallant helping, are module authoring and are out of scope here.

**The config field is being asked for as a feature, so it stops being a leftover.** The spec already keeps the field as the initial value of `ui.showVegetationKey`; what is new is that activity authors will be handed URLs that set it, for Hazbot-enabled tasks. Verified live: `?showVegetationKey=true` opens with the switch drawn on, the tiles fetched once, and the terrain textured, and the switch still toggles off from there, so it is genuinely an opening state and not a gate. Two things followed and are requirements above: the field is renamed from the prototype's `texturedTerrain` to sit in the `show<Thing>` family authors already know, and the demo version banner comes out, since it was gated on the same field and would otherwise have appeared on every activity opening with the key on.

---

### Visual Design Reviewer

#### RESOLVED: The switch's ON appearance is not specified anywhere in this spec

The geometry table in Technical Notes documents the control exactly, and documents only its **off** state: *"Track 28 x 10, `#d8d8d8`, 1px `#797979` inside, radius 11"* and *"Thumb: the 'Slider Thumb Small' asset"*. The board specifies the on state too, and it is more than a thumb slide. Read off the *Updated Wildfire Controls and Labels* board, the states column at x=479 has four on-variant rows (y 1145, 1231, 1317, 1403) against four off-variant rows (y 769, 855, 941, 1027):

| | Track fill | Thumb left edge | Track left edge |
|---|---|---|---|
| Off | `#d8d8d8` | 400 | 409 |
| On | **`#2997ff`** | **418** | 409 |

So the track turns blue and the thumb travels 18px, overhanging the track by 9px at whichever end it rests. Neither the fill change nor the travel distance appears in this spec, and the fill change is the switch's primary "it is on" affordance: at a 28 x 10 track, an 18px thumb move is a small signal on its own.

The same column also specifies hover and select, as *"Hover / icon outline 50% op"* and *"Select / icon outline 100% op"*, in both the on and off variants. The spec quotes the fourth row of that column (the "Disabled (may not need)" note) to settle the default-value question and does not carry the other three into requirements. Since this is a control type the repo has never built, the states are the part most likely to be dropped.

The one thing the spec did read off this column holds up, and is worth confirming rather than revisiting: "Default On" does name a variant. It labels the first row of the **on** column, whose track is blue, while the off column's rows carry the plain "Default / Hover / Select / Disabled" labels every other control uses. The resolved decision that textures default to off is unaffected.

**Decision**: accepted; the on state and the interaction states are now specified in Requirements rather than left to the implementer. The board's numbers are the source, and the geometry table in Technical Notes now covers both states instead of only the off one. The fill change is the load-bearing part: at a 28 x 10 track an 18px thumb travel is a weak signal on its own, and the `#d8d8d8` to `#2997ff` swap is what actually reads as "on" at bottom-bar scale.

---

#### RESOLVED: A second Zeplin board is the designer's source for this story, and the spec does not cite it

Technical Notes says: *"Layout numbers come from the Updated Wildfire Controls and Labels board (.../screen/6a8566a1c90489f7be36e66a). Nothing here is reconstructed from screenshots."* There is a second board in the same project, **"Updated Wildfire Setup Panel and Terrain Textures"** (`.../screen/6a8599f5f464e141fcb7b53b`), which is where the terrain-texture design actually lives. It carries three things this spec needs:

**1. The four tiles, as exportable SVG assets** named `grass`, `shrub`, `forest`, `forest-with-suppression`, matching the prototype's filenames. Downloading all four and rasterizing them at 512 against the branch's copies through headless Chrome: **zero pixels differ by more than 8/255** (max delta 2, from anti-aliasing), on every tile. All four also independently satisfy the checker's contract, with modal background 128 and standard deviations of 29.1 / 31.3 / 28.3 / 36.0 against its floor of 12.

That closes the shrub question harder than the spec managed. The open item currently establishes that *the branch* has not changed since 2026-08-21; this establishes that **the design board carries the same cloud-like shrub**, so no revision exists anywhere, not merely un-merged. It also names the swap channel: pull the asset from this board into `src/public/terrain-textures/` and run the checker, which is the whole of a tile replacement.

**2. A color table in which the five hexes are authored, not derived.** Columns "Assigned Color" and "Visual Display of Color", each split into "Texture" and "Terrain", with rows No drought / Mild / Medium / Severe / Burnt. The Assigned Color / Texture swatches are 50 x 50 shapes filled `#004001`, `#2d460b`, `#424f12`, `#241b06`, `#b3b3b3`; the Terrain column beside them holds `#02d40a` through `#333333`, matching `getTerrainColor` and `BURNT_COLOR` exactly.

The technical conclusion in the resolved color question is unaffected, and was re-verified independently during this pass: the derivation reproduces all five to the byte. But the provenance claim attached to it is wrong. The spec says the ticket's list *"is a record of the prototype's output, which is also weak evidence about which came first: the numbers could only have been written by reading them off the running prototype."* They could also have been written by reading them off a design board, which is where they sit, in a column headed "Assigned Color". That is not a small distinction: it makes the five hexes a design contract the derivation currently happens to satisfy, which is an argument *for* pinning them rather than a reason the pinning is redundant.

**3. Setup-panel variants labeled "with Vegetation Key ON"**, for both the Conditions and Wind screens in 2-zone and 3-zone, plus the note *"these are implemented at 0.5x in the Setup screens"*. The resolved persistence question already records that WM-53 reads this flag, so the scope split is right; what is new is that the board fixes the Setup panel's texture scale, which is a fact WM-53 needs and which is currently recorded in neither spec.

**Corrected 2026-08-27.** This finding originally read the 0.5x note as the texture scale, "half the terrain's", and that is wrong twice over. The note sits under the board's exportable **terrain** images, which are drawn at 2x against the repo's 1x PNGs, so it describes those assets rather than the tiles. And the texture scale it was taken to state is not 0.5x: the Setup tile is **112.5px from the 256px source**, or 0.44x, which WM-53 measured off the board three independent ways and Michael confirmed as the authored value the same day. See the Technical Note.

**Decision**: cite the board in Technical Notes as a source alongside the Controls board, correct the provenance sentence in the resolved color question, and carry the Setup tile scale across to WM-53 (112.5px, not the 0.5x this finding first read off the note). The colors themselves do not change: the derivation was re-verified independently this pass and still reproduces all five hexes to the byte. What changes is their status. They are **authored design values that the derivation happens to reproduce**, not a transcript of shader output, and that is the argument for the pinning test rather than against it, since a drift in the derivation is now a drift away from a design contract rather than a change of mind about a tuning dial.

The shrub half of this finding fed the resolved shrub question above and is not repeated here.
