import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const TITLE = 'I Ranked All 56 Civilizations in Age of Empires 2';
const ORIGINAL = 'https://www.youtube.com/watch?v=AaxJADJGjvU';
const DISCOVERY = 'https://ageofnews.com/en/aoe2/2026-10-25/';
const LABEL = '职业选手视角';
const AXES = ['骑兵', '弓手', '步兵', '经济', '防御', '攻城', '僧侣', '海军'];
const civs: { en: string; s: number[] }[] = JSON.parse(readFileSync(new URL('../../src/data/civs.json', import.meta.url), 'utf8'));
const franks = civs.find((civ) => civ.en === 'Franks')!;
const runtimeErrors = new WeakMap<Page, string[]>();

test.beforeEach(({ page }) => {
  const errors: string[] = [];
  runtimeErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

const tab = (page: Page, name: string) => page.locator('#detail').getByRole('tab', { name, exact: true });
const panel = (page: Page) => page.locator('#detail').getByRole('tabpanel', { name: LABEL, exact: true });
const original = (page: Page) => panel(page).locator(`a[href="${ORIGINAL}"]`);
const discovery = (page: Page) => panel(page).locator(`a[href="${DISCOVERY}"]`);

async function ready(page: Page, route = 'civ/Armenians?tab=pro') {
  await page.goto(`./#/${route}`);
  await expect(page.locator('#detail h1')).toBeVisible();
  // The real loaded sidebar prevents negative assertions from passing on a loading shell.
  await expect(page.locator('#detail .dside .sideblk').first().getByRole('link').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

async function selected(page: Page, name: string) {
  const active = tab(page, name);
  await expect(active).toHaveAttribute('aria-selected', 'true');
  await expect(active).toHaveAttribute('tabindex', '0');
  await expect(page.locator('#detail [role="tab"][aria-selected="true"]')).toHaveCount(1);
  await expect(page.locator('#detail [role="tab"][tabindex="0"]')).toHaveCount(1);
  const content = page.locator('#detail').getByRole('tabpanel', { name, exact: true });
  await expect(content).toBeVisible();
  await expect(content).toHaveAttribute('aria-labelledby', (await active.getAttribute('id'))!);
}

async function fullyInsideTabScroller(page: Page, target: Locator) {
  await expect
    .poll(() =>
      target.evaluate((button) => {
        const scroller = button.closest('.dtabs')!;
        const outer = scroller.getBoundingClientRect();
        const inner = button.getBoundingClientRect();
        return inner.left >= outer.left - 1 && inner.right <= outer.right + 1;
      }),
    )
    .toBe(true);
  expect(await page.locator('#detail .dtabs').evaluate((element) => getComputedStyle(element).overflowX)).toBe('auto');
}

async function sourceCard(page: Page) {
  await selected(page, LABEL);
  await expect(panel(page).getByText(TITLE, { exact: true })).toBeVisible();
  await expect(panel(page).getByText('Hera', { exact: true })).toBeVisible();
  await expect(original(page)).toHaveCount(1);
  await expect(original(page)).toBeVisible();
  await expect(discovery(page)).toHaveCount(1);
  await expect(discovery(page)).toBeVisible();
  for (const label of ['仅参考', '原视频发布日期未核实', '适用游戏版本未核实', '地图范围未核实']) {
    await expect(panel(page).getByText(label, { exact: true })).toBeVisible();
  }
  await expect(panel(page)).toContainText(/核对日期\s*2026-10-29/);
  await expect(panel(page)).toContainText('本站综合参考');
  await expect(panel(page)).toContainText('未摘录本文明的名次、档位或分数，请查看原视频了解完整观点。');
  await expect(panel(page).getByText(ORIGINAL, { exact: true })).toBeVisible();
  await expect(panel(page).getByText(DISCOVERY, { exact: true })).toBeVisible();
  await expect(panel(page).locator('[data-stat^="rating-"], canvas, iframe, video, audio, embed, object, img')).toHaveCount(0);
  await expect(panel(page).locator('a[href*="/players/"]')).toHaveCount(0);
  await expect(panel(page)).not.toContainText(/(?:本文明|当前文明).*(?:评分|评级|梯队|Tier)/i);
}

test('#487 first-red direct pro URL selects the missing professional source view', async ({ page }) => {
  await ready(page);
  await selected(page, LABEL);
  await expect(panel(page).getByText(TITLE, { exact: true })).toBeVisible();
});

test('#487 first-red verified original source and honest unknown metadata are visible', async ({ page }) => {
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    if (/^https:\/\/(?:www\.)?(?:youtube\.com|ytimg\.com|ageofnews\.com)\//.test(request.url())) externalRequests.push(request.url());
  });
  await ready(page);
  await expect(page.locator('#detail').getByText(TITLE, { exact: true })).toBeVisible();
  await sourceCard(page);
  expect(externalRequests).toEqual([]);
});

test('#487 original tabs, eight reference scores, radar, sidebar and unknown states are preserved', async ({ page }) => {
  await ready(page, 'civ/Franks');
  await selected(page, '概览');
  const overview = await page.locator('#detail [role="tabpanel"]').innerText();
  const sidebar = await page.locator('#detail .dside').innerText();
  await expect(page.locator('#detail .dmain > section').first()).toHaveAttribute('aria-label', '开局建议');
  await expect(page.locator('#detail [role="tabpanel"]')).not.toContainText(TITLE);
  await tab(page, '数据').click();
  await selected(page, '数据');
  const data = await page.locator('#detail [role="tabpanel"]').innerText();
  for (const [index, value] of franks.s.entries()) {
    const tile = page.locator(`#detail [data-stat="rating-${index}"]`);
    await expect(tile.locator('dt')).toHaveText(AXES[index]!);
    await expect(tile.locator('[data-t="stat-value"]')).toHaveText(`${value}/10`);
  }
  await expect(page.locator('#detail [data-stat^="rating-"]')).toHaveCount(8);
  await expect(page.locator('#detail .ratehead')).toContainText('主观评分，仅供参考');
  const radar = await page.locator('#rd').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await tab(page, LABEL).click();
  await sourceCard(page);
  await expect(page.locator('#detail .dside')).toHaveText(sidebar);
  await tab(page, '数据').click();
  await expect(page.locator('#detail [role="tabpanel"]')).toHaveText(data);
  expect(await page.locator('#rd').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(radar);
  await tab(page, '概览').click();
  await expect(page.locator('#detail [role="tabpanel"]')).toHaveText(overview);
  await tab(page, '科技').click();
  await selected(page, '科技');
  await expect(page.locator('#detail [role="tabpanel"]')).toContainText('城堡时代独特科技');
  await expect(page.locator('#detail [role="tabpanel"]')).not.toContainText(TITLE);
  await ready(page, 'civ/Burgundians?tab=history');
  await selected(page, '更新历史');
  await expect(page.getByTestId('entity-history').locator('[data-history-entry]').first()).toBeVisible();
  await expect(page.locator('#detail [role="tabpanel"]')).not.toContainText(TITLE);
  await ready(page, 'civ/Franks?tab=unknown487');
  await selected(page, '概览');
  await expect(page.locator('#detail [role="tabpanel"]')).toHaveText(overview);
  await page.goto('./#/civ/Unknown487?tab=pro');
  await expect(page.getByRole('heading', { name: '没找到这个文明', exact: true })).toBeVisible();
  await expect(page.locator('#detail')).toHaveCount(0);
  await expect(page.getByText(TITLE, { exact: true })).toHaveCount(0);
});

test('#487 selection, copied static URL, refresh, back and forward restore pro', async ({ page, browser }) => {
  await ready(page, 'civ/Armenians');
  await tab(page, LABEL).click();
  await sourceCard(page);
  await expect(page).toHaveURL(/\?tab=pro$/);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          (window as Window & { copied487?: string }).copied487 = value;
        },
      },
    });
  });
  await page.locator('#detail .dhead').getByRole('button', { name: '复制链接', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as Window & { copied487?: string }).copied487)).toBeTruthy();
  const copied = (await page.evaluate(() => (window as Window & { copied487?: string }).copied487))!;
  const url = new URL(copied);
  expect(url.pathname).toMatch(/\/civ\/Armenians\/$/);
  expect(url.searchParams.get('tab')).toBe('pro');
  expect(url.hash).toBe('');
  const context = await browser.newContext();
  try {
    const fresh = await context.newPage();
    await fresh.goto(copied);
    await sourceCard(fresh);
    await fresh.reload();
    await sourceCard(fresh);
  } finally {
    await context.close();
  }
  await page.reload();
  await sourceCard(page);
  await tab(page, '数据').click();
  await selected(page, '数据');
  await page.goBack();
  await sourceCard(page);
  await page.goForward();
  await selected(page, '数据');
  await page.goBack();
  await sourceCard(page);
});

test('#487 denied clipboard provides the full pro link for manual copy', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => Promise.reject(new Error('denied')) },
    });
  });
  await page.locator('#detail .dhead').getByRole('button', { name: '复制链接', exact: true }).click();
  const fallback = page.getByLabel('请复制页面链接', { exact: true });
  await expect(fallback).toBeVisible();
  const url = new URL(await fallback.inputValue());
  expect(url.pathname).toMatch(/\/civ\/Armenians\/$/);
  expect(url.searchParams.get('tab')).toBe('pro');
  await fallback.focus();
  expect(await fallback.evaluate((input: HTMLInputElement) => [input.selectionStart, input.selectionEnd])).toEqual([0, (await fallback.inputValue()).length]);
  await page.goto(url.href);
  await sourceCard(page);
});

test('#487 keyboard tab wrapping, Home and End preserve focus and panel semantics', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await ready(page);
  const professional = tab(page, LABEL);
  await professional.focus();
  await professional.press('Home');
  await selected(page, '概览');
  await expect(tab(page, '概览')).toBeFocused();
  await tab(page, '概览').press('End');
  await selected(page, LABEL);
  await expect(professional).toBeFocused();
  await fullyInsideTabScroller(page, professional);
  await professional.press('ArrowRight');
  await selected(page, '概览');
  await expect(tab(page, '概览')).toBeFocused();
  await tab(page, '概览').press('ArrowLeft');
  await selected(page, LABEL);
  await expect(professional).toBeFocused();
  await professional.press('ArrowLeft');
  await selected(page, '更新历史');
  await expect(tab(page, '更新历史')).toBeFocused();
  await tab(page, '更新历史').press('ArrowRight');
  await sourceCard(page);
  await expect(professional).toBeFocused();
  await fullyInsideTabScroller(page, professional);
});

for (const width of [360, 375, 390, 1280])
  for (const theme of ['light', 'dark'])
    test(`#487 source view ${width} ${theme}: direct tab reachable, readable, 44px targets and AA`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
      await ready(page);
      await sourceCard(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      // Record the genuine initial clip, then let normal Tab focus reveal the selected item.
      const initialBounds = await tab(page, LABEL).evaluate((button) => {
        const scroller = button.closest('.dtabs')!;
        return {
          button: button.getBoundingClientRect().toJSON(),
          scroller: scroller.getBoundingClientRect().toJSON(),
          scrollWidth: scroller.scrollWidth,
          clientWidth: scroller.clientWidth,
          scrollLeft: scroller.scrollLeft,
        };
      });
      await info.attach('initial-tab-scroller-bounds', { body: JSON.stringify(initialBounds), contentType: 'application/json' });
      await page.locator('#detail .dhead').getByRole('button', { name: '复制链接', exact: true }).focus();
      await page.keyboard.press('Tab');
      await expect(tab(page, LABEL)).toBeFocused();
      await fullyInsideTabScroller(page, tab(page, LABEL));
      for (const control of [...(await page.locator('#detail [role="tab"]').all()), original(page), discovery(page)]) {
        const box = await control.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
      expect(
        await panel(page).evaluate((element) => {
          const outer = element.getBoundingClientRect();
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
          const issues: string[] = [];
          while (walker.nextNode()) {
            const node = walker.currentNode;
            if (!node.textContent?.trim()) continue;
            const range = document.createRange();
            range.selectNodeContents(node);
            for (const rect of range.getClientRects()) {
              if (rect.left < outer.left - 1 || rect.right > outer.right + 1) issues.push(node.textContent.trim());
            }
          }
          return issues;
        }),
      ).toEqual([]);
      expect(
        await panel(page).evaluate((element) => {
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) {
            const node = walker.currentNode;
            const index = node.textContent?.indexOf('2026-10-29') ?? -1;
            if (index < 0) continue;
            const range = document.createRange();
            range.setStart(node, index);
            range.setEnd(node, index + '2026-10-29'.length);
            return range.getClientRects().length;
          }
          return 0;
        }),
      ).toBe(1);
      expect((await new AxeBuilder({ page }).include('#detail').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
      await page.screenshot({ path: info.outputPath(`professional-view-${width}-${theme}.png`), fullPage: true });
      await tab(page, '概览').click();
      await selected(page, '概览');
      await expect(page.locator('#detail [data-stat^="rating-"]')).toHaveCount(8);
      await expect(page.locator('#detail [role="tabpanel"]')).not.toContainText(TITLE);
      await tab(page, '数据').click();
      await selected(page, '数据');
      await expect(page.locator('#detail .ratehead')).toContainText('主观评分，仅供参考');
    });
