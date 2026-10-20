import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const failures = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  failures.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(failures.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
const root = (page: Page) => page.getByTestId('game-guide-page');
const context = (page: Page) => page.getByRole('combobox', { name: '开局或模式', exact: true });
const victory = (page: Page) => page.getByRole('combobox', { name: '胜利设置', exact: true });
const cards = [
  ['goal', '本局目标'],
  ['roles', '开局角色'],
  ['resources', '经济转化'],
  ['ages', '时代与局势'],
  ['counters', '有条件的克制'],
  ['watching', '观赛关注点'],
] as const;

test('#256 六张卡均有解释、例子、自查、边界与来源', async ({ page }) => {
  await page.goto('./#/game-guide');
  await expect(root(page)).toBeVisible();
  await expect(context(page)).toHaveValue('standard');
  await expect(victory(page)).toHaveValue('conquest');
  for (const [id, name] of cards) {
    await page.getByRole('button', { name: new RegExp(name) }).click();
    const article = page.locator(`[data-card="${id}"]`);
    await expect(article).toBeVisible();
    await expect(article.getByRole('heading', { name: '一个例子', exact: true })).toBeVisible();
    await article.locator('.gg-question summary').click();
    await expect(article.locator('.gg-question')).toContainText('这是阅读辅助，不评分');
    await article.locator('.gg-sources summary').click();
    await expect(article.locator('.gg-sources')).toContainText('2026-10-20');
    await expect(article.locator('.gg-source a').first()).toHaveAttribute('href', /^https:\/\//);
    await expect(article.locator('.gg-boundary')).not.toBeEmpty();
  }
});

test('#256 征服目标、开局角色与条件化克制不作必胜推断', async ({ page }) => {
  await page.goto('./#/game-guide');
  await expect(page.locator('.gg-card')).toContainText('分数领先只是当前局势的一个提示，不是已经获胜');
  await expect(page.locator('.gg-card')).toContainText('不把它们当所有天梯的默认条件');
  await page.getByRole('button', { name: /开局角色/ }).click();
  await expect(page.locator('.gg-card')).toContainText('不规定起始村民或侦察单位的数量');
  await page.getByRole('button', { name: /有条件的克制/ }).click();
  await expect(page.locator('.gg-card')).toContainText('不提供固定最优配比');
  await expect(page.getByRole('link', { name: '查看单位 PK 的适用条件', exact: true })).toHaveAttribute('href', '#/duel');
});

test('#256 合法特殊上下文与未知胜利保留，暂停通用正文', async ({ page }) => {
  await page.goto('./#/game-guide');
  await page.getByRole('button', { name: /开局角色/ }).click();
  for (const mode of ['nomad', 'empire-wars', 'special-civ', 'campaign']) {
    await context(page).selectOption(mode);
    await expect(page.getByTestId('game-guide-unsupported')).toBeVisible();
    await expect(page.locator('.gg-card')).toHaveCount(0);
    await page.reload();
    await expect(context(page)).toHaveValue(mode);
    await expect(page.getByRole('button', { name: /开局角色/ })).toHaveAttribute('aria-pressed', 'true');
  }
  await victory(page).selectOption('unknown');
  await expect(page.getByTestId('game-guide-unsupported')).toContainText('胜利设置未知');
  await context(page).selectOption('standard');
  await expect(page.locator('.gg-card')).toHaveCount(0);
  await victory(page).selectOption('conquest');
  await expect(page.locator('[data-card="roles"]')).toBeVisible();
});

test('#256 无效恢复不展示默认正文，原链接保留且能显式重置', async ({ page }) => {
  for (const query of [
    'card=roles',
    'v=1&card=unknown&context=standard&victory=conquest',
    'v=1&card=goal&context=standard&victory=conquest&extra=1',
    'v=1&card=goal&card=roles&context=standard&victory=conquest',
    'v=1&card=%FF&context=standard&victory=conquest',
    'v=9&card=goal&context=standard&victory=conquest',
    'v=1&card=' + 'a'.repeat(1024),
  ]) {
    await page.goto('./#/game-guide?' + query);
    await expect(page.getByRole('heading', { name: '入门链接无法恢复', exact: true })).toBeVisible();
    await expect(page.locator('.gg-card')).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: '保留原链接', exact: true })).toHaveValue(page.url());
    await expect(context(page)).toBeDisabled();
  }
  await page.getByRole('button', { name: '显式重置入门卡片', exact: true }).click();
  await expect(page.locator('[data-card="goal"]')).toBeVisible();
  await expect(context(page)).toBeEnabled();
});

test('#256 分享完整状态，拒绝复制时提供相同的未截断链接', async ({ page }) => {
  await page.goto('./#/game-guide');
  await page.getByRole('button', { name: /观赛关注点/ }).click();
  await context(page).selectOption('nomad');
  await victory(page).selectOption('other');
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (value: string) => localStorage.setItem('guide256-link', value) },
    }),
  );
  await page.getByRole('button', { name: '复制当前卡片链接', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('链接已复制');
  const copied = (await page.evaluate(() => localStorage.getItem('guide256-link')))!;
  const url = new URL(copied);
  expect(url.pathname).toMatch(/\/game-guide\/$/);
  expect(url.hash).toBe('');
  expect(Object.fromEntries(url.searchParams)).toEqual({ v: '1', card: 'watching', context: 'nomad', victory: 'other' });
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('denied');
        },
      },
    }),
  );
  await page.getByRole('button', { name: '复制当前卡片链接', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '手动复制完整链接', exact: true })).toHaveValue(copied);
  await page.goto('./#/game-guide' + url.search);
  await expect(page.getByTestId('game-guide-unsupported')).toBeVisible();
  await expect(context(page)).toHaveValue('nomad');
  await expect(victory(page)).toHaveValue('other');
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark']) {
    test(`#256 ${width}px ${theme} 范围、键盘、44px、AA与长来源`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/game-guide');
      await expect(root(page)).toBeVisible();
      const bounds = await context(page).boundingBox();
      expect(bounds!.y + bounds!.height).toBeLessThan(900);
      await context(page).focus();
      await page.keyboard.press('Tab');
      await expect(victory(page)).toBeFocused();
      await page.locator('.gg-sources summary').click();
      const small = await root(page).evaluate((el) =>
        [...el.querySelectorAll('a,button,select,summary')]
          .filter((node) => node.getClientRects().length)
          .map((node) => ({ text: node.textContent, height: node.getBoundingClientRect().height }))
          .filter((node) => node.height < 43.9),
      );
      expect(small).toEqual([]);
      const report = await new AxeBuilder({ page }).include('[data-testid="game-guide-page"]').withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(report.violations).toEqual([]);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.screenshot({ path: `test-results/gameGuide256-${width}-${theme}.png`, fullPage: true });
    });
  }
