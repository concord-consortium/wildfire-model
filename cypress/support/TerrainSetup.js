class TerrainSetup {
    // Get UI Component

    getTerrainSetupButton() {
        return cy.get('[data-test="terrain-button"]')
    }
    getTerrainSetupComponent() {
        return cy.get('.terrain-panel--terrain--__wildfire-v1__')
    }
    getTerrainHeader() {
        return cy.get('[data-test = "terrain-header"]')
    }
    getInstructions() {
        return cy.get('.terrain-panel--instructions--__wildfire-v1__')
    }
    //Zones
    getAllZones() {
        return cy.get('.zone-selector--zone--__wildfire-v1__')
    }
    getZone(index) {
        return cy.get('.zone-selector--zone' + index + '--__wildfire-v1__')
    }
    getZoneLabel() {
        return cy.get('.zone-selector--zoneLabel--__wildfire-v1__')
    }
    /////////////
    //Terrain 1//
    /////////////
    getTerrainTypes() {
        return cy.get('.terrain-type-selector--terrainOption--__wildfire-v1__')
    }
    getTerrainTypeButton() {
        return cy.get('input.jss666')
    }
    //Vegetation
    getVegetationSlider() {
        return cy.get('[data-test="vegetation-slider"]')
    }
    getVegetationTypeOption(vegType) {
        return cy.get('[data-test="vegetation-slider"] .MuiSlider-markLabel').contains(vegType)
    }

    //Drought
    getDroughtSlider() {
        return cy.get('[data-test="drought-slider"]')
    }
    getDroughtIndexOption(droughtIndex) {
        return cy.get('[data-test="drought-slider"] .MuiSlider-markLabel').contains(droughtIndex)
    }
    // Next/Prev Buttons
    getNextButton() {
        return cy.get('.MuiButton-label').contains('Next')
    }
    getPrevButton() {
        return cy.get('.MuiButton-label').contains('Previous')
    }
    /////////////
    //Terrain 2//
    /////////////
    getTerrainTypeLabels() {
        return cy.get('.terrain-panel--terrainTypeLabel--__wildfire-v1__')
    }
    getZoneTerrainSummary() {
        return cy.get('.terrain-summary--terrainSummary--__wildfire-v1__')
    }
    getWindControls() {
        return cy.get('.wind-controls--windControls--__wildfire-v1__')
    }
    getWindDirectionSlider() {
        return cy.get('.MuiSlider-thumb')
    }

    // Actions

    toggleTerrainSetupComponent() {
        this.getTerrainSetupButton().click()
    }
    verifyActiveZone(zone) {
        let verifyActiveZone = '.terrain-panel--zone' + zone + '--__wildfire-v1__'
        return cy.get(zone).should('exist').and('be.visible')
    }
    checkInstructionContent(testInstructionText) {
        this.getInstructions().should('contain', instructionContent)
    }
    selectTerrainTypeOption(terrainType) {
        let optionIndex;

        switch (terrainType) {
            case (terrainType == "plains"):
                optionIndex = 0
                break;

            case (terrainType == "footHills"):
                optionIndex = 1
                break;

            case (terrainType == "mountains"):
                optionIndex = 2
                break;

        }
        this.getTerrainTypes().eq(optionIndex)
    }
    closeTerrainSetupComponent() {
        return cy.get('.terrain-panel--closeButton--__wildfire-v1__').click()
    }
} export default TerrainSetup;