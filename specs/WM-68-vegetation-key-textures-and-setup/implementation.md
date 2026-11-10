# Implementation Plan: Vegetation Key textures and Setup panel images load from the release's own folder

**Jira**: https://concord-consortium.atlassian.net/browse/WM-68
**Requirements Spec**: [requirements.md](requirements.md)
**Status**: **In Development**

## Implementation Plan

Four small commits on WM-68's branch, off master. No dependency or lockfile change. Each step compiles, lints and passes `npm test` on its own; the first adds an unused helper, and each later step moves one family of request sites onto it with the test that pins it.

The approach was built and run before this plan was written (see the end-to-end run in requirements.md's Technical Notes), so the shapes below are the ones that produced 200s from `version/vtest/` in the release layout.

### Add a resolver for files shipped in `src/public`

**Summary**: One function that turns a path under `src/public` into a URL against webpack's runtime public path, and leaves it alone where there is none. A separate commit because every later step depends on it and its contract is tested on its own.

**Files affected**:
- `src/public-url.ts` (new): `getPublicPath` and `publicUrl`
- `src/public-url-test-helpers.ts` (new): `usePublicPath`, the Jest hook later steps share
- `src/public-url.test.ts` (new)

**Estimated diff size**: ~55 lines

`src/public-url.ts`:

```ts
// Webpack's runtime public path: the build's root folder, derived from the bundle
// script's own URL (its folder plus "../", since the bundle sits in assets/) because
// output.publicPath is left at "auto". Declared here because the project does not
// depend on @types/webpack-env.
declare let __webpack_public_path__: string | undefined;

// The typeof guard keeps this callable under Jest, where the identifier is not
// defined. In the bundle webpack replaces the identifier with its runtime value.
export const getPublicPath = (): string | undefined =>
  typeof __webpack_public_path__ === "string" && __webpack_public_path__ ? __webpack_public_path__ : undefined;

/**
 * Resolves a path to a file in src/public, which CopyWebpackPlugin copies to the build's
 * root folder, against that folder rather than the page. The two differ for the
 * released index.html, which is a copy of the build's index-top.html placed above
 * `version/<tag>/`. An absolute URL, a root-relative path and a `data:`
 * or `blob:` URL come back pointing where they already did.
 */
export const publicUrl = (path: string, base = getPublicPath()): string =>
  base ? new URL(path, base).href : path;
```

`src/public-url-test-helpers.ts`:

```ts
// Sets webpack's runtime public path for the tests in the enclosing describe, the way
// the bundle sees it in a release deploy, and removes it afterward so the rest of the
// suite sees Jest's default of none.
export const usePublicPath = (base: string) => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>).__webpack_public_path__ = base;
  });
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).__webpack_public_path__;
  });
};

// Unnormalized, as webpack's "auto" runtime computes it from assets/index.[contenthash].js.
export const RELEASE_PUBLIC_PATH = "https://wildfire.concord.org/version/v9.9.9/assets/../";
```

`src/public-url.test.ts` covers:

- With no public path: `getPublicPath()` is `undefined` and `publicUrl("terrain-textures/grass.svg")` returns its input. Catches a resolver that always prefixes, which would break every existing test that pins a relative string.
- With `usePublicPath(RELEASE_PUBLIC_PATH)`: `getPublicPath()` returns it (catches a guard that never reads the global), and `publicUrl` maps `terrain-textures/grass.svg` and `./terrain/2-zone-hills-left.png` to `https://wildfire.concord.org/version/v9.9.9/terrain-textures/grass.svg` and `.../version/v9.9.9/terrain/2-zone-hills-left.png`, with no `assets/../` left in them (catches a resolver that ignores the base, one that resolves `./` against the page, or one that concatenates onto the unnormalized base).
- Absolute inputs, each asserted equal to an explicit expected string: `https://other.example/a.png` unchanged, `/abs.png` to `https://wildfire.concord.org/abs.png`, `data:image/png;base64,AAA` unchanged. Catches string concatenation in place of `new URL`.
- An explicit `base` argument wins over the global, which is what lets the helper be tested without the global at all.

---

### Resolve the vegetation tiles against the public path

**Summary**: The four tile URLs are built in two places today, `loadTerrainTextures` and `renderZones`, each as `TILE_DIR + VEGETATION_TILE_FILES[v]`. This step gives the build one home, `vegetationTileUrl`, resolves it there, and makes both callers use it. This is the Vegetation Key half of the story.

**Files affected**:
- `src/components/view-3d/terrain-textures.ts`: add `vegetationTileUrl`; `TILE_DIR` and `VEGETATION_TILE_FILES` stop being exported; `loadTerrainTextures` calls `vegetationTileUrl(v)` and is exported for its test; rewrite the `TILE_DIR` comment
- `src/components/view-3d/terrain-textures.test.ts` (new): the 3D request test
- `src/components/zone-selector.tsx`: import `vegetationTileUrl` in place of `TILE_DIR` and `VEGETATION_TILE_FILES`; `tileUrl` becomes `` `url(${vegetationTileUrl(z.vegetation)})` ``
- `src/components/terrain-panel.test.tsx`: one new case

**Estimated diff size**: ~55 lines

```ts
// The tiles live in src/public, which CopyWebpackPlugin copies to the build's root
// folder verbatim. They are fetched by URL at runtime rather than imported, for two reasons:
// the webpack `.svg` rule pipes every SVG imported from a .tsx through SVGR (which
// yields a React component, not a URL), and, more importantly, serving them as static
// files means an artist can edit a tile and reload the page, with no rebuild and no
// import to update. vegetationTileUrl resolves them against that folder, which is not
// the page's folder on the released index.html.
const TILE_DIR = "terrain-textures/";

export const vegetationTileUrl = (vegetation: Vegetation) =>
  publicUrl(TILE_DIR + VEGETATION_TILE_FILES[vegetation]);
```

`VEGETATION_TILE_FILES` also stops being exported. Its only reader outside the module is `zone-selector.tsx`, which this step moves to `vegetationTileUrl`; `scripts/measure-terrain-textures.mjs` keeps its own `TILE_DIR` (a filesystem path) and lists the folder rather than importing the map.

The new `terrain-panel.test.tsx` case sits in a `describe` with `usePublicPath(RELEASE_PUBLIC_PATH)` and asserts the masks of `defaultThreeZones` equal `url(https://wildfire.concord.org/version/v9.9.9/terrain-textures/forest.svg)`, `.../shrub.svg)` and `.../forest-with-suppression.svg)`. jsdom keeps the URL unquoted in `style.maskImage`, the same form the existing assertions use. The existing three mask assertions stay exactly as they are and keep passing because no public path is set outside the new `describe`. Mutation caught: dropping `publicUrl` from `vegetationTileUrl`, or `renderZones` going back to building its own string.

The 3D call site gets its own test without a canvas. `terrain-textures.test.ts`, under `usePublicPath(RELEASE_PUBLIC_PATH)`, replaces `window.Image` with a stub whose `src` setter records the URL and fires `onerror` on the next tick, and restores it afterward. `loadTerrainTextures(1)` then rejects with `failed to load terrain tile: https://wildfire.concord.org/version/v9.9.9/terrain-textures/grass.svg` before any canvas is created, and the recorded URLs are the four tiles in enum order under the public path. Mutation caught: the 3D site building its own tile URL instead of calling `vegetationTileUrl`, which the Setup-mask test cannot see. Run as a throwaway test before this was written: it passed, and failed under that mutation.

---

### Resolve the Setup panel thumbnails and river overlays

**Summary**: `getBackgroundImage` and `getRiverOverlay` return `publicUrl(...)` of the path they build today. This is the Foothills and stale-thumbnail half of the story.

**Files affected**:
- `src/components/zone-selector.tsx`: wrap both return values
- `src/components/zone-selector-art.test.ts`: one new case

**Estimated diff size**: ~20 lines

```ts
  return publicUrl(prefix + terrainStyle + panelPosition + ".png");
...
  return publicUrl(prefix + panelPosition + ".png");
```

The existing cases in `zone-selector-art.test.ts` run with no public path, so the functions still return `./terrain/...` and the shipped-file checks still mean what they say. The new case, under `usePublicPath(RELEASE_PUBLIC_PATH)`, asserts `getBackgroundImage(2, TerrainType.Foothills, 0)` is `https://wildfire.concord.org/version/v9.9.9/terrain/2-zone-hills-left.png` and `getRiverOverlay(3, 1)` is `.../terrain/3-zone-river-mid.png`. Mutation caught: dropping either wrap.

---

### Resolve the `data/` images against the public path

**Summary**: `getImageData` sets `img.src = publicUrl(imgSrc)`. It is the one place every `data/` path reaches the network, whatever set it: `config.ts` defaults, `presets.ts`, URL params, or `zonesToImageDataFile`. Config values and the logged `configSnapshot` keep their relative strings.

**Files affected**:
- `src/models/utils/image-utils.ts`: import `publicUrl`; resolve at the `src` assignment. The thrown `Cannot load image ${imgSrc}` keeps the configured string, which is what an author would search for.
- `src/models/utils/image-utils.test.ts`: new `describe("getImageData")`

**Estimated diff size**: ~40 lines

The test replaces `document.createElement("img")` with a stub (`{ src: "", complete: false, addEventListener: jest.fn() }`) through `jest.spyOn`, passing other tags through, and restores it afterward. Under `usePublicPath(RELEASE_PUBLIC_PATH)`, `getImageData("data/river-texmap.png", ...)` leaves the stub's `src` at `https://wildfire.concord.org/version/v9.9.9/data/river-texmap.png`, and `getImageData("https://other.example/x.png", ...)` leaves it unchanged. A case with no public path asserts `src` is `data/river-texmap.png`, so the stub cannot pass by always returning the resolved form. The stub approach was run as a throwaway test against the current `getImageData` and captured `src` as expected. Mutation caught: dropping `publicUrl` from the `src` assignment.

---

### Verify in a release layout (no commit)

Run before the PR, and record the result in the PR body, not in the specs:

1. `DEPLOY_PATH=version/vtest/ npx webpack --mode production --devtool false --output-path <tmp>/site/version/vtest`, then copy `<tmp>/site/version/vtest/index-top.html` to `<tmp>/site/index.html` and serve `<tmp>/site` with `python3 -m http.server`.
2. Open `/index.html?showVegetationKey=true&preset=defaultTwoZone` in Playwright. Read `performance.getEntriesByType("resource")`: every `data/`, `terrain-textures/` and `terrain/` entry is under `/version/vtest/` with status 200, and none is at the root. `window.sim.dataReady` is true; the console has no `[terrain-textures] disabled`; screenshot the textured terrain under `tmp/playwright/`.
3. Open Setup, Next: both zones draw `terrain/2-zone-hills-*.png` from `/version/vtest/` at 240x200, with the vegetation mask present. Repeat 2 and 3 with `preset=threeZoneMix` (Mountains, Foothills, Plains): the three `terrain/3-zone-*` thumbnails and river overlays also come from `/version/vtest/`.
4. Repeat 2 against `/version/vtest/index.html` (the versioned URL) and against `npm start` (the dev server).
5. `npm test` and `npm run lint`; Cypress runs in CI.

After merge, repeat step 2 against `https://models-resources.concord.org/wildfire-model/index-master.html`.

## Open Questions

### RESOLVED: Judgment call: one commit or four?
**Context**: The whole change is about 170 lines.
**Options considered**:
- A) Four commits: helper, tiles, thumbnails, `data/`.
- B) One commit.

**Decision**: A. The brief asks for small steps, each family of sites is independently reviewable and testable, and a reviewer can match each to one Jira bullet.

### RESOLVED: Judgment call: resolve `data/` in `getImageData` or in `getInputData`?
**Context**: `getInputData` is the public entry the loaders call; `getImageData` is where `src` is set.
**Options considered**:
- A) `getImageData`, at the `src` assignment.
- B) `getInputData`, before handing the string down.

**Decision**: A. It is the line that makes the request, so no future caller of `getImageData` can bypass it, and the test observes exactly the value the browser requests.

### RESOLVED: Judgment call: a shared Jest hook, or set the global inline in each test file?
**Context**: Three test files need the public path set and cleared.
**Options considered**:
- A) `usePublicPath` in `src/public-url-test-helpers.ts`, following `fire-line-interaction-test-helpers.tsx` and `rule-sets/test-helpers.ts`.
- B) `beforeEach`/`afterEach` written out in each file.

**Decision**: A. The global's name is webpack's contract and would otherwise be spelled in four files; a missed `afterEach` in one would leak the base into unrelated suites.

### RESOLVED: Is the 3D tile request covered by construction, or by its own test?
**Context**: Stage 8 found the requirement "tests fail if any call site stops resolving" named the 3D tile URL, while the plan covered it only by construction, because `rasterizeSvg` draws to a canvas jsdom lacks.
**Options considered**:
- A) Reword the requirement to accept coverage by construction plus the release-layout check.
- B) Test `loadTerrainTextures` directly.

**Decision**: B. A throwaway test showed it needs no canvas: a stubbed `Image` that fails every load makes the loader reject after recording each URL. It costs one export and about 30 lines, and it catches the 3D site bypassing `vegetationTileUrl`, which nothing else would.

## Self-Review

Roles: commit reviewer, test writer, senior engineer, operator. The whole plan was built as throwaway code, one step at a time in plan order, and each claim below was checked against it before the code was deleted. Each step linted clean (`npm run lint` reports master's 18 pre-existing warnings and no new ones), type-checked with no errors in the touched files, and passed its tests on top of the steps before it; with all four applied, the full Jest suite passed (96 suites: master's 94 plus `public-url.test.ts` and `terrain-textures.test.ts`). Removing each `publicUrl` wrap in turn (the tile URL, both thumbnail builders, `getImageData`), and replacing `new URL` with concatenation, each failed exactly the test the plan names for it.

### Test writer

#### RESOLVED: The tile-mask assertion's expected string was guessed
The plan said jsdom serializes an absolute URL in `style.maskImage` with quotes. Run against the real test, it keeps it unquoted: `url(https://wildfire.concord.org/version/v9.9.9/terrain-textures/forest.svg)`. Fixed in place with the measured strings.

### Senior Engineer

#### RESOLVED: A proposed comment claimed webpack folds the `typeof` guard
The built bundle shows the identifier replaced (no `__webpack_public_path__` left in it), not that the guard was folded to a constant. The comment now says only what was observed.

### Commit reviewer

#### RESOLVED: Diff-size estimates did not match the built steps
Measured against the throwaway build, they were too high. Fixed in place; the tile step's figure includes the 3D test added after this check.

### Self-review round 1

Roles: senior engineer, test writer, DevOps engineer, education researcher. Only the finding below survived a check against the code and a production build.

#### RESOLVED: The public path is `<build root>/assets/../`, not the build root
Webpack's `auto` runtime sets the public path to the script's folder plus `../` (seen in `AutoPublicPathRuntimeModule` and in a `DEPLOY_PATH=version/vtest/` build). The proposed comments said files sit "beside the bundle" and the test fixture claimed to match the release value while using the normalized form. Fixed in place: comments name the build root, Technical Notes give the literal value, and `RELEASE_PUBLIC_PATH` is now the unnormalized string, so the expected URLs also catch a resolver that concatenates instead of using `new URL` (checked with a throwaway Jest test).

### Self-review round 2

Roles: commit reviewer, release engineer, maintainer. Checked against the code, a throwaway lint (`npm run lint` and `lint:build` configs) and type-check of the step-1 files, and the live S3 layout.

#### RESOLVED: The release-layout check never requested Plains or Mountains thumbnails
Acceptance names all three terrain types, but `defaultTwoZone` is Foothills in both zones, so the check could not see a root-relative Plains or Mountains request. Fixed in place in requirements.md and the verify step: repeat with `preset=threeZoneMix`, which also covers the 3-zone river overlays.

#### RESOLVED: Root `data/` copies are not dead weight while a pre-fix tag can be promoted
The live root `data/river-texmap.png` returns 200, and `release.yml` can promote any tag, every one through v1.7.0 requesting `data/` from the root. Fixed in place: Technical Notes and Out of Scope say deleting them rules out rolling back to a pre-fix tag.

#### RESOLVED: The commit reviewer entry's per-step sizes contradicted the steps
It gave the tile step as 25 lines; the step says ~55 since the 3D test joined it, and the steps sum to the 170 in the commit-count question. Fixed in place by dropping the stale figures from the entry.

### Self-review round 3

Roles: build skeptic (every step built in plan order with `npm test`, `npm run lint` and `tsc` after each, plus each named mutation), spec consistency reader. All quoted code compiled and linted as written; each mutation failed only its named test.

#### RESOLVED: The suite count above predated the 3D tile test
It said 95 suites, but the plan adds two test files to master's 94 (measured: 96). Fixed in place; the test count was dropped, since it depends on how the cases are split.

#### RESOLVED: The plan pointed at a "stage-4 note" that requirements.md does not label
Fixed in place to name the end-to-end run in requirements.md's Technical Notes.
