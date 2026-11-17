import { expect, test, type Page } from '@playwright/test';
import civs from '../../data/game/civs.json' with { type: 'json' };

const errors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', (error) => messages.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') messages.push(message.text());
  });
});

test.afterEach(async ({ page }) => {
  expect(errors.get(page)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

async function fontSize(page: Page, selector: string) {
  return page
    .locator(selector)
    .first()
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
}

test('名称、版本和骑士一起筛选，速览使用真实加成', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('./#/civs');
  await expect(page.locator('#grid .card')).toHaveCount(civs.length);
  await expect(page.locator('#filter-panel')).toBeHidden();
  expect(await fontSize(page, '.civ-uu')).toBe(14);
  expect(await fontSize(page, '.civ-en')).toBeGreaterThanOrEqual(12);

  await page.getByRole('button', { name: '按条件筛选', exact: true }).click();
  expect(await fontSize(page, '.civ-field-label')).toBeGreaterThanOrEqual(12);
  expect(await fontSize(page, '.civ-help')).toBeGreaterThanOrEqual(12);
  await page.locator('#dlc').selectOption({ label: '西方霸主' });
  await page.locator('#option-search').fill('骑士');
  await expect(page.locator('#option-search')).toHaveValue('骑士');
  await expect(page.locator('#option-search')).toBeFocused();
  await page.getByRole('checkbox', { name: '添加单位 骑士', exact: true }).check();
  await expect
    .poll(() => page.locator('#grid .card').evaluateAll((cards) => cards.map((card) => card.getAttribute('data-civ')).sort()))
    .toEqual(['Burgundians', 'Sicilians']);
  await page.getByRole('button', { name: '移除 DLC 西方霸主', exact: true }).click();
  await expect(page.locator('#option-search')).toHaveValue('骑士');
  await expect(page.locator('#dlc')).toHaveValue('');

  await page.getByRole('button', { name: '重置全部', exact: true }).click();
  await expect(page.locator('#option-search')).toHaveValue('');
  await expect(page.locator('#cnt')).toHaveText(`${civs.length} / ${civs.length}`);
  await expect(page.getByTestId('requirement-chip')).toHaveCount(0);

  const franks = civs.find((civ) => civ.en === 'Franks');
  await page.locator('#grid .card[data-civ="Franks"]').click();
  const preview = page.getByRole('complementary', { name: '文明速览' });
  await expect(preview).toContainText(franks?.bon[0] ?? '');
  await expect(preview).not.toContainText('边位');
  await expect(preview).not.toContainText('口袋');
  await preview.getByRole('link', { name: '打开完整文明资料' }).click();
  await expect(page.locator('#detail h1')).toContainText('法兰克');
});

test('360 宽条件栏盖住结果时仍可收起，文字不低于交接字号', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('./#/civs');
  await expect(page.locator('#grid .card').first()).toBeVisible();
  await expect(page.locator('#grid .civ-type').first()).toBeHidden();
  await expect(page.locator('#grid .civ-unique').first()).toBeHidden();
  expect(await fontSize(page, '.civ-en')).toBeGreaterThanOrEqual(12);
  await page.getByRole('button', { name: '按条件筛选', exact: true }).click();
  await expect(page.locator('#filter-panel')).toBeVisible();
  expect(await fontSize(page, '.civ-help')).toBeGreaterThanOrEqual(12);
  await page.keyboard.press('Escape');
  await expect(page.locator('#filter-panel')).toBeHidden();
  await expect(page.locator('#grid .card').first()).toBeVisible();
});

test('#1118 手机连续身份行满足八行密度，搜索及长名称完整', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('./#/civs');
  const rows = page.locator('#grid .card');
  await expect(rows).toHaveCount(civs.length);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('#civ-preview')).toBeHidden();
  await expect(page.locator('#q')).toHaveValue('');
  const metrics = await rows.evaluateAll((cards) => {
    const boxes = cards.map((card) => card.getBoundingClientRect());
    return {
      names: cards.map((card) => card.getAttribute('data-civ')),
      heights: boxes.map((box) => box.height),
      firstEightHeight: boxes[7]!.bottom - boxes[0]!.top,
      completeIn600: boxes.filter((box) => box.bottom <= boxes[0]!.top + 600).length,
      gap: getComputedStyle(cards[0]!.parentElement!).gap,
    };
  });
  expect(metrics.names).toEqual(civs.map((civ) => civ.en));
  expect(metrics.heights.every((height) => height >= 44 && height <= 72)).toBe(true);
  expect(metrics.firstEightHeight).toBeLessThanOrEqual(600);
  expect(metrics.completeIn600).toBeGreaterThanOrEqual(8);
  expect(metrics.gap).toBe('0px');
  await testInfo.attach('mobile-density', { body: JSON.stringify(metrics, null, 2), contentType: 'application/json' });

  const search = page.getByRole('searchbox', { name: '搜索文明', exact: true });
  for (const query of ['亚美尼亚', 'Armenians', 'yameiniya', 'ymny']) {
    await search.fill(query);
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute('data-civ', 'Armenians');
    await expect(rows.first()).toHaveAccessibleName('亚美尼亚 Armenians');
  }
  for (const name of ['Ethiopians', 'Burgundians', 'Hindustanis', 'Lithuanians']) {
    const civ = civs.find((item) => item.en === name)!;
    await search.fill(name);
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAccessibleName(`${civ.zh} ${civ.en}`);
    expect(await rows.first().evaluate((row) => [...row.querySelectorAll('.civ-zh, .civ-en')].every((text) => text.scrollWidth <= text.clientWidth))).toBe(
      true,
    );
  }
  await search.fill('不存在的文明');
  await expect(rows).toHaveCount(0);
  await expect(page.getByText('没有符合条件的文明', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '重置全部', exact: true }).click();
  await expect(rows).toHaveCount(civs.length);
  await rows.first().click({ position: { x: 3, y: 32 } });
  await expect(page.locator('#civ-preview .civ-en')).toHaveText('Armenians');
});

test('#1118 键盘速览、关闭与筛选均回焦且不跳动，触发行消失回搜索', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('./#/civs');
  const row = page.locator('#grid .card[data-civ="Hindustanis"]');
  await row.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await row.focus();
  const before = await page.evaluate(() => scrollY);
  const close = page.locator('#civ-preview').getByRole('button', { name: '关闭', exact: true });
  for (const key of ['Enter', 'Space']) {
    await row.press(key);
    await expect(close).toBeFocused();
    const closeBox = await close.boundingBox();
    expect(closeBox?.width).toBeGreaterThanOrEqual(44);
    expect(closeBox?.height).toBeGreaterThanOrEqual(44);
    await expect(row).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#civ-preview .civ-type')).toBeVisible();
    await expect(page.locator('#civ-preview .civ-uu')).toBeVisible();
    expect(await page.evaluate(() => scrollY)).toBeCloseTo(before, 0);
    if (key === 'Enter') await page.keyboard.press('Escape');
    else await close.press('Enter');
    await expect(row).toBeFocused();
    await expect(row).toHaveAttribute('aria-pressed', 'false');
    expect(await page.evaluate(() => scrollY)).toBeCloseTo(before, 0);
  }

  for (const method of ['Escape', 'close']) {
    await row.press('Enter');
    await page.evaluate(() => (location.hash = '#/civs?q=Armenians'));
    await expect(page.locator('#grid .card')).toHaveCount(1);
    if (method === 'Escape') await page.keyboard.press('Escape');
    else await close.press('Enter');
    await expect(page.locator('#q')).toBeFocused();
    await page.evaluate(() => (location.hash = '#/civs'));
    await expect(page.locator('#grid .card')).toHaveCount(civs.length);
  }
  const toggle = page.getByRole('button', { name: '按条件筛选', exact: true });
  await toggle.click();
  const collapse = page.locator('#filter-panel').getByRole('button', { name: '收起', exact: true });
  await expect(collapse).toBeFocused();
  for (const control of [toggle, collapse]) {
    const box = await control.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  await collapse.press('Enter');
  await expect(toggle).toBeFocused();
  await toggle.press('Space');
  await expect(collapse).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
});

test('#1118 600px 边界、桌面卡片、速览切换和完整资料返回', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
  await page.goto('./#/civs?q=Armenians');
  const row = page.locator('#grid .card').first();
  await expect(row.locator('.civ-type')).toBeHidden();
  await page.setViewportSize({ width: 601, height: 800 });
  await expect(row.locator('.civ-type')).toBeVisible();
  await expect(row.locator('.civ-unique')).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole('button', { name: '重置全部', exact: true }).click();
  await expect(page.locator('#grid .card')).toHaveCount(civs.length);
  expect(await fontSize(page, '#grid .civ-zh')).toBe(20);
  expect(await fontSize(page, '#grid .civ-uu')).toBe(14);
  for (const name of ['Armenians', 'Aztecs']) {
    await page.locator(`#grid .card[data-civ="${name}"]`).click();
    await expect(page.locator('#civ-preview').getByRole('button', { name: '关闭', exact: true })).toBeFocused();
    await expect(page.locator('#civ-preview .civ-en')).toHaveText(name);
  }
  await page.keyboard.press('Escape');
  await page.locator('#q').fill('Armenians');
  await row.click();
  await page.getByRole('link', { name: '打开完整文明资料', exact: true }).click();
  await expect(page).toHaveURL(/#\/civ\/Armenians$/);
  await page.goBack();
  await expect(page.locator('#q')).toHaveValue('Armenians');
  await expect(page.locator('#grid .card')).toHaveCount(1);
});

test('#1118 已滚动速览切换文明后关闭焦点可见，且外层列表不跳动', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 420 });
  const preview = page.locator('#civ-preview');
  const close = preview.getByRole('button', { name: '关闭', exact: true });
  const row = page.locator('#grid .card[data-civ="Aztecs"]');
  for (const method of ['Escape', 'close']) {
    await page.goto('./#/civs');
    await page.locator('#grid .card[data-civ="Armenians"]').click();
    await expect(close).toBeFocused();
    await preview.evaluate((panel) => (panel.scrollTop = panel.scrollHeight));
    expect(await preview.evaluate((panel) => panel.scrollHeight > panel.clientHeight && panel.scrollTop > 0)).toBe(true);
    expect(await close.evaluate((button) => button.getBoundingClientRect().bottom < button.closest('.civ-panel')!.getBoundingClientRect().top)).toBe(true);
    await row.scrollIntoViewIfNeeded();
    await row.evaluate((element) => element.focus({ preventScroll: true }));
    const before = await row.evaluate((element) => ({ scroll: scrollY, top: element.getBoundingClientRect().top }));
    await row.press('Enter');
    await expect(preview.locator('.civ-en')).toHaveText('Aztecs');
    await expect(close).toBeFocused();
    const position = await close.evaluate((button) => {
      const panel = button.closest('.civ-panel')!;
      const box = button.getBoundingClientRect();
      const bounds = panel.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, panelTop: bounds.top, panelBottom: bounds.bottom, scroll: panel.scrollTop };
    });
    expect(position.scroll).toBe(0);
    expect(position.top).toBeGreaterThanOrEqual(Math.max(position.panelTop, 0));
    expect(position.bottom).toBeLessThanOrEqual(Math.min(position.panelBottom, 420));
    expect(await row.evaluate((element) => ({ scroll: scrollY, top: element.getBoundingClientRect().top }))).toEqual(before);
    if (method === 'Escape') await page.keyboard.press('Escape');
    else await close.press('Enter');
    await expect(row).toBeFocused();
    expect(await row.evaluate((element) => ({ scroll: scrollY, top: element.getBoundingClientRect().top }))).toEqual(before);
  }
});

test('#1118 明暗主题均显示当前及键盘焦点，放大名称不裁切', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('./#/civs');
  const row = page.locator('#grid .card').first();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => document.documentElement.setAttribute('data-theme', value), theme);
    await row.focus();
    await row.press('Enter');
    const selected = await row.evaluate((element) => ({ background: getComputedStyle(element).backgroundColor, shadow: getComputedStyle(element).boxShadow }));
    expect(selected.shadow).toContain('inset');
    await page.keyboard.press('Escape');
    await expect(row).toBeFocused();
    expect(await row.evaluate((element) => getComputedStyle(element).outlineWidth)).toBe('2px');
    await row.press('Enter');
    expect(await row.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(selected.background);
    await page.keyboard.press('Escape');
  }
  await page.addStyleTag({ content: '#list #grid .civ-zh { font-size: 36px; } #list #grid .civ-en { font-size: 26px; }' });
  const layout = await page.locator('#grid .card').evaluateAll((cards) =>
    cards.map((card) => ({
      height: card.getBoundingClientRect().height,
      fits: card.scrollHeight <= card.clientHeight && [...card.querySelectorAll('.civ-zh, .civ-en')].every((text) => text.scrollWidth <= text.clientWidth),
    })),
  );
  expect(layout.every((item) => item.height > 72 && item.fits)).toBe(true);
});

test('#1118 条件无效与真实空结果分别反馈，移除名称不清其他条件', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('./#/civs?q=Huns&ty=cav&dlc=1&req=u:569,t:435,u:0');
  await expect(page.locator('#cnt')).toHaveText('条件无效');
  await expect(page.getByTestId('requirements-blocked')).toBeVisible();
  await expect(page.locator('#grid .card')).toHaveCount(0);
  const targets = await page.locator('.civ-chip button').evaluateAll((buttons) =>
    buttons.map((button) => {
      const box = button.getBoundingClientRect();
      return { label: button.getAttribute('aria-label'), width: box.width, height: box.height };
    }),
  );
  expect(
    targets.every((target) => target.width >= 44 && target.height >= 44),
    JSON.stringify(targets),
  ).toBe(true);
  await page.getByRole('button', { name: '移除无效条件 u:0', exact: true }).click();
  await expect(page.locator('#cnt')).toHaveText(`1 / ${civs.length}`);
  await expect(page.locator('#grid .card').first()).toHaveAttribute('data-civ', 'Huns');
  await page.getByRole('button', { name: '移除名称 Huns', exact: true }).click();
  await expect(page.locator('#q')).toHaveValue('');
  await expect(page.getByTestId('requirement-chip')).toHaveCount(2);
  const params = new URLSearchParams(new URL(page.url()).hash.split('?')[1]);
  expect(params.get('ty')).toBe('cav');
  expect(params.get('dlc')).toBe('1');
  expect(params.get('req')?.split(',').sort()).toEqual(['t:435', 'u:569']);
  await expect(page.locator('#grid .card')).not.toHaveCount(civs.length);
  await expect(page.locator('#grid .card').first().locator('.civ-unique')).toBeHidden();
  await page.locator('#q').fill('亚美尼亚');
  await expect(page.locator('#cnt')).toHaveText(`0 / ${civs.length}`);
  await expect(page.getByTestId('requirements-blocked')).toHaveCount(0);
  await expect(page.getByText('没有符合条件的文明', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '重置全部', exact: true }).click();
  await expect(page.locator('#cnt')).toHaveText(`${civs.length} / ${civs.length}`);
});
