import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it } from 'vitest';
import { CORE } from '../../src/data/core';
import { effectParts, techAffects } from '../../src/domain/affects';
import { damageBreakdown, damageSources } from '../../src/domain/damageBreakdown';
import { damageRows, evaluateIgnoreArmor, hasIgnoreArmor, hasResistIgnoreArmor } from '../../src/domain/damageCore';
import { applyCombatAbilityEco, DAT, extractCombatAbilityEffects } from '../../src/domain/datEffects';
import { damageByClass, damagePerHit, duel, groupFight, oneVOneFight, type Fighter } from '../../src/domain/duel';
import { detectUnitUnmodeled } from '../../src/domain/duelUnmodeled';
import { TECH_EFFECTS, TECH_SRC } from '../../src/domain/effects';
import { mixedFight } from '../../src/domain/mixedFight';
import { applyEffects, baseStats, presetUpTo, simTechs, simulate } from '../../src/domain/simulator';
import { resolve, type Resolved } from '../../src/features/duel/logic/duelSide';
import { resolveMixedSide } from '../../src/features/duel/logic/mixedDuel';
import { mixedTrainingTransfer } from '../../src/features/duel/logic/mixedTrainingTransfer';
import { resolveUnitForm } from '../../src/features/units/unitFormDetail';
import SimPanel, { type StatRow } from '../../src/shared/ui/sim/SimPanel';
import { SIM_ROWS } from '../../src/shared/utils/simFormat';
import { ctx, trees, units } from './helpers';

const byId = CORE.unitById;

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
    armor: { 近战: 6, 穿刺: 4 },
    rof: 2,
    acc: 1,
    ranged: false,
    rng: 0,
    cost: { Food: 50 },
    ...partial,
  };
}

describe('#1366 无视护甲（combatAbility bit 1 / bit 2）领域结算与边界', () => {
  it('bit 1 × bit 2 四种组合矩阵、克制护甲照扣与最低伤害 1', () => {
    const cases: [number, number, number, boolean, boolean][] = [
      // [attackerCa, defenderCa, expectedDamage, expectedApplied, expectedResisted]
      [0, 0, 4, false, false],
      [1, 0, 10, true, false],
      [0, 2, 4, false, false],
      [1, 2, 4, false, true],
    ];
    for (const [atkCa, defCa, expectedDmg, applied, resisted] of cases) {
      const a = makeFighter({ attack: { 近战: 10, 骑兵: 5 }, combatAbility: atkCa });
      const d = makeFighter({ armor: { 近战: 6, 骑兵: 2 }, combatAbility: defCa });
      const ev = evaluateIgnoreArmor(a, d);
      expect(ev.applied, `ca ${atkCa} vs ${defCa}`).toBe(applied);
      expect(ev.resisted, `ca ${atkCa} vs ${defCa}`).toBe(resisted);
      // 骑兵克制类别护甲照扣（5 - 2 = 3），近战仅在 applied 时按 0 计（10 vs 4）
      expect(damagePerHit(a, d), `ca ${atkCa} vs ${defCa}`).toBe(expectedDmg + 3);
      const rows = damageByClass(a, d);
      const meleeRow = rows.find((r) => r.category === '近战')!;
      const cavRow = rows.find((r) => r.category === '骑兵')!;
      expect(meleeRow.armor).toBe(6);
      expect('ignored' in cavRow).toBe(false);
      if (applied) expect(meleeRow.ignored).toBe(true);
      else expect('ignored' in meleeRow).toBe(false);
    }

    // 抵抗时低攻击仍保底 1 伤
    const low = makeFighter({ attack: { 近战: 2 }, combatAbility: 1 });
    const tank = makeFighter({ armor: { 近战: 10 }, combatAbility: 2 });
    expect(damagePerHit(low, tank)).toBe(1);
  });

  it('合成边界：负护甲被无视按 0 计、零基础攻/缺护甲/非有限护甲/不可攻击不误激活且省略 ignored 键', () => {
    // 1. 合成 bit 1 && !bit 2 && ma = -3：按「近战、穿刺护甲按 0 计」，伤害等于 atk=10（非 13），row.armor 保留 -3
    const a = makeFighter({ attack: { 近战: 10 }, combatAbility: 1 });
    const negDef = makeFighter({ armor: { 近战: -3, 穿刺: 0 }, combatAbility: 0 });
    expect(evaluateIgnoreArmor(a, negDef)).toEqual({
      active: true,
      resisted: false,
      applied: true,
      categories: ['近战'],
      armors: [-3],
    });
    const negRows = damageByClass(a, negDef);
    expect(negRows).toEqual([{ category: '近战', attack: 10, armor: -3, damage: 10, ignored: true }]);
    expect(damagePerHit(a, negDef)).toBe(10);

    // 2. 攻方带 bit 1 但仅具额外克制攻或近战/穿刺为 0：active = false，不产出空类别
    const bonusOnly = makeFighter({ attack: { 近战: 0, 骑兵: 8 }, combatAbility: 1 });
    expect(evaluateIgnoreArmor(bonusOnly, negDef)).toEqual({
      active: false,
      resisted: false,
      applied: false,
      categories: [],
      armors: [],
    });
    const bonusRows = damageByClass(bonusOnly, { armor: { 近战: -3, 骑兵: 0 }, combatAbility: 0 });
    expect(bonusRows.every((r) => !('ignored' in r))).toBe(true);

    // 3. 守方缺键或非有限护甲：不进入 categories / armors
    expect(evaluateIgnoreArmor(a, { armor: { 穿刺: 5 }, combatAbility: 0 }).active).toBe(false);
    expect(evaluateIgnoreArmor(a, { armor: { 近战: Number.NaN }, combatAbility: 0 }).active).toBe(false);
    expect(evaluateIgnoreArmor(a, { armor: { 近战: Number.POSITIVE_INFINITY }, combatAbility: 0 }).active).toBe(false);

    // 4. canAttack: false 时 active = false 且 damageBreakdown 判别联合不含 ignoreArmor 键
    const passive = makeFighter({ canAttack: false, attack: { 近战: 10 }, combatAbility: 1 });
    expect(evaluateIgnoreArmor(passive, negDef).active).toBe(false);
    const bdPassive = damageBreakdown(passive, negDef);
    expect(bdPassive).toEqual({ canAttack: false, rows: [], subtotal: 0, minimum: 0, total: 0, expected: 0 });
    expect('ignoreArmor' in bdPassive).toBe(false);

    // 5. 未无视行绝不带 ignored 键
    const plain = damageRows({ 近战: 10 }, { 近战: 4 });
    expect(plain.rows).toEqual([{ category: '近战', attack: 10, armor: 4, damage: 6 }]);
    expect('ignored' in plain.rows[0]!).toBe(false);
  });

  it('属性 63 共享折叠（add/set/防溢出/白名单 fail-closed）与 997/1081 不误开 bit 1', () => {
    const wootzEco = DAT.techs['Wootz Steel']!.eco;
    const thunderEco = DAT.techs['Thunderclap Bombs']!.eco;
    const tigerEco = DAT.techs['Sitting Tiger']!.eco;

    // 乌兹钢：冠军剑士 0 → 1，攻城战象 2 → 3（保留 bit 2），烈堤司 1234/1236 1+1-1=1（防位溢出成 2）
    expect(applyCombatAbilityEco(0, wootzEco, 567)).toBe(1);
    expect(applyCombatAbilityEco(2, wootzEco, 1744)).toBe(3);
    expect(applyCombatAbilityEco(2, wootzEco, 1746)).toBe(3);
    expect(extractCombatAbilityEffects(wootzEco, 1234)).toEqual([
      { s: 'ca', op: 'add', v: 1 },
      { s: 'ca', op: 'add', v: -1 },
    ]);
    expect(applyCombatAbilityEco(1, wootzEco, 1234)).toBe(1);
    expect(applyCombatAbilityEco(1, wootzEco, 1236)).toBe(1);

    // 通过 applyEffects 顺序叠加验证相同结果
    const leitisStats = baseStats(byId[1236]!);
    applyEffects(leitisStats, extractCombatAbilityEffects(wootzEco, 1236));
    expect(leitisStats.ca).toBe(1);
    expect(hasIgnoreArmor(leitisStats.ca)).toBe(true);
    expect(hasResistIgnoreArmor(leitisStats.ca)).toBe(false);

    // 霹雳炸弹（997）与卧虎（1081）：楼船 1948 从 10 → set 26，绝不误开 bit 1，保留 bit 2，且模拟器维持 ef=null
    expect(applyCombatAbilityEco(10, thunderEco, 1948)).toBe(26);
    expect(hasIgnoreArmor(applyCombatAbilityEco(10, thunderEco, 1948))).toBe(false);
    expect(hasResistIgnoreArmor(applyCombatAbilityEco(10, thunderEco, 1948))).toBe(true);
    expect(applyCombatAbilityEco(10, tigerEco, 1948)).toBe(26);
    expect(hasIgnoreArmor(applyCombatAbilityEco(10, tigerEco, 1948))).toBe(false);

    expect(TECH_SRC['Wootz Steel']).toBe('dat');
    expect(TECH_EFFECTS['Wootz Steel']).toHaveLength(1);
    expect(TECH_SRC['Thunderclap Bombs']).toBeUndefined();
    expect(TECH_SRC['Sitting Tiger']).toBeUndefined();

    const jurchenLouChuan = simTechs(ctx, byId[1948]!, 'Jurchens');
    const wuLouChuan = simTechs(ctx, byId[1948]!, 'Wu');
    expect(jurchenLouChuan.find((x) => x.t.id === 997)?.ef).toBeNull();
    expect(wuLouChuan.find((x) => x.t.id === 1081)?.ef).toBeNull();
    expect(presetUpTo(jurchenLouChuan, 4, 'Jurchens').has(997)).toBe(false);
    expect(presetUpTo(wuLouChuan, 4, 'Wu').has(1081)).toBe(false);

    // 即使手动传入 997/1081，也不会把楼船的 bit 1 打开
    expect(hasIgnoreArmor(simulate(ctx, byId[1948]!, 'Jurchens', 4, new Set([997]), new Set()).ca)).toBe(false);
    expect(hasIgnoreArmor(simulate(ctx, byId[1948]!, 'Wu', 4, new Set([1081]), new Set()).ca)).toBe(false);

    // fail-closed 白名单：未知 op 与非有限 v 被忽略，绝不静默回退为 add
    const badEco = [
      { a: 63, op: 'xor', v: 1, t: [567] },
      { a: 63, op: 'add', v: Number.NaN, t: [567] },
      { a: 63, op: 'set', v: Number.POSITIVE_INFINITY, t: [567] },
    ];
    expect(extractCombatAbilityEffects(badEco, 567)).toEqual([]);
    expect(applyCombatAbilityEco(0, badEco, 567)).toBe(0);

    // affects.ts effectParts：仅 add +1 输出「攻击无视护甲」，其余走可读兜底文案
    expect(effectParts([{ s: 'ca', op: 'add', v: 1 }])).toEqual([{ icon: '', text: '攻击无视护甲' }]);
    expect(effectParts([{ s: 'ca', v: 1 }])).toEqual([{ icon: '', text: '攻击无视护甲' }]);
    const arrow = String.fromCharCode(0x2192);
    expect(effectParts([{ s: 'ca', op: 'set', v: 26 }])).toEqual([{ icon: '', text: `特殊能力标记 ${arrow} 26` }]);
    expect(effectParts([{ s: 'ca', op: 'mul', v: 2 }])).toEqual([{ icon: '', text: '特殊能力标记 ×2' }]);
    expect(effectParts([{ s: 'ca', op: 'add', v: -1 }])).toEqual([{ icon: '', text: '特殊能力标记 -1' }]);

    // /tech/832 作用对象不含净零的烈堤司
    const wootzAffects = techAffects(CORE.techById[832]!, units, CORE.buildings);
    const affectedIds = wootzAffects.flatMap((g) => g.rows.flatMap((r) => r.units.map((u) => u.id)));
    expect(affectedIds).toContain(567);
    expect(affectedIds).toContain(1746);
    expect(affectedIds).not.toContain(1234);
    expect(affectedIds).not.toContain(1236);
  });

  it('验收 1–5：三组对照、3000 预算群战与反例、以及 831/832/1904/1907 自动规则', () => {
    // 验收 1：精锐烈堤司（22 攻）vs 精锐条顿骑士（13 近甲）→ 每击 22（改前 9）
    const leitis = resolveSide(1236, 'Lithuanians', 4, 'f');
    const tk = resolveSide(554, 'Teutons', 4, 'f');
    expect(leitis.S.atk).toBe(22);
    expect(tk.S.ma).toBe(13);
    expect(leitis.ignoreArmorTech).toBeUndefined();
    expect(damagePerHit(leitis.F, tk.F)).toBe(22);
    const bd1 = damageBreakdown(leitis.F, tk.F);
    expect(bd1.canAttack).toBe(true);
    if (bd1.canAttack) {
      expect(bd1.total).toBe(22);
      expect(bd1.ignoreArmor).toEqual({ active: true, resisted: false, applied: true, categories: ['近战'], armors: [13] });
      expect(bd1.rows.find((r) => r.category === '近战')).toEqual({ category: '近战', attack: 22, armor: 13, damage: 22, ignored: true });
    }
    // 验收 5：3000 预算群战（25 精锐烈堤司 vs 26 精锐条顿骑士）→ 烈堤司反胜
    const g3000 = groupFight(leitis.F, 25, tk.F, 26);
    expect(g3000.status).toBe('win');
    if (g3000.status === 'win') {
      expect(g3000.winner).toBe('a');
      expect(g3000.aAlive).toBeGreaterThan(0);
      expect(g3000.bAlive).toBe(0);
    }

    // 验收 2：精锐复合弓箭手（8 攻）vs 精锐近卫军（10 远甲）与游侠（7 远甲）→ 每击 8（改前 1）
    const cb = resolveSide(1802, 'Armenians', 4, 'f');
    const huskarl = resolveSide(761, 'Goths', 4, 'f');
    const paladin = resolveSide(569, 'Spanish', 4, 'f');
    expect(cb.S.atk).toBe(8);
    expect(damagePerHit(cb.F, huskarl.F)).toBe(8);
    expect(damagePerHit(cb.F, paladin.F)).toBe(8);

    // 验收 3：达罗毗荼冠军剑士帝王满科技自动含乌兹钢（832）→ 每击 18；取消乌兹钢回到 5
    const champFull = resolveSide(567, 'Dravidians', 4, 'f');
    expect(champFull.sel.has(832)).toBe(true);
    expect(champFull.ignoreArmorTech).toBe('乌兹钢');
    expect(damagePerHit(champFull.F, tk.F)).toBe(18);
    const champNoWootz = resolveSide(
      567,
      'Dravidians',
      4,
      [...champFull.sel].filter((id) => id !== 832),
    );
    expect(champNoWootz.ignoreArmorTech).toBeUndefined();
    expect(damagePerHit(champNoWootz.F, tk.F)).toBe(5);

    // 验收 4 反例：精锐烈堤司打条顿中型冲车（铁甲 ma=2，bit 2 抵抗）→ 20；复合弓打箭船（bit 2 抵抗）→ 照扣远甲
    const teutonRam = resolveSide(422, 'Teutons', 4, 'f');
    expect(teutonRam.S.ma).toBe(2);
    expect(evaluateIgnoreArmor(leitis.F, teutonRam.F)).toEqual({
      active: true,
      resisted: true,
      applied: false,
      categories: ['近战'],
      armors: [2],
    });
    expect(damagePerHit(leitis.F, teutonRam.F)).toBe(20);
    const galleon = resolveSide(539, 'Britons', 4, 'f');
    expect(evaluateIgnoreArmor(cb.F, galleon.F).resisted).toBe(true);
    expect(damagePerHit(cb.F, galleon.F)).toBe(Math.max(1, cb.S.atk - galleon.S.pa));

    // 1904 火箭推车 & 832 精锐龟甲船（ca=11，同时带 bit 1 & bit 2）：对普通陆军生效，对攻城器/战船抵抗
    const rocket = resolveSide(1904, 'Jurchens', 4, 'f');
    const turtle = resolveSide(832, 'Koreans', 4, 'f');
    expect(evaluateIgnoreArmor(rocket.F, tk.F).applied).toBe(true);
    expect(evaluateIgnoreArmor(rocket.F, rocket.F).resisted).toBe(true);
    expect(evaluateIgnoreArmor(turtle.F, huskarl.F).applied).toBe(true);
    expect(evaluateIgnoreArmor(turtle.F, galleon.F).resisted).toBe(true);
    expect(evaluateIgnoreArmor(turtle.F, turtle.F).resisted).toBe(true);

    // 不带 bit 1 的常规单位（游侠、劲弩手）结果不受影响
    const arb = resolveSide(492, 'Britons', 4, 'f');
    expect(evaluateIgnoreArmor(paladin.F, tk.F).active).toBe(false);
    expect(damagePerHit(paladin.F, tk.F)).toBe(Math.max(1, paladin.S.atk - tk.S.ma));
    expect(evaluateIgnoreArmor(arb.F, huskarl.F).active).toBe(false);
    expect(damagePerHit(arb.F, huskarl.F)).toBe(Math.max(1, arb.S.atk - huskarl.S.pa));
  });

  it('双向测试：1746 达罗毗荼攻城战象（含乌兹钢 ca 从 2 到 3）vs 1236 立陶宛精锐烈堤司（ca=1）及 SimPanel 行', () => {
    const siegeEle = resolveSide(1746, 'Dravidians', 4, 'f');
    const leitis = resolveSide(1236, 'Lithuanians', 4, 'f');
    expect(siegeEle.u.combatAbility).toBe(2);
    expect(siegeEle.S.ca).toBe(3);
    expect(siegeEle.sel.has(832)).toBe(true);
    expect(siegeEle.ignoreArmorTech).toBe('乌兹钢');

    // 攻城战象打烈堤司：无视近战护甲；来源中单位基础不带无视护甲，科技来源记录「攻击无视护甲 0→1」
    const evEleToLeitis = evaluateIgnoreArmor(siegeEle.F, leitis.F);
    expect(evEleToLeitis).toEqual({ active: true, resisted: false, applied: true, categories: ['近战'], armors: [leitis.S.ma] });
    expect(damagePerHit(siegeEle.F, leitis.F)).toBe(siegeEle.S.atk);
    const trace = damageSources(ctx, siegeEle.u, 'Dravidians', 4, siegeEle.sel, new Set());
    expect(hasIgnoreArmor(siegeEle.u.combatAbility)).toBe(false);
    expect(trace.sources).toContainEqual({
      source: '科技：乌兹钢',
      techId: 832,
      changes: [{ stat: '攻击无视护甲', before: 0, after: 1, kind: 'boolean' }],
    });

    // 烈堤司打攻城战象：攻城战象叠加乌兹钢后仍保留 bit 2，抵抗无视护甲，照常扣近战护甲（-2 → 22 - (-2) = 24）
    const evLeitisToEle = evaluateIgnoreArmor(leitis.F, siegeEle.F);
    expect(evLeitisToEle).toEqual({ active: true, resisted: true, applied: false, categories: ['近战'], armors: [siegeEle.S.ma] });
    expect(damagePerHit(leitis.F, siegeEle.F)).toBe(leitis.S.atk - siegeEle.S.ma);

    // SimPanel 属性行：基础 否 → 当前 <b>是</b>
    const rows: StatRow[] = SIM_ROWS.map(([k, n, ic]) => [k, n, ic === null ? 'atk' : ic]);
    const html = renderToStaticMarkup(
      createElement(
        StaticRouter,
        { location: '/unit/1746' },
        createElement(SimPanel, {
          civs: siegeEle.u.civs,
          minAge: siegeEle.u.age,
          civ: 'Dravidians',
          age: 4,
          sel: siegeEle.sel,
          team: new Set<number>(),
          cmp: '',
          avail: siegeEle.avail,
          techById: CORE.techById,
          rows,
          base: baseStats(siegeEle.u),
          cur: siegeEle.S,
          cmpStats: null,
          civNotes: [],
          teamBonuses: [],
          go: () => {},
          setCmp: () => {},
        }),
      ),
    );
    expect(html).toContain('data-t="sim-ignore-armor"');
    expect(html).toContain('<td>无视护甲</td><td class="nw">否</td><td class="nw"><b>是</b></td>');
  });

  it('验收 6–7：1v1 / 群战 / 混编同源一致性、副形态零泄漏、不入未建模提示、混编训练费用放行', () => {
    const leitis = resolveSide(1236, 'Lithuanians', 4, 'f');
    const tk = resolveSide(554, 'Teutons', 4, 'f');

    // 1v1、群战（1v1）、混编（1v1）共用同一伤害判定，结果完全一致
    const one = oneVOneFight(leitis.F, tk.F);
    const grp = groupFight(leitis.F, 1, tk.F, 1);
    const mix = mixedFight([{ uid: 1236, count: 1, fighter: leitis.F }], [{ uid: 554, count: 1, fighter: tk.F }]);
    expect(one.ab.dmg).toBe(22);
    expect(duel(leitis.F, tk.F).ab.dmg).toBe(22);
    expect(grp.status).toBe('win');
    expect(mix.status).toBe('win');
    if (one.mode === 'contact' && grp.status === 'win' && mix.status === 'win') {
      expect(one.winner).toBe('a');
      expect(grp.winner).toBe('a');
      expect(mix.winner).toBe('a');
      expect(mix.a.total.hp).toBeCloseTo(grp.hpLeft, 6);
      expect(mix.duration).toBeCloseTo(grp.duration, 6);
    }

    // 副形态透传：1980 掩护形态保留自身 combatAbility=2，且不会误继承修改后的 owner 值
    const formRes = resolveUnitForm(CORE, 1980);
    expect(formRes.rawTarget?.combatAbility).toBe(2);

    // bit 1 不进入未建模机制提示
    expect(detectUnitUnmodeled({ unit: byId[1236]!, civ: 'Lithuanians', age: 4, selectedTechs: [] })).toEqual([]);
    expect(detectUnitUnmodeled({ unit: byId[1802]!, civ: 'Armenians', age: 4, selectedTechs: [] })).toEqual([]);
    const champ = resolveSide(567, 'Dravidians', 4, 'f');
    expect(detectUnitUnmodeled({ unit: champ.u, civ: 'Dravidians', age: 4, selectedTechs: [CORE.techById[832]!] })).toEqual([]);

    // 混编「计算训练费用」放行达罗毗荼帝王满科技（含乌兹钢 832）
    const mixInput = { civ: 'Dravidians', age: '4', techs: [...champ.sel].map(String), team: [], rows: [{ uid: '567', qty: '10' }] };
    const mixView = resolveMixedSide(ctx, CORE, mixInput, 'a');
    const transfer = mixedTrainingTransfer({ core: CORE, trees }, mixInput, 'a', mixView);
    expect('to' in transfer).toBe(true);
    if ('to' in transfer) {
      expect(transfer.notice.omitted).toContain('乌兹钢（不改变本方训练单价或解锁）');
    }
  });
});
