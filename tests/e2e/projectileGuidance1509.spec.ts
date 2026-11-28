import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { encodeMixedDuel, mixedDataVersion } from '../../src/domain/mixedDuelParams';
import { MIXED_RULE } from '../../src/domain/mixedFight';

const DATA_SOURCES = JSON.parse(readFileSync(new URL('../../data/sources/data_sources.json', import.meta.url), 'utf8')) as {
  patch: { build: number };
};
const CURRENT_DATA = mixedDataVersion(DATA_SOURCES);

const UNIT_SCOPE_NOTE = '研究后该单位投射物具备移动目标追踪并提升飞行速度；面板数值（含移速）与 PK 伤害均未计入。';
const BLD_SCOPE_NOTE = '研究后本建筑投射物具备移动目标追踪并提升飞行速度；面板数值未计入。';
const PILL = '弹丸追踪与提速 · 火绳枪';
const DETAIL =
  '当前未计入弹丸对移动目标的追踪提前量与弹丸飞行速度提升（已选科技「火绳枪」；未勾选该科技时本项不会触发）；面板与 PK 数值不变，对移动目标与拉扯作战的实际命中表现可能更优。';

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

async function assertNoOverflowOrWrap(page: Page, scope: string, maxWidth: number) {
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

test('Issue 1509 科技详情（573/93）与炮塔/城堡/箭塔模拟器及建筑满科技对照（1280 浅色 + 360 深色）', async ({ page }) => {
  test.setTimeout(60000);
  const errors = attachErrorGuard(page);

  // 1) 科技详情 573（1280 浅色 + 360 深色）与正对照 93
  for (const [width, theme] of [
    [1280, 'light'],
    [360, 'dark'],
  ] as const) {
    await openHash(page, '/tech/573?civ=Portuguese', width, theme);
    await expect(page.locator('h1')).toContainText('火绳枪');
    await expect(page.locator('#tech-cost-changes')).toHaveCount(0);
    await expect(page.locator('main')).toContainText(
      '本页不逐条模拟属性；单位科技模拟器、单位 PK、单位满科技对照、建筑模拟器与建筑满科技对照已读取固定数据编码作机制提示，其余效果以游戏说明为准',
    );
    await expect(page.locator('main')).not.toContainText('这条科技没有已解码数值规则');
    await assertNoOverflowOrWrap(page, 'main', width);
  }

  await openHash(page, '/tech/93', 1280, 'light');
  await expect(page.locator('main')).toContainText('本页不逐条模拟属性；单位 PK 与科技模拟器已读取固定数据编码作机制提示，其余效果以游戏说明为准');

  // 2) 炮塔（236）建筑模拟器与满科技对照
  await openHash(page, '/building/236?civ=Portuguese&age=4&tab=sim', 1280, 'light');
  const b236Row = page.locator('#sim label.simt').filter({ has: page.getByRole('link', { name: '火绳枪', exact: true }) });
  await expect(b236Row).toHaveCount(1);
  await expect(b236Row.locator('.tag')).toHaveText('仅文本');
  await expect(b236Row.locator('[data-t="sim-scope-note"]')).toHaveText(BLD_SCOPE_NOTE);
  await assertNoOverflowOrWrap(page, '#sim', 1280);

  for (const [width, theme] of [
    [1280, 'light'],
    [360, 'dark'],
  ] as const) {
    await openHash(page, '/building/236?civ=Portuguese', width, theme);
    const rankSec = page.locator('#building-civ-rank');
    await expect(rankSec).toBeVisible();
    const moreBtn = rankSec.getByRole('button', { name: /显示其余/ });
    if (await moreBtn.count()) await moreBtn.click();
    const portRow = rankSec.locator('tbody tr').filter({ hasText: '葡萄牙' });
    await expect(portRow).toContainText(`未计入：${PILL}`);
    await assertNoOverflowOrWrap(page, '#building-civ-rank', width);
  }

  // 3) 建筑反例：82 城堡（保留研究地点目录原文，无 scopeNote 且对照表无火绳枪标签）与 235 大型箭塔（零挂载）
  await openHash(page, '/building/82?civ=Portuguese&age=4&tab=sim', 1280, 'light');
  const b82Row = page.locator('#sim label.simt').filter({ has: page.getByRole('link', { name: '火绳枪', exact: true }) });
  await expect(b82Row).toHaveCount(1);
  await expect(b82Row.locator('[data-t="sim-scope-note"]')).toHaveCount(0);
  await expect(b82Row.locator('.note')).toContainText('火药单位对移动目标射击的准确度更高');

  await openHash(page, '/building/235?civ=Portuguese&age=4&tab=sim', 1280, 'light');
  await expect(page.locator('#sim label.simt').filter({ has: page.getByRole('link', { name: '火绳枪', exact: true }) })).toHaveCount(0);

  expect(errors).toEqual([]);
});

test('Issue 1509 单位模拟器正反例（5/283）、火枪手满科技对照（360 窄屏）、单兵 PK 三态与混编训练费用带入', async ({ page }) => {
  test.setTimeout(60000);
  const errors = attachErrorGuard(page);

  // 1) 火枪手（5）模拟器正例 + 重装骑士（283）反例清理
  await openHash(page, '/unit/5?civ=Portuguese&tab=sim', 1280, 'light');
  const u5Row = page.locator('#sim label.simt').filter({ has: page.getByRole('link', { name: '火绳枪', exact: true }) });
  await expect(u5Row).toHaveCount(1);
  await expect(u5Row.locator('.tag')).toHaveText('仅文本');
  await expect(u5Row.locator('[data-t="sim-scope-note"]')).toHaveText(UNIT_SCOPE_NOTE);

  await openHash(page, '/unit/283?civ=Portuguese&tab=sim', 1280, 'light');
  await expect(page.locator('#sim')).toBeVisible();
  await expect(page.locator('#sim label.simt').filter({ has: page.getByRole('link', { name: '火绳枪', exact: true }) })).toHaveCount(0);

  // 2) 火枪手满科技对照（360 窄屏浅色）：葡萄牙行展示三段 .nw 标签零溢出
  await openHash(page, '/unit/5?civ=Portuguese', 360, 'light');
  const uRank = page.locator('#unit-civ-rank');
  await expect(uRank).toBeVisible();
  const moreBtn = uRank.getByRole('button', { name: /显示其余/ });
  if (await moreBtn.count()) await moreBtn.click();
  const portUnitRow = uRank.locator('tbody tr').filter({ hasText: '葡萄牙' });
  await expect(portUnitRow).toContainText(`未计入：${PILL}`);
  await assertNoOverflowOrWrap(page, '#unit-civ-rank', 360);

  // 3) 单兵 PK 三态闭环：葡萄牙火枪手 vs 意大利火枪手（1280 浅色 + 390 深色）
  await openHash(page, '/duel?a=5.Portuguese.4.f.&b=5.Italians.4.f.&m=r&bud=3000', 1280, 'light');
  const card = page.locator('[data-t="pk-unmodeled"]');
  await expect(card).toBeVisible();
  // 默认 f 预设：仅意大利 B 方出烟火之术，葡萄牙 A 方无火绳枪
  await expect(card.locator('[data-t="pk-unmodeled-item"][data-side="a"]')).toHaveCount(0);
  await expect(card.locator('[data-t="pk-unmodeled-item"][data-side="b"] .pk-unm-pill')).toHaveText(['直线穿透 · 烟火之术']);
  const winBefore = await page.locator('#duel-res .duel-win').innerText();
  const tabBefore = await page.locator('#duel-res table.duel-tab').innerText();

  const detA = page.locator('#duel-a details.duel-tech');
  await detA.locator('> summary').click();
  const sumBefore = await readResearchSummary(page, 'a');
  const arqBox = page.locator('#duel-a label.simt').filter({ has: page.getByRole('link', { name: '火绳枪', exact: true }) });
  await expect(arqBox.locator('input')).not.toBeChecked();
  await expect(arqBox.locator('[data-t="sim-scope-note"]')).toHaveText(UNIT_SCOPE_NOTE);

  // 态 B：勾选火绳枪 → +700 食 +400 金 / +40s、战斗结果不变、A 方出现胶囊与说明
  await arqBox.locator('input').check();
  const itemA = card.locator('[data-t="pk-unmodeled-item"][data-side="a"]');
  await expect(itemA.locator('.pk-unm-pill')).toHaveText([PILL]);
  await expect(itemA).toContainText(DETAIL);
  const sumAfter = await readResearchSummary(page, 'a');
  expect((sumAfter.res['食物'] ?? 0) - (sumBefore.res['食物'] ?? 0)).toBe(700);
  expect((sumAfter.res['黄金'] ?? 0) - (sumBefore.res['黄金'] ?? 0)).toBe(400);
  expect(sumAfter.time - sumBefore.time).toBe(40);
  expect(await page.locator('#duel-res .duel-win').innerText()).toBe(winBefore);
  expect(await page.locator('#duel-res table.duel-tab').innerText()).toBe(tabBefore);

  // 态 C：取消勾选 → A 方提示移除、研究费与时间恢复
  await arqBox.locator('input').uncheck();
  await expect(card.locator('[data-t="pk-unmodeled-item"][data-side="a"]')).toHaveCount(0);
  expect(await readResearchSummary(page, 'a')).toEqual(sumBefore);

  // 4) 混编 PK（[5, 283] + 573）按行匹配与训练费用带入，及纯非火药 [283] 显式 573 拒收
  const mixSearch = encodeMixedDuel({
    v: '1',
    rule: MIXED_RULE,
    data: CURRENT_DATA,
    a: {
      civ: 'Portuguese',
      age: '4',
      techs: ['573'],
      team: [],
      rows: [
        { uid: '5', qty: '10' },
        { uid: '283', qty: '10' },
      ],
    },
    b: {
      civ: 'Franks',
      age: '4',
      techs: [],
      team: [],
      rows: [{ uid: '569', qty: '10' }],
    },
  });
  await openHash(page, `/duel?${mixSearch}`, 390, 'dark');
  await page.getByRole('button', { name: '计算混编结果', exact: true }).click();
  await expect(page.getByTestId('mixed-result')).toBeVisible();
  await expect(card).toBeVisible();
  await expect(card.locator('[data-t="pk-unmodeled-item"]')).toHaveCount(1);
  await expect(card.locator('[data-t="pk-unmodeled-item"]').first()).toContainText('A1');
  await expect(card.locator('[data-t="pk-unmodeled-item"]').first().locator('.pk-unm-pill')).toHaveText([PILL]);
  await assertNoOverflowOrWrap(page, '.mixed-duel', 390);

  await page.getByRole('link', { name: '计算 A 方训练费用' }).click();
  await expect(page).toHaveURL(/#\/production\?/);
  await expect(page.locator('main')).toContainText('火绳枪（仅影响战斗）');

  const badMixSearch = encodeMixedDuel({
    v: '1',
    rule: MIXED_RULE,
    data: CURRENT_DATA,
    a: {
      civ: 'Portuguese',
      age: '4',
      techs: ['573'],
      team: [],
      rows: [{ uid: '283', qty: '10' }],
    },
    b: {
      civ: 'Franks',
      age: '4',
      techs: [],
      team: [],
      rows: [{ uid: '569', qty: '10' }],
    },
  });
  await openHash(page, `/duel?${badMixSearch}`, 1280, 'light');
  await expect(page.locator('.mixed-duel')).toContainText('573');
  await expect(page.locator('main')).toContainText('A 方科技无效或对本方全部单位不适用：573');
  await expect(card).toHaveCount(0);

  expect(errors).toEqual([]);
});
