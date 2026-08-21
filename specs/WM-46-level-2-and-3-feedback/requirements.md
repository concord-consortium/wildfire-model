# Hazbot: level 2 and 3 feedback

**Jira**: https://concord-consortium.atlassian.net/browse/WM-46
**Repo**: https://github.com/concord-consortium/wildfire-model
**Status**: **In Development**

## Overview

Hazbot shows the same feedback every time a student clicks it while their category has not changed. This story adds a second and third level of feedback for a repeat click on the same category, drawn from the "Notes for Round 2" and "Notes for Round 3" columns that already exist in the source spreadsheet.

## Project Owner Overview

Today a student who clicks the Hazbot Analysis button twice without changing anything sees the identical hint twice. The intent is that Hazbot escalates: the first click gives the category's coaching, a second click on the same result gives a different nudge, and a third points the student at a person. Trudi's framing on the ticket is "if Hazbot is clicked and the student has the SAME SCORE, it will give a different bit of feedback on the second and third time they click."

The content for this already exists in the feedback tables, so most of the work is teaching the pipeline to read two columns it currently ignores, holding a small amount of per-category click state, and picking the right string. The wording is explicitly provisional: Sam described the level 2 and 3 text as "zero-th order approximations in the table for now", so this is expected to take more than one pass and more than one PR.

## Background

**Where the content lives, verified against the workbook.** Columns **G "Notes for Round 2"** and **H "Notes for Round 3"** exist on 7 of the 11 activity tabs and are already populated. Measured on `Wildfire Hazbot Feedback Tables (8).xlsx`, which is the authoritative source (re-extracting it reproduces the committed rule-sets byte for byte, so WM-51's extraction is current with it):

| Tab | Categories | Round 2 filled | Round 3 filled | Which categories |
|---|---|---|---|---|
| 23 | 1-5 | 4 | 4 | 2, 3, 4, 5 |
| 24 | 1-5 | 4 | 4 | 2, 3, 4, 5 |
| 25 | 1-6 | 4 | 4 | 2, 3, 4, 5 |
| 32 | 1-6 | 4 | 4 | 2, 3, 4, 5 |
| 33 | 1-6 | 4 | 4 | 2, 3, 4, 5 |
| 34 | 1-5 | 3 | 3 | 2, 3, 4 |
| 35 | 1-7 | 5 | 5 | 2, 3, 4, 5, 6 |
| 42, 45, 47, 54 | - | **no columns at all** | | |

56 populated cells in total. Three patterns fall out of that table and each one is a requirement or a question below.

- **Category 1 never has a level 2 or 3.** On every tab, the "did not run the simulation" category is blank in both columns.
- **The top category has levels only on 23 and 24, and that is a fill-down artifact.** On 25, 32, 33, 34 and 35 the celebration row is blank. On 23 and 24 its Round 2 is byte-identical to the row above it ("Go down and look at the questions you need to answer.", which is category 4's text on both tabs), which is what a drag-fill one row too far looks like. Five tabs leaving it blank is the authored intent. Resolved by R4b: the top category is served by category 100 instead, on every tab.
- **Four tabs have no columns at all**, so on 42, 45, 47 and 54 every category is level 1 only.

**The level 3 string is a single global constant.** All 56 cells across all 7 tabs resolve to **one** distinct Round 3 value: `"I'm all out of ideas! Please ask your teacher or a classmate for help!`. Note the stray leading double quote, which is in the cell and would ship verbatim. This matches Sam's scope-down: *"no more than three feedbacks given in total, with the last one being like 'please get help from teacher or friend?'"*.

**The Round 2/3 cells are not in the same format as the level 1 cells.** Column C always reads `Hazbot: <text>\n[Label]`. Of the 56 Round 2/3 cells, **zero** carry the `Hazbot:` prefix and **zero** carry a trailing `[Label]` action token. `parseFeedback` (`hazbot-button.tsx:48-54`) strips the prefix and extracts the token, so as authored these strings produce a body with an **empty label**. That is not a missing button: `:191` passes `doneBtnText: label || undefined` and the coachmarks library defaults it to `"Done"`, so the popover drops out of Hazbot's voice rather than losing its action. The sharper consequence is that the token does not gate the walk-through today, so a level 2 string would ship with the level 1 tour still armed behind its button. Resolved by R1a and R4a.

**Category 100 is already the authored answer to a neighboring question, and the extractor throws it away.** Every tab carries a category with id 100 whose studentAction is *"Student repeats run after success and wants more feedback from Hazbot"*. It is correctly formatted with prefix and token, and it exists on all 11 tabs including the four with no Round 2/3 columns:

- 23, 24, 25, 32, 33, 34, 35, 45: `Hazbot: Great job on this investigation! Keep working through the activity!\n[Got it!]`
- 42, 47, 54: `Hazbot: Make sure you have answered all the questions on this page!\n[Got it!]`

`extract-impl.js:85` drops every row with `id >= 100`, so none of this reaches the code. Exactly one such row exists per tab (id 100; no tab carries 101 or higher).

**The sheet's README documents category 100 as this feature.** Under *Feedback Mechanism*: *"any category >= 100 is defined as a category that does not involve any new simulation-use behavior compared to the maximum category below 100... An example of such a spurious non-simulation action is a repeated unnecessary clicking of the 'Hazbot Analysis' button after the feedback for the sub-100 maximum category value was received."* Under *Categories*: *"any category >= 100 is to be identified with the maximum category value below 100... a simulation log data analysis module may be responsible for computing any category values below 100, and any category >= 100 may best be computed in a different module ('feedback mechanism' module, e.g.)."* That module is this story. See R4b and R4c.

**There is no click event to count.** `HazbotButtonClicked` and the three tour events are unhandled in `translate.ts` and fall through to `default: return { kind: "no-op" }` (`:67-68`), so a click pushes no reading. That no-op is load-bearing rather than incidental: `log()` routes every event through `engine.consume()` (`log.ts:26`), so a click that produced a reading would mutate the category it just reported (`hazbot-button.tsx:250-255`). `AnalysisEngineActivated` is also a no-op and fires once per page load. So "the second and third time they click" needs net-new state that does not live in the readings stream.

**This story stacks on WM-45.** WM-45 introduces `category.current` and selects the feedback by `category_used` rather than by the all-time best. That is the value "same score" has to compare, and it changes more often than `best` does, so the counter resets more often. WM-45 also puts `categoryUsed` on the `HazbotButtonClicked` payload, which is the field this story's levels attach to.

**Scope was narrowed by Sam on 2026-08-18.** Asked whether the full feedback logic from his design doc was expected now, he wrote: *"I think it'd be best to focus on the 'first feedback' for any category. We are sort of in agreement that for any category no more than three feedbacks given in total, with the last one being like 'please get help from teacher or friend?'. In any case, I believe that we must be open to what exactly the 2nd and the 3rd feedbacks will be like, although we are putting in the zero-th order approximations in the table for now."* The "comprehensive diagnosis and serious help" branch and the four-clicks-total rule from his doc are not the near-term target.

## Requirements

- **R1.** Teach the extractor to read columns G and H into two new optional `Category` fields. `arrowText` is the in-repo precedent for an optional column that not every tab carries: one `findCol` entry in `mapRuleColumnIndices` (`extract-impl.js:129-150`), one guarded assignment in the category builder (`:93-96`), one line in `emitCategory` (`:200-212`).
- **R1a.** Normalize the Round 2/3 cells at extraction, in `normalizeFeedback` (`extract-impl.js:177-179`), which already exists for this kind of fixup and today only collapses doubled `Hazbot:` prefixes. It gains three jobs: prepend `Hazbot: ` when the cell lacks it, append a default `[Okay]` token when the cell carries none, and strip a stray leading double quote. **Verified to be a no-op on existing content**: across all 11 tabs, zero committed level-1 feedback cells lack either the prefix or a trailing token, so a re-extract changes only the two new fields.
- **R2.** The `Category` type (`src/hazbot/engine/types.ts:40-47`) gains the two fields as optional strings. This is inert to the substrate: the engine parses only `expression` and never interprets `feedback`, so the added fields are string cargo and no rule-set test asserts feedback text.
- **R2a.** Both levels stay per-category sheet data, read the same way. Level 3 is not special-cased into a code constant even though it is provably one string today (all 56 populated cells across all 7 tabs resolve to a single distinct Round 3 value), and no test asserts that uniformity. Sam's own framing is that this wording is a "zero-th order approximation", so a guard against it changing would fire on legitimate authoring rather than on drift, and a code constant would put the one string that tells a stuck student to ask a person behind a developer. The 56 copies live in generated files, so the duplication costs nothing anyone maintains by hand.
- **R3.** Hold feedback-level state **per category** for the page session, as a map from category id to the highest level shown for that category. It is never reset within the session: a category the student returns to resumes where it left off rather than replaying level 1. The category key is WM-45's `category_used`. This follows Sam's wording directly, *"for any category no more than three feedbacks given in total"*, where the operative word is total rather than consecutively, and it is the only policy that does not replay a hint the student has already read. Under WM-45 that matters more than it would have before: `category_used` tracks the last run or two instead of ratcheting to the best, so a student moving between categories and back is the normal case rather than an edge one.
- **R3a.** Advance the level **when the popover actually opens**, in the effect at `hazbot-button.tsx:122`, not in `handleClick` (`:242`). A click-site counter advances levels the student never sees. Verified in the running app: the Hazbot button carries no `disabled` state and nothing overlays it (`document.elementFromPoint` at the button's center returns the button's own label span while the popover is open), while the open effect is keyed on `[ui.showHazbotFeedback]` (`:240`) and that flag is a plain `@observable` boolean (`ui.ts:27`), so re-setting it to `true` notifies nothing. Two presses in a row therefore register two clicks, log two `HazbotButtonClicked` events, and show one unchanged popover. Without this rule a double-click walks a student from level 1 to "I'm all out of ideas! Please ask your teacher or a classmate for help!" with nothing read. The move is cheap because the key is already there: the same effect destructures `used` from `readCategories(engine)` at `:126`, so advancing at the display site is a map write rather than new plumbing.
- **R4.** The feedback pick at `hazbot-button.tsx:129` becomes level-aware: level 1 uses `feedback`, level 2 uses the Round 2 string, level 3 uses the Round 3 string.
- **R4a.** The action token becomes the switch that offers the coach-mark walk-through. The intro's tour launch (`hazbot-button.tsx:199`) requires a tour from `buildTour` **and** a `[Show me]` token on the level's own text, rather than a tour alone. Without this, swapping only the string leaves the level-1 tour armed: measured on tab 23 category 2, a level 2 popover reads "Go up and look at the instructions under Drought Investigation again", shows a button reading `Done`, and launches the three-step Restart / Setup / Setup-panel walkthrough when it is clicked. **Verified behavior-preserving**: across all 11 tabs the 34 categories that `buildTour` returns a tour for are exactly the 34 whose level-1 token is `[Show me]`, with no mismatch in either direction. The effect is that level 2 and 3 are terminal popovers by default, and an author who wants a level to re-offer the walk-through types `[Show me]` into that cell.
- **R4b.** Extract the category-100 row as **feedback-mechanism data**, in a slot of its own on the rule-set, and use it for every repeat click on the tab's top category. Level 1 on the top category stays the celebration; level 2 and beyond is category 100's string, terminal. This replaces the Round 2/3 columns for the top category on every tab.
- **R4c.** Category 100 must **not** enter `categories`. Its rows carry `-- no pseudo code --` in the expression column, so a category-100 entry in `categories` would fail to parse and trip the rule-set load-validation gate. For the same reason it is a feedback selection rather than a category value: the sheet's README says a category at or above 100 "is to be identified with the maximum category value below 100", so `matchedCategory` and WM-45's `categoryUsed` keep logging the sub-100 category when category 100's text is shown. The extractor already identifies these rows: the id-versus-marker consistency warning at `extract-impl.js:78-84` runs immediately before the `if (id >= 100) continue` drop at `:85`.
- **R5.** Level 3 is terminal. A fourth and subsequent click on the same category keeps showing level 3. More precisely, **the level never rises above the highest level that exists for that category** (R6): the counter caps rather than climbing past what can be displayed, so the level and the string it names stay in step. Measured consequences: a fully populated category logs 1, 2, 3, 3; the top category logs 1, 2, 2 (R4b); a middle category on 42, 45, 47 or 54 logs 1, 1, 1 (R6a). Without the cap a third click on the top category would record level 3 while showing the same string it showed at level 2.
- **R6.** Where a level is absent, fall back to the highest level that exists for that category, and never blank. This covers category 1 on every tab and the middle categories on 42, 45, 47 and 54. The top category is no longer one of these cases: R4b gives it category 100.
- **R6a.** On 42, 45, 47 and 54 that fallback means level 1 repeats, and no global level 3 is substituted in. Only eight categories are affected once R4b takes the top category and category 1 is set aside (42 cat 2; 45 cats 2-3; 47 cats 2-4; 54 cats 2-3), and **every one of them carries a coach-mark walk-through**, so a repeat click re-offers actionable help rather than stalling. Substituting the global level 3 there would jump a student from level 1 straight to "I'm all out of ideas" on their second click, skipping the middle step on exactly the categories whose level 1 still has somewhere to go. If the columns are authored later it is a re-extract, not a code change.
- **R7.** **Text only.** The levels change the popover string. The coach-mark walk-through does not vary by level, and no level is threaded into `buildTour`. Confirmed with the product owner 2026-08-21. See Technical Notes for why this is the additive choice rather than a corner cut. Note that R4a still gives an author per-level control over *whether* the existing walk-through is offered, without per-level anchor arrays.
- **R7a.** Log the level on a **new** event emitted where the popover opens: `HazbotFeedbackShown { ruleSetId, categoryId, feedbackLevel, source }`, in the effect at `hazbot-button.tsx:122`. `HazbotButtonClicked` is left exactly as it is, so it stays a pure click count and no existing field changes meaning. `feedbackLevel` is the level of the string actually shown, capped per R5. `source` is `"level1" | "round2" | "round3" | "category100"` and names where the string came from. Document the new event in `LOGGED-EVENTS.md`.
- **R7d.** `source` exists because `feedbackLevel` alone cannot identify the string. On the top category, `categoryId: 5, feedbackLevel: 2` means category 100 rather than a Round 2 column, but only to a reader who knows which category is the top for that ruleset and knows the fill-down was discounted, which is the out-of-band knowledge WM-45's data review added `rangeCc` to avoid. It is also the more durable of the two facts: Sam expects the wording to churn, so "which string did they read" stays answerable from the source plus the version long after a level number stops meaning anything specific. A sentinel level (for example `100`) was rejected because it breaks the field's `1 | 2 | 3` contract for every consumer and silently defeats any range check on it.
- **R7b.** The reason it is a new event rather than a field on the click: the click site and the display site are different moments and do not correspond one-to-one. `handleClick` (`:242`) runs before the effect decides anything, and a press while the popover is already open logs a click and displays nothing (measured; see R3a). Today `HazbotButtonClicked.categoryUsed` is a good enough proxy for what was shown, because one category means one string. Note that field and not `matchedCategory`: WM-45 pinned `matchedCategory` to `best`, which is precisely the value that can differ from what the student saw. This story ends that: after it, one category can produce three strings, and nothing in the log would say which the student read, on the feature whose entire subject is which of three strings a student reads, with wording that is expected to churn so the mapping is not reconstructible after the fact. Deriving the level downstream by counting same-category clicks is unsound for the same reason, since it over-counts by exactly the presses that displayed nothing.
- **R7c.** Keeping both series is a feature rather than redundancy. The gap between `HazbotButtonClicked` and `HazbotFeedbackShown` is the direct measure of a student pressing the button repeatedly with nothing new appearing, which is the behavior category 100 exists to answer (R4b) and which nothing records today.
- **R8.** Bump `APP_RULES_VERSION` from **6 to 7**, once for this branch. The 6 is WM-45's, inherited through the stack (`master` is at 4, WM-51 took it to 5, WM-45 to 6). Naming the numbers matters on a three-deep stack: without them a reviewer cannot tell whose bump is whose, and the version is the handle that lets a dataset consumer correlate a session with the rules that produced its feedback. This branch is the boundary between "one string per category" and "up to three", so an analyst who cannot see it will read two different strings for the same category as inconsistent data.
- **R8a.** Widen `docs/hazbot-update-workflow.md` §7 to cover **feedback-selection** semantics. As delivered by WM-45 it carries three bullets: editorial-only edits need no bump, semantic changes (new categories, new factor variables, expression structure changes, defaults-value changes that affect matching) do, and evaluation-semantics changes (how the existing expressions are evaluated) do. None of the three reaches *selection*, which of several strings is shown for a category that resolved the same way. R10 says this story changes no expression, factor variable or sim-prop, so on a literal reading §7 excludes it and R8 would assert a bump no policy authorizes. This is the second consecutive story where the honest answer is that the policy plainly should cover the case and does not, so fold the two into one statement rather than bolting on a third clause. Inherit the placement rule WM-45's bullet already carries while editing it: the bump belongs in the commit that changes the semantics rather than a later docs commit, because the repo deploys per-branch builds and a mid-branch state is reachable.
- **R8b.** Bump `ENGINE_VERSION` from **`0.1.0` to `0.2.0`**. `Category` and `RuleSet` are both exported from the substrate barrel (`src/hazbot/engine/index.ts:6`); R2 adds two optional fields to the first and R4b adds a slot to the second, which is additive substrate API under the WM-10 policy ("patch for fixes, minor for additive API, major for breaking changes"). The `0.1.0` is WM-45's, inherited through the stack. Note this is a *semver* judgment and does not contradict the sprint-24 finding that a `Category` field is not a substrate **stability-contract** change: the engine README's field-by-field rules cover `FactorVariableImpl` / `SimPropImpl`, not `Category`. Inert to the engine is not the same as absent from the API, and `engineVersion` rides in the `AnalysisEngineActivated` payload, so leaving it unchanged would show the same substrate version on both sides of a public type change.
- **R9.** Regenerate the derived artifacts that read category content: the validation playbooks (`node scripts/generate-hazbot-validation-playbook.js`) and the tour data (`scripts/generate-hazbot-tour-data.js`). The tour data must come back unchanged, since R7 leaves tours alone and R4a changes only whether an existing tour is offered, not its content.
- **R9a.** Teach the playbook generator the new levels. `playbook-impl.js:26` emits a single `- **Feedback**: <level 1 text>` line per category and knows nothing about the Round columns, so a regenerate alone would leave the playbooks unchanged and therefore stale: `docs/hazbot-validation/23.md` is the surface a validation walker follows, and it would show one of up to three strings with no mention of category 100. Emit the Round 2 and Round 3 strings and the category-100 line alongside the existing Feedback line, then regenerate. Without this the feature cannot be validated by the documented process, which is the same failure WM-45's R14a fixed for its own walk guidance.
- **R9b.** Surface the feedback level in the dev sidebar, beside WM-45's Category block. That block already shows `best`, `current` and `used`, and `used` is the key this story counts against, so the level belongs next to it: show the highest level reached for the current `used` category and the `source` of the string last displayed (R7a). Without it the only way to check a level in the browser is to click three times and read the popover, which is also the only way to notice that a press displayed nothing (R3a), so a walker cannot tell a capped level from a press that never opened. R9a makes the playbooks list the strings; this makes the running app say which one the student is on. **Route it through the existing host-supplied `diagnostics` prop** (`SidebarDiagnostic { label, value, status? }`, passed from `app.tsx:137` via `buildPresetDiagnostics`), not through new substrate API: the level lives in the UI store rather than in the engine (see Technical Notes), so the substrate cannot read it and has no business knowing what a feedback level is. That keeps R8b's bump to the two `Category` / `RuleSet` additions and adds nothing to it.
- **R10.** No change to any category expression, factor variable or sim-prop. This story adds feedback strings and a selection rule.

## Technical Notes

**The extraction base is clean.** Re-extracting `Wildfire Hazbot Feedback Tables (8).xlsx` into a scratch directory and diffing against `src/hazbot/rule-sets` produces no differences beyond the two hand-maintained files (`.eslintrc.js`, `test-helpers.ts`). So WM-51's extraction is current with the authoritative workbook and the only diff this story's re-extract should produce is the two new fields.

**Why text-only is additive rather than a corner cut.** Varying the walk-through per level would need per-level anchor arrays: `buildTour` returns null when `anchors.length !== data.steps.length` (`build-tour.ts:28`) and the `tour-map.tsx` anchors are hand-authored per category. Keeping the level out of `buildTour` entirely means a later per-level tour is an addition rather than a rewrite. It also keeps this story's diff off the lines WM-32 (Aug 25) and WM-31 (Aug 26) touch, both of which work in `hazbot-button.tsx` around the effect at `:115` and the teardown and logging routes.

**The button's test file changed shape under WM-45.** `hazbot-button.test.tsx` now mocks `computeCategorySelectionForEngine` and drives it through `mockSelection`, which returns `{ best, current, used, label }` rather than the bare category number the old `mockMatched` returned. WM-45 converted nine `mockReturnValue` sites for it (14 of the file's 24 tests moved), so any level case added here uses that shape from the start.

**This is not one PR.** The level 2/3 wording is provisional and the PIs will test it, so expect the strings to churn after the first pass. Build the text as swappable sheet data and do not bake level semantics into code beyond "levels 1 to 3, the third is terminal".

**Where the click state cannot live.** See Background. The readings stream is deliberately click-free, so the counter belongs in the UI store or in module state alongside the existing `ui.showHazbotFeedback` / `ui.hazbotPulseArmed` flags, not in the engine.

**One consumer, and it already holds the key.** `hazbot-button.tsx:129` (`engine?.ruleSet?.categories.find((c) => c.id === matched)?.feedback ?? ""`) is the only place category feedback is read for display. Since WM-45, `matched` there is `used`, destructured at `:126` from the `CategorySelection` that `readCategories` returns, so the per-category key R3 counts against is in hand at the display site with no extra call and no second copy of the selection rule.

## Questions for Trudi

**Ask at branch-build review, not before.** Trudi is on vacation the week of 2026-08-21 and returns the following week. None of these block the build: every one of them is either already handled in code or absorbed by a re-import of an updated workbook. Raise them when she can look at a running branch build, before the PR merges.

**1. The one that could cost a rebuild: did Round 2 and Round 3 fill down one row too far on tabs 23 and 24?**

This is the single place where this spec deliberately ignores content that is in the sheet. Everywhere else the sheet is authoritative: the Round strings are read as authored (R2a), a `[Show me]` typed into a cell decides whether that level re-offers the walk-through (R4a), and missing columns simply mean level 1 repeats (R6a). All of that absorbs a later edit through a re-import with no code change. **R4b does not.** It routes every repeat click on a tab's top category to category 100 regardless of what columns G and H hold, so on tabs 23 and 24 it reads authored cells and discards them.

The cells, in `Wildfire Hazbot Feedback Tables`:

| Tab | Top category | Cells | Row above |
|---|---|---|---|
| 23 | 5 | **G6**, **H6** populated | **G5** holds the byte-identical string |
| 24 | 5 | **G6**, **H6** populated | **G5** holds the byte-identical string |
| 25 | 6 | G7, H7 empty | G6 populated |
| 32 | 6 | G7, H7 empty | G6 populated |
| 33 | 6 | G7, H7 empty | G6 populated |
| 34 | 5 | G6, H6 empty | G5 populated |
| 35 | 7 | G8, H8 empty | G7 populated |

Five tabs stop the "Go down and look at the questions you need to answer." note at the second-to-last category. Tabs 23 and 24 continue it one row onto the celebration, where it duplicates the row above exactly. That plus the README (*"any category >= 100 ... an example of such a spurious non-simulation action is a repeated unnecessary clicking of the 'Hazbot Analysis' button after the feedback for the sub-100 maximum category value was received"*) is why R4b treats those four cells as a drag-fill.

**What to have her check on the branch build**: on tab 23, reach category 5 (correct zone setup plus one spark per zone, run), then click Hazbot twice. The second message should be *"Great job on this investigation! Keep working through the activity!"*. If she expected *"Go down and look at the questions you need to answer."* and then *"I'm all out of ideas! Please ask your teacher or a classmate for help!"*, then R4b is wrong and it is a code change rather than a sheet edit.

If she confirms the fill-down, the tidy-up is clearing G6 and H6 on tabs 23 and 24, which changes no behavior since R4b already ignores them.

**2. Every Round 3 cell begins with a stray `"` character.** All 56 populated cells across the 7 tabs carry it. R1a strips it in the pipeline so nothing ships with it, but it is a typo at source and worth fixing while she is in the workbook.

**3. Tabs 42, 45, 47 and 54 have no Round 2/3 columns at all.** Eight middle categories are affected and each keeps repeating its level 1 feedback, which still carries a working walk-through, so this is a gap rather than a defect (R6a). Worth asking whether it was deliberate. One detail suggests not: tab 45 groups with the seven authored tabs on its category-100 text ("Great job on this investigation!") but with the unauthored four on its Round columns, which reads as an unfinished pass. If she fills them in, it is a re-import, not a code change.

**Branch build URL**: branch deploys land at `https://wildfire.concord.org/branch/<name>/index.html`, with the story prefix stripped from the branch name, so a `WM-46-level-2-and-3-feedback` branch serves at `/branch/level-2-and-3-feedback/index.html`. Add the Hazbot URL params from `CLAUDE.md` to reach a given ruleset.

## Out of Scope

- **Per-level coach-mark walk-throughs** (R7). Parked with WM-32, whose mechanism section already records the sizing.
- **Sam's "comprehensive diagnosis and serious help" branch** and the four-clicks-total rule from his design doc. Scoped out by Sam on 2026-08-18.
- **The `run_record` / `run_history` structure** and `coachmark_tutorial` instrumentation (`num_steps` / `steps_completed`). Deferred by WM-45 and re-checked on 2026-08-21; see that spec's resolved question.
- **The Relations column** in the factor-variable block. That is WM-50.
- **Authoring the missing Round 2/3 columns on 42, 45, 47 and 54.** Flagged to Trudi as a content gap (see R6a), not blocking. Worth mentioning to her that tab 45 looks inconsistent with itself: it groups with the seven authored tabs on its category-100 text but with the unauthored four on its Round columns, which reads as an unfinished pass rather than a deliberate exclusion.
- **Authoring the level 2 and 3 wording.** Trudi and Sam own the content; this story ships whatever the sheet holds.
- **Changing which category is selected.** That is WM-45.

## Open Questions

### RESOLVED: The Round 2/3 cells carry no `Hazbot:` prefix and no `[Label]` action token. Where does that get fixed?
**Context**: All 56 populated cells are bare sentences, e.g. `Go up and look at the model hint again.` Column C is always `Hazbot: <text>\n[Label]`. Measured by running the real cell values through `parseFeedback` (`hazbot-button.tsx:48-54`), both level 2 and level 3 parse to a body with an **empty label**, and the level 3 body keeps its stray leading double quote.

An empty label is not a missing button: `hazbot-button.tsx:191` passes `doneBtnText: label || undefined` and the coachmarks library defaults that to `"Done"`. The button exists, it just drops out of Hazbot's voice.

The larger finding is that the token and the walk-through are decoupled. `buildTour` is called with the category, not the level (`:142`), and the intro's `onDestroyed` launches it whenever `phase === "intro" && !introCancelled && tour` (`:199`). So swapping only the string leaves the level-1 tour armed under level 2/3 text: on tab 23 category 2 that is a popover reading "Go up and look at the instructions under Drought Investigation again" with a `Done` button that launches a three-step Restart / Setup / Setup-panel walkthrough.

**Options considered**:
- A) Ask Trudi and Sam to author the cells in the same format as column C (prefix plus token), and change no code.
- B) Normalize at extraction: the emitter adds the `Hazbot:` prefix and a default token when the cell lacks them.
- C) Normalize at render: `parseFeedback` supplies a default label when the token is missing.
- D) Treat the missing token as intentional and render level 2/3 with a fixed default button (e.g. `[Okay]`) regardless of the cell.

**Decision**: **B, plus the token controls the tour.** The extractor normalizes (R1a) and the `[Show me]` token becomes the switch that offers the walk-through (R4a). Two measurements made this safe rather than a guess: zero of the committed level-1 cells lack the prefix or a token, so normalization cannot change existing output; and the 34 categories with a tour are exactly the 34 whose token is `[Show me]`, so gating on the token changes no current behavior.

Preferred over A because it makes the sheet authoritative without blocking on 56 cells being re-authored. The token controlling the tour is the part that earns its keep: today an author has no way to say "this level re-offers the walk-through", which is what Sam's design asks for at level 2 ("the coachmark re-offered with the level of insistence that reflects whether the user did/completed it previously"). After R4a that is one word typed into one cell. C was rejected because `parseFeedback` is a pure display parser and the fixup belongs where `normalizeFeedback` already lives; D takes authoring control away for no saving.

The stray leading `"` is stripped by R1a and should also be reported to Trudi, since it is a typo at source rather than something the pipeline should have to know about.

---

### RESOLVED: What resets the feedback level?
**Context**: The sheet does not say, and three policies are plausible. Traced against one session on tab 23 (defaults run to category 2, click; wrong zones run to category 3, click; revert to defaults back to category 2, click; then click again without running):

| Click | Category | A: reset on category change | B: reset on category change or new run | C: never reset |
|---|---|---|---|---|
| 1 | 2 | L1 | L1 | L1 |
| 2 | 3 | L1 for cat 3 | L1 for cat 3 | L1 for cat 3 |
| 3 | 2 | **L1 again, identical to click 1** | **L1 again** | L2 |
| 4 | 2 | L2 | L2 | L3 |

Separately and independent of the policy, a counter placed at the click site advances on presses that display nothing. See R3a for the measurement.

**Options considered**:
- A) Reset only when the selected category changes. A student who clicks three times without running anything reaches level 3.
- B) Reset when the selected category changes **or** when a new run starts, so each run gets a fresh escalation.
- C) Never reset within a page session: level is per category, so returning to a previously seen category resumes where it left off.

**Decision**: **C, plus increment-on-display** (R3 and R3a). Row 3 of the table is the deciding one: A and B both replay a hint the student has already read and did not act on, which is close to the complaint the feedback work exists to fix, and under WM-45's run-scoped category that row is the common case rather than an edge one. B additionally makes levels 2 and 3 nearly unreachable for a student who is actually working, since running the model between clicks resets them, and it contradicts Sam's per-category "in total" count. B's one real virtue, throttling a frustrated clicker, is delivered by R3a instead.

**Accepted consequence**: with C and a terminal level 3, once a category has spent its three feedbacks, every later occurrence of that category shows "ask your teacher", which over a long session could be most of what a struggling student sees. That is Sam's stated cap working as written. A page reload is the only route back to level 1, since the state is in memory.

---

### RESOLVED: Level 3 is one identical string everywhere. Does it stay per-category sheet data?
**Context**: All 56 cells resolve to a single distinct Round 3 value across all 7 tabs: `"I'm all out of ideas! Please ask your teacher or a classmate for help!`. It also carries a stray leading double quote that would ship verbatim. Sam's scope-down describes level 3 as a fixed role ("please get help from teacher or friend") rather than per-category content. The sheet's own README documents the DSL and the feedback mechanism but says nothing about the Round columns, so there is no authored intent to read beyond the cells.

**Options considered**:
- A) Keep it as a per-category column. Costs nothing extra, keeps the door open to per-category level 3 text, ships 56 copies of one string.
- B) Read it from the sheet but store it once, since it is provably constant, and fail the extraction if a tab ever disagrees.
- C) Make level 3 a constant in code and stop reading column H.

**Decision**: **A** (R2a). The duplication is in generated files rather than anything hand-maintained, so it buys nothing to remove. B was the tempting one, since it looks like WM-45's `range_cc` pinning test, but the analogy does not hold: that test guards a value that is *derived* and therefore has one correct answer, while this is pure authored content with nothing to check it against, so the assertion would fail the build the first time Trudi writes a different level 3 for one category. C takes the most human-facing string in the feature away from its author, and it would also pre-empt the question below about the four tabs that carry no columns at all.

The stray leading `"` is stripped by R1a and should also be reported to Trudi as a source typo.

---

### RESOLVED: Category 100 is authored, correctly formatted, present on all 11 tabs, and thrown away. Is it this story's answer for a repeat click after success?
**Context**: Every tab carries a category 100 whose studentAction is *"Student repeats run after success and wants more feedback from Hazbot"*, with feedback `Hazbot: Great job on this investigation! Keep working through the activity!\n[Got it!]` on eight tabs and `Hazbot: Make sure you have answered all the questions on this page!\n[Got it!]` on 42, 47 and 54. The extractor drops it at `extract-impl.js:85` (`if (id >= 100) continue`) and the sheet's own note says it belongs in the feedback-mechanism module rather than the data-analysis one, which is this story.

The README settles the intent (quoted in Background), and a measurement settles the competing reading. On tabs 23 and 24 the celebration category *does* carry Round 2 and Round 3, which would make a student who just succeeded read "Go down and look at the questions you need to answer" and then "I'm all out of ideas! Please ask your teacher or a classmate for help!". But that content is a fill-down: on both tabs the top row's Round 2 is byte-identical to the row above it, while the other five tabs leave the celebration row blank. So the authored intent is a blank celebration row on every tab, and category 100 is what fills it.

**Options considered**:
- A) Bring category 100 into the extraction as feedback-mechanism data (not a matchable category) and use it for any repeat click on the top category, on all 11 tabs.
- B) Leave category 100 dropped and use the Round 2/3 columns where they exist (23, 24), repeating the celebration elsewhere.
- C) Leave category 100 dropped and suppress escalation on the top category entirely, so success always repeats the celebration.
- D) Out of scope for WM-46; file it separately.

**Decision**: **A** (R4b, R4c). It uses content that is authored, correctly formatted, README-documented, present on all 11 tabs including the four with no Round columns, and currently discarded. B implements the fill-down typo on two tabs and does nothing on the other five. C is safe but discards that content and repeats the celebration forever. D defers the one case the README explicitly assigns to the feedback-mechanism module.

The constraint in R4c is what makes A safe rather than a trap: category 100 lands in its own slot, never in `categories`, and never becomes a logged category id.

---

### RESOLVED: Four tabs have no Round 2/3 columns at all. Is level 1 repeating the intended behavior there?
**Context**: 42, 45, 47 and 54 have no columns G or H. R4b narrowed what is at stake: the top category is served by category 100 and category 1 never carries levels, so only eight middle categories remain (42 cat 2; 45 cats 2-3; 47 cats 2-4; 54 cats 2-3). Measured, **all eight have a coach-mark walk-through**:

```
tab 42: top=3  middle = cat2 (2-step tour)
tab 45: top=4  middle = cat2, cat3 (2-step tours)
tab 47: top=5  middle = cat2, cat3, cat4 (2-step tours)
tab 54: top=4  middle = cat2 (3-step), cat3 (2-step)
```

The tabs also group inconsistently between the two columns, which suggests an unfinished authoring pass rather than a decision: by Round 2/3 the split is {23, 24, 25, 32, 33, 34, 35} against {42, 45, 47, 54}, but by category-100 text it is {23, 24, 25, 32, 33, 34, 35, 45} ("Great job on this investigation!") against {42, 47, 54} ("Make sure you have answered all the questions on this page!"). Tab 45 sits on opposite sides of those two splits.

**Options considered**:
- A) Yes. Those activities are level 1 only until someone authors the columns.
- B) No. Apply the global level 3 string on a repeat click even where no level 2 exists, so every activity can eventually point the student at a person.
- C) Ask Trudi whether the four tabs were an oversight before deciding.

**Decision**: **A** (R6a), with the gap reported to Trudi rather than waiting on her. B was rejected because it invents escalation the author did not write and lands it on the eight categories least in need of it: their level 1 is a working walk-through, so a repeat click still has somewhere to go, and B would replace that with "I'm all out of ideas" on the second click. C is not treated as a blocker because A is what ships either way if she does not reply, and the implementation is identical, since R6's fallback already holds at the highest level that exists.

---

### RESOLVED: Should the feedback level be logged?
**Context**: WM-45 adds `categoryUsed` and `categoryCurrent` to `HazbotButtonClicked`, and R9b there adds the derived `range_cc` to `AnalysisEngineActivated`. Without a level, a researcher can see that a student clicked three times on the same category but not which of the three strings they read, and the mapping is not reconstructible once the wording churns, which Sam says to expect.

Mapped against the code, the four `log()` calls in `hazbot-button.tsx` are `:148`, `:166`, `:172` (all tour lifecycle, and only for a coaching category where the student activates `[Show me]`) and `:246` (`HazbotButtonClicked`, in `handleClick`). **Nothing is logged when the intro popover opens.** That has not mattered so far, because one category means one string, so `matchedCategory` on the click has been a reliable proxy for what was displayed. This story is what ends the one-to-one.

**Options considered**:
- A) Add `feedbackLevel` (1, 2 or 3) to `HazbotButtonClicked` and document it in `LOGGED-EVENTS.md`.
- B) Derive it downstream by counting consecutive same-category clicks in the log.
- C) No logging change.

**Decision**: **A prime**, a new display-site event (R7a, R7b, R7c). The originally drafted option B is unsound rather than merely weaker: R3a established that clicks and displays do not correspond, so a downstream count over-reports by the presses that showed nothing and would disagree with what the student saw. Putting `feedbackLevel` on `HazbotButtonClicked` records a level against an action that may not have produced one. Moving the existing click log into the effect was rejected outright: it would silently convert a click counter into a display counter, which is the longitudinal break WM-45's R9 exists to prevent.

---

### RESOLVED: What does this branch bump, and does the APP_RULES_VERSION policy actually cover it?
**Context**: Two halves, both surfaced by the decisions above rather than present in the original draft.

**The substrate version is not mentioned anywhere in this spec.** `Category` and `RuleSet` are both exported from the substrate barrel (`src/hazbot/engine/index.ts:6`). R2 adds two optional fields to `Category` and R4b adds a new slot to `RuleSet`, so both are additive changes to substrate public API. The WM-10 policy is explicit: *"engine version follows semver (patch for fixes, minor for additive API, major for breaking changes)"*. WM-45 already takes `ENGINE_VERSION` from `0.0.1` to `0.1.0`, and this story stacks on it, so the candidate is `0.2.0`.

**R8's justification collides with the written policy.** `docs/hazbot-update-workflow.md` §7 says a bump is due for *"new categories, new factor variables, expression structure changes, defaults-value changes that affect matching"* and that *"editorial-only edits (typo fixes in feedback text, no semantic change)"* need none. R10 of this spec says explicitly that no expression, factor variable or sim-prop changes. So on a literal reading §7 excludes this story, and R8 currently asserts a bump without a policy that authorizes it. WM-45's R10a widens §7 to cover *evaluation* semantics; this story changes *feedback-selection* semantics, which that widening still does not reach. R8 also does not name the numbers, which is the exact defect WM-45's own review raised against its R10 on a stacked branch.

**Options considered**:
- A) Bump both, name the numbers (`APP_RULES_VERSION` 6 to 7, `ENGINE_VERSION` `0.1.0` to `0.2.0`), and widen §7 a second time to cover feedback-selection semantics.
- B) Bump both and name the numbers, but leave §7 alone and justify the rules bump as "new rule-set content" (the two columns) rather than as a semantic change.
- C) Bump `ENGINE_VERSION` only. Treat the feedback additions as editorial under §7 and leave `APP_RULES_VERSION` alone.
- D) Bump `APP_RULES_VERSION` only, on the argument that the `Category` / `RuleSet` additions are inert cargo the engine never interprets.

**Decision**: **A** (R8, R8a, R8b). The rules bump is owed on the merits whatever §7 currently says, because §7's own stated purpose is that "dataset consumers can correlate session data with the rule-set version it was evaluated against", and this branch is exactly such a boundary. C is the option that leaves an analyst blind to it. A over B because §7 is now on its second consecutive story where the policy plainly should cover the case and does not, which is a sign the policy is written too narrowly rather than that these are exceptions; WM-45 already opens that file to widen it, so doing it properly once costs almost nothing. D rejected outright: inert to the engine is not absent from the API.

---

### RESOLVED: What `feedbackLevel` is logged when category 100's string is shown?
**Context**: R4b makes the top category's repeat feedback come from category 100 rather than from a Round 2/3 column, and R4c keeps `categoryId` at the sub-100 value. R7a logs a level, and neither requirement said what it is in that case.

Working it through surfaced a second ambiguity behind the first. R3 keeps a per-category level, R5 made level 3 terminal, and R6 falls back to the highest level that exists, but nothing said whether the *counter* stops or keeps climbing. As written it climbed, so a third click on the top category would log `feedbackLevel: 3` while showing the same string it showed at 2, and every middle category on 42, 45, 47 and 54 would log 2 and 3 while permanently showing level 1 (R6a). The logged level could therefore drift away from the string the student read, which defeats logging it at all.

**Options considered**:
- A) Log it as level 2, since it is the second thing shown for that category, and accept that the source is not distinguishable.
- B) Log a distinct sentinel level (e.g. `100`) so the category-100 path is visible in the data.
- C) Add a separate field naming the source (`source: "round2" | "round3" | "category100"`).

**Decision**: **C, plus a cap on the counter** (R5 amended, R7a, R7d). Two small changes that together make the logged value mean exactly one thing: the level never exceeds what exists for the category, and a `source` field names where the string came from. C over B because a sentinel of 100 breaks the field's `1 | 2 | 3` contract; C over A because the source survives the wording churn Sam has told us to expect, and a level number alone does not.
