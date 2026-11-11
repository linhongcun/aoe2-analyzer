import { expect, test } from '@playwright/test';

test('#935 @1280 空地址、点选、无效链接、筛选和缺路位', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/maps');
  const search = page.getByRole('searchbox', { name: '搜索地图', exact: true });
  await expect(search).toBeVisible();
  await expect(page.locator('a.nitem[data-t="maps"]').first()).toBeVisible();
  await expect(page.locator('#map-details')).toHaveAttribute('data-map-id', 'arabia');
  expect(page.url()).not.toMatch(/[?&]map=/);
  await expect(page.getByText('推荐', { exact: true })).toHaveCount(0);
  const searchBox = await search.boundingBox();
  expect((searchBox?.y ?? 999) + (searchBox?.height ?? 0)).toBeLessThan(900);
  await page.screenshot({ path: '/opt/cursor/artifacts/maps-1280-arabia.png' });
  const list = await page.locator('.map-list-pane').boundingBox();
  const detail = await page.locator('.map-detail-pane').boundingBox();
  expect(list && detail && list.x + list.width <= detail.x + 1).toBeTruthy();

  await page.getByRole('button', { name: '黑森林 Black Forest', exact: true }).click();
  await expect(page).toHaveURL(/#\/maps\?map=black-forest$/);
  await expect(page.locator('#map-details')).toHaveAttribute('data-map-id', 'black-forest');
  const positions = page.getByTestId('map-positions');
  await expect(positions).toContainText('路位推荐暂缺');
  await expect(positions.getByRole('link', { name: '反馈数据缺口', exact: true })).toBeVisible();
  await expect(positions).not.toContainText('编辑口径，非官方推荐');
  await expect(positions).not.toContainText('适用：');
  await page.screenshot({ path: '/opt/cursor/artifacts/maps-1280-black-forest.png' });

  await page.goto('./#/maps?map=not-a-map');
  await expect(page.getByRole('alert')).toHaveText('链接里的地图不存在');
  await expect(page.locator('#map-details')).toHaveCount(0);
  expect(page.url()).toContain('map=not-a-map');
  await page.screenshot({ path: '/opt/cursor/artifacts/maps-1280-invalid.png' });
  await page.getByRole('button', { name: '阿拉伯半岛 Arabia', exact: true }).click();
  await expect(page).toHaveURL(/#\/maps\?map=arabia$/);
  await expect(page.getByRole('alert')).toHaveCount(0);

  await page.getByRole('combobox', { name: '地图类型', exact: true }).selectOption('closed');
  await expect(page.locator('#map-details')).toHaveAttribute('data-map-id', 'arena');
  await expect(page).toHaveURL(/#\/maps\?map=arena$/);
  await page.getByRole('button', { name: '清除筛选', exact: true }).click();
  await page.goto('./#/maps');
  await page.getByRole('combobox', { name: '地图类型', exact: true }).selectOption('closed');
  await expect(page.locator('#map-details')).toHaveAttribute('data-map-id', 'arena');
  expect(page.url()).not.toMatch(/[?&]map=/);

  await search.fill('没有这张图');
  await expect(page.locator('.map-result-count')).toHaveText('没有匹配的地图，请换一个名称或清除筛选。');
  await expect(page.locator('#map-details')).toHaveCount(0);
  expect(page.url()).not.toMatch(/[?&]map=/);
  await page.screenshot({ path: '/opt/cursor/artifacts/maps-1280-empty.png' });
  await page.getByRole('button', { name: '清除筛选', exact: true }).click();

  const topic = page.getByTestId('map-sd3');
  await expect(topic).not.toHaveAttribute('open');
  await expect(topic.locator('[data-kind="pending"]').first()).toBeHidden();
  await topic.locator('summary').first().click();
  await expect(page.getByTestId('sd3-collection').locator('.sd3-card')).toHaveCount(11);
  await expect(page.getByTestId('sd3-collection').getByText('暂无预览', { exact: true })).toHaveCount(11);
  await expect(page.getByTestId('sd3-mechanics').locator('[data-sd3-mechanic]')).toHaveCount(3);
  await expect(topic.locator('[data-kind="pending"]').first()).toBeVisible();
  await page.screenshot({ path: '/opt/cursor/artifacts/maps-1280-sd3.png' });

  await page.goto('./#/maps?map=islands');
  const islands = page.locator('#map-details');
  await expect(islands.getByRole('region', { name: '码头与渔船经济' })).toContainText('三艘渔船');
  await expect(islands.getByRole('link', { name: '查看已核对的单码头速封流程（外部）' })).toBeVisible();
  await expect(islands.getByRole('link', { name: /混合图速封/ })).toBeVisible();
  await page.screenshot({ path: '/opt/cursor/artifacts/maps-1280-islands-top.png' });
  await islands.getByTestId('map-positions').scrollIntoViewIfNeeded();
  await expect(islands.getByTestId('map-positions')).toContainText('路位推荐暂缺');
  await page.screenshot({ path: '/opt/cursor/artifacts/maps-1280-islands.png' });
  expect(errors).toEqual([]);
});

test('#935 @1280 深色下点选仍只写 map', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => localStorage.setItem('aoe2-theme', 'dark'));
  await page.goto('./#/maps');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: '游牧 Nomad', exact: true }).click();
  await expect(page).toHaveURL(/#\/maps\?map=nomad$/);
  await expect(page.locator('#map-details')).toContainText('推荐文明');
  await page.screenshot({ path: '/opt/cursor/artifacts/maps-1280-dark.png' });
  expect(errors).toEqual([]);
});

test('#935 @390 列表首屏可进详情再返回', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/maps');
  const search = page.getByRole('searchbox', { name: '搜索地图', exact: true });
  await expect(search).toBeInViewport();
  const select = page.getByRole('combobox', { name: '地图类型', exact: true });
  const clear = page.getByRole('button', { name: '清除筛选', exact: true });
  const selectBox = await select.boundingBox();
  const clearBox = await clear.boundingBox();
  expect(selectBox && clearBox).toBeTruthy();
  expect(Math.abs(selectBox!.y + selectBox!.height - (clearBox!.y + clearBox!.height))).toBeLessThanOrEqual(2);
  expect(selectBox!.height).toBeGreaterThanOrEqual(44);
  expect(clearBox!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: '/opt/cursor/artifacts/maps-390-list.png' });
  await expect(page.locator('#map-details')).toBeHidden();
  await page.getByRole('button', { name: '黑森林 Black Forest', exact: true }).click();
  await expect(page).toHaveURL(/#\/maps\?map=black-forest$/);
  await expect(page.getByRole('button', { name: '返回目录', exact: true })).toBeVisible();
  await expect(page.locator('#map-details')).toBeVisible();
  await expect(search).toBeHidden();
  await page.screenshot({ path: '/opt/cursor/artifacts/maps-390-detail.png' });
  await page.getByRole('button', { name: '返回目录', exact: true }).click();
  await expect(search).toBeVisible();
  await expect(page.locator('#map-details')).toBeHidden();
  expect(page.url()).toContain('map=black-forest');

  await page.goto('./#/maps?map=islands');
  await expect(page.locator('#map-details')).toBeVisible();
  await expect(page.getByRole('button', { name: '返回目录', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
