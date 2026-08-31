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

describe("resetHazbotFeedback", () => {
  // Both branches are exercised through the button elsewhere. Asserted directly here
  // too, because the branch is a property of this model rather than of the component,
  // and the component tests would keep passing if the condition moved.
  it("closes an intro or a deferred open, and clears the levels", () => {
    const ui = new UIModel();
    ui.showHazbotFeedback = true;
    ui.hazbotFeedbackLevels.set(2, 3);
    ui.hazbotLastFeedbackShown = { level: 3, source: "round3" };

    ui.resetHazbotFeedback();

    expect(ui.showHazbotFeedback).toBe(false);
    expect(ui.hazbotFeedbackLevels.size).toBe(0);
    expect(ui.hazbotLastFeedbackShown).toBeUndefined();
  });

  // The Clear All tours instruct this very click as their first step, so tearing the
  // tour down here would leave their second step unreachable.
  it("leaves a driving tour open, while still clearing the levels", () => {
    const ui = new UIModel();
    ui.showHazbotFeedback = true;
    ui.hazbotTourActive = true;
    ui.hazbotFeedbackLevels.set(2, 3);

    ui.resetHazbotFeedback();

    expect(ui.showHazbotFeedback).toBe(true);
    expect(ui.hazbotFeedbackLevels.size).toBe(0);
  });
});
