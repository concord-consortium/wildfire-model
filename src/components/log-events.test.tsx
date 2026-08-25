import React from "react";
import { render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "mobx-react";
import { createStores } from "../models/stores";
import { BottomBar } from "./bottom-bar";
import { TopBar } from "./top-bar/top-bar";
import { Vector2 } from "three";
import { act } from "react-dom/test-utils";
import { reaction } from "mobx";
import { Interaction } from "../models/ui";
import { renderFireLineInteraction, terrainPointerEvent } from "./view-3d/fire-line-interaction-test-helpers";
import { useFireLinePlacementCancel } from "./use-fire-line-placement-cancel";

// Mock the log module
const mockLog = jest.fn();
jest.mock("../log", () => ({
  log: (...args: unknown[]) => mockLog(...args)
}));

describe("Log events", () => {
  let stores = createStores();

  beforeEach(() => {
    stores = createStores();
    mockLog.mockClear();
  });

  describe("SimulationEnded", () => {
    it("fires with reason 'SimulationRestarted' before restart", async () => {
      jest.spyOn(stores.simulation, "restart");
      stores.simulation.simulationStarted = true;
      render(
        <Provider stores={stores}>
          <BottomBar />
        </Provider>
      );
      await userEvent.click(screen.getByTestId("restart-button"));

      // SimulationEnded should fire before SimulationRestarted
      const endedIdx = mockLog.mock.calls.findIndex(
        (call: unknown[]) => call[0] === "SimulationEnded"
      );
      const restartedIdx = mockLog.mock.calls.findIndex(
        (call: unknown[]) => call[0] === "SimulationRestarted"
      );
      expect(endedIdx).toBeGreaterThanOrEqual(0);
      expect(restartedIdx).toBeGreaterThanOrEqual(0);
      expect(endedIdx).toBeLessThan(restartedIdx);

      expect(mockLog.mock.calls[endedIdx][1].reason).toBe("SimulationRestarted");

      const outcome = mockLog.mock.calls[endedIdx][1].outcome;
      expect(outcome).toHaveProperty("durationMinutes");
      expect(outcome).toHaveProperty("durationHours");
      expect(outcome).toHaveProperty("zones");
      expect(outcome).toHaveProperty("towns");
    });

    it("fires with reason 'SimulationReloaded' before reload", async () => {
      jest.spyOn(stores.simulation, "reload");
      // Under the new reloadEnabled = setupChanged || sparks.length > 0 rule,
      // simulationStarted alone leaves Reload disabled and userEvent.click
      // would no-op. Add a spark so Reload is enabled (mirrors the test-4
      // fixture pattern below).
      stores.simulation.sparks.push(new Vector2(50000, 50000));
      stores.simulation.simulationStarted = true;
      render(
        <Provider stores={stores}>
          <BottomBar />
        </Provider>
      );
      await userEvent.click(screen.getByTestId("reload-button"));

      const endedIdx = mockLog.mock.calls.findIndex(
        (call: unknown[]) => call[0] === "SimulationEnded"
      );
      const reloadedIdx = mockLog.mock.calls.findIndex(
        (call: unknown[]) => call[0] === "SimulationReloaded"
      );
      expect(endedIdx).toBeGreaterThanOrEqual(0);
      expect(endedIdx).toBeLessThan(reloadedIdx);
      expect(mockLog.mock.calls[endedIdx][1].reason).toBe("SimulationReloaded");
    });

    it("fires with reason 'TopBarReloadButtonClicked' from top bar reload", async () => {
      const reloadMock = jest.fn();
      Object.defineProperty(window, "location", {
        writable: true,
        value: { reload: reloadMock },
      });
      render(
        <Provider stores={stores}>
          <TopBar projectName="Test" />
        </Provider>
      );
      await userEvent.click(screen.getByTestId("reload"));

      const endedIdx = mockLog.mock.calls.findIndex(
        (call: unknown[]) => call[0] === "SimulationEnded"
      );
      expect(endedIdx).toBeGreaterThanOrEqual(0);
      expect(mockLog.mock.calls[endedIdx][1].reason).toBe("TopBarReloadButtonClicked");
    });

    it("does NOT fire on Pause", async () => {
      // Put simulation into running state without actually starting the engine
      act(() => {
        stores.simulation.dataReady = true;
        stores.simulation.sparks.push(new Vector2(50000, 50000));
        stores.simulation.simulationStarted = true;
        stores.simulation.simulationRunning = true;
      });

      render(
        <Provider stores={stores}>
          <BottomBar />
        </Provider>
      );

      // Click Pause (the button shows "Pause" when simulationRunning is true)
      await userEvent.click(screen.getByTestId("start-button"));

      const endedCalls = mockLog.mock.calls.filter(
        (call: unknown[]) => call[0] === "SimulationEnded"
      );
      expect(endedCalls).toHaveLength(0);

      const stoppedCalls = mockLog.mock.calls.filter(
        (call: unknown[]) => call[0] === "SimulationStopped"
      );
      expect(stoppedCalls).toHaveLength(1);
      expect(stoppedCalls[0][1].outcome).toHaveProperty("durationMinutes");
      expect(stoppedCalls[0][1].outcome).toHaveProperty("zones");
      expect(stoppedCalls[0][1].outcome).toHaveProperty("towns");
    });

    it("sets simulationEndedLogged guard on restart", async () => {
      stores.simulation.simulationStarted = true;
      render(
        <Provider stores={stores}>
          <BottomBar />
        </Provider>
      );
      expect(stores.simulation.simulationEndedLogged).toBe(false);
      await userEvent.click(screen.getByTestId("restart-button"));
      expect(stores.simulation.simulationEndedLogged).toBe(true);
    });

    // (Removed: "does NOT fire SimulationEnded on restart when simulation was
    // never started" — under the new restartEnabled=simulationStarted rule the
    // Restart button is disabled in Default, userEvent.click is a no-op
    // against `<button disabled>`, and both assertions trivially hold. The
    // bottom-bar.test.tsx state-1 matrix already asserts Restart-disabled in
    // Default at the matrix level.)
  });

  describe("SimulationEnded - natural end (ByItself)", () => {
    // These tests replicate the MobX reaction from app.tsx directly,
    // since rendering AppComponent pulls in the full component tree.
    const setupNaturalEndReaction = (simulation: typeof stores.simulation, chartStore: typeof stores.chartStore) => {
      return reaction(
        () => ({
          running: simulation.simulationRunning,
          fireDidStop: simulation.engine?.fireDidStop
        }),
        ({ running, fireDidStop }, prev) => {
          if (prev.running && !running && fireDidStop && !simulation.simulationEndedLogged) {
            simulation.simulationEndedLogged = true;
            mockLog("SimulationEnded", {
              reason: "ByItself",
              outcome: simulation.getOutcomeData(chartStore)
            });
          }
        }
      );
    };

    it("fires when fire burns out naturally", () => {
      const { simulation, chartStore } = stores;
      simulation.simulationStarted = true;
      simulation.simulationRunning = true;
      (simulation as any).engine = { fireDidStop: false, burnedCellsInZone: {} };

      const dispose = setupNaturalEndReaction(simulation, chartStore);

      // Simulate fire burning out
      (simulation as any).engine.fireDidStop = true;
      simulation.simulationRunning = false;

      const endedCalls = mockLog.mock.calls.filter(
        (call: unknown[]) => call[0] === "SimulationEnded"
      );
      expect(endedCalls).toHaveLength(1);
      expect(endedCalls[0][1].reason).toBe("ByItself");
      expect(endedCalls[0][1].outcome).toHaveProperty("durationMinutes");
      expect(endedCalls[0][1].outcome).toHaveProperty("zones");
      expect(simulation.simulationEndedLogged).toBe(true);

      dispose();
    });

    it("does NOT double-fire when simulationEndedLogged guard is set", () => {
      const { simulation, chartStore } = stores;
      simulation.simulationStarted = true;
      simulation.simulationRunning = true;
      (simulation as any).engine = { fireDidStop: true, burnedCellsInZone: {} };

      const dispose = setupNaturalEndReaction(simulation, chartStore);

      // Simulate what handleRestart does: set guard before stopping
      simulation.simulationEndedLogged = true;
      simulation.simulationRunning = false;

      const endedCalls = mockLog.mock.calls.filter(
        (call: unknown[]) => call[0] === "SimulationEnded"
      );
      expect(endedCalls).toHaveLength(0);

      dispose();
    });

    it("does NOT fire when simulation is stopped by user (fireDidStop is false)", () => {
      const { simulation, chartStore } = stores;
      simulation.simulationStarted = true;
      simulation.simulationRunning = true;
      (simulation as any).engine = { fireDidStop: false, burnedCellsInZone: {} };

      const dispose = setupNaturalEndReaction(simulation, chartStore);

      // User clicks Stop — simulationRunning goes false but fireDidStop stays false
      simulation.simulationRunning = false;

      const endedCalls = mockLog.mock.calls.filter(
        (call: unknown[]) => call[0] === "SimulationEnded"
      );
      expect(endedCalls).toHaveLength(0);

      dispose();
    });
  });

  describe("SimulationStarted", () => {
    it("includes full config snapshot with zones and wind", async () => {
      // Mock start() to prevent engine creation (cells not loaded in test)
      jest.spyOn(stores.simulation, "start").mockImplementation(() => { /* noop */ });

      act(() => {
        stores.simulation.dataReady = true;
        stores.simulation.sparks.push(new Vector2(50000, 50000));
      });

      render(
        <Provider stores={stores}>
          <BottomBar />
        </Provider>
      );

      await userEvent.click(screen.getByTestId("start-button"));

      const startedCall = mockLog.mock.calls.find(
        (call: unknown[]) => call[0] === "SimulationStarted"
      );
      expect(startedCall).toBeDefined();

      const params = startedCall[1];
      expect(params).toHaveProperty("modelWidth");
      expect(params).toHaveProperty("modelHeight");
      expect(params).toHaveProperty("gridWidth");
      expect(params).toHaveProperty("logMonitor");

      expect(params).toHaveProperty("sparks");
      expect(params.sparks).toHaveLength(1);
      expect(params).toHaveProperty("zones");
      expect(params).toHaveProperty("wind");
      expect(params.wind).toHaveProperty("speed");
      expect(params.wind).toHaveProperty("direction");
      expect(params.wind).toHaveProperty("scaleFactor");
      expect(params).toHaveProperty("towns");
      expect(params).toHaveProperty("fireLineMarkers");
    });

    it("replaces 2D arrays with metadata strings", async () => {
      jest.spyOn(stores.simulation, "start").mockImplementation(() => { /* noop */ });

      const sim = stores.simulation;
      (sim.config as any).elevation = [[0, 1], [2, 3]];

      act(() => {
        sim.dataReady = true;
        sim.sparks.push(new Vector2(50000, 50000));
      });

      render(
        <Provider stores={stores}>
          <BottomBar />
        </Provider>
      );

      await userEvent.click(screen.getByTestId("start-button"));

      const startedCall = mockLog.mock.calls.find(
        (call: unknown[]) => call[0] === "SimulationStarted"
      );
      expect(startedCall[1].elevation).toMatch(/^2D array \[\d+x\d+\]$/);
    });
  });

  describe("Fire line placement", () => {
    const MODEL_WIDTH = 120000;
    const MODEL_HEIGHT = 80000;

    const armFireLineTool = async () => {
      stores.simulation.load({
        modelWidth: MODEL_WIDTH,
        modelHeight: MODEL_HEIGHT,
        gridWidth: 240,
        sparks: [[60000, 40000]],
        zoneIndex: [[0]],
        elevation: [[0]],
        unburntIslands: [[1]],
        unburntIslandProbability: 1,
        riverData: null
      });
      await stores.simulation.dataReadyPromise;
      stores.ui.interaction = Interaction.DrawFireLine;
      mockLog.mockClear();
    };

    const point = (x: number, y: number) => terrainPointerEvent(x, y, MODEL_WIDTH);

    const callsNamed = (name: string) => mockLog.mock.calls.filter((call: unknown[]) => call[0] === name);

    it("logs FireLineFirstEndPlaced on the first click with normalized coordinates", async () => {
      await armFireLineTool();
      const { result } = renderFireLineInteraction(stores);

      result.current.onPointerDown?.(point(30000, 40000));

      const calls = callsNamed("FireLineFirstEndPlaced");
      expect(calls).toHaveLength(1);
      expect(calls[0][1].x).toBeCloseTo(30000 / MODEL_WIDTH, 5);
      expect(calls[0][1].y).toBeCloseTo(40000 / MODEL_HEIGHT, 5);
      expect(calls[0][1]).toHaveProperty("elevation");
      expect(callsNamed("FireLineAdded")).toHaveLength(0);
    });

    it("logs FireLineAdded exactly once, on the second click", async () => {
      await armFireLineTool();
      const { result } = renderFireLineInteraction(stores);

      result.current.onPointerDown?.(point(30000, 40000));
      result.current.onPointerDown?.(point(38000, 40000));

      const calls = callsNamed("FireLineAdded");
      expect(calls).toHaveLength(1);
      expect(calls[0][1].x1).toBeCloseTo(30000 / MODEL_WIDTH, 5);
      expect(calls[0][1].x2).toBeCloseTo(38000 / MODEL_WIDTH, 5);
    });

    it("does not log FireLineAdded for a second click below the minimum distance", async () => {
      await armFireLineTool();
      const { result } = renderFireLineInteraction(stores);

      result.current.onPointerDown?.(point(30000, 40000));
      result.current.onPointerDown?.(point(31000, 40000));

      expect(callsNamed("FireLineAdded")).toHaveLength(0);
      expect(callsNamed("FireLineFirstEndPlaced")).toHaveLength(1);
    });

    describe("cancel routes", () => {
      const renderBottomBar = () => render(
        <Provider stores={stores}>
          <BottomBar />
        </Provider>
      );

      const renderCancelHook = () => renderHook(() => useFireLinePlacementCancel(), {
        wrapper: ({ children }: { children?: React.ReactNode }) =>
          <Provider stores={stores}>{children}</Provider>
      });

      const placeFirstEnd = () => {
        const { result } = renderFireLineInteraction(stores);
        act(() => { result.current.onPointerDown?.(point(30000, 40000)); });
      };

      const canceledCall = () => {
        const calls = callsNamed("FireLineCanceled");
        expect(calls).toHaveLength(1);
        return calls[0][1];
      };

      const expectPlacementDiscarded = () => {
        expect(stores.simulation.fireLineMarkers).toHaveLength(0);
        expect(stores.simulation.cells.filter(c => c.isFireLineUnderConstruction)).toHaveLength(0);
        expect(stores.ui.fireLinePlacementInProgress).toBe(false);
        expect(stores.ui.interaction).toBeNull();
      };

      beforeEach(async () => {
        await armFireLineTool();
        stores.simulation.simulationStarted = true;
      });

      it("logs reason 'escape' and discards the placement on the Escape key", () => {
        renderCancelHook();
        placeFirstEnd();

        act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });

        expect(canceledCall().reason).toBe("escape");
        expectPlacementDiscarded();
      });

      it("logs reason 'toggle' on a second Fireline button click, without re-arming", async () => {
        stores.ui.interaction = null;
        renderBottomBar();
        await userEvent.click(screen.getByTestId("fireline-button"));
        expect(stores.ui.interaction).toBe(Interaction.DrawFireLine);
        placeFirstEnd();

        await userEvent.click(screen.getByTestId("fireline-button"));

        expect(canceledCall().reason).toBe("toggle");
        // The cancel click must not count as a second attempt to draw a fire line.
        expect(callsNamed("FireLineButtonClicked")).toHaveLength(1);
        expectPlacementDiscarded();
      });

      it("omits the coordinates when the tool was armed but no end was placed", async () => {
        renderBottomBar();

        await userEvent.click(screen.getByTestId("fireline-button"));

        expect(canceledCall()).toEqual({ reason: "toggle" });
      });

      it("logs reason 'toolSwitch' when Helitack takes over mid-placement", async () => {
        stores.simulation.simulationRunning = true;
        renderBottomBar();
        placeFirstEnd();

        await userEvent.click(screen.getByTestId("helitack-button"));

        expect(canceledCall().reason).toBe("toolSwitch");
        expect(stores.ui.interaction).toBe(Interaction.Helitack);
        expect(stores.simulation.fireLineMarkers).toHaveLength(0);
      });

      it("logs reason 'start' and empties the SimulationStarted snapshot's fireLineMarkers", async () => {
        // The snapshot is built before start() runs, so a cancel that lands after it
        // would leave the log reporting a fire line the run never builds.
        jest.spyOn(stores.simulation, "start").mockImplementation(() => { /* noop */ });
        stores.simulation.simulationRunning = false;
        renderBottomBar();
        placeFirstEnd();

        await userEvent.click(screen.getByTestId("start-button"));

        expect(canceledCall().reason).toBe("start");
        const startedCall = mockLog.mock.calls.find((call: unknown[]) => call[0] === "SimulationStarted");
        expect(startedCall[1].fireLineMarkers).toEqual([]);
        expect(stores.ui.interaction).toBeNull();
      });

      it("leaves Escape to an open coach mark", () => {
        renderCancelHook();
        placeFirstEnd();
        stores.ui.showHazbotFeedback = true;

        act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });

        expect(callsNamed("FireLineCanceled")).toHaveLength(0);
        expect(stores.simulation.fireLineMarkers).toHaveLength(2);
      });

      it("does not cancel a placement the second click completed", () => {
        renderCancelHook();
        const { result } = renderFireLineInteraction(stores);
        act(() => { result.current.onPointerDown?.(point(30000, 40000)); });
        act(() => { result.current.onPointerDown?.(point(38000, 40000)); });

        expect(callsNamed("FireLineAdded")).toHaveLength(1);
        expect(callsNamed("FireLineCanceled")).toHaveLength(0);
        expect(stores.simulation.fireLineMarkers).toHaveLength(2);
      });

      it("logs reason 'restart' when Restart discards a placement", async () => {
        renderCancelHook();
        renderBottomBar();
        placeFirstEnd();

        await userEvent.click(screen.getByTestId("restart-button"));

        expect(canceledCall().reason).toBe("restart");
        expect(stores.simulation.fireLineMarkers).toHaveLength(0);
        // The abandonment has to read as part of this restart, not the next run.
        const names = mockLog.mock.calls.map((call: unknown[]) => call[0]);
        expect(names.indexOf("FireLineCanceled")).toBeLessThan(names.indexOf("SimulationRestarted"));
      });

      it("logs reason 'reload' when Reload discards a placement", async () => {
        renderCancelHook();
        renderBottomBar();
        placeFirstEnd();

        await userEvent.click(screen.getByTestId("reload-button"));

        expect(canceledCall().reason).toBe("reload");
        expect(stores.simulation.fireLineMarkers).toHaveLength(0);
      });

      it("logs reason 'other' when the reaction backstop catches an unrouted departure", () => {
        renderCancelHook();
        placeFirstEnd();

        act(() => { stores.ui.interaction = Interaction.PlaceSpark; });

        expect(canceledCall().reason).toBe("other");
        expect(stores.ui.interaction).toBe(Interaction.PlaceSpark);
        expect(stores.simulation.fireLineMarkers).toHaveLength(0);
      });
    });
  });

  describe("TerrainPanelButtonClicked", () => {
    it("logs on every Setup click, including the no-op click while the wizard is open", async () => {
      render(
        <Provider stores={stores}>
          <BottomBar />
        </Provider>
      );
      await userEvent.click(screen.getByTestId("terrain-button"));
      await userEvent.click(screen.getByTestId("terrain-button"));
      const calls = mockLog.mock.calls.filter((c: unknown[]) => c[0] === "TerrainPanelButtonClicked");
      expect(calls).toHaveLength(2);
      expect(stores.ui.showTerrainUI).toBe(true);
    });
  });
});
