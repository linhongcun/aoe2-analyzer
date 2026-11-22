import { expect, test, type Page } from '@playwright/test';

function attackTiming(page: Page) {
  const stats = page.getByRole('region', { name: '目录基础属性与造价' });
  const timing = stats.getByRole('group', { name: '目录基础攻击计时' });
  return { stats, timing, delay: timing.locator('[data-stat="attack-delay"]'), interval: timing.locator('[data-stat="rof"]') };
}

test('#1218 目录将飞刀女兵出手前摇和攻击间隔分别显示在核心属性之后', async ({ page }) => {
  await page.goto('./#/unit/1013');
  const { stats, timing, delay, interval } = attackTiming(page);
  await expect(delay.locator('.num.nw')).toHaveText('1 秒');
  await expect(interval.locator('.num.nw')).toHaveText('2 秒');
  await expect(delay).toContainText('从攻击动作开始到出手，不含弹道飞行时间。');
  await expect(interval).toContainText('连续攻击时，两次出手的间隔。');
  await expect(stats.locator('[data-stat="rof"]')).toHaveCount(1);
  const directStats = await stats.locator('.ud-stat-grid > [data-stat]').evaluateAll((els) => els.map((el) => el.getAttribute('data-stat')));
  expect(directStats).toEqual(['hp', 'atk', 'ma', 'pa', 'spd', 'rng', 'los']);
  const timingBox = (await timing.boundingBox())!;
  const losBox = (await stats.locator('[data-stat="los"]').boundingBox())!;
  expect(timingBox.y).toBeGreaterThanOrEqual(losBox.y + losBox.height);
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
  await expect(delay.locator('.num.nw')).toHaveText('0.9 秒');
  await page.locator('#unitciv').click();
  await page.locator('[role="option"][data-civ="Mongols"]').click();
  await expect(page).toHaveURL(/474\?civ=Mongols$/u);
  await expect(delay.locator('.num.nw')).toHaveText('0.9 秒');
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

test('#1231 铁浮屠的目录间隔与显示字段整宽对照，僧侣保留无普通攻击', async ({ page }) => {
  for (const [id, width, theme] of [
    [1908, 1280, 'light'],
    [1910, 390, 'light'],
    [125, 390, 'dark'],
    [775, 360, 'dark'],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`./#/unit/${id}`);
    await page.evaluate((value) => {
      localStorage.setItem('aoe2-theme', value);
    }, theme);
    await page.reload();
    const { stats, timing, delay, interval } = attackTiming(page);
    const note = stats.locator('.ud-stat-grid > .ud-attack-timing + .ud-rof-diff');
    await expect(note).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    if (id === 1908 || id === 1910) {
      await expect(interval).toContainText('2.15 秒');
      await expect(interval).toContainText('连续攻击时，两次出手的间隔。');
      await expect(note).toContainText('固定 DAT 显示用字段：1.8 秒');
      const first = (await delay.boundingBox())!;
      const second = (await interval.boundingBox())!;
      expect(first.y).toBe(second.y);
      expect(first.width).toBeCloseTo(second.width, 0);
    } else {
      await expect(delay).toHaveCount(0);
      await expect(interval).toContainText('不适用：无普通攻击');
      await expect(note).toContainText('基础 1.6 秒 / 显示用 1.0 秒');
      await expect(note).toContainText('均不代表招降或治疗速度');
    }
    await expect(note).toContainText('未经同版客户端实测');
    await expect(note.locator('.num.nw').filter({ hasText: 'DE 188329' })).toHaveCount(1);
    const grid = (await timing.boundingBox())!;
    const strip = (await note.boundingBox())!;
    expect(strip.width).toBe(grid.width);
    expect(strip.y - grid.y - grid.height).toBeCloseTo(8, 0);
    expect(
      await note.locator('.num.nw').evaluateAll((nodes) => nodes.every((node) => new Set(Array.from(node.getClientRects(), (rect) => rect.top)).size === 1)),
    ).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await note.getByRole('link', { name: '数据说明' }).click();
    await expect(page).toHaveURL(/#\/about-data$/u);
  }
});

test('#1231 同值单位无对照条，楼船保留两种射程与最小射程', async ({ page }) => {
  const { stats, interval } = attackTiming(page);
  for (const id of [38, 1948]) {
    await page.goto(`./#/unit/${id}`);
    await expect(interval).toContainText(id === 38 ? '1.8 秒' : '5.5 秒');
    await expect(stats.locator('.ud-rof-diff')).toHaveCount(0);
    if (id === 1948) {
      const range = stats.locator('[data-stat="rng"]');
      await expect(range.locator('.ud-stat-val')).toHaveText('10');
      await expect(range).toContainText('对建筑 13');
      await expect(range).toContainText('最小射程 3');
    }
  }
});
