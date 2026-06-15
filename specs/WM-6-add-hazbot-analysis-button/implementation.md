# Implementation Plan: Hazbot — Add Hazbot Analysis Button

**Jira**: https://concord-consortium.atlassian.net/browse/WM-6
**Requirements Spec**: [requirements.md](requirements.md)
**Status**: **In Development**

## Implementation Plan

This plan delivers the WM-6 Hazbot Analysis button as three independently-reviewable
commits, building strictly in order:

1. **UI state** — the observable pulse / feedback flags on `UIModel` (no UI yet, fully
   unit-testable in isolation).
2. **The button component** — `HazbotButton` (presentation + four states) plus its styles
   and the avatar asset, rendered against the state from step 1.
3. **Bottom-bar integration** — mount the button (provider-wrapped, gated on a loaded
   rule-set), and wire the run-lifecycle arming / reset / click logging.

All run-lifecycle behavior this plan relies on was verified against current source
(`bottom-bar.tsx`, `simulation.ts`, `app.tsx`, `evaluator.ts`, `engine-singleton.ts`);
the AP-79 button visuals were read from the Zeplin board. See the cross-references in
each step.

### Decision: pulse-arming mechanism (single observable flag + a burnout reaction)

The "ready" pulse needs to arm on two completion events that are **not** distinguishable
by run-state alone:

- **Manual Stop** (the Start→Stop toggle in `handleStart`, [bottom-bar.tsx:216-217](../../src/components/bottom-bar.tsx#L216-L217)) and a **Fire Line pause** ([handleFireLine](../../src/components/bottom-bar.tsx#L293), `simulation.stop()` at line 297) both leave exactly `simulationStarted && !simulationRunning && !simulationEnded` — identical tuples. Only the *handler that ran* tells them apart. So manual-Stop arming must happen **in the handler**, not be derived from state.
- **Natural burnout** sets `simulation.simulationEnded` true ([simulation.ts:136](../../src/models/simulation.ts#L136)) — this one *is* a distinct observable, so a `reaction` on it can arm the flag.

The chosen design is a single `@observable hazbotPulseArmed` boolean on `UIModel`:

- **Set true** by (a) the manual-Stop branch of `handleStart`, and (b) a MobX `reaction` on `simulation.simulationEnded` becoming true (registered in `BottomBar.componentDidMount`, disposed in `componentWillUnmount`).
- **Set false** by (a) the click that opens feedback, and (b) the Start path of `handleStart` (resetting any stale arm before the next run).
- A Fire Line pause sets it via **neither** path, so the pulse stays off mid-intervention — the exact exclusion the requirements call for.

The pulse-visible predicate, evaluated inside the `observer` button, is then simply:

```ts
hazbotPulseArmed && simulation.simulationStarted && !simulation.simulationRunning
```

The `simulationStarted` term auto-hides a stale arm after Restart/Reload (both clear
`simulationStarted` without routing through `start()`, [simulation.ts:402-404](../../src/models/simulation.ts#L402) / [428-434](../../src/models/simulation.ts#L428)), and the stale flag is reset on the next Start — matching the resolved
ready-state Decision and Round-2 QA / Round-2 SE self-review items. An alternative
(fold `simulationEnded` into the predicate + a separate `acknowledged` flag, no reaction)
is noted in Open Questions; the single-flag form is preferred because it keeps one source
of truth and a trivial predicate.

The flag lives on `UIModel` (not a `BottomBar` field/closure) so the `observer` button
re-renders on flips — required because `BottomBar` is a class component and the button is
a function-component `observer` child (Technical Notes, MobX).

---

### Add Hazbot pulse + feedback state to `UIModel`

**Summary**: Introduce the two observable booleans WM-6 owns — `showHazbotFeedback`
(the sibling-panel contract, Decision A) and `hazbotPulseArmed` (the run-complete pulse
flag). No UI consumes them yet; this commit is pure model state plus unit tests, so the
pulse/feedback transitions are testable before any rendering exists.

**Files affected**:
- `src/models/ui.ts` — add two `@observable` flags.
- `src/models/ui.test.ts` — **new** unit test for default values + transitions.

**Estimated diff size**: ~70 lines.

Matches the existing direct-assignment idiom (`showChart`, `showTerrainUI`); no action
methods, consistent with Decision A ("toggled by direct assignment").

```ts
// src/models/ui.ts — add inside class UIModel, alongside the existing flags
export class UIModel {
  @observable public showChart = CHART_TAB_INITIAL_OPEN;
  @observable public showTerrainUI = false;
  @observable public terrainUISelectedZone?: number = undefined;
  @observable public maxSparks: number;

  @observable public interaction: Interaction | null = null;
  @observable public dragging = false;

  // WM-6 Hazbot button. `showHazbotFeedback` is the contract the sibling WM-11
  // panel story reads (set true on button click); WM-6 does not render the panel.
  @observable public showHazbotFeedback = false;
  // True once a run has "completed" (manual Stop or natural burnout) and the
  // student has not yet clicked the Hazbot button. Drives the ready/pulse state
  // together with simulationStarted && !simulationRunning. Reset on the next
  // Start and on the click that opens feedback. A Fire Line pause does NOT set
  // it (mid-intervention), so the pulse stays off during a fire-line pause.
  @observable public hazbotPulseArmed = false;

  constructor() {
    makeObservable(this);
  }
}
```

```ts
// src/models/ui.test.ts — new file
import { UIModel } from "./ui";

describe("UIModel Hazbot flags", () => {
  it("defaults both Hazbot flags to false", () => {
    const ui = new UIModel();
    expect(ui.showHazbotFeedback).toBe(false);
    expect(ui.hazbotPulseArmed).toBe(false);
  });

  it("flags are observable (direct assignment flips them)", () => {
    const ui = new UIModel();
    ui.hazbotPulseArmed = true;
    ui.showHazbotFeedback = true;
    expect(ui.hazbotPulseArmed).toBe(true);
    expect(ui.showHazbotFeedback).toBe(true);
  });
});
```

---

### Add the `HazbotButton` component, styles, and avatar assets (with random blink)

**Summary**: A self-contained presentational `observer` function component that renders
the layered avatar + two-line "Hazbot / Analysis" label, applies the AP-79 states
(default / ready-pulse / hover / select) **plus the random blink**, and owns its own
click handler (set `showHazbotFeedback`, clear the pulse, log `HazbotButtonClicked` with
the matched category). It reads run-state and the pulse flag via `useStores()`. It does
**not** consume `useAnalysisEngine()`; its only engine touch is the pure
`computeMatchedCategoryForEngine(getAnalysisEngine())` call at click time for the log
payload. The blink is local presentation state — no store/engine coupling.

**Files affected**:
- `src/assets/bottom-bar/hazbot-back.svg`, `hazbot-eyes.svg`, `hazbot-blinks.svg` — **new** avatar layers exported from AP-79 (`Hazbot Button - Back/Eyes/Blinks`, all `svg@1x`).
- `src/components/hazbot-button.tsx` — **new** component.
- `src/components/hazbot-button.scss` — **new** styles incl. the pulse keyframes + layered-avatar positioning.
- `src/components/hazbot-button.test.tsx` — **new** render/state/click/blink tests.

**Estimated diff size**: ~270 lines (excluding the SVG assets).

**AP-79 specs folded in** (Zeplin board, read 2026-06-15):
- Button group: 122 × 48; avatar placement 48 × 48 (art ≈ 47 × 44); label "Hazbot\nAnalysis", Lato 16px / weight 700, color `#222222`.
- Default state: rounded `#c1daff` (light blue) button background ("Button back" layer).
- Ready/pulse: an animated rounded-rect **outline** emanating from the button edge — **not an exportable asset** (zero assets under "Pulse Animation"; it's 5 onion-skinned vector frames). Each frame measured: 122×48, `border-radius: 10px`, `5px solid #0050c4` outside border, `#c1daff` fill, `opacity: 0.25`. Built in code as a bordered ring that scales up + fades out (`#0050C4` → transparent/white per the note); rendered as a Button sibling so it isn't clipped.
- Hover / Select: measured from the "Hazbot Button States" artboard — Default `#c1daff`, Hover `#a4c7f9`, Select (pressed) `#80aff5` (same three fills on the 122×48 and 135×69 variants). Label color `#222222` in all states.
- **Random blink** (AP-79 sketch): random idle `1000 + Math.random()*2500` ms → eyes closed (`Blinks`) for 180 ms → 80 ms pause → loop. Eyes layer (`Eyes`) shows when open. Hardened with a mounted guard so the recursive `setTimeout` never calls `setBlink` after unmount (the raw board sketch only clears the outermost timeout).

```tsx
// src/components/hazbot-button.tsx — new file
import React, { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import Button from "@mui/material/Button";
import { useStores } from "../use-stores";
import { log } from "../log";
import { getAnalysisEngine } from "../hazbot/wildfire";
import { computeMatchedCategoryForEngine } from "../hazbot/engine";
import HazbotBack from "../assets/bottom-bar/hazbot-back.svg";
import HazbotEyes from "../assets/bottom-bar/hazbot-eyes.svg";
import HazbotBlinks from "../assets/bottom-bar/hazbot-blinks.svg";

import css from "./hazbot-button.scss";

export const HazbotButton = observer(function HazbotButton() {
  const { ui, simulation } = useStores();

  // Random blink (AP-79). Local presentation state only — no store/engine coupling.
  // Recursive setTimeout cycle; the mounted ref hardens the board sketch so no
  // setBlink fires after unmount.
  const [blink, setBlink] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    let timeout: ReturnType<typeof setTimeout>;
    const loop = () => {
      if (!mounted.current) return;
      timeout = setTimeout(() => {
        if (!mounted.current) return;
        setBlink(true);                    // eyes closed
        timeout = setTimeout(() => {
          if (!mounted.current) return;
          setBlink(false);                 // eyes open
          timeout = setTimeout(loop, 80);  // small pause, then restart
        }, 180);
      }, 1000 + Math.random() * 2500);     // random idle before next blink
    };
    loop();
    return () => { mounted.current = false; clearTimeout(timeout); };
  }, []);

  // Ready/pulse predicate. The simulationStarted term keeps the pulse off in the
  // pre-run / terrain-setup state and auto-hides a stale arm after Restart/Reload
  // (both clear simulationStarted without routing through start()).
  const pulsing =
    ui.hazbotPulseArmed && simulation.simulationStarted && !simulation.simulationRunning;

  const handleClick = () => {
    // Sibling-panel contract (WM-11 reads this); WM-6 does not render the panel.
    ui.showHazbotFeedback = true;
    // Acknowledge the run — stop pulsing until the next run completes.
    ui.hazbotPulseArmed = false;
    // Log the request with the matched category, consistent with the other
    // bottom-bar *ButtonClicked events. Pure engine read (no hook/provider).
    // computeMatchedCategoryForEngine returns number | null; carry null explicitly.
    // NOTE: log() routes EVERY event through engine.consume() (log.ts). This event
    // reaches the engine like any other, but is a deliberate no-op via translate()'s
    // `default` branch — it must stay unhandled in translate.ts, otherwise the click
    // would mutate the matched category it just reported. We read matchedCategory
    // BEFORE log() regardless, so the payload reflects pre-click state.
    const engine = getAnalysisEngine();
    const matchedCategory = engine ? computeMatchedCategoryForEngine(engine) : null;
    log("HazbotButtonClicked", { matchedCategory });
  };

  return (
    // Wrapper is the positioning context; the pulse rings are SIBLINGS of the
    // Button (not children) so the button's content box can't clip them as they
    // scale past the button edge. The `ready` class on the wrapper gates the rings.
    <div className={`${css.hazbotButtonWrap} ${pulsing ? css.ready : ""}`}>
      {pulsing && <>
        <span className={css.pulse} aria-hidden="true" />
        <span className={css.pulse} aria-hidden="true" />
      </>}
      <Button
        className={css.hazbotButton}
        data-testid="hazbot-button"
        onClick={handleClick}
        disableRipple={true}
        disableTouchRipple={true}
      >
        <span className={css.inner}>
          <span className={css.avatar}>
            <HazbotBack />
            {blink
              ? <HazbotBlinks className={css.eyes} data-testid="hazbot-blinks" />
              : <HazbotEyes className={css.eyes} data-testid="hazbot-eyes" />}
          </span>
          <span className={css.label}>Hazbot<br />Analysis</span>
        </span>
      </Button>
    </div>
  );
});
```

```scss
// src/components/hazbot-button.scss — new file
@import "common.scss";

// Positioning context for the pulse rings; lets them overflow the button box.
.hazbotButtonWrap {
  position: relative;
  display: inline-flex;
  overflow: visible;             // rings scale past the 122×48 button edge
}

.hazbotButton {
  // 122 x 48 per AP-79; reset MUI Button defaults.
  position: relative;
  z-index: 1;                    // button sits above the pulse rings
  min-width: 122px;
  width: 122px;
  height: 48px;
  padding: 0;
  text-transform: none;
  // AP-79 default "Button back". !important: MUI's emotion-generated base button
  // background is injected AFTER this static SCSS and wins on equal specificity
  // (same source-order battle documented for .playbackButton min-width in
  // bottom-bar.scss). Confirm the rendered fills in DevTools per the repo's
  // MUI-override convention.
  background: #c1daff !important;
  border-radius: 6px;

  .inner {
    display: flex;
    align-items: center;
    width: 100%;
    height: 100%;
  }

  .avatar {
    position: relative;            // anchor for the absolutely-stacked eyes layer
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    svg { width: 47px; height: 44px; }
    // Eyes / Blinks layer sits on top of Back, same box.
    .eyes { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); }
  }

  .label {
    margin-left: 3px;
    font-family: Lato, sans-serif;
    font-size: 16px;
    font-weight: 700;
    line-height: 19px;
    color: #222;
    text-align: left;
  }

  // Hover / Select — exact AP-79 "Button back" fills (Hazbot Button States artboard).
  // !important for the same MUI-emotion source-order reason as the default fill above.
  &:hover { background: #a4c7f9 !important; }
  &:active { background: #80aff5 !important; }   // Select / pressed
}

// Ready: pulsing OUTLINE emanating from the button edge (AP-79). Read off the
// "Pulse Animation" frames: a 122×48 rounded rect, border-radius 10px,
// 5px solid #0050c4 outline, #c1daff fill, that scales up and fades out. NOT a
// box-shadow — the board draws a bordered rounded rect that grows past the
// button edge. Rendered as a sibling of the <Button> (see component) so it is
// NOT clipped by the button's content box; the widgetGroup/bottom-bar must allow
// it to overflow upward. Multiple staggered rings give the continuous pulse.
.hazbotButtonWrap.ready .pulse {
  position: absolute;
  inset: 0;                      // covers the 122×48 button, then scales out
  z-index: 0;                    // behind the button (which is z-index:1)
  border-radius: 10px;
  border: 5px solid #0050c4;     // accent; fades toward transparent/white over the cycle
  pointer-events: none;
  transform-origin: center;
  animation: hazbotPulse 1.6s ease-out infinite;
}
// Second ring, delayed, for the continuous emanating effect (mirrors the
// 5 onion-skinned frames on the board).
.hazbotButtonWrap.ready .pulse:nth-child(2) { animation-delay: 0.8s; }

@keyframes hazbotPulse {
  0%   { transform: scale(1);    opacity: 0.5; }
  100% { transform: scale(1.35); opacity: 0; }
}
```

```tsx
// src/components/hazbot-button.test.tsx — new file (sketch; uses the project's
// existing render harness — Provider + stores, mirroring other component tests)
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { Provider } from "mobx-react";
import { HazbotButton } from "./hazbot-button";
import { createStores } from "../models/stores";
import * as logModule from "../log";

// getAnalysisEngine returns undefined when no URL flags are set (jsdom), so the
// click path logs matchedCategory: null — exactly the pre-run/no-engine contract.

function renderWithStores(stores = createStores()) {
  return { stores, ...render(<Provider stores={stores}><HazbotButton /></Provider>) };
}

it("renders the avatar + two-line label", () => {
  renderWithStores();
  expect(screen.getByTestId("hazbot-button")).toHaveTextContent("HazbotAnalysis");
});

it("shows the ready/pulse state only when armed && started && !running", () => {
  const { stores } = renderWithStores();
  // The `ready` class AND the .pulse rings live on the WRAPPER div, not the
  // <Button> that carries data-testid. Assert on the wrapper (identity-obj-proxy
  // makes css.hazbotButtonWrap === "hazbotButtonWrap", so the selector resolves).
  const wrap = () => screen.getByTestId("hazbot-button").closest(".hazbotButtonWrap")!;
  expect(wrap().className).not.toMatch(/ready/);
  expect(document.querySelectorAll(".pulse").length).toBe(0);
  stores.simulation.simulationStarted = true;
  stores.simulation.simulationRunning = false;
  stores.ui.hazbotPulseArmed = true;
  expect(wrap().className).toMatch(/ready/);
  expect(document.querySelectorAll(".pulse").length).toBe(2);
  // A run in progress hides the pulse.
  stores.simulation.simulationRunning = true;
  expect(wrap().className).not.toMatch(/ready/);
  expect(document.querySelectorAll(".pulse").length).toBe(0);
});

it("click sets showHazbotFeedback, clears the pulse, and logs HazbotButtonClicked", () => {
  const logSpy = jest.spyOn(logModule, "log");
  const { stores } = renderWithStores();
  stores.ui.hazbotPulseArmed = true;
  fireEvent.click(screen.getByTestId("hazbot-button"));
  expect(stores.ui.showHazbotFeedback).toBe(true);
  expect(stores.ui.hazbotPulseArmed).toBe(false);
  expect(logSpy).toHaveBeenCalledWith("HazbotButtonClicked", { matchedCategory: null });
});

it("blinks on the AP-79 schedule (fake timers + fixed random)", () => {
  jest.useFakeTimers();
  jest.spyOn(Math, "random").mockReturnValue(0); // idle = 1000ms exactly
  renderWithStores();
  // Eyes-open layer present initially; blink layer absent.
  expect(document.querySelector('[data-testid="hazbot-blinks"]')).toBeNull();
  act(() => { jest.advanceTimersByTime(1000); });   // idle elapses → eyes closed
  expect(document.querySelector('[data-testid="hazbot-blinks"]')).not.toBeNull();
  act(() => { jest.advanceTimersByTime(180); });     // blink ends → eyes open
  expect(document.querySelector('[data-testid="hazbot-blinks"]')).toBeNull();
  jest.useRealTimers();
});

it("stops the blink loop on unmount (no setState after unmount)", () => {
  jest.useFakeTimers();
  const errSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
  const { unmount } = renderWithStores();
  unmount();
  act(() => { jest.advanceTimersByTime(5000); });    // any pending timers fire post-unmount
  expect(errSpy).not.toHaveBeenCalled();             // no "set state on unmounted" warning
  jest.useRealTimers();
});
```

> The blink layers carry `data-testid` (`hazbot-eyes` / `hazbot-blinks`) on their SVG
> wrappers so the tests can assert which is mounted without depending on SVG internals.

---

### Mount the button in `BottomBar` and wire run-lifecycle arming

**Summary**: Render `HazbotButton` in the bottom control row, gated on a **loaded
rule-set** (`getAnalysisEngine()?.ruleSet`) and wrapped in an `AnalysisEngineProvider`
(forward-looking, so the sibling WM-11 panel can consume `useAnalysisEngine()` here
without re-plumbing). Wire the three lifecycle hooks: arm on manual Stop, reset on Start,
and a burnout `reaction` that arms on `simulationEnded`.

**Files affected**:
- `src/components/bottom-bar.tsx` — import + render the provider-wrapped button; arm in the manual-Stop branch; reset in the Start branch; register/dispose the burnout reaction.
- `src/components/bottom-bar.scss` — placement for the new `widgetGroup` (relative to the centered controls / Fire Intensity Scale per AP-79).
- `cypress/e2e/bottom-bar-state-machine.cy.ts` (or a Jest integration test) — assert gating + arm/clear transitions across Start → Stop → click and the Fire Line exclusion.

**Estimated diff size**: ~140 lines.

**Gating** ([engine-singleton.ts:33](../../src/hazbot/wildfire/engine-singleton.ts#L33)): `getAnalysisEngine()` is non-undefined for sidebar-only sessions and even for an *invalid* `?hazbotRules` id (engine built with `ruleSet: undefined`). Gate specifically on `engine?.ruleSet` being defined, mirroring how `app.tsx` / the sidebar branch — so `?hazbotRules=99` renders no button. This is a plain singleton call, valid inside the class component's `render`.

```tsx
// src/components/bottom-bar.tsx

// new imports
import { reaction, IReactionDisposer } from "mobx";
import { AnalysisEngineProvider } from "../hazbot/engine";
import { APP_RULES_VERSION, getAnalysisEngine } from "../hazbot/wildfire";
import { HazbotButton } from "./hazbot-button";

// instance field on BottomBar
private hazbotPulseReactionDisposer?: IReactionDisposer;

// componentDidMount — arm the pulse on natural burnout. simulationEnded is a
// computed (started && !running && fireDidStop); arming here (not from bare
// !simulationRunning) is what excludes the Fire Line pause and manual-Stop-vs-
// burnout ambiguity. Manual Stop is armed in handleStart instead.
public componentDidMount() {
  /* ...existing screenfull + test-ref wiring... */
  const { simulation, ui } = this.stores;
  this.hazbotPulseReactionDisposer = reaction(
    () => simulation.simulationEnded,
    (ended) => { if (ended) ui.hazbotPulseArmed = true; }
  );
}

public componentWillUnmount() {
  /* ...existing... */
  this.hazbotPulseReactionDisposer?.();
}
```

```tsx
// handleStart — arm on manual Stop; reset on Start
public handleStart = () => {
  const { ui, simulation } = this.stores;
  if (simulation.simulationRunning) {
    simulation.stop();
    ui.hazbotPulseArmed = true;            // manual Stop counts as "a run completed"
    log("SimulationStopped", { outcome: simulation.getOutcomeData(this.stores.chartStore) });
  } else {
    ui.showTerrainUI = false;
    ui.hazbotPulseArmed = false;           // clear any stale arm before the next run
    /* ...existing configSnapshot build + log("SimulationStarted") + simulation.start()... */
  }
};
```

```tsx
// render() — add a widgetGroup as the LAST child of mainContainer (after the
// Fire Intensity Scale group), so it renders rightmost in both layouts —
// FIS-shown and FIS-hidden (showBurnIndex). Per AP-79 the Hazbot button is the
// rightmost control. engine is captured once; the gate is engine?.ruleSet
// (loaded rule-set), not engine existence and not the bare ?hazbotRules param.
{(() => {
  const engine = getAnalysisEngine();
  return engine?.ruleSet ? (
    <div className={`${css.widgetGroup} ${css.hazbotButton}`}>
      <AnalysisEngineProvider engine={engine} appRulesVersion={APP_RULES_VERSION}>
        <HazbotButton />
      </AnalysisEngineProvider>
    </div>
  ) : null;
})()}
```

```scss
// src/components/bottom-bar.scss — placement modifier for the Hazbot widgetGroup
.hazbotButton {
  // Rightmost control: last child of mainContainer, after the Fire Intensity Scale
  // group. Renders rightmost in both FIS-shown and FIS-hidden layouts. Exact
  // horizontal gap confirmed via screenshot-vs-board compare during Step 3
  // (visual-confirm convention), not a pixel value lifted from a duplicated mock.
  display: flex;
  align-items: center;
}
```

**Integration test coverage** — split per the repo's existing bottom-bar convention (OQ #4 = C):

*Jest* (extend `bottom-bar.test.tsx` — reuse its existing `seedState(stores, 1..6)` + `mockEngine({ fireDidStop })` helpers, don't hand-roll state — all the logic):
- With `?hazbotRules=23`: button renders; with `?hazbotRules=99` (invalid) and no other flag: button does **not** render (gate is `engine?.ruleSet`).
- Start → Stop (manual) arms the pulse; clicking the button clears it and sets `showHazbotFeedback`.
- Start → Fire Line pause does **not** arm the pulse (the exclusion).
- Restart after a completed run hides the pulse (via the `simulationStarted` guard) without an explicit clear.
- **Burnout arms the pulse**: `simulationEnded` is computed from `simulation.engine?.fireDidStop` ([simulation.ts:136](../../src/models/simulation.ts#L136)) — not writable, and `engine` is **not** observable ([simulation.ts:37](../../src/models/simulation.ts#L37)), so only `simulationRunning` carries the reactivity edge. Mount the bar at running (armed=false), then **inside one `act()` assign the stopped engine FIRST, then flip the run flag**: `(simulation as any).engine = mockEngine({ fireDidStop: true });` then `simulation.simulationRunning = false;`. Order matters — flipping `simulationRunning` first (engine still `fireDidStop:false`) leaves `simulationEnded` false, and the later non-observable engine swap never re-triggers the computed, so the `reaction` never sees the false→true edge and the test silently false-negatives. This mirrors production `tick()`, which has `engine.fireDidStop === true` before it sets `simulationRunning = false` ([simulation.ts:482-489](../../src/models/simulation.ts#L482-L489)).

> Test-harness fidelity: `createStores()` + `<Provider stores={stores}>` match the repo; `act` is imported from `react-dom/test-utils` (not `@testing-library/react`) — adjust the blink test's import accordingly.

*Invariant guard* (small test, `translate.test.ts` or the engine test): consuming a `HazbotButtonClicked` event leaves `engine.readings.length` **and** the matched category unchanged — pins the "click is a no-op in the engine" invariant so a future `translate()` case can't silently start mutating the matched category the click reports.

*Cypress* (one added case in `bottom-bar-state-machine.cy.ts` — the real-run `@observer` wiring): with `?hazbotRules=23`, drive a live Start → Stop and assert the pulse class appears on `[data-testid="hazbot-button"]`, then click it and assert the class clears. This is the one assertion jsdom can't truly exercise.

---

## Open Questions

<!-- Implementation-focused questions only. Requirements questions live in requirements.md. -->

### RESOLVED: Pulse-arming mechanism — single flag + burnout reaction, or predicate-folded `simulationEnded`?
**Context**: Two equivalent ways to drive the ready/pulse state (the plan uses A).
**Options considered**:
- A) One `hazbotPulseArmed` flag, set by the manual-Stop handler **and** a `reaction` on `simulation.simulationEnded`; predicate is `armed && started && !running`. One source of truth, trivial predicate, costs a reaction + disposer in `BottomBar`.
  - Sub-variant: arm inside the **existing** app.tsx burnout reaction instead of a new one (DRYer, but spreads WM-6 logic into app.tsx).
- B) No reaction: fold `simulationEnded` into the predicate — `(manualStopArmed || simulationEnded) && started && !running && !acknowledgedThisRun` — with a separate `acknowledgedThisRun` flag cleared on Start. Avoids the reaction but needs two flags and a more complex predicate.

**Decision**: **A**, with the reaction living in `BottomBar` (not the app.tsx sub-variant). Keeps a single observable source of truth and the simplest predicate, and co-locates all pulse logic with the button it belongs to. Verified the trigger sites are deterministic — manual Stop ([bottom-bar.tsx:216-217](../../src/components/bottom-bar.tsx#L216)) leaves `simulationEnded` false (must arm in-handler); burnout ([simulation.ts:486-487](../../src/models/simulation.ts#L486)) flips `simulationEnded` true (reaction-detectable). The plan above already reflects this.

### RESOLVED: Hazbot avatar asset — source, format, and layer composition
**Context**: `find src/assets -iname "*hazbot*"` returns nothing; the avatar art must be added to the repo. Verified the repo pipeline is SVG-native (`@svgr/webpack` [webpack.config.js:74-84](../../webpack.config.js#L74) + `*.svg` decl [global.d.ts:4](../../src/global.d.ts#L4); every bottom-bar icon is a single `.svg` component). On the Zeplin side the avatar is **not** a single flattened asset — AP-79 exports it as three separate layers, each available as `svg@1x`: `Hazbot Button - Back`, `Hazbot Button - Eyes`, `Hazbot Button - Blinks`. That decomposition exists to drive the random blink.
**Options considered**:
- A) Ask the designer for one flattened `hazbot.svg` (Back+Eyes); import as a single component. Cleanest repo fit but needs a designer round-trip.
- B) Export the sub-layer SVGs (already available today) and stack them with absolute positioning in the component. No round-trip; sets up the blink animation directly.
- C) Temporary placeholder glyph, real export as a pre-merge follow-up.

**Decision**: **B, and support the random blink now** (see the related requirements update). Both the static layers (`Back`, `Eyes`) and the `Blinks` frame are already exportable as `svg@1x`, so stacking them unblocks us immediately and the blink is a self-contained ~25-line `useEffect` with no store/engine/run-lifecycle coupling. This reverses the earlier "defer blink" scope line (requirements.md "Which button animations" decision + Out of Scope), confirmed for pull-forward. The component renders `Back` always, then `Eyes` (open) or `Blinks` (closed) by the `blink` state. The unmount cleanup is hardened beyond AP-79's raw sketch (a mounted guard so no `setBlink` fires after unmount).

### RESOLVED: Hover and Select exact visual values
**Context**: AP-79 defines distinct Default / Hover / Select button states. Found the explicit fills on the "Hazbot Button States" artboard (the `Button back` shapes line up with the `Hover` / `Select…` labels by y-position; identical across the 122×48 and 135×69 variants).
**Options considered**:
- A) Measure the exact Hover / Select fills from AP-79 now and bake them into `hazbot-button.scss`.
- B) Ship `darken(#c1daff, …)` placeholders and refine later.

**Decision**: **A** — measured and baked in: Default `#c1daff`, Hover `#a4c7f9`, Select (pressed) `#80aff5`; label `#222222` in all states. No measurement debt.

### RESOLVED: Test layer for the bottom-bar integration — Jest or Cypress?
**Context**: The bottom bar already maintains **both** layers with a documented split — [bottom-bar.test.tsx](../../src/components/bottom-bar.test.tsx) (Jest/RTL) for component logic and [bottom-bar-state-machine.cy.ts](../../cypress/e2e/bottom-bar-state-machine.cy.ts), whose header states it exists to catch full-page reactivity / `@observer` / build-tooling breaks the RTL tests can't. Jest tests in this repo already drive `?hazbotRules` gating ([app.test.tsx](../../src/components/app.test.tsx), [engine-singleton.test.ts](../../src/hazbot/wildfire/engine-singleton.test.ts)); the bottom bar needs no WebGL.
**Options considered**:
- A) Jest only — fast, covers gating/arm/clear/click/blink; misses the real-run `@observer` pulse re-render.
- B) Cypress only — real run loop but slow, WebGL-gated, clumsy for log-payload/null assertions.
- C) Both, per the repo's existing split — Jest for all logic; one thin Cypress case for the rendered pulse across a live run.

**Decision**: **C** — matches the bottom bar's existing Jest-owns-logic / Cypress-owns-real-run-wiring division. All arm/clear/gating/click/blink assertions stay in fast Jest; one added case in the state-machine spec proves the pulse class appears after a live Start→Stop and clears on click.

## Self-Review

<!-- Phase 3 Step 2. Each issue deep-dived against current source / the AP-79 board
     before being recorded; processed one at a time. -->

### Senior Engineer / QA

#### RESOLVED: Button placement within the control row was under-specified
The plan said "add a `widgetGroup`" without pinning where in the flex row it goes, and the Fire Intensity Scale renders conditionally (`simulation.config.showBurnIndex`, [bottom-bar.tsx:191-197](../../src/components/bottom-bar.tsx#L191)) — two layouts the button must look right in. The AP-79 mock shows Hazbot as the **rightmost** control (parent "Bottom Controls", `relativeToParent.x = 809`, past Helitack/FIS).

**Resolution**: Specified the Hazbot `widgetGroup` as the **last child of `mainContainer`** (after the FIS group), so it renders rightmost in both FIS-shown and FIS-hidden layouts. Exact horizontal gap is a visual-tuning detail confirmed via screenshot-vs-board compare in Step 3, not a pixel value lifted from a duplicated mock. Folded into the Step 3 render note + scss comment.

### QA Engineer

#### RESOLVED: Jest integration tests should reuse the existing harness; burnout-arm test needs the right trigger
The Step-3 Jest bullets described the right coverage but didn't anchor to the established `seedState`/`mockEngine` helpers in `bottom-bar.test.tsx`, and the burnout-arm case is subtle: `simulationEnded` is a computed over `simulation.engine?.fireDidStop`, so it can't be set directly — the `reaction` only arms on the observed false→true edge. The blink test sketch also imported `act` from the wrong module.

**Resolution**: Updated the Step-3 Jest test note to extend `bottom-bar.test.tsx` via `seedState` + `mockEngine`, to drive the burnout-arm edge with `mockEngine({ fireDidStop: true })` + a running→stopped flip while mounted, and to import `act` from `react-dom/test-utils`.

#### RESOLVED: "Click not fed to the engine as a Reading" holds only via `translate()`'s default no-op
`log()` routes every event through `engine.consume()` ([log.ts](../../src/log.ts)), so logging `HazbotButtonClicked` *does* reach the engine — it's harmless only because `translate()` falls through to `default → no-op` for that name. The requirement framed the click as bypassing the engine, undersells this coupling, and if a future `translate()` case emitted a reading for `HazbotButtonClicked`, every click would mutate the matched category it just reported (the handler reads the category *before* `log()`, so logged id and post-click state would diverge).

**Resolution**: Documented the coupling — a comment at the `log("HazbotButtonClicked", …)` call, a requirements note, and the "must stay unhandled in translate.ts" invariant — plus an invariant guard test (consuming the event leaves `readings.length` and matched category unchanged).

### Senior Engineer (visual)

#### RESOLVED: The ready pulse is a code-built scaling outline, not a baked asset, and must render unclipped
Two findings merged. (1) Checked whether the pulse is an exportable asset — it is **not** (zero assets under "Pulse Animation"; the full asset list has none). It's 5 onion-skinned vector frames, each a 122×48 rounded rect (`border-radius: 10px`, `5px solid #0050c4` outside border, `#c1daff` fill, `opacity: 0.25`) — i.e. an outline meant to scale up + fade out in code. (2) AP-79 draws the pulse emanating **outside** the 122×48 button box, so it must not be clipped by the MUI Button content box, the widgetGroup, or the 64px fixed bottom bar (whose widget groups already use a `margin-top:-11px`/`$overflowHeight` trick to stick out the top edge). The original sketch used a `box-shadow` nested inside the `<Button>` — wrong primitive and clip-prone.

**Resolution**: Replaced the box-shadow with a bordered rounded-rect ring (measured values) animating `transform: scale()` + opacity, rendered as a **sibling of the `<Button>`** inside a `position: relative; overflow: visible` wrapper (`.hazbotButtonWrap`), with the button at `z-index:1` above the rings. Two staggered rings mirror the board's continuous pulse. Exact motion/feel confirmed via the Step-3 screenshot-vs-board compare (the one thing a DOM/class assertion can't validate).

---

<!-- ============================================================
     Round 3: code-verified implementation-spec self-review (2026-06-15)
     Each issue below was deep-dived against BOTH the current source
     and the proposed code in this plan before being written: the
     component JSX + SCSS + test sketches in "Add the HazbotButton
     component", the jest config (identity-obj-proxy CSS modules +
     string svgMock, package.json:jest), and the run lifecycle in
     simulation.ts / bottom-bar.tsx / app.tsx.
     ============================================================ -->

### QA Engineer (Round 3)

#### RESOLVED: The pulse-state unit test asserts on the wrong element, so it can never pass
The "Add the `HazbotButton` component" test sketch checks the pulse class via
`screen.getByTestId("hazbot-button").className` and `toMatch(/ready/)`. But in the
component, `data-testid="hazbot-button"` is on the inner MUI `<Button>` (whose class is
`css.hazbotButton`), while the `ready` class is applied to the **wrapper** `<div>`
(`${css.hazbotButtonWrap} ${pulsing ? css.ready : ""}`). The button element's className
never contains `ready`. Verified that the repo's jest maps `*.scss` through
`identity-obj-proxy` ([package.json](../../package.json) `jest.moduleNameMapper`), so
`css.ready === "ready"` literally, which removes any chance a hashed class coincidentally
matches. Net effect: the first assertion `not.toMatch(/ready/)` passes vacuously (always
true), and the post-arm assertion `toMatch(/ready/)` **always fails**. The pulse rings are
also gated by `pulsing` (`{pulsing && <span class=pulse... />}`), so the rendered-vs-not
distinction is observable without touching the button class at all.

**Resolution**: Rewrote the pulse-state test to assert against the wrapper via
`screen.getByTestId("hazbot-button").closest(".hazbotButtonWrap")` and to assert the `.pulse`
ring count (0 when idle, 2 when pulsing). The click test keeps `data-testid="hazbot-button"`
on the `<Button>` for `fireEvent.click`, so the fix is local to the pulse-state test.

---

### Senior Engineer (Round 3)

#### RESOLVED: MUI emotion will override the `.hazbotButton` background fills (default / hover / select)
hazbot-button.scss sets `background: #c1daff` plus `&:hover { background: #a4c7f9 }` and
`&:active { background: #80aff5 }` directly on `.hazbotButton` (the MUI `<Button>` root),
at specificity (0,1,0) with no `!important`. The repo's own bottom-bar.scss documents the
exact hazard this hits: "MUI's `.MuiButton-root` default ... is injected **after** our
static SCSS and wins on equal-specificity source-order" ([bottom-bar.scss:220-229](../../src/components/bottom-bar.scss#L220-L229)),
which is why `.playbackButton` needs `!important` for `min-width`, and why
[terrain-type-selector.scss:27](../../src/components/terrain-type-selector.scss#L27) reaches
for `!important` to beat emotion on `flex-direction` / `font-size`. The Hazbot button uses
the default MUI variant (no `variant` prop, i.e. text), whose base styles carry their own
`background-color` handling, so the AP-79 light-blue fill and the hover/select fills are at
real risk of not applying (the button could render with MUI's default/transparent background
instead). The exact color values are already deferred to a Step-3 screenshot compare, but
this specificity battle is independent of the values and would make all three fills silently
wrong.

**Resolution**: Added `!important` to the default, hover, and active `background`
declarations in hazbot-button.scss (matching the documented `.playbackButton` pattern), with
a comment explaining the emotion source-order reason and a note to confirm the rendered fills
in DevTools per the repo's MUI-override convention.

---

### QA Engineer (Round 3, cont.)

#### RESOLVED: The burnout-arm Jest test depends on an assignment ORDER the plan leaves unspecified
The Step-3 Jest plan drives the burnout arm by "a running -> stopped transition with
`mockEngine({ fireDidStop: true })`" so the `reaction` sees the `simulationEnded` false ->
true edge. But `simulationEnded` is a computed over `simulationStarted && !simulationRunning
&& !!engine?.fireDidStop`, and `simulation.engine` is **not** observable
([simulation.ts:37](../../src/models/simulation.ts#L37)); the reactivity edge is carried
solely by `simulationRunning` (documented at [simulation.ts:130-138](../../src/models/simulation.ts#L130-L138)).
So the test must assign the `fireDidStop:true` engine **before** flipping
`simulationRunning = false`, within one `act()`. If `simulationRunning` is set false first
(engine still `fireDidStop:false`), `simulationEnded` stays `false`; the subsequent
non-observable engine swap does not re-trigger the computed, the reaction never fires, and
the arm (and the test) silently fail. The plan's wording does not pin this order, so a
faithful "stop the sim, then give it a stopped engine" reading produces a false-negative
test.

**Resolution**: The burnout-arm bullet in "Mount the button in `BottomBar`" now specifies
the order explicitly: inside one `act()`, assign `mockEngine({ fireDidStop: true })` first,
then set `simulationRunning = false`, with the rationale (engine not observable, only
`simulationRunning` carries the edge) and the production `tick()` parallel.

---
