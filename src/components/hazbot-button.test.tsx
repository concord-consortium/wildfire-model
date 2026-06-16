import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { act } from "react-dom/test-utils";
import { Provider } from "mobx-react";
import { HazbotButton } from "./hazbot-button";
import { createStores } from "../models/stores";
import * as logModule from "../log";

// getAnalysisEngine returns undefined when no URL flags are set (jsdom), so the
// click path logs matchedCategory: null — exactly the pre-run/no-engine contract.

function renderWithStores(stores = createStores()) {
  return { stores, ...render(<Provider stores={stores}><HazbotButton /></Provider>) };
}

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
  // The `ready` class AND the .pulse rings live on the WRAPPER div, not the
  // <Button> that carries data-testid. Assert on the wrapper (identity-obj-proxy
  // makes css.ready === "ready", so the className contains it literally) and on
  // the count of `hazbot-pulse` rings.
  const wrap = () => screen.getByTestId("hazbot-button-wrap");
  expect(wrap().className).not.toMatch(/ready/);
  expect(screen.queryAllByTestId("hazbot-pulse").length).toBe(0);
  act(() => {
    stores.simulation.simulationStarted = true;
    stores.simulation.simulationRunning = false;
    stores.ui.hazbotPulseArmed = true;
  });
  expect(wrap().className).toMatch(/ready/);
  expect(screen.queryAllByTestId("hazbot-pulse").length).toBe(2);
  // A run in progress hides the pulse.
  act(() => { stores.simulation.simulationRunning = true; });
  expect(wrap().className).not.toMatch(/ready/);
  expect(screen.queryAllByTestId("hazbot-pulse").length).toBe(0);
});

it("click sets showHazbotFeedback, clears the pulse, and logs HazbotButtonClicked", () => {
  const logSpy = jest.spyOn(logModule, "log");
  const { stores } = renderWithStores();
  act(() => { stores.ui.hazbotPulseArmed = true; });
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
