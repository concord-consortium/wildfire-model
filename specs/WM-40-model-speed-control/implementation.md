# Implementation Plan: WM-40: Add a speed control to speed up or slow down the model

**Jira**: https://concord-consortium.atlassian.net/browse/WM-40
**Requirements Spec**: [requirements.md](requirements.md)
**Status**: **In Development**

## How this plan was verified

Every number below was measured against a working build of this plan rather than derived. The whole
plan was implemented once in the working tree, driven in Chrome through Playwright and run against
both test suites, then reverted so the work could be done deliberately in the commits below. What
that pass established, and what it corrected:

- **The finished row measures as the requirements predicted.** `.mainContainer` is **674**, the Speed
  widget group is **99**, there are **9** widget groups and **4** abutting seams, the Start-to-Speed
  gap is **-1** and Speed-to-Fireline is **3**.
- **All eight bottom-bar states reproduce the board**, including state 5, where Speed is live while
  Start is disabled, and the Setup-wizard state the board never drew.
- **No existing Jest test needs changing.** The suite on this branch measures **1022 passed of 1022 across 82 suites** (re-measured 2026-08-29), and the plan only adds tests: five in `speed.test.ts` and one in `log-events.test.tsx`. Re-measure before quoting a post-implementation total in a PR body.
- **Exactly two Cypress assertions fail**, both in `bottom-bar-visuals.cy.ts`, and
  `bottom-bar-state-machine.cy.ts` passes untouched at 11 of 11. Speed is an addition there, not a repair.
- **The row has two intrinsic minima, because the logo swaps at 960px.** The left container's floor
  is 140 with the large logo and 53.3 with the small one (`bottom-bar.scss:332-340`), so with Speed the
  bar fits at 1008+, **overflows from 961 to 1007**, fits from 922 to 960, and overflows below. The
  Cypress comment's existing 824 and its floor of 54 are correct for the shipped bar; an earlier draft
  of this plan replaced them with 1008 / 140, which are the large-logo figures read at a viewport where
  the small logo renders. See the Cypress step.
- **MUI does not fire `onChange` for a no-op selection.** Clicking the already-selected tick, on the
  thumb or off it, and arrow-keying at the max all emit nothing, so the same-value guard an earlier
  draft carried was dead code. What a gesture does emit is measured in the logging step.
- **`:has(:global(.Mui-active))` compiles correctly.** Checked by building the probe through the real
  loader chain: it emits `.bottom-bar--speedControl--__wildfire-v1__:has(.Mui-active)`, hashing the
  local class and leaving MUI's global one alone. The same rule written without `:global` hashes
  `Mui-active` too and silently matches nothing, so the wrapper is load-bearing.
- **One structural simplification.** The transcribed stylesheet nests everything under a
  `.speedControl` wrapper inside the widget group. Measured, that wrapper is exactly coincident with
  `.content` (97 wide, inset 1px inside the 99px group), so it is dropped and the rules hang off
  `.content`. Hovering the "Speed" header still triggers the thumb ring, because the header is inside
  `.content`.

## Implementation Plan

### Add the speed multiplier to the model

**Summary**: The model half of the story, with no UI. Introduces the one indexed array that owns the
multipliers and their labels, extracts the per-frame timestep formula out of `rafCallback` so it can
be asserted directly, and folds the multiplier into the single place the app converts model time to
real time. Independently reviewable and independently testable: after this commit the pace is settable
from `window.sim` with nothing rendered.

**Files affected**:
- `src/models/simulation.ts`: the array, the observable, the extracted formula, the reset
- `src/models/speed.test.ts`: new; the boundary guarantees and the multiplier's behavior

**Estimated diff size**: ~170 lines

Add above the class in `src/models/simulation.ts`:

```ts
// The three positions of the bottom bar's Speed control, in tick order. The
// slider carries indices into this array rather than the multipliers themselves:
// MUI positions a mark at valueToPercent(mark.value, min, max), so values of
// 0.5 / 1 / 2 would put the middle tick at 33% of the rail instead of half way.
//
// `label` is deliberately its own field rather than a formatting of `multiplier`.
// The two are allowed to diverge, so that the pace can be retuned (0.4 behind a
// "0.5x" tick, say) without redrawing the artboard. Nothing should assert that a
// label agrees with its multiplier.
export const SPEEDS = [
  { multiplier: 0.5, label: "0.5x" },
  { multiplier: 1, label: "1x" },
  { multiplier: 2, label: "2x" }
];
export const DEFAULT_SPEED_INDEX = 1;

// Extracted from rafCallback so the relationship between the multiplier and the
// per-frame timestep can be asserted directly, without a rAF loop.
export const computeTimeStep = (
  config: { modelDayInSeconds: number; maxTimeStep: number },
  speedMultiplier: number,
  realTimeDiffInMinutes: number
) => {
  // One day in model time (86400 seconds) should last X seconds in real time.
  const ratio = 86400 / config.modelDayInSeconds * speedMultiplier;
  // Optimal time step assumes we have stable 60 FPS:
  // realTime = 1000ms / 60 = 16.666ms
  // timeStepInMs = ratio * realTime
  // timeStepInMinutes = timeStepInMs / 1000 / 60
  // Below, these calculations are just simplified (1000 / 60 / 1000 / 60 = 0.000277):
  const optimalTimeStep = ratio * 0.000277;
  // Final time step should be limited by:
  // - maxTimeStep that model can handle
  // - reasonable multiplication of the "optimal time step" so user doesn't see significant jumps in
  //   the simulation when one tick takes much longer time (e.g. when cell properties are recalculated
  //   after adding fire line)
  return Math.min(config.maxTimeStep, optimalTimeStep * 4, ratio * realTimeDiffInMinutes);
};
```

Add to the class, beside `setupChanged`:

```ts
  @observable public speedIndex = DEFAULT_SPEED_INDEX;

  @computed public get speedMultiplier() {
    return SPEEDS[this.speedIndex].multiplier;
  }

  @computed public get speedLabel() {
    return SPEEDS[this.speedIndex].label;
  }

  @action.bound public setSpeedIndex(index: number) {
    this.speedIndex = index;
  }
```

Replace the timestep block inside `rafCallback` (the comments move to `computeTimeStep` above):

```ts
    let timeStep;
    if (realTimeDiffInMinutes) {
      timeStep = computeTimeStep(this.config, this.speedMultiplier, realTimeDiffInMinutes);
    } else {
      // We don't know performance yet, so simply increase time by some safe value and wait for the next tick.
      timeStep = 1;
    }
```

Add one line to `setInputParamsFromConfig()`, after the `wind` assignment. That function is what
`reload()` calls under its "Reset user-controlled properties too" comment, so this is the Clear All
reset; `restart()` does not call it, which is what leaves the speed alone across a Restart:

```ts
    this.speedIndex = DEFAULT_SPEED_INDEX;
```

New file `src/models/speed.test.ts`. The boundary tests were drafted separately and confirmed
passing, and the block below is that draft with the 6x bound folded into the hour-boundary test
rather than standing as a third one, so the guarantee and the proof that it can fail travel together.
The draft itself is not in the tree; this is the shipping version and the only copy you need:

```ts
import { Vector2 } from "three";
import { SimulationModel, SPEEDS, DEFAULT_SPEED_INDEX, computeTimeStep } from "./simulation";
import { FireEngine } from "./engine/fire-engine";
import { Cell } from "./cell";
import { Zone } from "./zone";
import { getDefaultConfig } from "../config";

const FRAME_MIN = 16.7 / 60000;   // one 60 FPS frame, in minutes

const newSim = async () => {
  const sim = new SimulationModel({
    modelWidth: 100000, modelHeight: 100000, gridWidth: 5,
    sparks: [[50000, 50000]], zoneIndex: [[0]], elevation: [[0]],
    unburntIslands: [[0]], riverData: null
  });
  await sim.dataReadyPromise;
  return sim;
};

describe("model speed", () => {
  it("scales the per-frame timestep by exactly the multiplier at 60 FPS", () => {
    const config = getDefaultConfig();
    const [slow, normal, fast] = SPEEDS.map(s => computeTimeStep(config, s.multiplier, FRAME_MIN));
    expect(slow / normal).toBeCloseTo(0.5, 10);
    expect(fast / normal).toBeCloseTo(2, 10);
  });

  // The three-term Math.min invites the reading that a slow frame collapses the
  // speeds together. It does not: optimalTimeStep * 4 scales with the multiplier,
  // so it is the binding term at the same frame time for all three.
  it("keeps the speeds proportional on a frame slow enough to engage the clamp", () => {
    const config = getDefaultConfig();
    const slowFrame = 100 / 60000;
    const [slow, normal, fast] = SPEEDS.map(s => computeTimeStep(config, s.multiplier, slowFrame));
    expect(normal).toBeLessThan(86400 / config.modelDayInSeconds * slowFrame);   // the clamp is engaged
    expect(slow / normal).toBeCloseTo(0.5, 10);
    expect(fast / normal).toBeCloseTo(2, 10);
  });

  it("keeps the selected speed across restart() and resets it on reload()", async () => {
    const sim = await newSim();
    sim.setSpeedIndex(0);
    sim.start();
    sim.tick(5);

    sim.restart();
    expect(sim.speedIndex).toBe(0);

    sim.setSpeedIndex(2);
    sim.reload();
    expect(sim.speedIndex).toBe(DEFAULT_SPEED_INDEX);
    expect(sim.speedMultiplier).toBe(1);
  });

  // A faster clock is only safe while one tick cannot carry the model across a
  // whole model day: the engine's per-day roll fires once per *observed* change of
  // Math.floor(time / 1440), so a skipped day is a skipped roll. maxTimeStep and
  // the 1440-minute day live in different files with nothing stating that one
  // bounds the other. Naming neither constant here is the point: raising
  // maxTimeStep past a model day fails this on its own.
  it("never advances the engine's day by more than one per tick, even at maxTimeStep", () => {
    const { maxTimeStep } = getDefaultConfig();
    const config = {
      cellSize: 20000, gridWidth: 5, gridHeight: 5, minCellBurnTime: 200,
      neighborsDist: 2.5, fireSurvivalProbability: 1
    };
    const zone = new Zone({});
    const cells: Cell[] = [];
    for (let x = 0; x < config.gridWidth; x++) {
      for (let y = 0; y < config.gridHeight; y++) cells.push(new Cell({ x, y, zone }));
    }
    const engine = new FireEngine(cells, { speed: 0, direction: 0 }, [new Vector2(50000, 50000)], config);

    let time = 0;
    let previousDay = engine.day;
    while (time < 1440 * 30) {
      time += maxTimeStep;
      engine.updateFire(time);
      expect(engine.day - previousDay).toBeLessThanOrEqual(1);
      previousDay = engine.day;
    }
  });

  // The tighter boundary, by a factor of 24, and the one a plausible retune can
  // cross. The graph samples once per model hour (graph.tsx, keyed on
  // simulation.timeInHours), so a tick longer than an hour drops a point from the
  // burn data and shifts every later index of the logged burnRates array against
  // its "index 0 = hour 1" contract.
  //
  // The second assertion is the bound on the first, not a separate guarantee: it
  // pins that this test is able to fail, so a retune that crosses the hour is
  // caught rather than passing silently. The shipped multipliers give a
  // 23.93-minute ceiling against a 60-minute bucket; 6x gives 71.80. Neither 60
  // nor 1440 is named here. If a future change legitimately moves the clamp, both
  // assertions move together.
  it("bounds timeInHours to one per tick at the fastest shipped speed, and not above it", async () => {
    const maxHourJump = async (multiplier: number) => {
      const sim = await newSim();
      const ceiling = computeTimeStep(sim.config, multiplier, Infinity);
      sim.start();
      let previousHours = sim.timeInHours;
      let max = 0;
      for (let i = 0; i < 200; i++) {
        sim.tick(ceiling);
        max = Math.max(max, sim.timeInHours - previousHours);
        previousHours = sim.timeInHours;
      }
      return max;
    };

    const fastest = Math.max(...SPEEDS.map(speed => speed.multiplier));
    expect(await maxHourJump(fastest)).toBeLessThanOrEqual(1);
    expect(await maxHourJump(6)).toBeGreaterThan(1);
  });
});
```

---

### Render the Speed control in the bottom bar

**Summary**: The control itself and its place in the row. `bottom-bar.tsx` owns the widget group and
computes the enable predicate once, as it does for every other widget; the component owns what is
inside the bubble. The dead `.slider` block goes in the same commit, because this is the change that
turns it from inert into a trap.

**Files affected**:
- `src/components/speed-control.tsx`: new
- `src/components/speed-control.scss`: new
- `src/components/speed-control.test.tsx`: new; the `track={false}` guard
- `src/components/bottom-bar.tsx`: `speedEnabled` getter, the widget group, Start's modifier class
- `src/components/bottom-bar.scss`: `.startButton`, `.speedControl` (width plus the Select-state bubble), and deleting the orphaned `.slider`

**Estimated diff size**: ~245 lines

New file `src/components/speed-control.tsx`:

```tsx
import React from "react";
import { observer } from "mobx-react";
import Slider from "@mui/material/Slider";
import { useStores } from "../use-stores";
import { SPEEDS } from "../models/simulation";
import css from "./speed-control.scss";

const MARKS = SPEEDS.map((speed, index) => ({ value: index, label: speed.label }));

interface IProps {
  disabled: boolean;
}

// `step={null}` puts MUI on a different code path from every other slider in this
// repo: a falsy step resolves each pointer position to the nearest mark instead of
// rounding to a step, in the move, pointerdown and mousedown handlers alike. That
// is what makes a click anywhere on the rail snap to a tick, and what makes a drag
// jump tick to tick, with no code of ours.
//
// `track={false}` is load-bearing rather than cosmetic. MUI computes a mark's
// active state as "is this the selected value" only in the trackless mode; with a
// visible track it marks every value at or below the selection, which would render
// 0.5x bold alongside 1x. The bold-the-selected-label rule depends on it.
export const SpeedControl = observer(function WrappedComponent({ disabled }: IProps) {
  const { simulation } = useStores();

  const handleChange = (event: Event, value: number | number[]) => {
    simulation.setSpeedIndex(value as number);
  };

  return (
    <div className={`${css.content} ${disabled ? css.disabled : ""}`}>
      <div className={css.header}>Speed</div>
      <Slider
        classes={{
          root: css.slider, rail: css.rail, mark: css.mark,
          thumb: css.thumb, markLabel: css.markLabel
        }}
        min={0}
        max={SPEEDS.length - 1}
        step={null}
        track={false}
        marks={MARKS}
        value={simulation.speedIndex}
        // Supplies pointer-events: none. The 0.35 fade alone leaves a faded
        // control fully draggable.
        disabled={disabled}
        onChange={handleChange}
        data-testid="speed-control"
      />
    </div>
  );
});
```

New file `src/components/speed-control.scss`. Measured against the board layer by layer; the colors
are the existing tokens rather than the literals the board reports:

```scss
@import "./common.scss";

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
  color: $controlText;
}

// Nested one level deeper than the emotion class, so these outrank MUI's own slot
// styles. Flat (0,1,0) rules lose the tie and MUI's width / height / color win.
.content .slider {
  width: 55px;
  height: 1px;
  padding: 0;
  display: block;
  margin: 15px auto 0;

  .rail { height: 1px; opacity: 1; background-color: $controlGray; }

  .mark {
    width: 4px;
    height: 4px;
    border-radius: 4px;
    border: solid 1px $controlGray;
    // #d8d8d8 stays a literal: common.scss has no token for it, and
    // $controlGrayLight2 is #c9c9c9. vertical-selectors.scss and
    // wind-circular-control.scss both write this literal too.
    background-color: #d8d8d8;
    opacity: 1;
    // MUI hardcodes translate(-1px, -50%), half of its own 2px default mark. Ours
    // renders 6px wide (4 plus a 1px border a side), so it needs -3px.
    transform: translate(-3px, -50%);

    // 24px transparent hit target, matching the thumb. The drawn tick is 6px and
    // the slider root is 1px tall, so without this a click a few pixels off the
    // rail lands on nothing. The mark is the child that hit-tests reliably here;
    // giving the root its own taller box measures correctly but does not receive
    // the clicks.
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
    // The rotated variant, whose chevrons point left and right. The repo splits
    // the two by orientation: horizontal sliders take `-small`, the vertical
    // setup-panel selectors take the unrotated `slider-thumb.svg`. 140% is what
    // makes the asset's Outer circle exactly fill the box (20 of a 28px viewBox),
    // which is why the wind meter uses the same figure at a different size.
    background-image: url("../assets/slider-thumb-small.svg");
    background-size: 140%;
    background-position: center;
    background-repeat: no-repeat;
    background-color: transparent;
    box-shadow: none;
    cursor: grab;

    // MUI paints its own focus ring on a ::before pseudo-element; ours is a
    // box-shadow on the thumb itself, so that one has to go or both show.
    &:before { box-shadow: none; }
  }

  .markLabel {
    font-family: Lato, sans-serif;
    font-size: 14px;
    font-weight: 400;
    color: $controlText;
    top: 13px;
    line-height: 17px;

    &:global(.MuiSlider-markLabelActive) { font-weight: 700; }
  }
}

// The board's four-state column: Hover puts a 32x32 white Highlight behind the
// 24px Outer, which is a 4px ring, at 50% alpha; Select is the same ring at 100%.
.content:hover .slider .thumb {
  box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.5);
}

// Mui-focusVisible belongs to the Select group here, as it does in
// wind-circular-control.scss and vertical-selectors.scss. MUI sets it on a mouse
// gesture as well as a keyboard one and holds it until the input blurs, so once
// the control has been clicked it hovers at the Select ring rather than the Hover
// one. At rest that is a white ring on a white bubble, so nothing shows.
.content .slider .thumb {
  &:active,
  &:global(.Mui-active),
  &:global(.Mui-focusVisible) {
    box-shadow: 0 0 0 4px rgba(255, 255, 255, 1);
    cursor: grabbing;
  }
}

// Fades the content only, leaving the widget group's white bubble and its 1px
// border at full opacity, which is both the board and the bar's existing rule for
// buttons. Fading the group instead renders its border at rgb(187,187,187)
// against every neighbor's rgb(121,121,121), along the top of the bar and across
// the seam it shares with Start. No grayscale filter: unlike the button rule it
// would be a no-op, since the control is already achromatic.
.disabled {
  opacity: 0.35;

  &:hover .slider .thumb { box-shadow: none; }
}
```

In `src/components/bottom-bar.tsx`, add the import and a getter beside the other enable predicates:

```tsx
import { SpeedControl } from "./speed-control";
```

```tsx
  // `ready` rather than `startEnabled`: the latter carries `&& !simulationEnded`,
  // and the board draws Speed enabled after a run, where Start is not. The
  // showTerrainUI term is not on the board, which never draws the wizard; every
  // other control in the bar locks while it is open, and without it Speed is the
  // only live control in a fully grayed bar.
  get speedEnabled() {
    const { simulation, ui } = this.stores;
    return simulation.ready && !ui.showTerrainUI;
  }
```

Give Start's widget group a modifier class so it can abut Speed, and add the Speed group between
Start and Fireline:

```tsx
          <div className={`${css.widgetGroup} ${css.startButton}`}>
```

```tsx
          <div className={
            `${css.widgetGroup} ${css.speedControl} ${this.speedEnabled ? "hoverable" : ""}`
          }>
            <SpeedControl disabled={!this.speedEnabled} />
          </div>
```

`hoverable` is applied conditionally because Speed is not a button: the bar's other widgets get this
for free from `:disabled`, and the board's disabled row keeps the bubble white. The predicate is
computed once here and passed down, rather than recomputed inside the component for MUI's `disabled`.

In `src/components/bottom-bar.scss`, add beside `.restart`:

```scss
  // Speed bubble abuts the Start bubble (no gap). Same trick as .placeSpark /
  // .restart: zero the right margin and the next group's -1px left margin pulls
  // it flush.
  .startButton {
    margin-right: 0;
  }

  // 97 px of content inside the shared 1 px border, per the board's 97/99 group.
  // The control fills this, so the width lives here only, as .vegetationKey does.
  .speedControl {
    width: 97px;

    // The board's Select state turns the bubble #dfdfdf as well as the thumb's
    // ring, and the ring is white, so on a white bubble it is invisible. Hover
    // gets this from the `hoverable` class, but MUI takes no pointer capture
    // (useSlider.js:539-541 listens on the document), so a drag that leaves the
    // bubble drops :hover while Mui-active stays on the thumb. This is the only
    // selector that reaches the group from the thumb's state; the control's own
    // stylesheet lives inside .content and cannot style an ancestor.
    // :global is required: without it css-loader hashes Mui-active.
    &:has(:global(.Mui-active)) {
      background: $hoverColor;
    }
  }
```

New file `src/components/speed-control.test.tsx`. `track={false}` is called load-bearing in both
specs and nothing else in the suite would notice its removal: the prop changes only which labels
render bold, and no Cypress case reads label weight.

```tsx
import React from "react";
import { render, screen } from "@testing-library/react";
import { Provider } from "mobx-react";
import { createStores } from "../models/stores";
import { SpeedControl } from "./speed-control";

const ACTIVE = "MuiSlider-markLabelActive";

describe("SpeedControl", () => {
  let stores: ReturnType<typeof createStores>;

  beforeEach(() => {
    stores = createStores();
  });

  // Guards `track={false}`. MUI treats a mark as active by "is this the selected
  // value" only in the trackless mode (Slider.js:597-601); with a track it marks
  // every value at or below the selection, which would bold 0.5x and 1x here too.
  //
  // Asserted at the fastest tick deliberately. At the slowest tick the two modes
  // render identically ([active, inactive, inactive] either way), so an assertion
  // there cannot catch the prop's removal. At index 2 trackless gives one active
  // label and tracked gives three.
  it("bolds only the selected label", () => {
    stores.simulation.setSpeedIndex(2);
    render(
      <Provider stores={stores}>
        <SpeedControl disabled={false} />
      </Provider>
    );
    expect(screen.getByText("2x")).toHaveClass(ACTIVE);
    expect(screen.getByText("1x")).not.toHaveClass(ACTIVE);
    expect(screen.getByText("0.5x")).not.toHaveClass(ACTIVE);
  });
});
```

Queried through `screen.getByText` + `toHaveClass` rather than `container.querySelector`, which is
what `.eslintrc.build.js` requires (`testing-library/no-node-access`, `no-container`) and what
`vegetation-key-switch.test.tsx` already does.

And delete the orphaned top-level `.slider` block (currently `bottom-bar.scss:343-371`). It has had no
consumer since the precipitation slider was removed in 2019, and it describes a 20px thumb and an
`opacity: 0.25` disabled state that both contradict this control's.

---

### Log the speed

**Summary**: Makes a run's pace recoverable from the log, which is the property `modelDayInSeconds`
provides today and which this story would otherwise break. Separated from the rendering step because
it spans the component, the run payload, the docs and the Hazbot translator, and because the control
is reviewable without it.

**Files affected**:
- `src/components/speed-control.tsx`: the `log` import and the `SpeedChanged` call
- `src/components/bottom-bar.tsx`: two keys on the `SimulationStarted` payload
- `src/hazbot/wildfire/translate.ts`: name the event above the closing default
- `LOGGED-EVENTS.md`: one new row, and the `SimulationStarted` row's parameter list
- `src/components/log-events.test.tsx`: assertions for both

**Estimated diff size**: ~70 lines

Both payloads carry the label as well as the multiplier. The multiplier is what makes the log
arithmetically usable; the label is the only record of which position the student actually chose.
Once the two are allowed to diverge, neither reconstructs the other.

In `speed-control.tsx`, add the import the previous step deliberately left out:

```tsx
import { log } from "../log";
```

and extend `handleChange`. Logging lives in the component rather than in `setSpeedIndex` so that
programmatic changes from `window.sim` and from tests do not log, which is the precedent
`VegetationKeySwitch` sets:

```tsx
  // Logged from onChange rather than onChangeCommitted, which is the opposite of
  // the other sliders in this repo (terrain-panel.tsx logs ZoneUpdated on commit).
  // Those are setup-panel controls whose intermediate values never reach a running
  // model. Speed is live during a run, so a drag really does run the fire at each
  // tick it crosses, and this event exists to keep model time and wall clock
  // interconvertible. Committing would log one value per gesture and discard the
  // speeds the model actually ran at.
  //
  // No same-value guard is needed: MUI does not fire onChange for a no-op. Verified
  // on the built control -- clicking the already-selected tick, on the thumb or off
  // it, and arrow-keying at the max all emit nothing.
  const handleChange = (event: Event, value: number | number[]) => {
    const index = value as number;
    const previous = SPEEDS[simulation.speedIndex];
    simulation.setSpeedIndex(index);
    log("SpeedChanged", {
      previousMultiplier: previous.multiplier,
      multiplier: SPEEDS[index].multiplier,
      label: SPEEDS[index].label
    });
  };
```

**One gesture can emit more than one event, and that is intended.** Measured on the built control:

| Gesture | `SpeedChanged` events |
|---|---|
| Click a different tick | 1 |
| Click the selected tick | **0** |
| Arrow key | 1 |
| Drag across all three ticks | **2** |
| Drag out and back to the start | **4**, netting to no change |

Each one records a pace the model genuinely ran at, so the sequence stays arithmetically faithful.
An analyst reconstructing a run should fold consecutive events rather than counting them as
decisions, which is what the `LOGGED-EVENTS.md` row says. Dragging is an unusual gesture on a 55px
three-tick control, so the noise this admits is small next to the fidelity it keeps.

In `bottom-bar.tsx`'s `handleStart`, after `configSnapshot.towns`. The multiplier is model state
rather than config, so it does not arrive through the generic `Object.entries(config)` snapshot.
Both read off the model, so `bottom-bar.tsx` needs no `SPEEDS` import (`log` it already has, at `:27`):

```tsx
      configSnapshot.speedMultiplier = simulation.speedMultiplier;
      configSnapshot.speedLabel = simulation.speedLabel;
```

In `translate.ts`, add `case "SpeedChanged":` to the list above `default: return { kind: "no-op" }`.
The default already makes it inert; naming it states that rather than leaving it inherited, as
`VegetationKeyShown` and `VegetationKeyHidden` do.

In `LOGGED-EVENTS.md`, add to the Dialogs & UI table and extend the `SimulationStarted` parameter list
with `speedMultiplier, speedLabel`:

```
| `SpeedChanged` | `{ previousMultiplier, multiplier, label }` | User moves the bottom bar's Speed control. `multiplier` is the model's pace relative to its authored `modelDayInSeconds`; `label` is the tick's drawn text. The two are stored separately and are allowed to diverge, so read `label` for what the student saw and `multiplier` for converting model time to wall clock. |
```

In `log-events.test.tsx`, add `speedMultiplier` and `speedLabel` to the existing `SimulationStarted`
payload assertions. That block asserts presence rather than shape, so without an explicit assertion a
missing key passes silently.

Then add a case for the control's own event, modeled on `terrain-panel.test.tsx:299-301` rather than
on `vegetation-key-switch.test.tsx`. The switch precedent gives the right *shape* for asserting a
control's own log event, but the wrong driver: `userEvent.click` cannot move a MUI slider correctly
under jsdom. MUI resolves every pointer position through `getFingerNewValue`, which reads
`sliderRef.current.getBoundingClientRect()` (`useSlider.js:320-350`); jsdom reports that rect as all
zeros, so every position resolves to percent 0 and `findClosest` returns the first mark. Measured:
`userEvent.click(screen.getByText("2x"))` sets the index to **0** and logs `multiplier: 0.5`, and it
logs anything at all only because the default index is 1. `fireEvent.click` on the same label emits
nothing, since MUI listens on pointerdown / mousedown rather than click. Keyboard is not an
alternative either: arrow keys reach MUI through the native range input's `change` event
(`useSlider.js:273-283`), which jsdom does not implement.

What does work is the hidden range input, driven the way the drought and wind sliders already are:

```tsx
    // eslint-disable-next-line testing-library/no-node-access
    const input = screen.getByTestId("speed-control").querySelector("input")!;
    fireEvent.change(input, { target: { value: "2" } });
```

That logs `{ previousMultiplier: 1, multiplier: 2, label: "2x" }`. The `eslint-disable` is required,
not optional: `testing-library/no-node-access` is an **error** under the
`plugin:testing-library/react` override at `.eslintrc.js:100`, and `terrain-panel.test.tsx` carries
the same line at every one of its slider call sites.

---

### Update the two Cypress specs the new geometry touches

**Summary**: `bottom-bar-visuals.cy.ts` has two failing assertions and stale prose; the state machine
gains a ninth control. Both were run against a working build, so the numbers below are measured and
the failure list is complete rather than predicted.

**Files affected**:
- `cypress/e2e/bottom-bar-visuals.cy.ts`
- `cypress/e2e/bottom-bar-state-machine.cy.ts`

**Estimated diff size**: ~60 lines

In `bottom-bar-visuals.cy.ts`, two assertions fail and both are one number:

- `.mainContainer` **576 becomes 674**.
- The gap chain gains Speed. `"Start -> Fireline"` was 3 and that adjacency no longer exists; it
  becomes `"Start -> Speed (abuts)"` at **-1** and `"Speed -> Fireline"` at **3**. The `ids` array
  gains `"speed-control"` between `"start-button"` and `"fireline-button"`.

The prose in the same file goes stale in **five** places, all of them silent. Grepping `eight`,
`three abutting` and `Spark <-> Restart` in that file returns exactly these, so the edit is checkable
rather than remembered:

| Site | Today | Becomes |
|---|---|---|
| `:5-6`, file header | "the **three** abutting bubble seams: Spark <-> Restart, Restart <-> Start, and Fireline <-> Helitack" | four seams, with Start <-> Speed added |
| `:54`, test name | "its **eight** widget groups" | nine |
| `:55`, inside that test | "the sum of the **eight** widget widths" | nine |
| `:72-76`, inside the gap test | "the **Spark, Restart and Fireline** widgetGroups carry margin-right:0 ... the designer wants for **Spark <-> Restart, Restart <-> Start, and Fireline <-> Helitack**" | Start joins the first list, Start <-> Speed joins the second |
| `:131`, viewport comment | "**576** of controls" | 674, plus the logo-regime sentence below |

The `:72-76` one is worth more than a word count: it is the file's only explanation of *how* the
abutment is built, and it is what the next reader will treat as the authority on which groups carry
`margin-right: 0` immediately after this story adds a fourth.

Two further edits that no failure forces:

- The per-widget width test passes today only because it does not mention Speed. Add
  `widgetRect("speed-control").should((r) => expect(r.width).to.eq(99));` so the 97px content box is
  actually covered.
- The viewport test's explanatory comment stays correct in its arithmetic but goes stale in its
  input: it derives 824 from "576 of controls, plus the right container's 194 floor, plus the left
  container's 54", and the 576 becomes 674. Update the controls term and add a sentence recording that
  the left floor is 54 only at or below the 960px logo breakpoint (`bottom-bar.scss:332-340`), 140
  above it, so with Speed the bar fits at 1008+, **overflows from 961 to 1007**, and fits again from
  922 to 960. The band costs the fullscreen toggle in that range. It is documented rather than fixed:
  the bar already overflows below 824 today, and closing the band means moving the logo breakpoint,
  which is a design question for its own ticket. The assertion itself passes unchanged at 1241 x 529,
  with 233px of headroom.

In `bottom-bar-state-machine.cy.ts`, all 11 cases pass untouched, so this is purely an addition.
`expectButtonStates` gains a `speed` key, which is a required field on its object literal, so all
**ten** of its call sites have to be filled. The Speed control is not a button:
MUI puts `disabled` on the Slider's hidden range input, which is the same element the file's existing
`setDroughtSlider` helper already reaches for, so the assertion is:

```ts
  cy.get("[data-testid='speed-control'] input")
    .should(states.speed ? "not.be.disabled" : "be.disabled");
```

Every call site, in file order, measured live rather than read off the board. The list is by call
site rather than by state because two of them are not named states: the file's eight states account
for eight calls, and `:204` and `:241` are the other two.

| Call site | Case | speed |
|---|---|---|
| `:120` | state 1 Default | false |
| `:136` | state 2 SetupChanged | false |
| `:145` | state 3 SparkPlaced | **true** |
| `:156` | state 4 Running | **true** |
| `:176` | state 5 Ended | **true** |
| `:188` | state 6 Restarted | **true** |
| `:204` | Fireline armed | **true** |
| `:228` | state 7 AfterClearAll | false |
| `:241` | state 8, before the wizard opens | **true** |
| `:248` | state 8 SetupOpen | false |

State 5 is the one that distinguishes this predicate from Start's: Speed is enabled there while Start
is disabled. State 8 is the one the board never drew. The two unnamed sites follow from the predicate
without a new case: `:204` is mid-run so `ready` holds, and `:241` has the spark placed with
`showTerrainUI` still false.

---

## Open Questions

### RESOLVED: Should this story correct the stale arithmetic in the Cypress viewport comment?
**Context**: `bottom-bar-visuals.cy.ts`'s viewport test carries a comment deriving the row's intrinsic minimum as 824 from a left-container floor of 54. Both are correct for the shipped bar: re-measured 2026-08-29, the bar fits at 823 and overflows at 815. The floor is 54 only at or below the 960px logo breakpoint and 140 above it, so with Speed the row fits at 1008+, overflows from 961 to 1007 (losing the fullscreen toggle), and fits again from 922 to 960. The assertion passes either way at 1241 x 529, so nothing is broken.
**Options considered**:
- A) Update the comment's 576 to 674, record both logo regimes and the 961-1007 band, and leave the breakpoint alone.
- B) Update only the parts the geometry change makes wrong, leaving the 54 for its own ticket.
- C) Leave the comment alone; no assertion reads it.

**Decision**: **A.** Doug, 2026-08-29, revised after re-measurement. The comment sits in a file this story already edits and the story invalidates its 576. The band is documented, not fixed: closing it means moving the logo breakpoint, which is a design question for its own ticket, and the bar already overflows below 824 today.

### RESOLVED: Where should the two boundary tests live?
**Context**: The plan puts both in a new `src/models/speed.test.ts`. Each drives a different subject, though: the day boundary constructs a real `FireEngine`, which `fire-engine.test.ts` already has a fixture for, and the hour boundary drives `sim.tick()` the way `simulation.test.ts` already does. The question was whether the repo colocates tests with the module under test.
**Options considered**:
- A) Both in a new `src/models/speed.test.ts`.
- B) Split them into `fire-engine.test.ts` and `simulation.test.ts`.
- C) All of it appended to `simulation.test.ts`, adding no new file.

**Decision**: **A.** Doug, 2026-08-29. Colocation is not the rule here: 13 test files under `src/` have no matching module, and every one of them is named for a property or concern rather than a module (`log-events.test.tsx`, `replay-determinism.test.ts`, `feedback-ladder.test.ts`, `helitack-run-window.test.ts`). "Model speed" is that shape, since the guarantee spans `SimulationModel` and `FireEngine` and is only meaningful as one story's claim. `log-events.test.tsx`, which this story also adds to, is the closest precedent.

### RESOLVED: Where should `SpeedChanged` be logged, and does a no-op click log?
**Context**: The plan originally guarded with `if (index === simulation.speedIndex) return;` so that a re-click on the current tick would not log. Instrumenting the built control showed the premise was false: **MUI never fires `onChange` for a no-op.** Clicking the already-selected tick emits nothing, on the thumb or 6px off it, and neither does an arrow key at the max. The guard could never be true, so the real question was not whether to keep it but which handler to log from. `onChangeCommitted` behaves differently, and measuring both turned the question into a genuine one:

| Gesture | `onChange` | `onChangeCommitted` |
|---|---|---|
| Click a different tick | 1 | 1 |
| Click the selected tick | **0** | **1** (a no-op) |
| Drag across all three ticks | **2** | 1 |
| Drag out and back to the start | **4** | **1, with the starting value** |
| Arrow key | 1 | 1 |

**Options considered**:
- A) Log from `onChange`. Every speed the model actually ran at is recorded; a drag emits 2 to 4 events.
- B) Log from `onChangeCommitted`, which is the repo's own slider pattern (`terrain-panel.tsx` updates the model in `onChange` and logs `ZoneUpdated` on commit). One event per gesture, matching student intent.

**Decision**: **A**, and the dead guard is deleted rather than kept. Doug, 2026-08-29. The precedent for B exists because the drought and vegetation sliders are setup-panel controls whose intermediate values never reach a running model. Neither holds here: Speed is enabled during a run by design, so a mid-run drag really does run the fire at each tick it crosses, and this event exists precisely to keep model time and wall clock interconvertible. B would discard exactly those intermediate speeds, which is the property the logging requirement was added to preserve. B also carries two costs the precedent hides: it fires on a no-op click, so it would need a real guard where the current one is dead code, and `previousMultiplier` would have to be captured at gesture start rather than read at log time. The cost of A is noise on a gesture (dragging a 55px three-tick control) that is unusual next to clicking.


## Self-Review

Every finding below was verified before it was written, against a throwaway build of this plan: the
model changes, the component, both stylesheets and the `bottom-bar.tsx` wiring were applied to the
working tree, driven through Jest and through Chrome via Cypress and Playwright, then reverted. What
the pass confirmed as correct is recorded at the end so the plan does not get re-litigated.

### QA Engineer

#### RESOLVED: The named precedent for the `SpeedChanged` assertion silently drives the slider to the wrong tick
The logging step says to add the `SpeedChanged` case to `log-events.test.tsx` "modeled on
`vegetation-key-switch.test.tsx`". That file drives a MUI `Switch` with `userEvent.click`, which is
the natural thing to reach for and the wrong thing for a `Slider`. MUI resolves a pointer position
through `getFingerNewValue`, which reads `sliderRef.current.getBoundingClientRect()`
(`useSlider.js:320-350`); jsdom has no layout, so that rect is all zeros, every position resolves to
percent 0, and `findClosest` returns the first mark.

Measured on the built control in jsdom, with the store wired and the log mocked:

| Driver | `speedIndex` | logged payload |
|---|---|---|
| `userEvent.click(screen.getByText("2x"))` | **0** | `{ previousMultiplier: 1, multiplier: 0.5, label: "0.5x" }` |
| `fireEvent.click(...)` on the same label | 1 (unchanged) | nothing at all |
| `fireEvent.change(input, { target: { value: "2" } })` | 2 | `{ previousMultiplier: 1, multiplier: 2, label: "2x" }` |

So the naive version passes an assertion that `SpeedChanged` fired while asserting the opposite tick
from the one it clicked, and it only fires at all because the default index is 1 rather than 0.

The repo already has the right precedent, one slider over: `terrain-panel.test.tsx:299-301` reaches
the hidden range input and uses `fireEvent.change`. Two details come with it. The input is only
reachable by `screen.getByTestId("speed-control").querySelector("input")`, which is
`testing-library/no-node-access`, an **error** under the `plugin:testing-library/react` override in
`.eslintrc.js:100`; `terrain-panel.test.tsx` carries the `eslint-disable-next-line` for exactly this
and Speed needs the same. And keyboard is not an alternative: MUI routes arrow keys through the
native range input's `change` event (`useSlider.js:273-283`), which jsdom does not implement, so
`userEvent.keyboard("{ArrowRight}")` produces no event and no log.

**Decision**: accepted and applied, 2026-08-30. The logging step now names
`terrain-panel.test.tsx:299-301` as the precedent, carries the `fireEvent.change` driver and its
required `eslint-disable`, and records why `userEvent.click` and the keyboard are both unusable here.
`vegetation-key-switch.test.tsx` stays cited in the requirements for the assertion's *shape*, which is
the part of it that does transfer.

---

#### RESOLVED: The state table has eight rows and `expectButtonStates` has ten call sites
The Cypress step gives the eight bar states and says `expectButtonStates` "gains a `speed` key across
its eight states". `speed` is a required field on that object literal, so every call site has to be
filled, and `bottom-bar-state-machine.cy.ts` calls it **ten** times: the eight named states plus
`:204` ("Fireline armed") and a second call inside the state-8 test at `:241`, which asserts the bar
*before* the wizard opens. Neither appears in the table, so an implementer working from it has two
values to guess at the point the file stops compiling.

Both were measured rather than derived. With the `speed` key added and the assertion the step
specifies, all ten sites pass at: Fireline armed **true** (the run is in progress, so `ready` holds),
and state 8 pre-open **true** (the spark is placed and `showTerrainUI` is still false). Full run:
11 of 11 passing.

**Decision**: accepted and applied, 2026-08-30. The table is now keyed by call site rather than by
state number, so it maps one-to-one onto the edits, and the step says ten.

---

### Senior Engineer

#### RESOLVED: The stale-prose list for `bottom-bar-visuals.cy.ts` misses two inline comments
The step names the file header's "three abutting bubble seams", the test name's "eight widget
groups", and the viewport comment's 576. Two more sites in the same file quote the contract this
story changes and are not listed:

- `:55`, inside the `.mainContainer` test: *"this is the sum of the **eight** widget widths, their gaps, and the trailing widgetGroup margin"*.
- `:72-76`, inside the gap test: *"the **Spark, Restart and Fireline** widgetGroups carry margin-right:0 ... the designer wants for **Spark <-> Restart, Restart <-> Start, and Fireline <-> Helitack**"*. Start joins that list and Start <-> Speed joins the seam list.

Both fail silently, which is the half the step already says it is including for that reason. Grep for
`eight`, `three abutting` and `Spark <-> Restart` in that file returns exactly these five sites.

**Decision**: accepted and applied, 2026-08-30. The step now carries all five prose sites as a table
with what each becomes, keyed to the grep that produces them, rather than naming three of them in
passing alongside the assertion changes.

---

#### RESOLVED: The step-2 component imports `log` and does not use it until step 3
`speed-control.tsx` as written in the rendering step opens with `import { log } from "../log";`, but
that step's `handleChange` only calls `setSpeedIndex`; the `log()` call arrives in the logging step.
As its own commit the file carries an unused import, which is
`@typescript-eslint/no-unused-vars` (a warning, and CI does not run lint, so nothing catches it).
The steps are meant to be independently reviewable, and this is the kind of thing a reviewer flags.

**Decision**: accepted and applied, 2026-08-30. The import moves to the logging step, next to the
`log()` call that needs it, so each step's version of the file is self-consistent. Nothing in the
pipeline was going red over it (the rule is a warning, `npm run lint` exits 0 on warnings, `ci.yml`
does not run lint, and `ts-loader` is `transpileOnly`); the point is that the rendering step should
stand up as its own reviewable commit, which is what the step structure is for.

---

### Product Manager

#### RESOLVED: `Mui-focusVisible` latches after a mouse gesture, so the board's Hover state is unreachable after the first click
The Hover / Select requirement pins the two ring alphas from the board's four-state column (Hover
0.5, Select 1.0) and pairs each with the bubble color. The stylesheet binds the 1.0 ring to
`:active, .Mui-active, .Mui-focusVisible`, which is verbatim what `wind-circular-control.scss:125-128`
and `vertical-selectors.scss` already do. On those two it is invisible, because neither control's
container changes color. On Speed it is not.

Measured in Chrome on the built control, reading the group's background and the thumb's computed
`box-shadow` after each gesture settles:

| State | bubble | thumb ring | `Mui-focusVisible` |
|---|---|---|---|
| Pristine, pointer away | `rgb(255,255,255)` | none | no |
| Hover, before any click | `rgb(223,223,223)` | `rgba(255,255,255,0.5) 0 0 0 4px` | no |
| Mid-drag, pointer off the bubble | `rgb(223,223,223)` | `rgb(255,255,255) 0 0 0 4px` | (`Mui-active`) |
| **After a click, pointer away** | `rgb(255,255,255)` | **`rgb(255,255,255) 0 0 0 4px`** | **yes** |
| **Hover after a click** | `rgb(223,223,223)` | **`rgb(255,255,255) 0 0 0 4px`** | **yes** |
| Hover after clicking elsewhere to blur | `rgb(223,223,223)` | `rgba(255,255,255,0.5) 0 0 0 4px` | no |

MUI leaves `Mui-focusVisible` on the thumb after a *mouse* gesture, not only a keyboard one, until
the hidden input blurs. So from the first click until the student touches something else, the board's
Hover row cannot be reached: hovering paints the Select ring. At rest the ring is white on a white
bubble and therefore invisible, which is why the earlier verification pass did not see it.

The `:has(:global(.Mui-active))` rule is confirmed working and is not what is at issue: measured
mid-drag with the pointer 80px above the bar, the bubble holds `rgb(223,223,223)` while `:hover` is
false, which is exactly what that rule was added for.

**Decision**: keep the CSS, record the latch. Doug, 2026-08-30. Dropping `:global(.Mui-focusVisible)`
would restore the board's Hover row but would make Speed the one slider in the repo whose thumb
states differ from the other two, for a difference visible only in a state the board does not draw.
The measured table is now in the Hover/Select requirement, and the stylesheet carries a comment
saying the class is in the Select group on purpose, so the divergence is not read later as a
regression. It is one line to flip if Michael wants the board's row back; raise it in PR review
alongside the `showTerrainUI` term.

---

### Verified correct, and not worth re-opening

Recorded so the pass is auditable and these are not re-derived later.

- **The model step builds and its tests pass as written.** `speed.test.ts` transcribed verbatim: 5 of 5 passing, including the folded 6x bound (`computeTimeStep(config, 6, Infinity)` gives a 71.80-minute ceiling and a `timeInHours` jump of 2, so the hour test is falsifiable).
- **No existing Jest test needs changing.** With the whole plan applied, `npx jest` gives 1022 of 1022 across 82 suites, matching the recorded baseline exactly (the earlier 1025/83 in this pass was the draft boundary file still in the tree).
- **Every Cypress number is right.** Untouched, `bottom-bar-visuals.cy.ts` fails exactly two assertions: `.mainContainer` 674 against 576, and the `Start -> Fireline` gap at 101. With the step's edits applied verbatim, all 9 pass, including `widgetRect("speed-control")` at **99**, `Start -> Speed` at **-1** and `Speed -> Fireline` at **3**. `bottom-bar-state-machine.cy.ts` passes 11 of 11 untouched.
- **`:has(:global(.Mui-active))` compiles as claimed.** Built through the real loader chain: `.speedControl:has(.Mui-active)`, local class hashed, MUI's global one left alone.
- **The rendered geometry reproduces the board.** Relative to the 97px content box: rail (21, 36) 55 x 1, ticks centered at 21 / 48.5 / 76, thumb (36.5, 24.5) 24 x 24, labels at y 49 h 17 with widths 26.3 / 15.7 / 15.2, weights 400 / **700** / 400, all `rgb(67,67,67)` at 14px, `.mark:after` 24 x 24 at -10 / -10. Dropping the `.speedControl` flex wrapper and hanging the rules off `.content` changes nothing measurable.
- **The disabled treatment is as specified.** After a real Clear All: content `opacity: 0.35`, bubble `rgb(255,255,255)`, border `rgb(121,121,121)`, `hoverable` absent, input `disabled`, `pointer-events: none`.
- **The gesture table reproduces exactly.** Clicking the selected tick emits **0** on the thumb and 0 at 8px off it; a different tick emits 1; a drag across all three emits **2**; out and back emits **4**; an arrow key emits 1 and emits **0** at the end of the rail. A click 8px below the rail selects the tick, so the `:after` hit box does what it is there for.
- **`track={false}` is load-bearing and the test catches its removal.** At index 2 the shipped component gives one active label; the same component with the prop deleted gives `MuiSlider-markLabelActive` on all three.
- **The `SimulationStarted` keys arrive.** Driven through `BottomBar`, the payload carries `speedMultiplier: 1` and `speedLabel: "1x"`.
- **`speed-control.test.tsx` needs no `jest.mock("../log")`.** It renders without interacting, so the real module loads and never fires.
- **`setInputParamsFromConfig()` is the right seam.** It is called only from `load()` (`simulation.ts:338`) and `reload()` (`:449`), so the reset lands on Clear All and on construction and nowhere else.
- **State 7 really is disabled.** `plainsTwoZone` declares no `sparks`, so `config.sparks` falls back to the empty default and Clear All leaves `ready` false. A preset that does declare sparks would keep Speed enabled after Clear All, but so would Start, so the bar stays self-consistent.
