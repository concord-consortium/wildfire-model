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
| 25 | 2 | 5 | shrubThreeZone | [25.md](25.md) | http://localhost:8080/?preset=shrubThreeZone&helitackAvailable=false&fireLineAvailable=false&showBurnIndex=false&severeDroughtAvailable=false&forestWithSuppressionAvailable=false&hazbotRules=25&hazbotSidebar=true |
| 32 | 3 | 2 | threeGreenZonePlains | [32.md](32.md) | http://localhost:8080/?preset=threeGreenZonePlains&helitackAvailable=false&fireLineAvailable=false&showBurnIndex=false&severeDroughtAvailable=false&hazbotRules=32&hazbotSidebar=true |
| 33 | 3 | 3 | mountainTwoZone | [33.md](33.md) | http://localhost:8080/?preset=mountainTwoZone&helitackAvailable=false&fireLineAvailable=false&showBurnIndex=false&severeDroughtAvailable=false&hazbotRules=33&hazbotSidebar=true |
| 34 | 3 | 4 | shrubThreeZone | [34.md](34.md) | http://localhost:8080/?preset=shrubThreeZone&helitackAvailable=false&fireLineAvailable=false&showBurnIndex=true&severeDroughtAvailable=false&hazbotRules=34&hazbotSidebar=true |
| 35 | 3 | 5 | mountainTwoZone | [35.md](35.md) | http://localhost:8080/?preset=mountainTwoZone&helitackAvailable=false&fireLineAvailable=false&showBurnIndex=true&severeDroughtAvailable=false&hazbotRules=35&hazbotSidebar=true |

## Placeholder tabs (not yet defined)

These tabs exist in the sequence but are excluded from the rule-set extractor ([scripts/extract-impl.js EXCLUDED_TABS](../../scripts/extract-impl.js)) because their Google Sheet entries are empty/TBD. URLs are listed here so they're ready to wire up once defined.

| Tab | Activity | Page | Preset | Validation Doc | Test URL (no `hazbotRules` until defined) |
|-----|----------|------|--------|----------------|-------------------------------------------|
| 43 | 4 | 3 | defaultTwoZone | — | http://localhost:8080/?preset=defaultTwoZone&windSpeed=2&windDirection=270.5&helitackAvailable=false&fireLineAvailable=false&severeDroughtAvailable=false&showBurnIndex=false&hazbotSidebar=true |
| 45 | 4 | 5 | townsThreeZone | — | http://localhost:8080/?preset=townsThreeZone&windSpeed=4&windDirection=100&sparks=[[50000,40000],[50000,40000],[50000,40000]]&severeDroughtAvailable=false&showBurnIndex=false&hazbotSidebar=true |
| 47 | 4 | 7 | dryTownsThreeZone | — | http://localhost:8080/?preset=dryTownsThreeZone&sparks=[[35000,31000],[35000,31000],[35000,31000]]&windSpeed=6&windDirection=265&severeDroughtAvailable=false&hazbotSidebar=true |
| 54 | 5 | 4 | fiveTownsThreeZone | — | http://localhost:8080/?preset=fiveTownsThreeZone&severeDroughtAvailable&windSpeed=2&windDirection=165&showBurnIndex=true&hazbotSidebar=true |

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

// Loadable rulesets have a defined rule-set module + playbook. Placeholders do not.
const EXCLUDED = new Set(["43", "45", "47", "54"]);
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

The `EXCLUDED` set must match [`EXCLUDED_TABS` in scripts/extract-impl.js](../../scripts/extract-impl.js). If a placeholder tab gains a rule-set module, remove it from `EXCLUDED` here (and add its playbook link to the loadable section).

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
- **Stubbed sim-props always return `false`** — currently `SparksAtTopAndBottom` and `sawIntenseFire`. Categories that require them be `true` (e.g. ruleset 25 Cat 6, ruleset 34 Cat 5) are **unreachable** until implemented.
- **Empty `defaults: {}`** in rule-set modules blocks engine load entirely — the sidebar shows `Missing defaults: <id> · <var> reads defaults path …`. Currently affects rulesets 32–35. Defaults must be filled into the source Google Sheet, then re-extracted via [scripts/extract-hazbot-sheets.js](../../scripts/extract-hazbot-sheets.js).

### Current validation status (snapshot — 2026-05-11)

| Ruleset | Result |
|---------|--------|
| 23 | 5/5 categories ✓ |
| 24 | 5/5 categories ✓ |
| 25 | 5/6 ✓ — Cat 6 unreachable (`SparksAtTopAndBottom` stub) |
| 32 | Blocked — `defaults: {}` (TBD in source sheet) |
| 33 | Blocked — `defaults: {}` (TBD in source sheet) |
| 34 | Blocked — `defaults: {}` + `sawIntenseFire` stub |
| 35 | Blocked — `defaults: {}` (TBD in source sheet) |

Re-run this validation pass whenever rule-sets are regenerated from the source sheet or when stubs in [src/hazbot/wildfire/sim-props.ts](../../src/hazbot/wildfire/sim-props.ts) / [factor-variable-stubs.ts](../../src/hazbot/wildfire/factor-variable-stubs.ts) are filled in.
