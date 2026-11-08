import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

export type TableStyle = { cls: string; display: string; overflowX: string; tr: string | null; td: string | null };
type FixtureGroup = { file: string; keys: string[]; golden: Record<string, TableStyle[]> };

export function explicitTableKeyOwners(groups: FixtureGroup[]) {
  const owners = new Map<string, string>();
  for (const group of groups) {
    assert.deepEqual(Object.keys(group.golden).sort(), [...group.keys].sort(), `Table fixture keys must match explicit owners: ${group.file}`);
    for (const key of group.keys) {
      assert.ok(!owners.has(key), `Table fixture ownership overlaps: ${key}`);
      assert.ok(Array.isArray(group.golden[key]), `Missing explicit table expectation: ${key}`);
      owners.set(key, group.file);
    }
  }
  return owners;
}

export function createTableFixtureWriter(groups: FixtureGroup[]) {
  const owners = explicitTableKeyOwners(groups);
  return (tables: Record<string, TableStyle[]>, write: (file: string, text: string) => void = writeFileSync) => {
    assert.deepEqual(
      Object.keys(tables).sort(),
      [...owners.keys()].sort(),
      'Recorded table keys must match explicit owners; missing or unassigned records are rejected',
    );
    for (const key of owners.keys()) assert.ok(Array.isArray(tables[key]), `Missing explicit recorded table value: ${key}`);
    for (const group of groups) write(group.file, JSON.stringify(Object.fromEntries(group.keys.map((key) => [key, tables[key]])), null, 1) + '\n');
  };
}

/** Both widths retain their own cold visits; only the 1280 hash read shares a visit. */
export function staticSweepPlan(routes: string[], groups = 8, record = false) {
  assert.ok(routes.length && new Set(routes).size === routes.length, 'Static route list must be nonempty and unique');
  assert.ok(Number.isSafeInteger(groups) && groups > 0, 'Invalid static sweep grouping');
  return [360, 1280].flatMap((width) =>
    Array.from({ length: groups }, (_, group) => ({
      width,
      group,
      routes: routes.filter((_, index) => index % groups === group),
      families: width === 1280 && !record ? ['table', 'hash'] : ['table'],
    })),
  );
}

export const staticSweepMode = (record: boolean) => (record ? ('default' as const) : ('parallel' as const));

export async function coldStaticPage(page: Page, route: string, ready: (page: Page, route: string) => Promise<void>) {
  await page.goto('about:blank');
  await page.goto(`./#${route}`, { waitUntil: 'networkidle' });
  await expect(page.locator('main')).not.toBeEmpty();
  await expect(page.locator('main h1,main h2').first()).toBeVisible();
  if (route.startsWith('/builds?bo=') && !new URLSearchParams(route.split('?')[1]).has('view')) await expect(page.locator('main h1.tl-title')).toHaveText(/\S/);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await ready(page, route);
}

export async function tableStyles(page: Page): Promise<TableStyle[]> {
  return page.locator('main table').evaluateAll((tables) =>
    tables.map((t) => {
      const tr = t.querySelector('tbody tr') ?? t.querySelector('tr');
      const td = tr?.querySelector('td, th') ?? null;
      const cs = getComputedStyle(t);
      return {
        cls: t.className,
        display: cs.display,
        overflowX: cs.overflowX,
        tr: tr ? getComputedStyle(tr).display : null,
        td: td ? getComputedStyle(td).display : null,
      };
    }),
  );
}

/** Collect both independent assertion families before either is reported. */
export function staticPageFailures(
  observation: { route: string; width: number; text: string; tables: TableStyle[]; expected: TableStyle[] },
  findHashes: (text: string) => string[],
) {
  const { route, width, text, tables, expected } = observation;
  const hashes = width === 1280 ? findHashes(text) : [];
  return {
    badHashes: hashes.length ? [`#${route}：${hashes.map((h) => h.slice(0, 16) + '…').join('、')}`] : [],
    tableDiffs: JSON.stringify(tables) === JSON.stringify(expected) ? [] : [`#${route}：main ${JSON.stringify(expected)} → 现在 ${JSON.stringify(tables)}`],
  };
}

export function assertCompleteRecord(tables: Record<string, TableStyle[]>, seen: Set<string>, expected: string[]) {
  assert.deepEqual([...seen].sort(), [...expected].sort(), 'Recorded visits must cover every explicit table owner');
  assert.deepEqual(Object.keys(tables).sort(), [...expected].sort(), 'Recorded table keys must match explicit owners');
  for (const key of expected) assert.ok(Array.isArray(tables[key]), `Missing explicit recorded table value: ${key}`);
}
