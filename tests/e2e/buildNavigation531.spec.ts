import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const errors = new WeakMap<Page, string[]>();
const paramsOf = (href: string) => new URLSearchParams(href.split('?')[1]);
const pageParams = (page: Page) => paramsOf(new URL(page.url()).hash);

test.beforeEach(({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', (error) => messages.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') messages.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('#531 城堡后分支保留文明、经济设置和原对阵，清除旧步骤', async ({ page }) => {
  await page.goto('./#/builds?bo=fast-castle-boom&civ=Franks&from=matchup&opp=Britons&dist=7&house=0&step=4');
  await page.getByRole('link', { name: '转骑士', exact: true }).click();
  await expect.poll(() => pageParams(page).get('bo')).toBe('fast-castle-knights');
  const params = pageParams(page);
  expect(params.get('civ')).toBe('Franks');
  expect(params.get('dist')).toBe('7');
  expect(params.get('house')).toBe('0');
  expect(params.get('me')).toBe('Franks');
  expect(params.get('opp')).toBe('Britons');
  expect(params.has('step')).toBe(false);
  await expect(page.getByRole('link', { name: '回对局助手', exact: true })).toHaveAttribute('href', '#/matchup?me=Franks&opp=Britons');
});

test('#531 对手开局返回列表再进路线，保留原双方方向及兼容参数', async ({ page }) => {
  await page.goto('./#/builds?bo=fast-castle-knights&civ=Britons&from=matchup&me=Franks&dist=7&house=0&step=2');
  await page.getByRole('link', { name: '查看全部开局', exact: true }).click();
  const list = pageParams(page);
  expect(list.get('civ')).toBe('Britons');
  expect(list.get('me')).toBe('Franks');
  expect(list.get('opp')).toBe('Britons');
  expect(list.get('dist')).toBe('7');
  expect(list.get('house')).toBe('0');
  expect(list.has('bo')).toBe(false);
  expect(list.has('step')).toBe(false);
  await page.locator('#bo-scouts-18 > summary').click();
  await page.locator('#bo-scouts-18').getByRole('link', { name: '看时间线', exact: true }).click();
  await expect.poll(() => pageParams(page).get('bo')).toBe('scouts-18');
  expect(pageParams(page).get('civ')).toBe('Britons');
  expect(pageParams(page).get('dist')).toBe('7');
  expect(pageParams(page).get('house')).toBe('0');
  await expect(page.getByRole('link', { name: '回对局助手', exact: true })).toHaveAttribute('href', '#/matchup?me=Franks&opp=Britons');
});

test('#531 步骤资料入口保留文明与回原步骤，跟练打印不丢情境', async ({ page }) => {
  await page.goto('./#/builds?bo=scouts-18&civ=Mongols&from=matchup&opp=Chinese&dist=7&house=0&step=1');
  await page.locator('[data-t="timeline"] .tl-steps').waitFor();
  const link = page.getByRole('region', { name: '步骤详情', exact: true }).locator('.tl-entities a').first();
  await expect(link).toBeVisible();
  const target = paramsOf((await link.getAttribute('href'))!);
  expect(target.get('civ')).toBe('Mongols');
  expect(target.get('me')).toBe('Mongols');
  expect(target.get('opp')).toBe('Chinese');
  const back = target.get('ctxReturn')!;
  expect(back.startsWith('/builds?')).toBe(true);
  const backParams = paramsOf(back);
  expect(backParams.get('bo')).toBe('scouts-18');
  expect(backParams.get('step')).toBe('1');
  expect(backParams.get('dist')).toBe('7');
  expect(backParams.get('house')).toBe('0');
  expect(backParams.has('ctxReturn')).toBe(false);
  await page.getByRole('link', { name: '专注跟练', exact: true }).click();
  await expect(page.getByTestId('build-practice')).toBeVisible();
  expect(pageParams(page).get('me')).toBe('Mongols');
  expect(pageParams(page).get('opp')).toBe('Chinese');
  await page.getByRole('link', { name: '查看完整清单', exact: true }).click();
  expect(pageParams(page).get('view')).toBe('print');
  expect(pageParams(page).get('dist')).toBe('7');
  expect(pageParams(page).get('house')).toBe('0');
  await page.getByRole('link', { name: '返回时间线', exact: true }).click();
  expect(pageParams(page).get('step')).toBe('1');
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#531 开局情境条及资料入口 @${width} ${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      const params = new URLSearchParams({
        bo: 'scouts-18',
        civ: 'Mongols',
        me: 'Mongols',
        opp: 'Chinese',
        dist: '7',
        house: '0',
        step: '1',
        ctxReturn: '/duel?a=38.Mongols.3..&b=4.Chinese.3..&m=1',
      });
      await page.goto('./#/builds?' + params);
      const nav = page.getByRole('navigation', { name: '对阵相关入口', exact: true });
      await expect(nav.getByRole('link', { name: '查看全部开局', exact: true })).toBeVisible();
      await page.locator('[data-t="timeline"] .tl-steps').waitFor();
      await expect(page.getByRole('region', { name: '步骤详情', exact: true })).toBeVisible();
      for (const link of await nav.getByRole('link').all()) {
        const box = await link.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.width).toBeGreaterThanOrEqual(44);
      }
      const violations = (await new AxeBuilder({ page }).include('.build-navigation').withRules(['color-contrast']).analyze()).violations;
      expect(violations).toEqual([]);
      const shot = info.outputPath(`build-context-${width}-${theme}.png`);
      await page.screenshot({ path: shot, fullPage: false });
      await info.attach('开局情境串联', { path: shot, contentType: 'image/png' });
      await page.getByRole('link', { name: '专注跟练', exact: true }).click();
      await expect(page.getByTestId('build-practice')).toBeVisible();
      await page.getByRole('link', { name: '查看完整清单', exact: true }).click();
      await expect(page.getByTestId('build-practice')).toHaveAttribute('data-mode', 'print');
      await page.emulateMedia({ media: 'print' });
      await expect(page.locator('.build-navigation')).toBeHidden();
      await expect(page.locator('.bp-print-link')).toContainText('me=Mongols');
      await expect(page.locator('.bp-print-link')).toContainText('opp=Chinese');
    });
