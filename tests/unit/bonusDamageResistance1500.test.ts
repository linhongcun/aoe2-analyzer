import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it } from 'vitest';
import { civs } from '../../src/data';
import { CORE } from '../../src/data/core';
import { effectParts } from '../../src/domain/affects';
import { ageComparison } from '../../src/domain/ageComparison';
import { breakEven } from '../../src/domain/breakEven';
import { civBonuses } from '../../src/domain/civBonus';
import { damageBreakdown, damageSources } from '../../src/domain/damageBreakdown';
import {
  clampBonusDamageResistance,
  damageRows,
  evaluateBonusDamageReduction,
  formatBdrMultiplier,
  formatBdrPercent,
  formatBdrSigned,
  hitCount,
} from '../../src/domain/damageCore';
import { applyBonusDamageResistanceEco, extractBonusDamageResistanceEffects } from '../../src/domain/datEffects';
import { countForBudget, damageByClass, damagePerHit, duel, expectedHit, groupFight, oneVOneFight, type Fighter } from '../../src/domain/duel';
import { detectUnitUnmodeled } from '../../src/domain/duelUnmodeled';
import { BONUS_SRC } from '../../src/domain/effects';
import { mixedFight } from '../../src/domain/mixedFight';
import { reverseCounters } from '../../src/domain/reverseCounters';
import { calculateSiege } from '../../src/domain/siege';
import { baseStats, simulate } from '../../src/domain/simulator';
import { buildUnitCivRank } from '../../src/domain/unitCivRank';
import { resolve, type Resolved } from '../../src/features/duel/logic/duelSide';
import { BonusBodyContent } from '../../src/shared/ui/BonusBody';
import SimPanel, { type StatRow } from '../../src/shared/ui/sim/SimPanel';
import { SIM_ROWS } from '../../src/shared/utils/simFormat';
import { ctx, units } from './helpers';

const byId = CORE.unitById;
const bldById = CORE.buildingById;

function resolveSide(uid: number, civ: string, age: number, techs: 'f' | 'c' | number[] = 'f'): Resolved {
  const res = resolve(ctx, byId, { uid, civ, age, ageSet: true, techs, team: [] }, uid);
  if ('unavail' in res) throw new Error(`Unit ${uid} unavailable for ${civ}`);
  return res;
}

function makeFighter(partial: Partial<Fighter>): Fighter {
  return {
    name: '测试单位',
    hp: 100,
    attack: { 近战: 10 },
    armor: { 近战: 0, 穿刺: 0 },
    rof: 2,
    acc: 1,
    ranged: false,
    rng: 0,
    cost: { Food: 50 },
    ...partial,
  };
}

describe('Issue 1500 单位 PK 额外伤害减免（a:24）结算、边界与全页同源回归', () => {
  it('验收 1：7 组核心对阵单发伤害、需击数与同预算群战胜负（含 1134 vs 207 胜负反转）', () => {
    // 1) 孟加拉 1134 精锐象兵 vs 日本 359 长戟兵（3000 预算）
    const benEle = resolveSide(1134, 'Bengalis', 4);
    const jpnHalb = resolveSide(359, 'Japanese', 4);
    expect(damagePerHit(jpnHalb.F, benEle.F)).toBeCloseTo(51, 6);
    expect(hitCount(benEle.F.hp, damagePerHit(jpnHalb.F, benEle.F))).toBe(7);
    const g1 = groupFight(benEle.F, countForBudget(benEle.F.cost, 3000)!, jpnHalb.F, countForBudget(jpnHalb.F.cost, 3000)!);
    expect(g1.status).toBe('win');
    if (g1.status === 'win') expect([g1.winner, g1.bAlive]).toEqual(['b', 4]);

    // 2) 孟加拉 1134 精锐象兵 vs 印度斯坦 207 帝王骆驼兵（3000 预算：反转为 A 胜 1/17，约 191 HP）
    const hinImpCamel = resolveSide(207, 'Hindustanis', 4);
    expect(damagePerHit(hinImpCamel.F, benEle.F)).toBeCloseTo(21.5, 6);
    expect(hitCount(benEle.F.hp, damagePerHit(hinImpCamel.F, benEle.F))).toBe(15);
    const na2 = countForBudget(benEle.F.cost, 3000)!;
    const nb2 = countForBudget(hinImpCamel.F.cost, 3000)!;
    expect([na2, nb2]).toEqual([17, 26]);
    const g2 = groupFight(benEle.F, na2, hinImpCamel.F, nb2);
    expect(g2.status).toBe('win');
    if (g2.status === 'win') {
      expect([g2.winner, g2.aAlive, g2.bAlive]).toEqual(['a', 1, 0]);
      expect(Math.round(g2.hpLeft)).toBe(191);
    }

    // 3) 孟加拉 875 精锐骑象射手 vs 立陶宛 6 精锐掷矛手（负护甲类 骑射手 -4）
    const benEa = resolveSide(875, 'Bengalis', 4);
    const lithSkirm = resolveSide(6, 'Lithuanians', 4);
    const rows3 = damageByClass(lithSkirm.F, benEa.F);
    expect(rows3.find((r) => r.category === '穿刺')).toMatchObject({ damage: 1 });
    expect(rows3.find((r) => r.category === '骑射手')).toMatchObject({ attack: 2, armor: -4, rawDamage: 6, bonusDamageReduction: 0.25, damage: 4.5 });
    expect(rows3.find((r) => r.category === '弓手')).toMatchObject({ attack: 4, armor: 0, rawDamage: 4, bonusDamageReduction: 0.25, damage: 3 });
    expect(damagePerHit(lithSkirm.F, benEa.F)).toBeCloseTo(8.5, 6);
    expect(hitCount(benEa.F.hp, damagePerHit(lithSkirm.F, benEa.F))).toBe(35);

    // 4) 西西里 283 重装骑士 vs 日本 359 长戟兵 & 法兰克 359 长戟兵（3000 预算）
    const sicCav = resolveSide(283, 'Sicilians', 4);
    expect(damagePerHit(jpnHalb.F, sicCav.F)).toBeCloseTo(23.2, 6);
    expect(hitCount(sicCav.F.hp, damagePerHit(jpnHalb.F, sicCav.F))).toBe(7);
    const g4 = groupFight(sicCav.F, countForBudget(sicCav.F.cost, 3000)!, jpnHalb.F, countForBudget(jpnHalb.F.cost, 3000)!);
    expect(g4.status).toBe('win');
    if (g4.status === 'win') expect([g4.winner, g4.bAlive]).toEqual(['b', 8]);

    const fraHalb = resolveSide(359, 'Franks', 4);
    const g4f = groupFight(sicCav.F, countForBudget(sicCav.F.cost, 3000)!, fraHalb.F, countForBudget(fraHalb.F.cost, 3000)!);
    expect(g4f.status).toBe('win');
    if (g4f.status === 'win') expect([g4f.winner, g4f.bAlive]).toEqual(['b', 2]);

    // 5) 西西里 283 重装骑士 vs 萨拉森 330 重装骆驼兵（3000 预算，15.8 无浮点尾数展示）
    const sarCamel = resolveSide(330, 'Saracens', 4);
    expect(damagePerHit(sarCamel.F, sicCav.F)).toBeCloseTo(15.8, 6);
    expect(Number(damagePerHit(sarCamel.F, sicCav.F).toFixed(3))).toBe(15.8);
    expect(hitCount(sicCav.F.hp, damagePerHit(sarCamel.F, sicCav.F))).toBe(9);
    const g5 = groupFight(sicCav.F, countForBudget(sicCav.F.cost, 3000)!, sarCamel.F, countForBudget(sarCamel.F.cost, 3000)!);
    expect(g5.status).toBe('win');
    if (g5.status === 'win') expect([g5.winner, g5.bAlive]).toEqual(['b', 6]);

    // 6) 西西里 38 骑士（城堡）vs 法兰克 358 长枪兵（城堡，2000 预算）
    const sicKnt = resolveSide(38, 'Sicilians', 3, 'c');
    const fraPike = resolveSide(358, 'Franks', 3, 'c');
    expect(damagePerHit(fraPike.F, sicKnt.F)).toBeCloseTo(15.2, 6);
    expect(hitCount(sicKnt.F.hp, damagePerHit(fraPike.F, sicKnt.F))).toBe(8);
    const g6 = groupFight(sicKnt.F, countForBudget(sicKnt.F.cost, 2000)!, fraPike.F, countForBudget(fraPike.F.cost, 2000)!);
    expect(g6.status).toBe('win');
    if (g6.status === 'win') expect([g6.winner, g6.bAlive]).toEqual(['b', 3]);

    // 7) 西西里 1661 精锐萨金特卫兵 vs 日本 5 火枪手（3000 预算，远程期望 16 × 0.75 = 12）
    const sicSerj = resolveSide(1661, 'Sicilians', 4);
    const jpnHc = resolveSide(5, 'Japanese', 4);
    expect(damagePerHit(jpnHc.F, sicSerj.F)).toBeCloseTo(16, 6);
    expect(expectedHit(jpnHc.F, sicSerj.F)).toBeCloseTo(12, 6);
    const g7 = groupFight(sicSerj.F, countForBudget(sicSerj.F.cost, 3000)!, jpnHc.F, countForBudget(jpnHc.F.cost, 3000)!);
    expect(g7.status).toBe('win');
    if (g7.status === 'win') expect([g7.winner, g7.bAlive]).toEqual(['b', 12]);
  });

  it('验收 2a：全目录 56 × 248 bdr > 0 精确集合、日本 474 负额外伤害成对抵消与零回归反例', () => {
    const hitsByCiv: Record<string, number[]> = {};
    for (const c of civs) {
      const ids: number[] = [];
      for (const u of units) {
        if (!u.civs.includes(c.en)) continue;
        const bdr = simulate(ctx, u, c.en, 4, new Set(), new Set()).bdr;
        if (bdr > 0) ids.push(u.id);
      }
      if (ids.length) hitsByCiv[c.en] = ids.sort((a, b) => a - b);
    }
    expect(Object.keys(hitsByCiv).sort()).toEqual(['Bengalis', 'Sicilians']);
    expect(hitsByCiv.Bengalis).toEqual([873, 875, 1132, 1134, 1744, 1746]);
    expect(hitsByCiv.Sicilians).toEqual([
      4, 6, 7, 24, 38, 74, 75, 77, 93, 283, 358, 359, 440, 448, 473, 492, 546, 567, 1658, 1659, 1660, 1661, 1786, 1787, 1788, 2700, 2701,
    ]);
    // 波斯全部单位（含 Citadels 7）均 bdr === 0
    for (const u of units) {
      if (!u.civs.includes('Persians')) continue;
      expect(simulate(ctx, u, 'Persians', 4, new Set([7]), new Set()).bdr).toBe(0);
    }

    // 真实负额外伤害成对抵消反例：日本 474 重装骑射手（弓手 +2 / 掷矛手 -2）攻西西里 6 精锐掷矛手（bdr 0.4）
    const jpnHca = resolveSide(474, 'Japanese', 4);
    const sicSkirm = resolveSide(6, 'Sicilians', 4);
    const bdCancel = damageBreakdown(jpnHca.F, sicSkirm.F);
    expect(bdCancel.canAttack).toBe(true);
    if (bdCancel.canAttack) {
      expect(bdCancel.rows.find((r) => r.category === '穿刺')?.damage).toBe(5);
      expect(bdCancel.rows.find((r) => r.category === '弓手')).toMatchObject({ rawDamage: 2, bonusDamageReduction: 0.4, damage: 1.2 });
      expect(bdCancel.rows.find((r) => r.category === '掷矛手')).toMatchObject({ rawDamage: -2, bonusDamageReduction: 0.4, damage: -1.2 });
      expect(bdCancel.total).toBeCloseTo(5, 6);
      expect(bdCancel.bonusDamageReduction.active).toBe(true);
      expect(bdCancel.bonusDamageReduction.hasNegativeBonus).toBe(true);
      expect(bdCancel.bonusDamageReduction.netPositive).toBe(false);
    }

    // 无额外伤害反例与零回归
    const sicCav = resolveSide(283, 'Sicilians', 4);
    const fraPal = resolveSide(569, 'Franks', 4);
    expect(damagePerHit(fraPal.F, sicCav.F)).toBe(12);
    expect(evaluateBonusDamageReduction(damageByClass(fraPal.F, sicCav.F)).active).toBe(false);
    const gPal = groupFight(sicCav.F, countForBudget(sicCav.F.cost, 3000)!, fraPal.F, countForBudget(fraPal.F.cost, 3000)!);
    expect(gPal.status === 'win' && gPal.winner === 'b' && gPal.bAlive === 4).toBe(true);

    const sicMc = resolveSide(2701, 'Sicilians', 4);
    const britArb = resolveSide(492, 'Britons', 4);
    expect(damagePerHit(britArb.F, sicMc.F)).toBe(8);
    const gArb = groupFight(sicMc.F, countForBudget(sicMc.F.cost, 3000)!, britArb.F, countForBudget(britArb.F.cost, 3000)!);
    expect(gArb.status === 'win' && gArb.winner === 'b' && gArb.bAlive === 33).toBe(true);

    // 孟加拉战车 1761、siege.ts（波斯城堡）与 reverseCounters 零变动
    expect(resolveSide(1761, 'Bengalis', 4).S.bdr).toBe(0);
    const siegeRes = calculateSiege(byId[422]!, bldById[82]!, 1);
    expect(siegeRes.verified).toBe(true);
    const rc = reverseCounters(byId[283]!, units, { unitById: byId }, Object.keys(civs), ctx.trees, { civ: '', age: null });
    expect(rc.groups.flatMap((g) => g.rows).some((item) => item.unit.id === 359)).toBe(true);
  });

  it('验收 2b：保底 1 点、无视护甲 + bdr 复合、合成夹紧/-0/省略键与多模式同源一致', () => {
    // 1) 保底 1 点伤害（0 基础 + 1×0.6 = 0.6 → total = 1, minimum = 0.4）
    const atkLow = makeFighter({ attack: { 近战: 0, 骑兵: 1 } });
    const defBdr = makeFighter({ armor: { 近战: 0, 骑兵: 0 }, bonusDamageResistance: 0.4 });
    const bdMin = damageBreakdown(atkLow, defBdr);
    expect(bdMin.canAttack).toBe(true);
    if (bdMin.canAttack) {
      expect(bdMin.subtotal).toBeCloseTo(0.6, 6);
      expect(bdMin.minimum).toBeCloseTo(0.4, 6);
      expect(bdMin.total).toBe(1);
    }

    // 2) 达罗毗荼乌兹钢长戟兵 359（无视近甲）vs 西西里重装骑士 283（-40% 额外伤害）→ 10 + 32×0.6 = 29.2
    const dravHalb = resolveSide(359, 'Dravidians', 4);
    const sicCav = resolveSide(283, 'Sicilians', 4);
    const bdCombo = damageBreakdown(dravHalb.F, sicCav.F);
    expect(bdCombo.canAttack).toBe(true);
    if (bdCombo.canAttack) {
      expect(bdCombo.ignoreArmor.applied).toBe(true);
      expect(bdCombo.bonusDamageReduction.netPositive).toBe(true);
      expect(bdCombo.rows.find((r) => r.category === '近战')).toEqual({ category: '近战', attack: 10, armor: 6, damage: 10, ignored: true });
      expect(bdCombo.rows.find((r) => r.category === '骑兵')).toEqual({
        category: '骑兵',
        attack: 32,
        armor: 0,
        damage: 19.2,
        rawDamage: 32,
        bonusDamageReduction: 0.4,
      });
      expect(bdCombo.total).toBeCloseTo(29.2, 6);
    }

    // 3) 夹紧、-0、未折减行省略键与非法命令 fail-closed
    expect(clampBonusDamageResistance(undefined)).toBe(0);
    expect(clampBonusDamageResistance(Number.NaN)).toBe(0);
    expect(clampBonusDamageResistance(-0.2)).toBe(0);
    expect(clampBonusDamageResistance(1.5)).toBe(1);
    expect(formatBdrPercent(0.25)).toBe('25%');
    expect(formatBdrSigned(0)).toBe('0%');
    expect(formatBdrSigned(0.4)).toBe('-40%');
    expect(formatBdrMultiplier(0.4)).toBe('60%');

    const clamped = damageRows({ 近战: 5, 骑兵: 10, 掷矛手: -2, 弓手: 0 }, { 近战: 0, 骑兵: 0, 掷矛手: 0, 弓手: 0 }, { bonusDamageResistance: 1.5 });
    const meleeRow = clamped.rows.find((r) => r.category === '近战')!;
    const zeroRow = clamped.rows.find((r) => r.category === '弓手')!;
    const negRow = clamped.rows.find((r) => r.category === '掷矛手')!;
    expect('rawDamage' in meleeRow || 'bonusDamageReduction' in meleeRow).toBe(false);
    expect('rawDamage' in zeroRow || 'bonusDamageReduction' in zeroRow).toBe(false);
    expect(Object.is(negRow.damage, -0)).toBe(false);
    expect(negRow.damage).toBe(0);
    expect(clamped.rows.find((r) => r.category === '骑兵')).toMatchObject({ rawDamage: 10, bonusDamageReduction: 1, damage: 0 });

    const badEco = [
      { a: 24, op: 'xor', v: 0.4, t: [283] },
      { a: 24, op: 'set', v: Number.NaN, t: [283] },
      { a: 24, op: 'add', v: Number.POSITIVE_INFINITY, t: [283] },
    ];
    expect(extractBonusDamageResistanceEffects(badEco, 283)).toEqual([]);
    expect(applyBonusDamageResistanceEco(0, badEco, 283)).toBe(0);

    // effectParts bdr 格式化（set / add / mul / 0）
    expect(effectParts([{ s: 'bdr', op: 'set', v: 0.25 }])).toEqual([{ icon: '', text: '受到的额外伤害 -25%' }]);
    expect(effectParts([{ s: 'bdr', op: 'set', v: 0.4 }])).toEqual([{ icon: '', text: '受到的额外伤害 -40%' }]);
    expect(effectParts([{ s: 'bdr', op: 'mul', v: 1.5 }])).toEqual([{ icon: '', text: '额外伤害减免 ×1.5' }]);
    expect(effectParts([{ s: 'bdr', op: 'add', v: 0.1 }])).toEqual([{ icon: '', text: '额外伤害减免 +10%' }]);
    expect(effectParts([{ s: 'bdr', op: 'add', v: 0 }])).toEqual([{ icon: '', text: '额外伤害减免 0%' }]);

    // 4) 1v1 / groupFight / mixedFight / breakEven / ageComparison 同源一致
    const benEle = resolveSide(1134, 'Bengalis', 4);
    const jpnHalb = resolveSide(359, 'Japanese', 4);
    const one = oneVOneFight(benEle.F, jpnHalb.F);
    const grp = groupFight(benEle.F, 1, jpnHalb.F, 1);
    const mix = mixedFight([{ uid: 1134, count: 1, fighter: benEle.F }], [{ uid: 359, count: 1, fighter: jpnHalb.F }]);
    expect(one.ba.dmg).toBeCloseTo(51, 6);
    expect(duel(benEle.F, jpnHalb.F).ba.dmg).toBeCloseTo(51, 6);
    expect(grp.status).toBe('win');
    expect(mix.status).toBe('win');
    if (one.mode === 'contact' && grp.status === 'win' && mix.status === 'win') {
      expect(mix.winner).toBe(grp.winner);
      expect(mix.duration).toBeCloseTo(grp.duration, 6);
      expect(one.duration).toBeCloseTo(grp.duration, 6);
    }
    const be = breakEven(sicCav.F, jpnHalb.F, 10);
    expect(be.n).not.toBeNull();
    expect(be.capReached).toBe(false);
    const ageRows = ageComparison(ctx, byId, { uid: 38, civ: 'Sicilians', team: [] }, { uid: 358, civ: 'Franks', team: [] });
    const castleRow = ageRows.find((r) => r.age === 3);
    expect(castleRow?.result?.ba.dmg).toBeCloseTo(15.2, 6);
  });

  it('验收 3：未建模告警移除、damageSources、SimPanel、UnitCivRank 与 BonusBody SSR 闭环', () => {
    const sicCav = resolveSide(283, 'Sicilians', 4);
    const benEle = resolveSide(1134, 'Bengalis', 4);
    const benEa = resolveSide(875, 'Bengalis', 4);

    // 1) 未建模告警移除且保留 1134 固有溅射伤害
    expect(detectUnitUnmodeled({ unit: sicCav.u, civ: 'Sicilians', age: 4, selectedTechs: [] })).toEqual([]);
    expect(detectUnitUnmodeled({ unit: benEa.u, civ: 'Bengalis', age: 4, selectedTechs: [] })).toEqual([]);
    expect(detectUnitUnmodeled({ unit: benEle.u, civ: 'Bengalis', age: 4, selectedTechs: [] }).map((m) => m.pill)).toEqual(['固有溅射伤害']);

    // 2) damageSources 记录 bdr 变化
    const srcSic = damageSources(ctx, sicCav.u, 'Sicilians', 4, sicCav.sel, new Set());
    expect(srcSic.sources.some((s) => s.changes.some((c) => c.stat === '额外伤害减免' && c.kind === 'bdr' && c.before === 0 && c.after === 0.4))).toBe(true);

    // 3) SimPanel：西西里显示 sim-bdr，西班牙游侠不显示
    const rows: StatRow[] = SIM_ROWS.map(([k, n, ic]) => [k, n, ic === null ? 'atk' : ic]);
    const fraCav = resolveSide(283, 'Franks', 4);
    const simHtml = renderToStaticMarkup(
      createElement(
        StaticRouter,
        { location: '/unit/283/Sicilians/4' },
        createElement(SimPanel, {
          civs: sicCav.u.civs,
          minAge: sicCav.u.age,
          civ: 'Sicilians',
          age: 4,
          sel: sicCav.sel,
          team: new Set<number>(),
          cmp: 'Franks',
          avail: sicCav.avail,
          techById: CORE.techById,
          rows,
          base: baseStats(sicCav.u),
          cur: sicCav.S,
          cmpStats: fraCav.S,
          civNotes: [],
          teamBonuses: [],
          go: () => {},
          setCmp: () => {},
        }),
      ),
    );
    expect(simHtml).toContain('data-t="sim-bdr"');
    expect(simHtml).toContain('<span class="up num nw">-40%</span>');
    expect(simHtml).toContain('<b>-40%</b>');
    expect(simHtml).toContain('<td class="num nw">0%</td>');

    const spaPal = resolveSide(569, 'Spanish', 4);
    const plainSimHtml = renderToStaticMarkup(
      createElement(
        StaticRouter,
        { location: '/unit/569/Spanish/4' },
        createElement(SimPanel, {
          civs: spaPal.u.civs,
          minAge: spaPal.u.age,
          civ: 'Spanish',
          age: 4,
          sel: spaPal.sel,
          team: new Set<number>(),
          cmp: '',
          avail: spaPal.avail,
          techById: CORE.techById,
          rows,
          base: baseStats(spaPal.u),
          cur: spaPal.S,
          cmpStats: null,
          civNotes: [],
          teamBonuses: [],
          go: () => {},
          setCmp: () => {},
        }),
      ),
    );
    expect(plainSimHtml).not.toContain('data-t="sim-bdr"');

    // 4) UnitCivRank 结构化字段与 BonusBody SSR
    const rank283 = buildUnitCivRank(ctx, byId[283]!, 4);
    expect(rank283.hasBonusDamageReduction).toBe(true);
    expect(rank283.rows.find((r) => r.civ === 'Sicilians')?.bonusDamageReduction).toBe(0.4);
    expect(rank283.rows.find((r) => r.civ === 'Franks')?.bonusDamageReduction).toBeUndefined();
    const rank875 = buildUnitCivRank(ctx, byId[875]!, 4);
    expect(rank875.hasBonusDamageReduction).toBe(true);
    expect(rank875.rows.find((r) => r.civ === 'Bengalis')?.bonusDamageReduction).toBe(0.25);

    expect(BONUS_SRC.Bengalis!['2']).toBe('dat');
    expect(BONUS_SRC.Sicilians!['2']).toBe('dat');
    const sicBonus2 = civBonuses(civs.find((c) => c.en === 'Sicilians')!).find((b) => b.idx === 2)!;
    const bonusHtml = renderToStaticMarkup(
      createElement(StaticRouter, { location: '/civ/Sicilians/bonus/2' }, createElement(BonusBodyContent, { b: sicBonus2, core: CORE })),
    );
    expect(bonusHtml).toContain('已计入');
    expect(bonusHtml).toContain('数值来自游戏数据');
    expect(bonusHtml).toContain('受到的额外伤害 <span class="num nw">-40%</span>');
  });
});
