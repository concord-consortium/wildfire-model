# Hazbot: level 2 and 3 feedback

**Jira**: https://concord-consortium.atlassian.net/browse/WM-46
**Repo**: https://github.com/concord-consortium/wildfire-model
**Implementation Spec**: [implementation.md](implementation.md)
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

56 populated cells in total, 28 in each column. Three patterns fall out of that table and each one is a requirement or a question below.

- **Category 1 never has a level 2 or 3.** On every tab, the "did not run the simulation" category is blank in both columns.
- **The top category has levels only on 23 and 24, and that is read as a fill-down artifact.** On 25, 32, 33, 34 and 35 the celebration row is blank in both columns; on 23 and 24 it is populated. Five tabs leaving it blank is taken as the authored intent, and the sheet's README assigns the after-success repeat click to category 100 (quoted below). **That blank-row count is the whole of the evidence, and one tempting extra argument does not hold**: on 23 and 24 the top row's Round 2 is byte-identical to the row above it, but adjacent-row duplication is ordinary in this column rather than a drag-fill signature. Measured run by run across the seven authored tabs, there are nine adjacent-duplicate runs, of which two (23 cat4=cat5, 24 cat4=cat5) **are the disputed cells themselves** and are therefore not offered as evidence, leaving seven among genuine middle categories: 24 cat2=cat3, 25 cat2=cat3, 25 cat4=cat5, 32 cat2=cat3, 32 cat4=cat5, 33 cat4=cat5, 35 cat2=cat3=cat4. Four of those seven sit above a **populated** row holding different text, so they cannot be a fill that ran one row too far: 24 cat2=cat3, 25 cat2=cat3, 32 cat2=cat3 and 35 cat2=cat3=cat4. (The other three, 25/32/33 cat4=cat5, sit above the blank celebration row, so they neither support nor undercut the reading.) Those four are the argument, and they are stronger than a count: each repeats the tab's **own investigation name** across adjacent categories, "Wind Investigation" on 24, "Mountain Investigation" on 25, "Vegetation Investigation" on 32, "Tree Survival Investigation" three rows running on 35. A drag-fill does not produce tab-specific meaningful text on four separate tabs, so duplication in this column is authorial reuse rather than a signature. The column reuses a small vocabulary: 28 cells, 9 distinct values (R2a). Resolved by R4b: the top category is served by category 100 instead, on every tab.
- **Four tabs have no columns at all**, so on 42, 45, 47 and 54 every category is level 1 only.

**The level 3 string is a single global constant.** All 28 Round 3 cells across all 7 tabs resolve to **one** distinct value: `"I'm all out of ideas! Please ask your teacher or a classmate for help!`. Note the stray leading double quote, which is in the cell and would ship verbatim. This matches Sam's scope-down: *"no more than three feedbacks given in total, with the last one being like 'please get help from teacher or friend?'"*.

**The Round 2/3 cells are not in the same format as the level 1 cells.** Column C always reads `Hazbot: <text>\n[Label]`. Of the 56 Round 2/3 cells, **zero** carry the `Hazbot:` prefix and **zero** carry a trailing `[Label]` action token. `parseFeedback` (`hazbot-button.tsx:48-54`) strips the prefix and extracts the token, so as authored these strings produce a body with an **empty label**. That is not a missing button: `:191` passes `doneBtnText: label || undefined` and the coachmarks library defaults it to `"Done"`, so the popover drops out of Hazbot's voice rather than losing its action. The sharper consequence is that the token does not gate the walk-through today: the tour launch is structural (`buildTour` returns a tour or null for the *category*), so a level 2 string would ship with the level 1 tour armed behind a `Done` button, with no way for anyone to say whether that is wanted. R4a makes the token the gate and R1a supplies it, which turns an accident into a decision. The decision taken is that level 2 does re-offer the walk-through and level 3 does not; see R4a and Question 4.

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
- **R1a.** Normalize the Round 2/3 cells at extraction, in `normalizeFeedback` (`extract-impl.js:177-179`), which already exists for this kind of fixup and today only collapses doubled `Hazbot:` prefixes. It gains four jobs: prepend `Hazbot: ` when the cell lacks it, strip a stray leading double quote, append a default action token when the cell carries none, and warn on a Round 2/3 token outside the authored set (per R4a). **The quote strip fires only on an unterminated leading quote**, i.e. when the cell holds an odd number of double quotes. That covers every real case (all 28 Round 3 cells carry exactly one) while leaving alone a cell that opens with a legitimate quoted phrase, which is a live risk rather than a hypothetical one: 12 of the 28 Round 2 cells already contain quotes, because the sheet names activity sections that way (`Go up and look at the instructions under "Drought Investigation" again.`). An unconditional strip would eventually ship a student-facing sentence with its opening quote silently removed, and nothing in the re-extract diff would distinguish that from an intended edit. **The default token is level-aware, which is what makes R4a's walk-through switch do anything.** A Round 2 cell with no token, on a category whose level-1 token is `[Show me]`, defaults to `[Show me]`, so that level re-offers the walk-through; every other case defaults to `[Okay]`, so Round 3 stays terminal on every category and Round 2 stays terminal on the non-coaching ones. Rationale in R4a, and it turns on one fact: **a blank token in a Round cell cannot be an authoring decision, because the convention does not exist yet.** R4a invents it in this spec, and R4a's own note records that this is the first place any code matches on token text, so there was no convention for an author to decline. The blank is an absence, not a choice. **Note a signature change**: `normalizeFeedback(s)` currently takes the string alone (`:177-179`), and a level-aware default needs the category's level-1 token, so the category builder normalizes column C first, reads its token, and passes it in when normalizing columns G and H. **Verified to be a no-op on existing content**: across all 11 tabs, zero committed level-1 feedback cells lack either the prefix or a trailing token, so a re-extract changes only the two new fields. The level-aware default is one line to reverse if Sam or Trudi wants terminal level 2s after all (Question 4).
- **R2.** The `Category` type (`src/hazbot/engine/types.ts:40-47`) gains the two fields as optional strings, named `feedbackRound2` and `feedbackRound3` (see Implementation anchors in Technical Notes). This is inert to the substrate: the engine parses only `expression` and never interprets `feedback`, so the added fields are string cargo and no rule-set test asserts feedback text.
- **R2a.** Both levels stay per-category sheet data, read the same way. Level 3 is not special-cased into a code constant even though it is provably one string today (all 28 Round 3 cells across all 7 tabs resolve to a single distinct value), and no test asserts that uniformity. Round 2 is the opposite case and is what makes the symmetry worth keeping: its 28 cells carry 9 distinct values, so that column is genuinely per-category content. Sam's own framing is that this wording is a "zero-th order approximation", so a guard against it changing would fire on legitimate authoring rather than on drift, and a code constant would put the one string that tells a stuck student to ask a person behind a developer. The 28 copies live in generated files, so the duplication costs nothing anyone maintains by hand.
- **R3.** Hold feedback-level state **per category** for the page session, as a map from category id to the highest level shown for that category (`UIModel.hazbotFeedbackLevels`; see Implementation anchors for the MobX constraints). Nothing the student does inside a run resets it: a category they return to resumes where it left off rather than replaying level 1. The single exception is Clear All (R3b). The category key is WM-45's `category_used`. This follows Sam's wording directly, *"for any category no more than three feedbacks given in total"*, where the operative word is total rather than consecutively, and it is the only policy that does not replay a hint the student has already read. Under WM-45 that matters more than it would have before: `category_used` tracks the last run or two instead of ratcheting to the best, so a student moving between categories and back is the normal case rather than an edge one.
- **R3a.** Advance the level **when the popover actually opens**, in the effect at `hazbot-button.tsx:122`, not in `handleClick` (`:242`). A click-site counter advances levels the student never sees. Verified in the running app: the Hazbot button carries no `disabled` state and nothing overlays it (`document.elementFromPoint` at the button's center returns the button's own label span while the popover is open), while the open effect is keyed on `[ui.showHazbotFeedback]` (`:240`) and that flag is a plain `@observable` boolean (`ui.ts:27`), so re-setting it to `true` notifies nothing. Two presses in a row therefore register two clicks, log two `HazbotButtonClicked` events, and show one unchanged popover. Without this rule a double-click walks a student from level 1 to "I'm all out of ideas! Please ask your teacher or a classmate for help!" with nothing read. The move is cheap because the key is already there: the same effect destructures `used` from `readCategories(engine)` at `:126`, so advancing at the display site is a map write rather than new plumbing. **Note what "opens" costs the student**: the level advances however the popover is dismissed, including × and Escape, and the intro's cancel route sets `introCancelled = true` (`:196`), which the tour launch at `:199` requires to be false. So a student who opens a coaching category's level 1 and closes it without activating `[Show me]` has spent that level. R1a's level-aware default is what keeps that from being terminal for the walk-through: their next press is level 2, which re-offers it. The third press does not, so the walk-through is reachable twice per category per session rather than once. That residual cost is accepted rather than overlooked, and a click-site counter would have the same failure plus the presses that displayed nothing. See R4a and Question 4, and R3a-i for where inside the effect the advance is actually committed.
- **R3a-i.** **"When it opens" is inside the deferred open, not at the top of the effect body**, and the two are different moments. The effect body runs on the `showHazbotFeedback` transition, but `openIntro` is deferred to the avatar's transform `transitionend` or the 400ms fallback (`:219-229`) and can be pre-empted by the teardown, which sets `cleanup = true` before either fires. Measured against the real component with coachmarks mocked, counting effect-body runs against `highlight` calls: a normal click gives 1 run and 1 open; a click followed by unmount inside the 400ms window gives **1 run and 0 opens**; the no-engine / empty-feedback branch (`:130-136`) gives **1 run and 0 opens** and resets the flag; a second press with the popover already open gives **0 additional runs and 0 additional opens** (which is R11d's case, and it confirms the effect key does not re-fire); and dismiss-then-click gives 2 runs and 2 opens. So an increment at the top of the effect spends a level on the two zero-open rows. **The split the implementation takes**: read the stored level and pick the string at the top of the effect, because `parseFeedback`, `buildTour` and `tourDoneLabel` all derive from the chosen string and are needed there; commit the `hazbotFeedbackLevels.set()` and the R7a `HazbotFeedbackShown` log inside `openOnce` (`:219-224`), which is guarded by its own `opened` flag and therefore runs exactly once per open. Nothing else in the effect moves.
- **R3b.** **Clear All clears the level map**, every category at once. This is the **bottom-bar** control (`data-testid="reload-button"`), labeled Reload today, which WM-47 renames to Clear All and moves left of Setup; Trudi has floated Reset as an alternative label, so the name is not final, but every candidate promises more clearing than the current behavior delivers. **This is a consistency fix rather than a new behavior.** The app has a second reload control, the top bar's refresh icon (`data-testid="reload"`, `top-bar.tsx:43`), and it **already clears the level map today**, for free: its handler calls `window.location.reload()` (`:28`), a real browser reload that takes the whole `ui` store with it. So without R3b the two controls disagree. Both log run-window-closing events, both read as "start over" to a student, and one silently preserves Hazbot's escalation while the other drops it. R3b makes them agree, and it is the only one of the two that needs code: the top-bar route gets it from the page reload. `simulation.reload()` (`simulation.ts:437`) is an in-model reset that touches the simulation only: it leaves the `ui` store alone, and `translate.ts:56-63` maps `SimulationReloaded` to a modifier that closes the run window rather than clearing readings, so `best` keeps ratcheting across it too. Without this rule a student can press Clear All, walk back through Terrain Setup, place fresh sparks, run, click Hazbot, and be told "I'm all out of ideas! Please ask your teacher or a classmate for help!" as the first thing they see after a full restart, with no way for the teacher to explain it and no way to clear it short of reloading the browser tab. WM-47 exists because PD reported mis-clicks on this control, so it is being pressed in classrooms. The Sam tension is real and accepted: a determined student can now exceed the three-per-category cap, at the price of redoing the whole activity each time, on a control the project is actively making harder to hit by accident. Restart is **not** a reset: it keeps sparks and terrain and is a within-activity action, so the escalation should survive it.
- **R4.** The feedback pick at `hazbot-button.tsx:129` becomes level-aware: level 1 uses `feedback`, level 2 uses the Round 2 string, level 3 uses the Round 3 string.
- **R4a.** The action token becomes the switch that offers the coach-mark walk-through. The intro's tour launch (`hazbot-button.tsx:199`) requires a tour from `buildTour` **and** a `[Show me]` token on the level's own text, rather than a tour alone. Without this, swapping only the string leaves the level-1 tour armed: measured on tab 23 category 2, a level 2 popover reads "Go up and look at the instructions under Drought Investigation again", shows a button reading `Done`, and launches the three-step Restart / Setup / Setup-panel walkthrough when it is clicked. **Verified behavior-preserving**: across all 11 tabs the 34 categories that `buildTour` returns a tour for are exactly the 34 whose level-1 token is `[Show me]`, with no mismatch in either direction. An author who wants a level to re-offer the walk-through types `[Show me]` into that cell, and one who wants it terminal types anything else or leaves it to R1a's default. **Measured, the sheet exercises neither**: 0 of the 56 populated Round 2/3 cells carry a bracket token, read through the same trailing-token regex `parseFeedback` uses. So the default decides the behavior for every category on every tab, which is why R1a's default is level-aware rather than fixed. **What ships: level 2 re-offers the walk-through on the 34 coaching categories, level 3 is terminal everywhere.** That is Sam's design note read literally (*"the coachmark re-offered with the level of insistence that reflects whether the user did/completed it previously"*), and it is safe to assume rather than ask because the blank cells carry no intent to override: the token convention for the Round columns is invented here, so there was nothing for an author to decline (R1a). **One consequence to look at rather than hide**: level 2 re-offers the *level-1* tour, since R7 keeps tours out of the level. On tab 23 category 2 that pairs a body reading "Go up and look at the instructions under Drought Investigation again" with a walk-through pointing at Restart, Setup and the Setup panel. **Measured, the mismatch is sharper than that example, and it is the sheet's most common Round 2 sentence.** 12 of the 28 Round 2 cells read "Go down and look at the questions you need to answer.", and 10 of those sit on `[Show me]` categories (33/4, 33/5, 32/4, 32/5, 35/6, 34/4, 25/4, 25/5, 23/4, 24/4), so the default hands each one a `[Show me]` button that launches a walk-through pointing **up** at the model controls while the body sends the student **down** the page. That is 10 of the 26 Round 2 cells the default gives `[Show me]` to; the other two "go down" cells are 23/5 and 24/5, which R4b discards anyway. The mechanism is working as specified; whether that pairing and that insistence are right is content judgment, and it is Question 4. **The comparison is on the parsed token, trimmed and lowercased**, so `[Show Me]` works too. This is the first place any code matches on token *text*: verified by grep, `hazbot-button.tsx` mentions `Show me` only in comments today, and the tour decision is currently structural (`buildTour` returns a tour or null), which is why the 34-for-34 correspondence holds without the code knowing the word. Since a near-miss (`[Show me how]`) would silently ship a terminal popover on a category that has a walk-through to offer, R1a's normalizer also warns at extraction when a Round 2/3 cell carries a bracket token outside the authored set (`Show me`, `Okay`, `Hooray!`, `Got it!`), next to the id-versus-marker warning that already lives there.
- **R4b.** Extract the category-100 row as **feedback-mechanism data**, in a new **optional** slot of its own on the rule-set, `RuleSet.repeatFeedback` (shape in Implementation anchors), and use it for every repeat click on the tab's top category. Level 1 on the top category stays the celebration; level 2 and beyond is category 100's string, terminal. This replaces the Round 2/3 columns for the top category on every tab. **"Top category" means the highest category id below 100 in the rule-set.** Category ids are contiguous `1..N` on all 11 tabs (23 and 24 top out at 5, 25/32/33 at 6, 34 at 5, 35 at 7, 42 at 3, 45 and 54 at 4, 47 at 5), and there is an independent signal that agrees on every tab: the top category is exactly the one whose level-1 token is `[Hooray!]` (measured over all 56 committed categories: `Okay` 11, all on category 1; `Show me` 34; `Hooray!` 11). The two rules agree today and could diverge under a future re-extract, so the id rule is the one that ships and the token is a cross-check, not the definition. **A third in-sheet signal exists and it disagrees on one tab.** Every category-100 row opens its pseudo-code cell with a narrative naming the category it follows (*"Category N was attained and the corresponding feedback was received, but the 'Hazbot Analysis' button was clicked again, unnecessarily"*). Measured across all 11 tabs, that N equals the highest category id on ten of them and disagrees on **tab 34**, which reads "Category 4" against a top category of 5. It is read as a copy-paste slip rather than a third rule: tab 34's category 5 is its `[Hooray!]` success row ("Great job! You're ready to answer the questions below."), its Round 2/3 columns stop at category 4 in exactly the blank-celebration pattern the other five authored tabs follow, and 45 and 54 genuinely do top out at 4 and carry the same sentence. Nothing ships from that cell either way, since R4b's slot keeps only the row's `id`, `studentAction` and `feedback`. It is recorded because it is the sheet's only prose statement of which category the repeat click follows, which is precisely what Question 1 asks Sam to confirm, and it is flagged to Trudi as a one-cell fix in Question 2. The slot is optional for the same reason R2's two fields are: `RuleSet` is hand-constructed in 17 places across the substrate's own tests, and a required field would break all of them and make this a breaking change rather than the additive one R8b bumps for. **This is the one requirement in the spec that a sheet edit cannot absorb.** It reads columns G and H on tabs 23 and 24 and deliberately discards them as a fill-down. The evidence is one fact, not two: five of the seven authored tabs leave the celebration row blank in both columns, and the README assigns the after-success repeat click to category 100. The byte-identity of the 23/24 top row with the row above it is **not** a second fact, since adjacent-row duplication is the norm in this column (seven runs among genuine middle categories, four of them repeating the tab's own investigation name above a populated row with different text; see Background). That one fact is strong but unconfirmed, and if Trudi disagrees it is a code change. See Question 1 for Trudi.
- **R4c.** Category 100 must **not** enter `categories`. Its rows carry `-- no pseudo code --` in the expression column, so a category-100 entry in `categories` would fail to parse and trip the rule-set load-validation gate. **Measured, and the consequence is worse than 'fails validation'**: injecting the real category-100 row into ruleset 25's `categories` and re-running the suite yields a `parse-error` and leaves the engine holding **zero readings**, so the activity classifies nothing at all rather than degrading to a lower category. There is no partial-failure mode here, which is what makes R11b a gate rather than a nicety. For the same reason it is a feedback selection rather than a category value: the sheet's README says a category at or above 100 "is to be identified with the maximum category value below 100", so `matchedCategory` and WM-45's `categoryUsed` keep logging the sub-100 category when category 100's text is shown. The extractor already identifies these rows: the id-versus-marker consistency warning at `extract-impl.js:78-84` runs immediately before the `if (id >= 100) continue` drop at `:85`.
- **R5.** Level 3 is terminal. A fourth and subsequent click on the same category keeps showing level 3. More precisely, **the level never rises above the highest level that exists for that category** (R6): the counter caps rather than climbing past what can be displayed, so the level and the string it names stay in step. Measured consequences: a fully populated category logs 1, 2, 3, 3; the top category logs 1, 2, 2 (R4b); a middle category on 42, 45, 47 or 54 logs 1, 1, 1 (R6a). Without the cap a third click on the top category would record level 3 while showing the same string it showed at level 2.
- **R6.** Where a level is absent, fall back to the highest level that exists for that category, and never blank. This covers category 1 on every tab and the middle categories on 42, 45, 47 and 54. The top category is no longer one of these cases: R4b gives it category 100.
- **R6a.** On 42, 45, 47 and 54 that fallback means level 1 repeats, and no global level 3 is substituted in. Only eight categories are affected once R4b takes the top category and category 1 is set aside (42 cat 2; 45 cats 2-3; 47 cats 2-4; 54 cats 2-3), and **every one of them carries a coach-mark walk-through**, so a repeat click re-offers actionable help rather than stalling. Substituting the global level 3 there would jump a student from level 1 straight to "I'm all out of ideas" on their second click, skipping the middle step on exactly the categories whose level 1 still has somewhere to go. If the columns are authored later it is a re-extract, not a code change.
- **R7.** **Text only.** The levels change the popover string. The coach-mark walk-through does not vary by level, and no level is threaded into `buildTour`. Confirmed with the product owner 2026-08-21. See Technical Notes for why this is the additive choice rather than a corner cut. Note that R4a still gives an author per-level control over *whether* the existing walk-through is offered, without per-level anchor arrays.
- **R7a.** Log the level on a **new** event emitted where the popover opens: `HazbotFeedbackShown { ruleSetId, categoryId, feedbackLevel, source }`, in the effect at `hazbot-button.tsx:122`. `HazbotButtonClicked` is left exactly as it is, so it stays a pure click count and no existing field changes meaning. `feedbackLevel` is the level of the string actually shown, capped per R5. `source` is `"level1" | "round2" | "round3" | "category100"` and names where the string came from. Document the new event in `LOGGED-EVENTS.md`, and **document there that `feedbackLevel` is not monotonic within a session**: R3b resets every category to level 1 on `SimulationReloaded`, and `TopBarReloadButtonClicked` does the same by ending the page session. Both events are already logged and already documented (`LOGGED-EVENTS.md:15-16`), so an analyst can segment on either, but nothing says they must. Without the note, `categoryId: 2, feedbackLevel: 3` followed later in one session by `categoryId: 2, feedbackLevel: 1` reads as corrupt data, which is the same trap WM-45 headed off with its documented note on `categoryId` rising above `matchedCategory`. While editing that file, note that its line 16 describes the bottom-bar control as "Reload", which WM-47 renames.
- **R7d.** `source` exists because `feedbackLevel` alone cannot identify the string. On the top category, `categoryId: 5, feedbackLevel: 2` means category 100 rather than a Round 2 column, but only to a reader who knows which category is the top for that ruleset and knows the fill-down was discounted, which is the out-of-band knowledge WM-45's data review added `rangeCc` to avoid. It is also the more durable of the two facts: Sam expects the wording to churn, so "which string did they read" stays answerable from the source plus the version long after a level number stops meaning anything specific. A sentinel level (for example `100`) was rejected because it breaks the field's `1 | 2 | 3` contract for every consumer and silently defeats any range check on it.
- **R7b.** The reason it is a new event rather than a field on the click: the click site and the display site are different moments and do not correspond one-to-one. `handleClick` (`:242`) runs before the effect decides anything, and a press while the popover is already open logs a click and displays nothing (measured; see R3a). Today `HazbotButtonClicked.categoryUsed` is a good enough proxy for what was shown, because one category means one string. Note that field and not `matchedCategory`: WM-45 pinned `matchedCategory` to `best`, which is precisely the value that can differ from what the student saw. This story ends that: after it, one category can produce three strings, and nothing in the log would say which the student read, on the feature whose entire subject is which of three strings a student reads, with wording that is expected to churn so the mapping is not reconstructible after the fact. Deriving the level downstream by counting same-category clicks is unsound for the same reason, since it over-counts by exactly the presses that displayed nothing.
- **R7c.** Keeping both series is a feature rather than redundancy, but the two are answered by two different queries and the distinction has to be written down or an analyst will compute the wrong one. **The gap between `HazbotButtonClicked` and `HazbotFeedbackShown` counts presses that opened no popover at all**, which is the double-press case in R3a and nothing else. Verified against the real component with coachmarks mocked: two presses with the popover open produce two `HazbotButtonClicked` events, one coachmarks engine and one `highlight` call. **A press that showed the student nothing new is a different thing and leaves no gap**, because a capped repeat still opens a popover and still emits `HazbotFeedbackShown`. It is measured by consecutive `HazbotFeedbackShown` events on the same `categoryId` carrying the same `feedbackLevel` and `source`. R5's own example is the fully populated case (1, 2, 3, 3, so the fourth click is a silent repeat with a zero gap); R6a is the starker one, where a middle category on 42, 45, 47 or 54 logs 1, 1, 1 across three clicks that all showed the same words. Together the two queries cover the behavior category 100 exists to answer (R4b), and neither is recorded today.
- **R7e.** Add `feedbackLevel` to the existing `HazbotShowMeClicked` payload (`{ ruleSetId, categoryId, stepCount }`, logged at `hazbot-button.tsx:155`), and document it in `LOGGED-EVENTS.md` the way `categoryId` was documented at `appRulesVersion` 6. This is a consequence of R1a's level-aware default rather than an independent nicety: today the tour can only launch from level 1, so the event is unambiguous; once level 2 re-offers it, the same category launches the same tour from two levels and nothing in the payload separates them. `HazbotTourCompleted` and `HazbotTourDismissed` take it too, since a completion rate is only interpretable against the level that offered the tour. All three are additive fields on existing events, so no existing series changes meaning (the WM-45 R9 constraint), and `feedbackLevel` here is the same capped value R7a logs.
- **R8.** Bump `APP_RULES_VERSION` from **6 to 7**, once for this branch. The 6 is WM-45's, inherited through the stack (`master` is at 4, WM-51 took it to 5, WM-45 to 6). Naming the numbers matters on a three-deep stack: without them a reviewer cannot tell whose bump is whose, and the version is the handle that lets a dataset consumer correlate a session with the rules that produced its feedback. This branch is the boundary between "one string per category" and "up to three", so an analyst who cannot see it will read two different strings for the same category as inconsistent data.
- **R8a.** Widen `docs/hazbot-update-workflow.md` §7 to cover **feedback-selection** semantics. As delivered by WM-45 it carries three bullets: editorial-only edits need no bump, semantic changes (new categories, new factor variables, expression structure changes, defaults-value changes that affect matching) do, and evaluation-semantics changes (how the existing expressions are evaluated) do. None of the three reaches *selection*, which of several strings is shown for a category that resolved the same way. R10 says this story changes no expression, factor variable or sim-prop, so on a literal reading §7 excludes it and R8 would assert a bump no policy authorizes. This is the second consecutive story where the honest answer is that the policy plainly should cover the case and does not, so fold the two into one statement rather than bolting on a third clause. Inherit the placement rule WM-45's bullet already carries while editing it: the bump belongs in the commit that changes the semantics rather than a later docs commit, because the repo deploys per-branch builds and a mid-branch state is reachable.
- **R8b.** Bump `ENGINE_VERSION` from **`0.1.0` to `0.2.0`**. `Category` and `RuleSet` are both exported from the substrate barrel (`src/hazbot/engine/index.ts:6`); R2 adds two optional fields to the first and R4b adds an optional slot to the second, and R4b's top-category rule adds a third additive item, the new barrel export `topCategoryId` (see Implementation anchors; it is shared rather than re-derived because the feedback selection, the dev sidebar and the playbook generator all have to agree on which category it names). All three are additive substrate API under the WM-10 policy (optional is what makes it additive: `RuleSet` is hand-constructed in 17 substrate test sites, and a required field would break every one and force a major bump) ("patch for fixes, minor for additive API, major for breaking changes"). The `0.1.0` is WM-45's, inherited through the stack. Note this is a *semver* judgment and does not contradict the sprint-24 finding that a `Category` field is not a substrate **stability-contract** change: the engine README's field-by-field rules cover `FactorVariableImpl` / `SimPropImpl`, not `Category`. Inert to the engine is not the same as absent from the API, and `engineVersion` rides in the `AnalysisEngineActivated` payload, so leaving it unchanged would show the same substrate version on both sides of a public type change.
- **R9.** Regenerate the derived artifacts that read category content: the validation playbooks (`node scripts/generate-hazbot-validation-playbook.js`) and the tour data (`scripts/generate-hazbot-tour-data.js`). The tour data must come back unchanged, since R7 leaves tours alone and R4a changes only whether an existing tour is offered, not its content. **The replay fixture is deliberately not on this list.** `scripts/generate-replay-fixture.js` writes only `readings`, `observed`, `temporalValues` and the three category histories; it never serializes the rule-set, so R2's two `Category` fields and R4b's `RuleSet` slot structurally cannot reach it. Verified by spiking that exact field shape onto ruleset 25, the tab the fixture replays: `replay-fixture.test.ts` passes unregenerated, and regenerating produces a diff in which **every** changed line is a `sessionId` line, which the test strips from both sides anyway (`replay-fixture.test.ts:29-32`). The fixture's README sets a failure-driven policy (regenerate "when `replay-fixture.test.ts` fails because behavior intentionally changed") and names the diff as the review surface for semantic drift, so a gratuitous regeneration spends that surface on noise. If the fixture does fail on this branch, the first thing to suspect is R4c leaking rather than a stale fixture: `deriveRangeCc(categoryExpressions(engine))` is the only path from category content into the fixture, and R10 leaves every expression alone.
- **R9a.** Teach the playbook generator the new levels. `playbook-impl.js:26` emits a single `- **Feedback**: <level 1 text>` line per category and knows nothing about the Round columns, so a regenerate alone would leave the playbooks unchanged and therefore stale: `docs/hazbot-validation/23.md` is the surface a validation walker follows, and it would show one of up to three strings with no mention of category 100. Emit the Round 2 and Round 3 strings and the category-100 line alongside the existing Feedback line, then regenerate. Without this the feature cannot be validated by the documented process, which is the same failure WM-45's R14a fixed for its own walk guidance. **Label the top category's Round rows as unreachable rather than presenting them as levels a student can get to.** R4b discards that row's Round 2/3 content while the extractor still emits it faithfully, so on tabs 23 and 24 (four cells, the only two tabs where the row is populated) an unlabeled playbook would assert two strings nobody can reach, formatted identically to the real ones on the categories above. The top category's rows read `Feedback (level 2, not shown)` / `(level 3, not shown)` with a note that the repeat-click line supersedes them; every other category's rows are unlabeled. Same rule in the sidebar, per R9d.
- **R9b.** Surface the feedback level in the dev sidebar. Without it the only way to check a level in the browser is to click three times and read the popover, which is also the only way to notice that a press displayed nothing (R3a), so a walker cannot tell a capped level from a press that never opened. R9a makes the playbooks list the strings and R9d makes the sidebar's per-category panel list them; this makes the running app say which one the student is on. **Route it through the existing host-supplied `diagnostics` prop** (`SidebarDiagnostic { label, value, status? }`, passed from `app.tsx:137` via `buildPresetDiagnostics`), not through new substrate API: the level lives in the UI store rather than in the engine (see Technical Notes), so the substrate cannot read it and has no business knowing what a feedback level is. That keeps R8b's bump to the additions it already names and adds nothing to it. **Two consequences of that route, both deliberate.** First, the readout lands in the sidebar's **Diagnostics** section, which renders at `sidebar.tsx:58-79`, above the errors panel and above the Category block at `:90-110`. It is not adjacent to `used` and cannot be made so without editing the substrate component, which is the thing this requirement is avoiding; the Category block is a few rows below and a walker reads the two together. Second, **the content is UI-store state only**: the level map itself, rendered compactly (e.g. `levels: 2→3, 5→1`), plus the level and `source` last displayed (R7a). Not "the level for the current `used` category", which would need an engine value inside `AppComponent` (`app.tsx:44`), a MobX `observer` over the stores that never calls `useAnalysisEngine` and so does not re-render on engine changes. It would appear to work, since App reads `simulation.time` at `:85` and therefore re-renders constantly during a run, but a readout whose job is telling a walker what the next click will show should not depend on that. Showing the whole map is also the more useful readout: it covers every category the student has touched rather than only the current one. **The empty map is a rendered state, not an absent one**: the readout emits a `Feedback levels: (none)` row rather than nothing, so the level half always contributes at least one row. On a Hazbot page the map always has a meaningful value, and "nothing shown yet, the next click is level 1 everywhere" is the state a walker most needs to read, immediately after R9c's reset helper. The deciding case is that reset rather than first render: without the zero-state row, calling `resetHazbotFeedbackLevels()` on a URL with no `?preset` makes the entire Diagnostics section disappear, which is indistinguishable from a broken sidebar on the surface whose whole job is telling a walker what the next click will show. R9b-i qualifies the `buildPresetDiagnostics` route named above: the level half cannot ride on that function's return value.
- **R9b-i.** **The level readout must not ride on `buildPresetDiagnostics`'s return value, or it disappears on every URL without `?preset`.** That function returns `undefined` when there is no requested preset (`engine-singleton.ts:131-150` returns `undefined` from `getRequestedPresetInfo()`, and `:178-188` passes that straight through), and the sidebar renders the section only under `diagnostics && diagnostics.length > 0` (`sidebar.tsx:58`), so both an `undefined` and an empty array render nothing at all. **Measured live against the dev server**: `?hazbotRules=23&hazbotSidebar=true` renders the section titles Category, Categories, Factor Variables, Temporal Variables, Sim Props and Readings, with **no Diagnostics section**; adding `preset=plainsTwoZone` makes it appear with the requested-preset row. R9c's whole point is a walker who can check every category in one page load, and none of the Hazbot URLs in `CLAUDE.md` is required to carry a preset, so leaving this implicit would ship a readout that is missing exactly when someone goes looking for it. So the array handed to `Sidebar` is built from the preset diagnostic **and** the level readout, with either half able to be absent: `buildPresetDiagnostics` keeps its current signature and stays pure, and the composition happens at the `app.tsx:137` call site (a second builder taking the level map, concatenated, with `undefined` when both halves are empty so an activity with neither still renders no section). **Note what R9b's zero-state row does to that last clause**: since the level half always returns at least one row, "both halves empty" is unreachable on a real Hazbot page, and the composition's `undefined` branch survives only as the contract for a host that supplies neither, which is the shape `app.test.tsx` drives through its barrel mock. Keep the branch, because the guard is what stops an empty array rendering an empty section, but read R11i's second case as pinning that contract rather than a state a walker can reach. Do not widen `buildPresetDiagnostics` to take the level map: it is unit-tested as a pure preset mapping (`engine-singleton.test.ts:163-175`) and the two diagnostics have nothing to do with each other.
- **R9c.** Expose `window.test.resetHazbotFeedbackLevels()` alongside the existing helpers in `src/models/stores.ts`, and document it in `CLAUDE.md` with the others. **This costs a small reordering, not just one more function.** `createStores()` builds `new SimulationModel()` at `:28`, assigns `window.test = createTestHelpers(simulation)` at `:33`, and only constructs `new UIModel()` at `:36`, inside the returned object literal. `createTestHelpers` takes `simulation` alone (`:43`), so as ordered today it cannot see the store holding the level map. Hoist the `UIModel` construction above the `window.test` assignment and pass it in. R3b needs no such change: `bottom-bar.tsx`'s `handleReload` already has `ui` in scope at `:348`. R3b gives the walker one in-app reset route, but Clear All is a whole-activity reset that also clears sparks and forces a walk back through Terrain Setup, and it clears every category at once. Checking level 3 on each of the 34 coaching categories through Clear All alone would mean 34 re-setups, and there is no way to reset one category and leave the rest, which is what a walker stepping through a playbook actually wants. The `window.test.*` helpers exist for exactly this kind of Playwright walk, so this is one function on a pattern the repo already documents.
- **R9d.** Render the new strings in the dev sidebar's **per-category detail** panel (`src/hazbot/engine/sidebar/sidebar.tsx:255`), beside the `Feedback:` row that already renders `cat.feedback` there. Without this the panel keeps showing one of up to three strings with nothing to say the other two exist, which is the same staleness R9a fixes for `docs/hazbot-validation/*.md`, on the surface a walker actually has open while clicking. R9b is not a substitute: it puts the *level* in the Diagnostics section, not the text the level names. Show the Round 2 and Round 3 strings as sibling rows to `Feedback:`, omitted when the category carries none, and show category 100's string once per rule-set rather than once per category, since it is rule-set data under R4b rather than category data. Label the top category's two rows `not shown` exactly as R9a does for the playbooks, with a muted line beneath saying the rule-set's repeat feedback is used instead; the rule-set row renders after the category rows, which is where it sits in the ladder. Both surfaces read the top category from the same shared helper (see Implementation anchors), so they cannot disagree with the selection about which category is labeled. This is inside the substrate's own sidebar component, which already reads `cat.feedback`, so it adds nothing to R8b's bump beyond the three additions that requirement already names.
- **R10.** No change to any category expression, factor variable or sim-prop. This story adds feedback strings and a selection rule.
- **R11.** Pin the behavior with unit tests, not only with regenerated artifacts. The selection rule is pure logic with no on-screen symptom when it drifts: a category that logs `feedbackLevel: 3` while displaying level 1 text looks correct to anyone watching and is wrong only in the dataset, which is the half of this story nobody is looking at while they click. WM-45 carries seven explicit testing requirements for the same reason, several of them written because a spiked implementation passed while being wrong.
- **R11a.** `extract-impl.test.js`: `normalizeFeedback`'s four new jobs (including the level-aware default token, all three branches: a tokenless Round 2 cell on a `[Show me]` category gets `[Show me]`, the same cell on a non-coaching category gets `[Okay]`, and a Round 3 cell always gets `[Okay]`) and the new token warning, each with a case proving it is a no-op on a well-formed column C cell. The measured baseline is the assertion to write against: across all 11 tabs, zero committed level-1 cells lack the `Hazbot:` prefix, zero lack a trailing token, and zero begin with a double quote.
- **R11b.** The category-100 extraction is pinned in **two places, because one file cannot carry both halves**. `extract-impl.test.js` is driven entirely by `SYNTHETIC_SHEETS` (`:12-40`), a hand-written fixture tab; it never reads a workbook and never imports the committed rule-sets, so it can prove the *mechanism* and nothing about a corpus. Its existing `id >= 100` tests (`:84-121`) are already scoped that way.
  - **Mechanism, in `extract-impl.test.js`** on synthetic rows, both directions: a category-100 row lands in the new `RuleSet` slot, and it does not land in `categories`. Both matter separately, since the current code satisfies the second by dropping the row entirely and R4b is what stops doing that.
  - **Corpus, in `src/hazbot/rule-sets/index.test.ts`**, which already imports `ruleSets` and loops all 11 by name (`:50-55`): every committed rule-set carries a category-100 slot, and no committed `categories` array holds an id >= 100. Placed there it is a re-extraction regression gate rather than a unit test, which is what R4c's blast radius calls for: a leak takes the rule-set to zero readings, so this is the difference between a red suite and an activity that silently records nothing.
- **R11c.** `hazbot-button.test.tsx`: the level ladder, driven through the existing `mockSelection` shape. Four cases, one per branch the requirements name: a fully populated category walks 1, 2, 3, 3 (R5); the top category walks 1, 2, 2 with `source: "category100"` (R4b); a middle category on a tab with no Round columns walks 1, 1, 1 (R6a); and a category left and returned to resumes where it stopped rather than replaying level 1 (R3).
- **R11d.** `hazbot-button.test.tsx`: the level advances on display, not on click (R3a). The case is a press while the popover is already open, which must log a second `HazbotButtonClicked` and neither advance the level nor emit a second `HazbotFeedbackShown`. Measured against the real component with coachmarks mocked: two presses give two click events, one coachmarks engine and one `highlight` call.
- **R11e.** Assert the R5 cap directly: the logged `feedbackLevel` never exceeds the number of strings that exist for that category. This is the invariant that keeps `feedbackLevel` and `source` naming the same string, and it is the one with no visible failure mode.
- **R11f.** `playbook-impl.test.js`: the new Round 2, Round 3 and category-100 lines render, including the negative case of a tab with no Round columns, where only the category-100 line is added, and R9a's labeling in both directions: a middle category renders `Feedback (level 2)` while the top category renders `Feedback (level 2, not shown)` with the superseded note. The labeling case has no other guard, since only tabs 23 and 24 exercise it and a regression there would show as a plausible-looking playbook line.
- **R11g.** `hazbot-button.test.tsx`: R4a's token gate, which is the rule that decides whether a level re-offers the coach-mark walk-through and the first place any code matches on token *text*. The existing tour block (`:308-437`) gates entirely on `buildTour` returning a tour or null, so none of its six tests reaches the new branch. Four cases against what R1a's level-aware default actually produces: a coaching category launches the tour at level 1 (the 34-for-34 correspondence, turned from a measurement in prose into a regression test) **and** at level 2 (R1a's default in its `[Show me]` branch); the same category does **not** launch at level 3, whose default is `[Okay]`; and `[Show Me]` launches, pinning the trimmed, lowercased comparison. The negative case has no on-screen symptom (the body text is correct and only the button label differs), which is why it needs a test rather than a walk.
- **R11h.** `src/hazbot/engine/sidebar/sidebar.test.tsx`: the two dev-sidebar readouts, scoped to their **rendering contract only**. R9d's rows in the per-category detail panel (present when the category carries Round 2/3 content, absent rather than empty when it does not, labeled `not shown` on the top category and unlabeled elsewhere, category 100 rendered once per rule-set) and R9b's diagnostic line, including its `(none)` zero state. Both have homes in that file already: `:60` covers the expanded detail panel and `:463-520` is a diagnostics-slot block covering the rendered and the absent case. The negative case is the same one R11f names for the playbooks, and it is the common case rather than the edge: most categories on the seven authored tabs carry no Round content, and no category on 42, 45, 47 or 54 does. The level *arithmetic* stays out of this test, since R11c and R11e already pin it against the component that computes it.
- **R11i.** Pin R9b-i where the composition actually lives, which is not `sidebar.test.tsx`: the substrate sidebar only ever sees the finished array, so a test there cannot tell a level readout that survives a missing preset from one that does not. The case is that with no requested preset the array handed to `Sidebar` still carries the level readout, and that with neither half present it is `undefined` rather than `[]`, so the section stays absent. `src/components/app.test.tsx` already mocks `buildPresetDiagnostics` (`:49`) and is the file that renders the composition; `engine-singleton.test.ts:163-175` covers the preset half on its own and needs no change. This is the R9b half with a measured failure mode rather than a hypothetical one, so it is worth the one test.

## Technical Notes

**Implementation anchors.** The names below are referenced descriptively by R2, R4, R4b, R9a, R9b, R9c, R9d and five R11 entries, and they have to match across the type, the emitter, the playbook generator, the sidebar, the button and the tests. They are fixed here so a clean session does not have to invent them six times.

```ts
// src/hazbot/engine/types.ts, Category (R2), both optional
feedbackRound2?: string;   // sheet column G, "Notes for Round 2"
feedbackRound3?: string;   // sheet column H, "Notes for Round 3"

// src/hazbot/engine/types.ts, RuleSet (R4b), optional
repeatFeedback?: { id: number; studentAction: string; feedback: string };
// the category-100 row. `id` is kept so R11b can assert it and R9d can show which row
// it came from; the slot is named for what it is for, since "category 100" is a sheet detail.

// src/models/ui.ts, UIModel (R3)
@observable public hazbotFeedbackLevels = new Map<number, number>();
// category id -> highest level shown. Cleared wholesale by R3b and R9c.

// src/models/ui.ts, UIModel (R9b), optional
@observable public hazbotLastFeedbackShown?: { level: number; source: string } = undefined;
// the level and source last displayed, written at the same site that commits the level
// (R3a-i) and read only by the dev sidebar's diagnostic. Cleared alongside the map by
// R3b and R9c, so the readout never outlives the state it describes.

// src/hazbot/engine/top-category.ts, new substrate module, exported from the barrel
export function topCategoryId(ruleSet: Pick<RuleSet, "categories"> | undefined): number | null;
// R4b's "top category" rule, in one place because three consumers must agree on it: the
// feedback selection, the dev sidebar's superseded-row labeling, and the playbook
// generator's repeat-click line. Takes `Pick<…, "categories">` so the sidebar can pass the
// array it already holds. Counted by R8b as additive substrate API.
```

Two notes on `hazbotFeedbackLevels`, because `UIModel` has no collection precedent (every existing `@observable` there is a primitive). MobX 6 deep-converts a `Map` assigned to an `@observable` field into an `ObservableMap`, so `.set()` is tracked and R9b's readout re-renders; a plain object or a module-level `Map` would give a working feature with a dead readout. And `configure({ enforceActions: "never" })` (`src/index.tsx:11`, same in `setupTests.ts`) means it is mutated directly with no `@action` wrapper, matching how `ui.showHazbotFeedback` is already written in `handleClick`.

**Source workbook and how to regenerate.** The authoritative export is `/home/doug/Downloads/Wildfire Hazbot Feedback Tables (8).xlsx`. The full path matters: that directory holds around twenty files matching the same name pattern, `(1)` through `(8)` plus five dated exports, and picking a different one yields a plausible extraction with different content, which would surface as the byte-for-byte check below failing for what looks like a code reason.

```sh
node scripts/extract-hazbot-sheets.js "/home/doug/Downloads/Wildfire Hazbot Feedback Tables (8).xlsx"
node scripts/generate-hazbot-validation-playbook.js
node scripts/generate-hazbot-tour-data.js      # must come back unchanged, per R9
```

The extractor writes in place over `src/hazbot/rule-sets`, so `git diff` is the sheet diff. See `docs/hazbot-update-workflow.md` §1, and R9 for which artifacts are and are not regenerated.

**The extraction base is clean, re-verified on this branch 2026-08-22.** Re-extracting `Wildfire Hazbot Feedback Tables (8).xlsx` into a scratch directory and diffing against `src/hazbot/rule-sets` produces **no differences in any generated file**, and `dsl-grammar.md` comes back identical too. So WM-51's extraction is current with the authoritative workbook and the only diff this story's re-extract should produce is the two new fields. The extras in that folder are all hand-maintained and none of them is extractor output: `.eslintrc.js`, `test-helpers.ts`, `__fixtures__`, `index.test.ts`, the 11 per-tab `NN.test.ts` files, and WM-45's `current-category-regression.test.ts` / `current-category-sweep.test.ts`. (An earlier draft of this paragraph named only the first two, which was written before WM-45 added the rest.)

**Both derived-artifact generators are idempotent on the current tree**, measured the same day: `generate-hazbot-tour-data.js` and `generate-hazbot-validation-playbook.js` each rewrite their outputs with no resulting `git diff`. That is what gives R9's "the tour data must come back unchanged" something real to fail against; without the baseline the check could pass for the wrong reason.

**Why text-only is additive rather than a corner cut.** Varying the walk-through per level would need per-level anchor arrays: `buildTour` returns null when `anchors.length !== data.steps.length` (`build-tour.ts:28`) and the `tour-map.tsx` anchors are hand-authored per category. Keeping the level out of `buildTour` entirely means a later per-level tour is an addition rather than a rewrite. It also keeps this story's diff off the lines WM-32 (Aug 25) and WM-31 (Aug 26) touch, both of which work in `hazbot-button.tsx` around the effect at `:115` and the teardown and logging routes.

**One diff overlap that is not avoidable: `bottom-bar.tsx`.** R3b hangs the level-map clear off `handleReload` (`:338-351`), and WM-47 is relabeling that same button, moving it left of Setup, and may rename its `reload-button` data-testid. If it does, the rename has to land in `tour-map.tsx` in lockstep, because `tour-map.test.ts` asserts that every testid a factory can emit is in the canonical list, and the 42/2, 45/2 and 47/2 entries anchor to it. R3b is one line and does not depend on the label or the testid, so whichever story lands second rebases it; worth a word to Michael rather than a coordination requirement.

**The button's test file changed shape under WM-45.** `hazbot-button.test.tsx` now mocks `computeCategorySelectionForEngine` and drives it through `mockSelection`, which returns `{ best, current, used, label }` rather than the bare category number the old `mockMatched` returned. WM-45 converted nine `mockReturnValue` sites for it (14 of the file's 24 tests moved), so any level case added here uses that shape from the start.

**Terminal PR in the stack, which is what makes the assumed answers cheap.** This branch sits on WM-45, which sits on WM-51, and nothing is stacked on it. Every assumption recorded in the questions section can therefore be revised in place without rebasing a dependent branch, which is why the branch ships its best answer to each open question rather than a fallback.

**This is not one PR.** The level 2/3 wording is provisional and the PIs will test it, so expect the strings to churn after the first pass. Build the text as swappable sheet data and do not bake level semantics into code beyond "levels 1 to 3, the third is terminal".

**Where the click state cannot live.** See Background. The readings stream is deliberately click-free, so the counter belongs in the UI store or in module state alongside the existing `ui.showHazbotFeedback` / `ui.hazbotPulseArmed` flags, not in the engine.

**One student-facing consumer, and it already holds the key.** `hazbot-button.tsx:129` (`engine?.ruleSet?.categories.find((c) => c.id === matched)?.feedback ?? ""`) is the only place category feedback is read for display **to a student**. It is not the only display site: grep over `src/` and `scripts/`, excluding tests and the generated rule-sets, finds four readers of `cat.feedback`, of which two display it (`hazbot-button.tsx:129` and the dev sidebar's per-category detail panel at `src/hazbot/engine/sidebar/sidebar.tsx:255`) and two are pipeline (`playbook-impl.js:26`, covered by R9a; `extract-impl.js:90` and `:206`). The sidebar site is R9d. Since WM-45, `matched` there is `used`, destructured at `:126` from the `CategorySelection` that `readCategories` returns, so the per-category key R3 counts against is in hand at the display site with no extra call and no second copy of the selection rule.

## Questions to confirm on the branch build

**Every one of these is already answered in the build.** Neither Sam nor Trudi was reachable when this
branch was cut (2026-08-22, a Saturday; Trudi is on vacation the week of 2026-08-21), and waiting would
have delivered nothing to look at. So each question ships its most defensible answer rather than a
conservative fallback, and the question becomes "here is what it does, is that right" instead of "what
should it do". **This is the terminal PR in the WM-51 to WM-45 to WM-46 stack**, so any of these can be
revised in place without rebasing a dependent branch.

| # | Owner | What shipped | Cost if the answer differs |
|---|---|---|---|
| 1 | Sam | Top category's repeat click uses category 100; 23/24's G6/H6 discarded as a fill-down (R4b) | **Code change.** The only one. |
| 2 | Trudi | "Supression" misspelling ships verbatim; stray `"` stripped (R1a); tab 34's category-100 narrative names the wrong category | Re-import, two cells |
| 3 | Trudi | 42, 45, 47 and 54 repeat level 1 on their middle categories (R6a) | Re-import |
| 4 | Sam | Level 2 re-offers the coach-mark walk-through; level 3 terminal (R1a, R4a) | One line |

Questions 1 and 4 are rules-and-feedback semantics, which is Sam's, and both are answerable from
documents he already wrote (the sheet README for 1, his design note for 4) without running anything.
2 and 3 are authoring content, which is Trudi's, and both are absorbed by a re-import whenever she gets
to them. Neither is waiting on the other.

**1. For Sam. The one that could cost a rebuild: did Round 2 and Round 3 fill down one row too far on tabs 23 and 24?**

**Shipped answer: yes, treated as a fill-down.** R4b routes every top-category repeat click to category 100 on all 11 tabs and ignores columns G and H on that row. This was already the spec's decision before the branch was cut; the conservative alternative (honor G and H where they exist, which is only 23 and 24) was rejected on the merits.

This is the single place where this spec deliberately ignores content that is in the sheet. Everywhere else the sheet is authoritative: the Round strings are read as authored (R2a), a `[Show me]` typed into a cell decides whether that level re-offers the walk-through (R4a), and missing columns simply mean level 1 repeats (R6a). All of that absorbs a later edit through a re-import with no code change. **R4b does not.** It routes every repeat click on a tab's top category to category 100 regardless of what columns G and H hold, so on tabs 23 and 24 it reads authored cells and discards them.

The cells, in `Wildfire Hazbot Feedback Tables`:

| Tab | Top category | Its Round 2 / Round 3 cells |
|---|---|---|
| 23 | 5 | **G6**, **H6** populated |
| 24 | 5 | **G6**, **H6** populated |
| 25 | 6 | G7, H7 empty |
| 32 | 6 | G7, H7 empty |
| 33 | 6 | G7, H7 empty |
| 34 | 5 | G6, H6 empty |
| 35 | 7 | G8, H8 empty |

Five of the seven tabs stop the Round 2/3 notes at the second-to-last category and leave the celebration row blank. Tabs 23 and 24 continue one row onto it. That, plus the README (*"any category >= 100 ... an example of such a spurious non-simulation action is a repeated unnecessary clicking of the 'Hazbot Analysis' button after the feedback for the sub-100 maximum category value was received"*), is why R4b treats those four cells as a drag-fill.

Worth stating what is *not* being offered as evidence, so the question is a fair one. The 23/24 top-row Round 2 duplicates the row above it exactly, which looks like a drag-fill until the rest of the column is measured. Adjacent rows carrying identical text happens seven times among genuine middle categories, and on four of those the run sits above a populated row holding different text, so it cannot be a fill that ran one row too far: 24 cat2=cat3, 25 cat2=cat3, 32 cat2=cat3 and 35 cat2=cat3=cat4. Each of those four repeats the tab's own investigation name ("Wind Investigation", "Mountain Investigation", "Vegetation Investigation", "Tree Survival Investigation"), which a drag-fill cannot produce on four separate tabs, so duplication here is how this column normally reads rather than a tell. Note explicitly that the two 23/24 cat4=cat5 runs are **not** counted among those seven: they are the cells this question is about, and using them as evidence would be circular. The case rests on the five blank celebration rows and the README, and nothing else.

**What to have her check on the branch build**: on tab 23, reach category 5 (correct zone setup plus one spark per zone, run), then click Hazbot twice. The second message should be *"Great job on this investigation! Keep working through the activity!"*. If she expected *"Go down and look at the questions you need to answer."* and then *"I'm all out of ideas! Please ask your teacher or a classmate for help!"*, then R4b is wrong and it is a code change rather than a sheet edit.

If she confirms the fill-down, the tidy-up is clearing G6 and H6 on tabs 23 and 24, which changes no behavior since R4b already ignores them.

**2. For Trudi. Three source typos, one of which ships to students.**

**Shipped answer: the stray quote is stripped, the misspelling is not.** This is the one place the
branch deliberately keeps the conservative behavior, and the reason is an invariant rather than
caution.

The first is cosmetic in the pipeline: **every Round 3 cell begins with a stray `"` character**, all 28 of them, one per authored category across the 7 tabs. R1a strips it so nothing ships with it, but it is a typo at source.

The second is not stripped by anything. One **Round 2** cell, on **tab 33 category 2**, reads `Go up and look at the instructions under "Fire Supression Investigation" again.` ("Supression" for "Suppression"). Verified that the misspelling appears in no committed level-1 feedback string, so it is new student-facing content this story introduces, and it would render verbatim in a level 2 popover. It is not patched in the pipeline, and our copy of the workbook is not edited either. Technical Notes records that re-extracting `Wildfire Hazbot Feedback Tables (8).xlsx` reproduces the committed rule-sets byte for byte; editing a cell to fix one word would trade that invariant for a silent divergence between what is committed and what the sheet says, and her next export would reintroduce the typo regardless. A spelling patch inside `normalizeFeedback` is worse: it is content, not format, and it would be a rule nobody remembers is there. So the fix belongs in her copy, and it is a one-cell re-import. The 28 Round 2 cells are otherwise clean: no leading quote, and 9 distinct values across them.

The third is outside the Round columns and reaches nothing student-facing. Each tab's category-100 row opens its pseudo-code cell with *"Category N was attained…"*, and on **tab 34** that N is 4 where the tab's success category is 5 (its `[Hooray!]` row). Ten of the eleven tabs name the right category, and 45 and 54 genuinely do top out at 4, so it reads as a copy-paste rather than an intent. Nothing ships from it: R4b's slot keeps only the row's `id`, `studentAction` and `feedback`, and the pseudo-code column is not extracted for that row at all. It is worth her fixing anyway, because it is the sheet's only prose statement of which category the repeat click follows, and that is exactly what Question 1 asks Sam to confirm. See R4b.

**3. For Trudi. Tabs 42, 45, 47 and 54 have no Round 2/3 columns at all.** **Shipped answer: level 1 repeats there, and no global level 3 is substituted in (R6a).** The alternative was rejected on the merits rather than deferred: substituting the global level 3 would jump a student from level 1 straight to "I'm all out of ideas" on their second click, on the eight categories whose level 1 still carries a working walk-through. Eight middle categories are affected, so this is a content gap rather than a defect. Worth confirming it was an unfinished pass rather than a decision. One detail suggests not: tab 45 groups with the seven authored tabs on its category-100 text ("Great job on this investigation!") but with the unauthored four on its Round columns, which reads as an unfinished pass. If she fills them in, it is a re-import, not a code change.

**4. For Sam. Is level 2 re-offering the coach-mark walk-through the right insistence, and is the pairing right?**

**Shipped answer: yes, it re-offers.** Your design note says level 2 is where "the coachmark [is] re-offered with the level of insistence that reflects whether the user did/completed it previously". R4a builds that switch: a level offers the walk-through when its own text ends in `[Show me]`. No Round 2 cell carries a token (0 of 56, measured), so the switch is decided entirely by R1a's default, and that default is level-aware: a tokenless Round 2 cell on a coaching category defaults to `[Show me]`, everything else to `[Okay]`.

Assumed rather than asked because the blank cells cannot mean "no". The token convention for the Round columns is invented in this spec, so there was nothing for an author to decline. Reversing it is one line in `normalizeFeedback`.

What it buys, beyond matching the design note: R3a advances the level whenever the popover opens, however it is dismissed. Without the re-offer, a student who pressed Hazbot and closed the popover with × or Escape had spent their only shot at that category's walk-through for the session. With it, the walk-through is reachable twice per category rather than once, and level 3 still ends at "ask your teacher or a classmate".

**The two things to actually judge on the build**, both content rather than mechanism:

1. **The pairing, and it is worse on the sheet's most common Round 2 sentence than on the example above.** Level 2 re-offers the *level-1* tour, because R7 deliberately keeps tours out of the level. On tab 23 category 2 that means a body reading "Go up and look at the instructions under "Drought Investigation" again" over a button reading `Show me` that walks Restart, Setup and the Setup panel: the text points up the page and the tour points at the model controls, which are at least in the same direction. **The sharper case is measured.** 12 of the 28 Round 2 cells read "Go down and look at the questions you need to answer.", and 10 of them sit on `[Show me]` categories (33/4, 33/5, 32/4, 32/5, 35/6, 34/4, 25/4, 25/5, 23/4, 24/4), which is 10 of the 26 cells the default gives `[Show me]` to. On every one of those the body sends the student **down** to the questions and the button launches a walk-through pointing **up** at the model controls. That is not a judgment about insistence; it is the text and the tour pointing in opposite directions.
2. **The insistence.** Level 2 currently offers the identical walk-through with an identical button, so "more insistent" is not yet expressed anywhere. If insistence should be visible, say what it looks like.

**Three ways this can land, and the cheapest is the one the measurement points at.** (a) Confirm as shipped: every level 2 re-offers the walk-through, no change anywhere. (b) Reverse globally: level 2 never re-offers, which is one line in `normalizeFeedback` (R1a's default becomes a fixed `[Okay]`) and gives up the re-offer Sam's design note asks for. (c) **Decide it per cell, which is a sheet edit and no code at all.** R4a already makes an authored token win over the default, so typing `[Okay]` into the 10 "go down and look at the questions" cells makes those levels terminal while the "go up and look at the instructions / model hint" cells keep `[Show me]`. That splits along exactly the line the mismatch falls on, and it is the option R4a was built to allow. A fourth reading, that the level 2 text should have its own walk-through rather than borrowing level 1's, is WM-32 territory and a much larger change.

**How to see it**: tab 23, reach category 2 by running without changing the Setup, then press Hazbot three times. Press 1 is "Looks like you haven't changed the **Setup** yet. I can help!" with `Show me`. Press 2 is the Round 2 text, also with `Show me`. Press 3 is "I'm all out of ideas! Please ask your teacher or a classmate for help!" with `Okay` and no walk-through.

**Not done, deliberately**: nothing was typed into the workbook. If you confirm the behavior, the tidy-up is optional, since R1a's default already produces it; if you want it explicit in the sheet, it is `[Show me]` appended to the 26 Round 2 cells that sit on a coaching category and the default becomes redundant. (26 rather than 34: the other 8 coaching categories are on 42, 45, 47 and 54, which carry no Round columns at all, so their level 1 simply repeats with its own `[Show me]` under R6a.)

**Also flag at delivery, for the PIs rather than for a decision**: R3a means a popover closed with ×
or Escape has spent that level without the student seeing the walk-through. It is measurable (
consecutive `HazbotFeedbackShown` events on one category with no `HazbotShowMeClicked` between them),
and the implementation spec's delivery notes carry the wording. It is called out because a PI
evaluating whether level 2 helped would otherwise be counting students who never read level 1.

**Branch build URL**: branch deploys land at `https://wildfire.concord.org/branch/<name>/index.html`, with the story prefix stripped from the branch name, so a `WM-46-level-2-and-3-feedback` branch serves at `/branch/level-2-and-3-feedback/index.html`. Add the Hazbot URL params from `CLAUDE.md` to reach a given ruleset.

## Out of Scope

- **Per-level coach-mark walk-throughs** (R7). Parked with WM-32, whose mechanism section already records the sizing.
- **Sam's "comprehensive diagnosis and serious help" branch** and the four-clicks-total rule from his design doc. Scoped out by Sam on 2026-08-18.
- **The `run_record` / `run_history` structure** and `coachmark_tutorial` instrumentation (`num_steps` / `steps_completed`). Deferred by WM-45 and re-checked on 2026-08-21; see that spec's resolved question.
- **The Relations column** in the factor-variable block. That is WM-50.
- **Authoring the missing Round 2/3 columns on 42, 45, 47 and 54.** Flagged to Trudi as a content gap (see R6a), not blocking. Worth mentioning to her that tab 45 looks inconsistent with itself: it groups with the seven authored tabs on its category-100 text but with the unauthored four on its Round columns, which reads as an unfinished pass rather than a deliberate exclusion.
- **Authoring the level 2 and 3 wording.** Trudi and Sam own the content; this story ships whatever the sheet holds. Note the boundary R1a sits on: the pipeline supplies a default **action token** for a Round cell that carries none, because the token convention is invented here and no cell can have declined it (R4a, Question 4). It supplies no words. A cell's text is emitted as authored, minus the stray leading quote.
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

**Amended 2026-08-22.** B still stands, but its default token is no longer the fixed `[Okay]` this
decision assumed. Measuring the sheet showed that 0 of 56 cells carry a token, so the default is not a
fallback for the odd cell, it is the rule for every level 2 and 3 popover in the product. A fixed
`[Okay]` therefore silently decided that the walk-through is never re-offered, which is the opposite of
the design note this decision quotes as the reason the token gate earns its keep. R1a's default is now
level-aware (`[Show me]` for a tokenless Round 2 cell on a coaching category, `[Okay]` otherwise). This
does not reopen option D: D took authoring control away by rendering a fixed button regardless of the
cell, whereas an authored token still wins here, and the default only fills a silence that the
convention itself created. See Question 4.

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

**Accepted consequence**: with C and a terminal level 3, once a category has spent its three feedbacks, every later occurrence of that category shows "ask your teacher", which over a long session could be most of what a struggling student sees. That is Sam's stated cap working as written. Two routes back to level 1: Clear All, added by R3b after this question was first settled, and a browser reload, since the state is in memory. Restart is deliberately not one of them.

---

### RESOLVED: Level 3 is one identical string everywhere. Does it stay per-category sheet data?
**Context**: All 28 Round 3 cells resolve to a single distinct value across all 7 tabs: `"I'm all out of ideas! Please ask your teacher or a classmate for help!`. It also carries a stray leading double quote that would ship verbatim. Sam's scope-down describes level 3 as a fixed role ("please get help from teacher or friend") rather than per-category content. The sheet's own README documents the DSL and the feedback mechanism but says nothing about the Round columns, so there is no authored intent to read beyond the cells.

**Options considered**:
- A) Keep it as a per-category column. Costs nothing extra, keeps the door open to per-category level 3 text, ships 28 copies of one string.
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

Mapped against the code, the four `log()` calls in `hazbot-button.tsx` are `:155`, `:173`, `:179` (all tour lifecycle, and only for a coaching category where the student activates `[Show me]`) and `:255` (`HazbotButtonClicked`, inside `handleClick`, which starts at `:242`). **Nothing is logged when the intro popover opens.** That has not mattered so far, because one category means one string, so `matchedCategory` on the click has been a reliable proxy for what was displayed. This story is what ends the one-to-one.

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

## Self-Review

Every issue below was checked against the code, the committed rule-sets, or the workbook before
being written down. The verification is stated with each one.

### Senior Engineer

#### RESOLVED: The "56 cells" figure is Round 2 *plus* Round 3, but the spec attributes it to Round 3 alone
Background says "56 populated cells in total", which is correct. Three later passages then reuse
the same 56 as if it were the Round 3 count: Background's "All 56 cells across all 7 tabs resolve to
**one** distinct Round 3 value", R2a's "all 56 populated cells across all 7 tabs resolve to a single
distinct Round 3 value", and the Round 3 open question's "All 56 cells resolve to a single distinct
Round 3 value". Question 2 for Trudi compounds it: "Every Round 3 cell begins with a stray `"`
character. All 56 populated cells across the 7 tabs carry it."

**Measured on `Wildfire Hazbot Feedback Tables (8).xlsx`**: 28 Round 2 cells and 28 Round 3 cells.
The 28 Round 3 cells do resolve to one value. The 28 Round 2 cells carry **9** distinct values and
**no** leading quote. So the uniformity claim and the stray-quote claim are both true of 28 cells,
not 56, and Trudi is being asked to fix twice as many cells as exist. The per-tab table in
Background (4+4+4+4+4+3+5 = 28) is right; only the prose is wrong.

**Resolution**: corrected in four places (Background's level-3 paragraph, R2a, the Round 3 open
question's Context, and Question 2 for Trudi), and Background's "56 populated cells in total" now
says "28 in each column" so the two numbers cannot drift apart again. R2a additionally gained the
Round 2 count (28 cells, 9 distinct values), which is the sharper argument for keeping both columns
as per-category sheet data. Background's "Of the 56 Round 2/3 cells, zero carry the `Hazbot:`
prefix" is left as-is: that 56 spans both columns and is correct, verified against every cell.

---

#### RESOLVED: "The tab's top category" is never defined, and R4b, R5 and R6 all turn on it
R4b routes repeat clicks on "the tab's top category" to category 100, R5's cap example says "the
top category logs 1, 2, 2", and R6 says the top category is no longer a fallback case. Nothing says
how the implementation identifies it.

**Measured**: category ids are contiguous `1..N` on all 11 tabs (23→5, 24→5, 25→6, 32→6, 33→6,
34→5, 35→7, 42→3, 45→4, 47→5, 54→4), and there is an independent signal: the top category is
exactly the one whose level-1 token is `[Hooray!]`, on every tab, 11 for 11 (histogram over all 56
committed categories: `Okay` 11 on category 1, `Show me` 34, `Hooray!` 11). So "the highest id below
100" and "the `[Hooray!]` row" agree today. They are different rules under a future re-extract, and
the spec should say which one ships.


**Resolution**: R4b now defines it as the highest category id below 100, records the contiguous `1..N` ids per tab, and keeps the `[Hooray!]` correspondence as a cross-check rather than as the rule, so a future re-extract that breaks the agreement fails against a stated definition instead of an assumed one.

---

#### RESOLVED: R4a puts the literal string `[Show me]` into code for the first time
R4a makes the tour launch require "a `[Show me]` token on the level's own text". **Verified by
grep**: `hazbot-button.tsx` mentions "Show me" only in comments; no code path compares against
token text today. The tour decision is currently structural (`buildTour` returns a tour or null),
which is why the 34-tours/34-tokens correspondence holds without any code knowing the word.

R4a converts that into a string match, so an author who types `[Show Me]`, `[Show me!]` or
`[Show me how]` silently loses the walk-through with no warning anywhere. Worth deciding whether the
comparison is case- and punctuation-insensitive, and whether a level whose token is not recognized
but whose category has a tour should warn at extraction (where the existing
id-versus-marker warning already lives).


**Resolution**: R4a now specifies a trimmed, lowercased comparison, records that this is the first code match on token text, and adds an extraction-time warning (carried in R1a) for a Round 2/3 token outside the authored set, so a near-miss like `[Show me how]` surfaces at extraction instead of silently shipping a terminal popover on a category that has a walk-through to offer.

---

#### RESOLVED: R4b's new `RuleSet` slot is not stated to be optional, and R8b's minor bump depends on it
R2 is explicit that the two `Category` fields are "optional strings". R4b says only that category 100
lands "in a slot of its own on the rule-set". R8b then claims both additions are "additive substrate
API" and takes `ENGINE_VERSION` to `0.2.0` rather than `1.0.0`.

**Verified**: `RuleSet` is hand-constructed in 17 places across the substrate's own tests
(`engine.test.ts`, `sidebar.test.tsx`, `use-analysis-engine.test.tsx`, `consume.test.ts`,
`evaluator.test.ts`, `replay-determinism.test.ts`). A required slot breaks all of them and makes the
change breaking rather than additive; an optional one breaks none. The spec should say optional, the
way R2 does.


**Resolution**: R4b now says optional, and R8b names why it matters to the semver call: the 17 hand-built `RuleSet` literals in the substrate's tests are what make a required field breaking rather than additive.

---

#### RESOLVED: The `log()` call-site line numbers are stale
The Round 3 open question says "the four `log()` calls in `hazbot-button.tsx` are `:148`, `:166`,
`:172` ... and `:246`", and R7b cites `handleClick (:242)` with the click log at `:246`. **Verified**:
the four `log()` calls are at `:155`, `:173`, `:179` and `:255`. `handleClick` at `:242` is right;
the log inside it is at `:255`, not `:246`. Every other line citation in the spec that I checked
(`:122`, `:126`, `:129`, `:191`, `:199`, `:240`, `extract-impl.js:78-84`, `:85`, `:129-150`,
`:177-179`, `:200-212`, `playbook-impl.js:26`, `build-tour.ts:28`, `types.ts:40-47`,
`app.tsx:137`) is accurate.


**Resolution**: corrected to `:155`, `:173`, `:179` and `:255`, with `handleClick` noted as starting at `:242`. The other 15 line citations in the spec were spot-checked and are accurate.

---

### Data Pipeline Engineer

#### RESOLVED: A second source typo ships to students, and the Trudi question list misses it
Question 2 flags the stray leading `"` on the Round 3 cells. **Measured on the workbook**, the Round
2 column carries a separate student-facing spelling error: `Go up and look at the instructions under
"Fire Supression Investigation" again.` ("Supression" for "Suppression"). It appears once, on the
Fire Suppression tab. R1a strips the stray quote but nothing catches this, so it would ship verbatim
in a level 2 popover. **Verified** the misspelling does not occur in any committed level-1 feedback
string; it is new content this story introduces. It belongs in Question 2 alongside the stray quote,
since both are one edit while she is in the workbook.


**Resolution**: Question 2 for Trudi is rewritten to cover both typos and to separate them by consequence: the stray quote is stripped by the pipeline, the "Supression" misspelling is not and would reach a student in a level 2 popover.

---

### QA Engineer

#### RESOLVED: The spec states no testing requirements at all
There is no requirement covering tests for `normalizeFeedback`'s three new jobs, for the level
selection and the R5 cap, for the R4a token gate, for the category-100 extraction, or for the
playbook generator's new lines. R9 requires regenerating artifacts and R9b adds a sidebar readout,
but nothing pins behavior.

**Verified against the immediately preceding story in the same stack**: WM-45 carries seven explicit
testing requirements (R3a, R5a, R12, R12b, R12c, R13, R13a, R14b), several of which exist precisely
because a spiked implementation passed while being wrong. This spec has zero. The gap is sharpest on
the R5 cap and the R6 fallback, which are pure logic with no visible symptom when they drift: a
category that logs `feedbackLevel: 3` while showing level 1 text looks fine on screen and corrupts
the dataset.


**Resolution**: added R11 through R11f, covering `normalizeFeedback`'s new jobs and their no-op baseline, the category-100 slot and the R4c exclusion, the four-branch level ladder, advance-on-display, the R5 cap as an explicit invariant, and the playbook generator's new lines including the no-columns negative case.

---

#### RESOLVED: Nothing resets the level state, so the feature cannot be walked
R3 says the level map is never reset within the page session, and the Round-2 open question records
that "a page reload is the only route back to level 1". R9a makes the playbooks list all three
strings and R9b puts the level in the sidebar, but neither gives a walker a way to get back to level
1 to check the next category.

**Verified**: `simulation.reload()` (`simulation.ts:437`) is an in-model reset, not a browser reload,
so the app's own Reload button will not clear the map (see the Student/Teacher issue below). A
browser reload does, and per CLAUDE.md it also clears sparks and forces the walker back through
Terrain Setup. Validating level 3 on the 34 coaching categories therefore costs a full re-setup each
time. The repo already has the mechanism for this: `window.test.*` helpers in
`src/models/stores.ts`, documented in CLAUDE.md for exactly this kind of Playwright walk. A
`window.test.resetHazbotFeedbackLevels()` would make the feature walkable in one page load.


**Resolution**: added R9c, a `window.test.resetHazbotFeedbackLevels()` helper on the existing `stores.ts` pattern, documented in CLAUDE.md with the others.

---

#### RESOLVED: Should R9 also regenerate the replay fixture, given WM-45 just touched it?
Raised after the main review pass. R9 lists the playbooks and the tour data as the artifacts to
regenerate. WM-45 added `current` and `category_used` to the replay fixture one commit earlier, so
its absence from R9 needs to be a decision rather than an oversight.

**Decision: correctly omitted, and R9 now says so explicitly.** Established by spiking R2's two
`Category` fields and R4b's `RuleSet` slot onto ruleset 25, the tab the fixture replays:

- `replay-fixture.test.ts` **passes unregenerated** with the new shape present.
- Regenerating then produces a diff where **every changed line is a `sessionId` line** (8 insertions,
  8 deletions, zero non-`sessionId` changes), and the test strips `sessionId` from both sides anyway.
- The generator writes only `readings`, `observed`, `temporalValues` and the three category
  histories. It never serializes the rule-set, so the new fields have no path into the file.

The fixture's README sets a failure-driven regeneration policy and calls the diff "the review surface
for semantic drift", so regenerating without cause spends that surface on noise. R9 now states the
exclusion and its reason, and names R4c as the thing to suspect if the fixture ever does fail here.

The same spike incidentally hardened R4c and R11b: injecting the real category-100 row into ruleset
25's `categories` produces a `parse-error` and leaves the engine with **zero readings**, so the
failure mode is total rather than partial. Both requirements now carry that measurement.

---

### Product Manager

#### RESOLVED: R4b reads as settled in Requirements, but it is the one decision that costs a rebuild
The Questions-for-Trudi section is clear that R4b is the single place the spec deliberately discards
authored content, and that if Trudi disagrees "it is a code change rather than a sheet edit". R4b
itself says none of that. A reviewer or an implementer reading only the Requirements section sees a
settled requirement.

**Verified** the underlying evidence is strong: on 23 and 24 the top category's Round 2 is
byte-identical to the row above, and on the other five authored tabs (25, 32, 33, 34, 35) the top
row is blank in both columns. But "strong evidence for a fill-down" is a different status from
"decided", and this is a spec that otherwise marks its provisional parts carefully. One forward
reference from R4b to Question 1 is enough.


**Resolution**: R4b now says outright that it is the one requirement a sheet edit cannot absorb, states the evidence and its status, and forward-references Question 1 for Trudi.

---

### Education Researcher

#### RESOLVED: R7c overstates what the click/display gap measures
R7c says the gap between `HazbotButtonClicked` and `HazbotFeedbackShown` "is the direct measure of a
student pressing the button repeatedly with nothing new appearing".

It is not. Under R5's cap, a repeat click on an exhausted category *does* open a popover and *does*
emit `HazbotFeedbackShown`, so the gap stays zero while nothing new appears. R5's own worked example
says so: a fully populated category logs 1, 2, 3, 3, and the fourth click shows the same string as
the third. On 42, 45, 47 and 54 it is starker: R6a means a middle category logs 1, 1, 1 with a
zero gap across three clicks that all showed the same words.

**Verified by a throwaway test against the real component** (`fireEvent.click` twice with the
popover open, coachmarks mocked): two `HazbotButtonClicked` events, one coachmarks engine
constructed, one `highlight` call. So the gap measures exactly one thing, presses that opened no
popover at all, which is the double-press case R3a describes. "Nothing new appearing" is the union
of that and the capped-repeat case, and the capped-repeat case is measured by consecutive
`HazbotFeedbackShown` events carrying the same `feedbackLevel` and `source`. Both are recoverable
from the log; R7c should say which is which so an analyst does not compute the wrong one.


**Resolution**: R7c is rewritten to separate the two queries. The click-versus-display gap counts presses that opened no popover at all; a press that showed nothing new leaves no gap and is found instead as consecutive `HazbotFeedbackShown` events with the same `categoryId`, `feedbackLevel` and `source`.

---

### Student / Teacher

#### RESOLVED: The app's Reload button does not reset the level, so a full restart can open on "ask your teacher"
The Round-2 open question accepts the consequence that "a page reload is the only route back to
level 1, since the state is in memory". The app has its own control named **Reload**, and it is not
a page reload.

**Verified**: `bottom-bar.tsx:350` calls `simulation.reload()`, which is `restart()` plus
`setSetupChanged(false)`, `setInputParamsFromConfig()` and `populateCellsData()`
(`simulation.ts:437-442`). It touches the simulation model only; the `ui` store is untouched, and
`translate.ts:56-63` maps `SimulationReloaded` to a modifier that closes the run window rather than
clearing readings, so `best` keeps ratcheting too. CLAUDE.md describes Reload as "a full reset:
returns spark count to the preset default, clears terrain customizations, forces user back through
Terrain Setup".

So a student who hits Reload, walks back through Terrain Setup, places fresh sparks, runs, and
clicks Hazbot can be told "I'm all out of ideas! Please ask your teacher or a classmate for help!"
as the first thing they see after a full restart, because that category spent its three feedbacks
before the reset. A teacher watching that has no way to explain it and no way to clear it short of
reloading the browser tab. This is a real product decision (should Reload clear the map, all of it
or only the categories below the one just reached?) that the spec makes silently by saying only
"page reload".

**Resolution**: the map is cleared, all of it, on Clear All (new **R3b**). Reading WM-47 settled it.
That story renames this exact button from Reload to Clear All (Trudi's comment floats Reset as an
alternative, so the label is not final) and moves it left of Setup, and it exists because PD
reported **mis-clicks on this control**. So the scenario is not hypothetical, and a button whose
label says "all" that silently preserves Hazbot's escalation state is a worse mismatch than one
labeled Reload. Restart is deliberately not a reset: it keeps sparks and terrain and is a
within-activity action, so the escalation survives it. R3 now names Clear All as its single
exception, R9c is reworded around it, the accepted consequence in the reset question is corrected,
and Technical Notes carries the `bottom-bar.tsx` diff overlap with WM-47.


## Self-Review, round 2

Re-run against the material round 1 added. Three issues, all consequences of R3b or R9c, none of
them present before this review.

### Senior Engineer

#### RESOLVED: There are two reload controls, and R3b names only one
R3b opens "This is the Reload button", which is ambiguous: the app has two.

**Verified**: the **bottom bar** carries `data-testid="reload-button"`, labeled Reload and renamed
Clear All by WM-47. Its handler (`bottom-bar.tsx:338-351`) calls `simulation.reload()`, an in-model
reset. The **top bar** carries a separate refresh-icon control, `data-testid="reload"`
(`top-bar.tsx:43`), whose handler logs `SimulationEnded { reason: "TopBarReloadButtonClicked" }` plus
`TopBarReloadButtonClicked` and then calls `window.location.reload()` (`:28`), a real browser reload.

This cuts in R3b's favor and should be said out loud, because it turns R3b from a new behavior into
a consistency fix. **The top-bar control already clears the level map today**, for free, because a
page reload takes the whole `ui` store with it. So without R3b the two controls disagree: both log
run-window-closing events, both read as "start over" to a student, and one silently keeps Hazbot's
escalation while the other drops it. R3b makes them agree. R3b should name both controls and say
which mechanism clears the map in each case.


**Resolution**: R3b now identifies the bottom-bar control by testid, names the top-bar refresh icon and its `window.location.reload()` mechanism, and states the point of the finding: the top-bar route already clears the map, so R3b is what makes the two controls agree, and it is the only one of the two needing code.

---

#### RESOLVED: R9c's helper cannot reach the `ui` store as `stores.ts` is currently ordered
R9c says to expose `window.test.resetHazbotFeedbackLevels()` "alongside the existing helpers in
`src/models/stores.ts`". The level map lives in the UI store (R3, Technical Notes).

**Verified**: `createStores()` constructs `new SimulationModel()` at `stores.ts:28`, assigns
`window.test = createTestHelpers(simulation)` at `:33`, and only then constructs `new UIModel()` at
`:36`, inside the returned object literal. `createTestHelpers` takes `simulation` alone (`:43`), so
as ordered today the helper has no way to see the store it needs to clear. The fix is small (hoist
the `UIModel` construction above the `window.test` assignment and pass it in) but it is a signature
and ordering change rather than "one more function", which is how R9c currently reads.

Worth noting the same problem does **not** affect R3b: `bottom-bar.tsx`'s `handleReload` already has
`ui` in scope, at `:348` (`cancelFireLinePlacement(simulation, ui, "reload")`).


**Resolution**: R9c now states the constraint and the fix (hoist the `UIModel` construction above the `window.test` assignment and pass it in), and records that R3b is unaffected because `handleReload` already has `ui` in scope.

---

### Education Researcher

#### RESOLVED: R3b makes `feedbackLevel` non-monotonic within a session, and nothing tells an analyst why
Before R3b, `HazbotFeedbackShown.feedbackLevel` only ever climbed for a given `categoryId` within a
page session. After R3b it can drop back to 1 mid-session, and the log gives no reason on the event
itself.

The information is recoverable, which is why this is a documentation gap rather than a design one:
**both reset routes are already logged and already documented**. `SimulationReloaded` and
`TopBarReloadButtonClicked` are both in `LOGGED-EVENTS.md` (lines 15-16), so an analyst can segment
a session on either one. But nothing says they must, and R7d's whole argument is that "which string
did the student read" has to stay answerable from the log without out-of-band knowledge. A
researcher who sees `categoryId: 2, feedbackLevel: 3` followed later by `categoryId: 2,
feedbackLevel: 1` in one session will read it as corrupt data, exactly the way WM-45 anticipated for
`categoryId` above `matchedCategory` and headed off with a documented note.

R7a should require the `LOGGED-EVENTS.md` entry to state that `SimulationReloaded` resets every
category's level to 1, and that `TopBarReloadButtonClicked` does too by ending the page session.
`LOGGED-EVENTS.md:16` also describes the bottom-bar control as "Reload", which WM-47 renames.

**Resolution**: R7a now requires the `LOGGED-EVENTS.md` entry to say that `feedbackLevel` is not monotonic within a session and to name both reset routes, following the precedent WM-45 set with its `categoryId`-above-`matchedCategory` note. The stale "Reload" label on line 16 of that file is flagged for the same edit.

---

## Self-Review, round 3

Re-run against the full spec after round 2. Five issues. Each was measured against the
committed code or against `Wildfire Hazbot Feedback Tables (8).xlsx` before being written
down; the measurement is stated with the issue.

### Product Manager / Student

#### RESOLVED: The walk-through is never re-offered at level 2, which is the one thing Sam's design asks for by name

R4a's decision text quotes Sam on what level 2 is for: *"the coachmark re-offered with the
level of insistence that reflects whether the user did/completed it previously"*, and calls
the token gate the part that "earns its keep" because after R4a "that is one word typed into
one cell". **Nobody has been asked to type it.** The Questions-for-Trudi section asks about
the fill-down, the two typos and the four unauthored tabs, and does not ask for this.

**Measured on the workbook**, reading every Round 2 and Round 3 cell through the same
trailing-token regex `parseFeedback` uses: **0 of 56** carry a bracket token. So R1a's default
`[Okay]` applies to every populated cell, and R4a then makes **every** level 2 and level 3
popover terminal on every tab. The 34 coaching categories are exactly the 34 whose level-1
token is `[Show me]` (re-confirmed against the workbook: 33→4, 32→4, 35→5, 34→3, 25→4, 23→3,
24→3, 42→1, 45→2, 47→3, 54→2).

The consequence is sharper than "level 2 has no tour", because of how the intro's cancel
route interacts with R3a. R3a advances the level **when the popover opens**, and the intro
popover's `onCancelRequested` sets `introCancelled = true` (`hazbot-button.tsx:196`), which
the tour launch at `:199` requires to be false. So a student who presses Hazbot on a coaching
category and closes the popover with × or Escape without activating `[Show me]` has **spent
that category's level 1**. Their next press shows a bare Round 2 sentence with a `Done`
button, and the press after that shows "I'm all out of ideas! Please ask your teacher or a
classmate for help!". The walk-through, which is the only actionable help the feature has,
was reachable for exactly one dismissed popover and is then gone for the rest of the page
session (R3 never resets; only Clear All does, per R3b).

Note the shape of the gap: on 42, 45, 47 and 54 the walk-through survives every repeat click,
because R6a repeats level 1 there. It is precisely the seven tabs with **authored** level 2/3
content that lose it. The better-authored activities degrade worse.

**Options**:
- A) Ask Trudi and Sam to type `[Show me]` into the Round 2 cells of the coaching categories.
  Pure sheet edit, absorbed by a re-import, no code change; R4a already implements it.
- B) Make R1a's default token level-aware rather than fixed: a Round 2 cell with no token on a
  category that has a tour defaults to the category's own level-1 token (`[Show me]`), so the
  walk-through is re-offered once more; Round 3 keeps defaulting to `[Okay]` and stays
  terminal. Ships the design intent without waiting on 28 cell edits.
- C) Accept level 2 and 3 as terminal. Sam's re-offer line is from the design doc he scoped
  down on 2026-08-18.

**Recommendation**: **A plus C as the shipping default**, i.e. add this to the
Questions-for-Trudi list as the fourth question and ship terminal levels until she answers.
B is tempting and cheap, but it puts a guessed authoring decision into the normalizer, which
is exactly what R1a's decision text rejected option D for, and it silently makes `[Show me]`
mean two different things depending on whether the cell is blank. A is one word per cell, in
the surface the whole spec treats as authoritative, and it is answerable on the same branch
build as Question 1.

**Resolution (first pass)**: **A**, with C's code as what ships. Added Question 4, R4a's statement that
the door it opens is unused as the workbook stands, and R3a's note that a dismissed popover spends the
level.

**Superseded 2026-08-22: B ships.** Reopened when the branch had to be cut without either Sam or Trudi
reachable, and the argument that had ruled B out did not survive the re-examination. That argument was
that defaulting the token would override a deliberate blank. It cannot: the token convention for the
Round columns is invented in this spec (R4a's own note records that this is the first place any code
matches on token text), so no author has ever had the option of declining it. The blank is an absence,
not a choice, and with 0 of 56 cells carrying a token the "default" is not an edge case but the rule
for every level 2 and 3 popover that ships. Choosing `[Okay]` there was not the neutral option; it was
a silent decision that the walk-through is never re-offered, against a design note asking for exactly
that. So R1a's default is now level-aware, R4a and R3a are rewritten around what ships, R7e adds
`feedbackLevel` to the three tour events (the tour can now launch from two levels, and the log could
not otherwise tell them apart), R11a and R11g pin both branches, and Question 4 becomes a
confirm-what-shipped question for Sam with the two content judgments it leaves open. One line reverses
it.

---

### Data Pipeline Engineer

#### RESOLVED: The fill-down evidence for R4b is presented as decisive, and the byte-identity half of it is not evidence at all

R4b, Background and Question 1 all rest the fill-down reading on two facts: the top row is
blank on five authored tabs, and on 23 and 24 the top row's Round 2 is byte-identical to the
row above it. The second is described as "what a drag-fill one row too far looks like", and
Question 1 gives Trudi a table with a "Row above" column that presents it as the tell.

**Measured across the Round 2 column on all 7 authored tabs**, adjacent rows carrying
byte-identical text is the norm, not an anomaly:

```
23: cat4 = cat5   ("Go down and look at the questions you need to answer.")   <- the disputed pair
24: cat4 = cat5   ("Go down and look at the questions you need to answer.")   <- the disputed pair
25: cat4 = cat5   ("Go down and look at the questions you need to answer.")
32: cat2 = cat3   ("...under "Vegetation Investigation" again.")
32: cat4 = cat5   ("Go down and look at the questions you need to answer.")
33: cat4 = cat5   ("Go down and look at the questions you need to answer.")
35: cat2 = cat3 = cat4  ("...under "Tree Survival Investigation"...")
34: no adjacent duplicates
```

Seven duplicate runs among the middle categories, on five different tabs, none of which can
be a fill-down one row too far, since the rows below them are populated with different text.
The column simply repeats a small vocabulary: 28 cells, 9 distinct values (R2a's own figure).
So byte-identity carries no signal about 23 and 24 specifically.

The decision is still right, but on one leg rather than two: **five of seven authored tabs
leave the celebration row blank**, and the README assigns the after-success repeat click to
category 100. That is what R4b should say, and what Trudi should be shown.

**Recommendation**: keep R4b, and correct the evidence in the three places that state it
(Background's third bullet, R4b, Question 1). Drop the "Row above" column from Question 1's
table, since it invites her to agree for a reason that does not hold, and replace the
byte-identity sentence with the measured fact that adjacent-row duplication is ordinary in
this column. The behavioral check Question 1 asks her to run on the branch build is
unaffected and remains the thing that settles it.

**Resolution**: R4b is unchanged; its evidence is corrected in all three places. Background's third
bullet now states the blank-row count as the whole case and records the seven measured duplicate runs
that disqualify byte-identity as a signal. R4b says the evidence is one fact rather than two. Question 1
drops the "Row above" column and adds a short paragraph naming what is deliberately *not* being offered
as evidence, so Trudi is not cued to agree for a reason that does not hold. The branch-build check she
is asked to run is unchanged and remains what settles it.

---

### Senior Engineer

#### RESOLVED: `hazbot-button.tsx:129` is not the only display consumer of `category.feedback`, and the second one goes stale exactly the way the playbooks would have

Technical Notes says "**One consumer, and it already holds the key**", naming
`hazbot-button.tsx:129` as "the only place category feedback is read for display". R4 then
describes the whole selection change as happening at that one line.

**Verified by grep** over `src/` and `scripts/`, excluding tests and the generated rule-sets,
there are four readers of `cat.feedback` and two of them display it:

```
src/components/hazbot-button.tsx:129        the student-facing popover
src/hazbot/engine/sidebar/sidebar.tsx:255   the dev sidebar's per-category detail panel
scripts/playbook-impl.js:26                 the validation playbook  (R9a covers this)
scripts/extract-impl.js:90,206              extraction
```

`sidebar.tsx:255` renders `Feedback:` inside the expandable per-category detail, next to
`Visual feedback:` and the parsed expression. After this story it shows one of up to three
strings, with nothing to say the other two exist and nothing about category 100. That is the
same staleness R9a exists to fix for `docs/hazbot-validation/*.md`, on the surface a walker
actually has open while clicking, and R9b does not cover it: R9b adds a level readout in the
Diagnostics section, not the strings themselves.

It is a small change (the detail panel already renders three sibling rows from `cat`), but it
has to be stated, because Technical Notes currently tells an implementer there is one call
site to change.

**Recommendation**: correct the Technical Notes claim to name both display consumers, and
extend R9b (or add R9d) to render the Round 2 and Round 3 strings in the sidebar's
per-category detail panel beside the existing `Feedback:` row. Category 100 belongs there
too, once per rule-set rather than per category. This stays inside the substrate's own
sidebar component, which already reads `cat.feedback`, so it adds nothing to R8b's bump
beyond the two `Category` fields R2 already declares.

**Resolution**: Technical Notes now says "one *student-facing* consumer" and lists all four readers of
`cat.feedback` with the two display sites named. Added **R9d**: the sidebar's per-category detail panel
renders the Round 2 and Round 3 strings beside its existing `Feedback:` row, omitting rows a category
does not carry, with category 100 shown once per rule-set rather than per category.

---

#### RESOLVED: R9b's stated placement and its stated mechanism are incompatible

R9b says to put the level readout "**beside WM-45's Category block**", that "the level belongs
next to it", and in the same breath to "**route it through the existing host-supplied
`diagnostics` prop**".

**Verified in `sidebar.tsx`**: the `diagnostics` array renders in its own **Diagnostics**
section at `:58-79`, above the errors panel; the Category block (`best` / `current` / `used`)
renders at `:90-110`. They are not adjacent and the ordering is fixed in the component. A
diagnostic cannot land beside `used` without editing the substrate component, which is the
thing R9b is arguing against.

There is a second half to it. R9b asks for "the highest level reached for the current `used`
category", which needs `used`, an engine value. `diagnostics` is computed in
`app.tsx:137` inside `AppComponent`, a MobX `observer` that subscribes to the stores and
**not** to the engine (the sidebar gets engine reactivity from `useAnalysisEngine`, which App
does not call). It happens to re-render often, since it reads `simulation.time` at `:85`, so
this would mostly work by accident. "Mostly works by accident" is the wrong basis for the
readout whose entire job is telling a walker what the next click will show.

**Recommendation**: keep the `diagnostics` route and fix the wording and the content. State
that the readout lands in the sidebar's Diagnostics section, above the Category block, and
make it a function of UI-store state alone: the last level and `source` displayed, and the
level map itself (compactly, e.g. `levels: 2→3, 5→1`), which is what a walker needs and what
is observable from App. The `used` category it should be read against is on screen already,
in the Category block below. If the level is wanted literally beside `used`, that is a
substrate-component change and R8b's justification has to widen to match; the Diagnostics
route is the cheaper and more honest one.

**Resolution**: R9b keeps the `diagnostics` route and drops the "beside the Category block" wording,
stating instead that the readout renders in the Diagnostics section above the Category block and that a
walker reads the two together. Its content is now UI-store state only: the level map rendered compactly
plus the last level and `source` displayed. The rejected alternative (a per-`used` level, which needs an
engine value in a component that does not subscribe to the engine) is recorded in the requirement with
the reason, including that it would appear to work because App re-renders off `simulation.time`.

---

### QA Engineer

#### RESOLVED: R11b puts an all-11-tabs assertion in a test file that never sees a real tab

R11b requires that "the category-100 rows land in the new `RuleSet` slot **on all 11 tabs**,
and no category with `id >= 100` reaches `categories`", and names `extract-impl.test.js` as
the home for both halves.

**Verified**: `scripts/extract-impl.test.js` is driven entirely by `SYNTHETIC_SHEETS`, a
hand-written two-category fixture tab (`:12-40`). It never reads a workbook and never imports
the committed rule-sets, so it structurally cannot assert anything about 11 tabs. Its existing
id>=100 tests (`:84-121`) are correctly scoped: they prove the *mechanism* on synthetic rows.

The repo already has the right surface for the other half. `src/hazbot/rule-sets/index.test.ts`
imports `ruleSets` and loops all 11 by name (`:50-55`), which is where "every committed
rule-set carries a category-100 slot, and no committed `categories` array holds an id >= 100"
belongs. That placement also makes it a re-extraction regression gate rather than a unit test:
R4c's measured blast radius (a leak takes the rule-set to zero readings) is a property of the
committed artifacts, not of the extractor's synthetic path.

**Recommendation**: split R11b in two. The mechanism half stays in `extract-impl.test.js` on
synthetic rows, both directions (the row lands in the slot; it does not land in `categories`).
The corpus half moves to `src/hazbot/rule-sets/index.test.ts`, asserting over all 11 committed
rule-sets. Check R11a for the same slip while editing: its no-op cases are synthetic-friendly
and stay put, but its "across all 11 tabs" sentence is stated as a measured baseline rather
than as an assertion, so it needs no move.

**Resolution**: R11b is split into a mechanism half (`extract-impl.test.js`, synthetic rows, both
directions) and a corpus half (`src/hazbot/rule-sets/index.test.ts`, all 11 committed rule-sets), with
the reason each lands where it does. R11a is unchanged.

---

## Self-Review, round 4

Re-run against the material round 3 added. Two issues, both in the R11 testing block, both
consequences of round 3 rather than present before it.

### QA Engineer

#### RESOLVED: R4a's token gate is the requirement round 3 made load-bearing, and nothing tests it

R11 covers `normalizeFeedback` (R11a), the category-100 extraction (R11b), the level ladder
(R11c), advance-on-display (R11d), the cap (R11e) and the playbook lines (R11f). **No entry
covers R4a**, the rule that decides whether a level re-offers the coach-mark walk-through.

Round 3 is what makes that a gap rather than an omission. Before it, R4a read as a
behavior-preserving tidy-up backed by the 34-for-34 correspondence. After it, R4a is the
requirement that determines that every level 2 and 3 ships terminal, and Question 4 asks
Trudi to change that answer by typing one word into a cell. The gate is also the first place
any code matches on token *text* (R4a's own note), so it is the one new comparison in the
story with no structural backstop.

**Verified against the existing suite**: `hazbot-button.test.tsx` has a "Hazbot walk-through
tour" block (`:308-437`) with six tests, including "launches a gated tour on [Show me]"
(`:344`) and "does NOT launch a tour on intro ×/Escape" (`:426`). All of them gate on
`buildTour` returning a tour or null, which is today's structural rule. None passes a level
whose token differs from the category's level-1 token, because no such case can exist yet.

The missing branch has no visible symptom in the popover body: at level 2 the text is
correct, only the button label differs, and the difference shows up solely in what Done does.
That is the same class of silent-drift failure R11's preamble gives as the reason the block
exists at all.

**Recommendation**: add **R11g** to `hazbot-button.test.tsx`, two cases against the new gate.
A category with a tour, shown at a level whose parsed token is not `[Show me]`, must not
launch a tour on Done (the net-new branch, and the one that ships). The same category at
level 1 must still launch it, which pins the 34-for-34 correspondence as a regression rather
than as a measurement in prose. A third case is worth it if cheap: the trimmed, lowercased
comparison R4a specifies, so `[Show Me]` launches.

**Resolution**: added **R11g** in `hazbot-button.test.tsx` against the token gate. Revised the same day
when R1a's default became level-aware, since that flipped which branch ships: the four cases are now
launch at level 1, launch at level 2, no launch at level 3, and `[Show Me]` launches. The requirement
records why the negative case needs a test rather than a walk: it has no on-screen symptom.

---

#### RESOLVED: R9d and R9b's sidebar readouts were added without test requirements, while their playbook twin has one

Round 3 added R9d (the Round 2 / Round 3 strings in the sidebar's per-category detail panel)
and rewrote R9b's content (the level map and last `source` in the Diagnostics section).
Neither has an R11 entry. Their direct analogue does: R11f pins the playbook generator's new
lines "including the negative case of a tab with no Round columns".

The asymmetry is hard to defend, since R9a and R9d exist for the same reason and R9d is on the
surface a walker actually has open. **Verified that both have obvious homes** in
`src/hazbot/engine/sidebar/sidebar.test.tsx`: `:60` already covers the expanded per-category
detail panel where R9d's rows go, and `:463-520` is a `Sidebar — diagnostics slot` block that
already covers the rendered and the absent case for the prop R9b routes through.

R9d also carries the same negative case R11f names: a category with no Round 2/3 content must
render no empty rows, which is most of the eleven tabs and all of four of them.

**Recommendation**: add **R11h** to `sidebar.test.tsx`, covering R9d's rows (present when the
category carries them, absent when it does not, category 100 rendered once per rule-set) and
R9b's diagnostic line. Keep it to the rendering contract; the level *arithmetic* is already
pinned by R11c and R11e against the component that computes it, and duplicating it here would
pin the same rule twice.

**Resolution**: added **R11h**, covering R9d's per-category rows (present / absent / category 100 once
per rule-set) and R9b's diagnostic line in `sidebar.test.tsx`, scoped to the rendering contract. The
level arithmetic is deliberately left to R11c and R11e so the same rule is not pinned twice.

---

## Pre-implementation verification, 2026-08-22

Five implementation assumptions in this spec were asserted rather than tested, so each was
measured before the implementation spec was written. Throwaway tests, run and then deleted;
the tree carries none of them. Two changed the spec (R9b-i and R11i are new, R3a-i is new),
one corrected a stale enumeration in Technical Notes, and two confirmed an anchor that the
implementation now rests on without re-checking it.

### CONFIRMED: the `@observable` Map anchor behaves as Technical Notes describes

The `UIModel` anchor in Technical Notes (`@observable public hazbotFeedbackLevels = new Map()`)
had no precedent in that class, where every existing `@observable` is a primitive, and the claim
that MobX deep-converts it was the load-bearing half of R9b's readout.

**Measured** on a class of the same shape (`@observable` field plus `makeObservable(this)`, under
this repo's `configure({ enforceActions: "never", safeDescriptors: false })`): the field is an
`ObservableMap` (`isObservableMap` true, constructor `ObservableMap`), and an `observer` component
re-renders on a `.set()` performed outside any action, on a second `.set()` with a different value,
and on `.clear()`. A component reading only `.get(id)` subscribes and re-renders too, which is the
access pattern R9b's compact `levels: 2→3, 5→1` readout and any per-category readout would use.

**Outcome**: no change. The anchor ships as written, and R3b's wholesale clear is a `.clear()` that
the readout will follow.

---

### CONFIRMED: `HazbotFeedbackShown` is inert to the engine, exactly as `HazbotButtonClicked` is

R7a emits a new event from the display site, and `log()` routes every event through
`engine.consume()` (`log.ts:25-26`). Background argues the click's no-op is load-bearing; the same
has to be true of the new event, and from inside a React effect rather than a click handler.

**Measured** on a real windowed engine over ruleset 25, driven through `consume()` with a
`SimulationStarted` / `SimulationEnded` pair first: after consuming
`HazbotFeedbackShown { ruleSetId, categoryId, feedbackLevel, source }`, the serialized `readings`,
`observed`, `temporalValues`, error count and `computeCategorySelectionForEngine` result are
identical, **zero** subscriber notifications fire, and the last reading's `temporalHistory` gains
no entry. `HazbotButtonClicked` measures identically on the same engine. The mechanism is
`engine.ts:396`: a temporal reducer runs only if the variable's `acceptedEvents` lists the event
name, so a name no variable accepts never sets `mutated` and never reaches `tickAndNotify`.

**Outcome**: no change. R7a's event name is safe to add without touching `translate.ts`, whose
`default: { kind: "no-op" }` already covers it.

---

### RESOLVED: R3a's increment site was one level too shallow

R3a said to advance the level "when the popover actually opens, in the effect at `:122`". Those are
two different moments, because `openIntro` is deferred to the avatar's transform `transitionend` or
a 400ms fallback and the teardown can pre-empt it.

**Measured** against the real component with coachmarks mocked, counting effect-body runs against
`highlight` calls (accounting for `log()` itself calling `getAnalysisEngine()` at `log.ts:25`, so a
click costs two engine reads before the effect's one):

```
normal click, fallback fires        1 effect run   1 open
click then unmount within 400ms     1 effect run   0 opens
no engine / empty feedback          1 effect run   0 opens   (flag reset to false)
second press, popover already open  0 extra runs   0 extra opens
dismiss (x/Escape) then click       2 runs total   2 opens total
```

The zero-open rows are where an increment at the top of the effect would spend a level on nothing
shown, which is the same defect R3a rejects a click-site counter for, one step further in. The
second-press row independently confirms R3a's reading of the effect key and is R11d's case.

**Resolution**: added **R3a-i**, which states the split the implementation takes: pick the level and
the string at the top of the effect, where `parseFeedback`, `buildTour` and `tourDoneLabel` need it,
and commit the map write and the R7a log inside `openOnce`, whose `opened` guard makes it exactly
once per open.

---

### RESOLVED: R9b's readout is invisible on any URL without `?preset`

R9b routes the level readout through the sidebar's host-supplied `diagnostics` prop, which
`app.tsx:137` fills from `buildPresetDiagnostics(getRequestedPresetInfo())`.

**Measured** two ways. In a render test, `getRequestedPresetInfo()` returns `undefined` with no
`?preset` on the URL, `buildPresetDiagnostics(undefined)` returns `undefined`, and the sidebar
renders no Diagnostics section for either `undefined` or `[]` (the `diagnostics && diagnostics.length > 0`
guard at `sidebar.tsx:58`). Live against the dev server,
`?hazbotRules=23&hazbotSidebar=true` renders Category, Categories, Factor Variables, Temporal
Variables, Sim Props and Readings with **no Diagnostics section at all**; adding
`preset=plainsTwoZone` makes the section appear.

R9c exists so a walker can check every category in one page load, and nothing requires a preset on a
Hazbot URL, so as specified the readout would be missing exactly when someone goes looking for it.

**Resolution**: added **R9b-i** (compose the diagnostics array at the `app.tsx` call site from the
preset half and the level half, either able to be absent, `undefined` when both are, and leave
`buildPresetDiagnostics` pure) and **R11i** (pin it in `app.test.tsx`, where the composition lives,
since the substrate sidebar only ever sees the finished array).

---

### RESOLVED: the extraction-base paragraph named the wrong set of hand-maintained files

Technical Notes said a re-extract differs from the committed tree only by `.eslintrc.js` and
`test-helpers.ts`.

**Measured** on this branch: every generated file comes back byte-identical and so does
`dsl-grammar.md`, so the substance holds, but the folder now also carries `__fixtures__`,
`index.test.ts`, the 11 per-tab `NN.test.ts` files and WM-45's two `current-category-*` tests. All
hand-maintained, none of them extractor output. Running both derived-artifact generators against the
current tree also produces no `git diff`, which is the baseline R9's "the tour data must come back
unchanged" is checked against.

**Resolution**: Technical Notes now lists the full set and records the generator idempotence as a
separate measured baseline.
