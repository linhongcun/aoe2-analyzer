import { expect, test, type Page } from '@playwright/test';

/** #94 高亮对比度 / #95 手机弹层固定高度（稿：docs/design/mockups/issue94-95-civpicker） */
const lum = (c: string) => {
  const [r, g, b] = (c.match(/[\d.]+/g) ?? [])
    .slice(0, 3)
    .map(Number)
    .map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
};
const bg = (page: Page, sel: string) =>
  page
    .locator(sel)
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);
const fg = (page: Page, sel: string) =>
  page
    .locator(sel)
    .first()
    .evaluate((el) => getComputedStyle(el).color);

async function open(page: Page) {
  await page.goto('./#/builds?bo=scouts-18');
  const set = page.getByRole('button', { name: /^设置/ });
  if ((page.viewportSize()?.width ?? 1280) < 900) {
    await set.click();
    await page.getByRole('dialog', { name: '设置' }).locator('#tlciv').click();
  } else await page.locator('#tlciv').click();
  await expect(page.locator('.cp-q')).toBeFocused();
}

for (const w of [360, 375, 390, 1280]) {
  test.describe(`#94/#95 CivPicker @${w}`, () => {
    test.use({ viewport: { width: w, height: w < 900 ? 740 : 800 } });

    test('#94 键盘高亮底和列表底对比 ≥ 3:1，高亮行文字 ≥ 4.5:1', async ({ page }) => {
      await open(page);
      await page.keyboard.press('ArrowDown');
      const act = await bg(page, '.cp-opt.act');
      const list = await page.locator('.cp-panel').evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(ratio(act, list)).toBeGreaterThanOrEqual(3);
      expect(ratio(await fg(page, '.cp-opt.act'), act)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(await fg(page, '.cp-opt.act small'), act)).toBeGreaterThanOrEqual(4.5);
    });

    test('#95 过滤前后弹层高度不变、输入框不移动；空态文案只提英文名', async ({ page }) => {
      await open(page);
      const box = async () => [(await page.locator('.cp-panel').boundingBox())!, (await page.locator('.cp-q').boundingBox())!] as const;
      const [p0, q0] = await box();
      await page.locator('.cp-q').fill('法兰克');
      await expect(page.locator('.cp-opt')).toHaveCount(1);
      const [p1, q1] = await box();
      await page.locator('.cp-q').fill('zzzz');
      await expect(page.locator('.cp-empty')).toBeVisible();
      const [p2, q2] = await box();
      await expect(page.locator('.cp-empty')).toContainText('可以试试英文名');
      await expect(page.locator('.cp-empty')).not.toContainText('拼音');
      if (w < 900) {
        expect(Math.abs(p1.height - p0.height)).toBeLessThanOrEqual(1);
        expect(Math.abs(p2.height - p0.height)).toBeLessThanOrEqual(1);
        expect(Math.abs(q1.y - q0.y)).toBeLessThanOrEqual(1);
        expect(Math.abs(q2.y - q0.y)).toBeLessThanOrEqual(1);
        expect(p0.y).toBeGreaterThanOrEqual(48 - 1);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(w);
    });
  });
}

for (const w of [390, 1280]) {
  test.describe(`#94 CivPicker 深色 @${w}`, () => {
    test.use({ viewport: { width: w, height: w < 900 ? 740 : 800 }, colorScheme: 'dark' });

    test('#94 深色：键盘高亮底和列表底对比 ≥ 3:1，高亮行文字 ≥ 4.5:1', async ({ page }) => {
      await open(page);
      await page.keyboard.press('ArrowDown');
      const act = await bg(page, '.cp-opt.act');
      const list = await page.locator('.cp-panel').evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(ratio(act, list)).toBeGreaterThanOrEqual(3);
      expect(ratio(await fg(page, '.cp-opt.act'), act)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(await fg(page, '.cp-opt.act small'), act)).toBeGreaterThanOrEqual(4.5);
    });
  });
}
