import { expect, test, type Locator } from '@playwright/test';

async function ensureDetailsOpen(details: Locator) {
  await expect(details).toBeVisible();
  if (!(await details.evaluate((el) => (el as HTMLDetailsElement).open))) await details.locator('summary').click();
}

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

test('#1325 回归：切文明过滤超时代显式科技不污染混编、帝王态提前解锁单位显示城堡预设且各时代对比不降级', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.setViewportSize({ width: 1280, height: 900 });

  // 1. P1-1：城堡时代波希米亚步弓手手动勾选化学（47）→ 切到不列颠后自动移除化学，不残留 +1 攻击，切入混编无「高于本方时代」报错
  await page.goto('./#/duel?a=4.Bohemians.3..&b=4.Britons.3..&m=1');
  await ensureDetailsOpen(page.locator('#duel-a details.duel-tech'));
  const chemA = page.locator('#duel-a details.duel-tech label', { hasText: '化学' }).locator('input[type="checkbox"]');
  await chemA.check();
  await expect(chemA).toBeChecked();
  await expect(page.locator('#duel-a .duel-age')).toHaveText('城堡时代');
  await expect(page.locator('#duel-a .duel-stats')).toContainText('5（穿刺）');
  await expect(page.locator('#duel-b .duel-stats')).toContainText('4（穿刺）');

  await page.locator('#duel-a-civ').click();
  await page.getByRole('dialog', { name: 'A 方文明', exact: true }).locator('[data-civ="Britons"]').click();
  await expect(page.locator('#duel-a')).toContainText('不列颠');
  await expect(page.locator('#duel-a .duel-age')).toHaveText('城堡时代');
  await expect(page.locator('#duel-a .duel-stats')).toContainText('4（穿刺）');
  await expect(page.locator('#duel-a details.duel-tech label', { hasText: '化学' }).locator('input[type="checkbox"]')).not.toBeChecked();
  const hashQuery = new URLSearchParams(page.url().slice(page.url().indexOf('?') + 1));
  expect(hashQuery.get('a')).toBe('4.Britons.3..');

  await page.getByRole('radiogroup', { name: '模式', exact: true }).getByRole('radio', { name: '混编', exact: true }).click();
  await expect(page.getByTestId('mixed-duel')).toBeVisible();
  await expect(page.getByRole('alert', { name: '配置错误' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '计算混编结果', exact: true })).toBeEnabled();

  // 直接打开带超时代显式科技的链接（不列颠城堡步弓手带化学 47），也不应生效或带坏混编
  await page.goto('./#/duel?a=4.Britons.3.47.&b=4.Britons.3..&m=1');
  await expect(page.locator('#duel-a .duel-stats')).toContainText('4（穿刺）');
  await ensureDetailsOpen(page.locator('#duel-a details.duel-tech'));
  await expect(page.locator('#duel-a details.duel-tech label', { hasText: '化学' }).locator('input[type="checkbox"]')).not.toBeChecked();

  // 2. P2-1 + P1-3：帝王时代查看契丹重装骑射手（474）与亚美尼亚冠军剑士（567）时，内嵌科技面板展示「城堡预设」，各时代对比城堡行不回溯低级单位
  await page.goto('./#/duel?a=474.Khitans.4..&b=567.Armenians.4..&m=1');
  await expect(page.locator('#duel-a')).toContainText('契丹');
  await ensureDetailsOpen(page.locator('#duel-a details.duel-tech'));
  await ensureDetailsOpen(page.locator('#duel-b details.duel-tech'));
  const castlePresetA = page.locator('#duel-a details.duel-tech').getByRole('button', { name: '城堡预设', exact: true });
  const castlePresetB = page.locator('#duel-b details.duel-tech').getByRole('button', { name: '城堡预设', exact: true });
  await expect(castlePresetA).toBeVisible();
  await expect(castlePresetB).toBeVisible();

  await ensureDetailsOpen(page.locator('[data-t="age-comparison"]'));
  const castleSection = page.locator('[data-t="age-comparison"] section[aria-label="城堡时代对比"]');
  await expect(castleSection).toContainText('A · 重装骑射手');
  await expect(castleSection).toContainText('B · 冠军剑士');
  await expect(castleSection.getByRole('link', { name: '打开城堡时代对阵' })).toHaveAttribute('href', /a=474\.Khitans\.3\.f\..*b=567\.Armenians\.3\.f\./);

  await castlePresetA.click();
  await expect(page.locator('#duel-a .duel-age')).toHaveText('城堡时代');
  await expect(page.locator('#duel-a-age')).toHaveValue('3');

  // 对照：匈奴重装骑射手在帝王时代不应显示「城堡预设」
  await page.goto('./#/duel?a=474.Huns.4..&b=567.Japanese.4..&m=1');
  await expect(page.locator('#duel-a')).toContainText('匈奴');
  await ensureDetailsOpen(page.locator('#duel-a details.duel-tech'));
  await expect(page.locator('#duel-a details.duel-tech').getByRole('button', { name: '帝王预设', exact: true })).toBeVisible();
  await expect(page.locator('#duel-a details.duel-tech').getByRole('button', { name: '城堡预设', exact: true })).toHaveCount(0);

  expect(errors).toEqual([]);
});

test('#1325 回归：Side 与 UnavailSide 切文明按目标文明解析时代裁剪显式科技，不破坏升级对比且不复活旧科技', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.setViewportSize({ width: 1280, height: 900 });

  const hashA = () => new URLSearchParams(page.url().slice(page.url().indexOf('?') + 1)).get('a');

  // 路径 A（Side.onCivChange）：城堡波斯骑射手（39）勾帕提亚战术（436）→ 选重装骑射手（474，抬升至帝王）→ 切契丹回到城堡且裁剪 436
  await page.goto('./#/duel?a=39.Persians.3..&b=4.Britons.3..&m=1');
  await ensureDetailsOpen(page.locator('#duel-a details.duel-tech'));
  await page.locator('#duel-a details.duel-tech label', { hasText: '帕提亚战术' }).locator('input[type="checkbox"]').check();
  expect(hashA()).toBe('39.Persians.3.436.');

  await page.locator('#duel-a-unit').click();
  const unitDialogA = page.getByRole('dialog', { name: 'A 方单位', exact: true });
  await unitDialogA.getByRole('combobox').fill('Heavy Cavalry Archer');
  await unitDialogA.locator('[data-unit="474"]').click();
  await expect(page.locator('#duel-a .duel-age')).toHaveText('帝王时代');
  expect(hashA()).toBe('474.Persians.3.436.');

  await page.locator('#duel-a-civ').click();
  await page.getByRole('dialog', { name: 'A 方文明', exact: true }).locator('[data-civ="Khitans"]').click();
  await expect(page.locator('#duel-a')).toContainText('契丹');
  await expect(page.locator('#duel-a .duel-age')).toHaveText('城堡时代');
  await expect(page.locator('#duel-a-age')).toHaveValue('3');
  expect(hashA()).toBe('474.Khitans.3..');
  await expect(page.locator('#duel-a').getByRole('radio', { name: '无科技', exact: true })).toHaveAttribute('aria-checked', 'true');

  const upgradePanel = page.locator('[data-t="upgrade-comparison"]');
  await ensureDetailsOpen(upgradePanel);
  const saveBtn = upgradePanel.getByRole('button', { name: '保存为升级前', exact: true });
  await expect(saveBtn).toBeEnabled();
  await saveBtn.click();
  await expect(upgradePanel).toContainText('尚无科技变化');
  await upgradePanel.getByRole('button', { name: '清除比较', exact: true }).click();

  // 随后升帝王不会幽灵复活帕提亚战术（436）
  await page.locator('#duel-a-age').selectOption('4');
  await expect(page.locator('#duel-a .duel-age')).toHaveText('帝王时代');
  await ensureDetailsOpen(page.locator('#duel-a details.duel-tech'));
  await expect(page.locator('#duel-a details.duel-tech label', { hasText: '帕提亚战术' }).locator('input[type="checkbox"]')).not.toBeChecked();
  expect(hashA()).toBe('474.Khitans.4..');

  // 路径 B（UnavailSide 切文明）：城堡波希米亚步弓手（4）勾化学（47）→ 选波希米亚不可造的重装骑射手（474）→ 点「换个文明」切契丹
  await page.goto('./#/duel?a=4.Bohemians.3..&b=4.Britons.3..&m=1');
  await ensureDetailsOpen(page.locator('#duel-a details.duel-tech'));
  await page.locator('#duel-a details.duel-tech label', { hasText: '化学' }).locator('input[type="checkbox"]').check();
  expect(hashA()).toBe('4.Bohemians.3.47.');

  await page.locator('#duel-a-unit').click();
  const unitDialogB = page.getByRole('dialog', { name: 'A 方单位', exact: true });
  await unitDialogB.getByRole('combobox').fill('Heavy Cavalry Archer');
  await unitDialogB.locator('[data-unit="474"]').click();
  await expect(page.locator('#duel-a[data-unavailable="true"]')).toBeVisible();
  expect(hashA()).toBe('474.Bohemians.3.47.');

  await page.locator('#duel-a').getByRole('button', { name: '换个文明', exact: true }).click();
  await page.getByRole('dialog', { name: 'A 方文明', exact: true }).locator('[data-civ="Khitans"]').click();
  await expect(page.locator('#duel-a[data-unavailable="true"]')).toHaveCount(0);
  await expect(page.locator('#duel-a')).toContainText('契丹');
  await expect(page.locator('#duel-a .duel-age')).toHaveText('城堡时代');
  await expect(page.locator('#duel-a-age')).toHaveValue('3');
  expect(hashA()).toBe('474.Khitans.3..');
  await expect(page.locator('#duel-a').getByRole('radio', { name: '无科技', exact: true })).toHaveAttribute('aria-checked', 'true');

  await ensureDetailsOpen(upgradePanel);
  await expect(upgradePanel.getByRole('button', { name: '保存为升级前', exact: true })).toBeEnabled();

  expect(errors).toEqual([]);
});
