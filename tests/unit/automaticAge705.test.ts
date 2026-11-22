import { describe, expect, it } from 'vitest';
import units from '../../src/data/raw/units';
import buildings from '../../src/data/raw/buildings';
import { DAT } from '../../src/domain/datEffects';
import type { Building, Unit } from '../../src/domain/types';
import { formatHp } from '../../src/domain/hpFormat';
import { unitAgeChanges } from '../../src/domain/unitAgeChanges';
import { wallAgeChange } from '../../src/features/buildings/components/WallAgeChanges';

const scout = units.find((unit) => unit.id === 448)! as unknown as Unit;
const knight = units.find((unit) => unit.id === 38)! as unknown as Unit;
const wall = (id: number) => buildings.find((building) => building.id === id)! as unknown as Building;

describe('有来源的局部自动时代投影 #705 / #1339', () => {
  it('侦察骑兵三时代自动变化由数据规则驱动，封建/城堡/帝王连续推演', () => {
    const result = unitAgeChanges(scout);
    expect(result?.state).toBe('ready');
    if (result?.state !== 'ready') throw new Error('missing scout rule');
    expect(result.earliestAge).toBe(1);
    expect(result.upgradeStages.map((stage) => stage.age)).toEqual([2, 3, 4]);
    const feudal = Object.fromEntries(result.upgradeStages[0]!.rows.map((row) => [row.key, row]));
    expect(feudal.atk?.before).toBe(3);
    expect(feudal.atk?.after).toBe(5);
    expect(feudal.los?.before).toBe(4);
    expect(feudal.los?.after).toBe(6);
    expect(feudal.spd?.before).toBe(1.2);
    expect(feudal.spd?.after).toBeCloseTo(1.55);
    expect(result.upgradeStages[1]!.rows[0]?.after).toBe(8);
    expect(result.upgradeStages[2]!.rows[0]?.after).toBe(10);
  });

  it.each([
    [72, 150, 250, 2, 1.66667],
    [792, 240, 400, 2, 1.66667],
    [117, 1080, 1800, 3, 1.666667],
    [487, 1650, 2750, 3, 1.666667],
  ])('墙门%i保留原始倍率，生命展示仍是两位', (id, before, after, age, multiplier) => {
    const change = wallAgeChange(wall(id));
    expect(change).toMatchObject({ state: 'ready', before, age, multiplier });
    if (change?.state !== 'ready') throw new Error('missing wall rule');
    expect(change.after).toBeCloseTo(before * multiplier, 6);
    expect(formatHp(change.after)).toBe(formatHp(after));
  });

  it('来源和基底改变时结果随之变化，输入保持不变', () => {
    const source = structuredClone(DAT.generic);
    const original = structuredClone(source);
    const unit = structuredClone(scout);
    unit.atk = 8;
    const rule = source.find((entry) => entry.tech === 20)!.rules.find((entry) => entry.t.includes(448))!;
    rule.fx.find((effect) => effect.s === 'atk')!.v = 9;
    const changed = structuredClone(source);
    const beforeUnit = structuredClone(unit);
    const res = unitAgeChanges(unit, undefined, { generic: source });
    expect(res?.state).toBe('ready');
    if (res?.state === 'ready') {
      const atk = res.upgradeStages[0]!.rows.find((row) => row.key === 'atk')!;
      expect(atk.before).toBe(8);
      expect(atk.after).toBe(17);
    }
    expect(source).toEqual(changed);
    expect(unit).toEqual(beforeUnit);
    expect(DAT.generic).toEqual(original);
    const building = structuredClone(wall(72));
    building.hp = 200;
    const hp = source
      .find((entry) => entry.tech === 72)!
      .rules.find((entry) => entry.t.includes(72))!
      .fx.find((effect) => effect.s === 'hp')!;
    hp.v = 2;
    const beforeBuilding = structuredClone(building);
    const beforeSource = structuredClone(source);
    expect(wallAgeChange(building, source)).toMatchObject({ state: 'ready', before: 200, after: 400, multiplier: 2 });
    expect(building).toEqual(beforeBuilding);
    expect(source).toEqual(beforeSource);
  });

  it.each(['missing', 'research', 'any', 'type'] as const)('零白名单规则引擎不把 %s 来源冒充单位自动规则，返回 null', (kind) => {
    const source = structuredClone(DAT.generic).filter((entry) => entry.tech === 20);
    if (kind === 'missing') source.length = 0;
    if (kind === 'research') source[0]!.req = ['Fletching'];
    if (kind === 'any') source[0]!.any = true;
    const rule = source[0]?.rules.find((entry) => entry.t.includes(448));
    if (kind === 'type' && rule) rule.b = 1;
    expect(unitAgeChanges(scout, undefined, { generic: source })).toBeNull();
  });

  it('partial 仅保留数据中实际存在的属性项，损坏基底/非法规则才返回 pending', () => {
    const source = structuredClone(DAT.generic).filter((entry) => entry.tech === 20);
    const rule = source[0]!.rules.find((entry) => entry.t.includes(448))!;
    rule.fx = rule.fx.filter((effect) => effect.s !== 'spd');
    const partial = unitAgeChanges(scout, undefined, { generic: source });
    expect(partial?.state).toBe('ready');
    if (partial?.state === 'ready') {
      expect(partial.upgradeStages[0]!.rows.map((row) => row.key)).toEqual(['atk', 'los']);
    }

    expect(unitAgeChanges({ ...scout, spd: Number.NaN })).toEqual({ state: 'pending' });
    expect(wallAgeChange({ ...wall(72), hp: Number.NaN })).toEqual({ state: 'pending' });
    expect(wallAgeChange(wall(72), [])).toEqual({ state: 'pending' });
    expect(unitAgeChanges(knight)).toBeNull();
    expect(wallAgeChange(wall(70))).toBeNull();
  });

  it.each(['research', 'any', 'type', 'hp'])('墙门独立拒绝%s非自动/缺失来源', (kind) => {
    const source = structuredClone(DAT.generic).filter((entry) => entry.tech === 72);
    const entry = source[0]!;
    if (kind === 'research') entry.req = ['Fletching'];
    if (kind === 'any') entry.any = true;
    if (kind === 'type')
      entry.rules.forEach((rule) => {
        delete rule.b;
      });
    if (kind === 'hp')
      entry.rules.forEach((rule) => {
        rule.fx = [];
      });
    expect(wallAgeChange(wall(72), source)).toEqual({ state: 'pending' });
  });
});
