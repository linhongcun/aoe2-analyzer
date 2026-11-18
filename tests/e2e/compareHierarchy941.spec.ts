import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const civs = JSON.parse(readFileSync(new URL('../../data/game/civs.json', import.meta.url), 'utf8')) as {
  en: string;
  zh: string;
  s: number[];
}[];
const ratings = JSON.parse(readFileSync(new URL('../../data/sources/civ_ratings.json', import.meta.url), 'utf8')) as {
  verifiedAt: string;
  basis: { axisGap: string; axes: string[]; highlight: string; positions: { source: string } };
};

const SUMMARY =
  '八维分数是维护者整理的 1–10 整数，用来对照和画雷达，不是胜率或精确战力。各轴没有单独的量化规则，规则待核。分数适用的游戏补丁未知。同一分数没有按地图、时代或打法拆开，这些边界未知。可复查的记录是维护者主观判断，没有逐条出处，缺出处的部分待核。旧说明写过团战排位社区的普遍看法。这份文件没有可复查的社区出处，该依据待核，不能当成已证实来源。文件复核日 2026-11-10 只表示本文件结构和口径查过，不是逐文明重打分，也不表示已经对齐当前资料版本。';
const PAGE_LEDE = '选定两个文明，先对照文明资料，再按需参考开局示例与主观分数。分数不是胜率或精确战力。';
const FACT_NOTE = '以下四项是文明机制资料，不由主观分数推导。';
const OPENINGS_TITLE = '参考开局（打法示例）';
const OPENINGS_NOTE = '以下开局由维护者整理，仅作可选打法示例，不是官方推荐，也不由评分推导。请按地图、对手和当前局势调整。';
const RUBRIC_NOTE = '特色兵种、城堡科技、帝王科技和团队加成属于资料对照；参考开局另列为维护者整理的可选打法示例。两者均不由这些分数推导。';

const hashQuery = (page: Page) => new URLSearchParams(new URL(page.url()).hash.split('?')[1] ?? '');

async function choose(page: Page, side: 'a' | 'b', en: string) {
  await page.locator(side === 'a' ? '#ca' : '#cb').click();
  await page.locator(`.cp-panel [role="option"][data-civ="${en}"]`).click();
  await expect(page.locator(side === 'a' ? '#ca' : '#cb')).toHaveAttribute('data-value', en);
}

test('#941 资料先于主观评分，短摘要、表和雷达完整保留', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/compare?a=Franks&b=Britons');
  await expect(page.getByTestId('compare-rating-summary')).toHaveText(SUMMARY);
  await expect(page.locator('#compare .lhead')).toContainText(PAGE_LEDE);
  await expect(page.getByRole('heading', { name: '完整评分口径', exact: true })).toHaveCount(0);
  const facts = page.locator('#compare-facts');
  await expect(facts).toContainText(FACT_NOTE);
  await expect(facts.locator('tbody tr')).toHaveCount(5);
  await expect(facts).not.toContainText('参考开局');
  for (const label of ['特色兵种', '城堡科技', '帝王科技', '团队加成']) await expect(facts).toContainText(label);
  const openings = page.getByTestId('compare-openings');
  await expect(openings).toBeVisible();
  await expect(openings.getByRole('heading', { name: OPENINGS_TITLE, exact: true })).toBeVisible();
  await expect(openings).toContainText(OPENINGS_NOTE);
  const openingA = page.getByTestId('compare-opening-a');
  const openingB = page.getByTestId('compare-opening-b');
  await expect(openingA).toContainText('文明 A · 法兰克');
  await expect(openingB).toContainText('文明 B · 不列颠');
  const franksText = await openingA.innerText();
  expect(franksText.indexOf('侦察骑兵')).toBeLessThan(franksText.indexOf('速城堡骑士'));
  expect(franksText.indexOf('速城堡骑士')).toBeLessThan(franksText.indexOf('侠客/圣骑士'));
  const britonsText = await openingB.innerText();
  expect(britonsText.indexOf('速封建弓箭手')).toBeLessThan(britonsText.indexOf('城堡弩兵'));
  expect(britonsText.indexOf('城堡弩兵')).toBeLessThan(britonsText.indexOf('帝王长弓手'));
  const factBox = await facts.boundingBox();
  const openingBox = await openings.boundingBox();
  const scoreHeading = await page.getByRole('heading', { name: '主观评分参考', exact: true }).boundingBox();
  expect(factBox!.y + factBox!.height).toBeLessThanOrEqual(openingBox!.y);
  expect(openingBox!.y + openingBox!.height).toBeLessThanOrEqual(scoreHeading!.y);
  const boxA = await openingA.boundingBox();
  const boxB = await openingB.boundingBox();
  expect(boxB!.x).toBeGreaterThanOrEqual(boxA!.x + boxA!.width);
  await expect(page.locator('#ctab tr', { hasText: '海军' })).toBeVisible();
  await expect(page.locator('#crd')).toBeVisible();
  await expect(page.getByTestId('compare-legend')).toBeVisible();
  const sticky = await page.getByTestId('compare-rating-basis').evaluate((el) => getComputedStyle(el).position);
  expect(sticky).not.toBe('sticky');
});

test('#1141 360 窄屏纵向展示两个有文字归属的开局卡片', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('./#/compare?a=Franks&b=Britons');
  const openings = page.getByTestId('compare-openings');
  const openingA = page.getByTestId('compare-opening-a');
  const openingB = page.getByTestId('compare-opening-b');
  await expect(openings).toContainText(OPENINGS_NOTE);
  await expect(openingA).toContainText('文明 A · 法兰克');
  await expect(openingB).toContainText('文明 B · 不列颠');
  const boxA = await openingA.boundingBox();
  const boxB = await openingB.boundingBox();
  expect(boxB!.y).toBeGreaterThanOrEqual(boxA!.y + boxA!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('#1141 更换文明及刷新后开局归属与路线对应', async ({ page }) => {
  await page.goto('./#/compare?a=Franks&b=Britons');
  const openingA = page.getByTestId('compare-opening-a');
  const openingB = page.getByTestId('compare-opening-b');
  const originalA = await openingA.innerText();
  await choose(page, 'b', 'Mongols');
  await expect.poll(() => hashQuery(page).get('b')).toBe('Mongols');
  await expect(openingA).toContainText('文明 A · 法兰克');
  expect(await openingA.innerText()).toBe(originalA);
  await expect(openingB).toContainText('文明 B · 蒙古');
  await expect(openingB).toContainText('骑射/芒古代');
  await expect(openingB).not.toContainText('速封建弓箭手');
  await page.reload();
  await expect(page.locator('#cb')).toHaveAttribute('data-value', 'Mongols');
  await expect(openingA).toContainText('文明 A · 法兰克');
  expect(await openingA.innerText()).toBe(originalA);
  await expect(openingB).toContainText('文明 B · 蒙古');
  await expect(openingB).toContainText('骑射/芒古代');
});

test('#941 展开完整口径后可收起，shot 与 basis 不改变默认收起', async ({ page }) => {
  await page.goto('./#/compare?a=Franks&b=Britons&shot=1&basis=open');
  await expect(page.getByRole('heading', { name: '完整评分口径', exact: true })).toHaveCount(0);
  await expect(page.locator('#compare')).not.toContainText('审阅');
  const toggle = page.getByRole('button', { name: '查看完整评分口径', exact: true });
  const openings = page.getByTestId('compare-openings');
  await expect(openings).toBeVisible();
  await toggle.click();
  const full = page.getByTestId('compare-rating-full');
  await expect(full).toBeVisible();
  await expect(full).toContainText('可在此核对各轴名称');
  for (const axis of ratings.basis.axes) await expect(full.getByRole('listitem').filter({ hasText: axis })).toBeVisible();
  const gapCount = await full.evaluate((el, gap) => el.innerText.split(gap).length - 1, ratings.basis.axisGap);
  expect(gapCount).toBe(0);
  await expect(full).toContainText(ratings.basis.highlight);
  await expect(full).toContainText(RUBRIC_NOTE);
  await expect(openings).toBeVisible();
  await page.getByRole('button', { name: '收起完整评分口径', exact: true }).click();
  await expect(full).toHaveCount(0);
  await expect(page.getByTestId('compare-rating-summary')).toBeVisible();
  await expect(openings).toBeVisible();
});

test('#941 390 不隐藏摘要，深色下高分仍用强调色', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/compare?a=Franks&b=Britons');
  const summary = page.getByTestId('compare-rating-summary');
  await expect(summary).toBeVisible();
  await expect(summary).toContainText('不能当成已证实来源');
  const box = await summary.boundingBox();
  const facts = await page.locator('#compare-facts').boundingBox();
  const openings = page.getByTestId('compare-openings');
  const openingBox = await openings.boundingBox();
  expect(openingBox!.y).toBeGreaterThanOrEqual(facts!.y + facts!.height);
  expect(box!.y).toBeGreaterThanOrEqual(openingBox!.y + openingBox!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await summary.evaluate((el) => getComputedStyle(el).display)).not.toBe('none');
  await page.getByRole('button', { name: '菜单' }).click();
  await page.getByRole('radio', { name: '深色' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(summary).toBeVisible();
  await expect(page.getByTestId('compare-opening-a')).toContainText('文明 A · 法兰克');
  await expect(page.getByTestId('compare-opening-b')).toContainText('文明 B · 不列颠');
  const colors = await page
    .locator('.compare-higher')
    .first()
    .evaluate((el) => {
      const probe = document.createElement('span');
      document.body.appendChild(probe);
      const read = (token: string) => {
        probe.style.color = `var(${token})`;
        return getComputedStyle(probe).color;
      };
      const got = getComputedStyle(el).color;
      const accent = read('--color-accent');
      const good = read('--color-good');
      const bad = read('--color-bad');
      probe.remove();
      return { got, accent, good, bad, weight: getComputedStyle(el).fontWeight };
    });
  expect(colors.got).toBe(colors.accent);
  expect(colors.got).not.toBe(colors.good);
  expect(colors.got).not.toBe(colors.bad);
  expect(Number(colors.weight)).toBeGreaterThanOrEqual(700);
  await expect(page.locator('#compare')).not.toContainText('赢家');
  await expect(page.locator('#compare')).not.toContainText('总分');
});

test('#941 改选 push 可返回，非法 replace，团队加成带上当前名册', async ({ page }) => {
  await page.goto('./#/civs');
  await page.goto('./#/compare?a=Franks&b=Britons');
  await choose(page, 'b', 'Japanese');
  await expect.poll(() => hashQuery(page).get('b')).toBe('Japanese');
  const team = page.getByRole('link', { name: '查看这两个文明的团队加成来源', exact: true });
  const teamQuery = new URLSearchParams(new URL((await team.getAttribute('href'))!, page.url()).hash.split('?')[1]);
  expect(teamQuery.get('players')).toBe('Franks,Japanese');
  await page.goBack();
  await expect(page.locator('#cb')).toHaveAttribute('data-value', 'Britons');
  await expect.poll(() => hashQuery(page).get('b')).toBe('Britons');

  await page.goto('./#/compare?a=Nope&b=Britons');
  await expect(page.locator('#compare .note[role="status"]')).toHaveText('链接中的文明无效，已整组回退为默认对比。');
  await expect.poll(() => [hashQuery(page).get('a'), hashQuery(page).get('b')]).toEqual(['Franks', 'Britons']);
  await page.goBack();
  await expect(page).toHaveURL(/#\/compare\?a=Franks&b=Britons$/);

  await page.goto('./#/compare?a=Britons');
  await expect(page.locator('#cb')).toHaveAttribute('data-value', 'Armenians');
  await expect(page.locator('#compare .note[role="status"]')).toContainText('链接缺少对手文明，已自动选择「亚美尼亚」');

  await page.goto('./#/compare?a=Franks&b=Franks');
  await expect(page.locator('.compare-higher')).toHaveCount(0);
  await expect(page.locator('#compare .note[role="status"]')).toHaveCount(0);

  const japanese = civs.find((civ) => civ.en === 'Japanese');
  const mongols = civs.find((civ) => civ.en === 'Mongols');
  if (!japanese || !mongols) throw new Error('缺少日本或蒙古');
  await page.goto('./#/compare?a=Japanese&b=Mongols');
  const rows = page.locator('#ctab tbody tr');
  await expect(rows.nth(1).locator('.compare-score').nth(0)).toHaveText(String(japanese.s[0]));
  await expect(rows.nth(1).locator('.compare-score').nth(1)).toHaveText(String(mongols.s[0]));
  const other = page.getByRole('link', { name: '查看这两个文明的团队加成来源', exact: true });
  const otherQuery = new URLSearchParams(new URL((await other.getAttribute('href'))!, page.url()).hash.split('?')[1]);
  expect(otherQuery.get('players')).toBe('Japanese,Mongols');
  await expect(page.getByTestId('compare-position-basis')).toHaveText(ratings.basis.positions.source);
});

test('#941 复制当前对比链接', async ({ page }) => {
  await page.goto('./#/compare?a=Japanese&b=Mongols');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (url: string) => {
          (window as Window & { copied941?: string }).copied941 = url;
        },
      },
    });
  });
  await page.getByRole('button', { name: '复制链接', exact: true }).click();
  await expect(page.locator('#compare .detail-copy [role="status"]')).toHaveText('链接已复制');
  const copied = await page.evaluate(() => (window as Window & { copied941?: string }).copied941);
  const url = new URL(copied ?? '');
  expect(url.pathname.endsWith('/compare/')).toBe(true);
  expect(url.hash).toBe('');
  expect(url.searchParams.get('a')).toBe('Japanese');
  expect(url.searchParams.get('b')).toBe('Mongols');
});
