#!/usr/bin/env node

/**
 * Dump an .xlsx workbook to readable plain text for ad-hoc inspection.
 *
 * Unlike `extract-hazbot-sheets.js` (which runs the full extraction → TS
 * pipeline), this is a lightweight "let me eyeball a sheet" tool. Handy when
 * working a Hazbot re-extract story and you want to see what the source
 * spreadsheet actually contains before/after extraction.
 *
 * Reuses the `read-excel-file` dependency already used by the extraction
 * scripts — no new deps, no Python.
 *
 * Usage:
 *   node scripts/dump-xlsx.js <file.xlsx>             # list sheet names + row counts
 *   node scripts/dump-xlsx.js <file.xlsx> <sheetName> # dump one sheet
 *   node scripts/dump-xlsx.js <file.xlsx> --all       # dump every sheet
 *
 * Each non-empty row prints as:  R<rowNum> | A="..."  ||  C="..."  || ...
 * (empty cells omitted, columns labelled A, B, C, ...).
 */

const path = require("path");
const fs = require("fs");
const readXlsxFile = require("read-excel-file/node");

const [, , inputArg, sheetArg] = process.argv;

if (!inputArg) {
  console.error("Usage: node scripts/dump-xlsx.js <file.xlsx> [sheetName|--all]");
  process.exit(1);
}

const inputPath = path.resolve(inputArg);
if (!fs.existsSync(inputPath)) {
  console.error(`File not found: ${inputPath}`);
  process.exit(1);
}

/** 0-based column index -> spreadsheet column label (0 -> A, 26 -> AA). */
function colLabel(index) {
  let label = "";
  let i = index + 1;
  while (i > 0) {
    const rem = (i - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    i = Math.floor((i - 1) / 26);
  }
  return label;
}

function dumpSheet(name, data) {
  console.log(`########## SHEET: ${name} ##########`);
  data.forEach((row, rowIndex) => {
    const cells = row
      .map((cell, colIndex) => ({
        colIndex,
        value: cell == null ? "" : String(cell).trim(),
      }))
      .filter((c) => c.value !== "");
    if (cells.length > 0) {
      const rendered = cells
        .map((c) => `${colLabel(c.colIndex)}=${JSON.stringify(c.value)}`)
        .join("  ||  ");
      console.log(`R${rowIndex + 1} | ${rendered}`);
    }
  });
  console.log("");
}

(async () => {
  // Mirrors the proven call in extract-hazbot-sheets.js: with `getSheets: true`
  // this build of read-excel-file returns one { sheet, data } per tab.
  const allSheets = await readXlsxFile(inputPath, { getSheets: true });
  const sheets = allSheets.map(({ sheet, data }) => ({
    name: String(sheet),
    data,
  }));

  if (!sheetArg) {
    console.log(`Sheets (${sheets.length}):`);
    sheets.forEach((s, i) => {
      console.log(`  ${i}. ${s.name}  (${s.data.length} rows)`);
    });
    return;
  }

  const targets =
    sheetArg === "--all"
      ? sheets
      : sheets.filter((s) => s.name === sheetArg);

  if (targets.length === 0) {
    console.error(`Sheet not found: ${sheetArg}`);
    console.error(`Available: ${sheets.map((s) => s.name).join(", ")}`);
    process.exit(1);
  }

  targets.forEach((s) => dumpSheet(s.name, s.data));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
