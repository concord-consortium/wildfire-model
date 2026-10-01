import React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "mobx-react";
import { RightPanel } from "./right-panel";
import { UIModel } from "../models/ui";
import { log } from "../log";

jest.mock("../log", () => ({ log: jest.fn() }));
jest.mock("./graph", () => ({ Graph: () => null }));

const renderPanel = (ui: UIModel) => render(
  <Provider stores={{ ui }}>
    <RightPanel />
  </Provider>
);

const isOpen = () => screen.getByTestId("right-panel").className.includes("open");

describe("RightPanel", () => {
  beforeEach(() => (log as jest.Mock).mockClear());

  it("opens and closes the graph from its tab, logging each change", async () => {
    const ui = new UIModel();
    renderPanel(ui);
    expect(isOpen()).toBe(false);

    await userEvent.click(screen.getByTestId("right-panel-tab"));
    expect(ui.showChart).toBe(true);
    expect(isOpen()).toBe(true);

    await userEvent.click(screen.getByTestId("right-panel-tab"));
    expect(ui.showChart).toBe(false);
    expect(isOpen()).toBe(false);
    expect((log as jest.Mock).mock.calls).toEqual([["ChartTabShown"], ["ChartTabHidden"]]);
  });

  it("follows showChart set from outside, such as a restored run", async () => {
    const ui = new UIModel();
    renderPanel(ui);
    act(() => ui.setShowChart(true));
    expect(isOpen()).toBe(true);

    await userEvent.click(screen.getByTestId("right-panel-tab"));
    expect(ui.showChart).toBe(false);
  });
});
