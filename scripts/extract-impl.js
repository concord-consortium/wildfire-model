// Extraction logic, factored out of extract-hazbot-sheets.js so unit tests can call
// it with synthetic JSON-shaped row data without a real .xlsx file.

const TS_HEADER = "// AUTO-GENERATED — DO NOT EDIT — re-run scripts/extract-hazbot-sheets.js\n\n";
const MD_HEADER = "> **AUTO-GENERATED — DO NOT EDIT — re-run `scripts/extract-hazbot-sheets.js`**\n\n";
const EXCLUDED_TABS = ["43", "45", "47", "54"];

function extractFromSheets(sheets) {
  const tabs = [];
  const skippedTabs = [];
  let dslGrammar;
  for (const { sheet, data } of sheets) {
    if (sheet.toLowerCase() === "readme") {
      dslGrammar = MD_HEADER + readmeToMarkdown(data);
      continue;
    }
    if (EXCLUDED_TABS.includes(sheet)) {
      skippedTabs.push(sheet);
      continue;
    }
    const parsed = parseTab(sheet, data);
    if (!parsed) {
      skippedTabs.push(sheet);
      continue;
    }
    tabs.push({
      id: sheet,
      tsSource: emitTabModule(parsed),
    });
  }
  return {
    tabs,
    skippedTabs,
    dslGrammar,
    indexSource: emitIndex(tabs.map((t) => t.id)),
  };
}

// === Parsing ===

function parseTab(sheetName, rows) {
  // Find the rule-row block: header row contains "#" or "Pseudocode" and rows
  // below it have the rule data. Find the factor-variable block: header row
  // contains "Factor variable" or similar.
  const ruleHeaderIdx = rows.findIndex((row) => row.some((c) => /pseudocode/i.test(String(c))));
  if (ruleHeaderIdx < 0) return null; // not a rule-set tab

  const ruleHeader = rows[ruleHeaderIdx];
  const colIdx = mapRuleColumnIndices(ruleHeader);

  // Iterate rule rows after the header until we hit the factor-variable block
  // header or the end of data.
  const fvHeaderIdx = rows.findIndex((row, i) =>
    i > ruleHeaderIdx && row.some((c) => /factor variable/i.test(String(c))),
  );
  const ruleEndIdx = fvHeaderIdx > 0 ? fvHeaderIdx : rows.length;

  const categories = [];
  for (let i = ruleHeaderIdx + 1; i < ruleEndIdx; i++) {
    const row = rows[i];
    const idCell = row[colIdx.id];
    if (idCell === undefined || idCell === "") continue;
    const id = parseInt(String(idCell), 10);
    if (isNaN(id)) continue;
    const cat = {
      id,
      studentAction: String(row[colIdx.studentAction] ?? ""),
      feedback: String(row[colIdx.feedback] ?? ""),
      visualFeedback: String(row[colIdx.visualFeedback] ?? ""),
      expression: String(row[colIdx.expression] ?? "").trim(),
    };
    if (colIdx.arrowText !== undefined) {
      const arrow = String(row[colIdx.arrowText] ?? "").trim();
      if (arrow) cat.arrowText = arrow;
    }
    categories.push(cat);
  }

  if (categories.length === 0) return null;

  // Factor-variable block.
  const factorVariables = [];
  const defaults = { zones: [], wind: undefined };
  if (fvHeaderIdx > 0) {
    const fvHeader = rows[fvHeaderIdx];
    const fvColIdx = mapFactorVarColumnIndices(fvHeader);
    for (let i = fvHeaderIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      const name = String(row[fvColIdx.name] ?? "").trim();
      if (!name) continue;
      const def = {
        name,
        definition: String(row[fvColIdx.definition] ?? "").trim(),
        logEvents: parseLogEvents(String(row[fvColIdx.logEvents] ?? "")),
        details: String(row[fvColIdx.details] ?? ""),
      };
      factorVariables.push(def);
      mergeDefaults(defaults, def.details);
    }
  }

  // Drop empty zones array (no per-zone data found).
  const finalDefaults = { zones: defaults.zones, wind: defaults.wind };
  if (finalDefaults.zones.length === 0) delete finalDefaults.zones;
  if (finalDefaults.wind === undefined) delete finalDefaults.wind;

  return { id: sheetName, categories, factorVariables, defaults: finalDefaults };
}

function mapRuleColumnIndices(header) {
  const lc = header.map((c) => String(c).toLowerCase().trim());
  const findCol = (...patterns) => {
    for (const p of patterns) {
      const idx = lc.findIndex((c) => c.includes(p));
      if (idx >= 0) return idx;
    }
    return -1;
  };
  const arrowIdx = findCol("text to go with arrows", "arrow");
  return {
    id: findCol("#"),
    studentAction: findCol("student action"),
    feedback: findCol("hazbot feedback", "feedback"),
    visualFeedback: findCol("visual feedback"),
    arrowText: arrowIdx >= 0 ? arrowIdx : undefined,
    expression: findCol("pseudocode"),
    details: findCol("details"),
  };
}

function mapFactorVarColumnIndices(header) {
  const lc = header.map((c) => String(c).toLowerCase().trim());
  const findCol = (...patterns) => {
    for (const p of patterns) {
      const idx = lc.findIndex((c) => c.includes(p));
      if (idx >= 0) return idx;
    }
    return -1;
  };
  return {
    name: findCol("factor variable", "name"),
    definition: findCol("definition"),
    logEvents: findCol("log event"),
    details: findCol("details"),
  };
}

function parseLogEvents(s) {
  return s.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
}

// === Defaults parsing from Details column ===

function mergeDefaults(defaults, details) {
  // Match patterns like:
  //   `Default values = "Plains" (zone 1), "Plains" (zone 2)`
  //   `Default value = "Mild Drought" (zone 1)`
  //   `Default speed = 0`, `Default direction = 0`
  // These are heuristic — TBD entries leave defaults absent so the engine's
  // load-time validator catches the gap (per Req 11a).
  if (!details || /\bTBD\b/i.test(details)) return;

  // Per-zone defaults: terrainType / vegetation / droughtLevel. Only field-specific
  // keywords are parsed — a generic "Default values = ..." wording without a
  // field-keyword would silently get the field wrong, so we don't try.
  parsePerZoneDefault(defaults, details, /default\s+terrain[^=]*=\s*([^.]+)/i, "terrainType");
  parsePerZoneDefault(defaults, details, /default\s+vegetation[^=]*=\s*([^.]+)/i, "vegetation");
  parsePerZoneDefault(defaults, details, /default\s+drought[^=]*=\s*([^.]+)/i, "droughtLevel");

  // Wind speed/direction defaults.
  const speedMatch = /default\s+(?:wind\s+)?speed\s*=\s*([0-9.]+)/i.exec(details);
  const dirMatch = /default\s+(?:wind\s+)?direction\s*=\s*([0-9.]+)/i.exec(details);
  if (speedMatch || dirMatch) {
    if (!defaults.wind) defaults.wind = { speed: 0, direction: 0 };
    if (speedMatch) defaults.wind.speed = parseFloat(speedMatch[1]);
    if (dirMatch) defaults.wind.direction = parseFloat(dirMatch[1]);
  }
}

function parsePerZoneDefault(defaults, details, patternRe, field) {
  const match = patternRe.exec(details);
  if (!match) return;
  const valuesStr = match[1];
  // Parse `"Plains" (zone 1), "Plains" (zone 2)` style.
  const zoneRe = /"([^"]+)"\s*\(zone\s+(\d+)\)/g;
  let m;
  while ((m = zoneRe.exec(valuesStr)) !== null) {
    const value = m[1];
    const zoneIdx = parseInt(m[2], 10) - 1; // zones are 1-indexed in the sheet
    while (defaults.zones.length <= zoneIdx) defaults.zones.push({});
    defaults.zones[zoneIdx][field] = value;
  }
}

// === Emission ===

function emitTabModule(parsed) {
  const idLit = isNaN(parseInt(parsed.id, 10)) ? `"${escapeDouble(parsed.id)}"` : `"${parsed.id}"`;
  const varName = `ruleSet${parsed.id.replace(/[^A-Za-z0-9]/g, "_")}`;
  return TS_HEADER +
    `import { RuleSet } from "../engine";\n` +
    `import { WildfireDefaults } from "../wildfire/types";\n\n` +
    `export const ${varName}: RuleSet<WildfireDefaults> = {\n` +
    `  id: ${idLit},\n` +
    `  categories: [\n` +
    parsed.categories.map(emitCategory).join(",\n") +
    `\n  ],\n` +
    `  factorVariables: [\n` +
    parsed.factorVariables.map(emitFactorVar).join(",\n") +
    `\n  ],\n` +
    `  defaults: ${emitDefaults(parsed.defaults)},\n` +
    `};\n`;
}

function emitCategory(cat) {
  const arrowLine = cat.arrowText !== undefined ? `      arrowText: ${tsString(cat.arrowText)},\n` : "";
  return (
    `    {\n` +
    `      id: ${cat.id},\n` +
    `      studentAction: ${tsString(cat.studentAction)},\n` +
    `      feedback: ${tsString(cat.feedback)},\n` +
    `      visualFeedback: ${tsString(cat.visualFeedback)},\n` +
    arrowLine +
    `      expression: ${tsString(cat.expression)},\n` +
    `    }`
  );
}

function emitFactorVar(def) {
  return (
    `    {\n` +
    `      name: ${tsString(def.name)},\n` +
    `      definition: ${tsString(def.definition)},\n` +
    `      logEvents: [${def.logEvents.map(tsString).join(", ")}],\n` +
    `      details: ${tsString(def.details)},\n` +
    `    }`
  );
}

function emitDefaults(defaults) {
  return JSON.stringify(defaults, null, 2).replace(/\n/g, "\n  ");
}

function emitIndex(tabIds) {
  const imports = tabIds.map((id) => `import { ruleSet${id.replace(/[^A-Za-z0-9]/g, "_")} } from "./${id}";`).join("\n");
  const entries = tabIds.map((id) => `  "${id}": ruleSet${id.replace(/[^A-Za-z0-9]/g, "_")},`).join("\n");
  return TS_HEADER +
    `import { RuleSet } from "../engine";\n` +
    `import { WildfireDefaults } from "../wildfire/types";\n` +
    (imports ? `${imports}\n\n` : "\n") +
    `export const ruleSets: Record<string, RuleSet<WildfireDefaults>> = {\n` +
    `${entries}\n` +
    `};\n`;
}

function readmeToMarkdown(rows) {
  // README is a list of paragraphs in the first column.
  return rows.map((row) => String(row[0] ?? "")).join("\n\n") + "\n";
}

// === TS string escaping ===

// Default to double-quoted; switch to template literal only for multi-line content.
function tsString(s) {
  if (typeof s !== "string") s = String(s);
  if (s.includes("\n")) {
    // Template literal — escape backticks and ${
    return "`" + s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${") + "`";
  }
  return `"${escapeDouble(s)}"`;
}

function escapeDouble(s) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

module.exports = {
  extractFromSheets,
  EXCLUDED_TABS,
  // Exported for tests:
  parseTab,
  emitTabModule,
  emitIndex,
  tsString,
};
