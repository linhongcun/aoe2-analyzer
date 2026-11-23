import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mixedDataVersion } from '../../src/domain/mixedDuelParams';
import { MIXED_RULE } from '../../src/domain/mixedFight';

const DATA_SOURCES = JSON.parse(readFileSync(new URL('../../data/sources/data_sources.json', import.meta.url), 'utf8'));
const CURRENT_DATA = mixedDataVersion(DATA_SOURCES);

function attachErrorGuard(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

async function openDuel(page: Page, query: string, width: number, theme: 'light' | 'dark') {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`./#/duel?${query}`);
  await page.evaluate((t) => {
    localStorage.setItem('aoe2-theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }, theme);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

async function checkLayoutPillsAndA11y(page: Page, scope: string, maxWidth: number) {
  const overflow = await page.evaluate((vw) => document.documentElement.scrollWidth <= vw + 1, maxWidth);
  expect(overflow, `horizontal overflow at ${maxWidth}px`).toBe(true);

  const wrappedNums = await page.locator(`${scope} .num.nw`).evaluateAll((els) =>
    els
      .filter((el) => {
        const s = getComputedStyle(el);
        const rects = [...el.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
        const tops = new Set(rects.map((r) => Math.round(r.top)));
        return s.whiteSpace !== 'nowrap' || tops.size > 1;
      })
      .map((el) => el.textContent),
  );
  expect(wrappedNums, '.num.nw wrapped').toEqual([]);

  const wrappedPills = await page.locator(`${scope} .pk-unm-pill`).evaluateAll((els) =>
    els
      .filter((el) => {
        const s = getComputedStyle(el);
        const range = document.createRange();
        range.selectNodeContents(el);
        const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
        const tops = new Set(rects.map((r) => Math.round(r.top)));
        return s.whiteSpace !== 'nowrap' || tops.size > 1;
      })
      .map((el) => el.textContent),
  );
  expect(wrappedPills, '.pk-unm-pill wrapped mid-pill').toEqual([]);

  const axe = await new AxeBuilder({ page }).include('#duel').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations, `axe violations at ${maxWidth}px`).toEqual([]);
}

test('#1367 单机制单段与多机制分项加粗分段（1280 浅/深 + 390 深/浅）', async ({ page }) => {
  const errors = attachErrorGuard(page);

  // 1) 单机制 1v1（1280 浅色）：波兰精锐奥布奇战锤兵 vs 精锐条顿骑士 → 1 胶囊、1 段无加粗前缀
  await openDuel(page, 'a=1703.Poles.4.f.&b=554.Teutons.4.f.&m=1', 1280, 'light');
  const card = page.locator('[data-t="pk-unmodeled"]');
  await expect(card).toBeVisible();
  const item1 = card.locator('[data-t="pk-unmodeled-item"]');
  await expect(item1).toHaveCount(1);
  await expect(item1.locator('.pk-unm-pill')).toHaveText(['撕裂护甲']);
  await expect(item1.locator('.pk-unm-desc')).toHaveCount(1);
  await expect(item1.locator('.pk-unm-desc strong')).toHaveCount(0);
  await expect(item1.locator('.pk-unm-desc')).toContainText('当前未计入每次攻击对目标护甲的削减');
  await checkLayoutPillsAndA11y(page, '#duel-res', 1280);

  // 2) 多机制 1v1（1280 深色）：格鲁吉亚精锐莫纳斯帕 vs 精锐条顿骑士 → 2 胶囊、2 段加粗前缀
  await openDuel(page, 'a=1805.Georgians.4.f.&b=554.Teutons.4.f.&m=1', 1280, 'dark');
  await expect(card.locator('[data-t="pk-unmodeled-item"]')).toHaveCount(1);
  const monaspa = card.locator('[data-t="pk-unmodeled-item"]').first();
  await expect(monaspa.locator('.pk-unm-pill')).toHaveText(['光环 / 编队增益', '生命回复']);
  await expect(monaspa.locator('.pk-unm-desc')).toHaveCount(2);
  await expect(monaspa.locator('.pk-unm-desc').nth(0)).toContainText('光环 / 编队增益：');
  await expect(monaspa.locator('.pk-unm-desc').nth(1)).toContainText('生命回复：');
  await checkLayoutPillsAndA11y(page, '#duel-res', 1280);

  // 3) 390 深色：中国楼船 vs 不列颠箭船 → 2 胶囊（充能多箭齐射 + 直线穿透）
  await openDuel(page, 'a=1948.Chinese.4.f.&b=539.Britons.4.f.&m=1', 390, 'dark');
  const louChuan = card.locator('[data-t="pk-unmodeled-item"]');
  await expect(louChuan).toHaveCount(1);
  await expect(louChuan.locator('.pk-unm-pill')).toHaveText(['充能多箭齐射', '直线穿透']);
  await expect(louChuan.locator('.pk-unm-desc')).toHaveCount(2);
  await expect(louChuan.locator('.pk-unm-desc').nth(0)).toContainText('充能多箭齐射：');
  await expect(louChuan.locator('.pk-unm-desc').nth(1)).toContainText('直线穿透：');
  await checkLayoutPillsAndA11y(page, '#duel-res', 390);

  // 4) 390 浅色：蜀战车 vs 日本冠军剑士 → 3 胶囊、3 段加粗前缀
  await openDuel(page, 'a=1962.Shu.4.f.&b=567.Japanese.4.f.&m=n&na=10&nb=20', 390, 'light');
  const chariot = card.locator('[data-t="pk-unmodeled-item"]');
  await expect(chariot).toHaveCount(1);
  await expect(chariot.locator('.pk-unm-pill')).toHaveText(['多弹丸 / 副弹丸', '可切换形态', '直线穿透']);
  await expect(chariot.locator('.pk-unm-desc')).toHaveCount(3);
  await expect(chariot.locator('.pk-unm-desc').nth(2)).toContainText('直线穿透：');
  await checkLayoutPillsAndA11y(page, '#duel-res', 390);

  expect(errors).toEqual([]);
});

test('#1367 360px 窄屏双边机制与长胶囊不折行 + 反例零误报', async ({ page }) => {
  const errors = attachErrorGuard(page);
  const card = page.locator('[data-t="pk-unmodeled"]');

  // 1) 360 浅色：吴剑士（受伤后变形态 + 生命回复）vs 马普切精锐科那（对伤员递增伤害）
  await openDuel(page, 'a=1974.Wu.3.f.&b=2568.Mapuche.4.f.&m=n&na=15&nb=15', 360, 'light');
  const items = card.locator('[data-t="pk-unmodeled-item"]');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0).locator('.pk-unm-pill')).toHaveText(['受伤后变形态', '生命回复']);
  await expect(items.nth(0).locator('.pk-unm-desc')).toHaveCount(2);
  await expect(items.nth(1).locator('.pk-unm-pill')).toHaveText(['对伤员递增伤害']);
  await expect(items.nth(1).locator('.pk-unm-desc')).toHaveCount(1);
  await expect(items.nth(1).locator('.pk-unm-desc strong')).toHaveCount(0);
  await checkLayoutPillsAndA11y(page, '#duel-res', 360);

  // 2) 360 深色长胶囊压测：柏柏尔精锐骆驼射手手动带马格里布骆驼（579）
  await openDuel(page, 'a=1009.Berbers.4.579.&b=569.Franks.4.f.&m=1', 360, 'dark');
  await expect(card.locator('[data-t="pk-unmodeled-item"]')).toHaveCount(1);
  await expect(card.locator('.pk-unm-pill')).toHaveText(['生命回复 · 马格里布骆驼']);
  await checkLayoutPillsAndA11y(page, '#duel-res', 360);

  // 3) 390 浅色反例零误报：法兰克游侠 vs 日本冠军剑士
  await openDuel(page, 'a=569.Franks.4.f.&b=567.Japanese.4.f.&m=n&na=20&nb=20', 390, 'light');
  await expect(page.locator('#duel-res')).toBeVisible();
  await expect(card).toHaveCount(0);

  expect(errors).toEqual([]);
});

test('#1367 医疗部队手动勾选实时显隐且数值不变 + 混编模式多机制汇总', async ({ page }) => {
  const errors = attachErrorGuard(page);
  const card = page.locator('[data-t="pk-unmodeled"]');

  // 1) 达罗毗荼装甲战象帝王预设不含医疗部队（831），手动勾选后即时显示提示且 PK 数值完全不变
  await openDuel(page, 'a=1744.Dravidians.4.f.&b=554.Teutons.4.f.&m=1', 1280, 'light');
  await expect(page.locator('#duel-res')).toBeVisible();
  await expect(card).toHaveCount(0);
  const winBefore = await page.locator('#duel-res .duel-win').innerText();
  const tableBefore = await page.locator('#duel-res table.duel-tab').innerText();

  await page.locator('#duel-a details.duel-tech summary').click();
  const medBox = page.locator('#duel-a label.simt').filter({ has: page.getByRole('link', { name: '医疗部队', exact: true }) });
  await expect(medBox.locator('input')).not.toBeChecked();
  await medBox.locator('input').check();

  await expect(card).toBeVisible();
  await expect(card.locator('.pk-unm-pill')).toHaveText(['生命回复 · 医疗部队']);
  await expect(page.locator('#duel-res .duel-win')).toHaveText(winBefore, { useInnerText: true });
  await expect(page.locator('#duel-res table.duel-tab')).toHaveText(tableBefore, { useInnerText: true });

  await medBox.locator('input').uncheck();
  await expect(card).toHaveCount(0);

  // 1b) 勾选医疗部队后切换为不适用单位（冠军剑士 567）：零误报提示，仍保留复选框可供单独取消，取消后恢复「仅文本」
  await medBox.locator('input').check();
  await expect(medBox.locator('input')).toBeChecked();
  await page.locator('#duel-a-unit').click();
  const pickDialog = page.getByRole('dialog', { name: 'A 方单位', exact: true });
  await pickDialog.locator('.cp-q').fill('冠军剑士');
  await pickDialog.locator('[role="option"][data-unit="567"]').click();
  await expect(card).toHaveCount(0);
  await expect(medBox.locator('input')).toBeChecked();
  await medBox.locator('input').click();
  await expect(medBox.locator('input')).toHaveCount(0);
  await expect(medBox).toContainText('仅文本');

  // 2) 混编模式（1280 浅色 + 360 深色）：蜀（精锐白毦兵 1961 + 战车 1962）vs 马普切（精锐科那 2568）
  const mixQuery = new URLSearchParams({
    m: 'mix',
    rule: MIXED_RULE,
    data: CURRENT_DATA,
    ma: JSON.stringify({
      civ: 'Shu',
      age: '4',
      techs: [],
      team: [],
      rows: [
        { uid: '1961', qty: '15' },
        { uid: '1962', qty: '10' },
      ],
    }),
    mb: JSON.stringify({
      civ: 'Mapuche',
      age: '4',
      techs: [],
      team: [],
      rows: [{ uid: '2568', qty: '15' }],
    }),
  }).toString();

  for (const [width, theme] of [
    [1280, 'light'],
    [360, 'dark'],
  ] as const) {
    await openDuel(page, mixQuery, width, theme);
    await page.getByRole('button', { name: '计算混编结果', exact: true }).click();
    await expect(page.getByTestId('mixed-result')).toBeVisible();

    const mixItems = card.locator('[data-t="pk-unmodeled-item"]');
    await expect(mixItems).toHaveCount(3);
    await expect(mixItems.nth(0)).toContainText('A1');
    await expect(mixItems.nth(0).locator('.pk-unm-pill')).toHaveText(['命中减速']);
    await expect(mixItems.nth(0).locator('.pk-unm-desc')).toHaveCount(1);
    await expect(mixItems.nth(1)).toContainText('A2');
    await expect(mixItems.nth(1).locator('.pk-unm-pill')).toHaveText(['多弹丸 / 副弹丸', '可切换形态', '直线穿透']);
    await expect(mixItems.nth(1).locator('.pk-unm-desc')).toHaveCount(3);
    await expect(mixItems.nth(2)).toContainText('B1');
    await expect(mixItems.nth(2).locator('.pk-unm-pill')).toHaveText(['对伤员递增伤害']);
    await expect(mixItems.nth(2).locator('.pk-unm-desc')).toHaveCount(1);
    await checkLayoutPillsAndA11y(page, '.mixed-duel', width);
  }

  expect(errors).toEqual([]);
});
