// v0.30.0 #294 验收：数据版本徽章有 accessible name；收起的「关闭菜单」不进 Tab 序；全站有跳到主内容的链接。Kent Beck 2026-10-22。
// 验收标准（#294 原文）：
//   - .verbadge 在文字隐藏时仍有明确的 accessible name（例如 aria-label="数据版本与来源说明"），不单靠 title
//   - 主导航未打开时，「关闭菜单」不可聚焦（inert、hidden、或从 Tab 序移除）；打开抽屉后可聚焦并关闭
//   - 在 skip 到 main（或等价主内容锚点）的链接，焦点态可见，符合 WCAG AA 对比
//   - 360/375/390 下上述控件热区可用；不引入 emoji
// 注：f856c9e 上抽屉收起时 nav 为 display:none，「关闭菜单」已不在 Tab 序里——这几条是对照（绿），防回退。
// [Steve 2026-10-22 确认] 「热区可用」按 44×44 判断（徽章、菜单、关闭菜单、跳到主内容）；正文里的行内文字链接除外（本文件没有测行内链接）。
// [Steve 2026-10-22 确认] 跳到主内容链接要求是页面第一个 Tab 停点。
import { expect, test, type Locator, type Page } from '@playwright/test';

const NARROW = [360, 375, 390] as const;
const WIDTHS = [...NARROW, 1280] as const;
const ROUTES = ['/', '/market', '/builds'];
const EMOJI = /\p{Extended_Pictographic}/u;
const SKIP = /主.{0,2}内容|正文|跳过导航/;
async function go(page: Page, route: string, w: number, theme: 'light' | 'dark' = 'light') {
  await page.addInitScript((t) => localStorage.setItem('aoe2-theme', t), theme);
  await page.setViewportSize({ width: w, height: 800 });
  await page.goto(`./#${route}`, { waitUntil: 'networkidle' });
  await expect(page.locator('main')).not.toBeEmpty();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}
/** 新载入的页面从文档开头按 Tab n 次（不先点页面，免得改了顺序导航起点） */
async function tabStops(page: Page, n: number) {
  const out: { name: string; w: number; h: number }[] = [];
  for (let i = 0; i < n; i++) {
    await page.keyboard.press('Tab');
    out.push(
      await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const r = el.getBoundingClientRect();
        return { name: el.getAttribute('aria-label') || el.innerText.trim().slice(0, 20), w: r.width, h: r.height };
      }),
    );
  }
  return out;
}
/** 文字对比度：从根往下逐层叠合半透明背景，再叠合文字色 */
const contrast = (loc: Locator) =>
  loc.evaluate((el) => {
    const parse = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
    };
    const chain: Element[] = [];
    for (let n: Element | null = el; n; n = n.parentElement) chain.unshift(n);
    const opacity = chain.reduce((p, n) => p * Number(getComputedStyle(n).opacity), 1);
    let bg = [255, 255, 255];
    for (const n of chain) {
      const [r, g, b, a = 1] = parse(getComputedStyle(n).backgroundColor);
      if (r === undefined || a === 0) continue;
      bg = [r, g!, b!].map((v, i) => v * a + bg[i]! * (1 - a));
    }
    const [r, g, b, a0 = 1] = parse(getComputedStyle(el).color);
    const a = a0 * opacity;
    const fg = [r!, g!, b!].map((v, i) => v * a + bg[i]! * (1 - a));
    const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    return (hi! + 0.05) / (lo! + 0.05);
  });
/** 元素样式快照：用来比较聚焦前后是否有可见变化 */
const look = (loc: Locator) =>
  loc.evaluate((el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    let op = 1;
    for (let n: Element | null = el; n; n = n.parentElement) op *= Number(getComputedStyle(n).opacity);
    const onScreen =
      r.width > 1 &&
      r.height > 1 &&
      r.bottom > 0 &&
      r.right > 0 &&
      r.left < innerWidth &&
      r.top < innerHeight &&
      s.visibility !== 'hidden' &&
      op > 0 &&
      s.clipPath === 'none' &&
      s.clip === 'auto';
    const ring = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none';
    return { onScreen, ring, paint: [s.backgroundColor, s.borderColor, s.borderWidth, s.color, s.textDecorationLine, s.opacity].join('|') };
  });

test.describe('#294 数据版本徽章有 accessible name（不靠 title）', () => {
  for (const w of WIDTHS)
    test(`@${w}：去掉 title 后 .verbadge 的 accessible name 仍说明数据版本 / 来源，不含 emoji`, async ({ page }) => {
      await go(page, '/market', w);
      const b = page.locator('.verbadge');
      await expect(b).toBeVisible();
      await b.evaluate((el) => el.removeAttribute('title'));
      await expect(b).toHaveAccessibleName(/数据版本|来源|关于数据/);
      const name = await b.evaluate((el) => {
        const ids = el.getAttribute('aria-labelledby');
        if (ids)
          return ids
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent ?? '')
            .join(' ');
        return el.getAttribute('aria-label') ?? el.textContent ?? '';
      });
      expect(EMOJI.test(name), name).toBe(false);
    });
});

test.describe('#294 对照：抽屉收起时「关闭菜单」不在 Tab 序（f856c9e 已满足）', () => {
  for (const w of WIDTHS)
    for (const route of ROUTES)
      test(`#${route} @${w}：前 25 个 Tab 停点里没有「关闭菜单」，也没有 0×0 的不可见停点`, async ({ page }) => {
        await go(page, route, w);
        const stops = await tabStops(page, 25);
        expect(stops.filter((s) => s.name === '关闭菜单')).toEqual([]);
        expect(stops.filter((s) => s.w === 0 || s.h === 0)).toEqual([]);
      });
  for (const w of NARROW)
    test(`@${w}：打开抽屉后「关闭菜单」可聚焦、可见，点它能关上抽屉；热区 ≥44×44 [Steve 确认]`, async ({ page }) => {
      await go(page, '/market', w);
      const burger = page.getByRole('button', { name: '菜单', exact: true });
      await burger.click();
      await expect(burger).toHaveAttribute('aria-expanded', 'true');
      const close = page.getByRole('button', { name: '关闭菜单' });
      await close.focus();
      await expect(close).toBeFocused();
      await expect(close).toBeVisible();
      const box = (await close.boundingBox())!;
      expect(Math.min(box.width, box.height), '热区').toBeGreaterThanOrEqual(44);
      await close.click();
      await expect(burger).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator('#main-navigation'), '抽屉真的收起').toBeHidden();
      expect(
        (await tabStops(page, 3)).filter((x) => x.name === '关闭菜单'),
        '收起后不再可 Tab 到',
      ).toEqual([]);
    });
});

test.describe('#294 跳到主内容链接', () => {
  for (const w of WIDTHS)
    for (const route of ROUTES)
      test(`#${route} @${w}：第一个 Tab 停点是跳到主内容的链接；聚焦时可见、有可见焦点变化、对比 ≥4.5；回车后焦点进 main、路由不变`, async ({ page }) => {
        await go(page, route, w);
        const [first] = await tabStops(page, 1);
        expect(first!.name, '第一个 Tab 停点').toMatch(SKIP);
        expect(EMOJI.test(first!.name)).toBe(false);
        const el = page.locator(':focus');
        const focused = await look(el);
        expect(focused.onScreen, '聚焦时在视口内可见').toBe(true);
        const handle = await el.elementHandle();
        await page.evaluate((e) => (e as HTMLElement).blur(), handle);
        const idle = await page.evaluate((e) => {
          const s = getComputedStyle(e as Element);
          const r = (e as Element).getBoundingClientRect();
          return {
            onScreen: r.width > 1 && r.height > 1 && r.bottom > 0 && r.top < innerHeight && s.clipPath === 'none' && s.clip === 'auto',
            paint: [s.backgroundColor, s.borderColor, s.borderWidth, s.color, s.textDecorationLine, s.opacity].join('|'),
          };
        }, handle);
        expect(focused.ring || !idle.onScreen || idle.paint !== focused.paint, '焦点态可见：有焦点环，或聚焦才出现，或样式变化').toBe(true);
        await page.evaluate((e) => (e as HTMLElement).focus(), handle);
        expect(await contrast(page.locator(':focus'))).toBeGreaterThanOrEqual(4.5);
        if ((NARROW as readonly number[]).includes(w)) {
          const box = (await page.locator(':focus').boundingBox())!;
          expect(Math.min(box.width, box.height), '[Steve 确认] 热区').toBeGreaterThanOrEqual(44);
        }
        const before = page.url().split('#')[1]?.split('?')[0];
        await page.keyboard.press('Enter');
        // 焦点落在 main 里；或落在紧挨 main 的主内容锚点上，再按一次 Tab 就进 main
        let inMain = await page.evaluate(() => !!document.activeElement?.closest('main'));
        if (!inMain) {
          await page.keyboard.press('Tab');
          inMain = await page.evaluate(() => !!document.activeElement?.closest('main'));
        }
        expect(inMain, '跳过导航后进入主内容').toBe(true);
        expect(page.url().split('#')[1]?.split('?')[0]).toBe(before);
      });
  for (const w of [390, 1280])
    test(`深色主题 @${w}：跳到主内容链接聚焦时对比 ≥4.5`, async ({ page }) => {
      await go(page, '/market', w, 'dark');
      await tabStops(page, 1);
      await expect(page.locator(':focus')).toHaveText(SKIP);
      expect(await contrast(page.locator(':focus'))).toBeGreaterThanOrEqual(4.5);
    });
});

test.describe('#294 对照：窄屏顶栏控件热区', () => {
  for (const w of NARROW)
    test(`@${w}：数据版本徽章、菜单按钮热区 ≥44×44 [Steve 2026-10-22 确认]`, async ({ page }) => {
      await go(page, '/market', w);
      for (const loc of [page.locator('.verbadge'), page.getByRole('button', { name: '菜单', exact: true })]) {
        const b = (await loc.boundingBox())!;
        expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(44);
      }
    });
});
