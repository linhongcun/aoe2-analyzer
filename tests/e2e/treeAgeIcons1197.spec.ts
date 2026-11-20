import { expect, test, type Locator } from '@playwright/test';

const ages = ['黑暗', '封建', '城堡', '帝王'];
const bandTops = [74, 130, 242, 354];
const bandHeights = [56, 112, 112, 112];

async function expectStickyAges(scroller: Locator) {
  const offsets = await scroller.evaluate((element) => {
    const left = element.getBoundingClientRect().left + element.clientLeft;
    return [...element.querySelectorAll('.tband-age')].map((age) => age.getBoundingClientRect().left - left);
  });
  expect(offsets).toHaveLength(4);
  for (const offset of offsets) expect(Math.abs(offset)).toBeLessThan(1);
}

async function expectBuildingVisible(scroller: Locator, id: string, edge = false) {
  const { scroll, max, intended, firstCellLeft, labelRight, headingLeft, viewRight } = await scroller.evaluate((element, buildingId) => {
    const heading = element.querySelector<HTMLElement>(`.tbld[data-bid="${buildingId}"]`)!;
    const colX = Number.parseFloat(heading.style.left);
    const colRight = colX + Number.parseFloat(heading.style.width);
    const firstCell = [...element.querySelectorAll<HTMLElement>('.tcell')].find((node) => {
      const x = Number.parseFloat(node.style.left);
      return x >= colX && x < colRight;
    })!;
    return {
      scroll: element.scrollLeft,
      max: element.scrollWidth - element.clientWidth,
      intended: colX - 56,
      firstCellLeft: firstCell.getBoundingClientRect().left,
      labelRight: element.querySelector('.tband-age')!.getBoundingClientRect().right,
      headingLeft: heading.getBoundingClientRect().left,
      viewRight: element.getBoundingClientRect().right,
    };
  }, id);
  expect(Math.abs(scroll - Math.min(max, Math.max(0, intended)))).toBeLessThan(1);
  if (edge) expect(scroll).toBe(max);
  else expect(headingLeft - labelRight).toBeCloseTo(6, 0);
  expect(firstCellLeft).toBeGreaterThan(labelRight);
  expect(firstCellLeft).toBeLessThan(viewRight);
}

for (const [width, theme] of [
  [1280, 'light'],
  [360, 'dark'],
] as const) {
  test(`#1197 ${width} 原版时代标签在横滚、建筑定位与差异对照中保持可读`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('./#/civ/Britons#techtree');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const tree = page.getByTestId('civ-techtree');
    const scroller = tree.getByRole('region', { name: '不列颠科技树，可横向滚动' });
    const rows = scroller.locator('.tband');
    await expect(rows).toHaveCount(4);
    for (const [index, age] of ages.entries()) {
      const row = rows.nth(index);
      const label = row.locator('.tband-age');
      const image = label.getByRole('img', { name: `${age}时代`, exact: true });
      const short = label.locator('[aria-hidden="true"]');
      await expect(row).toHaveCSS('top', `${bandTops[index]}px`);
      await expect(row).toHaveCSS('height', `${bandHeights[index]}px`);
      await expect(label).toHaveCSS('width', '50px');
      await expect(label).toHaveCSS('gap', '2px');
      await expect(label).toHaveCSS('font-size', '12px');
      await expect(label).toHaveCSS('line-height', '14px');
      await expect(label).toHaveCSS('writing-mode', 'horizontal-tb');
      await expect(short).toHaveText(age);
      await expect(image).toHaveAttribute('src', new RegExp(`img/ages/${index + 1}\\.webp$`));
      await expect(image).toHaveAttribute('title', `${age}时代`);
      await expect(image).toHaveAttribute('draggable', 'false');
      await expect(image).toHaveCSS('width', '32px');
      await expect(image).toHaveCSS('height', '32px');
      await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(64);
      expect((await label.ariaSnapshot()).trim()).toBe(`- img "${age}时代"`);
      await expect(row.locator('[tabindex], button, a')).toHaveCount(0);
    }
    if (width === 1280) {
      const castle = scroller.getByRole('img', { name: '城堡时代', exact: true });
      await castle.hover();
      expect(await castle.evaluate((element) => element.matches(':hover'))).toBe(true);
    }
    await expectStickyAges(scroller);
    await scroller.press('ArrowRight');
    await expect.poll(() => scroller.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await expectStickyAges(scroller);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

    const jump = tree.getByRole('button', { name: /跳到建筑/ });
    await jump.click();
    await tree.getByRole('option', { name: '马厩', exact: true }).click();
    await expect(tree.getByText('已定位：马厩', { exact: true })).toBeVisible();
    await expect(scroller.locator('.tbld[data-bid="101"]')).toHaveCSS('outline-style', 'dashed');
    await expectBuildingVisible(scroller, '101');
    await expectStickyAges(scroller);
    await expect(jump).toBeFocused();

    await jump.click();
    const last = tree.getByRole('option').last();
    const id = (await last.getAttribute('data-bid'))!;
    await last.click();
    await expectBuildingVisible(scroller, id, true);
    await expectStickyAges(scroller);
    expect(await page.evaluate(() => window.scrollX)).toBe(0);

    const compare = tree.locator('#civ-tt-cmp');
    await compare.click();
    await page.locator('.cp-panel .cp-q').fill('Franks');
    await page.locator('.cp-panel [role="option"][data-civ="Franks"]').click();
    await expect(compare).toHaveAttribute('data-value', 'Franks');
    await expect(scroller.locator('.tcell.onlyA, .tcell.onlyB').first()).toBeAttached();
    await expect(scroller.locator('.tband-age img')).toHaveCount(4);
    await expectStickyAges(scroller);
  });
}

test('#1197 单位、科技与建筑详情继续显示原时代图标', async ({ page }) => {
  for (const [path, selector, age, imageId] of [
    ['unit/38', '.ud-tag[data-t="display-age"]', '城堡时代', 3],
    ['tech/435', '.td-tag[data-t="catalog-age"]', '封建时代', 2],
    ['building/101', '.bd-tag[data-t="catalog-age"]', '封建时代', 2],
  ] as const) {
    await page.goto(`./#/${path}`);
    const image = page.locator(selector).getByRole('img', { name: age, exact: true });
    await expect(image).toHaveAttribute('src', new RegExp(`img/ages/${imageId}\\.webp$`));
    await expect(image).toHaveAttribute('title', age);
    await expect(image).toHaveClass('dlci');
    await expect(page.locator('.tband-age')).toHaveCount(0);
  }
});
