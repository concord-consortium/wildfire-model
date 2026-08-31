import { DroughtLevel } from "../../types";
import { BurnIndex } from "../../models/cell";

// Extracted from terrain.tsx so the textured-terrain shader can share the exact
// same palette without importing the component (which would be circular).
// terrain.tsx re-exports the burn index colors, so existing importers such as
// fire-intensity-scale.tsx are unaffected.
//
// All values are sRGB in 0..1 — the numbers you would type into CSS. three.js
// lights in linear space, so both the vertex-color path and the shader convert
// them before use.

export const getTerrainColor = (droughtLevel: number) => {
  switch (droughtLevel) {
    case DroughtLevel.NoDrought:
      return [0.008, 0.831, 0.039];
    case DroughtLevel.MildDrought:
      return [0.573, 0.839, 0.216];
    case DroughtLevel.MediumDrought:
      return [0.757, 0.886, 0.271];
    default:
      return [0.784, 0.631, 0.271];
  }
};

export const BURNING_COLOR = [1, 0, 0];
export const BURNT_COLOR = [0.2, 0.2, 0.2];
export const FIRE_LINE_UNDER_CONSTRUCTION_COLOR = [0.5, 0.5, 0];

export const BURN_INDEX_LOW = [1, 0.7, 0];
export const BURN_INDEX_MEDIUM = [1, 0.5, 0];
export const BURN_INDEX_HIGH = [1, 0, 0];

export const burnIndexColor = (burnIndex: BurnIndex) => {
  if (burnIndex === BurnIndex.Low) {
    return BURN_INDEX_LOW;
  }
  if (burnIndex === BurnIndex.Medium) {
    return BURN_INDEX_MEDIUM;
  }
  return BURN_INDEX_HIGH;
};

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
export const srgbToLinear = (c: number) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
const linearToSrgb = (c: number) => c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
const clamp01 = (c: number) => Math.min(1, Math.max(0, c));
export const LUMA = [0.2126, 0.7152, 0.0722] as const;

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

const toHex = (srgb: number[]): string =>
  "#" + srgb.map(c => Math.round(clamp01(c) * 255).toString(16).padStart(2, "0")).join("").toUpperCase();

/**
 * The ink a glyph is drawn in over `srgb`, as a CSS hex string, at the given
 * contrast ratio. `srgb` is one of the getTerrainColor values or BURNT_COLOR.
 */
export const glyphInkHex = (srgb: number[], ratio: number): string =>
  toHex(glyphInkLinear(srgb.map(srgbToLinear), ratio).map(linearToSrgb));

/**
 * One zone's drought color as a CSS hex string. The Setup panel's terrain art is
 * a neutral gray relief, and multiplying it by this is what gives the thumbnail
 * its drought tint, so a thumbnail and the 3D model it previews take their color
 * from the same place.
 */
export const droughtTerrainHex = (droughtLevel: DroughtLevel): string => toHex(getTerrainColor(droughtLevel));

/**
 * The Setup panel's texture ink for one zone. `contrast` is
 * config.terrainGlyphContrast, indexed by drought level, so an activity that
 * retunes the contrast targets moves the thumbnails and the model together.
 */
export const droughtGlyphInkHex = (droughtLevel: DroughtLevel, contrast: readonly number[]): string =>
  glyphInkHex(getTerrainColor(droughtLevel), contrast[droughtLevel]);
