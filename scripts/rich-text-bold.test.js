const {
  parseSharedStrings,
  runsToMarkdown,
  runIsBold,
  decodeEntities,
} = require("./rich-text-bold");

// A bold run in xlsx is `<r><rPr>...<b/>...</rPr><t>text</t></r>`; an explicit
// non-bold run carries `<b val="0"/>` (or simply omits `<b>`).
const boldRun = (text, space) =>
  `<r><rPr><rFont val="Calibri"/><b/></rPr><t${space ? ' xml:space="preserve"' : ""}>${text}</t></r>`;
const plainRun = (text, space) =>
  `<r><rPr><rFont val="Calibri"/><b val="0"/></rPr><t${space ? ' xml:space="preserve"' : ""}>${text}</t></r>`;

describe("runIsBold", () => {
  it("treats <b/> and <b val=\"1\"/>/\"true\" as bold", () => {
    expect(runIsBold("<rPr><b/></rPr>")).toBe(true);
    expect(runIsBold('<rPr><b val="1"/></rPr>')).toBe(true);
    expect(runIsBold('<rPr><b val="true"/></rPr>')).toBe(true);
  });
  it("treats explicit <b val=\"0\"/> and absent <b> as not bold", () => {
    expect(runIsBold('<rPr><b val="0"/></rPr>')).toBe(false);
    expect(runIsBold("<rPr><rFont val=\"Calibri\"/></rPr>")).toBe(false);
    expect(runIsBold("")).toBe(false);
  });
});

describe("runsToMarkdown", () => {
  it("wraps a bold run in **…**", () => {
    expect(runsToMarkdown([
      { bold: false, text: "Click the " },
      { bold: true, text: "Setup" },
      { bold: false, text: " button." },
    ])).toBe("Click the **Setup** button.");
  });

  it("merges consecutive bold runs into one span", () => {
    expect(runsToMarkdown([
      { bold: true, text: "Wind " },
      { bold: true, text: "Direction" },
    ])).toBe("**Wind Direction**");
  });

  it("moves whitespace surrounding a bold run outside the markers", () => {
    // `** text **` is not valid CommonMark emphasis; whitespace must sit outside.
    expect(runsToMarkdown([
      { bold: true, text: "Hazbot: " },
      { bold: false, text: "Try this" },
    ])).toBe("**Hazbot:** Try this");
  });

  it("emits an all-whitespace bold run as bare whitespace (no empty **)", () => {
    expect(runsToMarkdown([
      { bold: false, text: "a" },
      { bold: true, text: "  " },
      { bold: false, text: "b" },
    ])).toBe("a  b");
  });
});

describe("decodeEntities", () => {
  it("decodes xml entities incl. numeric, ampersand last", () => {
    expect(decodeEntities("a &amp; b &lt;c&gt; &#x2019;x&#8217;")).toBe("a & b <c> ’x’");
  });
});

describe("parseSharedStrings", () => {
  it("returns plain text unchanged for a non-run <si>", () => {
    const xml = "<sst><si><t>plain value</t></si></sst>";
    expect(parseSharedStrings(xml)).toEqual([{ plain: "plain value", markdown: "plain value" }]);
  });

  it("builds markdown for a rich <si> and leaves plain as the concatenation", () => {
    const xml =
      "<sst><si>" +
      plainRun("Click the ", true) + boldRun("Setup") + plainRun(" button.", true) +
      "</si></sst>";
    expect(parseSharedStrings(xml)).toEqual([
      { plain: "Click the Setup button.", markdown: "Click the **Setup** button." },
    ]);
  });

  it("preserves embedded newlines so values match read-excel-file cell text", () => {
    const xml =
      "<sst><si>" +
      plainRun("Hazbot: First, ", true) + boldRun("Restart") + plainRun(" your model.\n[Got it!]", true) +
      "</si></sst>";
    const [entry] = parseSharedStrings(xml);
    expect(entry.plain).toBe("Hazbot: First, Restart your model.\n[Got it!]");
    expect(entry.markdown).toBe("Hazbot: First, **Restart** your model.\n[Got it!]");
  });
});
