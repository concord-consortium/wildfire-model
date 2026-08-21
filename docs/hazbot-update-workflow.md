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

> **Note: the committed rule-set modules are a clean regenerate, so `git diff` is the sheet diff (WM-51).**
> This reverses an earlier caveat. WM-27 removed the per-rule-set `defaults` field, and until WM-18 reconciled the modules a re-extract mixed real sheet changes with unrelated drift. WM-18 landed and did the reconciliation, and re-extracting the workbook the committed modules came from now reproduces all eleven rule-set modules, `index.ts` and `dsl-grammar.md` byte-for-byte (verified 2026-08-20 against `Wildfire Hazbot Feedback Tables-2026-06-21-v2.xlsx`). Run the extractor in place and read step 2's diff directly; there is no need to compare temp extractions against each other.

> **Note — text bolding in the sheet is dropped on extraction (candidate WM-18 enhancement).**
> The Feedback Tables sheet bolds key words in `feedback` / `arrowText` (e.g. **Restart**, **Setup**, **Next**, **Wind Direction**, **Scroll up!**) — verified ~127 bold runs across ~65 strings in the `2026-06-19` export. The extractor reads cell **values** via `read-excel-file` (`readXlsxFile(inputPath, { getSheets: true })`, [extract-hazbot-sheets.js](../scripts/extract-hazbot-sheets.js)), which does **not** expose rich-text run formatting, so the committed rule-set modules carry **no** markdown bold. To preserve it, change the read path to one that surfaces runs — e.g. `exceljs` (`cell.value.richText: [{ font: { bold }, text }]`) or a direct `xl/sharedStrings.xml` parse — and emit each bold run as `**…**`. The rendering side is already markdown-bold-ready: `parseFeedback` leaves `**…**` intact and the coachmarks popover renders it, so once the extractor emits bold it shows in both the WM-16 intro popover and the WM-17 tour steps with no renderer change. WM-17 cannot source this itself: its tour-data generator reads the already-stripped committed modules. (Watch for a mid-word artifact in the sheet — one run is bolded as `**Wind Directio**n`; normalize or fix at source.)

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

### A `details` or `definition` cell changed (the silent one)

**Run this every time. It is the only failure mode in this document that no test, no
playbook and no browser walk will surface.**

Every factor-variable and sim-prop impl is hand-written, and its contract lives in the
sheet's `Details` prose. A `Details` edit therefore changes what a rule *means* while
regenerating nothing: the expression is untouched, the module diff looks editorial, the
suite stays green, and the impl silently no longer matches the sheet. WM-51 shipped
exactly this and it reached PR review: tab 23's `CorrectZoneSetup` contract was
broadened at source, the impl still encoded the old one, and every newly-allowed zone
setup would have held students at the "your setup is wrong" category.

Diff every contract cell against the base branch:

```sh
python3 - <<'EOF'
import re, subprocess
TABS = ["23","24","25","32","33","34","35","42","45","47","54"]
def rows(src):
    out, cur = {}, None
    for line in src.split("\n"):
        t = line.strip()
        m = re.match(r'name: "([^"]+)",', t)
        if m: cur = m.group(1); out[cur] = {}; continue
        if cur:
            for k in ("definition", "details"):
                mm = re.match(rf'{k}: (.*?),?$', t)
                if mm: out[cur][k] = mm.group(1).rstrip(",")
    return out
for tab in TABS:
    p = f"src/hazbot/rule-sets/{tab}.ts"
    old = rows(subprocess.run(["git","show",f"origin/master:{p}"],capture_output=True,text=True).stdout)
    new = rows(open(p).read())
    for name in sorted(set(old) | set(new)):
        o, n = old.get(name), new.get(name)
        if o is None: print(f"tab {tab}  {name}: ADDED")
        elif n is None: print(f"tab {tab}  {name}: REMOVED")
        else:
            for k in ("definition", "details"):
                if o.get(k) != n.get(k): print(f"tab {tab}  {name}: {k} CHANGED")
EOF
```

For every row it reports, open the impl in `src/hazbot/wildfire/sim-props.ts` or
`factor-variables.ts` and read it against the new prose.

Extend the same reading to the `studentAction` cell of every category whose expression
changed. It is never read by the engine, so it cannot break a student, but per Sam
(2026-08-20) a `studentAction` that has drifted out of sync with its expression "means
that the logic has deviated from the intended StudentAction due to having to plug in
logical gaps". Treat a mismatch as evidence that an expression was bent to close a gap,
and check that the gap was closed the way the author intended, rather than only
correcting the prose. Most changes are editorial;
the ones that are not are the whole reason for this step. An `ADDED` row means a tab
started referencing an impl it did not before, so check that tab's wording matches the
wording the impl was written against, which is not guaranteed to be identical across tabs.

**Validate the sweep before you trust a clean result.** A naive regex over
`details: "..."` does not survive the escaped quotes these cells contain. The first
version of this script under-reported and missed the very row that had just caused a
bug. Before believing an empty report, confirm the script reports a change you already
know about, or an under-reporting sweep will hand you false confidence in the one place
this process has already failed.

**Why the usual validation cannot cover this.** Both the coverage sweep and the
per-category browser walk test *reachability*: does some state match this category. A
contract that narrows relative to its new definition still leaves every category
reachable, because the old fixtures generally remain valid, so both passes stay green.
Reachability and contract-fidelity are different properties and only this step checks
the second.

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

## 6a. Re-generate the Hazbot tour data (WM-17)

```sh
npm run generate-hazbot-tour-data
```

This re-parses every coaching category's `arrowText` (split into steps, strip the `Hazbot:` prefix and the `(Step n of N)` suffix, extract the `[Got it!]` done label) and rewrites `src/hazbot/wildfire/tour-data.generated.ts` — the build-time artifact the visual-feedback tour renderer consumes. It reads the committed rule-set modules (not the xlsx), so run it whenever any `arrowText` changes. The generator **errors** (non-zero exit, no write) on an authoring mistake — a tour not ending in `[Got it!]`, a missing/out-of-order `(Step n of N)`, or a step-count vs `N` mismatch — and **warns** on a numbered-`visualFeedback`/`arrowText` step-count mismatch (e.g. ruleset 34's extra `0.` intensity-scale cue) or a numbered-`visualFeedback` category with no `arrowText`. Note: when an `arrowText` anchor or step is added/removed, also update the hand-authored anchor map `src/hazbot/wildfire/tour-map.tsx` so its step count stays in sync (the `tour-map.test.ts` invariants enforce this). **Re-read `visualFeedback` on every changed category too, not only the ones whose step count moved.** A category can keep its step count and still retarget a coach mark, and when the sheet swaps targets between two categories nothing catches it: the step counts agree, both testids are canonical, and the `tourData` key set is unchanged, so every `tour-map.test.ts` invariant passes while the map points each tour at the other one's control. WM-51 hit exactly this on tab 35, where categories 3 and 4 exchanged their terminal step between the Setup panel and the Setup panel's Next button. Only a browser walk or a manual read of `visualFeedback` against the map will see it.

## 7. Bump APP_RULES_VERSION

Increment `src/hazbot/wildfire/rules-version.ts`:

```ts
export const APP_RULES_VERSION = 2; // was 1
```

Bump per Req 20's policy:
- **Editorial-only edits** (typo fixes in feedback text, no semantic change): no bump required.
- **Semantic changes** (new categories, new factor variables, expression structure changes, defaults-value changes that affect matching): bump.
- **Evaluation-semantics changes** (a change in how the existing expressions are evaluated, such as the windowed `category.current` that selects the student-facing feedback): bump. The sheet is untouched but the category a given session resolves to changes, which is exactly what the version marks. Bump in the commit that changes the semantics, not in a later docs commit: the repo deploys per-branch builds, so a mid-branch state is reachable, and a session logged from one would otherwise be indistinguishable from a session under the previous version's rules.

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
- [ ] Regenerated `src/hazbot/wildfire/tour-data.generated.ts` if any `arrowText` changed (`npm run generate-hazbot-tour-data`).
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
