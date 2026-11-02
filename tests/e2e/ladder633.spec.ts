import { expect, test } from '@playwright/test';

type CopyFixture = { reject: boolean; copied: string[]; rejectPending?: (reason: Error) => void };
type CopyWindow = Window & { copy633: CopyFixture };

for (const width of [360, 375, 390, 1280]) {
  test(`#633 @${width} 剪贴板不可用时可选中完整链接，状态变化清理，恢复复制`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.addInitScript((missing) => {
      const fixture: CopyFixture = { reject: true, copied: [] };
      (window as CopyWindow).copy633 = fixture;
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: missing
          ? undefined
          : {
              writeText: (value: string) => {
                fixture.copied.push(value);
                return Promise.reject(new Error('clipboard denied'));
              },
            },
      });
    }, width === 360);
    await page.goto('./#/ladder');
    const share = page.getByTestId('ladder-share');
    const copy = share.getByRole('button', { name: '复制当前链接', exact: true });
    await copy.click();
    await expect(share.getByRole('status')).toHaveText('自动复制失败，请手动复制下方完整链接。');
    const input = share.getByRole('textbox', { name: '分享链接', exact: true });
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute('readonly', '');
    const href = await input.inputValue();
    expect(new URL(href).hash).toBe('#/ladder');
    await input.focus();
    expect(await input.evaluate((node: HTMLInputElement) => [node.selectionStart, node.selectionEnd])).toEqual([0, href.length]);
    const box = await input.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    const shot = testInfo.outputPath(`ladder633-${width}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    const fresh = await page.context().newPage();
    await fresh.goto(href);
    await expect(fresh.getByTestId('ladder-source')).toHaveAttribute('data-slice-mode', '4v4');
    await expect(fresh.getByTestId('ladder-view-table')).toHaveAttribute('aria-checked', 'true');
    await fresh.close();
    const hide = page.getByTestId('ladder-hide-low');
    await hide.setChecked(!(await hide.isChecked()));
    await expect(input).toHaveCount(0);
    await expect(share.getByRole('status')).toBeEmpty();
    await copy.click();
    await expect(input).toBeVisible();
    await page.getByTestId('ladder-sort-name').click();
    await expect(input).toHaveCount(0);
    await page.evaluate(() =>
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: (value: string) => {
            (window as CopyWindow).copy633.copied.push(value);
            return Promise.resolve();
          },
        },
      }),
    );
    await copy.click();
    await expect(share.getByRole('status')).toHaveText('链接已复制。');
    await expect(input).toHaveCount(0);
    expect(await page.evaluate(() => (window as CopyWindow).copy633.copied.at(-1))).toBe(href);
    await page.getByTestId('ladder-view-tiers').click();
    await page.getByTestId('ladder-view-table').click();
    await expect(share.getByRole('status')).toBeEmpty();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('#633 排序改变后不恢复延迟拒绝的旧复制提示', async ({ page }) => {
  await page.addInitScript(() => {
    const fixture: CopyFixture = { reject: true, copied: [] };
    (window as CopyWindow).copy633 = fixture;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: () =>
          new Promise((_resolve, reject) => {
            fixture.rejectPending = reject;
          }),
      },
    });
  });
  await page.goto('./#/ladder');
  const share = page.getByTestId('ladder-share');
  await share.getByRole('button', { name: '复制当前链接', exact: true }).click();
  await expect.poll(() => page.evaluate(() => typeof (window as CopyWindow).copy633.rejectPending)).toBe('function');
  await page.getByTestId('ladder-sort-name').click();
  await page.evaluate(() => (window as CopyWindow).copy633.rejectPending!(new Error('delayed denial')));
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await expect(share.getByRole('status')).toBeEmpty();
  await expect(share.getByRole('textbox', { name: '分享链接' })).toHaveCount(0);
});
