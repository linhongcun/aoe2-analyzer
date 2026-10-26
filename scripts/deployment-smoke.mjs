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
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
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
    const internalSourceText =
      /\b(?:sha(?:-?[0-9]+)?|csv|commit)\b|提交(?:号|哈希)?\s*[0-9a-f]{7,40}|\b(?:main|master)\s+[0-9a-f]{7,40}\b|src\/(?:content|data)\/|themkdemiiir\/aoe2-guide@/iu;
    for (const feature of smokeFeatures(features)) {
      if (feature === 'builds') {
        const order = JSON.parse(readFileSync(new URL('../src/data/build-orders/scouts-18.json', import.meta.url), 'utf8'));
        for (const view of ['practice', 'print']) {
          await goto(`/builds?bo=scouts-18&view=${view}`);
          const sources = page.getByRole('region', { name: '开局来源与估算限制', exact: true });
          if (view === 'print') await page.emulateMedia({ media: 'print' });
          await check(sources).toBeVisible();
          await check(sources).not.toContainText(internalSourceText);
          await check(sources).toContainText('MIT License，© 2026 Mehmet Kaan Demir');
          await check(sources).toContainText('游戏内容 © Microsoft');
          await check(sources).toContainText('中文步骤说明为本项目原创表述，未复制原文');
          for (const source of order.sources) {
            await check(sources.getByRole('link', { name: source.title, exact: true })).toHaveAttribute('href', source.url);
            await check(sources).toContainText(source.url);
            await check(sources).toContainText(source.author);
            await check(sources).toContainText(source.accessed);
          }
          await page.emulateMedia({ media: 'screen' });
        }
        console.log('Verified public build sources: practice, print, public links, dates and complete MIT attribution');
      } else if (feature === 'gameGuide') {
        const guide = JSON.parse(readFileSync(new URL('../src/content/game-guide.json', import.meta.url), 'utf8'));
        const pinned = guide.sources['pinned-techs'];
        const version = pinned.version.match(/\bDE[0-9]+\b/u)?.[0];
        assert.ok(version, 'Fixed technology citation must retain its game version');
        await goto('/game-guide?v=1&card=ages&context=standard&victory=conquest');
        const sources = page.locator('.gg-sources');
        await sources.locator('summary').click();
        await check(sources).not.toContainText(internalSourceText);
        const fixed = sources.locator('.gg-source').filter({ has: page.getByRole('link', { name: pinned.title, exact: true }) });
        await check(fixed.getByRole('link', { name: pinned.title, exact: true })).toHaveAttribute('href', pinned.url);
        await check(fixed).toContainText(version);
        await check(fixed).toContainText(pinned.checkedAt);
        console.log('Verified public game-guide sources: DE version, checked date and fixed public link');
      } else if (feature === 'patches') {
        await goto('/patches/185872');
        const summary = page.locator('.patch-tree-summary');
        await summary.locator('summary').click();
        await check(summary.getByRole('link', { name: '萨拉森', exact: true })).toHaveAttribute('href', '#/tree/Saracens');
        await check(summary.locator('a[href="#/tech/54"]').first()).toBeVisible();
        const sources = JSON.parse(readFileSync(new URL('./data_sources.json', import.meta.url), 'utf8'));
        if (sources.patch.build === 185872) {
          const presets = page.getByRole('region', { name: '骑马弩兵与骑射手预置', exact: true });
          const configurations = [
            ['castle-britons-byzantines', 'a=2700.Britons.3..&b=39.Byzantines.3..&m=1'],
            ['castle-franks-byzantines', 'a=2700.Franks.3..&b=39.Byzantines.3..&m=1'],
            ['imperial-britons-byzantines', 'a=2701.Britons.4..&b=474.Byzantines.4..&m=1'],
          ];
          await check(presets).toBeVisible();
          await check(presets.locator('[data-preset]')).toHaveCount(3);
          await check(presets.getByRole('link', { name: '打开对照', exact: true })).toHaveCount(3);
          for (const [key, query] of configurations)
            await check(presets.locator(`[data-preset="${key}"]`).getByRole('link', { name: '打开对照', exact: true })).toHaveAttribute(
              'href',
              `#/duel?${query}`,
            );
          await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: root.origin });
          const franks = presets.locator('[data-preset="castle-franks-byzantines"]');
          await franks.getByRole('button', { name: /复制对照链接/ }).click();
          await check(franks.getByRole('status')).toHaveText('对照链接已复制。');
          const copied = new URL(await page.evaluate(() => navigator.clipboard.readText()));
          assert.equal(copied.origin, root.origin);
          assert.equal(copied.pathname, new URL('duel/', root).pathname);
          assert.equal(copied.hash, '');
          assert.equal(copied.searchParams.toString(), configurations[1][1]);
          const fresh = await page.context().newPage();
          try {
            await fresh.goto(copied.href);
            for (const reload of [false, true]) {
              if (reload) await fresh.reload();
              await check(fresh.locator('#duel-res')).toBeVisible();
              assert.equal(new URL(fresh.url()).hash, `#/duel?${configurations[1][1]}`);
              await check(fresh.locator('#duel-a .duel-head')).toContainText('骑马弩兵');
              await check(fresh.locator('#duel-a .duel-head')).toContainText('法兰克');
              await check(fresh.locator('#duel-b .duel-head')).toContainText('骑射手');
              await check(fresh.locator('#duel-b .duel-head')).toContainText('拜占庭');
              for (const side of ['a', 'b']) {
                await check(fresh.locator(`#duel-${side} .duel-age`)).toHaveText('城堡时代');
                await check(fresh.locator(`#duel-${side}`).getByRole('radio', { name: '无科技', exact: true })).toHaveAttribute('aria-checked', 'true');
              }
              await check(fresh.getByRole('radio', { name: '1v1', exact: true })).toHaveAttribute('aria-checked', 'true');
            }
          } finally {
            await fresh.close();
          }
          console.log('Verified DE185872 presets: three exact links, real clipboard, stable Duel entry and refresh');
        }
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
