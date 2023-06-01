import * as React from "react";
import { render, screen } from "@testing-library/react";
import { createStores } from "../models/stores";
import { Provider } from "mobx-react";
import { RightPanelTab } from "./right-panel-tab";

describe("RightPanelTab component", () => {
  let stores = createStores();
  beforeEach(() => {
    stores = createStores();
  });

  it("renders basic components", () => {
    render(
      <Provider stores={stores}>
        <RightPanelTab tabType="graph" active={true} />
      </Provider>
    );
    expect(screen.getByTestId("right-panel-tab")).toBeInTheDocument();
  });
});
