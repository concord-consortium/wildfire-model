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

it("renders the avatar + two-line label", () => {
  renderWithStores();
  expect(screen.getByTestId("hazbot-button")).toHaveTextContent("HazbotAnalysis");
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

it("click sets showHazbotFeedback, clears the pulse, and logs HazbotButtonClicked", () => {
  const logSpy = jest.spyOn(logModule, "log");
  const { stores } = renderWithStores();
  act(() => { stores.ui.hazbotPulseArmed = true; });
  fireEvent.click(screen.getByTestId("hazbot-button"));
  expect(stores.ui.showHazbotFeedback).toBe(true);
  expect(stores.ui.hazbotPulseArmed).toBe(false);
  // No engine in this test, so the click logs matchedCategory: null.
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

  it("does not open when there is no engine / matched category (guarded no-op)", () => {
    mockGetEngine.mockReturnValue(undefined);
    renderWithStores();
    openPanel();
    expect(mockCreateEngine).not.toHaveBeenCalled();
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
});
