import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { Provider } from "mobx-react";
import { HazbotButton, parseFeedback } from "./hazbot-button";
import { createStores } from "../models/stores";
import * as logModule from "../log";
import { getAnalysisEngine } from "../hazbot/wildfire";
import { computeCategorySelectionForEngine } from "../hazbot/engine";
import { createCoachmarksEngine } from "@concord-consortium/coachmarks";

// The coachmarks engine and the analysis-engine reads are mocked: these unit tests
// cover the consumer wiring (what we pass to the engine, the dismiss→flag-reset
// callbacks, reopen, and the .coached class), not the library's popover rendering
// (covered by the library's own tests) or anchor placement (Playwright vs Zeplin).
jest.mock("@concord-consortium/coachmarks", () => ({ createCoachmarksEngine: jest.fn() }));
jest.mock("../hazbot/wildfire", () => ({
  ...jest.requireActual("../hazbot/wildfire"),
  getAnalysisEngine: jest.fn(),
}));
// computeCategorySelectionForEngine, not computeMatchedCategoryForEngine: the component
// reads the selection, and the selection reaches the floor through evaluator.ts's own
// local binding rather than through this barrel, so overriding the floor here is inert.
jest.mock("../hazbot/engine", () => ({
  ...jest.requireActual("../hazbot/engine"),
  computeCategorySelectionForEngine: jest.fn(),
}));

const mockGetEngine = getAnalysisEngine as unknown as jest.Mock;
const mockSelection = computeCategorySelectionForEngine as unknown as jest.Mock;
// Most cases only care which category the feedback comes from, so they stub a selection
// whose window matched nothing and let `used` fall back to `best`.
const selection = (best: number | null, current: number | null = null) =>
  ({ best, current, used: current ?? best });
const mockCreateEngine = createCoachmarksEngine as unknown as jest.Mock;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cmOpts: any;
let cm: { highlight: jest.Mock; drive: jest.Mock; destroy: jest.Mock };

function renderWithStores(stores = createStores()) {
  return { stores, ...render(<Provider stores={stores}><HazbotButton /></Provider>) };
}

// A minimal analysis engine: the panel reads engine.ruleSet.categories[].feedback.
// NOTE for ladder fixtures: the HIGHEST id is the top category, whose level 2 is the
// rule-set's `repeatFeedback` rather than its own Round columns. A fixture holding only
// the category under test silently makes it the top one and pins it at level 1, so any
// Round-column case needs a higher-id filler category.
function engineWith(
  categories: { id: number; feedback: string; feedbackRound2?: string; feedbackRound3?: string }[],
  repeatFeedback?: { id: number; studentAction: string; feedback: string },
  id?: string,
) {
  return { ruleSet: { id, categories, repeatFeedback } } as unknown as ReturnType<typeof getAnalysisEngine>;
}

// Open the panel: click the button, then let the panel's open-after-scale-up
// fallback timer (400ms) fire. The panel normally opens on the avatar's transform
// transitionend, but jsdom doesn't run CSS transitions, so we drive the fallback.
function openPanel() {
  jest.useFakeTimers();
  try {
    fireEvent.click(screen.getByTestId("hazbot-button"));
    act(() => { jest.advanceTimersByTime(400); });
  } finally {
    jest.useRealTimers();
  }
}

function lastHighlightSpec() {
  const calls = cm.highlight.mock.calls;
  return calls[calls.length - 1]?.[0];
}

beforeEach(() => {
  cm = { highlight: jest.fn(), drive: jest.fn(), destroy: jest.fn() };
  // Default: no engine — matches the pre-engine state the WM-6 tests below rely on.
  mockGetEngine.mockReset().mockReturnValue(undefined);
  mockSelection.mockReset().mockReturnValue(selection(null));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreateEngine.mockReset().mockImplementation((opts: any) => { cmOpts = opts; return cm; });
});

afterEach(() => {
  // Restore Math.random / log / console.error spies so mock state (e.g. a pinned
  // Math.random) doesn't leak across tests — the repo jest config sets no
  // restoreMocks.
  jest.restoreAllMocks();
});

it("renders the avatar layers + two-line label", () => {
  renderWithStores();
  expect(screen.getByTestId("hazbot-button")).toHaveTextContent("HazbotAnalysis");
  // Avatar SVG layers: Back is always present; the default (non-blink) state
  // shows the open Eyes layer and omits the Blinks layer.
  expect(screen.getByTestId("hazbot-back")).toBeInTheDocument();
  expect(screen.getByTestId("hazbot-eyes")).toBeInTheDocument();
  expect(screen.queryByTestId("hazbot-blinks")).toBeNull();
});

it("shows the ready/pulse state only when armed && started && !running", () => {
  const { stores } = renderWithStores();
  // The pulse is a box-shadow animation gated by the `ready` class on the WRAPPER
  // div (identity-obj-proxy makes css.ready === "ready", so the className contains
  // it literally).
  const wrap = () => screen.getByTestId("hazbot-button-wrap");
  expect(wrap().className).not.toMatch(/ready/);
  act(() => {
    stores.simulation.simulationStarted = true;
    stores.simulation.simulationRunning = false;
    stores.ui.hazbotPulseArmed = true;
  });
  expect(wrap().className).toMatch(/ready/);
  // A run in progress hides the pulse.
  act(() => { stores.simulation.simulationRunning = true; });
  expect(wrap().className).not.toMatch(/ready/);
});

it("click clears the pulse and logs HazbotButtonClicked (no engine → panel no-ops)", () => {
  const logSpy = jest.spyOn(logModule, "log");
  const { stores } = renderWithStores();
  act(() => { stores.ui.hazbotPulseArmed = true; });
  fireEvent.click(screen.getByTestId("hazbot-button"));
  // No engine in jsdom, so the panel can't open: handleClick sets the flag, then
  // the guarded effect clears it back (so the button never sticks "Large"). The
  // pulse is acknowledged and the click logs all three category fields as null.
  expect(stores.ui.showHazbotFeedback).toBe(false);
  expect(stores.ui.hazbotPulseArmed).toBe(false);
  expect(logSpy).toHaveBeenCalledWith("HazbotButtonClicked",
    { matchedCategory: null, categoryUsed: null, categoryCurrent: null });
});

it("blinks on the AP-79 schedule (fake timers + fixed random)", () => {
  jest.useFakeTimers();
  jest.spyOn(Math, "random").mockReturnValue(0); // idle = 1000ms exactly
  renderWithStores();
  // Eyes-open layer present initially; blink layer absent.
  expect(screen.queryByTestId("hazbot-blinks")).toBeNull();
  expect(screen.getByTestId("hazbot-eyes")).toBeInTheDocument();
  act(() => { jest.advanceTimersByTime(1000); });   // idle elapses -> eyes closed
  expect(screen.getByTestId("hazbot-blinks")).toBeInTheDocument();
  act(() => { jest.advanceTimersByTime(180); });     // blink ends -> eyes open
  expect(screen.queryByTestId("hazbot-blinks")).toBeNull();
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

describe("parseFeedback", () => {
  it("strips the leading Hazbot: prefix and the trailing [token]", () => {
    expect(parseFeedback("Hazbot: Hello there [Okay]")).toEqual({ body: "Hello there", label: "Okay" });
  });
  it("preserves **bold** markup in the body", () => {
    expect(parseFeedback("Hazbot: **Remember**, run it [Show me]"))
      .toEqual({ body: "**Remember**, run it", label: "Show me" });
  });
  it("handles a token on its own last line", () => {
    expect(parseFeedback("Hazbot: line one\n[Got it!]")).toEqual({ body: "line one", label: "Got it!" });
  });
  it("returns an empty label when there is no token", () => {
    expect(parseFeedback("Hazbot: just text")).toEqual({ body: "just text", label: "" });
  });
  it("works without a Hazbot: prefix", () => {
    expect(parseFeedback("Plain body [Hooray!]")).toEqual({ body: "Plain body", label: "Hooray!" });
  });
});

describe("Hazbot feedback panel", () => {
  // The click also calls log(), which routes through the analysis engine's
  // consume(); the fake engine here has no consume(), and logging is irrelevant to
  // these tests, so no-op it.
  let logSpy: jest.SpyInstance;
  beforeEach(() => { logSpy = jest.spyOn(logModule, "log").mockImplementation(() => undefined); });

  it("opens a coach mark with the matched category's parsed feedback and token label", () => {
    mockGetEngine.mockReturnValue(
      engineWith([{ id: 1, feedback: "Hazbot: **Remember**, you need to run the model.\n[Okay]" }]),
    );
    mockSelection.mockReturnValue(selection(1));
    renderWithStores();
    openPanel();

    expect(mockCreateEngine).toHaveBeenCalledTimes(1);
    expect(cmOpts.showButtons).toEqual(["next", "close"]);
    expect(cmOpts.doneBtnText).toBe("Okay");
    expect(cmOpts.showOutlineRing).toBe(false);
    const spec = lastHighlightSpec();
    expect(spec.popover.description).toBe("**Remember**, you need to run the model.");
    expect(spec.popover.side).toBe("top");
  });

  // The component must render and log from `used` in BOTH directions, neither re-deriving
  // the choice nor clamping it to `best`. The rule that produces `used` is stubbed here
  // and pinned in evaluator.test.ts.
  const windowCategories = [
    { id: 2, feedback: "Hazbot: Try changing a variable.\n[Okay]" },
    { id: 3, feedback: "Hazbot: Nice, now add a fire line.\n[Okay]" },
    { id: 4, feedback: "Hazbot: Compare the two runs.\n[Okay]" },
    { id: 5, feedback: "Hazbot: Great job!\n[Hooray!]" },
  ];

  it("shows and logs the windowed category when it is below the best one", () => {
    mockGetEngine.mockReturnValue(engineWith(windowCategories));
    mockSelection.mockReturnValue({ best: 5, current: 4, used: 4 });
    renderWithStores();
    openPanel();

    expect(logSpy).toHaveBeenCalledWith("HazbotButtonClicked",
      { matchedCategory: 5, categoryUsed: 4, categoryCurrent: 4 });
    expect(lastHighlightSpec().popover.description).toBe("Compare the two runs.");
  });

  it("shows and logs the windowed category when it is above the best one", () => {
    mockGetEngine.mockReturnValue(engineWith(windowCategories));
    mockSelection.mockReturnValue({ best: 2, current: 3, used: 3 });
    renderWithStores();
    openPanel();

    expect(logSpy).toHaveBeenCalledWith("HazbotButtonClicked",
      { matchedCategory: 2, categoryUsed: 3, categoryCurrent: 3 });
    expect(lastHighlightSpec().popover.description).toBe("Nice, now add a fire line.");
  });

  it("does not open when there is no engine / matched category, and resets the flag", () => {
    mockGetEngine.mockReturnValue(undefined);
    const { stores } = renderWithStores();
    openPanel();
    expect(mockCreateEngine).not.toHaveBeenCalled();
    // The guarded no-op clears the flag so the button doesn't stay stuck "Large".
    expect(stores.ui.showHazbotFeedback).toBe(false);
  });

  it("resets ui.showHazbotFeedback on dismiss via onDestroyed (fires on all routes)", () => {
    mockGetEngine.mockReturnValue(engineWith([{ id: 1, feedback: "Hazbot: hi [Okay]" }]));
    mockSelection.mockReturnValue(selection(1));
    const { stores } = renderWithStores();
    openPanel();
    expect(stores.ui.showHazbotFeedback).toBe(true);
    act(() => { cmOpts.onDestroyed(); });
    expect(stores.ui.showHazbotFeedback).toBe(false);
  });

  it("routes ×/Escape (onCancelRequested) through engine.destroy()", () => {
    mockGetEngine.mockReturnValue(engineWith([{ id: 1, feedback: "Hazbot: hi [Okay]" }]));
    mockSelection.mockReturnValue(selection(1));
    renderWithStores();
    openPanel();
    act(() => { cmOpts.onCancelRequested(); });
    expect(cm.destroy).toHaveBeenCalled();
  });

  it("reopens with the then-current matched category after dismiss", () => {
    mockGetEngine.mockReturnValue(engineWith([
      { id: 1, feedback: "Hazbot: Cat one [Okay]" },
      { id: 2, feedback: "Hazbot: Cat two [Show me]" },
    ]));
    mockSelection.mockReturnValue(selection(1));
    renderWithStores();

    openPanel();
    expect(lastHighlightSpec().popover.description).toBe("Cat one");
    expect(cmOpts.doneBtnText).toBe("Okay");

    act(() => { cmOpts.onDestroyed(); });
    mockSelection.mockReturnValue(selection(2));
    openPanel();
    expect(lastHighlightSpec().popover.description).toBe("Cat two");
    expect(cmOpts.doneBtnText).toBe("Show me");
  });

  it("suppresses the pulse halo while the coach mark is open, even if a run re-arms it", () => {
    mockGetEngine.mockReturnValue(engineWith([{ id: 1, feedback: "Hazbot: hi [Okay]" }]));
    mockSelection.mockReturnValue(selection(1));
    const { stores } = renderWithStores();
    const wrap = () => screen.getByTestId("hazbot-button-wrap");
    openPanel(); // clears the arm and opens the coach mark (showHazbotFeedback = true)
    // Simulate a run ending mid-coach-mark, which re-arms the pulse.
    act(() => {
      stores.simulation.simulationStarted = true;
      stores.simulation.simulationRunning = false;
      stores.ui.hazbotPulseArmed = true;
    });
    expect(stores.ui.showHazbotFeedback).toBe(true);
    expect(wrap().className).not.toMatch(/ready/); // suppressed while the panel is open
  });

  it("toggles the .coached Large-state class with ui.showHazbotFeedback", () => {
    mockGetEngine.mockReturnValue(engineWith([{ id: 1, feedback: "Hazbot: hi [Okay]" }]));
    mockSelection.mockReturnValue(selection(1));
    renderWithStores();
    const wrap = () => screen.getByTestId("hazbot-button-wrap");
    expect(wrap().className).not.toMatch(/coached/);
    openPanel();
    expect(wrap().className).toMatch(/coached/);
    act(() => { cmOpts.onDestroyed(); });
    expect(wrap().className).not.toMatch(/coached/);
  });

  it("suppresses the robot avatar badge on the intro popover (showAvatar: false)", () => {
    mockGetEngine.mockReturnValue(engineWith([{ id: 1, feedback: "Hazbot: hi [Okay]" }]));
    mockSelection.mockReturnValue(selection(1));
    renderWithStores();
    openPanel();
    expect(cmOpts.showAvatar).toBe(false);
  });
});

// A coaching engine: ruleSet.id "23" with category 2 (a [Show me] coaching category
// present in tour-data.generated). The intro reads engine.ruleSet.{id,categories}.
// Shared by the two coach-mark describes below.
function coachingEngine() {
  return {
    ruleSet: {
      id: "23",
      categories: [{ id: 2, feedback: "Hazbot: Looks like defaults. I can help!\n[Show me]" }],
    },
  } as unknown as ReturnType<typeof getAnalysisEngine>;
}

// Record every engine created (intro then tour) with its opts + spies.
let engines: Array<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  opts: any; highlight: jest.Mock; drive: jest.Mock; destroy: jest.Mock;
}>;

function useCoachingEngine() {
  engines = [];
  mockGetEngine.mockReset().mockReturnValue(coachingEngine());
  mockSelection.mockReset().mockReturnValue(selection(2));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockCreateEngine.mockReset().mockImplementation((opts: any) => {
    const e = { opts, highlight: jest.fn(), drive: jest.fn(), destroy: jest.fn() };
    engines.push(e);
    return e;
  });
}

// Simulate the [Show me] activation: the intro's done button routes moveNext →
// destroy → onDestroyed with NO onCancelRequested first.
function activateShowMe() {
  act(() => { engines[0].opts.onDestroyed(); });
}

describe("Hazbot walk-through tour", () => {
  beforeEach(useCoachingEngine);

  it("launches a gated tour on [Show me]: destroys intro, drives a tour engine, logs HazbotShowMeClicked", () => {
    const logSpy = jest.spyOn(logModule, "log").mockImplementation(() => undefined);
    renderWithStores();
    openPanel();
    // Intro engine: badge suppressed, not gated.
    expect(engines).toHaveLength(1);
    expect(engines[0].opts.showAvatar).toBe(false);

    activateShowMe();
    // Tour engine created and driven.
    expect(engines).toHaveLength(2);
    expect(engines[1].opts.actionGated).toBe(true);
    expect(engines[1].opts.showProgress).toBe(true);
    expect(engines[1].opts.progressText).toBe("Step {{current}} of {{total}}");
    expect(engines[1].opts.doneBtnText).toBe("Got it!");
    expect(engines[1].opts.showAvatar).toBeUndefined(); // badge shown on tour (library default)
    expect(engines[1].drive).toHaveBeenCalledTimes(1);
    const driven = engines[1].drive.mock.calls[0][0];
    expect(driven).toHaveLength(3); // 23/2 is a 3-step tour
    expect(logSpy).toHaveBeenCalledWith(
      "HazbotShowMeClicked", { ruleSetId: "23", categoryId: 2, stepCount: 3, feedbackLevel: 1 },
    );
  });

  it("swaps the button to the faded .noHazbot state during the tour (intro keeps .coached)", () => {
    jest.spyOn(logModule, "log").mockImplementation(() => undefined);
    renderWithStores();
    const wrap = () => screen.getByTestId("hazbot-button-wrap");
    openPanel();
    // Intro popover open → enlarged-robot "coached" state, not yet faded.
    expect(wrap().className).toMatch(/coached/);
    expect(wrap().className).not.toMatch(/noHazbot/);
    // [Show me] launches the tour → faded "No Hazbot" state, no longer coached.
    activateShowMe();
    expect(wrap().className).toMatch(/noHazbot/);
    expect(wrap().className).not.toMatch(/coached/);
    // Completing the tour clears both.
    act(() => { engines[1].opts.onDestroyed(); });
    expect(wrap().className).not.toMatch(/noHazbot/);
    expect(wrap().className).not.toMatch(/coached/);
  });

  it("logs HazbotTourCompleted on the terminal Done (tour onDestroyed without cancel)", () => {
    const logSpy = jest.spyOn(logModule, "log").mockImplementation(() => undefined);
    const { stores } = renderWithStores();
    openPanel();
    activateShowMe();
    // Walk the step index forward, then complete via Done.
    act(() => { engines[1].opts.onHighlightStarted(undefined, {}, { state: { activeIndex: 2 } }); });
    act(() => { engines[1].opts.onDestroyed(); });
    expect(logSpy).toHaveBeenCalledWith(
      "HazbotTourCompleted", { ruleSetId: "23", categoryId: 2, lastStepIndex: 2, feedbackLevel: 1 },
    );
    expect(logSpy).not.toHaveBeenCalledWith("HazbotTourDismissed", expect.anything());
    expect(stores.ui.showHazbotFeedback).toBe(false);
  });

  it("logs HazbotTourDismissed (not Completed) on ×/Escape (tour onCancelRequested)", () => {
    const logSpy = jest.spyOn(logModule, "log").mockImplementation(() => undefined);
    renderWithStores();
    openPanel();
    activateShowMe();
    act(() => { engines[1].opts.onHighlightStarted(undefined, {}, { state: { activeIndex: 1 } }); });
    act(() => { engines[1].opts.onCancelRequested(); });
    expect(engines[1].destroy).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      "HazbotTourDismissed", { ruleSetId: "23", categoryId: 2, lastStepIndex: 1, feedbackLevel: 1 },
    );
    expect(logSpy).not.toHaveBeenCalledWith("HazbotTourCompleted", expect.anything());
  });

  it("does NOT launch a tour or log on programmatic teardown (unmount before [Show me])", () => {
    const logSpy = jest.spyOn(logModule, "log").mockImplementation(() => undefined);
    const { unmount } = renderWithStores();
    openPanel();
    expect(engines).toHaveLength(1);
    unmount(); // cleanup runs → intro.destroy() with cleanup=true
    expect(engines).toHaveLength(1); // no tour engine created
    expect(logSpy).not.toHaveBeenCalledWith("HazbotShowMeClicked", expect.anything());
    expect(logSpy).not.toHaveBeenCalledWith("HazbotTourCompleted", expect.anything());
  });

  it("does NOT launch a tour on intro ×/Escape (onCancelRequested before Done)", () => {
    const logSpy = jest.spyOn(logModule, "log").mockImplementation(() => undefined);
    renderWithStores();
    openPanel();
    // ×/Escape on the intro fires onCancelRequested (sets introCancelled) then destroy → onDestroyed.
    act(() => { engines[0].opts.onCancelRequested(); });
    act(() => { engines[0].opts.onDestroyed(); });
    expect(engines).toHaveLength(1); // no tour
    expect(logSpy).not.toHaveBeenCalledWith("HazbotShowMeClicked", expect.anything());
  });
});

describe("Hazbot feedback levels", () => {
  // Closing through ×/Escape rather than the bare onDestroyed the feedback-panel block
  // uses: on a coaching category onDestroyed alone IS the [Show me] activation and
  // launches a tour, so the second press of a ladder walk would never happen.
  const dismiss = () => {
    act(() => { cmOpts.onCancelRequested(); });
    act(() => { cmOpts.onDestroyed(); });
  };

  // A coaching category with a full ladder, plus a higher-id filler so the category
  // under test is not the top one.
  const fullLadder = () => engineWith([
    {
      id: 2,
      feedback: "Hazbot: Level one\n[Show me]",
      feedbackRound2: "Hazbot: Level two\n[Show me]",
      feedbackRound3: "Hazbot: Level three\n[Okay]",
    },
    { id: 9, feedback: "Hazbot: Top\n[Hooray!]" },
  ]);

  // log()'s payload parameter is typed `object`, so the payloads are widened once here
  // rather than casting at each assertion.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payloads = (logSpy: jest.SpyInstance, name: string): any[] => logSpy.mock.calls
    .filter((c) => c[0] === name).map((c) => c[1]);

  const shownLevels = (logSpy: jest.SpyInstance) =>
    payloads(logSpy, "HazbotFeedbackShown").map((p) => [p.feedbackLevel, p.source]);

  it("walks level 1, 2, 3 and then repeats level 3", () => {
    const logSpy = jest.spyOn(logModule, "log").mockImplementation(() => undefined);
    mockGetEngine.mockReturnValue(fullLadder());
    mockSelection.mockReturnValue(selection(2));
    const { stores } = renderWithStores();

    const bodies: string[] = [];
    for (let i = 0; i < 4; i++) {
      openPanel();
      bodies.push(lastHighlightSpec().popover.description);
      dismiss();
    }
    expect(bodies).toEqual(["Level one", "Level two", "Level three", "Level three"]);
    expect(shownLevels(logSpy)).toEqual([
      [1, "level1"], [2, "round2"], [3, "round3"], [3, "round3"],
    ]);
    expect(stores.ui.hazbotFeedbackLevels.get(2)).toBe(3);
    expect(stores.ui.hazbotLastFeedbackShown).toEqual({ level: 3, source: "round3" });
  });

  it("serves the top category's repeat click from the rule-set's repeat feedback", () => {
    const logSpy = jest.spyOn(logModule, "log").mockImplementation(() => undefined);
    mockGetEngine.mockReturnValue(engineWith(
      [
        { id: 1, feedback: "Hazbot: Middle\n[Okay]" },
        {
          id: 5,
          feedback: "Hazbot: Great job!\n[Hooray!]",
          feedbackRound2: "Hazbot: Fill-down two\n[Okay]",
          feedbackRound3: "Hazbot: Fill-down three\n[Okay]",
        },
      ],
      { id: 100, studentAction: "Re-clicked", feedback: "Hazbot: Keep going!\n[Got it!]" },
    ));
    mockSelection.mockReturnValue(selection(5));
    renderWithStores();

    const bodies: string[] = [];
    for (let i = 0; i < 3; i++) {
      openPanel();
      bodies.push(lastHighlightSpec().popover.description);
      dismiss();
    }
    // The category's own Round 2/3 content is never reached.
    expect(bodies).toEqual(["Great job!", "Keep going!", "Keep going!"]);
    expect(shownLevels(logSpy)).toEqual([
      [1, "level1"], [2, "category100"], [2, "category100"],
    ]);
  });

  it("repeats level 1 for a category with no Round content", () => {
    const logSpy = jest.spyOn(logModule, "log").mockImplementation(() => undefined);
    mockGetEngine.mockReturnValue(engineWith([
      { id: 2, feedback: "Hazbot: Only one\n[Okay]" },
      { id: 9, feedback: "Hazbot: Top\n[Hooray!]" },
    ]));
    mockSelection.mockReturnValue(selection(2));
    renderWithStores();

    for (let i = 0; i < 3; i++) { openPanel(); dismiss(); }
    expect(shownLevels(logSpy)).toEqual([[1, "level1"], [1, "level1"], [1, "level1"]]);
  });

  it("tracks levels per category, so leaving and returning resumes where it left off", () => {
    jest.spyOn(logModule, "log").mockImplementation(() => undefined);
    mockGetEngine.mockReturnValue(engineWith([
      { id: 2, feedback: "Hazbot: Two one\n[Okay]", feedbackRound2: "Hazbot: Two two\n[Okay]" },
      { id: 3, feedback: "Hazbot: Three one\n[Okay]", feedbackRound2: "Hazbot: Three two\n[Okay]" },
      { id: 9, feedback: "Hazbot: Top\n[Hooray!]" },
    ]));
    mockSelection.mockReturnValue(selection(2));
    const { stores } = renderWithStores();

    openPanel();
    expect(lastHighlightSpec().popover.description).toBe("Two one");
    dismiss();
    mockSelection.mockReturnValue(selection(3));
    openPanel();
    expect(lastHighlightSpec().popover.description).toBe("Three one");
    dismiss();
    mockSelection.mockReturnValue(selection(2));
    openPanel();
    expect(lastHighlightSpec().popover.description).toBe("Two two");
    dismiss();

    expect(Array.from(stores.ui.hazbotFeedbackLevels.entries())).toEqual([[2, 2], [3, 1]]);
  });

  it("does not spend a level for a second press while the popover is already open", () => {
    const logSpy = jest.spyOn(logModule, "log").mockImplementation(() => undefined);
    mockGetEngine.mockReturnValue(fullLadder());
    mockSelection.mockReturnValue(selection(2));
    const { stores } = renderWithStores();

    openPanel();
    openPanel(); // the flag is already true, so the effect never re-runs
    expect(shownLevels(logSpy)).toEqual([[1, "level1"]]);
    expect(logSpy.mock.calls.filter((c) => c[0] === "HazbotButtonClicked")).toHaveLength(2);
    expect(stores.ui.hazbotFeedbackLevels.get(2)).toBe(1);
  });

  it("never logs a level above the number of strings the category carries", () => {
    const logSpy = jest.spyOn(logModule, "log").mockImplementation(() => undefined);
    mockGetEngine.mockReturnValue(engineWith([
      { id: 2, feedback: "Hazbot: One\n[Okay]", feedbackRound2: "Hazbot: Two\n[Okay]" },
      { id: 9, feedback: "Hazbot: Top\n[Hooray!]" },
    ]));
    mockSelection.mockReturnValue(selection(2));
    renderWithStores();

    for (let i = 0; i < 5; i++) { openPanel(); dismiss(); }
    const levels = shownLevels(logSpy).map(([level]) => level);
    expect(Math.max(...levels)).toBe(2);
  });

  it("cancels a deferred open when a reset lands before the popover appears", () => {
    const logSpy = jest.spyOn(logModule, "log").mockImplementation(() => undefined);
    mockGetEngine.mockReturnValue(fullLadder());
    mockSelection.mockReturnValue(selection(2));
    const { stores } = renderWithStores();
    stores.ui.hazbotFeedbackLevels.set(2, 2);

    jest.useFakeTimers();
    try {
      // The press schedules the open on the avatar's transitionend and on the 400ms
      // fallback; the reset (Clear All / window.test) arrives while both are pending.
      fireEvent.click(screen.getByTestId("hazbot-button"));
      act(() => { stores.ui.resetHazbotFeedback(); });
      act(() => { jest.advanceTimersByTime(400); });
    } finally {
      jest.useRealTimers();
    }

    expect(cm.highlight).not.toHaveBeenCalled();
    expect(stores.ui.hazbotFeedbackLevels.size).toBe(0);
    expect(stores.ui.hazbotLastFeedbackShown).toBeUndefined();
    expect(logSpy).not.toHaveBeenCalledWith("HazbotFeedbackShown", expect.anything());
  });

  describe("the level's own action token gates the walk-through", () => {
    // Rule-set 23 category 2 is a real coaching category, so buildTour returns a tour
    // for it and the token gate is the only thing that can suppress the launch.
    const gateEngine = (level1: string, round2?: string, round3?: string) => engineWith(
      [
        { id: 2, feedback: level1, feedbackRound2: round2, feedbackRound3: round3 },
        { id: 9, feedback: "Hazbot: Top\n[Hooray!]" },
      ],
      undefined,
      "23",
    );

    const openAndActivate = () => {
      openPanel();
      act(() => { cmOpts.onDestroyed(); }); // the [Show me] activation route
    };

    beforeEach(() => {
      mockSelection.mockReturnValue(selection(2));
    });

    it("launches at level 1 and again at level 2, then not at level 3", () => {
      const logSpy = jest.spyOn(logModule, "log").mockImplementation(() => undefined);
      mockGetEngine.mockReturnValue(gateEngine(
        "Hazbot: Level one\n[Show me]",
        "Hazbot: Level two\n[Show me]",
        "Hazbot: Level three\n[Okay]",
      ));
      renderWithStores();

      openAndActivate();
      act(() => { cmOpts.onDestroyed(); });        // finish the tour
      openAndActivate();
      act(() => { cmOpts.onDestroyed(); });
      openAndActivate();                            // level 3 is [Okay]: no tour

      const launches = payloads(logSpy, "HazbotShowMeClicked").map((p) => p.feedbackLevel);
      expect(launches).toEqual([1, 2]);
    });

    it("matches the token case-insensitively and ignores surrounding whitespace", () => {
      const logSpy = jest.spyOn(logModule, "log").mockImplementation(() => undefined);
      mockGetEngine.mockReturnValue(gateEngine("Hazbot: Level one\n[ Show Me ]"));
      renderWithStores();
      openAndActivate();
      expect(logSpy).toHaveBeenCalledWith("HazbotShowMeClicked", expect.objectContaining({
        feedbackLevel: 1,
      }));
    });
  });
});

// The pause routes themselves (Pause press, Fire Line, natural burnout, Restart) are
// driven through the real bottom-bar controls in bottom-bar.test.tsx; these cover what
// the button does with the flag.
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
    act(() => { jest.advanceTimersByTime(900); });
    act(() => { stores.simulation.simulationRunning = true; });
    // t = 1000, the exact tick an un-suspended loop would close the eyes on. Land
    // anywhere else in the cycle and eyes-open is what an un-suspended loop shows too,
    // so the assertion would read the same against both implementations.
    act(() => { jest.advanceTimersByTime(100); });
    expect(screen.queryByTestId("hazbot-blinks")).toBeNull();
    act(() => { jest.advanceTimersByTime(4900); });
    expect(screen.queryByTestId("hazbot-blinks")).toBeNull();
    expect(screen.getByTestId("hazbot-eyes")).toBeInTheDocument();
    // The run ends: the cycle restarts from a full idle rather than resuming the 100ms
    // that were left on the clock.
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
    // The real engine fires onDestroyed FROM destroy(); the mock does not, so drive it
    // or everything below is asserted against a callback that never ran. It is the
    // `cleanup` flag that has to swallow this one: without it the intro's onDestroyed
    // reads as a [Show me] activation and opens a tour mid-run.
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
    act(() => { engines[1].opts.onDestroyed(); });
    expect(logSpy).not.toHaveBeenCalledWith("HazbotTourCompleted", expect.anything());
    expect(logSpy).not.toHaveBeenCalledWith("HazbotTourDismissed", expect.anything());
    // The tour's faded state is gone; what is left is the disabled state, which keeps
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
    // The coach mark does not come back on its own when the run ends: nothing reopens
    // the panel and no third engine is created. The student has to click.
    expect(stores.ui.showHazbotFeedback).toBe(false);
    expect(engines).toHaveLength(2);
    // Watch every committed value of the wrapper's class attribute across the reopen: a
    // stale tourActive would commit one render of `.noHazbot` before the panel effect
    // clears it. takeRecords() (not disconnect()) drains records still queued in the
    // microtask.
    const seen: string[] = [];
    const observer = new MutationObserver(() => undefined);
    observer.observe(wrap(), { attributes: true, attributeFilter: ["class"], attributeOldValue: true });
    openPanel();
    // oldValue, not target.className: the target reads its FINAL value at drain time, so
    // every record would look identical and the assertion could never fail.
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
    // Any writer clearing the flag from outside the component tears the tour down
    // through the effect's cleanup path, which by design skips setTourActive(false) so
    // neither engine mis-logs. `.noHazbot` carries pointer-events:none and no `disabled`
    // attribute, so a stale tourActive leaves the button permanently unclickable.
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
    // Not `showHazbotFeedback === false`, which was already false and would pass against
    // any implementation: what "clears nothing" means here is that the run start neither
    // built a coach mark nor moved the button off its default state.
    expect(engines).toHaveLength(0);
    expect(wrap().className).not.toMatch(/coached|noHazbot/);
  });

  it("stays silent when the run starts after the click but before the popover opens", () => {
    const logSpy = jest.spyOn(logModule, "log").mockImplementation(() => undefined);
    const { stores } = renderWithStores();
    // Click without letting the open-after-scale-up timer fire: the effect's cleanup is
    // registered, but no coachmarks engine exists yet.
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
