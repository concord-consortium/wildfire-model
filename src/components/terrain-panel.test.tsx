import React from "react";
import { mount } from "enzyme";
import { createStores } from "../models/stores";
import { Provider } from "mobx-react";
import { TerrainPanel } from "./terrain-panel";
import { Slider } from "@material-ui/core";

const defaultTwoZones = [
  {
    landType: 2,
    moistureContent: 0.07,
    droughtLevel: 2,
    terrainType: 0
  },
  {
    landType: 1,
    moistureContent: 0.14,
    droughtLevel: 1,
    terrainType: 2
  }
];

const defaultThreeZones = [
  {
    landType: 2,
    moistureContent: 0.07,
    droughtLevel: 2,
    terrainType: 0
  },
  {
    landType: 1,
    moistureContent: 0.14,
    droughtLevel: 1,
    terrainType: 2
  },
  {
    landType: 3,
    moistureContent: 0.21,
    droughtLevel: 0,
    terrainType: 1
  },
];

describe("Terrain Panel component", () => {
  let stores = createStores();
  beforeEach(() => {
    stores = createStores();
  });

  it("mounts at start up", () => {
    stores.ui.showTerrainUI = false;
    const wrapper = mount(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    expect(wrapper.find(TerrainPanel).length).toBe(1);
  });

  it("is not displayed until the UI store value is set", () => {
    stores.ui.showTerrainUI = false;
    let wrapper = mount(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    expect(wrapper.find('[data-test="terrain-header"]').length).toBe(0);

    stores.ui.showTerrainUI = true;
    wrapper = mount(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    expect(wrapper.find('[data-test="terrain-header"]').length).toBe(1);
  });
});
describe("zone UI", () => {
  let stores = createStores();
  beforeEach(() => {
    stores = createStores();
    stores.ui.showTerrainUI = true;
  });

  it("displays all configured zones", () => {
    stores.simulation.zones = defaultTwoZones;

    let wrapper = mount(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    expect(wrapper.find('[data-test="zone-option"]')).toHaveLength(2);

    stores.simulation.zones = defaultThreeZones;

    wrapper = mount(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    expect(wrapper.find('[data-test="zone-option"]')).toHaveLength(2);
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
    const wrapper = mount(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    expect(wrapper.find(Slider)).toHaveLength(2);

  });
  it("displays the correct vegetation level", () => {
    const wrapper = mount(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );
    const veg = wrapper.find('[data-test="vegetation-slider"]').first();
    expect(veg.prop("value")).toBe(1);

    // const panel = (wrapper.find(TerrainPanel).instance() as any).wrappedInstance as TerrainPanel;
    // const panel = wrapper.find(TerrainPanel).instance();
    // expect(panel.state("selectedZone")).toBe(0);

    // panel.setState({ selectedZone: 1 });

    // veg = wrapper.find('[data-test="vegetation-slider"]').first();
    // expect(veg.prop("value")).toBe(1);
  });
  it("displays the correct drought level", () => {
    const wrapper = mount(
      <Provider stores={stores}>
        <TerrainPanel />
      </Provider>
    );

    const drought = wrapper.find('[data-test="drought-slider"]').first();
    expect(drought.prop("value")).toBe(1);
  });
});
