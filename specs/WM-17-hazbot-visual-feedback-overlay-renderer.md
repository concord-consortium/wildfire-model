# Hazbot: Visual-Feedback Overlay Renderer

**Jira**: https://concord-consortium.atlassian.net/browse/WM-17

**Status**: **Closed**

## Overview

Hazbot category feedback includes a `visualFeedback` field authored as prose ("outline the Restart button", "point at the Setup button", "coach mark centered top"). Before this story that prose shipped through as a plain string and was only visible in the dev sidebar. This work converts it into rendered coachmark overlays (outlines, pointers, and multi-step walk-throughs) via the `@concord-consortium/coachmarks` library, driven by a host-app map keyed by `(ruleSetId, categoryId)`.

For a non-technical reader: when a student opens the Hazbot Analysis panel after a run, Hazbot used to show a single text bubble. It can now physically point at the controls the student should use next. The bubble gains a "Show me" button that launches a short numbered walk-through ("First, Restart your model. Step 1 of 3" to "Now click the Setup button. Step 2 of 3" and so on), outlining and pointing at each control in turn, and advancing only when the student actually performs the step. The guidance content already existed as written instructions in the rule-set tables; this story turns those instructions into the on-screen pointers students see. It covers all eleven rule-sets with authored visual feedback: 23, 24, 25, 32, 33, 34, 35, 42, 45, 47 and 54.

The ticket's original scope note (rule-sets 32 to 35 and 43/45/47/54 excluded as "blocked on defaults" or "no content authored yet") was stale by the time the work started; all eleven tabs had authored `visualFeedback` in the committed modules, and the ticket's "43" is actually tab 42.

**Rule-set IDs in this document are the ones in force when the story shipped.** [WM-54](WM-54-renumber-rule-sets.md) later renumbered `42` to `41`, `45` to `44` and `47` to `46`, and removed 54, leaving ten rule-sets; `src/hazbot/wildfire/tour-map.tsx` uses the new numbers. Read every ID below, including the "45/47/54" cue in Out of Scope, as historical.

## Requirements

**Scope and launch**

- **R1.** All eleven authored tabs are in scope. Every coaching category (non-empty `visualFeedback` with an `arrowText` tour, which excludes Category 1 and the success categories) has a tour entry in the host map and renders correctly against the live model.
- **R2.** Clicking the Hazbot Analysis button opens the matched category's `feedback` text popover anchored to the robot avatar, as before. For a coaching category that popover's action button is the authored `[Show me]` token, and activating it launches the walk-through. Categories with no tour keep their plain dismiss button (`[Okay]` or `[Hooray!]`).

**Hazbot button states** (per the Zeplin "Hazbot Button States" artboard)

- **R3.** Intro popover open: the robot avatar scales up about 1.5x and the popover anchors its arrow to the enlarged robot.
- **R4.** Tour running ("No Hazbot Default"): the robot moves into the coach mark, so the button drops its robot and fades to opacity 0.35, keeping its `#c1daff` fill, 1.5px `#797979` border and 10px radius. The avatar's box is preserved so the "Hazbot Analysis" label keeps position, and the faded button is non-interactive. This applies to any tour, even a single-step one.
- **R5.** The post-run pulse halo does not throb while a coach mark is open, whether intro or tour. A run ending mid-coach-mark re-arms it, and it resumes only once the panel closes.

**Interaction and rendering**

- **R6.** The walk-through advances only when the student performs each step's action (clicks Restart, then Setup, and so on), never via a passive Next button. This guarantees a step's target exists before that step is shown, since for example the Setup panel exists only after Setup is clicked.
- **R7.** The tour is a multi-step `drive([...])` with `showProgress`, one step per `visualFeedback` line. Step text comes from the authored `arrowText` and the done button is the authored `[Got it!]`. The renderer synthesizes no step text or numbering.
- **R8.** `arrowText` is parsed at build time by a standalone generator, not at runtime: split into lines, strip the leading `"Hazbot:"`, strip the trailing `(Step n of N)`, and pull the trailing `[Got it!]` token. It writes a separate generated artifact keyed by `(ruleSetId, categoryId)` and does not touch the rule-set modules, the extractor's module emission, or the `Category` type.
- **R9.** The generator runs standalone against the current extracted data and is also wired into `docs/hazbot-update-workflow.md` as a post-extraction step, so a future full extraction regenerates the tour data.
- **R10.** The generator validates authored content in one pass across all tabs: `arrowText` line count against `visualFeedback` line count, a coaching category missing `arrowText`, and a trailing token that is not `[Got it!]`.
- **R11.** Per-step anchoring and style derive from `visualFeedback`: "points to X" becomes an `AnchoredPopover` on X with an outline ring; "Coach mark (no pointer) centered top" becomes a `ViewportPopover` at top-center with no ring.
- **R12.** Conditional steps branch on live sim state, so the map value is a factory evaluated at open time. The known cases are 23 Cat 4, 33 Cat 4 and 35 Cat 6: if two sparks were placed, do not outline the Spark button; if only one, outline it. The step still corresponds to one `arrowText` line, so the line-count invariants hold; only its anchor and style vary.
- **R13.** Three authored cues render in a simplified form for v1. See Out of Scope.
- **R14.** Terminal `[Got it!]` steps that point at the Setup panel stay anchored to it per the Zeplin design, and are kept alive when the student follows the instruction to close the panel and run. *(Delivered differently. See Superseded During Implementation.)*
- **R15.** Anchor targets resolve by `data-testid`. Add three to the Setup panel: the panel container, the Next button and the Wind section. Every other target already has one.
- **R16.** No scroll-cue overlays. Category 1's "scroll up" stays plain text in its feedback popover.

**Coachmarks library dependency** (specced separately in `coachmarks/specs/WM-17-coachmarks-hazbot-tour-support/`, delivered as a published version this repo pins)

- **R17.** Action-gated tour advancement with lazy per-step anchoring: targets declared as CSS selectors resolved at step entry, a declarative `advanceOn: { event: "click" }` on the anchor, and an imperative `moveNext()` escape hatch for app-state steps.
- **R18.** Gated degrade-on-removal: in an action-gated tour, a step whose anchor leaves layout re-floats as an anchorless centered popover instead of firing the anchor-removal cancel. *(Superseded. See below.)*
- **R19.** Forward-only gated steps: gated steps hide Next and Previous and suppress the arrow keys, so advancement is by the student's action only. The terminal step still shows `[Got it!]`, and the close button and progress text remain on every step.
- **R20.** A hazbot-theme robot avatar badge, on by default with an explicit opt-out, so the host can suppress it on the intro popover that already points at the robot.
- **R21.** Popover image support, so ruleset 25 Cat 4 can show mountain imagery.

**Logging**

- **R22.** Emit through wildfire's existing `log()` pipeline by wiring the library's lifecycle callbacks; no library-side logging. `HazbotShowMeClicked` with `{ ruleSetId, categoryId, stepCount }` on launch; `HazbotTourCompleted` and `HazbotTourDismissed` with `{ ruleSetId, categoryId, lastStepIndex }` off `onDestroyed` and `onCancelRequested`. Per-step events are deferred.
- **R23.** Document the new events in `LOGGED-EVENTS.md` (the Hazbot section): name, payload shape, and when each fires.

**Acceptance criteria**

- **R24.** Map coverage (unit): every coaching category has exactly one map entry, and there are no orphan entries for non-coaching categories.
- **R25.** Step-count agreement (unit): each map entry's step count equals its category's parsed `arrowText` step count.
- **R26.** Anchor resolvability: every `data-testid` the map references is a known testid, enforced by the `AnchorTestId` union type rather than a render smoke test.
- **R27 (partial).** Per-tab Playwright validation against a running dev server, as an explicit deliverable rather than guidance. Three categories were walked live, 23/2, 24/2 and 25/4; the remaining tabs were accepted on a reuse rationale plus unit coverage. That evidence also predates the pin change: the walks ran against yalc-linked `0.0.1-pre.8`, and two of them (the gated degrade-on-removal and the 24 Next-to-Wind held-anchor-removal) covered behavior the branch reversed when it re-pinned to `pre.9`. See Superseded During Implementation.

## Technical Notes

**The map value is a coachmark tour, not a bespoke DSL.** Outlines, anchored pointers, no-anchor viewport cues and multi-step walk-throughs are all already expressible as `EngineStep`s, so there is no separate overlay vocabulary to invent. The map's job per step is the part not reliably parseable from prose: the target `data-testid` (or viewport position) and the ring/pointer style. An adapter zips the generated `arrowStep[i]` text with the map's `anchor[i]`.

**The map value is a factory, not a literal array,** for two reasons: `AnchoredPopover.element` is a live `HTMLElement` and Setup-panel targets exist in the DOM only while the panel is open, and the conditional spark steps branch on live sim state.

**Three authored fields compose into one tour.** `feedback` gives the intro bubble text plus the trailing `[Show me]`; `arrowText` gives N numbered step lines each ending in `(Step n of N)`, with a trailing `[Got it!]`; `visualFeedback` gives N matching lines naming each step's target and style. Verified across all tabs: the two line counts agree for every coaching category, and Category 1 and the success categories have no `arrowText`.

**Every intermediate step is an anchor click.** Across all 33 coaching tours, every intermediate step advances on clicking Restart, Setup, Next, Reload or Start, and the final step is always Done-terminated. The "place sparks" and "run the model again" actions always live in that final Done step. So `advanceOn: { event: "click" }` alone covers every wildfire tour, and the imperative `moveNext()` path, while available, is unused.

**Two anchor-removal hazards, one library rule.** Two distinct wildfire interactions remove a gated step's anchor mid-tour: 24's Next and Wind live in different wizard sub-panels that mount and unmount, so clicking Next removes the held anchor while the engine waits for Wind; and every terminal Setup-panel step's instruction ("then run the model again") requires Create, which unmounts the panel. Both were addressed by a single library behavior rather than two rules. *(Reversed during implementation. The branch ships `onTargetLost: "close"`, so a step whose anchor unmounts closes the tour rather than re-floating. The terminals remain anchored to the Setup panel, so a student who follows the terminal instruction and clicks Create ends the tour at that point. See Superseded During Implementation.)*

**Spark zone counting.** `simulation.sparks` is `Vector2[]` with no `zoneIdx`, and the `OneSparkPerZone` factor reads the run snapshot's baked-in `zoneIdx`, so "live sparks" and "analyzed-run sparks" are genuinely different sources. The conditional helper maps each live spark to its cell's `zoneIdx`, reusing the snapshot path rather than duplicating it, and reads live sparks so the ring reflects current placement.

**No CI drift check on the generated artifact.** The repo has no drift-check convention, and WM-27 established that the rule-set modules are intentionally not a clean regenerate, so a strict check would fail. The artifact carries an `AUTO-GENERATED` header, and currency is protected by the post-extraction generator step and a PR-checklist line in `docs/hazbot-update-workflow.md`.

## Out of Scope

- **Celebratory and success visuals** (confetti, helmet doff), owned by [WM-9](https://concord-consortium.atlassian.net/browse/WM-9). Success categories carry no tour entry and fall back to the robot-anchored text popover.
- **Re-importing the latest spreadsheet, modifying the extractor's module emission, or changing the `Category` type**, all WM-18's domain. *(Partly overtaken: the extractor read path did change. See Superseded During Implementation.)*
- **Full-fidelity rendering of three visual-emphasis cues.** Ruleset 34's `0.` Fire-Intensity-scale pointer is deferred, so 34's tour is its three `arrowText` steps. The 45/47/54 "Fireline + Helitack + Start" cue rings Fireline only rather than all three buttons. The 25/2 and conditional spark cues anchor the bubble to the Spark button rather than a centered-top no-pointer bubble with a decoupled ring. In every case the authored `arrowText` carries the full instruction text, so these degrade visual emphasis only, never the guidance.
- **Changes to the Hazbot analysis engine or how the matched category is computed** (WM-10).
- **Changes to the feedback sheet schema or authoring format.**
- **Accessibility-specific requirements**, per project convention for this repo.

## Superseded During Implementation

Three things the branch shipped differently from what this spec settled. Recorded because the reasoning above argues for the other choice.

- **Gated degrade-on-removal was reversed (R14, R18).** The spec's answer to the terminal-step hazard was a library behavior that re-floated an orphaned gated step as a centered popover. The branch re-pinned to coachmarks `0.0.1-pre.9` and set `onTargetLost: "close"` on the hazbot tour engine, so a step whose anchor unmounts closes the tour instead of re-floating. `"close"` is the library's new default and is set explicitly at the call site for clarity.
- **Sheet bold preservation shipped here, not in WM-18.** The spec listed it as out of scope on the grounds that `read-excel-file` drops rich-text formatting and capturing it would be an extractor read-path change belonging to WM-18. It was built in this story instead: `scripts/rich-text-bold.js` reads `sharedStrings.xml` bold runs and surfaces them as markdown, and `extract-hazbot-sheets.js` swaps each bold cell's plain value for its markdown form before the existing pipeline. The render side already passed `**...**` through, so bold shows in both the intro popover and the tour steps with no renderer change. This was the first full re-extract of the rule-set modules; it carried no semantic change, so `APP_RULES_VERSION` was not bumped.
- **The mountain placeholder was replaced with the final artwork** for 25/4, rather than being left for the PIs to supply later.

## Decisions

### Which rule-sets are in scope for the overlay rendering?

**Context**: The ticket scoped this to 23/24/25 and excluded the rest as blocked or unauthored. That was stale: all eleven tabs had authored `visualFeedback` in the committed modules. The renderer is tab-agnostic, so the incremental cost per tab is mostly authoring map entries and validating each against the live model.

**Options considered**:
- A) All eleven authored tabs.
- B) Only 23/24/25 this iteration, extending later once WM-18 reconciles the rest.
- C) Whatever subset is confirmed loadable and validated now.

**Decision**: **A**. Loadability was confirmed by a re-extract of the 2026-06-19 sheet plus `npx jest src/hazbot/rule-sets`, which passed 149 of 149 across all eleven tabs, so the workflow doc's "loadable: 23/24/25 today" line was itself stale. The remaining diligence is per-tab live validation as each tour is authored.

---

### Are the celebratory success visuals in scope?

**Context**: The terminal success categories carry celebratory prose rather than coachmark overlays ("Hazbot doffs his helmet and confetti falls out!"). These are non-empty `visualFeedback`, so the acceptance criterion technically covers them, but they are animations and a separate, larger effort.

**Options considered**:
- A) Out of scope; track celebration as a follow-up.
- B) In scope, with a minimal confetti burst or helmet doff.
- C) In scope but text-only for now.

**Decision**: **A**, owned by [WM-9](https://concord-consortium.atlassian.net/browse/WM-9), whose description is exactly this requirement. Success categories carry no tour entry and fall back to the Hazbot-button anchor.

---

### How do the text popover and the visual overlay relate when the Hazbot button is clicked?

**Options considered**:
- A) The overlay replaces the standalone text popover: clicking launches the walk-through directly, falling back to the text popover only when the category has no `visualFeedback`.
- B) Sequence them: show the `feedback` text popover first, and a "Show me" action launches the walk-through.
- C) Independent features triggered separately.

**Decision**: **B**. The bracket tokens in the authored `feedback` (`[Show me]`, `[Okay]`, `[Hooray!]`) already encode exactly this, so the authored content decides which categories offer a tour. The trigger is the "Show me" button in the initial popover, not the run ending.

---

### Is the robot avatar badge a library theme change or a host-passed node?

**Context**: The reference screenshot shows the Hazbot face in a red circular badge overlapping the popover's top-left corner. The library had no such element.

**Options considered**:
- A) Pure theme change: bake the avatar into `hazbot.css`, shown on every hazbot-theme popover.
- B) New library API: the host passes an avatar node, like the existing `closeIcon` option.
- C) Host-only overlay element, no library change.

**Decision**: A, but **gated**. The badge appears only on the tour popovers, never on the initial feedback popover, which already points at the robot button, where a badge plus a pointer at the same robot is redundant. That gating rules out a blanket theme rule, since the intro popover shares the theme, so the library takes a per-engine option that the tour sets and the intro omits.

---

### How is ruleset 25 Category 4's custom imagery handled?

**Context**: 25/4 asks for "images of the bottom of a mountain and top of a mountain plus arrows pointing to these, centered top". The coachmarks popover rendered title and description text only.

**Options considered**:
- A) Text-only for v1, deferring the imagery.
- B) Add image support to the popover and supply the artwork.
- C) Render the imagery host-side as a custom viewport overlay outside the popover.

**Decision**: **B**. The initial implementation used a placeholder SVG reading "TBD: Mountain image" so the image path was fully exercised, and the final artwork replaced it before the story shipped (see Superseded During Implementation). `arrowText` already gives a working text-only fallback for that step, so the image is an enhancement rather than a blocker.

---

### How is the build-time `arrowText` parsing sequenced against WM-18?

**Context**: Parsing `arrowText` at build time first looked like it required enhancing `scripts/extract-impl.js` and adding a parsed `Category` field, which would regenerate all eleven rule-set modules and collide with WM-18's ownership of them.

**Decision**: Sidestep the collision entirely with a standalone generator that consumes the extracted category data and writes a separate artifact, touching neither the rule-set modules, nor the extractor's module emission, nor the `Category` type. There is therefore no WM-18 sequencing dependency: it runs standalone now and is also added to the workflow as a post-extraction step. Doing the parsing at build time rather than at runtime means authoring errors fail at generation, not in a student's browser.

---

### How does a tour step anchor to a control that does not exist until the student acts?

**Context**: The walk-throughs are forward action sequences ("Restart, then click Setup, then the Setup panel is outlined"), but a `drive()` tour advances step to step via Next without the student performing the actions, so step 3's anchor is not in the DOM when the tour plays. Verified in the library: a step whose primary element is set but not laid out fires `onCancelRequested` and the tour cancels, while a step with `element: undefined` renders as a no-anchor viewport popover, losing the "point at it" intent.

**Decision**: Action-gated advance. The tour advances only when the student performs each step, so each step's target exists by the time that step is shown. The library did not support this, so adding it became the largest of the library changes and the critical path for the story.

---

### `arrowText` embeds "(Step n of N)" and the library also renders a stepper

**Context**: Rendering both double-prints the numbering.

**Decision**: Strip the `(Step n of N)` suffix and rely on the library's `showProgress`, which matches the reference screenshot's separate stepper line plus plain body. The leading `"Hazbot:"` prefix is stripped for the same reason, as `parseFeedback` already does for `feedback`. Both strips happen in the build-time generator, so the runtime consumes clean data and does no string parsing.

---

### How are decoupled or multi-element outline rings rendered?

**Context**: A coachmarks step couples one outline ring to the bubble's anchor, and a viewport popover has no ring at all. Three authored cues want rings decoupled from, or multiplied beyond, a single bubble anchor: a centered-top bubble with a Spark-button ring (25/2 and the conditionals), a triple outline over Fireline, Helitack and Start (45/3, 47/3, 54/3), and a persistent pointer at the intensity scale alongside 34's three steps.

**Options considered**:
- A) v1 simplification with no library change.
- B) Express each extra ring as a ring-only companion popover in a `PopoverGroup`.
- C) Add multi-ring or decoupled-ring support to the library.

**Decision**: **A**. Deep-dive verification killed B: rings and bubbles are separate render paths, and the popover always renders its themed dialog box, so a "ring-only companion" renders a visible empty box without a library change. C is deferred as non-blocking. The simplifications are as recorded in Out of Scope, and in every case the authored `arrowText` carries the full instruction text, so these degrade emphasis rather than guidance. Note that the conditional spark cue keeps full fidelity: anchoring the bubble to the Spark button gives both bubble and ring in one step, and the only deviation is that the bubble points at the button rather than floating top-center.

---

### The terminal Done step is destroyed by the very action it instructs

**Context**: The affected tours' terminal step anchors a Setup-panel element (23/2 and 23/3 and 34/2 to the panel container, 24/2 through 24/4 to the Wind section) while the terminal instruction is typically "then run the model again". Running requires Create, which sets `ui.showTerrainUI = false` and unmounts the panel, removing the anchor. The library's target watcher fires the anchor-removal cancel, and the host logs `HazbotTourDismissed` and destroys. Net effect: a student who follows the final instruction has the coach mark torn down the instant they click Create, `[Got it!]` vanishes before it can be clicked, and a researcher cannot distinguish "gave up at the last step" from "completed the model exactly as coached".

**Options considered**:
- A) Host-side: render these terminals as centered-top viewport popovers.
- B) Library-side: in an action-gated tour, a step whose anchor leaves layout re-floats as an anchorless centered popover instead of cancelling.

**Decision**: **B**. Option A was rejected on review against the Zeplin design, which anchors the terminal coach mark to the Setup panel with the arrow at the panel and "Step N of N". B preserves that: the terminal stays anchored while the panel is open and degrades on Create, keeping `[Got it!]` reachable and logging completion. It also generalizes the earlier held-during-wait suppression, so 24's Next-to-Wind case becomes a sub-case of one rule rather than a second rule. It remains one logical step, so the line-count invariant holds. *(The branch later reversed this. See Superseded During Implementation.)*

---

### Two-engine `onDestroyed` handlers misfire on teardown

**Context**: `onDestroyed` fires for every destroy route (Done, close or Escape, and effect cleanup) with no intrinsic way to tell them apart. As originally written, the effect-cleanup path spuriously launched a tour during unmount, close or Escape logged both `HazbotTourDismissed` and `HazbotTourCompleted`, and cleanup logged a spurious `HazbotTourCompleted`.

**Decision**: Add `cleanup` (set before any teardown destroy) and `tourCancelled` flags. The intro launches the tour only when neither the intro was cancelled nor cleanup is running, and the tour logs completion only when neither the tour was cancelled nor cleanup is running. So Done logs completion only, close or Escape logs dismissal only, and cleanup logs neither and launches nothing.

---

### Is a render smoke test needed for anchor resolvability?

**Context**: The unit assertion only checks that the map's testids are a subset of a hand-maintained list in the same module, so a component-side testid rename would not be caught by it.

**Decision**: No smoke test. The map's `testid` field is typed as the union derived from the canonical list, so an unlisted testid is a compile error; the bottom-bar anchors are unconditionally rendered with only `disabled` toggling, and the Setup-panel testids are added in this PR, so anchor presence is config-independent; and the per-tab Playwright validation walks every tour live. `fire-intensity-scale` was removed from the canonical list, being both unused after deferring 34's cue and the one config-conditional id.

---

### Should launching and completing a walk-through be logged?

**Decision**: Yes, host-side through the library's existing lifecycle callbacks, since the library has no logging of its own by design. Baseline events are `HazbotShowMeClicked` on launch and `HazbotTourCompleted` / `HazbotTourDismissed` on end; per-step logging is deferred unless researchers want step-level drop-off. The library spec gained a note that gated advancement must still fire its per-step started callback so the host can anchor and log.

---

### The story is large for one PR

**Context**: Around 33 tours across eleven tabs, plus three library features, plus new testids, is a lot for one commit.

**Decision**: Split the library work into its own spec and deliverable in the coachmarks repo, removing it from this PR's surface, and phase what remains: host plumbing (testids, renderer, the `[Show me]` wiring, map scaffolding) first, then the authored tours. The cross-repo loop is demo-first: build and validate each library feature in the coachmarks demo app in isolation, then yalc-link into wildfire to wire up and validate integration, then publish the version this repo pins.
