import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { Provider } from "mobx-react";
import { HazbotButton, parseFeedback } from "./hazbot-button";
import { createStores } from "../models/stores";
import * as logModule from "../log";
import { getAnalysisEngine } from "../hazbot/wildfire";
import { computeMatchedCategoryForEngine } from "../hazbot/engine";
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
jest.mock("../hazbot/engine", () => ({
  ...jest.requireActual("../hazbot/engine"),
  computeMatchedCategoryForEngine: jest.fn(),
}));

const mockGetEngine = getAnalysisEngine as unknown as jest.Mock;
const mockMatched = computeMatchedCategoryForEngine as unknown as jest.Mock;
const mockCreateEngine = createCoachmarksEngine as unknown as jest.Mock;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cmOpts: any;
let cm: { highlight: jest.Mock; destroy: jest.Mock };

function renderWithStores(stores = createStores()) {
  return { stores, ...render(<Provider stores={stores}><HazbotButton /></Provider>) };
}

// A minimal analysis engine: the panel reads engine.ruleSet.categories[].feedback.
function engineWith(categories: { id: number; feedback: string }[]) {
  return { ruleSet: { categories } } as unknown as ReturnType<typeof getAnalysisEngine>;
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
  cm = { highlight: jest.fn(), destroy: jest.fn() };
  // Default: no engine — matches the pre-engine state the WM-6 tests below rely on.
  mockGetEngine.mockReset().mockReturnValue(undefined);
  mockMatched.mockReset();
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
  // pulse is acknowledged and the click logs matchedCategory: null.
  expect(stores.ui.showHazbotFeedback).toBe(false);
  expect(stores.ui.hazbotPulseArmed).toBe(false);
  expect(logSpy).toHaveBeenCalledWith("HazbotButtonClicked", { matchedCategory: null });
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
  beforeEach(() => { jest.spyOn(logModule, "log").mockImplementation(() => undefined); });

  it("opens a coach mark with the matched category's parsed feedback and token label", () => {
    mockGetEngine.mockReturnValue(
      engineWith([{ id: 1, feedback: "Hazbot: **Remember**, you need to run the model.\n[Okay]" }]),
    );
    mockMatched.mockReturnValue(1);
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
    mockMatched.mockReturnValue(1);
    const { stores } = renderWithStores();
    openPanel();
    expect(stores.ui.showHazbotFeedback).toBe(true);
    act(() => { cmOpts.onDestroyed(); });
    expect(stores.ui.showHazbotFeedback).toBe(false);
  });

  it("routes ×/Escape (onCancelRequested) through engine.destroy()", () => {
    mockGetEngine.mockReturnValue(engineWith([{ id: 1, feedback: "Hazbot: hi [Okay]" }]));
    mockMatched.mockReturnValue(1);
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
    mockMatched.mockReturnValue(1);
    renderWithStores();

    openPanel();
    expect(lastHighlightSpec().popover.description).toBe("Cat one");
    expect(cmOpts.doneBtnText).toBe("Okay");

    act(() => { cmOpts.onDestroyed(); });
    mockMatched.mockReturnValue(2);
    openPanel();
    expect(lastHighlightSpec().popover.description).toBe("Cat two");
    expect(cmOpts.doneBtnText).toBe("Show me");
  });

  it("toggles the .coached Large-state class with ui.showHazbotFeedback", () => {
    mockGetEngine.mockReturnValue(engineWith([{ id: 1, feedback: "Hazbot: hi [Okay]" }]));
    mockMatched.mockReturnValue(1);
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
    mockMatched.mockReturnValue(1);
    renderWithStores();
    openPanel();
    expect(cmOpts.showAvatar).toBe(false);
  });
});

describe("Hazbot walk-through tour (WM-17)", () => {
  // A coaching engine: ruleSet.id "23" with category 2 (a [Show me] coaching category
  // present in tour-data.generated). The intro reads engine.ruleSet.{id,categories}.
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

  beforeEach(() => {
    engines = [];
    mockGetEngine.mockReset().mockReturnValue(coachingEngine());
    mockMatched.mockReset().mockReturnValue(2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCreateEngine.mockReset().mockImplementation((opts: any) => {
      const e = { opts, highlight: jest.fn(), drive: jest.fn(), destroy: jest.fn() };
      engines.push(e);
      return e;
    });
  });

  // Simulate the [Show me] activation: the intro's done button routes moveNext →
  // destroy → onDestroyed with NO onCancelRequested first.
  function activateShowMe() {
    act(() => { engines[0].opts.onDestroyed(); });
  }

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
    expect(engines[1].opts.doneBtnText).toBe("Got it!");
    expect(engines[1].opts.showAvatar).toBeUndefined(); // badge shown on tour (library default)
    expect(engines[1].drive).toHaveBeenCalledTimes(1);
    const driven = engines[1].drive.mock.calls[0][0];
    expect(driven).toHaveLength(3); // 23/2 is a 3-step tour
    expect(logSpy).toHaveBeenCalledWith(
      "HazbotShowMeClicked", { ruleSetId: "23", categoryId: 2, stepCount: 3 },
    );
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
      "HazbotTourCompleted", { ruleSetId: "23", categoryId: 2, lastStepIndex: 2 },
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
      "HazbotTourDismissed", { ruleSetId: "23", categoryId: 2, lastStepIndex: 1 },
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
