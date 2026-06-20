#!/usr/bin/env node

// Generates the committed tour-text artifact src/hazbot/wildfire/tour-data.generated.ts
// from the committed rule-set modules' `arrowText` (WM-17). Standalone: needs no
// rule-set regeneration and no xlsx re-extraction. Also wired into the hazbot update
// workflow as a post-extraction step so a future full extraction regenerates it too.
//
// ts-node/register lets `require()` resolve .ts files via in-memory TS compilation
// (ts-node is already a project devDep), so this .js script can import the committed
// rule-set barrel directly.
require("ts-node/register");

const path = require("path");
const fs = require("fs");
const { buildTourData } = require("./tour-data-impl");
const { ruleSets } = require("../src/hazbot/rule-sets");

const OUT = path.resolve(__dirname, "../src/hazbot/wildfire/tour-data.generated.ts");

try {
  const { artifactSource, warnings } = buildTourData(ruleSets);
  fs.writeFileSync(OUT, artifactSource);
  console.log(`Wrote ${OUT}`);
  if (warnings.length) {
    console.log(`(${warnings.length} warning(s) — see above.)`);
  }
} catch (err) {
  console.error(err.message || String(err));
  process.exit(1);
}
