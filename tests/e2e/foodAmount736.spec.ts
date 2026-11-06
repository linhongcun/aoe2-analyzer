import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import eco from '../../src/data/eco.json' with { type: 'json' };
import { tableStyles } from './staticSweep338';

const tableGolden = JSON.parse(readFileSync('tests/e2e/fixtures/v0300-338-tables.json', 'utf8')) as Record<string, unknown[]>;

const farmRegion = (page: Page) => page.getByRole('region', { name: '食物总量', exact: true });

function resAdd(id: '12' | '13' | '14') {
  const tech = eco.ecoTechs[id];
  const effects = tech.effects.filter((effect) => effect.kind === 'res' && effect.res === 36 && effect.op === 'add');
  if (effects.length !== 1 || effects[0] == null) throw new Error(`ecoTechs ${id} 资源 36 形状变化`);
  return effects[0].v;
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

test('issue 736 PC1280 农田与养鱼场展示可核验食物总量', async ({ page }) => {
  expect(resAdd('14')).toBe(75);
  expect(resAdd('13')).toBe(125);
  expect(resAdd('12')).toBe(175);
  const malay = eco.civEco.Malay.find((row) => row.tech === 637);
  const malayFood = malay?.effects.find((effect) => effect.kind === 'res' && effect.res === 88);
  expect(malayFood).toMatchObject({ op: 'set', v: 2130 });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/building/50');
  await expect(page.locator('#building h1')).toContainText('农田');
  const farm = farmRegion(page);
  await expect(farm).toBeVisible();
  await expect(farm).toContainText('已有农田提供的食物数量较少');
  await expect(farm).toContainText('不做补种或配田');
  await expect(farm).toContainText('civEco.Chinese 没有导出这条起始行');
  await expect(farm).toContainText('DE Update 188329 (2026-10-28)');
  await expect(farm.locator('[data-t="farm-food-generic"] [data-step="base"] [data-field="total"]')).toHaveText('175');
  await expect(farm.locator('[data-t="farm-food-generic"] [data-step="14"] [data-field="total"]')).toHaveText('250');
  await expect(farm.locator('[data-t="farm-food-generic"] [data-step="14"] [data-field="add"]')).toHaveText('+75');
  await expect(farm.locator('[data-t="farm-food-generic"] [data-step="13"] [data-field="total"]')).toHaveText('375');
  await expect(farm.locator('[data-t="farm-food-generic"] [data-step="13"] [data-field="add"]')).toHaveText('+125');
  await expect(farm.locator('[data-t="farm-food-generic"] [data-step="12"] [data-field="total"]')).toHaveText('550');
  await expect(farm.locator('[data-t="farm-food-generic"] [data-step="12"] [data-field="add"]')).toHaveText('+175');
  await expect(farm.locator('[data-t="farm-food-chinese"] [data-step="base"] [data-field="total"]')).toHaveText('220');
  await expect(farm.locator('[data-t="farm-food-chinese"] [data-step="14"] [data-field="total"]')).toHaveText('295');
  await expect(farm.locator('[data-t="farm-food-chinese"] [data-step="13"] [data-field="total"]')).toHaveText('420');
  await expect(farm.locator('[data-t="farm-food-chinese"] [data-step="12"] [data-field="total"]')).toHaveText('595');
  await expect(farm).not.toContainText('715');
  expect(tableGolden['1280 /building/50']).toEqual([]);
  expect(await tableStyles(page)).toEqual([]);
  const horse = farm.getByRole('link', { name: '马轭', exact: true });
  await expect(horse).toHaveAttribute('href', /#\/tech\/14$/);
  await expect(farm.getByRole('link', { name: '重犁', exact: true })).toHaveAttribute('href', /#\/tech\/13$/);
  await expect(farm.getByRole('link', { name: '轮作', exact: true })).toHaveAttribute('href', /#\/tech\/12$/);
  await expect(farm.getByRole('link', { name: '持续生产', exact: true })).toHaveAttribute('href', /#\/production$/);
  await expect(farm.getByRole('link', { name: 'UGC 资源表', exact: true })).toHaveAttribute('href', 'https://ugc.aoe2.rocks/general/resources/resources/');
  await horse.click();
  await expect(page).toHaveURL(/#\/tech\/14$/);
  await expect(page.locator('#tech h1')).toContainText('马轭');
  await expect(page.locator('#tech')).toContainText('新农田提供的食物');
  await expect(page.locator('#tech')).toContainText('现有农田提供的食物数量较少');

  await page.goto('./#/building/199');
  await expect(page.locator('#building h1')).toContainText('养鱼场');
  const trap = farmRegion(page);
  await expect(trap.locator('[data-step="base"] [data-field="total"]')).toHaveText('710');
  await expect(trap.locator('[data-step="malay"] [data-field="total"]')).toHaveText('2130');
  await expect(trap).toContainText('3 倍');
  await expect(trap).toContainText('civEco.Malay');
  await expect(trap).not.toContainText('715');
  expect(tableGolden['1280 /building/199']).toEqual([]);
  expect(await tableStyles(page)).toEqual([]);
  await expect(trap.getByRole('link', { name: '马来', exact: true })).toHaveAttribute('href', /#\/civ\/Malay$/);

  await page.goto('./#/building/68');
  await expect(page.locator('#building h1')).toContainText('磨坊');
  await expect(farmRegion(page)).toHaveCount(0);
  await page.goto('./#/building/12');
  await expect(page.locator('#building h1')).toContainText('兵营');
  await expect(page.locator('[data-t="farm-food"]')).toHaveCount(0);
  await expect(page.locator('[data-t="fish-trap-food"]')).toHaveCount(0);
});

for (const id of [50, 199])
  for (const width of [360, 375, 390, 1280])
    for (const theme of ['light', 'dark'] as const) {
      test(`issue 736 四宽明暗 ${id}-${width}-${theme}`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 900 });
        await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (message) => {
          if (message.type() === 'error') errors.push(message.text());
        });
        await page.goto(`./#/building/${id}`);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        const target = farmRegion(page);
        await expect(target).toBeVisible();
        if (id === 50) {
          await expect(target.locator('[data-t="farm-food-generic"] [data-step="12"] [data-field="total"]')).toHaveText('550');
          await expect(target).toContainText('已有农田提供的食物数量较少');
        } else {
          await expect(target.locator('[data-step="base"] [data-field="total"]')).toHaveText('710');
          await expect(target).not.toContainText('715');
        }
        expect(await tableStyles(page)).toEqual([]);
        if (width === 360 || width === 1280) expect(tableGolden[`${width} /building/${id}`]).toEqual([]);
        await numbersStay(target);
        for (const link of await target.getByRole('link').all()) {
          const box = await link.boundingBox();
          expect(box!.width).toBeGreaterThanOrEqual(44);
          expect(box!.height).toBeGreaterThanOrEqual(44);
        }
        await target.evaluate((el) => el.setAttribute('data-food-amount-audit', '736'));
        expect((await new AxeBuilder({ page }).include('[data-food-amount-audit="736"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.evaluate(() => {
          (document.activeElement as HTMLElement | null)?.blur();
          window.scrollTo(0, 0);
        });
        await page.screenshot({ path: info.outputPath(`food-amount-${id}-${width}-${theme}.png`), fullPage: true });
        expect(errors).toEqual([]);
      });
    }
