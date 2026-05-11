import { ENGINE_VERSION } from "./version";

describe("ENGINE_VERSION", () => {
  it("is a string matching semver MAJOR.MINOR.PATCH", () => {
    expect(typeof ENGINE_VERSION).toBe("string");
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
