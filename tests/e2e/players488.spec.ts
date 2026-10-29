import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { PLAYER_CATALOG } from './players488Catalog';
import { playerById, playerPath, playerRoutes, type Player } from '../../src/domain/playerCatalog.mjs';
const PAGE_META = JSON.parse(readFileSync(new URL('../../src/data/page-metadata.json', import.meta.url), 'utf8')) as Record<
  string,
  { title: string; description: string }
>;

if (PLAYER_CATALOG.status !== 'ready') throw new Error('#488 seeded player catalog must be ready');
const catalog = PLAYER_CATALOG.catalog;
const profilePaths = playerRoutes(catalog);

const facts = {
  hera: {
    handle: 'Hera',
    fullName: 'Hamzah El-Baher',
    country: '加拿大',
    event: 'Red Bull Wololo: Londinium',
    year: 2026,
    game: '第八局',
    map: null,
    civ: 'Armenians',
  },
  liereyy: {
    handle: 'Liereyy',
    fullName: 'Kai Kallinger',
    country: '奥地利',
    event: 'Red Bull Wololo IV',
    year: 2021,
    game: '最后一局',
    map: 'Ring Fortress',
    civ: 'Franks',
  },
  theviper: {
    handle: 'TheViper',
    fullName: 'Ørjan Larsen',
    country: '挪威',
    event: 'Red Bull Wololo V',
    year: 2021,
    game: '首局',
    map: 'Runestones',
    civ: 'Vikings',
  },
} as const;

function main(page: Page) {
  return page.locator('main');
}

function directoryLink(page: Page, player: Player) {
  return main(page).getByRole('link', { name: player.handle, exact: true });
}

async function directoryReady(page: Page) {
  await expect(main(page).getByRole('heading', { level: 1, name: '职业选手资料', exact: true })).toBeVisible();
  for (const player of catalog.players) {
    await expect(directoryLink(page, player)).toBeVisible();
    await expect(directoryLink(page, player)).toHaveAttribute('href', `#${playerPath(player)}`);
  }
}

async function profileReady(page: Page, player: Player) {
  await expect(main(page).getByRole('heading', { level: 1, name: player.handle, exact: true })).toBeVisible();
  await expect(main(page)).toContainText(player.fullName);
  await expect(main(page).getByRole('heading', { level: 2, name: '赛事回顾中的对局文明', exact: true })).toBeVisible();
}

async function sourcesOpen(page: Page) {
  const summary = main(page)
    .locator('summary')
    .filter({ hasText: /^来源与核对说明$/ });
  await expect(summary).toBeVisible();
  const details = summary.locator('..');
  if (!(await details.getAttribute('open'))) {
    if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open))) await summary.click();
  }
  await expect(details).toHaveAttribute('open', '');
  await expect(details.locator('a[href^="https://"]').first()).toBeVisible();
  return details;
}

async function checkPage(page: Page) {
  expect(errors.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function targetSize(control: Locator) {
  const box = await control.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const recorded: string[] = [];
  errors.set(page, recorded);
  page.on('pageerror', (error) => recorded.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') recorded.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  await checkPage(page);
});

test('#488 first-red: direct directory URL loads the real player directory', async ({ page }) => {
  await page.goto('./#/players');
  await expect(page.locator('main').getByRole('heading', { level: 1, name: '职业选手资料', exact: true })).toBeVisible();
  for (const [id, name] of [
    ['hera', 'Hera'],
    ['liereyy', 'Liereyy'],
    ['theviper', 'TheViper'],
  ]) {
    await expect(page.locator('main').getByRole('link', { name, exact: true })).toHaveAttribute('href', `#/players/${id}`);
  }
});

test('#488 first-red: a direct Hera URL loads Hera rather than a missing or substitute page', async ({ page }) => {
  await page.goto('./#/players/hera');
  await expect(page.locator('main').getByRole('heading', { level: 1, name: 'Hera', exact: true })).toBeVisible();
  await expect(page.locator('main')).toContainText('Hamzah El-Baher');
  await expect(page.locator('main')).toContainText('加拿大');
  await expect(page).toHaveTitle(/Hera/);
});

test('#488 first-red: Liereyy and TheViper each retain their own loaded identity on refresh', async ({ page }) => {
  for (const [id, name, fullName] of [
    ['liereyy', 'Liereyy', 'Kai Kallinger'],
    ['theviper', 'TheViper', 'Ørjan Larsen'],
  ]) {
    await page.goto(`./#/players/${id}`);
    await expect(page.locator('main').getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
    await expect(page.locator('main')).toContainText(fullName!);
    await page.reload();
    await expect(page.locator('main').getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
  }
});

test('#488 three profiles show annual achievements and match-specific civilizations with their own evidence', async ({ page }) => {
  for (const [id, expected] of Object.entries(facts)) {
    const player = playerById(catalog, id);
    expect(player).toBeDefined();
    await page.goto(`./#${playerPath(player!)}`);
    await profileReady(page, player!);
    await expect(main(page)).toContainText(expected.fullName);
    await expect(main(page)).toContainText(expected.country);
    await expect(main(page)).toContainText(expected.event);
    await expect(main(page)).toContainText(String(expected.year));
    await expect(main(page)).toContainText('冠军');
    await expect(main(page)).toContainText(expected.game);
    if (expected.map) await expect(main(page)).toContainText(expected.map);
    else await expect(main(page)).toContainText('地图未核实');
    const opponent = playerById(catalog, player!.match.opponentId)!;
    await expect(main(page)).toContainText(opponent.handle);
    await expect(main(page).locator(`a[href="#/civ/${expected.civ}"]`)).toBeVisible();
    const pro = main(page).getByRole('link', { name: 'Hera 原视频视角', exact: true });
    if (id === 'hera') {
      await expect(pro).toHaveAttribute('href', '#/civ/Armenians?tab=pro');
      await expect(main(page)).toContainText(/全部\s*56\s*(?:个)?文明/);
      await expect(main(page)).toContainText(/未摘录|未提取/);
    } else {
      await expect(pro).toHaveCount(0);
      await expect(main(page).locator('a[href*="tab=pro"]')).toHaveCount(0);
    }
    await expect(main(page).locator('[data-stat^="rating-"], canvas, iframe, video, audio, embed, object, img')).toHaveCount(0);
    await expect(main(page)).not.toContainText(/(?:Elo|天梯分|胜率)\s*[:：]?\s*\d/i);
    const sources = await sourcesOpen(page);
    const evidence = [...player!.identityEvidence, ...player!.achievement.evidence, ...player!.match.evidence];
    for (const item of evidence) {
      const source = catalog.sources.find((entry) => entry.id === item.sourceId)!;
      await expect(sources.locator(`a[href="${source.url}"]`).first()).toBeVisible();
      await expect(sources).toContainText(item.locator);
      if (source.publishedAt) await expect(sources).toContainText(source.publishedAt);
      else await expect(sources).toContainText('发布日期未核实');
      await expect(sources).toContainText(source.checkedAt);
    }
    await checkPage(page);
  }
});

test('#488 real directory, profile, civilization, history and static entry retain the selected player', async ({ page }) => {
  for (const player of catalog.players) {
    await page.goto('./#/players');
    await directoryReady(page);
    await directoryLink(page, player).click();
    await profileReady(page, player);
    await main(page).locator(`a[href="#/civ/${player.match.civId}"]`).click();
    await expect(page).toHaveURL(new RegExp(`#/civ/${player.match.civId}$`));
    await expect(page.locator('#detail h1')).toBeVisible();
    await expect(page.locator('#detail .dside .sideblk').first().getByRole('link').first()).toBeVisible();
    await checkPage(page);
    await page.goBack();
    await profileReady(page, player);
    await page.goBack();
    await directoryReady(page);
    await page.goForward();
    await profileReady(page, player);
    await page.reload();
    await profileReady(page, player);
    await page.goto(`.${playerPath(player)}/`);
    await profileReady(page, player);
    await expect(page).toHaveURL(new RegExp(`#${playerPath(player)}$`));
    await checkPage(page);
  }
});

test('#488 only Hera links to the original-video view and the real video view links back to the known profile', async ({ page }) => {
  const hera = playerById(catalog, 'hera')!;
  await page.goto(`./#${playerPath(hera)}`);
  await profileReady(page, hera);
  await main(page).getByRole('link', { name: 'Hera 原视频视角', exact: true }).click();
  const pro = page.locator('#detail').getByRole('tabpanel', { name: '职业选手视角', exact: true });
  await expect(pro).toBeVisible();
  await expect(pro.getByText('原视频发布日期未核实', { exact: true })).toBeVisible();
  await expect(pro.getByText('适用游戏版本未核实', { exact: true })).toBeVisible();
  await expect(pro.getByText('地图范围未核实', { exact: true })).toBeVisible();
  await expect(pro.locator(`a[href="#${playerPath(hera)}"]`)).toHaveCount(1);
  await pro.locator(`a[href="#${playerPath(hera)}"]`).click();
  await profileReady(page, hera);
  await expect(page).toHaveURL(new RegExp(`#${playerPath(hera)}$`));
});

test('#488 search opens the exact known profile from its public full name', async ({ page }) => {
  for (const player of catalog.players) {
    await page.goto('./#/players');
    await directoryReady(page);
    await page.keyboard.press('ControlOrMeta+k');
    const input = page.getByRole('combobox', { name: '全局搜索', exact: true });
    await expect(input).toBeVisible();
    await input.fill(player.fullName);
    const result = page.getByRole('option').filter({ hasText: player.handle });
    await expect(result).toHaveCount(1);
    await result.click();
    await profileReady(page, player);
    await expect(page).toHaveURL(new RegExp(`#${playerPath(player)}$`));
  }
});

test('#488 clipboard copies a complete stable profile URL and reports success', async ({ page }) => {
  const player = playerById(catalog, 'liereyy')!;
  await page.goto(`./#${playerPath(player)}`);
  await profileReady(page, player);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (value: string) => Reflect.set(window, 'copiedPlayer488', value) },
    });
  });
  await main(page).getByRole('button', { name: '复制选手链接', exact: true }).click();
  await expect(main(page).getByRole('status')).toContainText(/已复制/);
  const copied = await page.evaluate(() => Reflect.get(window, 'copiedPlayer488') as string);
  const url = new URL(copied);
  expect(url.pathname).toBe(new URL(`.${playerPath(player)}/`, page.url().split('#')[0]).pathname);
  expect(url.search).toBe('');
  expect(url.hash).toBe('');
  await expect(main(page).getByRole('textbox', { name: '完整选手链接', exact: true })).toHaveCount(0);
  await page.goto(copied);
  await profileReady(page, player);
});

test('#488 clipboard failure exposes the complete selectable read-only profile link with live feedback', async ({ page }) => {
  const player = playerById(catalog, 'theviper')!;
  await page.goto(`./#${playerPath(player)}`);
  await profileReady(page, player);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }));
  await main(page).getByRole('button', { name: '复制选手链接', exact: true }).click();
  const feedback = main(page).getByRole('status');
  await expect(feedback).toContainText(/失败|手动/);
  await expect(feedback).toHaveAttribute('aria-live', 'polite');
  await expect(feedback).toHaveAttribute('aria-atomic', 'true');
  const manual = main(page).getByRole('textbox', { name: '完整选手链接', exact: true });
  await expect(manual).toBeVisible();
  await expect(manual).toHaveAttribute('readonly', '');
  const value = await manual.inputValue();
  const url = new URL(value);
  expect(url.pathname).toBe(new URL(`.${playerPath(player)}/`, page.url().split('#')[0]).pathname);
  expect(url.search).toBe('');
  expect(url.hash).toBe('');
  await manual.focus();
  await manual.press('ControlOrMeta+A');
  expect(
    await manual.evaluate((element: HTMLTextAreaElement | HTMLInputElement) => element.value.slice(element.selectionStart ?? 0, element.selectionEnd ?? 0)),
  ).toBe(value);
  await main(page).getByRole('link', { name: '返回选手目录', exact: true }).click();
  await directoryReady(page);
  await expect(main(page).getByRole('textbox', { name: '完整选手链接', exact: true })).toHaveCount(0);
});

test('#488 invalid profile IDs retain the original route and never borrow a real profile or home metadata', async ({ page }) => {
  for (const route of ['/players/unknown488', '/players/Hera', '/players/:id', '/players/%68era', '/players/hera/extra']) {
    await page.goto(`./#${route}`);
    await expect(main(page).getByRole('heading', { level: 1, name: /未收录该选手|找不到该页/ })).toBeVisible();
    expect(new URL(page.url()).hash).toBe(`#${route}`);
    await expect(page).toHaveTitle(/未收录|找不到/);
    const expectedCanonical = await page.evaluate((path) => new URL(`.${path}/`, document.baseURI).href, route);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', expectedCanonical);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', expectedCanonical);
    const basePath = await page.evaluate(() => new URL(document.baseURI).pathname.replace(/\/$/, ''));
    const canonical = new URL((await page.locator('link[rel="canonical"]').getAttribute('href'))!);
    const ogUrl = new URL((await page.locator('meta[property="og:url"]').getAttribute('content'))!);
    expect(canonical.pathname).toBe(`${basePath}${route}/`);
    expect(canonical.hash).toBe('');
    expect(ogUrl.href).toBe(canonical.href);
    await expect(main(page).getByRole('heading', { level: 1, name: 'Hera', exact: true })).toHaveCount(0);
    await expect(main(page)).not.toContainText('Hamzah El-Baher');
    await expect(main(page).locator('a[href="#/civ/Armenians"], a[href*="tab=pro"], a[href="#/players/hera"]')).toHaveCount(0);
    await checkPage(page);
  }
});

test('#488 catalog-derived static profile HTML, canonical URLs, OG assets and sitemap are real without JavaScript', async ({ request }) => {
  const sitemap = await (await request.get('sitemap.xml')).text();
  for (const path of ['/players', ...profilePaths]) {
    const response = await request.get(`.${path}/`, { headers: { 'User-Agent': 'Mozilla/5.0 MicroMessenger' } });
    expect(response.status(), path).toBe(200);
    const html = await response.text();
    const meta = PAGE_META[path]!;
    expect(html, path).toContain(`<title>${meta.title} |`);
    expect(html, path).toContain(`name="description" content="${meta.description}"`);
    expect(html, path).toContain('property="og:title"');
    expect(html, path).toContain(`property="og:description" content="${meta.description}"`);
    expect(html, path).not.toContain('http-equiv="refresh"');
    const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
    expect(canonical, path).toBeDefined();
    expect(new URL(canonical!).pathname.endsWith(`${path}/`), path).toBe(true);
    expect(html, path).toContain(`property="og:url" content="${canonical}"`);
    expect(sitemap, path).toContain(`${path}/</loc>`);
    const ogImage = /property="og:image" content="([^"]+)"/.exec(html)?.[1];
    expect(ogImage, path).toBeDefined();
    expect(new URL(ogImage!).pathname).toMatch(/\/og\/default\.png$/);
  }
  expect(sitemap).not.toContain('/players/:id/');
  expect(sitemap).not.toContain('/players/unknown488/');
  expect(sitemap).not.toContain('#/players');
  const png = await (await request.get('og/default.png')).body();
  expect(png.readUInt32BE(16)).toBe(1200);
  expect(png.readUInt32BE(20)).toBe(630);
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#488 loaded directory, profiles, expanded sources and unknown state ${width} ${theme}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await page.goto('./#/players');
      await directoryReady(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      for (const player of catalog.players) await targetSize(directoryLink(page, player));
      expect((await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
      await page.screenshot({ path: info.outputPath(`players-directory-${width}-${theme}.png`), fullPage: true });
      await checkPage(page);
      for (const player of catalog.players) {
        await directoryLink(page, player).click();
        await profileReady(page, player);
        const sources = await sourcesOpen(page);
        for (const control of await page.getByTestId('player-detail').locator('a, button, summary').all()) {
          if (await control.isVisible()) await targetSize(control);
        }
        for (const number of await main(page).locator('.num, .nw').all()) {
          if (!(await number.isVisible())) continue;
          expect(await number.evaluate((element) => getComputedStyle(element).whiteSpace)).toBe('nowrap');
          // Font fallback may split Latin digits and a Chinese unit into two fragments on the same line.
          expect(
            await number.evaluate((element) => {
              const rects = [...element.getClientRects()];
              return rects.every((rect) => Math.abs(rect.top - rects[0]!.top) < 2);
            }),
          ).toBe(true);
        }
        const copy = main(page).getByRole('button', { name: '复制选手链接', exact: true });
        await page.keyboard.press('Tab');
        await copy.focus();
        await expect(copy).toBeFocused();
        expect(await copy.evaluate((element) => element.matches(':focus-visible'))).toBe(true);
        await page.keyboard.press('Tab');
        expect(await main(page).evaluate((element) => element.contains(document.activeElement))).toBe(true);
        await expect(sources).toBeVisible();
        expect((await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
        await page.screenshot({ path: info.outputPath(`player-${player.id}-${width}-${theme}.png`), fullPage: true });
        await checkPage(page);
        await main(page).getByRole('link', { name: '返回选手目录', exact: true }).click();
        await directoryReady(page);
      }
      await page.goto('./#/players/unknown488');
      await expect(main(page).getByRole('heading', { level: 1, name: '未收录该选手', exact: true })).toBeVisible();
      const back = main(page).getByRole('link', { name: '返回选手目录', exact: true });
      await targetSize(back);
      expect((await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
      await checkPage(page);
    });
