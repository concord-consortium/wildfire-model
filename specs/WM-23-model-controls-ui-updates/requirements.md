# Bottom-Bar Controls: UI/UX Updates for Hazbot Readiness

**Jira**: https://concord-consortium.atlassian.net/browse/WM-23
**Epic**: [AP-80 — Behavior-based Help Overlays](https://concord-consortium.atlassian.net/browse/AP-80)
**Repo**: https://github.com/concord-consortium/wildfire-model
**Zeplin**: https://app.zeplin.io/project/5fe47ae231d1f6a428c53450/screen/6a10419c5f6cb8a5bfd0a9b4
**Implementation Spec**: [implementation.md](implementation.md)
**Status**: **Ready for Implementation**

## Overview

Tighten the bottom-bar button widths, hover/select highlight rendering, corner radii,
fullscreen icons, and the "Fire Line" label to match the new Zeplin spec so the bar
visually accommodates the upcoming Hazbot button (epic AP-80) and behaves consistently
across hover and selected states.

## Project Owner Overview

The Hazbot help-overlay epic (AP-80) introduces a new button on the bottom bar. To
make room for it, every existing control needs to match the new Zeplin reference
widths and the bar's right-side spacing has to be predictable both with and without
the Fire Intensity Scale visible. While the design team was at it, they also cleaned
up a few existing UI inconsistencies — hover/select halo opacities that didn't match
spec, the outer widget container top-corner radius (9 px → 10 px in
[common.scss](../../src/components/common.scss)), an updated fullscreen icon
set, and a "Fireline" word-mark change. This ticket lands those clean-ups in
one pass so the Hazbot button can drop into a known-good baseline.

## Background

The bottom bar in [src/components/bottom-bar.tsx](../../src/components/bottom-bar.tsx)
hosts the student's primary controls: Setup, Spark, Reload, Restart, Start/Stop,
Fire Line, Helitack, optional Fire Intensity Scale, and a Fullscreen toggle in the
top-right corner. Each control is one of two shapes:

- **Icon-on-top buttons** (Setup, Spark, Fire Line, Helitack) — rendered via the
  shared [IconButton](../../src/components/icon-button.tsx) component. The icon SVG
  sits on top of a same-sized white "highlight" SVG that fades in on hover.
- **Pill-shaped icon+label buttons** (Reload, Restart, Start/Stop) — rendered with
  MUI `Button` and a circular SVG icon. The "highlight" is currently a `box-shadow`
  halo around the icon `<svg>` on `:hover` (50% white) and `:active` (100% white).

The new Zeplin spec normalizes button widths, formalizes the hover-50% / select-100%
opacity rule, bumps the outer widget container top-corner radius from 9 px to 10 px,
refreshes the fullscreen icons, and renames "Fire Line" to "Fireline". The
icon-on-top highlight SVG shapes themselves are unchanged (see "Corner radii
on hover/select shapes" below).

WM-23 is a precursor to AP-80, which adds a 122×48 px Hazbot button to the right of
the controls. Getting the surrounding layout ready for it (fullscreen toggle
position, FIS width, centering rule when FIS is hidden) is part of WM-23's scope;
the Hazbot button itself is not.

## Requirements

### Bottom-bar layout

The bottom-bar `Bottom Controls` row is 1044 × 75 px in the Zeplin reference. The
control containers, from left to right, with widths and gaps as measured in Zeplin:

| # | Control                | Width (px) | Border w. (px) | Notes |
|---|------------------------|-----------:|---------------:|-------|
| 1 | Setup                  | 82         | 84             | Top corners rounded, radius 10 |
| 2 | Spark                  | 60         | 62             | 10 px gap after Setup |
| 3 | Reload                 | 60         | shared 122     | 10 px gap after Spark; **adjacent to Restart**, sharing a single 122 × 75 rounded outer border (only outer top corners are rounded) |
| 4 | Restart                | 60         | (see Reload)   | Adjacent to Reload (see above) |
| 5 | Start / Stop           | 60         | 62             | 10 px gap after Restart |
| 6 | Fire Line ("Fireline") | 65         | shared 132     | 10 px gap after Start; **adjacent to Helitack**, sharing a single 132 × 75 rounded outer border (only outer top corners are rounded) |
| 7 | Helitack               | 65         | (see Fireline) | Adjacent to Fireline (see above) |
| 8 | Fire Intensity Scale   | 140        | 142            | Gap after Helitack; only shown when `config.showBurnIndex`. **140 px is the *content* width of the FIS Control container (the "Width" column semantics, same as every other row)** — distinct from the smaller inner `.barsContainer` and `.labels` (currently 80 px each in [fire-intensity-scale.scss](../../src/components/fire-intensity-scale.scss)), which stay at 80 px; the extra width is absorbed by the surrounding `.widgetGroup` padding and the "Fire Intensity Scale" label above the bars. The Border w. value (142) is what `getBoundingClientRect().width` returns and is what the Acceptance section asserts. |
| 9 | Hazbot button          | 122 × 48   | n/a            | **Out of scope for WM-23** — added by AP-80. WM-23 does not add a placeholder; AP-80 will drop the Hazbot button into the layout WM-23 leaves behind (centered cluster when FIS hidden, FIS at its new 140 px width, fullscreen toggle repositioned). |
| — | Fullscreen toggle      | 42 × 42 icon (62 × 64 hit target) | n/a | Right-aligned in `.rightContainer` |

**Width vs. Border w.**: "Width (px)" is the content width of the widget;
"Border w. (px)" is the rendered outer width including the 1 px border on each
side (content + 2). Verification tests reading
`getBoundingClientRect().width` will see the Border w. value. For paired
widgets that share an outer border (Reload↔Restart, Fireline↔Helitack), the
shared border width is reported on the first row and the second row defers to
it.

All control containers are 74 px tall sitting in the 75 px outer border (1 px border).
Top-left and top-right corners use `border-radius: 10px`; bottom corners are flush
with the bottom of the viewport.

All "10 px gap" references in the table are measured between **content edges**
(i.e. applied as `margin` on the widget content); the visible gap between
adjacent 1 px borders is therefore 8 px.

**Margin-override note**: today's `.widgetGroup` applies a uniform
`margin-right: $bottomBarWidgetGroupSpacing` and zeroes specific gaps via the
`.placeSpark`, `.startStop`, and `.helitack` overrides. Once the new widths land,
the adjacency overrides for Reload↔Restart and Fireline↔Helitack need to be
re-verified so the 0 px gap between them is preserved while the 10 px gap
elsewhere remains. The Acceptance section's "Inter-widget gaps" bullet checks
this directly — 8 px visible border-to-border between non-paired widgets, 0 px
within paired widgets — so a regression that breaks the gap math fails an
automated check rather than slipping through on width-only verification.

**Shared-border note**: the shared outer border for Reload↔Restart and
Fireline↔Helitack is a structural change, not just a CSS value change. Today's
per-widget `.widgetGroup` border + radius needs to become either a single outer
container per pair (owning the border and radius, with two borderless inner
widgets), or sibling widgets with the inner-facing border and corner-radius
flattened. The implementation chooses the mechanism; the spec requires only
the visual outcome (single 122 / 132 outer border, no inner divider, only outer
top corners rounded). **Acceptance measures the pair's bounding box, not a
single widgetGroup width** — see the paired-width verification rule in the
Acceptance section — so both structural options pass the same test.

The chosen mechanism also affects which existing margin overrides survive.
Today [bottom-bar.scss:79-92](../../src/components/bottom-bar.scss#L79-L92)
collapses gaps with negative margins on `.placeSpark`, `.startStop`, and
`.helitack`. Option 1 (single outer container) eliminates `.helitack` as a
separate widgetGroup, making its override dead code; option 2 (siblings with
flattened inner border) preserves the override but changes the gap math
since the inner-edge 1 px borders disappear. The implementer must recompute
the collapsed gaps after picking a mechanism so the 10 px content-edge
spacing from the Margin-override note is preserved between pairs and 0 px
is maintained within pairs.

**Layout without Fire Intensity Scale** (`config.showBurnIndex === false`): the
middle controls (Setup through Helitack) are **horizontally centered** in the
available width between the CC logo on the left and the Fullscreen toggle on the
right. The current implementation leaves them left-aligned and lets `.rightContainer`
absorb the leftover width.

The Zeplin annotation also says the Hazbot button is then centered between the right
edge of the controls group and the Fullscreen toggle — but the Hazbot button itself
ships in AP-80, so positioning it is out of scope for WM-23. WM-23 only centers the
existing controls cluster.

Verification: load the dev server with `?showBurnIndex=false` and confirm the
controls render centered horizontally (rather than left-aligned as today).

### Hover and Select state opacities

The fix applies **only to the icon-on-top buttons** (Setup, Spark, Fireline,
Helitack). The pill buttons (Reload, Restart, Start/Stop) already implement the
50% / 100% rule correctly via `box-shadow` halos on `:hover` and `:active`;
their halo behavior is preserved unchanged by this ticket. Width, paired
outer border, and corner radius for the pill buttons are governed by the
Layout section above, not this section.

For the icon-on-top buttons, per the Zeplin annotations:

- **Default**: highlight SVG at opacity 0 (hidden)
- **Hover**: highlight SVG at opacity 0.5
- **Select (`:active`, mouse pressed)**: highlight SVG at opacity 1.0
- **Disabled**: gray-scale icon, content opacity 0.35 (current WM-24 behavior; no
  change to disabled rendering in this ticket)
- **Disabled + hover/active**: when the button is disabled, the new `:hover` and
  `:active` rules must **not** apply — the highlight SVG stays at opacity 0. In
  practice MUI v5 sets `pointer-events: none` on disabled buttons (so `:hover`
  doesn't fire), but a defensive guard makes the intent explicit and survives
  future MUI changes. Use `.iconButton:not(.disabled):hover ...` to match the
  file's existing `&.disabled` className convention at
  [icon-button.scss:34](../../src/components/icon-button.scss#L34) rather than
  `:not(:disabled)`.

Today, [icon-button.scss:17-25](../../src/components/icon-button.scss#L17-L25) flips
`.iconButtonHighlightSvg` from `opacity: 0` straight to `opacity: 1` on `:hover`,
with no 50% intermediate and no `:active` distinction — that's the bug to fix. The
new rule is CSS-only: `:hover` at 0.5, `:active` at 1.0.

**"Select" semantics**: "Select" in the Zeplin annotation means the `:active`
pseudo-class only (mouse button held down). It does **not** include a persistent
"selected mode" — e.g. when `ui.interaction === Interaction.PlaceSpark`, the Spark
button does **not** stay highlighted at 100% until the user places a spark. That
would require new `selected` plumbing through `IconButton` and is out of scope for
WM-23.

### Corner radii on hover/select shapes

No change is expected here. The pill buttons' circular `box-shadow` halo is correct
(the icon SVG is intentionally `border-radius: 15px` = a circle, and the halo grows
out from it). The icon-on-top buttons' highlight SVGs inherit no radius today and
should continue to render with the shape baked into the SVG. The implementation
should verify nothing accidentally rounds the icon-on-top highlight shapes when the
hover/active opacity rule is added.

### Fullscreen icons

Swap in the updated fullscreen SVG icons (enter and exit states, hover variants).
Currently the four assets live at
[src/assets/fullscreen.svg](../../src/assets/fullscreen.svg),
[src/assets/fullscreen-dark.svg](../../src/assets/fullscreen-dark.svg),
[src/assets/fullscreen-exit.svg](../../src/assets/fullscreen-exit.svg), and
[src/assets/fullscreen-exit-dark.svg](../../src/assets/fullscreen-exit-dark.svg).

The Zeplin design shows a **42 × 42 icon inside a 62 × 64 hit-target container**
(vs. today's 50 × 50 container with a 50 × 50 background image). The icon shrinks
visually by ~16% and the click target grows by ~12 px in each dimension. Side-by-side
inspection confirmed this is the designer's deliberate choice, not a redraw at the
same visual size.

Required changes:

- Download the new SVGs for all four states (enter default, enter hover-dark,
  exit default, exit hover-dark) from the Zeplin screen and overwrite the
  four existing files. The four-asset model is locked in by the Asset
  deliverables subsection below; if Zeplin's export deviates (e.g. ships
  fewer files or uses a CSS-only hover treatment), route it back to the
  spec author per the "spec-level question, not a free implementer
  decision" rule in Asset deliverables.
- Update `.fullscreenIcon` rules in
  [bottom-bar.scss:114-131](../../src/components/bottom-bar.scss#L114-L131) to render a
  62 × 64 container with a 42 × 42 background-size (replacing the current
  `background-size: 100%` against a 50 × 50 div). Also set
  `background-repeat: no-repeat` and `background-position: center` —
  shrinking the icon from 100% to a fixed 42 × 42 inside a larger
  container leaves 20 × 22 px of slack where the CSS default
  `background-repeat: repeat` would tile partial copies of the icon,
  and `background-position: center` keeps the glyph visually centered
  in the hit target (10 px horizontal slack, 11 px vertical).
- Preserve the current hover swap pattern (icon → `-dark` variant). The
  Acceptance section's 4-distinct-rendered-variants Playwright check
  depends on this pattern; a hover treatment change would invalidate
  it and is therefore out of scope (route any Zeplin deviation back to
  the spec author per Asset deliverables).
- Set the `.fullscreenIcon` (hit-target container) right margin to **0 px**:
  the hit-target's right edge aligns with the bar's right content edge per the
  Zeplin geometry (hit-target right at x=1044 = bar content right). The old
  5 px right margin convention is wrong for the new 62 × 64 container.
- Set the `.fullscreenIcon` top margin so the 64 px container is vertically
  centered in the 75 px bar: 11 px slack split symmetrically gives **5-6 px**
  (the exact pixel is implementer's call between 5 and 6; either passes the
  ±1 px tolerance in the Acceptance section's vertical-centering check).

#### Asset deliverables

To make the asset swap reviewable without Zeplin access:

- **Filenames preserved.** The four existing files are overwritten in place:
  `src/assets/fullscreen.svg`, `src/assets/fullscreen-dark.svg`,
  `src/assets/fullscreen-exit.svg`, `src/assets/fullscreen-exit-dark.svg`.
  No new files, no renames. Any new SVG export from Zeplin that doesn't map
  cleanly to one of these four names is a spec-level question, not a free
  implementer decision.
- **Source of truth.** SVGs come from the Zeplin screen linked in the
  spec header. The PR description records the date the assets were
  pulled from Zeplin (so a later regeneration can confirm it's pulling
  the same revision).
- **PR evidence.** The implementer generates a 4-up preview screenshot
  showing the new icons rendered at 42 × 42 inside the 62 × 64
  container in all four states (default, default + hover, exit, exit +
  hover) and **attaches it to the PR description or a PR comment**
  (drag-and-drop into the GitHub editor; GitHub renders the image
  inline at a `user-images.githubusercontent.com` URL). The
  intermediate file lives under `tmp/playwright/` per the project's
  Playwright convention ([CLAUDE.md](../../CLAUDE.md)) — `tmp/` is
  gitignored, so the screenshot is not committed; the PR attachment is
  the reviewable artifact. This makes asset correctness reviewable
  from the PR alone without polluting the repo.

### "Fire Line" → "Fireline"

The user-visible label on the Fire Line button (currently `"Fire Line"` in
[bottom-bar.tsx:168](../../src/components/bottom-bar.tsx#L168)) becomes `"Fireline"`
(one word). The Zeplin label, asset names, and the AP-80 epic all use the one-word
form. Existing internal identifiers stay:

- `data-testid="fireline-button"` (already one word)
- File paths `fire-line.svg`, `fire-line_highlight.svg`, `fire-line_disabled.svg`
  (kebab-case file names stay as-is unless the swap also renames them — see Open
  Questions)
- CSS class `fireLine` if any (none currently)

### What is explicitly preserved

- All enable/disable behavior from [WM-24](../WM-24-model-controls-states.md). No
  state-machine change in this ticket.
- All event logging (`SimulationStarted`, etc.).
- All keyboard / focus behavior.
- The bottom-bar's overall position (fixed, bottom, full width) and its top border
  treatment.

## Technical Notes

### SCSS variable updates

- [common.scss](../../src/components/common.scss): update
  `$bottomBarBorderRadius: 9px` → `10px` to match the Zeplin spec. Only consumer is
  `.widgetGroup` in `bottom-bar.scss` (lines 52-53), so the change is contained.

### Files in scope

- [src/components/bottom-bar.tsx](../../src/components/bottom-bar.tsx) — JSX for the bar
  and individual control widgets; the `Fire Line` label lives at line 168. Also
  wires whatever mechanism the new `window.test.setFullscreenIconState` hook
  needs (instance ref, MobX store accessor, etc.) so a Playwright acceptance
  check can toggle the fullscreen-icon-state without invoking the real
  Fullscreen API.
- [src/components/bottom-bar.scss](../../src/components/bottom-bar.scss) — sizing,
  spacing, `.playbackButton` rules (the `border-radius: 15px` on the SVG and
  `box-shadow` halo behavior live here at lines 142-165). The disabled rule
  (lines 167-195) is from WM-24 and is preserved.
- [src/components/icon-button.tsx](../../src/components/icon-button.tsx) — `IconButton`
  component used by Setup, Spark, Fireline, Helitack.
- [src/components/icon-button.scss](../../src/components/icon-button.scss) — the
  `.iconButtonHighlightSvg` opacity rule (currently `0` default, `1` on hover) at
  lines 17-25 is the main hover/select target.
- [src/components/fire-intensity-scale.scss](../../src/components/fire-intensity-scale.scss)
  — confirm 140 px container width matches the spec.
- [src/components/fire-intensity-scale.tsx](../../src/components/fire-intensity-scale.tsx)
  — add `data-testid="fire-intensity-scale"` to the root `<div>` (currently
  `<div className={css.fireIntensityScale}>` at
  [fire-intensity-scale.tsx:10](../../src/components/fire-intensity-scale.tsx#L10)).
  No other selector exists for the FIS widget today and the Acceptance
  section's width / gap / centering assertions pivot from a testid via
  `.closest('[class*="widgetGroup"]')` for every other control. The testid
  name follows the kebab-case convention used by the seven primary
  control buttons.
- [src/components/bottom-bar.test.tsx](../../src/components/bottom-bar.test.tsx) — Jest
  test referencing the `Fire Line` label string will need to be updated.
- **New Cypress spec** (suggested filename `cypress/e2e/bottom-bar-visuals.cy.ts`)
  — owns the deterministic Cypress assertions WM-23 introduces (widget widths
  matching the Border w. column, paired bounding-box widths for
  Reload+Restart and Fireline+Helitack, default-state highlight opacity = 0
  on the icon-on-top buttons, "Fireline" label text on the Fire Line button,
  fullscreen container 62 × 64 with computed `background-size: 42px 42px`).
  See the Acceptance section for the canonical assertion list. The
  implementer may instead append these specs to an existing file if they
  prefer one consolidated bottom-bar spec; the file split is not
  load-bearing.
- [cypress/e2e/bottom-bar-state-machine.cy.ts](../../cypress/e2e/bottom-bar-state-machine.cy.ts)
  — the WM-24 state-machine spec. **No assertion changes required by WM-23**:
  the file already keys off `data-testid="fireline-button"` (already one
  word) and has no fullscreen-icon background-image assertions. The string
  `"Fire Line"` appears only in `it(...)` test description text and inline
  comments; renaming those to `"Fireline"` for consistency with the
  user-visible label is an optional cosmetic touch-up, not load-bearing
  scope for this ticket.
- [src/models/stores.ts](../../src/models/stores.ts) — extend `window.test`
  with `setFullscreenIconState(boolean)`. Test-only affordance, no
  production caller. Mechanism (ref to the BottomBar instance, hoisting
  fullscreen state to a MobX store, etc.) is the implementer's choice;
  the existing `window.test.*` helpers ship in all builds, and this one
  follows the same convention.
- [src/assets/fullscreen.svg](../../src/assets/fullscreen.svg) and the three sibling
  fullscreen SVGs — to be replaced with the new Zeplin exports.
- [src/assets/bottom-bar/](../../src/assets/bottom-bar/) — `fire-line*.svg` assets may
  be renamed to `fireline*.svg` if the user wants file names aligned with the new
  label (see Open Questions).

### Reference attachments (Jira)

The ticket has two reference screenshots:

- `image-20260523-152608.png` — annotated "before" / current rendering
- `image-20260523-152512.png` — annotated "after" / new spec

Both are visible at https://concord-consortium.atlassian.net/browse/WM-23.

### Zeplin geometry summary (extracted from the screen above)

```
Bottom Controls: 1044 × 75 px
  Setup        x=  0  w= 82  h=74   border 84 × 75 radius=10
  Spark        x= 92  w= 60  h=74   border 62 × 75 radius=10  (10 px gap from Setup)
  Reload       x=162  w= 60  h=74   } shared border 122 × 75 radius=10  (10 px gap from Spark)
  Restart      x=222  w= 60  h=74   }   (only outer top corners rounded)
  Start/Stop   x=292  w= 60  h=74   border 62 × 75 radius=10  (10 px gap from Restart)
  Fireline     x=362  w= 65  h=74   } shared border 132 × 75 radius=10  (10 px gap from Start)
  Helitack     x=427  w= 65  h=74   }   (only outer top corners rounded)
  Fire Intensity Scale  x=502  w=140  h=74   border 142 × 75 radius=10  (10 px gap from Helitack)
  Hazbot button (AP-80) x=809  w=122  h=48   (AP-80 owns exact position)
  Fullscreen icon — glyph        x=992 w=42 h=42  (right edge at x=1034)
  Fullscreen icon — hit target   x=982 w=62 h=64  (right edge at x=1044 = bar
                                                    content right; glyph centered
                                                    with 10 px slack each side
                                                    horizontally, 11 px vertically
                                                    inside the bar's 75 px height)

Hover / Select rule (Setup, Spark, Fireline, Helitack):
  Default: highlight opacity 0
  Hover:   highlight opacity 0.5
  Active:  highlight opacity 1.0

Disabled (no change from WM-24):
  grayscale + content opacity 0.35, button background unchanged
```

### AP-80 hand-off

What WM-23 delivers as a baseline for the Hazbot button (AP-80) to land on top of:

- All seven control widths, gaps, and 10 px corner radii match the Zeplin layout
  table.
- Hover (50%) and `:active` (100%) opacity rule on the icon-on-top buttons (Setup,
  Spark, Fireline, Helitack); pill-button halos unchanged.
- "Fire Line" → "Fireline" label.
- Updated fullscreen icon (42 × 42) inside the larger 62 × 64 hit-target container,
  top-right-aligned.
- When `?showBurnIndex=false`, the controls cluster is horizontally centered in
  the bottom bar.

What AP-80 still needs to add:

- Rendering of the Hazbot button itself (122 × 48 per Zeplin), with its click
  behavior and any sidebar / overlay interactions.
- Positioning of the Hazbot button in both layout modes:
  - **FIS visible**: Hazbot sits at roughly x=809 (between the right edge of the
    Fire Intensity Scale Control and the Fullscreen toggle).
  - **FIS hidden**: Hazbot is centered in the gap between the right edge of the
    centered controls cluster and the Fullscreen toggle. The centering rule that
    WM-23 ships only positions the controls cluster; positioning Hazbot against
    that cluster is AP-80's responsibility.

### Acceptance / verification

**CSS-module selectors**: `bottom-bar.scss` and `icon-button.scss` are
imported as CSS modules (`import css from "./bottom-bar.scss"`), and
[webpack.config.js:44-45](../../webpack.config.js#L44-L45) sets
`localIdentName: '[name]--[local]--__wildfire-v1__'`. Class names you'd
expect to write as `.fullscreenIcon`, `.fullscreen`, or
`.iconButtonHighlightSvg` are rendered as e.g.
`bottom-bar--fullscreenIcon--__wildfire-v1__`. **All class-name selectors
in the steps below must use the `[class*="name"]` attribute-substring
form** (`[class*="fullscreenIcon"]`, `[class*="fullscreen"]`, etc.); bare
`.name` selectors will not match the rendered DOM. The few `data-testid`
selectors (`[data-testid="fireline-button"]`, etc.) survive unchanged.

Three-layer verification (extends the two-layer pattern from
[WM-24](../WM-24-model-controls-states.md) with a Playwright MCP middle layer
for hover/active and other browser-level checks Cypress can't reliably do):

1. **Cypress assertions** for deterministic facts that pixel-level visuals don't
   tell us:
   - Button container widths match the Layout table's **Border w. column**
     (Setup 84, Spark 62, Start 62, FIS 142). For non-paired widgets,
     `getBoundingClientRect().width` on the widgetGroup includes the 1 px
     border on each side, so the assertion targets the Border w. value, not
     the inner content Width. Pivot from each control's `data-testid`
     via `.closest('[class*="widgetGroup"]')`; the testids in scope are
     `terrain-button`, `spark-button`, `start-button`, and
     `fire-intensity-scale` (the FIS testid is added by this ticket per
     the Files in Scope entry for `fire-intensity-scale.tsx`).
   - For the paired widgets (Reload+Restart 122 shared, Fireline+Helitack
     132 shared), assert the **bounding-box width** across the pair, not
     a single widgetGroup width:
     `Math.max(a.right, b.right) − Math.min(a.left, b.left)` where `a` and
     `b` are the `getBoundingClientRect()` values of the two paired
     widgetGroups. This rule is implementation-agnostic — it returns 122 /
     132 whether the implementation used a single outer container (one
     widgetGroup spanning the pair) or two flattened-border siblings (two
     widgetGroups whose inner edges abut).
   - Computed opacity on each icon-on-top button's
     `[class*="iconButtonHighlightSvg"]` span: `0` in default state. Hover
     (0.5) and `:active` (1.0) are verified manually — asserting them in
     default Cypress is fragile because
     `.trigger('mouseover'/'mousedown')` doesn't reliably activate the CSS
     `:hover` / `:active` pseudo-classes for `getComputedStyle` reads, and
     the repo doesn't currently use `cypress-real-events`.
   - **Inter-widget gaps.** Assert the gap from each widget's right
     edge to its right-hand neighbor's left edge via
     `nextRect.left − prevRect.right`. Allow ±1 px for subpixel
     browser rounding. The rect source depends on whether the
     adjacency crosses a pair boundary, because the within-pair case
     interacts with the shared-border implementation choice (see the
     Shared-border note in the Layout section):
     - **Non-paired adjacencies (expected 8 px):** Setup→Spark,
       Spark→Reload, Restart→Start, Start→Fireline, Helitack→FIS. Use
       each `[data-testid="..."]`'s
       `.closest('[class*="widgetGroup"]')` rect. Under Option 1 the
       paired-side widget's closest widgetGroup is the shared
       container (whose outer-edge rect is exactly what the adjacency
       math needs); under Option 2 it is the widget's own group. Both
       return the same visible gap. The `8` follows from the spec's
       "10 px content-edge gap" minus the 1 px border on each adjacent
       widget.
     - **Within-pair adjacencies (expected 0 px):** Reload→Restart,
       Fireline→Helitack. Use the **inner button rects** directly
       (`[data-testid="reload-button"]` and
       `[data-testid="restart-button"]`, etc.), **not** their
       widgetGroup ancestors. Under Option 1 both buttons climb to the
       same container, so the closest-widgetGroup formula degenerates
       (a rect compared to itself or to a slightly-outer ancestor
       produces 0-or-negative noise, not the intended within-pair
       gap); under Option 2 each button has its own widgetGroup but
       they abut after inner-border flattening. The button-rect
       formulation returns 0 for both options.
   - The Fire Line button renders the label text `"Fireline"`.
   - The fullscreen container is 62 × 64 (width/height on
     `[class*="fullscreenIcon"]`) with the icon rendered at 42 × 42 via
     `background-size: 42px 42px`. Assert four computed-style values on
     the same element: `width === '62px'`, `height === '64px'`,
     `background-size === '42px 42px'`, `background-repeat ===
     'no-repeat'`, and `background-position === '50% 50%'` (the
     browser-canonical form of `center`). The last two close the
     tiling/positioning footgun that opens once the icon stops filling
     the box.
2. **Playwright MCP walkthrough** for the browser-level checks that Cypress
   can't reliably perform. Drive a real browser against the running dev server
   (`npm start` → `http://localhost:8080`). General pattern from
   [CLAUDE.md](../../CLAUDE.md): screenshots go to `tmp/playwright/`; use
   `browser_evaluate` for computed-style reads, `browser_hover` for real CSS
   `:hover` (unlike Cypress's `cy.trigger`).

   **Viewport preamble.** Before the first `browser_navigate`, call
   `browser_resize({ width: 1400, height: 1000 })`. This matches the
   project's Cypress default
   ([cypress.config.ts:6-7](../../cypress.config.ts#L6-L7)) and is
   comfortably wider than the 1044 px bottom bar, so the FIS-hidden
   centering math behaves as designed and visual screenshots match what
   reviewers see in Cypress runs. Most other Playwright assertions
   (widget widths, computed opacities, label text) are viewport-
   independent, but setting the viewport once up front removes the
   "which environment was this run in" question from every later step.

   - **Default layout (FIS visible).** `browser_navigate("http://localhost:8080/")`.
     Use `browser_evaluate` to read each widget's `getBoundingClientRect()`
     (select via `[data-testid="..."]` then `.closest('[class*="widgetGroup"]')`).
     For **non-paired widgets**, compare `.width` against the Layout table's
     **Border w. column**: Setup 84, Spark 62, Start 62, FIS 142. For the
     **paired widgets**, compute the pair's bounding-box width
     (`Math.max(a.right, b.right) − Math.min(a.left, b.left)`) and compare
     against 122 (Reload+Restart) and 132 (Fireline+Helitack). The
     bounding-box rule passes for both shared-border structural options
     (single outer container vs. flattened-border siblings). Read
     `border-top-left-radius` on each to confirm 10 px on outer corners. Testids
     in scope: `terrain-button`, `spark-button`, `reload-button`,
     `restart-button`, `start-button`, `fireline-button`, `helitack-button`,
     and `fire-intensity-scale` (added by this ticket per the Files in Scope
     entry for `fire-intensity-scale.tsx`).

   - **Inter-widget gaps.** Assert the gap from each widget's right
     edge to its right-hand neighbor's left edge via
     `nextRect.left − prevRect.right`. Allow ±1 px for subpixel
     browser rounding. The rect source depends on whether the
     adjacency crosses a pair boundary, mirroring the Cypress
     version's logic:
     - **Non-paired adjacencies (expected 8 px):** Setup→Spark,
       Spark→Reload, Restart→Start, Start→Fireline, Helitack→FIS. Use
       the widgetGroup rects collected for the Default-layout check
       above (`.closest('[class*="widgetGroup"]')`). Under Option 1
       (single outer container per pair) the paired-side widget's
       closest widgetGroup is the shared container (its outer-edge
       rect is what the adjacency math needs); under Option 2
       (flattened-inner-border siblings) it is the widget's own group.
       Both options return the same visible gap. The `8` follows from
       the spec's "10 px content-edge gap" minus the 1 px border on
       each adjacent widget.
     - **Within-pair adjacencies (expected 0 px):** Reload→Restart,
       Fireline→Helitack. Use the **inner button rects** directly
       (`[data-testid="reload-button"]` and
       `[data-testid="restart-button"]`, etc.), **not** their
       widgetGroup ancestors. Under Option 1 both buttons climb to the
       same container (the widgetGroup formula degenerates to
       comparing a rect to itself or to a slightly-outer ancestor);
       under Option 2 each button has its own widgetGroup but they
       abut after inner-border flattening. The button-rect formulation
       returns 0 for both options.

     This closes the gap that width-only assertions left open (correct
     widths can still ship with wrong margins) without leaking the
     shared-border implementation choice into the test.

   - **Paired-group inner corner radii (no rounded inner corners).** For the
     Reload↔Restart and Fireline↔Helitack pairs, the inner-facing top corners
     must be flat (radius 0); only the outer top corners are rounded. The
     exact assertion targets depend on the shared-border implementation
     choice (single outer container vs. flattened-inner-corner siblings) —
     the test author reads the rendered DOM and asserts:
     - The outer-left top corner of the pair has `border-top-left-radius: 10px`.
     - The outer-right top corner of the pair has `border-top-right-radius: 10px`.
     - Every other top corner inside the pair's bounding box is `0px`.

     This closes the "no inner divider, flat inner corners" gap for the
     paired groups. The "no border line between siblings" half stays
     eyeball — asserting absence of a border via computed styles is fragile
     and depends on the chosen implementation.

   - **Hover and active opacity (icon-on-top buttons).** For each of the four
     icon-on-top buttons (`terrain-button`, `spark-button`, `fireline-button`,
     `helitack-button`), `browser_hover` the testid while the button is
     **enabled**, then `browser_evaluate` to read
     `getComputedStyle(highlightSvg).opacity` on the inner
     `[class*="iconButtonHighlightSvg"]` span (expect `0.5`). Then hover
     elsewhere (default state) and re-read (expect `0`). Each button enables
     in a different state per the WM-24 state machine
     ([../WM-24-model-controls-states.md](../WM-24-model-controls-states.md)):
     - `terrain-button` (Setup) and `spark-button`: enabled in **Default**,
       so hover them immediately after `browser_navigate`. If the Terrain
       Setup dialog is open on first load, dismiss it via Next → Create
       (see [CLAUDE.md](../../CLAUDE.md) "Spark count of `2` with a
       disabled Spark button" guidance) before hovering Spark.
     - `fireline-button` and `helitack-button`: only enabled in **Running /
       Paused** (authored AND cooldown elapsed AND
       `ui.interaction !== Interaction.DrawFireLine` / `Helitack`). Reach
       that state by `window.test.placeSparkInZone(0)` then clicking
       `[data-testid="start-button"]`. Hover each **before** clicking either
       tool to enter placement mode (clicking the tool flips
       `ui.interaction` and disables the same button).
     For `:active`, `browser_evaluate` can dispatch a synthetic `mousedown`
     and re-read opacity (expect `1`), but `:active` pseudo-class activation
     under synthetic events is browser-dependent; a `browser_take_screenshot`
     during a real mouse-down is the visual backup.

   - **Pill-button halos (Reload, Restart, Start).** Regression check that the
     existing `box-shadow` halos on the pill buttons are preserved. All three
     are disabled in the WM-24 Default state
     ([../WM-24-model-controls-states.md](../WM-24-model-controls-states.md)),
     so each must be brought to an enabled state before hovering:
     - `reload-button` and `start-button`: enabled in **Spark-Placed**
       (Reload via `setupChanged || sparks.length > 0`; Start via at least
       one placed spark). Reach via `window.test.placeSparkInZone(0)`, then
       `browser_hover` each.
     - `restart-button`: enabled only after Start has been pressed (Running
       / Paused / Ended / Restarted). After hovering Reload and Start, click
       `[data-testid="start-button"]` to enter Running, then hover
       `restart-button`.
     For each enabled hover, `browser_evaluate` reads
     `getComputedStyle(svgInside).boxShadow` on the inner `svg` element
     (`[data-testid="reload-button"] svg` etc.; source rule lives at
     [bottom-bar.scss:142-147](../../src/components/bottom-bar.scss#L142-L147)
     under the `.playbackButton svg` selector). Expect a value containing
     `rgba(255, 255, 255, 0.5)` (or `rgb` form with 50% alpha). Then
     `browser_hover` elsewhere and re-read (expect `none`). `:active`
     (100% alpha) shares the same synthetic-mousedown caveat as the
     icon-on-top buttons; eyeball is the backup.

   - **Disabled rendering (regression check on WM-24 behavior).** Advance to
     a state where an icon-on-top button is disabled (per WM-24's state
     machine — e.g. Setup is disabled after Start). `browser_evaluate`
     reads two targets — these rules live on the disabled state and are
     preserved unchanged from WM-24:
     - **Button root** (`button[data-testid="terrain-button"]`):
       `getComputedStyle(root).filter` → contains `grayscale(1)`. The
       grayscale filter lives on the `.iconButton.disabled` rule, not on
       the inner content span.
     - **Content span** (`button[data-testid="terrain-button"] > span`):
       `getComputedStyle(contentSpan).opacity` → `0.35`. This is the
       `> span { opacity: 0.35 !important }` rule that fades only the
       content while leaving the MUI button background unchanged.

   - **`:not(.disabled):hover` and `:not(.disabled):active` guards wired in
     compiled CSS.** The natural "hover/click the disabled button and
     verify highlight opacity stays at `0`" check is a false positive:
     MUI v5 sets `pointer-events: none` on disabled buttons, so neither
     `:hover` nor `:active` fires and the assertion passes whether or
     not the guards exist in CSS. The spec's
     "Hover and Select state opacities" section requires **both** guards
     ([requirements.md:146-153](#hover-and-select-state-opacities) —
     `:hover` and `:active` rules must not apply when disabled), so the
     check needs to verify both. Inspect the compiled stylesheet via
     `browser_evaluate`:

     ```js
     () => {
       const rules = [...document.styleSheets].flatMap(s => {
         try { return [...s.cssRules]; } catch { return []; } // skip cross-origin
       });
       // Distinguish the .disabled class form from the :disabled
       // pseudo-class form. CSS-modules hashes `.disabled` to
       // `.icon-button--disabled--__wildfire-v1__`, so the hashed
       // form always contains the substring `--disabled--`. The
       // pseudo-class form would appear as `:not(:disabled)` and
       // contains no `--disabled--` substring. Spec prose requires
       // the .disabled class form (matches the file's existing
       // convention at icon-button.scss:34).
       const findGuarded = (pseudo) => rules.find(r =>
         r.selectorText &&
         r.selectorText.includes("iconButton") &&
         r.selectorText.includes(":not(") &&
         r.selectorText.includes("--disabled--") &&
         !r.selectorText.includes(":not(:disabled)") &&
         r.selectorText.includes(pseudo) &&
         r.selectorText.includes("iconButtonHighlightSvg")
       );
       const hover  = findGuarded(":hover");
       const active = findGuarded(":active");
       return {
         hover:  { found: !!hover,  opacity: hover?.style.opacity },
         active: { found: !!active, opacity: active?.style.opacity },
       };
     }
     ```

     Expect `hover.found === true && hover.opacity === "0.5"` and
     `active.found === true && active.opacity === "1"`. The substring
     matches survive CSS-modules hashing because the class names are
     embedded in the selector text (`.bottom-bar--iconButton--__wildfire-v1__:not(.icon-button--disabled--__wildfire-v1__):hover ...`).
     The `--disabled--` predicate distinguishes the project's `.disabled`
     className convention (specified in the Hover section at
     [icon-button.scss:34](../../src/components/icon-button.scss#L34))
     from the bare `:disabled` HTML pseudo-class, which would pass a
     plain `disabled` substring check but contradict the prose. This
     proves both guards exist in the compiled CSS independent of whether
     MUI's `pointer-events: none` ever lets `:hover` / `:active` engage.

     A companion `browser_hover` on the disabled button followed by a
     highlight-opacity read is fine to keep as a belt-and-suspenders
     smoke check (expect `0`), but it is not the load-bearing
     assertion — the stylesheet rule check is.

   - **Fireline label.** `browser_evaluate` reads
     `document.querySelector('[data-testid="fireline-button"]').textContent.trim()`
     → expect `"Fireline"` (one word).

   - **Fullscreen container and icon size.** `browser_evaluate` on
     `[class*="fullscreenIcon"]`: `getBoundingClientRect()` → expect ≈
     62 × 64; `getComputedStyle(...).backgroundSize` → expect `42px 42px`;
     `backgroundRepeat` → expect `no-repeat`; `backgroundPosition` →
     expect `50% 50%` (the browser-canonical form of `center`). Also
     assert positioning of the hit-target within the bar:
     - **Right-edge alignment** with the bar's right content edge:
       `fullscreenIconRect.right` is within ±1 px of the bar's
       right content edge (read via the bar container's
       `getBoundingClientRect().right` or
       `document.documentElement.clientWidth` if the bar spans the
       viewport).
     - **Vertical centering** in the 75 px bar: the hit-target top
       offset from the bar's top is within ±1 px of `(75 - 64) / 2 = 5.5`
       (i.e. 5 or 6 px is acceptable).

   - **Fullscreen icon variants (all four assets).** Walks the fullscreen
     icon's background-image through default → hover → exit → exit+hover
     without depending on the real Fullscreen API. The four SVGs at
     `src/assets/fullscreen*.svg` are ~1.3 KB each and the webpack rule
     at [webpack.config.js:74-80](../../webpack.config.js#L74-L80) declares
     `type: 'asset'` for SVGs imported by CSS, so they fall under
     webpack's 8 KB inline threshold and ship as
     `url("data:image/svg+xml;base64,…")` rather than as URLs containing
     filenames. The assertion is therefore **state-distinctness**, not
     basename matching: collect the computed `backgroundImage` value at
     each step and assert all four values are pairwise distinct. This
     proves each state is wired to a different asset without depending on
     filenames or build mode. The "which value corresponds to which
     icon" judgment lives in the 4-up screenshot deliverable (see Asset
     deliverables), not the DOM assertion.

     Steps (each `browser_evaluate` reads
     `getComputedStyle(el).backgroundImage` on
     `[class*="fullscreenIcon"]`):
     - **Default**: record value `bgDefault`.
     - **Hover (enter state)**: `browser_hover('[class*="fullscreenIcon"]')`,
       re-read → `bgHover`.
     - **Exit state**: drive the toggled state via a small test hook
       modeled on the existing `window.test.*` helpers in
       [src/models/stores.ts](../../src/models/stores.ts) — e.g.
       `window.test.setFullscreenIconState(true)` that calls
       `setState({fullscreen: true})` on the `BottomBar` instance. The
       hook is needed because `screenfull.request()` is gated in
       headless browsers, and because the `.fullscreen` modifier class
       is hashed by CSS modules so adding a bare `fullscreen` className
       won't trigger the rule (CSS modules hash both the selector and
       the className together at build time). After the toggle, hover
       elsewhere to clear hover state, then re-read → `bgExit`.
     - **Exit + hover**: with the toggled state still set,
       `browser_hover` the icon again → `bgExitHover`. Restore by
       calling `window.test.setFullscreenIconState(false)`.

     Assert `new Set([bgDefault, bgHover, bgExit, bgExitHover]).size === 4`.
     A regression that drops one variant, mis-wires a state, or points
     two states at the same asset collapses the Set and fails the
     check.

   - **FIS-hidden centering.** Runs at the 1400 × 1000 viewport set in
     the preamble above (the centering calculation only behaves as
     designed when the viewport exceeds the bar's 1044 px content
     width). `browser_navigate("http://localhost:8080/?showBurnIndex=false")`.

     **Load-bearing assertion (always required): pixel symmetry of the
     controls cluster.** Pivot from the leftmost and rightmost visible
     control testids to their widgetGroup ancestors via
     `.closest('[class*="widgetGroup"]')`, then read
     `getBoundingClientRect()` on those widgetGroups plus on the
     `[class*="logo"]` and `[class*="fullscreenIcon"]` elements that
     bound the cluster. FIS is hidden in this layout, so the rightmost
     visible control is `helitack-button`. Compute:
     - `leftGap = terrainWidgetGroupRect.left − logoRect.right`
     - `rightGap = fullscreenIconRect.left − helitackWidgetGroupRect.right`

     Assert `Math.abs(leftGap − rightGap) ≤ 5` for subpixel rounding
     and minor design offsets. The widgetGroup pivot returns the
     cluster's **outer** edges (past borders and any pair-container
     padding), not the inner button rects — same pattern Issue 3 uses
     for outer/non-paired adjacencies. Works for both shared-border
     structural options: under Option 1 (shared Fireline+Helitack
     container), `helitack-button.closest('[class*="widgetGroup"]')`
     resolves to the pair's outer container; under Option 2
     (flattened-inner-border siblings), it resolves to Helitack's own
     widgetGroup, whose right edge equals the pair's right edge since
     Helitack is rightmost in the pair. Either way `.right` is the
     cluster's true right edge. Note: targeting widgetGroup rects
     rather than `mainContainer` matters because a flex-centered
     `mainContainer` typically expands to fill the available width,
     which would zero out the gap math.

     **Supporting evidence (optional).** If the implementer chose
     `justify-content: center` on a single container, also reading
     `getComputedStyle(parent).justifyContent === 'center'` is a useful
     smoke test that points at the mechanism. It does **not** by itself
     prove centering — `justify-content: center` on the wrong parent,
     or on a container with unequal sibling regions, passes the CSS
     read while failing the geometry. The pixel-symmetry assertion
     above is the source of truth.

   - **Visual screenshots for Zeplin comparison.**
     `browser_take_screenshot({ filename: "tmp/playwright/bottom-bar-default.png" })`
     and `tmp/playwright/bottom-bar-fis-hidden.png`; open both alongside the
     Zeplin reference screen and apply the layer-3 eyeball checklist.

3. **Final eyeball pass** against the Zeplin screen, using the Playwright MCP
   screenshots from layer 2:
   - [ ] Outer top-corner radius on each control container is 10 px (not 9).
   - [ ] Reload↔Restart and Fireline↔Helitack render as **paired groups** with
         no inner divider — the inner-facing corners between each pair are flat,
         only the outer top corners are rounded, and no border line appears
         between the two siblings.
   - [ ] The new fullscreen icon glyph appears smaller than today's, inside a
         visibly larger hit-target area.
   - [ ] Hovering Setup / Spark / Fireline / Helitack shows the white outline at
         ~50% opacity; mouse-down on the same buttons brings it to 100%.
   - [ ] Reload / Restart / Start (the pill buttons) still show the same 50% /
         100% halo behavior they did before this ticket — no change there.
   - [ ] Loaded with `?showBurnIndex=false`, the controls cluster is visibly
         centered horizontally in the bottom bar.
   - [ ] The Fire Line button's label text reads "Fireline" (one word).

## Out of Scope

- The Hazbot button itself (its rendering, click behavior, sidebar interaction).
  That ships in AP-80; WM-23 makes the surrounding layout — Fullscreen toggle
  position, FIS width, FIS-hidden cluster centering — correct so AP-80 can
  drop the button in, but adds no placeholder, spacer, or slot for it.
- Any enable/disable behavior change to the seven primary controls. That is fully
  owned by [WM-24](../WM-24-model-controls-states.md) and is preserved.
- Any change to the disabled rendering (grayscale + 0.35 opacity), already shipped in
  WM-24.
- Renaming `fire-line*.svg` asset filenames (kept as-is unless explicitly chosen —
  see Open Questions).
- Changes to the Wildfire-Explorer left-side logo, Wind Meter, Drought controls, or
  any other non-bottom-bar UI.
- Touch / mobile gesture support changes.
- Internationalization or RTL changes.

## Open Questions

### RESOLVED: Should `fire-line*.svg` asset files be renamed to `fireline*.svg`?
**Context**: The user-visible label changes from "Fire Line" → "Fireline" (one word).
The icon assets at [src/assets/bottom-bar/fire-line.svg](../../src/assets/bottom-bar/fire-line.svg)
and its `_highlight` / `_disabled` siblings still use the kebab-case two-word form.
Renaming aligns asset names with the label, but it's a churnier diff (file rename +
import update) for a purely cosmetic change.
**Options considered**:
- A) Rename to `fireline.svg` / `fireline_highlight.svg` / `fireline_disabled.svg` —
  one consistent spelling everywhere
- B) Leave the asset filenames as `fire-line*.svg` — minimize diff
- C) Rename only the import alias / variable names in `bottom-bar.tsx`, leave the
  files

**Decision**: **B** — Leave asset filenames as `fire-line*.svg`. Asset file names
are private to the bundler; the user-visible label and `data-testid` are already
one-word "fireline". The React variable names (`FireLineIcon`,
`FireLineHighlightIcon`) also stay as-is to match the file names.

### RESOLVED: How exact should the Reload/Restart/Start hover halo become?
**Context**: The original concern was whether to replace the existing box-shadow
halo with an explicit Highlight SVG layer to match Zeplin's source-of-truth shape.
**Decision**: **No change to the round buttons.** They already implement the 50% /
100% halo correctly via `box-shadow`. The actual issue the ticket calls out is
narrower: the icon-on-top buttons (Setup, Spark, Fireline, Helitack) currently jump
straight from `opacity: 0` to `opacity: 1` on hover with no 50% intermediate and no
`:active` distinction. The fix is CSS-only in `icon-button.scss`: `:hover` → 0.5,
`:active` → 1.0. "Select" means `:active` pseudo-class only, not a persistent
selected mode — that would need new `selected` plumbing through `IconButton` and is
out of scope.

### RESOLVED: Are any other button labels changing?
**Context**: The Zeplin design surfaced one wording change ("Fire Line" → "Fireline").
Should I assume no other label changes (Setup, Spark, Reload, Restart, Start, Stop,
Helitack remain), or have any other labels also changed in the new design?
**Options considered**:
- A) Only "Fire Line" → "Fireline"; all other labels unchanged
- B) Other labels have changed too (please list)

**Decision**: **A** — Only "Fire Line" → "Fireline". All other labels (Setup, Spark,
Reload, Restart, Start/Stop, Helitack, Fire Intensity Scale) stay as-is.

### RESOLVED: Does the fullscreen icon container change size (50 × 50 → 62 × 64)?
**Context**: Today the fullscreen toggle is rendered as a 50 × 50 div with a
background image. The Zeplin design shows a 42 × 42 icon inside a 62 × 64 hit-target
container — icon visually smaller, hit target larger.
**Options considered**:
- A1) Honor the design literally: 62 × 64 container, 42 × 42 icon (icon shrinks
  ~16%)
- A2) 62 × 64 container, but keep 50 × 50 icon (only hit target grows, icon stays
  same size)
- B) Keep the current 50 × 50 container; only swap the icon assets

**Decision**: **A1** — 62 × 64 container with a 42 × 42 icon. Side-by-side
comparison of the current app and the Zeplin spec confirmed the icon is
deliberately smaller with more whitespace around it in the new design.

### RESOLVED: Centering layout when Fire Intensity Scale is hidden
**Context**: Today, when `config.showBurnIndex === false`, the bottom bar just omits
the FIS widget and the rest of the controls stay left-aligned. The new Zeplin spec
says: "Middle controls are centered; Hazbot is then centered between the controls
and the Fullscreen Toggle button."
**Options considered**:
- A) Ship centering in WM-23 (controls cluster only; Hazbot positioning is AP-80's
  job)
- B) Defer entirely to AP-80
- C) Ship in WM-23 but only for the static (no Hazbot) case; revisit when Hazbot
  lands

**Decision**: **A** — Ship in WM-23. It's explicitly in the story, the
`?showBurnIndex=false` URL param gives a clean way to verify, and at least one
curriculum-facing config exercises the FIS-hidden case. Scope is limited to
centering the existing controls cluster; positioning the Hazbot button between the
controls and the Fullscreen toggle still belongs to AP-80.

### RESOLVED: Visual regression / acceptance criteria
**Context**: This ticket is mostly visual. Jest snapshot tests won't catch hover/
active opacity changes or border-radius pixel shifts. How should we verify?
**Options considered**:
- A) Manual side-by-side comparison against the Zeplin screen, signed off in the PR
- B) Add a Cypress spec that asserts computed-style opacity / width / radius for each
  control in default / hover / active / disabled states
- C) Both — Cypress for the deterministic facts, manual review for the visual
  judgment

**Decision**: **C** — Cypress for static deterministic facts (button widths
including the paired bounding-box, default-state highlight opacity = 0,
"Fireline" label text, fullscreen container dimensions and computed
`background-size`). Playwright MCP for browser-level checks Cypress can't
reliably do (hover/active opacity, FIS-hidden centering, fullscreen-variant
toggling, paired-group inner corner radii, pill-button halos). Manual eyeball
pass against the Zeplin screen for pixel-level visual judgment. Mirrors the
verification pattern used in [WM-24](../WM-24-model-controls-states.md). See
the Acceptance section for the canonical, per-bullet split — this Decision is
a high-level summary and the Acceptance section is the source of truth.

## Self-Review

### Senior Engineer

#### RESOLVED: SCSS variable `$bottomBarBorderRadius` mismatch (9 → 10)
[common.scss](../../src/components/common.scss) defined `$bottomBarBorderRadius: 9px`
where the Zeplin spec wants 10 px. The variable was only consumed by `.widgetGroup`
in `bottom-bar.scss` (lines 52-53), so the change is contained. Added an explicit
Technical Notes / SCSS-variable-updates bullet calling for the 9 → 10 update.

---

#### RESOLVED: Fire Intensity Scale 140 px — outer container or inner bars?
The 140 px in the layout table was ambiguous between "outer Control border width"
and "bars width". Added a footnote to the FIS row clarifying that 140 px is the
outer Control border width and the inner `.barsContainer` / `.labels` stay at 80 px
each, with the extra width absorbed by the surrounding `.widgetGroup` padding and
the "Fire Intensity Scale" label.

---

#### RESOLVED: Widget-group spacing (10 px between non-adjacent groups, 0 between adjacent)
Added a "Margin-override note" under the layout table reminding the implementer
that the `.placeSpark`, `.startStop`, `.helitack` (and any other adjacency)
overrides need to be re-verified once new widths land — specifically to preserve
the 0 px gap between Reload↔Restart and Fireline↔Helitack while keeping 10 px
elsewhere. Did not enumerate every override inline (that's implementation work
derivable from the layout table).

---

### QA Engineer

#### RESOLVED: Cypress `:active` opacity is awkward to assert
**Decision**: Cypress asserts default and hover only. `:active` (1.0 opacity on
mouse held down) is verified manually. Not worth adding `cypress-real-events` as a
dev dependency for a single low-frequency regression target — manual review on the
PR catches it. Updated the Acceptance section to call this out so the implementer
isn't surprised.

---

#### RESOLVED: "FIS-hidden centering" assertion tolerance is unspecified
**Decision**: prefer asserting the computed CSS rule directly
(`justify-content: center` on the centering container) — deterministic and
viewport-independent. Fall back to a ≤ 5 px pixel-symmetry tolerance only if the
implementation uses computed margins / absolute positioning instead of flex
centering. Updated the Acceptance section accordingly.

---

#### RESOLVED: Manual review handoff lacks a checklist
Added a 6-item manual-review checklist to the Acceptance section covering the
specific things to eyeball: corner radii, fullscreen icon scaling, hover/active
halo opacities on the icon-on-top buttons, unchanged pill-button halos, centered
cluster when FIS is hidden, and the "Fireline" label text.

---

### WCAG Accessibility Expert

#### RESOLVED: Hover opacity drops from 1.0 → 0.5 may reduce visibility for low-vision users
Out of scope. wildfire-model project policy is that a11y concerns are not treated
as in-scope for specs or reviews. The 50% hover / 100% active behavior is taken
literally from the Zeplin design without further analysis.

---

#### RESOLVED: Fullscreen icon shrinkage (50→42, ~16% smaller) may reduce recognition
Out of scope. wildfire-model project policy is that a11y concerns are not treated
as in-scope for specs or reviews. The 42 × 42 icon inside a 62 × 64 container is
taken literally from the Zeplin design.

---

#### RESOLVED: Keyboard focus state for the bottom-bar buttons is unaddressed
Out of scope. wildfire-model project policy is that a11y concerns are not treated
as in-scope for specs or reviews. (For the record: the fullscreen toggle is
currently a plain `<div onClick={...}>` with no `tabIndex` and no key handler, so
it's not keyboard-focusable today; the seven control buttons rely on MUI Button's
default `:focus-visible` ring. Not addressed by this ticket.)

---

### Product Manager

#### RESOLVED: AP-80 hand-off — what does WM-23 leave for the Hazbot button?
Added an "AP-80 hand-off" subsection at the end of Technical Notes that
enumerates: (a) what WM-23 delivers as a baseline (all seven control geometries,
hover/active opacity rule, Fireline label, new fullscreen icon + hit target, and
FIS-hidden cluster centering); (b) what AP-80 still needs to add (rendering the
122 × 48 Hazbot button and positioning it in both FIS-visible at ~x=809 and
FIS-hidden between the centered cluster and the Fullscreen toggle).

---

### Education Researcher

#### RESOLVED: "Fireline" wording — has curriculum been notified?
Non-actionable flag, no spec change. The right stakeholders are already on the
WM-23 ticket (Michael Tirenin reporting, Hee-Sun Lee watching) and the project
lead is the spec author. If a curriculum mismatch surfaces it can be addressed
then; not worth blocking the spec on it.

---

## Self-Review (Round 2)

### Senior Engineer

#### RESOLVED: Fireline ↔ Helitack adjacency: "separate borders" vs Zeplin's overlapping outer x-coords
The Layout table called out "Adjacent to Fireline (separate 67 × 75 rounded
borders each)" while Reload ↔ Restart got "a single 122 × 75 rounded outer
border". The Zeplin geometry block also reported `border 67 × 75` per widget,
suggesting two separate borders. A rendered screenshot from Zeplin confirmed the
opposite: Fireline + Helitack are visually paired with a single shared outer
rounded border, same treatment as Reload + Restart (outer top corners rounded,
no divider where they meet).

Updated the Layout table Fireline row to mirror the Reload row treatment
("sharing a single 132 × 75 rounded outer border, only outer top corners
rounded") and reformatted the Zeplin geometry block to use the same `}` bracket
notation Reload + Restart uses.

---

#### RESOLVED: "Reserve the space for Hazbot" overstates what WM-23 actually delivers
Background said WM-23 "reserves the correct space and behavior" for the Hazbot
button and the Layout table row 9 said "Layout must reserve the space and
position it correctly." But the AP-80 hand-off section lists Hazbot rendering
*and* positioning under AP-80, meaning WM-23 ships no placeholder div or
flexbox slot — it just makes the surrounding geometry (fullscreen toggle, FIS
width, FIS-hidden centering) correct so AP-80 can drop the button in.

Reworded Background to "Getting the surrounding layout ready for it... is part
of WM-23's scope" and rewrote the Layout table row 9 to spell out "WM-23 does
not add a placeholder; AP-80 will drop the Hazbot button into the layout WM-23
leaves behind".

---

### QA Engineer

#### RESOLVED: "Disabled regression check" tests behavior owned by WM-24, not WM-23
The Cypress acceptance list included a "Disabled rendering still produces
opacity 0.35 on content + grayscale (WM-24 regression check)" bullet. WM-23
doesn't touch the disabled rule — that lives in [bottom-bar.scss:167-194](../../src/components/bottom-bar.scss#L167-L194)
from WM-24, which already has its own Cypress coverage (recent fix
[b51f83a](https://github.com/concord-consortium/wildfire-model/commit/b51f83a)
specifically targeted that spec). Dropped the bullet — WM-24's spec owns the
regression coverage.

> **Update (Round 6 sweep):** This decision remains accurate for the
> **Cypress** layer (which still does not assert disabled rendering),
> but the Round-1 External Review later re-added disabled-rendering
> checks to the **Playwright** layer as part of fixing a different
> bug (the original entry: "Disabled-hover verification named an
> undefined/wrong target"). The current "Disabled rendering
> (regression check on WM-24 behavior)" bullet in the Acceptance
> section asserts `filter: grayscale(1)` on the button root and
> `opacity: 0.35` on the content span. This is intentional: WM-23
> introduces a Playwright layer that the WM-24 Cypress suite does not
> cover, and the two layers happen to test overlapping disabled-state
> rendering at different layers without conflict. Read this entry as
> scoped to Cypress only; the Playwright Acceptance section is the
> source of truth for what's actually verified today.

---

#### RESOLVED: Centering verification rule is coupled to the implementer's choice of mechanism
The acceptance criterion read like "prefer A (flex centering CSS assertion),
fall back to B (pixel symmetry)" which implied A was mandatory and B was a
last-resort. In practice the spec shouldn't dictate the centering mechanism —
that's an implementation choice — so the dual-form rule is fine as long as
both forms are presented as equally acceptable. Prescribing flex centering on
`.mainContainer` would conflict with its current `space-between` parent layout
and overreaches for a precursor-cleanup spec.

Reworded the acceptance bullet to "Either assertion form is acceptable; the
implementer chooses the mechanism and the test author matches it" with the
two forms as parallel sub-bullets rather than primary + fallback.

---

## Self-Review (Round 3)

### Senior Engineer

#### RESOLVED: "10 px gap" reference (content-edge vs border-edge) is ambiguous
Layout table called for "10 px gap after Setup" etc., but the Zeplin geometry
block measured the gap between content edges (with 1 px borders on each side,
the visible border-to-border gap is 8 px). Different readings produce
different `margin-right` values on `.widgetGroup`. Added one clarifying
sentence under the Layout table locking the measurement reference: "All '10 px
gap' references in the table are measured between **content edges** (i.e.
applied as `margin` on the widget content); the visible gap between adjacent
1 px borders is therefore 8 px."

---

#### RESOLVED: Shared-border treatment implies a structural change, not just CSS values
The Layout section described the shared 122 / 132 outer border for
Reload↔Restart and Fireline↔Helitack without noting that this is a structural
delta from today's per-widget `.widgetGroup` border + radius — an implementer
skimming the section could plausibly assume CSS-only changes. Added a
"Shared-border note" paragraph alongside the existing "Margin-override note"
spelling out that the implementation needs either a per-pair outer container or
sibling widgets with the inner-facing border + radius flattened, without
prescribing which.

---

#### RESOLVED: Spec doesn't say whether `:hover` opacity applies to disabled icon-on-top buttons
The state list in "Hover and Select state opacities" defined Default, Hover,
Select, and Disabled separately but didn't say what happens when a disabled
button is hovered. The natural CSS rule
(`.iconButton:hover .iconButtonHighlightSvg { opacity: 0.5 }`) would visually
respond to hover on a disabled button, which is wrong. Added a fifth bullet
"Disabled + hover/active" specifying that the new `:hover` and `:active` rules
don't apply when the button is disabled, with the
`:not(:disabled):hover` guard pattern as an example.

---

### QA Engineer

#### RESOLVED: Cypress `:hover` assertion mechanism isn't specified (same limitation as `:active`)
The Acceptance section asserted hover-state opacity (0.5) in Cypress but the
same `cy.trigger(...)` limitation that pushed `:active` to manual review also
applies to `:hover` — triggering the JS event doesn't reliably activate the
CSS pseudo-class for `getComputedStyle` reads, especially headless. Updated the
Cypress bullet to keep only the default-state assertion (opacity 0) and moved
both hover (0.5) and `:active` (1.0) to manual review, where the manual
checklist already lists them. Alternative approaches (synthetic test-only
classes, reading rules via `document.styleSheets`) felt heavier than the
limited regression risk.

---

#### RESOLVED: "Standard viewport width" for the pixel-symmetry fallback isn't named
The FIS-hidden centering fallback said "≤ 5 px at standard viewport width" but
didn't name the viewport. Confirmed via [cypress.config.ts:6-7](../../cypress.config.ts#L6-L7)
that the project default is 1400 × 1000, which is wider than the 1044 px bar
(so centering behaves as designed there). Updated the acceptance bullet to
name the viewport and link the config so a future config change is easy to
spot.

---

#### RESOLVED: Acceptance section doesn't verify the shared-border treatment on adjacent pairs
The Cypress acceptance covered individual widths but not the visual treatment
between Reload↔Restart and Fireline↔Helitack (single outer border, no inner
divider, flat inner corners). A regression re-introducing an inner border or
rounding all four corners would pass every existing check. Closes the coverage
gap that mirrors the structural change called out elsewhere in Round 3.
Added one manual-review checklist item explicitly calling out the paired-group
treatment: no inner divider, flat inner corners, only outer top corners
rounded. Did not add a Cypress assertion — asserting "no border line between
siblings" via computed styles is fragile, and manual review is sufficient for
a visual regression of this size.

---

## Self-Review (Round 4)

### Senior Engineer

#### RESOLVED: `:not(:disabled)` guard is overstated and uses the wrong selector for this codebase
The "Hover and Select state opacities" section says: "The CSS needs an
explicit guard, e.g. `.iconButton:not(:disabled):hover .iconButtonHighlightSvg
{ opacity: 0.5 }`." Two issues:

1. The guard is *presented as required*, but MUI Button with `disabled={true}`
   gets `pointer-events: none` by default (standard MUI v5 behavior), which
   prevents `:hover` from firing on disabled buttons in the first place. The
   guard is defensive belt-and-suspenders, not strictly necessary. The current
   wording could mislead a reviewer into thinking today's code is broken even
   without the guard.

2. The selector `:not(:disabled)` mixes mechanisms. Per the existing comment
   in [icon-button.scss:34-43](../../src/components/icon-button.scss#L34-L43),
   this file keys off the project's `.disabled` className (added
   conditionally at [icon-button.tsx:17](../../src/components/icon-button.tsx#L17)),
   not the HTML `:disabled` attribute. The MUI Button does *also* set the
   HTML attribute (so `:not(:disabled)` happens to match), but for consistency
   with the rest of the file, `:not(.disabled)` is more idiomatic and survives
   if the `.disabled` className strategy ever decouples from the HTML
   attribute (which the existing comment flags as a possible future change).

Suggested resolution: reword to "Defensive guard recommended (MUI's
`pointer-events: none` on disabled buttons usually prevents `:hover` from
firing, but the guard makes the intent explicit)" and use
`.iconButton:not(.disabled):hover` to match the existing file convention.

---

#### RESOLVED: Layout-table widths and verification widths use different references
The Layout table column "Width (px)" lists content widths: Setup 82, Spark 60,
Reload+Restart 60+60, etc. The Zeplin geometry block uses border widths (1 px
border on each side): Setup 84, Spark 62, etc. The Cypress and Playwright
verification text says "Compare against the Layout table: Setup 84, Spark 62,
Reload+Restart 122 shared, Start 62, Fireline+Helitack 132 shared, FIS 142."
But the Layout table doesn't show 84 or 62 — it shows 82 and 60. The reader
has to mentally add 2 px for the borders. Anyone writing the verification
test will be reading the Layout table, not the Zeplin geometry block.

Suggested resolution: either (a) add a Border-width column to the Layout
table so the verification references match what the reader sees, or (b)
change the verification text to "Compare against the Zeplin geometry block
(border widths): Setup 84, Spark 62, ..." so the reader knows which table to
read. Option (a) is more direct.

---

### QA Engineer

#### RESOLVED: Cypress acceptance doesn't specify the mechanism for asserting the 42 × 42 icon
The Cypress acceptance bullet says: "The fullscreen container is 62 × 64 with
the icon rendered at 42 × 42." Asserting the container is straightforward
(`cy.get('.fullscreenIcon').should('have.css', 'width', '62px')` and
`'height', '64px'`). But the icon is a CSS `background-image` — there is no
DOM element at 42 × 42. The Playwright section correctly uses
`getComputedStyle(...).backgroundSize === '42px 42px'`, but the Cypress
section doesn't say how to assert the inner size, so an implementer could
reasonably skip it.

Suggested resolution: change the Cypress bullet to "The fullscreen container
is 62 × 64 (width/height) with `background-size: 42px 42px` (the icon
rendered at 42 × 42)" so the assertion mechanism is unambiguous.

---

#### RESOLVED: Acceptance doesn't verify the exit-fullscreen or hover-dark icon variants
The spec says "Swap in the updated fullscreen SVG icons (enter and exit
states, hover variants)" — four assets total
(`fullscreen.svg`, `fullscreen-dark.svg`, `fullscreen-exit.svg`,
`fullscreen-exit-dark.svg`). The Cypress and Playwright acceptance only
verify the default (enter, non-hover) state. A regression where one of the
other three assets is missing, malformed, or wired to the wrong selector
would pass every existing check.

Suggested resolution: add one acceptance bullet that toggles fullscreen and
re-reads the background-image URL to confirm the exit asset is wired up.
Hover-dark variants can stay manual (the eyeball checklist already calls out
icon appearance broadly). A pure unit-level check that all four asset paths
resolve is too much for the regression risk.

---

#### RESOLVED: Pill-button halos (Reload/Restart/Start) are only eyeballed
The acceptance treats the pill buttons' existing 50% / 100% `box-shadow` halo
as a preserved-behavior claim and verifies it only in the eyeball checklist.
A regression where the box-shadow vanishes or changes alpha would pass every
automated check. Playwright can read
`getComputedStyle(svgInside).boxShadow` after a `browser_hover` and assert
the value contains 50% alpha — deterministic for the hover side. `:active`
keeps its synthetic-mousedown caveat. Added a "Pill-button halos" bullet in
the Playwright section.

---

#### RESOLVED: Paired-group inner corner radii rely on eyeball verification alone
The eyeball checklist asserts that Reload↔Restart and Fireline↔Helitack have
flat inner corners and only outer corners rounded, but the rendered
`border-top-*-radius` values are deterministic and can be asserted via
`browser_evaluate`. Added a "Paired-group inner corner radii" bullet in the
Playwright section that asserts outer-left/right corners are 10 px and all
other top corners inside the pair are 0 px. The "no border line between
siblings" half stays eyeball — asserting absence of a border via computed
styles is fragile and implementation-dependent.

---

### Frontend Engineer

#### RESOLVED: Shared-border implementation choice interacts with existing margin-collapse overrides
The "Margin-override note" and "Shared-border note" are presented as related
but the connection isn't drawn. Today
[bottom-bar.scss:87-92](../../src/components/bottom-bar.scss#L87-L92) collapses
the gap between Restart→Start and Helitack with negative margins
(`.startStop { margin-left: -$bottomBarWidgetGroupSpacing }`,
`.helitack { margin-left: -$bottomBarWidgetGroupSpacing }`). If the
shared-border implementation merges Reload+Restart into a single `widgetGroup`
(structural option 1 in the Shared-border note), the *left neighbor* of
`.startStop` becomes the combined Reload+Restart container — a different DOM
node with potentially different margin behavior — and the existing
negative-margin override may produce a wrong offset or stop working entirely.
The same applies to the Fireline+Helitack pair if Fireline absorbs Helitack
into one container: `.helitack`'s `margin-left` override becomes moot because
there's no longer a separate Helitack widgetGroup to offset.

Suggested resolution: add one sentence under the Shared-border note that the
chosen mechanism (single outer container per pair vs. siblings with
flattened inner border) changes which `.placeSpark`/`.startStop`/`.helitack`
margin overrides survive, and the implementer needs to recompute the gaps
to preserve the 10 px content-edge spacing called out in the Margin-override
note.

---

## External Review

External review of the in-development spec (2026-05-27) raised five issues
in the Acceptance section. All five resolved below.

### RESOLVED: Acceptance selectors used raw CSS-module class names
Reviewer flagged that several Cypress/Playwright steps referenced
`.fullscreenIcon`, `.fullscreen`, and `.iconButtonHighlightSvg` as bare CSS
selectors. CSS modules in this repo are configured at
[webpack.config.js:44-45](../../webpack.config.js#L44-L45) with
`localIdentName: '[name]--[local]--__wildfire-v1__'`, so the rendered DOM
shows hashed names like `bottom-bar--fullscreenIcon--__wildfire-v1__`.
Tests using bare `.fullscreenIcon` would not match anything.

Fix: added a "CSS-module selectors" preamble at the top of the Acceptance
section explaining the hashing and locking the selector convention to
`[class*="name"]` attribute-substring form. Replaced the bare-class
references inside the Acceptance steps (Cypress
`.iconButtonHighlightSvg`, Playwright `.fullscreenIcon`, the
`mainContainer`/`logo`/`fullscreenIcon` rect lookups in FIS-hidden
centering). Left `data-testid` selectors unchanged — those survive CSS
modules.

---

### RESOLVED: Shared-pair width assertions conflicted with allowed implementation choices
The Shared-border note allows two structural options for Reload↔Restart
and Fireline↔Helitack: a single outer container per pair, or two
sibling widgets with flattened inner borders. The Cypress and Playwright
width-verification steps assumed option 1 — they read
`getBoundingClientRect().width` on one `widgetGroup` and asserted 122 /
132. Option 2 would yield two widgetGroups whose widths sum to 122 / 132
and would fail the single-widgetGroup assertion even though the rendered
visual is identical.

Fix: rewrote both verification bullets to compute the pair's
**bounding-box width** —
`Math.max(a.right, b.right) − Math.min(a.left, b.left)` over the two
paired widgetGroups' rects. The rule returns 122 / 132 for both
structural options. Also added one sentence under the Shared-border note
linking to the bounding-box rule so the implementer sees the connection
when choosing a structural option.

---

### RESOLVED: Hazbot scope wording was internally contradictory
Background and Layout-table row 9 said "WM-23 does not add a placeholder;
AP-80 will drop the Hazbot button into the layout WM-23 leaves behind"
(Round-2 Senior Engineer self-review rewrote them for exactly this
reason). But the Out of Scope bullet still read "ships in AP-80; WM-23
only reserves layout space" — "reserves layout space" implies a slot or
spacer that the rest of the spec rejects.

Fix: rewrote the Out of Scope bullet to "WM-23 makes the surrounding
layout — Fullscreen toggle position, FIS width, FIS-hidden cluster
centering — correct so AP-80 can drop the button in, but adds no
placeholder, spacer, or slot for it." Matches the Background and
Layout-table-row-9 wording.

---

### RESOLVED: Fullscreen-variant URL assertion used a fragile `endsWith` check
The acceptance step asserted that each variant's `backgroundImage` value
"ends with" the expected filename (e.g. `.endsWith("fullscreen-exit.svg")`).
Browsers return `backgroundImage` as `url("…/bundler-prefix/asset.svg")`
with surrounding quotes — so `endsWith` against a bare filename always
fails. Bundling can also rewrite paths or add cache-busting query strings.

Fix: rewrote the assertion to extract the basename via
`bg.match(/([^/"']+)\.svg/)[1] + ".svg"` and compare to the expected
filename. The same rewrite covered all four variants
(`fullscreen.svg`, `fullscreen-dark.svg`, `fullscreen-exit.svg`,
`fullscreen-exit-dark.svg`). Folded into the same paragraph rewrite as
the CSS-module selector fix.

---

### RESOLVED: Disabled-hover verification named an undefined/wrong target
The "Disabled + hover" acceptance step read
`getComputedStyle(content).filter` to verify the disabled rendering, but:
(a) `content` was never defined as a selector elsewhere in the spec, and
(b) the
[icon-button.scss:34-70](../../src/components/icon-button.scss#L34-L70)
rule splits across three targets — `filter: grayscale(1)` on the
`.iconButton.disabled` root, `opacity: 0.35` on the
`.iconButton.disabled > span` content wrapper, and `opacity` on the
inner highlight SVG. Reading any one of them tells you only part of the
disabled story.

Fix: rewrote the bullet to name three distinct targets with three
distinct assertions — button root → `filter: grayscale(1)`,
content span → `opacity: 0.35`, highlight SVG → `opacity: 0` after a
disabled-state hover. The third assertion is the actual point of the
"+ hover" step (verifying the `:not(.disabled):hover` guard is wired);
the first two are regression checks on the disabled rule that survived
unchanged from WM-24.

---

### Test affordance added by these fixes

The Issue 1 / Issue 4 fix introduces one new test affordance: a small
`window.test.setFullscreenIconState(boolean)` helper modeled on the
existing `window.test.*` helpers in
[src/models/stores.ts](../../src/models/stores.ts), needed because (a)
`screenfull.request()` is gated in headless browsers and (b) the
`fullscreen` modifier class is hashed by CSS modules so adding a bare
className won't trigger the toggled-state rule. The hook should flip the
`BottomBar` instance's `state.fullscreen`. Implementation mechanism (ref
to the React instance, moving the state to a MobX store, etc.) is left
to the implementer.

---

## External Review (Round 2)

External review (2026-05-27, second pass) raised five issues. All five
resolved below.

### RESOLVED: Cypress path was stale (`cypress/integration/` → `cypress/e2e/`)

Spec listed `cypress/integration/` and `bottom-bar.test.ts` under Files in
Scope. Neither exists in the repo. The actual layout is `cypress/e2e/`
with a single relevant spec `cypress/e2e/bottom-bar-state-machine.cy.ts`
(the WM-24 state-machine spec).

Fix: replaced the stale bullet with a direct link to
`cypress/e2e/bottom-bar-state-machine.cy.ts`, clarifying that this is
where the "Fire Line" label string and fullscreen-icon background-image
references need updating when the label and SVG files change.

---

### RESOLVED: Required fullscreen test hook was not listed in scope

The Playwright "Fullscreen icon variants" acceptance step requires a new
`window.test.setFullscreenIconState(boolean)` helper to drive the
toggled-state rendering (needed because `screenfull.request()` is gated
in headless browsers and the `fullscreen` modifier class is hashed by
CSS modules). The helper is described in the Acceptance section and the
"Test affordance added by these fixes" addendum, but the Files in Scope
section didn't admit the new app surface area — an implementer reading
only that section could miss the hook entirely and find the Playwright
check unrunnable.

Fix: added a `src/models/stores.ts` bullet to Files in Scope spelling
out the new `window.test.setFullscreenIconState(boolean)` affordance
(test-only, no production caller, mechanism left to the implementer).
Amended the existing `src/components/bottom-bar.tsx` bullet to note
that this file also wires whatever mechanism the hook needs (instance
ref, MobX store accessor, etc.). Both bullets reuse the
existing-`window.test.*`-convention framing so the affordance is
explicitly modeled after established practice (see [CLAUDE.md] for
prior helpers like `placeSparkInZone`).

---

### RESOLVED: Fullscreen asset requirement depended on private external access

The fullscreen-icons section said "Download the new icon and exit-icon
SVGs ... from the Zeplin screen and replace the existing files" without
locking in the deliverable: which filenames, what PR evidence proves the
asset is correct. Anyone without Zeplin/Jira access (most LLM reviewers
and external collaborators) couldn't verify the spec was implemented
correctly from the spec text alone.

Fix: added an "Asset deliverables" subsection nailing down three points:
(a) the four existing filenames are overwritten in place
(`src/assets/fullscreen.svg`, `fullscreen-dark.svg`, `fullscreen-exit.svg`,
`fullscreen-exit-dark.svg`) — no new files, no renames; (b) PR description
records the date pulled from Zeplin for traceability; (c) PR includes a
4-up screenshot (`tmp/playwright/`) of the new icons in all four states
(default, default+hover, exit, exit+hover) so asset correctness is
reviewable from the PR alone. The Zeplin URL stays in the spec header
as the source of truth for the bytes themselves — they belong in
`src/assets/`, not in the spec folder, so the implementer pulls them as
part of the implementation phase.

---

### RESOLVED: Verification strategy was internally inconsistent

Three contradictory statements about which layer covers what:
(a) the verification preamble described Playwright as covering hover/active
**and FIS-hidden**, but FIS-hidden also appeared as a Cypress bullet;
(b) the Cypress FIS-hidden bullet duplicated the Playwright FIS-hidden
bullet; (c) the RESOLVED Open Question "Visual regression / acceptance
criteria" Decision text still listed Cypress as covering "hover/active
opacity ... disabled-state regression check" — both of which had been
moved/dropped by Round-3 QA (hover/active out of Cypress, fragile under
`cy.trigger`) and Round-2 QA (disabled regression owned by WM-24, not
WM-23).

Fix: (1) removed "FIS-hidden" from the Playwright purpose statement in
the preamble so it reads "for hover/active and other browser-level
checks Cypress can't reliably do"; (2) deleted the duplicate
Cypress FIS-hidden bullet (Playwright owns it as the single source of
truth); (3) rewrote the RESOLVED-OQ Decision text to enumerate the
current Cypress / Playwright / manual split and explicitly defer to the
Acceptance section as the source of truth.

---

### RESOLVED: Gap requirements conflicted with the geometry block

Layout table said "10 px gap after Spark" and "10 px gap after Restart"
but the Zeplin-geometry block placed Reload at x=152 (adjacent to Spark
ending at 152) and Start at x=272 (adjacent to Restart ending at 272).
Under the content-edge gap rule, both can't be true.

Confirmed the Layout table description against a Zeplin screenshot of
both "with FIS" and "without FIS" layouts: there is a visible 10 px gap
between Spark→Reload and between Restart→Start, the same size as
Setup→Spark and Start→Fireline. The original geometry-block
x-coordinates were the bug.

Fix: shifted Reload onwards by +10, Start onwards by +20, Fireline /
Helitack / FIS by +20 in the geometry block; added "10 px gap from X"
annotations on each affected row. Hazbot's x=809 left as-is and tagged
"AP-80 owns exact position" since Hazbot positioning is AP-80's call
(the AP-80 hand-off section already says "roughly x=809").

---

## External Review (Round 3)

External review (2026-05-27, third pass) raised four issues. Resolutions
below.

### RESOLVED: Fullscreen-variant URL assertion fails under webpack asset inlining

Round-1 External Review fixed an `endsWith` problem on the
fullscreen-variant URL match by switching to a basename-extraction
regex (`bg.match(/([^/"']+)\.svg/)[1] + ".svg"`). Round 3 caught that
the underlying premise was wrong: the four `src/assets/fullscreen*.svg`
files are ~1.3 KB each, and the webpack rule at
[webpack.config.js:74-80](../../webpack.config.js#L74-L80) declares
`type: 'asset'` for SVGs imported by CSS. Webpack's default 8 KB
inline threshold means these SVGs ship as
`url("data:image/svg+xml;base64,…")` — no `.svg` substring, basename
regex returns null, the assertion crashes.

Options considered: (A) state-distinctness assertion comparing the
four computed `backgroundImage` values pairwise, (B) force
`asset/resource` on these specific files via a new webpack rule
branch, (C) drop the DOM assertion in favor of the 4-up screenshot
deliverable, (D) substring-match a stable SVG fingerprint.

Fix: chose (A). Rewrote the acceptance step to record each variant's
`backgroundImage` value (`bgDefault`, `bgHover`, `bgExit`,
`bgExitHover`) and assert `new Set([...]).size === 4`. Survives both
data-URI and file-URL builds, doesn't tie the test to bytes this PR is
itself changing, and the "which value is which icon" judgment lives in
the existing 4-up screenshot under Asset deliverables. (B) was rejected
as overreach for a single test, (C) as a loss of regression coverage,
(D) as fragile against re-export of the very SVGs the ticket replaces.

---

### RESOLVED: Disabled-hover check was a false positive on the `:not(.disabled)` guard

Round 1 External Review (issue "Disabled-hover verification named an
undefined/wrong target") rewrote the disabled-hover bullet to read
three targets — root `filter`, content span `opacity`, highlight SVG
`opacity` after `browser_hover`. Round 3 caught that the third
assertion (highlight opacity stays at `0` after hovering a disabled
button) can't actually prove its target: MUI v5 sets
`pointer-events: none` on disabled buttons, so `:hover` never fires
regardless of whether the `:not(.disabled):hover` guard exists in CSS.
The check passes for a broken-guard build just as readily as a
correct-guard build — false positive.

Options considered: (A) inspect the compiled CSS rule via
`document.styleSheets` to prove the guard exists in stylesheet text,
(B) force `pointer-events: auto` on the disabled button mid-test so
`:hover` engages, then verify the highlight stays at `0`, (C) drop
the third assertion and rely on PR review to catch a missing guard
token in `icon-button.scss`.

Fix: chose (A). Split the original three-target bullet into two:
a "Disabled rendering" regression check (root `filter`, content span
`opacity` — both still meaningful WM-24 regression checks) and a
new "`:not(.disabled):hover` guard wired in compiled CSS" check that
walks `document.styleSheets`, finds the rule whose `selectorText`
contains `iconButton`, `:not(`, `disabled`, `:hover`, and
`iconButtonHighlightSvg`, then asserts `style.opacity === "0.5"`.
Substring matches survive CSS-modules hashing because the class names
are embedded in the selector text. (B) was rejected for mutating
production-like DOM mid-test; (C) for losing automated regression
coverage on the guard.

---

### RESOLVED: FIS-hidden centering bullet omitted the viewport the prior self-review said it named

Round-3 self-review (entry "Standard viewport width for the
pixel-symmetry fallback isn't named") said the FIS-hidden centering
acceptance bullet was updated to name the 1400 × 1000 viewport and
link [cypress.config.ts](../../cypress.config.ts). The bullet was not
actually updated — neither the viewport reference nor the config link
made it into the acceptance text. Compounding the gap: this acceptance
step lives under the Playwright MCP layer, whose default viewport
differs from Cypress's, so naming Cypress's viewport in prose isn't
enough on its own — the test has to actually set the viewport.

Options considered: (A) add the viewport reference and config link as
the prior self-review claimed, (B) make the bullet self-sufficient by
calling `browser_resize({ width: 1400, height: 1000 })` first so the
test is deterministic regardless of MCP defaults.

Fix: chose (B). Prepended the bullet with a `browser_resize` call
matching the Cypress default (linked to
[cypress.config.ts:6-7](../../cypress.config.ts#L6-L7) for the "why
1400 × 1000" provenance), then noted that the pixel-symmetry tolerance
applies at that viewport. The flex-centering form stays as the
deterministic primary check; the pixel-symmetry fallback is now
reproducible across MCP and Cypress runs.

---

### RESOLVED: Files-in-Scope misdescribed the existing Cypress state-machine spec

Round-2 External Review (entry "Cypress path was stale") corrected the
Cypress path from `cypress/integration/` to `cypress/e2e/` and pointed
the bullet at
[cypress/e2e/bottom-bar-state-machine.cy.ts](../../cypress/e2e/bottom-bar-state-machine.cy.ts),
with prose claiming the file "references the `Fire Line` label and (in
some assertions) the fullscreen icon background image" needing updates.
Round 3 verified against the actual file contents: the testid is
already `fireline-button` (one word, no `"Fire Line"` string lookups
anywhere), and there are zero `background-image` or fullscreen-icon
assertions in the file at all. `"Fire Line"` appears only in `it(...)`
test description strings and inline comments. An implementer reading
the bullet would either look for assertions that don't exist or assume
WM-23 has no other Cypress work — both wrong: WM-23 introduces a
batch of *new* deterministic assertions (widget widths, paired
bounding boxes, default highlight opacity, "Fireline" label text,
fullscreen container dimensions and computed `background-size`)
enumerated in the Acceptance section.

Options considered: (A) replace the bullet with one that names a new
Cypress spec owning the new assertions (suggested filename, not
mandatory) and demote the state-machine spec to "no required changes,
optional cosmetic rename of description strings," (B) delete the
state-machine bullet entirely and rely on the Acceptance section as
the single source of truth for Cypress work.

Fix: chose (A). Replaced the state-machine bullet with two entries:
a "New Cypress spec" entry naming a suggested filename
(`cypress/e2e/bottom-bar-visuals.cy.ts`) that owns the new assertions
and pointing back to the Acceptance section as the canonical list, and
an updated state-machine entry explicitly marked "No assertion changes
required by WM-23" with the optional description-string rename called
out separately. Implementer can consolidate into one file if they
prefer — the split is not load-bearing.

---

## External Review (Round 4)

External review (2026-05-27, fourth pass) raised four issues. All four
resolved below.

### RESOLVED: Inter-widget gap requirements weren't covered by deterministic acceptance checks

Reviewer (MEDIUM): the Layout table defines 10 px content-edge gaps
between widgets, but Cypress/Playwright only asserted widget widths
and paired bounding-box widths. An implementation could ship correct
widths with wrong margins (e.g. the old `$bottomBarWidgetGroupSpacing`
value, zero gap, or a 20 px gap) and pass every existing check. The
Margin-override note even flags `.placeSpark`/`.startStop`/`.helitack`
overrides as needing re-verification, but no automated check
exercised them.

Fix: added an "Inter-widget gaps" bullet to both the Cypress and
Playwright MCP layers. Asserts the horizontal gap from each
widget's right edge to its right-hand neighbor's left edge
(`nextRect.left − prevRect.right`): **8 px** for non-paired
adjacencies (Setup→Spark, Spark→Reload, Restart→Start,
Start→Fireline, Helitack→FIS) and **0 px** for within-pair
adjacencies (Reload→Restart, Fireline→Helitack), ±1 px for subpixel
rounding. The 8 px expected value follows from the spec's own
arithmetic — 10 px content-edge gap minus 1 px border on each
adjacent widget. The rect-based formulation is implementation-
agnostic, passing for both shared-border structural options. Also
amended the Margin-override note to point forward to the new
acceptance bullet so the connection is visible from both directions.

---

### RESOLVED: Fullscreen `background-size: 42px 42px` left tiling and positioning unspecified

Reviewer (MEDIUM): the spec required `background-size: 42px 42px`
inside a 62 × 64 container, but did not require
`background-repeat: no-repeat` or a `background-position`. CSS
backgrounds repeat by default, so shrinking the SVG from `100%` to
fixed 42 × 42 leaves 20 × 22 px of slack where partial repeated
icons would render. Position was also unconstrained — without
explicit centering, the icon would render in the top-left of the
hit target, not visually centered.

Fix: extended the Fullscreen-icons spec section to require
`background-repeat: no-repeat` and `background-position: center`,
with a short rationale (the slack math) inline. Extended the
Cypress and Playwright acceptance bullets to assert both values on
`[class*="fullscreenIcon"]`: `backgroundRepeat === 'no-repeat'`
and `backgroundPosition === '50% 50%'` (the browser-canonical form
of `center`).

---

### RESOLVED: PR screenshot deliverable named a gitignored path

Reviewer (LOW): the Asset deliverables section said the PR
"includes a 4-up preview screenshot saved to `tmp/playwright/` per
the project convention," but `.gitignore` ignores `tmp/`. The text
was self-contradictory — `tmp/playwright/` is explicitly the
project's convention for **disposable** screenshot artifacts per
[CLAUDE.md](../../CLAUDE.md). Reviewers could expect a committed
artifact that wouldn't appear, or the implementer could try to
force-add it against the convention.

Options considered: (A) attach to PR description/comment via
GitHub's native drag-and-drop image upload, (B) force-add despite
`.gitignore`, (C) establish a new tracked `review-artifacts/`
path.

Fix: chose (A). Rewrote the PR-evidence bullet to: generate the
4-up screenshot under `tmp/playwright/` per the project's
Playwright convention (local workflow, not committed), then
**attach it to the PR description or a PR comment** (drag-and-drop
into GitHub's editor; GitHub renders inline at a
`user-images.githubusercontent.com` URL). (B) was rejected as a
code smell bypassing an intentional project convention; (C) as
over-engineering for a single PR.

---

### RESOLVED: FIS-hidden centering check could pass without proving the geometry

Reviewer (MEDIUM): the acceptance bullet read "If centered via
flex, assert `justifyContent === 'center'`. Otherwise compute pixel
symmetry." `justify-content: center` on **any** parent satisfies the
check, even on the wrong container or with unequal sibling regions
(today's layout has `logo` left of `mainContainer` and
`fullscreenIcon` right of it — a flex-centered `mainContainer`
centers controls *within itself*, not within the bar). The CSS read
alone doesn't prove the cluster is geometrically centered.

Compounding issue: the existing pixel-symmetry text measured
`mainContainer.left − logo.right` and
`fullscreenIcon.left − mainContainer.right`. If the implementer
centers via flex on `mainContainer`'s parent, `mainContainer`
expands to fill the available width and those gaps collapse to ~0,
so the same measurement that's supposed to be the load-bearing
proof would also stop measuring anything.

Fix: rewrote the bullet so the rect-based symmetry check is
**always the load-bearing assertion**, never a fallback. Changed
the targets from `mainContainer` to the leftmost and rightmost
visible controls (`[data-testid="terrain-button"]` and
`[data-testid="helitack-button"]` — FIS is hidden in this
layout), so the measurement reflects the actual cluster geometry
regardless of which centering mechanism the implementer chose.
Demoted the `justify-content: center` read to "supporting
evidence" with explicit text that it does not by itself prove
centering. Kept the ±5 px tolerance and the 1400 × 1000 viewport
preamble. This closes a Round-2 self-review overcorrection that
made the rect check optional in pursuit of mechanism-neutrality —
the rewrite preserves mechanism-neutrality while making the
geometry check unconditional.

---

## External Review (Round 5)

External review (2026-05-27, fifth pass) raised seven issues, all in
the Acceptance section. Resolutions below.

### RESOLVED: Icon-on-top hover check targeted disabled buttons

Reviewer: the "Hover and active opacity (icon-on-top buttons)" bullet
iterated `terrain-button`, `spark-button`, `fireline-button`,
`helitack-button` and called `browser_hover` on each from the
just-loaded page. Under the WM-24 state machine
([../WM-24-model-controls-states.md](../WM-24-model-controls-states.md)),
Fireline and Helitack are disabled in **Default** (they only enable
during **Running / Paused** when authored, cooldown elapsed, and
`ui.interaction` is null). MUI v5's `pointer-events: none` on disabled
buttons suppresses `:hover`, so the assertion would fail without
exercising the actual hover rule.

Fix: rewrote the bullet to spell out the per-button enable
preconditions. Setup and Spark enable in Default (just navigate);
Fireline and Helitack enable after `window.test.placeSparkInZone(0)`
plus a click on `[data-testid="start-button"]` to enter Running.
Added a "hover before clicking the tool" note because clicking
Fireline / Helitack flips `ui.interaction` and disables the same
button mid-test. Reused the existing `window.test.placeSparkInZone`
helper documented in [CLAUDE.md](../../CLAUDE.md) rather than
inventing a new affordance.

---

### RESOLVED: Pill-button halo check also targeted disabled buttons

Reviewer: the "Pill-button halos (Reload, Restart, Start)" bullet
iterated `reload-button`, `restart-button`, `start-button` and called
`browser_hover` on each from the just-loaded page. WM-24's Default
state lists all three as disabled (line 29 of the WM-24 spec). Same
`pointer-events: none` issue as the icon-on-top case: the assertion
would never exercise the box-shadow halo.

Fix: rewrote the bullet to spell out enable preconditions per
button. Reload and Start enable in **Spark-Placed** (Reload via
`setupChanged || sparks.length > 0`; Start via at least one placed
spark) reached with `window.test.placeSparkInZone(0)`. Restart
enables only after Start has been pressed, so the sequence hovers
Reload and Start first, then clicks Start to enter Running, then
hovers Restart. Used the same enable-state framing as the Issue 1
fix so both bullets read consistently.

---

### RESOLVED: Inter-widget gap math broke under one allowed shared-border option

Reviewer: the inter-widget gap bullets (Cypress and Playwright) said
to compute every gap via `.closest('[class*="widgetGroup"]')` on each
control's `data-testid`. The Shared-border note explicitly allows
two structural implementations for Reload+Restart and
Fireline+Helitack: (1) a single outer container per pair, or (2)
sibling widgets with the inner-facing border flattened. Under
Option 1, both buttons in a pair climb to the **same** widgetGroup
container, so `nextRect.left − prevRect.right` for within-pair
adjacencies (Reload→Restart, Fireline→Helitack) degenerates to
comparing a rect to itself, returning 0-or-negative noise instead of
the spec's intended 0 px gap.

Options considered: (A) use the inner button rects (not their
widgetGroup ancestors) for within-pair adjacencies, keep
closest-widgetGroup for non-paired adjacencies; (B) require Option 1
or Option 2 explicitly so the rect source is unambiguous; (C) special-
case same-container pairs by detecting whether both buttons resolve
to the same ancestor and switching strategies at runtime.

Fix: chose (A). Rewrote both the Cypress and Playwright bullets to
split the rule cleanly: non-paired adjacencies use the closest
widgetGroup rect (correct under both options because each pair has a
1 px outer border regardless); within-pair adjacencies use the
**inner button rects** directly (correct under both options because
the buttons are always distinct DOM nodes that visually abut). The
button-rect formulation returns 0 for both shared-border options
without leaking the implementation choice into the test. (B)
rejected as overreach (the Layout section is deliberately mechanism-
neutral); (C) rejected as runtime branching that hides the
structural distinction the spec wants to stay agnostic to.

---

### RESOLVED: Fire Intensity Scale had no testid for the width and gap assertions

Reviewer: the Cypress width-assertion bullet (Setup 84, Spark 62,
Start 62, **FIS 142**) and the Playwright Default-layout testid list
both required FIS rect lookups, but FIS exposes no `data-testid`
today. The selection pattern documented for every other control
(`[data-testid="..."]` then `.closest('[class*="widgetGroup"]')`)
couldn't be applied to FIS without a stable selector.

Options considered: (A) add `data-testid="fire-intensity-scale"` to
the root div of `fire-intensity-scale.tsx`; (B) use a class-substring
selector (`[class*="fireIntensityScale"]`); (C) add the testid to
the outer widgetGroup wrapper in `bottom-bar.tsx`.

Fix: chose (A). Added an
`src/components/fire-intensity-scale.tsx` bullet to Files in Scope
specifying the new `data-testid="fire-intensity-scale"` on the
root `<div>` (one-line production change), with rationale tying it
to the existing testid convention used by the seven control
buttons. Updated the Cypress width-assertion bullet and the
Playwright Default-layout testid list to include
`fire-intensity-scale`. The inter-widget gap bullets pick up the
new testid automatically because they already use the pivot-from-
testid pattern. (B) rejected as inconsistent with the convention
used by every other control; (C) rejected because the testid
belongs on the component, not on a markup wrapper that could move.

---

### RESOLVED: FIS width prose ("140 px is the outer Control container width") contradicted the table semantics

Reviewer: the FIS row note said *"140 px is the outer Control
container width"*, but the table's column headers define **Width**
as content width and **Border w.** as rendered outer width (content
plus 2 px border). For FIS the table lists Width=140 and
Border w.=142, so calling 140 the "outer" width contradicted the
column the table itself defines as outer.

Fix: rephrased the parenthetical in terms the table's own column
definitions use. The note now says *"140 px is the content width of
the FIS Control container (the 'Width' column semantics, same as
every other row)"* and explicitly cross-references the 142 px Border
w. value as what `getBoundingClientRect().width` returns and what
the Acceptance section asserts. Disambiguation against the inner
`.barsContainer` / `.labels` (80 px each) preserved.

---

### RESOLVED: Compiled-CSS guard check would pass `.iconButton:not(:disabled):hover` despite the prose requiring `.iconButton:not(.disabled):hover`

Reviewer: the prose at [requirements.md:146-153](#hover-and-select-state-opacities)
specifically requires `.iconButton:not(.disabled):hover` to match the
project's `.disabled` className convention (set conditionally at
[icon-button.tsx:17](../../src/components/icon-button.tsx#L17) and
keyed off at [icon-button.scss:34](../../src/components/icon-button.scss#L34)).
The compiled-CSS check only required the substrings `:not(`,
`disabled`, and `:hover` together. The substring `disabled` matches
both `.disabled` (class form, hashed by CSS-modules to
`--disabled--`) and `:disabled` (HTML pseudo-class). A build using
`:not(:disabled)` would pass the check despite contradicting the
prose's stated convention.

Fix: tightened the rule predicate to require the substring
`--disabled--` (which only appears in the CSS-modules-hashed
`.disabled` class form per the `localIdentName` configured at
[webpack.config.js:44-45](../../webpack.config.js#L44-L45)) and to
explicitly reject `:not(:disabled)`. Both predicates added to the
existing `.find()` call with a comment explaining the distinction.

---

### RESOLVED: `:active` disabled guard was specified but not verified

Reviewer: the prose at [requirements.md:146-147](#hover-and-select-state-opacities)
requires that **both** the `:hover` and `:active` rules must not
apply to disabled buttons. The compiled-CSS check only found the
`:hover`-guarded rule; the parallel `:active`-guarded rule
(`.iconButton:not(.disabled):active .iconButtonHighlightSvg
{ opacity: 1 }`) was unverified. A regression that dropped the
`:not(.disabled)` guard from the active rule (or never added it)
would pass every existing check.

Options considered: (A) extend the compiled-CSS check to find both
the `:hover` rule with `opacity: 0.5` and the `:active` rule with
`opacity: 1`; (B) leave `:active` to manual review and document the
gap.

Fix: chose (A). Generalized the find helper into a `findGuarded(pseudo)`
closure called twice (once for `:hover`, once for `:active`), and
returned `{ hover: {...}, active: {...} }` with `found` and `opacity`
on each. Updated the expected-results sentence to require
`hover.found && hover.opacity === "0.5"` and `active.found &&
active.opacity === "1"`. Inherits all the same robustness as the
hover side (substring matching survives CSS-modules hashing; doesn't
depend on whether `:hover` / `:active` engage under synthetic events).
(B) rejected because the check is essentially a clone of the hover
check and the symmetric gap closes a real regression vector.

---

## External Review (Round 6)

External review (2026-05-27, sixth pass) raised six issues, two High,
three Medium, one Low. Resolutions below.

### RESOLVED: Overview/Background claimed "rounded highlight shapes" were fixed but the requirement says no highlight-shape change (High)

Reviewer: Overview ([line 22-23](#project-owner-overview)) and Background
([line 42](#background)) said WM-23 fixes *"rounded corners on
highlights that should have been square"* and *"fixes rounded corners
on highlight shapes"* — but the dedicated "Corner radii on hover/select
shapes" section explicitly says *"No change is expected here ... The
icon-on-top buttons' highlight SVGs ... should continue to render with
the shape baked into the SVG."* The prose and the requirement
contradict each other.

Fix: the "Corner radii" section is the source of truth (it's downstream
of multiple self-review rounds). The Overview/Background prose was
stale, conflating two distinct corner-radius topics: the **outer
widget container** top-corner radius (9 px → 10 px in `common.scss`,
a real change) and the **icon-on-top highlight SVG shapes**
(unchanged). Replaced the misleading prose in both spots with
accurate language about the outer container radius change, and added
a one-line cross-reference in Background pointing at the "Corner
radii on hover/select shapes" section so the no-shape-change rule is
visible from both directions. Acceptance already covers the outer
container radius (border-top-left-radius 10 px), so no acceptance
change was needed.

---

### RESOLVED: Pill-button "placement, size, and halo behavior are correct and unchanged" overstated what's preserved (High)

Reviewer: the Hover-and-Select section said
*"The pill buttons (Reload, Restart, Start/Stop) already implement the
50% / 100% rule correctly via `box-shadow` halos on `:hover` and
`:active`; their placement, size, and halo behavior are correct and
unchanged."* But the Layout table requires 60 px content widths and
a shared 122 px outer border for Reload+Restart, and the Shared-border
note explicitly calls the change structural. *"Size and placement
unchanged"* would mislead implementers into preserving wrong
dimensions.

Fix: narrowed the sentence to halo behavior only (which is what the
Hover-and-Select section is actually about), and added a forward
reference: *"Width, paired outer border, and corner radius for the
pill buttons are governed by the Layout section above, not this
section."* This keeps the original spirit (the halo rule already
works correctly and doesn't need to be reimplemented) without making
the false "size unchanged" claim.

---

### RESOLVED: Fullscreen asset requirement made hover-dark variants conditional but downstream acceptance required all four (Medium)

Reviewer: three sections said different things about how many
fullscreen assets exist. The Required-changes bullet hedged
*"with hover-dark variants if Zeplin provides them"* and *"unless
Zeplin shows a different hover treatment"*, but the Asset deliverables
subsection required overwriting all four files and the Playwright
acceptance required 4 distinct rendered backgroundImage values. If
Zeplin only shipped 2 assets, the spec became impossible to satisfy.

Fix: the hedges were leftover prose from before Round-2 External
Review locked in the 4-asset model. Removed both hedges from the
Required-changes bullets and replaced them with unconditional
language requiring all four assets, cross-referenced to Asset
deliverables for the locked-in filename set. The existing "spec-level
question, not a free implementer decision" escape hatch in Asset
deliverables handles the unlikely case where Zeplin's actual export
deviates (the implementer raises it back to the spec rather than
silently shipping a partial implementation).

---

### RESOLVED: Fullscreen geometry summary mixed glyph and hit-target dimensions without anchoring (Medium)

Reviewer: the Layout table defined a 42 × 42 icon inside a 62 × 64
hit target, but the Zeplin geometry summary listed
`Fullscreen icon x=992 w=42 h=42` (glyph dimensions). Acceptance
asserted `[class*="fullscreenIcon"]` is 62 × 64 (hit-target). No
anchor stated whether x=992 referred to the glyph or the hit-target,
and no right/top offsets were locked in despite the geometry implying
specific values.

Options considered: (A) split the geometry summary into glyph and
hit-target lines with explicit x-anchors and slack math; (B) keep a
single line and add an inline footnote explaining the dual semantics;
(C) drop the x coordinate entirely from the summary since
right-alignment makes the absolute position implementation-derivable.

Fix: chose (A). Replaced the single fullscreen line with two: one
for the glyph (`x=992 w=42 h=42`, right edge at x=1034), one for
the hit-target (`x=982 w=62 h=64`, right edge at x=1044 = bar content
right). The pair makes the 10 px horizontal slack and 11 px vertical
slack explicit. Also tightened the Required-changes margin bullet
to lock in **right margin = 0 px** (hit-target right edge aligns
with bar content right) and **top margin = the value that vertically
centers the 64 px container in the 75 px bar** (5-6 px given 11 px
slack). Extended the Acceptance "Fullscreen container and icon size"
bullet to assert both: right-edge alignment within ±1 px of the bar's
right content edge, and vertical centering within ±1 px of
`(75 - 64) / 2 = 5.5`. (B) rejected as harder to read; (C) rejected
because the x coordinate provides the right-alignment proof and is
useful to keep.

---

### RESOLVED: FIS-hidden centering acceptance used inner button rects instead of cluster outer edges (Medium)

Reviewer: the FIS-hidden centering bullet said *"the controls cluster
is centered between the logo and fullscreen toggle"* but read
`terrainRect.left` and `helitackRect.right` directly — the **inner**
button rects, not the cluster's outer edges. With shared borders or
pair-container padding, those rects don't necessarily mark the
cluster boundary.

Fix: same pattern Issue 3 (Round 5) just locked in for outer/non-paired
adjacencies. Rewrote the bullet to pivot from each testid to its
widgetGroup ancestor via `.closest('[class*="widgetGroup"]')`, then
use those widgetGroup rects' outer edges. Under both shared-border
structural options the math is correct: Option 1 returns the shared
pair container's outer-right edge for Helitack; Option 2 returns
Helitack's own widgetGroup right edge (which equals the pair's right
edge since Helitack is rightmost in the pair). The supporting-evidence
paragraph, ±5 px tolerance, and 1400 × 1000 viewport preamble all
preserved.

---

### RESOLVED: Round-2 QA self-review entry said disabled-rendering bullet was "dropped" but Acceptance still asserts disabled rendering (Low)

Reviewer: Round-2 QA's "Disabled regression check" self-review entry
recorded that the disabled-rendering check was dropped because WM-24
owns the regression coverage. But the current Acceptance section
still includes a "Disabled rendering (regression check on WM-24
behavior)" Playwright bullet asserting `filter: grayscale(1)` on the
button root and `opacity: 0.35` on the content span. A reader of the
self-review history would conclude the check is out of scope, then
find it in Acceptance, and have to reconstruct the timeline to
understand both are true.

Fix: the Round-2 entry remained accurate for **Cypress** (which still
doesn't assert disabled rendering), but the Round-1 External Review
later re-added the check in the **Playwright** layer as part of fixing
an unrelated bug. Added a Round-6-sweep annotation to the Round-2 QA
entry clarifying scope: the decision applies to the Cypress layer
only, and the current Playwright Acceptance section is the source of
truth for what's actually verified. Preserves the decision log
without leaving the stale "dropped" framing as the last word.

(The reviewer noted "for example" — implying this may not be the only
historical-entry drift. This fix addresses the cited example; a full
sweep of every Self-Review historical entry for staleness would be
its own pass and is out of scope for Round 6.)

---
