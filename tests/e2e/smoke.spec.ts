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
  ['#builds', '#builds [data-t="build-order"]'],
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
  await page.getByRole('button', { name: '工具' }).click();
  await page.locator('nav.mainnav a', { hasText: '对局助手' }).click();
  await expect(page.locator('#mres h3')).toBeVisible();
  await expect(page.locator('nav.mainnav')).toBeHidden();
});

test('nav: every entry opens its real page, none opens a planned placeholder', async ({ page }) => {
  const PAGES: [string, string][] = [
    ['#/', '#home .hcard'],
    ['#/civs', '#grid .card'],
    ['#/units', '#ugrid .card'],
    ['#/buildings', '#bgrid .card'],
    ['#/techs', '#tgrid .card'],
    ['#/tree', '.tree .tcell'],
    ['#/compare', '#ctab tr'],
    ['#/matchup', '#mres h3'],
    ['#/simulator', '#simhub .card'],
    ['#/duel', '#duel-res h3'],
    ['#/builds', '#builds [data-t="build-order"]'],
  ];
  await page.goto('./');
  await page.getByRole('button', { name: '工具' }).click();
  const hrefs = await page.locator('nav.mainnav a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  expect(hrefs.sort()).toEqual(PAGES.map(([h]) => h).sort());
  for (const [href, sel] of PAGES) {
    await page.goto('./' + href);
    await expect(page.locator(sel).first()).toBeVisible();
    await expect(page.locator('.planned-page')).toHaveCount(0);
  }
});

test('old #/list and #list redirect to #/civs and show the civ grid', async ({ page }) => {
  for (const old of ['./#/list', './#list']) {
    await page.goto(old);
    await expect(page).toHaveURL(/#\/civs$/);
    await expect(page.locator('#grid .card')).toHaveCount(56);
  }
});

test('old #/tree redirects to #/tree/Franks and shows the Franks tree', async ({ page }) => {
  await page.goto('./#/tree');
  await expect(page).toHaveURL(/#\/tree\/Franks$/);
  await expect(page.locator('#tra')).toHaveAttribute('data-value', 'Franks');
  await expect(page.locator('.tree .tcell').first()).toBeVisible();
});

test('nav: 工具 dropdown toggles on click, closes on outside click and Esc', async ({ page }) => {
  await page.goto('./');
  const tools = page.getByRole('button', { name: '工具' });
  const panel = page.locator('#tools-menu');
  await expect(panel).toBeHidden();
  await tools.click();
  await expect(tools).toHaveAttribute('aria-expanded', 'true');
  await expect(panel.getByRole('link', { name: '文明对比' })).toBeVisible();
  await page.locator('#home h2').first().click();
  await expect(panel).toBeHidden();
  await tools.click();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await tools.click();
  await panel.getByRole('link', { name: '单位 PK' }).click();
  await expect(page).toHaveURL(/#\/duel$/);
  await expect(panel).toBeHidden();
  await expect(tools).toHaveClass(/\bon\b/);
});

test('home: 不再显示「即将推出 · 正在制作」块（#16 开工前不展示）', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('#home .hgrid').first()).toBeVisible();
  await expect(page.locator('#home .soon-card')).toHaveCount(0);
  await expect(page.locator('#home')).not.toContainText('即将推出');
  await expect(page.locator('#home')).not.toContainText('正在制作');
  await expect(page.locator('#home')).not.toContainText('版本补丁');
  await expect(page.locator('#home .hcard.planned')).toHaveCount(0);
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
  // 等列表过滤出 Franks 再选，避免 Enter 抢在过滤前选中第一项
  const franks = page.locator('.cp-panel [data-civ="Franks"]');
  await expect(franks).toBeVisible();
  await franks.click();
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
  await page.locator('#duel-b').getByRole('radio', { name: '无科技', exact: true }).click();
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

test('feedback link: footer + detail page button prefill GitHub issue', async ({ page }) => {
  await page.goto('./#/unit/4');
  const btn = page.locator('.fbbar a[data-t="feedback"]');
  await expect(btn).toBeVisible();
  const href = new URL((await btn.getAttribute('href'))!);
  expect(href.origin + href.pathname).toBe('https://github.com/linhongcun/aoe2-analyzer/issues/new');
  expect(href.searchParams.get('title')).toContain('单位 4');
  expect(href.searchParams.get('body')).toContain('/unit/4');
  expect(href.searchParams.get('body')).toContain('185872');
  expect(await btn.getAttribute('target')).toBe('_blank');
  await expect(page.locator('footer a[data-t="feedback"]')).toHaveAttribute('href', /issues\/new\?title=/);
  await page.goto('./#/duel');
  await expect(page.locator('.fbbar a[data-t="feedback"]')).toHaveAttribute('href', /title=.*duel/);
});

test('data version badge links to about-data page with pins and patch notes', async ({ page }) => {
  await page.goto('./#/units');
  const badge = page.locator('[data-t="version-badge"]');
  await expect(badge).toContainText('数据版本：DE 185872（2026-09-22）');
  await expect(page.locator('[data-t="footer-version"]')).toContainText('DE 185872');
  await expect(page.locator('footer a[data-t="feature"]')).toHaveAttribute('href', /title=%5B%E5%8A%9F%E8%83%BD%E5%BB%BA%E8%AE%AE%5D/);
  await badge.click();
  await expect(page).toHaveURL(/#\/about-data$/);
  await expect(page.locator('[data-t="data-version"]')).toHaveText('DE 185872（2026-09-22）');
  await expect(page.locator('[data-t="src-dat"]')).toContainText('SiegeEngineers/auto-mods@0c38027');
  await expect(page.locator('[data-t="src-dat"]')).toContainText('sha256');
  await expect(page.locator('[data-t="src-aoe2techtree"]')).toContainText('@3bb43b1');
  await expect(page.locator('a[data-t="patch-note"]').first()).toHaveAttribute('href', /PATCH-NOTES\/185872\.md$/);
});

test('build orders read-only list renders all entries with sources', async ({ page }) => {
  await page.goto('./#/builds');
  const items = page.locator('[data-t="build-order"]');
  await expect(items).toHaveCount(6);
  await items.first().locator('summary').click();
  await expect(items.first()).toContainText('来源');
  await expect(items.first().locator('a[href*="aoe2guide.com"]')).toHaveCount(1);
});

test('rating help: beside 能力评分, opens/closes by click, outside click and Esc, focus moves in and back', async ({ page }) => {
  await page.goto('./#/civ/Franks');
  await page.getByRole('tab', { name: '数据' }).click();
  const head = page.locator('#detail .ratehead');
  await expect(head).toContainText('能力评分');
  await expect(head).toContainText('主观评分，仅供参考');
  await expect(page.locator('#detail')).not.toContainText('评分为主观近似值');
  const btn = head.getByRole('button', { name: '评分说明' });
  const box = await btn.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(32);
  expect(box!.height).toBeGreaterThanOrEqual(32);
  const pop = page.getByRole('dialog', { name: '评分是怎么来的' });
  await expect(pop).toBeHidden();
  await btn.click();
  await expect(pop).toBeVisible();
  await expect(pop).toBeFocused();
  await expect(pop).toContainText(
    '8 项能力按 1–10 打分，由我们参考以下几点人工整理：文明加成、独特单位和独特科技；科技树完整度（缺哪些关键升级）；团战排位社区的普遍看法。',
  );
  await expect(pop).toContainText('不是胜率统计，会随版本补丁调整。数据在 scripts/civ_ratings.json。');
  await expect(pop.getByRole('link', { name: /反馈给我们/ })).toHaveAttribute('href', /issues\/new/);
  await expect(btn).toHaveAttribute('aria-expanded', 'true');
  await page.locator('#detail .dhead h2').click();
  await expect(pop).toBeHidden();
  await btn.click();
  await expect(pop).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(pop).toBeHidden();
  await expect(btn).toBeFocused();
  await btn.click();
  await btn.click();
  await expect(pop).toBeHidden();
});

test('rating help on mobile: 44px target, popover spans the card width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/civ/Franks');
  await page.getByRole('tab', { name: '数据' }).click();
  const head = page.locator('#detail .ratehead');
  const btn = head.getByRole('button', { name: '评分说明' });
  const b = await btn.boundingBox();
  expect(b!.width).toBeGreaterThanOrEqual(44);
  expect(b!.height).toBeGreaterThanOrEqual(44);
  await btn.click();
  const pop = page.getByRole('dialog', { name: '评分是怎么来的' });
  const h = await head.boundingBox();
  const p = await pop.boundingBox();
  expect(Math.abs(p!.x - h!.x)).toBeLessThan(1);
  expect(Math.abs(p!.width - h!.width)).toBeLessThan(1);
});

test('rating label also on compare and matchup; old yellow note removed', async ({ page }) => {
  await page.goto('./#/compare');
  await expect(page.locator('#compare .ratehead')).toContainText('主观评分，仅供参考');
  await page.goto('./#/matchup');
  await expect(page.locator('#mres .rating-foot')).toContainText('主观评分，仅供参考');
  await page.locator('#mres .rating-foot').getByRole('button', { name: '评分说明' }).click();
  await expect(page.getByRole('dialog', { name: '评分是怎么来的' })).toBeVisible();
});

test('#31 Ctrl+K 搜到开局流程与开局名；工具菜单首项为开局流程', async ({ page }) => {
  await page.goto('./#/');
  await expect(page.locator('#home .hcard[data-k="builds"]')).toBeVisible();
  await page.keyboard.press('Control+k');
  await page.keyboard.type('开局流程');
  await expect(page.getByRole('dialog').getByText('开局流程').first()).toBeVisible();
});

test('#22 对建筑射程：主数字下方小字「对建筑 N」，无括号；手机 PK 缩写「建筑 N」', async ({ page }) => {
  await page.goto('./#/unit/1968');
  const small = page.locator('#unit [data-t="range-building"]');
  await expect(small).toHaveText('对建筑 9');
  await expect(page.locator('#unit')).not.toContainText('（对建筑');
  await page.goto('./#/unit/4');
  await expect(page.locator('#unit [data-t="range-building"]')).toHaveCount(0);
  await page.goto('./#/duel?a=1968.Wu.4.f.');
  await expect(page.locator('#duel-a [data-t="range-building"] .rngb-full')).toHaveText('对建筑 12'); // 默认满科技（#38）
  await page.setViewportSize({ width: 390, height: 844 });
  const pk = page.locator('#duel-a [data-t="range-building"]');
  await expect(pk.locator('.rngb-short')).toHaveText('建筑 12');
  await expect(pk.locator('.rngb-full')).toBeHidden();
  await expect(pk).toHaveAttribute('title', '对建筑射程 12');
});

test('#27 火焰骆驼：攻击间隔「—」+ 原因小字；击杀用时「—」不为 0s', async ({ page }) => {
  await page.goto('./#/unit/1263');
  await expect(page.locator('#unit [data-t="rof-reason"]')).toHaveText('爆炸单位，无攻击间隔');
  await page.goto('./#/duel?a=1263.Tatars.4.f.');
  await expect(page.locator('#duel-a [data-t="rof-reason"]')).toHaveText('爆炸单位，无攻击间隔');
  await expect(page.locator('#duel-a .duel-stats')).not.toContainText('-爆炸');
  const killRow = page.locator('#duel tr', { hasText: '击杀用时' }).first();
  await expect(killRow.locator('td').nth(1)).toHaveText('—');
});

test('#38 PK 火焰弓箭手满科技：对建筑射程随射程科技变为 12', async ({ page }) => {
  await page.goto('./#/duel?a=1968.Wu.4.f.');
  const a = page.locator('#duel-a');
  await a.getByRole('radio', { name: '满科技', exact: true }).click();
  await expect(a.locator('[data-t="range-building"] .rngb-full')).toHaveText('对建筑 12');
  await a.getByRole('radio', { name: '无科技', exact: true }).click();
  await expect(a.locator('[data-t="range-building"] .rngb-full')).toHaveText('对建筑 9');
});

test('页脚在数据版本后显示构建短 SHA（7 位十六进制）', async ({ page }) => {
  await page.goto('#/builds');
  const foot = page.locator('footer .fbfoot');
  await expect(foot.locator('[data-t="footer-build"]')).toHaveText(/^构建 [0-9a-f]{7}$/);
  expect(await foot.innerText()).toMatch(/数据版本：[^\n]*构建 [0-9a-f]{7}/);
});
