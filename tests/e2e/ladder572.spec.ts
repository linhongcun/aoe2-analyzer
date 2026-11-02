import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { LadderCivStat, LadderSnapshot } from '../../src/domain/ladder';

const snapshot = (file: string) => JSON.parse(readFileSync(`src/data/${file}`, 'utf8')) as LadderSnapshot;
const slices = [
  { key: 'team', url: './#/ladder', data: snapshot('ladder-4v4-rm-e1200-1400-90d.json'), interval: true },
  { key: 'arabia', url: './#/ladder?mode=arabia1v1', data: snapshot('ladder-arabia-p185872.json'), interval: false },
] as const;

async function openTable(page: Page, url: string) {
  await page.goto(url);
  await expect(page.getByTestId('ladder-table')).toBeVisible();
}

async function expectMethods(page: Page, interval: boolean) {
  const note = page.getByRole('note', { name: '统计口径', exact: true });
  await expect(note).toContainText('胜率、出场率按快照原值展示');
  await expect(note).toContainText('技能校正数据未收录');
  await expect(note).toContainText('玩家出场人次，不是完整对局数');
  if (interval) await expect(note).toContainText('95% 区间来自快照提供的 Wilson 置信区间');
  else await expect(note).toContainText('本快照未收录置信区间，不作估算');
  await expect(page.getByTestId('ladder-page')).not.toContainText('被选中的对局占比');
  await expect(page.getByRole('button', { name: /Raw|技能校正/ })).toHaveCount(0);
  await expect(page.getByRole('switch', { name: /Raw|技能校正/ })).toHaveCount(0);
  return note;
}

for (const slice of slices) {
  test(`#572 ${slice.key} 统计口径明确源字段、样本人次和未收录校正`, async ({ page }) => {
    await openTable(page, slice.url);
    await expectMethods(page, slice.interval);
  });
}

function checkPercent(text: string | undefined, expected: number) {
  const value = text?.trim() ?? '';
  expect(value).toMatch(/^\d+\.\d{2}%$/);
  expect(Math.abs(Number(value.slice(0, -1)) - expected)).toBeLessThanOrEqual(0.005 + 1e-9);
}

test('#572 表内数字保持原字段精度，出场率与出场数分别按数字排序', async ({ page }) => {
  for (const slice of slices) {
    await openTable(page, slice.url);
    const table = page.getByTestId('ladder-table');
    const headings = (await table.locator('thead th').allInnerTexts()).map((text) => text.replace(/\s/g, ''));
    const values = await table.locator('tbody tr[data-testid^="ladder-row-"]').evaluateAll((rows) =>
      rows.map((row) => ({
        en: row.getAttribute('data-testid')!.replace('ladder-row-', ''),
        cells: [...row.querySelectorAll('td')].map((cell) => cell.textContent ?? ''),
      })),
    );
    const source = slice.data.brackets[0]!.civs;
    expect(values.length).toBe(source.length);
    expect(slice.data.sample?.unit).toBe('player');
    await expect(page.getByTestId('ladder-source')).toContainText('人次');
    const winIndex = headings.indexOf('胜率');
    const pickIndex = headings.indexOf('出场率');
    const sampleIndex = headings.indexOf('出场');
    const intervalIndex = headings.indexOf('95%区间');
    expect(Math.min(winIndex, pickIndex, sampleIndex)).toBeGreaterThanOrEqual(0);
    for (const row of values) {
      const raw = source.find((stat) => stat.en === row.en)!;
      checkPercent(row.cells[winIndex], raw.winRate);
      checkPercent(row.cells[pickIndex], raw.playRate);
      expect(Number(row.cells[sampleIndex]?.replace(/[^\d]/g, ''))).toBe(raw.games);
      if (slice.interval) {
        expect(intervalIndex).toBeGreaterThanOrEqual(0);
        const [low, high] = (row.cells[intervalIndex] ?? '').split('–');
        checkPercent(low, raw.ci95Low!);
        checkPercent(high, raw.ci95High!);
      } else expect(intervalIndex).toBe(-1);
    }
    for (const [key, field] of [
      ['play', 'playRate'],
      ['games', 'games'],
    ] as const) {
      for (const direction of ['desc', 'asc'] as const) {
        await page.getByTestId(`ladder-sort-${key}`).click();
        const ens = await table
          .locator('tbody tr[data-testid^="ladder-row-"]')
          .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-testid')!.replace('ladder-row-', '')));
        const actual = ens.map((en) => source.find((row) => row.en === en)![field]);
        const expected = source.map((row) => row[field]).sort((a, b) => (direction === 'asc' ? a - b : b - a));
        expect(actual).toEqual(expected);
      }
    }
  }
});

test('#572 隐藏低样本与缺档空态保持，不借用另一档的统计', async ({ page }) => {
  for (const slice of slices) {
    await openTable(page, slice.url);
    const source: readonly LadderCivStat[] = slice.data.brackets[0]!.civs;
    const floor = slice.data.lowSampleGames ?? 300;
    const rows = page.getByTestId('ladder-table').locator('tbody tr[data-testid^="ladder-row-"]');
    await expect(rows).toHaveCount(source.filter((row) => row.games >= floor).length);
    await page.getByTestId('ladder-hide-low').uncheck();
    await expect(rows).toHaveCount(source.length);
    await page.getByTestId('ladder-hide-low').check();
    await expect(rows).toHaveCount(source.filter((row) => row.games >= floor).length);
  }
  for (const url of ['./#/ladder?mode=4v4&elo=1900%2B', './#/ladder?mode=arabia1v1&elo=1200-1400']) {
    await page.goto(url);
    await expect(page.getByTestId('ladder-empty')).toContainText('没有这一模式和 Elo 的快照');
    await expect(page.getByTestId('ladder-table')).toHaveCount(0);
    await expect(page.getByRole('note', { name: '统计口径', exact: true })).toHaveCount(0);
  }
});

for (const theme of ['light', 'dark']) {
  for (const width of [360, 375, 390, 1280]) {
    test(`#572 ${theme} @${width} 两模式说明可读且无溢出`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      for (const slice of slices) {
        await openTable(page, slice.url);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        const note = await expectMethods(page, slice.interval);
        await note.scrollIntoViewIfNeeded();
        const bounds = await note.boundingBox();
        expect(bounds?.x ?? -1).toBeGreaterThanOrEqual(0);
        expect(bounds?.width ?? 0).toBeLessThanOrEqual(width);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(await note.evaluate((node) => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(12);
        await expect(page.getByTestId('ladder-page')).not.toContainText(/NaN|Infinity/);
        if (width === 1280) {
          expect((await new AxeBuilder({ page }).include('[data-testid="ladder-page"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
        }
        await page.screenshot({ path: testInfo.outputPath(`ladder572-${slice.key}-${theme}-${width}.png`) });
      }
      expect(errors).toEqual([]);
    });
  }
}
