// Playbook generation logic, factored out of generate-hazbot-validation-playbook.js
// so unit tests can call it with synthetic inputs.

const PLAYBOOK_HEADER = "> **AUTO-GENERATED — DO NOT EDIT — re-run `scripts/generate-hazbot-validation-playbook.js`**\n\n";

// The same top-category rule the app's feedback selection and the dev sidebar use, rather
// than a third copy of it. Resolved through ts-node, which the generator registers before
// requiring this module, and through ts-jest in playbook-impl.test.js.
const { topCategoryId } = require("../src/hazbot/engine/top-category");

// Renders a per-rule-set validation playbook in markdown, using the substrate's
// parsed Expression AST + the rule-set's factor-variable definitions.
function renderPlaybook(ruleSet, parse) {
  const lines = [PLAYBOOK_HEADER];
  lines.push(`# Validation Playbook — Rule Set ${ruleSet.id}\n`);

  // Inline factor-variable definitions so reviewers see the prop notation
  // alongside leaf bullets (per Req 11 / Tech Notes "Event-data path notation").
  if (ruleSet.factorVariables.length > 0) {
    lines.push("## Factor Variables\n");
    for (const fv of ruleSet.factorVariables) {
      lines.push(`- **${fv.name}** — ${fv.definition || "(no definition)"}`);
      if (fv.details) lines.push(`  - Details: ${oneLine(fv.details)}`);
    }
    lines.push("");
  }

  lines.push("## Categories\n");
  for (const cat of ruleSet.categories) {
    lines.push(`### Category ${cat.id}: ${oneLine(cat.studentAction)}\n`);
    if (cat.feedback) lines.push(`- **Feedback**: ${oneLine(cat.feedback)}`);
    // The level 2 / level 3 strings a repeat click shows, omitted where the tab carries no
    // Round columns. On the top category those columns are unreachable whatever the
    // rule-set carries, matching the selection rule's unconditional early return, so the
    // "not shown" label is gated on `top` ALONE; only the note naming the replacement is
    // gated on a repeat-feedback row existing.
    const top = cat.id === topCategoryId(ruleSet);
    const roundLabel = (n) => (top ? `level ${n}, not shown` : `level ${n}`);
    const roundNote = !top ? ""
      : ruleSet.repeatFeedback ? " (superseded by the repeat-click line below)"
        : " (a repeat click on the top category never reaches these, and this rule-set carries" +
          " no repeat feedback, so it repeats level 1)";
    if (cat.feedbackRound2) {
      lines.push(`- **Feedback (${roundLabel(2)})**: ${oneLine(cat.feedbackRound2)}${roundNote}`);
    }
    if (cat.feedbackRound3) {
      lines.push(`- **Feedback (${roundLabel(3)})**: ${oneLine(cat.feedbackRound3)}${roundNote}`);
    }
    if (top && ruleSet.repeatFeedback) {
      lines.push(
        `- **Feedback (repeat click after success)**: ${oneLine(ruleSet.repeatFeedback.feedback)}` +
        ` (from the sheet's category ${ruleSet.repeatFeedback.id} row, which replaces any` +
        ` Round 2/3 content on this category)`,
      );
    }
    lines.push(`- **Expression**: \`${cat.expression}\``);
    lines.push("- **Logical breakdown**:");
    let ast;
    try {
      ast = parse(cat.expression);
    } catch (err) {
      lines.push(`  - PARSE ERROR: ${err.message || String(err)}`);
      lines.push("");
      continue;
    }
    renderNode(ast, lines, "  ");
    lines.push("");
  }
  return lines.join("\n");
}

// Recursive AST → bullet renderer. AND becomes "ALL of:", OR becomes "ANY of:",
// NOT prefixes its child, leaves are rendered as `<varName>` or comparisons.
function renderNode(node, lines, indent) {
  switch (node.kind) {
    case "and":
      lines.push(`${indent}- ALL of:`);
      renderNode(node.left, lines, indent + "  ");
      renderNode(node.right, lines, indent + "  ");
      break;
    case "or":
      lines.push(`${indent}- ANY of:`);
      renderNode(node.left, lines, indent + "  ");
      renderNode(node.right, lines, indent + "  ");
      break;
    case "not":
      lines.push(`${indent}- NOT:`);
      renderNode(node.child, lines, indent + "  ");
      break;
    case "boolean-leaf":
      lines.push(`${indent}- \`${node.name}\` is true`);
      break;
    case "comparison": {
      const lhs = node.lhs.kind === "literal" ? String(node.lhs.value) : `${node.lhs.name}${node.lhs.accessor}`;
      const rhs = node.rhs.kind === "literal" ? String(node.rhs.value) : `${node.rhs.name}${node.rhs.accessor}`;
      lines.push(`${indent}- \`${lhs} ${node.op} ${rhs}\``);
      break;
    }
    case "with":
      lines.push(`${indent}- exists a \`${node.varName}\` reading where:`);
      renderNode(node.propExpr, lines, indent + "  ");
      break;
    case "sim-prop-leaf":
      lines.push(`${indent}- sim-prop \`${node.name}\` is true`);
      break;
    case "accessor":
    case "literal":
      // Should only appear inside `comparison`; defensive fallback.
      lines.push(`${indent}- \`${node.kind === "literal" ? node.value : node.name + node.accessor}\``);
      break;
    default:
      lines.push(`${indent}- (unknown node ${node.kind})`);
  }
}

function oneLine(s) {
  return String(s).replace(/\s+/g, " ").trim();
}

module.exports = { renderPlaybook, PLAYBOOK_HEADER };
