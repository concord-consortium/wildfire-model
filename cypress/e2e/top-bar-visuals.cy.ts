// cypress/e2e/top-bar-visuals.cy.ts
//
// Layout checks for the top bar and its dialogs. jsdom applies no stylesheet, so
// computed sizes and on-screen positions are observable only here.

describe("Top bar and dialog layout", () => {
  beforeEach(() => {
    cy.visit("/");
  });

  ["about", "share"].forEach((testid) => {
    it(`shows the ${testid} dialog's copyright line at 12px`, () => {
      cy.get(`[data-testid="${testid}"]`).click();
      cy.get('[role="dialog"]')
        .contains("p", /^© \d{4} The Concord Consortium, Inc\.$/)
        .should("have.css", "font-size", "12px");
    });
  });
});
