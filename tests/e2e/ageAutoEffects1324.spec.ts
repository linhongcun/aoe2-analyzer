import { expect, test, type Page } from '@playwright/test';

async function simStat(page: Page, label: string) {
  const row = page.locator('#sim table.simtab tr').filter({ has: page.locator('td:first-child', { hasText: label }) });
  return row.locator('td').nth(2).locator('b');
}

test('#1324 科技模拟器：斥候视野 6/8/10、萨金特卫兵城堡 75/8/4/2、鹰斥候城堡自动 387 且不重复叠加', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.setViewportSize({ width: 1280, height: 900 });

  // 1. 亚美尼亚斥候骑兵（448）：不选科技，封建/城堡/帝王视野 6 / 8 / 10
  await page.goto('./#/unit/448?tab=sim&civ=Armenians');
  await expect(page.locator('#simage')).toBeVisible();
  await page.getByRole('button', { name: '清空', exact: true }).click();
  for (const [age, los] of [
    ['2', '6'],
    ['3', '8'],
    ['4', '10'],
  ] as const) {
    await page.locator('#simage').selectOption(age);
    await expect(await simStat(page, '视野')).toHaveText(los);
  }

  // 2. 西西里城堡萨金特卫兵（1658）与城楼萨金特卫兵（1660）：进城堡 75/8/4/2
  await page.goto('./#/unit/1658?tab=sim&civ=Sicilians');
  await expect(page.locator('#simage')).toBeVisible();
  await page.getByRole('button', { name: '清空', exact: true }).click();
  await page.locator('#simage').selectOption('3');
  await expect(await simStat(page, '生命值')).toHaveText('75');
  await expect(await simStat(page, '攻击力')).toHaveText('8');
  await expect(await simStat(page, '近战护甲')).toHaveText('4');
  await expect(await simStat(page, '穿刺护甲')).toHaveText('2');

  await page.goto('./#/unit/1660?tab=sim&civ=Sicilians');
  await expect(page.locator('#simage')).toBeVisible();
  await page.getByRole('button', { name: '清空', exact: true }).click();
  await page.locator('#simage').selectOption('2');
  await expect(await simStat(page, '生命值')).toHaveText('50');
  await expect(await simStat(page, '攻击力')).toHaveText('5');
  await page.locator('#simage').selectOption('3');
  await expect(await simStat(page, '生命值')).toHaveText('75');
  await expect(await simStat(page, '攻击力')).toHaveText('8');
  await expect(await simStat(page, '近战护甲')).toHaveText('4');
  await expect(await simStat(page, '穿刺护甲')).toHaveText('2');

  // 3. 玛雅鹰斥候（751）：封建 4 攻，城堡自动 7 攻并含对骑兵/船只/骆驼加成，帝王不二次叠加
  await page.goto('./#/unit/751?tab=sim&civ=Mayans');
  await expect(page.locator('#simage')).toBeVisible();
  await page.getByRole('button', { name: '清空', exact: true }).click();
  await page.locator('#simage').selectOption('2');
  await expect(await simStat(page, '攻击力')).toHaveText('4');
  await page.locator('#simage').selectOption('3');
  await expect(await simStat(page, '攻击力')).toHaveText('7');
  const bonusBox = page.locator('#sim .bonusbox').filter({ hasText: '克制加成 / Bonus damage' });
  await expect(bonusBox).toContainText('骑兵');
  await expect(bonusBox).toContainText('+2');
  await expect(bonusBox).toContainText('船只');
  await expect(bonusBox).toContainText('骆驼');
  await expect(bonusBox).toContainText('+1');
  await page.locator('#simage').selectOption('4');
  await expect(await simStat(page, '攻击力')).toHaveText('7');

  // 4. #/duel 单位卡（无科技城堡时代）：西西里萨金特（1658）75 血 / 8 攻 / 4/2 甲；玛雅鹰斥候（751）7 攻
  await page.goto('./#/duel?a=1658.Sicilians.3..&b=751.Mayans.3..&m=1');
  await expect(page.locator('#duel-a .duel-stats')).toContainText('75');
  await expect(page.locator('#duel-a .duel-stats')).toContainText('8（近战）');
  await expect(page.locator('#duel-a .duel-stats')).toContainText('4 / 2');
  await expect(page.locator('#duel-b .duel-stats')).toContainText('7（近战）');

  // 5. 单位详情升时代自动变化区与三时代视野同步（#1339）
  await page.goto('./#/unit/448');
  const panel = page.getByRole('region', { name: '升时代自动变化', exact: true });
  await expect(panel.locator('[data-age-card="upgrade"][data-age="2"] [data-age-stat="los"] [data-age-after]')).toHaveText('6');
  await expect(panel.locator('[data-age-card="upgrade"][data-age="3"] [data-age-stat="los"] [data-age-after]')).toHaveText('8');
  await expect(panel.locator('[data-age-card="upgrade"][data-age="4"] [data-age-stat="los"] [data-age-after]')).toHaveText('10');

  expect(errors).toEqual([]);
});

test('#1324 持续生产：鹰斥候（751）、城楼萨金特（1660）与弗拉芒民兵（1699）自动训练时间生效', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.setViewportSize({ width: 1280, height: 900 });

  // 玛雅鹰斥候：封建 46 秒 → 城堡 34.96 秒 → 帝王 34.96 秒
  await page.goto('./#/production?civ=Mayans&age=2&rows=751%3A12%3A1');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByTestId('production-row').first()).toContainText('46 秒 / 个');
  await expect(page.getByTestId('production-row').first()).not.toContainText('城堡时代自动训练时间修正');

  await page.goto('./#/production?civ=Mayans&age=3&rows=751%3A12%3A1');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByTestId('production-row').first()).toContainText('34.96 秒 / 个');
  await expect(page.getByTestId('production-row').first()).toContainText('城堡时代自动训练时间修正');

  await page.goto('./#/production?civ=Mayans&age=4&rows=751%3A12%3A1');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByTestId('production-row').first()).toContainText('34.96 秒 / 个');

  // 阿兹特克鹰斥候城堡时代：46 * 0.869565 * 0.76 ≈ 30.4 秒 / 个
  await page.goto('./#/production?civ=Aztecs&age=3&rows=751%3A12%3A1');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByTestId('production-row').first()).toContainText('30.4 秒 / 个');
  await expect(page.getByTestId('production-row').first()).toContainText('城堡时代自动训练时间修正');

  // 西西里城楼萨金特（1660）：封建 16 秒 → 城堡 12 秒；城堡版（1658）维持 12 秒
  await page.goto('./#/production?civ=Sicilians&age=2&rows=1660%3A1665%3A1');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByTestId('production-row').first()).toContainText('16 秒 / 个');

  await page.goto('./#/production?civ=Sicilians&age=3&rows=1660%3A1665%3A1');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByTestId('production-row').first()).toContainText('12 秒 / 个');
  await expect(page.getByTestId('production-row').first()).toContainText('城堡时代自动训练时间修正');

  await page.goto('./#/production?civ=Sicilians&age=3&rows=1658%3A82%3A1');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByTestId('production-row').first()).toContainText('12 秒 / 个');

  // 勃艮第弗拉芒民兵（1699）：帝王 + 弗拉芒革命（755）自动应用 774 → 14 秒 / 个
  await page.goto('./#/production?civ=Burgundians&age=4&techs=755&rows=1699%3A12%3A1');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByTestId('production-row').first()).toContainText('14 秒 / 个');
  await expect(page.getByTestId('production-row').first()).toContainText('城堡时代自动训练时间修正');

  expect(errors).toEqual([]);
});
