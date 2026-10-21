import { expect, test, type Page } from '@playwright/test';
import { guardPage, noOverflow, setTheme, THEMES, WIDTHS, wrappedFragments, wrappedNums } from './v0290-helpers';

/**
 * v0.29.0 验收（#329）B 组：手机排版与交互。Kent 写，先失败；标「守卫」的现在就应通过。
 * 搜索弱网（#325）单独在 v0290-325-search.spec.ts。
 */
guardPage();

// ---------- #275 ----------
const BUILDS = ['archers-19', 'drush-fc', 'fast-castle-boom', 'fast-castle-knights', 'feudal-drush-18', 'hybrid-fish-18', 'maa-archers-18', 'scouts-18'];
/** 数字 + 单位（个、人、座、木、食、金、石，以及步骤里出现的名 / 头 / 只 / 艘 / 格 / 秒 / 分钟 / 人口 / 村民） */
const NUM_UNIT = /\d+(?:\.\d+)?\s*(?:名村民|个村民|人口|村民|分钟|个|人|座|木|食|金|石|名|头|只|艘|格|秒|块)/g;

test.describe('#275 开局步骤：数字与单位不断行', () => {
  for (const theme of THEMES)
    for (const width of WIDTHS)
      test(`#/builds 列表全部步骤 ${theme} @${width}`, async ({ page }) => {
        await setTheme(page, theme);
        await page.setViewportSize({ width, height: 900 });
        await page.goto('./#/builds');
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.locator('.bo-steps li').first()).toBeAttached();
        await page.locator('main details').evaluateAll((els) => els.forEach((e) => ((e as HTMLDetailsElement).open = true)));
        await expect(page.locator('.bo-steps li').first()).toBeVisible();
        expect(await wrappedFragments(page, '.bo-steps li', NUM_UNIT)).toEqual([]);
        expect(await wrappedNums(page, 'main')).toEqual([]);
      });

  for (const theme of THEMES)
    for (const width of WIDTHS)
      test(`专注跟练 · 完整步骤单（8 个开局全部步骤）与跟练卡片 ${theme} @${width}`, async ({ page }) => {
        test.setTimeout(300_000);
        await setTheme(page, theme);
        await page.setViewportSize({ width, height: 900 });
        const bad: string[] = [];
        for (const bo of BUILDS) {
          await page.goto(`./#/builds?bo=${bo}&view=print`);
          await expect(page.getByTestId('practice-checklist-step').first()).toBeVisible();
          bad.push(...(await wrappedFragments(page, '[data-testid="practice-checklist-step"]', NUM_UNIT)).map((t) => `${bo} 清单：${t}`));
          await noOverflow(page);
          // 跟练卡片：逐步点「下一步」走完全部步骤，每一步都量当前卡与下一步卡
          await page.goto(`./#/builds?bo=${bo}&view=practice`);
          await expect(page.getByTestId('practice-current')).toBeVisible();
          const next = page.locator('.bo-practice .bp-primary');
          for (let step = 1; step <= 60; step++) {
            for (const t of await wrappedFragments(page, '[data-testid="practice-current"], [data-testid="practice-next"]', NUM_UNIT))
              bad.push(`${bo} 跟练第 ${step} 步：${t}`);
            if (step === 1) bad.push(...(await wrappedNums(page, 'main')).map((t) => `${bo} .num：${t}`));
            await noOverflow(page);
            if (!(await next.isEnabled())) break;
            await next.click();
          }
        }
        expect(bad).toEqual([]);
      });

  for (const width of WIDTHS)
    test(`#/market 不再向玩家显示 .dat 的 SHA256 @${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./#/market');
      await expect(page.locator('main h1')).toContainText('市场');
      expect(await page.locator('main').innerText()).not.toMatch(/[0-9a-f]{64}/i);
      await expect(page.locator('main')).not.toContainText('SHA256');
      expect(await wrappedNums(page, 'main')).toEqual([]);
    });
});

// ---------- #326 ----------
/** 每张文明卡：DLC 小图标的矩形与卡片内任何文字（不含图标自身）的行矩形都不相交 */
async function overlaps(page: Page) {
  return page.locator('.card[data-civ]').evaluateAll((cards) => {
    const out: string[] = [];
    let badges = 0;
    for (const card of cards) {
      const icons = [...card.querySelectorAll('.cdl img, .cdl svg, [class*="dlc"] img, [class*="dlc"] svg')].filter((e) => e.getBoundingClientRect().width > 0);
      badges += icons.length;
      const texts: { r: DOMRect; t: string }[] = [];
      const walker = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent?.trim()) continue;
        if (icons.some((i) => i.contains(n))) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const r of range.getClientRects()) if (r.width > 0) texts.push({ r, t: n.textContent.trim() });
      }
      for (const icon of icons) {
        const a = icon.getBoundingClientRect();
        for (const { r, t } of texts)
          if (a.left < r.right - 0.5 && a.right > r.left + 0.5 && a.top < r.bottom - 0.5 && a.bottom > r.top + 0.5)
            out.push(`${card.getAttribute('data-civ')}：${t}`);
      }
    }
    return { out, badges };
  });
}
test.describe('#326 文明列表：DLC 图标不盖住文字', () => {
  for (const width of WIDTHS)
    test(`#/civs @${width}：DLC 图标与「边位 X · 口袋 Y」等文字不重叠，.num 不折行`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./#/civs');
      await expect(page.locator('.card[data-civ]').first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      const { out, badges } = await overlaps(page);
      expect(badges, '找到了 DLC 图标（防止空跑）').toBeGreaterThan(10);
      expect(out).toEqual([]);
      expect(await wrappedNums(page, 'main')).toEqual([]);
      await page.screenshot({ path: info.outputPath(`civs-${width}.png`), fullPage: false });
    });
});

// ---------- #316 ----------
const menuButton = (page: Page) => page.getByRole('button', { name: '菜单', exact: true });
const toolsButton = (page: Page) => page.getByRole('button', { name: '工具', exact: true });
test.describe('#316 首页与导航', () => {
  test('首页四组卡片的「打开」提示一致（全显示或全不显示），读屏名称不重复「打开」', async ({ page }) => {
    await page.goto('./#/');
    const cards = page.locator('#home a.hcard');
    await expect(cards.first()).toBeVisible();
    // 按实际是否看得见判断（用 CSS 统一隐藏也算「都不显示」）
    const flags = await cards.evaluateAll((els) =>
      els.map((e) => [...e.querySelectorAll('.hc-open')].some((x) => x.getClientRects().length > 0 && getComputedStyle(x).visibility !== 'hidden')),
    );
    expect(new Set(flags).size, '全显示或全不显示').toBe(1);
    const names = await cards.evaluateAll((els) =>
      els.map((e) => {
        const clone = e.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('[aria-hidden="true"]').forEach((x) => x.remove());
        return e.getAttribute('aria-label') ?? clone.textContent ?? '';
      }),
    );
    expect(names.filter((n) => (n.match(/打开/g) ?? []).length > 1)).toEqual([]);
  });

  test('「侦察辨析」在首页卡片和工具菜单里是新措辞', async ({ page }) => {
    await page.goto('./#/');
    const NEW = '对照具体信号，判断对手在做什么，安排下一步';
    await expect(page.locator('#home a.hcard[href$="/scouting"]')).toContainText(NEW);
    await toolsButton(page).click();
    const panel = page.locator('#tools-menu');
    await expect(panel).toBeVisible();
    const text = await panel.innerText();
    expect(text).not.toContain('对照相容解释');
  });

  for (const width of [360, 375, 390])
    test(`@${width} 在工具页打开抽屉：「工具」默认展开、当前页高亮；Esc 关闭后焦点回到菜单按钮`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      for (const [route, label] of [
        ['/builds', '开局流程'],
        ['/market', '市场买卖'],
        ['/scouting', '侦察辨析'],
      ] as const) {
        void label; // 按 href 定位，链接里加说明文字也不影响
        await page.goto('./#' + route);
        await menuButton(page).click();
        await expect(toolsButton(page), route).toHaveAttribute('aria-expanded', 'true');
        const current = page.locator(`#tools-menu a[href$="#${route}"]`);
        await expect(current).toBeVisible();
        await expect(current).toHaveAttribute('aria-current', 'page');
        await noOverflow(page);
      }
      for (let i = 0; i < 2 && (await page.locator('#main-navigation.open').count()); i++) await page.keyboard.press('Escape');
      await expect(page.locator('#main-navigation.open')).toHaveCount(0);
      await expect(menuButton(page)).toBeFocused();
    });

  for (const width of [360, 390])
    test(`守卫 @${width}：在首页、百科页打开抽屉，「工具」仍收起`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      for (const route of ['/', '/civs', '/units']) {
        await page.goto('./#' + route);
        await menuButton(page).click();
        await expect(toolsButton(page), route).toHaveAttribute('aria-expanded', 'false');
        await page.keyboard.press('Escape');
      }
    });

  test('守卫 @360：工具页抽屉按 Esc 关闭，焦点回到菜单按钮', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('./#/builds');
    await menuButton(page).click();
    await expect(page.locator('#main-navigation.open')).toHaveCount(1);
    for (let i = 0; i < 2 && (await page.locator('#main-navigation.open').count()); i++) await page.keyboard.press('Escape');
    await expect(page.locator('#main-navigation.open')).toHaveCount(0);
    await expect(menuButton(page)).toBeFocused();
  });

  test('守卫 @1280：工具页上的桌面下拉菜单仍是点击才展开', async ({ page }) => {
    await page.goto('./#/builds');
    await expect(toolsButton(page)).toHaveAttribute('aria-expanded', 'false');
    await toolsButton(page).click();
    await expect(toolsButton(page)).toHaveAttribute('aria-expanded', 'true');
  });

  for (const width of WIDTHS)
    test(`首页 @${width}：.num 不折行`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./#/');
      await expect(page.locator('#home a.hcard').first()).toBeVisible();
      expect(await wrappedNums(page, 'main')).toEqual([]);
    });
});

// ---------- #313 ----------
const field = (page: Page, name: string) => page.getByRole('textbox', { name, exact: true });
test.describe('#313 手填复盘：连续清空两次后撤销', () => {
  for (const width of [360, 1280])
    test(`写「旧草稿」→ 清空 → 再清空（或无法再清空）→ 撤销，恢复「旧草稿」和本机存档 @${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./#/match-review');
      await field(page, '复盘标题').fill('旧草稿');
      const clear = page.getByRole('button', { name: '清空本页内容', exact: true });
      const dialog = page.getByRole('dialog', { name: '确认清空本页内容？', exact: true });
      const confirm = dialog.getByRole('button', { name: '确认清空', exact: true });
      const undo = page.getByRole('button', { name: '撤销', exact: true });
      await clear.click();
      await confirm.click();
      await expect(field(page, '复盘标题')).toHaveValue('');
      await expect(undo).toBeVisible();
      if (await clear.isEnabled()) {
        await clear.click();
        if (await dialog.isVisible()) await confirm.click();
      } else {
        // 禁用方案：要有可见说明，读屏能听到原因；按钮仍不小于 44px
        await expect(clear).toHaveAccessibleDescription(/.+/);
        const box = await clear.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      await undo.click();
      await expect(field(page, '复盘标题')).toHaveValue('旧草稿');
      expect(await page.evaluate(() => localStorage.getItem('aoe2-match-review-v1') ?? '')).toContain('旧草稿');
    });
});

// ---------- #315 ----------
test.describe('#315 404 页容错建议', () => {
  for (const [input, label] of [
    ['/glossery', '术语与缩写'],
    ['/glosary', '术语与缩写'],
    ['/buildorder', '开局流程'],
    ['/build-orders', '开局流程'],
    ['/tradeincome', '商路供给'],
  ] as const)
    test(`#${input} 第 1 条建议是「${label}」`, async ({ page }) => {
      await page.goto('./#' + input);
      await expect(page.getByRole('heading', { level: 1, name: '找不到该页' })).toBeVisible();
      const links = page.locator('.not-found-suggestions a');
      await expect(links.first()).toHaveText(label);
      expect(await links.count()).toBeLessThanOrEqual(3);
    });
  test('守卫：#/hotkey 建议 快捷键速查，#/civ 建议 文明', async ({ page }) => {
    await page.goto('./#/hotkey');
    await expect(page.locator('.not-found-suggestions a').first()).toHaveText('快捷键速查');
    await page.goto('./#/civ');
    await expect(page.locator('.not-found-suggestions a').first()).toHaveText('文明');
  });
  test('反例：#/ab 不出建议', async ({ page }) => {
    await page.goto('./#/ab');
    await expect(page.getByRole('heading', { level: 1, name: '找不到该页' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '你是不是要找' })).toHaveCount(0);
  });
});
