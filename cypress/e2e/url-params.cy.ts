context("Test URL params", () => {

  context("showBurnIndex", () => {
    // Visibility alone would pass wherever the scale is rendered, including back
    // in the bottom bar, so this also pins it to the key-area column.
    it("renders the fire intensity scale in the key area when showBurnIndex URL param is omitted", () => {
      cy.visit("/");
      cy.get(".fire-intensity-scale--fireIntensityScale--__wildfire-v1__").should("be.visible");
      cy.get(".app--timeDisplay--__wildfire-v1__").then(($time) => {
        const time = $time[0].getBoundingClientRect();
        cy.get(".fire-intensity-scale--fireIntensityScale--__wildfire-v1__").then(($scale) => {
          const scale = $scale[0].getBoundingClientRect();
          expect(scale.left, "left-aligned with the Time display").to.eq(time.left);
          expect(scale.top, "below the Time display").to.be.greaterThan(time.bottom);
        });
      });
    });

    it("doesn't render the fire intensity scale when ?showBurnIndex=false", () => {
      cy.visit("/?showBurnIndex=false");
      cy.get(".fire-intensity-scale--fireIntensityScale--__wildfire-v1__").should("not.exist");
    });
  });
});
