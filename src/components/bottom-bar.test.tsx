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
import { _resetAnalysisEngineForTests } from "../hazbot/wildfire/engine-singleton";

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
    // Clear All, Setup, Vegetation Key, Spark, Restart, Start, Fireline, Helitack.
    expect(screen.queryAllByRole("button").length).toEqual(8);
    expect(screen.getByTestId("vegetation-key-switch")).toBeInTheDocument();
  });

  it("terrain button opens the terrain dialog and a second click leaves it open", async () => {
    render(
      <Provider stores={stores}>
        <BottomBar />
      </Provider>
    );
    expect(stores.ui.showTerrainUI).toBe(false);
    await userEvent.click(screen.getByTestId("terrain-button"));
    expect(stores.ui.showTerrainUI).toBe(true);
    // Cancel and Next/Create are the only ways out, so the Setup button is
    // open-only: clicking it again must not close the wizard.
    await userEvent.click(screen.getByTestId("terrain-button"));
    expect(stores.ui.showTerrainUI).toBe(true);
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

  it("renders the Clear All button with label 'Clear All'", () => {
    render(
      <Provider stores={stores}>
        <BottomBar />
      </Provider>
    );
    expect(screen.getByTestId("clear-all-button")).toHaveTextContent("Clear All");
  });
});

describe("BottomBar state machine (Requirements 1-7)", () => {
  let stores = createStores();
  beforeEach(() => {
    stores = createStores();
  });

  // State 1: Default — Enabled: Setup, Spark. Disabled: Clear All, Restart,
  // Start, Fireline, Helitack.
  it("state 1 (Default): Setup + Spark enabled; Clear All/Restart/Start/Fireline/Helitack disabled", () => {
    seedState(stores, 1);
    render(<Provider stores={stores}><BottomBar /></Provider>);
    expectButtonState("terrain-button", true);
    expectButtonState("spark-button", true);
    expectButtonState("clear-all-button", false);
    expectButtonState("restart-button", false);
    expectButtonState("start-button", false);
    expectButtonState("fireline-button", false);
    expectButtonState("helitack-button", false);
  });

  // State 2: SetupChanged — Clear All enabled, rest same as Default
  it("state 2 (SetupChanged): Clear All enabled; otherwise same as Default", () => {
    seedState(stores, 2);
    render(<Provider stores={stores}><BottomBar /></Provider>);
    expectButtonState("terrain-button", true);
    expectButtonState("spark-button", true);
    expectButtonState("clear-all-button", true);
    expectButtonState("restart-button", false);
    expectButtonState("start-button", false);
    expectButtonState("fireline-button", false);
    expectButtonState("helitack-button", false);
  });

  // State 3: SparkPlaced — Start enabled, Clear All enabled, rest like Default
  it("state 3 (SparkPlaced): Start + Clear All enabled", () => {
    seedState(stores, 3);
    render(<Provider stores={stores}><BottomBar /></Provider>);
    expectButtonState("terrain-button", true);
    expectButtonState("spark-button", true);
    expectButtonState("clear-all-button", true);
    expectButtonState("restart-button", false);
    expectButtonState("start-button", true);
    expectButtonState("fireline-button", false);
    expectButtonState("helitack-button", false);
  });

  // State 4: Running — Restart, Start/Pause, Fireline, Helitack enabled;
  // Setup, Spark disabled
  // eslint-disable-next-line max-len
  it("state 4 (Running): Setup/Spark disabled; Restart/Start/Fireline/Helitack enabled; Clear All enabled; label is 'Pause'", () => {
    seedState(stores, 4);
    render(<Provider stores={stores}><BottomBar /></Provider>);
    expectButtonState("terrain-button", false);
    expectButtonState("spark-button", false);
    expectButtonState("clear-all-button", true);
    expectButtonState("restart-button", true);
    expectButtonState("start-button", true);
    expectButtonState("fireline-button", true);
    expectButtonState("helitack-button", true);
    // Requirement 4: label is "Pause" while simulationRunning === true.
    // Regression guard for the simulationRunning ternary on the start button.
    expect(screen.getByTestId("start-button")).toHaveTextContent("Pause");
  });

  // State 5: Ended — Start, Fireline, Helitack disabled; Restart, Clear All enabled
  // eslint-disable-next-line max-len
  it("state 5 (Ended): Start/Fireline/Helitack disabled; Restart/Clear All enabled; Setup/Spark disabled", () => {
    seedState(stores, 5);
    render(<Provider stores={stores}><BottomBar /></Provider>);
    expectButtonState("terrain-button", false);
    expectButtonState("spark-button", false);
    expectButtonState("clear-all-button", true);
    expectButtonState("restart-button", true);
    expectButtonState("start-button", false);
    expectButtonState("fireline-button", false);
    expectButtonState("helitack-button", false);
  });

  // State 6: Restarted — Setup, Spark, Start, Clear All enabled; Restart disabled
  // eslint-disable-next-line max-len
  it("state 6 (Restarted): Setup/Spark/Start/Clear All enabled; Restart disabled; Fireline/Helitack disabled", () => {
    seedState(stores, 6);
    render(<Provider stores={stores}><BottomBar /></Provider>);
    expectButtonState("terrain-button", true);
    expectButtonState("spark-button", true);
    expectButtonState("clear-all-button", true);
    expectButtonState("restart-button", false);
    expectButtonState("start-button", true);
    expectButtonState("fireline-button", false);
    expectButtonState("helitack-button", false);
  });

  // State 7 (AfterClearAll) is intentionally omitted from this matrix. The
  // state-7 button matrix is identical to state 1 (Default) for curriculum
  // presets with empty config.sparks. Real "AfterClearAll" coverage lives in
  // the Paused vs. Ended → Paused → Clear All and Running → Clear All edge-case
  // tests below: both click the actual Clear All button and assert
  // Default-equivalent post-state. For dev presets with preplaced sparks
  // (basic, basicWithWind, slope45deg, basicWithSlopeAndWind) AfterClearAll
  // lands in SparkPlaced-shape per requirements.md "Preset caveat".
});

describe("BottomBar edge cases", () => {
  let stores = createStores();
  beforeEach(() => {
    stores = createStores();
    stores.simulation.dataReady = true;
  });

  describe("Paused vs. Ended", () => {
    it("Start → Pause → Start label remains 'Start' and is enabled", () => {
      stores.simulation.sparks.push(new Vector2(50000, 50000));
      stores.simulation.simulationStarted = true;
      stores.simulation.simulationRunning = false; // Pause pressed
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

    it("Paused → Clear All → Default-state rules", async () => {
      // Sanity guard: this test asserts sparks.length === 0 after reload,
      // which assumes the default config ships with no preplaced sparks.
      expect(stores.simulation.config.sparks).toEqual([]);
      stores.simulation.sparks.push(new Vector2(50000, 50000));
      stores.simulation.simulationStarted = true;
      stores.simulation.simulationRunning = false;
      (stores.simulation as any).engine = mockEngine();
      render(<Provider stores={stores}><BottomBar /></Provider>);
      await userEvent.click(screen.getByTestId("clear-all-button"));
      expect(stores.simulation.setupChanged).toBe(false);
      expect(stores.simulation.sparks.length).toBe(0);
      expectButtonState("restart-button", false);
      expectButtonState("clear-all-button", false);
    });

    it("Vegetation Key survives both Restart and Clear All", async () => {
      stores.ui.showVegetationKey = true;
      stores.simulation.sparks.push(new Vector2(50000, 50000));
      stores.simulation.simulationStarted = true;
      stores.simulation.simulationRunning = false;
      (stores.simulation as any).engine = mockEngine();
      render(<Provider stores={stores}><BottomBar /></Provider>);

      // Each half asserts the reset it rode on actually happened, so neither can
      // pass by clicking a disabled button.
      await userEvent.click(screen.getByTestId("restart-button"));
      expect(stores.simulation.simulationStarted).toBe(false);
      expect(stores.ui.showVegetationKey).toBe(true);

      await userEvent.click(screen.getByTestId("clear-all-button"));
      expect(stores.simulation.sparks.length).toBe(0);
      expect(stores.ui.showVegetationKey).toBe(true);
    });

    it("Running → Clear All → Default-state rules, engine torn down", async () => {
      // Sanity guard: see Paused → Clear All above for rationale.
      expect(stores.simulation.config.sparks).toEqual([]);
      stores.simulation.sparks.push(new Vector2(50000, 50000));
      stores.simulation.simulationStarted = true;
      stores.simulation.simulationRunning = true;
      (stores.simulation as any).engine = mockEngine();
      render(<Provider stores={stores}><BottomBar /></Provider>);
      await userEvent.click(screen.getByTestId("clear-all-button"));
      expect(stores.simulation.engine).toBeNull();
      expect(stores.simulation.simulationStarted).toBe(false);
      expect(stores.simulation.sparks.length).toBe(0);
      expect(stores.simulation.setupChanged).toBe(false);
      expectButtonState("clear-all-button", false);
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

  describe("Fireline tool armed", () => {
    const seedArmedFireLine = () => {
      seedState(stores, 4);
      stores.ui.interaction = Interaction.DrawFireLine;
    };

    it("keeps the Fireline button enabled so it can cancel the placement", () => {
      seedArmedFireLine();
      render(<Provider stores={stores}><BottomBar /></Provider>);
      expectButtonState("fireline-button", true);
    });

    it("keeps it enabled once the first end is placed and the markers are used up", () => {
      seedArmedFireLine();
      // Pushed directly: addFireLineMarker draws the preview, which needs loaded cells.
      stores.simulation.fireLineMarkers.push(new Vector2(30000, 40000), new Vector2(38000, 40000));
      stores.ui.fireLinePlacementInProgress = true;
      render(<Provider stores={stores}><BottomBar /></Provider>);
      expect(stores.simulation.canAddFireLineMarker).toBe(false);
      expectButtonState("fireline-button", true);
    });

    it("marks the Fireline button selected, and only while armed", () => {
      seedState(stores, 4);
      const { rerender } = render(<Provider stores={stores}><BottomBar /></Provider>);
      expect(screen.getByTestId("fireline-button").className).not.toContain("selected");
      act(() => { stores.ui.interaction = Interaction.DrawFireLine; });
      rerender(<Provider stores={stores}><BottomBar /></Provider>);
      expect(screen.getByTestId("fireline-button").className).toContain("selected");
    });

    it("disarms the tool when the button is clicked again", async () => {
      seedArmedFireLine();
      render(<Provider stores={stores}><BottomBar /></Provider>);
      await userEvent.click(screen.getByTestId("fireline-button"));
      expect(stores.ui.interaction).toBeNull();
    });
  });

  describe("ui.interaction reset", () => {
    it("Clear All during PlaceSpark: returns to Default with Spark enabled", async () => {
      stores.simulation.setSetupChanged(true); // so Clear All is enabled
      stores.ui.interaction = Interaction.PlaceSpark;
      render(<Provider stores={stores}><BottomBar /></Provider>);
      await userEvent.click(screen.getByTestId("clear-all-button"));
      expect(stores.ui.interaction).toBeNull();
      expectButtonState("spark-button", true);
    });

    it("Start-during-Helitack: a run never resumes with a placement tool armed", async () => {
      jest.spyOn(stores.simulation, "start").mockImplementation(() => { /* noop */ });
      seedState(stores, 4);
      stores.simulation.simulationRunning = false;
      stores.ui.interaction = Interaction.Helitack;
      render(<Provider stores={stores}><BottomBar /></Provider>);
      await userEvent.click(screen.getByTestId("start-button"));
      expect(stores.ui.interaction).toBeNull();
    });

    it("Setup-during-PlaceSpark: the wizard never opens over an armed tool", async () => {
      // The wizard is a small floating panel, not a full-screen overlay, so an armed
      // Spark would still reach the map around it.
      stores.ui.interaction = Interaction.PlaceSpark;
      render(<Provider stores={stores}><BottomBar /></Provider>);
      await userEvent.click(screen.getByTestId("terrain-button"));
      expect(stores.ui.interaction).toBeNull();
      expect(stores.ui.showTerrainUI).toBe(true);
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
    // Paused→Clear All, and Running→Clear All tests above. Don't weaken these to
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

    it("Clear All click calls simulation.reload() (when enabled)", async () => {
      // Seed SetupChanged so Clear All is enabled
      stores.simulation.setSetupChanged(true);
      jest.spyOn(stores.simulation, "reload");
      render(<Provider stores={stores}><BottomBar /></Provider>);
      await userEvent.click(screen.getByTestId("clear-all-button"));
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

describe("model controls while the Setup wizard is open", () => {
  let stores = createStores();
  beforeEach(() => {
    stores = createStores();
  });

  // The wizard can only be open before the run starts, so Restart, Fire Line
  // and Helitack are already disabled by simulationStarted and need no guard.
  // Spark, Clear All, Start and Speed each need one, and have a case below.
  const renderWithWizardOpen = () => {
    seedState(stores, 3);
    stores.ui.showTerrainUI = true;
    render(<Provider stores={stores}><BottomBar /></Provider>);
  };

  it("disables Spark", () => {
    renderWithWizardOpen();
    expectButtonState("spark-button", false);
  });

  it("disables Clear All", () => {
    renderWithWizardOpen();
    expectButtonState("clear-all-button", false);
  });

  it("disables Start", () => {
    renderWithWizardOpen();
    expectButtonState("start-button", false);
  });

  // Not expectButtonState: that calls toBeDisabled() on the element carrying the
  // testid, and the Slider's is a non-form span. MUI puts disabled on its hidden
  // range input.
  it("disables Speed", () => {
    renderWithWizardOpen();
    // eslint-disable-next-line testing-library/no-node-access
    expect(screen.getByTestId("speed-control").querySelector("input")).toBeDisabled();
  });

  it("leaves Setup enabled and marks it selected", () => {
    renderWithWizardOpen();
    expectButtonState("terrain-button", true);
    // identity-obj-proxy resolves css.selected, so the class is visible here;
    // the rendered treatment is asserted in bottom-bar-visuals.cy.ts.
    expect(screen.getByTestId("terrain-button").className).toContain("selected");
  });

  it("leaves the wizard open when Setup is clicked", async () => {
    renderWithWizardOpen();
    await userEvent.click(screen.getByTestId("terrain-button"));
    expect(stores.ui.showTerrainUI).toBe(true);
  });
});

// WM-6 Hazbot Analysis button integration. The button mounts gated on a LOADED
// rule-set (getAnalysisEngine()?.ruleSet), so these tests drive the memoized
// engine singleton via the URL (mirroring engine-singleton.test.ts) and reset it
// around each case so the no-flag default (engine undefined → no button) is
// restored for the rest of the suite.
describe("BottomBar Hazbot button (WM-6)", () => {
  const originalLocation = window.location;
  const setUrl = (search: string) => {
    Object.defineProperty(window, "location", {
      value: new URL(`https://wildfire-model.unexisting.url.com/${search}`),
      writable: true,
    });
  };

  let stores = createStores();
  beforeEach(() => {
    _resetAnalysisEngineForTests();
    setUrl("?hazbotRules=23");
    stores = createStores();
    stores.simulation.dataReady = true;
  });
  afterEach(() => {
    _resetAnalysisEngineForTests();
    Object.defineProperty(window, "location", { value: originalLocation, writable: true });
  });

  // Seed a running sim with a loaded mock engine so Start/Stop is exercisable.
  const seedRunning = () => {
    stores.simulation.sparks.push(new Vector2(50000, 50000));
    stores.simulation.simulationStarted = true;
    stores.simulation.simulationRunning = true;
    (stores.simulation as any).engine = mockEngine();
  };

  it("renders the Hazbot button when a rule-set is loaded (?hazbotRules=23)", () => {
    render(<Provider stores={stores}><BottomBar /></Provider>);
    expect(screen.getByTestId("hazbot-button")).toBeInTheDocument();
  });

  it("does NOT render the Hazbot button for an invalid rule-set id (?hazbotRules=99)", () => {
    _resetAnalysisEngineForTests();
    setUrl("?hazbotRules=99");
    render(<Provider stores={stores}><BottomBar /></Provider>);
    expect(screen.queryByTestId("hazbot-button")).toBeNull();
  });

  it("Start → Pause (manual) does NOT arm the pulse: the run is paused, not over", async () => {
    seedRunning();
    render(<Provider stores={stores}><BottomBar /></Provider>);
    // Manual pause (Start→Pause toggle).
    await userEvent.click(screen.getByTestId("start-button"));
    expect(stores.simulation.simulationRunning).toBe(false);
    expect(stores.ui.hazbotPulseArmed).toBe(false);
  });

  it("Start → Fire Line pause does NOT arm the pulse (mid-intervention exclusion)", async () => {
    seedRunning();
    render(<Provider stores={stores}><BottomBar /></Provider>);
    await userEvent.click(screen.getByTestId("fireline-button"));
    // Fire Line also stops the sim, but is mid-intervention — must not arm.
    expect(stores.simulation.simulationRunning).toBe(false);
    expect(stores.ui.hazbotPulseArmed).toBe(false);
  });

  it("Restart after a completed run hides the pulse via the simulationStarted guard", async () => {
    // Completed-run state: started, not running, the fire out, and armed.
    stores.simulation.sparks.push(new Vector2(50000, 50000));
    stores.simulation.simulationStarted = true;
    stores.simulation.simulationRunning = false;
    (stores.simulation as any).engine = mockEngine({ fireDidStop: true });
    stores.ui.hazbotPulseArmed = true;
    render(<Provider stores={stores}><BottomBar /></Provider>);
    // Pulse visible (armed && started && !running) — the `ready` class gates the
    // box-shadow pulse on the wrapper.
    const wrap = () => screen.getByTestId("hazbot-button-wrap");
    expect(wrap().className).toMatch(/ready/);
    await userEvent.click(screen.getByTestId("restart-button"));
    // Restart clears simulationStarted without routing through start(); the
    // armed flag may stay set but the predicate now hides the pulse.
    expect(stores.simulation.simulationStarted).toBe(false);
    expect(wrap().className).not.toMatch(/ready/);
  });

  it("Clear All clears the Hazbot feedback levels; Restart leaves them alone", async () => {
    seedState(stores, 5); // Ended: both Restart and Clear All are enabled
    stores.ui.hazbotFeedbackLevels.set(2, 3);
    stores.ui.hazbotLastFeedbackShown = { level: 3, source: "round3" };
    render(<Provider stores={stores}><BottomBar /></Provider>);

    await userEvent.click(screen.getByTestId("restart-button"));
    expect(stores.ui.hazbotFeedbackLevels.get(2)).toBe(3);
    expect(stores.ui.hazbotLastFeedbackShown).toEqual({ level: 3, source: "round3" });

    await userEvent.click(screen.getByTestId("clear-all-button"));
    expect(stores.ui.hazbotFeedbackLevels.size).toBe(0);
    expect(stores.ui.hazbotLastFeedbackShown).toBeUndefined();
  });

  it("natural burnout arms the pulse, and clicking the button clears it and opens feedback", async () => {
    seedRunning();
    render(<Provider stores={stores}><BottomBar /></Provider>);
    expect(stores.ui.hazbotPulseArmed).toBe(false);
    // simulationEnded is a computed over simulationStarted && !simulationRunning
    // && engine.fireDidStop; engine is NOT observable, so only simulationRunning
    // carries the reactivity edge. Assign the stopped engine FIRST, then flip
    // simulationRunning false within one act() so the computed sees the
    // false→true edge and the reaction fires (mirrors production tick()).
    act(() => {
      (stores.simulation as any).engine = mockEngine({ fireDidStop: true });
      stores.simulation.simulationRunning = false;
    });
    expect(stores.ui.hazbotPulseArmed).toBe(true);
    // The button is back, and clicking it acknowledges the run and opens the feedback.
    await userEvent.click(screen.getByTestId("hazbot-button"));
    expect(stores.ui.hazbotPulseArmed).toBe(false);
    expect(stores.ui.showHazbotFeedback).toBe(true);
  });

  // The bar lockout covers the model controls in .mainContainer only. The
  // Hazbot button sits in .rightContainer and is not a way out of the wizard.
  it("still opens feedback while the Setup wizard is open, and leaves the wizard open", async () => {
    stores.ui.showTerrainUI = true;
    render(<Provider stores={stores}><BottomBar /></Provider>);
    await userEvent.click(screen.getByTestId("hazbot-button"));
    expect(stores.ui.showHazbotFeedback).toBe(true);
    expect(stores.ui.showTerrainUI).toBe(true);
  });

  // One case per route out of the running state: handleStart's pause branch,
  // handleFireLine and handleRestart's discard are each driven through the real
  // control. The natural end is not: engine is not observable, so only
  // simulationRunning carries the reactivity edge and the case has to mirror tick() by
  // hand, the same shape as the pulse test above it.
  describe("disabled for the duration of a run (WM-31)", () => {
    const hazbot = () => screen.getByTestId("hazbot-button");

    it("stays disabled through a manual Pause, which leaves the run in progress", async () => {
      seedRunning();
      render(<Provider stores={stores}><BottomBar /></Provider>);
      expect(hazbot()).toBeDisabled();
      await userEvent.click(screen.getByTestId("start-button"));
      expect(stores.simulation.simulationRunning).toBe(false);
      expect(hazbot()).toBeDisabled();
    });

    it("stays disabled through a Fire Line intervention (the tool pauses the run)", async () => {
      seedRunning();
      render(<Provider stores={stores}><BottomBar /></Provider>);
      expect(hazbot()).toBeDisabled();
      // handleFireLine stops the run when the tool is ARMED, before any marker is
      // placed, so this is the earliest point in the intervention.
      await userEvent.click(screen.getByTestId("fireline-button"));
      expect(stores.simulation.simulationRunning).toBe(false);
      expect(hazbot()).toBeDisabled();
    });

    it("stays disabled through a Helitack drop, which does not pause the run", async () => {
      seedRunning();
      render(<Provider stores={stores}><BottomBar /></Provider>);
      await userEvent.click(screen.getByTestId("helitack-button"));
      expect(stores.simulation.simulationRunning).toBe(true);
      expect(hazbot()).toBeDisabled();
    });

    it("is re-enabled when the fire burns out on its own", () => {
      seedRunning();
      render(<Provider stores={stores}><BottomBar /></Provider>);
      expect(hazbot()).toBeDisabled();
      // Mirrors production tick(): the engine reports fireDidStop, then the flag falls.
      act(() => {
        (stores.simulation as any).engine = mockEngine({ fireDidStop: true });
        stores.simulation.simulationRunning = false;
      });
      expect(hazbot()).not.toBeDisabled();
    });

    it("is re-enabled by a mid-run Restart, which discards the run", async () => {
      seedRunning();
      render(<Provider stores={stores}><BottomBar /></Provider>);
      expect(hazbot()).toBeDisabled();
      await userEvent.click(screen.getByTestId("restart-button"));
      expect(stores.simulation.simulationRunning).toBe(false);
      expect(hazbot()).not.toBeDisabled();
    });
  });
});
