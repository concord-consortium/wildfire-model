// cypress/e2e/bottom-bar-state-machine.cy.ts
//
// Browser-level regression guard for the WM-24 bottom-bar lifecycle state
// machine. Covers each of the seven states by driving the real bottom-bar in
// a running app, asserting the HTML `disabled` attribute per the Zeplin
// matrix. Catches full-page reactivity wiring breaks, @observer-decoration
// regressions, and build-tooling failures that the React-Testing-Library
// tests in bottom-bar.test.tsx can't.
//
// Does NOT cover visual styling regressions (opacity, grayscale). Those rules
// live in src/components/icon-button.scss (`&:disabled, &.Mui-disabled`) and
// are currently verified by manual browser inspection against the Zeplin spec
// — there is no automated assertion of the rendered styles. A future
// Zeplin-driven visual-regression pass would close that gap.
//
// Uses inline `cy.get("[data-testid='...']")` selectors rather than the
// BottomBar helper class so each `it` block reads top-to-bottom without
// cross-referencing the helper file. If a future ticket consolidates
// Cypress tests on the helper-class style (matching smoke.cy.ts), swap the
// inline selectors for `bottomBar.getReloadButton()` etc.

// Type for the `window.sim` and `window.test.*` debug hooks exposed by
// src/models/stores.ts (see CLAUDE.md "Playwright MCP testing" section).
// Cypress's AUTWindow / lib.dom Window already declares a `test` property
// (from Mocha's MochaGlobals), so we cannot augment Window — accessing the
// hooks via a cast to TestWindow keeps the call sites type-safe while
// sidestepping the augmentation conflict.
//
// Kept local rather than importing the real SimulationModel type because
// simulation.ts uses MobX @observable / @action decorators and
// cypress/tsconfig.json does not enable `experimentalDecorators`; importing
// would fail with TS1219.
//
// Only the fields this spec reads are declared. If a future Cypress spec
// needs richer SimulationModel access, enable `experimentalDecorators` in
// cypress/tsconfig.json and switch to the real type — do not grow this
// interface organically.
interface AppDebugHooks {
  sim: {
    simulationRunning: boolean;
    simulationStarted: boolean;
    setupChanged: boolean;
    dataReady: boolean;
    engine?: { fireDidStop: boolean };
  };
  test: {
    placeSparkInZone(zoneIdx: number): void;
    placeFireLineInZone(zoneIdx: number): void;
    placeHelitackInZone(zoneIdx: number): void;
  };
}
const debugHooks = (win: Window) => win as unknown as AppDebugHooks;

const APP_URL = "/?preset=plainsTwoZone";

const expectButtonStates = (states: {
  setup: boolean; spark: boolean; reload: boolean; restart: boolean;
  startStop: boolean; fireLine: boolean; helitack: boolean;
}) => {
  cy.get("[data-testid='terrain-button']").should(states.setup ? "not.be.disabled" : "be.disabled");
  cy.get("[data-testid='spark-button']").should(states.spark ? "not.be.disabled" : "be.disabled");
  cy.get("[data-testid='reload-button']").should(states.reload ? "not.be.disabled" : "be.disabled");
  cy.get("[data-testid='restart-button']").should(states.restart ? "not.be.disabled" : "be.disabled");
  cy.get("[data-testid='start-button']").should(states.startStop ? "not.be.disabled" : "be.disabled");
  cy.get("[data-testid='fireline-button']").should(states.fireLine ? "not.be.disabled" : "be.disabled");
  cy.get("[data-testid='helitack-button']").should(states.helitack ? "not.be.disabled" : "be.disabled");
};

// MUI Slider's hidden range input is covered by the thumb span, so cy.click /
// cy.trigger fail actionability. And `.invoke("val", ...)` writes the value via
// jQuery, which React's input-tracker treats as a same-value no-op so onChange
// never fires. The standard recipe: call the native HTMLInputElement value
// setter (which React's tracker respects), then dispatch a real "input" event.
// React maps native "input" to its synthetic onChange for range inputs.
const setDroughtSlider = (value: number) => {
  cy.get("[data-testid='drought-slider'] input").then(($input) => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, "value"
    )!.set!;
    setter.call($input[0], String(value));
    $input[0].dispatchEvent(new Event("input", { bubbles: true }));
  });
};

describe("Bottom-bar state machine (WM-24)", () => {
  beforeEach(() => {
    cy.visit(APP_URL);
    // Wait for dataReady before asserting button states — the engine doesn't
    // mount until cells are loaded.
    cy.window().its("sim.dataReady").should("eq", true);
  });

  it("state 1 (Default): Setup + Spark enabled; rest disabled", () => {
    expectButtonStates({
      setup: true, spark: true,
      reload: false, restart: false, startStop: false,
      fireLine: false, helitack: false,
    });
  });

  it("state 2 (SetupChanged): Reload enabled; otherwise Default", () => {
    // Open Setup, change drought on zone 0, click Create.
    cy.get("[data-testid='terrain-button']").click();
    cy.get("[data-testid='terrain-header']").should("be.visible");
    // Wizard starts at panel 1 (zone-edit) for plainsTwoZone.
    setDroughtSlider(3);
    // Walk to wind panel, click Create.
    cy.contains("button", /next/i).click();
    cy.contains("button", /create/i).click();
    expectButtonStates({
      setup: true, spark: true,
      reload: true, restart: false, startStop: false,
      fireLine: false, helitack: false,
    });
  });

  it("state 3 (SparkPlaced): Start + Reload enabled", () => {
    cy.window().then((win: Window) => { debugHooks(win).test.placeSparkInZone(0); });
    expectButtonStates({
      setup: true, spark: true,
      reload: true, restart: false, startStop: true,
      fireLine: false, helitack: false,
    });
  });

  it("state 4 (Running): Setup/Spark disabled; Restart/Start/Fireline/Helitack enabled", () => {
    cy.window().then((win: Window) => { debugHooks(win).test.placeSparkInZone(0); });
    cy.get("[data-testid='start-button']").click();
    cy.window().its("sim.simulationRunning").should("eq", true);
    expectButtonStates({
      setup: false, spark: false,
      reload: true, restart: true, startStop: true,
      fireLine: true, helitack: true,
    });
  });

  it("state 5 (Ended): Start/Fireline/Helitack disabled; Restart/Reload enabled", () => {
    cy.window().then((win: Window) => { debugHooks(win).test.placeSparkInZone(0); });
    cy.get("[data-testid='start-button']").click();
    cy.window().then((win: Window) => {
      // Order matters: set fireDidStop (non-observable) BEFORE flipping
      // simulationRunning (observable). The simulationEnded computed only
      // re-evaluates on the simulationRunning edge — if we flipped it first,
      // the computed would lock in false because fireDidStop was still
      // false at re-eval time.
      const sim = debugHooks(win).sim;
      if (sim.engine) sim.engine.fireDidStop = true;
      sim.simulationRunning = false;
    });
    expectButtonStates({
      setup: false, spark: false,
      reload: true, restart: true, startStop: false,
      fireLine: false, helitack: false,
    });
  });

  it("state 6 (Restarted): Setup/Spark/Start/Reload enabled; Restart disabled; Fireline/Helitack disabled", () => {
    cy.window().then((win: Window) => { debugHooks(win).test.placeSparkInZone(0); });
    cy.get("[data-testid='start-button']").click();
    cy.get("[data-testid='restart-button']").click();
    cy.window().its("sim.simulationStarted").should("eq", false);
    expectButtonStates({
      setup: true, spark: true,
      reload: true, restart: false, startStop: true,
      fireLine: false, helitack: false,
    });
  });

  it("state 7 (AfterReload from SetupChanged): identical to Default for plainsTwoZone", () => {
    // Reach SetupChanged
    cy.get("[data-testid='terrain-button']").click();
    setDroughtSlider(3);
    cy.contains("button", /next/i).click();
    cy.contains("button", /create/i).click();
    // Now Reload
    cy.get("[data-testid='reload-button']").click();
    cy.window().its("sim.dataReady").should("eq", true);
    // setupChanged must be reset by reload() — without this assertion, a bug
    // that skipped `this.setupChanged = false` in reload() could still pass
    // the button-state matrix below for the curriculum preset
    // (sparks.length=0 hides the setupChanged contribution to reloadEnabled).
    cy.window().its("sim.setupChanged").should("eq", false);
    expectButtonStates({
      setup: true, spark: true,
      reload: false, restart: false, startStop: false,
      fireLine: false, helitack: false,
    });
  });
});
