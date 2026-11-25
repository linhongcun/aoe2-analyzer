import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import {
  calculateGeneralGarrison,
  GENERAL_GARRISON_DATA,
  getGarrisonCandidates,
  getGarrisonTechs,
  type GeneralGarrisonConfig,
  type GeneralGarrisonContext,
  type GeneralGarrisonData,
  type GeneralGarrisonEffect,
  type GeneralGarrisonRule,
} from '../../src/domain/garrisonGeneral';
import { GARRISON_TECH_DATA } from '../../src/domain/garrisonTechs';
import { civStatus } from '../../src/domain/simulator';

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
const rule = (id: number, effects: GeneralGarrisonEffect[] = [], requires: number[] = [], count = requires.length): GeneralGarrisonRule => ({
  id,
  effects,
  requires,
  count,
});
const ef = (unit: number, stat: GeneralGarrisonEffect['stat'], op: GeneralGarrisonEffect['op'], value: number): GeneralGarrisonEffect => ({
  unit,
  stat,
  op,
  value,
});

function cloneIsolated(keepIds: number[]): GeneralGarrisonData {
  const data: GeneralGarrisonData = structuredClone({ ...GENERAL_GARRISON_DATA, unitUpgradeTechs: GARRISON_TECH_DATA.unitUpgradeTechs });
  data.techs = Object.fromEntries(keepIds.map((id) => [id, rule(id)]));
  data.civs.Britons!.automatic = [];
  data.civs.Britons!.free = [];
  data.conditional = [];
  return data;
}

function patchPrereq(id: number, pre: number): GeneralGarrisonContext {
  const core = structuredClone(ctx.core);
  core.techById[id] = { ...core.techById[id]!, pre };
  const idx = core.techs.findIndex((t) => t.id === id);
  core.techs[idx] = core.techById[id]!;
  return { core, trees: ctx.trees };
}

function independentBritonsIds(limit: number, exclude: number[]): number[] {
  const status = civStatus(ctx.trees, 'Britons');
  const shape = new Set(Object.values(GARRISON_TECH_DATA.unitUpgradeTechs ?? {}).flat());
  const skip = new Set([...exclude, ...GENERAL_GARRISON_DATA.civs.Britons!.disabled]);
  return ctx.core.techs
    .filter((t) => !t.pre && !shape.has(t.id) && !skip.has(t.id) && t.civs.includes('Britons') && status['t' + t.id] === 1)
    .map((t) => t.id)
    .sort((a, b) => a - b)
    .slice(0, limit);
}

describe('Issue 1404: R6 与 Devin Review 改序/形态预算/同伴协同/精确快路径回归', () => {
  it('R6 P1-1 & 附带基础免费条件规则：Stage 2 产生形态的 Stage 0 提前改序与基础免费触发条件规则均保留', () => {
    const tc = ctx.core.buildingById[109]!;

    // 1. Stage 2 无条件提供形态 237，Stage 0 自动规则在获知 237 时把容量设为 15，科技 233 容量 +2；
    //    放入劲弩手 492 后 237 在 Stage 0 之前即已知，容量 15 -> 17，233 必须保留
    const stage0ShapeData = cloneIsolated([233]);
    stage0ShapeData.techs[233] = rule(233, [ef(109, 'capacity', 'add', 2)]);
    stage0ShapeData.civs.Britons!.automatic.push(rule(99500, [ef(109, 'capacity', 'set', 15)], [237], 1));
    stage0ShapeData.conditional.push(rule(237));
    expect(getGarrisonTechs(ctx, tc, cfg('Britons', 4), stage0ShapeData).map((t) => t.id)).toContain(233);
    const res = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [233], [{ unitId: 492, count: '1', entry: 'enter' }]), stage0ShapeData);
    expect(res.errors).toEqual([]);
    expect(res.capacity).toBe(17);

    // 2. 基础免费科技 233（自身无直接效果）在 Stage 2 触发增容条件规则 -> 不被 knownBeforeStage2 漏滤，必须保留
    const freeCondData = cloneIsolated([233]);
    freeCondData.civs.Britons!.free.push(233);
    freeCondData.conditional.push(rule(99501, [ef(109, 'capacity', 'add', 2)], [233], 1));
    expect(getGarrisonTechs(ctx, tc, cfg('Britons', 4), freeCondData).map((t) => t.id)).toContain(233);
  });

  it('R6 P1-2：7 个形态组在统一状态预算内精确找到双行组合，11 个形态组超限时走保守回退不漏判', () => {
    const tc = ctx.core.buildingById[109]!;
    const baseData = cloneIsolated([233]);
    const enterable = getGarrisonCandidates(ctx, tc, cfg('Britons', 4), baseData)
      .filter((u) => u.canEnter)
      .map((u) => u.id);
    expect(enterable.length).toBeGreaterThanOrEqual(11);

    // 7 组精确求解
    const sevenData = cloneIsolated([233]);
    const rowIds7 = enterable.slice(0, 7);
    const shapes7 = rowIds7.map((_, i) => 98001 + i);
    sevenData.unitUpgradeTechs = Object.fromEntries(rowIds7.map((u, i) => [u, [shapes7[i]!]]));
    sevenData.conditional.push(
      rule(99502, [ef(109, 'capacity', 'add', 2)], [shapes7[0]!, shapes7[1]!, 233]),
      rule(99503, [ef(109, 'capacity', 'set', 0)], shapes7),
    );
    expect(getGarrisonTechs(ctx, tc, cfg('Britons', 4), sevenData).map((t) => t.id)).toContain(233);
    const rows2 = rowIds7.slice(0, 2).map((unitId) => ({ unitId, count: '1', entry: 'enter' as const }));
    const sevenRes = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [233], rows2), sevenData);
    expect(sevenRes.errors).toEqual([]);
    expect(sevenRes.capacity).toBe(17);

    // 11 组超上限走保守回退，不拒绝合法组合
    const elevenData = cloneIsolated([233]);
    const rowIds11 = enterable.slice(0, 11);
    const shapes11 = rowIds11.map((_, i) => 98101 + i);
    elevenData.unitUpgradeTechs = Object.fromEntries(rowIds11.map((u, i) => [u, [shapes11[i]!]]));
    elevenData.conditional.push(
      rule(99504, [ef(109, 'capacity', 'add', 2)], [shapes11[0]!, shapes11[1]!, 233]),
      rule(99505, [ef(109, 'capacity', 'set', 0)], shapes11),
    );
    expect(getGarrisonTechs(ctx, tc, cfg('Britons', 4), elevenData).map((t) => t.id)).toContain(233);
    const elevenRes = calculateGeneralGarrison(
      ctx,
      tc,
      cfg(
        'Britons',
        4,
        [233],
        rowIds11.slice(0, 2).map((unitId) => ({ unitId, count: '1', entry: 'enter' as const })),
      ),
      elevenData,
    );
    expect(elevenRes.errors).toEqual([]);
    expect(elevenRes.capacity).toBe(17);
  });

  it('R6 P1-3 & Devin #2：5/7 个同伴协同与多步减攻击间隔组合不漏判', () => {
    const tc = ctx.core.buildingById[109]!;
    const peers5 = independentBritonsIds(5, [233]);
    expect(peers5).toHaveLength(5);
    const [a, b, ...decoys5] = peers5;

    // 1. R6 P1-3: 5 个攻击同伴，仅 [a, b] 打破主副抵消使 233 减半 reload 生效（1.6 -> 3.2）
    const p5Data = cloneIsolated([...peers5, 233]);
    p5Data.units[492] = { ...p5Data.units[492]!, attack: -4, reload: 2, total: 2, secondaryProjectile: 1930, firepower: 1 };
    p5Data.units[1930] = { ...p5Data.units[1930]!, attack: 5 };
    p5Data.techs[a!] = rule(a!, [ef(492, 'attack', 'set', 0), ef(1930, 'attack', 'set', 0)]);
    p5Data.techs[b!] = rule(b!, [ef(492, 'attack', 'mul', 2), ef(1930, 'attack', 'add', 5)]);
    for (const id of decoys5) p5Data.techs[id] = rule(id, [ef(492, 'attack', 'set', -4), ef(1930, 'attack', 'set', 5)]);
    p5Data.techs[233] = rule(233, [ef(492, 'reload', 'mul', 0.5)]);
    p5Data.conditional.push(rule(99510, [ef(492, 'reload', 'mul', 1.25)]));
    expect(getGarrisonTechs(ctx, tc, cfg('Britons', 4), p5Data).map((t) => t.id)).toContain(233);
    const p5Before = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [a!, b!], [{ unitId: 492, count: '1', entry: 'enter' }]), p5Data);
    const p5After = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [a!, b!, 233], [{ unitId: 492, count: '1', entry: 'enter' }]), p5Data);
    expect(p5After.errors).toEqual([]);
    expect(p5Before.rows[0]!.powerEach).toBeCloseTo(1.6, 5);
    expect(p5After.rows[0]!.powerEach).toBeCloseTo(3.2, 5);

    // 2. 7 个攻击同伴超 MAX_EXACT_PEER_SUBSETS(6) 时走保守回退，仍保留 233
    const peers7 = independentBritonsIds(7, [233]);
    expect(peers7).toHaveLength(7);
    const p7Data = cloneIsolated([...peers7, 233]);
    p7Data.units[492] = { ...p7Data.units[492]!, attack: -4, reload: 2, total: 2, secondaryProjectile: 1930, firepower: 1 };
    p7Data.units[1930] = { ...p7Data.units[1930]!, attack: 5 };
    p7Data.techs[peers7[0]!] = rule(peers7[0]!, [ef(492, 'attack', 'set', 0), ef(1930, 'attack', 'set', 0)]);
    p7Data.techs[peers7[1]!] = rule(peers7[1]!, [ef(492, 'attack', 'mul', 2), ef(1930, 'attack', 'add', 5)]);
    for (const id of peers7.slice(2)) p7Data.techs[id] = rule(id, [ef(492, 'attack', 'set', -4), ef(1930, 'attack', 'set', 5)]);
    p7Data.techs[233] = rule(233, [ef(492, 'reload', 'mul', 0.5)]);
    expect(getGarrisonTechs(ctx, tc, cfg('Britons', 4), p7Data).map((t) => t.id)).toContain(233);

    // 3. Devin #2: 0 攻单位 reload=3，233 与两个同伴各 -1s、三个同伴各 +1s -> 联合减间隔可使 reload 归零，233 必须保留
    const relPeers = independentBritonsIds(5, [233]);
    const relData = cloneIsolated([...relPeers, 233]);
    relData.units[492] = { ...relData.units[492]!, attack: 0, reload: 3, total: 1, firepower: 1 };
    for (const id of relPeers.slice(0, 2)) relData.techs[id] = rule(id, [ef(492, 'reload', 'add', -1)]);
    for (const id of relPeers.slice(2)) relData.techs[id] = rule(id, [ef(492, 'reload', 'add', 1)]);
    relData.techs[233] = rule(233, [ef(492, 'reload', 'add', -1)]);
    expect(getGarrisonTechs(ctx, tc, cfg('Britons', 4), relData).map((t) => t.id)).toContain(233);
    const relBefore = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, relPeers.slice(0, 2), [{ unitId: 492, count: '1', entry: 'enter' }]), relData);
    const relAfter = calculateGeneralGarrison(
      ctx,
      tc,
      cfg('Britons', 4, [...relPeers.slice(0, 2), 233], [{ unitId: 492, count: '1', entry: 'enter' }]),
      relData,
    );
    expect(relAfter.errors).toEqual([]);
    expect(relBefore.rows[0]!.powerEach).toBe(0);
    expect(relAfter.rows[0]!.powerEach).toBeNull();
  });

  it('Devin #1：火力符号翻转在基础攻下等值，但受攻击乘数或无效 reload 下归零攻影响时保留', () => {
    const tc = ctx.core.buildingById[109]!;

    // 1. 攻击乘数打破等值：attack=4, reload=2, fp=+2 -> -2 基础均为 4；独立科技 attack*2 后变为 8 vs 6
    const mulData = cloneIsolated([199, 233]);
    mulData.units[492] = { ...mulData.units[492]!, attack: 4, reload: 2, total: 1, firepower: 2 };
    mulData.techs[199] = rule(199, [ef(492, 'attack', 'mul', 2)]);
    mulData.techs[233] = rule(233, [ef(492, 'firepower', 'set', -2)]);
    expect(getGarrisonTechs(ctx, tc, cfg('Britons', 4), mulData).map((t) => t.id)).toEqual(expect.arrayContaining([199, 233]));
    const mulBefore = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [199], [{ unitId: 492, count: '1', entry: 'enter' }]), mulData);
    const mulAfter = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [199, 233], [{ unitId: 492, count: '1', entry: 'enter' }]), mulData);
    expect(mulAfter.errors).toEqual([]);
    expect(mulBefore.rows[0]!.powerEach).toBeCloseTo(8, 5);
    expect(mulAfter.rows[0]!.powerEach).toBeCloseTo(6, 5);

    // 2. 无效 reload 下独立科技把 attack 设为 0：fp=+2 仍为 null，fp=-2 变为固定火力 2
    const zeroAtkData = cloneIsolated([199, 233]);
    zeroAtkData.units[492] = { ...zeroAtkData.units[492]!, attack: 4, reload: -2, total: 1, firepower: 2 };
    zeroAtkData.techs[199] = rule(199, [ef(492, 'attack', 'set', 0)]);
    zeroAtkData.techs[233] = rule(233, [ef(492, 'firepower', 'set', -2)]);
    expect(getGarrisonTechs(ctx, tc, cfg('Britons', 4), zeroAtkData).map((t) => t.id)).toEqual(expect.arrayContaining([199, 233]));
    const zeroBefore = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [199], [{ unitId: 492, count: '1', entry: 'enter' }]), zeroAtkData);
    const zeroAfter = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [199, 233], [{ unitId: 492, count: '1', entry: 'enter' }]), zeroAtkData);
    expect(zeroAfter.errors).toEqual([]);
    expect(zeroBefore.rows[0]!.powerEach).toBeNull();
    expect(zeroAfter.rows[0]!.powerEach).toBeCloseTo(2, 5);
  });

  it('R6 P2-1/P2-2/P2-3：后续控制覆写、同科技比例抵消、无效 reload 依赖攻击与主副抵消潜在协同均不误留', () => {
    const tc = ctx.core.buildingById[109]!;

    // 1. R6 P2-1a: 233.pre = 608，608 增容并设 attack=7（ID > 233 覆盖 233 的 attack+3）-> 排除 233
    const laterCtrlCtx = patchPrereq(233, 608);
    const laterCtrlData = cloneIsolated([233, 608]);
    laterCtrlData.techs[233] = rule(233, [ef(492, 'attack', 'add', 3)]);
    laterCtrlData.techs[608] = rule(608, [ef(109, 'capacity', 'add', 1), ef(492, 'attack', 'set', 7)]);
    const laterCtrlIds = getGarrisonTechs(laterCtrlCtx, laterCtrlCtx.core.buildingById[109]!, cfg('Britons', 4), laterCtrlData).map((t) => t.id);
    expect(laterCtrlIds).toContain(608);
    expect(laterCtrlIds).not.toContain(233);

    // 2. R6 P2-1b: 同一科技同时把 firepower*2 与 reload*2（火力恒定）-> 排除
    const cancelData = cloneIsolated([233]);
    cancelData.units[492] = { ...cancelData.units[492]!, attack: 4, reload: 2, firepower: 1, total: 1 };
    cancelData.techs[233] = rule(233, [ef(492, 'firepower', 'mul', 2), ef(492, 'reload', 'mul', 2)]);
    expect(getGarrisonTechs(ctx, tc, cfg('Britons', 4), cancelData).map((t) => t.id)).not.toContain(233);

    // 3. R6 P2-2: 608.pre = 233，233 把 reload 乘 -1 使火力失效，608 加攻无变化 -> 保留 233、排除 608
    const invRelCtx = patchPrereq(608, 233);
    const invRelData = cloneIsolated([233, 608]);
    invRelData.units[492] = { ...invRelData.units[492]!, firepower: 1, reload: 2 };
    invRelData.techs[233] = rule(233, [ef(492, 'reload', 'mul', -1)]);
    invRelData.techs[608] = rule(608, [ef(492, 'attack', 'add', 3)]);
    const invRelIds = getGarrisonTechs(invRelCtx, invRelCtx.core.buildingById[109]!, cfg('Britons', 4), invRelData).map((t) => t.id);
    expect(invRelIds).toContain(233);
    expect(invRelIds).not.toContain(608);

    // 4. R6 P2-3: 同伴主攻 +4 与副攻 -5 折算为 4 + 0.8*(-5) = 0，无论 233 属纯数值或控制类（经条件规则进入 controlSet），改 reload 前后均为 0 -> 均排除 233
    const netZeroData = cloneIsolated([13, 14, 233]);
    netZeroData.units[492] = { ...netZeroData.units[492]!, attack: 0, reload: 2, total: 2, secondaryProjectile: 1930, firepower: 1 };
    netZeroData.units[1930] = { ...netZeroData.units[1930]!, attack: 0 };
    netZeroData.techs[13] = rule(13, [ef(492, 'attack', 'add', 4), ef(1930, 'attack', 'add', -5)]);
    netZeroData.techs[233] = rule(233, [ef(492, 'reload', 'mul', 0.8)]);
    expect(getGarrisonTechs(ctx, tc, cfg('Britons', 4), netZeroData).map((t) => t.id)).not.toContain(233);
    const netZeroCtrlData = structuredClone(netZeroData);
    netZeroCtrlData.conditional.push(rule(99520, [ef(109, 'garrisonType', 'set', 11)], [233], 1));
    expect(getGarrisonTechs(ctx, tc, cfg('Britons', 4), netZeroCtrlData).map((t) => t.id)).not.toContain(233);
  });

  it('R7 与 Devin #1 回归：零值条件倍率、自动免费形态多弹丸、非交换形态行序、激活既有副弹丸与组合性能守卫', () => {
    const tc = ctx.core.buildingById[109]!;
    const tcForms = new Set([109, ...(GENERAL_GARRISON_DATA.buildings[109]?.eraForms ?? [])]);

    // 1. R7 P1-1: 492 基础攻 0，47 加 4 攻，233 触发 Stage 2 攻击翻倍 -> [47, 233] 火力 2 -> 4，保留 233
    const mulCondData = cloneIsolated([47, 233]);
    mulCondData.units[492] = { ...mulCondData.units[492]!, attack: 0, total: 1, reload: 2, firepower: 1 };
    mulCondData.techs[47] = rule(47, [ef(492, 'attack', 'add', 4)]);
    mulCondData.conditional.push(rule(99600, [ef(492, 'attack', 'mul', 2)], [233], 1));
    expect(getGarrisonTechs(ctx, tc, cfg('Britons', 4), mulCondData).map((t) => t.id)).toEqual(expect.arrayContaining([47, 233]));
    const mulCondRes = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [47, 233], [{ unitId: 492, count: '1', entry: 'enter' }]), mulCondData);
    expect(mulCondRes.errors).toEqual([]);
    expect(mulCondRes.garrisonPower).toBeCloseTo(4, 5);

    // 2. R7 P1-2: 自动免费形态 47 将 492 total 设为 2，233 给副弹丸 54 加 4 攻 -> 火力 2.5 -> 4.1，保留 233
    const freeShapeData = cloneIsolated([47, 233]);
    freeShapeData.units[492] = { ...freeShapeData.units[492]!, attack: 1, total: 1, reload: 2, firepower: 1, secondaryProjectile: 54 };
    for (const form of tcForms) freeShapeData.units[form] = { ...freeShapeData.units[form]!, secondaryProjectile: 0 };
    freeShapeData.unitUpgradeTechs![492] = [47];
    freeShapeData.civs.Britons!.free = [47];
    freeShapeData.techs[47] = rule(47, [ef(492, 'total', 'set', 2)]);
    freeShapeData.techs[233] = rule(233, [ef(54, 'attack', 'add', 4)]);
    expect(getGarrisonTechs(ctx, tc, cfg('Britons', 4), freeShapeData).map((t) => t.id)).toContain(233);
    const fsBefore = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [], [{ unitId: 492, count: '1', entry: 'enter' }]), freeShapeData);
    const fsAfter = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [233], [{ unitId: 492, count: '1', entry: 'enter' }]), freeShapeData);
    expect(fsAfter.errors).toEqual([]);
    expect(fsBefore.garrisonPower).toBeCloseTo(2.5, 5);
    expect(fsAfter.garrisonPower).toBeCloseTo(4.1, 5);

    // 3. R7 P1-3: 非交换 type=60 形态 [24,492] vs [492,24]，反序下 233 使副弹丸 54 攻击 4 -> 8（总火力 2.6 -> 4.2），保留 233
    const orderData = cloneIsolated([47, 608, 233]);
    orderData.unitUpgradeTechs = { 24: [47], 492: [608] };
    for (const uid of [24, 492]) {
      orderData.units[uid] = { ...orderData.units[uid]!, attack: 1, total: 1, reload: 2, firepower: 1, secondaryProjectile: 54 };
    }
    for (const form of tcForms) orderData.units[form] = { ...orderData.units[form]!, secondaryProjectile: 0 };
    orderData.techs[47] = rule(47, [ef(54, 'attack', 'set', 4)]);
    orderData.techs[608] = rule(608, [ef(54, 'attack', 'set', 0)]);
    orderData.techs[233] = rule(233, [ef(54, 'attack', 'mul', 2)]);
    orderData.conditional.push(rule(99601, [ef(492, 'total', 'set', 2)], [47, 608], 2));
    expect(getGarrisonTechs(ctx, tc, cfg('Britons', 4), orderData).map((t) => t.id)).toContain(233);
    const descRows: GeneralGarrisonConfig['rows'] = [
      { unitId: 492, count: '1', entry: 'enter' },
      { unitId: 24, count: '1', entry: 'enter' },
    ];
    const ordBefore = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [], descRows), orderData);
    const ordAfter = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [233], descRows), orderData);
    expect(ordAfter.errors).toEqual([]);
    expect(ordBefore.garrisonPower).toBeCloseTo(2.6, 5);
    expect(ordAfter.garrisonPower).toBeCloseTo(4.2, 5);

    // 4. Devin #1 (70284405): total 1 -> 2 激活既有 secondaryProjectile（ID 未变）且副攻仅由同伴 199 提供 -> 保留 233
    const activateProjData = cloneIsolated([199, 233]);
    activateProjData.units[492] = { ...activateProjData.units[492]!, attack: 0, total: 1, reload: 2, firepower: 1, secondaryProjectile: 1930 };
    activateProjData.units[1930] = { ...activateProjData.units[1930]!, attack: 0 };
    activateProjData.techs[199] = rule(199, [ef(1930, 'attack', 'add', 5)]);
    activateProjData.techs[233] = rule(233, [ef(492, 'total', 'add', 1)]);
    expect(getGarrisonTechs(ctx, tc, cfg('Britons', 4), activateProjData).map((t) => t.id)).toEqual(expect.arrayContaining([199, 233]));
    const apBefore = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [199], [{ unitId: 492, count: '1', entry: 'enter' }]), activateProjData);
    const apAfter = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [199, 233], [{ unitId: 492, count: '1', entry: 'enter' }]), activateProjData);
    expect(apAfter.errors).toEqual([]);
    expect(apBefore.garrisonPower).toBe(0);
    expect(apAfter.garrisonPower).toBeCloseTo(2, 5);

    // 5. R7 P2-1: 10 项容量空置控制科技 × 7 项净零数值科技去重求解准确返回 [] 且耗时远低于 1 秒
    const perfIds = independentBritonsIds(17, [16, 47, 483, 755]);
    expect(perfIds).toHaveLength(17);
    const perfData = cloneIsolated(perfIds);
    perfData.unitUpgradeTechs = {};
    for (const id of perfIds.slice(0, 10)) perfData.techs[id] = rule(id, [ef(109, 'capacity', 'set', 15)]);
    for (const id of perfIds.slice(10)) perfData.techs[id] = rule(id, [ef(492, 'attack', 'add', 1), ef(492, 'attack', 'add', -1)]);
    const t0 = performance.now();
    expect(getGarrisonTechs(ctx, tc, cfg('Britons', 4), perfData)).toEqual([]);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});
