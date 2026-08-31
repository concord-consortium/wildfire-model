import React from "react";
import { act, render, screen } from "@testing-library/react";
import { createStores } from "../models/stores";
import { Provider } from "mobx-react";
import { SimulationInfo } from "./simulation-info";
import { droughtLabels, Vegetation, vegetationAbbreviatedLabels } from "../types";

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

  it("names the vegetation and drought level on every zone label", () => {
    render(
      <Provider stores={stores}>
        <SimulationInfo />
      </Provider>
    );
    const zones = stores.simulation.zones;
    expect(zones.length).toBeGreaterThan(1);
    const vegetationNames = screen.getAllByTestId("zone-vegetation-name");
    const droughtNames = screen.getAllByTestId("zone-drought-name");
    expect(vegetationNames).toHaveLength(zones.length);
    expect(droughtNames).toHaveLength(zones.length);
    zones.forEach((zone, idx) => {
      expect(vegetationNames[idx].textContent).toEqual(vegetationAbbreviatedLabels[zone.vegetation]);
      expect(droughtNames[idx].textContent).toEqual(droughtLabels[zone.droughtLevel]);
    });
  });

  it("abbreviates Forest with Suppression on the map label", () => {
    stores.simulation.zones[0].vegetation = Vegetation.ForestWithSuppression;
    render(
      <Provider stores={stores}>
        <SimulationInfo />
      </Provider>
    );
    // getByText rather than an exact textContent comparison: the abbreviation's
    // non-breaking space is collapsed by testing-library's normalizer but not by
    // string equality.
    expect(screen.getByText("Forest w Suppr.")).toBeInTheDocument();
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
