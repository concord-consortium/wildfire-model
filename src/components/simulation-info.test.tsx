import React from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createStores } from "../models/stores";
import { Provider } from "mobx-react";
import { SimulationInfo } from "./simulation-info";

describe("Simulation Info component", () => {
  let stores = createStores();
  beforeEach(() => {
    stores = createStores();
  });

  it("renders zone info buttons", () => {
    render(
      <Provider stores={stores}>
        <SimulationInfo />
      </Provider>
    );
    expect(screen.getAllByTestId("zone-info")).toHaveLength(stores.simulation.zones.length);
  });

  it("opens terrain panel UI when one of the zone buttons is clicked", async () => {
    render(
      <Provider stores={stores}>
        <SimulationInfo />
      </Provider>
    );
    expect(stores.ui.showTerrainUI).toEqual(false);

    // Open terrain panel
    await userEvent.click(screen.getAllByTestId("zone-info")[0]);
    expect(stores.ui.showTerrainUI).toEqual(true);
    expect(stores.ui.terrainUISelectedZone).toEqual(0);

    // Change zone
    await userEvent.click(screen.getAllByTestId("zone-info")[1]);
    expect(stores.ui.showTerrainUI).toEqual(true);
    expect(stores.ui.terrainUISelectedZone).toEqual(1);

    // Change zone
    await userEvent.click(screen.getAllByTestId("zone-info")[2]);
    expect(stores.ui.showTerrainUI).toEqual(true);
    expect(stores.ui.terrainUISelectedZone).toEqual(2);
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

  it("locks zone buttons when simulation is started", () => {
    render(
      <Provider stores={stores}>
        <SimulationInfo />
      </Provider>
    );

    expect(screen.queryByTestId("lock-icon")).not.toBeInTheDocument();

    act(() => {
      stores.simulation.simulationStarted = true;
    });

    expect(screen.getAllByTestId("lock-icon").length).toEqual(stores.simulation.zones.length);
  });
});
