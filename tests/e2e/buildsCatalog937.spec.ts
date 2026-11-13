import { expect, test, type Page } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import type { BuildOrder } from '../../src/domain/buildOrder';

const orders = readdirSync(new URL('../../src/data/build-orders/', import.meta.url))
  .filter((file) => file.endsWith('.json'))
  .map((file) => JSON.parse(readFileSync(new URL(`../../src/data/build-orders/${file}`, import.meta.url), 'utf8')) as BuildOrder)
  .sort((a, b) => a.target.age - b.target.age || a.target.vils - b.target.vils || a.id.localeCompare(b.id));

const hashQuery = (page: Page) => new URLSearchParams(new URL(page.url()).hash.split('?')[1] ?? '');

test('#937 目录比较开局，时间动态，不展开步骤', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/builds');
  await expect(page.locator('header.topbar')).toBeVisible();
  await expect(page.getByRole('heading', { name: '开局流程', exact: true })).toBeVisible();
  await expect(page.getByText('比较并选择一套开局，再查看时间线或专注跟练。')).toBeVisible();
  await expect(page.getByText(`${orders.length} 个主流开局`)).toBeVisible();
  await expect(page.getByRole('link', { name: '查看术语与缩写', exact: true })).toHaveAttribute('href', '#/glossary');
  await expect(page.getByText('选一个开局，看看你会卡在哪')).toHaveCount(0);
  await expect(page.locator('.tl-empty, .bo-steps')).toHaveCount(0);
  await expect(page.locator('[data-t="build-order"]')).toHaveCount(orders.length);
  const firstCard = await page.locator('[data-t="build-order"]').nth(0).boundingBox();
  const secondCard = await page.locator('[data-t="build-order"]').nth(1).boundingBox();
  expect(secondCard!.x).toBeGreaterThanOrEqual(firstCard!.x + firstCard!.width);
  expect(secondCard!.y).toBe(firstCard!.y);
  await expect(page.getByRole('link', { name: '查看时间线', exact: true })).toHaveCount(orders.length);
  await expect(page.getByRole('link', { name: '专注跟练', exact: true })).toHaveCount(orders.length);
  for (const [label, href] of [
    ['先看懂一局的目标与角色', '#/game-guide'],
    ['赛后整理事实与下局目标', '#/match-review'],
    ['先从教程与战役认识游戏', '#/campaigns'],
    ['查看本体包含和可选内容', '#/content-guide'],
  ] as const) {
    await expect(page.getByRole('link', { name: label, exact: true })).toHaveAttribute('href', href);
  }
  await expect(page.locator('#builds a[data-t="feedback"]')).toBeVisible();
  await expect(page.locator('[data-t="bo-time"]')).toHaveCount(orders.length);
  const catalog = await page.locator('#builds').innerText();
  expect(catalog).not.toMatch(/推荐文明|难度|风格|beginner|intermediate|advanced/);
  expect(catalog).toContain('阿拉伯半岛');
  expect(catalog).toContain('混合图 / 近岸安全渔场');
  expect(catalog).toContain('18 村民封建');
  for (const order of orders) {
    const item = page.locator(`#bo-${order.id}`);
    await expect(item).toContainText(order.name.zh);
    await expect(item).toContainText(order.name.en);
    await expect(item).toContainText(order.summary);
    await expect(item.locator('[data-t="bo-time"]')).toHaveText(/^约 \d+:\d\d/);
    await expect(item.locator('[data-t="bo-basis"]')).toHaveText('按通用计');
    await expect(item).toContainText(`${await item.locator('[data-t="bo-time"]').innerText()}，按通用计`);
  }
  expect(page.url()).not.toContain('bo=');
});

test('#937 时间线返回保留 civ，清掉 bo/view，并把刚看的条目带回视野', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/builds?bo=drush-fc&view=practice&civ=Franks&dist=4');
  await expect(page.getByTestId('build-practice')).toBeVisible();
  await page.getByRole('link', { name: '返回时间线', exact: true }).click();
  await expect(page.locator('[data-t="timeline"]')).toBeVisible();
  await expect(page.getByRole('navigation', { name: '面包屑' })).toContainText('民兵骚扰转速升城堡');
  await expect(page.getByRole('list', { name: '时间线', exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: '步骤' })).toBeVisible();
  await expect(page.getByRole('button', { name: '分享', exact: true }).first()).toBeVisible();
  await page.getByRole('link', { name: '返回开局列表', exact: true }).first().click();
  await expect.poll(() => [hashQuery(page).get('civ'), hashQuery(page).get('bo'), hashQuery(page).get('view')]).toEqual(['Franks', null, null]);
  const item = page.locator('#bo-drush-fc');
  await expect(item).toBeInViewport();
});

test('#937 非法 bo 只清自身；未知 view 留在时间线', async ({ page }) => {
  await page.goto('./#/builds?bo=not-a-build&civ=Franks&dist=7&house=0&step=3&var=aggr&from=matchup&me=Mongols&opp=Chinese');
  await expect(page.getByText('链接中的开局无效，已显示全部开局。', { exact: true })).toBeVisible();
  await expect
    .poll(() => {
      const query = hashQuery(page);
      return [
        query.get('bo'),
        query.get('civ'),
        query.get('dist'),
        query.get('house'),
        query.get('step'),
        query.get('var'),
        query.get('from'),
        query.get('me'),
        query.get('opp'),
      ];
    })
    .toEqual([null, 'Franks', '7', '0', '3', 'aggr', 'matchup', 'Mongols', 'Chinese']);
  await page.goto('./#/builds?civ=Franks');
  await expect(page.getByText('链接中的开局无效，已显示全部开局。', { exact: true })).toHaveCount(0);

  await page.goto('./#/builds?bo=scouts-18&view=nope&civ=Britons');
  await expect(page.locator('[data-t="timeline"]')).toBeVisible();
  await expect(page.getByText('链接中的开局无效，已显示全部开局。')).toHaveCount(0);
  await expect.poll(() => [hashQuery(page).get('bo'), hashQuery(page).get('view'), hashQuery(page).get('civ')]).toEqual(['scouts-18', 'nope', 'Britons']);
});

test('#937 跟练进度刷新不保存，未计入也不关掉跟练', async ({ page }) => {
  await page.goto('./#/builds?bo=scouts-18&view=practice');
  await expect(page.getByTestId('practice-progress')).toContainText('当前第 1 /');
  await page.getByRole('button', { name: '完成这一步，继续', exact: true }).click();
  await expect(page.getByTestId('practice-progress')).toContainText('当前第 2 /');
  await page.reload();
  await expect(page.getByTestId('practice-progress')).toContainText('当前第 1 /');
  await page.goto('./#/builds');
  const practice = page.locator('.bo-catalog-practice');
  await expect(practice).toHaveCount(orders.length);
  for (const link of await practice.all()) await expect(link).not.toHaveAttribute('aria-disabled', 'true');
});

test('#937 回对局助手保留 from/me/opp', async ({ page }) => {
  await page.goto('./#/builds?bo=scouts-18&civ=Mongols&from=matchup&opp=Chinese');
  const back = page.getByRole('link', { name: '回对局助手', exact: true });
  await expect(back).toHaveAttribute('href', '#/matchup?me=Mongols&opp=Chinese');
  await back.click();
  await expect.poll(() => [hashQuery(page).get('me'), hashQuery(page).get('opp')]).toEqual(['Mongols', 'Chinese']);
});

test('#937 390 深色下目录可点并可返回', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/builds');
  await page.getByRole('button', { name: '菜单', exact: true }).click();
  await page.getByRole('radio', { name: '深色', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: '关闭菜单', exact: true }).click();
  await expect(page.locator('nav.mainnav')).toBeHidden();
  const button = page.locator('.bo-catalog-go').first();
  const box = await button.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await button.click();
  await expect(page.locator('[data-t="timeline"]')).toBeVisible();
  await page.getByRole('link', { name: '返回开局列表', exact: true }).first().click();
  await expect(page.locator('[data-t="build-order"]').first()).toBeVisible();
  await expect.poll(() => hashQuery(page).has('bo')).toBe(false);
});
