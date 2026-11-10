import { expect, test } from '@playwright/test';
import civs from '../../src/data/civs.json' with { type: 'json' };
import releases from '../../src/data/catalog-introductions.json' with { type: 'json' };
import techs from '../../src/data/techs.json' with { type: 'json' };

const total = techs.length;
const unique = techs.filter((t) => t.type === 'UniqueTech').length;
const updates = techs.filter((t) => releases.techUpdates[t.id]).length;
const unlabeled = techs.filter((t) => (releases.techs[t.id] ?? null) === null && !releases.techUpdates[t.id]).length;
const yeomen = techs.find((t) => t.id === 3)!;
const civZh = (en: string) => civs.find((civ) => civ.en === en)!.zh;
const BASIS = '费用为目录基础值，未计入文明折扣。时代按目录字段精确匹配，不代表当前仍可研究。';

test('#883 1280：列对齐目录、搜索与会话筛选', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('./#/techs');
  await expect(page.locator('#techs h1')).toHaveText('科技');
  await expect(page.locator('#techs .lhead')).toContainText('按名称、类别、时代、研究建筑或首发版本查找科技。');
  await expect(page.locator('#tq')).toHaveAttribute('placeholder', '搜索名称、拼音、效果或已收录别名');
  await expect(page.locator('#tcnt')).toHaveText(`${total} / ${total} 项科技`);
  await expect(page.getByRole('button', { name: '清空筛选', exact: true })).toHaveCount(0);
  await expect(page.locator('.catalog-filter-active')).toHaveCount(0);
  await expect(page.locator('.tech-basis')).toHaveText(BASIS);
  await expect(page.locator('#ta')).toBeVisible();
  await expect(page.locator('#tb')).toBeVisible();
  await expect(page.locator('#tdlc')).toBeVisible();
  await expect(page.locator('#tdlc option', { hasText: '国王时代' })).toHaveCount(1);
  await expect(page.locator('#tdlc option', { hasText: `未标注（当前 ${unlabeled}）` })).toHaveCount(1);
  const head = page.locator('.tech-head');
  await expect(head).toBeVisible();
  await expect(head).not.toHaveAttribute('aria-hidden', 'true');
  expect(await head.locator('[aria-hidden="true"]').count()).toBe(0);
  await expect(head).toContainText('科技');
  await expect(head).toContainText('研究建筑');
  await expect(head).toContainText('费用');
  await expect(head).toContainText('首发');
  await expect(page.locator('#tgrid .tech-row').filter({ hasText: '国王时代' })).toHaveCount(0);

  const first = page.locator('#tgrid .tech-row').first();
  await expect(first).toHaveAttribute('data-tech-id', '3');
  await expect(first).toHaveAttribute('href', '#/tech/3');
  await expect(first.locator('.tech-civ')).toHaveText(civZh('Britons'));
  await expect(first.locator('.tech-release')).toHaveText('征服者');
  await expect(first).toContainText(String(yeomen.cost.Wood));
  await expect(first).toContainText(String(yeomen.cost.Gold));
  await first.focus();
  expect(await first.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');

  await page.locator('#tt button[data-v="UniqueTech"]').click();
  await expect(page.locator('#tcnt')).toHaveText(`${unique} / ${total} 项科技`);
  await expect(page.locator('.catalog-filter-active')).toHaveText('独特科技');
  await expect(page.locator('#tgrid .tech-row[data-tech-id="1452"]')).toHaveCount(0);
  await expect(page.locator('#tgrid .tech-row[data-tech-id="1014"]')).toHaveCount(0);
  await page.getByRole('button', { name: '清空筛选', exact: true }).click();
  await expect(page.locator('#tcnt')).toHaveText(`${total} / ${total} 项科技`);

  for (const query of ['英皇侍卫', 'yhsw']) {
    await page.locator('#tq').fill(query);
    const row = page.locator('#tgrid .tech-row');
    await expect(row).toHaveCount(1);
    await expect(row).toHaveAttribute('data-tech-id', '3');
  }
  await rowLink(page);
  await expect(page).toHaveURL(/#\/tech\/3$/);
  await expect(page.locator('#tech h1')).toContainText('英皇侍卫');
  await page.locator('nav.crumbs a', { hasText: '科技' }).click();
  await expect(page.locator('#tq')).toHaveValue('yhsw');
  await expect(page.locator('#tgrid .tech-row')).toHaveAttribute('data-tech-id', '3');

  await page.locator('#tq').fill('堡垒');
  const forts = page.locator('#tgrid .tech-row');
  await expect(forts).toHaveCount(4);
  await expect(forts.nth(0)).toHaveAttribute('data-tech-id', '455');
  await expect(forts.nth(1)).toHaveAttribute('data-tech-id', '482');
  await expect(forts.nth(2)).toHaveAttribute('data-tech-id', '996');
  await expect(forts.nth(3)).toHaveAttribute('data-tech-id', '7');
  await expect(forts.nth(1).locator('.tech-en')).toHaveText('Stronghold');
  await expect(forts.nth(1).locator('.tech-civ')).toHaveText(civZh('Celts'));
  await expect(forts.nth(1).locator('.tech-age')).toContainText('城堡时代');
  await expect(forts.nth(3).locator('.tech-en')).toHaveText('Citadels');
  await expect(forts.nth(3).locator('.tech-civ')).toHaveText(civZh('Persians'));
  await expect(forts.nth(3).locator('.tech-age')).toContainText('帝王时代');

  await page.locator('#tq').fill('绞盘弩');
  const regional = page.locator('#tgrid .tech-row');
  await expect(regional).toHaveCount(1);
  await expect(regional).toHaveAttribute('data-tech-id', '1452');
  await expect(regional.locator('.tech-civ')).toHaveText('');
  await expect(regional).not.toContainText('区域');
  await page.locator('#tq').fill('驯化术');
  await expect(page.locator('#tgrid .tech-row')).toHaveAttribute('data-tech-id', '1014');
  await expect(page.locator('#tgrid .tech-row .tech-civ')).toHaveText('');
  await expect(page.locator('#tgrid .tech-row')).not.toContainText('契丹');

  await page.locator('#tq').fill('');
  await page.locator('#tdlc').selectOption('update');
  await expect(page.locator('#tcnt')).toHaveText(`${updates} / ${total} 项科技`);
  await expect(page.locator('#tgrid .tech-row[data-tech-id="875"] .tech-release')).toHaveText('免费更新 · 81058');
  await page.locator('#tdlc').selectOption('none');
  await expect(page.locator('#tcnt')).toHaveText(`${unlabeled} / ${total} 项科技`);
  await expect(page.getByText('没有符合条件的科技。')).toBeVisible();
  await page.locator('.tech-empty button').click();
  await expect(page.locator('#tcnt')).toHaveText(`${total} / ${total} 项科技`);
  await expect(page.locator('#tdlc')).toHaveValue('');

  await page.locator('#tq').fill('Fletching');
  await expect(page.locator('#tgrid .tech-row .tech-release')).toHaveText('');
  await expect(page.locator('#tgrid .tech-row')).not.toContainText('国王时代');
  await page.locator('#ta').selectOption('3');
  await expect(page.locator('.tech-basis')).toHaveText(BASIS);
  await page.locator('#tq').fill('英皇侍卫');
  await expect(page.locator('#tgrid .tech-row')).toContainText(String(yeomen.cost.Wood));
  await expect(page.locator('#tgrid .tech-row')).toContainText(String(yeomen.cost.Gold));
  expect(errors).toEqual([]);
});

test('#883 深色仍是同一套目录结构', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() => localStorage.setItem('aoe2-theme', 'dark'));
  await page.goto('./#/techs');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('#tcnt')).toHaveText(`${total} / ${total} 项科技`);
  await expect(page.locator('.tech-basis')).toBeVisible();
  await expect(page.locator('.tech-head')).toBeVisible();
  await expect(page.locator('#tgrid .tech-row').first()).toBeVisible();
  await expect(page.locator('#tdlc')).toBeVisible();
});

test('#883 390：次筛选默认收起，摘要留在外面', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('./#/techs');
  const first = page.locator('#tgrid .tech-row').first();
  await expect(first).toBeVisible();
  await expect(page.locator('.tech-head')).toBeHidden();
  await expect(page.locator('#tq')).toBeVisible();
  await expect(page.locator('#tt')).toBeVisible();
  await expect(page.locator('#tcnt')).toHaveText(`${total} / ${total} 项科技`);
  await expect(page.locator('.tech-basis')).toBeVisible();
  await expect(page.locator('.catalog-filter-toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.tech-secondary')).toBeHidden();
  await expect(first.locator('.tech-zh')).toHaveText(yeomen.zh);
  await expect(first.locator('.tech-en')).toHaveText(yeomen.en);
  await expect(first.locator('.tech-k', { hasText: '建筑' })).toBeVisible();
  await expect(first.locator('.tech-k', { hasText: '时代' })).toBeVisible();
  await expect(first.locator('.tech-k', { hasText: '费用' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.locator('#tq').fill('绞盘弩');
  await expect(page.locator('.catalog-filter-active')).toHaveText('搜索「绞盘弩」');
  await expect(page.locator('.tech-meta').getByRole('button', { name: '清空筛选', exact: true })).toBeVisible();
  await expect(page.locator('.tech-secondary')).toBeHidden();
  await page.locator('.catalog-filter-toggle').click();
  await expect(page.locator('#ta')).toBeVisible();
  await expect(page.locator('#tb')).toBeVisible();
  await expect(page.locator('#tdlc')).toBeVisible();
  await page.locator('#ta').selectOption('4');
  await page.keyboard.press('Escape');
  await expect(page.locator('.tech-secondary')).toBeHidden();
  await expect(page.locator('.catalog-filter-active')).toContainText('搜索「绞盘弩」');
  await expect(page.locator('.catalog-filter-active')).toContainText('帝王时代');
  await expect(page.locator('.tech-meta').getByRole('button', { name: '清空筛选', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

async function rowLink(page: import('@playwright/test').Page) {
  await page.locator('#tgrid .tech-row').click();
}
