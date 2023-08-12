
import { TerrainSetup } from "../support/elements/TerrainSetup";
import { BottomBar } from "../support/elements/BottomBar";
import { ModelInfo } from "../support/elements/ModelInfo";

  const terrain = new TerrainSetup();
  const bottomBar = new BottomBar();
  const modelInfo = new ModelInfo();

context("Test First Page In Terrain Setup", () => {

  beforeEach(() => {
    cy.visit("");
  });

  describe("First page display in terrain setup", () => {
    it("Create 3 zone setup using first page display", () => {
      bottomBar.getTerrainSetupButton().click();
      terrain.getTerrainSetupComponent().should("be.visible");
      terrain.getTerrainHeader().should("be.visible").and("contain", "Terrain Setup");
      terrain.getStepIcon().should("exist").and("contain", "1");
      terrain.getInstructions().should("exist").and("contain", "Select the number of zones in your model");
      terrain.getThreeZoneSetup("exist");
      terrain.getTwoZoneSetup("exist");
      terrain.verifyRadioButtonChecked(0);
      terrain.verifyRadioButtonUnchecked(1);
      terrain.getPrevButton().should("not.exist")
      terrain.getNextButton().should("be.visible").click();
      terrain.getStepIcon().should("exist").and("contain", "2");
      terrain.getInstructions().should("exist").and("contain", "Adjust variables in each zone");
      terrain.getAllZones().should("have.length", "3");
      terrain.getNextButton().should("be.visible").click();
      terrain.getCreateButton().should("exist").and("be.visible").click();
      modelInfo.getZoneInfo().should("have.length", "3");
      modelInfo.getZoneName(0).should("contain", "Zone 1");
      modelInfo.getZoneName(1).should("contain", "Zone 2");
      modelInfo.getZoneName(2).should("contain", "Zone 3");
      bottomBar.getSparkCount().should("contain", "3");
      bottomBar.getTerrainSetupButton().find('[data-name="3-zone Terrain Setup"]').should("exist");
      bottomBar.getTerrainSetupButton().find('[data-name="Terrain Setup"]').should("not.exist");
    });
    it("Create 2 zone setup using first page display", () => {
      bottomBar.getTerrainSetupButton().click();
      terrain.getTerrainSetupComponent().should("be.visible");
      terrain.getTerrainHeader().should("be.visible").and("contain", "Terrain Setup");
      terrain.getRadioButton(1).click();
      terrain.verifyRadioButtonChecked(1);
      terrain.verifyRadioButtonUnchecked(0);
      terrain.getNextButton().should("be.visible").click();
      terrain.getAllZones().should("have.length", "2");
      terrain.getNextButton().should("be.visible").click();
      terrain.getCreateButton().should("exist").and("be.visible").click();
      modelInfo.getZoneInfo().should("have.length", "2");
      modelInfo.getZoneName(0).should("contain", "Zone 1");
      modelInfo.getZoneName(1).should("contain", "Zone 2");
      bottomBar.getSparkCount().should("contain", "2");
      bottomBar.getTerrainSetupButton().find('[data-name="3-zone Terrain Setup"]').should("not.exist");
      bottomBar.getTerrainSetupButton().find('[data-name="Terrain Setup"]').should("exist");
    });
  });
});

context("Test First Page In Terrain Setup Not displayed for URL param ?zonesCount=2", () => {

  before(() => {
    cy.visit("/?zonesCount=2");
  });

  describe("First page not display in terrain setup", () => {
    it("2 zone setup", () => {
      bottomBar.getTerrainSetupButton().click();
      terrain.getTerrainSetupComponent().should("be.visible");
      terrain.getZoneCountSelector().should("not.exist");
      terrain.getStepIcon().should("exist").and("contain", "1");
      terrain.getInstructions().should("exist").and("contain", "Adjust variables in each zone");
      terrain.getAllZones().should("have.length", "2");
    });
  });
});

context("Test First Page In Terrain Setup Not displayed for URL param ?zonesCount=3", () => {

  before(() => {
    cy.visit("/?zonesCount=3");
  });

  describe("First page not display in terrain setup", () => {
    it("3 zone setup", () => {
      bottomBar.getTerrainSetupButton().click();
      terrain.getTerrainSetupComponent().should("be.visible");
      terrain.getZoneCountSelector().should("not.exist");
      terrain.getStepIcon().should("exist").and("contain", "1");
      terrain.getInstructions().should("exist").and("contain", "Adjust variables in each zone");
      terrain.getAllZones().should("have.length", "3");
    });
  });
});
