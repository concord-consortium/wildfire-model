# WM-40: Add a speed control to speed up or slow down the model

**Jira**: https://concord-consortium.atlassian.net/browse/WM-40

**Status**: **Closed**

## Overview

A three-position speed control lands in the bottom bar between Start/Pause and Fireline, letting a student run the model at three speeds, originally 0.5x, 1x and 2x and since retuned (see *Amended 2026-08-31*). The model side is a single multiplier on the one place the app converts model time to real time; the control is a snap-to-tick MUI slider whose selected label renders bold.

Teachers at the ISLAND workshop reported the model's pace working against them in both directions. Some fires take long enough that students give up waiting for Hazbot's feedback; others burn fast enough that students miss the phenomenon they were asked to observe, which happened specifically during the fire-intensity tasks. The control is deliberately discrete rather than continuous, which Trudi confirmed is fine and which is meaningfully cheaper to build and test. The specific multipliers are explicitly tunable: Trudi's note says fast might want to be 3x and slow 0.25x, and *"we can test it"*, so the numbers are a starting point rather than a decision. Nothing about the fire model itself changes, only how fast the clock runs.

This story landed last of the four Sprint 24 bottom-bar stories (WM-52 removed the Fire Intensity Scale, WM-47 renamed and moved Reload to Clear All, WM-48 added the Vegetation Key), so it owns the finished row and re-derives the gap chain from the board's table in one pass.

## Amended 2026-08-31: the multipliers were retuned and the labels were not

Trudi asked for the outer speeds to be pushed further out (WM-40 comment 42399) and confirmed that
the **labels should stay as drawn** (comment 42415). The shipped pairing is therefore:

| Tick label | Multiplier |
|---|---|
| `0.5x` | **0.25** |
| `1x` | 1 |
| `2x` | **4** |

Her reason: *"we know that they picked faster/slower and that is all that matters."* This is the
divergence the `SPEEDS` array was built to allow, so it cost one edit and no design change. **The
labels are correct as drawn and must not be "fixed" to match**; both log payloads already carry the
label and the multiplier separately, which is what keeps a session readable under a diverging label.

**5x is the ceiling, and 4x is inside it.** Measured by driving `sim.tick()` at each multiplier's
per-tick ceiling: 4x gives a 47.87-minute tick and 5x gives 59.83, both under the graph's 60-minute
sampling bucket, while 6x gives 71.80 and skips an hour. **`speed.test.ts`'s hour-boundary case now
asserts three multipliers rather than two**: the shipped fastest, taken from the array so a retune
carries it; an explicit **5x**, which pins the ceiling itself rather than leaving it to this prose;
and **6x**, which must exceed the hour and is what keeps the other two able to fail. 5x clears the
bucket by only 0.17 minutes, which is too thin a margin to leave unasserted. End-to-end in the
browser, on separate page loads: 45.2, 179.1 and 718.1 model minutes per real second, i.e. 0.25x and
4.01x of the default.

**The graph's limit is not only about dropped samples, and the other half widens with the multiplier.**
The amendment above argues the 5x ceiling from sample loss, which is the half a longer tick does not
reach at 4x. The half it does reach is a sampling offset. **It is pre-existing behavior, not
introduced by the retune**: `graph.tsx`, `chart-store.ts` and the burn-rate computation in
`getOutcomeData` are all untouched by this work. What the retune changes is its size.
`graph.tsx` records its acres reading in an
effect keyed on `simulation.timeInHours`, so the reading is taken on the first tick *after* the hour
rolls over, a varying distance past the boundary. `getOutcomeData` then divides by
`rawData[i].time - rawData[i - 1].time`, which is always exactly 1 because `IRawBurnDataPoint.time`
stores whole hours. So the numerator is measured at a point past the hour while the denominator is a
whole hour, and that offset scales directly with the multiplier: roughly 3.0 model minutes at 1x to
12.0 at 4x at 60 frames per second, and 11.97 to 47.87 at the slow-frame ceiling.

**No index shifts**, so the logged `burnRates` array keeps its "index 0 = hour 1" contract and the
graph is unaffected. How much it moves any single burn-rate value depends on how fast acreage is
changing at that moment, so it is not a fixed multiple. Against the **previously shipped** fastest
tick it has doubled, 23.93 minutes at the old 2x to 47.87 at the new 4x; the four-fold figure is the
1x-to-4x ratio within the current set, which is the wrong comparison for asking what this change
did. **Filed as WM-58 and deliberately not fixed here**: it changes the meaning of a field
already logged under a merged story, so previously collected and newly collected data would stop
meaning the same thing, which is a deliberate decision rather than a quiet correction. The fix is small, storing
`simulation.time` alongside the whole hour and dividing by the real elapsed interval, with no change
to the graph.

**The shipped pairs are pinned by their own test.** Every other assertion touching speed derives its
expectations from `SPEEDS`, which keeps them retune-proof but blind to a retune: reverting the array
would leave them all green. `speed.test.ts` therefore opens with a contract test asserting the three
label and multiplier pairs literally, since both halves are deliberate decisions and neither may
drift on its own.

**A further retune is still open, and 5x is the number that constrains it.** Trudi's original note
floated a 3x fast end and she has since gone past it, so the values remain hers to set after a
classroom run rather than settled here. Neither end is technically constrained anywhere near the
values in play: the slow end has no floor, and the fast end has the ~5x ceiling above, which
`speed.test.ts` now asserts directly rather than leaving to prose.

## Requirements

- A three-position speed control renders in the bottom bar **between Start/Pause and Fireline**, as its own widget group at **97px content / 99px border box**.
- **The Speed group abuts Start on its left** and takes the standard 3px gap to Fireline on its right. The board draws Start Control at 592-652 and Speed Control at 652-749, so there is no gap between them; Fireline Control starts at 754, five content-box pixels further on, which is the standard gap. The abutment follows the repo's existing idiom: the **preceding** group zeroes its `margin-right` and the next group's `-1px margin-left` pulls it flush, as `.restart` and `.fireLineButton` already do (`bottom-bar.scss:141-143`, `:158-165`). Start's widget group carries no modifier class today (`bottom-bar.tsx:189`), so this adds one, and the change is to Start rather than to the Speed group. Measured live: with the abutment the row is **671px across four coincident seams**; without it, 675px across three.
- The three positions are labeled **0.5x**, **1x** and **2x**. **1x is the default.** The model originally ran at the multiple each label names; see *Amended 2026-08-31* above, which retunes the outer two so the labels no longer match their multipliers.
- The selected tick's label renders **Lato Bold 700**; the other two render **Lato Regular 400**. All three are 14px `#434343`.
- **The slot styling copies the setup panel's vertical selectors** (`vertical-selectors.scss`), which is the repo's closest `rail` / `mark` / `markLabel` / `thumb` structure, **except for the thumb and the disabled rule**. The thumb takes the horizontal asset, `slider-thumb-small.svg` at `width/height: 24px; background-size: 140%`, because Speed is horizontal and that is the variant whose chevrons point left and right. The disabled rule is the board's, not either slider's `opacity: 0.25`. The full stylesheet ships as `src/components/speed-control.scss`, measured against the board layer by layer rather than derived, and it is the authority over this summary.
- **The slider's values are tick indices (0, 1, 2), not the multipliers.** MUI positions marks by `valueToPercent(mark.value, min, max)`, so using 0.5 / 1 / 2 as values would place the middle tick at 33% of the rail instead of the board's ~51%. The multipliers and their labels live in one indexed array, one entry per tick, so neither can be retuned or reordered without the other. That pairing is what the array guarantees; whether a label's drawn text matches its own multiplier is a separate question, and the requirement below deliberately leaves them free to diverge.
- **`track={false}` is load-bearing, not cosmetic.** MUI computes a mark's active state as "is this the selected value" only when `track === false`; with a visible track it instead marks every value at or below the selection, which would bold 0.5x as well as 1x. The bolding rule depends on it, so **it carries an assertion** in `speed-control.test.tsx`: nothing else in the suite reads label weight, so removing the prop would otherwise leave the suite green. The assertion is made at the *fastest* tick, because at the slowest tick the trackless and tracked modes render identically and an assertion there could not catch the removal.
- The control snaps to ticks: dragging the thumb lands on ticks and clicking anywhere on the rail selects the nearest one. That value logic is MUI's own under `step={null}` with marks and needs no code. **The geometry does need one addition**: each tick carries a transparent 24 x 24 `:after` hit box, matching the thumb and the ticket's *"click area ... the ~same dimensions as the thumb"*. Without it the live target at a tick is the 6px mark and, 9 dead pixels lower, its label. Enlarging the slider root instead does not work; see *The tick's own click target is 6px* below for the measurements.
- **The control is disabled until a spark is placed and stays enabled from then on, including during a run, while paused, after the run ends, and after Restart.** It disables again when Clear All clears the sparks, and while the Setup wizard is open. The predicate is **`!simulation.ready || ui.showTerrainUI`**, the same shape Start carries at `bottom-bar.tsx:193`.
  - `ready` (`simulation.ts:78`) rather than `startEnabled`: Start also carries `&& !simulationEnded`, and the board draws Speed enabled in the after-run state where Start is disabled.
  - The `ui.showTerrainUI` term is this spec's addition, not the board's. The wizard is a state the board never draws, and every other control in the bar locks while it is open; without the term Speed is the only live control in a fully grayed bar. See *The board's worded enable rule is a latch* below for the board sentence this trades against.
  - `ready` includes `dataReady`, so the control fades for roughly 350ms whenever the terrain regenerates (Setup, then Create). Start, Spark and Clear All fade with it, and the main thread is blocked rebuilding cells for most of that window.
- The disabled treatment fades **the content only, to 35%**, and leaves the widget group's white bubble and its 1px border at full opacity. This matches both the board and the bar's existing rule for buttons (`bottom-bar.scss:286-311`, *"grayscale + content faded to 0.35, button background unchanged"*). Fading the whole group instead renders the bubble's border at `rgb(187,187,187)` against every neighbor's `rgb(121,121,121)`, along a 1px line at the top of the bar and directly across the coincident seam it shares with Start.
- **`filter: grayscale(1)` is omitted**, unlike the button rule. It would be a no-op: the control is already achromatic (`#434343`, `#797979`, `#d8d8d8`).
- **MUI's `disabled` prop is set alongside the fade.** It supplies `pointer-events: none`; opacity alone leaves a faded control fully draggable.
- **Hover and Select are drawn by the board and are not optional.** *(partial: the Select ring latches after a mouse gesture, so the board's Hover row is unreachable between the first click and the next blur. Accepted rather than fixed; see the decision below.)* Its four-state column captions them: *Hover, "icon outline 50% op"* and *Select, "icon outline 100% op"*. Both put a 32x32 white `Highlight` behind the thumb's 24px `Outer`, which is a **4px ring**, at alpha 0.5 and 1.0 respectively, and both turn the widget group's bubble **`#dfdfdf`**. The ring alphas are the wind meter's exactly; the ring is 4px against its 3px, and the bubble change is the piece the wind meter has no equivalent for. It is what makes a white ring legible, since on the default white bubble it would be invisible. Neither is a new color: `$hoverColor` is already `#dfdfdf` (`common.scss:29`) and `:global(.hoverable):hover { background: $hoverColor }` already exists (`bottom-bar.scss:89-91`). **The two states reach the bubble by different routes**, because the bubble belongs to the widget group and the control's own stylesheet lives inside it. Hover uses the `hoverable` class. Select needs `.speedControl:has(:global(.Mui-active))` in `bottom-bar.scss`, because MUI takes no pointer capture (`useSlider.js:539-541` binds `mousemove` / `mouseup` to the document), so a drag that wanders off the bubble drops `:hover` while `Mui-active` stays on the thumb: measured, the bubble reverts to `rgb(255,255,255)` mid-drag, and the group is only about 37px tall above the rail, so upward drift onto the terrain is a routine gesture. Without the `:has` rule the 100% white ring is drawn on a white bubble and disappears, which is what this requirement exists to prevent. `:global` is required around `Mui-active`; css-loader hashes it otherwise.
- **MUI's own focus ring is suppressed.** It is painted on the thumb's `::before`, so without `&:before { box-shadow: none }` the control shows two rings. The wind meter carries the same line.
- **The Select ring latches after a mouse gesture, and that is accepted rather than fixed.** The 1.0 ring hangs off `:active, .Mui-active, .Mui-focusVisible`, which is verbatim what `wind-circular-control.scss:125-128` and `vertical-selectors.scss` already write. MUI applies `Mui-focusVisible` on a *mouse* gesture, not only a keyboard one, and leaves it until the hidden input blurs. Speed is the first slider in the bar whose container also changes color, so the consequence is visible on Speed and on neither of the others. Measured in Chrome on the built control, reading the group's background and the thumb's computed `box-shadow` after each gesture settles:

  | State | bubble | thumb ring | `Mui-focusVisible` |
  |---|---|---|---|
  | Pristine, pointer away | `rgb(255,255,255)` | none | no |
  | Hover, before any click | `rgb(223,223,223)` | `rgba(255,255,255,0.5)` 4px | no |
  | Mid-drag, pointer off the bubble | `rgb(223,223,223)` | `rgb(255,255,255)` 4px | (`Mui-active`) |
  | After a click, pointer away | `rgb(255,255,255)` | `rgb(255,255,255)` 4px | **yes** |
  | Hover after a click | `rgb(223,223,223)` | `rgb(255,255,255)` 4px | **yes** |
  | Hover after clicking elsewhere to blur | `rgb(223,223,223)` | `rgba(255,255,255,0.5)` 4px | no |

  So from the first click until focus moves elsewhere, the board's Hover row is unreachable: hovering paints the Select ring. At rest the ring is white on a white bubble and therefore invisible, which is why an earlier pass did not see it. **Dropping `:global(.Mui-focusVisible)` would restore the Hover row**, at the cost of making Speed the one slider in the repo that styles its thumb states differently from the other two, for a difference visible only in a state the board does not draw. The repo idiom wins; this is recorded so the divergence is not read later as a regression, and it is one line to flip if Michael wants the board's row back. Worth raising in PR review alongside the `showTerrainUI` term.
- **The `hoverable` class comes off while disabled.** The board's disabled row keeps the bubble `#ffffff`, so a disabled control must not take the bar's `#dfdfdf` hover background. The bar's other widgets are buttons whose `:disabled` handles this for them; Speed is not a button, so the class is applied conditionally.
- **`bottom-bar.tsx` owns the Speed widget group**, as it does for every other widget including `VegetationKeySwitch` (`:165-167`). It carries a `speedEnabled` getter alongside `sparkEnabled`, renders the group as `` `${css.widgetGroup} ${css.speedControl} ${speedEnabled ? "hoverable" : ""}` ``, keeps the group's 97px width in `bottom-bar.scss` alongside `.vegetationKey`'s (the component's own stylesheet keeps only what is inside the bubble), and passes `disabled={!speedEnabled}` to the Speed component. The predicate is computed **once**, in the same place and the same shape as every other control's, rather than once for the class and again inside the component for MUI's `disabled` prop.
- **The orphaned `.slider` block in `bottom-bar.scss` is deleted.** It has had no consumer since 2019, and it describes a thumb and a disabled state that both contradict this story's.
- **The selected speed persists across Restart and resets to 1x on Clear All.** Restart is model state only and touches nothing view-like; Clear All already resets user-set values through `setInputParamsFromConfig()`, which is where the analogous `wind.speed` reset lives.
- Changing the speed mid-run takes effect on the next frame with no jump in model time and no change to the fire's behavior.
- **The multipliers and their labels live in one indexed array, one entry per tick, with the label as its own field.** A label is never formatted from its multiplier (`` `${multiplier}x` ``), because the two are allowed to diverge: a retune may want to run at 0.4 while the tick still reads "0.5x", which is a change to one number and nothing else. One array is the single source of truth for the pair; formatting the label would make the multiplier the source of truth for both and forbid the tuning the array exists to allow. It follows that nothing asserts that a label agrees with its multiplier.
- `config.maxTimeStep` is **not** raised to accommodate the faster speed. Raising it would be inert rather than harmful: `optimalTimeStep * 4` is the smaller ceiling until about 15x (`180 / 11.9664 = 15.04`), so `maxTimeStep` never binds at any speed this story ships. See the clamp note in Technical Notes.
- **Two boundary guarantees are asserted behaviorally, both by driving a tick at a ceiling read from config rather than by comparing constants.** They ship in `src/models/speed.test.ts`; the two decisions below record the mutation each one catches.
  - **The day boundary**: drive a real `FireEngine` at `getDefaultConfig().maxTimeStep` and assert `engine.day` never advances by more than one per tick. This is what keeps a faster clock safe, and the two constants that make it hold live in different files with nothing stating that one bounds the other. The test never names 1440, so raising `maxTimeStep` past a model day fails it on its own.
  - **The hour boundary**: drive `sim.tick()` at the largest per-tick ceiling any shipped multiplier can produce, `min(maxTimeStep, optimalTimeStep * 4)` at the fastest entry in the multipliers array, and assert `sim.timeInHours` never advances by more than one, **paired in the same test with the bound that makes it falsifiable**: the same drive at a hypothetical 6x must exceed one, so a retune that crosses the hour is caught rather than passing silently. The graph samples once per model hour, so a longer tick drops a point from `rawBurnData` and shifts every later index of the logged `burnRates` array against its documented "index 0 = hour 1" contract. This is the tighter of the two boundaries by a factor of 24, and it is the one a plausible retune can cross: the shipped multipliers give a 47.87-minute maximum tick against a 60-minute bucket, and a 6x entry would give 71.8. The test names neither 60 nor 1440. `simulation.test.ts:196-202` already drives `sim.start()` then `sim.tick()` in jsdom, and the timestep formula is extracted from `rafCallback` for the requirement below, so both reuse the same seam.
- **The speed multiplier is verified against the computed timestep, not against wall-clock elapsed time.** Not because wall clock cannot be measured accurately: it can, and was, to within 0.2% at all three speeds. It is that doing so needs a real rAF loop, a warm page, a discarded first tick and a frame gap between runs, none of which a Jest suite has, and the one property that a wall-clock test would add over a timestep test is the frame rate, which is the machine's rather than this story's. The timestep formula is extracted from `rafCallback` as a pure function so it can be asserted directly. See Technical Notes for both measurements and for the same-tick restart trap that a wall-clock test walks into.
- **Every speed change is logged as `SpeedChanged`, carrying the old and the new multiplier and the new label**, and documented in `LOGGED-EVENTS.md`. The event is named explicitly in `translate.ts` above its closing `default: return { kind: "no-op" }`, the way `VegetationKeyShown` and `VegetationKeyHidden` are, so Hazbot's inertness to it is stated rather than inherited.
- **The current multiplier and its label are added to the `SimulationStarted` payload.** They are model state rather than config, so they do not arrive through the generic `Object.entries(config)` snapshot and are appended explicitly in `bottom-bar.tsx` alongside `sparks`, `zones`, `wind` and `towns`. The multiplier is what keeps wall clock and model time interconvertible from the log, a property `modelDayInSeconds` provides today and this story would otherwise break.
- **Both log payloads carry the label as well as the multiplier**, because the two are allowed to diverge. The multiplier is what makes the log arithmetically usable; the label is the only record of what the student actually saw on the tick they chose. Under a retune that runs 0.4 behind a "0.5x" label, a multiplier-only log leaves an analyst unable to say which position was selected, and a label-only log leaves them unable to convert time. Neither field reconstructs the other.
- **Both log requirements carry an assertion**, in `src/components/log-events.test.tsx`: the new keys in the existing `SimulationStarted` payload block, and `SpeedChanged` firing with both multipliers and the label. That block asserts presence rather than shape, so without an explicit assertion a missing key passes silently. `vegetation-key-switch.test.tsx` is the precedent for the *shape* of asserting a control's own log event, but not for driving it: a MUI slider cannot be moved by `userEvent.click` under jsdom, whose zero-sized `getBoundingClientRect` collapses every pointer position onto the first mark. The driver is `terrain-panel.test.tsx`'s, a `fireEvent.change` on the hidden range input.
- **This story updates the two Cypress specs its geometry invalidates.** `bottom-bar-visuals.cy.ts` asserts `.mainContainer` at 576 (measured 674 with Speed in place) and a 3px `"Start -> Fireline"` gap (that adjacency is now Start to Speed, at -1). Its prose goes stale in **five** places in the same pass, all silent: the test name and the comment inside it both say "eight widget groups", the file header and the gap test's own comment both list three abutting seams and name them, and the viewport comment derives its total from 576. The per-widget width table also gains a Speed row. `bottom-bar-state-machine.cy.ts`'s `expectButtonStates` matrix gains Speed. `speed` is a required field on that literal, so it has to be filled at all **ten** of the helper's call sites, which is the file's eight named states plus the "Fireline armed" case and the pre-open assertion inside state 8.
## Technical Notes

Layout comes from the *Updated Wildfire Controls and Labels* board (`.../screen/6a8566a1c90489f7be36e66a`), group "Speed Control", drawn in all seven bottom-bar state rows and again as its own four-state column. Timing behavior was measured live in Chrome against the running dev server.

**The model's pace has exactly one input.** `config.modelDayInSeconds` (default `8`) is read in one place, where it becomes `ratio = 86400 / modelDayInSeconds`, the number of model-minutes per real-minute. Everything downstream is the per-frame timestep, so the model half of this story is one observable multiplier folded into that ratio. `modelDayInSeconds` is config, which is per-activity and not observable; the multiplier is user state that must be observable so the bar re-renders and the rAF loop picks it up.

**Marks are positioned by value, which rules out using the multipliers as slider values.** MUI computes each mark's position as `valueToPercent(mark.value, min, max)`. With values 0.5, 1 and 2 over a 0.5-to-2 range, 1x would land at 33.3% of the rail against the board's 50.9%. Indices 0, 1, 2 give 0 / 50 / 100%, which is what the board draws, so the slider carries indices and one indexed array maps each to its multiplier and its label.

**`step={null}` is a genuinely different MUI code path**, and it answers both the click-target and the drag questions. A falsy `step` sends every pointer position through `marksValues[findClosest(...)]` instead of `roundValueToStep`, from the move, pointer-down and mousedown handlers alike. Two consequences follow with no code of our own: a click anywhere on the rail selects the nearest tick, and during a drag the thumb jumps tick to tick rather than following the pointer. Keyboard handling changes too, moving to the adjacent mark index rather than by step. All three existing sliders in the repo use `step={1}`, so reusing their setup is the likely first attempt and would allow intermediate values.

**`track={false}` is load-bearing rather than cosmetic.** MUI computes a mark's active state as "is this the selected value" only in the trackless mode; with a visible track it marks every value at or below the selection, which would bold 0.5x alongside 1x. The board's bold-the-selected-label rule lines up with MUI's `.MuiSlider-markLabelActive` precisely, but only in that mode.

**At 60 FPS the multipliers are exactly linear.** The per-frame timestep is `Math.min(maxTimeStep, optimalTimeStep * 4, ratio * realTimeDiffInMinutes)`. At this browser's measured 16.70ms median frame, the binding term is `ratio x elapsed` at every speed, giving 1.50, 3.01 and 6.01 model-minutes per frame, i.e. 90 / 180 / 360 model-minutes per real second. Neither clamp binds.

**Under load both clamps preserve proportionality, and `maxTimeStep` never binds.** `optimalTimeStep * 4` is `ratio * 0.001108`, so it scales with the multiplier and is the smaller ceiling at every multiplier below about **15x** (`180 / 11.9664 = 15.04`). Catch-up therefore starts being capped at the same frame time at every speed, about 66.5ms or 15 FPS, and a slow machine does not collapse the speeds together: 2x still delivered exactly twice 1x's model-minutes per frame at any frame rate (measured before the retune, at the original multipliers). Raising `maxTimeStep` would not "make 2x work"; it changes nothing until about 15x, past which it is the only thing standing between one tick and a skipped day.

**The fast end's real ceiling is the graph, at about 5x.** The graph samples once per model hour, so a tick longer than 60 model minutes drops an hour from `rawBurnData` and shifts every later index of the logged `burnRates` array against its documented "index 0 = hour 1" contract. The effective per-tick ceiling is `11.97 x multiplier` minutes, so the crossover is `m > 5.01`. Everything at or below 5x is safe at any frame rate, 0.5/1/2 with margin and Trudi's 3x included; above it a retune is trading away the hourly resolution of the logged burn data. This is the same class of hazard as the day boundary, with a margin 24 times smaller.

**The fire's outcome does not depend on the sampling rate.** A cell ignites when the sampled `time` passes its `ignitionTime`, but the ignition times it schedules for neighbors are computed from the cell's own scheduled `ignitionTime`, not from the sampled `time`. So the spread schedule is fixed by the physics and coarser steps only change when state flips are observed, not when they are due. Measured twice. Originally over a 30x30 grid at the 0.5x / 1x / 2x / 3x per-frame timesteps, with `Math.random` replaced by a constant: an identical ignition schedule cell for cell and 900 of 900 cells burnt in all four runs. **Re-measured after the retune at the shipped 0.25x / 1x / 4x, plus 6x**, same harness and same constant random: the ignition schedule is again identical cell for cell across all four, with the same number of cells scheduled in each. A *seeded* stream instead makes the runs diverge, because the number of draws interleaves differently with the day boundaries; that is a property of the shared random stream, not of the sampling rate. The one step-size-sensitive piece is the per-day roll, which fires once per *observed* change of `Math.floor(time / 1440)`, so the failure mode to guard is a **skipped** roll rather than a doubled one.

**Changing speed mid-run is safe.** The multiplier only affects `ratio` on the following tick; `this.time` keeps accumulating and `prevTickTime` is untouched, so there is no discontinuity. Measured on the shipped control: a real change from 1x to 2x mid-run, at the original multipliers, took the rate from 178.8 to 360.1 model-minutes per real second and moved model time by **0** at the moment of the change. Separately, `start()` sets `prevTickTime = null`, so the first tick of every run *and of every resume from pause* advances model time by exactly one minute at any multiplier; a test that pins the computed timestep has to discard it.

**A same-tick `restart()` then `start()` leaves the previous run's rAF loop alive, and the model ticks twice per frame.** `restart()` clears `simulationRunning`, but the pending `requestAnimationFrame` from the previous run is still queued; if `start()` runs before it fires, the callback sees the flag true again and reschedules, so the run has two loops calling `tick()`. Measured across three successive same-tick restarts: 1, then 2, then 3 ticks per frame. Not reachable through the UI, since Restart and Start are separate clicks. It matters because it is what produced an early unexplained wall-clock measurement of 2.32x and 1.14x: a *1x* run in that series read 359.5 model-minutes per real second, almost exactly twice the true rate. **Any Cypress or Playwright test that drives restart then start programmatically will silently double the model's pace**, so such a test must leave a frame gap, or `stop()` and wait, before starting the next run.

**Restart and Clear All already have the seams this needs.** `restart()` resets model state only and has no notion of a view preference, so a speed multiplier left alone survives Restart for free. `reload()` calls `setInputParamsFromConfig()` under the comment *"Reset user-controlled properties too"*, which is where `wind.speed` is restored from config, and is the established home for resetting a user-set value on Clear All.

**Hazbot is unaffected.** `translate.ts`'s switch ends in `default: return { kind: "no-op" }`, so `SpeedChanged` is inert for category matching. No `APP_RULES_VERSION` implication.

**Four board-reading traps, all of which caught this spec at least once.** A layer's `fills` and its `borders` are siblings, and reading only the fill turned the ticks from a `#d8d8d8` core inside a 1px `#797979` ring into solid blocks. A group's `rotation` does not appear on its leaves, so the thumb's chevrons read as "above and below" from layers still named `Up` and `Down` when the parent's `rotation: -90` makes them point left and right. One layer's opacity is not the group's: the "Speed" header at 0.35 was taken to mean the whole group fades, when `Speed Control Back` stays at 1. And Zeplin reports `borderRadius: 0` on shapes drawn as ovals, so that field cannot tell a square from a circle. Check `fills`, `borders`, `rotation` and per-layer `opacity` together, and confirm shape against a rendering.

**The thumb asset splits by orientation.** `slider-thumb-small.svg` bakes a `rotate(90)` into its `<g transform>` so its chevrons point left and right; `slider-thumb.svg` has none and points up and down. Horizontal sliders take the rotated one (the wind meter, at 22px / 140%), vertical ones take the unrotated (the setup panel's selectors, at 24px / 133.33%). Speed is horizontal, so it takes `-small` at 24px / 140%. The 140% is not magic: the asset's `Outer` circle is 20 of a 28px viewBox, so 140% of the box renders it at 100%, which is why it carries across both sizes unchanged.

**The row has two intrinsic minima, because the logo swaps at 960px.** The left container's floor is **140** with the large logo and **53.3** with the small one. Measured on the shipped branch with a rule-set loaded: the bar fits at 1008 and above (674 + 140 + 194), **overflows from 961 to 1007** where the large logo is drawn but no longer fits, and fits again from 921 to 960 (674 + 53.3 + 194). In that overflow band the fullscreen toggle is pushed off the right edge. Against the 1241 x 529 target Chromebook the finished row clears by 233px. Note the inherited Cypress figure of 54 for the small-logo floor is a rounding of 53.3 and runs the derived total a pixel high, which is why the shipped comment states the measured boundary instead.

**Shipped geometry, measured in Chrome on the head commit.** `.mainContainer` 674; the Speed widget group 99 (97 content + 2 border); Start to Speed **-1** (abutting) and Speed to Fireline 3; nine widget groups. Relative to the 97px content box: rail (21, 36) 55 x 1, ticks centered at 21 / 48.5 / 76, thumb (36.5, 24.5) 24 x 24, labels at y 49 h 17 with widths 26.3 / 15.7 / 15.2 and weights 400 / **700** / 400, all `rgb(67,67,67)` at 14px. Disabled: content `opacity: 0.35`, bubble `rgb(255,255,255)`, border `rgb(121,121,121)`, `hoverable` absent, input disabled, `pointer-events: none`.

**The gesture-to-event table, measured on the shipped control.** A click on a different tick emits one `SpeedChanged`; a click on the already-selected tick emits **none** (MUI fires no `onChange` for a no-op, on the thumb or off it); a drag across all three ticks emits **two**; an arrow key emits one, and none at the end of the rail. Each records a pace the model genuinely ran at, so an analyst should fold consecutive events rather than count them as decisions.

## Out of Scope

- **The other three bottom-bar stories** (WM-52's scale removal, WM-47's Clear All, WM-48's Vegetation Key), even though the board draws all of them in this row.
- **Changing the fire model.** The multiplier changes the clock, not the physics.
- **Making the multipliers per-activity authorable.** `modelDayInSeconds` already is; the multiplier sits on top of whatever an activity authored.
- **A continuous speed slider.** Explicitly ruled out: *"this does not have to be continuous"*.
- **Overriding MUI's own value logic.** Rejected: `step={null}` already snaps a click anywhere on the rail to the nearest tick, so nothing needs to replace the library's pointer handlers. Note this rules out custom *value* handling only; each tick does get a transparent 24 x 24 `:after` hit box, per the requirement above and *The tick's own click target is 6px* below.
- **Renaming the ticket.** Its "Hazbot:" prefix is inherited from the workshop feedback and is inaccurate, but harmless; see the decision below.
- **Accessibility review**, per the standing scope for this repo.
## Not Yet Implemented

- **The 0.5x slow end may not buy enough reaction time.** *(Now live: the slow tick runs at 0.25 as of the 2026-08-31 amendment, which is the quarter case this bullet names.)* The workshop complaint had two halves; 2x answers "fires take too long" directly, but a slow-down only answers "the fire finished before I saw it" if the student slows down *before* the moment of interest. At 0.5x a student reacting one second late has lost half the phenomenon; at 0.25x, a quarter. Not overruled so much as deferred to evidence, and logged as the specific thing to watch for in the first classroom run.
- **The 961-1007px overflow band.** Adding the 99px Speed group moves the row's minimum from 824 to 921 and opens a band where the large logo is still drawn but no longer fits, costing the fullscreen toggle. Documented in the Cypress viewport comment rather than fixed: the bar already overflows below its floor today, so this is the same known narrow-viewport behavior at a higher threshold rather than a new failure mode, and closing it means moving the logo breakpoint, which is a design question for its own ticket. The target Chromebook clears it by 233px.
- **The `Mui-focusVisible` latch makes the board's Hover row unreachable after a click.** The 1.0 Select ring hangs off `:active, .Mui-active, .Mui-focusVisible`, verbatim what `wind-circular-control.scss` and `vertical-selectors.scss` already write, and MUI applies `Mui-focusVisible` on a *mouse* gesture until the hidden input blurs. Speed is the first slider in the bar whose container also changes color, so the consequence is visible here and on neither of the others. Dropping `:global(.Mui-focusVisible)` would restore the board's Hover row at the cost of making Speed the one slider in the repo whose thumb states differ from the other two, for a difference visible only in a state the board does not draw. The repo idiom wins; it is one line to flip if Michael wants the board's row back, and is worth raising in PR review.
- **The `ui.showTerrainUI` term in the enable predicate is this spec's addition, not the board's.** The wizard is a state the board never draws, and every other control in the bar locks while it is open; without the term Speed is the only live control in a fully grayed bar. One boolean to flip, and worth raising with Michael in PR review alongside the latch above.
- **The 355ms terrain-rebuild fade is accepted rather than designed away.** `ready` includes `dataReady`, so the control fades for roughly 355ms whenever the terrain regenerates. Implementing the board's latch semantics to remove it would make Speed the only control still live while the cells rebuild, and would add state that has to be cleared in exactly the right place in `reload()`. Start, Spark and Clear All fade with it, and the main thread is blocked rebuilding cells for most of the window.

## Decisions

### Are the multipliers 0.5 / 1 / 2, or Trudi's 0.25 / 1 / 3?
**Context**: The board labels the three ticks 0.5x, 1x and 2x, and Michael's description names those same values. Trudi's note in the same description floats *"maybe fast should be 3x and slow should be .25 ... we can test it!"*. The board is the later artifact and it is what is drawn, but the ticket carries both. The distinction is not cosmetic on the design side, since the labels are drawn text.
**Options considered**:
- A) Build 0.5 / 1 / 2 as drawn, with the values in one constant so retuning is a one-line change plus a label update.
- B) Build 0.25 / 1 / 3 per Trudi's note and ask Michael to relabel.
- C) Ask Trudi and Michael to settle it before building.

**Decision**: **A**, with the three multipliers in a single module-level const array so retuning is one line. Not routed to Trudi: her note reserved the values for testing rather than asking for them to change before one exists to test, and the array is what makes that test cheap to act on later. Re-confirmed on a corrected basis after an earlier reading had 3x pulling the `maxTimeStep` ceiling in while 0.25x was free; that is wrong, since `optimalTimeStep * 4` scales with the multiplier and `maxTimeStep` cannot bind below about 15x, and the ignition schedule is identical at 3x as at 0.5x. With no technical thumb on either scale, A rests on the board being the only artifact anyone agreed to, drawn *after* Trudi's note.

---

### Should the labels be formatted from the multipliers, or stored beside them?
**Context**: The labels are drawn text and the multipliers are numbers, and the ticket says the numbers are tunable. If they live in separate places, the first retune produces a control whose label disagrees with its behavior and nothing fails.
**Options considered**:
- A) One array of `{ multiplier, label }` entries.
- B) Derive the label as `` `${multiplier}x` `` from a multiplier-only array.
- C) Two parallel lists, with a test asserting agreement.

**Decision**: **A.** C is the duplication the repo gets reviewed for. B satisfies the source-of-truth rule while quietly re-coupling the two: the tick's text could then only ever say what the model is doing. Keeping the label as its own field makes a whole class of retune free, since a test that runs the slow end at 0.4 behind the "0.5x" Michael already drew is one number in one file, with no design change. It follows that **nothing asserts that a label agrees with its multiplier**, since such a test would forbid the divergence the array is shaped to allow, and that both log payloads carry both fields, since neither reconstructs the other.

---

### Does the speed reset to 1x on Restart or Clear All?
**Context**: The board's state table says Speed *"remains available"* after a run and that Clear All *"returns to Default; clears model"*. "Default" there describes the bar's enable states, not necessarily the selected speed, and nothing says what happens across a Restart.
**Options considered**:
- A) Persists across Restart, resets to 1x on Clear All.
- B) Persists across both; it is a viewing preference, not model state.
- C) Resets to 1x on both.

**Decision**: **A.** `restart()` resets model state only with no notion of a view preference, so persistence across Restart is what happens if the multiplier is left alone; C would need code written to defeat it for no stated benefit. `reload()` then calls `setInputParamsFromConfig()` under *"Reset user-controlled properties too"*, exactly where `wind.speed` is restored, so the Clear All reset is one line in the place the repo already designates. The board adds a third argument against B that the question could not have known: it draws Speed **disabled** in state 7, since Clear All removes the sparks, so under B a student who chose 2x would keep it behind a grayed-out control with no way to see or change it.

---

### Should a speed change be logged, and does it belong on the run payload?
**Context**: Nothing forces a log event, since `translate.ts` defaults to no-op. But a researcher comparing runs would want to know that one student watched a fire at 2x and another at 0.5x, and more usefully whether the speed changed *during* a run.
**Options considered**:
- A) Log a `SpeedChanged` event with the old and new multipliers.
- B) Add the current multiplier to the `SimulationStarted` payload.
- C) Both.
- D) Neither for now.

**Decision**: **C.** B alone is provably insufficient: the control is enabled during a run by design, so a mid-run change is ordinary rather than an edge case, and a start-of-run field silently mislabels everything after the first change. A alone is insufficient in the other direction: a run's starting speed could then only be found by scanning backwards across the `SimulationStarted` boundary for the last `SpeedChanged` and defaulting to 1x when there is none, which every analyst would have to reimplement correctly. D is not costless in the way "defer it" usually is, because sessions collected before a field exists cannot be back-filled. **Why this story owes the fix at all**: `modelDayInSeconds` is already on the run payload, so wall clock and model time are interconvertible from the log today; this story is what replaces that constant with a step function, so it is the story that breaks the property and the one that should restore it.

---

### How is the per-tick click target built, given MUI's rail-wide click behavior?
**Context**: The ticket asks that clicking a tick select it, with *"click area ... the ~same dimensions as the thumb"*. MUI handles a click anywhere on the rail by jumping to the nearest allowed value, which satisfies "clicking a tick works" but is more permissive than the ticket describes.
**Options considered**:
- A) Use MUI's default snap-to-nearest and treat the ticket's wording as a minimum, not a restriction.
- B) Overlay three explicit hit targets sized to the thumb and suppress rail clicks elsewhere.
- C) Confirm with Michael which he meant.

**Decision**: **A**, confirmed in MUI's source rather than the docs. The ticket's sentence reads as a floor on the affordance ("do not make me hit a 4px tick"), and A clears it by a wide margin. B means overlaying three targets *and* suppressing MUI's own handlers between them, which fights the component rather than configuring it, for a restriction nobody asked for. C is not worth Michael's time given that the implemented behavior is strictly more permissive than the request. **This settles the *value* logic only**; the vertical hit target is a separate problem, resolved below.

---

### The tick's own click target is 6px, and the fix is not the obvious one
**Context**: A follow-up to the decision above, which was true horizontally along the rail and said nothing about the vertical. `height: 1px; padding: 0` collapses the slider root, the element carrying MUI's pointer handlers, to 55 x 1 px. Measured down a tick's x: the 6px mark is live, then a ~9px dead gap, then the label. Clicks above the rail beyond 3px do nothing.
**Options considered**:
- A) Give the slider root vertical padding, MUI's own approach (`padding: 13px 0`).
- B) Set an explicit height on the root.
- C) A transparent 24 x 24 `:after` hit box on each mark.

**Decision**: **C**, and A and B are recorded because they were built and measured rather than reasoned about. Both produce a root whose border box measures 21px tall with every drawn dimension unchanged, but **hit-testing does not follow the box**: the live band goes from 6px only to 8px, real clicks 4 to 8px below the rail still do nothing, and `elementsFromPoint` does not report the root at those points despite them being inside its measured rect. The mark is the child that is reliably hit-tested. C takes the live band from 6px to 24px vertically and 30px horizontally, changes no drawn pixel, and matches the ticket's "~same dimensions as the thumb" exactly, since the thumb is 24px. Verified on the shipped control: a click 8px below the rail selects the tick.

---

### Is the speed control enabled while the model is running, and does it survive a pause?
**Context**: The board's state 4 lists what becomes disabled during a run (Setup, Spark, Hazbot) and does not mention Speed, which implies it stays enabled. That has to be right, since adjusting the speed of a fire you are watching is the story's whole purpose, but it was inferred from an omission.
**Options considered**:
- A) Enabled throughout states 3 to 7, disabled only before a spark exists.
- B) Confirm with Michael before building.

**Decision**: **A, and no longer read from an omission.** The board states it positively in its state-3 note, and the layers agree: the "Speed" header's opacity is 0.35 in states 1, 2 and 7 and 1 in states 3 through 6. That measured table also corrects the predicate: it is **`ready`**, not "the same condition that enables Start". `startEnabled` carries `&& !simulationEnded` and is false after a run, yet the board draws Speed enabled in state 5. No conflict with WM-31, which gates Hazbot on `simulationRunning`, a different flag.

---

### The board's worded enable rule is a latch, and `ready` is not
**Context**: The board's state-3 note says *"Speed is first enabled when Start becomes enabled, then is always enabled (unless Clear All resets the model)"*. That is a latch; `ready` is recomputed, and the two come apart in two reachable places. **Terrain rebuild**: `updateZones()` sets `dataReady = false` for a measured 355ms after Create, so the control fades. **Setup wizard**: the repo's own state machine has an eighth state the board never draws, where `sim.ready === true` while Start, Spark and Clear All are all disabled, so under bare `ready` Speed is the only live control in a fully grayed bar.
**Options considered**:
- A) Implement the board's latch literally.
- B) Bare `ready`.
- C) `ready && !ui.showTerrainUI`, the same expression shape Start already carries.

**Decision**: **C.** The wizard gate is not per-control semantics in this bar, it is "the wizard owns the screen", and every neighbor follows it; a single live control in a grayed bar reads as an oversight. The board's sentence is about the model-state sequence it draws rather than about a modal panel appearing in none of its rows, so this fills a gap rather than overriding a decision. A is rejected because it would make Speed the only control still live while the cells rebuild, and would add state that has to be cleared in exactly the right place in `reload()`; the 355ms fade is accepted instead, and Start, Spark and Clear All fade with it.

---

### Who owns the Speed widget group, the bar or the component?
**Context**: An earlier decision concluded the component had to own its own widget group, because dropping the `hoverable` class while disabled was "structural". The premise does not hold: `BottomBar` is an `@observer` that already computes the enable state of every other control, so it can equally write the conditional class and stay reactive. The exact precedent is one widget to the left, where `bottom-bar.tsx` wraps `VegetationKeySwitch` and its width lives in `bottom-bar.scss`.
**Options considered**:
- A) The component owns its group and imports `bottom-bar.scss`.
- B) `bottom-bar.tsx` owns the group, as it does for every other widget.

**Decision**: **B.** The deciding argument only appears once the predicate is `ready && !showTerrainUI` rather than a bare `ready`: under A that expression is computed twice, once in the bar for the `hoverable` class and once in the component for MUI's `disabled` prop, which is exactly the duplicated-value pattern this repo gets reviewed for. Computing it once as a `speedEnabled` getter and passing `disabled={!speedEnabled}` mirrors `sparkEnabled` and `IconButton`. Secondary: it keeps every group and every group width in the two files that hold the others, which is what both Cypress specs assume, and avoids importing `bottom-bar.scss` into a child module, which nothing else in the repo does.

---

### The disabled treatment: whole group or content only?
**Context**: The requirement said 35% opacity on the whole group, "matching the treatment used elsewhere in the bar". Neither half held. Read layer by layer, the board's three disabled rows keep `Speed Control Back` at opacity 1 and put 0.35 on every content layer, exactly as `Start Control Back` stays at 1 while `Start` and `Start ICON` drop. The bar's only disabled rule does the same in CSS.
**Options considered**:
- A) Fade the whole widget group.
- B) Fade the content only, leaving the bubble and its 1px border at full opacity.

**Decision**: **B.** Measured on the real control: bubble `rgb(255,255,255)` at opacity 1 with its border `rgb(121,121,121)` identical to Start's. Rendering A put the same border at `rgb(187,187,187)`, visibly lighter along the top of the bar and across the seam it shares with Start. Three things came out of building it: MUI's `disabled` prop is needed alongside the fade, because opacity does not stop pointer input; `grayscale(1)` is dropped as a no-op on an achromatic control; and the `hoverable` class has to come off while disabled, since the board's disabled row keeps the bubble white and Speed is not a button with a `:disabled` to do it for free.

---

### `bottom-bar.scss` already contains a dead slider block that this story turns into a trap
**Context**: A 27-line `.slider` block with a nested `.thumb`, `.disabled` and bare `span` rule, provably unreachable under CSS modules. It arrived with the moisture-content slider in 2019 and was orphaned the same year by *"Remove precipitation slider from bottom bar"*.
**Options considered**:
- A) Delete it as part of this story.
- B) Leave it and warn about it in the spec.

**Decision**: **A.** It is inert today, but this story is what makes it dangerous: it is a slider block, in the file the Speed slider is being added to, and it disagrees with this story on the two things it describes (`opacity: 0.25` against the board's 0.35, and a 20px thumb centered by `margin-left` against our 24px centered by MUI's transform). Speed is the first slider to reach this file since 2019, so the next engineer finds `.slider`, `.thumb` and `.disabled` already present and has every reason to extend them. B protects whoever reads the spec while the trap stays in the file, and leaves two conflicting slider vocabularies there permanently.

---

### The obvious acceptance test measures the wrong thing
**Context**: "2x runs twice as fast" invites a wall-clock test. A first attempt produced 2.32x and 1.14x against an arithmetic expectation of exactly 2 and 0.5.
**Options considered**:
- A) Measure wall-clock elapsed time in a browser test.
- B) Assert the computed timestep, which is deterministic given a frame interval.

**Decision**: **B.** Not because wall clock cannot be measured accurately: it can, and was, to within 0.2% at all three speeds once the harness was fixed. It is that doing so needs a real rAF loop, a warm page, a discarded first tick and a frame gap between runs, none of which a Jest suite has, and the one property a wall-clock test adds is the frame rate, which is the machine's rather than this story's. The timestep formula is extracted from `rafCallback` as a pure function so it can be asserted directly. The 2.32x figure turned out to be the same-tick restart bug in the harness rather than anything about the multiplier.

---

### Nothing pins the day-boundary guarantee that makes the speed change safe
**Context**: A faster model does not change fire outcomes because `maxTimeStep` (180) is smaller than the model day (1440), so a tick can never skip a day's stochastic roll. That relationship is a coincidence of two unrelated constants in two files, commented nowhere, and this story is what makes it load-bearing.
**Options considered**:
- A) Assert the relationship between the two constants directly.
- B) Assert it behaviorally: drive a real `FireEngine` at `getDefaultConfig().maxTimeStep` and assert `engine.day` never advances by more than one per tick.

**Decision**: **B.** A is not directly buildable: the 1440 is module-private to `fire-engine.ts`, so reaching it means either widening that module's surface for a test's benefit or retyping the number, and a repeated constant is what this repo flags hardest. B contains no duplicated constant, since the ceiling comes from config and 1440 never appears. **The mutation it catches, verified**: feeding the harness a range of ceilings, 180 gives a largest jump of 1, 1439 gives 1, and 1500 and 2900 both give 2, so raising `maxTimeStep` past a model day fails the test with no further edit. B is also the stronger form because the constant comparison would keep passing against a stale numeric relationship if someone later reworked how `updateFire` derives the day.

---

### "A retune is free to move either end" is false above about 5x
**Context**: The spec twice told a future retuner the fast end was unconstrained, which had been checked against `maxTimeStep` and the day boundary. There is a third, much tighter boundary: the graph samples once per model hour, so a tick longer than 60 model minutes drops an hour from `rawBurnData` and shifts every later index of the logged `burnRates` array against its documented "index 0 = hour 1" contract.
**Options considered**:
- A) Record the ceiling in the prose.
- B) Record it and assert it.

**Decision**: **B.** Measured over 600 frames at three frame times: 0.25x to 5x skips no hours at any frame rate, 6x skips 117 of 717 at a 200ms frame, 8x skips 191 at 55ms. The crossover is `11.97 * m > 60`, i.e. m > 5.01. It is a guard rather than a live defect, and it earns its place the same way the day assertion does: it fails on exactly the change it exists to catch, since the shipped multipliers give a 47.87-minute maximum tick against a 60-minute bucket while a 6x entry gives 71.8. The test names neither 60 nor 1440, and pairs the guarantee with the bound that makes it falsifiable so a retune crossing the hour is caught rather than passing silently.

---

### No criterion covers what the control looks like mid-drag
**Context**: The requirements cover the three resting states and the disabled state; the board draws the thumb only at rest on a tick. Dragging is supported, so there is an unspecified intermediate, and MUI can do either continuous-follow-then-snap or jump-tick-to-tick.
**Options considered**:
- A) Specify one behavior.
- B) Record that the library settles it.

**Decision**: **B.** It is not a choice. Under `step={null}` the move handler runs the same snap as a click, so the thumb jumps tick to tick during the drag and there is no continuous-follow mode available without reimplementing the pointer handling. That is also what the board is consistent with, since it draws the thumb only at rest positions. Recorded rather than made a requirement, because stating it as one would invite someone to build it.

---

### A speed change mid-run has no visible confirmation beyond the fire's pace
**Context**: A student who clicks 2x on a fire that has not reached anything flammable yet gets no signal that the model changed.
**Options considered**:
- A) Add confirmation UI.
- B) Accept it.

**Decision**: **B.** The immediate feedback is stronger than the finding credited: two things happen on the same frame as the click, both drawn on the board, since the thumb moves to the clicked tick and the label bolding moves with it. So the student gets an immediate two-part confirmation that the *control* registered the input, which is what a control owes them. What is genuinely delayed is confirmation that the *model* changed pace, and that is inherent to the thing being controlled rather than a gap in the design. A would mean inventing UI the board does not draw.

---

### The story is titled "Hazbot:" but has nothing to do with Hazbot
**Context**: The prefix comes from the workshop feedback, where the motivation was getting Hazbot's feedback sooner. The control touches no Hazbot code.
**Options considered**:
- A) Rename the ticket.
- B) Record it and move on.

**Decision**: **B.** The prefix is accurate about the motivation and misleading about the surface. Renaming is recorded in Out of Scope rather than done, because the title is how the story is referred to on the sprint board and in the timesheet, and the confusion it invites is fully defused by this spec saying so.

---

### Where does this story sit in the four-story bottom-bar sequence?
**Context**: The board's finished row exists only once WM-52, WM-47, WM-48 and this story have all landed. Adding a 99px group to a bar that still contained the 142px Fire Intensity Scale would produce a row about 40px wider than either the current design or the board.
**Options considered**:
- A) Sequence deliberately, landing WM-52 first.
- B) Build in any order and accept intermediate states.

**Decision**: **Settled by events rather than chosen: this story lands last and therefore owns the final row.** WM-52 and WM-47 merged 8/26 and WM-48 merged 8/27, so the only intermediate state left is the one this story creates and closes in the same PR. That makes this the story that re-derives the gap chain from the board's table in one pass, which is the deliverable all three copies of this question were asking for. The risk the question worried about had already been measured away on WM-47's branch: the left and right containers are `flex: 1 1 0%` and absorb the growth, so no ordering produced a broken bar. Two numbers moved while it sat open: the finished row is **671px, not the board's 667**, because Michael's 8/26 answer keeps the coincident 1px seam rather than the board's 2px; and an earlier 701px non-overflow measurement was taken without a rule-set loaded, which understates the row, since a loaded rule-set puts the Hazbot button in and sets the right container's floor to 194.

---

### Where should `SpeedChanged` be logged, and does a no-op click log?
**Context**: The plan originally guarded with `if (index === simulation.speedIndex) return;` so a re-click on the current tick would not log. Instrumenting the built control showed the premise was false: **MUI never fires `onChange` for a no-op**, on the thumb or 6px off it, and neither does an arrow key at the max. The guard could never be true, so the real question was which handler to log from. Measured on both: a click on the selected tick emits 0 from `onChange` and **1 (a no-op)** from `onChangeCommitted`; a drag across all three ticks emits 2 and 1; a drag out and back emits 4 and **1, with the starting value**.
**Options considered**:
- A) Log from `onChange`. Every speed the model actually ran at is recorded; a drag emits 2 to 4 events.
- B) Log from `onChangeCommitted`, which is the repo's own slider pattern (`terrain-panel.tsx` updates the model in `onChange` and logs `ZoneUpdated` on commit). One event per gesture, matching student intent.

**Decision**: **A**, and the dead guard is deleted rather than kept. The precedent for B exists because the drought and vegetation sliders are setup-panel controls whose intermediate values never reach a running model. Neither holds here: Speed is enabled during a run by design, so a mid-run drag really does run the fire at each tick it crosses, and this event exists precisely to keep model time and wall clock interconvertible. B would discard exactly those intermediate speeds, which is the property the logging requirement was added to preserve. B also carries two costs the precedent hides: it fires on a no-op click, so it would need a real guard where the current one is dead code, and `previousMultiplier` would have to be captured at gesture start rather than read at log time. The cost of A is noise on a gesture (dragging a 55px three-tick control) that is unusual next to clicking.

---

### The named precedent for the `SpeedChanged` assertion silently drives the slider to the wrong tick
**Context**: The plan said to model the assertion on `vegetation-key-switch.test.tsx`, which drives a MUI `Switch` with `userEvent.click`. That is the natural thing to reach for and the wrong thing for a `Slider`: MUI resolves a pointer position through `getFingerNewValue`, which reads `getBoundingClientRect()`, and jsdom has no layout, so that rect is all zeros, every position resolves to percent 0, and `findClosest` returns the first mark.
**Options considered**:
- A) `userEvent.click` on the label, per the switch precedent.
- B) `fireEvent.click` on the same label.
- C) `fireEvent.change` on the hidden range input, per `terrain-panel.test.tsx`.

**Decision**: **C.** Measured in jsdom with the store wired and the log mocked: A sets `speedIndex` to **0** and logs `multiplier: 0.5` while asserting it clicked 2x, and it only fires at all because the default index is 1; B emits nothing, since MUI listens on pointerdown / mousedown rather than click; C sets 2 and logs the right payload. Keyboard is not an alternative either, since MUI routes arrow keys through the input's `change` event, which jsdom does not implement. Two details come with C: the input is only reachable by `querySelector`, which is `testing-library/no-node-access`, an **error** under the repo's `plugin:testing-library/react` override, so the `eslint-disable-next-line` is required rather than optional; and `vegetation-key-switch.test.tsx` stays the right precedent for the assertion's *shape*, which is the part of it that does transfer.

---

### Where should the two boundary tests live?
**Context**: The day boundary constructs a real `FireEngine`, which `fire-engine.test.ts` already has a fixture for, and the hour boundary drives `sim.tick()` the way `simulation.test.ts` already does. The question was whether the repo colocates tests with the module under test.
**Options considered**:
- A) Both in a new `src/models/speed.test.ts`.
- B) Split them into `fire-engine.test.ts` and `simulation.test.ts`.
- C) All of it appended to `simulation.test.ts`, adding no new file.

**Decision**: **A.** Colocation is not the rule here: 13 test files under `src/` have no matching module, and every one is named for a property or concern rather than a module (`log-events.test.tsx`, `replay-determinism.test.ts`, `feedback-ladder.test.ts`, `helitack-run-window.test.ts`). "Model speed" is that shape, since the guarantee spans `SimulationModel` and `FireEngine` and is only meaningful as one story's claim.

---

### Should this story correct the stale arithmetic in the Cypress viewport comment?
**Context**: `bottom-bar-visuals.cy.ts`'s viewport test carries a comment deriving the row's intrinsic minimum as 824 from a left-container floor of 54. The 54 is a rounding of the small logo's 53.3, so the derivation runs a pixel high in both eras. With Speed the row fits at 1008+, overflows from 961 to 1007, and fits again from 921 to 960. The assertion passes either way at 1241 x 529, so nothing is broken.
**Options considered**:
- A) Update the controls term to 674, record both logo regimes and the 961-1007 band, and leave the breakpoint alone.
- B) Update only the parts the geometry change makes wrong, leaving the 54 for its own ticket.
- C) Leave the comment alone; no assertion reads it.

**Decision**: **A.** The comment sits in a file this story already edits and the story invalidates its 576. The shipped comment states the **measured** 921 / 920 boundary rather than a derived total, since measurement on the head commit contradicted the rounded arithmetic. The band is documented, not fixed: closing it means moving the logo breakpoint, which is a design question for its own ticket, and the bar already overflows below its floor today.

---

### The state table has eight rows and `expectButtonStates` has ten call sites
**Context**: The Cypress step gave the eight bar states and said the helper "gains a `speed` key across its eight states". `speed` is a required field on that object literal, so every call site has to be filled, and the file calls it **ten** times: the eight named states plus "Fireline armed" and a second call inside the state-8 test asserting the bar *before* the wizard opens. Neither appears in the state table, so an implementer working from it has two values to guess at the point the file stops compiling.
**Decision**: accepted and applied. Both were measured rather than derived: Fireline armed is **true** (the run is in progress, so `ready` holds) and state 8 pre-open is **true** (the spark is placed and `showTerrainUI` is still false). The step's table is now keyed by call site rather than by state number, so it maps one-to-one onto the edits.

---

### The stale-prose list for `bottom-bar-visuals.cy.ts` misses two inline comments
**Context**: The step named the file header's "three abutting bubble seams", the test name's "eight widget groups", and the viewport comment's 576. Two more sites in the same file quote the contract this story changes: the comment inside the `.mainContainer` test ("the sum of the **eight** widget widths"), and the gap test's own comment, which is the file's only explanation of *how* the abutment is built and names which groups carry `margin-right: 0` immediately before this story adds a fourth.
**Decision**: accepted and applied. All five prose sites are now carried as a table with what each becomes, keyed to the grep (`eight`, `three abutting`, `Spark <-> Restart`) that produces exactly them, so the edit is checkable rather than remembered. They are included because they are the half that fails silently.

---

### The step-2 component imports `log` and does not use it until step 3
**Context**: `speed-control.tsx` as first written opened with `import { log }`, but that step's `handleChange` only called `setSpeedIndex`; the `log()` call arrived in the logging step, so as its own commit the file carried an unused import.
**Decision**: the import moves to the logging step, next to the call that needs it, so each step's version of the file is self-consistent. Nothing in the pipeline was going red over it (`@typescript-eslint/no-unused-vars` is a warning, `npm run lint` exits 0 on warnings, CI does not run lint, and `ts-loader` is `transpileOnly`); the point is that each step should stand up as its own reviewable commit, which is what the step structure is for.

---

### `Mui-focusVisible` latches after a mouse gesture, so the board's Hover state is unreachable after the first click
**Context**: The Hover / Select requirement pins the two ring alphas from the board's four-state column and pairs each with a bubble color. The stylesheet binds the 1.0 ring to `:active, .Mui-active, .Mui-focusVisible`, verbatim what `wind-circular-control.scss` and `vertical-selectors.scss` already write. On those two it is invisible, because neither control's container changes color. On Speed it is not. Measured in Chrome after each gesture settles: pristine gives no ring; hover before any click gives the 0.5 ring; **after a click, pointer away**, the thumb holds the 1.0 ring with `Mui-focusVisible` set; hovering after a click gives the 1.0 ring rather than the board's 0.5; hovering after clicking elsewhere to blur returns to 0.5.
**Options considered**:
- A) Keep the CSS and record the latch.
- B) Drop `:global(.Mui-focusVisible)` to restore the board's Hover row.

**Decision**: **A.** B would make Speed the one slider in the repo whose thumb states differ from the other two, for a difference visible only in a state the board does not draw, and at rest the ring is white on a white bubble and therefore invisible, which is why an earlier verification pass did not see it. The measured table is in the Hover/Select requirement and the stylesheet carries a comment saying the class is in the Select group on purpose, so the divergence is not read later as a regression. One line to flip if Michael wants the board's row back. Separately confirmed that the `:has(:global(.Mui-active))` rule is not what is at issue: measured mid-drag with the pointer 80px above the bar, the bubble holds `rgb(223,223,223)` while `:hover` is false, which is exactly what that rule was added for.

---

### `setSpeedIndex` accepted an out-of-range index
**Context**: The setter wrote its argument straight to `speedIndex`, so `setSpeedIndex(3)` made `SPEEDS[3]` undefined and the `speedMultiplier` computed threw. The slider cannot produce such a value, but `window.sim` can, and the model phase's whole surface is `window.sim`.
**Options considered**:
- A) Leave it; the only real caller is bounded.
- B) Guard at each read site.
- C) Clamp in the setter.

**Decision**: **C**, found in review. `speedMultiplier` is read by `rafCallback` on every frame while the model runs, so a single bad index throws once per animation frame rather than degrading. The setter is the only place that can make the invalid state unreachable rather than recording it, which is the repo's preference; B would spread the same check across every read. Asserted in `speed.test.ts`, at both ends.

---

### The `SpeedChanged` payload re-derived the speed from the raw slider index
**Context**: `handleChange` called `setSpeedIndex(index)`, which clamps, then built the payload from `SPEEDS[index]` using the unclamped value, so the log and the model derived the same number from two different sources.
**Decision**: read both values off the model's computeds, found in review. `SPEEDS[index]` would throw on an index the model accepts by clamping, and any future change to how `setSpeedIndex` resolves an index would silently desynchronize the event from the pace the model actually ran at, which is the one property this event exists to preserve. Capturing `previousMultiplier` before the call and logging `simulation.speedMultiplier` / `simulation.speedLabel` after it drops both `SPEEDS` lookups from the handler and makes the payload structurally unable to disagree with the model.

---

### The control's content width was written twice
**Context**: `.content` set `width: 97px`, the same constant `bottom-bar.scss`'s `.speedControl` sets on the widget group, while the comment on that group said "the width lives here only, as .vegetationKey does".
**Decision**: `.content` takes `width: 100%`, found in review. The two values are only correct together, so retuning the group to any other width would silently leave the control sized to the old one, and the group is content-box, so the inner div would overflow or underfill by exactly the drift. `vegetation-key-switch.scss` already states the pattern ("Fill the widget group, which owns the width"). Verified geometry-neutral in Chrome: the group still measures 99, the content 97, and every internal position is unchanged.

---

### The Jest wizard-lockout block did not cover Speed
**Context**: `describe("model controls while the Setup wizard is open")` has a case per locked control and a header comment naming the ones that need no guard. Speed is locked by that same wizard and appeared in neither list, so deleting the `!ui.showTerrainUI` term left the Jest suite green.
**Decision**: add a case, found in the final review. That term is the one part of the enable predicate this story chose rather than read off the board, so it is the part most likely to be questioned and removed later, and the block reads as the authority on which controls the wizard locks. Cypress state 8 covers it in CI already, so the value is fast feedback and an enumeration that reads as complete. It cannot reuse `expectButtonState`, which calls `toBeDisabled()` on the element carrying the testid: the Slider's is a non-form `<span>`, so the case reaches the hidden range input the way the logging test does. Verified to fail on exactly that deletion.
