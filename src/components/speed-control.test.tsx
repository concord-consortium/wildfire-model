import React from "react";
import { render, screen } from "@testing-library/react";
import { Provider } from "mobx-react";
import { createStores } from "../models/stores";
import { SpeedControl } from "./speed-control";

const ACTIVE = "MuiSlider-markLabelActive";

describe("SpeedControl", () => {
  let stores: ReturnType<typeof createStores>;

  beforeEach(() => {
    stores = createStores();
  });

  // Guards `track={false}`. MUI treats a mark as active by "is this the selected
  // value" only in the trackless mode; with a track it marks every value at or
  // below the selection, which would bold 0.5x and 1x here too.
  //
  // Asserted at the fastest tick deliberately. At the slowest tick the two modes
  // render identically ([active, inactive, inactive] either way), so an assertion
  // there cannot catch the prop's removal.
  it("bolds only the selected label", () => {
    stores.simulation.setSpeedIndex(2);
    render(
      <Provider stores={stores}>
        <SpeedControl disabled={false} />
      </Provider>
    );
    expect(screen.getByText("2x")).toHaveClass(ACTIVE);
    expect(screen.getByText("1x")).not.toHaveClass(ACTIVE);
    expect(screen.getByText("0.5x")).not.toHaveClass(ACTIVE);
  });
});
