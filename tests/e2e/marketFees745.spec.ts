import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import effects from '../../src/data/effects.json' with { type: 'json' };
import eco from '../../src/data/eco.json' with { type: 'json' };
import { tableStyles } from './staticSweep338';

const tableGolden = JSON.parse(readFileSync('tests/e2e/fixtures/v0300-338-tables.json', 'utf8')) as Record<string, unknown[]>;

const region = (page: Page) => page.getByRole('region', { name: '交易费与进贡税', exact: true });

function hasBaseline(node: unknown, found = { yes: false }): boolean {
  if (found.yes || node === null || typeof node !== 'object') return found.yes;
  if (Array.isArray(node)) {
    for (const item of node) hasBaseline(item, found);
    return found.yes;
  }
  const record = node as { res?: unknown; op?: unknown; v?: unknown };
  if ((record.res === 78 || record.res === 46) && record.op === 'set' && record.v === 0.3) found.yes = true;
  else for (const value of Object.values(record)) hasBaseline(value, found);
  return found.yes;
}

function effectSet(name: string, res: number) {
  const tech = effects.techs[name as keyof typeof effects.techs];
  const rows = tech.eco.filter((row) => row.res === res && row.op === 'set');
  if (rows.length !== 1 || rows[0] == null) throw new Error(`${name} 资源 ${res} 形状变化`);
  return rows[0].v;
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

test('issue 745 市场页展示交易费与进贡税并链到三科技', async ({ page }) => {
  expect(effectSet('Guilds', 78)).toBe(0.15);
  expect(effectSet('Coinage', 46)).toBe(0.2);
  expect(effectSet('Banking', 46)).toBe(0);
  const saracen = eco.civEco.Saracens.find((row) => row.tech === 355 && row.source === 'bonus');
  const trade = saracen?.effects.find((effect) => effect.kind === 'res' && effect.res === 78);
  expect(trade).toMatchObject({ op: 'set', v: 0.05 });
  expect(hasBaseline(effects) || hasBaseline(eco)).toBe(false);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/building/84');
  await expect(page.locator('#building h1')).toContainText('市场');
  const note = region(page);
  await expect(note).toBeVisible();
  await expect(note.locator('[data-t="market-fee-trade"] [data-step="trade-default"] [data-field="rate"]')).toHaveText('30%');
  await expect(note.locator('[data-t="market-fee-trade"] [data-step="guilds"] [data-field="rate"]')).toHaveText('15%');
  await expect(note.locator('[data-t="market-fee-trade"] [data-step="saracens"] [data-field="rate"]')).toHaveText('5%');
  await expect(note.locator('[data-t="market-fee-tribute"] [data-step="tribute-default"] [data-field="rate"]')).toHaveText('30%');
  await expect(note.locator('[data-t="market-fee-tribute"] [data-step="coinage"] [data-field="rate"]')).toHaveText('20%');
  await expect(note.locator('[data-t="market-fee-tribute"] [data-step="banking"] [data-field="rate"]')).toHaveText('0%');
  await expect(note).toContainText('UGC #78 / #46（核对 2026-11-07）');
  await expect(note).toContainText('这不是 DE 导出');
  await expect(note).toContainText('不写买卖顺序，也不写进贡节奏');
  await expect(note).toContainText('行会把资源 78 设为 0.15');
  await expect(note).toContainText('铸币术把资源 46 设为 0.2');
  await expect(note).toContainText('银行业把资源 46 设为 0');
  await expect(note).toContainText('萨拉森市场文明奖（civEco tech 355）把资源 78 设为 0.05');
  await expect(note).toContainText('DE Update 188329 (2026-10-28)');
  await expect(note).not.toContainText('丝绸之路');
  await expect(note).not.toContainText('Grand Trunk');
  await expect(note).not.toContainText('10%');
  await expect(note).not.toContainText('套利');
  expect(tableGolden['1280 /building/84']).toEqual([]);
  expect(await tableStyles(page)).toEqual([]);

  const guilds = note.getByRole('link', { name: '行会', exact: true });
  await expect(guilds).toHaveAttribute('href', /#\/tech\/15$/);
  await expect(note.getByRole('link', { name: '铸币术', exact: true })).toHaveAttribute('href', /#\/tech\/23$/);
  await expect(note.getByRole('link', { name: '银行业', exact: true })).toHaveAttribute('href', /#\/tech\/17$/);
  await expect(note.getByRole('link', { name: '萨拉森', exact: true })).toHaveAttribute('href', /#\/civ\/Saracens$/);
  await expect(note.getByRole('link', { name: 'UGC 资源表', exact: true })).toHaveAttribute('href', 'https://ugc.aoe2.rocks/general/resources/resources/');
  await guilds.click();
  await expect(page).toHaveURL(/#\/tech\/15$/);
  await expect(page.locator('#tech h1')).toContainText('行会');
  const back = page.getByRole('link', { name: '查看市场交易费与进贡税', exact: true });
  await expect(back).toHaveAttribute('href', '#/building/84#market-fees');
  await expect(page.getByRole('link', { name: '铸币术', exact: true })).toHaveAttribute('href', /#\/tech\/23$/);
  await expect(page.getByRole('link', { name: '银行业', exact: true })).toHaveAttribute('href', /#\/tech\/17$/);
  await back.click();
  await expect(page).toHaveURL(/#\/building\/84#market-fees$/);
  await expect(page.locator('#building h1')).toContainText('市场');
  await expect(region(page)).toBeVisible();

  await page.goto('./#/tech/23');
  await expect(page.locator('#tech h1')).toContainText('铸币术');
  await expect(page.getByRole('link', { name: '查看市场交易费与进贡税', exact: true })).toHaveAttribute('href', '#/building/84#market-fees');
  await expect(page.getByRole('link', { name: '行会', exact: true })).toHaveAttribute('href', /#\/tech\/15$/);
  await page.goto('./#/tech/17');
  await expect(page.locator('#tech h1')).toContainText('银行业');
  await expect(page.getByRole('link', { name: '查看市场交易费与进贡税', exact: true })).toBeVisible();
  await page.goto('./#/tech/101');
  await expect(page.locator('#tech h1')).toContainText('封建时代');
  await expect(page.getByRole('link', { name: '查看市场交易费与进贡税', exact: true })).toHaveCount(0);

  await page.goto('./#/building/12');
  await expect(page.locator('#building h1')).toContainText('兵营');
  await expect(region(page)).toHaveCount(0);
  await expect(page.locator('[data-t="market-fees"]')).toHaveCount(0);
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'] as const) {
    test(`issue 745 四宽明暗 ${width}-${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.goto('./#/building/84#market-fees');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const target = region(page);
      await expect(target).toBeVisible();
      await expect(target.locator('[data-step="guilds"] [data-field="rate"]')).toHaveText('15%');
      await expect(target.locator('[data-step="banking"] [data-field="rate"]')).toHaveText('0%');
      await expect(target).toContainText('这不是 DE 导出');
      await expect(target).not.toContainText('10%');
      expect(await tableStyles(page)).toEqual([]);
      if (width === 360 || width === 1280) expect(tableGolden[`${width} /building/84`]).toEqual([]);
      await numbersStay(target);
      for (const link of await target.getByRole('link').all()) {
        const box = await link.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      await target.evaluate((el) => el.setAttribute('data-market-fee-audit', '745'));
      expect((await new AxeBuilder({ page }).include('[data-market-fee-audit="745"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await target.scrollIntoViewIfNeeded();
      await page.evaluate(() => {
        (document.activeElement as HTMLElement | null)?.blur();
      });
      if (theme === 'light') await target.screenshot({ path: info.outputPath(`market-fees-${width}.png`) });
      expect(errors).toEqual([]);
    });
  }
