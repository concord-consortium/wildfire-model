import React from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createStores } from "../models/stores";
import { Provider } from "mobx-react";
import { TerrainPanel } from "./terrain-panel";
import { Vegetation, TerrainType } from "../types";
import { Zone } from "../models/zone";

const mockLog = jest.fn();
jest.mock("../log", () => ({
  log: (...args: unknown[]) => mockLog(...args)
}));

const footerLabels = () =>
  // eslint-disable-next-line testing-library/no-node-access
  within(screen.getByTestId("terrain-cancel").closest("div")!)
    .getAllByRole("button").map(b => b.textContent);

const defaultTwoZones = [
  {
    vegetation: Vegetation.Forest,
    moistureContent: 0.07,
    droughtLevel: 2,
    terrainType: TerrainType.Mountains
  },
  {
    vegetation: Vegetation.Shrub,
    moistureContent: 0.14,
    droughtLevel: 1,
    terrainType: TerrainType.Plains
  }
];

const defaultThreeZones = [
  {
    vegetation: Vegetation.Forest,
    moistureContent: 0.07,
    droughtLevel: 2,
    terrainType: TerrainType.Mountains
  },
  {
    vegetation: Vegetation.Shrub,
    moistureContent: 0.14,
    droughtLevel: 1,
    terrainType: TerrainType.Plains
  },
  {
    vegetation: Vegetation.ForestWithSuppression,
    moistureContent: 0.21,
    droughtLevel: 0,
    terrainType: TerrainType.Foothills
  },
];

describe("Terrain Panel component", () => {
  let stores = createStores();
  beforeEach(() => {
    stores = createStores();
  });

  it("is not displayed until the UI store value is set", () => {
    stores.ui.showTerrainUI = false;
    render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    expect(screen.queryByTestId("terrain-header")).not.toBeInTheDocument();

    act(() => {
    stores.ui.showTerrainUI = true;
    });
    expect(screen.getByTestId("terrain-header")).toBeInTheDocument();
  });
});

describe("zone UI", () => {
  let stores = createStores();
  beforeEach(() => {
    stores = createStores();
    stores.ui.showTerrainUI = true;
  });

  it("displays all configured zones -> 2", () => {
    stores.simulation.zones = defaultTwoZones.map(opt => new Zone(opt));
    stores.simulation.config.zonesCount = 2;

    render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    expect(screen.getAllByTestId("zone-option")).toHaveLength(2);
  });

  it("displays all configured zones -> 3", () => {
    stores.simulation.zones = defaultThreeZones.map(opt => new Zone(opt));
    stores.simulation.config.zonesCount = 3;

    render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    expect(screen.getAllByTestId("zone-option")).toHaveLength(3);
  });
});

describe("tour anchor testids", () => {
  let stores = createStores();
  beforeEach(() => {
    stores = createStores();
    stores.simulation.zones = defaultTwoZones.map(opt => new Zone(opt));
    stores.simulation.config.zonesCount = 2;
    stores.ui.showTerrainUI = true;
  });

  it("exposes the panel container and Next button when open on the zone panel", () => {
    render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    // zonesCount defined → wizard opens on the zone-edit panel (1), which has Next.
    expect(screen.getByTestId("terrain-panel-container")).toBeInTheDocument();
    expect(screen.getByTestId("terrain-next")).toBeInTheDocument();
  });

  it("exposes the Wind section on the final panel", async () => {
    render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    // Advance to the wind panel (2), where the Wind section lives.
    const nextButtons = screen.getAllByRole("button", { name: /next/i });
    await userEvent.click(nextButtons[nextButtons.length - 1]);
    expect(screen.getByTestId("terrain-wind")).toBeInTheDocument();
  });
});

describe("vegetation selector", () => {
  let stores = createStores();
  beforeEach(() => {
    stores = createStores();
    stores.simulation.zones = defaultThreeZones.map(opt => new Zone(opt));
    stores.simulation.config.zonesCount = 3;
    stores.ui.showTerrainUI = true;
  });

  it("displays the vegetation and drought level sliders", () => {
    render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    expect(screen.getAllByRole("slider")).toHaveLength(2);
  });

  it("displays the correct vegetation level", () => {
    render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    // eslint-disable-next-line testing-library/no-node-access
    const veg = screen.getByTestId("vegetation-slider").querySelector("input");
    expect(veg).toHaveValue("1");
  });

  it("displays the correct drought level", () => {
    render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    // eslint-disable-next-line testing-library/no-node-access
    const drought = screen.getByTestId("drought-slider").querySelector("input");
    expect(drought).toHaveValue("2");
  });

  // Setup shows the full display spelling; only the map's zone labels abbreviate it.
  it("offers the full 'Forest with Suppression' spelling on the vegetation slider", () => {
    render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    // Zone 0 is Mountains, the only terrain whose slider offers the option.
    expect(screen.getByTestId("vegetation-slider")).toBeInTheDocument();
    expect(screen.getByText("Forest with Suppression")).toBeInTheDocument();
  });

  it("captions the wind panel's zone summary with the full spelling", async () => {
    render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    const nextButtons = screen.getAllByRole("button", { name: /next/i });
    await userEvent.click(nextButtons[nextButtons.length - 1]);
    expect(screen.getByTestId("terrain-wind")).toBeInTheDocument();
    // Zone 2's vegetation is ForestWithSuppression. getByText rather than an
    // exact textContent comparison: the caption's non-breaking space is
    // collapsed by testing-library's normalizer but not by string equality.
    expect(screen.getByText("Forest with Suppression")).toBeInTheDocument();
  });
});

describe("setupChanged", () => {
  let stores = createStores();
  beforeEach(() => {
    stores = createStores();
    stores.simulation.zones = defaultTwoZones.map(opt => new Zone(opt));
    stores.simulation.config.zonesCount = 2;
    stores.ui.showTerrainUI = true;
    mockLog.mockClear();
  });

  const cancelPayload = () =>
    mockLog.mock.calls.find((c: unknown[]) => c[0] === "TerrainPanelClosed")![1];

  const goToCreatePanel = async () => {
    // beforeEach sets zonesCount=2 so we start on panel 1 (zone-edit).
    // One Next press → panel 2 (wind), where the Create button lives.
    const nextButtons = screen.getAllByRole("button", { name: /next/i });
    await userEvent.click(nextButtons[nextButtons.length - 1]);
  };

  const clickCreate = async () => {
    await userEvent.click(screen.getByRole("button", { name: /create/i }));
  };

  it("(a) Create with no field changes — setupChanged stays false", async () => {
    render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    await goToCreatePanel();
    await clickCreate();
    expect(stores.simulation.setupChanged).toBe(false);
  });

  it("(b) change drought, Create — setupChanged becomes true [diff-before-mutate canary]", async () => {
    render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    // eslint-disable-next-line testing-library/no-node-access
    const droughtSlider = screen.getByTestId("drought-slider").querySelector("input")!;
    fireEvent.change(droughtSlider, { target: { value: "3" } });
    await goToCreatePanel();
    await clickCreate();
    expect(stores.simulation.setupChanged).toBe(true);
    // This is the canary for the diff-before-mutate ordering. A broken
    // post-mutate implementation would produce setupChanged=false because the
    // diff would see the simulation already updated and compare it against
    // the wizard-local state also at the same value.
  });

  it("(c) change drought, change back, Create — setupChanged stays false (empty diff)", async () => {
    render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    // eslint-disable-next-line testing-library/no-node-access
    const droughtSlider = screen.getByTestId("drought-slider").querySelector("input")!;
    fireEvent.change(droughtSlider, { target: { value: "3" } });
    fireEvent.change(droughtSlider, { target: { value: "2" } });
    await goToCreatePanel();
    await clickCreate();
    expect(stores.simulation.setupChanged).toBe(false);
  });

  // eslint-disable-next-line max-len
  it("(d) change drought, Cancel — the simulation keeps its pre-open values [no-commit-on-cancel canary]", async () => {
    render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    // eslint-disable-next-line testing-library/no-node-access
    const droughtSlider = screen.getByTestId("drought-slider").querySelector("input")!;
    fireEvent.change(droughtSlider, { target: { value: "3" } });
    await userEvent.click(screen.getByTestId("terrain-cancel"));
    // Read the simulation's own values back: setupChanged alone cannot fail on a
    // commit-on-cancel regression, because updateZones never writes that flag.
    expect(stores.simulation.zones[0].droughtLevel).toBe(2);
    expect(stores.simulation.zones[1].droughtLevel).toBe(1);
    expect(stores.simulation.zonesCount).toBe(2);
    expect(stores.simulation.wind.speed).toBe(0);
    expect(stores.simulation.wind.direction).toBe(0);
    expect(stores.simulation.setupChanged).toBe(false);
    expect(stores.ui.showTerrainUI).toBe(false);
  });

  it("(e) start from setupChanged=true, Create with no changes — setupChanged stays true", async () => {
    stores.simulation.setSetupChanged(true);
    // beforeEach already sets ui.showTerrainUI=true. render(...) below mounts
    // the component, and the snapshot-capture useEffect fires once on mount
    // (React runs effects after the first commit regardless of whether the
    // dep array's values "changed" — there's nothing to compare on mount).
    // The effect observes ui.showTerrainUI===true and captures the current
    // simulation.zones as the baseline. No store-side toggling is needed.
    render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    await goToCreatePanel();
    await clickCreate();
    expect(stores.simulation.setupChanged).toBe(true);
  });

  it("(f) change wind speed, Create — setupChanged becomes true", async () => {
    render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    await goToCreatePanel();
    // eslint-disable-next-line testing-library/no-node-access
    const speedSlider = screen.getByTestId("wind-speed-slider").querySelector("input")!;
    fireEvent.change(speedSlider, { target: { value: "15" } });
    await clickCreate();
    expect(stores.simulation.setupChanged).toBe(true);
    // Wind direction coverage lives in setup-snapshot.test.ts (WindDial is a
    // custom SVG with no <input> element).
  });

  // eslint-disable-next-line max-len
  it("(g) change zonesCount (2 → 3), Create — setupChanged becomes true", async () => {
    // Require config.zonesCount === undefined so the wizard starts on the
    // zones-count panel.
    stores.simulation.config.zonesCount = undefined as any;
    // eslint-disable-next-line testing-library/no-container
    const { container } = render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    // ZonesCountSelector renders MUI <Radio>s with value="2" and value="3";
    // each wraps an <input type="radio"> queryable by value attribute.
    // eslint-disable-next-line testing-library/no-node-access, testing-library/no-container
    const threeZonesInput = container.querySelector('input[type="radio"][value="3"]') as HTMLInputElement;
    expect(threeZonesInput).not.toBeNull();
    fireEvent.click(threeZonesInput);
    // Walk through Next twice (panel 0 → 1 → 2) before clicking Create.
    const nextButtons = () => screen.getAllByRole("button", { name: /next/i });
    await userEvent.click(nextButtons()[nextButtons().length - 1]);
    await userEvent.click(nextButtons()[nextButtons().length - 1]);
    await clickCreate();
    expect(stores.simulation.setupChanged).toBe(true);
  });

  // eslint-disable-next-line max-len
  it("(h) snapshot refreshes on re-open: change drought, Create, reset, reopen, no change, Create — setupChanged stays false [canary for stale-snapshot bug]", async () => {
    render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    // First Create: change drought 2 → 3.
    // eslint-disable-next-line testing-library/no-node-access
    const droughtSlider1 = screen.getByTestId("drought-slider").querySelector("input")!;
    fireEvent.change(droughtSlider1, { target: { value: "3" } });
    await goToCreatePanel();
    await clickCreate();
    expect(stores.simulation.setupChanged).toBe(true);
    expect(stores.simulation.zones[0].droughtLevel).toBe(3);

    // Reset the flag via the setSetupChanged setter (see contract comment in
    // simulation.ts). We can't use reload() — it would wipe simulation.zones
    // back to the preset defaults; we specifically want the post-first-Create
    // state (drought=3) to remain live so the re-opened wizard's snapshot
    // captures the new baseline.
    stores.simulation.setSetupChanged(false);

    // Re-open the wizard. applyAndClose flipped showTerrainUI to false at the
    // end of the first Create; flipping it back to true here re-fires the
    // snapshot-capture effect (deps: [simulation, ui.showTerrainUI]).
    act(() => { stores.ui.showTerrainUI = true; });

    // No field change. Walk to Create panel and Create.
    await goToCreatePanel();
    await clickCreate();
    // If the snapshot refreshed on re-open: snapshot=3, live wizard=3,
    // diff is empty, setSetupChanged NOT called, flag stays false. ✓
    // If the snapshot is stale at drought=2: snapshot=2, live wizard=3,
    // diff is non-empty, setSetupChanged(true), flag flips to true. ✗
    expect(stores.simulation.setupChanged).toBe(false);
  });

  // eslint-disable-next-line max-len
  it("(i) change zonesCount (2 → 3), Cancel — the simulation keeps 2 zones", async () => {
    // Require config.zonesCount === undefined so the wizard starts on the
    // zones-count panel; only the master model can reach it.
    stores.simulation.config.zonesCount = undefined as any;
    // eslint-disable-next-line testing-library/no-container
    const { container } = render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    // eslint-disable-next-line testing-library/no-node-access, testing-library/no-container
    const threeZonesInput = container.querySelector('input[type="radio"][value="3"]') as HTMLInputElement;
    expect(footerLabels()).toEqual(["Cancel", "Next"]);
    fireEvent.click(threeZonesInput);
    await userEvent.click(screen.getByTestId("terrain-cancel"));
    expect(stores.simulation.zones.length).toBe(2);
    expect(stores.simulation.setupChanged).toBe(false);
    expect(cancelPayload()).toMatchObject({ panel: "zones", reachedWind: false });
  });

  // eslint-disable-next-line max-len
  it("(i2) change zonesCount (2 → 3), Next, Cancel — the simulation keeps 2 zones", async () => {
    stores.simulation.config.zonesCount = undefined as any;
    // eslint-disable-next-line testing-library/no-container
    const { container } = render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    // eslint-disable-next-line testing-library/no-node-access, testing-library/no-container
    const threeZonesInput = container.querySelector('input[type="radio"][value="3"]') as HTMLInputElement;
    fireEvent.click(threeZonesInput);
    const nextButtons = () => screen.getAllByRole("button", { name: /next/i });
    await userEvent.click(nextButtons()[nextButtons().length - 1]);
    expect(footerLabels()).toEqual(["Cancel", "Previous", "Next"]);
    await userEvent.click(screen.getByTestId("terrain-cancel"));
    expect(stores.simulation.zones.length).toBe(2);
    expect(stores.simulation.setupChanged).toBe(false);
  });

  // eslint-disable-next-line max-len
  it("(j) change drought, Cancel, reopen — the panel shows the simulation value, not the abandoned edit", async () => {
    render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    // eslint-disable-next-line testing-library/no-node-access
    const droughtSlider = screen.getByTestId("drought-slider").querySelector("input")!;
    fireEvent.change(droughtSlider, { target: { value: "3" } });
    expect(droughtSlider).toHaveValue("3");
    await userEvent.click(screen.getByTestId("terrain-cancel"));

    act(() => { stores.ui.showTerrainUI = true; });
    // eslint-disable-next-line testing-library/no-node-access
    const reopened = screen.getByTestId("drought-slider").querySelector("input")!;
    expect(reopened).toHaveValue("2");
  });

  it("(k) Cancel after an edit logs TerrainPanelClosed with changed: true", async () => {
    render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    // eslint-disable-next-line testing-library/no-node-access
    const droughtSlider = screen.getByTestId("drought-slider").querySelector("input")!;
    fireEvent.change(droughtSlider, { target: { value: "3" } });
    await userEvent.click(screen.getByTestId("terrain-cancel"));
    expect(cancelPayload()).toEqual({
      reason: "cancel", changed: true, panel: "conditions", reachedWind: false
    });
  });

  it("(l) Cancel on an untouched wizard logs TerrainPanelClosed with changed: false", async () => {
    render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    expect(footerLabels()).toEqual(["Cancel", "Next"]);
    await userEvent.click(screen.getByTestId("terrain-cancel"));
    expect(cancelPayload()).toEqual({
      reason: "cancel", changed: false, panel: "conditions", reachedWind: false
    });
  });

  // eslint-disable-next-line max-len
  it("(m) change drought, Next, Cancel on the wind panel — the simulation keeps its pre-open values", async () => {
    render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    // eslint-disable-next-line testing-library/no-node-access
    const droughtSlider = screen.getByTestId("drought-slider").querySelector("input")!;
    fireEvent.change(droughtSlider, { target: { value: "3" } });
    await goToCreatePanel();
    expect(screen.getByTestId("terrain-wind")).toBeInTheDocument();
    expect(footerLabels()).toEqual(["Cancel", "Previous", "Create"]);
    await userEvent.click(screen.getByTestId("terrain-cancel"));
    expect(stores.simulation.zones[0].droughtLevel).toBe(2);
    expect(stores.simulation.zones[1].droughtLevel).toBe(1);
    expect(stores.simulation.wind.speed).toBe(0);
    expect(stores.simulation.wind.direction).toBe(0);
    expect(stores.simulation.setupChanged).toBe(false);
    expect(cancelPayload()).toMatchObject({ panel: "wind", reachedWind: true });
  });

  // eslint-disable-next-line max-len
  it("(n) reach the wind panel, Previous, Cancel — panel is conditions but reachedWind is true", async () => {
    render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    await goToCreatePanel();
    expect(screen.getByTestId("terrain-wind")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /previous/i }));
    await userEvent.click(screen.getByTestId("terrain-cancel"));
    // reachedWind is a high-water mark, panel is where the student stood, so
    // this is the path where the two disagree.
    expect(cancelPayload()).toMatchObject({ panel: "conditions", reachedWind: true });
  });

  // eslint-disable-next-line max-len
  it("(p) reach the wind panel, Cancel, reopen, Cancel — reachedWind resets with the rest of the wizard", async () => {
    render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    await goToCreatePanel();
    await userEvent.click(screen.getByTestId("terrain-cancel"));
    expect(cancelPayload()).toMatchObject({ panel: "wind", reachedWind: true });

    mockLog.mockClear();
    act(() => { stores.ui.showTerrainUI = true; });
    await userEvent.click(screen.getByTestId("terrain-cancel"));
    expect(cancelPayload()).toMatchObject({ panel: "conditions", reachedWind: false });
  });
});
