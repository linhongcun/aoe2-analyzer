import { beforeAll, describe, expect, it } from 'vitest';
import ecoRaw from '../../src/data/eco.json';
import units from '../../src/data/units.json';
import { buildOrders } from '../../src/data/buildOrders';
import { loadCore, loadTrees } from '../../src/data';
import type { BuildOrder } from '../../src/domain/buildOrder';
import { simSupport, simulateBuild, type EcoData, type UpgradeData } from '../../src/domain/buildSim';
import { discountedCost } from '../../src/domain/costDiscount';
import { castleScenarioProfile } from '../../src/domain/castleScenarioProfile';
import { calculateProduction, DEFAULT_PRODUCTION, type ProductionContext } from '../../src/domain/production';
import { SCENE_ECO, type SceneContext } from '../../src/domain/positionScenarios';
import { FEUDAL_TECHS, routeProfile } from '../../src/domain/routeProfiles';
import { roundHalfPrice } from '../../src/domain/roundHalfPrice';
import { DEFAULT_SCENE } from '../../src/domain/startGameInputs';
import { applyAggregatedResource, finalizeUnitPrice, unitCost, type UnitCostTech } from '../../src/domain/unitCost';

const E = ecoRaw as unknown as EcoData;
const ups = Object.fromEntries((units as { id: number; up?: unknown }[]).filter((u) => u.up).map((u) => [u.id, u.up])) as UpgradeData;
const probe = (effects: UnitCostTech['effects']): UnitCostTech => ({ id: 1, en: 'Probe', zh: '探针', effects });

describe('单位费用叠加（#858）', () => {
  it('set、mul、add 按出现顺序作用在同一资源上', () => {
    const base = { id: 1, cost: { Food: 10 } };
    const up = unitCost(base, 'Franks', 1, [
      probe([
        { a: 103, op: 'mul', v: 2, t: [1] },
        { a: 103, op: 'add', v: 5, t: [1] },
      ]),
    ]);
    const down = unitCost(base, 'Franks', 1, [
      probe([
        { a: 103, op: 'add', v: 5, t: [1] },
        { a: 103, op: 'mul', v: 2, t: [1] },
      ]),
    ]);
    expect(up.exact.Food).toBe(25);
    expect(down.exact.Food).toBe(30);
    const replaced = unitCost(base, 'Franks', 1, [
      probe([
        { a: 103, op: 'set', v: 40, t: [1] },
        { a: 103, op: 'mul', v: 0.5, t: [1] },
        { a: 103, op: 'add', v: 3, t: [1] },
      ]),
    ]);
    expect(replaced.exact.Food).toBe(23);
    expect(replaced.cost.Food).toBe(23);
    expect(replaced.appliedTechs.map((tech) => tech.zh)).toEqual(['探针']);
  });

  it('每一步负值归零，后续加法从 0 起算', () => {
    const priced = unitCost({ id: 1, cost: { Food: 50 } }, 'Franks', 1, [
      probe([
        { a: 103, op: 'add', v: -100, t: [1] },
        { a: 103, op: 'add', v: 30, t: [1] },
      ]),
    ]);
    expect(priced.exact.Food).toBe(30);
    const cleared = unitCost({ id: 1, cost: { Gold: 20 } }, 'Franks', 1, [probe([{ a: 105, op: 'set', v: -4, t: [1] }])]);
    expect(cleared.exact.Gold).toBe(0);
    expect(cleared.cost.Gold).toBe(0);
  });

  it('未解码资源整项不套用，并列入列表', () => {
    const base = { id: 4, cost: { Wood: 25, Gold: 45 } };
    const blocked = unitCost(base, 'Persians', 3, [
      probe([
        { res: 33, op: 'set', v: 51 },
        { a: 105, op: 'mul', v: 0.5, t: [4] },
      ]),
    ]);
    expect(blocked.exact).toEqual({ Wood: 25, Gold: 45 });
    expect(blocked.cost).toEqual(blocked.exact);
    expect(blocked.appliedTechs).toEqual([]);
    expect(blocked.undecoded).toEqual([{ techId: 1, tech: '探针', reason: '含未解码的资源或条件效果', res: 33, op: 'set' }]);
    const badOp = unitCost(base, 'Persians', 3, [probe([{ a: 104, op: 'div', v: 2, t: [4] }])]);
    expect(badOp.cost).toEqual({ Wood: 25, Gold: 45 });
    expect(badOp.undecoded).toEqual([{ techId: 1, tech: '探针', reason: '费用效果操作未解码', attr: 104, op: 'div' }]);
  });

  it('legacy 取整在半数边界与 roundHalfPrice 分开', () => {
    expect(finalizeUnitPrice(42.5, true)).toBe(43);
    expect(finalizeUnitPrice(42.5, false)).toBe(42.5);
    expect(finalizeUnitPrice(26.25, true)).toBe(26);
    expect(finalizeUnitPrice(26.25, false)).toBe(26);
    const food = E.units[74]!.cost.Food!;
    const factor = E.civEco
      .Goths!.flatMap((row) => (row.age === 1 ? row.effects : []))
      .find((effect) => effect.attr === 'cost' && effect.target === 'class:6')!.v!;
    const legacy = applyAggregatedResource(food, { factor }, true);
    const half = applyAggregatedResource(food, { factor }, false);
    expect(legacy).toBe(Math.round(food * factor));
    expect(half).toBe(roundHalfPrice(food * factor));
    expect(legacy).not.toBe(half);
    // 哥特已是开局支持文明，类别折扣走 half-price，不走 legacy 的整数取整。
    expect(simSupport(E, 'Goths', buildOrders, { ignoreSourceGate: true }).supported).toBe(true);
    expect(unitCost({ id: 74, cost: E.units[74]!.cost }, 'Goths', 1, []).cost.Food).toBe(half);
  });
});

describe('unitCost 与现有调用点（#858）', () => {
  let ctx: ProductionContext;
  let scene: SceneContext;
  beforeAll(async () => {
    const core = await loadCore();
    const trees = await loadTrees();
    ctx = { core, trees };
    scene = { core, trees, eco: structuredClone(SCENE_ECO) };
  });

  it('没有科技费用时显示价等于 discountedCost', () => {
    const unit = ctx.core.units.find((item) => item.en === 'Elite Skirmisher')!;
    const priced = unitCost(unit, 'Byzantines', 4, []);
    const discount = discountedCost(unit, 'Byzantines', 4);
    expect(priced.exact).toEqual(discount.exact);
    expect(priced.cost).toEqual(discount.cost);
    expect(priced.appliedTechs).toEqual([]);
    expect(priced.undecoded).toEqual([]);
  });

  it('稳态生产的已选科技费用与 unitCost 相同，资源标记仍整项排除', () => {
    const rows = [{ unit: 4, building: 87, count: '1' }];
    const line = calculateProduction(ctx, { ...DEFAULT_PRODUCTION, civ: 'Persians', rows, techs: [488] }).lines[0]!;
    const tech = ctx.core.techById[488]!;
    const priced = unitCost({ id: 4, cost: E.units[4]!.cost }, 'Persians', DEFAULT_PRODUCTION.age, [{ id: tech.id, en: tech.en, zh: tech.zh }]);
    expect(line.cost).toEqual(priced.cost);
    expect(priced.appliedTechs.map((item) => item.id)).toEqual([488]);
    const bolas = [{ unit: 2569, building: 87, count: '1' }];
    const plain = calculateProduction(ctx, { ...DEFAULT_PRODUCTION, civ: 'Mapuche', age: 4, rows: bolas, techs: [] });
    const marked = calculateProduction(ctx, { ...DEFAULT_PRODUCTION, civ: 'Mapuche', age: 4, rows: bolas, techs: [1380] });
    expect(plain.errors).toEqual([]);
    expect(marked.errors).toEqual([]);
    expect(marked.lines[0]!.cost).toEqual(plain.lines[0]!.cost);
    expect(marked.warnings.some((warning) => warning.includes('布图马普') && warning.includes('未计入'))).toBe(true);
  });

  it('路线与城堡情景的现有科技包不改变折扣价', () => {
    const route = routeProfile(scene, 'Britons', 4, 2, FEUDAL_TECHS.flank);
    expect(route.ok, !route.ok ? route.reason : '').toBe(true);
    if (route.ok) {
      const priced = unitCost(route.value.unit, 'Britons', 2, route.value.techs, { techIds: new Set(route.value.techs.map((tech) => tech.id)) });
      expect(route.value.cost).toEqual(priced.cost);
      expect(priced.cost).toEqual(discountedCost(route.value.unit, 'Britons', 2).cost);
      expect(priced.undecoded).toEqual([]);
      expect(priced.appliedTechs).toEqual([]);
    }
    const castle = castleScenarioProfile(scene, scene.eco!, 'Franks', 'flank', { ...DEFAULT_SCENE, techPlan: 'common', husbandry: false });
    expect(castle.ok, !castle.ok ? castle.reason : '').toBe(true);
    if (castle.ok) {
      const priced = unitCost(castle.value.unit, 'Franks', DEFAULT_SCENE.age, castle.value.techs);
      expect(castle.value.cost).toEqual(priced.cost);
      expect(priced.cost).toEqual(discountedCost(castle.value.unit, 'Franks', DEFAULT_SCENE.age).cost);
      expect(priced.appliedTechs).toEqual([]);
    }
  });

  it('支持文明的开局实付与 unitCost 使用同一套乘加和取整', () => {
    expect(simSupport(E, 'Portuguese', buildOrders, { ignoreSourceGate: true }).supported).toBe(true);
    const bo = {
      id: 'unit-cost-cross',
      name: { zh: '费用交叉', en: 'cost cross' },
      style: 'militia',
      civs: ['Portuguese'],
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
        { vils: 3, actions: [{ type: 'train' as const, unit: 74 }] },
      ],
    } satisfies BuildOrder;
    const timeline = simulateBuild(bo, 'Portuguese', E, ups, { autoHouses: false, walkTiles: 2, nearTiles: 2 });
    const paid = timeline.steps[1]?.cost;
    const priced = unitCost({ id: 74, cost: E.units[74]!.cost }, 'Portuguese', 1, []);
    expect(paid, JSON.stringify(timeline.steps.map((step) => ({ cost: step.cost, anomalies: step.anomalies })))).toBeDefined();
    expect(paid!.food).toBe(priced.cost.Food);
    expect(paid!.gold).toBe(priced.cost.Gold);
    expect(priced.cost.Gold).not.toBe(E.units[74]!.cost.Gold);

    const food = E.villager.cost.Food!;
    const factor = E.civEco
      .Hindustanis!.find((row) => row.age === 1 && row.effects.some((effect) => effect.target === 'villager' && effect.attr === 'cost'))!
      .effects.find((effect) => effect.target === 'villager' && effect.attr === 'cost')!.v!;
    const legacy = !simSupport(E, 'Hindustanis', buildOrders, { ignoreSourceGate: true }).supported;
    expect(unitCost({ id: 83, cost: { Food: food } }, 'Hindustanis', 1, []).cost.Food).toBe(applyAggregatedResource(food, { factor }, legacy));
  });
});
