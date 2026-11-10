# Vegetation Key textures and Setup panel images load from the release's own folder

**Jira**: https://concord-consortium.atlassian.net/browse/WM-68
**Repo**: https://github.com/concord-consortium/wildfire-model
**Implementation Spec**: [implementation.md](implementation.md)
**Status**: **In Development**

## Overview

On the released site (the top-level `index.html`), the Vegetation Key tiles, the Setup panel thumbnails and the model's `data/` images are requested from the site root instead of from the release's `version/<tag>/` folder, so they 404 or load stale 2020 copies. This change makes every runtime-built URL for a file in `src/public` resolve against the root of the release's build folder, where the JavaScript bundle's `assets/` folder also sits.

## Project Owner Overview

Since v1.6.0, students opening the released Wildfire model at https://wildfire.concord.org/index.html get a Vegetation Key switch that does nothing visible, a Setup panel with no picture for any zone set to Foothills, and old, wrongly sized pictures for the other terrain types. The versioned and branch links work, which is why this went unnoticed: the fault only appears on the one URL a release publishes.

After this fix, the released page loads the same images the versioned page does, so the Vegetation Key and the Setup panel look the way they were designed, and any future change to the model's terrain data files ships with the release instead of silently depending on old copies at the top of the site. Nothing a student does or sees changes on branch or versioned links.

## Background

A production release copies `version/<tag>/index-top.html` over the top-level `index.html` (`.github/workflows/release.yml`). `HtmlWebpackPlugin` builds `index-top.html` with `publicPath: DEPLOY_PATH`, so its `<script>` and `<link>` tags point into `version/<tag>/`. Webpack's own runtime public path is left at its default, `auto`, which derives it from the bundle's script URL (`<script folder>/../`): `version/<tag>/` for the released page. Imported assets (the hashed PNGs and SVGs) go through that runtime public path and load correctly.

Files under `src/public` are not imported. `CopyWebpackPlugin` copies them to the build root and the code builds their URLs as bare relative strings at runtime, which the browser resolves against the **page** URL. At the top level that is the site root, where only some 2020 copies exist.

Reproduced locally on master: a production build with `DEPLOY_PATH=version/vtest/`, laid out as `site/version/vtest/` with `index-top.html` copied to `site/index.html` and served statically. Loading `site/index.html?showVegetationKey=true` requested `/data/mountains-foothills-plains-heightmap.png`, `/data/river-texmap.png`, `/data/mountains-foothills-plains-islands.png` and the four `/terrain-textures/*.svg` from the root, all 404, and logged `[terrain-textures] disabled: Error: failed to load terrain tile: terrain-textures/grass.svg`. With no root copies of `data/`, the model never finished loading (see Technical Notes). The same layout exists live today: `https://models-resources.concord.org/wildfire-model/index-master.html` (the top-branch copy of master's `index-top.html`) returns 200, and `wildfire-model/terrain-textures/grass.svg` beside it returns 404.

The runtime-built URLs, which is the full inventory (every other image in `src` is imported):

| Site | Files | Used by |
| --- | --- | --- |
| `TILE_DIR` in `src/components/view-3d/terrain-textures.ts` | `terrain-textures/*.svg` (4) | `rasterizeSvg` for the 3D texture; the Setup panel's `mask-image` in `zone-selector.tsx` |
| `getBackgroundImage`, `getRiverOverlay` in `src/components/zone-selector.tsx` | `terrain/*.png` (20) | Setup panel thumbnails and river overlays |
| `getImageData` in `src/models/utils/image-utils.ts` | `data/*.png` (28) | zone index, heightmap, unburnt islands and river data, whose paths come from `config.ts` defaults, `presets.ts`, URL params, and `zonesToImageDataFile` in `data-loaders.ts` |

## Requirements

- **Every runtime-built URL for a file in `src/public` resolves against webpack's runtime public path**, not the page URL. That covers the four vegetation tiles (both the 3D rasterization and the Setup panel mask), the 20 Setup thumbnails and river overlays, and every `data/` image loaded through `getImageData`.
- **A value that is already absolute is requested unchanged.** A URL with a scheme (`https:`, `data:`, `blob:`), a protocol-relative URL and a root-relative path (`/foo.png`) resolve exactly as they do today. This matters for `zoneIndex`, `elevation`, `unburntIslands` and `riverData`, which config, presets and URL params can set.
- **A relative value from config, a preset or a URL param resolves against the public path too**, the same as a built-in default. A relative path means "a file shipped with this build"; there is no other folder it could sensibly name.
- **The stored strings do not change.** Config values, the `configSnapshot` logged with `SimulationStarted`, and saved interactive state keep the relative strings they hold today (e.g. `data/complexZones.png`); resolution happens only where the request is made. Research logs therefore stay comparable across versions and deploy paths.
- **Where no runtime public path exists** (Jest), a path is returned unchanged, so existing tests that pin `url(terrain-textures/forest.svg)` and the shipped-file checks in `zone-selector-art.test.ts` keep their meaning.
- **Branch, versioned and dev-server URLs request the same files they do today.** In all three the page sits beside its build, so the public path and the page folder agree.
- **One function builds the vegetation tile URL**, used by both the 3D texture and the Setup panel mask, so the two cannot resolve tiles differently. The directory and the file-name map stop being exported once nothing outside the module reads them.
- **Tiles stay static files.** WM-48's authoring contract, that an artist edits a tile in `src/public/terrain-textures/` and reloads with no rebuild and no import to update, still holds.
- **Tests fail if any call site stops resolving.** With a public path set in the test, the vegetation tile URL (3D and Setup), each Setup thumbnail and river overlay, and each `data/` request carry it; an absolute input is left alone.
- **Prose that describes the old contract is updated**: the `TILE_DIR` comment in `terrain-textures.ts` ("The path is relative so it resolves correctly under a branch deploy path") and any test header that describes these paths as page-relative.

### Acceptance (from Jira, verified as below)

- From the top-level `index.html` of a release build, all tile, `terrain/` and `data/` requests go to the release's version path, with no 404s.
- Turning on the Vegetation Key textures the 3D terrain, and the Setup panel shows its tiles.
- The Setup panel shows the current thumbnails for all three terrain types, including Foothills.
- Branch and versioned URLs continue to work.

**Before merge**, these are checked against a local release-shaped layout: a production build with `DEPLOY_PATH=version/<tag>/` placed under `site/version/<tag>/`, its `index-top.html` copied to `site/index.html`, served statically, with the browser's request list (not only the 404 count) showing every tile, `terrain/` and `data/` request under `version/<tag>/`. The layout has no root copies at all, so a request that still goes to the root fails loudly instead of loading a stale file. The 3D texture is confirmed by the console carrying no `[terrain-textures] disabled` line once the Vegetation Key is on, plus a screenshot of the textured terrain; the Setup panel by opening it with the key on and a Foothills zone selected, then again with `preset=threeZoneMix`, whose zones are Mountains, Foothills and Plains, so every terrain type's thumbnail and the 3-zone river overlays are requested. The versioned `site/version/<tag>/index.html` is checked in the same session. **After merge**, the same request check runs against `https://models-resources.concord.org/wildfire-model/index-master.html`, the top-level copy of master's build that the deploy action already publishes.

## Technical Notes

- **The runtime public path is `__webpack_public_path__`.** In the production bundle, `output.publicPath` is unset, so webpack 5 uses `auto`; the emitted runtime reads `document.currentScript.src` (confirmed in the built bundle). The bundle sits at `assets/index.[contenthash].js`, so the runtime sets the public path to the script's folder plus `../`: the literal value on the released page is `https://wildfire.concord.org/version/<tag>/assets/../` (confirmed in the built bundle), which `new URL` normalizes to the build root. It is an absolute URL, so `new URL(path, publicPath)` gives an absolute request URL and leaves absolute inputs alone.
- **The project has no `@types/webpack-env`**, so `__webpack_public_path__` needs an ambient declaration; a module-local `declare let` in the one file that reads it type-checks and lints clean. Under Jest the identifier is not defined, so the read is guarded with `typeof`. Assigning `globalThis.__webpack_public_path__` in a Jest test makes the guarded read see it, which is what lets call-site tests set a public path (checked with a throwaway test).
- **Why resolve at the request, not in config.** `bottom-bar.tsx` logs `config.elevation`, `config.unburntIslands` and `config.zoneIndex` as strings in the `SimulationStarted` snapshot, and `saved-state.ts` compares `simulation.zoneIndex === simulation.config.zoneIndex` by identity for `presetZoneMap`. Rewriting the config values would put the deploy URL into research logs and change what those comparisons see.
- **A failed `data/` load hangs the model.** `getImageData` throws from the image's `error` listener, so the `getInputData` promise never settles and `Promise.all` in `simulation.ts` never resolves. Production has been spared only because the root copies of `data/` match v1.7.0. Making the failure recoverable is not in this story; removing the dependency on the root copies is.
- **The approach was run end to end before this spec was finished** (throwaway code, since deleted): a helper resolving through `new URL(path, __webpack_public_path__)`, applied at the three request sites, built with `DEPLOY_PATH=version/vtest/` into the release layout above. From the top-level page every `data/`, `terrain-textures/` and `terrain/` request went to `/version/vtest/...` with 200, none to the root, `dataReady` became true, no `[terrain-textures] disabled` line was logged, and the `defaultTwoZone` Setup panel drew `2-zone-hills-left.png` at 240x200. The versioned `version/vtest/index.html` and the dev server (`webpack serve`, which Cypress uses) requested the same files they do today. Webpack replaced the identifier in the bundle, and the existing Jest suites for `src/components` and `src/models/utils` (270 tests) passed unchanged.
- **A cross-origin absolute `data/` URL already fails, and still will.** `getImageData` reads the canvas back, and an image from another origin without CORS taints it (`SecurityError` on `getImageData`, seen when `riverData` named another host). The URL is requested unchanged, as required; whether it can be read is outside this story.
- **Top-level stale copies stay on S3.** Once the released page carries this fix, nothing current requests the 2020 `terrain/` files or the root `data/` copies. Removing them is an S3 operation, not a code change, and it has a cost: `release.yml` can promote any tag, and every tag up to v1.7.0 still requests `data/` from the root, so without those copies a rollback to a pre-fix tag hangs the model on load.

## Out of Scope

- **The favicon.** `src/index.html` hardcodes `<link rel="shortcut icon" href="favicon.ico">`, which is why the top-level `favicon.ico` request resolves to the 2020 copy. `HtmlWebpackPlugin` also injects `<link rel="icon" href="version/<tag>/favicon.ico">`. The story's acceptance criteria name tile, `terrain/` and `data/` requests only.
- Making a failed `data/` image load fail visibly instead of hanging the model.
- Deleting the stale top-level files from S3 (which would also rule out rolling back to a pre-fix tag; see Technical Notes), and releasing 1.8.0 so production picks up the fix.
- Changing the deploy workflow, `output.publicPath`, or how `index-top.html` is built.

## Open Questions

### RESOLVED: Judgment call: resolve at the request site, or rewrite the paths where they are defined?
**Context**: The `data/` paths are defined in `config.ts`, `presets.ts` and `data-loaders.ts`, and can arrive from URL params.
**Options considered**:
- A) Resolve where the request is made (`getImageData`, `rasterizeSvg`, the Setup panel's style URLs).
- B) Prefix the defaults and presets with the public path where they are defined.

**Decision**: A. B would also need URL-param values handled, puts deploy URLs into the logged `configSnapshot` and saved state, and leaves any future path site to remember the prefix. A covers every source at three request sites.

### RESOLVED: Judgment call: does a relative path from a URL param resolve against the build or the page?
**Context**: `?elevation=data/foo.png` could mean a file in this build or a file beside the page.
**Options considered**:
- A) Against the build, like every built-in default.
- B) Against the page, as today.

**Decision**: A. On every deploy except the released page the two are the same folder, and on the released page the page folder holds only stale copies. Absolute URLs remain the way to point elsewhere.

### RESOLVED: Should the tile URL be built in one place?
**Context**: Stage 8 found the plan's `vegetationTileUrl` refactor had no requirement behind it. Today the 3D loader and the Setup panel each concatenate `TILE_DIR` and the file name themselves.
**Options considered**:
- A) Write it in as a requirement.
- B) Drop the refactor and wrap each call site separately.

**Decision**: A. Two copies of the same URL construction is the duplication the project's reviewers flag, and B would leave two places to remember the public path. It also gives the 3D request test a single function to target.

### RESOLVED: Judgment call: include the favicon?
**Context**: The Jira evidence table lists the top-level `favicon.ico` as stale, and the fix is deleting one template line.
**Options considered**:
- A) Leave it out; the acceptance criteria name tile, `terrain/` and `data/` requests only.
- B) Fold it in.

**Decision**: A. WM-68 has no story points and the brief keeps scope to its acceptance criteria. It is recorded under Out of Scope with its cause so a follow-up can pick it up.

## Self-Review

Roles: Senior Engineer, QA Engineer, DevOps Engineer, Education Researcher. Findings were kept only where a check against the code or the running build confirmed them.

### QA Engineer

#### RESOLVED: The release-layout check did not say how the 3D texture is confirmed
The acceptance criterion "Turning on the Vegetation Key textures the 3D terrain" had no observable named, and a request list alone does not show the texture applied. The local repro showed the failure is observable: `useTerrainTextures` logs `[terrain-textures] disabled: ...` when any tile fails. Fixed in place: the verification paragraph now names the absent console line plus a screenshot, and the Setup panel check names a Foothills zone with the key on.
