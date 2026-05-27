// cypress/e2e/bottom-bar-visuals.cy.ts
//
// Visual-regression guard for the WM-23 bottom-bar layout. Locks in the
// deterministic geometry from the Zeplin spec: per-widget border widths,
// paired bounding-box widths (Reload+Restart and Fireline+Helitack),
// inter-widget gaps, default-state highlight opacity, the "Fireline" label,
// and the fullscreen container's 62 x 64 dimensions with computed
// background-size / repeat / position.
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

  it("renders each non-paired widget at its spec Border w. value", () => {
    // Border w. = content + 2px border (1px each side). Values from the
    // requirements.md Layout table.
    widgetRect("terrain-button").should((r) => expect(r.width).to.eq(84));
    widgetRect("spark-button").should((r) => expect(r.width).to.eq(62));
    widgetRect("start-button").should((r) => expect(r.width).to.eq(62));
    widgetRect("fire-intensity-scale").should((r) => expect(r.width).to.eq(142));
  });

  it("renders each paired group at its shared Border w. value", () => {
    // Under Option 1 (single shared widgetGroup per pair), both inner
    // buttons climb to the same widgetGroup ancestor, so reading the
    // shared widgetGroup's outer rect gives the spec's "Border w."
    // value (content + 2 border) directly. Inner-button bounding-box
    // would return 120 / 130 (no border) instead of 122 / 132.
    widgetRect("reload-button").should((r) => expect(r.width).to.eq(122));
    widgetRect("fireline-button").should((r) => expect(r.width).to.eq(132));
  });

  it("renders 8 px visible gaps at every non-paired adjacency", () => {
    // 8 px visible outer-to-outer = 9 px widgetGroup margin-right minus
    // the 1 px margin-left from the next widget. Read each widget's
    // closest-widgetGroup rect into a buffer, then assert the
    // next.left - prev.right delta for every non-paired adjacency.
    // pair-leader testids: reload-button climbs to the Reload+Restart
    // shared widgetGroup; fireline-button climbs to the
    // Fireline+Helitack shared widgetGroup. So the rects[] order is:
    //   0: Setup, 1: Spark, 2: Reload+Restart pair, 3: Start,
    //   4: Fireline+Helitack pair, 5: FIS.
    const rects: { left: number; right: number }[] = [];
    const ids = [
      "terrain-button", "spark-button", "reload-button",
      "start-button", "fireline-button", "fire-intensity-scale"
    ];
    ids.forEach((id) =>
      widgetRect(id).then((r) => { rects.push({ left: r.left, right: r.right }); })
    );
    cy.then(() => {
      expect(rects[1].left - rects[0].right, "Setup -> Spark").to.eq(8);
      expect(rects[2].left - rects[1].right, "Spark -> Reload pair").to.eq(8);
      expect(rects[3].left - rects[2].right, "Restart -> Start").to.eq(8);
      expect(rects[4].left - rects[3].right, "Start -> Fireline pair").to.eq(8);
      expect(rects[5].left - rects[4].right, "Helitack -> FIS").to.eq(8);
    });
  });

  it("renders 0 px gap within each paired group", () => {
    // Within-pair adjacencies (Reload -> Restart, Fireline -> Helitack)
    // are inside one shared widgetGroup. Use inner button rects.
    innerRect("reload-button").then((reload) => {
      innerRect("restart-button").then((restart) => {
        expect(restart.left - reload.right, "Reload -> Restart").to.eq(0);
      });
    });
    innerRect("fireline-button").then((fireline) => {
      innerRect("helitack-button").then((helitack) => {
        expect(helitack.left - fireline.right, "Fireline -> Helitack").to.eq(0);
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

  it("renders the fullscreen container at 62 x 64 with 42 x 42 centered background", () => {
    cy.get('[title="Toggle Fullscreen"]').then(($el) => {
      const rect = $el[0].getBoundingClientRect();
      const cs = getComputedStyle($el[0]);
      expect(rect.width, "container width").to.eq(62);
      expect(rect.height, "container height").to.eq(64);
      expect(cs.backgroundSize, "background-size").to.eq("42px 42px");
      expect(cs.backgroundRepeat, "background-repeat").to.eq("no-repeat");
      expect(cs.backgroundPosition, "background-position").to.eq("50% 50%");
    });
  });
});
