import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it } from 'vitest';
import { ARMY_RESEARCH } from '../../src/data/armyResearch';
import { CORE } from '../../src/data/core';
import { armyResearchChoices, emptyArmyCost, evaluateArmyCost } from '../../src/domain/armyCost';
import { BALLISTICS_CHARGE_ONLY_NOTE, ballisticsScope, formatMixedBallisticsScope } from '../../src/domain/ballistics';
import { DAT } from '../../src/domain/datEffects';
import { applicableTrainingTechs, selectTrainingIds } from '../../src/domain/duelTrainingCost';
import { emptyMixedSide, type MixedSideInput } from '../../src/domain/mixedDuelParams';
import { allNumeric, baseStats, makeSimContext, presetUpTo, simTechs } from '../../src/domain/simulator';
import type { Trees } from '../../src/domain/types';
import { MixedSideEditor } from '../../src/features/duel/components/MixedSideEditor';
import { resolveMixedSide } from '../../src/features/duel/logic/mixedDuel';
import { mixedTrainingTransfer } from '../../src/features/duel/logic/mixedTrainingTransfer';
import SimPanel, { type StatRow } from '../../src/shared/ui/sim/SimPanel';
import { SIM_ROWS } from '../../src/shared/utils/simFormat';
import { trees } from './helpers';

const ctx = makeSimContext(CORE.techs, trees);
const prodCtx = { core: CORE, trees };

const html = (node: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, node));

const mixedSide = (value: Partial<MixedSideInput>): MixedSideInput => ({
  ...emptyMixedSide(),
  civ: 'Saxons',
  age: '4',
  ...value,
});

function treesWithoutTech(baseTrees: Trees, civ: string, techId: number): Trees {
  const cloned = structuredClone(baseTrees);
  const blocks = cloned.t[civ];
  if (!blocks) throw new Error(`Missing tree for ${civ}`);
  for (const block of blocks) {
    for (const cell of block[3]) {
      if (cell[2] === 't' && cell[3] === techId) cell[4] = 0;
    }
  }
  return cloned;
}

describe('#1328 弹道学（科技 93）弹丸适用性与蓄力限定', () => {
  it('effects.json 与 army_research.json 及 248 目录单位 simTechs 三方全量一致', () => {
    const fxUnits = DAT.ballistics?.units ?? [];
    const fxChargeOnly = DAT.ballistics?.chargeOnly ?? [];
    const arNode93 = ARMY_RESEARCH.nodes['93']!;

    expect(fxUnits).toHaveLength(66);
    expect(fxUnits).toEqual([...new Set(fxUnits)].sort((a, b) => a - b));
    expect(fxUnits).toEqual(arNode93.combatUnits);
    expect(fxChargeOnly).toEqual([2705, 2706]);
    expect(fxChargeOnly).toEqual(arNode93.chargeOnlyCombatUnits);

    let normalCount = 0;
    let chargeOnlyCount = 0;
    let removedRngGt1Count = 0;
    let meleeExcludedCount = 0;

    for (const u of CORE.units) {
      const civ = u.civs[0]!;
      const avail = simTechs(ctx, u, civ);
      const ballistics = avail.find((item) => item.t.id === 93);
      const scope = ballisticsScope(u.id);
      const inAr = arNode93.combatUnits.includes(u.id);

      expect(Boolean(ballistics), `unit ${u.id} ${u.zh}`).toBe(inAr);
      expect(scope !== null, `unit ${u.id} ${u.zh}`).toBe(inAr);

      if (scope === 'charge-only') {
        chargeOnlyCount++;
        expect(ballistics).toMatchObject({ ef: null, chargeOnly: true, scopeNote: BALLISTICS_CHARGE_ONLY_NOTE });
      } else if (scope === 'normal') {
        normalCount++;
        expect(ballistics?.ef).toBeNull();
        expect(ballistics?.chargeOnly).toBeUndefined();
        expect(ballistics?.scopeNote).toBeUndefined();
      } else if (u.rng > 1) {
        removedRngGt1Count++;
      } else {
        meleeExcludedCount++;
      }
    }

    expect(CORE.units).toHaveLength(248);
    expect(normalCount).toBe(64);
    expect(chargeOnlyCount).toBe(2);
    expect(removedRngGt1Count).toBe(41);
    expect(meleeExcludedCount).toBe(141);
  });

  it('具名正反例、1948 楼船常规适用与自定义 source 参数正确', () => {
    // 常规适用（含 1948 楼船：与同页 UnitCharge.tsx 非常规源值口径一致，不标仅蓄力）
    for (const id of [4, 24, 39, 279, 539, 1911, 1948, 1952, 1968, 2569]) {
      expect(ballisticsScope(id), `unit ${id}`).toBe('normal');
    }
    // 仅常规冷却蓄力命中
    for (const id of [2705, 2706]) {
      expect(ballisticsScope(id), `unit ${id}`).toBe('charge-only');
    }
    // 移除的 rng > 1 误报与未命中蓄力近战
    for (const id of [5, 36, 46, 125, 280, 281, 282, 331, 529, 532, 775, 831, 832, 1103, 1302, 1704, 1741, 1901, 1903, 1904, 1942, 2708, 2711, 2712]) {
      expect(ballisticsScope(id), `unit ${id}`).toBeNull();
    }
    // 自定义数据源与缺省值
    expect(ballisticsScope(4, null)).toBeNull();
    expect(ballisticsScope(4, { units: [], chargeOnly: [] })).toBeNull();
    expect(ballisticsScope(100, { units: [100, 200], chargeOnly: [200] })).toBe('normal');
    expect(ballisticsScope(200, { units: [100, 200], chargeOnly: [200] })).toBe('charge-only');
    expect(ballisticsScope(300, { units: [100, 200], chargeOnly: [200] })).toBeNull();
  });

  it('文明科技树不可研究弹道学（93）时，即使弹丸命中也不列出弹道学', () => {
    const noBallisticsCtx = makeSimContext(CORE.techs, treesWithoutTech(trees, 'Saxons', 93));
    for (const uid of [2705, 2706, 4]) {
      const u = CORE.unitById[uid]!;
      expect(simTechs(noBallisticsCtx, u, 'Saxons').some((item) => item.t.id === 93)).toBe(false);
    }
  });

  it('单兵种模拟器、单兵种 PK 与混编预设均不会自动选入弹道学（93）', () => {
    for (const [uid, civ] of [
      [2705, 'Saxons'],
      [2706, 'Saxons'],
      [4, 'Britons'],
      [1948, 'Chinese'],
    ] as const) {
      const u = CORE.unitById[uid]!;
      const avail = simTechs(ctx, u, civ);
      expect(allNumeric(avail).has(93)).toBe(false);
      expect(presetUpTo(avail, 4, civ).has(93)).toBe(false);
      const costs = applicableTrainingTechs(ctx, u, civ, 4);
      expect(selectTrainingIds('f', avail, 4, costs, civ).has(93)).toBe(false);
      expect(selectTrainingIds('c', avail, 4, costs, civ).has(93)).toBe(false);
    }
    const mixView = resolveMixedSide(
      ctx,
      CORE,
      mixedSide({
        rows: [
          { uid: '2705', qty: '10' },
          { uid: '4', qty: '10' },
        ],
      }),
      'a',
    );
    const ballistics = mixView.techs.find((o) => o.t.id === 93);
    expect(ballistics).toBeDefined();
    expect(ballistics?.numeric).toBe(false);
    expect(ballistics?.cost).toBe(false);
  });

  it('混编共用科技逐行聚合 chargeOnlyRows、随行序重算，并正确格式化限定句', () => {
    // 单蓄力行
    const single = resolveMixedSide(ctx, CORE, mixedSide({ rows: [{ uid: '2705', qty: '10' }] }), 'a');
    const bSingle = single.techs.find((o) => o.t.id === 93)!;
    expect(bSingle.rows).toEqual([0]);
    expect(bSingle.chargeOnlyRows).toEqual([0]);
    expect(formatMixedBallisticsScope(bSingle.rows, bSingle.chargeOnlyRows ?? [])).toEqual({
      kind: 'rows',
      rowNumbers: '1',
      text: '第 1 行仅蓄力远程攻击适用。',
    });

    // 混合：第 1 行扈从 + 第 2 行步弓手
    const mixed1 = resolveMixedSide(
      ctx,
      CORE,
      mixedSide({
        rows: [
          { uid: '2705', qty: '10' },
          { uid: '4', qty: '10' },
        ],
      }),
      'a',
    );
    const bMixed1 = mixed1.techs.find((o) => o.t.id === 93)!;
    expect(bMixed1.rows).toEqual([0, 1]);
    expect(bMixed1.chargeOnlyRows).toEqual([0]);
    expect(formatMixedBallisticsScope(bMixed1.rows, bMixed1.chargeOnlyRows ?? [])?.text).toBe('第 1 行仅蓄力远程攻击适用。');

    // 上移/换序后：第 1 行步弓手 + 第 2 行扈从
    const mixed2 = resolveMixedSide(
      ctx,
      CORE,
      mixedSide({
        rows: [
          { uid: '4', qty: '10' },
          { uid: '2705', qty: '10' },
        ],
      }),
      'a',
    );
    const bMixed2 = mixed2.techs.find((o) => o.t.id === 93)!;
    expect(bMixed2.rows).toEqual([0, 1]);
    expect(bMixed2.chargeOnlyRows).toEqual([1]);
    expect(formatMixedBallisticsScope(bMixed2.rows, bMixed2.chargeOnlyRows ?? [])?.text).toBe('第 2 行仅蓄力远程攻击适用。');

    // 全部多适用行均为仅蓄力：第 1 行扈从 + 第 2 行精锐扈从
    const allCharge = resolveMixedSide(
      ctx,
      CORE,
      mixedSide({
        rows: [
          { uid: '2705', qty: '10' },
          { uid: '2706', qty: '10' },
        ],
      }),
      'a',
    );
    const bAllCharge = allCharge.techs.find((o) => o.t.id === 93)!;
    expect(bAllCharge.rows).toEqual([0, 1]);
    expect(bAllCharge.chargeOnlyRows).toEqual([0, 1]);
    expect(formatMixedBallisticsScope(bAllCharge.rows, bAllCharge.chargeOnlyRows ?? [])).toEqual({
      kind: 'all',
      text: '这些行仅蓄力远程攻击适用。',
    });

    // 3 行混合（2 蓄力 + 1 普通）
    const three = resolveMixedSide(
      ctx,
      CORE,
      mixedSide({
        rows: [
          { uid: '2705', qty: '5' },
          { uid: '4', qty: '5' },
          { uid: '2706', qty: '5' },
        ],
      }),
      'a',
    );
    const bThree = three.techs.find((o) => o.t.id === 93)!;
    expect(bThree.rows).toEqual([0, 1, 2]);
    expect(bThree.chargeOnlyRows).toEqual([0, 2]);
    expect(formatMixedBallisticsScope(bThree.rows, bThree.chargeOnlyRows ?? [])?.text).toBe('第 1、3 行仅蓄力远程攻击适用。');

    // 火枪手 + 喷火船：共用科技不含弹道学
    const excluded = resolveMixedSide(
      ctx,
      CORE,
      mixedSide({
        civ: 'Italians',
        rows: [
          { uid: '5', qty: '10' },
          { uid: '529', qty: '5' },
        ],
      }),
      'a',
    );
    expect(excluded.techs.some((o) => o.t.id === 93)).toBe(false);

    // 手动勾选弹道学后带入训练总价仍正常放行（记为 omitted 不阻塞）
    const withBallisticsInput = mixedSide({ rows: [{ uid: '2705', qty: '10' }], techs: ['93'] });
    const withBallisticsView = resolveMixedSide(ctx, CORE, withBallisticsInput, 'a');
    expect(withBallisticsView.errors).toEqual([]);
    const transfer = mixedTrainingTransfer(prodCtx, withBallisticsInput, 'a', withBallisticsView);
    expect('notice' in transfer).toBe(true);
    if ('notice' in transfer) {
      expect(transfer.notice.omitted).toContain('弹道学（仅影响战斗）');
    }
  });

  it('阵容新增费用（ArmyCost）自动覆盖 2705/2706/1948 且排除误报与未命中单位', () => {
    for (const [civ, uid] of [
      ['Saxons', 2705],
      ['Saxons', 2706],
      ['Chinese', 1948],
    ] as const) {
      const cfg = { ...emptyArmyCost(civ), rows: [{ unit: uid, qty: '1' }] };
      expect(armyResearchChoices(prodCtx, cfg), `${civ} ${uid}`).toContain(93);
      // 默认不计入本次目标；手动选中后计入 300 木 + 175 金
      expect(evaluateArmyCost(prodCtx, cfg).ledger.some((e) => e.id === 93)).toBe(false);
      const targeted = evaluateArmyCost(prodCtx, { ...cfg, targets: ['t:93'] });
      const entry = targeted.ledger.find((e) => e.id === 93);
      expect(entry?.beneficiaries).toEqual([0]);
      if (civ === 'Saxons') {
        expect(entry?.cost).toMatchObject({ Wood: 300, Gold: 175 });
        if (uid === 2705) expect(targeted.researchTotal).toMatchObject({ Wood: 300, Gold: 175 });
      }
    }
    for (const [civ, uid] of [
      ['Italians', 5],
      ['Byzantines', 529],
      ['Britons', 125],
      ['Danes', 2711],
      ['Chinese', 1901],
    ] as const) {
      const cfg = { ...emptyArmyCost(civ), rows: [{ unit: uid, qty: '1' }] };
      expect(armyResearchChoices(prodCtx, cfg), `${civ} ${uid}`).not.toContain(93);
    }
  });

  it('SimPanel 与 MixedSideEditor SSR 正确渲染限定句、保留常规项与 .num.nw', () => {
    const renderSim = (uid: number, civ: string) => {
      const u = CORE.unitById[uid]!;
      const avail = simTechs(ctx, u, civ);
      const base = baseStats(u);
      return html(
        createElement(SimPanel, {
          civs: u.civs,
          minAge: u.age,
          civ,
          age: 4,
          sel: new Set<number>(),
          team: new Set<number>(),
          cmp: '',
          avail,
          techById: CORE.techById,
          rows: SIM_ROWS.map(([k, n, ic]): StatRow => [k, n, ic === null ? (u.rng > 1 ? 'patk' : 'atk') : ic]),
          base,
          cur: base,
          cmpStats: null,
          civNotes: [],
          teamBonuses: [],
          go: () => {},
          setCmp: () => {},
        }),
      );
    };

    // 扈从部队：渲染 sim-scope-note 替换 t.desc，且研究时间 60s 包在 .num.nw 中
    const hearthHtml = renderSim(2705, 'Saxons');
    expect(hearthHtml).toContain(`data-t="sim-scope-note">${BALLISTICS_CHARGE_ONLY_NOTE}</div>`);
    expect(hearthHtml).not.toContain(CORE.techById[93]!.desc);
    expect(hearthHtml).toContain('<span class="num nw">');
    expect(hearthHtml).toContain('60s</span>');

    // 步弓手与楼船：保持常规 t.desc，不出现 sim-scope-note
    for (const [uid, civ] of [
      [4, 'Britons'],
      [1948, 'Chinese'],
    ] as const) {
      const markup = renderSim(uid, civ);
      expect(markup).toContain('弹道学');
      expect(markup).toContain(CORE.techById[93]!.desc);
      expect(markup).not.toContain('data-t="sim-scope-note"');
    }

    // 意大利火枪手：无弹道学且大学分组自动隐藏
    const hcHtml = renderSim(5, 'Italians');
    expect(hcHtml).not.toContain('弹道学');
    expect(hcHtml).not.toContain('<h4>大学</h4>');

    // 混编编辑器：混合行与全蓄力行
    const renderMixed = (rows: MixedSideInput['rows']) => {
      const input = mixedSide({ rows });
      const view = resolveMixedSide(ctx, CORE, input, 'a');
      const transfer = mixedTrainingTransfer(prodCtx, input, 'a', view);
      return html(
        createElement(MixedSideEditor, {
          side: 'a',
          input,
          view,
          core: CORE,
          ctx,
          transfer,
          focusField: () => {},
          onChange: () => {},
        }),
      );
    };
    const mixPartial = renderMixed([
      { uid: '2705', qty: '10' },
      { uid: '4', qty: '10' },
    ]);
    expect(mixPartial).toContain('适用<span class="num nw">第 1、2 行</span>');
    expect(mixPartial).toContain('data-t="mix-scope-note"><span class="num nw">第 1 行</span>仅蓄力远程攻击适用。</span>');

    const mixAllCharge = renderMixed([
      { uid: '2705', qty: '10' },
      { uid: '2706', qty: '10' },
    ]);
    expect(mixAllCharge).toContain('data-t="mix-scope-note">这些行仅蓄力远程攻击适用。</span>');
  });
});
