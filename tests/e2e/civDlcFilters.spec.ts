import { expect, test, type Page } from '@playwright/test';
import civs from '../../src/data/civs.json' with { type: 'json' };
import { CIV_DLC, DLCS } from '../../src/domain/dlc';

const errors = new WeakMap<Page, string[]>();
const releaseCivs = (index: number) => civs.filter((civ) => CIV_DLC[civ.en] === index).map((civ) => civ.en);

test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', (error) => messages.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') messages.push(message.text());
  });
});

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors.get(page)).toEqual([]);
});

async function expectCivs(page: Page, names: string[]) {
  await expect(page.locator('#grid .card')).toHaveCount(names.length);
  await expect(page.locator('#grid .card .cdl, #grid .card .dlcb, #grid .card img[src*="/img/dlc/"]')).toHaveCount(0);
  await expect
    .poll(() => page.locator('#grid .card').evaluateAll((cards) => cards.map((card) => card.getAttribute('data-civ')).sort()))
    .toEqual([...names].sort());
  await expect(page.locator('#cnt')).toHaveText(`${names.length} / ${civs.length}`);
}

test('所属版本下拉按文明首发筛选，不表示账号拥有', async ({ page }) => {
  await page.goto('./#/civs');
  await expectCivs(
    page,
    civs.map((civ) => civ.en),
  );
  await page.getByRole('button', { name: '按条件筛选', exact: true }).click();
  const dlc = page.locator('#dlc');
  await expect(dlc.getByRole('option')).toHaveCount(DLCS.length + 1);
  await expect(page.getByText('按文明首发版本分类，不代表账号已拥有的内容。')).toBeVisible();
  for (const [index, item] of DLCS.entries()) {
    await dlc.selectOption(String(index));
    await expect(page.getByRole('button', { name: `移除 DLC ${item.zh}`, exact: true })).toBeVisible();
    await expectCivs(page, releaseCivs(index));
  }
  await page.getByRole('button', { name: '重置全部', exact: true }).click();
  await expect(dlc).toHaveValue('');
  await expectCivs(
    page,
    civs.map((civ) => civ.en),
  );
});

test('分享链接里的位置参数不参与列表，名称类型版本和单位仍取交集', async ({ page }) => {
  await page.goto('./#/civs?q=%E6%B3%95%E5%85%B0%E5%85%8B&ty=cav&pos=fl&dlc=0');
  await expect(page.locator('#grid .card')).toHaveCount(1);
  await expect(page.locator('#grid .card')).toHaveAttribute('data-civ', 'Franks');
  await expect(page.getByText('边位')).toHaveCount(0);
  await page.getByRole('button', { name: '按条件筛选', exact: true }).click();
  await expect(page.locator('#pos')).toHaveCount(0);
  await page.locator('#option-search').fill('骑士');
  await page.getByRole('checkbox', { name: '添加单位 骑士', exact: true }).check();
  await expect(page.locator('#grid .card')).toHaveAttribute('data-civ', 'Franks');
  const params = new URLSearchParams(new URL(page.url()).hash.split('?')[1]);
  expect(params.get('pos')).toBeNull();
  expect(params.get('req')).toBe('u:38');
  expect(params.get('dlc')).toBe('0');
});
