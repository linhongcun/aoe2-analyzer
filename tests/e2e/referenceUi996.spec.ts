import { expect, test } from '@playwright/test';

test('#996 地图手机筛选紧凑，返回目录恢复选中行或搜索焦点', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('./#/maps');
  const search = page.getByRole('searchbox', { name: '搜索地图', exact: true });
  await expect(search).toBeVisible();
  const searchLabel = await page.locator('.map-search').boundingBox();
  expect(searchLabel!.height).toBeLessThan(90);
  await search.fill('黑森林');
  const row = page.getByRole('button', { name: '黑森林 Black Forest', exact: true });
  await row.click();
  await expect(page.locator('#map-details')).toBeFocused();
  await page.getByRole('button', { name: '返回目录', exact: true }).click();
  await expect(row).toBeFocused();
  await expect(row).toBeInViewport();
  await expect(search).toHaveValue('黑森林');
  await expect(page).toHaveURL(/map=black-forest$/);
  await page.keyboard.press('Enter');
  await expect(page.locator('#map-details')).toBeFocused();
  await page.goto('./#/maps?map=not-a-map');
  await page.getByRole('button', { name: '返回目录', exact: true }).click();
  await expect(search).toBeFocused();
  await expect(page).toHaveURL(/map=not-a-map$/);
});

test('#996 科技详情研究分区与移动卡片不遮挡', async ({ page }) => {
  await page.goto('./#/tech/22');
  await expect(page.locator('#tech h1')).toBeVisible();
  for (const width of [360, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const boxes = await page.locator('.td-research-grid > div').evaluateAll((items) =>
      items.map((item) => {
        const { x, y, width, height } = item.getBoundingClientRect();
        return { x, y, width, height };
      }),
    );
    expect(boxes).toHaveLength(3);
    expect(boxes[1]!.y).toBe(boxes[0]!.y);
    if (width > 900) {
      expect(boxes[2]!.y).toBe(boxes[0]!.y);
      expect(boxes[2]!.x).toBeGreaterThanOrEqual(boxes[1]!.x + boxes[1]!.width);
    } else expect(boxes[2]!.y).toBeGreaterThanOrEqual(boxes[0]!.y + boxes[0]!.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.locator('.td-history > summary').click();
  await expect(page.locator('.td-history')).toHaveAttribute('open');
});
