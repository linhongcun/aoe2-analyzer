import { beforeAll, describe, expect, it } from 'vitest';
import { civs, loadCore, loadTrees, type Core } from '../../src/data';
import { damageRows } from '../../src/domain/damageCore';
import { reverseCounterDuelHref, reverseCounters } from '../../src/domain/reverseCounters';
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
    expect(query(core.unitById[1263]!, [core.unitById[38]!]).groups.find((item) => item.category === '村民')?.rows).toEqual([]);
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

  it('只有完整基础字段相同且来自不同训练建筑时才合并；1658 与 1660 保持独立', () => {
    const base = core.unitById[1658]!;
    const clone = { ...base, id: 3_000_000, b: base.b + 10_000, bz: '另一训练建筑', ben: 'Another building' };
    const localCore = { ...core, unitById: { ...core.unitById, [clone.id]: clone } };
    const combined = reverseCounters(target('冲击步兵'), [base, clone], localCore, civNames, null, { civ: '', age: null });
    const combinedRows = combined.groups[0]?.rows;
    expect(combinedRows).toHaveLength(1);
    expect(combinedRows?.[0]?.unit.id).toBe(1658);
    expect(combinedRows?.[0]?.members.map((unit) => unit.id)).toEqual([1658, 3_000_000]);

    const separate = query(target('冲击步兵'), [base, core.unitById[1660]!]);
    expect(separate.groups[0]?.rows.map((row) => row.unit.id)).toEqual([1658, 1660]);
  });

  it('只在前置记录的完整形态也等价时归一化前置 ID，并先筛每个实际记录再合并', () => {
    const base = core.unitById[1658]!;
    const predecessor = core.unitById[38]!;
    const predecessorCopy = { ...predecessor, id: 3_000_010, b: predecessor.b + 10_000, bz: '另一建筑', ben: 'Other building' };
    const first = { ...base, id: 3_000_011, from_: predecessor.id };
    const equivalent = { ...first, id: 3_000_012, b: first.b + 10_001, bz: '另一建筑', ben: 'Other building', from_: predecessorCopy.id };
    const indexed = {
      ...core,
      unitById: { ...core.unitById, [first.id]: first, [equivalent.id]: equivalent, [predecessorCopy.id]: predecessorCopy },
    };
    const combined = reverseCounters(target('冲击步兵'), [first, equivalent], indexed, civNames, null, { civ: '', age: null });
    expect(combined.groups[0]?.rows).toHaveLength(1);

    const changedPredecessor = { ...predecessorCopy, hp: predecessorCopy.hp + 1 };
    const changedChild = { ...equivalent, from_: changedPredecessor.id };
    const changedIndex = {
      ...indexed,
      unitById: { ...indexed.unitById, [changedChild.id]: changedChild, [changedPredecessor.id]: changedPredecessor },
    };
    const distinct = reverseCounters(target('冲击步兵'), [first, changedChild], changedIndex, civNames, null, { civ: '', age: null });
    expect(distinct.groups[0]?.rows).toHaveLength(2);

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
