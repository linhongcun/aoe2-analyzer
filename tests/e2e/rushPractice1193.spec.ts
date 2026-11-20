import { expect, test, type Page } from '@playwright/test';

const pair = 'pair=explicit&me=Teutons&opp=Japanese';
const battle = 'a=93.Teutons.2..&b=448.Japanese.2..&m=n&na=2&nb=3';
const paramsOf = (address: string) => new URLSearchParams(new URL(address).hash.split('?')[1]);
const guide = (page: Page) => page.getByRole('region', { name: '可按当前文明核对的练习', exact: true });
const drill = (page: Page) => guide(page).getByRole('link', { name: /打开 PK 演练/ });
const returnLink = (page: Page) => page.getByRole('navigation', { name: '对阵相关入口' }).getByRole('link', { name: /回对局助手/ });

async function expectScoutsBattle(page: Page) {
  await expect(page.locator('#duel-a .duel-age')).toHaveText('封建时代');
  await expect(page.locator('#duel-b .duel-age')).toHaveText('封建时代');
  await expect(page.locator('#duel-a-civ')).toHaveAttribute('data-value', 'Teutons');
  await expect(page.locator('#duel-b-civ')).toHaveAttribute('data-value', 'Japanese');
  await expect(page.locator('#duel-res .duel-tab')).toContainText('A 2');
  await expect(page.locator('#duel-res .duel-tab')).toContainText('B 3');
  const params = paramsOf(page.url());
  expect(params.get('a')).toBe('93.Teutons.2..');
  expect(params.get('b')).toBe('448.Japanese.2..');
  expect(params.get('m')).toBe('n');
}

async function expectScoutsMatchup(page: Page) {
  await expect(guide(page).getByRole('combobox')).toHaveValue('scouts');
  await expect(page.locator('#ma')).toHaveAttribute('data-value', 'Teutons');
  await expect(page.locator('#me')).toHaveAttribute('data-value', 'Japanese');
  await expect(page.getByRole('region', { name: '通用早期应对' })).toContainText('当前：「肉马」');
  await expect(guide(page).getByRole('link', { name: /参考开局/ })).toHaveAttribute('href', /bo=scouts-18/);
  expect(paramsOf(page.url()).get('pair')).toBe('explicit');
  expect(paramsOf(page.url()).get('rush')).toBe('scouts');
}

test('#1193 页面返回和浏览器后退恢复原对局与肉马打法', async ({ page }) => {
  await page.goto(`./#/matchup?${pair}`);
  await guide(page).getByRole('combobox').selectOption('scouts');
  await drill(page).click();
  await expectScoutsBattle(page);
  await expect(returnLink(page)).toContainText('条顿 对 日本 · 肉马');
  await returnLink(page).click();
  await expectScoutsMatchup(page);
  await drill(page).click();
  await expectScoutsBattle(page);
  await page.goBack();
  await expectScoutsMatchup(page);
});

test('#1193 复制到新标签与窄屏键盘返回保持来源，PK 数量可独立编辑', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto(`./#/matchup?${pair}&rush=scouts`);
  await drill(page).click();
  await expectScoutsBattle(page);
  const copy = page.locator('#duel-res').getByRole('button', { name: '复制页面链接', exact: true });
  await copy.click();
  await expect(page.locator('#duel-res').getByRole('button', { name: '链接已复制', exact: true })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(copied).searchParams.get('practice')).toBe('Teutons.Japanese.scouts');

  const fresh = await context.newPage();
  await fresh.setViewportSize({ width: 360, height: 900 });
  await fresh.goto(copied);
  await expectScoutsBattle(fresh);
  const back = returnLink(fresh);
  await expect(back).toContainText('条顿 对 日本 · 肉马');
  const firstCiv = fresh.getByRole('navigation', { name: '对阵相关入口' }).getByRole('link', { name: '条顿', exact: true });
  const backBox = (await back.boundingBox())!;
  const civBox = (await firstCiv.boundingBox())!;
  expect(backBox.height).toBeGreaterThanOrEqual(44);
  expect(civBox.y).toBeGreaterThanOrEqual(backBox.y + backBox.height);
  expect(await fresh.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  await fresh.locator('#duel-na').fill('4');
  await expect(fresh.locator('#duel-res .duel-tab')).toContainText('A 4');
  expect(paramsOf(fresh.url()).get('practice')).toBe('Teutons.Japanese.scouts');
  await back.focus();
  await expect(back).toBeFocused();
  await back.press('Enter');
  await expectScoutsMatchup(fresh);
});

test('#1193 默认演练照常返回，直接 PK 和坏来源走普通回程', async ({ page }) => {
  await page.goto(`./#/matchup?${pair}`);
  await expect(guide(page).getByRole('combobox')).toHaveValue('militia');
  await drill(page).click();
  await expect(returnLink(page)).toHaveAccessibleName('回对局助手');
  await returnLink(page).click();
  await expect(guide(page).getByRole('combobox')).toHaveValue('militia');
  await expect(page.locator('#ma')).toHaveAttribute('data-value', 'Teutons');
  await expect(page.locator('#me')).toHaveAttribute('data-value', 'Japanese');

  for (const source of ['', '&practice=Teutons.Japanese.unknown']) {
    await page.goto(`./#/duel?${battle}${source}`);
    await expectScoutsBattle(page);
    await expect(returnLink(page)).toHaveAccessibleName('回对局助手');
    await expect(returnLink(page)).toHaveAttribute('href', '#/matchup?me=Teutons&opp=Japanese');
  }
  await returnLink(page).click();
  await expect(guide(page).getByRole('combobox')).toHaveValue('militia');
  await guide(page).getByRole('combobox').selectOption('scouts');
  const general = page.getByRole('link', { name: '单位 PK，不自动带入当前双方' });
  await expect(general).toHaveAttribute('href', '#/duel');
  await general.click();
  await expect(page.locator('#duel-a-civ')).toHaveAttribute('data-value', 'Franks');
  await expect(returnLink(page)).toHaveAccessibleName('回对局助手');
  expect(paramsOf(page.url()).has('practice')).toBe(false);
});
