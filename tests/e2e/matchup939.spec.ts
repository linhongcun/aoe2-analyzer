import { expect, test, type Page } from '@playwright/test';

function hashParams(url: string) {
  const hash = url.slice(url.indexOf('#') + 1);
  const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
  return new URLSearchParams(query);
}

async function pick(page: Page, id: 'ma' | 'me', civ: string) {
  await page.locator(`#${id}`).click();
  await page.locator(`.cp-panel [data-civ="${civ}"]`).click();
  await expect(page.locator(`#${id}`)).toHaveAttribute('data-value', civ);
}

async function expectTaskLayout(page: Page, desktop: boolean) {
  const setup = await page.locator('.mu-setup').boundingBox();
  const practice = await page.locator('.mu-practice').boundingBox();
  const tools = await page.locator('.mu-toolbox').boundingBox();
  const reference = await page.locator('.mu-region-ref').boundingBox();
  if (!setup || !practice || !tools || !reference) throw new Error('Expected all four matchup task regions');
  if (desktop) {
    expect(practice.x).toBeGreaterThanOrEqual(setup.x + setup.width);
    expect(Math.abs(practice.y - setup.y)).toBeLessThan(2);
  } else {
    expect(practice.y).toBeGreaterThanOrEqual(setup.y + setup.height);
    const cards = await page.locator('.mu-tactic-card').evaluateAll((elements) => elements.map((el) => el.getBoundingClientRect().x));
    expect(new Set(cards).size).toBe(1);
  }
  expect(tools.y).toBeGreaterThanOrEqual(practice.y + practice.height);
  expect(reference.y).toBeGreaterThanOrEqual(tools.y + tools.height);
  await expect(page.locator('.mu-tactic-card')).toHaveCount(3);
  expect(await page.locator('.mu-tactic-card').evaluateAll((links) => links.map((link) => link.getAttribute('href')))).toEqual([
    '#/matchup/scouting',
    '#/matchup/mixed-army',
    '#/matchup/castle-defense',
  ]);
}

test('#939 默认对阵分清跟文明走的入口与通用参考', async ({ page }) => {
  await page.goto('./#/matchup');
  await expect(page.locator('#mres')).toBeVisible();
  await expectTaskLayout(page, true);
  expect(hashParams(page.url()).has('me')).toBe(false);
  expect(hashParams(page.url()).has('opp')).toBe(false);
  await expect(page.getByRole('heading', { level: 1, name: '对局助手', exact: true })).toBeVisible();
  await expect(page.getByText('可复制地址栏链接分享这对阵')).toHaveCount(0);
  await expect(page.locator('.matchup-title')).toHaveCount(0);
  await expect(page.getByText('下面的开局、文明页和练习入口会带上这对文明。')).toBeVisible();
  await expect(page.getByText('下面的开局、文明页和练习入口会带上这对文明。')).not.toContainText('单位 PK');
  const pk = page.getByRole('link', { name: '单位 PK，不自动带入当前双方' });
  await expect(pk).toHaveAttribute('href', '#/duel');
  await expect(page.getByText('不自动带入当前双方', { exact: true })).toBeVisible();
  const follow = page.getByRole('navigation', { name: '跟这对文明走的开局与文明页' });
  await expect(follow.getByRole('link', { name: '我方开局', exact: true })).toHaveAttribute('href', /#\/builds\?/);
  await expect(follow.getByRole('link', { name: '我方开局', exact: true })).toHaveAttribute('href', /civ=Franks/);
  const practice = page.getByRole('region', { name: '可按当前文明核对的练习', exact: true });
  await expect(practice.getByRole('link', { name: /打开 PK 演练：/ })).toBeVisible();
  await expect(practice.getByRole('link', { name: /参考开局：/ })).toBeVisible();
  const guide = page.getByRole('region', { name: '通用早期应对', exact: true });
  await expect(guide).toContainText('下列四段是固定的通用稿，只随「对手打法」切换（当前：「民兵快攻」）');
  await expect(page.locator('#mres')).toContainText('通用类型反制');
  await expect(page.locator('#mres')).toContainText('也不是模型结论');
  await expect(page.locator('.matchup-counter-link').first()).toBeVisible();
  const guides = page.getByRole('navigation', { name: '对局助手有限指南' });
  await expect(guides.getByRole('link', { name: '先辨析侦察线索与缺失信息' })).toHaveAttribute('href', '#/matchup/scouting');
  await expect(page.getByRole('link', { name: '记录本局疑问与下次练习重点' })).toHaveAttribute('href', '#/match-review');
  await expect(page.locator('#matchup')).not.toContainText('推荐反制');
  await expect(page.locator('#matchup')).not.toContainText('你的相对优势');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('#939 改打法只替换通用稿和练习入口，分享句只在地址已有双方时出现', async ({ page }) => {
  await page.goto('./#/matchup');
  await expect(page.locator('#mres')).toBeVisible();
  const practice = page.getByRole('region', { name: '可按当前文明核对的练习', exact: true });
  await practice.getByRole('combobox').selectOption('scouts');
  await expect(page).toHaveURL(/rush=scouts/);
  expect(hashParams(page.url()).has('me')).toBe(false);
  await expect(page.getByRole('region', { name: '通用早期应对' })).toContainText('当前：「肉马」');
  await expect(practice.getByRole('link', { name: /打开 PK 演练：/ })).toContainText('长矛兵');
  await expect(page.getByText('可复制地址栏链接分享这对阵')).toHaveCount(0);
  await page.locator('#ma').click();
  await page.locator('.cp-panel [data-civ="Mongols"]').click();
  await expect(page).toHaveURL(/me=Mongols/);
  await expect(page).toHaveURL(/opp=Britons/);
  await expect(page).toHaveURL(/rush=scouts/);
  await expect(page.getByText('可复制地址栏链接分享这对阵')).toBeVisible();
  await expect(page.getByRole('link', { name: '单位 PK，不自动带入当前双方' })).toHaveAttribute('href', '#/duel');
});

test('#939 未选齐不渲染跟对阵走的入口，通用 PK 和早期稿仍在', async ({ page }) => {
  await page.goto('./#/matchup?pair=explicit');
  await expect(page.getByRole('status')).toContainText('请补选双方文明后查看跟对阵走的入口。');
  await expect(page.getByRole('navigation', { name: '跟这对文明走的开局与文明页' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: '可按当前文明核对的练习' })).toHaveCount(0);
  await expect(page.locator('#mres')).toHaveCount(0);
  await expect(page.getByRole('link', { name: '单位 PK，不自动带入当前双方' })).toHaveAttribute('href', '#/duel');
  await expect(page.getByRole('region', { name: '通用早期应对' })).toContainText('何时开始应对');
  await expect(page.getByText('选定双方文明后，会按对手登记类型取出通用对照表')).toBeVisible();
  await expect(page.getByText('当前我方暂无可用的类型对照单位')).toHaveCount(0);
});

test('#939 无资格时不画演练入口，只显示真实不可用提示', async ({ page }) => {
  await page.goto('./#/matchup?me=Franks&opp=Incas&rush=militia');
  await expect(page.locator('#mres')).toBeVisible();
  const practice = page.getByRole('region', { name: '可按当前文明核对的练习', exact: true });
  await expect(practice.getByRole('link', { name: /打开 PK 演练/ })).toHaveCount(0);
  await expect(practice).toContainText('对手印加在封建时代不可用民兵，当前演练不适用。');
});

test('#939 390 宽不横向溢出，深色仍能读到两个分区', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('aoe2-theme', 'dark'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/matchup');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('#mres')).toBeVisible();
  await expectTaskLayout(page, false);
  await expect(page.getByRole('heading', { name: '通用参考', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '可按当前文明核对的练习' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await pick(page, 'ma', 'Mayans');
  await pick(page, 'me', 'Britons');
  await page.getByRole('region', { name: '可按当前文明核对的练习' }).getByRole('combobox').selectOption('archers');
  await expect(page.locator('#mres > p.note').filter({ hasText: /^弓手：/ })).not.toContainText(/骑兵|轻骑|骑射/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
