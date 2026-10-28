import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import type { BuildOrder } from '../../src/domain/buildOrder';
import { simSupport, simulateBuild, type EcoData, type UpgradeData } from '../../src/domain/buildSim';

type RawTech = {
  tech: number;
  civ: number;
  effectId: number;
  requires: number[];
  requiredCount: number;
  researchLocation: number;
  researchAt: number[][];
  researchTime: number;
  cost: number[][];
  commands: { Type: number; A: number; B: number; C: number; D: number }[];
};
const command = (Type: number, A: number, B: number, C: number, D: number) => ({ Type, A, B, C, D });
const raw = (tech: number, effectId: number, civ: number, requires: number[], requiredCount: number, commands: RawTech['commands']): RawTech => ({
  tech,
  effectId,
  civ,
  requires,
  requiredCount,
  researchLocation: -1,
  researchAt: [],
  researchTime: 0,
  cost: [],
  commands,
});
const E = eco as unknown as EcoData;
const ups = Object.fromEntries(units.filter((unit) => unit.up).map((unit) => [unit.id, unit.up])) as UpgradeData;
const INFRA = {
  civId: 45,
  treeId: 927,
  treeCommands: [244, 373, 375, 376, 64, 380, 233, 319, 265, 437, 237, 219, 188, 182, 221, 904, 907, 909, 910].map((tech) => command(102, -1, -1, -1, tech)),
  enable: raw(932, 944, 45, [], 0, [command(2, 1808, 1, -1, 0), command(2, 562, 0, -1, 0), command(2, 584, 0, -1, 0)]),
  buildingTech: raw(933, -1, -1, [], 1, []),
  cart: {
    unit: 1808,
    type: 80,
    class: 3,
    buildTech: 933,
    trainAt: [[118, 25]],
    trainTime: 25,
    cost: [
      [1, 80, 1],
      [0, 20, 1],
    ],
  },
  researchSites: {
    14: [
      [68, 20],
      [2556, 20],
    ],
    22: [[109, 25]],
    199: [[103, 30]],
    202: [
      [562, 25],
      [1808, 25],
      [2556, 25],
    ],
    203: [
      [562, 50],
      [1808, 50],
      [2556, 50],
    ],
    55: [
      [584, 30],
      [1808, 30],
      [2556, 30],
    ],
    182: [
      [584, 75],
      [1808, 75],
      [2556, 75],
    ],
    278: [
      [584, 30],
      [1808, 30],
      [2556, 30],
    ],
    221: [
      [562, 100],
      [1808, 100],
      [2556, 100],
    ],
    279: [
      [584, 75],
      [1808, 75],
      [2556, 75],
    ],
  } as Record<number, number[][]>,
};
type GeorgianData = EcoData & { georgianInfrastructure?: typeof INFRA };
type Row = EcoData['civEco'][string][number] & { georgianTech?: RawTech };
const row = (data: EcoData, tech: number): Row => data.civEco.Georgians!.find((entry) => entry.tech === tech)!;
// Independent fixed-source fixture lets refusal tests run on the old production API as well.
// Real generated output is separately exercised by georgians197.test.ts and test_georgians197.py.
const fixture = (): GeorgianData => {
  const data: GeorgianData = structuredClone(E);
  data.georgianInfrastructure = structuredClone(INFRA);
  row(data, 925).georgianTech = raw(925, 937, 45, [639, 307], 2, [command(1, 234, 0, -1, 1), command(7, 1808, 619, 1, 0)]);
  row(data, 926).georgianTech = raw(926, 938, 45, [104], 1, [command(1, 272, 1, -1, 0), command(1, 273, 1, -1, Math.fround(-0.15))]);
  row(data, 934).georgianTech = raw(934, 939, 45, [], 0, [command(1, 33, 0, -1, 9)]);
  return data;
};
const changed = (mutate: (data: GeorgianData) => void) => {
  const data = fixture();
  mutate(data);
  return data;
};
const single: BuildOrder = {
  ...buildOrders[0]!,
  id: 'georgian-source-guard',
  target: { age: 2, vils: 3 },
  steps: [
    {
      vils: 3,
      actions: [
        { type: 'gather', task: 'build', count: 1 },
        { type: 'gather', task: 'wood', count: 2 },
        { type: 'build', building: 562 },
      ],
    },
    { vils: 3, actions: [] },
  ],
};
const run = (data: EcoData, civ = 'Georgians') => simulateBuild(single, civ, data, ups, { autoHouses: false });

describe('#197 格鲁吉亚完整来源、独立能力和跨文明隔离', () => {
  it('完整已核fixture可用，正例不被来源门控统统拒绝', () => {
    expect(simSupport(fixture(), 'Georgians', buildOrders)).toEqual({ supported: true, reasons: [] });
    expect(run(fixture()).buildingsDone.map((done) => done.building)).toEqual([1808, 1808]);
  });

  it.each([
    [
      '缺基础设施',
      (data: GeorgianData) => {
        delete data.georgianInfrastructure;
      },
    ],
    [
      '错误文明',
      (data: GeorgianData) => {
        data.georgianInfrastructure!.civId = 44;
      },
    ],
    [
      '错误树',
      (data: GeorgianData) => {
        data.georgianInfrastructure!.treeId = 925;
      },
    ],
    [
      '树缺禁用',
      (data: GeorgianData) => {
        data.georgianInfrastructure!.treeCommands.pop();
      },
    ],
    [
      '树未知伴随',
      (data: GeorgianData) => {
        data.georgianInfrastructure!.treeCommands.push(command(999, -1, -1, -1, 1));
      },
    ],
    [
      '启用错civ',
      (data: GeorgianData) => {
        data.georgianInfrastructure!.enable.civ = 44;
      },
    ],
    [
      '启用缺命令',
      (data: GeorgianData) => {
        data.georgianInfrastructure!.enable.commands.pop();
      },
    ],
    [
      '启用未知伴随',
      (data: GeorgianData) => {
        data.georgianInfrastructure!.enable.commands.push(command(999, -1, -1, -1, 1));
      },
    ],
    [
      '错误完成counter',
      (data: GeorgianData) => {
        data.georgianInfrastructure!.buildingTech.tech = 107;
      },
    ],
    [
      '错误对象',
      (data: GeorgianData) => {
        data.georgianInfrastructure!.cart.unit = 83;
      },
    ],
    [
      '错误Type',
      (data: GeorgianData) => {
        data.georgianInfrastructure!.cart.type = 70;
      },
    ],
    [
      '错误class',
      (data: GeorgianData) => {
        data.georgianInfrastructure!.cart.class = 4;
      },
    ],
    [
      '错误建造者',
      (data: GeorgianData) => {
        data.georgianInfrastructure!.cart.trainAt = [[109, 25]];
      },
    ],
    [
      '错误工期',
      (data: GeorgianData) => {
        data.georgianInfrastructure!.cart.trainTime = 35;
      },
    ],
    [
      '错误费用',
      (data: GeorgianData) => {
        data.georgianInfrastructure!.cart.cost[0]![1] = 60;
      },
    ],
    [
      '全局费用不符',
      (data: GeorgianData) => {
        data.buildings[1808]!.cost.Wood = 60;
      },
    ],
    [
      '全局工期不符',
      (data: GeorgianData) => {
        data.buildings[1808]!.buildTime = 35;
      },
    ],
    [
      '双刃斧无车地点',
      (data: GeorgianData) => {
        data.georgianInfrastructure!.researchSites[202] = [[562, 25]];
      },
    ],
    [
      '马轭错车地点',
      (data: GeorgianData) => {
        data.georgianInfrastructure!.researchSites[14]!.push([1808, 20]);
      },
    ],
  ] as const)('%s拒绝基础设施，不投影营地也不发起始实体', (_label, mutate) => {
    const data = changed(mutate);
    expect(simSupport(data, 'Georgians', buildOrders).supported).toBe(false);
    const timeline = run(data);
    expect(timeline.steps[0]!.entity).toEqual({ kind: 'building', id: '562' });
    expect(timeline.buildingsDone.some((done) => done.at === 0)).toBe(false);
  });

  it.each([
    [
      '缺raw',
      (data: GeorgianData) => {
        delete row(data, 925).georgianTech;
      },
    ],
    [
      '重复',
      (data: GeorgianData) => {
        data.civEco.Georgians!.push(structuredClone(row(data, 925)));
      },
    ],
    [
      '错误来源',
      (data: GeorgianData) => {
        row(data, 925).source = 'team';
      },
    ],
    [
      '错误时代',
      (data: GeorgianData) => {
        row(data, 925).age = 2;
      },
    ],
    [
      '错误前置',
      (data: GeorgianData) => {
        row(data, 925).requires = [101];
      },
    ],
    [
      '错误原civ',
      (data: GeorgianData) => {
        row(data, 925).georgianTech!.civ = 44;
      },
    ],
    [
      '错误effect',
      (data: GeorgianData) => {
        row(data, 925).georgianTech!.effectId = 951;
      },
    ],
    [
      '错误requiredCount',
      (data: GeorgianData) => {
        row(data, 925).georgianTech!.requiredCount = 1;
      },
    ],
    [
      '原前置缺annex',
      (data: GeorgianData) => {
        row(data, 925).georgianTech!.requires = [639];
      },
    ],
    [
      '错误研究地点',
      (data: GeorgianData) => {
        row(data, 925).georgianTech!.researchAt = [[109, 1]];
      },
    ],
    [
      '错误付费',
      (data: GeorgianData) => {
        row(data, 925).georgianTech!.cost = [[0, 50, 1]];
      },
    ],
    [
      '伪造村民',
      (data: GeorgianData) => {
        row(data, 925).georgianTech!.commands[1]!.A = 83;
      },
    ],
    [
      '错误anchor',
      (data: GeorgianData) => {
        row(data, 925).georgianTech!.commands[1]!.B = 109;
      },
    ],
    [
      '错误数量',
      (data: GeorgianData) => {
        row(data, 925).georgianTech!.commands[1]!.C = 2;
      },
    ],
    [
      '错误flag',
      (data: GeorgianData) => {
        row(data, 925).georgianTech!.commands[1]!.D = 1;
      },
    ],
    [
      '未知伴随',
      (data: GeorgianData) => {
        row(data, 925).georgianTech!.commands.push(command(999, -1, -1, -1, 1));
      },
    ],
    [
      '错误decoded',
      (data: GeorgianData) => {
        row(data, 925).effects[0]!.v = 2;
      },
    ],
    [
      '多余decoded',
      (data: GeorgianData) => {
        row(data, 925).effects.push({ kind: 'res', res: 0, op: 'add', v: 50 });
      },
    ],
    [
      'unknown-only',
      (data: GeorgianData) => {
        row(data, 925).effects = [];
        row(data, 925).georgianTech!.commands = [command(999, -1, -1, -1, 1)];
      },
    ],
  ] as const)('925%s不发免费车，完整独立基础设施仍建全价付费车', (_label, mutate) => {
    const data = changed(mutate);
    expect(simSupport(data, 'Georgians', buildOrders).supported).toBe(false);
    const timeline = run(data);
    expect(timeline.steps[0]!.entity).toEqual({ kind: 'building', id: '1808' });
    expect(timeline.steps[0]!.cost).toEqual({ food: 20, wood: 80, gold: 0, stone: 0 });
    expect(timeline.buildingsDone.map((done) => done.building)).toEqual([1808]);
    expect(timeline.buildingsDone[0]!.at).toBeGreaterThan(0);
    expect(timeline.bonusVillagerEvents).toBeUndefined();
  });

  it.each([925, 926, 934])('整条移除%s是合法counterfactual，不能破坏其它能力', (tech) => {
    const data = changed((data) => {
      data.civEco.Georgians = data.civEco.Georgians!.filter((entry) => entry.tech !== tech);
    });
    expect(simSupport(data, 'Georgians', buildOrders)).toEqual({ supported: true, reasons: [] });
    const timeline = run(data);
    expect(timeline.steps[0]!.cost).toEqual({ food: 20, wood: 80, gold: 0, stone: 0 });
    expect(timeline.buildingsDone.filter((done) => done.at === 0)).toHaveLength(tech === 925 ? 0 : 1);
  });

  it.each([926, 934])('%s未知伴随或空解码不借无关分类放行，起始车不被误删', (tech) => {
    for (const unknownOnly of [false, true]) {
      const data = changed((data) => {
        if (unknownOnly) {
          row(data, tech).effects = [];
          row(data, tech).georgianTech!.commands = [];
        }
        row(data, tech).georgianTech!.commands.push(command(999, -1, -1, -1, 1));
      });
      expect(simSupport(data, 'Georgians', buildOrders).supported).toBe(false);
      expect(run(data).buildingsDone.filter((done) => done.at === 0)).toEqual([{ building: 1808, at: 0 }]);
    }
  });

  it.each([30, 31, 32, 104, 1806])('未来输入Church%s必须重新明确范围，即使移除934也不能宣称完整支持', (building) => {
    const order = structuredClone(single);
    order.steps[0]!.actions.push({ type: 'build', building });
    for (const omit934 of [false, true]) {
      const data = fixture();
      if (omit934) data.civEco.Georgians = data.civEco.Georgians!.filter((entry) => entry.tech !== 934);
      expect(simSupport(data, 'Georgians', [order]).supported).toBe(false);
    }
  });

  it.each([182, 221])('树禁科技%s必须明确拒绝，不能误当骡车可研究即解禁', (tech) => {
    const order = structuredClone(single);
    order.steps[0]!.actions.push({ type: 'research', tech });
    expect(simSupport(fixture(), 'Georgians', [order]).supported).toBe(false);
  });

  it('279在格鲁吉亚树合法，不复制亚美尼亚279禁用', () => {
    const order = structuredClone(single);
    order.steps[0]!.actions.push({ type: 'research', tech: 279 });
    expect(simSupport(fixture(), 'Georgians', [order])).toEqual({ supported: true, reasons: [] });
  });

  it('格鲁吉亚完整raw复制到其它文明不会启用免费或付费车行为', () => {
    const data = fixture();
    data.civEco.Britons = structuredClone(data.civEco.Georgians!);
    expect(simSupport(data, 'Britons', buildOrders).supported).toBe(false);
    expect(run(data, 'Britons').steps[0]!.entity).toEqual({ kind: 'building', id: '562' });
    expect(run(data, 'Britons').buildingsDone.some((done) => done.at === 0)).toBe(false);
  });

  it('未知规范外行必须拒绝，不能以effects=[]旁路整族检查', () => {
    const data = changed((data) => {
      data.civEco.Georgians!.push({ tech: 2000, age: 1, source: 'bonus', effects: [] });
    });
    expect(simSupport(data, 'Georgians', buildOrders).supported).toBe(false);
  });
});
