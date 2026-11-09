import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COUNTER_EXTRA_GROUPS, COUNTER_UNITS, filterCounterUnits } from '../../src/domain/ratings';
import { availableUnitAge, displayUnitAge, EARLY_UNIT_AGES, trainingUnitAge } from '../../src/domain/availabilityAge';
import { buildingType, EXPLICIT_OTHER_BUILDINGS, TYPE_BY_EN } from '../../src/domain/buildings';

interface Unit {
  id: number;
  zh: string;
  en: string;
  age: number;
  civs: string[];
}
interface Building {
  id: number;
  en: string;
}

const units = JSON.parse(readFileSync('src/data/units.json', 'utf8')) as Unit[];
const buildings = JSON.parse(readFileSync('src/data/buildings.json', 'utf8')) as Building[];
const unitIds = new Set(units.map((unit) => unit.id));

describe('反制、提前解锁与建筑类型映射（issue 837）', () => {
  it('反制表与补充组的所有 id 都能在 units.json 解析', () => {
    for (const [type, list] of Object.entries(COUNTER_UNITS)) {
      for (const id of list) expect(unitIds.has(id), `${type}: ${id}`).toBe(true);
    }
    for (const [group, list] of Object.entries(COUNTER_EXTRA_GROUPS)) {
      for (const id of list) expect(unitIds.has(id), `${group}: ${id}`).toBe(true);
    }
  });

  it('侦察骑兵按数据名显示为斥候骑兵，同名变体不作为规范项', () => {
    expect(units.find((unit) => unit.id === 448)?.zh).toBe('斥候骑兵');
    expect(units.some((unit) => unit.zh === '侦察骑兵')).toBe(false);
    expect(filterCounterUnits('Britons', ['arch'], units).map((unit) => unit.nameZh)).toContain('斥候骑兵');
    expect(filterCounterUnits('Britons', ['arch'], units).map((unit) => unit.id)).not.toContain(1786);
    for (const list of Object.values(COUNTER_UNITS)) {
      for (const variant of [1786, 1787, 1788]) expect(list).not.toContain(variant);
    }
    expect(COUNTER_EXTRA_GROUPS.cavalry).toContain(448);
    expect(COUNTER_EXTRA_GROUPS.lightCavalry).toContain(1707);
  });

  it('提前解锁表覆盖全部条目，且四种口径不改变行为', () => {
    for (const [civ, rows] of Object.entries(EARLY_UNIT_AGES)) {
      for (const [rawId, age] of Object.entries(rows)) {
        const id = Number(rawId);
        expect(availableUnitAge(civ, id, 99, 99), `${civ}:${id}`).toBe(age);
        expect(trainingUnitAge(civ, id, 99)).toBe(Math.max(age, id === 93 ? 2 : 1));
      }
    }
    expect(availableUnitAge('Armenians', 93, 1, 1)).toBe(1);
    expect(trainingUnitAge('Armenians', 93, 1)).toBe(2);
    expect(trainingUnitAge('Franks', 93, 1)).toBe(2);
    expect(displayUnitAge(93, 1, 'Armenians')).toBe(1);
    expect(displayUnitAge(93, 1, 'Franks')).toBe(2);
    expect(displayUnitAge(38, 3, 'Franks')).toBe(3);
  });

  it('38 个建筑都显式分类，未知名称失败而不是静默归 other', () => {
    const classified = new Set([...Object.keys(TYPE_BY_EN), ...Object.keys(EXPLICIT_OTHER_BUILDINGS)]);
    expect(buildings).toHaveLength(38);
    expect(classified.size).toBe(38);
    for (const building of buildings) expect(classified.has(building.en), building.en).toBe(true);
    expect(Object.keys(EXPLICIT_OTHER_BUILDINGS)).toHaveLength(5);
    expect(buildingType('University')).toBe('other');
    expect(() => buildingType('Not a real building')).toThrow(/未登记建筑类型/);
    expect(() => buildingType('constructor')).toThrow(/未登记建筑类型/);
  });

  it('行到时代公式与 93 例外只在 availabilityAge 中维护', () => {
    const availability = readFileSync('src/domain/availabilityAge.ts', 'utf8');
    const production = readFileSync('src/domain/production.ts', 'utf8');
    const garrison = readFileSync('src/domain/garrisonGeneral.ts', 'utf8');
    const display = readFileSync('src/features/units/displayAge.ts', 'utf8');
    expect(availability).toContain('Math.floor(row / 2) + 1');
    for (const source of [production, garrison, display]) {
      expect(source).not.toContain('Math.floor(row / 2) + 1');
      expect(source).not.toContain('id === 93');
      expect(source).not.toContain('u.id === 93');
    }
  });
});
