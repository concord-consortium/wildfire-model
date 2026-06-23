// Surfaces rich-text BOLD runs from an .xlsx so the extraction pipeline can emit
// them as markdown `**…**`. `read-excel-file` (used by extract-hazbot-sheets.js)
// exposes only flattened cell *values* and drops run formatting, so the Feedback
// Tables sheet's bolded key words (**Restart**, **Setup**, **Wind Direction**, …)
// would otherwise be lost. See docs/hazbot-update-workflow.md, "text bolding".
//
// xlsx stores each distinct string once in xl/sharedStrings.xml. A bolded cell
// references a `<si>` made of `<r>` runs, each with its own `<rPr>` (run props);
// `<b/>`/`<b val="1"/>` marks a bold run, `<b val="0"/>` an explicit non-bold one.
// We parse those into a Map keyed by the run-concatenated PLAIN text → the markdown
// rendering. Because shared strings are deduped, a cell whose value equals a key is
// exactly a bolded cell, so the extractor can swap by content without needing cell
// coordinates (which the row-filtering in extract-hazbot-sheets.js would misalign).
//
// Dependency-free beyond `fflate` (already pulled in transitively by
// read-excel-file) — matching the repo's "no new deps" convention (see dump-xlsx.js).

const fs = require("fs");
// fflate is a direct dependency of read-excel-file (which the extraction scripts
// already require directly), so it is always present whenever this script can run.
// Use it transitively rather than churn package.json/package-lock for a dev-only tool.
// eslint-disable-next-line import/no-extraneous-dependencies
const { unzipSync } = require("fflate");

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&"); // ampersand last so entity names above aren't re-decoded
}

// A run is bold unless it explicitly opts out (`<b val="0"/>`) or has no `<b>` at all.
function runIsBold(rPr) {
  if (!rPr) return false;
  const m = rPr.match(/<b(?:\s+val="([^"]*)")?\s*\/?>/);
  if (!m) return false;
  const val = m[1];
  return val === undefined || val === "1" || val === "true";
}

function runText(rXml) {
  const m = rXml.match(/<t[^>]*>([\s\S]*?)<\/t>/);
  return m ? decodeEntities(m[1]) : "";
}

// [{bold, text}] → markdown. Merge consecutive same-boldness runs, then wrap each
// bold segment in `**…**` with any surrounding whitespace moved OUTSIDE the markers
// (`** text **` is not valid CommonMark emphasis; `**text**` is). An all-whitespace
// bold segment emits its whitespace bare.
function runsToMarkdown(runs) {
  const merged = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && last.bold === r.bold) last.text += r.text;
    else merged.push({ bold: r.bold, text: r.text });
  }
  let out = "";
  for (const seg of merged) {
    if (!seg.bold) { out += seg.text; continue; }
    const lead = seg.text.match(/^\s*/)[0];
    const trail = seg.text.match(/\s*$/)[0];
    const core = seg.text.slice(lead.length, seg.text.length - trail.length);
    out += core ? lead + "**" + core + "**" + trail : seg.text;
  }
  return out;
}

// Parse a sharedStrings.xml body into [{ plain, markdown }] (one per <si>, in order).
// <si> elements don't nest, so a non-greedy split is safe.
function parseSharedStrings(xml) {
  const siList = xml.match(/<si>[\s\S]*?<\/si>/g) || [];
  return siList.map((si) => {
    const runMatches = si.match(/<r>[\s\S]*?<\/r>/g);
    if (!runMatches) {
      // Plain <si><t>…</t></si> — no runs, no formatting.
      const m = si.match(/<t[^>]*>([\s\S]*?)<\/t>/);
      const plain = m ? decodeEntities(m[1]) : "";
      return { plain, markdown: plain };
    }
    const runs = runMatches.map((r) => {
      const rPr = (r.match(/<rPr>[\s\S]*?<\/rPr>/) || [])[0] || "";
      return { bold: runIsBold(rPr), text: runText(r) };
    });
    return { plain: runs.map((r) => r.text).join(""), markdown: runsToMarkdown(runs) };
  });
}

// Build Map<plainText, markdownText> for every shared string that actually carries
// bold (markdown differs from plain). Strings with no bold are omitted, so callers
// fall back to the read-excel-file value unchanged.
function buildBoldMap(xlsxPath) {
  const files = unzipSync(new Uint8Array(fs.readFileSync(xlsxPath)));
  const entry = files["xl/sharedStrings.xml"];
  const map = new Map();
  if (!entry) return map; // workbook with only inline strings — nothing to surface
  const xml = new TextDecoder("utf-8").decode(entry);
  for (const { plain, markdown } of parseSharedStrings(xml)) {
    if (markdown !== plain) map.set(plain, markdown);
  }
  return map;
}

module.exports = {
  buildBoldMap,
  parseSharedStrings,
  runsToMarkdown,
  runIsBold,
  decodeEntities,
};
