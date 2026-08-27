import * as THREE from "three";
import { ISimulationConfig } from "../../config";
import { TerrainTextures } from "./terrain-textures";
import {
  BURNING_COLOR, BURNT_COLOR, BURN_INDEX_HIGH, BURN_INDEX_LOW, BURN_INDEX_MEDIUM, getTerrainColor
} from "./terrain-colors";
import { DroughtLevel } from "../../types";

// Terrain colors are authored in sRGB (the numbers you would type into CSS) but
// three.js lights in linear space, so every color handed to the shader has to be
// converted, exactly as setVertexColor does for the vertex colors.
const srgb = (rgb: number[]) => new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);

// Tuning for the texture pass. These are constants rather than config because
// nothing an activity authors would set them: they describe how the tiles are
// drawn, not what the activity is about. The two values a designer does own,
// terrainGlyphContrast and terrainGlyphContrastBurnt, stay in config.

// Ground distance one texture tile covers, in ft.
//
// Counter-intuitively this must be LARGE. The default view shows ~120 ft per
// screen pixel, so a tile set to a few thousand feet puts its detail below the
// pixel grid, mipmapping averages it back to the tile's mean, and since the mean
// is the neutral 128 by contract the texture disappears entirely. The tiles are
// abstract map symbols, and a symbol needs ~15-30px on screen to be recognizable,
// which is 1800-3600 ft of ground. That is what this value controls. Smaller also
// means a shorter repeat period, so the tiling becomes more noticeable, not less.
//
// Held as a ground distance, so a tile covers the same 18,000 ft on every preset
// and the repeat count varies with model size (6.7 across the default 120,000 ft
// model, 5.6 across the 100,000 ft ones). That is the correct behavior for a map
// symbol, and is why it does not need to vary per activity.
const TILE_FT = 18000;

// How far tile values ABOVE neutral lift the terrain color toward white, 0..1.
// Only affects highlights within a tile; glyph legibility is governed by
// terrainGlyphContrast, not this.
const HIGHLIGHT = 0.18;

// Frequency of the noise the burn edge is thresholded against. Higher values give
// a finer, more crenulated fire perimeter.
const BURN_EDGE_NOISE_SCALE = 260;

// Half-width of the burn edge transition. Near 0 gives a hard, ragged edge; larger
// values fade back toward the original soft gradient.
const BURN_EDGE_SOFTNESS = 0.06;

// Strength of the large-scale procedural luminance variation laid over the tiles,
// 0..1. This exists to break up naturalistic texture; with the current abstract map
// symbols it mostly just makes the field look blotchy, so it is kept low. Raise it
// if the tiles are ever replaced with organic artwork.
const MACRO_AMOUNT = 0.07;

// Range of "upness" (the surface normal's up component, 1 = flat, 0 = vertical)
// over which the texture fades in: [fully faded, fully textured]. Exists because
// the tile UV is a top-down planar projection, which smears badly on the near
// vertical skirt fillTerrainEdges puts around the model. Raise the upper bound to
// also strip texture off steep mountain faces, lower it to keep more.
const SLOPE_FADE: [number, number] = [0.15, 0.5];

export interface TerrainShaderUniforms {
  uVegetationTiles: { value: THREE.Texture };
  uVegetationWeights: { value: THREE.DataTexture | null };
  uBurnState: { value: THREE.DataTexture | null };
  uGridSize: { value: THREE.Vector2 };
  uPlaneSize: { value: THREE.Vector2 };
  uTileRepeat: { value: THREE.Vector2 };
  uSlopeFade: { value: THREE.Vector2 };
  uGlyphContrastLevels: { value: THREE.Vector4 };
  uGlyphContrastBurnt: { value: number };
  uDroughtColors: { value: THREE.Color[] };
  uHighlight: { value: number };
  uMacroScale: { value: number };
  uMacroAmount: { value: number };
  uEdgeNoiseScale: { value: number };
  uEdgeSoftness: { value: number };
  uFireOpacity: { value: number };
  uShowBurnIndex: { value: number };
  uBurntColor: { value: THREE.Color };
  uBurningColor: { value: THREE.Color };
  uBurnIndexLow: { value: THREE.Color };
  uBurnIndexMedium: { value: THREE.Color };
  uBurnIndexHigh: { value: THREE.Color };
}

// Planar UV derived from the vertex's own XY rather than the `uv` attribute.
// The plane is centered on its geometry and only `position.z` carries elevation,
// so this is an exact top-down projection — and it does not depend on which of
// three's uv chunks happen to be compiled in for a material with no color map.
const VERTEX_DECL = /* glsl */`
uniform vec2 uPlaneSize;
varying vec2 vTerrainUv;
varying vec3 vLocalPos;
`;

const VERTEX_BODY = /* glsl */`
vTerrainUv = position.xy / uPlaneSize + 0.5;
// Local position, so the fragment stage can recover the TRUE face orientation.
// The interpolated vertex normal cannot be used for this: computeVertexNormals
// averages every face meeting at a vertex, and the skirt fillTerrainEdges creates
// is only one cell wide, so the vertex at its top blends the vertical skirt with
// the flat ground beside it. Where that ground is plains the average still points
// mostly up, which is precisely where the smearing survived.
vLocalPos = position;
`;

const FRAGMENT_DECL = /* glsl */`
uniform sampler2D uVegetationTiles;
uniform sampler2D uVegetationWeights;
uniform sampler2D uBurnState;
uniform vec2 uGridSize;
uniform vec2 uTileRepeat;
uniform vec2 uSlopeFade;
uniform vec4 uGlyphContrastLevels;
uniform float uGlyphContrastBurnt;
uniform vec3 uDroughtColors[4];
uniform float uHighlight;
uniform float uMacroScale;
uniform float uMacroAmount;
uniform float uEdgeNoiseScale;
uniform float uEdgeSoftness;
uniform float uFireOpacity;
uniform float uShowBurnIndex;
uniform vec3 uBurntColor;
uniform vec3 uBurningColor;
uniform vec3 uBurnIndexLow;
uniform vec3 uBurnIndexMedium;
uniform vec3 uBurnIndexHigh;
varying vec2 vTerrainUv;
varying vec3 vLocalPos;

float wfHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float wfNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(wfHash(i), wfHash(i + vec2(1.0, 0.0)), u.x),
             mix(wfHash(i + vec2(0.0, 1.0)), wfHash(i + vec2(1.0, 1.0)), u.x), u.y);
}

// Two octaves so a burn perimeter gets both broad lobes and fine crenulation.
float wfEdgeNoise(vec2 p) {
  return 0.62 * wfNoise(p) + 0.38 * wfNoise(p * 2.7 + 11.3);
}

// Tile luminance at which a glyph reaches its full ink color. 0.165 is #2A2A2A,
// the gray the tiles draw their strokes at, which scripts/measure-terrain-textures.mjs
// checks them against. Redraw the tiles at a different stroke gray and this has to
// move with them or the glyphs render washed out.
const float WF_GLYPH_INK = 0.165;

/**
 * Ink color for glyphs drawn on the given base: the SAME hue and saturation, scaled to
 * whatever luminance hits the requested contrast ratio.
 *
 * This is why it is not a plain multiply. Contrast ratio goes as (L + 0.05), so
 * a fixed multiplier yields progressively LESS perceived contrast as the base
 * darkens: a multiplier tuned on the pale drought colors washes the conifers out
 * on the darkest zone color.
 *
 * Darkening is preferred, but against a base as dark as the burnt ground no
 * amount of it reaches the target, so the ink lightens instead. That is what
 * makes burnt terrain render its vegetation glyphs as legible gray rather than
 * black-on-black, with no separate ash color to hand-pick.
 *
 * MIRRORED IN TYPESCRIPT at terrain-glyph-colors.test.ts. Jest has no WebGL, so
 * that file reimplements this function to pin the five stroke colors the design
 * board authored against the terrain colors and contrast targets they were
 * derived from. It guards the inputs, not this body: an edit here will not turn
 * it red. If the derivation changes, change the mirror too, or the test goes on
 * asserting a formula that no longer ships.
 */
vec3 wfInk(vec3 base, float ratio) {
  float baseLum = dot(base, vec3(0.2126, 0.7152, 0.0722));
  float darkLum = (baseLum + 0.05) / ratio - 0.05;
  float lightLum = ratio * (baseLum + 0.05) - 0.05;
  // Best contrast each direction can possibly deliver, at pure black / pure white.
  float darkCeiling = (baseLum + 0.05) / 0.05;
  float lightCeiling = 1.05 / (baseLum + 0.05);
  // Prefer darkening. When the requested ratio is out of reach that way, take
  // whichever direction can actually deliver more and clamp to it, rather than
  // flipping outright — a naive flip is a cliff: one notch past the darkening
  // ceiling the glyphs jump from near-black to near-white and disappear.
  float targetLum;
  if (darkLum >= 0.0) {
    targetLum = darkLum;
  } else if (darkCeiling >= lightCeiling) {
    targetLum = 0.0;
  } else {
    targetLum = min(lightLum, 1.0);
  }
  // Scaling preserves the color family, but cannot lift a near-black base — it
  // has no chroma to scale — so fall back to a neutral of the target luminance.
  // (A gray's luminance is its own value, since the coefficients sum to 1.)
  return mix(vec3(targetLum), base * (targetLum / max(baseLum, 1e-4)), step(0.01, baseLum));
}

/**
 * Per-drought-level contrast target, chosen by matching the incoming terrain
 * color against the four drought colors.
 *
 * Matching the color rather than reading a per-cell drought texture keeps this
 * free: the base color arriving here IS one of those four (the vertex colors are
 * built from getTerrainColor), so the match is exact in practice, and it costs no
 * extra texture, upload, or per-tick CPU work. Colors that are not drought colors
 * at all — river, fire line, the TPI debug overlay — resolve to whichever is
 * nearest, which is harmless because none of them should carry glyphs anyway.
 */
float wfRatioFor(vec3 base) {
  vec4 dist = vec4(
    distance(base, uDroughtColors[0]), distance(base, uDroughtColors[1]),
    distance(base, uDroughtColors[2]), distance(base, uDroughtColors[3]));
  float nearest = min(min(dist.x, dist.y), min(dist.z, dist.w));
  vec4 pick = step(dist, vec4(nearest));
  return dot(uGlyphContrastLevels, pick) / max(dot(pick, vec4(1.0)), 1.0);
}

/**
 * Recolors a surface for one tile luminance sample. Neutral leaves the base color
 * untouched, below neutral moves toward the ink, above neutral lifts gently
 * toward white.
 *
 * Called twice with the same tile sample — once against the drought color and
 * once against the burnt color — which is what lets a burnt cell keep the exact
 * glyph shape of whatever vegetation used to be there.
 */
vec3 wfGlyphSurface(vec3 base, float tileLum, float ratio) {
  vec3 ink = wfInk(base, ratio);
  float t = clamp((tileLum - WF_GLYPH_INK) / (0.5 - WF_GLYPH_INK), 0.0, 1.0);
  vec3 shaded = mix(ink, base, t);
  vec3 lit = mix(base, mix(base, vec3(1.0), uHighlight), clamp((tileLum - 0.5) * 2.0, 0.0, 1.0));
  return mix(shaded, lit, step(0.5, tileLum));
}
`;

const FRAGMENT_BODY = /* glsl */`
{
  // Sample the per-cell data at texel CENTERS. Without the half-texel inset,
  // linear filtering would shift the whole fire state half a cell (250 ft).
  vec2 dataUv = (vTerrainUv * (uGridSize - 1.0) + 0.5) / uGridSize;
  vec4 burn = texture2D(uBurnState, dataUv);
  vec4 vegetationWeights = texture2D(uVegetationWeights, dataUv);

  // Cells that survived the fire keep their vegetation, so they must not char.
  float charAmount = burn.r * (1.0 - burn.a);
  float burning = burn.g;
  float burnIndex = burn.b;

  // SVG y runs downward, while texture v runs from the NEAR edge of the terrain
  // to the far edge. Sampling the tile directly therefore points every glyph back
  // toward the camera, so they read upside down. Flipping v stands them up.
  vec2 tileUv = vec2(vTerrainUv.x, 1.0 - vTerrainUv.y) * uTileRepeat;
  // One fetch yields all four vegetation tiles; the weights select among them.
  // The weights are linearly filtered, so a zone boundary gets a one-cell blend
  // instead of a stair-stepped diagonal.
  vec4 tileLuminance = texture2D(uVegetationTiles, tileUv);
  float weightSum = dot(vegetationWeights, vec4(1.0));
  // Blending toward neutral by the MISSING weight, rather than normalizing by the
  // weight sum, turns "no vegetation here" into a general texture mask. Normal
  // cells and zone boundaries both sum to 1 and are unaffected; a cell whose
  // weights were left at zero (a river) lands exactly on neutral and shows no
  // glyphs, with a soft one-cell bank instead of a hard cut. Normalizing could not
  // do this — it rescales any non-zero weight back to a full-strength glyph.
  float tileLum = dot(tileLuminance, vegetationWeights) + 0.5 * (1.0 - weightSum);

  // The whole reason for texturing the burn: the simulation's fire state is one
  // value per 500 ft cell, so interpolating it directly gives a soft gradient
  // ring. Thresholding it against noise instead turns that same gradient into a
  // ragged perimeter, at no cost to the simulation.
  float charMask = smoothstep(
    wfEdgeNoise(vTerrainUv * uEdgeNoiseScale) - uEdgeSoftness,
    wfEdgeNoise(vTerrainUv * uEdgeNoiseScale) + uEdgeSoftness,
    charAmount);
  float fireMask = smoothstep(
    wfEdgeNoise(vTerrainUv * uEdgeNoiseScale + 37.0) - uEdgeSoftness,
    wfEdgeNoise(vTerrainUv * uEdgeNoiseScale + 37.0) + uEdgeSoftness,
    burning);

  // Low-frequency variation added here rather than baked into the tiles, so the
  // tiling never reads as a repeating grid at distance.
  tileLum = clamp(tileLum + uMacroAmount * (wfNoise(vTerrainUv * uMacroScale) - 0.5), 0.0, 1.0);

  // Fade the texture off surfaces that do not face up. The tile UV is a top-down
  // planar projection, so on a near-vertical face the UV barely changes while the
  // surface runs on for a long way, smearing the glyphs into streaks. Fading to
  // neutral leaves those faces as flat terrain color — textures on the top
  // surface only. Applied after the macro noise so the sides stay perfectly flat.
  //
  // The orientation comes from screen-space derivatives of the local position,
  // which give the actual geometry of the triangle being shaded rather than the
  // averaged vertex normal. This is what makes the skirt read as vertical even
  // where it borders flat terrain. dFdx/dFdy are core in GLSL ES 3.00, which three
  // compiles to on the WebGL2 context it creates by default at r153.
  vec3 dLocalX = dFdx(vLocalPos);
  vec3 dLocalY = dFdy(vLocalPos);
  float upness = abs(normalize(cross(dLocalX, dLocalY)).z);
  tileLum = mix(0.5, tileLum, smoothstep(uSlopeFade.x, uSlopeFade.y, upness));

  // The SAME tile sample drives both surfaces, so a burnt cell keeps the glyph of
  // whatever grew there — burnt grass still reads as grass, burnt forest as
  // forest — and only the color changes. Deriving both inks from their own base
  // is what turns dark-on-drought-color into legible gray-on-black, and it means
  // burnt artwork can never fall out of sync with the vegetation artwork.
  vec3 vegetationSurface = wfGlyphSurface(diffuseColor.rgb, tileLum, wfRatioFor(diffuseColor.rgb));
  vec3 charSurface = wfGlyphSurface(uBurntColor, tileLum, uGlyphContrastBurnt);

  vec3 surface = mix(vegetationSurface, charSurface, charMask);
  float lum = tileLum;

  vec3 burnIndexColor = mix(
    mix(uBurnIndexLow, uBurnIndexMedium, clamp(burnIndex * 2.0, 0.0, 1.0)),
    uBurnIndexHigh, clamp(burnIndex * 2.0 - 1.0, 0.0, 1.0));
  vec3 fireColor = mix(uBurningColor, burnIndexColor, uShowBurnIndex);
  // Keep a little texture visible through the flame so the fire front does not
  // flatten into a solid silhouette.
  fireColor *= mix(0.88, 1.12, lum);

  diffuseColor.rgb = mix(surface, fireColor, fireMask * uFireOpacity);
}
`;

/**
 * Builds the textured terrain material.
 *
 * The material is still a MeshPhongMaterial patched via onBeforeCompile rather
 * than a ShaderMaterial, so it keeps three's existing lighting path — which
 * matters because the scene has only a hemisphere light to work with.
 *
 * Vertex colors still drive the BASE terrain color (drought, river, fire line,
 * the TPI debug overlay), so all of that logic is untouched. Fire is composited
 * here instead, because only in the fragment shader can the burn edge be made
 * crisp; by the time a vertex color reaches a fragment it has already been
 * interpolated across a 500 ft cell and the hard edge is gone.
 */
export const createTexturedTerrainMaterial = (
  textures: TerrainTextures, config: ISimulationConfig, planeSize: THREE.Vector2
) => {
  const uniforms: TerrainShaderUniforms = {
    uVegetationTiles: { value: textures.vegetationTiles },
    uVegetationWeights: { value: null },
    uBurnState: { value: null },
    uGridSize: { value: new THREE.Vector2(config.gridWidth, config.gridHeight) },
    uPlaneSize: { value: planeSize },
    uSlopeFade: { value: new THREE.Vector2(...SLOPE_FADE) },
    // Repeat count is derived from real model dimensions so a tile always covers
    // the same ground distance, and is scaled on Y by the plane aspect so tiles
    // stay square on presets whose model is not 3:2.
    uTileRepeat: {
      value: new THREE.Vector2(
        config.modelWidth / TILE_FT,
        (config.modelWidth / TILE_FT) * (planeSize.y / planeSize.x)
      )
    },
    uGlyphContrastLevels: { value: new THREE.Vector4(...config.terrainGlyphContrast) },
    uGlyphContrastBurnt: { value: config.terrainGlyphContrastBurnt },
    uDroughtColors: {
      value: [
        DroughtLevel.NoDrought, DroughtLevel.MildDrought,
        DroughtLevel.MediumDrought, DroughtLevel.SevereDrought
      ].map(level => srgb(getTerrainColor(level)))
    },
    uHighlight: { value: HIGHLIGHT },
    uMacroScale: { value: 5.0 },
    uMacroAmount: { value: MACRO_AMOUNT },
    uEdgeNoiseScale: { value: BURN_EDGE_NOISE_SCALE },
    uEdgeSoftness: { value: BURN_EDGE_SOFTNESS },
    uFireOpacity: { value: 0.92 },
    uShowBurnIndex: { value: config.showBurnIndex ? 1 : 0 },
    uBurntColor: { value: srgb(BURNT_COLOR) },
    uBurningColor: { value: srgb(BURNING_COLOR) },
    uBurnIndexLow: { value: srgb(BURN_INDEX_LOW) },
    uBurnIndexMedium: { value: srgb(BURN_INDEX_MEDIUM) },
    uBurnIndexHigh: { value: srgb(BURN_INDEX_HIGH) }
  };

  const material = new THREE.MeshPhongMaterial({ vertexColors: true });

  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${VERTEX_DECL}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${VERTEX_BODY}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAGMENT_DECL}`)
      // <color_fragment> is what multiplies vColor into diffuseColor, so this
      // injection runs with the base terrain color already in place.
      .replace("#include <color_fragment>", `#include <color_fragment>\n${FRAGMENT_BODY}`);
  };

  return { material, uniforms };
};
