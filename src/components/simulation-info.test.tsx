import React from "react";
import { mount, shallow } from "enzyme";
import { createStores } from "../models/stores";
import { Provider } from "mobx-react";
import { SimulationInfo, ZoneInfo } from "./simulation-info";

describe("Simulation Info component", () => {
  let stores = createStores();
  beforeEach(() => {
    stores = createStores();
  });

  it("mounts at start up", () => {
    const wrapper = mount(
      <Provider stores={stores}>
        <SimulationInfo />
      </Provider>
    );
    expect(wrapper.find(SimulationInfo).length).toBe(1);
  });

  it("renders zone info buttons", () => {
    const wrapper = mount(
      <Provider stores={stores}>
        <SimulationInfo />
      </Provider>
    );
    expect(wrapper.find(ZoneInfo).length).toBe(stores.simulation.zones.length);
  });

  it("opens terrain panel UI when one of the zone buttons is clicked", () => {
    const wrapper = mount(
      <Provider stores={stores}>
        <SimulationInfo />
      </Provider>
    );
    expect(stores.ui.showTerrainUI).toEqual(false);

    // Open terrain panel
    wrapper.find(ZoneInfo).at(0).simulate("click");
    expect(stores.ui.showTerrainUI).toEqual(true);
    expect(stores.ui.terrainUISelectedZone).toEqual(0);

    // Change zone
    wrapper.find(ZoneInfo).at(1).simulate("click");
    expect(stores.ui.showTerrainUI).toEqual(true);
    expect(stores.ui.terrainUISelectedZone).toEqual(1);

    // Change zone
    wrapper.find(ZoneInfo).at(2).simulate("click");
    expect(stores.ui.showTerrainUI).toEqual(true);
    expect(stores.ui.terrainUISelectedZone).toEqual(2);

    // Close terrain panel
    wrapper.find(ZoneInfo).at(2).simulate("click");
    expect(stores.ui.showTerrainUI).toEqual(false);
  });

  it("locks zone buttons when simulation is started", () => {
    const wrapper = mount(
      <Provider stores={stores}>
        <SimulationInfo />
      </Provider>
    );
    expect(wrapper.find(ZoneInfo).at(0).props().locked).toEqual(false);

    stores.simulation.simulationStarted = true;
    wrapper.update();

    expect(wrapper.find(ZoneInfo).at(0).props().locked).toEqual(true);
  });
});
