import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it } from 'vitest';
import { civs } from '../../src/data';
import { CORE } from '../../src/data/core';
import { splitMechTagSegments } from '../../src/domain/civRankShared';
import { DAT, type DatEco } from '../../src/domain/datEffects';
import { fighterFrom, groupFight, oneVOneFight } from '../../src/domain/duel';
import { applicableTrainingTechs, selectTrainingIds } from '../../src/domain/duelTrainingCost';
import { applicableUnmodeledTechIds, collectDuelUnmodeled, detectUnitUnmodeled, hasPositiveBonusDamageReduction } from '../../src/domain/duelUnmodeled';
import { presetUpTo, simTechs, simulate } from '../../src/domain/simulator';
import type { Tech, Unit } from '../../src/domain/types';
import { buildCivRankDuelHref, buildUnitCivRank } from '../../src/domain/unitCivRank';
import { upgradePlan } from '../../src/domain/upgradeComparison';
import { DuelUnmodeledNotes } from '../../src/features/duel/components/DuelUnmodeledNotes';
import { canonicalizeDuelSide, filterExplicitTechsForUnit, isUnavail, resolve, switchSideCiv, switchSideUnit } from '../../src/features/duel/logic/duelSide';
import { resolveMixedSide } from '../../src/features/duel/logic/mixedDuel';
import { resolveUnitForm } from '../../src/features/units/unitFormDetail';
import { CivRankMechTag } from '../../src/shared/ui/CivRankMechTag';
import { ctx, techById, trees, units } from './helpers';

const byId = CORE.unitById;
const html = (node: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, node));

const BDR_DETAIL = '当前未计入受到的额外伤害减免（文明加成）；面对克制加成攻击时，实际生存能力通常高于此处估算。';
const INHERENT_REGEN_DETAIL = '当前未计入战斗中的生命回复（单位固有）；持久战中实际生存能力通常高于此处估算。';
const techPassThroughDetail = (zh: string) =>
  `当前只按主目标逐击结算，未计入投射物穿过主目标、命中同一直线上其他单位的伤害（已选科技「${zh}」；未勾选该科技时本项不会触发）；对密集阵型的实际输出通常高于此处估算。`;

function researchTotals(selected: ReadonlySet<number>) {
  const cost: Record<string, number> = {};
  let time = 0;
  for (const id of selected) {
    const t = techById[id];
    if (!t) continue;
    for (const [k, v] of Object.entries(t.cost)) cost[k] = (cost[k] ?? 0) + v;
    time += t.rt;
  }
  return { cost, time };
}

describe('Issue 1446 单位 PK 未建模提示补齐（a:24 / 单位固有回血 / 科技直线穿透）', () => {
  it('验收 1：全库 248 单位 × 199 科技精确集合不变量（零硬编码 ID）', () => {
    expect(units).toHaveLength(248);
    expect(CORE.techs).toHaveLength(199);

    // 1) units.json 固有生命回复字段精确仅命中 692 / 694 / 1966；1954 / 1978 与 7 个副形态均不含 regenRate
    const regenUnits = Object.fromEntries(units.filter((u) => u.regenRate !== undefined).map((u) => [u.id, u.regenRate]));
    expect(regenUnits).toEqual({ 692: 40, 694: 40, 1966: 15 });
    expect(byId[1954]!.regenRate).toBeUndefined();
    expect(byId[1978]!.regenRate).toBeUndefined();
    for (const u of units) {
      if (u.form) expect('regenRate' in u.form).toBe(false);
    }

    // 2) effects.json projectilePassThrough 键与 CORE.techById[902/1379].en 严格对齐且集合精确
    expect(techById[902]!.en).toBe('Pirotechnia');
    expect(techById[1379]!.en).toBe('Malon');
    expect(Object.keys(DAT.projectilePassThrough ?? {}).sort()).toEqual([techById[1379]!.en, techById[902]!.en]);
    expect(DAT.projectilePassThrough).toEqual({
      Malon: { units: [6, 7, 185, 2569, 2571], buildings: [] },
      Pirotechnia: { units: [5], buildings: [] },
    });

    // 3) a:24 单位 PK 额外伤害减免在全站 56 文明 × 248 单位中精确仅命中孟加拉 846（10 象兵）与西西里 771（8 类陆军）
    const hitsByCiv: Record<string, number[]> = {};
    for (const c of civs) {
      const hitIds: number[] = [];
      for (const u of units) {
        if (!u.civs.includes(c.en)) continue;
        const mechs = detectUnitUnmodeled({ unit: u, civ: c.en, age: 4, selectedTechs: [] });
        if (mechs.some((m) => m.kind === 'bonus-damage-reduction')) hitIds.push(u.id);
      }
      if (hitIds.length) hitsByCiv[c.en] = hitIds.sort((a, b) => a - b);
    }
    expect(Object.keys(hitsByCiv).sort()).toEqual(['Bengalis', 'Sicilians']);
    // 孟加拉 846 底层 a:24 精确覆盖 10 个象兵 ID（含孟加拉自身可训练的 6 个象兵单位）
    const bengaliA24Targets = [
      ...new Set(
        DAT.civs
          .Bengalis!.bonus.flatMap((b) => b.eco)
          .filter((e) => e.a === 24)
          .flatMap((e) => e.t ?? []),
      ),
    ].sort((a, b) => a - b);
    expect(bengaliA24Targets).toEqual([239, 558, 873, 875, 1120, 1122, 1132, 1134, 1744, 1746]);
    for (const uid of bengaliA24Targets) {
      expect(
        detectUnitUnmodeled({ unit: byId[uid]!, civ: 'Bengalis', age: 4, selectedTechs: [] }).some((m) => m.kind === 'bonus-damage-reduction'),
        `Bengalis a:24 target ${uid}`,
      ).toBe(true);
    }
    expect(hitsByCiv.Bengalis).toEqual([873, 875, 1132, 1134, 1744, 1746]);
    // 孟加拉战车（1759/1761）不在 846 作用名单内
    expect(hitsByCiv.Bengalis).not.toContain(1759);
    expect(hitsByCiv.Bengalis).not.toContain(1761);
    // 西西里 771 底层 8 类陆军 a:24 命令与精确 27 个可用单位 ID 全集（排除海军、攻城、村民、僧侣）
    const sicilian771A24 = DAT.civs.Sicilians!.bonus.filter((b) => b.tech === 771).flatMap((b) => b.eco.filter((e) => e.a === 24));
    expect(sicilian771A24).toHaveLength(8);
    expect(sicilian771A24.map((e) => e.cls).sort((a, b) => (a ?? -1) - (b ?? -1))).toEqual([0, 6, 12, 23, 35, 36, 44, 47]);
    for (const e of sicilian771A24) {
      expect(e.op).toBe('set');
      expect(e.v).toBe(0.4);
    }
    const sicilianA24AllTargets = [
      ...new Set(
        DAT.civs
          .Sicilians!.bonus.flatMap((b) => b.eco)
          .filter((e) => e.a === 24)
          .flatMap((e) => e.t ?? []),
      ),
    ].sort((a, b) => a - b);
    const sicilian771Targets = [...new Set(sicilian771A24.flatMap((e) => e.t ?? []))].sort((a, b) => a - b);
    expect(sicilianA24AllTargets).toEqual(sicilian771Targets);
    expect(sicilian771Targets).toHaveLength(197);
    const expectedSicilianAvail = [
      4, 6, 7, 24, 38, 74, 75, 77, 93, 283, 358, 359, 440, 448, 473, 492, 546, 567, 1658, 1659, 1660, 1661, 1786, 1787, 1788, 2700, 2701,
    ];
    expect(
      units
        .filter((u) => u.civs.includes('Sicilians') && sicilian771Targets.includes(u.id))
        .map((u) => u.id)
        .sort((a, b) => a - b),
    ).toEqual(expectedSicilianAvail);
    expect(hitsByCiv.Sicilians).toEqual(expectedSicilianAvail);
    for (const excluded of [83, 125, 280, 331, 442, 539, 548]) {
      expect(hitsByCiv.Sicilians).not.toContain(excluded);
    }
    // 波斯城堡专属 Citadels (7) 仅针对建筑 82，对波斯所有单位均不触发单位 PK 额外伤害减免
    const citadels = techById[7]!;
    for (const u of units) {
      if (!u.civs.includes('Persians')) continue;
      const mechs = detectUnitUnmodeled({ unit: u, civ: 'Persians', age: 4, selectedTechs: [citadels] });
      expect(
        mechs.some((m) => m.kind === 'bonus-damage-reduction'),
        `Persians ${u.id}`,
      ).toBe(false);
    }
  });

  it('P2 边界：hasPositiveBonusDamageReduction 有限数值与顺序 set/add/mul 覆盖消歧', () => {
    const e24 = (op: string, v: number, t = [875]): DatEco => ({ a: 24, op, v, t });
    expect(hasPositiveBonusDamageReduction(undefined, 875)).toBe(false);
    expect(hasPositiveBonusDamageReduction([], 875)).toBe(false);
    expect(hasPositiveBonusDamageReduction([e24('set', 0.25)], 875)).toBe(true);
    expect(hasPositiveBonusDamageReduction([e24('set', 0.4, [283])], 283)).toBe(true);
    expect(hasPositiveBonusDamageReduction([e24('set', 0)], 875)).toBe(false);
    expect(hasPositiveBonusDamageReduction([e24('set', -0.25)], 875)).toBe(false);
    // 顺序 set / mul / add 覆盖消歧
    expect(hasPositiveBonusDamageReduction([e24('set', 0.25), e24('set', 0)], 875)).toBe(false);
    expect(hasPositiveBonusDamageReduction([e24('set', 0), e24('set', 0.25)], 875)).toBe(true);
    expect(hasPositiveBonusDamageReduction([e24('set', 0.25), e24('mul', 0)], 875)).toBe(false);
    expect(hasPositiveBonusDamageReduction([e24('mul', 0), e24('set', 0.25)], 875)).toBe(true);
    expect(hasPositiveBonusDamageReduction([e24('add', 0.25), e24('add', -0.25)], 875)).toBe(false);
    expect(hasPositiveBonusDamageReduction([e24('set', 0.25), e24('add', -0.25)], 875)).toBe(false);
    // 非有限数防护
    expect(hasPositiveBonusDamageReduction([e24('set', Number.NaN)], 875)).toBe(false);
    expect(hasPositiveBonusDamageReduction([e24('set', Number.POSITIVE_INFINITY)], 875)).toBe(false);
    expect(hasPositiveBonusDamageReduction([e24('set', Number.NEGATIVE_INFINITY)], 875)).toBe(false);
  });

  it('文案逐字对齐 UX 规格、来源分离、副形态 regenRate 零透传与零内部字段泄漏', () => {
    // 1) a:24 额外伤害减免（孟加拉 875 单机制 / 1134 与固有溅射叠加；西西里 283 / 1659）
    expect(detectUnitUnmodeled({ unit: byId[875]!, civ: 'Bengalis', age: 4, selectedTechs: [] })).toEqual([
      { kind: 'bonus-damage-reduction', pill: '额外伤害减免', detail: BDR_DETAIL },
    ]);
    expect(detectUnitUnmodeled({ unit: byId[1134]!, civ: 'Bengalis', age: 4, selectedTechs: [] }).map((m) => m.pill)).toEqual(['固有溅射伤害', '额外伤害减免']);
    for (const uid of [283, 1659]) {
      expect(detectUnitUnmodeled({ unit: byId[uid]!, civ: 'Sicilians', age: 4, selectedTechs: [] })).toEqual([
        { kind: 'bonus-damage-reduction', pill: '额外伤害减免', detail: BDR_DETAIL },
      ]);
    }

    // 2) 单位固有生命回复（692/694 单机制；1966 刘备光环 + 固有生命回复；反例 1954 曹操 / 1978 孙坚无生命回复且保留光环）
    for (const uid of [692, 694]) {
      expect(detectUnitUnmodeled({ unit: byId[uid]!, civ: 'Vikings', age: 4, selectedTechs: [] })).toEqual([
        { kind: 'regen', pill: '生命回复', detail: INHERENT_REGEN_DETAIL },
      ]);
    }
    const liuBei = detectUnitUnmodeled({ unit: byId[1966]!, civ: 'Shu', age: 4, selectedTechs: [] });
    expect(liuBei).toEqual([
      {
        kind: 'aura',
        pill: '光环 / 编队增益',
        detail: '当前未计入附近友军之间的光环或编队增益；成群作战时实际表现通常强于此处估算。',
      },
      { kind: 'regen', pill: '生命回复', detail: INHERENT_REGEN_DETAIL },
    ]);
    for (const [uid, civ] of [
      [1954, 'Wei'],
      [1978, 'Wu'],
    ] as const) {
      const hero = detectUnitUnmodeled({ unit: byId[uid]!, civ, age: 4, selectedTechs: [] });
      expect(hero.map((m) => m.pill)).toEqual(['光环 / 编队增益']);
      expect(hero.some((m) => m.kind === 'regen')).toBe(false);
    }

    // 3) 固有回血 + 文明加成回血 + 科技回血合成并存：PK 结果卡保留三段独立来源说明，单位对照表按胶囊名 Set 去重
    const fakeTech: Tech = { ...techById[831]!, id: 99446, en: '__FakeTechRegen1446__', zh: '合成回血科技' };
    const techsMap = DAT.techs as Record<string, { id: number; eco: DatEco[]; rules: unknown[] }>;
    techsMap[fakeTech.en] = { id: fakeTech.id, eco: [{ a: 109, op: 'add', v: 15, t: [567] }], rules: [] };
    try {
      const synthChamp: Unit = { ...byId[567]!, regenRate: 30 };
      const coexisting = detectUnitUnmodeled({ unit: synthChamp, civ: 'Wu', age: 4, selectedTechs: [fakeTech] });
      expect(coexisting.map((m) => m.pill)).toEqual(['生命回复', '生命回复', '生命回复 · 合成回血科技']);
      expect(coexisting[0]!.detail).toContain('单位固有');
      expect(coexisting[1]!.detail).toContain('文明加成');
      expect(coexisting[2]!.detail).toContain('已选科技「合成回血科技」');
      const cardHtml = html(
        createElement(DuelUnmodeledNotes, {
          entries: [{ side: 'a', badge: 'A', unit: synthChamp, civ: 'Wu', age: 4, selectedTechs: [fakeTech] }],
          vgSides: [],
        }),
      );
      expect(cardHtml.match(/class="pk-unm-desc"/g)).toHaveLength(3);
      expect(cardHtml).toContain('单位固有');
      expect(cardHtml).toContain('文明加成');
      expect(cardHtml).toContain('已选科技「合成回血科技」');

      const rank = buildUnitCivRank(ctx, synthChamp, 4);
      const wuRow = rank.rows.find((r) => r.civ === 'Wu')!;
      // 固有回血上提到全文明共有机制，行内不重复且按胶囊名 Set 去重
      expect(rank.commonMechanisms).toContain('生命回复');
      expect(wuRow.unmodeledPills.filter((p) => p === '生命回复')).toEqual([]);
    } finally {
      delete techsMap[fakeTech.en];
    }

    // 4) 副形态隔离：合成给主形态 1962 注入 regenRate 后，resolveUnitForm(CORE, 1980) 必须显式清空为 undefined
    const syntheticCore = {
      ...CORE,
      units: CORE.units.map((u) => (u.id === 1962 ? { ...u, regenRate: 40 } : u)),
    };
    const resolvedForm = resolveUnitForm(syntheticCore, 1980);
    expect(resolvedForm.rawTarget?.id).toBe(1980);
    expect(resolvedForm.rawTarget?.regenRate).toBeUndefined();

    // 5) 零内部字段名泄漏（全库 248 单位 + 本单 902/1379 + 孟加拉/西西里）
    const forbidden = /a:24|a:109|rear_attack_modifier|regenRate|projectilePassThrough|hit_mode|combatAbility|action_type/i;
    for (const u of units) {
      for (const civ of [
        ...new Set([u.civs[0]!, ...(u.civs.includes('Bengalis') ? ['Bengalis'] : []), ...(u.civs.includes('Sicilians') ? ['Sicilians'] : [])]),
      ]) {
        const list = detectUnitUnmodeled({ unit: u, civ, age: 4, selectedTechs: [techById[902]!, techById[1379]!] });
        for (const m of list) {
          expect(forbidden.test(m.pill), `pill leak ${u.id} ${civ}: ${m.pill}`).toBe(false);
          expect(forbidden.test(m.detail), `detail leak ${u.id} ${civ}: ${m.detail}`).toBe(false);
        }
      }
    }
  });

  it('验收 2–3：烟火之术（902）与突袭（1379）单兵三态交互、研究费同步、战果不变与零误报反例', () => {
    const opp = byId[567]!;
    const oppS = simulate(ctx, opp, 'Japanese', 4, presetUpTo(simTechs(ctx, opp, 'Japanese'), 4, 'Japanese'), new Set());
    const oppF = fighterFrom(opp, oppS);

    // 1) 意大利火枪手（5）+ 烟火之术（902）：留在 f 预设、acc=90 且出胶囊；取消 902 后 acc 恢复 75、胶囊消失、其余科技保留
    const hc = byId[5]!;
    const itAvail = simTechs(ctx, hc, 'Italians');
    const itPreset = presetUpTo(itAvail, 4, 'Italians');
    expect(itPreset.has(902)).toBe(true);
    const itPresetTechs = [...itPreset].map((id) => techById[id]!);
    const sHcOn = simulate(ctx, hc, 'Italians', 4, itPreset, new Set());
    expect(sHcOn.acc).toBe(90);
    expect(detectUnitUnmodeled({ unit: hc, civ: 'Italians', age: 4, selectedTechs: itPresetTechs })).toEqual([
      {
        kind: 'pass-through',
        pill: '直线穿透 · 烟火之术',
        detail: techPassThroughDetail('烟火之术'),
        techId: 902,
        techEn: 'Pirotechnia',
      },
    ]);
    const without902 = new Set([...itPreset].filter((id) => id !== 902));
    expect(without902.size).toBe(itPreset.size - 1);
    expect(without902.has(211)).toBe(true); // 射手软甲/皮甲/锁甲等其余已选科技保留
    expect(without902.has(219)).toBe(true);
    const sHcOff = simulate(ctx, hc, 'Italians', 4, without902, new Set());
    expect(sHcOff.acc).toBe(75);
    expect(detectUnitUnmodeled({ unit: hc, civ: 'Italians', age: 4, selectedTechs: [...without902].map((id) => techById[id]!) })).toEqual([]);

    // 2) 马普切 5 个适用单位（6/7/185/2569/2571）+ 突袭（1379）：不进 f/c 预设，开放手动勾选，完整三态闭环（未勾选 → 勾选 → 取消勾选）
    for (const uid of [6, 7, 185, 2569, 2571]) {
      const u = byId[uid]!;
      const avail = simTechs(ctx, u, 'Mapuche');
      expect(applicableUnmodeledTechIds(avail, uid, u.combatAbility ?? 0).has(1379), `applicable ${uid}`).toBe(true);
      const preset = presetUpTo(avail, 4, 'Mapuche');
      expect(preset.has(1379), `not in f preset ${uid}`).toBe(false);
      expect(presetUpTo(avail, 3, 'Mapuche').has(1379), `not in c preset ${uid}`).toBe(false);

      const selBefore = new Set(preset);
      const selChecked = new Set([...preset, 1379]);
      const selUnchecked = new Set([...selChecked].filter((id) => id !== 1379));
      expect([...selUnchecked].sort((a, b) => a - b)).toEqual([...selBefore].sort((a, b) => a - b));

      const techsBefore = [...selBefore].map((id) => techById[id]!);
      const techsChecked = [...selChecked].map((id) => techById[id]!);
      const techsUnchecked = [...selUnchecked].map((id) => techById[id]!);

      const hasCharge = uid === 2569 || uid === 2571;
      const expectedBasePills = hasCharge ? ['充能远程攻击'] : [];
      const expectedCheckedPills = hasCharge ? ['充能远程攻击', '直线穿透 · 突袭'] : ['直线穿透 · 突袭'];

      expect(detectUnitUnmodeled({ unit: u, civ: 'Mapuche', age: 4, selectedTechs: techsBefore }).map((m) => m.pill)).toEqual(expectedBasePills);
      const checkedMechs = detectUnitUnmodeled({ unit: u, civ: 'Mapuche', age: 4, selectedTechs: techsChecked });
      expect(checkedMechs.map((m) => m.pill)).toEqual(expectedCheckedPills);
      expect(checkedMechs.find((m) => m.kind === 'pass-through')).toEqual({
        kind: 'pass-through',
        pill: '直线穿透 · 突袭',
        detail: techPassThroughDetail('突袭'),
        techId: 1379,
        techEn: 'Malon',
      });
      expect(detectUnitUnmodeled({ unit: u, civ: 'Mapuche', age: 4, selectedTechs: techsUnchecked }).map((m) => m.pill)).toEqual(expectedBasePills);

      // 累计研究费随勾选 +300F +350G / +40s，取消后精确恢复
      const totBefore = researchTotals(selBefore);
      const totChecked = researchTotals(selChecked);
      const totUnchecked = researchTotals(selUnchecked);
      expect((totChecked.cost.Food ?? 0) - (totBefore.cost.Food ?? 0)).toBe(300);
      expect((totChecked.cost.Gold ?? 0) - (totBefore.cost.Gold ?? 0)).toBe(350);
      expect(totChecked.time - totBefore.time).toBe(40);
      expect(totUnchecked).toEqual(totBefore);

      // 三态全程战斗数值（1v1 与群战）逐项完全一致
      const sBefore = simulate(ctx, u, 'Mapuche', 4, selBefore, new Set());
      const sChecked = simulate(ctx, u, 'Mapuche', 4, selChecked, new Set());
      const sUnchecked = simulate(ctx, u, 'Mapuche', 4, selUnchecked, new Set());
      expect(sChecked).toEqual(sBefore);
      expect(sUnchecked).toEqual(sBefore);
      const fightBefore = oneVOneFight(fighterFrom(u, sBefore), oppF);
      expect(oneVOneFight(fighterFrom(u, sChecked), oppF)).toEqual(fightBefore);
      expect(oneVOneFight(fighterFrom(u, sUnchecked), oppF)).toEqual(fightBefore);
      const groupBefore = groupFight(fighterFrom(u, sBefore), 15, oppF, 10);
      expect(groupFight(fighterFrom(u, sChecked), 15, oppF, 10)).toEqual(groupBefore);
      expect(groupFight(fighterFrom(u, sUnchecked), 15, oppF, 10)).toEqual(groupBefore);
    }

    // 3) 零误报反例：丹麦冠军剑士 567（含显式 1484）、意大利劲弩手 492（含 902）、马普切长戟兵 359（含 1379）
    expect(applicableUnmodeledTechIds(simTechs(ctx, byId[567]!, 'Danes'), 567, byId[567]!.combatAbility ?? 0).has(1484)).toBe(false);
    expect(detectUnitUnmodeled({ unit: byId[567]!, civ: 'Danes', age: 4, selectedTechs: [techById[1484]!] })).toEqual([]);
    expect(applicableUnmodeledTechIds(simTechs(ctx, byId[492]!, 'Italians'), 492, byId[492]!.combatAbility ?? 0).has(902)).toBe(false);
    expect(detectUnitUnmodeled({ unit: byId[492]!, civ: 'Italians', age: 4, selectedTechs: [techById[902]!] })).toEqual([]);
    expect(applicableUnmodeledTechIds(simTechs(ctx, byId[359]!, 'Mapuche'), 359, byId[359]!.combatAbility ?? 0).has(1379)).toBe(false);
    expect(detectUnitUnmodeled({ unit: byId[359]!, civ: 'Mapuche', age: 4, selectedTechs: [techById[1379]!] })).toEqual([]);
  });

  it('跨文明与跨单位显式投射物科技裁剪统一生效，同时保持外部升级比较严格拒收', () => {
    const sideData = { byId, techById, trees };
    const fallback = { uid: 569, civ: 'Franks', age: 4, ageSet: true, techs: 'f' as const, team: [] };

    // 1) 普通 URL 规范化 + resolve：共享单位携带他国投射物科技（5.Turks.4.902 / 185.Incas.4.1379 / 492.Britons.4.1393）
    //    及同国不适用单位（492.Italians.4.902 / 359.Mapuche.4.1379）均自动裁剪，且不阻断 upgradePlan
    for (const [uid, civ, badTid] of [
      [5, 'Turks', 902],
      [185, 'Incas', 1379],
      [492, 'Britons', 1393],
      [492, 'Italians', 902],
      [359, 'Mapuche', 1379],
    ] as const) {
      const rawSpec = { uid, civ, age: 4, ageSet: true, techs: [badTid] as number[], team: [] };
      const canon = canonicalizeDuelSide(CORE, rawSpec, fallback);
      expect(canon.techs, `canon ${uid}.${civ}.${badTid}`).toEqual([]);
      expect(upgradePlan(ctx, byId, canon).ok, `upgradePlan after canon ${uid}.${civ}`).toBe(true);
      // 外部直接携带原始非法科技参数的比较链接仍严格拒收
      expect(upgradePlan(ctx, byId, rawSpec).ok, `strict upgradePlan ${uid}.${civ}.${badTid}`).toBe(false);

      const resolved = resolve(ctx, byId, rawSpec, uid);
      expect(isUnavail(resolved)).toBe(false);
      if (!isUnavail(resolved)) {
        expect(resolved.spec.techs, `resolve spec ${uid}.${civ}.${badTid}`).toEqual([]);
        expect(resolved.sel.has(badTid), `resolve sel ${uid}.${civ}.${badTid}`).toBe(false);
      }

      const avail = simTechs(ctx, byId[uid]!, civ);
      const costs = applicableTrainingTechs(ctx, byId[uid]!, civ, 4);
      expect(selectTrainingIds([badTid], avail, 4, costs, civ, uid).has(badTid)).toBe(false);
    }

    // 2) 合法所属文明＋适用单位继续保留显式 ID
    for (const [uid, civ, okTid] of [
      [5, 'Italians', 902],
      [185, 'Mapuche', 1379],
      [492, 'Tupi', 1393],
    ] as const) {
      const okSpec = { uid, civ, age: 4, ageSet: true, techs: [okTid] as number[], team: [] };
      expect(canonicalizeDuelSide(CORE, okSpec, fallback).techs).toEqual([okTid]);
      const r = resolve(ctx, byId, okSpec, uid);
      expect(isUnavail(r)).toBe(false);
      if (!isUnavail(r)) {
        expect(r.spec.techs).toEqual([okTid]);
        expect(r.sel.has(okTid)).toBe(true);
      }
    }

    // 3) 切文明（switchSideCiv）立即裁剪他国投射物科技，切回时不复活，不阻断 upgradePlan
    const itHc = { uid: 5, civ: 'Italians', age: 4, ageSet: true, techs: [211, 902] as number[], team: [] };
    const turkHc = switchSideCiv(sideData, itHc, byId[5]!, 'Turks');
    expect(turkHc.techs).toEqual([211]);
    expect(upgradePlan(ctx, byId, turkHc).ok).toBe(true);
    expect(switchSideCiv(sideData, turkHc, byId[5]!, 'Italians').techs).toEqual([211]);

    const mapucheSlinger = { uid: 185, civ: 'Mapuche', age: 4, ageSet: true, techs: [1379] as number[], team: [] };
    const incaSlinger = switchSideCiv(sideData, mapucheSlinger, byId[185]!, 'Incas');
    expect(incaSlinger.techs).toEqual([]);
    expect(upgradePlan(ctx, byId, incaSlinger).ok).toBe(true);

    const tupiArb = { uid: 492, civ: 'Tupi', age: 4, ageSet: true, techs: [1393] as number[], team: [] };
    const britArb = switchSideCiv(sideData, tupiArb, byId[492]!, 'Britons');
    expect(britArb.techs).toEqual([]);
    expect(upgradePlan(ctx, byId, britArb).ok).toBe(true);

    // 4) 切单位（switchSideUnit）裁剪不适用单位，保留通用科技，兼容 3 参数与 4 参数调用
    expect(switchSideUnit(techById, itHc, 492).techs).toEqual([211]);
    expect(switchSideUnit(techById, mapucheSlinger, 359).techs).toEqual([]);
    expect(filterExplicitTechsForUnit([211, 902], techById, 492)).toEqual([211]);
    expect(filterExplicitTechsForUnit([211, 902], techById, 5, 'Turks')).toEqual([211]);
    expect(filterExplicitTechsForUnit([211, 902], techById, 5, 'Italians')).toEqual([211, 902]);
  });

  it('混编模式精确按兵种行匹配：意大利 [5,492]/[492] 与马普切 [185,359]/[6,359]/[359]', () => {
    // 意大利 [5, 492] 混编：902 仅匹配并计入第 1 行火枪手，第 2 行劲弩手不匹配且零提示
    const itMix = resolveMixedSide(
      ctx,
      CORE,
      {
        civ: 'Italians',
        age: '4',
        techs: ['47', '902'],
        team: [],
        rows: [
          { uid: '5', qty: '10' },
          { uid: '492', qty: '10' },
        ],
      },
      'a',
    );
    expect(itMix.errors).toEqual([]);
    expect(itMix.techs.find((o) => o.t.id === 902)).toMatchObject({ numeric: true, rows: [0] });
    expect(itMix.rows[0]!.resolved!.sel.has(902)).toBe(true);
    expect(itMix.rows[1]!.resolved!.sel.has(902)).toBe(false);
    const itUnm = collectDuelUnmodeled(
      itMix.rows.map((r, i) => ({
        side: 'a' as const,
        badge: `A${i + 1}`,
        unit: r.resolved!.u,
        civ: 'Italians',
        age: 4,
        selectedTechs: [...r.resolved!.sel].map((id) => techById[id]!),
      })),
    );
    expect(itUnm.map((e) => [e.badge, e.unit.id, e.mechanisms.map((m) => m.pill)])).toEqual([['A1', 5, ['直线穿透 · 烟火之术']]]);

    // 意大利纯 [492] 显式 902 报错拒收
    const itNeg = resolveMixedSide(ctx, CORE, { civ: 'Italians', age: '4', techs: ['902'], team: [], rows: [{ uid: '492', qty: '10' }] }, 'a');
    expect(itNeg.techs.some((o) => o.t.id === 902)).toBe(false);
    expect(itNeg.errors.some((e) => e.field === 'mix-a-techs')).toBe(true);

    // 马普切 [185, 359] 与 [6, 359] 混编：1379 仅匹配第 1 行适用单位，第 2 行长戟兵不匹配且零提示
    for (const goodUid of [185, 6]) {
      const mapMix = resolveMixedSide(
        ctx,
        CORE,
        {
          civ: 'Mapuche',
          age: '4',
          techs: ['1379'],
          team: [],
          rows: [
            { uid: String(goodUid), qty: '10' },
            { uid: '359', qty: '10' },
          ],
        },
        'a',
      );
      expect(mapMix.errors).toEqual([]);
      expect(mapMix.techs.find((o) => o.t.id === 1379)).toMatchObject({ numeric: false, rows: [0] });
      expect(mapMix.rows[0]!.resolved!.sel.has(1379)).toBe(true);
      expect(mapMix.rows[1]!.resolved!.sel.has(1379)).toBe(false);
      const mapUnm = collectDuelUnmodeled(
        mapMix.rows.map((r, i) => ({
          side: 'a' as const,
          badge: `A${i + 1}`,
          unit: r.resolved!.u,
          civ: 'Mapuche',
          age: 4,
          selectedTechs: [...r.resolved!.sel].map((id) => techById[id]!),
        })),
      );
      expect(mapUnm.map((e) => [e.badge, e.unit.id, e.mechanisms.map((m) => m.pill)])).toEqual([['A1', goodUid, ['直线穿透 · 突袭']]]);
    }

    // 马普切纯 [359] 显式 1379 报错拒收
    const mapNeg = resolveMixedSide(ctx, CORE, { civ: 'Mapuche', age: '4', techs: ['1379'], team: [], rows: [{ uid: '359', qty: '10' }] }, 'a');
    expect(mapNeg.techs.some((o) => o.t.id === 1379)).toBe(false);
    expect(mapNeg.errors.some((e) => e.field === 'mix-a-techs')).toBe(true);
  });

  it('单位满科技对照（#1387）：未计入标签、f 与显式 ID 跳转、单文明共有机制上提与 .nw 语义分段', () => {
    // 1) 重装骑士 283：西西里行出现「额外伤害减免」
    const cavRank = buildUnitCivRank(ctx, byId[283]!, 4);
    expect(cavRank.rows.find((r) => r.civ === 'Sicilians')!.unmodeledPills).toContain('额外伤害减免');
    expect(cavRank.rows.find((r) => r.civ === 'Franks')!.unmodeledPills).not.toContain('额外伤害减免');

    // 2) 精锐骑象射手 875：孟加拉行出现「额外伤害减免」
    const eaRank = buildUnitCivRank(ctx, byId[875]!, 4);
    expect(eaRank.rows.find((r) => r.civ === 'Bengalis')!.unmodeledPills).toContain('额外伤害减免');

    // 3) 火枪手 5：意大利行出现「直线穿透 · 烟火之术」，且 PK 跳转链接保持 f 预设（902 已在 selTechIds 中）
    const hcRank = buildUnitCivRank(ctx, byId[5]!, 4);
    const itHcRow = hcRank.rows.find((r) => r.civ === 'Italians')!;
    const turkHcRow = hcRank.rows.find((r) => r.civ === 'Turks')!;
    expect(itHcRow.unmodeledPills).toEqual(['直线穿透 · 烟火之术']);
    expect(itHcRow.selTechIds).toContain(902);
    const hcHref = buildCivRankDuelHref(5, itHcRow, turkHcRow, 4, hcRank.combatKind);
    expect(new URLSearchParams(hcHref.split('?')[1]).get('a')).toBe('5.Italians.4.f.');

    // 4) 投石手 185 与精锐掷矛手 6：马普切行出现「直线穿透 · 突袭」，且 PK 跳转链接展开显式 ID 带入 1379
    for (const [uid, oppCiv] of [
      [185, 'Incas'],
      [6, 'Britons'],
    ] as const) {
      const rank = buildUnitCivRank(ctx, byId[uid]!, 4);
      const mapRow = rank.rows.find((r) => r.civ === 'Mapuche')!;
      const oppRow = rank.rows.find((r) => r.civ === oppCiv)!;
      expect(mapRow.unmodeledPills, `rank ${uid}`).toContain('直线穿透 · 突袭');
      expect(mapRow.selTechIds).not.toContain(1379);
      expect(mapRow.activeUnmodeledTechIds).toContain(1379);
      const href = buildCivRankDuelHref(uid, mapRow, oppRow, 4, rank.combatKind);
      const aParam = new URLSearchParams(href.split('?')[1]).get('a')!;
      expect(aParam).not.toContain('.f.');
      expect(aParam.split('.')[3]!.split('-').map(Number)).toContain(1379);
    }

    // 5) 单文明单位（692/694/1966/2571）：UI 端按既有规则不渲染单文明对照表，领域层保留精确行内未计入标签（仅 rows.length >= 2 时上提 commonMechanisms）
    for (const [uid, expectedPills] of [
      [692, ['生命回复']],
      [694, ['生命回复']],
      [1966, ['光环 / 编队增益', '生命回复']],
      [2571, ['充能远程攻击', '直线穿透 · 突袭']],
    ] as const) {
      const rank = buildUnitCivRank(ctx, byId[uid]!, 4);
      expect(rank.totalCivCount).toBe(1);
      expect(rank.commonMechanisms).toEqual([]);
      expect(rank.rows[0]!.unmodeledPills).toEqual(expectedPills);
    }

    // 6) CivRankMechTag 语义分段（中点绑定机制名末尾，不落下一段开头）
    expect(splitMechTagSegments('未计入：额外伤害减免').map((s) => s.text)).toEqual(['未计入：', '额外伤害减免']);
    expect(splitMechTagSegments('未计入：直线穿透 · 烟火之术').map((s) => s.text)).toEqual(['未计入：', '直线穿透 ·', '烟火之术']);
    expect(splitMechTagSegments('未计入：直线穿透 · 突袭').map((s) => s.text)).toEqual(['未计入：', '直线穿透 ·', '突袭']);
    const tagHtml = html(createElement(CivRankMechTag, { text: '未计入：直线穿透 · 烟火之术' }));
    expect(tagHtml).toContain('<span class="nw">未计入：</span>');
    expect(tagHtml).toContain('<span class="nw">直线穿透 ·</span>');
    expect(tagHtml).toContain('<span class="nw">烟火之术</span>');
  });
});
