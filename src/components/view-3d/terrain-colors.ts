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
