import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

async function checkNumNw(scope: Locator) {
  const broken = await scope.locator('.num.nw').evaluateAll((nodes) =>
    nodes
      .filter((el) => el.getBoundingClientRect().width > 0)
      .map((el) => {
        const style = getComputedStyle(el);
        return {
          text: (el.textContent ?? '').trim(),
          lines: new Set(Array.from(el.getClientRects(), (rect) => Math.round(rect.top))).size,
          tabular: style.fontVariantNumeric.includes('tabular-nums'),
          fontSize: parseFloat(style.fontSize),
        };
      })
      .filter((item) => item.lines > 1 || !item.tabular || item.fontSize < 12),
  );
  expect(broken, JSON.stringify(broken)).toEqual([]);
}

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test('#1340 验收 1-4 & 8：马普切持续生产聚落三时代倍率、兵营对照、征招隔离与页底中性说明（1280 浅/深色）', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.setViewportSize({ width: 1280, height: 900 });

  // 验收 1 + 验收 3（封建：聚落掷矛手/长矛兵 + 兵营长矛兵对照）
  await page.goto('./#/production?civ=Mapuche&age=2&rows=7%3A2556%3A2%2C93%3A2556%3A2%2C93%3A12%3A1');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('当前不可用');

  const rows = page.getByTestId('production-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('55.9 秒 / 个');
  await expect(rows.nth(0)).toContainText('已计入：聚落训练时间 ×2.15（马普切，至封建时代累计）');
  await expect(rows.nth(1)).toContainText('47.3 秒 / 个');
  await expect(rows.nth(1)).toContainText('已计入：聚落训练时间 ×2.15（马普切，至封建时代累计）');
  await expect(rows.nth(2)).toContainText('22 秒 / 个');
  await expect(rows.nth(2)).not.toContainText('聚落训练时间');

  // 建筑下拉顺序：靶场后是聚落、兵营后是聚落
  expect(await page.getByRole('combobox', { name: '需求 1 建筑', exact: true }).locator('option').allInnerTexts()).toEqual(['靶场', '聚落']);
  expect(await page.getByRole('combobox', { name: '需求 2 建筑', exact: true }).locator('option').allInnerTexts()).toEqual(['兵营', '聚落']);

  // 验收 8：删掉旧两条暂不可选警告，页底改中性说明（位于计算口径前）
  await expect(page.locator('.production-warnings')).not.toContainText('聚落生产暂不可选');
  await expect(page.locator('.production-warnings')).not.toContainText('暂不可选');
  const note = page.getByTestId('production-mapuche-settlement-note');
  await expect(note).toHaveText(
    '马普切在聚落训练掷矛手系、长矛兵系时，训练时间按时代倍率计算：封建时代 ×2.15，城堡时代累计 ×1.61，帝王时代累计约 ×1；征招不作用于聚落。兵营、靶场不受这些倍率影响。',
  );
  const footParagraphs = await page.locator('.tool-foot-notes > p').allInnerTexts();
  expect(footParagraphs[0]).toContain('马普切在聚落训练掷矛手系、长矛兵系时');
  expect(footParagraphs[1]).toContain('计算口径与未计入项。');

  const lightAxe = await new AxeBuilder({ page }).include('[data-testid="production-page"]').withRules(['color-contrast']).analyze();
  expect(lightAxe.violations, JSON.stringify(lightAxe.violations)).toEqual([]);

  // 验收 2（城堡时代）
  await page.getByRole('combobox', { name: '生产时代', exact: true }).selectOption('3');
  await expect(rows.nth(0)).toContainText('41.93 秒 / 个');
  await expect(rows.nth(0)).toContainText('已计入：聚落训练时间 ×1.61（马普切，至城堡时代累计）');
  await expect(rows.nth(1)).toContainText('35.47 秒 / 个');
  await expect(rows.nth(2)).toContainText('22 秒 / 个');

  // 验收 2 + 验收 4（帝王 + 征招，深色主题）
  await page.goto('./#/production?civ=Mapuche&age=4&techs=315&rows=359%3A2556%3A3%2C359%3A12%3A1');
  await page.evaluate(() => localStorage.setItem('aoe2-theme', 'dark'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(rows.nth(0)).toContainText('22 秒 / 个');
  await expect(rows.nth(0)).toContainText('已计入：聚落训练时间 ×1（马普切，至帝王时代累计）');
  await expect(rows.nth(0).locator('.production-line-warn')).toHaveText('征招不作用于聚落，本行训练时间未加快。');
  await expect(rows.nth(1)).toContainText('16.54 秒 / 个');
  await expect(rows.nth(1)).toContainText('已计入：征招');
  await expect(rows.nth(1).locator('.production-line-warn')).toHaveCount(0);

  const darkAxe = await new AxeBuilder({ page }).include('[data-testid="production-page"]').withRules(['color-contrast']).analyze();
  expect(darkAxe.violations, JSON.stringify(darkAxe.violations)).toEqual([]);
  await checkNumNw(page.getByTestId('production-page'));
  await expectNoOverflow(page);
  expect(errors).toEqual([]);
});

test('#1340 验收 5 & 9：360 宽城堡聚落精锐掷矛手零折行与印加聚落拒绝态', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.setViewportSize({ width: 360, height: 800 });

  await page.goto('./#/production?civ=Mapuche&age=3&rows=6%3A2556%3A2');
  await expect(page.getByRole('alert')).toHaveCount(0);
  const row = page.getByTestId('production-row').first();
  await expect(row).toContainText('35.47 秒 / 个');
  await expect(row).toContainText('已计入：聚落训练时间 ×1.61（马普切，至城堡时代累计）');
  const noteSize = await page.getByTestId('production-mapuche-settlement-note').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(noteSize).toBeGreaterThanOrEqual(12);
  await checkNumNw(page.getByTestId('production-page'));
  await expectNoOverflow(page);

  // 印加选聚落沿用拒绝态
  await page.goto('./#/production?civ=Incas&age=2&rows=93%3A2556%3A1');
  await expect(page.getByRole('combobox', { name: '需求 1 建筑', exact: true }).locator('option:checked')).toHaveText('当前不可用：聚落');
  await expect(page.getByRole('alert')).toContainText('当前方案无法计算');
  await expectNoOverflow(page);
  expect(errors).toEqual([]);
});

test('#1340 验收 7 & 9：单位详情聚落训练地点同步、聚落建筑页往返与他文明隔离（1280 浅色 / 360 深色）', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  // 1280 浅色：马普切长矛兵详情
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('./#/unit/93?civ=Mapuche');
  await expect(page.locator('[data-t="catalog-training"]')).toContainText('兵营、聚落');
  const obtain = page.locator('#unit-obtain');
  await expect(obtain.locator('.ud-training-condition')).toContainText('另可在：');
  const settlementLink = obtain.locator('.ud-training-condition a.ud-tag');
  await expect(settlementLink).toHaveText('聚落');
  await expect(settlementLink).toHaveAttribute('href', '#/building/2556?civ=Mapuche');
  const linkBox = (await settlementLink.boundingBox())!;
  expect(linkBox.width).toBeGreaterThanOrEqual(44);
  expect(linkBox.height).toBeGreaterThanOrEqual(44);
  await expect(obtain).toContainText('聚落训练较慢，时间随时代缩短：封建时代 47.3 秒 · 城堡时代 35.47 秒 · 帝王时代 22 秒。不含科技；征招不作用于聚落。');
  await checkNumNw(obtain);

  // 点击聚落标签进入建筑详情并验证印加语境目录不含
  await settlementLink.click();
  await expect(page).toHaveURL(/#\/building\/2556\?civ=Mapuche$/);
  await expect(page.locator('#building-prod')).toContainText('目录含有');
  await page.goto('./#/building/2556?civ=Incas');
  await expect(page.locator('#building-prod .bd-row').first()).toHaveAttribute('data-membership', 'out');
  await expect(page.locator('#building-prod')).toContainText('目录不含');

  // 马普切掷矛手（靶场、聚落）与长戟兵（仅帝王时代，无多余 ·）
  await page.goto('./#/unit/7?civ=Mapuche');
  await expect(page.locator('[data-t="catalog-training"]')).toContainText('靶场、聚落');
  await expect(obtain).toContainText('聚落训练较慢，时间随时代缩短：封建时代 55.9 秒 · 城堡时代 41.93 秒 · 帝王时代 26 秒。不含科技；征招不作用于聚落。');

  await page.goto('./#/unit/359?civ=Mapuche');
  await expect(page.locator('[data-t="catalog-training"]')).toContainText('兵营、聚落');
  await expect(obtain).toContainText('聚落训练较慢，时间随时代缩短：帝王时代 22 秒。不含科技；征招不作用于聚落。');

  // 他文明语境不出现聚落且不破坏缺兵文明
  for (const hash of ['/unit/93?civ=Franks', '/unit/359?civ=Britons']) {
    await page.goto(`./#${hash}`);
    await expect(page.locator('[data-t="catalog-training"]')).toContainText('兵营');
    await expect(page.locator('[data-t="catalog-training"]')).not.toContainText('聚落');
    await expect(obtain.locator('.ud-training-condition')).toHaveCount(0);
    await expect(obtain).not.toContainText('聚落');
  }

  // 360 深色：无文明精锐掷矛手详情
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('./#/unit/6');
  await page.evaluate(() => localStorage.setItem('aoe2-theme', 'dark'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('[data-t="catalog-training"]')).toContainText('靶场');
  await expect(page.locator('[data-t="catalog-training"]')).not.toContainText('聚落');
  await expect(obtain.locator('.ud-training-condition')).toContainText('马普切另可在：');
  await expect(obtain.locator('.ud-training-condition a.ud-tag')).toHaveAttribute('href', '#/building/2556?civ=Mapuche');
  await expect(obtain).toContainText('聚落训练较慢，时间随时代缩短：城堡时代 35.47 秒 · 帝王时代 22 秒。不含科技；征招不作用于聚落。');
  await checkNumNw(obtain);
  await expectNoOverflow(page);
  expect(errors).toEqual([]);
});
