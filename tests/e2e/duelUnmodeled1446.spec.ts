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

async function checkLayoutPillsNwAndAxe(page: Page, scope: string, maxWidth: number, axeScope = '#duel') {
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

async function readSimAcc(page: Page, side: 'a' | 'b' = 'a') {
  return page.locator(`#duel-${side} table.simtab tr`).filter({ hasText: '准确度' }).locator('td').last().innerText();
}

async function expandUnitCivRank(page: Page) {
  const sec = page.locator('#unit-civ-rank');
  await expect(sec).toBeVisible();
  const moreBtn = sec.getByRole('button', { name: /显示其余/ });
  if (await moreBtn.count()) await moreBtn.click();
}

test('Issue 1446 / 1500 a:24 已接入移除未建模告警与单位固有生命回复（单兵/群战/等资源、1280 浅/深 + 360）及曹操反例', async ({ page }) => {
  const errors = attachErrorGuard(page);
  const card = page.locator('[data-t="pk-unmodeled"]');

  // 1) 孟加拉精锐骑象射手 875（Issue 1500 后已建模：无未建模警告卡，改出已计入说明行）
  for (const [width, theme] of [
    [1280, 'light'],
    [360, 'dark'],
  ] as const) {
    await openHash(page, '/duel?a=875.Bengalis.4.f.&b=359.Franks.4.f.&m=1', width, theme);
    await expect(card).toHaveCount(0);
    await expect(page.locator('[data-t="bdr-note-a"]')).toBeVisible();
    await checkLayoutPillsNwAndAxe(page, '#duel-res', width);
  }

  // 2) 孟加拉精锐象兵 1134（群战 m=n，1280 深色）：移除额外伤害减免告警后仅保留固有溅射伤害
  await openHash(page, '/duel?a=1134.Bengalis.4.f.&b=359.Franks.4.f.&m=n&na=10&nb=20', 1280, 'dark');
  await expect(card.locator('.pk-unm-pill')).toHaveText(['固有溅射伤害']);
  await expect(card.locator('.pk-unm-desc')).toHaveCount(1);
  await checkLayoutPillsNwAndAxe(page, '#duel-res', 1280);

  // 3) 西西里重装骑士 283（等资源 m=r，360 浅色）与精锐萨金特 1659（单兵 m=1，1280 浅色）：已建模，警告卡隐藏
  await openHash(page, '/duel?a=283.Sicilians.4.f.&b=359.Franks.4.f.&m=r&bud=3000', 360, 'light');
  await expect(card).toHaveCount(0);
  await expect(page.locator('[data-t="bdr-note-a"]')).toBeVisible();
  await checkLayoutPillsNwAndAxe(page, '#duel-res', 360);

  await openHash(page, '/duel?a=1659.Sicilians.4.f.&b=567.Japanese.4.f.&m=1', 1280, 'light');
  await expect(card).toHaveCount(0);

  // 4) 维京狂战士 692 / 精锐狂战士 694（单位固有生命回复）
  for (const uid of [692, 694]) {
    await openHash(page, `/duel?a=${uid}.Vikings.4.f.&b=567.Japanese.4.f.&m=1`, 1280, 'light');
    await expect(card.locator('.pk-unm-pill')).toHaveText(['生命回复']);
    await expect(card).toContainText('当前未计入战斗中的生命回复（单位固有）；持久战中实际生存能力通常高于此处估算。');
  }

  // 5) 蜀刘备 1966（光环 + 单位固有生命回复）与魏曹操 1954 反例（无生命回复且保留既有光环）
  await openHash(page, '/duel?a=1966.Shu.4.f.&b=567.Japanese.4.f.&m=1', 1280, 'light');
  await expect(card.locator('.pk-unm-pill')).toHaveText(['光环 / 编队增益', '生命回复']);
  await expect(card.locator('.pk-unm-desc')).toHaveCount(2);
  await expect(card).toContainText('单位固有');

  await openHash(page, '/duel?a=1954.Wei.4.f.&b=567.Japanese.4.f.&m=1', 1280, 'light');
  await expect(card.locator('.pk-unm-pill')).toHaveText(['光环 / 编队增益']);
  await expect(card).not.toContainText('生命回复');

  expect(errors).toEqual([]);
});

test('Issue 1446 意大利烟火之术（902）预设/取消与马普切突袭（1379）6/185 及 2569/2571 三态闭环＋跨文明/跨单位裁剪', async ({ page }) => {
  test.setTimeout(60000);
  const errors = attachErrorGuard(page);
  const card = page.locator('[data-t="pk-unmodeled"]');

  // 1) 意大利火枪手 5（1280 浅色 + 360 深色）：f 预设默认勾选 902（acc=90% 且出卡）→ 取消 902 后 acc=75%、其余科技保留、提示卡消失
  await openHash(page, '/duel?a=5.Italians.4.f.&b=567.Japanese.4.f.&m=1', 360, 'dark');
  await expect(card.locator('.pk-unm-pill')).toHaveText(['直线穿透 · 烟火之术']);
  await checkLayoutPillsNwAndAxe(page, '#duel-res', 360);

  await openHash(page, '/duel?a=5.Italians.4.f.&b=567.Japanese.4.f.&m=1', 1280, 'light');
  await expect(card.locator('.pk-unm-pill')).toHaveText(['直线穿透 · 烟火之术']);
  await expect(card).toContainText('已选科技「烟火之术」；未勾选该科技时本项不会触发');
  await ensureDuelTechOpen(page, 'a');
  await expect(readSimAcc(page, 'a')).resolves.toContain('90');
  const piroBox = page.locator('#duel-a label.simt').filter({ has: page.getByRole('link', { name: '烟火之术', exact: true }) });
  const armorBox = page.locator('#duel-a label.simt').filter({ has: page.getByRole('link', { name: '射手锁甲', exact: true }) });
  await expect(piroBox.locator('input')).toBeChecked();
  await expect(armorBox.locator('input')).toBeChecked();
  await piroBox.locator('input').uncheck();
  await expect(card).toHaveCount(0);
  await expect(readSimAcc(page, 'a')).resolves.toContain('75');
  await expect(armorBox.locator('input')).toBeChecked();

  // 2) 马普切 6 / 185（默认无提示卡）：未勾选 → 勾选 1379 → 取消勾选 1379 三态闭环（研究费 +300F +350G / +40s 并恢复，其余科技与战果全程不变）
  for (const uid of [6, 185]) {
    await openHash(page, `/duel?a=${uid}.Mapuche.4.f.&b=567.Japanese.4.f.&m=1`, 1280, 'light');
    await expect(page.locator('#duel-res')).toBeVisible();
    await expect(card).toHaveCount(0);
    const winBefore = await page.locator('#duel-res .duel-win').innerText();
    const tabBefore = await page.locator('#duel-res table.duel-tab').innerText();
    await ensureDuelTechOpen(page, 'a');
    const sumBefore = await readResearchSummary(page, 'a');
    const otherCheckedBefore = await page.locator('#duel-a label.simt input:checked').count();
    const malonBox = page.locator('#duel-a label.simt').filter({ has: page.getByRole('link', { name: '突袭', exact: true }) });
    await expect(malonBox.locator('input')).not.toBeChecked();

    await malonBox.locator('input').check();
    await expect(card.locator('.pk-unm-pill')).toHaveText(['直线穿透 · 突袭']);
    await expect(card).toContainText('已选科技「突袭」；未勾选该科技时本项不会触发');
    const sumChecked = await readResearchSummary(page, 'a');
    expect((sumChecked.res['食物'] ?? 0) - (sumBefore.res['食物'] ?? 0)).toBe(300);
    expect((sumChecked.res['黄金'] ?? 0) - (sumBefore.res['黄金'] ?? 0)).toBe(350);
    expect(sumChecked.time - sumBefore.time).toBe(40);
    await expect(page.locator('#duel-res .duel-win')).toHaveText(winBefore, { useInnerText: true });
    await expect(page.locator('#duel-res table.duel-tab')).toHaveText(tabBefore, { useInnerText: true });
    expect(await page.locator('#duel-a label.simt input:checked').count()).toBe(otherCheckedBefore + 1);

    await malonBox.locator('input').uncheck();
    await expect(card).toHaveCount(0);
    const sumAfter = await readResearchSummary(page, 'a');
    expect(sumAfter).toEqual(sumBefore);
    expect(await page.locator('#duel-a label.simt input:checked').count()).toBe(otherCheckedBefore);
    await expect(page.locator('#duel-res .duel-win')).toHaveText(winBefore, { useInnerText: true });
    await expect(page.locator('#duel-res table.duel-tab')).toHaveText(tabBefore, { useInnerText: true });
  }

  // 3) 马普切 2569 / 2571 同组三态断言：默认保留「充能远程攻击」→ 勾选 1379 叠加「直线穿透 · 突袭」且研究费 +300F/+350G/+40s → 取消仅移除穿透提示并恢复研究费，其余已选科技与战果三态全程一致
  for (const uid of [2569, 2571]) {
    await openHash(page, `/duel?a=${uid}.Mapuche.4.f.&b=567.Japanese.4.f.&m=1`, 1280, 'light');
    await expect(card.locator('.pk-unm-pill')).toHaveText(['充能远程攻击']);
    const winBefore = await page.locator('#duel-res .duel-win').innerText();
    const tabBefore = await page.locator('#duel-res table.duel-tab').innerText();
    await ensureDuelTechOpen(page, 'a');
    const sumBefore = await readResearchSummary(page, 'a');
    const otherCheckedBefore = await page.locator('#duel-a label.simt input:checked').count();
    const malonBox = page.locator('#duel-a label.simt').filter({ has: page.getByRole('link', { name: '突袭', exact: true }) });
    await expect(malonBox.locator('input')).not.toBeChecked();

    await malonBox.locator('input').check();
    await expect(card.locator('.pk-unm-pill')).toHaveText(['充能远程攻击', '直线穿透 · 突袭']);
    const sumChecked = await readResearchSummary(page, 'a');
    expect((sumChecked.res['食物'] ?? 0) - (sumBefore.res['食物'] ?? 0)).toBe(300);
    expect((sumChecked.res['黄金'] ?? 0) - (sumBefore.res['黄金'] ?? 0)).toBe(350);
    expect(sumChecked.time - sumBefore.time).toBe(40);
    await expect(page.locator('#duel-res .duel-win')).toHaveText(winBefore, { useInnerText: true });
    await expect(page.locator('#duel-res table.duel-tab')).toHaveText(tabBefore, { useInnerText: true });
    expect(await page.locator('#duel-a label.simt input:checked').count()).toBe(otherCheckedBefore + 1);

    await malonBox.locator('input').uncheck();
    await expect(card.locator('.pk-unm-pill')).toHaveText(['充能远程攻击']);
    const sumAfter = await readResearchSummary(page, 'a');
    expect(sumAfter).toEqual(sumBefore);
    expect(await page.locator('#duel-a label.simt input:checked').count()).toBe(otherCheckedBefore);
    await expect(page.locator('#duel-res .duel-win')).toHaveText(winBefore, { useInnerText: true });
    await expect(page.locator('#duel-res table.duel-tab')).toHaveText(tabBefore, { useInnerText: true });
  }

  // 4) 马普切 185 勾选 1379 → 切单位至长戟兵 359：URL 立即裁剪 1379，恢复仅文本且零提示
  await openHash(page, '/duel?a=185.Mapuche.4.1379.&b=567.Japanese.4.f.&m=1', 1280, 'light');
  await expect(card.locator('.pk-unm-pill')).toHaveText(['直线穿透 · 突袭']);
  await page.locator('#duel-a-unit').click();
  const unitDialog = page.getByRole('dialog', { name: 'A 方单位', exact: true });
  await unitDialog.locator('.cp-q').fill('长戟兵');
  await unitDialog.locator('[role="option"][data-unit="359"]').click();
  await expect(card).toHaveCount(0);
  await expect.poll(() => new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('a')).toBe('359.Mapuche.4..');

  // 5) 零误报反例：丹麦 567、意大利 492、马普切 359、跨文明普通链接 5.Turks.4.902. 自动规范化
  for (const [query, label] of [
    ['a=567.Danes.4.f.&b=567.Japanese.4.f.&m=1', 'Danes 567'],
    ['a=492.Italians.4.f.&b=567.Japanese.4.f.&m=1', 'Italians 492'],
    ['a=359.Mapuche.4.f.&b=567.Japanese.4.f.&m=1', 'Mapuche 359'],
  ] as const) {
    await openHash(page, `/duel?${query}`, 1280, 'light');
    await expect(page.locator('#duel-res'), label).toBeVisible();
    await expect(card, label).toHaveCount(0);
  }
  await openHash(page, '/duel?a=5.Turks.4.902.&b=567.Japanese.4.f.&m=1', 1280, 'light');
  await expect(card).toHaveCount(0);
  await expect.poll(() => new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('a')).toBe('5.Turks.4..');

  // 6) 外部比较链接携带跨文明非法科技 5.Turks.4.902. 仍严格拒收
  const badCmp = new URLSearchParams({
    a: '5.Turks.4.902.',
    b: '567.Japanese.4..',
    m: '1',
    base: '5.Turks.4..',
    fixed: '567.Japanese.4..',
    basev: String(DATA_SOURCES.patch.build),
  }).toString();
  await openHash(page, `/duel?${badCmp}`, 1280, 'light');
  await expect(page.locator('[data-t="upgrade-comparison"] [data-t="upgrade-status"]')).toContainText('烟火之术');
  expect(new URLSearchParams(new URL(page.url()).hash.split('?')[1]).get('a')).toBe('5.Turks.4.902.');

  expect(errors).toEqual([]);
});

test('Issue 1446 混编精确行匹配与单位满科技对照（#/unit/283, #/unit/5, #/unit/185，1280 + 360）', async ({ page }) => {
  const errors = attachErrorGuard(page);

  // 1) 意大利混编 [5, 492] 勾选 902：仅火枪手行出卡（A1），劲弩手行无告警
  const itMix = encodeMixedDuel({
    rule: MIXED_RULE,
    data: CURRENT_DATA,
    a: {
      civ: 'Italians',
      age: '4',
      techs: ['47', '902'],
      team: [],
      rows: [
        { uid: '5', qty: '10' },
        { uid: '492', qty: '10' },
      ],
    },
    b: {
      civ: 'Japanese',
      age: '4',
      techs: [],
      team: [],
      rows: [{ uid: '567', qty: '15' }],
    },
  }).toString();
  await openHash(page, `/duel?${itMix}`, 1280, 'light');
  await page.getByRole('button', { name: '计算混编结果', exact: true }).click();
  await expect(page.getByTestId('mixed-result')).toBeVisible();
  const mixCard = page.locator('[data-t="pk-unmodeled"]');
  await expect(mixCard).toBeVisible();
  await expect(mixCard.locator('[data-t="pk-unmodeled-item"]')).toHaveCount(1);
  await expect(mixCard.locator('[data-t="pk-unmodeled-item"]').first()).toContainText('A1');
  await expect(mixCard.locator('[data-t="pk-unmodeled-item"]').first().locator('.pk-unm-pill')).toHaveText(['直线穿透 · 烟火之术']);
  await checkLayoutPillsNwAndAxe(page, '.mixed-duel', 1280, '#duel');

  // 意大利纯 [492] 混编显式 902 拦截
  const itMixNeg = encodeMixedDuel({
    rule: MIXED_RULE,
    data: CURRENT_DATA,
    a: {
      civ: 'Italians',
      age: '4',
      techs: ['902'],
      team: [],
      rows: [{ uid: '492', qty: '10' }],
    },
    b: {
      civ: 'Japanese',
      age: '4',
      techs: [],
      team: [],
      rows: [{ uid: '567', qty: '15' }],
    },
  }).toString();
  await openHash(page, `/duel?${itMixNeg}`, 1280, 'light');
  await expect(page.locator('.mixed-duel')).toContainText('902');
  await expect(mixCard).toHaveCount(0);

  // 2) 马普切混编 [185, 359] 勾选 1379（360 窄屏）：仅投石手行出卡（A1），长戟兵行无告警
  const mapMix = encodeMixedDuel({
    rule: MIXED_RULE,
    data: CURRENT_DATA,
    a: {
      civ: 'Mapuche',
      age: '4',
      techs: ['1379'],
      team: [],
      rows: [
        { uid: '185', qty: '10' },
        { uid: '359', qty: '10' },
      ],
    },
    b: {
      civ: 'Japanese',
      age: '4',
      techs: [],
      team: [],
      rows: [{ uid: '567', qty: '15' }],
    },
  }).toString();
  await openHash(page, `/duel?${mapMix}`, 360, 'light');
  await page.getByRole('button', { name: '计算混编结果', exact: true }).click();
  await expect(page.getByTestId('mixed-result')).toBeVisible();
  await expect(mixCard.locator('[data-t="pk-unmodeled-item"]')).toHaveCount(1);
  await expect(mixCard.locator('[data-t="pk-unmodeled-item"]').first()).toContainText('A1');
  await expect(mixCard.locator('[data-t="pk-unmodeled-item"]').first().locator('.pk-unm-pill')).toHaveText(['直线穿透 · 突袭']);
  await checkLayoutPillsNwAndAxe(page, '.mixed-duel', 360, '#duel');

  // 马普切纯 [359] 混编显式 1379 拦截
  const mapMixNeg = encodeMixedDuel({
    rule: MIXED_RULE,
    data: CURRENT_DATA,
    a: {
      civ: 'Mapuche',
      age: '4',
      techs: ['1379'],
      team: [],
      rows: [{ uid: '359', qty: '10' }],
    },
    b: {
      civ: 'Japanese',
      age: '4',
      techs: [],
      team: [],
      rows: [{ uid: '567', qty: '15' }],
    },
  }).toString();
  await openHash(page, `/duel?${mapMixNeg}`, 1280, 'light');
  await expect(page.locator('.mixed-duel')).toContainText('1379');
  await expect(mixCard).toHaveCount(0);

  // 3) 单位满科技对照：#/unit/283（Issue 1500 后西西里改显已计入标签）、#/unit/5（意大利烟火之术 + f 跳转）、#/unit/185（马普切突袭 + 显式 ID 跳转）与 360px .nw 分段
  await openHash(page, '/unit/283', 1280, 'light');
  await expandUnitCivRank(page);
  const sic283 = page.locator('#unit-civ-rank tr[data-civ="Sicilians"]');
  await expect(sic283).not.toContainText('未计入：额外伤害减免');
  await expect(sic283.locator('[data-t="ucr-bdr-tag"]')).toHaveText('额外伤害减免 -40%（已计入）');

  await openHash(page, '/unit/5', 1280, 'light');
  await expandUnitCivRank(page);
  const hcRank = page.locator('#unit-civ-rank');
  await expect(hcRank.locator('tr[data-civ="Italians"]')).toContainText('未计入：直线穿透 · 烟火之术');
  await hcRank.locator('tr[data-civ="Italians"] .ucr-sel-btn').click();
  await hcRank.locator('tr[data-civ="Turks"] .ucr-sel-btn').click();
  const hcHref = await hcRank.locator('[data-t="ucr-pk-go"]').getAttribute('href');
  expect(hcHref).toContain('a=5.Italians.4.f.');

  await openHash(page, '/unit/185', 1280, 'light');
  await expandUnitCivRank(page);
  const slingerRank = page.locator('#unit-civ-rank');
  await expect(slingerRank.locator('tr[data-civ="Mapuche"]')).toContainText('未计入：直线穿透 · 突袭');
  await slingerRank.locator('tr[data-civ="Mapuche"] .ucr-sel-btn').click();
  await slingerRank.locator('tr[data-civ="Incas"] .ucr-sel-btn').click();
  const slingerHref = await slingerRank.locator('[data-t="ucr-pk-go"]').getAttribute('href');
  expect(slingerHref).toContain('1379');
  expect(slingerHref).not.toContain('a=185.Mapuche.4.f.');

  // 360px 窄屏：#/unit/5 与 #/unit/185 的 .ucr-tag.is-mech 语义分段不折断、间隔中点不落行首、零横向溢出
  for (const unitHash of ['/unit/5', '/unit/185']) {
    await openHash(page, unitHash, 360, 'light');
    await expandUnitCivRank(page);
    await checkLayoutPillsNwAndAxe(page, '#unit-civ-rank', 360, '#unit-civ-rank');
    const leadingDot = await page
      .locator('#unit-civ-rank .ucr-tag.is-mech .nw')
      .evaluateAll((els) => els.some((el) => (el.textContent ?? '').trim().startsWith('·')));
    expect(leadingDot, `${unitHash} middot must not lead a segment`).toBe(false);
  }

  expect(errors).toEqual([]);
});
