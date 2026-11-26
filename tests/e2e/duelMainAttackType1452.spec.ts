import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
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

async function openHash(page: Page, hash: string, width = 1280) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`./#${hash}`);
}

function duelAttackCell(page: Page, side: 'a' | 'b' = 'a'): Locator {
  return page.locator(`#duel-${side} .duel-stats .duel-stat-cell`).filter({ has: page.locator('dt', { hasText: /^攻击$/ }) });
}

async function openDuelTech(page: Page, side: 'a' | 'b' = 'a') {
  const det = page.locator(`#duel-${side} details.duel-tech`);
  if (!(await det.evaluate((el) => el.hasAttribute('open')))) {
    await det.locator('> summary').click();
  }
}

async function checkNoOverflowAndNw(page: Page, scope: string, maxWidth: number) {
  const res = await page.evaluate(
    ({ sel, vw }) => {
      const root = document.querySelector(sel);
      if (!root) return { found: false, overflow: 999, wrapped: [] as string[] };
      const overflow = document.documentElement.scrollWidth - vw;
      const wrapped: string[] = [];
      for (const el of root.querySelectorAll('.num.nw')) {
        const s = getComputedStyle(el);
        const rects = [...el.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
        const tops = new Set(rects.map((r) => Math.round(r.top / 4)));
        if (rects.length && (s.whiteSpace !== 'nowrap' || tops.size > 1)) wrapped.push((el.textContent ?? '').trim());
      }
      return { found: true, overflow, wrapped };
    },
    { sel: scope, vw: maxWidth },
  );
  expect(res.found).toBe(true);
  expect(res.overflow, `horizontal overflow at ${maxWidth}px`).toBeLessThanOrEqual(1);
  expect(res.wrapped, '.num.nw wrapped').toEqual([]);
}

test('Issue 1452 单兵种卡与内嵌科技详情：远程近战单位显（近战）与 atk 图标，穿刺与无普攻对照不变', async ({ page }) => {
  const errors = attachErrorGuard(page);

  for (const [query, expectedDamageText] of [
    ['a=1907.Chinese.4.f.&b=761.Goths.4.f.&m=1', '6.25'],
    ['a=531.Franks.4.f.&b=761.Goths.4.f.&m=1', '12'],
    ['a=1015.Malians.4.f.&b=761.Goths.4.f.&m=1', '15'],
  ] as const) {
    await openHash(page, `/duel?${query}`, 1280);
    await expect(page.locator('#duel-res')).toBeVisible();

    const atkCell = duelAttackCell(page, 'a');
    await expect(atkCell.locator('dd')).toContainText('（近战）');
    await expect(atkCell.locator('dd')).not.toContainText('（穿刺）');
    await expect(atkCell.locator('dt img.si')).toHaveAttribute('src', /img\/stats\/atk\.webp$/);

    // 远程接敌与拉扯开关保持可用（Fighter.ranged 未被误改）
    await expect(page.locator('#duel-a')).toContainText('边走边射');

    // 内嵌 SimPanel 攻击行同步使用 atk 图标
    await openDuelTech(page, 'a');
    const simAtkRow = page.locator('#duel-a details.duel-tech table.simtab tr').filter({ hasText: '攻击力' });
    await expect(simAtkRow.locator('img.si')).toHaveAttribute('src', /img\/stats\/atk\.webp$/);

    // 逐击伤害明细仍按近战护甲结算，与卡片口径一致
    const bd = page.locator('[data-t="damage-breakdown"]');
    if (!(await bd.evaluate((el) => el.hasAttribute('open')))) {
      await bd.locator('> summary').click();
    }
    await expect(bd).toContainText('近战');
    await expect(bd).toContainText(expectedDamageText);
  }

  // 360px 窄屏检查重型火箭推车单兵种卡无溢出、无数字折行
  await openHash(page, '/duel?a=1907.Chinese.4.f.&b=761.Goths.4.f.&m=1', 360);
  await expect(duelAttackCell(page, 'a').locator('dd')).toContainText('（近战）');
  await checkNoOverflowAndNw(page, '#duel', 360);

  // 常规远程穿刺与双类别穿刺单位维持（穿刺）与 patk 图标
  for (const query of ['a=492.Britons.4.f.&b=761.Goths.4.f.&m=1', 'a=559.Chinese.4.f.&b=761.Goths.4.f.&m=1', 'a=542.Celts.4.f.&b=761.Goths.4.f.&m=1']) {
    await openHash(page, `/duel?${query}`, 1280);
    const atkCell = duelAttackCell(page, 'a');
    await expect(atkCell.locator('dd')).toContainText('（穿刺）');
    await expect(atkCell.locator('dd')).not.toContainText('（近战）');
    await expect(atkCell.locator('dt img.si')).toHaveAttribute('src', /img\/stats\/patk\.webp$/);

    await openDuelTech(page, 'a');
    const simAtkRow = page.locator('#duel-a details.duel-tech table.simtab tr').filter({ hasText: '攻击力' });
    await expect(simAtkRow.locator('img.si')).toHaveAttribute('src', /img\/stats\/patk\.webp$/);
  }

  // 无普通攻击远程单位（僧侣 125）仍拦截为「无普通攻击」且图标维持 atk
  await openHash(page, '/duel?a=125.Britons.3..&b=4.Britons.3..&m=1', 1280);
  const monkCell = duelAttackCell(page, 'a');
  await expect(monkCell.locator('[data-t="pk-no-atk-a"]')).toHaveText('无普通攻击');
  await expect(monkCell.locator('dt img.si')).toHaveAttribute('src', /img\/stats\/atk\.webp$/);

  expect(errors).toEqual([]);
});

test('Issue 1452 混编生效属性栏与单位详情目录/模拟器攻击图标统一走 mainAttackType', async ({ page }) => {
  const errors = attachErrorGuard(page);

  // 混编：中国重型火箭推车(1907)+精锐诸葛弩(559) vs 马里精锐飞刀女兵(1015)
  const mixQuery = encodeMixedDuel({
    rule: MIXED_RULE,
    data: CURRENT_DATA,
    a: {
      civ: 'Chinese',
      age: '4',
      techs: ['52'],
      team: [],
      rows: [
        { uid: '1907', qty: '4' },
        { uid: '559', qty: '6' },
      ],
    },
    b: {
      civ: 'Malians',
      age: '4',
      techs: ['67', '68', '75'],
      team: [],
      rows: [{ uid: '1015', qty: '10' }],
    },
  }).toString();

  await openHash(page, `/duel?${mixQuery}`, 1280);
  await expect(page.getByTestId('mixed-duel')).toBeVisible();

  // A 方第 1 行（1907 重型火箭推车）：（近战），与下方实际攻击类别一致
  const rowA0 = page.getByTestId('mix-a-row-0');
  await rowA0.locator('details.mix-row-stats > summary').click();
  const rowA0Atk = rowA0
    .locator('.mix-stats')
    .first()
    .locator('div')
    .filter({ has: page.locator('dt', { hasText: /^攻击力$/ }) });
  await expect(rowA0Atk.locator('dd')).toContainText('（近战）');
  await expect(rowA0Atk.locator('dd')).not.toContainText('（穿刺）');
  await expect(rowA0.locator('dl[aria-label="实际攻击类别（含附加攻击）"]')).toContainText('近战');

  // A 方第 2 行（559 精锐诸葛弩）：双类别穿刺单位维持（穿刺）
  const rowA1 = page.getByTestId('mix-a-row-1');
  await rowA1.locator('details.mix-row-stats > summary').click();
  const rowA1Atk = rowA1
    .locator('.mix-stats')
    .first()
    .locator('div')
    .filter({ has: page.locator('dt', { hasText: /^攻击力$/ }) });
  await expect(rowA1Atk.locator('dd')).toContainText('（穿刺）');
  await expect(rowA1.locator('dl[aria-label="实际攻击类别（含附加攻击）"]')).toContainText('穿刺');

  // B 方第 1 行（1015 精锐飞刀女兵）：（近战），且远程拉扯开关保留
  const rowB0 = page.getByTestId('mix-b-row-0');
  await rowB0.locator('details.mix-row-stats > summary').click();
  const rowB0Atk = rowB0
    .locator('.mix-stats')
    .first()
    .locator('div')
    .filter({ has: page.locator('dt', { hasText: /^攻击力$/ }) });
  await expect(rowB0Atk.locator('dd')).toContainText('（近战）');
  await expect(rowB0Atk.locator('dd')).not.toContainText('（穿刺）');
  await expect(rowB0.locator('dl[aria-label="实际攻击类别（含附加攻击）"]')).toContainText('近战');
  await expect(page.locator('.mix-side.side-b')).toContainText('边走边射');

  // 混编再核对法兰克精锐掷斧兵(531) vs 不列颠劲弩手(492)
  const mixQuery2 = encodeMixedDuel({
    rule: MIXED_RULE,
    data: CURRENT_DATA,
    a: {
      civ: 'Franks',
      age: '4',
      techs: ['67', '68', '75'],
      team: [],
      rows: [{ uid: '531', qty: '8' }],
    },
    b: {
      civ: 'Britons',
      age: '4',
      techs: ['199', '200', '201'],
      team: [],
      rows: [{ uid: '492', qty: '8' }],
    },
  }).toString();

  await openHash(page, `/duel?${mixQuery2}`, 1280);
  const rowAx = page.getByTestId('mix-a-row-0');
  await rowAx.locator('details.mix-row-stats > summary').click();
  await expect(
    rowAx
      .locator('.mix-stats')
      .first()
      .locator('div')
      .filter({ has: page.locator('dt', { hasText: /^攻击力$/ }) })
      .locator('dd'),
  ).toContainText('（近战）');
  const rowXbow = page.getByTestId('mix-b-row-0');
  await rowXbow.locator('details.mix-row-stats > summary').click();
  await expect(
    rowXbow
      .locator('.mix-stats')
      .first()
      .locator('div')
      .filter({ has: page.locator('dt', { hasText: /^攻击力$/ }) })
      .locator('dd'),
  ).toContainText('（穿刺）');

  // 单位详情目录基础属性与科技模拟器：531 用 sword / atk；4 与 331 用 bow-arrow / patk
  for (const [uid, expectedSvg, expectedStatIcon] of [
    [531, 'lucide-sword', /img\/stats\/atk\.webp$/],
    [4, 'lucide-bow-arrow', /img\/stats\/patk\.webp$/],
    [331, 'lucide-bow-arrow', /img\/stats\/patk\.webp$/],
  ] as const) {
    await openHash(page, `/unit/${uid}`, 1280);
    await expect(page.locator('#unit-core [data-stat="atk"] svg')).toHaveAttribute('class', new RegExp(expectedSvg));
    await openHash(page, `/unit/${uid}?tab=sim`, 1280);
    const simAtkRow = page.locator('table.simtab tr').filter({ hasText: '攻击力' }).first();
    await expect(simAtkRow.locator('img.si')).toHaveAttribute('src', expectedStatIcon);
  }

  await openHash(page, '/unit/531', 360);
  await expect(page.locator('#unit-core [data-stat="atk"] svg')).toHaveAttribute('class', /lucide-sword/);
  await checkNoOverflowAndNw(page, '#unit', 360);

  expect(errors).toEqual([]);
});
