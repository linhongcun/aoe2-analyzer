import { defineConfig } from '@playwright/test';
const BASE = process.env.BASE_URL ?? 'http://localhost:4173/';
export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: BASE, viewport: { width: 1280, height: 900 } },
  webServer: process.env.BASE_URL ? undefined : { command: 'npx vite preview --port 4173 --strictPort', url: BASE, reuseExistingServer: false },
});
