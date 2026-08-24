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
// The mock captures `diagnostics` rather than ignoring props: it is the only way this
// file can tell an undefined diagnostics array from an empty or a populated one, since
// the real Sidebar is never rendered here.
const sidebarDiagnostics = jest.fn();
jest.mock("../hazbot/engine/sidebar", () => ({
  Sidebar: (props: { diagnostics?: unknown }) => {
    sidebarDiagnostics(props.diagnostics);
    return <div data-testid="hazbot-sidebar-mock" />;
  },
}));
jest.mock("shutterbug", () => ({ enable: jest.fn(), disable: jest.fn() }));
jest.mock("./use-custom-cursors", () => ({ useCustomCursor: jest.fn() }));

// getUrlConfig + getAnalysisEngine drive the layout decision; mock per case.
// Default mock returns config with no flags so module-level reads (e.g. in log.ts)
// don't blow up at import time. Tests reset it per case.
const mockUrlConfig = jest.fn(() => ({ logMonitor: false, hazbotSidebar: false }));
jest.mock("../config", () => {
  const actual = jest.requireActual("../config");
  // `mockUrlConfig` is still uninitialized when log.ts's module-level getUrlConfig()
  // runs during the `createStores` import above (stores.ts imports log.ts, whose
  // top-level read fires before this const is assigned — jest hoists jest.mock above
  // the imports but not the const). Fall back to a safe default until the test's mock
  // fn exists, then defer to it.
  return {
    ...actual,
    getUrlConfig: () =>
      typeof mockUrlConfig === "function" ? mockUrlConfig() : { logMonitor: false, hazbotSidebar: false },
  };
});
const mockGetEngine = jest.fn();
jest.mock("../hazbot/wildfire", () => ({
  getAnalysisEngine: () => mockGetEngine(),
  APP_RULES_VERSION: 1,
  buildAnalysisEngineActivatedPayload: jest.fn(),
  getRequestedPresetInfo: jest.fn(),
  // Defaults to undefined → no diagnostics; buildPresetDiagnostics's own logic
  // is covered directly in engine-singleton.test.ts.
  buildPresetDiagnostics: jest.fn(),
  // This barrel mock has no jest.requireActual spread, so the real builder never runs
  // here. A bare jest.fn() returning undefined would collapse the composition to
  // undefined and make the positive case below indistinguishable from the negative one.
  buildFeedbackLevelDiagnostics: jest.fn(() => [{ label: "Feedback levels", value: "(none)" }]),
}));

// AppComponent re-reads `getUrlConfig()` on every render, so per-test mock updates
// take effect on the next renderApp() call — no module-isolation gymnastics needed.
import { AppComponent } from "./app";
import { buildPresetDiagnostics, buildFeedbackLevelDiagnostics } from "../hazbot/wildfire";

describe("AppComponent — Hazbot sidebar mount truth table", () => {
  beforeEach(() => {
    mockGetEngine.mockReset();
    mockUrlConfig.mockReset().mockReturnValue({ logMonitor: false, hazbotSidebar: false });
    sidebarDiagnostics.mockReset();
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

  it("renders only LogMonitor when ?logMonitor=true and ?hazbotSidebar is unset", () => {
    mockUrlConfig.mockReturnValue({ logMonitor: true, hazbotSidebar: false });
    mockGetEngine.mockReturnValue(undefined);
    renderApp();
    expect(screen.getByTestId("log-monitor-mock")).toBeInTheDocument();
    expect(screen.queryByTestId("hazbot-sidebar-mock")).not.toBeInTheDocument();
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

  // What this file can prove is the COMPOSITION: both builders are called and their rows
  // concatenated, and the length guard still yields undefined when both come back empty.
  // That the level builder always returns at least one row is engine-singleton.test.ts's.
  it("hands the level rows to Sidebar even with no requested preset", () => {
    mockUrlConfig.mockReturnValue({ logMonitor: false, hazbotSidebar: true });
    mockGetEngine.mockReturnValue({ isActive: true, sessionId: "abc" });
    (buildPresetDiagnostics as jest.Mock).mockReturnValueOnce(undefined);
    renderApp();
    expect(sidebarDiagnostics).toHaveBeenCalledWith([{ label: "Feedback levels", value: "(none)" }]);
  });

  it("hands Sidebar undefined, not an empty array, when neither builder returns rows", () => {
    mockUrlConfig.mockReturnValue({ logMonitor: false, hazbotSidebar: true });
    mockGetEngine.mockReturnValue({ isActive: true, sessionId: "abc" });
    (buildPresetDiagnostics as jest.Mock).mockReturnValueOnce(undefined);
    (buildFeedbackLevelDiagnostics as jest.Mock).mockReturnValueOnce([]);
    renderApp();
    expect(sidebarDiagnostics).toHaveBeenCalledWith(undefined);
  });
});
