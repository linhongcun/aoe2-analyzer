import { expect, test, type Locator, type Page } from '@playwright/test';

const VIEW = { width: 1280, height: 844 };
const KNIGHTS = '/production?rows=83:109:1,38:101:3';
const TRAIN_COMPARE = '/production?mode=train-compare&v=1&unit=38&age=3&n=10';

async function top(locator: Locator) {
  return locator.evaluate((element) => Math.round(element.getBoundingClientRect().top + window.scrollY));
}

async function open(page: Page, path = '/production') {
  await page.goto('./#' + path);
  await expect(page.locator('header.tool-head h1')).toBeVisible();
}

function modeNav(page: Page) {
  return page.getByRole('navigation', { name: '生产模式' });
}

test('#963 1280 首屏同时看到文明、需求和村民配置', async ({ page }) => {
  await page.setViewportSize(VIEW);
  await open(page);
  const civ = page.getByLabel('生产文明', { exact: true });
  const unit = page.getByLabel('需求 1 单位', { exact: true });
  const summary = page.locator('#production-summary-title');
  await expect(civ).toBeVisible();
  await expect(unit).toBeVisible();
  await expect(summary).toBeVisible();
  const civY = await top(civ);
  const unitY = await top(unit);
  const summaryY = await top(summary);
  test.info().annotations.push({ type: 'first-screen', description: `文明 ${civY} / 需求 1 单位 ${unitY} / 村民配置摘要 ${summaryY}` });
  expect(civY).toBeLessThan(844);
  expect(unitY).toBeLessThan(844);
  expect(summaryY).toBeLessThan(844);
  expect(await page.locator('.tool-grid').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(2);
  expect(
    await page.locator('.production-summary').evaluate((element) => {
      let node: Element | null = element;
      while (node && node !== document.body) {
        if (getComputedStyle(node).position === 'sticky') return true;
        node = node.parentElement;
      }
      return false;
    }),
  ).toBe(false);
  await expect(page.locator('.production-mode-nav')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '跳到结果', exact: true })).toBeHidden();
  await expect(page.locator('.production-summary')).toContainText('先合计每种资源的开销，再分别向上取整。');
  const warnings = page.locator('.production-warnings');
  if ((await warnings.count()) > 0) {
    await expect(page.locator('.production-summary .production-warnings')).toHaveCount(1);
    await expect(page.locator('.tool-foot .production-warnings')).toHaveCount(0);
  } else {
    await expect(page.locator('.tool-foot')).toContainText('当前方案没有额外的已知未支持机制。仍受上述训练与采集模型限制。');
  }
  await expect(page.locator('.tool-foot')).toContainText('计算口径与未计入项。');
  await expect(page.locator('.tool-foot')).toContainText('仅估算持续训练：');
  await expect(page.getByRole('heading', { name: '计算口径与未计入项', exact: true })).toHaveCount(0);
  const techColumns = await page.locator('.production-tech-groups').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
  expect(techColumns).toBeGreaterThan(1);
});

test('#963 ≥1024 隐藏跳到结果，更窄时单栏且条件在前', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 844 });
  await open(page);
  await expect(page.getByRole('button', { name: '跳到结果', exact: true })).toBeHidden();
  expect(await page.locator('.tool-grid').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(2);

  await page.setViewportSize({ width: 1000, height: 844 });
  await expect(page.getByRole('button', { name: '跳到结果', exact: true })).toBeVisible();
  expect(await page.locator('.tool-grid').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(1);
  expect(await top(page.getByLabel('生产文明', { exact: true }))).toBeLessThan(await top(page.locator('#production-summary-title')));

  await page.setViewportSize({ width: 390, height: 844 });
  const h1 = await top(page.locator('header.tool-head h1'));
  const civY = await top(page.getByLabel('生产文明', { exact: true }));
  const relatedY = await top(page.getByRole('navigation', { name: '相关工具' }));
  expect(civY).toBeGreaterThan(h1);
  expect(relatedY).toBeGreaterThan(civY);
  const jump = page.getByRole('button', { name: '跳到结果', exact: true });
  const copy = page.getByRole('button', { name: '复制方案链接', exact: true });
  await expect(jump).toBeVisible();
  await expect(copy).toBeVisible();
  expect((await jump.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect((await copy.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await jump.click();
  await expect(page.locator('#production-summary-title')).toBeFocused();
});

test('#963 点当前模式保留参数，另一模式仍去原来的入口', async ({ page }) => {
  await page.setViewportSize(VIEW);
  await open(page);
  const nav = modeNav(page);
  await expect(nav.getByRole('link', { name: '持续生产', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByRole('link', { name: '跨文明训练对照', exact: true })).not.toHaveAttribute('aria-current', 'page');
  await page.getByLabel('生产文明', { exact: true }).selectOption('Britons');
  await expect(page).toHaveURL(/civ=Britons/);
  const kept = page.url();
  await expect(nav.getByRole('link', { name: '持续生产', exact: true })).toHaveAttribute('href', new URL(kept).hash);
  await nav.getByRole('link', { name: '持续生产', exact: true }).click();
  await expect(page).toHaveURL(kept);
  await expect(page.getByLabel('生产文明', { exact: true })).toHaveValue('Britons');

  await nav.getByRole('link', { name: '跨文明训练对照', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(TRAIN_COMPARE.replace('?', '\\?') + '$'));
  await expect(page.getByRole('heading', { level: 1, name: '跨文明训练对照' })).toBeVisible();
  await expect(nav.getByRole('link', { name: '跨文明训练对照', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByRole('link', { name: '持续生产', exact: true })).toHaveAttribute('href', '#/production');
  const compareUrl = page.url();
  await nav.getByRole('link', { name: '跨文明训练对照', exact: true }).click();
  await expect(page).toHaveURL(compareUrl);
  await expect(page.getByLabel('对照单位', { exact: true })).toBeVisible();

  await page.goto('./#/production?mode=bad');
  await expect(page.getByRole('alert')).toContainText('对照模式缺失、重复或不支持。');
  await expect(modeNav(page).getByRole('link', { name: '跨文明训练对照', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('header.tool-head').getByRole('navigation', { name: '生产模式' })).toBeVisible();
});

test('#963 相关工具保留原文和地址，商路入口带入当前方案', async ({ page }) => {
  await page.setViewportSize(VIEW);
  const related = page.getByRole('navigation', { name: '相关工具' });
  const trade = related.getByRole('link', { name: '按当前生产金耗规划商路供给', exact: true });
  for (const path of ['/production', KNIGHTS]) {
    await open(page, path);
    await expect(related.getByRole('link', { name: '市场买卖预算', exact: true })).toHaveAttribute('href', '#/market');
    await expect(related.getByRole('link', { name: '经济科技收益：固定村民对比研究投入与增量', exact: true })).toHaveAttribute('href', '#/eco-payoff');
    await expect(related.getByRole('link', { name: '结合当前局面查看混兵条件', exact: true })).toHaveAttribute('href', '#/matchup/mixed-army');
    await expect(related.getByRole('link', { name: '在团战计划中约定主副兵种', exact: true })).toHaveAttribute('href', '#/team-plan');
    await expect(related.getByRole('link', { name: '另查固定圣物收益', exact: true })).toHaveAttribute('href', '#/relic-income');
    const source = new URLSearchParams((await trade.getAttribute('href'))!.split('?')[1]);
    expect(source.get('mode')).toBe('production');
    expect(source.get('civ')).toBe(await page.getByLabel('生产文明', { exact: true }).inputValue());
    expect(source.get('age')).toBe(await page.getByLabel('生产时代', { exact: true }).inputValue());
    const plan = new URLSearchParams(source.get('source')!);
    expect(plan.get('civ')).toBe(await page.getByLabel('生产文明', { exact: true }).inputValue());
    expect(plan.get('age')).toBe(await page.getByLabel('生产时代', { exact: true }).inputValue());
    expect(plan.get('walk')).toBe(await page.getByLabel('木金石单程距离', { exact: true }).inputValue());
    expect(plan.get('farm')).toBe(await page.getByLabel('农田单程距离', { exact: true }).inputValue());
    const rows = await page.getByTestId('production-row').evaluateAll((nodes) =>
      nodes.map((node) => {
        const value = (label: string) => (node.querySelector(`[aria-label$="${label}"]`) as HTMLInputElement | HTMLSelectElement).value;
        return `${value('单位')}:${value('建筑')}:${value('数量')}`;
      }),
    );
    expect(plan.get('rows')).toBe(rows.join(','));
    await expect(page.getByTestId('production-total')).toBeVisible();
    for (const key of ['Food', 'Wood', 'Gold', 'Stone']) await expect(page.getByTestId('production-resource-' + key)).toContainText('人');
  }
  const knightsTotal = await page.getByTestId('production-total').innerText();
  await open(page);
  expect(await page.getByTestId('production-total').innerText()).not.toBe(knightsTotal);
  await page.getByLabel('生产文明', { exact: true }).selectOption('Britons');
  const canonical = new URL(page.url()).hash.slice(1).split('?')[1];
  const carried = new URLSearchParams((await trade.getAttribute('href'))!.split('?')[1]);
  expect(carried.get('source')).toBe(canonical);
  await trade.click();
  await expect(page.getByTestId('trade-income-page')).toBeVisible();
  expect(new URL(page.url()).hash).toContain('mode=production');
  expect(new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('source')).toBe(canonical);

  await open(page, '/production?civ=Nope&rows=83:109:1');
  await expect(page.locator('.production-summary').getByRole('alert')).toContainText('链接中的文明无效');
  await expect(page.getByRole('button', { name: '复制方案链接', exact: true })).toBeDisabled();
  await expect(page.getByText('请先修正链接错误，再复制方案。', { exact: true })).toBeVisible();
  await expect(related.getByRole('link', { name: '按当前生产金耗规划商路供给', exact: true })).toHaveCount(0);
  await expect(related).toContainText('修正当前生产配置后可带入商路供给。');
  await expect(page.locator('.production-summary').getByRole('button', { name: '重置方案', exact: true })).toBeVisible();

  await open(page, '/production?rows=');
  await expect(page.locator('.production-summary').getByTestId('production-empty')).toBeVisible();
  await expect(page.getByTestId('production-total')).toContainText('合计');
});

test('#963 页头按钮视觉 36px、热区至少 44px，模式切换和相关工具同样可点', async ({ page }) => {
  await page.setViewportSize(VIEW);
  await open(page);
  const copy = page.getByRole('button', { name: '复制方案链接', exact: true });
  const box = await copy.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(36);
  expect(box!.height).toBeLessThan(40);
  expect(
    await copy.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const x = Math.round(rect.left + rect.width / 2);
      return document.elementFromPoint(x, rect.top - 3) === element && document.elementFromPoint(x, rect.bottom + 3) === element;
    }),
  ).toBe(true);
  for (const link of await modeNav(page).getByRole('link').all()) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  for (const link of await page.getByRole('navigation', { name: '相关工具' }).getByRole('link').all()) {
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }

  await page.goto('./#/start');
  await expect(page.locator('header.tool-head')).toHaveCount(0);
});
