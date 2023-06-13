context("Test URL params", () => {

  context("showBurnIndex", () => {
    it("renders the fire intensity scale when showBurnIndex URL param is omitted", () => {
      cy.visit("/");
      cy.get(".fire-intensity-scale--fireIntensityScale--__forestfire-v1__").should("be.visible");
    });

    it("doesn't render the fire intensity scale when ?showBurnIndex=false", () => {
      cy.visit("/?showBurnIndex=false");
      cy.get(".fire-intensity-scale--fireIntensityScale--__forestfire-v1__").should("not.exist");
    });
  });
});
