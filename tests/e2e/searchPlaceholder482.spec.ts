import { expect, test, type Locator, type Page } from '@playwright/test';

const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', (error) => messages.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') messages.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

async function holdSearchChunk(page: Page) {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/(?:assets\/CommandPalette-[^/]+\.js|src\/features\/search\/components\/CommandPalette\.tsx)(?:\?.*)?$/, async (route) => {
    await held;
    await route.continue();
  });
  return async () => {
    release();
    await page.unrouteAll({ behavior: 'wait' });
  };
}

async function readablePlaceholder(input: Locator) {
  const metrics = await input.evaluate((element: HTMLInputElement) => {
    const style = getComputedStyle(element);
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    // The shorthand can serialize to an empty string when individual font features are set.
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const available = element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    return {
      placeholder: element.placeholder,
      available,
      textWidth: context.measureText(element.placeholder).width + Math.max(0, element.placeholder.length - 1) * (parseFloat(style.letterSpacing) || 0),
      textOverflow: style.textOverflow,
      overflow: style.overflowX,
    };
  });
  expect(metrics.placeholder).not.toBe('');
  expect(metrics.available).toBeGreaterThan(0);
  expect(metrics.textWidth <= metrics.available || (metrics.textOverflow === 'ellipsis' && metrics.overflow === 'hidden'), JSON.stringify(metrics)).toBe(true);
  return metrics.placeholder;
}

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'] as const)
    test(`#482 加载与正式搜索占位可读且中文交接保持 ${width} ${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      const release = await holdSearchChunk(page);
      try {
        await page.goto('./#/');
        await expect(page.locator('#home')).toBeVisible();
        const trigger = page.getByRole('button', { name: '全局搜索', exact: true });
        await trigger.click();
        const dialog = page.getByRole('dialog', { name: '全局搜索', exact: true });
        await expect(dialog).toContainText('加载中');
        const loading = dialog.getByRole('textbox', { name: '全局搜索', exact: true });
        await expect(loading).toBeFocused();
        const placeholder = await readablePlaceholder(loading);
        await expect(dialog.locator('kbd')).toHaveText('Esc');
        await expect(dialog.locator('kbd')).toBeInViewport();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const loadingImage = info.outputPath(`search-loading-${width}-${theme}.png`);
        await page.screenshot({ path: loadingImage, fullPage: false });
        await info.attach('搜索加载占位', { path: loadingImage, contentType: 'image/png' });
        await loading.dispatchEvent('compositionstart', { data: '' });
        await loading.fill('文明');
        await loading.dispatchEvent('compositionend', { data: '文明' });
        await release();
        const ready = dialog.getByRole('combobox', { name: '全局搜索', exact: true });
        await expect(ready).toHaveValue('文明');
        await expect(ready).toBeFocused();
        await ready.fill('');
        expect(await readablePlaceholder(ready)).toBe(placeholder);
        await expect(dialog.locator('kbd')).toBeInViewport();
        const readyImage = info.outputPath(`search-ready-${width}-${theme}.png`);
        await page.screenshot({ path: readyImage, fullPage: false });
        await info.attach('搜索正式占位', { path: readyImage, contentType: 'image/png' });
        await ready.fill('鞑靼');
        await expect(dialog.getByRole('option').filter({ hasText: '鞑靼' }).first()).toBeVisible();
        await ready.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(trigger).toBeFocused();
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      } finally {
        await release();
      }
    });
