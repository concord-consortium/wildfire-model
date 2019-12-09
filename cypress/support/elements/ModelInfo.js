let preset = {
    modelDimensions: ['120000', '80000'],
    highestPoint: '20000',
    initialTimeElapsed: '0.0'
}

class ModelInfo {

    checkModelDimensions() {
        return cy.get('.app--modelInfo--__wildfire-v1__').children().eq(0).should('contain', preset.modelDimensions[0]).and('contain', preset.modelDimensions[1])
    }
    checkHighestPoint() {
        return cy.get('.app--modelInfo--__wildfire-v1__').children().eq(1).should('contain', preset.highestPoint)
    }
    checkInitialTimeElapsed() {
        return cy.get('.app--modelInfo--__wildfire-v1__').children().eq(2).should('contain', preset.initialTimeElapsed)
    }
    checkTimeElapsedAfterStart() {
        return cy.get('.app--modelInfo--__wildfire-v1__').children().eq(2).should('not.contain', preset.initialTimeElapsed)
    }
    getModelTimeProgress() {
        return cy.get('.app--timeDisplay--__wildfire-v1__')
    }

} export default ModelInfo;