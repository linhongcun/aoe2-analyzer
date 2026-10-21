import { expect, test, type Page } from '@playwright/test';

/** v0.29.0 验收（#329）e2e 公共部分。Kent 写。 */
export const WIDTHS = [360, 375, 390, 1280] as const;
export const THEMES = ['light', 'dark'] as const;

/** 每条用例：页面无报错、无横向滚动 */
export function guardPage() {
  const errors = new WeakMap<Page, string[]>();
  test.beforeEach(async ({ page }) => {
    const list: string[] = [];
    errors.set(page, list);
    page.on('pageerror', (e) => list.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') list.push(m.text());
    });
  });
  test.afterEach(async ({ page }) => {
    expect(errors.get(page)).toEqual([]);
    await noOverflow(page);
  });
}

export async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '无横向滚动').toBe(true);
}

export async function setTheme(page: Page, theme: (typeof THEMES)[number]) {
  await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
}

/** 范围内所有 `.num` 元素：文字只占一行。返回折行的元素文字。 */
export async function wrappedNums(page: Page, scope = 'body'): Promise<string[]> {
  return page
    .locator(scope)
    .first()
    .evaluate((root) => {
      const out: string[] = [];
      root.querySelectorAll('.num').forEach((el) => {
        if (!(el as HTMLElement).offsetParent && getComputedStyle(el).position !== 'fixed') return;
        // 只量文字节点自身的行矩形，不把子元素的边框盒算进去
        const rects: DOMRect[] = [];
        const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let n = tw.nextNode(); n; n = tw.nextNode()) {
          if (!n.textContent?.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(n);
          rects.push(...[...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0));
        }
        const lines: { top: number; bottom: number }[] = [];
        for (const r of rects) if (!lines.some((l) => r.top < l.bottom - 2 && r.bottom > l.top + 2)) lines.push({ top: r.top, bottom: r.bottom });
        if (lines.length > 1) out.push((el.textContent ?? '').trim());
      });
      return out;
    });
}

/**
 * 「数字 + 单位」片段跨行检查（#275 验收：逐个数字片段取 Range 的 clientRects，不应出现多行）。
 * 在 scope 内每个可见元素的文字里找 pattern 的每个匹配，按文字偏移跨文本节点建 Range。
 */
export async function wrappedFragments(page: Page, scope: string, pattern: RegExp): Promise<string[]> {
  return page.locator(scope).evaluateAll(
    (roots, [source, flags]) => {
      const out: string[] = [];
      const re = new RegExp(source, flags);
      for (const root of roots) {
        if (!(root as HTMLElement).offsetParent) continue;
        // 切成连续的行内文字段：最近的块级祖先一变就另起一段（inline / inline-block / inline-flex / contents 都算行内）。
        // 不把标题「第 15 步」和下一段「3 个」拼在一起；数字包在 inline-block 里也仍和后面的单位算同一段；块前后的文字不会被拼接。
        const INLINE = ['inline', 'inline-block', 'inline-flex', 'contents'];
        const groups: Text[][] = [];
        let lastBlock: Element | null = null;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          let block = n.parentElement!;
          while (block !== root && INLINE.includes(getComputedStyle(block).display)) block = block.parentElement!;
          if (block !== lastBlock || !groups.length) groups.push([]);
          lastBlock = block;
          groups[groups.length - 1]!.push(n as Text);
        }
        for (const nodes of groups) {
          const text = nodes.map((n) => n.data).join('');
          const locate = (offset: number, end: boolean): [Text, number] => {
            let acc = 0;
            for (const n of nodes) {
              const len = n.data.length;
              if (end ? offset <= acc + len : offset < acc + len) return [n, offset - acc];
              acc += len;
            }
            const last = nodes[nodes.length - 1]!;
            return [last, last.data.length];
          };
          for (const m of text.matchAll(re)) {
            const range = document.createRange();
            const [sn, so] = locate(m.index!, false);
            const [en, eo] = locate(m.index! + m[0].length, true);
            range.setStart(sn, so);
            range.setEnd(en, eo);
            const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
            const lines: { top: number; bottom: number }[] = [];
            for (const r of rects) if (!lines.some((l) => r.top < l.bottom - 2 && r.bottom > l.top + 2)) lines.push({ top: r.top, bottom: r.bottom });
            if (lines.length > 1) out.push(m[0]);
          }
        }
      }
      return out;
    },
    [pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'] as const,
  );
}
