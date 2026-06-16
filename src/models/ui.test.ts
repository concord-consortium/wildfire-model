import { UIModel } from "./ui";

describe("UIModel Hazbot flags", () => {
  it("defaults both Hazbot flags to false", () => {
    const ui = new UIModel();
    expect(ui.showHazbotFeedback).toBe(false);
    expect(ui.hazbotPulseArmed).toBe(false);
  });

  it("flags are observable (direct assignment flips them)", () => {
    const ui = new UIModel();
    ui.hazbotPulseArmed = true;
    ui.showHazbotFeedback = true;
    expect(ui.hazbotPulseArmed).toBe(true);
    expect(ui.showHazbotFeedback).toBe(true);
  });
});
