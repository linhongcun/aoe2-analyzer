import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

function attachErrorGuard(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

async function openWithTheme(page: Page, hash: string, width: number, theme: 'light' | 'dark' = 'light') {
  await page.setViewportSize({ width, height: 900 });
  if (!page.url().startsWith('http')) await page.goto(`./#${hash}`);
  await page.evaluate((t) => {
    window.localStorage.setItem('aoe2-theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }, theme);
  await page.goto('about:blank');
  await page.goto(`./#${hash}`);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

async function readOrderedSummary(summary: Locator) {
  return summary.evaluate((el) => {
    const items: { res: string; value: number; zero: boolean }[] = [];
    for (const node of el.querySelectorAll('.sim-summary-cost .sim-ordered-cost .res')) {
      const alt = node.querySelector('img')?.getAttribute('alt') ?? '';
      const val = Number((node.textContent ?? '').replace(/[^\d.]/g, ''));
      items.push({ res: alt, value: val, zero: node.getAttribute('data-zero') === 'true' });
    }
    const time = Number((el.querySelector('.sim-summary-time')?.textContent ?? '').replace(/[^\d.]/g, ''));
    return { items, time };
  });
}

async function assertNoOverflowAndNoWrap(page: Page, scope: string, maxWidth: number) {
  const res = await page.evaluate(
    ({ sel, vw }) => {
      const root = document.querySelector(sel);
      if (!root) return { found: false, overflow: 999, wrapped: [] as string[] };
      const overflow = document.documentElement.scrollWidth - vw;
      const wrapped: string[] = [];
      for (const el of root.querySelectorAll('.num.nw, .sim-price-pill.nw')) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const rects = [...el.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
        const tops = rects.map((r) => r.top);
        if (tops.length > 1 && Math.max(...tops) - Math.min(...tops) > 6) {
          wrapped.push((el.textContent ?? '').trim());
        }
      }
      return { found: true, overflow, wrapped };
    },
    { sel: scope, vw: maxWidth },
  );
  expect(res.found, `missing ${scope}`).toBe(true);
  expect(res.overflow, `horizontal overflow at ${maxWidth}px`).toBeLessThanOrEqual(1);
  expect(res.wrapped, `.num.nw / pill wrapped at ${maxWidth}px`).toEqual([]);
}

test.describe('Issue 1496 科技模拟器同源研究费用与三消费面验证', () => {
  test('单位/建筑模拟器核心代表链、时代联动、跨科技顺序冲突、条顿 322 与反例', async ({ page }) => {
    test.setTimeout(60000);
    const errors = attachErrorGuard(page);

    // 1) 意大利 精锐热那亚弩手 868（8 项）：化学折后、汇总 1625/250/900、目录原价删除线穿透
    await openWithTheme(page, '/unit/868/Italians/4/437,199,211,200,212,201,219,47/?tab=sim', 1280, 'light');
    const summary = page.locator('#sim .sim-summary');
    await expect(summary).toBeVisible();
    const chemRow = page.locator('#sim label.simt').filter({ has: page.getByRole('link', { name: '化学', exact: true }) });
    await expect(chemRow.locator('.simc')).toHaveAttribute('data-price-state', 'discounted');
    await expect(chemRow.locator('[data-t="sim-row-discounted"]')).toHaveText('折后');
    await expect(chemRow.locator('.simc')).toContainText('225');
    await expect(chemRow.locator('.simc')).toContainText('150');
    await expect(summary.locator('[data-t="sim-summary-discount-badge"]')).toHaveText('已计入文明研究折扣');
    await expect(summary.locator('[data-t="sim-summary-note"]')).toHaveText('一次性研究投入，不计入单兵训练价');
    await expect(summary.locator('[data-t="sim-summary-decimal-note"]')).toHaveCount(0);
    await expect(summary.locator('[data-t="sim-summary-time-note"]')).toContainText('累计研究时长按目录基础时间合计');
    const it868 = await readOrderedSummary(summary);
    expect(it868).toEqual({
      items: [
        { res: '食物', value: 1625, zero: false },
        { res: '木材', value: 250, zero: false },
        { res: '黄金', value: 900, zero: false },
      ],
      time: 415,
    });
    const strikeLines = await summary
      .locator('[data-t="sim-summary-base"] s .res')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).textDecorationLine));
    expect(strikeLines.length).toBeGreaterThan(0);
    for (const line of strikeLines) expect(line).toContain('line-through');

    // 2) 意大利 城堡 82（8 项）：修正金木顺位 1575 食 / 281.25 木 / 575 金 / 75 石 + 2 项含小数提示
    await openWithTheme(page, '/building/82?tab=sim&civ=Italians&age=4&techs=47,50,51,199,200,201,322,380', 1280, 'light');
    expect(await readOrderedSummary(summary)).toEqual({
      items: [
        { res: '食物', value: 1575, zero: false },
        { res: '木材', value: 281.25, zero: false },
        { res: '黄金', value: 575, zero: false },
        { res: '石料', value: 75, zero: false },
      ],
      time: 390,
    });
    await expect(summary.locator('[data-t="sim-summary-decimal-note"]')).toContainText('有 2 项已选研究折后价含小数');
    await expect(summary.locator('[data-t="sim-summary-note"]')).toHaveText('一次性研究投入，不计入单座建造价');

    // 3) 中国 城堡 82（3 项含小数）+ 中国 村民 83 织布机 22 黑暗/封建/城堡/帝王联动
    await openWithTheme(page, '/building/82?tab=sim&civ=Chinese&age=4&techs=47,50,51,199,200,201,322,380', 360, 'dark');
    expect(await readOrderedSummary(summary)).toEqual({
      items: [
        { res: '食物', value: 1615, zero: false },
        { res: '木材', value: 318.75, zero: false },
        { res: '黄金', value: 552.5, zero: false },
        { res: '石料', value: 85, zero: false },
      ],
      time: 390,
    });
    await expect(summary.locator('[data-t="sim-summary-decimal-note"]')).toContainText('有 3 项已选研究折后价含小数');
    await assertNoOverflowAndNoWrap(page, '#sim', 360);

    await openWithTheme(page, '/unit/83/Chinese/1/22/?tab=sim', 1280, 'light');
    for (const [age, gold] of [
      ['1', 50],
      ['2', 47.5],
      ['3', 45],
      ['4', 42.5],
    ] as const) {
      await page.locator('#simage').selectOption(age);
      expect((await readOrderedSummary(summary)).items).toEqual([{ res: '黄金', value: gold, zero: false }]);
    }

    // 4) 马扎尔 翼骑兵 441：8 项混排（1050/450）与 3 项全免态（免费 · 0 资源 / 225 秒，非 —）
    await openWithTheme(page, '/unit/441/Magyars/4/435,39,67,81,68,82,75,80/?tab=sim', 1280, 'light');
    const forgingRow = page.locator('#sim label.simt').filter({ has: page.getByRole('link', { name: '锻造', exact: true }) });
    await expect(forgingRow.locator('[data-t="sim-row-free"]')).toHaveText('免费');
    expect(await readOrderedSummary(summary)).toEqual({
      items: [
        { res: '食物', value: 1050, zero: false },
        { res: '黄金', value: 450, zero: false },
      ],
      time: 495,
    });

    await openWithTheme(page, '/unit/441/Magyars/4/67,68,75/?tab=sim', 360, 'light');
    await expect(summary.locator('.sim-summary-cost')).toHaveAttribute('data-state', 'free');
    await expect(summary.locator('[data-t="sim-summary-free"]')).toContainText('免费');
    await expect(summary.locator('[data-t="sim-summary-free"]')).toContainText('0 资源');
    await expect(summary.locator('[data-t="sim-summary-base"]')).toContainText('645');
    await expect(summary.locator('[data-t="sim-summary-base"]')).toContainText('345');
    await expect(summary.locator('.sim-summary-time')).toContainText('225');
    await expect(summary.locator('[data-t="sim-summary-discount-badge"]')).toHaveCount(0);
    await assertNoOverflowAndNoWrap(page, '#sim', 360);

    // 5) 西班牙 翼骑兵 441（1695/100，4 项铁匠科技高亮 0 金，无金原价项干净无徽标）
    await openWithTheme(page, '/unit/441/Spanish/4/435,39,67,81,68,82,75,80/?tab=sim', 1280, 'dark');
    expect(await readOrderedSummary(summary)).toEqual({
      items: [
        { res: '食物', value: 1695, zero: false },
        { res: '黄金', value: 100, zero: false },
      ],
      time: 495,
    });
    const ironRow = page.locator('#sim label.simt').filter({ has: page.getByRole('link', { name: '铸铁', exact: true }) });
    await expect(ironRow.locator('.simc [data-zero="true"]')).toContainText('0');
    await expect(forgingRow.locator('.simc')).toHaveAttribute('data-price-state', 'normal');

    // 6) 波希米亚 僧侣 125 满科技：500/965 + 跨科技顺序提示 + 跳转阵容新增费用无报错 + 取消 785 提示消失
    await openWithTheme(page, '/unit/125/Bohemians/4/231,252,230,785/?tab=sim', 1280, 'light');
    expect(await readOrderedSummary(summary)).toEqual({
      items: [
        { res: '食物', value: 500, zero: false },
        { res: '黄金', value: 965, zero: false },
      ],
      time: 210,
    });
    const orderNote = summary.locator('[data-t="sim-summary-order-note"]');
    await expect(orderNote).toBeVisible();
    await expect(orderNote).toContainText('胡斯革新');
    await expect(orderNote).toContainText('圣洁');
    const hussiteBox = page.locator('#sim label.simt').filter({ has: page.getByRole('link', { name: '胡斯革新', exact: true }) });
    await hussiteBox.locator('input[type="checkbox"]').uncheck();
    await expect(orderNote).toHaveCount(0);
    await hussiteBox.locator('input[type="checkbox"]').check();
    await expect(orderNote).toBeVisible();
    await orderNote.locator('a.sim-summary-link').click();
    await expect(page.locator('[data-testid="army-cost-page"]')).toBeVisible();
    await expect(page.locator('#army-civ')).toContainText('波希米亚');
    await expect(page.locator('[data-testid="army-cost-page"]')).not.toContainText('无法解码');

    // 7) 条顿 城堡 82 近射孔 322：200 食 / 0 石（非免费）
    await openWithTheme(page, '/building/82?tab=sim&civ=Teutons&age=4&techs=322', 390, 'light');
    expect(await readOrderedSummary(summary)).toEqual({
      items: [
        { res: '食物', value: 200, zero: false },
        { res: '石料', value: 0, zero: true },
      ],
      time: 35,
    });
    await expect(summary.locator('[data-t="sim-summary-free"]')).toHaveCount(0);

    // 8) 勃艮第 村民 83 755 过滤反例 + 法兰克 游侠 569 空态无折扣反例 + 意大利 大帆船 2628 拥挤行 360 压测
    await openWithTheme(page, '/unit/83/Burgundians/4/213,249/?tab=sim', 360, 'light');
    expect(await readOrderedSummary(summary)).toEqual({
      items: [
        { res: '食物', value: 285, zero: false },
        { res: '木材', value: 250, zero: false },
      ],
      time: 130,
    });
    const flemishRow = page.locator('#sim label.simt').filter({ has: page.getByRole('link', { name: '弗拉芒革命', exact: true }) });
    await expect(flemishRow.locator('.simc')).toHaveAttribute('data-price-state', 'normal');
    await expect(flemishRow.locator('.simc')).toContainText('200');
    await expect(flemishRow.locator('.simc')).toContainText('150');
    await assertNoOverflowAndNoWrap(page, '#sim', 360);

    await openWithTheme(page, '/unit/569/Franks/4/?tab=sim', 1280, 'light');
    await expect(summary.locator('.sim-summary-cost')).toHaveAttribute('data-state', 'empty');
    await expect(summary.locator('.sim-summary-cost')).toHaveText('—');
    await expect(summary.locator('[data-t="sim-summary-discount-badge"]')).toHaveCount(0);
    await expect(summary.locator('[data-t="sim-summary-base"]')).toHaveCount(0);

    await openWithTheme(page, '/unit/2628/Italians/4/373,374,375,908/?tab=sim', 360, 'light');
    const shipwrightRow = page.locator('#sim label.simt').filter({ has: page.getByRole('link', { name: '造船匠', exact: true }) });
    await expect(shipwrightRow.locator('[data-t="sim-cost-badge"]')).toHaveText('影响造价');
    await expect(shipwrightRow.locator('[data-t="sim-row-discounted"]')).toHaveText('折后');
    await assertNoOverflowAndNoWrap(page, '#sim', 360);

    expect(errors).toEqual([]);
  });

  test('#/duel 内嵌 SimPanel 口径一致、#duel span.nw 覆盖守卫生效及浅深主题 axe 零违规', async ({ page }) => {
    const errors = attachErrorGuard(page);

    for (const [width, theme] of [
      [1280, 'light'],
      [360, 'dark'],
    ] as const) {
      await openWithTheme(page, '/duel?a=441.Spanish.4.f.&b=868.Italians.4.f.&m=r&bud=3000', width, theme);
      for (const side of ['a', 'b'] as const) {
        const det = page.locator(`#duel-${side} details.duel-tech`);
        await det.locator('> summary').click();
      }
      const sumA = page.locator('#duel-a .sim-summary');
      const sumB = page.locator('#duel-b .sim-summary');
      expect(await readOrderedSummary(sumA)).toEqual({
        items: [
          { res: '食物', value: 1695, zero: false },
          { res: '黄金', value: 100, zero: false },
        ],
        time: 495,
      });
      expect(await readOrderedSummary(sumB)).toEqual({
        items: [
          { res: '食物', value: 1625, zero: false },
          { res: '木材', value: 250, zero: false },
          { res: '黄金', value: 900, zero: false },
        ],
        time: 415,
      });

      // #duel span.nw 覆盖守卫：.sim-ordered-cost .res / .sim-price-pill / .simc .simc-time 均为弹性盒（flex 子项会块化为 flex，不被降级为 block/inline-block）
      const displays = await page.locator('#duel-a').evaluate((el) => ({
        res: getComputedStyle(el.querySelector('.sim-ordered-cost .res')!).display,
        pill: getComputedStyle(el.querySelector('.sim-price-pill')!).display,
        time: getComputedStyle(el.querySelector('.simc .simc-time')!).display,
      }));
      for (const [k, d] of Object.entries(displays)) {
        expect(['flex', 'inline-flex'], `#duel-a ${k} display`).toContain(d);
      }

      await assertNoOverflowAndNoWrap(page, '#duel-a .sim-summary', width);
      await assertNoOverflowAndNoWrap(page, '#duel-b .sim-summary', width);
      const axe = await new AxeBuilder({ page }).include('#duel-a .sim-summary').include('#duel-b .sim-summary').withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(axe.violations, `duel sim-summary axe ${width} ${theme}`).toEqual([]);
    }

    // 单位/建筑模拟器浅深主题对比度抽查（含折后、免费、单资源归零、小数、顺序告警）
    for (const [hash, width, theme] of [
      ['/unit/125/Bohemians/4/231,252,230,785/?tab=sim', 1280, 'light'],
      ['/unit/125/Bohemians/4/231,252,230,785/?tab=sim', 360, 'dark'],
      ['/building/82?tab=sim&civ=Chinese&age=4&techs=47,50,51,199,200,201,322,380', 360, 'light'],
      ['/building/82?tab=sim&civ=Chinese&age=4&techs=47,50,51,199,200,201,322,380', 360, 'dark'],
      ['/unit/441/Spanish/4/435,39,67,81,68,82,75,80/?tab=sim', 390, 'light'],
      ['/unit/441/Spanish/4/435,39,67,81,68,82,75,80/?tab=sim', 390, 'dark'],
    ] as const) {
      await openWithTheme(page, hash, width, theme);
      await expect(page.locator('#sim .sim-summary')).toBeVisible();
      await assertNoOverflowAndNoWrap(page, '#sim', width);
      const axe = await new AxeBuilder({ page }).include('#sim .sim-summary').include('#sim .simg').withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(axe.violations, `sim axe ${hash} ${width} ${theme}`).toEqual([]);
    }

    expect(errors).toEqual([]);
  });
});
