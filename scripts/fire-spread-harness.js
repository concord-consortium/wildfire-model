// @ts-check
// CLI over scripts/fire-spread-harness-impl.js. Reproduces the measurements in
// specs/WM-41-fire-doesnt-cross-zones/requirements.md.
//
//   node scripts/fire-spread-harness.js rates
//   node scripts/fire-spread-harness.js burn-index
//   node scripts/fire-spread-harness.js sweep [seeds]
//   node scripts/fire-spread-harness.js repro [seed]
//
// `ts-node/register/transpile-only` handles the src/models import closure, the same
// way scripts/generate-replay-fixture.js does.

require("ts-node/register/transpile-only");

const {
  defaultGeometry, runFire, burntByZone, boundaryColumn, crossingDepth,
  flatGroundSpreadTable, burnIndexCensus,
} = require("./fire-spread-harness-impl");

const { TerrainType, Vegetation, DroughtLevel } = require("../src/types");

const VEGETATION = ["Grass", "Shrub", "Forest", "ForestWithSuppression"];
const DROUGHT = ["No drought", "Mild", "Medium", "Severe"];
const BURN_INDEX = ["Low", "Medium", "High"];

const pad = (v, n) => String(v).padStart(n);

const zone = (terrainType, vegetation, droughtLevel) => ({ terrainType, vegetation, droughtLevel });

const rates = () => {
  const table = flatGroundSpreadTable();
  console.log("Minutes for the front to advance one 500 ft cell on flat ground (1 model day = 1440 min):\n");
  console.log("vegetation".padEnd(24) + DROUGHT.map((d) => pad(d, 12)).join(""));
  table.forEach((row, v) =>
    console.log(VEGETATION[v].padEnd(24) + row.map((c) => pad(c.minutesPerCell.toFixed(0), 12)).join(""))
  );
  console.log(`\nCells per model day (the grid is ${defaultGeometry().gridWidth} cells wide, split into two zones):\n`);
  console.log("vegetation".padEnd(24) + DROUGHT.map((d) => pad(d, 12)).join(""));
  table.forEach((row, v) =>
    console.log(VEGETATION[v].padEnd(24) + row.map((c) => pad(c.cellsPerDay.toFixed(1), 12)).join(""))
  );
};

const burnIndex = () => {
  // Each *-plains heightmap blends across the boundary, so only the named terrain's
  // own half is scanned; the plains map is scanned whole.
  const terrains = [
    ["plains", [zone(TerrainType.Plains, 0, 0), zone(TerrainType.Plains, 0, 0)], null],
    ["foothills", [zone(TerrainType.Foothills, 0, 0), zone(TerrainType.Plains, 0, 0)], [2, 118]],
    ["mountains", [zone(TerrainType.Mountains, 0, 0), zone(TerrainType.Plains, 0, 0)], [2, 118]],
  ];
  console.log("Share of cells reaching each burn index (max over the 8 neighbor pairs), wind 0.");
  console.log("Low/Medium thresholds: Grass 45 | Shrub 10, 50 | Forest 25 | ForestWithSuppression 12, 40\n");
  for (const [name, zoneSpecs, columns] of terrains) {
    for (let v = 0; v < 4; v++) {
      for (let d = 0; d < 4; d++) {
        const c = burnIndexCensus({ zoneSpecs, vegetation: v, droughtLevel: d, columns });
        console.log(
          name.padEnd(10) + VEGETATION[v].padEnd(22) + DROUGHT[d].padEnd(11) +
          BURN_INDEX.map((label, i) => `${label} ${pad(c.share[i].toFixed(1), 5)}%`).join("  ") +
          `   maxRate ${c.maxRate.toFixed(1)}`
        );
      }
    }
    console.log("");
  }
};

// One spark 6 cells in from the boundary on the zone-1 side, so the front reaches the
// boundary early and the only variable left is which day the flip lands on.
const SWEEP_SPARK = [63000, 40000];

const sweep = (seedCount) => {
  const cases = [
    ["Hills to Hills, shrub both sides",
      [zone(TerrainType.Foothills, Vegetation.Shrub, DroughtLevel.MildDrought),
        zone(TerrainType.Foothills, Vegetation.Shrub, DroughtLevel.MildDrought)]],
    ["Hills to Plains, shrub both sides",
      [zone(TerrainType.Foothills, Vegetation.Shrub, DroughtLevel.MildDrought),
        zone(TerrainType.Plains, Vegetation.Shrub, DroughtLevel.MildDrought)]],
    ["Hills to Plains, Forest to Shrub",
      [zone(TerrainType.Foothills, Vegetation.Forest, DroughtLevel.MildDrought),
        zone(TerrainType.Plains, Vegetation.Shrub, DroughtLevel.MildDrought)]],
  ];
  console.log(`Cells reached in the far zone, one spark at (${SWEEP_SPARK}), ${seedCount} seeds per case.\n`);
  for (const [label, zoneSpecs] of cases) {
    const byDay = new Map();
    let neverEnded = 0;
    for (let seed = 1; seed <= seedCount; seed++) {
      const result = runFire({ zoneSpecs, sparks: [SWEEP_SPARK], seed });
      const day = result.endOfLowIntensityFireDay;
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(crossingDepth(result, 0));
      if (result.stoppedAtMinutes === null) neverEnded++;
    }
    console.log(`${label}  (never ended: ${neverEnded}/${seedCount})`);
    for (const day of [...byDay.keys()].sort()) {
      const depths = byDay.get(day);
      const min = Math.min(...depths);
      const max = Math.max(...depths);
      console.log(
        `  endOfLowIntensityFire day ${day}: n=${pad(depths.length, 3)}  ` +
        `crossing depth ${min === max ? min : `${min} to ${max}`} cells`
      );
    }
    console.log("");
  }
};

// The setup recovered from the WM-41 screenshot: Hills + Forest against Plains + Shrub,
// mild drought both, one spark per zone with the right-hand one 11 cells in.
const REPRO_ZONES = [
  zone(TerrainType.Foothills, Vegetation.Forest, DroughtLevel.MildDrought),
  zone(TerrainType.Plains, Vegetation.Shrub, DroughtLevel.MildDrought),
];
const REPRO_SPARKS = [[36350, 27600], [66075, 40750]];

const repro = (seed) => {
  const result = runFire({ zoneSpecs: REPRO_ZONES, sparks: REPRO_SPARKS, seed, maxMinutes: 4320 });
  const burnt = burntByZone(result);
  const { FireState } = require("../src/models/cell");
  const { gridWidth } = result.geometry;
  let leftmostInZone1 = gridWidth;
  for (const cell of result.cells) {
    if (cell.zoneIdx === 1 && cell.fireState !== FireState.Unburnt && cell.x < leftmostInZone1) {
      leftmostInZone1 = cell.x;
    }
  }
  console.log(`seed ${seed}: Hills+Forest | Plains+Shrub, mild drought, sparks ${JSON.stringify(REPRO_SPARKS)}`);
  console.log(`  ran to day ${(result.timeMinutes / 1440).toFixed(2)}, ` +
    `${result.stoppedAtMinutes === null ? "still burning (never ended)" : `stopped at ${result.stoppedAtMinutes} min`}`);
  console.log(`  endOfLowIntensityFire day: ${result.endOfLowIntensityFireDay}`);
  console.log(`  burnt: forest zone ${burnt[0]}, shrub zone ${burnt[1]}`);
  console.log(`  leftmost burnt column in the shrub zone: ${leftmostInZone1} ` +
    `(the boundary column is ${boundaryColumn(result.cells)}; equal means the fire is walled on it)`);

  console.log("\n" + asciiMap(result, 2));
};

/** Coarse plan view: # burnt, * burning, ~ river, : nonburnable, | the last zone-0 column. */
const asciiMap = (result, step) => {
  const { FireState } = require("../src/models/cell");
  const { gridWidth, gridHeight } = result.geometry;
  const boundary = boundaryColumn(result.cells);
  const lines = [];
  for (let y = gridHeight - 1; y >= 0; y -= step) {
    let line = "";
    for (let x = 0; x < gridWidth; x += step) {
      const cell = result.cells[y * gridWidth + x];
      let ch = ".";
      if (cell.fireState === FireState.Burnt) ch = "#";
      else if (cell.fireState === FireState.Burning) ch = "*";
      else if (cell.isRiver) ch = "~";
      else if (cell.isUnburntIsland) ch = ":";
      else if (x === boundary - 1 || x === boundary) ch = "|";
      line += ch;
    }
    lines.push(line);
  }
  return lines.join("\n");
};

const [command, arg] = process.argv.slice(2);
switch (command) {
  case "rates": rates(); break;
  case "burn-index": burnIndex(); break;
  case "sweep": sweep(Number(arg) || 40); break;
  case "repro": repro(Number(arg) || 1); break;
  default:
    console.error("usage: node scripts/fire-spread-harness.js <rates|burn-index|sweep [seeds]|repro [seed]>");
    process.exit(1);
}
