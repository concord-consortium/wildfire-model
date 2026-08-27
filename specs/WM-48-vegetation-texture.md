# WM-48: Add texture to represent vegetation in the model

**Jira**: https://concord-consortium.atlassian.net/browse/WM-48

**Status**: **Closed**

## Overview

The 3D terrain gains a per-vegetation-type surface texture, so grass, shrub, forest and forest-with-suppression read as different ground rather than as four shades of the same flat color. The textures are off by default behind a new "Vegetation Key" switch in the bottom bar, between Setup and Spark. A working prototype existed on PR #129 and rebased onto master without conflicts.

**This story is the reason three others are moving.** The switch needs bottom-bar space that the Fire Intensity Scale occupied, which is what WM-52 removes and what WM-47's spacing rework is partly sized against; WM-40's speed control lands in the same row.

Teachers at the ISLAND workshop asked to see the vegetation in the model, not just infer it from a zone label. The model's scale is far too large to draw individual trees or blades of grass, so the approach is an abstract map symbol per vegetation type, repeated across the ground the way a paper map hatches a forest.

## Requirements

- Each of the four vegetation types (grass, shrub, forest, forest with suppression) renders a distinct texture on the terrain.
- Glyph stroke width is authored at **3px** in the tile SVG.
- **Glyph stroke color is derived per fragment from the terrain color and a contrast target, and that derivation is what produces the five colors the ticket specifies.** Evaluated in the shader's linear working space at `terrainGlyphContrast: [6, 6, 6, 7]` and `terrainGlyphContrastBurnt: 6`, `wfInk` reproduces `#004001`, `#2D460B`, `#424F12`, `#241B06` and `#B3B3B3` exactly.
- **A unit test pins `terrainGlyphContrast`, `terrainGlyphContrastBurnt` and the four `getTerrainColor` values against the five board-authored hexes.** It reimplements `wfInk` in TypeScript, because the shipping copy is GLSL and Jest has no WebGL, so it guards **the inputs, not the formula**: retuning a contrast target or nudging a drought color turns it red, editing the GLSL does not. The GLSL carries a comment naming the test as its mirror.
- **The five hexes are material colors, before lighting.** The scene's hemisphere light costs roughly 64% of the luminance, so the rendered stroke over no-drought terrain samples `#002D00`, not `#004001`, and the contrast ratios land at 3.1 to 3.5:1 rather than the configured 6 and 7. Nobody should expect to eyedropper `#004001` out of the running app.
- **Textures are hidden by default.** A switch is added to the bottom controls, **between the Setup and Spark buttons**, labeled "Vegetation Key".
- The switch is always available: it has no disabled state.
- **The switch's on state turns the track `#2997ff` and moves the thumb 18px.** Hover and select follow the board's other controls: icon outline at 50% opacity on hover, 100% on select, in both the on and off variants.
- **The switch's state is `ui.showVegetationKey` on `UIModel`, and that flag, not `config.showVegetationKey`, is what `terrain.tsx` reads.** `simulation.config` is a plain object that nothing writes at runtime, so a switch setting a config field would repaint nothing.
- **`ui.showVegetationKey` is initialized from `config.showVegetationKey`**, which stays `false` by default. `?showVegetationKey=true` is a supported authoring parameter, not a demo hook. It sets an opening state rather than a hard gate, so the switch still toggles off from there. Default-off is a backward-compatibility constraint, because the key on by default would change what the already-published module renders.
- **The config field is named `showVegetationKey`, not the prototype's `texturedTerrain`.** It joins the existing `show<Thing>` family in `config.ts`, and makes the config key, the MobX flag and the on-screen label one name instead of three. Documented in `CLAUDE.md`'s URL-param table.
- **The prototype's demo version banner does not reach `top-bar.tsx` or `top-bar.scss`.** Both files are byte-identical to master.
- **The switch's state persists across both Restart and Clear All**, following the `ui.showChart` precedent. Neither `handleClearAll` nor `simulation.reload()` touches it.
- **The switch is purpose-built in the bottom bar, reusing `slider-thumb-small.svg`**, not an MUI `Switch`.
- Stretched textures on the vertical sides of the model are suppressed.
- Textures over the river are suppressed.
- **The river color no longer stretches down the sides of the model *when textures are on*.** Deliberately gated to the textured path, so the switch-off render stays byte-identical to master. The residual in the default view is a pre-existing master artifact and is not fixed here.
- With the textures off, the terrain renders through the existing vertex-color path unchanged, verified by pixel comparison rather than inspection.
- Texture loading failure degrades to the untextured terrain rather than breaking the view.
- The tile URL resolves correctly on a branch deploy.
- **The story ships as one PR, with the terrain work, the switch work and the untextured-path performance fix as three separate, clearly named commits.** The performance commit touches the default render path and stands alone deliberately, so it can be reviewed and if necessary reverted without disturbing the feature.
- **The PR body calls out two things explicitly, with their numbers: the untextured-path performance commit and the bottom-bar row change.** On the first, say that it changes the default render path's speed and not its output, give the 36.8ms to 28.6ms Chromebook figure, and cite the pixel comparison as the evidence. On the second, give its numbers (`.mainContainer` 481 to 576, `.rightContainer` driven down to its 194px content floor) and name it as the change to review. This is **not** a centering regression; do not ask a reviewer to look for one.
- **The tiles load once per page and are retained; the switch gates only whether the textured material renders.** Passing the live switch value into `useTerrainTextures` is the broken shape: switching off disposes the texture while the hook keeps returning it, and every off/on cycle re-fetches and re-rasterizes all four tiles.
- **No per-cell loop in `terrain.tsx` reads `simulation.gridWidth` or `simulation.gridHeight`.** Both are `@computed`, and a computed read from a `useLayoutEffect` rather than from inside a reaction has no observers, so MobX re-evaluates it on every access. Fixing the near-edge predicate takes the textured burning median on a Chromebook from **82.2ms (100% of frames past the 66.5ms clamp) to 39.0ms (0%)**. Because `updateColors` is shared, the same hoist also fixes the untextured path, which master has been paying about 9.3ms/tick for.
- **`updateBurnState` stays whole-grid-per-tick, and the textured path keeps calling `updateColors` every tick.** Deleting `updateBurnState` outright, the ceiling of any incremental scheme, is worth 3ms against a threshold already cleared by 27ms. Skipping the textured `updateColors` is not safe in any case, because `isFireLineUnderConstruction` changes mid-run.
- **Toggling the switch logs `VegetationKeyShown` / `VegetationKeyHidden`**, a paired view-toggle event following `ChartTabShown` / `ChartTabHidden`, with an explicit no-op `case` in `translate.ts`.
- **`scripts/measure-terrain-textures.mjs` comes across with the tiles and the story requires running it** after any tile change, rather than inheriting it as scaffolding nothing invokes. It gets a row in `CLAUDE.md`'s commands table.
- **The exploratory config knobs are collapsed to constants: nine fields become three.** `terrainGlyphContrast` and `terrainGlyphContrastBurnt` survive because they produce the specified colors; `showVegetationKey` survives with its meaning narrowed to the initial value of `ui.showVegetationKey`. The other six become module constants in `terrain-shader.ts`, keeping the prototype's comments.

## Technical Notes

**Two design boards are sources, not one.** Layout and the switch's states come from *Updated Wildfire Controls and Labels* (`.../screen/6a8566a1c90489f7be36e66a`); the tiles, the color table and the Setup-panel texture treatment come from *Updated Wildfire Setup Panel and Terrain Textures* (`.../screen/6a8599f5f464e141fcb7b53b`). The second board carries the four tiles as SVG assets and an "Assigned Color" table holding the five stroke hexes as swatches, which makes them **authored design values the derivation reproduces**, not a transcript of shader output.

**How it works.** Four 256 x 256 SVG tiles live in `src/public/terrain-textures/`, each with a `#808080` background rect and `#2A2A2A` glyph strokes, fetched by URL at runtime rather than imported: the webpack `.svg` rule pipes imported SVGs through SVGR (yielding a component, not a URL), and serving them statically lets an artist edit a tile and reload with no rebuild. They are rasterized to 512 x 512 through `<img>` plus a canvas, then packed into the four channels of a single `THREE.DataTexture` in **Vegetation enum order**. The packing exists because GLSL forbids indexing a sampler array by a per-fragment value. The texture is tagged `NoColorSpace` because the tiles are luminance data rather than color, with **128 as the neutral "unchanged" point**, and anisotropic filtering is applied because the terrain is viewed at a shallow angle.

**Three constraints found the hard way.** Tile scale is held as a ground distance (18,000 ft) and must be LARGE: detail below the pixel grid is averaged away by mipmapping, and since the tile mean is neutral by contract, a small tile does not get subtle, it vanishes. The one-cell skirt `fillTerrainEdges` creates smears planar UV badly, and the interpolated vertex normal cannot detect it because `computeVertexNormals` averages the faces meeting at each vertex, so the true geometric normal from `dFdx`/`dFdy` of local position is used. Vegetation weight doubles as the texture mask: the shader blends toward neutral by `(1 - weightSum)` rather than normalizing, so zeroing a cell's weights removes its glyphs with a soft one-cell fade, which is how rivers stay clear.

**Unobserved MobX computeds are the performance story.** A `@computed` read from a `useLayoutEffect` rather than from inside a reaction has no observers, so MobX re-evaluates it on every access. Micro-benchmarked over all 38,400 cells: the five-call near-edge predicate costs 16.5ms via `simulation.isTerrainEdge`, 0.7ms with the dimensions hoisted into locals, and 0.4ms as a precomputed `Uint8Array` mask lookup.

**The sim is real-time-locked, not frame-locked.** `timeStep = Math.min(maxTimeStep, optimalTimeStep * 4, ratio * realTimeDiffInMinutes)`. A slower frame rate takes proportionally bigger steps and the run consumes the same real seconds, so frame rate does not affect model pace until a clamp binds. The clamp that can bind is `optimalTimeStep * 4`, at a 66.5ms frame (about 15 fps); `maxTimeStep` (180) is unreachable. The threshold does not depend on the speed setting, because `ratio` cancels from both sides.

**Bottom-bar thresholds.** The switch takes `.mainContainer` from 481 to 576 and drives `.rightContainer` to its 194px content floor (Hazbot 122 + 10 + fullscreen 62), after which only `.leftContainer` can absorb further growth. The row's minimum non-overflowing viewport goes from ~729px to ~824px; adding WM-40's control would bring it to ~918px. The target Chromebook reports a 1241 x 529 viewport, clearing the post-switch threshold by more than 400px.

## Out of Scope

- **Removing the Fire Intensity Scale from the bottom bar** to make room. That is WM-52.
- **The Clear All rename and move** (WM-47) and **the speed control** (WM-40), which land in the same row.
- **Sharing a thumb component with WM-40.** Rejected on measurement: different assets, different sizes, different component families.
- **Enhancing the zone labels** (WM-49).
- **The Setup panel changes and the Fire Intensity Scale restyle**, both assigned elsewhere.
- **Accessibility review**, per the standing scope for this repo.

## Not Yet Implemented

- **The ink derivation is not exported for WM-53.** An earlier decision exported `glyphInkHex`, `glyphInkForDrought` and `glyphInkForBurnt` from `terrain-colors.ts`; it was reversed. The TypeScript mirror lives privately in `terrain-glyph-colors.test.ts` instead. WM-53's recoloring mechanism is undecided (mask-image plus background-color, a CSS filter chain, or pre-colored tiles) and each needs something different from here, so exporting now guesses. WM-53 gains an open question about its mechanism rather than an assumption that the palette arrives from here. `VEGETATION_TILE_FILES` and `TILE_DIR` **are** exported, since WM-53's spec names them and a second copy would get `forest-with-suppression` wrong.
- **The shrub tile is shipped as drawn, not revised.** Trudi's 2026-08-20 critique was that it reads as clouds; no revision exists in the branch, the design board, or the demo build, which are byte-identical. Michael confirmed 2026-08-27: *"Shrub should be correct. We're going to test it."* Swapping it later is one file replacement plus a run of the checker script.
- **`isTerrainEdge` still reads the two computeds.** Changing it to read `this.config.*` would take it from 16.5 to 6.6ms for every caller, but after this change nothing calls it per tick, so it is a speculative optimization with no measured user-facing benefit.
- **The `terrain.tsx` re-export of `BURN_INDEX_*` stays.** Once WM-52 has also landed, the moved `fire-intensity-scale.tsx` should import from `terrain-colors.ts` directly and the re-export can go.
- **Story points were not set.** Closed as out of scope by Doug for this story and every other branch in flight this sprint; the Jira automation nag is being ignored.

## Decisions

### Fixed stroke hexes, or the prototype's derived-contrast ink?
**Context**: The description lists five exact colors; the prototype computes the ink per fragment from a contrast target and contains none of those hexes. Both cannot be the implementation.
**Options considered**:
- A) Use the five fixed hexes and delete the contrast machinery.
- B) Keep the derived-contrast approach and treat the hexes as approximately what it produces.
- C) Keep the derivation but pin the four drought results to the specified hexes.

**Decision**: **B, and not "approximately": exactly.** Reimplementing `wfInk` and `wfRatioFor` outside the shader and evaluating them in linear working space at the configured targets reproduces all five hexes to the byte, including the burnt `#B3B3B3` via the lighten branch. So there was never a conflict: the description's list documents the prototype's output. A is actively wrong, since it would delete the mechanism that generates the numbers it keeps, and lose the property that makes the burnt case work without a hand-picked ash color. C's instinct was right and survives in a cheaper form: rather than pinning outputs in the shader, a unit test asserts the derivation still produces those five.

---

### Does the prototype ship, or is it rewritten?
**Context**: PR #129 is titled "DO NOT MERGE" and is exploratory by its own config comments, but it is 1678 lines of working, heavily commented code that rebases with zero conflicts. It also carries nine new config knobs, most of them tuning dials from the exploration.
**Options considered**:
- A) Rebase the prototype, then harden it: keep the architecture, collapse the exploratory knobs to constants, keep the checker script.
- B) Ship it as-is behind the switch and tidy later.
- C) Re-implement from the prototype as reference.

**Decision**: **A.** C is ruled out by what the code contains rather than by effort: the parts that look like exploration are load-bearing and were arrived at by solving specific problems a reimplementation would have to rediscover (the contrast derivation, the channel packing, the 18,000 ft tile, the `NoColorSpace` tag, the slope fade). B is ruled out by the config surface: nine fields settable per activity and by URL param is a contract with authors, and shipping it "to tidy later" makes it one.

---

### Is the shrub tile still the one that "looks too much like clouds"?
**Context**: In the 2026-08-20 Slack thread Trudi's one substantive criticism was that the shrub texture reads as clouds, and Michael owned the rework. Nothing on the ticket records whether that was addressed. It is the one piece of the design a stakeholder actively rejected.
**Options considered**:
- A) Confirm with Michael whether the current `shrub.svg` is the revised one before building on it.
- B) Ship whatever is on the branch and swap the file later.

**Decision**: **B, ship the current tile.** Confirmed by Michael directly: *"Shrub should be correct. We're going to test it."* He contradicts the premise rather than conceding it. Corroborated by the artifacts: WM-48 links **WM-37, a Design Task assigned to Michael, marked Done 2026-08-23**, three days after the critique, with the asset unchanged. The tile is byte-identical across the Zeplin board, the branch and the live demo build; rasterized at 512 the board and branch copies differ by zero pixels above 8/255. Neither ticket carries any comment about the shrub. Blocking an implementation story on a design task its designer has signed off is second-guessing him, and the cost of being wrong stays low: the tiles are fetched by URL at runtime, so a swap is one file replacement plus a checker run.

---

### Confirm the default is off, given the board's "Default On" label
**Context**: The description says textures are hidden by default and the board's default bottom-bar row draws the thumb left, but the switch's states column is annotated "Default On", and Trudi reversed herself on this question within one minute in the original thread.
**Options considered**:
- A) Off by default, reading "Default On" as a variant name.
- B) Confirm with Trudi before building.

**Decision**: **A**, and the label demonstrably names a variant. The four annotations in that column are "Default On", "Hover / icon outline 50% op", "Select / icon outline 100% op" and "Disabled (may not need)", the same four-row state list every other control on the board carries; the only difference is that this control's default row had to say which toggle position is drawn. Against it stand two agreeing artifacts: the description, and the board's own default bottom-bar row drawing the thumb left.

---

### What kind of control is the switch, and does the bottom bar have anything to build it from?
**Context**: Every existing bottom-bar control is a button or a button pair; there is no toggle switch in the bar today. WM-40's speed control arrives in the same row with its own slider-like control.
**Options considered**:
- A) A purpose-built toggle reusing `slider-thumb-small.svg`.
- B) An MUI `Switch` restyled to the board.
- C) Coordinate with WM-40 so the two thumb treatments are built once.

**Decision**: **A**, with C eliminated by measurement. The two controls share nothing: WM-48's thumb is `slider-thumb-small.svg` at a 28px group with a 20px circle, WM-40's is the larger `Slider Thumb` at 32px with a 24px circle, the board exports them as separate assets, and the components are different families (a two-state toggle against an MUI `Slider` in `step={null}` mode). Between A and B, the repo settles it: `@mui/material`'s `Switch` appears **nowhere** in this codebase, while a thumb image positioned on a small track already exists at `wind-circular-control.scss:115`.

---

### Does the texture toggle persist across Restart and Clear All?
**Context**: It is a view preference rather than model state, so it plausibly survives everything. But Clear All promises a return to defaults.
**Options considered**:
- A) Persist across both.
- B) Persist across Restart, reset on Clear All.

**Decision**: **A, persist across both.** Verified in the code rather than argued from principle: `handleClearAll` is the whole of Clear All's UI reset and names the things it clears, and `ui.showChart` is an existing view preference it does not touch and that already survives Clear All today. `simulation.reload()` resets model state through `setInputParamsFromConfig()` and never reaches `UIModel`. So A is what the code does with no new line written, and B would mean adding a reset that contradicts the only precedent.

---

### Is the texture toggle logged?
**Context**: A researcher comparing runs would want to know whether a student had the textures on, and nothing logs it today.
**Options considered**:
- A) Log a toggle event.
- B) Log nothing for now.

**Decision**: **A, log it as a paired event**, `VegetationKeyShown` / `VegetationKeyHidden`. Logging a view toggle as a pair is the convention here, not an exception: `right-panel.tsx` does exactly this for `ui.showChart`, and `FullscreenEnabled` / `FullscreenDisabled` is the same shape. This is also not necessarily researcher-only, since the chart-tab pair **is** consumed by the engine through the `chartTabOpen` temporal variable, so "log a view toggle, and let a rule-set read it later" is already a built path. A single event with a boolean payload was rejected: cheaper to write, but it breaks the naming both existing examples chose, for no gain.

---

### Does the story split into two PRs?
**Context**: The terrain half and the switch half share no files, so they are independently landable. A split would pipeline review against a reviewer's Friday cutoff.
**Options considered**:
- A) One PR with clearly named commits.
- B) Two PRs, terrain first.

**Decision**: **A, one PR.** The split's purpose was review pipelining, which assumed serial human review attention was the scarce resource; it is mostly an AI review, so one ~1800-line diff costs about what two ~900-line ones do, and both halves are built by one person in one day. **The decisive argument is that the switch half is not independently reviewable**: it is a control writing `ui.showVegetationKey`, a flag nothing in that diff reads. File-disjointness establishes that the halves *could* be split, not that they *should* be. What the split was protecting is paid for instead by two requirements: terrain and switch land as separate clearly named commits, and the bottom-bar row change is called out explicitly in the PR body. **What would reverse it**: review tooling that truncates or degrades on a diff this size.

---

### Does the untextured path's own MobX fix land in this PR, or its own?
**Context**: `updateColors` reads `simulation.gridWidth` and `gridHeight` per cell on master as well, so the default untextured view every existing activity uses spends about 9.3ms/tick recomputing two unobserved computeds.
**Options considered**:
- A) Fold it into this PR as its own clearly named commit.
- B) Land a standalone hoist PR first.
- C) File it as a follow-up.

**Decision**: **A.** B is not actually cheaper, because **this story rewrites `updateColors` itself**, adding the `baseColorOnly` and `nearEdgeMask` parameters to the very argument list the hoist edits, so a separate PR would collide in those exact lines. The story already ships as separate named commits, so a third reads as structure rather than as a smuggled change; the byte-identity pixel comparison that makes an output-preserving performance change safe to review is evidence this story produces anyway; and C would park a four-line fix worth 22% of the frame time behind a feature story that might slip. **The cost, stated plainly**: a reviewer scanning for "does this touch the untextured path" will now find a hit, and should, which is why the PR body has to name this commit and its numbers.

---

### Nine new config fields is a large public surface for one visual feature
**Context**: Every field is settable per activity and via URL param, which makes them a contract with authors.

**Decision**: collapse nine to three. `showVegetationKey` is the initial value of the MobX flag; `terrainGlyphContrast` and `terrainGlyphContrastBurnt` produce the designer's five hexes, so they are a design parameter with a test attached rather than a dial. The other six are exploration dials whose own comments say so, most explicitly `terrainTextureMacroAmount`, documented as mostly making the field look blotchy and "kept low" at 0.07. `terrainTextureTileFt` was the borderline case and collapses too: it is held as a ground distance, so a tile covers the same 18,000 ft on every preset and the repeat count varies with model size, which is the correct behavior for a map symbol.

---

### `terrain-colors.ts` extraction changes an import graph other files depend on
**Context**: The prototype pulls the palette out of `terrain.tsx` so the shader can share it without a circular import, and re-exports the burn-index colors so existing importers are unaffected. WM-52 is moving `fire-intensity-scale.tsx`, which is the importer.

**Decision**: checked, and they do not collide. `fire-intensity-scale.tsx:3` is the **only** importer of those symbols anywhere in the repo, and the re-export exists precisely to keep it working. WM-52 moves where the component renders and requires the colors to keep deriving from `BURN_INDEX_*`, so it keeps importing through the same chain regardless of which lands first.

---

### Runtime SVG fetching is a deliberate choice with a deployment consequence
**Context**: `TILE_DIR = "terrain-textures/"` is a bare relative path assigned to `img.src`, so it resolves against the **document URL** and never consults webpack's `publicPath`, which is set to `DEPLOY_PATH`. Those two mechanisms can disagree.

**Decision**: verify it on a real branch deploy rather than reading the comment. Worked through: for `/branch/foo/index.html` and for `/branch/foo/` the relative path resolves correctly; for a URL with no trailing slash it resolves one level up and 404s. One page load settles it, and it was verified.

---

### The texture loader breaks when the flag toggles at runtime
**Context**: `useTerrainTextures(enabled)` was only ever exercised with a flag that never changes, since the prototype reads config once at page load. The switch turns that into a value a student flips repeatedly.

**Decision**: tie the loader to "has the feature been switched on at least once this page load", not to the live switch value, and gate only the render. Reproduced against the prototype's real hook: switching off disposes the texture while nothing calls `setTextures(null)`, so the hook keeps returning a disposed `DataTexture` and the next switch-on builds a material pointing at it; every off/on cycle re-fetches all four tiles. This removes the disposed-texture window entirely rather than patching it, which is the shape this repo's review standard prefers, and it makes toggling instant, which matters for a control whose purpose is comparison. Measured after the fix: three off/on cycles cost **1 load and 0 disposes**, against 3 and 3 before.

---

### `simulation.config` is not observable, so the flag the switch drives cannot be a config field
**Context**: `SimulationModel.config` is a plain, undecorated field assigned from `getResolvedConfig()`, which is `Object.assign` over plain objects. Writing to it would change no observer's output.
**Options considered**:
- A) The switch drives `ui.showVegetationKey`; the config field survives as its initial value.
- B) Delete the config field outright.
- C) Turn it into an availability gate that lets an activity suppress the control.

**Decision**: **A.** B throws away the URL parameter this feature has been demoed with and that Trudi later asked for by name. C is the only option that lets an activity hide the switch, and nothing on the ticket or either board suggests one would want to; adding the knob speculatively is what the config triage spent nine fields arguing against. Recorded because it is the non-obvious half: config-gated *rendering* is fine in this codebase precisely because config never changes, but config-gated *state* is not, and the difference is invisible at the call site.

---

### The prototype's demo-build version banner has no disposition
**Context**: The prototype renders `Wildfire Explorer: Textured Terrain - v0.2` in the top bar whenever the texture flag is true, with 21 lines of styling. Wired to the flag authors are now told to set, it would appear for every student who turns the key on.

**Decision**: it never reaches the branch, on the author's own instruction. PR #129 lists it under Known gaps: *"The version tag in the top bar is demo scaffolding and should be removed before any merge."* Because the work is built onto master rather than rebased onto the prototype, the banner is not introduced in the first place, so `top-bar.tsx` and `top-bar.scss` stay byte-identical to master.

---

### The one thing that must not regress is the untextured path, and nothing asserts it
**Context**: The prototype restructures `terrain.tsx` by +219/-42 around a promise of "no visible change", and there is no test over terrain rendering anywhere in the suite. There cannot usefully be a Jest one, since the output is a WebGL canvas.

**Decision**: a screenshot comparison is a requirement, on a preset with a river and more than one zone, including a post-burn state as well as the initial view. **Done**: `mountainsandplainsTwoZone`, terrain canvas only, master against the branch with the switch off, identical in both states, 0 of 1,409,280 channel samples differing. An earlier version of this finding reasoned the preset should have a river because the river-color suppression touches the untextured path's output; that is backwards, since the suppression is gated on `baseColorOnly`. A river preset is still the right choice, for the textured half.

---

### The tile contract has a checker, and the story should require running it
**Context**: `measure-terrain-textures.mjs` checks exactly the properties that fail silently: a background off 128 tints an entire zone and corrupts the drought coding the simulation uses to communicate, and a low-SD tile vanishes at distance. Neither is visible in review.

**Decision**: "run it after any tile change" is a requirement rather than an implication, and it gets a `CLAUDE.md` commands row so the next person editing a tile finds it. This story is unusually likely to hit the "fixture nothing imports" failure mode, because a tile change is already anticipated and may be made by someone who was not part of this work. It needs headless Chrome and an HTTP server, so it is a local command rather than a CI step.

---

### A texture-loading failure is designed to be silent, which makes it untestable in practice
**Context**: The loader logs to console and falls back to the untextured terrain, which is right for a student. It also means a broken tile path in production looks identical to the switch being off.

**Decision**: keep the student-facing behavior exactly as it is; the finding identifies a *detection* gap, addressed by the branch-deploy verification rather than by changing the fallback. The loader already rejects with `failed to load terrain tile: ${url}` including the URL, so the console message identifies which path was tried, which makes the check a glance rather than an investigation.

---

### The required "unit test pins the derivation" cannot test the derivation
**Context**: `wfInk` and `wfRatioFor` are GLSL inside a template literal. Jest runs on jsdom with no WebGL context, so no Jest test can execute them. The only possible test is a TypeScript reimplementation, which would keep passing if someone edited the GLSL.
**Options considered**:
- A) Keep the TypeScript mirror and reword the requirement to what it guards.
- B) Move the derivation into TypeScript and pass five precomputed inks as uniforms.

**Decision**: **A.** The finding overstated the problem: the requirement's own named mutations, retuning a contrast target or a drought color, **are** caught, because the test imports both from source. Only an edit to the GLSL body escapes, and that is the mutation least likely to happen unseen. B is ruled out by the code: `wfGlyphSurface` is called with the **interpolated** vertex color, so across a zone boundary the base is a blend of two drought colors over one 500 ft cell, where continuous derivation and nearest-of-four precomputation diverge by up to **23/255**, precisely where two vegetation textures meet. The performance argument does not rescue it either: `wfInk` is about 15% of the shader's arithmetic.

---

### The river-down-the-side fix only applies when textures are on
**Context**: The requirement reads as an unconditional fix, but the suppression is `baseColorOnly && nearTerrainEdge`, so with the switch off the river still interpolates its blue down the side exactly as on master.

**Decision**: keep the gate, and reword the requirement to match. Three things settle it. The ticket describes the prototype rather than requesting an independent fix, in the past tense, with the neighboring items inherently about textures. The residual is tiny: 5 of 498 river cells sit on the perimeter of `mountainsandplainsTwoZone`, so two smears of roughly 1,000 to 1,500 ft on an 80,000 ft edge, reachable only by a deliberate orbit toward `maxPolarAngle`. And the gate is what buys byte-identity, the strongest safety property available for merging 1,678 lines that restructure the terrain renderer.

---

### "The shipped colors stay the designer's" is true of the material color only
**Context**: The five hexes are what the fragment shader hands the material, before lighting. No pixel a student sees is `#004001`.

**Decision**: state it as a requirement in its own right, carrying measured values. PR #129 samples the rendered frame: `#02D40A` renders `#09850A` with its stroke at `#002D00`, and burnt `#333333` renders `#20201D` with its stroke at `#6E6C65`. The light costs about 64% of the luminance and the ratios land at 3.09 to 3.49:1 against the configured 6 and 7. This is why the pinning check has to be a unit test rather than a screenshot, and why a reviewer eyedropping the running app against the ticket's hex list will find a mismatch and be right to.

---

### The Chromebook target is asserted in a comment and never measured
**Context**: The channel-packing decision is justified as mattering "on the Chromebooks this sim targets", and nothing records a measurement on that hardware.

**Decision**: measured on the target device, and the answer changed what got built. The item first reduced to one binary, does textured terrain push a Chromebook below 15 fps, after a correction established that the sim is real-time-locked and only the 66.5ms clamp can bind. It came out on the wrong side: textured burning median **83.7ms with 100% of frames past the clamp**, against 36.8ms and 1.2% plain, so the clamp bound continuously and the run genuinely stretched.

**The cost was per-cell CPU work, not the fragment shader.** Two independent lines of evidence: the textured/plain ratio was 2.27x on the UHD 600 and 2.05x on the Iris Xe, and a fragment-bound cost would not produce near-identical ratios on GPUs that differ enormously in fragment throughput; and quartering the cell count while holding screen coverage constant collapsed the textured-minus-plain difference from 19.1ms to zero.

**A second correction found the actual culprit.** Reasoning that `updateColors` runs in both paths and therefore cancels was wrong: it costs **13.6ms/tick more textured**, despite doing strictly less color work, because the `baseColorOnly &&` short-circuit evaluates `isNearTerrainEdge` only there. That is roughly **87%** of the gap; `updateBurnState`'s walk is the remaining 13%, and its `DataTexture` re-upload is free. Precomputing the predicate into a `Uint8Array` mask took the Chromebook from **82.2ms with 100% of frames past the clamp to 39.0ms with 0%**, rendering pixel-identically. Deleting `updateBurnState` outright, the ceiling of any incremental scheme, is worth 3ms against a threshold already cleared by 27ms, so it stays whole-grid-per-tick.

---

### 512 x 512 x RGBA held for the life of the page, plus mipmaps and anisotropy
**Context**: A megabyte of texture memory plus mip levels, worth a glance on a low-end Chromebook.

**Decision**: computed, and not a concern. One 512 x 512 RGBA texture is exactly 1.0 MiB and a full mip chain adds about a third, so the steady-state cost is roughly **1.4 MiB** while the switch is on and zero while it is off. The rasterization canvases are transient. It is a single allocation rather than four, which is the packing decision paying off in memory as well as in sampler count.

---

### This story is the reason three other stories are moving, and its scope note is one clause
**Context**: The bottom bar is being rearranged because the Fire Intensity Scale has to leave to make room for this switch, and the only trace on the ticket is a half-sentence.

**Decision**: the relationship leads the Overview rather than sitting in Out of Scope, with one refinement: "cause" is right for WM-52 and overstated for the other two. WM-47's tightening was justified by a condition WM-52 then deletes, so this story is an indirect contributor there; WM-40 shares the row without depending on this at all.

---

### "It stops being centered" does not survive measurement
**Context**: The spec promoted a bottom-bar centering break into a PR-body obligation.

**Decision**: correct the claim and rewrite the requirement built on it. Measured at 950 x 880: `.mainContainer` sits **10px right** of the viewport center on master, because `.leftContainer`'s natural content is wider than `.rightContainer`'s, and **7px left** with the switch. The offset shrinks; the row was never centered. What is real, and is what the PR body should name instead, is the **`.rightContainer` floor**: the switch drives it to its 194px content width, after which the row can only absorb further growth from the left. That is durable, it is what WM-40 will run into next, and it is checkable. Asking a reviewer to check a symptom that does not exist wastes the one instruction the PR body gets to give.

---

### "The bar does not overflow" was measured at one viewport
**Context**: The switch moves the row's minimum non-overflowing width by about 95px, from ~729px to ~824px, and WM-40 would bring it to ~918px.

**Decision**: record the thresholds and take no action. The Chromebook frame-time run supplied the missing fact as a side effect: a real-world viewport of **1241 x 529** on the target device, clearing the post-switch threshold by more than 400px. The design board's 640px Activity Player frame is a layout mock rather than a runtime constraint, since the bar already overflows by 88px at 640 on master today. Naming a minimum supported width was the considered alternative; it would invent a constraint from one data point, and the one data point we have is comfortable.

---

### A key that is off by default is a key most students will never see
**Context**: The feature exists because students could not tell what vegetation they were looking at. Defaulting it off means the default experience still cannot tell them.

**Decision (Trudi)**: **default off, and the URL param is a first-class authoring parameter rather than a demo hook.** Her words: *"By default, we cannot have the veggie key on as it would mess with the OG version of the model ... However, I would like a URL param to turn the veggie key on for some of these new Hazbot enabled tasks."*

Two things follow. **The reason for default-off is backward compatibility, not pedagogy**, which makes it a constraint rather than a preference a later reviewer can reopen, and is why the discoverability tension is accepted rather than resolved. And **the config field is asked for as a feature**, so it stops being a leftover: it is renamed into the `show<Thing>` family authors already know, and the demo version banner has to go, since it was gated on the same field.

---

### The switch's ON appearance is not specified anywhere in this spec
**Context**: The geometry table documented only the off state. The board specifies the on state too, and it is more than a thumb slide.

**Decision**: the on state and the interaction states are specified in Requirements rather than left to the implementer. Read off the board: the track turns **`#2997ff`** and the thumb travels **18px**, overhanging the track by 9px at whichever end it rests. The fill change is the load-bearing part, because at a 28 x 10 track an 18px travel is a weak signal on its own. The same column also specifies hover and select at 50% and 100% icon-outline opacity in both variants.

---

### A second Zeplin board is the designer's source, and the spec does not cite it
**Context**: The *Updated Wildfire Setup Panel and Terrain Textures* board is where the terrain-texture design lives, carrying the four tiles as exportable assets, a color table, and the Setup-panel variants.

**Decision**: cite the board alongside the Controls board, and correct the provenance claim. The technical conclusion is unaffected and was re-verified: the derivation reproduces all five hexes to the byte. What changes is their **status**. The spec had reasoned the ticket's hex list "could only have been written by reading them off the running prototype"; they sit on a design board in a column headed "Assigned Color". They are **authored design values the derivation happens to reproduce**, which is an argument *for* the pinning test rather than a reason it is redundant, since a drift is now a drift away from a design contract rather than a change of mind about a tuning dial. A related correction: the board's "implemented at 0.5x" note describes its exportable **terrain** images, not the tiles; the Setup panel's texture scale is **112.5px from the 256px source** (0.44x), which is WM-53's to carry.

---

### Do the WM-53 exports land here?
**Context**: WM-48 does not need a TypeScript copy of the ink derivation, because the shader derives it in GLSL. The pinning test needs one. WM-53 needs the tile filename map, and needs the resulting hexes as CSS values.

**Decision**: **export the filename map, keep the ink derivation private.** An earlier pass resolved to export both; that is reversed for the ink half, and the two turn out to be very different asks.

**The map is exported.** WM-53's spec names `VEGETATION_TILE_FILES` explicitly, its failure mode is confirmed (`Vegetation[3].toLowerCase()` does not produce `forest-with-suppression`, so a second copy is wrong in one of four cases), and the change is two keywords.

**The ink stays in the test, because the question the export was answering is not yet decided.** The four tiles contain exactly two colors, `#808080` and `#2A2A2A`, so *"the texture's ink color follows the drought level"* cannot be satisfied by using a tile as a plain CSS `background-image`, and **WM-53's spec never picks the recoloring mechanism.** `mask-image` plus `background-color` needs one color per zone; a CSS filter chain needs no color values at all; pre-colored tile copies need neither. Exporting today guesses which. If WM-53 takes the mask route the five hexes are trivially available anyway, since the spec tables them, the board carries them, and the test pins them. At no point do two copies of the derivation exist, which is the property the original decision was reaching for. One argument from that decision does not survive: that exporting makes the test "assert the exported production function rather than a private copy that could drift from one". A private copy cannot drift from a function that does not exist.

**Still true**: if the ink is ever exported it has to be a function rather than a frozen table, because `getUrlConfig` parses `terrainGlyphContrast` from the URL, so an override changes what the shader draws.

---

### Where does the near-edge mask live, and does it duplicate the edge predicate?
**Context**: The draft built the mask by re-implementing `edge(x, y)` inline, which copies `isTerrainEdge`'s deliberate off-by-one into a second file.
**Options considered**:
- A) Keep it in `terrain.tsx` and duplicate the predicate.
- B) Move it onto `SimulationModel` where the off-by-one is documented.

**Decision**: **neither. The mask stays in `terrain.tsx` and calls `simulation.isTerrainEdge` to build itself.** The premise was wrong: the builder runs **once per grid**, not per tick, so it can afford the slow predicate, and duplicating it bought nothing. Measured over all 38,400 cells, every variant classifying the same 1,348 cells: 16.5ms via `simulation.isTerrainEdge`, 6.6ms reading `this.config.*`, 0.7ms with hoisted locals, 0.4ms as a mask lookup. The mask recovers 16.1 of 16.5ms, and paying the full 16.5ms once at grid-build time is free.

**The memo reads `fillTerrainEdges` rather than only listing it.** An early draft named it as a dependency without using it, because the body calls `simulation.isTerrainEdge`, which reads the flag internally; `exhaustive-deps` correctly flagged that, and silencing the rule was the wrong fix. The shipped memo short-circuits on the flag, which is true to `isTerrainEdge`'s own semantics and makes the dependency real.

---

### The flag and its seeding land with the terrain commit, not the switch commit
**Context**: The plan assigned `ui.ts` and `stores.ts` to the switch step, but `terrain.tsx` reads `ui.showVegetationKey`.

**Decision**: they land with the terrain commit, which does not compile without them. It is also what makes that commit's own claim true: `?showVegetationKey=true` reaches the terrain through `stores.ts` seeding the flag, so the textured render is reachable and reviewable one commit before the control that drives it exists. The switch commit then adds only the control.

---

### The "seeded from config" test cannot fail
**Context**: The shipped test asserted `config.showVegetationKey` and `ui.showVegetationKey` were both `false`. Both default to `false`, so the assertion is true by construction and says nothing about the assignment in `stores.ts`.

**Decision**: replace it with a URL-driven case, keeping a default-off case alongside. **Mutation-verified**: deleting the seeding line and running the full suite passed 1017 of 1017 with the old test, so the line that implements `?showVegetationKey=true` could be deleted with zero test signal, and its failure mode is silent (the app opens with the key off, which is also the correct default appearance). The replacement uses `config.test.ts`'s capture-and-restore of `window.location`, and on that mutation it fails on the `ui` assertion with the `config` assertion still passing, so it isolates the seeding rather than the parsing. Fixing only the claim was rejected: it would leave a stated requirement with no coverage at all.

---

### `LOGGED-EVENTS.md` is in no step's file list
**Context**: The repo maintains it as a table of every event the app emits, and it already carries the exact precedents this story models itself on. `log()` takes a bare `string`, so nothing in the type system or the suite notices two missing rows.

**Decision**: one row per event. This is the repo's own "update the prose the change invalidates" repeat offense, against a file whose entire purpose is to be the list. For contrast, the decision *not* to add a `translate.ts` test for the two new cases is right and stays: `default:` already returns `no-op`, so a test asserting `no-op` for the new names would pass with the explicit cases deleted. That is a test that cannot fail, and it is correctly absent.

---

### The track's off fill is `#dfdfdf`, which is also the hover background
**Context**: The geometry table claimed board and measurement agree; one row did not. `.track` used `$controlGrayLight1`, which is `#dfdfdf`, against the board's `#d8d8d8`.

**Decision**: **set the off fill to `#d8d8d8`.** The first reading was that seven levels is invisible and the house token beats a one-off hex, so the only fault was the table's claim. Two checks turned that around, making it a defect rather than a preference. **`#dfdfdf` is the hover background**: `material-ui-theme.tsx` sets every MUI `Button`'s hover background to it, and it is also `$hoverColor`, so the track's fill vanished into the widget background on hover and only its 1px border survived. And **`#d8d8d8` is already the repo's value for exactly this shape**: `wind-circular-control.scss` and `vertical-selectors.scss` both paint a small gray element inside a `1px solid $controlGray` border that way, which is the track's construction precisely. The board's own layer data confirms it. The on fill stays the literal `#2997ff`, matching `wind-dial.scss`, which also hardcodes it as a Zeplin value.

---

### Inserting `.vegetationKey` orphans the comment explaining `.placeSpark`
**Context**: The new rule landed immediately below an eight-line comment documenting why Spark needs an explicit width, so a reader saw a nine-line block above `.vegetationKey`, eight lines of which were about a different rule.

**Decision**: move `.vegetationKey` below `.placeSpark`. The file's rules do not follow bar order anyway (`.clearAll` already sits below `.placeSpark` while Clear All is leftmost), so there is no source-order convention the move breaks. Separately, the `90` is written once: `bottom-bar.scss` owns it and the switch fills its group with `width: 100%` plus `min-width: 0` to defeat MUI's 64px floor. This differs from `.placeSpark`, which does repeat its 60, because there the inner control is an `IconButton` whose own `width: 100%` creates the circular-sizing dependency its comment describes.

---

### The Cypress layout guard has to move with the bar
**Context**: `bottom-bar-visuals.cy.ts` pins the bar's geometry, and inserting a widget invalidated three assertions: `.mainContainer` at 481 under the name "seven widget groups", and a 3px gap for `Setup -> Spark`, an adjacency that no longer exists. The suite's 43-of-43 figure was measured on the rebased prototype, which has the terrain work but not the switch.

**Decision**: fix the inventory rather than the numbers. The widget list gains the switch at 92, the cluster assertion becomes eight groups at 576, and the adjacency list gains `Setup -> Vegetation Key` and `Vegetation Key -> Spark` at 3px each. The rect buffer is built by a `forEach` that pushes one entry per id, so it also gains a length assertion against `ids.length`: without one, a widget that stops resolving to a `widgetGroup` shortens the buffer and the later index comparisons read the wrong pairs or compare `undefined`.

---

### The thumb highlight matches the board (WITHDRAWN)
**Context**: A visual-review finding claimed the thumb highlight treatment diverged from the board.

**Decision**: withdrawn as a false positive. The row identification from thumb position (x=400 off, x=418 on) and the eight `Vegetation Key Back` fills are unaffected, and the requirements bullet describing hover and select as the icon-outline treatment at 50% and 100% is correct as it stands.
