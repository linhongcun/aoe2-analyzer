import { expect, test, type Page } from '@playwright/test';

async function checkLine(page: Page, id: number, stacked: boolean) {
  const line = page.locator('.ud-line');
  const nodes = line.locator('.ud-node');
  await expect(nodes).toHaveCount(2);
  await expect(line).toHaveClass(stacked ? /is-stacked/ : /^ud-line$/);
  await expect(nodes.locator('.ud-node-name')).toHaveText(['神庙护卫', '精锐神庙护卫']);
  await expect(line.locator('[aria-current]')).toHaveCount(1);
  await expect(line.locator('[aria-current] .ud-node-name')).toHaveText(id === 2586 ? '神庙护卫' : '精锐神庙护卫');
  await expect(line.locator('[aria-current]')).not.toHaveAttribute('href');
  await expect(line.getByRole('link')).toHaveAttribute('href', `#/unit/${id === 2586 ? 2587 : 2586}`);
  const a = (await nodes.nth(0).boundingBox())!;
  const b = (await nodes.nth(1).boundingBox())!;
  const connector = line.locator('.ud-line-connector');
  const arrow = (await connector.boundingBox())!;
  await expect(connector).toHaveAttribute('aria-hidden', 'true');
  expect(await connector.evaluate((el) => (el as SVGElement).tabIndex)).toBe(-1);
  if (stacked) {
    expect(Math.abs(a.x - b.x)).toBeLessThan(1);
    expect(Math.abs(a.x + a.width - b.x - b.width)).toBeLessThan(1);
    expect(arrow.y).toBeGreaterThanOrEqual(a.y + a.height);
    expect(arrow.y + arrow.height).toBeLessThanOrEqual(b.y);
    expect(Math.abs(arrow.x + arrow.width / 2 - a.x - a.width / 2)).toBeLessThan(1);
    await expect(connector).toHaveCSS('transform', 'matrix(0, 1, -1, 0, 0, 0)');
  } else {
    expect(Math.abs(a.y - b.y)).toBeLessThan(1);
    expect(arrow.x).toBeGreaterThanOrEqual(a.x + a.width);
    expect(arrow.x + arrow.width).toBeLessThanOrEqual(b.x);
    await expect(connector).toHaveCSS('transform', 'none');
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const width of [360, 390, 768]) {
  test(`${width}: 升级线对齐、连接与普通精锐往返`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('./#/unit/2586');
    for (const [index, id] of [2586, 2587, 2586].entries()) {
      await expect(page).toHaveURL(new RegExp(`#/unit/${id}$`));
      await expect(page.locator('#unit h1')).toContainText(id === 2586 ? '神庙护卫' : '精锐神庙护卫');
      await checkLine(page, id, width < 768);
      if (index < 2) await page.locator('.ud-line a').click();
    }
    expect(errors).toEqual([]);
  });
}

test('同一视口随容器缩小与恢复切换，单节点没有连接符', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto('./#/unit/2587');
  await checkLine(page, 2587, false);
  await page.locator('.ud-line-container').evaluate((el) => ((el as HTMLElement).style.width = '280px'));
  await checkLine(page, 2587, true);
  await page.locator('.ud-line-container').evaluate((el) => ((el as HTMLElement).style.width = ''));
  await checkLine(page, 2587, false);
  await page.goto('./#/unit/83');
  await expect(page.locator('.ud-line .ud-node')).toHaveCount(1);
  await expect(page.locator('.ud-line-connector')).toHaveCount(0);
});
