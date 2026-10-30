const { defineConfig } = require('@playwright/test');

// Runs the real build in public/ (run `npm run build` first; `npm run test:e2e` does it for you).
module.exports = defineConfig({
  testDir: './e2e',
  // Needs internet and Google's popup; run separately with `npm run test:network`.
  testIgnore: '**/csp-real.spec.js',
  timeout: 30000,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    channel: 'chrome',
    viewport: { width: 1280, height: 900 },
    // The service worker would answer requests before the test stubs can, so it is off unless a test turns it on
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'node helpers/static-server.js 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 60000,
  },
});

