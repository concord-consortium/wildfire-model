# Hazbot: Helitack Run-Window Detection

**Jira**: https://concord-consortium.atlassian.net/browse/WM-28
**Repo**: https://github.com/concord-consortium/wildfire-model
**Implementation Spec**: [implementation.md](implementation.md)
**Status**: **In Development**

## Overview

<!-- Rewritten during Finalization. -->
Teach the Hazbot engine to recognize when a student dropped a helitack during a
simulation run, so the rule-sets that reward or classify helitack use (tabs 45,
47, 54) classify correctly instead of treating every helitack as if it never
happened.

## Project Owner Overview

<!-- Rewritten during Finalization. -->
The Hazbot watches what a student does in the Wildfire model and classifies the
behavior into pedagogical categories that (in a later story) drive help and
feedback. Three of the extracted feedback tables reward students for using the
helitack tool, but the engine is currently blind to helitack drops: it silently
ignores them. As a result, the "you used a helitack" categories can never fire,
and a few neighboring categories misclassify helitack runs. This misclassification
is currently latent: the category is read only by the dev sidebar, not yet logged
or surfaced to students, so no student sees wrong feedback today. This story fixes
the classification ahead of the feedback UI that will consume it: it makes the
engine see in-run helitacks, removes the temporary stubs left in place by WM-18,
and re-validates that tabs 45/47/54 classify helitack behavior correctly.

## Background

WM-18 re-extracted the Hazbot rule-set sheets from the "Wildfire Hazbot Feedback
Tables" workbook. Tabs 45, 47, and 54 reference a `Helitack` sim-prop, and tab
45 references a `usedHelitack` factor variable. WM-18 shipped both as stubs
(`isStub: true`, returning `false`) so those tabs still load, and spun the real
implementation out into this ticket.

What makes helitack detection non-trivial (distinct from the sibling `Fireline`
/ `usedFireline` impls):

- **The event is already emitted but dropped.** The app already logs a
  `Helitack` event on every drop (`src/components/view-3d/use-helitack-interaction.ts:18`),
  but `src/hazbot/wildfire/translate.ts` has no `Helitack` case, so the engine
  treats it as a no-op: no reading, no state change.
- **It is a mid-run action.** A helitack only counts if it happens after a
  `SimulationStarted` and before that run's terminating event. A helitack
  outside a run does not count. By contrast, a fire line is snapshotted into the
  next `SimulationStarted` reading because *activating the Fireline tool* stops
  the run (`handleFireLine` calls `simulation.stop()`,
  `src/components/bottom-bar.tsx:289`; the marker-draw itself,
  `simulation.addFireLineMarker`, does not stop the sim), so the markers are
  placed while stopped and captured at the next Start. Activating the Helitack
  tool (`handleHelitack`, `src/components/bottom-bar.tsx:299`) does not stop the
  sim, so there is no equivalent snapshot and the drop lands mid-run.
- **A `WITH`-bound sim-prop is evaluated per run-start reading.** Under
  `ranSimulation WITH Helitack`, the evaluator runs the `Helitack` sim-prop
  against *each* `SimulationStarted` witness reading and the clause matches if
  *any* one of them holds an in-run helitack (`evaluateWith`,
  `src/hazbot/engine/evaluator.ts:132`). So "a helitack happened during this run"
  must be attached to that run's own `SimulationStarted` reading (each run carries
  its own witness; the per-run flag does not aggregate across runs at the
  sim-prop level). The existing mechanism for attaching post-trigger information
  to a reading is the temporal-variable to `temporalHistory` path (the same
  machinery `chartTabOpen` / `GraphOpen` use: see
  `src/hazbot/wildfire/temporal-variables.ts` and `sim-props.ts:85`), and a
  within-run append lands on the run's start reading because that is the engine's
  current last reading while the run is active (`engine.ts:417`). (Note: the WITH
  binding does not use `engine.latestRunStartReading`; that accessor is the
  fallback witness for non-WITH sim-prop evaluation and the sidebar.)
- **The naive temporal-variable approach collides with a construction guard.**
  The 2026-05-22 sheet declares `Helitack` as a log-event of the `usedHelitack`
  factor variable. The engine's "trigger-state-change-overlap" guard
  (`src/hazbot/engine/engine.ts:321`) throws `EngineConstructionError` (a hard
  load failure) if a temporal variable's `acceptedEvents` overlap a factor
  variable's `logEvents`. A `helitackUsed` temporal variable accepting the
  `Helitack` event would trip this guard.

Net: this requires an engine-substrate change, not just wildfire-bridge code.
The two candidate mechanisms (rework the overlap guard vs. add a translate
"modifier" result kind) are an implementation decision and are deferred to the
implementation spec, not resolved here.

## Requirements

<!-- Updated as Open Questions are resolved. -->

- **R1: Detect in-run helitacks.** The engine must recognize a `Helitack` event
  that occurs after a `SimulationStarted` and before that run's terminating
  event as an in-run helitack attributable to that run. Per the sheet
  (`45.ts:62-63`, `ranSimulation`), a run ends via any of its run-end lifecycle
  events: `SimulationStopped`, `SimulationRestarted`, `SimulationReloaded`,
  `TopBarReloadButtonClicked`, or `SimulationEnded`. How a run terminates does
  not matter; any helitack before the run's terminator counts equally. A helitack
  during a run that has started but not yet terminated counts as in-run
  immediately: a terminating event is not required for the helitack to be
  attributed to the run. Attribution is by drop *occurrence* within the run
  window, regardless of where the helitack lands or whether it affects the fire:
  the `Helitack` event's `{x, y, elevation}` payload is not inspected. This
  intentionally mirrors `usedFireline` (any run with >= 2 markers), which
  measures tool *use*, not effectiveness; helitack effectiveness is out of scope
  to measure here (see the sheet `details` for `usedHelitack`, which test only
  occurrence during a run).
- **R2: Exclude out-of-run helitacks.** A `Helitack` event that occurs before
  any run, or after a run has terminated and before the next run starts, must
  not be attributed to any run.
- **R3: `Helitack` sim-prop (per-run).** Implement the `Helitack` sim-prop so
  that, bound by `WITH` to a run's witness reading, it evaluates `true` iff that
  run contained an in-run helitack (R1).
- **R4: `usedHelitack` factor variable (cross-run).** Implement the
  `usedHelitack` factor variable so it evaluates `true` iff at least one run in
  the session contained an in-run helitack, mirroring the `usedFireline`
  aggregation pattern.
- **R5: Remove the WM-18 stubs.** Remove the `isStub: true` stubs for `Helitack`
  (`src/hazbot/wildfire/sim-props.ts`) and `usedHelitack`
  (`src/hazbot/wildfire/factor-variable-stubs.ts`) so the load no longer emits a
  `stub-warning` for them.
- **R6: Rule-sets 45/47/54 load and classify correctly.** With the impls in
  place, tabs 45/47/54 must load without an `EngineConstructionError`, and the
  previously stub-gated / stub-degraded categories must classify correctly:
  - Tab 45 Cat 4 (helitack success) becomes reachable. It may be satisfied
    either within a single trial (fireline + helitack in the same run) or across
    multiple trials (fireline in one run, helitack in another), because
    `Fireline` and `Helitack` each bind to their own `WITH` reading (per the
    studentAction: "in a single or multiple trials"). The cross-trial allowance
    is intended sheet semantics and accepted as-is for this story (the workbook
    is out of scope to change). Note the pedagogical tension: Cat 3's coaching
    text says "Add both a Fireline and a Helitack *while the model is running*"
    (implying same-run use), yet Cat 4 can fire from tool use split across
    trials. Flag this upstream for the workbook author; do not resolve it here.
  - Tab 45 Cat 3 (`NOT (usedFireline AND usedHelitack)`) stops over-matching
    fireline+helitack runs.
  - Tab 47 Cat 3 (`ranSimulation WITH DefaultVars AND NOT (Fireline OR
    Helitack)`) stops over-matching helitack-only runs; Cat 4 and Cat 5 (the
    `... AND (Fireline OR Helitack)` arms) become reachable. The helitack arm is
    gated on `DefaultVars` (default vegetation, drought, and wind). Cat 4 and
    Cat 5 are mutually exclusive and require different histories: Cat 5
    (`X AND Y`) fires only when a clean-baseline run `X` = `ranSimulation WITH
    DefaultVars AND NOT (Fireline OR Helitack)` also exists, while Cat 4
    (`NOT X AND Y`) fires precisely when that baseline run is absent. They are
    also pedagogically distinct: Cat 4 is a corrective nudge ("Did you try
    running the model without firelines and helitacks...?"), and only Cat 5 is
    the "Great job!" celebration. Coverage must reach both via their distinct
    histories, not treat "the helitack arm" as a single target.
  - Tab 54 Cat 3 (`ranSimulation WITH DefaultVegetations AND SevereDroughts AND
    NOT (Fireline OR Helitack)`) stops over-matching helitack-only runs; Cat 4
    (`... AND (Fireline OR Helitack)`) becomes reachable. Tab 54 has no Cat 5.
    Its helitack arm is gated on `DefaultVegetations AND SevereDroughts`, so
    reaching it requires Severe Drought (not the `DefaultVars` precondition of
    tab 47).
- **R7: Unit tests.** Add unit tests for the engine-substrate change, the
  `Helitack` sim-prop, and the `usedHelitack` factor variable, following the
  existing `*.test.ts` co-located conventions. Per-ruleset coverage for the
  now-reachable categories follows the WM-18 R9 pattern. Include negative-path
  tests: a pre-run helitack and a between-runs helitack are both excluded (R2),
  and a helitack in one run does not leak into a subsequent run's classification
  (cross-run non-stickiness). The between-runs coverage must include the
  no-op-terminator case explicitly: a helitack after a `SimulationRestarted`,
  `SimulationReloaded`, or `TopBarReloadButtonClicked` (none of which push a
  terminating reading, so the prior run-start reading remains the engine's last
  reading: `translate.ts:44-48`, `engine.ts:417`) and before the next
  `SimulationStarted` must be excluded from the prior run, not just the easier
  `SimulationEnded` / `SimulationStopped` gap (which does push a terminating
  reading). This Jest case is the **authoritative** guard for the no-op-terminator
  exclusion: pre-impl verification confirmed the leak is real at the substrate
  level but not reproducible through the live UI (every no-op terminator is
  preceded by a reading-pushing `SimulationEnded`; see the Pre-Implementation
  Verification note), so the R8 Playwright walk cannot cover it. Removing the
  stubs changes shared sub-expressions
  (`NOT (Fireline OR Helitack)`, `NOT (usedFireline AND usedHelitack)`), so
  retain / re-run the existing WM-18 per-category coverage for 45/47/54 as
  regression coverage: the non-helitack categories (tab 45 Cat 1/2, tab 47/54
  Cat 1/2, and the no-tool default arms) must still classify as before.
- **R8: Re-validation (Playwright, primary acceptance evidence).** Walk the tab
  45/47/54 playbooks against a running dev server via Playwright MCP, driving
  helitack drops with `window.test.placeHelitackInZone` (per CLAUDE.md, and per
  R10, which makes that helper emit the engine-visible `Helitack` event the walk
  depends on). Confirm
  the now-reachable categories / arms classify correctly: tab 45 Cat 4 fires on a
  fireline+helitack run, tab 45 Cat 3 no longer over-matches, and the tab 47/54
  helitack arms / Cat 3 classify correctly. Exercise both the same-run and the
  across-runs paths to tab 45 Cat 4. For tab 47, exercise both helitack-arm
  endpoints via their distinct histories: Cat 4 (a tool run with no prior
  clean-baseline run) and Cat 5 (a tool run plus a clean-baseline run); they are
  mutually exclusive, so a single history reaches only one. Note the per-tab precondition difference:
  tab 47's helitack arm needs `DefaultVars`, while tab 54's needs
  `DefaultVegetations AND SevereDroughts` — so the tab 54 walk must set Severe
  Drought (do not pass `severeDroughtAvailable=false` for that tab). Also spot-
  check at least one non-helitack category per tab (e.g. Cat 1/2) to confirm the
  stub removal did not regress the already-correct classifications. The walk's
  between-runs exclusion exercises only the `SimulationEnded` / `SimulationStopped`
  gap; the no-op-terminator exclusion is not UI-reachable (see the
  Pre-Implementation Verification note) and is covered by R7 Jest only — do not
  attempt to construct it in the walk. Because the
  Playwright screenshots live under the gitignored `tmp/playwright/`, the durable
  acceptance record is a short per-tab summary in the PR description (categories
  exercised and the observed active category for each); screenshots are optional
  and illustrative only.
- **R9: Docs update.** Update `docs/hazbot-validation/localhost-urls.md`
  (stub-effects table and validation status), `src/hazbot/TBD.md` §2 (mark the
  Helitack / usedHelitack stub entry resolved), and the WM-18 spec's "Not Yet
  Implemented" note. Update the `window.test.placeHelitackInZone` description in
  `CLAUDE.md` to record that the helper now emits the `Helitack` event (per R10).
  Regenerate the per-tab playbooks via
  `node scripts/generate-hazbot-validation-playbook.js` and commit any diff
  (note explicitly if the regeneration produces no diff because the rule-set
  expressions are untouched).
- **R10: `placeHelitackInZone` must emit the `Helitack` event.** The
  `window.test.placeHelitackInZone` helper (`src/models/stores.ts:75-78`)
  currently calls only `simulation.setHelitackPoint(...)`, which mutates cells and
  the cooldown timestamp but emits no log; only `log(...)` routes an event to
  `engine.consume(...)` (`src/log.ts:23-24`). Update the helper to also emit the
  production `Helitack` log payload — normalized `{x, y}` plus `cell.elevation`,
  matching the pointer path at `src/components/view-3d/use-helitack-interaction.ts:18`
  — after applying the drop. Without this, the R8 Playwright walk shows a helitack
  on screen while the engine never receives the event, so it cannot validate
  run-window detection. The sibling helpers `placeSparkInZone` /
  `placeFireLineInZone` need no equivalent change: spark / fireline classification
  derives from the `SimulationStarted` snapshot of sim state, so mutating the sim
  is sufficient for them (see Technical Notes).

## Technical Notes

- **Helitack event already flows in.** `log("Helitack", {...})` fires at
  `src/components/view-3d/use-helitack-interaction.ts:18`, reaching the engine
  via `log.ts` to `engine.consume()`. No app-side emission change is expected;
  the engine simply needs to stop dropping the event.
- **Test-helper logging asymmetry (drives R10).** The `window.test.*` placement
  helpers (`stores.ts:62-81`) all mutate the sim directly — none of `addSpark`,
  `addFireLineMarker`, `setHelitackPoint` logs internally (logging lives in the
  UI interaction layer). For sparks and fire lines that is enough: their
  classification reads the `SimulationStarted` snapshot of sim state, not a
  per-action event, so a mutated sim is captured at the next Start. Helitack is
  the lone event-based case — detection hinges on the `Helitack` event reaching
  `engine.consume()` (`log.ts:23-24`), which the mutate-only `placeHelitackInZone`
  never produces. R10 closes this gap by having the helper emit the production
  payload; it is helitack-specific by design, not an oversight to generalize to
  the other helpers.
- **Not all run terminators currently produce readings.** Of the five run-end
  events (R1), only `SimulationEnded` / `SimulationStopped` are translate
  triggers that push a reading (`translate.ts:42`); `SimulationRestarted`,
  `SimulationReloaded`, and `TopBarReloadButtonClicked` are translate no-ops
  (`translate.ts:44-48`). The chosen mechanism must still close the run window on
  these three (a helitack after a Restart / Reload but before the next Start must
  not attach to the prior run). **Confirmed (pre-impl verification, 2026-06-03):**
  in the current UI a no-op terminator is never the *first* terminator after a
  run-start. The bottom-bar Restart / Reload handlers log a reading-pushing
  `SimulationEnded` guarded on `simulation.simulationStarted`
  (`bottom-bar.tsx:257-263, 272-278`), and that flag is true exactly while a
  run-start reading is the engine's last reading; the top-bar reload logs
  `SimulationEnded` *unconditionally* and then full-page-reloads
  (`top-bar.tsx:19-28`). So a terminating reading is always pushed before the
  no-op terminator fires (live-verified: Start → Readings(1), Restart →
  Readings(2), the +1 being `SimulationEnded`; the no-op `SimulationRestarted`
  adds no reading). The substrate leak is therefore **real but not UI-reachable
  today** — it depends on the `simulationStarted` guard and handler ordering, both
  app-side and changeable. The chosen mechanism must still close the window
  defensively, but the authoritative validation is the R7 Jest negative test, not
  the R8 Playwright walk (see the Pre-Implementation Verification note below).
- **Run-window scoping via the reading machinery (relevant if the
  temporal-variable mechanism is chosen).** A `temporalHistory` append from an
  event lands on the current `lastReading`. So an in-run helitack appends to the
  run-start reading (the `lastReading` while a run is active), while a
  between-runs helitack appends to a terminating reading. Filtering by
  `eventName === "Helitack"` excludes the R5a seed entry (whose `eventName` is
  the trigger), which also avoids cross-run stickiness without an explicit
  per-run reset. This argument holds only for terminators that produce readings;
  see the note above about the three no-op terminators.
- **Reference impls.** `usedFireline` (`factor-variables.ts:183`) and `Fireline`
  (`sim-props.ts:201`) are the closest sibling impls. `GraphOpen`
  (`sim-props.ts:85`) shows the `temporalReads` + `temporalHistory.some(...)`
  read pattern. `chartTabOpen` (`temporal-variables.ts:16`) shows the temporal
  variable shape.
- **The overlap guard.** `engine.ts:321-353` scans declared temporal variables'
  `acceptedEvents` against `ruleSet.factorVariables[].logEvents` (scoped to
  factor-variable names that have a real impl) and pushes a
  `trigger-state-change-overlap` construction error, which becomes an
  `EngineConstructionError` hard load failure.
- **Run-lifecycle events.** `SimulationStarted` (trigger), `SimulationEnded` /
  `SimulationStopped` (triggers), and `SimulationRestarted` /
  `SimulationReloaded` / `TopBarReloadButtonClicked` / `AnalysisEngineActivated`
  (no-ops). See `translate.ts:15-50`.
- **Sheet typo in the terminator set — use canonical event names, not the sheet
  string.** The authoritative source cited by R1 (`45.ts:62`, `ranSimulation`'s
  `logEvents`) misspells one terminator as `"SImulationRestarted"` (capital
  second `I`), which does not match the real event `SimulationRestarted` handled
  in `translate.ts:46`. R1's prose spells it correctly. The impl must key
  run-window closing off the canonical event names in `translate.ts`, treating
  the sheet `logEvents` strings as descriptive metadata only — otherwise a
  terminator derived verbatim from the sheet would never fire, leaving the run
  window open across a Restart and silently violating R2. Fixing the workbook
  typo is out of scope here (the "no re-extraction" boundary); flag it upstream.
- **Pre-Implementation Verification (2026-06-03).** Four load-bearing assumptions
  were verified empirically before drafting the implementation spec — two via
  throwaway Jest against the real `Engine`, two via code trace plus a live
  Playwright spot-check. All four held; none changes R1–R10, but two refine how
  the no-op-terminator case is validated (R7/R8) and confirm the substrate the
  mechanism decision rests on.
  - **(1) Overlap guard fires.** A temporal variable accepting `Helitack`
    alongside a `usedHelitack` factor variable whose `logEvents` include
    `Helitack` throws `EngineConstructionError`
    (`trigger-state-change-overlap`). The naive temporal-variable path is
    genuinely blocked — Background bullet 4 holds, and the mechanism decision
    (overlap-guard rework vs. translate "modifier" result kind) is a real choice.
  - **(2) Append location across run boundaries.** Feeding synthetic events to
    `engine.consume` confirmed: an in-run `Helitack` appends to the run-start
    reading stamped `eventName: "Helitack"` (R1); a `Helitack` after a
    reading-pushing terminator (`SimulationStopped` / `SimulationEnded`) lands on
    the *terminating* reading, not the prior run-start (R2); and a `Helitack`
    after a *no-op* terminator leaks onto the prior run-start reading at the
    substrate level (the R2 hazard is real). (This append-location behavior is
    what the *temporal-history* substrate does; the implementation chose the
    translate-modifier mechanism instead, under which a post-terminator helitack
    lands nowhere — the modifier declines rather than appending. Either way R2
    holds: it is excluded from the run-start witness. See implementation.md.) Cross-run non-stickiness works only
    because the read pattern filters `eventName === "Helitack"`: the next run's
    R5a seed carries `value: true` (the global temporal value stays true) but
    `eventName: "SimulationStarted"`, so a `value`-only read would wrongly count
    it. **Implication:** the read pattern must key on `eventName`, never on the
    bare temporal value.
  - **(3) No-op terminators in practice.** Resolved the open question in the
    "Not all run terminators currently produce readings" note above: the
    substrate leak from (2) is not UI-reachable today because every no-op
    terminator is preceded by a reading-pushing `SimulationEnded`. The chosen
    mechanism must still close the window defensively, but the R7 Jest negative
    test is the authoritative guard — the R8 Playwright walk cannot reproduce the
    leak.
  - **(4) `placeHelitackInZone` emits no event (R10 premise).** Confirmed in code:
    the helper calls only `simulation.setHelitackPoint(...)` (`stores.ts:75-78`),
    no `log(...)`, so no `Helitack` event reaches `engine.consume`. The production
    pointer path logs `Helitack` with `{ x: x / modelWidth, y: y / modelHeight,
    elevation: cell.elevation }` (`use-helitack-interaction.ts:18`) — matching
    R10's stated emit shape exactly.

## Out of Scope

- The engine-mechanism decision itself (rework the overlap guard vs. add a
  translate "modifier" result kind) is an implementation-spec decision, not a
  requirement.
- The student-facing Hazbot UI (launcher, feedback panel, coach-marks).
- `SparksAtTopAndBottom` (WM-15) and any other stubbed impl.
- Any change to the source workbook or re-extraction of rule-set expressions;
  the 45/47/54 expressions are unchanged by this work.
- App-side changes to how / when the `Helitack` event is emitted on the
  production pointer path (`use-helitack-interaction.ts`). R10's emit is confined
  to the `window.test.placeHelitackInZone` test hook and does not alter
  production emission.
- Per repo convention, accessibility (WCAG / keyboard / screen-reader) concerns
  are not in scope for this engine work.

## Open Questions

<!-- Requirements-focused only. Implementation/mechanism questions go in implementation.md. -->

### RESOLVED: Do helitacks in a `SimulationStopped` run count the same as in a `SimulationEnded` run?
**Context**: A run can terminate several ways. R1 treats them as run
terminators, so a helitack dropped before any terminator counts.
**Options considered**:
- A) Both terminators are equivalent: any helitack between `SimulationStarted`
  and the next run-end event counts.
- B) Only helitacks in runs that end via `SimulationEnded` count; helitacks in a
  stopped run do not.
- C) Other distinction.

**Decision**: A, with a correction to the terminator set. The `45.ts` sheet
`details` are authoritative: the `Helitack` / `usedHelitack` definitions require
the event to occur "after a simulation started but before it ended (see
`ranSimulation` above)," and `ranSimulation` declares its run-end events as
`SimulationStopped`, `SimulationRestarted`, `SimulationReloaded`,
`TopBarReloadButtonClicked`, and `SimulationEnded`. How a run ends carries no
distinction: any helitack between a start and the next run-end event counts. R1
and R2 updated to name the full terminator set; Technical Notes updated to flag
that three of those five terminators are currently translate no-ops that the
chosen mechanism must still treat as window-closers.

### RESOLVED: What is the acceptance bar for "re-validate tabs 45/47/54"?
**Context**: WM-18 deferred the full Playwright playbook walk and relied on Jest
per-category coverage (R9) for reachable categories, while noting a later
independent Playwright walk of all 11 rulesets matched the Jest coverage. WM-28
explicitly owns the helitack-dependent walk. The choice affects the size of this
story.
**Options considered**:
- A) Jest per-category unit coverage for the now-reachable helitack categories /
  arms (45 Cat 3/4, 47 Cat 3/4/5 helitack arm, 54 Cat 3/4 helitack arm),
  matching the WM-18 R9 pattern, plus updating the docs. No live Playwright walk
  required.
- B) Full Playwright MCP playbook walk of tabs 45/47/54 against a running dev
  server, in addition to Jest coverage.
- C) Both Jest coverage and a Playwright walk, with the Playwright walk treated
  as the primary acceptance evidence.

**Decision**: C. Both are required. Jest per-category coverage (WM-18 R9 pattern)
for the now-reachable helitack categories / arms, plus a Playwright MCP playbook
walk of tabs 45/47/54 against a running dev server. The Playwright walk is the
primary acceptance evidence; the helitack drops use `window.test.placeHelitackInZone`
per the CLAUDE.md test-helper conventions. R7 and R8 updated.

### RESOLVED: Which docs must be updated as part of this story?
**Context**: R9 names `docs/hazbot-validation/localhost-urls.md`. Other
candidates carry helitack stub language that will be stale once the impl lands.
**Options considered**:
- A) Only `docs/hazbot-validation/localhost-urls.md` (stub-effects table +
  validation status).
- B) Also update `src/hazbot/TBD.md` §2 (remove the Helitack stub entry / mark
  resolved) and the WM-18 spec's "Not Yet Implemented" note.
- C) All of B, plus regenerate the per-tab playbooks
  (`docs/hazbot-validation/45.md`, `47.md`, `54.md`) if their content references
  the stub state. (Note: rule-set expressions are unchanged, so regeneration may
  be a no-op.)

**Decision**: C. Update `docs/hazbot-validation/localhost-urls.md` (stub-effects
table + validation status), `src/hazbot/TBD.md` §2 (mark the Helitack /
usedHelitack stub entry resolved), and the WM-18 spec's "Not Yet Implemented"
note. Regenerate the per-tab playbooks via
`node scripts/generate-hazbot-validation-playbook.js` and commit any diff (if the
generator output is unchanged because the rule-set expressions are untouched,
note that no playbook diff was produced). R9 updated.

## Self-Review

### Senior Engineer

#### RESOLVED: An in-progress run (no terminator yet) is not explicitly covered
**Resolution**: R1 amended to state that a helitack during a started-but-not-yet-
terminated run counts as in-run immediately, with no terminator required.

R1 defines an in-run helitack as one occurring "after a `SimulationStarted` and
before that run's terminating event." A run that is still active (the student
dropped a helitack and the run has not yet ended, stopped, restarted, or
reloaded) has no terminating event yet. The intent is that such a helitack still
counts (it happened during an active run), but the wording could be read as
requiring a terminator to exist. This matters for both the `Helitack` sim-prop
(R3) and a Playwright walk that checks classification mid-run before the fire
burns out. Suggested resolution: add a clause to R1/R2 stating that a helitack
during an active run with no terminator yet counts as in-run.

---

#### RESOLVED: Tab 45 Cat 4's two `WITH` clauses can be satisfied by different runs
**Resolution**: R6 Cat 4 bullet now states the cross-trial behavior; R8 now
requires exercising both the same-run and across-runs paths to Cat 4.

Tab 45 Cat 4 is `ranSimulation WITH DefaultVars AND Fireline AND ranSimulation
WITH DefaultVars AND Helitack`. Because `Fireline` and `Helitack` are each bound
to their own `WITH` reading, the category can fire when fireline was used in one
trial and helitack in a different trial (the studentAction explicitly says "in a
single or multiple trials"). R6 says Cat 4 "becomes reachable" but does not state
this cross-trial behavior, so a test or playbook step could wrongly assume both
tools must be used in the same run. Suggested resolution: note in R6 (or R8) that
Cat 4 may be satisfied across multiple trials, and ensure the Jest / Playwright
coverage exercises both the same-run and across-runs paths.

---

### QA Engineer

#### RESOLVED: R7 does not call out the negative / exclusion test cases
**Resolution**: R7 now requires negative-path tests for the R2 exclusions and
cross-run non-stickiness.

R7 lists tests for the substrate change, sim-prop, and factor variable, but the
hardest-to-get-right behavior is exclusion (R2): an out-of-run helitack (before
the first run, or between runs) must not count, and a helitack in run A must not
leak into run B (cross-run non-stickiness). These negative cases are exactly
where a temporal-variable or modifier impl can silently misbehave. Suggested
resolution: extend R7 to explicitly require negative-path unit tests for the R2
exclusions and cross-run non-stickiness.

---

### Product Manager

#### RESOLVED: Project Owner Overview overstates current student impact
**Resolution**: Project Owner Overview reworded so the misclassification is
described as latent (no current student-facing consumer), with the fix framed as
forward-looking correctness ahead of the feedback UI.

The Project Owner Overview says neighboring categories "misclassify students who
used a helitack." Per WM-18's Technical Notes, the classified category currently
has no live consumer: it is read only by the dev sidebar, not logged, persisted,
or surfaced to students, so there is no present student-facing or research-data
harm. The real value is forward-looking correctness before the feedback UI ships.
Suggested resolution: soften the Overview to make clear the misclassification is
latent (no current student-facing consumer) and the fix unblocks correct
classification ahead of the feedback UI.

---

## Self-Review — Round 2 (multi-role, requirements)

### Senior Engineer

#### RESOLVED: The authoritative terminator source (`45.ts:62`) contains a misspelled event name
**Resolution**: Added a Technical Note ("Sheet typo in the terminator set")
requiring the impl to key run-window closing off the canonical `translate.ts`
event names and treat the sheet `logEvents` strings as descriptive metadata
only; workbook fix flagged as upstream / out of scope.

R1 names the run-end terminator set and cites `45.ts:62-63` (`ranSimulation`)
as authoritative. That `logEvents` array actually reads
`["SimulationStarted", "SimulationStopped", "SImulationRestarted",
"SimulationReloaded", "TopBarReloadButtonClicked", "SimulationEnded"]` — note
`SImulationRestarted` with a capital second `I`, which does not match the real
event name `SimulationRestarted` emitted by the app / handled in
`translate.ts:46`. R1's own prose spells it correctly, so the spec and its cited
source disagree. This matters because an implementation that derives the run-end
set programmatically from `ranSimulation.logEvents` (rather than from the
canonical `translate.ts` switch) would inherit a terminator string that never
fires, leaving the run window open across a Restart and silently violating R2.
Suggested resolution: add a Technical Note flagging the sheet typo, and state
that the impl must key run-window closing off the canonical event names
(`translate.ts`), treating the sheet `logEvents` string as descriptive metadata
only. Optionally note the typo for upstream workbook correction (out of scope to
fix here per the "no re-extraction" boundary).

---

### QA Engineer

#### RESOLVED: R6 over-generalizes "Tabs 47/54 Cat 4/5" and ignores their differing preconditions
**Resolution**: R6 split into per-tab bullets — tab 47 (Cat 3/4/5, gated on
`DefaultVars`) and tab 54 (Cat 3/4 only, no Cat 5, gated on `DefaultVegetations
AND SevereDroughts`). R8 amended to require Severe Drought for the tab 54 walk.

R6 lumps tabs 47 and 54 together ("Tabs 47/54 Cat 4/5 helitack arms become
reachable" and "Tabs 47/54 Cat 3 (`NOT (Fireline OR Helitack)`)"). Two
inaccuracies make this hard to test against: (1) tab 54 has no Cat 5 — it
defines only Cat 1–4 (`54.ts`), so "Cat 4/5" is wrong for 54; (2) the two tabs
reach their helitack arms through different non-helitack preconditions — tab 47
gates on `DefaultVars`, while tab 54 gates on `DefaultVegetations AND
SevereDroughts` (`54.ts:40,48`). The practical consequence is that the Jest /
Playwright setup to reach tab 54's helitack arm must set Severe Drought (and so
must NOT pass `severeDroughtAvailable=false`), unlike tab 47. Suggested
resolution: split the R6 47/54 bullet into per-tab criteria citing each tab's
actual categories and preconditions, and note the Severe-Drought setup
requirement for tab 54 in R8.

#### RESOLVED: No explicit no-regression requirement for the non-helitack categories of 45/47/54
**Resolution**: R7 extended to retain / re-run the WM-18 per-category coverage
for 45/47/54 as regression coverage (non-helitack categories must classify as
before); R8 extended with a per-tab non-helitack spot-check.

Removing the `usedHelitack` / `Helitack` stubs changes evaluation beyond the
helitack arms: the stubs forced `Helitack`/`usedHelitack` to `false`, which (via
the `NOT (... Helitack)` / `NOT (usedFireline AND usedHelitack)` sub-expressions)
silently shaped which category won in the *non*-helitack cases too. R6 specifies
the categories that should *change*, but no requirement states that the
categories that were already classifying correctly (e.g. tab 45 Cat 1/2, tab
47/54 Cat 1/2, and the no-fireline-no-helitack default arms) must still classify
the same after the change. Suggested resolution: add a requirement (or extend
R7/R8) calling for explicit regression coverage that the non-helitack categories
of 45/47/54 are unchanged.

---

### Product Manager

#### RESOLVED: "Primary acceptance evidence" is an ephemeral, gitignored artifact
**Resolution**: R8 now specifies the durable acceptance record is a short per-tab
summary in the PR description (categories exercised + observed active category);
gitignored `tmp/playwright/` screenshots are optional / illustrative.

R8 designates the Playwright MCP walk as the "primary acceptance evidence," but
per CLAUDE.md its screenshots are written under `tmp/playwright/`, which is
gitignored. The spec does not say how that evidence is captured durably for a
reviewer who is approving the story. As written, the primary acceptance evidence
disappears with the working tree. Suggested resolution: state where the
acceptance record lives — e.g. a summary (categories exercised + observed active
category) in the PR description, or a committed validation note — so "primary
acceptance evidence" is reproducible at review time.

---

### Education Researcher

#### RESOLVED: Pedagogical meaning of "helitack used" — any drop vs. an effective drop
**Resolution**: R1 amended to record the decision: attribution is by drop
occurrence within the run window regardless of placement/effectiveness (the
`{x, y, elevation}` payload is not inspected), mirroring `usedFireline`;
effectiveness is intentionally not measured.

R1–R4 attribute a helitack to a run on the basis of the `Helitack` event's
occurrence alone, regardless of where it lands (the event carries `{x, y,
elevation}`, none of which R1 inspects). This mirrors `usedFireline` (any ≥2
markers). For the classification to mean what the feedback implies ("Great job!
You used both tools"), the research/instructional intent of crediting *any* drop
— including one placed far from any fire or on already-burned terrain — should be
explicit rather than implied by the sibling impl. Suggested resolution: record a
decision (likely "any drop counts, matching usedFireline; effectiveness is not
measured") in Requirements or a Technical Note, so the pedagogical semantics of
the classification are documented.

#### RESOLVED: Cross-trial satisfaction of tab 45 Cat 4 vs. the same-run instructional cue
**Resolution**: R6 Cat 4 bullet now records that the cross-trial allowance is
intended sheet semantics accepted as-is here, with the pedagogical tension
against Cat 3's same-run coaching cue flagged upstream for the workbook author.
No requirement change.

A prior review item established (and R6/R8 now require testing) that tab 45 Cat 4
can be satisfied with fireline in one trial and helitack in another, because each
binds its own `WITH` reading. From a pedagogy lens this sits in tension with the
Cat 3 coaching text, which says "Add both a Fireline and a Helitack *while the
model is running*" — implying the lesson is concurrent same-run use. So a student
who never used both tools in one run can still receive the Cat 4 "Great job!
ready to answer" celebration. The earlier item resolved the *mechanics*; this
raises whether the cross-trial reward matches instructional intent. Suggested
resolution: confirm this is intended sheet semantics (and accept it, given the
"no workbook change" boundary) and note that intent explicitly in R6, or flag it
upstream — but do not silently leave the tension undocumented.

---

## Self-Review — Round 3 (multi-role, requirements; each finding code-verified)

Each finding below was checked against the current source before being written:
`evaluator.ts` (WITH binding), `engine.ts` (`latestRunStartReading`,
temporal-history commit), `translate.ts` (triggers vs no-ops), and the
`45/47/54.ts` expressions. A fourth candidate (that the Playwright walk could be
blocked by `helitackAvailable=false`) was investigated and dropped: the 45/47/54
rows in `localhost-urls.md` do not pass that flag and `config.ts` defaults
`helitackAvailable: true`, so helitack is available for those walks as written.

### Hazbot Engine Architect

#### RESOLVED: Background bullet 3's "(`engine.latestRunStartReading`)" mischaracterizes the WITH binding
**Resolution**: Background bullet 3 rewritten as "A `WITH`-bound sim-prop is
evaluated per run-start reading" — the WITH clause runs the sim-prop against each
`SimulationStarted` witness and matches if any holds an in-run helitack
(`evaluator.ts:132`); the within-run append lands on the run's start reading as
the active last reading (`engine.ts:417`); and an explicit note states the WITH
binding does not use `latestRunStartReading` (that accessor is the non-WITH /
sidebar fallback witness).

**Code checked**: `evaluator.ts:132-148` (`evaluateWith`), `engine.ts:74-83`
(`latestRunStartReading`), `engine.ts:417-421` (temporal-history commit lands on
the last reading).

Background bullet 3 says the `Helitack` sim-prop "is bound by `WITH` to the run's
`SimulationStarted` witness reading (`engine.latestRunStartReading`)." The code
shows the WITH binding does not use `latestRunStartReading` at all. `evaluateWith`
iterates over *every* witness returned by the bound factor variable's compute
(for `ranSimulation`, that is every `SimulationStarted` reading) and the clause
matches if *any* witness satisfies the inner prop (`bound !== undefined`).
`latestRunStartReading` is a separate accessor used as the default/fallback
witness for non-WITH sim-prop evaluation and the sidebar, not by the WITH path.
This matters because the per-run helitack data must attach to each run's own
run-start reading (it does, via the `lastReading` temporal-history append at
`engine.ts:417-421`, since the run-start reading is the last reading while a run
is active), and the existential-over-all-witnesses semantics is exactly what
makes R6's cross-trial tab 45 Cat 4 work. An implementer who takes the
parenthetical literally and attaches helitack state only to
`latestRunStartReading` would correctly classify the latest run but silently
break per-run / cross-trial evaluation. Suggested resolution: correct the
parenthetical to describe the WITH binding as "evaluated against each
`SimulationStarted` witness reading" and drop or re-scope the
`latestRunStartReading` reference.

---

### QA Engineer

#### RESOLVED: R7's negative tests don't pin the no-op-terminator window-close case
**Resolution**: R7 extended to require, within the between-runs coverage, an
explicit negative test for a helitack after a `SimulationRestarted` /
`SimulationReloaded` / `TopBarReloadButtonClicked` (no terminating reading pushed)
and before the next `SimulationStarted`, distinct from the `SimulationEnded` /
`SimulationStopped` gap.

**Code checked**: `translate.ts:44-48` (`SimulationRestarted` /
`SimulationReloaded` / `TopBarReloadButtonClicked` return `{kind:"no-op"}`, push
no reading), `engine.ts:417-421` (temporal append targets the last reading, which
stays the prior run-start reading when no terminating reading was pushed).

R7 requires negative-path tests for "a pre-run helitack and a between-runs
helitack." The Technical Notes already single out the three no-op terminators as
the case where the chosen mechanism can silently keep the run window open (a
helitack after a Restart / Reload but before the next Start would attach to the
prior run because no terminating reading was pushed). That is the subtlest and
most regression-prone exclusion path, yet R7's enumerated negatives read most
naturally as the easy `SimulationEnded` gap (where a terminating reading does
exist). Suggested resolution: extend R7 to explicitly require a negative test for
a helitack occurring after a no-op terminator (`SimulationRestarted` /
`SimulationReloaded` / `TopBarReloadButtonClicked`) and before the next
`SimulationStarted`, asserting it is excluded from the prior run.

#### RESOLVED: R6/R8 don't distinguish tab 47 Cat 4 from Cat 5 (different histories, and Cat 4 is corrective, not success)
**Resolution**: R6's tab 47 bullet now states Cat 4 (`NOT X AND Y`) and Cat 5
(`X AND Y`) are mutually exclusive and require different histories (Cat 5 needs a
clean-baseline run, Cat 4 needs its absence), and that Cat 4 is a corrective nudge
while only Cat 5 is the success celebration. R8 now requires the tab 47 walk to
exercise both endpoints via their distinct histories.

**Code checked**: `47.ts:51` (Cat 4: `NOT ranSimulation WITH DefaultVars AND NOT
(Fireline OR Helitack) AND ranSimulation WITH DefaultVars AND (Fireline OR
Helitack)`), `47.ts:59` (Cat 5: same without the leading `NOT`), and the two
feedback strings (`47.ts:44` corrective nudge vs `47.ts:56` celebration).

R6 says tab 47 "Cat 4 and Cat 5 ... become reachable" and R8 says to exercise
"the tab 47/54 helitack arms," but neither states that the two categories require
different run histories to reach: Cat 5 fires only when a clean-baseline run
(`DefaultVars AND NOT (Fireline OR Helitack)`) also exists, while Cat 4 fires
precisely when that baseline run is absent. They are mutually exclusive. A walk or
Jest setup that builds only one history will hit only one of them while believing
it covered "the helitack arm." There is also a pedagogical wrinkle worth noting:
Cat 4 is not a success state (its feedback is "Did you try running the model
without firelines and helitacks...?"), only Cat 5 is the "Great job!"
celebration. Suggested resolution: in R6 (tab 47 bullet) and R8, note that Cat 4
requires no prior clean-baseline run and Cat 5 requires one, and require coverage
of both distinct histories.

---

## Self-Review — Round 4 (multi-role, requirements; each finding code-verified against current source)

These findings were checked against current source before being written. The
semantic claims (WITH binding, parser precedence, overlap guard, terminator set,
`eventName` filtering, R9 doc targets, `helitackAvailable` defaults) were
re-verified and hold; the surviving findings below are citation / hygiene defects
that would mislead an implementer following the spec's own pointers.

### Senior Engineer

#### RESOLVED: Technical Notes cites the wrong line for the `Fireline` reference impl
**Resolution**: Reference-impls Technical Note updated `Fireline`
`sim-props.ts:147` → `sim-props.ts:201`.

**Code checked**: `sim-props.ts:201` (the `Fireline` sim-prop const) and
`sim-props.ts:147` (the line the spec points at, which is `const higher =
Math.max(a, b);` inside `SparksAtTopAndBottom`). `usedFireline` at
`factor-variables.ts:183` and `GraphOpen` at `sim-props.ts:85` were also rechecked
and are correct.

The "Reference impls" Technical Note says "`usedFireline`
(`factor-variables.ts:183`) and `Fireline` (`sim-props.ts:147`) are the closest
sibling impls." `Fireline` is actually defined at `sim-props.ts:201` — line 147
is mid-`SparksAtTopAndBottom`, an unrelated predicate. An implementer following
the pointer lands on the wrong sim-prop. Suggested resolution: change
`sim-props.ts:147` to `sim-props.ts:201`.

#### RESOLVED: Two imprecise `translate.ts` line citations in Technical Notes
**Resolution**: In the "Not all run terminators currently produce readings" note,
`translate.ts:30` → `translate.ts:42` (the Ended/Stopped push) and
`translate.ts:44-46` → `translate.ts:44-48` (matching the spec's other citations
of the no-op block).

**Code checked**: `translate.ts` — the `SimulationStarted` trigger return is line
30; the `SimulationEnded` / `SimulationStopped` trigger return is line 42; the
three no-op terminator case labels are `SimulationRestarted` (46),
`SimulationReloaded` (47), `TopBarReloadButtonClicked` (48).

In "Not all run terminators currently produce readings": (a) "only
`SimulationEnded` / `SimulationStopped` are translate triggers that push a reading
(`translate.ts:30`)" — line 30 is the `SimulationStarted` push; the
Ended/Stopped push is line 42. (b) the same note ends "are translate no-ops
(`translate.ts:44-46`)" for the three no-op terminators, but those case labels are
at lines 46-48; the range 44-46 covers the two `ChartTab*` cases plus only the
first terminator. Elsewhere the spec correctly cites `translate.ts:44-48` for the
no-op block (R7, Round-3 QA item), so this is also an internal inconsistency.
Suggested resolution: change `translate.ts:30` to `translate.ts:42` (or `:32-42`)
and `translate.ts:44-46` to `translate.ts:46-48` (or `:44-48` to match the other
citations).

### Spec Editor

#### RESOLVED: Round-3 self-review items retain leftover `Decision: FILL IN` placeholders under RESOLVED headers
**Resolution**: Dropped the trailing `Decision` placeholder line from every
resolved self-review item (three Round-3 and three Round-4), matching the
Round-1/2 Resolution-only format.

**Checked**: the three Round-3 items each carry a `#### RESOLVED:` header and a
filled-in `**Resolution**:` block, yet still end with `**Decision**: <!-- FILL IN
-->`. The Round-1 and Round-2 items use Resolution-only (no trailing Decision
stub), so the format is inconsistent across rounds.

The dangling `Decision: FILL IN` markers read as unresolved at a glance and will
trip the Phase 3 / Phase 5 OPEN-item scans even though the items are resolved.
Suggested resolution: drop the trailing `**Decision**: <!-- FILL IN -->` lines
from the three Round-3 items (and from the two Round-4 items above once each is
resolved), matching the Round-1/2 Resolution-only format.

---

## Self-Review — Round 5 (multi-role, requirements; every candidate code-verified before write-up)

This round re-checked the spec's full set of concrete claims against current
source. Each candidate issue was investigated in code *before* deciding whether
to write it up; candidates that the code disproved or that the spec already
covers are recorded below (with their disproof) rather than left as silent
omissions. Files re-read: `evaluator.ts` (WITH binding), `engine.ts`
(`latestRunStartReading`, overlap guard, temporal commit), `translate.ts`
(triggers vs no-ops), `parser/parse.ts` (operator precedence), `45/47/54.ts`
(expressions + sheet typo), `sim-props.ts` / `factor-variables.ts` /
`factor-variable-stubs.ts` (reference impls + stubs), `derive-defaults.ts`
(default-wind derivation), `config.ts` (URL-param parsing + `helitackAvailable`
default), `bottom-bar.tsx` (`handleFireLine` / `handleHelitack`),
`stores.ts` (`window.test` helpers), and the R9 doc targets. All substantive
semantic claims re-confirmed; the single change applied this round is the
citation tightening below.

### Senior Engineer

#### RESOLVED: Background bullet 2 attributed the run-stop to the marker-draw, one layer off from the real mechanism
**Resolution**: Background bullet 2 rewritten to attribute the run-stop to
*activating the Fireline tool* (`handleFireLine` calls `simulation.stop()`,
`bottom-bar.tsx:289`) and to note explicitly that the marker-draw
(`simulation.addFireLineMarker`) does not stop the sim, so the markers are placed
while stopped and captured at the next Start. The Helitack-tool contrast now
cites `handleHelitack` (`bottom-bar.tsx:299`).

**Code checked**: `simulation.ts:555` (`addFireLineMarker` pushes a marker, no
`stop()`), `bottom-bar.tsx:285-294` (`handleFireLine` calls `simulation.stop()`
at line 289 and logs `SimulationStopped` when the run was active),
`bottom-bar.tsx:299-304` (`handleHelitack` only sets `ui.interaction` and logs
`HelitackButtonClicked`; no stop).

The bullet read "a fire line is snapshotted into the next `SimulationStarted`
reading because drawing one calls `simulation.stop()`." The causal chain is
correct (a fire line is captured at the next Start), but the stop lives in the
tool-button handler `handleFireLine`, not in the marker-draw path
`addFireLineMarker` — so "drawing one calls `simulation.stop()`" mis-locates the
mechanism an implementer would grep for. Corrected the attribution.

### Candidates investigated and dropped (code-disproved or already covered)

These were generated by the role pass and then dropped after a code dive; none is
a spec defect. Recorded so a later reviewer does not have to re-derive them.

- **QA — "Tab 54's row in `localhost-urls.md` passes a bare `severeDroughtAvailable`
  (no `=value`), so the walk loads with severe drought disabled and cannot reach
  Cat 3/4."** Dropped. `getURLParam` returns `true` for a present-but-valueless
  param (`config.ts:180`, `if (!results[2]) return true`), so the bare flag keeps
  severe drought *available*, consistent with R8.
- **QA — "Tabs 45/47's rows set non-default `windSpeed` / `windDirection`, so
  `DefaultVars` can never be true and the `WITH DefaultVars` categories are
  unreachable via those URLs."** Dropped. `deriveWildfireDefaults` reads
  `config.windSpeed` / `config.windDirection` from the resolved config (preset +
  URL params) (`derive-defaults.ts:36`), so the URL override becomes the default
  and a run that leaves wind untouched satisfies `DefaultVars` (within the
  `sim-props.ts` tolerance window).
- **QA — "Same-run tab 45 Cat 4 is unachievable because a fire line cannot be
  drawn during an active run alongside a helitack."** Dropped. It is achievable
  and the mechanics are sound: activating the Fireline tool stops the run
  (`bottom-bar.tsx:289`), so the fire line is drawn while stopped and snapshotted
  into the next Start reading; the helitack is then dropped after that Start and
  appends to the same run-start reading — so one `SimulationStarted` witness
  carries both `Fireline` (snapshot) and `Helitack` (in-run append), satisfying
  both `WITH` clauses. Background bullet 2 plus R8's same-run / across-runs split
  already cover the constraint that the fire line must precede Start.
- **Engine Architect — "R4's 'mirroring the `usedFireline` aggregation pattern' is
  misleading because a helitack is not a `SimulationStarted` snapshot field."**
  Dropped. The Technical Notes already split the two concerns: the cross-run OR
  aggregation shape comes from `usedFireline` (`factor-variables.ts:183`), while
  the per-reading read pattern comes from `GraphOpen`
  (`temporalReads` + `temporalHistory.some(...)`, `sim-props.ts:85`), and
  Background bullet 1/2 make plain the helitack arrives via the event stream, not
  a start snapshot. R4 read in the context of the whole spec is unambiguous.
