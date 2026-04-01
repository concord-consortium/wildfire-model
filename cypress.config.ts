import { defineConfig } from 'cypress'

export default defineConfig({
  video: false,
  fixturesFolder: false,
  viewportWidth: 1400,
  viewportHeight: 1000,
  chromeWebSecurity: false,
  defaultCommandTimeout: 8000,
  e2e: {
    setupNodeEvents(on, config) {
      on('before:browser:launch', (browser, launchOptions) => {
        // Force software WebGL rendering on CI runners that lack a real GPU
        if (browser.family === 'chromium') {
          launchOptions.args.push('--use-gl=angle', '--use-angle=swiftshader');
        }
        return launchOptions;
      });
    },
    baseUrl: 'http://localhost:8080',
  },
})
