import { topDownZoom } from "./top-down-framing";

const DESIGN_POLAR = 28 * Math.PI / 180;
// The Chromebook's 463px canvas leaves a 371px gap between the zone labels and the bottom bar.
const base = { designPolar: DESIGN_POLAR, canvasHeight: 463, silhouettePx: 358, marginPx: 20 };

describe("topDownZoom", () => {
  it("shrinks the straight-down model until it clears the gap by the margin", () => {
    const zoom = topDownZoom({ ...base, polar: 0 });
    expect(zoom * base.silhouettePx).toBeCloseTo(371 - 2 * 20, 6);
  });

  it("leaves the default pose and anything flatter alone", () => {
    expect(topDownZoom({ ...base, polar: DESIGN_POLAR })).toBe(1);
    expect(topDownZoom({ ...base, polar: 60 * Math.PI / 180 })).toBe(1);
  });

  it("eases in between the default pose and straight down", () => {
    const top = topDownZoom({ ...base, polar: 0 });
    const half = topDownZoom({ ...base, polar: DESIGN_POLAR / 2 });
    const near = topDownZoom({ ...base, polar: DESIGN_POLAR * 0.9 });
    expect(half).toBeCloseTo((1 + top) / 2, 6);
    // smoothstep's slow start: 10% of the way down gives well under 10% of the shrink.
    expect(near).toBeLessThan(1);
    expect(1 - near).toBeLessThan(0.1 * (1 - top));
  });

  it("does nothing with no margin, and never enlarges a model that already fits", () => {
    expect(topDownZoom({ ...base, polar: 0, marginPx: 0 })).toBe(1);
    expect(topDownZoom({ ...base, polar: 0, silhouettePx: 200 })).toBe(1);
  });
});
