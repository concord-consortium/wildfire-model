export class ModelInfo {
  getModelTimeProgress() {
    return cy.get(".app--timeDisplay--__wildfire-v1__");
  }
  getZoneInfo() {
    return cy.get("[data-testid=zone-info]");
  }
  getZoneName(index) {
    return this.getZoneInfo().eq(index).find(".simulation-info--zoneName--__wildfire-v1__");
  }
}
