// cypress/e2e/setup-panel-texture.cy.ts
//
// The painted-color guard for the Setup panel's vegetation texture. The Jest
// cases in terrain-panel.test.tsx pin the DOM structure, but jsdom applies no
// stylesheet filters, so the property the feature exists for (the texture is
// painted in the drought ink, not run through the drought filter) is only
// observable here.
//
// Hover's 75% is verified by hand in the Playwright pass, not here: Cypress's
// cy.trigger dispatches an event without moving the pointer, so :hover never
// matches and the read comes back 0.5. bottom-bar-visuals.cy.ts made the same
// call for the same reason.

// CSS-module class names are hashed by webpack's localIdentName
// ('[name]--[local]--__wildfire-v1__'), so a bare `.terrainLayers` matches
// nothing in the built app. cypress/support/elements/TerrainSetup.js is the
// convention: name the hashed class in full.
const LAYERS = ".zone-selector--terrainLayers--__wildfire-v1__";
const IMAGE = ".zone-selector--terrainImage--__wildfire-v1__";
const TEXTURE = '[data-testid="vegetation-texture"]';

const TWO_ZONE_URL = "/?preset=plainsTwoZone&showVegetationKey=true";
const THREE_ZONE_URL = "/?preset=hillThreeZone&showVegetationKey=true";

// The medium-drought ink, derived by droughtGlyphInkHex and pinned as #424F12 in
// terrain-glyph-colors.test.ts.
const INK = [0x42, 0x4f, 0x12];
// Squared distance, roughly 10 per channel. Calibrated against the failure this
// case exists to catch: the correct DOM shape puts 116 pixels inside this band
// and the texture-nested-inside-.terrainImage arrangement puts 0. A looser band
// does not work: at 30 per channel the bug leaks pixels in, because its
// washed-out render contains a neutral gray that happens to sit near the ink.
// There is no byte-exact pixel to assert on: a 3px stroke on a 256 viewBox drawn
// at a 112.5px mask scale almost never fills a whole destination pixel.
const TOLERANCE = 300;
const MIN_INK_PIXELS = 20;

const openSetup = () => {
  cy.window().its("sim.dataReady").should("eq", true);
  cy.get('[data-testid="terrain-button"]').click();
  cy.get('[data-testid="terrain-panel-container"]').should("exist");
};

// Decodes a screenshot in the browser (no PNG decoder is installed in this repo)
// and counts pixels within TOLERANCE of the ink.
const countInkPixels = (win: Window, path: string) =>
  cy.readFile(path, null).then((buf: unknown) =>
    new Cypress.Promise<number>((resolve, reject) => {
      const bytes = new Uint8Array(buf as ArrayLike<number>);
      const url = win.URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
      const img = new (win as unknown as { Image: typeof Image }).Image();
      img.onload = () => {
        const canvas = win.document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let hits = 0;
        for (let i = 0; i < d.length; i += 4) {
          const dist = (d[i] - INK[0]) ** 2 + (d[i + 1] - INK[1]) ** 2 + (d[i + 2] - INK[2]) ** 2;
          if (dist <= TOLERANCE) hits++;
        }
        win.URL.revokeObjectURL(url);
        resolve(hits);
      };
      img.onerror = () => {
        win.URL.revokeObjectURL(url);
        reject(new Error("screenshot decode failed"));
      };
      img.src = url;
    })
  );

describe("Setup panel vegetation texture (WM-53)", () => {
  it("paints the texture in the drought ink, not through the drought filter", () => {
    cy.visit(TWO_ZONE_URL);
    openSetup();
    // Zone 1 is selected, so the texture sits at full strength; at the 0.5
    // default opacity the ink composites with the terrain and is never exact.
    // Clicking the mark label is how TerrainSetup.js drives this slider.
    cy.get('[data-testid="drought-slider"]').contains("Medium").should("be.visible").click();
    cy.get(TEXTURE).first().should("have.css", "background-color", "rgb(66, 79, 18)");

    let shotPath = "";
    cy.get(TEXTURE).first().screenshot("zone-1-texture", {
      overwrite: true,
      onAfterScreenshot: (_el, props) => { shotPath = props.path; }
    });
    cy.window().then(win => countInkPixels(win, shotPath)).then(hits => {
      // The mutation this catches: move the texture layer inside .terrainImage
      // and `hits` goes to 0.
      expect(hits, "pixels painted in the medium-drought ink").to.be.greaterThan(MIN_INK_PIXELS);
    });
  });

  it("fades the texture and the terrain image together", () => {
    cy.visit(TWO_ZONE_URL);
    openSetup();
    cy.get(LAYERS).eq(0).should("have.css", "opacity", "1");    // zone 1 is selected
    cy.get(LAYERS).eq(1).should("have.css", "opacity", "0.5");  // zone 2 is default
    cy.get(IMAGE).eq(1).should("have.css", "opacity", "1");     // the fade is the wrapper's, not the image's
  });

  it("holds the recap at full strength on the wind screen", () => {
    cy.visit(TWO_ZONE_URL);
    openSetup();
    cy.get('[data-testid="terrain-next"]').click();
    cy.get(LAYERS).should("have.length", 2).each($l => expect($l).to.have.css("opacity", "1"));
  });

  it("draws the tile at the board's scale on a two-zone layout", () => {
    cy.visit(TWO_ZONE_URL);
    openSetup();
    cy.get(TEXTURE).first().should("have.css", "mask-size", "112.5px 112.5px");
  });

  it("draws the tile at the same scale on a three-zone layout", () => {
    cy.visit(THREE_ZONE_URL);
    openSetup();
    cy.get(TEXTURE).should("have.length", 3);
    cy.get(TEXTURE).first().should("have.css", "mask-size", "112.5px 112.5px");
  });
});
