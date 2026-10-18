import { expect, test } from '@playwright/test';
import techs from '../../src/data/techs.json' with { type: 'json' };
import buildings from '../../src/data/buildings.json' with { type: 'json' };

const tech = (en: string) => techs.find((entry) => entry.en === en)!;
const building = (en: string) => buildings.find((entry) => entry.en === en)!;

test('海上霸主的数值卡保留箭术科技前提及船坞/巨港对象', async ({ page }) => {
  await page.goto('./#/tech/624');
  const effects = page.getByRole('region', { name: '科技效果', exact: true });
  await expect(effects).toBeVisible();
  for (const card of await effects.locator('.detail-stat').all()) {
    await expect(card.locator('dt')).toContainText('组合触发');
    await expect(card.locator('.detail-stat-note')).toContainText('作用对象：');
  }
  for (const prerequisite of ['Fletching', 'Bodkin Arrow', 'Bracer']) {
    const cards = effects.locator('.detail-stat').filter({ has: page.locator('dt', { hasText: `需 ${tech(prerequisite).zh}` }) });
    expect(await cards.count()).toBeGreaterThan(0);
    await expect(cards.first().locator('.detail-stat-note')).toContainText(building('Dock').zh);
  }
  await expect(effects).toContainText(building('Harbor').zh);
  await expect(page.getByRole('region', { name: '效果说明', exact: true })).toContainText(tech('Thalassocracy').desc);
  await page.getByRole('tab', { name: '作用对象', exact: true }).click();
  await expect(page.locator('#affects')).toContainText('组合触发');
});

test('射箭槽不把不同塔型与升级条件归并成一个无条件攻击加成', async ({ page }) => {
  await page.goto('./#/tech/608');
  const effects = page.getByRole('region', { name: '科技效果', exact: true });
  await expect(effects).toBeVisible();
  for (const prerequisite of ['Guard Tower', 'Keep']) {
    const card = effects.locator('.detail-stat').filter({ has: page.locator('dt', { hasText: `需 ${tech(prerequisite).zh}` }) });
    await expect(card).toHaveCount(1);
    await expect(card.locator('.detail-stat-note')).toContainText(building(prerequisite).zh);
  }
  const base = effects.locator('.detail-stat').filter({ has: page.locator('dt', { hasText: '防御建筑（基础效果）' }) });
  await expect(base).toHaveCount(1);
  await expect(base.locator('.detail-stat-note')).toContainText(building('Watch Tower').zh);
  await expect(base.locator('.detail-stat-note')).toContainText(building('Guard Tower').zh);
  await expect(base.locator('.detail-stat-note')).toContainText(building('Keep').zh);
  // 固定补丁说明保留瞭望/警戒/大型箭塔的分对象总效果，不能由单张 +1 卡取代。
  await expect(page.getByRole('region', { name: '效果说明', exact: true })).toContainText(tech('Arrowslits').desc);
  await page.getByRole('tab', { name: '作用对象', exact: true }).click();
  await expect(page.locator('#affects')).toContainText(building('Keep').zh);
});
