import { loadTerrainTextures } from "./terrain-textures";
import { RELEASE_PUBLIC_PATH, usePublicPath } from "../../public-url-test-helpers";

describe("loadTerrainTextures", () => {
  usePublicPath(RELEASE_PUBLIC_PATH);

  const OriginalImage = window.Image;
  let requested: string[];

  beforeEach(() => {
    requested = [];
    class FailingImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(url: string) {
        requested.push(url);
        setTimeout(() => this.onerror?.());
      }
    }
    window.Image = FailingImage as unknown as typeof Image;
  });

  afterEach(() => {
    window.Image = OriginalImage;
  });

  it("requests every vegetation tile from the build's root folder", async () => {
    const root = "https://wildfire.concord.org/version/v9.9.9/terrain-textures/";
    await expect(loadTerrainTextures(1))
      .rejects.toThrow(`failed to load terrain tile: ${root}grass.svg`);
    expect(requested).toEqual([
      `${root}grass.svg`,
      `${root}shrub.svg`,
      `${root}forest.svg`,
      `${root}forest-with-suppression.svg`
    ]);
  });
});
