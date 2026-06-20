# Hazbot: Visual-Feedback Overlay Renderer

**Jira**: https://concord-consortium.atlassian.net/browse/WM-17
**Repo**: https://github.com/concord-consortium/wildfire-model
**Implementation Spec**: [implementation.md](implementation.md)
**Status**: **In Development**

## Overview

Hazbot category feedback includes a `visualFeedback` field authored as prose ("outline the Restart button", "point at the Setup button", "coach mark centered top"). Today that prose ships through as a plain string and is only shown in the dev sidebar. This work converts the prose into rendered coachmark overlays (outlines, pointers, and multi-step walk-throughs) using the `@concord-consortium/coachmarks` library, driven by a host-app mapping keyed by `(ruleSetId, categoryId)`.

> **Scope note (corrected from the ticket):** The ticket text listed rule-sets 32-35 and 43/45/47/54 as out of scope ("blocked on defaults" / "no content authored yet"). That is **stale**. The current **Wildfire Hazbot Feedback Tables** sheet (export `2026-06-19`) has authored `visualFeedback` for **all 11 tabs**: 23, 24, 25, 32, 33, 34, 35, 42, 45, 47, 54 (the ticket's "43" is actually tab **42**). The committed `src/hazbot/rule-sets/*.ts` already carry this `visualFeedback` content (verified identical to the fresh export). Which of these 11 WM-17 renders is an open scope question (see Open Questions).

## Project Owner Overview

When a student opens the Hazbot Analysis panel after a run, Hazbot currently shows a single text bubble. This story makes Hazbot able to physically point at the controls a student should use next: the bubble gains a "Show me" button that launches a short, numbered walk-through ("First, Restart your model. Step 1 of 3" → "Now click the Setup button. Step 2 of 3" → …) outlining and pointing at each control in turn. The guidance content already exists as written instructions in the rule-set tables; this story turns those instructions into the on-screen pointers and walk-throughs students see, so the coaching is concrete and actionable rather than purely textual. It covers all eleven rule-sets that have authored visual feedback today (23, 24, 25, 32, 33, 34, 35, 42, 45, 47, 54).

## Background

The Hazbot analysis engine classifies a student's run into a "matched category" (WM-10). Each category in a rule-set carries several feedback fields (see [src/hazbot/engine/types.ts](src/hazbot/engine/types.ts)):

```ts
export interface Category {
  id: number;
  studentAction: string;
  feedback: string;          // text shown in the WM-16 popover, ending in a bracket button token
  visualFeedback: string;    // per-step target + style prose ("points to Restart button" / "no pointer centered top")
  arrowText?: string;        // per-step walk-through text + "(Step N of M)", ending in [Got it!] — consumed by WM-17
  expression: string;
}
```

The matched category is computed on demand via `computeMatchedCategoryForEngine(engine)` ([src/hazbot/engine/evaluator.ts](src/hazbot/engine/evaluator.ts)), and the host reads `(engine.ruleSet.id, matchedCategory)` at click/open time in [src/components/hazbot-button.tsx](src/components/hazbot-button.tsx).

**Today (WM-16):** Clicking the Hazbot Analysis button sets `ui.showHazbotFeedback`, and an effect in [hazbot-button.tsx](src/components/hazbot-button.tsx#L81) creates a single-step coachmark (`createCoachmarksEngine(...).highlight(...)`) anchored to the robot avatar, rendering the matched category's `feedback` text. `visualFeedback` and `arrowText` are not consumed anywhere except the dev sidebar.

**Authored content model (per coaching category).** A coaching category carries three coordinated fields that together fully specify the walk-through — WM-17 does not synthesize step text or numbering:
- `feedback` — the intro bubble text, ending in a bracket token. For coaching categories the token is **`[Show me]`** (the launch button); Category 1 ("did not run") uses `[Okay]`, the success category uses `[Hooray!]`.
- `visualFeedback` — N numbered lines, one per tour step, each naming the **target + style**: `"… points to Restart button"` → anchored popover + outline ring on that target; `"Coach mark (no pointer) centered top"` → a no-anchor `ViewportPopover` at top-center.
- `arrowText` — N matching numbered lines giving each step's **text and explicit `(Step n of N)`**, ending in **`[Got it!]`** (the tour's done button). Example (ruleset 23 Cat 2): `"Hazbot: Now click the Setup button. (Step 2 of 3)"` — the reference screenshot. Verified: `arrowText` line count equals `visualFeedback` line count for every coaching category; Category 1 and the success/celebratory category have **no `arrowText`**.

So a category's tour = zip(`visualFeedback` targets/styles, `arrowText` text/step-numbers); `[Show me]` in `feedback` launches it; `[Got it!]` ends it.

**Coachmarks library capabilities (already present in `0.0.1-pre.7`):** The library exposes everything needed to render the overlays (see [~/projects/coachmarks/src/types.ts](file:///home/doug/projects/coachmarks/src/types.ts)):
- `EngineHandle.drive(steps)` — multi-step tours; `highlight(step)` — single step.
- `AnchoredPopover` — popover anchored to a DOM element, with optional `ringElement` (outline ring) and `side`/`align`/`anchorOffset`.
- `ViewportPopover` — no-anchor popover positioned by `position` (e.g. `top-center`), with an optional free-standing `arrow`. Covers "coach mark (no pointer) centered top" cues.
- `showProgress` + `progressText` (`"Step {{current}} of {{total}}"`) — the "Step 2 of 3" stepper (styled per Zeplin: Lato 16px, centered, in the theme blue `#0050c4`, via the hazbot theme).
- `showOutlineRing`, `arrow` geometry, `showButtons` (`next`/`previous`/`close`), `nextBtnText`/`prevBtnText`/`doneBtnText`.

The library hazbot theme ([~/projects/coachmarks/src/styles/hazbot.css](file:///home/doug/projects/coachmarks/src/styles/hazbot.css)) does **not** currently render the robot avatar badge shown in the WM-17 reference screenshot (the red circular Hazbot face overlapping the popover's top-left). Adding the robot to the hazbot theme is part of this work; the cross-repo dev/publish loop is documented in [~/tmp/wildfire-yalc.md](file:///home/doug/tmp/wildfire-yalc.md).

**Resolved design question (from the ticket):** The overlay spec lives in a **host-app mapping keyed by `(ruleSetId, categoryId)`** maintained under [src/hazbot/wildfire/](src/hazbot/wildfire/). The sheet's prose stays as-authored; no sheet schema change. Revisit if the map grows unwieldy.

### Anchor targets referenced across all 11 authored tabs' `visualFeedback`

| Target | Rule-sets that reference it | Existing `data-testid` |
|--------|------------------------------|------------------------|
| Restart button | 23, 24, 25, 32, 33, 34, 35, 45, 47, 54 | `restart-button` ([bottom-bar.tsx](src/components/bottom-bar.tsx)) |
| Reload button | 42, 45, 47 | `reload-button` ([bottom-bar.tsx](src/components/bottom-bar.tsx)) |
| Setup button | 23, 24, 25, 32, 33, 34, 35, 54 | `terrain-button` ([bottom-bar.tsx](src/components/bottom-bar.tsx)) |
| Spark button | 23, 25, 32, (33/35 conditional) | `spark-button` ([bottom-bar.tsx](src/components/bottom-bar.tsx)) |
| Start button | 42, 45, 47 | `start-button` ([bottom-bar.tsx](src/components/bottom-bar.tsx)) |
| Fireline + Helitack buttons (disabled) | 45, 47, 54 | `fireline-button`, `helitack-button` ([bottom-bar.tsx](src/components/bottom-bar.tsx)) |
| Fire Intensity scale | 34 | `fire-intensity-scale` ([fire-intensity-scale.tsx](src/components/fire-intensity-scale.tsx)) |
| Setup panel (whole) | 23, 25, 32, 33, 34, 35, 54 | `terrain-header` only — **no panel-container testid** |
| Next button on Setup panel | 24, 35 | **none** ([terrain-panel.tsx](src/components/terrain-panel.tsx)) |
| Wind section of Setup panel | 24 | **none** ([terrain-panel.tsx](src/components/terrain-panel.tsx)) |
| No-anchor "centered top" cue | 23, 25, 33, 35 | n/a (ViewportPopover) |
| Custom imagery (mountain top/bottom + arrows) | 25 (Cat 4) | n/a (no popover image support) |

Only three targets lack a usable `data-testid` today: the Setup-panel **container**, the panel's **Next button**, and the panel's **Wind section**. Every other target already has one.

## Requirements

**Scope (Q1 → A):** All eleven authored tabs — 23, 24, 25, 32, 33, 34, 35, 42, 45, 47, 54. For every **coaching** category (non-empty `visualFeedback` with an `arrowText` tour; this excludes Category 1 and the success/celebratory categories), a tour entry exists in the host-app `(ruleSetId, categoryId)` map and renders correctly against the live model.

**Launch sequence (Q3 → B; Q4):**
- Clicking the Hazbot Analysis button opens the matched category's `feedback` text popover anchored to the robot avatar (as today).
- For a coaching category, that popover's action button is the authored `[Show me]` token; activating it launches the walk-through. Categories with no tour keep their plain dismiss button (`[Okay]` / `[Hooray!]`).

**Interaction model (action-gated advance):**
- The walk-through advances only when the student performs each step's action (e.g. clicks Restart, then clicks Setup), not via a passive Next button. This guarantees a step's target is present before that step is shown (e.g. the Setup panel exists only after Setup is clicked).
- **The coachmarks library does not support action-gated advancement today.** Adding it is part of WM-17's library work — the largest of the library changes, and the critical path for the story. (Exact API is for `implementation.md`; the library already exposes imperative `moveNext()`/`moveTo()` as a starting point.)

**Walk-through rendering:**
- The walk-through is a multi-step coachmark tour via `drive([...])` with `showProgress`, one step per `visualFeedback` line, advanced per the interaction model above.
- Each step's description text comes from the authored `arrowText`; the tour's done button is the authored `[Got it!]`. WM-17 does not synthesize step text.
- **`arrowText` is parsed at build time by a standalone generator, not at runtime.** A new script consumes the extracted category data and parses each `arrowText` into clean per-step data: split into lines, strip the leading `"Hazbot:"` prefix, strip the trailing `(Step n of N)`, and pull the trailing `[Got it!]` token. It writes a **separate generated artifact** (the parsed tour-step data keyed by `(ruleSetId, categoryId)`) — it does **not** modify the rule-set modules, the extractor's module emission, or the `Category` type. The runtime renderer consumes the generated artifact directly and does no string parsing. Rationale: validate once, fail at build time, not in a student's browser; and stay clear of WM-18's module ownership.
- **Runnable standalone now and composable later:** the generator runs on its own against the current extracted data (so WM-17 needs no rule-set regeneration and no WM-18 coordination), and is also added as a post-extraction step in [hazbot-update-workflow.md](docs/hazbot-update-workflow.md) so a future full extraction regenerates the tour data too.
- **Generator validation:** the generator errors (or warns) when a category's `arrowText` line count ≠ its `visualFeedback` line count, when a coaching category is missing `arrowText`, or when the trailing token isn't `[Got it!]` — surfacing authoring mistakes across all tabs in one pass.
- The library's `showProgress` renders the "Step N of M" stepper (which is why `(Step n of N)` is stripped from the body — see the reference screenshot: a separate stepper line plus the plain body); step count is the parsed line count.
- Per-step anchoring/style is derived from `visualFeedback`: `"… points to <X>"` → `AnchoredPopover` on `<X>` with outline ring; `"Coach mark (no pointer) centered top"` → `ViewportPopover` at top-center, no ring.
- **Conditional steps:** some steps branch on live sim state, so the map factory reads sim state and emits the step conditionally. Known cases: **23 Cat 4 / 33 Cat 4 / 35 Cat 6** — "if 2 sparks were placed, do not outline the Spark button; if only one, outline it." The step still corresponds to one `arrowText` line (so line-count invariants hold); only its anchor/style varies.
- **Visual-emphasis simplifications (v1):** three authored cues render in a simplified form for v1 (34's `0.` intensity-scale pointer deferred; 45/47/54 ring the Fireline button only; the 25/2 and conditional spark cues anchor the bubble to the Spark button rather than "centered top, no pointer" with a decoupled ring). The authored `arrowText` instruction text is unaffected. See Out of Scope.
- **Terminal "Setup panel" steps stay anchored to the panel (Zeplin), kept alive by gated degrade-on-removal (correctness).** Per the Zeplin design, a terminal `[Got it!]` step that points at the Setup panel is **anchored** to it (arrow at the panel, "Step N of N"). The hazard: its instruction is typically "…then run the model again," which requires closing the panel (Create → unmount), removing the anchor — and coachmarks' anchor-removal watcher would otherwise cancel the terminal Done the instant the student follows the instruction (losing `[Got it!]`, mis-logging `HazbotTourDismissed` instead of `HazbotTourCompleted`). This is handled **library-side** by `pre.8`'s **gated degrade-on-removal** (a coachmarks change, see the coachmarks dependency below): in an `actionGated` tour, a step whose anchor leaves layout re-floats as an anchorless centered popover (same content, step number, and Done/close) instead of cancelling. So these terminals (23/2·3, 24/2·3·4, 34/2, and any other tab whose final step targets the Setup panel) render anchored-to-the-panel while it is open and degrade to a center-center bubble on the panel close — preserving the authored design and logging completion correctly. See Self-Review (cross-repo).
- Anchor targets are resolved by `data-testid`. **(Q6 → A)** Add `data-testid` to the Setup panel's **Next button**, **Wind section**, and **panel container**; every other target already has one. (All three are referenced as tour anchors: the **panel container** by the terminal "Setup panel" steps, the **Next button** by 24's "Click Next" step, the **Wind section** by 24's terminal "Change Wind" step — the latter two kept alive across the panel transitions by `pre.8`'s gated degrade-on-removal.)
- **(Q7 → A)** No scroll-cue overlays. The no-anchor requirement is met by the "centered top" `ViewportPopover`s; Category 1's "scroll up" stays plain text in its feedback popover.

**Coachmarks library changes — DEPENDENCY (separate spec).** The three coachmarks-repo changes are tracked in their own spec in the coachmarks repo: **`coachmarks/specs/WM-17-coachmarks-hazbot-tour-support/requirements.md`** (same WM-17 ticket, no separate Jira). WM-17 (wildfire) depends on a **published coachmarks version** providing them. Summary of what that version must deliver:
- **Action-gated tour advancement** with lazy per-step anchoring (the headline; critical path) — advance when the student performs the step's action; anchor each step only once its target is present. Lazy targets are declared as CSS selectors (resolved/awaited at step entry); advance is a declarative `advanceOn: { event: "click" }` on the anchor plus an imperative `moveNext()` escape hatch for app-state steps (sparks, config + re-run).
- **Gated degrade-on-removal** — in an `actionGated` tour, a step whose anchor leaves layout re-floats as an anchorless centered popover (same content, step number, Done/close) instead of firing the anchor-removal cancel. Covers two wildfire interactions with one rule: 24's "Click Next" anchor removed while waiting for the Wind section (the Round-4 held-during-wait case), and every Zeplin-anchored terminal "Setup panel" / "Wind" step whose "…then run the model again" instruction closes (unmounts) the panel. Without it the first races into a cancel and the second loses `[Got it!]` (mis-logging a dismissal).
- **Forward-only, no passive Next button on gated steps** — gated steps hide both the Next and Previous buttons (and suppress ArrowLeft/ArrowRight) so advancement is by the student's action only, matching the Zeplin coach-mark design; the terminal step still shows its `[Got it!]` done button, and the close button + progress text remain on every step.
- **Hazbot-theme robot avatar badge, shown by default with an explicit opt-out** — renders on hazbot-theme popovers by default; wildfire suppresses it on the intro "Show me" `highlight()` popover (which already points at the robot button) and leaves it on for the walk-through steps. (The suppression granularity — a per-call/per-popover flag vs. a separate intro engine — is settled in implementation.)
- **Popover image/figure support** — so ruleset 25 Cat 4 can show the mountain imagery; wildfire passes a placeholder SVG ("TBD: Mountain image") initially, final PI artwork later with no code change.

Cross-repo workflow (demo-first): the coachmarks features are built and validated first in the **coachmarks demo app** (in isolation, no wildfire needed), then **yalc-linked** into wildfire ([~/tmp/wildfire-yalc.md](file:///home/doug/tmp/wildfire-yalc.md)) to wire up and validate integration (real spark placement, `SimulationStarted` advance), then **published** (the version WM-17 pins).

**Logging (host-side, via existing coachmarks callbacks):**
- Emit through wildfire's existing `log()` pipeline (consistent with `HazbotButtonClicked`), wiring the library's lifecycle callbacks — no library-side logging.
- **Launch**: `HazbotShowMeClicked` with `{ ruleSetId, categoryId, stepCount }` when the student activates "Show me".
- **Completion / dismissal**: `HazbotTourCompleted` and `HazbotTourDismissed` with `{ ruleSetId, categoryId, lastStepIndex }`, off `onDestroyed` / `onCancelRequested`.
- Per-step events (`onHighlightStarted`) are out of scope for now (deferred unless researchers want step-level drop-off).
- **Document the new events in [LOGGED-EVENTS.md](LOGGED-EVENTS.md) (the Hazbot section)** — name, payload shape, and when each fires — so dataset consumers can interpret them. This is a required deliverable.

**Fallbacks & invariants:**
- Categories with empty `visualFeedback` (Category 1) and the success/celebratory categories (owned by **[WM-9](https://concord-consortium.atlassian.net/browse/WM-9)**) have no tour entry; the panel shows the text popover anchored to the Hazbot button.
- The renderer reads the matched category at open time via the existing engine read path; it does not change how the matched category is computed.

**Acceptance criteria / testable invariants:**
- **Map coverage (unit)** — every coaching category (has parsed `arrowText`) has exactly one map entry, and there are no orphan map entries for non-coaching categories (Category 1, success/celebratory).
- **Step-count agreement (unit)** — each map entry's step count equals its category's parsed `arrowText` step count (the conditional-step cases from 23 Cat 4 / 33 Cat 4 / 35 Cat 6 still map to one line, varying only anchor/style).
- **Anchor resolvability (unit / smoke)** — every `data-testid` the map references is a known testid (asserted against a canonical list, and/or present in a rendered smoke test).
- **Per-tab Playwright validation (manual deliverable)** — walk each tab's coaching categories against a running dev server and confirm each tour anchors, advances (action-gated), and reads correctly. This is an explicit deliverable, not just guidance.
- Extraction-time validation (line-count match, missing `arrowText`, trailing `[Got it!]`) is covered by the extractor per the content-processing requirement above.

## Technical Notes

- **Overlay map value = a coachmark tour, not a bespoke DSL.** New module under [src/hazbot/wildfire/](src/hazbot/wildfire/), keyed by `(ruleSetId, categoryId)`. The value is (essentially) the `EngineStep[]` passed to the library's `drive(steps)` — outlines, anchored pointers, `ViewportPopover` no-anchor cues, and multi-step walk-throughs are all already expressible as `EngineStep`s, so there is no separate overlay vocabulary to invent or translate.
- **The map mainly encodes per-step anchors/style; text comes from the generated tour-data artifact.** Step description text is read from the build-time-generated tour data (clean per-step lines — no `"Hazbot:"` prefix, no `(Step n of N)` — plus the `[Got it!]` token); the map does not duplicate it. The map's job per step is the part not reliably parseable from prose: the **target `data-testid`** (or `ViewportPopover` position) and the ring/pointer style. An adapter zips the two: generated `arrowStep[i]` → text, map entry `[i]` → anchor.
- **Standalone tour-data generator (no extractor/module/type change).** A new script (e.g. `scripts/generate-hazbot-tour-data.js`) consumes the extracted category data (`arrowText` + `visualFeedback`), validates it, and writes a separate generated artifact under [src/hazbot/wildfire/](src/hazbot/wildfire/). It does **not** modify `src/hazbot/rule-sets/*.ts`, [scripts/extract-impl.js](scripts/extract-impl.js)'s module emission, or the `Category` type — so it sidesteps **[WM-18](https://concord-consortium.atlassian.net/browse/WM-18)**'s module ownership entirely (no clean-regenerate coordination, no typo-drift risk). It runs standalone now and is also wired into [hazbot-update-workflow.md](docs/hazbot-update-workflow.md) as a post-extraction step. Input source (re-run the extractor in-memory vs read the committed modules) is an `implementation.md` detail.
- **Conditional tours:** the factory may branch on live sim state (e.g. spark count for 23 Cat 4 / 33 Cat 4 / 35 Cat 6), so the emitted `EngineStep[]` is computed at open time, not a frozen constant — another reason the map value is a factory rather than a literal array.
- **Late-bound anchors:** because `AnchoredPopover.element` is a live `HTMLElement` (and Setup-panel targets only exist in the DOM while the panel is open), the stored value is a **factory** — `() => EngineStep[]` (or a small tour template keyed by `data-testid` strings that a thin adapter resolves to elements at open time) — rather than a literal step array. Resolve `data-testid` → element via `document.querySelector('[data-testid="…"]')` at open time.
- **Launch wiring (`[Show me]` → tour):** the existing `parseFeedback` in [hazbot-button.tsx](src/components/hazbot-button.tsx#L21) already extracts the trailing bracket token as the popover's action-button label. For a coaching category that token is `[Show me]`; its activation (the popover's done/next action) should call `drive(tour)` instead of just dismissing. Categories whose token is `[Okay]`/`[Hooray!]` keep today's dismiss behavior.
- **Entries with no tour:** Category 1 (empty `visualFeedback`, no `arrowText`) and the success/celebratory categories have no map entry; the panel falls back to the robot-anchored text popover (celebration is **[WM-9](https://concord-consortium.atlassian.net/browse/WM-9)**).
- **Engine wiring:** extend the effect in [hazbot-button.tsx](src/components/hazbot-button.tsx#L81) (or extract a renderer module) to choose between `highlight` (the intro text popover) and `drive` (the multi-step tour), pass `showProgress`, and resolve anchors.
- **Library changes live in a separate spec.** All three coachmarks-repo changes (action-gated advancement, gated robot badge, popover image support) are specified in `coachmarks/specs/WM-17-coachmarks-hazbot-tour-support/requirements.md` and delivered as a published coachmarks version that WM-17 pins. Built demo-first in the coachmarks repo, then yalc-linked here to wire up and validate integration, then published ([~/tmp/wildfire-yalc.md](file:///home/doug/tmp/wildfire-yalc.md); user runs dev server + `npm publish`). WM-17's image wiring passes a placeholder SVG ("TBD: Mountain image") pending final PI artwork; `arrowText` already supplies a text-only fallback for that step.
- **New `data-testid`s:** add to the Setup panel's Next button, Wind section, and panel container in [terrain-panel.tsx](src/components/terrain-panel.tsx).
- **Validation:** Playwright MCP against a running dev server, per [CLAUDE.md](CLAUDE.md) and the yalc doc (ruleset URL params, `window.test.*` helpers).
- **Existing testids confirmed present:** `restart-button`, `reload-button`, `terrain-button`, `spark-button`, `start-button`, `fireline-button`, `helitack-button`, `terrain-header`, `terrain-panel-close`, `zone-option`, `hazbot-button`.

## Out of Scope

- Re-importing/committing the latest spreadsheet into `src/hazbot/rule-sets/`, modifying the extractor's module emission, or changing the `Category` type (all WM-18's domain). WM-17 consumes the `visualFeedback`/`arrowText` already present in the committed modules and derives its tour data via a **standalone generator that writes a separate artifact** — no rule-set-module or type change.
- **Preserving the sheet's text bolding as markdown `**…**`** in the extracted rule-sets. The source sheet bolds key words (e.g. **Restart**, **Setup**, **Next**, **Wind Direction**; ~127 bold runs in the `2026-06-19` export), but the extractor reads cell values via `read-excel-file`, which drops rich-text formatting, so the committed modules carry no bold. Capturing it is an **extractor read-path change (candidate WM-18)** — documented in [hazbot-update-workflow.md](docs/hazbot-update-workflow.md) §1. WM-17 cannot source it (its generator reads the already-stripped committed modules), but the rendering side is already markdown-bold-ready (`parseFeedback` preserves `**…**`, the coachmarks popover renders it), so the WM-17 tours will show bold for free once the extractor emits it — no WM-17 change.
- Celebratory/success visuals (confetti, helmet-doff) — owned by **[WM-9](https://concord-consortium.atlassian.net/browse/WM-9)**. (Scope is resolved to all 11 authored tabs, so no rule-set is deferred; the ticket's original "32-35 blocked / 43/45/47/54 unauthored" exclusions are obsolete.)
- **Full-fidelity rendering of three visual-emphasis cues (v1 simplification, per [implementation.md](implementation.md)'s resolved decoupled-ring decision):** (1) ruleset 34's `0.` Fire-Intensity-scale pointer is **deferred** (the tour renders 34's three `arrowText` steps; the scale is always on screen); (2) the 45/47/54 "Fireline + Helitack + Start" cue rings **Fireline only** (single ring), not all three buttons; (3) the 25/2 and conditional 23/4 · 33/4 · 35/6 spark cues anchor the bubble **to the Spark button** (bubble + ring) rather than the authored "centered top (no pointer)" with a decoupled Spark ring. In every case the authored `arrowText` carries the full instruction text, so these degrade visual emphasis only, not the guidance. A coachmarks multi-ring / decoupled-ring enhancement that would render these cues at full fidelity is deferred as non-blocking (revisit only if the PIs deem the triple outline or true centered-top-with-ring must-haves).
- Changes to the Hazbot analysis engine or how the matched category is computed (WM-10).
- Changes to the feedback sheet schema / authoring format (per resolved design question).
- Accessibility-specific requirements (per project convention, out of scope for this repo's specs).

## Open Questions

### RESOLVED: Which rule-sets are in scope for WM-17's overlay rendering?
**Context**: The ticket scoped WM-17 to 23/24/25 and excluded the rest as blocked/unauthored. That is now stale: all 11 tabs (23, 24, 25, 32, 33, 34, 35, 42, 45, 47, 54) have authored `visualFeedback` in the committed modules. The overlay map and renderer are tab-agnostic, so the incremental cost per additional tab is mostly authoring map entries and validating each against the live model. Note: only 23/24/25 are described as fully "loadable/validated" in [hazbot-update-workflow.md](docs/hazbot-update-workflow.md); the other tabs are exported but their engine load (impls/stubs) and validation status under WM-18 should be confirmed before committing to render them.
**Options considered**:
- A) All 11 authored tabs — one renderer, map entries + validation for every tab.
- B) Only 23/24/25 for this iteration (matches original ticket scoping); extend to the rest in a follow-up once WM-18 reconciles/validates them.
- C) A validated subset — whatever tabs are confirmed loadable + validated now; defer the rest.

**Decision**: **A — all 11 authored tabs.** Loadability confirmed: a re-extract of the `2026-06-19` sheet plus `npx jest src/hazbot/rule-sets` passes **149/149** tests across all 11 tabs (each has a five-shape sweep test file), so every tab loads cleanly today — the workflow doc's "loadable: 23/24/25 today" line is itself stale. Remaining diligence is per-tab live-model validation as each tour is authored. (A separate finding from that re-extract: the current sheet has minor *typo* drift in the `ranSimulation` factor-variable `details` prose for 45/47/54 vs the cleaner committed text; this is documentation-only, does not touch any `visualFeedback`/`arrowText`, and is owned by WM-18 — see notes to the team.)

### RESOLVED: Are the celebratory "success" visuals in scope for WM-17?
**Context**: The terminal success categories carry celebratory prose, not coachmark overlays: ruleset 23 Cat 5 and 24 Cat 5 say "Celebratory visual: Hazbot doffs his helmet and confetti falls out!", and ruleset 25 Cat 6 says "Confetti animation or subtle celebratory visual". These are non-empty `visualFeedback`, so the acceptance criterion ("each category with non-empty visualFeedback renders correctly") technically covers them, but they are animations rather than coachmark overlays and would be a separate, larger effort.
**Options considered**:
- A) Out of scope for WM-17 — render nothing special (or fall back to the existing text popover) for success categories; track confetti/celebration as a follow-up story.
- B) In scope — implement a minimal celebratory visual (e.g. a simple confetti burst / helmet doff) as part of this story.
- C) In scope but minimal — show a celebratory text popover only (no animation) for now.

**Decision**: **A — out of scope for WM-17, owned by [WM-9](https://concord-consortium.atlassian.net/browse/WM-9)** ("Hazbot: Hazbot needs to celebrate when student runs model in specified way", To Do, epic AP-80), whose description is exactly this confetti/celebratory requirement. For the success categories the overlay map carries no tour entry, so the panel falls back to the Hazbot-button anchor (or shows nothing special); the celebratory animation is delivered by WM-9.

### RESOLVED: How should the WM-16 text popover and the WM-17 visual overlay relate when the Hazbot button is clicked?
**Context**: Today, clicking the Hazbot Analysis button opens a single text popover (the category's `feedback`) anchored to the robot. WM-17 introduces visual overlays (pointers / multi-step walk-throughs) driven by `visualFeedback`. We need to decide what a click produces now.
**Options considered**:
- A) The visual overlay replaces the standalone text popover: clicking launches the `visualFeedback` walk-through (whose steps carry the coaching text); fall back to the robot-anchored text popover only when the category has no `visualFeedback`.
- B) Sequence: show the `feedback` text popover first, then a "Show me" action launches the `visualFeedback` walk-through (the bracket tokens like `[Show me]` already exist in `feedback`).
- C) The text popover and visual overlay are independent features triggered separately.

**Decision**: B

### RESOLVED: What triggers the visual overlay?
**Context**: Need to confirm the entry point for the overlay walk-through.
**Options considered**:
- A) Clicking the Hazbot Analysis button (same trigger as the current feedback panel), reading the matched category at click time.
- B) Automatically when a run ends (the pulse-armed state) without requiring a click.
- C) Both — auto-arm a subtle cue, but render the full walk-through only on click.

**Decision**: The "show me" button in the initial popover.

### RESOLVED: How is the Hazbot robot avatar added to the popover — library theme or host-passed node?
**Context**: The reference screenshot shows the Hazbot face in a red circular badge overlapping the popover's top-left corner. The library currently has no such element. This affects whether WM-17 ships a library API change or just a CSS/theme change.
**Options considered**:
- A) Pure library theme change: bake the robot avatar into `hazbot.css` (e.g. a `::before` with the robot artwork), shown on every hazbot-theme popover. No host wiring, no new API.
- B) New library API: the host passes an avatar/icon ReactNode (like the existing `closeIcon` option), so the robot is host-supplied artwork.
- C) Host-only: render the badge in wildfire-model as an overlay element, no library change.
**Sub-question**: Should the robot badge appear on every hazbot step, or only on multi-step walk-through steps that are not already anchored to the robot button?

**Decision**: **Badge on the tour popovers only — NOT the initial feedback popover.** The intro "Show me" bubble (which already points at the robot button) shows no badge; the badge appears only on the walk-through steps launched by "Show me". This refines option A: it can't be a blanket `hazbot.css` rule applied to every popover, since the intro popover shares the theme — the library must **gate** the badge to the tour engine (a per-engine option or a modifier class the tour sets and the intro omits). Exact mechanism is for `implementation.md`.

### RESOLVED: How should ruleset 25 Category 4's custom imagery be handled?
**Context**: Ruleset 25 Cat 4's `visualFeedback` asks for "Coach mark (no pointer) with images of the bottom of a mountain and top of a mountain plus arrows pointing to these, centered top". The coachmarks popover renders title + description text (with bold markdown) only; it has no image/figure support today.
**Options considered**:
- A) Simplify to a text-only no-anchor popover for v1 (describe top/bottom in words), defer the mountain imagery.
- B) Add image support to the popover (library change) and supply the mountain artwork.
- C) Render the imagery host-side as a custom viewport overlay outside the coachmark popover.

**Decision**: **B — add popover image/figure support to the coachmarks library**, and supply the mountain top/bottom artwork for ruleset 25 Cat 4. `arrowText` already gives a working text-only fallback for that step, so the image is an enhancement. New follow-up: artwork source (see below).

### RESOLVED: Who supplies the ruleset 25 Cat 4 mountain artwork, and where does it live?
**Context**: Decision B above adds popover image support, which needs actual artwork: "the bottom of a mountain and top of a mountain plus arrows pointing to these". This is a content/asset dependency, not code. (The library API for the image and the exact asset wiring are implementation details for `implementation.md`.)
**Options considered**:
- A) Reuse/derive from existing in-app art (e.g. terrain/zone imagery already in [src/assets/](src/assets/)).
- B) New asset authored by the designer (Zeplin/Sam), added under `src/assets/` and passed to the popover.
- C) Ship text-only for v1 (the `arrowText` fallback) and add the image when artwork is available.

**Decision**: **Placeholder for the initial implementation** — ship a placeholder SVG reading "TBD: Mountain image" wired through the new popover image support, so the image path is fully exercised. The PIs will supply the final artwork later, which then swaps in for the placeholder (no code change beyond the asset). This keeps the library image feature and its wiring in WM-17's scope while deferring only the final art.

### RESOLVED: Confirm the new `data-testid` additions and their exact targets.
**Context**: Across the 11 tabs, every anchor target already has a `data-testid` **except** three, all inside the Setup panel ([terrain-panel.tsx](src/components/terrain-panel.tsx) exposes only `terrain-header` and `terrain-panel-close`): the **Next button** (24, 35), the **Wind section** (24), and a **Setup-panel container** (referenced by 23/25/32/33/34/35/54 as "Setup panel" as a whole). (Reload, Start, Fireline, Helitack, and the Fire Intensity scale — targets from the newly-in-scope tabs — already have testids.)
**Options considered**:
- A) Add `data-testid` to the Setup panel's Next button, Wind section, and panel container; anchor overlays to those.
- B) Anchor the "Setup panel" cues to the existing `terrain-header` and skip a container testid; still add Next + Wind testids.
- C) Defer the intra-panel targets (Next / Wind) if the tabs that need them fall outside the chosen rule-set scope.

**Decision**: A

### RESOLVED: Do any categories require "scroll up / scroll down" no-anchor cues?
**Context**: The acceptance criteria list "Scroll up / scroll down no-anchor cues use WM-11's no-anchor mode". Checked across **all 11 tabs**: **no `visualFeedback` field in any tab mentions scrolling.** The only no-anchor cues in `visualFeedback` are "Coach mark (no pointer) centered top" (tabs 23, 25, 33, 35), which are `ViewportPopover` placements, not scroll instructions. The "scroll up" language instead lives in the **`feedback`** (text-popover) field of **Category 1** ("did not run yet") in tabs 23/24/25/32/33/34 — e.g. "Scroll up to see the instructions at the top of the page!" Category 1 has empty `visualFeedback`, so it currently falls back to the Hazbot-button anchor. So the AC's scroll cue maps to that Category-1 *text*, not to any `visualFeedback` overlay.
**Options considered**:
- A) No scroll-cue overlays needed. The `visualFeedback` no-anchor requirement is satisfied by the "centered top" `ViewportPopover`s; Category 1's "scroll up" stays plain text in the feedback popover. Treat scroll *overlays* as out of scope.
- B) Render Category 1's "scroll up" prompt as an actual no-anchor up-pointing `ViewportPopover` cue (a small WM-17 addition keyed off Category 1, not driven by `visualFeedback`).
- C) Scroll cues are needed elsewhere — identify the specific categories and add them.

**Decision**: A

### RESOLVED: How do we sequence the extractor/`Category`-type change against WM-18?
**Context**: Parsing `arrowText` at build time first looked like it required enhancing [scripts/extract-impl.js](scripts/extract-impl.js) and adding a parsed `Category` field, which would regenerate all 11 rule-set modules and collide with WM-18's module ownership (and risk the reverted typo drift).
**Decision: sidestep the collision with a standalone generator.** A separate script consumes the extracted category data and writes a **separate generated tour-data artifact** — it does not modify the rule-set modules, the extractor's module emission, or the `Category` type. So there is **no WM-18 sequencing dependency**: the generator runs standalone now, and is also added to the workflow as a post-extraction step for future full extractions. (Per the user: "a script that operates on the extracted data and writes to a different file.")

## Self-Review

Findings from a multi-role review of the requirements (not implementation). Processed one at a time; each verified against code/data before discussion.

### Senior Engineer

#### RESOLVED: Later tour steps anchor to controls that do not exist until the student acts (anchor-timing)
The walk-throughs are forward action sequences ("1. Restart → 2. click Setup → 3. Setup panel outlined"). But a `drive()` tour advances step-to-step via Next without the student performing the actions, so step 3's anchor (Setup panel / Wind section / Next button) is not in the DOM when the tour plays. Verified in the library: a step whose primary element is set but not laid out fires `onCancelRequested` ([engine.tsx:135-138](file:///home/doug/projects/coachmarks/src/engine.tsx)) — the tour cancels; a step with `element: undefined` renders as a no-anchor viewport popover, losing the "point at it" intent.
**Decision: (a) action-gated advance.** The tour advances only when the student actually performs each step (clicks Restart → advance; clicks Setup → the panel opens → the next step anchors to the now-present panel), so each step's target exists by the time that step is shown. **The coachmarks library does not support action-gated advancement today; adding it is part of WM-17's library work** — a third library change alongside the robot badge and image support, and the largest of the three. This makes the renderer/library dependency the critical path for the story.

#### RESOLVED: Conditional steps need runtime branching, not a static tour
23 Cat 4 / 33 Cat 4 / 35 Cat 6 `visualFeedback`: "If 2 sparks were placed, do not outline the Spark button; if only one was placed, outline it." The tour for these categories must branch on live sim state (spark count), so the map factory needs read access to sim state and a category's step count can vary at runtime. The "map mainly encodes anchors" note should explicitly cover conditional tours.

### Library Integration

#### RESOLVED: Duplicate step numbering — arrowText "(Step n of N)" vs library showProgress
`arrowText` embeds "(Step 2 of 3)" in the body text, and the spec also calls for `showProgress` (the library's separate "Step 2 of 3" stepper, per the screenshot). Rendering both double-prints the numbering. Decide: strip the "(Step n of N)" suffix from `arrowText` and rely on `showProgress` (matches the screenshot's separate stepper line), or keep it inline and drop `showProgress`.

#### RESOLVED: arrowText "Hazbot:" prefix must be stripped
`arrowText` lines begin "Hazbot: …", but the screenshot body is just "Now click the Setup button." The "Hazbot:" prefix must be stripped (as `parseFeedback` does for `feedback`). **Decision:** do this — and all `arrowText` content processing (prefix strip, `(Step n of N)` strip, line split, `[Got it!]` extraction) plus validation — at **build time in a standalone generator** that writes a separate tour-data artifact (not at runtime, and not in the extractor/modules/`Category` type). Authoring errors fail at generation; runtime consumes clean data. See the resolved sequencing question.

#### RESOLVED: Robot badge redundant on the robot-anchored intro popover
Q5→A originally said "every hazbot-theme popover", but the WM-16 intro popover already points at the robot button — badge + pointer at the same robot is redundant. **Decision: the badge appears only on the tour popovers, never on the initial feedback popover.** This requires gating the badge to the tour engine (per-engine option / modifier class) rather than a blanket theme rule — Q5 and the library-changes list updated accordingly.

### QA Engineer

#### RESOLVED: No testable acceptance criteria / map invariants
"Renders correctly against the live model" is not independently testable. **Decision:** added an "Acceptance criteria / testable invariants" subsection to Requirements — map coverage, step-count agreement, anchor resolvability (all unit/smoke testable), and a per-tab Playwright validation deliverable; extraction-time validation covers the parsing invariants.

### Product Manager

#### RESOLVED: Single-story size / phasing
~30+ tours across 11 tabs + three library features + extractor/type change + new testids is large for one commit/PR. **Decision:** (1) the library work is split into its own spec/deliverable (`coachmarks/specs/WM-17-coachmarks-hazbot-tour-support`), removing it from WM-17's PR surface; (2) WM-17's remaining work phases naturally — **extractor + `Category` change** → **host plumbing** (testids, renderer, `[Show me]`→`drive` wiring, map scaffolding) → **authored tours** (e.g. 23/24/25 first, then the rest). Detailed seams go in `implementation.md`.

### Education Researcher

#### RESOLVED: Logging of walk-through usage
Should launching / advancing / completing a walk-through emit log events so researchers can tell whether students use the visual coaching? **Decision:** yes, host-side via the library's existing lifecycle callbacks (the library has no logging of its own, by design). Baseline events added to Requirements: `HazbotShowMeClicked` (launch) and `HazbotTourCompleted`/`HazbotTourDismissed` (completion/dismissal); per-step logging deferred. Added a coachmarks-spec note that gated advancement must still fire `onHighlightStarted` per step so the host can anchor + log.

---

## Self-Review — Round 2 (cross-repo seam, 2026-06-20)

Reviewing the two WM-17 requirements docs together as one story (coachmarks as the shipped foundation, wildfire as the consumer pinned to it). Each finding was deep-dive-verified against both repos' source before being written.

### Senior Engineer / API Designer + Education Researcher

#### RESOLVED: A terminal Done step anchored inside the Setup panel is destroyed by the very action it instructs ("…then run the model again"), so the student can't reach `[Got it!]` and the run mis-logs as a dismissal
Verified in both repos: the affected tours' terminal Done step anchors a Setup-panel-interior element — 23/2·3 and 34/2 → `terrain-panel-container`, 24/2·3·4 → `terrain-wind` ([implementation.md](implementation.md) tour-map) — while the terminal instruction tells the student to run ([23.ts:27](../../src/hazbot/rule-sets/23.ts#L27) "…Then run the model again."; [24.ts:29](../../src/hazbot/rule-sets/24.ts#L29) "…Then run the model again."). Running requires closing the panel: "Create" ([terrain-panel.tsx:344](../../src/components/terrain-panel.tsx#L344)) → `applyAndClose` → `ui.showTerrainUI=false` → the panel container ([terrain-panel.tsx:235](../../src/components/terrain-panel.tsx#L235)) unmounts, removing the anchor. Coachmarks' `useTargetWatcher` ([../coachmarks/src/use-target-watcher.ts:30-34](../../../coachmarks/src/use-target-watcher.ts#L30-L34)) fires `onRemoved` → `onCancelRequested` (types.ts:145-147, "a primary anchor was removed mid-step") whenever a mounted step's anchor leaves layout; the Round-4 held-anchor-removal suppression applied only **while a wait is in flight** (`waitDispose` non-null), and the terminal step has no pending wait, so it was **not** suppressed. wildfire's tour `onCancelRequested` logs `HazbotTourDismissed` and destroys ([implementation.md](implementation.md) renderer step). Net: a student who follows the final instruction (change settings → Create → run) has the coach mark torn down the instant they click Create — the `[Got it!]` button vanishes before it can be clicked, and the event mis-logs as `HazbotTourDismissed` (at the last step index), so a researcher cannot distinguish "gave up at the last step" from "completed the model exactly as coached." Neither spec addressed it (coachmarks Round 4 covered the *held* step during a wait, not the *terminal* step removed by its own instructed action).
**Decision: B — coachmarks-side gated degrade-on-removal (preserves the Zeplin anchored design).** An initial wildfire-side fix (render these terminals as centered-top `ViewportPopover`s) was rejected on review against the Zeplin spec, which **anchors** the terminal coach mark to the Setup panel (arrow at the panel, "Step N of N"). Instead, `pre.8` generalizes the Round-4 suppression into **gated degrade-on-removal**: in an `actionGated` tour, a step whose anchor leaves layout re-floats as an anchorless centered popover (same content + step number + Done/close) instead of cancelling. So the terminal stays anchored to the panel while it is open (Zeplin) and degrades to a center-center bubble on Create — `[Got it!]` stays reachable and `HazbotTourCompleted` fires. Captured in Requirements (correctness bullet + the coachmarks dependency's degrade-on-removal deliverable) and the [implementation.md](implementation.md) tour-map (terminals stay anchored; no wildfire-side branch). It is one logical step (the line-count invariant holds — a second centered-top step would read "Step N+1", not the authored "Step N of N").

### Release Engineer / Cross-Repo Contract Integrator

#### RESOLVED: The 24 Next→Wind held-anchor-removal and the terminal-on-panel-close case are the same thing; one general coachmarks rule covers both
Verified: both interactions remove a gated step's anchor mid-tour — 24's "Click Next" anchor is removed while the engine waits for the Wind section (Round-4 held-during-wait), and every Zeplin-anchored terminal "Setup panel"/"Wind" step's anchor is removed when its "…then run again" instruction closes the panel. The Round-4 decision A handled only the first (a `waitDispose`-gated suppression). **Decision: generalize, don't duplicate.** Rather than carry decision A *plus* a separate terminal rule, `pre.8` ships a single **gated degrade-on-removal** behavior (a gated step whose anchor leaves layout re-floats centered, never cancels), of which the Round-4 held-during-wait case is a sub-case. This is *more* used, not less — it is now on the critical path for the common Zeplin-anchored terminals across 23/32/33/34/35/54 as well as 24. Corrected across both specs: the wildfire version-pin description, the contract note (now "two places, one rule"), checkpoint 3/7, and the coachmarks Round-4 decision (generalized).
