import React from "react";
import { renderHook } from "@testing-library/react";
import { Provider } from "mobx-react";
import { IStores } from "../../models/stores";
import { PLANE_WIDTH } from "./helpers";
import { useDrawFireLineInteraction } from "./use-draw-fire-line-interaction";

// Interaction handlers receive e.point in 3D view units on both axes; ftToViewUnit
// is PLANE_WIDTH / modelWidth, so modelHeight plays no part in the conversion.
export const terrainPointerEvent = (xFt: number, yFt: number, modelWidth: number) => ({
  point: { x: xFt * PLANE_WIDTH / modelWidth, y: yFt * PLANE_WIDTH / modelWidth }
} as any);

export const renderFireLineInteraction = (stores: IStores) =>
  renderHook(() => useDrawFireLineInteraction(), {
    wrapper: ({ children }: { children?: React.ReactNode }) =>
      <Provider stores={stores}>{children}</Provider>
  });
