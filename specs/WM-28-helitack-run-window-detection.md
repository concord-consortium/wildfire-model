# Hazbot: Helitack Run-Window Detection

**Jira**: https://concord-consortium.atlassian.net/browse/WM-28

**Status**: **Closed**

## Overview

Teach the Hazbot engine to recognize when a student dropped a helitack during a
simulation run, so the rule-sets that reward or classify helitack use (tabs 45,
47, 54) classify correctly instead of treating every helitack as if it never
happened.

The Hazbot watches what a student does in the Wildfire model and classifies the
behavior into pedagogical categories that (in a later story) drive help and
feedback. Three of the extracted feedback tables reward students for using the
helitack tool, but the engine was blind to helitack drops: it silently ignored
them, so the "you used a helitack" categories could never fire and a few
neighboring categories misclassified helitack runs. This misclassification was
latent: the category is read only by the dev sidebar, not yet logged or surfaced
to students, so no student saw wrong feedback. This story fixed the
classification ahead of the feedback UI that will consume it: it makes the engine
see in-run helitacks, removes the temporary stubs left in place by WM-18, and
re-validates that tabs 45/47/54 classify helitack behavior correctly.

## Requirements

- **R1: Detect in-run helitacks.** The engine recognizes a `Helitack` event that
  occurs after a `SimulationStarted` and before that run's terminating event as an
  in-run helitack attributable to that run. A run ends via any of its run-end
  lifecycle events: `SimulationStopped`, `SimulationRestarted`,
  `SimulationReloaded`, `TopBarReloadButtonClicked`, or `SimulationEnded`. How a
  run terminates does not matter. A helitack during a run that has started but not
  yet terminated counts as in-run immediately (no terminator required).
  Attribution is by drop *occurrence* within the run window, regardless of
  placement or effectiveness (the `{x, y, elevation}` payload is not inspected),
  mirroring `usedFireline`.
- **R2: Exclude out-of-run helitacks.** A `Helitack` event before any run, or
  after a run terminates and before the next run starts, is not attributed to any
  run.
- **R3: `Helitack` sim-prop (per-run).** Bound by `WITH` to a run's witness
  reading, evaluates `true` iff that run contained an in-run helitack.
- **R4: `usedHelitack` factor variable (cross-run).** Evaluates `true` iff at
  least one run in the session contained an in-run helitack, mirroring the
  `usedFireline` aggregation pattern.
- **R5: Remove the WM-18 stubs.** The `isStub: true` stubs for `Helitack`
  (`sim-props.ts`) and `usedHelitack` (`factor-variable-stubs.ts`) are removed so
  the load no longer emits a `stub-warning` for them.
- **R6: Rule-sets 45/47/54 load and classify correctly.**
  - Tab 45 Cat 4 (helitack success) is reachable, satisfiable within a single
    trial (fireline + helitack in the same run) or across multiple trials
    (fireline in one run, helitack in another), because `Fireline` and `Helitack`
    each bind their own `WITH` reading. The cross-trial allowance is intended sheet
    semantics, accepted as-is; the pedagogical tension with Cat 3's same-run
    coaching cue is flagged upstream for the workbook author, not resolved here.
  - Tab 45 Cat 3 (`NOT (usedFireline AND usedHelitack)`) stops over-matching
    fireline+helitack runs.
  - Tab 47 Cat 3 stops over-matching helitack-only runs; Cat 4 and Cat 5 (the
    `(Fireline OR Helitack)` arms, gated on `DefaultVars`) are reachable and
    mutually exclusive: Cat 5 fires only when a clean-baseline run also exists, Cat
    4 when it is absent. Cat 4 is a corrective nudge; only Cat 5 is the success
    celebration.
  - Tab 54 Cat 3 stops over-matching helitack-only runs; Cat 4 (the helitack arm,
    gated on `DefaultVegetations AND SevereDroughts`) is reachable. Tab 54 has no
    Cat 5.
- **R7: Unit tests.** Coverage for the engine-substrate change, the `Helitack`
  sim-prop, and the `usedHelitack` factor variable, plus negative-path tests: a
  pre-run helitack and a between-runs helitack are excluded, and a helitack in one
  run does not leak into a subsequent run (cross-run non-stickiness). The
  between-runs coverage includes the no-op-terminator case explicitly (a helitack
  after `SimulationRestarted` / `SimulationReloaded` / `TopBarReloadButtonClicked`,
  none of which push a terminating reading). The Jest case is the **authoritative**
  guard for the no-op-terminator exclusion (not UI-reachable). Existing WM-18
  per-category coverage for 45/47/54 is retained as regression coverage for the
  non-helitack categories.
- **R8: Re-validation (Playwright, primary acceptance evidence).** A Playwright MCP
  walk of tabs 45/47/54 against a running dev server, driving helitack drops with
  `window.test.placeHelitackInZone`. The durable record is a per-tab summary in the
  PR description (see Decisions); `tmp/playwright/` screenshots are optional. The
  no-op-terminator exclusion is not exercised here (covered by R7 Jest only).
- **R9: Docs update.** `docs/hazbot-validation/localhost-urls.md` (stub-effects
  table + validation status), `src/hazbot/TBD.md` §2 (Helitack / usedHelitack stub
  entry resolved), the WM-18 spec's "Not Yet Implemented" note, and the
  `window.test.placeHelitackInZone` description in `CLAUDE.md`. Regenerate the
  per-tab playbooks; commit any diff (the regen was a no-op because the rule-set
  expressions are untouched).
- **R10: `placeHelitackInZone` must emit the `Helitack` event.** The
  `window.test.placeHelitackInZone` helper, which previously only called
  `simulation.setHelitackPoint(...)` and emitted no log, now also emits the
  production `Helitack` log payload (normalized `{x, y}` plus `cell.elevation`,
  matching the pointer path) after applying the drop, so the R8 walk reaches the
  engine. The sibling `placeSparkInZone` / `placeFireLineInZone` helpers are
  intentionally unchanged (their classification reads the `SimulationStarted`
  snapshot).

## Technical Notes

- **Helitack event already flows in.** `log("Helitack", {...})` fires at
  `use-helitack-interaction.ts`, reaching the engine via `log.ts` to
  `engine.consume()`. No production emission change; the engine simply needed to
  stop dropping the event.
- **Not all run terminators produce readings.** Of the five run-end events, only
  `SimulationEnded` / `SimulationStopped` push a reading; `SimulationRestarted` /
  `SimulationReloaded` / `TopBarReloadButtonClicked` are translate no-ops. The
  chosen mechanism closes the run window on all five. The substrate-level leak from
  a no-op terminator is real but not UI-reachable today (every no-op terminator is
  preceded by a reading-pushing `SimulationEnded`), so the R7 Jest test is the
  authoritative guard, not the R8 walk.
- **Sheet typo in the terminator set.** `45.ts`'s `ranSimulation.logEvents`
  misspells one terminator as `"SImulationRestarted"`. The impl keys run-window
  closing off the canonical `translate.ts` event names, treating the sheet strings
  as descriptive metadata only. Fixing the workbook typo is flagged upstream (out
  of scope here).
- **Reference impls.** `usedFireline` (`factor-variables.ts`) and `Fireline`
  (`sim-props.ts`) are the closest sibling impls.

## Out of Scope

- The student-facing Hazbot UI (launcher, feedback panel, coach-marks).
- `SparksAtTopAndBottom` (WM-15) and any other stubbed impl.
- Any change to the source workbook or re-extraction of rule-set expressions; the
  45/47/54 expressions are unchanged by this work. The workbook typo and the
  Cat 3-vs-Cat 4 pedagogical tension are flagged upstream, not fixed here.
- App-side changes to how / when the `Helitack` event is emitted on the production
  pointer path. R10's emit is confined to the `window.test.placeHelitackInZone`
  test hook.
- Accessibility (WCAG / keyboard / screen-reader) concerns, per repo convention.

## Not Yet Implemented

Nothing in scope was deferred. Two items were explicitly flagged **upstream for
the workbook author** rather than fixed in this story (the "no re-extraction"
boundary):

- The `"SImulationRestarted"` typo in the `45.ts` (workbook-derived) terminator
  set. The impl works around it by keying on canonical `translate.ts` event names.
- The pedagogical tension between tab 45 Cat 4 (satisfiable across trials) and
  Cat 3's same-run coaching cue ("Add both a Fireline and a Helitack *while the
  model is running*"). Accepted as intended sheet semantics for this story.

## Decisions

### Do helitacks in a `SimulationStopped` run count the same as in a `SimulationEnded` run?
**Context**: A run can terminate several ways; R1 treats them as run terminators,
so a helitack dropped before any terminator counts.
**Options considered**:
- A) Both terminators are equivalent: any helitack between `SimulationStarted` and
  the next run-end event counts.
- B) Only helitacks in runs that end via `SimulationEnded` count.
- C) Other distinction.

**Decision**: A, with a correction to the terminator set. The `45.ts` `details`
are authoritative: the event must occur "after a simulation started but before it
ended," and `ranSimulation` declares its run-end events as `SimulationStopped`,
`SimulationRestarted`, `SimulationReloaded`, `TopBarReloadButtonClicked`, and
`SimulationEnded`. How a run ends carries no distinction. R1/R2 name the full
terminator set; three of those five are translate no-ops the chosen mechanism must
still treat as window-closers.

---

### What is the acceptance bar for "re-validate tabs 45/47/54"?
**Context**: WM-18 deferred the full Playwright walk and relied on Jest per-category
coverage. WM-28 explicitly owns the helitack-dependent walk; the choice affects the
size of the story.
**Options considered**:
- A) Jest per-category coverage only (WM-18 R9 pattern), plus docs.
- B) Full Playwright MCP walk in addition to Jest.
- C) Both, with the Playwright walk as the primary acceptance evidence.

**Decision**: C. Both are required. Jest per-category coverage for the now-reachable
helitack categories/arms, plus a Playwright MCP walk of tabs 45/47/54; the walk is
the primary acceptance evidence, with helitack drops via
`window.test.placeHelitackInZone`.

---

### Which docs must be updated as part of this story?
**Context**: R9 names `localhost-urls.md`; other docs carry helitack stub language
that goes stale once the impl lands.
**Options considered**:
- A) Only `docs/hazbot-validation/localhost-urls.md`.
- B) Also `src/hazbot/TBD.md` §2 and the WM-18 spec's "Not Yet Implemented" note.
- C) All of B, plus regenerate the per-tab playbooks.

**Decision**: C. Update `localhost-urls.md`, `TBD.md` §2, and the WM-18 note;
regenerate the playbooks and commit any diff (the regen produced no diff because
the rule-set expressions are untouched).

---

### Pedagogical meaning of "helitack used" — any drop vs. an effective drop
**Context**: R1–R4 attribute a helitack on the basis of the event's occurrence
alone, regardless of where it lands. For the "Great job! You used both tools"
feedback to mean what it implies, the intent of crediting *any* drop should be
explicit.
**Options considered**:
- A) Any drop counts, matching `usedFireline`; effectiveness is not measured.
- B) Only an effective drop (near/affecting the fire) counts.

**Decision**: A. Attribution is by drop occurrence within the run window regardless
of placement/effectiveness (the `{x, y, elevation}` payload is not inspected),
mirroring `usedFireline`. Effectiveness is intentionally not measured.

---

### Cross-trial satisfaction of tab 45 Cat 4 vs. the same-run instructional cue
**Context**: Tab 45 Cat 4 can fire with fireline in one trial and helitack in
another, because each binds its own `WITH` reading. This sits in tension with Cat
3's coaching text implying concurrent same-run use.
**Options considered**:
- A) Accept the cross-trial reward as intended sheet semantics (given the "no
  workbook change" boundary) and document the tension.
- B) Restrict Cat 4 to same-run use (would require changing the workbook).

**Decision**: A. The cross-trial allowance is intended sheet semantics, accepted
as-is; the tension is flagged upstream for the workbook author and not resolved
here. R6/R8 require exercising both same-run and across-runs paths.

---

### Confirm the substrate mechanism — translate `modifier` result kind vs. overlap-guard rework
**Context**: The requirements deferred this engine-mechanism choice to the
implementation spec. An in-run helitack must attach to its run's witness reading,
but the naive temporal-variable path collides with the trigger-state-change-overlap
construction guard.
**Options considered**:
- A) Add a translate `modifier` result kind: a third substrate result that mutates
  the current last reading in place without pushing a new one. No guard change;
  cross-run non-stickiness automatic; surgical surface mirroring
  `Fireline`/`usedFireline`.
- B) Rework the overlap guard to permit a `helitackUsed` temporal variable
  accepting `Helitack`. Reuses temporal machinery but weakens a load-bearing
  construction invariant for all rule sets and needs the eventName-filter trick for
  cross-run non-stickiness.

**Decision**: A. Verified empirically: Option B cannot satisfy R7's
no-op-terminator exclusion even with a perfect guard rework (a temporal variable
appends to `lastReading` unconditionally, and `lastReading` stays the prior
run-start across a no-op terminator). Only `translate` can decline the append based
on run-window state. The `modifier` design passed the full requirement matrix and
is purely additive (the overlap guard is untouched for every other rule set).

---

### Helitack state representation on the reading — dedicated field vs. temporalHistory entry
**Context**: Given mechanism A, the in-run flag can live as a dedicated
`reading.helitack` boolean or as a `temporalHistory` entry read with the
`GraphOpen` `.some(...)` idiom.
**Options considered**:
- A) Dedicated `helitack` field (mirrors how `Fireline` reads `fireLineMarkers`).
- B) `temporalHistory` entry.

**Decision**: A. Routing helitack through `temporalHistory` forces an *undeclared*
read (a sim-prop declaring `temporalReads: ["helitack"]` with no backing temporal
variable raises a `temporal-validation` construction error), and still needs a
`runWindowClosed` control field anyway. A keeps both flags as plain reading fields
(`helitack?: boolean`, `runWindowClosed?: boolean`), mirrors `Fireline` exactly,
and declares nothing spurious.

---

### Modifier substrate API shape — closure `apply(lastReading)` vs. data-driven descriptor
**Context**: The new substrate result kind can carry a closure the engine invokes
or a data descriptor the engine interprets.
**Options considered**:
- A) Closure `apply: (lastReading) => boolean`. Keeps all run-window semantics in
  the wildfire bridge; the engine stays generic. Returns a `mutated` boolean to
  preserve single-notify-iff-mutated.
- B) Data-driven `{ field, value }` descriptor.

**Decision**: A. A pure data-driven descriptor leaks on the no-op-terminator case:
`translate`'s signature has no access to the readings, so it cannot pre-condition
the descriptor on run-window state, and the engine must apply it unconditionally.
The closure receives `lastReading` at apply time and excludes the case correctly.
Final substrate type:
`{ kind: "modifier"; apply: (lastReading: TReading | undefined) => boolean }`, with
the `consume` case `if (result.apply(lastReading)) mutated = true;`.

---

### Step granularity
**Context**: The plan is 7 discrete commits (substrate kind / bridge modifiers /
impls+stub-removal / integration tests / R10 helper / docs / Playwright).
**Options considered**:
- A) Keep 7 steps.
- B) Merge the impls step with integration tests, and/or R10 with docs.
- C) Other split.

**Decision**: A. Each maps to a distinct concern/reviewer lens and stays well under
~500 lines; the two small steps (substrate kind, R10 helper) earn isolation as a
generic engine capability and a test-infra change.

---

### Test-suite coupling: stub removal and the translate change turn existing tests red
**Context**: Removing the stubs and emitting modifiers from the three no-op
terminators breaks tests that pinned the prior state.
**Options considered** (resolved during implementation-spec self-review):
- Augment the existing assertions vs. replace them.

**Decision**: Replace, not augment. `rule-sets/index.test.ts`'s
`expectedStubWarnings` for 45/47/54 go to `[]`; the `sim-props.test.ts` /
`factor-variables.test.ts` `isStub` assertions are replaced by behavioral
assertions; and the bundled `translate.test.ts` no-op assertion is split (the three
terminators → `modifier`, only `AnalysisEngineActivated` stays `no-op`). Verified
empirically: stripping only the `isStub` flags fails exactly 5 tests; the full
prototype fails 6 (the 6th being the translate assertion).

---

### Test surfaces: per-category reachability vs. substrate exclusions
**Context**: R6 reachability and the R2 substrate exclusions need different
harnesses.
**Decision**: Two surfaces. (1) Per-category reachability extends the existing
`rule-sets/{45,47,54}.test.ts` via `matchAgainst` → `computeMatchedCategoryFloor`
over directly-constructed `{ helitack: true }` readings (no `consume`). (2) The R2
exclusions, the three no-op terminators, and cross-run non-stickiness live in a new
event-driven `src/hazbot/wildfire/helitack-run-window.test.ts` that feeds event
sequences through `engine.consume`. Under the modifier mechanism a post-terminator
helitack lands nowhere (the modifier declines), so the test asserts the run-start
witness's `helitack` stays unset rather than asserting it landed on the terminating
reading.

---

### Acceptance-evidence durability (resolved during requirements self-review)
**Context**: R8 designates the Playwright walk as primary acceptance evidence, but
its screenshots live under the gitignored `tmp/playwright/`.
**Decision**: The durable record is a short per-tab summary in the PR description
(categories exercised + observed active category); screenshots are optional and
illustrative. Recorded walk outcome:
- **Tab 45**: Cat 1 (no run); Cat 3 (default run, no tools); Cat 4 same-run
  (fireline+helitack one run); Cat 4 across-runs (fireline run 1, helitack run 2);
  Cat 3 no longer over-matches.
- **Tab 47**: Cat 1; Cat 3 (clean default run); Cat 4 (helitack-only, no prior
  clean baseline); Cat 5 (clean baseline + helitack run); Cat 3 no longer
  over-matches.
- **Tab 54** (Severe Drought set): Cat 1; Cat 3 (severe-drought run, no tools);
  Cat 4 (helitack-only severe-drought run, helitack arm under
  `DefaultVegetations AND SevereDroughts`); Cat 3 no longer over-matches.

---

### Implementation finding: `placeHelitackInZone` import broke an unrelated test's mock ordering
**Context**: The R10 top-level `import { log } from "../log"` in `stores.ts` made
`app.test.tsx`'s `import { createStores }` pull in `log.ts` at module load, whose
top-level `getUrlConfig()` fired before the test's `mockUrlConfig` const was
initialized (jest hoists `jest.mock` above the imports but not the const).
**Decision**: Fix the test, not the production import. The config mock's
`getUrlConfig` now falls back to a safe default until `mockUrlConfig` exists. This
was an unanticipated test-ordering coupling, not a logic change, and was recorded
in the implementation spec's Phase-5 Files-affected.
