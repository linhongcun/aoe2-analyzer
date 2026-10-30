import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import { unitProductionEntry } from '../../src/domain/unitProductionEntry';
import { productionTechs, type ProductionContext } from '../../src/domain/production';

let ctx: ProductionContext;
beforeAll(async () => {
  ctx = { core: await loadCore(), trees: await loadTrees() };
});

describe('#531 单位到生产的条件映射', () => {
  it('保留单位、文明与时代，建筑数保持待填写', () => {
    const entry = unitProductionEntry(ctx, { unit: 38, civ: 'Franks', age: 3 });
    expect(entry.config.civ).toBe('Franks');
    expect(entry.config.age).toBe(3);
    expect(entry.config.rows).toEqual([{ unit: 38, building: 101, count: '' }]);
    expect(entry.errors).toEqual([]);
  });

  it('只带入生产模型支持的已选科技，战斗科技列为未带入', () => {
    const entry = unitProductionEntry(ctx, { unit: 38, civ: 'Franks', age: 4, techs: [315, 67, 315] });
    const supported = productionTechs(ctx, entry.config).map((t) => t.id);
    expect(entry.config.techs.every((id) => supported.includes(id))).toBe(true);
    expect(entry.config.techs).toContain(315);
    expect(entry.omittedTechs).toEqual([67]);
  });

  it('本文明没有单位时保留该文明和单位，并说明无法生产', () => {
    const entry = unitProductionEntry(ctx, { unit: 38, civ: 'Aztecs', age: 3 });
    expect(entry.config.civ).toBe('Aztecs');
    expect(entry.config.rows[0]!.unit).toBe(38);
    expect(entry.errors.length).toBeGreaterThan(0);
  });

  it('时代不足不偷偷提升时代', () => {
    const entry = unitProductionEntry(ctx, { unit: 38, civ: 'Franks', age: 2 });
    expect(entry.config.age).toBe(2);
    expect(entry.errors.length).toBeGreaterThan(0);
    expect(entry.config.rows[0]!.count).toBe('');
  });

  it('未知文明、时代和单位不以默认选择替代', () => {
    const entry = unitProductionEntry(ctx, { unit: 999999, civ: 'Unknown', age: 0 });
    expect(entry.config.civ).toBe('Unknown');
    expect(entry.config.age).toBe(0);
    expect(entry.config.rows[0]!.unit).toBe(999999);
    expect(entry.errors.length).toBeGreaterThan(0);
  });
});
