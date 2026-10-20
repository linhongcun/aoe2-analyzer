import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
const href = (patch: Record<string, string> = {}) =>
  './#/campaigns?' +
  new URLSearchParams({
    v: '1',
    q: '',
    region: 'all',
    type: 'all',
    releasePack: 'all',
    sort: 'release',
    ...patch,
  });
const runtimeErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
const shownIds = (page: Page) => page.getByTestId('campaign-card').evaluateAll((elements) => elements.map((element) => element.getAttribute('data-campaign')));

test('#240 有限范围、全部中英文标题、别名与教程入口', async ({ page }) => {
  await page.goto('./#/campaigns');
  await expect(page.getByRole('heading', { name: '战役入门目录', exact: true })).toBeVisible();
  await expect(page.getByTestId('campaign-card')).toHaveCount(10);
  await expect(page.getByLabel('收录范围')).toContainText('并非完整目录');
  await expect(page.getByLabel('收录范围')).toContainText('暂未收录');
  const names = [
    ['威廉·华莱士', 'William Wallace', 'william-wallace'],
    ['圣女贞德', 'Joan of Arc', 'joan-of-arc'],
    ['萨拉丁', 'Saladin', 'saladin'],
    ['成吉思汗', 'Genghis Khan', 'genghis-khan'],
    ['巴巴罗萨', 'Barbarossa', 'barbarossa'],
    ['匈奴王阿提拉', 'Attila the Hun', 'attila-the-hun'],
    ['熙德', 'El Cid', 'el-cid'],
    ['蒙提祖马', 'Montezuma', 'montezuma'],
    ['黑斯廷斯战役', 'Hastings', 'hastings'],
    ['阿金库尔战役', 'Agincourt', 'agincourt'],
  ];
  for (const [zh, en, id] of names)
    for (const name of [zh!, en!]) {
      await page.getByRole('searchbox', { name: '搜索战役名称' }).fill(name);
      await expect(page.getByTestId('campaign-card')).toHaveCount(1);
      await expect(page.locator(`[data-campaign="${id}"]`)).toBeVisible();
    }
  await page.getByRole('searchbox', { name: '搜索战役名称' }).fill('蒙特祖玛');
  await expect(page.getByRole('heading', { name: '蒙提祖马', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '先找基础教程' }).click();
  await expect(page.getByLabel('类型', { exact: true })).toHaveValue('tutorial');
  await expect(page.locator('[data-campaign="william-wallace"]')).toBeVisible();
  await expect(page.getByTestId('campaign-card')).toHaveCount(1);
});

test('#240 交集无结果保留条件，范围外查询不声称游戏不存在', async ({ page }) => {
  await page.goto(
    href({
      type: 'historical-battle',
      region: 'europe',
      releasePack: 'the-conquerors',
    }),
  );
  await expect(page.getByTestId('campaign-card')).toHaveCount(2);
  await page.getByLabel('首发内容包', { exact: true }).selectOption('age-of-kings');
  await expect(page.getByTestId('campaign-empty')).toContainText('暂未收录');
  await expect(page.getByLabel('类型', { exact: true })).toHaveValue('historical-battle');
  await expect(page.getByLabel('首发内容包', { exact: true })).toHaveValue('age-of-kings');
  await page.getByRole('button', { name: '查看首批全部条目' }).click();
  await expect(page.getByTestId('campaign-card')).toHaveCount(10);
  await page.getByRole('searchbox', { name: '搜索战役名称' }).fill('Chronicles');
  await expect(page.getByTestId('campaign-empty')).toContainText('这不表示游戏中不存在');
  await expect(page.getByRole('searchbox', { name: '搜索战役名称' })).toHaveValue('Chronicles');
});

test('#240 首发和历史排序独立，区间与单年保持原样', async ({ page }) => {
  await page.goto('./#/campaigns');
  expect(await shownIds(page)).toEqual([
    'barbarossa',
    'genghis-khan',
    'joan-of-arc',
    'saladin',
    'william-wallace',
    'agincourt',
    'attila-the-hun',
    'el-cid',
    'hastings',
    'montezuma',
  ]);
  await page.getByLabel('排序', { exact: true }).selectOption('history');
  expect(await shownIds(page)).toEqual([
    'attila-the-hun',
    'el-cid',
    'hastings',
    'barbarossa',
    'saladin',
    'genghis-khan',
    'william-wallace',
    'agincourt',
    'joan-of-arc',
    'montezuma',
  ]);
  await expect(page.locator('[data-campaign="barbarossa"] .campaign-facts')).toContainText('1152–1191年');
  await expect(page.locator('[data-campaign="saladin"] .campaign-facts')).toContainText('1163–1191年');
  await expect(page.locator('[data-campaign="hastings"] .campaign-facts')).toContainText('1066年');
  await expect(page.locator('[data-campaign="joan-of-arc"] .campaign-facts')).toContainText('1428–1453年');
});

test('#240 未提供剑级和逐字段来源性质诚实显示，购买统一转base', async ({ page }) => {
  await page.goto(href({ q: 'El Cid' }));
  const card = page.getByTestId('campaign-card');
  await expect(card.locator('.campaign-facts')).toContainText('西班牙、萨拉森');
  await expect(card.locator('.campaign-facts dd').last()).toHaveText('未提供');
  await expect(card).toContainText('社区客户端抄录（2024-05-12）');
  await expect(card.getByRole('link', { name: /查看当前内容与购买要求/ })).toHaveAttribute('href', '#/content-guide?pack=base');
  const summary = card.locator('summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(card.locator('.campaign-sources')).toHaveAttribute('open', '');
  await expect(card.locator('.campaign-evidence')).toContainText('中文名称');
  await expect(card.locator('.campaign-source-list')).toContainText('client build not declared');
  await expect(card.locator('.campaign-source-list')).toContainText('2024-05-12');
  await page.getByText('怎样理解年代、剑级与首发顺序', { exact: true }).click();
  await expect(page.getByText(/不表示零剑或最容易/)).toBeVisible();
});

test('#240 刷新与前进后退恢复所有条件', async ({ page }) => {
  await page.goto(
    href({
      q: 'Joan of Arc',
      region: 'europe',
      type: 'campaign',
      releasePack: 'age-of-kings',
      sort: 'history',
    }),
  );
  await page.reload();
  for (const [label, value] of [
    ['地区', 'europe'],
    ['类型', 'campaign'],
    ['首发内容包', 'age-of-kings'],
    ['排序', 'history'],
  ])
    await expect(page.getByLabel(label!, { exact: true })).toHaveValue(value!);
  await expect(page.getByRole('searchbox', { name: '搜索战役名称' })).toHaveValue('Joan of Arc');
  await page.getByLabel('类型', { exact: true }).selectOption('historical-battle');
  await expect(page.getByTestId('campaign-empty')).toBeVisible();
  await page.goBack();
  await expect(page.locator('[data-campaign="joan-of-arc"]')).toBeVisible();
  await page.goForward();
  await expect(page.getByLabel('类型', { exact: true })).toHaveValue('historical-battle');
  await expect(page.getByTestId('campaign-empty')).toBeVisible();
});

test('#240 严格结构错误暂停结果并保留原链接，明确重置才恢复', async ({ page }) => {
  const cases = [
    href() + '&q=other',
    href() + '&%71=other',
    href() + '&unknown=1',
    './#/campaigns?q=Wallace',
    href({ v: '99' }),
    href({ q: '%' }).replace('q=%25', 'q=%FF'),
    href() + '&',
    href({ q: 'x'.repeat(4096) }),
  ];
  for (const url of cases) {
    await page.goto(url);
    await expect(page.getByRole('alert')).toContainText('未展示默认结果');
    await expect(page.getByTestId('campaign-card')).toHaveCount(0);
    await expect(page.getByRole('searchbox', { name: '搜索战役名称' })).toBeDisabled();
    await expect(page.getByRole('button', { name: '复制目录链接' })).toBeDisabled();
    await expect(page.getByLabel('原始目录链接')).toHaveValue(page.url());
    await page.getByRole('button', { name: '重置目录条件' }).click();
    await expect(page.getByTestId('campaign-card')).toHaveCount(10);
  }
});

test('#240 语义错误保留原值并允许逐字段修正', async ({ page }) => {
  await page.goto(href({ region: 'moon', sort: 'random', q: '中'.repeat(101) }));
  await expect(page.getByRole('alert')).toContainText('请修正筛选条件');
  await expect(page.getByLabel('地区', { exact: true })).toHaveValue('moon');
  await expect(page.getByRole('searchbox', { name: '搜索战役名称' })).toHaveValue('中'.repeat(101));
  await page.getByLabel('地区', { exact: true }).selectOption('europe');
  await expect(page.getByLabel('排序', { exact: true })).toHaveValue('random');
  await page.getByLabel('排序', { exact: true }).selectOption('history');
  await page.getByRole('searchbox', { name: '搜索战役名称' }).fill('圣女贞德');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('[data-campaign="joan-of-arc"]')).toBeVisible();
});

test('#240 复制失败显示完整链接，清除外层参数并可原样恢复', async ({ page }) => {
  await page.goto(
    './?tracking=discard#/campaigns?' +
      new URLSearchParams({
        v: '1',
        q: '圣女贞德',
        region: 'europe',
        type: 'campaign',
        releasePack: 'age-of-kings',
        sort: 'history',
      }),
  );
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('blocked');
        },
      },
    }),
  );
  await page.getByRole('button', { name: '复制目录链接' }).click();
  await expect(page.getByRole('status').filter({ hasText: '自动复制失败' })).toBeVisible();
  const fullLink = await page.getByLabel('手动复制目录链接').inputValue();
  expect(new URL(fullLink).search).toBe('');
  const params = new URLSearchParams(new URL(fullLink).hash.split('?')[1]);
  expect(Object.fromEntries(params)).toEqual({
    v: '1',
    q: '圣女贞德',
    region: 'europe',
    type: 'campaign',
    releasePack: 'age-of-kings',
    sort: 'history',
  });
  await page.goto(fullLink);
  await page.reload();
  await expect(page.locator('[data-campaign="joan-of-arc"]')).toBeVisible();
  await expect(page.getByLabel('排序', { exact: true })).toHaveValue('history');
});

test('#240 复制成功与键盘筛选反馈可用', async ({ page }) => {
  await page.goto('./#/campaigns');
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => undefined },
    }),
  );
  const search = page.getByRole('searchbox', { name: '搜索战役名称' });
  await search.focus();
  await page.keyboard.type('El Cid');
  await expect(page.locator('[data-campaign="el-cid"]')).toBeVisible();
  await page.getByRole('button', { name: '复制目录链接' }).click();
  await expect(page.getByRole('status').filter({ hasText: '目录链接已复制' })).toBeVisible();
  await search.focus();
  expect(await search.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe('none');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('地区', { exact: true })).toBeFocused();
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#240 ${width}px ${theme} 首屏搜索、长来源、44px与AA`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/campaigns');
      const root = page.getByTestId('campaigns-page');
      const search = page.getByRole('searchbox', { name: '搜索战役名称' });
      await expect(search).toBeVisible();
      expect((await search.boundingBox())!.y + (await search.boundingBox())!.height).toBeLessThan(900);
      await page.screenshot({
        path: info.outputPath(`campaigns240-${width}-${theme}.png`),
        fullPage: true,
      });
      await page.getByTestId('campaign-card').first().locator('summary').click();
      const bad = await root.locator('input, select, button, summary, a').evaluateAll((elements) =>
        elements
          .filter((element) => {
            const box = element.getBoundingClientRect();
            return box.width > 0 && box.height > 0 && (box.height < 44 || box.width < 44);
          })
          .map((element) => element.textContent),
      );
      expect(bad).toEqual([]);
      expect((await new AxeBuilder({ page }).include('[data-testid="campaigns-page"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
      await page.screenshot({
        path: info.outputPath(`campaigns240-sources-${width}-${theme}.png`),
        fullPage: true,
      });
    });
