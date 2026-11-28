// #899 建筑详情。只覆盖规格点名的行为和 82/84/87 有限代表页，不是 38 座建筑验收，也不证明静态结构图。
import { expect, test, type Page } from '@playwright/test';

async function open(page: Page, hash: string) {
  await page.goto('./#' + hash);
  await expect(page.locator('#building h1')).toBeVisible();
}

async function setTheme(page: Page, value: 'light' | 'dark') {
  await page.evaluate((next) => localStorage.setItem('aoe2-theme', next), value);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', value);
}

test('默认未指定文明停在概览，无效文明不回退，仅文明不进模拟', async ({ page }) => {
  await open(page, '/building/82');
  await expect(page.locator('#building')).toHaveAttribute('data-view', 'overview');
  await expect(page.locator('#building-civ')).toHaveAttribute('data-value', '');
  await expect(page.locator('[data-t="civ-scope"]')).toContainText('全文明目录并集');
  await expect(page.locator('#sim')).toHaveCount(0);
  await expect(page.locator('[data-stat="hp"] [data-t="stat-value"]')).toHaveText('4800');
  await expect(page.locator('[data-t="catalog-cost"]')).toContainText('650');
  await expect(page.locator('[data-t="catalog-cost"] img[title="木材"]')).toHaveCount(0);
  await expect(page.locator('[data-t="panel-time"]')).toContainText('面板工期');
  await expect(page.locator('[data-t="panel-time"]')).toContainText('200秒');
  await expect(page.locator('[data-t="panel-time"]')).toContainText('不是多人施工里的村民工时');
  await expect(page.locator('[data-t="building-dlc"]')).toContainText('国王时代');
  await expect(page.locator('[data-t="building-dlc"]')).toContainText('1999');
  await expect(page.locator('[data-t="building-mark"]')).toHaveCount(0);
  await expect(page.locator('#building')).not.toContainText('文明独特');
  await expect(page.locator('#building')).not.toContainText('暂未计算');
  await expect(page.locator('#building')).not.toContainText('在现网打开');

  await open(page, '/building/82?civ=Britons');
  await expect(page.locator('#building')).toHaveAttribute('data-view', 'overview');
  await expect(page.locator('#sim')).toHaveCount(0);
  await expect(page.locator('[data-t="civ-scope"]')).toContainText('不是完整的科技树可用性');

  await open(page, '/building/1251?civ=Franks');
  await expect(page.locator('#building-civ')).toHaveAttribute('data-value', '');
  await expect(page.locator('#building h1')).toContainText('营垒');
  await expect(page.locator('[data-t="building-mark"]')).toHaveText('独特建筑');
  await expect(page.locator('#sim')).toHaveCount(0);

  await open(page, '/building/1251?civ=Franks&tab=sim');
  await expect(page.locator('[data-t="sim-needs-civ"]')).toBeVisible();
  await expect(page.locator('#sim .simtab')).toHaveCount(0);
  await expect(page).toHaveURL(/civ=Franks/);
  await expect(page.locator('#building')).not.toContainText('暂未计算');
});

test('生产研究使用动态并集，只看目录含有默认关闭', async ({ page }) => {
  await open(page, '/building/82');
  const count = page.locator('#building-prod [data-t="catalog-count"]');
  await expect(count).toContainText('并集');
  await expect(count).toContainText('当前显示');
  const union = await count.locator('.num').first().innerText();
  expect(Number(union)).toBeGreaterThan(0);
  expect(Number(union)).not.toBe(118);
  await expect(page.locator('#building-prod input[type="checkbox"]')).not.toBeChecked();
  await expect(page.locator('#building-prod [data-t="catalog-unknown"]')).toHaveCount(0);

  await open(page, '/building/87?civ=Franks');
  const range = page.locator('#building-prod [data-t="catalog-count"] .num').first();
  const rangeUnion = Number(await range.innerText());
  expect(rangeUnion).not.toBe(20);
  const genitour = page.locator('#building-prod a.ulink', { hasText: '标枪骑兵' });
  await expect(page.locator('#building-prod').getByRole('link', { name: '步弓手', exact: true })).toBeVisible();
  await expect(genitour).toBeVisible();
  await page.locator('#building-prod').getByRole('checkbox', { name: '只看目录含有' }).check();
  await expect(page.locator('#building-prod').getByRole('link', { name: '步弓手', exact: true })).toBeVisible();
  await expect(genitour).toHaveCount(0);
  await expect(page.locator('#building-prod [data-t="catalog-row"][data-membership="out"]')).toHaveCount(0);
  await expect(page.locator('#building-prod [data-t="catalog-row"][data-membership="unknown"]')).toHaveCount(0);
  const shown = Number(await page.locator('#building-prod [data-t="catalog-count"] .num').nth(1).innerText());
  expect(shown).toBeLessThan(rangeUnion);
  await page.locator('#building-prod').getByRole('checkbox', { name: '只看目录含有' }).uncheck();
  await page.locator('#building-prod input[type="search"]').fill('qishe');
  await expect(page.locator('#building-prod').getByRole('link', { name: '骑射手', exact: true })).toBeVisible();
  await expect(page.locator('#building-prod').getByRole('link', { name: '步弓手', exact: true })).toHaveCount(0);

  await page.locator('#building-civ').click();
  await expect.poll(async () => page.locator('.cp-panel [role="option"]').count()).toBeGreaterThan(40);
  await page.keyboard.press('Escape');
});

test('施工入口、攻击组和官方区域标记', async ({ page }) => {
  await open(page, '/building/82');
  await expect(page.locator('[data-t="construction-note"]')).toHaveCount(0);
  await expect(page.locator('[data-t="construction-needs-civ"]')).toHaveText('先选择文明。');
  await expect(page.locator('[data-t="panel-time"]')).not.toContainText('预填目录时代');
  await expect(page.locator('[data-t="construction-entry"]')).toHaveCount(0);
  await expect(page.locator('[data-stat="atk"]')).toContainText('11');
  await expect(page.locator('[data-stat="rng"]')).toContainText('最小射程');
  await expect(page.locator('[data-stat="rng"]')).toContainText('1');
  await expect(page.getByTestId('building-siege-entry')).toBeVisible();

  await page.locator('#building-civ').click();
  await page.locator('.cp-panel .cp-q').fill('Franks');
  await page.locator('.cp-panel [data-civ="Franks"]').click();
  await expect(page.locator('[data-t="construction-entry-block"] [data-t="construction-note"]')).toHaveText('预填目录时代，非解锁条件。');
  const href = await page.locator('[data-t="construction-entry"]').getAttribute('href');
  expect(href).toContain('cv=1');
  expect(href).toContain('civ=Franks');
  expect(href).toContain('building=82');
  expect(href).toContain('age=3');
  expect(href).toContain('builders=4');
  expect(href).not.toContain('civ=Armenians');

  await open(page, '/building/84');
  await expect(page.locator('[data-stat="atk"]')).toHaveCount(0);
  await expect(page.locator('[data-stat="ma"]')).toContainText('1');
  await expect(page.locator('[data-stat="pa"]')).toContainText('8');
  await expect(page.locator('[data-t="market-fees"]')).toBeVisible();
  await expect(page.getByTestId('building-siege-entry')).toHaveCount(0);
  await expect(page.locator('[data-t="building-mark"]')).toHaveCount(0);

  await open(page, '/building/12');
  await expect(page.locator('[data-stat="atk"]')).toHaveCount(0);
  await expect(page.locator('[data-stat="ma"]')).toContainText('0');
  await expect(page.locator('[data-stat="hp"] [data-t="stat-value"]')).toHaveText('1200');

  await open(page, '/building/109');
  await expect(page.locator('[data-stat="atk"]')).toBeVisible();
  await expect(page.locator('[data-stat="rng"]')).toContainText('最小射程');
  await expect(page.locator('[data-stat="rng"]')).toContainText('0');

  await open(page, '/building/1665');
  await expect(page.locator('[data-stat="atk"]')).toContainText('0');
  await expect(page.locator('[data-stat="rng"]')).toBeVisible();
  await expect(page.locator('[data-stat="rof"]')).toBeVisible();

  await open(page, '/building/1754');
  await expect(page.locator('[data-t="building-mark"]')).toHaveText('区域建筑');
});

test('旧查询定位到概览，工作区保留参数，非宿主驻军回到概览', async ({ page }) => {
  await open(page, '/building/87?tab=prod&age=2&techs=437&cmp=Britons');
  const header = await page.locator('header.topbar').boundingBox();
  const title = await page.locator('#building-prod h2').boundingBox();
  expect(title!.y).toBeGreaterThanOrEqual(header!.y + header!.height - 1);
  await expect(page.locator('#building')).toHaveAttribute('data-view', 'overview');

  await page.getByRole('button', { name: '打开科技模拟器', exact: true }).click();
  await expect(page).toHaveURL(/tab=sim/);
  await expect(page).toHaveURL(/age=2/);
  await expect(page).toHaveURL(/techs=437/);
  await expect(page).toHaveURL(/cmp=Britons/);
  await expect(page.locator('[data-t="sim-needs-civ"]')).toBeVisible();
  await page.getByRole('button', { name: '返回概览', exact: true }).click();
  await expect(page).toHaveURL(/tab=ov/);
  await expect(page).toHaveURL(/techs=437/);
  await expect(page).toHaveURL(/cmp=Britons/);

  await open(page, '/building/87?tab=tech&civ=Britons&age=2&techs=437&cmp=Franks');
  await expect(page.locator('#building-tech h2')).toBeInViewport();
  await page.getByRole('button', { name: '打开科技模拟器', exact: true }).click();
  await expect(page.locator('#simciv')).toHaveAttribute('data-value', 'Britons');
  await expect(page.locator('#simage')).toHaveValue('2');
  await expect(page.locator('[data-t="sim-headings"]')).toContainText('当前设置下的近似模拟值');
  await expect(page.locator('.simtab th').nth(1)).toHaveText('目录基础');
  await expect(page.locator('.simtab th').nth(2)).toHaveText('当前设置下的近似模拟值');

  await open(page, '/building/82?tab=history');
  await expect(page.locator('#building')).toHaveAttribute('data-view', 'overview');
  await expect(page.locator('#building-history')).toHaveJSProperty('open', true);
  await expect(page.getByRole('tab', { name: '更新历史' })).toHaveCount(0);
  const history = await page.locator('#building-history').boundingBox();
  const bar = await page.locator('header.topbar').boundingBox();
  expect(history!.y).toBeGreaterThanOrEqual(bar!.y + bar!.height - 1);

  await open(page, '/building/103?tab=garrison&age=2&techs=1&cmp=Britons');
  await expect(page).toHaveURL(/tab=ov/);
  await expect(page).toHaveURL(/age=2/);
  await expect(page).toHaveURL(/techs=1/);
  await expect(page).toHaveURL(/cmp=Britons/);
  await expect(page.locator('#building-garrison')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '配置驻军预览', exact: true })).toHaveCount(0);
});

test('已选文明时模拟器给出引擎结果，驻军不是空页', async ({ page }) => {
  await open(page, '/building/82?tab=sim&civ=Britons');
  await expect(page.locator('#sim .simtab')).toBeVisible();
  await expect(page.locator('#building')).not.toContainText('暂未计算');
  await page.getByRole('button', { name: '满科技' }).click();
  await expect(page.locator('.simtab tr').nth(1).locator('td').nth(2)).toHaveText('7027.68');
  await expect(page).toHaveURL(/civ=Britons/);
  await expect(page).toHaveURL(/techs=\d/);

  await open(page, '/building/109?tab=garrison&civ=Britons&age=4');
  await expect(page.getByTestId('garrison-result')).toBeVisible();
  await expect(page.locator('#building')).not.toContainText('暂未计算');
});

test('#1453 建筑科技模拟器继承目录基础类别加成并精确计算加热射击', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  // 大型箭塔 235（中国 + 加热射击 380）：船只 8 +10 → 18，保留长矛兵 2、骆驼 1，过滤显式 0 所有建筑
  await open(page, '/building/235?civ=Chinese&age=4&tab=sim&techs=380');
  const keepRows = page.locator('#sim .bonustab tbody tr');
  await expect(keepRows).toHaveCount(4);
  await expect(keepRows.nth(1)).toContainText('对 长矛兵');
  await expect(keepRows.nth(1).locator('td').nth(2)).toHaveText('2');
  await expect(keepRows.nth(2)).toContainText('对 船只');
  await expect(keepRows.nth(2).locator('td').nth(1)).toContainText('8');
  await expect(keepRows.nth(2).locator('td').nth(1)).toContainText('+10');
  await expect(keepRows.nth(2).locator('td').nth(2)).toHaveText('18');
  await expect(keepRows.nth(3)).toContainText('对 骆驼');
  await expect(keepRows.nth(3).locator('td').nth(2)).toHaveText('1');
  await expect(page.locator('#sim .bonustab')).not.toContainText('所有建筑');

  // 炮塔 236（中国 + 加热射击 380）：船只 40 +50 → 90，保留骆驼 1
  await open(page, '/building/236?civ=Chinese&age=4&tab=sim&techs=380');
  const bbtRows = page.locator('#sim .bonustab tbody tr');
  await expect(bbtRows).toHaveCount(3);
  await expect(bbtRows.nth(1)).toContainText('对 船只');
  await expect(bbtRows.nth(1).locator('td').nth(1)).toContainText('40');
  await expect(bbtRows.nth(1).locator('td').nth(1)).toContainText('+50');
  await expect(bbtRows.nth(1).locator('td').nth(2)).toHaveText('90');
  await expect(bbtRows.nth(2)).toContainText('对 骆驼');
  await expect(bbtRows.nth(2).locator('td').nth(2)).toHaveText('1');

  // 马来巨港 1189（加热射击 380 + 帝王 Tech 103 对船 +1，Issue 1518）：船只 3 +5 → 8，保留骆驼 1
  await open(page, '/building/1189?civ=Malay&age=4&tab=sim&techs=380');
  const harborRows = page.locator('#sim .bonustab tbody tr');
  await expect(harborRows).toHaveCount(3);
  await expect(harborRows.nth(1)).toContainText('对 船只');
  await expect(harborRows.nth(1).locator('td').nth(1)).toContainText('3');
  await expect(harborRows.nth(1).locator('td').nth(1)).toContainText('+5');
  await expect(harborRows.nth(1).locator('td').nth(2)).toHaveText('8');
  await expect(harborRows.nth(2)).toContainText('对 骆驼');
  await expect(harborRows.nth(2).locator('td').nth(2)).toHaveText('1');

  // 城堡 82（中国）：勾 380 保留长矛兵 2 且船只 0 +4 → 4；未勾 380 过滤显式 0 船只
  await open(page, '/building/82?civ=Chinese&age=4&tab=sim&techs=380');
  const castleRows = page.locator('#sim .bonustab tbody tr');
  await expect(castleRows).toHaveCount(3);
  await expect(castleRows.nth(1)).toContainText('对 长矛兵');
  await expect(castleRows.nth(1).locator('td').nth(2)).toHaveText('2');
  await expect(castleRows.nth(2)).toContainText('对 船只');
  await expect(castleRows.nth(2).locator('td').nth(1)).toContainText('0');
  await expect(castleRows.nth(2).locator('td').nth(1)).toContainText('+4');
  await expect(castleRows.nth(2).locator('td').nth(2)).toHaveText('4');
  await expect(page.locator('#sim .bonustab')).not.toContainText('冲车');

  await open(page, '/building/82?civ=Chinese&age=4&tab=sim');
  await expect(page.locator('#sim .bonustab tbody tr')).toHaveCount(2);
  await expect(page.locator('#sim .bonustab')).toContainText('对 长矛兵');
  await expect(page.locator('#sim .bonustab')).not.toContainText('对 船只');

  // Issue 1518：1665 城楼帝王勾选 380 叠 Tech 101 生效（长矛兵 2、船只 6 × 2.25 = 13.5、骆驼 1，过滤显式 0 所有建筑）
  await open(page, '/building/1665?civ=Sicilians&age=4&tab=sim&techs=380');
  const donjonRows = page.locator('#sim .bonustab tbody tr');
  await expect(donjonRows).toHaveCount(4);
  await expect(donjonRows.nth(1)).toContainText('对 长矛兵');
  await expect(donjonRows.nth(1).locator('td').nth(2)).toHaveText('2');
  await expect(donjonRows.nth(2)).toContainText('对 船只');
  await expect(donjonRows.nth(2).locator('td').nth(1)).toContainText('0');
  await expect(donjonRows.nth(2).locator('td').nth(1)).toContainText('+13.5');
  await expect(donjonRows.nth(2).locator('td').nth(2)).toHaveText('13.5');
  await expect(donjonRows.nth(3)).toContainText('对 骆驼');
  await expect(donjonRows.nth(3).locator('td').nth(2)).toHaveText('1');
  await expect(page.locator('#sim .bonustab')).not.toContainText('所有建筑');

  // 黑暗时代反例：age=1（minAge=1 未被钳制）经 UI 过滤超时代 380 且未触发 Tech 101，城楼无时代加成显示「无」（纯函数 0 × 2.25 = 0 无 NaN 由 buildingSim.test.ts 覆盖）
  await open(page, '/building/1665?civ=Sicilians&age=1&tab=sim&techs=380');
  await expect(page.locator('#sim .bonustab')).toHaveCount(0);
  await expect(page.locator('#sim .bonusbox')).toContainText('无');

  // 大型箭塔 235 各文明满科技对照：日本缺加热射击，中国不缺
  await open(page, '/building/235');
  const rank = page.locator('#building-civ-rank');
  await rank.scrollIntoViewIfNeeded();
  await expect(rank.locator('tr[data-civ="Chinese"]')).not.toContainText('加热射击');
  await rank.locator('#bcr-search').fill('日本');
  await expect(rank.locator('tr[data-civ="Japanese"]')).toContainText('加热射击');
  expect(errors).toEqual([]);
});

test('#1219 炮塔攻击与船只和骆驼加成分别显示，空表和零各自保留', async ({ page }) => {
  const attacks = page.getByRole('region', { name: '攻击明细' });
  await open(page, '/building/236');
  await expect(page.locator('#building-civ')).toHaveAttribute('data-value', '');
  await expect(attacks.locator('.bd-attack-base')).toHaveText('基础穿刺攻击120');
  await expect(attacks.locator('.bd-attack-targets > div')).toHaveText(['船只+40', '骆驼+1']);
  await expect(attacks).not.toContainText('+120');
  await expect(attacks).not.toContainText('雇佣兵');
  await expect(attacks).toContainText('类别加成不是实际伤害');
  await expect(page.locator('.bd-stat-grid [data-stat="atk"]')).toHaveCount(0);
  const base = await attacks.locator('.bd-attack-base').boundingBox();
  const extra = await attacks.locator('.bd-attack-targets').boundingBox();
  expect(base!.x + base!.width).toBeLessThan(extra!.x);

  await open(page, '/building/12');
  await expect(attacks).toContainText('目录未列出攻击项');
  await expect(attacks.locator('dd')).toHaveCount(0);
  await open(page, '/building/109');
  await expect(attacks.locator('.bd-attack-base')).toHaveText('基础穿刺攻击5');
  await expect(attacks).toContainText('仅有基础攻击');
  await expect(attacks.locator('.bd-attack-targets')).toHaveCount(0);
  await open(page, '/building/1665');
  await expect(attacks.locator('.bd-attack-base')).toHaveText('基础穿刺攻击0');
  await expect(attacks).toContainText('额外类别值均为 0');
  await expect(attacks.locator('.bd-attack-targets')).toHaveCount(0);
});

test('#1219 窄屏选中国后三阶箭塔保留目录数值与单列布局', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('aoe2-theme', 'dark'));
  const attacks = page.getByRole('region', { name: '攻击明细' });
  for (const [id, range] of [
    [79, 5],
    [234, 7],
    [235, 8],
  ]) {
    await open(page, `/building/${id}?civ=Chinese`);
    await expect(page.locator('#building-civ')).toHaveAttribute('data-value', 'Chinese');
    await expect(page.locator('#building-core')).toContainText('目录基础值，不随所选文明变化，未计文明加成与科技');
    await expect(attacks.locator('.bd-attack-base')).toHaveText(`基础穿刺攻击${range}`);
    await expect(attacks.locator('.bd-attack-targets > div')).toHaveText(['长矛兵+2', `船只+${range}`, '骆驼+1']);
    const base = await attacks.locator('.bd-attack-base').boundingBox();
    const extra = await attacks.locator('.bd-attack-targets').boundingBox();
    expect(base!.x).toBe(extra!.x);
    expect(base!.y + base!.height).toBeLessThan(extra!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  }
});

test('1280 浅色深色和 390 只看城堡市场靶场的代表页', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const mode of ['light', 'dark'] as const) {
    for (const id of [82, 84, 87]) {
      await open(page, `/building/${id}`);
      await setTheme(page, mode);
      const hp = await page.locator('[data-stat="hp"]').boundingBox();
      const cost = await page.locator('[data-t="catalog-cost"]').boundingBox();
      expect(hp!.y).toBeLessThan(900);
      expect(cost!.y).toBeLessThan(900);
      await page.screenshot({ path: testInfo.outputPath(`${id}-1280-${mode}.png`), fullPage: false });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const id of [82, 84, 87]) {
    await open(page, `/building/${id}`);
    await setTheme(page, 'light');
    const hp = await page.locator('[data-stat="hp"]').boundingBox();
    expect(hp!.y).toBeLessThan(844);
    await expect(page.locator('.bd-jump')).toBeHidden();
    await page.screenshot({ path: testInfo.outputPath(`${id}-390-light.png`), fullPage: false });
  }
});
