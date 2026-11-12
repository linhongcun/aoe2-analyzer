import { expect, test, type Page } from '@playwright/test';

const PAGES: { path: string; title: string; top: 'crumbs' | 'team' }[] = [
  { path: '/construction', title: '多人施工', top: 'crumbs' },
  { path: '/market', title: '市场买卖预算', top: 'crumbs' },
  { path: '/game-clock', title: '游戏与现实时间换算', top: 'crumbs' },
  { path: '/team-bonuses', title: '团队加成一屏汇总', top: 'team' },
  { path: '/eco-payoff', title: '经济科技收益', top: 'crumbs' },
  { path: '/trade-income', title: '商路供给规划', top: 'crumbs' },
  { path: '/relic-income', title: '圣物收益', top: 'crumbs' },
  { path: '/garrison-healing', title: '驻军回血', top: 'crumbs' },
  { path: '/matchup/scouting', title: '侦察情报辨析卡', top: 'crumbs' },
  { path: '/matchup/mixed-army', title: '混兵情境卡', top: 'crumbs' },
  { path: '/matchup/castle-defense', title: '城堡前置应对', top: 'crumbs' },
  { path: '/team-fit', title: '文明搭配', top: 'team' },
  { path: '/team-plan', title: '团战分工计划', top: 'team' },
  { path: '/production', title: '持续生产', top: 'crumbs' },
  { path: '/production?mode=train-compare&v=1&unit=38&age=3&n=10', title: '跨文明训练对照', top: 'crumbs' },
  { path: '/game-guide', title: '一局与观赛入门', top: 'crumbs' },
  { path: '/match-review', title: '手填复盘与下局目标', top: 'crumbs' },
  { path: '/hotkeys', title: '游戏快捷键速查', top: 'crumbs' },
  { path: '/campaigns', title: '战役入门目录', top: 'crumbs' },
  { path: '/content-guide', title: '内容与购买导航', top: 'crumbs' },
  { path: '/glossary', title: '术语与缩写', top: 'crumbs' },
  { path: '/siege', title: '攻城拆建筑', top: 'crumbs' },
];

const EYEBROWS = [
  '读懂攻略里的时间',
  '选文明前',
  '共同约定这局的分工',
  '从看懂一局开始',
  '先看想玩的内容',
  '读懂社区建议',
  '把观察变成一个可验证的练习重点',
  '从信号找到下一步',
];

async function open(page: Page, path: string) {
  await page.goto('./#' + path);
  await expect(page.locator('header.tool-head h1')).toHaveText(PAGES.find((item) => item.path === path)!.title);
}

test('#961 工具页 h1 左对齐，并与面包屑或团队分段左缘对齐', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  for (const item of PAGES) {
    await page.goto('./#' + item.path);
    const head = page.locator('header.tool-head');
    const h1 = head.locator('h1');
    await expect(h1).toHaveText(item.title);
    const box = await h1.evaluate((element) => {
      const heading = element.getBoundingClientRect();
      const top = element.closest('header')?.querySelector('nav.crumbs, nav.team-sections')?.getBoundingClientRect();
      const style = getComputedStyle(element);
      const headerStyle = getComputedStyle(element.closest('header')!);
      return {
        heading: heading.x,
        top: top?.x ?? null,
        align: style.textAlign,
        background: headerStyle.backgroundColor,
        borderBottom: headerStyle.borderBottomWidth,
      };
    });
    expect(box.top, item.path).not.toBeNull();
    expect(Math.abs(box.heading - box.top!), item.path).toBeLessThan(2);
    expect(box.align, item.path).toBe('left');
    expect(['rgba(0, 0, 0, 0)', 'transparent'], item.path).toContain(box.background);
    expect(box.borderBottom, item.path).toBe('0px');
    const visible = await head.locator('.tool-head-actions > .btn, .tool-head-actions .calc-dock .btn, .tool-head-actions .tool-more-trigger').evaluateAll(
      (nodes) =>
        nodes.filter((node) => {
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && node.getAttribute('class')?.includes('calc-dock-jump') !== true;
        }).length,
    );
    expect(visible, item.path).toBeLessThanOrEqual(item.path === '/match-review' || item.path === '/team-plan' ? 3 : 2);
  }
});

test('#961 页头可见操作、相关工具地址、摘要行和眉题', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await open(page, '/market');
  await expect(page.getByTestId('market-lead')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '复制两份方案链接', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '重置', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '持续生产', exact: true })).toHaveAttribute('href', '#/production');
  await expect(page.getByRole('link', { name: '经济科技收益', exact: true })).toHaveAttribute('href', '#/eco-payoff');

  await open(page, '/team-bonuses');
  await expect(page.getByRole('link', { name: '选文明前看搭配', exact: true })).toHaveAttribute('href', '#/team-fit');
  await expect(page.getByRole('link', { name: '约定团战分工与支援', exact: true })).toHaveAttribute('href', '#/team-plan');
  await expect(page.getByRole('link', { name: '按明确来源预览圣物收益', exact: true })).toHaveAttribute('href', '#/relic-income');

  await open(page, '/glossary');
  await expect(page.getByRole('link', { name: '用六张卡看懂一局与观赛', exact: true })).toHaveAttribute('href', '#/game-guide');
  await expect(page.getByRole('link', { name: '查游戏操作与个人按键表', exact: true })).toHaveAttribute('href', '#/hotkeys');

  await open(page, '/content-guide');
  await expect(page.getByRole('link', { name: '查看文明历史首发列表', exact: true })).toHaveAttribute('href', '#/dlc');

  await open(page, '/siege');
  const siegeHead = page.locator('header.tool-head');
  await expect(siegeHead.getByRole('button', { name: '复制分享链接', exact: true })).toBeVisible();
  await expect(siegeHead.locator('h1 svg')).toHaveCount(0);
  await expect(siegeHead.getByRole('link', { name: '首页', exact: true })).toBeVisible();
  await expect(page.getByText('工具 / 攻城拆建筑')).toHaveCount(0);

  await open(page, '/matchup/scouting');
  await expect(page.locator('nav.crumbs')).toContainText('对局助手');
  await expect(page.locator('nav.crumbs')).toContainText('侦察情报辨析卡');
  await expect(page.getByRole('link', { name: '返回对局助手', exact: true })).toHaveCount(0);

  const eyebrows: Record<string, string> = {
    '/game-clock': EYEBROWS[0]!,
    '/team-fit': EYEBROWS[1]!,
    '/team-plan': EYEBROWS[2]!,
    '/game-guide': EYEBROWS[3]!,
    '/content-guide': EYEBROWS[4]!,
    '/glossary': EYEBROWS[5]!,
    '/match-review': EYEBROWS[6]!,
    '/matchup/scouting': EYEBROWS[7]!,
  };
  for (const [path, text] of Object.entries(eyebrows)) {
    await page.goto('./#' + path);
    await expect(page.getByText(text, { exact: true })).toHaveCount(0);
  }
});

test('#961 宽屏按钮视觉 36px、热区 44px，窄屏不横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await open(page, '/construction');
  const copy = page.getByRole('button', { name: '复制方案链接', exact: true });
  const box = await copy.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(36);
  expect(box!.height).toBeLessThan(40);
  expect(
    await copy.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const x = Math.round(rect.left + rect.width / 2);
      const above = document.elementFromPoint(x, rect.top - 3);
      const below = document.elementFromPoint(x, rect.bottom + 3);
      return above === element && below === element;
    }),
  ).toBe(true);
  await open(page, '/market');
  const related = page.getByRole('link', { name: '持续生产', exact: true });
  expect((await related.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/construction', '/market', '/match-review', '/team-bonuses']) {
    await page.goto('./#' + path);
    await expect(page.locator('header.tool-head h1')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  }
});

test('#961 ≥1024 隐藏跳到结果，更窄时显示，底部条可点', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await open(page, '/construction');
  await expect(page.getByRole('button', { name: '跳到结果', exact: true })).toBeHidden();
  await page.setViewportSize({ width: 1000, height: 844 });
  await expect(page.getByRole('button', { name: '跳到结果', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  const jump = page.getByRole('button', { name: '跳到结果', exact: true });
  await expect(jump).toBeVisible();
  expect((await jump.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await jump.click();
  await expect(page.locator('#construction-result-title')).toBeFocused();
});

test('#961 更多菜单键盘循环，Esc 回到按钮，清空对话框关闭后焦点回到更多', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await open(page, '/match-review');
  const more = page.getByRole('button', { name: '更多', exact: true });
  await expect(page.getByRole('button', { name: '求助摘要与打印', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '备份与恢复', exact: true })).toBeVisible();
  await more.focus();
  await page.keyboard.press('ArrowDown');
  const retry = page.getByRole('menuitem', { name: '重试保存本页', exact: true });
  const clear = page.getByRole('menuitem', { name: '清空本页内容', exact: true });
  await expect(retry).toBeFocused();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(clear).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(retry).toBeFocused();
  await page.keyboard.press('End');
  await expect(clear).toBeFocused();
  await page.keyboard.press('Home');
  await expect(retry).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(more).toBeFocused();
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('menu', { name: '更多' })).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(retry).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: '确认清空本页内容？', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(more).toBeFocused();
});

test('#961 复制方案链接仍使用原来的 construction 分享地址', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } });
  });
  await page.setViewportSize({ width: 1280, height: 844 });
  await open(page, '/construction');
  const before = await page.getByTestId('construction-seconds').innerText();
  await page.getByRole('button', { name: '复制方案链接', exact: true }).click();
  const copied = await page.getByLabel('方案链接', { exact: true }).inputValue();
  expect(new URL(copied).hash).toMatch(/^#\/construction\?/);
  await page.goto(copied);
  await expect(page.getByTestId('construction-seconds')).toHaveText(before);
});

test('#961 开一局不套工具页头，持续生产只改页头', async ({ page }) => {
  await page.goto('./#/start');
  await expect(page.locator('header.tool-head')).toHaveCount(0);
  await expect(page.locator('#start-title')).toBeVisible();
  await open(page, '/production');
  await expect(page.getByRole('navigation', { name: '生产模式' })).toBeVisible();
  await expect(page.getByRole('link', { name: '市场买卖预算', exact: true })).toHaveAttribute('href', '#/market');
  await expect(page.getByRole('link', { name: '经济科技收益：固定村民对比研究投入与增量', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '结合当前局面查看混兵条件', exact: true })).toBeVisible();
});
