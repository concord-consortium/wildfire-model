import React from "react";
import { act, render, screen } from "@testing-library/react";
import { createStores } from "../models/stores";
import { Provider } from "mobx-react";
import { TerrainPanel } from "./terrain-panel";
import { Vegetation, TerrainType } from "../types";

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
    stores.simulation.zones = defaultTwoZones;

    render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    expect(screen.getAllByTestId("zone-option")).toHaveLength(2);
  });

  it("displays all configured zones -> 3", () => {
    stores.simulation.zones = defaultThreeZones;

    render(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    expect(screen.getAllByTestId("zone-option")).toHaveLength(3);
  });
});

describe("vegetation selector", () => {
  let stores = createStores();
  beforeEach(() => {
    stores = createStores();
    stores.simulation.zones = defaultThreeZones;
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
});
