import { describe, expect, it } from 'vitest';
import { loadTrees } from '../../src/data';
import { CORE } from '../../src/data/core';
import { armySupplyResearch, projectArmySupply } from '../../src/domain/armySupply';
import { ARMY_COST_DATA, emptyArmyCost } from '../../src/domain/armyCostConfig';
import { calculateProduction } from '../../src/domain/production';
import { encodeArmyCost } from '../../src/features/production/armyCostCodec';
import { armySupplyHref, decodeArmySupply, emptyArmySupply, encodeArmySupply } from '../../src/features/production/armySupplyCodec';
import { productionMode, selectedProductionMode } from '../../src/domain/productionMode';

const ctx = { core: CORE, trees: await loadTrees() };
const ledger = { ...emptyArmyCost('Goths', '4'), rows: [761, 359, 36].map((unit) => ({ unit, qty: '1' })) };
const setups = [
  { building: 12, count: '2', confirmed: true },
  { building: 12, count: '3', confirmed: true },
  { building: 49, count: '1', confirmed: true },
];
const plan = { ...emptyArmySupply(ledger), stance: 'plan' as const, planned: [16, 47], rows: setups };

describe('阵容账本的持续生产交接', () => {
  it('保留每个原形态和原数量，等待逐行产能与研究口径', () => {
    const draft = emptyArmySupply(ledger);
    expect(draft.rows).toEqual(ledger.rows.map(() => ({ building: 0, count: '', confirmed: false })));
    const result = projectArmySupply(ctx, ledger, draft);
    expect(result.rows.map((row) => row.original)).toEqual(ledger.rows);
    expect(result.rows[0]?.issue).toContain('无政府');
    expect(result.rows[1]?.buildings).toContain(12);
    expect(result.rows[2]?.issue).toContain('化学');
    expect(result.config).toBeNull();
    expect(armySupplyHref(emptyArmyCost())).toBeNull();
  });

  it('完成和计划分别核对；当前口径不可借用计划科技', () => {
    const research = armySupplyResearch(ctx, ledger);
    expect(research.completed).toEqual([]);
    expect(
      research.planned
        .filter((choice) => choice.supported)
        .map((choice) => choice.entry.id)
        .sort((a, b) => Number(a) - Number(b)),
    ).toEqual([16, 47]);
    const current = projectArmySupply(ctx, ledger, { ...plan, stance: 'current' });
    expect(current.rows.map((row) => row.buildings)).toEqual([[], [12], []]);
    expect(current.config).toBeNull();
    const completed = projectArmySupply(ctx, { ...ledger, done: ['t:16', 't:47'] }, { ...plan, stance: 'current', planned: [] });
    expect(completed.research.completed.filter((choice) => choice.supported).map((choice) => choice.entry.id)).toEqual([16, 47]);
    expect(completed.config?.techs).toEqual([16, 47]);
  });

  it('按选定研究、行和专用建筑计算固定示例；缺一项不出全阵容汇总', () => {
    const result = projectArmySupply(ctx, ledger, plan);
    expect(result.rows[0]?.buildings).toEqual([12]);
    expect(result.config?.rows).toEqual(ledger.rows.map(({ unit }, index) => ({ unit, building: setups[index]!.building, count: setups[index]!.count })));
    expect(result.config?.techs).toEqual([16, 47]);
    const supply = calculateProduction(ctx, result.config!);
    expect(supply.errors).toEqual([]);
    expect(supply.total).toBe(76);
    expect(supply.lines.map((row) => row.perMinute.toFixed(2))).toEqual(['9.00', '9.82', '1.07']);
    expect(projectArmySupply(ctx, ledger, { ...plan, planned: [47] }).config).toBeNull();
    expect(projectArmySupply(ctx, ledger, { ...plan, planned: [16, 47, 99999] }).invalidPlan).toBe(true);
    expect(projectArmySupply(ctx, ledger, { ...plan, rows: setups.map((row) => ({ ...row, confirmed: false })) }).config).toBeNull();
  });

  it('缺形态或不支持的地点逐行说明；保留其他设置和原账本', () => {
    const source = { ...ledger, rows: [ledger.rows[0]!, { unit: 999999, qty: '1' }, ledger.rows[2]!] };
    const result = projectArmySupply(ctx, source, plan);
    expect(result.rows).toHaveLength(3);
    expect(result.rows[1]?.issue).toBe('无法识别来源兵种形态。');
    expect(result.rows[2]?.issue).toBe('');
    expect(result.config).toBeNull();
    expect(source.rows[1]?.unit).toBe(999999);
    expect(projectArmySupply(ctx, ledger, { ...plan, rows: [{ ...setups[0]!, building: 82 }, ...setups.slice(1)] }).config).toBeNull();
  });

  it('新链接完整恢复原账本与独立供给设置；拒绝重复、过期和缺字段', () => {
    const source = { ...ledger, done: ['t:16'], targets: ['t:47'], rows: [{ unit: 761, qty: '4' }, ...ledger.rows.slice(1)] };
    const query = encodeArmySupply(source, plan);
    expect(productionMode('?' + query).kind).toBe('supply');
    expect(selectedProductionMode(productionMode(query))).toBe('legacy');
    expect(decodeArmySupply(query)).toEqual({ kind: 'valid', source, sourceQuery: encodeArmyCost(source), settings: plan });
    expect(decodeArmySupply(query + '&asv=1')).toMatchObject({ kind: 'invalid' });
    expect(decodeArmySupply(query + '&mode=army-cost')).toMatchObject({ kind: 'invalid' });
    for (const invalidPlan of [
      { ...plan, walk: 4.2 },
      { ...plan, farm: 0.1 },
      { ...plan, rows: [{ ...plan.rows[0]!, count: '123456789' }, ...plan.rows.slice(1)] },
    ]) {
      expect(decodeArmySupply(encodeArmySupply(source, invalidPlan))).toMatchObject({ kind: 'invalid', returnTo: '/production?' + encodeArmyCost(source) });
    }
    expect(productionMode('?asv=1').kind).toBe('supply');
    expect(decodeArmySupply('mode=army-supply&asv=1')).toMatchObject({ kind: 'invalid' });
    const stale = new URLSearchParams(query);
    stale.set('asSource', encodeArmyCost(source, 'old'));
    expect(ARMY_COST_DATA).not.toBe('old');
    expect(decodeArmySupply(stale.toString())).toEqual({
      kind: 'invalid',
      reason: '原账本数据版本已变化。请核对原账本后重新规划。',
      returnTo: '/production?' + encodeArmyCost(source, 'old'),
    });
    const unrelated = new URLSearchParams(query);
    unrelated.set('asSource', 'https://example.org/?' + encodeArmyCost(source));
    expect(decodeArmySupply(unrelated.toString())).toMatchObject({ kind: 'invalid' });
    expect(productionMode('?mode=army-cost&civ=Goths').kind).toBe('army');
    expect(productionMode('?civ=Goths&age=4').kind).toBe('legacy');
  });
});
