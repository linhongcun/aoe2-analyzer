import { expect, test } from '@playwright/test';

test('#44 1280：「相关」侧栏宽 320px，原因行不溢出（320px 下折两行，与 a50f739 样稿一致）', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#unit/441');
  const side = page.locator('#unit .dside');
  await expect(side).toBeVisible();
  expect(await side.evaluate((e) => getComputedStyle(e).width)).toBe('320px');
  const reason = page.locator('#unit [data-t="conf-link"] .rel-reason');
  await expect(reason).toHaveText('通用单位 Hussar 的官方名就叫「翼骑兵」，和波兰翼骑兵只差两个字');
  const lines = await reason.evaluate((e) => Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight)));
  // 320px 侧栏扣掉内边距和两侧图标后放不下整句，样稿 1280 图里也是两行
  expect(lines).toBeLessThanOrEqual(2);
  expect(await reason.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
});

for (const [hash, sel] of [
  ['#unit/569', '#unit .dtabs'],
  ['#unit/1948', '#unit .dtabs'],
  ['#tech/12', '.dtabs'],
  ['#civ/Armenians', '#detail h2'],
  ['#/building/82', '.dtabs'],
] as const)
  test(`#44 1280：${hash} 无横向溢出`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('./' + hash);
    await expect(page.locator(sel).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
