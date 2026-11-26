import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadCore, loadTrees, type Core } from '../../src/data';
import {
  damagePerHit,
  fighterCanAttack,
  fighterFrom,
  fighterUsesAssumeHit,
  groupFight,
  mainAttackType,
  oneVOneFight,
  unitHasNormalAttack,
} from '../../src/domain/duel';
import { isDuelExcludedUnit } from '../../src/domain/duelBudget';
import { collapse } from '../../src/domain/family';
import { mixedFight } from '../../src/domain/mixedFight';
import { baseStats, makeSimContext, type SimContext } from '../../src/domain/simulator';
import type { Trees, Unit } from '../../src/domain/types';
import { Side } from '../../src/features/duel/components/DuelSelection';
import { MixedSideEditor } from '../../src/features/duel/components/MixedSideEditor';
import { resolveDuelKiteEligibility } from '../../src/features/duel/logic/duelKiteView';
import { isUnavail, resolve } from '../../src/features/duel/logic/duelSide';
import { resolveMixedSide } from '../../src/features/duel/logic/mixedDuel';
import { mixedTrainingTransfer } from '../../src/features/duel/logic/mixedTrainingTransfer';
import { CatalogStats } from '../../src/features/units/components/unitDetailParts';
import Simulator from '../../src/shared/ui/sim/Simulator';

const state = vi.hoisted(() => ({
  core: null as Core | null,
  trees: null as Trees | null,
}));

vi.mock('../../src/data/hooks', async (original) => ({
  ...(await original<typeof import('../../src/data/hooks')>()),
  useCore: () => state.core,
  useTrees: () => state.trees,
}));

const EXPECTED_RANGED_MELEE_IDS = [
  36, 280, 281, 282, 420, 529, 531, 532, 550, 556, 588, 691, 1013, 1015, 1103, 1302, 1709, 1741, 1743, 1795, 1904, 1907, 1923, 1942, 1948, 2633, 2708, 2709,
];

let core: Core;
let trees: Trees;
let ctx: SimContext;
let fams: ReturnType<typeof collapse>;

beforeAll(async () => {
  core = await loadCore();
  trees = await loadTrees();
  state.core = core;
  state.trees = trees;
  ctx = makeSimContext(core.techs, trees);
  fams = collapse(core.units, core.fam);
});

function renderCatalogStats(u: Unit): string {
  return renderToStaticMarkup(createElement(StaticRouter, { location: `/unit/${u.id}` }, createElement(CatalogStats, { u, base: u, elite: false })));
}

function statTile(html: string, stat: string): string {
  const start = html.indexOf(`data-stat="${stat}"`);
  expect(start).toBeGreaterThan(-1);
  const next = html.indexOf('data-stat=', start + 1);
  return html.slice(start, next < 0 ? undefined : next);
}

function renderDuelSide(uid: number, civ: string, age = 4, techs: 'f' | 'c' | number[] = 'f'): string {
  const side = resolve(ctx, core.unitById, { uid, civ, age, ageSet: true, techs, team: [] }, uid);
  expect(isUnavail(side)).toBe(false);
  return renderToStaticMarkup(
    createElement(
      StaticRouter,
      { location: '/duel' },
      createElement(Side, {
        k: 'a',
        side,
        fams,
        onChange: () => {},
        count: 1,
        bud: 0,
        time: null,
        context: { core, trees },
      }),
    ),
  );
}

function extractDuelAttackCell(html: string): string {
  const match = html.match(/<div class="duel-stat-cell"><dt>.*?攻击<\/dt><dd>.*?<\/dd><\/div>/s);
  expect(match, 'attack cell should exist in duel-stats').not.toBeNull();
  return match![0];
}

function extractSimAttackRow(html: string): string {
  const match = html.match(/<tr><td><img[^>]*class="si"[^>]*\/>攻击力<\/td>.*?<\/tr>/s);
  expect(match, 'attack row should exist in SimPanel table').not.toBeNull();
  return match![0];
}

function renderMixedEditor(civ: string, uid: number, age = '4', techs: string[] = []): string {
  const input = { civ, age, techs, team: [], rows: [{ uid: String(uid), qty: '4' }] };
  const view = resolveMixedSide(ctx, core, input, 'a');
  const transfer = mixedTrainingTransfer({ core, trees }, input, 'a', view);
  return renderToStaticMarkup(
    createElement(
      StaticRouter,
      { location: '/duel?m=mix' },
      createElement(MixedSideEditor, {
        side: 'a',
        input,
        view,
        core,
        ctx,
        transfer,
        focusField: () => {},
        onChange: () => {},
      }),
    ),
  );
}

function extractMixedAttackRow(html: string): string {
  const match = html.match(/<div><dt>攻击力<\/dt><dd[^>]*>.*?<\/dd><\/div>/s);
  expect(match, 'attack row should exist in MixedSideEditor').not.toBeNull();
  return match![0];
}

function renderUnitSimulator(u: Unit, civ: string): string {
  return renderToStaticMarkup(
    createElement(StaticRouter, { location: `/unit/${u.id}/${civ}/4` }, createElement(Simulator, { u, route: { id: u.id, civ, age: 4, ids: [], team: [] } })),
  );
}

describe('Issue #1452：单位 PK、混编与单位详情统一按 mainAttackType(u) 展示主攻击类别与图标', () => {
  it('验收 1：遍历全库 248 个单位，精确锁定 28 个远程近战、0 反向样本、双类别穿刺与无普攻远程边界', () => {
    expect(core.units.length).toBe(248);

    const rangedMeleeIds = core.units
      .filter((u) => u.rng > 1 && mainAttackType(u) === '近战')
      .map((u) => u.id)
      .sort((a, b) => a - b);
    expect(rangedMeleeIds).toEqual(EXPECTED_RANGED_MELEE_IDS);
    expect(rangedMeleeIds).toHaveLength(28);

    const meleePierceIds = core.units.filter((u) => u.rng <= 1 && mainAttackType(u) === '穿刺').map((u) => u.id);
    expect(meleePierceIds).toEqual([]);

    for (const id of rangedMeleeIds) {
      const u = core.unitById[id]!;
      expect(unitHasNormalAttack(u), `unit ${id} has normal attack`).toBe(true);
      expect(u.civs.length, `unit ${id} has civs`).toBeGreaterThanOrEqual(1);
      expect(isDuelExcludedUnit(u.id), `unit ${id} not excluded from duel`).toBe(false);
      const f = fighterFrom(u, baseStats(u));
      expect(f.ranged, `unit ${id} Fighter.ranged must stay true`).toBe(true);
      expect(Object.keys(f.attack)[0], `unit ${id} primary attack class`).toBe('近战');
    }

    for (const u of core.units) {
      const atkTile = statTile(renderCatalogStats(u), 'atk');
      const expectedSvg = mainAttackType(u) === '穿刺' ? 'lucide-bow-arrow' : 'lucide-sword';
      expect(atkTile, `CatalogStats icon for unit ${u.id}`).toContain(expectedSvg);

      if (unitHasNormalAttack(u)) {
        const f = fighterFrom(u, baseStats(u));
        expect(Object.keys(f.attack)[0], `fighterFrom primary class for unit ${u.id}`).toBe(mainAttackType(u));
      }
    }

    // 双类别穿刺单位（73/559 诸葛弩、279/542 弩炮）与巨型投石机（331）保持穿刺口径
    for (const id of [73, 559, 279, 542, 331]) {
      const u = core.unitById[id]!;
      expect(mainAttackType(u), `unit ${id}`).toBe('穿刺');
      const atkTile = statTile(renderCatalogStats(u), 'atk');
      expect(atkTile, `unit ${id} svg`).toContain('lucide-bow-arrow');
    }

    // 无普通攻击远程单位（125 僧侣、775 传教士）
    for (const id of [125, 775]) {
      const u = core.unitById[id]!;
      expect(u.rng).toBeGreaterThan(1);
      expect(unitHasNormalAttack(u)).toBe(false);
      expect(fighterCanAttack(fighterFrom(u, baseStats(u)))).toBe(false);
    }
  });

  it('验收 2a：单兵种卡与内嵌 SimPanel 对远程近战单位显「（近战）」与 atk，对穿刺对照显「（穿刺）」与 patk，无普攻显「无普通攻击」与 atk', () => {
    for (const [uid, civ] of [
      [1907, 'Chinese'],
      [531, 'Franks'],
      [1015, 'Malians'],
      [556, 'Saracens'],
      [36, 'Turks'],
      [74, 'Britons'],
    ] as const) {
      const html = renderDuelSide(uid, civ);
      const cell = extractDuelAttackCell(html);
      expect(cell, `unit ${uid} label`).toContain('（近战）');
      expect(cell, `unit ${uid} no pierce`).not.toContain('（穿刺）');
      expect(cell, `unit ${uid} card icon`).toContain('stats/atk.webp');
      expect(cell, `unit ${uid} card no patk`).not.toContain('stats/patk.webp');

      const simRow = extractSimAttackRow(html);
      expect(simRow, `unit ${uid} embedded sim icon`).toContain('stats/atk.webp');
      expect(simRow, `unit ${uid} embedded sim no patk`).not.toContain('stats/patk.webp');
    }

    for (const [uid, civ] of [
      [492, 'Britons'],
      [559, 'Chinese'],
      [542, 'Celts'],
      [331, 'Britons'],
    ] as const) {
      const html = renderDuelSide(uid, civ);
      const cell = extractDuelAttackCell(html);
      expect(cell, `unit ${uid} label`).toContain('（穿刺）');
      expect(cell, `unit ${uid} no melee`).not.toContain('（近战）');
      expect(cell, `unit ${uid} card icon`).toContain('stats/patk.webp');

      const simRow = extractSimAttackRow(html);
      expect(simRow, `unit ${uid} embedded sim icon`).toContain('stats/patk.webp');
    }

    for (const [uid, civ] of [
      [125, 'Britons'],
      [775, 'Spanish'],
    ] as const) {
      const html = renderDuelSide(uid, civ, 3, []);
      const cell = extractDuelAttackCell(html);
      expect(cell, `unit ${uid} no attack text`).toContain('无普通攻击');
      expect(cell, `unit ${uid} icon stays atk`).toContain('stats/atk.webp');
      expect(cell, `unit ${uid} icon not patk`).not.toContain('stats/patk.webp');
    }
  });

  it('验收 2b：混编展开面板与单位详情科技模拟器同步取自 mainAttackType(u)', () => {
    for (const [civ, uid, techs] of [
      ['Chinese', 1907, ['52']],
      ['Malians', 1015, ['67', '68', '75']],
      ['Franks', 531, ['67', '68', '75']],
    ] as const) {
      const html = renderMixedEditor(civ, uid, '4', [...techs]);
      const atkRow = extractMixedAttackRow(html);
      expect(atkRow, `mixed ${uid}`).toContain('（近战）');
      expect(atkRow, `mixed ${uid} no pierce`).not.toContain('（穿刺）');
      expect(html, `mixed ${uid} actual class`).toContain('<dt>近战</dt>');
    }

    for (const [civ, uid] of [
      ['Britons', 492],
      ['Chinese', 559],
      ['Celts', 542],
    ] as const) {
      const html = renderMixedEditor(civ, uid);
      const atkRow = extractMixedAttackRow(html);
      expect(atkRow, `mixed ${uid}`).toContain('（穿刺）');
      expect(atkRow, `mixed ${uid} no melee`).not.toContain('（近战）');
    }

    const monkMix = renderMixedEditor('Britons', 125, '3', []);
    expect(extractMixedAttackRow(monkMix)).toContain('无普通攻击');

    for (const [uid, civ, expectedIcon] of [
      [531, 'Franks', 'stats/atk.webp'],
      [1015, 'Malians', 'stats/atk.webp'],
      [1907, 'Chinese', 'stats/atk.webp'],
      [4, 'Britons', 'stats/patk.webp'],
      [331, 'Britons', 'stats/patk.webp'],
      [492, 'Britons', 'stats/patk.webp'],
    ] as const) {
      const html = renderUnitSimulator(core.unitById[uid]!, civ);
      const row = extractSimAttackRow(html);
      expect(row, `Simulator unit ${uid}`).toContain(expectedIcon);
    }
  });

  it('验收 3：远程近战单位保持 Fighter.ranged === true，远程先手齐射、拉扯开关、命中率口径与伤害结算零回归', () => {
    const huskarl = resolve(ctx, core.unitById, { uid: 761, civ: 'Goths', age: 4, ageSet: true, techs: 'f', team: [] }, 761);
    expect(isUnavail(huskarl)).toBe(false);
    if (isUnavail(huskarl)) return;

    for (const [uid, civ, expectedDmg] of [
      [1907, 'Chinese', 6.25],
      [531, 'Franks', 10],
      [1015, 'Malians', 13],
    ] as const) {
      const sideA = resolve(ctx, core.unitById, { uid, civ, age: 4, ageSet: true, techs: 'f', team: [] }, uid);
      expect(isUnavail(sideA)).toBe(false);
      if (isUnavail(sideA)) continue;

      expect(sideA.F.ranged, `unit ${uid} ranged`).toBe(true);
      expect(damagePerHit(sideA.F, huskarl.F), `unit ${uid} vs huskarl dmg`).toBeCloseTo(expectedDmg, 6);

      // 1v1 接触战与拉扯准入均保持远程语义
      const kiteElig = resolveDuelKiteEligibility('1', sideA, huskarl);
      expect(kiteElig?.a, `unit ${uid} kite eligible`).toBe(true);
      expect(kiteElig?.b).toBe(false);

      const one = oneVOneFight(sideA.F, huskarl.F);
      expect(one.mode).toBe('contact');
      if (one.mode === 'contact') {
        expect(one.contact.firstStrike?.side, `unit ${uid} opening strike`).toBe('a');
        expect(one.contact.firstStrike?.volleys ?? 0, `unit ${uid} opening volleys`).toBeGreaterThan(0);
      }

      // 群战与混编同样保留远程先手齐射
      const grp = groupFight(sideA.F, 5, huskarl.F, 5);
      expect(grp.status).not.toBe('error');
      if (grp.status !== 'error') {
        expect(grp.contact.firstStrike?.side).toBe('a');
      }

      const mix = mixedFight([{ uid, count: 5, fighter: sideA.F }], [{ uid: 761, count: 5, fighter: huskarl.F }]);
      expect(mix.status).not.toBe('error');
      if (mix.status !== 'error') {
        expect(mix.contact.firstStrike?.side).toBe('a');
      }
    }

    // 远程近战且目录准确度 0%（火艨艟 1103）继续走 assume-hit 口径
    const fireGalley = resolve(ctx, core.unitById, { uid: 1103, civ: 'Britons', age: 2, ageSet: true, techs: [], team: [] }, 1103);
    expect(isUnavail(fireGalley)).toBe(false);
    if (!isUnavail(fireGalley)) {
      expect(fireGalley.F.ranged).toBe(true);
      expect(fighterUsesAssumeHit(fireGalley.F)).toBe(true);
    }
  });
});
