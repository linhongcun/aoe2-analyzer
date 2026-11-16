import { expect, test, type Page } from '@playwright/test';

async function metrics(page: Page, hits: number, game: string, real: string) {
  await expect(page.getByTestId('siege-hits')).toHaveText(String(hits));
  await expect(page.getByTestId('siege-game-seconds')).toHaveText(game);
  await expect(page.getByTestId('siege-real-seconds')).toHaveText(real);
  await expect(page.getByTestId('siege-unverified')).toHaveCount(0);
}

for (const [width, theme] of [
  [1280, 'light'],
  [360, 'dark'],
] as const) {
  test(`#1064 Turks defaults, unknown recovery and URL @${width} ${theme}`, async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
    await page.goto('./#/siege?unit=36&n=2&bldg=82&civ=Turks');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.getByLabel('攻城单位', { exact: true })).toHaveValue('36');
    await expect(page.getByLabel('数量', { exact: true })).toHaveValue('2');
    await expect(page.getByLabel('目标建筑', { exact: true })).toHaveValue('82');
    await expect(page.getByLabel('攻方文明', { exact: true })).toHaveValue('Turks');
    await expect(page.getByRole('checkbox', { name: '石工术', exact: true })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: '建筑学', exact: true })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: '驻满村民', exact: true })).not.toBeChecked();
    await metrics(page, 11, '65', '38.2');
    const comparison = page.getByTestId('siege-compare');
    await expect(comparison.getByRole('row', { name: /城堡/ })).toContainText('65');
    await expect(comparison.getByText('暂不计算 · 数据待补', { exact: true })).toHaveCount(4);
    await page.getByLabel('目标建筑', { exact: true }).selectOption('235');
    await metrics(page, 5, '26', '15.3');
    await expect(page).toHaveURL(/bldg=235&civ=Turks/);
    await page.reload();
    await metrics(page, 5, '26', '15.3');
    await page.getByRole('button', { name: '复制分享链接', exact: true }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());
    await page.getByLabel('数量', { exact: true }).fill('40');
    await metrics(page, 1, '0', '0.0');
    // Number + unit metrics must fit the actual selected viewport.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const id of ['siege-hits', 'siege-game-seconds', 'siege-real-seconds']) {
      expect(
        await page.getByTestId(id).evaluate((el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
        }),
      ).toBe(1);
    }
    await page.getByLabel('数量', { exact: true }).fill('2');
    await page.getByRole('checkbox', { name: '石工术', exact: true }).check();
    await expect(page).toHaveURL(/armor=50/);
    await expect(page.getByTestId('siege-unverified')).toContainText('数据未核实，暂不计算');
    await expect(page.getByTestId('siege-hits')).toHaveCount(0);
    await expect(page.getByTestId('siege-compare')).toHaveCount(0);
    const feedback = page.getByTestId('siege-unverified').getByRole('link', { name: '反馈数据缺口' });
    const issue = new URL((await feedback.getAttribute('href'))!);
    expect(issue.searchParams.get('body')).toContain(page.url());
    expect(issue.searchParams.get('title') + issue.searchParams.get('body')).toContain('手推炮');
    await page.reload();
    await expect(page.getByRole('checkbox', { name: '石工术', exact: true })).toBeChecked();
    await expect(page.getByTestId('siege-hits')).toHaveCount(0);
    await page.getByRole('checkbox', { name: '石工术', exact: true }).uncheck();
    await metrics(page, 5, '26', '15.3');
    await page.getByLabel('攻方文明', { exact: true }).selectOption('Portuguese');
    await expect(page.getByLabel('攻方文明', { exact: true })).toHaveValue('Portuguese');
    await expect(page.getByTestId('siege-hits')).toHaveCount(0);
    await page.getByLabel('攻方文明', { exact: true }).selectOption('Turks');
    await metrics(page, 5, '26', '15.3');
    await page.getByLabel('目标建筑', { exact: true }).selectOption('82');
    await metrics(page, 11, '65', '38.2');
    await page.getByLabel('攻城单位', { exact: true }).selectOption('280');
    await expect(page.getByTestId('siege-unverified')).toContainText('主弹与副弹');
    await expect(page.getByTestId('siege-hits')).toHaveCount(0);
    await page.getByLabel('攻城单位', { exact: true }).selectOption('36');
    await metrics(page, 11, '65', '38.2');
  });
}

test('#1064 existing cannon detail entry uses audited base configuration', async ({ page }) => {
  await page.goto('./#/unit/36');
  const entry = page.getByTestId('unit-siege-entry');
  await expect(entry).toHaveText(/算拆建筑/);
  await entry.click();
  await expect(page.getByLabel('攻城单位', { exact: true })).toHaveValue('36');
  await expect(page.getByLabel('数量', { exact: true })).toHaveValue('4');
  await expect(page.getByLabel('目标建筑', { exact: true })).toHaveValue('82');
  await expect(page.getByLabel('攻方文明', { exact: true })).toHaveValue('');
  await metrics(page, 6, '32.5', '19.1');
});
