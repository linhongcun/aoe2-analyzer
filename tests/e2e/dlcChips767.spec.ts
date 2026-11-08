import { expect, test } from '@playwright/test';

/**
 * #767：DLC 页在 360/375/390 宽把文明列压到约 91px，芯片里的文明名被折成两行（单字文明芯片 69px），
 * 国王时代行高 1017px、整页 5776px（真实 SHA 构建；本地 dev 构建 5732px）。修复口径：≤600px 改为卡片布局，芯片保持单行且 ≥72px；1280 桌面表格不变。
 */
const MOBILE_WIDTHS = [360, 375, 390] as const;

for (const width of MOBILE_WIDTHS) {
  test.describe(`#767 DLC 文明芯片卡片布局 ${width}`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('全部芯片单行且 ≥72px、分组行高回落、整页不被折行拉长', async ({ page }) => {
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
        const chips = [...document.querySelectorAll('.dlct .civchip')] as HTMLElement[];
        // 只取每个芯片里的文明名文本节点；被折行时同一文本会占多个不同的 top。
        const lines = (chip: HTMLElement) => {
          const textNode = [...chip.childNodes].find((n) => n.nodeType === 3 && (n.textContent ?? '').trim());
          const range = document.createRange();
          range.selectNodeContents(textNode!);
          return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
        };
        const rows = [...document.querySelectorAll('.dlct tr')] as HTMLElement[];
        const table = document.querySelector('.dlct') as HTMLElement;
        return {
          chipCount: chips.length,
          minChipWidth: Math.min(...chips.map((c) => Math.round(c.getBoundingClientRect().width))),
          maxChipLines: Math.max(...chips.map(lines)),
          rowHeights: rows.map((r) => Math.round(r.getBoundingClientRect().height)),
          pageHeight: document.documentElement.scrollHeight,
          tableDisplay: getComputedStyle(table).display,
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
        };
      });

      expect(m.chipCount, '56 个文明全部渲染为芯片').toBe(56);
      expect(m.minChipWidth, '每个芯片宽度应容纳图标 + 文明名').toBeGreaterThanOrEqual(72);
      expect(m.maxChipLines, '芯片里的文明名应单行，不折行/不逐字竖排').toBe(1);
      expect(Math.max(...m.rowHeights), '每个资料片分组行应回到卡片量级').toBeLessThan(600);
      // 修复前 5776（真实 SHA 构建；dev 构建 5732）；卡片布局下 14 个资料片 + 56 个 ≥44px 芯片的固有高度约 3800。
      expect(m.pageHeight, '整页不应被折行拉长').toBeLessThan(4200);
      expect(m.tableDisplay, '窄屏改为块级卡片布局').toBe('block');
      expect(m.horizontalOverflow, '无横向滚动').toBe(false);
    });
  });
}

test.describe('#767 DLC 桌面布局', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('1280 保持表格布局、名称列 210px、芯片单行', async ({ page }) => {
    await page.goto('#/dlc');
    await expect(page.locator('.dlct tr').first()).toBeVisible();
    await page.waitForLoadState('networkidle');

    const m = await page.evaluate(() => {
      const chips = [...document.querySelectorAll('.dlct .civchip')] as HTMLElement[];
      const lines = (chip: HTMLElement) => {
        const textNode = [...chip.childNodes].find((n) => n.nodeType === 3 && (n.textContent ?? '').trim());
        const range = document.createRange();
        range.selectNodeContents(textNode!);
        return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
      };
      const rows = [...document.querySelectorAll('.dlct tr')] as HTMLElement[];
      return {
        tableDisplay: getComputedStyle(document.querySelector('.dlct') as HTMLElement).display,
        dnWidth: Math.round((document.querySelector('.dlct .dn') as HTMLElement).getBoundingClientRect().width),
        maxChipLines: Math.max(...chips.map(lines)),
        maxRowHeight: Math.max(...rows.map((r) => Math.round(r.getBoundingClientRect().height))),
        pageHeight: document.documentElement.scrollHeight,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      };
    });

    expect(m.tableDisplay, '桌面仍是表格').toBe('table');
    expect(m.dnWidth, '桌面名称列保持 210px').toBe(210);
    expect(m.maxChipLines, '桌面芯片保持单行').toBe(1);
    expect(m.maxRowHeight, '桌面行高与修复前一致（约 91–101）').toBeLessThan(130);
    expect(m.pageHeight, '桌面整页高度与修复前一致（约 1903）').toBeLessThan(2000);
    expect(m.horizontalOverflow, '无横向滚动').toBe(false);
  });
});

test.describe('#767 DLC 断点级联', () => {
  test.use({ viewport: { width: 600, height: 900 } });

  test('600px 用卡片、601px 回到表格，两者都无横向滚动', async ({ page }) => {
    await page.goto('#/dlc');
    await expect(page.locator('.dlct tr').first()).toBeVisible();
    await page.waitForLoadState('networkidle');

    const read = () =>
      page.evaluate(() => {
        const chips = [...document.querySelectorAll('.dlct .civchip')] as HTMLElement[];
        const lines = (chip: HTMLElement) => {
          const textNode = [...chip.childNodes].find((n) => n.nodeType === 3 && (n.textContent ?? '').trim());
          const range = document.createRange();
          range.selectNodeContents(textNode!);
          return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
        };
        const label = document.querySelector('.dlct .dc-label') as HTMLElement | null;
        return {
          display: getComputedStyle(document.querySelector('.dlct') as HTMLElement).display,
          labelShown: label ? getComputedStyle(label).display !== 'none' : false,
          minChipWidth: Math.min(...chips.map((c) => Math.round(c.getBoundingClientRect().width))),
          maxChipLines: Math.max(...chips.map(lines)),
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
        };
      });

    await page.setViewportSize({ width: 600, height: 900 });
    await page.waitForTimeout(100);
    const at600 = await read();
    expect(at600.display, '600px 属于卡片布局').toBe('block');
    expect(at600.labelShown, '600px 显示「个文明」').toBe(true);
    expect(at600.minChipWidth, '600px 全部芯片 ≥72px').toBeGreaterThanOrEqual(72);
    expect(at600.maxChipLines, '600px 芯片单行').toBe(1);
    expect(at600.horizontalOverflow, '600px 无横向滚动').toBe(false);

    await page.setViewportSize({ width: 601, height: 900 });
    await page.waitForTimeout(100);
    const at601 = await read();
    expect(at601.display, '601px 回到表格布局').toBe('table');
    expect(at601.labelShown, '601px 隐藏「个文明」').toBe(false);
    expect(at601.maxChipLines, '601px 芯片单行').toBe(1);
    expect(at601.horizontalOverflow, '601px 无横向滚动').toBe(false);
  });
});
