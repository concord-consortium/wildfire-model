// cypress/e2e/zone-label-visuals.cy.ts
//
// Visual-regression guard for the zone labels above the model: their 170 x 60
// box and the 10px floor between them. jsdom applies no stylesheet, so this
// geometry is only observable here.

const ZONE = '[data-testid="zone-info"]';
const GRAPH_TAB = '[data-testid="right-panel-tab"]';

const ZONE_WIDTH = 170;
const ZONE_HEIGHT = 60;
const ZONE_GAP = 10;

const zoneRects = () =>
  cy.get(ZONE).then(($zones) => [...$zones].map((z) => z.getBoundingClientRect()));

// .mainContent animates its width over a second when the graph opens
// (app.scss), so the labels keep reflowing after the click. Geometry read
// during that is whatever the easing happened to be passing through.
const freezeTransitions = () =>
  cy.document().then((doc) => {
    const style = doc.createElement("style");
    style.textContent = "* { transition: none !important; }";
    doc.head.appendChild(style);
  });

describe("Zone label visual regression", () => {
  beforeEach(() => {
    cy.visit("/?preset=plainsTwoZone");
    cy.window().its("sim.dataReady").should("eq", true);
  });

  it("renders every label as a 170 x 60 border box with a white border and a 4px radius", () => {
    zoneRects().then((rects) => {
      expect(rects, "both labels present").to.have.lengthOf(2);
      rects.forEach((r, i) => {
        expect(r.width, `label ${i} width`).to.eq(ZONE_WIDTH);
        expect(r.height, `label ${i} height`).to.eq(ZONE_HEIGHT);
      });
    });
    cy.get(ZONE).each(($zone) => {
      cy.wrap($zone)
        .should("have.css", "border", "1px solid rgb(255, 255, 255)")
        .and("have.css", "border-radius", "4px")
        .and("have.css", "box-sizing", "border-box");
    });
  });
});

// The floor only has anything to catch below about 993px of viewport width with
// three zones and the graph open, where the row's width crosses 530 (three
// labels at 170 plus two 10px gaps). At the suite's default 1400 x 1000 the gap
// is over 100px with or without the floor.
describe("Zone label visual regression at the width where the row crowds", () => {
  beforeEach(() => {
    cy.viewport(950, 880);
    cy.visit("/?preset=hillThreeZone");
    cy.window().its("sim.dataReady").should("eq", true);
    freezeTransitions();
    cy.get(GRAPH_TAB).click();
  });

  it("holds a 10px floor between three labels, each still a full 170 wide", () => {
    zoneRects().then((rects) => {
      expect(rects, "all three labels present").to.have.lengthOf(3);
      // Both halves of the floor: dropping the container's gap collapses the
      // gap and leaves the width at 170, while dropping the label's
      // flex-shrink: 0 holds the gap at 10 and costs 1px of width, since row
      // 2's own non-shrinking boxes floor the label at a 169px min-content.
      rects.forEach((r, i) => {
        expect(r.width, `label ${i} width`).to.eq(ZONE_WIDTH);
      });
      expect(rects[1].left - rects[0].right, "gap between labels 1 and 2").to.eq(ZONE_GAP);
      expect(rects[2].left - rects[1].right, "gap between labels 2 and 3").to.eq(ZONE_GAP);
    });
  });
});
