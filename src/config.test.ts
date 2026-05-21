import { getDefaultConfig, getResolvedConfig } from "./config";
import presets from "./presets";

// Capture / restore window.location around tests so the URL mock doesn't leak.
// Same pattern as engine-singleton.test.ts.
const originalLocation = window.location;
afterAll(() => {
  Object.defineProperty(window, "location", { value: originalLocation, writable: true });
});

function setUrl(search: string) {
  Object.defineProperty(window, "location", {
    value: new URL(`https://wildfire-model.unexisting.url.com/${search}`),
    writable: true,
  });
}

describe("getResolvedConfig", () => {
  it("resolves the preset from the URL `preset` param and merges base ◁ preset ◁ URL", () => {
    setUrl("?preset=plainsTwoZone");
    const resolved = getResolvedConfig();
    // Preset layer applied: plainsTwoZone's two zones replace the base config's.
    expect(resolved.zones).toEqual(presets.plainsTwoZone.zones);
    expect(resolved.zonesCount).toBe(2);
    // Base layer still present for keys neither preset nor URL define.
    expect(resolved.modelWidth).toBe(getDefaultConfig().modelWidth);
  });

  it("applies URL params on top of the URL-resolved preset", () => {
    setUrl("?preset=plainsTwoZone&windSpeed=5");
    const resolved = getResolvedConfig();
    expect(resolved.windSpeed).toBe(5);
    expect(resolved.zones).toEqual(presets.plainsTwoZone.zones);
  });

  it("substitutes an explicit preset partial for the preset slot of the merge", () => {
    setUrl("");
    const explicit = { windSpeed: 12, zonesCount: 2 as const };
    const resolved = getResolvedConfig(explicit);
    expect(resolved.windSpeed).toBe(12);
    expect(resolved.zonesCount).toBe(2);
  });

  it("URL params still override an explicit preset partial", () => {
    setUrl("?windSpeed=7");
    const resolved = getResolvedConfig({ windSpeed: 3 });
    // The explicit-preset form is Object.assign(getDefaultConfig(), explicitPreset,
    // getUrlConfig()) — the URL layer wins over the explicit preset.
    expect(resolved.windSpeed).toBe(7);
  });

  it("replaces the base `zones` tuple wholesale — shallow merge, no per-zone deep merge", () => {
    setUrl("");
    const resolved = getResolvedConfig(presets.plainsTwoZone);
    // plainsTwoZone defines two zones; the base config defines three. A shallow
    // merge takes the preset's `zones` entirely, so the result has two.
    expect(resolved.zones).toEqual(presets.plainsTwoZone.zones);
    expect(resolved.zones.length).toBe(2);
  });

  it("falls back to the base config when the URL `preset` name is unrecognized", () => {
    setUrl("?preset=nonexistentPresetName");
    const resolved = getResolvedConfig();
    // presets[...] is undefined, which Object.assign skips — base config zones.
    expect(resolved.zones).toEqual(getDefaultConfig().zones);
  });
});
