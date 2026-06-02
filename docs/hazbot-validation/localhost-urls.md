# Hazbot Validation — Localhost Test URLs

Per-ruleset localhost URLs derived from the **Wildfire Risks & Impacts Module (ISLAND Project)** LARA sequence. Use these to run the dev app against the same preset/params students see in production, with the Hazbot sidebar enabled for verifying ruleset behavior.

**Convention:** Tab ID = `<activity><page>` (e.g. activity 2 page 3 → tab `23`).

**Each URL appends:** `hazbotRules=<id>&hazbotSidebar=true` to the LARA-published params.

Source: `tmp/sequence.json` (LARA sequence export). Regenerate by re-exporting the sequence and re-running the URL extraction logic.

## Loadable rulesets

These rulesets have defined categories/expressions in [src/hazbot/rule-sets/](../../src/hazbot/rule-sets/) and a validation playbook in this directory.

| Tab | Activity | Page | Preset | Validation Doc | Test URL |
|-----|----------|------|--------|----------------|----------|
| 23 | 2 | 3 | plainsTwoZone | [23.md](23.md) | http://localhost:8080/?preset=plainsTwoZone&helitackAvailable=false&fireLineAvailable=false&severeDroughtAvailable=false&showBurnIndex=false&forestWithSuppressionAvailable=false&hazbotRules=23&hazbotSidebar=true |
| 24 | 2 | 4 | plainsTwoZone | [24.md](24.md) | http://localhost:8080/?preset=plainsTwoZone&helitackAvailable=false&fireLineAvailable=false&showBurnIndex=false&severeDroughtAvailable=false&forestWithSuppressionAvailable=false&hazbotRules=24&hazbotSidebar=true |
| 25 | 2 | 5 | mountainTwoZone | [25.md](25.md) | http://localhost:8080/?preset=mountainTwoZone&helitackAvailable=false&fireLineAvailable=false&showBurnIndex=false&severeDroughtAvailable=false&forestWithSuppressionAvailable=false&hazbotRules=25&hazbotSidebar=true |
| 32 | 3 | 2 | threeGreenZonePlains | [32.md](32.md) | http://localhost:8080/?preset=threeGreenZonePlains&helitackAvailable=false&fireLineAvailable=false&showBurnIndex=false&severeDroughtAvailable=false&hazbotRules=32&hazbotSidebar=true |
| 33 | 3 | 3 | mountainTwoZone | [33.md](33.md) | http://localhost:8080/?preset=mountainTwoZone&helitackAvailable=false&fireLineAvailable=false&showBurnIndex=false&severeDroughtAvailable=false&hazbotRules=33&hazbotSidebar=true |
| 34 | 3 | 4 | shrubThreeZone | [34.md](34.md) | http://localhost:8080/?preset=shrubThreeZone&helitackAvailable=false&fireLineAvailable=false&showBurnIndex=true&severeDroughtAvailable=false&hazbotRules=34&hazbotSidebar=true |
| 35 | 3 | 5 | mountainTwoZone | [35.md](35.md) | http://localhost:8080/?preset=mountainTwoZone&helitackAvailable=false&fireLineAvailable=false&showBurnIndex=true&severeDroughtAvailable=false&hazbotRules=35&hazbotSidebar=true |
| 42 | 4 | 2 | defaultTwoZone | [42.md](42.md) | http://localhost:8080/?preset=defaultTwoZone&windSpeed=2&windDirection=270.5&helitackAvailable=false&fireLineAvailable=false&severeDroughtAvailable=false&showBurnIndex=false&hazbotRules=42&hazbotSidebar=true |
| 45 | 4 | 5 | townsThreeZone | [45.md](45.md) | http://localhost:8080/?preset=townsThreeZone&windSpeed=4&windDirection=100&sparks=[[50000,40000],[50000,40000],[50000,40000]]&severeDroughtAvailable=false&showBurnIndex=false&hazbotRules=45&hazbotSidebar=true |
| 47 | 4 | 7 | dryTownsThreeZone | [47.md](47.md) | http://localhost:8080/?preset=dryTownsThreeZone&sparks=[[35000,31000],[35000,31000],[35000,31000]]&windSpeed=6&windDirection=265&severeDroughtAvailable=false&hazbotRules=47&hazbotSidebar=true |
| 54 | 5 | 4 | fiveTownsThreeZone | [54.md](54.md) | http://localhost:8080/?preset=fiveTownsThreeZone&severeDroughtAvailable&windSpeed=2&windDirection=165&showBurnIndex=true&hazbotRules=54&hazbotSidebar=true |

## Placeholder tabs

(none — all 11 rule-set tabs are extracted as of WM-18; `EXCLUDED_TABS` in
[scripts/extract-impl.js](../../scripts/extract-impl.js) is empty.)

## Notes

- LARA pages with no wildfire embeddable (intro/assessment-only pages) don't appear here. The activities also contain non-wildfire pages — only embeddable URLs pointing at `https://wildfire.concord.org/index.html` are listed.
- The `preset` param maps to entries in [src/presets.ts](../../src/presets.ts).
- For Playwright validation methodology, see the **Playwright MCP testing** section in [../../CLAUDE.md](../../CLAUDE.md).

## Regenerating this doc

When the LARA sequence changes (new activity, edited preset/params, added wildfire embeddable), re-export and re-extract:

1. **Export the sequence from LARA.** Download the published sequence JSON and save it to `tmp/sequence.json` (gitignored).
2. **Run the extraction script below** — it prints markdown table rows for both tables. Paste the output into the appropriate sections above and update any links.

```bash
node -e '
const fs = require("fs");
const seq = JSON.parse(fs.readFileSync("tmp/sequence.json", "utf8"));

// Walk the sequence tree collecting every wildfire URL with its (activity, page).
const findUrls = (val) => {
  if (typeof val === "string") {
    return val.match(/https:\/\/wildfire\.concord\.org\/index\.html\?[^"\s<>]*/g) || [];
  }
  if (Array.isArray(val)) return val.flatMap(findUrls);
  if (val && typeof val === "object") return Object.values(val).flatMap(findUrls);
  return [];
};

const rows = [];
seq.activities.forEach((act, ai) => {
  act.pages?.forEach((page, pi) => {
    findUrls(page).forEach(url => {
      const params = url.split("?")[1].trim();
      const preset = (params.match(/preset=([^&]+)/) || [])[1] || "";
      const tabId = `${ai + 1}${pi + 1}`;
      rows.push({ activity: ai + 1, page: pi + 1, tabId, preset, params });
    });
  });
});

// Loadable rulesets have a defined rule-set module + playbook. Placeholders
// do not. As of WM-18, no tabs are excluded — leave the set empty unless a
// future workbook revision introduces empty/TBD tabs.
const EXCLUDED = new Set([]);
const loadable = rows.filter(r => !EXCLUDED.has(r.tabId));
const placeholders = rows.filter(r => EXCLUDED.has(r.tabId));

const renderLoadable = r =>
  `| ${r.tabId} | ${r.activity} | ${r.page} | ${r.preset} | [${r.tabId}.md](${r.tabId}.md) | http://localhost:8080/?${r.params}&hazbotRules=${r.tabId}&hazbotSidebar=true |`;
const renderPlaceholder = r =>
  `| ${r.tabId} | ${r.activity} | ${r.page} | ${r.preset} | — | http://localhost:8080/?${r.params}&hazbotSidebar=true |`;

console.log("## Loadable rulesets\n");
console.log(loadable.map(renderLoadable).join("\n"));
console.log("\n## Placeholder tabs\n");
console.log(placeholders.map(renderPlaceholder).join("\n"));
'
```

The `EXCLUDED` set must match [`EXCLUDED_TABS` in scripts/extract-impl.js](../../scripts/extract-impl.js) — both are empty as of WM-18. If a future workbook revision introduces empty/TBD tabs, add their ids to both sets.

## Testing all rulesets via Playwright MCP

To validate every loadable ruleset against its playbook, walk each row of the **Loadable rulesets** table above. The methodology below assumes `npm start` is running on `http://localhost:8080`.

### Per-ruleset loop

For each tab ID:

1. **Navigate** to the localhost URL from the table.
2. **Confirm Cat 1 is active** (baseline): the sidebar should show `▸ ✓ 1: Did not run the simulation`. Use the inspector below.
3. **Walk Cats 2 → N** in order. After each setup change, click **Start** and wait ~2s for the run to end before checking the active category.
4. **Record** active category per scenario. Note unreachable / blocked categories with reasons (stubs, missing defaults).

### Inspector snippet — list all categories with ✓/✗

```js
() => {
  const cats = Array.from(document.querySelectorAll('button'))
    .filter(b => b.textContent?.match(/^\s*▸\s+[✓✗]\s+\d+:/));
  return cats.map(b => b.textContent.trim().slice(0, 100));
}
```

Multiple categories can match simultaneously — the engine picks the **highest-numbered ✓** as the matched feedback ([engine/evaluator.ts `computeMatchedCategoryFloor`](../../src/hazbot/engine/evaluator.ts)). Verify the *highest* ✓ is the expected category, not just the first.

### Driving setup

| Goal | How |
|------|-----|
| Run sim with defaults | `window.test.placeSparkInZone(0)` → click **Start** |
| Change vegetation in zone N | Open **Terrain Setup**, switch to Zone N tab (if multi-zone), click the desired vegetation label, **Next** → **Create** |
| Change drought in zone N | Same flow, click **Mild Drought** / **Medium Drought** (Severe gated by `severeDroughtAvailable=true`) |
| Set wind | `window.sim.setWindDirection(N); window.sim.wind.speed = M;` before clicking Start |
| Place spark per zone | `window.test.placeSparkInZone(zoneIdx)` for each zone (uses zone centroid in model ft) |
| Place 2 sparks in same zone | `const b = window.test.zoneBounds(0); window.sim.addSpark(b.minX + (b.maxX - b.minX) * 0.3, b.centerY); window.sim.addSpark(b.minX + (b.maxX - b.minX) * 0.7, b.centerY);` |
| Open Graph before run | Click `#base` (the right-panel-tab toggle) — sets `ui.showChart`, which becomes `ambientState.chartTabOpenAtStart` on the next `SimulationStarted` |
| Reset sparks + terrain | Click **Reload** (full reset). **Restart** keeps sparks but stops the run |
| Clear factor-variable history | Reload the page entirely — `Restart` does *not* clear readings/factor variables (they track user history across runs by design) |

### Common gotchas

- **`OneSparkPerZone` requires `sparks.length === zones.length`** ([sim-props.ts](../../src/hazbot/wildfire/sim-props.ts)). For a 3-zone preset, you need 3 sparks (one per zone) — placing 2 sparks across 2 different zones still evaluates `OneSparkPerZone = false`.
- **`TwoSparks` requires exactly length 2.** With 3 sparks, `TwoSparks = false` → in ruleset 25 this still allows Cat 4–6 to evaluate because they only require `OneSparkPerZone`, but Cat 2 (`NOT TwoSparks`) will also be ✓ — relying on highest-match semantics to pick the real winner.
- **`GraphOpen` is sticky per reading.** Opening the graph after a run doesn't retroactively flip the flag — toggle the graph *before* clicking Start.
- **Categories with `WITH`** (e.g. `ranSimulation WITH OneSparkPerZone …`) iterate across *all* readings — once true on any reading, the clause stays true even after subsequent runs change conditions. Use **Reload** + page navigation to fully clear.
- **Stubbed impls always return `false`** — currently `SparksAtTopAndBottom` (sim-prop, → WM-15) and `Helitack` / `usedHelitack` (sim-prop + factor variable, → WM-28). Categories that require them be `true` in a top-level AND are **unreachable** until implemented (e.g. ruleset 25 Cat 5/6, ruleset 45 Cat 4); categories that reference a stub inside an `OR` / `NOT` are **stub-degraded** (e.g. tabs 45/47/54 Cat 3 over-match helitack-only runs).
- **Engine change-detection defaults are config-derived (WM-27).** The `set*` factor variables compare each `SimulationStarted` reading against defaults derived from the resolved simulation config (preset + URL params), not a per-rule-set `defaults` object. There is no longer a `defaults: {}` / `missing-defaults` load failure — every rule-set loads regardless of the source sheet. If a `set*` variable misfires, check that the activity URL selects the intended `preset` (the dev sidebar's **Diagnostics** panel shows the requested preset and whether it was recognized).
- **Set-valued factor variables accumulate across the whole session.** `uniqueWindValuesUsed` / `uniqueNonZeroWindValuesUsed` fold over every `SimulationStarted` reading in `engine.readings`, not just the most recent one. Validating ruleset 24 Cat 4 (`NOT (uniqueWindValuesUsed.size > 1) AND uniqueNonZeroWindValuesUsed.size > 0`) requires a **full page reload before** the wind-non-zero run, not just Restart — otherwise a leftover zero-wind reading from a Cat 2/3 run inflates `uniqueWindValuesUsed.size` to 2 and the match jumps straight to Cat 5.

### Current validation status (snapshot — 2026-05-22, post-WM-18)

WM-18 re-extracted all 11 rule-sets from the 2026-05-22 workbook, added new
factor-variable / sim-prop impls (`CorrectZoneSetup`, `UniformZoneSettings`,
`triedAllVegetations`, `usedFireline`, `Fireline`, `DefaultVars`,
`DefaultVegetations`, `SevereDroughts`), and stubbed `Helitack` / `usedHelitack`
pending WM-28. R9 per-category Jest coverage now validates every reachable
category for all 11 rule-sets, and the new `rule-sets/index.test.ts` R5 load
gate asserts zero `missing-impl` / `parse-error` and the expected
`stub-warning` distribution. The post-WM-18 dev sidebar shows
`APP_RULES_VERSION = 2` and the new factor variables / sim-props are
populated; a representative Playwright-MCP walk against tab 23 confirmed the
Cat 1 → Cat 2 transition after a default-only run (sparks placed via
`window.test.placeSparkInZone(0)/(1)` + Start). A full Playwright walk of all
11 playbooks is deferred — WM-28 owns the helitack-dependent walk for tabs
45/47/54, and the Jest R9 coverage already validates each reachable category
end to end through the engine.

| Ruleset | Preset | R9 Jest coverage | Stub effects (per WM-18) |
|---------|--------|------------------|--------------------------|
| 23 | plainsTwoZone | cats 1–5 ✓ | none |
| 24 | plainsTwoZone | cats 1–5 ✓ | none |
| 25 | mountainTwoZone | cats 1–4 ✓ | cats 5 & 6 stub-gated (`SparksAtTopAndBottom` → WM-15) |
| 32 | threeGreenZonePlains | cats 1–6 ✓ | none |
| 33 | mountainTwoZone | cats 1–6 ✓ | none |
| 34 | shrubThreeZone | cats 1–4 ✓ | none — `sawIntenseFire` was dropped in WM-18; cat 4 now uses `triedAllVegetations` |
| 35 | mountainTwoZone | cats 1–7 ✓ | none — cat 3 gained a `setAnyVar AND` guard in the 2026-06-02 sheet, so cat 2 is reachable again (see [TBD.md §4](../../src/hazbot/TBD.md)) |
| 42 | defaultTwoZone | cats 1–3 ✓ | none |
| 45 | townsThreeZone | cats 1–3 ✓ | cat 4 stub-gated (`Helitack` → WM-28); cat 3 stub-degraded (`NOT (usedFireline AND usedHelitack)` collapses to TRUE — over-matches fireline+helitack runs) |
| 47 | dryTownsThreeZone | cats 1–5 ✓ | cat 3 stub-degraded (`NOT (Fireline OR Helitack)` → `NOT Fireline` — over-matches helitack-only runs); cats 4/5 helitack arm dead, fireline arm reachable |
| 54 | fiveTownsThreeZone | cats 1–4 ✓ | cat 3 stub-degraded (same as 47); cat 4 helitack arm dead, fireline arm reachable |

Re-run this validation pass whenever rule-sets are regenerated from the source sheet, when stubs in [src/hazbot/wildfire/sim-props.ts](../../src/hazbot/wildfire/sim-props.ts) / [factor-variable-stubs.ts](../../src/hazbot/wildfire/factor-variable-stubs.ts) are filled in, or when WM-28 lands helitack run-window detection (which re-validates tabs 45/47/54).
