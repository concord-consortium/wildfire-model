# WM-35: Wind Meter display label sometimes wraps to 3 lines

**Jira**: https://concord-consortium.atlassian.net/browse/WM-35
**Repo**: https://github.com/concord-consortium/wildfire-model
**Status**: **In Development**

## Overview

The on-map Wind Meter's label is fixed at 68px inside a 97px container, so longer readings wrap to three lines and push the compass dial 11px out of the bottom of the box. **189 of the 496 readings the slider can produce, 38%, render three lines today.** Widening the label to 81px keeps every reading on two lines, for any speed value, and puts the dial back inside the container, matching the design.

## Project Owner Overview

The Wind Meter in the upper-left key area reads "10 MPH from the NNE". For most wind settings that fits on two lines, but for well over a third of them it wraps to three, and the extra line pushes the compass dial down through the bottom of its white box so the dial hangs outside the panel. It looks like a rendering bug because it is one.

The fix is a single width change to the text label. Michael's revised spec confirms the dial belongs inside the box, and Trudi signed off on that revision, so there is no longer any question of preserving the overhang. This is a contained CSS fix. It does change where the label breaks for many readings, which is unavoidable: making the text fit means giving it more room, and more room moves the break.

## Background

The label is rendered in `simulation-info.tsx` as `` `${Math.round(scaledWind)} MPH from the ${degToCompass(direction)}` ``, styled by `.windText` in `simulation-info.scss` at a hardcoded `width: 68px` inside a `97 x 126` `.windContainer` with no `overflow: hidden`. Its siblings are `.windHeader` (a 14px Lato line with 6px top padding) and `.windDial` (a 59px square). All three are in normal flow, so an extra line of label pushes the dial down by one line box.

**The scope halved on 2026-08-21.** The ticket originally described two coupled changes, because Trudi's 2026-08-03 comment asked for the dial's rounded bottom to protrude at all times, which meant stopping the wrap would have to be paired with shrinking the container to about 109px to preserve the overhang. Michael rewrote the description at 02:46 EDT: *"Since we're moving the Fire Intensity Scale beneath the Wind Meter (when authored), keeping the rounded bottom is no longer desirable."* Trudi replied *"Looks good, thank you,"* at 09:43 the same day. So the overhang is not wanted, the container keeps its 126px height, and stopping the wrap is the entire fix. **The description still carries the superseded analysis below Michael's paragraph**, including the "keep that protrusion" instruction and the 109px figure; both are dead.

## Requirements

- The Wind Meter label never renders more than two lines for any reading the model can produce, **including authored ones outside the slider's range**, at the label's shipping font (`'Roboto Condensed'` 14px). The guarantee is measured against that font by design; see the font-fallback note in Technical Notes.
- `.windText` widens from 68px to **81px**. `.windContainer`'s box is unchanged: it stays `$keyAreaWidth` x `$windContainerHeight` (104 x 126 on this branch, since WM-52 sets the width), and its height in particular is not reduced.
- 81px is chosen because it clears `"from the WNW"`, which measures **80.03px** and is the binding line at every speed. Above that width the two-line guarantee stops depending on the speed value at all: verified across speeds from 0 to 123456, no reading produces three lines. 74px, the minimum for one- and two-digit speeds, is **not** sufficient, because a three-digit reading is reachable today (see the resolved questions below).
- The compass dial sits fully inside the container in every state, 5px above its bottom edge, matching the design.
- The two-line break point is unchanged for the shortest reading: "0 MPH from the N" still renders as "0 MPH from" / "the N".
- **Mid-length readings do re-break, and that is accepted.** 336 of the 496 slider readings change their break point at 81px, of which 189 are the three-line readings being fixed, leaving 147 that were already two lines and now break in a different place. This is identical at 74px, so it is a consequence of fixing the bug rather than of the width chosen.
- The label stays horizontally centered in the container.
- The chosen width is recorded in a comment naming the string it was measured against (`"from the WNW"`, 80.03px) and its relationship to the container (sized against the string, not `$keyAreaWidth`, which it only has to fit inside), so a later font, copy, or container change can be re-checked rather than re-derived. The comment does not repeat the font, which is declared two lines above it in the same rule.
- **A Cypress regression test pins both the cause and the symptom**, in one spec: the label's rendered height is 32px (two 16px line boxes) and the dial's bottom is inside the container's bottom. Reverting `.windText` to 68px must turn both red. The worst cases to drive it with are `"10 MPH from the NNE"` (the worst reading in the slider's range) and `"150 MPH from the WNW"` (reachable through `?windSpeed=30`, and the case 74px does not fix).
- The test drives state through URL params rather than `window.sim`: `?windSpeed=2&windDirection=22.5` renders exactly `"10 MPH from the NNE"`, and `?windSpeed=30&windDirection=292.5` renders `"150 MPH from the WNW"`. Both verified live.
- A `data-testid` is added to `.windText`, `.windContainer` and `.windDial` (`wind-meter-label` / `wind-meter` / `wind-meter-dial`). None carries one today, and there is no wind-related test id anywhere in the app. The dial's was not in the original list but the dial-position assertion needs to select it, and giving all three ids keeps the new spec from mixing test ids with the hashed-class selectors `key-area-visuals.cy.ts` uses.
- **The test must be a browser test.** jsdom performs no line breaking, so the same assertion written in Jest reports a constant height at any width and passes against the unfixed code.
- **The label's text content is covered in Jest**, in `simulation-info.test.tsx`, which asserts nothing about the readout today. Geometry stays in Cypress for the reason above, but the string is a pure function of `wind.speed`, `windScaleFactor` and `degToCompass`, so a unit test pins it: dropping the scale division or the `Math.round` must turn it red.

## Technical Notes

Every number below was measured live in Chrome against the running dev server, at the label's real computed font (`normal 400 14px "Roboto Condensed"`, line box exactly **16px**). Nothing here is inferred from undeclared line-heights, which is what the previous estimates in the ticket and in `sprint-24-mechanisms.md` were.

**The bug, reproduced and measured.** With the wind set to 2 (scaled to 10 MPH) at 22.5 degrees, the label reads "10 MPH from the NNE" and renders **3 lines** (48px). The dial's bottom lands at 226 against a container bottom of 215: an overflow of exactly **11px**, not the ~14px the ticket estimates. The content stack reaches 137px inside a 126px box.

**The bug is the common case, not an edge case.** Of the 496 readings the slider can produce (speeds 0 to 30 crossed with the 16 compass points), **189 render three lines** at today's 68px. Every one of them hangs the dial 11px out of the box.

**The fix, verified on the same string at both candidate widths.** Setting `.windText` to 74px or to 81px both drop "10 MPH from the NNE" to **2 lines** and put the dial bottom at 210 against a container bottom of 215, 5px inside. The container height never changes, and the two widths are indistinguishable on this reading.

| `.windText` width | Worst slider reading | Dial vs container bottom |
|---|---|---|
| 68 (today) | 3 lines | 11px **outside** |
| 74 | 2 lines | 5px inside |
| 81 | 2 lines | 5px inside |

**The binding constraint is the compass line, not the speed.** `"from the WNW"` measures **80.03px**; the longest speed line tested, `"123456 MPH"`, measures only 71.7px, and `"99999 MPH"` 64.8px. So once the label is wide enough to hold `"from the WNW"` on one line, the speed magnitude cannot add a third line. Scanned across speeds 0, 7, 10, 30, 99, 100, 150, 999, 1000, 8888, 99999 and 123456 crossed with all 16 compass points: **at 81px there are zero three-line readings; at 74px there are 35**, all of them at three or more digits. This is why 81 is a different kind of number from 74. 74 is the minimum for the strings the slider happens to produce today; 81 is the width at which the guarantee no longer has a premise that can change.

| Speed range | Minimum `.windText` width for 2 lines |
|---|---|
| 0 to 30 (the slider's range) | 74px |
| 0 to 99 | 74px |
| Any value, up to 123456 tested | **81px** |

**The 81px guarantee is measured at Roboto Condensed, and that is the right basis.** The font is loaded from `fonts.googleapis.com` (`src/index.html:10`) and `.windText` declares `font-family: 'Roboto Condensed'` with no fallback stack, so a failed font load renders the label in the browser's default. Line counts for the worst in-range reading, `"10 MPH from the NNE"`, measured live:

| font | 68 | 74 | **81** | 88 | 97 |
|---|---|---|---|---|---|
| Roboto Condensed | 3 | 2 | **2** | 2 | 2 |
| serif (Chrome's default) | 3 | 3 | **2** | 2 | 2 |
| Arial | 3 | 3 | **3** | 2 | 2 |

**Do not widen past 81px on the strength of that table.** The app has no fallback stacks anywhere: of its 26 webfont `font-family` declarations, 24 are bare names (14 `Lato`, 10 `'Roboto Condensed'`); only `hazbot-button.scss:69` and `$scaleFont` (`common.scss:31`, used once) carry one. So a failed font load reflows the entire UI, not this label, and sizing one label for a state in which everything else is already wrong buys nothing while re-breaking readings that 81px leaves alone.

**A three-digit reading is reachable today, through a documented URL param.** `?windSpeed=30` renders **"150 MPH from the WNW"**: three lines, dial 11px outside the container, verified live. The cause is a unit inconsistency rather than an extreme authored value. `simulation.ts:315` assigns `this.wind.speed = config.windSpeed` **raw**, while every other writer of that field multiplies by `windScaleFactor` (the slider at `wind-circular-control.tsx:59` and `:64`, the mid-run re-wind at `simulation.ts:508`) and both displays divide by it (`simulation-info.tsx:32`, `wind-circular-control.tsx:69`). With the default `windScaleFactor: 0.2`, an authored `windSpeed` is therefore shown at **five times** its value. The two shipped presets set `windSpeed: 1` and display "5 MPH". This is not WM-35's defect, but it is what makes 74px insufficient, and it is raised as an open question below.

**The break-point churn, quantified.** Comparing every one of the 496 slider readings at 68px against the same reading at the new width: **336 change their break point**, at 74px and at 81px alike (identical counts). 189 of those are the three-line readings being fixed, so **147 readings that already rendered acceptably now break in a different place**, for example `"10 MPH from the N"` moving from `"10 MPH" / "from the N"` to `"10 MPH from" / "the N"`. The shortest reading, `"0 MPH from the N"`, is unchanged at both widths. Every reading changes its break at 88px and above, which is one reason not to let the label fill the container.

**The Zeplin label frame is not a spec for this story.** On the *Updated Wildfire Controls and Labels* board, the Wind Meter's label is drawn 68 x 32 at a centered 18px inset, and that box holds `"0 MPH from\nthe N"`: two 16px lines of **the shortest string the meter can display**. Implementing the drawn 68px exactly reproduces the defect. The rest of the drawn stack, however, is exactly what the current CSS already produces at two lines, which is the strongest evidence that the label width is the only thing wrong:

| Piece | Board (relative to container) | Current CSS |
|---|---|---|
| `.windHeader` | y 6, 17 tall | `padding-top: 6px` + one 14px Lato line |
| `.windText` | y 28, 32 tall (2 x 16) | `margin: 5px auto 0`, two 16px lines |
| `.windDial` | y 62, 59 tall, ends at 121 | `margin: 2px auto 0`, 59px square |
| container | 126 tall, dial 5px inside | 126 tall, dial 5px inside **at 2 lines** |

**The in-repo precedent converges on the same number, which removes the argument against it.** The Setup panel's own wind readout solved this problem differently: `wind-circular-control.tsx:90` authors an explicit break, `` `${speed} MPH\nfrom the ${dir}` ``, and `wind-circular-control.scss:69-70` pairs it with `white-space: pre-line` and a comment reading *"fit 'from the WSW' (~73px) on one line ... speed digits never add a 3rd line"*. That works there because the panel's label is **13px**. At the map meter's **14px** the same approach needs **81px**, which is exactly the width this story now adopts for natural wrapping. So the two approaches cost the same pixels and the explicit break costs more code, but note that the panel's comment is reasoning about precisely the constraint this story arrives at independently: the compass phrase, not the digits, is what sets the width.

**WM-52 does not change the number.** `.windText` carries its own explicit width, so the container's width is irrelevant to the wrap: 81px fits inside today's 97px container and inside the 104px container WM-52 introduces. The concern recorded in `sprint-24-mechanisms.md`, that a widened container might fix the wrap on its own or change what the label should target, is answered by measurement in both directions. It does not fix it (confirmed again on an assembled 104px mock built during WM-52's pass: the shortest reading still takes two lines and the longest still takes three), and it does not move the target. Build order between the two stories is a convenience, not a dependency.

**Wind does not change during a run by default.** `config.changeWindOnDay` defaults to `undefined` (`config.ts:209`), and `changeWindIfNecessary` (`simulation.ts:505`) is the only mid-run writer of `wind.speed` / `wind.direction`. So the meter reshaping as the reading changes is a **setup-time** effect, driven by the student dragging the Setup panel's dial and slider while the on-map meter updates live, not something that happens during a run except on activities that author `changeWindOnDay`.

**No existing test can see any of this.** `simulation-info.test.tsx` has three cases, all about zone buttons and the lock icon; nothing renders or asserts the wind readout. Cypress has no coverage of the on-map Wind Meter at all, and a live DOM sweep confirms there is **no `data-testid` matching `wind` anywhere in the running app**, so a test needs one added. Jest cannot substitute: jsdom performs no line breaking, so a jsdom assertion on the label's height would be constant regardless of width and would pass against the unfixed code.

**Grep trap, still live.** `.windContainer` and `.windText` each exist in two stylesheets. `wind-circular-control.scss` is the Setup panel's wind control, a different component. The on-map meter is `simulation-info.scss`.

**Suite baseline on this branch.** `npx jest` reports 879 passed of 879.

**Throwaway artifacts.** All of the above was measured with temporary probe elements and inline style overrides on the running page, reverted in place; no file was written to the repo and no test was added. One scan result was written to `wm35-scan.json` by the tooling and deleted.

## Out of Scope

- **Shrinking `.windContainer` to preserve the dial's overhang.** Reversed by Michael on 2026-08-21 and signed off by Trudi the same morning. The 109px figure is dead and the container keeps 126px.
- **The container widening to 104px**, which belongs to WM-52 along with the rest of the key-area geometry.
- **Letting the label fill the container's inner width.** Rejected: it re-breaks all 496 readings rather than 336, and it couples the label to a container width WM-52 is changing in the same sprint, which is the coupling WM-52 deliberately avoided.
- **Adding `overflow: hidden` to `.windContainer`.** Rejected: it would convert a future overflow from a visible floating dial into an invisible clipped one, which is harder to notice, not easier. The Cypress dial-position assertion is the guard instead.
- **Fixing the `config.windSpeed` unit inconsistency.** Surfaced by this story only as the reproduction for a three-digit reading. Resolved below: it is not a defect, and changing it is a regression.
- **The Setup panel's wind readout** (`wind-circular-control.scss:70`), which pins its authored break with `white-space: pre-line`. `pre-line` honors the break but still soft-wraps, so on a fallback font an in-range reading (`"30 MPH\nfrom the WNW"`) takes a third line and lands 14px on top of the speed slider; `pre` fixes it in one word. Left alone anyway: it is a different component in a file this story never opens (the `.windText` grep trap below), and under the shipping font `pre-line` and `pre` measure identically, so the defect is only reachable in the same failed-font-load state the note above declines to design for.
- **Changing the label's copy or the speed range.** The string and the 0-30 slider are unchanged; only the box that holds them changes.
- **Accessibility review**, per the standing scope for this repo.

## Open Questions

### RESOLVED: What width should be used: the 74px threshold, or something with headroom?
**Context**: 74px is exact. Every reading fits at 74 and the worst case fails at 73, so there is zero margin: any change to the font stack, a font fallback, a copy edit, or a browser's rounding could push it back to three lines with no test failure unless one is written against the worst case. 81px absorbs three-digit speeds as well and is still comfortably inside both the current 97px container and WM-52's 104px one. Against headroom: the design draws 68px, so every pixel past the threshold is a further deviation from the artboard, and a wider label changes where the two-line break falls for some mid-length readings.
**Options considered**:
- A) 74px, the measured minimum, with the worst-case string named in a comment and pinned by a test.
- B) 81px, which also covers three-digit authored speeds and leaves 7px of slack.
- C) Drop the fixed width entirely and let the label fill the container's inner width, so it tracks the container rather than needing a second edit when WM-52 lands.

**Decision**: **B, 81px**, and the framing of "headroom" understates it. Three measurements decide it. First, A does not actually fix the bug: `?windSpeed=30` renders "150 MPH from the WNW" today, three lines with the dial 11px out, and 74px leaves it at three lines while 81px fixes it. Across a scan of speeds up to 123456 crossed with all 16 compass points, 74px leaves 35 three-line readings and 81px leaves zero. Second, 81 is not an arbitrary cushion: the binding line is `"from the WNW"` at 80.03px, and the longest speed line tested is 71.7px, so 81px is the width at which the guarantee stops depending on the speed range at all. That converts the invariant from "holds for the strings the slider makes today" into "holds for any string this label can render", which is exactly what the Senior Engineer finding below asks for. Third, the break-point objection is not a differentiator: 336 of 496 readings re-break at 74px and the same 336 at 81px, so choosing A buys nothing on that axis. C is rejected in Out of Scope: it re-breaks all 496 and couples the label to a container width WM-52 is changing.

---

### RESOLVED: Can an authored config produce a speed above 30, and does it need to be covered?
**Context**: The slider is capped at 30, and the random re-wind is capped at 20 MPH (`NEW_WIND_MAX_SPEED`, `simulation.ts:19`). But `config.windSpeed` is an authorable number (`config.ts:151`) with no visible clamp, and it is settable through the URL params the repo documents. If an activity can be authored at 100 MPH, the label needs 81px rather than 74px. If it cannot, 74px is provably sufficient and the extra width buys nothing.
**Options considered**:
- A) Treat the slider's 0-30 as the contract and size to 74px.
- B) Size to 81px so any two- or three-digit authored value is safe, and note why.
- C) Clamp `config.windSpeed` to the slider's range so the label's contract is enforced rather than assumed.

**Decision**: **yes, it can, and B covers it.** Verified live rather than reasoned about: `?windSpeed=30`, which is the slider's own maximum and a value the config documents as "mph", renders **"150 MPH from the WNW"** in three lines with the dial 11px outside the container. So A is eliminated by a reproduction, not by a hypothetical. The reason it reads 150 is a unit inconsistency: `simulation.ts:315` assigns `config.windSpeed` raw while every other writer multiplies by `windScaleFactor` and both displays divide by it, so an authored value is shown at 5x. That defect is real but separate, and it is raised below; **this story does not depend on its outcome**, because at 81px the two-line guarantee holds for any value the label can render, fixed or unfixed. C therefore stops being a prerequisite and becomes an independent improvement. Worth recording that the answer is not merely "three digits are possible": there is no authored value that breaks 81px, since the compass phrase rather than the speed is what binds.

---

### RESOLVED: Does the `config.windSpeed` unit inconsistency get fixed here, or on its own ticket?
**Context**: `config.windSpeed` is documented as mph (`config.ts:35`) but assigned to `wind.speed` **unscaled** at `simulation.ts:323`, while the slider (`wind-circular-control.tsx:59`, `:64`), the mid-run re-wind (`simulation.ts:516`) and both readouts (`simulation-info.tsx:32`, `wind-circular-control.tsx:69`) treat `wind.speed` as `display x windScaleFactor`. So an authored value displays at 5x, which is how `?windSpeed=30` reaches "150 MPH from the WNW" and supplies this story's three-digit case.
**Options considered**:
- A) Its own ticket.
- B) Fix it here.
- C) Leave it and document `windSpeed` as an internal (pre-scale) value.

**Decision**: **none of the above. Nothing is fixed, nothing is filed, and this story does not own it.** WM-35 changes the width of a label; the scaling is the reproduction that justified 81px over 74px, not a defect in scope. The width holds either way, since `config.windSpeed` is unclamped whichever units it carries and three-digit readings stay reachable.

**Recorded because a later reader will find the 5x and be tempted to "fix" it.** The behavior is consistent with how the live activities are authored, and changing it is a regression, not a fix:
- **No student-facing preset sets `windSpeed`.** Only `basicWithWind` and `basicWithSlopeAndWind`, neither referenced outside `presets.ts`. Every real preset inherits `windSpeed: 0`, which scales to 0 either way.
- **Three live LARA pages do set it**, extracted from the published ISLAND sequence into `docs/hazbot-validation/localhost-urls.md`: `windSpeed=2` (act 4 p1), `4` (4/4), `6` (4/6). Those display as exactly **10 / 20 / 30 MPH**, and 30 is the Setup slider's maximum, so they were authored in internal units deliberately.
- **It is not one line.** `derive-defaults.ts:36` reads `config.windSpeed` raw too, and Hazbot's wind comparisons agree today only because `simulation.ts:323` does the same. Scaling one file makes an untouched run on those three pages report the wind as student-changed: `setWind`, `setAnyVar` and `WindSet` flip true and `DefaultVars` flips false. Measured.
- **It changes the physics.** `this.wind` is passed straight to `new FireEngine(...)` (`simulation.ts:401`) and `windFactor` goes as roughly the square of the speed for these fuels, so a 5x cut is about a 25x wind-factor cut on those three pages, invalidating their validation playbooks.
- **The field that is genuinely out of step is `newWindSpeed`**, which *is* scaled and is set by no preset, no LARA URL and no test.

---

### RESOLVED: Where does the regression test live, and what does it assert?
**Context**: The invariant is "never three lines", which is a line-box count and therefore browser-only. Cypress is the only place in this repo that renders in a real browser, it already has a visual-geometry spec for the bottom bar to model on, and it has no Wind Meter coverage at all. Whatever is written needs a `data-testid` added to the label or container, since neither has one. The alternative is to assert the dial's position relative to the container instead of the line count, which is the user-visible symptom and is one rect comparison.
**Options considered**:
- A) A Cypress test that sets the worst-case wind through `window.sim` and asserts the label's rendered height is 32px (two 16px lines).
- B) A Cypress test that asserts the dial's bottom is inside the container's bottom, which is the symptom rather than the cause.
- C) Both, in one spec: the height pins the fix and the dial position pins the thing the ticket actually reported.

**Decision**: **C**, with two refinements the deep dive supplies. First, neither assertion needs `window.sim`: the label is a pure function of `wind.speed` and `wind.direction`, both settable from the URL, and `?windSpeed=2&windDirection=22.5` was verified to render exactly `"10 MPH from the NNE"` while `?windSpeed=30&windDirection=292.5` renders `"150 MPH from the WNW"`. URL params are a more stable driver than a debug global and they give the spec two cases rather than one, the second of which is the case 74px does not fix. Second, keeping B is what makes the `overflow` finding below safe to leave alone: the dial-position assertion is the thing that turns a future overflow from a silent visual regression into a red build. Both assertions are mutation-visible in the same way, since reverting `.windText` to 68px turns both red. `data-testid`s are needed on `.windText` and `.windContainer`; a live sweep confirms there is no wind-related test id in the app today.

---

### RESOLVED: Should the spec image on the ticket be opened before building?
**Context**: `image-20260821-064626.png` is at the "Spec:" line and has never been opened. Every value in this document came from the Zeplin board and from live measurement instead, and the board's Wind Meter agrees with the current CSS at two lines, so there is a coherent target without it. But if the image carries a width, a different break point, or a note, it is unrecorded here.
**Options considered**:
- A) Open it in a logged-in browser before starting; it is a five-minute unblock and it also gates WM-52's attachment.
- B) Proceed on the board plus the measurements, and reconcile if the image later contradicts them.

**Findings:** the ask is now precise, and it is the same one WM-35 and WM-52 both need. Reading the ticket through `acli` shows **no attachment records at all**: this ticket carries *two* inline ADF `media` nodes in the description body, `image-20260625-181834.png` (232 x 435, the "Example:" screenshot of the bug) and `image-20260821-064626.png` (155 x 353, the "Spec:" image), both with an empty collection. With no attachment id there is nothing for a CLI to fetch, so the Jira web UI is the only route, exactly as it is for WM-52's `image-20260821-190853.png`. One browser session closes all three. Against the risk of waiting: the ticket's description text was read in full during this pass and contains no width, break point, or geometry that this spec contradicts, and the Zeplin board's Wind Meter matches the current CSS at two lines in every dimension except the label width.

**Decision**: **A, and it is done: opened 2026-08-25, and it contradicts nothing here.** The prediction above was right on both counts. The Jira web UI was indeed the only route, since neither ticket has an attachment record, and the image is the *same drawing* as WM-52's `image-20260821-190853.png`, exported at a different size: 310 x 706 here at **2.32x** against 468 x 1118 there at **3.80x**. Measured off the pixels it renders the key-area stack at 104 wide with boxes 47 / 126 / 82 and 10px gaps, carrying no width, break point, note or annotation of its own.

Two things in it bear on this story specifically. It draws `.windText` at its current **68px**, not at a new width, so it neither sets nor moves this story's target: the drawn "0 MPH from" is 65.0px of ink centered on the container axis, which fits 68 and could not also take " the". And it draws that shortest reading at **two lines inside the new 104px container**, which is the same conclusion WM-52's assembled mock reached from the other side. So the 81px decision above stands untouched, and the container-width independence recorded in Technical Notes is now confirmed from the design as well as from measurement.

The `image-20260625-181834.png` "Example:" screenshot was left unopened; it documents the bug being fixed rather than the target, and the bug is reproducible on demand with `?windSpeed=30`.

## Self-Review

### Senior Engineer

#### RESOLVED: A hardcoded width that must exceed a measured text width is the same class of bug being fixed
The defect is a magic number (68px) that stopped being large enough. Replacing it with a different magic number (74px) fixes today's strings and leaves the identical failure mode in place for tomorrow's. Nothing in the code will say why 74, and nothing will fail if the premise changes. Either the width should stop being fixed, or the number needs both a comment naming the string it was measured against and a test that fails when that string no longer fits.

**Decision**: accepted, and the width decision above is largely a response to it. The finding's real objection is that 74px encodes a premise ("speeds are one or two digits") that nothing enforces and that turned out to be false already. 81px removes the premise rather than restating it: the binding string is `"from the WNW"` at 80.03px, the speed line cannot exceed it at any magnitude tested up to 123456, so the number is sized against the one part of the string that is fixed by the copy rather than by the data. That is a materially more durable magic number than 74. The comment and the test the finding asks for are both requirements now: the comment names the string and its measured width, and the Cypress spec fails if `.windText` goes back to 68px. Making the width non-fixed (letting it fill the container) was the other route the finding offers and is rejected in Out of Scope, because it re-breaks all 496 readings and re-couples the label to a container WM-52 is changing.

---

#### RESOLVED: The label and the container widths are set in the same file but sized against different things
`.windText: 68px` and `.windContainer: 97px` sit fourteen lines apart with no stated relationship, and WM-52 is about to change one of them without touching the other. After both stories land, the file will contain a 104px container and a 74px label whose only connection is that the second happens to fit inside the first. Expressing the label as the container's inner width, or at minimum commenting the relationship, would keep the next reader from "tidying" one of them.

**Decision**: the comment, not the coupling. The relationship is now a stated requirement: 81px is sized against `"from the WNW"` and is required only to *fit inside* the container, which it does at both 97px and 104px. Making the label track the container inner width is the tidier-looking option and is the wrong one here, for a reason the finding could not have known: WM-52's own pass explicitly decided to keep the key-area width independent of `simulation-info.scss` for this sprint, and tying the label to the container would create in this file exactly the cross-story coupling that story avoided. It would also change all 496 break points instead of 336. So the two numbers stay independent and the comment says why, which is the "at minimum" the finding offers and, given the above, the maximum that is correct.

---

#### RESOLVED: `overflow` on `.windContainer` is load-bearing and undeclared
The dial escapes the box today only because the container has no `overflow` rule. After this fix nothing escapes, so the absence of `overflow: hidden` becomes invisible until something else grows. Adding it would turn a future regression into a clipped dial rather than a floating one, which is arguably worse; leaving it means the next overflow is silent again. Worth a deliberate decision rather than remaining an accident.

**Decision**: **leave `overflow` alone, and let the test carry it.** The finding states both horns correctly and the resolution is that neither horn is the real choice: what makes the next overflow silent is the absence of a test, not the absence of `overflow: hidden`. Clipping would in fact make it *harder* to notice, since a half-drawn dial inside a white box reads as a design choice while a dial hanging out of one reads as a bug, which is precisely how this ticket got filed. So the deliberate decision the finding asks for is: no `overflow` rule, and the Cypress dial-position assertion (option B of the test question, kept in the chosen C) is the guard. That converts "silent" into "red build" without hiding the symptom that made the defect reportable in the first place.

---

### QA Engineer

#### RESOLVED: The obvious test is one that cannot fail
The natural place to add coverage is `simulation-info.test.tsx`, and a test there that renders the worst-case reading and asserts the label is two lines tall would pass against the unfixed code, because jsdom does no line breaking and reports the same height at any width. That is precisely the failure mode this repo keeps catching in review. The requirement should state that the test must be a browser test and say what mutation it catches: reverting `.windText` to 68px must turn it red.

**Decision**: accepted verbatim; both halves are now requirements. The named mutation is stated (revert to 68px, both assertions go red) and the browser-only constraint is stated with its reason. Worth recording the corollary for whoever writes it: `simulation-info.test.tsx` is still the right place to add *any* wind coverage, since it currently asserts nothing about the readout at all, but what belongs there is the label's text content, not its geometry.

---

#### RESOLVED: 74px is a threshold, so the test must sit on the boundary
A test written against a mid-length reading passes at 68px today and proves nothing. The only assertion with power is the one against the specific worst case the scan found. That string should be named in the requirements rather than left to whoever writes the test to pick, or it will be chosen for readability rather than for being the boundary.

**Decision**: accepted, and the boundary moved, which strengthens the point. Two strings are now named in the requirements rather than one: `"10 MPH from the NNE"` is the worst reading inside the slider's range and is the boundary case for 74px, while `"150 MPH from the WNW"` is reachable through `?windSpeed=30` and is the case that separates the chosen 81px from 74px. A test carrying only the first would pass against a 74px implementation, which is now the wrong implementation, so naming both is what keeps the test aligned with the decision. Their URL drivers are named too, so the choice cannot drift to a more readable but weaker string.

---

#### RESOLVED: No acceptance criterion covers the readings that already work
The fix widens a box, which can move the break point for readings that currently render acceptably. "0 MPH from the N" was checked and is unchanged at 74px, but that is one string out of 496, and the requirement only says the shortest one is preserved. If a mid-length reading moves from "10 MPH from the" / "NE" to "10 MPH from" / "the NE", that is a visible change nobody signed off on.

**Decision**: accepted, measured, and accepted as a consequence rather than a decision. Every one of the 496 slider readings was re-broken at 68px and at the new width and the break strings compared: **336 change, of which 189 are the three-line readings being fixed, leaving 147 previously-acceptable readings that now break in a different place.** The example the finding invents is real; the measured one is `"10 MPH from the N"` moving from `"10 MPH" / "from the N"` to `"10 MPH from" / "the N"`. The reason this is documentation rather than a question is that the churn is identical at 74px and 81px and is 496 at any width from 88px up, so there is no width that fixes the wrap without moving break points; it is inherent to giving the text more room. The shortest reading is preserved at both candidate widths, as the existing requirement says. The requirement now states the churn explicitly so nobody discovers it in review and reads it as an accident.

---

### Product Manager

#### RESOLVED: The ticket description still argues for the opposite fix, and that will mislead whoever picks it up
Michael's revision sits above two paragraphs that instruct the reader to keep the protrusion and shrink the container to ~109px. A developer reading top to bottom gets the current decision first and then a detailed, confident case for the superseded one.

**Decision**: **leave the description alone.** The finding overstates it. Only two sentences are false, *"keep that protrusion"* and the second scope item's ~109px height. The rest is true and load-bearing: *"the wrap and the rounded bottom are the same phenomenon ... the rounded bottom appears only in the buggy 3-line state, and fixing the wrap on its own silently removes it"* is what makes Michael's reversal make sense rather than read as an arbitrary preference. Its 123 / 140 / ~14px figures measure as 137px and 11px, but the block states they are assumed off the SCSS and tells the reader to confirm in a browser. The ordering also works: the reversal is above the analysis, so a reader gets the current decision first, and Trudi's sign-off (*"Looks good, thank you,"*, comment 42305) sits directly below her reversed 8/3 comment.

**Two corrections to the sprint docs, verified on the live ticket.** The companion-story key is no longer blank: the paragraph now reads *"(Story https://.../WM-52)"*, so every "ask Michael for the key" line elsewhere is stale. And the ticket has **zero attachments**: both images are inline ADF `media` nodes (`b450f097-…`, `645b29de-…`) with no attachment record behind them, so any future description edit must go through ADF that preserves those nodes. A plain-text update would destroy both images with nothing to re-attach from.

---

#### RESOLVED: This is now a smaller story than its point value assumes
It is pointed 1, which was set when it was two coupled changes with an unknown container height. It is now a single CSS width change plus a test, and the plan's "follow WM-52" sequencing rests on a dependency that no longer exists.

**Decision**: **stays a 1, and the WM-52 dependency is retired.** The delivered work is one width value, the comment that justifies it, two `data-testid`s and one Cypress spec. For scale, WM-52 is a 2 and landed 14 files at +550/-109. Nothing to change in Jira, so this is a note rather than an action.

The ordering question is settled from both sides and should not be re-raised: 81px fits inside both the 97px and the 104px container, WM-52's assembled 104px mock still wraps the shortest reading to two lines and the longest to three, and the spec image draws `.windText` at its current 68px inside the new 104px box. Going second is a convenience only, so the width comment can name the final container once instead of naming 97 and being amended.

One correction to the "smaller story" framing: the work grew slightly rather than shrinking further, since the deep dive added a second worst-case string, two `data-testid`s and a Cypress spec that did not exist.

---

### Student

#### RESOLVED: The wind reading is the only piece of live model state that changes shape as it changes value
Wind direction and speed change during a run. Under the current bug, the panel silently changes height and the dial moves as the reading gets longer or shorter, which reads as the interface twitching rather than as information updating. Fixing the wrap fixes that too, and it is arguably the more noticeable improvement for a student watching a run, though the ticket frames it purely as a layout defect.

**Decision**: the observation is right and the timing is wrong, which makes it a better argument than it was. Wind does **not** change during a run by default: `config.changeWindOnDay` defaults to `undefined` (`config.ts:209`) and `changeWindIfNecessary` (`simulation.ts:505`) is the only mid-run writer of wind state, so the twitching the finding describes only happens on activities that author a wind change. Where it happens for every student is **setup**: the on-map meter reads `simulation.wind` live, so it reshapes continuously while the student drags the Setup panel's direction dial and speed slider, which is a much more frequent and more directly caused-by-me experience than a mid-run change. So the improvement is real and lands earlier than the finding assumed, at the moment the student is actively manipulating the value. Nothing to change in the fix; recorded because it is the strongest student-facing argument for the story and the ticket makes none.

---

### Education Material Developer

#### RESOLVED: An authored wind speed outside the slider's range would silently reintroduce the defect
`config.windSpeed` can be set per activity, and the label's two-line guarantee is being sized against the slider's 0-30 rather than against anything the config enforces. An author setting a high wind speed would get a three-line label and a floating dial with no warning and no failing test, which is the exact bug being closed. Either the range should be enforced, or the width should cover the widest value the config can express.

**Decision**: the width covers it, and the finding was understating the problem rather than overstating it. It is not that an author *could* exceed the range: `?windSpeed=30`, the slider's own maximum and a documented mph value, already renders "150 MPH from the WNW" in three lines today, because the config value is assigned unscaled while everything else scales it. So the defect the finding predicts is live, and 74px would have shipped without closing it. At 81px the guarantee no longer has a range premise at all: the binding line is the compass phrase at 80.03px, and no speed magnitude tested up to 123456 produces a third line. That answers the finding's "cover the widest value the config can express" branch completely, without needing the enforcement branch. Enforcement is still worth doing for its own reasons, and the underlying unit inconsistency is raised as its own open question above.
