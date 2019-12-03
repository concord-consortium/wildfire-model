import TerrainSetup from "../support/elements/TerrainSetup"
import ModelInfo from "../support/elements/ModelInfo"

context('WildFire Smoke Test', () => {

    const preset = "?preset=test01"
    const baseUrl = "https://wildfire.concord.org/branch/master/index.html"
    let url = baseUrl + preset

    let terrain = new TerrainSetup();
    let modelInfo = new ModelInfo();



    before(() => {
        cy.visit(url)
    })

    describe("Model Info", () => {
        it("verifies default model info", () => {
            modelInfo.checkModelDimensions()
            modelInfo.checkHighestPoint()
            modelInfo.checkInitialTimeElapsed()
        })
        it.skip("verifies running/restarting model will increase/restart time elapsed", () => {
            bottomBar.getStartButton().should('be.visible').click()
            modelInfo.checkTimeElapsedAfterStart()
        })
    })

    describe("Terrain setup - Adjusting Variables", () => {
        const headerText = 'Terrain Setup'
        const instructionText = 'Adjust variables in each zone'
        const zoneTotal = 2

        it('opens the terrain setup and check for header', () => {
            terrain.getTerrainSetupComponent().should('exist').and('not.be.visible')
            cy.log("Hello this is my log!!!!")
            terrain.toggleTerrainSetupComponent()
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
        it('changes zones to a new terrain type', () => {
            /**
             * check current zone background
             * assert that current checked terrain type is same as background for zone
             * Choose a new terrain type for each zone
             * Make sure background for both zones match the new terrain type for that zone
             */
        })
        it('changes vegetation type for both zones', () => {
            terrain.getVegetationSlider().should('exist').and('be.visible')
            terrain.getVegetationTypeOption('Shrub').should('be.visible').click()
            terrain.getVegetationTypeOption('Grass').should('be.visible').click()
        })
        it('changes drought index for both zones', () => {
            // [No,Mild,Medium,Severe] + _Drought
            terrain.getDroughtSlider().should('exist').and('be.visible')
            terrain.getDroughtIndexOption('Medium Drought').should('be.visible').click()
            terrain.getDroughtIndexOption('Mild Drought').should('be.visible').click()
        })
        it('clicks next page on terrain setup', () => {
            terrain.getNextButton().should('be.visible').click()
        })
    })

    describe("Terrain setup - Wind Direction and Speed", () => {
        const instructionText = 'Set initial wind direction and speed'
        const zoneTotal = 2
        const zone1 = {
            terrainType: "Plains",
            currentVegType: "Grass",
            currentDroughtIndex: "No Drought"
        }
        const zone2 = {
            terrainType: "Plains",
            currentVegType: "Forest Small Litter",
            currentDroughtIndex: "No Drought"
        }
        it('verifies new expected instructions text', () => {
            terrain.getInstructions().should('exist').and('contain', instructionText)
        })
        it.skip('verifies setup in step 1 is correctly represented in step 2 summary', () => {
            terrain.getTerrainTypeLabels().eq(0).should('contain', zone1.terrainType)
            terrain.getTerrainTypeLabels().eq(1).should('contain', zone2.terrainType)

            terrain.getZoneTerrainSummary().eq(0).should('contain', zone1.currentVegType).and('contain', zone1.currentDroughtIndex)
            terrain.getZoneTerrainSummary().eq(1).should('contain', zone2.currentVegType).and('contain', zone2.currentDroughtIndex)
        })
        it.skip('changes wind direction slider value', () => {
            // TODO
        })
        it.skip('changes wind speed slider value', () => {
            // TODO
        })
        it('checks previous/next button button', () => {
            // TODO
        })
        it('creates the terrain with create button', () => {
            // TODO
        })
    })

    describe("Bottom bar", () => {
        it("toggles precipitation", () => {
        })
        it("adds sparks to graph and runs model", () => {
        })
        it("reload model and checks default conditions", () => {
        })
        it("add sparks, runs model, then restarts model", () => {
        })
        it("run and pause model", () => {
        })
    })

})