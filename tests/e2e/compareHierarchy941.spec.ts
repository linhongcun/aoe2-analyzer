import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const civs = JSON.parse(readFileSync(new URL('../../src/data/civs.json', import.meta.url), 'utf8')) as {
  en: string;
  zh: string;
  s: number[];
}[];
const ratings = JSON.parse(readFileSync(new URL('../../scripts/civ_ratings.json', import.meta.url), 'utf8')) as {
  verifiedAt: string;
  basis: { axisGap: string; axes: string[]; highlight: string; positions: { source: string } };
};

const SUMMARY =
  '八维分数是维护者整理的 1–10 整数，用来对照和画雷达，不是胜率或精确战力。各轴没有单独的量化规则，规则待核。分数适用的游戏补丁未知。同一分数没有按地图、时代或打法拆开，这些边界未知。可复查的记录是维护者主观判断，没有逐条出处，缺出处的部分待核。旧说明写过团战排位社区的普遍看法。这份文件没有可复查的社区出处，该依据待核，不能当成已证实来源。文件复核日 2026-11-10 只表示本文件结构和口径查过，不是逐文明重打分，也不表示已经对齐当前资料版本。';

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
  await expect(page.getByRole('heading', { name: '完整评分口径', exact: true })).toHaveCount(0);
  const summary = await page.getByTestId('compare-rating-summary').boundingBox();
  const facts = await page.locator('#compare-facts').boundingBox();
  expect(facts!.y + facts!.height).toBeLessThanOrEqual(summary!.y);
  await expect(page.locator('#compare-facts tbody tr')).toHaveCount(6);
  await expect(page.locator('#ctab tr', { hasText: '海军' })).toBeVisible();
  await expect(page.locator('#crd')).toBeVisible();
  await expect(page.getByTestId('compare-legend')).toBeVisible();
  const sticky = await page.getByTestId('compare-rating-basis').evaluate((el) => getComputedStyle(el).position);
  expect(sticky).not.toBe('sticky');
});

test('#941 展开完整口径后可收起，shot 与 basis 不改变默认收起', async ({ page }) => {
  await page.goto('./#/compare?a=Franks&b=Britons&shot=1&basis=open');
  await expect(page.getByRole('heading', { name: '完整评分口径', exact: true })).toHaveCount(0);
  await expect(page.locator('#compare')).not.toContainText('审阅');
  const toggle = page.getByRole('button', { name: '查看完整评分口径', exact: true });
  await toggle.click();
  const full = page.getByTestId('compare-rating-full');
  await expect(full).toBeVisible();
  await expect(full).toContainText('可在此核对各轴名称');
  for (const axis of ratings.basis.axes) await expect(full.getByRole('listitem').filter({ hasText: axis })).toBeVisible();
  const gapCount = await full.evaluate((el, gap) => el.innerText.split(gap).length - 1, ratings.basis.axisGap);
  expect(gapCount).toBe(0);
  await expect(full).toContainText(ratings.basis.highlight);
  await expect(full).toContainText('不由这些分数推导');
  await page.getByRole('button', { name: '收起完整评分口径', exact: true }).click();
  await expect(full).toHaveCount(0);
  await expect(page.getByTestId('compare-rating-summary')).toBeVisible();
});

test('#941 390 不隐藏摘要，深色下高分仍用强调色', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/compare?a=Franks&b=Britons');
  const summary = page.getByTestId('compare-rating-summary');
  await expect(summary).toBeVisible();
  await expect(summary).toContainText('不能当成已证实来源');
  const box = await summary.boundingBox();
  const facts = await page.locator('#compare-facts').boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(facts!.y + facts!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await summary.evaluate((el) => getComputedStyle(el).display)).not.toBe('none');
  await page.getByRole('button', { name: '菜单' }).click();
  await page.getByRole('radio', { name: '深色' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(summary).toBeVisible();
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
