import { expect, test, type Locator, type Page } from '@playwright/test';
import { reverseCounterSessionKey, type ReverseCounterSession } from '../../src/features/units/reverseCounterSession';

type Location = { pathname: string; search: string; hash: string };

const sessionKey = (location: Location, targetCiv = 'Byzantines') => reverseCounterSessionKey(40, targetCiv, location)!;

async function selectCiv(page: Page, civ: string) {
  await page.locator('#reverse-counter-civ').click();
  await page.locator('.cp-panel .cp-q').fill(civ);
  await page.getByRole('option', { name: new RegExp(civ) }).click();
}

async function readSession(page: Page, key: string): Promise<ReverseCounterSession | null> {
  return page.evaluate((sessionKey) => JSON.parse(sessionStorage.getItem(sessionKey) ?? 'null'), key);
}

function immutableSession(record: ReverseCounterSession): Readonly<ReverseCounterSession> {
  const snapshot = JSON.parse(JSON.stringify(record)) as ReverseCounterSession;
  const freeze = (value: unknown) => {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  };
  freeze(snapshot);
  return snapshot;
}

async function alignRow(page: Page, row: Locator, offset = 140) {
  const id = await row.getAttribute('id');
  await row.scrollIntoViewIfNeeded();
  await page.evaluate(
    ({ rowId, top }) => {
      const element = rowId ? document.getElementById(rowId) : null;
      if (element) window.scrollTo(0, window.scrollY + element.getBoundingClientRect().top - top);
    },
    { rowId: id, top: offset },
  );
  await expect.poll(() => row.evaluate((element) => Math.round(element.getBoundingClientRect().top))).toBe(offset);
}

async function firstSelectableRow(panel: Locator, excludedId: number) {
  const groups = panel.locator('[data-reverse-group]');
  for (let i = 0; i < (await groups.count()); i++) {
    const group = groups.nth(i);
    const toggle = group.locator('.ud-reverse-group-toggle');
    if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
    const rows = group.locator('[data-reverse-row]');
    for (let j = 0; j < (await rows.count()); j++) {
      const row = rows.nth(j);
      const id = Number((await row.locator('a.ud-reverse-unit').getAttribute('href'))?.match(/unit\/(\d+)/)?.[1]);
      const button = row.locator('[data-t="reverse-counter-pk"]');
      if (id !== excludedId && (await button.isEnabled())) return row;
    }
  }
  throw new Error('No enabled reverse-counter PK row found');
}

async function expectRestored(page: Page, location: Location, expected: Readonly<ReverseCounterSession>, targetCiv = 'Byzantines') {
  const panel = page.locator('#unit-reverse-counters');
  const key = sessionKey(location, targetCiv);
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  await expect(panel.locator('#reverse-counter-civ')).toContainText(expected.filters.civ || '不限');
  await expect(panel.locator('#reverse-counter-age')).toHaveValue(expected.filters.age === null ? '' : String(expected.filters.age));
  const groups = panel.locator('[data-reverse-group]');
  for (let index = 0; index < (await groups.count()); index++) {
    const group = groups.nth(index);
    const toggle = group.locator('.ud-reverse-group-toggle');
    const category = (await toggle.locator('span').first().innerText()).trim();
    await expect(toggle).toHaveAttribute('aria-expanded', String(!expected.collapsed.includes(category)));
  }
  if (expected.openPk) {
    await expect(panel.locator('[data-t="reverse-counter-pk"][aria-expanded="true"]')).toHaveCount(1);
    await expect(panel.getByRole('region', { name: '核对单位 PK' })).toBeVisible();
  } else {
    await expect(panel.getByRole('region', { name: '核对单位 PK' })).toHaveCount(0);
  }
  if (location.search.includes('tab=ov') && expected.openPk?.id === 93) {
    await expect(panel.locator('[data-reverse-group]').filter({ hasText: '独特单位' }).locator('.ud-reverse-group-toggle')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  }
  await expect
    .poll(() =>
      page.evaluate(
        ({ anchorId, fallbackId }) => {
          const anchor = anchorId ? document.getElementById(anchorId) : null;
          const fallback = fallbackId ? document.getElementById(fallbackId) : null;
          const destination = anchor ?? fallback;
          return { id: destination?.id ?? null, top: destination ? Math.round(destination.getBoundingClientRect().top) : null };
        },
        { anchorId: expected.anchor, fallbackId: expected.fallbackAnchor },
      ),
    )
    .toEqual({
      id: expected.anchor ?? expected.fallbackAnchor,
      top: expected.anchor || expected.fallbackAnchor ? Math.round(expected.offset) : null,
    });
  await expect.poll(() => page.evaluate(() => document.activeElement?.id ?? '')).toBe(expected.focus ?? '');
  const record = await readSession(page, key);
  expect(record).not.toBeNull();
  expect(record!.location).toEqual(expected.location);
  expect(record!.location).toEqual(location);
  expect(record!.filters).toEqual(expected.filters);
  expect(record!.collapsed).toEqual(expected.collapsed);
  expect(record!.expandedRows).toEqual(expected.expandedRows);
  expect(record!.openPk).toEqual(expected.openPk);
  expect(record!.anchor).toBe(expected.anchor);
  expect(record!.fallbackAnchor).toBe(expected.fallbackAnchor);
  expect(record!.offset).toBe(expected.offset);
  expect(record!.focus).toBe(expected.focus);
}

test('40 Byzantines 的概览与模拟器分别恢复完整 URL 会话及阅读位置', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const overview: Location = { pathname: '/unit/40', search: '?civ=Byzantines&tab=ov', hash: '' };
  const simulator: Location = { pathname: '/unit/40', search: '?civ=Byzantines&tab=sim', hash: '' };
  await page.goto(`./#${overview.pathname}${overview.search}`);
  const panel = page.locator('#unit-reverse-counters');
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  await selectCiv(page, 'Franks');
  await panel.locator('#reverse-counter-age').selectOption('3');
  const uniqueGroup = panel.locator('[data-reverse-group]').filter({ hasText: '独特单位' }).first();
  const uniqueToggle = uniqueGroup.locator('.ud-reverse-group-toggle');
  if ((await uniqueToggle.getAttribute('aria-expanded')) === 'false') await uniqueToggle.click();
  const rowA = panel.locator('[data-reverse-row]:has(a[href="#/unit/93"])').first();
  await expect(rowA).toBeVisible();
  await alignRow(page, rowA);
  const pkA = rowA.locator('[data-t="reverse-counter-pk"]');
  await expect(pkA).toBeEnabled();
  await pkA.click();
  const summaryA = rowA.getByRole('region', { name: '核对单位 PK' });
  await expect(summaryA.locator('[data-t="reverse-counter-open-duel"]')).toHaveAttribute('href', /b=93\.Franks\.3/);
  const keyA = sessionKey(overview);
  await expect.poll(async () => (await readSession(page, keyA))?.openPk?.id).toBe(93);
  const recordAValue = await readSession(page, keyA);
  expect(recordAValue).not.toBeNull();
  const recordA = immutableSession(recordAValue!);
  expect(recordA.location).toEqual(overview);
  expect(recordA.filters).toEqual({ civ: 'Franks', age: 3 });
  expect(recordA.collapsed).not.toContain('独特单位');
  expect(recordA.anchor).toBeTruthy();
  expect(recordA.fallbackAnchor).toBeTruthy();
  expect(recordA.focus).toBeTruthy();
  const expectedA = recordA;

  await page.getByRole('button', { name: '打开科技模拟器' }).click();
  await expect(page).toHaveURL(/#\/unit\/40\?civ=Byzantines&tab=sim$/);
  const simulatorPanel = page.locator('#unit-reverse-counters');
  await expect(simulatorPanel).toHaveAttribute('aria-busy', 'false');
  await simulatorPanel.scrollIntoViewIfNeeded();
  await expect(simulatorPanel.locator('#reverse-counter-civ')).toContainText('不限');
  await expect(simulatorPanel.locator('#reverse-counter-age')).toHaveValue('');
  await expect(simulatorPanel.getByRole('region', { name: '核对单位 PK' })).toHaveCount(0);
  const keyB = sessionKey(simulator);
  await expect.poll(async () => (await readSession(page, keyB))?.location).toEqual(simulator);
  const defaultRecordBValue = await readSession(page, keyB);
  expect(defaultRecordBValue).not.toBeNull();
  const defaultRecordB = immutableSession(defaultRecordBValue!);
  expect(defaultRecordB.filters).toEqual({ civ: '', age: null });
  expect(defaultRecordB.openPk).toBeNull();
  const expectedDefaultB = defaultRecordB;
  expect(await readSession(page, keyA)).toEqual(expectedA);

  await page.getByRole('button', { name: '返回概览' }).click();
  await expect(page).toHaveURL(/#\/unit\/40\?civ=Byzantines&tab=ov$/);
  await expectRestored(page, overview, expectedA);
  await page.reload();
  await expectRestored(page, overview, expectedA);

  await page.getByRole('button', { name: '打开科技模拟器' }).click();
  await expect(page).toHaveURL(/#\/unit\/40\?civ=Byzantines&tab=sim$/);
  await expectRestored(page, simulator, expectedDefaultB);

  await selectCiv(page, 'Goths');
  await simulatorPanel.locator('#reverse-counter-age').selectOption('3');
  const rowB = await firstSelectableRow(simulatorPanel, 93);
  await alignRow(page, rowB);
  const pkB = rowB.locator('[data-t="reverse-counter-pk"]');
  await pkB.click();
  await expect(rowB.getByRole('region', { name: '核对单位 PK' })).toBeVisible();
  await expect.poll(async () => (await readSession(page, keyB))?.openPk?.id).toBeTruthy();
  const mutableRecordB = await readSession(page, keyB);
  expect(mutableRecordB).not.toBeNull();
  const recordB = immutableSession(mutableRecordB!);
  expect(recordB.location).toEqual(simulator);
  expect(recordB.filters).toEqual({ civ: 'Goths', age: 3 });
  expect(recordB.openPk?.id).not.toBe(recordA.openPk?.id);
  expect(await readSession(page, keyA)).toEqual(expectedA);

  await page.getByRole('button', { name: '返回概览' }).click();
  await expect(page).toHaveURL(/#\/unit\/40\?civ=Byzantines&tab=ov$/);
  await expectRestored(page, overview, expectedA);
  await page.reload();
  await expectRestored(page, overview, expectedA);

  await page.getByRole('button', { name: '打开科技模拟器' }).click();
  await expect(page).toHaveURL(/#\/unit\/40\?civ=Byzantines&tab=sim$/);
  await expectRestored(page, simulator, recordB);
  await page.reload();
  await expectRestored(page, simulator, recordB);
});

test('UnitList 普通无 tab 入口经模拟器刷新后精确返回，并隔离 A/B 完整 URL 会话', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const overview: Location = { pathname: '/unit/40', search: '?civ=Byzantines', hash: '' };
  const simulator: Location = { pathname: '/unit/40', search: '?civ=Byzantines&tab=sim', hash: '' };
  await page.goto('./#/unit');
  await page.locator('#uciv').click();
  await page.locator('.cp-panel .cp-q').fill('Byzantines');
  await page.getByRole('option', { name: /Byzantines/ }).click();
  const listRow = page.locator('#ugrid [data-unit-id="40"]');
  await expect(listRow).toBeVisible();
  await listRow.click();
  await expect(page).toHaveURL(/#\/unit\/40\?civ=Byzantines$/);
  const panel = page.locator('#unit-reverse-counters');
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  await panel.locator('#reverse-counter-age').selectOption('3');
  await selectCiv(page, 'Franks');
  const uniqueGroup = panel.locator('[data-reverse-group]').filter({ hasText: '独特单位' }).first();
  const uniqueToggle = uniqueGroup.locator('.ud-reverse-group-toggle');
  if ((await uniqueToggle.getAttribute('aria-expanded')) === 'false') await uniqueToggle.click();
  const rowA = panel.locator('[data-reverse-row]:has(a[href="#/unit/93"])').first();
  await expect(rowA).toBeVisible();
  await alignRow(page, rowA);
  const pkA = rowA.locator('[data-t="reverse-counter-pk"]');
  await pkA.click();
  const summaryA = rowA.getByRole('region', { name: '核对单位 PK' });
  await expect(summaryA.locator('[data-t="reverse-counter-open-duel"]')).toHaveAttribute('href', /b=93\.Franks\.3/);
  const keyA = sessionKey(overview);
  await expect.poll(async () => (await readSession(page, keyA))?.openPk?.id).toBe(93);
  const recordAValue = await readSession(page, keyA);
  expect(recordAValue).not.toBeNull();
  const recordA = immutableSession(recordAValue!);
  expect(recordA.location).toEqual(overview);
  expect(recordA.filters).toEqual({ civ: 'Franks', age: 3 });
  expect(recordA.openPk?.id).toBe(93);
  expect(recordA.anchor).toBeTruthy();
  expect(recordA.offset).toBeTruthy();
  expect(recordA.focus).toBeTruthy();

  await page.getByRole('button', { name: '打开科技模拟器' }).click();
  await expect(page).toHaveURL(/#\/unit\/40\?civ=Byzantines&tab=sim$/);
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  const keyB = sessionKey(simulator);
  await expect.poll(async () => (await readSession(page, keyB))?.location).toEqual(simulator);
  const defaultRecordBValue = await readSession(page, keyB);
  expect(defaultRecordBValue).not.toBeNull();
  const defaultRecordB = immutableSession(defaultRecordBValue!);
  expect(defaultRecordB.filters).toEqual({ civ: '', age: null });
  expect(defaultRecordB.openPk).toBeNull();
  expect(await readSession(page, keyA)).toEqual(recordA);

  await selectCiv(page, 'Goths');
  await panel.locator('#reverse-counter-age').selectOption('3');
  const rowB = await firstSelectableRow(panel, 93);
  await alignRow(page, rowB);
  await rowB.locator('[data-t="reverse-counter-pk"]').click();
  await expect(rowB.getByRole('region', { name: '核对单位 PK' })).toBeVisible();
  await expect.poll(async () => (await readSession(page, keyB))?.openPk?.id).toBeTruthy();
  const savedRecordBValue = await readSession(page, keyB);
  expect(savedRecordBValue).not.toBeNull();
  const savedRecordB = immutableSession(savedRecordBValue!);
  expect(savedRecordB.location).toEqual(simulator);
  expect(savedRecordB.filters).toEqual({ civ: 'Goths', age: 3 });
  expect(savedRecordB.openPk?.id).not.toBe(recordA.openPk?.id);
  expect(await readSession(page, keyA)).toEqual(recordA);

  await page.locator('#simage').selectOption('3');
  const tech = page.locator('#sim .simg input[type="checkbox"]').first();
  await expect(tech).toBeVisible();
  await tech.click();
  await expect(page).toHaveURL(/#\/unit\/40\/[^/]+\/3\//);
  await page.reload();
  await expect(page.locator('#sim')).toBeVisible();
  await page.getByRole('button', { name: '返回概览' }).click();
  await expect.poll(() => new URL(page.url()).hash.slice(1)).toBe('/unit/40?civ=Byzantines');
  await expectRestored(page, overview, recordA);
  await page.reload();
  await expectRestored(page, overview, recordA);
  expect(await readSession(page, keyB)).toEqual(savedRecordB);

  await page.getByRole('button', { name: '打开科技模拟器' }).click();
  await expect(page).toHaveURL(/#\/unit\/40\?civ=Byzantines&tab=sim$/);
  await expectRestored(page, simulator, savedRecordB);
  expect(await readSession(page, keyA)).toEqual(recordA);
  await page.getByRole('button', { name: '返回概览' }).click();
  await expectRestored(page, overview, recordA);
  const duel = panel.locator('[data-t="reverse-counter-open-duel"]');
  await expect(duel).toHaveAttribute('href', /#\/duel\?a=40\.Byzantines\..*&b=93\.Franks\.3/);
  await duel.click();
  await expect(page).toHaveURL(/#\/duel\?/);
  await expect(page.locator('#duel-res')).toBeVisible();
});

async function actionColors(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, color: style.color, border: style.borderColor };
  });
}

async function expectedColors(page: Page, accented: boolean) {
  return page.evaluate((useAccent) => {
    const probe = document.createElement('span');
    if (useAccent) {
      probe.style.backgroundColor = 'var(--color-accent)';
      probe.style.color = 'var(--color-on-accent)';
      probe.style.borderColor = 'var(--color-accent)';
    } else {
      probe.className = 'ud-btn';
    }
    document.body.append(probe);
    const style = getComputedStyle(probe);
    const colors = { background: style.backgroundColor, color: style.color, border: style.borderColor };
    probe.remove();
    return colors;
  }, accented);
}

async function expectedSurfaces(page: Page) {
  return page.evaluate(() => {
    const probe = document.createElement('span');
    document.body.append(probe);
    probe.style.backgroundColor = 'var(--color-surface)';
    const base = getComputedStyle(probe).backgroundColor;
    probe.style.backgroundColor = 'var(--color-surface-2)';
    const secondary = getComputedStyle(probe).backgroundColor;
    probe.style.color = 'var(--color-muted)';
    const muted = getComputedStyle(probe).color;
    probe.remove();
    return { base, secondary, muted };
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`反向查询启用与禁用动作在 ${theme} 主题中保持局部强调`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.addInitScript((value) => localStorage.setItem('aoe2-theme', value), theme);
    await page.goto('./#/unit/93/Franks/3');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const panel = page.locator('#unit-reverse-counters');
    await expect(panel).toHaveAttribute('aria-busy', 'false');
    await panel.locator('#reverse-counter-age').selectOption('3');
    await selectCiv(page, 'Bohemians');
    const row = panel.locator('[data-reverse-row]').filter({ hasText: '火枪手' }).first();
    await expect(row).toBeVisible();
    const pkButton = row.locator('[data-t="reverse-counter-pk"]');
    await pkButton.click();
    const summary = row.getByRole('region', { name: '核对单位 PK' });
    const openDuel = row.locator('[data-t="reverse-counter-open-duel"]');
    await expect(openDuel).toHaveAttribute('href', /#\/duel/);
    await expect(pkButton).toHaveAttribute('aria-expanded', 'true');
    const accent = await expectedColors(page, true);
    const enabledStyle = await actionColors(panel.locator('[data-t="reverse-counter-open-duel"][href]'));
    const expandedStyle = await actionColors(panel.locator('[data-t="reverse-counter-pk"][aria-expanded="true"]'));
    expect(enabledStyle).toEqual(accent);
    expect(expandedStyle).toEqual(accent);
    const unexpanded = panel.locator('.ud-reverse-pk-button[aria-expanded="false"]:not(:disabled)').first();
    if (await unexpanded.count()) expect(await actionColors(unexpanded)).not.toEqual(accent);

    const surfaces = await expectedSurfaces(page);
    const group = row.locator('xpath=ancestor::*[@data-reverse-group][1]');
    expect(await panel.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(surfaces.base);
    expect(await group.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(surfaces.base);
    expect(await group.locator('.ud-reverse-group-toggle').evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(surfaces.secondary);
    expect(await summary.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(surfaces.secondary);
    expect(
      await summary
        .locator('.ud-reverse-pk-side')
        .first()
        .evaluate((element) => getComputedStyle(element).backgroundColor),
    ).toBe(surfaces.base);
    expect(await panel.locator('.ud-reverse-model').evaluate((element) => getComputedStyle(element).color)).toBe(surfaces.muted);
    expect(await summary.locator('.ud-reverse-pk-note').evaluate((element) => getComputedStyle(element).color)).toBe(surfaces.muted);

    await page.goto('./#/unit/761?tab=sim&keep=1');
    const noCivPanel = page.locator('#unit-reverse-counters');
    await expect(noCivPanel).toHaveAttribute('aria-busy', 'false');
    const noCivRow = noCivPanel.locator('[data-reverse-row]:has(a[href="#/unit/279"])').first();
    await expect(noCivRow).toBeVisible();
    await noCivRow.locator('[data-t="reverse-counter-pk"]').click();
    const disabled = noCivRow.locator('[data-t="reverse-counter-open-duel"]');
    await expect(disabled).toBeDisabled();
    expect(await disabled.getAttribute('href')).toBeNull();
    const disabledStyle = await disabled.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, color: style.color, border: style.borderColor };
    });
    const neutral = await expectedColors(page, false);
    expect(disabledStyle).toEqual(neutral);
  });
}

test('360px 基础与筛选空结果使用独立面板，清除筛选回到基础目录', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('./#/unit/83');
  let panel = page.locator('#unit-reverse-counters');
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  let empty = panel.locator('[data-t="reverse-counter-empty"]');
  await expect(empty.locator('h3')).toHaveText('基础目录未找到正贡献类别匹配');
  await expect(empty).toContainText('不计普通近战与穿刺伤害');
  await expect(empty).toContainText('没有匹配不代表该单位没有实战克制');
  expect(await empty.locator('p').evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(12);
  for (const selector of ['#reverse-counter-civ', '#reverse-counter-age']) {
    expect(await panel.locator(selector).evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  }
  await expect(panel.locator('[data-reverse-group]')).toHaveCount(0);

  await selectCiv(page, 'Britons');
  await panel.locator('#reverse-counter-age').selectOption('1');
  empty = panel.locator('[data-t="reverse-counter-empty"]');
  await expect(empty.locator('h3')).toHaveText('当前筛选下无正贡献匹配');
  await expect(empty).toContainText('清除筛选可查看完整基础目录');
  const clear = empty.getByRole('button', { name: '清除筛选' });
  expect(await clear.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await clear.click();
  await expect(panel.locator('#reverse-counter-civ')).toContainText('不限');
  await expect(panel.locator('#reverse-counter-age')).toHaveValue('');
  await expect(panel.locator('[data-t="reverse-counter-empty"] h3')).toHaveText('基础目录未找到正贡献类别匹配');
  await expect(panel.locator('[data-reverse-group]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  await page.goto('./#/unit/761');
  panel = page.locator('#unit-reverse-counters');
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  const firstGroup = panel.locator('[data-reverse-group]').first();
  const firstToggle = firstGroup.locator('.ud-reverse-group-toggle');
  if ((await firstToggle.getAttribute('aria-expanded')) === 'false') await firstToggle.click();
  const row = panel.locator('[data-reverse-row]').first();
  await expect(row).toBeVisible();
  const number = row.locator('.ud-reverse-damage .num');
  await expect(number).toBeVisible();
  expect(await number.evaluate((element) => getComputedStyle(element).whiteSpace)).toBe('nowrap');
  expect(await row.locator('[data-t="reverse-counter-pk"]').evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});
