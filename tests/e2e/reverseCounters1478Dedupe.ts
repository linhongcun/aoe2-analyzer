import { expect, test, type Locator, type Page } from '@playwright/test';

async function selectCiv(page: Page, civ: string) {
  await page.locator('#reverse-counter-civ').click();
  await page.locator('.cp-panel .cp-q').fill(civ);
  await page.getByRole('option', { name: new RegExp(civ) }).click();
}

async function expectSingleLineElements(scope: Locator, selector: string) {
  const wraps = await scope.locator(selector).evaluateAll((elements) =>
    elements
      .map((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;
        const range = document.createRange();
        range.selectNodeContents(element);
        const tops = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0).map((r) => Math.round(r.top));
        const span = tops.length ? Math.max(...tops) - Math.min(...tops) : 0;
        return span > 6 ? { text: element.textContent?.trim() ?? '', span } : null;
      })
      .filter(Boolean),
  );
  expect(wraps).toEqual([]);
}

test('#1478 攻城战象与火枪手合并多建筑变体、标注训练建筑并保持窄屏不折行不溢出', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  // 1. 桌面 1280 浅色：攻城战象战象组由 5 项合为 3 项
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/unit/1746?civ=Hindustanis');
  const panel = page.locator('#unit-reverse-counters');
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  const elephantGroup = panel.locator('[data-reverse-group]').filter({ hasText: /^战象/ });
  await expect(elephantGroup.locator('.ud-reverse-count')).toContainText('3 项');
  const elephantRows = elephantGroup.locator('[data-reverse-row]');
  await expect(elephantRows).toHaveCount(3);
  await expect(elephantRows.locator('a.ud-reverse-unit strong')).toHaveText(['长枪兵', '长戟兵', '火焰骆驼']);
  await expect(elephantRows.nth(0).locator('.ud-reverse-buildings')).toHaveText('兵营 / 城楼');
  await expect(elephantRows.nth(1).locator('.ud-reverse-buildings')).toHaveText('兵营 / 城楼');
  await expect(elephantRows.nth(2).locator('.ud-reverse-buildings')).toHaveCount(0);
  await expectSingleLineElements(elephantGroup, '.num, .nw, .ud-reverse-buildings');

  // 2. 窄屏 390 浅色：战象组无横向溢出、数值与建筑胶囊不折行
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expectSingleLineElements(elephantGroup, '.num, .nw, .ud-reverse-buildings');

  // 3. 桌面 1280 深色：攻城战象筛选西西里并展开合并长枪兵 PK 摘要
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await selectCiv(page, 'Sicilians');
  await expect(elephantGroup.locator('.ud-reverse-count')).toContainText('2 项');
  const pikemanRow = elephantGroup.locator('[data-reverse-row]:has(a[href="#/unit/358"])');
  await expect(pikemanRow).toHaveCount(1);
  await pikemanRow.locator('[data-t="reverse-counter-pk"]').click();
  const pikemanSummary = pikemanRow.getByRole('region', { name: '核对单位 PK' });
  await expect(pikemanSummary).toBeVisible();
  await expect(pikemanSummary.locator('.ud-reverse-pk-meta')).toHaveText('训练建筑：兵营 / 城楼');
  await expect(pikemanSummary.locator('[data-t="reverse-counter-open-duel"]')).toHaveAttribute('href', '#/duel?a=1746.Hindustanis.4..&b=358.Sicilians.4..&m=1');

  // 4. 窄屏 360 浅色：火枪手筛选哥特合并近卫军与精锐近卫军，PK 摘要文明名与训练建筑同享 muted 样式
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('./#/unit/5?civ=Hindustanis');
  const hcPanel = page.locator('#unit-reverse-counters');
  await expect(hcPanel).toHaveAttribute('aria-busy', 'false');
  await selectCiv(page, 'Goths');
  const archerGroup = hcPanel.locator('[data-reverse-group]').filter({ hasText: /^弓手/ });
  const archerToggle = archerGroup.locator('.ud-reverse-group-toggle');
  if ((await archerToggle.getAttribute('aria-expanded')) === 'false') await archerToggle.click();
  await expect(archerGroup.locator('a[href="#/unit/41"]')).toHaveCount(1);
  await expect(archerGroup.locator('a[href="#/unit/759"]')).toHaveCount(0);
  await expect(archerGroup.locator('a[href="#/unit/555"]')).toHaveCount(1);
  await expect(archerGroup.locator('a[href="#/unit/761"]')).toHaveCount(0);
  await expect(archerGroup.locator('a[href="#/unit/41"] .ud-reverse-buildings')).toHaveText('城堡 / 兵营');
  const eliteHuskarlRow = archerGroup.locator('[data-reverse-row]:has(a[href="#/unit/555"])');
  await eliteHuskarlRow.locator('[data-t="reverse-counter-pk"]').click();
  const huskarlSummary = eliteHuskarlRow.getByRole('region', { name: '核对单位 PK' });
  await expect(huskarlSummary.locator('.ud-reverse-pk-meta')).toHaveText('训练建筑：城堡 / 兵营');
  await expect(huskarlSummary.locator('[data-t="reverse-counter-open-duel"]')).toHaveAttribute('href', '#/duel?a=5.Hindustanis.4..&b=555.Goths.4..&m=1');
  // 校验 .ud-reverse-pk-side > span 修正：新增第 4 子项后，文明名 span 与角色/建筑元信息保持同色同字号
  const sideSpans = await huskarlSummary
    .locator('.ud-reverse-pk-side')
    .nth(1)
    .locator('> span')
    .evaluateAll((spans) => spans.map((el) => ({ color: getComputedStyle(el).color, fontSize: getComputedStyle(el).fontSize })));
  expect(sideSpans).toHaveLength(3);
  expect(sideSpans[1]).toEqual(sideSpans[0]);
  expect(sideSpans[2]).toEqual(sideSpans[0]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expectSingleLineElements(archerGroup, '.num, .nw, .ud-reverse-buildings');

  expect(errors).toEqual([]);
});

test('#1478 库曼精锐钦察区分（1233/1260）与鹰斥候西西里封建单成员 1660 PK 链路', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  // 1. 窄屏 360：长戟兵筛选库曼，1233 与 1260 保留独立行并清晰区分名称，不叠加建筑胶囊
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('./#/unit/359?civ=Franks');
  const panel = page.locator('#unit-reverse-counters');
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  await selectCiv(page, 'Cumans');
  const spearGroup = panel.locator('[data-reverse-group]').filter({ hasText: /^长矛兵/ });
  const moreBtn = spearGroup.locator('.ud-reverse-more');
  if (await moreBtn.count()) await moreBtn.click();
  const kipchak1233 = spearGroup.locator('[data-reverse-row]:has(a[href="#/unit/1233"])');
  const kipchak1260 = spearGroup.locator('[data-reverse-row]:has(a[href="#/unit/1260"])');
  await expect(kipchak1233.locator('a.ud-reverse-unit strong')).toHaveText('精锐钦察');
  await expect(kipchak1260.locator('a.ud-reverse-unit strong')).toHaveText('精锐钦察（库曼雇佣兵）');
  await expect(kipchak1233.locator('.ud-reverse-buildings')).toHaveCount(0);
  await expect(kipchak1260.locator('.ud-reverse-buildings')).toHaveCount(0);
  await kipchak1260.locator('[data-t="reverse-counter-pk"]').click();
  const kipchakSummary = kipchak1260.getByRole('region', { name: '核对单位 PK' });
  await expect(kipchakSummary.locator('a[id$="-counter-link"]')).toContainText('精锐钦察（库曼雇佣兵）');
  await expect(kipchakSummary.locator('.ud-reverse-pk-meta')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expectSingleLineElements(spearGroup, '.num, .nw');

  // 2. 桌面 1280：鹰斥候（751）筛选西西里封建，长矛兵保留「兵营 / 城楼」，萨金特卫兵收窄为 1660「城楼」且封建 PK 可用
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/unit/751/Mayans/2');
  const eaglePanel = page.locator('#unit-reverse-counters');
  await expect(eaglePanel).toHaveAttribute('aria-busy', 'false');
  await selectCiv(page, 'Sicilians');
  await eaglePanel.locator('#reverse-counter-age').selectOption('2');
  const shockGroup = eaglePanel.locator('[data-reverse-group]').filter({ hasText: /^冲击步兵/ });
  const shockToggle = shockGroup.locator('.ud-reverse-group-toggle');
  if ((await shockToggle.getAttribute('aria-expanded')) === 'false') await shockToggle.click();
  await expect(shockGroup.locator('a[href="#/unit/93"] .ud-reverse-buildings')).toHaveText('兵营 / 城楼');
  await expect(shockGroup.locator('a[href="#/unit/1658"]')).toHaveCount(0);
  const serjeant1660 = shockGroup.locator('[data-reverse-row]:has(a[href="#/unit/1660"])');
  await expect(serjeant1660.locator('a.ud-reverse-unit strong')).toHaveText('萨金特卫兵');
  await expect(serjeant1660.locator('.ud-reverse-buildings')).toHaveText('城楼');
  await serjeant1660.locator('[data-t="reverse-counter-pk"]').click();
  const serjeantSummary = serjeant1660.getByRole('region', { name: '核对单位 PK' });
  await expect(serjeantSummary.locator('a[id$="-counter-link"]')).toHaveAttribute('href', '#/unit/1660');
  await expect(serjeantSummary.locator('.ud-reverse-pk-meta')).toHaveText('训练建筑：城楼');
  await expect(serjeantSummary.locator('[data-t="reverse-counter-open-duel"]')).toHaveAttribute('href', '#/duel?a=751.Mayans.2..&b=1660.Sicilians.2..&m=1');

  // 3. 360 深色：神庙护卫（2586）筛选西西里，帝王合并 1658/1660 与 1659/1661（城堡 / 城楼），切封建仅留 1660（城楼）且因 2586 城堡单位禁用 PK
  await page.setViewportSize({ width: 360, height: 800 });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.goto('./#/unit/2586/Muisca/4');
  const templePanel = page.locator('#unit-reverse-counters');
  await expect(templePanel).toHaveAttribute('aria-busy', 'false');
  await selectCiv(page, 'Sicilians');
  await templePanel.locator('#reverse-counter-age').selectOption('4');
  const templeShock = templePanel.locator('[data-reverse-group]').filter({ hasText: /^冲击步兵/ });
  const templeToggle = templeShock.locator('.ud-reverse-group-toggle');
  if ((await templeToggle.getAttribute('aria-expanded')) === 'false') await templeToggle.click();
  const templeMore = templeShock.locator('.ud-reverse-more');
  if (await templeMore.count()) await templeMore.click();
  await expect(templeShock.locator('a[href="#/unit/1658"] .ud-reverse-buildings')).toHaveText('城堡 / 城楼');
  await expect(templeShock.locator('a[href="#/unit/1660"]')).toHaveCount(0);
  await expect(templeShock.locator('a[href="#/unit/1659"] .ud-reverse-buildings')).toHaveText('城堡 / 城楼');
  await expect(templeShock.locator('a[href="#/unit/1661"]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await templePanel.locator('#reverse-counter-age').selectOption('2');
  if ((await templeToggle.getAttribute('aria-expanded')) === 'false') await templeToggle.click();
  await expect(templeShock.locator('a[href="#/unit/1658"]')).toHaveCount(0);
  const feudalTempleSerjeant = templeShock.locator('[data-reverse-row]:has(a[href="#/unit/1660"])');
  await expect(feudalTempleSerjeant.locator('a.ud-reverse-unit strong')).toHaveText('萨金特卫兵');
  await expect(feudalTempleSerjeant.locator('.ud-reverse-buildings')).toHaveText('城楼');
  await feudalTempleSerjeant.locator('[data-t="reverse-counter-pk"]').click();
  const feudalTempleSummary = feudalTempleSerjeant.getByRole('region', { name: '核对单位 PK' });
  await expect(feudalTempleSummary.locator('a[id$="-counter-link"]')).toHaveAttribute('href', '#/unit/1660');
  await expect(feudalTempleSummary.locator('.ud-reverse-pk-meta')).toHaveText('训练建筑：城楼');
  await expect(feudalTempleSummary.getByText(/神庙护卫（穆伊斯卡）在封建时代不可用/)).toBeVisible();
  await expect(feudalTempleSummary.locator('[data-t="reverse-counter-open-duel"]')).toBeDisabled();

  expect(errors).toEqual([]);
});
