# Bottom-Bar Controls: UI/UX Updates for Hazbot Readiness

**Jira**: https://concord-consortium.atlassian.net/browse/WM-23

**Status**: **Closed**

## Overview

Tighten the bottom-bar button widths, hover/select highlight rendering, corner radii,
fullscreen icons, and the "Fire Line" label to match the new Zeplin spec so the bar
visually accommodates the upcoming Hazbot button (epic AP-80) and behaves consistently
across hover and selected states.

## Project Owner Overview

The Hazbot help-overlay epic (AP-80) introduces a new button on the bottom bar. To
make room for it, every existing control needs to match the new Zeplin reference
widths and the bar's right-side spacing has to be predictable both with and without
the Fire Intensity Scale visible. The design team also cleaned up a few existing UI
inconsistencies at the same time: hover/select halo opacities that did not match
spec, the outer widget container top-corner radius (9 px to 10 px), an updated
fullscreen icon set, and a "Fireline" word-mark change. This ticket lands those
clean-ups in one pass so the Hazbot button can drop into a known-good baseline.

## Requirements

### Bottom-bar layout (Zeplin geometry)

The bottom-bar `Bottom Controls` row is 1044 x 75 px in the Zeplin reference.
Control container widths, from left to right (Width is the content width;
Border w. is the rendered outer width including the 1 px border on each side):

| # | Control                | Width (px) | Border w. (px) | Notes |
|---|------------------------|-----------:|---------------:|-------|
| 1 | Setup                  | 82         | 84             | Top corners rounded, radius 10 |
| 2 | Spark                  | 60         | 62             | 10 px content-edge gap after Setup |
| 3 | Reload                 | 60         | shared 122     | Adjacent to Restart, sharing a single 122 x 75 rounded outer border (only outer top corners rounded) |
| 4 | Restart                | 60         | (see Reload)   | Adjacent to Reload |
| 5 | Start / Stop           | 60         | 62             | 10 px content-edge gap after Restart |
| 6 | Fireline               | 65         | shared 132     | Adjacent to Helitack, sharing a single 132 x 75 rounded outer border |
| 7 | Helitack               | 65         | (see Fireline) | Adjacent to Fireline |
| 8 | Fire Intensity Scale   | 140        | 142            | Only shown when `config.showBurnIndex`; 140 px content width with inner 80 px bars centered |
| - | Fullscreen toggle      | 42 x 42 icon (62 x 64 hit target) | n/a | Right-aligned, right edge at bar's right content edge |

All control containers are 74 px tall sitting in the 75 px outer border (1 px top
border). Top-left and top-right corners use `border-radius: 10px`; bottom corners
are flush with the bottom of the viewport.

All "10 px gap" references are measured between content edges (applied as `margin`
on widget content); visible border-to-border gap is therefore 8 px.

### Hover and Select state opacities (icon-on-top buttons only)

Applies to Setup, Spark, Fireline, Helitack. Pill buttons (Reload, Restart,
Start/Stop) preserve their existing `box-shadow` halo behavior unchanged.

- **Default**: highlight SVG at opacity 0
- **Hover**: highlight SVG at opacity 0.5
- **Select (`:active`)**: highlight SVG at opacity 1.0
- **Disabled**: grayscale icon, content opacity 0.35 (preserved from WM-24)
- **Disabled + hover/active**: must NOT apply. Use the project's `.disabled`
  className convention rather than `:disabled` pseudo-class for the guard
  (`.iconButton:not(.disabled):hover ...`).

### Corner radii on hover/select shapes

No change. Pill-button circular `box-shadow` halo and icon-on-top highlight
SVG shapes remain as today.

### Fullscreen icons

- Swap in updated fullscreen SVGs (enter and exit states; light and dark hover
  variants). Four-asset model preserved.
- Container resized from 50 x 50 to 62 x 64 hit-target.
- Icon rendered at fixed 42 x 42 via `background-size: 42px 42px;
  background-repeat: no-repeat; background-position: center`.
- Container `margin-right: 0` (aligns right edge with bar's right content edge).
- Container `margin-top: 6` px (vertically centers the 64 px container in the
  75 px bar; 11 px slack splits as 6 above / 5 below).

### "Fire Line" -> "Fireline"

User-visible button label changes from "Fire Line" (two words) to "Fireline"
(one word). Asset filenames, React variable names (`FireLineIcon`,
`FireLineHighlightIcon`), and `data-testid="fireline-button"` are preserved.

### Layout without Fire Intensity Scale

When `config.showBurnIndex === false`, the middle controls (Setup through
Helitack) are horizontally centered in the available width between the CC logo
on the left and the Fullscreen toggle on the right (instead of being left-
aligned with `.rightContainer` absorbing the leftover width).

### What is explicitly preserved

- All enable/disable behavior from [WM-24](WM-24-model-controls-states.md).
  No state-machine change.
- All event logging (`SimulationStarted`, etc.).
- All keyboard / focus behavior.
- The bottom-bar's overall position (fixed, bottom, full width) and its top
  border treatment.

## Technical Notes

### SCSS variable updates

- `$bottomBarBorderRadius` in `common.scss`: 9 px to 10 px.
- `$bottomBarWidgetGroupSpacing` in `common.scss`: 10 px to 9 px. The base
  `.widgetGroup { margin-right: $bottomBarWidgetGroupSpacing; margin-left:
  -1px }` rule then produces a 9 - 1 = 8 px visible border-to-border gap,
  matching the spec's "8 px visible / 10 px content-edge" requirement.

### Files in scope

- `src/components/bottom-bar.tsx` (JSX restructure, conditional `.fisHidden`,
  fullscreen test-hook wiring)
- `src/components/bottom-bar.scss` (widths, gaps, shared borders, fullscreen
  container, FIS-hidden centering)
- `src/components/common.scss` (radius + spacing variables)
- `src/components/icon-button.scss` (`:not(.disabled):hover/active` rules)
- `src/components/fire-intensity-scale.tsx` (`data-testid` added)
- `src/models/stores.ts` (`window.test.setFullscreenIconState` helper)
- `src/assets/fullscreen{,-dark,-exit,-exit-dark}.svg` (new Zeplin exports)
- `src/components/bottom-bar.test.tsx` (Jest label-rename touchups)
- `cypress/e2e/bottom-bar-state-machine.cy.ts` (cosmetic label-rename
  touchups in `it(...)` descriptions)
- `cypress/e2e/bottom-bar-visuals.cy.ts` (new WM-23-owned visual regression
  spec)

### Verification strategy (three-layer)

1. **Cypress assertions** for deterministic facts: per-widget Border w.
   values, paired shared-Border w., default-state highlight opacity = 0,
   "Fireline" label, fullscreen container 62 x 64 with computed background
   properties, inter-widget gaps (8 px non-paired / 0 px within-pair).
2. **Playwright MCP walkthrough** for browser-level checks Cypress cannot
   reliably do: hover/active opacity (`browser_hover` activates real
   `:hover` unlike `cy.trigger`), pill-button halos, disabled rendering
   regression, compiled-CSS `:not(.disabled):hover/active` guard, fullscreen
   variant toggling via `window.test.setFullscreenIconState`, FIS-hidden
   pixel-symmetric centering, and visual screenshots.
3. **Final eyeball pass** against the Zeplin reference using the Playwright
   screenshots.

## Out of Scope

- The Hazbot button itself (its rendering, click behavior, sidebar
  interaction). Ships in AP-80; WM-23 makes the surrounding layout correct
  but adds no placeholder.
- Any enable/disable behavior change to the seven primary controls (owned
  by [WM-24](WM-24-model-controls-states.md)).
- Any change to the disabled rendering (grayscale + 0.35 opacity, shipped
  in WM-24).
- Renaming `fire-line*.svg` asset filenames (kept as-is per Open Question
  decision).
- Changes to the left-side logo, Wind Meter, Drought controls, or any other
  non-bottom-bar UI.
- Touch / mobile gesture support changes.
- Internationalization or RTL changes.
- A persistent "selected" highlight mode (e.g. Spark button staying lit
  while `ui.interaction === Interaction.PlaceSpark`). The Zeplin "Select"
  state is the `:active` pseudo-class only.

## Decisions

### Requirements-level decisions

#### Should `fire-line*.svg` asset files be renamed to `fireline*.svg`?

**Context**: The user-visible label changes from "Fire Line" to "Fireline" (one
word). The icon assets still use the kebab-case two-word form. Renaming aligns
asset names with the label, but it is a churnier diff for a purely cosmetic
change.

**Options considered**:
- A) Rename to `fireline.svg` / `fireline_highlight.svg` / `fireline_disabled.svg`
- B) Leave asset filenames as `fire-line*.svg`
- C) Rename only the import alias / variable names

**Decision**: **B** — leave asset filenames and React variable names as-is.
Asset file names are private to the bundler; the user-visible label and
`data-testid` are already one-word "fireline".

---

#### How exact should the Reload/Restart/Start hover halo become?

**Context**: Whether to replace the existing `box-shadow` halo with an explicit
Highlight SVG layer to match Zeplin's source-of-truth shape.

**Decision**: **No change to the pill buttons.** They already implement the
50% / 100% halo correctly via `box-shadow`. The actual issue is narrower: the
icon-on-top buttons currently jump from `opacity: 0` straight to `opacity: 1`
on hover with no 50% intermediate and no `:active` distinction. The fix is
CSS-only in `icon-button.scss`: `:hover` at 0.5, `:active` at 1.0. "Select"
means `:active` only, not a persistent selected mode.

---

#### Are any other button labels changing?

**Context**: The Zeplin design surfaced one wording change ("Fire Line" to
"Fireline"). Are any other labels also changing?

**Options considered**:
- A) Only "Fire Line" to "Fireline"; all other labels unchanged
- B) Other labels have changed too

**Decision**: **A** — only "Fire Line" to "Fireline". All other labels
(Setup, Spark, Reload, Restart, Start/Stop, Helitack, Fire Intensity Scale)
stay as-is.

---

#### Does the fullscreen icon container change size (50 x 50 to 62 x 64)?

**Context**: Today the fullscreen toggle renders as a 50 x 50 div with a
background image. The Zeplin design shows a 42 x 42 icon inside a 62 x 64
hit-target container — icon visually smaller, hit target larger.

**Options considered**:
- A1) Honor the design literally: 62 x 64 container, 42 x 42 icon (icon
  shrinks ~16%)
- A2) 62 x 64 container, but keep 50 x 50 icon (only hit target grows)
- B) Keep the current 50 x 50 container; only swap the icon assets

**Decision**: **A1** — 62 x 64 container with a 42 x 42 icon. Side-by-side
comparison of the current app and the Zeplin spec confirmed the icon is
deliberately smaller with more whitespace around it.

---

#### Centering layout when Fire Intensity Scale is hidden

**Context**: Today, when `config.showBurnIndex === false`, the controls stay
left-aligned. The Zeplin spec says: "Middle controls are centered; Hazbot is
then centered between the controls and the Fullscreen Toggle."

**Options considered**:
- A) Ship centering in WM-23 (controls cluster only; Hazbot positioning is
  AP-80's job)
- B) Defer entirely to AP-80
- C) Ship in WM-23 but only for the static (no Hazbot) case; revisit when
  Hazbot lands

**Decision**: **A** — ship in WM-23. It is explicitly in the story and at
least one curriculum-facing config exercises the FIS-hidden case. Scope is
limited to centering the existing controls cluster; positioning the Hazbot
button is AP-80's responsibility.

---

#### Visual regression / acceptance criteria

**Context**: This ticket is mostly visual. Jest snapshot tests will not catch
hover/active opacity changes or border-radius pixel shifts.

**Options considered**:
- A) Manual side-by-side comparison against the Zeplin screen
- B) A Cypress spec asserting computed-style opacity / width / radius
- C) Both — Cypress for deterministic facts, manual review for visual judgment

**Decision**: **C** with a three-layer split:
1. Cypress for static deterministic facts (widths, paired bounding-box,
   default-state highlight opacity, label text, fullscreen container).
2. Playwright MCP for browser-level checks Cypress cannot reliably do
   (hover/active opacity, FIS-hidden centering, fullscreen variant
   toggling, paired-group inner corner radii, pill halos, compiled-CSS
   guard check).
3. Manual eyeball pass against the Zeplin reference using the Playwright
   screenshots.

---

### Implementation-level decisions

#### Should the `$bottomBarBorderRadius: 9 -> 10` SCSS variable bump be its own commit?

**Context**: The variable bump is a one-line change. Splitting it out gives a
trivial standalone commit but adds a commit boundary for an easily-derivable
change.

**Options considered**:
- A) Keep bundled with the layout step
- B) Split into its own commit

**Decision**: **A** — bundled with the layout step. The variable bump is part
of the same corner-radius work the layout step handles.

---

#### Fireline+Helitack shared-border mechanism — Option 1 or Option 2?

**Context**: The Zeplin spec requires a shared outer border for the pair.
Implementation can use either a single outer widgetGroup containing both
buttons (Option 1, matching the existing `.reloadRestart` precedent) or two
sibling widgetGroups with the inner-facing border / radius flattened
(Option 2). Acceptance tests pass either option.

**Options considered**:
- A) Option 1: single outer container per pair
- B) Option 2: two sibling widgets with inner border flattened

**Decision**: **A** — Option 1. Matches the existing Reload+Restart pattern
so the two paired groups stay structurally symmetric.

---

#### Fullscreen test-hook mechanism — instance ref or UIModel hoist?

**Context**: The Playwright fullscreen-variant test needs
`window.test.setFullscreenIconState(boolean)` to drive
`BottomBar.state.fullscreen` without invoking the gated `screenfull` API.

**Options considered**:
- A) Instance ref via `(window as any).test.__bottomBarRef.setState(...)`
- B) Hoist `fullscreen` from `BottomBar.state` to `UIModel` as an
  `@observable`, switch JSX to read from `ui.fullscreen`, and have the
  helper write there

**Decision**: **A** — instance ref. Minimal change, matches the existing
`window.test.*` test-only convention, does not touch production read paths.
The ref slot is typed `any` to avoid a circular import via
`base.ts` -> `stores.ts`. Register/clear happens in `componentDidMount` /
`componentWillUnmount`, outside the `screenfull?.isEnabled` guard so
headless browsers still wire the hook.

---

#### Rename "Fire Line" in state-machine spec `it(...)` descriptions?

**Context**: `cypress/e2e/bottom-bar-state-machine.cy.ts` references "Fire
Line" only in `it(...)` description text (no load-bearing assertions).

**Options considered**:
- A) Include the rename in the label-rename step
- B) Skip — test descriptions are private to the spec file

**Decision**: **A** — include the rename. Keeps the codebase grep-clean for
"Fire Line".

---

#### Cypress visuals spec — new file or append to existing state-machine spec?

**Context**: The implementation can either add a new
`cypress/e2e/bottom-bar-visuals.cy.ts` or append the new visual assertions
to the existing `bottom-bar-state-machine.cy.ts`.

**Options considered**:
- A) New file `cypress/e2e/bottom-bar-visuals.cy.ts`
- B) Append to `cypress/e2e/bottom-bar-state-machine.cy.ts`

**Decision**: **A** — new file. Keeps the WM-24 state-machine spec focused
on lifecycle behavior; the WM-23 visual regression checks live in their
own file.

---

### Spec-discovered implementation fixes

These were not in the original implementation plan; they surfaced during
the Step 6 Cypress run against the actual rendering and were applied
inline.

#### Pill buttons need explicit `width: 60px !important`, not just `min-width`

MUI v5's `.MuiButton-root { min-width: 64px }` is injected via emotion
after the static SCSS and wins on equal-specificity source-order. The
effective rendered width is `max(min-width, width)`, so without
`!important` Reload / Restart / Start each render at 64 px instead of the
spec's 60. `.playbackButton` now uses both `min-width: 60px !important;
width: 60px !important`, matching the same `!important` pattern already
used in the file for the MUI disabled-opacity override.

#### Spark needs an explicit widgetGroup `width: 60px`

`.iconButton { width: 100%; min-width: 60px }` creates a circular-sizing
dependency with its shrink-wrapping parent that resolves to MUI's
64 px default. Re-introduced the `.placeSpark` class on the Spark
widgetGroup (with `width: 60px` instead of the old `margin-right: 0`),
plus `.placeSpark button { min-width: 60px; width: 60px }` to also pin
the inner SVG. Same pattern as `.terrainButton { width: 82px }` and
`.fireIntensityScale { width: 140px }`.

#### Inter-widget margin needs to be 9 px (variable), not 10

The default `.widgetGroup { margin-right: 10px; margin-left: -1px }`
produces a 9 px outer-to-outer gap. The spec's table specifies 8 px
visible (10 px content-edge minus the 1 px border on each side).
Changed `$bottomBarWidgetGroupSpacing` from 10 px to 9 px so the net
rendered visible gap is 9 - 1 = 8 px. The `margin-left: -1px` is
preserved for its border-continuity rendering role.

#### Fire Intensity Scale title alignment

The 140 px FIS widgetGroup has its title label and inner 80 px bars
visually misaligned without `text-align: center` on `.label`: the
title is left-aligned in the 140 px content area while the bars
(80 px) are centered. Added `text-align: center` to `.label`
(only used for the FIS title in the bottom bar).

#### Cypress paired-width assertion: measure the widgetGroup, not the inner bounding box

The original implementation-plan skeleton used
`Math.max(a.right, b.right) - Math.min(a.left, b.left)` on inner
button rects and asserted 122 / 132. Under Option 1 (single shared
widgetGroup, the chosen mechanism) both buttons climb to the same
widgetGroup ancestor and the inner bounding-box returns the content
width (120 / 130), not the Border w. (122 / 132). The test was
changed to `widgetRect("reload-button").width === 122` /
`widgetRect("fireline-button").width === 132` — same logic as the
non-paired widget tests, reading the outer widgetGroup including its
1 px border.
