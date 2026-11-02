import { expect, test } from '@playwright/test';

for (const width of [360, 375, 390, 1280]) {
  test(`#632 @${width} 空大厅不填示例，摘要保留跳过，可补选单挑`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto('./#/');
    await page.getByTestId('start-lobby').click();
    const flow = page.getByTestId('start-game');
    await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'civ');
    await expect(flow).not.toContainText('已预填');
    await expect(flow).not.toContainText('阿拉伯半岛');
    await expect(flow).not.toContainText('4v4');
    await expect(flow).toContainText('暂无建议');
    const modify = page.getByRole('button', { name: '修改模式和地图', exact: true });
    await expect(modify).toBeVisible();
    await modify.focus();
    await expect(modify).toBeFocused();
    await page.screenshot({ path: testInfo.outputPath(`lobby632-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: /法兰克/ }).click();
    await page.getByRole('button', { name: '完成本局', exact: true }).click();
    const summary = page.getByTestId('start-summary');
    await expect(summary.getByText('已跳过', { exact: true })).toHaveCount(2);
    await expect(summary).not.toContainText('阿拉伯半岛');
    await expect(summary).not.toContainText('4v4');
    await expect(summary).not.toContainText('中路适合');
    await page.screenshot({ path: testInfo.outputPath(`summary632-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: '修改模式', exact: true }).click();
    await page.getByRole('button', { name: /1v1 随机地图/ }).click();
    await page.getByRole('button', { name: /阿拉伯半岛/ }).click();
    await page.getByRole('button', { name: /法兰克/ }).click();
    await page.getByRole('button', { name: '完成本局', exact: true }).click();
    await expect(summary).toContainText('1v1');
    await expect(summary).not.toContainText('中路适合');
    await expect(summary.locator('.start-sumkey').filter({ hasText: /^路位$/ })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await page.getByRole('button', { name: '再开一局', exact: true }).click();
    await expect(page.getByTestId('start-step')).toHaveAttribute('data-step', 'mode');
  });
}
