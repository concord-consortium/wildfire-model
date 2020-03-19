import * as React from "react";
import { mount, shallow } from "enzyme";
import { createStores } from "../models/stores";
import { Provider } from "mobx-react";
import { RightPanel } from "./right-panel";

describe("Right Panel component", () => {
  let stores = createStores();
  beforeEach(() => {
    stores = createStores();
  });

  it("renders basic components", () => {
    const wrapper = mount(
      <Provider stores={stores}>
        <RightPanel />
      </Provider>
    );
    expect(wrapper.find(RightPanel).length).toBe(1);
    expect(wrapper.find("ul").length).toBe(1);
    expect(wrapper.find("li").length).toBe(1);
    expect(wrapper.find('[data-test="right-panel"]').exists()).toEqual(true);
  });

  it("opens when a tab is clicked", () => {
    const wrapper = mount(
      <Provider stores={stores}>
        <RightPanel />
      </Provider>
    );
    // right panel hidden by default
    expect(stores.ui.showChart).toBe(false);
    wrapper.find("#base").simulate("click");
    expect(stores.ui.showChart).toBe(true);
  });

  it("closes when the tab is clicked", () => {
    const wrapper = mount(
      <Provider stores={stores}>
        <RightPanel />
      </Provider>
    );
    expect(stores.ui.showChart).toBe(false);
    wrapper.find("#base").simulate("click");
    expect(stores.ui.showChart).toBe(true);
    wrapper.find("#base").simulate("click");
    expect(stores.ui.showChart).toBe(false);
  });

});
