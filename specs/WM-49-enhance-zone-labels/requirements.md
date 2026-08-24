# Hazbot: Enhance Zone Labels

**Jira**: https://concord-consortium.atlassian.net/browse/WM-49
**Repo**: https://github.com/concord-consortium/wildfire-model
**Implementation Spec**: [implementation.md](implementation.md)
**Status**: **In Development**

## Overview

The zone labels on the map are re-laid out to name a zone's vegetation type and drought level in words instead of leaving a student to decode two small icons. They grow from 142 x 46 to 170 x 60, gain a white border, and stop being interactive: no click, no hover, no pressed state, no lock icon, and no shortcut into the Setup panel.

## Project Owner Overview

Workshop feedback said students could not tell what a zone's conditions were from its label. The label carries a vegetation icon and a drought icon, and nothing names either one, so a student reading "Zone 1 / Hills" has to already know that a particular green shape means shrub. The labels now spell both out, all the time, with no interaction required.

What goes away with that: clicking a zone label currently opens the Setup wizard on that zone, and the padlock that appeared on each label once a run started existed only to suppress that click. Both are removed. The labels become displays.

## Background

The ticket sat undefined for most of the sprint, carrying the raw ISLAND workshop ask and a "NEEDS UPDATED description and spec" header.

**Michael specified it twice, and the second one replaced the first.** On 2026-08-24 he described an expandable label: a caret, click to expand and collapse, and the Setup shortcut removed. That is what the first version of this spec was written against, and it produced a story with five open questions, most of which were about interaction and state.

**On 2026-08-27 at 14:18 he reversed it in Slack**, and posted the replacement design on the ticket at 2026-08-28 01:55 with two images. Verbatim from Slack: *"We're going to make some more changes -- removing the zone label interactivity (no more clicks), they're just displays now. They will be wider and taller, though. And we think it's okay that the left displays cover Zone 1 a bit when the graph is open -- since the label will be the important part. But we will need to squeeze 'em together a little more."*

That is a simplification, not a complication. There is no expand state, so nothing to persist, nothing to make independent-or-accordion, and no caret asset to pull. Four of the five open questions this spec used to carry stopped existing rather than being answered.

**It also supersedes an answer he gave earlier the same day**, recorded in the sprint doc: *"locking goes away completely and labels stay expandable while the model runs"*. That reasoned from a click that shows and hides information. There is now no click at all, so only the first half survives: the lock is gone.

The design of record is the **Updated Wildfire Controls and Labels** Zeplin board, `Zone Conditions Display Examples` at (1350, 1025). The ticket's `Design update` block is a prose summary of it; where the two differ, the board wins, and one place they read differently is called out below.

## Requirements

- Each zone label is **170 x 60** border-box, with a **1px `#ffffff` border** (was 1px `#797979`), radius 4. Per-zone fills are unchanged. The element is `content-box` today, so this requires `box-sizing: border-box` and not only new dimensions.
- The label renders **two rows**:
  - **Row 1**: `Zone N`, a `·` bullet, and the terrain type, on one line, horizontally centered as a unit so the center shifts with the terrain type's width.
  - **Row 2**: the **vegetation icon and its name** on the left, and the **drought icon and its name** on the right, side by side.
- **The two icon-and-name pairs share one row.** The ticket's prose lists them as separate bullets, which reads as two stacked rows; the board draws both at the same y. Three stacked rows do not fit in 60px at a 14px line height.
- Each name sits in a fixed **two-line, 28px band**, and how many of those lines it uses depends on the string. All four drought names fill both (`Severe / Drought`, `Medium / Drought`, `Mild / Drought`, `No / Drought`); on the vegetation side only the abbreviation does (`Forest / w Suppr.`), while `Grass`, `Shrub` and `Forest` are single lines centered in the same band.
- The vegetation name is **abbreviated for this surface only**: `"Forest with Suppression"` renders as **`"Forest w Suppr."`**, breaking as `Forest / w Suppr.` per the board. Every other display site keeps the full string. The break needs a non-breaking space rather than a box width: `"Forest w"` is 47.16px, so it still fits the board's 48px box and ordinary wrapping leaves `w` on line 1. See the implementation spec.
- Type is unchanged from what the repo already declares: `Zone N` and the bullet in **Lato Bold 14**, everything else in **Roboto Condensed Regular 14**, all `#434343`.
- The vegetation icon carries a **1.5px white outline that the asset already provides**. All four vegetation SVGs ship both a `.dark-outline` (`#797979`) and a `.white-outline` (`#ffffff`) rect, each 26.5 x 26.5 at (0.75, 0.75) stroked 1.5px inside a 28 x 28 box, and `simulation-info.scss` already hides `.dark-outline`, so the white outline is what the zone label renders today. Nothing is added. The icon renders at the asset's intrinsic **28 x 28**, so the stroke stays exactly 1.5px. The board draws it at 26 x 26 inside the label, which is a real 26/28 scale of the whole component rather than a reading of the rect: the same icon in the board's exportable library is reported at 28 x 28 with the same 1.5px border, which is what the asset's outer bounds measure. Rendering at 26 needs an explicit `svg` size rule that no other icon site in the repo carries, since the SVGs' own `width`/`height` attributes mean a 26px parent box only lets them bleed, and it would thin the stroke to 1.39px. The 2px comes out of row 2's gaps instead. The drought icon renders at the **20 x 28 asset's own size**: the board's 19 x 25 is the artwork inside it, and the SVGs already place a 19 x 25 rect at `translate(0.5, 1.5)` in a 20 x 28 box, so no scaling is wanted there.
- Labels sit **at least 10px apart**. This is a floor that prevents a real failure, not a nominal gap: see the layout section.
- **The box and the floor are guarded in Cypress**, since jsdom does no layout and nothing else can see them. The floor's case runs at a three-zone preset with the graph open at `cy.viewport(950, 880)`, which is the only condition under which the failure it guards exists.
- **The labels are not interactive.** No `onClick`, no hover or pressed ring, no pointer cursor, no lock icon, and no path into the Setup panel. Everything that existed only to serve those is removed, not left dead.
- **Overlap with the Time and Wind Meter displays is accepted**, per Michael, at the widths where it occurs. It is not a defect this story fixes and not a constraint the layout has to satisfy.
- Existing zone-label behavior not named above is unchanged, including the per-zone colors and the `Zone N` and terrain-type text sources.

## Technical Notes

### What the label is today

`simulation-info.tsx` renders `ZoneInfo` per zone: a vegetation icon, a drought icon, a two-line text block (`Zone N` over the terrain type from `terrainDisplayLabels`), and a conditional lock icon. `simulation-info.scss` gives `.zone` `width: 124px; height: 34px`, `padding: 6px 10px 4px 6px` and a 1px border, so the border box measures **142 x 46** live. **`.zone` is `content-box`**, which is how those three declarations add up to 142 x 46; reaching a 170 x 60 *border* box therefore means setting `box-sizing: border-box` on it, as `zone-selector.scss` already does for the Setup thumbnails, rather than only changing the width and height. Hover and active are `box-shadow: 0 0 0 4px rgba(255,255,255,0.5)` and `rgba(255,255,255,1)`, gated on `.active`, which is applied only when `locked` is false. `locked` is `simulation.simulationStarted`.

`.zone` also carries `position: relative` and `z-index: 2`, and the two have different fates. The first is only the containing block for `.lockIcon`'s absolute positioning, so it is orphaned along with the lock. The second is what keeps the label above the 3D canvas: measured live, dropping it puts the canvas on top and the label disappears. It survives, and does not need the `position` to work, since z-index applies to a flex item whether or not it is positioned.

So the icons are on the left and the text is stacked on the right. The new design is a different arrangement, not a resize: a title line across the top, and the icons moved down beside their names.

**One existing defect in the same element**, worth fixing while the file is being rewritten: `simulation-info.tsx:20` writes `${css.icon} ${css.vegetationIcon}`, but the SCSS defines only `.icon` and `.icon.droughtIcon`. `css.vegetationIcon` is `undefined`, so the rendered class attribute is literally `"simulation-info--icon--__wildfire-v1__ undefined"`, confirmed in the live DOM. Either the class gets a definition or the reference goes.

### The board, measured

`Zone Conditions Display Examples` draws twelve `Zone Label Enhanced` groups, three per row at x 1360, 1540 and 1720 across four rows (one per drought level, at y 1064, 1134, 1204 and 1274), all **170 x 60**. The 180px column pitch is where the **10px apart** figure comes from.

| | Value |
|---|---|
| Background | `Label back - Zone N`, fill per zone, **border 1px `#ffffff`**, radius 4 |
| `Zone N` | Lato-Bold 14/700 `#434343`, 43 x 17, at rel (27.5, 5) |
| `·` | Lato-Bold 14/700 `#434343`, 4 x 17, at rel (75.5, 5) |
| Terrain type | RobotoCondensed-Regular 14/400 `#434343` (cond 0.75), at rel (84.5, 6) |
| Vegetation icon | 26 x 26 at rel (8, 25.5), with a `White Outline` **border 1.5px `#ffffff`** |
| Vegetation name | RobotoCondensed 14/400, 48 x 28 at rel (39, 24). Two lines for `Forest / w Suppr.`; `Grass`, `Shrub` and `Forest` are one line at rel (39, 30), centered in the same 28px band |
| Drought icon | 19 x 25 artwork at rel (92.5, 27), inside a 20 x 28 `Drought Index` group at rel (92, 25.5) |
| Drought name | RobotoCondensed 14/400, two lines, in a **45 x 28** `Drought Index` group at rel (117, 24), the same in all four drought rows. The text bound inside it is 45 for Medium and 44 for Severe, Mild and No |

**Both name boxes are the board's groups, and the text measurements confirm them.** The `Vegetation Type` group is 48 x 28 and the `Drought Index` text group 45 x 28 in every one of the twelve labels; what varies inside them is the text bound, which is why `Grass` reports 32 and `Severe Drought` 44. Measured in the app's own loaded Roboto Condensed at 14/400, `"Medium"` is 44.61px, so 45 is independently the smallest whole pixel that holds the longest drought word; `"w Suppr."` is 47.27px against the 48px vegetation box and `"Drought"` is 43.73px. At 45px every drought name breaks after its first word, as drawn, and `Grass`, `Shrub` and `Forest` all stay on one line inside 48. The abbreviation is the one form no width reproduces: `"Forest w"` is 47.16px and so fits line 1, so the `Forest / w Suppr.` break has to be made unbreakable rather than measured into existence.

The three fills (`#ffd8fa`, `#d6ecff`, `#ffe8cd`) are already `$zone1Red` / `$zone2Blue` / `$zone3Orange` in `common.scss:46-48`, `#434343` is already `$controlText`, and `simulation-info.scss` already declares `font-family: Lato` and `'Roboto Condensed'` at 14px. **No new font, color or asset is needed**, which is the one way this story got cheaper as well as simpler.

### The layout, measured at both ends

Measured on the running app, `?preset=hillThreeZone`, three zones, **graph open**, by setting the board's border box on the three labels through the DOM and re-reading. The left display stack is three fixed boxes at `left: 10px`, all `$keyAreaWidth: 104px`, so its right edge is **x 114**.

| Viewport | | First label left | Gap between labels | Clearance from the left stack |
|---|---|---|---|---|
| **1241 x 529** (target device) | as built, 142 | 141.3 | 100.7 | 27.3 |
| | at 170, no floor | 127.3 | 72.7 | 13.3, still clear |
| | **at 170 + the floor** | 124 | **76** | **10, still clear** |
| **950 x 880** | as built, 142 | 73.4 | 23.1 | **-40.6, already behind** |
| | at 170, no floor | 56 | **0** | -58 |
| | **at 170 + the floor** | 44.5 | **10** | **-69.5** |

Four things follow, and they are what the layout requirement is built on.

**At the target device the new size fits.** 10px of horizontal clearance from the left stack, and the 10px minimum gap is slack by a factor of seven. The taller label does reach 3px into the Wind Meter's vertical band, but the two never overlap horizontally there, so nothing is occluded. Stepping the viewport down, clearance is 4.2 at 1216, so the horizontal overlap only begins below roughly **1206px** of viewport width.

**At 950 the labels cannot hold 170 and the gap collapses to zero.** They land at 169 and abut into one continuous bar rather than three pills, because `.simulationInfo` distributes them with `margin-left/right: auto` inside an 80%-width row. **That is what Michael's "squeeze 'em together a little more" and the 10px floor are for**: the gap has to be a real gap the labels cannot give back, not free space left over after they have taken what they want.

The 169 is not the label shrinking to fit: it is the label's **min-content width**, set by row 2's four fixed, non-shrinking boxes (153 of content plus 14 of padding and 2 of border), which a flex item's default `min-width: auto` will not go below. That matters for the test rather than the design, and the implementation spec's Cypress step carries the consequence: the two declarations that make up the floor fail in different ways, and only one of them shows up as a lost gap.

**The horizontal overlap with the left stack is pre-existing.** At 950 the label is already 40.6px behind the stack as built today, and `document.elementsFromPoint` at the center of Zone 1's vegetation icon returns the Time display on top. Growing to 170 deepens it to 58, and holding the 10px floor as well deepens it to **69.5**. The previous version of this spec treated that as a defect this story had to fix, and it was the thing that made the story look blocked. **Michael has accepted it**, so it is now a recorded consequence rather than a requirement.

**69.5 is the number to hold in mind, not 58.** The two requirements interact: 58 is the depth when the labels are allowed to sit at 169 and the gap collapses, which is the state the floor exists to prevent. Enforcing both puts the first label at x 44.5. Nothing is clipped or occluded on the right, since the third label overflows the 80% row by 17.4px but ends at x 574.5 against the graph panel's left edge at 633, so the whole cost of the floor lands on the left. The alternatives were measured and rejected: letting the labels shrink further would hold the overlap nearer 52 but is not reachable without also letting row 2's name boxes shrink, which re-wraps `w Suppr.` and `Medium` to a third line that will not fit in 60px, and confining the row to the space right of the key area gets the overlap down to 12.5 but stops the labels being centered on the frame, which is how the board draws them. **Worth telling Michael the depth changed, not worth blocking on.**

### Removing the click orphans more than the handler

`simulation-info.tsx:38` is the **only writer** of `ui.terrainUISelectedZone` to a real value. Removing the click handler orphans all of this, and leaving any of it behind is the visible miss:

- `ui.terrainUISelectedZone` (`ui.ts:18`).
- The `useEffect` at `terrain-panel.tsx:52-62` that exists purely to consume it. Its comment names the caller directly: *"ui.terrainUISelectedZone is set by external Zone Info buttons."* It also calls `setCurrentPanel(1)`, which is what opens the wizard on the clicked zone's panel rather than at the start.
- The `|| 0` fallback in `useState<number>(ui.terrainUISelectedZone || 0)` at `terrain-panel.tsx:44`.
- `showTerrainPanel` and its `log("ZoneButtonClicked", ...)` in `simulation-info.tsx:35-41`.
- The `locked` and `onClick` props on `ZoneInfo`, `LockIcon`, `.lockIcon` in the SCSS, `data-testid="lock-icon"`, and the `.active` class along with both `box-shadow` rules.
- **A third file**: `terrain-panel.test.tsx:508`, test (o), drives the wizard by writing `stores.ui.terrainUISelectedZone = 1`, with the comment *"What simulation-info.tsx writes when a zone info tile is clicked."* This one **fails** rather than going stale, so it is carried in Test fallout below rather than treated as a comment to tidy.
- **`LOGGED-EVENTS.md:46`**, the `TerrainPanelClosed` description, which tells a researcher that *"Previous and a zone-info-tile click both walk a student back off"* the wind panel. After this story Previous is the only such route, and that sentence is guidance for reading a live parameter rather than a passing mention.

The second item is a **feature** going away, not only dead code: a student can currently jump straight to a zone's Setup panel from its label, and this change offers nothing in its place. Trudi has confirmed the shortcut was unused as such.

### The vegetation name needs a third form, and there are already two

`vegetationLabels` (`types.ts:23`) is **data**: logged in `SimulationStarted` (`bottom-bar.tsx:301`) and `ZoneUpdated` (`terrain-panel.tsx:198`), and compared against by the Hazbot matcher (`sim-props.test.ts:242`). Its value is `"Forest With Suppression"`, capital W and capital S. It must not be touched.

Two display sites already work around that, each with the **same three-line comment copied verbatim**: `vegetation-selector.tsx:34` and `terrain-summary.tsx:24` both `.replace("With Suppression", "with Suppression")`, and the second also carries a hardcoded `"Forest with Suppression"` literal for its wrapping case.

This story adds a **third form**, the abbreviation `"Forest w Suppr."`, which no `.replace` produces. So the fix is the one `terrainDisplayLabels` (`types.ts:49`) already models, and it needs two maps rather than one:

- **`vegetationDisplayLabels`** holding the full display spelling `"Forest with Suppression"`, replacing the two `.replace` call sites so the display spelling has one home.
- **an abbreviated form** for the zone label. Whether that is a second map, a field on one map, or a per-surface override is an implementation choice, but it must not be a fourth open-coded string, and the zone label must not be the only place the abbreviation exists if any other surface ever wants it.

`droughtLabels` needs none of this: its values match the board exactly.

The abbreviation is **not** a fit workaround. Measured live in the loaded font, `"Forest with Suppression"` is 132.8px on one line against the board's 132px, so it would fit the old layout; it does not fit beside a drought name in a 170px box, which is why the board abbreviates.

### Test fallout

Three tests go, across two files.

`simulation-info.test.tsx` has four tests and **two assert behavior being removed**:

- *"opens terrain panel UI when one of the zone buttons is clicked"* asserts `ui.showTerrainUI` and `ui.terrainUISelectedZone` after clicking each label. **Delete.** Nothing replaces it, because nothing happens on click any more.
- *"locks zone buttons when simulation is started"* asserts the lock icon appears once `simulationStarted` flips. **Delete.**
- *"renders zone info buttons"* and *"renders the wind reading in MPH"* survive untouched.

`terrain-panel.test.tsx` contributes the third, and it is the one that turns the suite red. Test (o), *"reach the wind panel, click a zone tile, Cancel, the tile jump does not erase reachedWind"*, drives the wizard through the write this story removes. With the effect and the `|| 0` fallback taken out, the suite runs **1 failed, 24 passed**: (o) fails at `expect(screen.queryByTestId("terrain-wind")).not.toBeInTheDocument()`, because nothing forces the wizard off the wind panel any more. **Delete.** (The count and the line number were first measured while this branch was stacked on WM-53, whose 155 added lines in that file put test (o) at `:661` and the suite at 34 cases. The branch was rebased onto master on 2026-08-28; both are re-measured here against that base.) No coverage goes with it: test (n) already pins `panel: "conditions"` with `reachedWind: true` through the Previous route, which is the only route left.

Deleting three tests is the expected outcome here, not a coverage regression: they test an interaction that no longer exists. What replaces them is coverage of the new content, which jsdom can see: that each label renders the vegetation name and the drought name, and that the abbreviation appears for `ForestWithSuppression` while the full string still appears in the Setup panel.

**The layout requirement is not assertable in Jest**, because jsdom does no layout, so the 10px floor and the 170 x 60 box are guarded in Cypress or not at all. `cypress/support/elements/ModelInfo.js:9` reaches into `.simulation-info--zoneName--__wildfire-v1__`, which survives this change.

**The floor's case has to name its conditions, or it cannot fail.** `cypress.config.ts` runs at 1400 x 1000 and no existing test opens the graph. Measured there with the graph open and the labels at 170 x 60, the gap is 118.4px with the floor implemented and 115.1px without it, so a `gap >= 10` assertion at the default viewport passes either way; with the graph closed, Cypress's real default, the gap is wider still. The collapse only exists below about **993px** of viewport width with three zones and the graph open, where the row's width crosses 530 (three labels at 170 plus two 10px gaps). So that case needs a three-zone preset, the graph open, and `cy.viewport(950, 880)`. It also has to assert the label's width alongside the gap, because the floor's two declarations fail differently: deleting the container's `gap` collapses the gap to 0 and leaves the width at 170, while deleting `.zone`'s `flex-shrink: 0` holds the gap at 10 and costs 1px of width, since row 2's non-shrinking boxes already floor the label at a 169px min-content width. A gap-only assertion never sees the second. The 170 x 60 box is unconditional at the default viewport once shrinking is off, so its own case can run there, but that viewport is too wide to catch the 1px.

Both patterns already exist. `cypress/e2e/key-area-visuals.cy.ts` reads `getBoundingClientRect` and pins `KEY_AREA_LEFT = 10` and `KEY_AREA_WIDTH = 104`, so the geometry style is established, and `bottom-bar-visuals.cy.ts:136-139` already re-visits with its own `cy.viewport(1241, 529)` inside a describe. The cases go in a new `zone-label-visuals.cy.ts` rather than the key-area file, which is scoped by its own header to the fixed left edge and shares one `plainsTwoZone` `beforeEach` the floor case cannot use.

### Zeplin

Board: **Updated Wildfire Controls and Labels**, `https://app.zeplin.io/project/5fe47ae231d1f6a428c53450/screen/6a8566a1c90489f7be36e66a`. Requirements are blue text rather than annotation pins. A full text dump of the artboard, searchable, is at `~/docs/zeplin-specs/updated-wildfire-controls-and-labels.md`.

`Zone Conditions Display Button States` at (1760, 1025) draws the old expand-and-collapse sequence and is **superseded** by the 2026-08-28 design.

**The board does draw the labels in place**, once. The top-level `Sim` group at (30, 59), 1140 x 609, is a full app mockup (Question Header at 78,64, Time at 88,132, Wind Meter at 88,189, Fire Intensity Scale at 88,325), and it carries two `Zone Label Enhanced` groups at (310, 132) and (720, 132). What it settles:

- The labels are **top-aligned with the Time display**, both at y 132, which is what the app already does (both at `top: 32`).
- The key area ends at x 192, and the first label starts at x 310, so the design draws **118px of clearance** and no horizontal overlap at all.
- The two labels are **240px apart**, centered as a pair on the 1044-wide frame.
- The label's bottom edge lands at 192 against the Wind Meter's top at 189, reproducing the same 3px vertical band reach measured live.

It is a **two-zone case at one nominal frame width**, so it does not settle the three-zone crowding, and every number in the layout section above still came from the running app. What it does say is that the crowding is an artifact of narrow viewports rather than the design's intent, and it independently confirms the 170 x 60 box and the alignment with the Time display.

## Out of Scope

- **Textures on the zone labels.** WM-48 textures the 3D model and WM-53 the Setup panel thumbnails; neither touches the map's zone labels. WM-53 textured the Setup thumbnails with a masked tile layer (`VEGETATION_TILE_FILES` in `view-3d/terrain-textures.ts`) and left `vertical-selectors.tsx` alone; its spec's standing advice, since the shared `vegetationIcons` array reaches five components including this one, is that textured icons get a second export rather than a mutation.
- **Moving or resizing the Time and Wind Meter displays.** This story fits around that stack rather than redesigning it, and the overlap is now accepted rather than fixed.
- **A replacement shortcut into the Setup panel.** The design removes it and offers nothing in its place.
- **Re-pointing the story.** It was pointed 2 against the expandable design and is materially smaller now. Worth raising at grooming rather than deciding here.
- Accessibility review. Out of scope in this repo.

## Open Questions

### RESOLVED: Does `ZoneButtonClicked` survive, and in what form?

**Context**: `log("ZoneButtonClicked", { zone: zoneIdx })` has exactly one call site, inside the click handler this story deletes, so there is nothing left to fire it. It has **no consumer in the app**: it is not in `translate.ts`'s switch, so the Hazbot engine treats it as a no-op, and no rule-set names it. It is purely researcher-facing, which means removing it breaks no code and silently ends a longitudinal series.

**Options considered**:
- A) Remove it. Nothing can fire it, and an event that never fires is worse than an absent one.
- B) Keep the name, re-point it at something else the label still does.
- C) Remove it and add a note to `LOGGED-EVENTS.md` recording when it stopped and why.

**Decision**: **C.** Doug, 2026-08-28. Remove the call site and the row from the live table, and add a short note recording that the series ended, anchored to the app version and this story.

**This is the file's existing convention rather than a new one.** `LOGGED-EVENTS.md` already carries four prose subsections documenting discontinuities for whoever analyzes across them: the rule-set renumbering, `categoryId` on the coach-mark events, `feedbackLevel` not being monotonic, and `HazbotButtonClicked` versus `HazbotFeedbackShown`. Each exists to stop a researcher reading a break in the data as a finding. An event that silently stops firing is the same failure mode.

**Why not B.** There is nothing left for the label to do, so keeping the name alive means inventing a trigger, and it would silently change what the series means for anyone joining across the boundary. Note this is *not* the WM-47 case: that story relabeled Reload to Clear All and deliberately kept the event name `SimulationReloaded`, updating only its description, because the trigger survived under a new label. Here the trigger is deleted.

**Why not plain A.** The event has no in-app consumer, so its removal breaks no code, fails no test and surfaces nowhere. Nothing would signal that the series ended, and a researcher querying across the change would see the count fall to zero with no way to tell a deliberate removal from a deploy fault.

**Anchor**: the four existing notes use `appRulesVersion`, which is a Hazbot counter and does not apply here. **Nothing else in the payload does either**, which the note has to say rather than work around. `src/log.ts` forwards `(name, data)` and adds nothing of its own; the only version-like fields anywhere are `engineVersion` and `appRulesVersion`, both on `AnalysisEngineActivated`, which fires only on Hazbot-enabled pages. `ZoneButtonClicked` fires on every page, so even that partial anchor is missing from many of the affected sessions. Bumping `APP_RULES_VERSION` to manufacture one is not an option: it is a rules counter, and a bump would falsely signal a feedback change to every Hazbot query.

So the note anchors on **the deploy date**, which is the only thing a researcher can filter on, names the story and the release tag as human landmarks, and states plainly that no payload field distinguishes the two sides. Both the date and the tag are filled in at release rather than guessed now: `package.json` is at 1.5.0, the version bump is its own release commit unrelated to any story, and the number would be wrong if a release goes out first. Put it under Terrain & Settings, where the row lives today, so the table above stays a list of what fires now.

## Self-Review

Roles: Design Fidelity Reviewer, Senior Engineer, QA Engineer, Education Researcher. Accessibility is out of scope in this repo. Every issue below was checked against the running app, the Zeplin dump, the assets or a throwaway Jest run before being written down; the measurements that back each one are quoted inline.

### Design Fidelity Reviewer

#### RESOLVED: DF1. The board does draw the labels in place on the map, and the spec says it does not

The Zeplin section claims: *"The board does not draw the labels in place on the map, so every layout number in this spec came from the running app."* The dump contradicts it. The top-level `Sim` group at (30,59) 1140x609 is a full app mockup (Question Header at 78,64, Reload/Share/About, Terrain, Time at 88,132, Wind Meter at 88,189, Fire Intensity Scale at 88,325, CC Logo, Fullscreen icon), and it carries two `Zone Label Enhanced` groups at **(310,132)** and **(720,132)**, both 170x60, drawn with the new two-row content.

That drawing answers the question the spec says only the running app could answer, and it answers it differently:

- The labels are **top-aligned with the Time display** (both at y 132), which is what the app already does (both at viewport `top: 32`).
- The key area ends at x 192 (Time is 104 wide at x 88). The first label starts at **x 310**, so the design shows **118px of clearance**, not overlap.
- The two labels are **240px apart**, and the pair is centered on the 1044-wide frame (310 to 890, center 600 = frame center).
- The label bottom lands at 192 against the Wind Meter's top at 189, reproducing the same 3px vertical band reach the spec measured live.

Michael's acceptance of the overlap still stands, and the in-place drawing is a 2-zone case at a nominal 1044-wide frame, so it does not settle the 3-zone crowding. But the factual claim has to go, and the drawing is worth citing: it independently confirms 170x60, the top alignment with the Time display, and that the crowding is a narrow-viewport artifact rather than the design's intent.

**Suggested resolution**: correct the Zeplin section, cite the `Sim` mockup's coordinates, and keep the "every layout number came from the running app" point in the narrower form that is true: the board draws only the 2-zone case at one nominal width, so the 3-zone behavior at 1241 and 950 is still live-measured.


**Decision**: applied. The Zeplin section now cites the `Sim` mockup's coordinates and clearances, and the "every layout number came from the running app" claim is narrowed to what is true: the board draws only the two-zone case at one nominal width.
---

#### RESOLVED: DF2. The name blocks are not both two-line, and the drought box is 45 wide, not 44

Two requirements bullets read tighter than the board:

- *"Both names wrap to two lines as drawn: `Forest / w Suppr.` and `Severe / Drought`."* All four drought names are drawn on two lines (`Severe / Drought`, `Medium / Drought`, `Mild / Drought`, `No / Drought`), but only the abbreviation wraps on the vegetation side. `Grass`, `Shrub` and `Forest` are drawn as single lines: the examples group draws `Forest` at 1399,1164 as 35x16 inside a `Vegetation Type` group at 1399,1158 that is 48x**28**, i.e. one line vertically centered in the same two-line band (+6 top, +6 bottom). So the rule is a fixed 28px band, not "both names wrap".
- The measured table gives the drought name box as `44 x 28`. **The box is 45.** The `Drought Index` text group is 45 x 28 at rel 117 in all four drought rows; the 44 is the text bound inside it, the same way `Grass` reports 32 inside a 48 x 28 `Vegetation Type` group. Measured in the app's own loaded Roboto Condensed at 14/400, `"Medium"` is **44.61px**, which independently confirms 45 as the smallest whole pixel that holds it. `"w Suppr."` is 47.27px against the 48px vegetation box and `"Drought"` is 43.73px. (This bullet originally read the text bounds as the boxes and argued 45-for-Medium against 44-for-the-rest; DF3 in `implementation.md` corrects it. The number was right either way.)

At 45px every drought name breaks after its first word, as drawn.

**Suggested resolution**: restate the bullet as the drought name always occupying two lines and the vegetation name occupying one except for the abbreviation, both inside a 28px band; and correct the table to 45 for the drought name, with the 44.6px measurement as the reason.


**Decision**: applied. The requirements bullet now describes a fixed two-line 28px band with single-line vegetation names centered in it, and the table carries the board's uniform 45 x 28 `Drought Index` group with the 44.61px measurement as confirmation. Revised once more by DF3 in `implementation.md`: the first pass read the text bounds as the boxes.
---

#### RESOLVED: DF3. "The drought icon is 19 x 25" is the artwork inside a 20 x 28 asset

The requirement reads *"the drought icon is 19 x 25"*, taken from the board's `Drought <level> ICON` group. One level up, the board's `Drought Index` group is **20x28**, and the 19x25 icon sits at +0.5,+1.5 inside it.

The repo's assets are already exactly that. All four of `src/assets/terrain/drought-*.svg` are `width="20px" height="28px"`, and each opens with `<g transform="translate(0.5, 1.5)"><rect width="19" height="25">`. So the drawn 19x25 is the artwork bounds of a natively 20x28 asset, and rendering the SVG at its intrinsic size reproduces the board. Setting the element to 19x25 instead scales the glyph down about 5%.

The vegetation side genuinely does need a scale: `vegetation-*.svg` are all 28x28, and the board draws the icon at 26x26. The 1.5px white outline is a real additional layer there (`White Outline` shape, border 1.5px #ffffff, on every `Zone Label Enhanced`), not something the asset already carries, so requiring it is right.

**Suggested resolution**: state the drought icon as the 20x28 asset rendered at its intrinsic size with 19x25 artwork, and note that the vegetation asset is 28x28 rendered down to 26x26 plus the 1.5px outline.


**Decision**: applied. The requirement now states the drought icon renders at the 20 x 28 asset's own size with 19 x 25 artwork, and that the vegetation asset is the one that scales (28 to 26) and needs the outline added.
---

### Senior Engineer

#### RESOLVED: SE1. Holding 170 and the 10px floor together deepens the accepted overlap to 69.5px

The layout section accepts the overlap at the depth growing to 170 produces. But that depth is the one reached when the labels are allowed to sit at their min-content 169 and the gap to collapse to 0, which is the state the 10px floor exists to prevent. Enforcing both requirements moves the number again.

Measured live at 950x880, three zones, graph open, with `flex-shrink: 0`, `width: 170px` and `gap: 10px` applied through the DOM:

| | First label left | Gap | Clearance from the left stack |
|---|---|---|---|
| As built (142) | 73.4 | 23.1 | -40.6 |
| At 170, shrinking allowed | 56 | 0 | -58 |
| **At 170 with the 10px floor** | **44.5** | **10** | **-69.5** |

The third label overflows the 80%-width row by 17.4px, ending at x 574.5 against the graph panel's left edge at 633, so nothing collides on the right and nothing is clipped: the entire cost of holding the gap lands on the left, as a further 17.4px behind the Time display. `document.elementsFromPoint` at the vegetation icon still returns the Time display on top.

This is not an argument against the floor. It is that the spec records an accepted consequence of 58px that its own requirements make 69.5px, and the accepted-overlap bullet is the one thing in this story that came from Michael rather than from measurement.

**Suggested resolution**: put the 69.5px figure in the layout section as the depth the requirements actually produce, and say plainly that the accepted overlap is at that depth. If 69.5 is more than was accepted, the 10px floor and the 170px width are the two dials, and that is a question for Michael rather than a decision to take here.


**Decision**: A, Doug, 2026-08-28. Keep 170 x 60 fixed and the 10px floor, and record 69.5 as the depth the requirements actually produce. The design is the design, the target device never sees the overlap (it begins below about 1206px of viewport width), and at 950 the app is already 40.6px into the stack today. The measured alternatives are written into the layout section as rejected, with why. Michael gets the changed depth as an FYI rather than as a blocker.
---

#### RESOLVED: SE2. Out of Scope misstates what WM-53 did, and three line references have drifted

Out of Scope says: *"The shared `vegetationIcons` array reaches this component, which is why WM-53's spec adds a second export rather than mutating it."* WM-53 added no second icon export. It added `VEGETATION_TILE_FILES` and `TILE_DIR` in `src/components/view-3d/terrain-textures.ts` and a masked texture layer in `zone-selector.tsx`; `vertical-selectors.tsx` is untouched and still exports `vegetationIcons` and `droughtIcons` only. What WM-53's spec actually says is conditional advice: *"If textured icons are ever wanted, add a second export rather than mutating these."*

The point the bullet is making survives and is worth keeping, since `vegetationIcons` does reach five components including this one. Only the claim about what WM-53 did is wrong.

Three line references have also drifted:

- `ui.terrainUISelectedZone` is `ui.ts:18`, not `ui.ts:14`.
- `vegetationLabels` in the `SimulationStarted` payload is `bottom-bar.tsx:301`, not `:297`.
- The wizard-driving write in the terrain panel test is `terrain-panel.test.tsx:508`.

Everything else checks out: `simulation-info.tsx:20/35-41/38`, `terrain-panel.tsx:44/52-62`, `types.ts:23/49`, `vegetation-selector.tsx:34`, `terrain-summary.tsx:24`, `sim-props.test.ts:242`, `common.scss:46-48` and `cypress/support/elements/ModelInfo.js:9` are all exact. Separately, the board draws twelve `Zone Label Enhanced` groups (three per row across four drought rows at y 1064, 1134, 1204 and 1274), not three; the 10px spacing the spec derives from x 1360/1540/1720 is right.

**Suggested resolution**: rewrite the WM-53 clause to say what WM-53 actually did and that its spec advises the second export if textured icons are ever wanted here; fix the three line numbers and the "three groups" count.


**Decision**: applied. The WM-53 clause now says what WM-53 actually did and carries its advice as advice; `ui.ts:18`, `bottom-bar.tsx:301` and `terrain-panel.test.tsx:508` are corrected, along with the group count on the board.
---

### QA Engineer

#### RESOLVED: QA1. A third test does not go stale, it fails

Technical Notes lists `terrain-panel.test.tsx` under what removing the click orphans, and describes the consequence as documentation drift: *"both the test and its comment describe a caller that no longer exists."* Test Fallout then covers only `simulation-info.test.tsx` and concludes *"Deleting two of four tests is the expected outcome here."*

It is three tests, and the third one breaks. Removing the `ui.terrainUISelectedZone` effect (`terrain-panel.tsx:52-62`) and the `|| 0` fallback and running the suite gives **1 failed, 24 passed**: test (o), *"reach the wind panel, click a zone tile, Cancel, the tile jump does not erase reachedWind"*, fails at `expect(screen.queryByTestId("terrain-wind")).not.toBeInTheDocument()`. The write no longer forces the wizard off the wind panel, so the wind panel is still mounted.

Deletion is the right disposition, because the route the test guards stops existing with the effect. But it is a suite-red-on-the-commit item rather than a comment to tidy, and the count in Test Fallout is wrong.

**Suggested resolution**: move the terrain-panel test into Test Fallout with an explicit "delete" disposition, note that leaving it in place turns the suite red, and correct the framing so the story deletes three tests across two files.


**Decision**: applied. Test (o) moves into Test fallout with a delete disposition and the measured `1 failed, 24 passed`, and the section now says three tests across two files. Verified that nothing is lost: test (n) already pins the same assertion through the Previous route, which is the only route left.
---

#### RESOLVED: QA2. The Cypress guard the spec calls for cannot fail at the viewport Cypress runs

The spec identifies the coverage gap correctly: *"The layout requirement is not assertable in Jest, because jsdom does no layout. The 10px floor and the 170 x 60 box need Cypress or they are not guarded at all."* It then stops, without either requiring the Cypress coverage or putting it out of scope, and without naming the condition the assertion has to run under.

The condition is load-bearing. `cypress.config.ts` sets `viewportWidth: 1400, viewportHeight: 1000`. Measured at 1400x1000, three zones, graph open, with the labels forced to 170x60: the gap is **203.3px** and the clearance from the left stack is **127.7px**. A `gap >= 10` assertion written against the default viewport passes whether or not the floor is ever implemented, which makes it the kind of test that cannot fail. The collapse only appears at viewports around 950 wide, so the test needs an explicit `cy.viewport(950, 880)` (or narrower) to have anything to catch.

The box-size half is fine at any viewport once shrinking is off, since 170x60 is then unconditional.

**Suggested resolution**: turn the observation into a requirement or an explicit out-of-scope. If it is in scope, say that the gap assertion runs at a narrow viewport and name it, so the test is written against the width where the failure exists.


**Decision**: A, Doug, 2026-08-28. Both halves are in scope. The box is asserted at the default viewport and the floor at a three-zone preset with the graph open at `cy.viewport(950, 880)`, the conditions named in Test fallout so the case is not written where it cannot fail. It goes in a new `zone-label-visuals.cy.ts`, following the `<region>-visuals.cy.ts` convention; see the implementation spec.
---

### Education Researcher

#### RESOLVED: ER1. The `ZoneButtonClicked` note's version anchor cannot be used to segment the data

The resolved decision anchors the discontinuity note to the app version: *"the note should say it stopped firing in 1.6.0 (WM-49)."* Two problems, both checkable.

**No log payload carries the app version.** `src/log.ts` forwards `(name, data)` to LARA and the log monitor and adds nothing of its own; the only version-like field anywhere in the payloads is `appRulesVersion` on `AnalysisEngineActivated`. That is exactly why the four existing notes anchor on `appRulesVersion`: a researcher can segment on it. "1.6.0" is not in the data, so a reader of the new note cannot turn it into a filter.

**1.6.0 is a guess.** `package.json` is at `1.5.0`, and the bump is its own release commit (`build: Update to v1.5.0`, `build: Update version to 1.4.0`), unrelated to any story. Whether this lands in 1.6.0 is not this story's to decide, and the number would be wrong if a release goes out first.

The spec already notices half of this (*"the four existing notes use `appRulesVersion`, which is a Hazbot counter and does not apply here"*) and then reaches for a substitute that is not in the data either. `ZoneButtonClicked` fires on every page, Hazbot-enabled or not, so `appRulesVersion` is unavailable on many of the affected sessions even in principle.

**Suggested resolution**: anchor the note to the deploy date, which is what a researcher can actually filter on, and state outright that there is no in-payload discriminator, so the boundary has to be read from timestamps. Naming the story stays useful; naming a version number that is neither settled nor queryable does not.


**Decision**: C, Doug, 2026-08-28. The note anchors on the deploy date, carries the story id and the release tag as landmarks, and says outright that no payload field marks the boundary. Date and tag are filled in at release, not guessed. This revises the anchor inside the resolved `ZoneButtonClicked` question above; the decision to write the note is unchanged.
---

#### RESOLVED: ER2. A second `LOGGED-EVENTS.md` entry is invalidated, and the spec only plans to touch one

The spec plans a `ZoneButtonClicked` edit: remove the row, add the note. A second entry in the same file describes the same disappearing interaction. `LOGGED-EVENTS.md:46`, on `TerrainPanelClosed`:

> `reachedWind` is whether they ever got to the wind panel during this visit, which is not the same question: **Previous and a zone-info-tile click** both walk a student back off it, so `panel: "conditions"` with `reachedWind: true` is a normal reading.

That sentence is the reader's guidance for interpreting a real parameter, and it names the zone-info-tile click as one of two routes. After this story the route is gone and Previous is the only one, which changes how a `panel: "conditions"` with `reachedWind: true` reading should be read going forward. It is also the exact behavior test (o) in QA1 guards, so the code, the test and the prose all describe the same vanishing path.

**Suggested resolution**: add the `TerrainPanelClosed` description to the list of documentation this story updates, leaving Previous as the sole named route, and note the boundary the way the file's other notes do.


**Decision**: applied. The `TerrainPanelClosed` description joins the orphan list, to be updated so Previous is the sole named route.
---
