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
  rewards: NonNullable<BuildTimeline['bonusVillagerEvents']>;
  lastStep: Pick<TimelineStep, 'index' | 'startAt' | 'doneAt' | 'stock' | 'pop' | 'villagers'>;
  preFirstSnapshots: Pick<TimelineStep, 'index' | 'startAt' | 'stock' | 'pop' | 'villagers'>[];
  preFirstPaid: BuildTimeline['villagerEvents'];
}
const quantified = JSON.parse(readFileSync(new URL('../../docs/design/bengalis197-runtime-quantified.json', import.meta.url), 'utf8')) as { cases: Case[] };
const E = eco as unknown as EcoData;
const ups = Object.fromEntries(units.filter((unit) => unit.up).map((unit) => [unit.id, unit.up])) as UpgradeData;
const pick = <T, K extends keyof T>(value: T, keys: K[]): Pick<T, K> => Object.fromEntries(keys.map((key) => [key, value[key]])) as Pick<T, K>;
describe('#197 孟加拉独立8开局量化', () => {
  it.each(quantified.cases)('$id matches independently observed ages, free births, stocks and prior observations', (c) => {
    const tl = simulateBuild(
      buildOrders.find((bo) => bo.id === c.id)!,
      'Bengalis',
      E,
      ups,
    );
    expect(tl.villagerEvents).toHaveLength(c.paidCount);
    expect(tl.bonusVillagerEvents).toEqual(c.rewards);
    expect(tl.bonusVillagerEvents!.reduce((sum, event) => sum + event.count, 0)).toBe(c.freeCount);
    expect(3 + tl.villagerEvents!.length + c.freeCount).toBe(c.endingVillagers);
    expect(pick(tl.steps.at(-1)!, ['index', 'startAt', 'doneAt', 'stock', 'pop', 'villagers'])).toEqual(c.lastStep);
    for (const event of c.rewards)
      expect(tl.ageUps.find((age) => age.age === ({ 101: 'feudal', 102: 'castle', 103: 'imperial' } as const)[event.trigger as 101 | 102 | 103])!.reachAt).toBe(
        event.at,
      );
    for (const step of c.preFirstSnapshots) expect(pick(tl.steps[step.index]!, ['index', 'startAt', 'stock', 'pop', 'villagers'])).toEqual(step);
    expect(tl.villagerEvents!.filter((event) => event.to < c.rewards[0]!.at)).toEqual(c.preFirstPaid);
  });
  it('archer hand control saves100food and adds75worker-seconds of gold after the actual age gift', () => {
    const bo = buildOrders.find((bo) => bo.id === 'archers-19')!;
    const e = structuredClone(E);
    e.civEco.Bengalis = [];
    const paid = simulateBuild(bo, 'Bengalis', e, ups);
    const free = simulateBuild(bo, 'Bengalis', E, ups);
    expect(paid.villagerEvents).toHaveLength(18);
    expect(free.villagerEvents).toHaveLength(16);
    expect(paid.steps.at(-1)).toMatchObject({ startAt: 744.6, stock: { food: 523, wood: 429, gold: 160, stone: 200 } });
    expect(free.steps.at(-1)).toMatchObject({ startAt: 744.6, stock: { food: 623, wood: 429, gold: 181, stone: 200 } });
    const q = E.villager.tasks.gold!.carry / (E.villager.tasks.gold!.carry / E.villager.tasks.gold!.workRate + 8 / E.villager.speed);
    expect((25 + 50) * q).toBeCloseTo(20.652173913043484, 12);
    expect(paid.villagerEvents!.filter((event) => [609.4, 634.4].includes(event.to))).toHaveLength(2);
    expect(free.bonusVillagerEvents![0]).toMatchObject({ at: 584.4, count: 2, task: 'gold' });
    expect(free.villagerEvents!.some((event) => [609.4, 634.4].includes(event.to))).toBe(false);
  });
});
