import { expect, test, type Page } from '@playwright/test';
import civsRaw from '../../src/data/civs.json' with { type: 'json' };
import { guardPage, WIDTHS } from './v0290-helpers';

/**
 * v0.29.0 验收（#329）B 组：手机排版与交互（#313/#316 已并入 main：v0290-313|316.spec.ts）。Kent 写，先失败；标「守卫」的现在就应通过。
 * 搜索弱网（#325）已并入 main（tests/e2e/v0290-325-search.spec.ts）。
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
