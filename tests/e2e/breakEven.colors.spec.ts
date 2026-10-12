import { expect, test, type Page } from '@playwright/test';
/** Kent #86：颜色守护（Jony 3 处必改）。弱化文字 = var(--color-muted) 解析值；置灰卡片里的参数摘要有效对比度 ≥ 4.5。 */
const AB = 'a=359.Byzantines.4.f.&b=569.Franks.4.f.';
const muted = (page: Page) =>
  page.evaluate(() => {
    const d = document.createElement('i');
    d.style.color = 'var(--color-muted)';
    document.body.appendChild(d);
    const c = getComputedStyle(d).color;
    d.remove();
    return c;
  });
/** 有效对比度：前景按祖先 opacity 累乘与背景混合，背景取第一个不透明的祖先背景色 */
const contrast = (page: Page, sel: string) =>
  page.locator(sel).first().evaluate((el) => {
    const rgb = (s: string) => (s.match(/[\d.]+/g) ?? []).map(Number);
    let op = 1, bg: number[] | null = null;
    for (let e: Element | null = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      op *= Number(cs.opacity);
      const b = rgb(cs.backgroundColor);
      if (!bg && b.length >= 3 && (b[3] ?? 1) > 0.99) bg = b;
    }
    bg ??= [255, 255, 255];
    const f = rgb(getComputedStyle(el).color);
    const a = op * (f[3] ?? 1);
    const mix = [0, 1, 2].map((i) => f[i]! * a + bg![i]! * (1 - a));
    const L = (c: number[]) => {
      const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const [x, y] = [L(mix), L(bg)].sort((p, q) => q - p);
    return { ratio: (x! + 0.05) / (y! + 0.05), color: getComputedStyle(el).color, opacity: op, bg: `rgb(${bg.slice(0, 3).join(', ')})` };
  });
for (const w of [390, 1280] as const)
  test.describe(`盈亏平衡颜色 @${w}`, () => {
    test.use({ viewport: { width: w, height: 900 } });
    test('副文案「N 个及以上都能赢」= --color-muted', async ({ page }) => {
      await page.goto(`./#/duel?${AB}&m=n&na=10&nb=10&be=1`);
      const c = await page.locator('[data-t=be-sub]').evaluate((e) => getComputedStyle(e).color);
      console.log('be-sub', c, await contrast(page, '[data-t=be-sub]'));
      expect(c).toBe(await muted(page));
    });
    test('上限态「200 个以内都打不赢」= --color-muted', async ({ page }) => {
      await page.goto('./#/duel?a=128.Britons.4.f.&b=569.Franks.4.f.&m=n&na=10&nb=10&be=1');
      const b = page.locator('[data-t=be-cap] b');
      const [c, fs] = await b.evaluate((e) => [getComputedStyle(e).color, getComputedStyle(e).fontSize]);
      console.log('be-cap', c, fs, await contrast(page, '[data-t=be-cap] b'));
      expect(c).toBe(await muted(page));
    });
    test('置灰卡片：参数摘要对比度 ≥ 4.5，卡片其余部分仍置灰', async ({ page }) => {
      await page.goto(`./#/duel?${AB}&m=1`);
      await page.getByRole('button', { name: '算盈亏平衡' }).click();
      await page.getByRole('radio', { name: '无科技' }).first().click();
      await expect(page.locator('.be-card')).toHaveClass(/is-stale/);
      const s = await contrast(page, '.be-sum');
      const hero = await contrast(page, '.be-hero');
      console.log('be-sum stale', s, 'hero', hero);
      expect(s.ratio).toBeGreaterThanOrEqual(4.5);
      expect(hero.opacity).toBeLessThan(1);
    });
  });
