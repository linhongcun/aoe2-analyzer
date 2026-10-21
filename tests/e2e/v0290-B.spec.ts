import { expect, test, type Page } from '@playwright/test';
import civsRaw from '../../src/data/civs.json' with { type: 'json' };
import { guardPage, noOverflow, WIDTHS, wrappedNums } from './v0290-helpers';

/**
 * v0.29.0 验收（#329）B 组：手机排版与交互。Kent 写，先失败；标「守卫」的现在就应通过。
 * 搜索弱网（#325）单独在 v0290-325-search.spec.ts。
 */
guardPage();

// ---------- #275 ----------
// 开局步骤、市场、文明加成标题、内容指南日期的 #275 块已原样并入 main（tests/e2e/v0290-275.spec.ts，#337 @ 5c9326f），本文件不再重复。
// 补充：团队加成详情页标题（#337 复核时发现未覆盖）。只许在「文明名 ·」与「团队加成」之间换行：文明名不断行，「团队加成」整体不断行。
async function teamTitleLines(page: Page): Promise<{ civ: number; tail: number } | null> {
  return page
    .locator('main h1')
    .first()
    .evaluate((h1) => {
      const nodes: { n: Text; start: number }[] = [];
      let text = '';
      const tw = document.createTreeWalker(h1, NodeFilter.SHOW_TEXT);
      for (let n = tw.nextNode() as Text | null; n; n = tw.nextNode() as Text | null) {
        if (n.parentElement !== h1) continue;
        nodes.push({ n, start: text.length });
        text += n.data;
      }
      const m = /^(\s*)(\S.*?)\s*·\s*(团队加成)\s*$/.exec(text);
      if (!m) return null;
      const at = (i: number) => {
        const k = nodes.findLast((x) => x.start <= i && i < x.start + x.n.data.length)!;
        return [k.n, i - k.start] as const;
      };
      /** 区间 [from, to) 内每个非空白字符的行矩形，按垂直区间归并成行 */
      const lines = (from: number, to: number) => {
        const out: { top: number; bottom: number }[] = [];
        for (let i = from; i < to; i++) {
          if (/\s/.test(text[i]!)) continue;
          const r = document.createRange();
          const [n, o] = at(i);
          r.setStart(n, o);
          r.setEnd(n, o + 1);
          for (const x of r.getClientRects())
            if (x.width > 0 && x.height > 0 && !out.some((l) => x.top < l.bottom - 2 && x.bottom > l.top + 2)) out.push({ top: x.top, bottom: x.bottom });
        }
        return out;
      };
      const civFrom = m[1]!.length,
        civTo = civFrom + m[2]!.length;
      const tailFrom = text.indexOf(m[3]!, civTo);
      return { civ: lines(civFrom, civTo).length, tail: lines(tailFrom, tailFrom + m[3]!.length).length };
    });
}
test.describe('#275 团队加成详情页标题：只在文明名与「团队加成」之间换行（#337 复核补充）', () => {
  for (const width of WIDTHS)
    test(`全部团队加成详情页标题 @${width}：文明名不断行，「团队加成」不断行`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height: 900 });
      const bad: string[] = [];
      let checked = 0;
      for (const c of civsRaw as { en: string; tb?: string }[]) {
        await page.goto(`./#/civ/${c.en}/bonus/team`);
        await expect(page.locator('main h1').first()).toContainText('团队加成');
        const r = await teamTitleLines(page);
        if (r === null) {
          bad.push(`${c.en}/bonus/team 标题不是「文明名 · 团队加成」`);
          continue;
        }
        checked++;
        const why = [r.civ > 1 && `文明名断成 ${r.civ} 行`, r.tail > 1 && `「团队加成」断成 ${r.tail} 行`].filter(Boolean);
        if (why.length) bad.push(`#/civ/${c.en}/bonus/team「${(await page.locator('main h1').first().innerText()).replace(/\s+/g, ' ')}」：${why.join('、')}`);
      }
      expect(checked, '防空转：56 个团队加成标题都量到').toBe((civsRaw as unknown[]).length);
      expect(bad).toEqual([]);
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

/** 科技模拟器每张卡 .mini（「兵营 · 肉 35 金 25」）：计算的 padding-left，以及它排成了几行（按文字与图标的行矩形 top 聚类） */
async function simMinis(page: Page) {
  return page.locator('#simhub .ucard .mini').evaluateAll((els) =>
    els.map((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const rects = [...range.getClientRects(), ...[...el.querySelectorAll('img, svg')].map((i) => i.getBoundingClientRect())].filter(
        (r) => r.width > 0 && r.height > 0,
      );
      const mids = rects.map((r) => (r.top + r.bottom) / 2).sort((a, b) => a - b);
      let lines = 0;
      let last = -Infinity;
      for (const m of mids) if (m - last > 6) (lines++, (last = m));
      return { pad: getComputedStyle(el).paddingLeft, lines };
    }),
  );
}
/** main 5c9326f 上各宽度费用行排成两行及以上的卡片数（同一测量方法，2026-10-22 00:30 北京时间实测），作为上限 */
const SIM_WRAP_MAX: Record<(typeof WIDTHS)[number], number> = { 360: 39, 375: 30, 390: 21, 1280: 156 };
test.describe('#326 守卫：科技模拟器卡片不受文明卡 DLC 图标留白影响（#339 复核补充）', () => {
  for (const width of WIDTHS)
    test(`#/simulator @${width}：.mini 左内边距 ${width <= 600 ? '0' : '与 main 相同（28px）'}，费用行折行的卡片不比 main 多`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./#/simulator');
      await expect(page.locator('#simhub .ucard').first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      const minis = await simMinis(page);
      expect(minis.length, '防空转：模拟器卡片').toBeGreaterThan(100);
      const pads = [...new Set(minis.map((m) => m.pad))];
      expect(pads, '没有 DLC 图标，手机宽度下不留 28px 空白').toEqual([width <= 600 ? '0px' : '28px']);
      const wrapped = minis.filter((m) => m.lines > 1).length;
      expect(wrapped, `费用行排成多行的卡片数（main 上限 ${SIM_WRAP_MAX[width]}）`).toBeLessThanOrEqual(SIM_WRAP_MAX[width]);
      await page.screenshot({ path: info.outputPath(`simulator-${width}.png`), fullPage: false });
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

// ---------- #316 新增城镇中心：两种解读同时列出（Steve 2026-10-21 21:11 / 21:18；issue 316 comment 6316912314） ----------
// 「看见新增城镇中心」始终同时列出两种解读，各带判断依据（位置）和一句应对；不随「可见范围」变化，不加新字段。
// 公开来源 AoE2 Coach 城镇中心页 https://aoecoach.com/en/resources/buildings/town-center/ ：
// - Castle Age Boom：“Upon reaching Castle Age, immediately build 2-3 additional Town Centers … rapidly grows your economy”
// - Forward Town Center：“building a Town Center on a contested gold or stone pile secures resources”；In pro play：“placing a TC near the opponent both pressures them”
// - How to counter it：“either boom harder yourself or punish them militarily”；“Forward TCs can be denied by contesting the location with early military or by Trebuchet/siege”
/** 判断依据 + 解读：同一句里（不跨句号 / 分号）位置线索与解读关键词相距不超过 24 字 */
const near = (cue: string, kw: string) => new RegExp(`(?:${cue})[^。；]{0,24}(?:${kw})|(?:${kw})[^。；]{0,24}(?:${cue})`);
const TC_BOOM_CUE = '敌方自家附近';
const TC_FWD_CUE = '前线|我方资源';
const TC_BOOM_READ = near(TC_BOOM_CUE, '扩张|经济');
const TC_FWD_READ = near(TC_FWD_CUE, '前置|进攻|压制');
/** 应对：扩张经济 → 同步扩张或用军队施压；前置 → 出兵争夺位置或用攻城武器拆除（须和「前置 / 前线 / 我方资源」写在同一句） */
const TC_BOOM_NEXT = /同步(扩张|发展)|更快地?(扩张|发展)|施压|惩罚|趁[^。；]{0,10}(出兵|进攻)/;
const TC_FWD_NEXT = near('前置|前线|我方资源', '争夺|驱逐|拆除|拆掉|投石|攻城|阻止|摧毁');
/** 城堡阶段情境下把「新增城镇中心」标为看到并选定可见范围，返回「看见新增城镇中心」这条信号的文字 */
async function extraTcSignal(page: Page, area: string): Promise<string> {
  await page.goto('./#/scouting');
  await page.getByLabel('情境', { exact: true }).selectOption('walled');
  await expect(page.getByLabel('我的当前阶段', { exact: true })).toHaveValue('castle');
  const obs = page.locator('[data-observation="new-town-center"]');
  await obs.getByLabel('新增城镇中心：状态', { exact: true }).selectOption('seen');
  await obs.locator('summary').click();
  await obs.getByLabel('新增城镇中心：可见范围', { exact: true }).selectOption(area);
  await expect(page.getByTestId('scouting-result')).toHaveAttribute('data-analysis-status', 'covered');
  const li = page.locator('[data-testid="scouting-signals"] > li[data-signal="extra-tc"]');
  await expect(li).toBeVisible();
  await expect(li).toContainText('看见新增城镇中心');
  return (await li.innerText()).replace(/\s+/g, ' ');
}
test.describe('#316 「看见新增城镇中心」同时列出两种解读', () => {
  test('标为看到后，信号里同时看得到两种解读、各自的判断依据和应对；换一种可见范围内容不变', async ({ page }) => {
    const a = await extraTcSignal(page, 'enemy-front');
    expect(a, '前置进攻（前线 / 我方资源点）').toMatch(TC_FWD_READ);
    expect(a, '扩张经济（必须写「敌方自家附近」，Steve 21:22）').toMatch(TC_BOOM_READ);
    expect(a, '前置的应对：出兵争夺位置或用攻城武器拆除').toMatch(TC_FWD_NEXT);
    expect(a, '扩张经济的应对：同步扩张或用军队施压').toMatch(TC_BOOM_NEXT);
    for (const area of ['own-approach', 'unknown']) expect(await extraTcSignal(page, area), `可见范围 ${area} 时内容相同`).toBe(a);
  });
  test('「看见新增城镇中心」的来源只有 AoE2 Coach，不标「本站整理」', async ({ page }) => {
    await page.goto('./#/scouting');
    await page.getByLabel('情境', { exact: true }).selectOption('walled');
    const li = page.locator('[data-testid="scouting-signals"] > li[data-signal="extra-tc"]');
    await expect(li).toContainText('看见新增城镇中心');
    await expect(li.locator('a[href^="http"]')).toHaveCount(1);
    await expect(li.locator('a[href^="http"]')).toHaveAttribute('href', 'https://aoecoach.com/en/resources/buildings/town-center/');
    await expect(li).not.toContainText('本站整理');
  });
  for (const width of WIDTHS)
    test(`#/scouting 城堡阶段、新增城镇中心标为看到 @${width}：.num 不折行、无横向滚动`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await extraTcSignal(page, 'enemy-front');
      expect(await wrappedNums(page, 'main')).toEqual([]);
      await noOverflow(page);
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
