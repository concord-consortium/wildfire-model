// Build-time tour-text generation logic (WM-17), factored out of
// generate-hazbot-tour-data.js so unit tests can call it with synthetic inputs.
//
// Parses each *coaching* category's `arrowText` (a category with a non-empty
// `arrowText`; this excludes Category 1 and the success/celebratory categories)
// into clean per-step text + a done-button label, validates the authoring
// invariants, and serializes the result to the committed TS artifact
// `src/hazbot/wildfire/tour-data.generated.ts`. It does NOT touch the rule-set
// modules, the extractor's emission, or the `Category` type (sidesteps WM-18).
//
// Mirrors the established pure-impl + thin-runner + impl-test convention
// (playbook-impl.js + generate-hazbot-validation-playbook.js + playbook-impl.test.js).

const GENERATED_HEADER =
  "// AUTO-GENERATED — DO NOT EDIT — re-run scripts/generate-hazbot-tour-data.js\n";

// --- arrowText shape regexes (verified against the committed rule-sets) ------
const DONE_RE = /^\[([^\]]+)\]$/;            // the trailing "[Got it!]" token line
const STEP_RE = /^\s*(\d+)\.\s*/;            // leading ordinal "<n>. "
const HAZBOT_RE = /^Hazbot:\s*/i;            // optional speaker prefix (a few lines omit it)
const STEPNUM_RE = /\s*\(Step\s+(\d+)\s+of\s+(\d+)\)\s*$/i; // trailing "(Step n of N)"
const VF_STEP_RE = /^\s*\d+\.\s/;            // numbered visualFeedback line
const VF_SUBBULLET_RE = /^\s*-\s/;           // "- If …" conditional sub-bullet (excluded)

// Parse one category's `arrowText` into { stepCount, doneLabel, steps }.
// Uses ctx.fail to accumulate hard errors (never throws here, so one pass
// surfaces every authoring mistake) and tolerates the accumulated nulls.
function parseArrowText(arrowText, ctx) {
  const lines = arrowText.split("\n").map(l => l.trimEnd()).filter(l => l.trim() !== "");
  const last = lines.length ? lines[lines.length - 1].trim() : "";
  const done = last.match(DONE_RE);
  if (!done) ctx.fail(`arrowText does not end in a [Done] token (got ${JSON.stringify(last)})`);
  if (done && done[1].trim() !== "Got it!") {
    ctx.fail(`arrowText done token is [${done[1].trim()}], expected [Got it!]`);
  }
  const stepLines = done ? lines.slice(0, -1) : lines;
  let declaredTotal = null;
  const steps = stepLines.map((raw, i) => {
    const ord = raw.match(STEP_RE);
    if (!ord) {
      ctx.fail(`step line ${i + 1} missing leading ordinal: ${JSON.stringify(raw)}`);
    } else if (Number(ord[1]) !== i + 1) {
      // The leading "<n>." and the trailing "(Step n of N)" redundantly encode the step
      // number; validate the leading ordinal against position too (the (Step n of N) form
      // is checked below), so authoring drift in either is caught at build time.
      ctx.fail(`step line ${i + 1} has leading ordinal ${ord[1]} — out of sequence: ${JSON.stringify(raw)}`);
    }
    let t = raw.replace(STEP_RE, "");
    const m = t.match(STEPNUM_RE);
    if (!m) ctx.fail(`step line ${i + 1} missing "(Step n of N)": ${JSON.stringify(raw)}`);
    const n = m && Number(m[1]);
    const total = m && Number(m[2]);
    if (m) {
      if (n !== i + 1) ctx.fail(`step ${i + 1} numbered "(Step ${n} …)" — out of order`);
      if (declaredTotal === null) declaredTotal = total;
      else if (declaredTotal !== total) ctx.fail(`inconsistent "(… of N)": ${declaredTotal} vs ${total}`);
    }
    t = t.replace(STEPNUM_RE, "").replace(HAZBOT_RE, "").trim();
    return { text: t };
  });
  if (declaredTotal !== null && steps.length !== declaredTotal) {
    ctx.fail(`${steps.length} step lines but "(… of ${declaredTotal})"`);
  }
  return { stepCount: steps.length, doneLabel: done ? done[1].trim() : "Got it!", steps };
}

// Count the numbered (`<n>. …`) lines in a `visualFeedback` block, excluding
// "- If …" conditional sub-bullets. Used only for the (warning-level) vF/arrowText
// step-count cross-check.
function countNumberedVfLines(visualFeedback) {
  if (!visualFeedback) return 0;
  return visualFeedback
    .split("\n")
    .filter(l => VF_STEP_RE.test(l) && !VF_SUBBULLET_RE.test(l))
    .length;
}

// Build the parsed tour data for every coaching category across all rule sets.
// Returns { tourData, artifactSource, warnings }. Throws an aggregated Error if
// any hard authoring invariant is violated (so the runner aborts the write and
// exits non-zero). `warn` defaults to console.warn.
function buildTourData(ruleSets, options = {}) {
  const warn = options.warn || ((msg) => console.warn(msg));
  const errors = [];
  const warnings = [];
  const tourData = {};

  // Iterate rule sets in numeric id order for a stable artifact.
  const ruleSetIds = Object.keys(ruleSets).sort((a, b) => Number(a) - Number(b));
  for (const id of ruleSetIds) {
    const ruleSet = ruleSets[id];
    for (const cat of ruleSet.categories) {
      const ctx = {
        fail: (msg) => errors.push(`[ruleSet ${id} / category ${cat.id}] ${msg}`),
      };
      const hasArrowText = typeof cat.arrowText === "string" && cat.arrowText.trim() !== "";
      const vfNumberedCount = countNumberedVfLines(cat.visualFeedback);

      if (!hasArrowText) {
        // A non-coaching category. Warn only if it has *numbered* visualFeedback
        // lines (an under-authored coaching category); success/celebratory
        // categories carry prose visualFeedback with no numbered lines, so they
        // do not false-flag.
        if (vfNumberedCount > 0) {
          const w = `[ruleSet ${id} / category ${cat.id}] has ${vfNumberedCount} numbered visualFeedback line(s) but no arrowText`;
          warnings.push(w);
          warn(w);
        }
        continue;
      }

      const parsed = parseArrowText(cat.arrowText, ctx);
      if (!tourData[id]) tourData[id] = {};
      tourData[id][cat.id] = parsed;

      // vF numbered-line count vs arrowText step count: warn (not error). Ruleset
      // 34/2,34/3 legitimately carry an extra "0. Arrow pointing to the Intensity
      // scale" cue, so vF has one more numbered line than arrowText has steps.
      if (vfNumberedCount > 0 && vfNumberedCount !== parsed.stepCount) {
        const w = `[ruleSet ${id} / category ${cat.id}] visualFeedback has ${vfNumberedCount} numbered line(s) but arrowText has ${parsed.stepCount} step(s)`;
        warnings.push(w);
        warn(w);
      }
    }
  }

  if (errors.length) {
    throw new Error(`Tour-data generation failed:\n${errors.join("\n")}`);
  }

  return { tourData, artifactSource: renderArtifact(tourData), warnings };
}

// Serialize the parsed tour data to the committed TS artifact source. Uses bare
// numeric category keys (matching the rest of the codebase's hand-authored style)
// and JSON.stringify for each string so escaping is correct.
function renderArtifact(tourData) {
  const lines = [];
  lines.push(GENERATED_HEADER.trimEnd());
  // Step text carries markdown bold (**…**) extracted from the sheet; a long
  // bolded line can exceed the 160-col max-len. This file is generated, so the
  // content isn't hand-wrapped — silence max-len (re-enabled at end-of-file to
  // satisfy eslint-comments/disable-enable-pair).
  lines.push("/* eslint-disable max-len */");
  lines.push("");
  lines.push("export interface TourStepText { text: string; }");
  lines.push("export interface TourData { stepCount: number; doneLabel: string; steps: TourStepText[]; }");
  lines.push("");
  lines.push("/** Parsed per-step tour text keyed by ruleSetId (string) then categoryId (number). */");
  lines.push("export const tourData: Record<string, Record<number, TourData>> = {");

  const ruleSetIds = Object.keys(tourData).sort((a, b) => Number(a) - Number(b));
  for (const id of ruleSetIds) {
    lines.push(`  ${JSON.stringify(id)}: {`);
    const catIds = Object.keys(tourData[id]).map(Number).sort((a, b) => a - b);
    for (const catId of catIds) {
      const data = tourData[id][catId];
      lines.push(`    ${catId}: { stepCount: ${data.stepCount}, doneLabel: ${JSON.stringify(data.doneLabel)}, steps: [`);
      for (const step of data.steps) {
        lines.push(`      { text: ${JSON.stringify(step.text)} },`);
      }
      lines.push(`    ] },`);
    }
    lines.push(`  },`);
  }

  lines.push("};");
  lines.push("/* eslint-enable max-len */");
  lines.push("");
  return lines.join("\n");
}

module.exports = {
  buildTourData,
  parseArrowText,
  countNumberedVfLines,
  renderArtifact,
  GENERATED_HEADER,
};
