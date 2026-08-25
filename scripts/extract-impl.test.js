const path = require("path");
const fs = require("fs");
const os = require("os");
const { extractFromSheets, parseTab, tsString, normalizeFeedback, parseActionToken, EXCLUDED_TABS } = require("./extract-impl");
// ts-node/register lets `require()` resolve .ts files via in-memory TS compilation
// (per spec EXT-6 / DEV-1 — ts-node is already a project devDep). Compile errors
// surface as `require()` throws, so the tests still verify the generated TS compiles.
require("ts-node/register");

// Synthetic fixture: rows shaped like read-excel-file's output.
// A README, one loadable rule-set tab, an empty tab, and a populated excluded tab.
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
    // parseTab() returns null for this tab — it has no category block — so it lands
    // in skippedTabs whatever EXCLUDED_TABS holds.
    sheet: "43",
    data: [["empty"]],
  },
  {
    // Carries a full category block, so the ONLY thing keeping it out of the build is
    // its membership in EXCLUDED_TABS. Tab 55 is Act 5.5, a performance assessment page
    // that gets no Hazbot, and dropping it is a curriculum decision students can see.
    sheet: "55",
    data: [
      ["#", "Student Action", "Hazbot Feedback", "Visual Feedback", "Text to Go with Arrows", "Pseudocode for Rules", "Details"],
      [1, "Run a sim", "Excluded!", "Visual X", "Arrow text X", "ranSimulation", "details"],
      [""],
      ["Factor variable", "Definition", "Log events", "Details"],
      ["ranSimulation", "Whether sim was started", "SimulationStarted", "Default values = \"Plains\" (zone 1)"],
    ],
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

  // Guards the exclusion itself. Tab 43 cannot: it has no category block, so parseTab()
  // skips it whether or not EXCLUDED_TABS names it, leaving the branch that removes Act
  // 5.5's coaching with no coverage at all. Tab 55 is fully populated, so emptying
  // EXCLUDED_TABS fails all three assertions below.
  it("excludes a populated tab named in EXCLUDED_TABS", () => {
    const result = extractFromSheets(SYNTHETIC_SHEETS);
    expect(EXCLUDED_TABS).toContain("55");
    expect(result.skippedTabs).toContain("55");
    expect(result.tabs.map((t) => t.id)).not.toContain("55");
    expect(result.indexSource).not.toMatch(/ruleSet55/);
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
      id: 1, studentAction: "Run a sim", feedback: "Hazbot: Good start!",
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
  it("keeps a category row with id >= 100 out of categories", () => {
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
    .replace('import { RuleSet } from "../engine";', "interface RuleSet<TDefaults> { id: string; categories: any[]; factorVariables: any[]; repeatFeedback?: any; }")
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

describe("extract-impl: emitted-TS round trip for the Round 2/3 and repeat-feedback fields", () => {
  it("compiles a module carrying repeatFeedback and the two Round fields", () => {
    const sheets = [{
      sheet: "88",
      data: [
        ["#", "Student Action", "Hazbot Feedback", "Visual Feedback", "Notes for Round 2",
          "Notes for Round 3", "Pseudocode for Rules"],
        [2, "Ran it", "Hazbot: Coach me!\n[Show me]", "V", "Look again.", "\"Out of ideas!", "ranSimulation"],
        [3, "Nice", "Hazbot: Nice!\n[Hooray!]", "V", "", "", "ranSimulation"],
        [100, "Re-clicked", "Hazbot: Keep going!\n[Got it!]", "", "", "", "-- no pseudo code --"],
        [""],
        ["Factor variable", "Definition", "Log events", "Details"],
        ["ranSimulation", "X", "SimulationStarted", ""],
      ],
    }];
    const result = extractFromSheets(sheets);
    const compiled = compileAndLoad(result.tabs[0].tsSource, "88.ts");
    expect(compiled.ruleSet88.repeatFeedback).toEqual({
      id: 100, studentAction: "Re-clicked", feedback: "Hazbot: Keep going!\n[Got it!]",
    });
    expect(compiled.ruleSet88.categories[0].feedbackRound2).toBe("Hazbot: Look again.\n[Show me]");
    expect(compiled.ruleSet88.categories[0].feedbackRound3).toBe("Hazbot: Out of ideas!\n[Okay]");
    expect(compiled.ruleSet88.categories[1]).not.toHaveProperty("feedbackRound2");
  });
});

describe("normalizeFeedback — the Round-cell fixups (WM-46)", () => {
  it("is a no-op on a well-formed column C cell", () => {
    expect(normalizeFeedback("Hazbot: Try this!\n[Show me]")).toBe("Hazbot: Try this!\n[Show me]");
  });
  it("still collapses a doubled Hazbot: prefix", () => {
    expect(normalizeFeedback("Hazbot: Hazbot: Try this!")).toBe("Hazbot: Try this!");
  });
  it("prepends the prefix when the cell lacks it", () => {
    expect(normalizeFeedback("Go up and look again.", "Okay"))
      .toBe("Hazbot: Go up and look again.\n[Okay]");
  });
  it("strips an unterminated leading double quote", () => {
    expect(normalizeFeedback('"I am out of ideas!', "Okay"))
      .toBe("Hazbot: I am out of ideas!\n[Okay]");
  });
  it("keeps a leading quote that opens a balanced quoted phrase", () => {
    expect(normalizeFeedback('"Drought Investigation" is the section you want.', "Okay"))
      .toBe('Hazbot: "Drought Investigation" is the section you want.\n[Okay]');
  });
  it("leaves an authored token alone rather than appending the default", () => {
    expect(normalizeFeedback("Look again.\n[Hooray!]", "Okay"))
      .toBe("Hazbot: Look again.\n[Hooray!]");
  });
  it("appends no token when no default is supplied (column C path)", () => {
    expect(normalizeFeedback("Hazbot: Look again.")).toBe("Hazbot: Look again.");
  });
  it("returns empty for an empty cell rather than a bare prefix", () => {
    expect(normalizeFeedback("", "Okay")).toBe("");
  });
});

describe("parseActionToken", () => {
  it("reads the trailing bracket token, trimmed", () => {
    expect(parseActionToken("Hazbot: Try this!\n[ Show me ]")).toBe("Show me");
  });
  it("tolerates trailing whitespace after the token", () => {
    expect(parseActionToken("Hazbot: Try this!\n[Okay]  \n")).toBe("Okay");
  });
  it("returns empty when the string carries no token", () => {
    expect(parseActionToken("Hazbot: Try this!")).toBe("");
  });
  // Only a token at the END counts: a bracketed phrase mid-sentence is prose.
  it("ignores a bracketed phrase that is not at the end", () => {
    expect(parseActionToken("Hazbot: Press [Start] and then run it.")).toBe("");
  });
});

describe("parseTab — the Round 2/3 columns (WM-46)", () => {
  const sheet = (round2, round3) => ([
    ["#", "Student Action", "Hazbot Feedback", "Visual Feedback", "Notes for Round 2",
      "Notes for Round 3", "Pseudocode for Rules"],
    [2, "Ran it", "Coach me!\n[Show me]", "", round2, round3, "ranSimulation"],
    [3, "Ran it", "Nice!\n[Hooray!]", "", round2, round3, "ranSimulation"],
  ]);

  it("defaults a tokenless Round 2 cell to [Show me] on a coaching category", () => {
    const parsed = parseTab("xx", sheet("Look again.", "Out of ideas!"));
    expect(parsed.categories[0].feedbackRound2).toBe("Hazbot: Look again.\n[Show me]");
  });
  it("defaults a tokenless Round 2 cell to [Okay] on a non-coaching category", () => {
    const parsed = parseTab("xx", sheet("Look again.", "Out of ideas!"));
    expect(parsed.categories[1].feedbackRound2).toBe("Hazbot: Look again.\n[Okay]");
  });
  it("always defaults Round 3 to [Okay], even on a coaching category", () => {
    const parsed = parseTab("xx", sheet("Look again.", "Out of ideas!"));
    expect(parsed.categories[0].feedbackRound3).toBe("Hazbot: Out of ideas!\n[Okay]");
  });
  it("omits the fields entirely on a tab with no Round columns", () => {
    const parsed = parseTab("xx", [
      ["#", "Student Action", "Hazbot Feedback", "Visual Feedback", "Pseudocode for Rules"],
      [2, "Ran it", "Coach me!\n[Show me]", "", "ranSimulation"],
    ]);
    expect(parsed.categories[0]).not.toHaveProperty("feedbackRound2");
    expect(parsed.categories[0]).not.toHaveProperty("feedbackRound3");
  });
  // Columns present, cell blank: a different branch from the one above, and the most
  // executed of the new ones. Dropping the guard fails quietly, since `""` is falsy at
  // every consumer; the only symptom is `feedbackRound2: ""` noise in the re-extract diff.
  it("omits the fields for a blank cell when the columns exist", () => {
    const parsed = parseTab("xx", sheet("", ""));
    expect(parsed.categories[0]).not.toHaveProperty("feedbackRound2");
    expect(parsed.categories[0]).not.toHaveProperty("feedbackRound3");
    const populated = parseTab("xx", sheet("Look again.", "Out of ideas!"));
    expect(populated.categories[0].feedbackRound2).toBe("Hazbot: Look again.\n[Show me]");
  });
  it("warns on a Round token outside the authored set", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    parseTab("xx", sheet("Look again.\n[Show me how]", "Out of ideas!"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("outside the authored set"));
    warn.mockRestore();
  });
});

// Column C's token decides whether a coaching category offers its walk-through at all,
// and it carries no default to fall back on. Both failures below otherwise leave a
// valid-looking rule-set whose tour silently never opens.
describe("parseTab — the column C action token (WM-46)", () => {
  const sheet = (feedback) => [
    ["#", "Student Action", "Hazbot Feedback", "Visual Feedback", "Pseudocode for Rules"],
    [2, "Ran it", feedback, "", "ranSimulation"],
  ];
  it("warns on a token outside the authored set", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    parseTab("xx", sheet("Coach me!\n[Show me!]"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("outside the authored set"));
    warn.mockRestore();
  });
  it("warns on a cell that carries no token", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    parseTab("xx", sheet("Coach me!"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("carries no action token"));
    warn.mockRestore();
  });
  it("stays silent on an authored token", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    parseTab("xx", sheet("Coach me!\n[Show me]"));
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("parseTab — the category-100 row (WM-46)", () => {
  const sheet = [
    ["#", "Student Action", "Hazbot Feedback", "Visual Feedback", "Pseudocode for Rules"],
    [1, "Ran it", "Good!\n[Okay]", "", "ranSimulation"],
    [100, "Re-clicked Hazbot", "Answer the questions!\n[Got it!]", "", "-- no pseudo code --"],
  ];
  it("lands in the repeatFeedback slot", () => {
    expect(parseTab("xx", sheet).repeatFeedback).toEqual({
      id: 100,
      studentAction: "Re-clicked Hazbot",
      feedback: "Hazbot: Answer the questions!\n[Got it!]",
    });
  });
  it("leaves the slot undefined on a tab with no such row", () => {
    expect(parseTab("xx", [sheet[0], sheet[1]]).repeatFeedback).toBeUndefined();
  });
  // The row is level 2 on every tab's top category, so its token is checked like a Round
  // cell's. It is NOT defaulted: a blank stays blank and reaches the renderer, where the
  // button falls back to coachmarks' "Done", which is what the warning is for.
  it("warns on a repeat-feedback token outside the authored set", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    parseTab("xx", [sheet[0], sheet[1],
      [100, "Re-clicked Hazbot", "Answer them!\n[Got it]", "", "-- no pseudo code --"]]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("outside the authored set"));
    warn.mockRestore();
  });
  it("does not invent a token for a repeat-feedback cell that carries none, but warns", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const parsed = parseTab("xx", [sheet[0], sheet[1],
      [100, "Re-clicked Hazbot", "Answer them!", "", "-- no pseudo code --"]]);
    expect(parsed.repeatFeedback.feedback).toBe("Hazbot: Answer them!");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("carries no action token"));
    warn.mockRestore();
  });
});
