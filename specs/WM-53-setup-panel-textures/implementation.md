# Implementation Plan: Hazbot: Add textures to Setup panels (when Vegetation Key is on)

**Jira**: https://concord-consortium.atlassian.net/browse/WM-53
**Requirements Spec**: [requirements.md](requirements.md)
**Status**: **In Development**

## Implementation Plan

Four steps, in dependency order. The first two are small and independent of each other; the third is the story and consumes both; the fourth is the pixel case that carries the story's only real guarantee, the Jest assertions being proxies for it. Every measurement quoted below was taken against this branch on 2026-08-28 (head `82f1584`), not inherited from the requirements spec.

---

### Export the glyph ink derivation from `terrain-colors.ts`

**Summary**: The five drought ink hexes exist today only inside a test file. The Setup panel needs them at runtime, so the derivation moves into production code and the test becomes an assertion that the two agree rather than the only place the values live. This is decision E's first amended edit, and it lands here rather than in WM-48 because PR #140 merged on 2026-08-27.

**Files affected**:
- `src/components/view-3d/terrain-colors.ts`: gains the sRGB/linear helpers and the ink derivation
- `src/components/view-3d/terrain-glyph-colors.test.ts`: deletes its private mirror, imports the real thing
- `src/components/view-3d/terrain-shader.ts`: comment now points at `terrain-colors.ts`

**Estimated diff size**: ~90 lines (about 60 added to `terrain-colors.ts`, about 45 deleted from the test)

Append to `terrain-colors.ts`:

```ts
// The shipping copy of this arithmetic is GLSL: `wfInk` in terrain-shader.ts.
// This is a TypeScript mirror of it, and it exists because the Setup panel needs
// the same ink as a CSS color while having no shader to ask. Both must stay in
// step: terrain-glyph-colors.test.ts pins the five hexes this produces, so an
// edit here that changes them turns that test red, but an edit to the GLSL does
// not; that direction is guarded only by the comment on `wfInk`.
//
// The color space is the whole result. A three.js fragment shader works in
// LINEAR space, so the derivation runs on the linearized drought colors and the
// result is converted back for CSS. Running the same formulas on the sRGB values
// instead yields #001501, #101806, #161A08, #0F0C05 and #000000, none of which
// match the board, and burnt comes out black rather than gray.
const srgbToLinear = (c: number) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
const linearToSrgb = (c: number) => c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
const clamp01 = (c: number) => Math.min(1, Math.max(0, c));
const LUMA = [0.2126, 0.7152, 0.0722];

// Mirror of wfInk (terrain-shader.ts). `base` is linear, and so is the result.
const glyphInkLinear = (base: number[], ratio: number) => {
  const baseLum = base[0] * LUMA[0] + base[1] * LUMA[1] + base[2] * LUMA[2];
  const darkLum = (baseLum + 0.05) / ratio - 0.05;
  const lightLum = ratio * (baseLum + 0.05) - 0.05;
  const darkCeiling = (baseLum + 0.05) / 0.05;
  const lightCeiling = 1.05 / (baseLum + 0.05);
  let targetLum: number;
  if (darkLum >= 0) {
    targetLum = darkLum;
  } else if (darkCeiling >= lightCeiling) {
    targetLum = 0;
  } else {
    targetLum = Math.min(lightLum, 1);
  }
  // step(0.01, baseLum) in the GLSL: a base with no chroma to scale falls back
  // to a neutral of the target luminance.
  return baseLum >= 0.01
    ? base.map(c => c * (targetLum / Math.max(baseLum, 1e-4)))
    : [targetLum, targetLum, targetLum];
};

/**
 * The ink a glyph is drawn in over `srgb`, as a CSS hex string, at the given
 * contrast ratio. `srgb` is one of the getTerrainColor values or BURNT_COLOR.
 */
export const glyphInkHex = (srgb: number[], ratio: number): string =>
  "#" + glyphInkLinear(srgb.map(srgbToLinear), ratio)
    .map(c => Math.round(clamp01(linearToSrgb(c)) * 255).toString(16).padStart(2, "0"))
    .join("").toUpperCase();

/**
 * The Setup panel's texture ink for one zone. `contrast` is
 * config.terrainGlyphContrast, indexed by drought level, so an activity that
 * retunes the contrast targets moves the thumbnails and the model together.
 */
export const droughtGlyphInkHex = (droughtLevel: DroughtLevel, contrast: readonly number[]): string =>
  glyphInkHex(getTerrainColor(droughtLevel), contrast[droughtLevel]);
```

`terrain-glyph-colors.test.ts` deletes `srgbToLinear`, `linearToSrgb`, `clamp01`, `LUMA`, `toHex`, `wfInk` and `inkFor`, and imports `glyphInkHex` instead. Its header comment loses the "this file reimplements it" framing, since it no longer does. The `lightenBelow` test keeps its own `srgbToLinear` and `LUMA` (it needs raw luminance, not an ink), or imports them if they are exported; keeping them local is fine and is not a duplicated *value*, only a duplicated formula that the hex assertions already pin.

The three existing assertions become:

```ts
  it("derives exactly the five stroke colors on the Terrain Textures board", () => {
    const [none, mild, medium, severe] = config.terrainGlyphContrast;
    expect(glyphInkHex(getTerrainColor(DroughtLevel.NoDrought), none)).toBe("#004001");
    expect(glyphInkHex(getTerrainColor(DroughtLevel.MildDrought), mild)).toBe("#2D460B");
    expect(glyphInkHex(getTerrainColor(DroughtLevel.MediumDrought), medium)).toBe("#424F12");
    expect(glyphInkHex(getTerrainColor(DroughtLevel.SevereDrought), severe)).toBe("#241B06");
    expect(glyphInkHex(BURNT_COLOR, config.terrainGlyphContrastBurnt)).toBe("#B3B3B3");
  });

  it("routes drought levels to their own contrast target", () => {
    // droughtGlyphInkHex is what the Setup panel calls; this pins that it indexes
    // the contrast array by level rather than sharing one ratio across all four.
    expect(droughtGlyphInkHex(DroughtLevel.SevereDrought, config.terrainGlyphContrast)).toBe("#241B06");
    expect(droughtGlyphInkHex(DroughtLevel.SevereDrought, [6, 6, 6, 6])).not.toBe("#241B06");
  });
```

The second case is there because indexing is the one thing the first case cannot catch: `terrainGlyphContrast` is `[6, 6, 6, 7]`, so three of the four levels share a ratio and a wrong index still produces the right hex for them.

In `terrain-shader.ts`, the `wfInk` doc comment currently reads "MIRRORED IN TYPESCRIPT at terrain-glyph-colors.test.ts. Jest has no WebGL, so that file reimplements this function...". It now names `terrain-colors.ts` as the mirror and the test as what pins the outputs.

---

### Re-author the tiles to a transparent field

**Summary**: Decision E's remaining two amended edits. The tiles carry their glyphs on nothing instead of on a gray rect, so the Setup panel can use one as a CSS mask, and everything that rasterizes a tile paints that gray itself. Measured to leave the 3D texture byte-identical.

**Files affected**:
- `src/public/terrain-textures/{grass,shrub,forest,forest-with-suppression}.svg`: one attribute each
- `src/components/view-3d/terrain-textures.ts`: `rasterizeSvg` prefills the canvas
- `scripts/measure-terrain-textures.mjs`: the same prefill, or its background check fails

**Estimated diff size**: ~25 lines

In each of the four tiles, one attribute:

```
-            <rect id="Rectangle" fill="#808080" x="0" y="0" width="256" height="256"></rect>
+            <rect id="Rectangle" fill="none" x="0" y="0" width="256" height="256"></rect>
```

In `terrain-textures.ts`, next to `RASTER_SIZE`:

```ts
// The tiles draw their glyphs on a transparent field so the Setup panel can use
// one as a CSS mask and paint its own ink through it. The shader instead wants
// those glyphs on a neutral field, 128 being the luminance it reads as
// "unchanged", so the field is painted here rather than in the file.
const TILE_FIELD = "#808080";
```

and inside `rasterizeSvg`, between the context check and the draw:

```ts
      ctx.fillStyle = TILE_FIELD;
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
```

`scripts/measure-terrain-textures.mjs` needs the identical two lines before its own `drawImage` at line 121. **This is not optional and is not mentioned in the requirements spec.** The script's `BACKGROUND` check requires the modal red value to be 128 within a tolerance of 2, and it finds the mode with a loop that starts at index 1. Against a transparent field `getImageData` returns 0, so without the prefill the mode is not found, `background` stays 0, and all four tiles fail with a drift of -128.

**Regression evidence for the PR.** The claim this step rests on is that the 3D terrain renders identically afterward, and it was re-measured on head rather than quoted: rasterizing each shipped tile the current way, rasterizing its `fill="none"` twin onto a `#808080`-prefilled canvas, and diffing at `RASTER_SIZE` 512 gives **0 differing texels out of 262,144, in every channel, for all four tiles**. Compositing a transparent-field tile over gray is the same operation as rasterizing it against a gray rect. Re-run this in the PR rather than citing it.

The measurement script gives a second, cheaper check on the same property, and it should be run per `CLAUDE.md`. Its output must be **unchanged**, since the raster is unchanged:

```
tile                          box  stroke    bg     sd   verdict
forest-with-suppression.svg   256       3   128   36.0   ok
forest.svg                    256       3   128   28.3   ok
grass.svg                     256       3   128   29.1   ok
shrub.svg                     256       3   128   31.3   ok
```

---

### Draw the texture layer in the Setup panel

**Summary**: The story. One layer per zone, present when the Vegetation Key is on, masked by the vegetation's tile and painted in the drought's ink, wrapped with `.terrainImage` in a container that carries the state opacity.

**Files affected**:
- `src/components/zone-selector.tsx`: the wrapper, the texture layer, the badge move, two new parameters
- `src/components/zone-selector.scss`: the state opacity moves to the wrapper, the texture layer's rules
- `src/components/terrain-panel.tsx`: passes the flag and the contrast targets
- `src/components/terrain-panel.test.tsx`: the structural and behavioral coverage

**Estimated diff size**: ~200 lines including tests

`renderZones` takes an options object rather than growing to seven positional parameters. There is exactly one call site (`terrain-panel.tsx:290`), so the conversion is cheap:

```tsx
interface IRenderZonesOptions {
  zones: Zone[];
  selectedZone: number;
  readonly: boolean;
  zonesCount: number;
  showVegetationKey: boolean;
  glyphContrast: readonly number[];
  onChange: any;
}

export const renderZones = (options: IRenderZonesOptions) => {
  const { zones, selectedZone, readonly, zonesCount, showVegetationKey, glyphContrast, onChange } = options;
```

The per-zone JSX, replacing the current `.terrainImage` block:

```tsx
  const tileUrl = `url(${TILE_DIR}${VEGETATION_TILE_FILES[z.vegetation]})`;
  ...
  <label className={css.terrainPreview}>
    <input type="radio" ... />
    <span className={css.zoneLabelBorder}>...</span>
    <div className={css.terrainLayers}>
      <div className={`${css.terrainImage} ${getColorFilter(z.droughtLevel)}`}
        style={{ backgroundImage: `url(${zoneTerrainImagePath})` }}>
        <div className={css.riverOverlay} style={{ backgroundImage: `url(${zoneRiverImagePath})` }} />
      </div>
      {showVegetationKey &&
        <div
          className={css.vegetationTexture}
          data-testid="vegetation-texture"
          style={{
            backgroundColor: droughtGlyphInkHex(z.droughtLevel, glyphContrast),
            // Unprefixed applies in every browser this ships to; the prefixed
            // copy is here because inline styles never reach autoprefixer, which
            // handles the SCSS half of these properties.
            maskImage: tileUrl,
            WebkitMaskImage: tileUrl
          }}
        />
      }
      {!readonly &&
        <span className={`${css.vegetationPreview} ${i > 0 ? vegPreviewPosition : ""}`}>
          {vegetationIcons[z.vegetation]}
        </span>
      }
    </div>
  </label>
```

Three structural points, each of which is a measured requirement rather than a style choice:

- **The texture is a sibling of `.terrainImage`, never a child.** A CSS `filter` recolors its whole subtree, so a texture nested where `.riverOverlay` sits paints `#424F12` as `rgb(128, 88, 49)` at a selected medium-drought zone and `rgb(191, 152, 150)` at an unselected one. The damage varies with state, so it cannot be pre-compensated.
- **It is ordered after `.terrainImage`.** `.terrainImage` forms a stacking context whenever it carries a drought filter or a sub-1 opacity, which is every state but one, and would paint over a preceding absolutely-positioned sibling. Ordered after, no `z-index` is needed in any state.
- **The badge moves out of `.terrainImage` but stays inside `.terrainLayers`, ordered last.** It has to leave `.terrainImage`: that filter traps its descendants in a stacking context, so no `z-index` on the badge could lift it above the texture. It has to stay inside the wrapper for a separate reason: the wrapper is where the state opacity now lives, and a badge outside it composites at its own 60% instead of at 60% of the zone's 50%, which is twice today's strength on every unselected zone (measured: chip pixel `rgb(153,153,153)` outside the wrapper against `rgb(77,77,77)` today). Inside the wrapper and ordered after the texture, it paints above the texture, keeps 0.30 default and 1.0 selected exactly as today, and keeps its box: verified 28x28 at (10, 74) default and (6, 190) selected, identical across today's arrangement and both candidate ones. The `.mid` and `.right` position variants are unaffected too, measured on the 3-zone layout at (10, 74), (114, 74) and (218, 74) in both arrangements, because `.terrainLayers` is `inset: 0` with no border or padding, so its padding box is the same box the badge already resolved against.

The `.terrainLayers` wrapper is rendered whether or not the key is on, because it owns the state opacity for all three of its children and a conditional wrapper would need two sets of opacity rules. It is `inset: 0` on a `position: relative` border-box parent with no padding, so it resolves to exactly the terrain image's rect: measured 120x100 at 2 zones and 80x100 at 3, unchanged from today.

`terrain-panel.tsx` at the call site:

```tsx
  renderZones({
    zones,
    selectedZone,
    readonly: currentPanel === WIND_PANEL,
    zonesCount: zones.length,
    showVegetationKey: ui.showVegetationKey,
    glyphContrast: config.terrainGlyphContrast,
    onChange: handleZoneChange
  })
```

`TerrainPanel` is already wrapped in `observer` and `config` is already destructured from `useStores`, so reading `ui.showVegetationKey` here is tracked and the toggle re-renders the cards with no further work. The switch carries no `disabled` prop and the Setup panel does not cover the bottom bar, so this is reachable while the wizard is open.

`zone-selector.scss`: the base `.terrainImage` loses `opacity: 50%`, and the three state rules retarget the wrapper.

```scss
  &:not(.selected):not(.fixed):hover{
    .terrainPreview{
      border: solid 4px rgba(255,255,255,0.5);
-     .terrainImage { opacity: 75%; }
+     .terrainLayers { opacity: 75%; }
      ...
  &.selected{
    .terrainPreview{
      border: solid 4px #ffffff;
-     .terrainImage { opacity: 100%; }
+     .terrainLayers { opacity: 100%; }
      ...
  &.fixed{
    .terrainPreview{
-     .terrainImage{ opacity: 100%; }
+     .terrainLayers{ opacity: 100%; }
```

and inside `.terrainPreview`:

```scss
    // Holds the terrain image and the vegetation texture at one opacity so the
    // two always read as one picture. The drought filter stays on .terrainImage
    // alone, which is what keeps .riverOverlay filtered as it is today and keeps
    // the texture's ink out of the filter.
    .terrainLayers{
      position: absolute;
      inset: 0;
      opacity: 50%;
    }

    .terrainImage{
      width: 100%;
      height: 100%;
      background-size: cover;
      ...unchanged drought filters...
    }

    .vegetationTexture{
      position: absolute;
      inset: 0;
      // Tiled by the MASK, not by a background: this layer has no background
      // image, so background-size on it is inert and nothing repeats.
      mask-repeat: repeat;
      mask-size: 112.5px 112.5px;  // the board's authored tile scale, both layouts
    }
```

The mask URL is set inline in the TSX rather than in the SCSS because css-loader would try to resolve a `url()` here at build time, against `src/components/`, where the tiles do not live. The tiling properties stay in the SCSS, where autoprefixer does run over them.

**Tests** in `terrain-panel.test.tsx`. SCSS modules map to `identity-obj-proxy` under Jest, so the class names are literal, and jsdom does preserve `mask-image` and normalizes `background-color` to `rgb()` form (both verified; `WebkitMaskImage` is silently dropped by jsdom's CSS parser, so do not assert it).

```ts
const textures = (c: HTMLElement) => Array.from(c.querySelectorAll(".vegetationTexture"));
const terrainImages = (c: HTMLElement) => Array.from(c.querySelectorAll(".terrainImage"));

it("draws no texture layer when the Vegetation Key is off", () => {
  stores.ui.showVegetationKey = false;
  const { container } = renderPanelOnZonesScreen();
  expect(terrainImages(container)).toHaveLength(2);   // the panel really rendered
  expect(textures(container)).toHaveLength(0);
});

it("draws one texture layer per zone when the Vegetation Key is on", () => {
  stores.ui.showVegetationKey = true;
  const { container } = renderPanelOnZonesScreen();
  expect(textures(container)).toHaveLength(2);
});

it("keeps the texture out of the drought-filtered image and after it", () => {
  stores.ui.showVegetationKey = true;
  const { container } = renderPanelOnZonesScreen();
  const layers = textures(container);
  expect(layers).toHaveLength(2);
  layers.forEach(tex => {
    const image = tex.parentElement!.querySelector(".terrainImage")!;
    // Nested inside, the drought filter would rewrite the ink's hue.
    expect(image.contains(tex)).toBe(false);
    // Ordered before, .terrainImage's stacking context would hide it.
    const kids = Array.from(tex.parentElement!.children);
    expect(kids.indexOf(tex)).toBeGreaterThan(kids.indexOf(image));
  });
});

it("keeps the vegetation badge above the texture and inside the faded wrapper", () => {
  stores.ui.showVegetationKey = true;
  const { container } = renderPanelOnZonesScreen();
  const wrappers = Array.from(container.querySelectorAll(".terrainLayers"));
  expect(wrappers).toHaveLength(2);
  wrappers.forEach(wrapper => {
    const badge = wrapper.querySelector(".vegetationPreview")!;
    const image = wrapper.querySelector(".terrainImage")!;
    const texture = wrapper.querySelector(".vegetationTexture")!;
    // Out of the filtered image, or the drought filter rewrites the icon's gray.
    expect(image.contains(badge)).toBe(false);
    // Inside the wrapper, or the badge stops fading with its zone and renders at
    // twice today's strength on every unselected zone.
    expect(wrapper.contains(badge)).toBe(true);
    // After the texture, or the texture covers it.
    const kids = Array.from(wrapper.children);
    expect(kids.indexOf(badge)).toBeGreaterThan(kids.indexOf(texture));
  });
});

it("masks each zone with its own vegetation tile", () => {
  stores.ui.showVegetationKey = true;
  // defaultThreeZones is Forest / Shrub / ForestWithSuppression.
  const { container } = renderPanelOnZonesScreen(defaultThreeZones);
  const masks = textures(container).map(t => (t as HTMLElement).style.maskImage);
  expect(masks).toEqual([
    "url(terrain-textures/forest.svg)",
    "url(terrain-textures/shrub.svg)",
    // The one case where enum-name arithmetic would have produced the wrong file.
    "url(terrain-textures/forest-with-suppression.svg)"
  ]);
});

it("inks each zone from its own drought level", () => {
  stores.ui.showVegetationKey = true;
  // defaultThreeZones is drought 2 / 1 / 0.
  const { container } = renderPanelOnZonesScreen(defaultThreeZones);
  expect(textures(container).map(t => (t as HTMLElement).style.backgroundColor))
    .toEqual(["rgb(66, 79, 18)", "rgb(45, 70, 11)", "rgb(0, 64, 1)"]);
});

it("adds and removes the texture when the key is toggled with the wizard open", () => {
  stores.ui.showVegetationKey = false;
  const { container } = renderPanelOnZonesScreen();
  expect(textures(container)).toHaveLength(0);
  act(() => { stores.ui.showVegetationKey = true; });
  expect(textures(container)).toHaveLength(2);
  act(() => { stores.ui.showVegetationKey = false; });
  expect(textures(container)).toHaveLength(0);
});

it("follows a zone's vegetation and drought as they change", () => {
  stores.ui.showVegetationKey = true;
  const { container } = renderPanelOnZonesScreen();
  const first = () => textures(container)[0] as HTMLElement;
  expect(first().style.maskImage).toBe("url(terrain-textures/forest.svg)");
  act(() => { stores.simulation.zones[0].vegetation = Vegetation.Grass; });
  expect(first().style.maskImage).toBe("url(terrain-textures/grass.svg)");
  act(() => { stores.simulation.zones[0].droughtLevel = DroughtLevel.NoDrought; });
  expect(first().style.backgroundColor).toBe("rgb(0, 64, 1)");
});

it("textures the read-only wind recap, where the badge is not drawn", () => {
  stores.ui.showVegetationKey = true;
  const { container } = renderPanelOnWindScreen();
  expect(textures(container)).toHaveLength(2);
  expect(container.querySelectorAll(".vegetationPreview")).toHaveLength(0);
});
```

`renderPanelOnZonesScreen` and `renderPanelOnWindScreen` are small helpers over the existing harness: render `<TerrainPanel/>` inside the existing `Provider`, then walk Next as the existing tests already do to reach the zones and wind panels. The drought and mask expectations are per-zone arrays rather than a `forEach`, so a fixture that folded every zone to the same value could not pass.

What these tests are and are not: the two structural ones are **proxies**. They pin the two facts that cause the bug and each fails if its line is deleted, but the property anyone cares about is a painted color and jsdom applies no stylesheet filters. The guarantee needs a pixel check, which is the open question below.

---

### Pin the painted ink with a Cypress pixel case

**Summary**: The guarantee the Jest assertions only proxy. One case, calibrated against the bug it exists to catch, plus the `.gitignore` fix that makes its screenshots disappear.

**Files affected**:
- `cypress/e2e/setup-panel-texture.cy.ts` (new): the pixel case
- `.gitignore`: line 8 currently does nothing

**Estimated diff size**: ~70 lines

`.gitignore` line 8 reads `./cypress/screenshots`. Git does not honor a leading `./`, so the rule matches nothing and the directory shows up as untracked (verified with `git check-ignore`). Nothing writes screenshots today, so it is latent, and this step is what makes it bite:

```
-./cypress/screenshots
+cypress/screenshots/
```

The case renders the Setup panel with the key on and a selected zone at medium drought, screenshots the texture layer, decodes the PNG in the browser, and counts pixels near the ink:

```ts
// CSS-module class names are hashed by webpack's localIdentName
// ('[name]--[local]--__wildfire-v1__'), so a bare `.terrainLayers` matches
// nothing in the built app. cypress/support/elements/TerrainSetup.js is the
// convention: name the hashed class in full.
const LAYERS = ".zone-selector--terrainLayers--__wildfire-v1__";
const IMAGE = ".zone-selector--terrainImage--__wildfire-v1__";
const TEXTURE = '[data-testid="vegetation-texture"]';

const INK = [0x42, 0x4f, 0x12];
// Squared distance, roughly 10 per channel. Calibrated against both arrangements:
// the correct DOM shape puts 116 pixels inside this band and the nested-parent
// bug puts 0. A looser band does not work: at 30 per channel the bug leaks 55
// pixels in, because its washed-out render contains a neutral gray that happens
// to sit near the ink. There is no byte-exact pixel to assert on: a 3px stroke on
// a 256 viewBox drawn at a 112.5px mask scale almost never fills a whole pixel.
const TOLERANCE = 300;
const MIN_INK_PIXELS = 20;

const countInkPixels = (win: Window, path: string) => new Cypress.Promise<number>((resolve, reject) => {
  cy.readFile(path, null).then((buf: any) => {
    const url = win.URL.createObjectURL(new Blob([new Uint8Array(buf)], { type: "image/png" }));
    const img = new (win as any).Image();
    img.onload = () => {
      const canvas = win.document.createElement("canvas");
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let hits = 0;
      for (let i = 0; i < d.length; i += 4) {
        const dist = (d[i] - INK[0]) ** 2 + (d[i + 1] - INK[1]) ** 2 + (d[i + 2] - INK[2]) ** 2;
        if (dist <= TOLERANCE) hits++;
      }
      win.URL.revokeObjectURL(url);
      resolve(hits);
    };
    img.onerror = () => reject(new Error("screenshot decode failed"));
    img.src = url;
  });
});

it("paints the texture in the drought ink, not through the drought filter", () => {
  // ...open Setup, reach the zones screen, set zone 1 to medium drought...
  let shotPath = "";
  cy.get(TEXTURE).first()
    .screenshot("zone-1-texture", { overwrite: true, onAfterScreenshot: (_el, props) => { shotPath = props.path; } });
  cy.window().then(win => countInkPixels(win, shotPath)).then(hits => {
    expect(hits, "pixels painted in the medium-drought ink").to.be.greaterThan(MIN_INK_PIXELS);
  });
});
```

The same spec carries the state-opacity assertion, which has no other home: Jest computes no styles, so the requirement that the texture and the terrain image share one opacity (50 default, 75 hover, 100 selected, 100 on the recap) is only observable here.

```ts
// Hover's 75% is verified by hand in the Playwright pass, not here. Cypress's
// cy.trigger dispatches an event without moving the pointer, so :hover never
// matches and the read comes back 0.5; bottom-bar-visuals.cy.ts made the same
// call for the same reason.
it("fades the texture and the terrain image together", () => {
  // ...open Setup, reach the zones screen, key on...
  cy.get(LAYERS).eq(0).should("have.css", "opacity", "1");    // zone 1 is selected
  cy.get(LAYERS).eq(1).should("have.css", "opacity", "0.5");  // zone 2 is default
  cy.get(IMAGE).eq(1).should("have.css", "opacity", "1");     // the fade is the wrapper's, not the image's
});

it("holds the recap at full strength on the wind screen", () => {
  // ...advance to the wind screen, key on...
  cy.get(LAYERS).should("have.length", 2).each($l => expect($l).to.have.css("opacity", "1"));
});
```

That pair is the guard on this step's riskiest edit. Moving `opacity` off `.terrainImage` and onto the wrapper touches four declarations: the base, plus the hover, selected and `.fixed` state rules. These cases reach three of the four, and getting any of them wrong is invisible in Jest. **The fourth, hover, has no automated coverage and the spec should not be read as if it does**: it is a manual check in the Playwright pass, recorded in the PR body.

The same spec also pins the tile scale, which is a stated requirement (*"identical on 2-zone and 3-zone layouts"*) with a named failure mode and otherwise no coverage at all. Chrome reports `mask-size` through `getComputedStyle` as `"112.5px 112.5px"`, verified, so it is one assertion per layout, and running it on both is what makes it catch a rescale rather than restate the stylesheet:

```ts
it("draws the tile at the board's scale on both layouts", () => {
  // ...open Setup on a two-zone preset, key on...
  cy.get(TEXTURE).first().should("have.css", "mask-size", "112.5px 112.5px");
});
// and the same assertion against ?preset=hillThreeZone
```

The mutation this catches, named so nobody has to rediscover it: move the texture layer inside `.terrainImage` and `hits` goes to 0.

Run it with `CI=true npx cypress run --browser chrome --spec cypress/e2e/setup-panel-texture.cy.ts`; per `CLAUDE.md`, Chrome is required or WebGL fails in three.js and the app never boots.

---

## Open Questions

### RESOLVED: How is the painted-color check automated, if at all?

**Context**: The requirements spec's QA decision makes a pixel check the *guarantee* and the Jest structural assertions *proxies*, and says explicitly that if the pixel case is dropped the story has no coverage of its central requirement and the Jest tests must not be described as if it does. So this has to be answered rather than left to drift.

Two things measured on 2026-08-28 shape the options. There is **no pixel-sampling precedent in this repo**: `cypress/e2e/bottom-bar-visuals.cy.ts` and `key-area-visuals.cy.ts` are visual specs, but they assert `getComputedStyle`, never pixels, and no PNG decoder is installed (`pngjs`, `sharp`, `jimp` are all absent). And the assertion has to be a **tolerance scan, not a byte-exact sample at a coordinate**: at the board's `mask-size: 112.5px` only 2 of 12,000 pixels on a selected shrub card are byte-exact `#424F12` (7 of 12,000 for grass), because Chromium rasterizes the mask at the tile's intrinsic 256px and downscales. Correct is squared distance 0 from the ink; the nested-parent failure lands 4,886 away, so a ±30-per-channel band separates them comfortably and does not sit on a 2-pixel margin.

**Options considered**:
- A) A Cypress case with no new dependency: `cy.screenshot()` the zone card, `cy.readFile(path, null)` the PNG back as a buffer, decode it in the browser through `Image` plus a canvas, and scan for the nearest pixel to the ink. New machinery in this repo, and screenshot paths are the brittle part.
- B) A Cypress case plus a `pngjs` devDependency and a `cy.task` that decodes in Node. Less in-browser trickery, one more dependency.
- C) No automated pixel check. The Jest structural proxies are the automated coverage, and the painted color is verified manually with the Playwright procedure already exercised for this spec, recorded in the PR. The spec then has to say plainly that the central requirement's coverage is manual.
- D) Skip the screenshot entirely: assert the *mask alpha* instead by rasterizing the tile in a headless browser the way `scripts/measure-terrain-textures.mjs` already does, and assert the CSS separately. Cheaper and stable, but it tests the asset rather than the composition, so it would not catch the nested-parent bug at all.

**Decision**: **A**, a Cypress case with no new dependency. Doug, 2026-08-28.

**Built and run as a throwaway on 2026-08-28 before deciding, so the cost and the assertion are measured rather than estimated.** The chain works in this repo's Cypress against Chrome: `.screenshot()` on the texture element yields its path through `onAfterScreenshot`, `cy.readFile(path, null)` reads the bytes back, and `Image` plus a canvas decodes them in the browser. The captured element is exactly the 120x100 terrain rect. Two cases ran in 16 seconds. The run used `CI=true`, which is what makes `cypress.config.ts` push `--use-gl=angle --use-angle=swiftshader`, so the calibration below was measured under the same software rendering CI uses rather than on local hardware GL. CI runs Cypress in Chrome on every push, so this case does run there.

**The tolerance had to be calibrated against the bug, not guessed.** A first pass proposed a band of ±30 per channel, and running the nested-parent arrangement through the identical harness shows that band **passes on the bug**: the buggy render contains a neutral gray pixel 2546 away in squared distance, inside a 2700 band. Counting pixels near the ink rather than inspecting the single nearest one, over both arrangements:

| tolerance (squared distance) | approx. per channel | correct shape | nested-parent bug |
|---|---|---|---|
| 100 | 6 | 43 | 0 |
| **300** | **10** | **116** | **0** |
| 1200 | 20 | 447 | 0 |
| 2700 | 30 | 1023 | 55 |

So the assertion is **at least 20 pixels within squared distance 300 of `#424F12`**: 116 in the correct shape, 0 in the bug, 5x headroom over the threshold. Note also that under Cypress's capture path the byte-exact pixel disappears entirely (nearest is 2 away, against 2 exact pixels under Playwright), which is independent confirmation that byte-equality was never writable.

---

### RESOLVED: The vegetation badge changes appearance when it leaves the drought filter

**Context**: The requirements spec says the badge "loses the drought filter by moving, which changes nothing: the badge is a white box with a gray icon, and `hue-rotate` plus `saturate` plus `brightness` leave both unchanged." **Measured on 2026-08-28, that is wrong.** `hue-rotate` and `saturate` are indeed identity on a gray, but `brightness` is a straight multiply and the icon is gray, not white. Screenshotting the same badge inside and outside the filter at severe drought, 232 of its 784 pixels change: the icon's gray goes from `226` inside to `188` outside, and its lightest strokes from `250` to `208`.

The multiplier is the drought filter's own `brightness`, so today the badge's icon renders at a different gray per drought level: `188` at no drought, `216` at mild (1.15), `244` at medium (1.30) and `226` at severe (1.20). After the move it is `188` at every level.

The move itself is not optional. `.terrainImage`'s filter forms a stacking context that traps its descendants, so no `z-index` on the badge can lift it above the texture layer, and the board draws the badge above the texture.

**This question is about the filter alone, and that is only true because the badge stays inside `.terrainLayers`.** Moving it further out, to a sibling of the wrapper, would also take it out from under the state opacity and double its strength on unselected zones. See the resolved self-review finding; the JSX above lands the badge inside the wrapper for exactly that reason.

**Options considered**:
- A) Accept it. The badge becomes drought-independent, which is what it always looked like it was meant to be: a white chip with a gray icon. It also matches what an undroughted zone already shows today, so no state gains a look that does not currently exist somewhere in the UI.
- B) Preserve today's appearance by applying the zone's drought filter to the badge as well, so it keeps varying with drought.
- C) Accept it but raise it with Michael before merge, since it is a visible change to an element the board did not ask this story to touch.

**Decision**: **A**, accept it, and call it out in the PR body as an incidental fix rather than letting a reviewer find it. Doug, 2026-08-28.

**This is not a departure from the requirements spec, it is a correction to one sentence of its rationale.** That spec already requires the move, both as a requirement ("`.vegetationPreview` moves out of `.terrainImage` to sit after the texture") and in the resolved paint-order question. What it gets wrong is only the claim that the move "changes nothing", which it reached by treating the icon as white when it is gray. That sentence has been corrected in `requirements.md`. Option B would have been the real departure: it adds a drought filter to the badge that no requirement asks for, purely to preserve the current washout.

**The badge's dominant icon gray, measured at two levels and reproduced by the multiply model at the others:**

| drought | filter | icon gray today | after the move |
|---|---|---|---|
| none | none | 188 | 188 |
| mild | brightness 1.15 | 216 | 188 |
| medium | brightness 1.30 | 244 | 188 |
| severe | brightness 1.20 | 226 | 188 |

At medium drought the icon renders at **244 on a 255 white chip**, and the badge's fully-white pixel count rises from 554 to 680 out of 784: drought progressively washes the vegetation icon out of its own chip. The move restores a solid 188 at every level, which is what an undroughted zone already renders today, so no new appearance is introduced for anyone to approve.

**The board cannot arbitrate this and was checked rather than assumed.** Its zone-card badges are confounded twice over: unselected zones carry the 60% opacity and sit over different terrain, and the board's badge asset does not match ours to begin with (its selected-zone icon reads 122 against our 188 at full strength). That mismatch predates this story and WM-53 does not touch it.

---

### RESOLVED: Does `renderZones` become an options object, or grow two more positional parameters?

**Context**: `renderZones` takes five positional parameters today and needs two more: the key's state and the contrast targets. Seven positional booleans and numbers at a call site is where argument-order bugs live, and `readonly` and `showVegetationKey` are adjacent booleans. There is exactly one call site, so either shape is cheap.

The contrast targets have to be threaded through rather than read from `getDefaultConfig()`, because an activity can override `terrainGlyphContrast` and the thumbnails have to move with the model rather than with the default.

**Options considered**:
- A) An options object, as the plan above is written. Slightly larger diff (the one call site and the signature), self-documenting at the call site, and adding an eighth field later costs nothing.
- B) Two more positional parameters. Smallest possible diff, and consistent with how the function reads today.

**Decision**: **A**, an options object. Doug, 2026-08-28, delegated as an internal-shape call with no product consequence.

`readonly` and `showVegetationKey` would otherwise sit adjacent as two bare booleans in a seven-argument call, which is where argument-order bugs live, and there is exactly one call site so the conversion is nearly free.

---

### RESOLVED: Do the steps land as one PR or as a chain?

**Context**: The steps are independently reviewable and only the third is the story. The second changes assets and a loader that the 3D terrain uses, so it carries the byte-identical-render evidence; the first is a move of existing code.

**AMENDED 2026-08-29**: this question was framed around a fourth step, the 19-file `foothills` to `hills` rename, which is no longer in the story. Its whole premise, a PR whose diff is dominated by renames with the interesting 200 lines easy to miss, is gone with it. The decision below is unchanged in substance and the count is now four commits, not five; what survives is the instruction to point the reviewer at the tile-re-author commit.

Sprint 24 ends Monday 2026-08-31, which argues for fewer round trips.

**Options considered**:
- A) One PR, one commit per step. One review, and the reviewer can read it commit by commit.
- B) Two PRs: the rename on its own (it is mechanical and reviews in a minute), then the ink export, the tile edit and the texture layer together. *Moot since the rename left the story.*
- C) Two PRs, splitting the tile edit out, since it is the one change that touches what the 3D model renders.

**Decision**: **A**, one PR, four commits. Doug, 2026-08-28, count corrected 2026-08-29.

The PR body must name the tile-re-author commit specifically and quote its re-measured 0-of-262,144 evidence, so the reviewer is pointed at the 25 risky lines rather than left to find them inside a 200-line feature. That is what buys most of what option C was after.

**The calendar is what decides it**: each PR is a full CI cycle (build, Jest, Cypress, S3 deploy) plus a Copilot-then-human review sequence, and the sprint ends Monday 2026-08-31. On the merits alone, with no sprint boundary, C is the better shape, because the tile step is the only change that touches what the shipped 3D model renders. Without the rename the PR is roughly 385 reviewable lines across about 12 files, so the "easy to miss" risk C was guarding against is much smaller than when this was first asked.

## Self-Review

Roles: **Front-End / CSS Specialist** (the story is a compositing problem), **QA Engineer**, **Senior Engineer**, **Release Engineer**. Every finding below was verified against this branch (head `82f1584`) before being written, with throwaway harnesses under the job tmp dir; the measurements quoted are from those runs, not from the requirements spec.

Three of the plan's load-bearing claims were re-measured and **hold**, so they are recorded here rather than raised as issues: the `fill="none"` twin rasterized onto a `#808080`-prefilled canvas differs from the shipped tile by **0 of 262,144 texels in every channel, for all four tiles** (headless Chrome at `RASTER_SIZE` 512); `.gitignore` line 8 really does match nothing (`git check-ignore` returns nothing for `cypress/screenshots/foo.png`); and autoprefixer, running with no `browserslist` key in `package.json`, does emit `-webkit-mask-repeat` / `-webkit-mask-size` / `-webkit-mask-image`, so the split between prefixed-inline and unprefixed-SCSS is coherent. jsdom was also confirmed to round-trip `mask-image` verbatim (`url(terrain-textures/forest.svg)`, unquoted) and to normalize `background-color` to `rgb(66, 79, 18)`, and the five ink hexes reproduce exactly, including `#33270B` for the wrong-index case the second new test pins.

### Front-End / CSS Specialist

#### RESOLVED: Moving the badge out of the wrapper doubles its opacity on every unselected zone

The plan makes `.vegetationPreview` a sibling of `.terrainLayers`. That takes it out from under the state opacity as well as out from under the drought filter, and only the second half is analyzed. Today the badge is a descendant of `.terrainImage`, which carries `opacity: 50%` on a default zone, so its own `opacity: 60%` composites to **0.30**. As a sibling of the wrapper it composites to **0.60**.

Measured, not reasoned: `zone-selector.scss` was compiled as-is and again with the plan's three opacity retargets applied, both rendered in headless Chrome with the badge chip forced white over a black terrain stand-in, and the chip pixel sampled.

| arrangement | badge ancestor opacity chain (default zone) | effective alpha | chip pixel over black | selected |
|---|---|---|---|---|
| today | `vegetationPreview:0.6` / `terrainImage:0.5` | 0.30 | `rgb(77,77,77)` | 1.0 |
| the plan | `vegetationPreview:0.6` (no 0.5 ancestor) | 0.60 | `rgb(153,153,153)` | 1.0 |

Selected zones are unchanged; hover moves the same way, 0.75 to 1.0. So on the Adjust Conditions screen every zone the student is not currently editing gets a badge twice as strong as today, which is an appearance that exists nowhere in the UI now. That is a different change from the one the badge open question resolved: that question is about the drought filter's `brightness` multiply on the icon gray (188 / 216 / 244 / 226 collapsing to a flat 188), and its closing line, *"no new appearance is introduced for anyone to approve"*, is true of the filter and false of the opacity.

**Suggested resolution**: keep the badge inside `.terrainLayers`, ordered after `.vegetationTexture`, rather than moving it out to `.terrainPreview`. Measured on the same harness as a third variant: effective alpha **0.30** default and **1.0** selected, identical to today; badge box identical at 28x28 at (10, 74) default and (6, 190) selected in all three arrangements; still painted above the texture, since both are positioned children of the wrapper and the badge comes later; and still outside `.terrainImage`, so the accepted drought-filter change is preserved exactly as decided. It also costs nothing: it is where the badge already effectively sits.

That changes the plan's `keeps the vegetation badge above the texture` test, which currently reads the badge and the wrapper out of `.terrainPreview`'s children. Under this shape it reads the badge and the texture out of `.terrainLayers`'s children, and it should additionally assert the badge **is** a descendant of `.terrainLayers` and is **not** a descendant of `.terrainImage`, so both halves of the rule are pinned.

**Decision**: the suggested resolution, applied. Doug, 2026-08-28, delegated. The badge is rendered as the last child of `.terrainLayers`, the step's third structural bullet now states both halves of the rule with the measurement behind each, and the Jest case asserts all three facts: not a descendant of `.terrainImage`, a descendant of `.terrainLayers`, ordered after `.vegetationTexture`. Each fails if its line is deleted. The badge open question keeps its decision unchanged and gains a note saying its "no new appearance" conclusion holds only under this arrangement.

---

### QA Engineer

#### RESOLVED: The Cypress cases select CSS-module class names that do not exist in the built app

`cy.get(".terrainLayers")`, `cy.get(".terrainImage")` and `cy.get('[class*="zone"]')` are the selectors in both Cypress cases. `webpack.config.js` sets `localIdentName: '[name]--[local]--__wildfire-v1__'`, so the shipped class is `zone-selector--terrainLayers--__wildfire-v1__`. A bare `.terrainLayers` matches nothing, and Cypress fails the whole spec on the timeout rather than on the assertion.

The repo already has a convention for this and it is not `[class*=]` alone: `cypress/support/elements/TerrainSetup.js` uses the full hashed name (`getAllZones()` is `cy.get(".zone-selector--zone--__wildfire-v1__")`), while `bottom-bar-visuals.cy.ts` uses `[class*="widgetGroup"]` with a comment saying the substring match is what survives hashing.

`[class*="zone"]` is separately wrong even as a substring match: it hits `zone`, `zoneOption`, `zoneLabel`, `zoneLabelBorder` and `terrain-panel--zones`, so `.eq(1)` is not the second zone card.

**Decision**: applied. The step now declares `LAYERS`, `IMAGE` and `TEXTURE` constants at the top of the spec, naming the hashed classes in full the way `TerrainSetup.js` does, with a comment saying why a bare class name would match nothing. The zone-card selector that the hover leg used is gone with that leg, per the hover finding below, so no `[class*=]` selector remains in the step.

---

#### RESOLVED: The hover leg of the state-opacity case cannot pass

`cy.get('[class*="zone"]').eq(1).trigger("mouseover")` then asserting `opacity: 0.75` relies on a synthetic `mouseover` activating CSS `:hover`. It does not: `:hover` follows the real pointer, and Cypress dispatches events without moving it. The usual workaround, `cypress-real-events`' `.realHover()`, is not a dependency of this repo (`package.json` carries `cypress`, `@cypress/code-coverage` and `@cypress/webpack-preprocessor` only).

This matters more than a normal broken assertion because the plan names this case as *"the guard on this step's riskiest edit"*: moving `opacity` off `.terrainImage` retargets three separate SCSS selectors and nothing else checks them.

**Verified two ways.** Dispatching exactly what `cy.trigger("mouseover")` dispatches (a bubbling `MouseEvent`, plus `mouseenter` and `mousemove`) against the compiled proposed stylesheet leaves the wrapper at `0.5` with `matches(":hover")` false; driving the same page with a real pointer through Playwright gives `0.75` with `:hover` true. So the retargeted rule is right and only the driver is wrong.

**The repo has already made this call.** `cypress/e2e/bottom-bar-visuals.cy.ts:11-13`: *"Hover/active opacity (0.5 / 1.0) lives in the Playwright walkthrough rather than here: Cypress's cy.trigger doesn't reliably activate :hover / :active pseudo-classes for getComputedStyle reads."*

**Decision**: drop the hover leg and follow that precedent. Doug, 2026-08-28, delegated. The spec keeps default, selected and `.fixed`, which are three of the four moved declarations, states plainly that hover has no automated coverage, and carries a comment pointing at the sibling spec so the next person does not re-add a `trigger("mouseover")`. `cypress-real-events` was the alternative and is compatible with Cypress 13.6.3, but it buys one transient state at the price of a devDependency and a divergence between two visual specs that should read the same way.

---

#### RESOLVED (then superseded): The rename test does not test what its name claims, and the honest version is a different assertion

In `it("derives heightmap and island filenames that exist for every terrain pairing")`, `derived` is computed and then only length-checked, never resolved against anything. What the case actually asserts is that no shipped data file contains `foothills` and that `terrainFileNames` maps to three known strings, which is the first case's territory. Nothing in it resolves a derived filename to a file, which is the failure the step exists to prevent.

The case also cannot be written as its title reads. Measured against `src/public/data/`: all **9** two-zone pairings ship both a `-heightmap.png` and an `-islands.png`, but only **4** of the 27 three-zone combinations do (`plains-plains-plains`, `foothills-foothills-foothills`, `mountains-mountains-mountains`, `mountains-foothills-plains`). That is not a gap: `terrain-panel.tsx:307` only renders `TerrainTypeSelector` when `zones.length === 2`, so three-zone terrain comes from presets, and every three-zone preset in `presets.ts` resolves to one of those four.

**The snippet also does not compile**, for three independent reasons found by running it: `Object.values(presets).flatMap(...)` is ES2019 against a `lib` of `["dom", "es5", "es2017"]`; `import * as fs from "fs"` and `__dirname` do not resolve because `tsconfig.json` sets `"types": ["jest"]`, which keeps `@types/node` out of the program even though it is present in `node_modules`; and `p.zones` is the tuple `[ZoneOptions, ZoneOptions, ZoneOptions?]`, so its elements are possibly undefined under `strictNullChecks`.

**SUPERSEDED 2026-08-29**: the rename left the story, so this test is not written here. It goes to the 2x art ticket if that ticket renames the 5 thumbnails, where only the preset-literal and thumbnail halves apply; the two-zone-pairing and preset-derived cases were guarding the 14 data files, which are no longer being renamed. The finding is kept because it is the reason the rename's true cost became visible, and because the `flatMap` and `types: ["jest"]` constraints it turned up apply to any future filesystem-touching test in this repo.

**Decision (2026-08-28, before the step was cut)**: rewritten, applied, and run. Doug, 2026-08-28, delegated. This looked like it needed a call on adding `"node"` to the shared `tsconfig.json`, and it does not: `src/hazbot/wildfire/replay-fixture.test.ts` already reads the filesystem from a Jest test using local `declare const __dirname` / `declare const require` plus `require("fs") as {...}`, so the new test follows that precedent and touches no shared config. The four cases in the step above were written in that shape, run against the current tree, and pass: 3 hand-written literals, 18 two-zone pairing paths, 42 preset-derived checks over 16 distinct files, plus the `terrainLabels` versus `terrainFileNames` split that nothing else pins.

---

#### RESOLVED: The `mask-size` requirement has no coverage on either layout

*"The tile is drawn at a fixed `mask-size: 112.5px 112.5px` with `mask-repeat: repeat`, identical on 2-zone and 3-zone layouts"* is a requirement with a named failure mode (someone rescaling the tile for the narrower 3-zone card), and nothing asserts it. Jest computes no styles, and the Cypress spec asserts only ink pixels and opacity.

It is free once the selector finding is fixed: `getComputedStyle` returns `mask-size` as `"112.5px 112.5px"` in Chrome, verified, so `.should("have.css", "mask-size", "112.5px 112.5px")` works. Asserting it on a three-zone preset as well as a two-zone one is what makes it catch the regression rather than restate the stylesheet.

**Decision**: applied. The Cypress step gains one case asserting the computed `mask-size` on both layouts.

---

### Senior Engineer

#### RESOLVED (then superseded): Renaming the 14 files under `src/public/data/` is a change to a public URL surface, and neither spec says so

`getUrlConfig()` in `config.ts` reads **every** key of `getDefaultConfig()` off the query string, and `elevation`, `unburntIslands` and `zoneIndex` are all such keys (`config.ts:171-173`). So `?elevation=data/foothills-foothills-heightmap.png` is a supported, documented-by-construction way to configure this model, and the rename breaks any URL that uses it. (An earlier draft of this finding said the model would quietly load flat terrain; tracing it showed otherwise, see below.)

The five thumbnail renames carry none of this risk, because their filenames are derived and never reach a URL. The 14 data files are the opposite: they are internal model data with no UI presence, they are what the board never names, and they are the only half that anything outside this repo can point at. `specs/WM-4-hazbot-new-wf-presets.md:63` quotes `elevation: "data/foothills-foothills-heightmap.png"` as the configuration for a specific activity page.

The rename of all 19 is a decided requirement, so this is not a request to reverse it. It is a request to record the surface and check it before the PR: nothing in either spec currently tells a reviewer that this half is a break rather than a refactor.

**The failure mode was traced and is worse than "404 silently".** `image-utils.ts:100-102` throws from inside the image's `error` listener, so it cannot reject the enclosing promise; `getInputData` never settles; `simulation.ts:347` awaits it inside a `Promise.all` whose `.then` is the only place `dataReady = true` runs. A pinned URL that breaks leaves an uncaught `Cannot load image` in the console and an activity that never becomes ready: no terrain, Start disabled.

**SUPERSEDED 2026-08-29: the rename is out of the story entirely, so there is no breaking surface and nothing owed.** Doug, after this finding priced the risk and a check of the board's asset list showed it names only the 5 thumbnails and carries no heightmap or island assets at all. The 14 data files are not renamed now or later; the 5 thumbnails travel with the 2x art ticket, where their names never reach a URL. The pre-merge check, the closed-spec item and the Slack message to Trudi are all withdrawn with it. `requirements.md` carries the reasoning as *Why the terrain filenames are not being renamed*. This finding is what changed the decision, so it is kept in full rather than deleted.

**Decision (2026-08-28, superseded the next day)**: keep the rename of all 19, and disclose it. Doug, 2026-08-28. The requirement was already decided and the rename is the right end state; what was missing is that nobody outside this repo has been told. So the step now states the breaking surface, owes a pre-merge check with Michael or Trudi that no published activity URL pins a `data/foothills-*` path, and fixes `specs/WM-4`'s quoted filename.

**And the change has to be announced, not just recorded.** A note about the rename must survive into the combined closed spec, and a message about it goes to Trudi over Slack. `requirements.md` carried this as *Notification owed at close* so `cc-close-spec` would pick it up rather than it living only in a review finding. (That section was removed with the rename on 08-29 and replaced by *Why the terrain filenames are not being renamed*.) If the pre-merge check does come back dirty, the fallback is to keep the 14 old filenames as copies alongside the new ones, which preserves the end state; narrowing the rename to the thumbnails is not the fallback, because it would leave two filename derivations disagreeing about the same enum member.

---

#### RESOLVED (then superseded): `presets.ts:132` is named as the wrong preset, in the step whose point is that it was missed

The step says *"the `townsTwoZone` preset would 404 its heightmap silently"*. There is no `townsTwoZone` preset in the repo. Line 132 belongs to **`defaultTwoZoneFixedTerrain`**, which `specs/WM-4-hazbot-new-wf-presets.md:13` identifies as the preset for a specific activity page. So the site is right and the consequence is understated: the preset that breaks is one an activity actually runs on, not an unused one.

**Decision**: applied. The step names `defaultTwoZoneFixedTerrain` and says that it is an activity page's preset, which is the point the wrong name was costing.

**Superseded 2026-08-29**: the step is gone, so `presets.ts:132` is untouched by this story and its literal keeps reading `data/foothills-foothills-heightmap.png`, which is correct and stays correct. The finding is kept because the corrected name is what showed that a rename miss would break an activity page rather than an unused preset, which is part of why the rename was cut.

---

#### RESOLVED: The plan says four steps and has five

As written on 2026-08-28 the preamble read *"Four steps, in dependency order. The first three are small and independent of each other; the fourth is the story and consumes the first two."* There were five: the ink export, the tile re-author, the rename, the texture layer, and the Cypress case. The resolved PR question already said *"one PR, five commits"*, so the preamble was the stale half.

The fifth step is the one the QA decision calls the story's only real guarantee, so leaving it out of the count is the specific thing worth fixing rather than a typo: a reader who takes the preamble at its word plans four commits and drops the pixel case.

**Decision**: applied. The preamble said five and named the fifth as the guarantee the Jest assertions proxy for.

**Superseded 2026-08-29**: the rename step left the story, so the count is four again and the preamble was rewritten a second time. The finding's point survives the change: the last step is the pixel case, and the preamble has to name it as the guarantee rather than let a reader plan the story without it.

