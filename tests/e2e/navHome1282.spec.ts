import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const GROUPS = ['对局计划', '经济计算', '资料', '新手入门'];
const TOPBAR_WIKI_HREFS = ['#/civs', '#/units', '#/buildings', '#/techs', '#/maps', '#/patches'];
const EXTENDED_REF_HREFS = ['#/bonuses', '#/dlc', '#/content-guide', '#/ladder'];

const errorsByPage = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const list: string[] = [];
  errorsByPage.set(page, list);
  page.on('pageerror', (error) => list.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') list.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(errorsByPage.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const width of [390, 1280])
  for (const theme of ['light', 'dark'] as const)
    test(`#1282 首页高频分组前置、无溢出且数字不折行 @${width} ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const titles = page.locator('#home .home-group-title');
      await expect(titles).toHaveText(GROUPS);
      const tops = await titles.evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().top));
      expect(tops[0]!).toBeLessThan(tops[3]!);
      expect(tops[1]!).toBeLessThan(tops[3]!);
      expect(
        await page.locator('#home .num').evaluateAll((items) =>
          items.every((item) => {
            const range = document.createRange();
            range.selectNodeContents(item);
            return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size <= 1;
          }),
        ),
      ).toBe(true);
    });

for (const width of [1031, 1280])
  test(`#1282 桌面「工具」下拉去重至 25 项、组内图标差异化且键盘可用 @${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('./#/');
    const trigger = page.getByRole('button', { name: '工具', exact: true });
    await trigger.click();
    const panel = page.locator('#tools-menu');
    await expect(panel).toBeVisible();
    await expect(panel.locator('.tools-group-title')).toHaveText(GROUPS);
    await expect(panel.getByRole('link')).toHaveCount(25);
    for (const href of TOPBAR_WIKI_HREFS) await expect(panel.locator(`a[href="${href}"]`), `${href} 不应重复`).toHaveCount(0);
    for (const href of EXTENDED_REF_HREFS) await expect(panel.locator(`a[href="${href}"]`), `${href} 应保留`).toHaveCount(1);
    await expect(panel.locator('.tools-footer')).toContainText('顶栏已提供「文明 / 单位 / 建筑 / 科技 / 地图 / 更新历史」，此处不再重复');

    // 四组内部图标 SVG 路径彼此不同，消除同组撞车。
    const duplicateGroups = await panel.locator('.tools-group').evaluateAll((groups) =>
      groups.flatMap((group) => {
        const title = group.querySelector('.tools-group-title')?.textContent?.trim() ?? '';
        const svgs = [...group.querySelectorAll('a svg')].map((svg) => svg.innerHTML);
        return new Set(svgs).size === svgs.length ? [] : [title];
      }),
    );
    expect(duplicateGroups).toEqual([]);

    await page.keyboard.press('Tab');
    await expect(panel.getByRole('link').first()).toBeFocused();
    await page.keyboard.press('End');
    await expect(panel.getByRole('link').last()).toBeFocused();
    await page.keyboard.press('Home');
    await expect(panel.getByRole('link').first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();
  });

for (const theme of ['light', 'dark'] as const)
  test(`#1282 全局搜索空态 6 项直达、纯空格保护、键盘跳转与对比度 ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
    await page.goto('./#/');
    await page.getByTestId('home-search').click();
    const dialog = page.getByRole('dialog', { name: '全局搜索', exact: true });
    const input = dialog.getByRole('combobox', { name: '全局搜索', exact: true });
    const options = dialog.getByRole('option');
    await expect(dialog.locator('.cmdk-sec')).toHaveText('常用工具直达');
    await expect(options).toHaveCount(6);
    await expect(options.first()).toContainText('单位 PK');
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');
    await expect(dialog.locator('.cmdk-foot')).toContainText('输入中文、英文或拼音实时搜索全站');
    await expect(dialog.locator('kbd')).toHaveCount(1);

    const emptyAxe = await new AxeBuilder({ page }).include('.cmdk').withRules(['color-contrast']).analyze();
    expect(emptyAxe.violations).toEqual([]);

    // 纯空格仍停留在空态 6 项直达，不出现「无匹配结果」。
    await input.fill('   ');
    await expect(options).toHaveCount(6);
    await expect(dialog).not.toContainText('无匹配结果');

    // 搜索重名单位（含 .civnote）验证选中行深浅主题对比度同样达 WCAG AA。
    await input.fill('战车');
    await expect(options.first()).toBeVisible();
    const dupAxe = await new AxeBuilder({ page }).include('.cmdk').withRules(['color-contrast']).analyze();
    expect(dupAxe.violations).toEqual([]);

    // 清空恢复 6 项直达，并用方向键 + Enter 直接进入「对局助手」。
    await input.fill('');
    await expect(options).toHaveCount(6);
    await input.press('ArrowDown');
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(options.nth(1)).toContainText('对局助手');
    await input.press('Enter');
    await expect(page).toHaveURL(/#\/matchup$/);
    await expect(dialog).toHaveCount(0);
  });

test('#1282 平台快捷键提示：Apple 显示 ⌘ K，非 Apple 显示 Ctrl K，双热键均生效', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgentData', { configurable: true, value: { platform: 'macOS' } });
    Object.defineProperty(navigator, 'platform', { configurable: true, value: 'MacIntel' });
  });
  await page.goto('./#/');
  await expect(page.locator('.home-search kbd')).toHaveText('⌘ K');
  await page.goto('./#/market');
  await expect(page.locator('.searchbtn kbd')).toHaveText('⌘ K');

  await page.keyboard.press('Meta+k');
  await expect(page.getByRole('dialog', { name: '全局搜索', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog', { name: '全局搜索', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  const winPage = await page.context().newPage();
  try {
    await winPage.setViewportSize({ width: 1280, height: 800 });
    await winPage.addInitScript(() => {
      Object.defineProperty(navigator, 'userAgentData', { configurable: true, value: { platform: 'Windows' } });
      Object.defineProperty(navigator, 'platform', { configurable: true, value: 'Win32' });
    });
    await winPage.goto('./#/');
    await expect(winPage.locator('.home-search kbd')).toHaveText('Ctrl K');
    await winPage.goto('./#/market');
    await expect(winPage.locator('.searchbtn kbd')).toHaveText('Ctrl K');
  } finally {
    await winPage.close();
  }
});

test('#1282 顶栏数据徽章在 901–1280 双页合规不溢出，390/360 移入抽屉与页脚', async ({ page }) => {
  for (const route of ['/', '/market']) {
    for (const width of [901, 1031, 1101, 1199, 1200, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`./#${route}`);
      await expect(page.locator('main')).not.toBeEmpty();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route}@${width}`).toBe(true);
      const badge = page.locator('header.topbar > .verbadge');
      await expect(badge).toBeVisible();
      const box = (await badge.boundingBox())!;
      expect(box.height, `${route}@${width} height`).toBeGreaterThanOrEqual(44);
      if (width < 1200) {
        await expect(badge.locator('.verbadge-short')).toBeVisible();
        await expect(badge.locator('.verbadge-full')).toBeHidden();
        expect(box.width, `${route}@${width} width`).toBeGreaterThanOrEqual(68);
      } else {
        await expect(badge.locator('.verbadge-full')).toBeVisible();
        await expect(badge.locator('.verbadge-short')).toBeHidden();
      }
      await expect(badge).toHaveAccessibleName(/数据版本.*来源/);
      const headerHeight = await page.locator('header.topbar').evaluate((el) => el.getBoundingClientRect().height);
      expect(headerHeight, `${route}@${width} 顶栏应单行不折行`).toBeLessThanOrEqual(72);
    }

    for (const width of [360, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`./#${route}`);
      await expect(page.locator('header.topbar > .verbadge')).toBeHidden();
      const smallHeaderControls = await page.locator('header.topbar > a, header.topbar > button').evaluateAll((els) =>
        els.flatMap((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return [];
          const isBrand = el.classList.contains('brand');
          const ok = isBrand ? r.width >= 44 : r.width >= 44 && r.height >= 44;
          return ok ? [] : [{ label: el.getAttribute('aria-label') ?? el.textContent?.trim(), w: r.width, h: r.height }];
        }),
      );
      expect(smallHeaderControls, `${route}@${width} 顶栏不应出现 <44×44 控件`).toEqual([]);
    }
  }

  // 390 窄屏打开抽屉点击底部「关于数据」可直达 /about-data，页脚入口同样保留。
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/market');
  await page.getByRole('button', { name: '菜单', exact: true }).click();
  const drawerLink = page.locator('nav.mainnav .drawer-data-link');
  await expect(drawerLink).toBeVisible();
  const drawerBox = (await drawerLink.boundingBox())!;
  expect(drawerBox.height).toBeGreaterThanOrEqual(44);
  expect(drawerBox.width).toBeGreaterThanOrEqual(200);
  await expect(drawerLink).toHaveAccessibleName(/^关于数据（DE \d+）.*数据版本.*来源/);
  await drawerLink.click();
  await expect(page).toHaveURL(/#\/about-data$/);
  await expect(page.locator('nav.mainnav')).toBeHidden();
  await expect(page.locator('footer a[href$="#/about-data"]')).toBeVisible();
});
