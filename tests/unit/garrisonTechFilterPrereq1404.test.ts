import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import {
  calculateGeneralGarrison,
  GENERAL_GARRISON_DATA,
  getGarrisonTechs,
  toggleGeneralGarrisonTech,
  type GeneralGarrisonConfig,
  type GeneralGarrisonContext,
  type GeneralGarrisonData,
  type GeneralGarrisonEffect,
  type GeneralGarrisonRule,
} from '../../src/domain/garrisonGeneral';
import { GARRISON_TECH_DATA } from '../../src/domain/garrisonTechs';

let ctx: GeneralGarrisonContext;
beforeAll(async () => {
  ctx = { core: await loadCore(), trees: await loadTrees() };
});

const cfg = (civ: string, age = 4, techs: number[] = [], rows: GeneralGarrisonConfig['rows'] = []): GeneralGarrisonConfig => ({
  civ,
  age,
  techs,
  rows,
});
const ef = (unit: number, stat: GeneralGarrisonEffect['stat'], op: GeneralGarrisonEffect['op'], value: number): GeneralGarrisonEffect => ({
  unit,
  stat,
  op,
  value,
});
const mkRule = (id: number, effects: GeneralGarrisonEffect[] = [], requires: number[] = [], count = requires.length): GeneralGarrisonRule => ({
  id,
  requires,
  count,
  effects,
});

function patchPrereqs(overrides: Record<number, number>): GeneralGarrisonContext {
  const core = structuredClone(ctx.core);
  for (const [idStr, pre] of Object.entries(overrides)) {
    const id = Number(idStr);
    core.techById[id] = { ...core.techById[id]!, pre };
    core.techs[core.techs.findIndex((t) => t.id === id)] = core.techById[id]!;
  }
  return { core, trees: ctx.trees };
}

function cloneBaseData(): GeneralGarrisonData {
  const data = structuredClone({ ...GENERAL_GARRISON_DATA, unitUpgradeTechs: GARRISON_TECH_DATA.unitUpgradeTechs });
  data.civs.Britons!.automatic = [];
  data.civs.Britons!.free = [];
  data.conditional = [];
  data.units[492] = { ...data.units[492]!, attack: 6, reload: 2, total: 1, firepower: 1 };
  return data;
}

describe('Issue 1404: 条件规则满足前置与合法基线裁剪（R12/R13/Devin 回归）', () => {
  it('R12 回归：条件规则满足前置时保留手选/免费触发科技（含控制后继），无效果与已自动满足路径不误留', () => {
    const preCtx = patchPrereqs({ 233: 199 });
    const preTc = preCtx.core.buildingById[109]!;
    const rows = [{ unitId: 492, count: '1', entry: 'enter' as const }];
    const idsOf = (d: GeneralGarrisonData) =>
      getGarrisonTechs(preCtx, preTc, cfg('Britons', 4), d)
        .map((t) => t.id)
        .sort((a, z) => a - z);

    // 1. R12 P1 原例：47 -> cond(199) 满足 233.pre=199，199 清零容量；保留 [47,199,233]，[47,233] 合法且火力 3 -> 5
    const condPreData = cloneBaseData();
    condPreData.techs = {
      47: mkRule(47),
      199: mkRule(199, [ef(109, 'capacity', 'set', 0)]),
      233: mkRule(233, [ef(492, 'attack', 'add', 4)]),
    };
    condPreData.conditional = [mkRule(199, [], [47])];
    expect(idsOf(condPreData)).toEqual([47, 199, 233]);
    expect(toggleGeneralGarrisonTech(preCtx, preTc, cfg('Britons', 4, [47]), 233, condPreData)).toEqual([47, 233]);
    const condRes = calculateGeneralGarrison(preCtx, preTc, cfg('Britons', 4, [47, 233], rows), condPreData);
    expect(condRes.errors).toEqual([]);
    expect([condRes.capacity, condRes.garrisonPower]).toEqual([15, 5]);

    // 2. 控制后继（233 改容量 +2）与免费触发科技（47 ∈ civ.free）均保留 47
    const ctrlPostData = structuredClone(condPreData);
    ctrlPostData.techs[233] = mkRule(233, [ef(109, 'capacity', 'add', 2)]);
    expect(idsOf(ctrlPostData)).toEqual([47, 199, 233]);
    expect(calculateGeneralGarrison(preCtx, preTc, cfg('Britons', 4, [47, 233]), ctrlPostData).capacity).toBe(17);
    const freeCondData = structuredClone(condPreData);
    freeCondData.civs.Britons!.free = [47];
    expect(idsOf(freeCondData)).toEqual([47, 199, 233]);
    expect(calculateGeneralGarrison(preCtx, preTc, cfg('Britons', 4, [47, 233], rows), freeCondData).errors).toEqual([]);

    // 3. 反例不误留：492 火力为 0（仅 199 开启火力）或 199 已被自动规则无条件满足时，均排除 47
    const zeroFpData = structuredClone(condPreData);
    zeroFpData.units[492] = { ...zeroFpData.units[492]!, firepower: 0 };
    zeroFpData.techs[199] = mkRule(199, [ef(492, 'firepower', 'set', 1)]);
    expect(idsOf(zeroFpData)).toEqual([199, 233]);
    const autoKnownData = structuredClone(condPreData);
    autoKnownData.civs.Britons!.automatic = [mkRule(199)];
    expect(idsOf(autoKnownData)).toEqual([199, 233]);
  });

  it('R13 & Devin Review 回归：pruneToValidState 先删缺前置科技并重建快照后再测驻军行（手选、免费、零差与级联裁剪）', () => {
    const preCtx = patchPrereqs({ 233: 199 });
    const preTc = preCtx.core.buildingById[109]!;
    const rows = [{ unitId: 492, count: '1', entry: 'enter' as const }];
    const idsOf = (c: GeneralGarrisonContext, d: GeneralGarrisonData) =>
      getGarrisonTechs(c, c.core.buildingById[109]!, cfg('Britons', 4), d)
        .map((t) => t.id)
        .sort((a, z) => a - z);

    // 1. R13 P1（Part 3A 手选触发）：233 缺 199 时会暂时清零容量，先删 233 再测行保留 492（基线火力 5 vs [47,233] 火力 3），保留 47
    const pruneData = cloneBaseData();
    pruneData.unitUpgradeTechs = { 492: [237] };
    pruneData.techs = {
      47: mkRule(47),
      199: mkRule(199, [ef(492, 'attack', 'add', 6)]),
      233: mkRule(233, [ef(109, 'capacity', 'set', 0)]),
    };
    pruneData.civs.Britons!.automatic = [mkRule(99003, [ef(492, 'attack', 'add', 4)], [237])];
    pruneData.conditional = [
      mkRule(199, [], [47]),
      mkRule(99004, [ef(109, 'capacity', 'set', 15)], [233, 199]),
      mkRule(99005, [ef(492, 'attack', 'add', -4)], [233, 199, 237]),
    ];
    expect(idsOf(preCtx, pruneData)).toEqual([47, 199, 233]);
    const pBase = calculateGeneralGarrison(preCtx, preTc, cfg('Britons', 4, [], rows), pruneData);
    const pWith = calculateGeneralGarrison(preCtx, preTc, cfg('Britons', 4, [47, 233], rows), pruneData);
    expect(pBase.errors).toEqual([]);
    expect(pWith.errors).toEqual([]);
    expect([pBase.garrisonPower, pWith.capacity, pWith.garrisonPower]).toEqual([5, 15, 3]);

    // 2. R13 P1（Part 3C 免费触发）：47 ∈ civ.free 同理先删缺前置的 233 再测行，不漏判免费触发科技 47
    const freePruneData = cloneBaseData();
    Object.assign(freePruneData, structuredClone(pruneData));
    freePruneData.civs.Britons!.free = [47];
    expect(idsOf(preCtx, freePruneData)).toEqual([47, 199, 233]);
    const fpWith = calculateGeneralGarrison(preCtx, preTc, cfg('Britons', 4, [233], rows), freePruneData);
    expect(fpWith.errors).toEqual([]);
    expect([fpWith.capacity, fpWith.garrisonPower]).toEqual([15, 3]);

    // 3. R13 P2 / Devin Review PRRT_kwDOVDI1mM67ySkr（零差反例）：移除 199 效果与 99005 后所有合法态火力恒为 5，不因误删行而误留 [47,199]
    const falsePosData = structuredClone(pruneData);
    falsePosData.techs[199] = mkRule(199);
    falsePosData.conditional.pop();
    expect(idsOf(preCtx, falsePosData)).toEqual([]);

    // 4. 级联裁剪（删科技 -> 行失效 -> 依赖该行隐式形态的科技失效）：基线容量 0，233 开启容量 15 且 492 隐式形态 237 满足 608.pre=34
    const cascadeCtx = patchPrereqs({ 233: 199, 608: 34 });
    const cascadeData = cloneBaseData();
    const tcForms = [109, ...(cascadeData.buildings[109]?.eraForms ?? [])];
    for (const form of tcForms) cascadeData.units[form] = { ...cascadeData.units[form]!, capacity: 0 };
    cascadeData.unitUpgradeTechs = { 492: [237] };
    cascadeData.techs = {
      34: mkRule(34),
      47: mkRule(47),
      199: mkRule(199),
      233: mkRule(233, [ef(109, 'capacity', 'set', 15)]),
      608: mkRule(608, [ef(492, 'attack', 'add', 4)]),
    };
    cascadeData.conditional = [mkRule(199, [], [47]), mkRule(34, [], [237])];
    expect(idsOf(cascadeCtx, cascadeData)).toEqual([34, 47, 199, 233, 608]);
    const casRes = calculateGeneralGarrison(cascadeCtx, cascadeCtx.core.buildingById[109]!, cfg('Britons', 4, [47, 233, 608], rows), cascadeData);
    expect(casRes.errors).toEqual([]);
    expect([casRes.capacity, casRes.garrisonPower]).toEqual([15, 5]);
  });
});
