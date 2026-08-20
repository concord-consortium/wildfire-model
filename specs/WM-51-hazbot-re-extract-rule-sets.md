# Hazbot: re-extract rule-sets from the updated feedback tables

**Jira**: https://concord-consortium.atlassian.net/browse/WM-51

**Status**: **Closed**

## Overview

Sam revised the Wildfire Hazbot Feedback Tables spreadsheet, changing the category expressions on all 11 rule-sets. This story re-extracts those rule-sets into the codebase, adds the three sim-prop implementations the new expressions require (without which the engine will not load), and regenerates everything the sheet drives: the validation playbooks, the coaching tour data, and the DSL grammar reference.

For a non-technical reader: the Hazbot analysis engine decides which piece of coaching feedback a student sees, based on rules Sam authors in a Google Sheet rather than in code. The revision is mostly a change in how the rules ask their questions. Several used to look back across a student's whole session ("has this student ever changed the wind?") and now ask about a single run ("did this run have the wind changed?"), which is a more accurate reading of what a student is doing at the moment they get feedback. One rule-set, tab 34, gains an extra feedback category and its success condition becomes markedly easier to reach. This story delivers those changes as authored and adds no new engine capability of its own.

## Requirements

- **R1.** Re-extract all 11 rule-sets from the corrected 2026-08-20 export, plus `index.ts` and `dsl-grammar.md`.
- **R2.** Add three sim-prop implementations: `VegetationSet`, `DroughtLevelSet`, `WindSet`, registered in `simProps`, each with unit tests, and update the `defaults`-consuming list in `test-helpers.ts`.
- **R2a.** `WindSet` applies **no tolerance**: any deviation from the default wind counts as set. It does not share a helper with `DefaultVars`, which keeps its ±2 MPH / ±20° windows. *(Reversed mid-story on Sam's ruling; the original decision was the opposite. See Decisions.)*
- **R3.** Reconcile `tour-map.tsx` against every changed tab's `visualFeedback`: add the 34/4 anchor entry (R3a) and correct tab 35's swapped terminal targets on categories 3 and 4 (R3b).
- **R4.** Review every changed tab's per-rule-set test against its new expression and rewrite what no longer describes reality, rather than chasing failures to green.
- **R5.** Regenerate the derived artifacts after R1 and never before it: the validation playbooks and `tour-data.generated.ts`.
- **R6.** Bump `APP_RULES_VERSION` from 4 to 5, exactly once for whatever this branch ships.
- **R7.** Leave the newly-unreferenced factor variables in place; delete nothing.
- **R8.** No parser, extractor or engine-substrate changes.
- **R9.** Full suite green and lint clean; regenerate the replay fixture, confirm the diff is `sessionId`-only, and discard it.
- **R10.** Full automated Playwright walk across every rule-set, plus the `localhost-urls.md` and `TBD.md` doc updates.
- **R11.** Re-run the exhaustive coverage sweep; expect zero uncovered signatures and zero unreachable categories on every tab. *(Tightened mid-story: the spec originally allowed a tab-35 exception, which Sam's corrected sheet retired.)*
- **R12.** Add a Jest integration test pinning the reading-side zone labels end to end.
- **R13.** Correct the two defects this story found in `docs/hazbot-update-workflow.md`.

## Technical Notes

The rule-sets under `src/hazbot/rule-sets/` are generated, not hand-written. `scripts/extract-hazbot-sheets.js` reads the Feedback Tables `.xlsx` export and emits one typed `RuleSet<WildfireDefaults>` module per tab. Identifiers in category expressions resolve to hand-written implementations in `factor-variables.ts` (session-history predicates, lowercase) or `sim-props.ts` (single-reading predicates bound by `WITH`, UpperCamelCase). The engine refuses to load if an expression names an identifier with no implementation, which is why R2 is a prerequisite rather than a nicety.

**Emphasis is carried by cell formatting, not markup.** The extractor derives bold from the xlsx rich-text runs via `scripts/rich-text-bold.js`, so editing a cell in the sheet can silently drop bold, and no test asserts emphasis. This happened once during the story on tab 34 category 4 and was caught by a convention sweep across all 31 `arrowText` blocks.

**Two harnesses answer different questions, and both are needed.** The coverage sweep asks whether any reachable state matches no category. The reclassification matrix asks whether a fix moves states that already had feedback. A candidate fix passed the first and was rejected by the second, which is the reason both exist. Both live outside the repo as oob files and are deliberately not committed.

**Driving the browser walk** has four traps, each of which reads as a product bug: probes need a full page navigation rather than Restart or Reload, because the matched category is a monotone floor; several presets already default a zone to the value you would reach for as "changed"; a helitack only registers while the run is live; and a fire line only registers on resume, because the `Fireline` sim-prop reads the run-start snapshot. These are recorded in `docs/hazbot-validation/localhost-urls.md`.

## Out of Scope

- **The sheet's three new columns.** "Notes for Round 2" and "Notes for Round 3" belong to WM-46; "Relations" belongs to WM-50.
- **The `range_cc` table**, which is WM-45's. This story invalidates one entry: activity 34's `range_cc = 0` no longer holds after the re-extract. Sam updated it in his design doc on 2026-08-20.
- **The analysis window (WM-45).** This story delivers run-scoping only where Sam already did it at source. Deciding which of the remaining history-scoped variables should become run-scoped is WM-45's question.
- **The Reload to Clear All rename (WM-47).**
- **Parser, tokenizer and extractor changes** (R8), and **removing dead factor-variable implementations** (R7).

## Not Yet Implemented

- **Two `studentAction` cells describe a variable their expression no longer tests.** Tab 35 category 4 reads "two different droughts" against an expression with no drought clause; tab 32 category 3 reads "drought changed" against an expression that broadened to `setAnyZoneVar`. Raised with Sam on 2026-08-20 with proposed replacement wording for both. Neither is student-facing (`studentAction` reaches only the dev sidebar and the generated playbook headings), and it is editorial under the R6 policy, so it owes no second rules-version bump. **Deferred to a follow-up commit** rather than held for an answer.

## Decisions

### Should `WindSet` use `DefaultVars`' tolerant wind comparison or `setWind`'s strict one?

**Context**: Two live implementations of "is the wind at its default" disagree. `DefaultVars` rounds to whole MPH, allows a ±2 MPH window and folds the circular angle difference; `setWind` does a strict `!==`. Tab 42 asks the question through `DefaultVars` and tab 34 now asks it through `WindSet`, so a divergence means the same student run can count as "wind changed" on one tab and not on another.

**Options considered**:
- A) Mirror `DefaultVars`: tolerant comparison, shared helper.
- B) Mirror `setWind`: strict inequality.
- C) One shared helper for all three, changing `setWind`'s behavior.

**Decision**: **B**, on Sam's ruling of 2026-08-20, reversing an earlier decision on this branch that had chosen A. `WindSet` applies no tolerance; `DefaultVars` keeps its windows; no helper is shared. Sam's principle is that each rule resolves in the student's favor: tolerance on `DefaultVars` so a near-default run still earns the default, none on `WindSet` so the smallest deliberate change still earns credit for a change. The two are therefore not complements, and a sub-tolerance nudge satisfies both at once; that overlap is deliberate and is pinned by a unit test so it is not "fixed" back. The cost, recorded because the superseded analysis argued the other way: at zero wind speed the direction provably does not affect the model, so a 1 MPH nudge now promotes a tab-34 student to the success category for a change the simulation ignores. Rules semantics are Sam's call.

---

### Should `VegetationSet` and `DroughtLevelSet` fail closed on a zone-count mismatch?

**Context**: `DefaultVars` carries a deliberate guard that fails closed when the reading and defaults disagree on zone count, because `deriveWildfireDefaults()` can emit more entries than a reading contains. The existing `anyZoneDiffers` helper takes a different approach. The new props needed an explicit decision rather than an accident of which helper was reached for.

**Options considered**:
- A) Fail closed on mismatch, mirroring `DefaultVars`.
- B) Compare only the zones the reading has, matching `anyZoneDiffers`.
- C) Fail closed only when defaults are shorter than the reading.

**Decision**: **B, plain.** Reuse `anyZoneDiffers`' semantics exactly, with no extra guard, which is the literal reading of the sheet's "set distinct from the default value for any zone". `anyZoneDiffers` was exported from `factor-variables.ts` so the sim-props and their factor-variable twins stay in step.

---

### How much browser validation does this story carry?

**Context**: The story changes the engine, not only the generated rules, so the usual smoke-check was arguably insufficient.

**Options considered**:
- A) Smoke-check the changed tabs only.
- B) Walk the four semantically-changed tabs.
- C) Full automated walk across all 11 tabs, plus re-running the coverage sweep.

**Decision**: **C, widened and automated.** All 56 reachable categories were confirmed against the dev sidebar. The sweep is where the real risk turned out to live: it is what found the tab-35 hole, which no browser walk of the happy paths would have surfaced.

---

### What do we do about the tab-35 coverage hole the re-extract introduces?

**Context**: The revised tab 35 dropped the leading `setAnyVar AND` guard from category 3, leaving a student on uniform terrain and uniform drought with no forest pairing matching no category at all. Because the matched category is a monotone floor seeded from the empty-prefix match, they were shown category 1's "You haven't run the model yet" immediately after running it.

**Options considered**:
- A) Block the branch on a corrected sheet.
- B) Ship the hole and file a follow-up.
- C) Propose a verified fix to Sam and proceed with the rest of the work, folding in his answer if it arrives in time.

**Decision**: **C**, and the corrected sheet arrived the same day. Sam rejected the proposed fix for a good reason: under it, a student who had already made both zones mountains still landed on category 3, whose feedback tells them to make both zones mountains, which moves the incoherence into the student-facing text. His replacement splits the two cases on terrain uniformity and guards both. Measured: the hole closes completely, all seven categories stay reachable, and 34,974 previously-uncovered combinations resolve to category 4. It also moves 85,536 already-covered states from category 3 to category 4, failing the "no already-covered state is reclassified" bar an earlier investigation set. That bar was judged not to apply: Sam's position is that those states were mis-categorized before, so the move is the point of the fix rather than a cost of it. Every one of the 85,536 is a two-run state, and the half that reads as premature is what WM-45's trailing window will remove.

---

### Should the now-unreferenced factor variables be pinned by a test, or left silently unused?

**Context**: The re-extract leaves `setVegetation`, `setDroughtLevel`, `setWind` and `triedAllVegetations` referenced by no expression.

**Options considered**:
- A) Delete the implementations.
- B) Keep them and assert the unreferenced set in one place.
- C) Leave them silently unused.

**Decision**: **B**, as a single global assertion in `index.test.ts` beside the existing `expectedStubWarnings` table. No implementation is deleted (R7). WM-45 may well need them again.

---

### Does tab 34's much easier success condition need confirming with Sam before this lands?

**Context**: The old category 4 required drought and wind and all four vegetations across the session; the new category 5 requires a single run with vegetation off default and either wind or drought off default. Measured, 95% of single-run setups reach it under the new rules against 0 under the old.

**Options considered**:
- A) Implement as authored and raise the question in parallel.
- B) Block on his answer.

**Decision**: **A.** Nothing in this story's tab-34 work changes based on his answer, so B would block real work on an answer that cannot affect it. The question was reframed around `range_cc`, which is where it actually bites, and Sam updated that table on 2026-08-20.

---

### Should the tab-35 fix carry a second `APP_RULES_VERSION` bump?

**Context**: R6 mandates exactly one bump per branch, but the corrected sheet arrived mid-branch, raising whether it constituted a second semantic change.

**Decision**: **One bump, to 5, covering both.** The corrected sheet landed inside this branch's window, so version 5 describes what ships. The version is what lets dataset consumers correlate a session with the rules that evaluated it, and two distinct rule sets sharing a version would make tab-35 sessions from before and after the fix indistinguishable, on the very tab whose classification changed.

---

### How should the per-rule-set tests be updated?

**Context**: The re-extract fails nine tests across four files. The obvious approach is to fix the assertions.

**Decision**: **Rewrite against the new expressions, names and comments included, rather than chasing failures to green.** Tab 35 in particular reshuffled its categories, and all three of its coverage-test names described inverted conditions, so fixing the assertion alone would have pinned the wrong category under a name that was already wrong. The dangerous tests are the passing ones: only tabs 23 and 24 pass untouched, and those are exactly the two whose *expression* rewrites are semantics-preserving, so a green result there is expected rather than reassuring. Tab 23 proved the point the hard way: its expression change really was a pure reorder, but its `CorrectZoneSetup` Details cell was rewritten in the same revision, and no test failed because that contract lives in a hand-written impl. See the decision below.

---

### Tab 23's `CorrectZoneSetup` contract changed, and comparing expressions did not show it

**Context**: The story's diff method compared category *expressions* between the old and new extraction. Tab 23's expression change is a pure reorder (`NOT setAnyZoneVar AND ranSimulation` to `ranSimulation AND NOT setAnyZoneVar`), so the tab was classified as semantically unchanged. It was not: the same revision rewrote the `Details` cell that defines `CorrectZoneSetup`, and that contract is implemented by hand in `sim-props.ts` rather than generated, so nothing regenerated and nothing failed.

The old contract was zone 1 = Foothills/Grass/No Drought, zone 2 = Foothills/Grass/Mild or Medium. The new one is a base shape (terrain in {Foothills, Plains}, vegetation in {Grass, Shrub}, drought in {Mild, Medium}, partner matching on vegetation, matching or Foothills on terrain, and a *different* drought in {No Drought, Mild}) plus a rule that swapping the two zones of any allowed setting is also allowed.

**Why it went unnoticed until PR review**: the browser walk reached categories 4 and 5 using the pre-revision pair, which is still correct under the new contract *through the swap arm*, since it is the swap of (Mild, No Drought). So the walk passed while every newly-allowed setup, such as Plains or Shrub, evaluated false and would have left a student at category 3 being told their zone setup was wrong.

**Decision**: **Implement the revised contract as `base(z1,z2) OR base(z2,z1)`**, with unit tests covering the base shape, the swap arm, each newly-allowed dimension, and the exclusions. Verified in the browser: a Plains/Shrub setup now reaches category 5 with `CorrectZoneSetup` true.

**The durable lesson**: a re-extract diff must compare the `Details` cells that define hand-written impls, not only the expressions. `CorrectZoneSetup` is the one identifier on these tabs whose meaning lives entirely in prose, so it is the one that can change silently. The comment above the impl now says so.

**That sweep was then run across all 11 tabs**, comparing every `definition` and `details` cell against `origin/master`, and it found 15 changes. Only one needed code:

| Change | Verdict |
|---|---|
| 23 `CorrectZoneSetup` details | The bug above |
| 25 `SparksAtTopAndBottom` details | Editorial: same requirement, minus a stale "new algorithm coding required here" note that WM-15 obsoleted |
| 33 / 35 / 42 `setWind` details | The impl compares direction independently of magnitude, so it satisfies the new prose and never satisfied the old; the added "any small change should be accepted" is satisfied by the strict comparison |
| 42 `DefaultVars` added to the tab | Wording byte-identical to tabs 45 and 47, so the existing impl applies unchanged |
| 34: 3 rows added, 6 removed | The expected two-by-two restructure |

A caution for whoever repeats this: the first version of that sweep silently under-reported, because a regex over `details: "..."` does not survive the escaped quotes those cells contain, and it missed `CorrectZoneSetup` itself. It was only caught by checking the output against a change already known to exist. Validate the sweep against a known case before trusting a clean result, because an under-reporting sweep is worse than none in exactly the place that has already burned this story once.

---

### Does `src/hazbot/TBD.md` need updating?

**Context**: Its §4 bullet records the tab-35 `setAnyVar AND` guard as a fixed defect, and the tab-35 row of `localhost-urls.md` cites that bullet. Nothing in the original requirements touched either file.

**Decision**: **Both updated, folded into R10.** That bullet is the codebase's institutional memory for precisely the failure mode this re-extract nearly reintroduced, and it would otherwise have gone stale on the branch that changed the expression it describes. It now records that the guard still holds, that the expression it guards changed, and that the draft sheet's removal of the guard is what opened the hole.

---

### Does tab 35's coach-mark reassignment need handling, given no test fails?

**Context**: Tab 35 swapped the terminal coach-mark target between categories 3 and 4. Step counts and testids are unchanged either way, so every `tour-map.test.ts` invariant passes.

**Decision**: **Correct the map by hand (R3b), and widen the workflow doc's prompt (R13).** Left uncorrected, a student on 35/3 would get a coach mark ringing the Setup panel where the design says the Next button, and the reverse on 35/4. The workflow doc's step 6a prompted a map update only when a step is added or removed, which is exactly the case that does not apply to a pure reassignment, so following the documented process would miss it every time.
