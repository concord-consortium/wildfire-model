export class TerrainSetup {
  // Get UI Component
  getTerrainSetupComponent() {
    return cy.get(".terrain-panel--terrain--__wildfire-v1__");
  }
  getTerrainHeader() {
    return cy.get('[data-testid = "terrain-header"]');
  }
  getInstructions() {
    return cy.get(".terrain-panel--instructions--__wildfire-v1__");
  }
  getStepIcon() {
    return cy.get(".terrain-panel--setupStepIcon--__wildfire-v1__");
  }

  //Zones
  getAllZones() {
    return cy.get(".zone-selector--zone--__wildfire-v1__");
  }
  getZone(index) {
    return cy.get(".zone-selector--zone" + index + "--__wildfire-v1__").eq(0);
  }
  getZoneLabel() {
    return cy.get(".zone-selector--zoneLabel--__wildfire-v1__");
  }

  ////////////////////////
  //Terrain Setup Step 1//
  ////////////////////////

  getTerrainTypes() {
    return cy.get(".terrain-type-selector--terrain--__wildfire-v1__");
  }
  getTerrainType(terrainType) {
    return cy.get(".terrain-type-selector--terrain--__wildfire-v1__").contains(terrainType);
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
    return cy.get(".terrain-panel--terrainTypeLabel--__wildfire-v1__");
  }
  getZoneTerrainSummary() {
    return cy.get(".terrain-summary--terrainSummary--__wildfire-v1__");
  }
  getWindDirectionControl() {
    return cy.get(".wind-dial--dialContainer--__wildfire-v1__");
  }
  getWindSpeedSlider() {
    return cy.get(".wind-circular-control--windSliderControls--__wildfire-v1__");
  }

  // Actions

  verifyActiveZone(zone) {
    const verifyActiveZone = ".terrain-panel--zone" + zone + "--__wildfire-v1__";
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
    return cy.get(".terrain-panel--closeButton--__wildfire-v1__").click();
  }
  
  //Zones Count Selector
  getZoneCountSelector() {
    return cy.get("[data-testid=zones-count-selector]");
  }
  getZoneCountLabel(index) {
    return this.getZoneCountSelector().find('.zones-count-selector--label--__wildfire-v1__').eq(index);
  }
  getThreeZoneSetup() {
    return this.getZoneCountSelector().find('.zones-count-selector--image--__wildfire-v1__ [data-name="3-zone Terrain Setup"]');
  }
  getTwoZoneSetup() {
    return this.getZoneCountSelector().find('.zones-count-selector--image--__wildfire-v1__ [data-name="Terrain Setup"]');
  }
  getRadioButton(index) {
    return this.getZoneCountSelector().find('.PrivateSwitchBase-input').eq(index);
  }
  verifyRadioButtonChecked(index) {
    return this.getRadioButton(index).parent().invoke("attr", "class").should("contain", "checked");
  }
  verifyRadioButtonUnchecked(index) {
    return this.getRadioButton(index).parent().invoke("attr", "class").should("not.contain", "checked");
  }

}
