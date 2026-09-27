import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:4318', headless: true },
  webServer: { command: 'node test/support/website-server.mjs', url: 'http://localhost:4318', reuseExistingServer: false },
});
