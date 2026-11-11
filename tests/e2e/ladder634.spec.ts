import { expect, test, type Page } from '@playwright/test';

async function tabToElo(page: Page) {
  for (let i = 0; i < 60; i++) {
    if (await page.evaluate(() => document.activeElement?.matches('[data-testid="ladder-elo-option"]'))) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('Tab 无法进入 Elo 单选组');
}

async function pressElo(page: Page, key: string) {
  const options = await page.getByTestId('ladder-elo-option').evaluateAll((nodes) =>
    nodes.map((node) => ({
      mode: node.getAttribute('data-target-mode')!,
      elo: node.getAttribute('data-elo')!,
      focused: node === document.activeElement,
    })),
  );
  const from = options.findIndex((option) => option.focused);
  expect(from).toBeGreaterThanOrEqual(0);
  const index =
    key === 'Home' ? 0 : key === 'End' ? options.length - 1 : (from + (['ArrowRight', 'ArrowDown'].includes(key) ? 1 : -1) + options.length) % options.length;
  const target = options[index]!;
  await page.keyboard.press(key);
  const button = page.locator(`[data-testid="ladder-elo-option"][data-target-mode="${target.mode}"][data-elo="${target.elo}"]`);
  await expect(button).toHaveAttribute('aria-checked', 'true');
  await expect(button).toBeFocused();
  await expect(page.getByTestId('ladder-elo').locator('[role="radio"][tabindex="0"]')).toHaveCount(1);
  await expect(page.getByTestId('ladder-source')).toHaveAttribute('data-slice-mode', target.mode);
  await expect(page.getByTestId('ladder-source')).toHaveAttribute('data-slice-elo', target.elo);
}

for (const width of [360, 375, 390, 1280]) {
  test(`#634 @${width} Tab进入，方向键与首末键选档且保留焦点`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto('./#/ladder');
    await expect(page.getByTestId('ladder-elo')).toBeVisible();
    await tabToElo(page);
    for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'End', 'Home']) await pressElo(page, key);
    const screenshot = testInfo.outputPath(`ladder634-${width}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('ladder-hide-low')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByTestId('ladder-elo').locator('[aria-checked="true"]')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="ladder-elo"]'))).toBe(false);
    // #625 解耦后每模式目前只有一个真实档；仍验证鼠标点选和焦点，不借用其它模式的档。
    await page.getByTestId('ladder-elo-option').click();
    await expect(page.getByTestId('ladder-elo').locator('[aria-checked="true"]')).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('#634 无快照空态也可用键盘选回真实切片', async ({ page }) => {
  await page.goto('./#/ladder?mode=4v4&elo=lt850');
  await expect(page.getByTestId('ladder-empty')).toBeVisible();
  const missing = page.getByTestId('ladder-elo').locator('[aria-checked="true"]');
  await expect(missing).toHaveCount(1);
  await expect(missing).toHaveAttribute('aria-disabled', 'true');
  await missing.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('ladder-empty')).toHaveCount(0);
  await expect(page.getByTestId('ladder-elo').locator('[aria-checked="true"]')).toHaveAttribute('data-elo', '1200-1400');
  await expect(page.getByTestId('ladder-source')).toHaveAttribute('data-slice-mode', '4v4');
});
