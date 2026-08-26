// cypress/e2e/bottom-bar-visuals.cy.ts
//
// Visual-regression guard for the WM-23 bottom-bar layout. Locks in the
// deterministic geometry: per-widget border widths, inter-widget gaps
// (3 px default; -1 px at the three abutting bubble seams: Spark <->
// Restart, Restart <-> Start, and Fireline <-> Helitack), default-state
// highlight opacity and the Setup button's selected-state highlight, the
// "Fireline" label, and the fullscreen container's 62 x 62 dimensions
// with computed background-size / repeat / position.
//
// Hover/active opacity (0.5 / 1.0) lives in the Playwright walkthrough rather
// than here: Cypress's cy.trigger doesn't reliably activate :hover / :active
// pseudo-classes for getComputedStyle reads.

const APP_URL = "/?preset=plainsTwoZone";

// window.test hooks from src/models/stores.ts. Cast rather than augmented because
// Cypress's Window already declares `test` (Mocha's globals).
const placeSparkInZone = (win: Window, zoneIdx: number) =>
  (win as unknown as { test: { placeSparkInZone(z: number): void } }).test.placeSparkInZone(zoneIdx);

// Pivots from a data-testid'd inner element up to its enclosing widgetGroup
// (the outer container carrying the 1 px border). The
// [class*="widgetGroup"] substring-match survives CSS modules hashing.
const widgetRect = (testid: string) =>
  cy.get(`[data-testid="${testid}"]`).then(($btn) =>
    $btn.closest('[class*="widgetGroup"]')[0].getBoundingClientRect()
  );

describe("Bottom-bar visual regression (WM-23)", () => {
  beforeEach(() => {
    cy.visit(APP_URL);
    cy.window().its("sim.dataReady").should("eq", true);
  });

  it("renders each per-button widget at its spec Border w. value", () => {
    // Border w. = content + 2px border (1px each side). Values from the
    // requirements.md Layout table. Fireline and Helitack each live in
    // their own widgetGroup (designer wanted two abutting bubbles
    // rather than one shared bubble) so each shrink-wraps to 67
    // (65 content + 2 border). Clear All is the one pill wider than
    // `.playbackButton`'s 60px lock, at 66 content + 2 border.
    widgetRect("clear-all-button").should((r) => expect(r.width).to.eq(68));
    widgetRect("terrain-button").should((r) => expect(r.width).to.eq(84));
    widgetRect("spark-button").should((r) => expect(r.width).to.eq(62));
    widgetRect("restart-button").should((r) => expect(r.width).to.eq(62));
    widgetRect("start-button").should((r) => expect(r.width).to.eq(62));
    widgetRect("fireline-button").should((r) => expect(r.width).to.eq(67));
    widgetRect("helitack-button").should((r) => expect(r.width).to.eq(67));
  });

  it("shrink-wraps the controls cluster to its seven widget groups", () => {
    // .mainContainer sizes to its contents, so this is the sum of the seven
    // widget widths, their gaps, and the trailing widgetGroup margin
    cy.get('[class*="mainContainer"]').should(($m) => {
      expect($m[0].getBoundingClientRect().width).to.eq(481);
    });
  });

  it("renders the correct visible gap at every widget adjacency", () => {
    // Read each widget's closest-widgetGroup rect into a buffer, then
    // assert the next.left - prev.right delta for every widget-to-widget
    // adjacency. Every control now has its own widgetGroup, so the rects[]
    // order matches the ids[] order below.
    //
    // Two gap values are expected:
    //   3 px (default): 4 px widgetGroup margin-right minus the next
    //     widget's 1 px margin-left.
    //   -1 px (abutting): the Spark, Restart and Fireline widgetGroups
    //     carry margin-right:0 so the next widget's -1 px margin-left
    //     pulls the bubbles into a 1 px border overlap. This produces the
    //     "two bubbles touching at the side" look the designer wants for
    //     Spark <-> Restart, Restart <-> Start, and Fireline <-> Helitack.
    const rects: { left: number; right: number }[] = [];
    const ids = [
      "clear-all-button", "terrain-button", "spark-button", "restart-button",
      "start-button", "fireline-button", "helitack-button"
    ];
    ids.forEach((id) =>
      widgetRect(id).then((r) => { rects.push({ left: r.left, right: r.right }); })
    );
    cy.then(() => {
      expect(rects[1].left - rects[0].right, "Clear All -> Setup").to.eq(3);
      expect(rects[2].left - rects[1].right, "Setup -> Spark").to.eq(3);
      expect(rects[3].left - rects[2].right, "Spark -> Restart (abuts)").to.eq(-1);
      expect(rects[4].left - rects[3].right, "Restart -> Start (abuts)").to.eq(-1);
      expect(rects[5].left - rects[4].right, "Start -> Fireline").to.eq(3);
      expect(rects[6].left - rects[5].right, "Fireline -> Helitack (abuts)").to.eq(-1);
    });
  });

  it("renders default-state highlight opacity = 0 on icon-on-top buttons", () => {
    ["terrain-button", "spark-button", "fireline-button", "helitack-button"].forEach((id) => {
      cy.get(`[data-testid="${id}"] [class*="iconButtonHighlightSvg"]`)
        .should("have.css", "opacity", "0");
    });
  });

  it("renders highlight opacity = 1 on the Fireline button while its tool is armed", () => {
    cy.window().then((win: Window) => { placeSparkInZone(win, 0); });
    cy.get("[data-testid='start-button']").click();
    cy.get("[data-testid='fireline-button']").click();
    cy.get('[data-testid="fireline-button"] [class*="iconButtonHighlightSvg"]')
      .should("have.css", "opacity", "1");
  });

  // selected and disabled cannot be combined on IconButton: both class names
  // land on one element and icon-button.scss nests .selected inside
  // :not(.disabled), so a disabled Setup button renders greyed with the
  // highlight suppressed. jsdom computes no CSS, so this is the only place that
  // failure is observable.
  it("renders highlight opacity = 1 on the Setup button while the wizard is open", () => {
    cy.get("[data-testid='terrain-button']").click();
    cy.get("[data-testid='terrain-header']").should("be.visible");
    cy.get('[data-testid="terrain-button"] [class*="iconButtonHighlightSvg"]')
      .should("have.css", "opacity", "1");
    cy.get('[data-testid="terrain-button"]').should("have.css", "filter", "none");
  });

  it("renders the Fireline button with label 'Fireline'", () => {
    cy.get('[data-testid="fireline-button"]').should("contain.text", "Fireline");
  });

  it("renders the fullscreen container at 62 x 62 with 42 x 42 centered background", () => {
    cy.get('[title="Toggle Fullscreen"]').then(($el) => {
      const rect = $el[0].getBoundingClientRect();
      const cs = getComputedStyle($el[0]);
      expect(rect.width, "container width").to.eq(62);
      // 62 (was 64) so the square container can sit flush with the bar's
      // bottom edge while keeping the 42 px icon at 10 px visual padding
      // from both the right and bottom edges of the bar (per designer).
      expect(rect.height, "container height").to.eq(62);
      expect(cs.backgroundSize, "background-size").to.eq("42px 42px");
      expect(cs.backgroundRepeat, "background-repeat").to.eq("no-repeat");
      expect(cs.backgroundPosition, "background-position").to.eq("50% 50%");
    });
  });
});
