# Setup wizard: replace the X with a Cancel button

**Jira**: https://concord-consortium.atlassian.net/browse/WM-42
**Repo**: https://github.com/concord-consortium/wildfire-model
**Implementation Spec**: [implementation.md](implementation.md)
**Status**: **In Development**

## Overview

Remove the X from the Setup wizard, put a Cancel button in each panel's footer, and lock the bottom bar's model controls while the wizard is open, so that leaving the wizard without saving is a deliberate, labeled action rather than a corner click, and students are pushed through Next to the wind panel instead of dismissing the wizard before they reach it.

## Project Owner Overview

ISLAND workshop participants were frustrated that closing the Setup window without clicking Create lost everything they had set up. They expected their zone work to persist even though they never reached the last panel. Trudi's first direction (2026-08-03) was to add a Cancel button and confirm the changes when the student Xed out; on 2026-08-18 she and Michael replaced that with a simpler design: get rid of the X entirely and put a Cancel button at the bottom of the wizard, with no confirmation on cancel.

The simpler design fixes the frustration in two ways. A control labeled "Cancel" sitting next to Next and Create says plainly that leaving this way discards the work, which the X never did. And with the X gone and the bottom bar's model controls locked while the wizard is open, Cancel and Next become the only ways out, so a student reaches the wind panel instead of skipping it.

Locking the bar is an addition to the original design, made on 2026-08-22 (see the resolved open question on dismissal paths), because measurement showed the Cancel button on its own would not deliver that second benefit. Setup, Spark and Start each closed the wizard silently and discarded everything, so a student could still leave from panel 1 without ever seeing the wind panel, which is the exact outcome Trudi's 2026-08-18 comment gives as the reason for the design. Locking the bar makes the wizard behave as the modal it already looks like, and it is cheaper than it sounds: four predicates, because the other three model controls are already unreachable in that state. This is a visible change neither Trudi nor Michael has seen, so it is called out in Delivery Notes below.

Saving semantics do not change: settings apply when the student clicks Create on the last panel, and at no point before that.

## Background

Today the wizard's only explicit dismissal is a 24px X button at the top right of the panel (`terrain-panel.tsx`, `handleClose`). It flips `ui.showTerrainUI` and logs `TerrainPanelClosed`. It does not touch the simulation, so every edit the student made in the wizard is discarded. Create (`applyAndClose`) is the one path that commits: it diffs the open-time snapshot, sets `setupChanged` when something actually changed, then applies wind speed, wind direction, and zones.

The wizard is up to three panels: zone count (panel 0), per-zone conditions (panel 1), and wind (panel 2). Panel 0 only appears in the master model, where `config.zonesCount` is undefined; the WF module activities pin the count and open on panel 1. That is what Trudi means by "the zone count doesn't change except in the master model."

**The ticket's "No save until student has clicked Create on the last panel" bullet already describes current behavior.** This was verified against the running code rather than assumed (see Technical Notes). The bullet is therefore an invariant to protect with tests, not a behavior to build.

The design landed in the ticket description on 2026-08-19 with no artboard attached, but the artboard exists: the Zeplin screen **"Updated Wildfire Setup Panel and Terrain Textures"** carries the whole redesigned wizard, including a "Canel Button States" column (their typo) alongside the Panel and Create button states. Every dimension below comes from it.

The ticket is still pointed 2 for what is now a footer button, a teardown, and a bottom-bar lockout, and its title no longer describes the work. Repointing and retitling are worth raising when the story is picked up; neither changes the requirements below.

## Requirements

- The X button is removed from every Setup panel. No corner close control remains.
- Every Setup panel gets a **Cancel** button in its existing footer button container: panel 0 (Cancel, Next), panel 1 (Cancel, Next, becoming Cancel, Previous, Next only when panel 0 precedes it), panel 2 (Cancel, Previous, Create). Panel 1's Previous is already conditional on `firstPanel === 0` (`terrain-panel.tsx:319`), so the activities, which pin `config.zonesCount`, get the two-button form; only the master model sees three. Cancel itself is unconditional on all three panels.
- Cancel is the **leftmost** control in the footer, per the ticket's "displayed to the left of other button" and per every panel on the artboard.
- Cancel is **76 x 28 with a 5px radius and a 1px `#797979` border**, the same shell as Next, Previous, and Create ("all panel buttons are the same size"), with the label in Lato Bold 14px `#434343`, centered.
- Cancel's **default state has no fill**, which is the "different default styling" the ticket asks for: Next and Previous default to `#ffffff` and Create to `#aaffc2`. Its hover (`#dfdfdf`) and active (`#757575`, white label) match the other panel buttons exactly. Because the fill is absent rather than white, Cancel shows the panel body through it, so it renders a different color on each panel: `#dfdfdf` on the zone-count panel, the zone tint on the conditions panel (`#ffd8fa` for zone 1), and `#cbf6d7` on the wind panel. That is the artboard's intent, not an artifact: the board draws the fill-less Cancel on panels of exactly those three colors, matching the app panel for panel (see Technical Notes).
- One consequence of the fill-less default is accepted rather than designed around: on the **zone-count panel** Cancel's hover paints `#dfdfdf` over a panel whose background is already `#dfdfdf`, so hovering it changes nothing. Build it as the artboard draws it. The hover reads normally on the conditions and wind panels, and the zone-count panel is master-model-only, since the activities pin `config.zonesCount`. This goes to Michael with the branch link (see Delivery Notes).
- Footer buttons sit **8px apart**, not the 15px `.continueButton+.continueButton` uses today. The 8px applies to every footer pair, so the existing Previous/Next and Previous/Create pairs tighten as well.
- The footer stays a **centered group**: "leftmost" fixes Cancel's position in the button order, not its alignment against the panel edge. The panel has room either way (a three-button group is 244px at 8px gaps inside a 308px content box), so the 8px is the board's choice rather than a fit constraint.
- Cancel closes the wizard and applies nothing: zone count, per-zone conditions, wind speed, and wind direction all keep the values the simulation had when the wizard opened.
- **No confirmation dialog on Cancel,** and no zone-count warning either. Trudi's 2026-08-18 comment is explicit: *"If you press cancel, you don't need a confirmation of the changes."* The wizard has no confirm dialogs at all.
- Nothing the student does inside the wizard reaches the simulation until Create is clicked on the last panel. This includes changing the zone count and clicking Next, which today only rewrites local wizard state.
- Reopening the wizard after Cancel shows the simulation's current values, not the abandoned edits. The existing close-time reset effect already does this and must keep doing it.
- Cancel **assigns** `ui.showTerrainUI = false` rather than toggling it, and `applyAndClose` (`terrain-panel.tsx:104`) is changed from a toggle to an assignment in the same commit. With the Setup button no longer a toggle (below), that leaves every writer of the flag assigning.
- Cancel logs **`TerrainPanelClosed { reason: "cancel", changed: boolean, panel: "zones" | "conditions" | "wind", reachedWind: boolean }`**, keeping the event name the X used and marking the change in the payload. `panel` records which panel the student left **from**. It is a name rather than an index because the index is not the step number the student saw (`terrain-panel.tsx:250` renders `firstPanel === 0 ? currentPanel + 1 : currentPanel`). `changed` reuses `setupSnapshotDiffers` against `openSnapshotRef.current`, exactly as `applyAndClose` does. There is no ordering hazard against the `ui.showTerrainUI` assignment: the close-time reset is a `useEffect` that runs after the next render, while the handler reads `zones`, `windSpeed` and `windDirection` from its own render's closure (verified, see Technical Notes). The constraint that does bite is that Cancel calls none of the `simulation.*` mutators, so its diff has nothing to race. `LOGGED-EVENTS.md` gains both parameters and drops "via X button" from the description.
- `reachedWind` records whether the student ever got to the wind panel during this visit, which is the question Trudi's rationale is about and which **`panel` cannot answer**. The two diverge on two live paths: Previous walks a student back off the wind panel, and a zone info tile click does the same with no navigation event at all, since the tiles stay live while the wizard is open and writing `ui.terrainUISelectedZone` forces the wizard to panel 1 (`terrain-panel.tsx:53-57`, reproduced in the browser). So `panel: "conditions"` with `reachedWind: true` is a normal reading, and without the second field a student who saw the wind panel and walked back is indistinguishable from one who never advanced. It is a high-water mark held in a ref, raised on Next and reset with the rest of the wizard state when the panel closes, so a reopened wizard does not inherit the previous visit's reach.
- Reconstructing reach from the log stream instead is not an option: `TerrainPanelNextButtonClicked` and `TerrainPanelPreviousButtonClicked` carry no payload, so a replay needs `firstPanel`, which reaches the log only inside `SimulationStarted` and never fires for a student who abandons Setup; and the tile jump moves the panel with no navigation event, so the replay silently lands on the wrong panel (verified with a throwaway case).
- A test asserts every payload field against a case that can disagree with it: cancelling with an edit logs `changed: true`, cancelling an untouched wizard logs `changed: false`, cancels from all three panels pin all three `panel` values, and `reachedWind` is pinned both where it agrees with `panel` and on the two paths where it disagrees, plus once across a close-and-reopen so the reset is guarded. A fixture that returns the same value for every case cannot tell a real read from a hardcoded one, so the cases are separate.
- Cancel is the **leftmost** control in every footer, and that ordering is asserted rather than left to the visual pass: the four footer variants (zone-count, activity conditions, master-model conditions, wind) each pin their own button-label sequence.
- Removing the X removes everything it orphans: `src/assets/setup-close.svg` and the `.closeButton` / `.closeIcon` rules in `terrain-panel.scss`. `closeTerrainSetupComponent()` in `cypress/support/elements/TerrainSetup.js` goes too, but as a swap rather than a deletion: it becomes `getCancelButton()`, which the new Cancel-fill assertion uses. Census re-run across `src/` and `cypress/`: `setup-close.svg` has exactly one importer (`terrain-panel.tsx:18`); `.closeIcon` has one user (`terrain-panel.tsx:250`); `.closeButton` has two, `terrain-panel.tsx:245` and the Cypress page-object method, which reaches it through the compiled class name `.terrain-panel--closeButton--__wildfire-v1__` and has no callers of its own. The `closeButton` and `CloseIcon` in `top-bar/dialog.tsx` are unrelated: that file imports from `@mui/icons-material/Close`.
- Since this story rewrites `terrain-panel.tsx` anyway, the container's **literal `undefined` class is fixed** along the way: `panelClasses` is `[css.panel0, css.panel1, css.panel2]` but the SCSS defines only `.panel0` and `.panel2`, so the conditions panel renders `class="background zone1 undefined"`. Build the class list so the empty slot drops out instead of interpolating. Cosmetic, and independent of this story, so it can be split into its own commit; see Technical Notes for why no unit test can guard it.
- Cancel carries **`data-testid="terrain-cancel"`**, matching the `terrain-next` / `terrain-wind` naming the panel already uses, so the Cancel tests and any later tour anchor have a stable handle rather than matching on the label.
- The Hazbot tour anchors that live in this panel keep working: `terrain-panel-container`, `terrain-next`, `terrain-wind`. No tour anchors to the X.
- The no-commit invariant is pinned by **asserting the simulation's own values**, not just `setupChanged`: a test edits a zone's drought level (and, on the master-model path, the zone count), clicks Cancel, and asserts `simulation.zones[n].droughtLevel`, `simulation.zonesCount`, `simulation.wind.speed` and `simulation.wind.direction` all still hold their pre-open values, with `setupChanged` false. Asserting `setupChanged` alone cannot fail on a commit-on-close regression: mutation-tested on this branch, see Technical Notes.
- A test covers **reopen after Cancel**: edit, Cancel, reopen, and assert the controls show the simulation's values rather than the abandoned edits.

**Bottom bar while the wizard is open**

- While `ui.showTerrainUI` is true, none of the bottom bar's **model controls** acts: Setup, Spark, Reload, Start, Restart, Fire Line and Helitack are all inert. Cancel and Next/Create are the only ways out of the wizard.
- Four of those seven change, but only **three are disabled**: Spark, Reload and Start. Setup is the exception: it stays enabled and is made inert at its handler (below). Restart, Fire Line and Helitack all require `simulationStarted`, and the wizard can only be open before the run starts, so they are already disabled in that state (measured, see Technical Notes). Do not add a redundant guard to them.
- The **Setup button shows `selected`, not `disabled`**, while the wizard is open. It is the affordance that says the wizard is open, and greying it reads as a broken control. `IconButton` already takes a `selected` prop (`icon-button.tsx:12`), used today by Fire Line. Its click is inert regardless: the Setup button stops being a toggle and becomes open-only.
- The two props cannot be combined on this button. `IconButton` puts both class names on one element (`icon-button.tsx:19`) and `icon-button.scss:26` nests the `.selected` rule inside `&:not(.disabled)`, so passing `disabled` alongside `selected` makes `selected` a no-op and renders the button greyed and desaturated. Measured on the running app, see Technical Notes.
- `handleTerrain` **keeps logging `TerrainPanelButtonClicked` on every click**, including the clicks that no-op because the wizard is already open. The event stops meaning "opened or closed the wizard" and starts meaning "clicked the Setup button", which is deliberate: a student poking the lit Setup button is evidence about whether the `selected` treatment reads as "already open", and that signal is worth keeping now that the button no longer does anything. `LOGGED-EVENTS.md` line 45 is reworded to match, so no open-rate is ever computed from a raw count of this event.
- **Reload is included in the guard**, and it is the one case that is not a dismissal: `handleReload` never writes `ui.showTerrainUI`, so today it resets the simulation *underneath* an open wizard, leaving the student's local edits in the panel to be applied on Create over a model they did not reset from. Guarding it removes that state rather than defining behavior for it.
- The **zone info tiles stay live** as well. They sit above the bar rather than in it, they drop their click handler only on `simulationStarted` (`simulation-info.tsx:18`), and clicking one while the wizard is open does not close or discard anything: it writes `ui.terrainUISelectedZone`, which selects that zone and forces the wizard to panel 1 (`terrain-panel.tsx:53-57`). Cancel and Next/Create remain the only ways out. Whether that panel jump is wanted while the wizard is open is a design question, not a defect, and it goes to Trudi and Michael with the rest of the lockout (see Delivery Notes).
- The **Hazbot Analysis button and the fullscreen toggle stay live**. Both sit in the bar's `.rightContainer`; neither writes `ui.showTerrainUI`, neither discards wizard state, and neither is a way of leaving Setup. "Lock the bar" means the model controls in `.mainContainer`, not the region controls.
- Each of the three disabled predicates gets a test asserting the button is disabled while the wizard is open, and the Setup button gets two: it is not disabled while the wizard is open, and clicking it then leaves the wizard open. `bottom-bar.test.tsx:99-110`, "terrain button toggles the display of the terrain dialog", changes meaning and is rewritten: the Setup button opens the wizard and a second click no longer closes it.

## Technical Notes

**Files**

- `src/components/terrain-panel.tsx` - the whole change. It also carries one unrelated one-line fix, the `undefined` class (see below). `handleClose` (line 98) becomes Cancel's handler, the close `<button data-testid="terrain-panel-close">` (lines 243-251) and its `CloseIcon` import go away, and a Cancel button is added to the three `css.buttonContainer` blocks.
- `src/components/terrain-panel.scss` - `.closeButton` / `.closeIcon` (lines 56-78) get deleted; a Cancel style joins `.continueButton` (line 204) and `.createButton` (line 227). `.continueButton+.continueButton` (line 240) supplies the gap between footer buttons and changes from 15px to 8px.
- `src/assets/setup-close.svg` - orphaned once the X is gone, and the grep has been run: `terrain-panel.tsx:18` is its only importer anywhere in `src/` or `cypress/`. Delete it.
- `src/components/terrain-panel.test.tsx` - test (d), "change drought, close via X", is the only place `terrain-panel-close` is used outside the component itself. It moves to Cancel and gains simulation-value assertions.
- `src/components/bottom-bar.tsx` - the bar lockout. Three `disabled` predicates take `ui.showTerrainUI`: `sparkEnabled` (line 75), `reloadEnabled`'s consumer (line 168) and `startEnabled`'s consumer (line 186). The Setup button's `disabled` stays `!simulation.setupEnabled` (line 146) and gains `selected={ui.showTerrainUI}` instead; `handleTerrain` (line 386) stops toggling and becomes open-only.
- `src/components/bottom-bar.test.tsx` - the toggle test at lines 99-110 is rewritten, and the three disabled predicates plus the Setup button's two assertions get coverage.
- `LOGGED-EVENTS.md` - two lines stop being true. Line 46 describes `TerrainPanelClosed` as "User closes Terrain Setup via X button", and line 45 describes `TerrainPanelButtonClicked` as "User opens/closes Terrain Setup", which is now neither: the button opens the wizard, and clicking it while the wizard is already open logs without changing anything. Line 45 becomes "User clicks the Setup button: opens Terrain Setup, or no-ops when it is already open".

**Rider fix: the panel container renders a literal `undefined` class.** `panelClasses` is `[css.panel0, css.panel1, css.panel2]` but `terrain-panel.scss` defines only `.panel0` and `.panel2`, so on the conditions panel the template literal at `terrain-panel.tsx:240` interpolates `undefined` into `className`. Reproduced in the browser on `?preset=plainsTwoZone`: the container's class list reads `background zone1 undefined`. `.filter(Boolean).join(" ")` in place of the template literal is enough. Cosmetic only, because the zone tint comes from `.zone1/.zone2/.zone3` and the missing `.panel1` rule does not exist to be applied; a throwaway application of the fix left panel 1 at `rgb(255, 216, 250)` and panel 2 at `rgb(203, 246, 215)` with its `panel2` class intact.

**No unit test can guard it,** which is worth knowing before someone tries to write one. Jest maps SCSS through `identity-obj-proxy` (`package.json:30`), so `css.panel1` resolves to the string `"panel1"` and the bug cannot occur in jsdom at all. An assertion on the class list passes with the fix reverted, making it decoration. The bug is only observable through the real css-loader build, so a browser check is the verification. Independent of WM-42, so it can be split into its own commit if that reads cleaner.

**Verified behavior (throwaway component tests, run on this branch and then deleted)**

Four assumptions were checked against the real component rather than read off the source:

1. Selecting 3 zones on panel 0 and clicking Next leaves `simulation.zonesCount` at 2 and `simulation.zones.length` at 2. `applyZonesCountChange` rewrites local state only.
2. Clicking the X after that leaves the simulation untouched and `setupChanged` false.
3. Clicking through to Create commits: `simulation.zones.length` becomes 3 and `setupChanged` becomes true.
4. Rewriting `handleClose` to assign `ui.showTerrainUI = false` **first** and compute the `setupSnapshotDiffers` result **afterwards** logs `changed: true` for an edited wizard and `changed: false` for an untouched one, and leaves `simulation.zones[0].droughtLevel` at its pre-open value. The close-time reset is a `useEffect`, so it cannot reach the closure the handler is reading, and there is no diff-before-assign constraint to honor.

So Create is genuinely the only commit path, and Cancel can be `handleClose` under a new label.

**Mutation test: `setupChanged` alone is not a no-commit assertion.** Test (d) in `terrain-panel.test.tsx` changes a drought level, closes via the X, and asserts only `simulation.setupChanged === false`. Adding `simulation.updateZones(zones)` to `handleClose` (a throwaway edit on this branch, since reverted) commits the student's zone edits to the simulation and **leaves all 16 tests in the file green**, test (d) included, because `updateZones` never touches `setupChanged` (`simulation.ts:728-735`). The invariant test therefore has to read the simulation's own values back. Nothing today covers reopen-after-cancel either: test (h) covers snapshot refresh on the *Create* path only.

**`handleClose` toggles where Cancel should assign.** It is `ui.showTerrainUI = !ui.showTerrainUI`, correct today only because it is unreachable while the panel is closed. Of the six writers of that flag outside the panel, five assign: `bottom-bar.tsx:278, 366, 380, 394` assign `false`, and `simulation-info.tsx:37` assigns `true`. Only the Setup toggle at `bottom-bar.tsx:388` toggles, and with the bar lockout it stops needing to, becoming open-only. Inside the panel both `handleClose` (`:99`) and `applyAndClose` (`:104`) toggle; both become assignments, which is what makes "every writer assigns" true.

**What is actually reachable in the bar while the wizard is open.** Measured live (`plainsTwoZone`, 1280px, two sparks placed, pre-start), and this corrects an earlier "six exit paths" claim in this spec:

| Control | While the wizard is open | Effect |
|---|---|---|
| Setup | enabled | closes and discards; logs only `TerrainPanelButtonClicked`, never `TerrainPanelClosed` |
| Spark | enabled while sparks remain | closes and discards |
| Start | enabled once `ready` | closes and discards, and starts the run |
| Reload | enabled once a spark exists or `setupChanged` | **does not close the wizard**; resets the simulation under it |
| Restart, Fire Line, Helitack | always disabled | unreachable, see below |

**The wizard can only be open before the run starts,** which is why three of the seven controls need no guard. Both paths that open it are gated on that: the Setup button on `setupEnabled = !simulationStarted` (`simulation.ts:146`) and the zone-label path on `locked = simulationStarted` (`simulation-info.tsx:47`, which drops the click handler entirely when locked). `handleStart` closes the wizard on its way into the run. Restart, Fire Line and Helitack all require `simulationStarted`, so they can never be clicked with the wizard open, and Fire Line and Helitack are therefore not dismissal paths at all despite writing `ui.showTerrainUI = false`.

**The paths that do dismiss all discard identically,** through the one close-time reset effect (`terrain-panel.tsx:62-72`), which is keyed on `ui.showTerrainUI` going false. Verified end to end: opened Setup, selected Severe Drought, clicked Setup again to close, reopened, and the panel showed Mild Drought with `simulation.zones[*].droughtLevel` still `[1, 1]` and `setupChanged` false. Before this story's bar lockout, no `disabled` predicate in the bar read `ui.showTerrainUI` (`bottom-bar.tsx:74-99`), and the open panel did not cover the bar: `elementFromPoint` over the Spark button's center landed inside the Spark button.

**Footer geometry, measured live in Chrome** (`plainsTwoZone`, wind panel): the two buttons are 76 x 28, the gap is exactly 15px, and the pair sits as a 167px group whose center is exactly on the panel's center (offset 0.00px, the `.buttonContainer` `padding-right: 10px` "shift 5px left" being cancelled by the panel's own 5px padding). `.buttonContainer`'s content box is 308px wide, so a three-button group fits at 8px gaps (244px) with 32px of slack each side, and would still fit at today's 15px (258px). The board's 8px is a design choice, not a fit requirement. The footer background is never white. `.background` computes to `rgb(223, 223, 223)` on the zone-count panel, `rgb(255, 216, 250)` on the conditions panel and `rgb(203, 246, 215)` on the wind panel: `&.panel0` sets `$controlGrayLight1` and `&.panel2` sets `$zoneGreen` (`terrain-panel.scss:47-53`), and both rules follow the `.zone1/.zone2/.zone3` rules at equal specificity, so they win. The artboard agrees panel for panel, which is what makes the fill-less Cancel deliberate rather than an oversight: its Cancel rects sit on `Choose Number back` `#dfdfdf` (110,1386), `Zone 1 back` `#ffd8fa` (270,778) and `Wind back` `#cbf6d7` (408,2003).

**Why the artboard's blue Cancel border is a marker.** `#1500ff` is the annotation color for all 98 redline text notes on this screen ("Note: all panel buttons are the same size", "10 px from bottom", and so on). Both fill-less Cancel rects carry a 1px `#1500ff` border; Cancel's own hover and active rects, which do have fills, carry `1px #797979`, the same border Next and Previous use in all three of their states. A deliberate blue outline would not vanish the moment the button gains a fill.

**`selected` and `disabled` are mutually exclusive on `IconButton`.** `icon-button.tsx:19` writes both class names onto the same element and `icon-button.scss:26` nests the `.selected` rule inside `&:not(.disabled)`, so `disabled` wins. Measured on the running app by toggling the compiled class names on the real Setup button and reading computed style:

| Classes on the button | Highlight-icon opacity | `filter` | Content opacity |
|---|---|---|---|
| neither | 0 | none | 1 |
| `selected` only | 1 | none | 1 |
| `selected` + `disabled` | 0 | `grayscale(1)` | 0.35 |

This is why the Setup button is locked out at its handler rather than through `disabled`.

**Tour anchors are safe.** `src/hazbot/wildfire/anchor-testids.ts` lists `terrain-panel-container`, `terrain-next`, and `terrain-wind` for this panel and never the close button, and `tour-map.tsx` anchors 20-odd rulesets to those three. Removing `terrain-panel-close` cannot break a tour.

**Design source.** Zeplin, project *Portal, LARA Authoring, and Activity Player Runtime*, screen **Updated Wildfire Setup Panel and Terrain Textures**: `https://app.zeplin.io/project/5fe47ae231d1f6a428c53450/screen/6a8599f5f464e141fcb7b53b`. The screen's own note says *"Setup Panel needs to be shortened; this shows the new layout and placement"*, so it is a full redesign of the wizard rather than a Cancel-button addendum, and this story should take only the footer from it.

Measured off the artboard:

| Element | Spec |
|---|---|
| Every panel button | 76 x 28, `border-radius: 5px`, 1px border, label Lato Bold 14px `#434343` centered |
| Cancel default | no fill, border `#797979` (the artboard's `#1500ff` is its annotation color, see below) |
| Cancel hover / active | `#dfdfdf` / `#757575`, border `#797979` in both |
| Next, Previous default | `#ffffff`, border `#797979` |
| Next, Previous hover / active | `#dfdfdf` / `#757575` |
| Create default / hover / active | `#aaffc2` / `#66e98b` / `#008927` |
| Gap between footer buttons | 8px |

The board names the third state **"Select"**, not "active" (Create's row is annotated "model/display updated"). It maps to CSS `:active`, which is what `terrain-panel.scss` already uses for the other panel buttons; there is no separate selected state to build.

Footers, panel by panel, read off the mockups:

- Zone count: `Cancel, Next`
- Adjust conditions: `Cancel, Next`, and `Cancel, Previous, Next` when the zone-count panel precedes it (the artboard note reads *"If preceded by Model Choice, add Previous button"*)
- Wind: `Cancel, Previous, Create`

The current code matches the artboard on size (76 x 28), radius (5px), font (Lato 700 14px), border color (`#797979`), and Create's three greens, so only Cancel and the gap are new.

**What Playwright settled, and what it did not.** The commit behavior is state, which the component tests settle exactly and faster. The browser was used for what jsdom cannot answer: whether the bottom bar stays reachable behind the open wizard, and the real footer geometry (gap, group width, group centering, footer background color) quoted above. A visual pass against the artboard is still worth doing once Cancel is built.

## Out of Scope

- The confirm dialog designs from 2026-08-03 and 2026-08-18 ("Do you want to save your model settings?" Yes/No), replaced by the simpler design.
- The zone-count warning ("If you change the zone count, your settings will be cleared." Cancel / Clear Settings). Never designed, never built, and not needed once closing the wizard stops committing: Cancel is the way out of a zone-count reset. No follow-up ticket. The resolved open question below records the provenance, so it does not get re-raised from the sprint notes.
- Any change to what Create does, including the snapshot diff and `setupChanged`.
- The Clear All rename (WM-47) and the bottom-bar layout work it carries.
- Accessibility work: out of scope in this repo by standing decision.

## Delivery Notes

**Tell Trudi and Michael about the bottom bar lockout when the branch goes up for testing.** It is the one part of this story that is not in the 2026-08-18 design or on the artboard, it changes behavior for every student, and it is visible: every model control in the bar goes inert while Setup is open, with Spark, Reload and Start greyed out and the Setup button lit as selected instead of greyed, and the Setup button itself stops being a toggle. Neither of them has seen it drawn.

What to say: the Cancel button alone would not have delivered the reason Trudi gave for the design, because Setup, Spark and Start each still closed the wizard silently and discarded the student's work, so a student could leave from the first panel and never see the wind panel. Locking the bar makes Cancel and Next/Create the only ways out, which is what makes that rationale true. Michael's call is the visual treatment: the Setup button shows as selected rather than greyed while the wizard is open, and the Hazbot Analysis and fullscreen controls stay live.

**Ask them about the zone info tiles at the same time.** They stay clickable while the wizard is open, and clicking one jumps the wizard to the conditions panel for that zone. Nothing is lost, but it moves a student off the wind panel, which is the panel this story exists to get them to. The options are to leave it (a student who clicks a zone label plainly wants that zone) or to make the tiles inert while the wizard is open, matching the bar. Left as it is unless they say otherwise.

**Flag Cancel's hover on the zone-count panel when the branch link goes out.** Cancel now sits on three different panel colors: `#dfdfdf` on the zone-count panel, the zone tint on the conditions panel, and `#cbf6d7` on the wind panel. Its `#dfdfdf` hover reads on two of them and is invisible on the first, because a fill-less button over a `#dfdfdf` panel already renders `#dfdfdf` and the border is `#797979` in both states. The states column on the artboard is drawn on a pink swatch, so nothing there shows this case. Built as drawn; Michael's call whether he wants a different hover for Cancel, and it only affects the master model.

**Send Michael the footer measurement in the same message.** Adding Cancel re-centers the wind panel's footer group, and 37.5px of where Previous sits today, 49.3% of it, becomes Cancel. Every button moves right and the gap tightens from 15px to 8px, so a student who has clicked Previous twice is now aiming at the control that discards their work. This is geometry rather than observed misclicks, and the order is his design, so it is offered as something to watch in the next workshop, not as a request to change it. Numbers and method are in the resolved Teacher finding below.

## Open Questions

### RESOLVED: What does Cancel look like?

**Decision**: Answered by the Zeplin screen, not by choosing. Cancel is the standard 76 x 28 panel-button shell with a 5px radius and a Lato Bold 14px `#434343` label, and its only departure from Next and Previous is that the default state carries no fill where they carry `#ffffff`. Hover and active are shared (`#dfdfdf`, `#757575`). See the table in Technical Notes.

### RESOLVED: Is Cancel's 1px `#1500ff` border literal?

**Decision**: A, it is a bounds marker. Cancel gets the standard `1px solid #797979` border with no fill. The artboard settles it without needing Michael: `#1500ff` is the annotation color of all 98 redline notes on the screen (`list_annotations`), and Cancel's **own** hover (`A0451281`) and active (`2EA55713`) rects, which carry fills, are bordered `1px #797979`, exactly like Next's three states (`3D5F3D69`). Only the two fill-less Cancel rects are blue: the states-column default (`F4DCEF33`) and the panel-mockup default (`08DCC85E`). A deliberate blue outline would not disappear the instant the button gains a fill, and a Cancel with no border at default would visibly grow one on hover.

### RESOLVED: Does Cancel appear on all three panels or only the last one?

**Decision**: All of them, leftmost in each. The artboard draws Cancel on the zone-count panel, on both variants of the conditions panel, and on the wind panel, and the wind panel's order is `Cancel, Previous, Create`.

### RESOLVED: Do the other silent dismissal paths stay as they are?

**Decision**: No. **Lock the bottom bar's model controls while the wizard is open** (option D, 2026-08-22), so Cancel and Next/Create are the only ways out. The requirements above carry the detail; the measurements are in Technical Notes.

The options originally on the table were A (leave them, scoped to the panel's own controls), B (make the Setup toggle alone a no-op), and C (change nothing, but state in the spec that all these paths are equivalent to Cancel). D beat all three once the paths were measured rather than assumed:

- The story's stated purpose is Trudi's, and A and C do not deliver it. Her 2026-08-18 comment gives the reason for the design as *"it will make people click next to go to the wind setup instead of Xing out and missing that page entirely."* With the X gone but Setup, Spark and Start still live, a student leaves from panel 1 and never sees the wind panel, exactly as before.
- B closes one of the three real exits and leaves two. There is no version of the rationale that B satisfies and D does not.
- D is small, because the earlier framing of "six paths" was wrong. Fire Line and Helitack cannot be clicked with the wizard open at all, so three `disabled` predicates (Spark, Reload, Start) plus Setup's `selected` treatment and open-only handler carry the whole change.
- D removes a real defect on the way past: Reload today resets the simulation underneath an open wizard without closing it.
- The cost is a point of scope and a visible change to the bar that neither Trudi nor Michael has seen drawn. That is accepted, and it is in Delivery Notes.

### RESOLVED: What logs when the student cancels?

**Decision**: Keep the event name and **add a `reason`**: Cancel logs `TerrainPanelClosed { reason: "cancel" }`. Two more parameters were added by later review rounds, `changed` and then `panel` plus `reachedWind`; the full payload is in the requirements above and in the implementation spec.

The blast radius is one docs line plus the log stream. `TerrainPanelClosed` is emitted from `terrain-panel.tsx:100` and nowhere else, is read by no ruleset, factor variable or `translate.ts` case, and `log()` takes a bare `name: string` (`log.ts:18`) with no registry or union to update. Nothing can break.

The reason for the parameter is that the bar lockout changes what the event *means*, not just where it fires. There is no `Escape` or `keydown` handler in `terrain-panel.tsx`, so with the bar locked, Cancel becomes the only close-without-commit path in the app. Today the event captures the X, one of four abandonment routes, while Setup, Spark and Start abandon silently; afterward it captures all abandonment, because there is only one route. Keeping the bare name would have been continuity of name over a silent discontinuity of meaning, which is exactly what corrupts a rate computed across the boundary: abandonment would appear to rise when only the instrumentation improved. The `reason` marks the boundary in the data itself (no `reason` before, `"cancel"` after) while keeping one series, and it follows a convention this repo already uses twice, on `FireLineCanceled` and `SimulationEnded`.

A single possible value looks thin today; it is the boundary marker that earns it, and it leaves room if a later story reinstates other exit routes and wants to tell them apart. If a new event name is ever preferred instead, spell it `TerrainPanelCanceled` with one `l`, matching `FireLineCanceled`.

### RESOLVED: Should Cancel be confirmed when the student has actually changed something?

**Decision**: A, no confirmation. This was already answered on the ticket and only needed finding. Trudi's 2026-08-18 comment (Jira comment 42289) introduces the design as *"we have a simpler solution ... We can get rid of the X and have a cancel button on the bottom of setup would be best. If you press cancel, you don't need a confirmation of the changes."* The confirm belongs to the superseded 2026-08-03 direction, which was confirm-on-**X**, and the X is what this story removes. Reintroducing a confirm on the Cancel path, including the cheap `setupSnapshotDiffers` version, is a design change that goes back to Trudi rather than an implementation choice.

### RESOLVED: Does the zone-count warning survive, or is it gone with the confirm dialog?

**Decision**: There is no warning, and there is no follow-up ticket either. The question dissolves with the design that produced it.

**Where the warning came from,** since it is easy to mistake for a requirement someone is waiting on. It was never designed and never built: grepping `src/` for "will be cleared", "Clear Settings" or "zone count" finds nothing. It began as a question of ours (WM-42 Jira comment 42242, 2026-08-18): *"if they change the count and then X out and confirm, do we apply it and accept that they lose their zone settings ... If that case needs a warning, it also needs somewhere to live in the design."* Trudi's reply sketched wording (*"If you change the zone count, your settings will be cleared."* with Cancel / Clear Settings), which survives only in our own `sprint-24.md` notes; it is not in any of WM-42's four Jira comments. Later that day she and Michael replaced the confirm-dialog direction entirely (comment 42289).

**Why nothing is owed.** The warning answered a problem that only exists when closing the wizard **commits**. In that design, changing the count and confirming would have written a destructive reset into the model unseen. Nothing commits except Create now, so what remains is `applyZonesCountChange` (`terrain-panel.tsx:203-213`) rebuilding **local wizard state** from `config.zones` defaults when the count changes on Next. Reproduced live on the master model: panel 0 at 3 zones, Next, set Zone 1 to Severe Drought, Previous, switch to 2, Next, and the panel shows No Drought. But the student is still inside the wizard, the change is immediately visible on the panel they land on, nothing is committed, and **Cancel backs the whole thing out**, which is the button this story adds. The mitigation is the story. It is also master-model-only: the WF activities pin `config.zonesCount`, making `firstPanel = 1`, and panel 1's footer has no Previous, so panel 0 is unreachable and the count can never change there.

The residual path, reopening a committed 3-zone setup and dropping to 2, ends the same way: the student deliberately changed the count, sees the defaults before committing, and can Cancel. That is changing your mind, not the app losing your work.

## Self-Review

**Round 1** (2026-08-22). Roles: Senior Engineer, QA Engineer, Product Manager, Teacher, Education Researcher. Accessibility review is deliberately excluded (standing decision for this repo). All nine are resolved: six by the open-question pass on 2026-08-22 against measurement, code and the artboard, and the last three in the decision pass that followed.

**Round 2** (2026-08-22, after the bar lockout and the Zeplin footer specs landed). Roles: Senior Engineer, QA Engineer, Education Researcher, Visual Design Reviewer, Product Manager. Every finding below was verified against the running code, the running app, the artboard, or a throwaway test before it was written down; the evidence is quoted in each one.

### Senior Engineer

#### RESOLVED: "Leftmost" is ambiguous against the footer's actual layout

**Decision**: Ordering, not alignment. The footer stays a centered group and `.continueButton+.continueButton` goes from 15px to 8px, which tightens the existing Previous/Next and Previous/Create pairs too. Both requirements now say so.

Measured live rather than inferred: today's wind-panel footer is a 167px group (76 + 15 + 76) whose center sits on the panel's center to 0.00px, so the `padding-right: 10px` "shift 5px left" comment on `.buttonContainer` is cancelled by the panel's own 5px padding and nothing is actually offset. `.buttonContainer`'s content box is 308px, so the three-button group fits at 8px (244px, 32px slack a side) and would also have fit at 15px (258px). The 8px is the board's, not a constraint, which is worth knowing before anyone "fixes" it back.

---

#### RESOLVED: `handleClose` toggles where Cancel should assign

**Decision**: Assign, and it is now a requirement. Internal enough to settle here, and the grep backs it: of the writers of `ui.showTerrainUI` outside the panel, `bottom-bar.tsx:278, 366, 380, 394` all assign `false` and `simulation-info.tsx:37` assigns `true`; only `handleTerrain` (`bottom-bar.tsx:388`) toggles, because a toggle is what that button is. `applyAndClose` (`terrain-panel.tsx:104`) toggles for the same accidental reason and takes the same treatment, which round 2 promoted from an aside to a requirement.

---

#### RESOLVED: The orphaned asset is confirmed, so say so plainly

**Decision**: Deletion is now a requirement, covering the asset and the two dead rules. Re-verified on this branch: `setup-close.svg` is imported only at `terrain-panel.tsx:18`, `.closeButton` and `.closeIcon` are referenced only at `terrain-panel.tsx:245` and `:250`, and `terrain-panel-close` appears in exactly one test. Nothing in `cypress/` touches any of them.

---

### QA Engineer

#### RESOLVED: The test requirement does not name the mutation it catches

**Decision**: The requirement is rewritten as the assertion, and the mutation it has to catch is now named in Technical Notes.

This was not hypothetical. The existing test (d), "change drought, close via X", asserts only `simulation.setupChanged === false`. Adding `simulation.updateZones(zones)` to `handleClose` on this branch commits the student's edits to the simulation and **all 16 tests in the file still pass**, because `updateZones` (`simulation.ts:728-735`) never writes `setupChanged`. The throwaway mutation was reverted; the finding lives in Technical Notes. The migrated Cancel test must read `simulation.zones[n].droughtLevel`, `simulation.zonesCount`, `simulation.wind.speed` and `simulation.wind.direction` back.

---

#### RESOLVED: Nothing covers reopen-after-cancel

**Decision**: The test is now a requirement. Confirmed absent: the closest existing case, test (h), reopens after **Create**, so it exercises the snapshot refresh rather than the close-time reset, and no test in the file cancels and reopens. What the new test guards is the **close-time reset effect** (`terrain-panel.tsx:62-72`), which is the only thing standing between a cancel and a reopened panel still showing the abandoned edit; deleting that effect's `setZones` call fails it and nothing else. It does not guard the `observer` dependency described at `terrain-panel.tsx:74-95`, contrary to an earlier draft of this note: unwrapping `observer` already fails two existing tests, one of them (h).

---

### Product Manager

#### RESOLVED: The stated benefit is only partly delivered, and the spec should say which part

**Decision**: Superseded by the bar lockout, which delivers the benefit in full rather than softening the claim. This finding is what surfaced the gap: the softened claim would have been a softening of **Trudi's** stated rationale for the design, not just of this spec's prose, which is what made option D worth the extra point. The Project Owner Overview now claims Cancel and Next/Create are the only ways out, and that is now true.

---

#### RESOLVED: The ticket's title and points no longer match the work

**Decision**: The title stays as it is, and the points stay at **2**.

The title, "Hazbot: Xing out of setup doesn't save settings", does describe the abandoned confirm-on-X design rather than the work, but it is already quoted in the sprint notes, this spec and the branch name, so renaming it now costs churn across all three and buys nothing on a story that is about to be built.

The points need no change either, and the "repoint to a 1" action in `sprint-24.md` (lines 623, 1210) is **stale**: it was reasoned from the work shrinking to a footer button once both confirm dialogs were dropped. The bottom-bar lockout adopted on 2026-08-22 puts back roughly what the dialogs took out (three guarded predicates, the Setup button's `selected` treatment and open-only handler, a rewritten toggle test and five new guard tests, plus the `reason` parameter and two docs lines), which lands back on a 2. Not a 3: every piece is small and the reset effect, the one risky part of this component, is not touched.

---

### Teacher

#### RESOLVED: Cancel lands where Previous used to be on the last panel

**Decision**: Build the footer as the artboard draws it, and send Michael the measurement as something to watch in the next workshop. It rides along with the bar-lockout conversation in Delivery Notes rather than needing its own. The order is not reopened: it is the design's, on all three panels, and no-confirm-on-cancel is Trudi's.

The numbers were produced by building the layout, not by arithmetic: a third button cloned into the live wind-panel footer with the gap set to 8px, then measured and reverted. The footer is `display: block` with `text-align: center`, so the group re-centers.

| | Today | After |
|---|---|---|
| Cancel | n/a | 354 - 430 |
| Previous | 392.5 - 468.5 | 438 - 514 (+45.5px) |
| Create | 483.5 - 559.5 | 522 - 598 (+38.5px) |
| Gap | 15px | 8px |

**37.5px of Previous's old footprint is Cancel afterward, 49.3% of it.** Roughly half the pixels a student has already clicked twice to navigate backward now discard everything, with no confirmation. Every button moves right, so muscle memory is wrong for all three, and the 15px to 8px tightening puts Cancel and Previous closer than any pair in the panel today, exactly where a misclick is most expensive. What we have is geometry, not evidence of misclicks, which is why this is a thing to watch rather than a reason to revisit the order.

---

### Education Researcher

#### RESOLVED: Abandonment stays invisible in the logs

**Decision**: Mostly resolved by the bar lockout, plus one addition: Cancel logs **`TerrainPanelClosed { reason: "cancel", changed: boolean }`**.

The finding was written when five exit paths closed the wizard while logging only their own button event, so abandonment could not be counted at all. After the lockout there is exactly one way to abandon Setup and it logs, which makes abandonment fully counted with no new instrumentation. The original suggestion, tagging every bar control with whether the wizard was open, is moot: those paths no longer exist.

`changed` is the one thing the lockout does not supply. Without it the log says a student cancelled, not whether they cancelled *having done work*, and the second number is what says whether this story worked, since the ISLAND complaint was about losing settings rather than about closing an empty panel. It costs about four lines against helpers already imported here: `applyAndClose` (`terrain-panel.tsx:103-125`) already diffs `openSnapshotRef.current` against the local wizard state with `setupSnapshotDiffers` to decide `setSetupChanged`, and Cancel calls the same diff. No new state, no new helper, no new snapshot.

**No ordering constraint against the flag assignment.** `applyAndClose`'s existing comment is about the `simulation.*` mutators, not the flag: it assigns `ui.showTerrainUI` first (`terrain-panel.tsx:104`) and diffs afterwards, and test (b) is named `[diff-before-mutate canary]` for the same reason. Cancel calls no mutators at all, so the only thing it has to get right is not calling them.

---

## Self-Review: Round 2

### Senior Engineer

#### RESOLVED: Requirements and Technical Notes give the Setup button two incompatible treatments

**Decision**: Highlight Setup, disable the other three. The Setup button keeps `disabled={!simulation.setupEnabled}`, gains `selected={ui.showTerrainUI}`, and is made inert by `handleTerrain` becoming open-only; `ui.showTerrainUI` enters the `disabled` predicate of Spark, Reload and Start only. Requirements, Technical Notes, the test list, the Delivery Note and the repoint rationale all now say three disabled predicates rather than four.

Requirement: *"The **Setup button shows `selected`, not `disabled`**, while the wizard is open. It is the affordance that says the wizard is open, and greying it reads as a broken control."* Technical Notes: *"Four `disabled` predicates take `ui.showTerrainUI`: the Setup button (line 146, which also gains `selected={ui.showTerrainUI}`) ..."*

The Technical Notes recipe is `disabled={!simulation.setupEnabled || ui.showTerrainUI}` plus `selected={ui.showTerrainUI}`, and that produces exactly the outcome the requirement rejects. `IconButton` puts both class names on the same element (`icon-button.tsx:19`), and `icon-button.scss:26` nests the `.selected` rule inside `&:not(.disabled)`, so `disabled` suppresses the selected treatment entirely.

Measured live on the running app by toggling the compiled class names on the real Setup button and reading computed style:

| Classes on the button | Highlight-icon opacity | `filter` | Content opacity |
|---|---|---|---|
| neither | 0 | none | 1 |
| `selected` only | **1** | none | 1 |
| `selected` + `disabled` | **0** | `grayscale(1)` | 0.35 |

So the pair is not merely redundant: `selected` becomes a no-op and the button renders greyed and desaturated. Only three predicates can take `ui.showTerrainUI` in their `disabled` (Spark, Reload, Start); Setup gets `selected` plus an open-only `handleTerrain` and no `disabled` change. The "four guarded predicates" count in Requirements and in the repoint rationale needs the same correction.

---

#### RESOLVED: The ordering constraint on `changed` is not real, and the comment it cites says something else

**Decision**: Removed. Requirement 47 now states the constraint that does hold (Cancel calls no `simulation.*` mutators) and says explicitly that the flag assignment carries no hazard; the round-1 Education Researcher finding's closing paragraph is rewritten; the throwaway result is item 4 of the verified-behavior list in Technical Notes.

Requirement: *"**must be computed before** `ui.showTerrainUI = false` is assigned, since that assignment triggers the close-time reset."* Education Researcher finding: *"One ordering constraint, the same one `applyAndClose` already carries a comment about."*

`applyAndClose` does the opposite of what the spec says it does. It assigns the flag first (`terrain-panel.tsx:104`) and computes the diff after (lines 109-120), and its comment is about the **simulation mutators**, not the flag: *"Diff the open-time snapshot against the local wizard state BEFORE calling the simulation.\* mutators."* Test (b) is named `[diff-before-mutate canary]` for the same reason.

The constraint cannot bite, because the close-time reset is a `useEffect` that runs after the next render, while the handler reads `zones` / `windSpeed` / `windDirection` from its own render's closure. Verified by a throwaway edit on this branch (since reverted): `handleClose` rewritten to assign `ui.showTerrainUI = false` first and diff afterwards logs `changed: true` for an edited wizard, `changed: false` for an untouched one, and leaves `simulation.zones[0].droughtLevel` at its pre-open value. Both throwaway tests passed.

Leaving the sentence in teaches a false mechanism (that a MobX assignment flushes React effects synchronously), which is the kind of thing a later refactor reasons from. The real constraint worth stating for Cancel is that it must not call the mutators at all.

---

#### RESOLVED: "Every writer of the flag assigns" is not true unless `applyAndClose` changes too

**Decision**: `applyAndClose` becomes an assignment in the same commit, promoted from a round-1 aside to a requirement, which makes the sentence true as delivered. The miscounted census in Technical Notes is corrected: four writers assign `false`, one assigns `true`, one toggles.

Requirement: *"Cancel **assigns** `ui.showTerrainUI = false` rather than toggling it. With the Setup button no longer a toggle (below), every writer of the flag assigns."*

`applyAndClose` toggles (`terrain-panel.tsx:104`, `ui.showTerrainUI = !ui.showTerrainUI`) and nothing in the Requirements changes it. The round-1 finding notes it *"can take the same treatment while the file is open"*, but "can" in a resolved review note is not a requirement, so the delivered branch can satisfy every requirement and still leave one toggling writer, making the sentence false the day it merges.

The full census, re-verified by grep: writers are `bottom-bar.tsx:278, 366, 380, 394` (assign `false`), `bottom-bar.tsx:388` (toggles, becomes open-only), `simulation-info.tsx:37` (assigns `true`), and `terrain-panel.tsx:99` and `:104` inside the panel. Technical Notes also miscounts this list as *"five assign `false`"* while listing four `false` assignments and one `true`.

---

### QA Engineer

#### RESOLVED: The panel 1 footer requirement is wrong for the path every activity student takes

**Decision**: Requirement corrected to the conditional form the code and the artboard both use. Activities get `Cancel, Next`; only the master model gets `Cancel, Previous, Next`. Cancel itself stays unconditional.

Requirement: *"Every Setup panel gets a **Cancel** button in its existing footer button container: panel 0 (Cancel, Next), panel 1 (Cancel, Previous, Next), panel 2 (Cancel, Previous, Create)."*

Panel 1 renders Previous only when `firstPanel === 0` (`terrain-panel.tsx:319`), which is the master model. The WF module activities pin `config.zonesCount`, so `firstPanel` is 1, panel 0 is unreachable, and panel 1's footer is Next alone. Confirmed live on `?preset=plainsTwoZone`: the panel-1 footer renders a single button, `Next`, with `config.zonesCount === 2`. On the master model the same panel renders Previous and Next.

Technical Notes gets this right (*"`Cancel, Next`, and `Cancel, Previous, Next` when the zone-count panel precedes it"*), and so does the artboard, which draws both variants: a two-button conditions footer at (270,778) and a three-button one at (408,1489). It is the Requirements bullet, the line a test gets written against, that states the three-button form unconditionally.

---

### Education Researcher

#### RESOLVED: `TerrainPanelButtonClicked` will not mean "opens only" unless the spec says the no-op click is silent

**Decision**: B, keep logging every click. `handleTerrain` does not early-return, so a click on the already-open Setup button still emits the event with nothing opening. The event's meaning moves from "opened or closed" to "clicked the Setup button", and `LOGGED-EVENTS.md` line 45 is reworded rather than narrowed to "opens only". The reason to keep it is that a student poking a lit, inert button is evidence about whether the `selected` treatment reads as "already open", which is exactly the part of the lockout no one has seen drawn. The cost is that an open rate cannot be a raw count of this event, which the reworded docs line makes explicit.

Technical Notes: *"line 45 describes `TerrainPanelButtonClicked` as 'User opens/closes Terrain Setup', which the bar lockout reduces to opens only."*

The Setup button stays enabled while the wizard is open (that is the point of the `selected` treatment), and `handleTerrain` logs unconditionally after its state write (`bottom-bar.tsx:386-390`). If the handler simply becomes `ui.showTerrainUI = true`, then every click on the already-open Setup button still emits `TerrainPanelButtonClicked` with nothing opening. The docs line would then be wrong in a new way, and an open-rate computed from this event would over-count by however often students poke the lit button.

The requirement needs to say which it is: early-return before the log when the wizard is already open (event means "opens", docs line is true, and the click is silent as well as inert), or keep logging every click (event means "Setup button clicked", and the docs line should say that instead). Either is defensible; the spec currently asserts the first while describing an implementation that produces the second.

---

### Visual Design Reviewer

#### RESOLVED: The wind panel is green, not the zone tint, so the fill-less Cancel claim covers the wrong panel

**Decision**: The design intent is unchanged and the requirement's evidence is corrected. Cancel renders `#dfdfdf`, the zone tint, or `#cbf6d7` depending on the panel, and the artboard draws it on all three of those colors. Both measurements are in Technical Notes.

Requirement: *"Cancel shows the panel body through it and picks up the zone tint on the conditions and wind panels (`#ffd8fa` for zone 1 today). That is the artboard's intent, not an artifact: the board draws the fill-less Cancel on the same `#ffd8fa` panel the app renders."*

The wind panel is not zone-tinted. `terrain-panel.scss:51` sets `&.panel2 { background-color: $zoneGreen; }` (`#cbf6d7`), and `.panel0` sets `$controlGrayLight1` (`#dfdfdf`); both rules follow the `.zone1/.zone2/.zone3` rules at equal specificity, so they win. Measured live: panel 0 `rgb(223, 223, 223)`, panel 1 `rgb(255, 216, 250)`, panel 2 `rgb(203, 246, 215)`.

The design intent survives, but the sentence's evidence does not. The artboard agrees with the app panel by panel: the wind-panel Cancel at (408,2003) sits on `Wind back` `#cbf6d7`, the zone-count Cancel at (110,1386) on `Choose Number back` `#dfdfdf`, and the conditions Cancel at (270,778) on `Zone 1 back` `#ffd8fa`. So Cancel renders in three different colors across the wizard, and the requirement should say that rather than naming one of them.

---

#### RESOLVED: A fill-less Cancel has no hover feedback at all on the zone-count panel

**Decision**: A, build it as the artboard draws it, and report it with the branch link rather than blocking on it. The consequence is now stated in Requirements and the item is in Delivery Notes. Cancel does have a full three-state treatment on the board (default no fill, hover `#dfdfdf`, select `#757575`, border `#797979` on the filled states); the issue is only that `#dfdfdf` is also the zone-count panel's background, and the board's states column is drawn on an `#ffd8fa` swatch, so that one combination was never shown. Master-model-only.

The spec gives Cancel no default fill and `#dfdfdf` on hover. The zone-count panel's background is `#dfdfdf` in the app (`$controlGrayLight1`, measured `rgb(223, 223, 223)`) and `#dfdfdf` on the artboard (`Choose Number back`, token `cc-charcoal-light-2`). Default and hover are therefore the same color, and the border is `#797979` in both states, so hovering Cancel on panel 0 changes nothing a student can see.

This is not the pre-existing behavior of the other buttons: Next on the same panel goes `#ffffff` to `#dfdfdf`, which is a visible change even though it lands on the panel color. Cancel is the only control in the wizard with a completely dead hover.

It is master-model-only (activities never reach panel 0), and the artboard does draw it this way, so the cheapest resolution may be to accept it and say so. Worth naming either way, since a silent no-feedback hover is the sort of thing that comes back as a bug report.

---

### Product Manager

#### RESOLVED: The lockout scope names what stays live in the bar and says nothing about the zone tiles

**Decision**: The tiles are placed in the requirements (they stay live, they do not close or discard, they jump the wizard to panel 1), and the design question of whether that jump is wanted while the wizard is open goes to Trudi and Michael with the rest of the lockout rather than being settled here. Left as it is unless they say otherwise.

Requirement: *"The **Hazbot Analysis button and the fullscreen toggle stay live**. Both sit in the bar's `.rightContainer` ... 'Lock the bar' means the model controls in `.mainContainer`, not the region controls."*

The zone info tiles above the bar are a third category the spec never places. They are model controls by any ordinary reading, they stay clickable while the wizard is open (`simulation-info.tsx:18` drops the handler only when `simulationStarted`, and the wizard can only be open before the run starts), and clicking one while the wizard is open writes `ui.terrainUISelectedZone`, which forces `setCurrentPanel(1)` (`terrain-panel.tsx:53-57`).

The headline claim survives: this path does not close the wizard and does not discard anything, so Cancel and Next/Create are still the only ways out. What it does do is yank a student off the wind panel back to the conditions panel, which is the opposite of the story's stated purpose of getting them to the wind panel. One sentence placing the tiles (stay live, and here is what they do to an open wizard) closes the enumeration, and a decision on whether that panel jump is wanted while the wizard is open belongs with the bar-lockout conversation in Delivery Notes rather than being discovered in a workshop.

---
