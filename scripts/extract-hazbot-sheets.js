#!/usr/bin/env node

/**
 * Extract a Hazbot xlsx workbook into typed TypeScript rule-set modules
 * (per WM-10 Req 11). Also dumps the README sheet to src/hazbot/dsl-grammar.md.
 *
 * Usage:
 *   node scripts/extract-hazbot-sheets.js <input.xlsx> [outputDir]
 *
 * Defaults outputDir to ./src/hazbot.
 *
 * Per-tab module shape:
 *   import { RuleSet } from "../engine";
 *   import { WildfireDefaults } from "../wildfire/types";
 *   export const ruleSet23: RuleSet<WildfireDefaults> = { ... };
 *
 * Aggregate module:
 *   export const ruleSets: Record<string, RuleSet<WildfireDefaults>> = { "23": ruleSet23, ... };
 *
 * Empty / placeholder tabs (43, 45, 47, 54) are excluded from the index.
 * The extraction logic (segmentation + parsing + emission) lives in
 * `extract-impl.js` so unit tests can call it without the xlsx step.
 */

const path = require("path");
const fs = require("fs");
const readXlsxFile = require("read-excel-file/node");
const { extractFromSheets, EXCLUDED_TABS } = require("./extract-impl");

const [, , inputArg, outputArg] = process.argv;

if (!inputArg) {
  console.error("Usage: node scripts/extract-hazbot-sheets.js <input.xlsx> [outputDir]");
  process.exit(1);
}

const inputPath = path.resolve(inputArg);
const baseHazbotDir = path.resolve(outputArg || "src/hazbot");

if (!fs.existsSync(inputPath)) {
  console.error(`Input file not found: ${inputPath}`);
  process.exit(1);
}

(async () => {
  const allSheets = await readXlsxFile(inputPath, { getSheets: true });
  // Normalize: drop fully-empty rows, replace nulls with "".
  const normalized = allSheets.map(({ sheet, data }) => ({
    sheet: String(sheet),
    data: data
      .filter((r) => r.some((c) => c !== null && c !== ""))
      .map((r) => r.map((c) => (c == null ? "" : c))),
  }));

  const result = extractFromSheets(normalized);

  const ruleSetsDir = path.join(baseHazbotDir, "rule-sets");
  fs.mkdirSync(ruleSetsDir, { recursive: true });

  // Write per-tab modules.
  for (const tab of result.tabs) {
    const outPath = path.join(ruleSetsDir, `${tab.id}.ts`);
    fs.writeFileSync(outPath, tab.tsSource);
    console.log(`Wrote ${outPath}`);
  }

  // Write index.
  const indexPath = path.join(ruleSetsDir, "index.ts");
  fs.writeFileSync(indexPath, result.indexSource);
  console.log(`Wrote ${indexPath}`);

  // Write dsl-grammar.md.
  if (result.dslGrammar) {
    const grammarPath = path.join(baseHazbotDir, "dsl-grammar.md");
    fs.writeFileSync(grammarPath, result.dslGrammar);
    console.log(`Wrote ${grammarPath}`);
  }

  if (result.skippedTabs.length > 0) {
    console.log(`Skipped tabs: ${result.skippedTabs.join(", ")}`);
  }
  console.log(`Excluded tabs (per spec): ${EXCLUDED_TABS.join(", ")}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
