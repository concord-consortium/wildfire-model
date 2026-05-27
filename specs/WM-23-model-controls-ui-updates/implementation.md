# Implementation Plan: Bottom-Bar Controls UI/UX Updates for Hazbot Readiness

**Jira**: https://concord-consortium.atlassian.net/browse/WM-23
**Requirements Spec**: [requirements.md](requirements.md)
**Status**: **Ready for Implementation**

## Implementation Plan

Steps are organized so each one is independently reviewable. Steps 1-6
each ship as a discrete commit; step 7 is verification-only (no commit:
it produces Playwright screenshots attached to the PR description and
walks the eyeball checklist against the Zeplin reference). Steps build
forward without circular dependencies:

1. **Icon-on-top hover/active opacity rule** — isolated CSS change in
   `icon-button.scss`, no structural impact. Lands first so the
   surrounding layout work has a known-clean baseline.
2. **"Fire Line" → "Fireline" label** — one-line JSX rename plus
   cosmetic comment/description updates. Also isolated.
3. **Bottom-bar layout: widths, gaps, shared borders, outer corner
   radius** — the largest structural step. Outer container radius bump,
   per-widget widths, Reload+Restart / Fireline+Helitack pair
   restructure, margin-override cleanup.
4. **FIS testid + FIS-hidden cluster centering** — adds
   `data-testid="fire-intensity-scale"` and the `.fisHidden` centering
   mechanism. Needed by both the Cypress visuals spec (step 6) and the
   Playwright walkthrough (step 7).
5. **Fullscreen icon: asset swap, container resize, background CSS,
   test hook** — replaces the four fullscreen SVGs, resizes the
   container to 62 × 64, adds the `window.test.setFullscreenIconState`
   helper required by the Playwright variant-distinctness assertion.
6. **Cypress visual regression spec** — new file
   `cypress/e2e/bottom-bar-visuals.cy.ts` asserting widths, paired
   bounding boxes, default opacity, label text, and fullscreen
   container dimensions. Verifies steps 1-5 in CI.
7. **Playwright MCP verification walkthrough + PR evidence** — final
   reviewability layer covering hover/active opacity, FIS-hidden
   centering, fullscreen-variant toggling, paired-group inner corner
   radii, pill-button halos, and the compiled-CSS guard check.
   Produces the 4-up screenshot, the default-layout screenshot, and
   the FIS-hidden screenshot attached to the PR description.

### Icon-on-top hover/active opacity rule

**Summary**: Replace the existing `:hover { opacity: 1 }` rule on
`.iconButtonHighlightSvg` with two guarded rules — `:not(.disabled):hover`
at `0.5` and `:not(.disabled):active` at `1.0` — so Setup, Spark,
Fireline, and Helitack match the Zeplin 50% / 100% spec and don't fire
hover/active visuals when disabled. CSS-only change isolated to
[icon-button.scss](../../src/components/icon-button.scss).

**Files affected**:
- `src/components/icon-button.scss` — replace the existing hover rule at lines 21-25 with two `:not(.disabled)` guarded rules.

**Estimated diff size**: ~10 lines.

**Change**:

Before (icon-button.scss:17-25):
```scss
.iconButtonHighlightSvg {
  opacity: 0;
}

&:hover {
  .iconButtonHighlightSvg {
    opacity: 1;
  }
}
```

After:
```scss
.iconButtonHighlightSvg {
  opacity: 0;
}

// Guard with the project's .disabled className convention (see
// icon-button.scss:34 and icon-button.tsx:17) rather than :disabled,
// so disabled icon-on-top buttons skip hover/active visuals.
&:not(.disabled) {
  &:hover {
    .iconButtonHighlightSvg {
      opacity: 0.5;
    }
  }
  &:active {
    .iconButtonHighlightSvg {
      opacity: 1;
    }
  }
}
```

The substring `--disabled--` will appear in the compiled selector after
CSS-modules hashing (per `localIdentName: '[name]--[local]--__wildfire-v1__'`
at [webpack.config.js:44-45](../../webpack.config.js#L44-L45)), which is
what the Acceptance section's compiled-CSS guard check looks for.

---

### "Fire Line" → "Fireline" label

**Summary**: Rename the user-visible Fire Line button label to "Fireline"
(one word). Tiny but isolated so the rename diff is reviewable on its own.
Asset filenames, React variable names, and `data-testid` are unchanged
(already RESOLVED in the requirements spec: Open Question on
`fire-line*.svg` rename → leave as-is).

**Files affected**:
- `src/components/bottom-bar.tsx` — line 168 `buttonText="Fire Line"` → `buttonText="Fireline"`.
- `src/components/bottom-bar.test.tsx` — comments at lines 137, 178, 179, 196, 210 referring to "Fire Line" updated to "Fireline" for consistency; the test bodies use `data-testid="fireline-button"` which is already one word.
- `cypress/e2e/bottom-bar-state-machine.cy.ts` — `it(...)` description strings at lines 126, 137, 157 mentioning "Fire Line" updated to "Fireline". Cosmetic only (no load-bearing assertions reference the string); included in this step to keep the codebase grep-clean for "Fire Line".

**Estimated diff size**: ~10 lines.

**Change** (bottom-bar.tsx:163-172):

Before:
```tsx
<div className={`${css.widgetGroup}`}>
  <IconButton
    icon={<FireLineIcon />}
    highlightIcon={<FireLineHighlightIcon />}
    disabled={!this.fireLineEnabled}
    buttonText="Fire Line"
    dataTest="fireline-button"
    onClick={this.handleFireLine}
  />
</div>
```

After:
```tsx
<div className={`${css.widgetGroup}`}>
  <IconButton
    icon={<FireLineIcon />}
    highlightIcon={<FireLineHighlightIcon />}
    disabled={!this.fireLineEnabled}
    buttonText="Fireline"
    dataTest="fireline-button"
    onClick={this.handleFireLine}
  />
</div>
```

---

### Bottom-bar layout: widget widths, gaps, shared borders, outer-container corner radius

**Summary**: Largest structural step. Bumps the outer widget container
top-corner radius from 9 px to 10 px (via `$bottomBarBorderRadius`),
normalizes per-widget content widths to the Layout-table values (Setup
82, Spark 60, Reload 60, Restart 60, Start 60, Fireline 65, Helitack
65), and consolidates the Reload+Restart and Fireline+Helitack pairs
under a single shared outer border per pair so the visible rendering
matches the Zeplin spec (122 × 75 and 132 × 75 outer borders, only
outer top corners rounded, no inner divider, 0 px gap within each
pair, 10 px content-edge gap between non-paired widgets).

**Files affected**:
- `src/components/common.scss` — `$bottomBarBorderRadius: 9px` → `10px` (one-line change).
- `src/components/bottom-bar.scss` — per-widget width rules (Setup 82, Spark 60, Reload 60, Restart 60, Start 60, Fireline 65, Helitack 65, FIS 140), gap/margin-override adjustments for the new pair structure, and removal of the inner-facing border/radius on within-pair widgets. Adds a new `.fireIntensityScale` modifier class for the FIS widgetGroup.
- `src/components/bottom-bar.tsx` — JSX restructure for Fireline+Helitack to share an outer container, matching the existing pattern at [bottom-bar.tsx:131-150](../../src/components/bottom-bar.tsx#L131-L150) for Reload+Restart (which already share `.reloadRestart`). Adds `.fireIntensityScale` class to the FIS widgetGroup at [bottom-bar.tsx:185](../../src/components/bottom-bar.tsx#L185).

**Estimated diff size**: ~80 lines (CSS rewrites dominate; the JSX wrap of Fireline+Helitack is ~10 lines).

**Implementation notes**:

- **Asset re-verification.** No SVG file edits in this step, but the
  `src/assets/bottom-bar/fire-line*.svg` and `helitack*.svg` rendered
  widths inside the new 65 px Fireline / 65 px Helitack containers
  should be re-verified after the width change. The icons may have
  been authored to fill the previous container width; if so, they
  will scale to the new content area via the existing CSS and look
  correct, but a visual check (covered by Step 7's Playwright
  walkthrough screenshot) confirms.

- **New modifier classes introduced across this and the next
  step.** Listed here as a rollup so the SCSS file additions are
  visible in one place:
  - `.fireLineHelitack` (this step) — the shared outer-container
    widgetGroup wrapping Fireline + Helitack. Mirrors the existing
    `.reloadRestart` class.
  - `.fireIntensityScale` (this step) — width-locking modifier on the
    FIS widgetGroup. Added at
    [bottom-bar.tsx:185](../../src/components/bottom-bar.tsx#L185).
  - `.fisHidden` (next step: "Fire Intensity Scale: testid +
    FIS-hidden cluster centering") — conditional modifier on
    `.bottomBar` flipping the cluster from left-aligned to centered
    when `!simulation.config.showBurnIndex`.

  No new SCSS file is created; all three live under the existing
  `.bottomBar` block in
  [bottom-bar.scss](../../src/components/bottom-bar.scss).

- **Shared-border mechanism**. Use Option 1 (single outer container per
  pair) for Fireline+Helitack, matching the existing Reload+Restart
  pattern at [bottom-bar.tsx:131-150](../../src/components/bottom-bar.tsx#L131-L150).
  Concretely: replace the current two-widgetGroup-wrappers JSX at
  [bottom-bar.tsx:163-182](../../src/components/bottom-bar.tsx#L163-L182)
  with one `<div className={`${css.widgetGroup} ${css.fireLineHelitack}`}>`
  containing both IconButtons. The widgetGroup border + outer corner
  radius live on the outer wrapper (per the existing
  [bottom-bar.scss:45-71](../../src/components/bottom-bar.scss#L45-L71)
  `.widgetGroup` rule); no inner-border suppression is needed because
  IconButtons themselves never had borders (only their previous
  widgetGroup wrappers did). The Reload+Restart precedent is more
  involved because the inner `.playbackButton` MUI Buttons render
  with their own corner styling and need explicit
  `:first-child`/`:last-child` corner-radius rules at
  [bottom-bar.scss:149-154](../../src/components/bottom-bar.scss#L149-L154)
  — Fireline+Helitack skips this complication. See [the Open Question below](#resolved-firelinehelitack-shared-border-mechanism--option-1-or-option-2) for the decision.

- **Inner IconButton width inside the shared container**. The base
  [icon-button.scss:3-7](../../src/components/icon-button.scss#L3-L7)
  rule sets `width: 100%` on each MUI Button. The base
  `.widgetGroup` rule does not set an explicit width, so today's
  per-widget wrappers shrink-wrap their single inner button (which
  sizes itself to its SVG plus padding via the existing
  `.terrainButton button svg { width: 62px }` style of override).
  Under Option 1 (single shared outer container) the
  `.fireLineHelitack` wrapper would hold **two** `width: 100%`
  siblings with no fixed parent width — circular sizing that
  resolves through the MUI Button's inline-flex min-content fallback
  and renders unpredictably (overflow or stack depending on the
  parent's display mode). Adding
  `.fireLineHelitack button { width: 65px }` gives each child an
  explicit width; the container then shrink-wraps to 130 px content
  (132 px outer border with the 1 px border on each side), which is
  the spec's paired Border w.
  Note the **tag selector** (`button`), not the class selector
  `.iconButton`: `.iconButton` is defined in
  [icon-button.scss](../../src/components/icon-button.scss) and is
  hashed by CSS modules to
  `icon-button--iconButton--__wildfire-v1__`, while writing
  `.iconButton` inside `bottom-bar.scss` would compile to
  `bottom-bar--iconButton--__wildfire-v1__`: a different,
  non-existent class. The MUI Button renders as a `<button>` element
  at runtime, so the tag selector targets it directly. This mirrors
  the established cross-module pattern at
  [bottom-bar.scss:108-111](../../src/components/bottom-bar.scss#L108-L111)
  where `.terrainButton button svg { width: 62px }` overrides the
  same `width: 100%` rule for the Setup icon. The override approach
  is preferred over a flex-based alternative because it changes
  the minimum number of rules: the parent's display mode stays
  untouched and only the inner-button width gets a per-pair
  override. The Reload+Restart precedent doesn't hit this issue
  because `.playbackButton` uses `min-width: 60px` with no `width:
  100%`.

- **Margin overrides to remove** (today in
  [bottom-bar.scss:79-92](../../src/components/bottom-bar.scss#L79-L92)).
  Three negative-margin overrides collapse gaps to 0 under the
  current layout, but the new spec wants 10 px content-edge gaps
  (8 px visible border-to-border) at every non-paired adjacency.
  All three must be removed:

  - `.placeSpark { margin-right: 0 }` — remove. Today collapses
    the Spark→Reload gap to 0; the new spec wants 10 px content-
    edge here.
  - `.startStop { margin-left: -$bottomBarWidgetGroupSpacing }` —
    remove. Today collapses Restart→Start to 0; the new spec wants
    10 px content-edge here.
  - `.helitack { margin-left: -$bottomBarWidgetGroupSpacing }` —
    remove. Dead code under Option 1 anyway (the new
    `.fireLineHelitack` outer container replaces the per-Helitack
    widgetGroup), but the rule itself should be deleted along with
    the unused `.helitack` selector.

  The base `.widgetGroup { margin-right: $bottomBarWidgetGroupSpacing }`
  rule at
  [bottom-bar.scss:70](../../src/components/bottom-bar.scss#L70)
  provides the 10 px content-edge gap naturally once the overrides
  are gone. Verify all five non-paired adjacencies (Setup→Spark,
  Spark→Reload, Restart→Start, Start→Fireline, Helitack→FIS) end
  up with 8 px visible border-to-border (the Acceptance section's
  "Inter-widget gaps" bullet asserts this).

- **Per-widget content widths**. The Layout table specifies content
  widths (Setup 82, Spark 60, Reload 60, Restart 60, Start 60,
  Fireline 65, Helitack 65, FIS 140). The existing `.terrainButton`
  rule at
  [bottom-bar.scss:100-112](../../src/components/bottom-bar.scss#L100-L112)
  already sets Setup to 82 px; replicate that pattern for the others
  (per-class width rules under the existing `.widgetGroup` block).
  The pill buttons' inner `.playbackButton { min-width: 60px }` at
  [bottom-bar.scss:134-135](../../src/components/bottom-bar.scss#L134-L135)
  already gives the right inner width for Reload/Restart/Start.

  FIS gets a new `.fireIntensityScale` modifier class on its
  widgetGroup wrapper at
  [bottom-bar.tsx:185](../../src/components/bottom-bar.tsx#L185) with
  `width: 140px`. The inner `.barsContainer` and `.labels` (80 px
  each in
  [fire-intensity-scale.scss](../../src/components/fire-intensity-scale.scss))
  stay unchanged; the extra width is absorbed by the surrounding
  `.widgetGroup` padding and the "Fire Intensity Scale" label above
  the bars, per the FIS row footnote in the Layout table.

- **Corner radii**. The new $bottomBarBorderRadius: 10px feeds the
  existing `.widgetGroup { border-top-{left,right}-radius:
  $bottomBarBorderRadius }` rule at
  [bottom-bar.scss:52-53](../../src/components/bottom-bar.scss#L52-L53),
  so the radius change is global to the widgetGroup wrapper. The
  two paired groups behave differently inside their shared
  container:
  - **Fireline+Helitack (this ticket's new pair)**: inner
    IconButtons have no border, no background chrome, and no
    corner-radius rules of their own, so no explicit inner-corner
    reset is needed. The shared `.fireLineHelitack` outer
    container owns the 10 px radius on its outer top corners
    (inherited from `.widgetGroup`); the inner buttons sit flush
    inside with default 0 px corners.
  - **Reload+Restart (existing pair, no WM-23 changes)**: inner
    `.playbackButton` MUI Buttons render with their own corner
    styling. The existing
    `.playbackButton:first-child`/`:last-child` rules at
    [bottom-bar.scss:149-154](../../src/components/bottom-bar.scss#L149-L154)
    explicitly set the outer corners and leave the inner-facing
    corners at the default 0. WM-23 doesn't change these rules
    (the global radius bump from 9 → 10 px applies via
    `$bottomBarBorderRadius`).

---

### Fire Intensity Scale: testid + FIS-hidden cluster centering

**Summary**: Two small, related changes that the upcoming Cypress and
Playwright acceptance steps depend on. (1) Add
`data-testid="fire-intensity-scale"` to the root `<div>` of
`FireIntensityScale` so width / gap / centering assertions can pivot
from a stable selector via `.closest('[class*="widgetGroup"]')`. (2)
Center the controls cluster (`.mainContainer`) horizontally between
the CC logo and the Fullscreen toggle when `config.showBurnIndex ===
false`, matching the Zeplin spec for the FIS-hidden layout.

**Files affected**:
- `src/components/fire-intensity-scale.tsx` — add `data-testid="fire-intensity-scale"` to the root `<div>` at line 10.
- `src/components/bottom-bar.scss` — adjust `.bottomBar` / `.mainContainer` / `.rightContainer` flex behavior so the cluster centers when FIS is absent. The current `.bottomBar { justify-content: space-between }` at line 26 leaves the cluster left-aligned because `.rightContainer` absorbs the leftover width.

**Estimated diff size**: ~20 lines.

**Implementation notes**:

- **Conditional mechanism**: add a `.fisHidden` modifier class on
  `.bottomBar`, applied conditionally in the JSX based on
  `!simulation.config.showBurnIndex`. Follows the existing project
  pattern of conditional classNames (e.g. `.fullscreenIconStyle` at
  [bottom-bar.tsx:58-60](../../src/components/bottom-bar.tsx#L58-L60))
  and avoids `:has()` browser-matrix risk. Concrete JSX change at
  [bottom-bar.tsx:104](../../src/components/bottom-bar.tsx#L104):

  Before:
  ```tsx
  <div className={css.bottomBar}>
  ```

  After:
  ```tsx
  <div className={`${css.bottomBar} ${!simulation.config.showBurnIndex ? css.fisHidden : ""}`}>
  ```

  `simulation` is already destructured from `this.stores` in the
  existing render method at
  [bottom-bar.tsx:102](../../src/components/bottom-bar.tsx#L102), so
  no new accessor is needed. The `@observer` decorator on the
  `BottomBar` class ensures the className recomputes when the MobX
  config value changes (though `showBurnIndex` is set at mount-time
  via URL params today and doesn't change at runtime).

- **Centering mechanism**: under `.bottomBar.fisHidden`, set
  `margin: 0 auto` (equivalent to
  `margin-top: 0; margin-right: auto; margin-bottom: 0; margin-left: auto`)
  on `.mainContainer`. The surrounding `.bottomBar` is already
  `display: flex` at
  [bottom-bar.scss:25](../../src/components/bottom-bar.scss#L25),
  so the horizontal `auto` margins symmetrize the gaps between
  `.leftContainer` and `.rightContainer` automatically. Use
  `margin: 0 auto` rather than the bare `margin: auto` shorthand:
  `margin: auto` also sets vertical auto-margins, which under
  `display: flex` triggers cross-axis auto-margin behavior and
  can shift the cluster vertically depending on `.bottomBar`'s
  `align-items` value. The `0` for vertical margins keeps the
  cluster's vertical placement unchanged from today. Works
  regardless of viewport width and doesn't require flex spacers.
  The Playwright "supporting evidence" `justify-content: center`
  read is marked optional in the Acceptance section and will not
  fire under this mechanism; the load-bearing pixel-symmetry
  assertion (`Math.abs(leftGap − rightGap) ≤ 5`) covers
  correctness without it.

- FIS-hidden layout should be verified at the 1400 × 1000 viewport
  (the project's Cypress default per
  [cypress.config.ts:6-7](../../cypress.config.ts#L6-L7)). Centering
  math only behaves as designed when the viewport exceeds the bar's
  1044 px content width.

---

### Fullscreen icon: asset swap, container resize, background CSS, test hook

**Summary**: Replace the four fullscreen SVGs in `src/assets/` with
the new Zeplin exports, resize the `.fullscreenIcon` container from
50 × 50 to 62 × 64 with the icon rendered at a fixed 42 × 42 via
`background-size: 42px 42px`, add `background-repeat: no-repeat` and
`background-position: center` to close the tiling/positioning gap that
opens once the icon stops filling the container, set the container's
right margin to 0 (right edge aligns with bar's right content edge)
and top margin to 5-6 px (vertical centering in the 75 px bar), and
add the `window.test.setFullscreenIconState(boolean)` helper that the
Playwright fullscreen-variant test needs.

**Files affected**:
- `src/assets/fullscreen.svg`, `src/assets/fullscreen-dark.svg`, `src/assets/fullscreen-exit.svg`, `src/assets/fullscreen-exit-dark.svg` — replaced in place with new Zeplin exports per the requirements' Asset deliverables subsection (filenames preserved, no new files, no renames).
- `src/components/bottom-bar.scss` — `.fullscreenIcon` rule at lines 114-131 rewritten: container width 62, height 64, background-size 42 px 42 px, background-repeat no-repeat, background-position center, margin-right 0, margin-top 6 (locks in the upper end of the requirements' 5-6 px range; the bar's 11 px vertical slack divides as 6 above + 5 below, which is within the Acceptance section's ±1 px tolerance of the mathematical center of 5.5).
- `src/models/stores.ts` — add `setFullscreenIconState(value: boolean)` to the `window.test` helpers (alongside `placeSparkInZone` etc.).
- `src/components/bottom-bar.tsx` — wire the **instance-ref** write side of the test hook (the mechanism locked in by the RESOLVED Open Question below): set `(window as any).test.__bottomBarRef = this` in `componentDidMount` and clear it in `componentWillUnmount`, both **outside** the `screenfull?.isEnabled` guard so headless browsers still get the hook. The JSX already reads `this.state.fullscreen` and applies the hashed `.fullscreen` modifier class, so no JSX changes are needed. See the Implementation notes below for the full two-sided wiring.

**Estimated diff size**: ~40 lines net (SCSS + stores.ts + bottom-bar.tsx wiring) plus 4 SVG file replacements.

**Implementation notes**:

- **Asset workflow**. Download each SVG from the Zeplin screen
  (linked in the requirements header) and overwrite the existing file
  paths. Record the date pulled from Zeplin in the PR description for
  traceability per the Asset deliverables subsection.

- **Test hook mechanism (two-sided wiring).** The helper lives in
  [src/models/stores.ts](../../src/models/stores.ts) but the ref it
  drives is owned by `BottomBar`. `stores.ts` cannot hold the ref
  itself because `createTestHelpers(simulation)` runs at
  [stores.ts:34](../../src/models/stores.ts#L34) at store-creation
  time, before any React component renders. Wire it in two halves:
  - **stores.ts (read side).** Extend `createTestHelpers` to add
    `setFullscreenIconState(value: boolean)`, alongside the existing
    `placeSparkInZone` etc. helpers at
    [stores.ts:65-81](../../src/models/stores.ts#L65-L81). Initialize
    the ref slot in the returned object as
    `__bottomBarRef: null as any` (use `any`, not an imported
    `BottomBar` type: importing the component into `stores.ts`
    creates a circular dependency since
    [base.ts](../../src/components/base.ts) imports `IStores` from
    `stores.ts`). The `setFullscreenIconState` helper body reads
    `(window as any).test.__bottomBarRef` and calls
    `__bottomBarRef?.setState({ fullscreen: value })`. Use optional
    chaining so a call before `BottomBar` mounts no-ops cleanly
    instead of throwing.
  - **bottom-bar.tsx (write side).** In `componentDidMount`, set
    `(window as any).test.__bottomBarRef = this` **outside** the
    existing `if (screenfull?.isEnabled)` guard at
    [bottom-bar.tsx:89-93](../../src/components/bottom-bar.tsx#L89-L93):
    headless browsers (where `screenfull` is gated off) still need the
    test hook to be wired so the Playwright fullscreen-variant
    walkthrough can drive the toggled state. In `componentWillUnmount`,
    clear it (`(window as any).test.__bottomBarRef = null`), also
    outside the `screenfull` guard.

  Matches the existing `window.test.*` test-only convention and
  doesn't touch the production read path. See [the Open Question
  below](#resolved-fullscreen-test-hook-mechanism--instance-ref-or-uimodel-hoist)
  for the decision rationale.

- **PR evidence (4-up screenshot)**. After the asset swap, generate a
  4-up preview screenshot showing the new icons rendered at 42 × 42
  inside the 62 × 64 container in all four states (default,
  default + hover, exit, exit + hover). Save it to
  `tmp/playwright/fullscreen-4up.png` (gitignored per
  [CLAUDE.md](../../CLAUDE.md) Playwright convention) and attach it
  to the PR description or a PR comment via GitHub's drag-and-drop
  image upload.

---

### Cypress visual regression spec (`cypress/e2e/bottom-bar-visuals.cy.ts`)

**Summary**: New Cypress spec owning the deterministic visual-regression
assertions WM-23 introduces. Asserts the per-widget border widths
(Border w. column), paired bounding-box widths (122 / 132 for
Reload+Restart and Fireline+Helitack), inter-widget gaps (8 px
non-paired, 0 px within-pair), default-state highlight opacity = 0 on
the icon-on-top buttons, "Fireline" label text on the Fire Line button,
and the fullscreen container's 62 × 64 dimensions with computed
`background-size: 42px 42px`, `background-repeat: no-repeat`,
`background-position: 50% 50%`.

Hover/active opacity (0.5 / 1.0) and FIS-hidden centering are owned by
the Playwright walkthrough (next step) per the requirements verification
split — they're fragile in Cypress (`cy.trigger` doesn't reliably activate
`:hover` / `:active` pseudo-classes for `getComputedStyle` reads).

**Files affected**:
- `cypress/e2e/bottom-bar-visuals.cy.ts` — new file, ~250 lines.

**Estimated diff size**: ~250 lines (new file).

**Implementation notes**:

- All class-name selectors use the `[class*="name"]` attribute-substring
  form to survive CSS-modules hashing (per the requirements'
  "CSS-module selectors" preamble in Acceptance).

- The pivot pattern for widget rects is
  `cy.get('[data-testid="X"]').then(($btn) => $btn.closest('[class*="widgetGroup"]')[0].getBoundingClientRect())`
  for both per-widget widths and inter-widget gap calculations
  (non-paired adjacencies only). Within-pair gaps
  (Reload→Restart, Fireline→Helitack) read the inner button rects
  directly — the closest-widgetGroup formula degenerates under
  Option 1 (single shared container per pair) because both buttons
  climb to the same ancestor.

- Paired widths use the bounding-box formula
  `Math.max(a.right, b.right) − Math.min(a.left, b.left)`, which
  returns 122 / 132 for both shared-border structural options.

- Default-state highlight opacity reads `getComputedStyle(el).opacity`
  on the inner `[class*="iconButtonHighlightSvg"]` span for each of
  the four icon-on-top buttons (terrain, spark, fireline, helitack),
  expecting `'0'`. No hover/active assertions in this layer — they
  live in the Playwright layer.

- Test setup should use `cy.viewport(1400, 1000)` (already the
  Cypress default per
  [cypress.config.ts:6-7](../../cypress.config.ts#L6-L7)) and the
  same `cy.visit(APP_URL)` + `cy.window().its("sim.dataReady")`
  preamble as
  [cypress/e2e/bottom-bar-state-machine.cy.ts:86-91](../../cypress/e2e/bottom-bar-state-machine.cy.ts#L86-L91).

**Skeleton** (illustrates the rect-pivot and class-substring patterns
the spec needs; the implementer fills in the remaining widgets and
assertions per the requirements' Acceptance section):

```ts
const APP_URL = "/?";

const widgetRect = (testid: string) =>
  cy.get(`[data-testid="${testid}"]`).then($btn =>
    $btn.closest('[class*="widgetGroup"]')[0].getBoundingClientRect()
  );

describe("Bottom bar visual regression (WM-23)", () => {
  beforeEach(() => {
    cy.visit(APP_URL);
    cy.window().its("sim.dataReady").should("eq", true);
  });

  it("renders each non-paired widget at its spec Border w. value", () => {
    // Border w. from requirements.md Layout table (content width + 2).
    widgetRect("terrain-button").should(r => expect(r.width).to.eq(84));
    widgetRect("spark-button").should(r => expect(r.width).to.eq(62));
    widgetRect("start-button").should(r => expect(r.width).to.eq(62));
    widgetRect("fire-intensity-scale").should(r => expect(r.width).to.eq(142));
  });

  it("renders each paired group at its shared Border w. value", () => {
    // Bounding-box width: works under both shared-border structural options.
    cy.get('[data-testid="reload-button"]').then($reload => {
      cy.get('[data-testid="restart-button"]').then($restart => {
        const a = $reload[0].getBoundingClientRect();
        const b = $restart[0].getBoundingClientRect();
        expect(Math.max(a.right, b.right) - Math.min(a.left, b.left)).to.eq(122);
      });
    });
    // Same pattern for Fireline+Helitack → 132.
  });

  it("renders default-state highlight opacity = 0 on icon-on-top buttons", () => {
    ["terrain-button", "spark-button", "fireline-button", "helitack-button"]
      .forEach(id => {
        cy.get(`[data-testid="${id}"] [class*="iconButtonHighlightSvg"]`)
          .should("have.css", "opacity", "0");
      });
  });

  it("renders the Fire Line button with label 'Fireline'", () => {
    cy.get('[data-testid="fireline-button"]').should("contain.text", "Fireline");
  });

  // Remaining specs: inter-widget gaps (8 px non-paired, 0 px within-pair
  // using inner button rects), fullscreen container 62×64, computed
  // background-size/repeat/position. See requirements.md Acceptance.
});
```

---

### Playwright MCP verification walkthrough + PR evidence

**Summary**: Final verification step that runs the Playwright MCP
walkthrough against a running dev server, generates the
`tmp/playwright/bottom-bar-default.png`,
`tmp/playwright/bottom-bar-fis-hidden.png`, and
`tmp/playwright/fullscreen-4up.png` screenshots, runs through the
layer-3 eyeball checklist, and attaches the screenshots to the PR
description. No code commits — this step produces reviewable PR
artifacts that close the gap Cypress can't cover (hover/active opacity,
FIS-hidden centering, fullscreen-variant toggling, paired-group inner
corner radii, pill-button halos, compiled-CSS guards, and the visual
pass against the Zeplin reference).

**Files affected**: None committed. Generates three screenshots under
`tmp/playwright/` (gitignored, attached to PR description).

**Estimated diff size**: 0 lines committed.

**Walkthrough sequence** (per the Acceptance section of
[requirements.md](requirements.md)):

1. `browser_resize({ width: 1400, height: 1000 })` (matches Cypress default).
2. `browser_navigate("http://localhost:8080/")` — default layout.
   - **Dismiss the Terrain Setup dialog first.** The dialog
     auto-opens on first load and disables Spark / Fireline /
     Helitack until closed (see
     [CLAUDE.md](../../CLAUDE.md) "Spark count of `2` with a
     disabled Spark button" guidance). Walk it via Next → Create
     before running any enable-state-dependent assertions
     (hover-opacity reads on Setup/Spark, pill-button halos on
     Reload/Start, FIS-hidden centering, etc.). The width / gap /
     corner-radius reads are state-independent and could run
     before dismissal, but dismissing once up front simplifies the
     ordering.
   - `browser_evaluate` to read each widget's rect and compare against
     the Border w. column (Setup 84, Spark 62, Start 62, FIS 142) and
     paired bounding boxes (Reload+Restart 122, Fireline+Helitack 132).
   - Inter-widget gap check (8 px non-paired, 0 px within-pair).
   - Paired-group inner corner radii (outer-top 10 px, inner-top 0 px).
   - Hover and active opacity per icon-on-top button. Each requires
     reaching the right enable state first (Setup/Spark enabled in
     Default; Fireline/Helitack require
     `window.test.placeSparkInZone(0)` + start-button click).
   - Pill-button halos (Reload, Restart, Start). Same enable-state
     considerations apply (Reload/Start enable in Spark-Placed;
     Restart enables after Start is pressed).
   - Disabled rendering regression checks (filter: grayscale(1) on
     button root, opacity: 0.35 on content span).
   - `:not(.disabled):hover` and `:not(.disabled):active` compiled-CSS
     guard check via `document.styleSheets` walk.
   - Fireline label text == "Fireline".
   - Fullscreen container 62 × 64; background-size 42px 42px;
     background-repeat no-repeat; background-position 50% 50%; right
     edge aligned with bar's right content edge ±1 px; vertical
     centering within ±1 px of 5.5.
   - Fullscreen icon variants: four state-distinct `backgroundImage`
     values via the `window.test.setFullscreenIconState` test hook
     (added in the prior step). Wait for the hook to be ready before
     the first call (the underlying `__bottomBarRef` is set in
     `BottomBar.componentDidMount`). The Playwright MCP
     `browser_wait_for` tool only waits for text presence/absence or
     a timeout — it does not accept a JS predicate — so the right
     pattern here is to poll via `browser_evaluate` until
     `!!(window as any).test.__bottomBarRef` is true, e.g. a short
     loop of `browser_evaluate` reads with a small sleep between
     them, or a single `browser_evaluate` that resolves a Promise
     when the ref appears. This mirrors the intent of the existing
     `cy.window().its("sim.dataReady").should("eq", true)` pattern
     at [cypress/e2e/bottom-bar-state-machine.cy.ts:90-91](../../cypress/e2e/bottom-bar-state-machine.cy.ts#L90-L91)
     translated to the MCP toolset. In practice the bottom bar
     mounts almost immediately after `browser_navigate` resolves, so
     a single post-navigate `browser_evaluate` read of the ref
     usually finds it set; the explicit poll is defensive against
     slow-loading runs.
3. `browser_navigate("http://localhost:8080/?showBurnIndex=false")`.
   - FIS-hidden centering: pixel-symmetry of the controls cluster
     against logo and fullscreen-toggle. Optional supporting evidence:
     `getComputedStyle(parent).justifyContent`.
4. `browser_take_screenshot({ filename: "tmp/playwright/bottom-bar-default.png" })`,
   `bottom-bar-fis-hidden.png`, and the 4-up `fullscreen-4up.png`.
5. Run through the 7-item eyeball checklist
   ([requirements.md Acceptance section](requirements.md#acceptance--verification))
   against the Zeplin reference.
6. Attach all three screenshots to the PR description (GitHub
   drag-and-drop into the editor).

## Open Questions

<!-- Implementation-focused questions only. Requirements questions go in requirements.md. -->

### RESOLVED: Should the `$bottomBarBorderRadius: 9 → 10` SCSS variable bump be its own commit?
**Context**: The "Bottom-bar layout" step bundles the variable bump with
the rest of the width / shared-border / corner-radius work (~80 lines
total). Splitting it out gives a one-line standalone commit at the
front, which is cheap to review but adds a commit boundary for a
trivially-derivable change.
**Options considered**:
- A) Keep bundled with the layout step (recommended). Single coherent
  commit covering all corner-radius and width work.
- B) Split into its own commit before the layout step. Tiny standalone
  diff, easier to revert in isolation.

**Decision**: **A** — bundled with the layout step. The variable bump
is a one-line change that's naturally part of the same corner-radius
work the rest of the layout step is doing.

---

### RESOLVED: Fireline+Helitack shared-border mechanism — Option 1 or Option 2?
**Context**: The requirements Shared-border note explicitly allows
either (Option 1: single outer container per pair, like the existing
`.reloadRestart`; Option 2: two sibling widgets with the inner-facing
border + radius flattened). Acceptance is mechanism-neutral
(bounding-box width and inner-button-rect gap math pass both options).
**Options considered**:
- A) Option 1 (recommended). Single outer container wraps both
  IconButtons, matching the existing Reload+Restart pattern. Keeps
  the two pairs symmetric; avoids inventing a second mechanism.
- B) Option 2. Two sibling widgetGroups with their inner-facing
  border + radius flattened. Preserves the per-widget DOM shape but
  needs new CSS to suppress the inner border/radius.

**Decision**: **A** — Option 1, single outer container per pair. Matches
the existing `.reloadRestart` pattern so the two paired groups stay
structurally symmetric.

---

### RESOLVED: Fullscreen test-hook mechanism — instance ref or UIModel hoist?
**Context**: The Playwright fullscreen-variant test needs
`window.test.setFullscreenIconState(boolean)` to drive the toggled
state without invoking screenfull (gated in headless browsers) or
adding a bare className (hashed by CSS modules). The requirements
spec leaves the mechanism to the implementer.
**Options considered**:
- A) Instance ref via `(window as any).test.__bottomBarRef.setState({fullscreen: value})`
  (recommended). Minimal change, matches the existing `window.test.*`
  pattern (test-only, no production caller).
- B) Hoist `fullscreen` from `BottomBar.state` to `UIModel` as an
  `@observable`, switch JSX to read from `ui.fullscreen`, and have
  the helper write to `stores.ui.fullscreen`. Structurally cleaner
  (one fewer source of truth) but broader scope and touches production
  read paths.

**Decision**: **A** — instance ref. Minimal change, matches the existing
`window.test.*` test-only convention, doesn't touch production read
paths.

---

### RESOLVED: Rename "Fire Line" in state-machine spec `it(...)` descriptions?
**Context**: `cypress/e2e/bottom-bar-state-machine.cy.ts` references
"Fire Line" only in `it(...)` description text at three lines (no
load-bearing assertions). The requirements Files-in-Scope entry marks
this rename as optional cosmetic.
**Options considered**:
- A) Include in the label-rename step (recommended). Keeps the
  codebase grep-clean for "Fire Line"; <5 lines of churn.
- B) Skip. Test descriptions are private to the spec file; renaming
  them doesn't affect any user-facing behavior or assertion.

**Decision**: **A** — include the rename in the label-rename step.
Keeps the codebase grep-clean for "Fire Line"; <5 lines of churn.

---

### RESOLVED: Cypress visuals spec — new file or append to existing state-machine spec?
**Context**: The requirements spec suggests
`cypress/e2e/bottom-bar-visuals.cy.ts` as a new file but explicitly
allows consolidation into the existing
`cypress/e2e/bottom-bar-state-machine.cy.ts` ("the file split is not
load-bearing").
**Options considered**:
- A) New file `cypress/e2e/bottom-bar-visuals.cy.ts` (recommended).
  State-machine spec stays focused on WM-24 lifecycle behavior; the
  WM-23 visual regression checks live in their own file.
- B) Append to `cypress/e2e/bottom-bar-state-machine.cy.ts` as a new
  `describe(...)` block. One consolidated file; less file-management
  overhead.

**Decision**: **A** — new file `cypress/e2e/bottom-bar-visuals.cy.ts`.
Keeps the WM-24 state-machine spec focused on lifecycle behavior; the
WM-23 visual regression checks live in their own file.

---

## Self-Review

### Senior Engineer

#### RESOLVED: Inner-IconButton width inside the shared Fireline+Helitack container conflicts with `.iconButton { width: 100% }`

**Resolution**: Added an "Inner IconButton width inside the shared
container" paragraph to the Layout step's implementation notes,
locking in a `.fireLineHelitack .iconButton { width: 65px }` override
(with the flex alternative mentioned for completeness) and noting why
the Reload+Restart precedent doesn't hit this issue.

**Original finding**:

Under Option 1 (single outer container), the two IconButtons sit as
siblings inside one `.fireLineHelitack` widgetGroup that's 130 px wide
(content area inside the 132 px outer border). But the shared
`.iconButton` rule at
[icon-button.scss:3-7](../../src/components/icon-button.scss#L3-L7)
sets `width: 100%` on each MUI Button. Two siblings each trying to
fill 100% of a 130 px container will either overflow or stack,
depending on the parent's display mode and the MUI Button's
inline-flex defaults. The Layout step doesn't address how each inner
IconButton gets constrained to 65 px.

Compounding: the existing Reload+Restart case avoids this entirely
because the inner `.playbackButton` rule
([bottom-bar.scss:134-135](../../src/components/bottom-bar.scss#L134-L135))
uses `min-width: 60px` with no `width: 100%` — different baseline
constraints than `.iconButton`.

Suggested resolution: add a paragraph to the Layout step's
implementation notes specifying that the shared Fireline+Helitack
container constrains each inner IconButton to 65 px width (via either
a flex layout with `flex: 0 0 65px` on the children, or an explicit
`.fireLineHelitack .iconButton { width: 65px }` rule that overrides
the base 100% rule).

---

#### RESOLVED: "Remove the per-widget outer borders on the inner buttons" note misdescribes the IconButton case

**Resolution**: Rewrote the shared-border-mechanism note in the Layout
step to spell out the actual JSX restructure (replace two widgetGroup
wrappers with one), drop the misleading "remove per-widget outer
borders" phrasing (IconButtons never had borders), and contrast with
the Reload+Restart precedent (which legitimately needs inner
corner-radius rules because the inner buttons render with their own
chrome).

**Original finding**:

The Layout step's shared-border-mechanism note says: *"wrap both
IconButtons in a single outer widgetGroup with a new modifier class
(e.g. .fireLineHelitack), and remove the per-widget outer borders on
the inner buttons."* But IconButtons don't have outer borders today
— the border lives on the `.widgetGroup` wrapper, not on the inner
MUI Button. The actual structural change for Option 1 is simpler than
this note implies: just consolidate two `<div className={widgetGroup}>`
wrappers into one with a `.fireLineHelitack` modifier.

By contrast, Reload+Restart genuinely had inner-button border
suppression to manage because both buttons render with MUI's default
chrome (the `.playbackButton:first-child` / `:last-child` rules set
the outer corner radii, leaving inner corners at 0).

Suggested resolution: rewrite the note to accurately describe the
IconButton case (consolidate two widgetGroup wrappers into one; no
inner-border suppression needed since IconButtons have none to
begin with), and contrast briefly with the Reload+Restart precedent
so the asymmetry is documented.

---

### QA Engineer

#### RESOLVED: Playwright fullscreen test hook needs a documented wait pattern for `__bottomBarRef`

**Resolution**: Extended the Playwright walkthrough's "Fullscreen icon
variants" sub-bullet with an explicit `browser_wait_for` against
`() => !!(window as any).test.__bottomBarRef` before the first
`setFullscreenIconState` call, mirroring the existing `sim.dataReady`
wait pattern in the state-machine spec.

**Original finding**:

The Playwright fullscreen-variant test calls
`window.test.setFullscreenIconState(boolean)`, which internally calls
`window.test.__bottomBarRef.setState({fullscreen: value})`. The ref
is set in `BottomBar.componentDidMount` (or via a callback ref on
the rendered element). Between `browser_navigate` and the first
`setFullscreenIconState` call, the test must wait for
`__bottomBarRef` to exist — otherwise the call throws on
`undefined.setState`. The Playwright step doesn't specify this wait
pattern, leaving a flake source the implementer might miss.

Suggested resolution: add one sentence to the Playwright walkthrough
step (under fullscreen-icon variants) noting the explicit wait:
`await page.waitForFunction(() => (window as any).test.__bottomBarRef)`
or the MCP equivalent (e.g., `browser_wait_for` against a JS
predicate). Mirrors the existing `cy.window().its("sim.dataReady")`
pattern in the state-machine spec
([cypress/e2e/bottom-bar-state-machine.cy.ts:86-91](../../cypress/e2e/bottom-bar-state-machine.cy.ts#L86-L91)).

---

### Frontend Engineer

#### RESOLVED: Margin overrides `.placeSpark` and `.startStop` need explicit removal in the Layout step

**Resolution**: Rewrote the "Margin overrides" implementation note in
the Layout step to enumerate all three overrides explicitly as
must-remove items (`.placeSpark`, `.startStop`, `.helitack`), with a
trailing sentence pointing at the base `.widgetGroup { margin-right }`
rule that provides the 10 px gap naturally.

**Original finding**:

Today
[bottom-bar.scss:79-92](../../src/components/bottom-bar.scss#L79-L92)
has three negative-margin overrides that collapse gaps to 0:
- `.placeSpark { margin-right: 0 }` — collapses Spark→Reload gap.
- `.startStop { margin-left: -$bottomBarWidgetGroupSpacing }` —
  collapses Restart→Start gap.
- `.helitack { margin-left: -$bottomBarWidgetGroupSpacing }` —
  collapses Fireline→Helitack gap.

The new spec wants a 10 px content-edge gap (8 px visible) at
Spark→Reload, Restart→Start, Start→Fireline, and Helitack→FIS
(adjacencies the Acceptance section's "Inter-widget gaps" bullet
asserts). The base `.widgetGroup { margin-right:
$bottomBarWidgetGroupSpacing }` rule provides this naturally, but
both `.placeSpark { margin-right: 0 }` and `.startStop { margin-left:
-... }` zero it out at the wrong points.

The Layout step's implementation notes call out `.helitack` as dead
code under Option 1 (correct), but don't mention that `.placeSpark`
and `.startStop` must also be removed for the 10 px gaps to
materialize. Without this fix, the Cypress / Playwright gap
assertions fail.

Suggested resolution: extend the Margin-overrides paragraph in the
Layout step to enumerate all three overrides: `.placeSpark` → remove;
`.startStop` → remove; `.helitack` → remove (now dead code under
Option 1). Plus the note that the base widgetGroup margin-right
provides the 10 px gap.

---

#### RESOLVED: FIS-hidden conditional mechanism and centering mechanism are left ambiguous

**Resolution**: Locked in (ii) `.fisHidden` modifier class on
`.bottomBar` for the conditional mechanism (avoids `:has()`
browser-matrix risk, follows existing project conditional-className
pattern) and (b) `margin: auto` on `.mainContainer` for centering
(works regardless of viewport, no flex spacers needed; the optional
supporting-evidence `justify-content: center` Playwright read is
explicitly fine to skip). Rewrote the implementation notes in the
FIS step to lock both in, matching the resolved-Open-Question
precedent.

**Original finding**:

The "Fire Intensity Scale: testid + FIS-hidden cluster centering"
step's implementation notes present each as "either-or":
- (i) `:has()` selector on `.mainContainer` vs. (ii) `.fisHidden`
  modifier class on `.bottomBar`.
- (a) `justify-content: center` on `.mainContainer` + symmetric flex
  spacers vs. (b) `margin: auto` on `.mainContainer` (flex
  auto-margins).

Other implementer-choice questions in this spec have been locked in
via the Open Questions section (shared-border mechanism, test-hook
mechanism, etc.). Leaving these two as "either-or" inside an
implementation-note paragraph creates ambiguity the implementer
has to resolve mid-implementation — and the Playwright supporting-
evidence check (`getComputedStyle(parent).justifyContent === 'center'`)
only fires if option (a) is chosen.

Suggested resolution: pick the recommended mechanism for each
(modifier class `.fisHidden` for the conditional; `margin: auto`
for centering, since it works regardless of viewport without the
flex-spacer complication and the supporting-evidence Playwright
read is explicitly marked optional) and rewrite the implementation
notes to lock them in, mirroring the pattern set by the resolved
Open Questions.

---

## Self-Review (Round 2)

### Reviewer / Implementer

#### RESOLVED: Stray duplicate Open-Question block at end of file

**Resolution**: Deleted the orphan block (a duplicate of the "Cypress
visuals spec — new file or append" RESOLVED Open Question) that had
been pasted after the Self-Review section's final `---` divider with
no role header. Document now terminates cleanly with the Round-1
"FIS-hidden conditional mechanism" resolution.

---

#### RESOLVED: Implementation Plan intro used dense semicolon-chained prose

**Resolution**: Replaced the semicolon-list intro with a numbered
list, one entry per step. Each entry names the step, summarizes its
scope, and (where applicable) notes which downstream step depends on
it. Step order is unchanged; only the rendering improved.

---

### Senior / Frontend Engineer

#### RESOLVED: Fullscreen "Test hook mechanism" note conflated `stores.ts` and `BottomBar`

**Resolution**: Rewrote the note as **two-sided wiring** — `stores.ts`
adds the helper (read side, with optional chaining for pre-mount
safety) and `BottomBar.componentDidMount` / `componentWillUnmount`
populate / clear the slot (write side). Spelled out that
`createTestHelpers(simulation)` runs at store-creation time and
therefore can't hold the ref itself, which is the misread the original
prose invited.

**Original finding**: The note read "Expose a ref ... from
`src/models/stores.ts` ... set from `BottomBar`'s `componentDidMount`".
But [stores.ts:34](../../src/models/stores.ts#L34) calls
`createTestHelpers(simulation)` before any React component renders, so
`stores.ts` cannot hold the ref. The two halves of the wiring needed
to be described separately so an implementer sees both the read-side
and the write-side changes.

---

#### RESOLVED: New modifier classes were introduced across three steps without a consolidated list

**Resolution**: Added a "New modifier classes introduced across this
and the next two steps" rollup at the top of the Layout step's
implementation notes, listing `.fireLineHelitack`,
`.fireIntensityScale`, and `.fisHidden` with a one-line description
and the step that introduces each. An implementer can now grep the
spec once to see the full set of new SCSS classes.

---

### QA Engineer

#### RESOLVED: Playwright walkthrough didn't dismiss the Terrain Setup dialog

**Resolution**: Added a "Dismiss the Terrain Setup dialog first"
sub-step under the default-layout `browser_navigate` step, referencing
the [CLAUDE.md](../../CLAUDE.md) "Spark count of `2` with a disabled
Spark button" guidance and naming the Next → Create walk. Notes that
width / gap / corner-radius reads are state-independent (could run
pre-dismissal), but dismissing once up front simplifies the rest of
the walkthrough's ordering.

**Original finding**: The Hover-opacity bullet hinted at the dismissal
for Spark but didn't elevate it to a step. The dialog auto-opens on
first load and disables Spark / Fireline / Helitack, so default-state
hover-opacity assertions on Setup/Spark and the FIS-hidden centering
check both ran against the wrong DOM until Next→Create dismissed it.

---

## Self-Review (Round 4)

Round 4 was a multi-role self-review pass focused on the implementation
spec text only (no requirements changes). Roles used: Senior Engineer,
Frontend Engineer, QA Engineer. (WCAG role omitted per the project's
"no a11y in scope" policy.) Five issues found, all resolved by
best-recommendation fixes applied in place.

### Frontend Engineer

#### RESOLVED: `.fireLineHelitack .iconButton { width: 65px }` selector won't match the actual DOM class (cross-module CSS-modules hashing)

**Resolution**: Rewrote the Inner-IconButton-width paragraph in the
Layout step to use the tag selector `.fireLineHelitack button { width:
65px }` instead of the class selector `.fireLineHelitack .iconButton`,
with a short explanation of the cross-module hashing issue and a
pointer to the existing `.terrainButton button svg` precedent at
[bottom-bar.scss:108-111](../../src/components/bottom-bar.scss#L108-L111).

**Original finding**: `.iconButton` is defined in
[icon-button.scss](../../src/components/icon-button.scss) and gets
hashed to `icon-button--iconButton--__wildfire-v1__` at build time.
Writing `.iconButton` inside `bottom-bar.scss` would compile to
`bottom-bar--iconButton--__wildfire-v1__`: a different, non-existent
class. The selector would match nothing in the rendered DOM, the
`width: 65px` override would not apply, and each MUI Button would
keep the base `width: 100%` rule, causing the two inner buttons to
overflow or stack inside the 130 px content area.

The codebase already solves this problem at
[bottom-bar.scss:100-112](../../src/components/bottom-bar.scss#L100-L112)
where `.terrainButton` overrides the same `width: 100%` rule using
the tag selector `button svg`. That's the established cross-module
pattern. The fix here is the same: use `button` (the tag MUI Button
renders) instead of `.iconButton` (the class hashed in a different
file).

---

### Senior Engineer

#### RESOLVED: `__bottomBarRef = this` write-side belonged outside the `screenfull?.isEnabled` guard, and the ref-slot type would create a circular import

**Resolution**: Updated the Step 5 test-hook two-sided wiring
paragraph to (a) initialize `__bottomBarRef: null as any` in the
returned helpers object (avoiding an import of `BottomBar` into
`stores.ts`, which would create a circular dependency via
[base.ts](../../src/components/base.ts)) and (b) place the
`(window as any).test.__bottomBarRef = this` assignment **outside**
the existing `if (screenfull?.isEnabled)` guard at
[bottom-bar.tsx:89-93](../../src/components/bottom-bar.tsx#L89-L93)
so headless browsers (where `screenfull` is gated off) still get
the test hook wired.

**Original finding**: Round 3's two-sided wiring note said "set
`(window as any).test.__bottomBarRef = this` alongside the existing
`screenfull` listener registration". "Alongside" is ambiguous, and
the existing pattern is a guarded if-block. Placing the ref
assignment inside the guard would silently break the Playwright
fullscreen-variant walkthrough in any browser where `screenfull` is
gated (which is the whole reason the test hook exists in the first
place: `screenfull.request()` is gated in headless browsers, per
the Acceptance section of `requirements.md`).

Compounding: the ref slot's TypeScript type was unspecified, leaving
the implementer to choose. The natural choice (`BottomBar | null`)
requires importing `BottomBar` into `stores.ts`, but
[base.ts](../../src/components/base.ts) (BottomBar's superclass)
imports `IStores` from `stores.ts`, so the import is circular.
`any` (or `unknown` with a type assertion at the call site) sidesteps
the cycle, matches the existing `(window as any)` convention used
throughout `createTestHelpers`, and keeps the helper code
implementation-coupling-free.

---

### Frontend Engineer

#### RESOLVED: `.fisHidden` JSX wiring was described prose-only

**Resolution**: Added a concrete before/after JSX snippet to the
FIS-hidden step's "Conditional mechanism" implementation note,
showing the exact className expression at
[bottom-bar.tsx:104](../../src/components/bottom-bar.tsx#L104). Also
noted that `simulation` is already destructured from `this.stores`
in the render method at
[bottom-bar.tsx:102](../../src/components/bottom-bar.tsx#L102), so
no new accessor is needed, and that `@observer` ensures the
className recomputes if the config value ever becomes runtime-mutable.

**Original finding**: Round 1 (Frontend Engineer) locked in the
`.fisHidden` modifier-class mechanism but the resolution text only
described it in prose ("applied conditionally in the JSX based on
`!simulation.config.showBurnIndex`"). An implementer reading that
could plausibly land on the wrong target element or pick a different
conditional-className idiom than the project uses. The
`fullscreenIconStyle` getter precedent at
[bottom-bar.tsx:58-60](../../src/components/bottom-bar.tsx#L58-L60)
uses template-string concatenation, so the JSX site should too for
consistency: a concrete snippet removes the implementer's guesswork.

---

### Senior Engineer

#### RESOLVED: Implementation Plan intro said "each step ships as a discrete commit" but Step 7 explicitly commits zero code

**Resolution**: Rewrote the Implementation Plan intro to say steps
1-6 each ship as a discrete commit and step 7 is verification-only
(no commit; produces Playwright screenshots attached to the PR
description and walks the eyeball checklist). Preserves the
"forward-only dependencies" sentence unchanged.

**Original finding**: The intro asserts every step ships as a
discrete commit. Step 7's body says "No code commits: this step
produces reviewable PR artifacts" and "Estimated diff size: 0 lines
committed." Internally contradictory: a reader who treats the intro
as the rule could expect a committable artifact for step 7 and
either invent one (e.g. commit screenshots into `tmp/playwright/`,
which is gitignored per CLAUDE.md) or treat step 7 as optional/
skippable. Both readings are wrong: step 7 is the verification gate,
not a commit gate, and its output lives on the PR description, not
in the repo.

---

### QA Engineer

#### RESOLVED: Step 6 (Cypress visuals spec) estimated 250 lines new code but provided no skeleton

**Resolution**: Added a code skeleton to Step 6's implementation
notes showing the project's preamble pattern (`cy.viewport`,
`cy.visit(APP_URL)`, `cy.window().its("sim.dataReady")` mirrored from
[cypress/e2e/bottom-bar-state-machine.cy.ts:86-91](../../cypress/e2e/bottom-bar-state-machine.cy.ts#L86-L91)),
a `widgetRect(testid)` helper encoding the
`.closest('[class*="widgetGroup"]')` rect-pivot pattern, and four
example `it(...)` blocks demonstrating per-widget widths, paired
bounding-box widths, default-state highlight opacity, and the
Fireline label check. Skeleton stops short of the full 250-line spec
(inter-widget gaps, fullscreen container measurements, and the
remaining per-widget assertions are noted in a trailing comment as
"see requirements.md Acceptance") so the example stays scannable
while still anchoring all the patterns the implementer needs.

**Original finding**: The implementation-spec template asks for
"full implementation code" per step (or "tests may be summarized
but include required stubs/harnesses"). Step 6 was a new-file step
with the largest line estimate of any step and zero example code:
the implementer was left to derive the harness structure, the
selector patterns, and the rect-pivot idiom from the requirements'
prose alone. Even one beforeEach + three example `it`s removes most
of that ambiguity.

---

## Self-Review (Round 3)

Round 3 was a multi-role self-review pass focused on the implementation
spec text only (no requirements changes). Five issues found, all
resolved by best-recommendation fixes applied in place.

### Senior Engineer

#### RESOLVED: `margin: auto` "or equivalently" claim in the centering mechanism was technically wrong

**Resolution**: Changed the FIS-hidden centering note to specify
`margin: 0 auto` (with the four-side expansion spelled out
explicitly) and a short rationale: the bare `margin: auto`
shorthand also sets vertical auto-margins, which under
`display: flex` triggers cross-axis auto-margin behavior and
can shift the cluster vertically depending on the parent's
`align-items` value. The `0 auto` form keeps vertical
placement unchanged.

**Original finding**: The FIS-hidden centering note said
*"set `margin: auto` (or equivalently `margin-left: auto; margin-right: auto`)
on `.mainContainer`."* The two forms are not equivalent:
`margin: auto` is the four-side shorthand
(top + right + bottom + left = auto), not just the horizontal
pair. Inside a flex container, vertical auto-margins activate
cross-axis auto-margin behavior. An implementer following the
"either is fine" claim could ship a build with subtle
vertical drift that the load-bearing pixel-symmetry assertion
(horizontal only) wouldn't catch.

---

#### RESOLVED: Inner IconButton width inside the shared container left an unlocked either-or

**Resolution**: Dropped the *"(Alternative: set the outer
container to `display: flex` and add `flex: 0 0 65px` on the
inner buttons; either passes the Acceptance bounding-box
check.)"* parenthetical. The width-override form
(`.fireLineHelitack .iconButton { width: 65px }`) is locked in
with a one-sentence justification: it changes the minimum
number of rules (parent display mode untouched, only the
inner-button width gets a per-pair override).

**Original finding**: Round 1 added the inner-width note to
fix the ambiguity, but kept a flex-based alternative as a
parenthetical. That's exactly the kind of "implementer chooses
mid-implementation" ambiguity Round 1's FIS-hidden mechanism
review already locked down for centering. Same fix applied
here: pick one mechanism, name the reason, drop the
alternative.

---

#### RESOLVED: Fullscreen top margin was left as "5 or 6" instead of locked

**Resolution**: Locked in `margin-top: 6` with a short
rationale: the 11 px vertical slack divides as 6 above + 5
below, which is the closer of the two integer values to the
mathematical center of 5.5. Both 5 and 6 pass the Acceptance
section's ±1 px tolerance, but the requirements spec
deliberately defers the integer pick to the implementation
spec ("the exact pixel is implementer's call between 5 and
6"). Picking one here removes the deferral.

**Original finding**: Step 5's Files-affected entry said
*"margin-top 5 or 6"*. The requirements spec authorized
either, but the implementation spec is the place to lock the
integer. Leaving "5 or 6" pushes the decision to PR review.

---

### Frontend Engineer

#### RESOLVED: SCSS "After" diff used flat descendant selectors while the existing file uses nested rule blocks

**Resolution**: Rewrote Step 1's After diff to use the nested
form (`&:not(.disabled) { &:hover .iconButtonHighlightSvg
{ ... } &:active ... { ... } }`), matching the file's
existing `&:hover { .iconButtonHighlightSvg { opacity: 1 } }`
pattern at
[icon-button.scss:21-25](../../src/components/icon-button.scss#L21-L25)
that the new rule replaces. Added a comment noting the
nesting choice ties back to the file's style.

**Original finding**: The After diff used flat selectors
(`&:not(.disabled):hover .iconButtonHighlightSvg { opacity: 0.5 }`)
while the rest of the file uses nested rule blocks. Both
compile to the same CSS, but the style mismatch creates
incidental diff noise in code review and signals "the rest of
this file's conventions weren't checked." Cheap fix: match
the existing style.

---

#### RESOLVED: Corner-radii note contradicted itself on inner-facing top corners

**Resolution**: Split the corner-radii note into two
sub-bullets, one per paired group, with the rule each pair
follows:
- **Fireline+Helitack** (new pair, IconButtons): no explicit
  inner-corner reset needed because the inner buttons have no
  border, no chrome, and no corner-radius rules of their own.
- **Reload+Restart** (existing pair, no WM-23 changes):
  inner `.playbackButton` MUI Buttons have their own
  corner-radius rules, but those rules were already set
  pre-WM-23 and aren't touched by this ticket.

**Original finding**: The original note said the inner
borderless buttons *"need explicit `border-top-left-radius: 0`
/ `border-top-right-radius: 0` on their inner-facing
corners"* in one sentence and *"the inner-facing corners
default to 0 already"* in the next, leaving the implementer
guessing which to follow. The contradiction came from
conflating the Fireline+Helitack and Reload+Restart cases:
the first needs no rules (no chrome to flatten), the second
already has the rules (pre-WM-23). Splitting per-pair makes
both true without contradiction.

---

## Self-Review (Round 5)

Round 5 was a multi-role self-review pass focused on the implementation
spec text only (no requirements changes). Roles used: Senior Engineer,
Frontend Engineer, QA Engineer, Build/Webpack Engineer. (WCAG role
omitted per the project's "no a11y in scope" policy.) Four issues
found, all resolved by best-recommendation fixes applied in place.

### QA Engineer

#### RESOLVED: Step 7's wait pattern misnamed `browser_wait_for` for a JS predicate

**Resolution**: Rewrote the "Fullscreen icon variants" sub-bullet of the
Playwright walkthrough. Replaced *"`browser_wait_for` against `() => !!(window as any).test.__bottomBarRef`
(or the `browser_evaluate` polling equivalent)"* with an explicit
description of the actual MCP semantics (`browser_wait_for` waits for
text or a timeout, not a JS predicate) and a concrete polling pattern
using `browser_evaluate` reads, plus a one-line note that the ref is
usually populated by the time `browser_navigate` resolves so a single
post-navigate read typically finds it set — the explicit poll is
defensive.

**Original finding**: Round 2 (QA) added a wait-pattern note here to
close a flake source, but worded it as if `browser_wait_for` could take
a JS predicate. The actual MCP `browser_wait_for` tool waits for text
to appear/disappear or for a timeout to elapse — passing a function or
predicate is not supported. An implementer following the original
prose literally would write an unrunnable call, then either grep the
MCP docs and improvise (and miss the existing parenthetical pointing
at `browser_evaluate`) or skip the wait entirely and reintroduce the
flake Round 2 was trying to prevent.

---

### Senior Engineer

#### RESOLVED: Step 5 Files-affected for `bottom-bar.tsx` still optionalized the test-hook mechanism

**Resolution**: Rewrote the `src/components/bottom-bar.tsx` bullet in
Step 5's Files-affected list to lock in the instance-ref mechanism per
the RESOLVED Open Question (set `(window as any).test.__bottomBarRef =
this` in `componentDidMount`, clear in `componentWillUnmount`, both
outside the `screenfull?.isEnabled` guard) and to note that no JSX
wiring is needed (the JSX already reads `this.state.fullscreen` and
applies the hashed `.fullscreen` modifier class today). Points forward
to the Implementation notes for the two-sided wiring writeup.

**Original finding**: The Files-affected bullet said *"wire whatever
mechanism `setFullscreenIconState` calls into the
`BottomBar.state.fullscreen` value (instance ref accessor, MobX store,
etc.)"*. The "etc." optionalizes a decision the RESOLVED Open Question
("Fullscreen test-hook mechanism — instance ref or UIModel hoist?")
already locked in: Option A, instance ref. Leaving the Files-affected
line ambiguous undoes the lock-in for any implementer who reads
Files-affected without scrolling down to the Open Questions. Same
pattern Round 1 already applied to the FIS-hidden conditional and
centering mechanisms; same fix applied here.

---

### Frontend Engineer

#### RESOLVED: Inner-IconButton-width note inverted the causation between container width and inner button width

**Resolution**: Rewrote the "Inner IconButton width inside the shared
container" paragraph in Step 3's implementation notes. The original
said *"Two IconButtons as siblings inside the 130 px-wide
`.fireLineHelitack` container cannot both honor 100%"*, which implies
the container is 130 px first and then constrains the children — but
`.widgetGroup` has no explicit width rule, so the container actually
shrink-wraps to whatever the inner buttons size to. The rewrite
spells out the actual chain: today's per-widget wrappers shrink-wrap
their single inner button; under Option 1 the shared container holds
two `width: 100%` siblings with no fixed parent width (circular
sizing); the `.fireLineHelitack button { width: 65px }` override
gives each child an explicit width, and the container then
shrink-wraps to 130 px content (132 px outer border).

**Original finding**: The original phrasing didn't just have a
cosmetic ordering issue — it described a mechanism that doesn't
exist. There's no rule giving `.fireLineHelitack` a 130 px width;
the container is sized by its children. An implementer who took the
original prose at face value might add a `.fireLineHelitack { width:
130px }` rule (which would work, but is redundant with the per-button
override and adds an extra source of truth for the 130 px constant).
Worse, an implementer trying to debug a layout failure would chase
the wrong cause first. The corrected explanation matches what the
rendered DOM actually does.

---

#### RESOLVED: Step 1 "After" SCSS still used partial-nested form where the file's style is fully-nested rule blocks

**Resolution**: Rewrote the Step 1 "After" diff to use fully-nested
rule blocks (`&:hover { .iconButtonHighlightSvg { opacity: 0.5 } }`)
instead of the partial-nested descendant form (`&:hover
.iconButtonHighlightSvg { opacity: 0.5 }`). The fully-nested form
exactly matches the file's existing `&:hover { .iconButtonHighlightSvg
{ opacity: 1 } }` block at
[icon-button.scss:21-25](../../src/components/icon-button.scss#L21-L25)
that this rule replaces.

**Original finding**: Round 3 (Frontend Engineer) flagged that the
original "After" diff used flat selectors (`&:not(.disabled):hover
.iconButtonHighlightSvg { opacity: 0.5 }`) while the rest of the file
uses nested rule blocks. The Round 3 fix wrapped the rules in a
`&:not(.disabled) { ... }` block, which addressed the disabled-guard
nesting but left each `:hover` / `:active` rule as a partial-nested
descendant selector instead of expanding it into its own nested rule
block. Both compile to identical CSS, but the partial form still
diverges from the file's prevailing style — same incidental
diff-noise / "didn't check the file's conventions" signal Round 3
flagged. Finishing the migration to fully-nested closes the gap.

---

## Self-Review (Round 6)

Round 6 was a multi-role self-review pass focused on the implementation
spec text only (no requirements changes). Roles used: Senior Engineer,
Frontend Engineer, QA Engineer, Documentation Reviewer. (WCAG role
omitted per the project's "no a11y in scope" policy.) Four issues
found, all resolved by best-recommendation fixes applied in place. A
fifth observation (Self-Review sections out of numerical order: Round
4 appears before Round 3) was logged but deliberately not fixed: the
content of both rounds is correct and self-contained, and the
~150-line swap to reorder them is pure cosmetic cleanup with non-
trivial edit risk for no correctness gain.

### Frontend Engineer

#### RESOLVED: Step 1 "After" SCSS block carried 8 lines of inline comment for a 12-line rule

**Resolution**: Trimmed the inline comment in Step 1's SCSS "After"
block from 8 lines to 3 lines. Kept the one non-obvious WHY (the
`.disabled` className convention vs. `:disabled` pseudo, with pointers
to the existing references at [icon-button.scss:34](../../src/components/icon-button.scss#L34)
and [icon-button.tsx:17](../../src/components/icon-button.tsx#L17))
and dropped the redundant items: MUI v5 disabled-behavior explainer
(speculative future-proofing), nested-form style match (visible from
the code itself), and the `:hover-block` line-number reference
(brittle, and the file's style is visible to anyone reading the file).

**Original finding**: The CLAUDE.md guidance is "default to writing no
comments. Only add one when the WHY is non-obvious." The Step 1
"After" block carried 8 lines of inline comment on a 12-line rule:
more than half explanatory text. The actually-non-obvious WHY is the
choice of `.disabled` className over `:disabled` pseudo (the project
ships its own className convention); everything else is either
already-visible-from-the-code or speculation about hypothetical future
MUI changes. Cut to the actually-non-obvious WHY.

---

### Senior Engineer

#### RESOLVED: Step 3 Files-affected listed unedited asset paths

**Resolution**: Removed the `src/assets/bottom-bar/fire-line*.svg,
helitack*.svg` bullet from Step 3's Files-affected list and moved
the verification reminder into a new "Asset re-verification" sub-point
at the top of the Implementation notes. Files-affected should
enumerate only files the step edits; the verification reminder still
lives in the spec, just in the right section.

**Original finding**: Step 3's Files-affected bullet for the asset
SVGs said "(no edits, but their rendered widths inside the new 65 px
Fireline / 65 px Helitack containers should be re-verified after the
change)". Listing files in Files-affected that aren't edited creates
a misleading review surface: a PR reviewer scanning the spec for
"what changes" sees four asset paths that don't actually change, and
might assume the SVGs are being modified.

---

### Documentation Reviewer

#### RESOLVED: Step 3 rollup heading overcounted the SCSS-class span

**Resolution**: Changed Step 3's rollup heading from "New modifier
classes introduced across this and the next two steps" to "New
modifier classes introduced across this and the next step". The
rollup enumerates three classes (`.fireLineHelitack` and
`.fireIntensityScale` in Step 3; `.fisHidden` in Step 4). Step 5
(fullscreen) modifies `.fullscreenIcon` rules but introduces no new
modifier class, so the span is two steps, not three.

**Original finding**: The "this and the next two steps" phrasing
implies an implementer should expect a new SCSS modifier class in
Step 5. There isn't one: Step 5 reworks existing `.fullscreenIcon`
rules and adds a test hook, neither of which introduces a new
modifier. An implementer reading the rollup might search Step 5 for
a class that isn't there.

---

#### RESOLVED: Same-file anchor links unnecessarily prefixed with `implementation.md`

**Resolution**: Reworded the two cross-references inside
`implementation.md` that point at the Open Questions section later in
the same file. Replaced `[implementation.md Open Questions](#resolved-...)`
with `[the Open Question below](#resolved-...)` at both Step 3 (line
~210) and Step 5 (line ~458). The anchor target is unchanged; only
the link text dropped the redundant filename.

**Original finding**: Two same-file references used the form
`[implementation.md Open Questions](#anchor)`. The link works, but the
`implementation.md` text is misleading: a reader hovering the link
expects navigation to a different file. The convention elsewhere in
this spec and in the requirements spec is bare anchor text for same-
file refs.

---
