import { defineConfig } from 'cypress'

export default defineConfig({
  video: false,
  fixturesFolder: false,
  viewportWidth: 1400,
  viewportHeight: 1000,
  chromeWebSecurity: false,
  defaultCommandTimeout: 8000,
  e2e: {
    setupNodeEvents(on, config) {},
    baseUrl: 'http://localhost:8080',
  },
})
