#!/usr/bin/env node
/* eslint-disable */

/**
 * Extract every sheet of an .xlsx workbook into one JSON file per sheet.
 *
 * Usage:
 *   node scripts/extract-hazbot-sheets.js <input.xlsx> [outputDir]
 *
 * Defaults outputDir to ./src/hazbot/rule-sets relative to the repo root.
 *
 * Each output file is named <sheetName>.json and contains a 2D array of
 * cell values (rows × columns), with empty cells represented as "".
 */

const path = require("path");
const fs = require("fs");
const readXlsxFile = require("read-excel-file/node");

const [, , inputArg, outputArg] = process.argv;

if (!inputArg) {
  console.error("Usage: node scripts/extract-hazbot-sheets.js <input.xlsx> [outputDir]");
  process.exit(1);
}

const inputPath = path.resolve(inputArg);
const outputDir = path.resolve(outputArg || "src/hazbot/rule-sets");

if (!fs.existsSync(inputPath)) {
  console.error(`Input file not found: ${inputPath}`);
  process.exit(1);
}

fs.mkdirSync(outputDir, { recursive: true });

(async () => {
  const all = await readXlsxFile(inputPath, { getSheets: true });
  const manifest = [];

  for (const { sheet, data } of all) {
    const cleaned = data
      .filter((r) => r.some((c) => c !== null && c !== ""))
      .map((r) => r.map((c) => (c == null ? "" : c)));
    const safeName = String(sheet).replace(/[^A-Za-z0-9_-]/g, "_");
    const outPath = path.join(outputDir, `${safeName}.json`);
    fs.writeFileSync(outPath, JSON.stringify(cleaned, null, 2) + "\n");
    manifest.push({ sheetName: sheet, file: path.relative(outputDir, outPath), rowCount: cleaned.length });
    console.log(`Wrote ${outPath} (${cleaned.length} rows)`);
  }

  const manifestPath = path.join(outputDir, "_manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Wrote ${manifestPath}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
