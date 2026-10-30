const { defineConfig } = require('@playwright/test');

// Runs the real build in public/ (run `npm run build` first; `npm run test:e2e` does it for you).
module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    channel: 'chrome',
    viewport: { width: 1280, height: 900 },
  },
  webServer: {
    command: 'npx serve ../public -l 4173 --no-clipboard',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 60000,
  },
});
