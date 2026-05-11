import React from "react";
import { render, screen } from "@testing-library/react";
import { Provider } from "mobx-react";
import { createStores } from "../models/stores";

// Mock the heavy subcomponents so we can render AppComponent without setting up
// the full simulation engine + 3D view + terrain panel etc.
jest.mock("./view-3d/view-3d", () => ({ View3d: () => <div data-testid="view-3d-mock" /> }));
jest.mock("./simulation-info", () => ({ SimulationInfo: () => <div data-testid="sim-info-mock" /> }));
jest.mock("./terrain-panel", () => ({ TerrainPanel: () => <div data-testid="terrain-panel-mock" /> }));
jest.mock("./right-panel", () => ({ RightPanel: () => <div data-testid="right-panel-mock" /> }));
jest.mock("./bottom-bar", () => ({ BottomBar: () => <div data-testid="bottom-bar-mock" /> }));
jest.mock("./top-bar/top-bar", () => ({ TopBar: () => <div data-testid="top-bar-mock" /> }));
jest.mock("@concord-consortium/log-monitor", () => ({
  LogMonitor: () => <div data-testid="log-monitor-mock" />,
  createLogWrapper: (fn: unknown) => fn,
}));
jest.mock("../hazbot/engine/sidebar", () => ({
  Sidebar: () => <div data-testid="hazbot-sidebar-mock" />,
}));
jest.mock("shutterbug", () => ({ enable: jest.fn(), disable: jest.fn() }));
jest.mock("./use-custom-cursors", () => ({ useCustomCursor: jest.fn() }));

// getUrlConfig + getAnalysisEngine drive the layout decision; mock per case.
// Default mock returns config with no flags so module-level reads (e.g. in log.ts)
// don't blow up at import time. Tests reset it per case.
const mockUrlConfig = jest.fn(() => ({ logMonitor: false, hazbotSidebar: false }));
jest.mock("../config", () => {
  const actual = jest.requireActual("../config");
  return { ...actual, getUrlConfig: () => mockUrlConfig() };
});
const mockGetEngine = jest.fn();
jest.mock("../hazbot/wildfire", () => ({
  getAnalysisEngine: () => mockGetEngine(),
  APP_RULES_VERSION: 1,
  buildAnalysisEngineActivatedPayload: jest.fn(),
}));

// Module-level mocks above run before the import below — AppComponent's
// `const { logMonitor, hazbotSidebar } = getUrlConfig();` reads our mock at module load.
// We can't change that per-test (it's module-level state), but the layout decision
// inside the render uses the per-render `getUrlConfig()` call inside the component
// path indirectly — the test cases that need different URL configs would need
// per-module-isolation. For now, set the mock once and re-render with different
// engine return values to cover the engine-defined-vs-undefined cases.
import { AppComponent } from "./app";

describe("AppComponent — Hazbot sidebar mount truth table", () => {
  beforeEach(() => {
    mockGetEngine.mockReset();
    mockUrlConfig.mockReset().mockReturnValue({ logMonitor: false, hazbotSidebar: false });
  });

  function renderApp() {
    const stores = createStores();
    render(<Provider stores={stores}><AppComponent /></Provider>);
  }

  it("renders the Hazbot sidebar when ?hazbotSidebar=true AND engine is constructed", () => {
    mockUrlConfig.mockReturnValue({ logMonitor: false, hazbotSidebar: true });
    mockGetEngine.mockReturnValue({ isActive: true, sessionId: "abc" });
    renderApp();
    expect(screen.getByTestId("hazbot-sidebar-mock")).toBeInTheDocument();
    expect(screen.queryByTestId("log-monitor-mock")).not.toBeInTheDocument();
  });

  it("renders both sidebars when ?logMonitor=true AND ?hazbotSidebar=true", () => {
    mockUrlConfig.mockReturnValue({ logMonitor: true, hazbotSidebar: true });
    mockGetEngine.mockReturnValue({ isActive: true, sessionId: "abc" });
    renderApp();
    expect(screen.getByTestId("log-monitor-mock")).toBeInTheDocument();
    expect(screen.getByTestId("hazbot-sidebar-mock")).toBeInTheDocument();
  });

  it("renders neither sidebar when both URL flags are unset", () => {
    mockUrlConfig.mockReturnValue({ logMonitor: false, hazbotSidebar: false });
    mockGetEngine.mockReturnValue(undefined);
    renderApp();
    expect(screen.queryByTestId("log-monitor-mock")).not.toBeInTheDocument();
    expect(screen.queryByTestId("hazbot-sidebar-mock")).not.toBeInTheDocument();
  });

  it("does NOT render Hazbot sidebar when ?hazbotSidebar=true but engine is undefined", () => {
    mockUrlConfig.mockReturnValue({ logMonitor: false, hazbotSidebar: true });
    mockGetEngine.mockReturnValue(undefined);
    renderApp();
    expect(screen.queryByTestId("hazbot-sidebar-mock")).not.toBeInTheDocument();
  });
});
