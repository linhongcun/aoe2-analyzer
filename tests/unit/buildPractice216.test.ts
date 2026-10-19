import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import techs from '../../src/data/techs.json';
import buildings from '../../src/data/buildings.json';
import { buildOrders } from '../../src/data/buildOrders';
import { practiceAction, practiceProgress, practiceSteps, type PracticeNames } from '../../src/domain/buildPractice';
import { simulateBuild, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
import { rowTime } from '../../src/features/builds/timelineModel';

const upgrades = Object.fromEntries(units.filter((unit) => unit.up).map((unit) => [unit.id, unit.up])) as UpgradeData;
const name: PracticeNames = (kind, id) => ({ unit: units, tech: techs, building: buildings })[kind].find((entity) => entity.id === id)?.zh ?? `${id}`;
const order = (id: string) => buildOrders.find((build) => build.id === id)!;

describe('#216 手动进度', () => {
  it('首步不能后退，末步还需确认，完成后可撤回或重新开始', () => {
    expect(practiceProgress(0, 3, 'previous')).toBe(0);
    expect(practiceProgress(0, 3, 'next')).toBe(1);
    expect(practiceProgress(2, 3, 'next')).toBe(3);
    expect(practiceProgress(3, 3, 'next')).toBe(3);
    expect(practiceProgress(3, 3, 'previous')).toBe(2);
    expect(practiceProgress(3, 3, 'reset')).toBe(0);
    expect(practiceProgress(0, 0, 'next')).toBe(0);
  });
});

describe('#216 真实步骤与模拟逐项映射', () => {
  for (const build of buildOrders)
    for (const civ of ['Generic', 'Huns']) {
      it(`${build.id}/${civ} 保留全部原始动作和补充说明`, () => {
        const simulation = simulateBuild(build, civ, eco as EcoData, upgrades);
        const rows = practiceSteps(build, simulation);
        expect(rows).toHaveLength(build.steps.length);
        rows.forEach((row, index) => {
          expect(row.index).toBe(index);
          expect(row.step).toBe(build.steps[index]);
          expect(row.simulation).toBe(simulation.steps[index]);
          expect(row.step.actions.map((action) => practiceAction(action, name))).toHaveLength(build.steps[index]!.actions.length);
        });
        expect(rows.filter((row) => row.step.siteAdded)).toHaveLength(build.steps.filter((step) => step.siteAdded).length);
      });
    }
  it('保留同一估算时点的两个步骤、仅引鹿步骤和无动作的到达时代步骤', () => {
    const scouts = order('scouts-18');
    const rows = practiceSteps(scouts, simulateBuild(scouts, 'Generic', eco as EcoData, upgrades));
    expect(rowTime(rows[9]!.simulation)).toBe(rowTime(rows[10]!.simulation));
    expect(rows[5]!.step.actions).toEqual([{ type: 'lure', target: 'deer' }]);
    const hybrid = order('hybrid-fish-18');
    const hybridRows = practiceSteps(hybrid, simulateBuild(hybrid, 'Generic', eco as EcoData, upgrades));
    expect(hybridRows[8]!.step.actions).toEqual([]);
    expect(hybridRows[8]!.step.phase).toBe('feudal');
  });
  it('研究估算时点与人口/分配快照时刻不同，不合并为同一时刻', () => {
    const build = order('scouts-18');
    const row = practiceSteps(build, simulateBuild(build, 'Generic', eco as EcoData, upgrades))[7]!;
    expect(row.simulation.startAt).toBeLessThan(rowTime(row.simulation));
    expect(row.simulation.pop).toEqual({ used: 19, cap: 25 });
    expect(row.simulation.villagers).toMatchObject({ food: 14, wood: 4, build: 0 });
  });
  it('不能用模拟的primary动作替代全部动作', () => {
    const build = order('maa-archers-18');
    const rows = practiceSteps(build, simulateBuild(build, 'Generic', eco as EcoData, upgrades));
    expect(rows[7]!.step.actions.map((action) => action.type)).toEqual(['gather', 'build', 'train', 'upgrade']);
    expect(rows.at(-1)!.step.actions.map((action) => action.type)).toEqual(['train', 'train', 'build', 'research']);
  });
  it('模拟结果错配时拒绝生成可能误导的步骤', () => {
    const build = order('scouts-18');
    const simulation = simulateBuild(build, 'Generic', eco as EcoData, upgrades);
    expect(() => practiceSteps(order('archers-19'), simulation)).toThrow('不一致');
    expect(() => practiceSteps(build, { ...simulation, steps: simulation.steps.slice(1) })).toThrow('不一致');
    const steps = [...simulation.steps];
    steps[0] = { ...steps[0]!, index: 1 };
    expect(() => practiceSteps(build, { ...simulation, steps })).toThrow('顺序不一致');
  });
});

it('#216 所有动作类型均有完整文字，包含搬人来源及训练数量', () => {
  expect(practiceAction({ type: 'gather', count: 2, task: 'gold', from: 'wood' }, name)).toBe('从伐木调 2 名村民去采金');
  expect(practiceAction({ type: 'gather', count: 3, task: 'hunt' }, name)).toBe('安排 3 名村民采肉');
  expect(practiceAction({ type: 'build', building: 70, count: 2 }, name)).toContain('2 座');
  expect(practiceAction({ type: 'train', unit: 38, count: 2 }, name)).toBe('训练 2 个骑士');
  expect(practiceAction({ type: 'research', tech: 22 }, name)).toContain('研究');
  expect(practiceAction({ type: 'upgrade', unit: 75 }, name)).toContain('武士');
  expect(practiceAction({ type: 'ageUp', age: 2 }, name)).toBe('点击升级封建时代');
  expect(practiceAction({ type: 'lure', target: 'boar', count: 2 }, name)).toBe('引 2 头野猪');
  expect(practiceAction({ type: 'lure', target: 'deer' }, name)).toBe('推 1 只鹿');
});
