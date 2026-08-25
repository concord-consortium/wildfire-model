# Implementation Plan: WM-31 Disable Hazbot while the model is running

**Jira**: https://concord-consortium.atlassian.net/browse/WM-31
**Requirements Spec**: [requirements.md](requirements.md)
**Status**: **In Development**

## How this plan was verified

Every code block below was written into the working tree, run, and then reverted; the tree is back at
its pre-plan state.

**The figures below were measured on 2026-08-22, against the `master` this branch then sat on.** Three
merges have landed since (WM-46, WM-42 across two PRs, WM-54), so the absolute pass counts no longer
describe the tree this work builds on: the Jest baseline is now **982 of 982 across 78 suites** and
`bottom-bar-state-machine.cy.ts` carries **10** cases before this story adds its eleventh. Every
`file:line` in both spec files was re-derived against the stacked tree on 2026-08-25; the counts and
mechanisms below held, the totals did not. Re-run rather than quoting these. The code in the snippets
below is what shipped; their **comments** are not, having been trimmed in review, so read them for
structure rather than transcribing them. What that run established:

- **Jest**: 895 passed of 895 (the then-current 879 baseline plus the 16 new cases), no change to the 51
  pre-existing `tsc` errors (all in `node_modules` and `src/charts`) or the 31 pre-existing lint
  warnings, and no new ones.
- **Cypress**: `bottom-bar-state-machine.cy.ts` 10 passing of 10 with the `APP_URL` change, the
  eighth control in the matrix, and the new opacity case, in 41s headless. Re-measured on the built
  branch, which has gained WM-42's state 8: **11 of 11** in 44s, and the whole suite **30 of 30 across
  6 specs**
  (`CI=true npx cypress run --browser chrome`; the config's swiftshader branch covers WebGL, so this
  does not need the interactive `cypress open`).
- **Mutation checks**: each guard was removed one at a time and the suite re-run, to confirm the new
  tests can actually fail. Results in [Mutation results](#mutation-results) below.
- **Live, against the dev server**: the disabled button renders at 0.35 with the robot visible and
  eyes open; and both teardown routes (intro popover open, and a `[Show me]` tour running) were
  driven through the real coachmarks library, which jsdom mocks out entirely. In both, pressing Start
  destroyed the coach mark, dropped `.noHazbot`, left the wrapper at `hazbotButtonWrap runDisabled`
  with the robot visible, and reopening afterwards landed in `.coached` with the popover open. Zero
  console errors on every route.

## Implementation Plan

### Disable the button for the duration of a run

**Summary**: The button takes the `disabled` attribute and the Zeplin 35% fade whenever
`simulation.simulationRunning` is true, the blink cycle suspends for the run, and both browser
assertions (the `disabled` attribute in the WM-24 state matrix, the rendered 0.35 in the WM-6 Hazbot
block) land with them. Self-contained: no coach-mark behavior changes here, so this step is shippable
on its own.

**Files affected**:
- `src/components/hazbot-button.tsx`: a `running` local, the `disabled` prop, the `runDisabled`
  wrapper class, and the blink effect keyed on the run
- `src/components/hazbot-button.scss`: the shared 0.35 rule
- `src/components/hazbot-button.test.tsx`: four cases (`Disabled while the model runs (WM-31)`)
- `src/components/bottom-bar.test.tsx`: five cases, one per route out of the running state
- `cypress/e2e/bottom-bar-state-machine.cy.ts`: header comment, `APP_URL`, the `expectButtonStates`
  helper and its ten call sites, one new case

**Estimated diff size**: ~195 lines

Read `simulationRunning` once, near the top of the component, and let both the pulse predicate and
everything below use it:

```tsx
export const HazbotButton = observer(function HazbotButton() {
  const { ui, simulation } = useStores();

  // True for the whole of a run. The button is unavailable while the model is
  // running, since Hazbot's feedback is about what a run produced (WM-31).
  const running = simulation.simulationRunning;
```

The pulse predicate then reads the same local rather than the observable a second time:

```tsx
  const pulsing =
    ui.hazbotPulseArmed && simulation.simulationStarted && !running &&
    !ui.showHazbotFeedback;
```

The blink loop gains an early return and a dependency. `setBlink(false)` on the way in is what makes
the robot hold its eyes open rather than freeze on whatever frame the run began in (180ms of every
~2510ms cycle is eyes-closed, so about 7% of run starts would otherwise leave it mid-blink for the
whole run). The `[running]` dependency is a real dependency of the effect, so no
`exhaustive-deps` disable is involved:

```tsx
  // Random blink (AP-79): local presentation state, no store/engine coupling. A
  // recursive setTimeout cycle; the `mounted` ref prevents setBlink after unmount.
  // The cycle is suspended for the duration of a run and restarts from the top of
  // the loop afterwards; the robot holds its eyes OPEN rather than freezing on
  // whatever frame the run began in (180ms of every ~2510ms cycle is eyes-closed).
  const [blink, setBlink] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    if (running) {
      setBlink(false);
      return;
    }
    mounted.current = true;
    // ...unchanged loop...
    loop();
    return () => { mounted.current = false; clearTimeout(timeout); };
  }, [running]);
```

The wrapper gains a fourth state class, and the `<Button>` the `disabled` prop:

```tsx
  const wrapClassName = [
    css.hazbotButtonWrap,
    pulsing ? css.ready : "",
    (ui.showHazbotFeedback && !tourActive) ? css.coached : "",
    tourActive ? css.noHazbot : "",
    running ? css.runDisabled : "",
  ].filter(Boolean).join(" ");
```

```tsx
        disableRipple={true}
        disableTouchRipple={true}
        disabled={running}
```

In `hazbot-button.scss`, replace the `.noHazbot` block with a shared rule so the 0.35 is written
once, and leave `pointer-events` to the tour state alone:

```scss
// The two faded states, at the one opacity the Zeplin "Hazbot Button States"
// artboard gives both. "No Hazbot Default" is the walk-through tour running (the
// wrapper carries `.noHazbot` once [Show me] launches it): the robot is shown inside
// the coach mark, so the button drops its own. "Disabled" is the model running
// (`.runDisabled`): the robot stays, asleep. Both keep the Button back's #c1daff fill,
// 1.5px #797979 border and 10px radius.
//
// MUI fades a `disabled` button to 0.25 of its own accord and injects that style after
// this file, so the disabled override needs the three-class wrapper shape to out-weigh
// it on specificity: the same source-order battle the fill and border above document,
// minus the !important.
.hazbotButtonWrap.noHazbot .hazbotButton,
.hazbotButtonWrap.runDisabled .hazbotButton {
  opacity: 0.35;
}

// pointer-events belongs to the tour state alone: it carries no `disabled` attribute to
// block the click, while MUI already applies pointer-events:none to a disabled button.
.hazbotButtonWrap.noHazbot .hazbotButton {
  pointer-events: none;
}

// `visibility: hidden` (not display:none) preserves the avatar's 48px box so the
// "Hazbot Analysis" label keeps its position.
.hazbotButtonWrap.noHazbot .avatar {
  visibility: hidden;
}
```

Component-level cases, appended to `hazbot-button.test.tsx`:

```tsx
// WM-31: the button is unavailable while the model is running, and a run start takes
// down whatever coach mark is on screen. The pause routes themselves (Pause press,
// Fire Line, natural burnout, Restart) are driven through the real bottom-bar controls
// in bottom-bar.test.tsx; these cover what the button does with the flag.
describe("Disabled while the model runs (WM-31)", () => {
  const button = () => screen.getByTestId("hazbot-button");
  const wrap = () => screen.getByTestId("hazbot-button-wrap");

  it("disables the button while running and re-enables when the flag clears", () => {
    const { stores } = renderWithStores();
    expect(button()).not.toBeDisabled();
    act(() => { stores.simulation.simulationRunning = true; });
    expect(button()).toBeDisabled();
    expect(wrap().className).toMatch(/runDisabled/);
    act(() => { stores.simulation.simulationRunning = false; });
    expect(button()).not.toBeDisabled();
    expect(wrap().className).not.toMatch(/runDisabled/);
  });

  it("a mid-run click does not open the panel or log", () => {
    const logSpy = jest.spyOn(logModule, "log").mockImplementation(() => undefined);
    const { stores } = renderWithStores();
    act(() => { stores.simulation.simulationRunning = true; });
    fireEvent.click(button());
    expect(stores.ui.showHazbotFeedback).toBe(false);
    expect(logSpy).not.toHaveBeenCalledWith("HazbotButtonClicked", expect.anything());
  });

  it("pauses the blink cycle while running and restarts it from the top afterwards", () => {
    jest.useFakeTimers();
    jest.spyOn(Math, "random").mockReturnValue(0); // idle = 1000ms exactly
    const { stores } = renderWithStores();
    // Mid-idle, the run starts: the pending blink never lands.
    act(() => { jest.advanceTimersByTime(900); });
    act(() => { stores.simulation.simulationRunning = true; });
    // t = 1000, the exact tick an un-suspended loop would close the eyes on. This is
    // the assertion that carries "the blink cycle stops": land anywhere else in the
    // ~1260ms cycle and eyes-open is what an un-suspended loop shows too, so the
    // assertion reads the same against both implementations.
    act(() => { jest.advanceTimersByTime(100); });
    expect(screen.queryByTestId("hazbot-blinks")).toBeNull();
    // And it stays stopped rather than blinking later in the run.
    act(() => { jest.advanceTimersByTime(4900); });
    expect(screen.queryByTestId("hazbot-blinks")).toBeNull();
    expect(screen.getByTestId("hazbot-eyes")).toBeInTheDocument();
    // The run ends: the cycle restarts from a full idle rather than resuming the
    // 100ms that were left on the clock.
    act(() => { stores.simulation.simulationRunning = false; });
    act(() => { jest.advanceTimersByTime(999); });
    expect(screen.queryByTestId("hazbot-blinks")).toBeNull();
    act(() => { jest.advanceTimersByTime(1); });
    expect(screen.getByTestId("hazbot-blinks")).toBeInTheDocument();
    jest.useRealTimers();
  });

  it("holds the eyes open if the run starts mid-blink", () => {
    jest.useFakeTimers();
    jest.spyOn(Math, "random").mockReturnValue(0);
    const { stores } = renderWithStores();
    act(() => { jest.advanceTimersByTime(1000); });          // eyes closed
    expect(screen.getByTestId("hazbot-blinks")).toBeInTheDocument();
    act(() => { stores.simulation.simulationRunning = true; });
    expect(screen.queryByTestId("hazbot-blinks")).toBeNull(); // not frozen mid-blink
    jest.useRealTimers();
  });
});
```

The route cases go inside the existing `Hazbot` describe in `bottom-bar.test.tsx`, which already
loads a rule-set (`?hazbotRules=23`) and has the `seedRunning()` and `mockEngine()` helpers. They are
the cases that make requirement 42's "one case per pause route" mean something: each drives a different
piece of production code out of the running state, rather than writing the flag four times.

```tsx
  // WM-31: Hazbot answers about what a run produced, so it is unavailable for the
  // duration of a run. One case per route out of the running state: handleStart's
  // pause branch, handleFireLine and handleRestart's discard are each driven through
  // the real control. The natural end is not: engine is not observable, so only
  // simulationRunning carries the reactivity edge and the case has to mirror tick()
  // by hand, the same shape (and for the same reason) as the pulse test above it.
  describe("disabled while the model runs (WM-31)", () => {
    const hazbot = () => screen.getByTestId("hazbot-button");

    it("is disabled while running and re-enabled by a manual Pause", async () => {
      seedRunning();
      render(<Provider stores={stores}><BottomBar /></Provider>);
      expect(hazbot()).toBeDisabled();
      await userEvent.click(screen.getByTestId("start-button"));
      expect(hazbot()).not.toBeDisabled();
    });

    it("is re-enabled by a Fire Line intervention (the tool pauses the run)", async () => {
      seedRunning();
      render(<Provider stores={stores}><BottomBar /></Provider>);
      expect(hazbot()).toBeDisabled();
      // handleFireLine stops the run when the tool is ARMED, before any marker is
      // placed, so the button comes back at the click.
      await userEvent.click(screen.getByTestId("fireline-button"));
      expect(stores.simulation.simulationRunning).toBe(false);
      expect(hazbot()).not.toBeDisabled();
    });

    it("stays disabled through a Helitack drop, which does not pause the run", async () => {
      seedRunning();
      render(<Provider stores={stores}><BottomBar /></Provider>);
      await userEvent.click(screen.getByTestId("helitack-button"));
      expect(stores.simulation.simulationRunning).toBe(true);
      expect(hazbot()).toBeDisabled();
    });

    it("is re-enabled when the fire burns out on its own", () => {
      seedRunning();
      render(<Provider stores={stores}><BottomBar /></Provider>);
      expect(hazbot()).toBeDisabled();
      // Mirrors production tick(): the engine reports fireDidStop, then the flag falls.
      act(() => {
        (stores.simulation as any).engine = mockEngine({ fireDidStop: true });
        stores.simulation.simulationRunning = false;
      });
      expect(hazbot()).not.toBeDisabled();
    });

    it("is re-enabled by a mid-run Restart, which discards the run", async () => {
      seedRunning();
      render(<Provider stores={stores}><BottomBar /></Provider>);
      expect(hazbot()).toBeDisabled();
      await userEvent.click(screen.getByTestId("restart-button"));
      expect(stores.simulation.simulationRunning).toBe(false);
      expect(hazbot()).not.toBeDisabled();
    });
  });
```

**Note on the Fire Line case.** `handleFireLine` calls `simulation.stop()` when the tool is *armed*
(`bottom-bar.tsx:370`), before any marker exists, and confirmed live: the run pauses at the button
click, and placing the markers afterwards leaves it paused. A test that placed markers and then
expected the button back would be testing the wrong edge.

The browser assertions ship in this step too, in `cypress/e2e/bottom-bar-state-machine.cy.ts`: the
WM-24 guard grows its eighth control, and the one assertion Jest structurally cannot make (the
rendered opacity) goes in the WM-6 Hazbot block. They belong with this code rather than in a step of
their own because each of them asserts this step's output, and the SCSS rule has no Jest coverage at
all: `package.json` maps `\.(css|less|sass|scss)$` to `identity-obj-proxy`, so a jsdom assertion on
computed opacity reads `""` and passes against any implementation. Split out, the branch would carry
a commit where the 0.35 override exists with nothing anywhere able to fail on it.

`APP_URL` gains the rule-set, and `HAZBOT_URL` in the WM-6 describe goes away: after the change the
two constants are the same string, and the file should not carry two spellings of one URL.

```ts
// hazbotRules=23 is part of the shared URL rather than only the Hazbot describe's:
// the Hazbot button mounts under `{hazbotEngine?.ruleSet && ...}` (bottom-bar.tsx),
// so without a loaded rule-set the state matrix below would assert against an
// element that does not exist. The cost is that these cases now depend on rule-set
// 23 validating at load; the pulse describe at the bottom already carried that.
const APP_URL = "/?preset=plainsTwoZone&hazbotRules=23";
```

The helper takes an eighth key, and every one of the ten call sites supplies it: `hazbot: false`
in state 4 (Running), `hazbot: true` everywhere else, including the Fireline-armed case, where arming
the tool has paused the run, and both calls in state 8 (SetupOpen), where the wizard locks the model
controls but leaves `simulationRunning` false. State 8's title changes with it, per requirement 44a:
"only Setup stays enabled" is no longer true once an eighth control is asserted enabled beside it.

```ts
const expectButtonStates = (states: {
  setup: boolean; spark: boolean; reload: boolean; restart: boolean;
  startStop: boolean; fireLine: boolean; helitack: boolean; hazbot: boolean;
}) => {
  // ...seven existing assertions...
  cy.get("[data-testid='hazbot-button']").should(states.hazbot ? "not.be.disabled" : "be.disabled");
};
```

The state-4 title changes with it: `state 4 (Running): Setup/Spark/Hazbot disabled;
Restart/Start/Fireline/Helitack enabled`.

The header comment is rewritten on both counts requirement 44 names, but only one of them was still
outstanding when this shipped: PR #133 had already corrected the stale state count and split the
Zeplin attribution between states 1-7 and state 8. So the header edit here adds the control count to
the first paragraph and replaces the second, whose claim that the file makes no assertion about
rendered styles the new case makes false. As shipped:

```ts
// app, asserting the HTML `disabled` attribute of all eight controls; states 1-7
// follow the Zeplin matrix, and state 8 (the Setup-open lockout) has no artboard.
// Catches full-page reactivity wiring breaks, @observer-decoration regressions, and
// build-tooling failures that the React-Testing-Library tests in bottom-bar.test.tsx
// can't.
```

```ts
// The one rendered style it does assert is the Hazbot button's disabled opacity,
// which cannot be checked in Jest: SCSS modules resolve through identity-obj-proxy
// there, so no real CSS is applied and a computed-opacity assertion would read ""
// and pass against any implementation. The icon-button disabled rules
// (src/components/icon-button.scss, `&:disabled, &.Mui-disabled`) are still verified
// only by manual browser inspection against the Zeplin spec. A future Zeplin-driven
// visual-regression pass would close that gap.
```

The new case, appended to the `Hazbot button pulse (WM-6)` describe:

```ts
  // WM-31. The disabled attribute is asserted in the state matrix above too; what
  // only a browser can check is the rendered 35%. MUI fades a disabled button to
  // 0.25 on its own, so an implementation that ships the `disabled` prop without the
  // opacity override passes every Jest case and still renders the wrong button.
  it("fades to the Zeplin 35% (not MUI's 0.25) while the model runs", () => {
    cy.get("[data-testid='hazbot-button']").should("have.css", "opacity", "1");
    cy.window().then((win: Window) => { debugHooks(win).test.placeSparkInZone(0); });
    cy.get("[data-testid='start-button']").click();
    cy.window().its("sim.simulationRunning").should("eq", true);
    cy.get("[data-testid='hazbot-button']")
      .should("be.disabled")
      .and("have.css", "opacity", "0.35");
    // The robot stays (that is what separates this state from the tour's fade), and
    // the Button back keeps its fill and border.
    cy.get("[data-testid='hazbot-back']").should("be.visible");
    cy.get("[data-testid='hazbot-button']")
      .should("have.css", "background-color", "rgb(193, 218, 255)")
      .and("have.css", "border-top-width", "1px");
    // Pausing brings it back: Hazbot is available any time the model is not running.
    cy.get("[data-testid='start-button']").click();
    cy.window().its("sim.simulationRunning").should("eq", false);
    cy.get("[data-testid='hazbot-button']")
      .should("not.be.disabled")
      .and("have.css", "opacity", "1");
  });
```

`border-top-width` expects `1px`, not the declared `1.5px`: Chrome floors a sub-pixel border at
`devicePixelRatio` 1. Cypress runs at that ratio.

---

### Hide an open coach mark when a run starts

**Summary**: A run start clears the panel flag, which routes through the panel effect's existing
cleanup, plus the two pieces requirement 40 asks for so the tour's faded state cannot survive the
run. The new log event and its `LOGGED-EVENTS.md` row ship in the same commit as the code that emits
it.

**Files affected**:
- `src/components/hazbot-button.tsx`: `lastStepIndex` hoisted, the run-start log in the panel
  effect's cleanup, the run-start teardown effect, the `.noHazbot` class gate
- `src/components/hazbot-button.test.tsx`: the coaching-engine harness hoisted to module scope, plus
  seven cases (`Run-start coach-mark teardown (WM-31)`)
- `LOGGED-EVENTS.md`: the `HazbotCoachMarkHiddenByRun` row, the `categoryId` note, and, depending on
  merge order with WM-32, that story's coordinate-system note

**Estimated diff size**: ~200 lines

`lastStepIndex` moves from `openTour`'s scope to the effect's, so the cleanup can report it. Starting
it at `null` is what makes it null on the intro; `openTour` sets it to 0, keeping the existing
`HazbotTourCompleted` / `HazbotTourDismissed` payloads unchanged:

```tsx
    let introCancelled = false;
    let tourCancelled = false;
    let cleanup = false;
    // 0-based index of the tour step on screen. Null until a tour is launched, which
    // is what makes it null on the intro in the run-start log below.
    let lastStepIndex: number | null = null;
```

```tsx
    const openTour = (steps: EngineStep[]) => {
      log("HazbotShowMeClicked", {
        ruleSetId, categoryId: matched, stepCount: steps.length, feedbackLevel: selected?.level ?? null,
      });
      setTourActive(true);
      lastStepIndex = 0;
```

The log goes at the top of the effect's existing cleanup, right after `cleanup = true`:

```tsx
    return () => {
      // Programmatic teardown: set `cleanup` BEFORE destroying so neither engine's
      // onDestroyed launches a tour or logs a Completed/Dismissed event.
      cleanup = true;
      // A run start is the one programmatic teardown route that carries meaning for
      // researchers: the student had a coach mark up and ran the model anyway. The
      // `intro || tourEngine` term is not redundant with the running gate: this
      // cleanup is registered BEFORE the popover opens (openOnce is deferred to the
      // avatar's transitionend, with a 400ms fallback), so a run started in that
      // window would otherwise log a coach mark that was never displayed.
      if (simulation.simulationRunning && (intro || tourEngine)) {
        log("HazbotCoachMarkHiddenByRun", {
          ruleSetId,
          categoryId: matched,
          phase: tourEngine ? "tour" : "intro",
          lastStepIndex,
          feedbackLevel: selected?.level ?? null,
        });
      }
      avatar.removeEventListener("transitionend", onTransitionEnd);
      clearTimeout(fallbackId);
      intro?.destroy();
      tourEngine?.destroy();
    };
```

`phase` is derived from `tourEngine` rather than from the effect's `phase` variable, whose type also
carries `"done"`. That keeps one invariant for a reader and for the tests: `tourEngine` non-null means
`phase: "tour"` means `lastStepIndex` is a number.

`feedbackLevel` reads the same `selected` binding the other four Hazbot events use, so every event about
one popover reports the string it was showing and no consumer has to pair a teardown with the nearest
preceding `HazbotFeedbackShown` to recover it. It needs no hoist: `selected` is declared at effect scope
(`hazbot-button.tsx:132`), unlike `lastStepIndex`.

The teardown itself, declared after the panel effect and before `handleClick`:

```tsx
  // A run start hides any open coach mark (WM-31): Hazbot answers about a finished
  // run, so nothing it said stays on screen while the model changes underneath it.
  // Writing the flag rather than destroying the engines here keeps this a no-op when
  // nothing is open, since MobX suppresses a same-value assignment: no reaction, no
  // re-render and no log. `tourActive` is cleared at the source because the panel
  // effect's own setTourActive(false) is on the `cleanup`-skipped branch and would
  // otherwise leave the flag set for the whole run.
  useEffect(() => {
    if (!running) return;
    ui.showHazbotFeedback = false;
    setTourActive(false);
  }, [running, ui]);
```

And the class gate, which lands in this step because it is what keeps the tour's `pointer-events:
none` state from surviving the teardown:

```tsx
  // Wrapper state classes: `ready` (pulse halo), `coached` (intro enlarged-robot,
  // intro only), `noHazbot` (faded button while the tour runs), `runDisabled` (faded
  // button while the model runs). coached and noHazbot are mutually exclusive (see
  // the effect). `noHazbot` is conjoined with the panel flag so the state cannot be
  // reached while the panel is closed: it carries pointer-events:none and no
  // `disabled` attribute, so a stale tourActive would leave the button unclickable.
  const wrapClassName = [
    css.hazbotButtonWrap,
    pulsing ? css.ready : "",
    (ui.showHazbotFeedback && !tourActive) ? css.coached : "",
    (ui.showHazbotFeedback && tourActive) ? css.noHazbot : "",
    running ? css.runDisabled : "",
  ].filter(Boolean).join(" ");
```

**The tests need the coaching-engine harness in two describes**, so `coachingEngine`, `engines`, the
`beforeEach` body and `activateShowMe` move from inside `describe("Hazbot walk-through tour")` to
module scope, and that describe becomes `beforeEach(useCoachingEngine);`. The bodies are unchanged;
the alternative was a second copy of the harness in the new describe.

```tsx
// A coaching engine: ruleSet.id "23" with category 2 (a [Show me] coaching category
// present in tour-data.generated). The intro reads engine.ruleSet.{id,categories}.
function coachingEngine() { /* unchanged body */ }

// Record every engine created (intro then tour) with its opts + spies.
let engines: Array<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  opts: any; highlight: jest.Mock; drive: jest.Mock; destroy: jest.Mock;
}>;

// beforeEach body shared by the two coach-mark describes below.
function useCoachingEngine() { /* unchanged body */ }

// Simulate the [Show me] activation: the intro's done button routes moveNext →
// destroy → onDestroyed with NO onCancelRequested first.
function activateShowMe() {
  act(() => { engines[0].opts.onDestroyed(); });
}

describe("Hazbot walk-through tour", () => {
  beforeEach(useCoachingEngine);
  // ...six existing cases unchanged...
});
```

```tsx
describe("Run-start coach-mark teardown (WM-31)", () => {
  beforeEach(useCoachingEngine);

  const wrap = () => screen.getByTestId("hazbot-button-wrap");
  const startRun = (stores: ReturnType<typeof createStores>) =>
    act(() => { stores.simulation.simulationRunning = true; });

  it("hides an open intro popover and logs it as phase intro", () => {
    const logSpy = jest.spyOn(logModule, "log").mockImplementation(() => undefined);
    const { stores } = renderWithStores();
    openPanel();
    expect(engines).toHaveLength(1);
    startRun(stores);
    expect(engines[0].destroy).toHaveBeenCalled();
    expect(stores.ui.showHazbotFeedback).toBe(false);
    expect(wrap().className).not.toMatch(/coached/);
    expect(screen.getByTestId("hazbot-button")).toBeDisabled();
    expect(logSpy).toHaveBeenCalledWith(
      "HazbotCoachMarkHiddenByRun",
      { ruleSetId: "23", categoryId: 2, phase: "intro", lastStepIndex: null, feedbackLevel: 1 },
    );
    // The real engine fires onDestroyed FROM destroy(); the mock above does not, so
    // drive it or everything below is asserted against a callback that never ran. It
    // is the `cleanup` flag that has to swallow this one: without it the intro's
    // onDestroyed reads as a [Show me] activation and opens a tour mid-run.
    act(() => { engines[0].opts.onDestroyed(); });
    expect(engines).toHaveLength(1);
    expect(logSpy).not.toHaveBeenCalledWith("HazbotShowMeClicked", expect.anything());
    expect(logSpy).not.toHaveBeenCalledWith("HazbotTourCompleted", expect.anything());
    expect(logSpy).not.toHaveBeenCalledWith("HazbotTourDismissed", expect.anything());
  });

  it("hides a running tour, logs its last step, and leaves the button disabled rather than faded-for-tour", () => {
    const logSpy = jest.spyOn(logModule, "log").mockImplementation(() => undefined);
    const { stores } = renderWithStores();
    openPanel();
    activateShowMe();
    act(() => { engines[1].opts.onHighlightStarted(undefined, {}, { state: { activeIndex: 1 } }); });
    expect(wrap().className).toMatch(/noHazbot/);
    startRun(stores);
    expect(engines[1].destroy).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      "HazbotCoachMarkHiddenByRun",
      { ruleSetId: "23", categoryId: 2, phase: "tour", lastStepIndex: 1, feedbackLevel: 1 },
    );
    // As in the intro case: the mock's destroy() does not call back into onDestroyed,
    // so without this line the two assertions below cannot fail.
    act(() => { engines[1].opts.onDestroyed(); });
    expect(logSpy).not.toHaveBeenCalledWith("HazbotTourCompleted", expect.anything());
    expect(logSpy).not.toHaveBeenCalledWith("HazbotTourDismissed", expect.anything());
    // The tour's faded state is gone: what is left is the disabled state, which keeps
    // the robot and is reached through the `disabled` attribute.
    expect(wrap().className).not.toMatch(/noHazbot/);
    expect(wrap().className).toMatch(/runDisabled/);
    expect(screen.getByTestId("hazbot-button")).toBeDisabled();
  });

  it("reopening after such a teardown lands in .coached without ever committing .noHazbot", () => {
    jest.spyOn(logModule, "log").mockImplementation(() => undefined);
    const { stores } = renderWithStores();
    openPanel();
    activateShowMe();
    startRun(stores);
    act(() => { stores.simulation.simulationRunning = false; });
    // The coach mark does not come back on its own when the run ends (R36): nothing
    // reopens the panel and no third engine is created. The student has to click.
    expect(stores.ui.showHazbotFeedback).toBe(false);
    expect(engines).toHaveLength(2);
    // Watch every committed value of the wrapper's class attribute across the reopen:
    // a stale tourActive would commit one render of `.noHazbot` before the panel
    // effect clears it. takeRecords() (not disconnect()) drains records still queued
    // in the microtask.
    const seen: string[] = [];
    const observer = new MutationObserver(() => undefined);
    observer.observe(wrap(), { attributes: true, attributeFilter: ["class"], attributeOldValue: true });
    openPanel();
    // oldValue, not target.className: the target reads its FINAL value at drain time,
    // so every record would look identical and the assertion could never fail.
    observer.takeRecords().forEach((r) => seen.push(r.oldValue ?? ""));
    observer.disconnect();
    seen.push(wrap().className);
    expect(seen.length).toBeGreaterThan(1);
    expect(seen.some((c) => /noHazbot/.test(c))).toBe(false);
    expect(wrap().className).toMatch(/coached/);
  });

  it("never shows the tour's click-blocking faded state while the panel is closed", () => {
    jest.spyOn(logModule, "log").mockImplementation(() => undefined);
    const { stores } = renderWithStores();
    openPanel();
    activateShowMe();
    expect(wrap().className).toMatch(/noHazbot/);
    // Any writer clearing the flag from outside the component (this story adds the
    // first) tears the tour down through the effect's cleanup path, which by design
    // skips setTourActive(false) so neither engine mis-logs. `.noHazbot` carries
    // pointer-events:none and no `disabled` attribute, so a stale tourActive left it
    // permanently unclickable.
    act(() => { stores.ui.showHazbotFeedback = false; });
    expect(wrap().className).not.toMatch(/noHazbot/);
    expect(screen.getByTestId("hazbot-button")).not.toBeDisabled();
  });

  it("logs and clears nothing when a run starts with no coach mark open", () => {
    const logSpy = jest.spyOn(logModule, "log").mockImplementation(() => undefined);
    const { stores } = renderWithStores();
    expect(engines).toHaveLength(0);
    startRun(stores);
    expect(logSpy).not.toHaveBeenCalledWith("HazbotCoachMarkHiddenByRun", expect.anything());
    // Not `showHazbotFeedback === false`, which was already false and would pass
    // against any implementation: what "clears nothing" means here is that the run
    // start neither built a coach mark nor moved the button off its default state.
    expect(engines).toHaveLength(0);
    expect(wrap().className).not.toMatch(/coached|noHazbot/);
  });

  it("stays silent when the run starts after the click but before the popover opens", () => {
    const logSpy = jest.spyOn(logModule, "log").mockImplementation(() => undefined);
    const { stores } = renderWithStores();
    // Click without letting the open-after-scale-up timer fire: the effect's cleanup
    // is registered, but no coachmarks engine exists yet.
    jest.useFakeTimers();
    try {
      fireEvent.click(screen.getByTestId("hazbot-button"));
      act(() => { jest.advanceTimersByTime(100); });
      expect(engines).toHaveLength(0);
      startRun(stores);
    } finally {
      jest.useRealTimers();
    }
    expect(logSpy).not.toHaveBeenCalledWith("HazbotCoachMarkHiddenByRun", expect.anything());
  });

  it("still logs a plain dismiss as HazbotTourDismissed when no run is involved", () => {
    const logSpy = jest.spyOn(logModule, "log").mockImplementation(() => undefined);
    renderWithStores();
    openPanel();
    activateShowMe();
    act(() => { engines[1].opts.onCancelRequested(); });
    act(() => { engines[1].opts.onDestroyed(); });
    expect(logSpy).toHaveBeenCalledWith(
      "HazbotTourDismissed", { ruleSetId: "23", categoryId: 2, lastStepIndex: 0, feedbackLevel: 1 },
    );
    expect(logSpy).not.toHaveBeenCalledWith("HazbotCoachMarkHiddenByRun", expect.anything());
    expect(logSpy).not.toHaveBeenCalledWith("HazbotTourCompleted", expect.anything());
  });
});
```

**`LOGGED-EVENTS.md`**: one row after `HazbotTourDismissed` in the Hazbot table, and the fourth name
added to the `categoryId` subsection's enumeration (`LOGGED-EVENTS.md:102`), which becomes:

```markdown
On `HazbotShowMeClicked`, `HazbotTourCompleted`, `HazbotTourDismissed` and
`HazbotCoachMarkHiddenByRun`, `categoryId` is
```

The warning in the middle of that subsection carries over untouched: the new event's `categoryId`
comes from the same `matched` binding (`readCategories(engine).used`, `hazbot-button.tsx:126`) the
three tour events use, so the note about a value sitting above `matchedCategory` on tab 44 applies to
it unchanged. Two other lines in the subsection do not carry over. Its heading
(`LOGGED-EVENTS.md:100`) reads `### `categoryId` on the tour events (`appRulesVersion` 6 onward)`, and
`HazbotCoachMarkHiddenByRun` is not a tour event: it fires on the intro phase too, which is what
`phase` exists to record. And its closing sentence (`:112`) reads *"Before `appRulesVersion` 6,
`categoryId` on these three events was `matchedCategory`."*, whose "these three" loses its referent the
moment the opening sentence names four, and which is untrue of an event that did not exist before
`appRulesVersion` 6. Both change:

```markdown
### `categoryId` on the coach-mark events (`appRulesVersion` 6 onward)
```

```markdown
Before `appRulesVersion` 6, `categoryId` on `HazbotShowMeClicked`, `HazbotTourCompleted` and
`HazbotTourDismissed` was `matchedCategory`. `HazbotCoachMarkHiddenByRun` post-dates that boundary
and has never carried anything but `categoryUsed`.
```

Retitling is safe: the only links into this file anywhere in the repo are two `#hazbot` anchors in
`docs/hazbot-update-workflow.md` (`:212`, `:251`), which point at the `## Hazbot` heading, not at this
subsection.

**A third doc edit is conditional on merge order with WM-32, and belongs to whichever story lands
second.** WM-32 makes it a deliverable that the `HazbotShowMeClicked` / `HazbotTourCompleted` /
`HazbotTourDismissed` rows state which coordinate system `stepCount` and `lastStepIndex` are in
(`specs/WM-32-skip-satisfied-steps/requirements.md:42`, on the unmerged branch), resolved to **driven**
coordinates with `skippedSteps` as the reconciling field. `HazbotCoachMarkHiddenByRun` carries
`lastStepIndex` too, and its terminal-index reading is only meaningful against the `stepCount` on the
paired `HazbotShowMeClicked`, so it has to be named there as a fourth event. If WM-32 is already on
`master` when this branch is written, add that name here, in the same edit as the `categoryId`
enumeration above. If this story lands first, the note does not exist yet and WM-32 writes all four
names. Either way it is one sentence, and it is the same fourth-name addition as the `categoryId`
subsection, applied to a different note.

The table row, as it should land (one line in the file, wrapped here only for reading):

```markdown
| `HazbotCoachMarkHiddenByRun` | `{ ruleSetId: string \| null, categoryId: number \| null, phase:
"intro" \| "tour", lastStepIndex: number \| null, feedbackLevel: number \| null }` | A run starts (Start pressed, including a
resume from pause) while a Hazbot coach mark is on screen: the coach mark is destroyed and the button
is disabled for the duration of the run (WM-31). **Fires only when a coach mark was actually open**,
so its absence alongside a `SimulationStarted` means nothing was showing, and a run started in the
gap between the Hazbot click and the popover opening logs nothing. `phase` is `"intro"` for the
feedback popover and `"tour"` for the `[Show me]` walk-through; `phase: "intro"` always carries
`lastStepIndex: null`, since the intro has no steps. `feedbackLevel` is the level of the coach mark that
was on screen, the same value the popover's own `HazbotFeedbackShown` carries and, on the tour phase,
the same one on the paired `HazbotShowMeClicked`; it is repeated here so the row reads without a join. **The event says only that a run started while a
coach mark was up; it is not by itself a record of abandonment.** Which it is depends on
`lastStepIndex` against the `stepCount` on the paired `HazbotShowMeClicked`: below `stepCount - 1` is
abandonment-by-running, distinct from the abandonment-by-leaving that a `HazbotShowMeClicked` with no
terminator at all still indicates. A **terminal** `lastStepIndex` is the opposite wherever the tour's
last step asked the student to press Start, which is six of the live coaching tours. Judge that by
what the step asks for, not by what it is anchored to. **41/2, 44/2, 46/2 and 46/4** end on the Start
button and ask only that ("Click **Start** to run the model!"), so a terminal index there is plain
compliance. **44/3 and 46/3** are anchored on the Fireline button and end "Add both a
**Fireline** and a **Helitack** while the model is running. Click **Start** to begin!", so a terminal
index there is *partial* compliance: the student did the Start half, and this release removes the
during-run half from the screen at the moment it becomes actionable. For all six, this event
replaces `HazbotTourCompleted` **on one route only**: the terminal popover also carries a `[Got it!]`
button, so a student who dismisses before pressing Start still logs `HazbotTourCompleted` as before.
Completion counts for these six therefore drop from this release by however many students press
Start without dismissing first, which is not recoverable from earlier sessions. Deliberate engine
no-op. See the `categoryId` note below the table. |
```

---

## Mutation results

Each guard removed on its own, suite re-run. Every one of them is load-bearing, and each new test
names a mutation it catches:

| Mutation | Result |
|---|---|
| Drop `disabled={running}` | 4 Jest cases red in `hazbot-button.test.tsx`, 5 in `bottom-bar.test.tsx` |
| Drop the `runDisabled` half of the shared SCSS rule | Cypress `fades to the Zeplin 35%` red, reading MUI's `0.25`; nothing else red |
| Blink effect keyed `[]` instead of `[running]` | both blink cases red; the pause case on its t = 1000 boundary assertion, which is the one that carries "the cycle stops" |
| Blink pause without `setBlink(false)` | `holds the eyes open if the run starts mid-blink` red |
| Drop `cleanup = true` from the panel effect's cleanup | both run-start teardown cases red: the intro one opens a tour mid-run, the tour one logs `HazbotTourCompleted` alongside the new event |
| Log gate drops `(intro \|\| tourEngine)` | `stays silent when the run starts after the click but before the popover opens` red |
| Log gate drops `simulation.simulationRunning` | `still logs a plain dismiss as HazbotTourDismissed when no run is involved` red |
| Teardown does not clear `tourActive` | `reopening after such a teardown lands in .coached without ever committing .noHazbot` red |
| Drop the `.noHazbot` panel-flag gate | `never shows the tour's click-blocking faded state while the panel is closed` red |
| Both of the last two together | 3 cases red, including the tour teardown leaving the button in the permanently unclickable state |

The last three rows are the answer to requirement 40's "neither substitutes for the other". The two
halves overlap: with both in place either one alone would hide the other's absence, so each needs its
own scenario. Clearing `tourActive` is what prevents the stale-flag flash on the next reopen; the
class gate is what prevents the faded, click-blocking state whenever any writer clears the panel flag
from outside the component, which is the thing this story introduces.

## Technical notes

- **The cleanup also runs on unmount**, so in principle an unmount during a run with a coach mark
  open would log `HazbotCoachMarkHiddenByRun`. After this change that state is unreachable: the
  teardown closes the coach mark at run start, and the button cannot be clicked for the rest of the
  run. No guard is added for a state the story makes impossible.
- **No new `exhaustive-deps` disable.** Both new dependency arrays (`[running]` and `[running, ui]`)
  are complete. The pre-existing disable on the panel effect is untouched.
- **Nothing in the engine changes.** `HazbotCoachMarkHiddenByRun` is unhandled in `translate.ts` like
  every other Hazbot event, so it reaches the log without moving a category.

## Open Questions

### RESOLVED: Should the Cypress work be its own commit, or fold into the first step?

**Context**: Every Cypress change in the third step is about the disabled state, which is the first
step's code: the matrix asserts the `disabled` attribute the first step adds, and the opacity case
asserts the SCSS rule the first step adds. None of it touches the coach-mark teardown. Folding it in
puts each assertion in the commit with the behavior it guards (and means the branch never has a
commit where the 35% is unverified in a browser); keeping it separate keeps the Jest and Cypress
churn apart and leaves the WM-24 matrix rewrite reviewable on its own, since it touches all nine
existing cases and the file header.

**Options considered**:
- A) Fold the Cypress changes into the first step (two commits total)
- B) Keep three commits as planned
- C) Split differently: matrix + header rewrite in its own commit, the opacity case with the first step

**Decision**: A. Every assertion in the Cypress work is about the first step's code, and the SCSS
half of that step has no Jest coverage that could ever fail: `package.json` maps
`\.(css|less|sass|scss)$` to `identity-obj-proxy`, so a jsdom read of the computed opacity returns
`""`. Measured live on this branch, a `disabled` MUI button renders at 0.25, which is the regression
the 0.35 override exists to prevent and the Cypress case is the only thing that catches it. Splitting
would put that override in one commit and its only possible test in another. The cost is that the
WM-24 matrix churn (one helper signature, ten one-word additions, a header rewrite) is reviewed
alongside the Jest churn, in a two-commit branch of roughly 195 and 200 lines.

## Self-Review

Roles: QA Engineer, Education Researcher, Senior Engineer. Every finding below was verified against
the code on this branch before being written. The plan's implementation (the `running` local, the
`disabled` prop, the shared 0.35 rule with the `runDisabled` selector, the blink gate, the hoisted
`lastStepIndex`, the cleanup log, the run-start teardown and the `.noHazbot` panel-flag gate) was
built out in the working tree, typechecked, linted, driven by the plan's own Jest cases and by
throwaway probes, and run through Cypress against a live dev server. Each guard was then removed one
at a time and the suites re-run. The tree was back at the then-current 879/879 with 51 pre-existing
`tsc` errors and no source changes; `tsc` still reports 51 and `npm run lint` still reports 0 errors /
31 warnings on the stacked tree.

**What the pass confirmed rather than challenged**, recorded so it is not re-derived:

- Every mutation in [Mutation results](#mutation-results) reproduces except the one covered by the
  first finding below. `disabled={running}` dropped: 5 of 5 bottom-bar cases red plus the
  component-level cases. Blink keyed `[]`: both blink cases red. Blink pause without `setBlink(false)`:
  the eyes-open case red. Log gate without `(intro || tourEngine)`: the pre-open case red. Log gate
  without `simulation.simulationRunning`: the plain-dismiss case red. Teardown without
  `setTourActive(false)`: the reopen case red. `.noHazbot` gate dropped: the closed-panel case red.
- The Cypress work runs green as specified: `bottom-bar-state-machine.cy.ts` 10 passing of 10 in 36s
  headless with the `APP_URL` change, the eighth control supplied at all eight call sites, and the new
  opacity case. Dropping the `runDisabled` half of the shared SCSS rule fails that case alone, reading
  `0.25` against an expected `0.35`, which is the MUI measurement requirement 30 rests on, reproduced
  here rather than taken on trust.
- Lint is clean on the changed files with `[running]` and `[running, ui]`, and reports
  `React Hook useEffect has a missing dependency: 'ui'` without the second entry, exactly as the third
  requirements pass recorded.
- The payloads are byte-for-byte what requirement 38 specified at the time:
  `{ ruleSetId: "23", categoryId: 2, phase: "intro", lastStepIndex: null }` for an intro open at run
  start, `{ ..., phase: "tour", lastStepIndex: 1 }` for a tour on step 1, and nothing at all for the
  pre-open window and the nothing-open case. `feedbackLevel` was added to the payload after this run and
  is therefore absent from these records and from the live measurements below; nothing else about them
  changes, since it reads a binding that was already in scope.
- **Both teardown routes were driven live against the real coachmarks library, which jsdom mocks out
  entirely.** On `?preset=plainsTwoZone&hazbotRules=44&hazbotSidebar=true`, ruleset 44 category 3.
  *Tour route*: `[Show me]`, Restart to advance, then Start from the terminal step; logged
  `HazbotCoachMarkHiddenByRun { ruleSetId: "44", categoryId: 3, phase: "tour", lastStepIndex: 1 }`.
  *Intro route*: run, pause, Hazbot, then Start with the intro popover still up; logged
  `{ ..., phase: "intro", lastStepIndex: null }`, null rather than 0 as requirement 38 specifies. In
  both, all nine coach-mark nodes were destroyed, the wrapper went to `runDisabled` with no `noHazbot`
  residue, and the only other Hazbot event in the stream was the `HazbotButtonClicked` that opened the
  panel: no mis-logged `HazbotTourCompleted` or `HazbotTourDismissed`, zero console errors on either
  route.
- **The intro route also settles four requirements that only a browser can show.** Measured on the
  same run: the avatar went from `scale(1.525)` to `transform: none` while still carrying
  `transition: transform 0.25s`, so the robot shrinks on the existing transition rather than snapping
  (requirement 35); the run-disabled button read `opacity: 0.35`, `pointer-events: none`, background
  `#c1daff`, `border-top-width: 1px` and label `#222`, with the eyes layer present and the blink layer
  absent (requirements 29, 33); the natural burnout that ended the run re-enabled the button at
  `opacity: 1` with no coach mark returning (requirements 27, 36); and the wrapper picked up `ready` at
  that moment, so the pulse still re-arms after a run that began with a coach mark open (requirement
  41). Reopening afterwards committed `coached` with `noHazbot` absent and the popover back on screen.
- **A run start with a tour open commits one intermediate wrapper class, and it is inert.** Watched
  with a `MutationObserver`, the wrapper goes
  `hazbotButtonWrap noHazbot` to `hazbotButtonWrap noHazbot runDisabled` to
  `hazbotButtonWrap runDisabled`, because the render that sets `running` commits before the teardown
  effect clears the panel flag. This is the entry-side twin of the reopen flash the second
  requirements pass found, but it needs no fix: both faded states are `opacity: 0.35`, and the robot is
  hidden in the intermediate frame exactly as it was in the frame before it, so the sequence a student
  can see is hidden, hidden, visible. No extra gate on `.noHazbot` is warranted.

### QA Engineer

#### RESOLVED: the two run-start teardown cases cannot fail on their `HazbotTourCompleted` / `HazbotTourDismissed` assertions

Both new teardown cases close with

```tsx
expect(logSpy).not.toHaveBeenCalledWith("HazbotTourCompleted", expect.anything());
expect(logSpy).not.toHaveBeenCalledWith("HazbotTourDismissed", expect.anything());
```

and neither can ever fail. The guard those assertions exist to protect is `cleanup = true` at the top
of the panel effect's cleanup (`hazbot-button.tsx:257`), which is what stops the tour engine's
`onDestroyed` from logging `HazbotTourCompleted` on a programmatic teardown. But the shared harness's
mock engine gives `destroy` a bare `jest.fn()`; the real coachmarks engine fires `onDestroyed` from
`destroy()`, the mock does not. So the code path the assertions guard is never entered in jsdom.

Measured: with the plan's implementation in the tree and `cleanup = true;` deleted from the cleanup,
all four of the plan's teardown cases stay green. In production that mutation makes a run start with a
tour open log `HazbotCoachMarkHiddenByRun` **and** `HazbotTourCompleted` from the same destroy, which
is exactly the double-log the logging open question dismissed as unfounded. The dismissal is right,
and nothing in the suite holds it.

The repair is one line per case, and it was measured both ways: adding
`act(() => { engines[1].opts.onDestroyed(); });` after the run-start assertions (with a comment saying
the mock does not fire it and the real engine does) passes against the plan's implementation and goes
red when `cleanup = true` is removed. The intro case needs the same treatment against `engines[0]`.

This also means [Mutation results](#mutation-results) is one row short: `cleanup = true` is a guard
the story's new code depends on and no row covers it. Suggested resolution: add the explicit
`onDestroyed()` drive to both teardown cases, and add the `cleanup = true` mutation to the table.

Two smaller items in the same family, worth folding into the same edit. `expect(stores.ui.showHazbotFeedback).toBe(false)`
in `logs and clears nothing when a run starts with no coach mark open` is true by construction: the
flag was never set in that case, so the line asserts the initial value rather than the teardown's
silence. The `expect(engines).toHaveLength(0)` above it is the assertion carrying that case. And
`is re-enabled when the fire burns out on its own` does not drive `tick()`: it assigns a stopped mock
engine and writes `simulationRunning = false` directly, which is what the neighboring WM-6 pulse test
does and for the documented reason (the engine is not observable, so only `simulationRunning` carries
the reactivity edge). It is load-bearing for `disabled={running}`, but the describe's comment claims
each of the five cases drives "a different piece of production code clearing simulationRunning", and
for this one that is not what happens. Either reword the comment or say why the direct write is the
only available shape.

**Decision**: accepted in full, and the plan is edited rather than annotated. Both run-start teardown
cases now drive `opts.onDestroyed()` explicitly after asserting the destroy, with a comment saying the
mock does not call back and the real engine does. The intro case turned out to want a stronger pair of
assertions than the finding proposed: with `cleanup` gone its `onDestroyed` reads as a `[Show me]`
activation and **opens a tour in the middle of the run**, which is a worse regression than a stray log
line and which `not.toHaveBeenCalledWith("HazbotTourCompleted")` would never have caught even with the
callback driven. So that case asserts `engines` stays at length 1 and that no `HazbotShowMeClicked`
fires, alongside the two not-called log assertions. Measured both directions on this branch: the
edited cases pass against the plan's implementation and both go red with `cleanup = true;` deleted
(the intro case on the engine count, the tour case on `HazbotTourCompleted`). [Mutation results](#mutation-results)
gains the row. The two smaller items are applied as suggested: the vacuous flag assertion is replaced
by the two things a run start with nothing open must actually leave alone (no engine built, no state
class on the wrapper), and the bottom-bar describe's comment now says which three routes are driven
through the real control and why the natural end has to be mirrored by hand.

---

### Education Researcher

#### RESOLVED: the `LOGGED-EVENTS.md` row names four tours that end by asking the student to press Start; there are six

The row's third mandated note tells a reader that a terminal `lastStepIndex` is compliance rather than
abandonment "on a tour whose last step points at Start", and then enumerates 41/2, 44/2, 46/2 and 46/4.
Those are the four whose terminal **anchor** is `start-button` (`tour-map.tsx:126`, `:130`, `:135`,
`:137`). Two more tours end with a terminal step whose **text** is an instruction to press Start:
44/3 and 46/3 both read *"Add both a **Fireline** and a **Helitack** while the model is running.
Click **Start** to begin!"* (`tour-data.generated.ts:162`, `:172`), anchored on
`fireline-button`. `buildTour` gives the terminal step no `advanceOn` (`build-tour.ts:56`), so the
popover is on screen while the student reads it, and the library ships no click-blocking overlay (the
only `pointerEvents: "none"` in `dist/index.js` is on the ring), so pressing Start from there is
reachable. A student who complies with those two instructions therefore also produces a terminal
`HazbotCoachMarkHiddenByRun`, and a researcher applying the row as written classifies it as
abandonment-by-running.

These are the same two categories the requirements' Out of Scope entry already names as
run-spanning, so the story has the fact; the row just does not carry it. Suggested resolution: state
the rule by what the terminal step **asks for** rather than by its anchor, and name all six, or name
the four `start-button`-anchored ones and say explicitly that 44/3 and 46/3 end on the same
instruction with a different anchor.

The accuracy nit this finding also raised is gone: 41/2 (formerly 42/2) used to read `Click to
**Start** to run the model!`, with a stray "to", so the sentence could not quote one shared terminal
text for all four. Trudi fixed it at source in the 2026-08-25 export and WM-54 extracted it, so all
four now read `Click **Start** to run the model!` (`tour-data.generated.ts:152`, `:158`, `:168`,
`:176`) and the quotation is accurate as written.

**Decision**: accepted. The row now states the rule by what the terminal step **asks for** rather than
by its anchor, and names all six, split into the four where pressing Start is the whole remaining ask
and the two where it is half of one. Requirement 39, the Technical Note and the message to Sam are
updated to match.

The live run that produced this finding also settled a claim the spec had been carrying loosely, and
that half is folded into the same edit. The terminal popover carries a `[Got it!]` button alongside the
instruction: the library forces the Done button on the last step even under `actionGated`
(`dist/index.js:747`), which the 44/3 run confirmed on screen. So a compliant student has two routes,
dismiss-then-Start (still `HazbotTourCompleted`) and Start-directly (the new event), and the spec's
"`HazbotTourCompleted` counts fall toward zero" is wrong: it is a split of unknown proportion, not a
collapse. The row, the Technical Note and Sam's message all say that now.

Rejected: naming only the four Start-anchored tours and treating the other two as a separate remark.
The row has to work for someone querying the data without the spec in front of them, and an
anchor-based rule silently miscounts two live categories on tabs 44 and 46. The 41/2 quotation
nit needs no handling: the stray "to" was fixed at source, so all four share one terminal text.

---

#### RESOLVED: requirement 39's "the note's body needs no rewording, only the fourth name" does not hold

The implementation plan repeats it: *"The rest of that subsection needs no rewording."* Read against
the file, two things in that subsection break when a fourth event name is added to its opening
sentence.

The subsection is headed **`### categoryId on the tour events (appRulesVersion 6 onward)`**
(`LOGGED-EVENTS.md:100`). `HazbotCoachMarkHiddenByRun` is not a tour event: it fires on the intro phase
too, which is the whole reason it carries `phase`. A reader looking for the new event's `categoryId`
semantics has no reason to open a section about tour events.

The subsection closes with *"Before `appRulesVersion` 6, `categoryId` on these three events was
`matchedCategory`."* (`LOGGED-EVENTS.md:112`). Once the opening sentence names four events, "these
three" has no referent, and the claim is untrue of the new event in any case, since it did not exist
before `appRulesVersion` 6.

Suggested resolution: retitle the subsection (for example "`categoryId` on the coach-mark events"), and
either pin the closing sentence to the three events it is actually about by name, or add a clause
saying `HazbotCoachMarkHiddenByRun` post-dates the boundary. Both requirement 39 and the plan's
`LOGGED-EVENTS.md` paragraph need the "no rewording" claim struck.

**Decision**: accepted, applied without asking, since there is no choice to make once the file is read.
The subsection is retitled to "`categoryId` on the coach-mark events", and the closing sentence names
its three events explicitly and records that `HazbotCoachMarkHiddenByRun` post-dates the
`appRulesVersion` 6 boundary. Both replacement lines are written into the plan's `LOGGED-EVENTS.md`
step, and the "no rewording" claim is struck from requirement 39 and from the plan. Checked before
retitling: the only links into `LOGGED-EVENTS.md` anywhere in the repo are two `#hazbot` anchors in
`docs/hazbot-update-workflow.md`, so no anchor breaks.

## Self-Review: second pass

Roles: QA Engineer, Education Researcher, Senior Engineer. Every finding below was verified against
the code on this branch before being written. The plan's implementation (the `running` local, the
`disabled` prop, the shared 0.35 rule with the `runDisabled` selector, the blink gate, the hoisted
`lastStepIndex`, the cleanup log, the run-start teardown, the `.noHazbot` panel-flag gate, the Cypress
`APP_URL` change, the eighth matrix control and the opacity case) was built out in the working tree
and run. The tree is back at its then-current 879/879 with no source changes.

**What the pass confirmed rather than challenged**, reproduced independently rather than taken from
the previous pass:

- **Jest is 895 of 895**, exactly the then-current 879 baseline plus the plan's 16 new cases, with the
  plan's code and tests transcribed verbatim. Measured again on the built branch: **998 of 998 across
  78 suites**, which is the 982 baseline plus the same 16 cases.
- **`tsc` is unchanged at 51 errors**, before and after, all in `node_modules` and
  `src/charts/components/line-chart.tsx`. `npx eslint` is clean on all changed files and the
  repo-wide warning count holds at 31.
- **Every row of [Mutation results](#mutation-results) reproduces, with the counts as written.**
  `disabled={running}` dropped: 4 red in `hazbot-button.test.tsx` and 5 in `bottom-bar.test.tsx`.
  `cleanup = true` dropped: both teardown cases red. Log gate without `(intro || tourEngine)`: the
  pre-open case red, alone. Log gate without `simulation.simulationRunning`: the plain-dismiss case
  red, alone. Teardown without `setTourActive(false)`: the reopen case red, alone. `.noHazbot` gate
  dropped: the closed-panel case red, alone.
- **Cypress is 10 passing of 10 in 39s headless**, `CI=true npx cypress run --browser chrome`, with
  the `APP_URL` change, the eighth control at every call site and the new opacity case. The file has
  since gained WM-42's state 8, so the same work now lands 11 cases and ten call sites. The
  config's swiftshader branch does cover WebGL: the interactive `cypress open` is not needed.
- **The 0.25 that requirement 30 rests on was re-measured in a browser rather than trusted.** With
  the `runDisabled` half of the shared SCSS rule deleted, the opacity case fails reading `'0.25'`
  against an expected `'0.35'`, and nothing else in either suite moves. The `.hazbotButtonWrap
  .runDisabled .hazbotButton` shape does beat MUI without `!important`, and no broader disabled rule
  in `bottom-bar.scss` or `icon-button.scss` reaches this button.
- **A second teardown in one session behaves.** Probed: open the intro, run, pause, reopen, resume.
  The reopen lands in `.coached`, the resume logs a second `HazbotCoachMarkHiddenByRun`, and the
  wrapper ends on the disabled state with no `coached`/`noHazbot` residue. No case is needed for it;
  it is recorded so the question is not re-opened.
- **Requirements coverage is complete except where the first finding below says otherwise.** Every
  bullet of requirement 42 maps to a case in the plan, and requirements 27 to 44 each map to a step,
  with the single exception the second finding names.

### QA Engineer (second pass)

#### RESOLVED: the blink test's "blinks stop while running" assertion cannot fail, and requirement 42 asked for the shape that would

Requirement 42 asks for the blink case "with `Math.random` pinned **and timers advanced to the exact
boundary**", because the earlier pass found that a naive advance passes against unmodified code. The
plan pins `Math.random` and then advances 5000ms, which is not the boundary and reproduces the trap in
a new form.

With `Math.random` pinned to 0 the cycle is idle 1000, closed 180, open, 80, repeat: 1260ms. The case
advances 900, starts the run, then advances 5000, landing at t = 5900. Under the plan's implementation
nothing is scheduled, so the robot's eyes are open. Under the mutation the case exists to catch (the
blink effect keyed `[]`, so the loop runs straight through the run) the blinks fall at 1000 to 1180,
2260 to 2440, 3520 to 3700 and 4780 to 4960: t = 5900 is mid-idle, eyes open. Both assertions read the
same either way.

Measured, with the two pause assertions isolated into their own case and the effect keyed `[]`:

```
✓ pause assertion only (plan wording: advance 5000)
✕ pause assertion at the exact boundary (advance 100 to t=1000)
```

The full case does still go red under that mutation, which is why the mutation table is not wrong, but
it goes red on its *last* assertion, the "restarts from the top" half. The two assertions that carry
requirement 33's "the blink cycle stops" are decoration: delete the code they guard and they stay
green. Split the case in two later, or drop the tail, and the coverage disappears silently.

Suggested resolution: advance to the boundary first and keep the long-stretch check after it, e.g.
`advanceTimersByTime(100)` (t = 1000, the exact tick the un-gated loop would blink on) with its
assertion, then a further `advanceTimersByTime(4900)` and the existing assertions. One extra `act`,
and the mutation then fails on the assertion that names it.

**Decision**: accepted, applied as suggested. The case now advances 100ms to t = 1000, asserts there,
then advances the remaining 4900ms and keeps the existing pair, so the boundary check and the
stays-stopped check are separate assertions. Measured both directions on this branch: the edited case
passes against the plan's implementation, and with the blink effect keyed `[]` it fails on the t = 1000
assertion (`Received: <svg-mock data-testid="hazbot-blinks" />`) rather than on the tail. The
[Mutation results](#mutation-results) row for that mutation now names which assertion catches it. The
long-stretch assertions are kept rather than replaced: on their own they are the ones that cannot
fail, but they are what shows the robot does not blink again later in a run.

---

### Education Researcher (second pass)

#### RESOLVED: the plan's `LOGGED-EVENTS.md` deliverable is missing requirement 39's WM-32 half

Requirement 39 names two doc obligations beyond the table row. The plan carries one of them, the
`categoryId` subsection, in full. It does not carry the other, and it never mentions WM-32 at all.

Verified on the unmerged branch: `WM-32-skip-satisfied-steps`'s requirements line 42 makes it a
deliverable that "`LOGGED-EVENTS.md`'s rows for `HazbotShowMeClicked`, `HazbotTourCompleted` and
`HazbotTourDismissed` are updated in the same PR to state which coordinate system each field is in".
`HazbotCoachMarkHiddenByRun` carries `lastStepIndex` too, so requirement 39 and the Technical Note
both say that whichever story lands second adds the fourth name to that enumeration. If WM-32 merges
first, an implementer working from `implementation.md` alone ships a table where three events declare
their coordinate system and the fourth, whose whole terminal-index reading depends on being in the
same one, does not.

Suggested resolution: add it to the second step's `LOGGED-EVENTS.md` paragraph as a conditional line,
in the same place the `categoryId` retitle is recorded, and add `LOGGED-EVENTS.md`'s coordinate-system
note to that step's "Files affected" description. It is one sentence, and its whole value is that it
is written down where the implementer will be looking.

**Decision**: accepted, applied as suggested. The second step's `LOGGED-EVENTS.md` section gains a
paragraph stating the conditional edit, which coordinate system WM-32 resolved to, why the new event
belongs in the enumeration, and what each merge order implies; its "Files affected" line names the
note. Nothing about the row or the `categoryId` subsection changes: those are unconditional and were
already complete.

---

### Senior Engineer (second pass)

#### RESOLVED: the Cypress header rewrite dates a change instead of describing the contract

The replacement header reads "asserting the HTML `disabled` attribute of all eight controls per the
Zeplin matrix (**Hazbot joined the matrix in WM-31**, disabled for the duration of a run)". "Joined the
matrix in WM-31" is a changelog entry: it tells a reader when something changed rather than what is
true, which is the one thing the repo's comment standard rules out, and it is the note most likely to
be flagged in review. The ticket reference itself is fine and matches the file's existing style (the
header already opens on WM-24).

Suggested resolution: keep the reference, drop the dating, e.g. "(Hazbot is disabled for the duration
of a run, WM-31)". The other new comments in the plan do not have this problem: the SCSS note about
MUI's source order, the teardown's note about the `cleanup`-skipped branch and the test note about the
mock not firing `onDestroyed` all describe mechanisms that stay true.

**Decision**: accepted, applied as suggested. The header now reads "(Hazbot is disabled for the
duration of a run, WM-31)". The rest of the header rewrite, which requirement 44 asks for on two
counts, is unchanged: it still corrects the control count and still replaces the "no automated
assertion of the rendered styles" claim that the opacity case makes false.

---
