import { expect, test, type Locator, type Page } from '@playwright/test';

function watch(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function pickCiv(page: Page, id: string, en: string) {
  await page.locator('#' + id).click();
  await page.locator('.cp-panel .cp-q').fill(en);
  await page.locator(`.cp-panel [role="option"][data-civ="${en}"]`).click();
  await expect(page.locator('#' + id)).toHaveAttribute('data-value', en);
}

function pane(page: Page, civ: string) {
  return page.locator(`.tree-pane[data-tree-civ="${civ}"]`);
}

function jumpButton(root: Locator) {
  return root.getByRole('button', { name: /跳到建筑/ });
}

async function spyScroll(scroller: Locator) {
  await scroller.evaluate((el) => {
    const node = el as HTMLElement;
    const orig = node.scrollTo.bind(node);
    node.scrollTo = (options?: ScrollToOptions) => {
      if (options && typeof options === 'object' && options.behavior) node.dataset.scrollBehavior = options.behavior;
      orig(options);
    };
  });
}

async function columnInView(scroller: Locator, bid: string) {
  return scroller.evaluate((el, id) => {
    const head = el.querySelector<HTMLElement>(`.tbld[data-bid="${id}"]`);
    if (!head) return false;
    const view = el.getBoundingClientRect();
    const headBox = head.getBoundingClientRect();
    return headBox.left < view.right - 1 && headBox.right > view.left + 1;
  }, bid);
}

async function ageStuck(scroller: Locator) {
  return scroller.evaluate((el) => {
    const band = el.querySelector<HTMLElement>('.tband span');
    if (!band) return false;
    return Math.abs(band.getBoundingClientRect().left - el.getBoundingClientRect().left) < 4;
  });
}

async function jumpTo(root: Locator, name: string) {
  await jumpButton(root).click();
  await root.getByRole('option', { name, exact: true }).click();
}

test('#886 键盘只在确认后滚动，取消和打开列表不挪树', async ({ page }) => {
  const errors = watch(page);
  await page.goto('./#/civ/Franks#techtree');
  const root = pane(page, 'Franks');
  const scroller = root.locator('.tscroll');
  await expect(root.locator('.tree .tcell').first()).toBeVisible();
  const url = page.url();
  const pageTop = await page.evaluate(() => window.scrollY);
  await scroller.evaluate((el) => {
    el.scrollLeft = 240;
  });
  await spyScroll(scroller);
  const title = await page.locator('#civ-tt-title').boundingBox();
  const frame = await scroller.boundingBox();
  const button = jumpButton(root);
  await button.focus();
  await page.keyboard.press('ArrowDown');
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('End');
  expect(await root.locator('.tjump-list').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await scroller.evaluate((el) => el.scrollLeft)).toBe(240);
  expect(await page.evaluate(() => window.scrollY)).toBe(pageTop);
  const titleOpen = await page.locator('#civ-tt-title').boundingBox();
  const frameOpen = await scroller.boundingBox();
  expect(Math.round(titleOpen!.x)).toBe(Math.round(title!.x));
  expect(Math.round(frameOpen!.x)).toBe(Math.round(frame!.x));
  expect(Math.round(frameOpen!.y)).toBe(Math.round(frame!.y));
  await page.keyboard.press('Escape');
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(button).toBeFocused();
  expect(await scroller.evaluate((el) => el.scrollLeft)).toBe(240);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(button).toBeFocused();
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(scroller).toHaveAttribute('data-scroll-behavior', 'smooth');
  await expect.poll(async () => scroller.evaluate((el) => el.scrollLeft)).toBeLessThan(30);
  expect(page.url()).toBe(url);
  await scroller.evaluate((el) => {
    el.scrollLeft = 240;
  });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  await expect(button).toBeFocused();
  await expect.poll(async () => scroller.evaluate((el) => el.scrollLeft)).toBeLessThan(30);
  expect(await page.evaluate(() => window.scrollY)).toBe(pageTop);
  expect(errors).toEqual([]);
});

test('#886 法兰克、不列颠、蒙古可跳到市场和城堡，同一项可再确认', async ({ page }) => {
  const errors = watch(page);
  for (const civ of ['Franks', 'Britons', 'Mongols']) {
    await page.goto(`./#/civ/${civ}#techtree`);
    const root = pane(page, civ);
    const scroller = root.locator('.tscroll');
    await expect(root.locator('.tree .tcell').first()).toBeVisible();
    for (const [name, bid] of [
      ['市场', '84'],
      ['城堡', '82'],
    ] as const) {
      await jumpTo(root, name);
      await expect(root.getByText(`已定位：${name}`, { exact: true })).toBeVisible();
      await expect.poll(() => columnInView(scroller, bid)).toBe(true);
    }
  }
  const root = pane(page, 'Mongols');
  await jumpTo(root, '城堡');
  await expect(root.getByText('已定位：城堡', { exact: true })).toBeVisible();
  await expect(root.locator('.tbld[data-bid="82"]')).toHaveClass(/t-jump/);
  expect(errors).toEqual([]);
});

test('#886 短反馈占位稳定，旧定时器不清掉新的定位', async ({ page }) => {
  const errors = watch(page);
  await page.goto('./#/civ/Franks#techtree');
  const root = pane(page, 'Franks');
  const button = jumpButton(root);
  await expect(root.locator('.tree .tcell').first()).toBeVisible();
  const before = await button.boundingBox();
  await jumpTo(root, '市场');
  await expect(root.getByText('已定位：市场', { exact: true })).toBeVisible();
  const during = await button.boundingBox();
  expect(Math.round(during!.x)).toBe(Math.round(before!.x));
  expect(Math.round(during!.width)).toBe(Math.round(before!.width));
  const head = root.locator('.tbld[data-bid="84"]');
  await expect(head).toHaveClass(/t-jump/);
  const outline = await head.evaluate((el) => ({
    style: getComputedStyle(el).outlineStyle,
    color: getComputedStyle(el).outlineColor,
    text: getComputedStyle(document.body).color,
  }));
  expect(outline.style).toBe('dashed');
  expect(outline.color).toBe(outline.text);
  await button.click();
  const statusBox = await root.locator('.tjump-status').boundingBox();
  const listBox = await root.locator('.tjump-list').boundingBox();
  expect(listBox!.y).toBeGreaterThanOrEqual(statusBox!.y + statusBox!.height - 1);
  await page.keyboard.press('Escape');
  await root.locator('.tscroll').evaluate((el) => {
    el.scrollLeft = 80;
  });
  await expect(button).toHaveText('跳到建筑');
  await jumpTo(root, '兵营');
  await page.waitForTimeout(1100);
  await jumpTo(root, '城堡');
  await page.waitForTimeout(700);
  await expect(root.getByText('已定位：城堡', { exact: true })).toBeVisible();
  await expect(root.locator('.tbld[data-bid="82"]')).toHaveClass(/t-jump/);
  await expect(root.locator('.tbld[data-bid="12"]')).not.toHaveClass(/t-jump/);
  await page.waitForTimeout(1200);
  await expect(root.getByText(/已定位：/)).toHaveCount(0);
  await expect(root.locator('.tbld.t-jump')).toHaveCount(0);
  const after = await button.boundingBox();
  expect(Math.round(after!.x)).toBe(Math.round(before!.x));
  expect(Math.round(after!.width)).toBe(Math.round(before!.width));
  expect(errors).toEqual([]);
});

test('#886 换文明或差异对照后菜单关闭，并按新树重建选项', async ({ page }) => {
  const errors = watch(page);
  await page.goto('./#/civ/Franks#techtree');
  const franks = pane(page, 'Franks');
  await expect(franks.locator('.tree .tcell').first()).toBeVisible();
  await jumpButton(franks).click();
  await expect(jumpButton(franks)).toHaveAttribute('aria-expanded', 'true');
  await pickCiv(page, 'civ-tt-cmp', 'Britons');
  await expect(jumpButton(franks)).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.tcell.onlyA, .tcell.onlyB').first()).toBeVisible();
  await page.getByRole('button', { name: '取消差异对照', exact: true }).click();
  await expect(page.locator('#civ-tt-cmp')).toHaveAttribute('data-value', '');
  await jumpButton(franks).click();
  await pickCiv(page, 'civ-tt-civ', 'Incas');
  const incas = pane(page, 'Incas');
  await expect(incas.locator('.tree .tcell').first()).toBeVisible();
  await expect(jumpButton(incas)).toHaveAttribute('aria-expanded', 'false');
  await expect(incas.locator('.tbld[data-bid="2556"]')).toContainText('区域建筑');
  await jumpButton(incas).click();
  const names = await incas.locator('[role="option"]').allInnerTexts();
  expect(names.some((name) => name.includes('聚落'))).toBe(true);
  for (const absent of ['马厩', '伐木场', '采矿场', '磨坊', '大商站', '商队旅馆', '牧场']) expect(names.some((name) => name.includes(absent))).toBe(false);
  expect(errors).toEqual([]);
});

test('#886 缺列补充留在本文明，差异对照不再另开一棵树', async ({ page }) => {
  const errors = watch(page);
  await page.goto('./#/civ/Portuguese#techtree');
  const portuguese = pane(page, 'Portuguese');
  await expect(portuguese.locator('.tree .tcell').first()).toBeVisible();
  await expect(page.locator('.tree-pane')).toHaveCount(1);
  await expect(portuguese.locator('.tother')).toContainText('大商站');
  await expect(portuguese.locator('.tother')).not.toContainText('商队旅馆');
  await pickCiv(page, 'civ-tt-cmp', 'Hindustanis');
  await expect(page.locator('.tree-pane')).toHaveCount(1);
  await expect(portuguese.locator('.tother')).toContainText('大商站');
  await expect(portuguese.locator('.tother')).not.toContainText('商队旅馆');
  await expect(page.locator('.tcell.onlyA, .tcell.onlyB').first()).toBeVisible();
  await jumpButton(portuguese).click();
  await expect(portuguese.locator('[role="option"][data-bid="1021"]')).toHaveCount(0);
  await expect(portuguese.locator('[role="option"][data-bid="1754"]')).toHaveCount(0);
  await portuguese.getByRole('option', { name: '市场', exact: true }).click();
  await expect.poll(() => portuguese.locator('.tscroll').evaluate((el) => el.scrollLeft)).toBeGreaterThan(40);
  expect(errors).toEqual([]);
});

test('#886 独特与区域标识、不可用灰化只作用在图标上', async ({ page }) => {
  const errors = watch(page);
  await page.goto('./#/civ/Franks#techtree');
  await expect(page.locator('.tree .tcell').first()).toBeVisible();
  await expect(page.locator('a.tcell[href*="/tech/1452"]')).toHaveAttribute('aria-label', '便携弯弩装置，区域科技');
  await expect(page.locator('a.tcell[href*="/unit/2700"]')).toHaveAttribute('aria-label', '骑马弩兵，区域单位');
  const ax = page.locator('a.tcell[href*="/unit/281"]');
  await expect(ax).toHaveAttribute('aria-label', '掷斧兵，独特单位');
  await expect(ax).toHaveClass(/\buq\b/);
  await expect(ax).not.toHaveClass(/\brg\b/);
  expect(await ax.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none');
  await expect(page.locator('.tmark')).toHaveCount(0);
  const galleon = page.locator('a.tcell[href*="/unit/691"]');
  await expect(galleon).not.toHaveClass(/\buq\b/);
  await expect(galleon).not.toHaveClass(/\brg\b/);
  await expect(galleon).toHaveCSS('border-color', 'rgb(229, 229, 234)');

  await page.goto('./#/civ/Portuguese#techtree');
  const heavy = page.locator('a.tcell[href*="/unit/2701"]');
  await expect(heavy).toHaveAttribute('aria-label', '重装骑马弩兵，区域单位');
  const crane = page.locator('a.tcell[href*="/tech/1452"]');
  await expect(crane).toHaveAttribute('aria-label', '便携弯弩装置，区域科技');
  const normalNaBorder = await page
    .locator('a.tcell.na:not(.uq):not(.rg)')
    .first()
    .evaluate((el) => getComputedStyle(el).borderColor);
  for (const [cell, border] of [
    [heavy, 'rgb(59, 76, 202)'],
    [crane, 'rgb(11, 114, 133)'],
  ] as const) {
    await expect(cell).toHaveClass(/\bna\b/);
    await expect(cell).toHaveClass(/\brg\b/);
    await expect(cell).not.toHaveClass(/\buq\b/);
    const style = await cell.evaluate((el) => {
      const img = el.querySelector('img');
      return {
        marks: el.querySelectorAll('.tmark').length,
        cellOpacity: getComputedStyle(el).opacity,
        cellShadow: getComputedStyle(el).boxShadow,
        cellBorder: getComputedStyle(el).borderColor,
        cellBg: getComputedStyle(el).backgroundColor,
        imgOpacity: img ? getComputedStyle(img).opacity : '',
        imgFilter: img ? getComputedStyle(img).filter : '',
      };
    });
    expect(style.marks).toBe(0);
    expect(Number(style.cellOpacity)).toBe(1);
    expect(style.cellShadow).toBe('none');
    expect(style.cellBorder).toBe(border);
    expect(style.cellBorder).not.toBe(normalNaBorder);
    expect(style.cellBg).toBe('rgb(236, 236, 240)');
    expect(Number(style.imgOpacity)).toBeLessThan(0.5);
    expect(style.imgFilter).toContain('grayscale');
  }
  await expect(page.locator('.tother')).toContainText('大商站');
  await expect(page.locator('.tother')).toContainText('独特建筑');
  await expect(page.locator('.tbld[data-bid="1021"]')).toHaveCount(0);
  await jumpButton(pane(page, 'Portuguese')).click();
  await expect(pane(page, 'Portuguese').locator('[role="option"][data-bid="1021"]')).toHaveCount(0);

  await page.goto('./#/civ/Armenians#techtree');
  await expect(page.locator('.tbld[data-bid="1806"]')).toContainText('区域建筑');
  await expect(page.locator('.tbld[data-bid="1808"]')).toContainText('区域建筑');

  await page.goto('./#/civ/Malay#techtree');
  await expect(page.locator('a.tcell[href*="/building/1189"]')).toHaveAttribute('aria-label', '巨港，独特建筑');
  await expect(page.locator('.tother')).toHaveCount(0);
  await expect(page.locator('.tbld[data-bid="1189"]')).toHaveCount(0);

  await page.goto('./#/civ/Khitans#techtree');
  await expect(page.locator('.tother')).toContainText('牧场');
  await expect(page.locator('.tother')).toContainText('区域建筑');
  await expect(page.locator('.tbld[data-bid="1889"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('#886 窄屏树内横滑不带动页面，时代标签仍贴在滚动容器左侧', async ({ page }) => {
  const errors = watch(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/civ/Franks#techtree');
  const root = pane(page, 'Franks');
  const scroller = root.locator('.tscroll');
  await expect(root.locator('.tree .tcell').first()).toBeVisible();
  const fits = async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(await fits()).toBe(true);
  const button = jumpButton(root);
  const before = await button.boundingBox();
  const field = await root.locator('.tjump-field').boundingBox();
  const paneBox = await root.boundingBox();
  expect(Math.abs(before!.width - field!.width)).toBeLessThan(2);
  expect(field!.width).toBeGreaterThan(paneBox!.width * 0.9);
  await scroller.evaluate((el) => {
    el.scrollLeft = 220;
  });
  expect(await page.evaluate(() => window.scrollX)).toBe(0);
  expect(await fits()).toBe(true);
  await jumpTo(root, '市场');
  await expect.poll(() => columnInView(scroller, '84')).toBe(true);
  expect(await ageStuck(scroller)).toBe(true);
  expect(await page.evaluate(() => window.scrollX)).toBe(0);
  const during = await button.boundingBox();
  expect(Math.abs(during!.width - before!.width)).toBeLessThan(2);
  await button.click();
  const last = root.locator('[role="option"]').last();
  const bid = await last.getAttribute('data-bid');
  await last.click();
  await expect.poll(() => columnInView(scroller, bid!)).toBe(true);
  expect(await ageStuck(scroller)).toBe(true);
  expect(await fits()).toBe(true);
  expect(errors).toEqual([]);
});

test('#886 减少动效时滚动为 auto，短反馈和虚线框仍出现', async ({ page }) => {
  const errors = watch(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./#/civ/Franks#techtree');
  const root = pane(page, 'Franks');
  const scroller = root.locator('.tscroll');
  await expect(root.locator('.tree .tcell').first()).toBeVisible();
  expect(await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  await spyScroll(scroller);
  await jumpTo(root, '市场');
  await expect(scroller).toHaveAttribute('data-scroll-behavior', 'auto');
  await expect(root.getByText('已定位：市场', { exact: true })).toBeVisible();
  const head = root.locator('.tbld[data-bid="84"]');
  await expect(head).toHaveClass(/t-jump/);
  expect(await head.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('dashed');
  const placed = await scroller.evaluate((el) => {
    const node = el.querySelector<HTMLElement>('.tbld[data-bid="84"]');
    const x = Number.parseFloat(node?.style.left ?? '');
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    return { left: el.scrollLeft, dest: Math.min(max, Math.max(0, x - 56)) };
  });
  expect(Math.abs(placed.left - placed.dest)).toBeLessThan(1.5);
  expect(await columnInView(scroller, '84')).toBe(true);
  expect(errors).toEqual([]);
});

test('#954 科技树在文明详情里，旧地址转向，节点带文明', async ({ page }) => {
  const errors = watch(page);
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.goto('./');
  await expect(page.locator('nav.mainnav a', { hasText: '科技树' })).toHaveCount(0);
  await page.goto('./#/civs');
  await page.evaluate(() => {
    location.hash = '/tree/franks';
  });
  await expect(page).toHaveURL(/#\/civ\/Franks#techtree$/);
  const section = page.getByTestId('civ-techtree');
  await expect(section.getByRole('heading', { level: 2, name: '科技树', exact: true })).toBeVisible();
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.getByTestId('civ-tool-tree')).toHaveCount(0);
  await expect(page.locator('#trm')).toHaveCount(0);
  const frame = section.locator('.tscroll');
  await expect(frame.locator('.tcell').first()).toBeVisible();
  const box = await frame.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  await expect(section.locator('.civ-tt-hint')).toContainText('共');
  await expect(section.locator('.civ-tt-hint')).toContainText('14');
  const tools = page.getByTestId('civ-related-tools');
  await expect(tools).toContainText('用这个文明继续：');
  await expect(tools.getByTestId('civ-tool-builds')).toHaveAttribute('href', '#/builds?civ=Franks');
  await expect(tools.getByTestId('civ-tool-production')).toHaveAttribute('href', '#/production?civ=Franks');
  await expect(tools.getByTestId('civ-tool-matchup')).toHaveAttribute('href', '#/matchup?me=Franks');
  await expect(tools.getByTestId('civ-tool-compare')).toHaveAttribute('href', '#/compare?a=Franks');
  const linkBox = await tools.getByTestId('civ-tool-builds').boundingBox();
  expect(linkBox!.height).toBeGreaterThanOrEqual(44);
  const cell = frame.locator('a.tcell[href*="/unit/"]').first();
  const href = await cell.getAttribute('href');
  expect(href).toContain('?civ=Franks');
  await cell.click();
  await page.goBack();
  await expect(page).toHaveURL(/#\/civ\/Franks#techtree$/);
  await expect(frame).toBeVisible();
  await frame.evaluate((el) => {
    el.scrollLeft = el.scrollWidth;
  });
  await expect(section.locator('.civ-tt-frame')).toHaveClass(/is-end/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth === window.innerWidth)).toBe(true);
  await page.goBack();
  await expect(page).toHaveURL(/#\/civs$/);
  expect(errors).toEqual([]);
});

for (const theme of ['light', 'dark'] as const) {
  test(`#1216 单位图例、卡片和对照焦点在 ${theme} 主题一致`, async ({ page }) => {
    await page.addInitScript((preference) => localStorage.setItem('aoe2-theme', preference), theme);
    await page.goto('./#/civ/Bengalis#techtree');
    const legend = page.locator('.tleg');
    await expect(legend.locator(':scope > span')).toHaveText(['可用', '不可用', '独特单位', '区域单位', '独特科技／建筑', '区域科技／建筑']);
    const unique = theme === 'light' ? 'rgb(111, 45, 168)' : 'rgb(192, 124, 240)';
    const regional = theme === 'light' ? 'rgb(59, 76, 202)' : 'rgb(131, 147, 248)';
    const amber = theme === 'light' ? 'rgb(166, 90, 20)' : 'rgb(240, 164, 84)';
    const techRg = theme === 'light' ? 'rgb(11, 114, 133)' : 'rgb(79, 195, 217)';
    const controlBg = theme === 'light' ? 'rgb(236, 236, 240)' : 'rgb(44, 44, 46)';
    await expect(page.locator('.tmark')).toHaveCount(0);
    await expect(legend.locator('.tl1.uq:not(.unit-identity)')).toHaveCSS('margin-right', '4px');
    await expect(legend.locator('.tl1.rg:not(.unit-identity)')).toHaveCSS('border-color', techRg);
    await expect(legend.locator('.tl1.rg:not(.unit-identity)')).toHaveCSS('margin-right', '4px');
    for (const [group, color, ids] of [
      ['uq', unique, [1759, 1761]],
      ['rg', regional, [873, 875]],
    ] as const) {
      const swatch = legend.locator(`.tl1.unit-identity.${group}`);
      await expect(swatch).toHaveCSS('border-color', color);
      const fill = await swatch.evaluate((el) => getComputedStyle(el).backgroundColor);
      for (const id of ids) {
        const cell = page.locator(`a.tcell[href*="/unit/${id}?"]`);
        await expect(cell).toHaveCSS('border-color', color);
        await expect(cell).toHaveCSS('background-color', fill);
        await expect(cell.locator('.tmark')).toHaveCount(0);
        await cell.hover();
        await expect(cell).toHaveCSS('border-color', color);
      }
    }
    const uniqueTech = page.locator('a.tcell[href*="/tech/833?"]');
    await expect(uniqueTech).toHaveCSS('border-color', amber);
    await pickCiv(page, 'civ-tt-cmp', 'Dravidians');
    await expect(uniqueTech).toHaveCSS('box-shadow', 'none');
    const ratha = page.locator('a.tcell[href*="/unit/1759?"]');
    await expect(ratha).toHaveCSS('outline-width', '3px');
    await expect(ratha).toHaveCSS('box-shadow', 'none');
    const greenRing = await ratha.evaluate((el) => getComputedStyle(el).outlineColor);
    await page.keyboard.press('Tab');
    await ratha.focus();
    await expect(ratha).toHaveCSS('outline-width', '2px');
    await expect(ratha).toHaveCSS('outline-offset', '5px');
    expect(await ratha.evaluate((el) => getComputedStyle(el).boxShadow)).toContain(greenRing);

    await page.goto('./#/civ/Portuguese#techtree');
    await pickCiv(page, 'civ-tt-cmp', 'Franks');
    const otherOnly = page.locator('a.tcell[href*="/unit/2701?"]');
    await expect(otherOnly).toHaveClass(/onlyB/);
    await expect(otherOnly).toHaveCSS('opacity', '1');
    await expect(otherOnly.locator('img')).toHaveCSS('filter', 'grayscale(1)');
    await expect(otherOnly.locator('.tmark')).toHaveCount(0);
    await expect(otherOnly).toHaveCSS('border-color', regional);
    await expect(otherOnly).toHaveCSS('background-color', controlBg);
    await expect(otherOnly).toHaveCSS('box-shadow', 'none');
    const redRing = await otherOnly.evaluate((el) => getComputedStyle(el).outlineColor);
    await page.keyboard.press('Tab');
    await otherOnly.focus();
    await expect(otherOnly).toHaveCSS('outline-offset', '5px');
    expect(await otherOnly.evaluate((el) => getComputedStyle(el).boxShadow)).toContain(redRing);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(legend.locator(':scope > span').first()).toHaveCSS('white-space', 'nowrap');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
