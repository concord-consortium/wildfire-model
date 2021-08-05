class BottomBar {

  getTerrainSetupButton() {
    return cy.get('[data-test="terrain-button"]');
  }
  getSparkButton() {
    return cy.get('[data-test="spark-button"]');
  }
  getReloadButton() {
    return cy.get('[data-test="reload-button"]');
  }
  getRestartButton() {
    return cy.get('[data-test="restart-button"]');
  }
  getStartButton() {
    return cy.get('[data-test="start-button"]');
  }
  getFireLineButton() {
    return cy.get('[data-test="fireline-button"]');
  }
  getHelitackButton() {
    return cy.get('[data-test="helitack-button"]');
  }
}

export default BottomBar;
