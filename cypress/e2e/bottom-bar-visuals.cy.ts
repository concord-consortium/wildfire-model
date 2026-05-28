// cypress/e2e/bottom-bar-visuals.cy.ts
//
// Visual-regression guard for the WM-23 bottom-bar layout. Locks in the
// deterministic geometry: per-widget border widths, the Reload+Restart
// shared widgetGroup width, inter-widget gaps (8 px default; -1 px at the
// three abutting bubble seams: Spark <-> Reload pair, Restart <-> Start,
// and Fireline <-> Helitack), default-state highlight opacity, the
// "Fireline" label, and the fullscreen container's 62 x 62 dimensions
// with computed background-size / repeat / position.
//
// Hover/active opacity (0.5 / 1.0) and FIS-hidden centering live in the
// Playwright walkthrough rather than here. Cypress's cy.trigger doesn't
// reliably activate :hover / :active pseudo-classes for getComputedStyle
// reads, and the centering check is part of the manual Playwright
// walkthrough that produces the PR-attached screenshots.

const APP_URL = "/?preset=plainsTwoZone";

// Pivots from a data-testid'd inner element up to its enclosing widgetGroup
// (the per-pair outer container with the 1 px border). The
// [class*="widgetGroup"] substring-match survives CSS modules hashing.
const widgetRect = (testid: string) =>
  cy.get(`[data-testid="${testid}"]`).then(($btn) =>
    $btn.closest('[class*="widgetGroup"]')[0].getBoundingClientRect()
  );

// For within-pair gap assertions: read the inner button rects directly.
// The shared-container structure under WM-23 means both pair-mates climb
// to the same widgetGroup ancestor, so the closest-widgetGroup pivot
// degenerates for these adjacencies.
const innerRect = (testid: string) =>
  cy.get(`[data-testid="${testid}"]`).then(($btn) =>
    $btn[0].getBoundingClientRect()
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
    // (65 content + 2 border).
    widgetRect("terrain-button").should((r) => expect(r.width).to.eq(84));
    widgetRect("spark-button").should((r) => expect(r.width).to.eq(62));
    widgetRect("start-button").should((r) => expect(r.width).to.eq(62));
    widgetRect("fireline-button").should((r) => expect(r.width).to.eq(67));
    widgetRect("helitack-button").should((r) => expect(r.width).to.eq(67));
    widgetRect("fire-intensity-scale").should((r) => expect(r.width).to.eq(142));
  });

  it("renders the Reload+Restart paired group at its shared Border w. value", () => {
    // Reload and Restart still share one widgetGroup (only Fireline +
    // Helitack got split), so both inner buttons climb to the same
    // widgetGroup ancestor. Reading the shared widgetGroup's outer
    // rect gives the spec's "Border w." value (120 content + 2 border).
    widgetRect("reload-button").should((r) => expect(r.width).to.eq(122));
  });

  it("renders the correct visible gap at every widget adjacency", () => {
    // Read each widget's closest-widgetGroup rect into a buffer, then
    // assert the next.left - prev.right delta for every widget-to-widget
    // adjacency. reload-button climbs to the Reload+Restart shared
    // widgetGroup; Fireline and Helitack each have their own
    // widgetGroup. So the rects[] order is:
    //   0: Setup, 1: Spark, 2: Reload+Restart pair, 3: Start,
    //   4: Fireline, 5: Helitack, 6: FIS.
    //
    // Two gap values are expected:
    //   8 px (default): 9 px widgetGroup margin-right minus the next
    //     widget's 1 px margin-left.
    //   -1 px (abutting): the Spark, Reload+Restart, and Fireline
    //     widgetGroups carry margin-right:0 so the next widget's -1 px
    //     margin-left pulls the bubbles into a 1 px border overlap.
    //     This produces the "two bubbles touching at the side" look
    //     the designer wants for Spark <-> Reload pair, Restart <->
    //     Start, and Fireline <-> Helitack.
    const rects: { left: number; right: number }[] = [];
    const ids = [
      "terrain-button", "spark-button", "reload-button",
      "start-button", "fireline-button", "helitack-button",
      "fire-intensity-scale"
    ];
    ids.forEach((id) =>
      widgetRect(id).then((r) => { rects.push({ left: r.left, right: r.right }); })
    );
    cy.then(() => {
      expect(rects[1].left - rects[0].right, "Setup -> Spark").to.eq(8);
      expect(rects[2].left - rects[1].right, "Spark -> Reload pair (abuts)").to.eq(-1);
      expect(rects[3].left - rects[2].right, "Restart -> Start (abuts)").to.eq(-1);
      expect(rects[4].left - rects[3].right, "Start -> Fireline").to.eq(8);
      expect(rects[5].left - rects[4].right, "Fireline -> Helitack (abuts)").to.eq(-1);
      expect(rects[6].left - rects[5].right, "Helitack -> FIS").to.eq(8);
    });
  });

  it("renders 0 px gap within the Reload+Restart paired group", () => {
    // Reload and Restart still share one widgetGroup (Fireline and
    // Helitack each got their own widgetGroup, so they're no longer a
    // shared-bubble pair). Use inner button rects for the within-pair
    // assertion.
    innerRect("reload-button").then((reload) => {
      innerRect("restart-button").then((restart) => {
        expect(restart.left - reload.right, "Reload -> Restart").to.eq(0);
      });
    });
  });

  it("renders default-state highlight opacity = 0 on icon-on-top buttons", () => {
    ["terrain-button", "spark-button", "fireline-button", "helitack-button"].forEach((id) => {
      cy.get(`[data-testid="${id}"] [class*="iconButtonHighlightSvg"]`)
        .should("have.css", "opacity", "0");
    });
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
