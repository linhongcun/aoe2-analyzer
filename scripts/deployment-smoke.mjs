/** Short build/deployment checks; detailed interactions and four widths run once in CI. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, expect } from '@playwright/test';

const check = expect.configure({ timeout: 10_000 });
export function assertFooter(actual, expected) {
  assert.match(expected.commit, /^[0-9a-f]{40}$/);
  assert.equal(actual.version?.trim(), expected.version, 'Published version differs from the intended build');
  const build = actual.build?.match(/[0-9a-f]{7,40}/)?.[0];
  assert.ok(build && expected.commit.startsWith(build), 'Published build must identify the exact main commit');
}
export function smokeFeatures(features) {
  assert.ok(Array.isArray(features) && features.every((x) => typeof x === 'string'), 'Invalid feature smoke plan');
  return [...new Set(features.includes('all') ? ['units', 'simulator', ...features.filter((x) => x !== 'all')] : features)].sort();
}
export async function checkSite({ site, version, commit, features = [] }) {
  const root = new URL(site);
  assert.ok(['http:', 'https:'].includes(root.protocol), 'Smoke checks need an HTTP site');
  const browser = await chromium.launch();
  const errors = [];
  const visited = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const observe = (opened) => {
      opened.on('pageerror', (error) => errors.push(error.message));
      opened.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
    };
    observe(page);
    page.context().on('page', observe);
    const goto = async (route) => {
      const url = new URL(root);
      url.searchParams.set('_deployment_check', String(Date.now()));
      url.hash = route;
      await page.goto(url.href);
      await check(page.locator('[data-t="footer-app-version"]').first()).toBeVisible();
      assertFooter(
        {
          version: await page.locator('[data-t="footer-app-version"]').first().textContent(),
          build: await page.locator('[data-t="footer-build"]').first().textContent(),
        },
        { version, commit },
      );
      await check(page.locator('main h1, main h2').first()).toBeVisible();
      visited.push(route);
    };
    await goto('/');
    const metadata = JSON.parse(readFileSync(new URL('../src/data/page-metadata.json', import.meta.url), 'utf8'));
    for (const feature of smokeFeatures(features)) {
      if (feature === 'patches') {
        await goto('/patches/185872');
        const summary = page.locator('.patch-tree-summary');
        await summary.locator('summary').click();
        await check(summary.getByRole('link', { name: '萨拉森', exact: true })).toHaveAttribute('href', '#/tree/Saracens');
        await check(summary.locator('a[href="#/tech/54"]').first()).toBeVisible();
      } else if (feature === 'matchup') {
        await goto('/matchup');
        await check(page.locator('#mres')).toBeVisible();
        for (const [id, civ] of [
          ['ma', 'Franks'],
          ['me', 'Britons'],
        ]) {
          await page.locator(`#${id}`).click();
          await page.locator(`.cp-panel [data-civ="${civ}"]`).click();
        }
        await page.getByRole('link', { name: '骑士：用法兰克模拟', exact: true }).click();
        await check(page.locator('#simciv')).toHaveAttribute('data-value', 'Franks');
        await check(page.locator('#simage')).toHaveValue('4');
        await check(page.locator('#sim input[type="checkbox"]:checked')).toHaveCount(0);
      } else if (feature === 'simulator' || feature === 'simRoute') {
        await goto('/unit/38/Franks/4/?tab=sim');
        await check(page.locator('#simciv')).toHaveAttribute('data-value', 'Franks');
      } else if (feature === 'compare') {
        await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: root.origin });
        await goto('/compare?a=Mapuche&b=Muisca');
        await check(page.locator('#ca')).toHaveAttribute('data-value', 'Mapuche');
        await page.locator('#ca').click();
        await page.getByRole('dialog', { name: '文明 A', exact: true }).locator('[role="option"][data-civ="Franks"]').click();
        await page.getByRole('button', { name: '复制链接', exact: true }).click();
        await check(page.locator('#compare .detail-copy [role="status"]')).toHaveText('链接已复制');
        const copied = new URL(await page.evaluate(() => navigator.clipboard.readText()));
        assert.equal(copied.origin, root.origin);
        assert.equal(copied.pathname, new URL('compare/', root).pathname);
        assert.equal(copied.hash, '');
        assert.equal(copied.searchParams.get('a'), 'Franks');
        assert.equal(copied.searchParams.get('b'), 'Muisca');
        const fresh = await page.context().newPage();
        try {
          await fresh.goto(copied.href);
          await check(fresh.locator('#ca')).toHaveAttribute('data-value', 'Franks');
          await check(fresh.locator('#cb')).toHaveAttribute('data-value', 'Muisca');
          await fresh.reload();
          await check(fresh.locator('#ca')).toHaveAttribute('data-value', 'Franks');
          await check(fresh.locator('#cb')).toHaveAttribute('data-value', 'Muisca');
        } finally {
          await fresh.close();
        }
      } else {
        const route = '/' + feature.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
        if (metadata[route]) {
          await goto(route);
          if (feature === 'units') await check(page.locator('a[href^="#/unit/"]').first()).toBeVisible();
          if (feature === 'civs') await check(page.locator('#grid .card').first()).toBeVisible();
        }
      }
      assert.deepEqual(errors, [], 'Deployment smoke found browser errors');
    }
    assert.deepEqual(errors, [], 'Deployment smoke found browser errors');
    console.log(`Verified ${version} / ${commit.slice(0, 7)}: ${visited.join(', ')}`);
    return visited;
  } finally {
    await browser.close();
  }
}
async function main() {
  const position = process.argv.indexOf('--site');
  const site = position >= 0 ? process.argv[position + 1] : 'https://linhongcun.github.io/aoe2-analyzer/';
  const planPosition = process.argv.indexOf('--plan');
  const path = planPosition >= 0 ? process.argv[planPosition + 1] : process.env.CI_PLAN_PATH;
  const raw = path ? JSON.parse(readFileSync(path, 'utf8')) : { features: [] };
  const plan = raw.plan ?? raw;
  await checkSite({
    site,
    version: process.env.RELEASE_VERSION || `v${JSON.parse(readFileSync('package.json', 'utf8')).version}`,
    commit: process.env.EXPECTED_DEPLOYED_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    features: plan.features,
  });
}
if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
