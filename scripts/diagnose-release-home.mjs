import fs from 'node:fs';
import { chromium, expect } from '@playwright/test';
import { assertFooter } from './deployment-smoke.mjs';

fs.mkdirSync('test-results', { recursive: true });
const browser = await chromium.launch();
const results = [];
try {
  for (let index = 0; index < 3; index++) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const observed = { index, console: [], pageerrors: [], failures: [], responses: [], navigations: [] };
    page.on('console', (message) => { if (message.type() === 'error') observed.console.push(message.text()); });
    page.on('pageerror', (error) => observed.pageerrors.push(error.stack ?? error.message));
    page.on('requestfailed', (request) => observed.failures.push({ url: request.url(), failure: request.failure() }));
    page.on('response', (response) => {
      if (response.status() >= 400 || /\.js(?:\?|$)/.test(response.url())) observed.responses.push({ url: response.url(), status: response.status() });
    });
    page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) observed.navigations.push(frame.url()); });
    const url = new URL('https://linhongcun.github.io/aoe2-analyzer/');
    url.searchParams.set('_deployment_check', String(Date.now()));
    url.hash = '/';
    try {
      await page.goto(url.href);
      const versionNode = page.locator('[data-t="footer-app-version"]').first();
      await expect(versionNode).toBeVisible({ timeout: 15_000 });
      const version = await versionNode.textContent();
      const build = await page.locator('[data-t="footer-build"]').first().textContent();
      assertFooter({ version, build }, { version: 'v0.74.3', commit: 'd4ddf4f068cb0feff545d70099a5269ee73d72aa' });
      await expect(page.locator('#home h1')).toHaveText('开一局');
      observed.footer = { version, build };
      observed.ok = true;
    } catch (error) {
      observed.ok = false;
      observed.error = String(error.stack ?? error);
    }
    observed.url = page.url();
    observed.body = await page.locator('body').innerText().catch(() => '<unavailable>');
    await page.screenshot({ path: `test-results/production-home-${index}.png`, fullPage: true }).catch(() => {});
    fs.writeFileSync(`test-results/production-home-${index}.html`, await page.content().catch(() => '<unavailable>'));
    results.push(observed);
    console.log(JSON.stringify(observed));
    await context.close();
  }
} finally {
  fs.writeFileSync('test-results/production-home-diagnostics.json', JSON.stringify(results, null, 2));
  await browser.close();
}
if (results.some((result) => !result.ok || result.pageerrors.length || result.failures.length || result.console.length)) process.exitCode = 1;
