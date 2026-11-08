import { expect, test } from '@playwright/test';

/**
 * #767：DLC 页在 360/375/390 宽把文明芯片挤成逐字竖排（芯片 35px 宽、国王时代行高 1017px）。
 * 修复口径：≤600px 改为卡片布局，芯片保持单行；1280 桌面表格与 210px 名称列不变。
 */
const MOBILE_WIDTHS = [360, 375, 390] as const;

for (const width of MOBILE_WIDTHS) {
  test.describe(`#767 DLC 文明芯片卡片布局 ${width}`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('芯片单行、分组行高回落、整页不被逐字竖排拉长', async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto('#/dlc');
      await expect(page.locator('.dlct tr').first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      expect(errors).toEqual([]);

      const m = await page.evaluate(() => {
        const chip = document.querySelector('.dlct .civchip') as HTMLElement;
        // 只取芯片里的文明名文本节点，逐字竖排时每个字会有一个不同的 top。
        const textNode = [...chip.childNodes].find((n) => n.nodeType === 3 && (n.textContent ?? '').trim());
        const range = document.createRange();
        range.selectNodeContents(textNode!);
        const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
        const rows = [...document.querySelectorAll('.dlct tr')] as HTMLElement[];
        const table = document.querySelector('.dlct') as HTMLElement;
        return {
          chipWidth: Math.round(chip.getBoundingClientRect().width),
          chipHeight: Math.round(chip.getBoundingClientRect().height),
          textLines: lines,
          pageHeight: document.documentElement.scrollHeight,
          rowHeights: rows.map((r) => Math.round(r.getBoundingClientRect().height)),
          tableDisplay: getComputedStyle(table).display,
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
        };
      });

      expect(m.chipWidth, '芯片宽度应容纳图标 + 文明名').toBeGreaterThanOrEqual(72);
      expect(m.textLines, '芯片里的文明名应单行，不逐字竖排').toBe(1);
      expect(Math.max(...m.rowHeights), '每个资料片分组行应回到卡片量级').toBeLessThan(600);
      // 修复前 5732（逐字竖排）；卡片布局下 14 个资料片的固有高度约 3700，这里留 500 余量。
      expect(m.pageHeight, '整页不应被逐字竖排拉长').toBeLessThan(4200);
      expect(m.tableDisplay, '窄屏改为块级卡片布局').toBe('block');
      expect(m.horizontalOverflow, '无横向滚动').toBe(false);
    });
  });
}

test.describe('#767 DLC 桌面布局', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('1280 保持表格布局与固定名称列', async ({ page }) => {
    await page.goto('#/dlc');
    await expect(page.locator('.dlct tr').first()).toBeVisible();
    await page.waitForLoadState('networkidle');

    const m = await page.evaluate(() => {
      const table = document.querySelector('.dlct') as HTMLElement;
      const dn = document.querySelector('.dlct .dn') as HTMLElement;
      const chip = document.querySelector('.dlct .civchip') as HTMLElement;
      return {
        tableDisplay: getComputedStyle(table).display,
        dnWidth: Math.round(dn.getBoundingClientRect().width),
        chipHeight: Math.round(chip.getBoundingClientRect().height),
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      };
    });

    expect(m.tableDisplay, '桌面仍是表格').toBe('table');
    expect(m.dnWidth, '桌面名称列保持 210px').toBeGreaterThanOrEqual(210);
    expect(m.chipHeight, '桌面芯片保持单行').toBeLessThan(60);
    expect(m.horizontalOverflow, '无横向滚动').toBe(false);
  });
});
