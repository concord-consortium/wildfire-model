import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "mobx-react";
import { createStores } from "../models/stores";
import { VegetationKeySwitch } from "./vegetation-key-switch";

const mockLog = jest.fn();
jest.mock("../log", () => ({
  log: (...args: unknown[]) => mockLog(...args)
}));

// SimulationModel resolves its config through getResolvedConfig, which calls
// getUrlConfig internally, so overriding the resolved config is what stands in for
// a URL parameter here.
const configOverride = jest.fn<Record<string, unknown>, []>(() => ({}));
jest.mock("../config", () => {
  const actual = jest.requireActual("../config");
  return {
    ...actual,
    getResolvedConfig: (preset?: unknown) => ({ ...actual.getResolvedConfig(preset), ...configOverride() })
  };
});

describe("VegetationKeySwitch", () => {
  let stores: ReturnType<typeof createStores>;

  beforeEach(() => {
    configOverride.mockReturnValue({});
    stores = createStores();
    mockLog.mockClear();
  });

  const renderSwitch = () => render(
    <Provider stores={stores}>
      <VegetationKeySwitch />
    </Provider>
  );

  it("starts off by default", () => {
    expect(stores.simulation.config.showVegetationKey).toBe(false);
    expect(stores.ui.showVegetationKey).toBe(false);
  });

  it("opens on when config.showVegetationKey is set, so ?showVegetationKey=true works", () => {
    configOverride.mockReturnValue({ showVegetationKey: true });
    const seeded = createStores();
    expect(seeded.simulation.config.showVegetationKey).toBe(true);
    expect(seeded.ui.showVegetationKey).toBe(true);
  });

  it("toggles ui.showVegetationKey and logs the paired view events", async () => {
    renderSwitch();
    const control = screen.getByTestId("vegetation-key-switch");

    await userEvent.click(control);
    expect(stores.ui.showVegetationKey).toBe(true);
    expect(mockLog).toHaveBeenLastCalledWith("VegetationKeyShown");

    await userEvent.click(control);
    expect(stores.ui.showVegetationKey).toBe(false);
    expect(mockLog).toHaveBeenLastCalledWith("VegetationKeyHidden");

    expect(mockLog).toHaveBeenCalledTimes(2);
  });

  it("leaves simulation.config untouched, since config is not observable state", async () => {
    renderSwitch();
    await userEvent.click(screen.getByTestId("vegetation-key-switch"));
    expect(stores.ui.showVegetationKey).toBe(true);
    expect(stores.simulation.config.showVegetationKey).toBe(false);
  });
});
