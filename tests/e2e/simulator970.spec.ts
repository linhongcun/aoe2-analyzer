import { expect, test, type Locator, type Page } from '@playwright/test';
import unitsRaw from '../../src/data/units.json' with { type: 'json' };

const units = unitsRaw as unknown as { id: number; en: string; zh: string; py: string; cost: Record<string, number> }[];
const byId = Object.fromEntries(units.map((unit) => [unit.id, unit]));

async function theme(page: Page, value: 'light' | 'dark') {
  await page.addInitScript((next) => localStorage.setItem('aoe2-theme', next), value);
}

async function chooseCiv(page: Page, en: string) {
  await page.locator('#sciv').click();
  const dialog = page.getByRole('dialog', { name: '可用文明', exact: true });
  await dialog.getByRole('combobox').fill(en);
  await dialog.locator(`[role="option"][data-civ="${en}"]`).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#sciv')).toHaveAttribute('data-value', en);
}

async function countPair(page: Page) {
  const text = await page.locator('#scnt').innerText();
  const [shown, all] = text.split(' / ').map(Number);
  return { shown, all };
}

async function hit(locator: Locator, label: string) {
  const box = await locator.boundingBox();
  expect(box, label).toBeTruthy();
  expect(box!.width, `${label} 宽`).toBeGreaterThanOrEqual(44);
  expect(box!.height, `${label} 高`).toBeGreaterThanOrEqual(44);
}

test('#970 1280：筛选行目录、运行时计数和目录造价', async ({ page }) => {
  await theme(page, 'light');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/simulator');
  await expect(page.getByRole('heading', { level: 1, name: '科技模拟器', exact: true })).toHaveCount(1);
  await expect(page.getByText('选择一个单位，再选择文明与科技，查看属性变化与累计研究费用')).toBeVisible();
  await expect(page.locator('#sq')).toHaveAttribute('placeholder', '搜索单位（中文、英文、拼音或别名）');
  await expect(page.locator('#sciv')).toHaveAttribute('aria-label', '可用文明：全部文明');
  await expect(page.locator('#srole')).toBeVisible();
  await expect(page.getByRole('group', { name: '时代快捷筛选' })).toBeVisible();
  await expect(page.locator('.sim-head')).toContainText('单位');
  await expect(page.locator('.sim-head')).toContainText('生产 / 时代');
  await expect(page.locator('.sim-head')).toContainText('造价');
  await expect(page.locator('.sim-head')).not.toContainText('生命');
  await expect(page.locator('#simhub [data-stat], #simhub .unit-stats')).toHaveCount(0);
  await expect(page.getByLabel('资料片')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '独特单位', exact: true })).toHaveCount(0);
  await expect(page.locator('#simhub .ucard, #simhub #ugrid')).toHaveCount(0);
  await expect(page.locator('.sim-cost-basis')).toHaveText('造价为目录基础值，不是该文明折后训练价。');
  await expect(page.locator('.catalog-filter-panel').getByText('造价为目录基础值，不是该文明折后训练价。')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/simulator$/);

  const initial = await countPair(page);
  expect(initial.shown).toBe(initial.all);
  expect(initial.all).toBe(await page.locator('#simhub .sim-row').count());
  expect(initial.all).toBeGreaterThan(100);
  const firstId = await page.locator('#simhub .sim-row').first().getAttribute('data-unit-id');
  await expect(page.locator('#simhub .sim-row').first()).toHaveAttribute('href', `#/unit/${firstId}?tab=sim`);

  const chariot = byId[1962]!;
  await page.locator('#sq').fill('战车');
  const chariotRow = page.locator('#simhub .sim-row[data-unit-id="1962"]');
  await expect(chariotRow.locator('.sim-prod')).toHaveText('攻城武器厂 · 城堡时代');
  await expect(chariotRow.locator('.sim-cost')).toContainText(String(chariot.cost.Food));
  await expect(chariotRow.locator('.sim-cost')).toContainText(String(chariot.cost.Gold));
  const searched = await countPair(page);
  expect(searched.all).toBe(initial.all);
  expect(searched.shown).toBe(await page.locator('#simhub .sim-row').count());
  expect(searched.shown).toBeLessThan(initial.all);
  await expect(page).toHaveURL(/#\/simulator$/);

  await page.locator('#sq').fill(chariot.en);
  await expect(chariotRow).toBeVisible();
  await page.locator('#sq').fill(chariot.py);
  await expect(chariotRow).toBeVisible();
  await page.locator('#sq').fill('圣骑士');
  await expect(page.locator('#simhub .sim-row')).toHaveAttribute('data-unit-id', '569');
  await page.locator('#sq').fill('精锐蒙古突骑');
  await expect(page.locator('#simhub .sim-row')).toHaveAttribute('data-unit-id', '561');
  await expect(page.locator('#simhub .sim-row .ebadge')).toHaveCount(0);

  await page.locator('#sq').fill('');
  await page.locator('#srole').selectOption('cavalry');
  await expect(page.locator('#simhub .sim-row[data-unit-id="1962"]')).toBeVisible();
  await expect(page.getByText('已选：骑兵')).toBeVisible();
  await page.getByRole('button', { name: '清空筛选', exact: true }).click();
  await expect(page.locator('#sq')).toBeFocused();
  expect((await countPair(page)).shown).toBe(initial.all);
});

test('#970 文明链接、返回恢复，以及模拟器不接收展示时代', async ({ page }) => {
  await theme(page, 'light');
  await page.goto('./#/simulator');
  await page.locator('#sq').fill('Paladin');
  const row = page.locator('#simhub .sim-row[data-unit-id="569"]');
  const cost = await row.locator('.sim-cost').innerText();
  await chooseCiv(page, 'Franks');
  await expect(page.locator('.sim-cost-basis')).toBeVisible();
  await expect(row.locator('.sim-cost')).toHaveText(cost);
  await expect(row).toHaveAttribute('href', '#/unit/569?tab=sim&civ=Franks');
  await expect(page.locator('#sciv .cp-name')).not.toContainText('Franks');
  await expect(page.locator('#sciv')).toHaveAttribute('aria-label', /Franks/);
  await row.click();
  await expect(page).toHaveURL(/#\/unit\/569\?tab=sim&civ=Franks$/);
  await expect(page.locator('#sim .simt').first()).toBeVisible();
  await page.goBack();
  await expect(page.locator('#sciv')).toHaveAttribute('data-value', 'Franks');
  await expect(page.locator('#sq')).toHaveValue('Paladin');
  await page.reload();
  await expect(page.locator('#sciv')).toHaveAttribute('data-value', '');
  await expect(page.locator('#sq')).toHaveValue('');

  await page.locator('#sq').fill('Spearman');
  const spear = page.locator('#simhub .sim-row[data-unit-id="93"]');
  await expect(spear.locator('.sim-prod')).toContainText('封建时代');
  await spear.click();
  await expect(page).toHaveURL(/#\/unit\/93\?tab=sim$/);
  await expect(page.locator('#simage option[value="1"]')).toHaveCount(1);
  await expect(page.locator('#sim .simt').first()).toBeVisible();
});

test('#970 时代精确匹配、空态和文明弹层关闭', async ({ page }) => {
  await theme(page, 'light');
  await page.goto('./#/simulator');
  await page.locator('#sq').fill('Spearman');
  const spear = page.locator('#simhub .sim-row[data-unit-id="93"]');
  await page.locator('.sim-chips button[data-v="1"]').click();
  await expect(spear).toHaveCount(0);
  await page.locator('.sim-chips button[data-v="2"]').click();
  await expect(spear.locator('.sim-prod')).toContainText('封建时代');
  await chooseCiv(page, 'Armenians');
  await expect(spear).toHaveCount(0);
  await page.locator('.sim-chips button[data-v="1"]').click();
  await expect(spear.locator('.sim-prod')).toContainText('黑暗时代');
  await expect(spear.locator('.sim-cost')).toContainText(String(byId[93]!.cost.Food));
  await expect(spear.locator('.sim-cost')).toContainText(String(byId[93]!.cost.Wood));
  await expect(page.locator('.sim-cost-basis')).toBeVisible();

  await page.locator('#sq').fill('zzzznotanunit');
  await expect(page.getByRole('heading', { name: '没有符合条件的单位', exact: true })).toBeVisible();
  await expect(page.getByText('试试减少搜索、文明、兵种或时代等条件。')).toBeVisible();
  await page.locator('.sim-empty button').click();
  await expect(page.locator('#sq')).toBeFocused();
  const restored = await countPair(page);
  expect(restored.shown).toBe(restored.all);

  await page.locator('#sciv').click();
  const dialog = page.getByRole('dialog', { name: '可用文明', exact: true });
  await expect(dialog).toBeVisible();
  await page.locator('.cp-mask').click({ position: { x: 8, y: 8 } });
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#sciv')).toBeFocused();
  await expect(page.locator('.cp-panel, .cp-mask')).toHaveCount(0);

  await page.locator('#sciv').click();
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.locator('#sciv')).toBeFocused();

  await page.locator('#sciv').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#sciv')).toBeFocused();

  await page.locator('#sciv').click();
  await dialog.getByRole('combobox').fill('Franks');
  await page.keyboard.press('Enter');
  await expect(page.locator('#sciv')).toBeFocused();
  await expect(page.locator('#sciv')).toHaveAttribute('data-value', 'Franks');
});

test('#970 新标签打开，不可训练文明仍走详情原有说明', async ({ page }) => {
  await theme(page, 'light');
  await page.goto('./#/simulator');
  const row = page.locator('#simhub .sim-row').first();
  await expect(row).toHaveJSProperty('tagName', 'A');
  const href = await row.getAttribute('href');
  const [popup] = await Promise.all([page.context().waitForEvent('page'), row.click({ modifiers: ['Control'] })]);
  await popup.waitForLoadState('domcontentloaded');
  expect(popup.url()).toContain(href!);
  await popup.close();

  await page.goto('./#/unit/1699?tab=sim&civ=Franks');
  await expect(page.getByText('该文明无法训练本单位，因此不给出该文明的近似模拟值。')).toBeVisible();
});

test('#970 1280 命中区域至少 44px', async ({ page }) => {
  await theme(page, 'light');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/simulator');
  await hit(page.locator('#sq'), '搜索');
  await hit(page.locator('#sciv'), '文明');
  await hit(page.locator('#srole'), '兵种');
  await hit(page.locator('.sim-chips button').first(), '时代全部');
  await hit(page.locator('#simhub .sim-row').first(), '结果行');
  await hit(page.locator('nav.crumbs a', { hasText: '首页' }), '面包屑首页');
  await hit(page.locator('a.nitem[data-t="home"]'), '顶栏首页');
  await page.locator('#sq').fill('战车');
  await hit(page.getByRole('button', { name: '清空筛选', exact: true }), '清空筛选');
  await page.locator('#sciv').click();
  await hit(page.getByRole('button', { name: '关闭', exact: true }), '弹层关闭');
});

test('#970 390 深色：能搜能筛，口径在折叠面板外，菜单关闭时无蒙罩', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await theme(page, 'dark');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/simulator');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.nav-backdrop')).toHaveCount(0);
  await expect(page.locator('.sim-head')).toBeHidden();
  await expect(page.locator('.catalog-filter-panel')).toBeHidden();
  await expect(page.locator('.sim-cost-basis')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  const civ = await page.locator('#sciv').boundingBox();
  const role = await page.locator('#srole').boundingBox();
  expect(civ && role && civ.x + civ.width <= role.x + 1).toBe(true);
  await hit(page.locator('#sq'), '窄屏搜索');
  await hit(page.locator('#sciv'), '窄屏文明');
  await hit(page.locator('#srole'), '窄屏兵种');
  await hit(page.locator('.catalog-filter-toggle'), '筛选');
  await hit(page.locator('#simhub .sim-row').first(), '窄屏结果行');
  await hit(page.locator('nav.crumbs a', { hasText: '首页' }), '窄屏面包屑');

  await page.locator('.catalog-filter-toggle').click();
  await expect(page.locator('.sim-chips')).toBeVisible();
  await expect(page.locator('.sim-cost-basis')).toBeVisible();
  await hit(page.locator('.sim-chips button').first(), '窄屏时代');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await chooseCiv(page, 'Franks');
  await expect(page.locator('.sim-cost-basis')).toBeVisible();
  await expect(page.locator('#sciv .cp-name')).not.toContainText('Franks');
  await expect(page.locator('#simhub .sim-row[data-unit-id="1962"]')).toHaveCount(0);
  const selected = await page.locator('#sciv').boundingBox();
  const roleAfter = await page.locator('#srole').boundingBox();
  expect(selected && roleAfter && selected.x + selected.width <= roleAfter.x + 1).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  const contrast = await page
    .locator('.sim-note')
    .first()
    .evaluate((note) => {
      const basis = document.querySelector('.sim-cost-basis');
      const parse = (value: string) => value.match(/\d+/g)?.slice(0, 3).map(Number) ?? [0, 0, 0];
      const lum = (channels: number[]) => {
        const linear = channels.map((channel) => {
          const value = channel / 255;
          return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
      };
      const ratio = (foreground: string, background: string) => {
        const hi = Math.max(lum(parse(foreground)), lum(parse(background)));
        const lo = Math.min(lum(parse(foreground)), lum(parse(background)));
        return (hi + 0.05) / (lo + 0.05);
      };
      const paint = (element: Element | null) => {
        let node = element instanceof HTMLElement ? element : null;
        while (node) {
          const color = getComputedStyle(node).backgroundColor;
          const channels = parse(color);
          if (color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent' && channels.length >= 3) return color;
          node = node.parentElement;
        }
        return getComputedStyle(document.body).backgroundColor;
      };
      return {
        note: ratio(getComputedStyle(note).color, paint(note)),
        basis: basis ? ratio(getComputedStyle(basis).color, paint(basis)) : 0,
      };
    });
  expect(contrast.note).toBeGreaterThanOrEqual(4.5);
  expect(contrast.basis).toBeGreaterThanOrEqual(4.5);

  const row = page.locator('#simhub .sim-row').first();
  const id = await row.getAttribute('data-unit-id');
  await row.click();
  await expect(page).toHaveURL(new RegExp(`#/unit/${id}\\?tab=sim&civ=Franks$`));
  await expect(page.locator('#sim .simt').first()).toBeVisible();
  expect(errors).toEqual([]);
});
