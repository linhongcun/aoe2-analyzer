import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import ts from 'typescript';
import { PLAYER_CATALOG } from './players488Catalog';
import { playerPath } from '../../src/domain/playerCatalog.mjs';

// Read literal route metadata with the same TypeScript AST approach as page_metadata.mjs.
const source = ts.createSourceFile('pageRegistry.ts', readFileSync('src/shared/nav/pageRegistry.ts', 'utf8'), ts.ScriptTarget.Latest, true);
const PAGES: { key: string; path: string; kind: string }[] = [];
function visit(node: ts.Node) {
  if (ts.isObjectLiteralExpression(node)) {
    const fields = Object.fromEntries(
      node.properties.flatMap((property) =>
        ts.isPropertyAssignment(property) && ts.isStringLiteral(property.initializer) ? [[property.name.getText(source), property.initializer.text]] : [],
      ),
    );
    if (fields.key && fields.path && fields.kind) PAGES.push({ key: fields.key, path: fields.path, kind: fields.kind });
  }
  ts.forEachChild(node, visit);
}
visit(source);

const BASELINE_CONSTRUCTION_RAW = 2_600_907;
const WARNING_RAW = 1_200_000;
// ad58e7b 冷加载实测 1_802_000。洞察槽在文明/单位分包，不进施工页；施工图本身此前已是 1_801_965。
const CONSTRUCTION_RAW = 1_802_000;
if (PLAYER_CATALOG.status !== 'ready' || !PLAYER_CATALOG.catalog.players[0]) throw new Error('A real player cold-load sample is required');
const detailSamples: Record<string, string> = {
  'player-detail': playerPath(PLAYER_CATALOG.catalog.players[0]),
  'civ-detail': '/civ/Franks',
  'civ-bonus': '/civ/Franks/bonus/0',
  'unit-detail': '/unit/4',
  'tech-detail': '/tech/22',
  'tree-civ': '/tree/Franks',
  'building-detail': '/building/109',
  'glossary-term': '/glossary/maa',
  'patches-note': '/patches/185872',
};
// Keep the registry authoritative. An unrepresented dynamic route fails visibly.
const routes = PAGES.filter((entry) => entry.kind !== 'redirect').map((entry) => {
  const route = /[:*]/.test(entry.path) ? detailSamples[entry.key] : entry.path;
  if (!route) throw new Error('Missing cold-load sample for ' + entry.key);
  return { key: entry.key, route };
});

for (const { key, route } of routes) {
  test(`#282 cold JS budget: ${key}`, async ({ browser, baseURL }, testInfo) => {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    // Routing disables the browser HTTP cache, independently of context reuse.
    await context.route('**/*', (request) => request.continue());
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    const pending: Promise<void>[] = [];
    const responses: { url: string; bytes: number }[] = [];
    page.on('response', (response) => {
      const url = new URL(response.url());
      if (url.origin !== new URL(baseURL!).origin || !url.pathname.endsWith('.js')) return;
      pending.push(
        (async () => {
          expect(response.ok(), response.url()).toBe(true);
          responses.push({ url: url.pathname, bytes: (await response.body()).length });
        })(),
      );
    });
    try {
      await page.goto(new URL('./#' + route, baseURL).href);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('main').getByRole('heading').first()).toBeVisible();
      await expect(page.getByRole('heading', { name: /找不到该页|不存在|未找到/ })).toHaveCount(0);
      await expect(page.getByText('加载中…', { exact: true })).toHaveCount(0);
      expect(errors).toEqual([]);
      await Promise.all(pending);
      const bytes = responses.reduce((total, response) => total + response.bytes, 0);
      expect(bytes).toBeGreaterThan(0);
      const reportPath = testInfo.outputPath('cold-js-raw-bytes.json');
      await writeFile(reportPath, JSON.stringify({ route, bytes, warning: WARNING_RAW, responses }, null, 2));
      await testInfo.attach('cold-js-raw-bytes', { path: reportPath, contentType: 'application/json' });
      console.log(`[JS budget] ${route}: ${bytes} raw bytes`);
      if (bytes > WARNING_RAW) {
        console.warn(`[JS budget warning] ${route}: ${bytes} raw bytes > ${WARNING_RAW}`);
        testInfo.annotations.push({ type: 'JS budget warning', description: `${route}: ${bytes} raw bytes > ${WARNING_RAW}` });
      }
      if (key === 'construction') {
        expect(bytes).toBeLessThanOrEqual(CONSTRUCTION_RAW);
        expect(bytes).toBeLessThanOrEqual(BASELINE_CONSTRUCTION_RAW * 0.7);
      }
    } finally {
      await context.close();
    }
  });
}
