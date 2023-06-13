context("Test the overall app", () => {
  beforeEach(() => {
    cy.visit("");
  });

  describe("Desktop functionalities", () => {
    it("renders the canvas", () => {
      cy.get(".app--app--__forestfire-v1__ canvas").should("be.visible");
    });
  });
});
