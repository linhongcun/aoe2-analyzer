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

    // 4. 级联裁剪（删科技 -> 行失效 -> 依赖该行隐式形态的科技失效 -> 恢复原合法行）：锁定删行后重检科技前置、删科技后恢复 startRowIds 及非法行前置防护
    //    34.pre=608 且 34 < 608；492 隐式形态 237 满足 608 并加 4 攻；所有合法态容量恒 15、492 火力恒 5，无论手选或免费 233 均须返回 []
    const cascadeCtx = patchPrereqs({ 233: 199, 34: 608 });
    const cascadeData = cloneBaseData();
    cascadeData.unitUpgradeTechs = { 492: [237] };
    cascadeData.civs.Britons!.automatic = [mkRule(99003, [ef(492, 'attack', 'add', 4)], [237])];
    cascadeData.techs = {
      34: mkRule(34, [ef(109, 'capacity', 'set', 0)]),
      47: mkRule(47),
      199: mkRule(199),
      233: mkRule(233),
      608: mkRule(608, [ef(109, 'capacity', 'set', 15)]),
    };
    cascadeData.conditional = [mkRule(199, [], [47]), mkRule(608, [], [237]), mkRule(99004, [ef(109, 'capacity', 'set', 15)], [233, 199])];
    expect(idsOf(cascadeCtx, cascadeData)).toEqual([]);
    const freeCascadeData = structuredClone(cascadeData);
    freeCascadeData.civs.Britons!.free = [233];
    expect(idsOf(cascadeCtx, freeCascadeData)).toEqual([]);
    // 同结构若条件规则 99005 在 [34,233,199,237] 下改动 492 攻击（火力 5 -> 7），则合法态存在真实火力变化，全部参与科技均须保留
    const cascadePosData = structuredClone(cascadeData);
    cascadePosData.conditional.push(mkRule(99005, [ef(492, 'attack', 'add', 4)], [34, 233, 199, 237]));
    expect(idsOf(cascadeCtx, cascadePosData)).toEqual([34, 47, 199, 233, 608]);
    const casRes = calculateGeneralGarrison(cascadeCtx, cascadeCtx.core.buildingById[109]!, cfg('Britons', 4, [34, 47, 233], rows), cascadePosData);
    expect(casRes.errors).toEqual([]);
    expect([casRes.capacity, casRes.garrisonPower]).toEqual([15, 7]);
  });

  it('R14 回归：同属性 type=60 隐式形态全加法/全乘法仍按行序排列（覆盖手选与免费触发）', () => {
    const tc = ctx.core.buildingById[109]!;
    const idsOf = (d: GeneralGarrisonData) =>
      getGarrisonTechs(ctx, tc, cfg('Britons', 4), d)
        .map((t) => t.id)
        .sort((a, z) => a - z);
    const makeFloatOrderData = (baseAttack: number, op: 'add' | 'mul', v1: number, v2: number) => {
      const data = cloneBaseData();
      data.unitUpgradeTechs = { 83: [199], 492: [233] };
      data.civs.Britons!.baseOverrides = {
        ...data.civs.Britons!.baseOverrides,
        142: { type: 60, attack: baseAttack, reload: 2, projectile: 54, secondaryProjectile: -1 },
      };
      data.techs = {
        47: mkRule(47),
        199: mkRule(199, [ef(109, 'attack', op, v1)]),
        233: mkRule(233, [ef(109, 'attack', op, v2)]),
      };
      data.conditional = [mkRule(99010, [ef(109, 'attack', 'set', 0)], [47, 199, 233])];
      return data;
    };

    // 1. R14 P1（全 add 浮点非结合）：(1 + 0.2) - 1.2 = 0 vs (1 - 1.2) + 0.2 = 5.55e-17 > 0，反序 [492,83] 下 47 使模式 arrows -> shelter
    const addData = makeFloatOrderData(1, 'add', 0.2, -1.2);
    expect(idsOf(addData)).toEqual([47]);
    expect(toggleGeneralGarrisonTech(ctx, tc, cfg('Britons', 4, []), 47, addData)).toEqual([47]);
    const rowsFwd: GeneralGarrisonConfig['rows'] = [
      { unitId: 83, count: '0', entry: 'enter' },
      { unitId: 492, count: '0', entry: 'enter' },
    ];
    const rowsRev: GeneralGarrisonConfig['rows'] = [
      { unitId: 492, count: '0', entry: 'enter' },
      { unitId: 83, count: '0', entry: 'enter' },
    ];
    expect(calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [], rowsFwd), addData).mode).toBe('shelter');
    const revBefore = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [], rowsRev), addData);
    const revAfter = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [47], rowsRev), addData);
    expect([revBefore.errors, revBefore.mode, revBefore.totalProjectiles]).toEqual([[], 'arrows', 1]);
    expect([revAfter.errors, revAfter.mode, revAfter.totalProjectiles]).toEqual([[], 'shelter', 0]);

    // 2. R14 P1（Part 3C 免费触发）：47 ∈ civ.free 同样因反序 [492,83] 实际生效而被保留
    const freeAddData = structuredClone(addData);
    freeAddData.civs.Britons!.free = [47];
    expect(idsOf(freeAddData)).toEqual([47]);
    const freeAfter = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [], rowsRev), freeAddData);
    expect([freeAfter.errors, freeAfter.selected, freeAfter.mode]).toEqual([[], [47], 'shelter']);

    // 3. 同源全 mul 浮点下溢非结合：(1e-320 * 1e-5) * 1e5 = 0（正序为 shelter）vs (1e-320 * 1e5) * 1e-5 = 1e-320 > 0（仅反序为 arrows）
    const mulData = makeFloatOrderData(1e-320, 'mul', 1e-5, 1e5);
    expect(idsOf(mulData)).toEqual([47]);
    expect(calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [], rowsFwd), mulData).mode).toBe('shelter');
    const mulRevBefore = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [], rowsRev), mulData);
    const mulRevAfter = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [47], rowsRev), mulData);
    expect([mulRevBefore.errors, mulRevBefore.mode, mulRevBefore.totalProjectiles]).toEqual([[], 'arrows', 1]);
    expect([mulRevAfter.errors, mulRevAfter.mode, mulRevAfter.totalProjectiles]).toEqual([[], 'shelter', 0]);
  });

  it('R15 & Devin Review 回归：科技解除或触发隐式形态自阻塞驻军行时，手选与免费路径均准确保留', () => {
    const tc = ctx.core.buildingById[109]!;
    const row492: GeneralGarrisonConfig['rows'] = [{ unitId: 492, count: '1', entry: 'enter' }];
    const idsOf = (d: GeneralGarrisonData) =>
      getGarrisonTechs(ctx, tc, cfg('Britons', 4), d)
        .map((t) => t.id)
        .sort((a, z) => a - z);

    // 1. Devin PRRT_kwDOVDI1mM67z4Rs & R15 P1（手选解除自阻塞）：492 隐式形态 237 清零容量，[237,47] 恢复容量 15
    const unblockData = cloneBaseData();
    unblockData.unitUpgradeTechs = { 492: [237] };
    unblockData.techs = { 47: mkRule(47) };
    unblockData.conditional = [mkRule(99020, [ef(109, 'capacity', 'set', 0)], [237]), mkRule(99021, [ef(109, 'capacity', 'set', 15)], [237, 47])];
    expect(idsOf(unblockData)).toEqual([47]);
    expect(toggleGeneralGarrisonTech(ctx, tc, cfg('Britons', 4, []), 47, unblockData)).toEqual([47]);
    expect(calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [], row492), unblockData).errors.length).toBeGreaterThan(0);
    const ubOk = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [47], row492), unblockData);
    expect([ubOk.errors, ubOk.capacity]).toEqual([[], 15]);

    // 2. R15 P1（Part 3C 免费解除自阻塞）：47 ∈ civ.free 同理保留 [47] 且无报错
    const freeUnblockData = structuredClone(unblockData);
    freeUnblockData.civs.Britons!.free = [47];
    expect(idsOf(freeUnblockData)).toEqual([47]);
    const fubOk = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [], row492), freeUnblockData);
    expect([fubOk.errors, fubOk.selected, fubOk.capacity]).toEqual([[], [47], 15]);

    // 3. 镜像（Part 3C 免费自阻塞）：47 ∈ civ.free 仅在 492 形态 237 出现时把容量清零，使 492 无法入驻，仍保留 [47]
    const freeBlockData = cloneBaseData();
    freeBlockData.unitUpgradeTechs = { 492: [237] };
    freeBlockData.techs = { 47: mkRule(47) };
    freeBlockData.civs.Britons!.free = [47];
    freeBlockData.conditional = [mkRule(99022, [ef(109, 'capacity', 'set', 0)], [237, 47])];
    expect(idsOf(freeBlockData)).toEqual([47]);
    expect(calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [], row492), freeBlockData).errors.length).toBeGreaterThan(0);
  });

  it('R16 回归：正倍率下溢清零建筑攻击或单位火力后，手选恢复科技仍准确纳入筛选且计算通过', () => {
    const tc = ctx.core.buildingById[109]!;
    const row492: GeneralGarrisonConfig['rows'] = [{ unitId: 492, count: '1', entry: 'enter' }];
    const idsOf = (d: GeneralGarrisonData) =>
      getGarrisonTechs(ctx, tc, cfg('Britons', 4), d)
        .map((t) => t.id)
        .sort((a, z) => a - z);

    // 1. R16 P1（建筑攻击下溢恢复）：TC 攻击 1e-320，492 隐式形态 237 乘 1e-5 下溢为 0，手选 233 加回 1e-320 恢复 arrows / 2 发
    const bUnderflowData = cloneBaseData();
    bUnderflowData.unitUpgradeTechs = { 492: [237] };
    bUnderflowData.civs.Britons!.baseOverrides = {
      ...bUnderflowData.civs.Britons!.baseOverrides,
      142: { type: 60, attack: 1e-320, reload: 2, projectile: 54, secondaryProjectile: 54 },
    };
    bUnderflowData.techs = {
      237: mkRule(237, [ef(109, 'attack', 'mul', 1e-5)]),
      233: mkRule(233, [ef(109, 'attack', 'add', 1e-320)]),
    };
    expect(idsOf(bUnderflowData)).toEqual([233]);
    expect(toggleGeneralGarrisonTech(ctx, tc, cfg('Britons', 4, []), 233, bUnderflowData)).toEqual([233]);
    const buBefore = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [], row492), bUnderflowData);
    const buAfter = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [233], row492), bUnderflowData);
    expect([buBefore.errors, buBefore.mode, buBefore.totalProjectiles]).toEqual([[], 'shelter', 0]);
    expect([buAfter.errors, buAfter.mode, buAfter.totalProjectiles]).toEqual([[], 'arrows', 2]);

    // 2. 同源单位火力下溢恢复：492 火力系数 1e-320 被形态 237 乘 1e-5 下溢为 0，手选 233 加回 1 恢复正火力
    const fpUnderflowData = cloneBaseData();
    fpUnderflowData.unitUpgradeTechs = { 492: [237] };
    fpUnderflowData.units[492] = { ...fpUnderflowData.units[492]!, type: 60, firepower: 1e-320 };
    fpUnderflowData.techs = {
      237: mkRule(237, [ef(492, 'firepower', 'mul', 1e-5)]),
      233: mkRule(233, [ef(492, 'firepower', 'add', 1)]),
    };
    expect(idsOf(fpUnderflowData)).toEqual([233]);
    const fpuBefore = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [], row492), fpUnderflowData);
    const fpuAfter = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [233], row492), fpUnderflowData);
    expect([fpuBefore.errors, fpuBefore.garrisonPower]).toEqual([[], 0]);
    expect(fpuAfter.errors).toEqual([]);
    expect(fpuAfter.garrisonPower).toBeCloseTo(3, 5);
  });
});
