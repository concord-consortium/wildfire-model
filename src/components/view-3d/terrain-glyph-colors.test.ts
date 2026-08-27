import { getTerrainColor, BURNT_COLOR } from "./terrain-colors";
import { getDefaultConfig } from "../../config";
import { DroughtLevel } from "../../types";

// The shipping copy of this arithmetic is GLSL: `wfInk` and `wfRatioFor` in
// terrain-shader.ts. Jest runs on jsdom with no WebGL context, so it cannot
// execute them, and this is a TypeScript mirror instead. What it guards is
// therefore the INPUTS, not the formula: retuning a contrast target or nudging a
// drought color turns it red, editing the GLSL body does not. terrain-shader.ts
// carries a comment naming this file as its mirror.
//
// The color space is the whole result. A three.js fragment shader works in
// LINEAR space, so the derivation runs on the linearized drought colors.
// Evaluating the same formulas on the sRGB values instead yields #001501,
// #101806, #161A08, #0F0C05 and #000000, none of which match, and burnt comes
// out black rather than gray.

const srgbToLinear = (c: number) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
const linearToSrgb = (c: number) => c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
const clamp01 = (c: number) => Math.min(1, Math.max(0, c));
const LUMA = [0.2126, 0.7152, 0.0722];

const toHex = (linear: number[]) =>
  "#" + linear
    .map(c => Math.round(clamp01(linearToSrgb(c)) * 255).toString(16).padStart(2, "0"))
    .join("").toUpperCase();

// Mirror of wfInk (terrain-shader.ts). `base` is linear.
const wfInk = (base: number[], ratio: number) => {
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
  // step(0.01, baseLum): a base with no chroma to scale falls back to a neutral.
  return baseLum >= 0.01
    ? base.map(c => c * (targetLum / Math.max(baseLum, 1e-4)))
    : [targetLum, targetLum, targetLum];
};

const inkFor = (srgb: number[], ratio: number) => toHex(wfInk(srgb.map(srgbToLinear), ratio));

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
    // The lighten branch triggers when darkLum < 0, i.e. below linear luminance
    // (0.05 * ratio) - 0.05. The threshold is per-ratio, so it is derived from each
    // level's own contrast target rather than from the ratio most of them share.
    const lum = (srgb: number[]) =>
      srgb.map(srgbToLinear).reduce((acc, c, i) => acc + c * LUMA[i], 0);
    const lightenBelow = (ratio: number) => 0.05 * ratio - 0.05;
    expect(lum(BURNT_COLOR)).toBeLessThan(lightenBelow(config.terrainGlyphContrastBurnt));
    const levels = [DroughtLevel.NoDrought, DroughtLevel.MildDrought,
      DroughtLevel.MediumDrought, DroughtLevel.SevereDrought];
    expect(levels).toHaveLength(config.terrainGlyphContrast.length);
    levels.forEach(level => expect(lum(getTerrainColor(level)))
      .toBeGreaterThan(lightenBelow(config.terrainGlyphContrast[level])));
  });
});
