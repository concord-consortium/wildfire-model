// cypress/e2e/key-area-visuals.cy.ts
//
// Visual-regression guard for the fixed key area down the left edge: the Time,
// Wind Meter and Fire Intensity Scale displays, and the scale's internals.
// jsdom applies no stylesheet, so this geometry is only observable here.

const APP_URL = "/?preset=plainsTwoZone";

const TIME = ".app--timeDisplay--__wildfire-v1__";
const WIND = ".simulation-info--windContainer--__wildfire-v1__";
const SCALE = ".app--fireIntensityScaleContainer--__wildfire-v1__";

const KEY_AREA_LEFT = 10;
const KEY_AREA_WIDTH = 104;
const KEY_AREA_GAP = 10;

const rect = (selector: string) =>
  cy.get(selector).then(($el) => $el[0].getBoundingClientRect());

describe("Key-area visual regression", () => {
  beforeEach(() => {
    cy.visit(APP_URL);
    cy.window().its("sim.dataReady").should("eq", true);
  });

  it("renders the three displays at one width, one left edge and a 10 px gap", () => {
    const rects: DOMRect[] = [];
    [TIME, WIND, SCALE].forEach((s) => rect(s).then((r) => { rects.push(r); }));

    cy.then(() => {
      expect(rects, "all three displays present").to.have.lengthOf(3);
      rects.forEach((r, i) => {
        expect(r.left, `display ${i} left`).to.eq(KEY_AREA_LEFT);
        expect(r.width, `display ${i} width`).to.eq(KEY_AREA_WIDTH);
      });
      expect(rects[0].height, "Time height").to.eq(47);
      expect(rects[1].height, "Wind Meter height").to.eq(126);
      expect(rects[2].height, "Fire Intensity Scale height").to.eq(82);
      expect(rects[1].top - rects[0].bottom, "Time -> Wind Meter").to.eq(KEY_AREA_GAP);
      expect(rects[2].top - rects[1].bottom, "Wind Meter -> Fire Intensity Scale").to.eq(KEY_AREA_GAP);
    });
  });

  it("gives every display a white fill, a 4 px radius and no border", () => {
    [TIME, WIND, SCALE].forEach((selector) => {
      cy.get(selector)
        .should("have.css", "background-color", "rgb(255, 255, 255)")
        .and("have.css", "border-radius", "4px")
        .and("have.css", "border-style", "none");
    });
  });

  it("renders the color bar as three 27 x 10 swatches inside an 83 x 12 outline", () => {
    rect(".fire-intensity-scale--barsContainer--__wildfire-v1__").then((bar) => {
      expect(bar.width, "bar width").to.eq(83);
      expect(bar.height, "bar height").to.eq(12);
    });
    cy.get(".fire-intensity-scale--barsContainer--__wildfire-v1__")
      .should("have.css", "border", "1px solid rgb(121, 121, 121)")
      .and("have.css", "border-radius", "3px");

    cy.get('[data-testid="fire-intensity-scale-swatch"]').should("have.length", 3).each(($s) => {
      const swatch = $s[0].getBoundingClientRect();
      expect(swatch.width, "swatch width").to.eq(27);
      expect(swatch.height, "swatch height").to.eq(10);
    });
  });

  it("rounds only the outer ends of the color bar", () => {
    const swatches = '[data-testid="fire-intensity-scale-swatch"]';
    cy.get(swatches).eq(0)
      .should("have.css", "border-top-left-radius", "2px")
      .and("have.css", "border-top-right-radius", "0px");
    cy.get(swatches).eq(1)
      .should("have.css", "border-top-left-radius", "0px")
      .and("have.css", "border-top-right-radius", "0px");
    cy.get(swatches).eq(2)
      .should("have.css", "border-top-left-radius", "0px")
      .and("have.css", "border-top-right-radius", "2px");
  });

  it("centers Low and High under the end swatches", () => {
    const centers: { label: number; swatch: number }[] = [];
    const collect = (labelIdx: number, swatchIdx: number) => {
      cy.get(".fire-intensity-scale--label--__wildfire-v1__").eq(labelIdx).then(($label) => {
        const label = $label[0].getBoundingClientRect();
        cy.get('[data-testid="fire-intensity-scale-swatch"]').eq(swatchIdx).then(($swatch) => {
          const swatch = $swatch[0].getBoundingClientRect();
          centers.push({ label: label.left + label.width / 2, swatch: swatch.left + swatch.width / 2 });
        });
      });
    };
    collect(0, 0);
    collect(1, 2);

    cy.then(() => {
      expect(centers, "both labels measured").to.have.lengthOf(2);
      expect(centers[0].label, "Low centered on the first swatch").to.eq(centers[0].swatch);
      expect(centers[1].label, "High centered on the last swatch").to.eq(centers[1].swatch);
    });
  });

  it("breaks the title onto two lines", () => {
    // an 84 px box holds "Fire Intensity" on one line only while Lato is loaded;
    // the height check is what catches a third line on the fallback font
    rect(".fire-intensity-scale--title--__wildfire-v1__").then((title) => {
      expect(title.width, "title width").to.eq(84);
      expect(title.height, "title height").to.eq(34);
    });
    cy.get(".fire-intensity-scale--title--__wildfire-v1__")
      .should("have.css", "white-space", "pre-line");
  });
});
