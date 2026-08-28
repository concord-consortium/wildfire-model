// cypress/e2e/setup-panel-texture.cy.ts
//
// The painted-color guards for the Setup panel thumbnail. The Jest cases in
// terrain-panel.test.tsx pin the DOM structure, but jsdom composites nothing, so
// the two properties that survive to the screen are only observable here: the
// texture reaches it in the drought ink, and the river reaches it in its own.
// The relief's multiply is asserted as declarations rather than pixels; its
// composite is measured in the Playwright pass.
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
// case exists to catch, a texture whose ink is altered on the way to the screen:
// the correct render puts 151 pixels inside this band and an altered one puts 0.
// A looser band does not work: at 30 per channel the bug leaks pixels in, because
// its washed-out render contains a neutral gray that happens to sit near the ink.
// There is no byte-exact pixel to assert on: a 3px stroke on a 256 viewBox drawn
// at a 112.5px mask scale almost never fills a whole destination pixel.
const TOLERANCE = 300;
const MIN_INK_PIXELS = 20;
// The severe-drought terrain color, derived by droughtTerrainHex and pinned as
// #C8A145 in terrain-glyph-colors.test.ts.
const SEVERE_TERRAIN = "rgb(200, 161, 69)";
// The 2-zone-left river is a thin band, and the browser's downscale of the 2x
// asset softens its edges: 58 pixels clear the test's threshold, against 0 for
// the same thumbnail with the river inside the multiply.
const MIN_RIVER_PIXELS = 20;

const openSetup = () => {
  cy.window().its("sim.dataReady").should("eq", true);
  cy.get('[data-testid="terrain-button"]').click();
  cy.get('[data-testid="terrain-panel-container"]').should("exist");
};

// Decodes a screenshot in the browser (no PNG decoder is installed in this repo)
// and counts the pixels `match` accepts.
const countPixels = (win: Window, path: string, match: (r: number, g: number, b: number) => boolean) =>
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
          if (match(d[i], d[i + 1], d[i + 2])) hits++;
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

const isInk = (r: number, g: number, b: number) =>
  (r - INK[0]) ** 2 + (g - INK[1]) ** 2 + (b - INK[2]) ** 2 <= TOLERANCE;

describe("Setup panel vegetation texture (WM-53)", () => {
  it("gets the drought ink to the screen unaltered", () => {
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
    cy.window().then(win => countPixels(win, shotPath, isInk)).then(hits => {
      // The assertion above reads the declared color; this reads what composited.
      // The mutation it catches: give the texture, or anything above it, a color
      // treatment of its own, and `hits` goes to 0 while the declared color holds.
      expect(hits, "pixels painted in the medium-drought ink").to.be.greaterThan(MIN_INK_PIXELS);
    });
  });

  it("keeps the river out of the drought multiply", () => {
    cy.visit(TWO_ZONE_URL);
    openSetup();
    // Severe is the level that makes the test possible: its red is far above its
    // blue, so every pixel the multiply can produce has more red than blue.
    cy.get('[data-testid="drought-slider"]').contains("Severe").should("be.visible").click();
    cy.get(IMAGE).first().should("have.css", "background-color", SEVERE_TERRAIN);
    cy.get(IMAGE).first().should("have.css", "background-blend-mode", "multiply");

    let shotPath = "";
    cy.get(IMAGE).first().screenshot("zone-1-terrain", {
      overwrite: true,
      onAfterScreenshot: (_el, props) => { shotPath = props.path; }
    });
    // The river's own ink is rgb(7, 85, 135). Nothing else on the thumbnail can
    // clear this, and it cannot either once it is inside the multiply.
    cy.window().then(win => countPixels(win, shotPath, (r, _g, b) => b - r > 30))
      .then(hits => {
        expect(hits, "river pixels the drought color never touched").to.be.greaterThan(MIN_RIVER_PIXELS);
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
