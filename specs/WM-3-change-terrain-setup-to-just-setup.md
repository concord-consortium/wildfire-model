# Rename "Terrain Setup" UI Label to "Setup"

**Jira**: https://concord-consortium.atlassian.net/browse/WM-3

**Status**: **Closed**

## Overview

Rename the user-facing "Terrain Setup" label to "Setup" everywhere it appears in the UI —
the bottom-bar button, the setup wizard's header, and one sentence in the About dialog — and
resize the bottom-bar button to the Zeplin design (82px wide with a 62px icon). This aligns
the app with how the Hazbot behavior-based help overlays (epic AP-80) refer to this control,
so the help text matches what students see.

## Requirements

- The bottom-bar button caption changes from "Terrain Setup" to "Setup"
  ([bottom-bar.tsx:106](../src/components/bottom-bar.tsx#L106)).
- The setup wizard header text changes from "Terrain Setup" to "Setup"
  ([terrain-panel.tsx:196](../src/components/terrain-panel.tsx#L196)). The wizard has a single
  persistent header across all three steps, so this one element is "all instances".
- The About-dialog prose changes from "Use the Terrain Setup window to set..." to "Use the
  Setup window to set..." ([about-dialog-content.tsx:13](../src/components/top-bar/about-dialog-content.tsx#L13)).
- The bottom-bar Setup button is resized from its hardcoded `width: 100px` to the **82px**
  specified by the WM-3 Zeplin design
  ([bottom-bar.scss:100-103](../src/components/bottom-bar.scss#L100-L103)).
- A terrain-button-scoped rule is added to [bottom-bar.scss](../src/components/bottom-bar.scss)
  constraining the button's icon SVG to the design's **62px** width, centered with 10px
  padding on each side, so the icon is no longer stretched to the full button width. The
  override is scoped to the Setup button and does not touch the shared `icon-button.scss` —
  the Spark / Fire Line / Helitack buttons are unaffected.
- No behavior, icon-artwork, `data-testid`, or `data-name` changes — visible text plus the
  button-width / icon-sizing CSS adjustments only.
- Cypress assertions on the literal "Terrain Setup" text are updated so the suite still passes:
  - [smoke.cy.ts:17](../cypress/e2e/smoke.cy.ts#L17) — `headerText` constant.
  - [terrairn-setup.cy.ts:20](../cypress/e2e/terrairn-setup.cy.ts#L20) and
    [terrairn-setup.cy.ts:45](../cypress/e2e/terrairn-setup.cy.ts#L45) — `.contain("Terrain Setup")` assertions.

## Technical Notes

- **Styling changes are confined to the bottom-bar Setup button.** The wizard header and the
  About-dialog prose absorb the shorter string with no layout change. The bottom-bar button
  changes are: `.terrainButton` width `100px → 82px`, plus a terrain-scoped rule pinning the
  icon SVG to 62px centered (10px padding each side). Both live in `bottom-bar.scss`; the
  shared `icon-button.scss` is left untouched.
- **Test IDs are stable.** `data-testid="terrain-button"` and `data-testid="terrain-header"`
  do not contain the visible text and are unaffected.
- **SVG asset metadata is separate.** The bottom-bar icon SVGs
  ([src/assets/bottom-bar/terrain-setup.svg](../src/assets/bottom-bar/terrain-setup.svg),
  `terrain-three.svg`, etc.) contain `<title>` and `data-name="Terrain Setup"` /
  `data-name="3-zone Terrain Setup"` attributes. Cypress tests
  ([terrairn-setup.cy.ts](../cypress/e2e/terrairn-setup.cy.ts),
  [TerrainSetup.js](../cypress/support/elements/TerrainSetup.js)) select zone-count thumbnails
  via those `data-name` values. These are not the user-visible button caption — leaving the
  SVGs untouched keeps those selectors working.
- **Code comments** in [config.ts](../src/config.ts) (lines 20, 68, 70, 118) say "Terrain
  Setup dialog". Comments only; left unchanged.
- Jest component tests ([terrain-panel.test.tsx](../src/components/terrain-panel.test.tsx),
  [bottom-bar.test.tsx](../src/components/bottom-bar.test.tsx)) reference the controls by
  `data-testid`, not by text, so they need no changes.
- **Design reference (Zeplin).** The WM-3 design — Zeplin screen "Hazbot Coach Mark Wildfire
  Overlay" (project `5fe47ae231d1f6a428c53450`, screen `69b2baa489a2e2f3308238b8`) — specifies
  the "Setup Control": overall control **82 × 74**, white fill, 9px corner radius; the "2-Zone
  Setup ICON" at **62 × 44** inset 10px from the left and 5px from the top (10px padding on
  each side within the 82px control); and the "Setup" caption in **Lato Bold 14px, color
  `#434343`, centered**. Two reference screenshots are also attached to WM-3
  (`image-20260506-043328.png`, `image-20260506-043347.png`).

## Out of Scope

- Renaming SVG asset files or editing their internal `<title>`/`data-name` metadata, and
  updating the `config.ts` code comments (non-visible references left unchanged).
- Changing `data-testid` / `dataTest` identifiers (`terrain-button`, `terrain-header`).
- Any change to wizard behavior, step flow, layout, or styling (only the bottom-bar Setup
  button is restyled).
- The Hazbot/help-overlay content itself (separate epic AP-80 work).
