import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { encodeMixedDuel, mixedDataVersion } from '../../src/domain/mixedDuelParams';
import { MIXED_RULE } from '../../src/domain/mixedFight';

const DATA_SOURCES = JSON.parse(readFileSync(new URL('../../data/sources/data_sources.json', import.meta.url), 'utf8')) as {
  patch: { build: number };
};
const CURRENT_DATA = mixedDataVersion(DATA_SOURCES);

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
    await page.goto('./', { waitUntil: 'domcontentloaded' });
  }
  await page.evaluate((t) => {
    window.localStorage.setItem('aoe2-theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }, theme);
  await page.goto('about:blank');
  await page.goto(`./#${hash}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

async function openDetails(page: Page, selector: string) {
  const el = page.locator(selector);
  await expect(el).toBeVisible();
  if (!(await el.evaluate((node) => (node as HTMLDetailsElement).open))) {
    await el.locator('> summary').click();
  }
  return el;
}

async function checkOverflowNwAndContrast(page: Page, scope: string, maxWidth: number, axeScope = scope) {
  const res = await page.evaluate(
    ({ sel, vw }) => {
      const root = document.querySelector(sel);
      if (!root) return { found: false, overflow: 999, wrapped: [] as string[] };
      const overflow = document.documentElement.scrollWidth - vw;
      const wrapped: string[] = [];
      for (const el of root.querySelectorAll('.nw, .num.nw')) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const style = getComputedStyle(el);
        const textRects: DOMRect[] = [];
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
          if (node.textContent && node.textContent.trim().length > 0) {
            const range = document.createRange();
            range.selectNodeContents(node);
            for (const r of range.getClientRects()) {
              if (r.width > 0 && r.height > 0) textRects.push(r);
            }
          }
          node = walker.nextNode();
        }
        const tops = new Set(textRects.map((r) => Math.round(r.top / 4)));
        if (textRects.length > 0 && (style.whiteSpace !== 'nowrap' || tops.size > 1)) {
          wrapped.push((el.textContent ?? '').trim());
        }
      }
      return { found: true, overflow, wrapped };
    },
    { sel: scope, vw: maxWidth },
  );
  expect(res.found, `${scope} visible`).toBe(true);
  expect(res.overflow, `horizontal overflow at ${maxWidth}px`).toBeLessThanOrEqual(1);
  expect(res.wrapped, `.nw wrapped at ${maxWidth}px`).toEqual([]);

  const axe = await new AxeBuilder({ page }).include(axeScope).withRules(['color-contrast']).analyze();
  expect(axe.violations, `contrast violations in ${axeScope}`).toEqual([]);
}

test('Issue 1500 单位 PK 核心对阵胜负反转、告警隐藏、共存容器、负护甲类与成对抵消（1280 浅/深 + 360）', async ({ page }) => {
  test.setTimeout(60000);
  const errors = attachErrorGuard(page);

  // 1) 1280 浅色：孟加拉 1134 vs 印度斯坦 207（3000 预算）胜负反转为 A 胜 1/17，仅留固有溅射告警
  await openHash(page, '/duel?a=1134.Bengalis.4.f.&b=207.Hindustanis.4.f.&m=r&bud=3000', 1280, 'light');
  await expect(page.locator('#duel-res h2.duel-win')).toContainText('A · 精锐象兵 获胜');
  await expect(page.locator('#duel-res h2.duel-win')).toContainText('剩余 1 个单位');
  await expect(page.locator('[data-t="bdr-note-a"]')).toHaveText('A · 精锐象兵额外伤害减免 -25%：受帝王骆驼兵的骑兵额外伤害由 18 降至 13.5。');
  await expect(page.locator('[data-t="pk-unmodeled"] .pk-unm-pill')).toHaveText(['固有溅射伤害']);
  await expect(page.locator('[data-t="counter-summary"]')).toContainText('B · 帝王骆驼兵对骑兵 +13.5（已减 25%）');
  await checkOverflowNwAndContrast(page, '#duel-res', 1280);

  // 2) 1280 深色：西西里 283 vs 日本 359（3000 预算）B 剩余 8/50、警告卡隐藏、逐击伤害拆解与 #duel-model
  await openHash(page, '/duel?a=283.Sicilians.4.f.&b=359.Japanese.4.f.&m=r&bud=3000', 1280, 'dark');
  await expect(page.locator('#duel-res h2.duel-win')).toContainText('剩余 8 个单位');
  await expect(page.locator('[data-t="pk-unmodeled"]')).toHaveCount(0);
  await expect(page.locator('[data-t="bdr-note-a"]')).toHaveText('A · 重装骑士额外伤害减免 -40%：受长戟兵的骑兵额外伤害由 32 降至 19.2。');
  await expect(page.locator('[data-t="counter-summary"]')).toContainText('B · 长戟兵对骑兵 +19.2（已减 40%）');
  const bd = await openDetails(page, '[data-t="damage-breakdown"]');
  await expect(bd).toContainText('目标带「额外伤害减免」时，近战、穿刺之外的每类伤害按减免比例折减后再合计。');
  const secB = bd.locator('section[aria-label="B 伤害拆解"]');
  await expect(secB.locator('.damage-classes')).toContainText('骑兵：攻击 32，目标护甲 0，额外伤害 -40%，伤害 19.2');
  await expect(secB.locator('[data-t="damage-bdr-B"]')).toHaveText(
    '目标自带额外伤害减免 -40%：上述非基础类别均先按同类相减再乘以 60%（近战、穿刺主攻击不折减）。',
  );
  await expect(secB.locator('[data-t="damage-total-B"]')).toHaveText('23.2');
  await expect(bd.locator('section[aria-label="A 伤害拆解"]')).toContainText('额外伤害减免 0% 至 -40%');
  await expect(page.locator('#duel-model')).toContainText('目标带「额外伤害减免」时，近战、穿刺之外的每类伤害先按同类相减再按比例折减，合计后仍最低为 1。');
  await checkOverflowNwAndContrast(page, '#duel-res', 1280);

  // 3) 1280 浅色：1v1 达罗毗荼 359（乌兹钢）vs 西西里 283（-40%）同场共存 .duel-mech-notes
  await openHash(page, '/duel?a=359.Dravidians.4.f.&b=283.Sicilians.4.f.&m=1', 1280, 'light');
  await expect(page.locator('#duel-res .duel-mech-notes [data-t="ignore-armor-note-a"]')).toBeVisible();
  await expect(page.locator('#duel-res .duel-mech-notes [data-t="bdr-note-b"]')).toBeVisible();
  await expect(page.locator('#duel-res table.duel-tab tbody tr').first().locator('td').nth(1)).toHaveText('29.2');

  // 4) 360 浅色：孟加拉 875 vs 立陶宛 6（多类合计 + 负护甲类 减免前 6，零溢出零折行）
  await openHash(page, '/duel?a=875.Bengalis.4.f.&b=6.Lithuanians.4.f.&m=r&bud=3000', 360, 'light');
  await expect(page.locator('[data-t="pk-unmodeled"]')).toHaveCount(0);
  await expect(page.locator('[data-t="bdr-note-a"]')).toHaveText('A · 精锐骑象射手额外伤害减免 -25%：受精锐掷矛手的骑射手、弓手额外伤害合计由 10 降至 7.5。');
  const bd875 = await openDetails(page, '[data-t="damage-breakdown"]');
  const secB875 = bd875.locator('section[aria-label="B 伤害拆解"]');
  await expect(secB875.locator('.damage-classes')).toContainText('骑射手：攻击 2，目标护甲 -4，减免前 6，额外伤害 -25%，伤害 4.5');
  await expect(secB875.locator('[data-t="damage-total-B"]')).toHaveText('8.5');
  await checkOverflowNwAndContrast(page, '#duel-res', 360);
  await checkOverflowNwAndContrast(page, '[data-t="damage-breakdown"]', 360);

  // 5) 1280 深色：日本 474 vs 西西里 6 成对抵消（不刷屏 bdr-note，拆解显示抵消说明，每击 5）+ 无额外伤害反例 283 vs 569
  await openHash(page, '/duel?a=474.Japanese.4.f.&b=6.Sicilians.4.f.&m=1', 1280, 'dark');
  await expect(page.locator('[data-t="bdr-note-b"]')).toHaveCount(0);
  await expect(page.locator('#duel-res table.duel-tab tbody tr').first().locator('td').nth(1)).toHaveText('5');
  const bdCancel = await openDetails(page, '[data-t="damage-breakdown"]');
  await expect(bdCancel.locator('[data-t="damage-bdr-A"]')).toHaveText(
    '目标自带额外伤害减免 -40%：上述非基础类别均先按同类相减再乘以 60%（近战、穿刺主攻击不折减；正负额外伤害行同比例折减以保持抵消）。',
  );

  await openHash(page, '/duel?a=283.Sicilians.4.f.&b=569.Franks.4.f.&m=r&bud=3000', 1280, 'light');
  await expect(page.locator('[data-t="bdr-note-a"]')).toHaveCount(0);
  await expect(page.locator('[data-t="bdr-note-b"]')).toHaveCount(0);
  const bdNoBonus = await openDetails(page, '[data-t="damage-breakdown"]');
  await expect(bdNoBonus.locator('[data-t="damage-bdr-B"]')).toHaveCount(0);
  await expect(bdNoBonus.locator('[data-t="damage-total-B"]')).toHaveText('12');

  expect(errors).toEqual([]);
});

test('Issue 1500 混编共存、科技模拟器、各文明满科技对照与文明加成详情（1280 + 360 浅/深）', async ({ page }) => {
  test.setTimeout(60000);
  const errors = attachErrorGuard(page);

  // 1) 混编 1280 浅色：孟加拉 [1134, 875] vs 日本 [359] 合并说明行、精简未建模卡与完整规则第 6 条
  const benMix = encodeMixedDuel({
    rule: MIXED_RULE,
    data: CURRENT_DATA,
    a: {
      civ: 'Bengalis',
      age: '4',
      techs: ['435', '211', '212', '219', '81', '82', '80', '67', '68', '75'],
      team: [],
      rows: [
        { uid: '1134', qty: '17' },
        { uid: '875', qty: '10' },
      ],
    },
    b: { civ: 'Japanese', age: '4', techs: ['67', '68', '75', '74', '76', '77'], team: [], rows: [{ uid: '359', qty: '50' }] },
  }).toString();
  await openHash(page, `/duel?${benMix}`, 1280, 'light');
  await page.getByRole('button', { name: '计算混编结果', exact: true }).click();
  await expect(page.getByTestId('mixed-result')).toBeVisible();
  await expect(page.locator('[data-t="mixed-bdr-note"]')).toHaveText(
    '额外伤害减免：A1 精锐象兵（-25%）、A2 精锐骑象射手（-25%）受 B1 长戟兵 克制时额外伤害已折减。',
  );
  await expect(page.locator('[data-t="pk-unmodeled"] [data-t="pk-unmodeled-item"]')).toHaveCount(1);
  await expect(page.locator('[data-t="pk-unmodeled"] .pk-unm-pill')).toHaveText(['固有溅射伤害']);
  await openDetails(page, 'aside.mix-rules details');
  await expect(page.locator('aside.mix-rules')).toContainText('目标带「额外伤害减免」时，近战、穿刺之外的每类伤害按比例折减后再合计。');

  // 2) 混编 360 深色：达罗毗荼 [359 含乌兹钢 832] vs 西西里 [283] 共存 .mix-mech-notes
  const coexistMix = encodeMixedDuel({
    rule: MIXED_RULE,
    data: CURRENT_DATA,
    a: { civ: 'Dravidians', age: '4', techs: ['832'], team: [], rows: [{ uid: '359', qty: '20' }] },
    b: { civ: 'Sicilians', age: '4', techs: [], team: [], rows: [{ uid: '283', qty: '10' }] },
  }).toString();
  await openHash(page, `/duel?${coexistMix}`, 360, 'dark');
  await page.getByRole('button', { name: '计算混编结果', exact: true }).click();
  await expect(page.locator('.mix-mech-notes [data-t="mixed-ignore-armor-note"]')).toBeVisible();
  await expect(page.locator('.mix-mech-notes [data-t="mixed-bdr-note"]')).toHaveText('额外伤害减免：B1 重装骑士（-40%）受 A1 长戟兵 克制时额外伤害已折减。');
  await expect(page.locator('[data-t="pk-unmodeled"]')).toHaveCount(0);
  await checkOverflowNwAndContrast(page, '.mix-result', 360);

  // 3) 科技模拟器：西西里 283 显示 sim-bdr，西班牙 569 不显示
  await openHash(page, '/unit/283/Sicilians/4?tab=sim', 1280, 'light');
  await expect(page.locator('#sim')).toContainText('已计入文明加成：士兵受到的额外伤害 -40%');
  const bdrRow = page.locator('#sim [data-t="sim-bdr"]');
  await expect(bdrRow).toBeVisible();
  await expect(bdrRow.locator('td').nth(0)).toHaveText('额外伤害减免');
  await expect(bdrRow.locator('td').nth(1)).toHaveText('0% -40%');
  await expect(bdrRow.locator('td').nth(2)).toHaveText('-40%');

  await openHash(page, '/unit/569/Spanish/4?tab=sim', 1280, 'light');
  await expect(page.locator('#sim [data-t="sim-bdr"]')).toHaveCount(0);

  // 4) 各文明满科技对照：283（1280 浅色，ucr-bdr-note 在 ucr-relic-note 之前）、567（360 深色选中行）、875（1280 浅色）
  await openHash(page, '/unit/283', 1280, 'light');
  const rank283 = page.locator('#unit-civ-rank');
  await expect(rank283).toBeVisible();
  const more283 = rank283.getByRole('button', { name: /显示其余/ });
  if (await more283.count()) await more283.click();
  await expect(rank283.locator('tr[data-civ="Sicilians"] [data-t="ucr-bdr-tag"]')).toHaveText('额外伤害减免 -40%（已计入）');
  await expect(rank283.locator('tr[data-civ="Franks"] [data-t="ucr-bdr-tag"]')).toHaveCount(0);
  await expect(rank283.locator('[data-t="ucr-bdr-note"]')).toHaveText(
    '「额外伤害减免」：文明常驻减免非基础克制伤害，已计入科技模拟器与单位 PK，不改变上表 11 列基础面板与排序。',
  );
  const noteOrder = await rank283.locator('.ucr-notes > li').evaluateAll((els) => ({
    bdr: els.findIndex((e) => e.getAttribute('data-t') === 'ucr-bdr-note'),
    relic: els.findIndex((e) => e.getAttribute('data-t') === 'ucr-relic-note'),
    last: els.at(-1)?.getAttribute('data-t'),
  }));
  expect(noteOrder.bdr).toBeGreaterThanOrEqual(0);
  expect(noteOrder.bdr).toBeLessThan(noteOrder.relic);
  expect(noteOrder.last).toBe('ucr-relic-note');

  await openHash(page, '/unit/567', 360, 'dark');
  const rank567 = page.locator('#unit-civ-rank');
  await expect(rank567).toBeVisible();
  await rank567.locator('#ucr-search').fill('西西里');
  const sic567 = rank567.locator('tr[data-civ="Sicilians"]');
  await sic567.locator('.ucr-sel-btn').click();
  await expect(sic567.locator('[data-t="ucr-bdr-tag"]')).toHaveText('额外伤害减免 -40%（已计入）');
  await checkOverflowNwAndContrast(page, '#unit-civ-rank', 360);

  await openHash(page, '/unit/875', 1280, 'light');
  await expect(page.locator('#unit-civ-rank tr[data-civ="Bengalis"] [data-t="ucr-bdr-tag"]')).toHaveText('额外伤害减免 -25%（已计入）');

  // 5) 文明加成详情页：Sicilians/bonus/2 与 Bengalis/bonus/2
  await openHash(page, '/civ/Sicilians/bonus/2', 1280, 'light');
  await expect(page.locator('#bonus')).toContainText('已计入');
  await expect(page.locator('#bonus')).toContainText('数值来自游戏数据');
  await expect(page.locator('#bonus .affef .tag').first()).toContainText('受到的额外伤害 -40%');
  await expect(page.locator('#bonus .affef .tag .num').first()).toHaveText('-40%');

  await openHash(page, '/civ/Bengalis/bonus/2', 1280, 'light');
  await expect(page.locator('#bonus .affef .tag').first()).toContainText('受到的额外伤害 -25%');
  await expect(page.locator('#bonus .affef .tag .num').first()).toHaveText('-25%');

  expect(errors).toEqual([]);
});
