/* global console, process, localStorage, document, scrollTo, requestAnimationFrame, innerWidth */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { chromium } from '@playwright/test';

const captureScriptSha256 = createHash('sha256')
  .update(fs.readFileSync(fileURLToPath(import.meta.url)))
  .digest('hex');
const [site, output, expectedBuild, expectedVersion, mode = 'all'] = process.argv.slice(2);
assert.ok(site && output && /^[0-9a-f]{7,40}$/.test(expectedBuild) && /^v\d+\.\d+\.\d+$/.test(expectedVersion));
assert.ok(['all', 'sample'].includes(mode), 'Choose all or sample explicitly');
assert.ok(['http:', 'https:'].includes(new URL(site).protocol), 'Serve the built site over HTTP');
assert.ok(!fs.existsSync(output) || fs.readdirSync(output).length === 0, 'Use a new empty capture directory; never mix or overwrite evidence');
fs.mkdirSync(output, { recursive: true });
const sides = 'a=569.Franks.4.f.&b=359.Japanese.4.f.';
const base = [
  ['one', sides + '&m=1&be=1'],
  ['group', sides + '&m=n&na=10&nb=8&be=1'],
  ['resource', 'a=359.Byzantines.4.f.&b=569.Franks.4.f.&m=r&bud=3000'],
  ['time', sides + '&m=t&vil=10&min=10'],
  ['unavailable', 'a=569.Britons.4.f.&b=359.Japanese.4.f.&m=1'],
  ['both-unavailable', 'a=569.Britons.4.f.&b=569.Japanese.4.f.&m=1'],
  ['upgrade', 'a=38.Byzantines.3.67.&b=38.Byzantines.3..&m=1&base=38.Byzantines.3..&fixed=38.Byzantines.3..&basev=185872'],
  ['varangian', 'a=2704.Varangians.4.f.&b=567.Teutons.4.f.&m=1'],
];
let cases = base.flatMap(([id, q]) =>
  [false, true].map((expanded) => ({
    id: id + (expanded ? '-expanded' : '-default'),
    route: '/duel?' + q,
    scope: '#duel',
    expanded,
    ready: id.includes('unavailable') ? '#duel-pending' : '#duel-res',
  })),
);
for (const [id, q] of [
  ['cost-applied', 'a=359.Byzantines.4.f.&b=569.Franks.4.f.&m=r&bud=3000'],
  ['cost-unsupported', 'a=24.Koreans.3.c.&b=569.Franks.4.f.&m=r&bud=3000'],
  ['cost-research', 'a=441.Magyars.4.f.&b=359.Japanese.4.f.&m=r&bud=3000'],
  ['time-basis', sides + '&m=t&vil=10&min=10'],
])
  cases.push({
    id,
    route: '/duel?' + q,
    scope: '#duel',
    expanded: true,
    ready: '#duel-res',
    popup: id === 'time-basis' ? '#duel-a [data-t="rc-basis-btn"]' : '#duel-a [data-t="pk-src-btn"]',
  });
cases.push({ id: 'unit-sim', route: '/unit/38/Franks/4/?tab=sim', scope: 'main', ready: '#sim' });
cases.push({ id: 'building-sim', route: '/building/82?tab=sim&civ=Britons&age=4', scope: 'main', ready: '#sim' });
cases.push({ id: 'unit-basis', route: '/unit/38', scope: 'main', ready: '[data-t="rc-uline"]', popup: '[data-t="rc-basis-btn"]' });
if (mode === 'sample')
  cases = cases.filter((c) => ['one-default', 'one-expanded', 'cost-applied', 'time-basis', 'unit-sim', 'building-sim', 'unit-basis'].includes(c.id));
const configs = mode === 'sample' ? [[390, 'light']] : [360, 375, 390, 1280].flatMap((w) => ['light', 'dark'].map((t) => [w, t]));
const browser = await chromium.launch();
const records = [];
try {
  for (const [width, theme] of configs) {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      deviceScaleFactor: 1,
      colorScheme: theme,
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    });
    await context.addInitScript((v) => localStorage.setItem('aoe2-theme', v), theme);
    for (const c of cases) {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      await page.goto(new URL('#' + c.route, site).href, { waitUntil: 'networkidle' });
      await page.locator(c.ready).first().waitFor({ state: 'visible' });
      await page.evaluate(() => document.fonts.ready);
      if (c.expanded)
        await page.locator(c.scope + ' details').evaluateAll((es) =>
          es.forEach((e) => {
            e.open = true;
          }),
        );
      if (c.popup) await page.locator(c.popup).first().click();
      await page.evaluate(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await document.fonts.ready;
      });
      assert.equal(await page.locator('[data-t="footer-app-version"]').count(), 1);
      assert.equal(await page.locator('[data-t="footer-build"]').count(), 1);
      const footer = {
        version: (await page.locator('[data-t="footer-app-version"]').first().textContent()).trim(),
        build: (await page.locator('[data-t="footer-build"]').first().textContent()).match(/[0-9a-f]{7,40}/)?.[0],
      };
      assert.equal(footer.version, expectedVersion);
      assert.ok(footer.build && expectedBuild.startsWith(footer.build));
      await page.locator('[data-t="footer-app-version"]').evaluateAll((es) =>
        es.forEach((e) => {
          e.textContent = 'VERSION';
        }),
      );
      await page.locator('[data-t="footer-build"]').evaluateAll((es) =>
        es.forEach((e) => {
          e.textContent = 'BUILD';
        }),
      );
      await page.evaluate(() => {
        scrollTo(0, 0);
        return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow: ' + c.id);
      assert.deepEqual(errors, [], 'Browser errors: ' + c.id);
      const name = c.id + '-' + width + '-' + theme + '.png';
      const bytes = await page.screenshot({ path: path.join(output, name), fullPage: true, animations: 'disabled', caret: 'hide' });
      assert.deepEqual(errors, [], 'Browser errors after capture: ' + c.id);
      const headings = await page
        .locator(c.scope + ' :is(h1,h2,h3,h4,h5,h6)')
        .evaluateAll((es) => es.filter((e) => e.checkVisibility()).map((e) => ({ tag: e.tagName, text: e.textContent.trim() })));
      records.push({
        id: c.id,
        width,
        theme,
        file: name,
        route: c.route,
        canonicalHash: new URL(page.url()).hash,
        footer,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        headings,
      });
      await page.close();
    }
    await context.close();
    console.log(`Captured ${cases.length} pages at ${width}px ${theme}`);
  }
  const report = {
    schema: 1,
    mode,
    caseIds: cases.map((c) => c.id),
    configurations: configs.map(([width, theme]) => ({ width, theme })),
    browserVersion: browser.version(),
    captureScriptSha256,
    site,
    expectedBuild,
    expectedVersion,
    viewportHeight: 900,
    deviceScaleFactor: 1,
    normalizations: ['[data-t="footer-app-version"] textContent=VERSION', '[data-t="footer-build"] textContent=BUILD'],
    records,
  };
  fs.writeFileSync(path.join(output, 'capture.json'), JSON.stringify(report, null, 2));
  console.log('Captured ' + records.length + ' deterministic full pages from ' + expectedVersion + '/' + expectedBuild);
} finally {
  await browser.close();
}
