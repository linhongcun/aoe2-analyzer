import { expect, test, type Page } from '@playwright/test';
import civs from '../../src/data/civs.json' with { type: 'json' };

const franks = (civs as { en: string; zh: string; bon: string[]; bonEn: string[] }[]).find((civ) => civ.en === 'Franks')!;

async function settle(page: Page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

test.describe('#965 文明加成按文明分组', () => {
  test('默认 56 张卡、281 行，计入筛选是有计入 174 / 仅文本 107', async ({ page }) => {
    await page.goto('./#/bonuses');
    await expect(page.locator('#bonuses h1')).toHaveText('文明加成');
    await expect(page.locator('#blist > section')).toHaveCount(56);
    await expect(page.locator('#blist li')).toHaveCount(281);
    await expect(page.locator('#blist > section').first().locator('h2')).toHaveCount(1);
    await expect(page.locator('#blist > section').first().locator('.ico')).toHaveCount(1);
    await expect(page.getByRole('radio', { name: '有计入 174' })).toBeVisible();
    await expect(page.getByRole('radio', { name: '仅文本 107' })).toBeVisible();
    await expect(page.locator('#bcnt')).toHaveText('281 条 · 56 个文明');
    await expect(page.locator('#bonuses')).not.toContainText('.dat');
    await expect(page.getByRole('link', { name: '按玩家阵容汇总团队加成' })).toHaveAttribute('href', /#\/team-bonuses$/);
  });

  test('英文可搜，列表不显示英文，详情页显示', async ({ page }) => {
    await page.goto('./#/bonuses');
    await page.locator('#bq').fill('Stone Miners');
    await expect(page.locator('#bcnt')).toContainText('2 / 281');
    await expect(page.locator('#blist li')).toHaveCount(2);
    await expect(page.locator('#blist')).not.toContainText('Stone Miners');
    await page.locator('#blist li a').first().click();
    await expect(page.locator('#bonus h1 small')).toContainText(/Stone Miners/i);
    await expect(page.locator('#bonus [role="tablist"]')).toHaveCount(0);
  });

  test('五个文明的列表档位与文明页同一条一致，罗马第 1 条是部分计入', async ({ page }) => {
    const samples = [
      ['Romans', '0', '部分计入'],
      ['Franks', '0'],
      ['Britons', '0'],
      ['Poles', '2'],
      ['Mayans', '1'],
    ] as const;
    for (const [civ, idx, expected] of samples) {
      await page.goto('./#/bonuses');
      const listTag = (await page.locator(`#blist a[href$="/civ/${civ}/bonus/${idx}"] .bg-lv`).innerText()).trim();
      if (expected) expect(listTag).toBe(expected);
      await page.goto(`./#/civ/${civ}`);
      await expect(page.locator(`.brow[data-bonus="${idx}"] .brow-h .tag`)).toHaveText(listTag);
    }
  });

  test('类别和计入可以叠加，没有结果时能清除筛选', async ({ page }) => {
    await page.goto('./#/bonuses');
    await page.getByRole('radio', { name: '团队', exact: true }).click();
    await page.getByRole('radio', { name: /仅文本/ }).click();
    await expect.poll(() => page.locator('#blist li').count()).toBeGreaterThan(0);
    await expect(page.locator('#blist li').first().locator('.tag.team')).toHaveText('团队');
    await expect(page.locator('#blist li').first().locator('.bg-lv')).toHaveText('仅文本');
    await page.locator('#bq').fill('没有这个加成zz');
    await expect(page.getByRole('status')).toContainText('没有符合条件的加成。');
    await page.getByRole('button', { name: '清除筛选' }).click();
    await expect(page.locator('#bq')).toHaveValue('');
    await expect(page.locator('#blist li')).toHaveCount(281);
    await expect(page.locator('.bon-seg').nth(0).getByRole('radio', { name: '全部' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('.bon-seg').nth(1).getByRole('radio', { name: '全部' })).toHaveAttribute('aria-checked', 'true');
  });

  test('跳到文明只滚动，不改变筛选', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 844 });
    await page.goto('./#/bonuses');
    await page.locator('#bq').fill('a');
    await page.getByLabel('跳到文明').selectOption({ label: '法兰克' });
    await expect(page.locator('#bq')).toHaveValue('a');
    await expect(page.locator('#bg-Franks .bg-head a')).toBeFocused();
    const clear = await page.evaluate(() => {
      const link = document.querySelector('#bg-Franks .bg-head a')!.getBoundingClientRect();
      const bar = document.querySelector('.bon-filter')!.getBoundingClientRect();
      return link.top >= bar.bottom - 1;
    });
    expect(clear).toBe(true);
  });

  test('1280 整栏吸顶，390 只吸顶搜索行', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 844 });
    await page.goto('./#/bonuses');
    await page.locator('#blist li').first().waitFor();
    await page.evaluate(() => window.scrollTo(0, 3000));
    await settle(page);
    const wide = await page.evaluate(() => {
      const header = document.querySelector('header.topbar')!.getBoundingClientRect();
      const filter = document.querySelector('.bon-filter')!.getBoundingClientRect();
      const segs = document.querySelector('.bon-filter-segs')!.getBoundingClientRect();
      const button = document.querySelector('.bon-seg[aria-label="类别"] button') as HTMLElement;
      const box = button.getBoundingClientRect();
      const above = document.elementFromPoint(box.left + box.width / 2, box.top - 2);
      return {
        headerBottom: header.bottom,
        filterTop: filter.top,
        segsTop: segs.top,
        filterBottom: filter.bottom,
        visual: box.height,
        hitExtends: above === button || button.contains(above),
      };
    });
    expect(wide.filterTop).toBeCloseTo(wide.headerBottom, 0);
    expect(wide.segsTop).toBeGreaterThanOrEqual(wide.filterTop - 1);
    expect(wide.segsTop).toBeLessThan(wide.filterBottom);
    expect(wide.visual).toBeLessThanOrEqual(36.5);
    expect(wide.hitExtends).toBe(true);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('./#/bonuses');
    await page.locator('#blist li').first().waitFor();
    await page.evaluate(() => window.scrollTo(0, 3000));
    await settle(page);
    const narrow = await page.evaluate(() => {
      const header = document.querySelector('header.topbar')!.getBoundingClientRect();
      const search = document.querySelector('.bon-filter-main')!.getBoundingClientRect();
      const segs = document.querySelector('.bon-filter-segs')!.getBoundingClientRect();
      const buttons = [...document.querySelectorAll<HTMLElement>('.bon-seg button')].map((button) => button.getBoundingClientRect().height);
      return {
        headerBottom: header.bottom,
        searchTop: search.top,
        searchH: search.height,
        segsTop: segs.top,
        buttons,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(narrow.searchTop).toBeCloseTo(narrow.headerBottom, 0);
    expect(narrow.segsTop).toBeLessThan(0);
    expect(narrow.buttons.length).toBe(13);
    expect(Math.min(...narrow.buttons)).toBeGreaterThanOrEqual(44);
    expect(narrow.overflow).toBeLessThanOrEqual(1);
  });

  test('详情页标题是加成原文，没有单个效果页签，标签只在页头', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('./#/civ/Franks/bonus/0');
    await expect(page.locator('#bonus h1')).toContainText(franks.bon[0]!);
    await expect(page.locator('#bonus h1 small')).toHaveText(franks.bonEn[0]!);
    await expect(page.locator('#bonus .bon-kind')).toHaveText(`${franks.zh} · 文明加成 1`);
    await expect(page.locator('#bonus [role="tablist"]')).toHaveCount(0);
    await expect(page.locator('#bonus .bonusbody .bz')).toHaveCount(0);
    await expect(page.locator('#bonus .bonusbody .tag')).toHaveCount(0);
    await expect(page.locator('#bonus .dhead .tag').filter({ hasText: /^仅文本$/ })).toHaveCount(1);
    await expect(page.locator('#bonus .dhead')).not.toContainText('.dat');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  });
});
