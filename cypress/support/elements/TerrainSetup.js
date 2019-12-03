class TerrainSetup {
    // Get UI Component
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
        return cy.get('.zone-selector--zone' + index + '--__wildfire-v1__').eq(0)
    }
    getZoneLabel() {
        return cy.get('.zone-selector--zoneLabel--__wildfire-v1__')
    }

    ////////////////////////
    //Terrain Setup Step 1//
    ////////////////////////

    getTerrainTypes() {
        return cy.get('.terrain-type-selector--terrain--__wildfire-v1__')
    }
    getTerrainType(terrainType){
        return cy.get('.terrain-type-selector--terrain--__wildfire-v1__').contains(terrainType)
    }

    //Vegetation
    getVegetationSlider() {
        return cy.get('[data-test="vegetation-slider"]')
    }
    setVegetationTypeOption(vegType) {
        this.getVegetationSlider().contains(vegType).click()
    }

    //Drought
    getDroughtSlider() {
        return cy.get('[data-test="drought-slider"]')
    }
    setDroughtIndexOption(droughtIndex) {
        this.getDroughtSlider().contains(droughtIndex).click()
    }

    // Next/Prev Buttons
    getNextButton() {
        return cy.get('.MuiButton-label').contains('Next')
    }
    getPrevButton() {
        return cy.get('.MuiButton-label').contains('Previous')
    }
    getCreateButton() {
        return cy.get('.MuiButton-label').contains('Create')
    }

    ////////////////////////
    //Terrain Setup Step 2//
    ////////////////////////
    
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
        return cy.get('.wind-circular-control--windSliderControls--__wildfire-v1__')
    }

    // Actions

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