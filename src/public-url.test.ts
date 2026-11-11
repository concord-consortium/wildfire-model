import { getPublicPath, publicUrl } from "./public-url";
import { RELEASE_PUBLIC_PATH, usePublicPath } from "./public-url-test-helpers";

describe("publicUrl", () => {
  describe("with no public path", () => {
    it("returns the path unchanged", () => {
      expect(getPublicPath()).toBeUndefined();
      expect(publicUrl("terrain-textures/grass.svg")).toBe("terrain-textures/grass.svg");
    });
  });

  describe("with a release public path", () => {
    usePublicPath(RELEASE_PUBLIC_PATH);

    it("reads the public path", () => {
      expect(getPublicPath()).toBe(RELEASE_PUBLIC_PATH);
    });

    it("resolves relative paths against the build's root folder", () => {
      expect(publicUrl("terrain-textures/grass.svg"))
        .toBe("https://wildfire.concord.org/version/v9.9.9/terrain-textures/grass.svg");
      expect(publicUrl("./terrain/2-zone-hills-left.png"))
        .toBe("https://wildfire.concord.org/version/v9.9.9/terrain/2-zone-hills-left.png");
    });

    it("leaves absolute inputs pointing where they already did", () => {
      expect(publicUrl("https://other.example/a.png")).toBe("https://other.example/a.png");
      expect(publicUrl("/abs.png")).toBe("https://wildfire.concord.org/abs.png");
      expect(publicUrl("//cdn.example/x.png")).toBe("https://cdn.example/x.png");
      expect(publicUrl("data:image/png;base64,AAA")).toBe("data:image/png;base64,AAA");
      expect(publicUrl("blob:https://wildfire.concord.org/1234")).toBe("blob:https://wildfire.concord.org/1234");
    });

    it("prefers an explicit base over the public path", () => {
      expect(publicUrl("data/river-texmap.png", "https://example.org/build/"))
        .toBe("https://example.org/build/data/river-texmap.png");
    });
  });
});
