import { defineConfig } from '@playwright/test';
// @ts-expect-error Browser infrastructure scripts are plain Node modules
import { historicalBaseURL, needsHistoricalServer } from './scripts/historical-ui.mjs';
const BASE = process.env.BASE_URL ?? 'http://localhost:4173/';
const HISTORICAL = historicalBaseURL();
if (['127.0.0.1', 'localhost', '[::1]'].includes(new URL(BASE).hostname) && new URL(BASE).port === new URL(HISTORICAL).port)
  throw new Error('Current and historical browser subjects need distinct ports');
export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: BASE, viewport: { width: 1280, height: 900 } },
  webServer: [
    ...(process.env.BASE_URL ? [] : [{ command: 'npx vite preview --port 4173 --strictPort', url: BASE, reuseExistingServer: false }]),
    ...(needsHistoricalServer()
      ? [{ command: 'node scripts/historical-ui.mjs --serve', url: HISTORICAL, reuseExistingServer: false, timeout: 120_000, stdout: 'pipe' as const }]
      : []),
  ],
});
