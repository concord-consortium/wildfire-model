import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "mobx-react";
import { createStores } from "../models/stores";
import { BottomBar } from "./bottom-bar";
import { TopBar } from "./top-bar/top-bar";
import { Vector2 } from "three";
import { act } from "react-dom/test-utils";
import { reaction } from "mobx";

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

    it("does NOT fire on Stop/Pause", async () => {
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

      // Click Stop (the button shows "Stop" when simulationRunning is true)
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

    it("does NOT fire SimulationEnded on restart when simulation was never started", async () => {
      jest.spyOn(stores.simulation, "restart");
      render(
        <Provider stores={stores}>
          <BottomBar />
        </Provider>
      );
      await userEvent.click(screen.getByTestId("restart-button"));

      const endedCalls = mockLog.mock.calls.filter(
        (call: unknown[]) => call[0] === "SimulationEnded"
      );
      expect(endedCalls).toHaveLength(0);
      expect(stores.simulation.simulationEndedLogged).toBe(false);
    });
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
});
