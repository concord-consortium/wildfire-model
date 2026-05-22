#!/usr/bin/env node

// Generates per-rule-set validation playbooks under docs/hazbot-validation/.
// Walks each loadable rule-set's parsed AST and emits a nested-bullet markdown
// checklist that mirrors the AND/OR/NOT/WITH structure (per AC: validation-
// playbook generator emits per-tab markdown checklists).

// ts-node/register lets `require()` resolve .ts files via in-memory TS compilation
// (per spec EXT-6 / DEV-1 — ts-node is already a project devDep). Lets this .js
// script import the substrate parser and the generated rule-set modules.
require("ts-node/register");

const path = require("path");
const fs = require("fs");
const { renderPlaybook } = require("./playbook-impl");
const { ruleSets } = require("../src/hazbot/rule-sets");
const { parse } = require("../src/hazbot/engine/parser");

const outputDir = path.resolve(__dirname, "../docs/hazbot-validation");
fs.mkdirSync(outputDir, { recursive: true });

let count = 0;
for (const [id, ruleSet] of Object.entries(ruleSets)) {
  const md = renderPlaybook(ruleSet, parse);
  const outPath = path.join(outputDir, `${id}.md`);
  fs.writeFileSync(outPath, md);
  console.log(`Wrote ${outPath}`);
  count++;
}
console.log(`Wrote ${count} playbook(s).`);
