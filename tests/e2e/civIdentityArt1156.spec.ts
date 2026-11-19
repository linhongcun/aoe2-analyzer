import { expect, test, type Page } from '@playwright/test';

async function shownArt(page: Page) {
  return page.locator('#detail .identity-art').evaluate((element) => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return {
      display: style.display,
      size: style.backgroundSize,
      opacity: style.opacity,
      image: style.backgroundImage,
      pointerEvents: style.pointerEvents,
      mask: style.getPropertyValue('mask-image'),
      width: box.width,
      height: box.height,
      right: box.right,
      top: box.top,
    };
  });
}

async function openCiv(page: Page, civ: string, theme: string, width: number) {
  await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`./#/civ/${civ}`);
  await expect(page.getByTestId('civ-identity')).toBeVisible();
}

test.describe('#1156 窄屏标题卡恢复本文明插画', () => {
  for (const theme of ['light', 'dark']) {
    for (const width of [390, 480, 481]) {
      test(`${theme} ${width}：插画可见，文字和按钮仍可操作`, async ({ page, context }, testInfo) => {
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (message) => {
          if (message.type() === 'error') errors.push(message.text());
        });
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await openCiv(page, 'Britons', theme, width);
        await expect(page.locator('#detail h1')).toContainText('不列颠');
        await expect(page.locator('#detail h1')).toContainText('Britons');
        await expect(page.locator('#detail .civ-official')).toContainText('官方定位');
        await expect(page.locator('#detail .civ-crest')).toBeVisible();
        const card = page.getByTestId('civ-identity');
        const art = await shownArt(page);
        const cardBox = (await card.boundingBox())!;
        expect(art.display).not.toBe('none');
        expect(art.size).toBe('contain');
        expect(art.opacity).toBe('0.65');
        expect(art.pointerEvents).toBe('none');
        expect(art.image).toContain('britons');
        expect(art.image).not.toContain('franks');
        expect(art.mask).toContain('35%');
        expect(art.mask).toContain('65%');
        expect(art.width).toBeGreaterThan(40);
        expect(art.height).toBeGreaterThan(cardBox.height * 0.8);
        expect(Math.abs(art.right - cardBox.x - cardBox.width)).toBeLessThan(4);
        expect(art.width).toBeLessThanOrEqual(440 + 1);
        expect(Math.abs(art.width - Math.min(cardBox.width * 0.46, 440))).toBeLessThan(2);
        expect(await card.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await card.screenshot({ path: testInfo.outputPath(`britons-${theme}-${width}.png`) });

        const copy = page.getByRole('button', { name: '复制链接' });
        const list = page.getByRole('link', { name: '文明列表' });
        for (const control of [copy, list]) {
          const box = (await control.boundingBox())!;
          expect(box.width).toBeGreaterThanOrEqual(44);
          expect(box.height).toBeGreaterThanOrEqual(44);
          const hit = await page.evaluate(
            ({ x, y }) => {
              const target = document.elementFromPoint(x, y);
              const control = target?.closest('button, a');
              return control?.getAttribute('aria-label') || control?.textContent || target?.className || '';
            },
            { x: box.x + box.width / 2, y: box.y + box.height / 2 },
          );
          expect(hit).toMatch(/复制链接|文明列表/);
        }
        await copy.click();
        await expect(copy).toContainText('链接已复制');
        const copied = new URL(await page.evaluate(() => navigator.clipboard.readText()));
        expect(copied.pathname).toMatch(/\/civ\/Britons\/$/);
        await list.click();
        await expect(page).toHaveURL(/#\/civs$/);
        await expect(page.getByRole('heading', { name: '文明', exact: true })).toBeVisible();
        expect(errors).toEqual([]);
      });
    }
  }

  for (const theme of ['light', 'dark']) {
    test(`${theme} 390：法兰克显示自己的插画和署名`, async ({ page }, testInfo) => {
      await openCiv(page, 'Franks', theme, 390);
      await expect(page.locator('#detail h1')).toContainText('法兰克');
      await expect(page.locator('#detail h1')).toContainText('Franks');
      const art = await shownArt(page);
      expect(art.display).not.toBe('none');
      expect(art.size).toBe('contain');
      expect(art.image).toContain('franks');
      expect(art.image).not.toContain('britons');
      expect(await page.locator('#detail .civ-identity .civ-background-credit')).toHaveCount(0);
      await page.getByRole('button', { name: '关于与反馈 展开' }).click();
      await expect(page.getByRole('link', { name: '背景插画 · AoE2 Companion' })).toHaveAttribute('href', /\/history_franks\.png$/);
      await expect(page.getByTestId('civ-identity')).toBeVisible();
      await page.getByTestId('civ-identity').screenshot({ path: testInfo.outputPath(`franks-${theme}-390.png`) });
    });

    test(`${theme} 1280：宽屏标题卡仍用原来的裁切`, async ({ page, context }, testInfo) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await openCiv(page, 'Britons', theme, 1280);
      const art = await shownArt(page);
      expect(art.display).not.toBe('none');
      expect(art.size).toBe('cover');
      expect(art.opacity).toBe('0.3');
      expect(art.mask).toContain('70%');
      expect(art.mask).not.toContain('35%');
      expect(art.image).toContain('britons');
      expect(art.width).toBeGreaterThan(0);
      await expect(page.locator('#detail h1')).toContainText('不列颠');
      await page.getByTestId('civ-identity').screenshot({ path: testInfo.outputPath(`britons-${theme}-1280.png`) });
      const copy = page.getByRole('button', { name: '复制链接' });
      await copy.click();
      const copied = new URL(await page.evaluate(() => navigator.clipboard.readText()));
      expect(copied.pathname).toMatch(/\/civ\/Britons\/$/);
      await page.getByRole('link', { name: '文明列表' }).click();
      await expect(page).toHaveURL(/#\/civs$/);
      await page.goto('./#/civ/Britons');
      await page.getByRole('button', { name: '关于与反馈 展开' }).click();
      await expect(page.getByRole('link', { name: '背景插画 · AoE2 Companion' })).toHaveAttribute('href', /\/history_britons\.png$/);
    });
  }
});
