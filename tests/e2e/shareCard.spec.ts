import { expect, test, type Page } from '@playwright/test';

/** #19 分享卡（Jony SPEC v0.4 验收要点 1–4 + 置灰按钮 57b1376）。卡上文字须与页面摘要逐字一致，不写死秒数。 */
async function open(page: Page, q: string) {
  await page.goto(`#/builds?${q}`);
  await expect(page.getByRole('list', { name: /时间线/ })).toBeVisible();
}
const shareBtn = (page: Page) => page.locator('[data-t="share-card-btn"]').filter({ visible: true });

async function cardMatchesSummary(page: Page) {
  const arrive = (await page.locator('[data-t="sum-arrive"] b').textContent())!.trim();
  const bnMain = (await page.locator('[data-t="sum-bottleneck"] b').textContent())!.trim();
  const bnSub = (await page.locator('[data-t="sum-bottleneck"] .s').textContent())!.trim();
  const idle = (await page.locator('.tl-summary li').nth(2).locator('b').textContent())!.trim();
  const range = page.locator('[data-t="sum-range"]');
  await shareBtn(page).click();
  const dlg = page.getByRole('dialog', { name: '分享卡' });
  await expect(dlg).toBeVisible();
  await expect(dlg.locator('[data-t="card-cell-0"] b')).toHaveText(arrive);
  await expect(dlg.locator('[data-t="card-cell-1"] b')).toHaveText(bnMain);
  await expect(dlg.locator('[data-t="card-cell-1"] .s')).toHaveText(bnSub);
  await expect(dlg.locator('[data-t="card-cell-2"] b')).toHaveText(idle);
  if (await range.count()) await expect(dlg.locator('[data-t="card-cell-0"] .s')).toHaveText((await range.textContent())!.trim());
  else await expect(dlg.locator('[data-t="card-cell-0"] .s')).toHaveCount(0);
  return dlg;
}

test.describe('#19 分享卡', () => {
  test('卡在木头：卡上数字与页面摘要逐字一致；可下载 PNG', async ({ page }) => {
    await open(page, 'bo=fast-castle-boom&civ=Franks');
    const dlg = await cardMatchesSummary(page);
    await expect(dlg.locator('[data-t="card-cell-0"] .s')).toHaveText(/^误差 \d+:\d\d–\d+:\d\d$/);
    await expect(dlg.locator('[data-t="card-title"]')).toHaveText(/^法兰克·速升城堡暴经济，约 \d+:\d\d 到城堡，卡在木头$/);
    await expect(dlg.locator('[data-t="card-url"]')).toHaveText(/#\/builds\?bo=fast-castle-boom&civ=Franks$/);
    const dl = page.waitForEvent('download');
    await dlg.locator('[data-t="card-download"]').click();
    expect((await dl).suggestedFilename()).toBe('aoe2-fast-castle-boom-Franks.png');
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
    await expect(shareBtn(page)).toBeFocused();
  });

  test('卡人口：显示开始时间，没有误差行', async ({ page }) => {
    await open(page, 'bo=scouts-18&civ=Franks&house=0');
    const dlg = await cardMatchesSummary(page);
    await expect(dlg.locator('[data-t="card-cell-1"] b')).toHaveText(/^卡人口 约 \d+:\d\d 起$/);
    await expect(dlg.locator('[data-t="card-basis"]')).toContainText('关自动建房');
    await expect(dlg.locator('[data-t="card-url"]')).toHaveText(/&house=0$/);
  });

  for (const w of [1280, 390]) {
    test(`置灰文明（${w}）：分享按钮 aria-disabled、可聚焦、点了不出卡；灰字逐字；复制链接照常`, async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.setViewportSize({ width: w, height: w > 600 ? 900 : 844 });
      await open(page, 'bo=scouts-18&civ=Huns');
      const btn = shareBtn(page);
      await expect(btn).toHaveCount(1);
      await expect(btn).toHaveAttribute('aria-disabled', 'true');
      const noteId = await btn.getAttribute('aria-describedby');
      const note = page.locator(`#${noteId}`);
      await expect(note).toHaveText('加成未计入，暂不能生成分享卡');
      await expect(note).toHaveCSS('font-size', '12px');
      const muted = await page.evaluate(() => {
        const d = document.createElement('span');
        d.style.color = 'var(--color-muted)';
        document.body.append(d);
        const c = getComputedStyle(d).color;
        d.remove();
        return c;
      });
      await expect(note).toHaveCSS('color', muted);
      expect(await note.evaluate((n) => n.scrollWidth <= n.clientWidth + 1 && n.getClientRects().length === 1)).toBe(true);
      await btn.focus();
      await expect(btn).toBeFocused();
      await btn.click({ force: true }); // aria-disabled：Playwright 默认不点，强制点一下验证「点了不动」
      await expect(page.getByRole('dialog', { name: '分享卡' })).toHaveCount(0);
      await page.getByRole('button', { name: '复制链接' }).filter({ visible: true }).click();
      const toast = page.locator('[data-t="toast-copied"]');
      await expect(toast).toHaveText('链接已复制');
      await expect(toast).toHaveAttribute('role', 'status');
      await expect(toast.locator('svg.lucide-check')).toHaveCount(1);
      expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('civ=Huns');
    });
  }

  test('「链接已复制」用 Lucide Check 图标，不用对勾字符', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await open(page, 'bo=scouts-18&civ=Franks');
    await page.getByRole('button', { name: '复制链接' }).filter({ visible: true }).click();
    const toast = page.locator('[data-t="toast-copied"]');
    await expect(toast.locator('svg.lucide-check')).toHaveCount(1);
    expect(await toast.textContent()).not.toMatch(/[\u2713\u2714]/);
  });

  for (const w of [360, 375, 390, 1280])
    for (const q of ['bo=fast-castle-boom&civ=Franks', 'bo=scouts-18&civ=Huns'])
      test(`${w} 宽无横向滚动（${q}）`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: w > 600 ? 900 : 800 });
        await open(page, q);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        if (!q.includes('Huns')) {
          await shareBtn(page).click();
          await expect(page.getByRole('dialog', { name: '分享卡' })).toBeVisible();
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        }
      });
});
