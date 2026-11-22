import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';

async function checkNoNumWrap(scope: Locator) {
  const broken = await scope.locator('.num.nw').evaluateAll((nodes) =>
    nodes
      .filter((el) => el.getBoundingClientRect().width > 0)
      .map((el) => ({
        text: (el.textContent ?? '').trim(),
        lines: new Set(Array.from(el.getClientRects(), (rect) => Math.round(rect.top))).size,
      }))
      .filter((item) => item.lines > 1),
  );
  expect(broken, JSON.stringify(broken)).toEqual([]);
}

async function checkMinFontSize(scope: Locator) {
  const small = await scope.evaluate((root) => {
    const issues: { tag: string; text: string; size: number }[] = [];
    for (const el of root.querySelectorAll('*')) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (!Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim())) continue;
      const size = Number.parseFloat(getComputedStyle(el).fontSize);
      if (size < 12) issues.push({ tag: el.tagName, text: (el.textContent ?? '').trim().slice(0, 30), size });
    }
    return issues;
  });
  expect(small, JSON.stringify(small)).toEqual([]);
}

async function openTheme(page: Page, hash: string, width: number, theme: 'light' | 'dark') {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`./#${hash}`);
  await page.evaluate((value) => localStorage.setItem('aoe2-theme', value), theme);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expect(page.locator('#unit h1')).toBeVisible();
}

test('#1339 桌面 1280 浅/深色：斥候三段、弗拉芒混合三卡、城堡萨金特仅出现时已生效与轻骑多时代来源', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  // 1. 斥候骑兵 448（1280 浅色）：三张升时代卡并排
  await openTheme(page, '/unit/448', 1280, 'light');
  let panel = page.getByRole('region', { name: '升时代自动变化', exact: true });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('无需研究科技，进入对应时代即自动生效；不含文明加成和其他科技。');
  await expect(panel).toContainText('来源：DE 188329 固定数据中的升时代自动规则。');
  await expect(panel.locator('[data-age-card="active"]')).toHaveCount(0);
  await expect(panel.locator('[data-age-card="upgrade"]')).toHaveCount(3);
  await expect(panel.locator('[data-age-card="upgrade"][data-age="2"] h3')).toHaveText('进入封建时代');
  await expect(panel.locator('[data-age-card="upgrade"][data-age="3"] h3')).toHaveText('进入城堡时代');
  await expect(panel.locator('[data-age-card="upgrade"][data-age="4"] h3')).toHaveText('进入帝王时代');
  await checkNoNumWrap(panel);
  await checkMinFontSize(panel);
  expect((await new AxeBuilder({ page }).include('[aria-label="升时代自动变化"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);

  // 瞿折罗斥候骑兵（448?civ=Gurjaras）：开局是骆驼斥候 1755，封建归入出现时已生效
  await page.goto('./#/unit/448?civ=Gurjaras');
  panel = page.getByRole('region', { name: '升时代自动变化', exact: true });
  await expect(panel.locator('[data-age-card="active"] h3')).toHaveText('封建时代出现时已生效');
  await expect(panel.locator('[data-age-card="upgrade"]')).toHaveCount(2);

  // 2. 城堡版萨金特卫兵 1658（1280 浅色）：仅「城堡时代出现时已生效」卡，无升时代卡，行列表宽 <= 520px
  await page.goto('./#/unit/1658');
  panel = page.getByRole('region', { name: '升时代自动变化', exact: true });
  await expect(panel.locator('[data-age-card="active"]')).toHaveCount(1);
  await expect(panel.locator('[data-age-card="upgrade"]')).toHaveCount(0);
  await expect(panel.locator('[data-age-card="active"] h3')).toHaveText('城堡时代出现时已生效');
  await expect(panel.locator('[data-age-card="active"]')).toContainText('最早在城堡时代出现。目录记录不含下列变化，出现时即为右侧数值。');
  await expect(panel.locator('[data-age-stat="hp"] [data-age-after]')).toHaveText('75');
  await expect(panel.locator('[data-age-stat="hp"] [data-age-delta]')).toContainText('城堡 +25');
  await expect(panel.locator('[data-age-stat="los"] [data-age-delta]')).toContainText('封建 +2');
  const rowsBox = (await panel.locator('.ud-age-rows').boundingBox())!;
  expect(rowsBox.width).toBeLessThanOrEqual(521);

  // 3. 轻型骑兵 546：出现时已生效合并 封建 +2；城堡 +2，另带进入帝王时代
  await page.goto('./#/unit/546');
  panel = page.getByRole('region', { name: '升时代自动变化', exact: true });
  await expect(panel.locator('[data-age-card="active"] [data-age-stat="los"] [data-age-after]')).toHaveText('8');
  await expect(panel.locator('[data-age-card="active"] [data-age-stat="los"] [data-age-delta]')).toContainText('封建 +2；城堡 +2');
  await expect(panel.locator('[data-age-card="upgrade"][data-age="4"] [data-age-stat="los"] [data-age-after]')).toHaveText('10');

  // 4. 弗拉芒民兵 1699（1280 深色）：虚线出现时已生效卡 + 城堡/帝王实底卡（含 16 秒 → 14 秒 -2 秒）
  await openTheme(page, '/unit/1699', 1280, 'dark');
  panel = page.getByRole('region', { name: '升时代自动变化', exact: true });
  await expect(panel.locator('[data-age-card="active"] h3')).toHaveText('封建时代出现时已生效');
  await expect(panel.locator('[data-age-card="upgrade"]')).toHaveCount(2);
  const castleBt = panel.locator('[data-age-card="upgrade"][data-age="3"] [data-age-stat="bt"]');
  await expect(castleBt.locator('[data-age-before]')).toHaveText('16 秒');
  await expect(castleBt.locator('[data-age-after]')).toHaveText('14 秒');
  await expect(castleBt.locator('[data-age-delta]')).toHaveText('-2 秒');
  await checkNoNumWrap(panel);
  expect((await new AxeBuilder({ page }).include('[aria-label="升时代自动变化"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);

  // 无自动变化单位（骑士 38、游侠 569）不渲染本区
  for (const hash of ['/unit/38', '/unit/569'] as const) {
    await page.goto(`./#${hash}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('region', { name: '升时代自动变化', exact: true })).toHaveCount(0);
  }

  expect(errors).toEqual([]);
});

test('#1339 窄屏 360 浅/深色：鹰斥候 387 与不可训练文明、城楼萨金特、长剑士/民兵/翼骑兵紧凑形态、骆驼斥候与运输船', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  // 1. 鹰斥候 751（360 浅色）：无文明 / 玛雅 / 阿兹特克均显示 46 秒 → 34.96 秒 (-11.04 秒)，且属性名不被压碎
  for (const hash of ['/unit/751', '/unit/751?civ=Mayans', '/unit/751?civ=Aztecs'] as const) {
    await openTheme(page, hash, 360, 'light');
    const panel = page.getByRole('region', { name: '升时代自动变化', exact: true });
    await expect(panel.locator('[data-age-card="upgrade"][data-age="2"] [data-age-stat="los"] [data-age-before]')).toHaveText('5');
    await expect(panel.locator('[data-age-card="upgrade"][data-age="2"] [data-age-stat="los"] [data-age-after]')).toHaveText('8');
    await expect(panel.locator('[data-age-card="upgrade"][data-age="2"] [data-age-stat="los"] [data-age-delta]')).toHaveText('+3');
    const castle = panel.locator('[data-age-card="upgrade"][data-age="3"]');
    const btRow = castle.locator('[data-age-stat="bt"]');
    await expect(btRow.locator('[data-age-before]')).toHaveText('46 秒');
    await expect(btRow.locator('[data-age-after]')).toHaveText('34.96 秒');
    await expect(btRow.locator('[data-age-delta]')).toHaveText('-11.04 秒');
    // 360px 防挤压实测：零横溢、.num.nw 零折行、属性名保持单行不竖排
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await checkNoNumWrap(panel);
    await checkMinFontSize(panel);
    for (const key of ['bt', 'bonus:船只', 'bonus:骆驼', 'bonus:骑兵']) {
      const labelBox = (await castle.locator(`[data-age-stat="${key}"] .ud-age-label`).boundingBox())!;
      expect(labelBox.height, `${hash} 360px ${key} 属性名不应竖排折行`).toBeLessThan(30);
    }
    const dataLink = (await panel.getByRole('link', { name: '数据说明' }).boundingBox())!;
    expect(dataLink.width).toBeGreaterThanOrEqual(44);
    expect(dataLink.height).toBeGreaterThanOrEqual(44);
  }
  expect((await new AxeBuilder({ page }).include('[aria-label="升时代自动变化"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);

  // 不可训练且非开局拥有的文明（751?civ=Incas、448?civ=Aztecs、1755?civ=Franks）：页头显示无法训练，不渲染本区
  for (const hash of ['/unit/751?civ=Incas', '/unit/448?civ=Aztecs', '/unit/1755?civ=Franks'] as const) {
    await page.goto(`./#${hash}`);
    await expect(page.locator('[data-t="cannot-train"]')).toHaveText('该文明无法训练本单位');
    await expect(page.getByRole('region', { name: '升时代自动变化', exact: true })).toHaveCount(0);
    await expect(page.locator('#unit')).not.toContainText('封建时代出现时已生效');
  }

  // 2. 城楼版萨金特卫兵 1660（360 浅色）：16 秒 → 12 秒 -4 秒
  await page.goto('./#/unit/1660');
  const donjonPanel = page.getByRole('region', { name: '升时代自动变化', exact: true });
  await expect(donjonPanel.locator('[data-age-card="active"] h3')).toHaveText('封建时代出现时已生效');
  await expect(donjonPanel.locator('[data-age-card="upgrade"][data-age="3"] [data-age-stat="bt"] [data-age-after]')).toHaveText('12 秒');
  await expect(donjonPanel.locator('[data-age-card="upgrade"][data-age="3"] [data-age-stat="bt"] [data-age-delta]')).toHaveText('-4 秒');
  await checkNoNumWrap(donjonPanel);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  // 3. 长剑士 77（360 浅色紧凑出现时已生效）与亚美尼亚语境切换
  await page.goto('./#/unit/77');
  const lsPanel = page.getByRole('region', { name: '升时代自动变化', exact: true });
  await expect(lsPanel.locator('[data-age-compact="active"]')).toBeVisible();
  await expect(lsPanel).toContainText('城堡时代出现时已生效');
  await expect(lsPanel).toContainText('目录记录 4，含封建时代自动 +2');
  const lsBox = (await lsPanel.boundingBox())!;
  expect(lsBox.height).toBeLessThan(340);
  await page.goto('./#/unit/77?civ=Armenians');
  await expect(page.getByRole('region', { name: '升时代自动变化', exact: true })).toContainText('封建时代出现时已生效');

  // 4. 翼骑兵 441（360 紧凑多时代出现时已生效）与长矛兵 93 亚美尼亚提前解锁
  await page.goto('./#/unit/441');
  const hussarPanel = page.getByRole('region', { name: '升时代自动变化', exact: true });
  await expect(hussarPanel.locator('[data-age-compact="active"]')).toBeVisible();
  await expect(hussarPanel).toContainText('帝王时代出现时已生效');
  await expect(hussarPanel).toContainText('目录记录 4，含封建 +2；城堡 +2；帝王 +2');

  await page.goto('./#/unit/93');
  await expect(page.getByRole('region', { name: '升时代自动变化', exact: true }).locator('[data-age-compact="active"]')).toBeVisible();
  await page.goto('./#/unit/93?civ=Armenians');
  await expect(page.getByRole('region', { name: '升时代自动变化', exact: true }).locator('[data-age-compact="upgrade"]')).toBeVisible();

  // 5. 骆驼斥候 1755（360 浅色，6 行含三项克制加成）
  await page.goto('./#/unit/1755');
  const camelPanel = page.getByRole('region', { name: '升时代自动变化', exact: true });
  await expect(camelPanel.locator('[data-age-card="upgrade"][data-age="2"] .ud-age-row')).toHaveCount(6);
  await expect(camelPanel.locator('[data-age-stat="bonus:骑兵"] [data-age-after]')).toHaveText('4');
  await checkNoNumWrap(camelPanel);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  // 6. 民兵 74（360 深色紧凑升时代变化）与运输船 545（360 深色载量 20 → 25 → 35，基础容量块不受影响）
  await openTheme(page, '/unit/74', 360, 'dark');
  const militiaPanel = page.getByRole('region', { name: '升时代自动变化', exact: true });
  await expect(militiaPanel.locator('[data-age-compact="upgrade"]')).toBeVisible();
  await expect(militiaPanel).toContainText('进入封建时代');
  await expect(militiaPanel.locator('[data-age-delta]')).toHaveText('+2');
  expect((await new AxeBuilder({ page }).include('[aria-label="升时代自动变化"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);

  await page.goto('./#/unit/545');
  const transportPanel = page.getByRole('region', { name: '升时代自动变化', exact: true });
  await expect(transportPanel.locator('[data-age-card="upgrade"][data-age="3"] [data-age-stat="gar"] [data-age-before]')).toHaveText('20');
  await expect(transportPanel.locator('[data-age-card="upgrade"][data-age="3"] [data-age-stat="gar"] [data-age-after]')).toHaveText('25');
  await expect(transportPanel.locator('[data-age-card="upgrade"][data-age="4"] [data-age-stat="gar"] [data-age-after]')).toHaveText('35');
  await expect(page.locator('[data-t="unit-capacity"] .ud-capacity-value')).toHaveText('20');
  await checkNoNumWrap(transportPanel);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).include('[aria-label="升时代自动变化"]').withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);

  expect(errors).toEqual([]);
});
