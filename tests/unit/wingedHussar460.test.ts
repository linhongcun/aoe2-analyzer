import { describe, expect, it } from 'vitest';
import { regionalUnitLines } from '../../src/domain/civUnits';
import { buildFamilies, unitCount } from '../../src/domain/family';
import { upgradeLine } from '../../src/domain/units';
import { civStatus } from '../../src/domain/civStatus';
import { trees, units } from './helpers';

const byId = Object.fromEntries(units.map((u) => [u.id, u]));
const winged = byId[1707]!;

describe('#460 波兰翼骑兵统一归区域单位', () => {
  it('生成目录类型正确且名称、两文明、时代及升级链保留', () => {
    expect(winged.type).toBe('RegionalUnit');
    expect(winged.zh).toBe('波兰翼骑兵');
    expect(winged.en).toBe('Winged Hussar');
    expect(winged.civs).toEqual(['Lithuanians', 'Poles']);
    expect(winged.age).toBe(4);
    expect(winged.from_).toBe(546);
    expect(byId[441]!.type).toBe('UnitUpgrade');
    expect(byId[207]!.type).toBe('UniqueUnit');
  });
  it.each(['Poles', 'Lithuanians'])('%s 区域区包含且独特区排除，文明可用分叉仍为波兰翼骑兵', (civ) => {
    expect(
      regionalUnitLines(civ, units)
        .flat()
        .filter((u) => u.id === 1707),
    ).toEqual([winged]);
    expect(units.filter((u) => u.type === 'UniqueUnit' && u.civs.includes(civ)).map((u) => u.id)).not.toContain(1707);
    const status = civStatus(trees, civ);
    const available = (id: number) => status['u' + id] === 1;
    expect(status.u1707).toBe(1);
    expect(available(441)).toBe(false);
    expect(upgradeLine(byId[448]!, units, byId, available).map((u) => u.id)).toEqual([448, 546, 1707]);
  });
  it('通用升级路线保持普通翼骑兵，单位总数及原始数目不变', () => {
    expect(upgradeLine(byId[448]!, units, byId).map((u) => u.id)).toEqual([448, 546, 441]);
    expect(units).toHaveLength(248);
    expect(unitCount(units, buildFamilies(units, byId))).toBe(163);
    expect(
      regionalUnitLines('Chinese', units)
        .flat()
        .map((u) => u.id),
    ).not.toContain(1707);
  });
});
