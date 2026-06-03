import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createStores } from "../models/stores";
import { Provider } from "mobx-react";
import { BottomBar } from "./bottom-bar";
import { Vector2 } from "three";
import { act } from "react-dom/test-utils";
import { Interaction } from "../models/ui";
import type { FireEngine } from "../models/engine/fire-engine";

// Minimal FireEngine stand-in for tests that only need the bottom-bar to read
// engine state, not run a simulation. Centralized so the inline {fireDidStop,
// burnedCellsInZone} literals below don't need touching independently when a
// default changes. The Pick<> shape types the helper's own contents — a rename
// or removal of fireDidStop / burnedCellsInZone upstream breaks compilation
// here. It does NOT type the consumer side: after
// `(simulation as any).engine = mockEngine()`, simulation.engine is still
// typed FireEngine, so a new BottomBar read like `simulation.engine?.newField`
// type-checks fine and returns undefined at runtime. If/when BottomBar grows
// new engine reads, either add the new field to MockEngineFields and the
// default literal, or swap the helper for a full FireEngine fake.
type MockEngineFields = Pick<FireEngine, "fireDidStop" | "burnedCellsInZone">;
const mockEngine = (overrides?: Partial<MockEngineFields>): MockEngineFields => ({
  fireDidStop: false,
  burnedCellsInZone: {},
  ...overrides,
});

// Helper: set the simulation into a target lifecycle state via direct
// observable assignment. Avoids the engine + cells round-trip — none of these
// tests need the engine to actually tick.
//
// NOTE: Direct-write seeding skips two things the real simulation.start()
// does: (1) the simulationEndedLogged=false reset (simulation.ts:222) and
// (2) the FireEngine construction (simulation.ts:226-228). Tests that chain
// transitions from a seeded state-4/5 (e.g., state-5 → Restart, where the
// production path would have simulationEndedLogged already flipped true by
// app.tsx's natural-end reaction) should either set the flag manually or
// call simulation.start() directly to exercise the real reset path.
const seedState = (stores: ReturnType<typeof createStores>, state: 1 | 2 | 3 | 4 | 5 | 6) => {
  const { simulation } = stores;
  // Defensive sanity guard: state-machine assertions depend on
  // canAddSpark = remainingSparks > 0 = zonesCount - sparks.length > 0.
  // seedState adds at most 1 spark for states 3/4/5/6, so we need at least
  // 2 zones for the spark-button-enabled assertions to hold.
  expect(simulation.zonesCount).toBeGreaterThanOrEqual(2);
  simulation.dataReady = true;
  switch (state) {
    case 1: // Default
      break;
    case 2: // SetupChanged
      simulation.setSetupChanged(true);
      break;
    case 3: // SparkPlaced
      simulation.sparks.push(new Vector2(50000, 50000));
      break;
    case 4: // Running
      simulation.sparks.push(new Vector2(50000, 50000));
      simulation.simulationStarted = true;
      simulation.simulationRunning = true;
      (simulation as any).engine = mockEngine();
      break;
    case 5: // Ended (fire finished naturally)
      simulation.sparks.push(new Vector2(50000, 50000));
      simulation.simulationStarted = true;
      simulation.simulationRunning = false;
      (simulation as any).engine = mockEngine({ fireDidStop: true });
      break;
    case 6: // Restarted (post-Restart from a state with sparks)
      simulation.sparks.push(new Vector2(50000, 50000));
      // simulationStarted stays false; engine is null
      break;
  }
};

const expectButtonState = (testid: string, enabled: boolean) => {
  const btn = screen.getByTestId(testid);
  if (enabled) expect(btn).not.toBeDisabled();
  else expect(btn).toBeDisabled();
};

describe("BottomBar component", () => {
  let stores = createStores();
  beforeEach(() => {
    stores = createStores();
  });

  it("renders basic components", () => {
    render(
      <Provider stores={stores}>
        <BottomBar />
      </Provider>
    );
    expect(screen.queryAllByRole("button").length).toEqual(7);
  });

  it("terrain button toggles the display of the terrain dialog", async () => {
    render(
      <Provider stores={stores}>
        <BottomBar />
      </Provider>
    );
    expect(stores.ui.showTerrainUI).toBe(false);
    await userEvent.click(screen.getByTestId("terrain-button"));
    expect(stores.ui.showTerrainUI).toBe(true);
    await userEvent.click(screen.getByTestId("terrain-button"));
    expect(stores.ui.showTerrainUI).toBe(false);
  });

  it("fireline button is present", () => {
    render(
      <Provider stores={stores}>
        <BottomBar />
      </Provider>
    );
    expect(screen.getByTestId("fireline-button")).toBeInTheDocument();
  });

  it("helitack button is present", () => {
    render(
      <Provider stores={stores}>
        <BottomBar />
      </Provider>
    );
    expect(screen.getByTestId("helitack-button")).toBeInTheDocument();
  });
});

describe("BottomBar state machine (Requirements 1-7)", () => {
  let stores = createStores();
  beforeEach(() => {
    stores = createStores();
  });

  // State 1: Default — Enabled: Setup, Spark. Disabled: Reload, Restart,
  // Start, Fireline, Helitack.
  it("state 1 (Default): Setup + Spark enabled; Reload/Restart/Start/Fireline/Helitack disabled", () => {
    seedState(stores, 1);
    render(<Provider stores={stores}><BottomBar /></Provider>);
    expectButtonState("terrain-button", true);
    expectButtonState("spark-button", true);
    expectButtonState("reload-button", false);
    expectButtonState("restart-button", false);
    expectButtonState("start-button", false);
    expectButtonState("fireline-button", false);
    expectButtonState("helitack-button", false);
  });

  // State 2: SetupChanged — Reload enabled, rest same as Default
  it("state 2 (SetupChanged): Reload enabled; otherwise same as Default", () => {
    seedState(stores, 2);
    render(<Provider stores={stores}><BottomBar /></Provider>);
    expectButtonState("terrain-button", true);
    expectButtonState("spark-button", true);
    expectButtonState("reload-button", true);
    expectButtonState("restart-button", false);
    expectButtonState("start-button", false);
    expectButtonState("fireline-button", false);
    expectButtonState("helitack-button", false);
  });

  // State 3: SparkPlaced — Start enabled, Reload enabled, rest like Default
  it("state 3 (SparkPlaced): Start + Reload enabled", () => {
    seedState(stores, 3);
    render(<Provider stores={stores}><BottomBar /></Provider>);
    expectButtonState("terrain-button", true);
    expectButtonState("spark-button", true);
    expectButtonState("reload-button", true);
    expectButtonState("restart-button", false);
    expectButtonState("start-button", true);
    expectButtonState("fireline-button", false);
    expectButtonState("helitack-button", false);
  });

  // State 4: Running — Restart, Start/Stop, Fireline, Helitack enabled;
  // Setup, Spark disabled
  // eslint-disable-next-line max-len
  it("state 4 (Running): Setup/Spark disabled; Restart/Start/Fireline/Helitack enabled; Reload enabled; label is 'Stop'", () => {
    seedState(stores, 4);
    render(<Provider stores={stores}><BottomBar /></Provider>);
    expectButtonState("terrain-button", false);
    expectButtonState("spark-button", false);
    expectButtonState("reload-button", true);
    expectButtonState("restart-button", true);
    expectButtonState("start-button", true);
    expectButtonState("fireline-button", true);
    expectButtonState("helitack-button", true);
    // Requirement 4: label is "Stop" while simulationRunning === true.
    // Regression guard for the ternary at bottom-bar.tsx:148.
    expect(screen.getByTestId("start-button")).toHaveTextContent("Stop");
  });

  // State 5: Ended — Start, Fireline, Helitack disabled; Restart, Reload enabled
  // eslint-disable-next-line max-len
  it("state 5 (Ended): Start/Fireline/Helitack disabled; Restart/Reload enabled; Setup/Spark disabled", () => {
    seedState(stores, 5);
    render(<Provider stores={stores}><BottomBar /></Provider>);
    expectButtonState("terrain-button", false);
    expectButtonState("spark-button", false);
    expectButtonState("reload-button", true);
    expectButtonState("restart-button", true);
    expectButtonState("start-button", false);
    expectButtonState("fireline-button", false);
    expectButtonState("helitack-button", false);
  });

  // State 6: Restarted — Setup, Spark, Start, Reload enabled; Restart disabled
  // eslint-disable-next-line max-len
  it("state 6 (Restarted): Setup/Spark/Start/Reload enabled; Restart disabled; Fireline/Helitack disabled", () => {
    seedState(stores, 6);
    render(<Provider stores={stores}><BottomBar /></Provider>);
    expectButtonState("terrain-button", true);
    expectButtonState("spark-button", true);
    expectButtonState("reload-button", true);
    expectButtonState("restart-button", false);
    expectButtonState("start-button", true);
    expectButtonState("fireline-button", false);
    expectButtonState("helitack-button", false);
  });

  // State 7 (AfterReload) is intentionally omitted from this matrix. The
  // state-7 button matrix is identical to state 1 (Default) for curriculum
  // presets with empty config.sparks. Real "AfterReload" coverage lives in
  // the Paused vs. Ended → Paused → Reload and Running → Reload edge-case
  // tests below: both click the actual Reload button and assert
  // Default-equivalent post-state. For dev presets with preplaced sparks
  // (basic, basicWithWind, slope45deg, basicWithSlopeAndWind) AfterReload
  // lands in SparkPlaced-shape per requirements.md "Preset caveat".
});

describe("BottomBar edge cases", () => {
  let stores = createStores();
  beforeEach(() => {
    stores = createStores();
    stores.simulation.dataReady = true;
  });

  describe("Paused vs. Ended", () => {
    it("Start → Stop (Paused) → Start label remains 'Start' and is enabled", () => {
      stores.simulation.sparks.push(new Vector2(50000, 50000));
      stores.simulation.simulationStarted = true;
      stores.simulation.simulationRunning = false; // Stop pressed
      (stores.simulation as any).engine = mockEngine();
      render(<Provider stores={stores}><BottomBar /></Provider>);
      const start = screen.getByTestId("start-button");
      expect(start).not.toBeDisabled();
      expect(start).toHaveTextContent("Start");
      expectButtonState("restart-button", true);
      expectButtonState("terrain-button", false);
      expectButtonState("spark-button", false);
    });

    it("Start → fire finishes (Ended) → Start label is 'Start' and disabled", () => {
      stores.simulation.sparks.push(new Vector2(50000, 50000));
      stores.simulation.simulationStarted = true;
      stores.simulation.simulationRunning = false;
      (stores.simulation as any).engine = mockEngine({ fireDidStop: true });
      render(<Provider stores={stores}><BottomBar /></Provider>);
      const start = screen.getByTestId("start-button");
      expect(start).toBeDisabled();
      expect(start).toHaveTextContent("Start");
      expectButtonState("restart-button", true);
      expectButtonState("fireline-button", false);
      expectButtonState("helitack-button", false);
    });

    it("Paused → Restart → Restarted-state rules", async () => {
      stores.simulation.sparks.push(new Vector2(50000, 50000));
      stores.simulation.simulationStarted = true;
      stores.simulation.simulationRunning = false;
      (stores.simulation as any).engine = mockEngine();
      render(<Provider stores={stores}><BottomBar /></Provider>);
      await userEvent.click(screen.getByTestId("restart-button"));
      expect(stores.simulation.simulationStarted).toBe(false);
      expect(stores.simulation.engine).toBeNull();
      expect(stores.simulation.sparks.length).toBe(1); // preserved
      expectButtonState("terrain-button", true);
      expectButtonState("spark-button", true);
      expectButtonState("restart-button", false);
      expectButtonState("start-button", true);
    });

    it("Paused → Reload → Default-state rules", async () => {
      // Sanity guard: this test asserts sparks.length === 0 after reload,
      // which assumes the default config ships with no preplaced sparks.
      expect(stores.simulation.config.sparks).toEqual([]);
      stores.simulation.sparks.push(new Vector2(50000, 50000));
      stores.simulation.simulationStarted = true;
      stores.simulation.simulationRunning = false;
      (stores.simulation as any).engine = mockEngine();
      render(<Provider stores={stores}><BottomBar /></Provider>);
      await userEvent.click(screen.getByTestId("reload-button"));
      expect(stores.simulation.setupChanged).toBe(false);
      expect(stores.simulation.sparks.length).toBe(0);
      expectButtonState("restart-button", false);
      expectButtonState("reload-button", false);
    });

    it("Running → Reload → Default-state rules, engine torn down", async () => {
      // Sanity guard: see Paused → Reload above for rationale.
      expect(stores.simulation.config.sparks).toEqual([]);
      stores.simulation.sparks.push(new Vector2(50000, 50000));
      stores.simulation.simulationStarted = true;
      stores.simulation.simulationRunning = true;
      (stores.simulation as any).engine = mockEngine();
      render(<Provider stores={stores}><BottomBar /></Provider>);
      await userEvent.click(screen.getByTestId("reload-button"));
      expect(stores.simulation.engine).toBeNull();
      expect(stores.simulation.simulationStarted).toBe(false);
      expect(stores.simulation.sparks.length).toBe(0);
      expect(stores.simulation.setupChanged).toBe(false);
      expectButtonState("reload-button", false);
    });
  });

  describe("authoring gate", () => {
    it("Fireline disabled in Running when fireLineAvailable=false", () => {
      stores.simulation.config.fireLineAvailable = false;
      stores.simulation.sparks.push(new Vector2(50000, 50000));
      stores.simulation.simulationStarted = true;
      stores.simulation.simulationRunning = true;
      (stores.simulation as any).engine = mockEngine();
      render(<Provider stores={stores}><BottomBar /></Provider>);
      expectButtonState("fireline-button", false);
    });

    it("Helitack disabled in Running when helitackAvailable=false", () => {
      stores.simulation.config.helitackAvailable = false;
      stores.simulation.sparks.push(new Vector2(50000, 50000));
      stores.simulation.simulationStarted = true;
      stores.simulation.simulationRunning = true;
      (stores.simulation as any).engine = mockEngine();
      render(<Provider stores={stores}><BottomBar /></Provider>);
      expectButtonState("helitack-button", false);
    });
  });

  describe("ui.interaction reset", () => {
    it("Reload-during-PlaceSpark: returns to Default with Spark enabled", async () => {
      stores.simulation.setSetupChanged(true); // so Reload is enabled
      stores.ui.interaction = Interaction.PlaceSpark;
      render(<Provider stores={stores}><BottomBar /></Provider>);
      await userEvent.click(screen.getByTestId("reload-button"));
      expect(stores.ui.interaction).toBeNull();
      expectButtonState("spark-button", true);
    });

    it("Restart-during-DrawFireLine: ui.interaction cleared post-Restart", async () => {
      stores.simulation.sparks.push(new Vector2(50000, 50000));
      stores.simulation.simulationStarted = true;
      stores.simulation.simulationRunning = true;
      (stores.simulation as any).engine = mockEngine();
      stores.ui.interaction = Interaction.DrawFireLine;
      render(<Provider stores={stores}><BottomBar /></Provider>);
      await userEvent.click(screen.getByTestId("restart-button"));
      expect(stores.ui.interaction).toBeNull();
    });
  });

  describe("drag-to-move spark survives Restart", () => {
    it("setSpark(idx, x, y) mutates sparks[idx] after Restart", async () => {
      stores.simulation.sparks.push(new Vector2(50000, 50000));
      stores.simulation.simulationStarted = true;
      stores.simulation.simulationRunning = true;
      (stores.simulation as any).engine = mockEngine();
      render(<Provider stores={stores}><BottomBar /></Provider>);
      await userEvent.click(screen.getByTestId("restart-button"));
      expect(stores.simulation.sparks.length).toBe(1);
      stores.simulation.setSpark(0, 60000, 60000);
      expect(stores.simulation.sparks[0].x).toBe(60000);
      expect(stores.simulation.sparks[0].y).toBe(60000);
    });
  });

  describe("handler wiring", () => {
    // These are handler-wiring checks: they prove the click reaches the
    // handler which then calls simulation.restart()/reload(). Actual
    // state-transition behavior is covered by the Paused→Restart,
    // Paused→Reload, and Running→Reload tests above. Don't weaken these to
    // mockImplementation() — the spy currently forwards to the real method,
    // which lets a maintainer add downstream assertions here without
    // re-wiring.

    it("Restart click calls simulation.restart() (when enabled)", async () => {
      // Seed Running so Restart is enabled
      stores.simulation.sparks.push(new Vector2(50000, 50000));
      stores.simulation.simulationStarted = true;
      stores.simulation.simulationRunning = true;
      (stores.simulation as any).engine = mockEngine();
      jest.spyOn(stores.simulation, "restart");
      render(<Provider stores={stores}><BottomBar /></Provider>);
      await userEvent.click(screen.getByTestId("restart-button"));
      expect(stores.simulation.restart).toHaveBeenCalled();
    });

    it("Reload click calls simulation.reload() (when enabled)", async () => {
      // Seed SetupChanged so Reload is enabled
      stores.simulation.setSetupChanged(true);
      jest.spyOn(stores.simulation, "reload");
      render(<Provider stores={stores}><BottomBar /></Provider>);
      await userEvent.click(screen.getByTestId("reload-button"));
      expect(stores.simulation.reload).toHaveBeenCalled();
    });
  });

  describe("start button transitions", () => {
    it("start button is disabled when no sparks (Default state)", () => {
      stores.simulation.sparks = [];
      stores.simulation.dataReady = false;
      expect(stores.simulation.ready).toEqual(false);
      render(
        <Provider stores={stores}>
          <BottomBar />
        </Provider>
      );
      const start = screen.getByTestId("start-button");
      expect(start).toBeDisabled();

      act(() => {
        stores.simulation.dataReady = true;
        expect(stores.simulation.ready).toEqual(false);
        stores.simulation.sparks[0] = new Vector2(100, 100);
        expect(stores.simulation.ready).toEqual(true);
      });
      expect(start).not.toBeDisabled();
    });
  });
});
