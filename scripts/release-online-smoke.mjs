// Runs only in the Release workflow against the deployed website, never in the normal local test suite.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium, expect } from '@playwright/test';

const site = new URL('https://linhongcun.github.io/aoe2-analyzer/');
const version = process.env.RELEASE_VERSION;
const sha = process.env.EXPECTED_DEPLOYED_SHA;
assert.match(version ?? '', /^v\d+\.\d+\.\d+$/);
assert.match(sha ?? '', /^[0-9a-f]{40}$/);
const check = expect.configure({ timeout: 15_000 });
const browser = await chromium.launch();
const errors = [];
let page;
try {
  const context = await browser.newContext();
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: site.origin });
  context.on('page', (opened) => {
    opened.on('pageerror', (error) => errors.push(error.message));
    opened.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
  });
  page = await context.newPage();
  const url = new URL(site);
  url.searchParams.set('_release_check', String(Date.now()));
  url.hash = '/compare?a=Mapuche&b=Muisca';
  await page.goto(url.href);
  await check(page.locator('[data-t="footer-app-version"]').first()).toHaveText(version);
  const footer = await page.locator('[data-t="footer-build"]').first().textContent();
  const build = footer?.match(/[0-9a-f]{7,40}/)?.[0];
  assert.ok(build && sha.startsWith(build), 'Published footer must identify the successful main deployment');
  await check(page.locator('#ca')).toHaveAttribute('data-value', 'Mapuche');
  await check(page.locator('#cb')).toHaveAttribute('data-value', 'Muisca');
  await page.locator('#ca').click();
  await page.getByRole('dialog', { name: '文明 A', exact: true }).locator('[role="option"][data-civ="Franks"]').click();
  await check(page.locator('#ca')).toHaveAttribute('data-value', 'Franks');
  await check(page.locator('#cb')).toHaveAttribute('data-value', 'Muisca');
  const selected = new URLSearchParams(new URL(page.url()).hash.split('?')[1]);
  assert.equal(selected.get('a'), 'Franks');
  assert.equal(selected.get('b'), 'Muisca');
  await page.getByRole('button', { name: '复制链接', exact: true }).click();
  await check(page.locator('#compare .detail-copy [role="status"]')).toHaveText('链接已复制');
  const copied = new URL(await page.evaluate(() => navigator.clipboard.readText()));
  assert.equal(copied.origin, site.origin);
  assert.equal(copied.pathname, new URL('compare/', site).pathname);
  assert.equal(copied.hash, '');
  assert.equal(copied.searchParams.get('a'), 'Franks');
  assert.equal(copied.searchParams.get('b'), 'Muisca');
  const fresh = await context.newPage();
  await fresh.goto(copied.href);
  await check(fresh.locator('#ca')).toHaveAttribute('data-value', 'Franks');
  await check(fresh.locator('#cb')).toHaveAttribute('data-value', 'Muisca');
  await fresh.reload();
  await check(fresh.locator('#ca')).toHaveAttribute('data-value', 'Franks');
  await check(fresh.locator('#cb')).toHaveAttribute('data-value', 'Muisca');
  assert.deepEqual(errors, [], 'Published Compare must have no browser errors');
  console.log(`Verified live ${version} at ${build}: Compare direct link, changed selection, real clipboard and static refresh`);
} finally {
  if (page) {
    mkdirSync('test-results', { recursive: true });
    await page.screenshot({ path: 'test-results/release-compare-smoke.png', fullPage: true }).catch(() => {});
  }
  await browser.close();
}
