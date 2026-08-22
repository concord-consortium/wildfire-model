import { createStores } from "./stores";

describe("stores object", () => {

  it("supports creating dummy stores for testing", () => {
    const stores = createStores();
    expect(stores).toBeDefined();
  });

  // The helper is only useful if it reaches the SAME UIModel the returned stores hold.
  it("window.test.resetHazbotFeedbackLevels clears the returned stores' UI state", () => {
    const stores = createStores();
    stores.ui.hazbotFeedbackLevels.set(2, 3);
    stores.ui.hazbotLastFeedbackShown = { level: 3, source: "round3" };
    (window as any).test.resetHazbotFeedbackLevels();
    expect(stores.ui.hazbotFeedbackLevels.size).toBe(0);
    expect(stores.ui.hazbotLastFeedbackShown).toBeUndefined();
  });

});
