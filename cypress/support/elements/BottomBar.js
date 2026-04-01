export class BottomBar {

  getTerrainSetupButton() {
    return cy.get('[data-testid="terrain-button"]');
  }
  getSparkButton() {
    return cy.get('[data-testid="spark-button"]');
  }
  getReloadButton() {
    return cy.get('[data-testid="reload-button"]');
  }
  getRestartButton() {
    return cy.get('[data-testid="restart-button"]');
  }
  getStartButton(options) {
    return cy.get('[data-testid="start-button"]', options);
  }
  getFireLineButton() {
    return cy.get('[data-testid="fireline-button"]');
  }
  getHelitackButton() {
    return cy.get('[data-testid="helitack-button"]');
  }
  getSparkCount() {
    return cy.get(".bottom-bar--sparksCount--__wildfire-v1__");
  }
}

