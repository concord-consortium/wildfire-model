# WM-16 — Hazbot Feedback Panel (rendering matched-category feedback)

**Jira**: https://concord-consortium.atlassian.net/browse/WM-16

**Status**: **Closed**

## Overview

When a student clicks the Hazbot Analysis button, show a coach-mark popover anchored above the button that renders the feedback text for the rule-set category the student is currently in. This is the first of two stories; this story shows a single coach mark anchored to Hazbot, and a follow-on story adds a multi-step tour that highlights other elements.

The Hazbot analysis engine (WM-10) has been classifying student behavior into pedagogical categories all along, but students have never seen its output. This story delivers the first student-facing surface for that feedback: clicking the Hazbot button opens a friendly speech-bubble popover above Hazbot with guidance tailored to what the student has (or hasn't) done. It is the MVP "actual feedback" deliverable.

## Requirements

- Render a coach-mark popover, anchored above the Hazbot button, when the student clicks the Hazbot button (`ui.showHazbotFeedback` becomes true).
- The popover body is the `feedback` text of the engine's current `matchedCategory`, with the leading `Hazbot:` speaker prefix stripped.
- The body supports **bold** emphasis (`**…**`), rendered by the coachmarks library's constrained, bold-focused Markdown subset (enabled by default, HTML escaped). *(Rendering is implemented and verified; **authoring** bold in the source Google Sheet + regenerating the rule-set files via `scripts/extract-hazbot-sheets.js` is **deferred to the PIs** — no shipping ruleset contains bold yet.)*
- The bracket token in the feedback (`[…]`) supplies the action button's label; clicking it dismisses the popover. In v1 every action button dismisses regardless of label — including `[Show me]`, which starts the guided tour only once the follow-on story lands.
- A `×` close button also dismisses the popover.
- Pre-run, Category 1 ("Did not run the simulation") matches by default, so the same code path produces the pre-run message with no special-casing.
- While the popover is open, the Hazbot button shows its "Large" state: only the robot avatar scales up (the button "back" keeps its size and `#c1daff` fill); pulsing is suppressed.
- The popover uses the coachmarks `hazbot` theme.
- Any dismissal (action button, `×`, or Escape) resets `ui.showHazbotFeedback` to `false`, and a subsequent Hazbot-button click reopens the popover with the then-current matched category.
- Re-trigger is deferred for v1: the panel opens only on an explicit Hazbot-button click — no transition-based auto-open or re-glow, no cross-session persistence. (The existing post-run pulse from WM-6 still arms on run completion and clears on click.)

### Acceptance criteria

- Clicking the Hazbot button opens a popover anchored above Hazbot showing the current `matchedCategory`'s feedback body, with the leading `Hazbot:` prefix removed.
- Pre-run, the popover shows Category 1's message via the same path (no special-casing).
- Bold authored as `**…**` renders as bold in the popover.
- The action button's label is the bracket token parsed from that category's feedback; clicking it closes the popover.
- The `×` close button and the Escape key also close the popover.
- Each of the three dismiss routes (action button, `×`, Escape) resets `ui.showHazbotFeedback` to `false`; clicking the Hazbot button again reopens with the then-current matched category.
- While the popover is open, the button is in its "Large" state (only the avatar scaled up) and the pulse is suppressed; on close it returns to default.
- Defensive guard: if `matchedCategory` is `null`, the click path does not error (guarded no-op, no popover). A loaded ruleset always floors to ≥1 (Category 1 = `NOT ranSimulation`), so this guard is exercised by mocking, not via the UI.

## Technical Notes

- **Dependency**: wildfire-model depends on `@concord-consortium/coachmarks@0.0.1-pre.7` (published to npm; peer dep `@floating-ui/react` ^0.27), pinned in `package.json` and imported as `createCoachmarksEngine` plus the side-effect stylesheet `@concord-consortium/coachmarks/styles/hazbot`. The release provides, in the `hazbot` theme: **Chakra Petch** for the popover description (Lato stays for labels/buttons); a **constrained Markdown subset** in `description` (bold `**…**`, HTML escaped, default-on with an opt-out flag; `description`/`title` stay `string`); and the **styled close button** (white disc, 3px `#0050C4` ring, blue glyph, top-right, hover/select states — opt in via `showButtons` including `"close"`). The library also carries top-level `main`/`module`/`types` fields (added in `pre.7`) so it resolves under wildfire-model's classic `moduleResolution: node` type-check. For local library development alongside this repo, use `yalc` (workflow doc: `~/tmp/wildfire-yalc.md`).
- **Anchor**: `engine.highlight({ element: avatarEl, popover: { side: "top", align: "center", description: <body> } })`, via a React ref to the **robot-face** `.avatar` span (not the button wrapper, not a `data-testid` query), so the arrow points at Hazbot's face and tracks it as it scales up. The popover renders from within `HazbotButton`, which holds the ref. `ringElement` targets the outer button (inert here — `showOutlineRing: false`).
- **Feedback parsing** (`parseFeedback`, exported for tests): parse the matched category's own `feedback` into (a) body prose with the leading `Hazbot:` prefix removed and (b) the bracket-token button label. Exactly one bracket token per feedback, on the last line. The parsed token becomes the popover's **`doneBtnText`** — a single-step `highlight()` renders `doneBtnText` (the step is last), not `nextBtnText`. Bold `**…**` is left intact in the body for the library to render.
- **Matched category → feedback**: `matchedCategory` is a category `id`; look up `ruleSet.categories.find(c => c.id === matchedCategory)`. Guard the `null`/no-engine case.
- **React integration**: `createCoachmarksEngine()` is created/destroyed inside a `useEffect` keyed on `ui.showHazbotFeedback`. The matched category is read **directly** (`getAnalysisEngine()` + `computeMatchedCategoryForEngine()`) at open time, not via the reactive `useAnalysisEngine()` hook — the value is only needed when the panel opens, so no provider/hook wiring is required. `HazbotButton` is a MobX `observer`.
- **Dismiss → flag reset (re-open correctness)**: the panel is driven off the `ui.showHazbotFeedback` observable, so dismissal must flip it back to `false` or the effect won't re-run on the next click. The action button ("Okay"/Done) reaches `destroy()` directly (fires `onDestroyed`); `×`/Escape fire `onCancelRequested`; `onDestroyed` fires on **every** teardown path. So wire `onCancelRequested → engine.destroy()` and reset `ui.showHazbotFeedback = false` in `onDestroyed` — one handler covering all three routes.
- **Scale-up / "Large" state**: `.hazbotButtonWrap.coached .avatar { transform: scale(1.525); transform-origin: bottom center }`, gated on `ui.showHazbotFeedback`; the button "back" (size + `#c1daff` fill + border) is unchanged. The coach mark opens only after the avatar transform's `transitionend` (or a 400ms fallback) so floating-ui anchors to the enlarged robot.
- **Robot focus ring**: the button uses `onMouseDown` `preventDefault` (no focus on mouse click) and the avatar has `:focus { outline: none }`, so the library's focus-restore-to-anchor on close shows no ring; keyboard focus to the real button still works.
- **Arrow / offset**: the consumer configures `arrow: { width: 36, height: 18, strokeWidth: 3 }` (strokeWidth matches the theme's 3px border) and `popoverOffset: 25` (gap between the arrow tip and the robot).

## Testing

- **Unit (Jest + React Testing Library)**, no WebGL ([hazbot-button.test.tsx](src/components/hazbot-button.test.tsx)): `parseFeedback` directly (prefix strip, token→label, **bold** preserved); and the panel wiring with the **coachmarks engine and analysis-engine reads mocked** — what the engine is opened with (parsed `description`, `doneBtnText`, `showButtons`), the `matchedCategory`→feedback mapping and the no-engine/`null` guard, `ui.showHazbotFeedback` reset via `onDestroyed` (all three dismiss routes) and `onCancelRequested → destroy()`, reopen recomputing the then-current category, and the `.coached` toggle. The library's popover rendering / anchor placement are covered by the library's own tests + Playwright, so these unit tests mock `createCoachmarksEngine` rather than driving the portalled popover; the open-after-scale-up step is exercised by advancing the 400ms fallback timer. Jest needs a `moduleNameMapper` entry stubbing the theme's CSS subpath imports (`^@concord-consortium/coachmarks/styles/` → `identity-obj-proxy`).
- **Visual (Playwright vs Zeplin)** for the open/scale-up/dismiss/scale-down flow, anchor placement, and fonts — design targets, not unit-asserted.
- No new Cypress spec required for v1.

## Out of Scope

- The multi-step guided **tour** / walk-through (stepping through `Category.arrowText`, anchoring to Restart/Setup/etc.) — the follow-on second story.
- The **visual overlay** (outlines, pointers at zone tabs, dashed zone lines) — Visual-feedback overlay renderer sibling story.
- **Confetti / celebration** on the success (terminal/highest-id) category — WM-9.
- **Cross-session persistence** of "user already saw this category's feedback" — depends on AP-73 / NEW-7.
- Coach marks anchored to anything other than the Hazbot button (the tour story).
- **Known limitation (v1)**: action buttons whose label implies a walk-through (e.g. `[Show me]`) only dismiss this story; the walk-through behind them lands with the follow-on tour story. The label is still parsed per-category so it renders correctly.

## Not Yet Implemented

- **Bold-emphasis authoring** in the rule-set feedback — deferred to the PIs. The library *renders* bold (`**…**`) and `parseFeedback` preserves it, and it's verified end-to-end, but the bold markup must be authored in the source Google Sheet and the rule-set files regenerated (`scripts/extract-hazbot-sheets.js`); no shipping ruleset contains bold yet.

## Decisions

### Re-trigger / cooldown behavior — does the panel auto-pop or just re-glow?
**Context**: The v1 working assumption was "per matched-category transition" (auto-open or re-glow on category change). PM input was pending.
**Options considered**:
- A) On transition, re-arm the pulse/glow only; panel opens on explicit click (reuses `hazbotPulseArmed`).
- B) On transition, auto-open the panel.
- C) Defer entirely: panel opens only on click, no transition-based re-trigger in v1.

**Decision**: C — panel opens only on click; no transition-based re-trigger in v1.

---

### How should wildfire-model consume the coachmarks library for this story?
**Context**: The library wasn't on npm yet and wasn't a dependency. The font/Markdown/close-button work and the publish were prerequisites.
**Options considered**:
- A) Publish to npm first, then add as a normal versioned dependency.
- B) Use `yalc` for local development now, switch to the npm version before merge.
- C) Add as a git URL / git tag dependency.

**Decision**: B — develop against the library via `yalc`, then publish to npm and pin the version (`0.0.1-pre.7`) in `package.json` before merge.

---

### What does the `[Show me]` button do in this story (no tour yet)?
**Context**: Intermediate categories use `[Show me]`, which in the full design starts the guided tour — but the tour is the follow-on story. Category ids vary by ruleset, so the label is always parsed per-category, never keyed off a fixed id.
**Options considered**:
- A) `[Show me]` simply dismisses (same as Okay) until the tour story lands.
- B) Rendered but disabled/no-op until the tour lands.
- C) Render whatever bracket token the data provides; every action button is "dismiss" this story.

**Decision**: A — `[Show me]` dismisses like any action button in v1.

---

### Should the feedback body support emphasis, and is the `Hazbot:` prefix always stripped?
**Context**: The 1B design bolds "Scroll up!", but `Category.feedback` is plain text and every prose line begins with `Hazbot:`.
**Options considered**:
- A) Plain text for v1 (no emphasis); always strip the leading `Hazbot:` prefix.
- B) Support a lightweight emphasis convention now (needs a rule-set data/format change).
- C) Render `feedback` verbatim including `Hazbot:` (rejected by design).

**Decision**: B (support emphasis now) combined with A's prefix strip — always strip `Hazbot:`; support bold emphasis. Mechanism tracked in the follow-up decisions below.

---

### Popover placement — title vs description, alignment, and offset.
**Context**: 1B shows body text + button, no separate title, anchored above the button.
**Options considered**:
- A) Body as `description` only (no `title`); `side: "top"`, `align: "end"`, default offset.
- B) Body as `title`.
- C) Other alignment/offset — confirm against the artboard.

**Decision**: A, with `align: "center"` on the robot-face anchor. The 280px popover is wider than the anchor and Hazbot sits near the right edge, so floating-ui's `shift` pushes the popover left while the arrow keeps pointing at the robot face. (Final tuning: `popoverOffset: 25`.)

---

### Emphasis mechanism — markup convention, generator pass-through, and rendering.
**Context**: The coachmarks `description` was typed `string` and rendered verbatim (no markdown). Rule-sets are auto-generated, copying feedback prose verbatim, so a markdown convention passes through with no generator edit; the open part was the *rendering*.
**Options considered**:
- A) Markdown in the source; widen `description`/`title` to `ReactNode`; wildfire-model parses to nodes.
- B) Keep `description: string` and add Markdown rendering inside the library (benefits all consumers).
- C) wildfire-model renders its own body element instead of the library `description`.

**Decision**: B — add Markdown rendering inside the coachmarks library, with a way to disable it; enabled by default. (`description`/`title` stay `string`; the library parses and HTML-escapes.)

---

### What emphasis does the design need, and where does the source markup live?
**Context**: Only bold ("Scroll up!") appears in the design. The rule-set source is a Google Sheet; adding markup means editing the sheet and regenerating.
**Options considered**:
- A) Bold only, via `**…**`, authored in the source sheet; regenerate the rule-set files.
- B) A small fixed set (bold + italic).
- C) Full Markdown subset.

**Decision**: A — bold only, `**…**`. (Authoring + regen deferred to the PIs; see Not Yet Implemented.)

---

### Close button (`×`) — the theme hid it, but the design shows a styled blue-circle `×`.
**Context**: The hazbot theme set `.coachmarks-popover-close-btn { display: none }` (hidden for the earlier AP-64 design). The WM-16 1B design shows a top-right `×` (44×44 target, hover scale-up, select scale-down). Both `×` and the action button dismiss.
**Options considered**:
- A) Update the `hazbot` theme to show/style the close button per the design (benefits all hazbot consumers); add `"close"` to `showButtons`.
- B) Keep the theme hiding it; re-show/style via wildfire-model CSS override.
- C) Don't render a separate `×`; rely on the action button + Escape.

**Decision**: A — the published theme styles the `×` (white disc, 3px `#0050C4` ring, blue glyph, hover/select states); wildfire-model opts in via `showButtons` including `"close"`.

---

### Are the coachmarks-library changes part of WM-16's "done", or separate work? (Senior Engineer)
**Context**: The story depends on three sibling-repo changes (Chakra Petch, Markdown with opt-out, close-button styling) plus an npm publish; there is no coachmarks Jira project.
**Decision**: No separate ticket — WM-16 is the library's first consumer, so the library changes are **in scope for WM-16**. Sequencing: make the library changes → develop via `yalc` → publish to npm → pin the version → merge.

---

### Who resets `ui.showHazbotFeedback` on dismiss, and how does re-open work? (React & MobX)
**Decision**: Reset `ui.showHazbotFeedback = false` in the engine's `onDestroyed` callback (fires on every teardown route: action button, `×`, Escape) and wire `onCancelRequested → engine.destroy()`. The panel is a MobX `observer`; content is recomputed from a direct `getAnalysisEngine()` read at open time. Verified against the library's `engine.tsx` (action button → `destroy()`; `×`/Escape → `cancel()` → `onCancelRequested`; `onDestroyed` on all paths).

---

### Is the `[Show me]` dead-end acceptable UX for v1? (Product Manager / Student)
**Decision**: Yes — keep as-is. The action button is generic: its label is parsed per-category (never hardcoded) and in v1 it simply dismisses regardless of label. The walk-through behind `[Show me]` arrives with the follow-on tour story; the feedback prose stays actionable meanwhile. Recorded as a known limitation in Out of Scope.

---

### Acceptance criteria as testable scenarios, and how this is tested given yalc + WebGL. (QA)
**Decision**: Added explicit Acceptance Criteria + a Testing approach. The panel is unit-tested in jsdom with the coachmarks engine and analysis-engine reads **mocked** (SCSS via `identity-obj-proxy`; the theme's CSS subpath imports stubbed via `moduleNameMapper`), so no WebGL is needed and the library's rendering internals stay out of these tests. The avatar scale-up is a CSS visual target (Playwright vs Zeplin), not unit-asserted.

---

### Category-numbering claims were preset-specific. (Code-verified, PM / data accuracy)
**Decision**: "Categories 2/3/4 use `[Show me]`" and "Category 5 = success" only describe ruleset-47-shaped sheets. The count and success-id vary (ruleset 42 → 3 categories, success = Cat 3; ruleset 47 → 5, success = Cat 5). Reworded the affected Requirement, decision, and Out-of-Scope lines to be id-agnostic (label parsed per-category, never keyed off a fixed id).

---

### The `matchedCategory === null` AC was unreachable via the rendered button. (Code-verified, QA)
**Decision**: The button only mounts when a ruleset exists, and Category 1 (`NOT ranSimulation`) matches the empty reading prefix, so the monotone floor is always ≥1 for a loaded ruleset. Marked the `null` guard defensive (first-render transient) and mock-driven, not UI-exercisable.

---

### Unit assertions / how the popover is tested. (Code-verified, QA)
**Decision**: The popover is portalled via `@floating-ui/react` and the engine mounts in an effect, and jsdom geometry is zeroed, so the library's rendering is not asserted in wildfire-model unit tests. Final approach: mock `createCoachmarksEngine` and assert the consumer wiring (open spec, dismiss callbacks, reopen, `.coached`); placement/rendering are covered by the library's tests + Playwright.

---

### Library-contract precision — action label binds to `doneBtnText`; markdown subset pinned. (Code-verified, library integration)
**Decision**: A single-step `highlight()` renders `doneBtnText` (the step is last), so the parsed token is passed as `doneBtnText`, not `nextBtnText`. The library had no markdown renderer; since feedback originates in an author-edited sheet, the new parser is a constrained bold-focused subset with HTML escaped (never passed through).
