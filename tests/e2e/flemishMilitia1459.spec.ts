import { expect, test, type Page } from '@playwright/test';

const errorsByPage = new WeakMap<Page, string[]>();

test.beforeEach(({ page }) => {
  const errors: string[] = [];
  errorsByPage.set(page, errors);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
});

test.afterEach(async ({ page }) => {
  expect(errorsByPage.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

function armyCostUrl(age: string) {
  const params = new URLSearchParams({
    mode: 'army-cost',
    acv: '1',
    acdata: '188329',
    civ: 'Burgundians',
    age,
    acunits: JSON.stringify([{ unit: 1699, qty: '10' }]),
    acdone: '[]',
    actargets: '[]',
  });
  return `./#/production?${params.toString()}`;
}

test('#1459 弗拉芒民兵（1699）在持续生产、训练总价与阵容新增费用全时代直训且无 755 虚增研究费', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  // 1. 持续生产：封建 16s、城堡/帝王 14s，无 755 也能直算
  await page.goto('./#/production?civ=Burgundians&age=2&walk=3&farm=1&rows=1699%3A12%3A2');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByTestId('production-row').first()).toContainText('16 秒 / 个');

  await page.goto('./#/production?civ=Burgundians&age=3&walk=3&farm=1&rows=1699%3A12%3A2');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByTestId('production-row').first()).toContainText('14 秒 / 个');
  await expect(page.getByTestId('production-row').first()).toContainText('城堡时代自动训练时间修正');

  // 旧链接含 techs=755 仍触发不可用科技报错
  await page.goto('./#/production?civ=Burgundians&age=4&techs=755&rows=1699%3A12%3A2');
  await expect(page.getByRole('alert')).toContainText('不可用的科技');

  // 2. 训练总价：城堡/帝王无弗拉芒革命解锁项，10 名直接计 350 食 250 金；旧 techs=755 报错
  for (const age of [2, 3, 4]) {
    await page.goto(`./#/production?mode=train-total&civ=Burgundians&age=${age}&units=1699%3A10`);
    await expect(page.getByRole('checkbox', { name: /弗拉芒革命/ })).toHaveCount(0);
    await expect(page.getByTestId('train-total-resource-Food')).toContainText('350');
    await expect(page.getByTestId('train-total-resource-Gold')).toContainText('250');
    await expect(page.getByTestId('train-total-result')).not.toContainText('部分训练费用');
  }
  await page.goto('./#/production?mode=train-total&civ=Burgundians&age=4&techs=755&units=1699%3A10');
  await expect(page.getByTestId('train-total-result')).toContainText('有科技在当前条件下不可用，已停止计入');
  await expect(page.locator('.train-total-techs')).toContainText('弗拉芒革命在当前条件下不可用，已停止计入');
  await page.getByTestId('train-total-result').getByRole('button', { name: '移除不可用科技', exact: true }).click();
  await expect(page.getByTestId('train-total-result')).not.toContainText('有科技在当前条件下不可用');

  // 3. 阵容新增费用：封建/城堡/帝王 10 名 1699 均为纯训练费 350 食 250 金，不自动塞入弗拉芒革命（755）
  for (const age of ['2', '3', '4']) {
    await page.goto(armyCostUrl(age));
    const resultsCard = page.locator('.army-results > .army-card').first();
    await expect(resultsCard.locator('h2')).toHaveText('本期新增费用合计');
    await expect(page.getByRole('heading', { name: '未计入清单' })).toHaveCount(0);
    await expect(page.locator('.army-ledger-entry').filter({ has: page.locator('h3', { hasText: '弗拉芒革命' }) })).toHaveCount(0);
    await expect(resultsCard).toContainText('350');
    await expect(resultsCard).toContainText('250');
    await expect(resultsCard).not.toContainText('560');
    await expect(resultsCard).not.toContainText('405');
  }
});

test('#1459 勃艮第兵营驻军预览与驻军回血在封建/城堡/帝王均支持 1699 留驻且旧 755 链接保持报错', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  // 1. 兵营驻军预览：封建/城堡/帝王均支持 1699:1:c，无弗拉芒革命勾选框
  const preview = page.getByTestId('garrison-preview');
  for (const age of [2, 3, 4]) {
    await page.goto(`./#/building/12?tab=garrison&gv=2&civ=Burgundians&age=${age}&gtechs=&army=1699%3A1%3Ac`);
    await expect(preview.getByRole('alert')).toHaveCount(0);
    await expect(preview.getByRole('checkbox', { name: '弗拉芒革命', exact: true })).toHaveCount(0);
  }
  // 旧链接含 gtechs=755 保持报错与移除恢复
  await page.goto('./#/building/12?tab=garrison&gv=2&civ=Burgundians&age=4&gtechs=755&army=1699%3A1%3Ac');
  await expect(preview.getByRole('alert')).toContainText('弗拉芒革命不可用或不影响驻军预览');
  await preview.getByRole('button', { name: '移除 弗拉芒革命' }).click();
  await expect(preview.getByRole('alert')).toHaveCount(0);

  // 2. 驻军回血：勃艮第兵营封建(40 HP)/城堡(55 HP)/帝王(60 HP) 均支持 1699 生产后留驻按 30 HP / 分钟计算
  for (const [age, maxHp, expectedSeconds] of [
    ['2', '40', '60 秒'],
    ['3', '55', '90 秒'],
    ['4', '60', '100 秒'],
  ] as const) {
    const params = new URLSearchParams({
      hv: '1',
      b: '12',
      civ: 'Burgundians',
      age,
      u: '1699',
      entry: 'created',
      techs: '',
      current: '10',
      target: maxHp,
    });
    await page.goto('./#/garrison-healing?' + params.toString());
    await expect(page.getByTestId('healing-result')).toHaveAttribute('data-status', 'valid');
    await expect(page.getByTestId('healing-max-hp')).toContainText(`${maxHp} HP`);
    await expect(page.getByTestId('healing-rate')).toHaveText('30 HP / 分钟');
    await expect(page.getByTestId('healing-seconds')).toHaveText(expectedSeconds);
  }

  // 旧链接含 techs=755 仍报错锁定
  const badHeal = new URLSearchParams({
    hv: '1',
    b: '12',
    civ: 'Burgundians',
    age: '4',
    u: '1699',
    entry: 'created',
    techs: '755',
    current: '10',
    target: '60',
  });
  await page.goto('./#/garrison-healing?' + badHeal.toString());
  await expect(page.getByRole('alert')).toContainText('弗拉芒革命');
});
