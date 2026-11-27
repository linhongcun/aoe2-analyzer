import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

function attachErrorGuard(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

async function openHash(page: Page, hash: string, width: number, theme: 'light' | 'dark' = 'light') {
  await page.setViewportSize({ width, height: 900 });
  if (!page.url().startsWith('http')) {
    await page.goto(`./#${hash}`);
  }
  await page.evaluate((t) => {
    window.localStorage.setItem('aoe2-theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }, theme);
  await page.goto('about:blank');
  await page.goto(`./#${hash}`);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

async function ensureDuelTechOpen(page: Page, side: 'a' | 'b' = 'a') {
  const det = page.locator(`#duel-${side} details.duel-tech`);
  if (!(await det.evaluate((el) => el.hasAttribute('open')))) {
    await det.locator('> summary').click();
  }
}

async function readResearchSummary(page: Page, side: 'a' | 'b' = 'a') {
  const sec = page.locator(`#duel-${side} .sim-summary`);
  return sec.evaluate((el) => {
    const res: Record<string, number> = {};
    for (const img of el.querySelectorAll('.sim-summary-cost img[alt]')) {
      const label = img.getAttribute('alt') ?? '';
      const parentText = img.parentElement?.textContent ?? '';
      const val = Number(parentText.replace(/[^\d.]/g, ''));
      if (label && Number.isFinite(val)) res[label] = val;
    }
    const timeText = el.querySelector('.sim-summary-time')?.textContent?.trim() ?? '';
    const time = Number(timeText.replace(/[^\d.]/g, ''));
    return { res, time };
  });
}

async function checkLayoutPillsNwAndAxe(page: Page, scope: string, maxWidth: number, axeScope = scope) {
  const res = await page.evaluate(
    ({ sel, vw }) => {
      const root = document.querySelector(sel);
      if (!root) return { found: false, overflow: 999, wrappedNums: [] as string[], wrappedPills: [] as string[], wrappedNw: [] as string[] };
      const overflow = document.documentElement.scrollWidth - vw;
      const wrappedNums: string[] = [];
      for (const el of root.querySelectorAll('.num.nw')) {
        const s = getComputedStyle(el);
        const rects = [...el.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
        const tops = new Set(rects.map((r) => Math.round(r.top / 4)));
        if (rects.length && (s.whiteSpace !== 'nowrap' || tops.size > 1)) wrappedNums.push((el.textContent ?? '').trim());
      }
      const wrappedPills: string[] = [];
      for (const el of root.querySelectorAll('.pk-unm-pill')) {
        const s = getComputedStyle(el);
        const range = document.createRange();
        range.selectNodeContents(el);
        const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
        const tops = new Set(rects.map((r) => Math.round(r.top / 4)));
        if (rects.length && (s.whiteSpace !== 'nowrap' || tops.size > 1)) wrappedPills.push((el.textContent ?? '').trim());
      }
      const wrappedNw: string[] = [];
      for (const el of root.querySelectorAll('.ucr-tag.is-mech .nw')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const range = document.createRange();
        range.selectNodeContents(el);
        const rects = [...range.getClientRects()].filter((x) => x.width > 0 && x.height > 0);
        const tops = new Set(rects.map((x) => Math.round(x.top / 4)));
        if (tops.size > 1) wrappedNw.push((el.textContent ?? '').trim());
      }
      return { found: true, overflow, wrappedNums, wrappedPills, wrappedNw };
    },
    { sel: scope, vw: maxWidth },
  );
  expect(res.found).toBe(true);
  expect(res.overflow, `horizontal overflow at ${maxWidth}px`).toBeLessThanOrEqual(1);
  expect(res.wrappedNums, '.num.nw wrapped').toEqual([]);
  expect(res.wrappedPills, '.pk-unm-pill wrapped').toEqual([]);
  expect(res.wrappedNw, '.ucr-tag.is-mech .nw wrapped').toEqual([]);

  const axe = await new AxeBuilder({ page }).include(axeScope).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations, `axe violations in ${axeScope} at ${maxWidth}px`).toEqual([]);
}

function armyCostHash({ civ, age = '4', rows, targets = [] }: { civ: string; age?: string; rows: { unit: number; qty: string }[]; targets?: string[] }) {
  const params = new URLSearchParams({
    mode: 'army-cost',
    acv: '1',
    acdata: '188329',
    civ,
    age,
    acunits: JSON.stringify(rows),
    acdone: JSON.stringify([]),
    actargets: JSON.stringify(targets),
  });
  return `/production?${params.toString()}`;
}

async function expandUnitCivRank(page: Page) {
  const sec = page.locator('#unit-civ-rank');
  await expect(sec).toBeVisible();
  const moreBtn = sec.getByRole('button', { name: /显示其余/ });
  if (await moreBtn.count()) await moreBtn.click();
}

test('Issue 1482 PK 札甲 / 野战军 / 虹吸管（含 0% 准确度共存）/ 哥瑟砍单胶囊 / 楼船反刷屏', async ({ page }) => {
  test.setTimeout(60000);
  const errors = attachErrorGuard(page);
  const card = page.locator('[data-t="pk-unmodeled"]');

  // 1) 契丹 1922 + 札甲（1006）：不进 f 预设，勾选后叠加「近战伤害反弹 · 札甲」且研究费 +450F/+300G/+40s，取消恢复
  await openHash(page, '/duel?a=1922.Khitans.4.f.&b=567.Japanese.4.f.&m=1', 1280, 'light');
  await expect(card.locator('.pk-unm-pill')).toHaveText(['命中后持续伤害']);
  await ensureDuelTechOpen(page, 'a');
  const sumBefore1006 = await readResearchSummary(page, 'a');
  const lamBox = page.locator('#duel-a label.simt').filter({ has: page.getByRole('link', { name: '札甲', exact: true }) });
  await expect(lamBox.locator('input')).not.toBeChecked();
  await lamBox.locator('input').check();
  await expect(card.locator('.pk-unm-pill')).toHaveText(['命中后持续伤害', '近战伤害反弹 · 札甲']);
  await expect(card).toContainText(
    '当前未计入受到近战攻击时的伤害反弹（已选科技「札甲」；未勾选该科技时本项不会触发）；近战对拼时实际换血能力通常高于此处估算。',
  );
  const sumChecked1006 = await readResearchSummary(page, 'a');
  expect((sumChecked1006.res['食物'] ?? 0) - (sumBefore1006.res['食物'] ?? 0)).toBe(450);
  expect((sumChecked1006.res['黄金'] ?? 0) - (sumBefore1006.res['黄金'] ?? 0)).toBe(300);
  expect(sumChecked1006.time - sumBefore1006.time).toBe(45);
  await checkLayoutPillsNwAndAxe(page, '#duel-res', 1280, '#duel');
  await lamBox.locator('input').uncheck();
  await expect(card.locator('.pk-unm-pill')).toHaveText(['命中后持续伤害']);
  expect(await readResearchSummary(page, 'a')).toEqual(sumBefore1006);

  // 反例：契丹 1372 草原突骑中札甲退回「仅文本」（无复选框）且无告警
  await openHash(page, '/duel?a=1372.Khitans.4.f.&b=567.Japanese.4.f.&m=1', 1280, 'light');
  await expect(card).toHaveCount(0);
  await ensureDuelTechOpen(page, 'a');
  const lamTextOnly = page.locator('#duel-a label.simt').filter({ has: page.getByRole('link', { name: '札甲', exact: true }) });
  await expect(lamTextOnly).toContainText('仅文本');
  await expect(lamTextOnly.locator('input')).toHaveCount(0);

  // 2) 罗马 1793 + 野战军（884）：保留在 f 预设默认出「蓄力增伤攻击 · 野战军」，取消勾选后消失（1280 浅色 + 360 深色）
  await openHash(page, '/duel?a=1793.Romans.4.f.&b=567.Japanese.4.f.&m=1', 360, 'dark');
  await expect(card.locator('.pk-unm-pill')).toHaveText(['蓄力增伤攻击 · 野战军']);
  await expect(card).toContainText(
    '当前仅按基础主攻击逐击结算，未计入蓄力攻击的周期额外增伤（已选科技「野战军」；未勾选该科技时本项不会触发）；实战爆发输出通常高于此处估算。',
  );
  await checkLayoutPillsNwAndAxe(page, '#duel-res', 360, '#duel');
  await ensureDuelTechOpen(page, 'a');
  const comBox = page.locator('#duel-a label.simt').filter({ has: page.getByRole('link', { name: '野战军', exact: true }) });
  await expect(comBox.locator('input')).toBeChecked();
  await comBox.locator('input').uncheck();
  await expect(card).toHaveCount(0);

  // 3) 拜占庭 532 快速喷火船 + 虹吸管（909）：大学常规科技，不进 f 预设，勾选后出「充能远程攻击 · 虹吸管」且与 0% 准确度并存（+100F/+175G/+45s）
  await openHash(page, '/duel?a=532.Byzantines.4.f.&b=532.Japanese.4.f.&m=1', 1280, 'light');
  await expect(card).toHaveCount(0);
  await expect(page.locator('[data-t="pk-assume-hit"]')).toContainText('目录准确度 0% 不表示打不中');
  await ensureDuelTechOpen(page, 'a');
  const sumBefore909 = await readResearchSummary(page, 'a');
  const siphBox = page.locator('#duel-a label.simt').filter({ has: page.getByRole('link', { name: '虹吸管', exact: true }) });
  await expect(siphBox.locator('input')).not.toBeChecked();
  await siphBox.locator('input').check();
  await expect(card.locator('.pk-unm-pill')).toHaveText(['充能远程攻击 · 虹吸管']);
  await expect(card).toContainText(
    '当前仅按基础主攻击逐击结算，未计入充能远程攻击（已选科技「虹吸管」；未勾选该科技时本项不会触发）；实战输出或压制能力可能高于此处估算。',
  );
  await expect(card.locator('[data-t="pk-assume-hit-inline"]')).toContainText('目录准确度 0% 不表示打不中');
  const sumChecked909 = await readResearchSummary(page, 'a');
  expect((sumChecked909.res['食物'] ?? 0) - (sumBefore909.res['食物'] ?? 0)).toBe(100);
  expect((sumChecked909.res['黄金'] ?? 0) - (sumBefore909.res['黄金'] ?? 0)).toBe(175);
  expect(sumChecked909.time - sumBefore909.time).toBe(45);
  await checkLayoutPillsNwAndAxe(page, '#duel-res', 1280, '#duel');

  // 4) 瓦兰吉 2704 + 哥瑟砍（1474）：单枚「充能远程攻击 · 哥瑟砍」，无冗余「额外弹矢 · 哥瑟砍」
  await openHash(page, '/duel?a=2704.Varangians.4.1474.&b=567.Teutons.4.f.&m=1', 1280, 'dark');
  await expect(card.locator('.pk-unm-pill')).toHaveText(['充能远程攻击 · 哥瑟砍']);
  await expect(card).not.toContainText('额外弹矢 · 哥瑟砍');
  await expect(card.locator('[data-t="pk-vg-line"]')).toHaveCount(2);

  // 5) 女真 1948 楼船 + 霹雳炸弹（997）：保留固有「充能多箭齐射」+「额外弹矢 · 霹雳炸弹」+「直线穿透」，零重复科技充能胶囊
  await openHash(page, '/duel?a=1948.Jurchens.4.997.&b=532.Japanese.4.f.&m=1', 1280, 'light');
  await expect(card.locator('.pk-unm-pill')).toHaveText(['充能多箭齐射', '额外弹矢 · 霹雳炸弹', '直线穿透']);

  expect(errors).toEqual([]);
});

test('Issue 1482 单位满科技对照（358 / 283 / 532 / 2704）与阵容新增费用（t:884 / t:1006 / t:909 及反例）', async ({ page }) => {
  test.setTimeout(60000);
  const errors = attachErrorGuard(page);

  // 1) #/unit/358：契丹行含「未计入：近战伤害反弹 · 札甲」，跳转展开 1006
  await openHash(page, '/unit/358', 1280, 'light');
  await expandUnitCivRank(page);
  const rank358 = page.locator('#unit-civ-rank');
  await expect(rank358.locator('tr[data-civ="Khitans"]')).toContainText('未计入：近战伤害反弹 · 札甲');
  await rank358.locator('tr[data-civ="Khitans"] .ucr-sel-btn').click();
  await rank358.locator('tr[data-civ="Japanese"] .ucr-sel-btn').click();
  const href358 = await rank358.locator('[data-t="ucr-pk-go"]').getAttribute('href');
  expect(href358).toContain('1006');

  // 2) #/unit/283：罗马行含「未计入：蓄力增伤攻击 · 野战军」，跳转保持 f
  await openHash(page, '/unit/283', 1280, 'light');
  await expandUnitCivRank(page);
  const rank283 = page.locator('#unit-civ-rank');
  await expect(rank283.locator('tr[data-civ="Romans"]')).toContainText('未计入：蓄力增伤攻击 · 野战军');
  await rank283.locator('tr[data-civ="Romans"] .ucr-sel-btn').click();
  await rank283.locator('tr[data-civ="Franks"] .ucr-sel-btn').click();
  const href283 = await rank283.locator('[data-t="ucr-pk-go"]').getAttribute('href');
  expect(href283).toContain('a=283.Romans.4.f.');

  // 3) #/unit/532（1280 + 360）：精确 20 个文明含「未计入：充能远程攻击 · 虹吸管」，日本行不含；360 无溢出无中点落行首
  await openHash(page, '/unit/532', 360, 'light');
  await expandUnitCivRank(page);
  const rank532 = page.locator('#unit-civ-rank');
  await expect(rank532.locator('tr[data-civ="Byzantines"]')).toContainText('未计入：充能远程攻击 · 虹吸管');
  await expect(rank532.locator('tr[data-civ="Japanese"]')).not.toContainText('虹吸管');
  expect(await rank532.locator('tbody tr', { hasText: '充能远程攻击 · 虹吸管' }).count()).toBe(20);
  await checkLayoutPillsNwAndAxe(page, '#unit-civ-rank', 360, '#unit-civ-rank');
  const leadingDot = await rank532.locator('.ucr-tag.is-mech .nw').evaluateAll((els) => els.some((el) => (el.textContent ?? '').trim().startsWith('·')));
  expect(leadingDot).toBe(false);

  // 4) #/unit/2704：瓦兰吉人行「未计入：充能远程攻击 · 哥瑟砍」，无「额外弹矢 · 哥瑟砍」
  await openHash(page, '/unit/2704', 1280, 'light');
  await expandUnitCivRank(page);
  const vgRow = page.locator('#unit-civ-rank tr[data-civ="Varangians"]');
  await expect(vgRow).toContainText('未计入：充能远程攻击 · 哥瑟砍');
  await expect(vgRow).not.toContainText('额外弹矢 · 哥瑟砍');

  // 5) 阵容新增费用：罗马 28×1793+t:884、契丹 30×1922+t:1006、拜占庭 10×532+t:909 与反例 1372+t:1006
  await openHash(page, armyCostHash({ civ: 'Romans', rows: [{ unit: 1793, qty: '28' }], targets: ['t:884'] }), 1280, 'light');
  const resultsCard = page.locator('.army-results > .army-card').first();
  await expect(resultsCard.locator('h2')).toHaveText('本期新增费用合计');
  await expect(page.getByRole('heading', { name: '未计入清单' })).toHaveCount(0);
  await expect(resultsCard.locator('.army-primary')).toContainText('3,150');
  await expect(resultsCard.locator('.army-primary')).toContainText('1,865');
  await expect(page.locator('.army-ledger-entry').filter({ has: page.locator('h3', { hasText: '野战军' }) })).toBeVisible();

  await openHash(page, armyCostHash({ civ: 'Khitans', rows: [{ unit: 1922, qty: '30' }], targets: ['t:1006'] }), 1280, 'dark');
  await expect(resultsCard.locator('h2')).toHaveText('本期新增费用合计');
  await expect(page.getByRole('heading', { name: '未计入清单' })).toHaveCount(0);
  await expect(resultsCard.locator('.army-primary')).toContainText('2,450');
  await expect(resultsCard.locator('.army-primary')).toContainText('2,150');
  await expect(page.locator('.army-ledger-entry').filter({ has: page.locator('h3', { hasText: '札甲' }) })).toBeVisible();
  await checkLayoutPillsNwAndAxe(page, 'main', 1280, 'main');

  await openHash(page, armyCostHash({ civ: 'Byzantines', rows: [{ unit: 532, qty: '10' }], targets: ['t:909'] }), 360, 'light');
  await expect(resultsCard.locator('h2')).toHaveText('本期新增费用合计');
  await expect(page.getByRole('heading', { name: '未计入清单' })).toHaveCount(0);
  await expect(resultsCard.locator('.army-primary')).toContainText('100');
  await expect(resultsCard.locator('.army-primary')).toContainText('1,300');
  await expect(resultsCard.locator('.army-primary')).toContainText('1,040');
  const siphLedger = page.locator('.army-ledger-entry').filter({ has: page.locator('h3', { hasText: '虹吸管' }) });
  await expect(siphLedger).toBeVisible();
  await expect(siphLedger).toContainText('100');
  await expect(siphLedger).toContainText('175');
  await checkLayoutPillsNwAndAxe(page, 'main', 360, 'main');

  // 反例：契丹 10×1372 + t:1006 拒收进入未计入清单，研究账本标注未计入
  await openHash(page, armyCostHash({ civ: 'Khitans', rows: [{ unit: 1372, qty: '10' }], targets: ['t:1006'] }), 1280, 'light');
  await expect(page.getByRole('heading', { name: '未计入清单' })).toBeVisible();
  const lamRejected = page.locator('.army-ledger-entry').filter({ has: page.locator('h3', { hasText: '札甲' }) });
  await expect(lamRejected).toContainText('未核实，未计入');
  await expect(lamRejected).toContainText('不属于当前阵容');

  expect(errors).toEqual([]);
});
