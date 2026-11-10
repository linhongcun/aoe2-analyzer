import { expect, test, type Page } from '@playwright/test';

async function rowsInView(page: Page) {
  return page.locator('#bgrid .b-card').evaluateAll((cards) => {
    const groups = new Map<number, Element[]>();
    for (const card of cards) {
      const top = Math.round(card.getBoundingClientRect().top);
      groups.set(top, [...(groups.get(top) ?? []), card]);
    }
    const rows = [...groups.entries()].sort((a, b) => a[0] - b[0]);
    const visible = rows.filter(([, group]) => {
      const bounds = group[0]!.getBoundingClientRect();
      const cost = group[0]!.querySelector('.b-cost')!.getBoundingClientRect();
      return bounds.top >= 0 && cost.bottom <= window.innerHeight && bounds.bottom <= window.innerHeight;
    });
    return { columns: rows[0]?.[1].length ?? 0, visibleRows: visible.length };
  });
}

test('#881 1280：身份卡片、常驻次筛选与会话搜索', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('./#/buildings');
  await expect(page.locator('#buildings h1')).toHaveText('建筑');
  await expect(page.locator('#buildings .lhead .note')).toHaveText('查找建筑并打开详情。');
  const guides = page.getByRole('navigation', { name: '时代升级说明' });
  await expect(guides.getByRole('link', { name: '封建时代说明', exact: true })).toHaveAttribute('href', '#/tech/101');
  await expect(guides.getByRole('link', { name: '城堡时代说明', exact: true })).toHaveAttribute('href', '#/tech/102');
  await expect(guides.getByRole('link', { name: '帝王时代说明', exact: true })).toHaveAttribute('href', '#/tech/103');
  await expect(page.locator('#bq')).toHaveAttribute('placeholder', '搜索中文、英文或拼音');
  await expect(page.locator('#bq')).toHaveAttribute('aria-label', '搜索建筑，可搜中文、英文或拼音');
  await expect(page.locator('#bcnt')).toHaveText('38 / 38 座建筑');
  await expect(page.locator('.b-summary')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '清空筛选', exact: true })).toHaveCount(0);
  await expect(page.locator('.b-note')).toHaveText('造价为目录基础值。时代按目录时代精确匹配。');
  await expect(page.locator('#buildings .b-more')).toHaveJSProperty('open', true);
  await expect(page.locator('#bdlc')).toBeVisible();
  await expect(page.getByRole('group', { name: '时代' })).toBeVisible();
  await expect(page.locator('#bdlc option', { hasText: '国王时代' })).toHaveCount(1);
  await expect(page.locator('#bdlc option[value="none"]')).toHaveText('未标注（0）');
  const layout = await rowsInView(page);
  expect(layout.columns).toBe(4);
  expect(layout.visibleRows).toBeGreaterThanOrEqual(3);
  await expect(page.locator('.b-zh').first()).toHaveCSS('font-size', '16px');
  await expect(page.locator('.b-en').first()).toHaveCSS('font-size', '13px');
  await expect(page.locator('.b-meta').first()).toHaveCSS('font-size', '13px');
  await expect(page.locator('.b-note')).toHaveCSS('font-size', '13px');
  await expect(page.locator('#bgrid')).not.toContainText('国王时代');
  await expect(page.locator('#bgrid .b-card', { hasText: '木城门' })).toContainText('失落帝国');
  const donjon = page.locator('#bgrid .b-card', { hasText: '城楼' });
  await expect(donjon).toContainText('独特');
  await expect(donjon).toContainText('西方霸主');
  await expect(donjon).not.toContainText('西西里');
  await expect(donjon.locator('.b-cost')).toContainText('造价');
  const barracksCost = page.locator('#bgrid .b-card[data-building-id="12"] .b-cost');
  await expect(barracksCost).toContainText('175');

  await page.getByRole('group', { name: '类型' }).getByRole('button', { name: '军事', exact: true }).click();
  await expect(page.locator('#bcnt')).toHaveText('9 / 38 座建筑');
  await expect(page.locator('.b-summary')).toHaveText('军事');
  await page.getByRole('button', { name: '清空筛选', exact: true }).click();
  await expect(page.locator('#bcnt')).toHaveText('38 / 38 座建筑');

  for (const query of ['兵营', 'bingying', 'bing ying', 'by']) {
    await page.locator('#bq').fill(query);
    const card = page.locator('#bgrid .b-card');
    await expect(card).toHaveCount(1);
    await expect(card).toHaveAttribute('data-building-id', '12');
    await expect(card).toHaveAttribute('href', '#/building/12');
  }
  const card = page.locator('#bgrid .b-card');
  await page.locator('#bdlc').focus();
  await page.keyboard.press('Tab');
  await expect(card).toBeFocused();
  expect(await card.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/building\/12$/);
  await expect(page).not.toHaveURL(/civ=/);
  await page.getByRole('link', { name: '建筑', exact: true }).first().click();
  await expect(page.locator('#bq')).toHaveValue('by');
  await expect(page.locator('#bgrid .b-card')).toHaveAttribute('data-building-id', '12');

  await page.locator('#bq').fill('');
  await page.locator('#bdlc').selectOption('none');
  await expect(page.locator('#bcnt')).toHaveText('0 / 38 座建筑');
  await expect(page.getByRole('status')).toContainText('没有符合条件的建筑');
  await expect(page.locator('#bgrid .b-card')).toHaveCount(0);
  await page.locator('.b-empty').getByRole('button', { name: '清空筛选', exact: true }).click();
  await expect(page.locator('#bcnt')).toHaveText('38 / 38 座建筑');
  await expect(page.locator('#bdlc')).toHaveValue('');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('#881 390：筛选默认收起，摘要留在外面', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/buildings');
  await expect(page.locator('#bq')).toBeVisible();
  await expect(page.getByRole('group', { name: '类型' })).toBeVisible();
  await expect(page.locator('#bcnt')).toHaveText('38 / 38 座建筑');
  await expect(page.locator('.b-summary')).toHaveCount(0);
  await expect(page.locator('#buildings .b-more')).toHaveJSProperty('open', false);
  await expect(page.locator('#bdlc')).toBeHidden();
  const firstCost = page.locator('#bgrid .b-card .b-cost').first();
  await expect(firstCost).toBeInViewport();
  expect(await rowsInView(page)).toMatchObject({ columns: 2 });
  await page.locator('#buildings .b-more > summary').click();
  await expect(page.locator('#bdlc')).toBeVisible();
  await expect(page.getByRole('group', { name: '时代' })).toBeVisible();
  await expect(page.locator('#bdlc option[value="none"]')).toHaveText('未标注（0）');
  await page.getByRole('group', { name: '时代' }).getByRole('button', { name: '封建', exact: true }).click();
  await page.locator('#buildings .b-more > summary').click();
  await expect(page.locator('#bdlc')).toBeHidden();
  await expect(page.locator('#bcnt')).toHaveText('8 / 38 座建筑');
  await expect(page.locator('.b-summary')).toHaveText('封建时代');
  await expect(page.getByRole('button', { name: '清空筛选', exact: true })).toBeVisible();
  await expect(page.locator('#bgrid')).not.toContainText('国王时代');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('#881 浅色与深色文字可读', async ({ page }) => {
  await page.goto('./#/buildings');
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((value) => localStorage.setItem('aoe2-theme', value), theme);
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: width === 1280 ? 900 : 844 });
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.locator('.b-zh').first()).toBeVisible();
      const color = await page
        .locator('.b-zh')
        .first()
        .evaluate((element) => getComputedStyle(element).color);
      expect(color).not.toBe('rgba(0, 0, 0, 0)');
      if (width === 1280) await expect(page.locator('#bdlc')).toBeVisible();
      else await expect(page.locator('#buildings .b-more')).toHaveJSProperty('open', false);
    }
  }
});
