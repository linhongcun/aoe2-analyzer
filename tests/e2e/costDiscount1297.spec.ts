import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((value) => localStorage.setItem('aoe2-theme', value), theme);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

async function assertNoWrapNum(page: Page, containerSelector: string) {
  const wrapped = await page.locator(`${containerSelector} .num.nw`).evaluateAll((nodes) =>
    nodes
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && el.getClientRects().length > 1;
      })
      .map((el) => el.textContent?.trim() ?? ''),
  );
  expect(wrapped, `${containerSelector} .num.nw 不应折行`).toEqual([]);
}

test('#1297 单位模拟器接入科技折后价并三口径隔离（法兰克 2701 + 1496 及波斯/马扎尔/马来/高丽抽测）', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/unit/2701?civ=Franks&tab=sim');
  await expect(page.locator('#sim')).toBeVisible();

  // 顶部目录价保持原价且标明隔离
  await expect(page.locator('[data-t="catalog-cost"]')).toContainText('40');
  await expect(page.locator('[data-t="catalog-cost"]')).toContainText('65');
  await expect(page.locator('.ud-cost-col')).toContainText('目录造价，未计文明折扣。不含下方模拟器科技改价。');

  // 初始态 B，科技行不再标「仅文本」而显示「影响造价」
  const row1496 = page.locator('#sim label.simt').filter({ has: page.getByRole('link', { name: '王家敕令骑兵', exact: true }) });
  await expect(row1496.locator('input[type="checkbox"]')).toBeVisible();
  await expect(row1496.locator('[data-t="sim-cost-badge"]')).toHaveText('影响造价');
  await expect(row1496).not.toContainText('仅文本');
  await expect(page.locator('[data-t="sim-effective-cost"]')).toHaveAttribute('data-state', 'available');

  // 勾选 1496：有效训练价变 40 木 39 金，累计研究费独立显示
  await row1496.locator('input[type="checkbox"]').check();
  const card = page.locator('[data-t="sim-effective-cost"]');
  await expect(card).toHaveAttribute('data-state', 'changed');
  await expect(card.locator('[data-t="sim-effective-price"]')).toContainText('40');
  await expect(card.locator('[data-t="sim-effective-price"]')).toContainText('39');
  await expect(card.locator('[data-t="sim-effective-deltas"]')).toContainText('黄金 −26（−40%）');
  await expect(card.locator('[data-t="sim-effective-source"]')).toContainText('已计入：王家敕令骑兵');
  await expect(page.locator('[data-t="sim-summary-note"]')).toHaveText('一次性研究投入，不计入单兵训练价');
  await expect(page.locator('.sim-summary-cost')).toContainText('400');
  await expect(page.locator('.sim-summary-cost')).toContainText('250');

  // 波斯弩手 24 + 488 → 50 木 0 金（显式展示 0 金）
  await page.goto('./#/unit/24/Persians/4/488?tab=sim');
  await expect(page.locator('[data-t="sim-effective-cost"]')).toHaveAttribute('data-state', 'changed');
  await expect(page.locator('[data-t="sim-effective-price"] [data-zero="true"]')).toContainText('0');
  await expect(page.locator('[data-t="sim-effective-deltas"]')).toContainText('木材 +25');
  await expect(page.locator('[data-t="sim-effective-deltas"]')).toContainText('黄金 −45（−100%）');

  // 马扎尔骠骑 869 + 514 → 80 肉 0 金
  await page.goto('./#/unit/869/Magyars/4/514?tab=sim');
  await expect(page.locator('[data-t="sim-effective-price"]')).toContainText('80');
  await expect(page.locator('[data-t="sim-effective-price"] [data-zero="true"]')).toContainText('0');

  // 马来民兵 74 + 625 → 70 肉 0 金
  await page.goto('./#/unit/74/Malay/4/625?tab=sim');
  await expect(page.locator('[data-t="sim-effective-price"]')).toContainText('70');
  await expect(page.locator('[data-t="sim-effective-price"] [data-zero="true"]')).toContainText('0');

  // 高丽战船 21：被动折扣 + 373 造船匠叠加态
  await page.goto('./#/unit/21/Koreans/4/?tab=sim');
  await expect(page.locator('[data-t="sim-effective-price"]')).toContainText('72');
  await expect(page.locator('[data-t="sim-effective-hint"]')).toContainText('造船匠');
  await page
    .locator('#sim label.simt')
    .filter({ has: page.getByRole('link', { name: '造船匠', exact: true }) })
    .locator('input[type="checkbox"]')
    .check();
  await expect(page.locator('[data-t="sim-effective-price"]')).toContainText('57.5');
  await expect(page.locator('[data-t="sim-effective-source"]')).toContainText('高丽');
  await expect(page.locator('[data-t="sim-effective-source"]')).toContainText('造船匠');
});

test('#1297 建筑详情文明被动折后价、时代切换、上下同步与建筑模拟器罗斯堡垒', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  // 法兰克城堡 82：帝王 487.5 石，切城堡 552.5 石且 replace 不增历史
  await page.goto('./#/building/82?civ=Franks&age=4');
  const disc = page.locator('[data-t="building-discount-price"]');
  await expect(disc).toBeVisible();
  await expect(disc.locator('[data-t="building-discount-amount"]')).toContainText('487.5');
  await expect(disc.locator('[data-t="building-discount-deltas"]')).toContainText('石料 −162.5（−25%）');
  const histBefore = await page.evaluate(() => history.length);
  await disc.getByRole('radio', { name: '城堡时代', exact: true }).click();
  await expect(page).toHaveURL(/age=3/);
  await expect(disc.locator('[data-t="building-discount-amount"]')).toContainText('552.5');
  await expect(disc.locator('[data-t="building-discount-deltas"]')).toContainText('石料 −97.5（−15%）');
  expect(await page.evaluate(() => history.length)).toBe(histBefore);

  // 无 ?age= 且 tab=sim 时：顶部默认城堡 552.5，下方默认帝王 487.5；点击顶部时代后上下同步
  await page.goto('./#/building/82?civ=Franks&tab=sim');
  await expect(disc.locator('[data-t="building-discount-amount"]')).toContainText('552.5');
  await expect(page.locator('#sim [data-t="sim-effective-price"]')).toContainText('487.5');
  await disc.getByRole('radio', { name: '城堡时代', exact: true }).click();
  await expect(page).toHaveURL(/age=3/);
  await expect(page.locator('#sim [data-t="sim-effective-price"]')).toContainText('552.5');

  // 不列颠城镇中心 109：缺省黑暗时代仍显示 4 时代切换器，点城堡切至 137.5 木 100 石
  await page.goto('./#/building/109?civ=Britons');
  await expect(disc.locator('[data-t="building-discount-wait"]')).toContainText('城堡时代起生效');
  await disc.getByRole('radio', { name: '城堡时代', exact: true }).click();
  await expect(disc.locator('[data-t="building-discount-amount"]')).toContainText('137.5');
  await expect(disc.locator('[data-t="building-discount-amount"]')).toContainText('100');

  // 马里兵营 12：跨时代恒定仅展示静态徽标；无文明与无折扣文明不渲染折后卡
  await page.goto('./#/building/12?civ=Malians');
  await expect(disc.locator('[data-t="building-discount-age"]')).toHaveText('按黑暗时代');
  await expect(disc.getByRole('radio')).toHaveCount(0);

  // 亚美尼亚骡车 1808：静态折后卡严格位于 catalog-cost 与 panel-time 之间，不干扰 921 文案守卫
  await page.goto('./#/building/1808?civ=Armenians');
  await expect(disc.locator('[data-t="building-discount-age"]')).toHaveText('按黑暗时代');
  await expect(disc.locator('[data-t="building-discount-amount"]')).toContainText('15');
  await expect(disc.locator('[data-t="building-discount-amount"]')).toContainText('60');
  await expect(page.locator('[data-t="panel-time"]')).not.toContainText('预填目录时代');
  expect(
    await page.evaluate(() => {
      const cat = document.querySelector('[data-t="catalog-cost"]')!;
      const card = document.querySelector('[data-t="building-discount-price"]')!;
      const time = document.querySelector('[data-t="panel-time"]')!;
      return [
        Boolean(cat.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING),
        Boolean(card.compareDocumentPosition(time) & Node.DOCUMENT_POSITION_FOLLOWING),
      ];
    }),
  ).toEqual([true, true]);

  await page.goto('./#/building/82');
  await expect(disc).toHaveCount(0);
  await page.goto('./#/building/82?civ=Britons&age=4');
  await expect(disc).toHaveCount(0);

  // 斯拉夫城堡 82 与瞭望箭塔 79 勾选 455 罗斯堡垒
  await page.goto('./#/building/82?tab=sim&civ=Slavs&age=4');
  await page
    .locator('#sim label.simt')
    .filter({ has: page.getByRole('link', { name: '罗斯堡垒', exact: true }) })
    .locator('input[type="checkbox"]')
    .check();
  await expect(page.locator('#sim [data-t="sim-effective-price"]')).toContainText('260');
  await expect(page.locator('#sim [data-t="sim-effective-price"]')).toContainText('390');
  await expect(page.locator('[data-t="sim-summary-note"]')).toHaveText('一次性研究投入，不计入单座建造价');

  await page.goto('./#/building/79?tab=sim&civ=Slavs&age=4');
  await page
    .locator('#sim label.simt')
    .filter({ has: page.getByRole('link', { name: '罗斯堡垒', exact: true }) })
    .locator('input[type="checkbox"]')
    .check();
  await expect(page.locator('#sim [data-t="sim-effective-price"]')).toContainText('85');
  await expect(page.locator('#sim [data-t="sim-effective-price"]')).toContainText('75');

  // 降时代 URL（age=2&techs=455）：高于当前时代的 455 自动剔除，左右一致
  await page.goto('./#/building/79?tab=sim&civ=Slavs&age=2&techs=455');
  const towerDetinets = page.locator('#sim label.simt').filter({ has: page.getByRole('link', { name: '罗斯堡垒', exact: true }) });
  await expect(towerDetinets.locator('input[type="checkbox"]')).not.toBeChecked();
  await expect(page.locator('#sim [data-t="sim-effective-cost"]')).toHaveAttribute('data-state', 'available');
});

test('#1297 马普切 2571 + 布图马普 1380 折后价与未解码边界提示（科那不误折价）', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/unit/2571?civ=Mapuche&tab=sim');
  const row1380 = page.locator('#sim label.simt').filter({ has: page.getByRole('link', { name: '布图马普', exact: true }) });
  await expect(row1380.locator('[data-t="sim-cost-badge"]')).toHaveText('影响造价');
  await expect(row1380.locator('[data-t="sim-undecoded-badge"]')).toHaveText('含未解码效果');
  await row1380.locator('input[type="checkbox"]').check();

  const card = page.locator('[data-t="sim-effective-cost"]');
  await expect(card).toHaveAttribute('data-state', 'changed-with-undecoded');
  await expect(card.locator('[data-t="sim-effective-price"]')).toContainText('42.5');
  await expect(card.locator('[data-t="sim-effective-price"]')).toContainText('47');
  await expect(card.locator('[data-t="sim-effective-price"] [data-zero="true"]')).toHaveCount(0);
  await expect(card.locator('[data-t="sim-effective-undecoded"]')).toHaveAttribute('role', 'status');
  await expect(card.locator('[data-t="sim-effective-undecoded"]')).toContainText('另含未解码的条件或资源触发效果');
  const text = await card.innerText();
  expect(text).not.toMatch(/res:\s*33|a:\s*100/i);

  // 科那 2566 维持原价，不编造 -15%
  await page.goto('./#/unit/2566?civ=Mapuche&tab=sim');
  await expect(page.locator('[data-t="sim-effective-cost"]')).toHaveAttribute('data-state', 'plain');
});

test('#1297 窄屏 360/390 与 1280 浅深主题：无溢出、数字不折行、44px 触控区与 WCAG AA 对比度', async ({ page }) => {
  for (const width of [360, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark'] as const) {
      await page.goto('./#/building/82?civ=Franks&age=4');
      await setTheme(page, theme);
      const disc = page.locator('[data-t="building-discount-price"]');
      await expect(disc).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await assertNoWrapNum(page, '[data-t="building-discount-price"]');
      for (const box of await disc.getByRole('radio').evaluateAll((els) => els.map((el) => el.getBoundingClientRect()))) {
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      const bldgAxe = await new AxeBuilder({ page }).include('[data-t="building-discount-price"]').withRules(['color-contrast']).analyze();
      expect(bldgAxe.violations, `building ${width} ${theme}`).toEqual([]);

      await page.goto('./#/unit/2701/Franks/4/1496?tab=sim');
      await expect(page.locator('[data-t="sim-effective-cost"]')).toHaveAttribute('data-state', 'changed');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await assertNoWrapNum(page, '[data-t="sim-effective-cost"]');
      const unitAxe = await new AxeBuilder({ page }).include('[data-t="sim-effective-cost"]').withRules(['color-contrast']).analyze();
      expect(unitAxe.violations, `unit ${width} ${theme}`).toEqual([]);
    }
  }
});
