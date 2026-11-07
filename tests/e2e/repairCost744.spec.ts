import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import effects from '../../src/data/effects.json' with { type: 'json' };
import eco from '../../src/data/eco.json' with { type: 'json' };
import { tableStyles } from './staticSweep338';

const tableGolden = JSON.parse(readFileSync('tests/e2e/fixtures/v0300-338-tables.json', 'utf8')) as Record<string, unknown[]>;

const region = (page: Page) => page.getByRole('region', { name: '修复费用', exact: true });

function repairHits(node: unknown, hits: { res?: unknown; op?: unknown; v?: unknown }[] = []): { res?: unknown; op?: unknown; v?: unknown }[] {
  if (node === null || typeof node !== 'object') return hits;
  if (Array.isArray(node)) {
    for (const item of node) repairHits(item, hits);
    return hits;
  }
  const record = node as { res?: unknown; op?: unknown; v?: unknown };
  if (record.res === 270 || record.res === 271) hits.push(record);
  for (const value of Object.values(record)) repairHits(value, hits);
  return hits;
}

async function numbersStay(scope: Locator) {
  const tokens = await scope.evaluate((root) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const found: { text: string; lines: number }[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      for (const match of (node.textContent ?? '').matchAll(/\d+(?:\.\d+)?/g)) {
        const range = document.createRange();
        range.setStart(node, match.index ?? 0);
        range.setEnd(node, (match.index ?? 0) + match[0].length);
        found.push({ text: match[0], lines: range.getClientRects().length });
      }
    }
    return found;
  });
  expect(tokens.length).toBeGreaterThan(0);
  for (const token of tokens) expect(token.lines, `${token.text}不应拆行`).toBe(1);
}

test('issue 744 建筑页说明修复费用，村民和格鲁吉亚页链过来', async ({ page }) => {
  const ecoHits = repairHits(eco);
  const effectHits = repairHits(effects);
  expect(ecoHits).toEqual([{ kind: 'res', label: null, op: 'mul', res: 271, v: 0.75 }]);
  expect(effectHits).toEqual([{ res: 271, name: '资源271', op: 'mul', v: 0.75 }]);
  const team = effects.civs.Georgians.team.eco.find((row) => row.res === 271);
  expect(team).toMatchObject({ op: 'mul', v: 0.75 });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/building/109');
  await expect(page.locator('#building h1')).toContainText('城镇中心');
  const note = region(page);
  await expect(note).toBeVisible();
  await expect(note.locator('[data-step="unit"] [data-field="res"]')).toHaveText('270');
  await expect(note.locator('[data-step="building"] [data-field="res"]')).toHaveText('271');
  await expect(note.locator('[data-step="georgians"] [data-field="mul"]')).toHaveText('×0.75');
  await expect(note.locator('[data-step="tc-gate"] [data-field="limit"]')).toHaveText('待确认');
  await expect(note.locator('[data-step="rate"] [data-field="limit"]')).toHaveText('待确认');
  await expect(note).toContainText('核对 2026-11-07');
  await expect(note).toContainText('这不是 DE 导出的基准比例');
  await expect(note).toContainText('格鲁吉亚团队加成把资源 271 乘以 0.75');
  await expect(note).toContainText('DE Update 188329 (2026-10-28)');
  await expect(note).toContainText('城镇中心、城门复合体倍率待确认');
  await expect(note).toContainText('固定每分钟修复量待确认');
  await expect(note).toContainText('不估算要花多少资源');
  await expect(note).not.toContainText('一半');
  await expect(note).not.toContainText('50%');
  expect(tableGolden['1280 /building/109']).toEqual([]);
  expect(await tableStyles(page)).toEqual([]);

  await expect(note.getByRole('link', { name: '格鲁吉亚', exact: true })).toHaveAttribute('href', /#\/civ\/Georgians$/);
  await expect(note.getByRole('link', { name: 'UGC 资源表', exact: true })).toHaveAttribute('href', 'https://ugc.aoe2.rocks/general/resources/resources/');

  await page.goto('./#/building/12');
  await expect(page.locator('#building h1')).toContainText('兵营');
  await expect(region(page).locator('[data-step="georgians"] [data-field="mul"]')).toHaveText('×0.75');

  await page.goto('./#/unit/83');
  await expect(page.locator('#unit h1')).toContainText('村民');
  const villagerLink = page.getByRole('link', { name: '查看修复费用', exact: true });
  await expect(villagerLink).toHaveAttribute('href', '#/building/109#repair-cost');
  await villagerLink.click();
  await expect(page).toHaveURL(/#\/building\/109#repair-cost$/);
  await expect(page.locator('#building h1')).toContainText('城镇中心');
  await expect(region(page)).toBeVisible();

  await page.goto('./#/unit/4');
  await expect(page.locator('#unit h1')).toContainText('步弓手');
  await expect(page.getByRole('link', { name: '查看修复费用', exact: true })).toHaveCount(0);
  await expect(region(page)).toHaveCount(0);

  await page.goto('./#/civ/Georgians');
  await expect(page.locator('#detail h1')).toContainText('格鲁吉亚');
  const civLink = page.getByRole('link', { name: '查看建筑修复费用', exact: true });
  await expect(civLink).toHaveAttribute('href', '#/building/109#repair-cost');
  expect(tableGolden['1280 /civ/Georgians']).toEqual([]);
  expect(await tableStyles(page)).toEqual([]);
  await civLink.click();
  await expect(page).toHaveURL(/#\/building\/109#repair-cost$/);
  await expect(region(page).locator('[data-step="tc-gate"] [data-field="limit"]')).toHaveText('待确认');

  await page.goto('./#/civ/Franks');
  await expect(page.locator('#detail h1')).toContainText('法兰克');
  await expect(page.getByRole('link', { name: '查看建筑修复费用', exact: true })).toHaveCount(0);
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'] as const) {
    test(`issue 744 四宽明暗 ${width}-${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.goto('./#/building/109#repair-cost');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const target = region(page);
      await expect(target).toBeVisible();
      await expect(target.locator('[data-step="unit"] [data-field="res"]')).toHaveText('270');
      await expect(target.locator('[data-step="georgians"] [data-field="mul"]')).toHaveText('×0.75');
      await expect(target.locator('[data-step="rate"] [data-field="limit"]')).toHaveText('待确认');
      await expect(target).toContainText('这不是 DE 导出的基准比例');
      await expect(target).not.toContainText('50%');
      expect(await tableStyles(page)).toEqual([]);
      if (width === 360 || width === 1280) expect(tableGolden[`${width} /building/109`]).toEqual([]);
      await numbersStay(target);
      for (const link of await target.getByRole('link').all()) {
        const box = await link.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      await target.evaluate((el) => el.setAttribute('data-repair-audit', '744'));
      expect((await new AxeBuilder({ page }).include('[data-repair-audit="744"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await target.scrollIntoViewIfNeeded();
      await page.evaluate(() => {
        (document.activeElement as HTMLElement | null)?.blur();
      });
      if (theme === 'light') await target.screenshot({ path: info.outputPath(`repair-cost-${width}.png`) });
      expect(errors).toEqual([]);
    });
  }
