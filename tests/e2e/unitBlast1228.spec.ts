import { expect, test } from '@playwright/test';

test('目录中战象、投石车与弩炮分别解释范围、来源及穿透', async ({ page }) => {
  const panel = page.getByRole('region', { name: '范围攻击与友方误伤' });
  const stat = (name: string) => panel.locator(`[data-blast-stat="${name}"] strong`);
  await page.goto('./#/unit/239');
  await expect(stat('radius')).toHaveText('0.5');
  await expect(stat('damage')).toHaveText('×0.5');
  await expect(stat('level')).toHaveText('等级 2（周边单位）');
  await expect(panel.locator('.ud-blast-ff')).toHaveCount(0);
  await expect(panel.getByRole('link', { name: '固定版本 DAT' })).toHaveAttribute('href', /auto-mods\/blob\/[0-9a-f]{40}\/dat\/empires2_x2_p1.dat$/u);
  await expect(panel.getByRole('link', { name: 'AGE 释义' })).toHaveAttribute('href', /Tapsa\/AGE\/blob\/[0-9a-f]{40}\/AGE_Frame\/Units.cpp#L4456-L4463$/u);
  await expect(panel.getByRole('link', { name: '数据说明' })).toHaveAttribute('href', '#/about-data');
  await page.goto('./#/unit/550');
  await expect(stat('level')).toHaveText('等级 1（含树木）');
  await expect(page.getByRole('region', { name: '溅射与最小射程', exact: true })).toHaveCount(1);
  for (const id of [441, 546, 279, 542, 1980, 1738, 1740]) {
    await page.goto('./#/unit/' + id);
    await expect(page.locator('#unit-notes')).toBeVisible();
    await expect(panel).toHaveCount(0);
    if (id === 1738 || id === 1740) await expect(page.locator('#unit-notes')).toContainText('溅射范围 0.5');
  }
});

test('掷弹兵在深色手机上将等级编码与受方修正分列', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 840 });
  await page.addInitScript(() => localStorage.setItem('aoe2-theme', 'dark'));
  await page.goto('./#/unit/1911?civ=Chinese');
  const panel = page.getByRole('region', { name: '范围攻击与友方误伤' });
  await expect(panel.locator('[data-blast-stat="damage"] strong')).toHaveText('×1');
  await expect(panel.locator('[data-blast-stat="level"] strong')).toHaveText('编码 11（未解码）');
  await expect(panel.locator('.ud-blast-ff > strong')).toHaveText('×0.5');
  await expect(panel.locator('.ud-blast-ff p strong')).toHaveText('受到');
  const [radius, damage, level] = await Promise.all(['radius', 'damage', 'level'].map((name) => panel.locator(`[data-blast-stat="${name}"]`).boundingBox()));
  expect(radius!.y).toBe(damage!.y);
  expect(level!.y).toBeGreaterThan(radius!.y);
  expect(level!.width).toBeGreaterThan(radius!.width + damage!.width);
  expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await expect(panel.locator('.ud-blast-ff > strong .num.nw')).toHaveCSS('white-space', 'nowrap');
});
