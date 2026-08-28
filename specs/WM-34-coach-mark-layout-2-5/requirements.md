# WM-34: Update the coach mark layout for 2.5 (placing sparks on top/bottom of mountains)

**Jira**: https://concord-consortium.atlassian.net/browse/WM-34
**Repo**: https://github.com/concord-consortium/wildfire-model
**Status**: **In Development**

## Overview

Ruleset 25's category-4 coach mark, the one that tells a student to place a spark at the top of a mountain in one zone and at the bottom in the other, gets a new figure. Michael's 280px-compatible redraw has landed as an exportable Zeplin asset, so the story is implementable: swap the image and its declared dimensions in `tour-map.tsx`, delete the asset it orphans, and tighten the figure test. No open questions: the one content loose end, a spreadsheet cell that still describes arrows, is settled below as a notification to Trudi rather than a dependency.

## Project Owner Overview

The coach mark that explains "put one spark high and one spark low" currently shows a single mountain image above its text. The workshop design replaced that with a richer two-panel illustration, but as drawn it was nearly twice as wide as every other coach mark in the system and added arrows the coach-mark library does not support. Michael agreed to redraw it to fit the standard 280px bubble, and on 2026-08-24 he delivered: two side-by-side mountain panels, each with a spark marker placed high or low and its own label, sitting beside Hazbot with the instruction text beneath.

That keeps all the expensive work off the table: no library change, no version publish, no cross-repo coordination. What remains is a one-line swap in this repo. The one thing the redraw changed rather than preserved is the arrows: they are gone, replaced by labels drawn into the panels, which leaves the feedback spreadsheet describing arrows that no longer exist.

## Background

The coach mark in question is ruleset **25, category 4**. Its two steps are generated from the feedback spreadsheet; only its figure is hand-authored, in `tour-map.tsx:85`:

```
4: () => [anchor("restart-button"), viewportTop(<img src={mountainsImg} width={191} height={122} alt="" />)],
```

so the tour is a Restart step followed by a no-pointer centered-top bubble carrying the illustration, and the illustration is the only part this story touches.

**The spreadsheet describes the figure, in the same row as the text.** 25/4's `visualFeedback` cell (`rule-sets/25.ts:59`) reads *"Coach mark (no pointer) with images of the bottom of a mountain and top of a mountain plus arrows pointing to these, centered top"*. That is the authored source for what the picture is supposed to show, it names the arrows explicitly, and the redraw does not have them. Settled under Resolved Questions: Trudi is told, the cell is hers to edit, and nothing waits on it.

**The redraw is `Mountains with Labels` on the *Updated Wildfire Controls and Labels* screen** ([6a8566a1](https://app.zeplin.io/project/5fe47ae231d1f6a428c53450/screen/6a8566a1c90489f7be36e66a)), an exportable group at (1682, 391), **200 x 128**, available as PNG and JPG at 1x through 4x. It is two panels, `Bottom of Mountain` and `Top of mountain` at 98 x 128 each with a 4px gutter, each carrying a baked-in `Spark Marker` (24 x 31) and a baked-in white label ("bottom of mountain" / "top of mountain"). The same board carries the two panels as separate exportables and a label-free `Mountains` (200 x 128) variant, neither of which this story uses. Michael also attached the composed mock to the ticket on 2026-08-24 (`image-20260824-093912.png`), which is what the figure looks like in place.

**The old wide draw is stale, not current.** The *Hazbot Coach Mark Wildfire Overlay and UI Updates* board still carries the un-buildable 498 x 192 `Coach Mark back` at (5410, 5605), still the only non-280 full-size mark of the 31 on that board. It is superseded by the asset above. Anyone reading that board first will reach the wrong conclusion, which is why the asset's location is named here.

## Requirements

- Ruleset 25 category 4's coach-mark figure is replaced by the `Mountains with Labels` export, added under `src/assets/hazbot/`.
- The figure is declared **191 x 122** in `tour-map.tsx`. 191 is the width the figure has beside the Hazbot avatar, derived and measured under Technical Notes; 122 preserves the asset's 200:128 aspect. A figure of 192 or more does not overflow: it silently relocates below Hazbot.
- The 2x PNG export (400 x 256) is the source, matching the existing convention of a 2x raster displayed at half size. It is still above 2x at the declared 191 x 122.
- `src/assets/hazbot/mountain.png` is **deleted**. This story removes its last caller, and it is the only other file in that folder.
- The dimension comment above 25/4 loses its placeholder narrative, which explained 179 x 120 by reference to a 240 x 120 placeholder that no longer exists. What replaces it is a single line naming the 191 bound, matching the one-line comments on the sibling entries in the same block.
- **The arrows are gone**, replaced by the labels drawn into the panels. Nothing is added to put them back, and the spreadsheet cell that still asks for them is handled by telling Trudi rather than by holding the story.
- No change to `@concord-consortium/coachmarks`: no per-step width override, no side-figure layout, no `pre.N` publish, no repin.
- The tour's **step count stays 2**, so `tour-map.test.ts`'s step-count and anchor invariants hold and `tour-data.generated.ts` is untouched.
- **`tour-map.test.ts` gains a figure invariant.** For every viewport step in `tourMap` that carries a figure: the image is an `<img>`, it declares a positive `width` and `height`, and the declared width is at most 191, with the 191 a named constant carrying the derivation it comes from. The existing 25/4 test keeps pinning that the terminal step is a centered-top viewport bubble, and sheds the weaker figure-presence assertion the invariant now subsumes. Mutation to catch: declaring the asset at its native 200 must turn the invariant red, because that is the mistake this story invites.
- The authored step text is unchanged. This story replaces artwork, not copy.

## Technical Notes

Measurements were taken in Chrome against `@concord-consortium/coachmarks@0.0.1-pre.9`'s own stylesheets, and the Zeplin figures re-checked, on 2026-08-28.

**The usable content width is 250px.** `.coachmarks-popover` is `width: 280px` with 3px borders (`hazbot.css:30-34`, under the comment *"Design: all coach marks are 280px wide"*), giving a 274px content box, and `.coachmarks-popover-content` has 12px padding, leaving 250px. The theme reaches this app through a single import, `hazbot-button.tsx:17`.

**But the figure only gets 191px of that, because of the Hazbot avatar.** The avatar (`hazbot.css:158`) is `float: left`, 52 x 52, `margin: -5px 12px 0 -5px`, so its margin box occupies 59px measured from the content edge (-5 overhang + 52 + 12 gap). The figure's `<img>` is set `display: block` (`base.css:148-152`), which makes it a block-level replaced element, and per CSS 2.1 §9.5 such a box may not overlap a float's margin box. So the figure's real budget is **250 - 59 = 191px**, and the `shape-outside: circle(50%)` on the avatar does not soften it, since that shapes line boxes and not block-level boxes.

**The 191 boundary is a cliff, not a squeeze, and it was measured rather than derived.** Rendering the popover markup against the shipped `base.css` + `hazbot.css` at declared widths of 179, 185, 190, 191, 192, 196, 200 and 250: everything at or below 191 sits beside the avatar at a 59px offset; everything at 192 and above drops onto its own line below the avatar, at a 12px offset, leaving Hazbot alone on a line with empty space beside it. Confirmed with the real asset: at its native 200 x 128 the figure renders below Hazbot and the bubble is 380px tall, while at 191 x 122 it renders beside Hazbot and the bubble is 327px tall, which is the arrangement Michael drew. This is why the requirement names 191 and the test bounds on it: **250 is the wrong ceiling for this coach mark**, and a test written against 250 would pass the 200px asset that renders wrong.

**Today's figure already proves the mechanism.** The current 179 x 120 mountain sits beside the avatar at exactly the 59px offset, both in the running app and in the ticket's own "Current" screenshot. Nothing about the layout is new work; only the number changes.

**There is no height constraint.** Neither stylesheet sets a `max-height` on `.coachmarks-popover`, so the bubble simply grows to 327px. It is a `viewportTop` bubble in a 609px viewport, so it fits, but it is roughly 80px taller than today's and is worth one look in the running app.

**The figure slot is a block between title and description.** `dist/index.js:914-921` renders `<div class="coachmarks-popover-figure">` after the title and before the description, and `base.css:144-152` gives it `margin: 0 0 10px` with `:is(img, svg) { display: block; max-width: 100%; height: auto }`. Two consequences: the figure is always above the text, which is the layout the redraw is drawn for; and SVG would be a first-class option, though the export we are taking is raster.

**An oversized figure fails quietly, in two different ways.** `max-width: 100%` resolves against the 250px content box, not the 191px slot, so a figure between 192 and 250 is not scaled down and not clipped: it just moves. Above 250 it would scale down and look plausible, only smaller than intended. Neither failure throws, which is the whole reason the width is asserted rather than reviewed.

**The asset this replaces.** `src/assets/hazbot/mountain.png` was 358 x 240 intrinsic, rendered at 179 x 120, a 2x asset displayed at half size, and the only file in `src/assets/hazbot/` (82KB). The new export at 2x is 400 x 256 and 58KB.

**The in-repo change is one line plus an asset.** `tour-map.tsx:85` is the whole behavioral surface: swap the import and the two numbers. `buildTour` zips the map's anchors with the generated text, the step count is unchanged at 2, and `tour-data.generated.ts`, `build-tour.ts` and the spreadsheet are all untouched.

**Nothing in this repo can assert the 280px itself, and that stays true.** The width lives in `dist/styles/hazbot.css` and arrives via a CSS import that jsdom never evaluates, so any Jest assertion about it would be measuring nothing. What is assertable is the figure's own declared width against the 191 constant, which is the direction the risk actually runs: a library change to the popover width is a repin nobody makes silently, whereas an oversized figure is a one-line change anybody can make on a Tuesday.

## Out of Scope

- **Any change to `@concord-consortium/coachmarks`.** The wide-variant branch (per-step width override plus a side-figure layout, then a `pre.N` publish and repin) is closed by Michael's 280px redraw.
- **Re-exporting the asset at 191 wide.** Decided below in favor of declaring the downscale in code.
- **The zone-differentiation legibility tweak.** Teacher-workshop feedback in Sam's design doc asked that the two zones in this figure be visually differentiated. Michael has now drawn the figure with both panels the same green, so this reverts to what it was before: a later image swap if the PIs want it, not a blocker. The app's own zone tints (`#ffd8fa` Zone 1, `#d6ecff` Zone 2) remain the ready-made way to do it.
- **The authored step text** for 25/4, which comes from the spreadsheet.
- **Narrowing `viewportTop`'s `ReactNode` parameter.** Rejected in favor of the width invariant, which covers the same risk for every figure rather than only for well-typed ones.
- **Any other coach mark.** This is one entry in `tour-map.tsx`.
- **Accessibility review**, per the standing scope for this repo.

## Resolved Questions

### RESOLVED: The spreadsheet still asks for arrows the redraw does not have. Does the cell change?
**Context**: 25/4's `visualFeedback` (`rule-sets/25.ts:59`) reads *"…with images of the bottom of a mountain and top of a mountain plus arrows pointing to these, centered top"*. Michael's redraw carries no arrows; the two panels are labeled "bottom of mountain" and "top of mountain" instead, which does the same job inside the artwork. Once this ships, the authored cell describes something that does not exist. **This is Trudi's call**, not Michael's and not Sam's: `visualFeedback` says what the student sees, which is content, rather than what makes a category true, which is rules. The cell is authored in the feedback spreadsheet and extracted into the repo, and `tour-map.tsx`'s header comment names that column as the source the anchors derive from. It is the same authored-versus-implemented drift WM-47's pass had to write a requirement against for the Reload rename.
**Options considered**:
- A) Trudi edits the cell to describe labels rather than arrows, and we re-extract. The sheet and the artwork agree again; costs a sheet edit plus a re-extract that touches `25.ts`.
- B) Leave the cell alone and record the drift here. Costs nothing now; the next person to read the cell is misled.
- C) Ask Michael to add arrows to the artwork. Reopens a design Michael has already closed twice, and the labels arguably read better in a 191px slot than arrows would.

**Findings:** the student-side reasoning that originally kept the arrows is satisfied by the labels, so this is now a bookkeeping question rather than a design one. The arrows mattered because the figure carries the spatial idea and something has to bind each picture to the right half of the sentence; a label reading "top of mountain" binds it at least as directly as an arrow does, and does it without protruding from the bubble. So C has little to recommend it. Between A and B, note that nothing enforces the link: the extractor's only structural guard (`tour-data-impl.js:119-120`) compares the count of numbered lines in `visualFeedback` against the `arrowText` step count and is blind to what they say, so B genuinely does go unnoticed.

**Decision**: **B, deliberately, and it blocks nothing.** The artwork is agreed and the code does not read `visualFeedback`, so there is no reason to hold the story on a spreadsheet edit. Trudi gets told rather than asked: the arrows-to-labels change goes into the Slack message that shares the branch build, and into the comment on the Jira move to Ready for Review. She can edit the cell whenever it suits her, and the re-extract picks it up on its own schedule. Recording it in both places is what keeps B from being the silent version of B, since nothing in the extractor can catch this drift on its own.

---

### RESOLVED: Does the story wait for the redraw, or ship an interim figure?
Moot. The redraw landed on 2026-08-24 as `Mountains with Labels`, and the ticket's two-month block is over. Recorded only so the earlier "blocked, and not visibly so on the board" note is not re-raised: it is no longer true, and the Jira status can move.

---

### RESOLVED: Side by side or stacked?
**Side by side**, settled by the artwork rather than by argument: the export is 200 x 128, two 98 x 128 panels with a 4px gutter. The 280px system never forced stacking, and the drawn comparison survives.

---

### RESOLVED: Do we re-export at 191, or declare the downscale in code?
**Declare it in code, at 191 x 122.** The asset is 200 x 128, which is 9px over the slot, and the fix is a 4.5% downscale of a 2x source, so the rendered figure is still above 2x and the baked-in label text holds up (checked visually against the shipped CSS). Asking for a re-export would cost a round trip with Michael for a difference no student can see. Worth telling him the ceiling for future coach-mark figures is 191px, not 250 and not 280, since the same trap catches the next one.

---

### RESOLVED: What asset format and density?
**The 2x PNG**, matching the 2x-displayed-at-half-size convention `mountain.png` set. The library's figure rule is `.coachmarks-popover-figure :is(img, svg)`, so SVG would have been equally welcome, but the export is a rendered terrain scene rather than vector art and Zeplin offers it as PNG or JPG only. PNG for the transparent gutter between the panels.

---

### RESOLVED: Should the arrows be replaced by something supported, or dropped?
**Superseded by the redraw.** The earlier decision was to draw the arrows inside the figure, on the grounds that the authored cell asks for them and the library neither knows nor cares what is inside an image. Michael's redraw instead drops them and labels the panels, which meets the same need. What survives from that decision is the reason it was made: the authored cell and the artwork have to agree with each other, which is why Trudi is told about the change rather than left to find it.

## Resolved Decisions From Review

- **The figure's dimensions are no longer a magic pair.** 179 x 120 was explained by a placeholder that no longer existed. 191 x 122 has a stated ceiling, a named source for that ceiling, and a test that fails when it is exceeded, and the old comment goes.
- **The story is testable from Jest, which it was once assumed not to be.** The declared `width`/`height` are React props that become DOM attributes and survive jsdom intact; only the *rendered* size needs CSS, and the rendered size is not what needs pinning. The 25/4 test already pinned that its terminal step carries a figure; this story moves that assertion into an invariant that also checks the element and its declared dimensions.
- **The invariant walks every factory, not just 25/4.** 25/4 is the only viewport step carrying an image today, but the check covers entries that do not exist yet, which is the case a type narrowing on `viewportTop` would not have covered anyway.
- **The figure and the authored text are linked, but only by convention.** 25/4's row carries both `arrowText` and `visualFeedback`, both of them content columns and both Trudi's, so the picture is described in the same place as the words and by the same author. Nothing enforces it; whoever changes one side changes both in the same pass. This story is the exception that proves it, which is why the arrows change is put in front of Trudi explicitly.
