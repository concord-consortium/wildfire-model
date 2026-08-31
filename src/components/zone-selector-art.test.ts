declare const __dirname: string;
declare const require: (id: string) => unknown;
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const { existsSync } = require("fs") as { existsSync: (path: string) => boolean };
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const { resolve } = require("path") as { resolve: (...paths: string[]) => string };
import { getBackgroundImage, getRiverOverlay } from "./zone-selector";
import { TerrainType } from "../types";

// The Setup thumbnails are named for the UI's terrain labels while the heightmap
// data files under src/public/data/ are named off the TerrainType enum, so the
// two spellings of Foothills have to be kept apart by hand. A miss renders as a
// thumbnail with no relief in it, which nothing else in the suite would notice.

const publicDir = resolve(__dirname, "..", "public");
const asFile = (url: string) => resolve(publicDir, url.replace(/^\.\//, ""));

describe("Setup panel terrain art", () => {
  const terrainTypes = [TerrainType.Plains, TerrainType.Foothills, TerrainType.Mountains];

  it("resolves every terrain thumbnail to a file that ships", () => {
    // Array.prototype.flat/flatMap are ES2019, and tsconfig's lib is es2017.
    const paths: string[] = [];
    terrainTypes.forEach(t => {
      [0, 1].forEach(i => paths.push(getBackgroundImage(2, t, i)));
      [0, 1, 2].forEach(i => paths.push(getBackgroundImage(3, t, i)));
    });
    expect(paths).toHaveLength(15);
    expect(new Set(paths).size).toBe(15);
    expect(paths.filter((p: string) => !existsSync(asFile(p)))).toEqual([]);
  });

  it("resolves every river overlay to a file that ships", () => {
    const paths: string[] = [
      ...[0, 1].map(i => getRiverOverlay(2, i)),
      ...[0, 1, 2].map(i => getRiverOverlay(3, i))
    ];
    expect(paths).toHaveLength(5);
    expect(new Set(paths).size).toBe(5);
    expect(paths.filter(p => !existsSync(asFile(p)))).toEqual([]);
  });

  it("spells Foothills as the UI does, not as the enum does", () => {
    expect(getBackgroundImage(2, TerrainType.Foothills, 0)).toBe("./terrain/2-zone-hills-left.png");
    expect(existsSync(asFile("./data/foothills-foothills-heightmap.png"))).toBe(true);
  });
});
