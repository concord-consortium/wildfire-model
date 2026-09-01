import React from "react";
import { render, screen } from "@testing-library/react";
import { Provider } from "mobx-react";
import { createStores } from "../models/stores";
import { SPEEDS } from "../models/simulation";
import { SpeedControl } from "./speed-control";

const ACTIVE = "MuiSlider-markLabelActive";

describe("SpeedControl", () => {
  let stores: ReturnType<typeof createStores>;

  beforeEach(() => {
    stores = createStores();
  });

  // Guards `track={false}`. MUI treats a mark as active by "is this the selected
  // value" only in the trackless mode; with a track it marks every value at or
  // below the selection, which would bold the slower ticks here too.
  //
  // Asserted at the fastest tick deliberately. At the slowest tick the two modes
  // render identically ([active, inactive, inactive] either way), so an assertion
  // there cannot catch the prop's removal.
  it("bolds only the selected label", () => {
    const fastest = SPEEDS.length - 1;
    stores.simulation.setSpeedIndex(fastest);
    render(
      <Provider stores={stores}>
        <SpeedControl disabled={false} />
      </Provider>
    );
    // Asserted as an exact list rather than tick by tick: under a visible track
    // every tick at or below the selection is active, so the failure this guards
    // shows up as extra entries here. The length guard keeps that meaningful, since
    // a single-tick array would satisfy the list trivially.
    expect(fastest).toBeGreaterThan(0);
    const bolded = SPEEDS
      .filter(speed => screen.getByText(speed.label).classList.contains(ACTIVE))
      .map(speed => speed.label);
    expect(bolded).toEqual([SPEEDS[fastest].label]);
  });
});
