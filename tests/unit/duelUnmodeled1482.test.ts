import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { describe, expect, it } from 'vitest';
import { ARMY_COST_USAGE } from '../../src/data/armyCostUsage';
import { ARMY_RESEARCH } from '../../src/data/armyResearch';
import { CORE } from '../../src/data/core';
import { armyResearchChoices, emptyArmyCost, evaluateArmyCost } from '../../src/domain/armyCost';
import { splitMechTagSegments } from '../../src/domain/civRankShared';
import { DAT, type DatEco } from '../../src/domain/datEffects';
import { fighterFrom, fighterUsesAssumeHit, groupFight, oneVOneFight } from '../../src/domain/duel';
import { applicableTrainingTechs, selectTrainingIds } from '../../src/domain/duelTrainingCost';
import {
  applicableUnmodeledTechIds,
  collectDuelUnmodeled,
  detectUnitUnmodeled,
  hasPositiveDamageReflection,
  isSingleShotChargeProjectileEco,
  keepsScopedUnmodeledTech,
  resolveTechChargeGrant,
} from '../../src/domain/duelUnmodeled';
import { presetUpTo, simTechs, simulate } from '../../src/domain/simulator';
import type { Tech, Unit } from '../../src/domain/types';
import { buildCivRankDuelHref, buildUnitCivRank } from '../../src/domain/unitCivRank';
import { upgradePlan } from '../../src/domain/upgradeComparison';
import { DuelUnmodeledNotes } from '../../src/features/duel/components/DuelUnmodeledNotes';
import { canonicalizeDuelSide, filterExplicitTechsForUnit, isUnavail, resolve, switchSideCiv, switchSideUnit } from '../../src/features/duel/logic/duelSide';
import { resolveMixedSide } from '../../src/features/duel/logic/mixedDuel';
import { mixedTrainingTransfer } from '../../src/features/duel/logic/mixedTrainingTransfer';
import { CivRankMechTag } from '../../src/shared/ui/CivRankMechTag';
import { ctx, techById, trees, units } from './helpers';

const byId = CORE.unitById;
const prodCtx = { core: CORE, trees };
const html = (node: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(StaticRouter, { location: '/' }, node));

const reflectionDetail = (zh: string) =>
  `当前未计入受到近战攻击时的伤害反弹（已选科技「${zh}」；未勾选该科技时本项不会触发）；近战对拼时实际换血能力通常高于此处估算。`;
const chargeBonusDetail = (zh: string) =>
  `当前仅按基础主攻击逐击结算，未计入蓄力攻击的周期额外增伤（已选科技「${zh}」；未勾选该科技时本项不会触发）；实战爆发输出通常高于此处估算。`;
const chargeRangedDetail = (zh: string) =>
  `当前仅按基础主攻击逐击结算，未计入充能远程攻击（已选科技「${zh}」；未勾选该科技时本项不会触发）；实战输出或压制能力可能高于此处估算。`;

const KHITAN_1006_TRAINABLE = [6, 7, 74, 75, 77, 93, 358, 473, 567, 1901, 1903, 1920, 1922];
const EXPECTED_884_UNITS = [38, 74, 75, 77, 283, 473, 567, 569, 1790, 1792, 1793, 1813];
const EXPECTED_909_UNITS = [529, 532, 1103, 1302];
const EXPECTED_1474_UNITS = [2703, 2704];

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

describe('Issue 1482 近战伤害反弹（a:118）与科技充能（a:59–62）全链路数据、阵容账本与 PK 提示', () => {
  it('验收 1：零硬编码科技 ID，且全库 56 文明 × 248 单位 × 199 科技集合精确守恒', () => {
    const files = [
      'src/domain/duelUnmodeledEco.ts',
      'src/domain/duelUnmodeled.ts',
      'src/domain/simulator.ts',
      'src/domain/techDataConsumption.ts',
      'src/domain/duelTrainingCost.ts',
      'src/features/duel/logic/duelSide.ts',
      'src/features/duel/logic/mixedDuel.ts',
      'src/features/duel/logic/mixedTrainingTransfer.ts',
    ];
    for (const f of files) {
      const codeOnly = readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(codeOnly, `${f} must not hardcode target tech IDs`).not.toMatch(/\b(?:884|909|997|1006|1474)\b/);
    }

    // 1) 精确导出数据检查
    const lam118 = [...new Set((DAT.techs['Lamellar Armor']?.eco ?? []).filter((e) => e.a === 118).flatMap((e) => e.t ?? []))].sort((a, b) => a - b);
    expect(lam118).toHaveLength(81);
    expect(ARMY_RESEARCH.nodes['1006']!.combatUnits).toEqual(lam118);

    const com62 = [...new Set((DAT.techs.Comitatenses?.eco ?? []).filter((e) => e.a === 62).flatMap((e) => e.t ?? []))].sort((a, b) => a - b);
    expect(com62).toEqual(EXPECTED_884_UNITS);
    expect(ARMY_RESEARCH.nodes['884']!.combatUnits).toEqual(EXPECTED_884_UNITS);

    const siph62 = [...new Set((DAT.techs.Siphons?.eco ?? []).filter((e) => e.a === 62).flatMap((e) => e.t ?? []))].sort((a, b) => a - b);
    expect(siph62).toEqual(EXPECTED_909_UNITS);
    expect(ARMY_RESEARCH.nodes['909']!.combatUnits).toEqual(EXPECTED_909_UNITS);

    const goth62 = [...new Set((DAT.techs.Gothikon?.eco ?? []).filter((e) => e.a === 62).flatMap((e) => e.t ?? []))].sort((a, b) => a - b);
    expect(goth62).toEqual(EXPECTED_1474_UNITS);
    expect(ARMY_RESEARCH.nodes['1474']!.combatUnits).toEqual(EXPECTED_1474_UNITS);

    expect(ARMY_RESEARCH.nodes['997']!.combatUnits).toEqual([1948]);
    for (const tid of ['199', '200', '201', '377'] as const) {
      expect(ARMY_RESEARCH.nodes[tid]!.combatUnits).toContain(1948);
    }
    expect(ARMY_COST_USAGE.bonuses['Italians-2']!.tids).toContain(909);
    expect(ARMY_COST_USAGE.bonuses['Chinese-1']!.tids).toContain(909);

    // 2) 全库 199 科技 × 248 单位扫描：damage-reflection 仅命中 1006；科技赋予 charge（baseChargeType === 0）仅命中 884 / 909 / 1474
    const reflectionTechIds = new Set<number>();
    const chargeGrantTechIds = new Set<number>();
    for (const t of CORE.techs) {
      const eco = DAT.techs[t.en]?.eco;
      for (const u of units) {
        if (hasPositiveDamageReflection(eco, u.id)) reflectionTechIds.add(t.id);
        if (resolveTechChargeGrant(eco, u.id, u.chargeType ?? 0) !== null) chargeGrantTechIds.add(t.id);
      }
    }
    expect([...reflectionTechIds].sort((a, b) => a - b)).toEqual([1006]);
    expect([...chargeGrantTechIds].sort((a, b) => a - b)).toEqual([884, 909, 1474]);

    // 3) 契丹 1006 实际可训练单位精确 13 个
    const khitan1006Units = units
      .filter((u) => u.civs.includes('Khitans') && hasPositiveDamageReflection(DAT.techs['Lamellar Armor']?.eco, u.id))
      .map((u) => u.id)
      .sort((a, b) => a - b);
    expect(khitan1006Units).toEqual(KHITAN_1006_TRAINABLE);

    // 4) 固有充能防刷屏：1948 楼船 + 199/200/201/377/997 与 2705/2706 扈从部队 + 199/200/201 零重复科技充能胶囊
    const louChuan = byId[1948]!;
    expect(louChuan.chargeType).toBeGreaterThan(0);
    const louWithAll = detectUnitUnmodeled({
      unit: louChuan,
      civ: 'Jurchens',
      age: 4,
      selectedTechs: [techById[199]!, techById[200]!, techById[201]!, techById[377]!, techById[997]!],
    });
    expect(louWithAll.map((m) => m.pill)).toEqual(['充能多箭齐射', '额外弹矢 · 霹雳炸弹', '直线穿透']);
    expect(louWithAll.filter((m) => m.kind === 'charge')).toHaveLength(1);

    for (const uid of [2705, 2706]) {
      const u = byId[uid]!;
      expect(u.chargeType).toBeGreaterThan(0);
      const mechs = detectUnitUnmodeled({
        unit: u,
        civ: u.civs[0]!,
        age: 4,
        selectedTechs: [techById[199]!, techById[200]!, techById[201]!],
      });
      expect(mechs.map((m) => m.pill)).toEqual(['充能远程攻击']);
    }
  });

  it('纯函数边界：hasPositiveDamageReflection / resolveTechChargeGrant / isSingleShotChargeProjectileEco 顺序覆盖与非有限数防护', () => {
    const e = (a: number, op: string, v: number, t = [1922]): DatEco => ({ a, op, v, t });

    // a:118 伤害反弹
    expect(hasPositiveDamageReflection(undefined, 1922)).toBe(false);
    expect(hasPositiveDamageReflection([], 1922)).toBe(false);
    expect(hasPositiveDamageReflection([e(118, 'add', 0.25)], 1922)).toBe(true);
    expect(hasPositiveDamageReflection([e(118, 'set', 0.25)], 1922)).toBe(true);
    expect(hasPositiveDamageReflection([e(118, 'add', 0.25), e(118, 'add', -0.25)], 1922)).toBe(false);
    expect(hasPositiveDamageReflection([e(118, 'set', 0.25), e(118, 'set', 0)], 1922)).toBe(false);
    expect(hasPositiveDamageReflection([e(118, 'set', 0.25), e(118, 'mul', 0)], 1922)).toBe(false);
    expect(hasPositiveDamageReflection([e(118, 'set', Number.NaN)], 1922)).toBe(false);
    expect(hasPositiveDamageReflection([e(118, 'set', Number.POSITIVE_INFINITY)], 1922)).toBe(false);
    expect(hasPositiveDamageReflection([e(118, 'set', -0.25)], 1922)).toBe(false);

    // a:62 / a:61 科技赋予充能
    expect(resolveTechChargeGrant(undefined, 532, 0)).toBeNull();
    expect(resolveTechChargeGrant([e(61, 'add', 1, [532])], 532, 0)).toBeNull();
    expect(resolveTechChargeGrant([e(62, 'set', 6, [532])], 532, 6)).toBeNull();
    expect(resolveTechChargeGrant([e(62, 'set', 6, [532])], 532, Number.NaN)).toBeNull();
    expect(resolveTechChargeGrant([e(62, 'set', 6, [532]), e(61, 'set', 3, [532])], 532, 0)).toEqual({ chargeType: 6, chargeEvent: 3 });
    expect(resolveTechChargeGrant([e(62, 'set', 6, [532]), e(62, 'set', 0, [532])], 532, 0)).toBeNull();
    expect(resolveTechChargeGrant([e(62, 'set', 6, [532]), e(62, 'mul', 0, [532])], 532, 0)).toBeNull();
    expect(resolveTechChargeGrant([e(62, 'add', 6, [532]), e(62, 'add', -6, [532])], 532, 0)).toBeNull();
    expect(resolveTechChargeGrant([e(62, 'set', Number.NaN, [532])], 532, 0)).toBeNull();
    expect(resolveTechChargeGrant([e(62, 'set', Number.POSITIVE_INFINITY, [532])], 532, 0)).toBeNull();

    // 单发充能远程抑制冗余「额外弹矢」
    expect(isSingleShotChargeProjectileEco([e(107, 'set', 1, [2704])], 2704, { chargeType: 6, chargeEvent: 3 })).toBe(true);
    expect(isSingleShotChargeProjectileEco([e(107, 'set', 1, [2704])], 2704, { chargeType: 7, chargeEvent: 0 })).toBe(true);
    expect(isSingleShotChargeProjectileEco([e(107, 'set', 2, [2704])], 2704, { chargeType: 6, chargeEvent: 3 })).toBe(false);
    expect(isSingleShotChargeProjectileEco([e(107, 'set', 1, [2704]), e(102, 'add', 1, [2704])], 2704, { chargeType: 6, chargeEvent: 3 })).toBe(false);
    expect(isSingleShotChargeProjectileEco([e(107, 'add', 1, [2704])], 2704, { chargeType: 6, chargeEvent: 3 })).toBe(false);
    expect(isSingleShotChargeProjectileEco([e(107, 'set', 1, [2704])], 2704, { chargeType: 1, chargeEvent: 1 })).toBe(false);
    expect(isSingleShotChargeProjectileEco([e(107, 'set', 1, [2704])], 2704, null)).toBe(false);
  });

  it('验收 2：阵容新增费用精确报价（罗马 1793+t:884、契丹 1922+t:1006、拜占庭 532+t:909）与反例拒收', () => {
    // 1) 罗马 28 × 1793 + t:884（野战军 700 食 800 金）
    const romCfg = { ...emptyArmyCost('Romans', '4'), rows: [{ unit: 1793, qty: '28' }], targets: ['t:884'] };
    expect(armyResearchChoices(prodCtx, romCfg, false, ARMY_RESEARCH)).toContain(884);
    const romRes = evaluateArmyCost(prodCtx, romCfg, ARMY_RESEARCH);
    expect(romRes.blocked).toEqual([]);
    expect(romRes.partial).toBe(false);
    expect(romRes.ledger.find((e) => e.id === 884)).toMatchObject({ status: 'planned', cost: { Food: 700, Gold: 800 } });
    expect(romRes.trainingTotal).toEqual({ Food: 1400, Wood: 0, Gold: 560, Stone: 0 });
    expect(romRes.researchTotal).toEqual({ Food: 1750, Wood: 0, Gold: 1305, Stone: 0 });
    expect(romRes.total).toEqual({ Food: 3150, Wood: 0, Gold: 1865, Stone: 0 });

    // 2) 契丹 30 × 1922 + t:1006（札甲 450 食 300 金）
    const khiCfg = { ...emptyArmyCost('Khitans', '4'), rows: [{ unit: 1922, qty: '30' }], targets: ['t:1006'] };
    expect(armyResearchChoices(prodCtx, khiCfg, false, ARMY_RESEARCH)).toContain(1006);
    const khiRes = evaluateArmyCost(prodCtx, khiCfg, ARMY_RESEARCH);
    expect(khiRes.blocked).toEqual([]);
    expect(khiRes.partial).toBe(false);
    expect(khiRes.ledger.find((e) => e.id === 1006)).toMatchObject({ status: 'planned', cost: { Food: 450, Gold: 300 } });
    expect(khiRes.trainingTotal).toEqual({ Food: 1200, Wood: 0, Gold: 1200, Stone: 0 });
    expect(khiRes.researchTotal).toEqual({ Food: 1250, Wood: 0, Gold: 950, Stone: 0 });
    expect(khiRes.total).toEqual({ Food: 2450, Wood: 0, Gold: 2150, Stone: 0 });

    // 3) 拜占庭 10 × 532 + t:909（虹吸管 100 食 175 金 — 食物非木材）
    const byzCfg = { ...emptyArmyCost('Byzantines', '4'), rows: [{ unit: 532, qty: '10' }], targets: ['t:909'] };
    expect(armyResearchChoices(prodCtx, byzCfg, false, ARMY_RESEARCH)).toContain(909);
    const byzRes = evaluateArmyCost(prodCtx, byzCfg, ARMY_RESEARCH);
    expect(byzRes.blocked).toEqual([]);
    expect(byzRes.partial).toBe(false);
    expect(byzRes.ledger.find((e) => e.id === 909)).toMatchObject({ status: 'planned', cost: { Food: 100, Gold: 175 } });
    expect(byzRes.trainingTotal).toEqual({ Food: 0, Wood: 750, Gold: 450, Stone: 0 });
    expect(byzRes.researchTotal).toEqual({ Food: 100, Wood: 550, Gold: 590, Stone: 0 });
    expect(byzRes.total).toEqual({ Food: 100, Wood: 1300, Gold: 1040, Stone: 0 });

    // 4) 反例：契丹 1372 精锐草原突骑 + t:1006、拜占庭 539 箭船 + t:909 均拒收
    const khiNeg = { ...emptyArmyCost('Khitans', '4'), rows: [{ unit: 1372, qty: '10' }], targets: ['t:1006'] };
    expect(armyResearchChoices(prodCtx, khiNeg, false, ARMY_RESEARCH)).not.toContain(1006);
    expect(evaluateArmyCost(prodCtx, khiNeg, ARMY_RESEARCH).ledger.find((e) => e.id === 1006)?.status).toBe('invalid');

    const byzNeg = { ...emptyArmyCost('Byzantines', '4'), rows: [{ unit: 539, qty: '10' }], targets: ['t:909'] };
    expect(armyResearchChoices(prodCtx, byzNeg, false, ARMY_RESEARCH)).not.toContain(909);
    expect(evaluateArmyCost(prodCtx, byzNeg, ARMY_RESEARCH).ledger.find((e) => e.id === 909)?.status).toBe('invalid');
  });

  it('验收 3：PK 单兵三态闭环（1006 札甲 / 884 野战军 / 909 虹吸管 + 0% 准确度共存 / 1474 哥瑟砍单胶囊）与反例', () => {
    const opp = byId[567]!;
    const oppF = fighterFrom(opp, simulate(ctx, opp, 'Japanese', 4, presetUpTo(simTechs(ctx, opp, 'Japanese'), 4, 'Japanese'), new Set()));

    // 1) 契丹 1922（铁浮屠/辽刀兵，固有命中后持续伤害）+ 1006 札甲：不进 f/c，手动勾选叠加并 +450F/+300G/+40s，取消恢复，战斗数值不变
    const liao = byId[1922]!;
    const khiAvail = simTechs(ctx, liao, 'Khitans');
    expect(applicableUnmodeledTechIds(khiAvail, 1922, liao.combatAbility ?? 0, liao.chargeType ?? 0).has(1006)).toBe(true);
    const khiPreset = presetUpTo(khiAvail, 4, 'Khitans');
    expect(khiPreset.has(1006)).toBe(false);
    expect(presetUpTo(khiAvail, 3, 'Khitans').has(1006)).toBe(false);
    const khiChecked = new Set([...khiPreset, 1006]);
    const totBefore = researchTotals(khiPreset);
    const totAfter = researchTotals(khiChecked);
    expect((totAfter.cost.Food ?? 0) - (totBefore.cost.Food ?? 0)).toBe(450);
    expect((totAfter.cost.Gold ?? 0) - (totBefore.cost.Gold ?? 0)).toBe(300);
    expect(totAfter.time - totBefore.time).toBe(45);
    expect(detectUnitUnmodeled({ unit: liao, civ: 'Khitans', age: 4, selectedTechs: [...khiPreset].map((id) => techById[id]!) }).map((m) => m.pill)).toEqual([
      '命中后持续伤害',
    ]);
    const liaoWith1006 = detectUnitUnmodeled({ unit: liao, civ: 'Khitans', age: 4, selectedTechs: [...khiChecked].map((id) => techById[id]!) });
    expect(liaoWith1006.map((m) => m.pill)).toEqual(['命中后持续伤害', '近战伤害反弹 · 札甲']);
    expect(liaoWith1006[1]).toEqual({
      kind: 'damage-reflection',
      pill: '近战伤害反弹 · 札甲',
      detail: reflectionDetail('札甲'),
      techId: 1006,
      techEn: 'Lamellar Armor',
    });
    const sLiaoOff = simulate(ctx, liao, 'Khitans', 4, khiPreset, new Set());
    const sLiaoOn = simulate(ctx, liao, 'Khitans', 4, khiChecked, new Set());
    expect(sLiaoOn).toEqual(sLiaoOff);
    expect(oneVOneFight(fighterFrom(liao, sLiaoOn), oppF)).toEqual(oneVOneFight(fighterFrom(liao, sLiaoOff), oppF));
    expect(groupFight(fighterFrom(liao, sLiaoOn), 10, oppF, 10)).toEqual(groupFight(fighterFrom(liao, sLiaoOff), 10, oppF, 10));

    // 反例：契丹 1372 草原突骑 / 448 斥候骑兵不适用 1006
    for (const badUid of [1372, 448]) {
      const u = byId[badUid]!;
      expect(applicableUnmodeledTechIds(simTechs(ctx, u, 'Khitans'), badUid, u.combatAbility ?? 0, u.chargeType ?? 0).has(1006)).toBe(false);
      expect(detectUnitUnmodeled({ unit: u, civ: 'Khitans', age: 4, selectedTechs: [techById[1006]!] })).toEqual([]);
    }

    // 2) 罗马 1793（军团兵）+ 884 野战军：留在 f 预设（bt ×0.666667）且默认显示蓄力增伤胶囊，取消勾选后消失并恢复训练时间
    const leg = byId[1793]!;
    const romAvail = simTechs(ctx, leg, 'Romans');
    const romPreset = presetUpTo(romAvail, 4, 'Romans');
    expect(romPreset.has(884)).toBe(true);
    const legOn = detectUnitUnmodeled({ unit: leg, civ: 'Romans', age: 4, selectedTechs: [...romPreset].map((id) => techById[id]!) });
    expect(legOn).toEqual([
      {
        kind: 'charge',
        pill: '蓄力增伤攻击 · 野战军',
        detail: chargeBonusDetail('野战军'),
        techId: 884,
        techEn: 'Comitatenses',
      },
    ]);
    const romWithout884 = new Set([...romPreset].filter((id) => id !== 884));
    expect(detectUnitUnmodeled({ unit: leg, civ: 'Romans', age: 4, selectedTechs: [...romWithout884].map((id) => techById[id]!) })).toEqual([]);
    const sLegOn = simulate(ctx, leg, 'Romans', 4, romPreset, new Set());
    const sLegOff = simulate(ctx, leg, 'Romans', 4, romWithout884, new Set());
    expect(sLegOn.bt).toBeLessThan(sLegOff.bt);
    expect(applicableUnmodeledTechIds(simTechs(ctx, byId[4]!, 'Romans'), 4, 0, 0).has(884)).toBe(false);

    // 3) 拜占庭 532（快速喷火船）+ 909 虹吸管：经 simTechs 注入（大学常规科技，b=209），不进 f/c，勾选 +100F/+175G/+30s，与 0% 准确度并存
    const ffs = byId[532]!;
    expect(techById[909]!.b).toBe(209);
    expect(techById[909]!.type).not.toBe('UniqueTech');
    const byzAvail = simTechs(ctx, ffs, 'Byzantines');
    expect(byzAvail.some((x) => x.t.id === 909 && x.ef === null)).toBe(true);
    expect(applicableUnmodeledTechIds(byzAvail, 532, ffs.combatAbility ?? 0, ffs.chargeType ?? 0).has(909)).toBe(true);
    const byzPreset = presetUpTo(byzAvail, 4, 'Byzantines');
    expect(byzPreset.has(909)).toBe(false);
    expect(presetUpTo(byzAvail, 3, 'Byzantines').has(909)).toBe(false);
    const byzChecked = new Set([...byzPreset, 909]);
    const byzBefore = researchTotals(byzPreset);
    const byzAfter = researchTotals(byzChecked);
    expect((byzAfter.cost.Food ?? 0) - (byzBefore.cost.Food ?? 0)).toBe(100);
    expect((byzAfter.cost.Gold ?? 0) - (byzBefore.cost.Gold ?? 0)).toBe(175);
    expect(byzAfter.time - byzBefore.time).toBe(45);
    const sFfsOn = simulate(ctx, ffs, 'Byzantines', 4, byzChecked, new Set());
    expect(sFfsOn).toEqual(simulate(ctx, ffs, 'Byzantines', 4, byzPreset, new Set()));
    expect(fighterUsesAssumeHit(fighterFrom(ffs, sFfsOn))).toBe(true);
    expect(detectUnitUnmodeled({ unit: ffs, civ: 'Byzantines', age: 4, selectedTechs: [...byzChecked].map((id) => techById[id]!) })).toEqual([
      {
        kind: 'charge',
        pill: '充能远程攻击 · 虹吸管',
        detail: chargeRangedDetail('虹吸管'),
        techId: 909,
        techEn: 'Siphons',
      },
    ]);
    // 反例：日本 532（无虹吸管）与拜占庭 539（箭船）均不注入也不触发 909
    expect(simTechs(ctx, ffs, 'Japanese').some((x) => x.t.id === 909)).toBe(false);
    expect(simTechs(ctx, byId[539]!, 'Byzantines').some((x) => x.t.id === 909)).toBe(false);
    expect(detectUnitUnmodeled({ unit: byId[539]!, civ: 'Byzantines', age: 4, selectedTechs: [techById[909]!] })).toEqual([]);

    // 4) 瓦兰吉 2703 / 2704 + 1474 哥瑟砍：仅单枚「充能远程攻击 · 哥瑟砍」，无冗余「额外弹矢 · 哥瑟砍」
    for (const uid of [2703, 2704]) {
      const mechs = detectUnitUnmodeled({ unit: byId[uid]!, civ: 'Varangians', age: 4, selectedTechs: [techById[1474]!] });
      expect(mechs).toEqual([
        {
          kind: 'charge',
          pill: '充能远程攻击 · 哥瑟砍',
          detail: chargeRangedDetail('哥瑟砍'),
          techId: 1474,
          techEn: 'Gothikon',
        },
      ]);
      const markup = html(
        createElement(DuelUnmodeledNotes, {
          entries: [{ side: 'a', badge: 'A', unit: byId[uid]!, civ: 'Varangians', age: 4, selectedTechs: [techById[1474]!] }],
          vgSides: [],
        }),
      );
      expect(markup).toContain('充能远程攻击 · 哥瑟砍');
      expect(markup).not.toContain('额外弹矢 · 哥瑟砍');
    }
  });

  it('验收 4：URL 规范化、跨文明/跨单位裁剪（含 1948+997 保留）与外部升级比较严格拒收', () => {
    const sideData = { byId, techById, trees };
    const fallback = { uid: 569, civ: 'Franks', age: 4, ageSet: true, techs: 'f' as const, team: [] };

    // 非法跨文明/跨单位显式 ID 自动裁剪，同时外部 upgradePlan 仍严格拒收
    for (const [uid, civ, badTid] of [
      [358, 'Japanese', 1006],
      [1372, 'Khitans', 1006],
      [532, 'Japanese', 909],
      [539, 'Byzantines', 909],
      [359, 'Varangians', 1474],
      [2704, 'Byzantines', 1474],
      [539, 'Jurchens', 997],
      [1948, 'Chinese', 997],
      [4, 'Romans', 884],
    ] as const) {
      const rawSpec = { uid, civ, age: 4, ageSet: true, techs: [badTid] as number[], team: [] };
      const canon = canonicalizeDuelSide(CORE, rawSpec, fallback);
      expect(canon.techs, `canon ${uid}.${civ}.${badTid}`).toEqual([]);
      expect(upgradePlan(ctx, byId, canon).ok, `upgradePlan canon ${uid}.${civ}`).toBe(true);
      expect(upgradePlan(ctx, byId, rawSpec).ok, `strict upgradePlan ${uid}.${civ}.${badTid}`).toBe(false);

      const resolved = resolve(ctx, byId, rawSpec, uid);
      expect(isUnavail(resolved)).toBe(false);
      if (!isUnavail(resolved)) {
        expect(resolved.spec.techs).toEqual([]);
        expect(resolved.sel.has(badTid)).toBe(false);
      }

      const u = byId[uid]!;
      const avail = simTechs(ctx, u, civ);
      const costs = applicableTrainingTechs(ctx, u, civ, 4);
      expect(selectTrainingIds([badTid], avail, 4, costs, civ, uid, u.chargeType ?? 0).has(badTid)).toBe(false);
    }

    // 合法所属文明＋适用单位继续保留显式 ID（重点锁定 1948 楼船 + 997 霹雳炸弹在 baseChargeType > 0 下不被误裁）
    for (const [uid, civ, okTid] of [
      [1922, 'Khitans', 1006],
      [358, 'Khitans', 1006],
      [1793, 'Romans', 884],
      [532, 'Byzantines', 909],
      [2704, 'Varangians', 1474],
      [1948, 'Jurchens', 997],
    ] as const) {
      const u = byId[uid]!;
      const okSpec = { uid, civ, age: 4, ageSet: true, techs: [okTid] as number[], team: [] };
      expect(canonicalizeDuelSide(CORE, okSpec, fallback).techs, `canon ok ${uid}.${civ}.${okTid}`).toEqual([okTid]);
      expect(keepsScopedUnmodeledTech(techById[okTid], civ, uid, u.chargeType ?? 0), `keeps ${uid}.${civ}.${okTid}`).toBe(true);
      const r = resolve(ctx, byId, okSpec, uid);
      expect(isUnavail(r)).toBe(false);
      if (!isUnavail(r)) {
        expect(r.spec.techs).toEqual([okTid]);
        expect(r.sel.has(okTid)).toBe(true);
      }
      const avail = simTechs(ctx, u, civ);
      const costs = applicableTrainingTechs(ctx, u, civ, 4);
      expect(selectTrainingIds([okTid], avail, 4, costs, civ, uid, u.chargeType ?? 0).has(okTid)).toBe(true);
    }

    // 切文明与切单位裁剪
    const khiPike = { uid: 358, civ: 'Khitans', age: 4, ageSet: true, techs: [67, 1006] as number[], team: [] };
    expect(switchSideCiv(sideData, khiPike, byId[358]!, 'Japanese').techs).toEqual([67]);
    expect(switchSideUnit(techById, khiPike, 1372, byId[1372]!.chargeType ?? 0).techs).toEqual([67]);

    const byzFfs = { uid: 532, civ: 'Byzantines', age: 4, ageSet: true, techs: [909] as number[], team: [] };
    expect(switchSideCiv(sideData, byzFfs, byId[532]!, 'Japanese').techs).toEqual([]);
    expect(switchSideUnit(techById, byzFfs, 539, byId[539]!.chargeType ?? 0).techs).toEqual([]);

    const jurLou = { uid: 1948, civ: 'Jurchens', age: 4, ageSet: true, techs: [199, 997] as number[], team: [] };
    expect(switchSideUnit(techById, jurLou, 1948, byId[1948]!.chargeType ?? 0).techs).toEqual([199, 997]);
    expect(switchSideUnit(techById, jurLou, 539, byId[539]!.chargeType ?? 0).techs).toEqual([199]);
    expect(filterExplicitTechsForUnit([199, 997], techById, 1948, 'Jurchens', byId[1948]!.chargeType ?? 0)).toEqual([199, 997]);
  });

  it('验收 5：混编按行精准匹配与训练总价转出零误拦（199/200/201/377/884/909/997/1006/1474）', () => {
    const mixOf = (civ: string, techs: string[], uids: string[]) => ({
      civ,
      age: '4',
      techs,
      team: [] as string[],
      rows: uids.map((uid) => ({ uid, qty: '10' })),
    });
    // 1) 契丹 [1922, 1372] + 1006：仅 A1 命中札甲
    const khiMix = resolveMixedSide(ctx, CORE, mixOf('Khitans', ['1006'], ['1922', '1372']), 'a');
    expect(khiMix.errors).toEqual([]);
    expect(khiMix.techs.find((o) => o.t.id === 1006)).toMatchObject({ numeric: false, rows: [0] });
    expect(khiMix.rows[0]!.resolved!.sel.has(1006)).toBe(true);
    expect(khiMix.rows[1]!.resolved!.sel.has(1006)).toBe(false);
    const khiUnm = collectDuelUnmodeled(
      khiMix.rows.map((r, i) => ({
        side: 'a' as const,
        badge: `A${i + 1}`,
        unit: r.resolved!.u,
        civ: 'Khitans',
        age: 4,
        selectedTechs: [...r.resolved!.sel].map((id) => techById[id]!),
      })),
    );
    expect(khiUnm.map((e) => [e.badge, e.unit.id, e.mechanisms.map((m) => m.pill)])).toEqual([['A1', 1922, ['命中后持续伤害', '近战伤害反弹 · 札甲']]]);
    expect(resolveMixedSide(ctx, CORE, mixOf('Khitans', ['1006'], ['1372']), 'a').errors.some((e) => e.field === 'mix-a-techs')).toBe(true);

    // 2) 拜占庭 [532, 539] + 909：仅 A1 命中虹吸管
    const byzMix = resolveMixedSide(ctx, CORE, mixOf('Byzantines', ['909'], ['532', '539']), 'a');
    expect(byzMix.errors).toEqual([]);
    expect(byzMix.techs.find((o) => o.t.id === 909)).toMatchObject({ numeric: false, rows: [0] });
    expect(byzMix.rows[0]!.resolved!.sel.has(909)).toBe(true);
    expect(byzMix.rows[1]!.resolved!.sel.has(909)).toBe(false);
    expect(resolveMixedSide(ctx, CORE, mixOf('Byzantines', ['909'], ['539']), 'a').errors.some((e) => e.field === 'mix-a-techs')).toBe(true);

    // 3) 女真 [1948, 539] + 199/200/201/377/997：仅 A1 保留霹雳炸弹且无重复科技充能胶囊
    const jurMix = resolveMixedSide(ctx, CORE, mixOf('Jurchens', ['199', '200', '201', '377', '997'], ['1948', '539']), 'a');
    expect(jurMix.errors).toEqual([]);
    expect(jurMix.techs.find((o) => o.t.id === 997)?.rows).toEqual([0]);
    expect(jurMix.rows[0]!.resolved!.sel.has(997)).toBe(true);
    expect(jurMix.rows[1]!.resolved!.sel.has(997)).toBe(false);

    // 4) 混编转出「训练总价」：全部 9 项科技零误拦
    for (const input of [
      mixOf('Khitans', ['1006'], ['1922']),
      mixOf('Romans', ['884'], ['1793']),
      mixOf('Byzantines', ['909'], ['532']),
      mixOf('Varangians', ['1474'], ['2704']),
      mixOf('Jurchens', ['199', '200', '201', '377', '997'], ['1948', '539']),
    ]) {
      const side = resolveMixedSide(ctx, CORE, input, 'a');
      expect(side.errors, `${input.civ} resolve`).toEqual([]);
      const transfer = mixedTrainingTransfer(prodCtx, input, 'a', side);
      expect('to' in transfer, `${input.civ} transfer: ${JSON.stringify(transfer)}`).toBe(true);
    }
  });

  it('验收 6：单位满科技对照（358/6/283/532/529/1103/2704 及单文明 1922/1793/1302）、PK 跳转与零内部字段泄漏', () => {
    // 1) 358 长枪兵 & 6 精锐掷矛手：契丹行含「近战伤害反弹 · 札甲」，跳转展开显式 ID 含 1006
    for (const [uid, oppCiv] of [
      [358, 'Japanese'],
      [6, 'Britons'],
    ] as const) {
      const rank = buildUnitCivRank(ctx, byId[uid]!, 4);
      const khiRow = rank.rows.find((r) => r.civ === 'Khitans')!;
      const oppRow = rank.rows.find((r) => r.civ === oppCiv)!;
      expect(khiRow.unmodeledPills, `unit ${uid}`).toContain('近战伤害反弹 · 札甲');
      expect(khiRow.selTechIds).not.toContain(1006);
      expect(khiRow.activeUnmodeledTechIds).toContain(1006);
      const href = buildCivRankDuelHref(uid, khiRow, oppRow, 4, rank.combatKind);
      const aParam = new URLSearchParams(href.split('?')[1]).get('a')!;
      expect(aParam).not.toContain('.f.');
      expect(aParam.split('.')[3]!.split('-').map(Number)).toContain(1006);
    }

    // 2) 283 重装骑士：罗马行含「蓄力增伤攻击 · 野战军」，884 在 f 预设内故跳转保持 .f.
    const cavRank = buildUnitCivRank(ctx, byId[283]!, 4);
    const romRow = cavRank.rows.find((r) => r.civ === 'Romans')!;
    const frkRow = cavRank.rows.find((r) => r.civ === 'Franks')!;
    expect(romRow.unmodeledPills).toContain('蓄力增伤攻击 · 野战军');
    expect(romRow.selTechIds).toContain(884);
    expect(new URLSearchParams(buildCivRankDuelHref(283, romRow, frkRow, 4, cavRank.combatKind).split('?')[1]).get('a')).toBe('283.Romans.4.f.');

    // 3) 532 快速喷火船（20/37）、529 喷火船（29/56）、1103 喷火箭船（29/56）：精确文明覆盖数与显式 909 跳转
    const rank532 = buildUnitCivRank(ctx, byId[532]!, 4);
    expect(rank532.totalCivCount).toBe(37);
    expect(rank532.rows.filter((r) => r.unmodeledPills.includes('充能远程攻击 · 虹吸管'))).toHaveLength(20);
    const byz532 = rank532.rows.find((r) => r.civ === 'Byzantines')!;
    const jpn532 = rank532.rows.find((r) => r.civ === 'Japanese')!;
    expect(byz532.unmodeledPills).toEqual(['充能远程攻击 · 虹吸管']);
    expect(jpn532.unmodeledPills).not.toContain('充能远程攻击 · 虹吸管');
    const a532 = new URLSearchParams(buildCivRankDuelHref(532, byz532, jpn532, 4, rank532.combatKind).split('?')[1]).get('a')!;
    expect(a532.split('.')[3]!.split('-').map(Number)).toContain(909);

    for (const uid of [529, 1103]) {
      const rank = buildUnitCivRank(ctx, byId[uid]!, 4);
      expect(rank.totalCivCount).toBe(56);
      expect(rank.rows.filter((r) => r.unmodeledPills.includes('充能远程攻击 · 虹吸管'))).toHaveLength(29);
    }

    // 4) 2704 精锐瓦兰吉卫队：瓦兰吉人行「充能远程攻击 · 哥瑟砍」，无「额外弹矢 · 哥瑟砍」
    const vgRank = buildUnitCivRank(ctx, byId[2704]!, 4);
    const vgRow = vgRank.rows.find((r) => r.civ === 'Varangians')!;
    expect(vgRow.unmodeledPills).toEqual(['充能远程攻击 · 哥瑟砍']);

    // 5) 单文明单位领域层精确保留行内标签
    for (const [uid, expectedPills] of [
      [1922, ['命中后持续伤害', '近战伤害反弹 · 札甲']],
      [1793, ['蓄力增伤攻击 · 野战军']],
      [1302, ['充能远程攻击 · 虹吸管']],
    ] as const) {
      const rank = buildUnitCivRank(ctx, byId[uid]!, 4);
      expect(rank.totalCivCount).toBe(1);
      expect(rank.rows[0]!.unmodeledPills).toEqual(expectedPills);
    }

    // 6) CivRankMechTag 语义分段
    for (const label of ['未计入：近战伤害反弹 · 札甲', '未计入：蓄力增伤攻击 · 野战军', '未计入：充能远程攻击 · 虹吸管', '未计入：充能远程攻击 · 哥瑟砍']) {
      const segs = splitMechTagSegments(label);
      expect(segs.some((s) => s.text.startsWith('·'))).toBe(false);
      const rendered = html(createElement(CivRankMechTag, { text: label }));
      expect(rendered.replace(/<[^>]+>/g, '')).toBe(label);
    }

    // 7) 零内部字段泄漏
    const forbidden = /a:(?:59|60|61|62|118)|C=(?:59|60|61|62|118)|MaxCharge|RechargeRate|ChargeEvent|ChargeType|DamageReflection/i;
    const sampleTechs: Tech[] = [techById[1006]!, techById[884]!, techById[909]!, techById[1474]!, techById[997]!];
    for (const u of units as Unit[]) {
      const mechs = detectUnitUnmodeled({ unit: u, civ: u.civs[0]!, age: 4, selectedTechs: sampleTechs });
      for (const m of mechs) {
        expect(forbidden.test(m.pill), `pill leak ${u.id}: ${m.pill}`).toBe(false);
        expect(forbidden.test(m.detail), `detail leak ${u.id}: ${m.detail}`).toBe(false);
      }
    }
  });
});
