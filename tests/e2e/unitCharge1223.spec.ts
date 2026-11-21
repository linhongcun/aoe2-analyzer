import { expect, test } from '@playwright/test';

test('单位详情切换精锐保留文明与静态充能读数，窄屏指标两列排列', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 820 });
  await page.addInitScript(() => localStorage.setItem('aoe2-theme', 'dark'));
  await page.goto('./#/unit/1655?civ=Burgundians');
  const charge = page.getByRole('region', { name: '目录蓄力与充能参数' });
  const max = charge.locator('[data-charge-stat="max"]');
  const time = charge.locator('[data-charge-stat="duration"]');
  const rate = charge.locator('[data-charge-stat="rate"]');
  await expect(max.locator('strong')).toHaveText('20');
  await page.getByRole('radio', { name: '精锐', exact: true }).click();
  await expect(page).toHaveURL(/\/1657\?civ=Burgundians$/u);
  await expect(max.locator('strong')).toHaveText('25');
  await expect(time).toContainText('与普通相同');
  await expect(time.locator('strong')).toHaveText('40 秒');
  await expect(time.locator('.num.nw')).toHaveCSS('white-space', 'nowrap');
  const first = await max.boundingBox(),
    second = await time.boundingBox(),
    third = await rate.boundingBox();
  expect(first!.y).toEqual(second!.y);
  expect(third!.width).toBeGreaterThan(first!.width + second!.width);
  expect(await charge.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await expect(charge.getByRole('link', { name: '固定版本字段说明' })).toHaveAttribute(
    'href',
    /\/blob\/[0-9a-f]{40}\/scripts\/generateDataFiles.py#L416-L424$/,
  );
  await expect(charge.getByRole('link', { name: '数据说明' })).toHaveAttribute('href', '#/about-data');
});

test('窄屏楼船保留非常规来源及原有射程，喷火船不显示充能块', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 820 });
  await page.goto('./#/unit/1948');
  const charge = page.getByRole('region', { name: '目录蓄力与充能参数' });
  await expect(charge.locator('[data-charge-stat="duration"] strong')).toHaveText('不作冷却解读');
  await expect(charge.locator('[data-charge-stat="rate"] strong')).toHaveText('非常规源值');
  await expect(page.locator('[data-stat="rng"]')).toContainText('13');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await charge.locator('[data-charge-stat]').evaluateAll((items) => items.every((el) => el.scrollWidth <= el.clientWidth))).toBe(true);
  await page.goto('./#/unit/529');
  await expect(page.locator('#unit-core')).toBeVisible();
  await expect(charge).toHaveCount(0);
  await page.goto('./#/unit/1738');
  await expect(page.getByRole('region', { name: '目录基础属性与获取方式' })).toBeVisible();
  await expect(charge).toHaveCount(0);
});
