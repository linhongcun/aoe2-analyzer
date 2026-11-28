import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

function armyCostUrl({
  civ,
  age = '4',
  rows,
  done = [],
  targets = [],
}: {
  civ: string;
  age?: string;
  rows: { unit: number; qty: string }[];
  done?: string[];
  targets?: string[];
}) {
  const params = new URLSearchParams({
    mode: 'army-cost',
    acv: '1',
    acdata: '188329',
    civ,
    age,
    acunits: JSON.stringify(rows),
    acdone: JSON.stringify(done),
    actargets: JSON.stringify(targets),
  });
  return `./#/production?${params.toString()}`;
}

async function setTheme(page: Page, value: 'light' | 'dark') {
  await page.evaluate((next) => {
    localStorage.setItem('aoe2-theme', next);
    document.documentElement.dataset.theme = next;
  }, value);
  await expect(page.locator('html')).toHaveAttribute('data-theme', value);
}

async function assertNoOverflowAndNoNumWrap(page: Page, scopeSelector: string) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const wrapped = await page.locator(`${scopeSelector} .nw`).evaluateAll((els) => {
    const bad: string[] = [];
    for (const el of els) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const range = document.createRange();
      range.selectNodeContents(el);
      const tops = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0).map((r) => r.top);
      if (tops.length > 1 && Math.max(...tops) - Math.min(...tops) > 6) {
        bad.push((el.textContent ?? '').trim());
      }
    }
    return bad;
  });
  expect(wrapped).toEqual([]);
}

test.describe('Issue 1499 人口空间变化科技详情与阵容费用账本端到端验收', () => {
  test('科技详情 #/tech/834 与 #/tech/924：展示、分组、链接、试算 CTA、双主题对比度与窄屏不折行', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    // 1. 大乘佛教 #/tech/834（1280 浅色）
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('./#/tech/834');
    await setTheme(page, 'light');
    await expect(page.locator('#tech h1')).toHaveText('大乘佛教');
    await expect(page.locator('.td-jump button', { hasText: '人口空间变化' })).toBeVisible();

    const sec834 = page.locator('#tech-population-changes');
    await expect(sec834).toBeVisible();
    await expect(sec834.locator('h2')).toHaveText('人口空间变化');
    await expect(sec834.locator('[data-t="pop-summary-pills"]')).toContainText('2 个受影响单位');
    await expect(sec834.locator('[data-t="pop-summary-pills"]')).toContainText('每名占 0.9 人口');
    await expect(sec834.locator('[data-t="pop-delta"]')).toHaveText('相对 1 人口 -10%');
    await expect(sec834.locator('[data-t="pop-unit-card"]')).toHaveCount(2);
    await expect(sec834.locator('[data-t="pop-unit-card"][data-unit-id="83"]')).toHaveAttribute('href', /#\/unit\/83\?civ=Bengalis$/);
    await expect(sec834.locator('[data-t="pop-unit-card"][data-unit-id="125"]')).toHaveAttribute('href', /#\/unit\/125\?civ=Bengalis$/);
    await expect(sec834).not.toContainText('传教士');
    await expect(sec834.locator('[data-action="army-cost"]')).toHaveText('在阵容账本中试算');
    await expect(sec834.locator('[data-action="production"]')).toHaveCount(0);
    await expect(sec834).not.toContainText('打开持续生产');
    await expect(sec834.locator('[data-t="pop-boundary"]')).toContainText('多人编队的小数人口累计与取整未做游戏内实测，本站不模拟人口上限或房屋供给');
    await expect(page.locator('.detail-source')).toContainText('本页不逐条模拟属性；阵容账本工具已采用固定数据编码，其余效果以游戏说明为准');
    await expect(page.locator('#tech')).not.toContainText('没有已解码数值规则');
    await assertNoOverflowAndNoNumWrap(page, '#tech-population-changes');

    const axe834Light = await new AxeBuilder({ page }).include('#tech-population-changes').withRules(['color-contrast']).analyze();
    expect(axe834Light.violations).toEqual([]);

    // 2. 大乘佛教 #/tech/834（360 深色）
    await page.setViewportSize({ width: 360, height: 800 });
    await setTheme(page, 'dark');
    await assertNoOverflowAndNoNumWrap(page, '#tech-population-changes');
    const unitSizes834 = await sec834.locator('.td-pop-unit, .td-cost-action').evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return { w: r.width, h: r.height };
      }),
    );
    expect(unitSizes834.every((s) => s.w >= 44 && s.h >= 44)).toBe(true);
    const axe834Dark = await new AxeBuilder({ page }).include('#tech-population-changes').withRules(['color-contrast']).analyze();
    expect(axe834Dark.violations).toEqual([]);

    // 3. 阿兹瑙里骑兵 #/tech/924（1280 浅色 + 390 浅色 + 360 深色）
    await page.setViewportSize({ width: 1280, height: 900 });
    await setTheme(page, 'light');
    await page.goto('./#/tech/924');
    await expect(page.locator('#tech h1')).toHaveText('阿兹瑙里骑兵');

    const sec924 = page.locator('#tech-population-changes');
    await expect(sec924).toBeVisible();
    await expect(sec924.locator('[data-t="pop-summary-pills"]')).toContainText('9 个受影响单位');
    await expect(sec924.locator('[data-t="pop-summary-pills"]')).toContainText('每名占 0.8 人口');
    await expect(sec924.locator('[data-t="pop-delta"]')).toHaveText('相对 1 人口 -20%');
    await expect(sec924.locator('[data-t="pop-building-group"]')).toHaveCount(3);
    await expect(sec924.locator('.td-pop-subhead').nth(0)).toHaveText('马厩（5 个）');
    await expect(sec924.locator('.td-pop-subhead').nth(1)).toHaveText('靶场（2 个）');
    await expect(sec924.locator('.td-pop-subhead').nth(2)).toHaveText('城堡（2 个）');
    await expect(sec924.locator('[data-t="pop-unit-card"]')).toHaveCount(9);
    await expect(sec924).toContainText('骑射手');
    await expect(sec924).toContainText('重装骑射手');
    await expect(sec924).toContainText('莫纳斯帕');
    await expect(sec924).toContainText('精锐莫纳斯帕');
    await expect(sec924).not.toContainText('游侠');
    await expect(sec924.locator('[data-t="pop-extra-details"]')).toHaveCount(0);
    await expect(sec924.locator('[data-action="production"]')).toHaveCount(0);
    await expect(page.locator('.detail-source')).toContainText('本页不逐条模拟属性；阵容账本工具已采用固定数据编码，其余效果以游戏说明为准');
    await assertNoOverflowAndNoNumWrap(page, '#tech-population-changes');

    await page.setViewportSize({ width: 390, height: 844 });
    await assertNoOverflowAndNoNumWrap(page, '#tech-population-changes');

    await page.setViewportSize({ width: 360, height: 800 });
    await setTheme(page, 'dark');
    await assertNoOverflowAndNoNumWrap(page, '#tech-population-changes');
    const axe924Dark = await new AxeBuilder({ page }).include('#tech-population-changes').withRules(['color-contrast']).analyze();
    expect(axe924Dark.violations).toEqual([]);

    // 4. 点击「在阵容账本中试算」真实跳转并完整核算
    await page.setViewportSize({ width: 1280, height: 900 });
    await setTheme(page, 'light');
    await sec924.locator('[data-action="army-cost"]').click();
    await expect(page.locator('[data-testid="army-cost-page"]')).toBeVisible();
    const resultsCard = page.locator('.army-results > .army-card').first();
    await expect(resultsCard.locator('h2')).toHaveText('本期新增费用合计');
    await expect(page.getByRole('heading', { name: '未计入清单' })).toHaveCount(0);
    await expect(page.locator('.army-ledger-entry').filter({ has: page.locator('h3', { hasText: '阿兹瑙里骑兵' }) })).toContainText('本次新增');
    expect(errors).toEqual([]);
  });

  test('阵容新增费用：孟加拉/格鲁吉亚完整计费、骑射手线与无关兵种四域越界拦截及恢复', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    const resultsCard = page.locator('.army-results > .army-card').first();

    // 1. 孟加拉复现链接完整态（1280 浅色）
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(
      armyCostUrl({
        civ: 'Bengalis',
        age: '4',
        rows: [
          { unit: 83, qty: '10' },
          { unit: 125, qty: '5' },
        ],
        targets: ['t:834'],
      }),
    );
    await setTheme(page, 'light');
    await expect(resultsCard.locator('h2')).toHaveText('本期新增费用合计');
    await expect(page.getByRole('heading', { name: '未计入清单' })).toHaveCount(0);
    await expect(resultsCard.locator('.army-primary')).toContainText('500');
    await expect(resultsCard.locator('.army-primary')).toContainText('800');
    await expect(resultsCard.locator('.army-primary')).toContainText('1,150');
    const mahEntry = page.locator('.army-ledger-entry').filter({ has: page.locator('h3', { hasText: '大乘佛教' }) });
    await expect(mahEntry).toContainText('本次新增');
    await expect(mahEntry).toContainText('第 1 行、第 2 行');
    await assertNoOverflowAndNoNumWrap(page, '[data-testid="army-cost-page"]');

    // 2. 格鲁吉亚复现链接完整态（1280 浅色 + 390 深色）
    await page.goto(
      armyCostUrl({
        civ: 'Georgians',
        age: '4',
        rows: [
          { unit: 1805, qty: '15' },
          { unit: 441, qty: '20' },
        ],
        targets: ['t:924'],
      }),
    );
    await expect(resultsCard.locator('h2')).toHaveText('本期新增费用合计');
    await expect(page.getByRole('heading', { name: '未计入清单' })).toHaveCount(0);
    await expect(resultsCard.locator('.army-primary')).toContainText('4,700');
    await expect(resultsCard.locator('.army-primary')).toContainText('2,275');
    const aznEntry = page.locator('.army-ledger-entry').filter({ has: page.locator('h3', { hasText: '阿兹瑙里骑兵' }) });
    await expect(aznEntry).toContainText('本次新增');
    await expect(aznEntry).toContainText('第 1 行、第 2 行');

    await page.setViewportSize({ width: 390, height: 844 });
    await setTheme(page, 'dark');
    await assertNoOverflowAndNoNumWrap(page, '[data-testid="army-cost-page"]');

    // 3. 反例：孟加拉无关兵种（492 劲弩手 ×10 + t:834，1280 浅色）与格鲁吉亚无关兵种（359 长戟兵 ×10 + t:924，360 浅色）
    await page.setViewportSize({ width: 1280, height: 900 });
    await setTheme(page, 'light');
    await page.goto(armyCostUrl({ civ: 'Bengalis', age: '4', rows: [{ unit: 492, qty: '10' }], targets: ['t:834'] }));
    await expect(resultsCard.locator('h2')).toHaveText('已核实项目小计');
    await expect(page.locator('.army-unit-row').first().locator('.army-line-total')).toContainText('250');
    await expect(page.locator('.army-unit-row').first().locator('.army-line-total')).toContainText('450');
    const neg834 = page.locator('.army-ledger-entry').filter({ has: page.locator('h3', { hasText: '大乘佛教' }) });
    await expect(neg834).toContainText('不属于当前阵容的战斗、训练费用、人口空间或形态研究；未计入');
    const uncounted = page.locator('.army-card').filter({ has: page.getByRole('heading', { name: '未计入清单' }) });
    await expect(uncounted).toContainText('不属于当前阵容的战斗、训练费用、人口空间或形态研究；未计入');
    await neg834.getByRole('button', { name: '移除无效研究' }).click();
    await expect(resultsCard.locator('h2')).toHaveText('本期新增费用合计');
    await expect(page.getByRole('heading', { name: '未计入清单' })).toHaveCount(0);

    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(armyCostUrl({ civ: 'Georgians', age: '4', rows: [{ unit: 359, qty: '10' }], targets: ['t:924'] }));
    await expect(resultsCard.locator('h2')).toHaveText('已核实项目小计');
    const neg924 = page.locator('.army-ledger-entry').filter({ has: page.locator('h3', { hasText: '阿兹瑙里骑兵' }) });
    await expect(neg924).toContainText('不属于当前阵容的战斗、训练费用、人口空间或形态研究；未计入');
    await assertNoOverflowAndNoNumWrap(page, '[data-testid="army-cost-page"]');

    expect(errors).toEqual([]);
  });
});
