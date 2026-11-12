import { expect, test, type Page } from '@playwright/test';
import civsRaw from '../../src/data/civs.json' with { type: 'json' };
import { guardPage, noOverflow, setTheme, THEMES, WIDTHS, wrappedFragments, wrappedNums } from './v0290-helpers';

/**
 * v0.29.0 验收（#329）B 组 #275 部分：取自 Kent Beck test/v0290-acceptance @ fd1c718 tests/e2e/v0290-B.spec.ts，断言原样未改。
 */
guardPage();

// ---------- #275 ----------
const BUILDS = ['archers-19', 'drush-fc', 'fast-castle-boom', 'fast-castle-knights', 'feudal-drush-18', 'hybrid-fish-18', 'maa-archers-18', 'scouts-18'];
/** 数字 + 单位（个、人、座、木、食、金、石，以及步骤里出现的名 / 头 / 只 / 艘 / 格 / 秒 / 分钟 / 人口 / 村民） */
const NUM_UNIT = /\d+(?:\.\d+)?\s*(?:名村民|个村民|人口|村民|分钟|个|人|座|木|食|金|石|名|头|只|艘|格|秒|块)/g;

test.describe('#275 开局步骤：数字与单位不断行', () => {
  for (const theme of THEMES)
    for (const width of WIDTHS)
      test(`#/builds 目录数字不断行 ${theme} @${width}`, async ({ page }) => {
        await setTheme(page, theme);
        await page.setViewportSize({ width, height: 900 });
        await page.goto('./#/builds');
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.locator('[data-t="build-order"]').first()).toBeVisible();
        await expect(page.locator('.bo-steps')).toHaveCount(0);
        expect(await wrappedNums(page, '.bo-catalog-list')).toEqual([]);
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

/**
 * #965：详情页 h1 改为加成原文。泛称「文明名 · 文明加成 N」留在页头标签里，并且不把序号拆到下一行。
 */
test.describe('#275 文明加成详情页标题（#965 起 h1 为加成原文，泛称在标签）', () => {
  for (const width of WIDTHS)
    test(`全部加成详情页 @${width}：h1 是加成原文，泛称标签不把序号拆行`, async ({ page }) => {
      test.setTimeout(180_000);
      await page.setViewportSize({ width, height: 900 });
      const bad: string[] = [];
      let checked = 0;
      for (const c of civsRaw as { en: string; zh: string; bon: string[] }[])
        for (let i = 0; i < c.bon.length; i++) {
          await page.goto(`./#/civ/${c.en}/bonus/${i}`);
          const heading = page.locator('#bonus h1');
          const kind = page.locator('#bonus .bon-kind');
          await expect(heading).toContainText(c.bon[i]!);
          await expect(kind).toHaveText(`${c.zh} · 文明加成 ${i + 1}`);
          const lines = await kind.evaluate((el) => el.getClientRects().length);
          checked++;
          if (lines !== 1) bad.push(`#/civ/${c.en}/bonus/${i} 泛称标签占了 ${lines} 行`);
        }
      expect(checked, '防空转：225 个标题都量到').toBe(225);
      expect(bad).toEqual([]);
    });
});

// 内容指南来源说明 p.cg-note 里的日期（Steve 2026-10-21 并入 #275，起因 #334 复核：375 断成「2023-」/「05-11」，390 断成「2024-11-」/「05」）
const ISO_DATE = /\d{4}-\d{2}-\d{2}/g;
async function cgNoteDates(page: Page) {
  return page.locator('main p.cg-note').evaluateAll((els, source) => {
    const all: string[] = [];
    const bad: string[] = [];
    for (const el of els) {
      if (!(el as HTMLElement).offsetParent) continue;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null)
        for (const m of n.data.matchAll(new RegExp(source, 'g'))) {
          all.push(m[0]);
          const lines: string[] = [];
          let top: number | null = null;
          for (let k = 0; k < m[0].length; k++) {
            const r = document.createRange();
            r.setStart(n, m.index! + k);
            r.setEnd(n, m.index! + k + 1);
            const t = Math.round(r.getBoundingClientRect().top);
            if (top === null || t !== top) lines.push('');
            top = t;
            lines[lines.length - 1] += m[0][k];
          }
          const range = document.createRange();
          range.setStart(n, m.index!);
          range.setEnd(n, m.index! + m[0].length);
          const tops = new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top)));
          if (tops.size > 1 || lines.length > 1) bad.push(`${m[0]} 断成「${lines.join('」/「')}」`);
        }
    }
    return { all, bad };
  }, ISO_DATE.source);
}
test.describe('#275 内容指南：来源说明里的日期不在连字符处断行（Steve 2026-10-21 并入）', () => {
  for (const width of WIDTHS)
    test(`#/content-guide @${width}：展开全部来源后，p.cg-note 里每个 YYYY-MM-DD 都在同一行`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./#/content-guide');
      const details = page.locator('main details');
      await expect(details.first()).toBeVisible();
      for (const d of await details.all()) if ((await d.getAttribute('open')) === null) await d.locator('> summary').click();
      // 防空转：三处支持站文章的发布日期都量到
      await expect(page.locator('main details.cg-sources li', { hasText: '发布日期：2023-05-11' })).toHaveCount(1);
      const { all, bad } = await cgNoteDates(page);
      expect(all, '防空转').toEqual(expect.arrayContaining(['2023-05-11', '2024-11-05']));
      expect(all.length).toBeGreaterThan(10);
      expect(bad).toEqual([]);
    });
});
