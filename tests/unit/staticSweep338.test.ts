import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { expect, it } from 'vitest';
import { assertCompleteRecord, createTableFixtureWriter, staticPageFailures, staticSweepPlan, tableStyles } from '../e2e/staticSweep338';

const routes = Object.entries(JSON.parse(readFileSync('src/data/page-metadata.json', 'utf8')) as Record<string, { route?: string }>)
  .map(([key, metadata]) => metadata.route ?? key)
  .filter((route) => route !== '/about-data');

it('#338 preserves the exact original route/width/assertion-family union with one fewer 1280 cold visit', () => {
  const original = routes.flatMap((route) => [`${route}|1280|hash`, `${route}|360|table`, `${route}|1280|table`]).sort();
  const plan = staticSweepPlan(routes),
    equivalent = plan.flatMap((group) => group.routes.flatMap((route) => group.families.map((family) => `${route}|${group.width}|${family}`)));
  expect(routes).toHaveLength(957);
  expect(original).toHaveLength(2871);
  expect(equivalent.sort()).toEqual(original);
  expect(new Set(equivalent).size).toBe(original.length);
  expect(plan.flatMap((group) => group.routes)).toHaveLength(1914);
  expect(staticSweepPlan(routes, 8, true).every((group) => group.families.join() === 'table')).toBe(true);
  expect(() => staticSweepPlan([...routes, routes[0]!])).toThrow(/unique/);
});

it('#338 reports simultaneous hash leakage and changed table layout from the same expanded document', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const hash = 'a'.repeat(64);
    await page.setContent(
      `<main><h1>真实页面</h1><details open><summary>来源</summary>${hash}</details><table style="display:block"><tbody><tr><td>1</td></tr></tbody></table></main>`,
    );
    const tables = await tableStyles(page as Page);
    const failures = staticPageFailures(
      {
        route: '/market',
        width: 1280,
        text: (await page.locator('main').textContent())!,
        tables,
        expected: [{ cls: '', display: 'table', overflowX: 'visible', tr: 'table-row', td: 'table-cell' }],
      },
      (text) => [...text.matchAll(/[0-9a-f]{64}/g)].map((match) => match[0]),
    );
    expect(failures.badHashes).toHaveLength(1);
    expect(failures.badHashes[0]).toContain('/market');
    expect(failures.tableDiffs).toHaveLength(1);
    expect(failures.tableDiffs[0]).toContain('block');
  } finally {
    await browser.close();
  }
});

it('#338 refuses partial fresh recordings and complete preloaded maps without actual visits before writing', () => {
  const keys = ['360 /market', '1280 /market'],
    golden = Object.fromEntries(keys.map((key) => [key, []]));
  const writes: string[] = [],
    write = createTableFixtureWriter([{ file: 'fixture.json', keys, golden }]);
  expect(() => assertCompleteRecord(golden, new Set(), keys)).toThrow(/visits/);
  const fresh = { [keys[0]!]: [] };
  expect(() => assertCompleteRecord(fresh, new Set([keys[0]!]), keys)).toThrow();
  expect(() =>
    write(fresh, (file) => {
      writes.push(file);
    }),
  ).toThrow(/explicit owners/);
  expect(writes).toEqual([]);
  assertCompleteRecord(golden, new Set(keys), keys);
  write(golden, (file) => {
    writes.push(file);
  });
  expect(writes).toEqual(['fixture.json']);
});

it('#338 single-worker manual record mode accumulates all tests before one complete write', () => {
  const directory = mkdtempSync(join(tmpdir(), 'record338-'));
  try {
    const output = join(directory, 'golden.json');
    writeFileSync(join(directory, 'playwright.config.mjs'), 'export default {testDir:".",workers:1,reporter:"json"}');
    writeFileSync(
      join(directory, 'record.spec.ts'),
      `
      import {test} from ${JSON.stringify(resolve('node_modules/@playwright/test/index.mjs'))};
      import {assertCompleteRecord,createTableFixtureWriter,staticSweepMode} from ${JSON.stringify(resolve('tests/e2e/staticSweep338.ts'))};
      const keys=['360 /market','1280 /market'], tables={}, visits=new Set();
      test.describe('manual record',()=>{
        test.describe.configure({mode:staticSweepMode(true)});
        test.afterAll(()=>{
          assertCompleteRecord(tables,visits,keys);
          createTableFixtureWriter([{file:${JSON.stringify(output)},keys,golden:Object.fromEntries(keys.map(key=>[key,[]]))}])(tables);
        });
        for(const key of keys) test(key,()=>{tables[key]=[];visits.add(key)});
      });
    `,
    );
    const result = execFileSync(process.execPath, [resolve('node_modules/playwright/cli.js'), 'test', '--config=' + join(directory, 'playwright.config.mjs')], {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 15_000,
    });
    expect(JSON.parse(result).stats.expected).toBe(2);
    expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual({ '360 /market': [], '1280 /market': [] });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 20_000);
