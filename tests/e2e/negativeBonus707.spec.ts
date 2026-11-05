import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const bonusBox = (page: Page) => page.locator('.bonusbox').filter({ has: page.getByRole('heading', { name: '克制加成 / Bonus damage', exact: true }) });
const negativeNote = (page: Page) => bonusBox(page).locator('[data-t="negative-bonus-note"]');
const formula = (page: Page) => page.locator('.duel-note [role="math"]');
const simple = '伤害 = max(1, Σ max(0, 攻击类别 − 对应护甲类别))';
const full = '伤害 = max(1, Σ max(min(0, 攻击类别), 攻击类别 − 对应护甲类别))';

async function note(page: Page) {
  const n = negativeNote(page);
  await expect(n).toBeVisible();
  await expect(n).toContainText('max(min(0, 攻击), 攻击 − 护甲)');
  await expect(n).toContainText('与基础攻击的对应类别贡献合计');
  await expect(n).toContainText('伤害最低为 1');
  await expect(n).toContainText('目标已入库且具有的护甲类别');
  await expect(n).toContainText('缺失或无匹配类别的这一项不计入');
}

test('#707 PC1280 骑士与轻型投石车的负攻击加成都有同屏解释', async ({ page }) => {
  for (const [id, category, value] of [
    [38, '村民', -3],
    [280, '僧侣', -1],
  ] as const) {
    await page.goto(`./#/unit/${id}`);
    await note(page);
    await expect(
      bonusBox(page)
        .locator('tr')
        .filter({ hasText: `对 ${category}` })
        .locator('td')
        .last(),
    ).toHaveText(String(value));
    await expect(page.locator('footer')).toContainText('DE 188329');
  }
});

test('#707 PK 只在实际负贡献存在时用完整式，缺类别与不可用状态如实解释', async ({ page }) => {
  for (const [a, b, column] of [
    ['280.Franks.3..', '125.Franks.3..', 1],
    ['125.Franks.3..', '280.Franks.3..', 2],
  ] as const) {
    await page.goto(`./#/duel?a=${a}&b=${b}&m=1`);
    await expect(page.locator('#duel-res')).toBeVisible();
    await expect(page.locator('.duel-note')).toContainText(full);
    await expect(formula(page)).toHaveText(full);
    const row = page.locator('#duel-res tr').filter({ has: page.getByText('每击伤害', { exact: true }) });
    expect(Number(await row.locator('td').nth(column).innerText())).toBe(39);
  }
  await page.goto('./#/duel?a=38.Franks.3..&b=83.Franks.1..&m=1');
  await expect(page.locator('#duel-res')).toBeVisible();
  await expect(formula(page)).toHaveText(simple);
  await expect(formula(page)).toHaveAttribute('title', /本场.*无负伤害贡献/);
  await page.goto('./#/duel?a=569.Britons.4.f.&b=125.Franks.3..&m=1');
  await expect(page.locator('#duel-pending')).toBeVisible();
  await expect(formula(page)).toHaveText(simple);
  await expect(formula(page)).toHaveAttribute('title', /本场伤害未计算/);
});

for (const width of [360, 375, 390, 1280]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`#707 负加成四宽明暗 ${width}-${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (event) => {
        if (event.type() === 'error') errors.push(event.text());
      });
      for (const context of ['unit', 'sim', 'pk'] as const) {
        const route = context === 'unit' ? 'unit/38' : context === 'sim' ? 'unit/38/Franks/3/?tab=sim' : 'duel?a=280.Franks.3..&b=125.Franks.3..&m=1';
        await page.goto(`./#/${route}`);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        if (context === 'pk') await expect(formula(page)).toHaveText(full);
        else await note(page);
        const target = context === 'pk' ? page.locator('.duel-note') : bonusBox(page);
        await expect(target).toHaveCount(1);
        await target.evaluate((element) => element.setAttribute('data-negative-audit', '707'));
        expect((await new AxeBuilder({ page }).include('[data-negative-audit="707"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await target.screenshot({ path: info.outputPath(`negative-${context}-${width}-${theme}.png`) });
      }
      expect(errors).toEqual([]);
    });
  }
}
