import { expect, test, type Locator, type Page } from '@playwright/test';

const PLACEHOLDER = '搜索文明、单位、科技、术语、页面、开局';
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', (error) => messages.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') messages.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

async function holdSearchChunk(page: Page) {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/(?:assets\/CommandPalette-[^/]+\.js|src\/features\/search\/components\/CommandPalette\.tsx)(?:\?.*)?$/, async (route) => {
    await held;
    await route.continue();
  });
  return async () => {
    release();
    await page.unrouteAll({ behavior: 'wait' });
  };
}

const dialogOf = (page: Page) => page.getByRole('dialog', { name: '全局搜索', exact: true });
const listOf = (page: Page) => dialogOf(page).getByRole('listbox', { name: '搜索结果', exact: true });
const tagOf = (option: Locator) => option.locator('.tag');

test('#773 搜索占位文案覆盖实际索引范围，加载态与正式面板一致', async ({ page }) => {
  const release = await holdSearchChunk(page);
  try {
    await page.goto('./#/');
    await expect(page.locator('#home h1')).toBeVisible();
    await page.getByRole('button', { name: '全局搜索', exact: true }).click();
    const loading = dialogOf(page).getByRole('textbox', { name: '全局搜索', exact: true });
    await expect(loading).toHaveAttribute('placeholder', PLACEHOLDER);
    await expect(dialogOf(page)).toContainText('加载中');
    await release();
    const ready = dialogOf(page).getByRole('combobox', { name: '全局搜索', exact: true });
    await expect(ready).toHaveAttribute('placeholder', PLACEHOLDER);
    await expect(ready).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialogOf(page)).toHaveCount(0);
  } finally {
    await release();
  }
  // Ctrl+K 入口看到同一份占位文案
  await page.keyboard.press('Control+k');
  await expect(dialogOf(page).getByRole('combobox', { name: '全局搜索', exact: true })).toHaveAttribute('placeholder', PLACEHOLDER);
});

test('#773 具体开局结果类型标「开局」，「开局流程」百科页仍是「页面」', async ({ page }) => {
  await page.goto('./#/');
  await expect(page.locator('#home h1')).toBeVisible();
  await page.keyboard.press('Control+k');
  const input = dialogOf(page).getByRole('combobox', { name: '全局搜索', exact: true });
  const list = listOf(page);
  await input.fill('黑快');
  const builds = list.getByRole('option').filter({ hasText: '开局时间线' });
  await expect(builds).toHaveCount(3);
  for (const build of await builds.all()) await expect(tagOf(build)).toHaveText('开局');
  // 百科页「开局流程」与具体开局分开显示类型
  await input.fill('开局流程');
  const pageHit = list
    .getByRole('option')
    .filter({ has: page.locator('b', { hasText: '开局流程' }) })
    .first();
  await expect(pageHit).toBeVisible();
  await expect(tagOf(pageHit)).toHaveText('页面');
  // 无结果态与 Esc 关闭不变
  await input.fill('zzzz-no-result-773');
  await expect(list).toContainText('无匹配结果');
  await page.keyboard.press('Escape');
  await expect(dialogOf(page)).toHaveCount(0);
});

test('#773 开局结果仍可用方向键选择并回车打开对应开局', async ({ page }) => {
  await page.goto('./#/');
  await expect(page.locator('#home h1')).toBeVisible();
  await page.keyboard.press('Control+k');
  const input = dialogOf(page).getByRole('combobox', { name: '全局搜索', exact: true });
  const list = listOf(page);
  await input.fill('黑快');
  const options = list.getByRole('option');
  await expect(options.first()).toHaveAttribute('aria-selected', 'true');
  await input.press('ArrowDown');
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(input).toHaveAttribute('aria-activedescendant', (await options.nth(1).getAttribute('id'))!);
  await expect(tagOf(options.nth(1))).toHaveText('开局');
  await input.press('Enter');
  await expect(page).toHaveURL(/#\/builds\?bo=/);
  await expect(page.locator('#builds')).toBeVisible();
});

test('#773 开局仍靠 late 排在同名实体结果之后（排序不回退）', async ({ page }) => {
  await page.goto('./#/');
  await expect(page.locator('#home h1')).toBeVisible();
  await page.keyboard.press('Control+k');
  const input = dialogOf(page).getByRole('combobox', { name: '全局搜索', exact: true });
  const options = listOf(page).getByRole('option');
  for (const query of ['武士', '骑士', '长剑', '弓箭手']) {
    await input.fill(query);
    await expect(options.first()).toBeVisible();
    await expect(tagOf(options.first()), query).not.toHaveText('开局');
    await expect(options.first(), query).not.toContainText('开局时间线');
  }
});
