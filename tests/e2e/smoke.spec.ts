import { expect, test, type Page } from '@playwright/test';

/** CivPicker 选择助手：打开选择器、搜索英文名并点击对应选项 */
async function pickCiv(page: Page, id: string, en: string) {
  await page.locator('#' + id).click();
  await page.locator('.cp-panel .cp-q').fill(en);
  await page.locator(`.cp-panel [role="option"][data-civ="${en}"]`).click();
  await expect(page.locator('#' + id)).toHaveAttribute('data-value', en);
}

// 旧版 hash（无前导 /）与新版 hash 都必须可用
const ROUTES: [string, string][] = [
  ['', '#home .hcard'],
  ['#civs', '#grid .card'],
  ['#simulator', '#simhub .card'],
  ['#buildings', '#bgrid .card'],
  ['#/building/82', '#building h2'],
  ['#building/1251', '#building h2'],
  ['#builds', '.planned-page'],
  ['#list', '#grid .card'],
  ['#civ/Armenians', '#detail h2'],
  ['#/civ/Franks', '#detail h2'],
  ['#units', '#ugrid .card'],
  ['#unit/569', '#unit .dtabs'],
  ['#unit/569?tab=sim', '#sim .simt'],
  ['#unit/569/Franks/4', '#sim .simtab'],
  ['#techs', '#tgrid .card'],
  ['#tech/12', '#tech h2'],
  ['#tree', '.tree .tcell'],
  ['#tree/Britons', '.tree .tcell'],
  ['#dlc', '.dlct tr'],
  ['#compare', '#ctab tr'],
  ['#matchup', '#mres h3'],
  ['#/duel', '#duel-res h3'],
  ['#/bonuses', '#blist li'],
  ['#/civ/Franks/bonus/2', '#bonus h2'],
];

for (const [hash, sel] of ROUTES) {
  test(`route ${hash || '(home)'} renders without console errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(hash ? './' + hash : './');
    await expect(page.locator(sel).first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(errors).toEqual([]);
  });
}

test('Franks Paladin full tech = 192 HP', async ({ page }) => {
  await page.goto('./#unit/569/Franks');
  await page.getByRole('button', { name: '满科技' }).click();
  const hp = page.locator('.simtab tr').nth(1).locator('td');
  await expect(hp.nth(1)).toHaveText(/^160\s*\+32$/); // 基础列：基础值 + 绿色增量
  await expect(hp.nth(1).locator('.up')).toHaveText('+32');
  await expect(hp.nth(2)).toHaveText('192'); // 当前列：仅最终值
  await expect(page).toHaveURL(/unit\/569\/Franks\/4\/[\d,]+/);
});

test('civ card click opens detail, unique unit link opens unit page', async ({ page }) => {
  await page.goto('./#list');
  await page.locator('#grid .card', { hasText: 'Armenians' }).click();
  await expect(page.locator('#detail h2')).toContainText('Armenians');
  await page.locator('#detail .uchips a').first().click();
  await expect(page.locator('#unit h2')).toBeVisible();
});

test('unit tabs: overview -> simulator tab', async ({ page }) => {
  await page.goto('./#unit/569');
  await page.getByRole('tab', { name: '科技模拟器' }).click();
  await expect(page.locator('#sim .simt').first()).toBeVisible();
});

test('Ctrl+K command palette searches across civs/units/techs', async ({ page }) => {
  await page.goto('./');
  await page.locator('#home').waitFor();
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/搜索文明、单位、科技/).fill('paladin');
  await expect(page.locator('.cmdk-list li').first()).toContainText('Paladin');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/unit\/569/);
});

test('breadcrumbs on detail pages', async ({ page }) => {
  await page.goto('./#tech/12');
  await expect(page.locator('nav.crumbs')).toContainText('科技');
  await page.locator('nav.crumbs a', { hasText: '科技' }).click();
  await expect(page.locator('#tgrid .card').first()).toBeVisible();
});

test('mobile nav opens and navigates', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await expect(page.locator('nav.mainnav')).toBeHidden();
  await page.getByRole('button', { name: '菜单' }).click();
  await page.locator('nav.mainnav a', { hasText: '对局助手' }).click();
  await expect(page.locator('#mres h3')).toBeVisible();
  await expect(page.locator('nav.mainnav')).toBeHidden();
});

test('leaving a tech detail page does not crash (regression)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('./#tech/12');
  await expect(page.locator('#tech h2')).toBeVisible();
  await page.locator('nav.mainnav a[data-t="units"]').click();
  await expect(page.locator('#ugrid .card').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('building detail tabs + links from tree and unit page', async ({ page }) => {
  await page.goto('./#/building/82');
  await expect(page.locator('#building h2')).toContainText('Castle');
  await page.getByRole('tab', { name: /生产/ }).click();
  await expect(page.locator('#building .uqrow').first()).toBeVisible();
  await page.goto('./#tree/Franks');
  await page.locator('a.tbld').first().click();
  await expect(page.locator('#building h2')).toBeVisible();
  await page.goto('./#unit/569');
  await page.locator('#unit a.tagl').first().click();
  await expect(page.locator('#building h2')).toContainText('Stable');
});

test('buildings list filters by type', async ({ page }) => {
  await page.goto('./#buildings');
  await page.locator('#bt').selectOption('defense');
  await expect(page.locator('#bgrid .card', { hasText: 'Keep' })).toBeVisible();
  await expect(page.locator('#bgrid .card', { hasText: 'Barracks' })).toHaveCount(0);
});

test('building simulator: Britons Castle full tech, URL state', async ({ page }) => {
  await page.goto('./#/building/82?tab=sim&civ=Britons');
  await page.getByRole('button', { name: '满科技' }).click();
  const hp = page.locator('.simtab tr').nth(1).locator('td');
  await expect(hp.nth(1)).toHaveText(/^4800\s*\+2228$/);
  await expect(hp.nth(2)).toHaveText('7028');
  await expect(page).toHaveURL(/civ=Britons.*techs=\d/);
  await page.reload();
  await expect(page.locator('.simtab tr').nth(1).locator('td').nth(2)).toHaveText('7028');
  await pickCiv(page, 'simcmp', 'Byzantines');
  await expect(page.locator('.simtab th').nth(3)).toContainText('拜占庭');
});

test('building simulator: prerequisite chain (Bracer selects Fletching + Bodkin)', async ({ page }) => {
  await page.goto('./#/building/82?tab=sim&civ=Britons');
  await page.locator('label.simt', { hasText: '护腕' }).locator('input').check();
  await expect(page.locator('label.simt.on')).toHaveCount(3);
});

test('bonus damage is a separate section from self stats (unit + building sim)', async ({ page }) => {
  await page.goto('./#/building/82?tab=sim&civ=Britons');
  await page.getByRole('button', { name: '满科技' }).click();
  await expect(page.locator('.simtab')).not.toContainText('加成');
  const bt = page.locator('#sim .bonustab');
  await expect(bt.locator('tr', { hasText: '船只' }).locator('td').nth(1)).toHaveText(/^0\s*\+4$/);
  await expect(bt.locator('tr', { hasText: '船只' }).locator('td').nth(2)).toHaveText('4');
  await page.goto('./#/unit/569/Franks');
  await expect(page.locator('#sim')).toContainText('克制加成');
  await expect(page.locator('#sim')).toContainText('护甲类别（防御）');
  await expect(page.locator('.simtab')).not.toContainText('加成');
});

test('tech affects tab: Bracer lists archers + Keep; civ filter narrows', async ({ page }) => {
  await page.goto('./#/tech/201');
  await page.locator('.dtabs').getByText('作用对象').click();
  await expect(page.locator('#affects')).toContainText('弓兵');
  await expect(page.locator('#affects a[href*="building/"]').first()).toBeVisible();
  const all = await page.locator('#affects .affrow a').count();
  await pickCiv(page, 'affciv', 'Britons');
  await expect.poll(() => page.locator('#affects .affrow a').count()).toBeLessThan(all);
  await page.goto('./#/tech/435');
  await page.locator('.dtabs').getByText('作用对象').click();
  await expect(page.locator('#affects')).toContainText('骑兵');
  await expect(page.locator('#affects h4', { hasText: '步兵' })).toHaveCount(0);
});

test('elite dedup: civ chips, unit list, toggle keeps URL working', async ({ page }) => {
  await page.goto('./#/civ/Vikings');
  const chips = page.locator('.dside .uchips a');
  await expect(chips).toHaveCount(1);
  await expect(chips.first()).toContainText('精锐');
  await page.goto('./#/units');
  await page.locator('#uq').fill('掷斧');
  await expect(page.locator('#ugrid .card')).toHaveCount(1);
  // 旧的精锐链接仍可打开，并选中“精锐”
  await page.goto('./#/unit/531');
  await expect(page.locator('#unit h2')).toContainText('精锐掷斧兵');
  await expect(page.locator('.eseg a.on')).toHaveText('精锐');
  await expect(page.locator('#ediff')).toContainText('850');
  await page.locator('.eseg a', { hasText: '普通' }).click();
  await expect(page).toHaveURL(/#\/unit\/281$/);
  await expect(page.locator('#unit h2')).not.toContainText('精锐');
});

test('elite toggle preserves simulator state', async ({ page }) => {
  await page.goto('./#/unit/281/Franks/4');
  await page.locator('.eseg a', { hasText: '精锐' }).click();
  await expect(page).toHaveURL(/#\/unit\/531\/Franks\/4/);
  await expect(page.locator('#sim .simtab')).toBeVisible();
});

test('tech affects groups upgrade lines into one chip', async ({ page }) => {
  await page.goto('./#/tech/435');
  await page.getByRole('tab', { name: /作用对象/ }).click();
  await expect(page.locator('#affects .lchip', { hasText: '重装骑士' })).toHaveCount(1);
  await expect(page.locator('#affects a', { hasText: /^精锐/ })).toHaveCount(0);
});

test('CivPicker: keyboard navigation, Esc, none option, allowed civs', async ({ page }) => {
  await page.goto('./#/compare');
  await page.locator('#ca').click();
  await expect(page.locator('.cp-panel [role="option"]')).toHaveCount(56);
  await expect(page.locator('.cp-panel .cp-q')).toBeFocused();
  await page.keyboard.type('法兰');
  await page.keyboard.press('Enter');
  await expect(page.locator('#ca')).toHaveAttribute('data-value', 'Franks');
  await expect(page.locator('#ca')).toBeFocused();
  await page.locator('#cb').click();
  await expect(page.locator('.cp-panel .cp-q')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.cp-panel')).toHaveCount(0);
  // 农田：限定可建造农田的文明 + 不对比
  await page.goto('./#/building/50?tab=sim');
  await page.locator('#simcmp').click();
  await expect(page.locator('.cp-panel [data-civ="__none"]')).toContainText('不对比');
  await expect(page.locator('.cp-panel .cp-q')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('#simcmp')).not.toHaveAttribute('data-value', '');
  await pickCiv(page, 'simciv', 'Britons');
});

test('CivPicker opens as bottom sheet on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/matchup');
  await page.locator('#me').click();
  const box = await page.locator('.cp-panel').boundingBox();
  expect(box!.width).toBeGreaterThan(380);
  expect(Math.round(box!.y + box!.height)).toBeGreaterThanOrEqual(843);
  await page.locator('.cp-panel').getByRole('button', { name: '关闭' }).click();
  await expect(page.locator('.cp-panel')).toHaveCount(0);
});

test('unit duel: default Paladin vs Halberdier, URL state, modes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./#/duel');
  await expect(page.locator('#duel-res')).toContainText('获胜');
  await expect(page.locator('#duel-res .duel-tab')).toContainText('37');
  // 换 B 方单位：冠军剑士；无科技
  await page.locator('#duel-b-unit').click();
  await page.locator('.cp-panel .cp-q').fill('Champion');
  await page.keyboard.press('Enter');
  await expect(page.locator('#duel-b h3')).toContainText('冠军剑士');
  await page.locator('#duel-b').getByRole('radio', { name: '无科技' }).click();
  await expect(page).toHaveURL(/b=\d+\.[A-Za-z]+\.\d\.\./);
  const url = page.url();
  await page.reload();
  expect(page.url()).toBe(url);
  await expect(page.locator('#duel-b h3')).toContainText('冠军剑士');
  // 等资源
  await page.getByRole('radio', { name: '等资源' }).click();
  await expect(page.locator('#duel-res')).toContainText('预算 3000');
  await page.getByRole('radio', { name: 'N vs M' }).click();
  await page.locator('#duel-na').fill('3');
  await expect(page.locator('#duel-res')).toContainText('A 3');
  expect(errors).toEqual([]);
});

test('unit duel: elite toggle, civ picker, tech panel', async ({ page }) => {
  await page.goto('./#/duel?a=281.Franks.4.f.');
  await page.locator('#duel-a').getByRole('radio', { name: '精锐' }).click();
  await expect(page).toHaveURL(/a=531\./);
  await pickCiv(page, 'duel-b-civ', 'Britons');
  await page.locator('#duel-a summary').click();
  await expect(page.locator('#duel-a-sim .simtab')).toBeVisible();
  await page.locator('#duel-a-sim label.simt input').first().uncheck();
  await expect(page).toHaveURL(/a=531\.Franks\.4\.[\d-]+\./);
});

test('unit duel: mobile layout stacks sides', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/duel');
  const a = await page.locator('#duel-a').boundingBox(),
    b = await page.locator('#duel-b').boundingBox();
  expect(b!.y).toBeGreaterThan(a!.y + a!.height - 1);
  expect(a!.width).toBeLessThanOrEqual(390);
});

test('civ bonus rows expand inline and link to bonus detail', async ({ page }) => {
  await page.goto('./#/civ/Franks');
  const row = page.locator('.brow[data-bonus="2"]');
  await row.locator('.brow-h').click();
  await expect(row.locator('.brow-h')).toHaveAttribute('aria-expanded', 'true');
  await expect(row.locator('.bextab')).toContainText('192');
  await expect(row).toContainText('已计入数值');
  await page.locator('.brow[data-bonus="1"] .brow-h').click();
  await expect(page.locator('.brow[data-bonus="1"]')).toContainText('仅文本，未计入数值');
  await page
    .locator('.brow[data-bonus="1"]')
    .getByRole('link', { name: /查看详情页/ })
    .click();
  await expect(page).toHaveURL(/#\/civ\/Franks\/bonus\/1$/);
  await expect(page.locator('#bonus h2')).toContainText('文明加成 2');
});

test('team bonus detail notes allies; bonus list filters; Ctrl+K finds bonuses', async ({ page }) => {
  await page.goto('./#/civ/Franks/bonus/team');
  await expect(page.locator('#bonus')).toContainText('作用于盟友');
  await page.goto('./#/bonuses');
  await page.locator('#blist li').first().waitFor();
  const all = await page.locator('#blist li').count();
  expect(all).toBeGreaterThan(250);
  await page.getByRole('radio', { name: '海军' }).click();
  await expect.poll(() => page.locator('#blist li').count()).toBeLessThan(all);
  await page.locator('#benc').check();
  await expect(page.locator('#blist li').first()).toContainText('已计入数值');
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/搜索文明、单位、科技/).fill('磨坊科技免费');
  await expect(page.locator('.cmdk-list li').first()).toContainText('加成');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/civ\/Franks\/bonus\/1$/);
});

test('bonus detail on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/civ/Franks/bonus/2');
  await expect(page.locator('#bonus .bextab')).toContainText('160');
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(w).toBeLessThanOrEqual(392);
});

test('bonus detail shows .dat source, text-vs-dat note and structured eco effects', async ({ page }) => {
  await page.goto('./#/civ/Bengalis/bonus/3');
  await expect(page.getByText('数值来源：游戏 .dat').first()).toBeVisible();
  await page
    .getByText(/\.dat 原始效果/)
    .first()
    .click();
  await expect(page.getByText('#870').first()).toBeVisible();
  await page.goto('./#/civ/Saracens/bonus/team');
  await expect(page.getByText(/以 \.dat 为准/).first()).toBeVisible();
});
