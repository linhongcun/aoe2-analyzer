import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import { discountedCost } from '../../src/domain/costDiscount';
import { civDiscountFactors, priceFromRawFactor } from '../../src/domain/costPolicy';
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
