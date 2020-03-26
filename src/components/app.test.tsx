import React from "react";
import { mount } from "enzyme";
import { createStores } from "../models/stores";
import { Provider } from "mobx-react";
import { Vector2 } from "three";
import { AppComponent } from "./app";
import { CircularProgress } from "@material-ui/core";

jest.mock("./view-3d/view-3d");

describe("App component", () => {
  let stores = createStores();
  beforeEach(() => {
    stores = createStores();
  });

  it("shows progress icon when model recalculates cell properties", () => {
    // simulation will not be ready until at least one spark is defined
    stores.simulation.sparks = [];
    stores.simulation.dataReady = true;
    stores.simulation.sparks[0] = new Vector2(100, 100);
    expect(stores.simulation.ready).toEqual(true);
    expect(stores.simulation.recalculateCellProps).toEqual(true);
    let wrapper = mount(
      <Provider stores={stores}>
        <AppComponent />
      </Provider>
    );
    expect(wrapper.find(CircularProgress).length).toEqual(0);

    stores.simulation.start();

    wrapper = mount(
      <Provider stores={stores}>
        <AppComponent />
      </Provider>
    );
    expect(wrapper.find(CircularProgress).length).toEqual(1);
  });
});
