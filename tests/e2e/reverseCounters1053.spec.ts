import { expect, test } from '@playwright/test';
import { treesWithoutBohemianHandCannoneer } from './reverseCounterTreeFixture';
import './reverseCounters1053RestoreCancellation';

async function selectCiv(page: import('@playwright/test').Page, id: string, civ: string) {
  await page.locator(id).click();
  await page.locator('.cp-panel .cp-q').fill(civ);
  await page.getByRole('option', { name: new RegExp(civ) }).click();
}

async function openBohemiansPk(page: import('@playwright/test').Page) {
  await page.goto('./#/unit/93/Franks/3');
  const panel = page.locator('#unit-reverse-counters');
  await page.locator('#reverse-counter-age').selectOption('3');
  await selectCiv(page, '#reverse-counter-civ', 'Bohemians');
  const row = panel.locator('[data-reverse-row]').filter({ hasText: '火枪手' }).first();
  await expect(row).toBeVisible();
  await row.locator('[data-t="reverse-counter-pk"]').click();
  const summary = row.getByRole('region', { name: '核对单位 PK' });
  await expect(summary).toBeVisible();
  await expect(summary.locator('[data-t="reverse-counter-open-duel"]')).toHaveAttribute('href', '#/duel?a=93.Franks.3..&b=5.Bohemians.3..&m=1');
  return { panel, row, summary };
}

test('反向列表筛选到真实形态后，PK 链接保留双方文明与时代', async ({ page }) => {
  await page.goto('./#/unit/93/Franks/3');
  const panel = page.locator('#unit-reverse-counters');
  await expect(panel).toBeVisible();
  await page.locator('#reverse-counter-age').selectOption('3');
  await selectCiv(page, '#reverse-counter-civ', 'Bohemians');

  const row = panel.locator('[data-reverse-row]').filter({ hasText: '火枪手' }).first();
  await expect(row).toBeVisible();
  await expect(panel.getByText('当前筛选下没有正贡献类别匹配。可清除筛选查看基础目录。')).toHaveCount(0);
  await row.locator('[data-t="reverse-counter-pk"]').click();
  const duel = row.locator('[data-t="reverse-counter-open-duel"]');
  await expect(duel).toHaveAttribute('href', '#/duel?a=93.Franks.3..&b=5.Bohemians.3..&m=1');
  const focusId = await duel.getAttribute('id');
  const rowId = await row.getAttribute('id');
  await page.evaluate((id) => {
    const element = document.getElementById(id!);
    if (element) window.scrollTo(0, window.scrollY + element.getBoundingClientRect().top - 120);
  }, rowId);
  await expect.poll(() => row.evaluate((element) => Math.round(element.getBoundingClientRect().top))).toBe(120);
  await duel.click();
  await expect(page).toHaveURL(/#\/duel\?a=93\.Franks\.3\.\.&b=5\.Bohemians\.3\.\.&m=1$/);
  await expect(page.locator('#duel-a .duel-age')).toHaveText('城堡时代');
  await expect(page.locator('#duel-b .duel-age')).toHaveText('城堡时代');
  await expect(page.locator('#duel-a-age')).toHaveValue('3');
  await expect(page.locator('#duel-b-age')).toHaveValue('3');
  for (const side of ['a', 'b']) {
    await expect(page.locator(`#duel-${side} .duel-presets`).getByRole('radio', { name: '无科技' })).toHaveAttribute('aria-checked', 'true');
    await page.locator(`#duel-${side} .duel-tech summary`).click();
    const teamChecks = page.locator(`#duel-${side} .simg input[type="checkbox"]`);
    for (const check of await teamChecks.all()) await expect(check).not.toBeChecked();
  }
  await expect(page.locator('#duel-res')).toBeVisible();
  await expect(page.locator('#duel-res .duel-win')).toContainText('B · 火枪手 获胜');
  const primaryResult = await page.locator('#duel-res .duel-win').innerText();
  await page.locator('[data-t="age-comparison"] > summary').click();
  await expect(page.locator('#duel-res .duel-win')).toHaveText(primaryResult);
  await page.locator('[data-t="upgrade-comparison"] > summary').click();
  await expect(page.locator('#duel-res .duel-win')).toHaveText(primaryResult);

  await page.goBack();
  await expect(page).toHaveURL(/#\/unit\/93\/Franks\/3$/);
  await expect(page.locator('#reverse-counter-age')).toHaveValue('3');
  await expect(page.locator('#reverse-counter-civ')).toContainText('Bohemians');
  await expect.poll(() => row.evaluate((element) => Math.round(element.getBoundingClientRect().top))).toBe(120);
  await expect.poll(() => page.evaluate(() => document.activeElement?.id ?? '')).toBe(focusId);
  await expect(page.getByRole('status').filter({ hasText: '已恢复上次筛选与阅读位置。' })).toBeVisible();
  await page.keyboard.press('Escape');
  const pkButton = row.locator('[data-t="reverse-counter-pk"]');
  await expect(pkButton).toBeFocused();
  await expect(duel).toHaveCount(0);
  await pkButton.click();
  await expect(duel).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement?.id ?? '')).toBe(`reverse-counter-pk-title-5`);

  await page.reload();
  await expect(page.locator('#reverse-counter-age')).toHaveValue('3');
  await expect(page.locator('#reverse-counter-civ')).toContainText('Bohemians');
  await expect.poll(() => row.evaluate((element) => Math.round(element.getBoundingClientRect().top))).toBe(120);
  await expect(row.locator('[data-t="reverse-counter-open-duel"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement?.id ?? '')).toBe('reverse-counter-pk-title-5');
  await page.keyboard.press('Escape');
  await expect(pkButton).toBeFocused();
});

test('默认无目标文明的目录会用 none 会话键恢复，且缺失行不覆盖原导航', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('./#/unit/761?tab=sim&keep=1');
  const panel = page.locator('#unit-reverse-counters');
  await expect(panel).toBeVisible();
  const targetLink = panel.locator('a.ud-reverse-unit[href="#/unit/279"]');
  await expect(targetLink).toHaveCount(1);
  const row = panel.locator('[data-reverse-row]:has(a[href="#/unit/279"])');

  const controlSizes = await Promise.all(
    ['#reverse-counter-civ', '#reverse-counter-age', '[data-t="reverse-counter-pk"]'].map(async (selector) =>
      page
        .locator(selector)
        .first()
        .evaluate((element) => element.getBoundingClientRect().height),
    ),
  );
  expect(controlSizes.every((height) => height >= 44)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  await row.locator('[data-t="reverse-counter-pk"]').click();
  await expect(row.getByText('未选择本单位文明')).toBeVisible();
  await expect(row.locator('[data-t="reverse-counter-open-duel"]')).toBeDisabled();
  await page.evaluate(
    (id) => {
      const element = document.getElementById(id!);
      if (element) window.scrollTo({ top: window.scrollY + element.getBoundingClientRect().top - 140 });
    },
    await row.getAttribute('id'),
  );
  await expect.poll(() => row.evaluate((element) => Math.round(element.getBoundingClientRect().top))).toBe(140);
  await targetLink.click();
  await expect(page).toHaveURL(/#\/unit\/279$/);

  const saved = await page.evaluate(() => {
    const key = 'unit-reverse-counters:v1:761:none';
    const value = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (value) {
      value.anchor = 'removed-reverse-row';
      value.fallbackAnchor = 'removed-reverse-group';
      value.focus = null;
      sessionStorage.setItem(key, JSON.stringify(value));
    }
    return value;
  });
  expect(saved?.location.pathname).toBe('/unit/761');
  expect(saved?.location.search).toBe('?tab=sim&keep=1');
  await page.goBack();
  await expect(page).toHaveURL(/#\/unit\/761\?tab=sim&keep=1$/);
  await expect(panel.getByRole('status').filter({ hasText: '原结果行已变化' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBeGreaterThan(0);
  await expect(row.locator('[data-t="reverse-counter-open-duel"]')).toBeDisabled();
  const pkButton = row.locator('[data-t="reverse-counter-pk"]');
  await expect(pkButton).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(pkButton).toBeFocused();

  await pkButton.click();
  await expect(row.locator('[data-t="reverse-counter-open-duel"]')).toBeVisible();
  await page.reload();
  await expect(panel).toBeVisible();
  await expect(panel.locator('#reverse-counter-civ')).toContainText('不限');
  await expect(panel.locator('#reverse-counter-age')).toHaveValue('');
  await expect(row.locator('[data-t="reverse-counter-open-duel"]')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(pkButton).toBeFocused();
});

test('761 Goths 的空白新会话在科技树加载更新后不显示恢复提示', async ({ page }) => {
  await page.goto('./#/');
  const existingSessions = await page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.startsWith('unit-reverse-counters:v1:761:')));
  expect(existingSessions).toEqual([]);

  let announceRequest!: () => void;
  let releaseRequest!: () => void;
  const requestStarted = new Promise<void>((resolve) => (announceRequest = resolve));
  const requestGate = new Promise<void>((resolve) => (releaseRequest = resolve));
  await page.route(/\/assets\/trees-[^/]+\.js$/, async (route) => {
    announceRequest();
    await requestGate;
    await route.continue();
  });
  const navigation = page.goto('./#/unit/761?civ=Goths', { waitUntil: 'domcontentloaded' });
  await requestStarted;
  const panel = page.locator('#unit-reverse-counters');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('aria-busy', 'true');
  await expect(panel.locator('#reverse-counter-civ')).toContainText('不限');
  await expect(panel.locator('#reverse-counter-age')).toHaveValue('');
  await expect(panel.locator('.ud-reverse-restore')).toHaveCount(0);
  await expect(panel.getByRole('status').filter({ hasText: '已恢复' })).toHaveCount(0);

  releaseRequest();
  await navigation;
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  await expect(panel.locator('#reverse-counter-civ')).toContainText('不限');
  await expect(panel.locator('#reverse-counter-age')).toHaveValue('');
  await expect(panel.locator('.ud-reverse-restore')).toHaveCount(0);
  await expect(panel.getByRole('status').filter({ hasText: '已恢复' })).toHaveCount(0);
  const ownSavedSession = await page.evaluate(() => JSON.parse(sessionStorage.getItem('unit-reverse-counters:v1:761:Goths') ?? 'null'));
  expect(ownSavedSession).not.toBeNull();
  expect(ownSavedSession.filters).toEqual({ civ: '', age: null });
  expect(ownSavedSession.openPk).toBeNull();
});

test('360px 的 A/B 详情链接在底部点击边缘仍命中并导航', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const { panel } = await openBohemiansPk(page);
  for (const [suffix, unitId] of [
    ['target-link', 93],
    ['counter-link', 5],
  ] as const) {
    const link = panel.locator(`a[id$="-${suffix}"]`);
    await expect(link).toHaveCount(1);
    await link.scrollIntoViewIfNeeded();
    const hit = await link.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const x = Math.min(rect.right - 1, rect.left + rect.width / 2);
      const y = rect.bottom - 1;
      const top = document.elementFromPoint(x, y);
      return {
        id: element.id,
        width: rect.width,
        height: rect.height,
        x,
        y,
        hitTarget: !!top && (top === element || element.contains(top) || top.closest('a') === element),
      };
    });
    expect(hit.width).toBeGreaterThanOrEqual(44);
    expect(hit.height).toBeGreaterThanOrEqual(44);
    expect(hit.hitTarget).toBe(true);
    await page.mouse.click(hit.x, hit.y);
    await expect(page).toHaveURL(new RegExp(`#\\/unit\\/${unitId}$`));
    await page.goBack();
    await expect(page).toHaveURL(/#\/unit\/93\/Franks\/3$/);
    await expect(panel.getByRole('region', { name: '核对单位 PK' })).toBeVisible();
    await expect(panel.locator(`[id="${hit.id}"]`)).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.activeElement?.id ?? '')).toBe(hit.id);
  }
});

test('目标单位或本单位文明变化时不共享敌方筛选或已打开 PK 形态', async ({ page }) => {
  await openBohemiansPk(page);
  await page.goto('./#/unit/40/Franks/3');
  const panel = page.locator('#unit-reverse-counters');
  await expect(panel).toBeVisible();
  await expect(panel.locator('#reverse-counter-civ')).toContainText('不限');
  await expect(panel.locator('#reverse-counter-age')).toHaveValue('');
  await expect(panel.getByRole('region', { name: '核对单位 PK' })).toHaveCount(0);
  await expect(panel.locator('.ud-reverse-restore')).toHaveCount(0);

  await page.goto('./#/unit/93/Goths/3');
  const otherCivPanel = page.locator('#unit-reverse-counters');
  await expect(otherCivPanel).toBeVisible();
  await expect(otherCivPanel.locator('#reverse-counter-civ')).toContainText('不限');
  await expect(otherCivPanel.locator('#reverse-counter-age')).toHaveValue('');
  await expect(otherCivPanel.getByRole('region', { name: '核对单位 PK' })).toHaveCount(0);
  await expect(otherCivPanel.locator('.ud-reverse-restore')).toHaveCount(0);
});

test('默认 761、Mayans 多类别目录与 1658/1660 仍是独立形态', async ({ page }) => {
  await page.goto('./#/unit/761');
  const defaultPanel = page.locator('#unit-reverse-counters');
  await expect(defaultPanel).toBeVisible();
  await expect(defaultPanel.locator('[data-reverse-row]')).not.toHaveCount(0);
  const defaultRow = defaultPanel.locator('[data-reverse-row]').first();
  await defaultRow.locator('[data-t="reverse-counter-pk"]').click();
  await expect(defaultRow.getByText('未选择本单位文明')).toBeVisible();
  const chooseTargetCiv = defaultRow.getByRole('button', { name: '选择本单位文明' });
  await expect(chooseTargetCiv).toBeVisible();
  await chooseTargetCiv.click();
  await expect(page.locator('.cp-panel .cp-q')).toBeFocused();
  await expect(defaultRow.locator('[data-t="reverse-counter-open-duel"]')).toBeDisabled();
  await page.keyboard.press('Escape');

  await page.goto('./#/unit/359/Franks/4');
  const mayanPanel = page.locator('#unit-reverse-counters');
  await selectCiv(page, '#reverse-counter-civ', 'Mayans');
  await expect(mayanPanel.locator('[data-reverse-group]')).toHaveCount(3, { timeout: 10_000 });
  const spearGroup = mayanPanel.locator('[data-reverse-group]').filter({ hasText: /^长矛兵/ });
  const infantryGroup = mayanPanel.locator('[data-reverse-group]').filter({ hasText: /^步兵/ });
  if ((await infantryGroup.locator('.ud-reverse-group-toggle').getAttribute('aria-expanded')) === 'false') {
    await infantryGroup.locator('.ud-reverse-group-toggle').click();
  }
  const moreSpears = spearGroup.locator('.ud-reverse-more');
  if (await moreSpears.count()) await moreSpears.click();
  await expect(spearGroup.locator('a[href="#/unit/763"]')).toHaveCount(1);
  await expect(infantryGroup.locator('a[href="#/unit/763"]')).toHaveCount(1);

  await page.goto('./#/unit/2586/Muisca/4');
  const formsPanel = page.locator('#unit-reverse-counters');
  await selectCiv(page, '#reverse-counter-civ', 'Sicilians');
  await page.locator('#reverse-counter-age').selectOption('4');
  const serjeantGroup = formsPanel.locator('[data-reverse-group]').filter({ hasText: '冲击步兵' });
  const serjeantGroupToggle = serjeantGroup.locator('.ud-reverse-group-toggle');
  if ((await serjeantGroupToggle.getAttribute('aria-expanded')) === 'false') await serjeantGroupToggle.click();
  const moreSerjeants = serjeantGroup.locator('.ud-reverse-more');
  if (await moreSerjeants.count()) await moreSerjeants.click();
  await expect(formsPanel.locator('a[href="#/unit/1658"]')).toHaveCount(1);
  await expect(formsPanel.locator('a[href="#/unit/1660"]')).toHaveCount(1);
});

test('40 的城堡时代 PK、83 基础空结果与 Britons 黑暗时代筛选空结果', async ({ page }) => {
  await page.goto('./#/unit/40/Byzantines/3');
  const cataphractPanel = page.locator('#unit-reverse-counters');
  await page.locator('#reverse-counter-age').selectOption('3');
  await selectCiv(page, '#reverse-counter-civ', 'Franks');
  const spearman = cataphractPanel.locator('[data-reverse-row]:has(a[href="#/unit/93"])');
  await expect(spearman).toBeVisible();
  await page.locator('#reverse-counter-age').selectOption('2');
  await spearman.locator('[data-t="reverse-counter-pk"]').click();
  await expect(spearman.getByText(/甲胄骑兵（拜占庭）在封建时代不可用/)).toBeVisible();
  await expect(spearman.locator('[data-t="reverse-counter-open-duel"]')).toBeDisabled();
  await spearman.getByRole('button', { name: '调整敌方时代' }).click();
  await expect.poll(() => page.evaluate(() => document.activeElement?.id ?? '')).toBe('reverse-counter-age');

  await page.locator('#reverse-counter-age').selectOption('3');
  await spearman.locator('[data-t="reverse-counter-pk"]').click();
  await expect(spearman.locator('[data-t="reverse-counter-open-duel"]')).toHaveAttribute('href', '#/duel?a=40.Byzantines.3..&b=93.Franks.3..&m=1');

  await page.goto('./#/unit/83');
  const villagerPanel = page.locator('#unit-reverse-counters');
  await expect(villagerPanel.getByText('基础目录未找到正贡献类别匹配；这不表示该单位没有反制方式。')).toBeVisible();
  await selectCiv(page, '#reverse-counter-civ', 'Britons');
  await page.locator('#reverse-counter-age').selectOption('1');
  await expect(villagerPanel.getByText('当前筛选下没有正贡献类别匹配。可清除筛选查看基础目录。')).toBeVisible();
});

test('科技树网络失败可重试，保留筛选并恢复可用目录', async ({ page }) => {
  let allowRetry = false;
  let blockedRequests = 0;
  let observedRequest = false;
  let announceRequest!: () => void;
  let releaseRequest!: () => void;
  const requestStarted = new Promise<void>((resolve) => (announceRequest = resolve));
  const requestGate = new Promise<void>((resolve) => (releaseRequest = resolve));
  await page.route(/\/assets\/trees-[^/]+\.js$/, async (route) => {
    if (!allowRetry) {
      blockedRequests++;
      if (!observedRequest) {
        observedRequest = true;
        announceRequest();
      }
      await requestGate;
      await route.abort('failed');
      return;
    }
    await route.continue();
  });
  const navigation = page.goto('./#/unit/359/Franks/4', { waitUntil: 'domcontentloaded' });
  await requestStarted;
  const panel = page.locator('#unit-reverse-counters');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('aria-busy', 'true');
  releaseRequest();
  await navigation;
  await selectCiv(page, '#reverse-counter-civ', 'Mayans');
  await page.locator('#reverse-counter-age').selectOption('3');
  await expect(panel.getByRole('button', { name: '重试目录资料' }).first()).toBeVisible();
  expect(blockedRequests).toBeGreaterThan(0);
  allowRetry = true;
  await panel.getByRole('button', { name: '重试目录资料' }).first().click();
  await expect(panel.locator('a[href="#/unit/763"]').first()).toBeVisible();
  await expect(panel.locator('#reverse-counter-civ')).toContainText('Mayans');
  await expect(panel.locator('#reverse-counter-age')).toHaveValue('3');
  await panel.getByRole('button', { name: '清除筛选' }).click();
  await expect(panel.locator('#reverse-counter-civ')).toContainText('不限');
  await expect(panel.locator('#reverse-counter-age')).toHaveValue('');
  await expect(panel.locator('[data-t="reverse-counter-summary"]')).toHaveText(/^基础目录：[1-9]\d* 项类别贡献。$/);
});

test('真实科技树延迟期间恢复所选 PK 摘要，加载后只恢复原形态链接', async ({ page }) => {
  const { panel } = await openBohemiansPk(page);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const value = JSON.parse(sessionStorage.getItem('unit-reverse-counters:v1:93:Franks') ?? 'null');
        return value?.openPk?.id ?? null;
      }),
    )
    .toBe(5);

  let announceRequest!: () => void;
  let releaseRequest!: () => void;
  const requestStarted = new Promise<void>((resolve) => (announceRequest = resolve));
  const requestGate = new Promise<void>((resolve) => (releaseRequest = resolve));
  await page.route(/\/assets\/trees-[^/]+\.js$/, async (route) => {
    announceRequest();
    await requestGate;
    await route.continue();
  });
  const reload = page.reload({ waitUntil: 'domcontentloaded' });
  await requestStarted;
  const summary = panel.getByRole('region', { name: '核对单位 PK' });
  await expect(summary).toBeVisible();
  await expect(summary.getByText('正在核对双方形态的可用性…')).toBeVisible();
  await expect(summary.locator('a[data-t="reverse-counter-open-duel"]')).toHaveCount(0);
  await expect(summary.locator('[data-t="reverse-counter-open-duel"]')).toBeDisabled();
  await expect(panel.getByRole('region', { name: '核对单位 PK' })).toHaveCount(1);

  releaseRequest();
  await reload;
  await expect(summary.locator('[data-t="reverse-counter-open-duel"]')).toHaveAttribute('href', '#/duel?a=93.Franks.3..&b=5.Bohemians.3..&m=1');
  await expect(panel.locator('#reverse-counter-civ')).toContainText('Bohemians');
  await expect(panel.locator('#reverse-counter-age')).toHaveValue('3');
  await expect(panel.getByRole('region', { name: '核对单位 PK' })).toHaveCount(1);
});

test('科技树变更排除原形态时保留原形态并明确禁用 PK', async ({ page }) => {
  const { panel } = await openBohemiansPk(page);
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('unit-reverse-counters:v1:93:Franks') ?? 'null'));
  expect(saved.openPk.id).toBe(5);

  const changedTrees = treesWithoutBohemianHandCannoneer();
  await page.route(/\/assets\/trees-[^/]+\.js$/, async (route) => {
    await route.fulfill({ contentType: 'text/javascript', body: `export default ${JSON.stringify(changedTrees)};` });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });

  const summary = panel.getByRole('region', { name: '核对单位 PK' });
  await expect(summary).toBeVisible();
  await expect(panel.getByText('上次选择的形态不在当前筛选结果中；不会替换形态或降低时代。')).toBeVisible();
  await expect(summary).toContainText('火枪手（波希米亚）在城堡时代不可用；不会更换当前单位形态。');
  await expect(summary.locator('a[id$="-counter-link"]')).toHaveAttribute('href', '#/unit/5');
  await expect(summary.locator('a[data-t="reverse-counter-open-duel"]')).toHaveCount(0);
  await expect(summary.locator('[data-t="reverse-counter-open-duel"]')).toBeDisabled();
  await expect(panel.locator('#reverse-counter-civ')).toContainText('Bohemians');
  await expect(panel.locator('#reverse-counter-age')).toHaveValue('3');
  await expect(panel.getByRole('region', { name: '核对单位 PK' })).toHaveCount(1);
});

test('恢复记录中的形态 ID 若不在当前 Core 正贡献结果中，不显示可信 PK 摘要', async ({ page }) => {
  const { panel } = await openBohemiansPk(page);
  const corruptedId = await page.evaluate(() => {
    const key = 'unit-reverse-counters:v1:93:Franks';
    const saved = JSON.parse(sessionStorage.getItem(key) ?? 'null');
    if (saved) {
      saved.openPk.id = 999999;
      sessionStorage.setItem(key, JSON.stringify(saved));
      const write = sessionStorage.setItem.bind(sessionStorage);
      sessionStorage.setItem = (name, value) => {
        if (name !== key) write(name, value);
      };
    }
    return saved?.openPk.id;
  });
  expect(corruptedId).toBe(999999);

  let announceRequest!: () => void;
  let releaseRequest!: () => void;
  const requestStarted = new Promise<void>((resolve) => (announceRequest = resolve));
  const requestGate = new Promise<void>((resolve) => (releaseRequest = resolve));
  await page.route(/\/assets\/trees-[^/]+\.js$/, async (route) => {
    announceRequest();
    await requestGate;
    await route.continue();
  });
  const reload = page.reload({ waitUntil: 'domcontentloaded' });
  await requestStarted;
  await expect(panel).toHaveAttribute('aria-busy', 'true');
  await expect(panel.getByRole('region', { name: '核对单位 PK' })).toHaveCount(0);
  await expect(panel.locator('a[data-t="reverse-counter-open-duel"]')).toHaveCount(0);
  await expect(panel.getByText('所选 PK 形态已不在当前正贡献目录中或无法核实，已关闭核对。')).toBeVisible();
  releaseRequest();
  await reload;
  await expect(panel).not.toHaveAttribute('aria-busy', 'true');
  await expect(panel.getByRole('region', { name: '核对单位 PK' })).toHaveCount(0);
  await expect(panel.locator('a[data-t="reverse-counter-open-duel"]')).toHaveCount(0);
  await expect(panel.getByText('所选 PK 形态已不在当前正贡献目录中或无法核实，已关闭核对。')).toBeVisible();
  await expect(panel.locator('#reverse-counter-civ')).toContainText('Bohemians');
  await expect(panel.locator('#reverse-counter-age')).toHaveValue('3');
});

test('科技树待核对期间切换目标单位会隔离旧 PK 摘要完成状态', async ({ page }) => {
  const { panel } = await openBohemiansPk(page);
  let announceRequest!: () => void;
  let releaseRequest!: () => void;
  const requestStarted = new Promise<void>((resolve) => (announceRequest = resolve));
  const requestGate = new Promise<void>((resolve) => (releaseRequest = resolve));
  await page.route(/\/assets\/trees-[^/]+\.js$/, async (route) => {
    announceRequest();
    await requestGate;
    await route.continue();
  });
  const reload = page.reload({ waitUntil: 'domcontentloaded' });
  await requestStarted;
  await expect(panel.getByRole('region', { name: '核对单位 PK' }).getByText('正在核对双方形态的可用性…')).toBeVisible();
  await page.goto('./#/unit/40/Franks/3');
  const nextPanel = page.locator('#unit-reverse-counters');
  await expect(nextPanel).toBeVisible();
  await expect(nextPanel.getByRole('region', { name: '核对单位 PK' })).toHaveCount(0);
  releaseRequest();
  await reload;
  await expect(nextPanel.getByRole('region', { name: '核对单位 PK' })).toHaveCount(0);
  await expect(nextPanel.locator('#reverse-counter-civ')).toContainText('不限');
  await expect(nextPanel.locator('#reverse-counter-age')).toHaveValue('');
});

test('真实科技树请求拒绝后保留 PK 摘要，重试仍核对原文明时代与形态', async ({ page }) => {
  const { panel } = await openBohemiansPk(page);
  let requests = 0;
  let announceRetry!: () => void;
  let releaseRetry!: () => void;
  const retryStarted = new Promise<void>((resolve) => (announceRetry = resolve));
  const retryGate = new Promise<void>((resolve) => (releaseRetry = resolve));
  await page.route(/\/assets\/trees-[^/]+\.js$/, async (route) => {
    requests++;
    if (requests === 1) {
      await route.abort('failed');
      return;
    }
    if (requests === 2) {
      announceRetry();
      await retryGate;
    }
    await route.continue();
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const summary = panel.getByRole('region', { name: '核对单位 PK' });
  await expect(summary.getByRole('alert').getByText('科技树资料无法核对双方可用性。')).toBeVisible();
  await expect(summary.locator('a[data-t="reverse-counter-open-duel"]')).toHaveCount(0);
  await expect(summary.locator('[data-t="reverse-counter-open-duel"]')).toBeDisabled();
  expect(requests).toBeGreaterThan(0);

  await summary.getByRole('button', { name: '重试科技树' }).click();
  await retryStarted;
  await expect(summary.getByText('正在核对双方形态的可用性…')).toBeVisible();
  await expect(summary.locator('a[data-t="reverse-counter-open-duel"]')).toHaveCount(0);
  await expect(summary.locator('[data-t="reverse-counter-open-duel"]')).toBeDisabled();
  releaseRetry();
  await expect(summary.locator('[data-t="reverse-counter-open-duel"]')).toHaveAttribute('href', '#/duel?a=93.Franks.3..&b=5.Bohemians.3..&m=1');
  expect(requests).toBeGreaterThanOrEqual(2);
  await expect(panel.locator('#reverse-counter-civ')).toContainText('Bohemians');
  await expect(panel.locator('#reverse-counter-age')).toHaveValue('3');
  await expect(panel.locator('[data-reverse-row]').filter({ hasText: '火枪手' })).toHaveCount(1);
});

test('成功载入但结构损坏的科技树重验后仍保持未知', async ({ page }) => {
  let malformedCacheInjected = false;
  await page.route(/\/assets\/trees-[^/]+\.js$/, async (route) => {
    if (!malformedCacheInjected) {
      malformedCacheInjected = true;
      await route.fulfill({ contentType: 'text/javascript', body: 'export default { t: { Franks: [] }, b: {} };' });
      return;
    }
    await route.continue();
  });
  await page.goto('./#/unit/359/Franks/4');
  const panel = page.locator('#unit-reverse-counters');
  await expect(panel.getByRole('alert').getByText('科技树结构无法解析，暂时不能判断筛选结果。')).toBeVisible();
  await selectCiv(page, '#reverse-counter-civ', 'Mayans');
  await page.locator('#reverse-counter-age').selectOption('3');
  await expect(panel.getByRole('button', { name: '重试目录资料' }).first()).toBeVisible();
  await panel.getByRole('button', { name: '重试目录资料' }).first().click();
  await expect(panel.getByRole('alert').getByText('科技树结构无法解析，暂时不能判断筛选结果。')).toBeVisible();
  await expect(panel.getByText('当前筛选下没有正贡献类别匹配。可清除筛选查看基础目录。')).toHaveCount(0);
  await expect(panel.locator('#reverse-counter-civ')).toContainText('Mayans');
  await expect(panel.locator('#reverse-counter-age')).toHaveValue('3');
  expect(malformedCacheInjected).toBe(true);
});

test('没有实际阅读目录时会话不把模拟器位置滚到反向查询', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 540 });
  await page.goto('./#/unit/761?tab=sim&keep=1');
  await page.waitForFunction(() => !!document.querySelector('#unit-reverse-counters'));
  await expect(page.locator('#unit-sim')).toBeVisible();
  const key = 'unit-reverse-counters:v1:761:none';
  await expect.poll(() => page.evaluate((sessionKey) => sessionStorage.getItem(sessionKey), key)).not.toBeNull();
  const saved = await page.evaluate((sessionKey) => JSON.parse(sessionStorage.getItem(sessionKey) ?? 'null'), key);
  expect(saved.anchor).toBeNull();
  expect(saved.fallbackAnchor).toBeNull();
  expect(page.url()).toContain('#/unit/761?tab=sim&keep=1');
  const sim = page.locator('#unit-sim');
  const simPosition = await sim.evaluate((element) => element.getBoundingClientRect().top);
  expect(simPosition).toBeGreaterThan(50);
  expect(simPosition).toBeLessThan(100);
  const queryPosition = await page.locator('#unit-reverse-counters').evaluate((element) => element.getBoundingClientRect().top);
  expect(queryPosition).toBeLessThan(simPosition);
  await page.reload();
  await expect(sim).toBeVisible();
  await expect.poll(() => sim.evaluate((element) => element.getBoundingClientRect().top)).toBeGreaterThan(50);
  await expect.poll(() => sim.evaluate((element) => element.getBoundingClientRect().top)).toBeLessThan(100);
});
