// cypress/e2e/wind-meter-label.cy.ts
//
// The Wind Meter label is a fixed-width box in normal flow above the compass dial, so
// a reading that takes a third line pushes the dial out through the bottom of the
// container. jsdom performs no line breaking, so both the cause and the symptom are
// only observable in a real browser.

const CONTAINER = '[data-testid="wind-meter"]';
const LABEL = '[data-testid="wind-meter-label"]';
const DIAL = '[data-testid="wind-meter-dial"]';

const LINE_HEIGHT = 16;
const LABEL_LINES = 2;
const DIAL_BOTTOM_INSET = 5;

// windSpeed is authored pre-scale; the readout divides by config.windScaleFactor. The
// compass phrase binds rather than the speed, and "150 MPH" is what a 74px label still wraps.
const READINGS = [
  { params: "windSpeed=2&windDirection=22.5", text: "10 MPH from the NNE" },
  { params: "windSpeed=30&windDirection=292.5", text: "150 MPH from the WNW" }
];

// Every measurement here is specific to the label's shipping font, 14px Roboto Condensed
// weight 400 (loaded from fonts.googleapis.com in src/index.html). The fallback's metrics
// differ enough to change the line count, so wait for that face rather than measuring
// whatever is applied at first paint.
const visit = (query = "") => {
  cy.visit(`/?preset=plainsTwoZone${query}`);
  cy.window().its("sim.dataReady").should("eq", true);
  cy.document().should((doc) => {
    const loaded = Array.from(doc.fonts).some(
      (f) => f.family === "Roboto Condensed" && f.weight === "400" && f.status === "loaded"
    );
    expect(loaded, "Roboto Condensed 400 loaded").to.eq(true);
  });
};

// The lines the browser actually laid the label out on. The DOM exposes no line list, so
// they are reconstructed from per-character client rects.
const renderedLines = (el: Element) => {
  const node = el.firstChild;
  if (!node?.textContent) throw new Error("wind label has no text node");
  const text = node.textContent;
  const range = el.ownerDocument.createRange();
  const lines: string[] = [];
  let line = "";
  let previousTop: number | null = null;
  for (let i = 0; i < text.length; i++) {
    range.setStart(node, i);
    range.setEnd(node, i + 1);
    const top = Math.round(range.getBoundingClientRect().top);
    if (previousTop !== null && top !== previousTop) {
      lines.push(line);
      line = "";
    }
    line += text[i];
    previousTop = top;
  }
  lines.push(line);
  return lines;
};

describe("Wind Meter label", () => {
  READINGS.forEach(({ params, text }) => {
    describe(`reading "${text}"`, () => {
      beforeEach(() => {
        visit(`&${params}`);
        // without this the geometry below would assert against whatever reading rendered
        cy.get(LABEL).should("have.text", text);
      });

      it("renders on two lines", () => {
        cy.get(LABEL).should(($label) => {
          expect($label[0].getBoundingClientRect().height, "label height")
            .to.eq(LABEL_LINES * LINE_HEIGHT);
        });
      });

      it("leaves the compass dial inside the container", () => {
        cy.get(CONTAINER).then(($container) => {
          const container = $container[0].getBoundingClientRect();
          cy.get(DIAL).should(($dial) => {
            const dial = $dial[0].getBoundingClientRect();
            expect(container.bottom - dial.bottom, "dial bottom inside container bottom")
              .to.eq(DIAL_BOTTOM_INSET);
          });
        });
      });
    });
  });

  it('breaks the shortest reading after "from"', () => {
    visit("&windSpeed=0&windDirection=0");
    cy.get(LABEL).should("have.text", "0 MPH from the N");
    cy.get(LABEL).should(($label) => {
      expect(renderedLines($label[0]), "line breaks").to.deep.eq(["0 MPH from ", "the N"]);
    });
  });

  it("keeps the label centered in the container at its declared width", () => {
    visit();
    cy.get(LABEL).should("have.css", "width", "81px");
    cy.get(CONTAINER).then(($container) => {
      const container = $container[0].getBoundingClientRect();
      cy.get(LABEL).should(($label) => {
        const label = $label[0].getBoundingClientRect();
        expect(label.left + label.width / 2, "label center")
          .to.eq(container.left + container.width / 2);
      });
    });
  });
});
