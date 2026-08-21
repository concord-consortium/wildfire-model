# Implementation Plan: Hazbot: analysis should reflect the last run, not the best one

**Jira**: https://concord-consortium.atlassian.net/browse/WM-45
**Requirements Spec**: [requirements.md](requirements.md)
**Status**: **In Development**

## Pre-implementation verification

Four checks were run against the requirements spec before this plan was written. All spike
code was reverted; the baseline suite is green at 72 suites / 796 tests. Findings are
recorded in the branch oob file `wm45-spike-findings.md`, and the spike sources (including
the full plumbing diff) are preserved under the session scratchpad at
`wm45-spike/`. Three of the four changed this plan:

1. **The trim cannot resolve by identity.** `canonicalRunReadings` returns a
   *clone* for any pause/resume-folded run (`canonical-runs.ts` `foldResume` returns
   `{...base}`), so `readings.indexOf(run)` is `-1` for exactly the runs Decision 4 exists
   to handle. Measured on a tab-47 session (clean run, then a paused run carrying a
   helitack on its first start, then a fireline run): an identity trim degrades to
   `slice(-1)`, and a "last N raw `SimulationStarted`" trim starts at the resume and returns
   **category 5, the celebration**, where the correct window returns 4. A second shape
   (paused run then a clean run) gives 3 / 3 / **5**, so both naive trims under-report there.
   **Amended by the eighth-pass review**: this originally resolved the clone by timestamp,
   reusing the `readingIndexOf` rule the sidebar uses (`evaluator.ts:159-163`). That rule is
   a heuristic, and `at` carries no uniqueness contract, so it can return an earlier
   reading's index and silently widen the window. The trim now takes exact indices from the
   canonical-run walk instead; see the Derive step.
2. **`EngineOpts` is the right route for the window, not `AnalysisEngineProviderProps`.**
   `hazbot-button.tsx` reads the engine through `getAnalysisEngine()` at both call sites
   (`:119`, `:245`) with no React context, so a prop-borne selector cannot serve them.
   `computeView`'s WeakMap is keyed on `(snapshot, appRulesVersion)` only, and a test
   confirmed it returns a stale `categoryCurrent` when the selector changes with no engine
   event in between. An `EngineOpts` selector is fixed for the engine's lifetime, so the
   cache key needs no change.
3. **A two-run enumeration never exercises R12a's upward bar.** Upward moves first appear
   on tab 45 at depth 3 (35 of 512, then 308 of 4096 at depth 4, matching the Technical
   Notes exactly). At depth 2 every tab has zero. So the committed sweep runs tab 45 at
   depth 3; every other positive-`range_cc` tab stays at depth 2.

Also confirmed and used below: the `range_cc` derivation reproduces all eleven of Sam's
values from the parsed ASTs; R3a's screen passes; the R7 binding flip leaves the suite
green at the *current* baseline (796 tests, not the 743 quoted in the spec, which predates
WM-51's additions); live UI events produce readings field-identical to the Jest fixtures;
`best` 5 / `current` 2 reproduces in the browser on R8a's exact scenario, with the sidebar
truth vector `{1:✗, 2:✗, 3:✓, 4:✗, 5:✓}` and the matched highlight on 5.

**A fifth check, added during the cross-reference review, changed the substrate signature.** An
earlier draft of this plan had `makeReadingsWindow` return an *empty* window for `range_cc` 0 and
claimed the case was guarded by never installing a selector on such an activity. That guard cannot
exist: `deriveRangeCc` reads `engine.parsedExpressions`, so the value is unknown at the line where
`EngineOpts` is assembled, which is the whole reason the selector takes a thunk. Installed
unconditionally and returning an empty window, `highestTrueAt` evaluates the empty-prefix state,
which matches `NOT ranSimulation` on every tab. Measured on tab 24, the one `range_cc` 0 activity,
over a two-run history that changes zones and wind: `best` 5, empty-window `current` **1**, so
`current ?? best` selects 1 and the student is shown "I will analyze your model after you run it!
... **Scroll up!**" no matter what they did. So the selector's return type is
`WindowSelection<TReading> | null` and `computeCurrentCategoryForEngine` returns `null` when the
selector does. R4 is unchanged; this is the plan catching up to it.

Everything else in the requirements spec was re-verified against the code rather than taken on
trust, and all of it holds: every `file:line` citation in both specs resolves to the line it names;
the tab 23, 45 and 47 baseline series below are byte-identical to a fresh derivation; the move
counts (23: 29 of 81, 45: 185 of 512 at depth 3 with 35 upward, all `2 -> 3`, 47: 0 of 64) and the
depth-2 upward count of 0 for tab 45 all reproduce; R13, R13a and R8a give 5/4, 2/3 and 5/2
exactly; the `top:` values in `BASELINES` (23 → 5, 45 → 4, 47 → 5) match the rule-set files; and
`tsconfig.json` does target `lib: ["dom","es5","es2017"]`, so the `flatMap` / `Object.fromEntries`
constraint is real.

## Implementation Plan

### Add the readings-window selector to the substrate

**Summary**: The additive substrate API the whole story hangs off: a host-supplied
selector that narrows the readings `category.current` is evaluated over, plus the
evaluator entry point that uses it. Nothing wildfire-side yet, so behavior is unchanged
after this commit (no engine is constructed with a selector). This is the surface R10b
bumps `ENGINE_VERSION` for, so the bump lands here rather than in a docs step.

**The versioned surface is three things, not one.** R10b's Technical Note names only the
readings-window selector, but this commit adds `EngineOpts.readingsWindow`,
`computeCurrentCategoryForEngine` / `computeCategorySelectionForEngine`, and
`categoryExpressions`. The third exists because of a boundary rule worth stating outright:
**production host code goes through `src/hazbot/engine/index.ts`; test files may deep-import,
and already do** (`test-helpers.ts` takes `computeMatchedCategoryFloor` and `makeRenderCtx`
from `../engine/evaluator`). Verified that no production file outside the substrate imports
substrate internals today, so `deriveRangeCc` reaching for `CachedAst` and
`PARSE_ERROR_SENTINEL` would be the first, in the very commit that declares what `0.1.0`
covers. `categoryExpressions` keeps the sentinel internal instead. R3a's use of
`walkReferences` stays a test-file deep import under the same rule and adds nothing to the
public API.

**Files affected**:
- `src/hazbot/engine/types.ts`: add the `WindowSelection` interface
- `src/hazbot/engine/engine.ts`: `readingsWindow` on `EngineOpts`, public field, constructor assignment
- `src/hazbot/engine/evaluator.ts`: `computeCurrentCategoryForEngine`, `computeCategorySelectionForEngine`, `categoryExpressions`
- `src/hazbot/engine/index.ts`: export the new functions and types
- `src/hazbot/engine/version.ts`: `0.0.1` to `0.1.0`
- `src/hazbot/engine/evaluator.test.ts`: coverage for both new entry points

**Estimated diff size**: ~185 lines

`src/hazbot/engine/types.ts`, new export:

```ts
// What a host's readings-window selector returns. The substrate is host-app-agnostic
// and cannot know what a "run" is, so the host decides which suffix of the readings
// `category.current` is evaluated over and describes that choice in its own vocabulary.
export interface WindowSelection<TReading extends BaseReading> {
  // The readings to evaluate over. A suffix of the array passed in, though the
  // substrate does not require that.
  readings: TReading[];
  // Free-text host description of the window, rendered verbatim by the dev sidebar
  // (wildfire supplies e.g. "range_cc 2 · 2 of 3 runs"). Never parsed by the substrate.
  label?: string;
}
```

`src/hazbot/engine/engine.ts`, inside `EngineOpts` after `defaults`:

```ts
  // Host-supplied trailing-window selector for `category.current` (WM-45 R2/R3).
  // Called lazily during evaluation, never during construction: a host that derives
  // its window size from the parsed expressions cannot compute it until this
  // constructor has returned. Omit it and `computeCurrentCategoryForEngine` returns
  // null, which is the "this activity has no window" state R4 falls back from.
  //
  // Returning null from the selector is the SAME "no window" answer, reachable at
  // evaluation time rather than at construction time. That distinction is not
  // cosmetic: a host whose window size comes from the parsed expressions cannot know
  // whether the activity has a window until after this constructor returns, so it has
  // no opportunity to omit the option. Without a nullable return, such a host is
  // forced to hand back an empty window, which evaluates the empty-prefix state and
  // matches the activity's "did not run the simulation" category instead of reading
  // as undefined.
  readingsWindow?: (readings: TReading[]) => WindowSelection<TReading> | null;
```

and, beside `requestedRuleSetId` on the class plus its constructor assignment beside
`this.defaults = opts.defaults;`:

```ts
  readingsWindow: EngineOpts<TReading, TDefaults>["readingsWindow"];
```
```ts
    this.readingsWindow = opts.readingsWindow;
```

`src/hazbot/engine/evaluator.ts`, appended beside `computeMatchedCategoryForEngine`:

```ts
export interface CurrentCategoryResult {
  // The highest category true at the end of the window, or null when none is (R4).
  category: number | null;
  // The host's description of the window it evaluated over (WindowSelection.label).
  label?: string;
}

// `category.current`: ONE evaluation at the end of the host-supplied window, with no
// floor over prefixes (R3b) so the monotone ratchet is not reintroduced at window
// scale on the two range_cc = 2 activities.
//
// Returns null (not `{ category: null }`) when the engine is inactive, when the host
// supplied no selector, or when the selector itself returns null. The distinction is
// load-bearing: R9b needs a logged `categoryCurrent: null` to be attributable either to
// "this activity has no window" or to "the window matched nothing", and only the caller
// can tell those apart.
//
// The selector's null is the case a host with a derived window size actually hits (see
// EngineOpts.readingsWindow). It must NOT be collapsed into an empty window: `highestTrueAt`
// over an empty readings array evaluates the empty-prefix state, which on every wildfire tab
// matches category 1, `NOT ranSimulation`. Measured on tab 24 (the one range_cc = 0 activity)
// with a two-run history: best 5, empty-window current 1, so a `current ?? best` consumer
// selects 1 and shows "I will analyze your model after you run it! ... Scroll up!" to a
// student who has run the model twice. That is a worse version of the bug WM-45 exists to fix.
export function computeCurrentCategoryForEngine<TR extends BaseReading, TD>(
  engine: Engine<TR, TD>,
): CurrentCategoryResult | null {
  if (!engine.isActive || !engine.ruleSet || !engine.readingsWindow) return null;
  const selection = engine.readingsWindow(engine.readings);
  if (!selection) return null;
  const ctx = makeRenderCtx(
    selection.readings, engine.defaults, engine.factorVariables, engine.simProps,
  );
  return {
    category: highestTrueAt(engine.ruleSet, engine.parsedExpressions, ctx),
    label: selection.label,
  };
}

export interface CategorySelection {
  // Today's algorithm, monotone floor included. Unchanged by WM-45 and what
  // `matchedCategory` logs (R9).
  best: number | null;
  // Highest category true at the end of the host's window, or null when the host
  // supplied no window or nothing matched in it (R4).
  current: number | null;
  // What a consumer should SHOW. The single home of R6's selection rule.
  used: number | null;
  // The host's description of the window (WindowSelection.label), or undefined.
  label?: string;
}

// The one place R6's selection rule lives. Every consumer that shows or logs a
// category reads `used` from here rather than restating `current ?? best`, because
// that expression had been written out at three separate call sites (the feedback
// component, the sidebar view, and the replay-fixture generator) with nothing tying
// them together. `current` is NOT bounded above by `best`: on tab 45 a trailing
// window can make a NOT-guarded lower category true that was false over the full
// history, and the feedback follows `current` in that direction too (R6a). An
// earlier draft took min(best, current), which reinstates the bug WM-45 exists to
// fix, so this function must never acquire a min. The regression cases that pin the
// upward direction live in hazbot-button.test.tsx and sidebar.test.tsx, since those
// exercise this function through the code the student actually sees.
export function computeCategorySelectionForEngine<TR extends BaseReading, TD>(
  engine: Engine<TR, TD>,
): CategorySelection {
  const best = computeMatchedCategoryForEngine(engine);
  const result = computeCurrentCategoryForEngine(engine);
  const current = result ? result.category : null;
  return { best, current, used: current ?? best, label: result?.label };
}

// The successfully-parsed expression for each category id, with parse failures omitted.
//
// Exists so a host can walk the ASTs the engine already parsed without importing the
// substrate's parse-error sentinel. `engine.parsedExpressions` is a public field typed
// `Map<number, CachedAst>`, but `CachedAst` and `PARSE_ERROR_SENTINEL` are NOT on
// index.ts, so today a host cannot read that field safely through the public API. WM-45's
// `deriveRangeCc` is the first production host code that needs to, and this is the
// narrower answer than exporting the sentinel: the sentinel stays internal and free to
// change, and the host gets a map it can iterate without a guard.
export function categoryExpressions<TR extends BaseReading, TD>(
  engine: Engine<TR, TD>,
): Map<number, Expression> {
  const out = new Map<number, Expression>();
  engine.parsedExpressions.forEach((ast, id) => {
    if (ast !== PARSE_ERROR_SENTINEL) out.set(id, ast);
  });
  return out;
}
```

`src/hazbot/engine/index.ts`:

```ts
export {
  computeMatchedCategoryForEngine, computeCurrentCategoryForEngine,
  computeCategorySelectionForEngine, categoryExpressions,
} from "./evaluator";
export type { CurrentCategoryResult, CategorySelection } from "./evaluator";
export type { WindowSelection } from "./types";
```

`src/hazbot/engine/version.ts`:

```ts
export const ENGINE_VERSION = "0.1.0";
```

`version.test.ts` needs no edit: it asserts the semver *shape*, not the value.

Tests to add in `evaluator.test.ts` (the existing file already builds test engines, so
these follow its local helpers):

- no selector supplied returns `null`, and an inactive engine returns `null` even with one
- **a selector that returns `null` returns `null`**, and specifically does not fall through to
  an empty-window evaluation. Assert against a rule set whose category 1 is `NOT ranSimulation`
  and a readings array that matches something higher, so a regression here reads as "category 1
  on a student who has run the model" rather than as an off-by-one
- a selector returns the highest category true over the slice, and the `label` rides through
- **no floor within the window (R3b)**: readings where a high category is true at an
  interior prefix and false at the end resolve to the end value, while
  `computeMatchedCategoryFloor` over the same array still returns the high one
- an empty window (`{ readings: [] }`) evaluates the empty-prefix state rather than throwing
- `computeCategorySelectionForEngine` returns `used === current` when `current` is non-null
  **in both directions**, including `best` 2 / `current` 3, and `used === best` when the
  selector returns null. The upward case is the one a `min` would break, so assert it here as
  well as in the two component tests

---

### Derive range_cc and supply the wildfire window

**Summary**: The wildfire half of the window: Sam's `range_cc` derivation over the parsed
expressions (R5), the `at`-resolved canonical-run trim (R2, R2a, R2b), the singleton
wiring, and `rangeCc` on the `AnalysisEngineActivated` payload (R9b). After this commit
`current` is computed but nothing consumes it yet, so student-facing behavior is still
unchanged.

**Files affected**:
- `src/hazbot/wildfire/range-cc.ts`: new, the derivation
- `src/hazbot/wildfire/canonical-runs.ts`: `canonicalRunStartIndices`, from the same walk
- `src/hazbot/wildfire/canonical-runs.test.ts`: the run-start-index cases
- `src/hazbot/wildfire/run-window.ts`: new, the trim and the selector factory
- `src/hazbot/wildfire/engine-singleton.ts`: lazy selector wiring, `rangeCc` on the payload, `getDerivedRangeCc`, memo cleared in `_resetAnalysisEngineForTests`
- `src/hazbot/wildfire/index.ts`: export `getDerivedRangeCc` if the barrel gates it
- `src/log.ts`: pass the derived `range_cc` to the payload builder
- `src/log.test.ts`: one line in the module mock (see below), required rather than optional
- `src/hazbot/wildfire/range-cc.test.ts`: new (R5a, R3a)
- `src/hazbot/wildfire/run-window.test.ts`: new (the folded-run cases)

**Estimated diff size**: ~330 lines

`src/hazbot/wildfire/range-cc.ts`:

```ts
import { Expression } from "../engine";

// Sam's `range_cc` derivation ("Translating Data Insights into Feedbacks", last three
// subtabs), restated: range_cc is assigned PER OCCURRENCE, not per variable. An
// occurrence carrying a prop expression (`ranSimulation WITH …`) scores 1 and a bare
// occurrence (`setAnyVar`, `uniqueWindValuesUsed.size > 1`, even a bare `ranSimulation`)
// scores 0; NOT preserves its operand; OR takes the max; AND sums. The activity value is
// the plain numeric max across its categories.
//
// Deriving rather than hardcoding is R5: a re-extract that moves a value fails the pin in
// range-cc.test.ts with Sam's number on one side and the sheet's on the other, instead of
// silently windowing an activity wrongly. Tab 34 moved 0 to 1 on the previous branch for
// exactly that reason.
export function rangeCcOfExpression(expr: Expression): number {
  switch (expr.kind) {
    case "with": return 1;
    case "not": return rangeCcOfExpression(expr.child);
    case "or": return Math.max(rangeCcOfExpression(expr.left), rangeCcOfExpression(expr.right));
    case "and": return rangeCcOfExpression(expr.left) + rangeCcOfExpression(expr.right);
    case "boolean-leaf":
    case "accessor":
    case "comparison":
    case "literal":
    case "sim-prop-leaf":
      return 0;
    default: {
      const exhaustive: never = expr;
      throw new Error(`rangeCcOfExpression: unhandled kind ${(exhaustive as { kind: string }).kind}`);
    }
  }
}

// Takes the map `categoryExpressions(engine)` returns: parse failures are already dropped,
// so there is no sentinel to guard against and the substrate's internal AST-cache
// representation stays out of wildfire.
export function deriveRangeCc(exprs: Map<number, Expression>): number {
  let max = 0;
  exprs.forEach((ast) => { max = Math.max(max, rangeCcOfExpression(ast)); });
  return max;
}
```

`src/hazbot/wildfire/canonical-runs.ts` gains an index-returning sibling, and both it and
`canonicalRunReadings` become thin wrappers over one walk so the two can never disagree
about where a run begins. The body is today's loop with `for (const r of readings)` replaced
by an indexed loop and one `startIndices.push(i)` beside the existing `runs.push(r)` in the
not-a-resume branch:

```ts
export function canonicalRunReadings(readings: WildfireReading[]): WildfireReading[] {
  return canonicalRunWalk(readings).runs;
}

// Index into `readings` of the first SimulationStarted of each canonical run, in run
// order. Produced by the SAME walk as canonicalRunReadings, so the two cannot disagree
// about where a run begins, and exact rather than resolved after the fact.
//
// WM-45 needs this because the window trim cannot recover a run's index from the run
// itself. foldResume returns a shallow clone, so indexOf is -1 for exactly the
// pause/resume runs Decision 4 exists to handle; and matching the clone's `at` (the rule
// readingIndexOf uses for the sidebar's "Matched on reading #N" label) is a heuristic,
// because `at` carries no uniqueness contract. findIndex returns the FIRST reading with
// that timestamp, so a collision resolves to an earlier run and the window silently
// widens to the whole session: the bug WM-45 exists to fix, with no symptom at the call
// site. A wrong index only mislabels a diagnostic in readingIndexOf's case; here it
// changes which readings category.current is computed from, so it is worth being exact.
export function canonicalRunStartIndices(readings: WildfireReading[]): number[] {
  return canonicalRunWalk(readings).startIndices;
}

function canonicalRunWalk(readings: WildfireReading[]): {
  runs: WildfireReading[]; startIndices: number[];
} { /* today's loop, indexed, pushing i alongside each non-resume run */ }
```

Cases for `canonical-runs.test.ts`: the indices align with `runs` one-for-one across the
pause/resume and reset shapes the file already exercises (`starts.map((i) => readings[i].at)`
equals `runs.map((r) => r.at)`); leading non-run readings do not shift them
(`[ChartTabShown, start, end, start]` gives `[1, 3]`); and an empty readings array gives
`[]`. Verified: the refactor leaves the full suite green at 72 suites / 796 tests.

`src/hazbot/wildfire/run-window.ts`:

```ts
import { WindowSelection } from "../engine";
import { canonicalRunReadings, canonicalRunStartIndices } from "./canonical-runs";
import { WildfireReading } from "./types";

// Index of the first reading belonging to the `rangeCc`-th canonical run from the end,
// or 0 when the session holds fewer runs than that (R2b: evaluate over the runs that
// exist rather than treating a short session as insufficient data).
//
// Reads the index straight off the canonical-run walk rather than recovering it from a run
// object. Neither recovery route is sound: a folded run is a clone, so indexOf is -1, and
// matching on `at` returns the FIRST reading with that timestamp, which silently widens the
// window when timestamps collide. See canonicalRunStartIndices for the full reasoning.
export function canonicalRunWindowStart(readings: WildfireReading[], rangeCc: number): number {
  if (rangeCc <= 0) return 0;
  const starts = canonicalRunStartIndices(readings);
  if (starts.length <= rangeCc) return 0;
  return starts[starts.length - rangeCc];
}

// Builds the EngineOpts.readingsWindow selector. `rangeCcFn` is a thunk because the
// derivation reads engine.parsedExpressions, which does not exist until the Engine
// constructor has returned (see engine-singleton.ts).
//
// The newest canonical run counts even when it has not finished (R2a): canonicalRunReadings
// pushes a run at its SimulationStarted and applies no completeness test, so a student who
// pauses mid-run and asks for analysis is told about the run they are watching.
// The range_cc 0 answer is null, and it has to be decided HERE rather than by declining to
// install the selector. rangeCcFn cannot be called until the Engine constructor has returned,
// so engine-singleton has no opportunity to test the value while it is still assembling
// EngineOpts; the selector is installed unconditionally and reports "no window" on its first
// call instead.
export function makeReadingsWindow(
  rangeCcFn: () => number,
): (readings: WildfireReading[]) => WindowSelection<WildfireReading> | null {
  return (readings) => {
    const rangeCc = rangeCcFn();
    // R4: range_cc 0 means `current` is undefined for this activity, and null is how the
    // substrate is told so. Returning an EMPTY window instead is the failure mode this
    // branch exists to prevent: highestTrueAt over an empty readings array evaluates the
    // empty-prefix state, which matches `NOT ranSimulation` on every tab. Measured on tab
    // 24, the one range_cc = 0 activity, over a two-run history: best 5, empty-window
    // current 1, so `current ?? best` in hazbot-button and in the sidebar both select 1 and
    // the student is told to scroll up and run the model they just ran twice.
    if (rangeCc === 0) return null;
    const start = canonicalRunWindowStart(readings, rangeCc);
    const slice = readings.slice(start);
    const covered = canonicalRunReadings(slice).length;
    return {
      readings: slice,
      // "range_cc 2 · 2 of 3 runs". The covered count is always min(rangeCc, total), so it
      // carries no information the other two numbers do not; the number a walker cannot
      // otherwise recover is the TOTAL, which says how many runs the window is ignoring.
      // Keep all three anyway: R8 asks for the window size and the covered count by name,
      // and "2 of 3" reads more directly than making the reader do the arithmetic.
      label: `range_cc ${rangeCc} · ${covered} of ${canonicalRunReadings(readings).length} runs`,
    };
  };
}
```

`src/hazbot/wildfire/engine-singleton.ts`, inside `getAnalysisEngine`, before the `try`:

```ts
  // The selector must be lazy: deriveRangeCc reads engine.parsedExpressions, and the
  // Engine parses inside its constructor, so the value does not exist at the moment
  // EngineOpts is assembled. getDerivedRangeCc (below) memoizes at module scope, so the
  // selector and log.ts share one derivation rather than each doing their own.
  //
  // Installed UNCONDITIONALLY, including on a range_cc = 0 activity. That is forced by the
  // same laziness: the value is unknown on this line. The "no window" answer is the
  // selector's null return, not the absence of a selector (see makeReadingsWindow).
  const readingsWindow = makeReadingsWindow(getDerivedRangeCc);
```

with `readingsWindow` added to the `new Engine({...})` opts, and `cached = engine;`
already assigned before any evaluation happens (it is, at the end of the `try`).

Three additions for R9b:

```ts
// Derived range_cc for the active engine, or 0 when there is no engine or no rule set.
// Memoized at module scope beside the engine itself: it is a per-activity constant for the
// page, both the window selector and log.ts read it, and deriving it twice would let them
// disagree if the memo were ever seeded differently.
//
// Exported because R9b carries it on AnalysisEngineActivated: without it a logged
// `categoryCurrent: null` is uninterpretable, since R4 gives it two causes (the activity's
// range_cc is 0, and no category matched at the end of the window) that log identically,
// and the value cannot be recovered after the fact because R5 derives it from the
// expressions rather than authoring it.
let rangeCcMemo: number | undefined;

export function getDerivedRangeCc(): number {
  if (rangeCcMemo !== undefined) return rangeCcMemo;
  const engine = getAnalysisEngine();
  // Not memoized when there is no engine yet: getAnalysisEngine is itself lazy, and
  // caching a 0 from a pre-initialization call would stick for the page's lifetime.
  if (!engine?.ruleSet) return 0;
  rangeCcMemo = deriveRangeCc(categoryExpressions(engine));
  return rangeCcMemo;
}
```

and the existing test reset hook (`engine-singleton.ts:84`, today `cached = undefined; init =
"uninit";`) clears the memo too. The memo is per-engine, so it has to reset with the engine:

```ts
export function _resetAnalysisEngineForTests(): void {
  cached = undefined;
  init = "uninit";
  rangeCcMemo = undefined;
}
```

Without that line the failure is silent and green-looking rather than loud. A Jest file that
builds an engine for tab 24, resets, then builds one for tab 45 keeps `rangeCcMemo === 0`, so
tab 45's selector returns null (the R4 path above), `current` is null throughout, and every
windowed assertion in the file passes vacuously against `best`. It is reachable on day one
rather than hypothetically: `engine-singleton.test.ts` already drives this hook, and R9b's
`rangeCc` payload assertions land in that same file.

and the payload builder gains a third parameter rather than reaching for globals, keeping
the "single shape source-of-truth, assembled from arguments" property its comment claims:

```ts
export function buildAnalysisEngineActivatedPayload(
  ruleSetId: string,
  presetInfo?: RequestedPresetInfo,
  rangeCc?: number,
): {
  engineVersion: string; appRulesVersion: string | number; ruleSetId: string;
  rangeCc?: number; preset?: string; presetRecognized?: boolean;
} {
  return {
    engineVersion: ENGINE_VERSION,
    appRulesVersion: APP_RULES_VERSION,
    ruleSetId,
    ...(rangeCc !== undefined ? { rangeCc } : {}),
    ...(presetInfo ? { preset: presetInfo.preset, presetRecognized: presetInfo.recognized } : {}),
  };
}
```

`src/log.ts` at the single call site (`:39`):

```ts
      buildAnalysisEngineActivatedPayload(engine.ruleSet.id, getRequestedPresetInfo(), getDerivedRangeCc()),
```

That line breaks `src/log.test.ts` until its module mock is widened, so the two land in the
same commit. `loadLogWithMocks` installs a `jest.doMock("./hazbot/wildfire", …)` factory
returning exactly three exports, and `getDerivedRangeCc` is undefined at the call site.
Measured: 2 of its 4 tests fail, and adding this line to the factory turns all four green:

```ts
      getDerivedRangeCc: () => 1,
```

Worth naming precisely so the mock line lands in the same commit as the `log.ts` edit rather
than being chased afterwards; the failure itself is self-describing
(`TypeError: (0 , wildfire_1.getDerivedRangeCc) is not a function`, quoting `log.ts:39`). The
existing `ACTIVATED_PAYLOAD` assertion needs no change, since the mocked builder ignores the
third argument. Two neighboring suites were checked and need nothing: `app.test.tsx` mocks
the same barrel but `app.tsx` never calls the new function, and `engine-singleton.test.ts`
asserts the payload with `toEqual` on two-argument calls, which the optional-and-spread
`rangeCc` leaves untouched (27 tests, unchanged).

`range-cc.test.ts` (R5a and R3a), pinning Sam's table so a re-extract that moves a value
fails visibly:

```ts
const SAM_RANGE_CC = {
  "23": 1, "24": 0, "25": 1, "32": 1, "33": 1, "34": 1, "35": 1, "42": 1, "45": 2, "47": 2, "54": 1,
};
const RANGE_ZERO_VARS = ["uniqueWindValuesUsed", "uniqueNonZeroWindValuesUsed", "triedAllVegetations"];
```

with two cases: the derivation reproduces `SAM_RANGE_CC` for all eleven tabs, and no tab
with a positive `range_cc` references a range-0 factor variable (R3a, walked via
`walkReferences` over each tab's parsed ASTs). `walkReferences` is substrate-internal and
stays that way: this is a test file, and test files may deep-import (see the boundary rule in
the selector step). Both cases were run against the branch and pass. The second case's failure message should
say plainly that Sam's reuse-from-`best` rule now needs implementing, since that is the
whole reason the assertion exists.

`run-window.test.ts`, the cases the spike established:

- `canonicalRunReadings` returns a clone for a folded run, so `indexOf` is `-1` while the
  clone keeps `base.at` and the merged `helitack: true`. The trim resolves it anyway,
  because it never looks the run up
- the window the trim produces classifies tab 47 as 4 where a raw-`SimulationStarted` trim
  gives 5
- **a colliding `at` does not move the window**: give an earlier reading the same timestamp
  as the folded run's first start and the trim still returns that run's index. This is the
  case the superseded `at` fallback got wrong (measured: it returned 0 instead of 2, widening
  the window to the whole session), and it is the reason the trim is index-based. Worth
  pinning rather than trusting, because the shared fixture builders make the collision easy
  to reach by accident: `mkReading(triggeredBy, opts.at ?? 100, …)` (`test-helpers.ts:62`)
  and every tab's `startReading` default `at` to **100 for every reading**, so any
  multi-reading fixture written without explicit per-reading timestamps collides
- the mirror shape (paused run then a clean run) is 5 correct against 3 for both naive trims
- fewer runs than `range_cc` trims to index 0 (R2b), and a one-run session on a
  `range_cc = 2` tab evaluates rather than reading as insufficient data
- an unfinished newest run is inside the window with no `SimulationEnded` present (R2a)
- the `label` reports the covered and total run counts, in the form the type's doc comment
  advertises. The covered count is always `min(rangeCc, total)`, so the reachable labels are
  `range_cc R · R of N runs` for every `N >= R`, plus the short-session cases
  `R · 0 of 0` and `R · 1 of 1`. Enumerated over 0 to 5 runs at `rangeCc` 1 and 2 that is
  twelve labels. Note that `range_cc 2 · 1 of 2 runs` is unreachable, since a two-run session
  with rangeCc 2 covers both
- **`rangeCcFn` returning 0 makes the selector return `null`, not an empty window** (R4). Pair
  it with an end-to-end case on tab 24: build an engine whose selector reports 0, feed it a
  two-run history whose `best` is 5, and assert `computeCurrentCategoryForEngine` is `null` and
  `current ?? best` is 5. Measured, the empty-window variant gives `current` 1 and `used` 1,
  so this case is what separates the two implementations

---

### Point the feedback and the tour at category_used

**Summary**: R6, the whole near-term deliverable. The feedback text and the coach-mark
tour are selected from `category_used`, and the click event carries the two new fields
while `matchedCategory` keeps meaning `best` (R9).

**Files affected**:
- `src/components/hazbot-button.tsx`: select from `category_used` at `:119`, extend the click payload at `:245`
- `src/components/hazbot-button.test.tsx`: payload and selection coverage
- `src/hazbot/wildfire/rules-version.ts`: `APP_RULES_VERSION` 5 to 6 (R10)

**Estimated diff size**: ~115 lines

**The `APP_RULES_VERSION` bump lands here, not in the docs step, for the same reason
`ENGINE_VERSION` lands in the selector step: a version belongs with the change it versions.**
This is the commit where the category a given session resolves to changes, and R10a's widened
policy makes exactly that the bump trigger. Left to the last commit, commits 3 through 8
classify under version 6's rules while every `AnalysisEngineActivated` payload reports
`appRulesVersion: 5`, so a session logged from a mid-branch build is indistinguishable from a
WM-51 session, which is the break R9 and R9b exist to prevent applied to the version handle.
The repo deploys per-branch builds, so a mid-branch state is reachable by more than bisect.

```ts
export const APP_RULES_VERSION = 6; // was 5 (WM-51); master is at 4
```

`rules-version.test.ts` needs no edit: it asserts a positive integer, not the value. The
`LOGGED-EVENTS.md`, workflow-policy and walker-guidance edits stay in the docs step, which is
where prose belongs; only the constant moves.

Both call sites read the substrate's `computeCategorySelectionForEngine`, so neither this
component nor the sidebar restates the selection rule. The only local code is the no-engine
guard, which the substrate cannot express because it takes an `Engine`:

```ts
// `best` keeps today's algorithm (the monotone floor) and is what `matchedCategory` logs,
// so sessions logged before this change stay comparable with ones after it (R9). `used` is
// what the student sees (R6). The rule that picks it lives in the substrate's
// computeCategorySelectionForEngine, deliberately: it is also read by the sidebar and by the
// replay-fixture generator, and three hand-written copies of `current ?? best` is exactly how
// a revert to min(best, current) would go unnoticed.
const NO_ENGINE: CategorySelection = { best: null, current: null, used: null };
const readCategories = (engine: Engine<WildfireReading, WildfireDefaults> | undefined) =>
  (engine ? computeCategorySelectionForEngine(engine) : NO_ENGINE);
```

In the feedback effect, `const matched = engine ? computeMatchedCategoryForEngine(engine) : null;`
becomes `const { used: matched } = readCategories(engine);`. Everything downstream
(`feedback`, `buildTour`, `tourDoneLabel`, and the `categoryId` on `HazbotShowMeClicked` /
`HazbotTourCompleted` / `HazbotTourDismissed`) already reads that one variable, so the tour
keys off `category_used` with no further change. That is also why R9a documents the meaning
shift on those three events: it happens whether or not anything is written down.

`handleClick` becomes:

```ts
    const engine = getAnalysisEngine();
    const { best, current, used } = readCategories(engine);
    // matchedCategory keeps meaning `best` so the longitudinal series is unbroken;
    // categoryUsed is what the student was actually shown.
    log("HazbotButtonClicked", { matchedCategory: best, categoryUsed: used, categoryCurrent: current });
```

Tests. The file already `jest.mock`s `../hazbot/engine` and stubs the engine as a bare
`{ ruleSet: { categories } }`, so the mock factory gains `computeCategorySelectionForEngine`.

**Expect 14 of the file's 24 tests to go red until the mock sites are converted, not one.**
Measured by applying this step and running the suite: 14 failed / 10 passed. The file
overrides `computeMatchedCategoryForEngine` on the mocked barrel and drives it from nine
`mockMatched.mockReturnValue(...)` sites (`:170` through `:288`), which the intro, tour,
dismiss and reopen blocks all depend on. Once the component reads
`computeCategorySelectionForEngine`, those overrides are inert, and they cannot be made to
work indirectly: `computeCategorySelectionForEngine` calls `computeMatchedCategoryForEngine`
through `evaluator.ts`'s own local binding rather than through the barrel, so
`requireActual` plus a single override no longer reaches it. Every site becomes a
`{ best, current, used }` stub: rename `mockMatched` to `mockSelection` and convert
`mockReturnValue(1)` to `mockReturnValue({ best: 1, current: null, used: 1 })`. The churn is
one line per site, so the estimate above already covers it; the count is stated because 14
red tests mid-step otherwise reads as a mistake rather than as the expected diff.

- the existing "no engine" case updates to expect all three payload fields `null`
- **`current` below `best`** (`best` 5, `current` 4): the payload carries
  `matchedCategory: 5, categoryUsed: 4, categoryCurrent: 4` and the rendered body is
  category 4's text
- **`current` above `best`** (`best` 2, `current` 3, R13a's measured shape): the payload
  carries `categoryUsed: 3` and the rendered body is category 3's text. This is the case that
  fails under `min(best, current)`, and it is the only place in the suite that does, because
  the sweep computes `best` and `current` directly and never runs the selection. A case in
  the *lower* direction alone would pass under a `min` revert, so it is not a substitute

---

### Surface best, current and category_used in the sidebar

**Summary**: R8. A validation walk can read all three values plus the window description,
and the highlighted matched row follows `category_used`, since that is the row `CLAUDE.md`
trains walkers to read as the engine's answer. R8a's note says which panels stay
`best`-scoped.

**Files affected**:
- `src/hazbot/engine/react/use-analysis-engine.ts`: three new `HookReturn` fields
- `src/hazbot/engine/sidebar/sidebar.tsx`: a Category Summary block, matched-row source, the R8a note
- `src/hazbot/engine/sidebar/sidebar.test.tsx`: coverage
- `src/hazbot/engine/sidebar/sidebar.css` (or wherever the sidebar styles live): the summary block

**Estimated diff size**: ~180 lines

`HookReturn` gains:

```ts
  matchedCategory: number | null;
  // WM-45. `categoryCurrent` is null both when the activity has no window and when the
  // window matched nothing. `categoryUsed` is what the student-facing feedback is selected
  // from and what the highlighted row shows.
  //
  // `categoryWindowLabel` is the HOST's own description of the window it chose
  // (WindowSelection.label), or null. It is a display string, not a signal: `label` is
  // optional, so a host that supplies a selector and no label reads null here while having
  // a perfectly good window. This branch ships such a host itself: the determinism test's
  // `(readings) => ({ readings: readings.slice(-1) })`. Do not infer window presence from
  // it. The sidebar gates on `engine.readingsWindow` for exactly that reason, and if the
  // two null causes ever need telling apart through HookReturn, that wants its own field
  // rather than an inference from an optional display string.
  categoryCurrent: number | null;
  categoryUsed: number | null;
  categoryWindowLabel: string | null;
```

computed in `computeView` beside the existing `matchedCategory`:

```ts
  // One call, so the sidebar cannot disagree with the number hazbot-button shows the
  // student: both read the same computeCategorySelectionForEngine.
  const { best: matchedCategory, current: categoryCurrent, used: categoryUsed, label } =
    computeCategorySelectionForEngine(engine);
  const categoryWindowLabel = label ?? null;
```

The WeakMap cache needs no new key component: the selector arrives on `EngineOpts` and is
therefore fixed for the engine's lifetime, which the spike confirmed is not true of a
prop-borne selector.

In `sidebar.tsx`, a summary block rendered directly above `CategoriesPanel`.

**The gate is `engine.readingsWindow`, not `engine.ruleSet`, and the distinction is
load-bearing in both directions.** A substrate consumer that supplies no selector must see
today's sidebar unchanged: with a `ruleSet`-only gate it would get its single category value
relabeled `best`, a `current: n/a` row for a concept it does not have, and a note explaining
that the panels below describe `best` rather than `current`. That is noise on a versioned
shared component, and an additive minor should be invisible to a host that opts out. In the
other direction, the gate must NOT be `categoryWindowLabel !== null`: wildfire installs the
selector unconditionally (the value is unknown when `EngineOpts` is assembled), so on tab 24
the selector exists and returns null, and a walker there needs to *see* `current: n/a` with
the highlight back on `best`, because that is R4's fallback firing rather than a missing
feature.

```tsx
      {engine.readingsWindow && engine.ruleSet && (
        <div className="hazbot-sidebar-section">
          <div className="hazbot-sidebar-section-title">Category</div>
          <div className="hazbot-sidebar-entry"><strong>best:</strong> {fmt(matchedCategory)}</div>
          <div className="hazbot-sidebar-entry">
            <strong>current:</strong> {fmt(categoryCurrent)}
            {categoryWindowLabel && <span className="hazbot-sidebar-muted"> · {categoryWindowLabel}</span>}
          </div>
          <div className="hazbot-sidebar-entry hazbot-sidebar-category-used">
            <strong>used:</strong> {fmt(categoryUsed)}
          </div>
          {/* R8a. Everything below this block is computed over the FULL readings array
              (use-analysis-engine.ts): the per-category ✓/✗ icons, the Factor Variables
              panel and the expression coloring. They describe `best`, not `current`, and
              a walker will otherwise read them as a derivation of the numbers above. On
              tab 23 with run 1 = correct zones plus one spark per zone and run 2 = all
              defaults, best is 5, current is 2, and the row highlighted as used (2) shows
              a ✗ icon beside a setAnyZoneVar of true. Verified in-app. */}
          <div className="hazbot-sidebar-entry hazbot-sidebar-muted">
            Truth icons, expression coloring and Factor Variables below are computed over
            the full session and describe <strong>best</strong>, not <strong>current</strong>.
          </div>
        </div>
      )}
```

`CategoriesPanel`'s `matchedCategory` prop is fed `categoryUsed` rather than
`matchedCategory`. Renaming the prop is deliberately avoided: it is the substrate's
"which row is highlighted" input and every existing test names it.

Rendering a windowed truth tree and a windowed Factor Variables panel stays out of scope
(R8b): it needs a second `EvalCtx` threaded through the substrate sidebar, which is
substrate work for a dev-only surface on a story that otherwise leaves `EvalCtx` untouched.

Tests: a selector-less engine renders **no** Category block at all and leaves the rest of the
sidebar identical to today (this is the case that keeps the additive minor invisible to other
hosts, and the three existing sidebar tests are built exactly that way); the summary block
renders all three values when a selector is present; **the highlight follows `used` in both
directions**, with `best` 5 / `current` 4 putting it on row 4 and `best` 2 / `current` 3
putting it on row 3 (the second is the case a `min` would break, and the sidebar is the other
surface where the selection is visible); a `range_cc` 0 engine (a selector returning `null`)
shows `current: n/a` with the highlight back on `best`; the label renders when present.

---

### Bind the most recent qualifying witness in evaluateWith

**Summary**: R7. A diagnostic fix, isolated in its own commit because it is the one change
here that touches the shared evaluator without changing any classification.

**Files affected**:
- `src/hazbot/engine/evaluator.ts`: one line in `evaluateWith`
- `src/hazbot/engine/evaluator.test.ts`: a binding-direction case

**Estimated diff size**: ~30 lines

```ts
-    if (propResult && bound === undefined) bound = w;
+    // Bind the MOST RECENT qualifying witness, not the earliest (WM-45 R7). This cannot
+    // change any category's truth: the function returns `value: bound !== undefined`, so
+    // only which witness is reported changes. It is consumed by the sidebar
+    // (boundReadingIndex, "Matched on reading #N", propTruth coloring), which is what a
+    // validation walk reads, so the earliest-run binding misleads a walker rather than a
+    // student.
+    if (propResult) bound = w;
```

Verified: with this flip the full suite stays green at 796 tests across 72 suites (the
spec's 743 predates WM-51's additions). Add a test that asserts the *last* qualifying
witness is bound when several qualify, and that `value` is identical either way.

---

### Extract the per-tab shapes into a shared fixture

**Summary**: R12c and R12d. The constants that currently live inside each `<tab>.test.ts`
move to a shared fixture module and the tab tests import them, so a sheet change breaks the
per-category tests and the sweep together instead of leaving the sweep quietly guarding a
different activity than the one it names. No behavior change and no new assertions: every
existing test must still pass unchanged, which is the check that the extraction is faithful.

**Files affected**:
- `src/hazbot/rule-sets/__fixtures__/tab-shapes.ts`: new
- `src/hazbot/rule-sets/{23,25,32,33,34,35,42,45,47,54}.test.ts`: import from the fixture instead of declaring locally

**Estimated diff size**: ~460 lines (mostly moved)

One exported record per tab, carrying its `defaults`, the per-reading fields its own
`startReading` fills in, its named zone/spark/tool constants, and a `shapes` array naming
that tab's axis set. **The fixture is data only: no builders, no functions.**

```ts
export interface TabShape {
  name: string;                        // e.g. "correct/perZone", used in failure messages
  reading: Partial<WildfireReading>;
}
export interface TabFixture {
  id: string;
  // OPTIONAL, mirroring makeWildfireEngine's own signature rather than tightening it.
  // Rule set 25 references no `set*` factor variable and no defaults-consuming sim-prop,
  // so it is the one tab that deliberately builds its engine with no defaults
  // (`makeWildfireEngine(ruleSet25)`, the only one-argument call in the suite). See the
  // caution comment at test-helpers.ts:16-27, which lists the ten tabs that MUST pass
  // defaults and omits 25. Requiring it here would force a meaningless value into the
  // one tab whose point is not having one.
  defaults?: WildfireDefaults;
  // The per-reading fields this tab's own startReading fills in before spreading opts:
  // its default zones, empty sparks, its wind, and on tab 25 the two topography fields.
  base: Partial<WildfireReading>;
  shapes: TabShape[];
}
```

so the sweep builds every reading the same way on every tab:

```ts
mkReading("SimulationStarted", at, { ...fixture.base, ...shape.reading })
```

**No tab needs a builder of its own, and an earlier draft of this step was wrong to add a
`builders` record for two.** Checked against all eleven files: every `startReading` is
`mkReading("SimulationStarted", opts.at ?? 100, { <per-tab base fields>, ...opts })` and
nothing more. `topoReading` (`25.test.ts:64`) is `startReading` plus two literals
(`heightmapMaxElevation: 20000`, `tpiMarginFraction: 0.02`), which belong in `base`.
`zones(veg, drought)` (`34.test.ts:44`) is a zone-array constructor, not a reading builder
at all (it satisfies neither the parameter nor the return type of
`(opts?: Partial<WildfireReading>) => WildfireReading`, so a `builders` record could not have
held it), and its
only three call sites are already the named constants `vegChanged`, `droughtChanged` and
`vegAndDroughtChanged` (`34.test.ts:51-53`), which are what the fixture actually needs.
Verified by sweeping all ten positive-`range_cc` tabs through the single-builder form above:
tab 25 reaches categories 2 through 6 with its topography fields sitting in `base`, so the
second builder slot buys nothing. (Carrying those fields on every tab-25 shape is harmless:
`SparksAtTopAndBottom` needs per-spark `tpi` arrays, so a shape without them evaluates false
either way.)

**What holds the fidelity gate is that the tab files keep their own wrappers.** Each tab
file continues to define `startReading` (and, on 25, `topoReading`) exactly as today, built
over the fixture's exported `base` instead of a local literal. The constants then have one
source, which is R12c, and no test body changes, which is the gate below. There is nothing
to sequence: the only per-tab departure left is the optional `defaults`.

Per-tab axis sets, which differ and must be named per tab rather than described as "zone
and tool" axes (R12d). Each is already exercised by that tab's own tests:

| Tab | Axes | Shapes |
|---|---|---|
| 23 | default / correct / changed-but-incorrect zones x no sparks / one spark / one per zone | 9 |
| 32 | default / unique-veg-uniform-drought / unique-veg-non-uniform / drought-changed-not-unique-veg zones x no sparks / one per zone | 8 |
| 33 | default / forest-pair-uniform-drought / forest-pair-non-uniform / changed-not-forest zones x no sparks / one per zone | 8 |
| 35 | default / `forestWW` / `forestWWNonUniformDrought` / `forestWWNonUniformTerrain` / `changedNotForest` / `uniformDroughtNoForest` zones (`35.test.ts:37-63`) x no sparks / one per zone | 12 |
| 25 | uniform vs non-uniform zones x five spark placements (including the `sparksTopBottom` / `sparksPerZoneMid` pair the `topoReading` builder supplies elevation for) | 10 |
| 34 | `VegetationSet` / `WindSet` / `DroughtLevelSet` shapes | 8 |
| 42 | default vs changed only | 2 |
| 45, 47 | default vs changed zones x fire line x helitack | 8 |
| 54 | **severity**, not default-vs-changed: default / all-zones-severe / veg-changed-not-severe x fire line x helitack | 12 |

**Tab 54 does not share 45 and 47's axis set, and building it as though it does produces a
baseline that guards nothing.** Its categories 3 and 4 both require `DefaultVegetations AND
SevereDroughts`, and `SevereDroughts` demands *every* zone at Severe Drought
(`sim-props.ts:343-350`), while tab 54's SIMINIT default is No Drought on all three zones.
So a "default" run fails it and a "changed" run that bumps one zone to Severe fails it too;
both land on category 2's `NOT SevereDroughts` disjunct. Measured on the default-vs-changed
axis at depth 2: **all 64 states classify 2 for `best` and 2 for `current`, zero moved,
categories 3 and 4 never reached.** The committed series would be 64 identical characters.
Rebuilt on the constants `54.test.ts` already carries (`severeZones` at :33-36,
`vegChangedNotSevere` at :38-42), it sweeps 144 states across categories 2, 3 and 4 with 35
moved. R12e's coverage assertion in the sweep step exists so the next fixture built this way
fails instead of passing.

The per-tab shape counts above are read off each file's own constants rather than
extrapolated: only tab 23 is 9. Tabs 32 and 33 each carry four zone shapes, tab 35 carries
six (`35.test.ts:37-63`), and every one of the four carries exactly two spark shapes (none
and one-per-zone).

Two shapes are inline literals today and become named constants as part of the move: tab
42's changed wind (`42.test.ts:32`) and tab 45's helitack flag.

**The `best` baselines this fixture feeds are already measured** and sit in `BASELINES` in
the sweep step, taken from the branch before any of this story's commits. So the axis sets
above are not free choices: they are the ones the committed series were measured against, and
changing one invalidates its series. If a shape needs to change, re-measure that tab's series
on a tree with no WM-45 commits applied, not on the tree as it stands at the sweep commit.

Fidelity gate for this commit: the full suite passes with no test-body edits beyond the
import change. Confirmed workable in the spike for tabs 23, 45 and 47, where a fixture built
this way reproduced every committed per-category expectation exactly, and where a
deliberately wrong tab-23 builder (one whose "correct zone setup" did not actually satisfy
`CorrectZoneSetup`) reported 18 of 81 moved states instead of 29 as a clean pass.

---

### Commit the windowed sweep and the regression probes

**Summary**: R12b, R13 and R13a. The always-on gate: `best` may not move, no upward move
may land on a ruleset's highest category id, and the two named sequences are pinned so a
silent revert to `min(best, current)` fails CI.

**Files affected**:
- `src/hazbot/rule-sets/test-helpers.ts`: an optional `readingsWindow` on `makeWildfireEngine`, plus a `matchCurrentAgainst` sibling to `matchAgainst`
- `src/hazbot/rule-sets/current-category-sweep.test.ts`: new
- `src/hazbot/rule-sets/current-category-regression.test.ts`: new (or one file; see the note below)

**Estimated diff size**: ~365 lines

`test-helpers.ts` gains the windowed sibling, and it drives the **production** path rather
than restating it. An earlier draft of this step re-derived the trim with
`canonicalRunWindowStart` and called `highestTrueAt` itself, which would have made R12b's
always-on gate a test of a copy: a change to `makeReadingsWindow` (excluding unfinished runs,
moving the `at` fallback, changing the `rangeCc` 0 answer) would leave the whole sweep green.
It also took `rangeCc` as a parameter, so the sweep and production could window differently
and only `range-cc.test.ts` would have noticed.

`Engine.readings` is a public mutable field, so a helper can point a real engine at a
pre-translated array and call the shipped entry point. That is the same liberty `matchAgainst`
already takes in going around `consume()`:

```ts
// `category.current` for a pre-translated readings array, through the SAME code the app
// runs: the engine's own readingsWindow selector, then computeCurrentCategoryForEngine.
// Nothing about the window (the canonical-run trim, the `at` fallback for folded runs, the
// rangeCc 0 -> null answer, the label) is restated here, because a restatement is a second
// implementation that the sweep would then be gating instead of the first one.
//
// The engine must be built with a selector (see makeWildfireEngine's readingsWindow option);
// without one this returns null, which is also production's answer for a host that supplies
// no window (R4).
export function matchCurrentAgainst(
  engine: Engine<WildfireReading, WildfireDefaults>,
  readings: WildfireReading[],
): number | null {
  const saved = engine.readings;
  engine.readings = readings;
  try {
    const result = computeCurrentCategoryForEngine(engine);
    return result ? result.category : null;
  } finally {
    engine.readings = saved;
  }
}
```

and `makeWildfireEngine` gains a `windowed` flag that puts the selector on `EngineOpts`, so
the sweep's engines are built exactly the way `engine-singleton.ts` and the replay generator
build theirs:

```ts
export function makeWildfireEngine(
  ruleSet: RuleSet<WildfireDefaults>,
  defaults?: WildfireDefaults,
  windowed = false,
): Engine<WildfireReading, WildfireDefaults> {
  // `engine` is closed over before it exists and read only after the constructor returns,
  // the same deferred-reference shape engine-singleton.ts uses with its module-level
  // `cached` and generate-replay-fixture.js uses with its own const. Forced by the
  // derivation reading parsedExpressions, which does not exist while opts is assembled.
  let engine: Engine<WildfireReading, WildfireDefaults>;
  const opts: EngineOpts<WildfireReading, WildfireDefaults> = {
    /* …existing fields… */
    ...(windowed
      ? { readingsWindow: makeReadingsWindow(() => deriveRangeCc(categoryExpressions(engine))) }
      : {}),
  };
  engine = new Engine<WildfireReading, WildfireDefaults>(opts);
  return engine;
}
```

so the sweep calls `makeWildfireEngine(ruleSet, defaults, true)`.

**`readingsWindow` is never assigned after construction, anywhere.** An earlier draft of this
step had the sweep write the field post-construction, which reads as harmless in a test but
quietly demotes the invariant the Sidebar step depends on: `computeView`'s WeakMap is keyed on
`(engine, snapshot, appRulesVersion)` and needs no selector component *because* the selector
arrives on `EngineOpts` and is fixed for the engine's lifetime. The spike already measured
what happens when that stops being true (a stale `categoryCurrent` when the selector changes
with no engine event in between), so the property is worth holding by construction rather than
by convention. `test-helpers.ts` importing `makeReadingsWindow` and `deriveRangeCc` from
`../wildfire/` opens nothing new: it already imports `factorVariables`, `simProps`, `translate`
and `types` from there.

The sweep enumerates each positive-`range_cc` tab over its own axis set and asserts two
bars.

`best` is pinned as a compact per-tab series, one character per state, `-` for a null match,
chunked one line per first-run shape and labeled with that shape, then joined. Chunking is
not cosmetic: it keeps a committed line under the 160-character `max-len` warning in
`.eslintrc.js:59` (tab 45's series is 512 characters flat), and it makes a PR diff name the
run-1 shape of whatever moved instead of handing the reviewer two long strings to compare
character by character.

`BASELINES[tab].rangeCc` is consequently no longer an *input* to the sweep. It becomes an
assertion (`expect(deriveRangeCc(categoryExpressions(engine))).toBe(rangeCc)`), so it still
documents the window each series was measured at, but it can no longer silently disagree with
the value production would use.

```ts
const BASELINES: Record<string, { depth: number; rangeCc: number; top: number; best: string }> = {
  "23": { depth: 2, rangeCc: 1, top: 5, best: [
    "222445333",  // run 1 = default/noSparks
    "222445333",  // run 1 = default/oneSpark
    "222445333",  // run 1 = default/perZone
    "444445444",  // run 1 = correct/noSparks
    "444445444",  // run 1 = correct/oneSpark
    "555555555",  // run 1 = correct/perZone
    "333445333",  // run 1 = changed/noSparks
    "333445333",  // run 1 = changed/oneSpark
    "333445333",  // run 1 = changed/perZone
  ].join("") },
  "47": { depth: 2, rangeCc: 2, top: 5, best: [
    "35553333",  // run 1 = default/noFireline/noHelitack
    "54444444",  // run 1 = default/noFireline/helitack
    "54444444",  // run 1 = default/fireline/noHelitack
    "54444444",  // run 1 = default/fireline/helitack
    "34442222",  // run 1 = changed/noFireline/noHelitack
    "34442222",  // run 1 = changed/noFireline/helitack
    "34442222",  // run 1 = changed/fireline/noHelitack
    "34442222",  // run 1 = changed/fireline/helitack
  ].join("") },
  // Tab 45 runs at depth 3 (512 states) because it is the only tab that can move upward at
  // all, and at depth 2 it cannot: measured 0 upward moves at depth 2, 35 at depth 3, 308 at
  // depth 4. Running it at depth 2 would make bar 2 below vacuous. Its rows are 64 characters
  // (runs 2 and 3 for each run-1 shape) rather than 8.
  "45": { depth: 3, rangeCc: 2, top: 4, best: [
    "3334333333443333343433334444444433343333333433333334333333343333",  // run 1 = default/noFireline/noHelitack
    "3344333333443333444444444444444433443333334433333344333333443333",  // run 1 = default/noFireline/helitack
    "3434333344444444343433334444444434343333343433333434333334343333",  // run 1 = default/fireline/noHelitack
    "4444444444444444444444444444444444444444444444444444444444444444",  // run 1 = default/fireline/helitack
    "3334333333443333343433334444444433342222332422223234222222242222",  // run 1 = changed/noFireline/noHelitack
    "3334333333443333242422224444444433242222332422222224222222242222",  // run 1 = changed/noFireline/helitack
    "3334333322442222343433334444444432342222222422223234222222242222",  // run 1 = changed/fireline/noHelitack
    "2224222222442222242422224444444422242222222422222224222222242222",  // run 1 = changed/fireline/helitack
  ].join("") },
  "25": { depth: 2, rangeCc: 1, top: 6, best: [
    "2234622345",  // run 1 = uniform/noSparks
    "2234622345",  // run 1 = uniform/oneSpark
    "3334633345",  // run 1 = uniform/twoSameZone
    "4444644445",  // run 1 = uniform/perZoneMid
    "6666666666",  // run 1 = uniform/topBottom
    "2234622345",  // run 1 = nonUniform/noSparks
    "2234622345",  // run 1 = nonUniform/oneSpark
    "3334633345",  // run 1 = nonUniform/twoSameZone
    "4444644445",  // run 1 = nonUniform/perZoneMid
    "5555655555",  // run 1 = nonUniform/topBottom
  ].join("") },
  "32": { depth: 2, rangeCc: 1, top: 6, best: [
    "22564433",  // run 1 = default/noSparks
    "22564433",  // run 1 = default/perZone
    "55565555",  // run 1 = uniqVegUniform/noSparks
    "66666666",  // run 1 = uniqVegUniform/perZone
    "44564444",  // run 1 = uniqVegNonUniform/noSparks
    "44564444",  // run 1 = uniqVegNonUniform/perZone
    "33564433",  // run 1 = droughtNotUniqVeg/noSparks
    "33564433",  // run 1 = droughtNotUniqVeg/perZone
  ].join("") },
  "33": { depth: 2, rangeCc: 1, top: 6, best: [
    "22464533",  // run 1 = default/noSparks
    "22464533",  // run 1 = default/perZone
    "44464544",  // run 1 = forestUniform/noSparks
    "66666666",  // run 1 = forestUniform/perZone
    "44464544",  // run 1 = forestNonUniform/noSparks
    "55565555",  // run 1 = forestNonUniform/perZone
    "33464533",  // run 1 = changedNotForest/noSparks
    "33464533",  // run 1 = changedNotForest/perZone
  ].join("") },
  "34": { depth: 2, rangeCc: 1, top: 5, best: [
    "23334555",  // run 1 = vegDefault/droughtDefault/windDefault
    "33334555",  // run 1 = vegDefault/droughtDefault/windChanged
    "33334555",  // run 1 = vegDefault/droughtSevere/windDefault
    "33334555",  // run 1 = vegDefault/droughtSevere/windChanged
    "44444555",  // run 1 = vegChanged/droughtDefault/windDefault
    "55555555",  // run 1 = vegChanged/droughtDefault/windChanged
    "55555555",  // run 1 = vegChanged/droughtSevere/windDefault
    "55555555",  // run 1 = vegChanged/droughtSevere/windChanged
  ].join("") },
  "35": { depth: 2, rangeCc: 1, top: 7, best: [
    "226755444444",  // run 1 = default/noSparks
    "226755444444",  // run 1 = default/perZone
    "666766666666",  // run 1 = forestWW/noSparks
    "777777777777",  // run 1 = forestWW/perZone
    "556755555555",  // run 1 = forestNonUniformDrought/noSparks
    "556755555555",  // run 1 = forestNonUniformDrought/perZone
    "446755334444",  // run 1 = forestNonUniformTerrain/noSparks
    "446755334444",  // run 1 = forestNonUniformTerrain/perZone
    "446755444444",  // run 1 = changedNotForest/noSparks
    "446755444444",  // run 1 = changedNotForest/perZone
    "446755444444",  // run 1 = uniformDroughtNoForest/noSparks
    "446755444444",  // run 1 = uniformDroughtNoForest/perZone
  ].join("") },
  "42": { depth: 2, rangeCc: 1, top: 3, best: [
    "33",  // run 1 = default
    "32",  // run 1 = changedWind
  ].join("") },
  // Tab 54 on its SEVERITY axis, not 45/47's default-vs-changed. See the Fixture step.
  "54": { depth: 2, rangeCc: 1, top: 4, best: [
    "222234442222",  // run 1 = default/noFireline/noHelitack
    "222234442222",  // run 1 = default/noFireline/helitack
    "222234442222",  // run 1 = default/fireline/noHelitack
    "222234442222",  // run 1 = default/fireline/helitack
    "333334443333",  // run 1 = severe/noFireline/noHelitack
    "444444444444",  // run 1 = severe/noFireline/helitack
    "444444444444",  // run 1 = severe/fireline/noHelitack
    "444444444444",  // run 1 = severe/fireline/helitack
    "222234442222",  // run 1 = vegNotSevere/noFireline/noHelitack
    "222234442222",  // run 1 = vegNotSevere/noFireline/helitack
    "222234442222",  // run 1 = vegNotSevere/fireline/noHelitack
    "222234442222",  // run 1 = vegNotSevere/fireline/helitack
  ].join("") },
};
```

**All ten series are measured, none are to be generated during implementation.** Every one
above was taken from the unmodified branch, so each is a genuine prior measurement of `best`
rather than a snapshot of the tree after this story changes it. Per-tab totals, which the
sweep should log and a reviewer can check against:

| Tab | Shapes | Depth | States | Moved | Upward | `best` covers |
|---|---|---|---|---|---|---|
| 23 | 9 | 2 | 81 | 29 | 0 | 2,3,4,5 |
| 25 | 10 | 2 | 100 | 37 | 0 | 2,3,4,5,6 |
| 32 | 8 | 2 | 64 | 25 | 0 | 2,3,4,5,6 |
| 33 | 8 | 2 | 64 | 25 | 0 | 2,3,4,5,6 |
| 34 | 8 | 2 | 64 | 22 | 0 | 2,3,4,5 |
| 35 | 12 | 2 | 144 | 61 | 0 | 2,3,4,5,6,7 |
| 42 | 2 | 2 | 4 | 1 | 0 | 2,3 |
| 45 | 8 | **3** | 512 | 185 | **35**, all `2 -> 3`, none on top | 2,3,4 |
| 47 | 8 | 2 | 64 | 0 | 0 | 2,3,4,5 |
| 54 | 12 | 2 | 144 | 35 | 0 | 2,3,4 |

Two things fall out of the table and are worth reading before implementing. Tab 45 is the
only tab with any upward move at any depth here, which is the structural claim in the
requirements Technical Notes confirmed against ten tabs rather than three. And every tab's
`best` column covers at least two category ids, so R12e's coverage bar passes on all ten as
measured; it exists to catch the next fixture, not this one.

Every series above is a real measured value taken from the branch **before** any of this
story's commits, so they are baselines to confirm rather than to invent, and bar 1 ("`best`
may not move") pins a genuine prior measurement on all ten tabs. Do not re-measure them
during implementation: by this commit the tree already carries the classification change, so
a series read off it would pin a snapshot of the new behavior rather than a baseline of the
old. If a series does not reproduce, that is bar 1 doing its job or the fixture disagreeing
with the axis set named in the Fixture step; check the second before adjusting the first. The
tab-45 depth-3 sweep runs in ~15ms and the whole sweep well under a second, so depth is not a
runtime concern.

**Language-level constraint, verified**: this project's TS lib target predates ES2019, so
`Array.prototype.flatMap` and `Object.fromEntries` do not compile. Build the shape lists and
the state names with plain `forEach` loops.

The two bars. Bar 1 does **not** assert the series string directly: a failing
`expect(series).toBe(baseline)` prints two 500-character strings with no indication of where
they differ, which is exactly the moment someone needs to be told. Compute the moved set and
assert it is empty instead, so the failure names each moved state with its old and new value
and prints nothing else. Measured on a three-state perturbation, the output is:

```
    + Array [
    +   "default/oneSpark -> correct/noSparks: best 4 -> 3",
    +   "correct/perZone -> default/noSparks: best 5 -> 4",
    +   "changed/oneSpark -> changed/oneSpark: best 3 -> 2",
    + ]
```

```ts
    // Bar 1 (R12a): `best` may not move. This story does not touch it, so any change in
    // the best column is a regression, not a reclassification. Named-delta form so the
    // failure message identifies the states rather than the character offsets.
    const moved: string[] = [];
    stateNames.forEach((name, i) => {
      if (bestSeries[i] !== baseline[i]) {
        moved.push(`${name}: best ${baseline[i]} -> ${bestSeries[i]}`);
      }
    });
    expect(moved).toEqual([]);

    // Bar 2 (R12a): no upward move may land on this ruleset's highest category id, so no
    // student is congratulated on a window they did not earn. This confirms a structural
    // property against a future re-extract rather than establishing it: an upward move
    // needs an anti-monotone subterm (a history factor variable, or a WITH occurrence,
    // under an odd number of NOTs), tab 45 is the only tab that has one in a position that
    // can fire, and its top category is unreachable that way. A sheet edit that moves a NOT
    // onto a history variable in a high category is exactly what breaks it, and is exactly
    // the kind of change this repo has already seen once.
    expect(upwardMovesOntoTopCategory).toEqual([]);
```

Bar 3 (R12e) is the guard against a mis-built fixture, and it is the one that would have
caught tab 54. A fixture whose axes never reach an activity's categories produces a uniform
`best` series, which once committed is indistinguishable from a correct baseline: bar 1
passes forever, bar 2 is vacuous, and nothing in the output says the tab is uncovered.

```ts
    // Bar 3 (R12e): the fixture must actually reach this activity. A tab whose axes only
    // ever produce one category id is not being swept, it is being rubber-stamped.
    // Measured example: tab 54 built on 45/47's default-vs-changed zone axis gives 64
    // states that are ALL category 2, because its cats 3-4 need SevereDroughts (every zone
    // Severe) and its default is No Drought. This assertion is the difference between that
    // arriving as a failure and arriving as a green baseline.
    expect(distinctCategories.size).toBeGreaterThan(1);
```

Downward reclassification is expected and is the point of the story, so the sweep must not
assert on the `current` column beyond bars 2 and 3. Log the move count and the distinct
category set per tab (`29 of 81`, `{2,3,4,5}` for tab 23; `185 of 512`, `{2,3,4}` for tab 45
at depth 3; `0 of 64`, `{2,3,4,5}` for tab 47) so a reviewer can see the blast radius and
the coverage without the test pinning either.

The two regression probes (R13, R13a), which can live in the same file or a sibling; a
sibling reads better because these are narratives rather than an enumeration:

```ts
  it("R13: tab 23, a perfect run then a weaker run resolves to 4, not 5", () => {
    // The reported bug. best keeps the 5; the student is coached on the run they made.
    // ... best 5, current 4
  });
  it("R13a: tab 45, a trailing window lifts current above best", () => {
    // run 1 changed setup with a fire line, run 2 default with a helitack, run 3 default
    // with no tools. best 2, current 3. Re-derived against the branch: 35 of tab 45's 512
    // depth-3 states have current > best, all of them 2 -> 3.
    //
    // This pins the two INPUTS. It does not pin the selection, and must not be read as
    // doing so: `used` here would be this test's own `current ?? best`, which is true by
    // construction whatever hazbot-button does. The revert-to-min guard is the `best` 2 /
    // `current` 3 case in hazbot-button.test.tsx and sidebar.test.tsx, which run the
    // shipped computeCategorySelectionForEngine.
  });
```

Both were confirmed in the spike, along with R8a's `best` 5 / `current` 2 pair, which is
worth pinning here too since the sidebar test and the browser walk both cite it.

---

### Carry current and category_used in the replay fixture

**Summary**: R14 and R14b. `current` joins the determinism check that already pins `best`,
and both sides of the fixture change together so a partial implementation fails as a
missing implementation rather than as a broken fixture.

**Files affected**:
- `scripts/generate-replay-fixture.js`: build and emit the two new series
- `src/hazbot/wildfire/replay-fixture.test.ts`: assert them
- `src/hazbot/wildfire/__fixtures__/expected.json`: regenerated
- `src/hazbot/engine/replay-determinism.test.ts`: a window selector and a second history pair

**Estimated diff size**: ~130 lines (mostly regenerated JSON)

**R14b cites the wrong file, and the fixture work does not satisfy what it cites.** R14b
argues that without this change `current` "sits outside `replay-determinism.test.ts`
entirely". That file is substrate-side: it builds two engines over a hand-written synthetic
rule set with a single `ranSimulation` category and never reads `__fixtures__/expected.json`.
Adding series to the wildfire fixture does nothing for it. Both tests are worth doing, so
this step does both rather than quietly narrowing R14b to the half that shares its name.

Both the generator and the test construct their engine without `defaults` and without a
window selector today, so both must add the selector or `computeCurrentCategoryForEngine`
returns null and the series is all-null. Ruleset 25's `range_cc` is 1, and the fixture's
engine is constructed directly rather than through `getAnalysisEngine`, so the selector is
supplied explicitly and identically on both sides:

```js
const engine = new Engine({
  ruleSet: ruleSets["25"],
  // …existing opts…
  readingsWindow: makeReadingsWindow(() => deriveRangeCc(categoryExpressions(engine))),
});
```

with the same thunk shape as the singleton, since `engine` is referenced inside a callback
that only runs after construction. In the per-event loop, alongside
`matchedCategoryHistory`:

```js
  const { best, current, used } = computeCategorySelectionForEngine(engine);
  matchedCategoryHistory.push(best);
  currentCategoryHistory.push(current);
  categoryUsedHistory.push(used);
```

Through the same selection function the component and the sidebar use, so the fixture pins the
shipped rule rather than a third hand-written copy of it. All three series come from one call:
`matchedCategoryHistory` moves from its own `computeMatchedCategoryForEngine(engine)` to
`best`, which is the identical value (that function is exactly what
`computeCategorySelectionForEngine` calls for it), so R14's "`matchedCategoryHistory` must not
change" bar is unaffected and the fixture no longer computes the floor twice per event.

Both arrays join `expected` and are asserted by `replay-fixture.test.ts` with the same
`toEqual` treatment as `matchedCategoryHistory`.

For the determinism half, `makeOpts()` gains a selector and the existing loop gains a second
pair of arrays. Verified that the file asserts nothing against literals (every expectation is
`engineA` versus `engineB`), so this pins the new entry point against non-determinism without
disturbing the rule set or any existing expectation:

```ts
    // A window expressed with no notion of a "run": the substrate has none, and a host
    // that is not wildfire is the case this API has to keep working for.
    readingsWindow: (readings) => ({ readings: readings.slice(-1) }),
```

```ts
      currentA.push(computeCurrentCategoryForEngine(engineA)?.category ?? null);
      currentB.push(computeCurrentCategoryForEngine(engineB)?.category ?? null);
```

with `expect(currentA).toEqual(currentB)` beside the existing `expect(matchedA).toEqual(matchedB)`.

R14's bar for this branch: on the commit that introduces the two series the expected diff
is `sessionId` plus the two new arrays, and `sessionId`-only from then on. `matchedCategoryHistory`
itself must not change, since this story does not touch `best`; any movement there is a
regression rather than something to re-verify.

---

### Version bumps and documentation

**Summary**: R9a, R10a and R14a. Everything an analyst or a future validation walker
needs to read this change correctly, batched into one docs commit. Neither version constant
is here: each belongs with the change it versions, so `ENGINE_VERSION` lands in the selector
step and `APP_RULES_VERSION` (R10) in the feedback step. What stays here is the prose that
explains both.

**Files affected**:
- `LOGGED-EVENTS.md`: five events
- `docs/hazbot-update-workflow.md`: §7 policy
- `docs/hazbot-validation/localhost-urls.md`: two sentences

**Estimated diff size**: ~65 lines

`LOGGED-EVENTS.md`, five events rather than one:

- `HazbotButtonClicked` gains `categoryUsed: number | null` and `categoryCurrent: number | null`.
  State that **`matchedCategory` keeps meaning `best`**, so sessions logged before this
  change stay comparable with ones after it.
- `HazbotShowMeClicked`, `HazbotTourCompleted`, `HazbotTourDismissed`: their `categoryId` is
  now the category the feedback was selected from (`category_used`), which may differ from
  `matchedCategory` **in either direction**. Lower is the common case and the point of the
  story. Higher occurs only on tab 45, only as `2 -> 3`, and never reaches a celebration
  category. Say this explicitly: an analyst told the value only ever goes down will read a
  higher `categoryId` as corrupt data rather than as documented behavior, which is the
  longitudinal break R9 exists to prevent.
- `AnalysisEngineActivated` gains `rangeCc: number`. Document there that a null
  `categoryCurrent` means the activity has no window when `rangeCc` is 0, and an unmatched
  window otherwise.
- Cross-reference `APP_RULES_VERSION` 6 as the boundary marker on all five.

`docs/hazbot-update-workflow.md` §7, widening the bump policy (R10a). As written it lists
only sheet-side causes, so a change like this one, which alters the category a given session
resolves to without touching a cell, falls outside a policy that plainly should include it:

```md
- **Evaluation-semantics changes** (a change in how the existing expressions are evaluated,
  such as WM-45's windowed `category.current`): bump. The sheet is untouched but the
  category a given session resolves to changes, which is exactly what the version marks.
```

`docs/hazbot-validation/localhost-urls.md`, two sentences that both rest on a whole-history
reading only `best` still satisfies:

- Line 118, "the engine picks the **highest-numbered ✓** as the matched feedback", is now
  false for `current` and for `category_used`. Scope it to the `best` row and point the
  walker at the Category summary block for the other two. The verified tab-23 case lands on
  a category whose icon is ✗.
- Line 184, "a full page navigation per probe", rests on the monotone floor. That stays true
  of `best` and is false of `current`, so say which row it is talking about.

---

### Validation (no commit)

**Summary**: The verification R12 and R14 call for, which produces no diff.

- **Re-run both oob sweep harnesses** (`hazbot-coverage-sweep.test.ts`,
  `hazbot-patch-verification.test.ts`) with `VegetationSet`, `DroughtLevelSet` and `WindSet`
  added to their axis lists, or tab 34 degenerates and falsely reports categories
  unreachable. Downward reclassification is expected, so the usual "no already-covered state
  moves" bar does not apply; the two bars that do apply are committed in the sweep step.
- **Regenerate the replay fixture** and confirm the diff is `sessionId` plus the two new
  arrays on the introducing commit, `sessionId`-only after.
- **Browser walk on tab 23**: run 1 with the correct zone setup and one spark per zone, run
  2 with all defaults, then read the sidebar. Expect `best` 5, `current` 2, `used` 2, the
  highlight on row 2, and the Hazbot feedback showing category 2's coaching rather than
  "Great job! You're ready to answer the questions below." That celebration on that state is
  the bug as it stands today, confirmed in-app during the pre-implementation checks.
- **Browser walk on tab 45 or 47** for the accepted consequence in the Technical Notes: a
  student who finishes the investigation and then does one more run is coached to do the
  thing they already did. It is expected behavior, not a regression, and a walker who has
  not read the spec will file it as one.

## Requirements coverage

Every requirement in `requirements.md` maps to a step. Step titles are abbreviated to their
first word or two.

| Requirement | Step |
|---|---|
| R1 (add `category.current`, existing value becomes `category.best`) | Selector, Derive, Sidebar |
| R2, R2a, R2b (window over the last `range_cc` canonical runs; unfinished newest run counts; short session evaluates) | Derive |
| R3 (plain evaluation over the trimmed readings, no mixed scope) | Derive |
| R3a (no positive-`range_cc` tab references a range-0 factor variable) | Derive (`range-cc.test.ts`) |
| R3b (one evaluation at the end of the window, no floor) | Selector |
| R4 (undefined in two cases, consumers fall back to `best`) | Selector (nullable `readingsWindow` return, so `range_cc` 0 reports "no window" rather than an empty one), Derive (`makeReadingsWindow` returns `null` at 0), Feedback, Sidebar |
| R4a (computed on demand; no `run_record` / `run_history`, no incremental update) | **Nothing to build.** Stated here so no one adds it: `computeCurrentCategoryForEngine` recomputes from `engine.readings` per call, which is what R4a asks for |
| R5, R5a (derive `range_cc`; pin Sam's eleven values) | Derive |
| R6, R6a (feedback and tour follow `category_used`, in both directions) | Selector (`computeCategorySelectionForEngine`, the single home of the rule), Feedback (the component reads it), Sidebar |
| R7 (bind the most recent qualifying witness) | evaluateWith |
| R8 (sidebar surfaces all three plus the window; matched row follows `category_used`) | Sidebar |
| R8a (note that the other panels stay `best`-scoped) | Sidebar |
| R8b (no windowed truth tree or Factor Variables panel) | **Explicitly not built**, noted in Sidebar |
| R9 (`HazbotButtonClicked` gains `categoryUsed` / `categoryCurrent`; `matchedCategory` keeps meaning `best`) | Feedback |
| R9a (`LOGGED-EVENTS.md` for five events) | Docs |
| R9b (`rangeCc` on `AnalysisEngineActivated`) | Derive (payload), Docs (documentation) |
| R10 (`APP_RULES_VERSION` 5 to 6) | Feedback, since that is the commit whose evaluation semantics it marks |
| R10a (widen the bump policy to evaluation semantics) | Docs |
| R10b (`ENGINE_VERSION` 0.0.1 to 0.1.0) | Selector, since that is the API it versions |
| R11 (no change to rule-set files, the extraction, or feedback text) | **Nothing to build.** Note for reviewers: the fixture-extraction step edits files under `src/hazbot/rule-sets/`, but only the `<tab>.test.ts` files, never a rule-set file, the extractor, or a feedback string |
| R12 (re-run both oob sweep harnesses with the three added axes) | Validation |
| R12a (the two bars that replace the usual no-movement bar) | Sweep |
| R12b, R12c, R12d, R12e (commit the bars; shared fixture; per-tab axis sets; the coverage assertion) | Fixture, Sweep |
| R13, R13a (the reproduction probe and the `current > best` case) | Sweep |
| R14 (regenerate the replay fixture, `sessionId`-only diff) | Replay fixture, Validation |
| R14a (two sentences in `localhost-urls.md`) | Docs |
| R14b (add the `current` and `category_used` series to the fixture) | Replay fixture |

Ordering holds: no step depends on a later one. The largest step is the fixture extraction at
~460 lines, and it is almost entirely moved code with no new assertions. Total estimated diff
is ~1,860 lines across nine commits.

## Open Questions

<!-- Implementation-focused questions only. Requirements questions go in requirements.md. -->

Three decisions that could reasonably have been questions were settled by measurement
instead, and are recorded in the Pre-implementation verification section above: the trim's
index resolution, the `EngineOpts` versus provider-props route, and the sweep depth needed
to make R12a's upward bar non-vacuous. Two remain, both about the shape of something
committed rather than about behavior.

### RESOLVED: How does the window describe itself to the sidebar?

**Context**: R8 requires the `current` row to carry "the window size and the number of
canonical runs it actually covered", since those are the two inputs a walker cannot recover
from anything else on screen. Both are wildfire concepts. The substrate is host-app-agnostic
and its eslint boundary forbids importing outside `src/hazbot/engine/`, so it has no notion
of a "run", and whatever shape carries these numbers becomes part of the additive API that
R10b bumps `ENGINE_VERSION` to `0.1.0` for. The plan above is written for option A.

**Options considered**:
- A) **A free-text `label` on `WindowSelection`**, authored wildfire-side (`"range_cc 2 · 1
  of 2 runs"`) and rendered verbatim. Keeps run vocabulary entirely out of the substrate,
  lets the wording change without a substrate release, and stays honest that this is a
  dev-only display string. Costs: nothing machine-readable, so a future consumer that wants
  the covered-run count has to re-derive it, and the sidebar cannot style the two numbers
  separately.
- B) **Typed numbers on `WindowSelection`** (`{ readings, windowSize, runsCovered }`), with
  the sidebar rendering "window 2 · covered 1". Machine-readable and styleable, but it puts
  a run-shaped pair of integers into a substrate type that is not allowed to know what a run
  is, and any future host whose window is not run-shaped inherits two fields it has to fake.
- C) **Neither on the substrate**: leave `WindowSelection` as `{ readings }` and surface the
  two numbers through the existing host-supplied `diagnostics` prop the `Sidebar` already
  takes. Smallest API, but it splits the three numbers across two places on screen, which is
  the failure mode R8a already exists to patch once.

**Decision**: **A**, the free-text `label`. Three findings from the dive settle it. The
substrate already carries host-authored free text for exactly this purpose: `SidebarDiagnostic`
is `{ label, value, status? }`, host-supplied and rendered verbatim (`sidebar.tsx:17-21`), so a
`label` on `WindowSelection` is an existing contract rather than a new kind of thing. The
host-agnostic boundary is lint-enforced, not conventional: `src/hazbot/engine/.eslintrc.js`
declares an `import/no-restricted-paths` zone (target `./src/hazbot/engine`, from `./src`,
except `./hazbot/engine`) whose message is "Substrate code may not import outside
src/hazbot/engine/", so option B's two run-shaped integers would be putting run vocabulary into
the type that rule exists to keep run-free. And rendered live, A is the only variant that names
`range_cc`, the term the sheet, Sam's doc, this spec and the new `rangeCc` log field all use;
B's "window 1 · covered 1" says neither what is windowed nor what is covered.

Option C was also re-costed and is not the small-API option the question implied: R8 puts the
matched-row highlight on `category_used`, which requires `categoryUsed` on `HookReturn`
regardless of where the numbers are displayed, so C pays the additive API and the `0.1.0` bump
anyway and only buys a display location that splits the three values away from the row they
explain. All three were rendered together in the running app on a real two-run tab-23 session
(`tmp/playwright/wm45-oq1-variants.png`).

### RESOLVED: How is the sweep's `best` baseline committed?

**Context**: R12b's first bar is that `best` may not move at all, which needs literal
expected values in the repo rather than a re-derivation (asserting `matchAgainst` equals
`matchAgainst` proves nothing). Ten tabs at their own depths come to roughly 1,300 states,
tab 45 alone contributing 512. The plan above is written for option A, and carries the real
measured strings for tabs 23, 45 and 47 from the spike.

**Options considered**:
- A) **One compact string per tab**, one character per state, `-` for a null match
  (`"222445333222445333…"`). One line per tab, diffs as a single changed line with the
  position of the change visible, no new tooling. Costs: unreadable on its own, and a
  reviewer confirming a *deliberate* change has to decode positions back to shapes.
- B) **Explicit arrays keyed by shape name** (`{ "correct/perZone -> default/noSparks": 5,
  … }`). Self-describing and a PR diff names the shape that moved, at the cost of roughly
  1,300 lines of fixture in the test file.
- C) **A generated JSON fixture** plus a `scripts/generate-sweep-baseline.js`, regenerated
  the way the replay fixture already is. Keeps the test file small and gives the repo a
  regeneration story that matches an existing one, at the cost of a second generator script
  and a workflow step someone has to remember.

**Decision**: **D**, a hybrid that the three options above missed: **store compact, assert
named**. All three were built for tab 23's 81 states and diffed against a simulated
deliberate change, which put real numbers on the trade. Sizes for tab 23, then extrapolated
across all ten tabs (1,132 states): A flat 2 lines / ~20; A chunked 12 / ~150; B 83 / ~1,150;
C 413 / ~5,000 plus a generator.

The deciding evidence was not the PR diff but the Jest failure message, which is what a
developer sees first. `expect(series).toBe(baseline)` on option A prints two 81-character
strings (512 for tab 45) with no pointer to the difference. Option B's `toEqual` names each
changed key, and does not truncate at 27 simultaneous changes, but prints every unchanged key
as context and costs ~1,150 committed lines.

D keeps A's storage and beats B's diagnostics: commit the compact series, chunked one line per
first-run shape and labeled with it, then assert that the *moved set* is empty rather than
that the string matches. The failure then lists only the states that moved, named, with old and
new values, and nothing else. Verified on a three-state perturbation; the output is quoted in
the sweep step above.

Two supporting findings. `max-len` is a warning at 160 characters (`.eslintrc.js:59`), so tab
45's 512-character flat series would warn while 64-character chunks will not; and CI runs
build, Jest and Cypress with no separate lint step, so this is about reviewability rather than
a gate. Also verified while testing the encodings, and recorded in the sweep step because it
constrains the code: this project's TS lib target predates ES2019, so `Array.prototype.flatMap`
and `Object.fromEntries` do not compile.

## Self-Review

Every issue below was checked against the branch before being written down, and the
throwaway probes were reverted afterwards (`git status` clean, `log.test.ts` and
`engine-singleton.test.ts` green at 26 tests).

**What was checked and holds**, so it is not re-litigated below: the `range_cc` derivation
reproduces all eleven of Sam's values from the parsed ASTs; R3a's screen passes (the only
range-0 variables are on tab 24, whose `range_cc` is 0); R13 gives `best` 5 / `current` 4,
R13a gives 2 / 3 / used 3 (with `min` selecting 2), and R8a gives 5 / 2, all exactly as
claimed; the `Expression` union is exactly the nine kinds `rangeCcOfExpression` switches on;
`version.test.ts` and `rules-version.test.ts` are both shape-only, so neither version bump
needs a test edit; `max-len` is a 160-character warning at `.eslintrc.js:59`; `tsconfig.json`
is `lib: ["dom","es5","es2017"]`; the substrate eslint zone is as described; the
`computeView` WeakMap is keyed on `(engine, snapshot, appRulesVersion)`, so an `EngineOpts`
selector needs no cache-key change; and every category on all eleven tabs has non-empty
feedback, so pointing the panel at `current` cannot land on a blank category.

**The committed baselines reproduce byte-exactly.** Both `BASELINES` strings were
re-derived from scratch against the axis sets the plan names. Tab 23 depth 2 gives an
81-character series identical to the plan's nine chunks, with 29 of 81 moved and 0 upward.
Tab 45 depth 3 gives a 512-character series identical to the plan's eight chunks, with 185
of 512 moved and 35 upward, and tab 45 at depth 2 gives 5 of 64 moved with 0 upward. That
is the plan's most load-bearing data and it is correct.

### Senior Engineer (sixth pass)

#### RESOLVED: `category_used` is derived independently in two places, and no proposed test pins the direction that would catch a regression
**Resolution**: the selection rule moves into the substrate as
`computeCategorySelectionForEngine`, returning `{ best, current, used, label }`. It is the
only place `current ?? best` is written, and the Feedback, Sidebar and Replay-fixture steps
all read it instead of restating it (that removed three copies, not two: the fixture
generator had a fourth phrasing of the same rule). The direction is pinned where it is
decided: `hazbot-button.test.tsx` and `sidebar.test.tsx` each gain a `best` 2 / `current` 3
case, and `evaluator.test.ts` asserts the rule directly. The R13a probe is relabeled to say
that it pins the two inputs and explicitly not the selection, so nobody reads it as the
revert guard again.

`readCategories` in `hazbot-button.tsx` computes `used: current ?? best`, and `computeView`
in `use-analysis-engine.ts` separately computes `categoryUsed = categoryCurrent ?? matchedCategory`.
The plan introduces `readCategories` specifically so "the two call sites do not drift apart",
but that reasoning stops at the component boundary: the sidebar's copy is a second
independent expression of the same rule, and R8 requires the highlighted row to show the
number the student was actually shown.

The gap that matters is the test coverage, because R13a exists precisely to stop a silent
revert to `min(best, current)` and, as planned, it cannot. The R13a probe lives in
`src/hazbot/rule-sets/`, builds `best` with `matchAgainst` and `current` with
`matchCurrentAgainst`, and then compares against the test's own `current ?? best`. That is
a tautology: it never executes `readCategories`. The one component-level case the plan does
add is described only as "a stubbed engine where `best` and `current` differ", and in the
common direction (`current < best`) a `min` revert still selects `current` and the test
still passes. So after this branch lands, reverting `used` to `min` would keep CI green.

Verified: `current > best` is real and reproducible. Tab 45 at depth 3 gives 35 of 512
states with `current` above `best`, and the R13a sequence (run 1 changed setup with a fire
line, run 2 default with a helitack, run 3 default plain) gives `best` 2, `current` 3,
`used` 3, where `min` would give 2.

**Suggested resolution**: two parts. Express the selection rule once, so the button and the
sidebar cannot disagree, either by returning `used` from the substrate beside `category` or
by exporting a one-line `selectCategoryUsed(best, current)` that both call. Then pin the
direction where it is decided: make the `hazbot-button.test.tsx` case (and the sidebar
highlight case) use `best` 2 / `current` 3, asserting the rendered body is category 3's
text, `categoryUsed: 3` on the payload, and the highlight on row 3. Note that
`hazbot-button.test.tsx` already `jest.mock`s `../hazbot/engine` and stubs the engine as a
bare `{ ruleSet: { categories } }`, so the mock factory has to gain
`computeCurrentCategoryForEngine` and the case costs almost nothing.

---

### QA Engineer (fourth pass)

#### RESOLVED: the shared `TabFixture` shape does not fit tab 25, and tab 25 is one of the ten tabs it must cover
**Resolution**: `defaults` is now optional on `TabFixture`, mirroring `makeWildfireEngine`'s
own signature and citing the caution comment that explains why 25 omits it. The single
`start` becomes a `builders` record (typed to still require a `start` key), with an optional
`builder` name on `TabShape`; tabs 25 (`topoReading`) and 34 (`zones`) are named as the two
that use the extra slot, and the step now says to build tab 25 first, since it is the only
tab that exercises both departures.

**Superseded by the eighth-pass review.** The `builders` half of this resolution was wrong in
both directions: `zones(veg, drought)` is not a `ReadingBuilder` and could not have gone in
the record, and `topoReading`'s entire contribution is two data fields. `TabFixture` is now
data only, with a `base` object and one shared builder. The `defaults`-is-optional half
stands.

The fixture step is the one the plan itself says "decides whether R12b is a gate or a
decoration", and its interface does not type-check against two of the ten tabs.

`TabFixture` declares `defaults: WildfireDefaults` as required. Verified:
`25.test.ts` is the only tab test that calls `makeWildfireEngine(ruleSet25)` with a single
argument, and that is deliberate rather than an oversight. The caution comment on
`makeWildfireEngine` (`test-helpers.ts:16-27`) explains that `defaults` is optional exactly
because rule set 25 references no `set*` factor variable and no defaults-consuming sim-prop,
and it lists the ten tabs that must pass `defaults`, with 25 absent. So a required
`defaults` forces a meaningless value into the one tab whose whole point is not having one.

`TabFixture` also declares a single `start` builder. Verified: tab 25 has two,
`startReading` and `topoReading` (`25.test.ts:55` and `:64`), and its cat 4/5/6 bodies call
`topoReading` because those shapes need `heightmapMaxElevation` and `tpiMarginFraction`
alongside the per-spark `tpi` arrays. R12d already names the `sparksTopBottom` /
`sparksPerZoneMid` pair as in scope. Tab 34 carries a second helper too, `zones(veg, drought)`
at `34.test.ts:44`. With one `start`, either those helpers stay behind in the tab files
(so the sweep and the per-category tests no longer share a source, which is the whole of
R12c) or the tab bodies get rewritten, which breaks this step's own fidelity gate: "the
full suite passes with no test-body edits beyond the import change".

**Suggested resolution**: make `defaults` optional on `TabFixture`, mirroring
`makeWildfireEngine`'s signature and quoting its reason. Let the fixture carry the tab's
builders rather than exactly one, either as a `builders` record or by having each
`TabShape` name which builder it uses. State in the step that tabs 25 and 34 are the two
that exercise the second slot, so an implementer sizing the move knows before starting.

---

### TypeScript / Build Engineer

#### RESOLVED: the `log.ts` edit breaks `src/log.test.ts`, which is not in the step's Files affected
**Resolution**: `src/log.test.ts` is now in the Derive step's Files affected, with the exact
mock line, the measured failure count, and the note that ts-jest renders this particular
failure with an empty message body. The two suites that mock the same barrel and need
nothing are named so they are not "fixed" speculatively.

Verified empirically by applying the plan's change (the third `rangeCc` parameter on
`buildAnalysisEngineActivatedPayload`, `getDerivedRangeCc` exported from the wildfire
barrel, and the new argument at `log.ts:39`) and running the suite. Two of the four tests in
`src/log.test.ts` fail with `getDerivedRangeCc is not a function`, because
`loadLogWithMocks` installs a `jest.doMock("./hazbot/wildfire", …)` factory that returns
exactly three exports (`getAnalysisEngine`, `getRequestedPresetInfo`,
`buildAnalysisEngineActivatedPayload`). Adding `getDerivedRangeCc: () => 1` to that factory
turns all four green. The spike was reverted.

Two neighboring risks were checked and are clear. `src/components/app.test.tsx` mocks the
same barrel but `app.tsx` never calls the new function, and `engine-singleton.test.ts`
asserts the payload with `toEqual` on two-argument calls, which the plan's optional-and-
spread `rangeCc` leaves untouched. Both suites pass unchanged, 27 tests.

**Suggested resolution**: add `src/log.test.ts` to the Derive step's Files affected with the
one-line mock addition, and note that the existing `ACTIVATED_PAYLOAD` assertion needs no
change because the mocked builder ignores the extra argument.

---

### Substrate / Library Maintainer

#### RESOLVED: `deriveRangeCc` makes wildfire the first host code to reach past the substrate's public barrel, in the same commit that versions that barrel
**Resolution**: the substrate gains one function, `categoryExpressions(engine)`, returning
only successfully-parsed ASTs, so `CachedAst` and `PARSE_ERROR_SENTINEL` never cross the
boundary and stay free to change. `deriveRangeCc` narrows to
`(exprs: Map<number, Expression>) => number` and both call sites pass
`categoryExpressions(engine)`; the gratuitous deep import of `Expression` is dropped in
favor of the barrel. The boundary rule is now written down in the selector step (production
host code through the barrel, test files may deep-import, with `test-helpers.ts` as the
existing precedent), which is what keeps R3a's `walkReferences` out of the public API. R10b's
versioned surface is restated as three additions rather than one.

`range-cc.ts` imports `CachedAst` and `PARSE_ERROR_SENTINEL` from `"../engine/engine"`, and
R3a's test additionally needs `walkReferences`. Verified against
`src/hazbot/engine/index.ts`: none of the three is re-exported, and the file's header states
that "everything not re-exported here is substrate-internal". Verified by grep that no
production file outside `src/hazbot/engine/` imports any of them today; the only existing
deep import from outside the barrel is `engine-singleton.ts`'s `../engine/sidebar`, which is
a declared sub-barrel with its own `index.ts`. (`Expression` is a separate case: it is
already exported from the barrel at `index.ts:14`, so `range-cc.ts` importing it from
`"../engine/parser"` is an unnecessary deep import.)

This is not a lint failure. The `import/no-restricted-paths` zone constrains the engine as
importer, not as importee, so the deep imports compile and pass lint. It is an API question,
and it is live right now because R10b is bumping `0.0.1` to `0.1.0` for exactly this
surface: the plan declares one addition to the public API and quietly adds a second,
undeclared one that a future substrate refactor is free to break. There is a real argument
that the barrel is already incomplete, since `engine.parsedExpressions` is a public field
typed `Map<number, CachedAst>` and a host cannot use it safely without the sentinel.

**Suggested resolution**: decide it rather than inherit it. Either add `CachedAst`,
`PARSE_ERROR_SENTINEL` and `walkReferences` to `index.ts` as part of the `0.1.0` surface
(defensible, since the public `parsedExpressions` field already implies them), or keep them
internal and give the host a narrow accessor. Either way, drop the redundant deep import of
`Expression` and say in the step which choice was made, since R10b's version bump is
supposed to name what it versions.

---

#### RESOLVED: the Category summary block renders for hosts that supply no window
**Resolution**: the block is gated on `engine.readingsWindow`, so a substrate consumer that
supplies no selector sees today's sidebar unchanged, while wildfire always renders it,
including tab 24 where the selector exists and returns null and the walker needs to see
`current: n/a` with the highlight back on `best`. The step now says why neither
`engine.ruleSet` nor `categoryWindowLabel !== null` is the right gate, and a test pins the
selector-less case.

The block is gated on `engine.ruleSet &&` only, so any substrate consumer without a
`readingsWindow` gets three new rows plus the R8a note. Verified against
`sidebar.test.tsx`: its engines are built with no selector, so `categoryCurrent` is null,
`categoryUsed` falls back to `matchedCategory`, and the two existing matched-highlight
assertions still pass. The problem is not breakage, it is that such a host now sees its only
category value relabeled `best`, a `current: n/a` row for a concept it does not have, and a
note explaining that the panels below "describe **best**, not **current**", which is
meaningless without a window.

**Suggested resolution**: gate the `current` and `used` rows and the R8a note on the engine
actually having a window (`categoryWindowLabel !== null` is already threaded, or test
`engine.readingsWindow` directly). A windowless host then sees today's sidebar unchanged,
which is also the right default for an additive minor.

---

#### RESOLVED: `matchCurrentAgainst` reimplements the window, so the sweep cannot see a change in `makeReadingsWindow`
**Resolution**: `matchCurrentAgainst` now points a real engine's public `readings` field at
the pre-translated array and calls `computeCurrentCategoryForEngine`, so the trim, the `at`
fallback, the `rangeCc` 0 null and the label are all production code under test rather than a
copy. `makeWildfireEngine` gains the selector (assigned post-construction, for the same
thunk-shaped reason production uses), and `BASELINES[tab].rangeCc` is demoted from an input to
an assertion against `deriveRangeCc`, removing the second place the window size was stated.

The helper's own comment names the drift risk and then accepts it, but the sweep is R12b's
always-on gate, and as written it never executes `makeReadingsWindow` or
`computeCurrentCategoryForEngine`. A change to either (excluding unfinished runs, moving the
`at` fallback, changing the `rangeCc` 0 answer) leaves the sweep green. The `rangeCc` it is
handed also comes from the hardcoded `BASELINES` entry rather than from `deriveRangeCc`, so
the sweep and production could window differently and only `range-cc.test.ts` would notice.

This is closable rather than inherent: `Engine.readings` is a public mutable field, so a
helper can assign the pre-translated array to a test engine built with the real selector and
call `computeCurrentCategoryForEngine`, exercising the production path end to end. That also
removes the second place `rangeCc` is stated.

**Suggested resolution**: give `makeWildfireEngine` an optional `readingsWindow` and have
`matchCurrentAgainst` drive the production entry point, or, if the direct-readings shape is
worth keeping, say explicitly in the step that the sweep gates classification only and that
the window plumbing is gated by `run-window.test.ts` instead.

---

### Data / Analytics Engineer (second pass)

#### RESOLVED: R14b names `replay-determinism.test.ts`, the plan touches only `replay-fixture.test.ts`, and the difference is not recorded
**Resolution**: the Replay step now says outright that R14b's citation points at a different
test than the one carrying the fixture, and does both halves.
`replay-determinism.test.ts` gains a run-free `readings.slice(-1)` selector in `makeOpts()`
and a `currentA` / `currentB` pair asserted alongside the existing `matchedA` / `matchedB`.
Verified that the file holds no literal expectations, so the addition pins determinism for
`computeCurrentCategoryForEngine` without touching anything already there. The selector also
serves as a small check that the new API is usable by a host with no concept of a run.

R14b justifies itself with "without it `current` sits outside `replay-determinism.test.ts`
entirely". Verified: that file is substrate-side, builds two engines over a hand-written
synthetic rule set with a single `ranSimulation` category, and has no connection to
`__fixtures__/expected.json`. Adding the two series to the wildfire fixture does nothing for
it. The plan is right to touch only `replay-fixture.test.ts`, but it inherits R14b's claim
without noting that the named file is a different test, so `computeCurrentCategoryForEngine`
ends up with no two-engine determinism coverage at all.

**Suggested resolution**: either extend `replay-determinism.test.ts` (add a
`readingsWindow` to its `makeOpts()` and push a second history array beside the existing
one, a handful of lines that genuinely pins the new entry point against non-determinism), or
say in the step that R14b's citation is to the wrong file and that determinism for `current`
is covered by the fixture test alone. The first is cheap enough to prefer.

---

### Senior Engineer (seventh pass, re-review of this pass's own changes)

#### RESOLVED: the sweep's engine gets its selector after construction, contradicting the invariant that lets the WeakMap key alone
**Resolution**: `makeWildfireEngine` gains a `windowed` flag and builds the selector into
`EngineOpts`, closing over a `let engine` declared above the constructor call, which is the
same deferred-reference pattern `engine-singleton.ts` and the fixture generator already use.
The sweep calls `makeWildfireEngine(ruleSet, defaults, true)`, the contradictory
"third argument" prose is gone, and the step now states outright that `readingsWindow` is
never assigned post-construction anywhere, with the spike's stale-`categoryCurrent`
measurement as the reason.

Two problems, one cause. The sweep step now says "`makeWildfireEngine` takes the selector as a
third optional argument" and then shows the opposite in the code beneath it, a
post-construction `engine.readingsWindow = …` assignment, with a parenthetical calling it a
fourth parameter. The prose and the snippet disagree about which it is.

The substantive half is that post-construction assignment quietly weakens a claim the Sidebar
step depends on: "The WeakMap cache needs no new key component: the selector arrives on
`EngineOpts` and is therefore fixed for the engine's lifetime, which the spike confirmed is
not true of a prop-borne selector." If a helper in the repo assigns the field after
construction, "fixed for the engine's lifetime" becomes a convention rather than a property,
and the next person who wants to vary a selector mid-test has a sanctioned way to do it and a
stale `computeView` to debug.

The chicken-and-egg that prompted the assignment is real (the derivation reads
`parsedExpressions`, which does not exist until the constructor returns) but it is already
solved in production without mutation: `engine-singleton.ts` closes over the module-level
`cached` binding and `generate-replay-fixture.js` closes over its own `engine` const, in both
cases building the thunk before the engine exists and calling it only afterwards.

**Suggested resolution**: have `makeWildfireEngine` do the same internally, so the selector
genuinely arrives on `EngineOpts` and the field is never written after construction:

```ts
export function makeWildfireEngine(
  ruleSet: RuleSet<WildfireDefaults>,
  defaults?: WildfireDefaults,
  windowed = false,   // build with the production readings-window selector
): Engine<WildfireReading, WildfireDefaults> {
  let engine: Engine<WildfireReading, WildfireDefaults>;
  const opts: EngineOpts<WildfireReading, WildfireDefaults> = {
    /* …existing… */
    ...(windowed
      ? { readingsWindow: makeReadingsWindow(() => deriveRangeCc(categoryExpressions(engine))) }
      : {}),
  };
  engine = new Engine<WildfireReading, WildfireDefaults>(opts);
  return engine;
}
```

Then the sweep is `makeWildfireEngine(ruleSet, defaults, true)`, the prose and the code agree,
and the lifetime invariant holds by construction everywhere. Note the boundary this crosses:
`test-helpers.ts` lives under `src/hazbot/rule-sets/` and would now import
`makeReadingsWindow` and `deriveRangeCc` from `../wildfire/`, which it already does for
`factorVariables`, `simProps`, `translate` and `types`, so nothing new is opened up.

---

### Senior Engineer (sixth pass, housekeeping)

#### RESOLVED: the illustrative `label` in the new substrate type is a value the code cannot produce
**Resolution**: the doc comment's example becomes `range_cc 2 · 2 of 3 runs`, which is the
R13a case and verified to be emitted. `makeReadingsWindow` carries a note that the covered
count is always `min(rangeCc, total)` and so adds no information the other two numbers lack,
with the reason all three stay (R8 names the window size and the covered count, and the total
is the one a walker cannot recover). The `run-window.test.ts` label case records the reachable
set and the unreachable shape.

`WindowSelection.label` is documented as "wildfire supplies e.g. `range_cc 2 · 1 of 2 runs`".
Verified by enumeration over 0 to 5 runs at `rangeCc` 1 and 2: the covered count is always
`min(rangeCc, totalRuns)`, so with `range_cc` 2 and two runs the label is
`range_cc 2 · 2 of 2 runs`, and `1 of 2` is unreachable. The labels the planned code actually
emits are `range_cc 2 · 0 of 0 runs`, `1 of 1`, `2 of 2`, `2 of 3`, and so on. Minor on its
own, but it is the worked example in a new public API comment, and it misdescribes the
middle number as "how full the window is" when it means "how many runs the window covers".

**Suggested resolution**: replace the example with one the code emits (`range_cc 2 · 2 of 3 runs`
is the R13a case, verified). Worth noting while there that the covered count is fully
determined by the other two numbers, so if R8 wants a walker to see something it cannot
compute, the useful third number is the total, which the label already carries.

---

#### RESOLVED: this pass left two arithmetic leftovers
**Resolution**: the feedback step is ~115 and the total is ~1,720. The replay generator now
takes all three series from one `computeCategorySelectionForEngine` call, with `best` feeding
`matchedCategoryHistory`; the value is identical, so R14's no-movement bar on that series is
unaffected.

Neither changes a decision, but both are the kind of stale number a reviewer trips over.

The per-step estimates moved (the selector step from ~130 to ~185 for
`computeCategorySelectionForEngine` and `categoryExpressions`, the replay step from ~120 to
~130 for the determinism addition, and the feedback step's two new component cases are not
reflected in its ~90), while the closing summary still reads "~1,630 lines across nine
commits". Summing the current per-step figures gives ~1,695, and ~1,720 once the feedback step
is corrected to ~115.

Separately, the replay generator now calls the floor twice per event: once through
`computeMatchedCategoryForEngine` for `matchedCategoryHistory` and again inside
`computeCategorySelectionForEngine`. Harmless (the floor is pure, and the fixture is 14
events) but pointless, and having the three series come from one call makes it self-evident
that they describe the same snapshot.

**Suggested resolution**: update the total to ~1,720 and the feedback step to ~115; push
`sel.best` into `matchedCategoryHistory` rather than making a second call, noting that the
value is identical so R14's "`matchedCategoryHistory` must not change" bar is unaffected.

---

## Self-Review (eighth pass)

Every issue below was verified by spiking the plan's own code onto the branch and
measuring, then reverting (`git status` clean, suite green at 72 suites / 796 tests).
The spike covered the substrate additions (`WindowSelection`, `EngineOpts.readingsWindow`,
`computeCurrentCategoryForEngine`, `computeCategorySelectionForEngine`,
`categoryExpressions`, `ENGINE_VERSION` 0.1.0), `range-cc.ts`, `run-window.ts`, the
singleton wiring, the `log.ts` call, `hazbot-button.tsx`, `use-analysis-engine.ts` and
`sidebar.tsx`, plus throwaway sweeps over all ten positive-`range_cc` tabs.

**What was checked and holds**, so it is not re-litigated below:

- The `range_cc` derivation reproduces Sam's eleven values exactly from the parsed ASTs
  (`{23:1, 24:0, 25:1, 32:1, 33:1, 34:1, 35:1, 42:1, 45:2, 47:2, 54:1}`), and R3a's screen
  returns an empty offender list.
- `Expression` is exactly the nine kinds `rangeCcOfExpression` switches on, and the
  `never` exhaustiveness check compiles.
- **All three `BASELINES` series reproduce byte-exactly**, along with every count the plan
  quotes: tab 23 depth 2 = 81 states, 29 moved, 0 upward; tab 45 depth 3 = 512 states, 185
  moved, 35 upward all `2 -> 3`, 0 landing on the top category; tab 45 depth 2 = 5 moved, 0
  upward; tab 47 depth 2 = 0 moved.
- **The tab-24 fifth check is exactly right**: `best` 5, `current` `null`, `used` 5, while
  an empty window returns `{ category: 1 }`. The nullable selector return is load-bearing.
- R13a reproduces (`best` 2 / `current` 3 / `used` 3) and R8a reproduces (`best` 5 /
  `current` 2 / `used` 2).
- **The R7 binding flip changes nothing**: applied alone it leaves the suite green at 72
  suites / 796 tests, and re-running every sweep above with the flip in place reproduces
  all three baseline strings and all counts character for character.
- **The sidebar gate works as claimed.** With the whole spike applied, `sidebar.test.tsx`,
  `use-analysis-engine`'s tests, `replay-fixture.test.ts` and `engine-singleton.test.ts` all
  pass untouched, so a selector-less host really does see today's sidebar.
- Both engine-construction shapes type-check under this repo's `strictNullChecks`-only
  config: `let engine` declared above `opts` (the plan's `makeWildfireEngine`) and `const
  engine` declared below it (the plan's replay-fixture shape). Neither trips TS2454 or
  TS2448, so the deferred-reference pattern is safe in both places.
- The `log.test.ts` prediction is exact: 2 of its 4 tests fail without the mock line, all 4
  pass with it, and `app.test.tsx` / `engine-singleton.test.ts` need nothing.
- **R4's fallback is unreachable across all ten positive-`range_cc` tabs, not just 45 and
  47.** Swept at depth 2 over each tab's own shape space (1,000+ states): zero null
  `current` and zero null `best` anywhere. That generalizes a claim the spec had only
  measured on two tabs.
- Every `file:line` citation added since the fifth pass resolves: `evaluator.ts:132-149`,
  `:159-163`, `:295-313`, `:318-328`; `engine-singleton.ts:84`; `log.ts:39`;
  `LOGGED-EVENTS.md:78`; `localhost-urls.md:118,184`; `hazbot-update-workflow.md` §7 at
  :199; `test-helpers.ts:16-27`; `25.test.ts:55,64`; `34.test.ts:44`; `42.test.ts:32`;
  `.eslintrc.js:59`; `tsconfig.json` `lib: ["dom","es5","es2017"]`.
- **The Data / Analytics lane came back clean.** `rangeCc` reaches the payload as `0` on
  tab 24 (the optional spread keeps it, since `0 !== undefined`), so R9b's disambiguator
  is present exactly where R4's two null causes need separating; `matchedCategory` keeps
  meaning `best` at the one call site that logs it; and the five events R9a names are the
  five that actually change meaning. No new issue.

---

### QA Engineer (fifth pass)

#### RESOLVED: R12d's axis set for tab 54 makes the committed sweep vacuous, and three of its shape counts are wrong
**Resolution**: **R12d** now names tab 54's severity axis and records the measurement, with
the same correction made in the Fixture step's table, where the per-tab shape counts are also
replaced by the counts read off each file's own constants (23 stays 9; 32 and 33 are 8; 35 is
12; 54 is 12). New **R12e** adds the structural guard to the sweep: each tab's `best` series
must cover more than one distinct category id, and the distinct set is logged per tab. That
turns this whole class of mis-built fixture from a green baseline into a named failure.

R12d's table groups tab 54 with 45 and 47 under "default vs changed zones x fire line x
helitack", 8 shapes. Built that way and swept at depth 2, **all 64 states classify as
category 2, for both `best` and `current`. Zero moved. Categories 3 and 4 are never
reached.** The committed baseline for tab 54 would be 64 identical characters, bar 1 could
only ever fail on a change that moved category 2 itself, and bar 2 would be unreachable.

The cause is in the rule set, not the harness. Tab 54's cats 3 and 4 both require
`DefaultVegetations AND SevereDroughts`, and `SevereDroughts` demands **every** zone at
Severe Drought (`sim-props.ts:343-350`), while the tab's SIMINIT default is No Drought on
all three zones. So a "default" run fails it and a "changed" run that bumps one zone to
Severe fails it too. Both land on cat 2's `NOT SevereDroughts` disjunct. Tab 54's own
axis is severity, not default-versus-changed: `54.test.ts` carries `severeZones` (all three
zones Severe) and `vegChangedNotSevere` for exactly this reason. Rebuilt on those, the tab
sweeps 144 states across categories 2, 3 and 4 with 35 moved.

The same over-generalization shows in the shape counts. R12d gives "9" for 23, 32, 33 and
35 alike. Read off each file's own constants, only tab 23 is 9 (3 zone shapes x 3 spark
shapes). Tab 32 has 4 zone shapes and 2 spark shapes (8), tab 33 the same (8), and tab 35
has 6 zone shapes and 2 spark shapes (12): `forestWW`, `forestWWNonUniformDrought`,
`forestWWNonUniformTerrain`, `changedNotForest`, `uniformDroughtNoForest` and the default,
at `35.test.ts:37-63`.

This matters more than a table correction because it is the exact failure R12c was written
to prevent, arriving through the requirement that is supposed to prevent it. R12c's own
demonstration is a tab-23 builder that reported 18 of 81 instead of 29; tab 54 under R12d
reports 0 of 64 and would be committed as a passing baseline that guards nothing.

**Suggested resolution**: give tab 54 its own row naming the severity axis
(`default` / all-severe / veg-changed-not-severe, crossed with fire line and helitack), and
correct the counts for 32, 33 and 35. Add a cheap structural guard to the sweep itself so
the next mis-built fixture announces itself: assert that each tab's `best` series covers
more than one distinct category id, and log the distinct set per tab. That single assertion
turns every one of these into a loud failure instead of a green baseline.

---

#### RESOLVED: the Feedback step's test blast radius is 14 of 24 tests, not the one case the step describes
**Resolution**: the Feedback step now states the measured 14-of-24 figure, gives the reason
(`computeCategorySelectionForEngine` reaches `computeMatchedCategoryForEngine` through
`evaluator.ts`'s local binding, not the mocked barrel, so the existing override is inert),
and names the conversion (`mockMatched` to `mockSelection`, `1` to
`{ best: 1, current: null, used: 1 }`). The ~115-line estimate stands, since the churn is one
line per site.

The step says the mock factory gains `computeCategorySelectionForEngine`, "the new cases
cost almost nothing", and "the existing 'no engine' case updates to expect all three payload
fields `null`". Measured by applying the step's change: `hazbot-button.test.tsx` runs **14
failed / 10 passed of 24**.

The reason is structural rather than incidental. The file mocks `../hazbot/engine` and
overrides `computeMatchedCategoryForEngine`, then drives 9 separate
`mockMatched.mockReturnValue(...)` sites (`:170` through `:288`). Once the component reads
`computeCategorySelectionForEngine` instead, those overrides are inert, and they cannot be
made to work indirectly: `computeCategorySelectionForEngine` calls
`computeMatchedCategoryForEngine` through evaluator.ts's own local binding, not through the
mocked barrel, so `requireActual` + one override no longer reaches it. Every site has to
become a `{ best, current, used }` stub. That is mechanical, but it is the whole
`mockMatched` half of the file plus the intro/tour/dismiss/reopen blocks that depend on it.

**Suggested resolution**: say so in the step, and rename `mockMatched` to `mockSelection` in
the description so the implementer knows the shape of the edit before starting. Keep the
~115-line estimate if it already accounted for this, but state the 14-of-24 figure, since
the current wording reads as one test changing and would make a reviewer treat 14 red tests
as a mistake rather than as the expected diff.

---

#### RESOLVED: seven of the ten sweep baselines are generated after the change they are meant to pin
**Resolution**: all seven missing series were **measured on the unmodified branch** and are
now committed in `BASELINES` alongside the three from the pre-implementation spike, with a
per-tab totals table (shapes, depth, states, moved, upward, categories covered). The sweep
step says not to re-measure during implementation, and the fixture step records that its axis
sets are the ones the series were measured against. Nothing is left to generate.

**A first attempt at this resolution was wrong and is recorded rather than quietly replaced.**
It moved the capture into the Fixture step on the stated ground that the Fixture step "lands
before Feedback, Sidebar and evaluateWith". It does not: the step order is Selector, Derive,
Feedback, Sidebar, evaluateWith, **Fixture**, Sweep, so the Fixture step is sixth and the
capture would have been just as post-change there, one commit earlier. It also told the
implementer to paste results into a file that commit does not yet create. Measuring against
the untouched branch, which is how tabs 23, 45 and 47 were already done, is the version that
actually holds. Recorded alongside: `best` is genuinely untouched (the spike ran the full
suite with every step applied and no `best`-dependent test moved, and the R7 flip reproduces
all three original series character for character), so this closed a cheap gap rather than a
live defect, and it is a gap R12e cannot cover, since R12e catches a fixture that never
reaches its categories, not one that reaches them at already-shifted values.

The Sweep step supplies real measured series for tabs 23, 45 and 47 and says to "generate
the remaining seven the same way once their fixtures land: run the sweep once with the
assertion replaced by a `console.log`, read the series, paste it in". The Sweep step lands
after Feedback, Sidebar and evaluateWith, so those seven baselines record whatever the
already-changed tree produces. For `best` that is very probably harmless (this story does
not touch it, and the spike confirms no `best`-dependent test moves), but it makes bar 1
self-confirming on seven of ten tabs, and it is the same mechanism that would have let the
tab-54 fixture above pass forever.

**Suggested resolution**: generate the seven series in the **Fixture** step, which lands
before any classification change, using `matchAgainst` as it exists today. The fixture step
already has every constant it needs and already carries a fidelity gate, so the baselines
arrive as a pre-change measurement rather than a post-change snapshot, and the Sweep step
then only adds the assertions.

---

### Senior Engineer (eighth pass)

#### RESOLVED: the `at`-resolved trim can silently return the wrong window, and the alternative is exact
**Resolution**: the trim no longer recovers an index from a run object. `canonical-runs.ts`
gains `canonicalRunStartIndices`, produced by the same walk as `canonicalRunReadings`, and
`canonicalRunWindowStart` reads `starts[starts.length - rangeCc]` with no `indexOf` and no
`at` comparison. Both the clone problem and the collision go away, and the run-boundary rule
stays in one place. The superseded `at` rule is marked amended in the Pre-implementation
section. `run-window.test.ts` gains the colliding-`at` pin, with the shared fixtures'
`at ?? 100` default named as the reason it is reachable by accident. Verified: the refactor
leaves the suite green at 72 suites / 796 tests, and the new trim returns 2 where the `at`
fallback returned 0 on the collision shape.

`canonicalRunWindowStart` falls back to `readings.findIndex((r) => r.at === target.at)` when
identity lookup fails, citing `readingIndexOf` (`evaluator.ts:159-163`) as precedent. The
precedent does not carry, because the two call sites have different failure costs.
`readingIndexOf` feeds the sidebar's "Matched on reading #N" label, where a wrong index
mislabels a diagnostic. Here a wrong index changes which readings `category.current` is
computed from.

`findIndex` returns the **first** reading with that timestamp, and `at` carries no
uniqueness contract. Demonstrated on a tab-47 session where the first reading shares its
`at` with the folded run's first start: the correct window start is index 2, and the trim
returns **0**, so the window silently widens to the entire session and `current` collapses
toward `best`. That is the bug the story exists to fix, reintroduced by the mechanism
written to prevent it, with no symptom at the call site.

Production exposure is genuinely low, since every reading-producing event
(`SimulationStarted` / `SimulationEnded` / `SimulationStopped`) is user-gesture driven and
`Date.now()` separates them. Test exposure is not low, and the plan's own `run-window.test.ts`
cases are the ones at risk: `mkReading(triggeredBy, opts.at ?? 100, …)` (`test-helpers.ts:62`)
and every tab's `startReading` default `at` to **100 for every reading**, so a folded-run
fixture written without explicit per-reading `at` values collides by construction and the
test passes for the wrong reason.

**Suggested resolution**: resolve the index exactly rather than heuristically. The
canonical-run walk in `canonical-runs.ts` already knows the index of each run's first start;
export a sibling that returns those indices (`canonicalRunStartIndices`) from the same walk,
and have `canonicalRunWindowStart` read `indices[indices.length - rangeCc]` with no identity
lookup and no `at` comparison. That removes the clone problem and the collision together,
keeps one implementation of the run-boundary rule, and is smaller than the two-step fallback
it replaces. If the fallback is kept instead, the step must say that every fixture in
`run-window.test.ts` assigns distinct `at` values deliberately, and add a case that pins the
colliding shape.

---

### TypeScript / Build Engineer (second pass)

#### RESOLVED: `TabFixture.builders` cannot type tab 34's helper, and tab 34 is named as one of the two tabs that need it
**Resolution**: larger than the reported defect, because the defect was a symptom.
`builders` and `ReadingBuilder` are gone; `TabFixture` is data only
(`{ id, defaults?, base, shapes }`) and the sweep builds every reading through one shared
`mkReading("SimulationStarted", at, { ...base, ...shape.reading })`. Checked against all
eleven files: no tab builder does anything but merge data, `topoReading` is two literals that
belong in `base`, and `zones(veg, drought)` is a zone-array constructor that a
`ReadingBuilder` record could never have held. Verified by sweeping all ten
positive-`range_cc` tabs through the single-builder form, including tab 25 reaching
categories 2-6. The fidelity gate is held instead by each tab file keeping its own
`startReading` / `topoReading` wrapper over the fixture's `base`, so no test body changes.
The "build tab 25 first" note is dropped: with `builders` gone, the only per-tab departure
left is the optional `defaults` and there is nothing to sequence around.

The fourth-pass QA issue widened `TabFixture` from a single `start` builder to a
`builders: Record<string, ReadingBuilder> & { start: ReadingBuilder }` record, and the step
now says "tabs 25 (`topoReading`) and 34 (`zones`) are named as the two that use the extra
slot". Verified against the file: tab 25's `topoReading` (`25.test.ts:64`) is a
`ReadingBuilder` and fits. Tab 34's helper is not one.

```ts
function zones(veg: [string, string, string], drought = "Mild Drought"): WildfireZone[]
```

`34.test.ts:44`. It takes a vegetation triple and a drought label and returns
`WildfireZone[]`, so it satisfies neither half of
`ReadingBuilder = (opts?: Partial<WildfireReading>) => WildfireReading`. Putting it in
`builders` does not compile.

The consequence is sequencing rather than difficulty. The step says to build tab 25 first
"since it is the only tab that exercises both departures", which is true only if tab 34's
helper really is a builder. As written, tab 34's mismatch surfaces after nine tabs have
been moved against an interface that does not fit it.

Worth noting while there: tab 34 may need no helper at all. Its three derived shapes are
already named constants (`vegChanged`, `droughtChanged`, `vegAndDroughtChanged`,
`34.test.ts:51-53`), so moving those three plus `changedWind` satisfies R12c's
one-source rule and `zones` can stay in the tab file as a private constructor.

**Suggested resolution**: drop tab 34 from the "second builder slot" list, say that its
`zones` helper stays local because only its outputs are shared, and correct the "build tab
25 first" note to say tab 25 is the only tab exercising both the optional `defaults` and the
second builder slot. If a tab-level zone helper is wanted in the fixture anyway, it needs a
slot of its own with its own type, not the `ReadingBuilder` record.

*Superseded by the resolution above.* Asked why any tab needed a helper at all, the answer
turned out to be that none does: checked against all eleven files, every builder merges data
and nothing else. So the slot was removed rather than retyped, which resolves this and the
fourth-pass issue that introduced `builders` together.

---

### Release / Change-safety Engineer

#### RESOLVED: `APP_RULES_VERSION` is bumped in the last commit, seven commits after the semantics it marks
**Resolution**: the `rules-version.ts` bump moves into the **Feedback** step, next to the
change it marks, with the reasoning stated there. The docs step keeps R9a, R10a and R14a and
now says outright that neither version constant lives in it, since each belongs with the
change it versions. `rules-version.test.ts` is shape-only, so nothing else moves.

The Selector step argues the point correctly for the other version: "`ENGINE_VERSION` is not
here: it belongs with the substrate API it versions, in the first step." The Docs step then
does the opposite for `APP_RULES_VERSION`, which by R10a's own widened policy marks a change
in **evaluation semantics**. Those semantics change in the Feedback step, commit 3 of 9. So
commits 3 through 8 classify students under version 6's rules while every
`AnalysisEngineActivated` payload reports `appRulesVersion: 5`.

This is the break R9 and R9b exist to prevent, applied to the version handle itself: a
session logged from a mid-branch build is indistinguishable from a WM-51 session. The repo
does deploy per-branch builds, so a mid-branch state is reachable by more than bisect.

**Suggested resolution**: move the `rules-version.ts` bump into the Feedback step, next to
the change it marks, and leave the `LOGGED-EVENTS.md` / workflow / walker-guidance edits in
the Docs step. `rules-version.test.ts` is shape-only (verified), so the move costs one line
in each step's Files affected and nothing else. The same argument the plan already makes for
`ENGINE_VERSION` applies unchanged.

---

### Substrate / Library Maintainer (second pass)

#### RESOLVED: the `HookReturn` comment's label-to-window rule is falsified by this plan's own determinism selector
**Resolution**: the comment now describes `categoryWindowLabel` as what it is, an optional
host-authored display string, names this branch's own label-less selector as the
counterexample, and says outright not to infer window presence from it. The sidebar gate
(`engine.readingsWindow`) was already correct and is unchanged, and the comment now points at
it. A note records that distinguishing R4's two null causes through `HookReturn` would need
its own field.

The Sidebar step documents the new fields as:

> `categoryCurrent` is null both when the activity has no window and when the window matched
> nothing; `categoryWindowLabel` is non-null only in the second case, so the sidebar can tell
> them apart.

`WindowSelection.label` is optional, so that biconditional holds for wildfire and for nobody
else. The counterexample ships in the same branch: the Replay step's determinism selector is
`readingsWindow: (readings) => ({ readings: readings.slice(-1) })`, with no label. That host
has a window, matches a category, and still reads `categoryWindowLabel: null`.

Nothing breaks today, because the block is correctly gated on `engine.readingsWindow` rather
than on the label. The cost is that the comment states a contract the type does not carry,
on the public surface `0.1.0` is being cut for, which is where the next substrate host will
look.

**Suggested resolution**: rewrite the comment to describe what is actually true: the label is
the host's optional description of the window it chose, absent whenever the host does not
supply one; the presence of a **window** is `engine.readingsWindow` plus a non-null
selection, which is what the sidebar gate already uses. If the two null causes really need to
be distinguishable through `HookReturn`, that wants its own field rather than an inference
from an optional display string.

---

### Senior Engineer (eighth pass, housekeeping)

#### RESOLVED: two measured facts do not reproduce
**Resolution**: the empty-message-body sentence is replaced with the actual failure text, and
the reason for naming the mock line is restated as commit hygiene rather than diagnosability.
The label case now states the rule (`covered = min(rangeCc, total)`, so `R of N` for every
`N >= R` plus the two short-session cases) instead of an incomplete enumeration. Both load-
bearing claims were re-verified and stand.

Neither changes a decision; both are stated as measurements, which is why they are worth
correcting.

The Derive step says the `log.test.ts` failure "is not self-describing: ts-jest renders it
with an empty message body, so it reads as a broken suite rather than as a missing mock
export". Measured on this branch, both failures render as
`TypeError: (0 , wildfire_1.getDerivedRangeCc) is not a function` with the offending line
(`log.ts:39`) quoted. The mock line is still required, and naming it still saves time; the
justifying sentence about an empty message body should go rather than be relied on.

The `run-window.test.ts` label case says: "Measured over 0 to 5 runs at `rangeCc` 1 and 2,
the emitted set is `0 of 0`, `1 of 1`, `2 of 2`, `1 of 2` (rangeCc 1 only) and `2 of 3`."
Enumerated over that same range, the set is twelve labels, not five: at `rangeCc` 1,
`0 of 0`, `1 of 1`, `1 of 2`, `1 of 3`, `1 of 4`, `1 of 5`; at `rangeCc` 2, `0 of 0`,
`1 of 1`, `2 of 2`, `2 of 3`, `2 of 4`, `2 of 5`. The two claims that carry weight both
survive: the covered count is always `min(rangeCc, total)`, and `range_cc 2 · 1 of 2 runs`
is unreachable.

**Suggested resolution**: drop the empty-message-body sentence, and restate the label set as
"covered is `min(rangeCc, total)`, so the reachable labels are `rangeCc of N` for every
`N >= rangeCc` plus the short-session cases `0 of 0` and `1 of 1`".

---
