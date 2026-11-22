import { expect, test } from '@playwright/test';

function armyCostUrl(civ: string, age: string, rows: { unit: number; qty: string }[], targets: string[] = []): string {
  return (
    './#/production?' +
    new URLSearchParams({
      mode: 'army-cost',
      acv: '1',
      acdata: '188329',
      civ,
      age,
      acunits: JSON.stringify(rows),
      acdone: '[]',
      actargets: JSON.stringify(targets),
    }).toString()
  );
}

test('#1325 验收 1 & 2：契丹城堡重装骑射手 PK/持续生产、亚美尼亚武士封建可用/黑暗不可用、冠军剑士城堡可用', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.setViewportSize({ width: 1280, height: 900 });

  // 1a. 城堡契丹重装骑射手 PK：A 方保持城堡时代
  await page.goto('./#/duel?a=474.Khitans.3..&b=4.Britons.3..&m=1');
  await expect(page.locator('#duel-a')).toContainText('契丹');
  await expect(page.locator('#duel-a .duel-age')).toHaveText('城堡时代');
  await expect(page.locator('#duel-a-age')).toHaveValue('3');

  // 1b. 持续生产：契丹城堡重装骑射手
  await page.goto('./#/production?civ=Khitans&age=3&rows=474%3A87%3A1');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('当前不可用');
  await expect(page.locator('#production-unit-0')).toHaveAttribute('data-value', '474');
  const khitanTotal = await page.getByTestId('production-total').innerText();
  expect(khitanTotal).toMatch(/合计 \d+ 人/);
  expect(khitanTotal).not.toContain('合计 0 人');

  // 1c. 持续生产：亚美尼亚城堡冠军剑士
  await page.goto('./#/production?civ=Armenians&age=3&rows=567%3A12%3A1');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('当前不可用');
  await expect(page.locator('#production-unit-0')).toHaveAttribute('data-value', '567');
  const armChampTotal = await page.getByTestId('production-total').innerText();
  expect(armChampTotal).toMatch(/合计 \d+ 人/);
  expect(armChampTotal).not.toContain('合计 0 人');

  // 2a. 持续生产：亚美尼亚黑暗武士不可用
  await page.goto('./#/production?civ=Armenians&age=1&rows=75%3A12%3A1');
  await expect(page.getByRole('alert')).toContainText('当前方案无法计算');
  await expect(page.getByTestId('production-total')).toHaveCount(0);

  // 2b. 持续生产：亚美尼亚封建武士可用
  await page.goto('./#/production?civ=Armenians&age=2&rows=75%3A12%3A1');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('当前不可用');
  const armMaaTotal = await page.getByTestId('production-total').innerText();
  expect(armMaaTotal).toMatch(/合计 \d+ 人/);
  expect(armMaaTotal).not.toContain('合计 0 人');

  expect(errors).toEqual([]);
});

test('#1325 验收 3 & 4：阵容新增费用三组城堡科技与契丹升级训练、PK 城堡当前时代科技预设', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.setViewportSize({ width: 1280, height: 900 });

  // 3a. 女真城堡火箭推车 + 攻城技师（377；女真攻城科技木材 -75%，500 食 150 木）
  await page.goto(armyCostUrl('Jurchens', '3', [{ unit: 1904, qty: '1' }], ['t:377']));
  await expect(page.getByTestId('army-cost-page')).toBeVisible();
  await expect(page.locator('main')).toContainText('攻城技师');
  await expect(page.locator('main')).not.toContainText('未计入');
  await expect(page.locator('main')).toContainText('500');
  await expect(page.locator('main')).toContainText('150');

  // 3b. 波斯城堡骑射手 + 帕提亚战术（436）
  await page.goto(armyCostUrl('Persians', '3', [{ unit: 39, qty: '1' }], ['t:436']));
  await expect(page.locator('main')).toContainText('帕提亚战术');
  await expect(page.locator('main')).not.toContainText('未计入');
  await expect(page.locator('main')).toContainText('200');
  await expect(page.locator('main')).toContainText('250');

  // 3c. 波希米亚城堡步弓手 + 化学（47）
  await page.goto(armyCostUrl('Bohemians', '3', [{ unit: 4, qty: '1' }], ['t:47']));
  await expect(page.locator('main')).toContainText('化学');
  await expect(page.locator('main')).not.toContainText('未计入');
  await expect(page.locator('main')).toContainText('300');
  await expect(page.locator('main')).toContainText('200');

  // 3d. 契丹城堡重装骑射手：半价升级与训练行同时通过
  await page.goto(armyCostUrl('Khitans', '3', [{ unit: 474, qty: '1' }]));
  await expect(page.locator('main')).not.toContainText('当前文明、时代或必要解锁条件下不可训练');
  await expect(page.locator('main')).toContainText('450');
  await expect(page.locator('main')).toContainText('250');

  // 3e. 封建时代对照：攻城技师在女真封建时代不能通过
  await page.goto(armyCostUrl('Jurchens', '2', [{ unit: 4, qty: '1' }], ['t:377']));
  await expect(page.locator('main')).toContainText('未计入');

  // 4. 单位 PK 城堡时代「当前时代满」：波希米亚步弓手带化学、女真火箭推车带攻城技师、波斯骑射手带帕提亚战术
  await page.goto('./#/duel?a=4.Bohemians.3.c.&b=4.Britons.3.c.&m=1');
  await expect(page.locator('#duel-a .duel-stats')).toContainText('7（穿刺）');
  await expect(page.locator('#duel-b .duel-stats')).toContainText('6（穿刺）');
  await page.locator('#duel-a details.duel-tech summary').click();
  await expect(page.locator('#duel-a details.duel-tech label', { hasText: '化学' }).locator('input[type="checkbox"]')).toBeChecked();
  await page.locator('#duel-b details.duel-tech summary').click();
  await expect(page.locator('#duel-b details.duel-tech label', { hasText: '化学' }).locator('input[type="checkbox"]')).not.toBeChecked();

  await page.goto('./#/duel?a=1904.Jurchens.3.c.&b=1904.Khitans.3.c.&m=1');
  await expect(page.locator('#duel-a .duel-stats')).toContainText('射程8');
  await expect(page.locator('#duel-b .duel-stats')).toContainText('射程7');
  await page.locator('#duel-a details.duel-tech summary').click();
  await expect(page.locator('#duel-a details.duel-tech label', { hasText: '攻城技师' }).locator('input[type="checkbox"]')).toBeChecked();

  await page.goto('./#/duel?a=39.Persians.3.c.&b=39.Huns.3.c.&m=1');
  await expect(page.locator('#duel-a .duel-stats')).toContainText('护甲3 / 4');
  await expect(page.locator('#duel-b .duel-stats')).toContainText('护甲2 / 2');
  await page.locator('#duel-a details.duel-tech summary').click();
  await expect(page.locator('#duel-a details.duel-tech label', { hasText: '帕提亚战术' }).locator('input[type="checkbox"]')).toBeChecked();
  await page.locator('#duel-b details.duel-tech summary').click();
  await expect(page.locator('#duel-b details.duel-tech label', { hasText: '帕提亚战术' }).locator('input[type="checkbox"]')).not.toBeChecked();

  expect(errors).toEqual([]);
});
