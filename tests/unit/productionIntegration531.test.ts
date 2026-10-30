import { beforeAll, describe, expect, it } from 'vitest';
import { loadCore, loadTrees } from '../../src/data';
import { calculateProduction, encodeProduction, type ProductionConfig, type ProductionContext } from '../../src/domain/production';
import { calculateEcoPayoff } from '../../src/domain/ecoPayoff';
import { payoffFromProduction, productionAssumption, productionSource, theoreticalProductionWorkers } from '../../src/domain/productionIntegration';

let ctx: ProductionContext;
const source: ProductionConfig = {
  civ: 'Franks',
  age: 3,
  techs: [202],
  walk: 4,
  farm: 2,
  rows: [
    { unit: 38, building: 101, count: '2' },
    { unit: 83, building: 109, count: '1' },
  ],
};
beforeAll(async () => {
  ctx = { core: await loadCore(), trees: await loadTrees() };
});

describe('生产与收益的明确带入 #531', () => {
  it('完整来源可恢复，训练对照不能被当成默认生产需求', () => {
    expect(productionSource('/production?' + encodeProduction(source)).config).toEqual(source);
    expect(productionSource('/production?mode=train-compare&v=1&unit=38&age=3&n=10').config).toBeNull();
    expect(productionSource('/production?mode=train-compare&v=1&unit=38&age=3&n=10').errors.join('')).toContain('跨文明训练对照');
    expect(productionSource('/unit/38').config).toBeNull();
  });
  it('只带入兼容条件，不把理论人数填成实有人数，不改变多行来源', () => {
    const before = encodeProduction(source);
    const { config, omittedTechs } = payoffFromProduction(ctx, source);
    expect(config.civ).toBe(source.civ);
    expect(config.age).toBe(source.age);
    expect(config.distance).toBe('4');
    expect(config.known).toContain(202);
    expect(Object.values(config.workers)).toEqual(['0', '0', '0', '0']);
    expect(omittedTechs).not.toContain(202);
    expect(omittedTechs).toEqual(expect.arrayContaining([13, 14]));
    expect(encodeProduction(source)).toBe(before);
  });
  it('主动采用理论人数时使用引擎各资源取整结果，不夹断超限数值', () => {
    const result = calculateProduction(ctx, source);
    const mapped = theoreticalProductionWorkers(ctx, source);
    expect(mapped.errors).toEqual([]);
    expect(mapped.workers).toEqual(Object.fromEntries(result.resources.map((r) => [r.key, String(r.rounded)])));
    const oversized = { ...source, rows: [{ unit: 38, building: 101, count: '100' }] };
    expect(theoreticalProductionWorkers(ctx, oversized).workers).toBeNull();
    expect(theoreticalProductionWorkers(ctx, oversized).errors.join('')).toContain('200');
  });
  it('非法来源不产生可采用的理论人数', () => {
    const invalid = { ...source, rows: [{ unit: 38, building: 101, count: '-1' }] };
    expect(theoreticalProductionWorkers(ctx, invalid).workers).toBeNull();
    expect(theoreticalProductionWorkers(ctx, invalid).errors.length).toBeGreaterThan(0);
  });
  it('只有主动创建科技假设才生成新生产配置，原配置完全保留', () => {
    const before = encodeProduction(source);
    const payoff = { ...payoffFromProduction(ctx, source).config, target: 55 };
    expect(calculateEcoPayoff(ctx, payoff).errors).toEqual([]);
    const next = productionAssumption(ctx, source, payoff);
    expect(next.errors).toEqual([]);
    expect(next.config?.techs).toContain(55);
    expect(next.config?.rows).toEqual(source.rows);
    expect(next.config?.farm).toBe(source.farm);
    expect(encodeProduction(source)).toBe(before);
    expect(next.config).not.toBe(source);
  });
  it('当前收益文明与来源不一致时不回写原方案', () => {
    const payoff = { ...payoffFromProduction(ctx, source).config, civ: 'Mongols' };
    expect(productionAssumption(ctx, source, payoff).config).toBeNull();
    expect(productionAssumption(ctx, source, payoff).errors.join('')).toContain('文明');
  });
});
