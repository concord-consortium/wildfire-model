import TerrainSetup from "../support/elements/TerrainSetup"
import BottomBar from "../support/elements/BottomBar"

context('Model Smoke Test', () => {

    const preset = "?preset=test01"
    const baseUrl = "https://wildfire.concord.org/branch/master/index.html"
    let url = baseUrl + preset

    let terrain = new TerrainSetup();
    let bottomBar = new BottomBar();

    before(() => {
        cy.visit(url)
    })

    it('sets up model', () => {
        bottomBar.getTerrainSetupButton().click()
        terrain.getZone('1').click()
        // Terrain Types : Plains / Foothills / Mountains
        terrain.getTerrainType('Plains').click()
        // Veg Types     : Forest Small Litter / Shrub / Mountains
        terrain.setVegetationTypeOption('Shrub')
        // Drought Index : Severe / Medium / Mild / No + Drought
        terrain.setDroughtIndexOption('Severe Drought')

        terrain.getZone('2').click()
        // Terrain Types : Plains / Foothills / Mountains
        terrain.getTerrainType('Foothills').click()
        // Veg Types     : Forest Small Litter / Shrub / Mountains
        terrain.setVegetationTypeOption('Shrub')
        // Drought Index : Severe / Medium / Mild / No + Drought
        terrain.setDroughtIndexOption('Mild Drought')
        terrain.getNextButton().click()

        /**
         * Test will run against model pointing to North initially
         * At least until we cna figure out clicking on canvas
         */

        terrain.getWindDirectionSlider().contains('10').click()
        terrain.getCreateButton().click()
    })

    it('runs model for set number of seconds', () => {
        bottomBar.getSparkButton().click()
        cy.get('canvas').click(400,400, {force:true})
        bottomBar.getSparkButton().click()
        cy.get('canvas').click(700,400, {force:true})
        bottomBar.getStartButton().click()
        cy.wait(10000)
        bottomBar.getStartButton().click()
        // cy.matchImageSnapshot()
    })
})