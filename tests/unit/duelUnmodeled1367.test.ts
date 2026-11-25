import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it } from 'vitest';
import { CORE } from '../../src/data/core';
import { hasIgnoreArmor, hasResistIgnoreArmor } from '../../src/domain/damageCore';
import { DAT, type DatEco } from '../../src/domain/datEffects';
import { fighterFrom, groupFight, oneVOneFight } from '../../src/domain/duel';
import {
  applicableUnmodeledTechIds,
  detectUnitUnmodeled,
  effectiveCombatAbility,
  hasPositiveEcoAttr,
  normalizeCombatAbility,
  type UnmodeledKind,
} from '../../src/domain/duelUnmodeled';
import { presetUpTo, simTechs, simulate } from '../../src/domain/simulator';
import type { Tech, Unit } from '../../src/domain/types';
import { DuelUnmodeledNotes } from '../../src/features/duel/components/DuelUnmodeledNotes';
import { resolveUnitForm } from '../../src/features/units/unitFormDetail';
import { ctx, techById, units } from './helpers';

const byId = CORE.unitById;
const html = (node: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, node));

function expectedKindsForBase(u: Unit, civ: string, age: number): UnmodeledKind[] {
  const out: UnmodeledKind[] = [];
  const bonuses = (DAT.civs[civ]?.bonus ?? []).filter((b) => b.age <= age && b.req.length === 0);
  const civEco = bonuses.flatMap((b) => b.eco);

  if ((u.chargeType ?? 0) > 0) out.push('charge');
  if ((u.totalProjectiles ?? 0) > 1 || bonuses.some((b) => hasPositiveEcoAttr(b.eco, u.id, 102, 1) || hasPositiveEcoAttr(b.eco, u.id, 107, 1))) {
    out.push('multi-projectile');
  }
  if (u.blast > 0 || bonuses.some((b) => hasPositiveEcoAttr(b.eco, u.id, 22, 1e-9))) {
    out.push('splash');
  }
  if (u.form?.kind === 'dismount') out.push('dismount');
  if (u.form?.kind === 'barrage' || u.form?.kind === 'weapon') out.push('form-switch');

  const ca = effectiveCombatAbility(u.combatAbility, u.id, civ, age, []);
  if ((ca & 4) !== 0) out.push('armor-strip');
  if ((ca & (32 | 64)) !== 0) out.push('aura');
  if ((ca & 128) !== 0) out.push('on-hit');
  if (u.projectilePassThrough === true) out.push('pass-through');
  if (u.damagedTargetBonus === true) out.push('damaged-bonus');
  if (u.lowHpTransform === true) out.push('low-hp-transform');
  if (hasPositiveEcoAttr(civEco, u.id, 109, 1e-9)) out.push('regen');
  if (u.deathHealAura === true) out.push('death-heal');
  return out;
}

describe('#1367 单位 PK 补齐 combatAbility 与投射物穿透驱动的未建模机制提示', () => {
  it('全库 248 单位数据驱动不变量：基础检测输出与独立字段推导 100% 一致', () => {
    expect(units).toHaveLength(248);
    const regenCivs = ['Bengalis', 'Georgians', 'Wu', 'Poles'] as const;

    for (const u of units) {
      const checks: [string, number][] = [[u.civs[0]!, Math.max(u.age, 4)]];
      for (const civ of regenCivs) {
        if (u.civs.includes(civ)) {
          checks.push([civ, 1], [civ, 4]);
        }
      }
      for (const [civ, age] of checks) {
        const actual = detectUnitUnmodeled({ unit: u, civ, age, selectedTechs: [] }).map((m) => m.kind);
        const expected = expectedKindsForBase(u, civ, age);
        expect(actual, `unit ${u.id} (${u.zh}) ${civ} age=${age}`).toEqual(expected);
      }
    }
  });

  it('验收 1：11 类新机制模板胶囊短语、正文文案与时代门槛逐字对齐设计稿', () => {
    // 1) 撕裂护甲（bit 4：1701/1703 奥布奇）
    for (const uid of [1701, 1703]) {
      expect(detectUnitUnmodeled({ unit: byId[uid]!, civ: 'Poles', age: 4, selectedTechs: [] })).toEqual([
        {
          kind: 'armor-strip',
          pill: '撕裂护甲',
          detail: '当前未计入每次攻击对目标护甲的削减；目标护甲越打越薄，实际输出通常高于此处估算。',
        },
      ]);
    }

    // 2) 光环 / 编队增益（bit 32|64 合并出 1 枚：百夫长/莫纳斯帕/曹操/刘备/孙坚）
    for (const [uid, civ, age] of [
      [1790, 'Romans', 4],
      [1792, 'Romans', 4],
      [1803, 'Georgians', 1],
      [1805, 'Georgians', 1],
      [1954, 'Wei', 4],
      [1966, 'Shu', 4],
      [1978, 'Wu', 4],
    ] as const) {
      const res = detectUnitUnmodeled({ unit: byId[uid]!, civ, age, selectedTechs: [] });
      expect(res, `aura unit ${uid}`).toEqual([
        {
          kind: 'aura',
          pill: '光环 / 编队增益',
          detail: '当前未计入附近友军之间的光环或编队增益；成群作战时实际表现通常强于此处估算。',
        },
      ]);
    }
    // 1805 格鲁吉亚精锐莫纳斯帕在封建及以上同时触发光环 + 生命回复（ca=96 仍只出 1 枚光环胶囊）
    const monaspaImp = detectUnitUnmodeled({ unit: byId[1805]!, civ: 'Georgians', age: 4, selectedTechs: [] });
    expect(monaspaImp.map((m) => m.pill)).toEqual(['光环 / 编队增益', '生命回复']);

    // 3) 命中特效三分型（bit 128 + action 157）
    for (const uid of [1920, 1922]) {
      expect(detectUnitUnmodeled({ unit: byId[uid]!, civ: 'Khitans', age: 4, selectedTechs: [] })).toEqual([
        {
          kind: 'on-hit',
          pill: '命中后持续伤害',
          detail: '当前未计入命中后的持续伤害；实际输出通常高于此处估算。',
        },
      ]);
    }
    for (const uid of [1959, 1961]) {
      expect(detectUnitUnmodeled({ unit: byId[uid]!, civ: 'Shu', age: 4, selectedTechs: [] })).toEqual([
        {
          kind: 'on-hit',
          pill: '命中减速',
          detail: '当前未计入命中后使目标减速；目标更难脱离或追击，实战表现通常高于此处估算。',
        },
      ]);
    }
    for (const uid of [2586, 2587]) {
      expect(detectUnitUnmodeled({ unit: byId[uid]!, civ: 'Muisca', age: 4, selectedTechs: [] })).toEqual([
        {
          kind: 'on-hit',
          pill: '越战越快',
          detail: '当前按固定攻击间隔结算，未计入持续作战后攻击速度的提升；长时间缠斗时实际输出通常高于此处估算。',
        },
      ]);
    }

    // 4) 直线穿透（主投射物 hit_mode === 1：精确 10 单位）
    for (const [uid, civ] of [
      [279, 'Britons'],
      [542, 'Celts'],
      [1004, 'Romans'],
      [1006, 'Romans'],
      [1120, 'Khmer'],
      [1122, 'Khmer'],
      [1741, 'Gurjaras'],
      [1743, 'Gurjaras'],
    ] as const) {
      expect(detectUnitUnmodeled({ unit: byId[uid]!, civ, age: 4, selectedTechs: [] })).toEqual([
        {
          kind: 'pass-through',
          pill: '直线穿透',
          detail: '当前只按主目标逐击结算，未计入投射物穿过主目标、命中同一直线上其他单位的伤害；对密集阵型的实际输出通常高于此处估算。',
        },
      ]);
    }
    expect(detectUnitUnmodeled({ unit: byId[1948]!, civ: 'Chinese', age: 4, selectedTechs: [] }).map((m) => m.pill)).toEqual(['充能多箭齐射', '直线穿透']);
    expect(detectUnitUnmodeled({ unit: byId[1962]!, civ: 'Shu', age: 4, selectedTechs: [] }).map((m) => m.pill)).toEqual([
      '多弹丸 / 副弹丸',
      '可切换形态',
      '直线穿透',
    ]);

    // 5) 对受伤目标递增伤害（2566/2568 科那）
    for (const uid of [2566, 2568]) {
      expect(detectUnitUnmodeled({ unit: byId[uid]!, civ: 'Mapuche', age: 4, selectedTechs: [] })).toEqual([
        {
          kind: 'damaged-bonus',
          pill: '对伤员递增伤害',
          detail: '当前未计入对已受伤目标的递增伤害；越打越痛，实际输出通常高于此处估算。',
        },
      ]);
    }

    // 6) 低血量破盾变形态（1974 吴剑士，封建起叠吴步兵文明回血）
    const jian = detectUnitUnmodeled({ unit: byId[1974]!, civ: 'Wu', age: 3, selectedTechs: [] });
    expect(jian).toEqual([
      {
        kind: 'low-hp-transform',
        pill: '受伤后变形态',
        detail: '当前未计入受到一定伤害后的形态变化（移动和攻击变强、护甲变弱）；实战表现可能偏离此处估算。',
      },
      {
        kind: 'regen',
        pill: '生命回复',
        detail: '当前未计入战斗中的生命回复（文明加成）；持久战中实际生存能力通常高于此处估算。',
      },
    ]);

    // 7) 4 个文明 a:109 生命回复时代门槛
    expect(detectUnitUnmodeled({ unit: byId[38]!, civ: 'Georgians', age: 1, selectedTechs: [] })).toEqual([]);
    expect(detectUnitUnmodeled({ unit: byId[38]!, civ: 'Georgians', age: 2, selectedTechs: [] }).map((m) => m.pill)).toEqual(['生命回复']);
    expect(detectUnitUnmodeled({ unit: byId[567]!, civ: 'Wu', age: 1, selectedTechs: [] })).toEqual([]);
    expect(detectUnitUnmodeled({ unit: byId[567]!, civ: 'Wu', age: 2, selectedTechs: [] }).map((m) => m.pill)).toEqual(['生命回复']);
    expect(detectUnitUnmodeled({ unit: byId[539]!, civ: 'Bengalis', age: 1, selectedTechs: [] }).map((m) => m.pill)).toEqual(['生命回复']);
    expect(detectUnitUnmodeled({ unit: byId[83]!, civ: 'Poles', age: 1, selectedTechs: [] })).toEqual([]);
    expect(detectUnitUnmodeled({ unit: byId[83]!, civ: 'Poles', age: 2, selectedTechs: [] }).map((m) => m.pill)).toEqual(['生命回复']);
  });

  it('验收 2：反例零误报（常规单位、步弓手副弹丸、狂战士、已建模无视护甲与攻城反伤位）', () => {
    for (const [uid, civ] of [
      [569, 'Franks'],
      [4, 'Britons'],
      [24, 'Britons'],
      [492, 'Britons'],
      [359, 'Japanese'],
      [567, 'Japanese'],
      [692, 'Vikings'],
      [694, 'Vikings'],
      [1234, 'Lithuanians'],
      [1236, 'Lithuanians'],
      [1800, 'Armenians'],
      [1802, 'Armenians'],
    ] as const) {
      expect(detectUnitUnmodeled({ unit: byId[uid]!, civ, age: 4, selectedTechs: [] }), `zero-FP ${uid} ${civ}`).toEqual([]);
    }

    // 831/832（龟甲船）与 1904/1907（火箭推车）保留已有充能/多弹丸/溅射，但绝不因 bit 1/2/8/16 新增本议题 7 类提示
    for (const [uid, civ] of [
      [831, 'Koreans'],
      [832, 'Koreans'],
      [1904, 'Jurchens'],
      [1907, 'Jurchens'],
    ] as const) {
      const kinds = detectUnitUnmodeled({ unit: byId[uid]!, civ, age: 4, selectedTechs: [] }).map((m) => m.kind);
      for (const k of ['armor-strip', 'aura', 'on-hit', 'pass-through', 'damaged-bonus', 'low-hp-transform', 'regen'] as const) {
        expect(kinds, `unit ${uid} must not emit ${k}`).not.toContain(k);
      }
    }
  });

  it('combatAbility 负数防护、fallback 兜底与合成 a:63 科技交互边界', () => {
    expect(normalizeCombatAbility(undefined)).toBe(0);
    expect(normalizeCombatAbility(-1)).toBe(0);
    expect(normalizeCombatAbility(-5)).toBe(0);
    expect(normalizeCombatAbility(Number.NaN)).toBe(0);
    expect(normalizeCombatAbility(Number.POSITIVE_INFINITY)).toBe(0);
    expect(normalizeCombatAbility(132.9)).toBe(132);
    expect(hasIgnoreArmor(-1)).toBe(false);
    expect(hasResistIgnoreArmor(-2)).toBe(false);

    // 负数 combatAbility 绝不因补码误命中 bit 4/32/64/128
    const negUnit: Unit = { ...byId[567]!, combatAbility: -1 };
    expect(detectUnitUnmodeled({ unit: negUnit, civ: 'Japanese', age: 4, selectedTechs: [] })).toEqual([]);

    // 合成 bit 128 但缺少 onHitEffect 时输出「命中特效」兜底文案
    const fallbackUnit: Unit = { ...byId[567]!, combatAbility: 128, onHitEffect: undefined };
    expect(detectUnitUnmodeled({ unit: fallbackUnit, civ: 'Japanese', age: 4, selectedTechs: [] })).toEqual([
      {
        kind: 'on-hit',
        pill: '命中特效',
        detail: '当前未计入该单位命中时附带的特殊效果；实战表现可能偏离此处估算。',
      },
    ]);

    // 现存 3 项 a:63 科技（832/997/1081）不翻转 bit 4|32|64|128：832 不进入 applicableUnmodeledTechIds；
    // 997/1081 仅因自身 a:107/a:102 额外弹矢进入可选且不触发 armor-strip/aura/on-hit
    expect(applicableUnmodeledTechIds(simTechs(ctx, byId[567]!, 'Dravidians'), 567, byId[567]!.combatAbility).has(832)).toBe(false);
    expect(effectiveCombatAbility(byId[567]!.combatAbility, 567, 'Dravidians', 4, [techById[832]!]) & (4 | 32 | 64 | 128)).toBe(0);
    expect(effectiveCombatAbility(byId[1948]!.combatAbility, 1948, 'Jurchens', 4, [techById[997]!]) & (4 | 32 | 64 | 128)).toBe(0);
    expect(effectiveCombatAbility(byId[1948]!.combatAbility, 1948, 'Wu', 4, [techById[1081]!]) & (4 | 32 | 64 | 128)).toBe(0);
    expect(detectUnitUnmodeled({ unit: byId[1948]!, civ: 'Jurchens', age: 4, selectedTechs: [techById[997]!] }).map((m) => m.pill)).toEqual([
      '充能多箭齐射',
      '额外弹矢 · 霹雳炸弹',
      '直线穿透',
    ]);
    expect(detectUnitUnmodeled({ unit: byId[1948]!, civ: 'Wu', age: 4, selectedTechs: [techById[1081]!] }).map((m) => m.pill)).toEqual([
      '充能多箭齐射',
      '额外弹矢 · 卧虎',
      '直线穿透',
    ]);

    // 合成 a:63 科技测试：授予 bit 4、set 0 清除 bit 128、32->96 等价光环不变签名
    const fakeGrant: Tech = { ...techById[832]!, id: 99001, en: '__FakeGrantStrip1367__', zh: '合成破甲' };
    const fakeClear: Tech = { ...techById[832]!, id: 99002, en: '__FakeClearOnHit1367__', zh: '合成清特效' };
    const fakeSameAura: Tech = { ...techById[832]!, id: 99003, en: '__FakeSameAura1367__', zh: '合成同光环' };
    const techsMap = DAT.techs as Record<string, { id: number; eco: DatEco[]; rules: unknown[] }>;
    techsMap[fakeGrant.en] = { id: fakeGrant.id, eco: [{ a: 63, op: 'add', v: 4, t: [567] }], rules: [] };
    techsMap[fakeClear.en] = { id: fakeClear.id, eco: [{ a: 63, op: 'set', v: 0, t: [1922] }], rules: [] };
    techsMap[fakeSameAura.en] = { id: fakeSameAura.id, eco: [{ a: 63, op: 'set', v: 96, t: [1792] }], rules: [] };
    try {
      expect(effectiveCombatAbility(0, 567, 'Japanese', 4, [fakeGrant])).toBe(4);
      expect(detectUnitUnmodeled({ unit: byId[567]!, civ: 'Japanese', age: 4, selectedTechs: [fakeGrant] }).map((m) => m.pill)).toEqual(['撕裂护甲']);
      expect(detectUnitUnmodeled({ unit: byId[1922]!, civ: 'Khitans', age: 4, selectedTechs: [fakeClear] })).toEqual([]);

      const synthAvail = [
        { t: fakeGrant, ef: null },
        { t: fakeClear, ef: null },
        { t: fakeSameAura, ef: null },
      ];
      // 2 参数调用兼容（默认 baseCombatAbility = 0）
      expect(applicableUnmodeledTechIds(synthAvail, 567).has(fakeGrant.id)).toBe(true);
      // 3 参数传入 baseCombatAbility=128 时，set 0 改变位签名进入可选；base=32 且 set 96 合并签名不变不进入
      expect(applicableUnmodeledTechIds(synthAvail, 1922, 128).has(fakeClear.id)).toBe(true);
      expect(applicableUnmodeledTechIds(synthAvail, 1792, 32).has(fakeSameAura.id)).toBe(false);
    } finally {
      delete techsMap[fakeGrant.en];
      delete techsMap[fakeClear.en];
      delete techsMap[fakeSameAura.en];
    }
  });

  it('验收 4：hasPositiveEcoAttr set-0 边界、a:109 科技可选放行但不入预设、且绝不改变 PK 数值', () => {
    // set 0 必须严格返回 false（修复 minSet=EPS 时 0 >= 0 误判）
    expect(hasPositiveEcoAttr([{ a: 109, op: 'set', v: 0, t: [567] }], 567, 109, 1e-9)).toBe(false);
    expect(hasPositiveEcoAttr([{ a: 22, op: 'set', v: 0, t: [567] }], 567, 22, 1e-9)).toBe(false);
    expect(hasPositiveEcoAttr([{ a: 109, op: 'set', v: 15, t: [567] }], 567, 109, 1e-9)).toBe(true);
    // 跨条目展平抵消：+10 与 -10 归零返回 false
    expect(
      hasPositiveEcoAttr(
        [
          { a: 109, op: 'add', v: 10, t: [567] },
          { a: 109, op: 'add', v: -10, t: [567] },
        ],
        567,
        109,
        1e-9,
      ),
    ).toBe(false);

    // 579 马格里布骆驼：仅对柏柏尔骆驼系进入 applicableUnmodeledTechIds，不对骑士开放
    for (const uid of [329, 330, 1007, 1009]) {
      const avail = simTechs(ctx, byId[uid]!, 'Berbers');
      expect(applicableUnmodeledTechIds(avail, uid, byId[uid]!.combatAbility).has(579), `Berbers ${uid}`).toBe(true);
      expect(presetUpTo(avail, 4, 'Berbers').has(579), `579 not in preset for ${uid}`).toBe(false);
    }
    expect(applicableUnmodeledTechIds(simTechs(ctx, byId[38]!, 'Berbers'), 38, byId[38]!.combatAbility).has(579)).toBe(false);

    // 831 医疗部队：仅对达罗毗荼大象系进入 applicableUnmodeledTechIds，不对冠军剑士开放
    for (const uid of [873, 875, 1132, 1744, 1746]) {
      const avail = simTechs(ctx, byId[uid]!, 'Dravidians');
      expect(applicableUnmodeledTechIds(avail, uid, byId[uid]!.combatAbility).has(831), `Dravidians ${uid}`).toBe(true);
      expect(presetUpTo(avail, 4, 'Dravidians').has(831), `831 not in preset for ${uid}`).toBe(false);
    }
    expect(applicableUnmodeledTechIds(simTechs(ctx, byId[567]!, 'Dravidians'), 567, byId[567]!.combatAbility).has(831)).toBe(false);

    // 996 强化堡垒仅作用于建筑，不进入任何女真单位
    for (const uid of [567, 1948]) {
      expect(applicableUnmodeledTechIds(simTechs(ctx, byId[uid]!, 'Jurchens'), uid, byId[uid]!.combatAbility).has(996)).toBe(false);
    }

    // 勾选 579 / 831 后触发科技回血胶囊，但 simulate / oneVOneFight / groupFight 结果完全不变
    const tk = byId[554]!;
    const tkS = simulate(ctx, tk, 'Teutons', 4, presetUpTo(simTechs(ctx, tk, 'Teutons'), 4, 'Teutons'), new Set());
    const tkF = fighterFrom(tk, tkS);

    for (const [uid, civ, tid, expectedPill] of [
      [1009, 'Berbers', 579, '生命回复 · 马格里布骆驼'],
      [1744, 'Dravidians', 831, '生命回复 · 医疗部队'],
    ] as const) {
      const u = byId[uid]!;
      const basePreset = presetUpTo(simTechs(ctx, u, civ), 4, civ);
      const withRegen = new Set([...basePreset, tid]);
      const sBefore = simulate(ctx, u, civ, 4, basePreset, new Set());
      const sAfter = simulate(ctx, u, civ, 4, withRegen, new Set());
      expect(sAfter).toEqual(sBefore);
      expect(oneVOneFight(fighterFrom(u, sAfter), tkF)).toEqual(oneVOneFight(fighterFrom(u, sBefore), tkF));
      expect(groupFight(fighterFrom(u, sAfter), 10, tkF, 10)).toEqual(groupFight(fighterFrom(u, sBefore), 10, tkF, 10));

      const notes = detectUnitUnmodeled({ unit: u, civ, age: 4, selectedTechs: [techById[tid]!] });
      expect(notes).toEqual([
        {
          kind: 'regen',
          pill: expectedPill,
          detail: `当前未计入战斗中的生命回复（已选科技「${techById[tid]!.zh}」；未勾选该科技时本项不会触发）；持久战中实际生存能力通常高于此处估算。`,
          techId: tid,
          techEn: techById[tid]!.en,
        },
      ]);
    }

    // 合成文明回血 + 科技回血同场并存：分别产出独立胶囊
    const multiRegen = detectUnitUnmodeled({ unit: byId[1744]!, civ: 'Dravidians', age: 4, selectedTechs: [techById[831]!] });
    expect(multiRegen).toHaveLength(1);
    const fakeCivTech: Tech = { ...techById[831]!, id: 99004, en: '__FakeMultiRegen1367__', zh: '合成回血' };
    const techsMap = DAT.techs as Record<string, { id: number; eco: DatEco[]; rules: unknown[] }>;
    techsMap[fakeCivTech.en] = { id: fakeCivTech.id, eco: [{ a: 109, op: 'add', v: 15, t: [567] }], rules: [] };
    try {
      const both = detectUnitUnmodeled({ unit: byId[567]!, civ: 'Wu', age: 4, selectedTechs: [fakeCivTech] });
      expect(both.map((m) => m.pill)).toEqual(['生命回复', '生命回复 · 合成回血']);
    } finally {
      delete techsMap[fakeCivTech.en];
    }
  });

  it('副形态隔离：resolveUnitForm(CORE, 1980) 清空 4 项新可选字段且保留 combatAbility=2', () => {
    const form1980 = resolveUnitForm(CORE, 1980);
    expect(form1980.rawTarget?.id).toBe(1980);
    expect(form1980.rawTarget?.combatAbility).toBe(2);
    expect(form1980.rawTarget?.projectilePassThrough).toBeUndefined();
    expect(form1980.rawTarget?.onHitEffect).toBeUndefined();
    expect(form1980.rawTarget?.damagedTargetBonus).toBeUndefined();
    expect(form1980.rawTarget?.lowHpTransform).toBeUndefined();
  });

  it('验收 5：DuelUnmodeledNotes 单机制单段、多机制分项加粗分段、assumeHit 共存及零内部字段名泄漏', () => {
    // 1) 单机制（奥布奇 1703）：单一 <p>，不加 <strong> 前缀
    const singleHtml = html(
      createElement(DuelUnmodeledNotes, {
        entries: [{ side: 'a', badge: 'A', unit: byId[1703]!, civ: 'Poles', age: 4, selectedTechs: [] }],
        vgSides: [],
      }),
    );
    expect(singleHtml.match(/class="pk-unm-desc"/g)).toHaveLength(1);
    expect(singleHtml).not.toContain('<strong>撕裂护甲：</strong>');
    expect(singleHtml).toContain('当前未计入每次攻击对目标护甲的削减');

    // 2) 多机制（格鲁吉亚精锐莫纳斯帕 1805 / 蜀战车 1962）：每项独立 <p> + <strong>{pill}：</strong>
    const multiHtml = html(
      createElement(DuelUnmodeledNotes, {
        entries: [
          { side: 'a', badge: 'A', unit: byId[1805]!, civ: 'Georgians', age: 4, selectedTechs: [] },
          { side: 'b', badge: 'B', unit: byId[1962]!, civ: 'Shu', age: 4, selectedTechs: [] },
        ],
        vgSides: [],
      }),
    );
    expect(multiHtml.match(/class="pk-unm-desc"/g)).toHaveLength(5);
    expect(multiHtml).toContain('<strong>光环 / 编队增益：</strong>');
    expect(multiHtml).toContain('<strong>生命回复：</strong>');
    expect(multiHtml).toContain('<strong>多弹丸 / 副弹丸：</strong>');
    expect(multiHtml).toContain('<strong>可切换形态：</strong>');
    expect(multiHtml).toContain('<strong>直线穿透：</strong>');

    // 3) assumeHit + 新机制共存（孟加拉喷火船 529）
    const assumeCoexist = html(
      createElement(DuelUnmodeledNotes, {
        entries: [{ side: 'a', badge: 'A', unit: byId[529]!, civ: 'Bengalis', age: 3, selectedTechs: [], assumeHit: true }],
        vgSides: [],
      }),
    );
    expect(assumeCoexist).toContain('data-t="pk-assume-hit-inline"');
    expect(assumeCoexist).toContain('<strong>主弹 · 按每击命中估算：</strong>');
    expect(assumeCoexist).toContain('<strong>生命回复：</strong>当前未计入战斗中的生命回复（文明加成）');

    // 4) 全库 248 单位 + 典型科技输出文案绝不泄漏任何内部字段名
    const forbidden = /combatAbility|hit_mode|action_type|a:109|break_off_combat/i;
    for (const u of units) {
      const list = detectUnitUnmodeled({ unit: u, civ: u.civs[0]!, age: 4, selectedTechs: [techById[579]!, techById[831]!] });
      for (const m of list) {
        expect(forbidden.test(m.pill), `pill leak ${u.id}: ${m.pill}`).toBe(false);
        expect(forbidden.test(m.detail), `detail leak ${u.id}: ${m.detail}`).toBe(false);
      }
    }
    expect(forbidden.test(singleHtml)).toBe(false);
    expect(forbidden.test(multiHtml)).toBe(false);
    expect(forbidden.test(assumeCoexist)).toBe(false);
  });
});
