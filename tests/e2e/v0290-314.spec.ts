import { expect, test } from '@playwright/test';
import { guardPage, WIDTHS, wrappedNums } from './v0290-helpers';

/**
 * v0.29.0 验收（#329）A 组 #314 部分：取自 Kent Beck test/v0290-acceptance @ 646ac40 tests/e2e/v0290-A.spec.ts，断言原样未改。
 */
guardPage();

// ---------- #314 ----------
test.describe('#314 战役目录：同年排序说明', () => {
  test('不再出现「固定顺序」；结果计数行与「关于数据」写同一条具体规则，卡片顺序与规则一致', async ({ page }) => {
    await page.goto('./#/campaigns');
    await expect(page.getByTestId('campaign-card').first()).toBeVisible();
    await expect(page.locator('main')).not.toContainText('固定顺序');
    const count = await page.locator('.campaign-count').innerText();
    await page.locator('.campaign-boundaries > summary').click();
    const about = await page.locator('.campaign-boundaries').innerText();
    const rules = [/英文名[^。]*字母/, /游戏内[^。]*顺序/];
    const inCount = rules.filter((r) => r.test(count)),
      inAbout = rules.filter((r) => r.test(about));
    expect(inCount.length, `计数行：${count}`).toBe(1);
    expect(inAbout.map(String), '关于数据与计数行同一规则').toEqual(inCount.map(String));
    const ids = await page.getByTestId('campaign-card').evaluateAll((els) => els.map((e) => e.getAttribute('data-campaign')));
    const y1999 = ids.filter((id) => ['barbarossa', 'genghis-khan', 'joan-of-arc', 'saladin', 'william-wallace'].includes(id!));
    if (inCount[0] === rules[0]) expect(y1999).toEqual(['barbarossa', 'genghis-khan', 'joan-of-arc', 'saladin', 'william-wallace']);
    else expect(y1999).toEqual(['william-wallace', 'joan-of-arc', 'saladin', 'genghis-khan', 'barbarossa']);
  });
  for (const width of WIDTHS)
    test(`#/campaigns @${width}：.num 不折行`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./#/campaigns');
      await expect(page.getByTestId('campaign-card').first()).toBeVisible();
      expect(await wrappedNums(page, 'main')).toEqual([]);
    });
});
