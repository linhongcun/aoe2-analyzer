import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const theme of ['light', 'dark']) {
  for (const width of [360, 375, 390, 1280]) {
    test(`文明背景 ${theme} ${width}：方图与横幅保持比例、文字可读`, async ({ page }, testInfo) => {
      const errors: string[] = [];
      const artRequests = new Set<string>();
      page.on('request', (request) => {
        const { pathname } = new URL(request.url());
        if (request.resourceType() === 'image' && pathname.includes('/assets/') && pathname.endsWith('.webp')) artRequests.add(pathname);
      });
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.setViewportSize({ width, height: 900 });
      for (const [civ, title] of [
        ['Chinese', '中国'],
        ['Danes', '丹麦人'],
      ]) {
        await page.goto(`./#/civ/${civ}`);
        const background = page.locator(`[data-civ-background="${civ}"]`);
        await expect(background).toBeVisible();
        await expect(page.locator('#detail h1')).toContainText(title!);
        const header = page.locator('#detail .dhead');
        const mask = await header.evaluate((element) => {
          const style = getComputedStyle(element, '::after');
          return { image: style.maskImage, size: style.maskSize, pointerEvents: style.pointerEvents };
        });
        expect(mask.image).toContain('.webp');
        expect(mask.size).toBe('contain');
        expect(mask.pointerEvents).toBe('none');
        const url = mask.image.match(/^url\("?(.+?)"?\)$/)![1]!;
        expect(new URL(url).origin).toBe(new URL(page.url()).origin);
        const size = await page.evaluate(async (url) => {
          const image = new Image();
          image.src = url;
          await image.decode();
          return [image.naturalWidth, image.naturalHeight];
        }, url);
        expect(size[0]).toBe(civ === 'Chinese' ? 366 : 1000);
        expect(size[1]).toBe(civ === 'Chinese' ? 366 : 530);
        expect(artRequests.size).toBe(civ === 'Chinese' ? 1 : 2);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect((await new AxeBuilder({ page }).include('#detail .dhead').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
        await page.screenshot({ path: testInfo.outputPath(`${civ}-${theme}-${width}.png`) });
        expect((await background.getByRole('link', { name: '背景插画 · AoE2 Companion' }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
        await expect(background.getByRole('link', { name: '背景插画 · AoE2 Companion' })).toHaveAttribute(
          'href',
          new RegExp('/assets/history/civs2?/history_' + civ.toLowerCase() + '[.]png$'),
        );
      }
      expect(errors).toEqual([]);
    });
  }
}

test('文明与Tab切换更新背景，离开详情后不残留', async ({ page }) => {
  await page.goto('./#/civ/Chinese?tab=data');
  const oldMask = await page.locator('#detail .dhead').evaluate((element) => getComputedStyle(element, '::after').maskImage);
  await page.evaluate(() => {
    window.location.hash = '/civ/Danes?tab=data';
  });
  await expect(page.locator('[data-civ-background="Danes"]')).toBeVisible();
  await expect(page.getByRole('tab', { name: '数据', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => page.locator('#detail .dhead').evaluate((element) => getComputedStyle(element, '::after').maskImage)).not.toBe(oldMask);
  await page.getByRole('tab', { name: '概览', exact: true }).click();
  await expect(page.locator('[data-civ-background="Danes"]')).toBeVisible();
  await page.evaluate(() => {
    window.location.hash = '/unit/4';
  });
  await expect(page.locator('#unit h1')).toContainText('步弓手');
  await expect(page.locator('[data-civ-background]')).toHaveCount(0);
  expect(await page.locator('#unit .dhead').evaluate((element) => getComputedStyle(element, '::after').maskImage)).toBe('none');
});

test('背景延迟加载不移动标题和正文', async ({ page }) => {
  let release!: () => void;
  let captured!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const intercepted = new Promise<void>((resolve) => {
    captured = resolve;
  });
  await page.route(/\/chinese(?:-[\w-]+)?\.webp(?:\?|$)/, async (route) => {
    if (route.request().resourceType() !== 'image') return route.continue();
    captured();
    await gate;
    await route.continue();
  });
  await page.goto('./#/civ/Chinese', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-civ-background="Chinese"]')).toBeVisible();
  await intercepted;
  await expect(page.getByTestId('civ-opening')).toBeVisible();
  const before = await page.locator('#detail .dhead').boundingBox();
  const openingBefore = await page.getByTestId('civ-opening').boundingBox();
  const loaded = page.waitForResponse(/\/chinese(?:-[\w-]+)?\.webp(?:\?|$)/);
  release();
  await (await loaded).finished();
  expect(await page.locator('#detail .dhead').boundingBox()).toEqual(before);
  expect(await page.getByTestId('civ-opening').boundingBox()).toEqual(openingBefore);
});

test('图片失败仍可阅读和切换Tab', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route(/\/chinese(?:-[\w-]+)?\.webp(?:\?|$)/, (route) => (route.request().resourceType() === 'image' ? route.abort() : route.continue()));
  await page.goto('./#/civ/Chinese');
  await expect(page.locator('#detail h1')).toContainText('中国');
  await expect(page.locator('.detail-copy-button')).toBeEnabled();
  await page.getByRole('tab', { name: '数据', exact: true }).click();
  await expect(page.getByRole('tab', { name: '数据', exact: true })).toHaveAttribute('aria-selected', 'true');
  expect(await page.locator('#detail .dhead').evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  expect(errors).toEqual([]);
});
