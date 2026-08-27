# Implementation Plan: WM-48: Add texture to represent vegetation in the model

**Jira**: https://concord-consortium.atlassian.net/browse/WM-48
**Requirements Spec**: [requirements.md](requirements.md)
**Status**: **In Development**

## Starting point

The prototype's three commits are rebased onto `origin/master` (`98858e5`) on the local branch `wm48-probe-scratch`. The rebase is clean: no conflicts, `tsc --noEmit` reports only the two pre-existing `line-chart.tsx` errors, `npm run lint` reports 0 errors with no warnings in any prototype file, `npx jest` reports 1010 of 1010, and `CI=true npx cypress run --browser chrome` reports 43 of 43. That branch is the base for the work below; the plan assumes it, and does not re-litigate it.

**What is built.** The branch is the authority. The three commits land **22 files: 10 modified (+288 / -45) and 12 new (1775 lines)**, covering the performance work, the textured-terrain rewiring, the switch, the texture-loader retention fix, the config collapse, the logging cases and rows, the hex-pinning test, and the `CLAUDE.md` rows. Measured on the head commit: the suite reports **1019 of 1019 across 81 suites**, `npm run lint` reports 0 errors, `eslint` reports no warnings in any touched file, `tsc --noEmit` reports only the two pre-existing `line-chart.tsx` errors, `npm run build` succeeds with the four tiles emitted to the build root, and `node scripts/measure-terrain-textures.mjs` passes all four tiles (viewBox 256, stroke 3, background 128, sd 28.3 to 36.0).

The prototype reached this branch through the verified diff at `oob repo:wildfire-model/wm48-harness/verified-implementation.diff`, which is a snapshot of the same work rebased onto the prototype rather than built onto master. Where the two differ, the branch is what shipped, and each difference is recorded in the step it belongs to. The ink derivation stays private inside the pinning test, which is what the requirements spec describes; `TILE_DIR` and `VEGETATION_TILE_FILES` are exported.

**The config field is `showVegetationKey`, not `texturedTerrain`.** The rename landed with the config collapse. It puts the field in the existing `show<Thing>` family (`showBurnIndex` is the authoring precedent; `showModelDimensions`, `showZoneLines` and `showCoordsOnClick` are the default-off ones) and makes the config key, the MobX flag and the on-screen label one name. Verified live: `?showVegetationKey=true` opens with the switch on and the tiles fetched, `?texturedTerrain=true` is now inert, and the old key is gone from the config object entirely. `CLAUDE.md`'s URL-param table gains a row in this story.

Where a figure is an estimate rather than a measurement, it says so.

## Commit order, and why the performance fix goes first

The requirements spec fixes three commits: the terrain work, the switch work, and the untextured-path performance fix. It does not fix their order, and the order matters more than it looks.

**The performance fix lands first, against master.** It is a four-line change to one function, and against master it is reviewable in isolation: a reviewer can diff it, see that no output changes, and check byte-identity against master directly. Landing it last instead would put the same four lines on top of an already-restructured `updateColors`, where the same change is much harder to reason about and reads as an afterthought inside a feature commit.

It also removes an estimate from the story. The Chromebook figure of **39.0ms** was measured on a build that already had the hoist. Ordering the hoist first makes that number apply to the terrain commit as it will actually be reviewed. Ordering it last would leave the terrain commit's own Chromebook cost unmeasured, at an estimated ~46ms; still under the 66.5ms clamp, but estimated rather than known, and there is no reason to accept an estimate that the ordering can eliminate.

---

## Implementation Plan

### Stop the terrain render loop recomputing unobserved MobX computeds

**Summary**: `updateColors` passes `simulation.gridWidth` and `simulation.gridHeight` to `setVertexColor` once per cell, from a `useLayoutEffect` rather than from inside a reaction. Both are `@computed` (`simulation.ts:82-87`), and an unobserved computed re-evaluates on every read, so the default untextured render spends about 9.3ms per tick on 76,800 recomputes that return the same two numbers. Hoisting them changes no output. This is master's bug rather than this story's, and it lands here as its own commit because the story rewrites the very argument list the fix edits (see the resolved open question in the requirements spec).

**Files affected**:
- `src/components/view-3d/terrain.tsx`: hoist the reads out of the two per-cell loops

**Estimated diff size**: ~10 lines

Before:

```tsx
const updateColors = (geometry: THREE.PlaneGeometry, simulation: SimulationModel) => {
  const colArray = geometry.attributes.color.array as number[];
  const debugColors = simulation.config.tpiDebug ? computeTpiDebugColors(simulation) : undefined;
  simulation.cells.forEach(cell => {
    setVertexColor(colArray, cell, simulation.gridWidth, simulation.gridHeight, simulation.config, debugColors);
  });
  (geometry.attributes.color as BufferAttribute).needsUpdate = true;
};
```

After:

```tsx
const updateColors = (geometry: THREE.PlaneGeometry, simulation: SimulationModel) => {
  const colArray = geometry.attributes.color.array as number[];
  const debugColors = simulation.config.tpiDebug ? computeTpiDebugColors(simulation) : undefined;
  // gridWidth and gridHeight are @computed, and read from an effect rather than a
  // reaction they have no observers, so MobX re-evaluates them on every read.
  // Hoisting keeps two recomputes per cell off the per-tick path. `config` is a
  // plain object, grouped here only to keep the three reads together.
  const { gridWidth, gridHeight, config } = simulation;
  simulation.cells.forEach(cell => {
    setVertexColor(colArray, cell, gridWidth, gridHeight, config, debugColors);
  });
  (geometry.attributes.color as BufferAttribute).needsUpdate = true;
};
```

`setupElevation` has the same shape at `terrain.tsx:166` and gets the same treatment. It runs on elevation change rather than per tick, so it is a tidy-up rather than a fix, and it is in this commit because leaving one of the two behind invites the next reader to conclude the pattern is deliberate.

`updateBurnState`, which arrives with the terrain commit, has the same shape and gets the same treatment there: it reads `simulation.gridWidth` per cell on the textured path's per-tick loop, which is 38,400 recomputes a tick. `simulation.time` is hoisted alongside it. That keeps the requirement "no per-cell loop in `terrain.tsx` reads `simulation.gridWidth` or `simulation.gridHeight`" true of the whole file rather than of two of its three loops, and it is orthogonal to the separate decision that `updateBurnState` stays whole-grid-per-tick.

**Verification**: `updateColors` measured 17.19ms/tick before and 7.88ms/tick after, taking the untextured desktop burning median from 20.0ms to a vsync-capped 16.7ms and the Chromebook's from **36.8ms to 28.6ms**. Renders pixel-identically: production builds of master and of this change, `mountainsandplainsTwoZone`, terrain canvas only, differ in 0 of 1,409,280 channel samples in both the initial view and a driven burnt state.

---

### Bring the textured terrain across from the prototype

**Summary**: the prototype's shader, loader, extracted palette and restructured `terrain.tsx`, with four changes: the exploratory config collapses to what an activity would author, the demo build's version banner comes out, the texture loader stops keying its lifetime on the switch, and the near-edge predicate stops being evaluated per cell per tick. Gated on `ui.showVegetationKey`, which the next commit adds; until then it is reachable through `?showVegetationKey=true`, which seeds the same flag.

**Files affected**:
- `src/components/view-3d/terrain-shader.ts`: from the prototype, plus a comment naming its test mirror
- `src/components/view-3d/terrain-textures.ts`: from the prototype, with the retention fix, and `TILE_DIR` / `VEGETATION_TILE_FILES` exported for WM-53
- `src/components/view-3d/terrain-colors.ts`: from the prototype, unchanged
- `src/components/view-3d/terrain.tsx`: from the prototype, plus the cached edge mask
- `src/components/view-3d/terrain-glyph-colors.test.ts`: new
- `src/config.ts`: three fields rather than nine
- `src/models/ui.ts`: the flag
- `src/models/stores.ts`: seed it from `config.showVegetationKey`
- `src/public/terrain-textures/*.svg`: four tiles, unchanged
- `scripts/measure-terrain-textures.mjs`: unchanged
- `CLAUDE.md`: the `showVegetationKey` URL-param row, and a commands row for the tile checker

**The flag lands here rather than with the switch**, because `terrain.tsx` reads `ui.showVegetationKey` and this commit does not compile without it. It is also what makes the commit's own claim true: `?showVegetationKey=true` reaches the terrain through `stores.ts` seeding the flag, so the textured render is reachable and reviewable one commit before the control that drives it exists. The switch commit then adds only the control.

**The demo version banner needs no removal.** It was added by the prototype's own commit, and this work is built onto master rather than rebased on top of the prototype, so the banner never exists. `top-bar.tsx` and `top-bar.scss` stay byte-identical to master, which is the property the requirements spec asks for, reached by a shorter route.

**Measured diff size**: ~1800 lines (12 files, +1713 / -44 tracked against `98858e5`, plus the 90-line new test), most of it the prototype's shader and loader arriving unchanged. An earlier estimate of ~950 was never plausible, since the prototype alone is +1678.

#### The config collapses from nine fields to three

`showVegetationKey`, `terrainGlyphContrast` and `terrainGlyphContrastBurnt` survive. The first is now the initial value of `ui.showVegetationKey` rather than the render gate, and its comment has to say so. The other two survive because they are what produce the five stroke colors the board authored, so they are designer-visible parameters rather than tuning dials.

The other six become module constants in `terrain-shader.ts`: `terrainTextureTileFt`, `terrainTextureHighlight`, `terrainBurnEdgeNoiseScale`, `terrainBurnEdgeSoftness`, `terrainTextureMacroAmount`, `terrainTextureSlopeFade`. Keep the prototype's comments on them; they explain non-obvious mechanisms (particularly why the tile size must be counter-intuitively large) and those reasons survive the move.

Note on `terrainTextureTileFt`: it is a ground distance, so holding it constant means a tile covers the same 18,000 ft everywhere and the repeat count varies with model size (6.7 across the default 120,000 ft model, 5.6 across the 100,000 ft presets). That is the correct behavior for a map symbol and is why it does not need to be config.

#### The tile filename map becomes an export, for WM-53

WM-53 textures the Setup panel's thumbnails from the same four tiles, and its spec names this map by name and module: *"the tile filename per vegetation type comes from one map shared with WM-48 (`VEGETATION_TILE_FILES` in `terrain-textures.ts`), not from a second copy and not from `Vegetation[v].toLowerCase()`, which does not produce `forest-with-suppression`"*. That hazard is real and non-identity in exactly one of four cases, which is the case a second copy would get wrong.

Both consts are module-private today. The whole change is two keywords:

```ts
// terrain-textures.ts
export const TILE_DIR = "terrain-textures/";
export const VEGETATION_TILE_FILES: Record<Vegetation, string> = { /* unchanged */ };
```

No `tileUrl` helper: WM-53 names the map, not a URL builder, and a helper with no caller in this story is the shape reviewers here flag.

#### The ink derivation stays private in the test

An earlier draft of this plan exported `glyphInkHex`, `glyphInkForDrought` and `glyphInkForBurnt` from `terrain-colors.ts` for WM-53 to import. That is not being built, and the reasoning is recorded in the resolved question below. In short: the TypeScript mirror has to exist for the pinning test either way, the only question is where it lives, and exporting it now ships production code whose sole caller is a test, to serve a consumer whose rendering mechanism is not yet decided.

`terrain-shader.ts`'s `wfInk` gets a comment naming `terrain-glyph-colors.test.ts` as its mirror, so an edit to the GLSL is at least told where the TypeScript copy lives.

One further value comes across from the palette rather than being retyped: the prototype's `uBurningColor` uniform hardcodes `[1, 0, 0]` while `terrain-colors.ts` exports `BURNING_COLOR` as the same triple, and the shader already imports four other palette values from there. It imports the fifth, so retuning the burning red cannot leave the shader and the vertex-color path disagreeing.

#### The texture loader stops keying its lifetime on the switch

The prototype's `useTerrainTextures(enabled)` disposes on every switch-off while continuing to return the disposed texture, and re-fetches and re-rasterizes all four tiles on every switch-on. **Reproduced live**: three off/on cycles produced **3 loads and 3 disposes**. The fix ties disposal to the texture's own lifetime instead. **Re-measured after the fix: 1 load and 0 disposes across the same three cycles**, still zero loads while the key has never been on, and the terrain still renders correctly afterwards rather than against a stale texture.

```ts
export const useTerrainTextures = (enabled: boolean): TerrainTextures | null => {
  const { gl } = useThree();
  const [textures, setTextures] = useState<TerrainTextures | null>(null);

  // The tiles are loaded on first use and then kept for the life of the page: the
  // switch gates whether the textured material renders, not whether the tiles
  // exist. Keying the load on the live switch value instead disposes the texture
  // on every switch-off while this hook keeps returning it, so the next switch-on
  // renders a frame against a disposed texture and re-fetches and re-rasterizes
  // all four tiles.
  useEffect(() => {
    if (!enabled || textures) return;
    let cancelled = false;
    loadTerrainTextures(gl.capabilities.getMaxAnisotropy()).then(result => {
      if (cancelled) {
        result.vegetationTiles.dispose();
        return;
      }
      setTextures(result);
    }).catch(error => {
      // Falling back to the untextured terrain is the right failure mode here: the
      // sim stays fully usable and only loses the surface detail. The message
      // carries the URL that failed, which is what makes a bad deployment path a
      // glance rather than an investigation.
      // eslint-disable-next-line no-console
      console.error("[terrain-textures] disabled:", error);
    });
    return () => { cancelled = true; };
  }, [enabled, gl, textures]);

  // Disposal is tied to the texture's own lifetime rather than the switch's, so it
  // happens on unmount and never on a toggle.
  useEffect(() => () => {
    textures?.vegetationTiles.dispose();
  }, [textures]);

  return textures;
};
```

Loading stays lazy rather than eager: measured at **70ms cold and ~25ms warm** on desktop to fetch, rasterize and pack all four tiles, so roughly 170ms cold on the Chromebook. That is a one-time cost on the first switch-on, against paying it on every page load for a feature that is off by default.

#### The near-edge predicate is precomputed instead of evaluated per cell per tick

`isNearTerrainEdge` calls `simulation.isTerrainEdge` five times per cell, and each call reads up to two unobserved computeds, so the textured path pays up to 384,000 recomputes a tick. It is gated behind `baseColorOnly`, so only the textured path pays it. The predicate depends only on grid dimensions and `fillTerrainEdges`, none of which change during a run.

```tsx
// Cells on or next to the terrain edge, built once per grid rather than evaluated
// per cell per tick. Inline, the five isTerrainEdge calls per cell cost 16.5ms a tick
// at 38,400 cells, almost all of it MobX re-evaluating the two unobserved @computed
// dimensions each call reads. Built here the slow path runs once, which is free. Null
// when the textures are off, the only case with no consumer.
const useNearEdgeMask = (simulation: SimulationModel, enabled: boolean) => {
  const { gridWidth, gridHeight } = simulation;
  const { fillTerrainEdges } = simulation.config;
  return useMemo(() => {
    if (!enabled) return null;
    const mask = new Uint8Array(gridWidth * gridHeight);
    // fillTerrainEdges gates isTerrainEdge entirely, so with it off no cell is an
    // edge and the all-zero mask is already the answer. Read here rather than only
    // named as a dependency, so the memo is invalidated on a value it truly uses.
    if (!fillTerrainEdges) return mask;
    const edge = (x: number, y: number) => simulation.isTerrainEdge(x, y);
    for (let y = 0; y < gridHeight; y++) {
      for (let x = 0; x < gridWidth; x++) {
        mask[y * gridWidth + x] = (edge(x, y) || edge(x - 1, y) || edge(x + 1, y) ||
          edge(x, y - 1) || edge(x, y + 1)) ? 1 : 0;
      }
    }
    return mask;
  }, [enabled, simulation, gridWidth, gridHeight, fillTerrainEdges]);
};
```

The mask is passed into `updateColors` and `updateVegetationWeights`, replacing both call sites of `isNearTerrainEdge`, which is module-private with no other importers and is deleted. See the resolved question below for the measurements behind the shape, and for why the builder calls `isTerrainEdge` rather than reimplementing it.

**The memo reads `fillTerrainEdges` rather than only listing it.** An early draft named it as a dependency without using it in the body, because the body calls `simulation.isTerrainEdge`, which reads the flag internally. `exhaustive-deps` correctly flags that as an unnecessary dependency, and it is not one: with the flag off the mask must be rebuilt. Silencing the rule was the wrong fix. The shipped memo short-circuits on the flag instead, which is both true to `isTerrainEdge`'s own semantics (`simulation.ts` returns `!!this.config.fillTerrainEdges && (...)`, so it is false for every cell when the flag is off and the all-zero mask is already the answer) and makes the dependency real. Lint is clean with no disable.

**Verification, re-measured 2026-08-27 on the built code.** Textured and burning on `plainsTwoZone` at 950x880, sampling 230 animation frames on two dev servers side by side (the same tree with and without this work):

| | inline predicate | hoist + mask |
|---|---|---|
| median frame | 49.7ms | **21.0ms** |
| p95 | 70.0ms | **29.4ms** |
| worst | 102.4ms | **35.4ms** |
| frames past the 66.5ms clamp | 15 of 230 | **0 of 230** |

The five-call predicate itself was timed in-page over all 38,400 cells, which is build-independent and isolates the mechanism: **21.8ms inline against 0.7ms for the mask lookup**, with both classifying exactly the same 1,348 cells as near-edge (`agree: true`). That is the same 1,348 the earlier bench found, so the mask is not merely faster but identical in verdict.

This is a desktop, not the Chromebook the requirement is written against, so the absolute numbers are not the ones to quote in the PR; the Chromebook figures (82.2ms with 100% of frames past the clamp, to 39.0ms with 0%) remain the story. What the desktop run adds is that the clamp is cleared here too, on the actual built code rather than on probe-instrumented code.

**Renders pixel-identically, both paths.** Production dev builds of the tree with and without this work, `mountainsandplainsTwoZone` with a rule set loaded, 3D canvas region only: **0 of 722,000 pixels differ, max channel delta 0**, with the key off *and* with it on. So the mask reproduces the inline predicate exactly, and the untextured default path is untouched.

#### The hex-pinning test

```ts
// src/components/view-3d/terrain-glyph-colors.test.ts
import { getTerrainColor, BURNT_COLOR } from "./terrain-colors";
import { getDefaultConfig } from "../../config";
import { DroughtLevel } from "../../types";

// `wfInk` and `inkFor` are private TypeScript mirrors of the GLSL, defined above
// in this file. See the resolved question on the WM-53 exports for why they are
// not exported from terrain-colors.ts.
describe("terrain glyph ink derivation", () => {
  const config = getDefaultConfig();

  it("keeps the drought colors the shader derives ink from", () => {
    expect(getTerrainColor(DroughtLevel.NoDrought)).toEqual([0.008, 0.831, 0.039]);
    expect(getTerrainColor(DroughtLevel.MildDrought)).toEqual([0.573, 0.839, 0.216]);
    expect(getTerrainColor(DroughtLevel.MediumDrought)).toEqual([0.757, 0.886, 0.271]);
    expect(getTerrainColor(DroughtLevel.SevereDrought)).toEqual([0.784, 0.631, 0.271]);
    expect(BURNT_COLOR).toEqual([0.2, 0.2, 0.2]);
  });

  it("keeps the contrast targets the board's colors were authored against", () => {
    expect(config.terrainGlyphContrast).toEqual([6, 6, 6, 7]);
    expect(config.terrainGlyphContrastBurnt).toEqual(6);
  });

  it("derives exactly the five stroke colors on the Terrain Textures board", () => {
    const [none, mild, medium, severe] = config.terrainGlyphContrast;
    expect(inkFor(getTerrainColor(DroughtLevel.NoDrought), none)).toBe("#004001");
    expect(inkFor(getTerrainColor(DroughtLevel.MildDrought), mild)).toBe("#2D460B");
    expect(inkFor(getTerrainColor(DroughtLevel.MediumDrought), medium)).toBe("#424F12");
    expect(inkFor(getTerrainColor(DroughtLevel.SevereDrought), severe)).toBe("#241B06");
    expect(inkFor(BURNT_COLOR, config.terrainGlyphContrastBurnt)).toBe("#B3B3B3");
  });

  it("takes the lighten branch only for burnt ground", () => {
    // The threshold is (0.05 * ratio) - 0.05, so it is derived from each level's
    // own contrast target rather than from the ratio most of them share: severe is
    // configured at 7, not 6. This is the case that proves the mechanism, since it
    // is what produces a light gray ink on dark ground with no separate ash color.
    ...
  });
});
```

**Both assertions in this file earn their place, and the mutations differ.** Retuning `terrainGlyphContrast` from `[6, 6, 6, 7]` to `[6, 6, 6, 6]` fails the contrast test and the derivation test. Nudging a drought color by 0.037 (a visible change) fails the color test and the derivation test, which reports `#2E4C0C` against `#2D460B`. But nudging one by 0.001 fails **only** the color-equality test: the derived hex rounds to the same byte. So the explicit color assertion is not redundant with the derivation assertion, and a reviewer who proposes collapsing them should be shown that third case. Editing the GLSL body escapes both, which is stated in the requirements spec and is why the requirement is worded as guarding the inputs.

---

### Add the Vegetation Key switch

**Summary**: the switch does not exist in the prototype; this is the half that is new rather than already built. A purpose-built two-state toggle in the bottom bar between Setup and Spark, writing `ui.showVegetationKey`, which the previous commit's terrain already reads.

**Files affected**:
- `src/components/vegetation-key-switch.tsx`, `.scss`: new
- `src/components/bottom-bar.tsx`, `.scss`: insert the widget group
- `src/components/bottom-bar.test.tsx`: the button-count assertion, and the persistence case
- `cypress/e2e/bottom-bar-visuals.cy.ts`: the widget inventory, the cluster width, and the adjacency list
- `src/components/vegetation-key-switch.test.tsx`: new
- `src/hazbot/wildfire/translate.ts`: explicit no-op cases
- `LOGGED-EVENTS.md`: one row per new event, matching the `ChartTabShown` / `ChartTabHidden` wording at `:60-61`

The flag and its seeding are not here: they land with the terrain commit, which does not compile without them. See that step.

**Measured diff size**: ~250 lines (5 files, +23 / -1 tracked, plus 217 lines of new files)

#### The flag

```ts
// ui.ts
// Vegetation Key. Pure view state, like showChart: it survives both Restart and
// Clear All, neither of which touches it. Seeded from config.showVegetationKey
// in stores.ts, so ?showVegetationKey=true opens a task with the key already on.
// WM-53's Setup-panel textures read this same flag.
@observable public showVegetationKey = false;
```

```ts
// stores.ts, immediately after `const ui = new UIModel();`
ui.showVegetationKey = simulation.config.showVegetationKey;
```

Seeded here rather than in the `UIModel` constructor because this is where the resolved config exists. Persistence across Restart and Clear All needs no code: `handleClearAll` clears exactly two `ui` fields by hand and `simulation.reload()` touches none, so a new field is persistent by default, which is the behavior the requirements spec wants.

#### The component

The full source is in the verified diff; the shape is a `Button` wrapping an absolutely positioned label and a switch group, and the geometry comes straight off the board. It is an MUI `Button` rather than a `div` for one reason worth recording: the board's hover and select states are a white highlight behind the thumb at 50% and 100% opacity, and a white highlight is only visible because the button's own hover background darkens the bubble underneath it. Measured on the existing Spark button, hover takes the bubble from `#FFFFFF` to `#E0E0E0`. A plain `div` would get no hover background and the highlight would be white on white.

That 0 / 0.5 / 1 progression is not an interpretation of the board's note: it is exactly what `icon-button.scss:19-39` already does for every other bottom-bar control, so the switch is following an in-repo convention rather than inventing one.

```scss
.thumbHighlight { opacity: 0; }
.vegetationKeySwitch:hover .thumbHighlight { opacity: 0.5; }
.vegetationKeySwitch:active .thumbHighlight { opacity: 1; }
```

**The 90 is written once.** `bottom-bar.scss`'s `.vegetationKey` owns it and the button fills its group with `width: 100%`, rather than both files naming 90 with near-duplicate comments. `min-width: 0` is what makes the fill work, since MUI's `.MuiButton-root { min-width: 64px }` would otherwise be the floor. This differs from `.placeSpark`, which does repeat its 60 in both places, because there the inner control is an `IconButton` whose own `width: 100%` creates the circular-sizing dependency the comment above it describes; the switch has no such rule of its own.

**Every dimension below was read off the board's own layer data and then measured in the running app.**

| piece | board | measured |
|---|---|---|
| widget group | 90 content / 92 border | 90 / 92 |
| label | (10, 4) 70x34, Lato Bold 14, `#434343` | (10, 4) 70x34, 700 14px, `rgb(67,67,67)` |
| switch group | (22, 40.5) 46x28 | (22, 41) 46x28 |
| track | (9, 9) 28x10, `#d8d8d8`, 1px `#797979`, radius 11 | (9, 9) 28x10, `rgb(216,216,216)`, 1px `rgb(121,121,121)`, 11px |
| thumb, off / on | left 0 / 18 | left 0 / 18 |
| track fill, on | `#2997ff` | `rgb(41,151,255)` |

The label's newline is authored (`"Vegetation\nKey"` plus `white-space: pre-line`) rather than left to wrapping. The board's text layer content is literally `"Vegetation\nKey"`, and the repo already uses that exact pattern at `wind-circular-control.scss:69-70`.

#### The Cypress layout guard has to move with the bar

`bottom-bar-visuals.cy.ts` is a visual-regression guard that pins the bar's geometry, and inserting a widget invalidates three of its assertions: it asserts `.mainContainer` is 481 wide under the name "shrink-wraps the controls cluster to its **seven** widget groups", and its adjacency list asserts a 3px gap for `Setup -> Spark`, an adjacency that no longer exists. Both fail. The suite's 43-of-43 figure was measured on the rebased prototype, which has the terrain work but not the switch, so it did not cover this.

The fix is the inventory rather than the numbers: the widget list gains `vegetation-key-switch` at 92 (90 content + 2 border), the cluster assertion becomes eight groups at 576, and the adjacency list gains `Setup -> Vegetation Key` and `Vegetation Key -> Spark` at the default 3px each. The rect buffer is built by a `forEach` that pushes one entry per id, so it also gains a length assertion against `ids.length`: without one, a widget that stops resolving to a `widgetGroup` shortens the buffer and the later index comparisons read the wrong pairs or silently compare `undefined`. **43 of 43 on the shipped branch**, re-run with the switch in place.

#### What it does to the bottom bar

Measured at 950x880 with a rule-set loaded, with the real switch rather than a cloned placeholder:

| | before | after |
|---|---|---|
| `.mainContainer` | 481 | **576** |
| `.leftContainer` | 244.5 | **180** |
| `.rightContainer` | 224.5 | **194** (its content floor: Hazbot 122 + 10 + fullscreen 62) |
| center offset from viewport center | 10px right | **7px left** |
| `document.body.scrollWidth` | 950 | 950, no overflow |

Every number the requirements spec asks the PR body to quote is confirmed. Note the numbers depend on a rule-set being loaded: without one the Hazbot button is absent, `.rightContainer` is 177 rather than 194 and the offset stays 10px right. Quote the rule-set-loaded numbers, since that is the configuration activities ship.

#### Logging

```tsx
ui.showVegetationKey = !ui.showVegetationKey;
log(ui.showVegetationKey ? "VegetationKeyShown" : "VegetationKeyHidden");
```

with the pair added to the existing no-op group in `translate.ts:64-66`, alongside `ChartTabShown` / `ChartTabHidden`:

```ts
    case "ChartTabShown":
    case "ChartTabHidden":
    case "VegetationKeyShown":
    case "VegetationKeyHidden":
    case "AnalysisEngineActivated":
    default:
      return { kind: "no-op" };
```

Explicit cases rather than letting `default` absorb them, matching how the chart-tab pair is already written: the point is that a reader can see the events were considered.

#### Tests

`bottom-bar.test.tsx:96` asserts seven buttons and becomes eight. **Do not just move the number.** A bare count does not say the eighth button is the switch, so the assertion gains a companion:

```tsx
// Clear All, Setup, Vegetation Key, Spark, Restart, Start, Fireline, Helitack.
expect(screen.queryAllByRole("button").length).toEqual(8);
expect(screen.getByTestId("vegetation-key-switch")).toBeInTheDocument();
```

A new `vegetation-key-switch.test.tsx` covers the four things that can silently break: that the key starts off by default, that `?showVegetationKey=true` opens it on, that clicking toggles the flag and logs the correctly paired event, and that the click leaves `simulation.config` alone. **Mutation-checked**: swapping the two log event names fails the toggle test, writing the wrong field fails two cases, and deleting the seeding line in `stores.ts` fails the URL case on its `ui` assertion specifically, with the `config` assertion still passing, so it isolates the seeding rather than the parsing.

`bottom-bar.test.tsx` gains one more case beyond the button count, for the requirement that the key survives Restart and Clear All. Nothing else asserts it, and it is a requirement guarded by an absence: no line implements it, so the mutation it catches is a reset being *added* to `handleClearAll`, which was verified to turn it red. Each half asserts the reset it rode on actually happened, so neither can pass by clicking a disabled button.

---

## Open Questions

### RESOLVED: Do the WM-53 exports (`VEGETATION_TILE_FILES`, the ink helpers) land here?
**Context**: WM-48 does not itself need a TypeScript copy of the ink derivation, because the shader derives it in GLSL. The pinning test needs one. WM-53 needs the tile filename map, and needs the resulting hexes as CSS values.

**Decision (2026-08-27, revised): export the filename map, keep the ink derivation private.** An earlier pass resolved to export both. That is reversed for the ink half on evidence gathered since, and the two halves turn out to be very different asks.

**The map is exported.** WM-53's spec names `VEGETATION_TILE_FILES` in `terrain-textures.ts` explicitly, its failure mode is confirmed (`Vegetation[3].toLowerCase()` does not produce `forest-with-suppression`, so a second copy is wrong in one of four cases), and the change is two `export` keywords. A filename that has to agree in two places is exactly what this codebase keeps being reviewed for.

**The ink stays in the test, because the question the export was answering is not yet decided.** The four tiles contain exactly two colors, `#808080` for the background rect and `#2A2A2A` for the glyph strokes, counted across all four files: they are pure grayscale and fully opaque. So *"the texture's ink color follows the drought level"* cannot be satisfied by using a tile as a plain CSS `background-image`, and **WM-53's spec never picks the recoloring mechanism.** That choice determines what it needs from here:

- `mask-image` plus `background-color` needs one color value per zone, and a table or a function both serve.
- A CSS `filter` chain, like the drought tints already at `zone-selector.scss:63-80`, needs no color values at all.
- Pre-colored tile copies need neither, and change what the tiles are.

Exporting a `glyphInkForDrought(level, config)` today is guessing which of those WM-53 picks. If it takes the filter route the export is dead code. If it takes the mask route the five hexes are trivially available anyway: the requirements spec tables all five, the board carries them as swatches, and `terrain-glyph-colors.test.ts` pins them. The ink is the easy half to hand over; the mechanism is the hard half, and no export solves it.

**What that costs, stated plainly**: the mirror lives in the test until WM-53 promotes it, and WM-53's spec is currently written as though the palette arrives from here. That is now an open question on WM-53 rather than an assumption. At no point do two copies of the derivation exist, which is the property the original decision was reaching for.

**One argument from the earlier decision does not survive**: that exporting makes the pinning test "assert the exported production function rather than a private copy that could drift from one". A private copy cannot drift from a function that does not exist.

**Still true and unchanged**: if the ink is ever exported it has to be a function rather than a frozen table, because `getUrlConfig` parses `terrainGlyphContrast` from the URL, so an override changes what the shader draws. Verified: at `?terrainGlyphContrast=[6,6,6,9]` the severe ink goes from `#241B06` to `#000000`, which is also the clamp-to-black boundary the prototype's config comment warns about.

---

### RESOLVED: Where does the near-edge mask live, and does it duplicate the edge predicate?
**Context**: The draft built the mask by re-implementing `edge(x, y)` inline, which copies `isTerrainEdge`'s deliberate off-by-one (`y === gridHeight`, not `gridHeight - 1`) into a second file. That is what made the placement a question: keep it in `terrain.tsx` and duplicate the predicate, or move it onto `SimulationModel` where the off-by-one is documented.

**Decision (2026-08-27): neither. The mask stays in `terrain.tsx` and calls `simulation.isTerrainEdge` to build itself.** The premise was wrong: the builder runs **once per grid**, not per tick, so it can afford the slow predicate. Duplicating it bought nothing.

Measured over all 38,400 cells of `plainsTwoZone`, five calls per cell, every variant classifying identically (1,348 near-edge cells):

| variant | ms per evaluation |
|---|---|
| via `simulation.isTerrainEdge`, as today | 16.5 |
| the same predicate reading `this.config.*` instead of the computeds | 6.6 |
| hoisted locals | 0.7 |
| precomputed `Uint8Array` mask lookup | 0.4 |

So the mask recovers 16.1 of 16.5ms and paying the full 16.5ms once at grid-build time is free. `isNearTerrainEdge` is module-private with no importers, so it goes.

The hook's source is above, in the terrain step; it is not repeated here.
**Noted and deliberately not done**: `isTerrainEdge` itself reads the two computeds, and changing it to read `this.config.*` would take it from 16.5 to 6.6ms for every caller. After this change nothing calls it per tick (`populateCellsData` calls it once per cell at load, the TPI scan once per spark), so it is a speculative optimization with no measured user-facing benefit and it stays out.


## Self-Review

Roles: Senior Engineer, QA Engineer, Visual Design Reviewer, Release Engineer. Every finding was checked against a built tree rather than read off this document. Where a claim was testable, it was tested: the suite was run, mutations were applied and reverted, and the switch was measured and pixel-sampled in a browser against a dev server. Every finding below was resolved on the shipped branch. Baselines on the head commit: **1019 passed of 1019 across 81 suites**, `eslint` **0 errors and no warnings in any touched file**, `tsc --noEmit` clean in project source apart from the two known `line-chart.tsx` errors, and **22 files changed, 10 modified (+288 / -45) plus 12 new files (1775 lines)**.

### Senior Engineer

#### RESOLVED: The `texturedTerrain` to `showVegetationKey` rename did not reach four places in this plan, and one of them is a code block

`:15` states the rename landed, that `?texturedTerrain=true` is now inert, and that the old key is gone from the config object entirely. The built tree agrees: `config.ts` declares `showVegetationKey`, and `stores.ts:32` reads `ui.showVegetationKey = simulation.config.showVegetationKey`. Four passages still carry the old name:

- `:80` says the terrain is "reachable through `?texturedTerrain=true`, which seeds the same flag". It is not; that param is inert.
- `:97` says "`texturedTerrain`, `terrainGlyphContrast` and `terrainGlyphContrastBurnt` survive. The first is now the initial value of `ui.showVegetationKey`".
- `:352` is a code comment in the `ui.ts` block: "Seeded from config.texturedTerrain in stores.ts so ?texturedTerrain=true still opens the app with the key on." The shipped comment says `showVegetationKey`.
- `:359` is the `stores.ts` code block itself: `ui.showVegetationKey = simulation.config.texturedTerrain;`.

The last one matters most, because it is presented as the code to write and it would not compile against the shipped config. Anyone implementing from this plan rather than from the built diff writes a broken line and loses the authoring parameter Trudi asked for by name.

**Decision**: correct all four to the shipped name. `:80`'s parameter becomes `?showVegetationKey=true`, `:97` names `showVegetationKey` as the surviving field, and the `ui.ts` comment and the `stores.ts` block become `ui.showVegetationKey = simulation.config.showVegetationKey;`. No trade-off exists: the built tree is the authority, `texturedTerrain` is gone from the config object entirely, and the plan already says so at `:15`.

---

#### RESOLVED: `useNearEdgeMask` is specified twice, and both copies are the superseded draft

The hook appears in full at `:248-262` and again, byte-identical, at `:486-500`. Both show `useNearEdgeMask(simulation)`, a single parameter, always returning a `Uint8Array`. The built hook is `useNearEdgeMask(simulation, enabled)`, returns `null` when the textures are off, and short-circuits on `fillTerrainEdges`:

```tsx
const useNearEdgeMask = (simulation: SimulationModel, enabled: boolean) => {
  const { gridWidth, gridHeight } = simulation;
  const { fillTerrainEdges } = simulation.config;
  return useMemo(() => {
    if (!enabled) return null;
    const mask = new Uint8Array(gridWidth * gridHeight);
    if (!fillTerrainEdges) return mask;
    ...
  }, [enabled, simulation, gridWidth, gridHeight, fillTerrainEdges]);
};
```

The prose at `:267` describes the `fillTerrainEdges` short-circuit and explains why silencing `exhaustive-deps` was the wrong fix, so the document knows about a change that neither code block shows. The `enabled` parameter and the `null` return are described nowhere at all, yet they are what let the call sites read `if (cellData && nearEdgeMask)` and `!!nearEdgeMask?.[...]`.

The short-circuit's premise was checked and holds: `simulation.ts:196` is `return !!this.config.fillTerrainEdges && (...)`, so with the flag off no cell is an edge and the all-zero mask is the correct answer.

Two copies of the same stale block in one document is also the "one source of truth" problem the repo's own review standard names. The second copy sits under a resolved open question whose reasoning is still worth keeping; the code block under it is not.

**Decision**: replace the block at `:248-262` with the shipped two-argument version, including the `enabled` parameter, the `null` return and the `fillTerrainEdges` short-circuit, and delete the duplicate under the resolved question, keeping that question's prose and its measurement table. One copy, matching what is built.

---

#### RESOLVED: The two WM-53 exports are specified across roughly 85 lines, disclaimed in one, and unbuilt

`:103-186` specifies `TILE_DIR`, `VEGETATION_TILE_FILES`, `tileUrl`, `glyphInkHex`, `glyphInkForDrought` and `glyphInkForBurnt`, with full source, rationale and a comment block. A resolved open question at `:440-459` decides to export them and prices the cost. The step's own "Files affected" promises "`terrain-colors.ts`: from the prototype, **plus the exported ink derivation**" and "`terrain-textures.ts`: ... **and the tile-URL export**". The hex-pinning test at `:288` imports `glyphInkHex` from `./terrain-colors`.

None of it exists. Verified in the built tree: `terrain-textures.ts` keeps `TILE_DIR` and `VEGETATION_TILE_FILES` module-private, `terrain-colors.ts` exports no ink helper, and the shipped `terrain-glyph-colors.test.ts` defines a private `wfInk` mirror instead.

`:13` acknowledges this in a sentence and calls it "the one place this plan and the requirements spec disagree", then leaves the full specification standing. So the document simultaneously requires the exports, shows their source, resolves a question about them, and says they are not written. A reader cannot tell which half is current.

This is a decision, not a tidy-up, and it has a consequence outside this story: WM-53's spec names `VEGETATION_TILE_FILES` as one of its two real dependencies on WM-48, and it is being built next. Either the exports land here, or WM-53's spec needs to know it is re-deriving the filename map.

**Decision**: export `VEGETATION_TILE_FILES` and `TILE_DIR`, keep the ink derivation private in the test, and delete the stale specification of both from the plan body. The reasoning, including the tile-grayscale measurement that reframed the ink half, is in the revised open question above. WM-53 gains an open question about its recoloring mechanism rather than an assumption that the palette arrives from here.

---

#### RESOLVED: Inserting `.vegetationKey` into `bottom-bar.scss` orphans the comment that explains `.placeSpark`

The built diff puts the new rule immediately above `.placeSpark`, with no blank line after the eight-line comment that documents why Spark needs an explicit width:

```scss
  // Spark gets an explicit content width to force the inner IconButton to
  // 60 px. Without this, `.iconButton { width: 100%; min-width: 60px }`
  // ... (eight lines) ...
  // has no `width: 100%` and so doesn't trigger the circular sizing.
  // 90 px of content inside the shared 1 px border, per the board's 90/92 group.
  .vegetationKey {
    width: 90px;
  }

  .placeSpark {
```

A reader now sees one nine-line comment block above `.vegetationKey`, eight lines of which are about a different rule, and `.placeSpark` sits under nothing. The fix is to move the new rule below `.placeSpark`, or to put a blank line between the borrowed comment and the new one. Cosmetic, but it is the kind of thing this repo's reviewers do flag.

**Decision**: move `.vegetationKey` below `.placeSpark` so the eight-line comment sits directly above the rule it explains. Shipped that way. The file's rules do not follow bar order anyway (`.clearAll` already sits below `.placeSpark` while Clear All is leftmost), so there is no source-order convention the move breaks.

---

### QA Engineer

#### RESOLVED: The "seeded from config" test cannot fail, and deleting the seeding line leaves the whole suite green

`:434` states that `vegetation-key-switch.test.tsx` covers "that the key starts off and is seeded from config", and that the file was mutation-checked. The first half does not hold. The shipped test is:

```tsx
it("starts off, seeded from config.showVegetationKey", () => {
  expect(stores.simulation.config.showVegetationKey).toBe(false);
  expect(stores.ui.showVegetationKey).toBe(false);
});
```

Both values are `false` by default: `config.showVegetationKey` defaults to `false`, and `ui.showVegetationKey` is declared `= false` on `UIModel`. The assertion is true by construction and says nothing about the assignment in `stores.ts`.

**Mutation-verified this pass.** Commenting out `ui.showVegetationKey = simulation.config.showVegetationKey;` and running the full suite: **1017 passed of 1017, 81 suites, no failures.** So the line that implements `?showVegetationKey=true` can be deleted with zero test signal. That parameter is not incidental: it is a stated requirement, it is what Trudi asked for by name for the Hazbot-enabled tasks, and its failure mode is silent (the app opens with the key off, which is also the correct default appearance).

A real test is cheap, and the repo already has the pattern. `config.test.ts:5-16` stubs `window.location` with a documented capture-and-restore. A throwaway written against it this pass:

```ts
it("opens with the key on when ?showVegetationKey=true", () => {
  setUrl("?showVegetationKey=true");
  const stores = createStores();
  expect(stores.simulation.config.showVegetationKey).toBe(true);
  expect(stores.ui.showVegetationKey).toBe(true);
});
```

It passes on the built tree and fails on the mutation, on the `ui` line specifically (`Expected: true, Received: false`), with the `config` line still passing, so it isolates the seeding rather than the parsing. The throwaway was deleted and `stores.ts` restored.

**Decision**: replace the `starts off, seeded from config` case with the URL-driven one above, keeping a default-off case alongside it, and correct `:434` so it stops claiming the current test covers seeding. The test section then names three real mutations rather than two. The alternative, fixing only the claim, was rejected: it would leave a stated requirement with no coverage at all, and the test costs fifteen lines against a pattern the repo already has.

---

#### RESOLVED: Two new logged events, and `LOGGED-EVENTS.md` is not in any step's file list

The repo maintains `LOGGED-EVENTS.md` as a table of every event the app emits, and it already carries the exact precedents this story models itself on: `ChartTabShown` and `ChartTabHidden` at `:60-61`, `FullscreenEnabled` at `:70`. This story adds `VegetationKeyShown` and `VegetationKeyHidden`.

The file gains no rows. It appears in no step's "Files affected", and the built diff touches only `CLAUDE.md` on the documentation side. `log()` takes a bare `string`, so nothing in the type system or the suite notices.

This is the repo's own "update the prose the change invalidates" repeat offense, against a file whose entire purpose is to be the list. One row per event.

For contrast, the decision *not* to add a `translate.ts` test for the two new cases is right and should stay: `default:` already returns `no-op`, so a test asserting `no-op` for the new names would pass with the explicit cases deleted. That is a test that cannot fail, and it is correctly absent.

**Decision**: add one row per event to `LOGGED-EVENTS.md`, matching the `ChartTabShown` / `ChartTabHidden` wording at `:60-61`, and add the file to the switch step's Files affected.

---

### Visual Design Reviewer

#### RESOLVED: WITHDRAWN. The thumb highlight matches the board, and this finding was a false positive

**This finding claimed the board draws no highlight for this control. That is wrong, and the built code is correct as written.** Recorded rather than deleted, because the way it went wrong is worth not repeating.

The board does draw a thumb highlight, at exactly the opacities the annotation names. Four shapes, each 28 x 28, each a child of the `Slider Thumb` group:

| sourceId | position | fill | row |
|---|---|---|---|
| `DEDEF65D-080C-442C-87DD-18F5D41ACA36` | (400, 855) | `#ffffff80` | off, Hover |
| `7F7289AB-5C1B-422A-8CB5-637F54B06653` | (400, 941) | `#ffffff` | off, Select |
| `DAE2F8A0-D789-443E-9086-4D956DDB8E6B` | (418, 1231) | `#ffffff80` | on, Hover |
| `6BE14C47-1325-4182-B799-580249A8A0D0` | (418, 1317) | `#ffffff` | on, Select |

`#ffffff80` is 50% white and `#ffffff` is 100%, which is the annotation's "icon outline 50% op" and "100% op". Describing the Select shape returns `width: 28px; height: 28px; background: #ffffff;` with **no border radius**. So the board's highlight is a 28 x 28 white **square** sitting behind the thumb art, which is `.thumbHighlight` exactly: same box, same two opacities, same position tracking the thumb through its 18px travel, same behind-the-circle stacking. The hard vertical seam this finding measured at x=28 is the drawn design, not a defect.

**How it went wrong, in two steps.** The `/Highlight/` query was capped at 60 results and silently truncated, and the switch's highlights sit past the cap. Then the absence was read as meaningful because every other control's highlight is named `<Control> Highlight`, so `Vegetation Key Highlight` was expected; the switch's are named plainly `Highlight` and are nested inside `Slider Thumb` rather than beside it. A truncated result set was treated as an exhaustive one. Any future board query that concludes something is *absent* needs its result count checked against its limit first.

**Two related misreadings are corrected with it.** The four rows at y 728 to 1060 are not a switch-only states column: they are four **full bottom-bar rows**, carrying `Clear All Highlight`, `Setup Highlight`, `Spark Highlight`, `Restart Highlight`, `Start Highlight`, `Fireline Highlight` and `Helitack Highlight` at those same y values. That is why their annotations sit at x=916, immediately right of Helitack at x=846, and it means those annotations do cover the switch after all. And the `Vegetation Key Back` change to `#dfdfdf` on hover and select is real but is not the whole treatment: the background and the thumb highlight both change together.

**What survives.** The row identification from thumb position (x=400 off, x=418 on) and the eight `Vegetation Key Back` fills are unaffected, and the track-fill finding below stands on its own evidence.

**Decision**: no change to `.thumbHighlight`, and the requirements bullet describing hover and select as the icon-outline treatment at 50% and 100% is correct as it stands. The only edit is to this section, recording the withdrawal.
---

#### RESOLVED: The track's off fill is `#dfdfdf`, which is also the hover background, so the track disappears on hover

`:376` introduces the geometry table with "Every dimension below was read off the board's own layer data and then measured in the running app; **the two agree**." One row does not:

| piece | board | measured |
|---|---|---|
| track | `#d8d8d8` | `rgb(223,223,223)` |

`rgb(223,223,223)` is `#dfdfdf`, not `#d8d8d8` (`rgb(216,216,216)`). Confirmed at both ends: `common.scss:38` defines `$controlGrayLight1: #dfdfdf`, which is what `.track` uses, and the live computed value is `rgb(223, 223, 223)`.

The first reading of this was that seven levels is invisible and the house token beats a one-off hex, so the only fault was the table's claim of agreement. **Two further checks turned that around, and the substitution is a defect rather than a preference.**

**`#dfdfdf` is the hover background.** `material-ui-theme.tsx:40` sets every MUI `Button`'s hover background to `#dfdfdf`, which is also `$hoverColor` at `common.scss:29`. So `$controlGrayLight1` is not a neutral gray that happens to be near the board's: it is the exact color the widget turns when the pointer is over it. Measured live on the hovered switch, the track interior samples `rgb(223,223,223)` and so does the widget background three pixels from the widget's corner. **The track's fill vanishes into the background on hover and only its 1px `$controlGray` border survives**, which is visible in `tmp/playwright/wm48-hover-track.png`. The board's `#d8d8d8` keeps a seven-level separation and does not do this.

**`#d8d8d8` is already the repo's value for exactly this shape.** `wind-circular-control.scss:109` and `vertical-selectors.scss:102` both paint a small gray element with a `1px solid $controlGray` border as `background-color: #d8d8d8`, which is the switch track's construction precisely. And the board's own layer data confirms the target: the `Switch Back` shape inside every `Vegetation Key Switch` instance carries `fill: #d8d8d8`.

So the board, the repo's two existing instances of the same shape, and the hover behavior all point the same way, and nothing points at `$controlGrayLight1`.

The on fill needs no change: the raw literal `#2997ff` matches `wind-dial.scss:36-37`, which also hardcodes it with a comment naming it as a Zeplin value.

**Decision**: set the track's off fill to `#d8d8d8` and drop the blanket "the two agree" from the table's preamble, since the table is then accurate row by row and needs no escape clause. Leave the on fill as the literal.

---

### Release Engineer

#### RESOLVED: The terrain step's "~950 lines" is roughly half what it measures

`:93` estimates step two at "~950 lines, most of it the prototype's shader and loader arriving unchanged". Measured against `98858e5`:

| | estimate | measured on the head commit |
|---|---|---|
| performance hoist | ~10 | ~10 |
| terrain (incl. the prototype) | ~950 | **~1800** (14 files, +1798 / -43, most of it new) |
| switch | ~200 | ~234 (8 files, +234 / -1) |
| audit follow-ups | - | ~110 (9 files) |
| **whole PR** | ~1160 | **+2063 / -45 across 22 files** |

The switch estimate is accurate; the terrain one is not, and it could not have been, since the prototype alone is +1678 and this step carries it whole. The requirements spec's own figure of "one ~1800-line diff" is much closer to the terrain step alone, and the real total is over 2,000.

This is worth correcting rather than shrugging at, for two reasons that both come from decisions already made. The split decision was argued partly on diff size, on the reasoning that "one ~1800-line diff costs about what two ~900-line ones do", and its stated reversal condition is "review tooling that truncates or degrades on a diff this size". Both are sized against a number that is now known to be low. And the PR body is required to carry measured figures, which this one currently would not.

**Decision**: replace the estimates with the measured figures and drop the "Estimated" framing for the two that are now measured. The requirements spec's "one ~1800-line diff" is corrected to the whole PR at **+2063 / -45 across 22 files**, with the note that ~1800 of it is the terrain step alone.

---

#### RESOLVED: The config triage is nine fields, three kept and **six** collapsed, not five

`requirements.md:267` says the triage is "nine fields, of which three are keeps and five are collapses", which does not add up. Counted in the built `config.ts` diff: kept are `showVegetationKey`, `terrainGlyphContrast` and `terrainGlyphContrastBurnt`; removed are `terrainTextureTileFt`, `terrainTextureHighlight`, `terrainBurnEdgeNoiseScale`, `terrainBurnEdgeSoftness`, `terrainTextureMacroAmount` and `terrainTextureSlopeFade`. Three and six.

The requirements bullet at `:49` gets it right ("nine fields become three", then lists six), and so does this plan at `:95-99`. Only the one summary line in the pointing question is wrong. Trivial, but it is a number in a spec that a PR body may quote.

**Decision**: correct `requirements.md:267` to three keeps and six collapses.
