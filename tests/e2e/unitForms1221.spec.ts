import { expect, test } from '@playwright/test';
import units from '../../data/game/units.json' with { type: 'json' };

test('七个形态只嵌在原目录条目（含城堡与营垒保加利亚骑兵），继承对应档的说明', () => {
  const pairs = units.filter((u) => u.form).map((u) => [u.id, u.form!.id]);
  expect(pairs.sort()).toEqual([
    [1225, 1252],
    [1227, 1253],
    [1254, 1252],
    [1255, 1253],
    [1759, 1738],
    [1761, 1740],
    [1962, 1980],
  ]);
  for (const [, target] of pairs) expect(units.some((u) => u.id === target)).toBe(false);
  const normal = units.find((u) => u.id === 1759)!;
  const elite = units.find((u) => u.id === 1761)!;
  expect(normal.desc).toContain('可在近战和远程攻击之间切换');
  expect(elite.desc).toContain('可在近战和远程攻击之间切换');
  expect(normal.desc).not.toBe(elite.desc);
  expect(normal).toMatchObject({ atk: 5, rng: 4, rof: 2, ma: 3, pa: 1 });
  expect(normal.form).toMatchObject({ atk: 10, rng: 0, rof: 2, ma: 3, pa: 1, attackDelaySeconds: 0 });
});

test('键盘切换武器、浏览器后退与独立档位', async ({ page }) => {
  await page.goto('./#/unit/1759');
  const form = page.getByRole('region', { name: '形态关系' });
  const melee = form.getByRole('link', { name: '近战模式' });
  await melee.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/unit\/1738$/);
  await expect(form.locator('[aria-current]')).toHaveText('近战模式');
  await expect(page.locator('[data-stat="attack-delay"] .ud-stat-val')).toHaveText('0 秒');
  await page.goBack();
  await expect(form.locator('[aria-current]')).toHaveText('远程模式');
  await melee.click();
  await page.getByRole('radio', { name: '精锐' }).click();
  await expect(page).toHaveURL(/#\/unit\/1740$/);
  await form.getByRole('link', { name: '远程模式' }).click();
  await expect(page).toHaveURL(/#\/unit\/1761$/);
  await expect(page.locator('#unit-notes')).toContainText('孟加拉科技树说明文本');
});

test('每个目标直链的属性、边界与窄屏版式', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [id, title] of [
    [1738, '战车（近战）'],
    [1740, '精锐战车（近战）'],
    [1980, '战车（掩护）'],
    [1252, '保加利亚骑兵（下马）'],
    [1253, '精锐保加利亚骑兵（下马）'],
  ] as const) {
    await page.goto('./#/unit/' + id + '?tab=sim');
    await expect(page.locator('#unit h1')).toContainText(title);
    await expect(page.locator('#unit-core')).toContainText('获取方式与范围');
    await expect(page.locator('#unit-sim')).toContainText('不开放科技模拟器');
    await expect(page.locator('#unit-obtain,#unit-gather,#unit-garrison,#unitciv,[data-t="catalog-cost"],[data-t="reverse-counter-pk"]')).toHaveCount(0);
    await expect(page.locator('#unit-reverse-counters')).toBeAttached();
    await page.locator('.ud-icon img').scrollIntoViewIfNeeded();
    await expect.poll(() => page.locator('.ud-icon img').evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (id === 1980) {
      await expect(page.locator('.ud-form-warn')).toContainText('不是「永远打不中」');
      await expect(page.locator('[data-accuracy="boundary"]')).toHaveCount(0);
    }
    if (id === 1252 || id === 1253) {
      await expect(page.getByRole('radio')).toHaveCount(0);
      const bar = page.getByRole('region', { name: '形态关系' });
      await expect(bar.getByRole('link', { name: '返回骑乘原资料' })).toHaveAttribute('href', '#/unit/' + (id === 1252 ? 1225 : 1227));
      await expect(page.locator('.ud-armor')).toContainText('步兵 0');
      await expect(page.getByRole('row').filter({ hasText: '对 标准建筑' })).toContainText('+4');
    }
  }
  await page.goto('./#/unit/1226');
  await expect(page.getByText(/当前目录和历史档案均未找到此项/)).toBeVisible();
});

test('城堡与营垒保加利亚骑兵均可直达同档下马资料，形态往返保留文明', async ({ page }) => {
  await page.goto('./#/unit/1225?civ=Bulgarians');
  await expect(page.locator('.ud-form-bar')).toHaveCount(1);
  await page.getByRole('link', { name: '查看下马步兵' }).click();
  await expect(page).toHaveURL(/#\/unit\/1252\?civ=Bulgarians$/);
  await expect(page.locator('#unitciv')).toHaveCount(0);
  await page.getByRole('link', { name: '返回骑乘原资料' }).click();
  await expect(page).toHaveURL(/#\/unit\/1225\?civ=Bulgarians$/);
  await page.goto('./#/unit/1227');
  await expect(page.locator('.ud-form-bar')).toHaveCount(1);
  await expect(page.getByRole('link', { name: '查看下马步兵' })).toHaveAttribute('href', '#/unit/1253');
  await page.goto('./#/unit/1254?civ=Bulgarians');
  await expect(page.getByRole('link', { name: '查看下马步兵' })).toHaveAttribute('href', '#/unit/1252?civ=Bulgarians');
  await page.goto('./#/unit/1255');
  await expect(page.getByRole('link', { name: '查看下马步兵' })).toHaveAttribute('href', '#/unit/1253');
  await page.goto('./#/unit/1740?civ=Bengalis');
  await page.getByRole('link', { name: '查看原单位的相关科技' }).click();
  await expect(page).toHaveURL(/#\/unit\/1761\?civ=Bengalis&tab=rel$/);
  await expect(page.locator('#unit-related a[href="#/tech/833"]')).toHaveText('派');
});
