import { expect, test } from '@playwright/test';

for (const width of [360, 375, 390, 1280]) {
  test(`#286 完整手动链接、统一播报与编辑清理 ${width}`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./#/game-clock');
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }));
    await page.getByRole('button', { name: '复制换算链接', exact: true }).click();
    const feedback = page.locator('.calc-dock-note');
    await expect(feedback).toContainText('自动复制失败');
    await expect(feedback).toHaveAttribute('aria-live', 'polite');
    await expect(feedback).toHaveAttribute('aria-atomic', 'true');
    const manual = page.getByLabel('手动复制换算链接', { exact: true });
    const url = new URL(await manual.inputValue());
    expect(url.pathname).toBe(new URL('./game-clock/', testInfo.project.use.baseURL).pathname);
    expect(url.searchParams.get('ratio')).toBe('1.7');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`share-link-${width}.png`), fullPage: true });
    await page.getByRole('textbox', { name: '速度倍率', exact: true }).fill('2');
    await expect(manual).toHaveCount(0);
    await expect(feedback).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('#286 未完成的旧复制不会覆盖编辑、重置或新复制', async ({ page }) => {
  await page.goto('./#/game-clock');
  await page.evaluate(() => {
    const requests: { resolve: () => void; reject: () => void }[] = [];
    Object.defineProperty(window, '__shareRequests', { configurable: true, value: requests });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: () => new Promise<void>((resolve, reject) => requests.push({ resolve, reject: () => reject(new Error('denied')) })),
      },
    });
  });
  const settle = (index: number, outcome: 'resolve' | 'reject') =>
    page.evaluate(
      ({ index, outcome }) => {
        const requests = Reflect.get(window, '__shareRequests') as { resolve: () => void; reject: () => void }[];
        requests[index]![outcome]();
      },
      { index, outcome },
    );
  const copy = page.getByRole('button', { name: '复制换算链接', exact: true });
  const ratio = page.getByRole('textbox', { name: '速度倍率', exact: true });
  const manual = page.getByLabel('手动复制换算链接', { exact: true });
  const feedback = page.locator('.calc-dock-note');
  await copy.click();
  await ratio.fill('2');
  await settle(0, 'reject');
  await expect(feedback).toHaveCount(0);
  await expect(manual).toHaveCount(0);
  await copy.click();
  await copy.click();
  await settle(2, 'resolve');
  await expect(feedback).toContainText('换算链接已复制');
  await settle(1, 'reject');
  await expect(feedback).toContainText('换算链接已复制');
  await expect(manual).toHaveCount(0);
  await copy.click();
  await page.getByRole('button', { name: '重置换算', exact: true }).click();
  await settle(3, 'resolve');
  await expect(feedback).toHaveCount(0);
  await expect(ratio).toHaveValue('1.7');
});

for (const width of [360, 375, 390, 1280]) {
  test(`#286 开局、术语与盈亏平衡手动链接及数量变化 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }));
    for (const [route, button, label] of [
      ['/glossary/maa', '复制术语链接', '手动复制术语链接'],
      ['/builds?bo=scouts-18&civ=Huns', '复制链接', '手动复制开局链接'],
      ['/duel?a=359.Byzantines.4.f.&b=569.Franks.4.f.&m=n&na=10&nb=10&be=1', '复制链接', '手动复制盈亏平衡链接'],
    ]) {
      await page.goto('./#' + route);
      await page.getByRole('button', { name: button, exact: true }).filter({ visible: true }).first().click();
      const manual = page.getByLabel(label!, { exact: true });
      await expect(manual).toBeVisible();
      const value = await manual.inputValue();
      if (route!.startsWith('/duel')) expect(value).toBe(page.url());
      else expect(new URL(value).pathname).toContain(route!.split('?')[0]!.replace('/builds', '/builds/'));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    const manual = page.getByLabel('手动复制盈亏平衡链接', { exact: true });
    await page.locator('#duel-na').fill('11');
    await expect(manual).toHaveCount(0);
  });
}
