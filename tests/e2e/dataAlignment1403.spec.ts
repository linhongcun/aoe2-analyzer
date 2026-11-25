import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function assertNoOverflowAndNwSegmentsIntact(page: Page, scopeSelector: string) {
  const res = await page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return { found: false, overflow: 0, wrappedNw: [] as string[], tinyButtons: [] as string[] };
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    const wrappedNw: string[] = [];
    for (const el of root.querySelectorAll('.num.nw, .ucr-tag.is-mech .nw')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const range = document.createRange();
      range.selectNodeContents(el);
      const rects = [...range.getClientRects()].filter((x) => x.width > 0 && x.height > 0);
      const lines = new Set(rects.map((x) => Math.round(x.top / 4)));
      if (lines.size > 1) wrappedNw.push((el.textContent ?? '').trim());
    }
    return { found: true, overflow, wrappedNw };
  }, scopeSelector);
  expect(res.found).toBe(true);
  expect(res.overflow).toBeLessThanOrEqual(0);
  expect(res.wrappedNw).toEqual([]);
}

async function openWithTheme(page: Page, hash: string, theme: 'light' | 'dark' = 'light') {
  const target = `./#${hash}`;
  if (!page.url().startsWith('http')) {
    await page.goto(target);
  }
  await page.evaluate((mode) => {
    window.localStorage.setItem('aoe2-theme', mode);
  }, theme);
  await page.goto('about:blank');
  await page.goto(target);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

async function ensureDuelTechOpen(page: Page, side: 'a' | 'b' = 'a') {
  const det = page.locator(`#duel-${side} details.duel-tech`);
  if (!(await det.evaluate((el) => el.hasAttribute('open')))) {
    await det.locator('> summary').click();
  }
}

test('Issue 1403 图皮箭毒（1393）#/duel 勾选显隐、直达反例与切单位裁剪（1280 浅/深 + 360）', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  for (const [width, theme] of [
    [1280, 'light'],
    [1280, 'dark'],
    [360, 'light'],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });

    // 1) 精锐黑檀木步弓手（2581）默认 4.f. 不自动勾选箭毒、无告警
    await openWithTheme(page, '/duel?a=2581.Tupi.4.f.&b=567.Japanese.4.f.&m=n&na=30&nb=20', theme);
    await expect(page.locator('#duel-res')).toBeVisible();
    await expect(page.locator('[data-t="pk-unmodeled"]')).toHaveCount(0);
    const winBefore = await page.locator('#duel-res .duel-win').innerText();

    // 手动勾选箭毒（1393）后出胶囊且胜负/数值不变
    await ensureDuelTechOpen(page, 'a');
    const curareBox = page.locator('#duel-a label.simt').filter({ has: page.getByRole('link', { name: '箭毒', exact: true }) });
    await expect(curareBox.locator('input')).not.toBeChecked();
    await curareBox.locator('input').check();
    const card = page.locator('[data-t="pk-unmodeled"]');
    await expect(card).toBeVisible();
    await expect(card.locator('.pk-unm-pill')).toHaveText(['命中后持续伤害 · 箭毒']);
    await expect(card).toContainText('当前未计入命中后的中毒持续伤害（已选科技「箭毒」；未勾选该科技时本项不会触发）；实际输出通常高于此处估算。');
    await expect(page.locator('#duel-res .duel-win')).toHaveText(winBefore, { useInnerText: true });

    await assertNoOverflowAndNwSegmentsIntact(page, '#duel-res');
    const axe = await new AxeBuilder({ page }).include('#duel').withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(axe.violations).toEqual([]);

    // 2) 从已勾选箭毒的 2581 切换为投石手（185）：自动裁掉 1393、立即恢复「仅文本」且零告警
    if (width === 1280 && theme === 'light') {
      await page.locator('#duel-a-unit').click();
      const pickDialog = page.getByRole('dialog', { name: 'A 方单位', exact: true });
      await pickDialog.locator('.cp-q').fill('投石手');
      await pickDialog.locator('[role="option"][data-unit="185"]').click();
      await expect(page.locator('[data-t="pk-unmodeled"]')).toHaveCount(0);
      await expect(curareBox.locator('input')).toHaveCount(0);
      await expect(curareBox).toContainText('仅文本');
    }
  }

  // 3) 直达反例 #/duel?a=6.Tupi.4.1393.：精锐掷矛手保持仅文本不可勾选且无胶囊
  await page.setViewportSize({ width: 1280, height: 900 });
  await openWithTheme(page, '/duel?a=6.Tupi.4.1393.&b=567.Japanese.4.f.&m=n&na=30&nb=20', 'light');
  await expect(page.locator('[data-t="pk-unmodeled"]')).toHaveCount(0);
  await ensureDuelTechOpen(page, 'a');
  const negCurare = page.locator('#duel-a label.simt').filter({ has: page.getByRole('link', { name: '箭毒', exact: true }) });
  await expect(negCurare.locator('input')).toHaveCount(0);
  await expect(negCurare).toContainText('仅文本');

  expect(errors).toEqual([]);
});

test('Issue 1403 穆伊斯卡格查战士「同伴阵亡回血」、草药学列表清除、与 4 单位训练时间展示', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  // 1) 穆伊斯卡格查战士（2564）固有「同伴阵亡回血」胶囊 + 深色/360 校验
  for (const [width, theme] of [
    [1280, 'dark'],
    [360, 'light'],
  ] as const) {
    await page.setViewportSize({ width, height: 900 });
    await openWithTheme(page, '/duel?a=2564.Muisca.4.f.&b=567.Japanese.4.f.&m=n&na=25&nb=25', theme);
    const card = page.locator('[data-t="pk-unmodeled"]');
    await expect(card).toBeVisible();
    await expect(card.locator('.pk-unm-pill')).toHaveText(['同伴阵亡回血']);
    await expect(card).toContainText('当前未计入附近格查战士被击败时的生命回复；成群作战、持续减员时实际生存能力通常高于此处估算。');
    await assertNoOverflowAndNwSegmentsIntact(page, '#duel-res');
  }

  // 2) 保加利亚骑兵反例：只有下马，没有同伴阵亡回血
  await page.setViewportSize({ width: 1280, height: 900 });
  await openWithTheme(page, '/duel?a=1227.Bulgarians.4.f.&b=567.Japanese.4.f.&m=n&na=25&nb=25', 'light');
  await expect(page.locator('[data-t="pk-unmodeled"] .pk-unm-pill')).toHaveText(['阵亡下马步兵阶段']);

  // 3) 穆伊斯卡精锐掷矛手（6）模拟器不再出现草药学（1365）
  await openWithTheme(page, '/unit/6/Muisca/4/?tab=sim', 'light');
  await expect(page.locator('#sim')).toBeVisible();
  await expect(page.locator('#sim')).not.toContainText('草药学');

  // 4) 哥特兵营近卫军（761）显示 16 秒、匈奴马厩答刺罕（886）显示 26 秒
  await page.goto('./#/unit/761');
  await expect(page.locator('#unit')).toContainText('16 秒');
  await page.goto('./#/unit/886');
  await expect(page.locator('#unit')).toContainText('26 秒');

  expect(errors).toEqual([]);
});

test('Issue 1403 建筑模拟器箭毒仅文本说明 + 单位/建筑对照表 D.3 .nw 分段（1280 + 360）', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  // 1) 图皮大型箭塔（235）与城堡（82）模拟器均展示唯一一行箭毒（仅文本）与 scopeNote；哨站（598）不展示
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const bid of [235, 82]) {
    await openWithTheme(page, `/building/${bid}?tab=sim&civ=Tupi&age=4`, 'light');
    const curareRows = page.locator('#sim label.simt').filter({ has: page.getByRole('link', { name: '箭毒', exact: true }) });
    await expect(curareRows).toHaveCount(1);
    await expect(curareRows.locator('input')).toHaveCount(0);
    await expect(curareRows).toContainText('仅文本');
    await expect(curareRows.locator('[data-t="sim-scope-note"]')).toHaveText('研究后本建筑的攻击附带中毒持续伤害；面板数值未计入。');
  }
  await openWithTheme(page, '/building/598?tab=sim&civ=Tupi&age=4', 'light');
  await expect(page.locator('#sim')).toBeVisible();
  await expect(page.locator('#sim')).not.toContainText('箭毒');

  // 2) 360 窄屏验证单位 #1387（劲弩手 492）与建筑 #1393（大型箭塔 235）图皮行标签 D.3 .nw 分段零段内拆行
  await page.setViewportSize({ width: 360, height: 900 });
  await openWithTheme(page, '/unit/492', 'light');
  const unitRank = page.locator('#unit-civ-rank');
  await unitRank.scrollIntoViewIfNeeded();
  await unitRank.locator('#ucr-search').fill('图皮');
  const tupiUnitRow = unitRank.locator('tr[data-civ="Tupi"]');
  await expect(tupiUnitRow).toBeVisible();
  const unitMechTag = tupiUnitRow.locator('.ucr-tag.is-mech').filter({ hasText: '箭毒' });
  await expect(unitMechTag).toHaveText('未计入：命中后持续伤害 · 箭毒');
  await expect(unitMechTag.locator('.nw')).toHaveCount(3);
  await assertNoOverflowAndNwSegmentsIntact(page, '#unit-civ-rank');

  await openWithTheme(page, '/building/235', 'light');
  const bldRank = page.locator('#building-civ-rank');
  await bldRank.scrollIntoViewIfNeeded();
  await bldRank.locator('#bcr-search').fill('图皮');
  const tupiBldRow = bldRank.locator('tr[data-civ="Tupi"]');
  await expect(tupiBldRow).toBeVisible();
  const bldMechTag = tupiBldRow.locator('.ucr-tag.is-mech').filter({ hasText: '箭毒' });
  await expect(bldMechTag).toHaveText('未计入：命中后持续伤害 · 箭毒');
  await expect(bldMechTag.locator('.nw')).toHaveCount(3);
  await assertNoOverflowAndNwSegmentsIntact(page, '#building-civ-rank');

  const axe = await new AxeBuilder({ page }).include('#building-civ-rank').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations).toEqual([]);
  expect(errors).toEqual([]);
});
