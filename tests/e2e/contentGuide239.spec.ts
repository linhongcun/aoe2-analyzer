import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const failures = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  failures.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
});
test.afterEach(async ({ page }) => {
  expect(failures.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
const mode = (page: Page) => page.getByRole('combobox', { name: '适用模式', exact: true });
const kind = (page: Page) => page.getByRole('combobox', { name: '内容类型', exact: true });
const pack = (page: Page) => page.getByRole('combobox', { name: '指定商品', exact: true });
const search = (page: Page) => page.getByRole('searchbox', { name: '搜索内容（中文或英文）', exact: true });

test('#239 完整17条、包含规则、真实未知字段及折叠证据', async ({ page }) => {
  await page.goto('./#/content-guide');
  await expect(page.getByTestId('content-guide-page')).toBeVisible();
  await expect(page.locator('.cg-card')).toHaveCount(17);
  for (const id of ['lords-of-the-west', 'dawn-of-the-dukes', 'dynasties-of-india']) {
    await expect(page.locator(`[data-product="${id}"] [data-testid="content-acquisition"]`)).toHaveText('当前本体已包含');
  }
  const soundtrack = page.locator('[data-product="soundtrack"]');
  await expect(soundtrack.getByTestId('content-acquisition')).toHaveText('另购');
  await expect(soundtrack.getByTestId('content-prerequisite')).toHaveText('前置条件暂未核实');
  await expect(page.locator('[data-product="enhanced-graphics"] [data-testid="content-acquisition"]')).toHaveText('免费可选下载');
  await expect(page.locator('.cg-sources[open]')).toHaveCount(0);
  await soundtrack.locator('summary').click();
  await expect(soundtrack.getByRole('link', { name: 'Age of Empires II: Definitive Edition Soundtrack', exact: true })).toHaveAttribute('href', 'https://store.steampowered.com/app/1228810/');
  await expect(soundtrack.locator('.cg-sources')).toContainText('2026-10-20');
  await page.getByText('购买口径、旧拥有者与模式边界', { exact: true }).click();
  await expect(page.getByRole('link', { name: '查看文明历史首发列表' })).toHaveAttribute('href', '#/dlc');
});

test('#239 模式内容同块交集，不把RoR战役拼成常规AoE2战役', async ({ page }) => {
  await page.goto('./#/content-guide');
  await mode(page).selectOption('aoe2');
  await kind(page).selectOption('campaigns');
  await expect(page.locator('[data-product="return-of-rome"]')).toHaveCount(0);
  await mode(page).selectOption('return-of-rome');
  await expect(page.locator('.cg-card')).toHaveCount(1);
  await expect(page.locator('.cg-card')).toHaveAttribute('data-product', 'return-of-rome');
  await expect(page.locator('.cg-card')).toContainText('7个');
  await expect(page.locator('[data-content-id="return-of-rome:Trajan"]')).toBeVisible();
  await expect(page.locator('[data-content-id="aoe2:Romans"]')).toHaveCount(0);
  await kind(page).selectOption('civilizations');
  await mode(page).selectOption('aoe2');
  await pack(page).selectOption('return-of-rome');
  await expect(page.locator('[data-content-id="aoe2:Romans"]')).toBeVisible();
  await search(page).fill('Trajan');
  await expect(page.getByRole('heading', { name: '没有匹配的内容' })).toBeVisible();
  await expect(pack(page)).toHaveValue('return-of-rome');
});

test('#239 纯剧本及中英文内容可搜索，Chronicles互不前置且无古代文明死链', async ({ page }) => {
  await page.goto('./#/content-guide');
  await search(page).fill('Ragnar');
  await expect(page.locator('.cg-card')).toHaveCount(1);
  await expect(page.locator('.cg-card')).toHaveAttribute('data-product', 'victors-and-vanquished');
  await page.getByRole('button', { name: '清空全部筛选', exact: true }).click();
  await mode(page).selectOption('chronicles');
  await kind(page).selectOption('civilizations');
  await expect(page.locator('.cg-card')).toHaveCount(2);
  await expect(page.locator('.cg-names a')).toHaveCount(0);
  const alexander = page.locator('[data-product="chronicles-alexander-the-great"]');
  await expect(alexander.getByTestId('content-prerequisite')).toHaveText('需 Steam 版决定版本体');
  await expect(alexander).toContainText('不进排位');
  await search(page).fill('斯巴达');
  await expect(page.locator('.cg-card')).toHaveCount(1);
  await expect(page.locator('.cg-card')).toHaveAttribute('data-product', 'chronicles-battle-for-greece');
});

test('#239 无结果保留筛选，pack-only上下文与刷新完整恢复', async ({ page }) => {
  await page.goto('./#/content-guide?pack=base');
  await expect(pack(page)).toHaveValue('base');
  await expect(page.locator('.cg-card')).toHaveCount(1);
  await expect(page.locator('.cg-card')).toHaveAttribute('data-product', 'base');
  await pack(page).selectOption('all');
  await mode(page).selectOption('chronicles');
  await kind(page).selectOption('cosmetics');
  await expect(page.getByRole('heading', { name: '没有匹配的内容' })).toBeVisible();
  await page.reload();
  await expect(mode(page)).toHaveValue('chronicles');
  await expect(kind(page)).toHaveValue('cosmetics');
  await page.getByRole('button', { name: '查看全部内容', exact: true }).click();
  await expect(page.locator('.cg-card')).toHaveCount(17);
});

test('#239 损坏与超长链接暂停展示，语义错误保留供修正', async ({ page }) => {
  for (const query of ['pack=base&pack=base', 'pack=%FF', 'v=9&q=&mode=all&kind=all&pack=all', 'pack=base&unknown=1', 'q=' + 'a'.repeat(4096)]) {
    await page.goto('./#/content-guide?' + query);
    await expect(page.getByRole('heading', { name: '内容导航链接无法恢复' })).toBeVisible();
    await expect(page.locator('.cg-card')).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: '保留原链接', exact: true })).toHaveValue(page.url());
  }
  await page.getByRole('button', { name: '显式重置筛选', exact: true }).click();
  await expect(page.locator('.cg-card')).toHaveCount(17);
  await page.goto('./#/content-guide?v=1&q=keep&mode=future&kind=all&pack=all');
  await expect(page.getByRole('alert')).toContainText('已保留');
  await expect(search(page)).toHaveValue('keep');
  await expect(mode(page)).toHaveValue('future');
  await expect(page.locator('.cg-card')).toHaveCount(0);
  await mode(page).selectOption('all');
  await expect(search(page)).toHaveValue('keep');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('#239 成功复制含完整状态，拒绝时提供未截断手动链接', async ({ page }) => {
  await page.goto('./#/content-guide');
  await mode(page).selectOption('return-of-rome');
  await kind(page).selectOption('campaigns');
  await search(page).fill('图拉真');
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => localStorage.setItem('content-guide-test-link', text) } }));
  await page.getByRole('button', { name: '复制筛选链接', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '链接已复制' })).toBeVisible();
  const copied = await page.evaluate(() => localStorage.getItem('content-guide-test-link'));
  const url = new URL(copied!);
  expect(Object.fromEntries(url.searchParams)).toEqual({ v: '1', q: '图拉真', mode: 'return-of-rome', kind: 'campaigns', pack: 'all' });
  expect(url.pathname).toMatch(/\/content-guide\/$/);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied'); } } }));
  await page.getByRole('button', { name: '复制筛选链接', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '手动复制完整链接', exact: true })).toHaveValue(copied!);
  await expect(page.getByRole('status').filter({ hasText: '自动复制失败' })).toBeVisible();
});

for (const width of [360, 375, 390, 1280]) for (const theme of ['light', 'dark']) {
  test(`#239 ${width}px ${theme}首屏输入、44px控件、AA、键盘与长来源`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
    await page.goto('./#/content-guide');
    await expect(page.locator('.cg-card')).toHaveCount(17);
    const bounds = await search(page).boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThan(900);
    await search(page).focus();
    await page.keyboard.press('Tab');
    await expect(mode(page)).toBeFocused();
    await pack(page).selectOption('icons-barbarossa');
    await page.locator('.cg-sources summary').click();
    const small = await page.locator('[data-testid="content-guide-page"]').evaluate((root) => [...root.querySelectorAll('a,button,input,select,summary')].filter((node) => node.getClientRects().length).map((node) => ({ text: node.textContent, height: node.getBoundingClientRect().height })).filter((node) => node.height < 43.9));
    expect(small).toEqual([]);
    const report = await new AxeBuilder({ page }).include('[data-testid="content-guide-page"]').withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(report.violations).toEqual([]);
  });
}
