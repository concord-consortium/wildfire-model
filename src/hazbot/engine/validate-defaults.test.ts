import { validateDefaultsPath } from "./validate-defaults";

describe("validateDefaultsPath", () => {
  it("succeeds on top-level field present", () => {
    expect(validateDefaultsPath({ wind: { speed: 5 } }, "wind.speed")).toEqual({ ok: true });
  });

  it("fails on missing top-level field", () => {
    const r = validateDefaultsPath({ wind: { speed: 5 } }, "missingField");
    expect(r).toEqual({ ok: false, failingPath: "missingField is undefined" });
  });

  it("fails on missing nested field", () => {
    const r = validateDefaultsPath({ wind: { speed: 5 } }, "wind.direction");
    expect(r).toEqual({ ok: false, failingPath: "wind.direction is undefined" });
  });

  it("succeeds on `[*]` traversal when all entries have the suffix", () => {
    const defaults = { zones: [{ terrainType: "Plains" }, { terrainType: "Foothills" }] };
    expect(validateDefaultsPath(defaults, "zones[*].terrainType")).toEqual({ ok: true });
  });

  it("fails on `[*]` traversal when one entry is missing the suffix", () => {
    const defaults = { zones: [{ terrainType: "Plains" }, { vegetation: "Grass" }] };
    const r = validateDefaultsPath(defaults, "zones[*].terrainType");
    expect(r).toEqual({ ok: false, failingPath: "zones[1].terrainType is undefined" });
  });

  it("fails on `[*]` traversal when array is empty", () => {
    const r = validateDefaultsPath({ zones: [] }, "zones[*].terrainType");
    expect(r).toEqual({ ok: false, failingPath: "zones[] is empty" });
  });

  it("fails on `[*]` traversal when target is not an array", () => {
    const r = validateDefaultsPath({ zones: { terrainType: "Plains" } }, "zones[*].terrainType");
    expect(r).toEqual({ ok: false, failingPath: "zones is not an array" });
  });

  it("fails on `[*]` traversal when array itself is missing", () => {
    const r = validateDefaultsPath({}, "zones[*].terrainType");
    expect(r).toEqual({ ok: false, failingPath: "zones is undefined" });
  });

  it("fails on null intermediate", () => {
    const r = validateDefaultsPath({ wind: null }, "wind.speed");
    expect(r).toEqual({ ok: false, failingPath: "wind is null" });
  });

  it("succeeds on terminal that is `false` or `0`", () => {
    // requiredDefaults validation requires non-undefined / non-null — falsy values are valid.
    expect(validateDefaultsPath({ enabled: false }, "enabled")).toEqual({ ok: true });
    expect(validateDefaultsPath({ count: 0 }, "count")).toEqual({ ok: true });
    expect(validateDefaultsPath({ name: "" }, "name")).toEqual({ ok: true });
  });
});
