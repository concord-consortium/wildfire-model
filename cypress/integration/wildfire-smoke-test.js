import TerrainSetup from "../support/elements/TerrainSetup"
import ModelInfo from "../support/elements/ModelInfo"
import BottomBar from "../support/elements/BottomBar"

context('WildFire Smoke Test', () => {

    const baseUrl = "https://wildfire.concord.org/branch/master/index.html"
    let url = baseUrl

    let terrain = new TerrainSetup();
    let modelInfo = new ModelInfo();
    let bottomBar = new BottomBar();


    before(() => {
        cy.visit(url)
    })

    describe("Terrain setup - Adjusting Variables", () => {
        const headerText = 'Terrain Setup'
        const instructionText = 'Adjust variables in each zone'
        const zoneTotal = 2

        it('opens the terrain setup and check for header', () => {
            terrain.getTerrainSetupComponent().should('exist').and('not.be.visible')
            cy.log("Hello this is my log!!!!")
            bottomBar.getTerrainSetupButton().click()
            terrain.getTerrainSetupComponent().should('be.visible')
            terrain.getTerrainHeader().should('be.visible').and('contain', headerText)
        })
        it('verifies expected instructions text', () => {
            terrain.getInstructions().should('exist').and('contain', instructionText)
        })
        it('checks for two zones and zone labels', () => {
            terrain.getAllZones().should('have.length', zoneTotal)
            terrain.getZone('1').within(() => {
                terrain.getZoneLabel().contains('Zone 1')
            })
            terrain.getZone('2').within(() => {
                terrain.getZoneLabel().contains('Zone 2')
            })
        })
        it('changes vegetation type for both zones', () => {
            terrain.getVegetationSlider().should('exist').and('be.visible')
            terrain.setVegetationTypeOption('Shrub')
            terrain.setVegetationTypeOption('Grass')
        })
        it('changes drought index for both zones', () => {
            // [No,Mild,Medium,Severe] + _Drought
            terrain.getDroughtSlider().should('exist').and('be.visible')
            terrain.setDroughtIndexOption('Medium Drought')
            terrain.setDroughtIndexOption('Mild Drought')
        })
        it('clicks next page on terrain setup', () => {
            terrain.getNextButton().should('be.visible').click()
        })
    })

    describe("Terrain setup - Wind Direction and Speed", () => {
        const instructionText = 'Set initial wind direction and speed'
        const zone1 = {
            terrainType: "Foothills",
            currentVegType: "Grass",
            currentDroughtIndex: "Mild Drought"
        }
        const zone2 = {
            terrainType: "Foothills",
            currentVegType: "Shrub",
            currentDroughtIndex: "Medium Drought"
        }
        it('verifies new expected instructions text', () => {
            terrain.getInstructions().should('exist').and('contain', instructionText)
        })
        it('verifies setup in step 1 is correctly represented in step 2 summary', () => {
            terrain.getTerrainTypeLabels().eq(0).should('contain', zone1.terrainType)
            terrain.getTerrainTypeLabels().eq(1).should('contain', zone2.terrainType)

            terrain.getZoneTerrainSummary().eq(0).should('contain', zone1.currentVegType).and('contain', zone1.currentDroughtIndex)
            terrain.getZoneTerrainSummary().eq(1).should('contain', zone2.currentVegType).and('contain', zone2.currentDroughtIndex)
        })
        it('changes wind direction slider value', () => {
            terrain.getWindDirectionControl().should('be.visible')
            // Set to North by default
        })
        it('changes wind speed slider value', () => {
            terrain.getWindSpeedSlider().should('be.visible').contains('10').click()
        })
        it('checks previous/next button button', () => {
            terrain.getPrevButton().should('exist').and('be.visible')
        })
        it('creates the terrain with create button', () => {
            terrain.getCreateButton().should('exist').and('be.visible').click()
        })
    })

    describe("Bottom bar", () => {
        it("adds sparks to graph and runs model", () => {
            bottomBar.getSparkButton().click({force:true})
            cy.get('canvas').click(500,700, {force:true})
            bottomBar.getSparkButton().click({force:true})
            cy.get('canvas').click(800,700, {force:true})
        })
        it("reload model and checks default conditions", () => {
            bottomBar.getStartButton().click({force:true})
            cy.wait(5000)
            bottomBar.getStartButton().click({force:true})
            bottomBar.getReloadButton().click({force:true})
        })
        it("add sparks, runs model, then restarts model", () => {
            bottomBar.getSparkButton().click({force:true})
            cy.get('canvas').click(500,700, {force:true})
            bottomBar.getSparkButton().click({force:true})
            cy.get('canvas').click(800,700, {force:true})
            bottomBar.getStartButton().click({force:true})
            cy.wait(5000)
            bottomBar.getStartButton().click({force:true})
            bottomBar.getRestartButton().click({force:true})
        })
        it("run and pause model", () => {
            bottomBar.getStartButton().click({force:true})
            cy.wait(5500)
            bottomBar.getStartButton().click({force:true})
            // Getting inconsistent time progress, check that 
            modelInfo.getModelTimeProgress().should('not.contain', '0.0')
            bottomBar.getStartButton().should('contain', 'Start')


        })
    })

})