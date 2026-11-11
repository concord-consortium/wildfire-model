# Vegetation Key textures and Setup panel images load from the release's own folder

**Jira**: https://concord-consortium.atlassian.net/browse/WM-68

**Status**: **Closed**

## Overview

On the released site (the top-level `index.html`), the Vegetation Key tiles, the Setup panel thumbnails and the model's `data/` images were requested from the site root instead of from the release's `version/<tag>/` folder, so they 404'd or loaded stale 2020 copies. This change makes every runtime-built URL for a file in `src/public` resolve against the root of the release's build folder, where the JavaScript bundle's `assets/` folder also sits.

Students opening https://wildfire.concord.org/index.html since v1.6.0 saw a Vegetation Key switch that did nothing visible, no Setup picture for Foothills zones, and old, wrongly sized pictures for the other terrain types. Versioned and branch links were unaffected, which is why it went unnoticed.

## Requirements

- **Every runtime-built URL for a file in `src/public` resolves against webpack's runtime public path**, not the page URL: the four vegetation tiles (3D rasterization and Setup panel mask), the 20 Setup thumbnails and river overlays, and every `data/` image loaded through `getImageData`.
- **A value that is already absolute is requested unchanged**: a URL with a scheme (`https:`, `data:`, `blob:`), a protocol-relative URL, and a root-relative path (`/foo.png`). This matters for `zoneIndex`, `elevation`, `unburntIslands` and `riverData`, which config, presets and URL params can set.
- **A relative value from config, a preset or a URL param resolves against the public path too**, the same as a built-in default.
- **The stored strings do not change.** Config values, the `configSnapshot` logged with `SimulationStarted`, and saved interactive state keep their relative strings; resolution happens only where the request is made, so research logs stay comparable across versions and deploy paths.
- **Where no runtime public path exists** (Jest), a path is returned unchanged.
- **Branch, versioned and dev-server URLs request the same files they did before.**
- **One function builds the vegetation tile URL** (`vegetationTileUrl`), used by both the 3D texture and the Setup panel mask. `TILE_DIR` and `VEGETATION_TILE_FILES` are no longer exported.
- **Tiles stay static files**: an artist edits a tile in `src/public/terrain-textures/` and reloads, with no rebuild and no import to update.
- **Tests fail if any call site stops resolving**, and an absolute input is left alone.
- **Prose that described the old contract is updated** (the `TILE_DIR` comment in `terrain-textures.ts`).

### Acceptance

- From the top-level `index.html` of a release build, all tile, `terrain/` and `data/` requests go to the release's version path, with no 404s.
- Turning on the Vegetation Key textures the 3D terrain, and the Setup panel shows its tiles.
- The Setup panel shows the current thumbnails for all three terrain types, including Foothills.
- Branch and versioned URLs continue to work.

Checked before merge in a local release-shaped layout (a production build with `DEPLOY_PATH=version/<tag>/`, its `index-top.html` copied above it, no root copies of anything), by the browser's request list, the absence of a `[terrain-textures] disabled` console line, a screenshot of the textured terrain, and the Setup panel with `defaultTwoZone` (Foothills) and `threeZoneMix` (Mountains, Foothills, Plains). *(After merge, the same request check runs against `https://models-resources.concord.org/wildfire-model/index-master.html`, the top-level copy of master's build.)*

## Technical Notes

- **Why the released page differed.** A release copies `version/<tag>/index-top.html` over the top-level `index.html`. `HtmlWebpackPlugin`'s `publicPath: DEPLOY_PATH` fixes only the script and link tags. Files in `src/public` are not imported: `CopyWebpackPlugin` copies them to the build root and the code built their URLs as bare relative strings, which resolve against the page.
- **The runtime public path is `__webpack_public_path__`.** `output.publicPath` is unset, so webpack 5 uses `auto` and derives it from the bundle's script URL. The bundle sits at `assets/index.[contenthash].js`, so the literal value on the released page is `https://wildfire.concord.org/version/<tag>/assets/../`, which `new URL` normalizes to the build root.
- **`src/public-url.ts`** declares the identifier locally (the project has no `@types/webpack-env`) and guards the read with `typeof`, because Jest does not define it. `publicUrl(path, base = getPublicPath())` returns `new URL(path, base).href`, or the path unchanged when there is no base. Tests set the global through `usePublicPath` in `src/public-url-test-helpers.ts`.
- **Why resolve at the request, not in config.** `bottom-bar.tsx` logs `config.elevation`, `config.unburntIslands` and `config.zoneIndex` as strings, and `saved-state.ts` compares `simulation.zoneIndex === simulation.config.zoneIndex` by identity. Rewriting config would put deploy URLs into research logs and change those comparisons.
- **A failed `data/` load hangs the model.** `getImageData` throws from the image's `error` listener, so the `getInputData` promise never settles.
- **A cross-origin absolute `data/` URL already fails, and still will**: reading back a canvas tainted by a non-CORS image throws `SecurityError`.
- **Top-level stale copies stay on S3.** `release.yml` can promote any tag, and every tag through v1.7.0 requests `data/` from the root, so deleting the root copies rules out rolling back to a pre-fix tag.

## Out of Scope

- **The favicon.** `src/index.html` hardcodes `<link rel="shortcut icon" href="favicon.ico">`, so the top-level `favicon.ico` request resolves to the 2020 copy.
- Making a failed `data/` image load fail visibly instead of hanging the model.
- Deleting the stale top-level files from S3, and releasing 1.8.0 so production picks up the fix.
- Changing the deploy workflow, `output.publicPath`, or how `index-top.html` is built.

## Decisions

### Resolve at the request site, or rewrite the paths where they are defined?
**Context**: The `data/` paths are defined in `config.ts`, `presets.ts` and `data-loaders.ts`, and can arrive from URL params.
**Options considered**:
- A) Resolve where the request is made (`getImageData`, the tile loader, the Setup panel's style URLs).
- B) Prefix the defaults and presets with the public path where they are defined.

**Decision**: A. B would also need URL-param values handled, puts deploy URLs into the logged `configSnapshot` and saved state, and leaves any future path site to remember the prefix.

---

### Does a relative path from a URL param resolve against the build or the page?
**Context**: `?elevation=data/foo.png` could mean a file in this build or a file beside the page.
**Options considered**:
- A) Against the build, like every built-in default.
- B) Against the page.

**Decision**: A. On every deploy except the released page the two are the same folder, and on the released page the page folder holds only stale copies. Absolute URLs remain the way to point elsewhere.

---

### Should the tile URL be built in one place?
**Context**: The 3D loader and the Setup panel each concatenated `TILE_DIR` and the file name themselves.
**Options considered**:
- A) One `vegetationTileUrl`, written in as a requirement.
- B) Wrap each call site separately.

**Decision**: A. Two copies of the same URL construction leave two places to remember the public path, and one function gives the 3D request test a single target.

---

### Include the favicon?
**Context**: The top-level `favicon.ico` is also stale, and the fix is one template line.
**Options considered**:
- A) Leave it out.
- B) Fold it in.

**Decision**: A. The acceptance criteria name tile, `terrain/` and `data/` requests only. It is recorded under Out of Scope with its cause.

---

### How is the 3D texture confirmed in the release-layout check?
**Context**: A request list alone does not show the texture applied.
**Options considered**:
- A) Request list only.
- B) Request list plus the absent `[terrain-textures] disabled` console line and a screenshot.

**Decision**: B. `useTerrainTextures` logs that line whenever a tile fails, so its absence is observable.

---

### Which presets does the release-layout check use?
**Context**: `defaultTwoZone` is Foothills in both zones, so it cannot show a Plains or Mountains thumbnail still loading from the root.
**Options considered**:
- A) `defaultTwoZone` only.
- B) `defaultTwoZone`, then `threeZoneMix` (Mountains, Foothills, Plains).

**Decision**: B. It covers every terrain type's thumbnail and the 3-zone river overlays.

---

### One commit or four?
**Context**: The whole change is about 170 lines.
**Options considered**:
- A) Four: the resolver, tiles, thumbnails, `data/`.
- B) One.

**Decision**: A. Each family of request sites is independently reviewable and testable, and maps to one part of the story.

---

### Resolve `data/` in `getImageData` or in `getInputData`?
**Context**: `getInputData` is the entry the loaders call; `getImageData` sets `src`.
**Options considered**:
- A) `getImageData`, at the `src` assignment.
- B) `getInputData`, before handing the string down.

**Decision**: A. It is the line that makes the request, so no future caller can bypass it, and the test observes exactly what the browser requests. The load error still names the configured path, which is what an author would search for.

---

### A shared Jest hook, or set the global inline in each test file?
**Context**: Several test files need the public path set and cleared.
**Options considered**:
- A) `usePublicPath` in `src/public-url-test-helpers.ts`.
- B) `beforeEach`/`afterEach` written out in each file.

**Decision**: A. The global's name is webpack's contract and would otherwise be spelled in several files, and a missed `afterEach` would leak the base into unrelated suites.

---

### Is the 3D tile request covered by construction, or by its own test?
**Context**: `rasterizeSvg` draws to a canvas that jsdom lacks.
**Options considered**:
- A) Accept coverage by construction plus the release-layout check.
- B) Test `loadTerrainTextures` directly.

**Decision**: B. A stubbed `Image` that fails every load makes the loader reject after recording each URL, with no canvas. It costs one export and catches the 3D site bypassing `vegetationTileUrl`, which nothing else would.

---

### What value does the test fixture use for the release public path?
**Context**: Webpack's `auto` runtime sets the public path to the script's folder plus `../`, not the normalized build root.
**Options considered**:
- A) The normalized `.../version/<tag>/`.
- B) The literal `.../version/<tag>/assets/../`.

**Decision**: B. `RELEASE_PUBLIC_PATH` matches what the bundle sees, so the expected URLs also catch a resolver that concatenates strings instead of using `new URL`.

---

### Should the root `data/` copies be called dead weight?
**Context**: After the fix, nothing current requests the root copies.
**Options considered**:
- A) Describe them as removable.
- B) Note that they are still needed while a pre-fix tag can be promoted.

**Decision**: B. Every tag through v1.7.0 requests `data/` from the root, so deleting the copies rules out rolling back to one.
