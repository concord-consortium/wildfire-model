import React from "react";
import { renderHook } from "@testing-library/react";
import { Provider } from "mobx-react";
import { UIModel, Interaction } from "../models/ui";
import { useCustomCursor } from "./use-custom-cursors";

const renderCursor = (ui: UIModel) => {
  // Provider rejects a new stores object on re-render, so build it once per test.
  const stores = { ui };
  return renderHook(() => useCustomCursor(), {
    wrapper: ({ children }: { children?: React.ReactNode }) =>
      <Provider stores={stores}>{children}</Provider>
  });
};

describe("useCustomCursor", () => {
  beforeEach(() => { document.body.style.cursor = ""; });

  it("shows the fire line art while the tool is armed and nothing is placed", () => {
    const ui = new UIModel();
    ui.interaction = Interaction.DrawFireLine;
    renderCursor(ui);
    expect(document.body.style.cursor).toContain("url(");
  });

  it("drops the fire line art once the marker starts following the pointer", () => {
    const ui = new UIModel();
    ui.interaction = Interaction.DrawFireLine;
    ui.fireLinePlacementInProgress = true;
    renderCursor(ui);
    // Two copies of the same icon would otherwise show once the length clamp
    // separates the marker from the pointer.
    expect(document.body.style.cursor).toBe("crosshair");
  });

  it("returns to the fire line art when the placement flag clears", () => {
    const ui = new UIModel();
    ui.interaction = Interaction.DrawFireLine;
    ui.fireLinePlacementInProgress = true;
    const { rerender } = renderCursor(ui);
    ui.fireLinePlacementInProgress = false;
    rerender();
    expect(document.body.style.cursor).toContain("url(");
  });

  it("still prefers the dragging cursor", () => {
    const ui = new UIModel();
    ui.interaction = Interaction.DrawFireLine;
    ui.fireLinePlacementInProgress = true;
    ui.dragging = true;
    renderCursor(ui);
    expect(document.body.style.cursor).toBe("move");
  });
});
