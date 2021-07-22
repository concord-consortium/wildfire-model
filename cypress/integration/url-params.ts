context("Test URL params", () => {

  context("showBurnIndex", () => {
    it("doesn't render the fire intensity scale when showBurnIndex URL param is omitted", () => {
      cy.visit("/");
      cy.get(".fire-intensity-scale--fireIntensityScale--__wildfire-v1__").should("not.exist");
    });

    it("renders the fire intensity scale when ?showBurnIndex=true", () => {
      cy.visit("/?showBurnIndex=true");
      cy.get(".fire-intensity-scale--fireIntensityScale--__wildfire-v1__").should("be.visible");
    });
  })
});
