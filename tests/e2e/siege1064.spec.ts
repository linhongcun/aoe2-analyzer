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
  test(`#1064 / #1489 cannon 25 civs, armor techs, compare table and fail-closed @${width} ${theme}`, async ({ page, context }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
    await page.goto('./#/siege?unit=36&n=4&bldg=82&civ=Ethiopians');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(page.getByLabel('攻城单位', { exact: true })).toHaveValue('36');
    await expect(page.getByLabel('数量', { exact: true })).toHaveValue('4');
    await expect(page.getByLabel('目标建筑', { exact: true })).toHaveValue('82');
    await expect(page.getByLabel('攻方文明', { exact: true })).toHaveValue('Ethiopians');
    await expect(page.getByRole('checkbox', { name: '石工术', exact: true })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: '建筑学', exact: true })).not.toBeChecked();
    await expect(page.getByRole('checkbox', { name: '驻满村民', exact: true })).not.toBeChecked();
    await metrics(page, 6, '32.5', '19.1');

    // 同组合对照表全部 5 行均给出有效击数与用时，零「暂不计算 · 数据待补」
    const comparison = page.getByTestId('siege-compare');
    await expect(comparison.getByText('暂不计算 · 数据待补', { exact: true })).toHaveCount(0);
    await expect(comparison.getByRole('row', { name: /城镇中心/ })).toContainText('13');
    await expect(comparison.getByRole('row', { name: /城堡/ })).toContainText('32.5');
    await expect(comparison.getByRole('row', { name: /瞭望箭塔/ })).toContainText('0.0');
    await expect(comparison.getByRole('row', { name: /石墙/ })).toContainText('6.5');
    await expect(comparison.getByRole('row', { name: /城门/ })).toContainText('6.5');

    // 勃艮第 +25% 攻击（5 击 / 26s / 15.3s）与石工+建筑学（6 击 / 32.5s / 19.1s）+ 刷新保留
    await page.getByLabel('攻方文明', { exact: true }).selectOption('Burgundians');
    await metrics(page, 5, '26', '15.3');
    await page.getByRole('checkbox', { name: '石工术', exact: true }).check();
    await page.getByRole('checkbox', { name: '建筑学', exact: true }).check();
    await expect(page).toHaveURL(/civ=Burgundians&armor=50%2C51/);
    await metrics(page, 6, '32.5', '19.1');
    await page.reload();
    await expect(page.getByRole('checkbox', { name: '石工术', exact: true })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: '建筑学', exact: true })).toBeChecked();
    await metrics(page, 6, '32.5', '19.1');

    // 西班牙 +18% 攻速：石工+建筑学（7 击 / 33.15s / 19.5s）与无甲（6 击 / 27.63s / 16.3s）
    await page.getByLabel('攻方文明', { exact: true }).selectOption('Spanish');
    await metrics(page, 7, '33.15', '19.5');
    await page.getByRole('checkbox', { name: '石工术', exact: true }).uncheck();
    await page.getByRole('checkbox', { name: '建筑学', exact: true }).uncheck();
    await metrics(page, 6, '27.63', '16.3');
    await expect(comparison.getByText('暂不计算 · 数据待补', { exact: true })).toHaveCount(0);
    await expect(comparison.getByRole('row', { name: /城镇中心/ })).toContainText('11.05');

    // 分享链接与视口布局：零横向溢出，全部 .num/.nw 单行不折行
    await page.getByRole('button', { name: '复制分享链接', exact: true }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const root = page.getByTestId('siege-page');
    for (const sel of ['.num:not(input)', '.nw'] as const) {
      const nodes = root.locator(sel);
      const count = await nodes.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        const lines = await nodes.nth(i).evaluate((el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          return new Set([...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0).map((r) => Math.round(r.top))).size;
        });
        expect(lines, `${sel}[${i}]`).toBeLessThanOrEqual(1);
      }
    }

    // 真实未覆盖反例 1：不可训练手推炮文明（Britons）→ 拒算且反馈链接含完整 URL 与手推炮
    await page.getByLabel('攻方文明', { exact: true }).selectOption('Britons');
    await expect(page.getByTestId('siege-unverified')).toContainText('数据未核实，暂不计算');
    await expect(page.getByTestId('siege-hits')).toHaveCount(0);
    await expect(page.getByTestId('siege-compare')).toHaveCount(0);
    const feedback = page.getByTestId('siege-unverified').getByRole('link', { name: '反馈数据缺口' });
    const issue = new URL((await feedback.getAttribute('href'))!);
    expect(issue.searchParams.get('body')).toContain(page.url());
    expect(issue.searchParams.get('title') + issue.searchParams.get('body')).toContain('手推炮');

    // 真实未覆盖反例 2：未收录建筑（12 兵营）→ 拒算；切回大型箭塔（235）恢复计算
    await page.getByLabel('攻方文明', { exact: true }).selectOption('Turks');
    await page.getByLabel('目标建筑', { exact: true }).selectOption('12');
    await expect(page.getByTestId('siege-unverified')).toContainText('数据未核实，暂不计算');
    await expect(page.getByTestId('siege-hits')).toHaveCount(0);
    await page.getByLabel('目标建筑', { exact: true }).selectOption('235');
    await metrics(page, 3, '13', '7.6');

    // 真实未覆盖反例 3：轻型投石车（280）保持规则未核实拒算，切回手推炮正常恢复
    await page.getByLabel('攻城单位', { exact: true }).selectOption('280');
    await expect(page.getByTestId('siege-unverified')).toContainText('主弹与副弹');
    await expect(page.getByTestId('siege-hits')).toHaveCount(0);
    await page.getByLabel('攻城单位', { exact: true }).selectOption('36');
    await metrics(page, 3, '13', '7.6');

    expect(errors).toEqual([]);
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
