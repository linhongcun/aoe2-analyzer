import { expect, test, type Locator } from '@playwright/test';

/** 文字与（逐层合成后的）背景的对比度，WCAG 公式 */
async function contrast(el: Locator) {
  return el.evaluate((node) => {
    const parse = (c: string) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return [0, 0, 0, 0];
      const p = m[1]!
        .split(/[ ,/]+/)
        .filter(Boolean)
        .map(Number);
      return [p[0]!, p[1]!, p[2]!, p[3] ?? 1];
    };
    // 从自己往上收集背景，直到不透明，再从下往上合成
    const layers: number[][] = [];
    for (let e: Element | null = node; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      const b = parse(cs.backgroundColor);
      // 纯色渐变层（linear-gradient(c, c)）叠在 background-color 之上
      const g = cs.backgroundImage.startsWith('linear-gradient') ? parse(cs.backgroundImage) : null;
      if (g && g[3]! > 0) layers.push(g);
      if (b[3]! > 0) layers.push(b);
      if (b[3] === 1) break; // layers 顺序：上层在前
    }
    let bg = [255, 255, 255];
    for (const l of layers.reverse()) bg = bg.map((v, i) => l[i]! * l[3]! + v * (1 - l[3]!));
    const fg0 = parse(getComputedStyle(node).color);
    const fg = bg.map((v, i) => fg0[i]! * fg0[3]! + v * (1 - fg0[3]!));
    const lum = (c: number[]) =>
      c
        .map((v) => v / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i]!, 0);
    const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    return (a! + 0.05) / (b! + 0.05);
  });
}

for (const scheme of ['light', 'dark'] as const)
  test(`390 ${scheme}：点开 drush-fc 第 9 步后，两行卡点文字对比度 ≥ 4.5（含 :focus 与悬停）`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('#/builds?bo=drush-fc');
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), scheme);
    const row = page.locator('.tl-steps > li').nth(8);
    const btn = row.locator('.tl-step');
    await btn.tap().catch(() => btn.click());
    await expect(row).toHaveAttribute('aria-selected', 'true');
    await btn.focus();
    await btn.hover();
    const segs = row.locator('[data-t="row-seg"]');
    await expect(segs).toHaveCount(2);
    for (let i = 0; i < 2; i++) expect(await contrast(segs.nth(i)), `第 ${i + 1} 行`).toBeGreaterThanOrEqual(4.5);
    // 悬停底色不是 base.css 的铜色
    const bg = await btn.evaluate((e) => getComputedStyle(e).backgroundImage + getComputedStyle(e).backgroundColor);
    const bronze = await page.evaluate(() => {
      const d = document.createElement('div');
      d.style.background = 'var(--c-bronze)';
      document.body.append(d);
      const c = getComputedStyle(d).backgroundColor;
      d.remove();
      return c;
    });
    expect(bg).not.toBe(bronze);
  });
