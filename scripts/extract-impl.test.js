const path = require("path");
const fs = require("fs");
const os = require("os");
const { extractFromSheets, parseTab, tsString } = require("./extract-impl");
// ts-node/register lets `require()` resolve .ts files via in-memory TS compilation
// (per spec EXT-6 / DEV-1 — ts-node is already a project devDep). Compile errors
// surface as `require()` throws, so the tests still verify the generated TS compiles.
require("ts-node/register");

// Synthetic fixture: rows shaped like read-excel-file's output.
// One rule-set tab + a README + an empty/excluded tab.
const SYNTHETIC_SHEETS = [
  {
    sheet: "README",
    data: [
      ["Hazbot DSL Grammar"],
      [""],
      ["Operators: AND, OR, NOT, WITH"],
    ],
  },
  {
    sheet: "23",
    data: [
      ["#", "Student Action", "Hazbot Feedback", "Visual Feedback", "Text to Go with Arrows", "Pseudocode for Rules", "Details"],
      [1, "Run a sim", "Good start!", "Visual A", "Arrow text 1", "ranSimulation", "details for cat 1"],
      [2, "Vary drought", "Try this!", "Visual B", "", "setDroughtLevel AND ranSimulation", "details for cat 2"],
      [""],
      ["Factor variable", "Definition", "Log events", "Details"],
      ["ranSimulation", "Whether sim was started", "SimulationStarted", "Default values = \"Plains\" (zone 1), \"Plains\" (zone 2)"],
      ["setDroughtLevel", "Drought changed", "SimulationStarted", "Default drought = \"Mild\" (zone 1), \"Mild\" (zone 2)"],
    ],
  },
  {
    // No longer in EXCLUDED_TABS (WM-18 R1 emptied it). parseTab() returns null
    // for this tab — it has no category block — so it still lands in skippedTabs.
    sheet: "43",
    data: [["empty"]],
  },
];

describe("extractFromSheets", () => {
  it("emits one TS module per loadable tab + an index + dsl-grammar", () => {
    const result = extractFromSheets(SYNTHETIC_SHEETS);
    expect(result.tabs).toHaveLength(1);
    expect(result.tabs[0].id).toBe("23");
    expect(result.tabs[0].tsSource).toMatch(/AUTO-GENERATED/);
    expect(result.tabs[0].tsSource).toMatch(/export const ruleSet23/);
    // The generator no longer emits a `defaults` field (per WM-27 Requirement 10).
    expect(result.tabs[0].tsSource).not.toMatch(/defaults:/);
    expect(result.indexSource).toMatch(/AUTO-GENERATED/);
    expect(result.indexSource).toMatch(/"23": ruleSet23/);
    expect(result.dslGrammar).toMatch(/AUTO-GENERATED/);
    expect(result.skippedTabs).toContain("43");
  });
});

describe("parseTab — categories", () => {
  it("collapses duplicated 'Hazbot:' prefixes in feedback", () => {
    const sheet = [
      ["#", "Student Action", "Hazbot Feedback", "Visual Feedback", "Pseudocode for Rules"],
      [1, "Action", "Hazbot: Hazbot: try again", "Visual", "ranSimulation"],
    ];
    const parsed = parseTab("xx", sheet);
    expect(parsed.categories[0].feedback).toBe("Hazbot: try again");
  });

  it("extracts categories with arrowText when the column exists", () => {
    const parsed = parseTab("23", SYNTHETIC_SHEETS[1].data);
    expect(parsed.categories).toHaveLength(2);
    expect(parsed.categories[0]).toEqual({
      id: 1, studentAction: "Run a sim", feedback: "Good start!",
      visualFeedback: "Visual A", arrowText: "Arrow text 1", expression: "ranSimulation",
    });
    // arrowText absent when empty for the second category.
    expect(parsed.categories[1].arrowText).toBeUndefined();
  });

  it("returns null when the rule-row block isn't present", () => {
    const parsed = parseTab("xx", [["nothing here"]]);
    expect(parsed).toBeNull();
  });
});

describe("parseTab — feedback-mechanism (id >= 100) rows (R1a)", () => {
  it("drops a category row with id >= 100", () => {
    const sheet = [
      ["#", "Student Action", "Hazbot Feedback", "Visual Feedback", "Pseudocode for Rules"],
      [1, "Ran it", "Good!", "", "ranSimulation"],
      [100, "Re-clicked Hazbot", "Answer the questions!", "", "-- no pseudo code --\nfeedback mechanism"],
    ];
    const parsed = parseTab("xx", sheet);
    expect(parsed.categories).toHaveLength(1);
    expect(parsed.categories[0].id).toBe(1);
  });

  it("warns when a sim-use expression is mistakenly numbered >= 100", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    // id >= 100 but the cell carries real DSL (no -- no pseudo code -- marker).
    parseTab("xx", [
      ["#", "Student Action", "Hazbot Feedback", "Visual Feedback", "Pseudocode for Rules"],
      [100, "Ran it", "Good!", "", "ranSimulation"],
    ]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("disagree"));
    warn.mockRestore();
  });

  it("warns when a feedback row (-- no pseudo code --) is misnumbered below 100", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    // id < 100 but the cell IS a -- no pseudo code -- marker. The row is NOT
    // dropped (drop criterion is strictly id >= 100) — it is emitted as a
    // normal category; the warning is the safety net that flags the
    // misnumbering to the author.
    parseTab("xx", [
      ["#", "Student Action", "Hazbot Feedback", "Visual Feedback", "Pseudocode for Rules"],
      [99, "Re-clicked Hazbot", "Answer the questions!", "", "-- no pseudo code --\nfeedback mechanism"],
    ]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("disagree"));
    warn.mockRestore();
  });
});

describe("tsString — escape behavior", () => {
  it("quotes simple strings with double quotes", () => {
    expect(tsString("hello")).toBe('"hello"');
  });

  it("escapes embedded double quotes", () => {
    expect(tsString('he said "hi"')).toBe('"he said \\"hi\\""');
  });

  it("uses template literals for multi-line strings, escaping backticks and ${", () => {
    const s = "line one\nline `two` and ${stuff}";
    expect(tsString(s)).toBe("`line one\nline \\`two\\` and \\${stuff}`");
  });

  it("escapes backslashes", () => {
    expect(tsString("a\\b")).toBe('"a\\\\b"');
  });
});

function compileAndLoad(tsSource, fileName) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hazbot-extract-test-"));
  const tabPath = path.join(tmpDir, fileName);
  // Replace substrate-relative imports with inline stubs so the tmpdir
  // compile doesn't need the real substrate code on the resolution path.
  const stubbed = tsSource
    .replace('import { RuleSet } from "../engine";', "interface RuleSet<TDefaults> { id: string; categories: any[]; factorVariables: any[]; }")
    .replace('import { WildfireDefaults } from "../wildfire/types";', "type WildfireDefaults = any;");
  fs.writeFileSync(tabPath, stubbed);
  // ts-node/register handles compilation; require errors on TS compile failure.
  const compiled = require(tabPath);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  return compiled;
}

describe("extract-impl: round-trip via load-and-deep-equal (per QA-2)", () => {
  it("compiles the generated TS module and the loaded ruleSet matches the source rows", () => {
    const result = extractFromSheets(SYNTHETIC_SHEETS);
    const compiled = compileAndLoad(result.tabs[0].tsSource, "23.ts");
    expect(compiled.ruleSet23.id).toBe("23");
    expect(compiled.ruleSet23.categories).toHaveLength(2);
    expect(compiled.ruleSet23.categories[0].expression).toBe("ranSimulation");
    expect(compiled.ruleSet23.categories[1].expression).toBe("setDroughtLevel AND ranSimulation");
  });
});

describe("extract-impl: hostile-content escape coverage", () => {
  it("compiles a category whose feedback contains backtick / ${ / quote / newline", () => {
    const hostileSheets = [
      {
        sheet: "99",
        data: [
          ["#", "Student Action", "Hazbot Feedback", "Visual Feedback", "Pseudocode for Rules", "Details"],
          [1, "Action", "Has ` and ${injection} and \"quote\"\nand newline", "Visual", "ranSimulation", "details"],
          [""],
          ["Factor variable", "Definition", "Log events", "Details"],
          ["ranSimulation", "X", "SimulationStarted", ""],
        ],
      },
    ];
    const result = extractFromSheets(hostileSheets);
    const compiled = compileAndLoad(result.tabs[0].tsSource, "99.ts");
    expect(compiled.ruleSet99.categories[0].feedback).toContain("`");
    expect(compiled.ruleSet99.categories[0].feedback).toContain("${injection}"); // literal, not interpolated
    expect(compiled.ruleSet99.categories[0].feedback).toContain("\"quote\"");
    expect(compiled.ruleSet99.categories[0].feedback).toContain("\n");
  });
});
