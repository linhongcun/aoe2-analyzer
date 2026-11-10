import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const fixture = 'tests/e2e/fixtures/v0300-338-tables-team-fit.json';
const expectedKeys = ['1280 /team-fit', '360 /team-fit'];
// The protected whole-site spec is intentionally outside PR capped. Keep its
// complete ownership contract visible here, without widening browser scope.
test('#558 静态页两宽必须由显式四组夹具完整且不重叠地拥有', () => {
  const files = [
    'tests/e2e/fixtures/v0300-338-tables.json',
    'tests/e2e/fixtures/v0300-338-tables-188329.json',
    'tests/e2e/fixtures/v0300-338-tables-ladder.json',
    fixture,
  ];
  const owners = new Set<string>();
  for (const file of files) {
    const values = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    for (const [key, styles] of Object.entries(values)) {
      expect(Array.isArray(styles), `Explicit table array required: ${file} / ${key}`).toBe(true);
      expect(owners.has(key), `Table fixture ownership overlaps: ${key}`).toBe(false);
      owners.add(key);
    }
  }
  const metadata = JSON.parse(readFileSync('src/data/page-metadata.json', 'utf8')) as Record<string, { route?: string }>;
  const routes = Object.entries(metadata)
    .map(([key, value]) => value.route ?? key)
    .filter((route) => route !== '/about-data');
  expect([...owners].sort()).toEqual([360, 1280].flatMap((width) => routes.map((route) => `${width} ${route}`)).sort());
});

for (const width of [360, 1280]) {
  test(`#558 静态页表格夹具必须来自真正就绪的空配置 @${width}`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./#/team-fit', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { level: 1, name: '文明搭配', exact: true })).toBeVisible();
    await expect(page.locator('.tf-loading,.tf-error')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '你的候选：选择候选文明', exact: true })).toBeEnabled();
    await expect(page.getByTestId('team-fit-mates')).toContainText('0 / 3');
    await expect(page.getByRole('button', { name: '复制搭配链接', exact: true })).toBeDisabled();
    await expect(page.getByTestId('team-fit-results')).toHaveCount(0);
    const tables = await page.locator('main table').evaluateAll((elements) =>
      elements.map((table) => {
        const tr = table.querySelector('tbody tr') ?? table.querySelector('tr');
        const td = tr?.querySelector('td, th') ?? null;
        const style = getComputedStyle(table);
        return {
          cls: table.className,
          display: style.display,
          overflowX: style.overflowX,
          tr: tr ? getComputedStyle(tr).display : null,
          td: td ? getComputedStyle(td).display : null,
        };
      }),
    );
    const observed = {
      width,
      url: page.url(),
      version: await page.locator('[data-t="footer-app-version"]').first().textContent(),
      build: await page.locator('[data-t="footer-build"]').first().textContent(),
      ready: true,
      tables,
    };
    const path = testInfo.outputPath(`team-fit-tables-${width}.json`);
    writeFileSync(path, JSON.stringify(observed, null, 2));
    await testInfo.attach(`team-fit-tables-${width}.json`, { path, contentType: 'application/json' });
    expect(errors).toEqual([]);
    expect(existsSync(fixture), 'The new route needs its own explicit table fixture owner').toBe(true);
    const golden = JSON.parse(readFileSync(fixture, 'utf8')) as Record<string, unknown[]>;
    expect(Object.keys(golden).sort()).toEqual(expectedKeys);
    expect(tables).toEqual(golden[`${width} /team-fit`]);
  });
}
