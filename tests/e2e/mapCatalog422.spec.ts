import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

test('#688 @1280 SD3合集全图中英检索且保留标准目录', async ({ page }) => {
  await page.goto('./#/maps');
  await expect(page.getByRole('heading', { name: '地图与开局', exact: true })).toBeVisible();
  const standard = page.getByRole('searchbox', { name: '搜索地图', exact: true });
  await expect(page.getByRole('navigation', { name: '选择地图' }).locator('button')).toHaveCount(83);
  await standard.fill('Holy Hollow');
  await expect(page.locator('.map-result-count')).toContainText('没有匹配的地图');
  console.log(
    JSON.stringify({
      version: await page.locator('[data-t="footer-app-version"]').innerText(),
      build: await page.locator('[data-t="footer-build"]').innerText(),
      standardHolyHollow: await page.locator('.map-result-count').innerText(),
      hasTournamentCollection: await page.getByTestId('sd3-collection').count(),
    }),
  );
  await page.screenshot({ path: test.info().outputPath('sd3-before.png'), fullPage: true });
  await page.getByRole('button', { name: '清除筛选', exact: true }).click();
  const topic = page.getByTestId('map-sd3');
  await topic.locator('summary').first().click();
  const collection = page.getByTestId('sd3-collection');
  await expect(collection.locator('summary')).toBeVisible();
  await collection.locator('summary').click();
  await expect(collection).toContainText('赛事版本');
  await expect(collection).toContainText('本站检索译名');
  await expect(collection).toContainText('2026-11-04');
  await expect(collection.getByRole('link', { name: '主办方赛事公开手册', exact: true })).toHaveAttribute(
    'href',
    'https://www.twestaoe.net/events/suddendessaster3',
  );
  const cards = collection.locator('.sd3-card');
  await expect(cards).toHaveCount(11);
  await expect(collection.getByText('暂无预览', { exact: true })).toHaveCount(11);
  await expect(collection.locator('img')).toHaveCount(0);
  expect(await collection.innerText()).not.toMatch(/必胜|\d+(?:\.\d+)?%\s*胜率/);
  const search = collection.getByRole('searchbox', { name: '搜索猝死赛事地图', exact: true });
  const names = [
    ['Arena', '竞技场'],
    ['Canberra', '堪培拉'],
    ['Hideout', '藏身之处'],
    ['Holy Hollow', '圣谷'],
    ['Kerak', '凯拉克'],
    ['Mauerfall', '倒墙'],
    ['Mesa Verde', '梅萨维德'],
    ['Monkey Island', '猴岛'],
    ['Mountain Forward', '山前据点'],
    ['Thin Ice', '薄冰'],
    ['ZeWalls', '交错城墙'],
  ];
  for (const [en, zh] of names) {
    for (const term of [en!, zh!]) {
      await search.fill(term);
      await expect(search).toBeFocused();
      await expect(cards).toHaveCount(1);
      await expect(cards.getByRole('heading', { level: 4 })).toContainText(en!);
      await expect(cards.getByRole('heading', { level: 4 })).toContainText(zh!);
      expect((await cards.locator('.sd3-tip').innerText()).trim().length).toBeGreaterThan(10);
    }
  }
  await collection.getByRole('button', { name: '清除赛事搜索', exact: true }).click();
  await expect(cards).toHaveCount(11);
  await expect(standard).toHaveValue('');
  await expect(page.locator('.map-guide article')).toHaveCount(1);
  await expect(page.locator('#map-details')).toHaveAttribute('data-map-id', 'arabia');
});

interface CatalogMap {
  id: string;
  name: string;
  en: string;
  preview: { image: string; width: number; height: number };
}

const catalog = JSON.parse(readFileSync('src/data/mapCatalog.json', 'utf8')) as { maps: CatalogMap[] };
const errors = new WeakMap<Page, string[]>();
const choices = (page: Page) => page.getByRole('navigation', { name: '选择地图' }).locator('button[aria-controls="map-details"]');

test.beforeEach(async ({ page }) => {
  const caught: string[] = [];
  errors.set(page, caught);
  page.on('pageerror', (error) => caught.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') caught.push(message.text());
  });
});

test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('#422 黑森林作为常见入口可直接选择', async ({ page }) => {
  await page.goto('./#/maps');
  await expect(choices(page)).toHaveCount(catalog.maps.length);
  await expect(page.getByRole('article', { name: '阿拉伯半岛 Arabia', exact: true })).toBeVisible();
  const choice = page.getByRole('navigation', { name: '选择地图' }).getByRole('button', { name: '黑森林 Black Forest', exact: true });
  await expect(choice).toBeVisible();
  await choice.click();
  await expect(page.getByRole('article', { name: '黑森林 Black Forest', exact: true })).toBeVisible();
  await expect(choice).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#map-details')).toBeFocused();
});

test('#422 搜索归一化、地形筛选与无结果恢复不抢焦点', async ({ page }) => {
  await page.goto('./#/maps');
  const nav = page.getByRole('navigation', { name: '选择地图' });
  const search = page.getByRole('searchbox', { name: '搜索地图', exact: true });
  const group = page.getByRole('combobox', { name: '地图类型', exact: true });
  const clear = page.getByRole('button', { name: '清除筛选', exact: true });
  await nav.getByRole('button', { name: '开道 Michi', exact: true }).click();
  for (const query of ['黑森', 'Black Forest', 'blackforest', 'BLACK-FOREST', 'BF', 'rm_black-forest']) {
    await search.fill(query);
    await expect(search).toBeFocused();
    await expect(choices(page)).toHaveCount(1);
    await expect(nav.getByRole('button', { name: '黑森林 Black Forest', exact: true })).toBeVisible();
    await expect(page.getByRole('article', { name: '黑森林 Black Forest', exact: true })).toBeVisible();
  }
  await clear.click();
  await expect(page.getByRole('article', { name: '黑森林 Black Forest', exact: true })).toBeVisible();
  await expect(page.locator('#map-details')).not.toBeFocused();
  await group.focus();
  await group.selectOption('closed');
  await expect(group).toBeFocused();
  await expect(nav.getByRole('button', { name: '黑森林 Black Forest', exact: true })).toBeVisible();
  await expect(nav.getByRole('button', { name: '阿拉伯半岛 Arabia', exact: true })).toHaveCount(0);
  await search.fill('Arabia');
  await expect(choices(page)).toHaveCount(0);
  await expect(page.locator('.map-guide article')).toHaveCount(0);
  await expect(page.getByText(/没有.*地图/)).toBeVisible();
  await expect(clear).toHaveCount(1);
  await clear.click();
  await expect(search).toHaveValue('');
  await expect(group).toHaveValue('all');
  await expect(page.getByRole('article', { name: '黑森林 Black Forest', exact: true })).toBeVisible();
});

test('#422 中文重名地图以英文和ID区分', async ({ page }) => {
  await page.goto('./#/maps');
  const nav = page.getByRole('navigation', { name: '选择地图' });
  const search = page.getByRole('searchbox', { name: '搜索地图', exact: true });
  await search.fill('浅滩');
  await expect(choices(page)).toHaveCount(2);
  await nav.getByRole('button', { name: '浅滩（Wade） Wade', exact: true }).click();
  await expect(page.getByRole('article', { name: '浅滩（Wade） Wade', exact: true })).toContainText('船只无法航行');
  await nav.getByRole('button', { name: '浅滩（Shoals） Shoals', exact: true }).click();
  await expect(page.getByRole('article', { name: '浅滩（Shoals） Shoals', exact: true })).toContainText('征服大海');
  await search.fill('沼泽');
  for (const en of ['Bogland', 'Morass']) {
    await nav.getByRole('button', { name: `沼泽 ${en}`, exact: true }).click();
    await expect(page.getByRole('article', { name: `沼泽 ${en}`, exact: true })).toBeVisible();
  }
});

for (const width of [360, 375, 390, 1280]) {
  test(`#668 @${width} 两张浅滩在向导与目录主名可区分`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./#/');
    await page.getByRole('button', { name: /1v1 随机地图/ }).click();
    await page.getByRole('searchbox', { name: '搜索地图', exact: true }).fill('浅滩');
    const maps = page.getByTestId('start-step').locator('.start-map');
    await expect(maps).toHaveCount(2);
    await expect(maps.locator('b')).toHaveText(['浅滩（Shoals）', '浅滩（Wade）']);
    for (const id of ['shoals', 'wade']) await expect(maps.locator(`img[src$="/${id}.webp"]`)).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath('home-maps.png'), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.goto('./#/maps');
    await page.getByRole('searchbox', { name: '搜索地图', exact: true }).fill('浅滩');
    await expect(choices(page)).toHaveCount(2);
    await expect(choices(page).locator('.map-row-zh')).toHaveText(['浅滩（Shoals）', '浅滩（Wade）']);
    await page.screenshot({ path: testInfo.outputPath('catalog-maps.png'), fullPage: true });
  });
}

test('#422 全部目录预览可解码，非方图不裁切', async ({ page }) => {
  await page.goto('./#/maps');
  expect(catalog.maps).toHaveLength(83);
  await expect(choices(page)).toHaveCount(catalog.maps.length);
  await expect(page.getByRole('button', { name: /展开其余/ })).toHaveCount(0);
  const nav = page.getByRole('navigation', { name: '选择地图' });
  for (const map of catalog.maps) {
    const thumbnail = nav.getByRole('button', { name: `${map.name} ${map.en}`, exact: true }).locator('img');
    await thumbnail.scrollIntoViewIfNeeded();
    await expect(thumbnail).toHaveAttribute('src', new RegExp(`/img/maps/${map.id}[.]webp$`));
    await expect
      .poll(() => thumbnail.evaluate((image: HTMLImageElement) => ({ loaded: image.complete, width: image.naturalWidth, height: image.naturalHeight })))
      .toEqual({ loaded: true, width: map.preview.width, height: map.preview.height });
  }
  await nav.getByRole('button', { name: '阿塔卡马 Atacama', exact: true }).click();
  const detail = page.getByRole('article', { name: '阿塔卡马 Atacama', exact: true });
  const preview = detail.getByRole('img', { name: /地图预览/ });
  await expect
    .poll(() => preview.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth === 423 && image.naturalHeight === 420))
    .toBe(true);
  const box = await preview.boundingBox();
  expect(box!.width).toBeCloseTo(224, 0);
  expect(box!.width / box!.height).toBeCloseTo(423 / 420, 2);
  await expect(choices(page)).toHaveCount(catalog.maps.length);
  await expect(nav.getByRole('button', { name: '阿塔卡马 Atacama', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(detail).toBeVisible();
});

test('#688 @1280 赛事搜索恢复与标准筛选独立，真实预填拆主城', async ({ page }) => {
  await page.goto('./#/maps');
  await page.getByTestId('map-sd3').locator('summary').first().click();
  const collection = page.getByTestId('sd3-collection'),
    summary = collection.locator('summary');
  await summary.focus();
  await summary.press('Enter');
  const search = collection.getByRole('searchbox', { name: '搜索猝死赛事地图', exact: true });
  for (const term of [' HOLY-HOLLOW ', 'holy_hollow', '圣谷']) {
    await search.fill(term);
    await expect(collection.locator('.sd3-card')).toHaveCount(1);
    await expect(collection.getByRole('heading', { level: 4 })).toContainText('Holy Hollow');
    await expect(search).toBeFocused();
  }
  const standard = page.getByRole('searchbox', { name: '搜索地图', exact: true });
  await standard.fill('Arena');
  await page.getByRole('navigation', { name: '选择地图' }).getByRole('button', { name: '竞技场 Arena', exact: true }).click();
  await expect(search).toHaveValue('圣谷');
  await expect(collection.locator('.sd3-card')).toHaveCount(1);
  await expect(page.locator('#map-details')).toHaveAttribute('data-map-id', 'arena');
  await page.getByRole('combobox', { name: '地图类型', exact: true }).selectOption('water');
  await expect(page.locator('.map-guide article')).toHaveCount(0);
  await expect(collection.getByRole('heading', { level: 4 })).toContainText('Holy Hollow');
  await page.getByRole('button', { name: '清除筛选', exact: true }).click();
  await expect(page.locator('#map-details')).toHaveAttribute('data-map-id', 'arena');
  await search.fill('no-such-sd3-map');
  await expect(collection.getByRole('status')).toContainText('没有匹配的赛事地图');
  await expect(collection.locator('.sd3-card')).toHaveCount(0);
  await summary.focus();
  await summary.press('Enter');
  await expect(search).not.toBeVisible();
  await summary.press('Enter');
  await expect(search).toHaveValue('no-such-sd3-map');
  await collection.getByRole('button', { name: '清除赛事搜索', exact: true }).click();
  await expect(collection.locator('.sd3-card')).toHaveCount(11);
  await expect(page.locator('.map-result-count')).toContainText(`${catalog.maps.length} / ${catalog.maps.length}`);
  await expect(page.locator('#map-details')).toHaveAttribute('data-map-id', 'arena');
  await expect(collection).toContainText('不模拟赛事特殊机关或多主城失败条件');
  await collection.getByRole('link', { name: '用攻城拆建筑估算拆主城', exact: true }).click();
  await expect(page.getByTestId('siege-page')).toBeVisible();
  await expect(page.getByRole('combobox', { name: '攻城单位', exact: true })).toHaveValue('1258');
  await expect(page.getByRole('spinbutton', { name: '数量', exact: true })).toHaveValue('1');
  await expect(page.getByRole('combobox', { name: '目标建筑', exact: true })).toHaveValue('109');
  await expect(page.getByTestId('siege-result')).toBeVisible();
});

for (const width of [360, 375, 390, 1280]) {
  test(`#688 @${width} 猝死合集四状态、键盘与布局`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((theme) => localStorage.setItem('aoe2-theme', theme), width === 390 ? 'dark' : 'light');
    const external: string[] = [];
    await page.route('**/*', (route) => {
      if (new URL(route.request().url()).origin !== new URL(info.project.use.baseURL!).origin) {
        external.push(route.request().url());
        return route.abort();
      }
      return route.continue();
    });
    await page.goto('./#/maps');
    await page.getByTestId('map-sd3').locator('summary').first().click();
    const collection = page.getByTestId('sd3-collection'),
      summary = collection.locator('summary');
    const capture = async (state: string) => {
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const controls = await collection.locator('summary,input,button,a').evaluateAll((nodes) =>
        nodes
          .filter((n) => n.getClientRects().length)
          .map((n) => {
            const r = n.getBoundingClientRect();
            return { text: n.textContent?.trim(), width: r.width, height: r.height };
          }),
      );
      expect(controls.length).toBeGreaterThan(0);
      for (const box of controls) {
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      const sizes = await collection
        .locator('p,span,label,a,h3,h4')
        .evaluateAll((nodes) => nodes.filter((n) => n.getClientRects().length).map((n) => parseFloat(getComputedStyle(n).fontSize)));
      expect(sizes.every((size) => size >= 12)).toBe(true);
      const options = { path: info.outputPath(`sd3-${state}-${width}.png`), style: 'header.topbar, .skip-link {visibility:hidden!important;}' };
      if (state === 'folded') await page.screenshot(options);
      else await collection.screenshot(options);
      console.log(
        JSON.stringify({
          width,
          state,
          version: await page.locator('[data-t="footer-app-version"]').innerText(),
          build: await page.locator('[data-t="footer-build"]').innerText(),
          controls,
        }),
      );
    };
    await expect(collection.locator('.sd3-cards')).not.toBeVisible();
    await capture('folded');
    await summary.focus();
    await summary.press('Enter');
    await expect(collection.locator('.sd3-card')).toHaveCount(11);
    await capture('all');
    expect((await new AxeBuilder({ page }).include('[data-testid="sd3-collection"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
    const search = collection.getByRole('searchbox', { name: '搜索猝死赛事地图', exact: true });
    await search.fill('猴岛');
    await expect(collection.getByRole('heading', { level: 4 })).toContainText('Monkey Island');
    await capture('hit');
    await search.fill('no-such-sd3-map');
    await expect(collection.getByRole('status')).toContainText('没有匹配的赛事地图');
    await expect(collection.locator('.sd3-card')).toHaveCount(0);
    await capture('empty');
    await collection.getByRole('button', { name: '清除赛事搜索', exact: true }).click();
    await expect(collection.locator('.sd3-card')).toHaveCount(11);
    expect(external).toEqual([]);
  });
}
