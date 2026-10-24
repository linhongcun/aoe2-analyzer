import { describe, expect, it } from 'vitest';
import raw from '../../src/data/relic_income.json';
import { calculateRelicIncome, newRelicIncomeConfig, validRelicIncomeData, type RelicIncomeData } from '../../src/domain/relicIncome';

const resourceIds = { Gold: 191, Food: 225, Wood: 264, Stone: 265 };

describe('#278 圣物资源语义来自生成数据', () => {
  it('生成数据明确导出四种资源名称与固定字段的对应关系', () => {
    expect((raw as unknown as { resourceIds: unknown }).resourceIds).toEqual(resourceIds);
  });

  it('资源字段整体改号时仍按命名映射应用相同加成，不依赖领域中的旧编号', () => {
    const data = structuredClone(raw) as unknown as RelicIncomeData & { resourceIds: typeof resourceIds };
    const remap = new Map(Object.values(resourceIds).map((id) => [id, id + 1000]));
    data.resourceIds = Object.fromEntries(Object.entries(resourceIds).map(([resource, id]) => [resource, remap.get(id)!])) as typeof resourceIds;
    for (const modifier of Object.values(data.modifiers)) modifier.resources = modifier.resources.map((id) => remap.get(id) ?? id);
    const config = { ...newRelicIncomeConfig(), allies: ['Aztecs', 'Burgundians', ''] as [string, string, string] };
    const expected = calculateRelicIncome(config, raw as unknown as RelicIncomeData);
    expect(validRelicIncomeData(data)).toBe(true);
    expect(calculateRelicIncome(config, data)).toEqual(expected);
  });

  it.each([
    undefined,
    null,
    [],
    { ...resourceIds, Gold: -1 },
    { ...resourceIds, Gold: 1.5 },
    { ...resourceIds, Gold: Infinity },
    { ...resourceIds, Gold: '191' },
    { ...resourceIds, Gold: resourceIds.Food },
    { ...resourceIds, Gold: 999999 },
    { Gold: resourceIds.Gold, Food: resourceIds.Food, Wood: resourceIds.Wood },
  ])('拒绝缺失或不可靠的命名映射 %j', (mapping) => {
    const data = { ...raw, resourceIds: mapping };
    expect(validRelicIncomeData(data)).toBe(false);
    expect(calculateRelicIncome(newRelicIncomeConfig(), data as unknown as RelicIncomeData).status).toBe('invalid');
  });
});
