# Hazbot Update Workflow

This doc walks through the round-trip when Sam edits the Hazbot Feedback Tables sheet — the rule sets that drive the analysis engine. Use it when categories or expressions change in an existing tab, or when a new factor variable / sim-prop is referenced.

## Prerequisites

- The source-of-truth Google Sheet: **Wildfire Hazbot Feedback Tables**. Contact Sam (or whoever owns the activity revisions) for the link if you don't have it.
- Local Node + npm setup matching `package.json`'s engines field.
- Export workflow: in Google Sheets, **File → Download → Microsoft Excel (.xlsx)**. Save anywhere (typically `~/Downloads/`).

## 1. Re-extract rule sets

Run the extraction script against the freshly-downloaded `.xlsx`:

```sh
node scripts/extract-hazbot-sheets.js "/path/to/Wildfire Hazbot Feedback Tables.xlsx"
```

This regenerates:
- `src/hazbot/rule-sets/{23,24,25,32,33,34,35}.ts` — per-tab `RuleSet<WildfireDefaults>` modules.
- `src/hazbot/rule-sets/index.ts` — aggregating `ruleSets` barrel.
- `src/hazbot/dsl-grammar.md` — README-tab dump (DSL grammar reference).

Each generated file starts with `// AUTO-GENERATED — DO NOT EDIT — re-run scripts/extract-hazbot-sheets.js`. Manual edits will be overwritten on the next run; PR review should flag any.

> **Note — the committed rule-set modules are intentionally not a clean regenerate (WM-27).**
> WM-27 removed the per-rule-set `defaults` field by a surgical hand-edit, leaving every other line of `src/hazbot/rule-sets/*.ts` at its older-spreadsheet revision. Regenerating the modules before WM-18 lands will reintroduce unrelated `details`/wording drift from the newer spreadsheet. WM-18 owns reconciling the modules with a clean regenerate; until then, avoid committing a full re-extract of the rule-set modules.

## 2. Inspect the generated diff

```sh
git diff src/hazbot/rule-sets/ src/hazbot/dsl-grammar.md
```

What to expect under two common scenarios:

### Categories or expressions changed

You may need new factor-variable or sim-prop impls. The engine load fails with `missing-impl` errors — see step 4's recipes.

### `dsl-grammar.md` changed

The DSL grammar may have evolved at source. The hand-written parser at `src/hazbot/engine/parser/` does NOT auto-update. Treat any `dsl-grammar.md` change as a flag to verify the parser still implements the documented grammar. Common cases:

- Editorial change (typo / formatting): no parser action needed.
- New operator / token: extend `src/hazbot/engine/parser/tokenize.ts` + `parse.ts` + add parser tests.
- New WITH semantic: review `parsePropExpression` in `parse.ts`.

## 3. Run tests

```sh
npm test
```

The test suite covers:
- Engine substrate (parser, evaluator, listener API, etc.)
- Per-rule-set five-shape sweep for each loadable tab (23, 24, 25 today).
- Bridge-side sidebar test against `ruleSets["23"]`.

If a previously-blocked tab is now loadable, **add a new per-rule-set test file** — see step 5.

## 4. Respond to load failures

If `npm test` surfaces engine load failures (the new rule set fails to construct cleanly), use these recipes:

### `missing-impl` error

A category expression references a factor variable or sim-prop name with no matching impl.

- **Hand-author the impl** in `src/hazbot/wildfire/factor-variables.ts` (lowercase identifier) or `src/hazbot/wildfire/sim-props.ts` (UpperCamelCase identifier).
- A `set*`-style impl receives the config-derived defaults as the `compute()` / `evaluate()` `defaults` parameter — there is no declaration to add (WM-27 removed `requiredDefaults`).
- Set `isStub: true` ONLY if the impl genuinely can't be implemented yet (e.g., requires authoring a new algorithm). Stubs return their `defaultValue` and emit a `stub-warning` at load.
- Add unit tests in the corresponding `*.test.ts` file.

### `parse-error` error

A category's expression has malformed DSL syntax.

- **Most common cause**: typo in the sheet (e.g., `SparksAtTopBottom` for `SparksAtTopAndBottom`).
- **Fix at source** in the Google Sheet, re-export, re-extract.
- If the syntax is intentional but new, the parser may need extending — see step 2's grammar-changed recipe.

### Sheet typos

Per Tech Notes "Sheet typos and inconsistent naming," the engine refuses to silently accept unknown identifiers. Fix typos at source rather than papering over them in the parser.

## 5. Add per-rule-set test files for newly-loadable tabs

When a previously-TBD tab loads cleanly for the first time, create a test file in the same shape as the existing 23/24/25 tests:

```ts
// src/hazbot/rule-sets/<id>.test.ts
import { ruleSet<id> } from "./<id>";
import { makeWildfireEngine, matchAgainst, mkReading } from "./test-helpers";
import { WildfireReading } from "../wildfire/types";

describe("ruleSet <id> — per-rule-set five-shape sweep", () => {
  it("(a) ...", () => { /* state matching no useful category */ });
  it("(b) ...", () => { /* state matching exactly one */ });
  it("(c) ...", () => { /* multi-true with highest selected */ });
  it("(d) ...", () => { /* monotonicity sequence */ });
  it("(e) ...", () => { /* stub-gated category unreachable, if applicable */ });
});
```

The five shapes are the AC contract — see the spec section "AC: per-rule-set five-shape sweep" in [requirements.md](../specs/WM-10-hazbot-analysis-engine/requirements.md).

## 6. Re-generate validation playbooks

```sh
node scripts/generate-hazbot-validation-playbook.js
```

This regenerates `docs/hazbot-validation/<id>.md` for every rule set (loadable or not). Commit the updated docs alongside the rule-set changes.

## 7. Bump APP_RULES_VERSION

Increment `src/hazbot/wildfire/rules-version.ts`:

```ts
export const APP_RULES_VERSION = 2; // was 1
```

Bump per Req 20's policy:
- **Editorial-only edits** (typo fixes in feedback text, no semantic change): no bump required.
- **Semantic changes** (new categories, new factor variables, expression structure changes, defaults-value changes that affect matching): bump.

The new version surfaces in the `AnalysisEngineActivated` log payload (see [LOGGED-EVENTS.md](../LOGGED-EVENTS.md#hazbot)) so dataset consumers can correlate session data with the rule-set version it was evaluated against.

## 8. Smoke-check in-app

```sh
npm start
```

Open `?hazbotRules=<newly-loadable-id>&hazbotSidebar=true` in a browser and confirm:

- The Hazbot sidebar renders without a load-error banner.
- The matched-category logic looks right as you click through the activity.
- Stub-warnings (if any) appear in the Errors panel — expected when the rule set references stubbed impls.

## 9. PR checklist

Group these in one PR:

- [ ] Regenerated `src/hazbot/rule-sets/*.ts` modules + `index.ts`.
- [ ] Updated `src/hazbot/dsl-grammar.md` (if README changed).
- [ ] New / updated factor-variable + sim-prop impls in `src/hazbot/wildfire/`.
- [ ] New per-rule-set test files for newly-loadable tabs.
- [ ] Regenerated `docs/hazbot-validation/*.md` playbook docs.
- [ ] `APP_RULES_VERSION` bumped (if semantic change).
- [ ] All tests pass (`npm test`).
- [ ] Lint passes (`npm run lint`).
- [ ] Smoke-checked in browser.
- [ ] PR description summarizes the rule-set change at a high level (which tabs, what semantically changed).

## When things go wrong

- **Extraction script fails or skips tabs**: the sheet headers may have changed. Inspect the column-matchers in `scripts/extract-impl.js` (`mapRuleColumnIndices`, `mapFactorVarColumnIndices`) and extend the patterns. Add a fixture test in `scripts/extract-impl.test.js`.
- **Tests pass but sidebar shows wrong matched category**: the `factor-variables.ts` impl logic may not match what the sheet's Details prose describes. Cross-reference the impl against the factor-variable Definition column.

## Reference

- [Spec — requirements.md](../specs/WM-10-hazbot-analysis-engine/requirements.md)
- [Spec — implementation.md](../specs/WM-10-hazbot-analysis-engine/implementation.md)
- [LOGGED-EVENTS.md — Hazbot section](../LOGGED-EVENTS.md#hazbot)
- [Substrate API surface](../src/hazbot/engine/index.ts)
- [Wildfire bridge entry points](../src/hazbot/wildfire/index.ts)
