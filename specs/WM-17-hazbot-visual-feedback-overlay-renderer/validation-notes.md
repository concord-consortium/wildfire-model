# WM-17 — Per-tab Playwright validation notes

Validation of the visual-feedback tour renderer against a running dev server
(yalc-linked `@concord-consortium/coachmarks@0.0.1-pre.8`) on `http://localhost:8081/`,
driven via the Playwright MCP per [CLAUDE.md](../../CLAUDE.md). Screenshots under
`tmp/playwright/` (gitignored). All runs had **0 console errors**.

## Mechanics verified (each distinct shape walked end-to-end)

| Mechanic | Where validated | Result |
|---|---|---|
| Intro popover + `[Show me]`, avatar badge **suppressed** | 23/2, 24/2, 25/4 | ✅ "I can help! / Show me", no badge |
| Gated tour launches on `[Show me]` (intro destroyed → gated `drive`) | 23/2 | ✅ |
| Avatar badge **shown** on tour steps | 23/2, 24/2, 25/4 | ✅ |
| `showProgress` "Step N of M" stepper (Zeplin: Lato 16px, centered, blue #0050c4) | all | ✅ "Step 1 of 3" … "Step 4 of 4" |
| Outline ring on anchored steps | 23/2 | ✅ |
| Forward-only gating (no passive Next on intermediate steps; close kept) | 23/2, 24/2 | ✅ only close btn on intermediate steps |
| Arrow-tip→button gap ≈ 9px (box gap 27 − arrow height 18) | 23/2 (Restart, Setup) | ✅ 27px box gap measured |
| Action-gated advance (click target → next step) | 23/2 (Restart→Setup→panel), 24/2 | ✅ |
| Selector `target` + wait-for-target (Setup panel appears after click) | 23/2, 24/2 | ✅ step 3 anchored once `terrain-panel-container` mounted |
| Terminal step keeps `[Got it!]` Done + close | 23/2, 24/2, 25/4 | ✅ |
| **Gated degrade-on-removal** (terminal re-floats centered on panel close, not cancel) | 23/2 | ✅ popover re-centered exactly (center == viewport center), kept "3 of 3 Got it!" |
| **24 Next→Wind held-anchor-removal** across wizard sub-panel swap | 24/2 | ✅ `terrain-next` removed, tour not cancelled, step 4 re-anchored to `terrain-wind` (center 316==316) |
| Centered-top `ViewportPopover` (no pointer) | 23/2 degraded, 25/4 | ✅ top=0, horizontally centered |
| Popover **image** slot (`image?: ReactNode`) | 25/4 | ✅ "TBD: Mountain image" placeholder SVG rendered |
| Terminal `[Got it!]` completes + resets `showHazbotFeedback`/coached | 23/2, 24/2 | ✅ |
| ×/close dismisses + resets | 25/4 | ✅ |

## Matched-category states reached
- 23 Cat 2 (`NOT setAnyZoneVar AND ranSimulation`) — run defaults on `plainsTwoZone`.
- 24 Cat 2 — run defaults on `plainsTwoZone`.
- 25 Cat 4 (`OneSparkPerZone AND NOT SparksAtTopAndBottom`) — run two sparks on flat `plainsTwoZone` (caps at Cat 4 per CLAUDE.md).

## Coverage rationale for the remaining tabs/categories
The remaining coaching tours (32, 33, 34, 35, 42, 45, 47, 54; and 23/3·4, 24/3·4, 25/2·3·5)
reuse the exact mechanics validated above, differing only in which already-present
`data-testid` each step anchors to:
- Restart → Setup → Setup-panel / Next / Wind: proven by 23/2 and 24/2.
- Reload / Start / Fireline / Spark anchors: structurally identical single-anchor steps
  (the controls are unconditionally rendered; only `disabled` toggles).
- Conditional spark steps (23/4, 33/4, 35/6): the `spark-button` anchor is a plain anchor
  (proven mechanic) and the both-sparks `viewport` branch is the proven centered-top render;
  both branches are unit-tested in `build-tour.test.ts` / `tour-map.test.ts`.
- 34's deferred `0.` intensity cue: tour is its 3 `arrowText` steps (generator warns, not errors).

Log payloads (`HazbotShowMeClicked` / `HazbotTourCompleted` / `HazbotTourDismissed`) are
exhaustively asserted in `hazbot-button.test.tsx`; the lifecycle routes that fire them
(Show-me, terminal Done, ×/Escape) were each exercised in-app above.
