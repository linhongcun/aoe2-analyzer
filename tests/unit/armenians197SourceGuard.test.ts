import { describe, expect, it } from 'vitest';
import eco from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import type { BuildOrder } from '../../src/domain/buildOrder';
import { ageReqOk, simSupport, simulateBuild, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
import { armenianBuildOrder, armenianContext, armenianResearchBonus, armenianResearchSites } from '../../src/domain/armenianEconomy';

const E = eco as unknown as EcoData;
const ups = Object.fromEntries(units.filter((unit) => unit.up).map((unit) => [unit.id, unit.up])) as UpgradeData;
const row = (data: EcoData, tech: number) => data.civEco.Armenians!.find((entry) => entry.tech === tech)!;
const changed = (mutate: (data: EcoData) => void) => {
  const data = structuredClone(E);
  mutate(data);
  return data;
};
const single = (builders: number): BuildOrder => ({
  ...buildOrders[0]!,
  id: 'armenian-cart-builders',
  target: { age: 2, vils: 3 },
  steps: [
    {
      vils: 3,
      actions: [
        { type: 'gather', task: 'build', count: builders },
        ...(builders < 3 ? [{ type: 'gather' as const, task: 'wood' as const, count: 3 - builders }] : []),
        { type: 'build', building: 562 },
      ],
    },
    { vils: 3, actions: [] },
  ],
});

describe('#197 亚美尼亚完整来源与能力边界', () => {
  it.each([
    [
      '缺基础设施',
      (data: EcoData) => {
        delete data.armenianInfrastructure;
      },
    ],
    [
      '错误文明',
      (data: EcoData) => {
        data.armenianInfrastructure!.civId = 45;
      },
    ],
    [
      '错树',
      (data: EcoData) => {
        data.armenianInfrastructure!.treeId++;
      },
    ],
    [
      '树缺命令',
      (data: EcoData) => {
        data.armenianInfrastructure!.treeCommands.pop();
      },
    ],
    [
      '树未知伴随',
      (data: EcoData) => {
        data.armenianInfrastructure!.treeCommands.push({ Type: 999, A: -1, B: -1, C: -1, D: 1 });
      },
    ],
    [
      '启用少一命令',
      (data: EcoData) => {
        data.armenianInfrastructure!.enable.commands.pop();
      },
    ],
    [
      '启用命令改顺序',
      (data: EcoData) => {
        data.armenianInfrastructure!.enable.commands.reverse();
      },
    ],
    [
      '启用未知伴随',
      (data: EcoData) => {
        data.armenianInfrastructure!.enable.commands.push({ Type: 999, A: -1, B: -1, C: -1, D: 1 });
      },
    ],
    [
      '错误建筑counter',
      (data: EcoData) => {
        data.armenianInfrastructure!.buildingTech.tech = 107;
      },
    ],
    [
      'counter前置',
      (data: EcoData) => {
        data.armenianInfrastructure!.buildingTech.requires = [101];
      },
    ],
    [
      '错误Type',
      (data: EcoData) => {
        data.armenianInfrastructure!.cart.type = 70;
      },
    ],
    [
      '错误对象',
      (data: EcoData) => {
        data.armenianInfrastructure!.cart.unit = 83;
      },
    ],
    [
      '错误类别',
      (data: EcoData) => {
        data.armenianInfrastructure!.cart.class = 4;
      },
    ],
    [
      '错误完成counter',
      (data: EcoData) => {
        data.armenianInfrastructure!.cart.buildTech = 107;
      },
    ],
    [
      '错误建造者',
      (data: EcoData) => {
        data.armenianInfrastructure!.cart.trainAt = [[109, 25]];
      },
    ],
    [
      '错误工期',
      (data: EcoData) => {
        data.armenianInfrastructure!.cart.trainTime = 35;
      },
    ],
    [
      '错误原费用',
      (data: EcoData) => {
        data.armenianInfrastructure!.cart.cost[0]![1] = 100;
      },
    ],
    [
      '马轭错地点',
      (data: EcoData) => {
        data.armenianInfrastructure!.researchSites[14]!.push([1808, 20]);
      },
    ],
    [
      '双刃斧无骡车',
      (data: EcoData) => {
        data.armenianInfrastructure!.researchSites[202] = [[562, 25]];
      },
    ],
    [
      '全局工期不符',
      (data: EcoData) => {
        data.buildings[1808]!.buildTime = 35;
      },
    ],
  ] as const)('%s拒绝基础设施，原动作不被悄悄替换', (_label, mutate) => {
    const data = changed(mutate);
    const order = single(1);
    expect(simSupport(data, 'Armenians', buildOrders).supported).toBe(false);
    expect(armenianBuildOrder(order, 'Armenians', data)).toBe(order);
  });

  it.each([
    [
      '折扣缺来源',
      (data: EcoData) => {
        delete row(data, 958).armenianTech;
      },
    ],
    [
      '折扣未知命令',
      (data: EcoData) => {
        row(data, 958).armenianTech!.commands.push({ Type: 999, A: -1, B: -1, C: -1, D: 1 });
      },
    ],
    [
      '折扣改值',
      (data: EcoData) => {
        row(data, 958).effects[0]!.v = 0.5;
      },
    ],
    [
      '折扣重复行',
      (data: EcoData) => {
        data.civEco.Armenians!.push(structuredClone(row(data, 958)));
      },
    ],
  ] as const)('%s不应用部分折扣，独立基础设施仍按全价骡车运行', (_label, mutate) => {
    const data = changed(mutate);
    expect(simSupport(data, 'Armenians', buildOrders).supported).toBe(false);
    const timeline = simulateBuild(single(1), 'Armenians', data, ups, { autoHouses: false });
    expect(timeline.steps[0]!.entity).toEqual({ kind: 'building', id: '1808' });
    expect(timeline.steps[0]!.cost).toEqual({ food: 20, wood: 80, gold: 0, stone: 0 });
  });

  it.each([
    [
      '研究增强缺行',
      (data: EcoData) => {
        data.civEco.Armenians = data.civEco.Armenians!.filter((entry) => entry.tech !== 960);
      },
    ],
    [
      '研究增强重复',
      (data: EcoData) => {
        data.civEco.Armenians!.push(structuredClone(row(data, 960)));
      },
    ],
    [
      '研究增强错误前置',
      (data: EcoData) => {
        row(data, 960).requires = [55];
      },
    ],
    [
      '研究增强错误时代',
      (data: EcoData) => {
        row(data, 960).age = 1;
      },
    ],
    [
      '研究增强未知伴随',
      (data: EcoData) => {
        row(data, 960).armenianTech!.commands.push({ Type: 999, A: -1, B: -1, C: -1, D: 1 });
      },
    ],
    [
      '研究增强缺男女一半',
      (data: EcoData) => {
        row(data, 960).armenianTech!.commands.pop();
      },
    ],
    [
      '研究增强错误来源',
      (data: EcoData) => {
        row(data, 960).source = 'team';
      },
    ],
    [
      '研究增强多余解码',
      (data: EcoData) => {
        row(data, 960).effects.push({ kind: 'res', res: 4, op: 'add', v: 5 });
      },
    ],
  ] as const)('%s拒绝整组七条，正常研究不会获得残留增强', (_label, mutate) => {
    const data = changed(mutate);
    expect(simSupport(data, 'Armenians', buildOrders).supported).toBe(false);
    const context = armenianContext(data);
    expect(context.research).toBeNull();
    for (const tech of [202, 203, 55, 182, 278]) expect(armenianResearchBonus(context, tech, 4, new Set())).toEqual([]);
  });

  it.each([
    [
      '圣物缺一条',
      (data: EcoData) => {
        data.civEco.Armenians = data.civEco.Armenians!.filter((entry) => entry.tech !== 949);
      },
    ],
    [
      '圣物重复一条',
      (data: EcoData) => {
        data.civEco.Armenians!.push(structuredClone(row(data, 957)));
      },
    ],
    [
      '圣物伪造村民',
      (data: EcoData) => {
        row(data, 949).armenianTech!.commands[1]!.A = 83;
      },
    ],
    [
      '圣物未知伴随',
      (data: EcoData) => {
        row(data, 957).armenianTech!.commands.push({ Type: 999, A: -1, B: -1, C: -1, D: 1 });
      },
    ],
  ] as const)('%s不被通用234放行', (_label, mutate) => {
    expect(simSupport(changed(mutate), 'Armenians', buildOrders).supported).toBe(false);
  });

  it('有效前置科技、时代和完成事件去重；不可用221/279不授予增强', () => {
    const context = armenianContext(E);
    expect(armenianResearchBonus(context, 202, 1, new Set())).toEqual([]);
    expect(armenianResearchBonus(context, 22, 2, new Set())).toEqual([]);
    expect(armenianResearchBonus(context, 202, 2, new Set()).map((entry) => entry.tech)).toEqual([960]);
    expect(armenianResearchBonus(context, 202, 2, new Set([960]))).toEqual([]);
    expect(armenianResearchBonus(context, 203, 3, new Set([960])).map((entry) => entry.tech)).toEqual([961]);
    for (const tech of [221, 279]) expect(armenianResearchBonus(context, tech, 4, new Set())).toEqual([]);
    expect(armenianResearchSites(context, 14)).toEqual([68]);
    expect(armenianResearchSites(context, 202)).toEqual([1808]);
    expect(armenianResearchSites(context, 55)).toEqual([1808]);
    expect(armenianResearchSites(context, 221)).toEqual([]);
  });

  it.each([104, 1806, 1118])('加入教堂/圣物建筑%s必须重新明确经济范围', (building) => {
    const order = single(1);
    order.steps[0]!.actions.push({ type: 'build', building });
    expect(simSupport(E, 'Armenians', [order]).supported).toBe(false);
  });

  it('完整亚美尼亚元数据复制到别的文明不会启用其行为', () => {
    const data = structuredClone(E);
    data.civEco.Georgians = structuredClone(data.civEco.Armenians!);
    expect(simSupport(data, 'Georgians', buildOrders).supported).toBe(false);
    const order = single(1);
    expect(armenianBuildOrder(order, 'Georgians', data)).toBe(order);
  });

  it.each([{ ids: [958] }, { ids: [960, 961, 962, 963, 964, 965, 966] }, { ids: [949, 957] }])('未知命令替换整组$ids后，空解码不能冒充合法移除', ({ ids }) => {
    const data = changed((data) => {
      for (const tech of ids) {
        row(data, tech).effects = [];
        row(data, tech).armenianTech!.commands = [{ Type: 999, A: -1, B: -1, C: -1, D: 1 }];
      }
    });
    expect(simSupport(data, 'Armenians', buildOrders).supported).toBe(false);
    expect(armenianContext(data).reasons.length).toBeGreaterThan(0);
  });

  it('未知亚美尼亚科技行不能借完整已知组放行', () => {
    const data = changed((data) => data.civEco.Armenians!.push({ tech: 2000, age: 1, source: 'bonus', effects: [] }));
    expect(simSupport(data, 'Armenians', buildOrders).supported).toBe(false);
  });
});

describe('#197 亚美尼亚物理投影与继承的施工模型', () => {
  it('八套13次付费替换且原计划不变；费用附注揭示多动作步骤的骡车收费', () => {
    const before = JSON.stringify(buildOrders);
    let carts = 0;
    for (const order of buildOrders) {
      const projected = armenianBuildOrder(order, 'Armenians', E);
      expect(projected.id).toBe(order.id);
      expect(projected.sources).toBe(order.sources);
      expect(projected.steps).toHaveLength(order.steps.length);
      order.steps.forEach((step, index) => {
        expect(projected.steps[index]!.vils).toBe(step.vils);
        expect(projected.steps[index]!.actions).toHaveLength(step.actions.length);
        step.actions.forEach((action, position) => {
          if (action.type === 'build' && [562, 584].includes(action.building)) {
            carts += action.count ?? 1;
            expect(projected.steps[index]!.actions[position]).toEqual({ ...action, building: 1808 });
            expect(projected.steps[index]!.note).toContain('60木、15食物');
          } else expect(projected.steps[index]!.actions[position]).toEqual(action);
        });
      });
      expect(armenianBuildOrder(projected, 'Armenians', E)).toBe(projected);
      for (const civ of Object.keys(E.civEco).filter((civ) => civ !== 'Armenians')) expect(armenianBuildOrder(order, civ, E)).toBe(order);
    }
    expect(carts).toBe(13);
    expect(JSON.stringify(buildOrders)).toBe(before);
  });

  it.each([1, 2, 3])('%s名建造者按原衰减公式使用25秒骡车基础工期', (builders) => {
    const timeline = simulateBuild(single(builders), 'Armenians', E, ups, { autoHouses: false });
    expect(timeline.anomalies.filter((anomaly) => anomaly.type === 'timeout')).toEqual([]);
    const time = timeline.buildingsDone[0]!.at - timeline.steps[0]!.startAt;
    const expected = (E.buildings[1808]!.buildTime * 3) / (builders + 2);
    expect(time).toBeGreaterThanOrEqual(expected - 0.1 - 1e-8);
    expect(time).toBeLessThanOrEqual(expected + 0.1);
  });

  it('借用一名伐木者建骡车，完成后归还采集', () => {
    const order = single(1);
    order.steps = [
      {
        vils: 3,
        actions: [
          { type: 'gather', task: 'wood', count: 3 },
          { type: 'build', building: 584 },
        ],
      },
      { vils: 4, actions: [{ type: 'gather', task: 'wood', count: 1 }] },
    ];
    const timeline = simulateBuild(order, 'Armenians', E, ups, { autoHouses: false });
    expect(timeline.buildingsDone[0]!.building).toBe(1808);
    expect(timeline.steps[1]!.villagers.wood).toBe(4);
    expect(timeline.bonusVillagerEvents).toBeUndefined();
  });

  it('骡车的食物费用需要真正攒足，等待时间不被伪装成25秒施工', () => {
    const data = changed((data) => {
      data.villager.cost.Food = 190;
    });
    const order = single(1);
    order.steps = [
      { vils: 3, actions: [{ type: 'gather', task: 'wood', count: 3 }] },
      {
        vils: 4,
        actions: [
          { type: 'gather', task: 'sheep', count: 1 },
          { type: 'build', building: 562 },
        ],
      },
      { vils: 4, actions: [] },
    ];
    const timeline = simulateBuild(order, 'Armenians', data, ups, { autoHouses: false });
    expect(timeline.anomalies.filter((anomaly) => anomaly.type === 'timeout')).toEqual([]);
    expect(timeline.steps[1]!.stock.food).toBe(10);
    expect(timeline.steps[1]!.cost!.food).toBe(15);
    expect(timeline.buildingsDone.map((done) => done.building)).toEqual([1808]);
    expect(timeline.buildingsDone[0]!.at - timeline.steps[1]!.startAt).toBeGreaterThan(data.buildings[1808]!.buildTime + 5);
    expect(timeline.anomalies.some((anomaly) => anomaly.type === 'resource_short' && anomaly.resource === 'food' && (anomaly.shortfall ?? 0) >= 5)).toBe(true);
  });

  it('逐次付费骡车需要真实木材，不能因模板替换免去不足的40木', () => {
    const order = single(1);
    order.steps[0]!.actions.find((action) => action.type === 'build')!.count = 4;
    const timeline = simulateBuild(order, 'Armenians', E, ups, { autoHouses: false });
    expect(timeline.anomalies.filter((anomaly) => anomaly.type === 'timeout')).toEqual([]);
    expect(timeline.steps[0]!.stock.wood).toBe(200);
    expect(timeline.steps[0]!.cost).toEqual({ food: 60, wood: 240, gold: 0, stone: 0 });
    expect(timeline.buildingsDone.map((done) => done.building)).toEqual([1808, 1808, 1808, 1808]);
    expect(timeline.anomalies.some((anomaly) => anomaly.type === 'resource_short' && anomaly.resource === 'wood' && (anomaly.shortfall ?? 0) >= 40)).toBe(true);
  });

  it('两辆骡车是一种时代前置，加磨坊才满足两种', () => {
    const built = new Map([
      [109, 1],
      [1808, 2],
    ]);
    expect(ageReqOk(E.ageReq!['2']!.req, built, 'Armenians')).toBe(false);
    built.set(68, 1);
    expect(ageReqOk(E.ageReq!['2']!.req, built, 'Armenians')).toBe(true);
  });
});
