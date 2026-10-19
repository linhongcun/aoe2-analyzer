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

async function expectLegacyFilters(page: Page, values: { q: string; ty: string; pos: string; dlc: string }) {
  for (const [id, value] of Object.entries({ q: values.q, ty: values.ty, pos: values.pos, cdlc: values.dlc })) {
    await expect(page.locator(`#${id}`)).toHaveValue(value);
  }
}

async function addRequirement(page: Page, kind: '单位' | '科技', name: string) {
  const panel = page.getByTestId('civ-requirements');
  await panel.getByRole('textbox', { name: '搜索必备单位或科技', exact: true }).fill(name);
  await panel.getByRole('button', { name: `添加${kind} ${name}`, exact: true }).click();
  await expect(panel.getByRole('button', { name: `添加${kind} ${name}`, exact: true })).toHaveCount(0);
}

test('#206 搜索、类型、键盘添加、详情链接和单项移除', async ({ page }) => {
  await page.goto('./#/civs?req=');
  await expect(page.locator('#cnt')).toHaveText('56 / 56');
  const panel = page.getByTestId('civ-requirements');
  const search = panel.getByRole('textbox', { name: '搜索必备单位或科技', exact: true });
  const kind = panel.getByRole('combobox', { name: '条件类型', exact: true });
  await kind.selectOption('tech');
  await search.fill('游侠');
  await expect(panel.getByRole('button', { name: '添加单位 游侠', exact: true })).toHaveCount(0);
  await kind.selectOption('unit');
  const addPaladin = panel.getByRole('button', { name: '添加单位 游侠', exact: true });
  await expect(addPaladin).toBeVisible();
  await search.focus();
  await page.keyboard.press('Tab');
  await expect(search).not.toBeFocused();
  await addPaladin.focus();
  await page.keyboard.press('Enter');
  await expect(addPaladin).toHaveCount(0);
  await expectCivs(page, paladins);
  await expect(panel.getByTestId('requirement-chip')).toHaveCount(1);
  await expect(panel.getByTestId('requirement-chip').getByRole('link')).toHaveAttribute('href', '#/unit/569');
  await kind.selectOption('unit');
  await search.fill('血统');
  await expect(panel.getByRole('button', { name: '添加科技 血统', exact: true })).toHaveCount(0);
  await kind.selectOption('all');
  await addRequirement(page, '科技', '血统');
  await expect(panel.getByTestId('requirement-chip')).toHaveCount(2);
  await expect(panel.getByTestId('requirement-chip').filter({ hasText: '血统' }).getByRole('link')).toHaveAttribute('href', '#/tech/435');
  await expectCivs(page, paladinBloodlines);
  const removeBloodlines = panel.getByRole('button', { name: '移除科技 血统', exact: true });
  await removeBloodlines.focus();
  await page.keyboard.press('Space');
  await expect(panel.getByTestId('requirement-chip')).toHaveCount(1);
  await expectCivs(page, paladins);
  await panel.getByRole('button', { name: '清空组合条件', exact: true }).click();
  await expect(panel.getByTestId('requirement-chip')).toHaveCount(0);
  await expect(page.locator('#cnt')).toHaveText('56 / 56');
});

test('#206 旧筛选组合、清空条件和复制链接刷新还原', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./#/civs?req=');
  await addRequirement(page, '单位', '游侠');
  await addRequirement(page, '科技', '血统');
  await page.locator('#q').fill('Huns');
  await page.locator('#ty').selectOption('cav');
  await page.locator('#pos').selectOption('pk');
  await page.locator('#cdlc').selectOption('1');
  await expectCivs(page, ['Huns']);
  await page.getByRole('button', { name: '复制筛选链接', exact: true }).click();
  await expect(page.getByText('筛选链接已复制，包含全部条件。', { exact: true })).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  const params = new URLSearchParams(new URL(link).hash.split('?')[1]);
  expect(params.get('req')?.split(',').sort()).toEqual(['t:435', 'u:569']);
  for (const [key, value] of Object.entries({ q: 'Huns', ty: 'cav', pos: 'pk', dlc: '1' })) expect(params.get(key)).toBe(value);
  await page.locator('#q').fill('Teutons');
  await expect(page.getByText('筛选链接已复制，包含全部条件。', { exact: true })).toHaveCount(0);
  await page.goto(link);
  await page.reload();
  await expectLegacyFilters(page, { q: 'Huns', ty: 'cav', pos: 'pk', dlc: '1' });
  await expect(page.getByTestId('requirement-chip')).toHaveCount(2);
  await expectCivs(page, ['Huns']);
  await page.getByRole('button', { name: '清空组合条件', exact: true }).click();
  await expect(page.getByTestId('requirement-chip')).toHaveCount(0);
  await expectLegacyFilters(page, { q: 'Huns', ty: 'cav', pos: 'pk', dlc: '1' });
  await expectCivs(page, ['Huns']);
});

test('#206 复制被拒绝时提供手动链接，筛选变化后清除旧反馈', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new DOMException('Clipboard denied for regression', 'NotAllowedError');
        },
      },
    });
  });
  await page.goto('./#/civs?req=u:569,t:435');
  await expectCivs(page, paladinBloodlines);
  await page.getByRole('button', { name: '复制筛选链接', exact: true }).click();
  const manualLink = page.getByRole('textbox', { name: '筛选链接', exact: true });
  await expect(manualLink).toBeVisible();
  await expect(manualLink).toHaveAttribute('readonly', '');
  await expect(page.getByText('自动复制失败，请复制下方链接。', { exact: true })).toBeVisible();
  const link = await manualLink.inputValue();
  const params = new URLSearchParams(new URL(link).hash.split('?')[1]);
  expect(params.get('req')?.split(',').sort()).toEqual(['t:435', 'u:569']);
  await page.locator('#q').fill('Huns');
  await expectCivs(page, ['Huns']);
  await expect(manualLink).toHaveCount(0);
  await expect(page.getByText('自动复制失败，请复制下方链接。', { exact: true })).toHaveCount(0);
});

test('#206 分享参数覆盖收件人的 sticky，裸路由沿用原筛选', async ({ page }) => {
  await page.goto('./#/civs');
  await page.locator('#q').fill('Turks');
  await page.locator('#ty').selectOption('cav');
  await page.locator('#pos').selectOption('pk');
  await page.locator('#cdlc').selectOption('0');
  await expectCivs(page, ['Turks']);
  await page.evaluate(() => (location.hash = '#/units'));
  await expect(page.locator('#uq')).toBeVisible();
  await page.evaluate(() => (location.hash = '#/civs?req=u:569,t:435'));
  await expectLegacyFilters(page, { q: '', ty: '', pos: '', dlc: '' });
  await expectCivs(page, paladinBloodlines);
  await page.evaluate(() => (location.hash = '#/units'));
  await expect(page.locator('#uq')).toBeVisible();
  await page.evaluate(() => (location.hash = '#/civs'));
  await expectLegacyFilters(page, { q: 'Turks', ty: 'cav', pos: 'pk', dlc: '0' });
  await expectCivs(page, ['Turks']);
  await page.evaluate(() => (location.hash = '#/civs?q=Huns'));
  await expectLegacyFilters(page, { q: 'Huns', ty: '', pos: '', dlc: '' });
  await expect(page.getByTestId('requirement-chip')).toHaveCount(0);
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

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#206 ${theme} @${width}：组合条件和文明交集布局`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/civs?req=u:569,t:435');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(page.getByTestId('requirement-chip')).toHaveCount(2);
      await expectCivs(page, paladinBloodlines);
      for (const control of await page.getByTestId('civ-requirements').locator('input, select, button, a').all()) {
        const box = await control.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      await page.evaluate(() => document.fonts.ready);
      await expect
        .poll(() =>
          page
            .locator('#grid .card img')
            .evaluateAll((images) => images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)),
        )
        .toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`civ-requirements206-${theme}-${width}.png`), fullPage: true });
    });
