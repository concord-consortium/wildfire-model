# WM-47: Clear All button replaces Reload button and moves left of Setup

**Jira**: https://concord-consortium.atlassian.net/browse/WM-47
**Repo**: https://github.com/concord-consortium/wildfire-model
**Status**: **In Development**
**Implementation Spec**: [implementation.md](implementation.md)

## Overview

The bottom bar's Reload button is renamed **Clear All**, moved from the middle of the control row to its far left, and widened to 66px. Its behavior is unchanged. Two things make this bigger than a label change: Reload currently shares a widget group with Restart, so moving it splits that group in two; and three Hazbot coach-mark steps already instruct the student to click Clear All, while the coach mark still rings a control named `reload-button`, so the testid rename is what makes the tours point at the button their own text names.

## Project Owner Overview

PD feedback found that students were mis-clicking Reload, which wipes the model, because it sits directly beside Restart in the middle of a row of frequently used controls. Renaming it Clear All says plainly what it does, and moving it to the far left of the row, away from the play controls, puts distance between it and the buttons a student reaches for repeatedly.

Nothing about what the button does changes: it still resets the model to its authored defaults. The one non-obvious cost is that Hazbot's coaching tours name the button out loud in three places, so the instruction text had to change with it. That text lives in the feedback spreadsheet rather than in the code, so it needed Trudi's wording rather than a find-and-replace. **That half is already done**: Trudi wrote the copy on 2026-08-25 and WM-54 extracted it, so the tours already say Clear All. This story owns the remaining half, which is entirely in code, and needs nothing further from Trudi.

## Background

Reload is rendered at `bottom-bar.tsx:163-172` inside a `.reloadRestart` widget group that it **shares with Restart**, which is why the pair reads as one 122px bubble with a seamless internal divide. Moving Reload out of that group is therefore a structural change, not a reorder: the shared group splits into two independent ones, and every visual assertion about the pair loses its subject.

The button's enable rule is `reloadEnabled = setupChanged || sparks.length > 0` (`simulation.ts:162`) and its handler `handleReload` (`bottom-bar.tsx:327`) logs `SimulationEnded` with `reason: "SimulationReloaded"` and then `SimulationReloaded`. This is a rename of a label, so none of that changes.

**Three stories land in this row at once.** WM-52 removes the Fire Intensity Scale, WM-48 adds a Vegetation Key toggle, and WM-40 adds a speed control. The Zeplin board draws the finished bar with all of them in place, so the full row cannot be verified against the board until the other three land. This story still applies the spacing tightening, because the gap value is verifiable on its own and the assertions it touches are being rewritten anyway; see the resolved spacing question. No intermediate combination overflows the bar (see Technical Notes), and the last of WM-48 and WM-40 owns the final re-measure of the whole row.

## Requirements

- The bottom bar's Reload button is relabeled **Clear All** and moved to the far left of the control row, before Setup.
- **The shared `.reloadRestart` widget group is dissolved.** Clear All becomes its own group and Restart becomes its own group; the `margin-right: 0` abutting modifier moves off `.reloadRestart` and onto whichever group now precedes each seam. This is the structural core of the change, not a side effect of the move.
- Clear All renders at **66px content / 68px border box**. The 66 is the board's uniform 6px label inset applied to a longer word: the "Clear All" label measures 53.95px at Lato Bold 14px and 54 + 6 + 6 = 66, exactly as Restart's 48 + 6 + 6 = 60. It is not a fit constraint; "Clear All" already fits inside 60px.
- **Clear All needs its own width override.** `.playbackButton` locks Reload, Restart and Start to `min-width: 60px !important; width: 60px !important` (`bottom-bar.scss:212-221`), so a plain `width: 66px` cannot win. Clear All takes a modifier carrying `width: 66px !important`, cross-referencing that rule's existing explanation rather than repeating it. It does **not** override `min-width`: `.playbackButton` pins that at 60, and the used width is `clamp(min-width, width)`, so a floor below the target never binds. See the resolved implementation finding, which measures it.
- Restart becomes an independent 62px border-box group in its existing position between Spark and Start.
- Its behavior, enable rule, and logged events are unchanged. In particular the `SimulationReloaded` and `TopBarReloadButtonClicked` **log event names are not renamed**, and neither is the `reason` string on the `SimulationEnded` payload. The existing assertion at `log-events.test.tsx:60-83` keeps its expected strings; only its selector changes.
- The `reload-button` `data-testid` is renamed to `clear-all-button` across all nine files that reference it (enumerated in Technical Notes), in one commit.
- **The three Hazbot tour steps are already authored and extracted; this story verifies rather than authors them.** Trudi wrote the copy directly into the Feedback Tables on 2026-08-25 and WM-54 extracted it, so by the time this story starts the strings are in the rule-sets. Verify that category 2 on rule-sets 41, 44 and 46 (formerly 42, 45 and 47) reads `First, click **Clear All** to reset your model. (Step 1 of 2)`, and that after the testid rename the coach mark rings the control that text names. See the resolved wording question.
- **No sheet edit and no re-extract are needed.** The extractor and `npm run generate-hazbot-tour-data` were both run by WM-54 against the shipped export, and their artifacts are committed. If this story runs them again they must produce no diff; a diff means the wrong export was used.
- The `visualFeedback` cell on those same three tabs is likewise already updated: it reads `1. Clear All button outlined; coach mark points to Clear All button`. Verify it alongside `arrowText`, since it is the authored source the tour anchors are derived from.
- **`feedbackRound2` on those same three tabs is a third verify target**, and the only one of the three rendered straight from the rule-set, with no generated artifact and no assertion between the authored cell and the screen (`arrowText` is student-facing too, but reaches the UI through `tour-data.generated.ts`): it reads `Hazbot: If you have changed the model setup, click **Clear All** to reset the model and run it again!` and is rendered as the level-2 feedback rung (`feedback-levels.ts:34`). Nothing in the extractor or the suite guards it, so a regressed re-extract would leave the student told to click a button that does not exist while passing every other check in this story.
- The authored `(Step 1 of 2)` suffix stays exactly as it is. The generator validates it and fails without it; it is not what the student sees.
- `APP_RULES_VERSION` is **not** bumped. The change is editorial, not semantic, per `docs/hazbot-update-workflow.md`.
- Every existing test and comment that names the Reload button is updated: `bottom-bar.test.tsx`, `log-events.test.tsx`, `build-tour.test.ts`, `bottom-bar-visuals.cy.ts`, `bottom-bar-state-machine.cy.ts`, and `cypress/support/elements/BottomBar.js`.
- **`bottom-bar-visuals.cy.ts`'s "renders 0 px gap within the Reload+Restart paired group" test is deleted, not rewritten.** Its subject stops existing when the group is split.
- **`$bottomBarWidgetGroupSpacing` goes from 9px to 4px** (`common.scss:12`), giving the board's 3px visible gap (`spacing - 1`). Its comment's "9 - 1 = 8 px" arithmetic is updated with it. The resulting chain is `3, 3, -1, -1, 3, -1` across this story's seven widget groups, with `mainContainer` at 481px; `bottom-bar-visuals.cy.ts` carries both numbers.

## Technical Notes

Layout numbers come from the *Updated Wildfire Controls and Labels* board (`.../screen/6a8566a1c90489f7be36e66a`), group "Bottom Controls". Current numbers were measured live in Chrome against the running dev server, not read off the SCSS.

**The board's finished control row, left to right.** Border-box widths, with the border-box gap to the next group:

| Order | Widget | Content | Border box | Gap after | Owner |
|---|---|---|---|---|---|
| 1 | **Clear All** | **66** | **68** | 3 | **WM-47** |
| 2 | Setup | 82 | 84 | 3 | unchanged |
| 3 | Vegetation Key | 90 | 92 | 3 | WM-48 |
| 4 | Spark | 60 | 62 | -2 | unchanged |
| 5 | Restart | 60 | 62 | -2 | **WM-47 (leaves the shared group)** |
| 6 | Start / Pause | 60 | 62 | -2 | unchanged |
| 7 | Speed | 97 | 99 | 3 | WM-40 |
| 8 | Fireline | 65 | 67 | -2 | unchanged |
| 9 | Helitack | 65 | 67 | - | unchanged |

Every widget border is 1px inside `#797979` with a 10px radius, unchanged. Setup, Spark, Start, Fireline and Helitack keep their current widths exactly, so this row is not a re-sizing pass: only Clear All's width and the gaps move.

> **Build the `-2` gaps in this table as `-1`.** The table records what the board draws; Michael's 2026-08-26 answer keeps the implemented coincident 1px seam instead (see the resolved seam question). So the chain to build and to assert is `3, 3, 3, -1, -1, -1, 3, -1`, and the finished row spans **671px**, not the 667px this table sums to. Nothing else in the table changes.

**Why 66, measured.** The board sets a uniform **6px inset** between a control's label and its content box: "Clear All" text 54 wide in a 66 box, "Restart" 48 in 60, "Helitack" 53 in 65. Measured live at the label's real font (`700 14px Lato`), "Clear All" is **53.95px** and "Reload" is 43.72px, which matches the board's 54 exactly. So 66 is the inset convention applied to a longer word, not a minimum: at today's 60px the label would still fit with about 3px each side.

**The current row, measured live for comparison.** Widths 84 / 62 / **122 (Reload+Restart pair)** / 62 / 67 / 67 / 142, with gaps 8, -1, -1, 8, -1, 8. Total widget span **627px**.

**The row gets 40px WIDER, not narrower, and that settles the provisional-spacing note.** The board's span is 218 to 885 = **667px**. `sprint-24-mechanisms.md` flagged that the Fire Intensity Scale's departure frees 151px and that the net budget "may well be a net gain". Measured: it is a net **loss** of horizontal room. The scale's 142 + 9 leaves, but Vegetation Key (92) and Speed (99) arrive, and the tightening only claws back part of the difference. Holding today's 9px spacing while adding those two groups would give a 691px row; tightening to the board's spacing brings it to 671. So **the tightening saves 20px and is real work**, even though its stated justification (*"esp when the Fire Intensity Scale is displayed"*) describes a condition WM-52 deletes. (The saving is 20 rather than 24 because Michael's seam answer keeps `-1`, which costs 4px back across the four seams; the board's own 667 assumes `-2`. All three figures share the same 663px of widget widths and differ only in the eight gaps.)

**No intermediate state overflows the bar, verified rather than assumed.** A spacer widget group was injected into the live bar at a 950px viewport and grown: at widget spans of 637, 669, 677 and **701px** the bar never overflows. `.leftContainer` and `.rightContainer` are `flex: 1 1 0%` and absorb the growth (163 to 131 and 143 to 111 across that range), and the CC logo has already swapped to its small variant at this viewport. So both the 691px peak intermediate and the board's finished 667px row fit with room to spare, and the sequencing question below is about appearance at intermediate commits, not about breakage.

**The spacing change is one variable.** `$bottomBarWidgetGroupSpacing: 9px` (`common.scss:12`) is applied as `margin-right` on `.widgetGroup`, against a `margin-left: -$bottomBarBorderWidth` (`bottom-bar.scss:84`, `:83`). So the rendered border-box gap is `spacing - 1`, which is the measured 8. The board's 3px gap therefore means **`$bottomBarWidgetGroupSpacing: 9px -> 4px`**, one line.

**That 3px is measured, and it is not a Zeplin bounding-box artifact.** The board carries two rects per control, `... Control Border` and `... Control Back`, the Border outset 1px on every side, which are CSS's border box and content box. They calibrate exactly against the app: the Border widths of the five controls this story does not touch match the live border-box widths (84 / 62 / 62 / 67 / 67). The four non-abutting gaps are then a uniform 3 between Border rects and 5 between Back rects. WM-23's design specified 10px content-edge / 8px visible, which is what `9px` implements today, so the board is halving a gap rather than restating one, and the ticket description asks for exactly that.

**The -2px abutting seam is consistent, not a nudge, and it means content-flush.** Measured from the board's own layers: at every one of the four abutting seams the two **content** boxes are exactly adjacent (Spark back ends at 532 and Restart back starts at 532; Restart ends 592, Start starts 592; Start ends 652, Speed starts 652; Fireline ends 819, Helitack starts 819). The border rects each extend 1px past their content on both sides, which is what produces the -2px border-box overlap. So the board is drawing a coherent model, "the two content boxes touch and each keeps its own 1px border", giving a 2px seam. Today's -1px makes the two borders **coincide** into a single 1px line, with the content boxes 1px apart. This is not a Sketch artifact: it is exactly -2 at all four seams. What makes it a question rather than a decision is that one of those four seams, Fireline to Helitack, is the one the designer explicitly reviewed when asking for "two bubbles that abut, not one shared bubble", and the board now disagrees with the implemented result of that conversation.

**Which groups abut changes.** Today: Spark to the Reload/Restart pair, the pair to Start, Fireline to Helitack. On the board: Spark to Restart, Restart to Start, **Start to Speed**, Fireline to Helitack. Clear All, Setup and Vegetation Key are all separated.

**"Clear All ICON" is the existing Reload icon renamed, not new artwork.** Downloaded from the board and diffed against `src/assets/bottom-bar/reload.svg`. The glyph is identical under a +4 translation: every anchor point matches (repo `15.26,24.25` against Zeplin `19.2617,28.2461`; repo `8.53,8.88` against `12.5297,12.8791`; repo `13.92,3.09` against `17.9237,7.0881`; repo `24.25,15.26` against `28.2457,19.2621`). The wrapper differs (a 38x38 box with an extra white `Clear-All-Highlight` circle at r=19 around the `#797979` r=15 disc), but that is the board's standard export for pill-button icons: **"Restart ICON" has the identical wrapper**, and its glyph likewise matches the repo's 30x30 `restart.svg` under the same +4. So `reload.svg` needs no artwork change and the story gains no asset swap. Note the board's disabled-state note covers only *"Setup, Spark, Fire Line, and Helitack ... use a gray version"*, and only those four have `ICON Disabled` exports, so Clear All keeps whatever disabled treatment the pill buttons use today.

**The Hazbot half, as verified when this spec was written.** All four of the ticket's claims held against the pre-WM-54 tree. WM-54 has since closed the first and the fourth. Kept in past tense because it is the evidence behind this story verifying rather than authoring:

- The three `arrowText` cells read `1. Hazbot: First, **Reload** your model. (Step 1 of 2)`, on rule-sets 42, 45 and 47. **Since WM-54**: the rule-sets are 41, 44 and 46, and `arrowText` (`41.ts:28`, `44.ts:28`, `46.ts:28`) reads `1. Hazbot: First, click **Clear All** to reset your model. (Step 1 of 2)`, reaching the UI through `tour-data.generated.ts` as "First, click **Clear All** to reset your model."
- All three tours anchored `reload-button` as step 1 (`tour-map.tsx`, entries 41/2, 44/2, 46/2). **Still true, and it is now the entire mismatch**: the instruction already says Clear All while the ring is still on `reload-button`, so the testid rename is the only thing left that closes it.
- `tour-map.test.ts:34` asserts every testid a factory can emit is in `ANCHOR_TESTIDS`, so a testid rename must move in lockstep with `anchor-testids.ts`. **Still true**, and it is the guard rail that makes the rename safe.
- `APP_RULES_VERSION` was `7`, with WM-54 expected to take it to 8 before this story started. **It is now `8`** (`rules-version.ts:7`). The "not bumped" requirement above is unaffected: §7 of `docs/hazbot-update-workflow.md` exempts *"editorial-only edits (typo fixes in feedback text, no semantic change)"*, and renaming the button in the authored cells changes the wording of a string without changing which string a session is shown.

**The testid rename touches nine files, two more than the ticket's step 4 implies.** `bottom-bar.tsx:166` (the render), `anchor-testids.ts:13`, `tour-map.tsx:126,130,135`, `bottom-bar.test.tsx` (14 references), **`log-events.test.tsx:73,509`**, **`build-tour.test.ts:58`** (an exact-string assertion on `[data-testid="reload-button"]`), `cypress/support/elements/BottomBar.js:10`, `bottom-bar-state-machine.cy.ts:71,221`, and `bottom-bar-visuals.cy.ts:72,78,95,115`. The two in bold are the ones the ticket and the earlier draft of this spec both missed.

**The ticket's work list misses two further strings per tab.** Besides `arrowText`, each of the three rule-sets carries two more cells that name the button by label. Both were authored by WM-54 and both now read Clear All, so both are verify targets rather than edit targets:

- `visualFeedback` (`41.ts:26`, `44.ts:26`, `46.ts:26`): `1. Clear All button outlined; coach mark points to Clear All button`. That column is the authored source `tour-map.tsx` derives its anchors from, per that file's own header comment. The extractor has one partial guard on it: `tour-data-impl.js:119-120` warns when the number of numbered lines in `visualFeedback` disagrees with the `arrowText` step count. It cannot notice that the prose names the wrong button.
- `feedbackRound2` (`41.ts:22`, `44.ts:22`, `46.ts:22`): `Hazbot: If you have changed the model setup, click **Clear All** to reset the model and run it again!`. Unlike `visualFeedback`, this one is **student-facing prose rather than an authoring aid**: `feedback-levels.ts:34` pushes it as the level-2 rung, so it is what the student reads on the second Hazbot click, before the tour opens. Nothing guards it at all, in the extractor or in the suite.

**The `(Step 1 of 2)` suffix is load-bearing for the extractor and invisible to the student.** `STEPNUM_RE` (`tour-data-impl.js:21`) matches it, `:50` fails the build if a step line lacks it, and `:54` fails if the numbers are out of order; the parsed value is then discarded and the displayed numbering comes from the engine. So it must stay correct in the authored cell and must not be treated as the source of what the coach mark shows.

**LOGGING TRAP: three of the strings that say "Reload" must not change.** `SimulationReloaded` is logged at `bottom-bar.tsx:344` and as the `reason` on the preceding `SimulationEnded` (`:332`); `TopBarReloadButtonClicked` is logged from `top-bar.tsx:22-25`. Both are consumed by the Hazbot translator (`translate.ts:57-58`) and both are named in the `logEvents` arrays and `details` prose of `rule-sets/44.ts:70-71` and `46.ts:78-79`. *(This read `45.ts`, `47.ts` and `54.ts` when the spec was written; the rule-sets were renumbered and `54.ts` no longer exists.)* This is the same shape as the `terrainLabels` split recorded under *WM-39: where the string actually lives*: one word doing a display job and a data job at once, where only the display job may change. **The ticket's work list does not mention any of it**, confirmed by reading the description in full.

**The invariant is already asserted, but only against a partial rename.** `log-events.test.tsx:60-83` clicks the button and asserts `SimulationEnded` carries `reason: "SimulationReloaded"` followed by a `SimulationReloaded` call; `translate.test.ts:133,145` and `helitack-run-window.test.ts:73` each iterate over the literal event names. A rename of the emitted string alone turns these red. What no in-repo test can catch is a **global** find-and-replace, which renames the expectations along with the source and stays self-consistent. The one thing that would surface that is the next re-extract: `rule-sets/44.ts` and `46.ts` are generated from the sheet, so a global rename of their `logEvents` and `details` strings would be reverted on the next extraction and appear as an unexplained diff.

**The top-bar Reload is a different button and stays.** `top-bar.tsx:19` renders a `RefreshIcon` whose handler calls `window.location.reload()`. It reloads the page, not the model, so it is unaffected by this rename, but it does mean the app will contain a Clear All and a page-level reload at the same time.

**Enable semantics are unchanged and already pinned.** `reloadEnabled = setupChanged || sparks.length > 0`. The board's state table introduces Clear All at state 2 (*"If Setup is changed: Clear All is enabled"*) and does not restate it at state 3, but the existing `bottom-bar-state-machine.cy.ts` "state 3 (SparkPlaced): Start + Reload enabled" test confirms sparks also enable it today. Read the board's list as "what newly becomes enabled at each transition", not as a narrowing.

**Nothing enforces that the generated tour text matches its source.** CI (`.github/workflows/ci.yml`) runs two gating jobs, not one: `build_test` (`npm run build`, then `npm run test:coverage -- --runInBand`) and `cypress` (the full `cypress/e2e/` suite in Chrome against `npm start`), and `s3-deploy` lists both under `needs:`. So the Cypress geometry assertions this story rewrites are CI-gated, and the hole is narrower than "CI runs only two commands": no job runs `npm run generate-hazbot-tour-data`, and neither suite compares the generated file against its source. `tour-map.test.ts` pins step *counts* between the map and the generated data, so a hand-edit of a step's **text** in `tour-data.generated.ts` passes every test, which is exactly the shortcut the DO NOT EDIT banner is trying to prevent. Half of that is mechanically checkable: `generate-hazbot-tour-data.js` reads the **committed rule-set modules**, not the spreadsheet, so `npm run generate-hazbot-tour-data && git diff --exit-code` is a self-contained CI check. The other half, whether the rule-sets themselves still match the sheet, is not checkable in the repo, because the xlsx is not in it.

**Test and prose fallout, enumerated.**

| File | What breaks |
|---|---|
| `bottom-bar.test.tsx` | Seven state-machine cases assert `reload-button`; their `it()` titles and comments say "Reload" |
| `log-events.test.tsx` | Two `getByTestId("reload-button")` clicks (`:73`, `:509`); a comment naming the button twice (`:63-64`); and an `it()` title (`:504`) carrying both the button name and the lowercase `'reload'` `CancelReason` that must NOT change. The expected event-name strings must NOT change either |
| `build-tour.test.ts` | An exact-string assertion on the `[data-testid="reload-button"]` selector |
| `bottom-bar-visuals.cy.ts` | The 122px paired-group width assertion; the 7-widget adjacency chain and its expected 8/-1 gaps; and an entire test, *"renders 0 px gap within the Reload+Restart paired group"*, whose subject stops existing |
| `bottom-bar-state-machine.cy.ts` | `expectButtonStates`' `reload` key, the `reload-button` selector, and six `it()` titles naming Reload |
| `cypress/support/elements/BottomBar.js` | `getReloadButton()` |
| `rule-sets/41,44,46.ts` | Nothing: WM-54 already authored and extracted `arrowText`, `visualFeedback` and `feedbackRound2`. This story verifies them |
| `tour-data.generated.ts` | Regenerated |
| `CLAUDE.md` | Five lines naming the button (`:125`, `:138`, `:141`, `:142`, `:144`), including two imperative "click Reload" instructions and the "Restart vs Reload behavior" heading |
| `docs/hazbot-validation/localhost-urls.md` | Three lines naming the button (`:137`, `:145`, `:197`); hand-maintained, not generated. `:138` stays, being the page reload |
| `LOGGED-EVENTS.md` | Two lines naming the button (`:16`, `:36`). Already half-renamed by WM-46 (`:123`, `:128` say Clear All), so leaving these makes one file use both names. `:14` and `:17` stay |
| `src/hazbot/TBD.md` | One line (`:163`) quoting the `CLAUDE.md` heading this story renames |

**Suite baseline on this branch.** `npx jest` reports **1009 passed of 1009 across 79 suites**, measured on `f34627a`. *(This read 879 when the spec was written, before WM-54 and the intervening rule-set work.)*

**No throwaway files were created.** Measurements were taken with Playwright against the already-running dev server, with a temporary spacer element removed afterward; the two Zeplin SVGs were downloaded to a scratch directory outside the repo.

## Out of Scope

- **The Vegetation Key toggle** (WM-48) and **the speed control** (WM-40), even though the board draws both in this row.
- **Removing the Fire Intensity Scale** (WM-52).
- **Changing what Clear All does.** It is a rename plus a move; `reload()`'s reset semantics, its enable rule, and its logged events are untouched.
- **Extracting a shared width-locking mechanism across the bar's controls.** Rejected for this story; see the resolved Senior Engineer finding. The two families involved defeat different browser behaviors and only two pill widths will exist.
- **Adding a `generate-hazbot-tour-data && git diff --exit-code` CI step.** Worth doing and now specified precisely enough to do: it is one step in the existing `build_test` job, after `npm run build`. Still workflow infrastructure rather than part of a button rename.
- **Sweeping the unused getters out of `cypress/support/elements/BottomBar.js`.** `getReloadButton()` has no callers (its one apparent call site is the file-header comment in `bottom-bar-state-machine.cy.ts` that names it as an example), so this story renames a method nothing calls. It is not deleted instead, because it was already unused before this story and it is not the only one: `getFireLineButton()` and `getHelitackButton()` are uncalled too. Deleting the one this story happens to touch would leave two identical cases behind, and deleting all three is a page-object cleanup unrelated to a button rename.
- **Renaming the top-bar page-reload control.**
- **Bumping `APP_RULES_VERSION`.**
- **Accessibility review**, per the standing scope for this repo.

## Open Questions

### RESOLVED: Does WM-47 implement the tightened spacing, or does the last of the four stories do it?
**Context**: The tightening is one variable (`$bottomBarWidgetGroupSpacing: 9 -> 4`) and it belongs to this ticket's description. But the board's 667px row only exists once WM-48's Vegetation Key and WM-40's Speed are in it, and WM-52's scale is out. Applying the tightening now produces a bar that matches neither today's design nor the board.
**Options considered**:
- A) Ship the rename and the move; leave `$bottomBarWidgetGroupSpacing` at 9 and note that the last of the four stories sets it to 4 and re-measures the row against the board.
- B) Change the variable here, accepting an intermediate state that matches neither design.
- C) Sequence the four stories so this one lands last, and do the whole row in one pass.

**Findings:** the risk half of this question is now closed, which leaves only the aesthetic half. Measured on the live bar at a 950px viewport by injecting and growing a spacer group: at widget spans of 637, 669, 677 and **701px** the bar does not overflow, because `.leftContainer` and `.rightContainer` are `flex: 1 1 0%` and absorb the growth (163 to 131 and 143 to 111 across that range, with the CC logo already on its small variant). Both the 691px peak intermediate and the board's finished 667px row therefore fit comfortably. So no ordering produces a broken bar, and the choice is purely about whether an intermediate commit is allowed to look wrong. Note that this question and the Product Manager finding below are the same question wearing two hats: whichever option is chosen, the deliverable is naming the story that owns "the bar matches the board".

**Decision**: **B, the tightening lands in this story** (Doug, 2026-08-26). Two things had to hold for that to be safe, and both were checked.

**The 4px is a real design value, not an artifact of how Zeplin draws bounding boxes.** The board carries two rects per control, a `... Control Border` shape and a `... Control Back` shape, the Border being the Back outset by exactly 1px on all four sides at all nine controls. That maps onto CSS's border box and content box. The calibration is exact: for the five controls this story does not touch, the board's Border widths and the app's live border-box widths agree (Setup 84, Spark 62, Start 62, Fireline 67, Helitack 67), so a gap read between Border rects is directly comparable to one read in the browser. The four non-abutting gaps are a uniform **3** between Border rects (286 to 289, 373 to 376, 468 to 471, 750 to 753), equivalently 5 between Back rects. Since the rendered gap is `spacing - 1`, that is `$bottomBarWidgetGroupSpacing: 4px`.

**And it is a deliberate redraw rather than an inherited one**, which is what distinguishes it from the seam question above. WM-23's design specified a 10px content-edge / 8px visible gap, and that is precisely what today's `9px` implements. This board halves the content-edge gap to 5. So unlike the `-2` seam, which Michael says the board inherited from the original design, the gap does **not** match the original and cannot be inherited. The ticket description says the same thing in words: *"the spacing between controls have been updated/tightened."*

**Why here rather than deferred.** This story takes the bar from six widget groups to seven, so it rewrites `bottom-bar-visuals.cy.ts`'s adjacency chain and the `mainContainer` width assertion either way. Folding the tightening in changes the numbers those two assertions carry, not the number of lines touched, so deferring buys a second rewrite of the same two lines and nothing else. No intermediate state matches the board regardless, because the widget list is incomplete until WM-40 and WM-48 land.

Applied to the working tree and measured before deciding: the chain renders `3, 3, -1, -1, 3, -1` with Clear All at 68 border box and `mainContainer` at 481, and the rendered bar was compared against the board and matches.

**This also answers the Product Manager finding below, and names the owner: whichever of WM-48 and WM-40 lands last owns "the bar matches the board."** Its job is to re-derive the whole gap chain in one pass from the Technical Notes table rather than reading it off the browser, targeting the **671px** span (not the board's 667) that Michael's seam answer implies.

---

### RESOLVED: Is the `reload-button` `data-testid` renamed to `clear-all-button`?
**Context**: The ticket raises this and leaves it open. Renaming it is the honest thing, and it ripples: `ANCHOR_TESTIDS`, the 42/2, 45/2 and 47/2 entries in `tour-map.tsx` (in lockstep, or `tour-map.test.ts:34` fails), the Jest state-machine spec, both Cypress specs, and `cypress/support/elements/BottomBar.js`. Not renaming it leaves a selector named after a button that no longer exists.
**Options considered**:
- A) Rename to `clear-all-button` and update every consumer in one commit.
- B) Keep `reload-button` and add a comment explaining the mismatch.

**Decision**: **A.** The question's own framing settles the direction: the testid is not a logged value, so unlike `SimulationReloaded` there is no data-integrity reason to keep it, and leaving a selector named after a button that no longer exists is precisely the drift this repo's reviews keep catching. Option B would also make the Hazbot side actively misleading, since `tour-map.tsx`'s anchors would read `anchor("reload-button")` for a coach mark ringing Clear All, next to a `visualFeedback` string this story is already updating for the same reason. Two corrections to the cost estimate, both from grepping rather than from the ticket: the rename touches **nine** files, not the seven the ticket implies, and the two extra ones are the easy ones to miss because they are not about the bottom bar at all. `log-events.test.tsx:73` and `:509` click the button by testid, and `build-tour.test.ts:58` asserts the full selector string `[data-testid="reload-button"]` as a literal. `tour-map.test.ts:34` makes the `ANCHOR_TESTIDS` half self-enforcing: rename one without the other and the suite fails, which is the safe direction for this kind of change.

---

### RESOLVED: What is Trudi's wording for the three tour steps?
**Context**: The mechanical substitution gives "First, **Clear All** your model", which is not English. Plausible alternatives are "First, click **Clear All**", "First, **Clear All** to reset your model", or a restructure. The bold run has to cover exactly the button label, because the generator's rich-text extraction maps bold runs to the emphasized token. **This question was addressed to Sam in the first draft and that was wrong**: Sam owns the rules and the DSL, and everything about which words a student reads is Trudi's, so a phrasing question sent to him bounces.
**Options considered**:
- A) Ask Trudi for the copy before touching the sheet.
- B) Propose "First, click **Clear All**." and ask her to confirm or replace it.

**Findings:** two constraints on whatever she chooses, both confirmed against the extractor. The authored cell must keep its leading ordinal and its trailing `(Step 1 of 2)`: `tour-data-impl.js:50` fails the build if a step line lacks the suffix and `:54` fails if the number disagrees with its position, so the edit is to the middle of the string only. And the bold run must cover exactly `Clear All` and nothing else, since the emphasis is what the coach mark renders as the button name. Worth sending her the `visualFeedback` line in the same message, since it also names the button and is being edited in the same pass (see the Education Material Developer finding).

**WM-54 asked this, and it is answered.** An intermediate 2026-08-25 export briefly left these three cells in a worse state than the spec describes, with tabs 44 and 46 re-authored to *"First, **Restart** your model"* against a `visualFeedback` still reading "Reload button outlined", and tab 41 keeping Reload. Restart was also wrong on the merits, measured live: `restart()` preserves the student's setup changes and only `reload()` restores the defaults, while category 2 fires precisely because the student is off defaults. That state never shipped; the next export the same morning replaced all six cells. See the Decision.

**Decision**: **Answered by Trudi in the sheet, and neither A nor B exactly.** She authored the copy directly rather than replying with a phrase to paste, so this is her wording rather than a choice between the two offered; it is closest to B. Identical on all three tabs:

```
1. Hazbot: First, click **Clear All** to reset your model. (Step 1 of 2)
2. Hazbot: Click **Start** to run the model! (Step 2 of 2)
[Got it!]
```

with the matching `visualFeedback`:

```
1. Clear All button outlined; coach mark points to Clear All button
2. Start button outlined; coach mark points to Start button
```

**Both constraints in the Findings hold, verified rather than assumed.** The authored cell keeps its leading `1.` ordinal and its trailing `(Step 1 of 2)`, which `tour-data-impl.js:50` fails the build without. And the bold run covers exactly the button name and nothing wider: running `buildBoldMap` from `scripts/rich-text-bold.js` over the shipped export renders the cell as `First, click **Clear All** to reset your model.`, with `**Start**` bolded in step 2. The Round 2 note added to the same three categories bolds `**Clear All**` the same way.

**WM-54 has already extracted all of it**, so no sheet edit, no re-extract and no message to Trudi remain for this story. What is left of its Hazbot half is the **testid rename only**: `reload-button` to `clear-all-button` across the nine files enumerated in Technical Notes, moving `ANCHOR_TESTIDS` in lockstep so `tour-map.test.ts:34` stays green. That rename is also what closes the copy window WM-54 deliberately accepted, in which these three tours name a button whose on-screen label is still Reload.

---

### RESOLVED: Does the abutting seam become -2px per the board, or stay -1px?
**Context**: The board draws abutting widget pairs overlapping by 2px, which puts their two 1px borders adjacent rather than coincident, producing a 2px seam. The current -1px makes the borders coincide into a single 1px line, which is what the designer asked for when Fireline and Helitack were split into separate bubbles. This is a two-pixel question, but it applies at four seams and would be visible as a heavier row.
**Options considered**:
- A) Keep -1px. Treat the board's 2px overlap as a drawing artifact and say so in a comment.
- B) Adopt -2px to match the board exactly.
- C) Ask Michael, since it is a two-line answer and the row is being rebuilt anyway.

**Findings:** the "drawing artifact" theory in option A does not survive measurement, which makes C the serious option rather than the cautious one. Read off the board's own layers, the -2 is not a nudge: at **all four** abutting seams the two *content* boxes are exactly adjacent (Spark's back ends at 532 and Restart's begins at 532; likewise Restart/Start at 592, Start/Speed at 652, Fireline/Helitack at 819), and the -2 border-box overlap falls out of each border rect extending 1px past its content on both sides. That is an internally consistent model, "the boxes touch and each keeps its own border", drawn identically four times. The sharper version of the question is therefore not "is this a nudge" but this: the Fireline-to-Helitack seam is the one Michael explicitly reviewed when he asked for two abutting bubbles rather than one shared one, the implementation of that conversation produced a coincident 1px line, and the board now draws that same seam at 2px. Either the intent changed or the board is drawn from a template that does not encode it, and only he can say which.

**Decision**: **A, keep `-1px`**, on Michael's answer of 2026-08-26 05:52 EDT: *"Keep the approach that's already implemented. In the spec, I just kept how it was originally designed. Not worth changing it at this point imo."* That settles both halves of the question the findings above could not. The intent did not change, and the second sentence confirms the alternative this spec named: the board carries the `-2` because it inherited the original design, not because anyone redrew the seam. So the four seams stay coincident 1px lines and no code changes for this.

**One consequence to carry forward, because it makes the board and the app deliberately disagree.** The row's finished span is now **671px, not the board's 667px**: the nine border-box widths total 663, and four seams at `-1` instead of `-2` add 4px. Whoever owns "the bar matches the board" must treat 671 as correct and the board's 667 as superseded, or they will find a 4px discrepancy and chase it. The gap chain to build against is therefore `3, 3, 3, -1, -1, -1, 3, -1`, not the board's `3, 3, 3, -2, -2, -2, 3, -2`.

**This does not answer the spacing question above.** Michael was asked only about the seam overlap, which is `margin-left: -$bottomBarBorderWidth`; the `3px` gaps are `$bottomBarWidgetGroupSpacing` and are a separate variable. "Keep the approach that's already implemented" should not be read as retracting the tightening, which is on this ticket's own description and which measurement shows saves a real 20px even after the seams give 4px back. If anyone reads it that way, it needs one more line to him rather than an assumption.

---

### RESOLVED: Is "Clear All ICON" a new glyph, or the existing reload icon renamed?
**Context**: The board exports it as a distinct asset and carries no "Reload ICON", but the layer tree cannot say whether the artwork differs from `assets/bottom-bar/reload.svg`. If it is new, the story gains an asset swap; if it is the same, the existing file can be renamed or left alone. It is a five-minute check by downloading the SVG and diffing it against the repo's.
**Options considered**:
- A) Download the exported SVG and diff before deciding.
- B) Assume it is the same glyph and keep `reload.svg`.

**Decision**: **the check was run, and it is the same glyph.** Downloading "Clear All ICON" as SVG and comparing its path against `src/assets/bottom-bar/reload.svg` shows the arrow is identical under a +4 translation, anchor point by anchor point: repo `15.26,24.25` against Zeplin `19.2617,28.2461`, repo `8.53,8.88` against `12.5297,12.8791`, repo `13.92,3.09` against `17.9237,7.0881`, repo `24.25,15.26` against `28.2457,19.2621`. The export differs only in its wrapper: a 38x38 box with a white `Clear-All-Highlight` circle at r=19 around the `#797979` r=15 disc, against the repo's 30x30 single-path form. That wrapper is the board's convention for every pill-button icon rather than anything about Clear All, confirmed by downloading "Restart ICON", which has the identical three-layer structure and whose glyph also matches the repo's `restart.svg` under the same +4. So the story gains **no artwork work**: `reload.svg`'s bytes are unchanged. The file *name* does move, to `clear-all.svg` with a `ClearAllIcon` import: see the resolved asset question in the implementation spec, which also records why the SVG's internal `id` / `<title>` / `data-name` metadata is deliberately left alone.

---

### RESOLVED: Is Trudi's "Reset" suggestion closed?
**Context**: Her 2026-08-18 comment asks *"Maybe use 'Reset' instead of reload. What is the current convention?"* and was never answered on the ticket. Michael's description, written the following morning, says Clear All throughout, and the board labels the button Clear All. So it is settled in practice, but nothing on the ticket records that her question was considered rather than overlooked, and this is a label three coach-mark tours will now quote.
**Options considered**:
- A) Treat the description and the board as the answer; note it here and move on.
- B) One line back to Trudi confirming Clear All over Reset before the sheet edit, since the sheet edit is the expensive half to redo.

**Findings:** the "expensive half to redo" argument is stronger than it looked, because the label now propagates further than the button. Confirmed on the board and in the code, "Clear All" appears as: the button label; the width driver (66 = 54 + 6 + 6, so a shorter word like "Reset" would give a different container width and a different row total); the three re-authored `arrowText` cells; the three `visualFeedback` cells; and, if the testid rename lands, `clear-all-button` across nine files including `ANCHOR_TESTIDS`. Reversing to "Reset" after the sheet edit means a second sheet export and a second re-extract. Also worth noting for the message: `acli` does not surface ticket comments in either its JSON or its plain view, so there is no way to confirm from here whether her question has since been answered.

**Decision**: **A, and it is settled on Clear All** (Doug, 2026-08-25). The description, the board and Michael's own spec all say Clear All, and Trudi has since adopted it herself at source: the Round 2 cells she authored on tabs 41, 44 and 46 in the 2026-08-25 export read *"click **Clear All** to reset the model"*. So the label is confirmed by the content author in the sheet rather than only by the design, which is the stronger form of the answer B was asking for. The "expensive half to redo" analysis stands as the reason it was worth confirming rather than assuming, and no longer applies now that it is closed.

## Self-Review

### Senior Engineer

#### RESOLVED: Splitting the Reload/Restart group is the real change, and the requirements bury it
The story reads as a rename plus a move, which sounds like a label string and a DOM reorder. In fact `.reloadRestart` is a shared widget group whose whole purpose is to render two buttons as one bubble, and Reload leaving it means the group is deleted, Restart becomes a standalone group, and the `margin-right: 0` abutting modifier moves. Every one of the visual-regression assertions about that pair stops having a subject. That is the bulk of the diff and it deserves its own requirement line rather than a clause.

**Decision**: accepted; it is now its own requirement and is named in the Overview and Background as one of the two things that make this bigger than a label change. Confirmed live: the group renders as a single 122px box containing two `<button>` elements, so "the pair" is a real DOM structure and not just a visual impression. Two consequences now sit in the requirements alongside it, because they only exist once the group dissolves: Clear All needs its own width override to escape `.playbackButton`'s 60px lock, and the paired-group Cypress test is deleted rather than rewritten.

---

#### RESOLVED: Four widths are about to be specified in four different ways
Clear All's 66px will join `.terrainButton`'s 82, `.placeSpark`'s 60, and `.fireIntensityScale`'s 140 as another hardcoded content width whose only job is to defeat MUI's circular sizing, each with its own comment explaining the same mechanism. A fifth instance of a documented workaround is a signal to extract it. Since WM-40 and WM-48 are each about to add another, this story is the last cheap moment to do so.

**Decision**: the premise is wrong, and correcting it changes the answer. Clear All is **not** a fifth instance of that workaround. The comment the finding is reading (`bottom-bar.scss:93-101`) says so explicitly: the circular-sizing dependency comes from `.iconButton { width: 100%; min-width: 60px }` fighting a shrink-wrapping parent, and *"pill buttons (Reload / Restart / Start) avoid this because `.playbackButton` has no `width: 100%`"*. Clear All is a pill. What it does need is different and simpler: `.playbackButton` locks all three pills to `min-width: 60px !important; width: 60px !important` (`:212-221`) to beat MUI's `min-width: 64px`, so Clear All needs a modifier with its own `!important` pair to reach 66. That is a requirement now, and it should cross-reference the existing comment rather than repeat it. Extraction is rejected for this story: it would have to span two families that defeat different browser behaviors and carry different justifications, and after this change there will be exactly two pill widths (60 and 66). If WM-40's Speed control turns out to be a pill as well, that is the moment to reconsider. Recorded in Out of Scope.

---

#### RESOLVED: The generated files are the source of truth for the tour text, and nothing enforces that
The pipeline is sheet, then `extract-hazbot-sheets.js`, then `generate-hazbot-tour-data`. A developer under time pressure will notice that editing `tour-data.generated.ts` directly makes the coach mark say the right thing, and the file's DO NOT EDIT banner is the only thing stopping them. If the sheet is not re-exported in the same commit, the next unrelated re-extract silently reverts the copy. Worth stating that the sheet export accompanies the commit, or that a check compares the two.

**Decision**: confirmed, and it splits cleanly into a checkable half and an uncheckable one. Confirmed first that the hole is real, though not for the reason first written here: CI runs two gating jobs, `build_test` and a full `cypress` e2e run, and neither compares `tour-data.generated.ts` against the rule-sets it is generated from. No job runs `npm run generate-hazbot-tour-data`. `tour-map.test.ts` pins step *counts* between the map and the generated data, so a hand-edited step **text** passes the entire suite. The checkable half is bigger than the finding assumed: `generate-hazbot-tour-data.js` reads the **committed rule-set modules**, not the spreadsheet, so `npm run generate-hazbot-tour-data && git diff --exit-code` is a self-contained CI step needing no xlsx. The uncheckable half is whether the rule-sets still match the sheet, which cannot be verified in-repo because the export is not committed. So: the requirement now states that both regenerated artifacts land in the same commit as the sheet export, and the CI check is recorded in Out of Scope as worth doing but not part of a button rename.

---

### QA Engineer

#### RESOLVED: One existing Cypress test should be deleted, not updated, and the spec says "updated"
`bottom-bar-visuals.cy.ts`'s *"renders 0 px gap within the Reload+Restart paired group"* exists solely because those two buttons share a group. After this change they do not, and there is no 0px inner gap to assert. Rewriting it to assert something else about Clear All would keep a test whose name and rationale describe a structure that is gone. Delete it and let the adjacency test cover the new seams.

**Decision**: accepted verbatim; deletion is now a requirement in its own right rather than a clause inside "update these files". Confirmed against the file: the test reaches for the inner rects of both buttons through `innerRect("reload-button")` (`:111`) precisely because they share an ancestor group, so after the split it has neither a subject nor a way to express one. This is also the repo's standing "delete what the change orphans" rule in its clearest form, and the finding is right that a rewrite would leave a test whose name documents a structure that no longer exists.

---

#### RESOLVED: Nothing verifies that the log event names survived the rename
The most consequential requirement in this spec is a negative: `SimulationReloaded` must not change. Nothing currently asserts it. A rename done with a project-wide find-and-replace on "Reload" would pass every existing test except the Hazbot rule-set tests, and only if those happen to exercise the affected categories. A single assertion that clicking Clear All logs `SimulationReloaded` would make the invariant visible and would fail loudly on exactly the mistake this story invites.

**Decision**: the assertion the finding asks for **already exists**, and the residual risk is narrower and nastier than described. `log-events.test.tsx:60-83` clicks the button by testid and asserts that `SimulationEnded` carries `reason: "SimulationReloaded"` and that a bare `SimulationReloaded` follows; `translate.test.ts:133` and `:145` and `helitack-run-window.test.ts:73` each iterate over the literal event-name strings. So a rename of the emitted string alone turns several suites red. What no in-repo test can catch is the specific mistake the finding names: a **global** find-and-replace renames the expectations along with the source and stays self-consistent. The requirement is therefore phrased as "the existing assertion keeps its expected strings; only its selector changes", which is the instruction that actually prevents it. One real backstop exists outside the test suite: `rule-sets/45,47,54.ts` are extracted artifacts whose `logEvents` and `details` name both strings, so a global rename would be reverted by the next re-extract and show up as an unexplained diff.

---

#### RESOLVED: The adjacency test's expected values are being rewritten by four stories in sequence
It asserts an exact chain of gaps across seven widgets. WM-47 removes one and adds one, WM-52 removes one, WM-48 adds one, WM-40 adds one, and the spacing variable may change under all of them. Whoever updates it each time will be reading the numbers off the running app rather than off a spec, which turns a regression test into a snapshot of whatever the code currently does.

**Decision**: accepted, and the board makes the fix concrete. The finished chain is fully specified there and is reproduced in the Technical Notes table above: nine widgets with gaps `3, 3, 3, -2, -2, -2, 3, -2`, spanning 218 to 885. So the expected values do not have to be read off the app at any point; they can be taken from that table. The practical rule this implies, and it is the same conclusion the first open question and the Product Manager finding reach from their own directions: whichever story is named as the owner of "the bar matches the board" re-derives the whole chain from the table in one pass, and the intervening stories change only the widget list, not the gap values. Two specifics for this story's turn: the seam that disappears is the one inside the Reload/Restart group, and the table's `-2` seams are built as `-1` per Michael's answer, so this story asserts `3, 3, -1, -1, 3, -1`.

---

### Product Manager

#### RESOLVED: This story's spacing bullet is the coupling point for four stories and it has no owner
Michael put the tightening in WM-47 because at the time the Fire Intensity Scale was still in the bar. It now describes a row that only exists after three other stories land. Somebody has to own "the bar matches the board", and right now that responsibility is split across four tickets, none of which says so. Naming the last story in the sequence as the one that re-measures the whole row would close it.

**Findings:** the finding is right and the deliverable is now cheap, because everything the owning story would need is written down. The board's finished row is fully specified in the Technical Notes table (nine widgets, their content and border widths, and the eight gaps), the spacing change is one variable, and measurement has ruled out the failure mode that would have forced an ordering: no intermediate span, up to 701px, overflows the bar at a 950px viewport. So naming an owner is a scheduling decision with no technical constraint attached, and the QA adjacency finding above gives that owner a concrete task: re-derive the whole gap chain from the table in one pass rather than four times from the browser.

**Decision**: accepted, and the owner is named in the resolved spacing question above: **whichever of WM-48 and WM-40 lands last** re-derives the full chain from the Technical Notes table against a 671px span. This story does the `9px -> 4px` variable change itself, so the value is no longer waiting on anyone.

---

#### RESOLVED: The Hazbot half is more than half the work and is not reflected in the estimate
The ticket is 2 points and reads as a button change. The spreadsheet edit needs Trudi's copy, a re-export, two generator runs, and a decision about the testid that ripples into `tour-map.tsx` and its invariant test. That is a cross-tool workflow with an external dependency on someone who has no Jira access.

**Findings:** the deep dive moved work onto both sides of the scale, so the net is not obvious. The Hazbot half grew: it is six authored cells rather than three, since `visualFeedback` is edited alongside `arrowText` on each of the three tabs, and the testid rename is now decided and touches **nine** files rather than the seven the ticket implies. The code half shrank in one place and grew in another: no asset work is needed, since "Clear All ICON" is the existing `reload.svg` glyph (proven by a coordinate diff), but the group split needs a width override to escape `.playbackButton`'s `!important` 60px lock, and one Cypress test is deleted rather than edited. What has not changed is the shape of the risk the finding identifies: the critical path runs through Sam, on Slack, for copy that gates the sheet export that gates two generator runs.

**Update, 2026-08-25: the external dependency is gone and the Hazbot half shrank to one mechanical rename.** Three of this finding's inputs no longer hold. Trudi authored the copy directly in the sheet and WM-54 extracted it, so the six authored cells are **zero**, and the sheet export and both generator runs are **already done and committed**. The routing premise was also wrong twice over: the copy is Trudi's rather than Sam's (corrected elsewhere in this spec), and there is now no one to wait on. What is left of the Hazbot half is the nine-file testid rename plus verifying the extracted strings, with no cross-tool workflow and no external blocker. **This does not by itself answer the question**, which is about whether 2 points is right; it removes the risk argument that was the strongest reason to say no.

**Decision**: **2 points stands** (Doug, 2026-08-26). Every input the finding rested on is gone: the copy is authored and extracted, the sheet export and both generator runs are committed, and there is no external dependency. What remains of the Hazbot half is the nine-file testid rename plus verifying the extracted strings, which is mechanical and enumerated.

---

### Education Researcher

#### RESOLVED: A find-and-replace on "Reload" would silently corrupt the longitudinal event series
`SimulationReloaded` and `TopBarReloadButtonClicked` are logged event names with history behind them, and they also appear inside rule-set `logEvents` arrays and authored `details` prose. Renaming them would break the Hazbot translator's switch, invalidate comparisons against previously collected data, and do so without any test failing that names the problem. This is the single highest-consequence risk in the story and it currently appears only as a bullet the ticket omitted.

**Decision**: the risk is real, is confirmed, and is now carried by a requirement rather than only by a note, but one clause needs correcting. It is not true that no test would fail: `log-events.test.tsx:60-83`, `translate.test.ts:133` and `:145`, and `helitack-run-window.test.ts:73` all assert the literal strings, so a rename of the emitted event alone fails loudly. The exact scenario the finding describes, a project-wide find-and-replace, is the one that slips through, because it renames the expectations too. Confirmed the surface: both names appear in `translate.ts:57-58`, and in the `logEvents` arrays and `details` prose of `rule-sets/45.ts`, `47.ts` **and** `54.ts` (the third was missing from the earlier list). Confirmed also, by reading the ticket description in full, that it says nothing about any of it. The requirement is phrased to prevent the specific mistake: the existing assertion keeps its expected strings and only its selector changes.

---

### Education Material Developer

#### RESOLVED: The sheet is about to disagree with the UI in a way the extractor cannot detect
`visualFeedback` will still say "Reload button outlined" while the button says Clear All, unless it is edited alongside `arrowText`. The extractor has no way to notice: it copies authored prose. So the drift would sit in the checked-in rule-sets, be quoted in the generated validation playbooks, and be read by the next person authoring an anchor as though it were current. The two columns should be edited in the same pass and the story should say so, which the ticket's step 1 does not.

**Decision**: accepted; it is a requirement, and the ticket's omission is confirmed by reading the description in full, where step 1 names `arrowText` only. One refinement to "the extractor has no way to notice": it has exactly one partial guard, `tour-data-impl.js:119-120`, which warns when the count of numbered lines in `visualFeedback` disagrees with the `arrowText` step count. That catches a structural mismatch and is blind to prose naming the wrong button, so the finding's conclusion stands. Practical consequence for the Sam question above: the message to him should carry both strings, since editing one without the other is the failure mode and he is the author of both.

---

#### RESOLVED: The "(Step 1 of 2)" suffix in the authored cell is validated but never rendered, and the copy edit will tempt someone to fix it
The authored string ends `(Step 1 of 2)`, which the generator validates and then strips, with the displayed numbers coming from the engine instead. Anyone editing these three cells for the first time will see that suffix and reasonably wonder whether it needs maintaining. It does need to stay correct, because the generator checks it, but it must not be treated as the source of what the student sees.

**Decision**: confirmed exactly as described, and now stated as a requirement so the editor is told rather than left to work it out. The mechanism is `STEPNUM_RE` at `tour-data-impl.js:21`; `:50` fails the build when a step line lacks the suffix, and `:54` fails when the number disagrees with the line's position. The parsed value is then discarded, and `tour-data.generated.ts` carries only the stripped text. So the suffix is a build-time assertion that the author's own numbering is self-consistent, which is a useful thing and not a vestige. The requirement reads that it stays exactly as it is, and the constraint has been folded into the Sam question so it reaches whoever writes the new copy.
