import React from "react";
import { render, screen } from "@testing-library/react";
import { FireIntensityScale } from "./fire-intensity-scale";

// jsdom applies no stylesheet, so geometry is asserted in Cypress rather than here.
describe("FireIntensityScale", () => {
  it("breaks the title across two lines without relying on wrapping", () => {
    render(<FireIntensityScale />);
    expect(screen.getByTestId("fire-intensity-scale-title").textContent).toBe("Fire Intensity\nScale");
  });

  it("renders the three burn index colors", () => {
    render(<FireIntensityScale />);
    const swatches = screen.getAllByTestId("fire-intensity-scale-swatch");

    expect(swatches).toHaveLength(3);
    expect(swatches[0].style.backgroundColor).toBe("rgb(255, 179, 0)");
    expect(swatches[1].style.backgroundColor).toBe("rgb(255, 128, 0)");
    expect(swatches[2].style.backgroundColor).toBe("rgb(255, 0, 0)");
  });
});
