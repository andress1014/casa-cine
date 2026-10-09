import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/ui', fullyParallel: false, workers: 1,
  use: { baseURL: 'http://127.0.0.1:3211', trace: 'retain-on-failure' },
  webServer: {
    command: 'node server/index.mjs', url: 'http://127.0.0.1:3211/api/session',
    env: { PORT: '3211', HOST: '127.0.0.1', DATA_DIR: process.env.CASACINE_TEST_DATA_DIR || './artifacts/ui-data', HOUSE_CODE: '', DISCOVERY: 'off' },
    reuseExistingServer: false,
  },
});
