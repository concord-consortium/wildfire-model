// Extraction logic, factored out of extract-hazbot-sheets.js so unit tests can call
// it with synthetic JSON-shaped row data without a real .xlsx file.

const TS_HEADER = "// AUTO-GENERATED — DO NOT EDIT — re-run scripts/extract-hazbot-sheets.js\n\n";
const MD_HEADER = "> **AUTO-GENERATED — DO NOT EDIT — re-run `scripts/extract-hazbot-sheets.js`**\n\n";
// All 11 rule-set tabs are now extracted (WM-18 R1). README / SIMINIT are
// auto-skipped — parseTab() returns null for any tab with no category block.
const EXCLUDED_TABS = [];

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

    // Per R1a / Q3: feedback-mechanism rows (README: category id >= 100) carry
    // no parseable DSL — their pseudocode cell is `-- no pseudo code --`. They
    // are dropped so a re-extract does not emit an unparseable `expression`
    // (which would fail the whole rule-set to load with a parse-error).
    const rawExpr = String(row[colIdx.expression] ?? "");
    const hasNoPseudoCodeMarker = /--\s*no pseudo code\s*--/i.test(rawExpr);
    // The id and the marker should agree; warn if not, so an authoring
    // misnumbering (a feedback row numbered < 100, or a sim-use row numbered
    // >= 100) surfaces at extraction rather than as a load crash or a silently
    // dropped category.
    if ((id >= 100) !== hasNoPseudoCodeMarker) {
      console.warn(
        `[extract] tab ${sheetName} category ${id}: category id ` +
        `(${id >= 100 ? ">= 100" : "< 100"}) and the "-- no pseudo code --" ` +
        `marker disagree — check the sheet's category numbering.`,
      );
    }
    if (id >= 100) continue;

    const cat = {
      id,
      studentAction: String(row[colIdx.studentAction] ?? ""),
      feedback: normalizeFeedback(String(row[colIdx.feedback] ?? "")),
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
  if (fvHeaderIdx > 0) {
    const fvHeader = rows[fvHeaderIdx];
    const fvColIdx = mapFactorVarColumnIndices(fvHeader);
    for (let i = fvHeaderIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      const rawName = String(row[fvColIdx.name] ?? "").trim();
      if (!rawName) continue;
      // Strip type-annotation suffix the sheet authors use to label non-boolean
      // factor variables, e.g. "uniqueWindValuesUsed (Set)" → "uniqueWindValuesUsed".
      // The DSL identifier is the bare name; the type annotation is informational.
      const name = rawName.replace(/\s*\([^)]*\)\s*$/, "");
      const def = {
        name,
        definition: String(row[fvColIdx.definition] ?? "").trim(),
        logEvents: parseLogEvents(String(row[fvColIdx.logEvents] ?? "")),
        details: String(row[fvColIdx.details] ?? ""),
      };
      factorVariables.push(def);
    }
  }

  return { id: sheetName, categories, factorVariables };
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
  // Tab 23 uses "Text to Go with Coach Marks" between visualFeedback and pseudocode;
  // earlier sheet revisions called this "Text to Go with Arrows". Match both.
  const arrowIdx = findCol("text to go with coach marks", "text to go with arrows", "coach marks");
  return {
    id: findCol("category", "#"),
    studentAction: findCol("student action"),
    // "Feedback to Student" matches modern headers; "Hazbot Feedback" matches earlier drafts.
    feedback: findCol("feedback to student", "hazbot feedback", "feedback"),
    visualFeedback: findCol("visual feedback"),
    arrowText: arrowIdx >= 0 ? arrowIdx : undefined,
    expression: findCol("pseudocode"),
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
    // "Log Data Events and Fields To Examine" (modern) → "log data events";
    // "Log events" (earlier drafts) → "log event"
    logEvents: findCol("log data event", "log event", "log data"),
    details: findCol("details"),
  };
}

function parseLogEvents(s) {
  return s.split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
}

// Collapse accidental "Hazbot: Hazbot: …" prefixes that crept into sheet content
// so they don't reach the user-facing feedback string.
function normalizeFeedback(s) {
  return s.replace(/^(?:Hazbot:\s*){2,}/, "Hazbot: ");
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
  // README is a two-column key/body layout: column 0 is a label or section
  // heading; column 1 is the body. We render labels that look like section
  // headings as `## Heading`, short markers (numerals / single letters) as
  // `**marker:**`, and pure-body rows as continuation paragraphs.
  const SECTION_RE = /^[A-Z][A-Za-z][A-Za-z ]*$/; // "Sources", "WITH", "Examples", "PRECEDENCE", etc.
  const lines = [];
  for (const row of rows) {
    const label = String(row[0] ?? "").trim();
    const body = String(row[1] ?? "").trim();
    if (!label && !body) continue;
    if (label && !body) {
      // Section heading — empty body means it's a header for the rows below.
      if (SECTION_RE.test(label)) {
        lines.push(`## ${label}`);
      } else {
        lines.push(label);
      }
    } else if (!label && body) {
      lines.push(body);
    } else {
      // Both present.
      if (SECTION_RE.test(label) && body.length > 80) {
        // Section heading + long body → render as heading + paragraph.
        lines.push(`## ${label}\n\n${body}`);
      } else {
        lines.push(`**${label}:** ${body}`);
      }
    }
  }
  return lines.join("\n\n") + "\n";
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
