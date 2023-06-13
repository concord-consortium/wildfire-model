export class TerrainSetup {
  // Get UI Component
  getTerrainSetupComponent() {
    return cy.get(".terrain-panel--terrain--__forestfire-v1__");
  }
  getTerrainHeader() {
    return cy.get('[data-testid = "terrain-header"]');
  }
  getInstructions() {
    return cy.get(".terrain-panel--instructions--__forestfire-v1__");
  }

  //Zones
  getAllZones() {
    return cy.get(".zone-selector--zone--__forestfire-v1__");
  }
  getZone(index) {
    return cy.get(".zone-selector--zone" + index + "--__forestfire-v1__").eq(0);
  }
  getZoneLabel() {
    return cy.get(".zone-selector--zoneLabel--__forestfire-v1__");
  }

  ////////////////////////
  //Terrain Setup Step 1//
  ////////////////////////

  getTerrainTypes() {
    return cy.get(".terrain-type-selector--terrain--__forestfire-v1__");
  }
  getTerrainType(terrainType) {
    return cy.get(".terrain-type-selector--terrain--__forestfire-v1__").contains(terrainType);
  }

  //Vegetation
  getVegetationSlider() {
    return cy.get('[data-testid="vegetation-slider"]');
  }
  setVegetationTypeOption(vegType) {
    this.getVegetationSlider().contains(vegType).should("be.visible").click();
  }

  //Drought
  getDroughtSlider() {
    return cy.get('[data-testid="drought-slider"]');
  }
  setDroughtIndexOption(droughtIndex) {
    this.getDroughtSlider().contains(droughtIndex).should("be.visible").click();
  }

  // Next/Prev Buttons
  getNextButton() {
    return cy.get(".MuiButton-text").contains("Next");
  }
  getPrevButton() {
    return cy.get(".MuiButton-text").contains("Previous");
  }
  getCreateButton() {
    return cy.get(".MuiButton-text").contains("Create");
  }

  ////////////////////////
  //Terrain Setup Step 2//
  ////////////////////////

  getTerrainTypeLabels() {
    return cy.get(".terrain-panel--terrainTypeLabel--__forestfire-v1__");
  }
  getZoneTerrainSummary() {
    return cy.get(".terrain-summary--terrainSummary--__forestfire-v1__");
  }
  getWindDirectionControl() {
    return cy.get(".wind-dial--dialContainer--__forestfire-v1__");
  }
  getWindSpeedSlider() {
    return cy.get(".wind-circular-control--windSliderControls--__forestfire-v1__");
  }

  // Actions

  verifyActiveZone(zone) {
    const verifyActiveZone = ".terrain-panel--zone" + zone + "--__forestfire-v1__";
    return cy.get(verifyActiveZone).should("exist").and("be.visible");
  }
  checkInstructionContent(testInstructionText) {
    this.getInstructions().should("contain", testInstructionText);
  }
  selectTerrainTypeOption(terrainType) {
    let optionIndex;

    switch (terrainType) {
      case (terrainType === "plains"):
        optionIndex = 0;
        break;

      case (terrainType === "footHills"):
        optionIndex = 1;
        break;

      case (terrainType === "mountains"):
        optionIndex = 2;
        break;

    }
    this.getTerrainTypes().eq(optionIndex);
  }
  closeTerrainSetupComponent() {
    return cy.get(".terrain-panel--closeButton--__forestfire-v1__").click();
  }
}
