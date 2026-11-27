import { beforeAll, describe, expect, it } from 'vitest';
import { civs, loadCore, loadTrees, type Core } from '../../src/data';
import { damageRows } from '../../src/domain/damageCore';
import {
  buildReverseCounterCatalogMeta,
  resolveReverseCounterPkMember,
  reverseCounterBuildingsText,
  reverseCounterDuelHref,
  reverseCounterUnitLabel,
  reverseCounters,
} from '../../src/domain/reverseCounters';
import type { Trees, Unit } from '../../src/domain/types';

let core: Core;
let trees: Trees;
const civNames = civs.map((civ) => civ.en);

beforeAll(async () => {
  [core, trees] = await Promise.all([loadCore(), loadTrees()]);
});

function target(category: string, armor = 0): Unit {
  return { ...core.unitById[38]!, id: 900_000, armc: [[category, armor]] };
}

function query(targetUnit: Unit, units: Unit[], filter = { civ: '', age: null as number | null }, treeData: Trees | null = null) {
  return reverseCounters(targetUnit, units, core, civNames, treeData, filter);
}

describe('单位详情反向类别加成（#1053）', () => {
  it('按每个目标类别展示目录贡献，不把普通近战/穿刺或总伤害混进来', () => {
    const result = query(core.unitById[761]!, [core.unitById[279]!]);
    const group = result.groups.find((item) => item.category === '步兵');
    expect(result.state).toBe('ready');
    expect(group?.rows.map(({ unit, attack, armor, damage }) => [unit.id, attack, armor, damage])).toEqual([[279, 1, 0, 1]]);
    expect(damageRows({ x: -3 }, { x: 1 }).rows[0]?.damage).toBe(-3);

    const from542To359 = query(core.unitById[359]!, [core.unitById[542]!]);
    expect(from542To359.groups.find((item) => item.category === '步兵')?.rows[0]).toMatchObject({ attack: 2, armor: 0, damage: 2 });
    const from279To1658 = query(core.unitById[1658]!, [core.unitById[279]!]);
    const from279To1660 = query(core.unitById[1660]!, [core.unitById[279]!]);
    expect(from279To1658.groups.find((item) => item.category === '步兵')?.rows[0]?.damage).toBe(1);
    expect(from279To1660.groups.find((item) => item.category === '步兵')?.rows[0]?.damage).toBe(1);
    expect(query(core.unitById[40]!, [core.unitById[93]!]).groups.find((item) => item.category === '骑兵')?.rows[0]).toMatchObject({
      attack: 15,
      armor: 12,
      damage: 3,
    });

    const multiClass = query(core.unitById[359]!, [core.unitById[763]!]);
    expect(multiClass.groups.find((item) => item.category === '长矛兵')?.rows[0]?.damage).toBe(2);
    expect(multiClass.groups.find((item) => item.category === '步兵')?.rows[0]?.damage).toBe(1);
    expect(query(core.unitById[1263]!, [core.unitById[38]!]).groups.find((item) => item.category === '骑乘减伤')?.rows).toEqual([]);
  });

  it('包含真实正向镜像贡献和同单位 PK；无正贡献的镜像仍不出现', () => {
    const samurai = core.unitById[291]!;
    expect(samurai).toMatchObject({ en: 'Samurai', age: 3, civs: ['Japanese'] });
    expect(samurai.atks).toContainEqual(['独特单位', 10]);
    expect(samurai.armc).toContainEqual(['独特单位', 0]);

    const mirror = query(samurai, [samurai]);
    expect(mirror.state).toBe('ready');
    expect(
      mirror.groups.find((group) => group.category === '独特单位')?.rows.map(({ unit, attack, armor, damage }) => [unit.id, attack, armor, damage]),
    ).toEqual([[291, 10, 0, 10]]);
    expect(reverseCounterDuelHref(samurai, samurai, core, trees, 'Japanese', 'Japanese', 3)).toBe('/duel?a=291.Japanese.3..&b=291.Japanese.3..&m=1');

    const archer = core.unitById[4]!;
    expect(archer).toMatchObject({ en: 'Archer' });
    const noPositiveMirror = query(archer, [archer]);
    expect(noPositiveMirror.state).toBe('ready');
    expect(noPositiveMirror.groups.flatMap((group) => group.rows)).toEqual([]);

    const malformedSelf = { ...samurai, atks: [...samurai.atks, null] } as unknown as Unit;
    const partial = query(malformedSelf, [malformedSelf]);
    expect(partial.state).toBe('partial');
    expect(partial.groups.find((group) => group.category === '独特单位')?.rows[0]).toMatchObject({
      unit: { id: 291 },
      attack: 10,
      armor: 0,
      damage: 10,
    });
    expect(reverseCounterDuelHref(malformedSelf, malformedSelf, core, trees, 'Japanese', 'Japanese', 3)).toBeNull();
  });

  it('不把前置形态缺失的正贡献候选作为完整目录结果', () => {
    const incomplete = { ...core.unitById[1658]!, id: 3_000_020, from_: 3_000_021 };
    const localCore = { ...core, unitById: { ...core.unitById, [incomplete.id]: incomplete } };
    const result = reverseCounters(target('冲击步兵'), [incomplete], localCore, civNames, null, { civ: '', age: null });

    expect(result.state).toBe('partial');
    expect(result.groups.flatMap((group) => group.rows).map((row) => row.unit.id)).toContain(incomplete.id);
  });

  it('同战力同造价且来自不同训练建筑时合并（含 1658/1660），并保持先筛选后合并', () => {
    const base = core.unitById[1658]!;
    const clone = { ...base, id: 3_000_000, b: base.b + 10_000, bz: '另一训练建筑', ben: 'Another building' };
    const localCore = { ...core, unitById: { ...core.unitById, [clone.id]: clone } };
    const combined = reverseCounters(target('冲击步兵'), [base, clone], localCore, civNames, null, { civ: '', age: null });
    const combinedRows = combined.groups[0]?.rows;
    expect(combinedRows).toHaveLength(1);
    expect(combinedRows?.[0]?.unit.id).toBe(1658);
    expect(combinedRows?.[0]?.members.map((unit) => unit.id)).toEqual([1658, 3_000_000]);

    // #1478 有意替代旧行为：未筛选态下 1658/1660 与 1659/1661 按战斗+造价+中英文名合并
    const mergedSerjeants = query(target('冲击步兵'), [base, core.unitById[1660]!]);
    expect(mergedSerjeants.groups[0]?.rows).toHaveLength(1);
    expect(mergedSerjeants.groups[0]?.rows[0]?.unit.id).toBe(1658);
    expect(mergedSerjeants.groups[0]?.rows[0]?.members.map((unit) => unit.id)).toEqual([1658, 1660]);

    const mergedEliteSerjeants = query(target('冲击步兵'), [core.unitById[1659]!, core.unitById[1661]!]);
    expect(mergedEliteSerjeants.groups[0]?.rows).toHaveLength(1);
    expect(mergedEliteSerjeants.groups[0]?.rows[0]?.unit.id).toBe(1659);
    expect(mergedEliteSerjeants.groups[0]?.rows[0]?.members.map((unit) => unit.id)).toEqual([1659, 1661]);

    // 封建时代前置筛选先剔除城堡 1658，仅留城楼 1660 单成员
    const feudalSicilians = query(target('冲击步兵'), [base, core.unitById[1660]!], { civ: 'Sicilians', age: 2 }, trees);
    expect(feudalSicilians.groups[0]?.rows).toHaveLength(1);
    expect(feudalSicilians.groups[0]?.rows[0]?.unit.id).toBe(1660);
    expect(feudalSicilians.groups[0]?.rows[0]?.members.map((unit) => unit.id)).toEqual([1660]);
  });

  it('不递归比较有效前置形态差异，且仍先筛每个实际记录再合并', () => {
    const base = core.unitById[1658]!;
    const predecessor = core.unitById[38]!;
    const changedPredecessor = { ...predecessor, id: 3_000_010, b: predecessor.b + 10_000, bz: '另一建筑', ben: 'Other building', hp: predecessor.hp + 1 };
    const first = { ...base, id: 3_000_011, from_: predecessor.id };
    const equivalent = { ...first, id: 3_000_012, b: first.b + 10_001, bz: '另一建筑', ben: 'Other building', from_: changedPredecessor.id };
    const indexed = {
      ...core,
      unitById: { ...core.unitById, [first.id]: first, [equivalent.id]: equivalent, [changedPredecessor.id]: changedPredecessor },
    };
    const combined = reverseCounters(target('冲击步兵'), [first, equivalent], indexed, civNames, null, { civ: '', age: null });
    expect(combined.groups[0]?.rows).toHaveLength(1);
    expect(combined.groups[0]?.rows[0]?.members.map((unit) => unit.id)).toEqual([3_000_011, 3_000_012]);

    const actual = core.unitById[93]!;
    const unavailableCopy = { ...actual, id: 3_000_013, b: actual.b + 10_002, bz: '另一建筑', ben: 'Other building' };
    const eligibilityIndex = { ...core, unitById: { ...core.unitById, [unavailableCopy.id]: unavailableCopy } };
    const filtered = reverseCounters(core.unitById[40]!, [actual, unavailableCopy], eligibilityIndex, ['Armenians'], trees, { civ: 'Armenians', age: 1 });
    const cavalryRows = filtered.groups.find((group) => group.category === '骑兵')?.rows;
    expect(cavalryRows?.map((row) => row.unit.id)).toEqual([93]);
    expect(cavalryRows?.[0]?.members.map((unit) => unit.id)).toEqual([93]);
  });

  it('筛选使用真实科技树与 unitAvailable，而不是目录文明列表推测', () => {
    const targetUnit = core.unitById[38]!;
    const candidates = [core.unitById[93]!, core.unitById[359]!];
    const early = reverseCounters(targetUnit, candidates, core, civNames, trees, { civ: 'Armenians', age: 1 });
    expect(early.state).toBe('ready');
    expect(early.groups.flatMap((group) => group.rows.map((row) => row.unit.id))).toContain(93);
    expect(early.groups.flatMap((group) => group.rows.map((row) => row.unit.id))).not.toContain(359);

    const broken = { ...trees, t: { ...trees.t, Armenians: undefined } } as unknown as Trees;
    const unknown = reverseCounters(targetUnit, candidates, core, civNames, broken, { civ: 'Armenians', age: 1 });
    expect(unknown.state).toBe('availability-unknown');
    expect(unknown.groups).toEqual([]);
  });

  it('不把未知目标类别或坏类别数值伪装成可信零匹配', () => {
    const unknownTarget = query(target('类别17'), [core.unitById[1658]!]);
    expect(unknownTarget.state).toBe('partial');
    expect(unknownTarget.groups).toEqual([]);
    expect(unknownTarget.problems.join(' ')).toContain('类别名称无法识别');

    const malformed = { ...core.unitById[1658]!, id: 3_000_001, atks: [['冲击步兵', Number.NaN]] } as Unit;
    const partial = query(target('冲击步兵'), [core.unitById[1660]!, malformed]);
    expect(partial.state).toBe('partial');
    expect(partial.groups[0]?.rows.map((row) => row.unit.id)).toEqual([1660]);
  });

  it('目标或反制单位存在坏 pair 时保留可确认类别但不信任 PK', () => {
    const partialTarget = { ...core.unitById[761]!, armc: [['步兵', 0], null] } as unknown as Unit;
    const retained = query(partialTarget, [core.unitById[279]!]);
    expect(retained.state).toBe('partial');
    expect(retained.groups.find((group) => group.category === '步兵')?.rows[0]?.unit.id).toBe(279);

    const partialCounter = { ...core.unitById[279]!, atks: [null, ['步兵', 2]] } as unknown as Unit;
    const counterResult = query(core.unitById[761]!, [partialCounter]);
    expect(counterResult.state).toBe('partial');
    expect(counterResult.groups.find((group) => group.category === '步兵')?.rows[0]?.attack).toBe(2);

    const badTarget = { ...core.unitById[93]!, atks: [null, ['步兵', 3]] } as unknown as Unit;
    const badCounter = { ...core.unitById[5]!, arms: [['步兵', 0, 'extra']] } as unknown as Unit;
    expect(reverseCounterDuelHref(badTarget, core.unitById[5]!, core, trees, 'Franks', 'Bohemians', 3)).toBeNull();
    expect(reverseCounterDuelHref(core.unitById[93]!, badCounter, core, trees, 'Franks', 'Bohemians', 3)).toBeNull();
  });

  it('在结算后才筛正贡献，保留负攻击与负护甲语义', () => {
    const negativeAttack = { ...core.unitById[1658]!, id: 3_000_002, atks: [['冲击步兵', -3]] } as Unit;
    const positive = query(target('冲击步兵', -5), [negativeAttack]);
    expect(positive.groups[0]?.rows[0]).toMatchObject({ attack: -3, armor: -5, damage: 2 });
    expect(query(target('冲击步兵'), [negativeAttack]).groups[0]?.rows).toEqual([]);

    const duplicateArmor = {
      ...target('冲击步兵'),
      armc: [
        ['冲击步兵', 0],
        ['冲击步兵', 0],
      ],
    } as Unit;
    expect(query(duplicateArmor, [core.unitById[1658]!]).state).toBe('unreadable');

    const noArmor = { ...target('冲击步兵'), armc: [] } as Unit;
    expect(query(noArmor, [core.unitById[1658]!])).toMatchObject({ state: 'ready', groups: [], problems: [] });
    const ordinaryOnly = {
      ...target('冲击步兵'),
      armc: [
        ['近战', 0],
        ['穿刺', 0],
      ],
    } as Unit;
    expect(query(ordinaryOnly, [core.unitById[1658]!])).toMatchObject({ state: 'ready', groups: [], problems: [] });
  });

  it('不因名称或本次贡献相同而合并基础字段不同的形态', () => {
    const base = core.unitById[1658]!;
    const different = { ...base, id: 3_000_003, b: base.b + 10_001, hp: base.hp + 1 };
    const result = query(target('冲击步兵'), [base, different]);
    expect(result.groups[0]?.rows.map((row) => row.unit.id)).toEqual([1658, 3_000_003]);
  });

  it('仅双方同文明且同一真实可用时代时序列化 PK 参数', () => {
    const href = reverseCounterDuelHref(core.unitById[38]!, core.unitById[93]!, core, trees, 'Armenians', 'Armenians', 3);
    expect(href).toBe('/duel?a=38.Armenians.3..&b=93.Armenians.3..&m=1');
    expect(reverseCounterDuelHref(core.unitById[38]!, core.unitById[93]!, core, trees, '', 'Armenians', 3)).toBeNull();
    expect(reverseCounterDuelHref(core.unitById[38]!, core.unitById[93]!, core, trees, 'Armenians', 'Armenians', 1)).toBeNull();
    expect(reverseCounterDuelHref(core.unitById[93]!, core.unitById[5]!, core, trees, 'Franks', 'Bohemians', 3)).toBe(
      '/duel?a=93.Franks.3..&b=5.Bohemians.3..&m=1',
    );
    expect(reverseCounterDuelHref(core.unitById[93]!, core.unitById[5]!, core, trees, 'Franks', 'Bohemians', null)).toBeNull();
  });
});

describe('反向类别查询多建筑合并与同名区分（#1478）', () => {
  it('全站 248 单位任意分组内零可见重名，且精确折叠 11 组多建筑变体（248 到 237）', () => {
    const meta = buildReverseCounterCatalogMeta(core.units, core.unitById);
    expect(core.units).toHaveLength(248);
    expect(meta.canonicalUnits).toHaveLength(237);

    const expectedMergedPairs: [number, number][] = [
      [41, 759],
      [555, 761],
      [93, 1786],
      [358, 1787],
      [359, 1788],
      [755, 886],
      [757, 887],
      [1225, 1254],
      [1227, 1255],
      [1658, 1660],
      [1659, 1661],
    ];
    expect(meta.multiBuildingUnitIds.size).toBe(expectedMergedPairs.length * 2);
    for (const [repId, altId] of expectedMergedPairs) {
      expect(meta.multiBuildingUnitIds.has(repId)).toBe(true);
      expect(meta.multiBuildingUnitIds.has(altId)).toBe(true);
      expect(meta.canonicalIdByUnitId.get(repId)).toBe(repId);
      expect(meta.canonicalIdByUnitId.get(altId)).toBe(repId);
    }

    for (const unit of core.units) {
      const result = query(unit, core.units);
      expect(result.state, `unit ${unit.id} should be ready`).toBe('ready');
      for (const group of result.groups) {
        const labels = group.rows.map((row) => reverseCounterUnitLabel(core, row.unit, meta, group.rows));
        expect(new Set(labels).size, `unit ${unit.id} group ${group.category} duplicate labels: ${labels.join(', ')}`).toBe(labels.length);
      }
    }
  });

  it('攻城战象、火枪手与帝王骆驼兵典型重灾组按合并行计数并标注训练建筑', () => {
    const meta = buildReverseCounterCatalogMeta(core.units, core.unitById);

    const siegeElephant = query(core.unitById[1746]!, core.units);
    const elephantGroup = siegeElephant.groups.find((group) => group.category === '战象')!;
    expect(elephantGroup.rows).toHaveLength(3);
    expect(elephantGroup.rows.map((row) => row.members.map((m) => m.id))).toEqual([[358, 1787], [359, 1788], [1263]]);
    expect(elephantGroup.rows.map((row) => reverseCounterUnitLabel(core, row.unit, meta, elephantGroup.rows))).toEqual(['长枪兵', '长戟兵', '火焰骆驼']);
    expect(elephantGroup.rows.map((row) => reverseCounterBuildingsText(core, row, meta))).toEqual(['兵营 / 城楼', '兵营 / 城楼', null]);

    const handCannoneer = query(core.unitById[5]!, core.units);
    const archerGroup = handCannoneer.groups.find((group) => group.category === '弓手')!;
    const huskarlRow = archerGroup.rows.find((row) => row.unit.id === 41)!;
    const eliteHuskarlRow = archerGroup.rows.find((row) => row.unit.id === 555)!;
    expect(archerGroup.rows.filter((row) => row.unit.zh === '近卫军')).toHaveLength(1);
    expect(archerGroup.rows.filter((row) => row.unit.zh === '精锐近卫军')).toHaveLength(1);
    expect(huskarlRow.members.map((m) => m.id)).toEqual([41, 759]);
    expect(eliteHuskarlRow.members.map((m) => m.id)).toEqual([555, 761]);
    expect(reverseCounterUnitLabel(core, huskarlRow.unit, meta, archerGroup.rows)).toBe('近卫军');
    expect(reverseCounterUnitLabel(core, eliteHuskarlRow.unit, meta, archerGroup.rows)).toBe('精锐近卫军');
    expect(reverseCounterBuildingsText(core, huskarlRow, meta)).toBe('城堡 / 兵营');
    expect(reverseCounterBuildingsText(core, eliteHuskarlRow, meta)).toBe('城堡 / 兵营');

    const imperialCamel = query(core.unitById[207]!, core.units);
    const camelGroup = imperialCamel.groups.find((group) => group.category === '骆驼')!;
    for (const [repId, altId, zh] of [
      [93, 1786, '长矛兵'],
      [358, 1787, '长枪兵'],
      [359, 1788, '长戟兵'],
    ] as const) {
      const matching = camelGroup.rows.filter((row) => row.unit.zh === zh);
      expect(matching).toHaveLength(1);
      expect(matching[0]!.members.map((m) => m.id)).toEqual([repId, altId]);
      expect(reverseCounterBuildingsText(core, matching[0]!, meta)).toBe('兵营 / 城楼');
    }
  });

  it('保留 3 组独立同名单位（1233/1260、1759/1962、1750/1948）并在同组共存时零重名且不叠建筑胶囊', () => {
    const meta = buildReverseCounterCatalogMeta(core.units, core.unitById);

    // 1233 vs 1260：长戟兵（359）长矛兵组真实共现
    const halberdier = query(core.unitById[359]!, core.units, { civ: 'Cumans', age: null }, trees);
    const spearGroup = halberdier.groups.find((group) => group.category === '长矛兵')!;
    const kipchaks = spearGroup.rows.filter((row) => row.unit.id === 1233 || row.unit.id === 1260);
    expect(kipchaks.map((row) => row.unit.id)).toEqual([1233, 1260]);
    expect(kipchaks.map((row) => reverseCounterUnitLabel(core, row.unit, meta, spearGroup.rows))).toEqual(['精锐钦察', '精锐钦察（库曼雇佣兵）']);
    expect(kipchaks.map((row) => reverseCounterBuildingsText(core, row, meta))).toEqual([null, null]);

    // 1759/1962 战车与 1750/1948 楼船在真实 248 单位中不共现于同一分组；用构造目标覆盖同组共存不合并且零重名
    const sharedClass = '测试共用类';
    const chariotA = { ...core.unitById[1759]!, atks: [...core.unitById[1759]!.atks, [sharedClass, 5] as [string, number]] };
    const chariotB = { ...core.unitById[1962]!, atks: [...core.unitById[1962]!.atks, [sharedClass, 5] as [string, number]] };
    const shipA = { ...core.unitById[1750]!, atks: [...core.unitById[1750]!.atks, [sharedClass, 5] as [string, number]] };
    const shipB = { ...core.unitById[1948]!, atks: [...core.unitById[1948]!.atks, [sharedClass, 5] as [string, number]] };
    const syntheticRes = query(target(sharedClass), [chariotA, chariotB, shipA, shipB]);
    const syntheticRows = syntheticRes.groups[0]!.rows;
    expect(syntheticRows.map((row) => row.unit.id)).toEqual([1750, 1759, 1948, 1962]);
    const labels = syntheticRows.map((row) => reverseCounterUnitLabel(core, row.unit, meta, syntheticRows));
    expect(labels).toEqual(['楼船（Thirisadai）', '战车（城堡）', '楼船（Lou Chuan）', '战车（攻城武器厂）']);
    expect(new Set(labels).size).toBe(4);
    expect(syntheticRows.map((row) => reverseCounterBuildingsText(core, row, meta))).toEqual([null, null, null, null]);
  });

  it('筛选前置在西西里帝王/封建下精确收窄建筑，且合并行 PK 成员自动解析零误报', () => {
    const meta = buildReverseCounterCatalogMeta(core.units, core.unitById);

    const imperial = query(core.unitById[2586]!, core.units, { civ: 'Sicilians', age: 4 }, trees);
    const impShock = imperial.groups.find((group) => group.category === '冲击步兵')!;
    const impSerjeant = impShock.rows.find((row) => row.unit.id === 1658)!;
    const impEliteSerjeant = impShock.rows.find((row) => row.unit.id === 1659)!;
    expect(impSerjeant.members.map((m) => m.id)).toEqual([1658, 1660]);
    expect(impEliteSerjeant.members.map((m) => m.id)).toEqual([1659, 1661]);
    expect(reverseCounterBuildingsText(core, impSerjeant, meta)).toBe('城堡 / 城楼');
    expect(reverseCounterBuildingsText(core, impEliteSerjeant, meta)).toBe('城堡 / 城楼');

    // 2586 神庙护卫封建仅留 1660 单成员（主标题干净无后缀，胶囊显示「城楼」）
    const feudal2586 = query(core.unitById[2586]!, core.units, { civ: 'Sicilians', age: 2 }, trees);
    const feuShock2586 = feudal2586.groups.find((group) => group.category === '冲击步兵')!;
    const feuSerjeant = feuShock2586.rows.find((row) => row.unit.id === 1660)!;
    expect(feuShock2586.rows.some((row) => row.unit.id === 1658)).toBe(false);
    expect(feuSerjeant.members.map((m) => m.id)).toEqual([1660]);
    expect(reverseCounterUnitLabel(core, feuSerjeant.unit, meta, feuShock2586.rows)).toBe('萨金特卫兵');
    expect(reverseCounterBuildingsText(core, feuSerjeant, meta)).toBe('城楼');
    // 2586 自身是城堡时代单位，封建 PK 链接须为 null
    expect(reverseCounterDuelHref(core.unitById[2586]!, feuSerjeant.unit, core, trees, 'Muisca', 'Sicilians', 2)).toBeNull();

    // 封建可用冲击步兵目标 751 鹰斥候可完整生成 1660 的封建 PK 链接
    const feudal751 = query(core.unitById[751]!, core.units, { civ: 'Sicilians', age: 2 }, trees);
    const feuShock751 = feudal751.groups.find((group) => group.category === '冲击步兵')!;
    const feu751Spear = feuShock751.rows.find((row) => row.unit.id === 93)!;
    const feu751Serjeant = feuShock751.rows.find((row) => row.unit.id === 1660)!;
    expect(reverseCounterBuildingsText(core, feu751Spear, meta)).toBe('兵营 / 城楼');
    expect(reverseCounterBuildingsText(core, feu751Serjeant, meta)).toBe('城楼');
    expect(reverseCounterDuelHref(core.unitById[751]!, feu751Serjeant.unit, core, trees, 'Mayans', 'Sicilians', 2)).toBe(
      '/duel?a=751.Mayans.2..&b=1660.Sicilians.2..&m=1',
    );

    // 合并行 PK 成员自动解析：代表可用优先代表，不可用自动回退首个可用成员，全部不可用/缺信息回落代表
    const mergedRow = { unit: core.unitById[1658]!, members: [core.unitById[1658]!, core.unitById[1660]!] };
    expect(resolveReverseCounterPkMember(mergedRow, core, trees, 'Sicilians', 4).id).toBe(1658);
    expect(resolveReverseCounterPkMember(mergedRow, core, trees, 'Sicilians', null).id).toBe(1658);
    expect(resolveReverseCounterPkMember(mergedRow, core, trees, 'Sicilians', 2).id).toBe(1660);
    expect(resolveReverseCounterPkMember(mergedRow, core, trees, 'Sicilians', 1).id).toBe(1658);
    expect(resolveReverseCounterPkMember(mergedRow, core, trees, '', 2).id).toBe(1658);
    expect(resolveReverseCounterPkMember(mergedRow, core, null, 'Sicilians', 2).id).toBe(1658);

    // 若某文明仅能从城楼训练 1787 而无兵营 358，代表不可用时回退 1787
    const pikemanWithoutSicilians = { ...core.unitById[358]!, civs: core.unitById[358]!.civs.filter((c) => c !== 'Sicilians') };
    const customCore = { ...core, unitById: { ...core.unitById, 358: pikemanWithoutSicilians } };
    const pikemanMerged = { unit: pikemanWithoutSicilians, members: [pikemanWithoutSicilians, core.unitById[1787]!] };
    expect(resolveReverseCounterPkMember(pikemanMerged, customCore, trees, 'Sicilians', 3).id).toBe(1787);
  });
});
