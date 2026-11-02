import { describe, expect, it } from 'vitest';
import buildingsRaw from '../../src/data/buildings.json';
import { calculateSiege, decodeSiege, siegeUnitEntryVerified, SIEGE_UNIT_IDS } from '../../src/domain/siege';
import type { Building } from '../../src/domain/types';
import { units } from './helpers';

const buildings = buildingsRaw as unknown as Building[];
const castle = buildings.find((building) => building.id === 82)!;

describe('攻城入口支持范围 #631', () => {
  it.each([74, 1923])('底层可计算但工具未收录的单位 %i 不承诺计算入口', (id) => {
    const unit = units.find((candidate) => candidate.id === id)!;
    expect(calculateSiege(unit, castle, 4).verified).toBe(true);
    expect(SIEGE_UNIT_IDS).not.toContain(id);
    expect(siegeUnitEntryVerified(unit, castle)).toBe(false);
  });

  it('生成目录里所有显示入口的单位都能被工具原样接受', () => {
    const entries = units.filter((unit) => siegeUnitEntryVerified(unit, castle));
    expect(entries.length).toBeGreaterThan(0);
    for (const unit of entries) {
      expect(decodeSiege(`?unit=${unit.id}`, { units, buildings }).unit, `${unit.zh} / ${unit.id}`).toBe(unit.id);
    }
    expect(entries.map((unit) => unit.id)).toEqual(expect.arrayContaining([1258, 422, 548, 331]));
    expect(siegeUnitEntryVerified(entries[0]!, undefined)).toBe(false);
  });
});
