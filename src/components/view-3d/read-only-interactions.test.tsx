import React from "react";
import { act, render, renderHook } from "@testing-library/react";
import { Provider } from "mobx-react";
import { Vector2 } from "three";
import { SimulationModel } from "../../models/simulation";
import { UIModel, Interaction } from "../../models/ui";
import { ChartStore } from "../../models/chart-store";
import { IStores } from "../../models/stores";
import { usePlaceSparkInteraction } from "./use-place-spark-interaction";
import { useDrawFireLineInteraction } from "./use-draw-fire-line-interaction";
import { useHelitackInteraction } from "./use-helitack-interaction";
import { SparksContainer } from "./spark";

jest.mock("../../log", () => ({ log: jest.fn() }));

const markerProps = jest.fn();
jest.mock("./marker", () => ({
  Marker: (props: unknown) => {
    markerProps(props);
    return null;
  }
}));

const createTestStores = (): IStores => ({
  simulation: new SimulationModel({
    modelWidth: 120000,
    modelHeight: 80000,
    gridWidth: 60,
    sparks: [[60000, 40000]],
    elevation: [[0]],
    unburntIslands: [[0]],
    riverData: null
  }),
  ui: new UIModel(),
  chartStore: new ChartStore()
});

const wrapper = (stores: IStores) => function Wrapper({ children }: { children?: React.ReactNode }) {
  return <Provider stores={stores}>{children}</Provider>;
};

describe("map interactions in read-only report mode", () => {
  it.each([
    ["spark placement", usePlaceSparkInteraction, Interaction.PlaceSpark],
    ["fire-line drawing", useDrawFireLineInteraction, Interaction.DrawFireLine],
    ["helitack drops", useHelitackInteraction, Interaction.Helitack]
  ])("turn %s off even when its tool is armed", (_, useInteraction, interaction) => {
    const stores = createTestStores();
    stores.ui.interaction = interaction;
    const { result, rerender } = renderHook(() => useInteraction(), { wrapper: wrapper(stores) });
    expect(result.current.active).toBe(true);

    stores.ui.readOnly = true;
    rerender();
    expect(result.current.active).toBe(false);
  });

  it("leaves sparks without a drag handler", () => {
    const stores = createTestStores();
    stores.simulation.sparks = [new Vector2(60000, 40000)];
    render(<Provider stores={stores}><SparksContainer dragPlane={{ current: null }} /></Provider>);
    expect(markerProps).toHaveBeenLastCalledWith(expect.objectContaining({ onDrag: expect.any(Function) }));

    act(() => {
      stores.ui.readOnly = true;
    });
    expect(markerProps).toHaveBeenLastCalledWith(expect.objectContaining({ onDrag: undefined }));
  });
});
