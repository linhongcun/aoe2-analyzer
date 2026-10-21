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

/**
 * 加成详情页标题「文明名 · 文明加成 N」的断行（逐字取 Range 的 clientRects，同 wrappedNums 的量法）：
 * Steve 2026-10-21 20:31：「文明加成 N」整体不断行，文明名本身也不断；放不下时只在文明名与「文明加成」之间换行。
 * 返回各段占了几行；null 表示标题不含该格式。只看 h1 自身的文字，不含 <small> 里的英文副标题。
 */
async function bonusTitleLines(page: Page): Promise<{ civ: number; tail: number; num: boolean } | null> {
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
      const m = /^(\s*)(\S.*?)\s*·\s*(文明加成\s*\d+)\s*$/.exec(text);
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
      const tailFrom = text.indexOf(m[3]!, civTo),
        tailTo = tailFrom + m[3]!.length;
      const numFrom = tailFrom + m[3]!.search(/\d/);
      const chengAt = tailFrom + m[3]!.indexOf('成');
      const cheng = lines(chengAt, chengAt + 1);
      const num = lines(numFrom, tailTo);
      return {
        civ: lines(civFrom, civTo).length,
        tail: lines(tailFrom, tailTo).length,
        // 序号单独成行：「成」与 N 不在同一行
        num: !(num[0]!.top < cheng[0]!.bottom - 2 && num[0]!.bottom > cheng[0]!.top + 2),
      };
    });
}
test.describe('#275 文明加成详情页标题：只在文明名与「文明加成」之间换行（Steve 2026-10-21 并入，起因土耳其 @360）', () => {
  for (const width of WIDTHS)
    test(`全部加成详情页标题 @${width}：文明名不断行，「文明加成 N」不断行，序号不单独成行`, async ({ page }) => {
      test.setTimeout(180_000);
      await page.setViewportSize({ width, height: 900 });
      const bad: string[] = [];
      let checked = 0;
      for (const c of civsRaw as { en: string; bon: string[] }[])
        for (let i = 0; i < c.bon.length; i++) {
          await page.goto(`./#/civ/${c.en}/bonus/${i}`);
          await expect(page.locator('main h1').first()).toContainText(`文明加成 ${i + 1}`);
          const r = await bonusTitleLines(page);
          if (r === null) {
            bad.push(`${c.en}/bonus/${i} 标题不是「文明名 · 文明加成 N」`);
            continue;
          }
          checked++;
          const why = [r.civ > 1 && `文明名断成 ${r.civ} 行`, r.tail > 1 && `「文明加成 N」断成 ${r.tail} 行`, r.num && '序号单独成行'].filter(Boolean);
          if (why.length)
            bad.push(`#/civ/${c.en}/bonus/${i}「${(await page.locator('main h1').first().innerText()).replace(/\s+/g, ' ')}」：${why.join('、')}`);
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
