import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import { simulateBuild, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
import { bengaliRewardFamily, bengaliRewardsForReachedAge } from '../../src/domain/bengaliEconomy';
import type { BuildOrder } from '../../src/domain/buildOrder';

const E = eco as unknown as EcoData;
const ups = Object.fromEntries(units.filter((unit) => unit.up).map((unit) => [unit.id, unit.up])) as UpgradeData;
describe('#197 孟加拉完成TC计数与真实任务', () => {
  it.each([0, 1, 2, 3])('completedTCs%s uses cap0 and rawC2', (tc) => {
    const family = bengaliRewardFamily(E.civEco.Bengalis);
    expect(family).not.toBeNull();
    expect(bengaliRewardsForReachedAge(family, 2, tc, new Set()).map((reward) => ({ tech: reward.tech, count: reward.count }))).toEqual(
      tc ? [{ tech: 847, count: 2 * tc }] : [],
    );
  });
  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])('invalid/unsafe completedTCs%s gives no phantom reward', (tc) => {
    expect(bengaliRewardsForReachedAge(bengaliRewardFamily(E.civEco.Bengalis), 2, tc, new Set())).toEqual([]);
  });
  it.each([0, 1, 298, 2.5, NaN])('non-normal reached age%s never activates GS873 or a different age', (age) => {
    expect(bengaliRewardsForReachedAge(bengaliRewardFamily(E.civEco.Bengalis), age, 1, new Set())).toEqual([]);
  });
  it('null family and already completed reward never partly apply', () => {
    expect(bengaliRewardsForReachedAge(null, 2, 1, new Set())).toEqual([]);
    expect(bengaliRewardsForReachedAge(bengaliRewardFamily(E.civEco.Bengalis), 2, 1, new Set([847]))).toEqual([]);
  });
  it('two free workers follow mixed queued tasks and enter gold income in the completion tick', () => {
    const e = structuredClone(E);
    e.ageReq = undefined;
    e.techs[101] = { ...e.techs[101]!, cost: { Gold: 1.07 }, researchTime: 1 };
    const bo: BuildOrder = {
      id: 'bengali-mixed-tick',
      name: { zh: '混合任务', en: 'Mixed tasks' },
      style: 'other',
      civs: [],
      map: 'test',
      difficulty: 'beginner',
      target: { age: 2, vils: 5 },
      summary: 'test',
      sources: [],
      license: 'test',
      review: { status: 'draft' },
      steps: [
        {
          vils: 3,
          actions: [
            { type: 'gather', task: 'gold', count: 3 },
            { type: 'ageUp', age: 2 },
          ],
        },
        { vils: 3, phase: 'feudal', actions: [{ type: 'gather', task: 'wood', count: 1 }] },
        { vils: 5, actions: [{ type: 'gather', task: 'gold', count: 1 }] },
      ],
    };
    const tl = simulateBuild(bo, 'Bengalis', e, ups, { autoHouses: false, walkTiles: 2, nearTiles: 2 });
    expect(tl.bonusVillagerEvents).toEqual([{ at: 1, tech: 847, trigger: 101, count: 2, step: 0, pop: { used: 6, cap: 5 }, task: 'mixed' }]);
    // Pinned carry10/workRate.38/speed.8 and2tiles: rate10/(10/.38+4/.8).
    // At observer1.1 there were11ticks of3workers plus the free gold worker's completion tick.
    const r = 10 / (10 / 0.38 + 4 / 0.8);
    expect(Math.floor(100 - 1.07 + 3 * r * 1.1)).toBe(99);
    expect(Math.floor(100 - 1.07 + 3 * r * 1.1 + r * 0.1)).toBe(100);
    expect(tl.steps[1]).toMatchObject({ startAt: 1, stock: { food: 200, gold: 100, wood: 200 }, villagers: { gold: 4, wood: 1, idle: 0 } });
    expect(tl.villagerEvents).toEqual([]);
  });
  it.each(buildOrders.map((bo) => [bo.id, bo] as const))('%s preserves all snapshots and paid births before the first actual age arrival', (_id, bo) => {
    const actual = simulateBuild(bo, 'Bengalis', E, ups);
    const control = simulateBuild(bo, 'Generic', E, ups);
    const first = control.ageUps[0]!.reachAt;
    expect(actual.ageUps[0]!.reachAt).toBe(first);
    expect(actual.steps.filter((step) => step.startAt < first)).toEqual(control.steps.filter((step) => step.startAt < first));
    expect(actual.villagerEvents!.filter((event) => event.to < first)).toEqual(control.villagerEvents!.filter((event) => event.to < first));
    expect(actual.housePaidAt.filter((at) => at < first)).toEqual(control.housePaidAt.filter((at) => at < first));
    expect(actual.bonusVillagerEvents!.filter((event) => event.at < first)).toEqual([]);
  });
});
