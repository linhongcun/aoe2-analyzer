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

  await row.press('Enter');
  await page.evaluate(() => (location.hash = '#/civs?q=Armenians'));
  await expect(page.locator('#grid .card')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('#q')).toBeFocused();
  const toggle = page.getByRole('button', { name: '按条件筛选', exact: true });
  await toggle.click();
  const collapse = page.locator('#filter-panel').getByRole('button', { name: '收起', exact: true });
  await expect(collapse).toBeFocused();
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
