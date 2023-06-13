
import { TerrainSetup } from "../support/elements/TerrainSetup";
import { BottomBar } from "../support/elements/BottomBar";
import { ModelInfo } from "../support/elements/ModelInfo";

context("Forest Fire Smoke Test", () => {
  const terrain = new TerrainSetup();
  const bottomBar = new BottomBar();
  const modelInfo = new ModelInfo();

  beforeEach(() => {
    // zonesCount=3 will disable the first panel of terrain setup dialog that is not handled by this test
    cy.visit("/?zonesCount=3");
  });

  describe("Terrain setup - Adjusting Variables", () => {
    const headerText = "Terrain Setup";
    const instructionText1 = "Adjust variables in each zone";
    const zoneTotal = 3;

    // Commented out code shows leftovers of the Cypress v8 version of this test.
    // Update to Cypress v12 broke it, as it's no longer possible to maintain state between tests.
    it("terrain setup smoke test", () => {
      terrain.getTerrainSetupComponent().should("exist").and("not.be.visible");
      bottomBar.getTerrainSetupButton().click();
      terrain.getTerrainSetupComponent().should("be.visible");
      terrain.getTerrainHeader().should("be.visible").and("contain", headerText);
    // });
    // it('verifies expected instructions text', () => {
      terrain.getInstructions().should("exist").and("contain", instructionText1);
    // });
    // it('checks for three zones and zone labels', () => {
      terrain.getAllZones().should("have.length", zoneTotal);
      terrain.getZone("1").within(() => {
        terrain.getZoneLabel().contains("Zone 1");
      });
      terrain.getZone("2").within(() => {
        terrain.getZoneLabel().contains("Zone 2");
      });
      terrain.getZone("3").within(() => {
        terrain.getZoneLabel().contains("Zone 3");
      });
    // });
    // it('changes vegetation type', () => {
      terrain.getVegetationSlider().should("exist").and("be.visible");
      terrain.setVegetationTypeOption("Shrub");
    // });
    // it('changes drought index', () => {
      // [No,Mild,Medium,Severe] + _Drought
      terrain.getDroughtSlider().should("exist").and("be.visible");
      terrain.setDroughtIndexOption("Medium Drought");
    // });
    //it('clicks next page on terrain setup', () => {
      terrain.getNextButton().should("be.visible").click();
    // });
  // });

  // describe("Terrain setup - Wind Direction and Speed", () => {
    const instructionText2 = "Set initial wind direction and speed";
    const zone1 = {
      terrainType: "Mountains",
      currentVegType: "Shrub",
      currentDroughtIndex: "Medium Drought"
    };
    const zone2 = {
      terrainType: "Foothills",
      currentVegType: "Shrub",
      currentDroughtIndex: "Mild Drought"
    };
    // it('verifies new expected instructions text', () => {
      terrain.getInstructions().should("exist").and("contain", instructionText2);
    // });
    // it('verifies setup in step 1 is correctly represented in step 2 summary', () => {
      terrain.getTerrainTypeLabels().eq(0).should("contain", zone1.terrainType);
      terrain.getTerrainTypeLabels().eq(1).should("contain", zone2.terrainType);

      terrain.getZoneTerrainSummary().eq(0).should("contain", zone1.currentVegType).and("contain", zone1.currentDroughtIndex);
      terrain.getZoneTerrainSummary().eq(1).should("contain", zone2.currentVegType).and("contain", zone2.currentDroughtIndex);
    // });
    // it('changes wind direction slider value', () => {
      terrain.getWindDirectionControl().should("be.visible");
      // Set to North by default
    // });
    // it('changes wind speed slider value', () => {
      terrain.getWindSpeedSlider().should("be.visible").contains("10").click();
    // });
    // it('checks previous/next button button', () => {
      terrain.getPrevButton().should("exist").and("be.visible");
    // });
    // it('creates the terrain with create button', () => {
      terrain.getCreateButton().should("exist").and("be.visible").click();
    });
  });

  describe("Bottom bar", () => {
    it("adds sparks to graph and runs model", () => {
      bottomBar.getSparkButton().click({ force: true });
      cy.get(".app--mainContent--__forestfire-v1__ canvas").click(500, 700, { force: true });
      bottomBar.getSparkButton().click({ force: true });
      cy.get(".app--mainContent--__forestfire-v1__ canvas").click(800, 600, { force: true });
      bottomBar.getStartButton().should("contain", "Start");
      modelInfo.getModelTimeProgress().should("contain", "0 days");
      modelInfo.getModelTimeProgress().should("contain", "0 hours");

      bottomBar.getStartButton().click({ force: true });
      cy.wait(3000);
      bottomBar.getStartButton().should("contain", "Stop");
      modelInfo.getModelTimeProgress().should("not.contain", "0 hours");
    });
    it("restarts mode", () => {
      bottomBar.getRestartButton().click({ force: true });
      bottomBar.getStartButton().should("contain", "Start");
      modelInfo.getModelTimeProgress().should("contain", "0 hours");
    });
  });
});
