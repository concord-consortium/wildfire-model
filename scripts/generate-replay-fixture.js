// @ts-check
// Regenerates the R18c replay fixture for ruleset 25.
// Invoked via: `node scripts/generate-replay-fixture.js`.
//
// `ts-node/register/transpile-only` handles the substrate import closure
// without further configuration. If a future temporal variable or rule set
// pulls in non-trivial-for-ts-node modules (React, MobX decorators, etc.),
// switch to a compiled-output approach (tsc --outDir scripts/.fixture-build).

const fs = require("fs");
const path = require("path");

require("ts-node/register/transpile-only");

const { Engine } = require("../src/hazbot/engine/engine");
const { computeMatchedCategoryForEngine } = require("../src/hazbot/engine/evaluator");
const { factorVariables } = require("../src/hazbot/wildfire/factor-variables");
const { simProps } = require("../src/hazbot/wildfire/sim-props");
const { temporalVariables } = require("../src/hazbot/wildfire/temporal-variables");
const { translate } = require("../src/hazbot/wildfire/translate");
const { ruleSets } = require("../src/hazbot/rule-sets");

// Deterministic monotonic-integer timestamp.
let nextAt = 1000;
function tick() { return nextAt++; }

// Shared SimulationStarted data: 2 sparks across 2 zones (drives
// OneSparkPerZone=true) — matches the test case "(c) multi-true with
// highest selected" in src/hazbot/rule-sets/25.test.ts as the corner-1
// baseline. Keeping spark layout identical across all four corners
// isolates GraphOpen (chart-tab state) as the only varying input.
const startData = {
  zones: [{ index: 0 }, { index: 1 }],
  sparks: [{ x: 0, y: 0, zoneIdx: 0 }, { x: 1, y: 0, zoneIdx: 1 }],
  wind: { speed: 0, direction: 0 },
};
const endData = { outcome: null };

const scenario = [
  // === Corner 1 (R18b): seed-only TRUE — chart open at start, never toggled during run ===
  { name: "ChartTabShown" },
  { name: "SimulationStarted", data: startData },
  { name: "SimulationEnded", data: endData },

  // === Corner 2 (R18b): seed FALSE + within-window append TRUE ===
  { name: "ChartTabHidden" },
  { name: "SimulationStarted", data: startData },
  { name: "ChartTabShown" },
  { name: "SimulationEnded", data: endData },

  // === Corner 3 (R18b): seed TRUE + within-window appends ===
  { name: "ChartTabShown" },
  { name: "SimulationStarted", data: startData },
  { name: "ChartTabHidden" },
  { name: "ChartTabShown" },
  { name: "SimulationEnded", data: endData },

  // === Corner 4 (R18b): NEVER open — seed FALSE, no within-window appends ===
  { name: "ChartTabHidden" },
  { name: "SimulationStarted", data: startData },
  { name: "SimulationEnded", data: endData },
];

const events = scenario.map((e) => ({ ...e, at: tick() }));

const engine = new Engine({
  ruleSet: ruleSets["25"],
  requestedRuleSetId: "25",
  factorVariables,
  simProps,
  temporalVariables,
  translate,
  runStartTriggers: ["SimulationStarted"],
});
const matchedCategoryHistory = [];
for (const event of events) {
  engine.consume(event);
  matchedCategoryHistory.push(computeMatchedCategoryForEngine(engine));
}

// Scoped key-sorting on the top-level maps vulnerable to insertion-order
// drift. Readings keep natural engine-side order so reviewers see fields in
// a meaningful order at PR-review time. matchedCategoryHistory is an array
// — order is semantic.
function sortKeys(obj) {
  const sorted = {};
  for (const k of Object.keys(obj).sort()) sorted[k] = obj[k];
  return sorted;
}

// R1 JSON-safety gate. JSON.stringify silently strips `undefined`, and
// coerces Map/Set/Date/NaN/Infinity. The test-side roundTrip catches the
// `undefined`-stripping hole symmetrically; the other cases would pass
// toEqual against the stripped fixture without this gate, so check at the
// generator boundary where the violation actually surfaces.
function assertJsonSafe(value, descriptor) {
  if (value === null) return;
  const t = typeof value;
  if (t === "boolean" || t === "string") return;
  if (t === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`JSON-safety violation at ${descriptor}: non-finite number ${value}`);
    }
    return;
  }
  if (t === "undefined") {
    throw new Error(`JSON-safety violation at ${descriptor}: undefined (stripped by JSON.stringify)`);
  }
  if (t !== "object") {
    throw new Error(`JSON-safety violation at ${descriptor}: ${t}`);
  }
  if (value instanceof Map || value instanceof Set || value instanceof Date) {
    throw new Error(`JSON-safety violation at ${descriptor}: ${value.constructor.name}`);
  }
  if (Object.getPrototypeOf(value) !== Object.prototype && !Array.isArray(value)) {
    throw new Error(`JSON-safety violation at ${descriptor}: class instance ${value.constructor && value.constructor.name}`);
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertJsonSafe(v, `${descriptor}[${i}]`));
  } else {
    for (const [k, v] of Object.entries(value)) assertJsonSafe(v, `${descriptor}.${k}`);
  }
}
for (const [name, value] of Object.entries(engine.temporalValues)) {
  assertJsonSafe(value, `temporalValues.${name}`);
}
engine.readings.forEach((r, i) => {
  r.temporalHistory.forEach((c, j) => {
    assertJsonSafe(c.value, `readings[${i}].temporalHistory[${j}].value`);
  });
});

const expected = {
  readings: engine.readings,
  observed: sortKeys(engine.observed),
  temporalValues: sortKeys(engine.temporalValues),
  matchedCategoryHistory,
};

const fixturesDir = path.resolve(__dirname, "../src/hazbot/wildfire/__fixtures__");
fs.mkdirSync(fixturesDir, { recursive: true });
fs.writeFileSync(path.join(fixturesDir, "events.json"), JSON.stringify({ events }, null, 2));
fs.writeFileSync(path.join(fixturesDir, "expected.json"), JSON.stringify(expected, null, 2));
console.log("Replay fixture regenerated.");
