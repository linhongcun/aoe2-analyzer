import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

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
  await go(page, 'a=38.Byzantines.3.67.&b=38.Byzantines.3..&m=1&base=38.Byzantines.3..&fixed=38.Byzantines.3..&basev=185872');
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

for (const route of ['/unit/38/Franks/4/?tab=sim', '/building/82?tab=sim&civ=Britons&age=4']) {
  test(`#364 共享模拟器默认标题层级保留 ${route}`, async ({ page }) => {
    await page.goto(`./#${route}`);
    const panel = page.locator('#sim');
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('heading', { level: 3, name: /科技模拟器/ })).toHaveCount(1);
    await expect(panel.locator('.simg > h4')).not.toHaveCount(0);
    // a0ed295 actual control: the panel keeps one h3 + eight h4 children;
    // its pre-existing page-level h1→h3 report is outside this Duel repair.
    expect(await panel.getByRole('heading').evaluateAll((headings) => headings.map((heading) => heading.tagName))).toEqual(['H3', ...Array(8).fill('H4')]);
    const result = await new AxeBuilder({ page }).include('main').withRules(['heading-order']).analyze();
    expect(result.violations.map((violation) => ({ id: violation.id, targets: violation.nodes.map((node) => node.target) }))).toEqual([
      { id: 'heading-order', targets: [['h3']] },
    ]);
    if (route.startsWith('/unit/')) {
      await page.goto('./#/unit/38');
      await page.locator('[data-t="rc-basis-btn"]').first().click();
      await expect(page.locator('[data-t="rc-pop"]').getByRole('heading', { level: 4, name: '采集时间怎么算', exact: true })).toBeVisible();
    }
  });
}
