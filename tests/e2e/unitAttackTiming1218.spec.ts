import { expect, test, type Page } from '@playwright/test';

function attackTiming(page: Page) {
  const stats = page.getByRole('region', { name: '目录基础属性与造价' });
  const timing = stats.getByRole('group', { name: '目录基础攻击计时' });
  return { stats, timing, delay: timing.locator('[data-stat="attack-delay"]'), interval: timing.locator('[data-stat="rof"]') };
}

test('#1218 目录将飞刀女兵出手前摇和攻击间隔分别显示在属性前面', async ({ page }) => {
  await page.goto('./#/unit/1013');
  const { stats, delay, interval } = attackTiming(page);
  await expect(delay.locator('.num.nw')).toHaveText('1 秒');
  await expect(interval.locator('.num.nw')).toHaveText('2 秒');
  await expect(delay).toContainText('从攻击动作开始到出手，不含弹道飞行时间。');
  await expect(interval).toContainText('连续攻击时，两次出手的间隔。');
  await expect(stats.locator('[data-stat="rof"]')).toHaveCount(1);
  await expect(stats.locator('.ud-stat-grid > :first-child')).toHaveClass('ud-attack-timing');
  const left = await stats.locator('.ud-stats').boundingBox();
  const right = await stats.locator('.ud-cost-col').boundingBox();
  expect(right!.x).toBeGreaterThanOrEqual(left!.x + left!.width);
});

test('#1218 深色窄屏按单位形态更新前摇，小数和单位不拆行', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('aoe2-theme', 'dark'));
  await page.goto('./#/unit/39?civ=Mongols');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const { stats, timing, delay, interval } = attackTiming(page);
  await expect(delay.locator('.num.nw')).toHaveText('0.91 秒');
  await page.locator('#unit-obtain a[href="#/unit/474"]').click();
  await expect(page).toHaveURL(/#\/unit\/474/);
  await expect(delay.locator('.num.nw')).toHaveText('0.897 秒');
  await page.locator('#unitciv').click();
  await page.locator('[role="option"][data-civ="Mongols"]').click();
  await expect(page).toHaveURL(/474\?civ=Mongols$/u);
  await expect(delay.locator('.num.nw')).toHaveText('0.897 秒');
  await expect(delay.locator('.num.nw')).toHaveCSS('white-space', 'nowrap');
  await expect(interval.locator('.num.nw')).toHaveText('2 秒');

  await page.locator('html').evaluate((root) => root.style.setProperty('font-size', '200%', 'important'));
  const first = await delay.boundingBox();
  const second = await interval.boundingBox();
  expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.height);
  expect(await timing.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(stats.getByRole('heading', { name: '目录造价' })).toBeVisible();
});

test('#1218 显式零、无普通攻击和打包态有各自的显示口径', async ({ page }) => {
  const { timing, delay, interval } = attackTiming(page);
  await page.goto('./#/unit/74');
  await expect(delay.locator('.num.nw')).toHaveText('0 秒');
  await expect(delay).toContainText('不含弹道飞行时间');

  await page.goto('./#/unit/17');
  await expect(timing).toContainText('不适用：无普通攻击');
  await expect(delay).toHaveCount(0);

  await page.goto('./#/unit/331');
  await expect(interval).toContainText('攻击间隔（展开态）');
  await expect(interval.locator('.num.nw')).toHaveText('10秒');
  await expect(delay).toHaveCount(0);
});
