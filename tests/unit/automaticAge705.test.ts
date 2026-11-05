import { describe, expect, it } from 'vitest';
import units from '../../src/data/raw/units';
import buildings from '../../src/data/raw/buildings';
import { DAT } from '../../src/domain/datEffects';
import type { Building, Unit } from '../../src/domain/types';
import { scoutAgeChange } from '../../src/features/units/components/ScoutAgeChanges';
import { wallAgeChange } from '../../src/features/buildings/components/WallAgeChanges';

const scout = units.find((unit) => unit.id === 448)! as unknown as Unit;
const wall = (id: number) => buildings.find((building) => building.id === id)! as unknown as Building;

describe('有来源的局部自动时代投影 #705', () => {
  it('侦察三项来自tech20，不受目录age=2裁切', () => {
    const result = scoutAgeChange(scout);
    expect(result?.state).toBe('ready');
    if (result?.state !== 'ready') throw new Error('missing scout rule');
    expect(result.age).toBe(2);
    expect(result.before.atk).toBe(3);
    expect(result.after.atk).toBe(5);
    expect(result.before.los).toBe(4);
    expect(result.after.los).toBe(6);
    expect(result.before.spd).toBe(1.2);
    expect(result.after.spd).toBeCloseTo(1.55);
  });

  it.each([
    [72, 150, 250, 2, 1.66667],
    [792, 240, 400, 2, 1.66667],
    [117, 1080, 1800, 3, 1.666667],
    [487, 1650, 2750, 3, 1.666667],
  ])('墙门%i保留原始倍率并沿既有HP取整', (id, before, after, age, multiplier) => {
    expect(wallAgeChange(wall(id))).toMatchObject({ state: 'ready', before, after, age, multiplier });
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
    expect(scoutAgeChange(unit, source)).toMatchObject({ state: 'ready', before: { atk: 8 }, after: { atk: 17 } });
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

  it.each(['missing', 'research', 'any', 'type', 'partial'])('不把%s来源冒充自动规则', (kind) => {
    const source = structuredClone(DAT.generic).filter((entry) => entry.tech === 20);
    if (kind === 'missing') source.length = 0;
    if (kind === 'research') source[0]!.req = ['Fletching'];
    if (kind === 'any') source[0]!.any = true;
    const rule = source[0]?.rules.find((entry) => entry.t.includes(448));
    if (kind === 'type' && rule) rule.b = 1;
    if (kind === 'partial' && rule) rule.fx = rule.fx.filter((effect) => effect.s !== 'spd');
    expect(scoutAgeChange(scout, source)).toEqual({ state: 'pending' });
  });

  it('缺基底/来源待确认，未锁对象没有卡片', () => {
    expect(scoutAgeChange({ ...scout, spd: Number.NaN })).toEqual({ state: 'pending' });
    expect(wallAgeChange({ ...wall(72), hp: Number.NaN })).toEqual({ state: 'pending' });
    expect(wallAgeChange(wall(72), [])).toEqual({ state: 'pending' });
    expect(scoutAgeChange({ ...scout, id: 751 })).toBeNull();
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
