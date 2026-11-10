import { expect, test, type Page } from '@playwright/test';

const paladinBloodlines = ['Cumans', 'Huns', 'Lithuanians', 'Magyars', 'Spanish', 'Teutons'];
const paladins = ['Burgundians', 'Byzantines', 'Celts', 'Cumans', 'Franks', 'Huns', 'Lithuanians', 'Magyars', 'Spanish', 'Teutons'];
const errors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', (error) => messages.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') messages.push(message.text());
  });
});

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors.get(page)).toEqual([]);
});

async function expectCivs(page: Page, names: string[]) {
  await expect(page.locator('#grid .card')).toHaveCount(names.length);
  await expect
    .poll(() => page.locator('#grid .card').evaluateAll((cards) => cards.map((card) => card.getAttribute('data-civ')).sort()))
    .toEqual([...names].sort());
  await expect(page.locator('#cnt')).toHaveText(`${names.length} / 56`);
}

async function openFilters(page: Page) {
  const panel = page.locator('#filter-panel');
  if (await panel.isHidden()) await page.getByRole('button', { name: '按条件筛选', exact: true }).click();
  await expect(panel).toBeVisible();
}

async function addRequirement(page: Page, kind: '单位' | '科技', name: string) {
  await openFilters(page);
  await page.locator('#option-search').fill(name);
  await page.getByRole('checkbox', { name: `添加${kind} ${name}`, exact: true }).check();
}

test('#206 搜索单位科技、单项移除和重置', async ({ page }) => {
  await page.goto('./#/civs');
  await expect(page.locator('#cnt')).toHaveText('56 / 56');
  await openFilters(page);
  await page.locator('#option-search').fill('游侠');
  await expect(page.getByRole('checkbox', { name: '添加科技 游侠', exact: true })).toHaveCount(0);
  await addRequirement(page, '单位', '游侠');
  await expectCivs(page, paladins);
  await expect(page.getByTestId('requirement-chip')).toHaveCount(1);
  await expect(page.getByTestId('requirement-chip').getByRole('link')).toHaveAttribute('href', '#/unit/569');
  await addRequirement(page, '科技', '血统');
  await expect(page.getByTestId('requirement-chip')).toHaveCount(2);
  await expect(page.getByTestId('requirement-chip').filter({ hasText: '血统' }).getByRole('link')).toHaveAttribute('href', '#/tech/435');
  await expectCivs(page, paladinBloodlines);
  await page.getByRole('button', { name: '移除科技 血统', exact: true }).click();
  await expect(page.getByTestId('requirement-chip')).toHaveCount(1);
  await expectCivs(page, paladins);
  await expect(page.locator('#option-search')).toHaveValue('血统');
  await page.getByRole('button', { name: '重置全部', exact: true }).click();
  await expect(page.getByTestId('requirement-chip')).toHaveCount(0);
  await expect(page.locator('#option-search')).toHaveValue('');
  await expect(page.locator('#cnt')).toHaveText('56 / 56');
});

test('#206 名称类型版本和必备条件写入地址栏，刷新后仍在', async ({ page }) => {
  await page.goto('./#/civs');
  await addRequirement(page, '单位', '游侠');
  await addRequirement(page, '科技', '血统');
  await page.locator('#q').fill('Huns');
  await page.locator('#ty').selectOption('cav');
  await page.locator('#dlc').selectOption('1');
  await expectCivs(page, ['Huns']);
  const params = new URLSearchParams(new URL(page.url()).hash.split('?')[1]);
  expect(params.get('req')?.split(',').sort()).toEqual(['t:435', 'u:569']);
  expect(params.get('q')).toBe('Huns');
  expect(params.get('ty')).toBe('cav');
  expect(params.get('dlc')).toBe('1');
  expect(params.get('pos')).toBeNull();
  await page.reload();
  await expect(page.locator('#q')).toHaveValue('Huns');
  await expect(page.locator('#ty')).toHaveValue('cav');
  await expect(page.locator('#dlc')).toHaveValue('1');
  await expect(page.getByTestId('requirement-chip')).toHaveCount(2);
  await expectCivs(page, ['Huns']);
  await page.getByRole('button', { name: '移除科技 血统', exact: true }).click();
  await page.getByRole('button', { name: '移除单位 游侠', exact: true }).click();
  await expect(page.getByTestId('requirement-chip')).toHaveCount(0);
  await expect(page.locator('#q')).toHaveValue('Huns');
  await expectCivs(page, ['Huns']);
});

test('#206 裸地址不恢复上一次筛选，地址栏参数会覆盖', async ({ page }) => {
  await page.goto('./#/civs');
  await page.locator('#q').fill('Huns');
  expect(new URL(page.url()).hash).toContain('q=Huns');
  await page.goto('./#/civs');
  await expect(page.locator('#q')).toHaveValue('');
  await expect(page.locator('#cnt')).toHaveText('56 / 56');
  await page.goto('./#/civs?q=Huns&ty=cav&pos=pk&dlc=1');
  await expect(page.locator('#q')).toHaveValue('Huns');
  await expect(page.locator('#ty')).toHaveValue('cav');
  await expect(page.locator('#dlc')).toHaveValue('1');
  await expect(page.locator('#pos')).toHaveCount(0);
  await expectCivs(page, ['Huns']);
});

test('#206 URL 编码、刷新、前后导航和详情返回保留条件', async ({ page }) => {
  await page.goto('./#/civs?req=u%3A569%2Ct%3A435');
  await expectCivs(page, paladinBloodlines);
  await page.reload();
  await expectCivs(page, paladinBloodlines);
  await page.evaluate(() => (location.hash = '#/civs?req=u:1813,u:569'));
  await expectCivs(page, []);
  await page.goBack();
  await expectCivs(page, paladinBloodlines);
  await page.goForward();
  await expectCivs(page, []);
  await page.goBack();
  await expectCivs(page, paladinBloodlines);
  await page.getByTestId('requirement-chip').filter({ hasText: '血统' }).getByRole('link').click();
  await expect(page).toHaveURL(/#\/tech\/435$/);
  await page.goBack();
  await expect(page.getByTestId('requirement-chip')).toHaveCount(2);
  await expectCivs(page, paladinBloodlines);
});

test('#206 精确升级形态、互斥单位、缺科技和免费科技', async ({ page }) => {
  await page.goto('./#/civs?req=u:1813,u:569');
  await expectCivs(page, []);
  await expect(page.getByTestId('requirement-chip')).toHaveCount(2);
  await page.goto('./#/civs?req=u:530,t:437');
  await expectCivs(page, []);
  await expect(page.getByTestId('requirement-chip').filter({ hasText: '精锐长弓兵' })).toBeVisible();
  await page.goto('./#/civs?req=u:7');
  await expect(page.locator('#cnt')).toHaveText('56 / 56');
  await expect(page.locator('#grid .card[data-civ="Turks"]')).toBeVisible();
  await page.goto('./#/civs?req=u:6');
  await expect(page.locator('#cnt')).toHaveText('55 / 56');
  await expect(page.locator('#grid .card[data-civ="Turks"]')).toHaveCount(0);
  await page.goto('./#/civs?req=t:213,t:249');
  await expect(page.getByTestId('requirement-chip')).toHaveCount(2);
  await expect(page.locator('#cnt')).toHaveText('56 / 56');
  await expect(page.locator('#grid .card[data-civ="Vikings"]')).toBeVisible();
});

test('#206 未知 ID、错误格式和不安全整数保留并阻止查询', async ({ page }) => {
  await page.goto('./#/civs?req=u:569,u:999999,broken,t:9007199254740992');
  const invalid = page.getByTestId('requirement-invalid');
  await expect(invalid).toHaveCount(3);
  await expect(page.getByTestId('requirements-blocked')).toBeVisible();
  await expect(page.locator('#grid .card')).toHaveCount(0);
  for (const token of ['u:999999', 'broken', 't:9007199254740992']) await expect(invalid.filter({ hasText: token })).toBeVisible();
  await page.reload();
  await expect(invalid).toHaveCount(3);
  for (let count = 3; count > 0; count--) {
    await page.getByTestId('requirement-chip').filter({ has: invalid }).first().getByRole('button').click();
    await expect(invalid).toHaveCount(count - 1);
    if (count > 1) {
      await expect(page.getByTestId('requirements-blocked')).toBeVisible();
      await expect(page.locator('#grid .card')).toHaveCount(0);
    }
  }
  await expect(page.getByTestId('requirements-blocked')).toHaveCount(0);
  await expectCivs(page, paladins);
  await page.reload();
  await expectCivs(page, paladins);
});

test('#206 数据加载期间不展示放宽后的文明结果', async ({ page }) => {
  let releaseCore!: () => void;
  const coreHeld = new Promise<void>((resolve) => (releaseCore = resolve));
  const heldRequests: string[] = [];
  await page.route(/\/assets\/(?:units|techs|buildings)-[^/]+\.js(?:\?.*)?$/, async (route) => {
    heldRequests.push(route.request().url());
    await coreHeld;
    await route.continue();
  });
  try {
    await page.goto('./#/civs?req=u:569,t:435', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => heldRequests.length).toBeGreaterThan(0);
    await expect(page.getByTestId('requirements-loading')).toBeVisible();
    await expect(page.locator('#grid .card')).toHaveCount(0);
  } finally {
    releaseCore();
  }
  await expect(page.getByTestId('requirements-loading')).toHaveCount(0);
  await expectCivs(page, paladinBloodlines);
});
