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
const techIds = (bid: number, civ: string, age = 4, data: GeneralGarrisonData = GENERAL_GARRISON_DATA) =>
  getGarrisonTechs(ctx, ctx.core.buildingById[bid]!, cfg(civ, age), data)
    .map((t) => t.id)
    .sort((a, b) => a - b);

function cloneCustomData(): GeneralGarrisonData {
  return structuredClone({ ...GENERAL_GARRISON_DATA, unitUpgradeTechs: GARRISON_TECH_DATA.unitUpgradeTechs });
}

describe('Issue 1404: getGarrisonTechs 自定义数据与精确状态边界回归', () => {
  it('链式触发、跨科技火力与多弹丸联动、自动迁移与非射击转射击边界', () => {
    const tc = ctx.core.buildingById[109]!;
    const barracks = ctx.core.buildingById[12]!;

    // 1. 链式触发：233 -> 无直接效果的中间标记规则 -> TC 容量 +2
    const chainData = cloneCustomData();
    chainData.conditional.push(
      { id: 99001, requires: [233], count: 1, effects: [] },
      { id: 99002, requires: [99001], count: 1, effects: [{ unit: 109, stat: 'capacity', op: 'add', value: 2 }] },
    );
    expect(techIds(109, 'Franks', 4, chainData)).toContain(233);
    expect(calculateGeneralGarrison(ctx, tc, cfg('Franks', 4, [233]), chainData).capacity).toBe(
      calculateGeneralGarrison(ctx, tc, cfg('Franks', 4, []), chainData).capacity + 2,
    );

    // 2. OR 规则跨两个可选科技（count: 1）双方均保留，而已被时代满足的 OR 规则不误保留
    const orData = cloneCustomData();
    orData.conditional.push(
      { id: 99003, requires: [233, 608], count: 1, effects: [{ unit: 109, stat: 'capacity', op: 'add', value: 1 }] },
      { id: 99004, requires: [102, 233], count: 1, effects: [{ unit: 109, stat: 'capacity', op: 'add', value: 1 }] },
    );
    expect(techIds(109, 'Franks', 4, orData)).toContain(233);
    const baseSatisfiedData = cloneCustomData();
    baseSatisfiedData.conditional.push({ id: 99005, requires: [102, 233], count: 1, effects: [{ unit: 109, stat: 'capacity', op: 'add', value: 1 }] });
    expect(techIds(109, 'Franks', 4, baseSatisfiedData)).not.toContain(233);

    // 3. 跨科技火力联动：前置科技赋予步兵非零火力，后续攻击科技能真实提升贡献 -> 保留
    const fpChainData = cloneCustomData();
    fpChainData.techs[11] = { id: 11, requires: [], count: 0, effects: [{ unit: 74, stat: 'firepower', op: 'set', value: 1 }] };
    fpChainData.techs[233] = { id: 233, requires: [], count: 0, effects: [{ unit: 74, stat: 'attack', op: 'add', value: 4 }] };
    expect(techIds(109, 'Teutons', 4, fpChainData)).toContain(233);
    const fpBefore = calculateGeneralGarrison(ctx, tc, cfg('Teutons', 4, [11], [{ unitId: 74, count: '1', entry: 'enter' }]), fpChainData);
    const fpAfter = calculateGeneralGarrison(ctx, tc, cfg('Teutons', 4, [11, 233], [{ unitId: 74, count: '1', entry: 'enter' }]), fpChainData);
    expect(fpAfter.rows[0]!.powerEach!).toBeGreaterThan(fpBefore.rows[0]!.powerEach!);

    // 4. 跨科技多弹丸联动：一个科技把 total 从 1 提到 2，另一科技改副弹丸 -> 两者均保留
    const multiData = cloneCustomData();
    multiData.techs[233] = { id: 233, requires: [], count: 0, effects: [{ unit: 4, stat: 'secondaryProjectile', op: 'set', value: 54 }] };
    multiData.techs[608] = {
      ...multiData.techs[608]!,
      effects: [...multiData.techs[608]!.effects, { unit: 4, stat: 'total', op: 'add', value: 1 }],
    };
    expect(techIds(109, 'Franks', 4, multiData)).toContain(233);

    // 5. 自动规则把单位迁入当前射击建筑生产后，该单位的火力科技进入列表
    const relocData = cloneCustomData();
    relocData.units[4] = { ...relocData.units[4]!, garrisonTasks: [] };
    relocData.civs.Franks!.automatic.push({ id: 99006, requires: [], count: 0, effects: [], trainingLocations: [{ unit: 4, slot: 0, location: 109 }] });
    relocData.techs[233] = { id: 233, requires: [], count: 0, effects: [{ unit: 4, stat: 'attack', op: 'add', value: 3 }] };
    expect(getGarrisonCandidates(ctx, tc, cfg('Franks', 4), relocData).find((c) => c.id === 4)?.canCreate).toBe(true);
    expect(techIds(109, 'Franks', 4, relocData)).toContain(233);

    // 6. 科技让非射击建筑转为射击建筑时，建筑与可驻单位射击科技同时保留
    const shelterShootData = cloneCustomData();
    const barracksImpForm = shelterShootData.buildings[12]!.eraForms[3]!;
    shelterShootData.units[barracksImpForm] = {
      ...shelterShootData.units[barracksImpForm]!,
      reload: 2,
      projectile: 54,
      total: 1,
      max: 5,
      attack: 0,
    };
    shelterShootData.techs[199] = { id: 199, requires: [], count: 0, effects: [{ unit: 12, stat: 'attack', op: 'set', value: 6 }] };
    shelterShootData.techs[233] = { id: 233, requires: [], count: 0, effects: [{ unit: 12, stat: 'reload', op: 'mul', value: 0.8 }] };
    expect(techIds(12, 'Franks', 4, shelterShootData)).toEqual(expect.arrayContaining([199, 233]));
    expect(calculateGeneralGarrison(ctx, barracks, cfg('Franks', 4, [199, 233]), shelterShootData).mode).toBe('arrows');
  });

  it('隐式形态链（单行、部分组合、多行互启与互斥组合）与非单调火力/sizeClass 边界', () => {
    const tc = ctx.core.buildingById[109]!;
    const tcImpForm = GENERAL_GARRISON_DATA.buildings[109]!.eraForms[3]!;

    // 7. 隐式形态链：英国 TC 劲弩手 492（隐式 237）+ 233 增容 -> 保留 233 且行增删列表稳定
    const shapeChainData = cloneCustomData();
    shapeChainData.conditional.push({ id: 99101, requires: [237, 233], count: 2, effects: [{ unit: 109, stat: 'capacity', op: 'add', value: 2 }] });
    expect(techIds(109, 'Britons', 4, shapeChainData)).toContain(233);
    expect(
      getGarrisonTechs(ctx, tc, cfg('Britons', 4, [], [{ unitId: 492, count: '1', entry: 'enter' }]), shapeChainData)
        .map((t) => t.id)
        .sort((a, z) => a - z),
    ).toEqual(techIds(109, 'Britons', 4, shapeChainData));
    const shapeRes = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [233], [{ unitId: 492, count: '1', entry: 'enter' }]), shapeChainData);
    expect(shapeRes.errors).toEqual([]);
    expect(shapeRes.capacity).toBe(17);

    // 8. 部分选择非单调火力抵消：199 赋予民兵火力，200 归零，233 加攻 -> 仅选 199 时 233 有效，必须保留
    const partialFpData = cloneCustomData();
    partialFpData.techs[199] = { id: 199, requires: [], count: 0, effects: [{ unit: 74, stat: 'firepower', op: 'set', value: 1 }] };
    partialFpData.techs[200] = { id: 200, requires: [], count: 0, effects: [{ unit: 74, stat: 'firepower', op: 'set', value: 0 }] };
    partialFpData.techs[233] = { id: 233, requires: [], count: 0, effects: [{ unit: 74, stat: 'attack', op: 'add', value: 3 }] };
    expect(techIds(109, 'Britons', 4, partialFpData)).toContain(233);
    const partialBefore = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [199], [{ unitId: 74, count: '1', entry: 'enter' }]), partialFpData);
    const partialAfter = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [199, 233], [{ unitId: 74, count: '1', entry: 'enter' }]), partialFpData);
    expect(partialAfter.errors).toEqual([]);
    expect(partialBefore.rows[0]!.powerEach).toBe(0);
    expect(partialAfter.rows[0]!.powerEach).toBeCloseTo(1.5, 5);

    // 9. sizeClass 精细判定与阶段顺序：3->6 排除，3->2 保留；199(3->6) 早于 233(->2) 时 199 排除、233 保留
    const sizeNoopData = cloneCustomData();
    sizeNoopData.units[74] = { ...sizeNoopData.units[74]!, sizeClass: 3 };
    sizeNoopData.techs[233] = { id: 233, requires: [], count: 0, effects: [{ unit: 74, stat: 'sizeClass', op: 'set', value: 6 }] };
    expect(techIds(109, 'Britons', 4, sizeNoopData)).not.toContain(233);
    const sizeAllowData = cloneCustomData();
    sizeAllowData.units[74] = { ...sizeAllowData.units[74]!, sizeClass: 3 };
    sizeAllowData.techs[233] = { id: 233, requires: [], count: 0, effects: [{ unit: 74, stat: 'sizeClass', op: 'set', value: 2 }] };
    expect(techIds(109, 'Britons', 4, sizeAllowData)).toContain(233);
    expect(calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [233], [{ unitId: 74, count: '1', entry: 'enter' }]), sizeAllowData).errors).toEqual([]);

    const orderedSizeData = cloneCustomData();
    orderedSizeData.civs.Britons!.disabled.push(200, 201);
    orderedSizeData.units[74] = { ...orderedSizeData.units[74]!, sizeClass: 3 };
    orderedSizeData.techs[199] = { id: 199, requires: [], count: 0, effects: [{ unit: 74, stat: 'sizeClass', op: 'set', value: 6 }] };
    orderedSizeData.techs[233] = { id: 233, requires: [], count: 0, effects: [{ unit: 74, stat: 'sizeClass', op: 'set', value: 2 }] };
    const orderedIds = techIds(109, 'Britons', 4, orderedSizeData);
    expect(orderedIds).not.toContain(199);
    expect(orderedIds).toContain(233);

    // 10. 仅部分科技组合下可驻单位的隐式形态链（199->11, 200->1, [237,233]->cap+2）
    const partialShapeData = cloneCustomData();
    partialShapeData.units[tcImpForm] = { ...partialShapeData.units[tcImpForm]!, garrisonType: 1 };
    partialShapeData.techs[199] = { id: 199, requires: [], count: 0, effects: [{ unit: 109, stat: 'garrisonType', op: 'set', value: 11 }] };
    partialShapeData.techs[200] = { id: 200, requires: [], count: 0, effects: [{ unit: 109, stat: 'garrisonType', op: 'set', value: 1 }] };
    partialShapeData.conditional.push({ id: 99102, requires: [237, 233], count: 2, effects: [{ unit: 109, stat: 'capacity', op: 'add', value: 2 }] });
    expect(techIds(109, 'Britons', 4, partialShapeData)).toContain(233);
    const partialShapeRes = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [199, 233], [{ unitId: 492, count: '1', entry: 'enter' }]), partialShapeData);
    expect(partialShapeRes.errors).toEqual([]);
    expect(partialShapeRes.capacity).toBe(17);

    // 11. 多行互启隐式形态链保留 233；互斥组合才合法的两行不误合并其形态
    const pairBootData = cloneCustomData();
    pairBootData.units[tcImpForm] = { ...pairBootData.units[tcImpForm]!, garrisonType: 1 };
    pairBootData.conditional.push(
      { id: 99201, requires: [237, 98], count: 2, effects: [{ unit: 109, stat: 'garrisonType', op: 'set', value: 11 }] },
      { id: 99202, requires: [237, 98, 233], count: 3, effects: [{ unit: 109, stat: 'capacity', op: 'add', value: 2 }] },
    );
    expect(techIds(109, 'Britons', 4, pairBootData)).toContain(233);
    const pairBootRes = calculateGeneralGarrison(
      ctx,
      tc,
      cfg(
        'Britons',
        4,
        [233],
        [
          { unitId: 492, count: '1', entry: 'enter' },
          { unitId: 6, count: '1', entry: 'enter' },
        ],
      ),
      pairBootData,
    );
    expect(pairBootRes.errors).toEqual([]);
    expect(pairBootRes.capacity).toBe(17);

    const mutexRowData = cloneCustomData();
    mutexRowData.civs.Britons!.disabled.push(200, 201);
    mutexRowData.units[tcImpForm] = { ...mutexRowData.units[tcImpForm]!, garrisonType: 1 };
    mutexRowData.units[6] = { ...mutexRowData.units[6]!, sizeClass: 4 };
    mutexRowData.techs[199] = { id: 199, requires: [], count: 0, effects: [{ unit: 109, stat: 'garrisonType', op: 'set', value: 2 }] };
    mutexRowData.techs[608] = { id: 608, requires: [], count: 0, effects: [{ unit: 109, stat: 'garrisonType', op: 'set', value: 8 }] };
    mutexRowData.conditional.push(
      { id: 99203, requires: [199, 608], count: 2, effects: [{ unit: 109, stat: 'garrisonType', op: 'set', value: 1 }] },
      { id: 99204, requires: [237, 98, 233], count: 3, effects: [{ unit: 109, stat: 'capacity', op: 'add', value: 2 }] },
    );
    expect(techIds(109, 'Britons', 4, mutexRowData)).not.toContain(233);
  });

  it('精确阶段执行顺序（多步加法、Stage 2 顺序、免费覆写、9 项加法归零、准入/火力互斥）与对象不可变隔离', () => {
    const tc = ctx.core.buildingById[109]!;
    const tcImpForm = GENERAL_GARRISON_DATA.buildings[109]!.eraForms[3]!;

    // 12. 多次加法叠加解锁 garrisonType（0 + 1 + 1 = 2 允许劲弩手 492 进入，201 归零）-> 保留 233
    const multiAddGTypeData = cloneCustomData();
    multiAddGTypeData.units[tcImpForm] = { ...multiAddGTypeData.units[tcImpForm]!, garrisonType: 0 };
    multiAddGTypeData.techs[199] = { id: 199, requires: [], count: 0, effects: [{ unit: 109, stat: 'garrisonType', op: 'add', value: 1 }] };
    multiAddGTypeData.techs[200] = { id: 200, requires: [], count: 0, effects: [{ unit: 109, stat: 'garrisonType', op: 'add', value: 1 }] };
    multiAddGTypeData.techs[201] = { id: 201, requires: [], count: 0, effects: [{ unit: 109, stat: 'garrisonType', op: 'set', value: 0 }] };
    multiAddGTypeData.techs[233] = { id: 233, requires: [], count: 0, effects: [{ unit: 492, stat: 'attack', op: 'add', value: 3 }] };
    expect(techIds(109, 'Britons', 4, multiAddGTypeData)).toContain(233);
    const addBefore = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [199, 200], [{ unitId: 492, count: '1', entry: 'enter' }]), multiAddGTypeData);
    const addAfter = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [199, 200, 233], [{ unitId: 492, count: '1', entry: 'enter' }]), multiAddGTypeData);
    expect(addAfter.errors).toEqual([]);
    expect(addAfter.rows[0]!.powerEach!).toBeGreaterThan(addBefore.rows[0]!.powerEach!);

    // 13. Stage 2 固定顺序覆写（+1 后 set 1）、Stage 1 必触发免费覆写与 sizeClass 必触发条件覆写均不误保留
    const s2OrderData = cloneCustomData();
    s2OrderData.civs.Britons!.disabled.push(200, 201);
    s2OrderData.units[tcImpForm] = { ...s2OrderData.units[tcImpForm]!, garrisonType: 1 };
    s2OrderData.techs[199] = { id: 199, requires: [], count: 0, effects: [] };
    s2OrderData.techs[233] = { id: 233, requires: [], count: 0, effects: [{ unit: 492, stat: 'attack', op: 'add', value: 3 }] };
    s2OrderData.conditional.push(
      { id: 99205, requires: [199], count: 1, effects: [{ unit: 109, stat: 'garrisonType', op: 'add', value: 1 }] },
      { id: 99206, requires: [199], count: 1, effects: [{ unit: 109, stat: 'garrisonType', op: 'set', value: 1 }] },
    );
    expect(techIds(109, 'Britons', 4, s2OrderData)).not.toContain(233);

    const s1FreeOverride = cloneCustomData();
    s1FreeOverride.civs.Britons!.disabled.push(201);
    s1FreeOverride.civs.Britons!.free.push(200);
    s1FreeOverride.units[tcImpForm] = { ...s1FreeOverride.units[tcImpForm]!, garrisonType: 1 };
    s1FreeOverride.techs[199] = { id: 199, requires: [], count: 0, effects: [{ unit: 109, stat: 'garrisonType', op: 'set', value: 2 }] };
    s1FreeOverride.techs[200] = { id: 200, requires: [], count: 0, effects: [{ unit: 109, stat: 'garrisonType', op: 'set', value: 1 }] };
    s1FreeOverride.techs[233] = { id: 233, requires: [], count: 0, effects: [{ unit: 492, stat: 'attack', op: 'add', value: 3 }] };
    expect(techIds(109, 'Britons', 4, s1FreeOverride)).not.toContain(233);

    const sizeCondCancel = cloneCustomData();
    sizeCondCancel.civs.Britons!.disabled.push(200, 201);
    sizeCondCancel.units[74] = { ...sizeCondCancel.units[74]!, sizeClass: 3 };
    sizeCondCancel.techs[199] = { id: 199, requires: [], count: 0, effects: [{ unit: 74, stat: 'sizeClass', op: 'set', value: 2 }] };
    sizeCondCancel.conditional.push({ id: 99207, requires: [199], count: 1, effects: [{ unit: 74, stat: 'sizeClass', op: 'set', value: 6 }] });
    expect(techIds(109, 'Britons', 4, sizeCondCancel)).not.toContain(199);

    // 14. Stage 0 形态规则单次生效、9 项独立加法 + 末尾无条件归零（512 组合精确求解）与准入/火力互斥
    const stage0ShapeData = cloneCustomData();
    stage0ShapeData.units[tcImpForm] = { ...stage0ShapeData.units[tcImpForm]!, garrisonType: 1 };
    stage0ShapeData.civs.Britons!.automatic.push({ id: 99208, requires: [237], count: 1, effects: [{ unit: 109, stat: 'garrisonType', op: 'add', value: 2 }] });
    stage0ShapeData.units[38] = { ...stage0ShapeData.units[38]!, sizeClass: 3, firepower: 1, garrisonTasks: [{ classId: -1, unitId: 109 }] };
    stage0ShapeData.techs[233] = { id: 233, requires: [], count: 0, effects: [{ unit: 38, stat: 'attack', op: 'add', value: 3 }] };
    expect(techIds(109, 'Britons', 4, stage0ShapeData)).not.toContain(233);

    const nineAddData = cloneCustomData();
    const nineIds = ctx.core.techs
      .filter((t) => t.civs.includes('Britons') && !t.pre && t.id !== 233 && !nineAddData.civs.Britons!.disabled.includes(t.id))
      .slice(0, 9)
      .map((t) => t.id);
    expect(nineIds).toHaveLength(9);
    nineAddData.units[tcImpForm] = { ...nineAddData.units[tcImpForm]!, garrisonType: 0 };
    for (const id of nineIds) {
      nineAddData.techs[id] = { id, requires: [], count: 0, effects: [{ unit: 109, stat: 'garrisonType', op: 'add', value: 1 }] };
    }
    nineAddData.techs[233] = { id: 233, requires: [], count: 0, effects: [{ unit: 492, stat: 'attack', op: 'add', value: 3 }] };
    nineAddData.conditional.push({ id: 99209, requires: [], count: 0, effects: [{ unit: 109, stat: 'garrisonType', op: 'set', value: 1 }] });
    expect(techIds(109, 'Britons', 4, nineAddData)).not.toContain(233);

    const mutexFpEntry = cloneCustomData();
    mutexFpEntry.civs.Britons!.disabled.push(200, 201);
    mutexFpEntry.units[tcImpForm] = { ...mutexFpEntry.units[tcImpForm]!, garrisonType: 1 };
    mutexFpEntry.techs[199] = {
      id: 199,
      requires: [],
      count: 0,
      effects: [
        { unit: 109, stat: 'garrisonType', op: 'set', value: 11 },
        { unit: 492, stat: 'firepower', op: 'set', value: 0 },
      ],
    };
    mutexFpEntry.techs[233] = { id: 233, requires: [], count: 0, effects: [{ unit: 492, stat: 'attack', op: 'add', value: 3 }] };
    expect(techIds(109, 'Britons', 4, mutexFpEntry)).not.toContain(233);

    // 15. 可变 Core/Trees 不跨调用缓存，内置默认数据递归冻结不可就地篡改
    const clonedCore = structuredClone(ctx.core);
    const clonedCtx: GeneralGarrisonContext = { core: clonedCore, trees: ctx.trees };
    const clonedTc = clonedCore.buildingById[109]!;
    const fletching = getGarrisonTechs(clonedCtx, clonedTc, cfg('Britons', 4)).find((t) => t.id === 199);
    expect(fletching).toBeDefined();
    fletching!.civs = fletching!.civs.filter((c) => c !== 'Britons');
    expect(getGarrisonTechs(clonedCtx, clonedTc, cfg('Britons', 4)).map((t) => t.id)).not.toContain(199);
    expect(Object.isFrozen(GENERAL_GARRISON_DATA)).toBe(true);
    expect(Object.isFrozen(GENERAL_GARRISON_DATA.rosterIds)).toBe(true);
    expect(Object.isFrozen(GARRISON_TECH_DATA)).toBe(true);
  });

  it('R5 边界回归：大 ID 前置、必触发规则改序、迁出生产槽互斥、超限溢出与副弹丸/覆写/免费纯数值/负乘数弹丸', () => {
    const tc = ctx.core.buildingById[109]!;
    const tcImpForm = GENERAL_GARRISON_DATA.buildings[109]!.eraForms[3]!;

    // 16. R5 P1-1: 前置科技 ID 大于后继（233.pre = 608）时按拓扑序枚举，[608, 233] 增容 15->17 均保留
    const revPreCore = structuredClone(ctx.core);
    revPreCore.techById[233] = { ...revPreCore.techById[233]!, pre: 608 };
    const revPreIdx = revPreCore.techs.findIndex((t) => t.id === 233);
    revPreCore.techs[revPreIdx] = revPreCore.techById[233]!;
    const revPreCtx: GeneralGarrisonContext = { core: revPreCore, trees: ctx.trees };
    const revPreTc = revPreCore.buildingById[109]!;
    const revPreData = cloneCustomData();
    revPreData.techs[608] = { id: 608, requires: [], count: 0, effects: [] };
    revPreData.techs[233] = { id: 233, requires: [], count: 0, effects: [{ unit: 109, stat: 'capacity', op: 'add', value: 2 }] };
    const revPreIds = getGarrisonTechs(revPreCtx, revPreTc, cfg('Britons', 4), revPreData).map((t) => t.id);
    expect(revPreIds).toEqual(expect.arrayContaining([608, 233]));
    const revPreRes = calculateGeneralGarrison(revPreCtx, revPreTc, cfg('Britons', 4, [608, 233]), revPreData);
    expect(revPreRes.errors).toEqual([]);
    expect(revPreRes.capacity).toBe(17);

    // 17. R5 P1-2: 必触发规则因 233 提前到第一轮而与后续覆写换序（无 233 民兵可进，有 233 民兵不可进）-> 保留 233
    const reorderData = cloneCustomData();
    reorderData.units[74] = { ...reorderData.units[74]!, sizeClass: 3 };
    reorderData.techs[233] = { id: 233, requires: [], count: 0, effects: [] };
    reorderData.conditional.push(
      { id: 99301, requires: [99303, 233], count: 1, effects: [{ unit: 74, stat: 'sizeClass', op: 'set', value: 2 }] },
      { id: 99302, requires: [], count: 0, effects: [{ unit: 74, stat: 'sizeClass', op: 'set', value: 3 }] },
      { id: 99303, requires: [], count: 0, effects: [] },
    );
    expect(techIds(109, 'Britons', 4, reorderData)).toContain(233);
    expect(getGarrisonCandidates(ctx, tc, cfg('Britons', 4, []), reorderData).find((c) => c.id === 74)?.canEnter).toBe(true);
    expect(getGarrisonCandidates(ctx, tc, cfg('Britons', 4, [233]), reorderData).find((c) => c.id === 74)).toBeUndefined();

    // 18. R5 P1-3: 迁出生产槽造成的形态互斥保留单行触发科技 233，且单独迁出村民生产槽也保留对应科技
    const evictMutexData = cloneCustomData();
    evictMutexData.units[tcImpForm] = { ...evictMutexData.units[tcImpForm]!, garrisonType: 1 };
    evictMutexData.units[492] = { ...evictMutexData.units[492]!, garrisonTasks: [], trainLocations: [{ unitId: 109, time: 20 }] };
    evictMutexData.units[6] = { ...evictMutexData.units[6]!, garrisonTasks: [], trainLocations: [{ unitId: 109, time: 20 }] };
    evictMutexData.buildings[109]!.produces.push(492, 6);
    evictMutexData.conditional.push(
      {
        id: 99304,
        requires: [237, 98],
        count: 2,
        effects: [],
        trainingLocations: [
          { unit: 492, slot: 0, location: 87 },
          { unit: 6, slot: 0, location: 87 },
        ],
      },
      { id: 99305, requires: [237, 233], count: 2, effects: [{ unit: 109, stat: 'total', op: 'add', value: 2 }] },
    );
    expect(techIds(109, 'Britons', 4, evictMutexData)).toContain(233);
    const evictRes = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [233], [{ unitId: 492, count: '1', entry: 'created' }]), evictMutexData);
    expect(evictRes.errors).toEqual([]);

    const evictVilData = cloneCustomData();
    evictVilData.techs[233] = { id: 233, requires: [], count: 0, effects: [], trainingLocations: [{ unit: 83, slot: 0, location: 87 }] };
    expect(techIds(109, 'Britons', 4, evictVilData)).toContain(233);
    expect(getGarrisonCandidates(ctx, tc, cfg('Britons', 4, [233]), evictVilData).find((c) => c.id === 83)?.canCreate).toBe(false);

    // 19. R5 P1-4: 11 项独立控制科技超上限（2048 > 1024）时，不依赖截断状态误删依赖低 ID 控制项解锁的纯数值科技 233
    const overflowData = cloneCustomData();
    const elevenIds = ctx.core.techs
      .filter((t) => t.civs.includes('Britons') && !t.pre && t.id !== 233 && !overflowData.civs.Britons!.disabled.includes(t.id))
      .map((t) => t.id)
      .sort((a, z) => a - z)
      .slice(0, 11);
    expect(elevenIds).toHaveLength(11);
    overflowData.units[tcImpForm] = { ...overflowData.units[tcImpForm]!, garrisonType: 1 };
    overflowData.techs[elevenIds[0]!] = { id: elevenIds[0]!, requires: [], count: 0, effects: [{ unit: 109, stat: 'garrisonType', op: 'set', value: 11 }] };
    for (const id of elevenIds.slice(1)) {
      overflowData.techs[id] = { id, requires: [], count: 0, effects: [{ unit: 109, stat: 'capacity', op: 'add', value: 1 }] };
    }
    overflowData.techs[233] = { id: 233, requires: [], count: 0, effects: [{ unit: 492, stat: 'attack', op: 'add', value: 3 }] };
    expect(techIds(109, 'Britons', 4, overflowData)).toContain(233);
    const ovBefore = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [elevenIds[0]!], [{ unitId: 492, count: '1', entry: 'enter' }]), overflowData);
    const ovAfter = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [elevenIds[0]!, 233], [{ unitId: 492, count: '1', entry: 'enter' }]), overflowData);
    expect(ovAfter.errors).toEqual([]);
    expect(ovAfter.rows[0]!.powerEach!).toBeGreaterThan(ovBefore.rows[0]!.powerEach!);

    // 20. R5 P1-5: 副弹丸攻击科技 199 建立火力后解锁攻击间隔科技 233（1.6 -> 2.0）
    const secReloadData = cloneCustomData();
    secReloadData.civs.Britons!.disabled.push(200, 201);
    secReloadData.units[492] = { ...secReloadData.units[492]!, attack: 0, total: 2, secondaryProjectile: 54, firepower: 1, reload: 2 };
    secReloadData.units[54] = { ...secReloadData.units[54]!, attack: 0 };
    secReloadData.techs[199] = { id: 199, requires: [], count: 0, effects: [{ unit: 54, stat: 'attack', op: 'add', value: 4 }] };
    secReloadData.techs[233] = { id: 233, requires: [], count: 0, effects: [{ unit: 492, stat: 'reload', op: 'mul', value: 0.8 }] };
    expect(techIds(109, 'Britons', 4, secReloadData)).toEqual(expect.arrayContaining([199, 233]));
    const srBefore = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [199], [{ unitId: 492, count: '1', entry: 'enter' }]), secReloadData);
    const srAfter = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [199, 233], [{ unitId: 492, count: '1', entry: 'enter' }]), secReloadData);
    expect(srAfter.errors).toEqual([]);
    expect(srBefore.rows[0]!.powerEach).toBeCloseTo(1.6, 5);
    expect(srAfter.rows[0]!.powerEach).toBeCloseTo(2.0, 5);

    // 21. R5 P2-1/P2-2/P2-3: 末尾覆写纯数值不误留、免费纯数值不丢失、弹丸负乘数翻转为庇护后依赖科技排除
    const tailOverrideData = cloneCustomData();
    tailOverrideData.techs[233] = { id: 233, requires: [], count: 0, effects: [{ unit: 492, stat: 'attack', op: 'add', value: 3 }] };
    tailOverrideData.conditional.push({ id: 99306, requires: [], count: 0, effects: [{ unit: 492, stat: 'attack', op: 'set', value: 7 }] });
    expect(techIds(109, 'Britons', 4, tailOverrideData)).not.toContain(233);

    const freePureData = cloneCustomData();
    freePureData.civs.Britons!.free.push(233);
    freePureData.techs[233] = { id: 233, requires: [], count: 0, effects: [{ unit: 492, stat: 'attack', op: 'set', value: 12 }] };
    expect(techIds(109, 'Britons', 4, freePureData)).toContain(233);

    const negMulCore = structuredClone(ctx.core);
    negMulCore.techById[608] = { ...negMulCore.techById[608]!, pre: 233 };
    const negMulIdx = negMulCore.techs.findIndex((t) => t.id === 608);
    negMulCore.techs[negMulIdx] = negMulCore.techById[608]!;
    const negMulCtx: GeneralGarrisonContext = { core: negMulCore, trees: ctx.trees };
    const negMulTc = negMulCore.buildingById[109]!;
    const negMulData = cloneCustomData();
    negMulData.units[tcImpForm] = { ...negMulData.units[tcImpForm]!, projectile: 54, secondaryProjectile: -1 };
    negMulData.techs[233] = { id: 233, requires: [], count: 0, effects: [{ unit: 109, stat: 'projectile', op: 'mul', value: -1 }] };
    negMulData.techs[608] = { id: 608, requires: [], count: 0, effects: [{ unit: 492, stat: 'attack', op: 'add', value: 3 }] };
    const negMulIds = getGarrisonTechs(negMulCtx, negMulTc, cfg('Britons', 4), negMulData).map((t) => t.id);
    expect(negMulIds).toContain(233);
    expect(negMulIds).not.toContain(608);
  });

  it('R10 回归：自动规则已满足前置、极小量级火力相对容差、零火力免费科技与纯存放圣物过滤', () => {
    const tc = ctx.core.buildingById[109]!;
    const tcForms = [109, ...(GENERAL_GARRISON_DATA.buildings[109]?.eraForms ?? [])];

    // 1. R10 P1-1: 自动规则将 199 写入 known 且 233.pre = 199；手选 199 会把 492.firepower 置 0，单选 233 合法且火力 3 -> 5
    const autoPreCore = structuredClone(ctx.core);
    autoPreCore.techById[233] = { ...autoPreCore.techById[233]!, pre: 199 };
    autoPreCore.techs[autoPreCore.techs.findIndex((t) => t.id === 233)] = autoPreCore.techById[233]!;
    const autoPreCtx: GeneralGarrisonContext = { core: autoPreCore, trees: ctx.trees };
    const autoPreTc = autoPreCore.buildingById[109]!;
    const autoPreData = cloneCustomData();
    autoPreData.techs = {
      199: {
        id: 199,
        requires: [],
        count: 0,
        effects: [
          { unit: 109, stat: 'capacity', op: 'add', value: 1 },
          { unit: 492, stat: 'firepower', op: 'set', value: 0 },
        ],
      },
      233: { id: 233, requires: [], count: 0, effects: [{ unit: 492, stat: 'attack', op: 'add', value: 4 }] },
    };
    autoPreData.civs.Britons!.automatic = [{ id: 199, requires: [], count: 0, effects: [] }];
    autoPreData.civs.Britons!.free = [];
    autoPreData.conditional = [];
    autoPreData.units[492] = { ...autoPreData.units[492]!, attack: 6, reload: 2, total: 1, firepower: 1 };
    expect(getGarrisonTechs(autoPreCtx, autoPreTc, cfg('Britons', 4), autoPreData).map((t) => t.id)).toEqual(expect.arrayContaining([199, 233]));
    const apBefore = calculateGeneralGarrison(autoPreCtx, autoPreTc, cfg('Britons', 4, [], [{ unitId: 492, count: '1', entry: 'enter' }]), autoPreData);
    const apAfter = calculateGeneralGarrison(autoPreCtx, autoPreTc, cfg('Britons', 4, [233], [{ unitId: 492, count: '1', entry: 'enter' }]), autoPreData);
    expect(apAfter.errors).toEqual([]);
    expect(apBefore.garrisonPower).toBeCloseTo(3, 5);
    expect(apAfter.garrisonPower).toBeCloseTo(5, 5);

    // 2. R10 P1-2: 极小量级建筑副弹丸攻击（2e-13 -> 4e-13）不被绝对舍入吞掉，弹丸 4 -> 2，保留 233
    const tinyScaleData = cloneCustomData();
    tinyScaleData.techs = { 233: { id: 233, requires: [], count: 0, effects: [{ unit: 54, stat: 'attack', op: 'add', value: 2e-13 }] } };
    tinyScaleData.civs.Britons!.automatic = [];
    tinyScaleData.civs.Britons!.free = [];
    tinyScaleData.conditional = [];
    tinyScaleData.units[54] = { ...tinyScaleData.units[54]!, attack: 2e-13 };
    for (const form of tcForms) tinyScaleData.units[form] = { ...tinyScaleData.units[form]!, reload: 2, secondaryProjectile: 54 };
    tinyScaleData.units[492] = { ...tinyScaleData.units[492]!, attack: 8e-13, reload: 2, total: 1, firepower: 1 };
    expect(techIds(109, 'Britons', 4, tinyScaleData)).toContain(233);
    const tsBefore = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [], [{ unitId: 492, count: '1', entry: 'enter' }]), tinyScaleData);
    const tsAfter = calculateGeneralGarrison(ctx, tc, cfg('Britons', 4, [233], [{ unitId: 492, count: '1', entry: 'enter' }]), tinyScaleData);
    expect(tsAfter.errors).toEqual([]);
    expect(tsBefore.totalProjectiles).toBe(4);
    expect(tsAfter.totalProjectiles).toBe(2);

    // 3. R10 P2-1: 免费科技 233 将 492.firepower 设为 0（火力 3 -> 0），不被后态零火力跳过
    const freeZeroData = cloneCustomData();
    freeZeroData.techs = { 233: { id: 233, requires: [], count: 0, effects: [{ unit: 492, stat: 'firepower', op: 'set', value: 0 }] } };
    freeZeroData.civs.Britons!.automatic = [];
    freeZeroData.civs.Britons!.free = [233];
    freeZeroData.conditional = [];
    expect(techIds(109, 'Britons', 4, freeZeroData)).toContain(233);

    // 4. R10 P2-2: 亚美尼亚强化教堂（1806）中圣物 285 仅支持 deposit（用村民火力），修改 285 本体攻击的科技应排除
    const relicAtkData = cloneCustomData();
    relicAtkData.techs = { 233: { id: 233, requires: [], count: 0, effects: [{ unit: 285, stat: 'attack', op: 'add', value: 4 }] } };
    relicAtkData.civs.Armenians!.automatic = [];
    relicAtkData.civs.Armenians!.free = [];
    relicAtkData.conditional = [];
    expect(techIds(1806, 'Armenians', 4, relicAtkData)).not.toContain(233);
  });
});
