import { expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import { buildOrders } from '../../src/data/buildOrders';
import { simulateBuild, type EcoData } from '../../src/domain/buildSim';
const water = buildOrders.find((b) => b.id === 'hybrid-fish-18')!;
it('渔船完成后增加食物，码头和人口真实计入', () => {
  const withFish = simulateBuild(water, 'Generic', eco as EcoData, {});
  const noFish = structuredClone(eco);
  noFish.fishingShip.workRate = 0;
  const withoutFish = simulateBuild(water, 'Generic', noFish as EcoData, {});
  expect(withFish.ageUps[0]!.clickAt).toBeLessThan(withoutFish.ageUps[0]!.clickAt);
  expect(withFish.buildingsDone.some((x) => x.building === 45)).toBe(true);
  expect(withFish.steps.at(-1)!.pop.used).toBe(22);
  expect(withFish.anomalies.some((x) => x.type === 'timeout')).toBe(false);
});
it('两座马厩并行训练同一批骑士', () => {
  const branch = structuredClone(buildOrders.find((b) => b.id === 'fast-castle-knights')!);
  const last = branch.steps.at(-1)!;
  // 双方都只有第一批训练动作差异，足额库存由去除骑士费用控制。
  const funded = structuredClone(eco);
  funded.units['38'].cost = {} as (typeof funded.units)['38']['cost'];
  const two = simulateBuild(branch, 'Generic', funded as EcoData, {});
  last.actions = [{ type: 'train', unit: 38 }];
  const one = simulateBuild(branch, 'Generic', funded as EcoData, {});
  expect(two.steps.at(-1)!.doneAt).toBe(one.steps.at(-1)!.doneAt);
});
