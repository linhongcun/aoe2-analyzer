import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const pins = JSON.parse(readFileSync(new URL('../../scripts/data_sources.json', import.meta.url), 'utf8')) as { patch: { build: number } };

const SIDES = 'a=569.Franks.4.f.&b=359.Japanese.4.f.';
const MODES = [
  { name: '1v1', query: `${SIDES}&m=1&be=1`, unavailable: false },
  { name: 'N vs M', query: `${SIDES}&m=n&na=10&nb=8&be=1`, unavailable: false },
  { name: '等资源', query: 'a=359.Byzantines.4.f.&b=569.Franks.4.f.&m=r&bud=3000', unavailable: false },
  { name: '等采集时间', query: `${SIDES}&m=t&vil=10&min=10`, unavailable: false },
  { name: '一方单位不可用', query: 'a=569.Britons.4.f.&b=359.Japanese.4.f.&m=1', unavailable: true },
  { name: '双方单位不可用', query: 'a=569.Britons.4.f.&b=569.Japanese.4.f.&m=1', unavailable: true },
] as const;

async function go(page: Page, query: string, unavailable = false) {
  await page.goto(`./#/duel?${query}`);
  await expect(page.locator(unavailable ? '#duel-pending' : '#duel-res')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

async function expand(page: Page) {
  await page.locator('#duel details').evaluateAll((elements) => {
    elements.forEach((element) => {
      (element as HTMLDetailsElement).open = true;
    });
  });
}

async function noSkippedLevel(page: Page, context: string) {
  const result = await new AxeBuilder({ page }).include('#duel').withRules(['heading-order']).analyze();
  expect(
    result.violations.map((violation) => ({ id: violation.id, targets: violation.nodes.map((node) => node.target) })),
    context,
  ).toEqual([]);
  await expect(page.locator('#duel').getByRole('heading', { level: 1, name: '单位 PK', exact: true })).toHaveCount(1);
  await expect(page.locator('.duel-head').getByRole('heading', { level: 2 })).toHaveCount(2);
}

for (const width of [360, 375, 390, 1280]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`#364 四宽明暗展开态 ${width} ${theme}`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await go(page, MODES[0].query);
      await expand(page);
      await noSkippedLevel(page, `${width} ${theme}`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`duel-heading-${width}-${theme}.png`), fullPage: true, animations: 'disabled' });
      expect(errors).toEqual([]);
    });
  }
}

for (const item of MODES) {
  for (const expanded of [false, true]) {
    test(`#364 ${item.name} ${expanded ? '展开全部详情' : '默认'}无标题跳级`, async ({ page }) => {
      await go(page, item.query, item.unavailable);
      if (expanded) await expand(page);
      await noSkippedLevel(page, item.name);
    });
  }
}

test('#364 升级比较与条件瓦兰吉加成标题也纳入相同大纲', async ({ page }) => {
  await go(page, `a=38.Byzantines.3.67.&b=38.Byzantines.3..&m=1&base=38.Byzantines.3..&fixed=38.Byzantines.3..&basev=${pins.patch.build}`);
  await expand(page);
  await expect(page.locator('[data-t="upgrade-before"]')).toBeVisible();
  await noSkippedLevel(page, '有已保存基准的升级比较');
  await go(page, 'a=2704.Varangians.4.f.&b=567.Teutons.4.f.&m=1');
  await expand(page);
  await expect(page.locator('[data-t="pk-vg"]')).toBeVisible();
  await noSkippedLevel(page, '条件瓦兰吉加成');
});

for (const query of [
  'a=359.Byzantines.4.f.&b=569.Franks.4.f.&m=r&bud=3000',
  'a=24.Koreans.3.c.&b=569.Franks.4.f.&m=r&bud=3000',
  'a=441.Magyars.4.f.&b=359.Japanese.4.f.&m=r&bud=3000',
]) {
  test(`#364 费用来源浮层展开后无标题跳级 ${query.split('&')[0]}`, async ({ page }) => {
    await go(page, query);
    await expand(page);
    await page.locator('#duel-a [data-t="pk-src-btn"]').first().click();
    await expect(page.locator('#duel-a [data-t="pk-pop"]')).toBeVisible();
    await noSkippedLevel(page, '费用来源浮层');
  });
}

test('#364 采集时间口径浮层展开后无标题跳级', async ({ page }) => {
  await go(page, `${SIDES}&m=t&vil=10&min=10`);
  await expand(page);
  await page.locator('#duel-a [data-t="rc-basis-btn"]').click();
  await expect(page.locator('#duel-a [data-t="rc-pop"]')).toBeVisible();
  await noSkippedLevel(page, '采集时间口径浮层');
});

const PANEL_TITLE = '科技模拟器 选择文明与科技，查看属性变化与累计研究费用';
for (const [route, children] of [
  [
    '/unit/38/Franks/4/?tab=sim',
    ['马厩', '铁匠铺', '城堡（独特科技）', '城堡', '团队加成（开关）', '累计研究费用（0 项）', '克制加成 / Bonus damage', '护甲类别（防御）'],
  ],
  [
    '/building/82?tab=sim&civ=Britons&age=4',
    ['城堡', '铁匠铺', '城镇中心', '大学', '城堡（独特科技）', '团队加成（开关）', '累计研究费用（0 项）', '克制加成 / Bonus damage'],
  ],
] as const) {
  test(`#364 共享模拟器默认标题层级保留 ${route}`, async ({ page }) => {
    await page.goto(`./#${route}`);
    const panel = page.locator('#sim');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('heading', { level: 3, name: /科技模拟器/ })).toHaveCount(1);
    await expect(panel.locator('.simg > h4')).not.toHaveCount(0);
    // Freeze semantic identities, not axe's incidental CSS-selector spelling.
    // The baseline's page-level h1→this h3 report is outside this Duel repair.
    expect(
      await panel
        .getByRole('heading')
        .evaluateAll((headings) => headings.map((heading) => ({ tag: heading.tagName, text: heading.textContent!.replace(/\s+/g, ' ').trim() }))),
    ).toEqual([{ tag: 'H3', text: PANEL_TITLE }, ...children.map((text) => ({ tag: 'H4', text }))]);
    const result = await new AxeBuilder({ page }).include('main').withRules(['heading-order']).analyze();
    const violations = await Promise.all(
      result.violations.map(async (violation) => ({
        id: violation.id,
        targets: await Promise.all(
          violation.nodes.map(async (node) => {
            const selector = node.target[0];
            if (typeof selector !== 'string') throw new Error('Unexpected non-document heading target');
            return page.locator(selector).evaluate((heading) => ({ tag: heading.tagName, text: heading.textContent!.replace(/\s+/g, ' ').trim() }));
          }),
        ),
      })),
    );
    expect(violations).toEqual([{ id: 'heading-order', targets: [{ tag: 'H3', text: PANEL_TITLE }] }]);
    if (route.startsWith('/unit/')) {
      await page.goto('./#/unit/38');
      await page.locator('[data-t="rc-basis-btn"]').first().click();
      await expect(page.locator('[data-t="rc-pop"]').getByRole('heading', { level: 4, name: '采集时间怎么算', exact: true })).toBeVisible();
    }
  });
}
