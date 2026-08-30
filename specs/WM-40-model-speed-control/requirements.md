# WM-40: Add a speed control to speed up or slow down the model

**Jira**: https://concord-consortium.atlassian.net/browse/WM-40
**Repo**: https://github.com/concord-consortium/wildfire-model
**Implementation Spec**: [implementation.md](implementation.md)
**Status**: **In Development**

## Overview

A three-position speed control lands in the bottom bar between Start/Pause and Fireline, letting a student run the model at 0.5x, 1x or 2x. The model side is a single multiplier on the one place the app converts model time to real time; the control is a snap-to-tick MUI slider whose selected label renders bold.

## Project Owner Overview

Teachers at the ISLAND workshop reported the model's pace working against them in both directions. Some fires take long enough that students give up waiting for Hazbot's feedback; others burn fast enough that students miss the phenomenon they were asked to observe, which happened specifically during the fire-intensity tasks.

This adds a simple three-speed control: half speed, normal, and double. It is deliberately discrete rather than a continuous slider, which Trudi confirmed is fine and which is meaningfully cheaper to build and test. The specific multipliers are explicitly tunable: Trudi's note says fast might want to be 3x and slow 0.25x, and *"we can test it"*, so the numbers are a starting point rather than a decision. Nothing about the fire model itself changes, only how fast the clock runs.

## Background

The model's pace has exactly one input. `config.modelDayInSeconds` (default `8`, `config.ts:176`) is read in **one place**, `simulation.ts:479`, where it becomes `ratio = 86400 / modelDayInSeconds`, the number of model-minutes per real-minute. Everything downstream of that is the per-frame timestep. So the model half of this story is one observable multiplier applied to that ratio, plus the plumbing to set it.

The ticket's *"This will need design by Michael"* is now closed: the *Updated Wildfire Controls and Labels* board draws the control in all seven bottom-bar state rows, plus its own four-state column, so its geometry, its enable states and its selected-label rule all come from the board rather than from inference.

The control lands in the bottom-bar row that three other Sprint 24 stories are also changing: WM-52 removes the Fire Intensity Scale, WM-47 renames and moves Reload to Clear All, and WM-48 adds a Vegetation Key toggle. The Zeplin board draws the finished row with all four in place. See the last open question.

## Requirements

- A three-position speed control renders in the bottom bar **between Start/Pause and Fireline**, as its own widget group at **97px content / 99px border box**.
- **The Speed group abuts Start on its left** and takes the standard 3px gap to Fireline on its right. The board draws Start Control at 592-652 and Speed Control at 652-749, so there is no gap between them; Fireline Control starts at 754, five content-box pixels further on, which is the standard gap. The abutment follows the repo's existing idiom: the **preceding** group zeroes its `margin-right` and the next group's `-1px margin-left` pulls it flush, as `.restart` and `.fireLineButton` already do (`bottom-bar.scss:141-143`, `:158-165`). Start's widget group carries no modifier class today (`bottom-bar.tsx:189`), so this adds one, and the change is to Start rather than to the Speed group. Measured live: with the abutment the row is **671px across four coincident seams**; without it, 675px across three.
- The three positions are labeled **0.5x**, **1x** and **2x**, and the model runs at the corresponding multiple of its authored pace. **1x is the default.**
- The selected tick's label renders **Lato Bold 700**; the other two render **Lato Regular 400**. All three are 14px `#434343`.
- **The slot styling copies the setup panel's vertical selectors** (`vertical-selectors.scss`), which is the repo's closest `rail` / `mark` / `markLabel` / `thumb` structure, **except for the thumb and the disabled rule**. The thumb takes the horizontal asset, `slider-thumb-small.svg` at `width/height: 24px; background-size: 140%`, because Speed is horizontal and that is the variant whose chevrons point left and right. The disabled rule is the board's, not either slider's `opacity: 0.25`. **The full stylesheet is transcribed verbatim in Technical Notes**, measured against the board rather than derived, and it is the authority over this summary.
- **The slider's values are tick indices (0, 1, 2), not the multipliers.** MUI positions marks by `valueToPercent(mark.value, min, max)`, so using 0.5 / 1 / 2 as values would place the middle tick at 33% of the rail instead of the board's ~51%. The multipliers and their labels live in one indexed array so they cannot disagree.
- **`track={false}` is load-bearing, not cosmetic.** MUI computes a mark's active state as "is this the selected value" only when `track === false`; with a visible track it instead marks every value at or below the selection, which would bold 0.5x as well as 1x. The bolding rule depends on it, so **it carries an assertion** in `speed-control.test.tsx`: nothing else in the suite reads label weight, so removing the prop would otherwise leave the suite green. The assertion is made at the *fastest* tick, because at the slowest tick the trackless and tracked modes render identically and an assertion there could not catch the removal.
- The control snaps to ticks: dragging the thumb lands on ticks and clicking anywhere on the rail selects the nearest one. That value logic is MUI's own under `step={null}` with marks and needs no code. **The geometry does need one addition**: each tick carries a transparent 24 x 24 `:after` hit box, matching the thumb and the ticket's *"click area ... the ~same dimensions as the thumb"*. Without it the live target at a tick is the 6px mark and, 9 dead pixels lower, its label. Enlarging the slider root instead does not work; see the resolved Student finding for the measurements.
- **The control is disabled until a spark is placed and stays enabled from then on, including during a run, while paused, after the run ends, and after Restart.** It disables again when Clear All clears the sparks, and while the Setup wizard is open. The predicate is **`!simulation.ready || ui.showTerrainUI`**, the same shape Start carries at `bottom-bar.tsx:193`.
  - `ready` (`simulation.ts:78`) rather than `startEnabled`: Start also carries `&& !simulationEnded`, and the board draws Speed enabled in the after-run state where Start is disabled.
  - The `ui.showTerrainUI` term is this spec's addition, not the board's. The wizard is a state the board never draws, and every other control in the bar locks while it is open; without the term Speed is the only live control in a fully grayed bar. See the resolved Senior Engineer finding for the board sentence this trades against.
  - `ready` includes `dataReady`, so the control fades for roughly 350ms whenever the terrain regenerates (Setup, then Create). Start, Spark and Clear All fade with it, and the main thread is blocked rebuilding cells for most of that window.
- The disabled treatment fades **the content only, to 35%**, and leaves the widget group's white bubble and its 1px border at full opacity. This matches both the board and the bar's existing rule for buttons (`bottom-bar.scss:286-311`, *"grayscale + content faded to 0.35, button background unchanged"*). Fading the whole group instead renders the bubble's border at `rgb(187,187,187)` against every neighbor's `rgb(121,121,121)`, along a 1px line at the top of the bar and directly across the coincident seam it shares with Start.
- **`filter: grayscale(1)` is omitted**, unlike the button rule. It would be a no-op: the control is already achromatic (`#434343`, `#797979`, `#d8d8d8`).
- **MUI's `disabled` prop is set alongside the fade.** It supplies `pointer-events: none`; opacity alone leaves a faded control fully draggable.
- **Hover and Select are drawn by the board and are not optional.** Its four-state column captions them: *Hover, "icon outline 50% op"* and *Select, "icon outline 100% op"*. Both put a 32x32 white `Highlight` behind the thumb's 24px `Outer`, which is a **4px ring**, at alpha 0.5 and 1.0 respectively, and both turn the widget group's bubble **`#dfdfdf`**. The ring alphas are the wind meter's exactly; the ring is 4px against its 3px, and the bubble change is the piece the wind meter has no equivalent for. It is what makes a white ring legible, since on the default white bubble it would be invisible. Neither is a new color: `$hoverColor` is already `#dfdfdf` (`common.scss:29`) and `:global(.hoverable):hover { background: $hoverColor }` already exists (`bottom-bar.scss:89-91`). **The two states reach the bubble by different routes**, because the bubble belongs to the widget group and the control's own stylesheet lives inside it. Hover uses the `hoverable` class. Select needs `.speedControl:has(:global(.Mui-active))` in `bottom-bar.scss`, because MUI takes no pointer capture (`useSlider.js:539-541` binds `mousemove` / `mouseup` to the document), so a drag that wanders off the bubble drops `:hover` while `Mui-active` stays on the thumb: measured, the bubble reverts to `rgb(255,255,255)` mid-drag, and the group is only about 37px tall above the rail, so upward drift onto the terrain is a routine gesture. Without the `:has` rule the 100% white ring is drawn on a white bubble and disappears, which is what this requirement exists to prevent. `:global` is required around `Mui-active`; css-loader hashes it otherwise.
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
- **Two boundary guarantees are asserted behaviorally, both by driving a tick at a ceiling read from config rather than by comparing constants.** Both were written as throwaway Jest tests and pass; see the verification note in Technical Notes, which also records the mutation each one catches.
  - **The day boundary**: drive a real `FireEngine` at `getDefaultConfig().maxTimeStep` and assert `engine.day` never advances by more than one per tick. This is what keeps a faster clock safe, and the two constants that make it hold live in different files with nothing stating that one bounds the other. The test never names 1440, so raising `maxTimeStep` past a model day fails it on its own.
  - **The hour boundary**: drive `sim.tick()` at the largest per-tick ceiling any shipped multiplier can produce, `min(maxTimeStep, optimalTimeStep * 4)` at the fastest entry in the multipliers array, and assert `sim.timeInHours` never advances by more than one, **paired in the same test with the bound that makes it falsifiable**: the same drive at a hypothetical 6x must exceed one, so a retune that crosses the hour is caught rather than passing silently. The graph samples once per model hour, so a longer tick drops a point from `rawBurnData` and shifts every later index of the logged `burnRates` array against its documented "index 0 = hour 1" contract. This is the tighter of the two boundaries by a factor of 24, and it is the one a plausible retune can cross: the shipped multipliers give a 23.93-minute maximum tick against a 60-minute bucket, and a 6x entry would give 71.8. The test names neither 60 nor 1440. `simulation.test.ts:196-202` already drives `sim.start()` then `sim.tick()` in jsdom, and the timestep formula is extracted from `rafCallback` for the requirement below, so both reuse the same seam.
- **The speed multiplier is verified against the computed timestep, not against wall-clock elapsed time.** Not because wall clock cannot be measured accurately: it can, and was, to within 0.2% at all three speeds. It is that doing so needs a real rAF loop, a warm page, a discarded first tick and a frame gap between runs, none of which a Jest suite has, and the one property that a wall-clock test would add over a timestep test is the frame rate, which is the machine's rather than this story's. The timestep formula is extracted from `rafCallback` as a pure function so it can be asserted directly. See Technical Notes for both measurements and for the harness trap that a wall-clock test walks into.
- **Every speed change is logged as `SpeedChanged`, carrying the old and the new multiplier and the new label**, and documented in `LOGGED-EVENTS.md`. The event is named explicitly in `translate.ts` above its closing `default: return { kind: "no-op" }`, the way `VegetationKeyShown` and `VegetationKeyHidden` are, so Hazbot's inertness to it is stated rather than inherited.
- **The current multiplier and its label are added to the `SimulationStarted` payload.** They are model state rather than config, so they do not arrive through the generic `Object.entries(config)` snapshot and are appended explicitly in `bottom-bar.tsx` alongside `sparks`, `zones`, `wind` and `towns`. The multiplier is what keeps wall clock and model time interconvertible from the log, a property `modelDayInSeconds` provides today and this story would otherwise break.
- **Both log payloads carry the label as well as the multiplier**, because the two are allowed to diverge. The multiplier is what makes the log arithmetically usable; the label is the only record of what the student actually saw on the tick they chose. Under a retune that runs 0.4 behind a "0.5x" label, a multiplier-only log leaves an analyst unable to say which position was selected, and a label-only log leaves them unable to convert time. Neither field reconstructs the other.
- **Both log requirements carry an assertion**, in `src/components/log-events.test.tsx`: the new keys in the existing `SimulationStarted` payload block, and `SpeedChanged` firing with both multipliers and the label. That block asserts presence rather than shape, so without an explicit assertion a missing key passes silently. `vegetation-key-switch.test.tsx` is the precedent for the *shape* of asserting a control's own log event, but not for driving it: a MUI slider cannot be moved by `userEvent.click` under jsdom, whose zero-sized `getBoundingClientRect` collapses every pointer position onto the first mark. The driver is `terrain-panel.test.tsx`'s, a `fireEvent.change` on the hidden range input.
- **This story updates the two Cypress specs its geometry invalidates.** `bottom-bar-visuals.cy.ts` asserts `.mainContainer` at 576 (measured 674 with Speed in place) and a 3px `"Start -> Fireline"` gap (that adjacency is now Start to Speed, at -1). Its prose goes stale in **five** places in the same pass, all silent: the test name and the comment inside it both say "eight widget groups", the file header and the gap test's own comment both list three abutting seams and name them, and the viewport comment derives its total from 576. The per-widget width table also gains a Speed row. `bottom-bar-state-machine.cy.ts`'s `expectButtonStates` matrix gains Speed. `speed` is a required field on that literal, so it has to be filled at all **ten** of the helper's call sites, which is the file's eight named states plus the "Fireline armed" case and the pre-open assertion inside state 8.

## Technical Notes

Layout comes from the *Updated Wildfire Controls and Labels* board (`.../screen/6a8566a1c90489f7be36e66a`), group "Speed Control", which is drawn in all seven of the board's bottom-bar state rows and again as its own four-state column. Timing behavior was measured live in Chrome against the running dev server.

**The control's geometry**, relative to its 97 x 74 content box at absolute (652, 1544):

| Piece | Rel. position | Size | Style |
|---|---|---|---|
| "Speed" header | (29, 4) | 40 x 17 | Lato Bold 14px `#434343`, centered |
| Rail ("Slider Path") | (21, 36) | 55 x 1 | 1px `#797979` |
| Ticks (3) | centers at x 21, 49, 76 | 4 x 4 each | `#d8d8d8` |
| Thumb group | (33, 21) | 32 x 32 group; **24 x 24 visible circle** | see below |
| "0.5x" label | (7, 49) | 28 x 17 | Lato **400** 14px `#434343` |
| "1x" label | (40, 49) | 17 x 17 | Lato **700** 14px `#434343` |
| "2x" label | (67, 49) | 18 x 17 | Lato **400** 14px `#434343` |

Tick centers are 28px and 27px apart, the rail spans exactly first-tick-center to last-tick-center, each label is centered under its own tick, and the thumb's center sits on the middle tick in every state drawn. The thumb as drawn is a 24px `#797979` circle with a 21px white circle inset on top (a roughly 1.5px gray ring) plus a 12 x 6.6 chevron on either side of the center. **The chevrons point left and right, not up and down**: the board's `Slider Thumb` group carries `rotation: -90`, and only its leaf shapes are still named `Up` and `Down`, which is what reading the leaves alone gets wrong.

**The 97px width comes from the board and is fixed by the row arithmetic, not by the thumb.** The board's "Thumbs" group spans 657 to 744, the union of its 32px thumb's three resting positions (centered on ticks at 673, 701 and 728), leaving 5px of clearance inside the 97px content box at 652 to 749. The shipped thumb is the board's 24px visible circle rather than the 32px group box, so its travel spans 661 to 740 and the clearance is 9px a side instead of 5. **The 97px does not shrink to match**: it is what the board draws, and the finished 671px row depends on it. What the smaller box changes is only the slack around the rail.

**The board's enable states, stated in the board's own note and confirmed layer by layer.** The state-3 note reads: *"Speed is first enabled when Start becomes enabled, then is always enabled (unless Clear All resets the model)"*. The "Speed" header's opacity in each of the seven state rows agrees with it:

| State | Board's description | Speed |
|---|---|---|
| 1 | Default | **0.35** |
| 2 | Setup changed | **0.35** |
| 3 | Spark placed | 1 |
| 4 | During run | 1 |
| 5 | After run | 1 |
| 6 | Restart pressed | 1 |
| 7 | Clear All pressed | **0.35** |

This is the shape of `ready === dataReady && sparks.length > 0` (`simulation.ts:78`): disabled until a spark exists, enabled from then on, disabled again when Clear All clears the sparks. It is **not** `startEnabled`, which is `ready && !simulationEnded` (`:158`) and is therefore false in state 5, where the board draws Speed enabled and its own note says Speed *"remains available"*.

The board's note is a latch and `ready` is recomputed, so the two come apart in one state the board draws and one it does not. Neither is a reason to build the latch; both are recorded in the resolved Senior Engineer finding, and the shipped predicate adds `|| ui.showTerrainUI` for the state the board never drew.

**The bold-when-selected rule is confirmed by the board, and its mechanism depends on `track={false}`.** Across all seven state rows, "1x" is Lato-Bold 700 and "0.5x" and "2x" are Lato-Regular 400, and 1x is where the thumb sits in every one. In MUI, `markActive` is computed at `Slider.js:597-602`: **only** when `track === false` is it `values.indexOf(mark.value) !== -1`, i.e. exactly the selected mark. With a visible track it becomes `mark.value <= values[0]`, which would bold every label up to and including the selection. So the board's rule and MUI's `.MuiSlider-markLabelActive` line up precisely, but only in the trackless mode.

**Marks are positioned by value, which rules out using the multipliers as slider values.** `Slider.js:595` computes each mark's position as `valueToPercent(mark.value, min, max)`. With values 0.5, 1 and 2 over a 0.5-to-2 range, 1x would land at 33.3% of the rail; the board's ticks are at 21, 49 and 76 of a 97px box, so the middle one is at 50.9% of the rail. Indices 0, 1, 2 give 0 / 50 / 100%, which is what the board draws (the 28 vs 27px asymmetry is a 1px rounding, not a deliberate offset). So the slider carries indices and an indexed array maps each to its multiplier and its label.

**`step={null}` is a genuinely different MUI code path, and it answers both the click-target and the drag questions.** In `@mui/base/useSlider/useSlider.js:345-350`, a falsy `step` sends every pointer position through `marksValues[findClosest(...)]` instead of `roundValueToStep`. That function, `getFingerNewValue`, is called from the move handler (`:424`), the touch/pointer-down handler (`:458`) **and** the mousedown handler (`:525`). Two consequences follow with no code of our own: a click anywhere on the rail already selects the nearest tick, and during a drag the thumb jumps tick to tick rather than following the pointer, because the same snap runs on every move event. Keyboard handling changes too: `:277-283` moves to the adjacent **mark index** rather than by step when `marks && step == null`.

**The model side is one multiplier, verified.** `grep modelDayInSeconds` returns three hits: the config type, the default, and the single read at `simulation.ts:479`. So `ratio` is the only quantity a speed multiplier has to touch.

**Verified: at 60 FPS the multipliers are exactly linear.** The per-frame timestep is `Math.min(maxTimeStep, optimalTimeStep * 4, ratio * realTimeDiffInMinutes)` (`simulation.ts:490`). Measuring this browser's real frame interval (median **16.70ms, 59.9 FPS**) and evaluating all three terms at each candidate speed:

| Speed | `modelDayInSeconds` | ratio | maxTimeStep | optimal x4 | ratio x elapsed | binding term | model-min per real-sec |
|---|---|---|---|---|---|---|---|
| 0.5x | 16 | 5400 | 180 | 5.98 | **1.50** | `ratio x elapsed` | 90 |
| 1x | 8 | 10800 | 180 | 11.97 | **3.01** | `ratio x elapsed` | 180 |
| 2x | 4 | 21600 | 180 | 23.93 | **6.01** | `ratio x elapsed` | 360 |

90 / 180 / 360 is exactly 0.5 / 1 / 2. Neither clamp binds at 60 FPS at any of the three speeds.

**Under load both clamps preserve proportionality, and `maxTimeStep` never binds.** `optimalTimeStep * 4` is `ratio * 0.001108`, so it scales with the multiplier and is the smaller of the two ceilings at every multiplier below about **15x**: 5.98 minutes at 0.5x, 11.97 at 1x, 23.93 at 2x and 35.90 at 3x, all against `maxTimeStep`'s flat 180. Two things follow, and both correct what a reading of the three-term `Math.min` suggests. Catch-up starts being capped at the **same frame time at every speed**, about 66.5ms or 15 FPS, because the binding ceiling scales with `ratio`; there is no fast-end exposure, and 3x engages the clamp exactly where 1x does. And for the same reason a slow machine does not collapse the speeds together: 2x still delivers exactly twice 1x's model-minutes per frame at any frame rate, so a speed never quietly falls short of its label relative to its neighbors. `maxTimeStep` is therefore unreachable at any shippable multiplier, which means **raising it would not "make 2x work"**: it changes nothing until about 15x (`180 / 11.9664 = 15.04`), past which it is the only thing standing between one tick and a skipped day.

**The fire's outcome does not depend on the sampling rate.** This is the scientific-validity question the story raises and the answer is reassuring. In `engine/fire-engine.ts:186`, a cell ignites when the sampled `time` passes its `ignitionTime`, but the ignition times it then schedules for neighbors are computed from **the cell's own scheduled `ignitionTime`**, not from the sampled `time` (`newIgnitionData[n] = Math.min(ignitionTime + ignitionDelta, ...)`). So the spread schedule is fixed by the physics and coarser steps only change when state flips are observed, not when they are due. Measured rather than argued: driving a real `FireEngine` over a 30x30 grid at the per-frame timesteps 0.5x / 1x / 2x / 3x produce at 60 FPS (1.50, 3.01, 6.01 and 9.02 minutes), with `Math.random` replaced by a constant so the engine is deterministic and the timestep is the only variable, gives an **identical ignition schedule cell for cell and 900 of 900 cells burnt in all four runs**. Note that the constant matters: a *seeded* stream makes the runs diverge, because the number of draws interleaves differently with the day boundaries, which is a property of the shared random stream rather than of the sampling rate. The one genuinely step-size-sensitive piece is the per-day roll at `:152-158`. It is guarded by `if (newDay !== this.day)`, so it fires once per *observed* change of `Math.floor(time / modelDay)` (`modelDay = 1440` minutes, `engine/fire-engine.ts:7`), not once per boundary crossed. The failure mode to protect against is therefore a **skipped** roll rather than a doubled one: a tick that carried the day from 0 to 2 would run one roll, against day 2's probability, and day 1's roll would never happen. No tick can do that at any shippable speed, and the effective per-tick ceiling is `Math.min(maxTimeStep, optimalTimeStep * 4)`, which is 5.98 / 11.97 / 23.93 minutes at 0.5x / 1x / 2x against a 1440-minute day. The two constants sit in different files with nothing connecting them, which is why the requirement above asks for the relationship to be asserted.

**Changing speed mid-run is safe.** The multiplier only affects `ratio` on the following tick. `this.time` keeps accumulating and `prevTickTime` is untouched, so there is no discontinuity. Separately, `start()` sets `prevTickTime = null` (`simulation.ts:407`), so a resume after pause already avoids a catch-up jump; a speed change does not go through `start()` and does not need to. One consequence of that same line matters to the acceptance test: with `prevTickTime` null there is no measured frame interval yet, so `rafCallback` falls through to a flat `timeStep = 1` (`simulation.ts:492-494`). The first tick of every run **and of every resume from pause** therefore advances model time by exactly one minute at any multiplier. A test that pins the computed timestep has to discard that first tick.

**Restart and Clear All already have the seams this needs.** `restart()` (`simulation.ts:416-443`) resets model state only: run flags, cells, fire-line markers, intervention counters, `time`, `engine`, and the saved wind. It has no notion of a view preference, so a speed multiplier left alone survives Restart for free. `reload()` (`:445-451`) calls `restart()` and then, under the comment *"Reset user-controlled properties too"*, calls `setInputParamsFromConfig()`, which is where `wind.speed` is restored from config (`:323`). That is the established home for resetting a user-set value on Clear All, and wind is the closest analogue the model has to a speed preference.

**Hazbot is unaffected by default.** `translate.ts`'s switch ends in `default: return { kind: "no-op" }`, so a new log event such as `SpeedChanged` is inert for category matching unless someone deliberately handles it. There is no `APP_RULES_VERSION` implication.

**The verified slot styling, verbatim.** Built as a real MUI `Slider` in the running bar on
2026-08-29 and measured against the board layer by layer, so this is transcribed from something that
rendered correctly rather than derived on paper. Every piece below matched the board exactly: rail
`x 21, y 36, 55 x 1`; ticks centered at `21 / 48.5 / 76`, which is the rail's start, middle and end;
thumb `x 36.5, y 24.5, 24 x 24`; labels at `y 49, h 17`. Colors are written as literals here because
that is what was measured; the implementation should use the existing tokens, since `#797979` is
`$controlGray`, `#434343` is `$controlText` and `#dfdfdf` is `$hoverColor` (`common.scss:29-38`).

```scss
.speedControl {
  width: 97px;
  box-sizing: border-box;
  display: flex;
  justify-content: center;

  .content {
    width: 97px;
    box-sizing: border-box;
    padding-top: 4px;
    text-align: center;
  }

  .header {
    font-family: Lato, sans-serif;
    font-weight: 700;
    font-size: 14px;
    line-height: 17px;
    color: #434343;
  }

  // Nested one level deeper than the emotion class, so these outrank MUI's own
  // slot styles. Flat (0,1,0) rules lose the tie and MUI's width/height/color win.
  .slider {
    width: 55px;
    height: 1px;
    padding: 0;
    display: block;
    margin: 15px auto 0;

    .rail { height: 1px; opacity: 1; background-color: #797979; }

    // vertical-selectors.scss's mark rule verbatim. The board's Tick is a
    // #d8d8d8 fill inside a 1px #797979 border, so both are load-bearing.
    .mark {
      width: 4px;
      height: 4px;
      border-radius: 4px;
      border: solid 1px #797979;
      background-color: #d8d8d8;
      opacity: 1;
      // MUI hardcodes translate(-1px, -50%), half of its own 2px default mark.
      // Ours renders 6px wide (4 + 1px border a side), so it needs -3px.
      transform: translate(-3px, -50%);

      // 24px transparent hit target, matching the thumb. The drawn tick is 6px
      // and the slider root is 1px tall, so without this a click a few pixels
      // off the rail lands on nothing. The mark is the child that hit-tests
      // reliably here; enlarging the root's own box does not work.
      &:after {
        content: "";
        position: absolute;
        left: -10px;
        top: -10px;
        width: 24px;
        height: 24px;
      }
    }

    .thumb {
      width: 24px;
      height: 24px;
      background-image: url("../assets/slider-thumb-small.svg");
      background-size: 140%;
      background-position: center;
      background-repeat: no-repeat;
      background-color: transparent;
      box-shadow: none;
      cursor: grab;

      // MUI paints its own focus/hover ring on a ::before pseudo-element; ours
      // is a box-shadow on the thumb itself, so that one has to go.
      &:before { box-shadow: none; }
    }

    .markLabel {
      font-family: Lato, sans-serif;
      font-size: 14px;
      font-weight: 400;
      color: #434343;
      top: 13px;
      line-height: 17px;

      &:global(.MuiSlider-markLabelActive) { font-weight: 700; }
    }
  }
}

// Board's four-state column: Hover puts a 32x32 white Highlight behind the 24px
// Outer, which is a 4px ring, at 50% alpha; Select is the same ring at 100%.
.speedControl:hover .slider .thumb {
  box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.5);
}

.speedControl .slider .thumb {
  &:active,
  &:global(.Mui-active),
  &:global(.Mui-focusVisible) {
    box-shadow: 0 0 0 4px rgba(255, 255, 255, 1);
    cursor: grabbing;
  }
}

// Disabled fades the content and leaves the widgetGroup bubble alone, matching
// both the board and the bar's existing button rule. Neither ring shows.
.disabled .content { opacity: 0.35; }
.disabled:hover .slider .thumb { box-shadow: none; }
```

The CSS assumes these `Slider` props, and several rules above depend on them:

```tsx
<Slider
  classes={{ root: css.slider, rail: css.rail, mark: css.mark, thumb: css.thumb, markLabel: css.markLabel }}
  min={0}
  max={2}
  step={null}
  track={false}
  marks={MARKS}          // [{ value: 0, label: "0.5x" }, { value: 1, label: "1x" }, { value: 2, label: "2x" }]
  value={idx}
  disabled={disabled}    // the prop from bottom-bar.tsx, which computes `speedEnabled` once
  onChange={(e, v) => setSpeedIndex(v as number)}
/>
```

Two things outside the stylesheet complete the picture. The widget group takes the bar's existing
`hoverable` class, which is what turns the bubble `#dfdfdf` on hover per the board's four-state
column; there is no new color, since `:global(.hoverable):hover { background: $hoverColor }` already
exists at `bottom-bar.scss:89-91`. Measured on the real control: hovering anywhere in the group,
including over the "Speed" header, gives the bubble `rgb(223, 223, 223)`; hovering Start's group
leaves it `rgb(255, 255, 255)`, since nothing else in the bar carries `hoverable`; and with the class
dropped the disabled control keeps a white bubble on hover, which is the board's disabled row. And
MUI's own `disabled` prop is required alongside the 0.35 fade, because it is what sets
`pointer-events: none`; opacity alone leaves a faded control fully draggable.

**Three view-side claims re-confirmed on a probe wired to the real store**, rather than to local
component state, so the whole chain from a click to the model and back to the bolded label was
exercised. **The hit box**: with the `.mark:after` in place the live band down a tick's x is
**contiguous across 33px** with no dead gap (the 24px pseudo-element plus the label below it), and real
mouse clicks at 8px and at 11px above the rail both select the tick, where without it the rail is
1px tall and both land on nothing. **The bolding**: every selection was previously observed at the
default 1x, which cannot distinguish "the middle label is bold" from "the selected label is bold".
Driven to a *changed* selection, exactly one label carries `MuiSlider-markLabelActive` at weight 700
and the other two sit at 400, at both ends of the rail. **The disabled treatment**, measured after a
real Clear All rather than a forced prop: content `opacity: 0.35`, bubble background
`rgb(255, 255, 255)` and border `rgb(121, 121, 121)` at `opacity: 1`, `hoverable` absent, MUI's
`Mui-disabled` present and `pointer-events: none` computed. `speedIndex` went 2 to 1 in the same step,
which is the Clear All reset.

**Four board-reading traps, all of which caught this spec at least once.** Recorded because they are
the same mistake in four costumes, not four separate errors. A layer's `fills` and its `borders` are
siblings, and reading only the fill turned the ticks from a `#d8d8d8` core inside a 1px `#797979`
ring into solid blocks. A group's `rotation` does not appear on its leaves, so the thumb's chevrons
read as "above and below" from layers still named `Up` and `Down` when the parent's `rotation: -90`
makes them point left and right. One layer's opacity is not the group's: the "Speed" header at 0.35
was taken to mean the whole group fades, when `Speed Control Back` stays at 1. And Zeplin reports
`borderRadius: 0` on shapes drawn as ovals, so that field cannot be used to tell a square from a
circle. **Check `fills`, `borders`, `rotation` and per-layer `opacity` together, and confirm shape
against a rendering.**

**There is a close precedent for the whole control.** `wind-circular-control.tsx:93-108` already renders an MUI `Slider` with `marks`, `track={false}`, and custom `rail` / `mark` / `thumb` / `markLabel` classes, and `wind-circular-control.scss:88-96` already styles `.MuiSlider-markLabelActive` to change the active label's weight. That is precisely the bold-the-selected-label mechanism this story needs, already wired and already in the trackless mode the mechanism depends on, though at weight 500 there against the board's 700 here. **The thumb asset is `slider-thumb-small.svg`, and the repo already splits the two variants by slider orientation.** `slider-thumb-small.svg` bakes a `rotate(90)` into its `<g transform>`, so its chevrons point left and right; `slider-thumb.svg` has no transform and its chevrons point up and down. The horizontal sliders take the rotated one and the vertical ones take the unrotated one: the wind meter uses `-small` at `width/height: 22px; background-size: 140%` (`wind-circular-control.scss:109-116`), while the setup panel's vertical vegetation and drought selectors use the unrotated `slider-thumb.svg` at 24px / 133.33% (`vertical-selectors.scss:120-127`). Speed is horizontal, so it takes `-small`, at **24px / 140%**, which is the board's 24px `Outer`. The wind meter uses the same asset and the same 140% at 22px; only the box differs. The 140% is not a magic number, it is what makes the asset's `Outer` circle exactly fill the thumb box (`Outer` is 20 of the 28px viewBox, and 20/28 = 71.4%, so 140% of the box renders it at 100%), which is why it carries across both sizes unchanged. An interim 22px was tried and rejected on sight as visibly small against the board. Note the existing sliders all use `step={1}`; snapping to three ticks wants `step={null}`, which is the different mode described above.

**A same-tick `restart()` then `start()` leaves the previous run's rAF loop alive, and the model ticks twice per frame.** `restart()` sets `simulationRunning = false`, but the pending `requestAnimationFrame(this.rafCallback)` from the previous run is still queued. If `start()` runs before that callback fires, the callback sees `simulationRunning` true again, reschedules itself, and the run now has two loops calling `tick()`. Measured by counting `tick()` calls per frame across three successive same-tick restarts: **1, then 2, then 3**. With a few frames between `restart()` and `start()` the stale callback returns early and the count stays at 1.

This is not reachable through the UI, because Restart and Start are separate clicks with at least one frame between them, so it is not a defect this story fixes. It matters here for one reason: **it is what produced the 2.32x and 1.14x that an earlier draft of this spec recorded as an unexplained wall-clock measurement.** That harness restarted and restarted the model in a single tick per sample, so each successive speed was measured under one more loop than the last, and a *1x* run in the same series read 359.5 model-minutes per real-second, almost exactly twice the true rate. The numbers were an artifact of the measurement, not of the multiplier. Any Cypress or Playwright acceptance test that drives restart then start programmatically will silently double the model's pace, so such a test must leave a frame gap, or `stop()` and wait, before starting the next run.

**End-to-end verification, executed rather than computed.** A throwaway multiplier was wired into `SimulationModel` and into a probe slider in the live bar, and the model's pace was measured per animation frame with the first tick discarded and a frame gap between runs, at 60 FPS on a warm page:

| Speed | Model-min per real-sec, run 1 | run 2 | Ratio vs 1x |
|---|---|---|---|
| 0.5x | 90.0 | 90.1 | **0.5006** |
| 1x | 179.9 | 179.9 | 1 |
| 2x | 360.0 | 360.0 | **2.0011** |

That reproduces the predicted 90 / 180 / 360 exactly. A real click on the 2x tick during a run took the rate from 180.4 to 362.6 (2.01x) and moved model time by **0** at the moment of the click, which is the mid-run continuity requirement, measured. In Jest against the same throwaway multiplier: the computed timestep is proportional to 10 decimal places at a 16.7ms frame and **still proportional at a 100ms frame**, where `optimalTimeStep * 4` is the binding term (5.98 / 11.97 / 23.93), which is the clamp-scales-with-the-multiplier claim executed rather than argued; `restart()` preserves the selected speed and `reload()` returns it to 1x.

**Both boundary guarantees were written as throwaway tests and pass**, and the tighter one is demonstrably able to fail. The day boundary: a real `FireEngine` driven at `getDefaultConfig().maxTimeStep` over 30 model days gives a maximum `engine.day` jump per tick of **1**. The hour boundary: `sim.tick()` at the fastest shipped ceiling (23.93 minutes) gives a maximum `timeInHours` jump of **1**, and the same test at a hypothetical 6x entry, where the ceiling is 71.80 minutes, gives **2**. So the hour test is not true by construction: it fails on exactly the retune it exists to catch. Both are transcribed in full in the implementation spec's first step.

**Suite baseline on this branch.** `npx jest` reports 1022 passed of 1022, across 82 suites, measured on the head commit after the rebase onto `origin/master`. That baseline predates the verification above; re-measure before quoting it in a PR body.

## Out of Scope

- **The other three bottom-bar stories** (WM-52's scale removal, WM-47's Clear All, WM-48's Vegetation Key), even though the board draws all of them in this row.
- **Changing the fire model.** The multiplier changes the clock, not the physics.
- **Making the multipliers per-activity authorable.** `modelDayInSeconds` already is; the multiplier sits on top of whatever an activity authored.
- **A continuous speed slider.** Explicitly ruled out: *"this does not have to be continuous"*.
- **Overriding MUI's own value logic.** Rejected: `step={null}` already snaps a click anywhere on the rail to the nearest tick, so nothing needs to replace the library's pointer handlers. Note this rules out custom *value* handling only; each tick does get a transparent 24 x 24 `:after` hit box, per the requirement above and the resolved Student finding.
- **Renaming the ticket.** Its "Hazbot:" prefix is inherited from the workshop feedback and is inaccurate, but harmless; see the resolved Product Manager finding.
- **Accessibility review**, per the standing scope for this repo.

## Open Questions

### RESOLVED: Are the multipliers 0.5 / 1 / 2, or Trudi's 0.25 / 1 / 3?
**Context**: The board labels the three ticks 0.5x, 1x and 2x, and Michael's description names those same values. Trudi's note in the same description floats *"maybe fast should be 3x and slow should be .25 ... we can test it!"*. The board is the later artifact and it is what is drawn, but the ticket carries both. The distinction is not cosmetic on the design side, since the labels are drawn text and changing the multipliers changes the artboard. It turned out to be entirely cosmetic on the model side; see the Findings.
**Options considered**:
- A) Build 0.5 / 1 / 2 as drawn, with the values in one constant so retuning is a one-line change plus a label update.
- B) Build 0.25 / 1 / 3 per Trudi's note and ask Michael to relabel.
- C) Ask Trudi and Michael to settle it before building, since the labels are part of the design.

**Findings:** three things sharpen this. The retune really is a one-line change now that the slider carries **indices** rather than multipliers: the multipliers and their labels live in a single indexed array, so option A's promise is concrete rather than aspirational. Whether Michael has to redraw the three text layers depends on how far the retune moves: the label is a separate field from the multiplier, so a tune that stays behind its label costs nothing on the design side at all. **The two ends are symmetric, and neither candidate set carries a model-side cost.** An earlier reading of the three-term `Math.min` had 3x pulling the `maxTimeStep` ceiling in to a 0.33s frame while 0.25x was free; that is wrong. `optimalTimeStep * 4` scales with `ratio` and is the smaller ceiling until about 15x (`180 / 11.9664 = 15.04`), so `maxTimeStep` never binds at 0.25x through 3x, and catch-up starts being capped at the same 66.5ms frame at every speed. The sampling-rate check is symmetric too: the ignition schedule is identical cell for cell at 0.5x, 1x, 2x **and 3x**. So the choice is a design and pedagogy call with no technical thumb on either scale, within the range that matters here: both candidate sets sit well under the about-5x ceiling that the graph's hourly sampling imposes (see the round-2 Education Researcher finding). And the slow end has a use case the current value serves poorly: the Student finding below notes that 0.5x only helps a student who slows down *before* the moment they want to see, which is an argument for 0.25x buying more reaction time. The board drawing 0.5/1/2 in all seven state rows is the strongest evidence for A, but it is evidence about what was drawn, not about what was tested, which is exactly what Trudi's note reserves.

**Decision**: **A**, build 0.5 / 1 / 2 as the board draws them, with the three multipliers in a single
module-level const array so retuning is one line. Doug, 2026-08-28. Not routed to Trudi: her note
reserved the values for testing rather than asking for them to change before one exists to test, and
the array is what makes that test cheap to act on later.

**Re-confirmed 2026-08-29 on a corrected basis.** The original decision was argued partly from a
model-side asymmetry that does not exist: `maxTimeStep` cannot bind below about 15x, catch-up is capped
at the same frame time at every speed, and the ignition schedule is identical at 3x as at 0.5x. With
that removed there is no technical argument for or against either set, so A rests on what it should
rest on: the board is the only artifact anyone has agreed to, Michael drew 0.5/1/2 in all seven state
rows *after* Trudi's note, and that note reads as reserving the values for testing rather than asking
for a different build. What does survive is **the slow end's weakness as a tunable rather than a
decision**: 0.5x still only helps a student who slows down before the moment they want to see, which is
the argument for 0.25x. Retuning is this array, plus Michael relabeling three text layers only if the
new value moves far enough that the drawn label stops being honest.

**What a future retune needs to know**, and what the earlier reasoning got backwards: `maxTimeStep` is
**not** what constrains the fast end. It cannot bind below about 15x. The real fast-end ceiling is lower
and sits somewhere else entirely: the graph samples once per model hour (`graph.tsx:70-77` keyed on
`simulation.timeInHours`), so a tick longer than 60 model minutes drops an hour from `rawBurnData` and
shifts every later index of the `burnRates` array that rides on the run's outcome payload. The effective
per-tick ceiling is `11.97 x multiplier` minutes, so that crossover is **about 5x**. Everything at or below
5x is safe at any frame rate, 0.5/1/2 with margin and Trudi's 3x included; above it, a retune is trading
away the hourly resolution of the logged burn data. Measured in the round-2 Education Researcher finding.

**The labels live in the same array as the multipliers**, one entry per tick, rather than in a parallel
list of strings. A label that has to agree with a value kept somewhere else is exactly the duplication
this repo gets reviewed for, and holding the pair together is the whole point of the const.

**The label is its own field, not a formatting of the multiplier**, and that distinction turns out to
matter more than it looks. `` label: `${multiplier}x` `` would make one array satisfy the
source-of-truth rule while quietly re-coupling the two: the tick's text could then only ever say what
the model is doing. Keeping them separate makes a whole class of retune free. Trudi's note reserves the
values *"we can test it"*, and a test that runs the slow end at 0.4 or the fast end at 2.5 behind the
labels Michael already drew is then one number in one file, with no design change and no relabeling,
which is a materially cheaper experiment than the one the original decision costed. It also means
**nothing asserts that a label agrees with its multiplier**: such a test would forbid the divergence
the array is shaped to allow. What the two log payloads carry instead is both fields, since with them
decoupled neither reconstructs the other.

---

### RESOLVED: Does the speed reset to 1x on Restart or Clear All?
**Context**: The board's state table says Speed *"remains available"* after a run (state 5) and that Clear All *"returns to Default; clears model"* (state 7). "Default" there describes the bar's enable states, not necessarily the selected speed, and nothing says what happens to the chosen speed across a Restart.
**Options considered**:
- A) Speed persists across Restart and resets to 1x on Clear All, matching Clear All's "back to defaults" promise.
- B) Speed persists across both; it is a viewing preference, not model state.
- C) Speed resets to 1x on both.

**Decision**: **A.** Three pieces of evidence, and the code already has the seams for both halves. `restart()` (`simulation.ts:416-443`) resets model state only, with no notion of a view preference, so persistence across Restart is what happens if the multiplier is simply left alone: option C would need code written to defeat it, for no stated benefit. `reload()` then calls `setInputParamsFromConfig()` under the comment *"Reset user-controlled properties too"*, which is exactly where the closest analogue in the model, `wind.speed`, is restored from config; so resetting the speed on Clear All is one line in the place the repo already designates for it, and option B would make the speed the one user-set value that survives a reset the others do not. The board adds a third argument against B that the question could not have known: it draws Speed as **disabled** in state 7, since Clear All removes the sparks. So under B a student who chose 2x would keep it behind a grayed-out control with no way to see or change it until they placed a spark again, which is precisely the "hidden bit of state" the question is worried about, made worse by being unreachable.

---

### RESOLVED: Should a speed change be logged, and does it belong on the run payload?
**Context**: Nothing forces a log event: `translate.ts` defaults to no-op so Hazbot is unaffected either way. But a researcher comparing runs would want to know that one student watched a fire at 2x and another at 0.5x, and more usefully whether the speed changed *during* a run.
**Options considered**:
- A) Log a `SpeedChanged` event with the old and new multipliers.
- B) Add the current multiplier to the `SimulationStarted` payload.
- C) Both, so the run's starting speed is directly readable and changes within it are recoverable.
- D) Neither for now.

**Findings:** option B alone is provably insufficient, which narrows the choice to A, C or D. The control is enabled during a run by design (that is the story's whole point, and the board draws it enabled in state 4), so a mid-run change is an ordinary interaction rather than an edge case, and a start-of-run field cannot represent it. That is the substance of the second Education Researcher finding below: once the multiplier can change mid-run, model time and wall-clock time stop being convertible from the log alone, and a run-start snapshot does not restore the conversion. So the real question is A versus C versus D: whether the run's starting speed should be *directly* readable or reconstructed by replaying `SpeedChanged` events against `SimulationStarted`. Worth noting that D is not costless in the way "defer it" usually is: sessions collected before a field is added cannot be back-filled, which is the first Education Researcher finding's point.

**Decision**: **C**, both. Doug, 2026-08-28. A `SpeedChanged` event carrying the old and new multipliers, and the current multiplier added to the `SimulationStarted` payload.

**Why not A alone**, which is the argument the question did not have. The control is enabled on `ready` (`simulation.ts:78`), satisfied the moment a spark is placed, and Start becomes available at that same moment. So a student setting 2x and *then* pressing Start is an ordinary interaction, not an edge case, and under A alone a run's starting speed can only be found by scanning backwards across the `SimulationStarted` boundary for the last `SpeedChanged` and defaulting to 1x when there is none. Every analyst would have to reimplement that correctly. One field on the run payload removes the class of error, and the per-change event still carries the mid-run breakpoints that keep the conversion recoverable.

**Why this story owes the fix at all.** `modelDayInSeconds` is already on the `SimulationStarted` payload, so wall clock and model time are interconvertible from the log today. This story is what replaces that constant with a step function, so it is the story that breaks the property and the one that should restore it.

**What it costs, measured rather than estimated.** One key on a payload that already carries about 45. The multiplier is model state like `wind.speed` rather than config, so it does not arrive through the generic `Object.entries(config)` snapshot in `bottom-bar.tsx` and needs an explicit line, in the same place `sparks`, `zones`, `wind`, `towns` and `fireLineMarkers` are already appended. One row in `LOGGED-EVENTS.md`. And one line in `translate.ts`: the file ends in `default: return { kind: "no-op" }` so a new event cannot disturb Hazbot, but the convention is to name it explicitly above that default, as `VegetationKeyShown` and `VegetationKeyHidden` are.

**D was the one to argue against**, since it is not "defer and decide later": sessions collected before the field exists cannot be back-filled.

---

### RESOLVED: How is the per-tick click target built, given MUI's rail-wide click behavior?
**Context**: The ticket asks that clicking a tick select it, with *"click area ... the ~same dimensions as the thumb"*, which is about 24 to 32px. MUI's `Slider` handles a click anywhere on the rail by jumping to the nearest allowed value, so with `step={null}` and three marks a click already snaps to the nearest tick. That satisfies "clicking a tick works" but it also means clicking the empty rail between two ticks moves the thumb, which is more permissive than the ticket describes.
**Options considered**:
- A) Use MUI's default snap-to-nearest across the whole rail and treat the ticket's wording as describing the minimum, not a restriction.
- B) Overlay three explicit hit targets sized to the thumb and suppress rail clicks elsewhere.
- C) Confirm with Michael which he meant, since it is one sentence.

**Decision**: **A.** Confirmed in MUI's source rather than from the docs: with a falsy `step`, `getFingerNewValue` resolves every pointer position to `marksValues[findClosest(...)]` (`@mui/base/useSlider/useSlider.js:345-350`), and it is called from the mousedown, pointerdown and move handlers alike (`:458`, `:525`, `:424`). So A is zero code and already does what the ticket asks. The ticket's sentence reads as a floor on the affordance ("do not make me hit a 4px tick"), and A clears that floor by a wide margin, since the nearest tick is selectable from up to half the inter-tick distance away rather than from a 32px window. B is not a small addition either: it means overlaying three targets *and* suppressing MUI's own handlers on the rail between them, which fights the component rather than configuring it, for a restriction nobody asked for. C is not worth Michael's time given that the implemented behavior is strictly more permissive than the request.

---

### RESOLVED: Is the speed control enabled while the model is running, and does it survive a pause?
**Context**: The board's state 4 (during run) lists what becomes disabled (Setup, Spark, Hazbot) and does not mention Speed, which implies it stays enabled. That has to be right, since adjusting the speed of a fire you are watching is the story's whole purpose. But it is inferred from an omission rather than stated, and it interacts with WM-31, which disables Hazbot during a run using the same `simulationRunning` flag.
**Options considered**:
- A) Enabled throughout states 3 to 7, including during a run and while paused. Disabled only in states 1 and 2, before a spark exists.
- B) Confirm with Michael before building, since it is read from an omission.

**Decision**: **A, and it is no longer read from an omission.** The board states it positively in the state-3 note (*"Speed is first enabled when Start becomes enabled, then is always enabled"*), and the layers agree: the "Speed" header's opacity is **0.35 in states 1, 2 and 7** and **1 in states 3, 4, 5 and 6**. State 4 is the during-run row, so the control is drawn enabled while the model runs; state 7 is Clear All, which clears the sparks. That measured table also corrects the requirement in a way option A as written got slightly wrong: the predicate is **`ready`**, not "the same condition that enables Start". `startEnabled` is `ready && !simulationEnded` (`simulation.ts:158`), which is false after a run, yet the board draws Speed enabled in state 5 and its own note says Speed *"remains available"* there. `ready === dataReady && sparks.length > 0` (`:78`) reproduces all seven rows exactly. There is no conflict with WM-31: that story gates Hazbot on `simulationRunning`, a different flag, and the two readings of state 4 agree rather than compete (Hazbot 0.35, Speed 1).

---

### RESOLVED: Where does this story sit in the four-story bottom-bar sequence?
**Context**: The board's 667px row exists only once WM-52, WM-47, WM-48 and this story have all landed, and WM-47 carries the spacing change that the whole row depends on. Adding a 99px group to today's bar, which still contains the 142px Fire Intensity Scale, produces a row about 40px wider than either the current design or the board. The four stories are all Doug's, so this is a sequencing choice rather than a blocker.
**Options considered**:
- A) Land WM-52 first so the scale is gone before this widens the row, and let whichever story lands last set the spacing and re-measure against the board.
- B) Build in any order and accept intermediate states, since none of them ship independently.

**Findings:** the risk this question implicitly worries about has been measured away, on WM-47's branch. Injecting and growing a spacer widget group in the live bar at a 950px viewport shows no overflow at widget spans of 637, 669, 677 or **701px**, because `.leftContainer` and `.rightContainer` are `flex: 1 1 0%` and absorb the growth. Both the ~691px peak intermediate and the board's finished 667px row therefore fit comfortably, so no ordering produces a broken bar and B is safe on those grounds. This is the same question as WM-47's own first open question and its Product Manager finding; all three want one answer, and the deliverable in each is naming the story that owns "the bar matches the board" and re-derives the gap chain from the board's table in one pass.

**Decision**: settled by events rather than chosen: **this story lands last, and therefore owns the
final row.** Recorded 2026-08-28. WM-52 merged 8/26, WM-47 merged 8/26, and WM-48 merged 8/27, so the
only intermediate state left is the one this story creates and closes in the same PR. That makes this
the story that re-derives the gap chain from the board's table in one pass, which is the deliverable
all three copies of this question were asking for.

**Two numbers moved while this sat open.** The finished row is **671px, not the board's 667**, because
Michael's 8/26 answer keeps the coincident 1px seam rather than the board's 2px, which costs 4px back
across four seams. And the 701px non-overflow measurement quoted below was taken **without a rule-set
loaded**, so it understates the row: with one loaded the Hazbot button sets the right container's floor
to 194. WM-48 left an executable guard on that in `bottom-bar-visuals.cy.ts`, and the measured ladder
is in `sprint-24-mechanisms.md`.

**The row has two intrinsic minima, not one, because the logo swaps at 960px.**
`bottom-bar.scss:332-340` hides `.logo` at or below 960 and `.logoSmall` above it, so the left
container's floor is **140** with the large logo and **53.3** with the small one. Measured by
bisecting the viewport with `hazbotRules=25` loaded and a 99px Speed group in the row: the bar fits
at 1008 and above (674 + 140 + 194), **overflows from 961 to 1007** where the large logo is still
drawn but no longer fits, fits again from 922 to 960 (674 + 53.3 + 194 = 921.3), and overflows at
921 and below. Without Speed the same sweep is monotonic: it fits down to 823 and overflows at 815,
which is the 824 the Cypress comment already states. So the comment's 824 and its left floor of 54
are both correct today; an earlier draft of this spec replaced them with 1008 and 140, which are the
large-logo figures applied to a viewport where the small logo is what renders.

**What this story changes is the minimum, from 824 to 922, plus a new overflow band at 961-1007.**
In that band the right container runs to 1008 against the viewport and the fullscreen toggle is
pushed off the right edge; confirmed by screenshot at 980 with and without the Speed group. The band
is left as-is here: the bar already overflows below 824 today, so this is the same known
narrow-viewport behavior at a higher threshold rather than a new failure mode, and closing it means
moving the logo breakpoint, which is a design question for its own ticket. Against the 1241 x 529
target device the finished row clears by 233px either way.

## Self-Review

### Senior Engineer

#### RESOLVED: `bottom-bar.scss` already contains a dead slider block that this story turns into a trap
`bottom-bar.scss:343-369` holds a 27-line `.slider` block with a nested `.thumb`, a `.disabled` and a bare `span` rule. Nothing consumes it. `bottom-bar.scss` is imported only by `bottom-bar.tsx`; that file uses no dynamic `css[...]` access, and its full set of 21 referenced names contains no `slider`, `thumb` or `disabled`. Under CSS modules there is no other route to it. It arrived with the moisture-content slider in `ba69353` and was orphaned by `d0b26c0`, *"Remove precipitation slider from bottom bar, adjust styling"*, on 2019-11-04.

It is inert today, but this story is what makes it dangerous: it is a slider block, in the file the Speed slider is being added to, and it disagrees with this story on the two things it describes. Its disabled state is `opacity: 0.25` against the board's 0.35, and its thumb is 20px centered by `margin-left: -8.5px` against our 24px centered by MUI's own transform. Speed is the first slider to reach this file since 2019, so the next engineer opening it finds `.slider`, `.thumb` and `.disabled` already present and has every reason to extend them.

**Decision**: delete it as part of this story. Doug, 2026-08-29. It is provably unreachable, so there is no behavioral risk, and it sits in a file this story already edits. A spec warning was considered and rejected: it would protect whoever reads the spec while the trap stays in the file, and it would leave two conflicting slider vocabularies in `bottom-bar.scss` permanently.

---

#### RESOLVED: "One multiplier" understates where the multiplier has to live
`modelDayInSeconds` is config, which is per-activity and not observable. The speed multiplier is user state that must be observable so the bar re-renders and the rAF loop picks it up. So the change is not "multiply the config value" but "add an observable to `SimulationModel` and fold it into the ratio at the single read site", plus deciding whether it survives `restart()` and `reload()`, both of which reset a long list of fields and neither of which currently has a notion of view preferences. That list is where the bug will be.

**Decision**: accepted, and the reset half is now decided rather than left as "deciding whether". The shape is exactly as the finding describes: an observable on `SimulationModel`, folded into `ratio` at the single read site `simulation.ts:479`. On the reset lists, the finding's worry turns out to be the easy direction. `restart()` (`:416-443`) resets model state only, so leaving the multiplier untouched gives persistence across Restart for free, which is what the resolved question above chose. `reload()` (`:445-451`) already has a designated seam for this: it calls `setInputParamsFromConfig()` under the comment *"Reset user-controlled properties too"*, the same call that restores `wind.speed` from config. So the multiplier's reset is one line in a place that already exists and already means what it needs to mean, rather than a new concept threaded through two long field lists.

---

#### RESOLVED: The three multipliers and the three labels are the same fact stored twice
The labels are drawn text ("0.5x", "1x", "2x") and the multipliers are numbers, and the ticket says explicitly that the numbers are tunable. If they live in separate places, the first retune produces a control whose label disagrees with its behavior, and nothing would fail. Derive the labels from the multiplier list, or assert their agreement in a test.

**Decision**: accepted, and the deep dive turned up the shape that makes it natural instead of merely disciplined. The obvious implementation, `marks = [{value: 0.5, label: "0.5x"}, ...]`, is wrong for a different reason: MUI positions marks by `valueToPercent(mark.value, min, max)` (`Slider.js:595`), so multiplier-valued marks would put 1x at 33.3% of the rail against the board's 50.9%. The slider therefore has to carry **indices**, which means an indexed array is required anyway. One array of `{ multiplier, label }` entries, with the slider's value being the index into it, makes the label derivable from the multiplier and removes the duplication the finding names as a side effect of getting the geometry right. Both are now requirements.

---

#### RESOLVED: `step={null}` is a different MUI mode from every other slider in this repo
All three existing sliders use `step={1}` with marks used purely as labels. Snapping to three arbitrary positions needs `step={null}`, which changes how MUI resolves values, how it handles keyboard input, and what `onChange` reports. Reusing the wind slider's classes without noticing the mode difference is the likely first attempt, and it would produce a slider that appears to work while allowing intermediate values.

**Decision**: accepted, confirmed in the library source, and now carrying line references so the difference is checkable rather than remembered. The value path branches at `@mui/base/useSlider/useSlider.js:345-350`: a truthy `step` calls `roundValueToStep`, a falsy one calls `marksValues[findClosest(...)]`. Keyboard handling branches separately at `:277-283`, where `marks && step == null` moves to the adjacent mark **index** rather than by step. Two further findings came out of chasing this, and both are now requirements in their own right, because they are the specific ways the "reuse the wind slider's setup" attempt would go wrong: the marks must carry indices rather than multipliers or the ticks are unevenly spaced, and `track={false}` must be kept or the selected-label bolding silently becomes "bold everything up to the selection" (`Slider.js:597-602`).

---

### QA Engineer

#### RESOLVED: The obvious acceptance test measures the wrong thing
"2x runs twice as fast" invites a wall-clock test, and the deep dive shows that is unreliable: a first attempt produced 2.32x and 1.14x against an arithmetic expectation of exactly 2 and 0.5. The testable invariant is the computed timestep, which is deterministic given a frame interval: at 60 FPS the binding term is `ratio x realTimeDiff` and the three speeds give 1.50, 3.01 and 6.01 minutes per frame. A unit test over that formula catches a broken multiplier; a wall-clock test catches nothing reliably and will flake in CI.

**Decision**: accepted verbatim and promoted to a requirement. The finding is a first-hand account of the trap rather than a prediction: the unreliable measurement was actually taken during this spec's own investigation and its numbers are recorded in the Technical Notes so the next person does not repeat it. The invariant to pin is `Math.min(maxTimeStep, optimalTimeStep * 4, ratio * realTimeDiff)` evaluated at a fixed frame interval, which is pure arithmetic over `modelDayInSeconds` and the multiplier and needs no browser at all.

---

#### RESOLVED: Nothing pins the day-boundary guarantee that makes the speed change safe
The reason a faster model does not change fire outcomes is that `maxTimeStep` (180) is smaller than `modelDay` (1440), so a tick can never skip a day's stochastic roll. That relationship is currently a coincidence of two unrelated constants in two files, it is not commented anywhere, and this story is what makes it load-bearing. A future "let's allow 5x, bump maxTimeStep" would silently change model behavior. Assert the relationship.

**Decision**: accepted, and asserted **behaviorally rather than as a comparison of two constants**. Doug, 2026-08-29.

The finding's own phrasing, "assert the relationship", turns out not to be directly buildable: `const modelDay = 1440` at `engine/fire-engine.ts:7` is module-private, and `fire-engine.ts` exports only `nonburnableCellBetween`, `getGridCellNeighbors`, `IFireEngineConfig` and `FireEngine`. A test can reach `maxTimeStep` through the exported `getDefaultConfig()`, but reaching 1440 means either widening that module's surface for a test's benefit or retyping the number, and a repeated constant is the thing this repo flags hardest.

So the requirement is instead: build a `FireEngine`, advance it in fixed increments of `getDefaultConfig().maxTimeStep`, and assert `engine.day` (already public at `engine/fire-engine.ts:102`) never advances by more than one per tick. That contains **no duplicated constant**: the ceiling comes from config and 1440 never appears.

**The mutation it catches, verified rather than asserted.** Feeding the harness a range of ceilings: 180 (the shipped value) gives a largest jump of 1, 1439 gives 1, and 1500 and 2900 both give 2. Since the shipped test feeds it `getDefaultConfig().maxTimeStep`, raising that past a model day fails the test with no further edit, which is exactly the "let's allow 5x, bump `maxTimeStep`" change the finding was written against. The probes themselves are recorded here rather than shipped, because a test asserting that a 1500-minute tick misbehaves is asserting a configuration nobody ships.

**Why behavioral is the stronger form here.** The constant comparison would keep passing against a stale numeric relationship if someone later reworked how `updateFire` derives the day or added a second per-day hook. The behavioral form keeps testing the property that actually matters, which is that no day's stochastic roll is ever skipped. Note also that the relationship holds with room to spare rather than exactly: 180 into 1440 leaves a factor of 8 in hand, and the effective per-tick ceiling is smaller still, at 5.98 / 11.97 / 23.93 minutes for the three speeds.

---

#### RESOLVED: No criterion covers what the control looks like mid-drag
The requirements cover the three resting states and the disabled state. The board draws the thumb only at rest on a tick. Dragging is explicitly a supported interaction, so there is an unspecified intermediate: does the thumb follow the pointer continuously and snap on release, or jump tick to tick during the drag? Those look quite different and MUI can do either.

**Decision**: it is not a choice; the library settles it. Under `step={null}` the move handler runs the same snap as a click: `getFingerNewValue` (`useSlider.js:321`) resolves the pointer position to `marksValues[findClosest(...)]` (`:345-350`) and is called from the move path at `:424`. So the thumb **jumps tick to tick during the drag** and there is no continuous-follow-then-snap mode available without reimplementing the pointer handling. That is also the behavior the board is consistent with, since it draws the thumb only at rest positions. Recorded here rather than as a requirement, because it is a property of the chosen component rather than something the implementation decides, and stating it as a requirement would invite someone to build it.

---

### Product Manager

#### RESOLVED: "35% opacity across the whole widget group" contradicts both the board and the bar
The requirement said the disabled treatment was 35% opacity on the whole group, "matching the treatment used elsewhere in the bar". Neither half held. Read layer by layer, the board's three disabled rows keep `Speed Control Back` at opacity 1 and put 0.35 on every content layer, exactly as `Start Control Back` stays at 1 while `Start` and `Start ICON` drop to 0.35. The bar's only disabled rule does the same thing in CSS. Fading the group instead lightens the bubble's 1px border where it abuts Start.

**Decision**: content-only, via a single wrapper element carrying the opacity, mirroring the button rule's `> span`. Doug, 2026-08-29, after building it. Measured on the real control: bubble `rgb(255,255,255)` at opacity 1 with its border `rgb(121,121,121)` identical to Start's, content at 0.35, `pointer-events: none`, no thumb ring. Rendering the rejected version put the same border at `rgb(187,187,187)`.

Three things came out of building it rather than specifying it. MUI's `disabled` prop is needed alongside the fade, because opacity does not stop pointer input. `grayscale(1)` is dropped as a no-op on an achromatic control. And the `hoverable` class has to come off while disabled, which the built version handled by giving the Speed component its own widget group. That turned out not to be necessary; see the round-2 Senior Engineer finding, which moves the group back to `bottom-bar.tsx` alongside every other widget's.

---


#### RESOLVED: The multipliers being "tunable" needs an owner and a moment
Trudi's *"we can test it"* is a plan to retune after seeing it, which is sensible, but nothing schedules it and nothing says who decides. If the values are still 0.5/1/2 at the end of the sprint because nobody revisited them, that is a decision made by default. Worth naming the retune as a follow-up rather than leaving it inside this story's description.

**Findings:** the retune is now cheap enough that scheduling it is the only real cost. Because the slider carries indices and the multipliers live in one indexed array, changing a value is a one-line edit with no layout or model consequence. Because the label is a separate field rather than a formatting of the multiplier, a retune within a label needs no design work at all, and only one that moves far enough to make the drawn text dishonest needs Michael to redraw three text layers. So the follow-up is "run it with students, then edit one array, and relabel only if the numbers moved that far", which is a small enough unit to be a ticket rather than a project. Two inputs that the owner will want and that are now recorded. **Neither end is constrained anywhere near the values in play**: an earlier reading had 3x pulling the `maxTimeStep` ceiling in, but that clamp cannot bind below about 15x, catch-up is capped at the same frame time at every speed, and the ignition schedule is identical at 3x. The binding fast-end ceiling is the graph's per-model-hour sampling at **about 5x**, which leaves 0.25x through 3x free to move on pedagogical grounds alone and marks where that stops being true. And the Student finding below argues that the slow end is the one currently serving its use case least well.

**Closed 2026-08-28 by the multiplier decision**: ship 0.5 / 1 / 2 as drawn, in one const array. The owner of the retune is Trudi, since it is her note and it is a question about what students experience rather than what the code can do; the moment is after the first classroom run. Recorded here rather than scheduled, because a ticket for a retune nobody has evidence for yet would be a placeholder. What this story owes it is the array, which it now has.

---

#### RESOLVED: The story is titled "Hazbot:" but has nothing to do with Hazbot
The prefix comes from the workshop feedback, where the motivation was getting Hazbot's feedback sooner. The control itself touches no Hazbot code, and the deep dive confirms the Hazbot engine is unaffected by default. Harmless, but it will send the next reader looking for a Hazbot dependency that does not exist.

**Decision**: confirmed and recorded; no action. The ticket's summary is literally *"Hazbot: Add a speed control to speed up or slow down model"*, and the description's first line explains the prefix: the workshop complaint was that *"it take a long time for the fire to burn and users want Hazbot feedback sooner"*. So the prefix is accurate about the motivation and misleading about the surface, which is the finding's point exactly. Renaming the ticket is recorded in Out of Scope rather than done, because the title is how the story is referred to in the sprint board and in the timesheet, and the confusion it invites is fully defused by this spec saying so.

---

### Student

#### RESOLVED: A speed change mid-run has no visible confirmation beyond the fire's pace
The only feedback that the control did anything is that the fire starts moving faster or slower, which for a slow-spreading fire may not be perceptible for several seconds. The bolded label confirms the selection, which helps, but a student who clicks 2x on a fire that has not reached anything flammable yet gets no signal at all. Not necessarily a defect, but worth knowing it is the entire feedback loop.

**Decision**: confirmed, and the immediate feedback is slightly stronger than the finding credits, which is enough to close it without a change. Two things happen on the same frame as the click, both drawn on the board: the thumb moves to the clicked tick, and the label bolding moves with it, since MUI's `markActive` under `track={false}` is exactly "is this the selected value" (`Slider.js:598-599`). So the student gets an immediate two-part confirmation that the control registered the input, which is what a control owes them; what is genuinely delayed is confirmation that the *model* changed pace, and that is inherent to the thing being controlled rather than a gap in the design. Nothing here suggests an addition that would not be inventing UI the board does not draw.

---

#### RESOLVED: 0.5x makes an already-slow experience slower, which is half of what was asked for
The workshop complaint had two halves: fires that take too long, and fires that finish before the phenomenon is observed. 2x addresses the first directly. 0.5x addresses the second only if the student anticipates the moment and slows down beforehand, which requires already knowing what is about to happen. The control as designed cannot rewind or replay. That is fine for a first pass, but it means the intensity-task complaint that motivated the story is only partly answered.

**Findings:** the ticket's own wording confirms the asymmetry the finding identifies, and this turns out to be an argument in the first open question rather than a separate concern. The description names the two halves explicitly: *"Sometimes it take a long time for the fire to burn and users want Hazbot feedback sooner"* and *"Other times, the fire burns too quickly and users miss the phenomenon that they would like to see (this happened with the intensity tasks)"*. A slow-down only helps the second if it is applied before the moment of interest, so the useful quantity is how much reaction time it buys, and that is what the multiplier's value decides. At 0.5x a student who reacts one second late has lost half the phenomenon; at Trudi's 0.25x they have lost a quarter. So this is a concrete reason to prefer the slower slow end, and it belongs in the multiplier decision rather than as a separate scope question. What it cannot argue for is a replay, which is a different feature entirely.

**Closed 2026-08-28**: the multiplier decision went to 0.5 / 1 / 2 as the board draws them, so this finding's preferred answer was not taken. It is not overruled so much as deferred to evidence: the asymmetry it identifies is real, and the const array is what makes acting on it a one-line change once a classroom run shows whether 0.5x buys enough reaction time. Logged as the specific thing to watch for in that run.

---

### Education Researcher

#### RESOLVED: Runs at different speeds become incomparable in the log unless the speed is recorded
Session duration, time-to-first-Hazbot-click, and how long a student watched before intervening all shift meaningfully when the clock runs at half or double rate. If the speed is not logged, those measures silently mix populations and there is no way to separate them after the fact. This is the substance of the logging open question and it argues for deciding it before the code, since retrofitting a field does not recover data from sessions already collected.

**Findings:** the "decide before the code" argument holds and is now sharper about which measures are affected. The multiplier scales model time against wall clock, so any measure defined in wall-clock terms over a period in which the model was running is affected: session duration, time-to-first-Hazbot-click, and time-watched-before-intervening are all in that class. Measures defined in model time are not, because the fire's schedule is fixed by the physics and is unaffected by the sampling rate (the ignition-schedule note in Technical Notes). So the exposure is specifically the wall-clock-denominated measures, which is most of the engagement ones. Also worth carrying into that decision: the speed is enabled during a run by design, so the mixing can happen *within* a single session and not only between them.

**Closed 2026-08-28 by logging decision C**: `SpeedChanged` carries every change and the run payload carries the starting multiplier, so wall-clock-denominated measures can be segmented by speed both between sessions and within one.

---

#### RESOLVED: Model time and real time diverge, and only one of them is recorded
Log events carry wall-clock timestamps while the fire's behavior is a function of model time. Today the two are related by a fixed authored constant, so either can be converted to the other. Once a student can change the multiplier mid-run, that conversion stops being possible from the log alone. Recording the multiplier at run start is not sufficient for a run in which it changed.

**Findings:** confirmed, and it is decisive about one of the logging question's options rather than merely relevant to it. The conversion today is exactly `ratio = 86400 / config.modelDayInSeconds` at `simulation.ts:479`, a single authored constant, which is what makes wall clock and model time interconvertible from the log. A multiplier that can change mid-run replaces that constant with a step function whose breakpoints are the changes themselves, so the conversion is recoverable only if those breakpoints are logged. That eliminates **option B on its own**: a multiplier recorded on the `SimulationStarted` payload describes the run's first segment and silently mislabels the rest. Any answer that preserves interconvertibility has to include the per-change event, which is option A or C. Note this is not hypothetical for this story: the control is deliberately enabled during a run, so mid-run changes are the intended interaction.

**Closed 2026-08-28 by logging decision C**, which is the option this finding argued for: the per-change event supplies the step function's breakpoints and the run payload supplies its starting value, so the wall-clock to model-time conversion stays recoverable from the log alone.

---

## Self-Review, round 2 (2026-08-29)

Every item below was verified before it was written: against the code, against the Zeplin
board's own layers and notes, against the running app through Playwright, or against a
throwaway harness. The evidence is quoted inline so each can be re-checked.

### Product Manager

#### RESOLVED: Logging decision C never reached the Requirements section
The logging question resolved to **C** (a `SpeedChanged` event carrying old and new multipliers, plus the current multiplier on the `SimulationStarted` payload), and two Education Researcher findings are marked "Closed 2026-08-28 by logging decision C". But `grep -n "SpeedChanged" requirements.md` returns hits only in Technical Notes, in the open question, and in those two closure notes. **The Requirements section contains no logging requirement at all**: the only line in it matching /log/ is the Restart/Clear All persistence bullet, which matches on "analogous". So an implementer working from Requirements builds no logging, and the two research findings the decision closed quietly reopen.

Everything else this spec decided was promoted to a requirement (the indexed multiplier array, the content-only 0.35 fade, the `.slider` deletion, both tests), which is what makes this one look like an omission rather than a choice. **Decision**: accepted and applied, 2026-08-29. Decision C is now two requirements, one for `SpeedChanged` and one for the `SimulationStarted` key, plus the acceptance criterion the next finding describes. No new judgment was involved: the decision was already made and argued, and this only moves it into the section an implementer builds from.

---

### QA Engineer

#### RESOLVED: The decided logging has no acceptance criterion, and the repo has the seam for one
Requirements 47 and 48 are the spec's only two test requirements, and both are model-side. Nothing covers decision C, even though the repo tests exactly this for the closest precedent: `src/components/vegetation-key-switch.test.tsx:60` asserts `expect(mockLog).toHaveBeenLastCalledWith("VegetationKeyShown")`, and `src/components/log-events.test.tsx:243-281` has a `SimulationStarted` describe block that asserts payload keys one by one with `toHaveProperty`.

That block is also why adding a key cannot break anything by accident: it asserts presence, never shape, so a missing `speedMultiplier` would pass silently forever. **Decision**: accepted and applied, 2026-08-29, as a requirement. Both assertions live in `log-events.test.tsx`, which already owns the `SimulationStarted` payload block. The presence-not-shape point is what makes the assertion load-bearing rather than decorative: deleting the new payload line would otherwise leave the suite green.

---

#### RESOLVED: This change breaks two Cypress specs, and nothing in the spec says so
`cypress/e2e/bottom-bar-visuals.cy.ts` locks the exact geometry this story changes. Measured in the running app with the probe mounted (`.mainContainer` and its nine children, `getBoundingClientRect`):

| Assertion | File | Asserted | With Speed |
|---|---|---|---|
| `.mainContainer` width | `bottom-bar-visuals.cy.ts:58` | 576 | **674** |
| `"Start -> Fireline"` gap | `:91` | 3 | **-1** (that adjacency is now Start to Speed) |

The row's visible span is 671 as the spec says; 674 is the same row plus the trailing 4px widget margin and the leading -1px, which is what `.mainContainer` measures. Both numbers were read off the live bar, not computed.

Three more items in the same file go stale rather than red: the test name *"shrink-wraps the controls cluster to its **eight** widget groups"* (nine now), the file header's *"-1 px at the **three** abutting bubble seams"* (four now: Spark-Restart, Restart-Start, **Start-Speed**, Fireline-Helitack), and the per-widget width table at `:43-51`, which has a row for every widget group in the bar except the one this story adds.

Separately, `cypress/e2e/bottom-bar-state-machine.cy.ts:66-77` has an `expectButtonStates` helper enumerating all eight bar controls across eight states. Speed is the first bar control with an enable rule that would not appear in it.

**Decision**: accepted and applied, 2026-08-29, as a requirement. There is no alternative worth recording: the two assertions go red the moment the widget lands, so the only question was whether the spec names the work or leaves it to be discovered when the suite fails. The stale prose and the missing Speed rows are included in the same requirement because they are the half that fails silently.

---

### Student

#### RESOLVED: The tick's own click target is 6px, and the fix is not the obvious one
The resolved click-target question chose MUI's snap-to-nearest and argued it "clears that floor by a wide margin, since the nearest tick is selectable from up to half the inter-tick distance away rather than from a 32px window". That is true horizontally along the rail and says nothing about the vertical, which the transcribed stylesheet sets to almost nothing: `height: 1px; padding: 0` collapses the slider root, the element carrying MUI's pointer handlers, to **55 x 1 px**. MUI's default root is `padding: 13px 0` for exactly this reason.

Measured on the probe with `document.elementsFromPoint` down a tick's x, and confirmed with real mouse clicks (each reset to 1x first, with the thumb parked at 1x so it cannot be the thing being hit):

| Region at a tick's x | Live? | Size |
|---|---|---|
| The tick's mark | yes | **6 x 6 px**, centered on the rail |
| 4 to 11px below the rail | **no** | a ~9px dead gap |
| The "0.5x" label, 12px below the rail | yes | ~26 x 17 px |
| Above the rail, beyond 3px | **no** | except where the thumb happens to sit |
| The rail between two ticks | yes | **1px** tall |

So each tick is really two live targets, its 6px mark and its label, with a dead gap between them, and the ticket asked for "click area ... the ~same dimensions as the thumb".

**The obvious fix does not work, which is why this is worth recording rather than just fixing.** Giving the root vertical padding (`padding: 10px 0`, `margin-top` 15px to 5px, `.markLabel { top: 23px }`) does produce a root whose border box measures 21px tall, 480 to 501 against a rail at 490, with every drawn dimension unchanged. But hit-testing does not follow the box: the live band goes from 6px only to **8px**, real clicks 4 to 8px below the rail still do nothing, and `elementsFromPoint` does not report the root at those points despite them being inside its measured rect. Setting `height: 21px` instead of padding measures identically and behaves identically. Both were built and measured, not reasoned about.

**What does work, measured**: a transparent hit box on the mark itself, which is the child that is reliably hit-tested.

```scss
.mark {
  // ... the drawn 4px tick, unchanged ...
  &:after {
    content: "";
    position: absolute;
    left: -10px;
    top: -10px;
    width: 24px;
    height: 24px;
  }
}
```

That takes the live band at a tick from 6px to **24px** vertically and from 6px to 30px horizontally, and real clicks 8px above and 8px below the rail both select, where as drawn both do nothing. No drawn pixel changes: the pseudo-element has no background and no border, and the tick's own 4px fill and 1px border are untouched. 24px is the ticket's "~same dimensions as the thumb" exactly, since the thumb is 24px.

**Decision**: add the hit box. Doug, 2026-08-29. It is the ticket's own stated requirement at almost no cost, and the gap it closes is where a slightly low click at a tick lands today. The stylesheet in Technical Notes now carries it, and the snap-to-ticks requirement records it. Not routed to Michael: the addition satisfies the sentence he wrote and changes nothing he drew.

### Senior Engineer

#### RESOLVED: The board states the enable rule in words, and the worded rule is a latch rather than `ready`
The spec says three times that the enable states had to be read off layer opacity because the notes do not state them ("read off layer opacity rather than inferred from an omission"; "The board states it positively once you read the layers rather than the notes"). The board's state-3 note says it in words, and the spec never quotes it:

> "3: If a Spark is placed: Start is enabled, along with Speed; Spark remains enabled until all Sparks have been placed. **Speed is first enabled when Start becomes enabled, then is always enabled (unless Clear All resets the model)**"

That is a latch: enable once, stay enabled until Clear All. `ready` is a recomputed predicate, and the two come apart in two reachable places.

**Terrain rebuild.** `ready` is `dataReady && sparks.length > 0`, and `updateZones()` (`simulation.ts:736-743`) calls `populateCellsData()`, which sets `dataReady = false` until the terrain promises resolve. Timed through the model's own `sim.dataReadyPromise` rather than by polling, across two fresh page loads with a spark already placed: `dataReady` is false for **352.6ms and 362.8ms** after Create, and `ready` reads false immediately after the click. The control does render faded during it (a sample at t=318ms shows the content at opacity 0.35). Two caveats keep this small: Start, Spark and Clear All are gated on the same `dataReady` and fade with it, and the main thread is blocked rebuilding cells for most of the window, which is why a 16ms sampler collects only 13 samples across it. An earlier 417ms figure in this spec's drafts was a cold-cache first run; 355ms is the warm number.

**Setup wizard open.** The repo's own state machine has an eighth state, `bottom-bar-state-machine.cy.ts:237`, *"state 8 (SetupOpen): Setup and Hazbot stay enabled; Spark/Clear All/Start locked out"*, which the board never draws. Verified live: with a spark placed and the wizard open, `sim.ready === true` while `start-button`, `spark-button` and `clear-all-button` are all `disabled`, and the Speed control is fully visible next to them (screenshot: `tmp/playwright/wm40-review-setup-open.png`). Under bare `ready`, Speed is the only live control in a fully grayed bar.

**Decision**: **`!simulation.ready || ui.showTerrainUI`**, the same expression shape Start already carries. Doug, 2026-08-29.

The wizard gate is not per-control semantics in this bar, it is "the wizard owns the screen", and every neighbor follows it; a single live control in a grayed bar reads as an oversight. The board's sentence is about the model state sequence it draws (spark placed, run, after run, Restart, Clear All) rather than about a modal panel that appears in none of its rows, so this is filling a gap rather than overriding a decision. It is also one term away from Start's existing expression, which keeps the state-machine matrix legible.

The 355ms terrain-rebuild fade is accepted rather than designed away: implementing the latch to remove it would make Speed the only control still live while the cells rebuild, and would add state that has to be cleared in exactly the right place in `reload()`. Both behaviors are now stated in the enable-predicate requirement so neither has to be rediscovered. Worth raising with Michael in PR review, since flipping it is one boolean.

---

#### RESOLVED: "The component owns its own widget group" is presented as forced, and it is not
The disabled finding concludes that dropping `hoverable` "is not a styling detail but a structural one: it is why the Speed component owns its widget group instead of being wrapped in one by `bottom-bar.tsx` the way every other widget is." The premise does not hold. `BottomBar` is an `@observer` that already computes the enable state of every other control in the bar (`sparkEnabled`, `fireLineEnabled`, `helitackEnabled`, and inline `disabled=` expressions at `:148`, `:184`, `:193`), so it can equally write `` className={`${css.widgetGroup} ${css.speedControl} ${simulation.ready ? "hoverable" : ""}`} `` and stay reactive.

The exact precedent is one widget to the left: `VegetationKeySwitch` is a child component, `bottom-bar.tsx:165-167` wraps it in the group, and its width lives in `bottom-bar.scss` as `.vegetationKey { width: 90px }`. Following it keeps every widget group and every group width in the two files that hold all the others, and keeps `[class*="widgetGroup"]`, which both Cypress specs pivot on, enumerable from one render method. The component-owned group instead pulls `bottom-bar.scss` into a child module as an import (the probe does this today) for the sake of one conditional class string.

Worth noting `hoverable` currently has no other consumer: `grep -rn hoverable src/ cypress/` returns only the rule at `bottom-bar.scss:87-91` and the probe. The rule works, and the board does draw `Speed Control Back` at `#dfdfdf` in both the Hover and Select rows of its four-state column (verified on the board: y 727 `#ffffff`, y 813 `#dfdfdf`, y 899 `#dfdfdf`, y 985 `#ffffff`), so Speed will be the first widget in the bar whose bubble changes color on hover. Confirmed live on the probe: hovering the Speed group gives `rgb(223, 223, 223)` while hovering Start's gives `rgb(255, 255, 255)`, and with the class dropped the disabled control stays white. That is the board's call and not a defect, but it is worth stating in the spec rather than leaving the next reader to find that `hoverable` had been dead code since 2019.

**Decision**: the group moves to `bottom-bar.tsx`. Doug, 2026-08-29. The deciding argument is the one the original decision could not have had, because it only appears once the enable predicate is `ready && !showTerrainUI` rather than a bare `ready`: under a component-owned group that expression is computed twice, once in the bar for the `hoverable` class and once in the component for MUI's `disabled` prop, which is exactly the duplicated-value pattern this repo gets reviewed for. Computing it once as a `speedEnabled` getter and passing `disabled={!speedEnabled}` mirrors `sparkEnabled` and `IconButton`. The secondary reasons are that it keeps every group and every group width in the two files that hold the others, which is what both Cypress specs assume, and that it avoids importing `bottom-bar.scss` into a child module, which nothing else in the repo does. The `hoverable` requirement and the group-ownership requirement below it now record this.

---

#### RESOLVED: The 16x figure is 15.04x, and the spec gives both numbers
`maxTimeStep` becomes the binding ceiling when `optimalTimeStep * 4` exceeds it: `ratio * 0.001108 > 180` with `ratio = 10800 * m` gives `m > 180 / 11.9664 = 15.04`. The spec says "below about **15x**" once (Technical Notes) and "until about **16x**" four times (the `maxTimeStep` requirement, Technical Notes, and twice in the multiplier decision). One of them is wrong and they are describing the same crossover.

**Decision**: corrected in place, 2026-08-29. All six sites now read "about 15x", and the three that carry the argument show the derivation `180 / 11.9664 = 15.04`.

---

### Education Researcher

#### RESOLVED: "A retune is free to move either end" is false above about 5x
The spec tells a future retuner twice that the fast end is unconstrained: *"there is no multiplier in the plausible range that a clamp treats differently from any other, so a retune is free to move either end on pedagogical grounds alone"*. That was checked against `maxTimeStep` and the day boundary. There is a third, much tighter boundary nobody looked at: the graph samples once per **model hour**.

`graph.tsx:70-77` runs `updateChartData` in a `useEffect` keyed on `simulation.timeInHours`, which is `Math.floor(this.time / 60)` (`simulation.ts:95-97`). A tick longer than 60 model minutes steps that value by more than one, and the skipped hour is never recorded in `chartStore.rawBurnData`. `getOutcomeData` then computes `burnRates` as a piecewise rate over consecutive stored points (`simulation.ts:567-585`), so a hole does not produce a gap or an error: it produces one averaged entry where two should be, and every later index shifts. `LOGGED-EVENTS.md` documents that array as *"index 0 = hour 1, index 1 = hour 2, etc."*, and it rides on `SimulationStarted`'s sibling `SimulationEnded` / `SimulationStopped` payloads that researchers read.

Measured with a harness reproducing `rafCallback`'s `Math.min(maxTimeStep, optimalTimeStep * 4, ratio * elapsed)` and the `floor(time / 60)` bucketing, over 600 frames at three frame times:

| Multiplier | Max tick (min) | Hours skipped @16.7ms | @55ms | @200ms |
|---|---|---|---|---|
| 0.25x to 5x | up to 59.8 | 0 | 0 | 0 |
| 6x | 71.8 | 0 | 0 | **117 of 717** |
| 8x | 95.7 | 0 | **191 of 791** | **357 of 957** |

So everything shippable today is safe with margin, Trudi's 3x is safe, and the crossover is `11.97 * m > 60`, i.e. **m > 5.01**. This is the same class of hazard as the day-boundary guarantee the spec pins in its boundary requirement, with a margin 24 times smaller: 60 minutes against 1440.

**Decision**: record the ceiling **and** assert it. Doug, 2026-08-29. The three places that told a future retuner the fast end was unconstrained now name the about-5x ceiling and why it is there, and the boundary requirement gains an hour-boundary case alongside the day one, driven the same way: a tick at the largest ceiling the shipped multipliers can produce, asserting `sim.timeInHours` never advances by more than one, naming neither 60 nor 1440.

It is a guard rather than a live defect, and it earns its place the same way the day assertion does: it fails on exactly the change it exists to catch. At the shipped multipliers the maximum tick is 23.93 minutes against a 60-minute bucket; a 6x entry makes it 71.8 and the test goes red. The plumbing is already required elsewhere, since `simulation.test.ts` drives `start()` then `tick()` today and the timestep formula is extracted from `rafCallback` for the computed-timestep requirement.

