import { expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import { simSupport, simulateBuild, type EcoData, type UpgradeData } from '../../src/domain/buildSim';

it('#197 格鲁吉亚未知bonus行须整行拒绝，direct API不能借通用属性路径应用wood×2', () => {
  const data = structuredClone(eco) as unknown as EcoData;
  data.ageReq = undefined;
  for (const tech of [101, 102]) data.techs[tech] = { ...data.techs[tech]!, cost: {}, researchTime: tech === 101 ? 10 : 80 };
  const unknown = structuredClone(data);
  unknown.civEco.Georgians!.push({ tech: 2000, age: 1, source: 'bonus', effects: [{ kind: 'attr', target: 'task:wood', attr: 'workRate', op: 'mul', v: 2 }] });
  const order = {
    ...buildOrders[0]!,
    steps: [
      {
        vils: 3,
        actions: [
          { type: 'gather' as const, task: 'wood' as const, count: 3 },
          { type: 'ageUp' as const, age: 2 as const },
        ],
      },
      { vils: 3, phase: 'feudal' as const, actions: [{ type: 'ageUp' as const, age: 3 as const }] },
      { vils: 3, phase: 'castle' as const, actions: [] },
    ],
  };
  const ups = Object.fromEntries(units.filter((unit) => unit.up).map((unit) => [unit.id, unit.up])) as UpgradeData;
  expect(simSupport(data, 'Georgians', [order]).supported).toBe(true);
  expect(simSupport(unknown, 'Georgians', [order]).supported).toBe(false);
  const actual = simulateBuild(order, 'Georgians', unknown, ups, { autoHouses: false });
  const base = simulateBuild(order, 'Georgians', data, ups, { autoHouses: false });
  expect(actual.anomalies.filter((anomaly) => anomaly.type === 'timeout')).toEqual([]);
  expect(actual.steps[2]!.startAt).toBeGreaterThan(80);
  expect(actual.steps[2]!.villagers.wood).toBe(3);
  expect(actual.steps.map((step) => [step.startAt, step.doneAt, step.stock, step.villagers, step.pop])).toEqual(
    base.steps.map((step) => [step.startAt, step.doneAt, step.stock, step.villagers, step.pop]),
  );
});
