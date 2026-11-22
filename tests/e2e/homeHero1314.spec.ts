import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page, type Response } from '@playwright/test';

const HERO_PATH_RE = /\/img\/atmosphere\/home-hero\.webp(?:\?|$)/;
const COPYRIGHT_NOTE = '首页氛围插画为本项目自制（AI 辅助生成）的装饰视觉，不属于 Microsoft 原版游戏素材。';
const MAX_HERO_BYTES = 150 * 1024;

function watchPage(page: Page) {
  const errors: string[] = [];
  const heroResponses: Response[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('response', (response) => {
    if (HERO_PATH_RE.test(response.url())) heroResponses.push(response);
  });
  return { errors, heroResponses };
}

async function openThemedHome(page: Page, theme: 'light' | 'dark', width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
  const tracker = watchPage(page);
  await page.goto('./#/');
  await expect(page.locator('#home')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  return tracker;
}

async function expectHeroImageHealthy(page: Page, heroResponses: Response[]) {
  const art = page.locator('.home-mast-art');
  await expect(art).toBeVisible();
  await expect(art).toHaveAttribute('alt', '');
  await expect(art).toHaveAttribute('fetchpriority', 'high');
  await expect(art).toHaveAttribute('decoding', 'async');

  await expect
    .poll(async () =>
      art.evaluate((el) => {
        const img = el as HTMLImageElement;
        return { complete: img.complete, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight };
      }),
    )
    .toEqual({ complete: true, naturalWidth: 1376, naturalHeight: 768 });

  const bg = page.locator('.home-mast-bg');
  await expect(bg).toHaveAttribute('aria-hidden', 'true');
  const bgStyle = await bg.evaluate((el) => {
    const style = getComputedStyle(el);
    return { pointerEvents: style.pointerEvents, overflow: style.overflow };
  });
  expect(bgStyle).toEqual({ pointerEvents: 'none', overflow: 'hidden' });

  const mastStyle = await page.locator('.home-mast').evaluate((el) => {
    const style = getComputedStyle(el);
    return { isolation: style.isolation, overflow: style.overflow };
  });
  expect(mastStyle).toEqual({ isolation: 'isolate', overflow: 'visible' });

  const pageOrigin = new URL(page.url()).origin;
  expect(heroResponses.length, '应捕获至少一次 home-hero.webp 网络响应').toBeGreaterThanOrEqual(1);
  expect(heroResponses.some((res) => res.status() === 200)).toBe(true);
  for (const res of heroResponses) {
    expect(new URL(res.url()).origin).toBe(pageOrigin);
  }
}

async function expectMastUnclipped(page: Page, label: string) {
  const metrics = await page.evaluate(() => {
    const mast = document.querySelector('.home-mast') as HTMLElement;
    const search = document.querySelector('.home-search') as HTMLElement;
    const mastRect = mast.getBoundingClientRect();
    const searchRect = search.getBoundingClientRect();
    return {
      mastHeight: mastRect.height,
      mastBottom: mastRect.bottom,
      mastScrollHeight: mast.scrollHeight,
      mastClientHeight: mast.clientHeight,
      searchBottom: searchRect.bottom,
      overflowY: getComputedStyle(mast).overflowY,
      docScrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    };
  });
  expect(metrics.overflowY, label).toBe('visible');
  expect(metrics.mastScrollHeight, label).toBeLessThanOrEqual(metrics.mastClientHeight + 1);
  expect(metrics.searchBottom, label).toBeLessThanOrEqual(metrics.mastBottom + 0.5);
  expect(metrics.docScrollWidth, label).toBeLessThanOrEqual(metrics.innerWidth);
  return metrics;
}

for (const theme of ['light', 'dark'] as const) {
  test(`#1314 桌面 1280×900 ${theme}：Hero 氛围图加载完整、高度合规且 4 张资料卡完整留在首屏`, async ({ page }) => {
    const { errors, heroResponses } = await openThemedHome(page, theme, 1280, 900);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expectHeroImageHealthy(page, heroResponses);

    const mast = await expectMastUnclipped(page, `1280-${theme}`);
    expect(mast.mastHeight).toBeGreaterThanOrEqual(180);
    expect(mast.mastHeight).toBeLessThanOrEqual(240);

    const cardBottoms = await page.locator('.home-ref-card').evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().bottom));
    expect(cardBottoms).toHaveLength(4);
    for (const bottom of cardBottoms) {
      expect(bottom).toBeLessThanOrEqual(900);
    }

    await page.getByTestId('home-search').click();
    await expect(page.getByRole('dialog', { name: '全局搜索', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: '全局搜索', exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

for (const width of [360, 390] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`#1314 窄屏 ${width}×844 ${theme}：右焦构图、零横向溢出且 .num/.nw 不折行`, async ({ page }) => {
      const { errors, heroResponses } = await openThemedHome(page, theme, width, 844);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expectHeroImageHealthy(page, heroResponses);

      const objectPosition = await page.locator('.home-mast-art').evaluate((el) => getComputedStyle(el).objectPosition);
      expect(objectPosition).toBe('84% 34%');

      await expectMastUnclipped(page, `${width}-${theme}`);

      const searchBox = await page.getByTestId('home-search').boundingBox();
      expect(searchBox!.height).toBeGreaterThanOrEqual(44);

      const wrapped = await page.locator('#home .num, #home .nw').evaluateAll((nodes) =>
        nodes.flatMap((node) => {
          const range = document.createRange();
          range.selectNodeContents(node);
          const tops = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)));
          return tops.size <= 1 ? [] : [{ text: node.textContent?.trim(), lines: tops.size }];
        }),
      );
      expect(wrapped).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}

test('#1314 五档视口及 1.5x 文本放大折行聚焦态：.home-mast 自然伸展不裁切 .home-search 与焦点环', async ({ page }) => {
  const { errors } = await openThemedHome(page, 'light', 1280, 900);

  for (const [width, height] of [
    [901, 900],
    [1024, 900],
    [1280, 900],
    [390, 844],
    [360, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.getByTestId('home-search').focus();
    await expectMastUnclipped(page, `default-${width}`);
  }

  // Round 2 P2：直接按 1.5x 放大 .home-mast 内使用 px 字号的文本与搜索栏，确保真实超出旧 240px 上限后仍不裁切。
  for (const width of [1280, 901] as const) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => {
      const selectors = ['.home-mast .home-kicker', '.home-mast h1', '.home-mast .home-lede', '.home-mast .home-search'];
      for (const selector of selectors) {
        const el = document.querySelector(selector) as HTMLElement | null;
        if (!el) continue;
        if (!el.dataset.origFontSize) el.dataset.origFontSize = getComputedStyle(el).fontSize;
        el.style.fontSize = `${Number.parseFloat(el.dataset.origFontSize) * 1.5}px`;
      }
    });
    const search = page.getByTestId('home-search');
    await search.focus();
    await expect(search).toBeFocused();
    const scaled = await expectMastUnclipped(page, `scaled-1.5x-${width}`);
    expect(scaled.mastHeight, `${width} 放大 1.5x 后应自然超过旧 240px 硬上限`).toBeGreaterThan(240);
  }
  expect(errors).toEqual([]);
});

test('#1314 版权边界声明：全局页脚与文明详情折叠区双消费点一致展示', async ({ page }) => {
  const { errors } = await openThemedHome(page, 'light', 1280, 900);
  const footer = page.locator('footer.editorial-footer');
  await footer.getByText('资料来源与使用声明', { exact: true }).click();
  await expect(footer.locator('.footer-sources')).toContainText(COPYRIGHT_NOTE);

  await page.goto('./#/civ/Wei');
  await expect(page.locator('#detail h1')).toContainText('魏');
  await page.getByRole('button', { name: '关于与反馈 展开' }).click();
  const sources = page.locator('.civ-about-sources');
  await expect(sources).toBeVisible();
  await expect(sources).toContainText(COPYRIGHT_NOTE);
  await expect(page.getByRole('link', { name: '背景插画 · AoE2 Companion' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('#1314 图片加载失败降级：无运行时错误、高度不塌陷且搜索交互可用', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route(HERO_PATH_RE, (route) => route.abort());
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/');
  await expect(page.locator('#site-title')).toBeVisible();
  const box = await page.locator('.home-mast').boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(180);
  await page.getByTestId('home-search').click();
  await expect(page.getByRole('dialog', { name: '全局搜索', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('#1314 资产体积守卫：源码与构建产物 home-hero.webp 均不超过 150 KiB', () => {
  for (const rel of ['public/img/atmosphere/home-hero.webp', 'dist/img/atmosphere/home-hero.webp']) {
    const stat = statSync(resolve(rel));
    expect(stat.size, `${rel} 体积 ${stat.size} B 超过上限 ${MAX_HERO_BYTES} B`).toBeGreaterThan(0);
    expect(stat.size, `${rel} 体积 ${stat.size} B 超过上限 ${MAX_HERO_BYTES} B`).toBeLessThanOrEqual(MAX_HERO_BYTES);
  }
});
