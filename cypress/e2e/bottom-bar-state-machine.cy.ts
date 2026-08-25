// cypress/e2e/bottom-bar-state-machine.cy.ts
//
// Browser-level regression guard for the bottom-bar lifecycle state machine.
// Covers each of the eight states by driving the real bottom-bar in a running
// app, asserting the HTML `disabled` attribute of all eight controls; states 1-7
// follow the Zeplin matrix, and state 8 (the Setup-open lockout) has no artboard.
// Catches full-page reactivity wiring breaks, @observer-decoration regressions, and
// build-tooling failures that the React-Testing-Library tests in bottom-bar.test.tsx
// can't.
//
// The one rendered style it does assert is the Hazbot button's disabled opacity,
// which cannot be checked in Jest: SCSS modules resolve through identity-obj-proxy
// there, so no real CSS is applied and a computed-opacity assertion would read ""
// and pass against any implementation. The icon-button disabled rules
// (src/components/icon-button.scss, `&:disabled, &.Mui-disabled`) are still verified
// only by manual browser inspection against the Zeplin spec. A future Zeplin-driven
// visual-regression pass would close that gap.
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
    tick(timeStep: number): void;
  };
  test: {
    placeSparkInZone(zoneIdx: number): void;
    placeFireLineInZone(zoneIdx: number): void;
    placeHelitackInZone(zoneIdx: number): void;
  };
}
const debugHooks = (win: Window) => win as unknown as AppDebugHooks;

// hazbotRules=23 is part of the shared URL rather than only the Hazbot describe's: the
// Hazbot button mounts under `{hazbotEngine?.ruleSet && ...}` (bottom-bar.tsx), so
// without a loaded rule-set the state matrix below would assert against an element that
// does not exist. The cost is that these cases now depend on rule-set 23 validating at
// load; the pulse describe at the bottom already carried that.
const APP_URL = "/?preset=plainsTwoZone&hazbotRules=23";

const expectButtonStates = (states: {
  setup: boolean; spark: boolean; reload: boolean; restart: boolean;
  startStop: boolean; fireLine: boolean; helitack: boolean; hazbot: boolean;
}) => {
  cy.get("[data-testid='terrain-button']").should(states.setup ? "not.be.disabled" : "be.disabled");
  cy.get("[data-testid='spark-button']").should(states.spark ? "not.be.disabled" : "be.disabled");
  cy.get("[data-testid='reload-button']").should(states.reload ? "not.be.disabled" : "be.disabled");
  cy.get("[data-testid='restart-button']").should(states.restart ? "not.be.disabled" : "be.disabled");
  cy.get("[data-testid='start-button']").should(states.startStop ? "not.be.disabled" : "be.disabled");
  cy.get("[data-testid='fireline-button']").should(states.fireLine ? "not.be.disabled" : "be.disabled");
  cy.get("[data-testid='helitack-button']").should(states.helitack ? "not.be.disabled" : "be.disabled");
  cy.get("[data-testid='hazbot-button']").should(states.hazbot ? "not.be.disabled" : "be.disabled");
};

// Burn the fire out without waiting for the run to play in real time. updateFire()
// spreads to the burning cells' neighbors once per call whatever the time step, so a
// large step advances one spread generation per tick; tick() then clears
// simulationRunning itself the moment the engine reports fireDidStop, which is the
// production edge the Hazbot button and the ready pulse both hang off.
const burnOutFire = () => {
  cy.window().then((win: Window) => {
    const { sim } = debugHooks(win);
    for (let i = 0; i < 2000 && !sim.engine?.fireDidStop; i++) {
      sim.tick(60);
    }
  });
  cy.window().its("sim.engine.fireDidStop").should("eq", true);
  cy.window().its("sim.simulationRunning").should("eq", false);
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
      fireLine: false, helitack: false, hazbot: true,
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
      fireLine: false, helitack: false, hazbot: true,
    });
  });

  it("state 3 (SparkPlaced): Start + Reload enabled", () => {
    cy.window().then((win: Window) => { debugHooks(win).test.placeSparkInZone(0); });
    expectButtonStates({
      setup: true, spark: true,
      reload: true, restart: false, startStop: true,
      fireLine: false, helitack: false, hazbot: true,
    });
  });

  it("state 4 (Running): Setup/Spark/Hazbot disabled; Restart/Start/Fireline/Helitack enabled", () => {
    cy.window().then((win: Window) => { debugHooks(win).test.placeSparkInZone(0); });
    cy.get("[data-testid='start-button']").click();
    cy.window().its("sim.simulationRunning").should("eq", true);
    expectButtonStates({
      setup: false, spark: false,
      reload: true, restart: true, startStop: true,
      fireLine: true, helitack: true, hazbot: false,
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
      fireLine: false, helitack: false, hazbot: true,
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
      fireLine: false, helitack: false, hazbot: true,
    });
  });

  it("Fireline armed: the Fireline button stays enabled so it can cancel", () => {
    cy.window().then((win: Window) => { debugHooks(win).test.placeSparkInZone(0); });
    cy.get("[data-testid='start-button']").click();
    cy.window().its("sim.simulationRunning").should("eq", true);
    cy.get("[data-testid='fireline-button']").click();
    // Arming pauses the model and leaves the tool live as its own cancel toggle;
    // every other tool disables its button while armed. Hazbot stays disabled: the
    // pause is mid-intervention and the run is still in progress (WM-31).
    cy.window().its("sim.simulationRunning").should("eq", false);
    expectButtonStates({
      setup: false, spark: false,
      reload: true, restart: true, startStop: true,
      fireLine: true, helitack: true, hazbot: false,
    });
    // Clicking it again disarms, and the button stays available.
    cy.get("[data-testid='fireline-button']").click();
    cy.get("[data-testid='fireline-button']").should("not.be.disabled");
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
      fireLine: false, helitack: false, hazbot: true,
    });
  });

  // State 8: SetupOpen — the wizard locks the model controls, so Cancel and
  // Next/Create are the only ways out. Setup stays enabled and its click is inert.
  it("state 8 (SetupOpen): Setup and Hazbot stay enabled; Spark/Reload/Start locked out", () => {
    cy.window().then((win: Window) => { debugHooks(win).test.placeSparkInZone(0); });
    // Assert the pre-state first: from SparkPlaced all three are live, which is
    // what makes the post-open assertion below able to fail.
    expectButtonStates({
      setup: true, spark: true,
      reload: true, restart: false, startStop: true,
      fireLine: false, helitack: false, hazbot: true,
    });
    cy.get("[data-testid='terrain-button']").click();
    cy.get("[data-testid='terrain-header']").should("be.visible");
    expectButtonStates({
      setup: true, spark: false,
      reload: false, restart: false, startStop: false,
      fireLine: false, helitack: false, hazbot: true,
    });
  });
});

// WM-6 Hazbot Analysis button. The one assertion jsdom can't truly exercise:
// the @observer button re-rendering the ready/pulse state across a live
// Start → burnout run, then clearing it on click. All other arm/clear/gating/blink
// logic is covered by the fast Jest tests in src/components/hazbot-button.test.tsx
// and bottom-bar.test.tsx; this proves the full-page reactivity wiring.
describe("Hazbot button pulse (WM-6)", () => {

  beforeEach(() => {
    cy.visit(APP_URL);
    cy.window().its("sim.dataReady").should("eq", true);
  });

  it("renders with a loaded rule-set, pulses once the fire is out, and clears on click", () => {
    // Button is present on a Hazbot-enabled page with a loaded rule-set. The
    // ready/pulse state is the `ready` class on the wrapper (it gates the
    // box-shadow pulse animation on the button).
    cy.get("[data-testid='hazbot-button']").should("be.visible");
    // Pre-run: no pulse. The `ready` class is hashed by CSS modules in the built
    // app (e.g. `...--ready--...`), so match the class attribute rather than an
    // exact class token.
    cy.get("[data-testid='hazbot-button-wrap']").invoke("attr", "class").should("not.match", /ready/);
    // Place a spark, Start, then let the fire burn out → the pulse arms (ready state).
    cy.window().then((win: Window) => { debugHooks(win).test.placeSparkInZone(0); });
    cy.get("[data-testid='start-button']").click();
    cy.window().its("sim.simulationRunning").should("eq", true);
    // A manual Pause leaves the run in progress, so it arms nothing (WM-31).
    cy.get("[data-testid='start-button']").click();   // Pause
    cy.window().its("sim.simulationRunning").should("eq", false);
    cy.get("[data-testid='hazbot-button-wrap']").invoke("attr", "class").should("not.match", /ready/);
    cy.get("[data-testid='start-button']").click();   // resume
    burnOutFire();
    cy.get("[data-testid='hazbot-button-wrap']").invoke("attr", "class").should("match", /ready/);
    // Clicking the Hazbot button clears the pulse.
    cy.get("[data-testid='hazbot-button']").click();
    cy.get("[data-testid='hazbot-button-wrap']").invoke("attr", "class").should("not.match", /ready/);
  });

  // The disabled attribute is asserted in the state matrix above too; what only a
  // browser can check is the rendered 35%. MUI fades a disabled button to 0.25 on its
  // own, so an implementation that ships the `disabled` prop without the opacity
  // override passes every Jest case and still renders the wrong button.
  it("fades to the Zeplin 35% (not MUI's 0.25) for the duration of a run", () => {
    cy.get("[data-testid='hazbot-button']").should("have.css", "opacity", "1");
    cy.window().then((win: Window) => { debugHooks(win).test.placeSparkInZone(0); });
    cy.get("[data-testid='start-button']").click();
    cy.window().its("sim.simulationRunning").should("eq", true);
    cy.get("[data-testid='hazbot-button']")
      .should("be.disabled")
      .and("have.css", "opacity", "0.35");
    // The robot stays (that is what separates this state from the tour's fade), and the
    // Button back keeps its fill and border. border-top-width is 1px, not the declared
    // 1.5px: Chrome floors a sub-pixel border at devicePixelRatio 1, which is what
    // Cypress runs at.
    cy.get("[data-testid='hazbot-back']").should("be.visible");
    cy.get("[data-testid='hazbot-button']")
      .should("have.css", "background-color", "rgb(193, 218, 255)")
      .and("have.css", "border-top-width", "1px");
    // Pausing does not bring it back: a paused run is still a run (WM-31).
    cy.get("[data-testid='start-button']").click();
    cy.window().its("sim.simulationRunning").should("eq", false);
    cy.get("[data-testid='hazbot-button']")
      .should("be.disabled")
      .and("have.css", "opacity", "0.35");
    // The fire going out is what brings it back.
    cy.get("[data-testid='start-button']").click();   // resume
    burnOutFire();
    cy.get("[data-testid='hazbot-button']")
      .should("not.be.disabled")
      .and("have.css", "opacity", "1");
  });
});
