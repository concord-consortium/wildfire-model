# Implementation Plan: WM-47 Clear All button replaces Reload button and moves left of Setup

**Jira**: https://concord-consortium.atlassian.net/browse/WM-47
**Requirements Spec**: [requirements.md](requirements.md)
**Status**: **In Development**

## Verified before planning

Every layout number below was measured on the running dev server against a DOM+CSS prototype of the finished split (the pair dissolved, Clear All moved to the front, `$bottomBarWidgetGroupSpacing` at 4, the 66px override applied). Nothing was written to the working tree; the prototype was discarded by reloading the page.

| Assumption | Result |
|---|---|
| The split renders the requirement's gap chain | `3, 3, -1, -1, 3, -1` exactly |
| Widget border boxes | Clear All **68**, Setup 84, Spark 62, Restart **62**, Start 62, Fireline 67, Helitack 67 |
| `.mainContainer` | **481px** (from 485) |
| `.clearAll button { width: 66px !important }` beats `.playbackButton` (0,1,0) | Yes: content width resolves to **66**, border box **68**. Nested, the rule compiles to `.bottomBar .clearAll button`, so the specificity that matters is the emitted **0,2,1**, not the authored 0,1,1 |
| The `!important` is load-bearing, not ceremony | Yes, by negative control: the same declaration **without** `!important` loses to `.playbackButton`'s own `!important` and falls back to **60 content / 62 border box** |
| A `min-width: 66px` companion would be inert | Yes, by isolating control: `width: 66px !important` **alone** gives 66 / 68 with `min-width` still computing `.playbackButton`'s `60px`. The used width is `clamp(min-width, width, max-width)` and 60 never clamps 66, so the rule ships `width` only. Contrast `.placeSpark`, where the competing `min-width` (MUI's 64) *exceeds* the 60 target and both overrides are required |
| Each split button gets both top corners rounded | Both compute `border-top-left/right-radius: 10px` (each is now `:first-child` *and* `:last-child`) |
| Bar overflow at the new span | None |

Two findings changed the plan:

**The Clear All group loses its inherited `white-space: nowrap`.** Today the label is nowrap only because `.reloadRestart` declares it and the label inherits. A plain `.widgetGroup` computes `white-space: normal` (measured on Start's group), so after the split the two-word label is free to wrap. It does not wrap in practice: "Clear All" measures **53.94px** at `bold 14px Lato` and **56.80px** at the `Arial, sans-serif` fallback, both inside the 66px box. The resolved question below drops the declaration rather than carrying it onto `.clearAll`.

**`npx jest` reports 1009 passed / 79 suites on this branch.** The requirements' Technical Notes recorded 879, a figure that predates WM-54 and the intervening rule-set work; it has since been corrected there. Use 1009 as the baseline, and 1010 at the branch head, since step 2 adds the Clear All label assertion. Re-measure on the head commit before the PR body is written.

## Implementation Plan

### Rename the `reload-button` testid to `clear-all-button`

**Summary**: The mechanical half, landed first so it touches selector lines once and the next step touches geometry lines once. `ANCHOR_TESTIDS` and `tour-map.tsx` must move together or `tour-map.test.ts:34` fails, which is the guard rail that makes this step safe. No rendered output changes: the button still reads "Reload" after this commit, so the test prose this step rewrites (`it()` titles, `AfterClearAll`) leads the on-screen label by one commit and is correct only at the end of the branch.

**Files affected**:
- `src/components/bottom-bar.tsx`: the `data-testid` on the render (`:166`)
- `src/hazbot/wildfire/anchor-testids.ts`: the `"reload-button"` entry (`:13`)
- `src/hazbot/wildfire/tour-map.tsx`: three `anchor("reload-button")` calls (`:126,130,135`) and the three header comments above them that read `// 41 - Reload -> Start` and so on, all three of which name the button
- `src/hazbot/wildfire/build-tour.test.ts`: the literal selector assertion (`:58`)
- `src/components/bottom-bar.test.tsx`: 14 references, plus `it()` titles and comments naming the button, and the three `AfterReload` prose mentions at `:225-231` (see the resolved state-name question)
- `src/components/log-events.test.tsx`: two clicks (`:73`, `:509`)
- `cypress/support/elements/BottomBar.js`: `getReloadButton()` → `getClearAllButton()` (`:9-10`)
- `cypress/e2e/bottom-bar-state-machine.cy.ts`: the `expectButtonStates` `reload` key, the selector, six `it()` titles, the state-7 title's `AfterReload` (`:214`), and the file-header comment at `:23`, which names `bottomBar.getReloadButton()` as its example and would otherwise point at a method that no longer exists
- `cypress/e2e/bottom-bar-visuals.cy.ts`: the four selector references (`:72,95,115` and the comment at `:78`); its geometry is rewritten in the next step

**Estimated diff size**: ~70 lines

The render change:

```diff
-              data-testid="reload-button"
+              data-testid="clear-all-button"
```

`anchor-testids.ts`:

```diff
   "restart-button",
-  "reload-button",
+  "clear-all-button",
   "terrain-button",        // the "Setup" button
```

`tour-map.tsx`, all three entries, with their comments:

```diff
-  // 41 — Reload → Start.
+  // 41: Clear All -> Start.
   "41": {
-    2: () => [anchor("reload-button"), anchor("start-button")],
+    2: () => [anchor("clear-all-button"), anchor("start-button")],
   },
```

`cypress/e2e/bottom-bar-state-machine.cy.ts` renames the key as well as the selector, so the test vocabulary matches the button:

```diff
-  setup: boolean; spark: boolean; reload: boolean; restart: boolean;
+  setup: boolean; spark: boolean; clearAll: boolean; restart: boolean;
...
-  cy.get("[data-testid='reload-button']").should(states.reload ? "not.be.disabled" : "be.disabled");
+  cy.get("[data-testid='clear-all-button']").should(states.clearAll ? "not.be.disabled" : "be.disabled");
```

**Three strings inside these same files must NOT change.** They are logged data, not labels, and a regex broad enough to catch the prose will catch them too:

| String | Where | Why it stays |
|---|---|---|
| `SimulationReloaded` | `bottom-bar.tsx:332,344`, and as the `reason` on the preceding `SimulationEnded` | Logged event name with collected history behind it; consumed by `translate.ts:57` and named in `rule-sets/44.ts:70` and `46.ts:78`, which are extracted artifacts a re-extract would revert |
| `TopBarReloadButtonClicked` | `top-bar.tsx:22,25` | Same, and it belongs to a different button that is not changing |
| `"reload"` as a `CancelReason` | `bottom-bar.tsx:341`, the union at `fire-line-placement.ts:25`, asserted at `log-events.test.tsx:511` | The `reason` on a logged `FireLineCanceled`. **Not named in the requirements**; found by grep while planning |

Also untouched: `data-testid="reload"` on the top bar's page-reload control (`top-bar.tsx:43`), asserted in `log-events.test.tsx:97` and `top-bar.test.tsx:26`. Renaming `reload-button` by exact string is safe here; renaming on the substring `reload` is not.

Do the rename by exact token (`reload-button` → `clear-all-button`) and read the diff for the prose changes separately, rather than a single case-insensitive pass over the word "Reload".

**Verification**: `npx jest` (expect 1009 passed) and `npm run lint`. `tour-map.test.ts` is the specific one to watch: it fails if `ANCHOR_TESTIDS` and the map disagree.

Also `CI=true npx cypress open` in Chrome (WebGL needs it) for `bottom-bar-visuals.cy.ts` and `bottom-bar-state-machine.cy.ts`, before pushing rather than before merging: this step rewrites selectors in both, and the `cypress` job gates `s3-deploy`, so a missed selector means no branch build. Their assertions here are still the **pre-split** ones (the 122px pair, the 8px gaps) and are expected to stay green; step 2 is what rewrites them.

---

### Split the widget group, relabel to Clear All, move it left, and tighten the spacing

**Summary**: The visual change, in one commit because the Cypress geometry assertions are rewritten by both halves and splitting them would rewrite the same two assertions twice for no gain (the requirements' resolved spacing question makes this argument in full). At the end the row reads Clear All / Setup / Spark / Restart / Start / Fireline / Helitack, with Clear All at 68px border box and `.mainContainer` at 481px.

**Files affected**:
- `src/components/bottom-bar.tsx`: move the Clear All `Button` into its own `.widgetGroup` at the head of `.mainContainer`; Restart into its own group in place; relabel; rename `handleReload` to `handleClearAll` (`:167` and `:327`); and drop the stale half of the `handleClearAll` body comment at `:337`
- `src/components/bottom-bar.scss`: replace `.reloadRestart` with `.clearAll` + `.restart`; add the width override; fix the six comments that name the old structure or a value it changes
- `src/components/common.scss`: `$bottomBarWidgetGroupSpacing: 9px` → `4px` and its arithmetic comment
- `src/components/bottom-bar.test.tsx`: one new assertion on the rendered label (below)
- `src/models/simulation.ts` (`:147`) and `src/components/hazbot-button.tsx` (`:100`): one comment each, per the capitalization rule below
- `src/components/log-events.test.tsx`: prose only, and the file step 1 does not revisit. The `:63-64` comment (*"leaves Reload disabled"*, *"so Reload is enabled"*) and the `:504` `it()` title (*"logs reason 'reload' when Reload discards a placement"*). In that title the quoted lowercase `'reload'` is the `CancelReason` and **stays**; the capitalized word beside it is the button and changes
- `cypress/e2e/bottom-bar-visuals.cy.ts`: widths, the adjacency chain, `.mainContainer`, the file header; **delete** the paired-group test
- `CLAUDE.md` (`:125`, `:138`, `:141`, `:142`, `:144`): five lines that name the button, including the "Restart vs Reload behavior (important)" heading and two imperative instructions (*"you must **Reload** (not Restart) to clear sparks"*, *"use Reload, not Restart"*) that become impossible to follow once the label changes
- `docs/hazbot-validation/localhost-urls.md` (`:137`, `:145`, `:197`): three lines that name the button. **`:138` stays**: *"Reload the page entirely"* is the browser operation, not the control
- `LOGGED-EVENTS.md` (`:16`, `:36`): two lines that name the button, in a file already half-renamed by WM-46 (`:123` and `:128` say Clear All). **`:17` stays** (the top bar's control) and so does `:14` (*"user restarts/reloads"*, lowercase)
- `src/hazbot/TBD.md` (`:163`): quotes the `CLAUDE.md` section heading this step renames, so the cross-reference dangles otherwise
- `src/assets/bottom-bar/reload.svg` -> `clear-all.svg`: a `git mv` with no content change, plus the `ClearAllIcon` import at `bottom-bar.tsx:14`

**Estimated diff size**: ~145 lines

**`bottom-bar.tsx`.** The Clear All group becomes the first child of `.mainContainer`, ahead of `.terrainButton`:

```tsx
<div className={css.mainContainer}>
  <div className={`${css.widgetGroup} ${css.clearAll}`}>
    <Button
      className={css.playbackButton}
      data-testid="clear-all-button"
      onClick={this.handleClearAll}
      disabled={!simulation.reloadEnabled || ui.showTerrainUI}
      disableRipple={true}
    >
      <span><ClearAllIcon/><span className={css.playbackButtonLabel}>Clear All</span></span>
    </Button>
  </div>
  <div className={`${css.widgetGroup} ${css.terrainButton}`}>
```

and Restart keeps its position between Spark and Start, now in its own group:

```tsx
  <div className={`${css.widgetGroup} ${css.restart}`}>
    <Button
      className={css.playbackButton}
      data-testid="restart-button"
      onClick={this.handleRestart}
      disabled={!simulation.restartEnabled}
      disableRipple={true}
    >
      <span><RestartIcon/><span className={css.playbackButtonLabel}>Restart</span></span>
    </Button>
  </div>
```

One comment inside the handler also names the button and goes stale with the label. Its parenthetical was written to bridge the two names while the rename was pending; once the button says Clear All the "Reload" half is the wrong one:

```diff
-    // Reload (Clear All) clears Hazbot's per-category feedback levels too, so a full
+    // Clear All clears Hazbot's per-category feedback levels too, so a full
     // restart cannot open on "I'm all out of ideas". The top bar's refresh icon already
     // does this for free by reloading the page; this is what makes the two agree.
```

The following line's "by reloading the page" stays: it describes what the top bar's refresh icon does, not this button.

**The icon file is renamed with the button, the artwork is not.** `git mv src/assets/bottom-bar/reload.svg src/assets/bottom-bar/clear-all.svg`, and `bottom-bar.tsx:14` becomes `import ClearAllIcon from "../assets/bottom-bar/clear-all.svg"`. The resolved icon question proved the board's "Clear All ICON" is the same glyph, so no bytes of artwork change; this is the file name following the button, on the same seam as `handleClearAll` (see the resolved asset question below). `reload.svg` has exactly one importer, so the rename is two lines.

The SVG's **internal** metadata stays untouched: the source carries `id="Reload"`, `<title>Reload</title>` and `data-name="Reload"`, of which only `data-name` reaches the DOM (SVGO strips the other two at build time, verified in the running app). Nothing selects on it, `restart.svg` and `start.svg` carry the identical inert pattern, and editing that metadata is the specific thing WM-3 warned off. It is also invisible to both finish-line greps, since neither covers `*.svg`, so it is recorded here rather than left to look like a missed rename.

`simulation.reloadEnabled` and `simulation.reload()` keep their names, because they describe the model operation rather than the button; only the component's own `handleReload` becomes `handleClearAll`. See the resolved naming question below.

**`bottom-bar.scss`.** `.reloadRestart` goes; two rules replace it:

```diff
-  .reloadRestart {
-    white-space: nowrap;
-    // Start bubble abuts the Reload/Restart bubble (no gap)
-    margin-right: 0;
-  }
+  // Clear All is the one pill wider than 60. `.playbackButton` locks all three
+  // pills to `width: 60px !important` (the rule below explains why the
+  // !important is unavoidable there), so reaching 66 has to beat an !important
+  // declaration, which specificity alone cannot do. Nested, this compiles to
+  // `.bottomBar .clearAll button` (0,2,1) and outranks `.playbackButton` (0,1,0).
+  // `min-width` needs no companion override: `.playbackButton` pins it at 60,
+  // and the used width is clamp(min-width, width), so a floor below the target
+  // never binds. That is what separates this from `.placeSpark button`, where
+  // the competing min-width is MUI's 64 and so exceeds that rule's 60 target.
+  .clearAll {
+    button {
+      width: 66px !important;
+    }
+  }
+
+  // Start bubble abuts the Restart bubble (no gap)
+  .restart {
+    margin-right: 0;
+  }
```

Six comments in this file name the structure being dissolved, or a value this change makes wrong, and stop being true:

- `.placeSpark`'s trailing `// Spark bubble abuts the Reload bubble (no gap)`: now the Restart bubble. The `margin-right: 0` itself is unchanged.
- `.placeSpark`'s block comment, *"pill buttons (Reload / Restart / Start) avoid this…"*: the pill list is now Clear All / Restart / Start.
- `.placeSpark`'s *"The tag selector `.placeSpark button` has specificity 0,1,1"*: it is 0,2,1, for the same reason the `.clearAll` comment below gives. The conclusion it draws is unaffected (0,2,1 also beats 0,1,0), but the new comment names this rule as the contrasting case *at the same 0,2,1*, so the two would disagree about the same selector 70 lines apart.
- `.fireLineButton`'s *"Same trick as .placeSpark / .reloadRestart"*: now `.restart`.
- `.playbackButton`'s *"Reload / Restart / Start each render at 66 px … instead of the spec's 62 / 122"*. The 122 pair is gone, and 66 is now Clear All's correct width, so as written this comment reads as though the bug it describes is the intended state. Rewrite it to name the three pills and the single 62 they default to, keeping the mechanism (max(min-width, width), emotion source order) that is the reason the rule exists.
- `.playbackButtonLabel`'s *"playback labels (Reload / Restart / Start / Stop)"*: the list is now Clear All / Restart / Start / Pause.

**`common.scss`.** One variable and its arithmetic:

```diff
 // Margin-right value applied to .widgetGroup. With the paired -1px
 // margin-left (border-continuity trick at bottom-bar.scss), the net
-// outer-to-outer visible gap between adjacent widgets is 9 - 1 = 8 px,
-// matching the spec's "8 px visible / 10 px content-edge gap".
-$bottomBarWidgetGroupSpacing: 9px;
+// outer-to-outer visible gap between adjacent widgets is 4 - 1 = 3 px,
+// matching the board's "3 px visible / 5 px content-edge gap".
+$bottomBarWidgetGroupSpacing: 4px;
```

**`bottom-bar.test.tsx`.** The relabel is this story's headline requirement and, as the branch stands, the only one nothing can fail on: every test that touches the button finds it by `data-testid`, so deleting the word "Clear All" from the JSX leaves the whole suite green. That matters more here than for an ordinary label, because the three Hazbot tour steps read *"First, click **Clear All** to reset your model"* and the coach mark rings this button, so a drifted label puts a ring on a control whose name contradicts the instruction. Nothing in the repo compares those two strings.

One assertion, in Jest rather than the Cypress visuals spec because it is a component-level fact about rendered copy rather than geometry: it belongs beside the existing label assertions and follows the `toHaveTextContent` precedent at `:194` (`start-button` → "Pause"). (Both suites gate in CI, so this is a placement choice rather than a coverage one.) It belongs to this step rather than the testid rename, which deliberately leaves the button reading "Reload":

```ts
it("renders the Clear All button with label 'Clear All'", () => {
  render(<Provider stores={stores}><BottomBar /></Provider>);
  expect(screen.getByTestId("clear-all-button")).toHaveTextContent("Clear All");
});
```

Place it in `describe("BottomBar component")`, beside `renders basic components` and the two presence assertions. That block already declares the `stores` / `beforeEach` the snippet assumes and needs no `seedState`, which is the property that separates this assertion from every existing `toHaveTextContent` call: `:194`, `:251` and `:265` all guard the `start-button` "Start"/"Pause" ternary and so all live in state-dependent blocks. This label does not vary with state.

**Prose outside the bottom bar, and the rule that selects it.** The repo distinguishes the button from the model operation by capitalization, not by file, and the rule reaches past `src/` and `cypress/` into the checked-in documentation: lowercase "reload" is always the operation (`stores.ts:67` "a page reload", `use-draw-fire-line-interaction.tsx:14` "(restart, reload)", `simulation.test.ts:26` "after model reload", `bottom-bar.test.tsx:288` "after reload"), and capital "Reload" is never the operation. So the capitalized sites are the ones that go stale, wherever they live:

```diff
 // True from the first Start until the fire stops burning, pauses included: a run the
-// student paused is still a run in progress. Restart and Reload clear
+// student paused is still a run in progress. Restart and Clear All clear
 // simulationStarted, so they end it too.
```

```diff
 // Ready/pulse predicate. The simulationStarted term keeps the pulse off in the
-// pre-run / terrain-setup state and auto-hides a stale arm after Restart/Reload
+// pre-run / terrain-setup state and auto-hides a stale arm after Restart/Clear All
 // (both clear simulationStarted without routing through start()).
```

**The same rule picks out eight lines of documentation**, and they are the ones most likely to be skipped because they are not code. `CLAUDE.md` carries five: `:125` (*"you must **Reload** (not Restart) to clear sparks"*), the `:138` heading *"Restart vs Reload behavior (important)"*, `:141`, `:142` and `:144` (*"use Reload, not Restart"*). Its whole job is to tell the next session which control to click during a Playwright validation walk, so two of those five are instructions that stop being followable. `docs/hazbot-validation/localhost-urls.md` carries three: `:137`, `:145` and `:197`. That file is hand-maintained rather than generated, confirmed by reading the generator: `scripts/generate-hazbot-validation-playbook.js:25-26` writes only `<id>.md` files, and the file's own header says to regenerate it by re-exporting the LARA sequence.

The capitalization rule earns its keep here rather than needing a special case: `localhost-urls.md:138` reads *"Reload the page entirely"*, which is the browser operation, and **stays**. The numbered `docs/hazbot-validation/<id>.md` playbooks need nothing at all: they are generated from the rule-sets and already quote Trudi's Clear All copy from WM-54.

Three further capitalized sites **stay**: `canonical-runs.ts:19`, `types.ts:32` and `translate.test.ts:76` each read `Restart / Reload / TopBarReload`, where the capitals are shorthand for the log event names `SimulationRestarted` / `SimulationReloaded` / `TopBarReloadButtonClicked`. `canonical-runs.ts:19` says so in its own next clause: *"all log `SimulationEnded` before their reset event"*. Those events do not rename, so neither does the shorthand.

That gives a greppable finish line for this step, but only if it names the deliberate survivors, or it returns five hits a reader cannot triage:

```bash
grep -rn "Reload" src/ cypress/ --include=*.ts --include=*.tsx --include=*.js --include=*.scss
```

That command covers the code only. The prose lives in Markdown, half of it outside `src/` and `cypress/` altogether, so it needs its own line:

```bash
grep -rn "Reload" --include=*.md . | grep -v node_modules | grep -v '^./specs' \
  | grep -vE '^\./docs/hazbot-validation/[0-9]+\.md'
```

`specs/` is history and the numbered validation playbooks are generated from the rule-sets, which already say Clear All. After this step that second grep returns only three things: `LOGGED-EVENTS.md:14,17` (the lowercase operation and the top bar's control), `localhost-urls.md:138` (*"Reload the page entirely"*, the browser operation, called out as a keep in the Files affected list above), and the `SimulationReloaded` / `TopBarReloadButtonClicked` event names.

After this step every hit of the first grep is one of exactly three things: a `TopBarReload` triple (`canonical-runs.ts:19`, `types.ts:32`, `translate.test.ts:76`); the `SimulationReloaded` and `TopBarReloadButtonClicked` log event names; or `top-bar.tsx` and `top-bar.test.tsx`, which belong to the page-level reload this story does not touch. Anything else is a miss. The `ReloadIcon` / `reload.svg` class that used to sit here is gone, because the asset is renamed with the button.

That framing is what surfaced the three `log-events.test.tsx` prose lines above. `:504` is the case worth reading twice, because it carries the string that must change and the string that must not on the same line, four characters apart: `it("logs reason 'reload' when Reload discards a placement")`.

**`bottom-bar-visuals.cy.ts`.** Four changes, and the expected values come from the requirements' Technical Notes table rather than from the browser (the resolved QA finding on this file makes that the standing rule):

1. `renders each per-button widget at its spec Border w. value` gains **two** assertions, not one: `widgetRect("clear-all-button")` at 68 and `widgetRect("restart-button")` at 62. Both are required, because item 2 below deletes the only test that covers Restart's width today. That test asserts Setup / Spark / Start / Fireline / Helitack and has never named Restart, whose 60px content width was only ever implied by the 122px pair.
2. `renders the Reload+Restart paired group at its shared Border w. value` is **deleted**: its 122px subject no longer exists, and the width it asserted is covered by the two new per-widget assertions.
3. `renders 0 px gap within the Reload+Restart paired group` is **deleted**, per the resolved QA finding. There is no within-pair gap left to assert, and `innerRect` exists only to serve it. Delete `innerRect` too if nothing else uses it.
4. `renders the correct visible gap at every widget adjacency` becomes seven widgets and six gaps, and `shrink-wraps the controls cluster to its six widget groups` becomes seven groups at 481:

```ts
const ids = [
  "clear-all-button", "terrain-button", "spark-button", "restart-button",
  "start-button", "fireline-button", "helitack-button"
];
...
expect(rects[1].left - rects[0].right, "Clear All -> Setup").to.eq(3);
expect(rects[2].left - rects[1].right, "Setup -> Spark").to.eq(3);
expect(rects[3].left - rects[2].right, "Spark -> Restart (abuts)").to.eq(-1);
expect(rects[4].left - rects[3].right, "Restart -> Start (abuts)").to.eq(-1);
expect(rects[5].left - rects[4].right, "Start -> Fireline").to.eq(3);
expect(rects[6].left - rects[5].right, "Fireline -> Helitack (abuts)").to.eq(-1);
```

The file header comment describes "the Reload+Restart shared widgetGroup width" and "8 px default" gaps; both are rewritten with the rest.

**Verification**: `npx jest`; `CI=true npx cypress open` in Chrome (WebGL needs it) for `bottom-bar-visuals.cy.ts` and `bottom-bar-state-machine.cy.ts`. Run both before pushing, not just before merging: the `cypress` job runs the whole `cypress/e2e/` suite on every push and gates `s3-deploy`, so every number in this step (68, 62, the gap chain, 481) has to be right for the branch build to exist at all. Also take a Playwright screenshot of `.mainContainer` compared against the Zeplin board's "Bottom Controls" group. The board draws Vegetation Key and Speed, which are not in this row yet, so compare Clear All's width and position and the gaps, not the row total. Expect the app's row to be **671px** and the board's 667 to be superseded once WM-48 and WM-40 land, per the resolved seam question.

---

### Verification pass: the Hazbot artifacts (no commit expected)

**Summary**: Not a code change. WM-54 authored, extracted and generated all of it, so this step's success condition is that nothing changes. It is listed as a step because the requirements make it a deliverable and because a diff here means something upstream is wrong.

**Files affected**: none, if it passes.

1. `arrowText` on rule-sets **41, 44, 46** reads `1. Hazbot: First, click **Clear All** to reset your model. (Step 1 of 2)`. Confirmed present at `41.ts:28`, `44.ts:28`, `46.ts:28` while planning.
2. `visualFeedback` on the same three reads `1. Clear All button outlined; coach mark points to Clear All button`. Confirmed at `:26` in each.
3. `feedbackRound2` on the same three reads `Hazbot: If you have changed the model setup, click **Clear All** to reset the model and run it again!`. Confirmed at `:22` in each. Check it even though it is not tour copy: `feedback-levels.ts:34` renders it as the level-2 rung, so it is the only one of the three rendered straight from the rule-set, with no generated artifact and no assertion between the authored cell and the screen.
4. `npm run generate-hazbot-tour-data && git diff --exit-code` produces **no diff**. `tour-data.generated.ts` contains no testids (verified: zero matches), so the previous step's rename does not invalidate it; a diff here means the committed rule-sets and the generated file disagree.
5. `APP_RULES_VERSION` is not touched. It is `8` at `src/hazbot/wildfire/rules-version.ts:7`.
6. Walk one tour end to end with Playwright to confirm the coach mark rings the renamed control: load `?hazbotRules=41&hazbotSidebar=true`, drive category 2, and check the ring lands on the button now labeled Clear All. This is the one thing no test covers, because `tour-map.test.ts` pins step counts and testid membership but never renders.

## Open Questions

### RESOLVED: Does the Clear All group carry `white-space: nowrap` forward, or drop it?
**Context**: `.reloadRestart` declares `white-space: nowrap` and the label inherits it. A plain `.widgetGroup` computes `normal` (measured on Start's group), so the declaration disappears unless it is moved onto `.clearAll`. Measured, the label does not wrap either way: "Clear All" is 53.94px in Lato and 56.80px in the Arial fallback, both inside the 66px box, so there is 9px of slack in the worse case. The catch is that no test can distinguish the two choices, since deleting a `nowrap` that nothing needs leaves the suite green, which by this repo's standing rule makes a test for it decoration.
**Options considered**:
- A) Carry it onto `.clearAll` with a one-line comment saying it is the only two-word playback label. Preserves today's behavior exactly; costs one unverifiable line.
- B) Drop it. It is a declaration the change orphans, the measurement says it is not doing any work, and Start's group already runs without it.
- C) Drop it and instead widen the safety margin explicitly by asserting the label's rendered height in the Cypress visuals spec. Catches a future font or copy change that would wrap, at the cost of a test that passes today for reasons unrelated to the assertion.

**Findings:** the declaration cannot affect layout, and that is measured rather than reasoned from the CSS. `.playbackButtonLabel` is `position: absolute; width: 100%; text-align: center`, so the label does not participate in the button's shrink-wrap at all: a wrap could only push the text onto a second line, never change the widget's width or the row's gap chain. Prototyped live on the running dev server (relabel to Clear All, force the button to 66px, set the group to `white-space: normal`) the label stays one line at 24.5px in both Lato (53.94px) and the Arial fallback (56.80px). The negative result is meaningful rather than vacuous because a control stress case, the label text replaced with `"Clear Everything"`, does go to 49px, so the wrap mechanism is live at this width.

**Decision**: **B, drop it** (Doug, 2026-08-26). The declaration is vestigial, and `.playbackButtonLabel`'s own comment is the evidence: it records that the label used to be an inline-flow text node and was wrapped in a span so it could be positioned independently. The inline-flow text node is what a group-level `nowrap` was protecting, and it stopped existing when that span was introduced. So this is the repo's standing "delete what the change orphans" rule rather than a safety margin being given up. Option C is rejected on the repo's own test rule: a rendered-height assertion would not fail if the `nowrap` line were deleted, so it does not guard the thing this question is about; it guards the label copy and the width override, which are already covered.

---

### RESOLVED: Do the model-level `reload` names stay as they are?
**Context**: The requirements scope the rename to the label and the testid, and say the behavior and enable rule are unchanged. That leaves `simulation.reload()`, `simulation.reloadEnabled` (`simulation.ts:162,445`) and the component's `handleReload` (`bottom-bar.tsx:327`) still named after the old label. They are not logged values, so unlike `SimulationReloaded` there is no data-integrity reason to keep them; but `reload()` genuinely describes what the model does (restore authored defaults) and reads consistently with the `SimulationReloaded` event it emits.
**Options considered**:
- A) Leave all three. The plan above assumes this. The diff stays inside the bottom bar and its tests, and the model API keeps the vocabulary its logged event uses.
- B) Rename `handleReload` → `handleClearAll` only. It is the component's own handler for a button now called Clear All, and it is private to `bottom-bar.tsx`, so the rename is contained.
- C) Rename all three, including `simulation.reload()` / `reloadEnabled`, spreading into `simulation.ts`, its tests, and every `expectButtonState` call site.

**Findings:** the cost of each option was counted rather than estimated. Option C touches **21 lines across 7 files**: `simulation.ts` 4 (the two declarations plus two comment mentions), `simulation.test.ts` 7 (including a `describe("reloadEnabled")` block), `bottom-bar.tsx` 4, `bottom-bar.test.tsx` 2, `log-events.test.tsx` 1, `terrain-panel.test.tsx` 1, `bottom-bar-state-machine.cy.ts` 3. Option B touches **2 lines**, both in `bottom-bar.tsx` (`:167` and `:327`); `handleReload` has no reference outside that file. Note the Cypress `expectButtonStates` `reload` key is not part of any of these options: it is a testid-side rename already owned by the first implementation step.

**Decision**: **B, rename `handleReload` to `handleClearAll` and leave the model API alone** (Doug, 2026-08-26). The split is the useful one because the two layers name different things. `handleReload` is named after a **button**, and that button's name changed, so it has drifted in exactly the way the testid did. `reload()` and `reloadEnabled` are named after a **model operation**, restoring the authored defaults, which this story does not change, and which is also the vocabulary of the `SimulationReloaded` event the operation emits. Renaming those would put a `clearAll()` next to a `SimulationReloaded` emit and make the model read less consistently, not more, while dragging `simulation.test.ts` into a story whose requirements scope the change to the label and the testid. Option A was rejected because it leaves a two-line drift of precisely the kind the resolved testid question refused to leave.

---

### RESOLVED: Do the state-machine state names get renamed along with the titles?
**Context**: Both state-machine specs name states from the design's state table: `state 7 (AfterReload from SetupChanged)`, and comments referring to "AfterReload" coverage (`bottom-bar.test.tsx:225-231`). The `it()` titles that say "Reload enabled" clearly become "Clear All enabled", but "AfterReload" is a state identifier shared with the design document, and renaming it here makes the code and the board disagree unless the board's state table has been relabeled too. The requirements say the board introduces Clear All at state 2 but do not say what state 7 is now called.
**Options considered**:
- A) Rename the enable-state prose ("Reload enabled" → "Clear All enabled") but keep `AfterReload` as the state identifier, matching whatever the design table still calls it.
- B) Rename both, on the grounds that a state named after a button nobody can see is the same drift as a testid named after one.
- C) Check the board's state table first and follow it.

**Findings:** the question's premise is false, which collapses option C into a straight answer. The board carries **no CamelCase state names at all**: its state table is seven numbered prose lines, and state 7 reads in full `7: If Clear All is pressed: return to Default; clears model`. So the line `AfterReload` is derived from already says Clear All. The CamelCase names were coined in this repo by `specs/WM-24-model-controls-states.md`, a closed spec, not published by the design. The surface is also smaller than the question implies: `AfterReload` appears **4 times in code, all of them prose and never as a symbol**: one `it()` title (`bottom-bar-state-machine.cy.ts:214`) and three comment lines (`bottom-bar.test.tsx:225-231`). It appears twice more in the closed WM-24 spec, which is history and is not edited. `Default`, `SetupChanged`, `SparkPlaced`, `Restarted` and `SetupOpen` are unaffected, because only state 7 names a renamed button.

**Decision**: **B, state 7 becomes `AfterClearAll`** (Doug, 2026-08-26). Since the board's own state-7 line says Clear All, renaming brings the repo into agreement with the design rather than out of it, and option A's stated justification (matching the design table) does not exist. It also follows the same seam as the naming decision above: `AfterReload` names the **button press** that causes the transition, which is what changed, not the model operation, so it moves with `handleReload` while `simulation.reload()` stays.

**One deliberate consequence, recorded so a reviewer does not chase it.** After this, `bottom-bar.test.tsx` carries an `AfterClearAll` comment a few lines from tests that assert the literal `SimulationReloaded`. That disagreement is correct: the first names a button, the second is a logged event name that must not change.

## Self-Review

### DevOps Engineer

#### RESOLVED: CI runs Cypress, and three places in these specs say it does not

Both spec files assert that CI runs `npm run build` and `npm run test:coverage` **only**, and one implementation decision is justified by that premise: *"One assertion, in Jest rather than the Cypress visuals spec because CI runs `npm run build` and `npm run test:coverage` only, so a Cypress assertion would document the regression without gating it"* (`implementation.md`, the `bottom-bar.test.tsx` paragraph of step 2). The same claim appears twice in `requirements.md`, once in Technical Notes and once inside a Senior Engineer decision that prefixes it with "Confirmed".

It is false. `.github/workflows/ci.yml` has a second job, `cypress`, that runs `cypress-io/github-action@v6` against `npm start` in Chrome on every push, over every spec in `cypress/e2e/`, and `s3-deploy` lists it alongside `build_test` under `needs:`. Verified live rather than read off the YAML: the most recent master run (32904614426) reports `Build and Run Jest Tests: success`, `cypress: success`, `S3 Deploy: success`.

Three consequences, and the first two are in this story's favor:

- **Every geometry number step 2 writes is CI-gated.** Clear All at 68, Restart at 62, the `3, 3, -1, -1, 3, -1` chain and `.mainContainer` at 481 all live in `bottom-bar-visuals.cy.ts`, which CI runs and which blocks the branch build. The spec currently reads as though those assertions were local-only documentation.
- **The gap the Senior Engineer finding identified is narrower than stated.** Cypress does not compare `tour-data.generated.ts` against the rule-sets either, so that conclusion survives, but the premise it rests on has to be restated: the hole is that no job runs `npm run generate-hazbot-tour-data`, not that CI runs only two commands. It also means the Out of Scope item has an obvious home (a step in the existing `build_test` job).
- **The label assertion still belongs in Jest**, but for a different reason than the one given: it is a component-level fact about rendered copy, and Jest is where the neighboring `toHaveTextContent` precedent lives. The stated reason has to change or it will read as authoritative and wrong.

**Decision**: accepted in full (Doug, 2026-08-26); all five edits applied. `requirements.md` Technical Notes and the Senior Engineer decision now describe the two gating jobs and restate the hole as "no job runs `npm run generate-hazbot-tour-data`", which is what is actually true; the Out of Scope item names `build_test` as the CI step's home; `implementation.md`'s label-assertion paragraph is re-justified on placement (a component-level fact about rendered copy, beside the existing `toHaveTextContent` precedent) rather than on coverage; and step 2's Verification says to run Cypress before pushing, since the `cypress` job gates `s3-deploy` and the branch build.

**Follow-up from the re-review pass**: resolving this left step 1's Verification stale, since it read `npx jest` and `npm run lint` only while the step rewrites selectors in `bottom-bar-visuals.cy.ts`, `bottom-bar-state-machine.cy.ts` and `BottomBar.js`. It now calls for the same Chrome Cypress run as step 2, before pushing, and notes that step 1's Cypress assertions are still the pre-split ones and should stay green.

---

### Technical Writer

#### RESOLVED: Two hand-maintained docs instruct the reader to click "Reload" and neither spec lists them

The plan's file inventory stops at `src/` and `cypress/`. Two documents outside both name the bottom-bar button by its on-screen label and tell a reader to click it, so they go stale the moment step 2 lands:

- **`CLAUDE.md`**, five lines: `:125` (*"you must **Reload** (not Restart) to clear sparks"*), `:138` (the section heading *"Restart vs Reload behavior (important)"*), `:141` (*"**Reload** is a full reset..."*), `:142` (*"**Reload also clears Hazbot's per-category feedback levels**"*), and `:144` (*"use Reload, not Restart"*). This is the file every future session in this repo loads as context, and its whole purpose is to tell the reader which control to click during a Playwright validation walk.
- **`docs/hazbot-validation/localhost-urls.md`**, three lines: `:137` (*"Click **Reload** (full reset)"*), `:145` (*"Use **Reload** + page navigation to fully clear"*), and `:197` (*"not Restart or Reload"*). Confirmed hand-maintained rather than generated: `scripts/generate-hazbot-validation-playbook.js` writes only `<id>.md` files (`:25-26`), and this file's own header says to regenerate it by re-exporting the LARA sequence.

One line in that file stays: `:138`'s *"Reload the page entirely"* is the browser operation, not the button, and it is the same lowercase/capitalized distinction step 2 already uses to select comment sites in `src/`.

The repo's standing rule is to update the prose a change invalidates, naming `CLAUDE.md` descriptions of behavior explicitly, so this is squarely in scope for the commit that relabels the button. It is roughly eight lines and belongs in step 2.

**Decision**: accepted in full (Doug, 2026-08-26). Both files are now in step 2's Files affected list with their line numbers, the step's estimated diff size goes 130 to 140, and the requirements' prose-fallout table carries both rows. The capitalization rule that step 2 already uses to select comment sites in `src/` is restated as reaching into the checked-in documentation, which is what makes `localhost-urls.md:138` (*"Reload the page entirely"*, the browser operation) a keep rather than a special case, and the generated `docs/hazbot-validation/<id>.md` playbooks an explicit no-op.

`specs/WM-17-hazbot-visual-feedback-overlay-renderer/requirements.md:60,145` also name the Reload button and the `reload-button` testid, and are deliberately **not** touched: that spec was already stale before this story, since it still names rule-sets 42/45/47 that WM-54 renumbered, so correcting it is unrelated cleanup rather than fallout from this change.

---

### QA Engineer

#### RESOLVED: The step-2 "greppable finish line" does not hold, and it hides three stale sites the plan omits

Step 2 closes with: *"That gives a greppable finish line for this step: after it, capital 'Reload' survives only inside a `TopBarReload` triple."* Run against the tree the plan describes, the grep does not come back clean, and two of the survivors are sites the plan should have listed.

Deliberately kept, and so a false finish line rather than a defect:

- `bottom-bar.tsx:14`, `import ReloadIcon from "../assets/bottom-bar/reload.svg"`. *(Superseded by the resolved asset question below: step 2 now renames both, so this class of survivor no longer exists and the finish line names three, not four.)*
- `top-bar/top-bar.tsx:19` (`const handleReload`) and `top-bar/top-bar.test.tsx:18` (`describe("Reload button")`). The page-level reload is out of scope by requirement.

Genuinely stale, and missing from the plan:

- `log-events.test.tsx:63-64`, the comment *"simulationStarted alone leaves Reload disabled and userEvent.click would no-op. Add a spark so Reload is enabled"*. Both mentions are the button, not the operation.
- `log-events.test.tsx:504`, the `it()` title *"logs reason 'reload' when Reload discards a placement"*. The quoted lowercase `'reload'` is the `CancelReason` and must not change, which the plan already says; the capitalized "Reload" beside it is the button and must.

Step 1's inventory for that file reads *"two clicks (`:73`, `:509`)"*, which is exactly right for the testid rename and is why these three lines fall between the two steps: they are prose, so they belong with the relabel in step 2, and step 2's file list does not mention `log-events.test.tsx` at all. The finish line as written would have caught them, which is what makes it worth fixing rather than deleting: restated as "capital Reload survives only in `ReloadIcon`, in `top-bar*`, and inside a `TopBarReload` triple", it becomes a check that actually passes and actually fails on a miss.

**Decision**: accepted in full (Doug, 2026-08-26). `log-events.test.tsx` is now in step 2's Files affected list as a prose-only entry, flagged as the file step 1 does not revisit, with the `:504` title's lowercase `'reload'` `CancelReason` marked as a keep. The finish line is rewritten to name its four classes of deliberate survivor (`TopBarReload` triples, the two log event names, `ReloadIcon` / `reload.svg`, and `top-bar*`) and to carry the runnable grep, so it now fails on a miss instead of returning five hits a reader cannot triage. The requirements' prose-fallout row for that file is extended to match. *(Later superseded in one detail by the resolved asset question: the `ReloadIcon` / `reload.svg` class is gone, so the finish line names three survivor classes rather than four, and gained a second grep over Markdown.)*

---

### Senior Engineer

#### RESOLVED: The proposed `.clearAll` comment ships a wrong specificity value and a misleading analogy

The comment step 2 adds above the width override reads: *"`.clearAll button` is 0,1,1 against `.playbackButton`'s 0,1,0, the same class-plus-tag pattern as `.placeSpark button` and `.fireLineButton button`."* The same 0,1,1 appears in the "Verified before planning" table. Both halves are wrong, and the comment is the one that would ship.

Measured by compiling `bottom-bar.scss` with the proposed rule in place: because `.reloadRestart` (and therefore its replacement) is nested inside `.bottomBar`, sass emits **`.bottomBar .clearAll button`**, which is **0,2,1**, not 0,1,1. `.playbackButton` compiles un-nested at 0,1,0, as the comment says.

The analogy is the more misleading half, because it points the next reader at two rules that do not need what this one needs. `.placeSpark button` and `.fireLineButton button` carry **no `!important`**: at 0,2,1 they already outrank MUI's `.MuiButton-root { min-width: 64px }` at 0,1,0, so plain specificity is enough. `.clearAll button` needs `!important` for a different reason, which is that it has to beat `.playbackButton`'s own `!important`, and an important declaration wins over a non-important one at any specificity. Read the comment as written and the natural conclusion is that the `!important` pair is copied ceremony that could be dropped.

The `!important` is load-bearing, verified rather than reasoned: a throwaway page reproducing the three rules in source order (static sheet, then an emotion-style `.MuiButton-root` block) resolves the button to **66px content / 68px border box** with the `!important` pair and falls back to **60/62** with it removed, while a solo `.playbackButton` computes `border-top-left-radius` and `border-top-right-radius` at 10px each and the three-group chain renders `3, 3, -1`. So the rule is right and only its explanation is wrong.

Suggested: state the real reason the override needs `!important` (it outranks another `!important`, which specificity alone cannot do), give 0,2,1, and either drop the `.placeSpark` / `.fireLineButton` analogy or mark it as the contrasting case.

**Decision**: accepted in full (Doug, 2026-08-26). The SCSS comment is rewritten to lead with the real mechanism (the override has to beat another `!important`, which specificity alone cannot do), to give the emitted `.bottomBar .clearAll button` at 0,2,1, and to name `.placeSpark button` / `.fireLineButton button` as the contrasting case rather than the same pattern. The Verified table's row is corrected to 0,2,1 with a note that the authored 0,1,1 is not what sass emits, and a second row records the negative control: without the `!important` pair the rule falls back to 60 content / 62 border box.

---

### Technical Writer (second pass)

#### RESOLVED: Two more hand-maintained docs name the button, and the step-2 finish line is scoped so it cannot see them

The resolved Technical Writer finding above says *"The plan's file inventory stops at `src/` and `cypress/`. **Two** documents outside both name the bottom-bar button"*. There are four, and the two it names are the two the plan now covers. The other two are still missing from step 2's Files affected list:

- **`LOGGED-EVENTS.md`**, two lines. `:16` reads `| SimulationReloaded | — | User clicks Reload (bottom bar) |`, and `:36`'s `FireLineCanceled` prose ends *"the Escape key, a second click on the Fire Line button, switching to Helitack, or pressing Start, Restart or Reload."* Both are the bottom-bar button under step 2's own capitalization rule. `:17` (*"User clicks Reload (top bar)"*) and `:14` (*"user restarts/reloads"*) stay, being the page-level control and the lowercase operation. What makes this more than an omission is that the file is already half-renamed: `:123` and `:128` read *"the routes are Clear All and ending the page session"* and *"Segment on `SimulationReloaded`, which Clear All logs unconditionally"*, written by WM-46 ahead of the label change. Leaving `:16` and `:36` makes one document describe the same button under both names.
- **`src/hazbot/TBD.md:163`** quotes the `CLAUDE.md` section heading step 2 renames: *"Documented in [CLAUDE.md](../../CLAUDE.md) "Restart vs Reload behavior.""* That is the repo's named repeat offense in its exact form, a comment header in another file quoting the contract being changed, and it leaves a cross-reference to a heading that no longer exists.

**Neither is reachable from step 2's finish line.** That grep is `grep -rn "Reload" src/ cypress/ --include=*.ts --include=*.tsx --include=*.js --include=*.scss`: `LOGGED-EVENTS.md` is outside both directories, and `TBD.md` is inside `src/` but excluded by the `--include` list. So the check the plan added specifically to fail on a miss returns clean while two documents are stale.

Verified by `grep -rln "Reload" --include=*.md . | grep -v node_modules | grep -v '^./specs'`. Outside `specs/` the complete list is `CLAUDE.md`, `LOGGED-EVENTS.md`, `docs/hazbot-validation/localhost-urls.md`, `src/hazbot/TBD.md`, and the generated `docs/hazbot-validation/44.md` and `46.md`, whose only hits are the `SimulationReloaded` log event name inside the extracted `Details` prose (no change).

**Decision**: accepted in full. Both files are in step 2's Files affected with their line numbers, the step's estimated diff goes 140 to 143, the requirements' prose-fallout table carries both rows, and the finish line gains a second grep over Markdown (excluding `specs/`, which is history, and the numbered validation playbooks, which are generated from rule-sets that already say Clear All). After the step that second grep should return only `LOGGED-EVENTS.md:14,17` and the two log event names.

---

### Senior Engineer (second pass)

#### RESOLVED: The `min-width: 66px !important` half of the width override does nothing, and the negative control that was run cannot see that

The Verified-before-planning table records *"The `!important` pair is load-bearing, not ceremony: Yes, by negative control: the identical rule **without** `!important` loses to `.playbackButton`'s own `!important` and falls back to 60 content / 62 border box."* That control removes `!important` from both declarations at once. It proves the `!important` matters; it says nothing about whether the second declaration does.

Measured live against the running dev server, by prototyping the split in the DOM (Clear All moved to the head of `.mainContainer`, Restart in its own group, group spacing at 4) and cycling four variants of the rule on the Clear All button:

| Rule on `.clearAll button` | button | widgetGroup | computed `min-width` |
|---|---|---|---|
| `width: 66px; min-width: 66px` (no `!important`) | 60 | 62 | 60px |
| `width: 66px !important` **alone** | **66** | **68** | 60px |
| `min-width: 66px !important` alone | 66 | 68 | 66px |
| both, `!important` (as planned) | 66 | 68 | 66px |

`width: 66px !important` on its own already gives 66 content / 68 border box, with `min-width` left at `.playbackButton`'s 60. The used width is `clamp(min-width, width, max-width)`, and 60 is *below* the 66 target, so it never clamps.

**The reason this is worth more than one deleted line is the comment.** The proposed comment justifies the pair through `.playbackButton`'s `max(min-width, width)` reasoning, which is `.placeSpark`'s situation and not this one. There the competing `min-width` (MUI's 64) *exceeds* the 60px target, so overriding both is mandatory. Here the competing `min-width` (60) sits *below* the 66px target, so it is not. Shipping the pair with that explanation states a rule that is false at this width, next to a rule where it is true, and WM-40 adds a 97px pill against the same `.playbackButton` lock.

**Decision**: **ship `width: 66px !important` alone** (Doug, 2026-08-26). The line the pair would add does nothing at this width, and the risk that would justify keeping it defensively does not exist: `min-width` is a floor, so it cannot stop the box overflowing if the label ever outgrew 66, and no reachable value of the competing `min-width` rises above 66 (60 today, MUI's 64 if `.playbackButton`'s `!important` were ever dropped). The SCSS block and its comment are rewritten to lead with the real mechanism and to name `.placeSpark` as the case where the competing min-width *does* exceed the target, which is what makes both overrides mandatory there and neither of them a template here. The Verified table now carries three rows: the specificity result, the `!important` negative control, and the isolating control that separates the two declarations.

---

#### RESOLVED: `.placeSpark`'s own comment carries the specificity value the new `.clearAll` comment corrects, and the new comment cites it

The resolved Senior Engineer finding above corrected the new comment from 0,1,1 to 0,2,1 and named `.placeSpark button` / `.fireLineButton button` as the contrasting case *"at the same 0,2,1"*. `.placeSpark`'s existing comment (`bottom-bar.scss:106-108`) still says the opposite about itself: *"The tag selector `.placeSpark button` has specificity 0,1,1 and beats both `.iconButton` (0,1,0) and MUI's `.MuiButton-root { min-width: 64px }` (0,1,0)."* Same file, about 70 lines apart, and the new comment points a reader straight at it.

Verified by compiling a reduced copy of the nesting with `npx sass`: the emitted selectors are `.bottomBar .placeSpark button` and `.bottomBar .clearAll button`, both 0,2,1. The conclusion `.placeSpark`'s comment draws is still correct (0,2,1 also beats 0,1,0); only the number is wrong.

Step 2 already edits two comments inside that same rule (the block comment's pill list, and the trailing *"Spark bubble abuts the Reload bubble"*), so this is a one-number fix in a rule the step has open, and it is the repo's "one source of truth for a value that appears twice" rule applied to a value that will now appear twice and disagree.

One neighbor for the same pass, or an explicit skip: that block also says *"Same cross-module pattern as `.fireLineHelitack button { width: 65px }`"*, and no `.fireLineHelitack` exists; the rule is `.fireLineButton, .helitackButton`. Pre-existing drift, unrelated to this story.

**Decision**: the specificity number is corrected (0,1,1 to 0,2,1); the `.fireLineHelitack` name is **not**. The first is a value this story makes appear twice and disagree with itself, which is the repo's one-source-of-truth rule; the second predates the story and nothing in the change touches it, so fixing it here would be unrelated cleanup in a commit about a button. Recorded rather than silently skipped, so the next reader knows it was seen.

---

#### RESOLVED: The naming seam that renames `handleReload` puts `reload.svg` on the rename side, and the plan keeps it without giving the reason

The resolved naming question draws a clean line and applies it well: names for the **button** move, names for the **model operation** stay, which is why `handleReload` becomes `handleClearAll` while `simulation.reload()` does not. `ReloadIcon` and `src/assets/bottom-bar/reload.svg` sit on the button side of that same line. The asset is the bottom-bar button's icon, and the directory's convention is to name each file for its button rather than for its glyph: `spark.svg`, `helitack.svg`, `fire-line.svg`, `restart.svg`, `start.svg`, `pause.svg`, `terrain-setup.svg`. The plan keeps both, citing the resolved icon question, but that question answered *"is the artwork different"* (no); it did not answer *"does the file rename"*, and the requirements explicitly left that open as *"optional tidiness that can ride with the testid rename or not"*.

Counter-evidence, and it is real: `terrain-setup.svg` and the `terrain-button` testid both survived WM-3's "Terrain Setup" to "Setup" rename, so this repo has precedent for leaving an asset on a superseded label. What weakens the precedent here is that this story renames the testid its precedent kept, which turns the asset from one of a matched pair into the single loose end, and it keeps `ReloadIcon` / `reload.svg` as a standing class of deliberate survivor in the step-2 finish line.

Verified: `reload.svg` has exactly one importer, `bottom-bar.tsx:14`. The top bar uses a different asset (`RefreshIcon`), so the rename does not reach it.

**Two things the deep dive settled before the decision.** First, the SVG carries three internal "Reload" strings the specs never mention (`id`, `<title>`, `data-name`), and neither finish-line grep covers `*.svg`. Measured in the running app, SVGO strips the `id` and the `<title>` at build time and only `data-name="Reload"` reaches the DOM, where nothing selects on it and `restart.svg` / `start.svg` carry the same inert pattern. So there is no tooltip, no accessible-name change and no test coupling, and the question is purely source-tree naming. Second, WM-3's precedent is narrower than it looks: `specs/WM-3-change-terrain-setup-to-just-setup.md:48-56` gives its reason as the Cypress `data-name` selectors on the zone-count thumbnails (`terrain-setup.cy.ts`, `TerrainSetup.js`), which is real for `terrain-setup.svg` and has no analogue here, and `:46` declines the testid rename in the same breath, which this story does not.

**Decision**: **rename the file and the import** (Doug, 2026-08-26). `git mv reload.svg clear-all.svg` and `ReloadIcon` to `ClearAllIcon`, with the artwork and the internal metadata untouched. It is the same seam the spec already applied three times (the testid, `handleClearAll`, `AfterClearAll`): names for the button move, names for the model operation stay, and every other file in `src/assets/bottom-bar/` is named for its button rather than its glyph. `reload.svg` has one importer, so the cost is two lines, and it removes a class of deliberate survivor from the step-2 finish line, which now names three rather than four. The internal `data-name="Reload"` is recorded as a deliberate keep in step 2 so it does not read as a missed rename.

---

### QA Engineer (second pass)

#### RESOLVED: Deleting the 122px paired-group test is justified by an assertion the plan describes as optional

Step 2's `bottom-bar-visuals.cy.ts` item 2 deletes *"renders the Reload+Restart paired group at its shared Border w. value"* because *"the width it asserted is covered by the two new per-widget assertions"*. Item 1 introduces those as: Clear All *"gains `widgetRect("clear-all-button").should((r) => expect(r.width).to.eq(68));`"*, then *"Restart is now its own group and **can be** asserted at 62 for the first time."* One is an instruction and the other reads as an opportunity, while the deletion above depends on both.

Verified against the file. `renders each per-button widget at its spec Border w. value` (`:46-57`) asserts Setup 84, Spark 62, Start 62, Fireline 67, Helitack 67, and does not mention Restart. Restart's testid appears in the spec exactly once more, at `:116`, inside the other test this step deletes. So if the Restart assertion is treated as optional and skipped, the commit that splits the group leaves Restart as the only bottom-bar control with no width coverage at all, on the story that restructures it.

**Decision**: accepted. Item 1 now reads as two required assertions and states why: item 2 deletes the only coverage Restart's width has ever had, since `renders each per-button widget at its spec Border w. value` has never named it and its 60px content width was only implied by the 122px pair.

---

#### RESOLVED: The label assertion's placement instruction names a location that does not exist

Step 2 says the new assertion *"belongs beside the existing label assertions and follows the `toHaveTextContent` precedent at `:194` (`start-button` -> "Pause")"*, and then *"Place it beside the existing label assertions rather than in the state-machine matrix"*. Those two sentences cannot both be followed.

Verified in `bottom-bar.test.tsx`: `:194` is inside `it("state 4 (Running): ...; label is 'Pause'")`, which is inside `describe("BottomBar state machine (Requirements 1-7)")`. It **is** the state-machine matrix. The file's only other `toHaveTextContent` calls are `:251` and `:265`, both inside `describe("Paused vs. Ended")` and both about the same Start/Pause ternary. There is no cluster of label assertions anywhere to sit beside.

The honest home is `describe("BottomBar component")` (`:84`), which already holds `renders basic components` and the two plain presence assertions (`fireline button is present`, `helitack button is present`), declares the `stores` / `beforeEach` the snippet assumes, and needs no `seedState`. That last property is the one the plan itself uses to distinguish this assertion from the `:194` precedent.

**Decision**: accepted. The paragraph now names `describe("BottomBar component")` and explains the seam rather than gesturing at a cluster: all three existing `toHaveTextContent` calls guard the `start-button` "Start"/"Pause" ternary and therefore sit in state-dependent blocks, while this label does not vary with state and needs no `seedState`.

---

### Education Researcher (second pass)

#### RESOLVED: The requirements overstate `feedbackRound2` as the only student-facing string of the three

`requirements.md`'s bullet reads: *"**`feedbackRound2` on those same three tabs is a third verify target**, and the only one of the three the student actually reads."* That is contradicted by the same document's Technical Notes two sections earlier, which say `arrowText` reaches the UI through `tour-data.generated.ts` *"as 'First, click **Clear All** to reset your model.'"* The coach-mark popover shows that text to the student, so two of the three are student-facing and only `visualFeedback` is authoring-only.

Verified: `tour-data.generated.ts` carries the parsed per-step text (`{ text: "First, **Clear All** ..." }` shape), and `build-tour.ts` zips it with `tour-map.tsx`'s anchors into the rendered steps.

The distinction the bullet is reaching for is real and is worth keeping, but it is a different one: `feedbackRound2` is the only one of the three rendered **straight from the rule-set module**, with no generated artifact and no assertion anywhere between the authored cell and the screen, which is exactly why a regressed re-extract would surface there first. `implementation.md` step 3's *"the one of the three strings the student reads directly"* is closer but carries the same ambiguity.

**Decision**: accepted, and applied in both files. `requirements.md` now says `feedbackRound2` is the only one of the three rendered straight from the rule-set, and names `arrowText` as student-facing but routed through `tour-data.generated.ts`; `implementation.md` step 3 item 3 carries the same wording. The verify target is unchanged; only the reason it is worth verifying is now the true one.
