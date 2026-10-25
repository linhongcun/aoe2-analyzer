import { expect, test, type Page } from '@playwright/test';
import civs from '../../src/data/civs.json' with { type: 'json' };
import { CIV_DLC, DLCS } from '../../src/domain/dlc';

const errors = new WeakMap<Page, string[]>();
const latestDlc = DLCS.length - 1;
const releaseCivs = (index: number) => civs.filter((civ) => CIV_DLC[civ.en] === index).map((civ) => civ.en);

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
  await expect(page.locator('#cnt')).toHaveText(`${names.length} / ${civs.length}`);
}

function dlcBar(page: Page) {
  return page.getByRole('group', { name: 'DLC 快捷筛选', exact: true });
}

async function expectSelected(page: Page, value: string) {
  const bar = dlcBar(page);
  await expect(bar.locator(`button[data-v="${value}"]`)).toHaveAttribute('aria-pressed', 'true');
  await expect(bar.locator('button[aria-pressed="true"]')).toHaveCount(1);
  await expect(bar.locator('button[aria-pressed="false"]')).toHaveCount(DLCS.length + 1);
}

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`文明 DLC 快捷筛选 ${theme} @${width}：仅保留图标入口与清空筛选`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/civs');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const bar = dlcBar(page);
      await expect(bar).toBeVisible();
      await expect(page.locator('#cdlc')).toHaveCount(0);
      await expect(bar.getByRole('button')).toHaveCount(DLCS.length + 2);
      await expect(bar.getByRole('img')).toHaveCount(DLCS.length);
      await expectSelected(page, '');
      if (width <= 600) await expect(page.locator('.catalog-filter-panel')).toBeHidden();

      // 快捷按钮在手机筛选面板收起时也可操作。
      await bar.locator(`button[data-v="${latestDlc}"]`).click();
      await expectSelected(page, String(latestDlc));
      await expectCivs(page, releaseCivs(latestDlc));
      if (width <= 600) await page.locator('.catalog-filter-toggle').click();
      await bar.locator('button[data-v="0"]').click();
      await expectSelected(page, '0');
      await expectCivs(page, releaseCivs(0));
      await bar.locator(`button[data-v="${latestDlc}"]`).click();
      await expectSelected(page, String(latestDlc));
      await expectCivs(page, releaseCivs(latestDlc));

      for (const button of await bar.getByRole('button').all()) {
        const box = await button.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      await page.evaluate(() => document.fonts.ready);
      await expect
        .poll(() =>
          bar
            .getByRole('img')
            .evaluateAll((images) => images.every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)),
        )
        .toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`civ-dlc-${theme}-${width}.png`), fullPage: true });
      await page.getByRole('button', { name: '清空筛选', exact: true }).click();
      await expectSelected(page, '');
      await expectCivs(
        page,
        civs.map((civ) => civ.en),
      );
    });

test('文明 DLC 快捷筛选：每个资料片图标命中对应文明并保留路由间记忆', async ({ page }) => {
  await page.goto('./#/civs');
  const bar = dlcBar(page);
  for (const [index, dlc] of DLCS.entries()) {
    const button = bar.locator(`button[data-v="${index}"]`);
    await expect(button.getByRole('img')).toHaveAttribute('alt', `${dlc.zh} ${dlc.en}`);
    await expect(button.getByRole('img')).toHaveAttribute('title', `${dlc.zh} · ${dlc.en} (${dlc.year})`);
    await button.click();
    await expectSelected(page, String(index));
    await expectCivs(page, releaseCivs(index));
    expect(new URL(page.url()).hash).toBe('#/civs');
  }
  await page.evaluate(() => (location.hash = '#/units'));
  await expect(page.locator('#uq')).toBeVisible();
  await page.evaluate(() => (location.hash = '#/civs'));
  await expectSelected(page, String(latestDlc));
  await expectCivs(page, releaseCivs(latestDlc));
  await bar.getByRole('button', { name: '未标注', exact: true }).click();
  await expectSelected(page, 'none');
  await expectCivs(
    page,
    civs.filter((civ) => CIV_DLC[civ.en] == null).map((civ) => civ.en),
  );
  await bar.getByRole('button', { name: '全部', exact: true }).click();
  await expectSelected(page, '');
  await expectCivs(
    page,
    civs.map((civ) => civ.en),
  );
});

test('文明 DLC 快捷筛选：保留分享链接的搜索、类型、位置与必备单位科技条件', async ({ page }) => {
  await page.goto('./#/civs?req=u:569,t:435&q=Huns&ty=cav&pos=pk&dlc=0&view=compact');
  const chips = page.getByTestId('requirement-chip');
  await expect(chips).toHaveCount(2);
  await expectCivs(page, []);
  await dlcBar(page).locator('button[data-v="1"]').click();
  await expectSelected(page, '1');
  await expectCivs(page, ['Huns']);
  const expectSnapshot = async (dlc: string) => {
    const params = new URLSearchParams(new URL(page.url()).hash.split('?')[1]);
    for (const [key, value] of Object.entries({ q: 'Huns', ty: 'cav', pos: 'pk', dlc, view: 'compact' })) expect(params.get(key)).toBe(value);
    expect(params.get('req')?.split(',').sort()).toEqual(['t:435', 'u:569']);
    for (const [id, value] of Object.entries({ q: 'Huns', ty: 'cav', pos: 'pk' })) await expect(page.locator(`#${id}`)).toHaveValue(value);
    await expect(chips).toHaveCount(2);
    await expect(chips.filter({ hasText: '游侠' })).toHaveCount(1);
    await expect(chips.filter({ hasText: '血统' })).toHaveCount(1);
  };
  await expectSnapshot('1');
  await page.reload();
  await expectSelected(page, '1');
  await expectCivs(page, ['Huns']);
  await expectSnapshot('1');
  await dlcBar(page).getByRole('button', { name: '全部', exact: true }).click();
  await expectSelected(page, '');
  await expectSnapshot('');
  await expectCivs(page, ['Huns']);
  await page.getByRole('button', { name: '清空筛选', exact: true }).click();
  await expectSelected(page, '');
  for (const id of ['q', 'ty', 'pos']) await expect(page.locator(`#${id}`)).toHaveValue('');
  await expect(chips).toHaveCount(0);
  await expectCivs(
    page,
    civs.map((civ) => civ.en),
  );
  expect(new URLSearchParams(new URL(page.url()).hash.split('?')[1]).has('req')).toBe(false);
});
