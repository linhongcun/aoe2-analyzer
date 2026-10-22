// v0.30.0 #296 验收：#/builds 与 #/duel 各有且仅有一个描述页面用途的 h1；跟练 / 时间线详情与列表页的 h1 不冲突。Kent Beck 2026-10-22。
// 验收标准（#296 原文）：
//   - #/builds 与 #/duel 各有且仅有一个描述页面用途的 h1（可用现有视觉 class，不必改字号体系）
//   - 跟练视图 / 时间线详情若已有 h1，列表页与详情页层级不冲突（详情可用 h1，列表离开后详情独立）
//   - 加一条简单 e2e 或 axe 检查：这两路由存在 h1
// 「描述页面用途」按页面元数据标题核对：h1 文字要包含 page-metadata.json 里该路由的 title（f856c9e：/builds「开局流程」、/duel「单位 PK」）。
// [严格读法·待 Steve] 用 page-metadata 标题判断「描述页面用途」；若允许别的措辞（如「开局流程列表」以外的「建造顺序」），这条要放宽。
import { expect, test, type Page } from '@playwright/test';
import meta from '../../src/data/page-metadata.json' with { type: 'json' };

const WIDTHS = [360, 375, 390, 1280] as const;
const TITLE = meta as Record<string, { title: string }>;
const h1s = (page: Page) => page.locator('h1').evaluateAll((hs) => hs.map((h) => (h as HTMLElement).innerText.trim()));
async function go(page: Page, route: string) {
  await page.goto(`./#${route}`, { waitUntil: 'networkidle' });
  await expect(page.locator('main')).not.toBeEmpty();
}

test.describe('#296 #/builds 与 #/duel 有且仅有一个 h1', () => {
  for (const route of ['/builds', '/duel'])
    for (const w of WIDTHS)
      test(`#${route} @${w}：整页恰好一个 h1，在 main 里、可见、有文字`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: 800 });
        await go(page, route);
        expect(await h1s(page)).toHaveLength(1);
        const h1 = page.locator('main h1');
        await expect(h1).toHaveCount(1);
        await expect(h1).toBeVisible();
        expect((await h1.innerText()).trim().length, '有文字').toBeGreaterThanOrEqual(2);
      });
  for (const route of ['/builds', '/duel'])
    test(`[严格读法·待 Steve] #${route}：h1 文字含页面元数据标题「${TITLE[route]!.title}」`, async ({ page }) => {
      await go(page, route);
      await expect(page.locator('main h1')).toContainText(TITLE[route]!.title);
    });
});

test.describe('#296 对照：详情页与列表页的 h1 不冲突', () => {
  const DETAILS = ['/builds?bo=archers-19', '/builds?bo=archers-19&view=practice', '/builds?bo=fast-castle-boom&view=practice'];
  for (const route of DETAILS)
    test(`#${route}：整页最多一个 h1（列表页的 h1 不与详情同时出现）`, async ({ page }) => {
      await go(page, route);
      const hs = await h1s(page);
      expect(hs.length, JSON.stringify(hs)).toBeLessThanOrEqual(1);
      if (hs.length) expect(hs[0], '详情 h1 不是列表页标题').not.toBe(TITLE['/builds']!.title);
    });
  test('跟练视图 h1 仍是开局名（f856c9e：BuildPracticeView 的 h1）', async ({ page }) => {
    await go(page, '/builds?bo=archers-19&view=practice');
    await expect(page.locator('main h1')).toHaveCount(1);
    await expect(page.locator('main h1')).not.toHaveText(TITLE['/builds']!.title);
  });
  test('从详情返回列表：恰好一个 h1（不残留详情的 h1）', async ({ page }) => {
    await go(page, '/builds?bo=archers-19&view=practice');
    await go(page, '/builds');
    expect(await h1s(page)).toHaveLength(1);
    await expect(page.locator('main h1')).not.toHaveText('');
  });
  // 不含 #/team-plan：f856c9e 上该页有两个 h1（TeamPlan.tsx 109 与 670 行），不在 #296 范围
  for (const route of ['/', '/game-clock', '/market'])
    test(`其它工具页 #${route} 仍恰好一个 h1`, async ({ page }) => {
      await go(page, route);
      expect(await h1s(page)).toHaveLength(1);
    });
});
