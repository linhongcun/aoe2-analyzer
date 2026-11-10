import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import { discountedCost } from '../../src/domain/costDiscount';
import { DAT, type DatCostDiscount, type DatCostGroup } from '../../src/domain/datEffects';
import {
  REVIEWED_SPLIT_COST_GROUPS,
  alignAggregatedFactor,
  civDiscountFactors,
  matchCostGroup,
  priceFromRawFactor,
  unitCostSentence,
} from '../../src/domain/costPolicy';
import { simulateBuild, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
import type { BuildOrder } from '../../src/domain/buildOrder';
import { unit } from './helpers';

const E = eco as unknown as EcoData;
const ups = Object.fromEntries((units as { id: number; up?: unknown }[]).filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const byId = Object.fromEntries(
  (units as unknown as { id: number; zh: string; cost: Record<string, number>; age: number; civs: string[] }[]).map((u) => [u.id, u]),
);

describe('折后价按 .dat 原始乘数，PK 与 eco 乘数同价', () => {
  it.each([
    ['Koreans', 4, 2, 'Wood', 12.5],
    ['Koreans', 24, 3, 'Wood', 12.5],
    ['Dravidians', 36, 4, 'Wood', 150],
    ['Dravidians', 280, 3, 'Wood', 106.5],
    ['Goths', 93, 3, 'Food', 26.5],
    ['Goths', 41, 3, 'Food', 56.5],
    ['Goths', 41, 3, 'Gold', 26.5],
    ['Mayans', 763, 4, 'Wood', 39],
    ['Mayans', 763, 4, 'Gold', 39],
    ['Vikings', 21, 3, 'Wood', 76],
    ['Incas', 6, 3, 'Food', 18.5],
  ] as const)('%s 单位 %i 时代 %i %s', (civ, id, age, res, price) => {
    const u = byId[id]!;
    const d = discountedCost(u, civ, age);
    expect(d.cost[res], `${civ} ${u.zh}`).toBe(price);
    expect(d.unsupported, `${civ} ${u.zh}`).toEqual([]);
    const factor = civDiscountFactors(id, civ, age)[res]!;
    expect(priceFromRawFactor(u.cost[res]!, factor.factor)).toBe(price);
  });

  it('哥特黑暗/封建民兵显示价不变：42.5/17 与 40/16', () => {
    expect(discountedCost(unit('Militia'), 'Goths', 1).cost).toEqual({ Food: 42.5, Gold: 17 });
    expect(discountedCost(unit('Militia'), 'Goths', 2).cost).toEqual({ Food: 40, Gold: 16 });
  });

  it('高丽长矛兵开局实付木材等于 PK 的 12.5', () => {
    const bo = {
      id: 'korean-spear-cost',
      name: { zh: '高丽长矛', en: 'korean spear' },
      style: 'militia',
      civs: ['Koreans'],
      map: 'test',
      difficulty: 'beginner',
      target: { age: 2 as const, vils: 3 },
      summary: 's',
      sources: [{ title: 'test', url: 'https://example.com', author: 'test', accessed: '2026-11-10' }],
      license: 'test',
      review: { status: 'draft' as const },
      steps: [
        {
          vils: 3,
          actions: [
            { type: 'gather' as const, task: 'sheep' as const, count: 3 },
            { type: 'build' as const, building: 12 },
          ],
        },
        { vils: 3, actions: [{ type: 'train' as const, unit: 93 }] },
      ],
    } satisfies BuildOrder;
    const step = simulateBuild(bo, 'Koreans', E, ups, { autoHouses: false, walkTiles: 2, nearTiles: 2 }).steps.find((s) => s.entity?.id === '93');
    expect(step?.cost?.wood).toBe(12.5);
    expect(discountedCost(byId[93]!, 'Koreans', 1).cost.Wood).toBe(step?.cost?.wood);
  });

  it('哥特封建民兵开局实付仍是食物 40、黄金 16', () => {
    const bo = buildOrders.find((order) => order.id === 'feudal-drush-18')!;
    const tl = simulateBuild(bo, 'Goths', E, ups);
    const step = tl.steps.find((s) => s.entity?.id === '74');
    expect(step?.startAt).toBeGreaterThanOrEqual(tl.ageUps.find((a) => a.age === 'feudal')!.reachAt);
    expect(step?.cost).toMatchObject({ food: 40, gold: 16 });
    expect(discountedCost(unit('Militia'), 'Goths', 2).cost).toMatchObject({ Food: 40, Gold: 16 });
  });
});

const korean = DAT.costDiscounts.Koreans![0]!;
const koreanWood = (tier: number) => korean.groups.find((group) => group.tiers['1'] === tier)!;

describe('跨句费用必须有费用句、资源和单位名单', () => {
  it('高丽两个独立组：五折仍挂在原句，战船八折只认核对过的单位', () => {
    const ranged = koreanWood(0.5);
    const ships = koreanWood(0.8);
    const row = REVIEWED_SPLIT_COST_GROUPS.find((item) => item.civ === 'Koreans')!;
    expect([...ships.units].sort((a, b) => a - b)).toEqual([...row.units].sort((a, b) => a - b));
    expect(ships.res).toEqual([...row.res]);
    expect(matchCostGroup('Koreans', korean, ranged, 1, 0.5)).toMatchObject({ idx: 1, pct: 50, via: 'own' });
    expect(matchCostGroup('Koreans', korean, ships, 1, 0.8)).toMatchObject({ idx: 3, pct: 20, via: 'other' });
    expect(discountedCost(byId[4]!, 'Koreans', 2).cost.Wood).toBe(12.5);
    expect(discountedCost(byId[21]!, 'Koreans', 2).cost.Wood).toBe(72);
    expect(civDiscountFactors(4, 'Koreans', 2).Wood).toMatchObject({ factor: 0.5, accumulated: 0.5 });
    expect(civDiscountFactors(21, 'Koreans', 2).Wood).toMatchObject({ factor: 0.8, accumulated: 0.8 });
  });

  it('孟加拉额外伤害 -25% 不能证明木材费用', () => {
    expect(unitCostSentence('Elephant Units receive -25% bonus damage and are more resistant to conversion', 1)).toBeNull();
    const entry: DatCostDiscount = { idx: 0, techs: [1], text: { '1': 10, '2': 10, '3': 10, '4': 10 }, ok: false, groups: [] };
    const group: DatCostGroup = { units: [1], res: ['Wood'], tiers: { '1': 0.75 } };
    expect(matchCostGroup('Bengalis', entry, group, 1, 0.75)).toBeNull();
    const priced = discountedCost({ id: 1, cost: { Wood: 100 } }, 'Bengalis', 1, { table: { Bengalis: [{ ...entry, groups: [group] }] } });
    expect(priced.cost.Wood).toBe(100);
    expect(priced.unsupported).toHaveLength(1);
    const decision = civDiscountFactors(1, 'Bengalis', 1, { Bengalis: [{ ...entry, groups: [group] }] }).Wood!;
    expect(decision.factor).toBe(1);
    expect(alignAggregatedFactor(0.75, decision)).toBe(1);
  });

  it('同百分比的费用句不能串到别的单位、缺资源或错误资源', () => {
    const ships = koreanWood(0.8);
    expect(unitCostSentence('Infantry costs -20%', 1)).toBeNull();
    expect(unitCostSentence('Warships cost -20% food', 1)).toEqual({ pct: 20, res: ['Food'] });
    expect(matchCostGroup('Koreans', korean, { ...ships, units: [93] }, 1, 0.8)).toBeNull();
    expect(matchCostGroup('Koreans', korean, { ...ships, res: ['Gold'] }, 1, 0.8)).toBeNull();
    expect(matchCostGroup('Koreans', korean, { ...ships, units: [4, 24] }, 1, 0.8)).toBeNull();
    const priced = discountedCost(byId[93]!, 'Koreans', 1, {
      table: { Koreans: [{ ...korean, groups: [{ ...ships, units: [93] }] }] },
    });
    expect(priced.cost.Wood).toBe(byId[93]!.cost.Wood);
    const decision = civDiscountFactors(93, 'Koreans', 1, { Koreans: [{ ...korean, groups: [{ ...ships, units: [93] }] }] }).Wood!;
    expect(alignAggregatedFactor(0.8, decision)).toBe(1);
  });
});
