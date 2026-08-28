import {
  getTerrainColor, BURNT_COLOR, glyphInkHex, droughtGlyphInkHex, srgbToLinear, LUMA
} from "./terrain-colors";
import { getDefaultConfig } from "../../config";
import { DroughtLevel } from "../../types";

// The shipping copy of this arithmetic is GLSL: `wfInk` and `wfRatioFor` in
// terrain-shader.ts. Jest runs on jsdom with no WebGL context, so it cannot
// execute them, and terrain-colors.ts carries a TypeScript mirror instead. What
// this file guards is the mirror's OUTPUTS plus the INPUTS both share: retuning
// a contrast target, nudging a drought color or changing the mirror turns it
// red, editing the GLSL body does not. terrain-shader.ts carries a comment
// naming terrain-colors.ts as its mirror.

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
    expect(glyphInkHex(getTerrainColor(DroughtLevel.NoDrought), none)).toBe("#004001");
    expect(glyphInkHex(getTerrainColor(DroughtLevel.MildDrought), mild)).toBe("#2D460B");
    expect(glyphInkHex(getTerrainColor(DroughtLevel.MediumDrought), medium)).toBe("#424F12");
    expect(glyphInkHex(getTerrainColor(DroughtLevel.SevereDrought), severe)).toBe("#241B06");
    expect(glyphInkHex(BURNT_COLOR, config.terrainGlyphContrastBurnt)).toBe("#B3B3B3");
  });

  it("routes drought levels to their own contrast target", () => {
    // terrainGlyphContrast is [6, 6, 6, 7], so three of the four levels share a
    // ratio and a wrong index still produces the right hex for them. Severe is
    // the only level whose ratio the case above can tell apart.
    expect(droughtGlyphInkHex(DroughtLevel.SevereDrought, config.terrainGlyphContrast)).toBe("#241B06");
    expect(droughtGlyphInkHex(DroughtLevel.SevereDrought, [6, 6, 6, 6])).not.toBe("#241B06");
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
