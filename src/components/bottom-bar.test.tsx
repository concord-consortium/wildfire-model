import React from "react";
import { mount } from "enzyme";
import { createStores } from "../models/stores";
import { Provider } from "mobx-react";
import { BottomBar } from "./bottom-bar";
import Button from "@material-ui/core/Button";
import { Vector2 } from "three";

describe("BottomBar component", () => {
  let stores = createStores();
  beforeEach(() => {
    stores = createStores();
  });

  it("renders basic components", () => {
    const wrapper = mount(
      <Provider stores={stores}>
        <BottomBar />
      </Provider>
    );
    expect(wrapper.find(Button).length).toEqual(7);
  });

  it("start button is disabled until model is ready", () => {
    // simulation will not be ready until at least one spark is defined
    stores.simulation.sparks = [];
    stores.simulation.dataReady = false;
    expect(stores.simulation.ready).toEqual(false);
    let wrapper = mount(
      <Provider stores={stores}>
        <BottomBar />
      </Provider>
    );
    let start = wrapper.find('[data-test="start-button"]').first();
    expect(start.prop("disabled")).toEqual(true);

    stores.simulation.dataReady = true;
    // no sparks defined - this should still be false
    expect(stores.simulation.ready).toEqual(false);
    stores.simulation.sparks[0] = new Vector2(100, 100);
    expect(stores.simulation.ready).toEqual(true);

    wrapper = mount(
      <Provider stores={stores}>
        <BottomBar />
      </Provider>
    );
    start = wrapper.find('[data-test="start-button"]').first();
    expect(start.prop("disabled")).toEqual(false);
  });

  describe("restart button", () => {
    it("restarts simulation", () => {
      jest.spyOn(stores.simulation, "restart");
      const wrapper = mount(
        <Provider stores={stores}>
          <BottomBar />
        </Provider>
      );
      wrapper.find('[data-test="restart-button"]').first().simulate("click");
      expect(stores.simulation.restart).toHaveBeenCalled();
    });
  });

  describe("reload button", () => {
    it("resets simulation and resets view", () => {
      jest.spyOn(stores.simulation, "reload");
      const wrapper = mount(
        <Provider stores={stores}>
          <BottomBar />
        </Provider>
      );
      wrapper.find('[data-test="reload-button"]').first().simulate("click");
      expect(stores.simulation.reload).toHaveBeenCalled();
    });
  });

  describe("terrain button", () => {
    it("toggles the display of the terrain dialog", () => {
      const wrapper = mount(
        <Provider stores={stores}>
          <BottomBar />
        </Provider>
      );
      // default behavior hides the UI
      expect(stores.ui.showTerrainUI).toBe(false);
      wrapper.find('[data-test="terrain-button"]').first().simulate("click");
      expect(stores.ui.showTerrainUI).toBe(true);
      wrapper.find('[data-test="terrain-button"]').first().simulate("click");
      expect(stores.ui.showTerrainUI).toBe(false);
    });
  });

  describe("spark button", () => {
    // TODO: When zones are available, look up this number
    const sparksAvailable = 1; // stores.ui.zones?
    const wrapper = mount(
      <Provider stores={stores}>
        <BottomBar />
      </Provider>
    );
    it("enables the user to place a starting spark", () => {
      wrapper.find('[data-test="spark-button"]').first().simulate("click");
      // expect (stores.)
    });
  });

  describe("fireline button", () => {
    // TODO: how many of these can be added?
    const firelinesAvailable = 1;
    const wrapper = mount(
      <Provider stores={stores}>
        <BottomBar />
      </Provider>
    );
    it("enables the user to place a fireline", () => {
      wrapper.find('[data-test="fireline-button"]').first().simulate("click");
      // expect app to go into fireline mode, select start-end points
    });
  });

  describe("helitack button", () => {
    // TODO: how many of these do we have?
    const helitackAvailable = 1;
    const wrapper = mount(
      <Provider stores={stores}>
        <BottomBar />
      </Provider>
    );
    it("enables the user to select a zone for helitack", () => {
      wrapper.find('[data-test="helitack-button"]').first().simulate("click");
      // expect app to give you control over a helitack drop point
    });
  });

  describe("controls are disabled when running", () => {
    stores.simulation.simulationStarted = true;
    const wrapper = mount(
      <Provider stores={stores}>
        <BottomBar />
      </Provider>
    );
    const spark = wrapper.find('[data-test="spark-button"]').first();
    const terrainButton = wrapper.find('[data-test="terrain-button"]').first();

    it("is disabled while running", () => {
      expect(spark.prop("disabled")).toEqual(true);
      expect(terrainButton.prop("disabled")).toEqual(true);
    });
  });
});
