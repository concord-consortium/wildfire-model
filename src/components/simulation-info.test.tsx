import React from "react";
import { act, render, screen } from "@testing-library/react";
import { createStores } from "../models/stores";
import { Provider } from "mobx-react";
import { SimulationInfo } from "./simulation-info";

describe("Simulation Info component", () => {
  let stores = createStores();
  beforeEach(() => {
    stores = createStores();
  });

  it("renders a zone info label for every zone", () => {
    render(
      <Provider stores={stores}>
        <SimulationInfo />
      </Provider>
    );
    expect(screen.getAllByTestId("zone-info")).toHaveLength(stores.simulation.zones.length);
  });

  it("renders the wind reading in MPH, scaled up from the model's internal units", () => {
    render(
      <Provider stores={stores}>
        <SimulationInfo />
      </Provider>
    );
    expect(stores.simulation.config.windScaleFactor).toEqual(0.2);

    act(() => {
      stores.simulation.setWindSpeed(2);
      stores.simulation.setWindDirection(22.5);
    });
    expect(screen.getByTestId("wind-meter-label").textContent).toEqual("10 MPH from the NNE");

    act(() => {
      stores.simulation.setWindSpeed(1.1);
    });
    expect(screen.getByTestId("wind-meter-label").textContent).toEqual("6 MPH from the NNE");
  });
});
