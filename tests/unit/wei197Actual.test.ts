import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import { simulateBuild, type EcoData, type UpgradeData, type BuildTimeline, type TimelineStep } from '../../src/domain/buildSim';

interface Case {
  id: string;
  paidCount: number;
  freeCount: number;
  endingVillagers: number;
  lastStep: Pick<TimelineStep, 'index' | 'startAt' | 'doneAt' | 'stock' | 'pop' | 'villagers'>;
  rewards: NonNullable<BuildTimeline['bonusVillagerEvents']>;
  research: { tech: number; startedAt: number; doneAt: number; step: number }[];
  preFirstSnapshots: Pick<TimelineStep, 'index' | 'startAt' | 'stock' | 'pop' | 'villagers'>[];
  preFirstCompleted: { index: number; doneAt: number }[];
  preFirstPaid: BuildTimeline['villagerEvents'];
  preFirstAgeUps: BuildTimeline['ageUps'];
  preFirstBuildings: BuildTimeline['buildingsDone'];
  preFirstHouses: number[];
  noRewardBaseline?: Pick<
    BuildTimeline,
    'steps' | 'villagerEvents' | 'ageUps' | 'housePaidAt' | 'buildingsDone' | 'anomalies' | 'tcIdleTotal' | 'noHouses' | 'params'
  >;
}
const quantified = JSON.parse(readFileSync(new URL('../../docs/design/wei197-runtime-quantified.json', import.meta.url), 'utf8')) as { cases: Case[] };
const E = eco as unknown as EcoData;
const ups = Object.fromEntries(units.filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const pick = <T, K extends keyof T>(value: T, keys: K[]): Pick<T, K> => Object.fromEntries(keys.map((key) => [key, value[key]])) as Pick<T, K>;

describe('#197 魏8实际BO数量、库存、人口与独立研究时钟', () => {
  it.each(quantified.cases)('$id matches independently observed clocks and concrete final observation', (c) => {
    const tl = simulateBuild(
      buildOrders.find((bo) => bo.id === c.id)!,
      'Wei',
      E,
      ups,
    );
    expect(tl.villagerEvents).toHaveLength(c.paidCount);
    expect(tl.bonusVillagerEvents).toEqual(c.rewards);
    expect(tl.bonusVillagerEvents!.reduce((n, e) => n + e.count, 0)).toBe(c.freeCount);
    expect(3 + tl.villagerEvents!.length + c.freeCount).toBe(c.endingVillagers);
    expect(pick(tl.steps.at(-1)!, ['index', 'startAt', 'doneAt', 'stock', 'pop', 'villagers'])).toEqual(c.lastStep);
    for (const reward of tl.bonusVillagerEvents!) {
      const research = c.research.find((r) => r.tech === reward.trigger)!;
      expect(reward.at).toBe(research.doneAt);
      // Actual eight templates use nonTC economic research; the existing loop counts its start tick.
      expect(Math.round((research.startedAt + E.techs[research.tech]!.researchTime - 0.1) * 10) / 10).toBe(research.doneAt);
      expect(reward.step).toBe(research.step);
      expect(reward.at).toBeGreaterThan(research.startedAt);
    }
    for (const s of c.preFirstSnapshots) expect(pick(tl.steps[s.index]!, ['index', 'startAt', 'stock', 'pop', 'villagers'])).toEqual(s);
    for (const s of c.preFirstCompleted) expect(tl.steps[s.index]!.doneAt).toBe(s.doneAt);
    const first = c.rewards[0]?.at;
    if (first !== undefined) {
      expect(tl.villagerEvents!.filter((e) => e.to < first)).toEqual(c.preFirstPaid);
      expect(tl.ageUps.filter((e) => e.reachAt < first)).toEqual(c.preFirstAgeUps);
      expect(tl.buildingsDone.filter((e) => e.at < first)).toEqual(c.preFirstBuildings);
      expect(tl.housePaidAt.filter((t) => t < first)).toEqual(c.preFirstHouses);
    } else {
      expect(pick(tl, ['steps', 'villagerEvents', 'ageUps', 'housePaidAt', 'buildingsDone', 'anomalies', 'tcIdleTotal', 'noHouses', 'params'])).toEqual(
        c.noRewardBaseline,
      );
    }
  });
  it('actual archers hand control saves one50food paid villager and gains25seconds of gold work', () => {
    const bo = buildOrders.find((bo) => bo.id === 'archers-19')!;
    const e = structuredClone(E);
    e.civEco.Wei = [];
    const paid = simulateBuild(bo, 'Wei', e, ups);
    const free = simulateBuild(bo, 'Wei', E, ups);
    expect(paid.villagerEvents).toHaveLength(18);
    expect(free.villagerEvents).toHaveLength(17);
    expect(paid.steps.at(-1)).toMatchObject({ startAt: 744.6, stock: { food: 523, wood: 429, gold: 160, stone: 200 } });
    expect(free.steps.at(-1)).toMatchObject({ startAt: 744.6, stock: { food: 573, wood: 429, gold: 167, stone: 200 } });
    // Golden work rate10/(10/.38+8/.8), one additional worker from609.4 instead of634.4.
    const q = E.villager.tasks.gold!.carry / (E.villager.tasks.gold!.carry / E.villager.tasks.gold!.workRate + 8 / E.villager.speed);
    expect(q * 25).toBeCloseTo(6.884057971014494, 12);
    expect(free.villagerEvents?.some((e) => e.from === 609.4)).toBe(false);
    expect(paid.villagerEvents?.some((e) => e.from === 609.4 && e.to === 634.4)).toBe(true);
  });
});
