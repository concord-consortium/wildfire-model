import {
  annotationIcons, FIRE_LINE_EVENT, HELITACK_EVENT, iconBandHeight, iconPlacement
} from "./annotation-icons";

// 0 to 100 hours across a 100px plot starting at x = 50, so one hour is one pixel
const scale = { min: 0, max: 100, getPixelForValue: (value: number) => 50 + value };
const CHART_AREA_TOP = 30;

describe("annotation icon placement", () => {
  it("reserves a band tall enough for the tallest icon plus its gap", () => {
    expect(iconBandHeight).toBe(30);
    Object.values(annotationIcons).forEach(icon => {
      expect(iconBandHeight - icon.gap - icon.height).toBeGreaterThanOrEqual(1);
    });
  });

  it("centers the icon on its event time, above the plot", () => {
    expect(iconPlacement(FIRE_LINE_EVENT, 20, scale, CHART_AREA_TOP)).toEqual({
      left: Math.round(70 - 21 / 2), top: 30 - 2 - 27, width: 21, height: 27
    });
    expect(iconPlacement(HELITACK_EVENT, 20, scale, CHART_AREA_TOP)).toEqual({
      left: Math.round(70 - 27 / 2), top: 30 - 3 - 22, width: 27, height: 22
    });
  });

  // The artwork touches its bounding box on every side and its outline is 1px, so a fractional
  // offset makes drawImage resample that outline across two columns and the side edges read as
  // clipped (measured on the live chart: outline alpha 103-139 fractional vs 255 integer).
  it("rounds onto the pixel grid so the 1px outline stays solid", () => {
    const fractional = { ...scale, getPixelForValue: (value: number) => 50.4 + value };
    expect(iconPlacement(FIRE_LINE_EVENT, 20, fractional, CHART_AREA_TOP)?.left).toBe(60);
    const fractionalTop = 30.6;
    expect(iconPlacement(FIRE_LINE_EVENT, 20, fractional, fractionalTop)?.top).toBe(2);
  });

  it("draws an event sitting exactly on either end of the visible range", () => {
    expect(iconPlacement(FIRE_LINE_EVENT, 0, scale, CHART_AREA_TOP)).not.toBeNull();
    expect(iconPlacement(FIRE_LINE_EVENT, 100, scale, CHART_AREA_TOP)).not.toBeNull();
  });

  it("suppresses an event that has scrolled out of the visible range", () => {
    const scrolled = { ...scale, min: 30, max: 72 };
    expect(iconPlacement(FIRE_LINE_EVENT, 20, scrolled, CHART_AREA_TOP)).toBeNull();
    expect(iconPlacement(FIRE_LINE_EVENT, 73, scrolled, CHART_AREA_TOP)).toBeNull();
  });

  it("ignores annotations with no event kind, or an unknown one", () => {
    expect(iconPlacement(undefined, 20, scale, CHART_AREA_TOP)).toBeNull();
    expect(iconPlacement("smokeJumper", 20, scale, CHART_AREA_TOP)).toBeNull();
  });
});
