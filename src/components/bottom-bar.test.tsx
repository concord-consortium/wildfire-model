import * as React from "react";
import { mount } from "enzyme";
import { createStores } from "../models/stores";
import { Provider } from "mobx-react";
import { BottomBar } from "./bottom-bar";
import Button from "@material-ui/core/Button";

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
    expect(wrapper.find(Button).length).toEqual(3);
  });

  it("start button is disabled until model is ready", () => {
    stores.simulation.ready = false;
    let wrapper = mount(
      <Provider stores={stores}>
        <BottomBar />
      </Provider>
    );
    let start = wrapper.find('[data-test="start-button"]').first();
    expect(start.prop("disabled")).toEqual(true);

    stores.simulation.ready = true;
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
});
