# Implementation Plan: Hazbot level 2 and 3 feedback

**Jira**: https://concord-consortium.atlassian.net/browse/WM-46
**Requirements Spec**: [requirements.md](requirements.md)
**Status**: **Implemented** (all four steps committed on `WM-46-level-2-and-3-feedback`)

## How this plan was verified

Every step below was spiked end to end against the real workbook, the real test suite and the
running app before it was written down, then reverted. The measurements are quoted with each step.
What that established:

- The extraction step produces a **pure-addition** diff: 178 inserted lines across the 11 generated
  rule-sets, **zero** changed or removed lines on any tab, and an identical `dsl-grammar.md`.
- With the extraction and the type change in place, `npx tsc --noEmit` reports no new errors (the two
  pre-existing `line-chart.tsx` errors are unchanged), and every test under `src/hazbot` and `scripts`
  passes **except the one named below**: 642 of 643.
- The tour data comes back **unchanged** from its generator, as R9 requires, and so do the playbooks
  until the generator itself is taught the new fields (R9a), which is the point of that requirement.
- Driving the real `HazbotButton` through the ladder produces exactly the four sequences the
  requirements name, with the logged `feedbackLevel` and `source` in step with the string displayed.
- Walking the running app on tab 23 shows level 1, then level 2, then level 3, with the `[Show me]`
  button present on the first two and `Okay` on the third.

**Six** existing tests break, and each is updated in the step that causes it. **Three** in
`hazbot-button.test.tsx`, all in the walk-through block, all because R7e adds `feedbackLevel` to the
three tour events and those tests assert exact payload objects. **Two** in `app.test.tsx`, whose
barrel mock has to list the new export. And **one** in `scripts/extract-impl.test.js`:
`parseTab — categories › extracts categories with arrowText when the column exists` (`:69-73`) asserts
the whole category object with `toEqual`, and `normalizeFeedback`'s new prefix-prepend rewrites the
synthetic fixture's bare `"Good start!"` cell to `"Hazbot: Good start!"`. The "no-op on existing
content" measurement behind R1a is about the **workbook**; `SYNTHETIC_SHEETS` is a hand-written
fixture that does not follow the workbook's `Hazbot: … [Token]` convention, which is exactly why it
moves. Three other tests in that file survive only incidentally and should not be "corrected" later:
the doubled-prefix cell already carries the prefix, the hostile-content case asserts with `toContain`
(and its `"quote"` pair is an even number of quotes, so the strip stays off), and the `id >= 100`
cases assert ids only.

**Read those counts against a baseline that is not zero.** A bare `npx jest` on this working tree
reports **2 failed suites before any of this work is applied**, and they are not this branch's:
`tmp/wm46-probe/spike/ladder.test.js` and `tmp/wm46-spike/patched/app.test.tsx`, left behind by the
spikes that produced this plan's measurements. Jest's `testRegex` matches them and
`testPathIgnorePatterns` is only `/node_modules/` and `/cypress/` (`package.json`), so jest collects
them out of `tmp/` even though `tmp/` is gitignored. Both fail as "Test suite failed to run" (their
relative imports do not resolve from the copied location) and contribute **0 tests**, so the
*test* counts quoted throughout this document are unaffected: `Tests: 879 passed` at baseline, and
642 of 643 under `src/hazbot` and `scripts` after step 1. Only the *suite* count moves. CI never sees
either file. Deliberately left in place rather than deleted or ignored: the surrounding `tmp/wm46*`
directories hold the evidence base for these measurements, including Question 1's reversal diffs,
which is worth keeping until Sam answers. Scoping `testPathIgnorePatterns` to exclude `<rootDir>/tmp/`
would make the suite fully green (verified: 76 suites, 879 tests) but is a repo-config change outside
this branch, so it is noted and not taken.

Cross-referenced against the requirements: all 41 requirement IDs are either claimed by a step or
listed in the constraints section below; no step lacks a requirement to trace to; every step stays
under the ~500-line commit guideline; and no step depends on a later one (`ui.hazbotLastFeedbackShown`
is written in the Select step and not read until the Surface step, which is a field with no reader
rather than a broken build).

## Requirements this plan constrains rather than implements

Five requirements produce no work item, so no step claims them, and one further requirement (R9) has a
second half that is a prohibition rather than a deliverable. They are listed here with the
evidence that each holds in the spiked implementation, so a reviewer can tell "satisfied by
construction" from "forgotten".

- **R2a**, level 3 stays per-category sheet data rather than a code constant. `selectFeedback` reads
  `cat.feedbackRound3`; the string occurs 28 times across the 7 generated files and nowhere in source.
- **R7**, text only: no level is threaded into `buildTour`, whose call site stays
  `buildTour(ruleSetId, matched, ctx)`. **This is the one that invites a misreading**, since R4a's
  `offersTour` gate is new code that turns on the level's token. The two govern different things: R7
  governs the tour's *content*, which never varies by level, and R4a governs whether the existing tour
  is *offered*, which R7's own text explicitly allows ("R4a still gives an author per-level control
  over whether the existing walk-through is offered, without per-level anchor arrays"). A level 2 that
  re-offers the walk-through re-offers the *level-1* tour, unchanged.
- **R7b**, `HazbotButtonClicked` keeps its exact meaning, and its payload is untouched:
  `{ matchedCategory: best, categoryUsed: used, categoryCurrent: current }`.
- **R10**, no expression, factor variable or sim-prop changes. The whole diff contains no added or
  removed `expression:` line (the six matches are three structural-type removals in `sidebar.tsx` plus
  three context lines), and `factor-variables.ts`, `sim-props.ts` and `temporal-variables.ts` are not
  touched.
- **R9's replay-fixture half**, which is a prohibition rather than a work item:
  `src/hazbot/wildfire/__fixtures__` and `scripts/generate-replay-fixture.js` appear in no step's
  "Files affected" and the generator is
  **not** run on this branch (it writes `events.json` and `expected.json` into
  `src/hazbot/wildfire/__fixtures__`). The generator emits only `readings`, `observed`, `temporalValues` and the
  three category histories and never serializes the rule-set, so R2's two `Category` fields and R4b's
  `RuleSet` slot structurally cannot reach it; spiking that field shape onto ruleset 25, the tab the
  fixture replays, leaves `replay-fixture.test.ts` passing unregenerated, and regenerating produces a
  diff whose every changed line is a `sessionId` the test strips from both sides anyway
  (`replay-fixture.test.ts:29-32`). The fixture README sets a failure-driven policy and names its diff
  as the review surface for semantic drift, so regenerating gratuitously spends that surface on noise.
  **If the fixture does fail on this branch, do not regenerate it to make it pass**: suspect R4c leaking
  first. `deriveRangeCc(categoryExpressions(engine))` is the only path from category content into the
  fixture and R10 leaves every expression alone, so a failure means a category-100 row reached
  `categories`, which is the zero-readings failure R11b's corpus gate exists to catch.
- **R11** is the umbrella that R11a through R11i implement across the four steps.

## Implementation Plan

### Extract the Round 2/3 columns and the category-100 row

**Summary**: Teach the pipeline to read the two columns it ignores and to keep the feedback-mechanism
row it currently throws away, then regenerate. Nothing reads the new data yet, so this step changes
no behavior: it is the sheet reaching the code. Covers R1, R1a, R2, R4b's data half, R4c, R8b, R11a
and R11b, plus R9's tour-data check.

**Files affected**:
- `src/hazbot/engine/types.ts`: two optional `Category` fields and one optional `RuleSet` slot
- `src/hazbot/engine/top-category.ts`: new, the shared top-category rule (Open Question 2)
- `src/hazbot/engine/top-category.test.ts`: new, its own cases
- `src/hazbot/engine/index.ts`: export it from the barrel
- `src/hazbot/engine/version.ts`: `ENGINE_VERSION` `0.1.0` to `0.2.0` (R8b)
- `scripts/extract-impl.js`: column mapping, normalization, category-100 capture, emission
- `scripts/extract-impl.test.js`: the mechanism half of R11b, plus R11a
- `src/hazbot/rule-sets/*.ts`: regenerated (178 inserted lines, no other change)
- `src/hazbot/rule-sets/index.test.ts`: the corpus half of R11b

**Estimated diff size**: ~470 lines. Measured source: 302 (178 generated rule-sets, 101 extractor, 7
types, 14 the shared helper, 2 barrel and version). Test code, ~150 lines, is the estimated half
(`extract-impl.test.js`, `top-category.test.ts` and the corpus gate in `rule-sets/index.test.ts`).

The type change. Both `Category` fields and the `RuleSet` slot are optional, which is what makes this
additive rather than breaking: `RuleSet` is hand-constructed in 17 places across the substrate's own
tests and a required field would break every one.

```ts
// src/hazbot/engine/types.ts
export interface RuleSet<TDefaults = unknown> {
  id: string;                       // tab name, e.g. "23"
  categories: Category[];           // ordered lowest-to-highest by id
  factorVariables: FactorVariableDef[];
  // The sheet's category-100 row: the feedback shown on a repeat click after the
  // student has already reached the tab's top category (WM-46 R4b). Feedback-mechanism
  // data, never a matchable category, since its expression cannot parse. Optional, so
  // every hand-built RuleSet literal keeps compiling.
  repeatFeedback?: { id: number; studentAction: string; feedback: string };
}

export interface Category {
  id: number;
  studentAction: string;
  feedback: string;
  feedbackRound2?: string;          // sheet column G, "Notes for Round 2"
  feedbackRound3?: string;          // sheet column H, "Notes for Round 3"
  visualFeedback: string;
  arrowText?: string;
  expression: string;
}
```

The top-category rule ships here too, next to the type it reads, because three consumers need it and
they have to agree: the app's feedback selection (step 2), the dev sidebar and the playbook generator
(step 4). See Open Question 2 for why it is shared rather than derived three times.

```ts
// src/hazbot/engine/top-category.ts
import { RuleSet } from "./types";

// The rule-set's top category: the highest category id present. Hosts whose sheets number
// feedback-mechanism rows at or above 100 keep those out of `categories` entirely (they
// land in `repeatFeedback`), so "highest id" and "the success category" coincide.
//
// Shared rather than re-derived per consumer: the app's feedback-level selection, the dev
// sidebar and the validation-playbook generator all have to agree on which category this
// is, and if they ever disagree the docs describe the feature against a different category
// than the app implements it for.
export function topCategoryId(ruleSet: Pick<RuleSet, "categories"> | undefined): number | null {
  if (!ruleSet || ruleSet.categories.length === 0) return null;
  return ruleSet.categories.reduce((max, c) => (c.id > max ? c.id : max), ruleSet.categories[0].id);
}
```

with `export { topCategoryId } from "./top-category";` added to the substrate barrel, which is part
of what `ENGINE_VERSION 0.2.0` covers.

It gets its own test file rather than relying on the ladder and playbook tests that use it. Every
barrel-exported substrate module carrying logic has one (`engine`, `evaluator`, `temporal`, `version`,
`parser`, `react/use-analysis-engine`); the two that do not, `session-id.ts` and `runtime-type.ts`, are
substrate-internal. It also has cases the indirect tests cannot reach, because the committed corpus is
uniform: every tab is contiguous `1..N`.

```ts
// src/hazbot/engine/top-category.test.ts
describe("topCategoryId", () => {
  const cat = (id: number) => ({
    id, studentAction: "", feedback: "f", visualFeedback: "", expression: "x",
  });

  it("returns null for an undefined rule-set or an empty categories array", () => {
    expect(topCategoryId(undefined)).toBeNull();
    expect(topCategoryId({ categories: [] })).toBeNull();
  });

  it("returns the only id when there is one category", () => {
    expect(topCategoryId({ categories: [cat(3)] })).toBe(3);
  });

  // The rule is "highest id", not "last element": a future sheet that numbers categories
  // out of order must not silently move the success category.
  it("returns the maximum id, not the last element, on a non-contiguous set", () => {
    expect(topCategoryId({ categories: [cat(1), cat(7), cat(4)] })).toBe(7);
  });

  // Both call shapes in the codebase: feedback-levels.ts passes a whole RuleSet, the
  // sidebar passes the categories array it already has.
  it("accepts a full RuleSet and a bare { categories } alike", () => {
    const ruleSet: RuleSet = { id: "23", categories: [cat(1), cat(5)], factorVariables: [] };
    expect(topCategoryId(ruleSet)).toBe(topCategoryId({ categories: ruleSet.categories }));
  });
});
```

The column mapping gains the two optional columns, on the `arrowText` pattern (`undefined` where the
tab carries no such column):

```js
// scripts/extract-impl.js, mapRuleColumnIndices
  const arrowIdx = findCol("text to go with coach marks", "text to go with arrows", "coach marks");
  const round2Idx = findCol("notes for round 2", "round 2");
  const round3Idx = findCol("notes for round 3", "round 3");
  return {
    id: findCol("category", "#"),
    studentAction: findCol("student action"),
    feedback: findCol("feedback to student", "hazbot feedback", "feedback"),
    visualFeedback: findCol("visual feedback"),
    arrowText: arrowIdx >= 0 ? arrowIdx : undefined,
    // Columns G / H, "Notes for Round 2" / "Notes for Round 3" (WM-46 R1). Present on
    // 7 of the 11 tabs; undefined where the tab carries no such column, the same
    // optional-column shape arrowText uses.
    round2: round2Idx >= 0 ? round2Idx : undefined,
    round3: round3Idx >= 0 ? round3Idx : undefined,
    expression: findCol("pseudocode"),
  };
```

Normalization. `normalizeFeedback` gains a second parameter and three more jobs. The signature change
is forced by the level-aware default: the default token for a Round 2 cell depends on the category's
own level-1 token, so column C is normalized first and its token passed in.

```js
// scripts/extract-impl.js, replaces the current two-line normalizeFeedback

// The authored action tokens. A Round 2/3 cell carrying anything else is warned about at
// extraction (WM-46 R1a/R4a), since the token now decides whether a level re-offers the
// coach-mark walk-through and a near-miss would ship silently.
const AUTHORED_TOKENS = ["show me", "okay", "hooray!", "got it!"];

// The trailing bracket token, read with the same regex parseFeedback uses at render
// (hazbot-button.tsx). Returns "" when the string carries none.
function parseActionToken(s) {
  const m = String(s).match(/\[([^\]]+)\]\s*$/);
  return m ? m[1].trim() : "";
}

// Normalize a feedback cell into the `Hazbot: <text>\n[Token]` shape the renderer parses.
// Four jobs (WM-46 R1a), all measured no-ops on the committed column C content: strip a
// stray leading double quote (every Round 3 cell carries one), collapse accidental
// "Hazbot: Hazbot: …" prefixes, prepend the prefix when the cell lacks it, and append
// `defaultToken` when the cell carries no token. `defaultToken` is omitted for column C
// and for the feedback-mechanism row, so a missing token there is left alone rather than
// invented: the extractor supplies a token only where this spec invented the convention.
function normalizeFeedback(s, defaultToken) {
  let text = String(s ?? "").trim();
  // Strip the stray leading quote ONLY when the cell holds an odd number of quotes, i.e.
  // the leading one is unterminated. A cell that opens with a legitimate quoted phrase
  // keeps it: that is how this sheet names activity sections, and 12 of the 28 Round 2
  // cells already contain quotes, so an unconditional strip would eventually eat one.
  if ((text.match(/"/g) || []).length % 2 === 1) text = text.replace(/^\s*"\s*/, "");
  if (!text) return "";                                   // an empty cell stays empty
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
```

The empty-cell guard is load-bearing rather than defensive: without it a category with no feedback
would be emitted as the bare string `"Hazbot: "`, which the renderer would show as an empty popover.
It is pinned by a test below.

So is the odd-quote condition on the strip. All 28 Round 3 cells carry exactly one quote, so they are
still stripped (verified: re-running the extractor with this condition produces output **identical**
to the unconditional version, file for file). The condition is what protects the cell nobody has
written yet: 12 of the 28 Round 2 cells already contain quotes because the sheet names activity
sections that way (`Go up and look at the instructions under "Drought Investigation" again.`), so a
future cell that *opens* with such a name would otherwise ship to students with its opening quote
silently eaten, with nothing in the re-extract diff to distinguish that from an intended edit.

The category builder captures the category-100 row instead of dropping it, and normalizes the two
Round cells with the level-aware default. Note that the id-versus-marker warning above it is
untouched: it still runs for the category-100 row, immediately before the row is captured.

```js
// scripts/extract-impl.js, parseTab
  const categories = [];
  let repeatFeedback;
  for (let i = ruleHeaderIdx + 1; i < ruleEndIdx; i++) {
    // … id parsing and the existing id-versus-marker warning are unchanged …

    if (id >= 100) {
      // WM-46 R4b/R4c: the feedback-mechanism row is kept as rule-set data in its own
      // slot, never as a category. Its expression cannot parse, and one unparseable
      // category takes the whole rule-set to zero readings.
      const repeat = normalizeFeedback(String(row[colIdx.feedback] ?? ""));
      // This string is DISPLAYED: it is level 2 on every tab's top category, so it gets the
      // same token check the Round columns get. No default token, though — unlike the Round
      // columns, the `Hazbot: …\n[Token]` convention already exists for this cell and all 11
      // tabs follow it, so a blank here is an authoring error to surface rather than an
      // absence to fill in (R1a's boundary: the extractor supplies a token only where this
      // spec invented the convention). Left blank it would reach `doneBtnText: label ||
      // undefined` and the button would read coachmarks' default "Done" instead of the
      // authored "Got it!", on every tab, silently.
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
    // WM-46 R1a: the Round cells are authored as bare sentences, so they are normalized
    // into the same shape column C uses. The default token is level-aware: a tokenless
    // Round 2 cell on a coaching category re-offers the walk-through, everything else is
    // terminal.
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
    // … the existing arrowText block is unchanged …
    categories.push(cat);
  }

  return { id: sheetName, categories, factorVariables, repeatFeedback };
```

Emission. Two conditional lines inside `emitCategory` and one block after `factorVariables`:

```js
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

// in emitTabModule, between the factorVariables array and the closing brace:
    parsed.factorVariables.map(emitFactorVar).join(",\n") +
    `\n  ],\n` +
    emitRepeatFeedback(parsed.repeatFeedback) +
    `};\n`;
```

Export `normalizeFeedback` and `parseActionToken` from the module's test exports.

Then regenerate, per Technical Notes, and run the tour-data generator as a **check** in the same step
(R9). The playbook generator is deliberately not run until step 4, where it learns the new fields:

```sh
node scripts/extract-hazbot-sheets.js "/home/doug/Downloads/Wildfire Hazbot Feedback Tables (8).xlsx"
node scripts/generate-hazbot-tour-data.js   # must produce NO diff (R9)
```

A non-empty diff from the second command means the extraction perturbed `arrowText` or
`visualFeedback`, and it has to be understood before continuing rather than committed: R7 assumes tour
*content* is untouched, and R4a's claim to be behavior-preserving at level 1 rests on the tour and its
button label being exactly what they are today. The coupling is real rather than theoretical:
`tour-data-impl.js` derives each tour's `doneLabel` by parsing `arrowText` (`:64`) and strips a
`Hazbot:` prefix while doing so (`:20`), and this step changes the shared normalizer that prepends
that prefix. Measured on this change, the tour data does come back unchanged.

**Measured output of exactly this code.** Per-tab inserted lines, with zero changed or removed lines
anywhere: 23, 24, 25, 32, 33 add 22 each; 34 adds 18; 35 adds 26; 42, 45, 47 and 54 add 6 each (the
`repeatFeedback` block alone, since they carry no Round columns); `index.ts` is unchanged. No token
warning fires, which is the expected result of 0 of 56 cells carrying a token. Tab 23 category 2
comes out as:

```ts
      feedback: `Hazbot: Looks like you haven’t changed the **Setup** yet. I can help!
[Show me]`,
      feedbackRound2: `Hazbot: Go up and look at the instructions under "Drought Investigation" again.
[Show me]`,
      feedbackRound3: `Hazbot: I'm all out of ideas! Please ask your teacher or a classmate for help!
[Okay]`,
```

and tab 23's top category (5, `[Hooray!]`) gets `[Okay]` on both rounds, which is the level-aware
default taking its non-coaching branch. The stray leading quote is gone from all 28 Round 3 cells,
and the one `"Supression"` misspelling ships verbatim on tab 33, as Question 2 records.

Tests, `scripts/extract-impl.test.js`. `SYNTHETIC_SHEETS` is a hand-written fixture tab, so this file
proves the mechanism and nothing about the corpus (R11b).

**Two edits to what is already there, before the new cases.** First, the existing
`extracts categories with arrowText when the column exists` case (`:69-73`) expects
`feedback: "Good start!"` and has to become `feedback: "Hazbot: Good start!"`, because the synthetic
fixture's cells are bare sentences and the normalizer now prefixes them. Second, `compileAndLoad`
(`:141-153`) substitutes an inline stub for the substrate import, and that stub has no
`repeatFeedback`, so an emitted module carrying the slot fails TypeScript's excess-property check
(measured: `error TS2322 … 'repeatFeedback' does not exist in type 'RuleSet<any>'`). Widen it:

```js
.replace('import { RuleSet } from "../engine";',
  "interface RuleSet<TDefaults> { id: string; categories: any[]; factorVariables: any[]; repeatFeedback?: any; }")
```

That matters because `compileAndLoad` is the **only** gate on emitted TS in this repo (added per QA-2),
and it is what would catch a missing comma, a wrong nesting level, or a key emitted outside the object
literal. `parseTab` tests structurally cannot see any of that, and the corpus gate in
`rule-sets/index.test.ts` runs against whatever the last re-extract already wrote, so it cannot fail
before the emitter has produced the file. Since `emitRepeatFeedback` adds a **new nesting level** to
the generated module (a rule-set-level key beside `categories` and `factorVariables`), the round trip
gets its own case rather than riding on the existing one, whose fixture carries no category-100 row
and no Round columns:

```js
describe("extract-impl: emitted-TS round trip for the WM-46 fields", () => {
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
```

It is worth the eight lines beyond the compile check: it walks the odd-quote strip and the
level-aware default all the way through emission and back out of a loaded module, which no other case
in the file does. Measured with the widened stub, that file runs 14 passed, 0 failed.

The mechanism cases:

```js
describe("normalizeFeedback (WM-46 R1a)", () => {
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

describe("parseTab, Round 2/3 columns (WM-46 R1, R1a)", () => {
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
  // executed of the new ones. It runs on 12 categories across the 7 authored tabs
  // (category 1 on all seven, plus the blank celebration row on 25, 32, 33, 34 and 35).
  // Dropping the guard fails quietly: the ladder still behaves, because `""` is falsy at
  // every consumer, and the only symptom is `feedbackRound2: ""` noise in the re-extract
  // diff that Technical Notes treats as the sheet diff.
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

describe("parseTab, the category-100 row (WM-46 R4b, R4c)", () => {
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
  it("does NOT land in categories", () => {
    const parsed = parseTab("xx", sheet);
    expect(parsed.categories.map((c) => c.id)).toEqual([1]);
  });
  it("leaves the slot undefined on a tab with no such row", () => {
    expect(parseTab("xx", [sheet[0], sheet[1]]).repeatFeedback).toBeUndefined();
  });
  // The row is level 2 on every tab's top category, so its token is checked like a Round
  // cell's. It is NOT defaulted: a blank stays blank and reaches the renderer, where the
  // button falls back to coachmarks' "Done" — which is what the warning is for.
  it("warns on a repeat-feedback token outside the authored set", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    parseTab("xx", [sheet[0], sheet[1],
      [100, "Re-clicked Hazbot", "Answer them!\n[Got it]", "", "-- no pseudo code --"]]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("outside the authored set"));
    warn.mockRestore();
  });
  it("does not invent a token for a repeat-feedback cell that carries none", () => {
    const parsed = parseTab("xx", [sheet[0], sheet[1],
      [100, "Re-clicked Hazbot", "Answer them!", "", "-- no pseudo code --"]]);
    expect(parsed.repeatFeedback.feedback).toBe("Hazbot: Answer them!");
  });
});
```

Both directions in that last block matter separately: the current code satisfies "not in categories"
by dropping the row entirely, and this step is what stops doing that.

Tests, `src/hazbot/rule-sets/index.test.ts`, which already imports `ruleSets` and loops all 11 by
name. Placed here it is a re-extraction regression gate rather than a unit test, which is what R4c's
blast radius calls for: a category-100 leak takes the rule-set to zero readings, so this is the
difference between a red suite and an activity that silently records nothing.

```ts
describe("rule-sets/index, WM-46 feedback-mechanism data", () => {
  it("every committed rule-set carries a repeatFeedback slot", () => {
    for (const [id, rs] of Object.entries(ruleSets)) {
      expect(`${id}: ${rs.repeatFeedback?.id}`).toBe(`${id}: 100`);
      expect(rs.repeatFeedback?.feedback).toMatch(/^Hazbot: /);
    }
  });

  it("no committed categories array holds an id >= 100", () => {
    for (const [id, rs] of Object.entries(ruleSets)) {
      const over = rs.categories.filter((c) => c.id >= 100).map((c) => c.id);
      expect(`${id}: ${over.join(",")}`).toBe(`${id}: `);
    }
  });
});
```

`ENGINE_VERSION` goes to `0.2.0` in this step, because this is the step that changes the substrate's
public types. `version.test.ts` asserts only the semver shape, so it needs no edit.

---

### Select the feedback level at display time

**Summary**: The behavior change. A per-category level map in the UI store, a pure selection rule, the
level committed where the popover opens, the token gating the walk-through, and the new
`HazbotFeedbackShown` event. Covers R3, R3a, R3a-i, R4, R4a, R5, R6, R6a, R7a, R7c, R7d, R7e, R8,
R11c, R11d, R11e and R11g.

**Files affected**:
- `src/models/ui.ts`: the level map and the last-shown readout state
- `src/hazbot/wildfire/feedback-levels.ts`: new, the pure selection rule
- `src/hazbot/wildfire/index.ts`: export it
- `src/components/hazbot-button.tsx`: level-aware pick, token gate, commit at the open site
- `src/components/hazbot-button.test.tsx`: the ladder, plus three existing tour tests updated
- `src/hazbot/wildfire/feedback-levels.test.ts`: new, the selection rule in isolation
- `LOGGED-EVENTS.md`: the new event, the three amended payloads, and the two analyst notes (R7a, R7c)
- `src/hazbot/wildfire/rules-version.ts`: `APP_RULES_VERSION` 6 to 7 (R8)

**Estimated diff size**: ~260 lines. Measured source: 42. The bulk is test code (~190) plus the
`LOGGED-EVENTS.md` notes (~25) and the version bump.

The store. `UIModel` has no collection precedent, so the anchor is worth stating exactly: MobX
deep-converts the assigned `Map` into an `ObservableMap` (verified: `isObservableMap` true, and an
`observer` re-renders on `.set()`, on `.get(id)` reads, and on `.clear()`), and
`configure({ enforceActions: "never" })` means it is mutated without an `@action`, matching how
`ui.showHazbotFeedback` is already written.

```ts
// src/models/ui.ts
  // WM-46. Category id -> the highest feedback level shown for that category in this page
  // session. Nothing inside a run resets it: a category the student returns to resumes
  // where it left off rather than replaying level 1. Cleared wholesale by Clear All and by
  // window.test.resetHazbotFeedbackLevels().
  @observable public hazbotFeedbackLevels = new Map<number, number>();
  // The level and source last displayed, for the dev sidebar's readout only (R9b).
  @observable public hazbotLastFeedbackShown?: { level: number; source: string } = undefined;
```

The selection rule, new file. It is pure and takes the rule-set rather than the engine, so it is unit
testable without an engine and the sidebar could reuse `topCategoryId`:

```ts
// src/hazbot/wildfire/feedback-levels.ts
import { RuleSet, topCategoryId } from "../engine";
import { WildfireDefaults } from "./types";

// WM-46. Which of a category's up-to-three feedback strings a click shows, and where that
// string came from. `source` exists because the level alone cannot identify the string: on
// the top category level 2 is the rule-set's category-100 row rather than a Round 2 column,
// and the wording is expected to churn (R7d).
export type FeedbackSource = "level1" | "round2" | "round3" | "category100";

export interface FeedbackSelection {
  feedback: string;
  level: number;             // 1 | 2 | 3, capped at what exists for the category
  source: FeedbackSource;
}

// The ordered ladder of strings that exist for one category: level 1 is always the
// category's own feedback; level 2 and 3 come from the Round columns, except on the top
// category, where the whole tail is the rule-set's category-100 row and stops there (R4b).
function ladder(
  ruleSet: RuleSet<WildfireDefaults> | undefined,
  categoryId: number | null,
): { feedback: string; source: FeedbackSource }[] {
  const cat = ruleSet?.categories.find((c) => c.id === categoryId);
  if (!cat?.feedback) return [];
  const rungs: { feedback: string; source: FeedbackSource }[] = [
    { feedback: cat.feedback, source: "level1" },
  ];
  if (categoryId === topCategoryId(ruleSet)) {
    if (ruleSet?.repeatFeedback?.feedback) {
      rungs.push({ feedback: ruleSet.repeatFeedback.feedback, source: "category100" });
    }
    return rungs;
  }
  if (cat.feedbackRound2) rungs.push({ feedback: cat.feedbackRound2, source: "round2" });
  if (cat.feedbackRound3) rungs.push({ feedback: cat.feedbackRound3, source: "round3" });
  return rungs;
}

// Pick the string for the next press. `shownLevel` is the highest level already shown for
// this category in this page session (0 = never shown). The level never rises above the
// number of rungs that exist (R5's cap), so `level` and `source` always name the same
// string, and a category with no level 2 repeats level 1 rather than blanking or skipping
// to the global level 3 (R6, R6a).
export function selectFeedback(
  ruleSet: RuleSet<WildfireDefaults> | undefined,
  categoryId: number | null,
  shownLevel: number,
): FeedbackSelection | null {
  const rungs = ladder(ruleSet, categoryId);
  if (rungs.length === 0) return null;
  const level = Math.min(shownLevel + 1, rungs.length);
  return { feedback: rungs[level - 1].feedback, level, source: rungs[level - 1].source };
}
```

Note the early `return` in the top-category branch: it is what discards the fill-down Round 2/3 on
tabs 23 and 24, and it is what Question 1 would reverse. The reversal is contained but it is not the
one-line deletion it looks like: see the Q1 decision below for the working shape and why deleting the
early return on its own produces a four-rung ladder.

The button. Five edits, all inside the existing effect.

```diff
 import { CategorySelection, computeCategorySelectionForEngine, Engine } from "../hazbot/engine";
+import { selectFeedback } from "../hazbot/wildfire/feedback-levels";
```

```diff
     const { used: matched } = readCategories(engine);
     const ruleSetId = engine?.ruleSet?.id ?? null;
-    const feedback =
-      engine?.ruleSet?.categories.find((c) => c.id === matched)?.feedback ?? "";
+    // WM-46: which of the category's up-to-three strings this press shows. The level is
+    // READ here (the string it names drives parseFeedback / buildTour / the tour's done
+    // label below) but only COMMITTED when the popover actually opens: see openOnce.
+    const shownLevel = matched != null ? (ui.hazbotFeedbackLevels.get(matched) ?? 0) : 0;
+    const selected = selectFeedback(engine?.ruleSet, matched, shownLevel);
+    const feedback = selected?.feedback ?? "";
     if (!feedback) {
```

```diff
     const { body, label } = parseFeedback(feedback);
+    // WM-46 R4a: the level's own action token decides whether it re-offers the
+    // walk-through, so an author can say "this level coaches again" by typing [Show me]
+    // into the cell. Behavior-preserving at level 1: the 34 categories buildTour returns
+    // a tour for are exactly the 34 whose level-1 token is [Show me].
+    const offersTour = label.trim().toLowerCase() === "show me";
```

```diff
           // Launch the tour ONLY on a real Show-me activation (not ×/Escape, not cleanup).
-          if (phase === "intro" && !introCancelled && !cleanup && tour) {
+          if (phase === "intro" && !introCancelled && !cleanup && tour && offersTour) {
```

```diff
     const openOnce = () => {
       if (opened) return; // whichever trigger fires first wins; the other no-ops
       opened = true;
+      // Commit the level HERE, not at the top of the effect: the effect body also runs
+      // for presses that never open a popover (teardown inside this 400ms window, or a
+      // category with no feedback), and a level spent on nothing shown is the same defect
+      // a click-site counter has (WM-46 R3a, R3a-i).
+      if (matched != null && selected) {
+        ui.hazbotFeedbackLevels.set(matched, selected.level);
+        ui.hazbotLastFeedbackShown = { level: selected.level, source: selected.source };
+        log("HazbotFeedbackShown", {
+          ruleSetId, categoryId: matched, feedbackLevel: selected.level, source: selected.source,
+        });
+      }
       openIntro();
     };
```

`hazbotLastFeedbackShown` is written here and read only by the sidebar step. That is deliberate: both
fields are written by this component and nothing else, so keeping them together keeps the store's
Hazbot state in one place rather than splitting a two-line concern across two commits.

R7e adds `feedbackLevel` to the three existing tour events, since the tour can now launch from two
different levels and nothing in the payload would otherwise separate them:

```diff
-      log("HazbotShowMeClicked", { ruleSetId, categoryId: matched, stepCount: steps.length });
+      log("HazbotShowMeClicked", {
+        ruleSetId, categoryId: matched, stepCount: steps.length, feedbackLevel: selected?.level ?? null,
+      });
```

with the same one-field addition on `HazbotTourDismissed` and `HazbotTourCompleted`.

**Measured against the real component** (coachmarks mocked, `computeCategorySelectionForEngine`
driven through the existing `mockSelection` shape), this exact code produces:

| Case | Bodies shown | `HazbotFeedbackShown` |
|---|---|---|
| fully populated category, 4 presses | L1, L2, L3, L3 | levels 1, 2, 3, 3 with sources `level1`, `round2`, `round3`, `round3` |
| top category, 3 presses | celebration, category 100, category 100 | levels 1, 2, 2, sources `level1`, `category100`, `category100` |
| category with no Round columns, 3 presses | L1, L1, L1 | levels 1, 1, 1, all `level1` |
| leave at L1 and return | L1 (cat 2), L1 (cat 3), L2 (cat 2) | map ends `{2: 2, 3: 1}` |
| second press with the popover open | one popover | **one** event, two `HazbotButtonClicked`, map stays at 1 |
| tour gate | launches at levels 1 and 2, not at 3 | `HazbotShowMeClicked` carries `feedbackLevel` 1 then 2 |

The top-category row is the one to read twice: the fill-down Round 2 on tab 23 never appears.

Tests. `feedback-levels.test.ts` covers the rule in isolation (the ladder, the cap, the top-category
branch, the absent-rung fallback, and the null return for a category with no feedback).

**A fixture constraint that has to be stated, because the obvious fixture is wrong.** Every ladder and
token-gate fixture must contain a category with a **higher id** than the one under test. The highest
id *is* the top category (R4b), so a fixture holding only the category under test silently makes it
the top one, whose ladder is level 1 plus `repeatFeedback` and nothing else. Measured against the real
component: a single-category fixture carrying Round 2 and Round 3 content logs
`HazbotFeedbackShown(L1)` on both of two presses, and adding one higher category to the same fixture
restores `L1` then `L2` with `HazbotShowMeClicked(L2)`. The failure is confusing rather than obvious,
and the tempting repair (adding `repeatFeedback` to the fixture) silently converts a Round-columns
test into a category-100 test. The existing `hazbot-button.test.tsx` fixtures are single-category
shapes today, so this is directly in the path of whoever writes these cases. `feedback-levels.test.ts`
pins the degenerate shape on purpose, a single-category rule-set with no `repeatFeedback` staying at
level 1 however many times it is asked, so the behavior is documented rather than rediscovered as a
bug.

**The fixture helper cannot express the new cases as written, and that is a second, mechanical trap in
the same file.** `hazbot-button.test.tsx:44-46` declares:

```ts
function engineWith(categories: { id: number; feedback: string }[]) {
  return { ruleSet: { categories } } as unknown as ReturnType<typeof getAnalysisEngine>;
}
```

Three of the four cases below cannot be written against it: the parameter type admits only `id` and
`feedback`, so a fixture carrying `feedbackRound2` / `feedbackRound3` fails TypeScript's
excess-property check on the array literal, and the returned rule-set has no `repeatFeedback` slot, so
the top-category case has nothing to walk to. The `as unknown as` cast hides the shape from the return
type but not from the argument. Widen it in this step:

```ts
function engineWith(
  categories: { id: number; feedback: string; feedbackRound2?: string; feedbackRound3?: string }[],
  repeatFeedback?: { id: number; studentAction: string; feedback: string },
) {
  return { ruleSet: { categories, repeatFeedback } } as unknown as ReturnType<typeof getAnalysisEngine>;
}
```

**A third trap, in the same file, and it is the one most likely to bite, because it surfaces as an
error that points nowhere near its cause.** Every ladder case in R11c and every token-gate case in
R11g runs on a **coaching** category, since that is what R1a's level-aware default makes level 2 do.
The dismissal route the file's feedback-panel block uses everywhere (`act(() => { cmOpts.onDestroyed(); })`,
e.g. `:236`, `:266`) is not a close on such a category, it is the `[Show me]` **activation** route:
with `offersTour` true it takes the `phase === "intro" && !introCancelled && !cleanup && tour && offersTour`
branch and launches the tour. Measured while driving the ladder against the real component, the second
press never happens and the test dies with `TypeError: tourEngine.drive is not a function` at
`hazbot-button.tsx:189`, which reads as a broken coachmarks mock rather than a wrong dismissal. Two
things are needed. The ladder cases close through the ×/Escape route instead:

```ts
const dismiss = () => {
  act(() => { cmOpts.onCancelRequested(); });   // sets introCancelled, so no tour launches
  act(() => { cmOpts.onDestroyed(); });
};
```

and the shared `cm` mock (`:67`) gains a `drive` spy, since the token-gate cases deliberately *do*
activate the tour. With both in place all six behaviors in the table above reproduce exactly.

The same trap has a sidebar half, in the Surface step, though a smaller one after that step's labeling
gate was made unconditional: R11h's fixture needs a **higher-id category** for the same reason this one
does, since `sidebar.test.tsx`'s `makeRuleSet()` is a single-category shape today, so its only category
is the top one and every row it renders would be labeled `not shown`. Its `repeatFeedback` is optional
now (it changes only the muted explanation's wording), and covering both wordings is worth one extra
fixture. **And the inverted half, which bites while writing the top-category case**: the row you want
labeled has to sit on the **highest id**, not merely on a category you have named "top". Hit while
probing this step: a three-category fixture with the celebration content on id 2 and a bare category
on id 3 renders every row unlabeled, and the failure reads
`Unable to find an element with the text: Feedback (level 2, not shown):` with Testing Library's
"the text is broken up by multiple elements" hint, which points at the matcher rather than at the
fixture. Same root cause as the trap above, opposite direction.

`hazbot-button.test.tsx` covers it through the component, which is where R11c to R11e and R11g live:
the four ladder cases above, the double-press case, an explicit assertion that the logged
`feedbackLevel` never exceeds the number of strings that exist for the category (R11e, the invariant
with no visible failure mode), and four token-gate cases (launch at level 1, launch at level 2, no
launch at level 3, and `[Show Me]` launches, pinning the trimmed and lowercased comparison).

Three existing tests in that file's walk-through block break on the added `feedbackLevel` and are
updated in this step: "launches a gated tour on [Show me]", "logs HazbotTourCompleted on the terminal
Done" and "logs HazbotTourDismissed (not Completed) on ×/Escape". Each asserts an exact payload
object via `toHaveBeenCalledWith`; each gains `feedbackLevel: 1`. No other test in the repo fails.

`LOGGED-EVENTS.md` gains the new event in the Hazbot table, `feedbackLevel` on the three tour rows,
and a note below the table stating that `feedbackLevel` is **not monotonic within a session**, naming
both reset routes (`SimulationReloaded` from Clear All, and `TopBarReloadButtonClicked` by ending the
page session), following the precedent the `categoryId` note set at `appRulesVersion` 6. While in that
file, line 16 describes the bottom-bar control as "Reload", which WM-47 renames.

It also gains R7c's second note, which is the one an analyst gets wrong by default, since the two
series look interchangeable and are not. Written in the same subsection style as the `categoryId` note:

```markdown
### `HazbotButtonClicked` versus `HazbotFeedbackShown` (`appRulesVersion` 7 onward)

The two series answer different questions and are not interchangeable.

**Presses that opened no popover at all** are the gap between them: count
`HazbotButtonClicked` minus `HazbotFeedbackShown` over a session. This is one situation
only, a press while the popover is already open. The button has no disabled state and the
open flag is already true, so the press registers and displays nothing.

**Presses that showed the student nothing new** leave *no* gap, because a repeat click on an
exhausted category still opens a popover and still emits `HazbotFeedbackShown`. Find them as
consecutive `HazbotFeedbackShown` events on the same `categoryId` carrying the same
`feedbackLevel` and `source`. A fully populated category logs 1, 2, 3, 3, so the fourth click
is a silent repeat; on rule-sets 42, 45, 47 and 54, whose middle categories carry no level 2
or 3, the same category logs 1, 1, 1 across three clicks that all showed the same words.

**Presses that spent a level without the student taking the help** are the pairs of consecutive
`HazbotFeedbackShown` events on the same `categoryId` with **no** `HazbotShowMeClicked` between
them. The level advances whenever the popover opens, however it is dismissed, so a student who
closes a coaching popover with × or Escape has spent that level without seeing the walk-through.
This applies only to coaching categories, whose action token is `[Show me]`; on `[Okay]` and
`[Hooray!]` categories there is nothing to activate, so the absence means nothing.
```

That is R7c, which exists because an earlier draft of this spec described the gap as measuring both
things at once. It measures the first only. The third note is R3a's accepted cost made measurable:
the intro popover has no dismissal event of its own, unlike the tour, which logs both
`HazbotTourCompleted` and `HazbotTourDismissed`, so the absence of a `HazbotShowMeClicked` is the only
signal. Verified against the real component: a dismissed press logs `HazbotFeedbackShown(L1)` alone,
while an activated one logs `HazbotFeedbackShown(L2)` followed by `HazbotShowMeClicked(L2)`.

`APP_RULES_VERSION` goes 6 to 7 in this step, which is the commit that changes the selection
semantics, per the placement rule in the workflow doc.

---

### Clear All clears the level map, and a helper for validation walks

**Summary**: The two reset routes. Clear All clears every category's level, which makes it agree with
the top-bar refresh icon that already clears the map for free by reloading the page; and a
`window.test` helper so a walker can reset without redoing Terrain Setup. Covers R3b and R9c.

**Files affected**:
- `src/components/bottom-bar.tsx`: clear the map in `handleReload`
- `src/models/stores.ts`: hoist the `UIModel` construction, add the helper
- `src/components/bottom-bar.test.tsx`, `src/models/stores.test.ts`: cover both
- `CLAUDE.md`: document the helper with the others

**Estimated diff size**: ~66 lines. Measured source: 18, plus ~40 of tests and ~8 of `CLAUDE.md`.

```diff
   public handleReload = () => {
     const { simulation, ui } = this.stores;
     // … the existing SimulationEnded log is unchanged …
     this.stores.chartStore.reset();
+    // WM-46 R3b: Clear All clears Hazbot's per-category feedback levels too, so a full
+    // restart cannot open on "I'm all out of ideas". The top bar's refresh icon already
+    // does this for free by reloading the page; this is what makes the two agree.
+    ui.hazbotFeedbackLevels.clear();
+    ui.hazbotLastFeedbackShown = undefined;
     cancelFireLinePlacement(simulation, ui, "reload");
```

`handleReload` already has `ui` in scope, so this is genuinely one line plus its companion. The
helper is not: `createStores()` builds `new UIModel()` inside the returned object literal, after the
`window.test` assignment, so the construction is hoisted and passed in.

```diff
   const simulation = new SimulationModel();
+  // Constructed before the window.test assignment (it was inline in the returned literal)
+  // so the test helpers can reach the UI store's Hazbot feedback-level map (WM-46 R9c).
+  const ui = new UIModel();
   (window as any).sim = simulation;
   (window as any).DroughtLevel = DroughtLevel;
   (window as any).Vegetation = Vegetation;
   (window as any).TerrainType = TerrainType;
-  (window as any).test = createTestHelpers(simulation);
+  (window as any).test = createTestHelpers(simulation, ui);
   return {
     simulation,
-    ui: new UIModel(),
+    ui,
     chartStore: new ChartStore()
   };
 };

-const createTestHelpers = (simulation: SimulationModel) => {
+const createTestHelpers = (simulation: SimulationModel, ui: UIModel) => {
   // … zoneBounds unchanged …
   return {
+    // Reset Hazbot's per-category feedback levels without a page reload or a Clear All, so
+    // a validation walk can check level 3 on one category and then move to the next without
+    // redoing Terrain Setup (WM-46 R9c).
+    resetHazbotFeedbackLevels() {
+      ui.hazbotFeedbackLevels.clear();
+      ui.hazbotLastFeedbackShown = undefined;
+    },
     placeSparkInZone(zoneIdx: number) {
```

**Verified in the running app**: after three presses on tab 23 category 2 (levels 1, 2, 3),
`window.test.resetHazbotFeedbackLevels()` empties the map and the next press shows level 1 again.

`CLAUDE.md` gains the helper in the `window.test` list, and a line under "Restart vs Reload behavior"
saying Clear All (the bottom-bar Reload) now also clears Hazbot's feedback levels while Restart does
not.

---

### Surface the levels in the dev sidebar, the playbooks and the docs

**Summary**: The three surfaces that go stale otherwise. Without this, the playbook a validation
walker follows lists one of up to three strings, the sidebar's detail panel does the same, and nothing
in the running app says which level the next click will show. Covers R9, R9a, R9b, R9b-i, R9d, R8a,
R11f, R11h and R11i.

**Files affected**:
- `scripts/playbook-impl.js` and `scripts/playbook-impl.test.js`: the new lines (R9a, R11f)
- `docs/hazbot-validation/*.md`: regenerated (67 lines across 11 files)
- `src/hazbot/engine/sidebar/sidebar.tsx`: the per-category rows and the rule-set row (R9d)
- `src/hazbot/wildfire/engine-singleton.ts`, `src/hazbot/wildfire/index.ts`: the level diagnostics
- `src/components/app.tsx`: compose the two diagnostics halves (R9b-i)
- `src/hazbot/engine/sidebar/sidebar.test.tsx`, `src/components/app.test.tsx`: R11h, R11i
- `docs/hazbot-update-workflow.md`: widen §7 (R8a)

**Estimated diff size**: ~306 lines. Measured source: 180, of which 67 are the regenerated
playbooks. Test code (~120) and the workflow-doc edit (~8) are the estimated half.

The playbook generator. `renderPlaybook` emits one `- **Feedback**:` line per category and knows
nothing about the Round columns, so a regenerate alone leaves the playbooks unchanged and therefore
stale (measured: regenerating after the extraction step produces no diff at all).

```js
    if (cat.feedback) lines.push(`- **Feedback**: ${oneLine(cat.feedback)}`);
    // WM-46: the level 2 / level 3 strings a repeat click shows. Omitted where the tab
    // carries no Round columns (42, 45, 47, 54), where level 1 simply repeats.
    // On the top category the Round columns are authored on two tabs (23, 24) and read as
    // a fill-down: the repeat click is served by the category-100 row instead (R4b). The
    // cells are still emitted, so they are labeled here rather than presented as something
    // a student can reach (Open Question 1, resolved A).
    // The label is gated on `top` ALONE, matching ladder()'s unconditional early return:
    // the top category's Round columns are unreachable whether or not the rule-set carries a
    // category-100 row. The explanatory NOTE is gated on that row existing, because it points
    // at the repeat-click line below, which is itself gated on it.
    const top = cat.id === topCategoryId(ruleSet);
    const roundLabel = (n) => (top ? `level ${n}, not shown` : `level ${n}`);
    const roundNote = !top ? ""
      : ruleSet.repeatFeedback ? " (superseded by the repeat-click line below)"
        : " (the top category's repeat click is served by the rule-set's repeat feedback, which this rule-set does not carry)";
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
```

with the shared rule required at the top of the module, the same way this script already reaches the
substrate parser:

```js
// The same top-category rule the app's feedback selection and the dev sidebar use, rather
// than a third copy of it (WM-46). Resolved through ts-node, which the generator registers
// before requiring this module, and through ts-jest in playbook-impl.test.js.
const { topCategoryId } = require("../src/hazbot/engine/top-category");
```

Measured output on tab 23 category 2, after regenerating:

```markdown
- **Feedback**: Hazbot: Looks like you haven’t changed the **Setup** yet. I can help! [Show me]
- **Feedback (level 2)**: Hazbot: Go up and look at the instructions under "Drought Investigation" again. [Show me]
- **Feedback (level 3)**: Hazbot: I'm all out of ideas! Please ask your teacher or a classmate for help! [Okay]
```

and on the same tab's category 5, which is the top category and the only place the labeling applies
(tabs 23 and 24, four cells in total; every other tab leaves that row blank):

```markdown
- **Feedback**: Hazbot: Great job! You’re ready to answer the questions below. [Hooray!]
- **Feedback (level 2, not shown)**: Hazbot: Go down and look at the questions you need to answer. [Okay] (superseded by the repeat-click line below)
- **Feedback (level 3, not shown)**: Hazbot: I'm all out of ideas! Please ask your teacher or a classmate for help! [Okay] (superseded by the repeat-click line below)
- **Feedback (repeat click after success)**: Hazbot: Great job on this investigation! Keep working through the activity! [Got it!] (from the sheet's category 100 row, which replaces any Round 2/3 content on this category)
```

Tab 42, whose middle categories gain nothing and whose top category gains only the repeat line, and
tab 25, whose top category carries no Round cells at all, are both unaffected by the labeling.

`playbook-impl.test.js` covers the three new lines, the negative case of a tab with no Round columns
where only the repeat line is added (R11f), and the labeling: a middle category renders
`Feedback (level 2)` while the top category renders `Feedback (level 2, not shown)` with the
superseded note. `sidebar.test.tsx` covers the same distinction on its own rows (R11h).

The sidebar's per-category detail panel gains two sibling rows beside the existing `Feedback:` row,
omitted rather than empty when the category carries no Round content, and the rule-set's repeat
feedback renders once at the top of the Categories panel rather than once per row (R9d). This also
lets the panel's props take the real `Category` type instead of the structural copy they carry today,
dropping a cast at the call site:

```diff
-import { BaseReading, EngineError, SimPropImpl } from "../types";
+import { BaseReading, Category, EngineError, RuleSet, SimPropImpl } from "../types";
```

```diff
         <CategoriesPanel
-          categories={engine.ruleSet.categories as Array<{
-            id: number; studentAction: string; feedback: string; visualFeedback: string; expression: string;
-          }>}
+          categories={engine.ruleSet.categories}
+          repeatFeedback={engine.ruleSet.repeatFeedback}
```

```diff
             isActive={isActive}
           />
         );
       })}
+      {/* Rule-set data rather than category data, so it renders once, AFTER the rows, in
+          the position it occupies in the ladder: the feedback a repeat click shows once
+          the student has reached the top category (WM-46 R9d). */}
+      {repeatFeedback && (
+        <div className="hazbot-sidebar-entry">
+          <strong>Repeat after success (category {repeatFeedback.id}):</strong>{" "}
+          <span style={{ whiteSpace: "pre-wrap" }}>{repeatFeedback.feedback}</span>
+        </div>
+      )}
     </div>
```

**The shared rule is two statements, not one, and all three consumers have to carry both.** Open
Question 2 shares `topCategoryId` so nobody disagrees about *which* category is the top one. That is
only half of it. The other half is that **the top category's Round columns are never reachable**, which
`ladder()` implements as an unconditional early return, before it ever looks at `feedbackRound2`. So the
sidebar and the playbook label those rows on the top-category test alone. Only the *prose* that names
the replacement is gated on `repeatFeedback` existing, because only the prose depends on it. Gating the
label itself on `repeatFeedback` (an earlier draft of this step did) makes the sidebar assert a
reachable level 2 on a rule-set with no category-100 row, while `ladder()` shows level 1 and the
playbook says "not shown" — three answers to one question, which is the failure Open Question 2 exists
to prevent, one level down from the one it fixed.

It goes last in the panel rather than first, directly under the top category's row, because that
is where it sits in the ladder: it is what a repeat click on the row above shows. Verified live, the
Categories panel reads 1, 2, 3, 4, 5, then `Repeat after success (category 100)`.

```diff
           <div><strong>Feedback:</strong> <span style={{ whiteSpace: "pre-wrap" }}>{cat.feedback}</span></div>
+          {cat.feedbackRound2 && (
+            <div>
+              <strong>Feedback (level 2{roundsSuperseded ? ", not shown" : ""}):</strong>{" "}
+              <span style={{ whiteSpace: "pre-wrap" }}>{cat.feedbackRound2}</span>
+            </div>
+          )}
+          {cat.feedbackRound3 && (
+            <div>
+              <strong>Feedback (level 3{roundsSuperseded ? ", not shown" : ""}):</strong>{" "}
+              <span style={{ whiteSpace: "pre-wrap" }}>{cat.feedbackRound3}</span>
+            </div>
+          )}
+          {roundsSuperseded && (cat.feedbackRound2 || cat.feedbackRound3) && (
+            <div className="hazbot-sidebar-muted">
+              {hasRepeatFeedback
+                ? "Not shown: a repeat click on the top category uses the rule-set's repeat feedback, listed at the end of this panel."
+                : "Not shown: a repeat click on the top category never reaches these, and this rule-set carries no repeat feedback."}
+            </div>
+          )}
```

`roundsSuperseded` is computed once in `CategoriesPanel` and passed down, on the same
highest-id rule the selection uses (Open Question 1, resolved A):

```diff
+import { topCategoryId } from "../top-category";
   …
+  // The top category's Round 2/3 rows, where the sheet carries them, are unreachable and are
+  // labeled rather than shown as reachable (WM-46 R9d). `roundsSuperseded` is gated on the top
+  // category ALONE, exactly as ladder() and the playbook are: ladder() early-returns for the top
+  // category whether or not a category-100 row exists, so the rows are unreachable either way.
+  // `hasRepeatFeedback` gates only the muted explanation, which names the row it points at.
+  const topId = topCategoryId({ categories });
   return (
     …
           <CategoryRow
             key={cat.id}
             cat={cat}
+            roundsSuperseded={cat.id === topId}
+            hasRepeatFeedback={repeatFeedback !== undefined}
```

The level readout goes through the host-supplied `diagnostics` prop, so the substrate never learns
what a feedback level is. R9b-i is why it is a second builder rather than a widening of
`buildPresetDiagnostics`: that function returns `undefined` without a `?preset`, and the sidebar
renders the section only when the array is non-empty, so riding on it would make the readout vanish on
exactly the URLs a walker uses.

```ts
// src/hazbot/wildfire/engine-singleton.ts, beside buildPresetDiagnostics
// WM-46 R9b: the feedback-level readout for the dev sidebar's Diagnostics section. UI-store
// state only (the level map, plus the last level/source displayed), so it stays readable
// from AppComponent, which observes the stores and not the engine.
export function buildFeedbackLevelDiagnostics(
  levels: Map<number, number> | undefined,
  lastShown?: { level: number; source: string } | undefined,
): SidebarDiagnostic[] {
  // Always at least one row, including the empty case (Open Question 3, resolved B): on a
  // Hazbot page the level map always has a meaningful value, and "nothing shown yet, the
  // next click is level 1 everywhere" is a state a walker needs to read, most sharply right
  // after window.test.resetHazbotFeedbackLevels().
  const entries = !levels || levels.size === 0 ? "(none)" : Array.from(levels.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([id, level]) => `${id}→${level}`)
    .join(", ");
  const rows: SidebarDiagnostic[] = [{ label: "Feedback levels", value: entries }];
  if (lastShown) {
    rows.push({ label: "Last shown", value: `level ${lastShown.level} (${lastShown.source})` });
  }
  return rows;
}
```

```diff
   const showHazbotSidebar = hazbotSidebar && engine !== undefined;
+  // The preset half is undefined without ?preset; the level half returns SidebarDiagnostic[]
+  // and always has at least one row, so it is spread directly (no `?? []`) and in production the
+  // section renders whenever the sidebar is mounted (WM-46 R9b-i, Open Question 3). The length
+  // guard still matters for a host that supplies neither half, which is the shape app.test.tsx
+  // drives through its barrel mock. Reading the level map here is what subscribes this observer
+  // to it. NOTE: `buildDiagnostics` is a top-level const in the component body, which the SE12
+  // comment beside the Sidebar mount appears to forbid. It does not: the const binds a FUNCTION,
+  // and its body (with the getUrlConfig() scan inside getRequestedPresetInfo()) still runs only
+  // at the call site inside the sidebar-mount branch, so SE12 holds. Update that comment to say
+  // so rather than "correcting" this back.
+  const buildDiagnostics = () => {
+    const rows = [
+      ...(buildPresetDiagnostics(getRequestedPresetInfo()) ?? []),
+      ...buildFeedbackLevelDiagnostics(ui.hazbotFeedbackLevels, ui.hazbotLastFeedbackShown),
+    ];
+    return rows.length > 0 ? rows : undefined;
+  };
```

```diff
-          <Sidebar title="Hazbot" diagnostics={buildPresetDiagnostics(getRequestedPresetInfo())} />
+          <Sidebar title="Hazbot" diagnostics={buildDiagnostics()} />
```

**Verified in the running app** on `?hazbotRules=23&hazbotSidebar=true&preset=plainsTwoZone`, tab 23
category 5 expanded: the two Round rows render labeled `Feedback (level 2, not shown)` and
`Feedback (level 3, not shown)` with the muted explanation beneath, category 2's rows render unlabeled,
and the `Repeat after success (category 100)` row closes the panel. And with **no** `?preset`: the
Diagnostics section reads `Feedback levels: 2→1 / Last shown: level 1 (level1)` after one press,
`2→2 / level 2 (round2)` after the second, and `2→3 / level 3 (round3)` after the third. Before the
first press, and again after `window.test.resetHazbotFeedbackLevels()`, it reads
`Feedback levels: (none)`, which is also what confirms the map is observable and the readout live: the
row changes on a `.clear()` rather than the section vanishing.

**One thing that breaks and is easy to miss.** `app.test.tsx` mocks the whole `../hazbot/wildfire`
barrel with an explicit object literal (`:42-50`), so adding `buildFeedbackLevelDiagnostics` to the
barrel makes `AppComponent` throw `buildFeedbackLevelDiagnostics is not a function` and takes **2** of
that file's tests with it. Measured: with the mock left alone the component suites run 5 failures, and
adding one `buildFeedbackLevelDiagnostics` line to the mock brings it back to the expected
3 (the tour tests from the previous step). Add the line in the same commit as the barrel export.

**Two mocks have to change together, and the second is the one that actually makes R11i assertable.**

First, the barrel mock must return rows rather than a bare `jest.fn()`. That mock is a plain object
literal with **no `jest.requireActual` spread** (unlike `hazbot-button.test.tsx`, which spreads both of
its mocked barrels), so the real builder never runs in that file, and a bare `jest.fn()` returning
`undefined` collapses the composition to `[…(undefined ?? []), …[]]` → `[]` → `undefined`:

```ts
  buildFeedbackLevelDiagnostics: jest.fn(() => [{ label: "Feedback levels", value: "(none)" }]),
```

with the negative case overriding it per-test via `mockReturnValueOnce([])`.

Second, and this is the part without which the first changes nothing observable, **the `Sidebar` mock
at `:18-20` ignores its props**:

```tsx
jest.mock("../hazbot/engine/sidebar", () => ({
  Sidebar: () => <div data-testid="hazbot-sidebar-mock" />,
}));
```

so "the array handed to `Sidebar`" is not reachable from that file at all. Verified with a throwaway
probe reproducing the file's mocks exactly and rendering the composition twice, once with the builder
returning a row and once returning `[]`: both render **byte-identical DOM** and pass the same
assertions, so `undefined`, `[]` and a two-row array are indistinguishable and the positive case
asserts nothing. The only thing assertable without this change is
`expect(buildFeedbackLevelDiagnostics).toHaveBeenCalled()`, which proves neither the concatenation nor
the `undefined`-versus-`[]` guard. Capture the prop:

```tsx
const sidebarDiagnostics = jest.fn();
jest.mock("../hazbot/engine/sidebar", () => ({
  Sidebar: (props: { diagnostics?: unknown }) => {
    sidebarDiagnostics(props.diagnostics);
    return <div data-testid="hazbot-sidebar-mock" />;
  },
}));
```

The positive case then asserts `sidebarDiagnostics` was called with the level rows and no preset row;
the negative case asserts it was called with `undefined` rather than `[]`. Measured with both changes,
`app.test.tsx` runs 7 passed, 0 failed, and the two cases are genuinely distinguishable. R9b-i is the
requirement with the **measured** failure mode (the Diagnostics section vanishing on every URL without
`?preset`), and this is its only guard, so a reader who applies only the builder-mock half and believes
the case is covered is the outcome worth heading off.

Tests: `sidebar.test.tsx` covers R9d's rows (present when the category carries Round content, absent
rather than empty when it does not, repeat feedback rendered once per rule-set) and R9b's diagnostic
line, scoped to the rendering contract; the level arithmetic stays with R11c and R11e.

R11i is split across two files and **neither can carry both halves**, so say which proves what rather
than letting a reader assume one file covers it. `app.test.tsx` proves the **composition**: both
builders are called and concatenated, so with no requested preset the array handed to `Sidebar` still
carries the level rows, and with neither half present (reachable only through the barrel mock) it is
`undefined` rather than `[]` so the section stays absent. It cannot prove more than that, because its
barrel mock replaces the real builder. `engine-singleton.test.ts` proves the **builder**: it always
returns at least one row, including the `(none)` zero state. Together those are R9b-i's guarantee; each
alone is not.

Finally, `docs/hazbot-update-workflow.md` §7 folds its semantic and evaluation-semantics bullets into
one statement that also reaches **feedback-selection** semantics, which is what this branch changes,
keeping the placement rule WM-45's bullet already carries (bump in the commit that changes the
semantics, not in a later docs commit). Without this, R8 asserts a bump no written policy authorizes.

## Execution notes: where the shipped code differs from the plan above

All four steps were implemented, verified and committed. Six places where what shipped is not
byte-for-byte what this document specifies are recorded here so a re-read does not "correct" them
back. Nothing in the design moved; every item is either forced by a toolchain constraint or the
applied resolution of a per-step `/cc-code-review` finding.

- **`hazbot-button.tsx` imports `selectFeedback` from the wildfire barrel, not from the module.**
  Step 2's hunk writes `import { selectFeedback } from "../hazbot/wildfire/feedback-levels";`, but
  the same step also adds the export to `src/hazbot/wildfire/index.ts`, and with a deep import that
  export has no consumer. Every other export in that barrel has a through-barrel consumer, so the
  dead one reads as an oversight. The barrel import is safe in both test files that matter:
  `hazbot-button.test.tsx`'s barrel mock spreads `jest.requireActual`, and `app.test.tsx` mocks
  `./bottom-bar`, so it never renders the button at all. Verified: 872 tests under `src/` pass.

- **The `hazbot-button.test.tsx` map assertion uses `Array.from`, not a spread.** `tsconfig.json`
  sets `target: "es5"` with no `downlevelIteration`, so `[...map.entries()]` is a compile error
  (`TS2802`), and the suite fails to run rather than failing an assertion. `Array.from(...)` is what
  `buildFeedbackLevelDiagnostics` already uses, and it type-checks because `lib` includes `es2017`.

- **Step 1's two category-100 `parseTab` cases were merged into one.** The step adds a
  `does NOT land in categories` case beside the existing `drops a category row with id >= 100`, which
  is the same assertion twice; and the existing case's *name* became false, since this step is what
  stops dropping the row. The existing case was renamed
  `keeps a category row with id >= 100 out of categories` and the new duplicate dropped.

- **`parseActionToken` gained its own test block.** Step 1 exports it "for tests" but specifies no
  case for it, leaving the export dead. It is what the level-aware Round 2 default and the whole
  unknown-token warning key off, and its regex has to stay in step with `parseFeedback` in
  `hazbot-button.tsx`, so it is covered directly: trailing token, trailing whitespace, no token, and
  a bracketed phrase that is not at the end.

- **Step 4's sidebar TEST hit lint too, in two rules the targeted execution pass did not reach.**
  That pass fixed `react/jsx-closing-tag-location` in `sidebar.tsx`. In `sidebar.test.tsx`, expanding
  a category row via `.closest("[role=button]")` trips `testing-library/no-node-access`, and a
  multi-line `<Sidebar>` element inside `render(...)` trips the same closing-tag rule. Both are fixed
  the way the file already does it: click the studentAction text (the click bubbles to the row's
  `onClick`, which is what `:60`'s existing detail-panel case does), and bind the `diagnostics` array
  to a local before the single-line `render`.

- **`app.tsx`'s rewritten comment drops its trailing `See Self-Review SE12.`** Step 2 asks for the
  comment to be updated to say the binding is a function; the rewritten comment states that
  constraint in full on its own, so the pointer into a spec's self-review section adds nothing a
  reader of that file can reach.

## Delivery notes: what to tell the PIs

These are not implementation steps. They are the things that have to be said out loud when the branch
is handed over, because they are decisions or limitations a reader of the feature cannot see from
using it.

- **A dismissed popover spends a level, and here is how to count it.** Closing a coaching popover with
  × or Escape advances the level without the student seeing the walk-through (R3a's accepted cost).
  It is measurable as consecutive `HazbotFeedbackShown` events on one `categoryId` with no
  `HazbotShowMeClicked` between them, on `[Show me]` categories only. Worth saying explicitly, because
  a PI evaluating "did level 2 help?" will otherwise include students who never read level 1. If it
  turns out to matter, the fix is a dismissal event for the intro popover, which is net-new logging
  beyond this branch's R7a and R7e.
- **The other two queries in the same note**, since they are easy to compute wrongly: the
  clicked-versus-shown gap counts presses that opened no popover at all, and a press that showed
  nothing new leaves no gap and is found as consecutive identical `HazbotFeedbackShown` events.
- **Levels are per category and never reset inside a run.** Only Clear All and a browser reload clear
  them, so a student who exhausts a category sees "ask your teacher or a classmate" on every later
  visit to that category in the same page session. That is Sam's three-per-category cap read literally
  (R3), and it is the behavior most likely to surprise someone watching a classroom.
- **The four shipped answers** in the requirements' "Questions to confirm on the branch build" table
  still need Sam and Trudi. Question 1 (the top category's repeat click comes from category 100) is
  the only one whose reversal is a code change; the Q1 decision in this document now carries the
  measured 9-line reversal so it does not have to be re-derived.

## Open Questions

### RESOLVED: What should the two dev surfaces show for the top category's discarded Round 2/3 content?

**Context**: R4b routes every repeat click on the top category to category 100 and ignores columns G
and H there, but the extractor still emits them, because it is a faithful transcription of the sheet
and the discarding is a selection decision. Measured, this affects **four cells on two tabs** (23 and
24 category 5); the other five authored tabs leave that row blank. The consequence is only on the dev
surfaces: the playbook for tab 23 category 5 currently lists a level 2 and a level 3 line that a
student can never see, followed by the repeat-click line saying it replaces them, and the sidebar's
detail panel would show the same two rows. The runtime is unaffected either way (verified: the
top-category walk shows celebration, category 100, category 100, and never the fill-down).

**Options considered**:
- A) Emit as authored and annotate: the playbook and sidebar keep showing the rows but mark them
  "not shown: superseded by category 100". Preserves the evidence for Question 1 and keeps the
  reversal a one-line selection change.
- B) Emit as authored and suppress on the two dev surfaces: the top category shows only the repeat
  line. Cleanest for a walker; the discarded content is then visible only in the generated rule-set.
- C) Do not emit them at all: the extractor skips the Round columns on the top category. The
  generated files carry no dead data, but the fill-down judgment moves into the extractor, so
  reversing it after Question 1 becomes an extractor change plus a re-extract rather than one line.

**Decision**: **A**. Both surfaces keep the rows and label them. It fixes the actual defect, which is
that both currently assert something a student can never see, without moving the fill-down decision
out of the one place that owns it. R4b is the single decision in this spec that a sheet edit cannot
absorb and it is still unconfirmed with Sam, so the discarded content stays visible and labeled rather
than deleted at the source, and the reversal stays inside one function. C was rejected
for the same reason plus a second: the extractor writes in place so that `git diff` is the sheet diff,
and dropping authored cells would end that.

**How bad it was, measured before deciding.** Exactly two categories across all 11 tabs carry Round
data the selection rule can never reach: 23/5 and 24/5, four cells. Live in the app, expanding
category 5 showed `Feedback (level 2)` and `Feedback (level 3)` rows formatted identically to the real
ones on categories 2 to 4, and the only thing contradicting them was the `Repeat after success` line
**555px above**, in a panel whose category-5 detail starts at y=1040 in a 936px viewport, so the
correction is off-screen exactly when the rows are being read.

**The reversal, measured, in case Sam says the fill-down reading is wrong.** It is a 9-line diff
entirely inside `ladder()`, not the one-line deletion it appears to be: removing the early
`return rungs;` on its own leaves the top category with `[level1, category100, round2, round3]`, a
four-rung ladder that logs `feedbackLevel: 4` and breaks the `1 | 2 | 3` contract R7d relies on. The
working shape moves the two Round pushes above the top-category branch and gates the category-100 rung
on the category carrying no Round content of its own:

```ts
  if (cat.feedbackRound2) rungs.push({ feedback: cat.feedbackRound2, source: "round2" });
  if (cat.feedbackRound3) rungs.push({ feedback: cat.feedbackRound3, source: "round3" });
  if (categoryId === topCategoryId(ruleSet) && rungs.length === 1 && ruleSet?.repeatFeedback?.feedback) {
    rungs.push({ feedback: ruleSet.repeatFeedback.feedback, source: "category100" });
  }
```

Spiked against the committed rule-sets, that walks tab 23 category 5 as
`L1/level1, L2/round2, L3/round3` while tab 25 category 6 and tab 42 category 3 still walk
`L1/level1, L2/category100, L2/category100`, and middle categories are unaffected. No extractor change,
no re-extract, no change to the generated files, and the R11c top-category case plus the two dev
surfaces' labeling are what would need updating alongside it.

**Verified after implementing.** The playbook and the sidebar both label only the top category (tab 23
category 5 above; tab 23 category 2 unchanged; tab 25 category 6, whose top row is blank in the sheet,
gains nothing), and the existing sidebar and playbook suites pass, 35 tests. The labeling adds a
`roundsSuperseded` prop to `CategoryRow` and a `top` local in the playbook generator, which keeps the
top-category rule in the generator and therefore keeps Open Question 2 live.

---

### RESOLVED: The "top category" rule is needed in three places. Keep the duplicates or share one helper?

**Context**: `feedback-levels.ts` computes the top category for the selection rule and
`playbook-impl.js` computes it again for the repeat-click line. Resolving Question 1 as A added a
**third** consumer: the sidebar needs it to label the superseded rows. R4b makes the rule
load-bearing, so if the three ever disagree, the docs and the dev sidebar describe the feature against
a different category than the app implements it for, on the one requirement still unconfirmed with
Sam.

**Options considered**:
- A) Keep the three copies, each with a comment naming the others. About four lines apiece, and R11c,
  R11f and R11h pin all three ends, so a divergence fails a test rather than shipping.
- B) One shared helper in the substrate, exported from the barrel and consumed by all three.
- C) Have the extractor emit it (a `topCategoryId` field on the generated rule-set) so all three read
  data rather than deriving. Adds generated state that can go stale against `categories`, in a file
  whose diff is meant to be the sheet diff.

**Decision**: **B**, `src/hazbot/engine/top-category.ts`, exported from the barrel. Three copies of a
rule this load-bearing stay correct right up until someone changes the definition, which is exactly
what Question 1 for Sam could force.

**Verified before deciding**, since the sharing route was not obviously available to a plain-JS
generator. `generate-hazbot-validation-playbook.js` already calls `require("ts-node/register")` and
then requires TypeScript modules directly (`../src/hazbot/engine/parser`), and a throwaway probe
confirmed that a `.js` module can require a `.ts` module **under Jest** too, through the existing
`ts-jest` transform; `playbook-impl.test.js` already uses that pattern for the parser. So the
dependency is not new.

**Verified after implementing**: `tsc` clean, **642 of the 643 tests** across `scripts` and
`src/hazbot` pass (the one exception is the `extract-impl.test.js` case the preamble's break inventory
names, which is unrelated to this question and is updated in step 1),
and regenerating the playbooks produces a diff byte-identical to the pre-refactor one (67 insertions),
which is what makes it a refactor rather than a behavior change. The module also fits the substrate's
existing shape, where `find-last.ts`, `session-id.ts` and `runtime-type.ts` are single-purpose modules
of the same size, and it reads a `RuleSet` property rather than interpreting feedback, so the
substrate is not learning what a feedback level is. It takes `Pick<RuleSet, "categories">` so the
sidebar can call it with the categories array it already has.

---

### RESOLVED: Should the Diagnostics section appear before the student's first Hazbot click?

**Context**: `buildFeedbackLevelDiagnostics` returns `undefined` while the level map is empty, so on a
URL with no `?preset` the whole Diagnostics section is absent until the first click and then appears
(verified live, including disappearing again after `resetHazbotFeedbackLevels()`). With a `?preset`
the section is always present and simply gains rows. A walker on a no-preset URL therefore sees a
section pop into existence, which is honest but might read as a glitch.

**Options considered**:
- A) Leave it. No rows means no section, which is the existing contract for the preset diagnostic,
  and every documented Hazbot URL in `CLAUDE.md` carries a `?preset` that holds the section open.
- B) Always emit a `Feedback levels: (none)` row, so the section is stable and its absence never has
  to be interpreted.

**Decision**: **B**. The level map is not optional host content the way errors and temporal variables
are: on a Hazbot-enabled page it always has a meaningful value, and "empty" is a state a walker needs
to read, immediately after the reset helper R9c exists to provide.

**The sidebar's own conventions split on a principle, which is what decided it.** Structural panels
render with a zero state (`Readings (0) · newest first` renders with no readings, confirmed live;
Categories and Factor Variables always render), while panels whose content is optional *to the host*
render nothing when empty (`TemporalVariablesPanel` returns null at `:163`, `ErrorsPanel` at `:438`,
the Diagnostics gate at `:58`). No errors genuinely means nothing to report; an empty level map is a
state the feature passes through twice per validation cycle.

**The deciding measurement** was not the first render but the reset: on a no-preset URL, after three
presses reading `2→3 / level 3 (round3)`, `window.test.resetHazbotFeedbackLevels()` made the **entire
Diagnostics section disappear**, which is ambiguous with a broken sidebar on the surface whose job is
telling a walker what the next click will show. Spiked option B renders `Feedback levels: (none)` on
`?hazbotRules=23&hazbotSidebar=true`, one line in the builder, with the `engine-singleton` and
`app.test.tsx` suites passing (32 tests).

## Self-Review

Every issue below was measured against the code, the committed rule-sets or the running app before it
was written down, and each was applied before the next was raised. The verification is stated with
each one.

### Cross-reference against the requirements

#### RESOLVED: R7c has a deliverable and no step delivered it
All 41 requirement IDs were mapped against what the four steps claim. Six were unclaimed; five are
constraints (below), but **R7c is a documentation deliverable**: it says the two logged series are
answered by different queries and *"the distinction has to be written down or an analyst will compute
the wrong one"*. Step 2 covered only R7a's non-monotonicity note. The omission matters because R7c is
itself the resolution of an earlier self-review issue where the spec misdescribed what the gap
measures, and R6a guarantees the confusing case occurs in real data (a middle category on 42, 45, 47
or 54 logs 1, 1, 1 with a zero gap across three clicks that showed the same words).

**Resolution**: Step 2 now specifies the `LOGGED-EVENTS.md` subsection verbatim, in the style of the
existing `categoryId` note.

---

#### RESOLVED: five requirements are satisfied by construction and the plan never said so
R2a, R7, R7b, R10 and R11 produce no work item. Each was verified rather than assumed: the level 3
string occurs 28 times across the generated files and nowhere in source (R2a); `buildTour(ruleSetId,
matched, ctx)` is unchanged (R7); `HazbotButtonClicked`'s payload is untouched (R7b); the whole diff
contains no added or removed `expression:` line and the impl modules are untouched (R10). **R7 invites
an active misreading**, since R4a's `offersTour` gate is new code keyed on the level's token.

**Resolution**: added a "Requirements this plan constrains rather than implements" section with the
evidence for each, and the R7-versus-R4a distinction spelled out (R7 governs tour *content*, R4a
governs whether the existing tour is *offered*, which R7's own text allows).

---

#### RESOLVED: the diff-size estimates were asserted rather than measured
Measured per step from the spike: 306 source lines for Extract, 42 for Select, 18 for Clear All, 174
for Surface. The Select step was the overestimate, at ~300 claimed against a 42-line source change.
All four remain under the ~500-line guideline. No orphan steps and no forward dependencies.

**Resolution**: the four "Estimated diff size" lines now separate measured source from estimated test
code, and the preamble records the coverage, sizing and ordering results.

---

### Senior Engineer

#### RESOLVED: the plan claimed Question 1 was a one-line reversal
Stated twice, and it carried weight in the Q1 decision. The obvious one-line reading is wrong:
deleting `ladder()`'s early `return rungs;` leaves the top category with `[level1, category100,
round2, round3]`, a four-rung ladder that logs `feedbackLevel: 4` and breaks the `1 | 2 | 3` contract
R7d relies on. Spiked the correct reversal: a **9-line diff inside one function**, which walks tab 23
category 5 as `L1/level1, L2/round2, L3/round3` while blank-top-row tabs still fall through to
category 100.

**Resolution**: both claims corrected, and the working reversal recorded in the Q1 decision so nobody
re-derives it when Sam answers.

---

#### RESOLVED: R9's tour-data regeneration was claimed but never instructed
`generate-hazbot-tour-data.js` appeared only in the verification preamble, describing what the spec
author ran. Following the plan literally it never runs. The coupling is real: `tour-data-impl.js`
derives each tour's `doneLabel` by parsing `arrowText` (`:64`) and strips a `Hazbot:` prefix while
doing so (`:20`), and step 1 changes the shared normalizer that prepends that prefix. Also checked
that leaving the playbooks stale between steps 1 and 4 breaks nothing: no freshness test exists for
either generated artifact.

**Resolution**: step 1 now runs it as a check with the no-diff expectation stated, and says what a
non-empty diff would mean.

---

### Data Pipeline Engineer

#### RESOLVED: the stray-quote strip was unconditional, and the sheet's style will collide with it
R1a strips a leading double quote because all 28 Round 3 cells carry one. **12 of the 28 Round 2 cells
already contain double quotes**, because the authors name activity sections that way (`Go up and look
at the instructions under "Drought Investigation" again.`). The first cell that *opens* with such a
name would ship to students with its opening quote silently eaten, indistinguishable in the
re-extract diff from an intended edit.

**Resolution**: the strip now fires only on an odd number of quotes, i.e. an unterminated leading one.
Re-running the extractor with the condition produces output **identical** to the unconditional
version, file for file, so today's 28 cells are unaffected. Two R11a cases added, and requirements.md
R1a records the condition so the two documents do not diverge.

---

### QA Engineer

#### RESOLVED: the new substrate module had no test
Question 2 added `topCategoryId` to the substrate barrel. It appeared 11 times in the plan and never
in a test. Every barrel-exported substrate module carrying logic has its own test file; the two that
do not (`session-id.ts`, `runtime-type.ts`) are internal. It also has cases the indirect tests cannot
reach, since every committed tab is contiguous `1..N`.

**Resolution**: `top-category.test.ts` added to step 1 with four cases, including the non-contiguous
set (maximum, not last element) and both call shapes.

---

#### RESOLVED: the extractor's most-executed new branch had no test
R11a covered `normalizeFeedback("")` in isolation and the no-Round-columns case at the `parseTab`
level, but not **columns present, cell blank**, which is a different branch. Measured, it runs on **12
categories across the 7 authored tabs** (category 1 on all seven, plus the blank celebration row on
25, 32, 33, 34 and 35). Dropping the guard fails quietly: `""` is falsy at every consumer, so the only
symptom is `feedbackRound2: ""` noise in the diff Technical Notes treats as the sheet diff.

**Resolution**: one case added next to the existing no-columns case.

---

#### RESOLVED: the obvious test fixture makes the ladder tests pass for the wrong reason
Writing a probe against the real component with a single-category fixture produced
`HazbotFeedbackShown(L1)` on both of two presses. That is correct behavior, not a defect: with one
category, that category is the top one, so `ladder()` takes the R4b branch and returns a single rung.
Adding a higher category restored `L1` then `L2` with `HazbotShowMeClicked(L2)`. The existing
`hazbot-button.test.tsx` fixtures are single-category shapes, so the trap is directly in the path of
whoever writes R11c and R11g, and the tempting repair (adding `repeatFeedback` to the fixture)
silently converts a Round-columns test into a category-100 test.

**Resolution**: the fixture constraint is stated where the tests are specified, and
`feedback-levels.test.ts` pins the degenerate shape deliberately.

---

### Education Researcher

#### RESOLVED: R3a's accepted cost is invisible in the dataset without a documented query
The level advances however the popover is dismissed, so closing level 1 with × or Escape spends it.
The intro popover has no dismissal event, unlike the tour. Verified it is derivable: a dismissed press
logs `HazbotFeedbackShown(L1)` alone, an activated one logs `HazbotFeedbackShown(L2)` then
`HazbotShowMeClicked(L2)`, so the signal is the absence of a `HazbotShowMeClicked` between consecutive
`HazbotFeedbackShown` events on one category, on `[Show me]` categories only. A PI evaluating "did
level 2 help?" would otherwise include students who never read level 1.

**Resolution**: added to the same `LOGGED-EVENTS.md` subsection, and added to the delivery notes so the
PIs are told when the branch is handed over, with a pointer in requirements.md's questions section.

---

### Re-review round

#### RESOLVED: the narrowed quote strip left requirements.md describing the old behavior
The narrowing is authoring-visible: it decides what happens to a cell opening with a quoted section
name. R1a still specified the unconditional strip, and the phrase occurs in 8 places in that document.

**Resolution**: R1a now carries the odd-count condition and its reason. Also corrected the size
estimates that this review's own additions had drifted (Extract ~430 to ~460, Select ~250 to ~255).

The rest of the re-review came back clean, including the one collision the new step-1 instruction
could have caused: no freshness test exists for either generated artifact, so the playbooks being
stale between steps 1 and 4 breaks nothing.

---

## Self-Review round 2 (multi-role, 2026-08-22)

Roles: QA Engineer, Senior Engineer, Data Pipeline Engineer, Requirements Reviewer. Every issue
below was verified before it was written down, by re-running the plan's own step 1 against the real
workbook (a patched copy of `extract-impl.js` plus a JS port of `topCategoryId` / `ladder` /
`selectFeedback`, driven over all 11 generated tabs) and by reading the anchors the plan cites. The
measurement is stated with each one. Probe artifacts live under `tmp/wm46-probe/` (gitignored).

**What came back clean**, so a reader can tell verified-good from unchecked. The extraction step
reproduces the plan's per-tab output exactly, byte for byte, with zero changed or removed lines on any
tab and `index.ts` untouched; tab 23 category 2 and tab 23 category 5 come out exactly as the plan
prints them, including the level-aware default taking its `[Okay]` branch on the celebration row. The
34-for-34 tour/token correspondence holds (`tourData` has entries for exactly the 34 `[Show me]`
categories, no mismatch in either direction). Every column C invariant the plan rests on is true across
all 11 tabs: zero cells need trimming, zero lack the `Hazbot:` prefix, zero lack a trailing token, zero
begin with a quote and zero carry an odd number of quotes, so the four new `normalizeFeedback` jobs are
provably no-ops there. The workbook numbers are all confirmed (28 Round 2 and 28 Round 3 cells, 9
distinct Round 2 values, 1 distinct Round 3 value carrying exactly one quote, 0 of 56 cells with a
bracket token, 12 Round 2 cells containing a quote and 0 opening with one, the 12 "go down" cells, tab
33's `Supression`, tab 34's category-100 narrative naming category 4). The four ladder walks produce
exactly the sequences the plan tabulates, the R11e cap holds on every category of every tab, and the
26 level-2 `[Show me]` categories all have a tour to offer. Logging a new event name is inert: the only
temporal variable declares `acceptedEvents: ["ChartTabShown", "ChartTabHidden"]` and `translate`'s
`default` is a no-op, so `HazbotFeedbackShown` cannot mutate engine state. Committing the level before
`openIntro()` inside `openOnce` is safe: the teardown removes the transitionend listener and clears the
fallback timer, so `openOnce` is unreachable once `cleanup` is set.

### QA Engineer

#### RESOLVED: `app.test.tsx`'s barrel mock makes R11i's positive case vacuous
The plan's fix for the two broken tests is one line, `buildFeedbackLevelDiagnostics: jest.fn()`, and
separately it claims that file "covers R11i: with no requested preset the array handed to `Sidebar`
still carries the level rows". Those two cannot both be true. Verified at `app.test.tsx:42-50`: that
mock is a **plain object literal with no `jest.requireActual` spread** (unlike `hazbot-button.test.tsx`,
which spreads both of its mocked barrels), so the real `buildFeedbackLevelDiagnostics` never runs in
that file. A bare `jest.fn()` returns `undefined`, so `buildDiagnostics()` composes
`[...(undefined ?? []), ...(undefined ?? [])]` → `[]` → `undefined` → no Diagnostics section. That is
byte-for-byte the same observable outcome as R11i's *negative* case, so the two cases cannot be told
apart and the positive one asserts nothing.

R9b-i is the requirement with the measured failure mode (the section vanishing on every URL without
`?preset`), and it is the reason the composition exists at all, so leaving its only test vacuous
removes the guard from the thing that was actually broken.

**Resolution (applied)**: the mock line becomes
`buildFeedbackLevelDiagnostics: jest.fn(() => [{ label: "Feedback levels", value: "(none)" }])`, and the
negative case overrides it per-test with `mockReturnValueOnce([])`. State plainly what each half then
proves: `app.test.tsx` proves the *composition* (both builders are called and concatenated, and the
length guard still yields `undefined` when both are empty), and `engine-singleton.test.ts` proves the
*builder* always returns at least one row. Neither file can prove both, and the plan currently reads as
though `app.test.tsx` does.

While there: `?? []` on the level half is dead code. The builder's declared return type is
`SidebarDiagnostic[]` and every path returns at least one row, which is OQ3's decision. Keeping the `??`
implies an `undefined` return the type forbids.

---

#### RESOLVED: the `hazbot-button.test.tsx` fixture helper cannot express the new cases
The plan names one fixture trap (a single-category rule-set silently makes its category the top one)
and pins it well. There is a second, mechanical one it does not name, in the same file and in the path
of the same tests. Verified at `hazbot-button.test.tsx:44-46`:

```ts
function engineWith(categories: { id: number; feedback: string }[]) {
  return { ruleSet: { categories } } as unknown as ReturnType<typeof getAnalysisEngine>;
}
```

Three of R11c/R11g's four cases cannot be written against it. The parameter type admits only `id` and
`feedback`, so a fixture carrying `feedbackRound2` / `feedbackRound3` fails TypeScript's
excess-property check on the array literal; and the returned rule-set has no `repeatFeedback` slot, so
the top-category case (`L1, L2/category100, L2/category100`) has nothing to walk to. The cast is
`as unknown as`, so it hides the shape from the return type but not from the argument.

**Resolution (applied)**: widen the helper in step 2 alongside the tests, and say so where the fixture
constraint is already discussed, since that is the paragraph whoever writes these tests will read:

```ts
function engineWith(
  categories: { id: number; feedback: string; feedbackRound2?: string; feedbackRound3?: string }[],
  repeatFeedback?: { id: number; studentAction: string; feedback: string },
) {
  return { ruleSet: { categories, repeatFeedback } } as unknown as ReturnType<typeof getAnalysisEngine>;
}
```

The same paragraph should carry R11h's version of the trap, which the plan also does not name: the
sidebar's `roundsSuperseded` gate (below) means a `sidebar.test.tsx` fixture **without** a
`repeatFeedback` renders the top category's Round rows *unlabeled*, so R11h's "labeled `not shown` on
the top category" case fails until the fixture gains one.

---

### Senior Engineer

#### RESOLVED: the three top-category consumers agree on the category and disagree on the condition
Open Question 2 shares `topCategoryId` precisely so the selection, the sidebar and the playbook cannot
diverge about which category is the top one. They do not. But each applies a *different second
condition* on top of it, and one of the three disagrees with the selection rule:

| Site | Condition |
|---|---|
| `ladder()` | `categoryId === topCategoryId(ruleSet)` → early return, **regardless of `repeatFeedback`** |
| `playbook-impl.js` | `cat.id === topCategoryId(ruleSet)` → `not shown`. Matches `ladder()`. |
| `sidebar.tsx` | `repeatFeedback !== undefined && cat.id === topId` → `not shown`. **Does not match.** |

`ladder()` takes its early return before it ever looks at the Round columns, so on the top category
those strings are unreachable whether or not the rule-set carries a category-100 row. The playbook says
so. The sidebar says so only when `repeatFeedback` exists; without it, the sidebar renders the top
category's Round 2/3 rows formatted identically to the reachable ones on the categories above, which is
exactly the defect Open Question 1 was resolved (option A) to fix, reintroduced on one of the two
surfaces the resolution was about.

Verified unreachable in the committed corpus: all 11 tabs carry a category-100 row (my probe found one
per tab, ids all 100, none higher), so the gate is true wherever it is evaluated today, and the corpus
gate in R11b keeps it that way for re-extracts. But `RuleSet.repeatFeedback` is **optional by design**
(that optionality is what R8b calls additive rather than breaking, and what keeps 17 hand-built
literals compiling), `topCategoryId` is written for hosts generally, and every hand-built test fixture
omits the slot. So the divergent branch is reachable in exactly the fixtures R11h will use.

**Resolution (applied, option A)**: drop `repeatFeedback !== undefined` from `roundsSuperseded` so the sidebar
matches `ladder()` and the playbook, and keep the gate only on the muted explanatory line, whose text
("uses the rule-set's repeat feedback, listed at the end of this panel") is the part that is genuinely
false without a category-100 row:

```diff
-            roundsSuperseded={repeatFeedback !== undefined && cat.id === topId}
+            roundsSuperseded={cat.id === topId}
```

with the muted line's own condition becoming
`roundsSuperseded && (cat.feedbackRound2 || cat.feedbackRound3)` and `hasRepeatFeedback` selecting
between two wordings inside it, rather than gating whether it renders at all. (An earlier draft of this
resolution wrote the condition as `roundsSuperseded && hasRepeatFeedback && (…)` *and* promised a
fallback sentence for the no-repeat-feedback case; those two cannot both hold, since the gate is what
makes the fallback unreachable. The step-4 code, which switches wording with a ternary, is the coherent
version and is what shipped. Left uncorrected, a reader implementing from this paragraph rather than
from the step would drop the fallback string and label the top category's rows `not shown` with nothing
on screen saying why, which is a milder form of the divergence this issue was raised to fix.) Then
state the shared rule as two
parts rather than one, since that is what actually has to agree: *which* category is top
(`topCategoryId`, shared), and *that the top category's Round columns are never reachable*
(unconditional, and now written the same way in all three places).

---

#### RESOLVED: the SE12 comment in `app.tsx` contradicts the code the plan puts under it
`app.tsx` carries a comment that says, in terms, do not do the thing the plan does:

> `diagnostics` is computed here, inside the existing sidebar-mount branch — **NOT as a top-level
> const in the component body** — so the `getUrlConfig()` scan it entails runs only when the sidebar
> mounts, not on every render for production users with `?hazbotSidebar` unset. See Self-Review SE12.

The plan introduces `const buildDiagnostics = () => { … }` as exactly a top-level const in the
component body. The **constraint is still honored**, because the const binds a function rather than
calling one and the body only runs at the JSX call site inside `showHazbotSidebar && engine && (…)`,
so no `getUrlConfig()` scan happens for production users. That is a real distinction and the plan's
route is fine. But the comment as written now reads as a rule the adjacent code breaks, on a comment
whose own last clause is a "do not correct this" instruction, which is how a future reader talks
themselves into "correcting" it in the wrong direction.

**Resolution (applied)**: one sentence in step 2's `app.tsx` hunk updating the comment to say the
binding is a *function* and the scan still happens only at the call site inside the mount branch, so
SE12 holds. Cheap, and it keeps the guard readable.

---

### Data Pipeline Engineer

#### RESOLVED: the "186 inserted lines" total is wrong; the measured total is 178
The plan states this twice, in the verification preamble ("186 inserted lines across the 11 generated
rule-sets") and in step 1's sizing ("Measured source: 306 (186 generated rule-sets, 97 extractor, 7
types, 14 the shared helper, 2 barrel and version)").

I re-ran exactly the step-1 code against `Wildfire Hazbot Feedback Tables (8).xlsx` and diffed the
output against `src/hazbot/rule-sets`. **The per-tab figures are exactly right and the pure-addition
claim holds**, which is the load-bearing half:

```
23 +22 -0    24 +22 -0    25 +22 -0    32 +22 -0    33 +22 -0
34 +18 -0    35 +26 -0
42  +6 -0    45  +6 -0    47  +6 -0    54  +6 -0    index.ts +0 -0
```

They sum to **178**, not 186: `(22 × 5) + 18 + 26 + (6 × 4)` = `110 + 18 + 26 + 24`. The arithmetic is
off by 8. Step 1's "Measured source: 306" becomes 298 and its "~460" becomes ~452, neither of which
changes any decision. It matters only because these are the numbers the plan offers as *measured* and
a reviewer's cheapest check is to add them up; a total that does not reconcile with its own parts is
the thing that makes someone doubt the parts, which are correct.

**Resolution (applied)**: 186 → 178 in both places, 306 → 298, ~460 → ~452.

---

#### RESOLVED: the category-100 string is now displayed content and gets neither the token warning nor a default
R1a's `warnOnUnknownToken` exists because the token now decides whether a level re-offers the
walk-through, so a near-miss like `[Show me how]` would ship silently. The plan applies it to the two
Round columns only. The category-100 cell is normalized (`normalizeFeedback(raw)` with no
`defaultToken`) and never checked.

That row is no longer inert transcription. Verified against the spiked ladder: **all 11 top categories
walk `L1 → L2/category100`**, so this is the level-2 string every student who reaches the success
category will read, on every tab. Today all 11 cells carry `[Got it!]`, which is inside the authored
set, and the top category has no tour for a stray `[Show me]` to arm (its level-1 token is `[Hooray!]`
and `tourData` has no entry for it), so nothing is broken now. But the cell is exempt from both
guards the same change installs everywhere else it displays a string.

**Resolution (applied, option A)**: call `warnOnUnknownToken(sheetName, id, "Repeat feedback", …)` on the
captured row, one line next to the capture. Deliberately **not** giving it a default token: unlike the
Round columns, the `Hazbot: …\n[Token]` convention already exists for this cell and all 11 tabs follow
it, so a blank there is an authoring error worth a warning rather than an absence worth filling in.
Add the case to R11a/R11b's mechanism tests.

---

### Requirements Reviewer

#### RESOLVED: the fill-down rebuttal in requirements.md cites the two disputed cells as evidence and omits two real ones
This is in `requirements.md` rather than here, but it is the evidence base for R4b, the single decision
this plan says a sheet edit cannot absorb, and it is what Question 1 puts in front of Sam. The plan's
Q1 decision and its 9-line reversal both rest on it.

The Background paragraph argues that adjacent-row duplication is ordinary in the Round 2 column and
therefore not a drag-fill tell, and backs it with: *"seven duplicate runs among the middle categories
(23 cat4=cat5, 24 cat4=cat5, 25 cat4=cat5, 32 cat2=cat3 and cat4=cat5, 33 cat4=cat5, 35
cat2=cat3=cat4), none of which can be a fill-down one row too far because the rows below them hold
different text."*

Measured directly off the workbook, the adjacent-duplicate runs are:

| Tab | Top category | Duplicate runs |
|---|---|---|
| 23 | 5 | 4=5 **(this is the top row: the disputed cell)** |
| 24 | 5 | 2=3, 4=5 **(4=5 is the top row: the disputed cell)** |
| 25 | 6 | 2=3, 4=5 |
| 32 | 6 | 2=3, 4=5 |
| 33 | 6 | 4=5 |
| 34 | 5 | none |
| 35 | 7 | 2=3, 3=4 |

Two problems. **The list names `23 cat4=cat5` and `24 cat4=cat5` as middle-category evidence, but on
both tabs category 5 *is* the top category**, so those two runs are precisely the duplication under
dispute. Offering them as proof that such duplication is normal is circular. And the stated reason
they cannot be fill-downs ("the rows below them hold different text") is false for exactly those two:
on 23 and 24 the top category is the last populated row, so there is no row below at all, which is the
fill-down signature rather than a rebuttal of it. Separately the list omits two genuine middle-category
runs, `25 cat2=cat3` and `24 cat2=cat3`.

**The conclusion survives.** The corrected list is 32/2=3, 32/4=5, 33/4=5, 35/2=3=4, 25/2=3, 25/4=5,
24/2=3, which is still seven runs among genuine middle categories, on five tabs, every one with
different text below it. So adjacent duplication really is ordinary in this column and really is not a
tell, and R4b's case (five blank celebration rows plus the README) is unaffected.

**Resolution (applied, option A)**: replace the enumeration in requirements.md's Background with the corrected
one, and keep the count and the conclusion. The paragraph's own stated purpose is *"worth stating what
is not being offered as evidence, so the question is a fair one"* (in the Question 1 section), and it
currently does the opposite of that for the two cells the question is about. Sam is being asked to
adjudicate a drag-fill reading; the list handed to him should not include the cells in question.

**Refined by the deep dive before applying.** The first pass caught the two circular entries and the
two omissions. Measuring what sits *below* each run's last row went further: the stated reason ("the
rows below them hold different text") holds for only **four** of the nine runs, not seven. Three more
(25/4=5, 32/4=5, 33/4=5) sit above the blank celebration row, so they neither support nor undercut the
reading; two are the disputed cells with no row below at all. The four that survive are qualitatively
stronger than the seven claimed, which is why the corrected text leads with them rather than with a
count: each repeats the tab's **own** investigation name across adjacent categories (24 "Wind
Investigation", 25 "Mountain Investigation", 32 "Vegetation Investigation", 35 "Tree Survival
Investigation" three rows running), and a drag-fill cannot produce tab-specific meaningful text on four
separate tabs. R4b's case is unaffected either way, since it rests on the five blank celebration rows
and the README.

All three sites in `requirements.md` updated: the Background bullet, R4b's "not a second fact" clause,
and the Question 1 paragraph, which now says in as many words that the two 23/24 runs are excluded
because they are the cells the question is about.

---

### Re-review of round 2's own edits

Re-read the four steps after applying all seven. Two things this round's changes drifted, both
corrected in place; nothing else moved.

**Sizing.** Round 2 added source lines to two steps, so the estimates were stale for the same reason
the first round's were. Extract goes 298 to 302 source (the repeat-feedback token warning and its
comment, ~4 extractor lines) and ~452 to ~470 with its two new tests; Select goes ~255 to ~260 (the
widened `engineWith` helper); Surface goes 174 to 180 source and ~300 to ~306 (the playbook's
three-branch `roundNote` and the sidebar's `hasRepeatFeedback` prop). All four steps stay well under
the ~500-line guideline, and no step gained a dependency on a later one.

**Requirement coverage is unchanged**, which is the check worth stating rather than assuming: every
edit this round landed inside a step that already claimed the requirement it serves. R11i stays with
the Surface step, R11c/R11g with Select, R11a/R11b with Extract, and R9d's labeling stays with Surface.
No new requirement was created and none went unclaimed, so the coverage result recorded in the preamble
still holds.

---

## Self-Review round 3 (multi-role, 2026-08-22)

Roles: QA Engineer, Data Pipeline Engineer, Senior Engineer, Requirements Reviewer, Build/DevOps.
Every issue below was verified by **spiking the plan's own code verbatim** into the working tree
(types, `top-category.ts`, `feedback-levels.ts`, the five `hazbot-button.tsx` edits, the extractor,
the playbook generator, `engine-singleton.ts` and `app.tsx`), running the affected suites, then
reverting. Throwaway probe tests were written where a claim could not be read off the source. The
measurement is stated with each issue.

**What came back clean**, so a reader can tell verified-good from unchecked:

- The extraction is exactly as claimed: `+178 -0` across the 11 generated rule-sets, per-tab
  `23/24/25/32/33 +22`, `34 +18`, `35 +26`, `42/45/47/54 +6`, `index.ts` untouched, and tab 23
  categories 2 and 5 come out byte for byte as the plan prints them, including the level-aware
  default taking its `[Okay]` branch on the celebration row.
- `generate-hazbot-tour-data.js` and `dsl-grammar.md` come back with **no diff**, as R9 requires.
- All 11 generated rule-sets carry a `repeatFeedback` slot and none carries a category id at or
  above 100.
- The playbook generator produces `+67 -0` and the exact labeled output the plan prints, and the
  existing `playbook-impl.test.js` suite passes unchanged. Requiring the substrate's
  `top-category.ts` from plain-JS `playbook-impl.js` works under both ts-node and ts-jest.
- `npx tsc --noEmit` reports only the two pre-existing `line-chart.tsx` errors.
- Exactly **three** tests break in `hazbot-button.test.tsx` and exactly **two** in `app.test.tsx`,
  as claimed, and for the stated reasons.
- The ladder is correct. Driven through the real component with a throwaway probe, all six behaviors
  reproduce exactly: `1,2,3,3`; top category `1,2,2` with bodies `Great job!`, `Keep going!`,
  `Keep going!` (the fill-down never appears); no-Round-columns `1,1,1`; leave-and-return ending
  `{2: 2, 3: 1}`; a second press with the popover open giving two `HazbotButtonClicked` and **one**
  `HazbotFeedbackShown`; and the token gate giving `Show me / Show me / Okay` with
  `HazbotShowMeClicked` at levels 1 then 2.
- `isObservableMap(stores.ui.hazbotFeedbackLevels)` is `true`, so the Technical Notes anchor holds.
- The version bumps are safe: `version.test.ts` asserts only the semver shape and
  `rules-version.test.ts` only integer-at-least-1.
- R7c's "the gap is presses that opened no popover at all, and that is one situation only" survives
  the obvious counter-example. A press before the first run does **not** leave a gap:
  `computeMatchedCategoryFloor` (`evaluator.ts:298-308`) evaluates an explicit empty-prefix state, so
  `NOT ranSimulation` makes category 1 the floor with zero readings and the popover opens.

### QA Engineer

#### RESOLVED: the break inventory misses `extract-impl.test.js`, and "all 643 tests pass unmodified" is false
The preamble says *"The only existing tests that break are three in `hazbot-button.test.tsx` ...
plus two in `app.test.tsx`"* and *"all 643 tests under `src/hazbot` and `scripts` pass unmodified"*.
Measured by spiking step 1's extractor code verbatim and running `npx jest src/hazbot scripts`:
**642 passed, 1 failed**. The failure is `parseTab — categories › extracts categories with arrowText
when the column exists` (`extract-impl.test.js:69-73`), which asserts the whole category object with
`toEqual`:

```
- "feedback": "Good start!",
+ "feedback": "Hazbot: Good start!",
```

`normalizeFeedback`'s new third job, prepending the prefix when the cell lacks it, rewrites the
synthetic fixture's bare cells. The plan's no-op measurement (*"zero committed level-1 feedback cells
lack either the prefix or a trailing token"*) is about the **workbook**, and `SYNTHETIC_SHEETS`
(`extract-impl.test.js:12-40`) is a hand-written fixture that does not follow the workbook's
convention: its two feedback cells are `"Good start!"` and `"Try this!"`, neither prefixed. That is
exactly the gap between "no-op on the corpus" and "no-op on the fixtures", and the fixture is the
thing the step's own tests run against.

Three other tests in that file survive only by accident and are worth naming so nobody "fixes" them
later: the doubled-prefix test already carries the prefix, the hostile-content test asserts with
`toContain` (and its `"quote"` pair is an even number of quotes, so the strip does not fire), and the
`id >= 100` tests assert only ids.

**Suggested resolution**: update the expectation to `feedback: "Hazbot: Good start!"`, and add
`extract-impl.test.js` to the preamble's break inventory alongside the three button tests and the two
app tests. Correct "all 643 tests pass unmodified" to name the one that does not: the whole point of
that sentence is to tell the implementer what a red suite means at each step, and a red suite the
plan says cannot happen is the most expensive kind of surprise.

**Resolution (applied)**: the preamble now says six tests break and names the `extract-impl.test.js` one with its reason, and the "all 643 pass" sentence became "642 of 643". Step 1's test section carries the corrected expectation. Verified: with the fix, that file runs 14 passed, 0 failed.

---

#### RESOLVED: R11i's `app.test.tsx` half still cannot observe what the plan says it proves
Round 2 correctly diagnosed that a bare `buildFeedbackLevelDiagnostics: jest.fn()` makes R11i's
positive case vacuous, and fixed the **builder** mock. The vacuity is one layer further out and the
fix does not reach it. `app.test.tsx:18-20` mocks the sidebar itself:

```tsx
jest.mock("../hazbot/engine/sidebar", () => ({
  Sidebar: () => <div data-testid="hazbot-sidebar-mock" />,
}));
```

That component ignores `diagnostics` entirely, so *"the array handed to `Sidebar`"* is not observable
from that file at all. Verified with a throwaway probe that reproduces the file's mocks exactly and
renders the composition twice, once with the builder returning a row and once returning `[]`: both
cases render byte-identical DOM, both pass the same assertions, and nothing distinguishes
`undefined`, `[]`, and a two-row array. The only thing assertable today is
`expect(buildFeedbackLevelDiagnostics).toHaveBeenCalled()`, which proves neither the concatenation
nor the `undefined`-versus-`[]` guard the plan asks that file to prove.

This matters more than a normal test-quality point because R9b-i is the requirement with the
**measured** failure mode (the Diagnostics section vanishing on every URL without `?preset`), and
this is its only guard.

**Suggested resolution**: capture the prop in the sidebar mock and assert on it, then keep the rest of
round 2's fix as written:

```tsx
const sidebarDiagnostics = jest.fn();
jest.mock("../hazbot/engine/sidebar", () => ({
  Sidebar: (props: { diagnostics?: unknown }) => {
    sidebarDiagnostics(props.diagnostics);
    return <div data-testid="hazbot-sidebar-mock" />;
  },
}));
```

The positive case then asserts the captured array contains the level row with no preset row; the
negative case (`mockReturnValueOnce([])` on both halves) asserts it is `undefined` rather than `[]`.
Note in the step that the existing mock's props-ignoring shape is what has to change, since a reader
who only applies round 2's builder fix will believe the case is covered.

**Resolution (applied)**: step 4 now specifies both mock changes together, with the props-capturing `Sidebar` mock called out as the one that makes the assertion possible at all. Verified: `app.test.tsx` runs 7 passed, 0 failed, and the positive case (`[{ label: "Feedback levels", … }]`) and the negative case (`undefined`) are now distinguishable.

---

#### RESOLVED: a third fixture trap in `hazbot-button.test.tsx`, and it is the one most likely to bite
The plan names two mechanical traps (a single-category fixture silently becomes the top category; the
`engineWith` helper's parameter type cannot express the new fields) and pins both well. There is a
third, in the same file, in the path of the same tests, and it surfaces as an error that points
nowhere near its cause.

Every ladder case in R11c and every token-gate case in R11g runs on a **coaching** category, because
that is what R1a's level-aware default makes level 2 do. The dismissal route the file's feedback-panel
block uses everywhere (`act(() => { cmOpts.onDestroyed(); })`, e.g. `:236`, `:266`) is the
**`[Show me]` activation** route, not a close: with `offersTour` true it takes the
`phase === "intro" && !introCancelled && !cleanup && tour && offersTour` branch and launches the tour.
Measured while writing the ladder probe: the second press never happens and the test dies with
`TypeError: tourEngine.drive is not a function` at `hazbot-button.tsx:189`, which reads as a broken
coachmarks mock rather than a wrong dismissal.

Two things are needed and neither is in the plan. The ladder cases must close the popover through the
`×`/Escape route, `act(() => { cmOpts.onCancelRequested(); })` then `act(() => { cmOpts.onDestroyed(); })`,
which sets `introCancelled` so no tour launches. And the shared `cm` mock (`:67`) needs a `drive` spy,
since the token-gate cases deliberately do activate the tour. With both, all six behaviors reproduce.

**Suggested resolution**: add this to the fixture-constraint paragraph in step 2, next to the two traps
already there. It is three lines of guidance that save an hour of debugging a misleading error.

**Resolution (applied)**: added to step 2's fixture-constraint paragraph, beside the two traps already there, with the ×/Escape dismissal helper and the `drive` spy written out.

---

### Data Pipeline Engineer

#### RESOLVED: the new emission has no emitted-TS coverage, and the existing gate rejects it
`emitRepeatFeedback` adds a **new nesting level** to the generated module (a rule-set-level key beside
`categories` and `factorVariables`), and `emitCategory` gains two conditional lines. Every test the
plan specifies for step 1 asserts on `parseTab`'s return value. Nothing asserts on `tsSource`, and
nothing compiles it.

That leaves the repo's own gate for exactly this unused. `extract-impl.test.js:141-153` (`compileAndLoad`,
added per QA-2) writes the emitted module to a tmpdir and `require`s it through ts-node, so a compile
error is a test failure. It is what would catch a missing comma, a wrong nesting level, or a key
emitted outside the object literal, none of which `parseTab` tests can see.

It is not merely unused, it is currently **incompatible**. `compileAndLoad` substitutes an inline stub
for the substrate import:

```js
.replace('import { RuleSet } from "../engine";',
  "interface RuleSet<TDefaults> { id: string; categories: any[]; factorVariables: any[]; }")
```

Measured by emitting a synthetic tab carrying a category-100 row and running it through that exact
substitution:

```
error TS2322: Type '{ id: string; categories: ...; repeatFeedback: {...}; }' is not assignable to type 'RuleSet<any>'.
  Object literal may only specify known properties, and 'repeatFeedback' does not exist in type 'RuleSet<any>'.
```

Today's `SYNTHETIC_SHEETS` has no category-100 row and no Round columns, so the two existing
round-trip tests keep passing untouched. That is what makes this quiet: the guard does not fail, it
simply never sees the new code, and the first person to extend it hits a compile error in a helper the
plan never mentions.

**Suggested resolution**: two lines in step 1. Widen the stub to
`interface RuleSet<TDefaults> { id: string; categories: any[]; factorVariables: any[]; repeatFeedback?: any; }`,
and extend the round-trip case (or add one) to a fixture carrying a category-100 row and populated
Round columns, asserting the loaded module's `repeatFeedback` and `feedbackRound2`/`feedbackRound3`.
The corpus gate in `rule-sets/index.test.ts` is a re-extraction regression gate and does not substitute
for this: it runs against whatever the last re-extract wrote, so it cannot fail before the emitter has
already produced the file.

**Resolution (applied)**: step 1 now widens `compileAndLoad`'s stub with `repeatFeedback?: any` and adds a round-trip case over a synthetic tab carrying a category-100 row and populated Round columns. A separate fixture rather than an extension of `SYNTHETIC_SHEETS`, which six other tests depend on. Verified passing.

---

### Requirements Reviewer

#### RESOLVED: round 2's applied resolution for the sidebar's muted line contradicts the code it produced
The round-2 Senior Engineer issue resolves the `roundsSuperseded` divergence correctly, and step 4's
code implements it correctly. The **resolution prose** does not match the code it says it applied. It
reads:

> with the muted line's own condition becoming
> `roundsSuperseded && hasRepeatFeedback && (cat.feedbackRound2 || cat.feedbackRound3)` and a shorter
> fallback sentence when there is no repeat feedback to point at.

Those two clauses cannot both hold: gating the line on `hasRepeatFeedback` is exactly what makes the
fallback sentence unreachable. Step 4's code is the coherent version, rendering the line whenever the
top category carries Round content and switching only the wording:

```tsx
{roundsSuperseded && (cat.feedbackRound2 || cat.feedbackRound3) && (
  <div className="hazbot-sidebar-muted">
    {hasRepeatFeedback ? "Not shown: ... listed at the end of this panel." : "Not shown: ... no repeat feedback."}
```

Left as written, a reader who implements from the resolution rather than from step 4 gates the line on
`hasRepeatFeedback`, drops the fallback string, and reintroduces a milder form of the very divergence
the issue was raised to fix: on a rule-set with no category-100 row the top category's Round rows would
be labeled `not shown` with nothing on screen saying why.

**Suggested resolution**: correct the resolution paragraph to describe the ternary, so the two places
in this document that specify the same three lines agree.

**Resolution (applied)**: the round-2 resolution paragraph now describes the ternary, so the two places in this document that specify the same three lines agree.

---

### Build / DevOps

#### RESOLVED: leftover spike artifacts under `tmp/` make `npm test` red before any work starts
Round 2 records *"Probe artifacts live under `tmp/wm46-probe/` (gitignored)"*, and two of them are
**test files**:

```
tmp/wm46-probe/spike/ladder.test.js
tmp/wm46-spike/patched/app.test.tsx
```

Jest's `testRegex` matches them and `testPathIgnorePatterns` is only `/node_modules/` and `/cypress/`
(`package.json`), so jest collects them. Measured on the current working tree with **no** source
changes: `Test Suites: 2 failed, 76 passed, 78 total` (both failures are "Test suite failed to run",
since the patched modules they import no longer exist).

CI is unaffected because `tmp/` is gitignored, so this is housekeeping rather than a defect in the
plan. It matters anyway: the plan asks the implementer to run the suite at every step and to read the
break inventory literally, and a baseline that is already two suites red is the thing that makes
someone stop trusting the count.

**Suggested resolution**: delete both files (or the two directories) before starting, and say so in the
plan. Adding `"/tmp/"` to `testPathIgnorePatterns` is the durable fix if scratch spikes under `tmp/`
are going to keep happening, but that is a repo-config change beyond this branch's scope and should be
its own decision.

**Resolution (applied, option D)**: leave the artifacts and the jest config alone, and record the
two-red baseline in the verification preamble instead, next to the break inventory it would otherwise
distort. The `tmp/wm46*` directories hold the measurement trail behind this plan (the probe scripts,
`sheets.json`, and the Q1 reversal diffs), and Question 1 is still open with Sam, so they earn their
keep. The two stale files contribute 0 tests, so only the suite count is affected and every test
count quoted in this document stands as written. Adding `"<rootDir>/tmp/"` to
`testPathIgnorePatterns` is the durable fix if scratch spikes under `tmp/` keep happening (verified:
76 suites, 879 tests, all green), but it is a `package.json` change outside this branch and should be
its own decision.

---

### Re-review of round 3's own edits

Re-read the document after applying all six. One thing this round's own corrections had left
inconsistent, fixed in place; nothing else moved.

**The stale test count had a second site.** Open Question 2's *"Verified after implementing"* line also
claimed **643 tests pass** across `scripts` and `src/hazbot`, for the same reason the preamble's claim
was wrong, and correcting only the preamble would have left the document disagreeing with itself on the
one number a reviewer's cheapest check reproduces. Both now read 642 of 643, with the exception named.

**Requirement coverage is unchanged.** Every edit this round landed inside a step that already claimed
the requirement it serves: the `extract-impl.test.js` correction and the emitted-TS round trip stay
with R11a/R11b in the Extract step, the fixture-trap guidance with R11c/R11g in Select, and the two
mock changes with R11i in Surface. No new requirement was created and none went unclaimed.

**Sizing is unchanged in substance.** The round-3 additions are test code only: roughly 20 lines to
`extract-impl.test.js` (the widened stub, the corrected expectation and the round-trip case) and
roughly 12 to `app.test.tsx` (the props-capturing mock and the two R11i cases). Extract stays ~470 to
~490 and Surface ~306 to ~318, both well under the ~500-line guideline. No step gained a dependency on
a later one.

---

## Targeted execution pass over steps 3 and 4's sidebar half (2026-08-22)

Round 3 spiked and ran steps 1 and 2 in full, plus step 4's playbook and `app.tsx` halves. Two things
it reviewed by **reading** rather than by running are closed here with the same method (spike the
plan's code verbatim, run the affected suites and the linter, revert). They were singled out because
reasoning rather than executing is what let round 2 ship a resolution that round 3 then had to undo.

**Step 3 came back clean, and its two behaviors are now measured rather than argued.**
`npx tsc --noEmit` reports only the two pre-existing `line-chart.tsx` errors, and
`stores.test.ts` + `bottom-bar.test.tsx` run **35 passed, 0 failed** against the hoisted
`createStores()` and the widened `createTestHelpers(simulation, ui)` signature, so neither file needs
an edit for the signature change itself. Throwaway probes then drove the behavior through the real
components: `window.test.resetHazbotFeedbackLevels()` empties the map on **the same `UIModel` the
returned stores hold**, which is the whole point of the hoist and the thing that silently fails
without it; clicking the real `reload-button` through `BottomBar` clears both the map and
`hazbotLastFeedbackShown`; and clicking `restart-button` leaves the map intact, which is R3b's
deliberate asymmetry. Worth noting for whoever writes the step: `bottom-bar.test.tsx` currently
exercises `reload-button` only through `expectButtonState`, so R3b's case is net-new there rather
than an edit to an existing one, and it is writable with the file's existing `seedState` harness (a
`dataReady` + one spark is enough to enable the button).

**Step 4's sidebar half came back clean on types and tests, and dirty on lint.** `sidebar.test.tsx`
runs **28 passed, 0 failed** unmodified, confirming that dropping the structural cast, taking the real
`Category` type, and threading `roundsSuperseded` / `hasRepeatFeedback` breaks none of its ten
`makeRuleSet()` sites (that fixture's single category carries no Round content, so every new row is
gated off). Five throwaway probes then pinned R9d against the real component: a middle category
renders unlabeled Round rows; the top category renders them labeled `not shown` with the muted
explanation; **the labeling holds with `repeatFeedback` absent**, which is the round-2 resolution's
load-bearing claim, and the muted line switches to its no-repeat-feedback wording; a category with no
Round content renders no rows at all rather than empty ones; and the repeat-feedback row renders
exactly once per rule-set and not at all without the slot. The lint failure and its fix are below.

### RESOLVED: the step-4 sidebar JSX as written fails `npm run lint`

The two Round rows were written with the closing `</div>` on the same line as the `</span>`:

```tsx
<div><strong>Feedback (level 2{roundsSuperseded ? ", not shown" : ""}):</strong>{" "}
  <span style={{ whiteSpace: "pre-wrap" }}>{cat.feedbackRound2}</span></div>
```

Measured: `npx eslint src/hazbot/engine/sidebar/sidebar.tsx` reports
`270:83 error Closing tag of a multiline JSX expression must be on its own line
react/jsx-closing-tag-location`, twice, once per row. The file lints clean at baseline, and
`npm run lint` is a documented command in `CLAUDE.md`, so this would fail the branch. It slipped
through because the row it was copied from, the existing `Feedback:` line, is a **single**-line JSX
expression, where the rule does not apply; adding the ternary is what makes it multiline.

**Resolution (applied)**: both rows reformatted with the open and closing tags on their own lines.
Verified: eslint clean, `tsc` clean, `sidebar.test.tsx` 28 passed, and the whole of `src/` at
**72 suites / 835 tests passed** with steps 3 and 4's sidebar half applied together.

**Also added**, since it cost real time while probing: the inverted form of the fixture trap the plan
already documents, recorded next to it in step 2. The plan says an R11h fixture needs a higher-id
category so a middle category exists. The other half is that the row you want labeled has to sit on
the **highest id**. A three-category fixture with the celebration content on id 2 and a bare category
on id 3 renders every row unlabeled and fails with
`Unable to find an element with the text: Feedback (level 2, not shown):`, plus Testing Library's
"the text is broken up by multiple elements" hint, which sends the reader after the matcher instead of
the fixture.

### What this pass did not find

Nothing in the design, and nothing in step 3 at all. Every claim those two steps make about existing
files held: the `createStores()` ordering, the `handleReload` scope, the cast removal, the prop
threading, and the top-category-alone gate. The one issue was formatting in a code block, which is the
class of thing a fourth read-through would not have caught either, and which only running the linter
does.
