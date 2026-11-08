import { expect, test, type Page } from '@playwright/test';

// #770：11 个内容页补 h1；标签由 h2 升级为 h1，但视觉保持原样（字体大小/位置不变）。
// 基线度量（修复前 h2，1280×900 / 360×900，pageTop = top + scrollY）：
// 列表页 .lhead 标题 28px/37.8px、margin-top 0、top=151；
// 直排标题页（地图/版本补丁/关于数据）22.5px/30.375px、margin-top 18.675px、top=138（1280）/136（360）；
// 开局时间线 .tl-title 40px/46px、margin-top 8px（360 由既有移动端设计隐藏）。
const LIST_HEADINGS = [
  ['/civs', '文明'],
  ['/units', '单位'],
  ['/techs', '科技'],
  ['/buildings', '建筑'],
  ['/tree/Armenians', '科技树'],
  ['/bonuses', '文明加成'],
  ['/dlc', 'DLC / 资料片'],
] as const;
const PLAIN_HEADINGS = [
  ['/maps', '地图与开局'],
  ['/patches', '版本补丁'],
  ['/about-data', '关于数据'],
] as const;

const LIST_STYLE = { fontSize: '28px', lineHeight: '37.8px', marginTop: '0px', marginBottom: '0px' };
const PLAIN_STYLE = { fontSize: '22.5px', lineHeight: '30.375px', marginTop: '18.675px', marginBottom: '18.675px' };
const TOP_1280 = { list: 151, plain: 138 } as const;
const TOP_360 = { list: 151, plain: 136 } as const;

const failures = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  failures.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(failures.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

async function singleTitle(page: Page, route: string, expected: string, style: Record<string, string>, top: number) {
  await page.goto('./#' + route);
  const h1 = page.locator('h1');
  await expect(h1, `${route} 应有且仅有一个 h1`).toHaveCount(1);
  await expect(h1).toContainText(expected);
  const box = await h1.evaluate((element) => {
    const computed = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      fontSize: computed.fontSize,
      lineHeight: computed.lineHeight,
      marginTop: computed.marginTop,
      marginBottom: computed.marginBottom,
      top: Math.round(rect.top + window.scrollY),
      visible: rect.width > 0 && rect.height > 0,
    };
  });
  expect(box, `${route} h1 视觉应与修复前 h2 一致`).toEqual({ ...style, top, visible: true });
}

for (const [route, expected] of LIST_HEADINGS)
  test(`#770 @1280 列表页 ${route} 有唯一 h1 且视觉不变`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await singleTitle(page, route, expected, LIST_STYLE, TOP_1280.list);
  });

for (const [route, expected] of PLAIN_HEADINGS)
  test(`#770 @1280 ${route} 有唯一 h1 且视觉不变`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await singleTitle(page, route, expected, PLAIN_STYLE, TOP_1280.plain);
  });

for (const [route, expected] of LIST_HEADINGS)
  test(`#770 @360 ${route} 有唯一 h1`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    await singleTitle(page, route, expected, LIST_STYLE, TOP_360.list);
  });

for (const [route, expected] of PLAIN_HEADINGS)
  test(`#770 @360 ${route} 有唯一 h1`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    await singleTitle(page, route, expected, PLAIN_STYLE, TOP_360.plain);
  });

test('#770 @1280 开局时间线与跟练两个视图各有且仅有一个 h1', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/builds?bo=feudal-drush-18');
  const timeline = page.locator('h1');
  await expect(timeline).toHaveCount(1);
  await expect(timeline).toContainText('18 人口封建民兵速攻');
  const box = await timeline.evaluate((element) => {
    const computed = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      fontSize: computed.fontSize,
      lineHeight: computed.lineHeight,
      marginTop: computed.marginTop,
      top: Math.round(rect.top + window.scrollY),
      visible: rect.width > 0 && rect.height > 0,
    };
  });
  expect(box).toEqual({ fontSize: '40px', lineHeight: '46px', marginTop: '8px', top: 279, visible: true });

  await page.goto('./#/builds?bo=feudal-drush-18&view=practice');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.locator('h1')).toContainText('18 人口封建民兵速攻');
});

for (const width of [360, 375, 390, 1280])
  test(`#770 ${width} 宽 11 路由都有唯一 h1、无横向滚动`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const routes = [...LIST_HEADINGS, ...PLAIN_HEADINGS, ['/builds?bo=feudal-drush-18', '18 人口封建民兵速攻']] as const;
    for (const [route, expected] of routes) {
      await page.goto('./#' + route);
      const h1 = page.locator('h1');
      await expect(h1, `${width} 宽 ${route} 应有且仅有一个 h1`).toHaveCount(1);
      await expect(h1).toContainText(expected);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width} 宽 ${route} 不应横向滚动`).toBe(true);
    }
  });

for (const [route, expected] of [
  ['/glossary', '术语与缩写'],
  ['/game-guide', '一局与观赛入门'],
  ['/no-such-page', '找不到该页'],
] as const)
  test(`#770 既有 h1 页面不回退 ${route}`, async ({ page }) => {
    await page.goto('./#' + route);
    const h1 = page.locator('h1');
    await expect(h1).toHaveCount(1);
    await expect(h1).toContainText(expected);
  });
