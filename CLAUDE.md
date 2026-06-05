# CLAUDE.md

Project-specific notes for working in this repo. Conventions, gotchas, and tools that aren't obvious from reading code.

## Project layout

- [src/](src/) — application source (React + MobX + Three.js via react-three-fiber)
- [src/hazbot/](src/hazbot/) — analysis engine that classifies user behavior into pedagogical categories (the "Hazbot")
- [src/hazbot/rule-sets/](src/hazbot/rule-sets/) — numbered TypeScript files (`23.ts`, `24.ts`, ...). Each defines factor variables + categories for one ruleset
- [src/hazbot/engine/sidebar/](src/hazbot/engine/sidebar/) — dev sidebar that surfaces factor variables and category state in the running app
- [docs/hazbot-validation/](docs/hazbot-validation/) — **auto-generated** validation playbooks (`23.md`, `24.md`, ...). Regenerate via `node scripts/generate-hazbot-validation-playbook.js`. Don't hand-edit
- [scripts/](scripts/) — playbook generator and impl extraction
- [specs/](specs/) — work-in-progress feature specs
- [cypress/](cypress/) — existing Cypress test suite (separate from Playwright MCP usage below)

## Common commands

| Task | Command |
|------|---------|
| Dev server | `npm start` (serves on `http://localhost:8080`) |
| Unit tests | `npm test` (Jest) |
| Lint | `npm run lint` |
| Build | `npm run build` |
| Regenerate validation playbook | `node scripts/generate-hazbot-validation-playbook.js` |
| Regenerate replay fixture | `node scripts/generate-replay-fixture.js` |

## Playwright MCP testing

When validating Hazbot rulesets interactively (e.g. walking a playbook in `docs/hazbot-validation/`), use the Playwright MCP browser against a running dev server. A few things make this much smoother:

### Useful URL params

The app reads config from the query string. For Hazbot validation runs, combine these:

| Param | Purpose |
|-------|---------|
| `hazbotRules=23` | Load ruleset 23 (or whichever number) |
| `hazbotSidebar=true` | Show the dev sidebar with factor variables + category indicators (✓ active, ✗ inactive) |
| `preset=plainsTwoZone` | Pick a preset from [src/presets.ts](src/presets.ts) — `plainsTwoZone`, `mountainsandplainsTwoZone`, `hillTwoZone`, `hillThreeZone`, etc. |
| `helitackAvailable=false` | Disable helitack tool |
| `fireLineAvailable=false` | Disable fire-line tool |
| `severeDroughtAvailable=false` | Cap drought slider at Medium |
| `showBurnIndex=false` | Hide burn-index UI |
| `forestWithSuppressionAvailable=false` | Disable forest-with-suppression option |
| `tpiDebug=true` | Paint each placed spark's TPI bands onto the terrain (warm = ridge / +TPI, cool = valley / −TPI). Used to validate `SparksAtTopAndBottom` (ruleset 25) |
| `tpiBands=[3,8,15]` | Concentric band radii (cells) for the multi-scale TPI; array length = N bands |
| `tpiMarginFraction=0.02` | Fraction of `heightmapMaxElevation` a spark's mean TPI must clear to count as top/bottom (default 0.02 ≈ 400 ft) |
| `bottomBarBaseline=true` | Overlay a 1px red line across the viewport at the bottom-bar icon-label baseline (alignment aid for bottom-bar work) |

A full URL for ruleset 23 validation:
```
http://localhost:8080/?hazbotRules=23&hazbotSidebar=true&preset=plainsTwoZone&helitackAvailable=false&fireLineAvailable=false&severeDroughtAvailable=false&showBurnIndex=false&forestWithSuppressionAvailable=false
```

### Reading state from the sidebar

The sidebar shows the live category state and factor variables. To verify which category is active:
- `▸ ✓ N: ...` — category N matches current state (active)
- `▸ ✗ N: ...` — category N doesn't match
- The **Factor Variables** panel at the bottom shows live values (`ranSimulation`, `setDroughtLevel`, `usedOneSparkPerZone`, etc.)
- The **Readings** panel lists `SimulationStarted` / `SimulationEnded` events in reverse chronological order

After each interaction, use `browser_snapshot` targeted at the sidebar region to confirm the expected category flipped.

### Placing sparks/fire lines/helitacks via `window.test`

The 3D map uses Three.js raycasting for clicks, so synthetic DOM `PointerEvent` dispatches don't work (they crash `OrbitControls` with a `releasePointerCapture` error). A default `browser_click` on the canvas always lands at its visual center, which is on the zone-0/zone-1 boundary — not useful for per-zone placement.

Use the test helpers exposed on `window.test` instead. Defined in [src/models/stores.ts](src/models/stores.ts):

```js
window.test.placeSparkInZone(0)      // spark at zone 0 center
window.test.placeSparkInZone(1)      // spark at zone 1 center
window.test.placeFireLineInZone(0)   // two markers spanning zone 0 width (forms a line at zone center)
window.test.placeHelitackInZone(1)   // helitack drop at zone 1 center
window.test.zoneBounds(0)            // { minX, maxX, minY, maxY, centerX, centerY } in model ft
```

These compute zone extents from `simulation.cells[].zoneIdx`, so they work across any preset (2-zone, 3-zone, custom `zoneIndex`).

Call them via `browser_evaluate`:
```js
() => {
  window.test.placeSparkInZone(0);
  window.test.placeSparkInZone(1);
}
```

For everything else (terrain setup dialog, drought sliders, Start/Restart buttons), normal `browser_click` on labeled elements works fine — `getByText('Medium Drought')`, `getByTestId('start-button')`, etc.

### Ruleset 25 (`SparksAtTopAndBottom`) validated spark coordinates

For the ruleset-25 Cat 4 → 6 walk on `mountainTwoZoneFixedTerrain`, the success
endpoint (Cat 6) needs one spark on a **ridge** (mean multi-scale TPI at least the
margin *above* its surroundings) and one in a **valley** (mean TPI at least the
margin *below*). The margin is `tpiMarginFraction × heightmapMaxElevation`
(default `0.02 × 20000` = 400 ft); see the `SparksAtTopAndBottom` TPI logic in
[src/hazbot/wildfire/sim-props.ts](src/hazbot/wildfire/sim-props.ts). `placeSparkInZone`
places at the *zone center*, whose local TPI is not guaranteed to clear the margin,
so use these documented coordinates instead (validated live against the running app,
2026-06-03; they are specific to this preset's heightmap — re-derive if it changes).
Zone 1 is the high zone, zone 0 the low zone, so the robust direction is
**top → zone 1, bottom → zone 0**:

```js
() => {
  window.sim.addSpark(119000, 38000); // top → zone 1, ridge (mean TPI well above margin)
  window.sim.addSpark(59000, 3500);   // bottom → zone 0, valley (mean TPI well below margin)
}
```

`addSpark` no-ops once both zones hold a spark, so to switch between the Cat 4
(mid-slope `placeSparkInZone(0/1)`) and Cat 6 endpoints you must **Reload** (not
Restart) to clear sparks, then re-dismiss the Terrain Setup wizard. Read the engine's
**matched** category from the sidebar's `.hazbot-sidebar-category-matched` row — not
the `▸ ✓ N` truth icon, which reflects per-category truth, not the matched floor. The
flat-terrain check (`plainsTwoZone`) uses ordinary `placeSparkInZone(0/1)` and stays
capped at Cat 4 regardless of placement.

### Other debug hooks (`window.sim`, etc.)

Also exposed in [src/models/stores.ts](src/models/stores.ts):
- `window.sim` — the `SimulationModel` instance. Has `addSpark(x, y)`, `addFireLineMarker`, `setHelitackPoint`, `setWindDirection`, `sparks`, `cells`, `config`, `zones`, etc. All coords in **model feet** (e.g. `plainsTwoZone` is 120000 × 80000 ft)
- `window.DroughtLevel`, `window.Vegetation`, `window.TerrainType` — enum values for `sim.load(...)`

### Restart vs Reload behavior (important)

- **Restart** stops the running sim and returns to the pre-Start state. **Sparks stay placed**, terrain settings stay set. Factor variables (e.g. `setVegetation`) persist across runs by design — they track *user history*, not current state
- **Reload** is a full reset: returns spark count to the preset default, clears terrain customizations, forces user back through Terrain Setup before Spark/Start re-enable

When testing categories that require fresh spark placement (e.g. Category 4 → Category 5), use Reload, not Restart.

### Things that will trip you up

- **Don't dispatch synthetic `PointerEvent`s to the Three.js canvas.** It crashes `OrbitControls` (`releasePointerCapture: No active pointer`), surfaces a full-page error overlay, and blocks further interaction. Page reload is the only recovery. Use `window.test.*` for map interactions instead
- **The runtime error overlay** (red panel) intercepts all clicks until dismissed. If interactions stop working, screenshot first to check for it
- **Spark count of `2` with a disabled Spark button** typically means you're inside the Terrain Setup dialog. Walk through Next → Create to exit and re-enable Spark
- **Canvas `browser_click` lands at center**, which for two-zone presets sits on the zone-0/zone-1 boundary. Don't expect it to consistently land in a specific zone — use `window.test.placeSparkInZone(zoneIdx)`
- **Factor variables don't reset on page reload either** if you have hot-reload state preserved — fully navigate to the URL again to start clean
- **Trivial-input rejection**: some rulesets (e.g. 23) fail closed on degenerate setups (single zone, single spark). If a category that "should" fire doesn't, check the ruleset for a guard

### Screenshot artifacts

Save Playwright screenshots under `tmp/playwright/` — this folder is gitignored. Avoid writing PNGs to the project root.

```js
browser_take_screenshot({ filename: 'tmp/playwright/<descriptive-name>.png' })
```

## Hazbot rulesets

Each ruleset under [src/hazbot/rule-sets/](src/hazbot/rule-sets/) defines:
- **Factor variables**: predicates over recorded events (`ranSimulation`, `setDroughtLevel`, `usedOneSparkPerZone`, ...). Computed by the engine from the `Readings` event log
- **Categories**: boolean expressions over factor variables that classify user behavior. The first category whose expression evaluates true (in priority order) is the "active" one

Workflow for changing a ruleset:
1. Edit the rule-set file (e.g. `src/hazbot/rule-sets/23.ts`)
2. Run `node scripts/generate-hazbot-validation-playbook.js` to regenerate `docs/hazbot-validation/23.md`
3. Validate by walking the playbook against a running dev server (Playwright MCP)
4. Update any spec under `specs/` if requirements changed

See [docs/hazbot-update-workflow.md](docs/hazbot-update-workflow.md) for the full process.
