// v0.30.0 #331 验收（页面）：22 条团队加成的详情页都显示「各工具计入情况」，每行写明自己的 / 队友给的。判定一致性见 tests/unit/v0300-331.test.ts。Kent Beck 2026-10-22。
import { expect, test } from '@playwright/test';

const CIVS = [
  'Aztecs',
  'Bengalis',
  'Bohemians',
  'Britons',
  'Bulgarians',
  'Burgundians',
  'Burmese',
  'Byzantines',
  'Celts',
  'Chinese',
  'Georgians',
  'Goths',
  'Huns',
  'Incas',
  'Lithuanians',
  'Malians',
  'Mayans',
  'Muisca',
  'Portuguese',
  'Spanish',
  'Teutons',
  'Vikings',
];

test.describe('#331 团队加成详情页：各工具计入情况', () => {
  for (const civ of CIVS)
    test(`#/civ/${civ}/bonus/team：有「各工具计入情况」，每行写明自己的还是队友给的，不显示「仅文本，未计入数值：」的整段说明`, async ({ page }) => {
      await page.goto(`./#/civ/${civ}/bonus/team`, { waitUntil: 'networkidle' });
      await expect(page.locator('main')).toContainText('团队加成');
      const box = page.locator('main .busage');
      await expect(box).toContainText('各工具计入情况');
      const items = box.locator('li[data-usage]');
      expect(await items.count()).toBeGreaterThan(0);
      for (const t of await items.allInnerTexts()) expect(t).toMatch(/本文明|自己|本方|队友|盟友/);
      expect(await page.locator('main [data-on="null"]').count(), '不留「未逐条核对」').toBe(0);
    });

  for (const width of [360, 1280])
    test(`#/civ/Chinese/bonus/team @${width}：无横向滚动`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('./#/civ/Chinese/bonus/team', { waitUntil: 'networkidle' });
      await expect(page.locator('main')).toContainText('团队加成');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    });
});
