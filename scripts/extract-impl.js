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
  let repeatFeedback;
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
    if (id >= 100) {
      // The feedback-mechanism row is kept as rule-set data in its own slot, never as a
      // category: its expression cannot parse, and one unparseable category takes the
      // whole rule-set to zero readings.
      const repeat = normalizeFeedback(String(row[colIdx.feedback] ?? ""));
      // This string is displayed (level 2 on every tab's top category), so it gets the
      // same token check the Round columns get. No default token: the
      // `Hazbot: …\n[Token]` convention already exists for this cell on all 11 tabs, so a
      // blank here is an authoring error to surface rather than an absence to fill in.
      warnOnUnknownToken(sheetName, id, "Repeat feedback", repeat);
      repeatFeedback = {
        id,
        studentAction: String(row[colIdx.studentAction] ?? ""),
        feedback: repeat,
      };
      continue;
    }

    const feedback = normalizeFeedback(String(row[colIdx.feedback] ?? ""));
    const cat = {
      id,
      studentAction: String(row[colIdx.studentAction] ?? ""),
      feedback,
      visualFeedback: String(row[colIdx.visualFeedback] ?? ""),
      expression: String(row[colIdx.expression] ?? "").trim(),
    };
    // The Round cells are authored as bare sentences, so they are normalized into the
    // same shape column C uses. The default token is level-aware: a tokenless Round 2
    // cell on a coaching category re-offers the walk-through, everything else is terminal.
    const level1Token = parseActionToken(feedback);
    const coaching = level1Token.toLowerCase() === "show me";
    if (colIdx.round2 !== undefined) {
      const r2 = normalizeFeedback(String(row[colIdx.round2] ?? ""), coaching ? level1Token : "Okay");
      if (r2) {
        warnOnUnknownToken(sheetName, id, "Round 2", r2);
        cat.feedbackRound2 = r2;
      }
    }
    if (colIdx.round3 !== undefined) {
      const r3 = normalizeFeedback(String(row[colIdx.round3] ?? ""), "Okay");
      if (r3) {
        warnOnUnknownToken(sheetName, id, "Round 3", r3);
        cat.feedbackRound3 = r3;
      }
    }
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

  return { id: sheetName, categories, factorVariables, repeatFeedback };
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
  const round2Idx = findCol("notes for round 2", "round 2");
  const round3Idx = findCol("notes for round 3", "round 3");
  return {
    id: findCol("category", "#"),
    studentAction: findCol("student action"),
    // "Feedback to Student" matches modern headers; "Hazbot Feedback" matches earlier drafts.
    feedback: findCol("feedback to student", "hazbot feedback", "feedback"),
    visualFeedback: findCol("visual feedback"),
    arrowText: arrowIdx >= 0 ? arrowIdx : undefined,
    // Columns G / H, "Notes for Round 2" / "Notes for Round 3". Present on 7 of the 11
    // tabs; undefined where the tab carries no such column, the same optional-column
    // shape arrowText uses.
    round2: round2Idx >= 0 ? round2Idx : undefined,
    round3: round3Idx >= 0 ? round3Idx : undefined,
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

// The authored action tokens. A Round 2/3 cell carrying anything else is warned about at
// extraction, since the token decides whether a level re-offers the coach-mark
// walk-through and a near-miss would ship silently.
const AUTHORED_TOKENS = ["show me", "okay", "hooray!", "got it!"];

// The trailing bracket token, read with the same regex parseFeedback uses at render
// (hazbot-button.tsx). Returns "" when the string carries none.
function parseActionToken(s) {
  const m = String(s).match(/\[([^\]]+)\]\s*$/);
  return m ? m[1].trim() : "";
}

// Normalize a feedback cell into the `Hazbot: <text>\n[Token]` shape the renderer parses.
// Four jobs, all no-ops on the committed column C content: strip a stray leading double
// quote, collapse accidental "Hazbot: Hazbot: …" prefixes, prepend the prefix when the
// cell lacks it, and append `defaultToken` when the cell carries no token. `defaultToken`
// is omitted for column C and for the feedback-mechanism row, so a missing token there is
// left alone rather than invented.
function normalizeFeedback(s, defaultToken) {
  let text = String(s ?? "").trim();
  // Strip the stray leading quote ONLY when the cell holds an odd number of quotes, i.e.
  // the leading one is unterminated. A cell that opens with a legitimate quoted phrase
  // keeps it: that is how this sheet names activity sections.
  if ((text.match(/"/g) || []).length % 2 === 1) text = text.replace(/^\s*"\s*/, "");
  if (!text) return "";
  text = text.replace(/^(?:Hazbot:\s*){2,}/, "Hazbot: ");
  if (!/^Hazbot:/i.test(text)) text = `Hazbot: ${text}`;
  if (defaultToken && !parseActionToken(text)) text = `${text}\n[${defaultToken}]`;
  return text;
}

function warnOnUnknownToken(sheetName, id, columnLabel, text) {
  const token = parseActionToken(text);
  if (token && !AUTHORED_TOKENS.includes(token.toLowerCase())) {
    console.warn(
      `[extract] tab ${sheetName} category ${id}: ${columnLabel} action token ` +
      `"[${token}]" is outside the authored set (${AUTHORED_TOKENS.join(", ")}). ` +
      `Only "[Show me]" re-offers the coach-mark walk-through.`,
    );
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
    emitRepeatFeedback(parsed.repeatFeedback) +
    `};\n`;
}

function emitCategory(cat) {
  const arrowLine = cat.arrowText !== undefined ? `      arrowText: ${tsString(cat.arrowText)},\n` : "";
  const round2Line = cat.feedbackRound2 !== undefined ? `      feedbackRound2: ${tsString(cat.feedbackRound2)},\n` : "";
  const round3Line = cat.feedbackRound3 !== undefined ? `      feedbackRound3: ${tsString(cat.feedbackRound3)},\n` : "";
  return (
    `    {\n` +
    `      id: ${cat.id},\n` +
    `      studentAction: ${tsString(cat.studentAction)},\n` +
    `      feedback: ${tsString(cat.feedback)},\n` +
    round2Line +
    round3Line +
    `      visualFeedback: ${tsString(cat.visualFeedback)},\n` +
    arrowLine +
    `      expression: ${tsString(cat.expression)},\n` +
    `    }`
  );
}

function emitRepeatFeedback(rf) {
  if (!rf) return "";
  return (
    `  repeatFeedback: {\n` +
    `    id: ${rf.id},\n` +
    `    studentAction: ${tsString(rf.studentAction)},\n` +
    `    feedback: ${tsString(rf.feedback)},\n` +
    `  },\n`
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
  normalizeFeedback,
  parseActionToken,
};
