context("Test the overall app", () => {
  beforeEach(() => {
    cy.visit("");
  });

  describe("Desktop functionalities", () => {
    it("renders the canvas", () => {
      cy.get(".app canvas").should("be.visible");
    });
  });
});
