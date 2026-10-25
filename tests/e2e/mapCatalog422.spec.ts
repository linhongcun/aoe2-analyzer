import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

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
  await expect(choices(page)).toHaveCount(8);
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
  await expect(page.getByRole('article', { name: '开道 Michi', exact: true })).toBeVisible();
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
  await expect(page.getByRole('article', { name: '开道 Michi', exact: true })).toBeVisible();
});

test('#422 中文重名地图以英文和ID区分', async ({ page }) => {
  await page.goto('./#/maps');
  const nav = page.getByRole('navigation', { name: '选择地图' });
  const search = page.getByRole('searchbox', { name: '搜索地图', exact: true });
  await search.fill('浅滩');
  await expect(choices(page)).toHaveCount(2);
  await nav.getByRole('button', { name: '浅滩 Wade', exact: true }).click();
  await expect(page.getByRole('article', { name: '浅滩 Wade', exact: true })).toContainText('船只无法航行');
  await nav.getByRole('button', { name: '浅滩 Shoals', exact: true }).click();
  await expect(page.getByRole('article', { name: '浅滩 Shoals', exact: true })).toContainText('征服大海');
  await search.fill('沼泽');
  for (const en of ['Bogland', 'Morass']) {
    await nav.getByRole('button', { name: `沼泽 ${en}`, exact: true }).click();
    await expect(page.getByRole('article', { name: `沼泽 ${en}`, exact: true })).toBeVisible();
  }
});

test('#422 全部83张本地预览可解码，非方图不裁切，收起保留当前项', async ({ page }) => {
  await page.goto('./#/maps');
  await expect(choices(page)).toHaveCount(8);
  await page.getByRole('button', { name: /展开/ }).click();
  expect(catalog.maps).toHaveLength(83);
  await expect(choices(page)).toHaveCount(catalog.maps.length);
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
  await page.getByRole('button', { name: /收起/ }).click();
  await expect(choices(page)).toHaveCount(9);
  await expect(nav.getByRole('button', { name: '阿塔卡马 Atacama', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(detail).toBeVisible();
});
