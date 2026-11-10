import { expect, test } from '@playwright/test';
import techs from '../../src/data/techs.json' with { type: 'json' };

const tech = (en: string) => techs.find((entry) => entry.en === en)!;

test('海上霸主按完整条件分开列出，不把相同数字并成一条', async ({ page }) => {
  await page.goto('./#/tech/624');
  const summaries = page.locator('[data-t="effect-summary"]');
  await expect(summaries).toHaveCount(4);
  const fletching = summaries.filter({ hasText: '箭羽' });
  await expect(fletching).toHaveCount(2);
  await expect(fletching.filter({ hasText: '攻击' })).toHaveCount(1);
  for (const prerequisite of ['箭羽', '锥子箭', '护腕']) {
    const row = summaries.filter({ hasText: prerequisite }).first();
    await expect(row).toContainText('需要');
    await expect(row).toContainText('海上霸主');
  }
  const harborId = await fletching.filter({ hasText: '攻击' }).getAttribute('data-rule');
  await expect(page.locator(`[data-t="affect-rule"][data-rule="${harborId}"]`)).toContainText('巨港');
  await expect(page.locator(`[data-t="affect-rule"][data-rule="${harborId}"]`)).not.toContainText('船坞');
  const dock = fletching.filter({ hasNotText: '攻击' });
  const dockId = await dock.getAttribute('data-rule');
  await expect(page.locator(`[data-t="affect-rule"][data-rule="${dockId}"]`)).toContainText('船坞');
  await expect(page.getByRole('region', { name: '游戏说明', exact: true })).toContainText(tech('Thalassocracy').desc);
  await expect(page.locator('#tech')).not.toContainText('必须');
});

test('射箭槽的基础攻击和箭塔条件各自保留', async ({ page }) => {
  await page.goto('./#/tech/608');
  const summaries = page.locator('[data-t="effect-summary"]');
  await expect(summaries).toHaveCount(3);
  await expect(page.locator('[data-t="effect-summary"][data-kind="base"]')).toHaveCount(1);
  await expect(page.locator('[data-t="effect-summary"][data-req="Arrowslits|Guard Tower"]')).toContainText('警戒箭塔');
  await expect(page.locator('[data-t="effect-summary"][data-req="Arrowslits|Keep"]')).toContainText('大型箭塔');
  const baseId = await page.locator('[data-t="effect-summary"][data-kind="base"]').getAttribute('data-rule');
  const base = page.locator(`[data-t="affect-rule"][data-rule="${baseId}"]`);
  await expect(base).toContainText('瞭望箭塔');
  await expect(base).toContainText('警戒箭塔');
  await expect(base).toContainText('大型箭塔');
  await expect(base).not.toContainText('+1 攻击');
  await expect(page.getByRole('region', { name: '游戏说明', exact: true })).toContainText(tech('Arrowslits').desc);
});
